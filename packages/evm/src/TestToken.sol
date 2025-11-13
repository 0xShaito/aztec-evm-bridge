// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TestToken
/// @notice Simple ERC20 token for Base Sepolia end-to-end testing.
/// @dev Mints the full `initialSupply` (already scaled by decimals) to the deployer.
/// Public mint function added for testing purposes.
contract TestToken is ERC20 {
    uint8 private immutable _customDecimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 initialSupply)
        ERC20(name_, symbol_)
    {
        _customDecimals = decimals_;
        _mint(msg.sender, initialSupply);
    }

    function decimals() public view override returns (uint8) {
        return _customDecimals;
    }

    /// @notice Public mint function for testing purposes only
    /// @param to Address to mint tokens to
    /// @param amount Amount of tokens to mint
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}
