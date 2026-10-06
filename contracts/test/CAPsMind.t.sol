// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CAPsMind} from "../src/CAPsMind.sol";
import {MockGear} from "./MockGear.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

contract ReentrantMinter is IERC721Receiver {
    CAPsMind internal immutable nft;
    bool internal tried;
    bool public reentryBlocked;

    constructor(CAPsMind nft_) {
        nft = nft_;
    }

    function go() external {
        nft.mint();
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        if (!tried) {
            tried = true;
            try nft.mint() {
                reentryBlocked = false;
            } catch {
                reentryBlocked = true;
            }
        }
        return IERC721Receiver.onERC721Received.selector;
    }
}

contract CAPsMindTest is Test {
    address internal constant CAP = 0x6C05149910C2dd102032E44b96DA36988950B257;
    address internal constant GEAR = 0x5880cD05605A549f1DAb01a53ca61Ee559244bD1;
    string internal constant DEFAULT_URI = "https://capsmind.gearup.wtf/key/caps-mind-key.json";
    uint256 internal constant HOLD = 2_000_000 * 1e6;

    event MetadataUpdate(uint256 _tokenId);
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);
    event DefaultTokenURIUpdated(string newDefaultURI);

    CAPsMind internal nft;
    MockGear internal gear;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        // Put a mock GEAR at the hardcoded Base mainnet address.
        MockGear impl = new MockGear(6);
        vm.etch(GEAR, address(impl).code);
        gear = MockGear(GEAR);

        nft = new CAPsMind(CAP, "", DEFAULT_URI);
    }

    function _genesis() internal returns (uint256) {
        vm.prank(CAP);
        return nft.ownerGenesisMint("");
    }

    // ----- deploy settings -----

    function test_constructorSettings() public view {
        assertEq(nft.name(), "CAPs Mind");
        assertEq(nft.symbol(), "CAPMIND");
        assertEq(nft.owner(), CAP);
        assertEq(address(nft.GEAR_TOKEN()), GEAR);
        assertEq(nft.GEAR_REQUIRED(), HOLD);
        assertEq(nft.baseURI(), "");
        assertEq(nft.defaultTokenURI(), DEFAULT_URI);
        assertEq(nft.nextTokenId(), 1);
        assertEq(nft.totalMinted(), 0);
        assertFalse(nft.firstMintCompleted());
    }

    function test_supportsInterfaces() public view {
        assertTrue(nft.supportsInterface(0x80ac58cd)); // ERC721
        assertTrue(nft.supportsInterface(0x5b5e139f)); // ERC721Metadata
        assertTrue(nft.supportsInterface(0x49064906)); // ERC4906
        assertTrue(nft.supportsInterface(0x01ffc9a7)); // ERC165
    }

    // ----- genesis -----

    function test_genesisOwnerOnlyNoGear() public {
        assertEq(gear.balanceOf(CAP), 0);
        uint256 id = _genesis();
        assertEq(id, 1);
        assertEq(nft.ownerOf(1), CAP);
        assertTrue(nft.firstMintCompleted());
        assertTrue(nft.hasMinted(CAP));
        assertEq(nft.totalMinted(), 1);
        assertEq(nft.nextTokenId(), 2);
    }

    function test_genesisRevertsForNonOwner() public {
        gear.mint(alice, HOLD);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        nft.ownerGenesisMint("");
    }

    function test_genesisOnlyOnce() public {
        _genesis();
        vm.prank(CAP);
        vm.expectRevert(CAPsMind.GenesisAlreadyMinted.selector);
        nft.ownerGenesisMint("");
    }

    function test_genesisWithOptionalCustomURI() public {
        vm.prank(CAP);
        nft.ownerGenesisMint("ipfs://genesis.json");
        assertEq(nft.tokenURI(1), "ipfs://genesis.json");
    }

    // ----- public mint -----

    function test_mintBeforeGenesisReverts() public {
        gear.mint(alice, HOLD);
        vm.prank(alice);
        vm.expectRevert(CAPsMind.GenesisNotMinted.selector);
        nft.mint();
    }

    function test_mintNeeds2MGear() public {
        _genesis();
        gear.mint(alice, HOLD - 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CAPsMind.InsufficientGearBalance.selector, HOLD - 1, HOLD));
        nft.mint();

        gear.mint(alice, 1);
        vm.prank(alice);
        uint256 id = nft.mint();
        assertEq(id, 2);
        assertEq(nft.ownerOf(2), alice);
        // Hold only: GEAR is not spent.
        assertEq(gear.balanceOf(alice), HOLD);
    }

    function test_mintWithZeroGearReverts() public {
        _genesis();
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(CAPsMind.InsufficientGearBalance.selector, 0, HOLD));
        nft.mint();
    }

    function test_onePerWallet() public {
        _genesis();
        gear.mint(alice, HOLD * 3);
        vm.prank(alice);
        nft.mint();
        vm.prank(alice);
        vm.expectRevert(CAPsMind.AlreadyMinted.selector);
        nft.mint();

        // Owner already minted genesis, so even with GEAR the owner cannot mint again.
        gear.mint(CAP, HOLD);
        vm.prank(CAP);
        vm.expectRevert(CAPsMind.AlreadyMinted.selector);
        nft.mint();
    }

    function test_onePerWalletEvenAfterTransferringKeyAway() public {
        _genesis();
        gear.mint(alice, HOLD);
        vm.prank(alice);
        nft.mint();
        vm.prank(alice);
        nft.transferFrom(alice, bob, 2);
        vm.prank(alice);
        vm.expectRevert(CAPsMind.AlreadyMinted.selector);
        nft.mint();
    }

    function test_holdOnlyCheckAsBankrWrote() public {
        // Cap wants a balance check at mint time only (no staking or transfer lock).
        _genesis();
        gear.mint(alice, HOLD);
        vm.prank(alice);
        nft.mint();
        vm.prank(alice);
        gear.transfer(bob, HOLD);
        vm.prank(bob);
        assertEq(nft.mint(), 3);
    }

    function test_sequentialIds() public {
        _genesis();
        address[3] memory users = [alice, bob, makeAddr("carol")];
        for (uint256 i; i < users.length; i++) {
            gear.mint(users[i], HOLD);
            vm.prank(users[i]);
            assertEq(nft.mint(), i + 2);
        }
        assertEq(nft.totalMinted(), 4);
        assertEq(nft.nextTokenId(), 5);
    }

    function test_reentrantReceiverCannotDoubleMint() public {
        _genesis();
        ReentrantMinter r = new ReentrantMinter(nft);
        gear.mint(address(r), HOLD);
        r.go();
        assertTrue(r.reentryBlocked());
        assertEq(nft.balanceOf(address(r)), 1);
        assertEq(nft.totalMinted(), 2);
    }

    // ----- minters cannot set art -----

    function test_publicMintTakesNoURI() public {
        _genesis();
        gear.mint(alice, HOLD);

        // Bankr's old signature mint(string) no longer exists.
        vm.prank(alice);
        (bool ok,) = address(nft).call(abi.encodeWithSignature("mint(string)", "ipfs://evil.json"));
        assertFalse(ok);
        assertFalse(nft.hasMinted(alice));

        vm.prank(alice);
        nft.mint();
        assertEq(nft.tokenURI(2), DEFAULT_URI);
    }

    function test_nonOwnerCannotSetAnyURI() public {
        _genesis();
        gear.mint(alice, HOLD);
        vm.prank(alice);
        nft.mint();

        bytes memory err = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice);

        vm.prank(alice);
        vm.expectRevert(err);
        nft.setTokenURI(2, "ipfs://evil.json");

        vm.prank(alice);
        vm.expectRevert(err);
        nft.setBaseURI("ipfs://evil/");

        vm.prank(alice);
        vm.expectRevert(err);
        nft.setDefaultTokenURI("ipfs://evil.json");

        assertEq(nft.tokenURI(2), DEFAULT_URI);
    }

    // ----- owner metadata controls + tokenURI fallback order -----

    function test_tokenURIDefaultsToCapArt() public {
        _genesis();
        assertEq(nft.tokenURI(1), DEFAULT_URI);
    }

    function test_tokenURIRevertsForNonexistent() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 1));
        nft.tokenURI(1);
    }

    function test_ownerCanSetDefaultURI() public {
        _genesis();
        vm.expectEmit(address(nft));
        emit DefaultTokenURIUpdated("ipfs://new-default.json");
        vm.expectEmit(address(nft));
        emit BatchMetadataUpdate(1, 1);
        vm.prank(CAP);
        nft.setDefaultTokenURI("ipfs://new-default.json");
        assertEq(nft.defaultTokenURI(), "ipfs://new-default.json");
        assertEq(nft.tokenURI(1), "ipfs://new-default.json");
    }

    function test_ownerCanSetBaseURI() public {
        _genesis();
        vm.prank(CAP);
        nft.setBaseURI("ipfs://base/");
        assertEq(nft.baseURI(), "ipfs://base/");
        assertEq(nft.tokenURI(1), "ipfs://base/1");
    }

    function test_ownerCanSetTokenURI() public {
        _genesis();
        vm.expectEmit(address(nft));
        emit MetadataUpdate(1);
        vm.prank(CAP);
        nft.setTokenURI(1, "ipfs://one.json");
        assertEq(nft.tokenURI(1), "ipfs://one.json");
    }

    function test_tokenURIFallbackOrder() public {
        _genesis();
        gear.mint(alice, HOLD);
        vm.prank(alice);
        nft.mint();

        // 3. default
        assertEq(nft.tokenURI(1), DEFAULT_URI);
        assertEq(nft.tokenURI(2), DEFAULT_URI);

        // 2. base + id beats default
        vm.prank(CAP);
        nft.setBaseURI("https://meta.example/");
        assertEq(nft.tokenURI(1), "https://meta.example/1");
        assertEq(nft.tokenURI(2), "https://meta.example/2");

        // 1. per-token URI beats base, returned exactly as set (no base prefix)
        vm.prank(CAP);
        nft.setTokenURI(2, "ipfs://two.json");
        assertEq(nft.tokenURI(2), "ipfs://two.json");
        assertEq(nft.tokenURI(1), "https://meta.example/1");

        // Clearing base drops back to default, per-token still wins
        vm.prank(CAP);
        nft.setBaseURI("");
        assertEq(nft.tokenURI(1), DEFAULT_URI);
        assertEq(nft.tokenURI(2), "ipfs://two.json");

        // Clearing the per-token URI falls back to default
        vm.prank(CAP);
        nft.setTokenURI(2, "");
        assertEq(nft.tokenURI(2), DEFAULT_URI);
    }

    function test_newOwnerControlsURIsAfterTransfer() public {
        _genesis();
        vm.prank(CAP);
        nft.transferOwnership(bob);

        vm.prank(CAP);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, CAP));
        nft.setDefaultTokenURI("x");

        vm.prank(bob);
        nft.setDefaultTokenURI("ipfs://bob.json");
        assertEq(nft.tokenURI(1), "ipfs://bob.json");
    }

    // ----- canMint view -----

    function test_canMintView() public {
        (bool ok,, string memory reason) = nft.canMint(CAP);
        assertTrue(ok);
        assertEq(reason, "Eligible for genesis mint #1");

        (ok,, reason) = nft.canMint(alice);
        assertFalse(ok);
        assertEq(reason, "Genesis mint #1 not yet completed by owner");

        _genesis();

        (ok,, reason) = nft.canMint(CAP);
        assertFalse(ok);
        assertEq(reason, "Wallet has already minted");

        uint256 bal;
        (ok, bal, reason) = nft.canMint(alice);
        assertFalse(ok);
        assertEq(bal, 0);
        assertEq(reason, "Insufficient GEAR tokens (needs 2,000,000)");

        gear.mint(alice, HOLD);
        (ok, bal, reason) = nft.canMint(alice);
        assertTrue(ok);
        assertEq(bal, HOLD);
        assertEq(reason, "Eligible to mint");
    }

    function testFuzz_mintThreshold(uint256 amount) public {
        amount = bound(amount, 0, HOLD * 10);
        _genesis();
        gear.mint(alice, amount);
        vm.prank(alice);
        if (amount < HOLD) {
            vm.expectRevert(abi.encodeWithSelector(CAPsMind.InsufficientGearBalance.selector, amount, HOLD));
            nft.mint();
        } else {
            assertEq(nft.mint(), 2);
        }
    }
}
