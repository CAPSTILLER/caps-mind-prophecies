// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CapsMindProphecies} from "../src/CapsMindProphecies.sol";

/// @dev Deploys CapsMindProphecies (Prophecy Tablets) against the CAPs Mind key that Bankr already
///      deployed on Base. Does nothing until someone fills env and broadcasts.
///
/// Env:
///   CAPS_MIND_KEY       default 0x00635ca44339c7c194ef5bc87bf2cd6df04a666d (Base)
///   GEAR_TOKEN          default 0x5880cD05605A549f1DAb01a53ca61Ee559244bD1 (Base, 6 decimals)
///   TREASURY_ADDRESS    default 0xCF1ac98565DA846E8263604b49C1276Ed78A0981 (receives 90%)
///   GEAR_VAULT_ADDRESS  default 0x41ca72E18f7F96F8F2b7be524AC8346e06bCB3AB (GearVault, receives 10%)
///   OWNER_ADDRESS       default 0x1a72f7314297B0b8f6808A9248969A8108F49890
contract Deploy is Script {
    address internal constant CAPS_MIND_KEY = 0x00635CA44339C7c194eF5bc87Bf2cd6df04a666D;
    address internal constant GEAR = 0x5880cD05605A549f1DAb01a53ca61Ee559244bD1;
    address internal constant TREASURY = 0xCF1ac98565DA846E8263604b49C1276Ed78A0981;
    address internal constant GEAR_VAULT = 0x41ca72E18f7F96F8F2b7be524AC8346e06bCB3AB;
    address internal constant OWNER = 0x1a72f7314297B0b8f6808A9248969A8108F49890;

    function run() external {
        address key = vm.envOr("CAPS_MIND_KEY", CAPS_MIND_KEY);
        address gearToken = vm.envOr("GEAR_TOKEN", GEAR);
        address treasury = vm.envOr("TREASURY_ADDRESS", TREASURY);
        address gearVault = vm.envOr("GEAR_VAULT_ADDRESS", GEAR_VAULT);
        address owner = vm.envOr("OWNER_ADDRESS", OWNER);

        vm.startBroadcast();
        CapsMindProphecies props = new CapsMindProphecies(key, gearToken, treasury, gearVault, owner);
        vm.stopBroadcast();

        console2.log("CapsMindProphecies", address(props));
        console2.log("capsMindKey", key);
        console2.log("owner", owner);
    }
}
