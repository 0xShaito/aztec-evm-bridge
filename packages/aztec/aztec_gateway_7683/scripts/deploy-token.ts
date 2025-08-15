import { createLogger, SponsoredFeePaymentMethod } from "@aztec/aztec.js"
import { Contract } from "@aztec/aztec.js"
import { TokenContractArtifact } from "@defi-wonderland/aztec-standards/current/artifacts/artifacts/Token.js"

import { getSponsoredFPCAddress } from "./fpc.js"
import { getPxe, getWalletFromSecretKey } from "./utils.js"

const [
  ,
  ,
  aztecSecretKey,
  aztecSalt,
  tokenName,
  tokenSymbol,
  tokenDecimals,
  rpcUrl = "https://aztec-alpha-testnet-fullnode.zkv.xyz",
] = process.argv

const main = async () => {
  const logger = createLogger("deploy-token")
  const pxe = await getPxe(rpcUrl)
  const paymentMethod = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress())
  const wallet = await getWalletFromSecretKey({
    secretKey: aztecSecretKey,
    salt: aztecSalt,
    pxe,
    deploy: false,
  })

  const token = await Contract.deploy(
    wallet,
    TokenContractArtifact,
    [tokenName, tokenSymbol, parseInt(tokenDecimals), wallet.getAddress(), wallet.getAddress()],
    "constructor_with_minter",
  )
    .send({
      fee: { paymentMethod },
    })
    .deployed({
      timeout: 120000,
    })

  await pxe.registerContract({
    instance: token.instance,
    artifact: TokenContractArtifact,
  })

  logger.info(`token deployed: ${token.address.toString()}`)
}

main().catch((err) => {
  console.error(`❌ ${err}`)
  process.exit(1)
})
