# 🔐 Aztec-EVM Bridge

## 🌉 Overview

The **Aztec-EVM Bridge** is a privacy-preserving, trust-minimized cross-chain intent execution framework that facilitates secure transactions between the [Aztec Network](https://aztec.network/) and Ethereum Virtual Machine (EVM)-compatible Layer 2 (L2) solutions such as **Base**.<br/> This project aligns with the proposal outlined in the Aztec Network forum:<br/>[Confidential Cross-Chain Bridging: Enabling Private and Trust-Minimized Interoperability for Aztec](https://forum.aztec.network/t/confidential-cross-chain-bridging-enabling-private-and-trust-minimized-interoperability-for-aztec/7523).<br/> 📚 Full documentation is available at: <br/> 👉 [https://substance-labs.gitbook.io/aztec-evm-bridge/](https://substance-labs.gitbook.io/aztec-evm-bridge/)

## ⚠️ Disclaimer

This project is a **pure proof of concept** and is intended for **research and experimentation purposes only**. We have **not evaluated its compliance** with any applicable laws, regulations, or industry standards. As such, **it has not been deployed to any mainnet environment**.
Use at your own risk. We make **no guarantees** about the security, correctness, or legal validity of this code.

## 📋 Prerequisites

- **Bun** (latest version) - This project uses Bun for package management and runtime
- Access to Aztec sandbox or remote Aztec node
- MongoDB (for filler service)

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
