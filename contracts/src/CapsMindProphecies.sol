// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CapsMindProphecies
/// @notice Vault 42 prophecy tablets. A CapsMindKey holder whose key ID is eligible
///         publishes image URI + description. Anyone mints editions by paying GEAR on a
///         per-prophecy bonding curve: mint n costs min(1000, 2^(n-1)) whole GEAR, then
///         stays at 1000 forever. Payment splits 90% treasury / 10% GearVault.
///
///         Publish eligibility
///           - By default every Caps Mind token ID is eligible unless locked.
///           - Any CapsMindKey holder who ALSO holds >= 2_000_000 GEAR may call
///             setPublishEligible(keyId, bool) for ANY key ID (including others').
///           - The same gate may call pausePublishing(bool) to stop ALL new uploads
///             without changing per-id flags (Cap: "lock every caps mind out").
///
///         GEAR (Base mainnet): 0x5880cD05605A549f1DAb01a53ca61Ee559244bD1 (6 decimals).

interface IERC20Pay {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

interface ICapsMindKey {
    function balanceOf(address owner) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function totalSupply() external view returns (uint256);
}

contract CapsMindProphecies {
    // ---------------------------------------------------------------------
    // errors and events
    // ---------------------------------------------------------------------

    error NotOwner();
    error NotPendingOwner();
    error NotPublisher();
    error NotEligibilityAdmin();
    error KeyNotEligible();
    error PublishingPausedError();
    error ZeroAddress();
    error PausedError();
    error BadProphecy();
    error BadKey();
    error EmptyImage();
    error EmptyDescription();
    error DescriptionTooLong();
    error ImageTooLong();
    error NotTokenOwner();
    error NotApproved();
    error BadToken();
    error TransferToZero();
    error EthRejected();
    error GearTransferFailed();

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed spender, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    event ProphecyPublished(
        uint256 indexed prophecyId,
        uint256 indexed keyId,
        address indexed publisher,
        string imageUri,
        string description
    );
    event ProphecyMinted(
        uint256 indexed prophecyId,
        uint256 indexed tokenId,
        address indexed minter,
        uint256 mintNumber,
        uint256 pricePaid
    );
    event CapsMindKeySet(address indexed capsMindKey);
    event PublishEligibleSet(uint256 indexed keyId, bool eligible, address indexed by);
    event PublishingPausedSet(bool paused, address indexed by);
    event TreasurySet(address indexed treasury);
    event GearVaultSet(address indexed gearVault);
    event BaseURISet(string baseURI);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // ---------------------------------------------------------------------
    // constants
    // ---------------------------------------------------------------------

    uint256 public constant TREASURY_BPS = 9000;
    uint256 public constant VAULT_BPS = 1000;
    uint256 public constant BPS = 10_000;
    /// @dev Whole GEAR cap on the bonding curve (after this, every mint is 1000 GEAR).
    uint256 public constant MAX_PRICE_GEAR = 1000;
    /// @dev First mint number where 2^(n-1) >= 1000 (2^10 = 1024).
    uint256 public constant PRICE_CAP_MINT_NUMBER = 11;
    uint256 public constant MAX_DESCRIPTION_BYTES = 2048;
    uint256 public constant MAX_IMAGE_URI_BYTES = 1024;
    /// @dev Whole GEAR hold required (with a Caps Mind key) to change eligibility / pause publishing.
    uint256 public constant KEY_HOLD_GEAR = 2_000_000;

    string public constant NAME = "CAPs Mind Prophecy";
    string public constant SYMBOL = "CAPSPROP";

    // ---------------------------------------------------------------------
    // storage
    // ---------------------------------------------------------------------

    IERC20Pay public immutable gear;
    uint256 public immutable gearUnit; // 10^decimals
    uint256 public immutable keyHoldAmount; // KEY_HOLD_GEAR * gearUnit

    address public owner;
    address public pendingOwner;
    address public treasury;
    address public gearVault;
    bool public paused;

    /// @notice CapsMindKey ERC-721 collection.
    address public capsMindKey;
    /// @notice When true, no new prophecy uploads (minting editions still allowed unless `paused`).
    bool public publishingPaused;
    /// @notice keyId => locked out of publishing. Default false = eligible.
    mapping(uint256 => bool) private _publishLocked;

    string public baseURI;
    uint256 public prophecyCount;
    uint256 public totalSupply;

    struct Prophecy {
        string imageUri;
        string description;
        uint256 minted; // how many editions minted so far
        address publisher;
        uint64 publishedAt;
        uint256 keyId; // Caps Mind key used to publish
    }

    mapping(uint256 => Prophecy) private _prophecies;
    mapping(uint256 => uint256) public prophecyOf; // edition tokenId => prophecyId

    mapping(uint256 => address) private _ownerOf;
    mapping(address => uint256) private _balanceOf;
    mapping(uint256 => address) private _tokenApproval;
    mapping(address => mapping(address => bool)) private _operatorApproval;

    constructor(
        address initialOwner,
        address gearToken,
        address treasury_,
        address gearVault_,
        address capsMindKey_,
        string memory baseURI_
    ) {
        if (
            initialOwner == address(0) || gearToken == address(0) || treasury_ == address(0)
                || gearVault_ == address(0) || capsMindKey_ == address(0)
        ) revert ZeroAddress();

        owner = initialOwner;
        gear = IERC20Pay(gearToken);
        uint8 d = IERC20Pay(gearToken).decimals();
        gearUnit = 10 ** uint256(d);
        keyHoldAmount = KEY_HOLD_GEAR * gearUnit;
        treasury = treasury_;
        gearVault = gearVault_;
        capsMindKey = capsMindKey_;
        baseURI = baseURI_;

        emit OwnershipTransferred(address(0), initialOwner);
        emit CapsMindKeySet(capsMindKey_);
        emit TreasurySet(treasury_);
        emit GearVaultSet(gearVault_);
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

    // ---------------------------------------------------------------------
    // views: bonding price
    // ---------------------------------------------------------------------

    /// @notice Whole GEAR price for mint number `n` (1-based): min(1000, 2^(n-1)).
    function priceForMintNumber(uint256 n) public pure returns (uint256 wholeGear) {
        if (n == 0) return 0;
        if (n >= PRICE_CAP_MINT_NUMBER) return MAX_PRICE_GEAR;
        return uint256(1) << (n - 1);
    }

    /// @notice Next mint price for a prophecy in whole GEAR.
    function nextPriceWhole(uint256 prophecyId) public view returns (uint256) {
        Prophecy storage p = _prophecies[prophecyId];
        if (p.publishedAt == 0) revert BadProphecy();
        return priceForMintNumber(p.minted + 1);
    }

    /// @notice Next mint price in GEAR atomic units (scaled by decimals).
    function nextPrice(uint256 prophecyId) public view returns (uint256) {
        return nextPriceWhole(prophecyId) * gearUnit;
    }

    function getProphecy(uint256 prophecyId)
        external
        view
        returns (
            string memory imageUri,
            string memory description,
            uint256 minted,
            address publisher,
            uint64 publishedAt,
            uint256 nextPriceWholeGear,
            uint256 keyId
        )
    {
        Prophecy storage p = _prophecies[prophecyId];
        if (p.publishedAt == 0) revert BadProphecy();
        return (
            p.imageUri,
            p.description,
            p.minted,
            p.publisher,
            p.publishedAt,
            priceForMintNumber(p.minted + 1),
            p.keyId
        );
    }

    /// @notice True unless this Caps Mind key ID has been locked out of publishing.
    function isPublishEligible(uint256 keyId) public view returns (bool) {
        if (!_keyExists(keyId)) return false;
        return !_publishLocked[keyId];
    }

    /// @notice True if `account` owns `keyId`, that key is eligible, and publishing is not paused.
    function canPublishWithKey(address account, uint256 keyId) public view returns (bool) {
        if (account == address(0) || publishingPaused || paused) return false;
        if (!isPublishEligible(keyId)) return false;
        try ICapsMindKey(capsMindKey).ownerOf(keyId) returns (address o) {
            return o == account;
        } catch {
            return false;
        }
    }

    /// @notice True if `account` owns at least one eligible Caps Mind key and publishing is open.
    function canPublish(address account) public view returns (bool) {
        if (account == address(0) || publishingPaused || paused) return false;
        ICapsMindKey key = ICapsMindKey(capsMindKey);
        if (key.balanceOf(account) == 0) return false;
        uint256 supply = key.totalSupply();
        for (uint256 id = 1; id <= supply; id++) {
            if (canPublishWithKey(account, id)) return true;
        }
        return false;
    }

    /// @notice True if account holds any Caps Mind key AND >= 2_000_000 GEAR.
    function canManageEligibility(address account) public view returns (bool) {
        if (account == address(0)) return false;
        if (ICapsMindKey(capsMindKey).balanceOf(account) == 0) return false;
        return gear.balanceOf(account) >= keyHoldAmount;
    }

    // ---------------------------------------------------------------------
    // eligibility admin (Caps Mind holder + 2M GEAR)
    // ---------------------------------------------------------------------

    /// @notice Lock or unlock publish rights for ANY Caps Mind key ID.
    ///         Caller must own a Caps Mind key and hold >= 2_000_000 GEAR.
    function setPublishEligible(uint256 keyId, bool eligible) external {
        if (!canManageEligibility(msg.sender)) revert NotEligibilityAdmin();
        if (!_keyExists(keyId)) revert BadKey();
        _publishLocked[keyId] = !eligible;
        emit PublishEligibleSet(keyId, eligible, msg.sender);
    }

    /// @notice Pause or unpause ALL new prophecy uploads (does not change per-id flags).
    ///         Caller must own a Caps Mind key and hold >= 2_000_000 GEAR.
    function pausePublishing(bool paused_) external {
        if (!canManageEligibility(msg.sender)) revert NotEligibilityAdmin();
        publishingPaused = paused_;
        emit PublishingPausedSet(paused_, msg.sender);
    }

    // ---------------------------------------------------------------------
    // publish (eligible Caps Mind key required)
    // ---------------------------------------------------------------------

    /// @notice Publish a new prophecy using Caps Mind key `keyId`.
    ///         Caller must own that key, it must be eligible, and publishing must not be paused.
    function publish(uint256 keyId, string calldata imageUri, string calldata description)
        external
        whenNotPaused
        returns (uint256 prophecyId)
    {
        if (publishingPaused) revert PublishingPausedError();
        if (!canPublishWithKey(msg.sender, keyId)) {
            if (!_keyExists(keyId) || ICapsMindKey(capsMindKey).ownerOf(keyId) != msg.sender) {
                revert NotPublisher();
            }
            if (_publishLocked[keyId]) revert KeyNotEligible();
            revert NotPublisher();
        }
        if (bytes(imageUri).length == 0) revert EmptyImage();
        if (bytes(description).length == 0) revert EmptyDescription();
        if (bytes(imageUri).length > MAX_IMAGE_URI_BYTES) revert ImageTooLong();
        if (bytes(description).length > MAX_DESCRIPTION_BYTES) revert DescriptionTooLong();

        prophecyId = prophecyCount + 1;
        prophecyCount = prophecyId;
        _prophecies[prophecyId] = Prophecy({
            imageUri: imageUri,
            description: description,
            minted: 0,
            publisher: msg.sender,
            publishedAt: uint64(block.timestamp),
            keyId: keyId
        });
        emit ProphecyPublished(prophecyId, keyId, msg.sender, imageUri, description);
    }

    // ---------------------------------------------------------------------
    // mint (anyone, bonding GEAR)
    // ---------------------------------------------------------------------

    /// @notice Mint the next edition of a prophecy. Pulls nextPrice() GEAR from caller
    ///         (approve first), sends 90% to treasury and 10% to GearVault.
    function mint(uint256 prophecyId) external whenNotPaused returns (uint256 tokenId) {
        Prophecy storage p = _prophecies[prophecyId];
        if (p.publishedAt == 0) revert BadProphecy();

        uint256 mintNumber = p.minted + 1;
        uint256 price = priceForMintNumber(mintNumber) * gearUnit;
        uint256 toTreasury = (price * TREASURY_BPS) / BPS;
        uint256 toVault = price - toTreasury;

        if (!gear.transferFrom(msg.sender, treasury, toTreasury)) revert GearTransferFailed();
        if (!gear.transferFrom(msg.sender, gearVault, toVault)) revert GearTransferFailed();

        p.minted = mintNumber;
        tokenId = totalSupply + 1;
        totalSupply = tokenId;
        prophecyOf[tokenId] = prophecyId;
        _mint(msg.sender, tokenId);
        emit ProphecyMinted(prophecyId, tokenId, msg.sender, mintNumber, price);
    }

    // ---------------------------------------------------------------------
    // owner admin
    // ---------------------------------------------------------------------

    function setCapsMindKey(address capsMindKey_) external onlyOwner {
        if (capsMindKey_ == address(0)) revert ZeroAddress();
        capsMindKey = capsMindKey_;
        emit CapsMindKeySet(capsMindKey_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    function setGearVault(address gearVault_) external onlyOwner {
        if (gearVault_ == address(0)) revert ZeroAddress();
        gearVault = gearVault_;
        emit GearVaultSet(gearVault_);
    }

    function setBaseURI(string calldata uri) external onlyOwner {
        baseURI = uri;
        emit BaseURISet(uri);
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

    // ---------------------------------------------------------------------
    // ERC-721 (edition NFTs)
    // ---------------------------------------------------------------------

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

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (_ownerOf[tokenId] == address(0)) revert BadToken();
        return string(abi.encodePacked(baseURI, _toString(tokenId)));
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

    function _keyExists(uint256 keyId) internal view returns (bool) {
        if (keyId == 0) return false;
        try ICapsMindKey(capsMindKey).ownerOf(keyId) returns (address o) {
            return o != address(0);
        } catch {
            return false;
        }
    }

    function _mint(address to, uint256 tokenId) internal {
        _ownerOf[tokenId] = to;
        _balanceOf[to] += 1;
        emit Transfer(address(0), to, tokenId);
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
