// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC4906.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title CAPs Mind (CAPMIND)
/// @notice Key NFT for CAPs Mind. Token #1 is a free owner-only genesis mint.
///         After that, any wallet holding at least 2,000,000 GEAR can mint one key.
///         One mint per wallet, ever. Free mint, gas only.
/// @dev Based on Bankr's CAPsMind.sol. Changes vs Bankr's version:
///      1. Only the contract owner can set or change any URI or image.
///         Public mint() no longer takes a customURI.
///      2. Every key shows Cap's default metadata (CAP vault art) unless the owner
///         overrides it. tokenURI order: per-token URI (owner set) > baseURI + id > defaultTokenURI.
///      3. Uses ERC721 + its own per-token URI map (with ERC-4906 refresh events) instead of
///         OpenZeppelin's ERC721URIStorage, because ERC721URIStorage glues the base URI in front
///         of a per-token URI. Here an owner-set per-token URI is always returned exactly as set.
///      GEAR is a mainnet (Base) constant, so this exact contract only works on Base mainnet.
contract CAPsMind is ERC721, IERC4906, Ownable {
    uint256 private _nextTokenId = 1;

    /// @notice GEAR token on Base mainnet (6 decimals).
    IERC20 public constant GEAR_TOKEN = IERC20(0x5880cD05605A549f1DAb01a53ca61Ee559244bD1);
    /// @notice 2,000,000 GEAR (6 decimals). Checked as a balance held at mint time.
    uint256 public constant GEAR_REQUIRED = 2_000_000 * 10**6;

    bool public firstMintCompleted;

    mapping(address => bool) public hasMinted;

    string private _baseTokenURI;

    /// @notice Metadata URI every key falls back to (Cap's CAP vault art JSON).
    string public defaultTokenURI;

    /// @dev Owner-set per-token URIs. Empty means "not set".
    mapping(uint256 => string) private _tokenURIs;

    event GenesisMinted(address indexed owner, uint256 indexed tokenId, string uri);
    event KeyMinted(address indexed recipient, uint256 indexed tokenId);
    event BaseURIUpdated(string newBaseURI);
    event DefaultTokenURIUpdated(string newDefaultURI);
    event TokenURIUpdated(uint256 indexed tokenId, string newURI);

    error GenesisAlreadyMinted();
    error GenesisNotMinted();
    error AlreadyMinted();
    error InsufficientGearBalance(uint256 balance, uint256 required);

    /// @param initialOwner     Contract owner (Cap's wallet). Only this wallet can genesis mint and set URIs.
    /// @param initialBaseURI   Optional base URI. Leave "" so every key uses defaultTokenURI.
    /// @param initialDefaultURI Default metadata JSON URI shown for every key.
    constructor(
        address initialOwner,
        string memory initialBaseURI,
        string memory initialDefaultURI
    ) ERC721("CAPs Mind", "CAPMIND") Ownable(initialOwner) {
        _baseTokenURI = initialBaseURI;
        defaultTokenURI = initialDefaultURI;
    }

    // ---------------------------------------------------------------------
    // Minting
    // ---------------------------------------------------------------------

    /// @notice Owner-only free mint of token #1. No GEAR needed.
    /// @param customURI Optional per-token URI for #1. Pass "" to use the default art.
    function ownerGenesisMint(string calldata customURI) external onlyOwner returns (uint256) {
        if (firstMintCompleted) revert GenesisAlreadyMinted();
        if (hasMinted[msg.sender]) revert AlreadyMinted();

        firstMintCompleted = true;
        hasMinted[msg.sender] = true;

        uint256 tokenId = _nextTokenId++;

        if (bytes(customURI).length > 0) {
            _setTokenURI(tokenId, customURI);
        }

        emit GenesisMinted(msg.sender, tokenId, customURI);
        // All state is written before _safeMint calls out to a contract receiver.
        _safeMint(msg.sender, tokenId);
        return tokenId;
    }

    /// @notice Mint one key. Requires genesis done, at least 2,000,000 GEAR held, and no prior mint.
    ///         Minters cannot set art; the key shows the owner-controlled metadata.
    function mint() external returns (uint256) {
        if (!firstMintCompleted) revert GenesisNotMinted();
        if (hasMinted[msg.sender]) revert AlreadyMinted();

        uint256 balance = GEAR_TOKEN.balanceOf(msg.sender);
        if (balance < GEAR_REQUIRED) {
            revert InsufficientGearBalance(balance, GEAR_REQUIRED);
        }

        hasMinted[msg.sender] = true;
        uint256 tokenId = _nextTokenId++;

        emit KeyMinted(msg.sender, tokenId);
        // All state is written before _safeMint calls out to a contract receiver.
        _safeMint(msg.sender, tokenId);
        return tokenId;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

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

    function baseURI() external view returns (string memory) {
        return _baseTokenURI;
    }

    /// @notice Metadata URI for a key.
    ///         1. Per-token URI, if the owner set one (returned exactly as set).
    ///         2. Else baseURI + tokenId, if baseURI is not empty.
    ///         3. Else defaultTokenURI (Cap's CAP vault art).
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        string memory custom = _tokenURIs[tokenId];
        if (bytes(custom).length > 0) {
            return custom;
        }

        string memory base = _baseTokenURI;
        if (bytes(base).length > 0) {
            return string.concat(base, Strings.toString(tokenId));
        }

        return defaultTokenURI;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, IERC165) returns (bool) {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }

    // ---------------------------------------------------------------------
    // Owner-only metadata controls
    // ---------------------------------------------------------------------

    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
        _refreshAll();
    }

    function setDefaultTokenURI(string calldata newDefaultURI) external onlyOwner {
        defaultTokenURI = newDefaultURI;
        emit DefaultTokenURIUpdated(newDefaultURI);
        _refreshAll();
    }

    /// @notice Set or change one key's URI. Pass "" to clear it so the key falls back to base/default.
    function setTokenURI(uint256 tokenId, string calldata newURI) external onlyOwner {
        _setTokenURI(tokenId, newURI);
        emit TokenURIUpdated(tokenId, newURI);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _setTokenURI(uint256 tokenId, string memory newURI) internal {
        _tokenURIs[tokenId] = newURI;
        emit MetadataUpdate(tokenId);
    }

    /// @dev ERC-4906 signal so marketplaces like OpenSea refresh every minted key.
    function _refreshAll() internal {
        uint256 minted = _nextTokenId - 1;
        if (minted > 0) {
            emit BatchMetadataUpdate(1, minted);
        }
    }
}
