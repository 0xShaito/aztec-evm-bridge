import type { Hex } from "viem"
import * as evmChains from "viem/chains"
import {
  aztecSepolia,
  gatewayAddresses,
  PRIVATE_ORDER,
  PRIVATE_ORDER_WITH_HOOK,
  PUBLIC_ORDER,
  PUBLIC_ORDER_WITH_HOOK,
} from "../constants"
import type { InternalChain, Order } from "../types"

export class BridgeHelpers {
  static getChainInAndOutByChainIds(
    chainIdIn: number,
    chainIdOut: number,
  ): { chainIn: InternalChain; chainOut: InternalChain } {
    return {
      chainIn: BridgeHelpers.getChainByChainId(chainIdIn),
      chainOut: BridgeHelpers.getChainByChainId(chainIdOut),
    }
  }

  static getChainByChainId(chainId: number): InternalChain {
    if (chainId === aztecSepolia.id) {
      return aztecSepolia
    }
    const key = Object.keys(evmChains).find((key) => (evmChains as any)[key].id === chainId)
    if (!key) {
      throw new Error(`Chain not found for chainId: ${chainId}`)
    }
    return (evmChains as any)[key]
  }

  static getOrderType(mode: Order["mode"]): number {
    switch (mode) {
      case "public":
        return PUBLIC_ORDER
      case "private":
        return PRIVATE_ORDER
      default:
        throw new Error(`Invalid order mode: ${mode}`)
    }
  }

  static getGatewaysByChainIds(chainIdIn: number, chainIdOut: number): { gatewayIn: Hex; gatewayOut: Hex } {
    const gatewayIn = gatewayAddresses[chainIdIn]
    const gatewayOut = gatewayAddresses[chainIdOut]

    if (!gatewayIn || !gatewayOut) {
      throw new Error(`Gateway not found for chain ${!gatewayIn ? chainIdIn : chainIdOut}`)
    }

    return { gatewayIn, gatewayOut }
  }
}
