export interface AggregatedProxyPayment {
  payerName: string
  totalAmount: number
  transactionCount: number
  reason: string
}

export interface NewMappingInput {
  personName: string
  companyName: string
  accountSuffix?: string
  remark?: string
  source?: string
}
