import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { describe, expect, test } from 'bun:test';

import { AdminSectionScreen } from '@/components/admin/section-screen';
import {
  OBJECT_ID,
  servedConversationRank,
  servedMessageRank,
  servedRanking,
  servedShareRank,
  servedTrackingRank,
  servedUserRank,
} from '@/lib/admin/ranking-fixtures';
import { visibleAdminSections } from '@/lib/admin/sections';
import { DEFAULT_RANKING_STATE } from '@/lib/admin/ranking-state';
import type { AdminDeps } from '@/lib/api/admin';
import { adminRankingQueryKey, decodeAdminRanking } from '@/lib/api/admin-ranking';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { createRouter, navigate } from '@/lib/router';
import { typeInto } from '@/test-support/act-mount';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminRankingPanel } from './admin-ranking';

/**
 * **LE CLASSEMENT** (#8876, #6730) — podium et tableau NOMMÉS, filtres dans l'adresse
 * (liste blanche), un état dessiné pour chaque cas, et jamais un texte de message.
 */

const { mount, mounter } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const NOW = new Date('2026-09-30T12:00:00.000Z');

type Reply = ApiResult<unknown> | Promise<ApiResult<unknown>>;

function scripted(reply: (path: string) => Reply): { readonly deps: AdminDeps; readonly paths: string[] } {
  const paths: string[] = [];
  const transport = {
    request: async (request: HttpRequest) => {
      paths.push(request.path);
      return reply(request.path);
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway', transport }, paths };
}

const served = (rankings: readonly unknown[]): ApiResult<unknown> => ({ ok: true, status: 200, data: servedRanking(rankings) });

const USERS = [
  servedUserRank(1),
  servedUserRank(2),
  servedUserRank(3, { displayName: null }),
  servedUserRank(4, { username: 'Unknown', displayName: undefined, lastActivity: undefined }),
  servedUserRank(5),
];

function Screen({ deps }: { readonly deps: AdminDeps }) {
  return (
    <AdminSectionScreen section="ranking" language="fr" title="Classement">
      {() => <AdminRankingPanel language="fr" deps={deps} now={() => NOW} />}
    </AdminSectionScreen>
  );
}

async function open(deps: AdminDeps, url = '/admin/ranking', identity = BIGBOSS) {
  const { Router } = createRouter(
    {
      adminRanking: { pattern: '/admin/ranking', screen: async () => ({ default: () => <Screen deps={deps} /> }) },
      admRanking: { pattern: '/adm/ranking', screen: async () => ({ default: () => <Screen deps={deps} /> }) },
    },
    () => <p>absent</p>,
  );
  navigate(url, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, identity);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-ranking]') === null && host.textContent?.includes('Espace réservé') !== true; attempt += 1) {
    await mounter.settle();
  }
  await mounter.settle();
  await mounter.settle();
  return host;
}

const rankingPaths = (paths: readonly string[]) => paths.filter((path) => path.startsWith(`${adminEndpoints.ranking}?`));
const podium = (host: ParentNode) => [...host.querySelectorAll('[data-admin-podium]')].map((item) => item.getAttribute('data-admin-podium'));
const rows = (host: ParentNode) => [...host.querySelectorAll('[data-admin-row]')].map((row) => row.getAttribute('data-admin-row'));
const podiumText = (host: ParentNode, rank: number) => host.querySelector(`[data-admin-podium="${rank}"]`)?.textContent ?? '';
const rowText = (host: ParentNode, id: string) => host.querySelector(`[data-admin-row="${id}"]`)?.textContent ?? '';
const select = (host: ParentNode, id: string) => host.querySelector<HTMLSelectElement>(`[data-admin-filter="${id}"]`);
const optionValues = (host: ParentNode, id: string) => [...(select(host, id)?.options ?? [])].map((choice) => choice.value);
const normalized = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');

