export type ValidatorActivityRole =
  | 'coordinator'
  | 'producer'
  | 'committee_solved'
  | 'committee_missed'
  | 'llmq_signer'

export interface ValidatorRecentActivityItem {
  height: number
  hash: string
  time: number
  isPos: boolean
  roles: ValidatorActivityRole[]
}

export interface ValidatorWindowStats {
  blocksEvaluated: number
  committeeSelections: number
  seatsSolved: number
  solveRatePct: number
  blocksCoordinated: number
  blocksProduced: number
  llmqSignatures: number
  recentActivity: ValidatorRecentActivityItem[]
}

function parseJsonArray(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (_) {
    return []
  }
}

function parseQuorumSigners(raw: unknown): string[] {
  if (!raw) return []
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const signers = (raw as any).signers
    return Array.isArray(signers) ? signers.map((s) => String(s)) : []
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.signers)) {
        return parsed.signers.map((s: any) => String(s))
      }
      if (Array.isArray(parsed)) {
        return parsed.map((s: any) => String(s))
      }
    } catch (_) {
      return []
    }
  }
  return []
}

export function computeValidatorWindowStats(
  address: string,
  blockRows: any[]
): ValidatorWindowStats {
  const target = (address || '').trim()
  let blocksEvaluated = 0
  let committeeSelections = 0
  let seatsSolved = 0
  let blocksCoordinated = 0
  let blocksProduced = 0
  let llmqSignatures = 0
  const recentActivity: ValidatorRecentActivityItem[] = []

  for (const row of blockRows || []) {
    if (!row || typeof row !== 'object') continue
    blocksEvaluated++

    const roles: ValidatorActivityRole[] = []
    const isCoordinator = Boolean(target && row.adam_coordinator === target)
    const isProducer = Boolean(target && row.producer_address === target)

    if (isCoordinator) {
      blocksCoordinated++
      roles.push('coordinator')
    }
    if (isProducer) {
      blocksProduced++
      roles.push('producer')
    }

    const miners = parseJsonArray(row.adam_miners)
    const solutions = parseJsonArray(row.adam_solutions)
    // KristaTech 11+1 layout: vAdamMiners may carry 12 entries (11 seats + coordinator) while vAdamSolutions has 11
    const seatCount =
      miners.length === solutions.length + 1 ? solutions.length : miners.length

    let selectedInCommittee = false
    let solvedInCommittee = false
    for (let i = 0; i < seatCount; i++) {
      if (miners[i] === target) {
        selectedInCommittee = true
        const sol = solutions[i]
        if (sol && String(sol).length > 0) {
          solvedInCommittee = true
        }
      }
    }

    if (selectedInCommittee) {
      committeeSelections++
      if (solvedInCommittee) {
        seatsSolved++
        roles.push('committee_solved')
      } else {
        roles.push('committee_missed')
      }
    }

    const signers = parseQuorumSigners(row.adam_quorum_signers)
    if (target && signers.includes(target)) {
      llmqSignatures++
      roles.push('llmq_signer')
    }

    if (roles.length > 0 && recentActivity.length < 20) {
      recentActivity.push({
        height: Number(row.height) || 0,
        hash: String(row.hash || ''),
        time: Number(row.time) || 0,
        isPos: Boolean(row.is_pos),
        roles
      })
    }
  }

  const solveRatePct =
    committeeSelections > 0
      ? Math.round((seatsSolved / committeeSelections) * 10000) / 100
      : 0

  return {
    blocksEvaluated,
    committeeSelections,
    seatsSolved,
    solveRatePct,
    blocksCoordinated,
    blocksProduced,
    llmqSignatures,
    recentActivity
  }
}
