// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title EnclavCredits
 * @notice Native OG (wei) credits for Enclav scans. Owner deducts after each billed scan.
 */
contract EnclavCredits {
    address public owner;
    mapping(address => uint256) public credits;

    event Deposited(address indexed user, uint256 amount);
    event Credited(address indexed user, uint256 amount);

    error NotOwner();
    error ZeroAmount();
    error InsufficientCredits();
    error TransferFailed();

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function deposit() external payable {
        if (msg.value == 0) revert ZeroAmount();
        credits[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
        emit Credited(msg.sender, credits[msg.sender]);
    }

    function withdraw() external {
        uint256 bal = credits[msg.sender];
        if (bal == 0) revert InsufficientCredits();
        credits[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: bal}("");
        if (!ok) revert TransferFailed();
        emit Credited(msg.sender, credits[msg.sender]);
    }

    /** Withdraw a partial credit balance (native OG). */
    function withdrawAmount(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (credits[msg.sender] < amount) revert InsufficientCredits();
        credits[msg.sender] -= amount;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Credited(msg.sender, credits[msg.sender]);
    }

    function deductCredits(address user, uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        if (credits[user] < amount) revert InsufficientCredits();
        credits[user] -= amount;
        emit Credited(user, credits[user]);
    }

    receive() external payable {
        revert("use deposit()");
    }
}