describe('le podium et le tableau — des noms, jamais des identifiants', () => {
  test('le titre, le sous-titre, le podium des trois premiers et le tableau des suivants', async () => {
    const { deps, paths } = scripted(() => served(USERS));
    const host = await open(deps);

    expect(host.querySelector('h1')?.textContent).toBe('Classement');
    expect(rankingPaths(paths)).toEqual([`${adminEndpoints.ranking}?entityType=users&criterion=messages_sent&period=30d&limit=25`]);
    expect(podium(host)).toEqual(['1', '2', '3']);
    expect(rows(host)).toEqual([OBJECT_ID(4), OBJECT_ID(5)]);
    expect(host.textContent).toContain('Du 4e rang au dernier');
  });

  test('chaque marche du podium dit le rang, le nom, le @username, le total et ce que le total compte', async () => {
    const { deps } = scripted(() => served(USERS));
    const host = await open(deps);

    const first = normalized(podiumText(host, 1));
    for (const expected of ['Membre 1', '@membre1', '99', 'Messages envoyés', 'il y a 2 heures']) expect(first).toContain(expected);
    expect(host.querySelector('[data-admin-podium="1"] [data-admin-rank]')?.getAttribute('aria-label')).toBe('Rang 1');
    expect(podiumText(host, 3)).toContain('@membre3');
  });

  test('un compte disparu est « Personne inconnue », jamais « Unknown », et sa ligne ne mène à aucune fiche', async () => {
    const { deps } = scripted(() => served(USERS));
    const host = await open(deps);

    expect(rowText(host, OBJECT_ID(4))).toContain('Personne inconnue');
    expect(host.querySelector(`[data-admin-row="${OBJECT_ID(4)}"] a`)).toBeNull();
    expect(host.textContent).not.toContain('Unknown');
    expectNoRawIdentifiers(host);
  });

  test('chaque ligne et chaque marche OUVRENT la fiche du membre, dans l’espace courant', async () => {
    const { deps } = scripted(() => served(USERS));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-podium="1"] a')?.getAttribute('href')).toBe(`/admin/users/${OBJECT_ID(1)}`);
    expect(host.querySelector(`[data-admin-row="${OBJECT_ID(5)}"] a`)?.getAttribute('href')).toBe(`/admin/users/${OBJECT_ID(5)}`);
  });

  test('dans l’espace /adm, les liens restent dans /adm', async () => {
    const { deps } = scripted(() => served(USERS));
    const host = await open(deps, '/adm/ranking');

    expect(host.querySelector('[data-admin-podium="2"] a')?.getAttribute('href')).toBe(`/adm/users/${OBJECT_ID(2)}`);
  });

  test('sous trois lignes, pas de podium : le tableau porte tout, à partir du rang un', async () => {
    const { deps } = scripted(() => served([servedUserRank(1), servedUserRank(2)]));
    const host = await open(deps);

    expect(podium(host)).toEqual([]);
    expect(rows(host)).toEqual([OBJECT_ID(1), OBJECT_ID(2)]);
    expect(host.textContent).toContain('Classement');
    expect(host.textContent).not.toContain('Du 4e rang au dernier');
  });

  test('sans présence servie (rôle sans droit), aucune colonne « Dernière activité » n’est dessinée', async () => {
    const { deps } = scripted(() => served(USERS.map((row, index) => ({ ...row, lastActivity: undefined, id: OBJECT_ID(index + 1) }))));
    const host = await open(deps);

    expect(host.querySelector('table')?.textContent).not.toContain('Dernière activité');
    expect(podiumText(host, 1)).not.toContain('Dernière activité');
  });

  test('le compteur dit la taille du classement', async () => {
    const { deps } = scripted(() => served(USERS));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-toolbar-count]')?.textContent).toBe('5 dans ce classement');
  });
});

