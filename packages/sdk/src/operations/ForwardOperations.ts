import type { Hex } from "viem"
import type { ForwardDetails } from "../types"

/**
 * Operations for forwarding messages through L1
 * - Forward settle orders to L2/Aztec
 * - Forward refund orders to L2/Aztec
 * - Finalize forwards with proofs
 */
export class ForwardOperations {
  // These would be injected dependencies from the main Bridge class
  // For now, this is a placeholder structure

  /**
   * Forward a settle order message through L1 to the destination chain
   */
  async forwardSettleOrder(details: ForwardDetails): Promise<Hex> {
    throw new Error("Not implemented - extract from Bridge.forwardSettleOrder")
  }

  /**
   * Forward a refund order message through L1 to the destination chain
   */
  async forwardRefundOrder(details: ForwardDetails): Promise<Hex> {
    throw new Error("Not implemented - extract from Bridge.forwardRefundOrder")
  }

  /**
   * Finalize a forward settle order with proof
   */
  async finalizeForwardSettleOrder(details: ForwardDetails): Promise<Hex> {
    throw new Error("Not implemented - extract from Bridge.finalizeForwardSettleOrder")
  }

  /**
   * Finalize a forward refund order with proof
   */
  async finalizeForwardRefundOrder(details: ForwardDetails): Promise<Hex> {
    throw new Error("Not implemented - extract from Bridge.finalizeForwardRefundOrder")
  }
}
