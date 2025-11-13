import { AztecAddress } from "@aztec/aztec.js/addresses"
import { createLogger } from "@aztec/foundation/log"
import { TokenContract, TokenContractArtifact } from "@defi-wonderland/aztec-standards/current/artifacts/Token.js"
import { config } from "../utils/config.js"
import { getAztecWallet, getAztecAccount, getAztecPaymentMethod } from "../utils/aztec-client.js"
import * as readline from "readline"

const logger = createLogger("mint-aztec")

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
  logger.info("Starting Aztec token minting...")

  const tokenAddress = config.deployed.aztecToken || process.argv[2]
  if (!tokenAddress) {
    throw new Error("Token address required. Set DEPLOYED_AZTEC_TOKEN in .env or pass as argument")
  }

  const recipientsInput = await question("Enter recipient addresses (comma-separated): ")
  const recipients = recipientsInput
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  if (recipients.length === 0) {
    throw new Error("No recipients specified")
  }

  const privateAmountsInput = await question(
    "Enter private amounts (comma-separated, same order as recipients, decimals will be added automatically): ",
  )
  const privateAmounts = privateAmountsInput
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const publicAmountsInput = await question(
    "Enter public amounts (comma-separated, same order as recipients, decimals will be added automatically): ",
  )
  const publicAmounts = publicAmountsInput
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  if (recipients.length !== privateAmounts.length || recipients.length !== publicAmounts.length) {
    throw new Error("Recipients, private amounts, and public amounts must have the same length")
  }

  const wallet = await getAztecWallet(config.aztec.rpcUrl)
  const paymentMethod = await getAztecPaymentMethod()
  const account = await getAztecAccount(wallet, config.aztec.secretKey, config.aztec.salt, false)

  const token = await TokenContract.at(AztecAddress.fromString(tokenAddress), wallet)
  const decimals = config.tokens.aztec.decimals

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
    const recipient = recipients[i]
    const privateAmountStr = privateAmounts[i] || "0"
    const publicAmountStr = publicAmounts[i] || "0"
    const privateAmount = parseAmount(privateAmountStr)
    const publicAmount = parseAmount(publicAmountStr)

    logger.info(`Minting to ${recipient}...`)

    if (privateAmount > 0n) {
      logger.info(`  Minting ${privateAmountStr} tokens (${privateAmount}) to private balance...`)
      await token.methods
        .mint_to_private(AztecAddress.fromString(recipient), privateAmount)
        .send({
          from: account.getAddress(),
          fee: { paymentMethod },
        })
        .wait({
          timeout: 120000,
        })
      logger.info(`  ✅ Minted ${privateAmountStr} tokens to private balance`)
    }

    if (publicAmount > 0n) {
      logger.info(`  Minting ${publicAmountStr} tokens (${publicAmount}) to public balance...`)
      await token.methods
        .mint_to_public(AztecAddress.fromString(recipient), publicAmount)
        .send({
          from: account.getAddress(),
          fee: { paymentMethod },
        })
        .wait({
          timeout: 120000,
        })
      logger.info(`  ✅ Minted ${publicAmountStr} tokens to public balance`)
    }
  }

  logger.info("✅ All tokens minted successfully")
}

main().catch((err) => {
  logger.error(`❌ ${err}`)
  process.exit(1)
})
