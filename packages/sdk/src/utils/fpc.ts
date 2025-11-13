import { Fr } from "@aztec/aztec.js/fields"
import { getContractInstanceFromInstantiationParams, type ContractInstanceWithAddress } from "@aztec/aztec.js/contracts"
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee"
import { SponsoredFPCContractArtifact } from "@aztec/noir-contracts.js/SponsoredFPC"

const SPONSORED_FPC_SALT = new Fr(0)

export async function getSponsoredFPCInstance(): Promise<ContractInstanceWithAddress> {
  return await getContractInstanceFromInstantiationParams(SponsoredFPCContractArtifact, {
    salt: SPONSORED_FPC_SALT,
  })
}

export async function getSponsoredFPCAddress() {
  return (await getSponsoredFPCInstance()).address
}

export async function getSponsporedFeePaymentMethod() {
  const sponsoredFPC = await getSponsoredFPCInstance()
  return new SponsoredFeePaymentMethod(sponsoredFPC.address)
}
