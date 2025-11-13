import { createLogger } from "@aztec/foundation/log"
import { config, updateEnvFile } from "../utils/config.js"
import { getEvmWalletClient, getEvmPublicClient } from "../utils/evm-client.js"
import { encodeAbiParameters, parseAbiParameters } from "viem"
import { sendTransaction, writeContract, waitForTransactionReceipt } from "viem/actions"
import { getContractArtifact } from "./evm/utils.js"
import { Contract } from "@aztec/aztec.js/contracts"
import { TokenContractArtifact } from "@defi-wonderland/aztec-standards/current/artifacts/Token.js"
import { EthAddress } from "@aztec/aztec.js/addresses"
import { Fr } from "@aztec/aztec.js/fields"
import { getAztecWallet, getAztecAccount, getAztecPaymentMethod } from "../utils/aztec-client.js"
import { execSync } from "child_process"
import { existsSync } from "fs"
import { join } from "path"

const logger = createLogger("deploy-all")

async function buildArtifacts() {
  logger.info("=== Building Artifacts ===")

  // Build EVM contracts
  logger.info("1. Checking EVM contracts...")
  const evmPath = join(process.cwd(), "packages/evm")
  const evmOutPath = join(evmPath, "out/L2Gateway7683.sol/L2Gateway7683.json")
  if (!existsSync(evmOutPath)) {
    logger.info("   Compiling EVM contracts...")
    execSync("forge build", { cwd: evmPath, stdio: "inherit" })
  }
  logger.info("✅ EVM contracts ready")

  // Build Aztec contracts
  logger.info("2. Checking Aztec contracts...")
  const aztecPath = join(process.cwd(), "packages/aztec/aztec_gateway_7683")

  // Check if artifacts exist, if not compile and generate
  const artifactsPath = join(aztecPath, "src/artifacts/AztecGateway7683.js")
  if (!existsSync(artifactsPath)) {
    logger.info("   Compiling Noir contracts...")
    execSync("aztec-nargo compile", { cwd: aztecPath, stdio: "inherit" })

    logger.info("   Post-processing contract...")
    execSync("aztec-postprocess-contract", { cwd: aztecPath, stdio: "inherit" })

    logger.info("   Generating TypeScript artifacts...")
    execSync("aztec codegen target --outdir src/artifacts --force", { cwd: aztecPath, stdio: "inherit" })
  }
  logger.info("✅ Aztec contracts ready")

  // Import AztecGateway7683Contract after artifacts are generated
  const { AztecGateway7683Contract } = await import(
    "../../packages/aztec/aztec_gateway_7683/src/artifacts/AztecGateway7683.ts"
  )
  return AztecGateway7683Contract
}

