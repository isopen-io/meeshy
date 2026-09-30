import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { AdminSectionScreen } from '@/components/admin/section-screen';
import { OBJECT_ID, servedBroadcast, servedBroadcastRow } from '@/lib/admin/broadcast-fixtures';
import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { createRouter, navigate } from '@/lib/router';
import { typeInto } from '@/test-support/act-mount';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { resultatServi } from '@/test-support/served-pagination';

import { AdminBroadcastsPanel } from './admin-broadcasts';

/**
 * **LA LISTE DES DIFFUSIONS** (#8876, #6731) — nommée, filtrée et cherchée dans
 * l'adresse, paginée ; chaque rangée ouvre sa fiche ; la feuille « Nouvelle
 * diffusion » compose, valide champ par champ, envoie le corps exact et ouvre la
 * fiche ; les états (squelette, vide, vide filtré, erreur, refus) sont dessinés.
 */

const { mount, mounter } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const NOW = new Date('2026-09-30T12:00:00.000Z');

type Handler = (request: HttpRequest) => ApiResult<unknown> | Promise<ApiResult<unknown>>;

function scripted(handlers: { readonly list: Handler; readonly create?: Handler }): { readonly deps: AdminDeps; readonly requests: HttpRequest[] } {
  const requests: HttpRequest[] = [];
  const transport = {
    request: async (request: HttpRequest) => {
      requests.push(request);
      if (request.method === 'POST') return (handlers.create ?? (() => resultatServi(servedBroadcast({ id: OBJECT_ID(77) }))))(request);
      return handlers.list(request);
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway', transport }, requests };
}

const page = (broadcasts: readonly unknown[], total = broadcasts.length, hasMore = false, offset = 0) =>
  resultatServi({ data: { broadcasts, pagination: { total, offset, limit: 20, hasMore } } });

const ROWS = [
  servedBroadcastRow({ id: OBJECT_ID(1), name: 'Brouillon d’automne', subject: 'Objet du brouillon', status: 'DRAFT' }),
  servedBroadcastRow({ id: OBJECT_ID(2), name: 'Annonce prête', subject: 'Objet prêt', status: 'READY', totalRecipients: 1204 }),
  servedBroadcastRow({
    id: OBJECT_ID(3),
    name: 'Envoi en vol',
    subject: 'Objet en vol',
    status: 'SENDING',
    totalRecipients: 500,
    sentCount: 120,
    failedCount: 3,
    sentAt: '2026-09-30T11:00:00.000Z',
  }),
  servedBroadcastRow({
    id: OBJECT_ID(4),
    name: 'Bilan d’été',
    subject: 'Objet envoyé',
    status: 'SENT',
    totalRecipients: 900,
    sentCount: 880,
    failedCount: 7,
    sentAt: '2026-09-28T09:00:00.000Z',
    inAppSentCount: 866,
    inAppSentAt: '2026-09-28T10:00:00.000Z',
  }),
  servedBroadcastRow({ id: OBJECT_ID(5), name: 'Relance ratée', subject: 'Objet raté', status: 'FAILED', totalRecipients: 40, sentCount: 0, failedCount: 40, sentAt: '2026-09-27T09:00:00.000Z' }),
];

function Screen({ deps }: { readonly deps: AdminDeps }) {
  return (
    <AdminSectionScreen section="broadcasts" language="fr" title="Diffusions">
      {() => <AdminBroadcastsPanel language="fr" deps={deps} now={() => NOW} />}
    </AdminSectionScreen>
  );
}

async function open(deps: AdminDeps, url = '/admin/broadcasts', identity = BIGBOSS) {
  const key = url.startsWith('/adm/') ? 'admBroadcasts' : 'adminBroadcasts';
  const pattern = url.startsWith('/adm/') ? '/adm/broadcasts' : '/admin/broadcasts';
  const { Router } = createRouter({ [key]: { pattern, screen: async () => ({ default: () => <Screen deps={deps} /> }) } }, () => <p>absent</p>);
  navigate(url, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, identity);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-broadcasts]') === null && host.textContent?.includes('Espace réservé') !== true; attempt += 1) {
    await mounter.settle();
  }
  await mounter.settle();
  return host;
}

