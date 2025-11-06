use crate::AztecGateway7683;
use crate::test::utils::{setup, create_test_order_with_sender};
use crate::types::events::Open;

#[test(should_fail_with = "Invalid data type")]
unconstrained fn test_open_order_invalid_data_type() {
    let setup_data = setup();
    let mut env = setup_data.env;
    let gateway = AztecGateway7683::at(setup_data.gateway_address);
    
    let mut order = create_test_order_with_sender(setup_data.user1);
    // Set invalid order data type
    order.order_data_type = [0; 32];
    
    // This should fail with "Invalid data type" before trying to transfer tokens
    env.call_public(setup_data.user1, gateway.open(order));
}

#[test]
unconstrained fn test_open_emits_event_structure() {
    // This test verifies that the Open event structure is correctly set up
    // by creating an event and checking its components
    let order_id = [1; 32];
    let mut resolved_order_data = [0; 613]; // RESOLVED_CROSS_CHAIN_LENGTH
    for i in 0..613 {
        resolved_order_data[i] = (i as Field);
    }
    
    let event = Open::new(order_id, resolved_order_data);
    
    // Verify the event has two parts as expected
    assert(event.open1.order_id == order_id);
    assert(event.open2.order_id == order_id);
    
    // Verify the resolved order is properly split
    // open1 should have 340 bytes
    assert(event.open1.resolved_order.len() == 340);
    // open2 should have 273 bytes
    assert(event.open2.resolved_order.len() == 273);
    
    // Verify first bytes match the input
    assert(event.open1.resolved_order[0] == 0);
    assert(event.open1.resolved_order[1] == 1);
    
    // Verify that open2 contains the continuation (340 and 341 wrap to 84 and 85 as u8)
    assert(event.open2.resolved_order[0] == 84); // 340 % 256
    assert(event.open2.resolved_order[1] == 85); // 341 % 256
}

#[test(should_fail_with = "Not a public order")]
unconstrained fn test_open_order_private_order_type_fails() {
    let setup_data = setup();
    let mut env = setup_data.env;
    let gateway = AztecGateway7683::at(setup_data.gateway_address);
    
    let mut order = create_test_order_with_sender(setup_data.user1);
    // Modify the order data to set PRIVATE_ORDER type (1)
    order.order_data[268] = 1; // PRIVATE_ORDER
    
    // This should fail with "Not a public order"
    env.call_public(setup_data.user1, gateway.open(order));
}

#[test(should_fail_with = "Invalid origin domain")]
unconstrained fn test_open_order_wrong_origin_domain() {
    let setup_data = setup();
    let mut env = setup_data.env;
    let gateway = AztecGateway7683::at(setup_data.gateway_address);
    
    let mut order = create_test_order_with_sender(setup_data.user1);
    // Set wrong origin domain (should be 999999 for LOCAL_DOMAIN)
    // Origin domain is at bytes 224-227 (4 bytes)
    order.order_data[224] = 0;
    order.order_data[225] = 0;
    order.order_data[226] = 0;
    order.order_data[227] = 1; // Set to 1 instead of 999999
    
    // This should fail with "Invalid origin domain"
    env.call_public(setup_data.user1, gateway.open(order));
}

#[test]
unconstrained fn test_get_order_status_unknown() {
    let setup_data = setup();
    let env = setup_data.env;
    let gateway = AztecGateway7683::at(setup_data.gateway_address);
    
    // Create a random order ID that hasn't been opened
    let unknown_order_id = 12345 as Field;
    
    // Query order status - should be UNKNOWN (0)
    let status = env.view_public(gateway.get_order_status(unknown_order_id));
    assert(status == 0); // UNKNOWN
}
