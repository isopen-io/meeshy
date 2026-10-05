import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { describe, expect, test } from 'bun:test';

import { AdminSectionScreen } from '@/components/admin/section-screen';
import { OBJECT_ID, servedMessageEntity, servedPerson, servedReport } from '@/lib/admin/report-fixtures';
import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { createRouter, navigate } from '@/lib/router';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { resultatServi } from '@/test-support/served-pagination';

import { AdminReportPanel } from './admin-report';

/**
 * **LA FICHE D'UN SIGNALEMENT** (#8876, #6726) — nommée, interprétée, sans
 * identifiant hors de la ligne « Identifiant technique » ; le contenu protégé se
 * dit protégé ; la chronologie n'invente aucune date ; les liens qui agissent ne
 * sont offerts qu'à qui peut les ouvrir ; les états (squelette, introuvable,
 * refus, erreur) sont dessinés.
 */

const { mount, mounter } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const NOW = new Date('2026-09-30T12:00:00.000Z');
const REPORT_ID = OBJECT_ID(1);

type Script = (request: HttpRequest) => ApiResult<unknown> | Promise<ApiResult<unknown>>;

const siblingPage = (reports: readonly unknown[], total = reports.length) =>
  resultatServi({ data: reports, pagination: { total, offset: 0, limit: 6, hasMore: total > reports.length } });

function scripted(report: ApiResult<unknown>, siblings?: Script): { readonly deps: AdminDeps; readonly calls: HttpRequest[] } {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async (request: HttpRequest) => {
      calls.push(request);
      if (request.path.startsWith(`${adminEndpoints.reports}/entity/`)) return (siblings ?? (() => siblingPage([servedReport()])))(request);
      return report;
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway', transport }, calls };
}

const served = (overrides: Readonly<Record<string, unknown>> = {}): ApiResult<unknown> => resultatServi(servedReport(overrides));

function Screen({ deps }: { readonly deps: AdminDeps }) {
  return (
    <AdminSectionScreen section="reports" language="fr" title="Signalements">
      {() => <AdminReportPanel language="fr" reportId={REPORT_ID} deps={deps} now={() => NOW} />}
    </AdminSectionScreen>
  );
}

async function open(deps: AdminDeps, identity = BIGBOSS) {
  const { Router } = createRouter(
    { adminReport: { pattern: '/admin/reports/$report', screen: async () => ({ default: () => <Screen deps={deps} /> }) } },
    () => <p>absent</p>,
  );
  navigate(`/admin/reports/${REPORT_ID}`, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, identity);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-report-fiche], [data-admin-report-loading], [data-admin-error], [data-admin-empty]') === null; attempt += 1) {
    await mounter.settle();
  }
  await mounter.settle();
  return host;
}

const meta = (host: ParentNode, anchor: string) => host.querySelector(`[data-admin-meta="${anchor}"]`)?.textContent ?? '';