const rowIds = (host: ParentNode) => [...host.querySelectorAll('[data-admin-row]')].map((row) => row.getAttribute('data-admin-row'));
const cell = (host: ParentNode, id: string, column: number) => host.querySelector(`[data-admin-row="${id}"] td:nth-child(${column})`)?.textContent ?? '';
const waitForSearch = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 320));
  });

describe('la liste — nommée, jamais par identifiant', () => {
  test('chaque diffusion dit son nom, son objet, son statut et où en est sa livraison', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    expect(rowIds(host)).toEqual(ROWS.map((row) => row.id));
    const text = host.querySelector('table')?.textContent ?? '';
    for (const expected of ['Brouillon d’automne', 'Objet du brouillon', 'Annonce prête', 'Envoi en vol', 'Bilan d’été', 'Relance ratée']) {
      expect(text).toContain(expected);
    }
    for (const status of ['Brouillon', 'Prête à l’envoi', 'Envoi en cours', 'Envoyée', 'Échec']) {
      expect(text).toContain(status);
    }
    expectNoRawIdentifiers(host);
  });

  test('les colonnes servies, dans l’ordre : nom, objet, statut, destinataires, envoyés, échecs, dans l’application, création, envoi', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    const headers = [...host.querySelectorAll('thead th')].map((th) => th.textContent?.trim());
    expect(headers).toEqual(['Nom', 'Objet', 'Statut', 'Destinataires', 'Envoyés', 'Échecs', 'Dans l’application', 'Création', 'Envoi']);
  });

  test('un brouillon n’a ni destinataires ni envoi : des tirets, jamais zéro', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    expect(cell(host, OBJECT_ID(1), 4)).toBe('—');
    expect(cell(host, OBJECT_ID(1), 5)).toBe('—');
    expect(cell(host, OBJECT_ID(1), 6)).toBe('—');
    expect(cell(host, OBJECT_ID(1), 9)).toContain('Pas encore');
  });

  test('une diffusion en cours ou terminée dit ses comptes, formatés', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    expect(cell(host, OBJECT_ID(2), 4)).toMatch(/1\s204/);
    expect(cell(host, OBJECT_ID(3), 5)).toBe('120');
    expect(cell(host, OBJECT_ID(3), 6)).toBe('3');
    expect(cell(host, OBJECT_ID(4), 7)).toBe('866');
  });

  test('la publication dans l’application se dit en mots tant qu’elle n’a pas eu lieu', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    expect(cell(host, OBJECT_ID(2), 7)).toBe('Non publiée');
    expect(cell(host, OBJECT_ID(4), 7)).toBe('866');
  });

  test('chaque rangée ouvre SA fiche, dans l’espace courant', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    const links = [...host.querySelectorAll('[data-admin-row] td a')].filter((link) => link.getAttribute('href')?.startsWith('/admin/broadcasts/'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual(ROWS.map((row) => `/admin/broadcasts/${row.id}`));
  });

  test('dans l’espace /adm, les fiches restent dans /adm', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps, '/adm/broadcasts');

    const links = [...host.querySelectorAll('[data-admin-row] td a')].map((link) => link.getAttribute('href'));
    expect(links.every((href) => href?.startsWith('/adm/broadcasts/'))).toBe(true);
  });

  test('aucune colonne n’est triable : la passerelle range par création', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    expect(host.querySelector('thead [aria-sort]')).toBeNull();
    expect(host.querySelector('thead button')).toBeNull();
  });
});

