import { describe, expect, test } from 'bun:test';
import { act } from 'react';

import { AdminSectionScreen } from '@/components/admin/section-screen';
import { OBJECT_ID, servedFiche, servedMember, servedSettings } from '@/lib/admin/conversation-fixtures';
import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { createRouter, navigate } from '@/lib/router';
import { typeInto } from '@/test-support/act-mount';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { pathOf, routedTransport, type RoutedReply } from '@/test-support/routed-transport';
import { resultatServi } from '@/test-support/served-pagination';

import { AdminConversationPanel } from './admin-conversation';

/**
 * **LA FICHE D'UNE CONVERSATION** (#8876) — nommée, interprétée, agissante : les
 * chiffres, les métadonnées en mots, les membres et leurs gestes (motif écrit,
 * effet optimiste, retour arrière), la lecture souveraine qui reste offerte même
 * si la fiche échoue, la feuille « Configurer », le pilotage de l'agent sous son
 * droit, et les états dessinés.
 */
const { mount, mounter } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const NOW = new Date('2026-09-30T12:00:00.000Z');
const CONVERSATION = OBJECT_ID(1);
const MOTIVE = 'Signalement #9142 — mise en conformité';

const CONVERSATION_PATH = `/api/v1/admin/conversations/${CONVERSATION}`;

const fiche = (overrides: Readonly<Record<string, unknown>> = {}): RoutedReply => (req) =>
  req.method === 'GET' && pathOf(req) === CONVERSATION_PATH ? resultatServi({ data: servedFiche(overrides) }) : undefined;

const members = (rows: readonly unknown[], total = rows.length): RoutedReply => (req) =>
  req.method === 'GET' && pathOf(req) === `${CONVERSATION_PATH}/participants`
    ? resultatServi({ data: rows, pagination: { total, offset: 0, limit: 20, hasMore: false } })
    : undefined;

const MEMBERS = [
  servedMember(1, { role: 'creator', isOnline: true }),
  servedMember(2, { role: 'moderator' }),
  servedMember(3),
  servedMember(4, { userId: null, type: 'anonymous', displayName: 'Visiteur', user: null }),
  servedMember(5, { isActive: false }),
];

function setup(...responders: readonly RoutedReply[]) {
  const routed = routedTransport(...responders);
  const deps: AdminDeps = { source: 'gateway', transport: routed.transport };
  return { deps, calls: routed.calls };
}

function Screen({ deps }: { readonly deps: AdminDeps }) {
  return (
    <AdminSectionScreen section="conversations" language="fr" title="Conversations">
      {() => <AdminConversationPanel language="fr" conversationId={CONVERSATION} deps={deps} now={() => NOW} />}
    </AdminSectionScreen>
  );
}

async function open(deps: AdminDeps, identity = BIGBOSS) {
  const { Router } = createRouter(
    { adminConversation: { pattern: '/admin/conversations/$conversation', screen: async () => ({ default: () => <Screen deps={deps} /> }) } },
    () => <p>absent</p>,
  );
  navigate(`/admin/conversations/${CONVERSATION}`, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, identity);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-conversation-fiche], [data-admin-conversation-fiche-error]') === null && host.textContent?.includes('Espace réservé') !== true; attempt += 1) {
    await mounter.settle();
  }
  await mounter.settle();
  return host;
}

const meta = (host: ParentNode, anchor: string) => host.querySelector(`[data-admin-meta="${anchor}"]`);
const stat = (host: ParentNode, id: string) => host.querySelector(`[data-admin-stat="${id}"]`)?.textContent ?? '';
const roleCell = (host: ParentNode, row: number) => host.querySelector(`[data-admin-row="${OBJECT_ID(100 + row)}"] td:nth-child(2)`)?.textContent ?? '';
const gesture = (host: ParentNode, name: string, row: string) => host.querySelector<HTMLElement>(`[data-admin-row="${OBJECT_ID(100 + Number(row))}"] [data-admin-action="${name}"]`);
const writes = (calls: () => readonly HttpRequest[]) => calls().filter((call) => call.method !== 'GET');

