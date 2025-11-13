#!/usr/bin/env bun

import { execSync } from "child_process"
import { existsSync } from "fs"
import { join } from "path"

const logger = {
  info: (msg: string) => console.log(`[filler-runner] ${msg}`),
  error: (msg: string) => console.error(`[filler-runner] ❌ ${msg}`),
  warn: (msg: string) => console.warn(`[filler-runner] ⚠️  ${msg}`),
}

async function checkMongoDB(): Promise<boolean> {
  try {
    // Check if MongoDB container is running
    const result = execSync("docker ps --filter name=aztec-filler-mongo --format '{{.Names}}'", {
      encoding: "utf-8",
      stdio: "pipe",
    }).trim()

    if (result === "aztec-filler-mongo") {
      logger.info("MongoDB container is already running")
      return true
    }
  } catch (error) {
    // Docker command failed or container doesn't exist
  }

  // Try to start existing container
  try {
    execSync("docker start aztec-filler-mongo", { stdio: "pipe" })
    logger.info("Started existing MongoDB container")
    return true
  } catch (error) {
    // Container doesn't exist, will create it
  }

  return false
}

async function startMongoDB(): Promise<void> {
  logger.info("Starting MongoDB container...")
  const fillerPath = join(process.cwd(), "packages/filler")

  try {
    execSync("bun run mongo:start", {
      cwd: fillerPath,
      stdio: "inherit",
    })
    logger.info("✅ MongoDB container started")

    // Wait a moment for MongoDB to be ready
    logger.info("Waiting for MongoDB to be ready...")
    await new Promise((resolve) => setTimeout(resolve, 3000))
  } catch (error: any) {
    logger.error(`Failed to start MongoDB: ${error.message}`)
    logger.warn("You may need to start MongoDB manually:")
    logger.warn("  docker run -d --name aztec-filler-mongo -p 27017:27017 mongo:latest")
    throw error
  }
}

async function buildFiller(): Promise<void> {
  const fillerPath = join(process.cwd(), "packages/filler")
  const distPath = join(fillerPath, "dist")

  if (!existsSync(distPath) || !existsSync(join(distPath, "index.js"))) {
    logger.info("Building filler...")
    try {
      execSync("bun run build", {
        cwd: fillerPath,
        stdio: "inherit",
      })
      logger.info("✅ Filler built successfully")
    } catch (error: any) {
      logger.error(`Failed to build filler: ${error.message}`)
      throw error
    }
  } else {
    logger.info("Filler already built, skipping build step")
  }
}

