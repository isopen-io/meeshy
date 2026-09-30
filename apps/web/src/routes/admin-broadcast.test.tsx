import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { environmentManager } from '@tanstack/react-query';
import { act } from 'react';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { AdminSectionScreen } from '@/components/admin/section-screen';
import { OBJECT_ID, servedBroadcast, servedPerson, servedPreview, servedReadyBroadcast } from '@/lib/admin/broadcast-fixtures';
import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { createRouter, navigate } from '@/lib/router';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { resultatServi } from '@/test-support/served-pagination';

import { AdminBroadcastPanel } from './admin-broadcast';

/**
 * **LA FICHE D'UNE DIFFUSION** (#8876, #6731) — nommée, interprétée, sans
 * identifiant hors de la ligne « Identifiant technique » ; les gestes présents ou
 * absents selon le statut ; la préparation dite AVANT d'être déclenchée ; le
 * retour arrière quand la passerelle refuse ; la relecture automatique tant qu'un
 * envoi tourne. Un serveur simulé GARDE l'état : la fiche relue après un geste
 * montre ce que le geste a fait.
 */

const { mount, mounter } = setupAdminKitTests();

/* TanStack juge « serveur » au CHARGEMENT de son module (`typeof window === 'undefined'`), avant que
   le DOM de test ne soit posé : il désarme alors tout `refetchInterval`. La relecture automatique de
   la fiche ne se mesure donc qu'en disant au gestionnaire qu'on est dans un navigateur — et en
   rendant son état d'origine, le processus de test étant partagé entre les fichiers. */
const serverBefore = environmentManager.isServer();
beforeAll(() => environmentManager.setIsServer(() => false));
afterAll(() => environmentManager.setIsServer(() => serverBefore));

const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const NOW = new Date('2026-09-30T12:00:00.000Z');
const ID = OBJECT_ID(1);
const SENDER = servedPerson(4, { displayName: 'Léa Moreau', username: 'lea' });

type Call = { readonly method: string; readonly path: string; readonly body?: unknown; readonly timeoutMs?: number };

type Fake = {
  readonly deps: AdminDeps;
  readonly calls: Call[];
  readonly state: { broadcast: Record<string, unknown> };
};

type Options = {
  readonly broadcast?: Record<string, unknown>;
  readonly fail?: Partial<Record<string, ApiResult<unknown>>>;
  readonly hold?: Partial<Record<string, Promise<void>>>;
  readonly onRead?: (read: number, state: { broadcast: Record<string, unknown> }) => void;
};

const ok = (data: unknown = undefined): ApiResult<unknown> => resultatServi(data);

function fakeServer(options: Options = {}): Fake {
  const state = { broadcast: options.broadcast ?? servedBroadcast() };
  const calls: Call[] = [];
  let read = 0;

  const transport = {
    request: async (request: HttpRequest): Promise<ApiResult<unknown>> => {
      calls.push({
        method: request.method,
        path: request.path,
        ...(request.body === undefined ? {} : { body: request.body }),
        ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
      });
      if (request.method === 'GET') {
        read += 1;
        options.onRead?.(read, state);
        return resultatServi(state.broadcast);
      }

      const key = `${request.method} ${request.path}`;
      await options.hold?.[key];
      const refusal = options.fail?.[key];
      if (refusal !== undefined) return refusal;

      const at = '2026-09-30T11:00:00.000Z';
      if (request.path === adminEndpoints.broadcastsByIdPreview(ID)) {
        const ready = servedReadyBroadcast();
        state.broadcast = {
          ...state.broadcast,
          status: ready.status,
          totalRecipients: ready.totalRecipients,
          targetLanguages: ready.targetLanguages,
          translatedSubjects: ready.translatedSubjects,
          translatedBodies: ready.translatedBodies,
        };
        return ok(servedPreview());
      }
      if (request.path === adminEndpoints.broadcastsByIdSend(ID)) {
        state.broadcast = { ...state.broadcast, status: 'SENDING', sentAt: at, sentById: SENDER.id, sentBy: SENDER };
        return ok();
      }
      if (request.path === adminEndpoints.broadcastsByIdSendInapp(ID)) {
        state.broadcast = { ...state.broadcast, inAppSentAt: at, inAppSentById: SENDER.id, inAppSentBy: SENDER, inAppCompletedAt: null };
        return ok();
      }
      if (request.method === 'PUT') {
        const body = typeof request.body === 'object' && request.body !== null ? request.body : {};
        state.broadcast = { ...state.broadcast, ...body, updatedAt: at };
        return ok(state.broadcast);
      }
      return ok();
    },
  } as unknown as HttpTransport;

  return { deps: { source: 'gateway', transport }, calls, state };
}

function Screen({ deps, pollMs }: { readonly deps: AdminDeps; readonly pollMs?: number }) {
  return (
    <AdminSectionScreen section="broadcasts" language="fr" title="Diffusions">
      {() => <AdminBroadcastPanel language="fr" broadcastId={ID} deps={deps} now={() => NOW} {...(pollMs === undefined ? {} : { pollMs })} />}
    </AdminSectionScreen>
  );
}

