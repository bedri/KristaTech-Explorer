import { callRpc } from '../utils/rpc'
import { dbQuery } from '../utils/db'
import { getCachedStatusData } from './status'
import {
  calculateBlockSubsidy,
  calculateModelDSplits,
  maskPeerAddr,
  TARGET_BLOCK_TIME_SECONDS
} from '../../app/utils/protocol'

const NETWORK_CACHE_TTL_MS = 5000
let cachedNetwork: any = null
let cachedNetworkTime = 0

const SPORK_DEFAULT_OFF = 4070908800

export default defineEventHandler(async () => {
  const now = Date.now()
  if (cachedNetwork && now - cachedNetworkTime < NETWORK_CACHE_TTL_MS) {
    return cachedNetwork
  }

  try {
    const status = await getCachedStatusData()
    const currentHeight = status.height || 0

    // Fetch last 61 blocks to compute 60 block intervals & volume points in chronological order
    const blockRowsDesc = await dbQuery(
      `SELECT height, time, tx_count, size, difficulty, is_pos, reward, solved_seats, version
       FROM blocks
       ORDER BY height DESC
       LIMIT 61`
    )

    const blockSeries: any[] = []
    for (let i = Math.min(blockRowsDesc.length - 1, 59); i >= 0; i--) {
      const b = blockRowsDesc[i]
      const prev = blockRowsDesc[i + 1]
      if (!b) continue
      const dt =
        prev && b.height === prev.height + 1 && prev.height > 0
          ? Math.max(0, (b.time || 0) - (prev.time || 0))
          : b.height === 0
            ? 0
            : TARGET_BLOCK_TIME_SECONDS
      blockSeries.push({
        height: b.height,
        time: b.time,
        deltaTime: dt,
        txCount: b.tx_count || 0,
        size: b.size || 0,
        difficulty: b.difficulty || 0,
        isPos: Boolean(b.is_pos),
        reward: b.reward || calculateBlockSubsidy(b.height),
        solvedSeats: b.solved_seats || 0,
        version: b.version || 1
      })
    }

    const txBreakdownRows = await dbQuery(
      'SELECT tx_type, COUNT(*) as count FROM transactions GROUP BY tx_type'
    )
    const txBreakdown = (txBreakdownRows || []).map((r: any) => ({
      type: r.tx_type || 'standard',
      count: r.count || 0
    }))

    // Fetch peers and strictly mask IP endpoints for privacy
    let peers: any[] = []
    try {
      const rawPeers = await callRpc('getpeerinfo')
      if (Array.isArray(rawPeers)) {
        peers = rawPeers.map((p: any, idx: number) => ({
          id: p.id ?? idx + 1,
          addrMasked: maskPeerAddr(p.addr),
          version: p.version ?? 0,
          subver: p.subver || '',
          inbound: Boolean(p.inbound),
          syncedHeaders: p.synced_headers ?? -1,
          syncedBlocks: p.synced_blocks ?? -1,
          pingMs: typeof p.pingtime === 'number' ? Math.round(p.pingtime * 1000 * 10) / 10 : null,
          conntime: p.conntime || 0
        }))
      }
    } catch (_) {
      peers = []
    }

    // Fetch protocol Sporks
    let sporks: any[] = []
    try {
      const rawSporks = await callRpc('spork', ['show'])
      if (rawSporks && typeof rawSporks === 'object') {
        sporks = Object.entries(rawSporks).map(([name, val]) => {
          const numVal = Number(val)
          const isActive = Number.isFinite(numVal) && numVal < SPORK_DEFAULT_OFF
          return {
            name,
            value: numVal,
            active: isActive
          }
        })
      }
    } catch (_) {
      sporks = []
    }

    // Consensus upgrade roadmap milestones
    const roadmap = [
      {
        id: 'bootstrap',
        height: 0,
        title: 'Fair Launch Genesis (Zero Premine)',
        titleTr: 'Adil Başlangıç Genesis (Sıfır Ön Madencilik)',
        desc: 'X11KVS PoW launch, 0 KRISTA premine, 30s block target.',
        descTr: 'X11KVS PoW başlangıcı, 0 KRISTA ön madencilik, 30 sn blok hedefi.'
      },
      {
        id: 'adam_v1',
        height: 200,
        title: 'UPGRADE_ADAM & Dual-Track Quotas',
        titleTr: 'UPGRADE_ADAM & Çift Kulvar Kotaları',
        desc: '11+1 cooperative committee, 65:16:4 Quadratic Coordinator VRF, 7 MN / 1 Coin-Lock / 3 Open PoW.',
        descTr: '11+1 işbirlikçi komite, 65:16:4 Karekök Koordinatör VRF, 7 MN / 1 Coin-Lock / 3 Open PoW.'
      },
      {
        id: 'pombl',
        height: 2000,
        title: 'UPGRADE_POMBL (v12 3-Perm & PoB)',
        titleTr: 'UPGRADE_POMBL (v12 3-Perm & PoB)',
        desc: '18-algo 3-permutation seat puzzles, alternating PoW/PoS slot priority, Proof-of-Burn.',
        descTr: '18 algoritmalı 3-permütasyon koltuk bulmacaları, dönüşümlü PoW/PoS önceliği ve Proof-of-Burn.'
      },
      {
        id: 'model_d',
        height: 2200,
        title: 'UPGRADE_MODELD (PoBLS + 3-of-5 LLMQ)',
        titleTr: 'UPGRADE_MODELD (PoBLS + 3/5 LLMQ)',
        desc: '3-of-5 BLS Quorum anti-substitution finality & full Model D 35/40/15/10 net reward split.',
        descTr: '3/5 BLS Kuorum blok kesinliği ve tam Model D %35/%40/%15/%10 net ödül dağılımı.'
      },
      {
        id: 'phase_d',
        height: 10000,
        title: 'Standard Emission & Quarterly Decay',
        titleTr: 'Standart Emisyon & Çeyreklik Azaltım',
        desc: '15 KRISTA base subsidy with smooth -1.9% decay every 259,200 blocks (~90 days).',
        descTr: '15 KRISTA taban blok ödülü ve her 259.200 blokta (~90 gün) yumuşak -%1,9 azaltım.'
      }
    ].map((item) => ({
      ...item,
      activated: currentHeight >= item.height,
      progressPct:
        item.height === 0
          ? 100
          : Math.min(100, Math.round((currentHeight / item.height) * 1000) / 10),
      blocksRemaining: Math.max(0, item.height - currentHeight)
    }))

    const payload = {
      success: true,
      height: currentHeight,
      avgBlockTime: status.avgBlockTime,
      hashrate: status.hashrate,
      difficulty: status.difficulty,
      posBlocksRecent: status.posBlocksRecent,
      powBlocksRecent: status.powBlocksRecent,
      modelDSplitsCurrent: calculateModelDSplits(currentHeight),
      modelDSplitsFull: calculateModelDSplits(Math.max(2200, currentHeight)),
      blockSeries,
      txBreakdown,
      roadmap,
      peers,
      sporks
    }

    cachedNetwork = payload
    cachedNetworkTime = now
    return payload
  } catch (err: any) {
    console.error('[API /network] Error:', err?.message || err)
    return {
      success: false,
      error: 'Failed to load network analytics'
    }
  }
})
