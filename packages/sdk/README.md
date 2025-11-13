# @substancelabs/aztec-evm-bridge-sdk

> ⚠️ **Disclaimer**
>
> This SDK is a **work in progress** and may undergo significant changes. Breaking changes may occur frequently.  
> Use it at your own risk in production environments. Contributions and feedback are welcome as the project evolves.

---

## 📦 Installation

```bash
npm install @substancelabs/aztec-evm-bridge-sdk
```

---

## 🚀 Quick Start

Here's a basic example showing how to initiate an order **from Aztec to Base**:

```ts
import { Bridge, aztecSepolia } from "@substancelabs/aztec-evm-bridge-sdk"
import { padHex } from "viem"
import { baseSepolia } from "viem/chains"

const bridge = new Bridge({
  evmPrivateKey: "0x...",
  aztecSecretKey: "0x...",
  aztecKeySalt: "0x...",
  aztecNodeUrl: "https://devnet.aztec-labs.com",
  aztecPxeStoreDirectory: "./store/pxe", // Optional: defaults to ./store
  beaconApiUrl: "https://beacon.ethpandaops.io", // Optional: required for forward operations
})

bridge
  .openOrder({
    chainIdIn: aztecSepolia.id,
    chainIdOut: baseSepolia.id,
    amountIn: 1n,
    amountOut: 1n, // amountOut must be less than amountIn to account for slippage
    tokenIn: "0x...", // 32-byte hex token address
    tokenOut: "0x...", // 20-byte EVM address, padded to 32 bytes
    mode: "private", // Options: "private", "privateWithHook", "public", "publicWithHook"
    data: padHex("0x"), // 32-byte hex for additional data
    recipient: padHex("0x"), // 32-byte hex recipient address
  })
  .then((result) => {
    console.log("Order opened:", result.orderId)
    console.log("Transaction hash:", result.txHash)
  })
  .catch(console.error)
```

### Alternative: Using Azguard Wallet

```ts
import { AzguardClient } from "@azguardwallet/client"

const azguardClient = new AzguardClient(/* your config */)

const bridge = new Bridge({
  evmPrivateKey: "0x...",
  azguardClient, // Use Azguard instead of aztecSecretKey/aztecKeySalt/aztecNodeUrl
})
```

---


## 🧪 Development

```bash
# Build the SDK
yarn build

# Run tests
yarn test
```