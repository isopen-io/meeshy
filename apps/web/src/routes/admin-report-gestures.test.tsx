import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { AdminSectionScreen } from '@/components/admin/section-screen';
import { OBJECT_ID, servedPerson, servedReport } from '@/lib/admin/report-fixtures';
import type { AdminDeps } from '@/lib/api/admin';
import { ADMIN_REPORTS_SIBLINGS_KEY, ADMIN_REPORTS_STATS_KEY, adminReportsListKey } from '@/lib/api/admin-reports';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { createRouter, navigate } from '@/lib/router';
import { typeInto } from '@/test-support/act-mount';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { resultatServi } from '@/test-support/served-pagination';

import { AdminReportPanel } from './admin-report';

/**
 * **LES SIX GESTES D'UN SIGNALEMENT** (#8876, #6726) — chacun : la méthode, le
 * chemin, le corps, la confirmation qui dit ce qui va se passer, l'annonce, la
 * relecture (fiche, liste, bandeau, voisins), le retour arrière quand la
 * passerelle refuse, et le refus dit en mots. Un serveur simulé GARDE l'état : la
 * fiche relue après un geste montre ce que le geste a fait.
 */

const { mount, mounter } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const NOW = new Date('2026-09-30T12:00:00.000Z');
const REPORT_ID = OBJECT_ID(1);
const MODERATOR = servedPerson(9, { displayName: 'Léa Moreau', username: 'lea' });

type Call = { readonly method: string; readonly path: string; readonly body?: unknown };

type Fake = {
  readonly deps: AdminDeps;
  readonly calls: Call[];
  readonly state: { report: Record<string, unknown> };
};

type Options = {
  readonly report?: Record<string, unknown>;
  readonly fail?: Partial<Record<'PATCH' | 'POST' | 'DELETE', ApiResult<unknown>>>;
  readonly hold?: Partial<Record<'PATCH' | 'POST' | 'DELETE', Promise<void>>>;
};

const isTerminal = (status: unknown) => status === 'resolved' || status === 'rejected';

function fakeServer(options: Options = {}): Fake {
  const state = { report: options.report ?? servedReport() };
  const calls: Call[] = [];
  const ok = (data: unknown = {}): ApiResult<unknown> => ({ ok: true, data, status: 200 });

  const transport = {
    request: async (request: HttpRequest): Promise<ApiResult<unknown>> => {
      calls.push({ method: request.method, path: request.path, ...(request.body === undefined ? {} : { body: request.body }) });
      if (request.method === 'GET') {
        return request.path.startsWith(`${adminEndpoints.reports}/entity/`)
          ? resultatServi({ data: [state.report], pagination: { total: 1, offset: 0, limit: 6, hasMore: false } })
          : resultatServi(state.report);
      }
      const method = request.method === 'PATCH' || request.method === 'POST' || request.method === 'DELETE' ? request.method : null;
      if (method === null) return ok();
      await options.hold?.[method];
      const refusal = options.fail?.[method];
      if (refusal !== undefined) return refusal;

      const body = typeof request.body === 'object' && request.body !== null ? request.body : {};
      if (method === 'POST') state.report = { ...state.report, status: 'under_review', moderatorId: MODERATOR.id, moderator: MODERATOR, updatedAt: '2026-09-30T11:00:00.000Z' };
      if (method === 'PATCH') {
        const status = 'status' in body ? body.status : state.report.status;
        state.report = {
          ...state.report,
          ...body,
          moderatorId: MODERATOR.id,
          moderator: MODERATOR,
          updatedAt: '2026-09-30T11:00:00.000Z',
          resolvedAt: isTerminal(status) ? '2026-09-30T11:00:00.000Z' : state.report.resolvedAt,
        };
      }
      return ok(state.report);
    },
  } as unknown as HttpTransport;

  return { deps: { source: 'gateway', transport }, calls, state };
}

function Screen({ deps }: { readonly deps: AdminDeps }) {
  return (
    <AdminSectionScreen section="reports" language="fr" title="Signalements">
      {() => <AdminReportPanel language="fr" reportId={REPORT_ID} deps={deps} now={() => NOW} />}
    </AdminSectionScreen>
  );
}