describe('la fiche — qui, quoi, pourquoi, où en est le dossier', () => {
  test('le titre dit le motif ; l’identité nomme l’élément signalé et le signalant', async () => {
    const { deps } = scripted(served());
    const host = await open(deps);

    expect(host.querySelector('[data-admin-page-title]')?.textContent).toBe('Signalement · Harcèlement');
    expect(host.querySelector('[data-admin-fiche="report"]')).not.toBeNull();
    const identity = host.querySelector('[data-admin-identity]')?.textContent ?? '';
    expect(identity).toContain('Message de Membre 4');
    expect(identity).toContain('Signalé par Membre 3');
    expect(identity).toContain('En attente');
    expect(identity).toContain('Harcèlement');
  });

  test('le fil d’Ariane : Modération › Signalements (lien vers la liste) › le signalement', async () => {
    const { deps } = scripted(served());
    const host = await open(deps);

    const crumbs = [...host.querySelectorAll('[data-admin-page-header] nav li')];
    expect(crumbs.map((crumb) => crumb.textContent)).toEqual(['Modération', 'Signalements', 'Signalement · Harcèlement']);
    expect(crumbs[1]?.querySelector('a')?.getAttribute('href')).toBe('/admin/reports');
  });

  test('le contenu signalé : l’extrait, l’auteur, la conversation — nommés', async () => {
    const { deps } = scripted(served());
    const host = await open(deps);

    const reported = host.querySelector('[data-admin-fiche-section="reported"]');
    expect(reported?.querySelector('[data-admin-excerpt]')?.textContent).toBe('Tu vas voir');
    expect(reported?.textContent).toContain('Message');
    expect(meta(reported ?? host, 'reportedOwner')).toContain('Membre 4');
    expect(meta(reported ?? host, 'reportedConversation')).toContain('Famille');
    expect(reported?.querySelector(`a[href="/admin/conversations/${OBJECT_ID(5)}"]`)).not.toBeNull();
    expect(reported?.querySelector(`a[href="/admin/users/${OBJECT_ID(4)}"]`)).not.toBeNull();
  });

  test('un contenu PROTÉGÉ se dit protégé — jamais un vide, jamais un extrait', async () => {
    const { deps } = scripted(served({ reportedEntity: servedMessageEntity({ excerpt: null, isProtected: true }) }));
    const host = await open(deps);

    const reported = host.querySelector('[data-admin-fiche-section="reported"]');
    expect(reported?.querySelector('[data-admin-protected]')?.textContent).toContain('Contenu protégé');
    expect(reported?.textContent).toContain('L’auteur l’a rendu privé ou éphémère');
    expect(reported?.querySelector('[data-admin-excerpt]')).toBeNull();
    expect(reported?.textContent).not.toContain('Ce contenu ne porte pas de texte');
  });

  test('un contenu supprimé dit qu’il n’y a plus rien à lire, et sa puce est barrée', async () => {
    const { deps } = scripted(served({ reportedEntity: servedMessageEntity({ excerpt: null, deleted: true }) }));
    const host = await open(deps);

    const reported = host.querySelector('[data-admin-fiche-section="reported"]');
    expect(reported?.textContent).toContain('Ce contenu a été supprimé');
    expect(reported?.textContent).toContain('supprimé');
  });

  test('un message sans texte (un média) le dit, sans prétendre qu’il est protégé', async () => {
    const { deps } = scripted(served({ reportedEntity: servedMessageEntity({ excerpt: null }) }));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-fiche-section="reported"]')?.textContent).toContain('Ce contenu ne porte pas de texte');
  });

  test('un membre signalé : son nom, pas de bloc d’extrait', async () => {
    const { deps } = scripted(
      served({
        reportedType: 'user',
        reportedEntityId: OBJECT_ID(20),
        reportedEntity: { type: 'user', id: OBJECT_ID(20), label: 'Awa Diop', owner: null, excerpt: null, isProtected: false, deleted: false, conversation: null },
      }),
    );
    const host = await open(deps);

    expect(host.querySelector('[data-admin-identity]')?.textContent).toContain('Awa Diop');
    expect(host.querySelector('[data-admin-fiche-section="reported"] a')?.getAttribute('href')).toBe(`/admin/users/${OBJECT_ID(20)}`);
    expect(host.querySelector('[data-admin-excerpt]')).toBeNull();
  });

  test('le motif : le mot, le signalant, la raison libre', async () => {
    const host = await open(scripted(served()).deps);

    const reason = host.querySelector('[data-admin-fiche-section="reason"]') ?? host;
    expect(meta(reason, 'reason')).toContain('Harcèlement');
    expect(meta(reason, 'reporter')).toContain('Membre 3');
    expect(meta(reason, 'freeReason')).toContain('Il me menace depuis hier');
  });

  test('sans raison libre : « Aucune précision »', async () => {
    const host = await open(scripted(served({ reason: null })).deps);

    expect(meta(host, 'freeReason')).toContain('Aucune précision');
  });

  test('un signalant anonyme est désigné par le nom qu’il a donné', async () => {
    const host = await open(scripted(served({ reporterId: null, reporter: null, reporterName: 'Visiteur' })).deps);

    expect(meta(host, 'reporter')).toContain('Visiteur');
  });

  test('un signalant dont le compte a disparu se dit « Compte supprimé », pas « Anonyme »', async () => {
    const host = await open(scripted(served({ reporter: null })).deps);

    expect(meta(host, 'reporter')).toContain('Compte supprimé');
    expect(meta(host, 'reporter')).not.toContain('Anonyme');
  });

  test('le traitement : statut expliqué, modérateur, notes, action consignée et ce qu’elle signifie', async () => {
    const { deps } = scripted(
      served({
        status: 'resolved',
        moderatorId: OBJECT_ID(9),
        moderator: servedPerson(9, { displayName: 'Léa Moreau', username: 'lea' }),
        moderatorNotes: 'Message retiré, membre averti',
        actionTaken: 'content_removed',
        resolvedAt: '2026-09-30T08:00:00.000Z',
        updatedAt: '2026-09-30T08:00:00.000Z',
      }),
    );
    const host = await open(deps);

    const handling = host.querySelector('[data-admin-fiche-section="handling"]');
    expect(meta(handling ?? host, 'status')).toContain('Résolu');
    expect(meta(handling ?? host, 'moderator')).toContain('Léa Moreau');
    expect(meta(handling ?? host, 'notes')).toContain('Message retiré, membre averti');
    expect(meta(handling ?? host, 'actionTaken')).toContain('Contenu retiré');
    expect(meta(handling ?? host, 'actionTaken')).toContain('ne déclenche rien par lui-même');
    expect(host.querySelector('[data-admin-action-choice]')).toBeNull();
  });

  test('un dossier classé sans suite explique pourquoi il n’a pas de date de résolution', async () => {
    const { deps } = scripted(served({ status: 'dismissed', moderatorId: OBJECT_ID(9), moderator: servedPerson(9), resolvedAt: null }));
    const host = await open(deps);

    expect(meta(host, 'status')).toContain('Classé sans suite');
    expect(host.textContent).toContain('n’entre pas dans le délai moyen de résolution');
    expect(host.querySelector('[data-admin-fiche-aside]')?.textContent).toContain('n’ont pas de date de résolution');
  });

  test('les métadonnées : libellés traduits, dates absolues ET relatives, identifiant technique copiable en dernier', async () => {
    const { deps } = scripted(served());
    const host = await open(deps);

    const aside = host.querySelector('[data-admin-fiche-aside]');
    expect(aside?.textContent).toContain('Métadonnées');
    expect(meta(aside ?? host, 'received')).toMatch(/29 sept\.? 2026/);
    expect(meta(aside ?? host, 'received')).toContain('hier');
    expect(host.querySelector('[data-admin-technical-id]')?.textContent).toBe(REPORT_ID);
    expect(host.querySelector('[data-admin-action="copy-technical-id"]')).not.toBeNull();
    expectNoRawIdentifiers(host);
  });

  test('le bandeau de chiffres : reçu, ouvert depuis, signalements sur cet élément (lien vers la liste filtrée)', async () => {
    const { deps } = scripted(served(), () => siblingPage([servedReport(), servedReport({ id: OBJECT_ID(8) })], 3));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-stat="received"]')?.textContent).toContain('hier');
    expect(host.querySelector('[data-admin-stat="turnaround"]')?.textContent).toMatch(/Ouvert depuis\s*1\s+j\s+2\s+h/);
    expect(host.querySelector('[data-admin-stat="onEntity"]')?.textContent).toContain('3');
    expect(host.querySelector('[data-admin-stat="onEntity"] a')?.getAttribute('href')).toBe(`/admin/reports?reportedEntityId=${OBJECT_ID(2)}`);
  });

  test('un dossier résolu se mesure de la réception à la résolution', async () => {
    const { deps } = scripted(served({ status: 'resolved', resolvedAt: '2026-09-29T12:00:00.000Z', moderatorId: OBJECT_ID(9), moderator: servedPerson(9) }));
    const host = await open(deps);

    expect(host.querySelector('[data-admin-stat="turnaround"]')?.textContent).toMatch(/Traité en\s*2\s+h/);
  });
});

