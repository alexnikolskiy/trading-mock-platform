import { serve } from '@hono/node-server';
import { loadMockConfig } from '../access/config.js';
import { openSnapshot } from '../snapshot/registry.js';
import { createApp } from '../http/app.js';

function main(): void {
  const cfg = loadMockConfig(process.env);
  const snapshot = openSnapshot(cfg.snapshotDir, cfg.snapshotRef);
  const { app, injectWebSocket } = createApp({
    snapshot,
    tokenAllowlist: cfg.tokenAllowlist,
    replay: { mode: cfg.replayMode, speed: cfg.replaySpeed },
  });
  const server = serve({ fetch: app.fetch, hostname: cfg.bind, port: cfg.port }, (info) => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      kind: 'startup', bind: cfg.bind, port: info.port,
      snapshotRef: cfg.snapshotRef, opsContractVersion: snapshot.manifest.versions.opsReadContractVersion,
      authRequired: cfg.tokenAllowlist.length > 0,
    }));
  });
  injectWebSocket(server);
}

main();
