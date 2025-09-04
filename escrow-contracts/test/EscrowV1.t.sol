// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Import necessary for testing
import "forge-std/Test.sol";
// Import our contracts
import "../src/EscrowV1.sol";
import "../src/MockUSDC.sol";

/**
 * @title EscrowV1Test
 * @dev Comprehensive tests for the EscrowV1 contract
 */
contract EscrowV1Test is Test {
    // Declare contract variables
    EscrowV1 public escrow;
    MockUSDC public usdc;

    // Test addresses
    address public owner = address(0x123);
    address public client = address(0x456);
    address public freelancer = address(0x789);

    // Test parameters
    bytes32 constant TEST_INVOICE_ID = keccak256(abi.encode("test_invoice_1"));
    uint256 constant TEST_AMOUNT = 1000 * 10 ** 6; // 1000 USDC (6 decimals)
    uint64 constant TEST_DUE_DATE = 1735689600; // A future timestamp

    /**
     * @dev Set up the testing environment before each test
     * 1. Label addresses for better error messages
     * 2. Deploy MockUSDC and mint tokens to the client
     * 3. Deploy the EscrowV1 contract
     */
    function setUp() public {
        // Label addresses for clearer test traces
        vm.label(owner, "Owner");
        vm.label(client, "Client");
        vm.label(freelancer, "Freelancer");

        // Change the msg.sender to the owner for contract deployments
        vm.startPrank(owner);

        // Deploy Mock USDC and mint 10,000 tokens to the client
        usdc = new MockUSDC(0); // Start with 0 supply
        usdc.mint(client, 10000); // Mint 10,000 mock USDC to the client

        // Deploy the Escrow Contract, passing the Mock USDC address
        escrow = new EscrowV1(address(usdc));

        vm.stopPrank();
    }

    /**
     * @dev Test the complete happy path:
     * 1. Client approves escrow to spend USDC
     * 2. Client opens an escrow
     * 3. Freelancer marks the invoice as delivered
     * 4. Relayer releases funds after the dispute window
     * 5. Assert freelancer received the funds
     */
    function test_HappyPath() public {
        // Start acting as the client
        vm.startPrank(client);

        // 1. Client approves the escrow contract to spend TEST_AMOUNT
        usdc.approve(address(escrow), TEST_AMOUNT);
        assertEq(
            usdc.allowance(client, address(escrow)),
            TEST_AMOUNT,
            "Allowance should be set"
        );

        // 2. Client opens the escrow
        escrow.openEscrow(
            TEST_INVOICE_ID,
            freelancer,
            TEST_AMOUNT,
            TEST_DUE_DATE
        );

        // Check that the escrow was created correctly
        (
            address escrowClient,
            address escrowFreelancer,
            uint256 amount,
            ,
            ,
            EscrowV1.Status status
        ) = escrow.escrows(TEST_INVOICE_ID);
        assertEq(escrowClient, client, "Client should match");
        assertEq(escrowFreelancer, freelancer, "Freelancer should match");
        assertEq(amount, TEST_AMOUNT, "Amount should match");
        assertEq(
            uint256(status),
            uint256(EscrowV1.Status.Funded),
            "Status should be Funded"
        );

        // Check USDC was transferred from client to contract
        assertEq(
            usdc.balanceOf(client),
            9000 * 10 ** 6,
            "Client balance should be reduced by 1000 USDC"
        ); // 10000 - 1000
        assertEq(
            usdc.balanceOf(address(escrow)),
            TEST_AMOUNT,
            "Escrow contract should hold the USDC"
        );

        vm.stopPrank();

        // 3. Freelancer marks the invoice as delivered
        vm.prank(freelancer);
        escrow.markDelivered(TEST_INVOICE_ID);

        // Fast-forward time: move 6 days into the future (past the 5-day dispute window)
        vm.warp(block.timestamp + 6 days);

        // 4. Anyone (e.g., the relayer) can now release the funds
        escrow.releaseToFreelancer(TEST_INVOICE_ID);

        // 5. Assertions: Freelancer should have received the funds
        assertEq(
            usdc.balanceOf(freelancer),
            TEST_AMOUNT,
            "Freelancer should have received the USDC"
        );
        assertEq(
            usdc.balanceOf(address(escrow)),
            0,
            "Escrow contract balance should be zero"
        );

        // Check the escrow status is now 'Released'
        (, , , , , EscrowV1.Status finalStatus) = escrow.escrows(
            TEST_INVOICE_ID
        );
        assertEq(
            uint256(finalStatus),
            uint256(EscrowV1.Status.Released),
            "Final status should be Released"
        );
    }

    /**
     * @dev Test that funds can be released automatically after the due date,
     * even if the invoice was never marked as delivered.
     */
    function test_ReleaseAfterDueDate() public {
        vm.startPrank(client);
        usdc.approve(address(escrow), TEST_AMOUNT);
        escrow.openEscrow(
            TEST_INVOICE_ID,
            freelancer,
            TEST_AMOUNT,
            TEST_DUE_DATE
        );
        vm.stopPrank();

        // Fast-forward time to 1 second after the due date
        vm.warp(TEST_DUE_DATE + 1);

        // Release the funds
        escrow.releaseToFreelancer(TEST_INVOICE_ID);

        // Freelancer should be paid
        assertEq(
            usdc.balanceOf(freelancer),
            TEST_AMOUNT,
            "Freelancer should be paid after due date"
        );
    }

    /**
     * @dev Test that the owner can pause the contract to stop all actions.
     */
    function test_PauseFunctionality() public {
        // Owner pauses the contract
        vm.prank(owner);
        escrow.setPaused(true);

        // Try to open an escrow as the client - it should fail
        vm.startPrank(client);
        usdc.approve(address(escrow), TEST_AMOUNT);

        vm.expectRevert("PAUSED");
        escrow.openEscrow(
            TEST_INVOICE_ID,
            freelancer,
            TEST_AMOUNT,
            TEST_DUE_DATE
        );
        vm.stopPrank();
    }
}
