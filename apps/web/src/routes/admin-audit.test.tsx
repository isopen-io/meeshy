import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { AdminSectionScreen } from '@/components/admin/section-screen';
import { OBJECT_ID, servedAuditEntry, servedAuditPerson } from '@/lib/admin/audit-fixtures';
import { visibleAdminSections } from '@/lib/admin/sections';
import type { AdminDeps } from '@/lib/api/admin';
import { ADMIN_AUDIT_KEY } from '@/lib/api/admin-audit';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient, persistableQuery } from '@/lib/api/query-client';
import { createRouter, navigate } from '@/lib/router';
import { typeInto } from '@/test-support/act-mount';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminAuditPanel } from './admin-audit';

/**
 * **LE JOURNAL D'AUDIT** (#8876, #6727) — la liste nommée (administrateur, action, élément
 * visé, motif), filtrée dans l'adresse (famille, genre, période, administrateur, sujet),
 * triée sur la date, paginée ; chaque rangée ouvre une FEUILLE de détail ; les états sont
 * dessinés ; rien du journal ne reste sur le disque ni en mémoire ; ADMIN ne le voit pas.
 */

const { mount, mounter } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const AUDIT = adminIdentityFixture({ role: 'AUDIT' });
const NOW = new Date('2026-09-30T12:00:00.000Z');

type Handler = (path: string) => ApiResult<unknown> | Promise<ApiResult<unknown>>;

function scripted(list: Handler): { readonly deps: AdminDeps; readonly paths: string[] } {
  const paths: string[] = [];
  const transport = {
    request: async (request: HttpRequest) => {
      paths.push(request.path);
      return list(request.path);
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway', transport }, paths };
}

const page = (entries: readonly unknown[], total = entries.length, hasMore = false) => ({
  ok: true as const,
  status: 200,
  data: entries,
  pagination: { total, limit: 30, offset: 0, hasMore },
});

const ROLE_CHANGE = servedAuditEntry();
const MESSAGES_READ = servedAuditEntry({
  id: OBJECT_ID(11),
  action: 'ADMIN_CONVERSATION_MESSAGES_VIEWED',
  createdAt: '2026-09-30T10:00:00.000Z',
  subject: null,
  target: { type: 'Conversation', id: OBJECT_ID(5), label: 'Les voisins', secondary: 'group' },
  reason: 'Plainte pour harcèlement : lecture de la conversation sur demande de la modération',
  changes: null,
});
const UNKNOWN = servedAuditEntry({
  id: OBJECT_ID(12),
  action: 'SOME_FUTURE_ACTION',
  admin: null,
  subject: null,
  target: { type: 'SomethingNew', id: OBJECT_ID(6), label: null, secondary: null },
  reason: null,
  changes: null,
});
const LINK_CLOSED = servedAuditEntry({
  id: OBJECT_ID(13),
  action: 'ADMIN_SHARE_LINK_CLOSED',
  subject: null,
  target: { type: 'ConversationShareLink', id: OBJECT_ID(7), label: null, secondary: null },
  reason: null,
  changes: [{ field: 'isActive', before: 'true', after: 'false' }],
});
const ROWS = [ROLE_CHANGE, MESSAGES_READ, UNKNOWN, LINK_CLOSED];

function Screen({ deps }: { readonly deps: AdminDeps }) {
  return (
    <AdminSectionScreen section="audit" language="fr" title="Journal d’audit">
      {() => <AdminAuditPanel language="fr" deps={deps} now={() => NOW} />}
    </AdminSectionScreen>
  );
}

async function open(deps: AdminDeps, url = '/admin/audit', identity = BIGBOSS) {
  const { Router } = createRouter(
    {
      adminAudit: { pattern: '/admin/audit', screen: async () => ({ default: () => <Screen deps={deps} /> }) },
      admAudit: { pattern: '/adm/audit', screen: async () => ({ default: () => <Screen deps={deps} /> }) },
    },
    () => <p>absent</p>,
  );
  navigate(url, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, identity);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-audit]') === null && host.textContent?.includes('Espace réservé') !== true; attempt += 1) {
    await mounter.settle();
  }
  await mounter.settle();
  return host;
}

