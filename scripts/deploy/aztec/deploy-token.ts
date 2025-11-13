import { createLogger } from "@aztec/foundation/log"
import { Contract } from "@aztec/aztec.js/contracts"
import { TokenContractArtifact } from "@defi-wonderland/aztec-standards/current/artifacts/Token.js"
import { config } from "../../utils/config.js"
import { getAztecWallet, getAztecAccount, getAztecPaymentMethod } from "../../utils/aztec-client.js"

const logger = createLogger("deploy-token")

async function main() {
  logger.info("Deploying Aztec Token...")

  const wallet = await getAztecWallet(config.aztec.rpcUrl)
  const paymentMethod = await getAztecPaymentMethod()
  const account = await getAztecAccount(wallet, config.aztec.secretKey, config.aztec.salt, false)

  const token = await Contract.deploy(
    wallet,
    TokenContractArtifact,
    [
      config.tokens.aztec.name,
      config.tokens.aztec.symbol,
      config.tokens.aztec.decimals,
      account.getAddress(),
      account.getAddress(),
    ],
    "constructor_with_minter",
  )
    .send({
      from: account.getAddress(),
      fee: { paymentMethod },
    })
    .deployed({
      timeout: 120000,
    })

  await wallet.registerContract({
    instance: token.instance,
    artifact: TokenContractArtifact,
  })

  logger.info(`Token deployed: ${token.address.toString()}`)
  console.log(token.address.toString())
}

main().catch((err) => {
  logger.error(`❌ ${err}`)
  process.exit(1)
})