describe('filtre, recherche et pagination', () => {
  test('le filtre de statut est dans l’adresse ET transmis à la passerelle', async () => {
    const { deps, requests } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    typeInto(host.querySelector<HTMLSelectElement>('[data-admin-filter="status"]'), 'SENT');
    await mounter.settle();

    expect(window.location.search).toBe('?status=SENT');
    expect(requests.at(-1)?.path).toContain('status=SENT');
    const labels = [...(host.querySelector<HTMLSelectElement>('[data-admin-filter="status"]')?.options ?? [])].map((option) => option.textContent);
    expect(labels).toEqual(['Tous', 'Brouillon', 'Traduction en cours', 'Prête à l’envoi', 'Envoi en cours', 'Envoyée', 'Échec']);
  });

  test('l’adresse pose le filtre au chargement', async () => {
    const { deps, requests } = scripted({ list: () => page(ROWS) });
    const host = await open(deps, '/admin/broadcasts?status=FAILED');

    expect(host.querySelector<HTMLSelectElement>('[data-admin-filter="status"]')?.value).toBe('FAILED');
    expect(requests[0]?.path).toContain('status=FAILED');
  });

  test('la recherche (nom, objet) s’écrit dans l’adresse après une courte pause et part à la passerelle', async () => {
    const { deps, requests } = scripted({ list: () => page(ROWS) });
    const host = await open(deps);

    mounter.type(host, '[data-admin-search]', 'automne');
    await waitForSearch();
    await mounter.settle();

    expect(window.location.search).toBe('?q=automne');
    expect(requests.at(-1)?.path).toContain('search=automne');
  });

  test('« Suivants » demande la page suivante, « Réinitialiser » revient à la première', async () => {
    const { deps, requests } = scripted({ list: (request) => (request.path.includes('offset=20') ? page([ROWS[0]], 21, false, 20) : page(ROWS, 21, true)) });
    const host = await open(deps);

    expect(host.querySelector('[data-admin-list-range]')?.textContent).toContain('1');
    await mounter.click(host.querySelector<HTMLElement>('[data-admin-list-next]'));
    expect(window.location.search).toBe('?offset=20');
    expect(requests.at(-1)?.path).toContain('offset=20');
    expect(host.querySelector('[data-admin-list-range]')?.textContent).toMatch(/21/);
  });

  test('le nombre de diffusions se lit dans la barre', async () => {
    const { deps } = scripted({ list: () => page(ROWS, 41, true) });
    const host = await open(deps);

    expect(host.querySelector('[data-admin-toolbar-count]')?.textContent).toMatch(/41 diffusions/);
  });

  test('une seule diffusion se dit au singulier', async () => {
    const { deps } = scripted({ list: () => page([ROWS[0]], 1) });
    const host = await open(deps);

    expect(host.querySelector('[data-admin-toolbar-count]')?.textContent).toBe('1 diffusion');
  });
});

