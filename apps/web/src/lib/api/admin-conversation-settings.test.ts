import { describe, expect, test } from 'bun:test';

import {
  MOTIF_LONGUEUR_MINIMALE,
  removeAdminConversationMember,
  setAdminConversationMemberRole,
  updateAdminConversation,
} from './admin-conversation-settings';
import type { HttpTransport } from './http';

/**
 * CONFIGURER UNE CONVERSATION SANS EN ÊTRE MEMBRE (#7845 E1–E3) — les trois
 * écritures souveraines, sous `canManageConversations` + rang ADMIN, chacune
 * avec un MOTIF d'au moins dix caractères que la passerelle journalise.
 *
 * Le motif trop court se refuse AVANT le réseau : la passerelle le refuserait
 * en 400, et un refus certain d'avance ne mérite pas un aller-retour.
 */

const MOTIF = 'plainte du membre, ticket 4521';

const CONVERSATION_SERVIE = {
  id: 'c-1',
  identifier: 'mshy_abc',
  title: 'Nouveau titre',
  type: 'group',
  isActive: true,
  memberCount: 4,
  messageCount: 12,
  settings: { defaultWriteRole: 'member', isAnnouncementChannel: false, slowModeSeconds: 0, autoTranslateEnabled: true, encryptionMode: null },
};

const transportEspion = (reponse: unknown, ok = true) => {
  const appels: { path: string; method: string; body: unknown }[] = [];
  const transport = {
    request: async (requete: { path: string; method: string; body?: unknown }) => {
      appels.push({ path: requete.path, method: requete.method, body: requete.body });
      return ok ? { ok: true as const, data: reponse } : reponse;
    },
  } as unknown as HttpTransport;
  return { transport, appels };
};

const deps = (transport: HttpTransport) => ({ source: 'gateway' as const, transport });

describe('updateAdminConversation — E1', () => {
  test('vise PATCH /api/v1/admin/conversations/:id, identifiant ENCODÉ, et décode la conversation rendue', async () => {
    const { transport, appels } = transportEspion(CONVERSATION_SERVIE);

    const resultat = await updateAdminConversation({
      ...deps(transport),
      conversationId: 'c 1/x',
      edit: { title: 'Nouveau titre' },
      reason: MOTIF,
    });

    expect(appels[0]?.method).toBe('PATCH');
    expect(appels[0]?.path).toBe(`/api/v1/admin/conversations/${encodeURIComponent('c 1/x')}`);
    expect(appels[0]?.body).toEqual({ title: 'Nouveau titre', reason: MOTIF });
    expect(resultat.ok && resultat.data.title).toBe('Nouveau titre');
    expect(resultat.ok && resultat.data.messageCount).toBe(12);
  });

  test('omet les champs `undefined`, garde `null` (qui EFFACE une image) et `false`', async () => {
    const { transport, appels } = transportEspion(CONVERSATION_SERVIE);

    await updateAdminConversation({
      ...deps(transport),
      conversationId: 'c-1',
      edit: { title: undefined, avatar: null, isAnnouncementChannel: false, closed: true, description: undefined },
      reason: MOTIF,
    });

    expect(appels[0]?.body).toEqual({ avatar: null, isAnnouncementChannel: false, closed: true, reason: MOTIF });
  });

  test('refuse un motif trop court AVANT le réseau', async () => {
    const { transport, appels } = transportEspion(CONVERSATION_SERVIE);

    const resultat = await updateAdminConversation({
      ...deps(transport),
      conversationId: 'c-1',
      edit: { title: 'x' },
      reason: '   court   ',
    });

    expect(appels).toHaveLength(0);
    expect(!resultat.ok && resultat.status).toBe(0);
    expect(MOTIF_LONGUEUR_MINIMALE).toBe(10);
  });

  test('refuse une édition VIDE avant le réseau', async () => {
    const { transport, appels } = transportEspion(CONVERSATION_SERVIE);

    const resultat = await updateAdminConversation({ ...deps(transport), conversationId: 'c-1', edit: { title: undefined }, reason: MOTIF });

    expect(appels).toHaveLength(0);
    expect(!resultat.ok && resultat.status).toBe(0);
  });

  test('un refus NOMMÉ remonte avec son code', async () => {
    const refus = { ok: false as const, status: 400, error: 'No translation on e2ee', code: 'E2EE_NO_TRANSLATION' };
    const { transport } = transportEspion(refus, false);

    const resultat = await updateAdminConversation({ ...deps(transport), conversationId: 'c-1', edit: { autoTranslateEnabled: true }, reason: MOTIF });

    expect(resultat).toEqual(refus);
  });

  test('une charge illisible devient un échec à status 0', async () => {
    const { transport } = transportEspion({ pasUnId: true });

    const resultat = await updateAdminConversation({ ...deps(transport), conversationId: 'c-1', edit: { title: 'x' }, reason: MOTIF });

    expect(!resultat.ok && resultat.status).toBe(0);
  });
});