const wait = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const rowIds = (host: ParentNode) => [...host.querySelectorAll('[data-admin-row]')].map((row) => row.getAttribute('data-admin-row'));
const rowText = (host: ParentNode, id: string) => (host.querySelector(`[data-admin-row="${id}"]`)?.textContent ?? '').replace(/ | /g, ' ');
const listPaths = (paths: readonly string[]) => paths.filter((path) => path.startsWith(`${adminEndpoints.auditLogs}?`)).map((path) => decodeURIComponent(path));
const openDetail = async (host: ParentNode, id: string) => {
  await mounter.click(host.querySelector<HTMLElement>(`[data-admin-audit-open="${id}"]`));
  const sheet = host.querySelector<HTMLElement>('[data-admin-audit-detail]');
  if (sheet === null) throw new Error('feuille de détail absente');
  return sheet;
};

describe('la liste — nommée, jamais par identifiant', () => {
  test('chaque entrée dit QUI (nommé), QUOI (libellé), À QUI (puce nommée), POURQUOI (extrait) et QUAND', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    expect(rowIds(host)).toEqual(ROWS.map((row) => row.id));
    const first = rowText(host, OBJECT_ID(1));
    for (const expected of ['Awa Diop', '@awa', 'Rôle modifié', 'Jean Martin', 'Promotion validée par le comité', '2026', 'il y a 20 minutes']) {
      expect(first).toContain(expected);
    }
    expectNoRawIdentifiers(host);
  });

  test('une lecture souveraine porte le badge « Lecture souveraine » ; un geste ordinaire non', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    expect(rowText(host, OBJECT_ID(11))).toContain('Messages d’une conversation lus');
    expect(rowText(host, OBJECT_ID(11))).toContain('Lecture souveraine');
    expect(rowText(host, OBJECT_ID(1))).not.toContain('Lecture souveraine');
  });

  test('un code que le vocabulaire ne connaît pas se dit « Action non répertoriée », sans son code brut', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    expect(rowText(host, OBJECT_ID(12))).toContain('Action non répertoriée');
    expect(host.textContent).not.toContain('SOME_FUTURE_ACTION');
    expect(host.querySelector(`[data-admin-audit-open="${OBJECT_ID(12)}"]`)?.getAttribute('data-admin-raw')).toBe('SOME_FUTURE_ACTION');
  });

  test('un administrateur absent se dit « Système ou compte supprimé » ; une cible sans nom, par son genre', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    expect(rowText(host, OBJECT_ID(12))).toContain('Système ou compte supprimé');
    expect(rowText(host, OBJECT_ID(12))).toContain('Élément');
    expect(rowText(host, OBJECT_ID(13))).toContain('Lien sans nom');
  });

  test('un lien de partage sans nom n’affiche ni son identifiant ni rien qui l’ouvre', async () => {
    const { deps } = scripted(() => page([{ ...LINK_CLOSED, identifier: 'SECRET-JOIN-KEY', linkId: 'SECRET-LINK-ID' }]));
    const host = await open(deps);

    expect(host.innerHTML).not.toContain('SECRET-JOIN-KEY');
    expect(host.innerHTML).not.toContain('SECRET-LINK-ID');
  });

  test('la personne et la cible sont des puces : chacune mène à sa fiche, dans l’espace courant', async () => {
    const { deps } = scripted(() => page([ROLE_CHANGE, MESSAGES_READ]));
    const admin = await open(deps);

    const hrefs = [...admin.querySelectorAll('[data-admin-row] td a')].map((link) => link.getAttribute('href'));
    expect(hrefs).toContain(`/admin/users/${OBJECT_ID(2)}`);
    expect(hrefs).toContain(`/admin/users/${OBJECT_ID(3)}`);
    expect(hrefs).toContain(`/admin/conversations/${OBJECT_ID(5)}`);

    mounter.unmountAll();
    const adm = await open(deps, '/adm/audit');
    const admHrefs = [...adm.querySelectorAll('[data-admin-row] td a')].map((link) => link.getAttribute('href') ?? '');
    expect(admHrefs.length).toBeGreaterThan(0);
    expect(admHrefs.every((href) => href.startsWith('/adm/'))).toBe(true);
  });

  test('aucune recherche n’est dessinée : la passerelle n’en sert pas (loi 4)', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-search]')).toBeNull();
  });
});

