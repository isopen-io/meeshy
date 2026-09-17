import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { DeletionLink, DeletionResolution } from '@/lib/api/account-deletion';
import type { ApiFailure, ApiResult } from '@/lib/api/http';
import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AccountDeletionPage, type AccountDeletionDeps } from './account-deletion';

/**
 * `/account/deletion` RENDU (#6715) — deux entrées, une adresse :
 *
 * - le LIEN DE L'E-MAIL (`?token=&action=`) : la page dit la conséquence, et
 *   seul le CLIC appelle la passerelle — un pré-chargeur de lien ne supprime
 *   rien (#4183) ;
 * - les RÉGLAGES (connecté, sans jeton) : la demande exige la phrase exacte et
 *   le mot de passe courant, miroir `DeleteAccountView.swift`.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click, type, submit } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(unmountAll);

const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, data });
const refused = (status: number, code?: string): ApiFailure => ({ ok: false, status, error: 'refus', ...(code === undefined ? {} : { code }) });

function scripted(replies: { readonly resolution?: ApiResult<DeletionResolution>; readonly request?: ApiResult<null> } = {}) {
  const resolved: DeletionLink[] = [];
  const requested: string[] = [];
  const deps: AccountDeletionDeps = {
    resolve: async (link) => {
      resolved.push(link);
      return replies.resolution ?? refused(500);
    },
    request: async (currentPassword) => {
      requested.push(currentPassword);
      return replies.request ?? ok(null);
    },
  };
  return { deps, resolved, requested };
}

const CONFIRM: DeletionLink = { token: 'tok', action: 'confirm' };

describe('le lien de l’e-mail — la conséquence d’abord, le clic ensuite', () => {
  test('confirmer : la page le dit, et rien ne part avant le clic', async () => {
    const script = scripted();
    const host = await mount(<AccountDeletionPage link={CONFIRM} signedIn={false} online language="fr" deps={script.deps} />);

    expect(host.querySelector('h1')?.textContent).toBe('Confirmer la suppression de votre compte');
    expect(host.textContent).toContain('période de grâce de 30 jours');
    expect(buttonNamed(host, 'Confirmer la suppression')?.style.minHeight).toBe('52px');
    expect(host.querySelector('a[href="/"]')?.textContent).toBe('Ne rien faire');
    expect(script.resolved).toEqual([]);
  });

  test('le clic confirme, puis la date de fin de grâce est dite', async () => {
    const script = scripted({ resolution: ok({ status: 'CONFIRMED', gracePeriodEndsAt: '2026-10-15T10:00:00.000Z', dataPurged: false }) });
    const host = await mount(<AccountDeletionPage link={CONFIRM} signedIn={false} online language="fr" deps={script.deps} />);

    await click(buttonNamed(host, 'Confirmer la suppression'));

    expect(script.resolved).toEqual([CONFIRM]);
    expect(host.querySelector('h1')?.textContent).toBe('C’est fait');
    expect(host.textContent).toContain('15 octobre 2026');
  });

  test('annuler : le compte reste actif', async () => {
    const script = scripted({ resolution: ok({ status: 'CANCELLED', gracePeriodEndsAt: null, dataPurged: false }) });
    const host = await mount(<AccountDeletionPage link={{ token: 'tok', action: 'cancel' }} signedIn={false} online language="fr" deps={script.deps} />);

    expect(host.querySelector('h1')?.textContent).toBe('Annuler la suppression de votre compte');
    await click(buttonNamed(host, 'Annuler la suppression'));
    expect(host.textContent).toContain('Votre compte reste actif : la demande de suppression est abandonnée.');
  });

  test('supprimer maintenant : le compte désactivé, et les données effacées', async () => {
    const script = scripted({ resolution: ok({ status: 'COMPLETED', gracePeriodEndsAt: null, dataPurged: true }) });
    const host = await mount(<AccountDeletionPage link={{ token: 'tok', action: 'purge' }} signedIn={false} online language="fr" deps={script.deps} />);

    await click(buttonNamed(host, 'Supprimer maintenant'));
    expect(host.textContent).toContain('Votre compte est désactivé et toutes vos sessions ont été fermées.');
    expect(host.textContent).toContain('Vos données ont été effacées.');
  });

  test('un lien expiré le dit, et ne propose plus de recommencer', async () => {
    const script = scripted({ resolution: refused(410, 'TOKEN_EXPIRED') });
    const host = await mount(<AccountDeletionPage link={CONFIRM} signedIn={false} online language="fr" deps={script.deps} />);

    await click(buttonNamed(host, 'Confirmer la suppression'));
    expect(host.querySelector('h1')?.textContent).toBe('Ce lien ne sert plus');
    expect(host.textContent).toContain('Ce lien a expiré.');
    expect(buttonNamed(host, 'Confirmer la suppression')).toBeNull();
  });

  test('une panne dit son motif et garde le geste pour réessayer', async () => {
    const script = scripted({ resolution: refused(500) });
    const host = await mount(<AccountDeletionPage link={CONFIRM} signedIn={false} online language="fr" deps={script.deps} />);

    await click(buttonNamed(host, 'Confirmer la suppression'));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('momentanément indisponible');
    expect(buttonNamed(host, 'Confirmer la suppression')).not.toBeNull();
  });

  test('hors ligne : le geste attend le réseau, et la page le dit', async () => {
    const script = scripted();
    const host = await mount(<AccountDeletionPage link={CONFIRM} signedIn={false} online={false} language="fr" deps={script.deps} />);

    expect(buttonNamed(host, 'Confirmer la suppression')?.disabled).toBe(true);
    expect(host.textContent).toContain('Reconnectez-vous à Internet, puis réessayez.');
  });

  test('un lien incomplet, sans session : la page le dit et propose la connexion', async () => {
    const host = await mount(<AccountDeletionPage link={null} signedIn={false} online language="fr" deps={scripted().deps} />);
    expect(host.querySelector('h1')?.textContent).toBe('Lien incomplet');
    expect(host.querySelector('a[href="/login"]')?.textContent).toBe('Se connecter');
  });
});

describe('depuis les réglages — la demande, sous phrase et mot de passe', () => {
  test('le bouton ne s’ouvre qu’à la phrase exacte ET au mot de passe, puis l’e-mail part', async () => {
    const script = scripted();
    const host = await mount(<AccountDeletionPage link={null} signedIn online language="fr" deps={script.deps} />);

    expect(host.querySelector('h1')?.textContent).toBe('Supprimer votre compte');
    expect(buttonNamed(host, 'Demander la suppression')?.disabled).toBe(true);

    type(host, '#account-deletion-phrase', 'supprimer mon compte');
    type(host, '#account-deletion-password', 'hunter2');
    expect(buttonNamed(host, 'Demander la suppression')?.disabled).toBe(true);

    type(host, '#account-deletion-phrase', 'SUPPRIMER MON COMPTE');
    expect(buttonNamed(host, 'Demander la suppression')?.disabled).toBe(false);

    await submit(host);
    expect(script.requested).toEqual(['hunter2']);
    expect(host.querySelector('h1')?.textContent).toBe('Un e-mail de confirmation vous a été envoyé');
  });

  test('un mot de passe faux se dit sous le formulaire, qui reste', async () => {
    const script = scripted({ request: refused(400, 'INVALID_PASSWORD') });
    const host = await mount(<AccountDeletionPage link={null} signedIn online language="fr" deps={script.deps} />);

    type(host, '#account-deletion-phrase', 'SUPPRIMER MON COMPTE');
    type(host, '#account-deletion-password', 'mauvais');
    await submit(host);

    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Mot de passe incorrect.');
    expect(host.querySelector('#account-deletion-password')).not.toBeNull();
  });

  test('une demande déjà en cours renvoie à l’e-mail reçu', async () => {
    const script = scripted({ request: refused(409, 'ALREADY_PENDING') });
    const host = await mount(<AccountDeletionPage link={null} signedIn online language="fr" deps={script.deps} />);

    type(host, '#account-deletion-phrase', 'SUPPRIMER MON COMPTE');
    type(host, '#account-deletion-password', 'hunter2');
    await submit(host);

    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Une demande est déjà en cours.');
  });
});
