# 🔐 Aztec-EVM Bridge

## 🌉 Overview

The **Aztec-EVM Bridge** is a privacy-preserving, trust-minimized cross-chain intent execution framework that facilitates secure transactions between the [Aztec Network](https://aztec.network/) and Ethereum Virtual Machine (EVM)-compatible Layer 2 (L2) solutions such as **Base**.<br/> This project aligns with the proposal outlined in the Aztec Network forum:<br/>[Confidential Cross-Chain Bridging: Enabling Private and Trust-Minimized Interoperability for Aztec](https://forum.aztec.network/t/confidential-cross-chain-bridging-enabling-private-and-trust-minimized-interoperability-for-aztec/7523).<br/> 📚 Full documentation is available at: <br/> 👉 [https://substance-labs.gitbook.io/aztec-evm-bridge/](https://substance-labs.gitbook.io/aztec-evm-bridge/)

## ⚠️ Disclaimer

This project is a **pure proof of concept** and is intended for **research and experimentation purposes only**. We have **not evaluated its compliance** with any applicable laws, regulations, or industry standards. As such, **it has not been deployed to any mainnet environment**.
Use at your own risk. We make **no guarantees** about the security, correctness, or legal validity of this code.

## 📋 Prerequisites

- **Bun** (latest version) - This project uses Bun for package management and runtime
- **Foundry** - For compiling EVM contracts (`forge build` in `packages/evm`)
- Access to Aztec sandbox or remote Aztec node
- MongoDB (for filler service)

## 🚀 Quick Start

### Setup

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Create `.env` file** in the root directory. You can copy `.env.example` as a template:
   ```bash
   cp .env.example .env
   ```
   
   Then fill in the required variables:
   ```bash
   # Aztec Configuration
   # For devnet: https://devnet.aztec-labs.com/
   # For local sandbox: http://localhost:8080
   AZTEC_RPC_URL=https://devnet.aztec-labs.com/
   AZTEC_SECRET_KEY=0x...
   AZTEC_SALT=0x...
   AZTEC_DEPLOY_WALLET=true

   # EVM Configuration
   EVM_RPC_URL=https://...
   EVM_PRIVATE_KEY=0x...
   EVM_CHAIN_ID=84532
   PERMIT2_ADDRESS=0x...

   # Aztec Bridge Addresses (for Forwarder)
   AZTEC_INBOX=0x...
   AZTEC_OUTBOX=0x...
   ANCHOR_STATE_REGISTRY=0x...

   # Token Configuration
   AZTEC_TOKEN_NAME=Test Token
   AZTEC_TOKEN_SYMBOL=TEST
   AZTEC_TOKEN_DECIMALS=18
   EVM_TOKEN_NAME=Test Token
   EVM_TOKEN_SYMBOL=TEST
   EVM_TOKEN_DECIMALS=18
   EVM_TOKEN_INITIAL_SUPPLY=1000000000000000000000000
   ```

3. **Compile contracts (optional - scripts will build automatically if needed):**
   
   The deployment script automatically builds all required artifacts before deployment. Manual compilation is only needed if you want to build them separately:
   ```bash
   # EVM contracts
   cd packages/evm && forge build && cd ../..
   
   # Aztec contracts
   cd packages/aztec/aztec_gateway_7683
   aztec-nargo compile
   aztec-postprocess-contract
   aztec codegen target --outdir src/artifacts --force
   cd ../../..
   ```

### Deploy Contracts

Deploy all contracts (EVM and Aztec) in the correct order:

```bash
bun deploy:all
```

This will:
1. Build all required contract artifacts (EVM and Aztec)
2. Deploy EVM contracts (L2Gateway7683, Forwarder, TestToken)
3. Configure cross-references between EVM contracts
4. Deploy Aztec contracts (AztecGateway7683, Aztec Token)
5. Set Aztec Gateway addresses on Forwarder and L2Gateway7683
6. Automatically update `.env` with deployed addresses

> **Note**: If `AZTEC_DEPLOY_WALLET=true`, the script will deploy your Aztec account on-chain first. This may take 30-60 seconds for proof generation and mining.

### Mint Tokens

Mint tokens interactively (you'll be prompted for recipients and amounts):

```bash
# Mint tokens on Aztec
bun mint:aztec

# Mint tokens on EVM
bun mint:evm
```

The scripts will prompt you for:
- **Aztec**: Recipient addresses, private amounts, and public amounts (comma-separated)
- **EVM**: Recipient addresses and amounts (comma-separated)

> **Note**: Amounts are entered in human-readable format (e.g., `1`, `100`, `1.5`). The scripts automatically apply token decimals, so you don't need to enter wei values.

## ✨ Features

- **🕵️ Privacy-Preserving Transactions**: Utilizes Aztec's zero-knowledge proofs to ensure transaction confidentiality.
- **🛡️ Trust-Minimized Execution**: Implements a filler-based model where fillers fulfill intents and execute cross-chain transactions without centralized intermediaries.
- **🌐 Cross-Chain Interoperability**: Designed to be compatible with any EVM L2 that settles on Ethereum, facilitating broad adoption.
- **🎛️ Support for Public and Private Intents**: Accommodates both public and private transaction intents, enhancing flexibility and user control.

## 🧠 Architecture

The framework leverages **ERC-7683 intents** and includes a **Forwarder contract** on Ethereum to ensure verifiable cross-chain settlement. The filler-based model operates as follows:

### 🔒 Private Intents

- **EVM → Aztec**:  
  A user expresses an intent on the EVM L2 by locking assets into an ERC-7683-compatible contract. A filler monitors for such intents and mirrors the value inside the Aztec Gateway by locking their own funds. The user then privately claims these funds within Aztec using a secret.
  This private claim triggers a message through Aztec’s native bridge. The message is consumed by the Forwarder contract on Ethereum, which writes a verifiable commitment to storage confirming the successful claim. This commitment enables the filler to retrieve their initially locked funds on the EVM L2 by submitting a storage proof via the settle function.

- **Aztec → EVM**:  
  A user initiates a private transfer inside Aztec, expressing the intent to send assets to an EVM L2. A filler observes this intent and pre-funds the user on the destination EVM L2 chain by advancing their own capital. 
  At this point, for the filler to reclaim their funds (i.e., trigger settlement), they must wait until the new EVM L2 anchor root is published on Ethereum mainnet. This root will be used to verify that the filling occurred correctly. Once verified, the Forwarder contract verifies the fill via a storage proof and sends a message to Aztec via the native bridge, initiating the settlement process and enabling the filler to retrieve their funds.


> 💡 **Public intents follow a similar flow, with two key differences:**  
>  
> ✅ Transfers are **public**, meaning the intent and fulfillment are visible on-chain.  
> ✅ On Aztec, the user does **not** need to manually claim the funds — they are transferred automatically during the filling process.  
>  
> 🔁 Settlement remains unchanged