describe('les genres d’entité — chacun nomme les siens', () => {
  test('les conversations : leur titre et leur type ; sans titre, « Conversation sans titre »', async () => {
    const { deps } = scripted(() =>
      served([servedConversationRank(1), servedConversationRank(2), servedConversationRank(3, { title: 'Sans titre', type: 'direct' }), servedConversationRank(4)]),
    );
    const host = await open(deps, '/admin/ranking?entity=conversations');

    expect(normalized(podiumText(host, 1))).toContain('Conversation 1');
    expect(podiumText(host, 1)).toContain('Groupe');
    expect(podiumText(host, 3)).toContain('Conversation sans titre');
    expect(podiumText(host, 3)).toContain('Conversation privée');
    expect(host.textContent).not.toContain('mshy_conv');
    expect(host.querySelector('[data-admin-podium="1"] a')?.getAttribute('href')).toBe(`/admin/conversations/${OBJECT_ID(1)}`);
  });

  test('un lecteur sans le RANG d’administration lit le nom de la conversation, sans lien vers sa fiche', async () => {
    const audit = adminIdentityFixture({ role: 'AUDIT' });
    const { deps } = scripted(() => served([servedConversationRank(1), servedConversationRank(2), servedConversationRank(3)]));
    const host = await open(deps, '/admin/ranking?entity=conversations', audit);

    expect(podiumText(host, 1)).toContain('Conversation 1');
    expect(host.querySelector('[data-admin-podium="1"] a')).toBeNull();
  });

  test('les messages : auteur, conversation, date, type — JAMAIS le texte ; la puce mène à la conversation', async () => {
    const { deps } = scripted(() =>
      served([servedMessageRank(1, { content: 'Mon mot de passe est hunter2', contentPreview: 'Mon mot de passe est hunt…' }), servedMessageRank(2), servedMessageRank(3)]),
    );
    const host = await open(deps, '/admin/ranking?entity=messages');

    expect(normalized(podiumText(host, 1))).toContain('Message de Auteur 1 dans Discussion 1');
    expect(normalized(podiumText(host, 1))).toContain('28 sept. 2026 · Texte');
    expect(host.textContent).not.toContain('hunter2');
    expect(host.querySelector('[data-admin-podium="1"] a')?.getAttribute('href')).toBe(`/admin/conversations/${OBJECT_ID(201)}`);
    expectNoRawIdentifiers(host);
  });

  test('les liens de suivi : destination nommée et créateur nommé, sans jeton ni adresse complète', async () => {
    const { deps } = scripted(() => served([servedTrackingRank(1), servedTrackingRank(2), servedTrackingRank(3), servedTrackingRank(4)]));
    const host = await open(deps, '/admin/ranking?entity=links');

    const first = normalized(podiumText(host, 1));
    for (const expected of ['Lien vers exemple1.org', 'Créé par', 'Créateur 1', '899', 'Liens de suivi les plus cliqués']) expect(first).toContain(expected);
    expect(host.textContent).not.toContain('Ab3xYz');
    expect(host.textContent).not.toContain('secret=abc123');
    expect(rowText(host, OBJECT_ID(4))).toContain('Créateur 4');
  });

  test('les liens de partage : leur nom, ou « Lien sans nom » — jamais leur identifiant', async () => {
    const { deps } = scripted(() =>
      served([servedShareRank(1, { identifier: 'mshy_secret_join', linkId: 'SECRET-LINK-ID' }), servedShareRank(2, { name: null }), servedShareRank(3)]),
    );
    const host = await open(deps, '/admin/ranking?entity=links&criterion=share_links_most_used');

    expect(podiumText(host, 1)).toContain('Lien 1');
    expect(podiumText(host, 1)).toContain('Salon 1');
    expect(podiumText(host, 2)).toContain('Lien sans nom');
    expect(host.textContent).not.toContain('mshy_secret_join');
    expect(host.textContent).not.toContain('SECRET-LINK-ID');
    expectNoRawIdentifiers(host);
  });

  test('l’activité la plus récente ne montre aucun total (la passerelle sert zéro) : elle montre le dernier instant', async () => {
    const { deps } = scripted(() =>
      served([
        servedConversationRank(1, { count: 0, lastActivity: '2026-09-30T11:45:00.000Z' }),
        servedConversationRank(2, { count: 0, lastActivity: '2026-09-30T11:00:00.000Z' }),
        servedConversationRank(3, { count: 0, lastActivity: '2026-09-30T09:00:00.000Z' }),
        servedConversationRank(4, { count: 0, lastActivity: '2026-09-29T09:00:00.000Z' }),
      ]),
    );
    const host = await open(deps, '/admin/ranking?entity=conversations&criterion=recent_activity&period=7d');

    expect(podiumText(host, 1)).toContain('il y a 15 minutes');
    expect(podiumText(host, 1)).not.toContain('Activité la plus récente');
    expect(host.querySelector('thead')?.textContent).toBe('RangConversationDernière activité');
    expect(rowText(host, OBJECT_ID(4))).toContain('hier');
  });
});