async function deployEVMContracts() {
  logger.info("=== Deploying EVM Contracts ===")

  const walletClient = getEvmWalletClient(config.evm.rpcUrl, config.evm.privateKey, config.evm.chainId)
  const publicClient = getEvmPublicClient(config.evm.rpcUrl, config.evm.chainId)

  // 1. Deploy L2Gateway7683
  logger.info("1. Deploying L2Gateway7683...")
  const gatewayArtifact = getContractArtifact("L2Gateway7683")
  const gatewayEncodedArgs = encodeAbiParameters(parseAbiParameters("address"), [
    config.evm.permit2Address as `0x${string}`,
  ])
  const gatewayData = `${gatewayArtifact.bytecode}${gatewayEncodedArgs.slice(2)}` as `0x${string}`
  const l2GatewayHash = await sendTransaction(walletClient, { data: gatewayData })
  const l2GatewayReceipt = await waitForTransactionReceipt(publicClient, { hash: l2GatewayHash })
  const l2GatewayAddress = l2GatewayReceipt.contractAddress!
  logger.info(`L2Gateway7683 deployed: ${l2GatewayAddress}`)
  await updateEnvFile({ DEPLOYED_EVM_L2_GATEWAY: l2GatewayAddress })

  // 2. Deploy Forwarder
  logger.info("2. Deploying Forwarder...")
  const forwarderArtifact = getContractArtifact("Forwarder")
  const forwarderEncodedArgs = encodeAbiParameters(parseAbiParameters("address, address, address, address"), [
    l2GatewayAddress,
    config.evm.aztecBridge.inbox as `0x${string}`,
    config.evm.aztecBridge.outbox as `0x${string}`,
    config.evm.aztecBridge.anchorStateRegistry as `0x${string}`,
  ])
  const forwarderData = `${forwarderArtifact.bytecode}${forwarderEncodedArgs.slice(2)}` as `0x${string}`
  const forwarderHash = await sendTransaction(walletClient, { data: forwarderData })
  const forwarderReceipt = await waitForTransactionReceipt(publicClient, { hash: forwarderHash })
  const forwarderAddress = forwarderReceipt.contractAddress!
  logger.info(`Forwarder deployed: ${forwarderAddress}`)
  await updateEnvFile({ DEPLOYED_EVM_FORWARDER: forwarderAddress })

  // 3. Set forwarder on L2Gateway7683
  logger.info("3. Setting forwarder on L2Gateway7683...")
  const setForwarderHash = await writeContract(walletClient, {
    address: l2GatewayAddress,
    abi: [
      {
        type: "function",
        name: "setForwarder",
        inputs: [{ name: "forwarder_", type: "address" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "setForwarder",
    args: [forwarderAddress],
  })
  await waitForTransactionReceipt(publicClient, { hash: setForwarderHash })
  logger.info("Forwarder set on L2Gateway7683")

  // 4. Deploy TestToken
  logger.info("4. Deploying TestToken...")
  const tokenArtifact = getContractArtifact("TestToken")
  const tokenEncodedArgs = encodeAbiParameters(parseAbiParameters("string, string, uint8, uint256"), [
    config.tokens.evm.name,
    config.tokens.evm.symbol,
    config.tokens.evm.decimals,
    BigInt(config.tokens.evm.initialSupply),
  ])
  const tokenData = `${tokenArtifact.bytecode}${tokenEncodedArgs.slice(2)}` as `0x${string}`
  const tokenHash = await sendTransaction(walletClient, { data: tokenData })
  const tokenReceipt = await waitForTransactionReceipt(publicClient, { hash: tokenHash })
  const tokenAddress = tokenReceipt.contractAddress!
  logger.info(`TestToken deployed: ${tokenAddress}`)
  await updateEnvFile({ DEPLOYED_EVM_TOKEN: tokenAddress })

  return { l2GatewayAddress, forwarderAddress, tokenAddress }
}

async function deployAztecContracts(
  evmAddresses: {
    l2GatewayAddress: string
    forwarderAddress: string
  },
  AztecGateway7683Contract: any,
) {
  logger.info("=== Deploying Aztec Contracts ===")

  logger.info("Setting up Aztec wallet...")
  const wallet = await getAztecWallet(config.aztec.rpcUrl)

  // Get L1 chain ID from Aztec node info
  const node = await import("@aztec/aztec.js/node").then((m) => m.createAztecNodeClient(config.aztec.rpcUrl))
  const nodeInfo = await node.getNodeInfo()
  const l1ChainId = nodeInfo.l1ChainId

  if (l1ChainId !== config.evm.chainId) {
    logger.warn(`⚠️  L1 Chain ID from Aztec node (${l1ChainId}) differs from EVM Chain ID (${config.evm.chainId})`)
    logger.warn(`Using L1 Chain ID from Aztec node for gateway deployment`)
  }

  const paymentMethod = await getAztecPaymentMethod()

  if (config.aztec.deployWallet) {
    logger.info("Deploying Aztec account on-chain (this may take 30-60 seconds)...")
  }

  const account = await getAztecAccount(wallet, config.aztec.secretKey, config.aztec.salt, config.aztec.deployWallet)

  // Ensure account is in wallet's accounts map (it should be after createSchnorrAccount)
  // Use account.getAddress() directly since we have the account object
  const accountAddress = account.getAddress()

  // 5. Deploy Aztec Gateway
  logger.info("5. Deploying Aztec Gateway...")
  logger.info(`Using L1 Chain ID: ${l1ChainId}`)
  const deployMethod = AztecGateway7683Contract.deploy(
    wallet,
    EthAddress.fromString(evmAddresses.l2GatewayAddress),
    l1ChainId,
    EthAddress.fromString(evmAddresses.forwarderAddress),
  )
  const gateway = await deployMethod
    .send({
      from: accountAddress,
      contractAddressSalt: Fr.random(),
      universalDeploy: true,
      fee: { paymentMethod },
    })
    .deployed({
      timeout: 120000,
    })
  await wallet.registerContract({
    instance: gateway.instance,
    artifact: AztecGateway7683Contract.artifact,
  })
  const aztecGatewayAddress = gateway.address.toString()
  logger.info(`Aztec Gateway deployed: ${aztecGatewayAddress}`)
  await updateEnvFile({ DEPLOYED_AZTEC_GATEWAY: aztecGatewayAddress })

  // 6. Deploy Aztec Token
  logger.info("6. Deploying Aztec Token...")
  const token = await Contract.deploy(
    wallet,
    TokenContractArtifact,
    [
      config.tokens.aztec.name,
      config.tokens.aztec.symbol,
      config.tokens.aztec.decimals,
      accountAddress,
      accountAddress,
    ],
    "constructor_with_minter",
  )
    .send({
      from: accountAddress,
      fee: { paymentMethod },
    })
    .deployed({
      timeout: 120000,
    })
  await wallet.registerContract({
    instance: token.instance,
    artifact: TokenContractArtifact,
  })
  const aztecTokenAddress = token.address.toString()
  logger.info(`Aztec Token deployed: ${aztecTokenAddress}`)
  await updateEnvFile({ DEPLOYED_AZTEC_TOKEN: aztecTokenAddress })

  return { aztecGatewayAddress, aztecTokenAddress }
}

async function configureContracts(
  evmAddresses: { l2GatewayAddress: string; forwarderAddress: string },
  aztecGatewayAddress: string,
) {
  logger.info("=== Configuring Contracts ===")

  // 7. Set Aztec Gateway on Forwarder and L2Gateway7683
  logger.info("7. Setting Aztec Gateway on Forwarder and L2Gateway7683...")
  const walletClient = getEvmWalletClient(config.evm.rpcUrl, config.evm.privateKey, config.evm.chainId)
  const publicClient = getEvmPublicClient(config.evm.rpcUrl, config.evm.chainId)

  // Convert Aztec address (32 bytes) to bytes32 - pad if needed
  let aztecGatewayBytes32 = aztecGatewayAddress as `0x${string}`
  if (aztecGatewayBytes32.length !== 66) {
    // Pad to 32 bytes (64 hex chars + 0x)
    aztecGatewayBytes32 = `0x${aztecGatewayBytes32.slice(2).padStart(64, "0")}` as `0x${string}`
  }

  // Set on Forwarder
  const setForwarderHash = await writeContract(walletClient, {
    address: evmAddresses.forwarderAddress,
    abi: [
      {
        type: "function",
        name: "setAztecGateway7683",
        inputs: [{ name: "aztecGateway7683", type: "bytes32" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "setAztecGateway7683",
    args: [aztecGatewayBytes32],
  })
  await waitForTransactionReceipt(publicClient, { hash: setForwarderHash })
  logger.info("Aztec Gateway set on Forwarder")

  // Set on L2Gateway7683
  const setL2GatewayHash = await writeContract(walletClient, {
    address: evmAddresses.l2GatewayAddress,
    abi: [
      {
        type: "function",
        name: "setAztecGateway7683",
        inputs: [{ name: "aztecGateway7683_", type: "bytes32" }],
        outputs: [],
        stateMutability: "nonpayable",
      },
    ],
    functionName: "setAztecGateway7683",
    args: [aztecGatewayBytes32],
  })
  await waitForTransactionReceipt(publicClient, { hash: setL2GatewayHash })
  logger.info("Aztec Gateway set on L2Gateway7683")
}

async function main() {
  try {
    logger.info("Starting full deployment...")

    // Build artifacts first
    const AztecGateway7683Contract = await buildArtifacts()

    const evmAddresses = await deployEVMContracts()
    const aztecAddresses = await deployAztecContracts(evmAddresses, AztecGateway7683Contract)
    await configureContracts(evmAddresses, aztecAddresses.aztecGatewayAddress)

    logger.info("")
    logger.info("=".repeat(60))
    logger.info("=== Deployment Complete ===")
    logger.info("=".repeat(60))
    logger.info("")
    logger.info("📋 Deployed Contract Addresses:")
    logger.info("")
    logger.info("EVM Contracts:")
    logger.info(`  • L2Gateway7683:    ${evmAddresses.l2GatewayAddress}`)
    logger.info(`  • Forwarder:         ${evmAddresses.forwarderAddress}`)
    logger.info(`  • TestToken:         ${evmAddresses.tokenAddress}`)
    logger.info("")
    logger.info("Aztec Contracts:")
    logger.info(`  • AztecGateway7683:  ${aztecAddresses.aztecGatewayAddress}`)
    logger.info(`  • Aztec Token:       ${aztecAddresses.aztecTokenAddress}`)
    logger.info("")
    logger.info("=".repeat(60))
    logger.info("All addresses have been saved to .env file")
    logger.info("=".repeat(60))
  } catch (err: any) {
    logger.error(`❌ Deployment failed: ${err.message}`)
    if (err.stack) {
      logger.error(err.stack)
    }
    process.exit(1)
  }
}

main().catch((err) => {
  logger.error(`❌ Fatal error: ${err}`)
  if (err && err.stack) {
    logger.error(err.stack)
  }
  process.exit(1)
})
