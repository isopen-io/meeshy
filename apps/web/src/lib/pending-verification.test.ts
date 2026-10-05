import { afterEach, describe, expect, test } from 'bun:test';

import { forgetPendingVerification, holdPendingVerification, pendingVerificationFor } from './pending-verification';

/**
 * LE MOT DE PASSE TAPÉ À LA CONNEXION D'UN E-MAIL INCONNU (#8034) — gardé en
 * MÉMOIRE VIVE le temps de saisir le code, pour qu'il voyage AVEC le code
 * (contrat #8033). Jamais en stockage : un rechargement l'oublie, et c'est
 * voulu.
 */
afterEach(() => forgetPendingVerification());

describe('pendingVerificationFor', () => {
  test('rend ce qui a été retenu pour CETTE adresse, casse et espaces ignorés', () => {
    holdPendingVerification({ email: 'Neuf@X.io', password: 'secret-1', accountCreated: true });
    expect(pendingVerificationFor(' neuf@x.io ')).toEqual({ email: 'Neuf@X.io', password: 'secret-1', accountCreated: true });
  });

  test('une AUTRE adresse ne reçoit rien — le mot de passe d’un e-mail ne part jamais avec le code d’un autre', () => {
    holdPendingVerification({ email: 'neuf@x.io', password: 'secret-1', accountCreated: true });
    expect(pendingVerificationFor('autre@x.io')).toBeNull();
  });

  test('oublier efface', () => {
    holdPendingVerification({ email: 'neuf@x.io', password: 'secret-1', accountCreated: false });
    forgetPendingVerification();
    expect(pendingVerificationFor('neuf@x.io')).toBeNull();
  });

  test('rien n’est écrit dans le stockage du navigateur', () => {
    const writes: string[] = [];
    const spy = { setItem: (k: string) => writes.push(k), getItem: () => null, removeItem: () => undefined };
    const names = ['localStorage', 'sessionStorage'] as const;
    const originals = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
    try {
      for (const name of names) Object.defineProperty(globalThis, name, { value: spy, configurable: true });
      holdPendingVerification({ email: 'neuf@x.io', password: 'secret-1', accountCreated: true });
    } finally {
      names.forEach((name, i) => {
        const original = originals[i];
        if (original === undefined) Reflect.deleteProperty(globalThis, name);
        else Object.defineProperty(globalThis, name, original);
      });
    }
    expect(writes).toEqual([]);
  });
});