describe('la chronologie n’invente aucune date', () => {
  test('en attente : seulement « Reçu »', async () => {
    const { deps } = scripted(served());
    const host = await open(deps);

    expect([...host.querySelectorAll('[data-admin-timeline-step]')].map((step) => step.getAttribute('data-admin-timeline-step'))).toEqual(['received']);
  });

  test('en cours d’examen : la prise en charge porte le nom du modérateur et sa date', async () => {
    const { deps } = scripted(
      served({ status: 'under_review', moderatorId: OBJECT_ID(9), moderator: servedPerson(9, { displayName: 'Léa Moreau' }), updatedAt: '2026-09-29T15:00:00.000Z' }),
    );
    const host = await open(deps);

    const taken = host.querySelector('[data-admin-timeline-step="taken"]')?.textContent ?? '';
    expect(taken).toContain('Pris en charge par Léa Moreau');
    expect(taken).not.toContain('Date non conservée');
  });

  test('résolu : la prise en charge dit que sa date n’est pas conservée, la clôture est datée', async () => {
    const { deps } = scripted(
      served({ status: 'resolved', moderatorId: OBJECT_ID(9), moderator: servedPerson(9, { displayName: 'Léa Moreau' }), resolvedAt: '2026-09-30T08:00:00.000Z', updatedAt: '2026-09-30T08:00:00.000Z' }),
    );
    const host = await open(deps);

    expect(host.querySelector('[data-admin-timeline-step="taken"]')?.textContent).toContain('Date non conservée');
    const closed = host.querySelector('[data-admin-timeline-step="closed"]')?.textContent ?? '';
    expect(closed).toContain('Clôturé : Résolu');
    expect(closed).toMatch(/30 sept\.? 2026/);
  });
});