async function open(fake: Fake) {
  const { Router } = createRouter(
    { adminReport: { pattern: '/admin/reports/$report', screen: async () => ({ default: () => <Screen deps={fake.deps} /> }) } },
    () => <p>absent</p>,
  );
  navigate(`/admin/reports/${REPORT_ID}`, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, BIGBOSS);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-report-fiche]') === null; attempt += 1) await mounter.settle();
  await mounter.settle();
  return host;
}

const offered = (host: ParentNode) => [...host.querySelectorAll('[data-admin-identity] [data-admin-action]')].map((button) => button.getAttribute('data-admin-action'));
const gesture = (host: ParentNode, name: string) => host.querySelector<HTMLButtonElement>(`[data-admin-identity] [data-admin-action="${name}"]`);
const confirm = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-admin-confirm] [data-admin-action="confirm"]');
const announcement = (host: ParentNode) => host.querySelector('[data-admin-announcement]')?.textContent ?? '';
const writes = (fake: Fake) => fake.calls.filter((call) => call.method !== 'GET');
const reads = (fake: Fake) => fake.calls.filter((call) => call.method === 'GET' && call.path === adminEndpoints.reportsById(REPORT_ID));
const badge = (host: ParentNode) => host.querySelector('[data-admin-identity] [data-admin-raw]')?.textContent ?? '';

describe('quels gestes, dans quel état', () => {
  test('en attente : prendre en charge, résoudre, rejeter, classer sans suite, supprimer', async () => {
    const host = await open(fakeServer());

    expect(offered(host)).toEqual(['assign', 'resolve', 'reject', 'dismiss', 'delete']);
    expect(gesture(host, 'assign')?.textContent).toBe('Prendre en charge');
    expect(gesture(host, 'dismiss')?.textContent).toBe('Classer sans suite');
    expect(gesture(host, 'delete')?.textContent).toBe('Supprimer le signalement');
    expect(gesture(host, 'resolve')?.style.minHeight).toBe('44px');
  });

  test('un dossier clos se rouvre ou se supprime — il ne se résout pas deux fois', async () => {
    const host = await open(fakeServer({ report: servedReport({ status: 'resolved', resolvedAt: '2026-09-30T08:00:00.000Z', moderatorId: MODERATOR.id, moderator: MODERATOR }) }));

    expect(offered(host)).toEqual(['reopen', 'delete']);
  });

  test('en cours d’examen par MOI : « Prendre en charge » n’a plus d’effet, il n’est pas dessiné', async () => {
    sessionStore.getState().establish({ user: { id: MODERATOR.id, username: 'lea', displayName: 'Léa Moreau' }, token: 't', sessionToken: 's', expiresIn: 3600 });
    try {
      const host = await open(fakeServer({ report: servedReport({ status: 'under_review', moderatorId: MODERATOR.id, moderator: MODERATOR }) }));

      expect(offered(host)).toEqual(['resolve', 'reject', 'dismiss', 'delete']);
    } finally {
      mounter.unmountAll();
      sessionStore.getState().clearSession();
    }
  });

  test('en cours d’examen par un AUTRE : on peut le reprendre', async () => {
    const host = await open(fakeServer({ report: servedReport({ status: 'under_review', moderatorId: OBJECT_ID(8), moderator: servedPerson(8) }) }));

    expect(offered(host)).toContain('assign');
  });

  test('hors ligne : les gestes sont désactivés, le cache reste lisible', async () => {
    const host = await open(fakeServer());
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    try {
      await act(async () => {
        window.dispatchEvent(new Event('offline'));
      });
      await mounter.settle();

      expect(host.querySelector('[data-admin-notice="warning"]')?.textContent).toContain('hors ligne');
      expect(offered(host).every((name) => gesture(host, name ?? '')?.disabled === true)).toBe(true);
      expect(host.querySelector('[data-admin-fiche="report"]')).not.toBeNull();
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
      await act(async () => {
        window.dispatchEvent(new Event('online'));
      });
    }
  });
});

