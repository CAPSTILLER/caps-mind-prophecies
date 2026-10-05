// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CapsMindKey} from "../src/CapsMindKey.sol";
import {CapsMindProphecies} from "../src/CapsMindProphecies.sol";

/// @dev Sepolia-ready deploy. Does nothing until Cap fills env and broadcasts.
///
/// Defaults (Cap's wallet):
///   OWNER_ADDRESS / MINT_KEY_TO → 0x6C05149910C2dd102032E44b96DA36988950B257
///
/// Env (override defaults as needed):
///   OWNER_ADDRESS       Cap's admin wallet (default: Cap wallet above)
///   TREASURY_ADDRESS    receives 90% of GEAR mint payments
///   GEAR_VAULT_ADDRESS  receives 10%
///   GEAR_TOKEN          GEAR ERC-20 (mainnet: 0x5880cD05605A549f1DAb01a53ca61Ee559244bD1;
///                       on Sepolia use a mock or Cap's test GEAR)
///   KEY_BASE_URI        leave empty for on-chain JSON; set to host off-chain metadata
///   KEY_IMAGE_URI       default: https://capsmind.gearup.wtf/key/caps-mind-key.jpg
///                       (IPFS recommended later for permanence; can also setMediaURIs post-deploy)
///   KEY_ANIMATION_URI   optional video URL; leave empty to omit animation_url from metadata
///   PROP_BASE_URI       metadata base for prophecy edition NFTs
///   MINT_KEY_TO         receives CapsMindKey #1 (default: same Cap wallet)
contract Deploy is Script {
    address internal constant CAP_WALLET = 0x6C05149910C2dd102032E44b96DA36988950B257;

    function run() external {
        address owner = vm.envOr("OWNER_ADDRESS", CAP_WALLET);
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address gearVault = vm.envAddress("GEAR_VAULT_ADDRESS");
        address gearToken = vm.envAddress("GEAR_TOKEN");
        address mintKeyTo = vm.envOr("MINT_KEY_TO", CAP_WALLET);
        string memory keyBaseUri = vm.envOr("KEY_BASE_URI", string(""));
        string memory keyImageUri =
            vm.envOr("KEY_IMAGE_URI", string("https://capsmind.gearup.wtf/key/caps-mind-key.jpg"));
        string memory keyAnimationUri = vm.envOr("KEY_ANIMATION_URI", string(""));
        string memory propBaseUri = vm.envOr("PROP_BASE_URI", string(""));

        vm.startBroadcast();

        CapsMindKey key = new CapsMindKey(owner, gearToken, keyBaseUri);
        if (bytes(keyImageUri).length > 0 || bytes(keyAnimationUri).length > 0) {
            // Only works when deployer == owner (or call setMediaURIs later as owner).
            if (msg.sender == owner) {
                key.setMediaURIs(keyImageUri, keyAnimationUri);
            }
        }
        // Bootstrap key #1: only owner can mint when totalSupply == 0 (no GEAR hold).
        if (msg.sender == owner) {
            key.mint(mintKeyTo);
        }

        CapsMindProphecies props = new CapsMindProphecies(
            owner, gearToken, treasury, gearVault, address(key), propBaseUri
        );

        vm.stopBroadcast();

        console2.log("CapsMindKey", address(key));
        console2.log("CapsMindProphecies", address(props));
        console2.log("owner", owner);
        console2.log("mintKeyTo", mintKeyTo);
        console2.log("Note: if deployer != owner, owner must call CapsMindKey.mint(MINT_KEY_TO) to bootstrap #1");
        console2.log("Media default image: https://capsmind.gearup.wtf/key/caps-mind-key.jpg (IPFS later for permanence)");
    }
}