describe('l’identité et les chiffres', () => {
  test('le VRAI nom, le type et la communauté en mots ; jamais un identifiant', async () => {
    const { deps } = setup(fiche(), members(MEMBERS));
    const host = await open(deps);

    const identity = host.querySelector('[data-admin-identity]')?.textContent ?? '';
    expect(identity).toContain('Atelier du jeudi');
    expect(identity).toContain('Groupe · Lycée Njanda');
    expect(identity).toContain('Active');
    expect(identity).toContain('Chiffrée sur le serveur');
    expect(host.querySelector('[data-admin-page-title]')?.textContent).toBe('Atelier du jeudi');
    expectNoRawIdentifiers(host);
  });

  test('un direct sans titre porte le nom de ses membres, et la fiche dit « Conversation privée »', async () => {
    const { deps } = setup(
      fiche({ title: null, type: 'direct', identifier: null, memberCount: 2, community: null, settings: servedSettings({ encryptionMode: null }) }),
      members(MEMBERS.slice(0, 2)),
    );
    const host = await open(deps);

    expect(host.querySelector('[data-admin-page-title]')?.textContent).toBe('Awa Diop et Jean Kamga');
    expect(host.querySelector('[data-admin-identity]')?.textContent).toContain('Conversation privée');
  });

  test('quatre chiffres formatés : membres, messages, liens de partage, agent en mots', async () => {
    const { deps } = setup(fiche({ memberCount: 12408, messageCount: 1204, shareLinkCount: 2, agentEnabled: true }), members(MEMBERS));
    const host = await open(deps);

    expect(stat(host, 'members')).toMatch(/12\s?408/);
    expect(stat(host, 'messages')).toMatch(/1\s?204/);
    expect(stat(host, 'shareLinks')).toContain('2');
    expect(stat(host, 'agent')).toContain('Actif');
  });

  test('sans statistiques de messages, « — » et non un zéro qui dirait un fil vide', async () => {
    const { deps } = setup(fiche({ messageCount: null, agentEnabled: false }), members(MEMBERS));
    const host = await open(deps);

    expect(stat(host, 'messages')).toContain('—');
    expect(stat(host, 'agent')).toContain('Inactif');
  });
});

describe('la mise en page de la fiche', () => {
  test('les membres portent leurs gestes sur TOUTE la largeur ; les métadonnées restent dans la colonne latérale', async () => {
    const { deps } = setup(fiche(), members(MEMBERS));
    const host = await open(deps);

    const aside = host.querySelector('[data-admin-fiche-aside]');
    expect(aside).not.toBeNull();
    expect(aside?.querySelector('[data-admin-meta]')).not.toBeNull();
    expect(aside?.querySelector('[data-admin-fiche-section="members"]')).toBeNull();
    expect(host.querySelector('[data-admin-fiche-section="members"]')).not.toBeNull();
    expect(host.querySelector('[data-admin-fiche-section="reading"]')?.closest('[data-admin-fiche-aside]')).toBeNull();
  });

  test('l’agent actif se dit « Agent actif » dans l’en-tête, sans se confondre avec l’état de la conversation', async () => {
    const { deps } = setup(fiche({ agentEnabled: true }), members(MEMBERS));
    const host = await open(deps);

    const identity = host.querySelector('[data-admin-identity]')?.textContent ?? '';
    expect(identity).toContain('Agent actif');
    expect(identity).toContain('Active');
  });
});