describe('l’état vit dans l’adresse — liste blanche', () => {
  test('une adresse complète pose les quatre choix, dans les sélecteurs et dans la requête', async () => {
    const { deps, paths } = scripted(() => served([servedMessageRank(1), servedMessageRank(2), servedMessageRank(3)]));
    const host = await open(deps, '/admin/ranking?entity=messages&criterion=most_replies&period=7d&limit=50');

    expect(rankingPaths(paths)).toEqual([`${adminEndpoints.ranking}?entityType=messages&criterion=most_replies&period=7d&limit=50`]);
    expect(select(host, 'criterion')?.value).toBe('most_replies');
    expect(select(host, 'period')?.value).toBe('7d');
    expect(select(host, 'limit')?.value).toBe('50');
    expect(host.querySelector('[data-admin-chip="messages"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  test('une valeur inconnue retombe sur le défaut : la passerelle ne reçoit rien d’inventé', async () => {
    const { deps, paths } = scripted(() => served(USERS));
    await open(deps, '/admin/ranking?entity=robots&criterion=cuisine&period=3d&limit=7');

    expect(rankingPaths(paths)).toEqual([`${adminEndpoints.ranking}?entityType=users&criterion=messages_sent&period=30d&limit=25`]);
  });

  test('changer de genre remet le critère au défaut du nouveau genre et ne propose que SES critères canoniques', async () => {
    const { deps, paths } = scripted(() => served(USERS));
    const host = await open(deps);

    expect(optionValues(host, 'criterion')).toHaveLength(21);
    await mounter.click(host.querySelector('[data-admin-chip="conversations"]'));
    await mounter.settle();

    expect(rankingPaths(paths).at(-1)).toBe(`${adminEndpoints.ranking}?entityType=conversations&criterion=message_count&period=30d&limit=25`);
    expect(window.location.search).toBe('?entity=conversations');
    expect(optionValues(host, 'criterion')).toEqual(['message_count', 'member_count', 'reaction_count', 'files_shared', 'call_count', 'recent_activity']);
  });

  test('choisir un critère, une période, une taille : chaque geste écrit l’adresse et relit la passerelle', async () => {
    const { deps, paths } = scripted(() => served(USERS));
    const host = await open(deps);

    typeInto(select(host, 'criterion'), 'reactions_given');
    await mounter.settle();
    typeInto(select(host, 'period'), '90d');
    await mounter.settle();
    typeInto(select(host, 'limit'), '100');
    await mounter.settle();

    expect(window.location.search).toBe('?criterion=reactions_given&period=90d&limit=100');
    expect(rankingPaths(paths).at(-1)).toBe(`${adminEndpoints.ranking}?entityType=users&criterion=reactions_given&period=90d&limit=100`);
  });

  test('« Conversations de groupe créées » : le libellé dit ce que la passerelle compte, pas « communautés »', async () => {
    const { deps } = scripted(() => served(USERS));
    const host = await open(deps, '/admin/ranking?criterion=communities_created');

    const labels = [...(select(host, 'criterion')?.options ?? [])].map((choice) => choice.textContent);
    expect(labels).toContain('Conversations de groupe créées');
    expect(labels.join(' ').toLowerCase()).not.toContain('communaut');
  });

  test('« Réinitialiser » n’existe que si quelque chose s’écarte du défaut, et rend le classement d’origine — depuis le cache', async () => {
    const { deps, paths } = scripted(() => served(USERS));
    const host = await open(deps);
    expect(host.querySelector('[data-admin-list-reset]')).toBeNull();

    typeInto(select(host, 'period'), '7d');
    await mounter.settle();
    expect(host.querySelector('[data-admin-list-reset]')).not.toBeNull();
    expect(rankingPaths(paths)).toHaveLength(2);

    await mounter.click(host.querySelector('[data-admin-list-reset]'));
    await mounter.settle();

    expect(window.location.search).toBe('');
    expect(select(host, 'period')?.value).toBe('30d');
    expect(podium(host)).toEqual(['1', '2', '3']);
    expect(rankingPaths(paths)).toHaveLength(2);
    expect(host.querySelector('[data-admin-list-reset]')).toBeNull();
  });
});

describe('la période — un contrôle qui a un effet, ou pas de contrôle', () => {
  test('un critère qui porte sur tout l’historique ne dessine PAS le sélecteur de période, et le dit', async () => {
    const { deps } = scripted(() => served(USERS));
    const host = await open(deps, '/admin/ranking?criterion=most_contacts');

    expect(select(host, 'period')).toBeNull();
    expect(host.textContent).toContain('la période ne s’applique pas');
  });

  test('pour les liens de suivi, la période retient les liens CRÉÉS : le classement le dit', async () => {
    const { deps } = scripted(() => served(USERS));
    const host = await open(deps, '/admin/ranking?entity=links');

    expect(select(host, 'period')).not.toBeNull();
    expect(host.textContent).toContain('retient les liens créés pendant cette durée');
  });

  test('pour un critère d’activité, le sélecteur porte les huit périodes et aucun avis', async () => {
    const { deps } = scripted(() => served(USERS));
    const host = await open(deps);

    expect(optionValues(host, 'period')).toEqual(['1d', '7d', '30d', '60d', '90d', '180d', '365d', 'all']);
    expect(host.querySelector('[data-admin-notice]')).toBeNull();
  });
});

describe('les états dessinés', () => {
  test('en vol et sans cache : un squelette — jamais un classement plat', async () => {
    const { deps } = scripted(() => new Promise<ApiResult<unknown>>(() => undefined));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-ranking-skeleton]')).not.toBeNull();
    expect(host.querySelector('[data-admin-podium]')).toBeNull();
    expect(host.querySelector('[data-admin-toolbar]')).not.toBeNull();
  });

  test('un classement vide se dit, et propose d’élargir la période — un geste qui relit tout l’historique', async () => {
    const { deps, paths } = scripted(() => served([]));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Aucun résultat pour ce classement');
    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Aucune activité n’a été comptée sur cette période.');

    await mounter.click(host.querySelector('[data-admin-action="widen-period"]'));
    await mounter.settle();

    expect(rankingPaths(paths).at(-1)).toBe(`${adminEndpoints.ranking}?entityType=users&criterion=messages_sent&period=all&limit=25`);
    expect(host.querySelector('[data-admin-action="widen-period"]')).toBeNull();
    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Rien n’a encore été compté pour ce critère.');
  });

  test('vide sur un critère sans période : rien à élargir, donc pas de bouton', async () => {
    const { deps } = scripted(() => served([]));
    const host = await open(deps, '/admin/ranking?criterion=most_contacts');

    expect(host.querySelector('[data-admin-empty]')).not.toBeNull();
    expect(host.querySelector('[data-admin-action="widen-period"]')).toBeNull();
  });

  test('une erreur se dit et se RÉESSAIE : la relecture rend le classement', async () => {
    let failing = true;
    const { deps, paths } = scripted(() => (failing ? { ok: false, status: 500, error: 'panne' } : served(USERS)));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-error]')).not.toBeNull();
    failing = false;
    await mounter.click(host.querySelector('[data-admin-error] [data-admin-retry]'));
    await mounter.settle();

    expect(rankingPaths(paths)).toHaveLength(2);
    expect(host.querySelector('[data-admin-error]')).toBeNull();
    expect(podium(host)).toEqual(['1', '2', '3']);
  });

  test('un refus (403) du bloc se dit comme un refus, pas comme une panne', async () => {
    const { deps } = scripted(() => ({ ok: false, status: 403, error: 'interdit' }));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-denied-inline]')).not.toBeNull();
    expect(host.querySelector('[data-admin-error]')).toBeNull();
  });

  test('changer de filtre garde le classement précédent à l’écran, atténué, le temps que le suivant arrive', async () => {
    let release: (result: ApiResult<unknown>) => void = () => undefined;
    let calls = 0;
    const { deps } = scripted(() => {
      calls += 1;
      return calls === 1 ? served(USERS) : new Promise<ApiResult<unknown>>((resolve) => (release = resolve));
    });
    const host = await open(deps);

    typeInto(select(host, 'period'), '7d');
    await mounter.settle();

    expect(podium(host)).toEqual(['1', '2', '3']);
    expect(host.querySelector('[data-admin-ranking-skeleton]')).toBeNull();
    expect(host.querySelector('tbody')?.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('[data-admin-ranking-podium]')?.getAttribute('aria-busy')).toBe('true');

    release(served([servedUserRank(9)]));
    await mounter.settle();
    await mounter.settle();
    expect(rows(host)).toEqual([OBJECT_ID(9)]);
  });

  test('cache d’abord : un classement déjà reçu s’affiche à l’instant, sans squelette, pendant qu’il se revalide', async () => {
    appQueryClient.setQueryData(adminRankingQueryKey(DEFAULT_RANKING_STATE), decodeAdminRanking(servedRanking(USERS), DEFAULT_RANKING_STATE), {
      updatedAt: Date.now() - 120_000,
    });
    const { deps, paths } = scripted(() => new Promise<ApiResult<unknown>>(() => undefined));
    const host = await open(deps);

    expect(rankingPaths(paths)).toHaveLength(1);
    expect(host.querySelector('[data-admin-ranking-skeleton]')).toBeNull();
    expect(podium(host)).toEqual(['1', '2', '3']);
  });

  test('une revalidation qui échoue garde les données reçues et le dit, avec « Réessayer »', async () => {
    appQueryClient.setQueryData(adminRankingQueryKey(DEFAULT_RANKING_STATE), decodeAdminRanking(servedRanking(USERS), DEFAULT_RANKING_STATE), {
      updatedAt: Date.now() - 120_000,
    });
    const { deps } = scripted(() => ({ ok: false, status: 500, error: 'panne' }));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-notice="warning"]')?.textContent).toContain('La mise à jour a échoué');
    expect(host.querySelector('[data-admin-notice="warning"] [data-admin-retry]')).not.toBeNull();
    expect(podium(host)).toEqual(['1', '2', '3']);
    expect(host.querySelector('[data-admin-error]')).toBeNull();
  });

  test('changer de filtre vers une requête qui échoue ne garde PAS le classement d’un autre critère : l’erreur se dit', async () => {
    let failing = false;
    const { deps } = scripted(() => (failing ? { ok: false, status: 500, error: 'panne' } : served(USERS)));
    const host = await open(deps);

    failing = true;
    typeInto(select(host, 'period'), '7d');
    await mounter.settle();
    await mounter.settle();

    expect(host.querySelector('[data-admin-error]')).not.toBeNull();
    expect(host.querySelector('[data-admin-podium]')).toBeNull();
  });
});

describe('la porte — fail-closed, par la permission servie', () => {
  test('un MODERATOR ne porte pas `canViewAnalytics` : le refus unique, aucune requête', async () => {
    const { deps, paths } = scripted(() => served(USERS));
    const host = await open(deps, '/admin/ranking', adminIdentityFixture({ role: 'MODERATOR' }));

    expect(host.textContent).toContain('Espace réservé');
    expect(host.querySelector('[data-admin-ranking]')).toBeNull();
    expect(rankingPaths(paths)).toEqual([]);
    expect(visibleAdminSections(adminIdentityFixture({ role: 'MODERATOR' }).permissions, 'MODERATOR').map((section) => section.id)).not.toContain('ranking');
  });

  test('un AUDIT (analytics, sans rang) ouvre le classement', async () => {
    const { deps } = scripted(() => served(USERS));
    const host = await open(deps, '/admin/ranking', adminIdentityFixture({ role: 'AUDIT' }));

    expect(host.querySelector('[data-admin-ranking]')).not.toBeNull();
  });
});
