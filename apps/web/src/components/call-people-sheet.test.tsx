import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import type { CallMember } from '@/lib/calls/call-store';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallPeopleSheet } from './call-people-sheet';

/**
 * **UN SEUL VISAGE PAR PERSONNE, DANS LA LISTE D'UN APPEL** (#12571) — la
 * rangée « Vous » et celles des participants passent par `Avatar` : la clé de
 * stockage se résout (`attachmentSrc`), une photo en échec rend les initiales,
 * et la photo de ma session apparaît sur ma propre rangée.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadCallControlsCatalog('fr');
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

const member = (userId: string, name: string, avatar: string | null): CallMember => ({
  userId,
  name,
  avatar,
  micMuted: false,
  cameraOn: false,
  screenSharing: false,
  weakNetwork: false,
  capturing: false,
  link: 'connected',
});

const mount = (members: readonly CallMember[]) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <CallPeopleSheet id="people" closeGlyph="x" language="fr" members={members} onClose={() => undefined} renderModeration={() => null} />,
    ),
  );
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
};

const row = (host: HTMLElement, userId: string) => host.querySelector<HTMLElement>(`[data-call-person="${userId}"]`);

describe('la liste des participants d’un appel — avatar', () => {
  test('une CLÉ de stockage se résout en route de flux : une <img> utilisable, jamais le chemin de la page', () => {
    const host = mount([member('u-nadia', 'Nadia Diop', '2026/09/u-nadia/photo.png')]);
    const img = row(host, 'u-nadia')?.querySelector('img');
    expect(img?.getAttribute('src')).toContain('/attachments/file/');
  });

  test('une photo qui échoue laisse les initiales, pas un cercle vide', () => {
    const host = mount([member('u-nadia', 'Nadia Diop', '2026/09/u-nadia/photo.png')]);
    const rangee = row(host, 'u-nadia');
    act(() => void rangee?.querySelector('img')?.dispatchEvent(new Event('error')));
    expect(rangee?.querySelector('img')?.style.display).toBe('none');
    expect(rangee?.querySelector('[data-avatar-initials]')?.textContent).toBe('ND');
  });

  test('sans photo : les initiales seules, calculées par `initialsOf` (lettres seules, repli « ? »)', () => {
    const host = mount([member('u-theo', 'Théo (foot)', null), member('u-x', '🎉', null)]);
    expect(row(host, 'u-theo')?.querySelector('img')).toBeNull();
    expect(row(host, 'u-theo')?.querySelector('[data-avatar-initials]')?.textContent).toBe('TF');
    expect(row(host, 'u-x')?.querySelector('[data-avatar-initials]')?.textContent).toBe('?');
  });

  test('« Vous » montre MA photo de session', () => {
    const host = mount([]);
    const vous = host.querySelector<HTMLElement>('[data-call-people-in] li');
    expect(vous?.querySelector('img')).not.toBeNull();
  });

  test('une personne n’a jamais deux avatars dans sa rangée', () => {
    const host = mount([member('u-nadia', 'Nadia Diop', '2026/09/u-nadia/photo.png')]);
    expect(row(host, 'u-nadia')?.querySelectorAll('.avatar-root')).toHaveLength(1);
    expect(row(host, 'u-nadia')?.querySelectorAll('img')).toHaveLength(1);
  });
});
