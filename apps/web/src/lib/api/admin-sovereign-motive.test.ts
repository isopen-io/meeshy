import { describe, expect, test } from 'bun:test';

import { updateAdminCommunity } from './admin-communities-detail';
import { removeAdminConversationMember, setAdminConversationMemberRole, updateAdminConversation } from './admin-conversation-settings';
import { loadAdminSovereignThread } from './admin-conversations';
import { removeAdminPost } from './admin-posts-detail';
import { revealAdminShareLink } from './admin-share-links';
import { banAdminUser } from './admin-user-bans';
import { setAdminUserConsent } from './admin-user-security';
import type { HttpTransport } from './http';

/**
 * **LE RANG SOUVERAIN AGIT SANS MOTIF** (spec 2026-10-04 § 4) — la passerelle
 * rend le motif facultatif au seul rang souverain ; le client ne doit donc plus
 * refuser LOCALEMENT un motif ABSENT (`null`/`undefined`) : il envoie le geste
 * sans `reason`, et c'est la passerelle qui tranche selon le rang. Un motif
 * FOURNI reste validé comme avant (un `''` ou un motif trop court se refuse
 * avant le réseau).
 */
type Appel = { readonly path: string; readonly method: string; readonly body: unknown };

const espion = (reponse: unknown) => {
  const appels: Appel[] = [];
  const transport = {
    request: async (requete: { path: string; method: string; body?: unknown }) => {
      appels.push({ path: requete.path, method: requete.method, body: requete.body });
      return { ok: true as const, data: reponse };
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway' as const, transport }, appels };
};

const CONSENT = 'dataProcessing' as const;

const sansMotif = (body: unknown): boolean => typeof body === 'object' && body !== null && !('reason' in body);

describe('motif absent : le geste part sans `reason`', () => {
  test('conversation — réglages, rang et retrait d’un membre', async () => {
    const { deps, appels } = espion({ id: 'c-1', title: 't', type: 'group' });
    await updateAdminConversation({ ...deps, conversationId: 'c-1', edit: { title: 'Nouveau' }, reason: null });
    await setAdminConversationMemberRole({ ...deps, conversationId: 'c-1', userId: 'u-1', role: 'moderator', reason: null });
    await removeAdminConversationMember({ ...deps, conversationId: 'c-1', userId: 'u-1' });
    expect(appels).toHaveLength(3);
    expect(appels.every((appel) => sansMotif(appel.body))).toBe(true);
  });

  test('conversation — la lecture souveraine ne porte pas `reason` dans l’adresse', async () => {
    const { deps, appels } = espion([]);
    await loadAdminSovereignThread({ ...deps, conversationId: 'c-1', offset: 0, reason: null });
    expect(appels[0]?.path).not.toContain('reason=');
    expect(appels[0]?.path).toContain('offset=0');
  });

  test('communauté, publication, lien de partage, bannissement, consentement', async () => {
    const { deps, appels } = espion({ id: 'x' });
    await updateAdminCommunity({ ...deps, communityId: 'k-1', change: { isActive: false }, reason: null });
    await removeAdminPost({ ...deps, postId: 'p-1', reason: null });
    await revealAdminShareLink({ ...deps, shareLinkId: 's-1', reason: null });
    await banAdminUser({ ...deps, userId: 'u-1', reason: null });
    await setAdminUserConsent({ ...deps, userId: 'u-1', consent: CONSENT, granted: false, reason: null });
    expect(appels).toHaveLength(5);
    expect(appels.filter((appel) => appel.method !== 'GET').every((appel) => sansMotif(appel.body))).toBe(true);
  });
});

describe('motif fourni : la validation locale demeure', () => {
  test('un motif vide ou trop court se refuse avant le réseau', async () => {
    const { deps, appels } = espion({});
    expect((await setAdminConversationMemberRole({ ...deps, conversationId: 'c-1', userId: 'u-1', role: 'moderator', reason: 'court' })).ok).toBe(false);
    expect((await banAdminUser({ ...deps, userId: 'u-1', reason: '  ' })).ok).toBe(false);
    expect((await setAdminUserConsent({ ...deps, userId: 'u-1', consent: CONSENT, granted: false, reason: '' })).ok).toBe(false);
    expect(appels).toHaveLength(0);
  });

  test('un motif valable part nettoyé', async () => {
    const { deps, appels } = espion({});
    await removeAdminPost({ ...deps, postId: 'p-1', reason: 'contenu illicite signalé' });
    expect(appels[0]?.body).toEqual({ reason: 'contenu illicite signalé' });
  });
});
