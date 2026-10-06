// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Test replica of the CAPs Mind key that Bankr deployed on Base at
// 0x00635ca44339c7c194ef5bc87bf2cd6df04a666d (owner 0x1a72f7314297B0b8f6808A9248969A8108F49890).
// Source is Bankr's CAPsMind.sol as shared by Cap; only the contract name is changed so it does not
// collide with src/CAPsMind.sol. GEAR is hardcoded, so tests vm.etch a mock GEAR at that address.

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract BankrCAPsMind is ERC721URIStorage, Ownable {
    uint256 private _nextTokenId = 1;

    IERC20 public constant GEAR_TOKEN = IERC20(0x5880cD05605A549f1DAb01a53ca61Ee559244bD1);
    uint256 public constant GEAR_REQUIRED = 2_000_000 * 10**6;

    bool public firstMintCompleted;

    mapping(address => bool) public hasMinted;

    string private _baseTokenURI;

    event GenesisMinted(address indexed owner, uint256 indexed tokenId, string uri);
    event KeyMinted(address indexed recipient, uint256 indexed tokenId, string uri);
    event BaseURIUpdated(string newBaseURI);
    event TokenURIUpdated(uint256 indexed tokenId, string newURI);

    error GenesisAlreadyMinted();
    error GenesisNotMinted();
    error AlreadyMinted();
    error InsufficientGearBalance(uint256 balance, uint256 required);

    constructor(
        address initialOwner,
        string memory initialBaseURI
    ) ERC721("CAPs Mind", "CAPMIND") Ownable(initialOwner) {
        _baseTokenURI = initialBaseURI;
    }

    function ownerGenesisMint(string calldata customURI) external onlyOwner returns (uint256) {
        if (firstMintCompleted) revert GenesisAlreadyMinted();
        if (hasMinted[msg.sender]) revert AlreadyMinted();

        firstMintCompleted = true;
        hasMinted[msg.sender] = true;

        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);

        if (bytes(customURI).length > 0) {
            _setTokenURI(tokenId, customURI);
        }

        emit GenesisMinted(msg.sender, tokenId, customURI);
        return tokenId;
    }

    function mint(string calldata customURI) external returns (uint256) {
        if (!firstMintCompleted) revert GenesisNotMinted();
        if (hasMinted[msg.sender]) revert AlreadyMinted();

        uint256 balance = GEAR_TOKEN.balanceOf(msg.sender);
        if (balance < GEAR_REQUIRED) {
            revert InsufficientGearBalance(balance, GEAR_REQUIRED);
        }

        hasMinted[msg.sender] = true;
        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);

        if (bytes(customURI).length > 0) {
            _setTokenURI(tokenId, customURI);
        }

        emit KeyMinted(msg.sender, tokenId, customURI);
        return tokenId;
    }

    function canMint(address account) external view returns (bool eligible, uint256 gearBalance, string memory reason) {
        if (hasMinted[account]) {
            return (false, GEAR_TOKEN.balanceOf(account), "Wallet has already minted");
        }

        if (!firstMintCompleted) {
            if (account == owner()) {
                return (true, GEAR_TOKEN.balanceOf(account), "Eligible for genesis mint #1");
            } else {
                return (false, GEAR_TOKEN.balanceOf(account), "Genesis mint #1 not yet completed by owner");
            }
        }

        uint256 bal = GEAR_TOKEN.balanceOf(account);
        if (bal < GEAR_REQUIRED) {
            return (false, bal, "Insufficient GEAR tokens (needs 2,000,000)");
        }

        return (true, bal, "Eligible to mint");
    }

    function nextTokenId() external view returns (uint256) {
        return _nextTokenId;
    }

    function totalMinted() external view returns (uint256) {
        return _nextTokenId - 1;
    }

    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    function setTokenURI(uint256 tokenId, string calldata newURI) external onlyOwner {
        _setTokenURI(tokenId, newURI);
        emit TokenURIUpdated(tokenId, newURI);
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }
}