async function open(fake: Fake, options: { readonly pollMs?: number; readonly url?: string; readonly identity?: ReturnType<typeof adminIdentityFixture> } = {}) {
  const url = options.url ?? `/admin/broadcasts/${ID}`;
  const adm = url.startsWith('/adm/');
  const { Router } = createRouter(
    {
      [adm ? 'admBroadcast' : 'adminBroadcast']: {
        pattern: adm ? '/adm/broadcasts/$broadcast' : '/admin/broadcasts/$broadcast',
        screen: async () => ({ default: () => <Screen deps={fake.deps} {...(options.pollMs === undefined ? {} : { pollMs: options.pollMs })} /> }),
      },
    },
    () => <p>absent</p>,
  );
  navigate(url, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, options.identity ?? BIGBOSS);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-broadcast-fiche], [data-admin-broadcast-loading], [data-admin-error], [data-admin-empty]') === null; attempt += 1) {
    await mounter.settle();
  }
  await mounter.settle();
  return host;
}

const SHEET_ACTIONS = ['cancel', 'confirm', 'save'];
const offered = (host: ParentNode) =>
  [...host.querySelectorAll('[data-admin-identity] [data-admin-action]')]
    .map((button) => button.getAttribute('data-admin-action'))
    .filter((action) => !SHEET_ACTIONS.includes(action ?? ''));
const gesture = (host: ParentNode, name: string) => host.querySelector<HTMLButtonElement>(`[data-admin-identity] [data-admin-action="${name}"]`);
const confirm = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-admin-confirm] [data-admin-action="confirm"]');
const confirmBody = (host: ParentNode) => host.querySelector('[data-admin-confirm] p')?.textContent ?? '';
const announcement = (host: ParentNode) => host.querySelector('[data-admin-announcement]')?.textContent ?? '';
const writes = (fake: Fake) => fake.calls.filter((call) => call.method !== 'GET');
const reads = (fake: Fake) => fake.calls.filter((call) => call.method === 'GET');
const meta = (host: ParentNode, anchor: string) => host.querySelector(`[data-admin-meta="${anchor}"]`)?.textContent ?? '';
const section = (host: ParentNode, id: string) => host.querySelector(`[data-admin-fiche-section="${id}"]`);
const badge = (host: ParentNode) => host.querySelector('[data-admin-identity] [data-admin-raw]')?.textContent ?? '';
const sleep = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

describe('la fiche — qui, quoi, pour qui, où en est l’envoi', () => {
  test('le titre est le nom de la diffusion ; l’identité dit son statut et qui l’a créée, et quand', async () => {
    const host = await open(fakeServer());

    expect(host.querySelector('[data-admin-page-title]')?.textContent).toBe('Lancement de l’automne');
    expect(host.querySelector('[data-admin-fiche="broadcast"]')).not.toBeNull();
    const identity = host.querySelector('[data-admin-identity]')?.textContent ?? '';
    expect(identity).toContain('Brouillon');
    expect(identity).toContain('Créée');
    expect(identity).toContain('Membre 3');
  });

  test('le fil d’Ariane : Croissance › Diffusions (lien vers la liste) › le nom', async () => {
    const host = await open(fakeServer());

    const crumbs = [...host.querySelectorAll('[data-admin-page-header] nav li')];
    expect(crumbs.map((crumb) => crumb.textContent)).toEqual(['Croissance', 'Diffusions', 'Lancement de l’automne']);
    expect(crumbs[1]?.querySelector('a')?.getAttribute('href')).toBe('/admin/broadcasts');
  });

  test('le contenu, dans la langue d’écriture NOMMÉE, garde ses retours à la ligne', async () => {
    const host = await open(fakeServer());

    const content = section(host, 'content');
    expect(content?.textContent).toContain('Écrit en français');
    expect(content?.querySelector('[data-admin-subject]')?.textContent).toBe('Nouveautés de septembre');
    expect(content?.querySelector('[data-admin-body]')?.textContent).toBe('Bonjour,\nvoici ce qui change ce mois-ci.');
    expect(content?.querySelector('[data-admin-body]')?.getAttribute('lang')).toBe('fr');
  });

  test('l’audience se dit en UNE phrase, langues et pays nommés', async () => {
    const host = await open(fakeServer());

    expect(section(host, 'audience')?.querySelector('[data-admin-audience]')?.textContent).toBe(
      'Comptes actifs, en français et espagnol, pays d’inscription : Sénégal et France',
    );
  });

  test('aucun ciblage : « Tous les comptes »', async () => {
    const host = await open(fakeServer({ broadcast: servedBroadcast({ targeting: {} }) }));

    expect(section(host, 'audience')?.querySelector('[data-admin-audience]')?.textContent).toBe('Tous les comptes');
  });

  test('un brouillon n’a pas encore de destinataires calculés, ni d’envoi, ni de publication : il le dit', async () => {
    const host = await open(fakeServer());

    expect(meta(host, 'recipients')).toContain('Calculé à la préparation de l’envoi');
    expect(section(host, 'translations')?.textContent).toContain('Pas encore traduite');
    expect(section(host, 'email')?.textContent).toContain('Pas encore envoyée par e-mail');
    expect(meta(host, 'inAppState')).toContain('Pas encore publiée dans l’application');
    expect(host.querySelector('[role="progressbar"]')).toBeNull();
  });

  test('la ligne « Identifiant technique » est le SEUL endroit où l’identifiant s’écrit', async () => {
    const host = await open(fakeServer());

    expect(host.querySelector('[data-admin-technical-id]')?.textContent).toBe(ID);
    expectNoRawIdentifiers(host);
  });

  test('les personnes sont des puces nommées qui ouvrent la fiche du compte', async () => {
    const host = await open(fakeServer({ broadcast: servedBroadcast({ status: 'SENT', sentAt: '2026-09-29T12:00:00.000Z', sentBy: SENDER, sentById: SENDER.id }) }));

    const people = section(host, 'people');
    expect(meta(people ?? host, 'createdBy')).toContain('Membre 3');
    expect(meta(people ?? host, 'createdBy')).toContain('@membre3');
    expect(meta(people ?? host, 'sentBy')).toContain('Léa Moreau');
    expect(people?.querySelector(`a[href="/admin/users/${OBJECT_ID(3)}"]`)).not.toBeNull();
    expect(people?.querySelector(`a[href="/admin/users/${SENDER.id}"]`)).not.toBeNull();
    expect(meta(people ?? host, 'inAppBy')).toBe('');
  });

  test('un compte supprimé se dit, il n’est pas inventé', async () => {
    const host = await open(fakeServer({ broadcast: servedBroadcast({ createdBy: null }) }));

    expect(meta(section(host, 'people') ?? host, 'createdBy')).toContain('Compte introuvable');
  });

  test('les métadonnées : statut expliqué, langue nommée, langues cibles, dates absolues ET relatives', async () => {
    const host = await open(fakeServer({ broadcast: servedReadyBroadcast() }));

    expect(meta(host, 'status')).toContain('Prête à l’envoi');
    expect(meta(host, 'status')).toContain('Traduite : il ne reste qu’à l’envoyer.');
    expect(meta(host, 'sourceLanguage')).toContain('Français');
    expect(meta(host, 'targetLanguages')).toContain('Espagnol et Anglais');
    expect(meta(host, 'created')).toMatch(/·/);
    expect(meta(host, 'created')).toMatch(/2026/);
  });

  test('les chiffres clés : destinataires, envoyés, échecs, dans l’application', async () => {
    const host = await open(fakeServer({ broadcast: servedBroadcast({ status: 'SENT', totalRecipients: 900, sentCount: 880, failedCount: 7, inAppSentCount: 866, inAppSentAt: '2026-09-29T13:00:00.000Z', inAppCompletedAt: '2026-09-29T13:05:00.000Z' }) }));

    const strip = (id: string) => host.querySelector(`[data-admin-stat="${id}"] dd`)?.textContent;
    expect(strip('recipients')).toBe('900');
    expect(strip('sent')).toBe('880');
    expect(strip('failed')).toBe('7');
    expect(strip('inApp')).toBe('866');
  });

  test('en brouillon, les chiffres de livraison sont des tirets, jamais zéro', async () => {
    const host = await open(fakeServer());

    for (const id of ['recipients', 'sent', 'failed']) expect(host.querySelector(`[data-admin-stat="${id}"] dd`)?.textContent).toBe('—');
    expect(host.querySelector('[data-admin-stat="inApp"] dd')?.textContent).toBe('Non publiée');
  });
});

