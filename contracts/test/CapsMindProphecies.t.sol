// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {CapsMindProphecies} from "../src/CapsMindProphecies.sol";
import {BankrCAPsMind} from "./BankrCAPsMind.sol";
import {MockGear} from "./MockGear.sol";

contract CapsMindPropheciesTest is Test {
    address internal constant GEAR_ADDR = 0x5880cD05605A549f1DAb01a53ca61Ee559244bD1;

    BankrCAPsMind internal key;
    CapsMindProphecies internal props;
    MockGear internal gear;

    address internal owner = makeAddr("owner"); // prophecy contract owner
    address internal cap = makeAddr("cap"); // CAPs Mind key owner, holds key #1 and 2M GEAR
    address internal treasury = makeAddr("treasury");
    address internal vault = makeAddr("vault");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal rival = makeAddr("rival");

    uint256 internal constant UNIT = 1e6;
    uint256 internal constant HOLD = 2_000_000 * UNIT;

    event MetadataUpdate(uint256 _tokenId);
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

    function setUp() public {
        // Bankr's key hardcodes GEAR, so put the mock GEAR at the real address.
        vm.etch(GEAR_ADDR, address(new MockGear(6)).code);
        gear = MockGear(GEAR_ADDR);

        key = new BankrCAPsMind(cap, "");
        vm.prank(cap);
        key.ownerGenesisMint(""); // key #1 to cap

        props = new CapsMindProphecies(address(key), GEAR_ADDR, treasury, vault, owner);

        gear.mint(cap, HOLD);
        gear.mint(alice, 100_000 * UNIT);
        gear.mint(bob, 100_000 * UNIT);

        vm.prank(alice);
        gear.approve(address(props), type(uint256).max);
        vm.prank(bob);
        gear.approve(address(props), type(uint256).max);
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    function _rivalKey() internal returns (uint256 id) {
        gear.mint(rival, HOLD);
        vm.prank(rival);
        id = key.mint(""); // key #2
    }

    function _publish(string memory img) internal returns (uint256) {
        vm.prank(cap);
        return props.publishTablet(1, img, "A LINE OF PROPHECY");
    }

    function _mint(address who, uint256 tabletId) internal returns (uint256) {
        vm.prank(who);
        return props.mint(tabletId, type(uint256).max);
    }

    // ------------------------------------------------------------------
    // deploy
    // ------------------------------------------------------------------

    function test_constructorState() public view {
        assertEq(address(props.capsMindKey()), address(key));
        assertEq(address(props.gear()), GEAR_ADDR);
        assertEq(props.gearUnit(), UNIT);
        assertEq(props.keyHoldAmount(), HOLD);
        assertEq(props.treasury(), treasury);
        assertEq(props.gearVault(), vault);
        assertEq(props.owner(), owner);
        assertEq(props.name(), "CAPs Mind Prophecy Tablets");
        assertEq(props.symbol(), "CAPSPROP");
        assertTrue(props.supportsInterface(0x80ac58cd)); // ERC-721
        assertTrue(props.supportsInterface(0x5b5e139f)); // metadata
        assertTrue(props.supportsInterface(0x49064906)); // ERC-4906
    }

    function test_constructorRejectsZero() public {
        vm.expectRevert(CapsMindProphecies.ZeroAddress.selector);
        new CapsMindProphecies(address(0), GEAR_ADDR, treasury, vault, owner);
        vm.expectRevert(CapsMindProphecies.ZeroAddress.selector);
        new CapsMindProphecies(address(key), GEAR_ADDR, address(0), vault, owner);
        vm.expectRevert(CapsMindProphecies.ZeroAddress.selector);
        new CapsMindProphecies(address(key), GEAR_ADDR, treasury, address(0), owner);
    }

    // ------------------------------------------------------------------
    // publish gate
    // ------------------------------------------------------------------

    function test_publishGatedByKey() public {
        vm.prank(alice);
        vm.expectRevert(CapsMindProphecies.NotPublisher.selector);
        props.publishTablet(1, "ipfs://img", "NO KEY");

        // contract owner without a key cannot publish either
        vm.prank(owner);
        vm.expectRevert(CapsMindProphecies.NotPublisher.selector);
        props.publishTablet(1, "ipfs://img", "OWNER NO KEY");

        // nonexistent key
        vm.prank(cap);
        vm.expectRevert(CapsMindProphecies.NotPublisher.selector);
        props.publishTablet(7, "ipfs://img", "NO SUCH KEY");

        uint256 t1 = _publish("ipfs://one");
        uint256 t2 = _publish("ipfs://two");
        assertEq(t1, 1);
        assertEq(t2, 2);
        assertEq(props.tabletCount(), 2);

        (string memory img,, uint256 minted, address publisher, uint256 keyId,,, uint256 next) = props.getTablet(2);
        assertEq(img, "ipfs://two");
        assertEq(minted, 0);
        assertEq(publisher, cap);
        assertEq(keyId, 1);
        assertEq(next, 1);
    }

    function test_publishFollowsKeyOwnership() public {
        vm.prank(cap);
        key.transferFrom(cap, bob, 1);

        vm.prank(cap);
        vm.expectRevert(CapsMindProphecies.NotPublisher.selector);
        props.publishTablet(1, "ipfs://x", "OLD HOLDER");

        vm.prank(bob);
        assertEq(props.publishTablet(1, "ipfs://x", "NEW HOLDER"), 1);
    }

    function test_cannotUseSomeoneElsesKey() public {
        _rivalKey();
        vm.prank(rival);
        vm.expectRevert(CapsMindProphecies.NotPublisher.selector);
        props.publishTablet(1, "ipfs://x", "NOT MY KEY");
    }

    function test_rejectsBadFields() public {
        vm.startPrank(cap);
        vm.expectRevert(CapsMindProphecies.EmptyImage.selector);
        props.publishTablet(1, "", "text");
        vm.expectRevert(CapsMindProphecies.EmptyDescription.selector);
        props.publishTablet(1, "ipfs://x", "");
        vm.expectRevert(CapsMindProphecies.ImageTooLong.selector);
        props.publishTablet(1, string(new bytes(1025)), "text");
        vm.expectRevert(CapsMindProphecies.DescriptionTooLong.selector);
        props.publishTablet(1, "ipfs://x", string(new bytes(2049)));
        vm.stopPrank();
    }

    function test_canPublishWorksWithBankrKey() public view {
        // Bankr's key has no totalSupply(); canPublish must still work (uses totalMinted).
        assertTrue(props.canPublish(cap));
        assertFalse(props.canPublish(alice));
        assertTrue(props.canPublishWithKey(cap, 1));
        assertFalse(props.canPublishWithKey(alice, 1));
        assertTrue(props.isPublishEligible(1));
        assertFalse(props.isPublishEligible(2));
        assertTrue(props.canManageEligibility(cap));
    }

    // ------------------------------------------------------------------
    // metadata update gate
    // ------------------------------------------------------------------

    function test_updateGatedByKey() public {
        uint256 t = _publish("ipfs://v1");

        vm.prank(alice);
        vm.expectRevert(CapsMindProphecies.NotPublisher.selector);
        props.updateTablet(1, t, "ipfs://hack", "HACK");

        vm.prank(owner);
        vm.expectRevert(CapsMindProphecies.NotPublisher.selector);
        props.updateTablet(1, t, "ipfs://owner", "OWNER");

        vm.prank(cap);
        vm.expectRevert(CapsMindProphecies.BadTablet.selector);
        props.updateTablet(1, 99, "ipfs://v2", "NEW LOOK");

        vm.prank(cap);
        props.updateTablet(1, t, "ipfs://v2", "NEW LOOK");
        (string memory img, string memory desc,,,,,,) = props.getTablet(t);
        assertEq(img, "ipfs://v2");
        assertEq(desc, "NEW LOOK");

        // any eligible key holder may update, not only the publisher
        _rivalKey();
        vm.prank(rival);
        props.updateTablet(2, t, "ipfs://v3", "RIVAL LOOK");
        (img,,,,,,,) = props.getTablet(t);
        assertEq(img, "ipfs://v3");
    }

    function test_updateAppliesToAllCopiesAndEmits4906() public {
        uint256 t1 = _publish("ipfs://a");
        uint256 t2 = _publish("ipfs://b");
        _mint(alice, t1); // token 1, t1 #1
        _mint(alice, t2); // token 2, t2 #1
        _mint(bob, t1); // token 3, t1 #2
        _mint(bob, t1); // token 4, t1 #3

        vm.expectEmit(address(props));
        emit BatchMetadataUpdate(1, 4);
        vm.prank(cap);
        props.updateTablet(1, t1, "ipfs://a2", "NEW");

        vm.expectEmit(address(props));
        emit MetadataUpdate(2);
        vm.prank(cap);
        props.updateTablet(1, t2, "ipfs://b2", "NEW B");

        string memory expected = _expectedURI(1, 3, "NEW", "ipfs://a2");
        assertEq(props.tokenURI(4), expected);
        assertEq(props.tokenURI(1), _expectedURI(1, 1, "NEW", "ipfs://a2"));
        assertEq(props.tokenURI(2), _expectedURI(2, 1, "NEW B", "ipfs://b2"));
    }

    // ------------------------------------------------------------------
    // serials, token IDs, metadata
    // ------------------------------------------------------------------

    function test_serialsPerTabletAndGlobalTokenIds() public {
        uint256 t1 = _publish("ipfs://a");
        uint256 t2 = _publish("ipfs://b");

        assertEq(_mint(alice, t1), 1);
        assertEq(_mint(bob, t2), 2);
        assertEq(_mint(alice, t1), 3);
        assertEq(_mint(bob, t1), 4);
        assertEq(_mint(alice, t2), 5);
        assertEq(props.totalSupply(), 5);

        assertEq(props.tabletOf(1), t1);
        assertEq(props.serialOf(1), 1);
        assertEq(props.tabletOf(3), t1);
        assertEq(props.serialOf(3), 2);
        assertEq(props.serialOf(4), 3);
        assertEq(props.tabletOf(2), t2);
        assertEq(props.serialOf(2), 1);
        assertEq(props.serialOf(5), 2);

        assertEq(props.tokenOfTabletSerial(t1, 3), 4);
        assertEq(props.tokenOfTabletSerial(t2, 2), 5);
        vm.expectRevert(CapsMindProphecies.BadToken.selector);
        props.tokenOfTabletSerial(t2, 3);

        assertEq(props.tokenName(5), "Prophecy Tablet 2 #2");
        assertEq(props.ownerOf(4), bob);
        assertEq(props.balanceOf(alice), 3);
    }

    function test_tokenURIOnchainJSON() public {
        uint256 t = _publish("ipfs://bafyimage");
        _mint(alice, t);
        assertEq(props.tokenURI(1), _expectedURI(1, 1, "A LINE OF PROPHECY", "ipfs://bafyimage"));
    }

    function test_tokenURIEscapesDescription() public {
        vm.prank(cap);
        uint256 t = props.publishTablet(1, "ipfs://x", unicode"He said \"rise\"\nback\\slash\ttab");
        _mint(alice, t);
        string memory json = string.concat(
            '{"name":"Prophecy Tablet 1 #1","description":"He said \\"rise\\"\\nback\\\\slash\\ttab",',
            '"image":"ipfs://x","attributes":[{"trait_type":"Tablet","value":1},',
            '{"trait_type":"Serial","display_type":"number","value":1}]}'
        );
        assertEq(props.tokenURI(1), string.concat("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    function test_viewsRevertForMissingToken() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 1));
        props.tokenURI(1);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 1));
        props.serialOf(1);
        vm.expectRevert(CapsMindProphecies.BadTablet.selector);
        props.nextPrice(1);
    }

    // ------------------------------------------------------------------
    // bonding price and payment split
    // ------------------------------------------------------------------

    function test_priceCurve() public view {
        assertEq(props.priceForSerial(1), 1);
        assertEq(props.priceForSerial(2), 2);
        assertEq(props.priceForSerial(3), 4);
        assertEq(props.priceForSerial(10), 512);
        assertEq(props.priceForSerial(11), 1000);
        assertEq(props.priceForSerial(500), 1000);
    }

    function test_bondingPricePerTablet() public {
        uint256 t1 = _publish("ipfs://a");
        uint256 t2 = _publish("ipfs://b");
        _mint(alice, t1);
        _mint(alice, t1);
        _mint(alice, t1);
        assertEq(props.nextPriceWhole(t1), 8);
        assertEq(props.nextPrice(t1), 8 * UNIT);
        // tablet 2 has its own curve
        assertEq(props.nextPriceWhole(t2), 1);
        uint256 before = gear.balanceOf(bob);
        _mint(bob, t2);
        assertEq(before - gear.balanceOf(bob), 1 * UNIT);
        assertEq(props.nextPriceWhole(t2), 2);
    }

    function test_paymentSplit() public {
        uint256 t = _publish("ipfs://a");
        _mint(alice, t); // 1 GEAR
        assertEq(gear.balanceOf(treasury), 900_000);
        assertEq(gear.balanceOf(vault), 100_000);
        _mint(bob, t); // 2 GEAR
        _mint(bob, t); // 4 GEAR
        assertEq(gear.balanceOf(treasury), (7 * UNIT * 9000) / 10000);
        assertEq(gear.balanceOf(vault), (7 * UNIT * 1000) / 10000);
        assertEq(gear.balanceOf(address(props)), 0);
    }

    function test_priceCapsAt1000() public {
        uint256 t = _publish("ipfs://a");
        for (uint256 i; i < 10; i++) {
            _mint(alice, t);
        }
        assertEq(props.nextPriceWhole(t), 1000);
        uint256 tb = gear.balanceOf(treasury);
        uint256 vb = gear.balanceOf(vault);
        _mint(alice, t);
        assertEq(gear.balanceOf(treasury) - tb, 900 * UNIT);
        assertEq(gear.balanceOf(vault) - vb, 100 * UNIT);
        assertEq(props.nextPriceWhole(t), 1000);
    }

    function test_maxPriceProtection() public {
        uint256 t = _publish("ipfs://a");
        _mint(alice, t);
        uint256 price = props.nextPrice(t); // 2 GEAR
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(CapsMindProphecies.PriceAboveMax.selector, price, price - 1));
        props.mint(t, price - 1);
        vm.prank(bob);
        props.mint(t, price);
    }

    function test_mintRevertsWithoutApprovalOrTablet() public {
        uint256 t = _publish("ipfs://a");
        vm.prank(rival); // no GEAR, no approval
        vm.expectRevert();
        props.mint(t, type(uint256).max);
        vm.prank(alice);
        vm.expectRevert(CapsMindProphecies.BadTablet.selector);
        props.mint(99, type(uint256).max);
    }

    // ------------------------------------------------------------------
    // locks and pauses
    // ------------------------------------------------------------------

    function test_lockKeyBlocksPublishAndUpdate() public {
        uint256 rk = _rivalKey();
        uint256 t = _publish("ipfs://a");

        vm.prank(cap);
        props.setPublishEligible(rk, false);
        assertFalse(props.isPublishEligible(rk));
        assertFalse(props.canPublish(rival));

        vm.prank(rival);
        vm.expectRevert(CapsMindProphecies.KeyNotEligible.selector);
        props.publishTablet(rk, "ipfs://x", "NOPE");
        vm.prank(rival);
        vm.expectRevert(CapsMindProphecies.KeyNotEligible.selector);
        props.updateTablet(rk, t, "ipfs://x", "NOPE");

        vm.prank(cap);
        props.setPublishEligible(rk, true);
        vm.prank(rival);
        props.publishTablet(rk, "ipfs://y", "YES");
    }

    function test_eligibilityAdminNeedsKeyAndHold() public {
        // GEAR but no key
        gear.mint(alice, HOLD);
        vm.prank(alice);
        vm.expectRevert(CapsMindProphecies.NotEligibilityAdmin.selector);
        props.setPublishEligible(1, false);

        // key but under 2M GEAR
        uint256 rk = _rivalKey();
        vm.prank(rival);
        gear.transfer(bob, 1);
        vm.prank(rival);
        vm.expectRevert(CapsMindProphecies.NotEligibilityAdmin.selector);
        props.pausePublishing(true);

        // contract owner without key + hold cannot either
        vm.prank(owner);
        vm.expectRevert(CapsMindProphecies.NotEligibilityAdmin.selector);
        props.setPublishEligible(rk, false);

        vm.prank(cap);
        vm.expectRevert(CapsMindProphecies.BadKey.selector);
        props.setPublishEligible(9, false);
    }

    function test_pausePublishingBlocksPublishAndUpdateNotMint() public {
        uint256 t = _publish("ipfs://a");
        vm.prank(cap);
        props.pausePublishing(true);
        assertTrue(props.publishingPaused());
        assertFalse(props.canPublish(cap));

        vm.prank(cap);
        vm.expectRevert(CapsMindProphecies.PublishingPausedError.selector);
        props.publishTablet(1, "ipfs://b", "BLOCKED");
        vm.prank(cap);
        vm.expectRevert(CapsMindProphecies.PublishingPausedError.selector);
        props.updateTablet(1, t, "ipfs://b", "BLOCKED");

        _mint(alice, t); // minting still open

        vm.prank(cap);
        props.pausePublishing(false);
        _publish("ipfs://c");
    }

    function test_ownerPauseBlocksEverything() public {
        uint256 t = _publish("ipfs://a");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        props.pause();

        vm.prank(owner);
        props.pause();
        vm.prank(cap);
        vm.expectRevert(CapsMindProphecies.PausedError.selector);
        props.publishTablet(1, "ipfs://b", "no");
        vm.prank(cap);
        vm.expectRevert(CapsMindProphecies.PausedError.selector);
        props.updateTablet(1, t, "ipfs://b", "no");
        vm.prank(alice);
        vm.expectRevert(CapsMindProphecies.PausedError.selector);
        props.mint(t, type(uint256).max);

        vm.prank(owner);
        props.unpause();
        _mint(alice, t);
    }

    // ------------------------------------------------------------------
    // owner admin
    // ------------------------------------------------------------------

    function test_ownerSetsTreasuryAndVault() public {
        address nt = makeAddr("newTreasury");
        address nv = makeAddr("newVault");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        props.setTreasury(nt);

        vm.startPrank(owner);
        vm.expectRevert(CapsMindProphecies.ZeroAddress.selector);
        props.setTreasury(address(0));
        props.setTreasury(nt);
        props.setGearVault(nv);
        vm.stopPrank();

        uint256 t = _publish("ipfs://a");
        _mint(alice, t);
        assertEq(gear.balanceOf(nt), 900_000);
        assertEq(gear.balanceOf(nv), 100_000);
    }

    function test_twoStepOwnershipAndNoRenounce() public {
        vm.prank(owner);
        vm.expectRevert(CapsMindProphecies.RenounceDisabled.selector);
        props.renounceOwnership();

        vm.prank(owner);
        props.transferOwnership(bob);
        assertEq(props.owner(), owner);
        assertEq(props.pendingOwner(), bob);
        vm.prank(bob);
        props.acceptOwnership();
        assertEq(props.owner(), bob);
    }

    // ------------------------------------------------------------------

    function _expectedURI(uint256 tabletId, uint256 serial, string memory desc, string memory img)
        internal
        pure
        returns (string memory)
    {
        string memory json = string.concat(
            '{"name":"Prophecy Tablet ',
            vm.toString(tabletId),
            " #",
            vm.toString(serial),
            '","description":"',
            desc,
            '","image":"',
            img,
            '","attributes":[{"trait_type":"Tablet","value":',
            vm.toString(tabletId),
            '},{"trait_type":"Serial","display_type":"number","value":',
            vm.toString(serial),
            "}]}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }
}
