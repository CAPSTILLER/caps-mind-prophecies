// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CapsMindKey} from "../src/CapsMindKey.sol";
import {MockGear} from "./MockGear.sol";

contract CapsMindKeyTest is Test {
    /// @dev Cap's owner wallet — bootstrap destination for key #1.
    address internal constant CAP = 0x6C05149910C2dd102032E44b96DA36988950B257;

    CapsMindKey internal key;
    MockGear internal gear;

    address internal alice = makeAddr("alice");
    uint256 internal unit;
    uint256 internal hold;

    function setUp() public {
        gear = new MockGear(6);
        unit = 10 ** 6;
        hold = 2_000_000 * unit;
        // Empty baseURI → on-chain JSON metadata path
        key = new CapsMindKey(CAP, address(gear), "");
    }

    function test_capOwnerConstantMatches() public view {
        assertEq(key.CAP_OWNER(), CAP);
        assertEq(key.owner(), CAP);
    }

    function test_bootstrapKeyOneToCapWalletNoGearHold() public {
        // Cap has zero GEAR — bootstrap still works (owner-only, no hold).
        assertEq(gear.balanceOf(CAP), 0);

        vm.prank(CAP);
        uint256 id = key.mint(CAP);

        assertEq(id, 1);
        assertEq(key.totalSupply(), 1);
        assertEq(key.ownerOf(1), CAP);
        // After bootstrap, Cap needs 2M GEAR to mint another key
        assertFalse(key.canMintKey(CAP));
        gear.mint(CAP, hold);
        assertTrue(key.canMintKey(CAP));
    }

    function test_nonOwnerCannotBootstrapWithCapAsOwner() public {
        vm.prank(alice);
        vm.expectRevert(CapsMindKey.BootstrapOnlyOwner.selector);
        key.mint(alice);

        // Even minting *to* Cap fails if caller is not owner
        vm.prank(alice);
        vm.expectRevert(CapsMindKey.BootstrapOnlyOwner.selector);
        key.mint(CAP);
    }

    function test_onchainTokenURIIncludesImageAndAnimation() public {
        vm.prank(CAP);
        key.mint(CAP);

        // Before media set: empty image / animation_url fields still valid JSON shape
        string memory uriEmpty = key.tokenURI(1);
        assertTrue(bytes(uriEmpty).length > 0);
        assertTrue(_startsWith(uriEmpty, "data:application/json;base64,"));

        vm.prank(CAP);
        key.setMediaURIs(
            "ipfs://TODO_POSTER_OR_STILL_URI",
            "ipfs://TODO_VIDEO_URI"
        );
        assertEq(key.imageURI(), "ipfs://TODO_POSTER_OR_STILL_URI");
        assertEq(key.animationURI(), "ipfs://TODO_VIDEO_URI");

        string memory uri = key.tokenURI(1);
        assertTrue(_startsWith(uri, "data:application/json;base64,"));
        // Decode base64 payload and check fields are present
        string memory json = string(_decodeDataUriJson(uri));
        assertTrue(_contains(json, '"name":"CAPs Mind Key #1"'));
        assertTrue(_contains(json, '"image":"ipfs://TODO_POSTER_OR_STILL_URI"'));
        assertTrue(_contains(json, '"animation_url":"ipfs://TODO_VIDEO_URI"'));
        assertTrue(_contains(json, "description"));
    }

    function test_baseURIOverrideSkipsOnchainJson() public {
        vm.prank(CAP);
        key.mint(CAP);

        vm.prank(CAP);
        key.setBaseURI("https://example.com/key/");
        assertEq(key.tokenURI(1), "https://example.com/key/1");
    }

    function test_onlyOwnerCanSetMedia() public {
        vm.prank(alice);
        vm.expectRevert(CapsMindKey.NotOwner.selector);
        key.setMediaURIs("ipfs://x", "ipfs://y");
    }

    // --- helpers ---

    function _startsWith(string memory s, string memory prefix) internal pure returns (bool) {
        bytes memory a = bytes(s);
        bytes memory b = bytes(prefix);
        if (a.length < b.length) return false;
        for (uint256 i = 0; i < b.length; i++) {
            if (a[i] != b[i]) return false;
        }
        return true;
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length == 0 || h.length < n.length) return false;
        for (uint256 i = 0; i <= h.length - n.length; i++) {
            bool ok = true;
            for (uint256 j = 0; j < n.length; j++) {
                if (h[i + j] != n[j]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return true;
        }
        return false;
    }

    /// @dev Strip `data:application/json;base64,` and base64-decode (test-only, small payloads).
    function _decodeDataUriJson(string memory uri) internal pure returns (bytes memory) {
        bytes memory u = bytes(uri);
        // prefix length = 29 for "data:application/json;base64,"
        require(u.length > 29, "uri short");
        bytes memory b64 = new bytes(u.length - 29);
        for (uint256 i = 29; i < u.length; i++) {
            b64[i - 29] = u[i];
        }
        return _base64Decode(b64);
    }

    function _base64Decode(bytes memory data) internal pure returns (bytes memory) {
        if (data.length == 0) return new bytes(0);
        // Pad length must be multiple of 4
        require(data.length % 4 == 0, "b64 len");

        uint256 decodedLen = (data.length / 4) * 3;
        if (data[data.length - 1] == "=") decodedLen--;
        if (data[data.length - 2] == "=") decodedLen--;

        bytes memory result = new bytes(decodedLen);
        uint256 outIdx;
        for (uint256 i = 0; i < data.length; i += 4) {
            uint256 n = (_b64Val(data[i]) << 18) | (_b64Val(data[i + 1]) << 12)
                | (_b64Val(data[i + 2]) << 6) | _b64Val(data[i + 3]);
            if (outIdx < decodedLen) result[outIdx++] = bytes1(uint8(n >> 16));
            if (outIdx < decodedLen) result[outIdx++] = bytes1(uint8(n >> 8));
            if (outIdx < decodedLen) result[outIdx++] = bytes1(uint8(n));
        }
        return result;
    }

    function _b64Val(bytes1 c) internal pure returns (uint256) {
        uint8 ch = uint8(c);
        if (ch >= 65 && ch <= 90) return ch - 65; // A-Z
        if (ch >= 97 && ch <= 122) return ch - 71; // a-z
        if (ch >= 48 && ch <= 57) return ch + 4; // 0-9
        if (ch == 43) return 62; // +
        if (ch == 47) return 63; // /
        if (ch == 61) return 0; // =
        revert("bad b64");
    }
}
