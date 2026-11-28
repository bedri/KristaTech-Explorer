import { callRpc } from '../utils/rpc'
import { dbQuery } from '../utils/db'
import { setCacheControl } from '../utils/api'
import { getCachedStatusData } from './status'
import {
  MODEL_D_ACTIVATION_HEIGHT,
  calculateBlockSubsidy,
  calculateModelDSplits,
  hasBip324ServiceFlag,
  maskPeerAddr,
  TARGET_BLOCK_TIME_SECONDS
} from '../../app/utils/protocol'

const NETWORK_CACHE_TTL_MS = 5000
let cachedNetwork: any = null
let cachedNetworkTime = 0

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
          services: p.services || '0',
          bip324: hasBip324ServiceFlag(p.services),
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
    const bip324PeersCount = peers.filter((p) => p.bip324).length

    // Fetch live protocol upgrade activations from getblockchaininfo
    let upgrades: any[] = []
    try {
      const bcInfo = await callRpc('getblockchaininfo')
      const rawUpgrades = bcInfo?.upgrades
      if (rawUpgrades && typeof rawUpgrades === 'object') {
        upgrades = Object.entries(rawUpgrades)
          .map(([name, entry]: [string, any]) => ({
            name,
            activationHeight: Number(entry?.activationheight ?? entry?.activationHeight ?? 0),
            status: String(entry?.status || 'pending'),
            active: String(entry?.status || '').toLowerCase() === 'active',
            info: String(entry?.info || '')
          }))
          .sort((a, b) => a.activationHeight - b.activationHeight || a.name.localeCompare(b.name))
      }
    } catch (_) {
      upgrades = []
    }

    // Consensus upgrade roadmap milestones
    const roadmap = [
      {
        id: 'bootstrap',
        height: 1,
        title: 'Fair Launch, KTDIP3, BIP324, Open-Entry & Hardening v1–v4',
        titleTr: 'Adil Başlangıç, KTDIP3, BIP324, Açık Katılım ve Hardening v1–v4',
        desc: '0 premine, deterministic KTDIP3 v2 BLS PoP (mnmeta), BIP324 P2P v2, PoM/PoL/PoB, 4,200:250:10 VRF (100-blk maturity), ProUpReg cooldown, permanent 0-KRISTA Open-Entry, and 2/3 BFT LLMQ.',
        descTr: '0 ön madencilik, deterministik KTDIP3 v2 BLS PoP (mnmeta), BIP324 P2P v2, PoM/PoL/PoB, 4.200:250:10 VRF (100-blok olgunluk), ProUpReg bekleme, kalıcı 0-KRISTA Açık Katılım ve 2/3 BFT LLMQ.'
      },
      {
        id: 'model_d',
        height: 200,
        title: 'Balanced Model D, PoMBL v12 & PoBLS (#200)',
        titleTr: 'Dengeli Model D, PoMBL v12 ve PoBLS (#200)',
        desc: '15+1 committee (8 MN / 2 CL / 5 Open PoW; thr 8), Equal-Pay 60%/15 (4.00%), 5% MN, PoS 22%/3%, 17-Algo 3-Perm v12 (4,080), ≥55% MN VRF floor (V5), Dynamic 2/3 BFT LLMQ (4/5–11/15), and Developer Treasury governance.',
        descTr: '15+1 komite (8 MN / 2 CL / 5 Açık PoW; eşik 8), Eşit Ücret %60/15 (%4,00), %5 MN, PoS %22/%3, 17-Algo 3-Perm v12 (4.080), ≥%55 MN VRF tabanı (V5), Dinamik 2/3 BFT LLMQ (4/5–11/15) ve Hazine yönetişimi.'
      },
      {
        id: 'stake_maturity_v2',
        height: 601,
        title: 'PoS 600-Confirmation Staking Maturity',
        titleTr: 'PoS 600-Onay Staking Olgunluğu',
        desc: 'First PoS coinstakes meeting UPGRADE_STAKE_MIN_DEPTH_V2 (activated at #200) reach 600-block maturity window, enabling full PoS/PoW hybrid block alternation.',
        descTr: '#200. blokta aktifleşen UPGRADE_STAKE_MIN_DEPTH_V2 sonrası 600-blok olgunluğa ulaşan ilk çıktılarla tam PoS/PoW hibrit blok üretimi başlar.'
      },
      {
        id: 'bootstrap_limit',
        height: 2500,
        title: 'ADAM Bootstrap Window Completion',
        titleTr: 'ADAM Başlangıç Penceresi Tamamlanması',
        desc: 'nAdamBootstrapLimit (2,500) concludes initial bootstrap allowances with full validator queue saturation and 240-key / 15-bit Zero-Coin Sybil enforcement.',
        descTr: 'nAdamBootstrapLimit (2.500) ilk başlangıç toleransını tamamlar; 240 anahtarlı / 15-bit Zero-Coin Sybil koruması tam kapasiteyle sürer.'
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
      activeMnCount,
      bip324PeersCount,
      modelDSplitsCurrent: calculateModelDSplits(currentHeight, undefined, activeMnCount),
      modelDSplitsFull: calculateModelDSplits(Math.max(MODEL_D_ACTIVATION_HEIGHT, currentHeight), undefined, activeMnCount),
      blockSeries,
      txBreakdown,
      roadmap,
      peers,
      upgrades
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
