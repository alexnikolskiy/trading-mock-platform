// Ambient declaration for the vendored, import-free platform conformance harness.
// NodeNext resolves the `./historical.conformance.mjs` import to this sibling `.d.mts`.
// The .mjs is a verbatim byte-copy of the platform's compiled artifact (sync-gated); this
// file only describes the public surface the mock's conformance test consumes.
export interface ConformanceTarget {
  readonly baseUrl: string;
  readonly token?: string;
}
export interface ConformanceOpts {
  readonly goldenRows?: readonly object[];
}
export function runHistoricalConformance(
  target: ConformanceTarget,
  opts?: ConformanceOpts,
): Promise<{ ok: true }>;
