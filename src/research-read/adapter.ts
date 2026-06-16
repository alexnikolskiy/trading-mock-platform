import type { SnapshotBundle } from '../contract/snapshot/bundle.js';
import type { ResearchRunResult } from '../contract/research-read/dto.js';
import { readResearchResult, listResearchResults } from '../snapshot/readers/research.js';

/** Surface B is READ-ONLY and transport-agnostic in this feature: a future src/mcp or HTTP adapter
 *  drives these functions. No mutating/backtest entry points exist. */
export function getResult(bundle: SnapshotBundle, runId: string): ResearchRunResult | undefined {
  return readResearchResult(bundle, runId);
}
export function listResults(bundle: SnapshotBundle): readonly ResearchRunResult[] {
  return listResearchResults(bundle);
}
