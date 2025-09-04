// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDC
 * @dev A simple mock USDC token for testing on local and test networks.
 * The contract owner can mint unlimited tokens to any address.
 */
contract MockUSDC is ERC20 {
    uint8 private _decimals;

    // The contract deployer becomes the owner and can mint tokens
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    /**
     * @dev Constructor that gives msg.sender all initial tokens and sets decimals.
     * @param _initialSupply The initial amount of tokens to mint to the deployer.
     */
    constructor(uint256 _initialSupply) ERC20("Mock USDC", "mUSDC") {
        owner = msg.sender;
        _decimals = 6; // USDC uses 6 decimals
        _mint(msg.sender, _initialSupply * 10 ** decimals());
    }

    /**
     * @dev Function to mint tokens to a target address. Only callable by the owner.
     * @param _to The address that will receive the minted tokens.
     * @param _amount The amount of tokens to mint (in base units, will be adjusted for decimals).
     */
    function mint(address _to, uint256 _amount) public onlyOwner {
        _mint(_to, _amount * 10 ** decimals());
    }

    /**
     * @dev Overrides the default decimals function to return 6.
     */
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    function symbol() public view virtual override returns (string memory) {
        return "mUSDC";
    }

    function name() public view virtual override returns (string memory) {
        return "Mock USDC";
    }

    /**
     * @dev Destroys the contract. Only callable by the owner.
     * For cleanup in test environments.
     */
    function destroy() public onlyOwner {
        selfdestruct(payable(owner));
    }
}