describe('aucun identifiant ni valeur brute, dans aucun statut', () => {
  const STATUSES: Readonly<Record<string, Record<string, unknown>>> = {
    brouillon: servedBroadcast(),
    prête: servedReadyBroadcast(),
    'envoi en cours': servedReadyBroadcast({ status: 'SENDING', sentCount: 100, failedCount: 2, sentAt: '2026-09-30T11:30:00.000Z', sentBy: SENDER, sentById: SENDER.id }),
    envoyée: servedReadyBroadcast({
      status: 'SENT',
      sentCount: 1190,
      failedCount: 4,
      sentAt: '2026-09-29T12:00:00.000Z',
      completedAt: '2026-09-29T12:20:00.000Z',
      sentBy: SENDER,
      sentById: SENDER.id,
      inAppSentAt: '2026-09-29T13:00:00.000Z',
      inAppCompletedAt: '2026-09-29T13:05:00.000Z',
      inAppSentCount: 1190,
      inAppSentBy: SENDER,
      inAppSentById: SENDER.id,
    }),
    échec: servedBroadcast({ status: 'FAILED', errorMessage: 'Serveur SMTP injoignable', totalRecipients: 40, failedCount: 40, sentAt: '2026-09-29T12:00:00.000Z' }),
  };

  for (const [name, broadcast] of Object.entries(STATUSES)) {
    test(`la fiche « ${name} » ne peint ni ObjectId, ni date ISO, ni énumération brute, ni booléen brut`, async () => {
      const host = await open(fakeServer({ broadcast }));

      expect(host.querySelector('[data-admin-broadcast-fiche]')).not.toBeNull();
      expectNoRawIdentifiers(host);
    });
  }
});

describe('les traductions — en onglets NOMMÉS, dès qu’elles existent', () => {
  test('un onglet par langue de traduction, nommé ; le premier est ouvert', async () => {
    const host = await open(fakeServer({ broadcast: servedReadyBroadcast() }));

    const tabs = [...host.querySelectorAll('[data-admin-tab]')].map((tab) => tab.textContent?.trim());
    expect(tabs).toEqual(['Espagnol', 'Anglais']);
    const panel = section(host, 'translations')?.querySelector('[data-admin-translation]');
    expect(panel?.getAttribute('data-admin-translation')).toBe('es');
    expect(panel?.textContent).toContain('Novedades de septiembre');
    expect(panel?.textContent).toContain('esto es lo que cambia este mes');
    expect(panel?.querySelector('[lang="es"]')).not.toBeNull();
  });

  test('changer d’onglet affiche l’autre langue', async () => {
    const host = await open(fakeServer({ broadcast: servedReadyBroadcast() }));

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-tab="en"]'));

    const panel = section(host, 'translations')?.querySelector('[data-admin-translation]');
    expect(panel?.getAttribute('data-admin-translation')).toBe('en');
    expect(panel?.textContent).toContain('September news');
    expect(window.location.search).toBe('?tab=en');
  });

  test('l’adresse pose l’onglet ouvert', async () => {
    const host = await open(fakeServer({ broadcast: servedReadyBroadcast() }), { url: `/admin/broadcasts/${ID}?tab=en` });

    expect(section(host, 'translations')?.querySelector('[data-admin-translation]')?.getAttribute('data-admin-translation')).toBe('en');
  });

  test('préparée sans aucune traduction nécessaire : elle le dit autrement que « pas encore »', async () => {
    const host = await open(fakeServer({ broadcast: servedReadyBroadcast({ targetLanguages: [], translatedSubjects: {}, translatedBodies: {} }) }));

    expect(section(host, 'translations')?.textContent).toContain('Aucune traduction n’a été nécessaire');
    expect(host.querySelector('[data-admin-tab]')).toBeNull();
  });
});

