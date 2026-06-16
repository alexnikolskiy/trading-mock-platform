import type { SnapshotVersions } from '../contract/snapshot/manifest.js';
import { SNAPSHOT_SCHEMA_VERSION } from '../contract/snapshot/version.js';
import { OPS_READ_CONTRACT_VERSION } from '../contract/ops-read/version.js';
import { ANALYSIS_CONTRACT_VERSION } from '../contract/analysis/version.js';
import { RESEARCH_READ_CONTRACT_VERSION } from '../contract/research-read/version.js';

/** MVP policy: EXACT match. No migration/transform layer exists yet, so a differing version —
 *  even an older minor like ops.2 vs ops.3 — is rejected (fail closed). Loosen this to a range
 *  ONLY when a documented migration policy lands. */
function check(field: string, got: string, supported: string): void {
  if (got !== supported) {
    throw new Error(
      `unsupported ${field} '${got}' (this mock supports exactly '${supported}'; no migration policy yet)`,
    );
  }
}

export function assertSnapshotCompatible(v: SnapshotVersions): void {
  check('snapshotSchemaVersion', v.snapshotSchemaVersion, SNAPSHOT_SCHEMA_VERSION);
  check('opsReadContractVersion', v.opsReadContractVersion, OPS_READ_CONTRACT_VERSION);
  check('analysisContractVersion', v.analysisContractVersion, ANALYSIS_CONTRACT_VERSION);
  check('researchReadContractVersion', v.researchReadContractVersion, RESEARCH_READ_CONTRACT_VERSION);
}