describe('tri, filtres et pagination — dans l’adresse, dans la liste blanche', () => {
  test('une seule colonne est triable : la date ; un clic inverse l’ordre, sous le nom `order`', async () => {
    const { deps, paths } = scripted(() => page(ROWS));
    const host = await open(deps);

    expect([...host.querySelectorAll('[data-admin-sort]')].map((header) => header.getAttribute('data-admin-sort'))).toEqual(['createdAt']);
    expect(listPaths(paths)[0]).toContain('order=desc');

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-sort="createdAt"]'));
    expect(listPaths(paths).at(-1)).toContain('order=asc');

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-sort="createdAt"]'));
    expect(listPaths(paths).at(-1)).toContain('order=desc');
  });

  test('les options des filtres sont NOMMÉES — jamais « User » ni un code d’action', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    const names = (id: string) => [...host.querySelectorAll(`[data-admin-filter="${id}"] option`)].map((entry) => entry.textContent);
    expect(names('family')).toEqual([
      'Tous',
      'Lectures souveraines',
      'Comptes',
      'Sécurité et accès',
      'Rôles',
      'Bannissements',
      'Conversations',
      'Liens',
      'Publications',
      'Diffusions',
      'Agent',
      'Signalements',
      'Communautés',
      'Réglages',
    ]);
    expect(names('entity')).toEqual([
      'Tous',
      'Compte',
      'Conversation',
      'Lien de partage',
      'Communauté',
      'Signalement',
      'Publication',
      'Diffusion',
      'Lien de suivi',
      'Demande de contact',
      'Modèle de l’agent',
      'Agent',
    ]);
    expect(names('period')).toEqual(['Toute la période', '24 heures', '7 jours', '30 jours', '90 jours']);
  });

  test('choisir une famille envoie la LISTE DE CODES de la famille et réécrit l’adresse', async () => {
    const { deps, paths } = scripted(() => page(ROWS));
    const host = await open(deps);

    typeInto(host.querySelector<HTMLSelectElement>('[data-admin-filter="family"]'), 'bans');
    await mounter.settle();

    expect(window.location.search).toBe('?family=bans');
    expect(listPaths(paths).at(-1)).toContain('action=BAN_USER,UNBAN_USER');
  });

  test('« Lectures souveraines » remonte les lectures des conversations, des liens et des membres', async () => {
    const { deps, paths } = scripted(() => page(ROWS));
    await open(deps, '/admin/audit?family=sovereign');

    const action = /action=([^&]*)/.exec(listPaths(paths)[0] ?? '')?.[1]?.split(',') ?? [];
    for (const code of ['ADMIN_CONVERSATION_MESSAGES_VIEWED', 'ADMIN_SHARE_LINK_REVEALED', 'VIEW_USER']) expect(action).toContain(code);
  });

  test('choisir un genre d’élément et une période : `entity` et `createdAfter` calculé depuis l’horloge', async () => {
    const { deps, paths } = scripted(() => page(ROWS));
    const host = await open(deps);

    typeInto(host.querySelector<HTMLSelectElement>('[data-admin-filter="entity"]'), 'ConversationShareLink');
    await mounter.settle();
    typeInto(host.querySelector<HTMLSelectElement>('[data-admin-filter="period"]'), '7d');
    await mounter.settle();

    const path = listPaths(paths).at(-1) ?? '';
    expect(path).toContain('entity=ConversationShareLink');
    expect(path).toContain('createdAfter=2026-09-23T12:00:00.000Z');
  });

  test('la famille « Sécurité et accès » DIT ce qu’elle ne remonte pas encore : les deux codes à chiffre', async () => {
    const { deps, paths } = scripted(() => page(ROWS));
    const host = await open(deps, '/admin/audit?family=security');

    const notice = host.querySelector('[data-admin-notice="info"]')?.textContent ?? '';
    expect(notice).toContain('Double authentification activée');
    expect(notice).toContain('Double authentification désactivée');
    expect(listPaths(paths)[0]).not.toContain('ENABLE_2FA');
  });

  test('une famille sans trou ne dit rien', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps, '/admin/audit?family=bans');

    expect(host.querySelector('[data-admin-notice]')).toBeNull();
  });

  test('un paramètre inconnu de l’adresse n’atteint jamais la passerelle', async () => {
    const { deps, paths } = scripted(() => page(ROWS));
    await open(deps, '/admin/audit?family=everything&entity=Nothing&period=forever&admin=../x&subject=12&sort=ipAddress&q=awa');

    const path = listPaths(paths)[0] ?? '';
    for (const leaked of ['everything', 'Nothing', 'forever', '../x', 'ipAddress', 'awa', 'adminId', 'userId']) expect(path).not.toContain(leaked);
  });

  test('« tout ce qui concerne CE membre » : le filtre part sous `userId`, nomme le membre, et se retire', async () => {
    const { deps, paths } = scripted(() => page([ROLE_CHANGE]));
    const host = await open(deps, `/admin/audit?subject=${OBJECT_ID(3)}`);

    expect(listPaths(paths)[0]).toContain(`userId=${OBJECT_ID(3)}`);
    expect(host.querySelector('[data-admin-audit-scope="subject"]')?.textContent).toContain('Actions concernant Jean Martin');

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-audit-scope] [data-admin-list-reset]'));

    expect(window.location.search).toBe('');
    expect(listPaths(paths).at(-1)).not.toContain('userId');
  });

  test('« tout ce que CET administrateur a fait » : le filtre part sous `adminId` et nomme l’administrateur', async () => {
    const { deps, paths } = scripted(() => page([ROLE_CHANGE]));
    const host = await open(deps, `/admin/audit?admin=${OBJECT_ID(2)}`);

    expect(listPaths(paths)[0]).toContain(`adminId=${OBJECT_ID(2)}`);
    expect(host.querySelector('[data-admin-audit-scope="admin"]')?.textContent).toContain('Actions de Awa Diop');
  });

  test('un filtre par identifiant dont la personne n’est pas dans la page se dit sans nom, jamais avec l’identifiant', async () => {
    const { deps } = scripted(() => page([]));
    const host = await open(deps, `/admin/audit?subject=${OBJECT_ID(3)}`);

    expect(host.querySelector('[data-admin-audit-scope="subject"]')?.textContent).toContain('Actions concernant un seul membre');
    expect(host.querySelector('[data-admin-audit-scope]')?.textContent).not.toContain(OBJECT_ID(3));
  });

  test('« Suivants » avance d’une page : la pagination V1 est lue ; le compteur dit le total servi', async () => {
    const { deps, paths } = scripted(() => page(ROWS, 75, true));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-toolbar-count]')?.textContent?.replace(/ | /g, ' ')).toBe('75 entrées');
    await mounter.click(host.querySelector<HTMLElement>('[data-admin-list-next]'));

    expect(listPaths(paths).at(-1)).toContain('offset=30');
  });
});

