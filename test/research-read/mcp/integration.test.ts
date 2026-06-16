import { describe, it, expect, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function parseToolResult(res: { structuredContent?: unknown; content?: unknown }): unknown {
  if (res.structuredContent !== undefined) return res.structuredContent;
  const content = res.content;
  if (Array.isArray(content)) {
    const text = content
      .filter((b): b is { type: string; text: string } => !!b && typeof b === 'object' && (b as { type?: unknown }).type === 'text' && typeof (b as { text?: unknown }).text === 'string')
      .map((b) => b.text).join('');
    if (text) return JSON.parse(text);
  }
  return content;
}

let client: Client | undefined;
let transport: StdioClientTransport | undefined;

describe('research MCP gateway (real stdio, end-to-end)', () => {
  it('lab-style client reads the gateway over stdio (proves stdout is clean JSON-RPC)', async () => {
    transport = new StdioClientTransport({
      command: 'tsx',
      args: ['src/bin/start-research-mcp.ts'],
      env: { ...process.env, MOCK_SNAPSHOT_REF: 'fixtures/2026-06-16-synthetic' },
    });
    client = new Client({ name: 'test-lab', version: '0' });
    await client.connect(transport); // handshake FAILS if the gateway pollutes stdout

    const discover = parseToolResult(await client.callTool({ name: 'discover_research_contract', arguments: {} })) as { contractVersion: string; supportedContractVersions: string[] };
    expect(discover.contractVersion).toBe('017.2');
    expect(discover.supportedContractVersions).toContain('017.2');

    const datasets = parseToolResult(await client.callTool({ name: 'list_datasets', arguments: {} })) as { datasets: unknown[] };
    expect(datasets.datasets).toEqual([]);

    const status = parseToolResult(await client.callTool({ name: 'get_run_status', arguments: { runId: 'run_paper_002' } })) as { ok: boolean; view?: { status: string } };
    expect(status.ok).toBe(true);
    expect(status.view!.status).toBe('completed');

    const result = parseToolResult(await client.callTool({ name: 'get_run_result', arguments: { runId: 'run_paper_002' } })) as { ok: boolean; kind?: string; summary?: { metrics: Record<string, number> } };
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('summary');
    expect(result.summary!.metrics.pnl).toBeCloseTo(24.25);

    // non-terminal (running) run → the status arm, never a fabricated terminal summary
    const live = parseToolResult(await client.callTool({ name: 'get_run_result', arguments: { runId: 'run_live_001' } })) as { ok: boolean; kind?: string; view?: { status: string } };
    expect(live.ok).toBe(true);
    expect(live.kind).toBe('status');
    expect(live.view!.status).toBe('running');

    const submit = parseToolResult(await client.callTool({ name: 'submit_run', arguments: {} })) as { ok: boolean; error?: { message: string } };
    expect(submit.ok).toBe(false);
    expect(submit.error!.message).toBe('backtesting_moved_to_trading_backtester');
  }, 30000);
});

afterAll(async () => { await client?.close(); await transport?.close(); });
