import { describe, expect } from "vitest"
import { Fr } from "@aztec/aztec.js/fields"
import { createAztecNodeClient } from "@aztec/aztec.js/node"
import { createStore } from "@aztec/kv-store/lmdb"
import { getPXEConfig } from "@aztec/pxe/server"
import { TestWallet } from "@aztec/test-wallet/server"
import { baseSepolia } from "viem/chains"
import { Hex, isHex, padHex } from "viem"
import { AzguardClient } from "@azguardwallet/client"
import { privateKeyToAddress } from "viem/accounts"
import { AccountWithSecretKey } from "@aztec/aztec.js/account"

import { Bridge, aztecSepolia, ResolvedOrder, OrderDataEncoder } from "../src"

const WETH_ON_AZTEC_SEPOLIA_ADDRESS = "0x089d76aaa3261376f2073894cddff9a070c1ca2c3ae2a2b25fcce25d68caae81"
const WETH_ON_BASE_SEPOLIA_ADDRESS = "0xAf31a5CFf95131B2E0D3fa89125342984567f399"

const setup = async () => {
  const aztecNode = await createAztecNodeClient("https://devnet.aztec-labs.com")

  const fullConfig = {
    ...getPXEConfig(),
    l1Contracts: await aztecNode.getL1ContractAddresses(),
    proverEnabled: true,
  }
  const store = await createStore("aztecPxe", {
    dataDirectory: "store",
    dataStoreMapSizeKb: 1e6,
  })

  const testWallet = await TestWallet.create(aztecNode, fullConfig, {
    store,
    useLogSuffix: true,
  })

  let aztecAccount: AccountWithSecretKey | undefined
  if (process.env.AZTEC_SECRET_KEY && process.env.AZTEC_KEY_SALT) {
    const secretKey = Fr.fromHexString(process.env.AZTEC_SECRET_KEY)
    const salt = Fr.fromHexString(process.env.AZTEC_KEY_SALT)
    const accountContract = await testWallet.createSchnorrAccount(secretKey, salt)
    aztecAccount = await accountContract.getAccount()
  }

  return {
    aztecAccount,
    aztecNode,
    aztecNodeUrl: "https://devnet.aztec-labs.com",
  }
}

/**
 * ⚠️ IMPORTANT:
 * Be sure to use accounts that own WETH on both Base Sepolia and Aztec Sepolia
 * and that a filler is up and running.
 *
 * If your account doesn't have WETH on Aztec Sepolia, you can:
 * - Use our bridge: https://devnet.aztec-labs.com
 * - Or use the integrated faucet within the bridge interface.
 */
