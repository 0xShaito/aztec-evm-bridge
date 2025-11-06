use crate::AztecGateway7683;
use crate::test::utils::{setup, create_test_order_data, encode_order_data};
use crate::types::order_data::{PRIVATE_ORDER, PUBLIC_ORDER};

#[test(should_fail_with = "Invalid id")]
unconstrained fn test_fill_invalid_order_id() {
    let setup_data = setup();
    let mut env = setup_data.env;
    let gateway = AztecGateway7683::at(setup_data.gateway_address);
    
    let order_data = create_test_order_data();
    let order_data_bytes = encode_order_data(order_data);
    
    // Use a different order ID than what the data hashes to
    let wrong_order_id = [1; 32];
    let filler_data = [2; 32];
    
    // This should fail with "Invalid id" before checking anything else
    env.call_public(
        setup_data.user1,
        gateway.fill(wrong_order_id, order_data_bytes, filler_data),
    );
}

#[test(should_fail_with = "Not a public order")]
unconstrained fn test_fill_private_order_type_fails() {
    let setup_data = setup();
    let mut env = setup_data.env;
    let gateway = AztecGateway7683::at(setup_data.gateway_address);
    
    let mut order_data = create_test_order_data();
    order_data.order_type = PRIVATE_ORDER; // Set to private order
    
    let order_data_bytes = encode_order_data(order_data);
    let order_id_bytes = order_data.id().to_be_bytes::<32>();
    let filler_data = [2; 32];
    
    // This should fail with "Not a public order"
    env.call_public(
        setup_data.user1,
        gateway.fill(order_id_bytes, order_data_bytes, filler_data),
    );
}

#[test(should_fail_with = "Order fill expired")]
unconstrained fn test_fill_expired_order() {
    let setup_data = setup();
    let mut env = setup_data.env;
    let gateway = AztecGateway7683::at(setup_data.gateway_address);
    
    let mut order_data = create_test_order_data();
    order_data.order_type = PUBLIC_ORDER;
    order_data.destination_domain = 999999; // LOCAL_DOMAIN
    order_data.fill_deadline = 0; // Set deadline to 0 (expired)
    
    let order_data_bytes = encode_order_data(order_data);
    let order_id_bytes = order_data.id().to_be_bytes::<32>();
    let filler_data = [2; 32];
    
    // This should fail with "Order fill expired"
    env.call_public(
        setup_data.user1,
        gateway.fill(order_id_bytes, order_data_bytes, filler_data),
    );
}
