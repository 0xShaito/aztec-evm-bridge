import { createLogger } from "@aztec/foundation/log"
import type { DeployOptions } from "@aztec/aztec.js/contracts"
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee"
import { Contract } from "@aztec/aztec.js"
import { TokenContractArtifact } from "@defi-wonderland/aztec-standards/current/artifacts/Token.js"

import { getSponsoredFPCAddress } from "./fpc.js"
import { getTestWallet, addAccountWithSecretKey } from "./utils.js"

const [, , aztecSecretKey, aztecSalt, tokenName, tokenSymbol, tokenDecimals, rpcUrl = "https://devnet.aztec-labs.com"] =
  process.argv

const main = async () => {
  const logger = createLogger("deploy-token")
  const wallet = await getTestWallet(rpcUrl)
  const paymentMethod = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress())
  const account = await addAccountWithSecretKey({
    secretKey: aztecSecretKey,
    salt: aztecSalt,
    testWallet: wallet,
    deploy: false,
  })

  const deployOptions: DeployOptions = {
    from: wallet.getAddress(),
    fee: { paymentMethod },
  }

  const token = await Contract.deploy(
    wallet,
    TokenContractArtifact,
    [tokenName, tokenSymbol, parseInt(tokenDecimals), wallet.getAddress(), wallet.getAddress()],
    "constructor_with_minter",
  )
    .send(deployOptions)
    .deployed({
      timeout: 120000,
    })

  await wallet.registerContract({
    instance: token.instance,
    artifact: TokenContractArtifact,
  })

  logger.info(`token deployed: ${token.address.toString()}`)
}

main().catch((err) => {
  console.error("❌", err)
  if (err && err.stack) {
    console.error(err.stack)
  }
  process.exit(1)
})
