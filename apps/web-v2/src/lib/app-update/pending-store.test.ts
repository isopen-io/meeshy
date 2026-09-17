import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { appUpdateStore, listenForAppUpdates } from './pending-store';
import { SW_UPDATE_AVAILABLE_EVENT, type RegistrationLike } from './service-worker';

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  appUpdateStore.setState({ pending: null, dismissed: false, applying: false });
});

const registration = (): RegistrationLike => ({
  installing: null,
  waiting: null,
  addEventListener: () => undefined,
  update: () => Promise.resolve(),
});

const announce = (target: RegistrationLike): void => {
  window.dispatchEvent(new CustomEvent(SW_UPDATE_AVAILABLE_EVENT, { detail: { registration: target } }));
};

describe("le magasin d'annonce — l'événement du legacy, capté sans rien manquer", () => {
  test('un `sw-update-available` pose la version en attente', () => {
    const stop = listenForAppUpdates(window);
    const target = registration();

    announce(target);

    expect(appUpdateStore.getState().pending).toBe(target);
    stop();
  });

  test('« Attendre » referme la bannière sans oublier que la version existe', () => {
    const stop = listenForAppUpdates(window);
    announce(registration());

    appUpdateStore.getState().dismiss();

    expect(appUpdateStore.getState().dismissed).toBe(true);
    expect(appUpdateStore.getState().pending).not.toBeNull();
    stop();
  });

  test('une annonce SUIVANTE rouvre la bannière refermée — comme le legacy', () => {
    const stop = listenForAppUpdates(window);
    announce(registration());
    appUpdateStore.getState().dismiss();

    const encore = registration();
    announce(encore);

    expect(appUpdateStore.getState().dismissed).toBe(false);
    expect(appUpdateStore.getState().pending).toBe(encore);
    stop();
  });

  test('une charge sans registration est ignorée, sans lever', () => {
    const stop = listenForAppUpdates(window);

    window.dispatchEvent(new CustomEvent(SW_UPDATE_AVAILABLE_EVENT, { detail: {} }));
    window.dispatchEvent(new CustomEvent(SW_UPDATE_AVAILABLE_EVENT));

    expect(appUpdateStore.getState().pending).toBeNull();
    stop();
  });

  test('après `stop()`, plus aucune annonce ne passe', () => {
    const stop = listenForAppUpdates(window);
    stop();

    announce(registration());

    expect(appUpdateStore.getState().pending).toBeNull();
  });
});
