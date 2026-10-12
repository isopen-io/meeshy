import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { RICH_TEXT_CONVERSATION, RICH_TEXT_DIRECT } from '@/lib/api/fixtures-rich-text';
import type { Conversation, Message, Participant } from '@/lib/api/types';
import type { PlacedMessage } from '@/lib/grouping';
import { sessionStore } from '@/lib/api/session';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { AuthorStoryRing } from '@/lib/view/author-story-ring';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Bubble } from './bubble';
import { FocalRow } from './focal-row';
import { ThreadHeader } from './thread-header';

/**
 * **DANS LE FIL, L'IDENTITÉ D'UN EXPÉDITEUR OUVRE SA STORY OU SON PROFIL**
 * (#7528, directive porteur du 2026-09-23) — « en touchant leur avatar
 * (lorsqu'ils n'ont pas de story, ou alors afficher leur story) ou leur
 * display name, en groupe ou en direct, en Script, Focal ou Bulle ».
 *
 * Trois trous mesurés sur `dev` : l'anneau de story n'atteignait aucune rangée
 * du fil (un auteur avec story ouvrait son profil) ; la puce d'identité de la
 * rangée ÉLUE en Focal recouvrait l'identité par un avatar et un nom INERTES ;
 * et en Bulles, une conversation DIRECTE ne peignait aucune identité — sans
 * autre porte vers le pair.
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const AMINA: Participant = {
  id: 'p-amina',
  conversationId: 'c-witness',
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
  user: { id: 'u-amina', username: 'amina.diallo' },
};

const moment = new Date('2026-09-08T09:00:00.000Z');

const messageOf = (overrides: Partial<Message> = {}): Message => ({
  id: 'm-witness',
  conversationId: 'c-witness',
  senderId: 'u-amina',
  content: 'Bonjour',
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
  reactionCount: 0,
  isEncrypted: false,
  createdAt: moment,
  updatedAt: moment,
  timestamp: moment,
  translations: [],
  sender: AMINA,
  ...overrides,
});

const placeOf = (message: Message): PlacedMessage => ({ message, head: true, tail: true, opensDay: null });

const RING: AuthorStoryRing = { entryStoryId: 'story-amina-1', unseen: true };

const focal = (mode: 'focal' | 'script', opts: { readonly ring?: AuthorStoryRing; readonly elected?: boolean } = {}) =>
  renderToStaticMarkup(
    <FocalRow
      mode={mode}
      place={placeOf(messageOf())}
      languages={['fr']}
      viewerId="u-viewer"
      ephemeralDeadline={{ state: 'none' }}
      onJumpToMessage={() => {}}
      {...(opts.elected === true ? { elected: true } : {})}
      {...(opts.ring === undefined ? {} : { senderStoryRing: opts.ring })}
    />,
  );

const bubble = (opts: { readonly ring?: AuthorStoryRing } = {}) =>
  renderToStaticMarkup(
    <Bubble
      place={placeOf(messageOf())}
      languages={['fr']}
      isGrouped
      viewerId="u-viewer"
      ephemeralDeadline={{ state: 'none' }}
      onJumpToMessage={() => {}}
      {...(opts.ring === undefined ? {} : { senderStoryRing: opts.ring })}
    />,
  );

const count = (html: string, needle: string): number => html.split(needle).length - 1;

describe('Focal et Script — l’anneau prime, le profil sinon', () => {
  for (const mode of ['focal', 'script'] as const) {
    test(`${mode} : sans story, l’avatar ET le nom ouvrent le profil`, () => {
      const html = focal(mode);

      expect(count(html, 'href="/u/amina.diallo"')).toBe(2);
      expect(html).not.toContain('href="/story/');
    });

    test(`${mode} : avec une story, l’avatar ET le nom ouvrent la story`, () => {
      const html = focal(mode, { ring: RING });

      expect(count(html, 'href="/story/story-amina-1"')).toBe(2);
      expect(html).not.toContain('href="/u/amina.diallo"');
      expect(html).toContain('data-story-ring="unseen"');
    });
  }

  test('la rangée ÉLUE : la puce d’identité qui recouvre la tête mène au même endroit, hors du parcours clavier', () => {
    const html = focal('focal', { elected: true });
    const puce = html.slice(html.indexOf('focus-identity'));

    expect(count(puce.slice(0, puce.indexOf('</div>')), 'href="/u/amina.diallo"')).toBe(2);
    expect(puce.slice(0, puce.indexOf('</div>'))).toContain('tabindex="-1"');
  });

  test('ma propre rangée n’ouvre rien — ni profil, ni story', () => {
    const html = renderToStaticMarkup(
      <FocalRow
        mode="focal"
        place={placeOf(messageOf({ senderId: 'u-viewer', sender: { ...AMINA, userId: 'u-viewer' } }))}
        languages={['fr']}
        viewerId="u-viewer"
        ephemeralDeadline={{ state: 'none' }}
        onJumpToMessage={() => {}}
        senderStoryRing={RING}
      />,
    );

    expect(html).not.toContain('href="/story/');
    expect(html).not.toContain('href="/u/');
  });
});

describe('Bulles — l’anneau prime, le profil sinon', () => {
  test('sans story, l’avatar ET le nom ouvrent le profil', () => {
    expect(count(bubble(), 'href="/u/amina.diallo"')).toBe(2);
  });

  test('avec une story, l’avatar ET le nom ouvrent la story', () => {
    const html = bubble({ ring: RING });

    expect(count(html, 'href="/story/story-amina-1"')).toBe(2);
    expect(html).not.toContain('href="/u/amina.diallo"');
  });
});

describe('En direct, le titre déplié de l’en-tête est la porte du pair', () => {
  const direct: Conversation = {
    ...RICH_TEXT_DIRECT,
    participants: [...RICH_TEXT_DIRECT.participants.filter((p) => p.userId === 'u-viewer'), AMINA],
  };

  const header = (conversation: Conversation, group: boolean, ring?: AuthorStoryRing) =>
    renderToStaticMarkup(
      <ThreadHeader
        title="Amina Diallo"
        accent="#4455ff"
        conversation={conversation}
        viewerId="u-viewer"
        group={group}
        {...(ring === undefined ? {} : { storyRingOf: (id: string | undefined) => (id === 'u-amina' ? ring : undefined) })}
        otherUnread={0}
        expanded
        onToggleExpanded={() => {}}
        currentRowTitle=""
        isAuto
        readingMenuRows={[]}
        onSelectReadingMode={() => {}}
        onResetReadingModeToAuto={() => {}}
      />,
    );

  test('sans story, il ouvre le profil du pair', () => {
    expect(header(direct, false)).toContain('href="/u/amina.diallo"');
  });

  test('avec une story, il ouvre sa story', () => {
    /* Le TITRE seul : l'avatar voisin mène, lui, au profil du pair (#10300). */
    const page = header(direct, false, RING);
    const html = page.slice(page.indexOf('<h1'), page.indexOf('</h1>'));

    expect(html).toContain('href="/story/story-amina-1"');
    expect(html).not.toContain('href="/u/amina.diallo"');
  });

  test('en groupe, le titre nomme la conversation : il reste du texte', () => {
    const html = header(RICH_TEXT_CONVERSATION, true, RING);

    expect(html).not.toContain('href="/u/');
    expect(html).not.toContain('href="/story/');
  });
});

