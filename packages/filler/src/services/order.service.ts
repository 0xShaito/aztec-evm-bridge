import { erc20Abi, padHex, sliceHex } from "viem"
import { AztecAddress } from "@aztec/aztec.js/addresses"
import { Fr } from "@aztec/aztec.js/fields"
import { TokenContract, TokenContractArtifact } from "@defi-wonderland/aztec-standards/current/artifacts/Token.js"
import { Mutex } from "async-mutex"
import { waitForTransactionReceipt } from "viem/actions"

import { getPaymentMethod, registerContractWithoutInstance } from "../utils/aztec.js"
// Import contract class dynamically to avoid module load-time errors
// We'll import it when needed instead of at module load time
import l2Gateway7683Abi from "../abis/l2Gateway7683.js"
import {
  AZTEC_7683_CHAIN_ID,
  ORDER_FILLED,
  ORDER_STATUS_FILLED,
  ORDER_STATUS_FILLED_PRIVATELY,
  PRIVATE_ORDER_HEX,
} from "../constants.js"
import BaseService from "./base.service.js"
import { hexToUintArray } from "../utils/bytes.js"

import type { Chain, Log } from "viem"
import type { BaseServiceOpts } from "./base.service.js"
import type MultiClient from "../MultiClient.js"
import type { ResolvedOrder } from "../types.js"

export type OrderServiceOpts = BaseServiceOpts & {
  aztecWallet: any
  aztecAccount: any
  aztecGatewayAddress: `0x${string}`
  evmMultiClient: MultiClient
  l2EvmChain: Chain
  l2EvmGatewayAddress: `0x${string}`
}

class OrderService extends BaseService {
  aztecWallet: any
  aztecAccount: any
  aztecGatewayAddress: `0x${string}`
  evmMultiClient: MultiClient
  l2EvmChain: Chain
  l2EvmGatewayAddress: `0x${string}`
  fillEvmOrderFromLogMutex: Mutex
  fillAztecOrderFromLogMutex: Mutex

  constructor(opts: OrderServiceOpts) {
    super(opts)

    this.aztecWallet = opts.aztecWallet
    this.aztecAccount = opts.aztecAccount
    this.evmMultiClient = opts.evmMultiClient
    this.aztecGatewayAddress = opts.aztecGatewayAddress
    this.l2EvmGatewayAddress = opts.l2EvmGatewayAddress
    this.l2EvmChain = opts.l2EvmChain

    this.fillEvmOrderFromLogMutex = new Mutex()
    this.fillAztecOrderFromLogMutex = new Mutex()

    this.monitorFilledPrivatelyOrders()
    setInterval(() => {
      this.monitorFilledPrivatelyOrders()
    }, 180000)
  }

  async monitorFilledPrivatelyOrders(): Promise<void> {
    try {
      this.logger.info("looking for initiated privately orders ...")

      const orders = await this.db
        .collection("orders")
        .find({
          status: ORDER_STATUS_FILLED_PRIVATELY,
        })
        .toArray()
      if (orders.length === 0) {
        this.logger.info("no orders initiated privately found ...")
        return
      }

      const { Contract } = await import("@aztec/aztec.js/contracts")
      const { getAztecGateway7683ContractArtifact } = await import("../utils/aztec.js")
      const artifact = await getAztecGateway7683ContractArtifact()
      const gateway = await Contract.at(AztecAddress.fromString(this.aztecGatewayAddress), artifact, this.aztecWallet)

      const orderIds = orders.map(({ orderId }) => orderId)
      const newOrdersStatus = await Promise.all(
        orderIds.map((orderId) =>
          gateway.methods
            .get_order_status(Fr.fromHexString(orderId))
            .simulate({ from: this.aztecAccount.getAddress() }),
        ),
      )

      const filledOrderIds = orderIds.filter((_, index) => newOrdersStatus[index] === ORDER_FILLED)
      if (filledOrderIds.length === 0) {
        this.logger.info("no orders filled privately found ...")
        return
      }

      this.logger.info(`orders ${filledOrderIds.join(",")} has been filled. updating db ...`)
      await this.db.collection("orders").updateMany(
        {
          orderId: { $in: filledOrderIds },
        },
        { $set: { status: ORDER_STATUS_FILLED } },
      )
    } catch (err) {
      this.logger.error(err)
    }
  }

