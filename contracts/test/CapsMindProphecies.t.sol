// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CapsMindKey} from "../src/CapsMindKey.sol";
import {CapsMindProphecies} from "../src/CapsMindProphecies.sol";
import {MockGear} from "./MockGear.sol";

contract CapsMindPropheciesTest is Test {
    CapsMindKey internal key;
    CapsMindProphecies internal props;
    MockGear internal gear;

    address internal owner = makeAddr("owner");
    address internal cap = makeAddr("cap");
    address internal treasury = makeAddr("treasury");
    address internal vault = makeAddr("vault");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal rival = makeAddr("rival");

    uint256 internal unit;
    uint256 internal hold;

    function setUp() public {
        gear = new MockGear(6);
        unit = 10 ** 6;
        hold = 2_000_000 * unit;

        key = new CapsMindKey(owner, address(gear), "https://example.com/key/");

        // Bootstrap key #1 to Cap (owner, no GEAR hold required)
        vm.prank(owner);
        key.mint(cap);

        props = new CapsMindProphecies(
            owner, address(gear), treasury, vault, address(key), "https://example.com/prop/"
        );

        gear.mint(alice, 1_000_000 * unit);
        gear.mint(bob, 1_000_000 * unit);
        // Cap holds 2M GEAR so he can manage eligibility / mint more keys
        gear.mint(cap, hold);
    }

    // ------------------------------------------------------------------
    // CapsMindKey
    // ------------------------------------------------------------------

    function test_bootstrapKeyOneNoHold() public view {
        assertEq(key.totalSupply(), 1);
        assertEq(key.ownerOf(1), cap);
    }

    function test_keyMintRequiresTwoMillionGearHold() public {
        // Alice has only 1M GEAR — cannot mint a key
        vm.prank(alice);
        vm.expectRevert(CapsMindKey.InsufficientGearHold.selector);
        key.mint(alice);

        // Give Alice 2M hold and mint key #2
        gear.mint(alice, hold);
        vm.prank(alice);
        uint256 id = key.mint(alice);
        assertEq(id, 2);
        assertEq(key.ownerOf(2), alice);
        // Hold check only: GEAR balance unchanged
        assertEq(gear.balanceOf(alice), 1_000_000 * unit + hold);
    }

    function test_nonOwnerCannotBootstrap() public {
        // Deploy fresh key with no supply
        CapsMindKey fresh = new CapsMindKey(owner, address(gear), "");
        vm.prank(alice);
        vm.expectRevert(CapsMindKey.BootstrapOnlyOwner.selector);
        fresh.mint(alice);
    }

    // ------------------------------------------------------------------
    // Bonding curve
    // ------------------------------------------------------------------

    function test_priceCurve() public view {
        assertEq(props.priceForMintNumber(1), 1);
        assertEq(props.priceForMintNumber(2), 2);
        assertEq(props.priceForMintNumber(3), 4);
        assertEq(props.priceForMintNumber(4), 8);
        assertEq(props.priceForMintNumber(10), 512);
        assertEq(props.priceForMintNumber(11), 1000);
        assertEq(props.priceForMintNumber(12), 1000);
        assertEq(props.priceForMintNumber(100), 1000);
    }

    // ------------------------------------------------------------------
    // Publish gate
    // ------------------------------------------------------------------

    function test_onlyEligibleKeyHolderCanPublish() public {
        vm.prank(alice);
        vm.expectRevert(CapsMindProphecies.NotPublisher.selector);
        props.publish(1, "ipfs://img", "A LINE");

        vm.prank(cap);
        uint256 id = props.publish(1, "ipfs://img", "A LINE OF PROPHECY");
        assertEq(id, 1);
        assertEq(props.prophecyCount(), 1);

        (,,,,,, uint256 usedKey) = props.getProphecy(1);
        assertEq(usedKey, 1);
    }

    function test_setPublishEligibleLocksAndUnlocks() public {
        // Mint key #2 to rival (needs 2M GEAR)
        gear.mint(rival, hold);
        vm.prank(rival);
        key.mint(rival); // key #2

        // Cap (key + 2M GEAR) locks rival's key out
        vm.prank(cap);
        props.setPublishEligible(2, false);
        assertFalse(props.isPublishEligible(2));

        vm.prank(rival);
        vm.expectRevert(CapsMindProphecies.KeyNotEligible.selector);
        props.publish(2, "ipfs://x", "NOPE");

        // Rival (also key + 2M) can unlock themselves, or Cap unlocks
        vm.prank(rival);
        props.setPublishEligible(2, true);
        assertTrue(props.isPublishEligible(2));

        vm.prank(rival);
        props.publish(2, "ipfs://y", "YES");
    }

    function test_pausePublishingByKeyPlusHold() public {
        vm.prank(cap);
        props.pausePublishing(true);
        assertTrue(props.publishingPaused());

        vm.prank(cap);
        vm.expectRevert(CapsMindProphecies.PublishingPausedError.selector);
        props.publish(1, "ipfs://a", "BLOCKED");

        // Alice (no key) cannot toggle
        vm.prank(alice);
        vm.expectRevert(CapsMindProphecies.NotEligibilityAdmin.selector);
        props.pausePublishing(false);

        // Cap unpauses
        vm.prank(cap);
        props.pausePublishing(false);
        vm.prank(cap);
        props.publish(1, "ipfs://a", "OK");
    }

    function test_eligibilityAdminRequiresKeyAndHold() public {
        // Alice has GEAR but no key
        gear.mint(alice, hold);
        vm.prank(alice);
        vm.expectRevert(CapsMindProphecies.NotEligibilityAdmin.selector);
        props.setPublishEligible(1, false);

        // Bob has neither enough GEAR nor a key
        vm.prank(bob);
        vm.expectRevert(CapsMindProphecies.NotEligibilityAdmin.selector);
        props.pausePublishing(true);
    }

    // ------------------------------------------------------------------
    // Mint bonding + split
    // ------------------------------------------------------------------

    function test_mintBondingAndSplit() public {
        vm.prank(cap);
        uint256 pid = props.publish(1, "ipfs://tablet.png", "THE ONE WHO IS HURT");

        vm.startPrank(alice);
        gear.approve(address(props), type(uint256).max);
        uint256 t1 = props.mint(pid);
        vm.stopPrank();
        assertEq(t1, 1);
        assertEq(props.prophecyOf(1), pid);
        assertEq(gear.balanceOf(treasury), (1 * unit * 9000) / 10000);
        assertEq(gear.balanceOf(vault), (1 * unit * 1000) / 10000);

        uint256 treasBefore = gear.balanceOf(treasury);
        uint256 vaultBefore = gear.balanceOf(vault);
        vm.prank(bob);
        gear.approve(address(props), type(uint256).max);
        vm.prank(bob);
        props.mint(pid);
        assertEq(gear.balanceOf(treasury) - treasBefore, (2 * unit * 9000) / 10000);
        assertEq(gear.balanceOf(vault) - vaultBefore, (2 * unit * 1000) / 10000);

        (,, uint256 minted,,, uint256 nextWhole,) = props.getProphecy(pid);
        assertEq(minted, 2);
        assertEq(nextWhole, 4);
    }

    function test_priceCapsAt1000() public {
        vm.prank(cap);
        uint256 pid = props.publish(1, "ipfs://z", "CAP TEST");

        gear.mint(alice, 10_000 * unit);
        vm.startPrank(alice);
        gear.approve(address(props), type(uint256).max);
        for (uint256 i = 0; i < 10; i++) {
            props.mint(pid);
        }
        assertEq(props.nextPriceWhole(pid), 1000);
        uint256 treasBefore = gear.balanceOf(treasury);
        props.mint(pid); // 11th mint = 1000 GEAR
        assertEq(gear.balanceOf(treasury) - treasBefore, (1000 * unit * 9000) / 10000);
        assertEq(props.nextPriceWhole(pid), 1000);
        vm.stopPrank();
    }

    function test_rejectsEmptyFields() public {
        vm.startPrank(cap);
        vm.expectRevert(CapsMindProphecies.EmptyImage.selector);
        props.publish(1, "", "text");
        vm.expectRevert(CapsMindProphecies.EmptyDescription.selector);
        props.publish(1, "ipfs://x", "");
        vm.stopPrank();
    }

    function test_ownerPauseBlocksPublishAndMint() public {
        vm.prank(cap);
        uint256 pid = props.publish(1, "ipfs://a", "ok");
        vm.prank(owner);
        props.pause();
        vm.prank(cap);
        vm.expectRevert(CapsMindProphecies.PausedError.selector);
        props.publish(1, "ipfs://b", "no");
        vm.prank(alice);
        gear.approve(address(props), type(uint256).max);
        vm.prank(alice);
        vm.expectRevert(CapsMindProphecies.PausedError.selector);
        props.mint(pid);
    }

    function test_defaultsEligible() public view {
        assertTrue(props.isPublishEligible(1));
        assertTrue(props.canPublish(cap));
        assertTrue(props.canManageEligibility(cap));
    }
}
