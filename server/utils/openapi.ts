export function buildOpenApiSpec(serverUrl = 'https://explorer.kristalteknoloji.com') {
  const errorSchema = {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      code: { type: 'string', example: 'INVALID_PARAMETER' },
      error: { type: 'string' }
    },
    required: ['success', 'error']
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'KristaTech (KRISTA) Blockchain Explorer API',
      version: '2.1.0',
      description:
        'Public REST & Server-Sent Events (SSE) API for the KristaTech (KRISTA) hybrid PoW/PoS ADAM 11+1 blockchain, supporting wallets, exchanges, validator monitors, MESCAL Taproot contracts, and supply trackers.'
    },
    servers: [
      {
        url: serverUrl,
        description: 'KristaTech Mainnet Explorer'
      }
    ],
    tags: [
      { name: 'Chain Telemetry', description: 'Node health, network status, search, and analytics' },
      { name: 'Supply / Trackers', description: 'Coin supply and rich list metrics' },
      { name: 'Ledger', description: 'Blocks and transactions' },
      { name: 'Wallet / Address', description: 'Light-wallet balances, UTXOs, and filtered address history' },
      { name: 'Transactions & Fees', description: 'Fee estimation, raw transaction decoding, and opt-in broadcast' },
      { name: 'Consensus & Validators', description: 'ADAM Dual-Track validator pool, LLMQ, and per-validator analytics' },
      { name: 'Contracts', description: 'MESCAL Taproot smart contracts and OP_RETURN payloads' },
      { name: 'Mempool & Streaming', description: 'Unconfirmed queue and real-time Server-Sent Events (SSE)' }
    ],
    components: {
      schemas: {
        ErrorResponse: errorSchema
      }
    },
    paths: {
      '/api/health': {
        get: {
          tags: ['Chain Telemetry'],
          summary: 'Node, indexer sync lag, and SSE service health check',
          responses: {
            '200': { description: 'Explorer is healthy or catching up' },
            '503': { description: 'RPC node or SQLite database is unavailable' }
          }
        }
      },
      '/api/openapi.json': {
        get: {
          tags: ['Chain Telemetry'],
          summary: 'OpenAPI 3.1.0 schema specification',
          responses: {
            '200': { description: 'OpenAPI JSON document' }
          }
        }
      },
      '/api/status': {
        get: {
          tags: ['Chain Telemetry'],
          summary: 'Live network status, consensus milestone, mempool summary, latest blocks & txs',
          responses: {
            '200': { description: 'Live network telemetry object' },
            '500': { description: 'Internal error' }
          }
        }
      },
      '/api/supply': {
        get: {
          tags: ['Supply / Trackers'],
          summary: 'Token supply report in JSON or plain-text format',
          parameters: [
            {
              name: 'q',
              in: 'query',
              schema: { type: 'string', enum: ['circulating', 'total', 'burned'] },
              description: 'Optional plain-text metric selector for CoinGecko / CoinMarketCap'
            },
            {
              name: 'format',
              in: 'query',
              schema: { type: 'string', enum: ['json', 'text'] }
            }
          ],
          responses: {
            '200': { description: 'Supply JSON payload or plain-text float' },
            '500': { description: 'Failed to retrieve supply metrics' }
          }
        }
      },
      '/api/richlist': {
        get: {
          tags: ['Supply / Trackers'],
          summary: 'Top UTXO holders, Developer Treasury, and official KTburn ledger',
          parameters: [
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', minimum: 10, maximum: 100, default: 100 }
            }
          ],
          responses: {
            '200': { description: 'Rich list report' },
            '500': { description: 'Failed to build rich list' }
          }
        }
      },
      '/api/network': {
        get: {
          tags: ['Chain Telemetry'],
          summary: '60-block series, consensus roadmap, Model D splits, privacy-masked BIP324 v2 peer mesh, and Sporks',
          responses: {
            '200': { description: 'Network analytics payload' },
            '500': { description: 'Failed to load network analytics' }
          }
        }
      },
      '/api/search': {
        get: {
          tags: ['Chain Telemetry'],
          summary: 'Smart search resolver for block height, block/tx hash, address, Taproot address, 66-hex validator pubkey, or 96-hex BLS12-381 operator pubkey',
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              schema: { type: 'string' }
            }
          ],
          responses: {
            '200': { description: 'Search target resolution or not-found indicator' }
          }
        }
      },
      '/api/blocks': {
        get: {
          tags: ['Ledger'],
          summary: 'Paginated block ledger with PoW/PoS filter',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 10, maximum: 100, default: 25 } },
            { name: 'type', in: 'query', schema: { type: 'string', enum: ['all', 'pos', 'pow'], default: 'all' } }
          ],
          responses: {
            '200': { description: 'Paginated blocks' },
            '500': { description: 'Failed to query blocks' }
          }
        }
      },
      '/api/block/{id}': {
        get: {
          tags: ['Ledger'],
          summary: 'Full block details by height or 64-hex hash, including ADAM committee & reward split',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
          ],
          responses: {
            '200': { description: 'Block details and transactions' },
            '400': { description: 'Invalid height or hash format' },
            '404': { description: 'Block not found' }
          }
        }
      },
      '/api/transactions': {
        get: {
          tags: ['Ledger'],
          summary: 'Paginated transaction stream filterable by type',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 10, maximum: 100, default: 25 } },
            {
              name: 'type',
              in: 'query',
              schema: {
                type: 'string',
                enum: [
                  'all',
                  'standard',
                  'rewards',
                  'registrations',
                  'coinbase',
                  'coinstake',
                  'coin_lock',
                  'pow_lock',
                  'zerocoin_pow',
                  'protx',
                  'burn',
                  'contract'
                ],
                default: 'all'
              }
            }
          ],
          responses: {
            '200': { description: 'Paginated transactions' },
            '500': { description: 'Failed to query transactions' }
          }
        }
      },
      '/api/tx/{id}': {
        get: {
          tags: ['Ledger'],
          summary: 'Full transaction details including inputs, enriched outputs, OP_RETURN / KTDIP3 ProTx decoding, and MESCAL decompilation',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' } }
          ],
          responses: {
            '200': { description: 'Transaction details' },
            '400': { description: 'Invalid txid format' },
            '404': { description: 'Transaction not found' }
          }
        }
      },
      '/api/tx/decode': {
        post: {
          tags: ['Transactions & Fees'],
          summary: 'Decode a raw serialized transaction hex using read-only node RPC',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['hex'],
                  properties: {
                    hex: { type: 'string', description: 'Raw transaction hex (max 100 KB)' }
                  }
                }
              }
            }
          },
          responses: {
            '200': { description: 'Decoded transaction object with burn and OP_RETURN annotations' },
            '400': { description: 'Invalid or oversized hex' },
            '405': { description: 'Method not allowed' }
          }
        }
      },
      '/api/tx/broadcast': {
        post: {
          tags: ['Transactions & Fees'],
          summary: 'Opt-in raw transaction relay (requires NUXT_ENABLE_TX_BROADCAST=true, strict 10 req/min rate limit)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['hex'],
                  properties: {
                    hex: { type: 'string', description: 'Signed raw transaction hex (max 100 KB)' }
                  }
                }
              }
            }
          },
          responses: {
            '200': { description: 'Transaction accepted and broadcast to network' },
            '400': { description: 'Invalid hex or rejected by consensus/mempool rules' },
            '405': { description: 'Method not allowed' },
            '429': { description: 'Broadcast rate limit exceeded' },
            '502': { description: 'RPC node unavailable' },
            '503': { description: 'Broadcast endpoint is disabled by server configuration' }
          }
        }
      },
      '/api/fees': {
        get: {
          tags: ['Transactions & Fees'],
          summary: 'Estimated transaction fee tiers (fast / standard / economy) in sat/B and KRISTA/kB',
          responses: {
            '200': { description: 'Fee tier estimates and recent 20-block fee stats' },
            '500': { description: 'Failed to estimate fees' }
          }
        }
      },
      '/api/address/{id}': {
        get: {
          tags: ['Wallet / Address'],
          summary: 'Combined address overview: balance, history, top 100 UTXOs, validator membership, and produced blocks',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 10, maximum: 100, default: 50 } },
            { name: 'direction', in: 'query', schema: { type: 'string', enum: ['all', 'in', 'out'], default: 'all' } }
          ],
          responses: {
            '200': { description: 'Combined address details' },
            '400': { description: 'Invalid wallet address format' },
            '500': { description: 'Failed to fetch address details' }
          }
        }
      },
      '/api/address/{id}/balance': {
        get: {
          tags: ['Wallet / Address'],
          summary: 'Fast address balance breakdown (spendable, timelocked, total, satoshis, and optional mempool delta)',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'includeMempool', in: 'query', schema: { type: 'boolean', default: true } }
          ],
          responses: {
            '200': { description: 'Address balance summary' },
            '400': { description: 'Invalid wallet address format' },
            '500': { description: 'Failed to fetch address balance' }
          }
        }
      },
      '/api/address/{id}/utxos': {
        get: {
          tags: ['Wallet / Address'],
          summary: 'Paginated UTXO set for wallet transaction construction (includes scriptHex, confirmations, and timelock state)',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } },
            { name: 'minConfirmations', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
            { name: 'spendableOnly', in: 'query', schema: { type: 'boolean', default: false } },
            {
              name: 'sort',
              in: 'query',
              schema: { type: 'string', enum: ['amount_desc', 'amount_asc', 'oldest', 'newest'], default: 'amount_desc' }
            }
          ],
          responses: {
            '200': { description: 'Paginated UTXOs' },
            '400': { description: 'Invalid wallet address format' },
            '500': { description: 'Failed to fetch address UTXOs' }
          }
        }
      },
      '/api/address/{id}/txs': {
        get: {
          tags: ['Wallet / Address'],
          summary: 'Paginated and filterable transaction history for an address',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
            { name: 'direction', in: 'query', schema: { type: 'string', enum: ['all', 'in', 'out'], default: 'all' } },
            {
              name: 'type',
              in: 'query',
              schema: {
                type: 'string',
                enum: [
                  'all',
                  'standard',
                  'rewards',
                  'registrations',
                  'coinbase',
                  'coinstake',
                  'coin_lock',
                  'pow_lock',
                  'zerocoin_pow',
                  'protx',
                  'burn',
                  'contract'
                ],
                default: 'all'
              }
            },
            { name: 'minHeight', in: 'query', schema: { type: 'integer', minimum: 0 } },
            { name: 'maxHeight', in: 'query', schema: { type: 'integer', minimum: 0 } }
          ],
          responses: {
            '200': { description: 'Filtered address transaction history' },
            '400': { description: 'Invalid wallet address format' },
            '500': { description: 'Failed to fetch address transactions' }
          }
        }
      },
      '/api/validators': {
        get: {
          tags: ['Consensus & Validators'],
          summary: 'Active ADAM validator pool, Dual-Track quotas, deterministic KTDIP3 Masternodes (BLS12-381, PoSe), Fair VRF weights, and LLMQ Quorum',
          responses: {
            '200': { description: 'Validator pool telemetry' },
            '500': { description: 'Failed to fetch validator pool' }
          }
        }
      },
      '/api/validator/{address}': {
        get: {
          tags: ['Consensus & Validators'],
          summary: 'Per-validator / Masternode performance analytics over a bounded block window',
          parameters: [
            {
              name: 'address',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Validator wallet address, 66-hex compressed public key, or 96-hex BLS12-381 operator public key'
            },
            {
              name: 'window',
              in: 'query',
              schema: { type: 'integer', minimum: 10, maximum: 1000, default: 200 }
            }
          ],
          responses: {
            '200': { description: 'Validator performance metrics and recent role activity' },
            '400': { description: 'Invalid address or pubkey format' },
            '404': { description: 'Validator public key not found' },
            '500': { description: 'Failed to compute validator analytics' }
          }
        }
      },
      '/api/contracts': {
        get: {
          tags: ['Contracts'],
          summary: 'Paginated MESCAL contracts, Taproot (P2TR) outputs, and OP_RETURN payloads',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
            { name: 'kind', in: 'query', schema: { type: 'string', enum: ['all', 'mescal', 'taproot', 'op_return'], default: 'all' } },
            { name: 'unspentOnly', in: 'query', schema: { type: 'boolean', default: false } },
            { name: 'decompile', in: 'query', schema: { type: 'boolean', default: false } }
          ],
          responses: {
            '200': { description: 'Paginated contracts and summary counts' },
            '500': { description: 'Failed to query contracts' }
          }
        }
      },
      '/api/mempool': {
        get: {
          tags: ['Mempool & Streaming'],
          summary: 'Live unconfirmed mempool queue, fee rates (sat/B), and waiting durations',
          responses: {
            '200': { description: 'Mempool summary and top 50 pending txs' },
            '500': { description: 'Failed to inspect mempool' }
          }
        }
      },
      '/api/events': {
        get: {
          tags: ['Mempool & Streaming'],
          summary: 'Real-time Server-Sent Events (SSE) stream for new blocks, mempool transactions, and reorgs',
          parameters: [
            {
              name: 'topics',
              in: 'query',
              schema: { type: 'string', default: 'block,mempool,reorg' },
              description: 'Comma-separated subset of block,mempool,reorg'
            }
          ],
          responses: {
            '200': {
              description: 'text/event-stream connection emitting connected, block, mempool, and reorg frames'
            },
            '429': { description: 'Too many concurrent SSE streams from client IP' },
            '503': { description: 'SSE capacity exceeded' }
          }
        }
      }
    }
  }
}
