use crate::AztecGateway7683;
use crate::test::utils::{setup};

#[test]
unconstrained fn test_get_order_status_unknown() {
    let setup_data = setup();
    let env = setup_data.env;
    let gateway = AztecGateway7683::at(setup_data.gateway_address);
    
    // Query status of non-existent order
    let non_existent_order_id = 999999;
    let status = env.view_public(gateway.get_order_status(non_existent_order_id));
    
    // Status should be UNKNOWN (0)
    assert_eq(status, 0);
}

#[test]
unconstrained fn test_get_order_settlement_block_number() {
    let setup_data = setup();
    let env = setup_data.env;
    let gateway = AztecGateway7683::at(setup_data.gateway_address);
    
    let order_id = 12345;
    let block_number = env.view_public(gateway.get_order_settlement_block_number(order_id));
    
    // Should be 0 for non-existent order
    assert_eq(block_number, 0);
}

#[test]
unconstrained fn test_get_order_refund_block_number() {
    let setup_data = setup();
    let env = setup_data.env;
    let gateway = AztecGateway7683::at(setup_data.gateway_address);
    
    let order_id = 12345;
    let block_number = env.view_public(gateway.get_order_refund_block_number(order_id));
    
    // Should be 0 for non-existent order
    assert_eq(block_number, 0);
}