describe('les métadonnées, interprétées', () => {
  test('rang d’écriture nommé, canal d’annonces et mode lent dits en phrases', async () => {
    const { deps } = setup(
      fiche({ settings: servedSettings({ defaultWriteRole: 'moderator', isAnnouncementChannel: true, slowModeSeconds: 90 }) }),
      members(MEMBERS),
    );
    const host = await open(deps);

    expect(meta(host, 'writeRole')?.textContent).toContain('Modérateurs et plus');
    expect(meta(host, 'announcement')?.textContent).toContain('Oui : seuls les administrateurs y écrivent');
    expect(meta(host, 'slowMode')?.textContent).toMatch(/Un message toutes les 1\s+min\s+30\s+s par membre/);
    expect(meta(host, 'slowMode')?.textContent).toContain('dispensés');
  });

  test('sans mode lent : « Désactivé » ; conversation ordinaire : « Non : conversation ordinaire »', async () => {
    const { deps } = setup(fiche(), members(MEMBERS));
    const host = await open(deps);

    expect(meta(host, 'slowMode')?.textContent).toContain('Désactivé');
    expect(meta(host, 'announcement')?.textContent).toContain('Non : conversation ordinaire');
    expect(meta(host, 'autoTranslate')?.textContent).toContain('Activée');
  });

  test('un direct n’a aucune hiérarchie d’écriture : ces trois lignes ne sont pas dessinées', async () => {
    const { deps } = setup(fiche({ type: 'direct', title: 'Awa et Jean' }), members(MEMBERS));
    const host = await open(deps);

    expect(meta(host, 'writeRole')).toBeNull();
    expect(meta(host, 'announcement')).toBeNull();
    expect(meta(host, 'slowMode')).toBeNull();
    expect(meta(host, 'encryption')).not.toBeNull();
  });

  test('chiffrée de bout en bout : la conséquence est dite — le serveur ne lit pas, donc pas de traduction', async () => {
    const { deps } = setup(fiche({ settings: servedSettings({ encryptionMode: 'e2ee', autoTranslateEnabled: true }) }), members(MEMBERS));
    const host = await open(deps);

    expect(meta(host, 'encryption')?.textContent).toContain('Chiffrée de bout en bout');
    expect(meta(host, 'encryption')?.textContent).toContain('Le serveur ne lit pas les messages');
    expect(meta(host, 'autoTranslate')?.textContent).toContain('Inactive : le serveur ne peut pas lire');
  });

  test('sans mode de chiffrement servi : « Non chiffrée », jamais « Non renseigné »', async () => {
    const { deps } = setup(fiche({ settings: servedSettings({ encryptionMode: null }) }), members(MEMBERS));
    const host = await open(deps);

    expect(meta(host, 'encryption')?.textContent).toContain('Non chiffrée');
  });

  test('fermée à l’écriture : la date, la personne NOMMÉE qui l’a fermée, et l’effet', async () => {
    const { deps } = setup(
      fiche({ closedAt: '2026-09-20T09:00:00.000Z', closedBy: { id: OBJECT_ID(3), username: 'awa', displayName: 'Awa Diop', avatar: null } }),
      members(MEMBERS),
    );
    const host = await open(deps);

    expect(meta(host, 'state')?.textContent).toContain('Fermée à l’écriture');
    expect(meta(host, 'state')?.textContent).toContain('n’y écrivent plus');
    expect(meta(host, 'closedOn')?.textContent).toMatch(/semaine dernière/);
    expect(meta(host, 'closedBy')?.textContent).toContain('Awa Diop');
    expect(meta(host, 'closedBy')?.textContent).toContain('@awa');
  });

  test('archivée : le dit, et dit que plus personne n’y écrit', async () => {
    const { deps } = setup(fiche({ isActive: false }), members(MEMBERS));
    const host = await open(deps);

    expect(meta(host, 'state')?.textContent).toContain('Archivée');
    expect(meta(host, 'state')?.textContent).toContain('plus personne n’y écrit');
    expect(meta(host, 'closedOn')).toBeNull();
  });

  test('dates absolues ET relatives ; une conversation muette le dit', async () => {
    const { deps } = setup(fiche({ lastMessageAt: null }), members(MEMBERS));
    const host = await open(deps);

    expect(meta(host, 'created')?.textContent).toMatch(/2026/);
    expect(meta(host, 'created')?.textContent).toMatch(/il y a 2 mois/);
    expect(meta(host, 'lastMessage')?.textContent).toContain('Aucun message pour le moment');
  });

  test('l’identifiant technique vit seul dans sa ligne copiable', async () => {
    const { deps } = setup(fiche(), members(MEMBERS));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-technical-id]')?.textContent).toBe(CONVERSATION);
    expect(host.querySelector('[data-admin-action="copy-technical-id"]')).not.toBeNull();
  });
});