describe('quels gestes, dans quel état', () => {
  test('brouillon : traduire et préparer, modifier, supprimer', async () => {
    const host = await open(fakeServer());

    expect(offered(host)).toEqual(['prepare', 'edit', 'delete']);
    expect(gesture(host, 'prepare')?.textContent).toBe('Traduire et préparer l’envoi');
    expect(gesture(host, 'edit')?.textContent).toBe('Modifier');
    expect(gesture(host, 'delete')?.textContent).toBe('Supprimer');
    expect(gesture(host, 'prepare')?.style.minHeight).toBe('44px');
  });

  test('prête : envoyer par e-mail à N comptes, publier dans l’application, supprimer — plus de modification', async () => {
    const host = await open(fakeServer({ broadcast: servedReadyBroadcast() }));

    expect(offered(host)).toEqual(['send', 'publishInApp', 'delete']);
    expect(gesture(host, 'send')?.textContent).toMatch(/^Envoyer par e-mail à 1\s204 comptes$/);
    expect(gesture(host, 'publishInApp')?.textContent).toBe('Publier dans l’application');
  });

  test('prête pour UN seul compte : le singulier', async () => {
    const host = await open(fakeServer({ broadcast: servedReadyBroadcast({ totalRecipients: 1 }) }));

    expect(gesture(host, 'send')?.textContent).toBe('Envoyer par e-mail à 1 compte');
  });

  test('prête et déjà publiée dans l’application : on n’y republie pas', async () => {
    const host = await open(fakeServer({ broadcast: servedReadyBroadcast({ inAppSentAt: '2026-09-29T13:00:00.000Z', inAppCompletedAt: '2026-09-29T13:05:00.000Z' }) }));

    expect(offered(host)).toEqual(['send', 'delete']);
  });

  test('prête qui ne vise PERSONNE : ni envoi ni publication, et le dit', async () => {
    const host = await open(fakeServer({ broadcast: servedReadyBroadcast({ totalRecipients: 0 }) }));

    expect(gesture(host, 'send')?.disabled).toBe(true);
    expect(gesture(host, 'publishInApp')?.disabled).toBe(true);
    expect(host.textContent).toContain('Aucun compte ne correspond à cette audience');
  });

  test('envoyée, pas encore publiée dans l’application : « Publier dans l’application » seulement', async () => {
    const host = await open(fakeServer({ broadcast: servedBroadcast({ status: 'SENT', totalRecipients: 900, sentCount: 880 }) }));

    expect(offered(host)).toEqual(['publishInApp']);
  });

  test('envoyée ET publiée : aucun geste', async () => {
    const host = await open(fakeServer({ broadcast: servedBroadcast({ status: 'SENT', inAppSentAt: '2026-09-29T13:00:00.000Z', inAppCompletedAt: '2026-09-29T13:05:00.000Z' }) }));

    expect(offered(host)).toEqual([]);
  });

  test('envoi en cours : aucun geste — et aucune annulation, la passerelle n’en sert pas', async () => {
    const host = await open(fakeServer({ broadcast: servedBroadcast({ status: 'SENDING', totalRecipients: 500, sentCount: 100, sentAt: '2026-09-30T11:30:00.000Z' }) }));

    expect(offered(host)).toEqual([]);
    expect(host.textContent).toContain('Envoi en cours : cette page se met à jour toute seule');
  });

  test('échec : aucun geste, et le message d’erreur de la passerelle est dit', async () => {
    const host = await open(fakeServer({ broadcast: servedBroadcast({ status: 'FAILED', errorMessage: 'Serveur SMTP injoignable', totalRecipients: 40, failedCount: 40 }) }));

    expect(offered(host)).toEqual([]);
    expect(host.querySelector('[data-admin-inline-notice], [role="status"], [role="alert"]')).not.toBeNull();
    expect(host.textContent).toContain('L’envoi a échoué : Serveur SMTP injoignable');
    expect(badge(host)).toBe('Échec');
  });

  test('échec sans message : le dit aussi', async () => {
    const host = await open(fakeServer({ broadcast: servedBroadcast({ status: 'FAILED', errorMessage: null }) }));

    expect(host.textContent).toContain('la passerelle n’a donné aucun message d’erreur');
  });

  test('hors ligne, tous les gestes sont désactivés et rien ne part', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    try {
      const host = await open(fakeServer());

      expect(gesture(host, 'prepare')?.disabled).toBe(true);
      expect(gesture(host, 'delete')?.disabled).toBe(true);
    } finally {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    }
  });
});

