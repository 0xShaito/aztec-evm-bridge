import { Fr } from "@aztec/aztec.js/fields"
import { createAztecNodeClient } from "@aztec/aztec.js/node"
import { TestWallet } from "@aztec/test-wallet/server"
import { createStore } from "@aztec/kv-store/lmdb"
import { getPXEConfig } from "@aztec/pxe/server"
import { AccountWithSecretKey } from "@aztec/aztec.js/account"
import { AztecAddress } from "@aztec/aztec.js/addresses"
import type { Hex } from "viem"

import { AztecGateway7683ContractArtifact } from "../utils/artifacts/AztecGateway7683/AztecGateway7683"
import { aztecSepolia, gatewayAddresses } from "../constants"

export interface AztecServiceConfig {
  aztecSecretKey?: Hex
  aztecKeySalt?: Hex
  aztecNodeUrl?: string
}

export class AztecService {
  #config: AztecServiceConfig
  #testWallet?: TestWallet
  #account?: AccountWithSecretKey
  #aztecGatewayRegistered = false

  constructor(config: AztecServiceConfig) {
    this.#config = config
  }

  async getWallet(): Promise<TestWallet> {
    if (!this.#testWallet) {
      const aztecNodeUrl = this.#config.aztecNodeUrl!
      const aztecNode = createAztecNodeClient(aztecNodeUrl)
      const fullConfig = {
        ...getPXEConfig(),
        l1Contracts: await aztecNode.getL1ContractAddresses(),
        proverEnabled: true,
      }
      const store = await createStore("aztecPxe", {
        dataDirectory: "store",
        dataStoreMapSizeKb: 1e6,
      })

      this.#testWallet = await TestWallet.create(aztecNode, fullConfig, {
        store,
        useLogSuffix: true,
      })
    }

    return this.#testWallet
  }

  async getAccount(): Promise<AccountWithSecretKey> {
    if (!this.#account) {
      const wallet = await this.getWallet()
      const secretKey = Fr.fromHexString(this.#config.aztecSecretKey!)
      const salt = Fr.fromHexString(this.#config.aztecKeySalt!)
      const accountContract = await wallet.createSchnorrAccount(secretKey, salt)
      this.#account = await accountContract.getAccount()
    }

    return this.#account
  }

  async maybeRegisterGateway(chainId: number): Promise<void> {
    if (this.#aztecGatewayRegistered) {
      return
    }

    const wallet = await this.getWallet()
    const gateway = gatewayAddresses[chainId]
    const instance = await createAztecNodeClient(aztecSepolia.rpcUrls.default.http[0]).getContract(
      AztecAddress.fromString(gateway),
    )
    if (!instance) {
      throw new Error(`Contract instance not found for gateway address ${gateway}`)
    }
    await wallet.registerContract({ instance, artifact: AztecGateway7683ContractArtifact })

    this.#aztecGatewayRegistered = true
  }
}
