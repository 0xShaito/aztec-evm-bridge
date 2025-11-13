import { Db } from "mongodb"
import { Logger } from "winston"

export type BaseServiceOpts = {
  db: Db
  logger: Logger
  silent?: boolean
}

class BaseService {
  db: Db
  logger: Logger
  protected silent: boolean

  constructor(opts: BaseServiceOpts) {
    this.logger = opts.logger.child({ service: this.constructor.name })
    this.db = opts.db
    this.silent = opts.silent ?? false
  }
}

export default BaseService
