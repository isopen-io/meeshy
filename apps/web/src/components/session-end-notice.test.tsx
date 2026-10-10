import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { SessionEndReason } from '@/lib/session-end';

import { SessionEndNotice } from './session-end-notice';

/**
 * L'EXPLICATION D'UNE SESSION FERMÉE (#9613) — « par l'équipe Meeshy »,
 * jamais un administrateur nommé ; un motif adapté pour chaque geste ; congédiée
 * une fois lue ; rien quand il n'y a rien à dire.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click, settle } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(unmountAll);

function memoryOf(reason: SessionEndReason | null) {
  const state = { reason, dismissed: 0 };
  return {
    state,
    memory: {
      pending: () => state.reason,
      dismiss: () => {
        state.dismissed += 1;
        state.reason = null;
      },
    },
  };
}

describe('SessionEndNotice', () => {
  test('fermée par l’administration : « l’équipe Meeshy » et le contact, sans nom d’administrateur', async () => {
    const { memory } = memoryOf('admin_revoke');
    const host = await mount(<SessionEndNotice language="fr" memory={memory} />);
    await settle();
    const notice = host.querySelector('[data-session-end="admin_revoke"]');
    expect(notice?.getAttribute('role')).toBe('alert');
    expect(notice?.textContent).toContain('Votre session a été fermée par l’équipe Meeshy.');
    expect(notice?.querySelector('[data-session-end-contact]')?.getAttribute('href')).toBe('/contact');
  });

  test('fermée depuis un autre appareil, ou au changement de mot de passe : le motif adapté, sans contact', async () => {
    for (const [reason, text] of [
      ['user_revoke', 'depuis un autre de vos appareils'],
      ['password_changed', 'mot de passe de votre compte a changé'],
      ['logout', 'déconnecté de cet appareil'],
    ] as const) {
      const host = await mount(<SessionEndNotice language="fr" memory={memoryOf(reason).memory} />);
      await settle();
      expect(host.textContent).toContain(text);
      expect(host.querySelector('[data-session-end-contact]')).toBeNull();
      unmountAll();
    }
  });

  test('« Compris » la congédie, une fois pour toutes', async () => {
    const { memory, state } = memoryOf('user_revoke');
    const host = await mount(<SessionEndNotice language="fr" memory={memory} />);
    await settle();
    const ok = host.querySelector<HTMLButtonElement>('[data-session-end-dismiss]');
    if (ok !== null) await click(ok);
    expect(state.dismissed).toBe(1);
    expect(host.querySelector('[data-session-end]')).toBeNull();
  });

  test('rien à dire : rien n’est rendu', async () => {
    const host = await mount(<SessionEndNotice language="fr" memory={memoryOf(null).memory} />);
    await settle();
    expect(host.innerHTML).toBe('');
  });
});