describe('les autres signalements de l’élément', () => {
  test('nommés, sans le signalement ouvert, chacun ouvre sa fiche ; « voir tous » ouvre la liste filtrée', async () => {
    const other = servedReport({ id: OBJECT_ID(8), reportType: 'spam', status: 'resolved', reporter: servedPerson(6), createdAt: '2026-09-20T10:00:00.000Z' });
    const { deps } = scripted(served(), () => siblingPage([servedReport(), other], 3));
    const host = await open(deps);

    const section = host.querySelector('[data-admin-fiche-section="siblings"]');
    expect(section?.querySelectorAll('[data-admin-sibling]')).toHaveLength(1);
    const row = section?.querySelector(`[data-admin-sibling="${OBJECT_ID(8)}"]`);
    expect(row?.textContent).toContain('Indésirable');
    expect(row?.textContent).toContain('Résolu');
    expect(row?.textContent).toContain('Membre 6');
    expect(row?.querySelector('a')?.getAttribute('href') ?? row?.getAttribute('href')).toBe(`/admin/reports/${OBJECT_ID(8)}`);
    expect(section?.querySelector('[data-admin-link="see-all"]')?.getAttribute('href')).toBe(`/admin/reports?reportedEntityId=${OBJECT_ID(2)}`);
    expect(section?.textContent).toContain('Voir les 3 signalements');
  });

  test('le signalement ouvert est le seul : « Aucun autre signalement »', async () => {
    const { deps } = scripted(served(), () => siblingPage([servedReport()]));
    const host = await open(deps);

    const section = host.querySelector('[data-admin-fiche-section="siblings"]');
    expect(section?.textContent).toContain('Aucun autre signalement ne vise cet élément.');
    expect(section?.querySelector('[data-admin-link="see-all"]')).toBeNull();
  });

  test('l’échec de ce bloc n’enlève pas la fiche ; « Réessayer » relit', async () => {
    const answers: readonly ApiResult<unknown>[] = [{ ok: false, status: 500, error: 'boom' }, siblingPage([servedReport()])];
    const counter = { calls: 0 };
    const { deps } = scripted(served(), () => answers[Math.min(counter.calls++, answers.length - 1)] ?? siblingPage([]));
    const host = await open(deps);

    const section = host.querySelector('[data-admin-fiche-section="siblings"]');
    expect(host.querySelector('[data-admin-report-fiche]')).not.toBeNull();
    expect(section?.querySelector('[data-admin-notice="warning"]')?.textContent).toContain('n’ont pas pu être chargés');

    await mounter.click(section?.querySelector<HTMLElement>('[data-admin-retry]') ?? null);

    expect(section?.textContent).toContain('Aucun autre signalement');
  });
});