describe('les états', () => {
  test('aucune diffusion : l’état vide dit quoi faire', async () => {
    const { deps } = scripted({ list: () => page([]) });
    const host = await open(deps);

    const empty = host.querySelector('[data-admin-empty]');
    expect(empty?.textContent).toContain('Aucune diffusion pour l’instant');
    expect(empty?.textContent).toContain('brouillon');
  });

  test('aucun résultat pour un filtre : l’état vide filtré et « Réinitialiser »', async () => {
    const { deps } = scripted({ list: (request) => (request.path.includes('status=FAILED') ? page([]) : page(ROWS)) });
    const host = await open(deps, '/admin/broadcasts?status=FAILED');

    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Aucune diffusion pour ces filtres');
    await mounter.click(host.querySelector<HTMLElement>('[data-admin-empty] [data-admin-list-reset]'));
    expect(window.location.search).toBe('');
  });

  test('en vol, le squelette tient la place — jamais un spinner', async () => {
    const { deps } = scripted({ list: () => new Promise<ApiResult<unknown>>(() => undefined) });
    const host = await open(deps);

    expect(host.querySelector('[data-admin-list-skeleton]')).not.toBeNull();
    expect(host.querySelector('[role="progressbar"]')).toBeNull();
  });

  test('une panne se dit et se relance', async () => {
    let calls = 0;
    const { deps } = scripted({
      list: () => {
        calls += 1;
        return calls === 1 ? { ok: false, status: 500, error: 'Panne' } : page(ROWS);
      },
    });
    const host = await open(deps);

    expect(host.querySelector('[data-admin-error]')).not.toBeNull();
    await mounter.click(host.querySelector<HTMLElement>('[data-admin-retry]'));
    expect(rowIds(host)).toHaveLength(ROWS.length);
  });

  test('un 403 malgré tout se rend comme un refus, pas comme une panne', async () => {
    const { deps } = scripted({ list: () => ({ ok: false, status: 403, error: 'Interdit' }) });
    const host = await open(deps);

    expect(host.querySelector('[data-admin-error]')).toBeNull();
    expect(host.textContent).toContain('réservé');
  });

  test('sans la capacité de gérer les notifications, l’écran ne s’ouvre pas et ne lit rien', async () => {
    const { deps, requests } = scripted({ list: () => page(ROWS) });
    const host = await open(deps, '/admin/broadcasts', adminIdentityFixture({ role: 'MODERATOR' }));

    expect(host.querySelector('[data-admin-broadcasts]')).toBeNull();
    expect(host.querySelector('[data-admin-list]')).toBeNull();
    expect(requests).toEqual([]);
  });

  test('l’identité est sans permission : fail-closed', async () => {
    const { deps, requests } = scripted({ list: () => page(ROWS) });
    await open(deps, '/admin/broadcasts', adminIdentityFixture({ role: 'BIGBOSS', permissions: { canManageNotifications: false } }));

    expect(requests).toEqual([]);
  });
});

