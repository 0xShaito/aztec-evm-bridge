import { type Chain, createClient, createWalletClient, custom, type Hex, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"

export interface EvmServiceConfig {
  evmPrivateKey?: Hex
  evmProvider?: any
}

export class EvmService {
  #config: EvmServiceConfig

  constructor(config: EvmServiceConfig) {
    this.#config = config
  }

  async getWalletClientAndAddress(chain: Chain) {
    if (this.#config.evmPrivateKey) {
      const account = privateKeyToAccount(this.#config.evmPrivateKey)
      const client = createWalletClient({
        account,
        chain,
        transport: http(),
      })
      return { client, address: account.address }
    }

    if (this.#config.evmProvider) {
      const client = createWalletClient({
        chain,
        transport: custom(this.#config.evmProvider),
      })
      const [address] = await client.getAddresses()
      return { client, address }
    }

    throw new Error("No EVM provider or private key configured")
  }
}
