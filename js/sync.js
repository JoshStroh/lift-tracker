// Two-way sync between the local IndexedDB records and a (private) GitHub repo.
//
// Layout in the repo:   <folder>/sessions/<id>.json
//                       <folder>/exercises/<id>.json
//                       <folder>/plans/<id>.json
//                       <folder>/calisthenics/cali-progress.json
//
// Algorithm (one sync = at most one commit):
//   1. Read the branch head and its full file tree (one recursive tree request).
//   2. PULL: any file whose blob sha differs from what we last saw is downloaded.
//      If we also changed that record locally, the newer `updatedAt` wins.
//   3. PUSH: all locally-changed records are written in a single commit
//      (create tree -> create commit -> move branch). If the branch moved in the
//      meantime (another device synced), start over from step 1.

import * as store from './store.js';

const API = 'https://api.github.com';
const DIRS = { session: 'sessions', exercise: 'exercises', plan: 'plans', cali: 'calisthenics' };

class GitHubError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function gh(cfg, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}${path}`, {
    method,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).message || msg; } catch {}
    throw new GitHubError(res.status, msg);
  }
  return res.status === 204 ? null : res.json();
}

const b64encode = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

const pathFor = (folder, rec) => `${folder}/${DIRS[rec.type]}/${rec.id}.json`;
const serialize = (doc) => JSON.stringify(doc, null, 2) + '\n';

function friendlyError(e) {
  if (e instanceof GitHubError) {
    if (e.status === 401) return 'GitHub rejected the token (expired or mistyped?).';
    if (e.status === 403) return 'The token lacks permission. It needs "Contents: Read and write" on this repo.';
    if (e.status === 404) return 'Repo not found. Check the owner/repo names and that the token has access to it.';
    return `GitHub error ${e.status}: ${e.message}`;
  }
  if (e instanceof TypeError) return 'Offline — changes are saved on this device and will sync later.';
  return e.message || String(e);
}

async function getHead(cfg, branch) {
  try {
    return (await gh(cfg, `/git/ref/heads/${branch}`)).object.sha;
  } catch (e) {
    // Brand-new empty repo: create a first commit so the Git data API works.
    if (e.status === 409 || e.status === 404) {
      await gh(cfg, '/contents/README.md', {
        method: 'PUT',
        body: { message: 'Initialize lift data', content: b64encode('# Lift data\n\nWritten by the Lift Tracker app.\n'), branch },
      });
      return (await gh(cfg, `/git/ref/heads/${branch}`)).object.sha;
    }
    throw e;
  }
}

async function syncOnce(cfg) {
  const folder = (cfg.folder || 'data').replace(/^\/+|\/+$/g, '');
  const repoInfo = await gh(cfg, '');
  const branch = repoInfo.default_branch || 'main';

  for (let attempt = 0; attempt < 3; attempt++) {
    const headSha = await getHead(cfg, branch);
    const commit = await gh(cfg, `/git/commits/${headSha}`);
    const tree = await gh(cfg, `/git/trees/${commit.tree.sha}?recursive=1`);

    const prefix = folder + '/';
    const remote = new Map();
    for (const t of tree.tree) {
      if (t.type === 'blob' && t.path.startsWith(prefix) && t.path.endsWith('.json')) remote.set(t.path, t.sha);
    }

    // ---- pull ----
    const byPath = new Map();
    for (const rec of store.state.records.values()) if (DIRS[rec.type]) byPath.set(pathFor(folder, rec), rec);

    let pulled = 0;
    for (const [path, sha] of remote) {
      const local = byPath.get(path);
      if (local && local.sha === sha) continue;
      const blob = await gh(cfg, `/git/blobs/${sha}`);
      let doc;
      try { doc = JSON.parse(b64decode(blob.content)); } catch { continue; }
      if (!doc.id || !DIRS[doc.type]) continue;
      const current = store.state.records.get(doc.id);
      if (!current || !current.dirty || (doc.updatedAt || '') >= (current.doc.updatedAt || '')) {
        await store.applyRemote(doc, sha);
        pulled++;
      } else {
        await store.updateRecordMeta(doc.id, { sha }); // ours is newer; it will overwrite on push
      }
    }
    if (pulled) store.emit();

    // ---- push ----
    const dirty = [...store.state.records.values()].filter((r) => r.dirty && DIRS[r.type]);
    if (!dirty.length) return { pulled, pushed: 0 };

    const snapshot = dirty.map((r) => ({ id: r.id, path: pathFor(folder, r), updatedAt: r.doc.updatedAt, content: serialize(r.doc) }));
    const newTree = await gh(cfg, '/git/trees', {
      method: 'POST',
      body: { base_tree: commit.tree.sha, tree: snapshot.map((s) => ({ path: s.path, mode: '100644', type: 'blob', content: s.content })) },
    });
    const newCommit = await gh(cfg, '/git/commits', {
      method: 'POST',
      body: { message: `Sync ${snapshot.length} change${snapshot.length > 1 ? 's' : ''}`, tree: newTree.sha, parents: [headSha] },
    });
    try {
      await gh(cfg, `/git/refs/heads/${branch}`, { method: 'PATCH', body: { sha: newCommit.sha } });
    } catch (e) {
      if (e.status === 422 && attempt < 2) continue; // branch moved: pull again and retry
      throw e;
    }

    const written = await gh(cfg, `/git/trees/${newTree.sha}?recursive=1`);
    const newShas = new Map(written.tree.map((t) => [t.path, t.sha]));
    for (const s of snapshot) {
      const rec = store.state.records.get(s.id);
      const stillSame = rec && rec.doc.updatedAt === s.updatedAt; // not edited during sync
      await store.updateRecordMeta(s.id, { sha: newShas.get(s.path) ?? null, dirty: !stillSame });
    }
    return { pulled, pushed: snapshot.length };
  }
  throw new Error('Sync kept colliding with another device. Try again.');
}

let running = null;

export function sync() {
  if (!store.syncConfigured()) {
    store.state.sync = { ...store.state.sync, status: 'off', error: null };
    store.emit();
    return Promise.resolve();
  }
  if (running) return running;
  store.state.sync = { ...store.state.sync, status: 'syncing', error: null };
  store.emit();
  running = syncOnce(store.state.settings.gh)
    .then(async ({ pulled, pushed }) => {
      await store.setLastSync(new Date().toISOString());
      store.state.sync = { ...store.state.sync, status: 'ok', error: null, message: `Pulled ${pulled}, pushed ${pushed}` };
    })
    .catch((e) => {
      console.error(e);
      store.state.sync = { ...store.state.sync, status: 'error', error: friendlyError(e) };
    })
    .finally(() => {
      running = null;
      store.emit();
    });
  return running;
}
