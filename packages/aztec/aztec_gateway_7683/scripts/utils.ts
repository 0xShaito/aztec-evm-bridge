import { AztecNode, createAztecNodeClient } from "@aztec/aztec.js/node"
import { PXE } from "@aztec/pxe/client/bundle"
import { Fr } from "@aztec/aztec.js/fields"
import { FeePaymentMethod } from "@aztec/aztec.js/fee"
import { createStore } from "@aztec/kv-store/lmdb"
import { createPXE, getPXEConfig } from "@aztec/pxe/server"
import { deriveSigningKey } from "@aztec/stdlib/keys"
import { AztecAddress } from "@aztec/aztec.js/addresses"
import { getSponsoredFPCInstance } from "./fpc.js"
import { SponsoredFPCContractArtifact } from "@aztec/noir-contracts.js/SponsoredFPC"
import { rmSync } from "fs"
import { TestWallet } from "@aztec/test-wallet/server"
import { AccountWithSecretKey } from "@aztec/aztec.js/account"

export const getPXEs = async (names: string[]): Promise<{ pxes: PXE[]; node: AztecNode }> => {
  const url = "http://localhost:8080"
  const node = createAztecNodeClient(url)

  const fullConfig = {
    ...getPXEConfig(),
    l1Contracts: await node.getL1ContractAddresses(),
    proverEnabled: false,
  }

  const pxes: PXE[] = []

  // Delete the previous store dir before creating a new one
  rmSync(`store`, { recursive: true, force: true })
  for (const name of names) {
    const store = await createStore(name, {
      dataDirectory: "store",
      dataStoreMapSizeKb: 1e6,
    })
    const pxe = await createPXE(node, fullConfig, {
      store,
      useLogSuffix: true,
    })
    console.log(`${name} info`, await pxe.getPXEInfo())
    pxes.push(pxe)
  }

  return { pxes, node }
}

export const getNode = (rpcUrl: string) => createAztecNodeClient(rpcUrl)

export const getPxe = async (rpcUrl: string) => {
  const node = getNode(rpcUrl)
  const fullConfig = {
    ...getPXEConfig(),
    l1Contracts: await node.getL1ContractAddresses(),
    proverEnabled: true,
  }
  const store = await createStore(process.env.PXE_STORE_NAME ?? "pxe-testnet", {
    dataDirectory: "store",
    dataStoreMapSizeKb: 1e6,
  })
  const pxe = await createPXE(node, fullConfig, {
    store,
    useLogSuffix: true,
  })

  const fpcContractInstance = await getSponsoredFPCInstance()
  await pxe.registerContract({
    instance: fpcContractInstance,
    artifact: SponsoredFPCContractArtifact,
  })

  return pxe
}

export const getTestWallet = async (rpcUrl: string) => {
  const node = getNode(rpcUrl)

  const fullConfig = {
    ...getPXEConfig(),
    l1Contracts: await node.getL1ContractAddresses(),
    proverEnabled: true,
  }

  const store = await createStore(process.env.PXE_STORE_NAME ?? "pxe-testnet", {
    dataDirectory: "store",
    dataStoreMapSizeKb: 1e6,
  })

  const fpcContractInstance = await getSponsoredFPCInstance()

  const wallet = await TestWallet.create(node, fullConfig, { store, useLogSuffix: true })
  await wallet.registerContract({
    instance: fpcContractInstance,
    artifact: SponsoredFPCContractArtifact,
  })

  return wallet
}

export const addRandomAccount = async ({
  paymentMethod,
  testWallet,
}: {
  paymentMethod: FeePaymentMethod
  testWallet: TestWallet
}): Promise<any> => {
  const secretKey = Fr.random()
  const salt = Fr.random()
  const signingKey = deriveSigningKey(secretKey)
  const accountContract = await testWallet.createSchnorrAccount(secretKey, salt)
  const deployMethod = await accountContract.getDeployMethod()
  await deployMethod.send({ from: AztecAddress.ZERO, fee: { paymentMethod } }).wait()
  return await accountContract.getAccount()
}

export const addAccountWithSecretKey = async ({
  paymentMethod,
  testWallet,
  secretKey: sk,
  deploy = false,
  salt: s,
}: {
  secretKey: string
  paymentMethod?: FeePaymentMethod
  testWallet: TestWallet
  deploy?: boolean
  salt: string
}): Promise<AccountWithSecretKey> => {
  const salt = Fr.fromHexString(s)
  const secretKey = Fr.fromHexString(sk)
  const accountContract = await testWallet.createSchnorrAccount(secretKey, salt)
  const account = await accountContract.getAccount()
  const accountAddress = account.getAddress()

  if (deploy) {
    if (!paymentMethod) {
      throw new Error("paymentMethod is required when deploy is true")
    }

    const { createLogger } = await import("@aztec/foundation/log")
    const logger = createLogger("deploy-account")

    // Check if account is already deployed
    try {
      const node = (testWallet as any).node
      if (node) {
        const contractInstance = await node.getContract(accountAddress)
        if (contractInstance) {
          logger.info(`Account ${accountAddress.toString()} is already deployed, skipping deployment`)
          return account
        }
      }
    } catch (error: any) {
      // If we can't check, proceed with deployment attempt
      logger.info("Could not verify account deployment status, attempting deployment...")
    }

    logger.info("Deploying account contract on-chain...")
    logger.info("This may take 30-60 seconds (proof generation + mining)")

    const deployMethod = await accountContract.getDeployMethod()
    const deployOptions = { from: AztecAddress.ZERO, fee: { paymentMethod } }

    // Set up a simple progress indicator
    const progressInterval = setInterval(() => {
      logger.info("Still waiting for account deployment...")
    }, 15000) // Every 15 seconds

    try {
      const receipt = await deployMethod.send(deployOptions).wait()
      clearInterval(progressInterval)
      logger.info(`✅ Account deployed successfully (tx: ${receipt.txHash.toString()})`)
    } catch (error: any) {
      clearInterval(progressInterval)

      // Check if error is due to account already being deployed
      if (error?.message?.includes("Existing nullifier") || error?.cause?.message?.includes("Existing nullifier")) {
        logger.info(`Account ${accountAddress.toString()} is already deployed (existing nullifier detected)`)
        logger.info("Skipping deployment and using existing account")
        return account
      }

      logger.error(`❌ Account deployment failed: ${error.message}`)
      throw error
    }
  }

  return account
}