describe('la livraison', () => {
  test('envoyée : barre de progression pleine, dates absolues ET relatives, envoyée par un compte nommé', async () => {
    const host = await open(
      fakeServer({
        broadcast: servedBroadcast({
          status: 'SENT',
          totalRecipients: 900,
          sentCount: 850,
          failedCount: 7,
          sentAt: '2026-09-29T12:00:00.000Z',
          completedAt: '2026-09-29T12:20:00.000Z',
        }),
      }),
    );

    const email = section(host, 'email');
    const bar = email?.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute('aria-valuenow')).toBe('100');
    expect(bar?.getAttribute('aria-label')).toMatch(/857 sur 900/);
    expect(meta(email ?? host, 'sentAt')).toMatch(/2026.*·/);
    expect(meta(email ?? host, 'completedAt')).toMatch(/2026.*·/);
    expect(email?.textContent).toContain('ont désactivé les e-mails de diffusion');
  });

  test('en cours : la progression est partielle et la fin est « En cours »', async () => {
    const host = await open(
      fakeServer({ broadcast: servedBroadcast({ status: 'SENDING', totalRecipients: 200, sentCount: 40, failedCount: 10, sentAt: '2026-09-30T11:30:00.000Z' }) }),
    );

    const email = section(host, 'email');
    expect(email?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('25');
    expect(meta(email ?? host, 'completedAt')).toContain('En cours');
  });

  test('dans l’application : publication en cours', async () => {
    const running = await open(fakeServer({ broadcast: servedReadyBroadcast({ inAppSentAt: '2026-09-30T11:55:00.000Z', inAppSentCount: 300 }) }));
    const inApp = section(running, 'in-app');
    expect(meta(inApp ?? running, 'inAppState')).toContain('Publication en cours');
    expect(meta(inApp ?? running, 'inAppSent')).toContain('300');
    expect(meta(inApp ?? running, 'inAppCompletedAt')).toContain('En cours');
    expect(running.textContent).toContain('Publication en cours : cette page se met à jour toute seule');
  });

  test('dans l’application : publication terminée, avec ses comptes et ses dates', async () => {
    const done = await open(
      fakeServer({
        broadcast: servedReadyBroadcast({
          inAppSentAt: '2026-09-29T13:00:00.000Z',
          inAppCompletedAt: '2026-09-29T13:05:00.000Z',
          inAppSentCount: 1190,
          inAppFailedCount: 2,
          inAppSentBy: SENDER,
        }),
      }),
    );
    const finished = section(done, 'in-app');
    expect(meta(finished ?? done, 'inAppState')).toContain('Publiée dans l’application');
    expect(meta(finished ?? done, 'inAppSent')).toMatch(/1\s190/);
    expect(meta(finished ?? done, 'inAppFailed')).toContain('2');
    expect(meta(finished ?? done, 'inAppCompletedAt')).toMatch(/2026.*·/);
    expect(meta(section(done, 'people') ?? done, 'inAppBy')).toContain('Léa Moreau');
  });
});

describe('la relecture automatique — tant qu’un envoi tourne', () => {
  test('toutes les dix secondes en production ; ici réglée court : la fiche se relit, puis s’arrête quand l’envoi est fini', async () => {
    const fake = fakeServer({
      broadcast: servedBroadcast({ status: 'SENDING', totalRecipients: 100, sentCount: 10, sentAt: '2026-09-30T11:30:00.000Z' }),
      onRead: (read, state) => {
        if (read >= 3) state.broadcast = { ...state.broadcast, status: 'SENT', sentCount: 100, completedAt: '2026-09-30T11:40:00.000Z' };
      },
    });
    const host = await open(fake, { pollMs: 30 });

    await sleep(250);
    await mounter.settle();

    expect(badge(host)).toBe('Envoyée');
    const afterDone = reads(fake).length;
    expect(afterDone).toBeGreaterThanOrEqual(3);
    await sleep(150);
    expect(reads(fake)).toHaveLength(afterDone);
  });

  test('une diffusion au repos ne se relit jamais', async () => {
    const fake = fakeServer();
    await open(fake, { pollMs: 20 });

    await sleep(150);

    expect(reads(fake)).toHaveLength(1);
  });

  test('la publication dans l’application qui tourne fait relire la fiche aussi', async () => {
    const fake = fakeServer({
      broadcast: servedReadyBroadcast({ inAppSentAt: '2026-09-30T11:55:00.000Z' }),
      onRead: (read, state) => {
        if (read >= 2) state.broadcast = { ...state.broadcast, inAppCompletedAt: '2026-09-30T11:58:00.000Z', inAppSentCount: 1204 };
      },
    });
    const host = await open(fake, { pollMs: 30 });

    await sleep(200);
    await mounter.settle();

    expect(meta(section(host, 'in-app') ?? host, 'inAppState')).toContain('Publiée dans l’application');
  });
});

