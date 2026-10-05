import { describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { AdminDeps } from '@/lib/api/admin';
import type { HttpRequest } from '@/lib/api/http';
import { expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { typeInto } from '@/test-support/act-mount';
import { pathOf, routedTransport, type RoutedReply } from '@/test-support/routed-transport';

import { AdminUserBanSheet } from './admin-user-ban-sheet';

/**
 * **L'HISTORIQUE DES BANNISSEMENTS, NOMMÉ** (#6819, #8876) — qui a banni, qui a levé (ou
 * « le système » quand l'échéance l'a fait), jusqu'à quand, pourquoi : un administrateur
 * se reconnaît à son nom, jamais à un identifiant. Seul un ban en vigueur offre « Lever ».
 */
const { mount, mounter } = setupAdminKitTests({ languages: ['fr', 'en'] });

const USER = '64f1c2a9e8b7d6c5b4a39281';
const ADMIN_ONE = { id: '64f1c2a9e8b7d6c5b4a39282', username: 'jcnm', displayName: 'Jean-Claude', avatar: null };
const ADMIN_TWO = { id: '64f1c2a9e8b7d6c5b4a39283', username: 'awa', displayName: '', avatar: null };

const BANS = [
  { id: 'b-active', reason: 'Spam répété', active: true, createdAt: '2026-09-29T12:00:00.000Z', expiresAt: null, liftedAt: null, liftReason: null, bannedBy: ADMIN_ONE, liftedBy: null, liftedBySystem: false },
  {
    id: 'b-lifted',
    reason: 'Insultes',
    active: false,
    createdAt: '2026-08-01T12:00:00.000Z',
    expiresAt: '2026-12-01T12:00:00.000Z',
    liftedAt: '2026-08-15T12:00:00.000Z',
    liftReason: 'Excuses présentées',
    bannedBy: ADMIN_ONE,
    liftedBy: ADMIN_TWO,
    liftedBySystem: false,
  },
  { id: 'b-system', reason: 'Fraude', active: false, createdAt: '2026-06-01T12:00:00.000Z', expiresAt: '2026-06-08T12:00:00.000Z', liftedAt: '2026-06-08T12:00:00.000Z', liftReason: null, bannedBy: null, liftedBy: null, liftedBySystem: true },
];

const bans: RoutedReply = (request: HttpRequest) => (request.method === 'GET' && pathOf(request) === `/api/v1/admin/users/${USER}/bans` ? { ok: true, data: BANS } : undefined);

async function open() {
  const gateway = routedTransport(bans);
  const deps: AdminDeps = { source: 'gateway', transport: gateway.transport };
  await mount(<AdminUserBanSheet userId={USER} language="fr" onClose={() => undefined} onAnnounce={() => undefined} deps={deps} />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  await mounter.settle();
  return document.body;
}

const row = (id: string) => document.querySelector(`[data-admin-ban="${id}"]`);
const textOf = (element: Element | null) => (element?.textContent ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();

describe('l’historique des bannissements', () => {
  test('qui a banni se dit par son nom, l’échéance ou « permanent » aussi', async () => {
    await open();
    const active = textOf(row('b-active'));
    expect(active).toContain('Spam répété');
    expect(active).toContain('En vigueur');
    expect(active).toContain('Banni par Jean-Claude le');
    expect(active).toContain('Bannissement permanent');
    expect(textOf(row('b-lifted'))).toContain('Jusqu’au');
  });

  test('qui a levé se dit par son nom (le pseudo à défaut de nom affiché), avec le motif de la levée', async () => {
    await open();
    const lifted = textOf(row('b-lifted'));
    expect(lifted).toContain('Levé par @awa le');
    expect(lifted).toContain('motif de la levée : Excuses présentées');
    expect(lifted).toContain('Levé');
  });

  test('une levée sans administrateur est celle du SYSTÈME ; un ban expiré n’est pas un ban levé', async () => {
    await open();
    const system = textOf(row('b-system'));
    expect(system).toContain('Levé automatiquement par le système le');
    expect(system).toContain('Fraude');
    expect(system).not.toContain('Banni par');
  });

  test('seul un ban en vigueur offre « Lever »', async () => {
    await open();
    expect(row('b-active')?.querySelector('button')).not.toBeNull();
    expect(row('b-lifted')?.querySelector('button')).toBeNull();
    expect(row('b-system')?.querySelector('button')).toBeNull();
  });

  test('aucun identifiant ni ISO brut dans l’historique', async () => {
    await open();
    expectNoRawIdentifiers(document.body);
  });
});

/**
 * **BANNIR : L'ÉCHÉANCE ET LA CONSERVATION DE LA SAISIE** (#8876) — `new Date('AAAA-MM-JJ')`
 * lit la date en MINUIT UTC : « aujourd'hui » donnait toujours une échéance déjà passée,
 * refusée sans raison affichée ; et la feuille effaçait le motif et la date même quand le
 * bannissement échouait. Le champ n'offre plus que DEMAIN et après, lit la date en heure
 * locale (la FIN du jour choisi), refuse le reste ICI et le dit sous le champ.
 */
describe('bannir — l’échéance se lit en heure locale et la saisie survit à un refus', () => {
  /* Le 30 septembre 2026 à midi, HEURE LOCALE — « demain » est le 2026-10-01 quel que soit le fuseau. */
  const NOW = () => new Date(2026, 8, 30, 12, 0, 0);

  const banPath = `/api/v1/admin/users/${USER}/ban`;
  const posted = (calls: () => readonly HttpRequest[]) => calls().filter((call) => call.method === 'POST' && pathOf(call) === banPath);

  async function openBan(options: { readonly ban: RoutedReply; readonly language?: 'fr' | 'en' }) {
    const gateway = routedTransport(bans, options.ban);
    const deps: AdminDeps = { source: 'gateway', transport: gateway.transport };
    await mount(
      <AdminUserBanSheet userId={USER} language={options.language ?? 'fr'} onClose={() => undefined} onAnnounce={() => undefined} deps={deps} now={NOW} />,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    await mounter.settle();
    return gateway;
  }

  const reason = () => document.querySelector<HTMLInputElement>('[data-admin-ban-reason]');
  const until = () => document.querySelector<HTMLInputElement>('[data-admin-ban-until]');
  const untilError = () => document.querySelector('[data-admin-ban-until-error]');
  const apply = async () => {
    const button = [...document.querySelectorAll('button')].find((candidate) => (candidate.textContent ?? '').includes('Bannir'));
    await act(async () => button?.click());
    await mounter.settle();
  };

  const refuse: RoutedReply = (request) => (request.method === 'POST' && pathOf(request) === banPath ? { ok: false, status: 500, error: 'boom' } : undefined);
  const accept: RoutedReply = (request) => (request.method === 'POST' && pathOf(request) === banPath ? { ok: true, data: BANS } : undefined);

  test('le champ n’offre que demain et après (min), en heure locale', async () => {
    await openBan({ ban: accept });
    expect(until()?.getAttribute('min')).toBe('2026-10-01');
  });

  test('« aujourd’hui » est refusé ICI avec la phrase traduite, sans aller-retour, et la saisie reste', async () => {
    const gateway = await openBan({ ban: accept });
    typeInto(reason(), 'Spam répété');
    typeInto(until(), '2026-09-30');
    await mounter.settle();
    await apply();

    expect(posted(gateway.calls)).toHaveLength(0);
    expect(textOf(untilError())).toContain('à partir de demain');
    expect(untilError()?.getAttribute('role')).toBe('alert');
    expect(until()?.getAttribute('aria-invalid')).toBe('true');
    expect(reason()?.value).toBe('Spam répété');
    expect(until()?.value).toBe('2026-09-30');
  });

  test('le refus se dit dans la langue du lecteur', async () => {
    await openBan({ ban: accept, language: 'en' });
    typeInto(reason(), 'Repeated spam');
    typeInto(until(), '2026-09-29');
    await mounter.settle();
    const button = [...document.querySelectorAll('button')].find((candidate) => (candidate.textContent ?? '').includes('Ban'));
    await act(async () => button?.click());
    await mounter.settle();

    expect(textOf(untilError())).toContain('Pick a date from tomorrow on');
  });

  test('choisir une autre date efface le refus', async () => {
    await openBan({ ban: accept });
    typeInto(reason(), 'Spam répété');
    typeInto(until(), '2026-09-30');
    await mounter.settle();
    await apply();
    expect(untilError()).not.toBeNull();

    typeInto(until(), '2026-10-05');
    await mounter.settle();
    expect(untilError()).toBeNull();
  });

  test('un bannissement REFUSÉ par la passerelle garde le motif ET la date saisis', async () => {
    const gateway = await openBan({ ban: refuse });
    typeInto(reason(), 'Spam répété');
    typeInto(until(), '2026-10-05');
    await mounter.settle();
    await apply();

    expect(posted(gateway.calls)).toHaveLength(1);
    expect(reason()?.value).toBe('Spam répété');
    expect(until()?.value).toBe('2026-10-05');
  });

  test('un bannissement RÉUSSI efface les deux champs, et l’échéance part comme la FIN du jour choisi en heure locale', async () => {
    const gateway = await openBan({ ban: accept });
    typeInto(reason(), 'Spam répété');
    typeInto(until(), '2026-10-05');
    await mounter.settle();
    await apply();

    const [call] = posted(gateway.calls);
    expect((call?.body as { expiresAt?: string }).expiresAt).toBe(new Date(2026, 9, 5, 23, 59, 59, 999).toISOString());
    expect(reason()?.value).toBe('');
    expect(until()?.value).toBe('');
  });

  test('sans date, le bannissement est PERMANENT : aucune échéance n’est envoyée', async () => {
    const gateway = await openBan({ ban: accept });
    typeInto(reason(), 'Fraude avérée');
    await mounter.settle();
    await apply();

    const [call] = posted(gateway.calls);
    expect(call?.body).toEqual({ reason: 'Fraude avérée' });
  });
});
