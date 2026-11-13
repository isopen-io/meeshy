/**
 * Le choix de l'implémentation « pair externe » par configuration (#17115) : le
 * faux WhatsApp ne s'allume qu'hors production ou au staging déclaré, et rien
 * d'autre ne s'allume tant que l'accord avec Meta n'est pas signé.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { realLibsignalMessages } from '../../e2ee/__tests__/libsignal-devices';
import { selectExternalPeer } from '../external-peer-selection';
import { memoryPeerStore } from '../fake-whatsapp-peer';
import { EXTERNAL_PEER_ERROR_CODES, ExternalPeerError } from '../external-peer-contract';

const select = (env: Record<string, string | undefined>) =>
  selectExternalPeer({ env, store: memoryPeerStore(), libsignal: () => realLibsignalMessages, logger: { warn: () => undefined } });

describe('pair externe — le choix par configuration', () => {
  it('sans configuration, aucune porte n’est ouverte', () => {
    expect(select({ NODE_ENV: 'development' })).toBeNull();
    expect(select({ NODE_ENV: 'development', EXTERNAL_PEER_PROVIDER: 'none' })).toBeNull();
  });

  it('le faux WhatsApp s’ouvre au staging déclaré et en développement', () => {
    expect(select({ NODE_ENV: 'production', MEESHY_ENV: 'staging', EXTERNAL_PEER_PROVIDER: 'fake-whatsapp' })?.network).toBe('whatsapp');
    expect(select({ NODE_ENV: 'development', EXTERNAL_PEER_PROVIDER: 'fake-whatsapp' })?.network).toBe('whatsapp');
  });

  it('en production, le faux WhatsApp reste FERMÉ même demandé', () => {
    expect(select({ NODE_ENV: 'production', EXTERNAL_PEER_PROVIDER: 'fake-whatsapp' })).toBeNull();
    expect(select({ NODE_ENV: 'production', MEESHY_ENV: 'prod', EXTERNAL_PEER_PROVIDER: 'fake-whatsapp' })).toBeNull();
  });

  it('un environnement que la porte ne reconnaît pas reste FERMÉ : seuls le développement, les tests et le staging déclaré l’ouvrent', () => {
    expect(select({ EXTERNAL_PEER_PROVIDER: 'fake-whatsapp' })).toBeNull();
    expect(select({ NODE_ENV: 'prod', EXTERNAL_PEER_PROVIDER: 'fake-whatsapp' })).toBeNull();
    expect(select({ NODE_ENV: 'Production', EXTERNAL_PEER_PROVIDER: 'fake-whatsapp' })).toBeNull();
    expect(select({ NODE_ENV: 'test', EXTERNAL_PEER_PROVIDER: 'fake-whatsapp' })?.network).toBe('whatsapp');
  });

  it('aucun adaptateur réel n’existe avant la signature : toute autre valeur reste fermée', () => {
    expect(select({ NODE_ENV: 'development', EXTERNAL_PEER_PROVIDER: 'meta-whatsapp' })).toBeNull();
    expect(select({ NODE_ENV: 'production', MEESHY_ENV: 'staging', EXTERNAL_PEER_PROVIDER: 'whatsapp' })).toBeNull();
  });

  it('la porte choisie est déjà ADMISE : un clair y est refusé', async () => {
    const peer = select({ NODE_ENV: 'development', EXTERNAL_PEER_PROVIDER: 'fake-whatsapp' });
    const attempt = peer?.deliverEnvelope({
      from: { side: 'meeshy', userId: 'c'.repeat(24), deviceId: 1 },
      to: { side: 'external', network: 'whatsapp', handle: '+33612345678', deviceId: 1 },
      type: 2,
      body: Buffer.from('bonjour en clair').toString('base64'),
    });

    await expect(attempt).rejects.toEqual(new ExternalPeerError(EXTERNAL_PEER_ERROR_CODES.PLAINTEXT_REFUSED));
  });
});