describe('les états dessinés', () => {
  test('vide absolu : « Aucune trace pour l’instant » et ce qui la fera arriver', async () => {
    const { deps } = scripted(() => page([]));
    const host = await open(deps);

    const empty = host.querySelector('[data-admin-list] [data-admin-empty]')?.textContent ?? '';
    expect(empty).toContain('Aucune trace pour l’instant');
    expect(empty).toContain('apparaîtront ici');
  });

  test('vide filtré : le dit, et « Réinitialiser » retire les filtres', async () => {
    const { deps } = scripted((path) => (path.includes('entity=Post') ? page([]) : page(ROWS)));
    const host = await open(deps, '/admin/audit?entity=Post');

    expect(host.querySelector('[data-admin-list] [data-admin-empty]')?.textContent).toContain('Aucune trace ne correspond à ces filtres');

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-list] [data-admin-empty] [data-admin-list-reset]'));

    expect(window.location.search).toBe('');
    expect(rowIds(host)).toHaveLength(ROWS.length);
  });

  test('squelette tant que la liste est en vol', async () => {
    const { deps } = scripted(() => new Promise<never>(() => undefined));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-list-skeleton]')).not.toBeNull();
  });

  test('erreur sans données : « Réessayer » relit la passerelle', async () => {
    let calls = 0;
    const { deps } = scripted(() => (++calls === 1 ? { ok: false, status: 500, error: 'boom' } : page(ROWS)));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-list] [data-admin-error]')).not.toBeNull();

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-list] [data-admin-error] [data-admin-retry]'));

    expect(rowIds(host)).toHaveLength(ROWS.length);
  });

  test('refus (403) : un bloc refusé, pas une panne', async () => {
    const { deps } = scripted(() => ({ ok: false, status: 403, error: 'Forbidden' }));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-list] [data-admin-denied-inline]')).not.toBeNull();
    expect(host.querySelector('[data-admin-list] [data-admin-error]')).toBeNull();
  });
});