async function createFillerEnv(): Promise<void> {
  const fillerPath = join(process.cwd(), "packages/filler")
  const envPath = join(fillerPath, ".env")
  const rootEnvPath = join(process.cwd(), ".env")

  // Load root .env values
  if (!existsSync(rootEnvPath)) {
    logger.error("Root .env file not found!")
    logger.error("Please run the deployment script first to create the root .env file")
    process.exit(1)
  }

  // Read root .env
  const rootEnv = await import("fs").then((fs) => fs.readFileSync(rootEnvPath, "utf-8"))
  const envVars: Record<string, string> = {}

  // Parse root .env
  for (const line of rootEnv.split("\n")) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=")
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join("=").trim()
      }
    }
  }

  // Support both DEPLOYED_* and direct variable names (for backwards compatibility)
  const aztecGateway = envVars.DEPLOYED_AZTEC_GATEWAY || envVars.AZTEC_GATEWAY_ADDRESS
  const aztecToken = envVars.DEPLOYED_AZTEC_TOKEN || envVars.AZTEC_TOKEN_ADDRESS
  const evmL2Gateway = envVars.DEPLOYED_EVM_L2_GATEWAY || envVars.L2_EVM_GATEWAY_ADDRESS
  const forwarder = envVars.DEPLOYED_EVM_FORWARDER || envVars.FORWARDER_ADDRESS

  // Check if we have required deployed addresses
  const requiredVars: Record<string, string | undefined> = {
    AZTEC_GATEWAY_ADDRESS: aztecGateway,
    AZTEC_TOKEN_ADDRESS: aztecToken,
    L2_EVM_GATEWAY_ADDRESS: evmL2Gateway,
    FORWARDER_ADDRESS: forwarder,
    AZTEC_RPC_URL: envVars.AZTEC_RPC_URL,
    AZTEC_SECRET_KEY: envVars.AZTEC_SECRET_KEY,
    AZTEC_SALT: envVars.AZTEC_SALT,
    EVM_RPC_URL: envVars.EVM_RPC_URL,
    EVM_PRIVATE_KEY: envVars.EVM_PRIVATE_KEY,
    EVM_CHAIN_ID: envVars.EVM_CHAIN_ID,
  }

  const missing = Object.entries(requiredVars)
    .filter(([key, value]) => !value)
    .map(([key]) => key)

  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(", ")}`)
    logger.error("Please run 'bun deploy:all' first to deploy contracts and populate .env")
    process.exit(1)
  }

  // Validate that gateway address looks like a valid Aztec address (64 hex chars)
  if (aztecGateway && !/^0x[a-fA-F0-9]{64}$/.test(aztecGateway)) {
    logger.warn(`⚠️  Warning: AZTEC_GATEWAY_ADDRESS (${aztecGateway}) doesn't look like a valid Aztec address`)
    logger.warn("Aztec addresses should be 64 hex characters (32 bytes). Please verify your deployment.")
  }

  // Create filler .env content
  const fillerEnvContent = `# Auto-generated from root .env - Do not edit manually
# Run 'bun deploy:all' to update deployed addresses

# EVM Configuration
PK_EVM=${envVars.EVM_PRIVATE_KEY}
EVM_L2_RPC_URL=${envVars.EVM_RPC_URL}
EVM_L2_CHAIN_ID=${envVars.EVM_CHAIN_ID}
FORWARDER_RPC_URL=${envVars.EVM_RPC_URL}
FORWARDER_CHAIN_ID=${envVars.EVM_CHAIN_ID}

# Aztec Configuration
AZTEC_RPC_URL=${envVars.AZTEC_RPC_URL}
AZTEC_SECRET_KEY=${envVars.AZTEC_SECRET_KEY}
AZTEC_SALT=${envVars.AZTEC_SALT}

# Contract Addresses (from deployment)
AZTEC_GATEWAY_ADDRESS=${aztecGateway}
AZTEC_TOKEN_ADDRESS=${aztecToken}
L2_EVM_GATEWAY_ADDRESS=${evmL2Gateway}
FORWARDER_ADDRESS=${forwarder}

# MongoDB Configuration
MONGO_DB_URI=mongodb://localhost:27017
MONGO_DB_NAME=filler

# Watch Intervals
EVM_WATCH_INTERVAL_TIME_MS=5000
AZTEC_WATCH_INTERVAL_TIME_MS=5000

# Silent Mode (set to true to reduce verbose polling logs, only show order/fill events)
SILENT_MODE=${envVars.SILENT_MODE || "true"}

# Optional: Beacon API and Rollup (for settlement)
BEACON_API_URL=
OP_STACK_ANCHOR_REGISTRY_ADDRESS=
AZTEC_ROLLUP_CONTRACT_L1_ADDRESS=
AZTEC_SANDBOX=false
`

  // Write filler .env
  const fs = await import("fs")
  fs.writeFileSync(envPath, fillerEnvContent)
  logger.info("✅ Created/updated filler .env file from root .env")
}

async function runFiller(): Promise<void> {
  const fillerPath = join(process.cwd(), "packages/filler")

  logger.info("Starting filler...")
  logger.info("Press Ctrl+C to stop")
  logger.info("")

  try {
    execSync("bun run dev", {
      cwd: fillerPath,
      stdio: "inherit",
    })
  } catch (error: any) {
    if (error.signal === "SIGINT" || error.signal === "SIGTERM") {
      logger.info("Filler stopped by user")
      process.exit(0)
    }
    logger.error(`Filler exited with error: ${error.message}`)
    throw error
  }
}

async function main() {
  try {
    logger.info("=== Filler Runner ===")
    logger.info("")

    // Create/update filler .env from root .env
    await createFillerEnv()

    // Check/start MongoDB
    const mongoRunning = await checkMongoDB()
    if (!mongoRunning) {
      await startMongoDB()
    }

    // Build filler if needed
    await buildFiller()

    // Run filler
    await runFiller()
  } catch (error: any) {
    logger.error(`Failed to run filler: ${error.message}`)
    if (error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

main()
