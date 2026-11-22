export interface IndexerStateSnapshot {
  startedAt: number
  isSyncing: boolean
  lastSyncAttemptAt: number | null
  lastSyncSuccessAt: number | null
  lastSyncError: string | null
  lastSyncErrorAt: number | null
  lastIndexedHeight: number | null
  nodeTipHeight: number | null
  reorgCount: number
}

const state: IndexerStateSnapshot = {
  startedAt: Date.now(),
  isSyncing: false,
  lastSyncAttemptAt: null,
  lastSyncSuccessAt: null,
  lastSyncError: null,
  lastSyncErrorAt: null,
  lastIndexedHeight: null,
  nodeTipHeight: null,
  reorgCount: 0
}

export function updateIndexerState(patch: Partial<IndexerStateSnapshot>): IndexerStateSnapshot {
  Object.assign(state, patch)
  return getIndexerState()
}

export function incrementReorgCount(): number {
  state.reorgCount += 1
  return state.reorgCount
}

export function getIndexerState(): IndexerStateSnapshot {
  return { ...state }
}