describe('les membres — nommés, avec leurs gestes', () => {
  test('nom, @pseudo, rôle en mots, état et présence ; un invité sans compte porte son nom', async () => {
    const { deps } = setup(fiche(), members(MEMBERS));
    const host = await open(deps);

    const text = host.querySelector('[data-admin-fiche-section="members"]')?.textContent ?? '';
    for (const expected of ['Awa Diop', '@membre1', 'Créateur', 'Modérateur', 'Membre', 'Visiteur', 'Actif', 'A quitté la conversation', 'En ligne', 'Hors ligne']) {
      expect(text).toContain(expected);
    }
    expect(text).toContain('5 participant(s)');
    expectNoRawIdentifiers(host);
  });

  test('chaque membre ouvre sa fiche, dans l’espace courant ; un invité, sa fiche d’anonyme par sa ligne de participation', async () => {
    const { deps } = setup(fiche(), members(MEMBERS));
    const host = await open(deps);

    const hrefOf = (row: number) => host.querySelector(`[data-admin-row="${OBJECT_ID(100 + row)}"] td a`)?.getAttribute('href');
    expect(hrefOf(2)).toBe(`/admin/users/${OBJECT_ID(2)}`);
    expect(hrefOf(4)).toBe(`/admin/anonymous/${OBJECT_ID(104)}`);
  });

  test('le créateur est protégé : aucun geste, et la phrase le DIT', async () => {
    const { deps } = setup(fiche(), members(MEMBERS));
    const host = await open(deps);

    expect(gesture(host, 'member-role', '1')).toBeNull();
    expect(gesture(host, 'member-remove', '1')).toBeNull();
    expect(host.querySelector(`[data-admin-row="${OBJECT_ID(101)}"] [data-admin-member-protected]`)?.textContent).toContain('le créateur ne peut être ni rétrogradé ni retiré');
  });

  test('un invité anonyme et un membre parti n’ont aucun geste : les routes se disent en identifiant de compte', async () => {
    const { deps } = setup(fiche(), members(MEMBERS));
    const host = await open(deps);

    for (const row of ['4', '5']) {
      expect(gesture(host, 'member-role', row)).toBeNull();
      expect(gesture(host, 'member-remove', row)).toBeNull();
    }
    expect(gesture(host, 'member-role', '3')).not.toBeNull();
  });

  test('changer un rôle : le choix ouvre la confirmation, qui dit qui, de quel rôle à quel rôle', async () => {
    const { deps, calls } = setup(fiche(), members(MEMBERS));
    const host = await open(deps);

    typeInto(gesture(host, 'member-role', '3') as HTMLSelectElement, 'admin');
    await mounter.settle();

    const sheet = document.querySelector('[data-admin-confirm]');
    expect(sheet?.textContent).toContain('Léa Moreau passera de « Membre » à « Administrateur »');
    expect(sheet?.textContent).toContain('journal d’audit');
    expect(writes(calls)).toEqual([]);
  });

  test('la confirmation reste inerte sous dix caractères de motif, puis envoie PATCH avec le rôle et le motif', async () => {
    const { deps, calls } = setup(
      fiche(),
      members(MEMBERS),
      (req) => (req.method === 'PATCH' ? { ok: true, data: { conversationId: CONVERSATION, userId: OBJECT_ID(3), participantId: OBJECT_ID(103), role: 'admin' } } : undefined),
    );
    const host = await open(deps);
    typeInto(gesture(host, 'member-role', '3') as HTMLSelectElement, 'admin');
    await mounter.settle();

    mounter.type(document.body, '[data-admin-motive]', 'Neuf care');
    expect(document.querySelector<HTMLButtonElement>('[data-admin-action="confirm"]')?.disabled).toBe(true);

    mounter.type(document.body, '[data-admin-motive]', MOTIVE);
    await mounter.click(document.querySelector<HTMLElement>('[data-admin-action="confirm"]'));

    const patch = writes(calls)[0];
    expect(patch?.method).toBe('PATCH');
    expect(patch?.path).toBe(`${CONVERSATION_PATH}/participants/${OBJECT_ID(3)}`);
    expect(patch?.body).toEqual({ role: 'admin', reason: MOTIVE });
    expect(document.querySelector('[data-admin-confirm]')).toBeNull();
    expect(host.querySelector('[data-admin-announcement]')?.textContent).toBe('Rôle modifié');
  });

  test('l’effet est immédiat sur la liste, puis la vérité du serveur est relue', async () => {
    let served = MEMBERS;
    const { deps, calls } = setup(fiche(), (req) => (req.method === 'GET' && pathOf(req) === `${CONVERSATION_PATH}/participants` ? resultatServi({ data: served, pagination: { total: 5, offset: 0, limit: 20, hasMore: false } }) : undefined), (req) => {
      if (req.method !== 'PATCH') return undefined;
      served = MEMBERS.map((member) => (member.id === OBJECT_ID(103) ? { ...member, role: 'admin' } : member));
      return { ok: true, data: { conversationId: CONVERSATION, userId: OBJECT_ID(3), participantId: OBJECT_ID(103), role: 'admin' } };
    });
    const host = await open(deps);
    typeInto(gesture(host, 'member-role', '3') as HTMLSelectElement, 'admin');
    await mounter.settle();
    mounter.type(document.body, '[data-admin-motive]', MOTIVE);
    await mounter.click(document.querySelector<HTMLElement>('[data-admin-action="confirm"]'));

    expect(roleCell(host, 3)).toBe('Administrateur');
    expect(calls().filter((call) => call.method === 'GET' && pathOf(call) === `${CONVERSATION_PATH}/participants`).length).toBeGreaterThan(1);
  });

  test('un refus DÉFAIT l’effet optimiste et le dit dans la confirmation, qui reste ouverte', async () => {
    const { deps } = setup(fiche(), members(MEMBERS), (req) => (req.method === 'PATCH' ? { ok: false, status: 500, error: 'boom' } : undefined));
    const host = await open(deps);
    typeInto(gesture(host, 'member-role', '3') as HTMLSelectElement, 'admin');
    await mounter.settle();
    mounter.type(document.body, '[data-admin-motive]', MOTIVE);
    await mounter.click(document.querySelector<HTMLElement>('[data-admin-action="confirm"]'));

    expect(roleCell(host, 3)).toBe('Membre');
    expect(document.querySelector('[data-admin-confirm-error]')).not.toBeNull();
    expect(document.querySelector('[data-admin-confirm]')).not.toBeNull();
  });

  test('« Annuler » referme sans rien envoyer, et le choix retombe sur le rôle servi', async () => {
    const { deps, calls } = setup(fiche(), members(MEMBERS));
    const host = await open(deps);
    typeInto(gesture(host, 'member-role', '3') as HTMLSelectElement, 'admin');
    await mounter.settle();

    await mounter.click(document.querySelector<HTMLElement>('[data-admin-confirm] [data-admin-action="cancel"]'));

    expect(document.querySelector('[data-admin-confirm]')).toBeNull();
    expect(writes(calls)).toEqual([]);
    expect((gesture(host, 'member-role', '3') as HTMLSelectElement).value).toBe('member');
  });

  test('un 403 « créateur protégé » se dit par sa phrase, pas par « permission refusée »', async () => {
    const { deps } = setup(fiche(), members(MEMBERS), (req) => (req.method === 'PATCH' ? { ok: false, status: 403, error: 'refusé', code: 'CREATOR_PROTECTED' } : undefined));
    const host = await open(deps);
    typeInto(gesture(host, 'member-role', '3') as HTMLSelectElement, 'moderator');
    await mounter.settle();
    mounter.type(document.body, '[data-admin-motive]', MOTIVE);
    await mounter.click(document.querySelector<HTMLElement>('[data-admin-action="confirm"]'));

    expect(document.querySelector('[data-admin-confirm-error]')?.textContent).toContain('Le créateur de la conversation est protégé');
  });

  test('retirer un membre : confirmation dangereuse avec motif, puis POST …/remove ; le membre passe à « A quitté »', async () => {
    const { deps, calls } = setup(
      fiche(),
      members(MEMBERS),
      (req) => (req.method === 'POST' ? { ok: true, data: { conversationId: CONVERSATION, userId: OBJECT_ID(3), participantId: OBJECT_ID(103), removed: true } } : undefined),
    );
    const host = await open(deps);

    await mounter.click(gesture(host, 'member-remove', '3'));
    expect(document.querySelector('[data-admin-confirm]')?.textContent).toContain('Léa Moreau sera retiré de la conversation');
    mounter.type(document.body, '[data-admin-motive]', MOTIVE);
    await mounter.click(document.querySelector<HTMLElement>('[data-admin-action="confirm"]'));

    const removal = writes(calls)[0];
    expect(removal?.method).toBe('POST');
    expect(removal?.path).toBe(`${CONVERSATION_PATH}/participants/${OBJECT_ID(3)}/remove`);
    expect(removal?.body).toEqual({ reason: MOTIVE });
    expect(host.querySelector('[data-admin-announcement]')?.textContent).toBe('Membre retiré');
  });

  test('la conversation globale ne se vide pas : pas de bouton « Retirer » ; un direct n’a pas de rôle à changer', async () => {
    const global = setup(fiche({ type: 'global' }), members(MEMBERS));
    const hostGlobal = await open(global.deps);
    expect(gesture(hostGlobal, 'member-remove', '3')).toBeNull();
    expect(gesture(hostGlobal, 'member-role', '3')).not.toBeNull();
  });

  test('hors ligne, les gestes sont désactivés', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    try {
      const { deps } = setup(fiche(), members(MEMBERS));
      const host = await open(deps);
      await act(async () => {
        window.dispatchEvent(new Event('offline'));
      });
      await mounter.settle();

      expect((gesture(host, 'member-remove', '3') as HTMLButtonElement).disabled).toBe(true);
      expect(host.querySelector<HTMLButtonElement>('[data-admin-action="configure"]')?.disabled).toBe(true);
    } finally {
      Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
      await act(async () => {
        window.dispatchEvent(new Event('online'));
      });
    }
  });
});