describe('la feuille de détail — tout ce qu’il faut pour comprendre un geste', () => {
  test('une rangée ouvre une feuille : l’action expliquée, le motif en entier, qui, à qui', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);
    const sheet = await openDetail(host, OBJECT_ID(1));

    expect(sheet.querySelector('[data-admin-audit-explain]')?.textContent).toBe('Le rôle d’un membre, donc ses droits d’administration, a changé.');
    expect(sheet.querySelector('[data-admin-meta="reason"]')?.textContent).toContain('Promotion validée par le comité');
    expect(sheet.querySelector('[data-admin-meta="admin"]')?.textContent).toContain('Awa Diop');
    expect(sheet.querySelector('[data-admin-meta="when"]')?.textContent).toContain('il y a 20 minutes');
    expect(host.querySelector('dialog h2')?.textContent).toBe('Rôle modifié');
    expectNoRawIdentifiers(host);
  });

  test('le motif long se lit en entier dans la feuille, alors que la liste n’en montre qu’un extrait', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    expect(rowText(host, OBJECT_ID(11))).toContain('…');
    const sheet = await openDetail(host, OBJECT_ID(11));

    expect(sheet.querySelector('[data-admin-audit-reason]')?.textContent).toBe(
      'Plainte pour harcèlement : lecture de la conversation sur demande de la modération',
    );
  });

  test('le membre concerné et l’élément visé ne font qu’UNE ligne quand l’élément EST ce membre', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);
    const sheet = await openDetail(host, OBJECT_ID(1));

    expect(sheet.querySelector('[data-admin-meta="subject"]')).toBeNull();
    expect(sheet.querySelector('[data-admin-meta="target"]')?.textContent).toContain('Jean Martin');
  });

  test('un sujet distinct de la cible a sa ligne', async () => {
    const { deps } = scripted(() => page([servedAuditEntry({ action: 'ADMIN_CONVERSATION_MEMBER_REMOVED', target: { type: 'Conversation', id: OBJECT_ID(5), label: 'Les voisins', secondary: 'group' } })]));
    const host = await open(deps);
    const sheet = await openDetail(host, OBJECT_ID(1));

    expect(sheet.querySelector('[data-admin-meta="subject"]')?.textContent).toContain('Jean Martin');
    expect(sheet.querySelector('[data-admin-meta="target"]')?.textContent).toContain('Les voisins');
  });

  test('une lecture souveraine porte son badge dans la feuille', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);
    const sheet = await openDetail(host, OBJECT_ID(11));

    expect(sheet.textContent).toContain('Lecture souveraine');
  });

  test('les changements sont un tableau : champ traduit, avant → après, valeurs en mots', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);
    const sheet = await openDetail(host, OBJECT_ID(1));

    const row = sheet.querySelector('[data-admin-audit-change="role"]');
    expect([...(row?.children ?? [])].map((cell) => cell.textContent)).toEqual(['Rôle', 'Membre', 'Modérateur']);
    expect(sheet.querySelector('caption')?.textContent).toBe('Changements consignés pour cette entrée');
    expect([...sheet.querySelectorAll('thead th')].map((cell) => cell.textContent)).toEqual(['Champ', 'Avant', 'Après']);
  });

  test('un booléen se dit en mots, un champ inconnu est humanisé, une valeur absente se dit', async () => {
    const { deps } = scripted(() =>
      page([servedAuditEntry({ changes: [{ field: 'isActive', before: 'true', after: 'false' }, { field: 'slowModeSeconds', before: null, after: '30' }] })]),
    );
    const host = await open(deps);
    const sheet = await openDetail(host, OBJECT_ID(1));

    expect([...(sheet.querySelector('[data-admin-audit-change="isActive"]')?.children ?? [])].map((cell) => cell.textContent)).toEqual(['Actif', 'Oui', 'Non']);
    expect([...(sheet.querySelector('[data-admin-audit-change="slowModeSeconds"]')?.children ?? [])].map((cell) => cell.textContent)).toEqual([
      'Slow mode seconds',
      'Aucune valeur',
      '30',
    ]);
  });

  test('une valeur masquée par la passerelle reste masquée, et le dit à l’accessibilité', async () => {
    const { deps } = scripted(() => page([servedAuditEntry({ changes: [{ field: 'email', before: '•••', after: '•••' }] })]));
    const host = await open(deps);
    const sheet = await openDetail(host, OBJECT_ID(1));

    const masked = [...sheet.querySelectorAll('[data-admin-audit-value="masked"]')];
    expect(masked).toHaveLength(2);
    expect(masked.every((cell) => cell.textContent === '•••' && cell.getAttribute('aria-label') === 'Valeur masquée')).toBe(true);
  });

  test('sans changement, la feuille le dit ; sans motif, aussi', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);
    const sheet = await openDetail(host, OBJECT_ID(12));

    expect(sheet.querySelector('[data-admin-audit-changes="none"]')?.textContent).toBe('Ce geste n’a consigné aucun changement.');
    expect(sheet.querySelector('[data-admin-meta="reason"]')?.textContent).toContain('Aucun motif consigné pour ce geste.');
  });

  test('l’adresse IP et le navigateur n’apparaissent PAS quand la passerelle ne les sert pas', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);
    const sheet = await openDetail(host, OBJECT_ID(1));

    expect(sheet.querySelector('[data-admin-meta="ip"]')).toBeNull();
    expect(sheet.querySelector('[data-admin-meta="agent"]')).toBeNull();
    expect(sheet.textContent).not.toContain('Adresse IP');
  });

  test('servis, l’adresse IP et le navigateur (résumé, agent brut dessous) apparaissent', async () => {
    const agent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
    const { deps } = scripted(() => page([servedAuditEntry({ ipAddress: '203.0.113.7', userAgent: agent })]));
    const host = await open(deps);
    const sheet = await openDetail(host, OBJECT_ID(1));

    expect(sheet.querySelector('[data-admin-meta="ip"]')?.textContent).toContain('203.0.113.7');
    const shown = sheet.querySelector('[data-admin-meta="agent"]')?.textContent ?? '';
    expect(shown).toContain('Safari sur iPhone');
    expect(shown).toContain(agent);
  });

  test('les identifiants techniques — de l’entrée et de l’élément — sont en bas, copiables, et seuls à porter un identifiant', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);
    const sheet = await openDetail(host, OBJECT_ID(1));

    expect([...sheet.querySelectorAll('[data-admin-technical-id]')].map((node) => node.textContent)).toEqual([OBJECT_ID(1), OBJECT_ID(3)]);
    expect(sheet.querySelectorAll('[data-admin-action="copy-technical-id"]')).toHaveLength(2);
  });

  test('fermer la feuille la retire ; la liste reste', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);
    await openDetail(host, OBJECT_ID(1));

    await mounter.click(host.querySelector<HTMLElement>('dialog button[aria-label="Fermer"]'));

    expect(host.querySelector('[data-admin-audit-detail]')).toBeNull();
    expect(rowIds(host)).toHaveLength(ROWS.length);
  });

  test('« Toutes ses actions » filtre le journal sur cet administrateur et ferme la feuille', async () => {
    const { deps, paths } = scripted(() => page(ROWS));
    const host = await open(deps);
    const sheet = await openDetail(host, OBJECT_ID(1));

    const link = sheet.querySelector<HTMLAnchorElement>('[data-admin-link="audit-filter-link"]');
    expect(link?.getAttribute('href')).toBe(`/admin/audit?admin=${OBJECT_ID(2)}`);
    await mounter.click(link);

    expect(host.querySelector('[data-admin-audit-detail]')).toBeNull();
    expect(window.location.search).toBe(`?admin=${OBJECT_ID(2)}`);
    expect(listPaths(paths).at(-1)).toContain(`adminId=${OBJECT_ID(2)}`);
  });

  test('un administrateur absent n’offre pas de « Toutes ses actions »', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);
    const sheet = await openDetail(host, OBJECT_ID(12));

    expect(sheet.querySelector('[data-admin-link="audit-filter-link"]')).toBeNull();
  });

  test('un lien de partage sans nom dans la feuille : « Lien sans nom », la clé d’entrée jamais lue', async () => {
    const { deps } = scripted(() => page([{ ...LINK_CLOSED, identifier: 'SECRET-JOIN-KEY' }]));
    const host = await open(deps);
    const sheet = await openDetail(host, OBJECT_ID(13));

    expect(sheet.querySelector('[data-admin-meta="target"]')?.textContent).toContain('Lien sans nom');
    expect(host.innerHTML).not.toContain('SECRET-JOIN-KEY');
  });
});

