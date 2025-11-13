import { createPublicClient, http, type Hex } from "viem"
import { baseSepolia } from "viem/chains"
import l2Gateway7683Abi from "../src/utils/abi/l2Gateway7683.js"

const GATEWAY_ADDRESS = "0x85752d27D29FF5D0683b8aE1B60705080CA7142f" as Hex
const ORDER_ID = "0x279c73c5741262eff939b430284b60a85ca89772773543c78fe3127c1d110ff1" as Hex

async function checkOrderExpiry() {
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  })

  console.log("Checking order:", ORDER_ID)
  console.log("Gateway:", GATEWAY_ADDRESS)

  // Get current block timestamp
  const block = await client.getBlock()
  const currentTimestamp = block.timestamp
  console.log("Current timestamp:", currentTimestamp, new Date(Number(currentTimestamp) * 1000).toISOString())

  // Get order status
  const status = (await client.readContract({
    address: GATEWAY_ADDRESS,
    abi: l2Gateway7683Abi,
    functionName: "orderStatus",
    args: [ORDER_ID],
  })) as Hex

  console.log("Order status:", status)

  // Convert bytes32 status to string
  const statusStr = Buffer.from(status.slice(2), "hex").toString("utf8").replace(/\0/g, "")
  console.log("Order status (string):", statusStr)

  if (statusStr === "OPENED") {
    // Try to get order data
    try {
      const [orderType, orderData] = (await client.readContract({
        address: GATEWAY_ADDRESS,
        abi: l2Gateway7683Abi,
        functionName: "openOrders",
        args: [ORDER_ID],
      })) as [Hex, Hex]

      console.log("\nOrder data length:", orderData.length)
      console.log("Order type:", orderType)

      // OrderData structure (packed):
      // orderType(1) + sender(32) + senderNonce(32) + inputToken(32) + outputToken(32)
      // + amountIn(32) + amountOut(32) + originDomain(4) + destinationDomain(4)
      // + destinationSettler(32) + recipient(32) + fillDeadline(4)

      // fillDeadline is at byte position 233 (0xE9)
      const fillDeadlineHex = orderData.slice(2 + 233 * 2, 2 + 233 * 2 + 8) // 4 bytes = 8 hex chars
      const fillDeadline = BigInt("0x" + fillDeadlineHex)

      console.log("\nFill deadline:", fillDeadline, new Date(Number(fillDeadline) * 1000).toISOString())
      console.log("Current time: ", currentTimestamp, new Date(Number(currentTimestamp) * 1000).toISOString())

      if (currentTimestamp > fillDeadline) {
        const expiredFor = currentTimestamp - fillDeadline
        console.log("\n✅ ORDER IS EXPIRED")
        console.log(`Expired ${expiredFor} seconds ago`)
      } else {
        const timeLeft = fillDeadline - currentTimestamp
        console.log("\n❌ ORDER IS NOT EXPIRED")
        console.log(`Will expire in ${timeLeft} seconds`)
      }
    } catch (error) {
      console.error("Error reading order data:", error)
    }
  } else {
    console.log(`Order is ${statusStr}, not OPENED`)
  }
}

checkOrderExpiry().catch(console.error)