describe('setAdminConversationMemberRole — E2', () => {
  test('vise PATCH …/participants/:userId avec `{ role, reason }`', async () => {
    const { transport, appels } = transportEspion({ conversationId: 'c-1', userId: 'u-1', participantId: 'p-1', role: 'moderator' });

    const resultat = await setAdminConversationMemberRole({
      ...deps(transport),
      conversationId: 'c-1',
      userId: 'u 1',
      role: 'moderator',
      reason: MOTIF,
    });

    expect(appels[0]?.method).toBe('PATCH');
    expect(appels[0]?.path).toBe(`/api/v1/admin/conversations/c-1/participants/${encodeURIComponent('u 1')}`);
    expect(appels[0]?.body).toEqual({ role: 'moderator', reason: MOTIF });
    expect(resultat.ok && resultat.data).toEqual({ conversationId: 'c-1', userId: 'u-1', participantId: 'p-1', role: 'moderator' });
  });

  test('refuse un motif trop court avant le réseau', async () => {
    const { transport, appels } = transportEspion({});

    const resultat = await setAdminConversationMemberRole({ ...deps(transport), conversationId: 'c-1', userId: 'u-1', role: 'admin', reason: 'non' });

    expect(appels).toHaveLength(0);
    expect(!resultat.ok && resultat.status).toBe(0);
  });

  test('le créateur protégé remonte 403 CREATOR_PROTECTED tel quel', async () => {
    const refus = { ok: false as const, status: 403, error: 'Creator', code: 'CREATOR_PROTECTED' };
    const { transport } = transportEspion(refus, false);

    expect(
      await setAdminConversationMemberRole({ ...deps(transport), conversationId: 'c-1', userId: 'u-1', role: 'member', reason: MOTIF }),
    ).toEqual(refus);
  });
});

describe('removeAdminConversationMember — E3', () => {
  test('vise POST …/participants/:userId/remove avec `{ reason }`', async () => {
    const { transport, appels } = transportEspion({ conversationId: 'c-1', userId: 'u-1', participantId: 'p-1', removed: true });

    const resultat = await removeAdminConversationMember({ ...deps(transport), conversationId: 'c-1', userId: 'u-1', reason: MOTIF });

    expect(appels[0]?.method).toBe('POST');
    expect(appels[0]?.path).toBe('/api/v1/admin/conversations/c-1/participants/u-1/remove');
    expect(appels[0]?.body).toEqual({ reason: MOTIF });
    expect(resultat.ok && resultat.data.removed).toBe(true);
  });

  test('refuse un motif trop court avant le réseau', async () => {
    const { transport, appels } = transportEspion({});

    const resultat = await removeAdminConversationMember({ ...deps(transport), conversationId: 'c-1', userId: 'u-1', reason: '' });

    expect(appels).toHaveLength(0);
    expect(!resultat.ok && resultat.status).toBe(0);
  });
});