/* Rendu CLIENT : le rendu serveur lit l'état INITIAL du magasin de session
   (`getServerSnapshot`), jamais l'invité posé par le témoin. */
const clientHtml = (node: ReactNode): string => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  const html = host.innerHTML;
  act(() => root.unmount());
  host.remove();
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  return html;
};

describe('un visiteur sans compte n’ouvre aucune fiche (#10205, directive porteur du 2026-10-11)', () => {
  const asGuest = () =>
    sessionStore.setState({
      session: {
        status: 'guest',
        sessionToken: 'anon',
        guest: { participantId: 'p-awa', nickname: 'Awa', conversationId: 'c-witness', link: 'mshy_world', mayWrite: true },
        expiresAt: Number.MAX_SAFE_INTEGER,
      },
    });
  const reset = () => sessionStore.setState({ session: { status: 'anonymous' } });
  const focalRow = (mode: 'focal' | 'script') => (
    <FocalRow mode={mode} place={placeOf(messageOf())} languages={['fr']} viewerId="u-viewer" ephemeralDeadline={{ state: 'none' }} onJumpToMessage={() => {}} senderStoryRing={RING} />
  );

  for (const mode of ['focal', 'script'] as const) {
    test(`${mode} : ni l’avatar ni le nom ne mènent au profil ou à la story, même avec un anneau`, () => {
      expect(clientHtml(focalRow(mode))).toContain('href="/story/story-amina-1"');
      asGuest();
      try {
        const html = clientHtml(focalRow(mode));
        expect(html).not.toContain('href="/u/');
        expect(html).not.toContain('href="/story/');
        expect(html).toContain('Amina Diallo');
      } finally {
        reset();
      }
    });
  }

  test('Bulles : ni l’avatar ni le nom ne mènent nulle part', () => {
    asGuest();
    try {
      const html = clientHtml(
        <Bubble place={placeOf(messageOf())} languages={['fr']} isGrouped viewerId="u-viewer" ephemeralDeadline={{ state: 'none' }} onJumpToMessage={() => {}} senderStoryRing={RING} />,
      );
      expect(html).not.toContain('href="/u/');
      expect(html).not.toContain('href="/story/');
      expect(html).toContain('Amina Diallo');
    } finally {
      reset();
    }
  });
});
