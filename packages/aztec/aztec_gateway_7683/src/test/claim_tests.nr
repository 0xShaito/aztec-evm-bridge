use crate::AztecGateway7683;
use crate::test::utils::{setup, create_test_order_data, encode_order_data};

#[test(should_fail_with = "Invalid id")]
unconstrained fn test_claim_private_invalid_order_id() {
    let setup_data = setup();
    let mut env = setup_data.env;
    let gateway = AztecGateway7683::at(setup_data.gateway_address);
    
    let order_data = create_test_order_data();
    let order_data_bytes = encode_order_data(order_data);
    
    // Use a different order ID than what the data hashes to
    let wrong_order_id = [1; 32];
    let filler_data = [2; 32];
    let secret = 12345 as Field;
    
    // This should fail with "Invalid id" before checking status
    env.call_private(
        setup_data.user1,
        gateway.claim_private(secret, wrong_order_id, order_data_bytes, filler_data),
    );
}

#[test(should_fail_with = "Invalid id")]
unconstrained fn test_claim_refund_invalid_order_id() {
    let setup_data = setup();
    let mut env = setup_data.env;
    let gateway = AztecGateway7683::at(setup_data.gateway_address);
    
    let order_data = create_test_order_data();
    let order_data_bytes = encode_order_data(order_data);
    
    // Use a different order ID than what the data hashes to
    let wrong_order_id = [1; 32];
    let message_leaf_index = 0 as Field;
    
    // This should fail with "Invalid id" before checking status
    env.call_public(
        setup_data.user1,
        gateway.claim_refund(wrong_order_id, order_data_bytes, message_leaf_index),
    );
}

#[test(should_fail_with = "Invalid id")]
unconstrained fn test_claim_refund_private_invalid_order_id() {
    let setup_data = setup();
    let mut env = setup_data.env;
    let gateway = AztecGateway7683::at(setup_data.gateway_address);
    
    let order_data = create_test_order_data();
    let order_data_bytes = encode_order_data(order_data);
    
    // Use a different order ID than what the data hashes to
    let wrong_order_id = [1; 32];
    let secret = 12345 as Field;
    let message_leaf_index = 0 as Field;
    
    // This should fail with "Invalid id" before checking status
    env.call_private(
        setup_data.user1,
        gateway.claim_refund_private(secret, wrong_order_id, order_data_bytes, message_leaf_index),
    );
}