describe('le journal ne se garde nulle part', () => {
  test('monté, ses requêtes portent la clé souveraine : aucune n’est persistable', async () => {
    const { deps } = scripted(() => page(ROWS));
    await open(deps);

    const queries = appQueryClient.getQueryCache().findAll({ queryKey: [...ADMIN_AUDIT_KEY] });
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every((query) => !persistableQuery(query))).toBe(true);
  });

  test('l’écran quitté, plus aucune donnée du journal en mémoire (gcTime 0)', async () => {
    const { deps } = scripted(() => page(ROWS));
    await open(deps);
    mounter.unmountAll();
    await wait(20);

    expect(appQueryClient.getQueryCache().findAll({ queryKey: [...ADMIN_AUDIT_KEY] })).toHaveLength(0);
  });
});

describe('qui voit le journal — canViewAuditLogs, et rien d’autre', () => {
  test('ADMIN (canViewAuditLogs faux) ne voit ni la tuile ni l’écran : le refus unique, aucune requête', async () => {
    const admin = adminIdentityFixture({ role: 'ADMIN' });
    expect(visibleAdminSections(admin.permissions, admin.role).map((section) => section.id)).not.toContain('audit');

    const { deps, paths } = scripted(() => page(ROWS));
    const host = await open(deps, '/admin/audit', admin);

    expect(host.querySelector('[data-admin-audit]')).toBeNull();
    expect(host.textContent).toContain('Espace réservé');
    expect(paths).toEqual([]);
  });

  test('MODERATOR non plus', async () => {
    const moderator = adminIdentityFixture({ role: 'MODERATOR' });
    expect(visibleAdminSections(moderator.permissions, moderator.role).map((section) => section.id)).not.toContain('audit');
  });

  test('AUDIT et BIGBOSS voient la tuile et l’écran', async () => {
    for (const identity of [AUDIT, BIGBOSS]) {
      expect(visibleAdminSections(identity.permissions, identity.role).map((section) => section.id)).toContain('audit');
    }
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps, '/admin/audit', AUDIT);

    expect(rowIds(host)).toHaveLength(ROWS.length);
  });
});

describe('l’en-tête', () => {
  test('le titre est « Journal d’audit », la phrase dit ce qu’on y lit, le fil d’Ariane situe la section', async () => {
    const { deps } = scripted(() => page(ROWS));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-page-title]')?.textContent).toBe('Journal d’audit');
    expect(host.querySelector('[data-admin-page-header] p')?.textContent).toContain('Qui a fait quoi, à qui et pourquoi');
    expect(host.querySelector('[data-admin-page-header] nav')?.textContent).toContain('Modération');
  });
});

describe('cohérence des personnes servies', () => {
  test('un administrateur sans nom affiché se lit par son @username', async () => {
    const { deps } = scripted(() => page([servedAuditEntry({ admin: servedAuditPerson(2, { displayName: null, username: 'awa' }) })]));
    const host = await open(deps);

    expect(rowText(host, OBJECT_ID(1))).toContain('@awa');
  });
});
