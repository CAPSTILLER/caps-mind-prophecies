// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base64} from "./Base64.sol";

/// @title CapsMindKey
/// @notice ERC-721 CAPs Mind publisher keys with sequential token IDs (1, 2, 3…).
///         Bootstrap: when totalSupply == 0, owner may mint key #1 with no GEAR hold.
///         After that, anyone who HOLDS at least 2_000_000 GEAR (balance check only;
///         no burn/transfer) may mint a new key. Cap keeps control of GEAR supply so
///         lost/sold keys do not strand the app — a new key can be minted by a 2M holder.
///
///         Metadata: tokenURI returns on-chain JSON (data URI) with name, description,
///         and `image` (main wallet/OpenSea view). Optional `animation_url` only when set.
///         Owner sets media via setMediaURIs. Optional baseURI override for off-chain JSON.
///
///         GEAR Base mainnet: 0x5880cD05605A549f1DAb01a53ca61Ee559244bD1 (6 decimals).
///         Pass a mock/test GEAR address for Sepolia.

interface IERC20Balance {
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

contract CapsMindKey {
    error NotOwner();
    error NotPendingOwner();
    error ZeroAddress();
    error NotTokenOwner();
    error NotApproved();
    error BadToken();
    error TransferToZero();
    error EthRejected();
    error PausedError();
    error InsufficientGearHold();
    error BootstrapOnlyOwner();
    error BootstrapAlreadyDone();

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed spender, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event KeyMinted(address indexed to, uint256 indexed tokenId, address indexed minter);
    event BaseURISet(string baseURI);
    event MediaURIsSet(string imageURI, string animationURI);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    string public constant NAME = "CAPs Mind Key";
    string public constant SYMBOL = "CAPSKEY";
    /// @dev Whole GEAR that must be held (not spent) to mint a key after bootstrap.
    uint256 public constant KEY_HOLD_GEAR = 2_000_000;

    /// @dev Cap's owner / bootstrap mint destination (documented default for deploy).
    address public constant CAP_OWNER = 0x6C05149910C2dd102032E44b96DA36988950B257;

    IERC20Balance public immutable gear;
    uint256 public immutable gearUnit; // 10^decimals
    uint256 public immutable keyHoldAmount; // KEY_HOLD_GEAR * gearUnit

    address public owner;
    address public pendingOwner;
    uint256 public totalSupply;
    /// @dev Optional off-chain metadata base. When non-empty, tokenURI = baseURI + tokenId
    ///      (expects hosted JSON with `image`; optional `animation_url`). When empty, on-chain JSON is used.
    string public baseURI;
    /// @dev Main image URI (OpenSea `image`) — primary wallet/OpenSea view. Shared by all keys.
    string public imageURI;
    /// @dev Optional video URI (OpenSea `animation_url`). Omitted from on-chain JSON when empty.
    string public animationURI;
    bool public paused;

    mapping(uint256 => address) private _ownerOf;
    mapping(address => uint256) private _balanceOf;
    mapping(uint256 => address) private _tokenApproval;
    mapping(address => mapping(address => bool)) private _operatorApproval;

    constructor(address initialOwner, address gearToken, string memory baseURI_) {
        if (initialOwner == address(0) || gearToken == address(0)) revert ZeroAddress();
        owner = initialOwner;
        gear = IERC20Balance(gearToken);
        uint8 d = IERC20Balance(gearToken).decimals();
        gearUnit = 10 ** uint256(d);
        keyHoldAmount = KEY_HOLD_GEAR * gearUnit;
        baseURI = baseURI_;
        emit OwnershipTransferred(address(0), initialOwner);
        emit BaseURISet(baseURI_);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert PausedError();
        _;
    }

    /// @notice Mint a Caps Mind key.
    ///         - If totalSupply == 0: only owner may mint (bootstrap key #1, no GEAR hold).
    ///         - Otherwise: msg.sender must HOLD >= 2_000_000 GEAR (balanceOf check only).
    function mint(address to) external whenNotPaused returns (uint256 tokenId) {
        if (to == address(0)) revert ZeroAddress();
        if (totalSupply == 0) {
            if (msg.sender != owner) revert BootstrapOnlyOwner();
        } else {
            if (gear.balanceOf(msg.sender) < keyHoldAmount) revert InsufficientGearHold();
        }
        tokenId = totalSupply + 1;
        totalSupply = tokenId;
        _mint(to, tokenId);
        emit KeyMinted(to, tokenId, msg.sender);
    }

    /// @notice True if `account` currently holds enough GEAR to mint a new key (post-bootstrap).
    function canMintKey(address account) public view returns (bool) {
        if (account == address(0) || paused) return false;
        if (totalSupply == 0) return account == owner;
        return gear.balanceOf(account) >= keyHoldAmount;
    }

    function setBaseURI(string calldata uri) external onlyOwner {
        baseURI = uri;
        emit BaseURISet(uri);
    }

    /// @notice Set collection media used in on-chain tokenURI JSON.
    /// @param image_ Main image URL (ipfs://… or https://…). Shown as the NFT's main view.
    /// @param animation_ Optional video URL. Leave empty to omit `animation_url` from JSON.
    function setMediaURIs(string calldata image_, string calldata animation_) external onlyOwner {
        imageURI = image_;
        animationURI = animation_;
        emit MediaURIsSet(image_, animation_);
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address prev = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(prev, msg.sender);
    }

    function name() external pure returns (string memory) {
        return NAME;
    }

    function symbol() external pure returns (string memory) {
        return SYMBOL;
    }

    function balanceOf(address account) external view returns (uint256) {
        if (account == address(0)) revert ZeroAddress();
        return _balanceOf[account];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address o = _ownerOf[tokenId];
        if (o == address(0)) revert BadToken();
        return o;
    }

    /// @notice ERC-721 metadata. If `baseURI` is set, returns `baseURI + tokenId` (off-chain JSON).
    ///         Otherwise returns on-chain `data:application/json;base64,…` with `image` (and
    ///         `animation_url` only when `animationURI` is non-empty).
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (_ownerOf[tokenId] == address(0)) revert BadToken();
        if (bytes(baseURI).length > 0) {
            return string(abi.encodePacked(baseURI, _toString(tokenId)));
        }
        return _onchainTokenURI(tokenId);
    }

