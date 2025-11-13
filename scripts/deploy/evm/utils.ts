import { readFileSync } from "fs"
import { join } from "path"

export function getContractArtifact(contractName: string) {
  const artifactPath = join(process.cwd(), "packages/evm/out", `${contractName}.sol`, `${contractName}.json`)

  try {
    const artifact = JSON.parse(readFileSync(artifactPath, "utf-8"))
    return {
      abi: artifact.abi,
      bytecode: artifact.bytecode.object as `0x${string}`,
    }
  } catch (error) {
    throw new Error(`Failed to load artifact for ${contractName}: ${error}`)
  }
}