describe("Bridge", { timeout: 600000 }, () => {
  describe("Initialization", () => {
    it("cannot initialize bridge without aztecSecretKey and aztecKeySalt or azguardClient", async () => {
      const createBridge = () =>
        new Bridge({
          evmPrivateKey: process.env.EVM_PK as Hex,
        })
      expect(createBridge).to.throw("You must specify aztecSecretKey and aztecKeySalt or azguardClient")
    })

    it("cannot specify evmPrivateKey and evmProvider", async () => {
      const createBridge = () =>
        new Bridge({
          aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
          aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
          evmPrivateKey: process.env.EVM_PK as Hex,
          evmProvider: {},
        })
      expect(createBridge).to.throw("Cannot specify both evmPrivateKey and evmProvider")
    })

    it("cannot initialize bridge using aztecSecretKey, aztecKeySalt, aztecNodeUrl and azguardClient", async () => {
      const { aztecNodeUrl } = await setup()
      const createBridge = () =>
        new Bridge({
          evmPrivateKey: process.env.EVM_PK as Hex,
          aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
          aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
          aztecNodeUrl,
          azguardClient: {} as AzguardClient,
        })
      expect(createBridge).to.throw("Cannot specify both aztecSecretKey, aztecKeySalt, aztecNodeUrl and azguardClient")
    })

    it("cannot initialize bridge using aztecSecretKey and aztecNode without aztecKeySalt", async () => {
      const createBridge = () =>
        new Bridge({
          aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
          evmPrivateKey: process.env.EVM_PK as Hex,
        })
      expect(createBridge).to.throw("You must specify both aztecSecretKey and aztecKeySalt")
    })

    it("cannot initialize bridge using aztecSecretKey, aztecKeySalt without aztecNodeUrl", async () => {
      const createBridge = () =>
        new Bridge({
          aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
          aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
          evmPrivateKey: process.env.EVM_PK as Hex,
        })
      expect(createBridge).to.throw("You must specify the aztecNodeUrl when using aztecSecretKey and aztecKeySalt")
    })
  })

  describe("Aztec -> Base", () => {
    it("should create a public order from Aztec to Base", async () => {
      const { aztecNodeUrl } = await setup()

      const bridge = new Bridge({
        evmPrivateKey: process.env.EVM_PK as Hex,
        aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
        aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
        aztecNodeUrl,
      })
      let onOrderOpenedCalled = false
      let onOrderFilledCalled = false
      const result = await bridge.openOrder(
        {
          chainIdIn: aztecSepolia.id,
          chainIdOut: baseSepolia.id,
          amountIn: 1n,
          amountOut: 1n,
          tokenIn: WETH_ON_AZTEC_SEPOLIA_ADDRESS,
          tokenOut: WETH_ON_BASE_SEPOLIA_ADDRESS,
          mode: "public",
          data: padHex("0x"),
          recipient: padHex(privateKeyToAddress(process.env.EVM_PK as Hex)),
        },
        {
          onOrderOpened: () => {
            onOrderOpenedCalled = true
          },
          onOrderFilled: () => {
            onOrderFilledCalled = true
          },
        },
      )
      expect(isHex(result.orderOpenedTxHash)).toBe(true)
      expect(isHex(result.orderFilledTxHash)).toBe(true)
      expect(onOrderOpenedCalled).toBe(true)
      expect(onOrderFilledCalled).toBe(true)
    })

    it("should open a private order from Aztec to Base", async () => {
      const { aztecNodeUrl } = await setup()
      const bridge = new Bridge({
        evmPrivateKey: process.env.EVM_PK as Hex,
        aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
        aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
        aztecNodeUrl,
      })
      const result = await bridge.openOrder(
        {
          chainIdIn: aztecSepolia.id,
          chainIdOut: baseSepolia.id,
          amountIn: 1n,
          amountOut: 1n,
          tokenIn: WETH_ON_AZTEC_SEPOLIA_ADDRESS,
          tokenOut: WETH_ON_BASE_SEPOLIA_ADDRESS,
          mode: "private", // or public,
          data: padHex("0x"),
          recipient: padHex(privateKeyToAddress(process.env.EVM_PK as Hex)),
        },
        {
          onOrderOpened: ({ transactionHash }) => expect(isHex(transactionHash)).toBe(true),
          onOrderFilled: ({ transactionHash }) => expect(isHex(transactionHash)).toBe(true),
        },
      )
      expect(isHex(result.orderOpenedTxHash)).toBe(true)
      expect(isHex(result.orderFilledTxHash)).toBe(true)
    })

    it("should open a private order from Aztec to Base and then ask for a refund", async () => {
      const { aztecNodeUrl } = await setup()
      const bridge = new Bridge({
        evmPrivateKey: process.env.EVM_PK as Hex,
        aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
        aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
        aztecNodeUrl,
      })
      const openOrder = (): Promise<Hex> =>
        new Promise((resolve) => {
          bridge.openOrder(
            {
              chainIdIn: aztecSepolia.id,
              chainIdOut: baseSepolia.id,
              amountIn: 1n,
              amountOut: 1000000000n,
              tokenIn: WETH_ON_AZTEC_SEPOLIA_ADDRESS,
              tokenOut: WETH_ON_BASE_SEPOLIA_ADDRESS,
              mode: "private",
              data: padHex("0x"),
              recipient: padHex(privateKeyToAddress(process.env.EVM_PK as Hex)),
              fillDeadline: 5, // Short deadline
            },
            {
              onOrderOpened: ({ orderId }) => resolve(orderId),
            },
          )
        })
      const orderId = await openOrder()

      // Wait a moment to let the order propagate
      await new Promise((resolve) => setTimeout(resolve, 2000))

      const txHash = await bridge.refundOrder({
        orderId,
        chainIdIn: aztecSepolia.id,
        chainIdOut: baseSepolia.id,
      })
      expect(isHex(txHash)).toBe(true)
    })

    it("should open a private order from Aztec to Base and fill it", async () => {
      const { aztecNodeUrl } = await setup()
      const bridge = new Bridge({
        evmPrivateKey: process.env.EVM_PK as Hex,
        aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
        aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
        aztecNodeUrl,
      })
      const openOrder = (): Promise<{ orderId: Hex; resolvedOrder: ResolvedOrder }> =>
        new Promise((resolve) => {
          bridge.openOrder(
            {
              chainIdIn: aztecSepolia.id,
              chainIdOut: baseSepolia.id,
              amountIn: 1n,
              amountOut: 1n,
              tokenIn: WETH_ON_AZTEC_SEPOLIA_ADDRESS,
              tokenOut: WETH_ON_BASE_SEPOLIA_ADDRESS,
              mode: "private",
              data: padHex("0x"),
              recipient: padHex(privateKeyToAddress(process.env.EVM_PK as Hex)),
            },
            {
              onOrderOpened: ({ orderId, resolvedOrder }) => resolve({ orderId, resolvedOrder }),
            },
          )
        })
      const { orderId, resolvedOrder } = await openOrder()
      const txHash = await bridge.fillOrder({
        orderId,
        orderData: OrderDataEncoder.decode(resolvedOrder.fillInstructions[0].originData),
      })
      expect(isHex(txHash)).toBe(true)
    })
  })

  describe("Base -> Aztec", () => {
    it("should open a private order from Base to Aztec", async () => {
      const { aztecAccount, aztecNodeUrl } = await setup()
      const bridge = new Bridge({
        evmPrivateKey: process.env.EVM_PK as Hex,
        aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
        aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
        aztecNodeUrl,
      })

      let onOrderOpenedCalled = false
      let onOrderFilledCalled = false
      let onSecretCalled = false
      let onOrderClaimedCalled = false
      const result = await bridge.openOrder(
        {
          chainIdIn: baseSepolia.id,
          chainIdOut: aztecSepolia.id,
          amountIn: 1n,
          amountOut: 1n,
          tokenIn: WETH_ON_BASE_SEPOLIA_ADDRESS,
          tokenOut: WETH_ON_AZTEC_SEPOLIA_ADDRESS,
          mode: "private",
          data: padHex("0x"),
          recipient: aztecAccount!.getAddress().toString(),
        },
        {
          onSecret: () => {
            onSecretCalled = true
          },
          onOrderOpened: () => {
            onOrderOpenedCalled = true
          },
          onOrderFilled: () => {
            onOrderFilledCalled = true
          },
          onOrderClaimed: () => {
            onOrderClaimedCalled = true
          },
        },
      )
      expect(isHex(result.orderOpenedTxHash)).toBe(true)
      expect(isHex(result.orderClaimedTxHash)).toBe(true)
      expect(onSecretCalled).toBe(true)
      expect(onOrderOpenedCalled).toBe(true)
      expect(onOrderFilledCalled).toBe(true)
      expect(onOrderClaimedCalled).toBe(true)
    })

    it("should open a public order from Base to Aztec", async () => {
      const { aztecAccount, aztecNodeUrl } = await setup()
      const bridge = new Bridge({
        evmPrivateKey: process.env.EVM_PK as Hex,
        aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
        aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
        aztecNodeUrl,
      })

      let onOrderOpenedCalled = false
      let onOrderFilledCalled = false
      const result = await bridge.openOrder(
        {
          chainIdIn: baseSepolia.id,
          chainIdOut: aztecSepolia.id,
          amountIn: 1n,
          amountOut: 1n,
          tokenIn: WETH_ON_BASE_SEPOLIA_ADDRESS,
          tokenOut: WETH_ON_AZTEC_SEPOLIA_ADDRESS,
          mode: "public",
          data: padHex("0x"),
          recipient: aztecAccount!.getAddress().toString(),
        },
        {
          onOrderOpened: () => {
            onOrderOpenedCalled = true
          },
          onOrderFilled: () => {
            onOrderFilledCalled = true
          },
        },
      )
      expect(isHex(result.orderOpenedTxHash)).toBe(true)
      expect(onOrderOpenedCalled).toBe(true)
      expect(onOrderFilledCalled).toBe(true)
    })

    it("should open a private order from Base to Aztec and then ask for a refund", async () => {
      const { aztecNodeUrl } = await setup()
      const bridge = new Bridge({
        evmPrivateKey: process.env.EVM_PK as Hex,
        aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
        aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
        aztecNodeUrl,
      })

      const openOrder = (): Promise<Hex> =>
        new Promise((resolve) => {
          bridge.openOrder(
            {
              chainIdIn: baseSepolia.id,
              chainIdOut: aztecSepolia.id,
              amountIn: 1n,
              amountOut: 1000000000n, // Very high amountOut to discourage fillers
              tokenIn: WETH_ON_BASE_SEPOLIA_ADDRESS,
              tokenOut: WETH_ON_AZTEC_SEPOLIA_ADDRESS,
              mode: "private",
              data: padHex("0x"),
              recipient: padHex(privateKeyToAddress(process.env.EVM_PK as Hex)),
              fillDeadline: 5, // Short deadline
            },
            {
              onOrderOpened: ({ orderId }) => resolve(orderId),
            },
          )
        })
      const orderId = await openOrder()

      // Wait a moment to let the order settle
      await new Promise((resolve) => setTimeout(resolve, 2000))

      const txHash = await bridge.refundOrder({
        orderId,
        chainIdIn: baseSepolia.id,
        chainIdOut: aztecSepolia.id,
      })
      expect(isHex(txHash)).toBe(true)
    })

    it.skip("should open a private order from Base to Aztec and then fill it", async () => {
      const { aztecNodeUrl } = await setup()
      const bridge = new Bridge({
        evmPrivateKey: process.env.EVM_PK as Hex,
        aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
        aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
        aztecNodeUrl,
      })

      const openOrder = (): Promise<{ orderId: Hex; resolvedOrder: ResolvedOrder }> =>
        new Promise((resolve) => {
          bridge.openOrder(
            {
              chainIdIn: baseSepolia.id,
              chainIdOut: aztecSepolia.id,
              amountIn: 1n,
              amountOut: 1n,
              tokenIn: WETH_ON_BASE_SEPOLIA_ADDRESS,
              tokenOut: WETH_ON_AZTEC_SEPOLIA_ADDRESS,
              mode: "private",
              data: padHex("0x"),
              recipient: padHex(privateKeyToAddress(process.env.EVM_PK as Hex)),
            },
            {
              onOrderOpened: ({ orderId, resolvedOrder }) => resolve({ orderId, resolvedOrder }),
            },
          )
        })
      const { orderId, resolvedOrder } = await openOrder()
      const txHash = await bridge.fillOrder({
        orderId,
        orderData: OrderDataEncoder.decode(resolvedOrder.fillInstructions[0].originData),
      })
      expect(isHex(txHash)).toBe(true)
    })

    it.skip("should open a private order from Base to Aztec and then fill it", async () => {
      const { aztecNodeUrl } = await setup()
      const bridge = new Bridge({
        evmPrivateKey: process.env.EVM_PK as Hex,
        aztecSecretKey: process.env.AZTEC_SECRET_KEY as Hex,
        aztecKeySalt: process.env.AZTEC_KEY_SALT as Hex,
        aztecNodeUrl,
      })

      const openOrder = (): Promise<{ orderId: Hex; resolvedOrder: ResolvedOrder }> =>
        new Promise((resolve) => {
          bridge.openOrder(
            {
              chainIdIn: baseSepolia.id,
              chainIdOut: aztecSepolia.id,
              amountIn: 1n,
              amountOut: 1n,
              tokenIn: WETH_ON_BASE_SEPOLIA_ADDRESS,
              tokenOut: WETH_ON_AZTEC_SEPOLIA_ADDRESS,
              mode: "public",
              data: padHex("0x"),
              recipient: padHex(privateKeyToAddress(process.env.EVM_PK as Hex)),
            },
            {
              onOrderOpened: ({ orderId, resolvedOrder }) => resolve({ orderId, resolvedOrder }),
            },
          )
        })
      const { orderId, resolvedOrder } = await openOrder()
      const txHash = await bridge.fillOrder({
        orderId,
        orderData: OrderDataEncoder.decode(resolvedOrder.fillInstructions[0].originData),
      })
      expect(isHex(txHash)).toBe(true)
    })
  })
})
