// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MockUSDC.sol";
import "../src/EscrowV1.sol";

contract DeployScript is Script {
    function run() external {
        // Get the private key from the environment variable
        uint256 deployerPrivateKey = vm.envUint("POLYGON_AMOY_PRIVATE_KEY");
        // Start broadcasting transactions from the deployer address
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy MockUSDC and mint some tokens
        MockUSDC mockUsdc = new MockUSDC(1_000_000); // Mint 1M initial supply to deployer
        console.log("MockUSDC deployed at:", address(mockUsdc));

        // 2. Deploy the EscrowV1 contract, passing the MockUSDC address
        EscrowV1 escrow = new EscrowV1(address(mockUsdc));
        console.log("EscrowV1 deployed at:", address(escrow));

        vm.stopBroadcast();
    }
}