describe('prendre en charge', () => {
  test('POST …/assign sans corps, annoncé, relu : le dossier passe « En cours d’examen », nomme son modérateur, et n’offre plus la prise en charge à celui qui l’a prise', async () => {
    sessionStore.getState().establish({ user: { id: MODERATOR.id, username: 'lea', displayName: 'Léa Moreau' }, token: 't', sessionToken: 's', expiresIn: 3600 });
    try {
      const fake = fakeServer();
      const host = await open(fake);
      const readsBefore = reads(fake).length;

      await mounter.click(gesture(host, 'assign'));

      expect(writes(fake)).toEqual([{ method: 'POST', path: adminEndpoints.reportsByIdAssign(REPORT_ID) }]);
      expect(announcement(host)).toBe('Signalement pris en charge');
      expect(reads(fake).length).toBeGreaterThan(readsBefore);
      expect(badge(host)).toBe('En cours d’examen');
      expect(host.querySelector('[data-admin-fiche-section="handling"]')?.textContent).toContain('Léa Moreau');
      expect(offered(host)).not.toContain('assign');
    } finally {
      mounter.unmountAll();
      sessionStore.getState().clearSession();
    }
  });

  test('effet OPTIMISTE : le statut change avant la réponse, et REVIENT si la passerelle refuse', async () => {
    const release: { open: () => void } = { open: () => undefined };
    const gate = new Promise<void>((resolve) => {
      release.open = resolve;
    });
    const fake = fakeServer({ hold: { POST: gate }, fail: { POST: { ok: false, status: 500, error: 'boom' } } });
    const host = await open(fake);

    await mounter.click(gesture(host, 'assign'));
    expect(badge(host)).toBe('En cours d’examen');

    await act(async () => {
      release.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await mounter.settle();

    expect(badge(host)).toBe('En attente');
    expect(announcement(host)).toBe('Le serveur n’a pas pu effectuer le geste.');
  });

  test('invalide la liste, le bandeau et les signalements voisins', async () => {
    const fake = fakeServer();
    appQueryClient.setQueryData(ADMIN_REPORTS_STATS_KEY, { pending: 1 });
    appQueryClient.setQueryData(adminReportsListKey(''), { rows: [], total: 0, hasMore: false });
    appQueryClient.setQueryData([...ADMIN_REPORTS_SIBLINGS_KEY, 'message', OBJECT_ID(99)], { rows: [], total: 0, hasMore: false });
    const host = await open(fake);

    await mounter.click(gesture(host, 'assign'));

    expect(appQueryClient.getQueryState(ADMIN_REPORTS_STATS_KEY)?.isInvalidated).toBe(true);
    expect(appQueryClient.getQueryState(adminReportsListKey(''))?.isInvalidated).toBe(true);
    expect(appQueryClient.getQueryState([...ADMIN_REPORTS_SIBLINGS_KEY, 'message', OBJECT_ID(99)])?.isInvalidated).toBe(true);
  });
});

describe('chaque geste qui écrit relit la file', () => {
  const primed = () => {
    appQueryClient.setQueryData(ADMIN_REPORTS_STATS_KEY, { pending: 1 });
    appQueryClient.setQueryData(adminReportsListKey('status=pending'), { rows: [], total: 0, hasMore: false });
  };
  const invalidated = () => [
    appQueryClient.getQueryState(ADMIN_REPORTS_STATS_KEY)?.isInvalidated,
    appQueryClient.getQueryState(adminReportsListKey('status=pending'))?.isInvalidated,
  ];

  test('résoudre : le bandeau et la liste sont relus', async () => {
    primed();
    const host = await open(fakeServer());

    await mounter.click(gesture(host, 'resolve'));
    await mounter.click(confirm(host));

    expect(invalidated()).toEqual([true, true]);
  });

  test('rejeter : le bandeau et la liste sont relus', async () => {
    primed();
    const host = await open(fakeServer());

    await mounter.click(gesture(host, 'reject'));
    await mounter.click(confirm(host));

    expect(invalidated()).toEqual([true, true]);
  });

  test('supprimer : le bandeau et la liste sont relus', async () => {
    primed();
    const host = await open(fakeServer());

    await mounter.click(gesture(host, 'delete'));
    await mounter.click(confirm(host));

    expect(invalidated()).toEqual([true, true]);
  });

  test('un refus ne relit rien : rien n’a changé côté serveur', async () => {
    primed();
    const host = await open(fakeServer({ fail: { PATCH: { ok: false, status: 500, error: 'boom' } } }));

    await mounter.click(gesture(host, 'resolve'));
    await mounter.click(confirm(host));

    expect(invalidated()).toEqual([false, false]);
  });
});

describe('résoudre', () => {
  test('la feuille dit l’action consignée et que le signalant recevra une réponse ; PATCH { status, actionTaken, moderatorNotes }', async () => {
    const fake = fakeServer();
    const host = await open(fake);

    typeInto(host.querySelector<HTMLSelectElement>('[data-admin-action-choice]'), 'content_removed');
    await mounter.click(gesture(host, 'resolve'));

    const sheet = host.querySelector('[data-admin-confirm]');
    expect(host.querySelector('dialog h2')?.textContent).toBe('Résoudre ce signalement');
    expect(sheet?.textContent).toContain('« Contenu retiré »');
    expect(sheet?.textContent).toContain('Le signalant recevra une réponse.');
    expect(confirm(host)?.textContent).toBe('Résoudre');

    mounter.type(host, '[data-admin-motive]', 'Message retiré');
    await mounter.click(confirm(host));

    expect(writes(fake)).toEqual([
      { method: 'PATCH', path: adminEndpoints.reportsById(REPORT_ID), body: { status: 'resolved', actionTaken: 'content_removed', moderatorNotes: 'Message retiré' } },
    ]);
    expect(host.querySelector('dialog')).toBeNull();
    expect(announcement(host)).toBe('Signalement résolu');
    expect(badge(host)).toBe('Résolu');
    expect(host.querySelector('[data-admin-fiche-section="handling"]')?.textContent).toContain('Message retiré');
    expect(host.querySelector('[data-admin-timeline-step="closed"]')?.textContent).toContain('Clôturé : Résolu');
    expect(offered(host)).toEqual(['reopen', 'delete']);
    expectNoRawIdentifiers(host);
  });

  test('l’action consignée est « Aucune action » par défaut, et la note est facultative', async () => {
    const fake = fakeServer();
    const host = await open(fake);

    await mounter.click(gesture(host, 'resolve'));
    await mounter.click(confirm(host));

    expect(writes(fake)[0]?.body).toEqual({ status: 'resolved', actionTaken: 'none' });
  });

  test('une note commencée mais trop courte bloque la confirmation', async () => {
    const host = await open(fakeServer());

    await mounter.click(gesture(host, 'resolve'));
    mounter.type(host, '[data-admin-motive]', 'ab');

    expect(confirm(host)?.disabled).toBe(true);
  });

  test('sans signalant identifiable (anonyme), la feuille ne promet pas de réponse', async () => {
    const host = await open(fakeServer({ report: servedReport({ reporterId: null, reporter: null }) }));

    await mounter.click(gesture(host, 'resolve'));

    expect(host.querySelector('[data-admin-confirm]')?.textContent).not.toContain('recevra une réponse');
  });

  test('pendant l’envoi la feuille est occupée : un second appui ne renvoie rien, et elle se ferme à la réponse', async () => {
    const release: { open: () => void } = { open: () => undefined };
    const gate = new Promise<void>((resolve) => {
      release.open = resolve;
    });
    const fake = fakeServer({ hold: { PATCH: gate } });
    const host = await open(fake);

    await mounter.click(gesture(host, 'resolve'));
    await mounter.click(confirm(host));

    expect(confirm(host)?.disabled).toBe(true);
    expect(confirm(host)?.textContent).toBe('En cours…');
    await mounter.click(confirm(host));
    expect(writes(fake)).toHaveLength(1);

    await act(async () => {
      release.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await mounter.settle();

    expect(host.querySelector('dialog')).toBeNull();
    expect(badge(host)).toBe('Résolu');
  });

  test('un refus garde la feuille ouverte et se dit en mots ; annuler ne change rien', async () => {
    const fake = fakeServer({ fail: { PATCH: { ok: false, status: 403, error: 'Forbidden' } } });
    const host = await open(fake);

    await mounter.click(gesture(host, 'resolve'));
    await mounter.click(confirm(host));

    expect(host.querySelector('[data-admin-confirm-error]')?.textContent).toBe('Vous n’avez pas le droit d’effectuer ce geste.');
    expect(host.querySelector('dialog')).not.toBeNull();
    expect(badge(host)).toBe('En attente');

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-confirm] [data-admin-action="cancel"]'));

    expect(host.querySelector('dialog')).toBeNull();
    expect(writes(fake)).toHaveLength(1);
  });
});

describe('rejeter, classer sans suite, rouvrir', () => {
  test('rejeter : PATCH { status: rejected, moderatorNotes }', async () => {
    const fake = fakeServer();
    const host = await open(fake);

    await mounter.click(gesture(host, 'reject'));
    expect(host.querySelector('dialog h2')?.textContent).toBe('Rejeter ce signalement');
    mounter.type(host, '[data-admin-motive]', 'Infondé');
    await mounter.click(confirm(host));

    expect(writes(fake)[0]?.body).toEqual({ status: 'rejected', moderatorNotes: 'Infondé' });
    expect(announcement(host)).toBe('Signalement rejeté');
    expect(badge(host)).toBe('Rejeté');
  });

  test('classer sans suite : PATCH { status: dismissed }, sans note inventée — et la feuille dit l’effet sur le délai moyen', async () => {
    const fake = fakeServer();
    const host = await open(fake);

    await mounter.click(gesture(host, 'dismiss'));
    expect(host.querySelector('[data-admin-confirm]')?.textContent).toContain('n’entrera pas dans le délai moyen de résolution');
    await mounter.click(confirm(host));

    expect(writes(fake)[0]?.body).toEqual({ status: 'dismissed' });
    expect(announcement(host)).toBe('Signalement classé sans suite');
    expect(badge(host)).toBe('Classé sans suite');
  });

  test('rouvrir : PATCH { status: pending } ; la feuille dit que le lecteur devient le modérateur', async () => {
    const fake = fakeServer({ report: servedReport({ status: 'resolved', resolvedAt: '2026-09-30T08:00:00.000Z', moderatorId: MODERATOR.id, moderator: MODERATOR }) });
    const host = await open(fake);

    await mounter.click(gesture(host, 'reopen'));
    expect(host.querySelector('[data-admin-confirm]')?.textContent).toContain('vous en devenez le modérateur');
    await mounter.click(confirm(host));

    expect(writes(fake)[0]?.body).toEqual({ status: 'pending' });
    expect(announcement(host)).toBe('Signalement rouvert');
    expect(badge(host)).toBe('En attente');
    expect(offered(host)).toContain('resolve');
    expect(host.querySelector('[data-admin-timeline-step="closed"]')).toBeNull();
  });
});

describe('supprimer', () => {
  test('la feuille dit que c’est définitif ; DELETE, annoncé, retour à la liste de l’espace courant — sans relire la fiche supprimée', async () => {
    const fake = fakeServer();
    const host = await open(fake);
    const readsBefore = reads(fake).length;

    await mounter.click(gesture(host, 'delete'));
    expect(host.querySelector('dialog h2')?.textContent).toBe('Supprimer ce signalement');
    expect(host.querySelector('[data-admin-confirm]')?.textContent).toContain('irréversible');
    await mounter.click(confirm(host));

    expect(writes(fake)).toEqual([{ method: 'DELETE', path: adminEndpoints.reportsById(REPORT_ID) }]);
    expect(window.location.pathname).toBe('/admin/reports');
    expect(reads(fake)).toHaveLength(readsBefore);
  });

  test('un 403 (le modérateur est VISÉ par le signalement) se dit comme un refus : la feuille reste, rien ne part', async () => {
    const fake = fakeServer({ fail: { DELETE: { ok: false, status: 403, error: 'Un modérateur ne peut pas supprimer un signalement qui le vise' } } });
    const host = await open(fake);

    await mounter.click(gesture(host, 'delete'));
    await mounter.click(confirm(host));

    expect(host.querySelector('[data-admin-confirm-error]')?.textContent).toBe('Vous n’avez pas le droit d’effectuer ce geste.');
    expect(window.location.pathname).toBe(`/admin/reports/${REPORT_ID}`);
    expect(host.querySelector('[data-admin-fiche="report"]')).not.toBeNull();
  });
});
