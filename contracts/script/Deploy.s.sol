// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CapsMindKey} from "../src/CapsMindKey.sol";
import {CapsMindProphecies} from "../src/CapsMindProphecies.sol";

/// @dev Sepolia-ready deploy. Does nothing until Cap fills env and broadcasts.
///
/// Env:
///   OWNER_ADDRESS       Cap's admin / Safe
///   TREASURY_ADDRESS    receives 90% of GEAR mint payments
///   GEAR_VAULT_ADDRESS  receives 10%
///   GEAR_TOKEN          GEAR ERC-20 (mainnet: 0x5880cD05605A549f1DAb01a53ca61Ee559244bD1;
///                       on Sepolia use a mock or Cap's test GEAR)
///   KEY_BASE_URI        metadata base for CapsMindKey (optional, default empty)
///   PROP_BASE_URI       metadata base for prophecy edition NFTs
///   MINT_KEY_TO         address that receives CapsMindKey #1 (usually Cap)
///   PUBLISHER_TOKEN_ID  0 = any key in collection; else require that token id
contract Deploy is Script {
    function run() external {
        address owner = vm.envAddress("OWNER_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address gearVault = vm.envAddress("GEAR_VAULT_ADDRESS");
        address gearToken = vm.envAddress("GEAR_TOKEN");
        address mintKeyTo = vm.envAddress("MINT_KEY_TO");
        uint256 publisherTokenId = vm.envOr("PUBLISHER_TOKEN_ID", uint256(0));
        string memory keyBaseUri = vm.envOr("KEY_BASE_URI", string(""));
        string memory propBaseUri = vm.envOr("PROP_BASE_URI", string(""));

        vm.startBroadcast();

        CapsMindKey key = new CapsMindKey(owner, keyBaseUri);
        // Deployer is not owner; owner must mint. If deployer == owner, mint now.
        if (msg.sender == owner) {
            key.mint(mintKeyTo);
        }

        CapsMindProphecies props = new CapsMindProphecies(
            owner, gearToken, treasury, gearVault, address(key), publisherTokenId, propBaseUri
        );

        vm.stopBroadcast();

        console2.log("CapsMindKey", address(key));
        console2.log("CapsMindProphecies", address(props));
        console2.log("publisherTokenId", publisherTokenId);
        console2.log("owner", owner);
        console2.log("Note: if deployer != owner, owner must call CapsMindKey.mint(MINT_KEY_TO)");
    }
}
