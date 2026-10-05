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

    uint256 internal unit;

    function setUp() public {
        gear = new MockGear(6);
        unit = 10 ** 6;
        key = new CapsMindKey(owner, "https://example.com/key/");
        vm.prank(owner);
        key.mint(cap); // tokenId 1 to Cap

        props = new CapsMindProphecies(
            owner, address(gear), treasury, vault, address(key), 0, "https://example.com/prop/"
        );

        gear.mint(alice, 1_000_000 * unit);
        gear.mint(bob, 1_000_000 * unit);
    }

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

    function test_onlyKeyHolderCanPublish() public {
        vm.prank(alice);
        vm.expectRevert(CapsMindProphecies.NotPublisher.selector);
        props.publish("ipfs://img", "A LINE");

        vm.prank(cap);
        uint256 id = props.publish("ipfs://img", "A LINE OF PROPHECY");
        assertEq(id, 1);
        assertEq(props.prophecyCount(), 1);
    }

    function test_specificTokenIdGate() public {
        // Retarget gate to require key token id 1 specifically
        vm.prank(owner);
        props.setPublisherGate(address(key), 1);

        address stranger = makeAddr("stranger");
        vm.prank(owner);
        key.mint(stranger); // token 2

        vm.prank(stranger);
        vm.expectRevert(CapsMindProphecies.NotPublisher.selector);
        props.publish("ipfs://x", "NOPE");

        vm.prank(cap);
        props.publish("ipfs://y", "YES");
    }

    function test_mintBondingAndSplit() public {
        vm.prank(cap);
        uint256 pid = props.publish("ipfs://tablet.png", "THE ONE WHO IS HURT");

        // first mint = 1 GEAR
        vm.startPrank(alice);
        gear.approve(address(props), type(uint256).max);
        uint256 t1 = props.mint(pid);
        vm.stopPrank();
        assertEq(t1, 1);
        assertEq(props.prophecyOf(1), pid);
        assertEq(gear.balanceOf(treasury), (1 * unit * 9000) / 10000);
        assertEq(gear.balanceOf(vault), (1 * unit * 1000) / 10000);

        // second mint = 2 GEAR
        uint256 treasBefore = gear.balanceOf(treasury);
        uint256 vaultBefore = gear.balanceOf(vault);
        vm.prank(bob);
        gear.approve(address(props), type(uint256).max);
        vm.prank(bob);
        props.mint(pid);
        assertEq(gear.balanceOf(treasury) - treasBefore, (2 * unit * 9000) / 10000);
        assertEq(gear.balanceOf(vault) - vaultBefore, (2 * unit * 1000) / 10000);

        (,, uint256 minted,,, uint256 nextWhole) = props.getProphecy(pid);
        assertEq(minted, 2);
        assertEq(nextWhole, 4);
    }

    function test_priceCapsAt1000() public {
        vm.prank(cap);
        uint256 pid = props.publish("ipfs://z", "CAP TEST");

        // Fast-forward minted count by minting 10 times (prices 1..512), then 11th is 1000
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
        props.publish("", "text");
        vm.expectRevert(CapsMindProphecies.EmptyDescription.selector);
        props.publish("ipfs://x", "");
        vm.stopPrank();
    }

    function test_pauseBlocksPublishAndMint() public {
        vm.prank(cap);
        uint256 pid = props.publish("ipfs://a", "ok");
        vm.prank(owner);
        props.pause();
        vm.prank(cap);
        vm.expectRevert(CapsMindProphecies.PausedError.selector);
        props.publish("ipfs://b", "no");
        vm.prank(alice);
        gear.approve(address(props), type(uint256).max);
        vm.prank(alice);
        vm.expectRevert(CapsMindProphecies.PausedError.selector);
        props.mint(pid);
    }
}
