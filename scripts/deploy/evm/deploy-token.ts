import { createLogger } from "@aztec/foundation/log"
import { encodeAbiParameters, parseAbiParameters } from "viem"
import { sendTransaction } from "viem/actions"
import { getEvmWalletClient, getEvmPublicClient } from "../../utils/evm-client.js"
import { config } from "../../utils/config.js"
import { getContractArtifact } from "./utils.js"
import { execSync } from "child_process"
import { existsSync } from "fs"
import { join } from "path"

const logger = createLogger("deploy-token")

function ensureEVMCompiled() {
  const evmPath = join(process.cwd(), "packages/evm")
  const outPath = join(evmPath, "out/TestToken.sol/TestToken.json")

  if (!existsSync(outPath)) {
    logger.info("EVM contracts not compiled, building...")
    execSync("forge build", { cwd: evmPath, stdio: "inherit" })
  }
}

async function main() {
  ensureEVMCompiled()
  logger.info("Deploying TestToken...")

  const walletClient = getEvmWalletClient(config.evm.rpcUrl, config.evm.privateKey, config.evm.chainId)
  const publicClient = getEvmPublicClient(config.evm.rpcUrl, config.evm.chainId)

  const artifact = getContractArtifact("TestToken")
  const encodedArgs = encodeAbiParameters(parseAbiParameters("string, string, uint8, uint256"), [
    config.tokens.evm.name,
    config.tokens.evm.symbol,
    config.tokens.evm.decimals,
    BigInt(config.tokens.evm.initialSupply),
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

  logger.info(`TestToken deployed at: ${address}`)
  console.log(address)
}

main().catch((err) => {
  logger.error(`❌ ${err}`)
  process.exit(1)
})