    function approve(address spender, uint256 tokenId) external {
        address o = ownerOf(tokenId);
        if (msg.sender != o && !_operatorApproval[o][msg.sender]) revert NotApproved();
        _tokenApproval[tokenId] = spender;
        emit Approval(o, spender, tokenId);
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        if (_ownerOf[tokenId] == address(0)) revert BadToken();
        return _tokenApproval[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external {
        _operatorApproval[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address account, address operator) external view returns (bool) {
        return _operatorApproval[account][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        if (to == address(0)) revert TransferToZero();
        address o = ownerOf(tokenId);
        if (o != from) revert NotTokenOwner();
        if (
            msg.sender != from && !_operatorApproval[from][msg.sender]
                && _tokenApproval[tokenId] != msg.sender
        ) revert NotApproved();
        _tokenApproval[tokenId] = address(0);
        _balanceOf[from] -= 1;
        _balanceOf[to] += 1;
        _ownerOf[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        transferFrom(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata) external {
        transferFrom(from, to, tokenId);
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 || interfaceId == 0x80ac58cd || interfaceId == 0x5b5e139f;
    }

    function _mint(address to, uint256 tokenId) internal {
        _ownerOf[tokenId] = to;
        _balanceOf[to] += 1;
        emit Transfer(address(0), to, tokenId);
    }

    function _onchainTokenURI(uint256 tokenId) internal view returns (string memory) {
        string memory idStr = _toString(tokenId);
        // Omit animation_url when empty so wallets/OpenSea show `image` as the main view.
        string memory animPart = bytes(animationURI).length == 0
            ? ""
            : string(abi.encodePacked(',"animation_url":"', animationURI, '"'));
        string memory json = string(
            abi.encodePacked(
                '{"name":"CAPs Mind Key #',
                idStr,
                '","description":"Publisher key for CAPs Mind Prophecies. An eligible key holder can upload new prophecies. Hold 2,000,000 GEAR to mint additional keys after bootstrap.",',
                '"image":"',
                imageURI,
                '"',
                animPart,
                "}"
            )
        );
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    receive() external payable {
        revert EthRejected();
    }
}