describe('préparer — traduire, passer à « Prête », dire la répartition', () => {
  test('la confirmation dit l’effet de bord AVANT qu’il n’ait lieu, et n’appelle rien tant qu’on ne confirme pas', async () => {
    const fake = fakeServer();
    const host = await open(fake);

    await mounter.click(gesture(host, 'prepare'));

    const body = confirmBody(host);
    expect(body).toContain('traduit l’objet et le message');
    expect(body).toContain('« Prête à l’envoi »');
    expect(body).toContain('Rien n’est envoyé');
    expect(body).toContain('ne pourra plus être modifié');
    expect(writes(fake)).toEqual([]);
  });

  test('confirmer : POST preview avec un délai long, le statut passe à Prête, les gestes suivent, l’action est annoncée', async () => {
    const fake = fakeServer();
    const host = await open(fake);

    await mounter.click(gesture(host, 'prepare'));
    await mounter.click(confirm(host));

    const call = writes(fake)[0];
    expect(call?.method).toBe('POST');
    expect(call?.path).toBe(adminEndpoints.broadcastsByIdPreview(ID));
    expect(call?.timeoutMs).toBeGreaterThan(15_000);
    expect(badge(host)).toBe('Prête à l’envoi');
    expect(offered(host)).toEqual(['send', 'publishInApp', 'delete']);
    expect(host.querySelector('[data-admin-confirm]')).toBeNull();
    expect(announcement(host)).toBe('Diffusion prête : les traductions sont créées');
  });

  test('après la préparation : les traductions apparaissent, et les destinataires se répartissent par langue et par pays NOMMÉS', async () => {
    const fake = fakeServer();
    const host = await open(fake);

    await mounter.click(gesture(host, 'prepare'));
    await mounter.click(confirm(host));

    expect([...host.querySelectorAll('[data-admin-tab]')].map((tab) => tab.textContent?.trim())).toEqual(['Espagnol', 'Anglais']);
    const preview = section(host, 'audience')?.querySelector('[data-admin-preview]');
    expect(preview).not.toBeNull();
    const byLanguage = [...(preview?.querySelectorAll('[data-admin-chart="broadcast-recipients-languages"] [data-admin-bar]') ?? [])].map((bar) => bar.textContent);
    expect(byLanguage[0]).toContain('Français');
    expect(byLanguage[0]).toContain('800');
    expect(byLanguage.join(' ')).toContain('Espagnol');
    expect(byLanguage.join(' ')).toContain('Anglais');
    const byCountry = [...(preview?.querySelectorAll('[data-admin-chart="broadcast-recipients-countries"] [data-admin-bar]') ?? [])].map((bar) => bar.textContent);
    expect(byCountry.join(' ')).toContain('Sénégal');
    expect(byCountry.join(' ')).toContain('France');
    expect(byCountry.join(' ')).toContain('Pays inconnu');
    expect(meta(section(host, 'audience') ?? host, 'recipients')).toMatch(/1\s204/);
    expectNoRawIdentifiers(host);
  });

  test('un refus de la passerelle se dit dans la confirmation, le brouillon reste un brouillon, et la fiche est relue', async () => {
    const fake = fakeServer({ fail: { [`POST ${adminEndpoints.broadcastsByIdPreview(ID)}`]: { ok: false, status: 500, error: 'Erreur lors de la preview du broadcast' } } });
    const host = await open(fake);
    const readsBefore = reads(fake).length;

    await mounter.click(gesture(host, 'prepare'));
    await mounter.click(confirm(host));

    expect(host.querySelector('[data-admin-confirm-error]')?.textContent).toBe('Le serveur n’a pas pu effectuer le geste.');
    expect(badge(host)).toBe('Brouillon');
    expect(reads(fake).length).toBeGreaterThan(readsBefore);
    expect(host.querySelector('[data-admin-confirm]')).not.toBeNull();
  });

  test('annuler la confirmation ne change rien', async () => {
    const fake = fakeServer();
    const host = await open(fake);
    await mounter.click(gesture(host, 'prepare'));

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-confirm] [data-admin-action="cancel"]'));

    expect(host.querySelector('[data-admin-confirm]')).toBeNull();
    expect(writes(fake)).toEqual([]);
  });
});

describe('envoyer par e-mail', () => {
  test('la confirmation dit l’audience, le nombre de comptes et que l’envoi ne s’annule pas', async () => {
    const host = await open(fakeServer({ broadcast: servedReadyBroadcast() }));

    await mounter.click(gesture(host, 'send'));

    const body = confirmBody(host);
    expect(body).toContain('Comptes actifs, en français et espagnol');
    expect(body).toMatch(/Comptes visés : 1\s204/);
    expect(body).toContain('ne peut pas être annulé');
    expect(confirm(host)?.textContent).toBe('Envoyer');
  });

  test('confirmer : POST send, statut « Envoi en cours » IMMÉDIATEMENT (optimiste), puis relu du serveur, annoncé', async () => {
    let release: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fake = fakeServer({ broadcast: servedReadyBroadcast(), hold: { [`POST ${adminEndpoints.broadcastsByIdSend(ID)}`]: hold } });
    const host = await open(fake);
    await mounter.click(gesture(host, 'send'));

    await mounter.click(confirm(host));

    expect(badge(host)).toBe('Envoi en cours');
    expect(offered(host)).toEqual([]);
    await act(async () => {
      release();
      await hold;
    });
    await mounter.settle();

    const call = writes(fake)[0];
    expect(call?.method).toBe('POST');
    expect(call?.path).toBe(adminEndpoints.broadcastsByIdSend(ID));
    expect(badge(host)).toBe('Envoi en cours');
    expect(meta(section(host, 'people') ?? host, 'sentBy')).toContain('Léa Moreau');
    expect(announcement(host)).toBe('Envoi par e-mail lancé');
  });

  test('refus : retour arrière — la diffusion redevient Prête — et le refus est dit en mots', async () => {
    const fake = fakeServer({
      broadcast: servedReadyBroadcast(),
      fail: { [`POST ${adminEndpoints.broadcastsByIdSend(ID)}`]: { ok: false, status: 400, error: 'Le broadcast doit etre en statut READY pour etre envoye.' } },
    });
    const host = await open(fake);
    await mounter.click(gesture(host, 'send'));

    await mounter.click(confirm(host));

    expect(badge(host)).toBe('Prête à l’envoi');
    expect(host.querySelector('[data-admin-confirm-error]')?.textContent).toContain('doit etre en statut READY');
    expect(offered(host)).toEqual(['send', 'publishInApp', 'delete']);
  });
});

