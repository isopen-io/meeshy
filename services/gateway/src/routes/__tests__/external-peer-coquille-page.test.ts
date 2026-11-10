/**
 * La coquille « ami WhatsApp » (#17116) est servie par la passerelle, sous la
 * porte « pair externe » : elle n'existe que là où la porte est montée (staging
 * déclaré), ne sert que les fichiers de son répertoire, et sa politique de
 * contenu permet au WASM libsignal de se compiler sans ouvrir aucun autre hôte.
 *
 * @jest-environment node
 */
import { describe, it, expect, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { memoryPeerStore } from '../../services/external-peer/fake-whatsapp-peer';
import { externalPeerRoutesFor } from '../external-peer';

const directory = mkdtempSync(join(tmpdir(), 'coquille-'));
writeFileSync(join(directory, 'index.html'), '<!doctype html><title>Coquille ami WhatsApp</title><main data-coquille></main>');
writeFileSync(join(directory, 'coquille.js'), 'export {};');
writeFileSync(join(directory, 'libsignal_wasm_bg.wasm'), Buffer.from([0x00, 0x61, 0x73, 0x6d]));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const STAGING = { NODE_ENV: 'production', MEESHY_ENV: 'staging', EXTERNAL_PEER_PROVIDER: 'fake-whatsapp' };
const noAuth = async () => undefined;
const libsignal = () => ({ SignalMessage: { deserialize: () => ({}) }, PreKeySignalMessage: { deserialize: () => ({}) } });

async function serve(env: Record<string, string | undefined>, coquilleDirectory: string | null = directory) {
  const app = Fastify({ logger: false });
  await app.register(externalPeerRoutesFor({ env, store: memoryPeerStore(), libsignal, auth: noAuth, coquilleDirectory }));
  await app.ready();
  return app;
}

describe('la coquille ami WhatsApp', () => {
  it('se sert au staging, avec une politique qui permet le WASM et ne joint que la passerelle', async () => {
    const app = await serve(STAGING);

    const page = await app.inject({ method: 'GET', url: '/external-peer/whatsapp/coquille/' });
    const wasm = await app.inject({ method: 'GET', url: '/external-peer/whatsapp/coquille/libsignal_wasm_bg.wasm' });
    const script = await app.inject({ method: 'GET', url: '/external-peer/whatsapp/coquille/coquille.js' });

    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.body).toContain('data-coquille');
    const csp = String(page.headers['content-security-policy']);
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(page.headers['cache-control']).toBe('no-store');
    expect(wasm.headers['content-type']).toBe('application/wasm');
    expect(script.headers['content-type']).toContain('text/javascript');
  });

  it('ne sert rien hors de son répertoire', async () => {
    const app = await serve(STAGING);

    const escape = await app.inject({ method: 'GET', url: '/external-peer/whatsapp/coquille/..%2F..%2Fetc%2Fpasswd' });
    const unknown = await app.inject({ method: 'GET', url: '/external-peer/whatsapp/coquille/absent.js' });

    expect(escape.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);
  });

  it('n’existe pas en production, même avec ses fichiers présents dans l’image', async () => {
    const app = await serve({ NODE_ENV: 'production', EXTERNAL_PEER_PROVIDER: 'fake-whatsapp' });

    const page = await app.inject({ method: 'GET', url: '/external-peer/whatsapp/coquille/' });

    expect(page.statusCode).toBe(404);
  });

  it('se tait sans répertoire construit, la porte restant montée', async () => {
    const app = await serve(STAGING, join(directory, 'absent'));

    const page = await app.inject({ method: 'GET', url: '/external-peer/whatsapp/coquille/' });

    expect(page.statusCode).toBe(404);
  });
});
