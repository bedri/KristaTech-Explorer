import { callRpc } from '../utils/rpc'
import { dbQuery } from '../utils/db'
import { setCacheControl } from '../utils/api'
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

export default defineEventHandler(async (event) => {
  setCacheControl(event, 5, 10)
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
        height: 1,
        title: 'Fair Launch, KTDIP3 & UPGRADE_FAIRNESS',
        titleTr: 'Adil Başlangıç, KTDIP3 ve UPGRADE_FAIRNESS',
        desc: '0 premine, deterministic KTDIP3 Masternodes, Equal-Pay, PoM 1.25x / PoL 3x / PoB 6x & 4,200:250:10 Fair VRF.',
        descTr: '0 ön madencilik, deterministik KTDIP3 Masternode, Eşit Ücret, PoM 1.25x / PoL 3x / PoB 6x ve 4.200:250:10 Adil VRF.'
      },
      {
        id: 'adam_v1',
        height: 200,
        title: 'UPGRADE_ADAM & Dual-Track (25% / 75%)',
        titleTr: 'UPGRADE_ADAM & Çift Kulvar (%25 / %75)',
        desc: '11+1 committee (7 MN / 1 CL / 3 Open PoW), 17 uniform algos, 25% Producer (20%/5% PoS) / 75% Equal-Pay Validators.',
        descTr: '11+1 komite (7 MN / 1 CL / 3 Açık PoW), 17 tek-geçişli algo, %25 Üretici (PoS %20/%5) / %75 Eşit Ücretli Doğrulayıcı.'
      },
      {
        id: 'open_entry',
        height: 2500,
        title: 'Open-Entry Seat & Bootstrap Limit',
        titleTr: 'Açık Katılım Koltuğu & Bootstrap Limiti',
        desc: 'Permanent 0-KRISTA Open-Entry seat in Track 2 (2 Funded PoW-Locks + 1 Open-Entry; 240-key / 15-bit Zero-Coin).',
        descTr: 'Kulvar 2 içinde kalıcı 0-KRISTA Açık Katılım koltuğu (2 Fonlu PoW-Lock + 1 Açık Katılım; 240 anahtar / 15-bit Zero-Coin).'
      },
      {
        id: 'pombl',
        height: 4800,
        title: 'UPGRADE_POMBL (v12 17-Algo 3-Perm)',
        titleTr: 'UPGRADE_POMBL (v12 17-Algo 3-Perm)',
        desc: '17 uniform single-pass algo 3-permutations (4,080 combinations, X11KVS excluded), 33B pubkeys, 3s ADAM / 1s LLMQ grace.',
        descTr: '17 tek-geçişli algo 3’lü permütasyon (4.080 kombinasyon, X11KVS hariç), 33B anahtar ve 3 sn ADAM / 1 sn LLMQ penceresi.'
      },
      {
        id: 'model_d',
        height: 5000,
        title: 'UPGRADE_MODELD / ADAM v2 & Dynamic LLMQ',
        titleTr: 'UPGRADE_MODELD / ADAM v2 & Dinamik LLMQ',
        desc: 'Dynamic BFT LLMQ (3/5–8/15, 1-block lag signer-only + -5/+5 PoSe), Equal-Pay 40%/11, PoS 12%/3% & Depth V2 (#5,001).',
        descTr: 'Dinamik BFT LLMQ (3/5–8/15, 1-blok gecikmeli + -5/+5 PoSe), Eşit Ücret %40/11, PoS %12/%3 ve Depth V2 (#5.001).'
      },
      {
        id: 'phase_d',
        height: 259202,
        title: 'Quarterly Decay Epoch #2',
        titleTr: 'Çeyreklik Azaltım Dönemi #2',
        desc: '17 KRISTA Block 2+ base subsidy with smooth -2.15% decay every 259,200 blocks (~90 days).',
        descTr: 'Blok 2 itibarıyla 17 KRISTA blok ödülü ve her 259.200 blokta (~90 gün) yumuşak -%2,15 azaltım.'
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

    const activeMnCount = status.masternodes?.enabled || 0
    const payload = {
      success: true,
      height: currentHeight,
      avgBlockTime: status.avgBlockTime,
      hashrate: status.hashrate,
      difficulty: status.difficulty,
      posBlocksRecent: status.posBlocksRecent,
      powBlocksRecent: status.powBlocksRecent,
      modelDSplitsCurrent: calculateModelDSplits(currentHeight, undefined, activeMnCount),
      modelDSplitsFull: calculateModelDSplits(Math.max(5000, currentHeight), undefined, activeMnCount),
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
    setResponseStatus(event, 500)
    return {
      success: false,
      code: 'NETWORK_ANALYTICS_FAILED',
      error: 'Failed to load network analytics'
    }
  }
})
