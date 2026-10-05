import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { decodeAdminConversation, type AdminConversation } from '@/lib/api/admin-user-conversations';
import { loadAdminInterfaceCatalog, translateAdmin } from '@/lib/i18n-admin-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter, typeInto } from '@/test-support/act-mount';
import { pathOf, routedTransport } from '@/test-support/routed-transport';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminConversationSettingsSheet } from './admin-conversation-settings-sheet';

/**
 * **CONFIGURER UNE CONVERSATION DEPUIS LA FICHE D'UN MEMBRE** (#7845, #7999) —
 * ce que l'administrateur voit et ce qui part : le motif OUVRE le geste, seuls
 * les champs CHANGÉS voyagent, un geste destructeur se CONFIRME, et le créateur
 * reste intouchable.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadAdminInterfaceCatalog('fr');
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

function conversation(overrides: Record<string, unknown> = {}): AdminConversation {
  const decodee = decodeAdminConversation({
    id: 'c-atelier',
    title: 'Atelier',
    description: 'Le groupe du jeudi',
    type: 'group',
    memberCount: 4,
    isActive: true,
    settings: { defaultWriteRole: 'everyone', isAnnouncementChannel: false, slowModeSeconds: 0, autoTranslateEnabled: true, encryptionMode: null },
    membership: { userId: 'u-membre', displayName: 'Le membre', role: 'member', isActive: true },
    ...overrides,
  });
  if (decodee === null) throw new Error('conversation de recette illisible');
  return decodee;
}

const MOTIF = 'Signalement #9142 — mise en conformité';

async function monter(conv: AdminConversation = conversation()) {
  const t = routedTransport((req) => {
    if (req.method === 'PATCH' && pathOf(req) === '/api/v1/admin/conversations/c-atelier') {
      return { ok: true, data: { id: 'c-atelier', title: 'Atelier', type: 'group' } };
    }
    if (req.method === 'PATCH' && pathOf(req).endsWith('/participants/u-membre')) {
      return { ok: true, data: { conversationId: 'c-atelier', userId: 'u-membre', participantId: 'p1', role: 'moderator' } };
    }
    if (req.method === 'POST' && pathOf(req).endsWith('/participants/u-membre/remove')) {
      return { ok: true, data: { conversationId: 'c-atelier', userId: 'u-membre', participantId: 'p1', removed: true } };
    }
    return undefined;
  });
  const annonces: string[] = [];
  let changements = 0;
  let fermetures = 0;
  await mounter.mount(
    <AdminConversationSettingsSheet
      conversation={conv}
      userId="u-membre"
      language="fr"
      deps={{ source: 'gateway', transport: t.transport }}
      onAnnounce={(texte) => annonces.push(texte)}
      onChanged={() => {
        changements += 1;
      }}
      onClose={() => {
        fermetures += 1;
      }}
    />,
  );
  return { t, annonces, changements: () => changements, fermetures: () => fermetures };
}

const q = <T extends Element>(selecteur: string) => document.querySelector<T>(selecteur);

describe('le motif ouvre le geste', () => {
  test('sous dix caractères, Enregistrer reste inactif', async () => {
    await monter();
    mounter.type(document.body, '[data-admin-conv-field="title"]', 'Atelier du jeudi');
    mounter.type(document.body, '[data-admin-conv-reason]', 'Neuf care');
    expect(q<HTMLButtonElement>('[data-admin-conv-save]')?.disabled).toBe(true);
    mounter.type(document.body, '[data-admin-conv-reason]', MOTIF);
    expect(q<HTMLButtonElement>('[data-admin-conv-save]')?.disabled).toBe(false);
  });

  test('un motif sans aucun changement n’ouvre rien non plus', async () => {
    await monter();
    mounter.type(document.body, '[data-admin-conv-reason]', MOTIF);
    expect(q<HTMLButtonElement>('[data-admin-conv-save]')?.disabled).toBe(true);
  });
});

describe('ce qui part', () => {
  test('SEUL le champ changé voyage, avec le motif', async () => {
    const { t, annonces, changements, fermetures } = await monter();
    mounter.type(document.body, '[data-admin-conv-field="title"]', 'Atelier du jeudi');
    mounter.type(document.body, '[data-admin-conv-reason]', MOTIF);
    await mounter.click(q('[data-admin-conv-save]'));

    const ecriture = t.calls().find((c) => c.method === 'PATCH');
    expect(ecriture?.path).toBe('/api/v1/admin/conversations/c-atelier');
    expect(ecriture?.body).toEqual({ title: 'Atelier du jeudi', reason: MOTIF });
    expect(annonces).toContain(translateAdmin('fr', 'admin.convSettings.saved'));
    expect(changements()).toBe(1);
    expect(fermetures()).toBe(1);
  });

  test('changer le rôle du membre passe par SA route, pas par celle de la conversation', async () => {
    const { t } = await monter();
    typeInto(q<HTMLSelectElement>('[data-admin-conv-member-role]'), 'moderator');
    mounter.type(document.body, '[data-admin-conv-reason]', MOTIF);
    await mounter.click(q('[data-admin-conv-save]'));

    expect(t.calls().some((c) => pathOf(c) === '/api/v1/admin/conversations/c-atelier')).toBe(false);
    const role = t.calls().find((c) => pathOf(c).endsWith('/participants/u-membre'));
    expect(role?.method).toBe('PATCH');
    expect(role?.body).toEqual({ role: 'moderator', reason: MOTIF });
  });

  test('ARCHIVER se confirme : le premier geste ne part pas', async () => {
    const { t } = await monter();
    await mounter.click(q('[data-admin-conv-toggle="archive"]'));
    mounter.type(document.body, '[data-admin-conv-reason]', MOTIF);
    await mounter.click(q('[data-admin-conv-save]'));
    expect(t.calls()).toHaveLength(0);
    expect(q('[data-admin-conv-save]')?.textContent).toBe(translateAdmin('fr', 'admin.convSettings.confirm'));

    await mounter.click(q('[data-admin-conv-save]'));
    expect(t.calls().find((c) => c.method === 'PATCH')?.body).toEqual({ isActive: false, reason: MOTIF });
  });

  test('une conversation DIRECTE ne propose pas les droits d’écriture', async () => {
    await monter(conversation({ type: 'direct' }));
    expect(q('[data-admin-conv-field="defaultWriteRole"]')).toBe(null);
    expect(q('[data-admin-conv-field="slowModeSeconds"]')).toBe(null);
  });
});

describe('retirer le membre', () => {
  test('le retrait se confirme, puis part en POST …/remove', async () => {
    const { t, annonces } = await monter();
    mounter.type(document.body, '[data-admin-conv-reason]', MOTIF);
    await mounter.click(q('[data-admin-conv-remove]'));
    expect(t.calls()).toHaveLength(0);

    await mounter.click(q('[data-admin-conv-remove]'));
    const retrait = t.calls().find((c) => c.method === 'POST');
    expect(retrait?.path).toBe('/api/v1/admin/conversations/c-atelier/participants/u-membre/remove');
    expect(retrait?.body).toEqual({ reason: MOTIF });
    expect(annonces).toContain(translateAdmin('fr', 'admin.convSettings.removed'));
  });

  test('le CRÉATEUR n’a ni rôle à changer ni bouton de retrait — et l’écran dit pourquoi', async () => {
    await monter(conversation({ membership: { userId: 'u-membre', displayName: 'Le membre', role: 'creator', isActive: true } }));
    expect(q('[data-admin-conv-member-role]')).toBe(null);
    expect(q('[data-admin-conv-remove]')).toBe(null);
    expect(document.body.textContent ?? '').toContain(translateAdmin('fr', 'admin.convSettings.creatorProtected'));
  });
});