describe('« Nouvelle diffusion » — la feuille de composition', () => {
  const openComposer = async (deps: AdminDeps, url = '/admin/broadcasts') => {
    const host = await open(deps, url);
    await mounter.click(host.querySelector<HTMLElement>('[data-admin-action="new"]'));
    return host;
  };

  const fill = (host: ParentNode) => {
    const field = (suffix: string) => host.querySelector<HTMLInputElement>(`[id$="-${suffix}"]`);
    typeInto(field('name'), 'Lancement');
    typeInto(field('subject'), 'Nouveautés');
    mounter.type(host, '[id$="-body"]', 'Bonjour à tous');
  };

  test('l’action d’en-tête existe ; la feuille s’ouvre avec ses champs nommés', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await openComposer(deps);

    const sheet = host.querySelector('[data-admin-compose="create"]');
    expect(sheet).not.toBeNull();
    const labels = [...(sheet?.querySelectorAll('label') ?? [])].map((label) => label.textContent ?? '');
    for (const expected of ['Nom de la diffusion', 'Langue du message', 'Objet', 'Message', 'Activité des comptes']) {
      expect(labels.some((label) => label.includes(expected))).toBe(true);
    }
    expect(host.querySelector('dialog h2')?.textContent).toBe('Nouvelle diffusion');
  });

  test('la langue du message est NOMMÉE, jamais un code', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await openComposer(deps);

    const select = host.querySelector<HTMLSelectElement>('[id$="-sourceLanguage"]');
    const options = [...(select?.options ?? [])].map((option) => option.textContent ?? '');
    expect(options).toContain('Français');
    expect(options).toContain('Espagnol');
    expect(options.some((label) => /^[a-z]{2}$/.test(label))).toBe(false);
    expect(select?.value).toBe('fr');
  });

  test('envoyer un formulaire vide dit CHAQUE erreur sous son champ, et n’envoie rien', async () => {
    const { deps, requests } = scripted({ list: () => page(ROWS) });
    const host = await openComposer(deps);

    await mounter.submit(host);

    expect(requests.filter((request) => request.method === 'POST')).toEqual([]);
    const errors = [...host.querySelectorAll('[data-admin-field-error]')].map((error) => error.textContent);
    expect(errors).toEqual(['Donnez un nom à la diffusion.', 'Écrivez l’objet du message.', 'Écrivez le message.']);
    expect(host.querySelector('[data-admin-compose-summary]')).not.toBeNull();
    expect(host.querySelector('[id$="-name"]')?.getAttribute('aria-invalid')).toBe('true');
  });

  test('l’erreur disparaît dès que le champ est rempli', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await openComposer(deps);
    await mounter.submit(host);

    typeInto(host.querySelector<HTMLInputElement>('[id$="-name"]'), 'Lancement');

    expect([...host.querySelectorAll('[data-admin-field-error]')].map((error) => error.textContent)).not.toContain('Donnez un nom à la diffusion.');
  });

  test('composer : POST du corps exact, puis la fiche de la diffusion créée s’ouvre', async () => {
    const { deps, requests } = scripted({ list: () => page(ROWS), create: () => resultatServi(servedBroadcast({ id: OBJECT_ID(77) })) });
    const host = await openComposer(deps);
    fill(host);

    await mounter.submit(host);

    const post = requests.find((request) => request.method === 'POST');
    expect(post?.path).toBe(adminEndpoints.broadcasts);
    expect(post?.body).toEqual({
      name: 'Lancement',
      subject: 'Nouveautés',
      body: 'Bonjour à tous',
      sourceLanguage: 'fr',
      targeting: { activityStatus: 'all' },
    });
    expect(window.location.pathname).toBe(`/admin/broadcasts/${OBJECT_ID(77)}`);
  });

  test('dans l’espace /adm, la fiche créée s’ouvre dans /adm', async () => {
    const { deps } = scripted({ list: () => page(ROWS), create: () => resultatServi(servedBroadcast({ id: OBJECT_ID(78) })) });
    const host = await openComposer(deps, '/adm/broadcasts');
    fill(host);

    await mounter.submit(host);

    expect(window.location.pathname).toBe(`/adm/broadcasts/${OBJECT_ID(78)}`);
  });

  test('le ciblage : activité, durée d’inactivité, langues et pays NOMMÉS, sélection multiple', async () => {
    const { deps, requests } = scripted({ list: () => page(ROWS) });
    const host = await openComposer(deps);
    fill(host);

    typeInto(host.querySelector<HTMLSelectElement>('[id$="-activity"]'), 'inactive');
    typeInto(host.querySelector<HTMLInputElement>('[id$="-inactiveDays"]'), '45');
    await mounter.click(host.querySelector<HTMLElement>('[data-admin-choice="languages"] [data-admin-choice-option="es"]'));
    await mounter.click(host.querySelector<HTMLElement>('[data-admin-choice="languages"] [data-admin-choice-option="en"]'));
    await mounter.click(host.querySelector<HTMLElement>('[data-admin-choice="countries"] [data-admin-choice-option="SN"]'));
    await mounter.click(host.querySelector<HTMLElement>('[data-admin-choice="countries"] [data-admin-choice-option="FR"]'));

    expect(host.querySelector('[data-admin-choice="languages"] [data-admin-choice-count]')?.textContent).toBe('Sélection : 2');
    const preview = host.querySelector('[data-admin-audience-preview]')?.textContent ?? '';
    expect(preview).toContain('Comptes inactifs depuis 45');
    expect(preview).toContain('espagnol et anglais');
    expect(preview).toContain('Sénégal et France');

    await mounter.submit(host);

    expect(requests.find((request) => request.method === 'POST')?.body).toEqual({
      name: 'Lancement',
      subject: 'Nouveautés',
      body: 'Bonjour à tous',
      sourceLanguage: 'fr',
      targeting: { activityStatus: 'inactive', inactiveDays: 45, languages: ['es', 'en'], countries: ['SN', 'FR'] },
    });
  });

  test('une langue ou un pays choisi se retire d’un geste, par son nom', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await openComposer(deps);
    await mounter.click(host.querySelector<HTMLElement>('[data-admin-choice="languages"] [data-admin-choice-option="es"]'));

    const remove = host.querySelector<HTMLElement>('[data-admin-choice="languages"] [data-admin-choice-remove="es"]');
    expect(remove?.getAttribute('aria-label')).toBe('Retirer Espagnol');
    await mounter.click(remove);

    expect(host.querySelector('[data-admin-choice="languages"] [data-admin-choice-remove]')).toBeNull();
    expect(host.querySelector('[data-admin-choice="languages"] [data-admin-choice-count]')?.textContent).toBe('Aucune sélection');
  });

  test('le filtre d’une liste de choix trouve sans accents ni casse', async () => {
    const { deps } = scripted({ list: () => page(ROWS) });
    const host = await openComposer(deps);

    typeInto(host.querySelector<HTMLInputElement>('[data-admin-choice="countries"] [data-admin-choice-filter]'), 'senegal');

    const options = [...host.querySelectorAll('[data-admin-choice="countries"] [data-admin-choice-option]')].map((input) => input.getAttribute('data-admin-choice-option'));
    expect(options).toEqual(['SN']);
    typeInto(host.querySelector<HTMLInputElement>('[data-admin-choice="countries"] [data-admin-choice-filter]'), 'zzzzqq');
    expect(host.querySelector('[data-admin-choice="countries"] [data-admin-choice-empty]')).not.toBeNull();
  });

  test('Entrée dans le filtre d’une liste de choix ne soumet pas le formulaire', async () => {
    const { deps, requests } = scripted({ list: () => page(ROWS) });
    const host = await openComposer(deps);
    fill(host);

    const filter = host.querySelector<HTMLInputElement>('[data-admin-choice="languages"] [data-admin-choice-filter]');
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    await act(async () => {
      filter?.dispatchEvent(enter);
    });

    expect(enter.defaultPrevented).toBe(true);
    expect(requests.filter((request) => request.method === 'POST')).toEqual([]);
  });

  test('une durée d’inactivité fausse est refusée sous son champ', async () => {
    const { deps, requests } = scripted({ list: () => page(ROWS) });
    const host = await openComposer(deps);
    fill(host);
    typeInto(host.querySelector<HTMLSelectElement>('[id$="-activity"]'), 'inactive');
    typeInto(host.querySelector<HTMLInputElement>('[id$="-inactiveDays"]'), 'beaucoup');

    await mounter.submit(host);

    expect(requests.filter((request) => request.method === 'POST')).toEqual([]);
    expect(host.querySelector('[data-admin-field="' + host.querySelector('[id$="-inactiveDays"]')?.id + '"] [data-admin-field-error]')?.textContent).toBe(
      'Indiquez un nombre entier de jours, entre 1 et 3 650.',
    );
  });

  test('un refus de la passerelle se dit dans la feuille, qui reste ouverte et garde la saisie', async () => {
    const { deps } = scripted({ list: () => page(ROWS), create: () => ({ ok: false, status: 400, error: 'Les champs name, subject, body et sourceLanguage sont requis' }) });
    const host = await openComposer(deps);
    fill(host);

    await mounter.submit(host);

    expect(host.querySelector('[data-admin-compose-error]')?.textContent).toContain('sont requis');
    expect(host.querySelector('[data-admin-compose]')).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>('[id$="-name"]')?.value).toBe('Lancement');
    expect(window.location.pathname).toBe('/admin/broadcasts');
  });

  test('annuler referme la feuille sans rien envoyer', async () => {
    const { deps, requests } = scripted({ list: () => page(ROWS) });
    const host = await openComposer(deps);

    await mounter.click(host.querySelector<HTMLElement>('[data-admin-compose] [data-admin-action="cancel"]'));

    expect(host.querySelector('[data-admin-compose]')).toBeNull();
    expect(requests.filter((request) => request.method === 'POST')).toEqual([]);
  });
});