describe('la lecture souveraine — le contrat reste', () => {
  test('le portillon est là dès l’ouverture, AVANT toute requête de messages', async () => {
    const { deps, calls } = setup(fiche(), members(MEMBERS));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-reading-gate]')).not.toBeNull();
    expect(host.querySelector('[data-admin-reason]')).not.toBeNull();
    expect(calls().some((call) => pathOf(call).endsWith('/messages'))).toBe(false);
  });

  test('le motif ouvre la lecture : GET …/messages avec `reason`, rien avant dix caractères', async () => {
    const { deps, calls } = setup(
      fiche(),
      members(MEMBERS),
      (req) => (pathOf(req) === `${CONVERSATION_PATH}/messages` ? resultatServi({ data: [], pagination: { total: 0, offset: 0, limit: 30, hasMore: false } }) : undefined),
    );
    const host = await open(deps);

    mounter.type(host, '[data-admin-reason]', 'Neuf care');
    expect(host.querySelector<HTMLButtonElement>('[data-admin-reason-submit]')?.disabled).toBe(true);

    mounter.type(host, '[data-admin-reason]', MOTIVE);
    await mounter.click(host.querySelector<HTMLElement>('[data-admin-reason-submit]'));

    const read = calls().find((call) => pathOf(call).endsWith('/messages'));
    expect(new URL(read?.path ?? '', 'https://x.test').searchParams.get('reason')).toBe(MOTIVE);
    expect(host.querySelector('[data-admin-reading-empty]')).not.toBeNull();
  });

  test('aucune trace du motif ni du fil dans le cache persistable : les clés sont souveraines', async () => {
    const { deps } = setup(fiche(), members(MEMBERS));
    await open(deps);

    const keys = appQueryClient.getQueryCache().getAll().map((query) => query.queryKey);
    const conversationKeys = keys.filter((key) => key.includes(CONVERSATION));
    expect(conversationKeys.length).toBeGreaterThan(0);
    expect(conversationKeys.every((key) => key[0] === 'admin-souverain')).toBe(true);
  });

  test('si la fiche échoue, la lecture reste offerte sous l’avis d’erreur', async () => {
    const { deps } = setup((req) => (req.method === 'GET' && pathOf(req) === CONVERSATION_PATH ? { ok: false, status: 500, error: 'boom' } : undefined), members(MEMBERS));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-conversation-fiche-error] [data-admin-error]')).not.toBeNull();
    expect(host.querySelector('[data-admin-reading-gate]')).not.toBeNull();
  });
});