describe('agir : des liens vers la bonne fiche, jamais un geste dupliqué', () => {
  test('un message : l’auteur (onglet Sécurité) et la conversation (lecture souveraine)', async () => {
    const { deps } = scripted(served());
    const host = await open(deps);

    const actions = host.querySelector('[data-admin-fiche-section="actions"]');
    expect(actions?.querySelector('[data-admin-link="authorSecurity"]')?.getAttribute('href')).toBe(`/admin/users/${OBJECT_ID(4)}?tab=security`);
    expect(actions?.querySelector('[data-admin-link="authorSecurity"]')?.textContent).toContain('Examiner l’auteur : Membre 4');
    expect(actions?.querySelector('[data-admin-link="conversationReading"]')?.getAttribute('href')).toBe(`/admin/conversations/${OBJECT_ID(5)}`);
    expect(actions?.textContent).toContain('le signalement ne bannit ni ne retire rien lui-même');
  });

  test('un membre signalé : sa fiche, onglet Sécurité, pour le bannir', async () => {
    const { deps } = scripted(
      served({
        reportedType: 'user',
        reportedEntityId: OBJECT_ID(20),
        reportedEntity: { type: 'user', id: OBJECT_ID(20), label: 'Awa Diop', owner: null, excerpt: null, isProtected: false, deleted: false, conversation: null },
      }),
    );
    const host = await open(deps);

    expect(host.querySelector('[data-admin-link="memberSecurity"]')?.getAttribute('href')).toBe(`/admin/users/${OBJECT_ID(20)}?tab=security`);
  });

  test('un lecteur qui ne peut pas ouvrir la section visée n’a pas le lien : aucun lien mort', async () => {
    const moderator = adminIdentityFixture({ role: 'MODERATOR' });
    const { deps } = scripted(served());
    const host = await open(deps, moderator);

    const actions = host.querySelector('[data-admin-fiche-section="actions"]');
    expect(actions?.querySelector('a')).toBeNull();
    expect(actions?.textContent).toContain('Aucune fiche liée à ouvrir');
    expect(host.querySelector('[data-admin-fiche-section="reported"] a')).toBeNull();
  });
});

describe('les états dessinés', () => {
  test('squelette tant que la fiche est en vol', async () => {
    const { deps } = scripted(new Promise<never>(() => undefined) as unknown as ApiResult<unknown>);
    const host = await open(deps);

    expect(host.querySelector('[data-admin-report-loading]')?.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('[data-admin-report-fiche]')).toBeNull();
  });

  test('404 : « ce signalement n’existe plus », avec le retour aux signalements', async () => {
    const { deps } = scripted({ ok: false, status: 404, error: 'Signalement non trouve' });
    const host = await open(deps);

    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Ce signalement n’existe plus');
    expect(host.querySelector('[data-admin-link="back-to-list"]')?.getAttribute('href')).toBe('/admin/reports');
  });

  test('403 : un bloc refusé, pas une panne', async () => {
    const { deps } = scripted({ ok: false, status: 403, error: 'Forbidden' });
    const host = await open(deps);

    expect(host.querySelector('[data-admin-denied-inline]')).not.toBeNull();
    expect(host.querySelector('[data-admin-error]')).toBeNull();
  });

  test('erreur : « Réessayer » relit la fiche', async () => {
    const counter = { calls: 0 };
    const answers: readonly ApiResult<unknown>[] = [{ ok: false, status: 500, error: 'boom' }, served()];
    const transport = {
      request: async (request: HttpRequest) =>
        request.path.startsWith(`${adminEndpoints.reports}/entity/`) ? siblingPage([servedReport()]) : (answers[Math.min(counter.calls++, 1)] ?? served()),
    } as unknown as HttpTransport;
    const host = await open({ source: 'gateway', transport });

    expect(host.querySelector('[data-admin-error]')).not.toBeNull();

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-error] [data-admin-retry]'));

    expect(host.querySelector('[data-admin-report-fiche]')).not.toBeNull();
  });

  test('refus de la section : le refus unique, la fiche ne se charge pas', async () => {
    const { deps, calls } = scripted(served());
    const host = await open(deps, adminIdentityFixture({ role: 'ADMIN', permissions: { canModerateContent: false } }));

    expect(host.textContent).toContain('Espace réservé');
    expect(host.querySelector('[data-admin-report-fiche]')).toBeNull();
    expect(calls).toEqual([]);
  });
});
