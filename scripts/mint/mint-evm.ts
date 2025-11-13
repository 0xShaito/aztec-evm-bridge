import { createLogger } from "@aztec/foundation/log"
import { writeContract } from "viem/actions"
import { config } from "../utils/config.js"
import { getEvmWalletClient, getEvmPublicClient } from "../utils/evm-client.js"
import * as readline from "readline"

const logger = createLogger("mint-evm")

function question(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

async function main() {
  logger.info("Starting EVM token minting...")

  const tokenAddress = config.deployed.evmToken || process.argv[2]
  if (!tokenAddress) {
    throw new Error("Token address required. Set DEPLOYED_EVM_TOKEN in .env or pass as argument")
  }

  const recipientsInput = await question("Enter recipient addresses (comma-separated): ")
  const recipients = recipientsInput
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const amountsInput = await question(
    `Enter amounts (comma-separated, same order as recipients, decimals will be added automatically): `,
  )
  const amounts = amountsInput
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  if (recipients.length === 0) {
    throw new Error("No recipients specified")
  }

  if (recipients.length !== amounts.length) {
    throw new Error("Recipients and amounts must have the same length")
  }

  const walletClient = getEvmWalletClient(config.evm.rpcUrl, config.evm.privateKey, config.evm.chainId)
  const publicClient = getEvmPublicClient(config.evm.rpcUrl, config.evm.chainId)
  const decimals = config.tokens.evm.decimals

  // Helper to convert human-readable amount to wei
  const parseAmount = (amountStr: string): bigint => {
    const amount = parseFloat(amountStr)
    if (isNaN(amount) || amount < 0) {
      throw new Error(`Invalid amount: ${amountStr}`)
    }
    // Multiply by 10^decimals and convert to BigInt
    const multiplier = BigInt(10 ** decimals)
    // Handle decimal places in input (e.g., "1.5" -> 1500000000000000000 for 18 decimals)
    const parts = amountStr.split(".")
    if (parts.length === 1) {
      // No decimal point
      return BigInt(amountStr) * multiplier
    } else {
      // Has decimal point
      const [whole, fractional] = parts
      const fractionalPart = fractional.padEnd(decimals, "0").slice(0, decimals)
      return BigInt(whole) * multiplier + BigInt(fractionalPart || "0")
    }
  }

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i] as `0x${string}`
    const amountStr = amounts[i] || "0"

    if (amountStr && parseFloat(amountStr) > 0) {
      const amount = parseAmount(amountStr)
      logger.info(`Minting ${amountStr} tokens (${amount} wei) to ${recipient}...`)
      const hash = await writeContract(walletClient, {
        address: tokenAddress as `0x${string}`,
        abi: [
          {
            type: "function",
            name: "mint",
            inputs: [
              { name: "to", type: "address" },
              { name: "amount", type: "uint256" },
            ],
            outputs: [],
            stateMutability: "nonpayable",
          },
        ],
        functionName: "mint",
        args: [recipient, amount],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      logger.info(`✅ Minted ${amountStr} tokens to ${recipient}`)
    }
  }

  logger.info("✅ All tokens minted successfully")
}

main().catch((err) => {
  logger.error(`❌ ${err}`)
  process.exit(1)
})