describe('publier dans l’application', () => {
  test('la confirmation dit l’audience, le nombre de comptes, le push, et que ça ne se publie qu’une fois', async () => {
    const host = await open(fakeServer({ broadcast: servedReadyBroadcast() }));

    await mounter.click(gesture(host, 'publishInApp'));

    const body = confirmBody(host);
    expect(body).toMatch(/Comptes visés : 1\s204/);
    expect(body).toContain('push');
    expect(body).toContain('qu’une fois');
  });

  test('confirmer : POST send-inapp, publication « en cours » immédiatement, le geste disparaît, l’action est annoncée', async () => {
    const fake = fakeServer({ broadcast: servedReadyBroadcast() });
    const host = await open(fake);
    await mounter.click(gesture(host, 'publishInApp'));

    await mounter.click(confirm(host));

    const call = writes(fake)[0];
    expect(call?.method).toBe('POST');
    expect(call?.path).toBe(adminEndpoints.broadcastsByIdSendInapp(ID));
    expect(offered(host)).toEqual(['send', 'delete']);
    expect(meta(section(host, 'in-app') ?? host, 'inAppState')).toContain('Publication en cours');
    expect(announcement(host)).toBe('Publication dans l’application lancée');
  });

  test('refus : retour arrière — le geste revient —, refus dit en mots', async () => {
    const fake = fakeServer({
      broadcast: servedReadyBroadcast(),
      fail: { [`POST ${adminEndpoints.broadcastsByIdSendInapp(ID)}`]: { ok: false, status: 403, error: 'Interdit' } },
    });
    const host = await open(fake);
    await mounter.click(gesture(host, 'publishInApp'));

    await mounter.click(confirm(host));

    expect(host.querySelector('[data-admin-confirm-error]')?.textContent).toBe('Vous n’avez pas le droit d’effectuer ce geste.');
    expect(meta(section(host, 'in-app') ?? host, 'inAppState')).toContain('Pas encore publiée');
    expect(offered(host)).toEqual(['send', 'publishInApp', 'delete']);
  });
});

describe('supprimer', () => {
  test('la confirmation dit ce qui disparaît et que rien n’a été envoyé', async () => {
    const host = await open(fakeServer());

    await mounter.click(gesture(host, 'delete'));

    expect(confirmBody(host)).toContain('supprimées définitivement');
    expect(confirmBody(host)).toContain('Rien n’a été envoyé par e-mail');
    expect(confirm(host)?.textContent).toBe('Supprimer la diffusion');
  });

  test('une diffusion déjà publiée dans l’application dit que ses notifications ne sont pas retirées', async () => {
    const host = await open(fakeServer({ broadcast: servedReadyBroadcast({ inAppSentAt: '2026-09-29T13:00:00.000Z', inAppCompletedAt: '2026-09-29T13:05:00.000Z' }) }));

    await mounter.click(gesture(host, 'delete'));

    expect(confirmBody(host)).toContain('notifications déjà publiées dans l’application ne sont pas retirées');
  });

  test('confirmer : DELETE, puis retour à la liste de l’espace courant', async () => {
    const fake = fakeServer();
    const host = await open(fake);
    await mounter.click(gesture(host, 'delete'));

    await mounter.click(confirm(host));

    const call = writes(fake)[0];
    expect(call?.method).toBe('DELETE');
    expect(call?.path).toBe(adminEndpoints.broadcastsById(ID));
    expect(window.location.pathname).toBe('/admin/broadcasts');
  });

  test('dans l’espace /adm, le retour est la liste de /adm', async () => {
    const fake = fakeServer();
    const host = await open(fake, { url: `/adm/broadcasts/${ID}` });
    await mounter.click(gesture(host, 'delete'));

    await mounter.click(confirm(host));

    expect(window.location.pathname).toBe('/adm/broadcasts');
  });

  test('un refus laisse la diffusion en place et le dit', async () => {
    const fake = fakeServer({ fail: { [`DELETE ${adminEndpoints.broadcastsById(ID)}`]: { ok: false, status: 400, error: 'Seuls les broadcasts en statut DRAFT ou READY peuvent etre supprimes' } } });
    const host = await open(fake);
    await mounter.click(gesture(host, 'delete'));

    await mounter.click(confirm(host));

    expect(host.querySelector('[data-admin-confirm-error]')?.textContent).toContain('DRAFT ou READY');
    expect(window.location.pathname).toBe(`/admin/broadcasts/${ID}`);
  });
});

