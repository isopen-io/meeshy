import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { Message } from '@/lib/api/types';

import { FocalRow } from './focal-row';

/**
 * L'ÉLU DE FOCAL (#8536, directive porteur 2026-09-28) — « Seul le contenu
 * grandit » et « quand je touche le bouton langue, le bouton de réaction ou un
 * drapeau sur le message en focal, rien ne se passe ! […] Idem quand je touche
 * la date : ça n'ouvre pas les détails du message. »
 *
 * La géométrie réelle (échelles, marges) est mesurée au navigateur par
 * `check-reading-mode.mjs` ; ce témoin tient la PARTITION (ce que la loupe
 * contient, ce qu'elle laisse à l'échelle 1) et l'EFFET de chaque contrôle.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const messageOf = (overrides: Partial<Message> = {}): Message => ({
  id: 'm-elu',
  conversationId: 'c-elu',
  senderId: 'u-amina',
  content: 'La réunion est déplacée à demain.',
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isViewOnce: false,
  maxViewOnceCount: 1,
  viewOnceCount: 0,
  isBlurred: false,
  deliveredCount: 2,
  readCount: 2,
  reactionCount: 3,
  isEncrypted: false,
  createdAt: new Date('2026-09-08T09:00:00.000Z'),
  updatedAt: new Date('2026-09-08T09:00:00.000Z'),
  timestamp: new Date('2026-09-08T09:00:00.000Z'),
  translations: [{ targetLanguage: 'en', translatedContent: 'The meeting is moved to tomorrow.' }],
  reactionSummary: { '👍': 1, '❤️': 2 },
  sender: {
    id: 'p-amina',
    conversationId: 'c-elu',
    userId: 'u-amina',
    displayName: 'Amina Diallo',
    type: 'user',
    role: 'member',
    language: 'fr',
    permissions: {
      canSendMessages: true,
      canSendFiles: true,
      canSendImages: true,
      canSendVideos: true,
      canSendAudios: true,
      canSendLocations: true,
      canSendLinks: true,
    },
    isActive: true,
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
    isOnline: false,
  },
  ...overrides,
}) as Message;

type Journal = { picked: string[]; reacted: string[]; opened: string[] };

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

const mountElected = (options: { readonly message?: Message; readonly selected?: boolean } = {}) => {
  const journal: Journal = { picked: [], reacted: [], opened: [] };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <FocalRow
        mode="focal"
        place={{ message: options.message ?? messageOf(), head: true, tail: true, opensDay: null }}
        languages={['fr', 'en']}
        viewerId="u-viewer"
        ephemeralDeadline={{ state: 'none' }}
        onJumpToMessage={() => {}}
        elected
        myReactions={['👍']}
        onPickLanguage={(code) => journal.picked.push(code)}
        onReact={(emoji) => journal.reacted.push(emoji)}
        onOpenDetail={(id) => journal.opened.push(id)}
        {...(options.selected === undefined ? {} : { selected: options.selected, onToggleSelect: () => {} })}
      />,
    );
  });
  return { host: container, journal };
};

describe('l’élu de Focal — seul le contenu est sous la loupe', () => {
  test('le texte du message vit dans le bloc grossi', () => {
    const { host } = mountElected();
    const loupe = host.querySelector('[data-loupe]');
    expect(loupe).not.toBeNull();
    expect(loupe?.textContent).toContain('La réunion est déplacée à demain.');
  });

  test('identité, bande basse et tampon restent HORS du bloc grossi : ils gardent leur taille d’origine', () => {
    const { host } = mountElected();
    for (const selector of ['.focus-identity', '.focus-strip', '.focus-stamp', '.focus-card']) {
      const node = host.querySelector(selector);
      expect(node).not.toBeNull();
      expect(node?.closest('[data-loupe]')).toBeNull();
    }
  });
});

describe('l’élu de Focal — chaque contrôle agit au premier toucher', () => {
  test('toucher un drapeau de la bande change la langue lue', () => {
    const { host, journal } = mountElected();
    host.querySelector<HTMLButtonElement>('.focus-strip button[data-prism-flag="en"]')?.click();
    expect(journal.picked).toEqual(['en']);
  });

  test('toucher SA capsule de réaction la retire', () => {
    const { host, journal } = mountElected();
    host.querySelector<HTMLButtonElement>('.focus-strip button[aria-label="Retirer votre réaction 👍"]')?.click();
    expect(journal.reacted).toEqual(['👍']);
  });

  test('toucher la capsule d’AUTRUI y pose sa propre réaction — la capsule bascule', () => {
    const { host, journal } = mountElected();
    host.querySelector<HTMLButtonElement>('.focus-strip button[aria-label="Réagir avec ❤️"]')?.click();
    expect(journal.reacted).toEqual(['❤️']);
  });

  test('toucher la date ouvre les détails de CE message', () => {
    const { host, journal } = mountElected();
    const stamp = host.querySelector<HTMLElement>('.focus-stamp');
    expect(stamp?.tagName).toBe('BUTTON');
    expect(stamp?.getAttribute('aria-label')).toBe('Voir les détails du message');
    stamp?.click();
    expect(journal.opened).toEqual(['m-elu']);
  });

  test('en SÉLECTION, la date ne s’arme pas : un toucher de la rangée bascule déjà la coche', () => {
    const { host } = mountElected({ selected: false });
    expect(host.querySelector('.focus-stamp')?.tagName).toBe('TIME');
  });

  test('la date garde son heure lisible dans un <time> daté', () => {
    const { host } = mountElected();
    expect(host.querySelector('.focus-stamp time')?.getAttribute('dateTime')).toBe('2026-09-08T09:00:00.000Z');
  });
});
