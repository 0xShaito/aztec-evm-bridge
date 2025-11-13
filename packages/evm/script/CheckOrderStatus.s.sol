// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Script.sol";

interface IL2Gateway7683 {
    function openOrders(bytes32 orderId) external view returns (bytes32, bytes memory);
    function orderStatus(bytes32 orderId) external view returns (bytes32);
    function filledOrdersCommitments(bytes32 orderId) external view returns (bytes32);
    function refundedOrdersCommitments(bytes32 orderId) external view returns (bytes32);
}

contract CheckOrderStatus is Script {
    function run(bytes32 orderId) public view {
        address GATEWAY = vm.envAddress("L2_EVM_GATEWAY_ADDRESS");
        IL2Gateway7683 gateway = IL2Gateway7683(GATEWAY);
        
        console.log("Checking order status for:", vm.toString(orderId));
        console.log("Gateway address:", GATEWAY);
        console.log("Current block timestamp:", block.timestamp);
        
        // Check order status
        bytes32 status = gateway.orderStatus(orderId);
        console.log("Order status (bytes32):", vm.toString(status));
        
        // Convert status to string
        string memory statusStr = string(abi.encodePacked(status));
        console.log("Order status (string):", statusStr);
        
        // Try to read order data to get fillDeadline
        if (status == bytes32("OPENED")) {
            try gateway.openOrders(orderId) returns (bytes32 /* orderType */, bytes memory orderData) {
                console.log("Order data length:", orderData.length);
                
                // Decode fillDeadline (at position 64 in orderData based on OrderData struct)
                // OrderData: orderType(1) + sender(32) + senderNonce(32) + inputToken(32) + outputToken(32) + amountIn(32) + amountOut(32) + originDomain(4) + destinationDomain(4) + destinationSettler(32) + recipient(32) + fillDeadline(4)
                if (orderData.length >= 237) {
                    uint32 fillDeadline;
                    assembly {
                        // fillDeadline is at offset 233 (0xE9) in orderData
                        fillDeadline := mload(add(add(orderData, 0x20), 233))
                    }
                    console.log("Fill deadline:", fillDeadline);
                    
                    if (block.timestamp > fillDeadline) {
                        console.log("=> Order is EXPIRED (can be refunded)");
                    } else {
                        uint256 timeLeft = fillDeadline - block.timestamp;
                        console.log("=> Order is OPENED and NOT EXPIRED");
                        console.log("Time left:", timeLeft, "seconds");
                    }
                }
            } catch {
                console.log("Could not read order data");
            }
        }
        
        // Check commitments
        bytes32 filledCommitment = gateway.filledOrdersCommitments(orderId);
        bytes32 refundedCommitment = gateway.refundedOrdersCommitments(orderId);
        
        if (status == bytes32("SETTLED")) {
            console.log("=> Order has been SETTLED");
        } else if (status == bytes32("REFUNDED")) {
            console.log("=> Order has been REFUNDED");
        } else if (status == bytes32(0)) {
            console.log("=> Order not found");
        }
        
        if (filledCommitment != bytes32(0)) {
            console.log("Filled commitment:", vm.toString(filledCommitment));
        }
        
        if (refundedCommitment != bytes32(0)) {
            console.log("Refunded commitment:", vm.toString(refundedCommitment));
        }
    }
}
