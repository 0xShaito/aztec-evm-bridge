---
"@substancelabs/aztec-evm-bridge-sdk": patch
---

Refactor SDK for improved readability and maintainability

- Extract operation classes: AztecToEvmOperations, EvmToAztecOperations, ForwardOperations
- Add service classes: AztecService, EvmService for wallet management
- Add BridgeHelpers utility class for common operations
- Extract LogQueries utilities for Aztec log queries
- Improve code organization and separation of concerns
- Add allowance verification retry logic
- Fix nonce management in order filling
