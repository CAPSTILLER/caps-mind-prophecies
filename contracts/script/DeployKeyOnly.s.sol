// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {CapsMindKey} from "../src/CapsMindKey.sol";

/// @dev Deploy only CapsMindKey, then bootstrap mint token 1 to Cap.
/// Defaults OWNER_ADDRESS / MINT_KEY_TO to Cap's wallet.
contract DeployKeyOnly is Script {
    address internal constant CAP_WALLET = 0x6C05149910C2dd102032E44b96DA36988950B257;

    function run() external {
        address owner = vm.envOr("OWNER_ADDRESS", CAP_WALLET);
        address gearToken = vm.envAddress("GEAR_TOKEN");
        address mintKeyTo = vm.envOr("MINT_KEY_TO", CAP_WALLET);
        string memory keyBaseUri = vm.envOr("KEY_BASE_URI", string(""));
        string memory keyImageUri =
            vm.envOr("KEY_IMAGE_URI", string("https://capsmind.gearup.wtf/key/caps-mind-key.jpg"));
        string memory keyAnimationUri = vm.envOr("KEY_ANIMATION_URI", string(""));

        vm.startBroadcast();
        CapsMindKey key = new CapsMindKey(owner, gearToken, keyBaseUri);
        if (msg.sender == owner) {
            if (bytes(keyImageUri).length > 0 || bytes(keyAnimationUri).length > 0) {
                key.setMediaURIs(keyImageUri, keyAnimationUri);
            }
            key.mint(mintKeyTo);
        }
        vm.stopBroadcast();

        console2.log("CapsMindKey", address(key));
        console2.log("owner", owner);
        console2.log("mintKeyTo", mintKeyTo);
        console2.log("Note: if deployer != owner, owner must call CapsMindKey.mint(MINT_KEY_TO)");
        console2.log("Media default image: https://capsmind.gearup.wtf/key/caps-mind-key.jpg (IPFS later for permanence)");
    }
}