describe('modifier un brouillon', () => {
  test('la feuille s’ouvre avec le contenu ET le ciblage enregistrés', async () => {
    const host = await open(fakeServer({ broadcast: servedBroadcast({ targeting: { activityStatus: 'inactive', inactiveDays: 60, languages: ['es'], countries: ['SN'] } }) }));

    await mounter.click(gesture(host, 'edit'));

    const sheet = host.querySelector('[data-admin-compose="edit"]');
    expect(sheet).not.toBeNull();
    expect(host.querySelector('dialog h2')?.textContent).toBe('Modifier le brouillon');
    expect(sheet?.querySelector<HTMLInputElement>('[id$="-name"]')?.value).toBe('Lancement de l’automne');
    expect(sheet?.querySelector<HTMLInputElement>('[id$="-subject"]')?.value).toBe('Nouveautés de septembre');
    expect(sheet?.querySelector<HTMLTextAreaElement>('[id$="-body"]')?.value).toBe('Bonjour,\nvoici ce qui change ce mois-ci.');
    expect(sheet?.querySelector<HTMLSelectElement>('[id$="-activity"]')?.value).toBe('inactive');
    expect(sheet?.querySelector<HTMLInputElement>('[id$="-inactiveDays"]')?.value).toBe('60');
    expect(sheet?.querySelector('[data-admin-choice-option="es"]')?.getAttribute('data-admin-choice-option')).toBe('es');
    expect((sheet?.querySelector('[data-admin-choice="languages"] [data-admin-choice-option="es"]') as HTMLInputElement | null)?.checked).toBe(true);
    expect((sheet?.querySelector('[data-admin-choice="countries"] [data-admin-choice-option="SN"]') as HTMLInputElement | null)?.checked).toBe(true);
  });

  test('enregistrer : PUT du corps exact, la feuille se ferme, la fiche montre la modification, annoncé', async () => {
    const fake = fakeServer();
    const host = await open(fake);
    await mounter.click(gesture(host, 'edit'));
    mounter.type(host, '[id$="-subject"]', 'Nouvel objet');

    await mounter.submit(host);

    const call = writes(fake)[0];
    expect(call?.method).toBe('PUT');
    expect(call?.path).toBe(adminEndpoints.broadcastsById(ID));
    expect(call?.body).toEqual({
      name: 'Lancement de l’automne',
      subject: 'Nouvel objet',
      body: 'Bonjour,\nvoici ce qui change ce mois-ci.',
      sourceLanguage: 'fr',
      targeting: { activityStatus: 'active', languages: ['fr', 'es'], countries: ['SN', 'FR'] },
    });
    expect(host.querySelector('[data-admin-compose]')).toBeNull();
    expect(section(host, 'content')?.querySelector('[data-admin-subject]')?.textContent).toBe('Nouvel objet');
    expect(announcement(host)).toBe('Modifications enregistrées');
  });

  test('un champ vidé est refusé sous son champ, sans appel', async () => {
    const fake = fakeServer();
    const host = await open(fake);
    await mounter.click(gesture(host, 'edit'));
    mounter.type(host, '[id$="-name"]', '');

    await mounter.submit(host);

    expect(writes(fake)).toEqual([]);
    expect([...host.querySelectorAll('[data-admin-field-error]')].map((error) => error.textContent)).toEqual(['Donnez un nom à la diffusion.']);
  });

  test('un refus de la passerelle se dit dans la feuille, qui reste ouverte', async () => {
    const fake = fakeServer({ fail: { [`PUT ${adminEndpoints.broadcastsById(ID)}`]: { ok: false, status: 400, error: 'Seuls les broadcasts en statut DRAFT peuvent etre modifies' } } });
    const host = await open(fake);
    await mounter.click(gesture(host, 'edit'));

    await mounter.submit(host);

    expect(host.querySelector('[data-admin-compose-error]')?.textContent).toContain('statut DRAFT');
    expect(host.querySelector('[data-admin-compose="edit"]')).not.toBeNull();
  });
});

describe('les états', () => {
  test('en vol, un squelette tient la place — jamais un spinner', async () => {
    const transport = { request: () => new Promise<ApiResult<unknown>>(() => undefined) } as unknown as HttpTransport;
    const host = await open({ deps: { source: 'gateway', transport }, calls: [], state: { broadcast: {} } });

    expect(host.querySelector('[data-admin-broadcast-loading]')).not.toBeNull();
    expect(host.querySelector('[data-admin-broadcast-loading]')?.getAttribute('aria-busy')).toBe('true');
  });

  test('une diffusion qui n’existe plus se dit, avec le chemin du retour', async () => {
    const transport = { request: async () => ({ ok: false, status: 404, error: 'Broadcast non trouve' }) } as unknown as HttpTransport;
    const host = await open({ deps: { source: 'gateway', transport }, calls: [], state: { broadcast: {} } });

    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Cette diffusion n’existe plus');
    expect(host.querySelector('[data-admin-link="back-to-list"]')?.getAttribute('href')).toBe('/admin/broadcasts');
  });

  test('un 403 se rend comme un refus, pas comme une panne', async () => {
    const transport = { request: async () => ({ ok: false, status: 403, error: 'Interdit' }) } as unknown as HttpTransport;
    const host = await open({ deps: { source: 'gateway', transport }, calls: [], state: { broadcast: {} } });

    expect(host.querySelector('[data-admin-error]')).toBeNull();
    expect(host.textContent).toContain('réservé');
  });

  test('une panne se dit et se relance', async () => {
    let calls = 0;
    const transport = {
      request: async () => {
        calls += 1;
        return calls === 1 ? { ok: false, status: 500, error: 'Panne' } : resultatServi(servedBroadcast());
      },
    } as unknown as HttpTransport;
    const host = await open({ deps: { source: 'gateway', transport }, calls: [], state: { broadcast: {} } });

    expect(host.querySelector('[data-admin-error]')).not.toBeNull();
    await mounter.click(host.querySelector<HTMLElement>('[data-admin-retry]'));
    expect(host.querySelector('[data-admin-broadcast-fiche]')).not.toBeNull();
  });

  test('sans la capacité de gérer les notifications, la fiche ne s’ouvre pas et ne lit rien', async () => {
    const fake = fakeServer();
    const host = await open(fake, { identity: adminIdentityFixture({ role: 'MODERATOR' }) });

    expect(host.querySelector('[data-admin-broadcast-fiche]')).toBeNull();
    expect(fake.calls).toEqual([]);
  });

  test('une charge illisible est une panne, pas une fiche vide', async () => {
    const transport = { request: async () => resultatServi({ nope: true }) } as unknown as HttpTransport;
    const host = await open({ deps: { source: 'gateway', transport }, calls: [], state: { broadcast: {} } });

    expect(host.querySelector('[data-admin-error]')).not.toBeNull();
  });
});
