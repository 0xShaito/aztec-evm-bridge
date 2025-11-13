import { createWalletClient, createPublicClient, http, type Chain } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import * as chains from "viem/chains"

export function getEvmChain(chainId: number): Chain {
  const chain = Object.values(chains).find((c) => c.id === chainId)
  if (!chain) {
    throw new Error(`Chain with ID ${chainId} not found`)
  }
  return chain as Chain
}

export function getEvmWalletClient(rpcUrl: string, privateKey: string, chainId: number) {
  const chain = getEvmChain(chainId)
  const account = privateKeyToAccount(privateKey as `0x${string}`)

  return createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  })
}

export function getEvmPublicClient(rpcUrl: string, chainId: number) {
  const chain = getEvmChain(chainId)

  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  })
}