  async fillAztecOrderFromLog(log: ResolvedOrder): Promise<void> {
    const release = await this.fillAztecOrderFromLogMutex.acquire()
    try {
      const { orderId, fillInstructions, maxSpent, minReceived } = log

      this.logger.info(`new order detected on Aztec. order id: ${orderId}. processing it ...`)
      if (await this.db.collection("orders").findOne({ orderId })) {
        this.logger.info(`order ${orderId} already stored in the db. skipping it ...`)
        return
      }

      const l2EvmClient = this.evmMultiClient.getClientByChain(this.l2EvmChain)
      const onChainStatus = await l2EvmClient.readContract({
        abi: l2Gateway7683Abi,
        address: this.l2EvmGatewayAddress,
        functionName: "orderStatus",
        args: [orderId],
      })
      if (onChainStatus !== padHex("0x0")) {
        this.logger.info(`order ${orderId} already processed by someone else. skipping it ...`)
        return
      }

      if (!fillInstructions?.length) throw new Error("Invalid fill instructions")
      if (!minReceived?.length) throw new Error("Invalid min received")
      if (!maxSpent?.length) throw new Error("Invalid max spent")
      const { originData } = fillInstructions[0] ?? {}
      const {
        amount: minReceivedAmount,
        token: minReceivedToken,
        // recipient: minReceivedRecipient,
        // chainId: minReceivedChainId
      } = minReceived[0] ?? {}
      const {
        amount: maxSpentAmount,
        token: rawMaxSpentToken,
        recipient: maxSpentRecipient,
        chainId: maxSpentChainId,
      } = maxSpent[0] ?? {}
      const maxSpentToken = rawMaxSpentToken ? sliceHex(rawMaxSpentToken, 12) : ""

      // TODO: check if minReceivedToken is supported
      if (maxSpentChainId !== this.l2EvmChain.id) throw new Error("Invalid chain id")

      // TODO: calculate the best price for this swap
      this.logger.info(
        `swapping from Aztec to ${this.l2EvmChain.name} ${minReceivedAmount} ${minReceivedToken} for ${maxSpentAmount} ${maxSpentToken} to ${maxSpentRecipient}...`,
      )

      // On the EVM chain, there's no distinction since the sender–receiver link is private on Aztec.
      // No claim is required on the EVM side.
      const orderStatus = ORDER_STATUS_FILLED

      this.logger.info(`approving l2EvmGateway to spend ${maxSpentAmount} tokens ...`)
      // @ts-ignore
      let txHash = await l2EvmClient.writeContract({
        abi: erc20Abi,
        //account: l2EvmClient.account.address,
        address: maxSpentToken! as `0x${string}`,
        args: [this.l2EvmGatewayAddress, maxSpentAmount!],
        chain: this.l2EvmChain,
        functionName: "approve",
      })
      await waitForTransactionReceipt(l2EvmClient, { hash: txHash })
      this.logger.info(`tokens approved. ${this.l2EvmChain.name}:${txHash}. verifying allowance ...`)

      // Verify approval with retry logic
      let allowance = 0n
      let retries = 3
      while (retries > 0) {
        allowance = (await l2EvmClient.readContract({
          abi: erc20Abi,
          address: maxSpentToken! as `0x${string}`,
          functionName: "allowance",
          args: [l2EvmClient.account!.address, this.l2EvmGatewayAddress],
        })) as bigint
        if (allowance >= maxSpentAmount!) {
          break
        }
        retries--
        if (retries > 0) {
          this.logger.info(`allowance not yet updated, retrying... (${retries} attempts left)`)
          await new Promise((resolve) => setTimeout(resolve, 5000))
        }
      }
      if (allowance < maxSpentAmount!) {
        throw new Error(
          `Token approval failed: allowance is ${allowance}, need ${maxSpentAmount} for gateway ${this.l2EvmGatewayAddress}`,
        )
      }
      this.logger.info(`allowance verified: ${allowance}. filling the order ...`)

      const fillerData = this.aztecAccount.getAddress().toString()
      // @ts-ignore
      txHash = await l2EvmClient.writeContract({
        abi: l2Gateway7683Abi,
        // account: l2EvmClient.account.address,
        address: this.l2EvmGatewayAddress,
        args: [orderId, originData, fillerData],
        chain: this.l2EvmChain,
        functionName: "fill",
      })
      await waitForTransactionReceipt(l2EvmClient, { hash: txHash })

      this.logger.info(
        `order ${orderId} filled succesfully. tx hash: ${this.l2EvmChain.name}:${txHash}. storing it ...`,
      )
      await this.addOrder({
        orderId,
        fillerData,
        fillTxHash: txHash,
        log,
        orderStatus,
      })
    } catch (err) {
      this.logger.error(err)
    } finally {
      release()
    }
  }

