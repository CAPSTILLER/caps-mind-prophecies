// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CapsMindKey} from "../src/CapsMindKey.sol";

/// @dev Deploy only CapsMindKey, then mint token 1 to Cap. Use when wiring an existing
///      CapsMindProphecies publisher gate later via setPublisherGate.
contract DeployKeyOnly is Script {
    function run() external {
        address owner = vm.envAddress("OWNER_ADDRESS");
        address mintKeyTo = vm.envAddress("MINT_KEY_TO");
        string memory keyBaseUri = vm.envOr("KEY_BASE_URI", string(""));

        vm.startBroadcast();
        CapsMindKey key = new CapsMindKey(owner, keyBaseUri);
        if (msg.sender == owner) {
            key.mint(mintKeyTo);
        }
        vm.stopBroadcast();

        console2.log("CapsMindKey", address(key));
        console2.log("mintKeyTo", mintKeyTo);
    }
}
