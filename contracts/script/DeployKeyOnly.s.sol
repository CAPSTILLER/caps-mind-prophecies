// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CapsMindKey} from "../src/CapsMindKey.sol";

/// @dev Deploy only CapsMindKey, then bootstrap mint token 1 to Cap.
contract DeployKeyOnly is Script {
    function run() external {
        address owner = vm.envAddress("OWNER_ADDRESS");
        address gearToken = vm.envAddress("GEAR_TOKEN");
        address mintKeyTo = vm.envAddress("MINT_KEY_TO");
        string memory keyBaseUri = vm.envOr("KEY_BASE_URI", string(""));

        vm.startBroadcast();
        CapsMindKey key = new CapsMindKey(owner, gearToken, keyBaseUri);
        if (msg.sender == owner) {
            key.mint(mintKeyTo);
        }
        vm.stopBroadcast();

        console2.log("CapsMindKey", address(key));
        console2.log("mintKeyTo", mintKeyTo);
        console2.log("Note: if deployer != owner, owner must call CapsMindKey.mint(MINT_KEY_TO)");
    }
}