describe('configurer, et l’agent', () => {
  test('« Configurer » ouvre la feuille existante, sans rôle de membre ni retrait, et enregistre sous motif', async () => {
    const { deps, calls } = setup(
      fiche(),
      members(MEMBERS),
      (req) => (req.method === 'PATCH' && pathOf(req) === CONVERSATION_PATH ? { ok: true, data: { id: CONVERSATION, title: 'Atelier du vendredi', type: 'group' } } : undefined),
    );
    const host = await open(deps);

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-action="configure"]'));
    expect(document.querySelector(`[data-admin-conv-settings="${CONVERSATION}"]`)).not.toBeNull();
    expect(document.querySelector('[data-admin-conv-member-role]')).toBeNull();
    expect(document.querySelector('[data-admin-conv-remove]')).toBeNull();
    expect(document.querySelector('[data-admin-conv-settings]')?.textContent).toContain('Atelier du jeudi · Groupe');

    mounter.type(document.body, '[data-admin-conv-field="title"]', 'Atelier du vendredi');
    mounter.type(document.body, '[data-admin-conv-reason]', MOTIVE);
    await mounter.click(document.querySelector<HTMLElement>('[data-admin-conv-save]'));

    const patch = writes(calls)[0];
    expect(patch?.path).toBe(CONVERSATION_PATH);
    expect(patch?.body).toEqual({ title: 'Atelier du vendredi', reason: MOTIVE });
    expect(calls().filter((call) => call.method === 'GET' && pathOf(call) === CONVERSATION_PATH).length).toBeGreaterThan(1);
  });

  test('le pilotage de l’agent n’apparaît qu’avec `canManageAgent` ET une conversation qui a un agent', async () => {
    const live = (req: HttpRequest): ApiResult<unknown> | undefined =>
      req.method === 'GET' && pathOf(req) === `/api/v1/admin/agent/configs/${CONVERSATION}/live`
        ? { ok: true, data: { conversationId: CONVERSATION, isScanning: false, currentNode: null, controlledUsers: [] } }
        : undefined;

    const withAgent = await open(setup(fiche({ agentEnabled: true }), members(MEMBERS), live).deps);
    expect(withAgent.querySelector(`[data-agent-conversation-control="${CONVERSATION}"]`)).not.toBeNull();
    expect(withAgent.querySelector(`[data-agent-relaunch-effect="${CONVERSATION}"]`)?.textContent).toContain('publier un message');
  });

  test('sans `canManageAgent`, le bloc agent ne se peint pas et rien n’est lu', async () => {
    const { deps, calls } = setup(fiche({ agentEnabled: true }), members(MEMBERS));
    const host = await open(deps, adminIdentityFixture({ role: 'ADMIN', permissions: { canManageAgent: false } }));

    expect(host.querySelector('[data-agent-conversation-control]')).toBeNull();
    expect(calls().some((call) => pathOf(call).includes('/agent/'))).toBe(false);
  });
});

