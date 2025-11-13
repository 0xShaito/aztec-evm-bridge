import { createAztecNodeClient } from "@aztec/aztec.js/node"
import { createStore } from "@aztec/kv-store/lmdb"
import { createPXE, getPXEConfig } from "@aztec/pxe/server"
import { TestWallet } from "@aztec/test-wallet/server"
import { SponsoredFPCContractArtifact } from "@aztec/noir-contracts.js/SponsoredFPC"
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee"
import { Fr } from "@aztec/aztec.js/fields"
import { getContractInstanceFromInstantiationParams } from "@aztec/aztec.js/contracts"
import { AztecAddress } from "@aztec/aztec.js/addresses"

const SPONSORED_FPC_SALT = new Fr(0)

async function getSponsoredFPCInstance() {
  return await getContractInstanceFromInstantiationParams(SponsoredFPCContractArtifact, { salt: SPONSORED_FPC_SALT })
}

async function getSponsoredFPCAddress() {
  const fpcInstance = await getSponsoredFPCInstance()
  return fpcInstance.address
}

export async function getAztecWallet(rpcUrl: string) {
  const { createLogger } = await import("@aztec/foundation/log")
  const logger = createLogger("aztec-wallet")

  logger.info("Connecting to Aztec node...")
  const node = createAztecNodeClient(rpcUrl)

  logger.info("Retrieving node information...")
  const nodeInfo = await node.getNodeInfo()

  const l1Contracts = nodeInfo.l1ContractAddresses
  if (!l1Contracts) {
    throw new Error("Failed to retrieve L1 contract addresses from node")
  }

  // Verify we have the required contracts
  const rollup = (l1Contracts as any).rollupAddress
  const registry = (l1Contracts as any).registryAddress
  const inbox = (l1Contracts as any).inboxAddress
  const outbox = (l1Contracts as any).outboxAddress

  if (!rollup || !registry || !inbox || !outbox) {
    throw new Error("Missing required L1 contract addresses")
  }

  // For devnet, set proverEnabled to false - the remote node handles proving
  const isDevnet = rpcUrl.includes("devnet") || rpcUrl.includes("aztec-labs.com")
  const proverEnabled = !isDevnet

  const fullConfig = {
    ...getPXEConfig(),
    l1Contracts,
    proverEnabled,
  }

  const storeName = process.env.PXE_STORE_NAME ?? "pxe-testnet"
  const store = await createStore(storeName, {
    dataDirectory: "store",
    dataStoreMapSizeKb: 1e6,
  })

  const fpcContractInstance = await getSponsoredFPCInstance()
  const wallet = await TestWallet.create(node, fullConfig, { store, useLogSuffix: true })

  await wallet.registerContract({
    instance: fpcContractInstance,
    artifact: SponsoredFPCContractArtifact,
  })

  // Add getAddress method for compatibility with original scripts
  ;(wallet as any).getAddress = () => {
    const accounts = (wallet as any).accounts
    if (!accounts || accounts.size === 0) {
      throw new Error("No accounts found in wallet. Add an account first.")
    }
    const firstAccount = Array.from(accounts.values())[0]
    return firstAccount.getAddress()
  }

  logger.info("✅ Aztec wallet initialized")
  return wallet
}

export async function getAztecAccount(wallet: TestWallet, secretKey: string, salt: string, deploy: boolean = false) {
  const fpcAddress = await getSponsoredFPCAddress()
  const paymentMethod = new SponsoredFeePaymentMethod(fpcAddress)

  const { addAccountWithSecretKey } = await import("../../packages/aztec/aztec_gateway_7683/scripts/utils.js")

  const account = await addAccountWithSecretKey({
    secretKey,
    salt,
    testWallet: wallet,
    paymentMethod,
    deploy,
  })

  return account
}

export async function getAztecPaymentMethod() {
  return new SponsoredFeePaymentMethod(await getSponsoredFPCAddress())
}
