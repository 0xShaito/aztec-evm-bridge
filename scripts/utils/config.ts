import "dotenv/config"

function getEnv(key: string, required = true): string {
  const value = process.env[key]
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value || ""
}

function getEnvArray(key: string): string[] {
  const value = getEnv(key, false)
  if (!value) return []
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export const config = {
  aztec: {
    rpcUrl: getEnv("AZTEC_RPC_URL"),
    secretKey: getEnv("AZTEC_SECRET_KEY"),
    salt: getEnv("AZTEC_SALT"),
    deployWallet: getEnv("AZTEC_DEPLOY_WALLET", false) === "true",
  },
  evm: {
    rpcUrl: getEnv("EVM_RPC_URL"),
    privateKey: getEnv("EVM_PRIVATE_KEY"),
    chainId: parseInt(getEnv("EVM_CHAIN_ID")),
    permit2Address: getEnv("PERMIT2_ADDRESS"),
    aztecBridge: {
      inbox: getEnv("AZTEC_INBOX"),
      outbox: getEnv("AZTEC_OUTBOX"),
      anchorStateRegistry: getEnv("ANCHOR_STATE_REGISTRY"),
    },
  },
  tokens: {
    aztec: {
      name: getEnv("AZTEC_TOKEN_NAME"),
      symbol: getEnv("AZTEC_TOKEN_SYMBOL"),
      decimals: parseInt(getEnv("AZTEC_TOKEN_DECIMALS")),
    },
    evm: {
      name: getEnv("EVM_TOKEN_NAME"),
      symbol: getEnv("EVM_TOKEN_SYMBOL"),
      decimals: parseInt(getEnv("EVM_TOKEN_DECIMALS")),
      initialSupply: getEnv("EVM_TOKEN_INITIAL_SUPPLY"),
    },
  },
  deployed: {
    aztecGateway: getEnv("DEPLOYED_AZTEC_GATEWAY", false),
    aztecToken: getEnv("DEPLOYED_AZTEC_TOKEN", false),
    evmL2Gateway: getEnv("DEPLOYED_EVM_L2_GATEWAY", false),
    evmForwarder: getEnv("DEPLOYED_EVM_FORWARDER", false),
    evmToken: getEnv("DEPLOYED_EVM_TOKEN", false),
  },
}

export async function updateEnvFile(updates: Record<string, string>) {
  const fs = await import("fs")
  const path = await import("path")
  const envPath = path.join(process.cwd(), ".env")

  let envContent = ""
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf-8")
  }

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, "m")
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`)
    } else {
      envContent += `\n${key}=${value}`
    }
  }

  fs.writeFileSync(envPath, envContent)
}
