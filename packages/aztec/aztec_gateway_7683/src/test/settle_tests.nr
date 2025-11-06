use crate::AztecGateway7683;
use crate::test::utils::{setup, create_test_order_data, encode_order_data};
use crate::types::events::Settled;
use dep::aztec::protocol_types::traits::Packable;

#[test]
unconstrained fn test_settled_event_structure() {
    // This test verifies that the Settled event structure is correctly set up
    // by creating an event and checking its packing
    let order_id = [1; 32];
    let receiver = [2; 32];
    
    let event = Settled { order_id, receiver };
    
    // Verify the event has correct fields
    assert(event.order_id == order_id);
    assert(event.receiver == receiver);
    
    // Verify the packing works correctly - should produce 3 Fields
    let packed = event.pack();
    assert(packed.len() == 3);
    
    // The first Field contains the first 31 bytes of order_id
    // The second Field contains the first 31 bytes of receiver
    // The third Field contains residual bytes (order_id[31] and receiver[31])
}

#[test(should_fail_with = "Invalid id")]
unconstrained fn test_settle_invalid_order_id() {
    let setup_data = setup();
    let mut env = setup_data.env;
    let gateway = AztecGateway7683::at(setup_data.gateway_address);
    
    let order_data = create_test_order_data();
    let order_data_bytes = encode_order_data(order_data);
    
    // Use a different order ID than what the data hashes to
    let wrong_order_id = [1; 32];
    let filler_data = [2; 32];
    let message_leaf_index = 0 as Field;
    
    // This should fail with "Invalid id" before checking anything else
    env.call_public(
        setup_data.user1,
        gateway.settle(wrong_order_id, order_data_bytes, filler_data, message_leaf_index),
    );
}

