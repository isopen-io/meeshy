/**
 * #9600 (audit L1-B) — une adresse signée ne doit pas atterrir dans un journal.
 *
 * Un flux audio ou vidéo dure presque toujours plus de deux secondes : le hook
 * de chronométrage écrivait `request.url` ENTIER, jeton compris — et le jeton
 * suffit, pendant sa vie, à lire les octets à la place de son lecteur.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

import { registerRequestTimingHooks } from '../request-timing.plugin';
import { redactReaderFileUrl } from '../../utils/redact-reader-file-url';

const TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaa1.cccccccccccccccccccccc01.1791478800.WxR-2JgcqXrUVu61Zh_rSU';
const SIGNED = `/api/v1/attachments/signed/${TOKEN}/2026%2F10%2F68f2a81417a557e8ce4ddfc1%2Fvoice.m4a`;

describe('redactReaderFileUrl', () => {
  it('masque le jeton ET la clé qui le suit', () => {
    expect(redactReaderFileUrl(SIGNED)).toBe('/api/v1/attachments/signed/[redacted]');
    expect(redactReaderFileUrl(`${SIGNED}?x=1`)).toBe('/api/v1/attachments/signed/[redacted]');
    expect(redactReaderFileUrl(`https://gate.meeshy.me${SIGNED}`)).toBe('https://gate.meeshy.me/api/v1/attachments/signed/[redacted]');
  });

  it('laisse toute autre adresse intacte', () => {
    expect(redactReaderFileUrl('/api/v1/conversations/abc/messages?limit=20')).toBe('/api/v1/conversations/abc/messages?limit=20');
    expect(redactReaderFileUrl('/api/v1/attachments/file/2026%2F10%2Fu%2Fx.jpg')).toBe('/api/v1/attachments/file/2026%2F10%2Fu%2Fx.jpg');
  });
});

describe('registerRequestTimingHooks', () => {
  it("n'écrit jamais le jeton d'une adresse signée dans la ligne d'une requête lente", async () => {
    const info = jest.fn<(message: string, meta: Record<string, unknown>) => void>();
    const warn = jest.fn<(message: string, meta: Record<string, unknown>) => void>();
    const clock = jest.fn<() => number>().mockReturnValueOnce(0).mockReturnValueOnce(3_000);
    const app = Fastify({ logger: false });
    registerRequestTimingHooks(app, { logger: { info, warn }, now: clock });
    app.get('/api/v1/attachments/signed/:token/*', async () => 'ok');
    await app.ready();
    await app.inject({ method: 'GET', url: SIGNED });
    await app.close();

    expect(info).toHaveBeenCalledTimes(1);
    const written = JSON.stringify(info.mock.calls);
    expect(written).toContain('/api/v1/attachments/signed/[redacted]');
    expect(written).not.toContain(TOKEN);
    expect(written).not.toContain('voice.m4a');
  });

  it('garde l’adresse des autres requêtes lentes', async () => {
    const warn = jest.fn<(message: string, meta: Record<string, unknown>) => void>();
    const clock = jest.fn<() => number>().mockReturnValueOnce(0).mockReturnValueOnce(6_000);
    const app = Fastify({ logger: false });
    registerRequestTimingHooks(app, { logger: { info: jest.fn(), warn }, now: clock });
    app.get('/api/v1/conversations', async () => 'ok');
    await app.ready();
    await app.inject({ method: 'GET', url: '/api/v1/conversations?limit=5' });
    await app.close();

    expect(warn.mock.calls[0]?.[1]).toMatchObject({ url: '/api/v1/conversations?limit=5', statusCode: 200 });
  });
});
