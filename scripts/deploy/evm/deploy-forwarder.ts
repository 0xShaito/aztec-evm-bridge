import { createLogger } from "@aztec/foundation/log"
import { encodeAbiParameters, parseAbiParameters } from "viem"
import { sendTransaction } from "viem/actions"
import { getEvmWalletClient, getEvmPublicClient } from "../../utils/evm-client.js"
import { config } from "../../utils/config.js"
import { getContractArtifact } from "./utils.js"
import { execSync } from "child_process"
import { existsSync } from "fs"
import { join } from "path"

const logger = createLogger("deploy-forwarder")

function ensureEVMCompiled() {
  const evmPath = join(process.cwd(), "packages/evm")
  const outPath = join(evmPath, "out/Forwarder.sol/Forwarder.json")

  if (!existsSync(outPath)) {
    logger.info("EVM contracts not compiled, building...")
    execSync("forge build", { cwd: evmPath, stdio: "inherit" })
  }
}

async function main() {
  ensureEVMCompiled()
  logger.info("Deploying Forwarder...")

  const l2Gateway = config.deployed.evmL2Gateway || process.argv[2]
  if (!l2Gateway) {
    throw new Error("L2Gateway address required. Set DEPLOYED_EVM_L2_GATEWAY in .env or pass as argument")
  }

  const walletClient = getEvmWalletClient(config.evm.rpcUrl, config.evm.privateKey, config.evm.chainId)
  const publicClient = getEvmPublicClient(config.evm.rpcUrl, config.evm.chainId)

  const artifact = getContractArtifact("Forwarder")
  const encodedArgs = encodeAbiParameters(parseAbiParameters("address, address, address, address"), [
    l2Gateway as `0x${string}`,
    config.evm.aztecBridge.inbox as `0x${string}`,
    config.evm.aztecBridge.outbox as `0x${string}`,
    config.evm.aztecBridge.anchorStateRegistry as `0x${string}`,
  ])
  const data = `${artifact.bytecode}${encodedArgs.slice(2)}` as `0x${string}`

  const hash = await sendTransaction(walletClient, {
    data,
  })

  logger.info(`Transaction hash: ${hash}`)

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  const address = receipt.contractAddress

  if (!address) {
    throw new Error("Contract address not found in receipt")
  }

  logger.info(`Forwarder deployed at: ${address}`)
  console.log(address)
}

main().catch((err) => {
  logger.error(`❌ ${err}`)
  process.exit(1)
})