  async fillEvmOrderFromLog(log: Log): Promise<void> {
    const release = await this.fillEvmOrderFromLogMutex.acquire()
    // Declare variables outside try block so they're accessible in catch
    let orderId: string | undefined
    let maxSpentAmount: bigint | undefined
    let maxSpentToken: string | undefined
    let maxSpentRecipient: string | undefined
    let nextOrderStatus: string | undefined

    try {
      const {
        args: {
          orderId: orderIdFromLog,
          resolvedOrder: { fillInstructions, maxSpent, minReceived },
        },
      } = log as any

      orderId = orderIdFromLog
      this.logger.info(`new order detected on ${this.l2EvmChain.name}. order id: ${orderId}. processing it ...`)
      if (await this.db.collection("orders").findOne({ orderId })) {
        this.logger.info(`order ${orderId} already processed. skipping it ...`)
        return
      }

      const originData = fillInstructions[0].originData
      const minReceivedAmount = minReceived[0].amount
      const minReceivedToken = minReceived[0].token
      // const minReceivedRecipient = minReceived[0].recipient
      // const minReceivedChainId = minReceived[0].chainId
      maxSpentAmount = maxSpent[0].amount
      maxSpentToken = maxSpent[0].token
      maxSpentRecipient = maxSpent[0].recipient
      const maxSpentChainId = maxSpent[0].chainId

      // TODO: check if minReceivedToken is supported
      if (maxSpentChainId !== AZTEC_7683_CHAIN_ID) throw new Error("Invalid chain id")

      // TODO: calculate the best price for this swap
      this.logger.info(
        `swapping from ${this.l2EvmChain.name} to Aztec ${minReceivedAmount} ${minReceivedToken} for ${maxSpentAmount} ${maxSpentToken} to ${maxSpentRecipient}...`,
      )

      // Try to register the token contract
      try {
        this.logger.info("registering token contract into the PXE ...")
        await registerContractWithoutInstance(AztecAddress.fromString(maxSpentToken), {
          artifact: TokenContractArtifact,
        })
        this.logger.info("✅ Token contract registered successfully")
      } catch (err: any) {
        this.logger.warn(`⚠️  Could not register token contract with standard artifact: ${err.message}`)
        this.logger.info("Attempting to register token contract instance without artifact validation...")
        // Try to register just the instance - this will work if the artifact is already registered
        try {
          const node = await import("@aztec/aztec.js/node").then((m) =>
            m.createAztecNodeClient(process.env.AZTEC_RPC_URL || "http://localhost:8080"),
          )
          const contractInstance = await node.getContract(AztecAddress.fromString(maxSpentToken))
          if (contractInstance) {
            const pxe = await import("../utils/aztec.js").then((m) => m.getPxe())
            await pxe.registerContract({
              instance: contractInstance as any,
            })
            this.logger.info("✅ Token contract instance registered (artifact was already registered)")
          }
        } catch (err2: any) {
          this.logger.warn(`⚠️  Could not register token contract instance: ${err2.message}`)
          this.logger.warn("The token contract may need to be registered manually or the artifact may be incompatible")
        }
      }

      // Log all addresses for debugging
      this.logger.info(`Order details:`)
      this.logger.info(`  - maxSpentToken: ${maxSpentToken}`)
      this.logger.info(`  - maxSpentRecipient: ${maxSpentRecipient}`)
      this.logger.info(`  - minReceivedToken: ${minReceivedToken}`)
      this.logger.info(`  - aztecGatewayAddress: ${this.aztecGatewayAddress}`)

      // Try to get the token contract - it may work even if registration had warnings
      let token
      try {
        this.logger.info(`Attempting to get token contract at ${maxSpentToken}...`)
        token = await TokenContract.at(AztecAddress.fromString(maxSpentToken), this.aztecWallet)
        this.logger.info(`✅ Successfully retrieved token contract at ${maxSpentToken}`)
      } catch (err: any) {
        this.logger.error(`Failed to get token contract: ${err.message}`)
        this.logger.error(`Token address used: ${maxSpentToken}`)
        this.logger.error(`Recipient address: ${maxSpentRecipient}`)
        if (err.message?.includes("has not been registered")) {
          // Check if the error message contains a different address than what we're trying
          const errorAddressMatch = err.message.match(/0x[a-fA-F0-9]{64}/)
          if (errorAddressMatch && errorAddressMatch[0] !== maxSpentToken) {
            this.logger.error(
              `⚠️  Address mismatch detected! Error mentions ${errorAddressMatch[0]} but we're accessing ${maxSpentToken}`,
            )
            // Check if the error address matches the recipient
            if (errorAddressMatch[0] === maxSpentRecipient) {
              throw new Error(
                `The error mentions the recipient address (${maxSpentRecipient}) instead of the token address (${maxSpentToken}). ` +
                  `This suggests that maxSpentToken might be incorrectly set to the recipient address. ` +
                  `Please verify the order data structure. Original error: ${err.message}`,
              )
            }
            throw new Error(
              `Token contract registration error: The error mentions address ${errorAddressMatch[0]} ` +
                `but we're trying to access ${maxSpentToken}. ` +
                `This suggests a mismatch in the order data. ` +
                `Original error: ${err.message}`,
            )
          }
          throw new Error(
            `Token contract at ${maxSpentToken} is not registered in PXE. ` +
              `This may be due to a class ID mismatch. Please ensure the token contract matches the expected artifact. ` +
              `Original error: ${err.message}`,
          )
        }
        throw err
      }

      this.logger.info(`Getting Aztec Gateway contract at ${this.aztecGatewayAddress}...`)
      let aztecGateway
      try {
        const { Contract } = await import("@aztec/aztec.js/contracts")
        const { getAztecGateway7683ContractArtifact } = await import("../utils/aztec.js")
        const artifact = await getAztecGateway7683ContractArtifact()
        aztecGateway = await Contract.at(AztecAddress.fromString(this.aztecGatewayAddress), artifact, this.aztecWallet)
        this.logger.info(`✅ Successfully retrieved Aztec Gateway contract`)
      } catch (err: any) {
        if (err.message?.includes("has not been registered")) {
          this.logger.warn(`⚠️  Gateway contract not registered, attempting to register now...`)
          // Try to register the gateway contract dynamically
          try {
            const { getPxe, getAztecGateway7683ContractArtifact } = await import("../utils/aztec.js")
            const AztecGateway7683ContractArtifact = await getAztecGateway7683ContractArtifact()
            const node = await import("@aztec/aztec.js/node").then((m) =>
              m.createAztecNodeClient(process.env.AZTEC_RPC_URL || "http://localhost:8080"),
            )
            const pxe = getPxe()

            // Get the contract instance from the node
            const gatewayInstance = await node.getContract(AztecAddress.fromString(this.aztecGatewayAddress))
            if (!gatewayInstance) {
              throw new Error(`Gateway contract not found on node at ${this.aztecGatewayAddress}`)
            }

            // Check class IDs
            const { getContractClassFromArtifact } = await import("@aztec/aztec.js/contracts")
            const artifactClass = await getContractClassFromArtifact(AztecGateway7683ContractArtifact)
            const instanceClassId = gatewayInstance.currentContractClassId

            if (!instanceClassId.equals(artifactClass.id)) {
              this.logger.warn(
                `⚠️  Gateway contract class ID mismatch! ` +
                  `Instance: ${instanceClassId.toString()}, ` +
                  `Expected: ${artifactClass.id.toString()}. ` +
                  `Attempting to get artifact from node...`,
              )
              // Try to get the artifact from the node
              try {
                const classMetadata = await pxe.getContractClassMetadata(instanceClassId, true)
                if (classMetadata?.artifact) {
                  await pxe.registerContract({
                    instance: gatewayInstance as any,
                    artifact: classMetadata.artifact,
                  })
                  this.logger.info(
                    `✅ Gateway contract registered using artifact from node (class ID: ${instanceClassId.toString()})`,
                  )
                } else {
                  throw new Error("Contract class metadata not available from node")
                }
              } catch (err3: any) {
                this.logger.warn(`Could not get gateway contract class from node: ${err3.message}`)
                // Try registering without artifact - requires artifact to be pre-registered
                try {
                  await pxe.registerContract({
                    instance: gatewayInstance as any,
                  })
                  this.logger.info(
                    `✅ Gateway contract instance registered (artifact may need to be registered separately)`,
                  )
                } catch (err4: any) {
                  throw new Error(
                    `Failed to register gateway contract: Class ID mismatch and could not get artifact from node. ` +
                      `Instance class ID: ${instanceClassId.toString()}, Artifact class ID: ${artifactClass.id.toString()}. ` +
                      `Error: ${err4.message}`,
                  )
                }
              }
            } else {
              // Class IDs match - register normally
              const { registerContractWithoutInstance } = await import("../utils/aztec.js")
              await registerContractWithoutInstance(AztecAddress.fromString(this.aztecGatewayAddress), {
                artifact: AztecGateway7683ContractArtifact,
              })
              this.logger.info(`✅ Gateway contract registered successfully`)
            }

            // Try again
            const { Contract } = await import("@aztec/aztec.js/contracts")
            aztecGateway = await Contract.at(
              AztecAddress.fromString(this.aztecGatewayAddress),
              AztecGateway7683ContractArtifact,
              this.aztecWallet,
            )
            this.logger.info(`✅ Successfully retrieved Aztec Gateway contract after registration`)
          } catch (err2: any) {
            this.logger.error(`Failed to register gateway contract: ${err2.message}`)
            throw new Error(
              `Gateway contract at ${this.aztecGatewayAddress} is not registered in PXE and could not be registered. ` +
                `Please ensure the gateway contract is deployed and the artifact matches. ` +
                `Original error: ${err.message}, Registration error: ${err2.message}`,
            )
          }
        } else {
          throw err
        }
      }

      // Determine order status
      const orderType = `0x${originData.slice(538, 540)}`
      nextOrderStatus = orderType === PRIVATE_ORDER_HEX ? ORDER_STATUS_FILLED_PRIVATELY : ORDER_STATUS_FILLED
      const fillerData = padHex(this.evmMultiClient.getClientByChain(this.l2EvmChain).account!.address)

      let receipt
      const paymentMethod = await getPaymentMethod()
      const nonce = Fr.fromHexString(`0x${originData.slice(386, 450)}`)

      if (nextOrderStatus === ORDER_STATUS_FILLED_PRIVATELY) {
        this.logger.info(`creating authwit to fill the order ${orderId} ...`)
        const witness = await this.aztecAccount.createAuthWit({
          caller: AztecAddress.fromString(this.aztecGatewayAddress),
          action: token.methods.transfer_private_to_public(
            this.aztecAccount.getAddress(),
            AztecAddress.fromString(this.aztecGatewayAddress),
            maxSpentAmount,
            nonce,
          ),
        })
        this.logger.info(`filling the private order ${orderId} ...`)
        receipt = await aztecGateway.methods
          .fill_private(hexToUintArray(orderId), hexToUintArray(originData), hexToUintArray(fillerData))
          .with({
            authWitnesses: [witness],
          })
          .send({
            from: this.aztecAccount.getAddress(),
            fee: { paymentMethod },
          })
          .wait({
            timeout: 120000,
          })
      } else {
        this.logger.info(`setting public authwit to fill the order ${orderId} ...`)
        const recipient = `0x${originData.slice(66, 66 + 64)}`
        // @ts-ignore
        await (
          await this.aztecWallet.setPublicAuthWit(
            this.aztecAccount.getAddress(),
            {
              caller: AztecAddress.fromString(this.aztecGatewayAddress),
              action: token.methods.transfer_public_to_public(
                this.aztecAccount.getAddress(),
                AztecAddress.fromString(recipient),
                maxSpentAmount,
                nonce,
              ),
            },
            true,
          )
        )
          .send({ from: this.aztecAccount.getAddress(), fee: { paymentMethod } })
          .wait({
            timeout: 120000,
          })

        this.logger.info(`filling the public order ${orderId} ...`)

        receipt = await aztecGateway.methods
          .fill(hexToUintArray(orderId), hexToUintArray(originData), hexToUintArray(fillerData))
          .send({
            from: this.aztecAccount.getAddress(),
            fee: { paymentMethod },
          })
          .wait({
            timeout: 120000,
          })
      }

      // Check if transaction was successful
      if (receipt.status !== "success") {
        const errorMsg = receipt.error || "Unknown error"
        throw new Error(
          `Transaction ${receipt.txHash.toString()} failed with status ${receipt.status}. Error: ${errorMsg}`,
        )
      }

      this.logger.info(
        `order ${orderId} filled succesfully. tx hash: Aztec:${receipt.txHash.toString()}. storing it ...`,
      )
      await this.addOrder({
        orderId,
        fillerData,
        fillTxHash: receipt.txHash.toString(),
        log: (log as any).args,
        orderStatus: nextOrderStatus,
      })
    } catch (err: any) {
      this.logger.error("Error occurred while filling order:")

      // Try to extract detailed error information
      let errorDetails = {
        message: err?.message || String(err),
        orderId: orderId || "unknown",
        orderType:
          nextOrderStatus === ORDER_STATUS_FILLED_PRIVATELY
            ? "private"
            : nextOrderStatus === ORDER_STATUS_FILLED
              ? "public"
              : "unknown",
        maxSpentAmount: maxSpentAmount?.toString() || "unknown",
        maxSpentToken: maxSpentToken || "unknown",
        maxSpentRecipient: maxSpentRecipient || "unknown",
        aztecGatewayAddress: this.aztecGatewayAddress,
      }

      // Check if error has a receipt property (from .wait() call)
      if (err?.receipt) {
        const receipt = err.receipt
        errorDetails = {
          ...errorDetails,
          txHash: receipt.txHash?.toString(),
          status: receipt.status,
          error: receipt.error,
          blockNumber: receipt.blockNumber,
          blockHash: receipt.blockHash?.toString(),
        }
        this.logger.error(`Transaction receipt details:`, errorDetails)
      } else if (err?.txHash) {
        // Error might have txHash directly
        errorDetails = {
          ...errorDetails,
          txHash: err.txHash.toString(),
          status: err.status,
          error: err.error || err.message,
        }
        this.logger.error(`Transaction error details:`, errorDetails)
      } else {
        // Log the error object structure for debugging
        this.logger.error(`Error details:`, errorDetails)
        this.logger.error(`Full error object:`, {
          name: err?.name,
          message: err?.message,
          stack: err?.stack,
          cause: err?.cause,
          ...(typeof err === "object" ? Object.keys(err) : []),
        })
      }

      // Re-throw with more context
      throw err
    } finally {
      release()
    }
  }

  private async addOrder({
    orderId,
    fillerData,
    fillTxHash,
    orderStatus,
    log,
  }: {
    orderId: `0x${string}`
    fillerData: `0x${string}`
    fillTxHash: `0x${string}`
    orderStatus: "filledPrivately" | "filled"
    log: any
  }) {
    return await this.db.collection("orders").findOneAndUpdate(
      { orderId },
      {
        $setOnInsert: {
          ...log,
          fillTxHash: fillTxHash,
          fillerData,
          status: orderStatus,
        },
      },
      { upsert: true, returnDocument: "after" },
    )
  }
}

export default OrderService
