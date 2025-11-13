import { createLogger } from "@aztec/foundation/log"
import { EthAddress } from "@aztec/aztec.js/addresses"
import { Fr } from "@aztec/aztec.js/fields"
import { config } from "../../utils/config.js"
import { getAztecWallet, getAztecAccount, getAztecPaymentMethod } from "../../utils/aztec-client.js"
import { execSync } from "child_process"
import { existsSync } from "fs"
import { join } from "path"

const logger = createLogger("deploy-gateway")

async function ensureArtifacts() {
  const aztecPath = join(process.cwd(), "packages/aztec/aztec_gateway_7683")
  const artifactsPath = join(aztecPath, "src/artifacts/AztecGateway7683.js")

  if (!existsSync(artifactsPath)) {
    logger.info("Artifacts not found, building...")
    execSync("aztec-nargo compile", { cwd: aztecPath, stdio: "inherit" })
    execSync("aztec-postprocess-contract", { cwd: aztecPath, stdio: "inherit" })
    execSync("aztec codegen target --outdir src/artifacts --force", { cwd: aztecPath, stdio: "inherit" })
  }

  const { AztecGateway7683Contract } = await import(
    "../../../packages/aztec/aztec_gateway_7683/src/artifacts/AztecGateway7683.ts"
  )
  return AztecGateway7683Contract
}

async function main() {
  logger.info("Deploying Aztec Gateway...")

  const AztecGateway7683Contract = await ensureArtifacts()

  const l2Gateway = config.deployed.evmL2Gateway || process.argv[2]
  const forwarder = config.deployed.evmForwarder || process.argv[3]
  const l2GatewayDomain = config.evm.chainId.toString() || process.argv[4]

  if (!l2Gateway || !forwarder || !l2GatewayDomain) {
    throw new Error("L2Gateway, Forwarder addresses and chain ID required")
  }

  const wallet = await getAztecWallet(config.aztec.rpcUrl)
  const paymentMethod = await getAztecPaymentMethod()
  const account = await getAztecAccount(wallet, config.aztec.secretKey, config.aztec.salt, config.aztec.deployWallet)

  logger.info("Deploying gateway contract...")
  const deployMethod = AztecGateway7683Contract.deploy(
    wallet,
    EthAddress.fromString(l2Gateway),
    parseInt(l2GatewayDomain),
    EthAddress.fromString(forwarder),
  )

  const account = await getAztecAccount(wallet, config.aztec.secretKey, config.aztec.salt, config.aztec.deployWallet)

  const gateway = await deployMethod
    .send({
      from: account.getAddress(),
      contractAddressSalt: Fr.random(),
      universalDeploy: true,
      fee: { paymentMethod },
    })
    .deployed({
      timeout: 120000,
    })

  logger.info("Gateway deployed, registering...")
  await wallet.registerContract({
    instance: gateway.instance,
    artifact: AztecGateway7683Contract.artifact,
  })

  logger.info(`Gateway deployed: ${gateway.address.toString()}`)
  console.log(gateway.address.toString())
}

main().catch((err) => {
  logger.error(`❌ ${err}`)
  process.exit(1)
})