describe('les états dessinés et l’accès', () => {
  test('squelette tant que la fiche est en vol', async () => {
    const { deps } = setup((req) => (pathOf(req) === CONVERSATION_PATH ? (new Promise<never>(() => undefined) as never) : undefined));
    const { Router } = createRouter(
      { adminConversation: { pattern: '/admin/conversations/$conversation', screen: async () => ({ default: () => <Screen deps={deps} /> }) } },
      () => <p>absent</p>,
    );
    navigate(`/admin/conversations/${CONVERSATION}`, true);
    const host = await mount(<Router wrap={(children) => children} skeleton={null} />, BIGBOSS);
    for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-conversation-loading]') === null; attempt += 1) await mounter.settle();

    expect(host.querySelector('[data-admin-conversation-loading]')).not.toBeNull();
  });

  test('404 : « cette conversation n’existe plus », avec le chemin du retour — et aucune lecture à offrir', async () => {
    const { deps } = setup((req) => (pathOf(req) === CONVERSATION_PATH ? { ok: false, status: 404, error: 'introuvable' } : undefined));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('n’existe plus');
    expect(host.querySelector('[data-admin-link="back-to-list"]')?.getAttribute('href')).toBe('/admin/conversations');
    expect(host.querySelector('[data-admin-reading-gate]')).toBeNull();
  });

  test('403 : un bloc refusé, pas une panne, et la lecture non plus', async () => {
    const { deps } = setup((req) => (pathOf(req) === CONVERSATION_PATH ? { ok: false, status: 403, error: 'Forbidden' } : undefined));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-denied-inline]')).not.toBeNull();
    expect(host.querySelector('[data-admin-reading-gate]')).toBeNull();
  });

  test('erreur : « Réessayer » relit la fiche', async () => {
    let served = 0;
    const { deps } = setup(
      (req) => {
        if (req.method !== 'GET' || pathOf(req) !== CONVERSATION_PATH) return undefined;
        served += 1;
        return served === 1 ? { ok: false, status: 500, error: 'boom' } : resultatServi({ data: servedFiche() });
      },
      members(MEMBERS),
    );
    const host = await open(deps);

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-error] [data-admin-retry]'));
    await mounter.settle();
    await mounter.settle();

    expect(host.querySelector('[data-admin-conversation-fiche]')).not.toBeNull();
    expect(host.querySelector('[data-admin-page-title]')?.textContent).toBe('Atelier du jeudi');
  });

  test('les membres en erreur ne cassent pas la fiche : leur bloc dit l’erreur, le reste sert', async () => {
    const { deps } = setup(fiche(), (req) => (pathOf(req).endsWith('/participants') ? { ok: false, status: 500, error: 'boom' } : undefined));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-fiche-section="members"] [data-admin-error]')).not.toBeNull();
    expect(host.querySelector('[data-admin-page-title]')?.textContent).toBe('Atelier du jeudi');
  });

  test('un MODERATOR porte la permission mais pas le rang : rien n’est lu', async () => {
    const { deps, calls } = setup(fiche(), members(MEMBERS));
    await open(deps, adminIdentityFixture({ role: 'MODERATOR' }));

    expect(calls()).toEqual([]);
  });
});
