// Base MongoDB JETABLE des témoins (#9663) : un replica set d'un seul membre,
// pour que `hello.setName`/`hello.hosts` et `local.oplog.rs` existent comme sur
// le staging.
//
// `MEESHY_TEST_MONGO_URI` si fournie (elle doit viser un replica set), sinon un
// `mongod` lancé ici (binaire `MEESHY_TEST_MONGOD`, ou celui du cache de
// mongodb-memory-server `~/.cache/mongodb-binaries/mongod-*`), sinon un
// conteneur jetable `mongo:8`.

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { loadMongo } from './deps.mjs';

export const TEST_SET_NAME = 'anon-test';

const freePort = () =>
  new Promise((resolve) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

function cachedMongod() {
  if (process.env.MEESHY_TEST_MONGOD) return process.env.MEESHY_TEST_MONGOD;
  const dir = path.join(homedir(), '.cache', 'mongodb-binaries');
  if (!existsSync(dir)) return null;
  const found = readdirSync(dir).filter((f) => /^mongod-[a-z0-9_-]+-\d+\.\d+\.\d+$/.test(f)).sort().pop();
  return found ? path.join(dir, found) : null;
}

async function launch(port) {
  const binary = cachedMongod();
  if (binary) {
    const dbpath = mkdtempSync(path.join(tmpdir(), 'anon-mongo-'));
    const child = spawn(binary, ['--dbpath', dbpath, '--port', String(port), '--bind_ip', '127.0.0.1', '--replSet', TEST_SET_NAME, '--wiredTigerCacheSizeGB', '0.25', '--quiet'], { stdio: 'ignore' });
    child.once('error', (error) => {
      throw error;
    });
    return async () => {
      child.kill('SIGTERM');
      await new Promise((r) => child.once('exit', r));
      rmSync(dbpath, { recursive: true, force: true });
    };
  }
  const run = spawnSync('docker', ['run', '-d', '--rm', '-p', `127.0.0.1:${port}:27017`, 'mongo:8', '--replSet', TEST_SET_NAME, '--bind_ip_all'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error('Aucune base de test : ni MEESHY_TEST_MONGO_URI, ni binaire mongod en cache, ni docker.');
  const id = run.stdout.trim();
  return async () => {
    spawnSync('docker', ['rm', '-f', id]);
  };
}

async function connectWithRetry(MongoClient, uri) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 2_000 });
  for (let attempt = 0; ; attempt++) {
    try {
      await client.connect();
      return client;
    } catch (error) {
      if (attempt > 60) throw error;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

async function becomePrimary(client, host) {
  const admin = client.db('admin');
  try {
    await admin.command({ replSetInitiate: { _id: TEST_SET_NAME, members: [{ _id: 0, host }] } });
  } catch (error) {
    if (!/already initialized/i.test(error.message)) throw error;
  }
  for (let attempt = 0; attempt < 120; attempt++) {
    if ((await admin.command({ hello: 1 })).isWritablePrimary) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('le replica set de test ne devient pas primaire');
}

/**
 * Démarre une base jetable. Rend `uri` (sans base, `directConnection=true`
 * à ajouter par l'appelant via `uriFor`), le client, la cible (`setName`,
 * `hosts`) telle que la sert `hello`, et `stop`.
 */
export async function startMongo() {
  const { MongoClient } = await loadMongo();
  if (process.env.MEESHY_TEST_MONGO_URI) {
    const uri = process.env.MEESHY_TEST_MONGO_URI;
    const client = await connectWithRetry(MongoClient, uri);
    const hello = await client.db('admin').command({ hello: 1 });
    return { uri, client, target: { setName: hello.setName, hosts: hello.hosts }, stop: async () => client.close() };
  }
  const port = await freePort();
  const host = `127.0.0.1:${port}`;
  const stopServer = await launch(port);
  const uri = `mongodb://${host}`;
  const client = await connectWithRetry(MongoClient, `${uri}/?directConnection=true`);
  await becomePrimary(client, host);
  return {
    uri,
    client,
    target: { setName: TEST_SET_NAME, hosts: [host] },
    stop: async () => {
      await client.close();
      await stopServer();
    },
  };
}

export const uriFor = (mongo, database) => `${mongo.uri}/${database}?directConnection=true`;

/** Les drapeaux qui désignent la base jetable comme cible attendue. */
export const targetFlags = (mongo) => ['--expect-replica-set', mongo.target.setName, ...mongo.target.hosts.flatMap((h) => ['--expect-host', h])];
