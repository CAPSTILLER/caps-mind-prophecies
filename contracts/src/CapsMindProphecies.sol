// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC4906} from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @dev Minimal view of the CAPs Mind key collection (Base: 0x00635ca44339c7c194ef5bc87bf2cd6df04a666d).
///      Bankr's deployed key has balanceOf/ownerOf/totalMinted but NO totalSupply, so supply is read
///      with try/catch (totalMinted first, then totalSupply).
interface ICapsMindKeyView {
    function balanceOf(address owner) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function totalMinted() external view returns (uint256);
    function totalSupply() external view returns (uint256);
}

/// @title CapsMindProphecies (Prophecy Tablets)
/// @notice ERC-721 prophecy tablets for Vault 42.
///
///         Tablets and copies
///           - A CAPs Mind key holder publishes a tablet: an image URI (ipfs:// recommended) plus a
///             description. Tablets are numbered 1, 2, 3, ... in publish order.
///           - Anyone mints copies of any published tablet. Every copy is its own ERC-721 token with a
///             global token ID (1, 2, 3, ... across all tablets) and a serial number inside its tablet
///             (1, 2, 3, ... per tablet). tabletOf(tokenId) and serialOf(tokenId) read them back.
///           - tokenURI builds the metadata JSON onchain: name "Prophecy Tablet 2 #5", the tablet's
///             description and image, plus Tablet and Serial traits. Every copy of a tablet shares the
///             same image and description.
///
///         Updating the look
///           - A CAPs Mind key holder (eligible key, publishing not paused) can replace a tablet's image
///             and description. All copies of that tablet change at once and ERC-4906
///             BatchMetadataUpdate is emitted so marketplaces refresh.
///
///         Price
///           - Copy n of a tablet costs min(1000, 2^(n-1)) whole GEAR: 1, 2, 4, ..., 512, then 1000
///             forever. Each tablet has its own curve. Payment is split 90% treasury / 10% GearVault.
///
///         Publish eligibility (unchanged rules)
///           - Every CAPs Mind key ID is eligible unless locked.
///           - A CAPs Mind holder who also holds >= 2,000,000 GEAR can setPublishEligible(keyId, bool)
///             for any key ID and pausePublishing(bool) to stop all publishing and tablet edits.
///
///         Contract owner
///           - Sets treasury and GearVault addresses and can pause/unpause publishing, edits and mints.
///           - Cannot publish or edit tablets (only CAPs Mind key holders can). Ownership moves in two
///             steps (transferOwnership, then acceptOwnership). renounceOwnership is disabled.
///
///         GEAR (Base mainnet): 0x5880cD05605A549f1DAb01a53ca61Ee559244bD1 (6 decimals).
contract CapsMindProphecies is ERC721, IERC4906, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    // ---------------------------------------------------------------------
    // errors
    // ---------------------------------------------------------------------

    error NotPublisher();
    error NotEligibilityAdmin();
    error KeyNotEligible();
    error PublishingPausedError();
    error PausedError();
    error ZeroAddress();
    error BadTablet();
    error BadKey();
    error BadToken();
    error EmptyImage();
    error EmptyDescription();
    error ImageTooLong();
    error DescriptionTooLong();
    error PriceAboveMax(uint256 price, uint256 maxPrice);
    error RenounceDisabled();
    error BadGearToken();

    // ---------------------------------------------------------------------
    // events
    // ---------------------------------------------------------------------

    event TabletPublished(
        uint256 indexed tabletId, uint256 indexed keyId, address indexed publisher, string imageURI, string description
    );
    event TabletUpdated(
        uint256 indexed tabletId, uint256 indexed keyId, address indexed editor, string imageURI, string description
    );
    event TabletMinted(
        uint256 indexed tabletId, uint256 indexed tokenId, address indexed minter, uint256 serial, uint256 pricePaid
    );
    event PublishEligibleSet(uint256 indexed keyId, bool eligible, address indexed by);
    event PublishingPausedSet(bool paused, address indexed by);
    event TreasurySet(address indexed treasury);
    event GearVaultSet(address indexed gearVault);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // ---------------------------------------------------------------------
    // constants
    // ---------------------------------------------------------------------

    uint256 public constant TREASURY_BPS = 9000;
    uint256 public constant VAULT_BPS = 1000;
    uint256 public constant BPS = 10_000;
    /// @notice Whole GEAR cap on the curve. From copy 11 on, every copy costs 1000 GEAR.
    uint256 public constant MAX_PRICE_GEAR = 1000;
    /// @notice First serial where 2^(n-1) >= 1000 (2^10 = 1024).
    uint256 public constant PRICE_CAP_SERIAL = 11;
    /// @notice Whole GEAR a CAPs Mind holder must also hold to lock keys or pause publishing.
    uint256 public constant KEY_HOLD_GEAR = 2_000_000;
    uint256 public constant MAX_IMAGE_URI_BYTES = 1024;
    uint256 public constant MAX_DESCRIPTION_BYTES = 2048;

    // ---------------------------------------------------------------------
    // storage
    // ---------------------------------------------------------------------

    /// @notice CAPs Mind key collection. Fixed at deploy.
    ICapsMindKeyView public immutable capsMindKey;
    /// @notice GEAR token. Fixed at deploy.
    IERC20 public immutable gear;
    /// @notice 10 ** GEAR decimals.
    uint256 public immutable gearUnit;
    /// @notice KEY_HOLD_GEAR in GEAR atomic units.
    uint256 public immutable keyHoldAmount;

    address public treasury;
    address public gearVault;
    /// @notice Owner pause: blocks publishing, tablet edits and mints.
    bool public paused;
    /// @notice Key-holder pause: blocks publishing and tablet edits (mints still work).
    bool public publishingPaused;

    /// @notice Number of tablets published. Tablet IDs run 1..tabletCount.
    uint256 public tabletCount;
    /// @notice Number of copies minted across all tablets. Token IDs run 1..totalSupply.
    uint256 public totalSupply;

    struct Tablet {
        string imageURI;
        string description;
        uint256 minted; // copies minted so far = latest serial
        address publisher;
        uint256 keyId; // CAPs Mind key used to publish
        uint64 publishedAt;
        uint64 updatedAt;
    }

    mapping(uint256 => Tablet) private _tablets;
    mapping(uint256 => uint256) private _tabletOf; // tokenId => tabletId
    mapping(uint256 => uint256) private _serialOf; // tokenId => serial
    mapping(uint256 => mapping(uint256 => uint256)) private _tokenBySerial; // tabletId => serial => tokenId
    mapping(uint256 => bool) private _publishLocked; // keyId => locked (default false = eligible)

    constructor(address capsMindKey_, address gearToken, address treasury_, address gearVault_, address initialOwner)
        ERC721("CAPs Mind Prophecy Tablets", "CAPSPROP")
        Ownable(initialOwner)
    {
        if (
            capsMindKey_ == address(0) || gearToken == address(0) || treasury_ == address(0) || gearVault_ == address(0)
        ) {
            revert ZeroAddress();
        }
        capsMindKey = ICapsMindKeyView(capsMindKey_);
        gear = IERC20(gearToken);
        uint8 d = _readDecimals(gearToken);
        gearUnit = 10 ** uint256(d);
        keyHoldAmount = KEY_HOLD_GEAR * gearUnit;
        treasury = treasury_;
        gearVault = gearVault_;
        emit TreasurySet(treasury_);
        emit GearVaultSet(gearVault_);
    }

    modifier whenNotPaused() {
        if (paused) revert PausedError();
        _;
    }

    // ---------------------------------------------------------------------
    // price views
    // ---------------------------------------------------------------------

    /// @notice Whole GEAR price for serial `n` (1-based) of any tablet: min(1000, 2^(n-1)).
    function priceForSerial(uint256 n) public pure returns (uint256 wholeGear) {
        if (n == 0) return 0;
        if (n >= PRICE_CAP_SERIAL) return MAX_PRICE_GEAR;
        return uint256(1) << (n - 1);
    }

    /// @notice Whole GEAR price of the next copy of `tabletId`.
    function nextPriceWhole(uint256 tabletId) public view returns (uint256) {
        return priceForSerial(_tablet(tabletId).minted + 1);
    }

    /// @notice GEAR atomic units (6 decimals on Base) for the next copy of `tabletId`.
    ///         Pass this (or more) as `maxPrice` to mint, and approve at least this much GEAR.
    function nextPrice(uint256 tabletId) public view returns (uint256) {
        return nextPriceWhole(tabletId) * gearUnit;
    }

    // ---------------------------------------------------------------------
    // tablet / token views
    // ---------------------------------------------------------------------

    function getTablet(uint256 tabletId)
        external
        view
        returns (
            string memory imageURI,
            string memory description,
            uint256 minted,
            address publisher,
            uint256 keyId,
            uint64 publishedAt,
            uint64 updatedAt,
            uint256 nextPriceWholeGear
        )
    {
        Tablet storage t = _tablet(tabletId);
        return (
            t.imageURI,
            t.description,
            t.minted,
            t.publisher,
            t.keyId,
            t.publishedAt,
            t.updatedAt,
            priceForSerial(t.minted + 1)
        );
    }

    /// @notice Which tablet a token is a copy of.
    function tabletOf(uint256 tokenId) public view returns (uint256) {
        _requireOwned(tokenId);
        return _tabletOf[tokenId];
    }

    /// @notice The token's serial number inside its tablet (1, 2, 3, ...).
    function serialOf(uint256 tokenId) public view returns (uint256) {
        _requireOwned(tokenId);
        return _serialOf[tokenId];
    }

    /// @notice Token ID of copy `serial` of `tabletId`.
    function tokenOfTabletSerial(uint256 tabletId, uint256 serial) external view returns (uint256 tokenId) {
        tokenId = _tokenBySerial[tabletId][serial];
        if (tokenId == 0) revert BadToken();
    }

    /// @notice "Prophecy Tablet <tabletId> #<serial>"
    function tokenName(uint256 tokenId) public view returns (string memory) {
        _requireOwned(tokenId);
        return string.concat("Prophecy Tablet ", _tabletOf[tokenId].toString(), " #", _serialOf[tokenId].toString());
    }

    /// @notice Onchain JSON (base64 data URI) with name "Prophecy Tablet T #S", the tablet's
    ///         description and image, and Tablet / Serial traits.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        uint256 tabletId = _tabletOf[tokenId];
        uint256 serial = _serialOf[tokenId];
        Tablet storage t = _tablets[tabletId];
        bytes memory json = abi.encodePacked(
            '{"name":"',
            tokenName(tokenId),
            '","description":"',
            _escapeJSON(t.description),
            '","image":"',
            _escapeJSON(t.imageURI),
            '","attributes":[{"trait_type":"Tablet","value":',
            tabletId.toString(),
            '},{"trait_type":"Serial","display_type":"number","value":',
            serial.toString(),
            "}]}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(json));
    }

    // ---------------------------------------------------------------------
    // eligibility views
    // ---------------------------------------------------------------------

    /// @notice True if CAPs Mind key `keyId` exists and is not locked out.
    function isPublishEligible(uint256 keyId) public view returns (bool) {
        if (!_keyExists(keyId)) return false;
        return !_publishLocked[keyId];
    }

    /// @notice True if `account` owns `keyId`, the key is eligible, and publishing is open.
    function canPublishWithKey(address account, uint256 keyId) public view returns (bool) {
        if (account == address(0) || publishingPaused || paused) return false;
        if (_publishLocked[keyId]) return false;
        return _keyOwner(keyId) == account;
    }

    /// @notice True if `account` owns at least one eligible CAPs Mind key and publishing is open.
    ///         Helper for sites; loops over key IDs 1..supply.
    function canPublish(address account) external view returns (bool) {
        if (account == address(0) || publishingPaused || paused) return false;
        if (capsMindKey.balanceOf(account) == 0) return false;
        uint256 supply = _keySupply();
        for (uint256 id = 1; id <= supply; id++) {
            if (!_publishLocked[id] && _keyOwner(id) == account) return true;
        }
        return false;
    }

    /// @notice True if `account` holds a CAPs Mind key AND >= 2,000,000 GEAR.
    function canManageEligibility(address account) public view returns (bool) {
        if (account == address(0)) return false;
        if (capsMindKey.balanceOf(account) == 0) return false;
        return gear.balanceOf(account) >= keyHoldAmount;
    }

    // ---------------------------------------------------------------------
    // eligibility admin (CAPs Mind holder + 2,000,000 GEAR)
    // ---------------------------------------------------------------------

    /// @notice Lock (false) or unlock (true) publishing and tablet edits for any CAPs Mind key ID.
    function setPublishEligible(uint256 keyId, bool eligible) external {
        if (!canManageEligibility(msg.sender)) revert NotEligibilityAdmin();
        if (!_keyExists(keyId)) revert BadKey();
        _publishLocked[keyId] = !eligible;
        emit PublishEligibleSet(keyId, eligible, msg.sender);
    }

    /// @notice Pause (true) or resume (false) all publishing and tablet edits. Per-key locks are kept.
    function pausePublishing(bool paused_) external {
        if (!canManageEligibility(msg.sender)) revert NotEligibilityAdmin();
        publishingPaused = paused_;
        emit PublishingPausedSet(paused_, msg.sender);
    }

    // ---------------------------------------------------------------------
    // publish and edit (eligible CAPs Mind key)
    // ---------------------------------------------------------------------

    /// @notice Publish a new tablet with CAPs Mind key `keyId`. It becomes the next tablet ID and is
    ///         mintable right away.
    function publishTablet(uint256 keyId, string calldata imageURI, string calldata description)
        external
        whenNotPaused
        returns (uint256 tabletId)
    {
        _requireKeyRights(keyId);
        _validate(imageURI, description);

        tabletId = ++tabletCount;
        Tablet storage t = _tablets[tabletId];
        t.imageURI = imageURI;
        t.description = description;
        t.publisher = msg.sender;
        t.keyId = keyId;
        t.publishedAt = uint64(block.timestamp);
        t.updatedAt = uint64(block.timestamp);
        emit TabletPublished(tabletId, keyId, msg.sender, imageURI, description);
    }

    /// @notice Replace a tablet's image and description (all copies change). Any holder of an eligible
    ///         CAPs Mind key can do this, not only the original publisher.
    function updateTablet(uint256 keyId, uint256 tabletId, string calldata imageURI, string calldata description)
        external
        whenNotPaused
    {
        _requireKeyRights(keyId);
        Tablet storage t = _tablet(tabletId);
        _validate(imageURI, description);

        t.imageURI = imageURI;
        t.description = description;
        t.updatedAt = uint64(block.timestamp);
        emit TabletUpdated(tabletId, keyId, msg.sender, imageURI, description);

        uint256 minted = t.minted;
        if (minted == 1) {
            emit MetadataUpdate(_tokenBySerial[tabletId][1]);
        } else if (minted > 1) {
            // Copies of one tablet always sit inside [first copy, latest copy].
            emit BatchMetadataUpdate(_tokenBySerial[tabletId][1], _tokenBySerial[tabletId][minted]);
        }
    }

    // ---------------------------------------------------------------------
    // mint (anyone, GEAR bonding price)
    // ---------------------------------------------------------------------

    /// @notice Mint the next copy of `tabletId` to the caller. Pulls nextPrice(tabletId) GEAR
    ///         (approve first): 90% to treasury, 10% to GearVault. Reverts if the price is above
    ///         `maxPrice` (GEAR atomic units), which protects against someone minting first.
    function mint(uint256 tabletId, uint256 maxPrice) external nonReentrant whenNotPaused returns (uint256 tokenId) {
        Tablet storage t = _tablet(tabletId);

        uint256 serial = t.minted + 1;
        uint256 price = priceForSerial(serial) * gearUnit;
        if (price > maxPrice) revert PriceAboveMax(price, maxPrice);
        uint256 toTreasury = (price * TREASURY_BPS) / BPS;
        uint256 toVault = price - toTreasury;

        t.minted = serial;
        tokenId = ++totalSupply;
        _tabletOf[tokenId] = tabletId;
        _serialOf[tokenId] = serial;
        _tokenBySerial[tabletId][serial] = tokenId;
        emit TabletMinted(tabletId, tokenId, msg.sender, serial, price);

        gear.safeTransferFrom(msg.sender, treasury, toTreasury);
        gear.safeTransferFrom(msg.sender, gearVault, toVault);

        _safeMint(msg.sender, tokenId);
    }

    // ---------------------------------------------------------------------
    // owner admin
    // ---------------------------------------------------------------------

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

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @dev Disabled so treasury / GearVault / pause controls can never be thrown away by accident.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    // ---------------------------------------------------------------------
    // ERC-165
    // ---------------------------------------------------------------------

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, IERC165) returns (bool) {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }

    // ---------------------------------------------------------------------
    // internals
    // ---------------------------------------------------------------------

    function _tablet(uint256 tabletId) internal view returns (Tablet storage t) {
        t = _tablets[tabletId];
        if (t.publishedAt == 0) revert BadTablet();
    }

    function _requireKeyRights(uint256 keyId) internal view {
        if (publishingPaused) revert PublishingPausedError();
        if (_keyOwner(keyId) != msg.sender) revert NotPublisher();
        if (_publishLocked[keyId]) revert KeyNotEligible();
    }

    function _validate(string calldata imageURI, string calldata description) internal pure {
        if (bytes(imageURI).length == 0) revert EmptyImage();
        if (bytes(description).length == 0) revert EmptyDescription();
        if (bytes(imageURI).length > MAX_IMAGE_URI_BYTES) revert ImageTooLong();
        if (bytes(description).length > MAX_DESCRIPTION_BYTES) revert DescriptionTooLong();
    }

    /// @dev Owner of CAPs Mind key `keyId`, or address(0) if it does not exist.
    function _keyOwner(uint256 keyId) internal view returns (address) {
        if (keyId == 0) return address(0);
        try capsMindKey.ownerOf(keyId) returns (address o) {
            return o;
        } catch {
            return address(0);
        }
    }

    function _keyExists(uint256 keyId) internal view returns (bool) {
        return _keyOwner(keyId) != address(0);
    }

    function _keySupply() internal view returns (uint256) {
        try capsMindKey.totalMinted() returns (uint256 n) {
            return n;
        } catch {}
        try capsMindKey.totalSupply() returns (uint256 n) {
            return n;
        } catch {}
        return 0;
    }

    function _readDecimals(address token) internal view returns (uint8) {
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSignature("decimals()"));
        if (!ok || data.length < 32) revert BadGearToken();
        uint256 d = abi.decode(data, (uint256));
        if (d > 36) revert BadGearToken();
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint8(d); // safe: d <= 36
    }

    /// @dev Escapes a string for use inside a JSON string value: quote, backslash and control bytes.
    function _escapeJSON(string memory input) internal pure returns (string memory) {
        bytes memory b = bytes(input);
        uint256 extra = 0;
        for (uint256 i; i < b.length; i++) {
            bytes1 c = b[i];
            if (c == '"' || c == "\\" || c == 0x08 || c == 0x0c || c == "\n" || c == "\r" || c == "\t") {
                extra += 1;
            } else if (uint8(c) < 0x20) {
                extra += 5; // \u00XX
            }
        }
        if (extra == 0) return input;

        bytes memory out = new bytes(b.length + extra);
        bytes16 hexChars = "0123456789abcdef";
        uint256 j = 0;
        for (uint256 i; i < b.length; i++) {
            bytes1 c = b[i];
            if (c == '"' || c == "\\") {
                out[j++] = "\\";
                out[j++] = c;
            } else if (c == "\n") {
                out[j++] = "\\";
                out[j++] = "n";
            } else if (c == "\r") {
                out[j++] = "\\";
                out[j++] = "r";
            } else if (c == "\t") {
                out[j++] = "\\";
                out[j++] = "t";
            } else if (c == 0x08) {
                out[j++] = "\\";
                out[j++] = "b";
            } else if (c == 0x0c) {
                out[j++] = "\\";
                out[j++] = "f";
            } else if (uint8(c) < 0x20) {
                out[j++] = "\\";
                out[j++] = "u";
                out[j++] = "0";
                out[j++] = "0";
                out[j++] = hexChars[uint8(c) >> 4];
                out[j++] = hexChars[uint8(c) & 0x0f];
            } else {
                out[j++] = c;
            }
        }
        return string(out);
    }
}
