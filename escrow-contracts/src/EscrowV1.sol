// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// We'll use OpenZeppelin's SafeERC20 for safer USDC transfers
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract EscrowV1 {
    using SafeERC20 for IERC20;

    // USDC address will be set in the constructor
    IERC20 public immutable usdc;

    // Define the possible states of an escrow
    enum Status {
        None,
        Funded,
        Delivered,
        Disputed,
        Released,
        Refunded
    }

    // The data structure for each invoice escrow
    struct Escrow {
        address client;
        address freelancer;
        uint256 amount;
        uint64 dueAt; // UNIX timestamp
        uint64 deliveredAt; // 0 if not delivered
        Status status;
    }

    // Events to log important actions on the blockchain
    event EscrowOpened(
        bytes32 indexed invoiceId,
        address indexed client,
        address indexed freelancer,
        uint256 amount,
        uint64 dueAt
    );
    event MarkedDelivered(
        bytes32 indexed invoiceId,
        address indexed by,
        uint64 at
    );
    event Disputed(
        bytes32 indexed invoiceId,
        address indexed by,
        uint64 at,
        string reasonURI
    );
    event Released(
        bytes32 indexed invoiceId,
        address to,
        uint256 amount,
        uint64 at
    );
    event Refunded(
        bytes32 indexed invoiceId,
        address to,
        uint256 amount,
        uint64 at
    );

    // The owner of the contract (can pause and set dispute window)
    address public owner;
    bool public paused;
    uint64 public disputeWindow = 5 days;

    mapping(address => bytes32[]) public userEscrows;
    mapping(bytes32 => bool) public escrowExists;

    // Mapping from invoice ID to its Escrow data
    mapping(bytes32 => Escrow) public escrows;

    // Modifier to restrict function access to only the owner
    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    // Modifier to stop all actions if the contract is paused
    modifier notPaused() {
        require(!paused, "PAUSED");
        _;
    }

    // Constructor sets the USDC address and the owner
    constructor(address _usdc) {
        require(_usdc != address(0), "USDC_ZERO");
        usdc = IERC20(_usdc);
        owner = msg.sender;
    }

    // --- Administration Functions --- //
    function setPaused(bool _p) external onlyOwner {
        paused = _p;
    }

    function setDisputeWindow(uint64 _w) external onlyOwner {
        require(_w >= 1 days, "SMALL");
        disputeWindow = _w;
    }

    // --- Core Business Logic --- //

    // Called by the client to open and fund an escrow
    function openEscrow(
        bytes32 _invoiceId,
        address _freelancer,
        uint256 _amount,
        uint64 _dueAt
    ) external notPaused {
        require(_invoiceId != bytes32(0), "BAD_ID");
        require(escrows[_invoiceId].status == Status.None, "EXISTS");
        require(_freelancer != address(0), "BAD_FREELANCER");
        require(_amount > 0, "BAD_AMT");
        require(_dueAt > block.timestamp, "BAD_DUE");

        escrows[_invoiceId] = Escrow({
            client: msg.sender,
            freelancer: _freelancer,
            amount: _amount,
            dueAt: _dueAt,
            deliveredAt: 0,
            status: Status.Funded
        });

        escrowExists[_invoiceId] = true;

        // Track for both client and freelancer
        userEscrows[msg.sender].push(_invoiceId);
        userEscrows[_freelancer].push(_invoiceId);

        usdc.safeTransferFrom(msg.sender, address(this), _amount);
        emit EscrowOpened(_invoiceId, msg.sender, _freelancer, _amount, _dueAt);
    }

    function getEscrowsByAddress(
        address _user
    ) external view returns (bytes32[] memory) {
        return userEscrows[_user];
    }

    function getEscrowsDetails(
        bytes32[] calldata _invoiceIds
    )
        external
        view
        returns (
            address[] memory clients,
            address[] memory freelancers,
            uint256[] memory amounts,
            uint64[] memory dueAts,
            uint64[] memory deliveredAts,
            Status[] memory statuses
        )
    {
        clients = new address[](_invoiceIds.length);
        freelancers = new address[](_invoiceIds.length);
        amounts = new uint256[](_invoiceIds.length);
        dueAts = new uint64[](_invoiceIds.length);
        deliveredAts = new uint64[](_invoiceIds.length);
        statuses = new Status[](_invoiceIds.length);

        for (uint i = 0; i < _invoiceIds.length; i++) {
            require(escrowExists[_invoiceIds[i]], "INVALID_INVOICE");
            Escrow storage e = escrows[_invoiceIds[i]];
            clients[i] = e.client;
            freelancers[i] = e.freelancer;
            amounts[i] = e.amount;
            dueAts[i] = e.dueAt;
            deliveredAts[i] = e.deliveredAt;
            statuses[i] = e.status;
        }
    }

    // Called by the freelancer or client to mark the invoice as delivered
    function markDelivered(bytes32 _invoiceId) external notPaused {
        Escrow storage e = escrows[_invoiceId];
        require(e.status == Status.Funded, "NOT_FUNDED"); // Can only mark funded invoices as delivered
        require(msg.sender == e.freelancer, "ONLY_FREELANCER"); // Only the freelancer can call this

        e.deliveredAt = uint64(block.timestamp);
        e.status = Status.Delivered;
        emit MarkedDelivered(_invoiceId, msg.sender, e.deliveredAt);
    }

    // Called by the relayer to release funds to the freelancer when conditions are met
    function releaseToFreelancer(bytes32 _invoiceId) external notPaused {
        Escrow storage e = escrows[_invoiceId];
        require(
            e.status == Status.Funded || e.status == Status.Delivered,
            "ALREADY_SETTLED"
        );
        require(_isReleaseEligible(e), "NOT_ELIGIBLE");

        e.status = Status.Released;
        uint256 amount = e.amount;
        e.amount = 0; // Prevent re-entrancy

        usdc.safeTransfer(e.freelancer, amount);
        emit Released(
            _invoiceId,
            e.freelancer,
            amount,
            uint64(block.timestamp)
        );
    }

    // --- Internal Helper Functions --- //
    function _isReleaseEligible(Escrow storage e) internal view returns (bool) {
        // If it's past the due date, release is eligible
        if (block.timestamp >= e.dueAt) {
            return true;
        }
        // If it was delivered and the dispute window has passed, release is eligible
        if (
            e.deliveredAt != 0 &&
            block.timestamp >= e.deliveredAt + disputeWindow
        ) {
            return true;
        }
        return false;
    }
}
