import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';
import type { PlacedMessage } from '@/lib/grouping';

import { Bubble } from './bubble';
import { FocalRow } from './focal-row';
import { Quote } from './message-blocks';

/**
 * #8320 — DANS UNE RÉPONSE, LA CITATION D'UN AUDIO SE JOUE SUR PLACE, ET LE
 * RESTE RAMÈNE AU MESSAGE.
 *
 * Deux zones EXCLUSIVES : le bouton de lecture joue (et met en pause) sans
 * jamais sauter ; le bouton voisin saute sans jamais jouer. Les deux peaux du
 * fil (la bulle et la rangée plate de Focal/Script) montent le même `Quote`,
 * et chacune doit lui remettre l'identité du message citant — sans elle, la
 * zone lecture n'existe pas.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const NOW = new Date('2026-09-27T10:00:00.000Z');

const voice = (partial: Partial<Attachment> = {}): Attachment =>
  ({
    ...attachmentDefaults,
    id: 'a-voice',
    messageId: 'm-quoted',
    fileName: 'voice.m4a',
    originalName: 'voice.m4a',
    mimeType: 'audio/mp4',
    fileSize: 4096,
    fileUrl: 'https://cdn.meeshy.me/voice-en.m4a',
    uploadedBy: 'u-amina',
    createdAt: '2026-09-23T09:00:00.000Z',
    duration: 12_000,
    transcription: { type: 'audio', transcribedText: 'Hello team', language: 'en', confidence: 0.9, source: 'whisper' },
    translations: {
      fr: { type: 'audio', transcription: 'Bonjour équipe', url: 'https://cdn.meeshy.me/voice-fr.m4a', createdAt: new Date() },
    },
    ...partial,
  }) as Attachment;

const BASE = {
  id: 'm-base',
  conversationId: 'c-a',
  senderId: 'u-amina',
  content: '',
  originalLanguage: 'en',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  deliveredCount: 0,
  readCount: 0,
  reactionCount: 0,
  isEncrypted: false,
  translations: [],
  createdAt: new Date('2026-09-23T09:00:00.000Z'),
  timestamp: new Date('2026-09-23T09:00:00.000Z'),
  sender: { id: 'p-amina', userId: 'u-amina', displayName: 'Amina Diallo' },
} as unknown as Message;

const quotedVoice = (partial: Partial<Message> = {}): Message =>
  ({ ...BASE, id: 'm-quoted', messageType: 'audio', attachments: [voice()], ...partial }) as Message;

const reply = (quoted: Message): Message => ({ ...BASE, id: 'm-reply', content: 'Oui', replyToId: quoted.id, replyTo: quoted });

const placed = (message: Message): PlacedMessage => ({ message, head: true, tail: true, opensDay: null });

const SKINS = [
  [
    'bulle',
    (message: Message) =>
      renderToStaticMarkup(
        <Bubble
          place={placed(message)}
          languages={['de', 'fr']}
          isGrouped
          viewerId="u-viewer"
          ephemeralDeadline={{ state: 'none' }}
          onJumpToMessage={() => {}}
          onPickLanguage={() => {}}
        />,
      ),
  ],
  [
    'rangée plate',
    (message: Message) =>
      renderToStaticMarkup(
        <FocalRow
          mode="script"
          place={placed(message)}
          languages={['de', 'fr']}
          viewerId="u-viewer"
          ephemeralDeadline={{ state: 'none' }}
          onJumpToMessage={() => {}}
          onPickLanguage={() => {}}
        />,
      ),
  ],
] as const;

describe('les deux peaux offrent la zone lecture d’un audio cité (#8320)', () => {
  for (const [peau, render] of SKINS) {
    test(`${peau} — deux actions nommées : écouter, et aller au message`, () => {
      const html = render(reply(quotedVoice()));
      expect(html).toContain('aria-label="Écouter le message cité"');
      expect(html).toContain('aria-label="Aller au message de Amina Diallo');
    });

    test(`${peau} — la piste jouée suit le Prisme audio (rang 2 : la piste FRANÇAISE)`, () => {
      const html = render(reply(quotedVoice()));
      expect(html).toContain('voice-fr.m4a');
      expect(html).not.toContain('voice-en.m4a');
    });

    test(`${peau} — un message cité PROTÉGÉ n’offre pas la lecture, et aucune adresse ne part`, () => {
      for (const secret of [
        quotedVoice({ isViewOnce: true }),
        quotedVoice({ isBlurred: true }),
        quotedVoice({ attachments: [voice({ isViewOnce: true })] }),
        quotedVoice({ deletedAt: new Date('2026-09-24T00:00:00.000Z') }),
        quotedVoice({ expiresAt: new Date('2020-01-01T00:00:00.000Z') }),
      ]) {
        const html = render(reply(secret));
        expect(html).not.toContain('Écouter le message cité');
        expect(html).not.toContain('voice-fr.m4a');
        expect(html).not.toContain('<audio');
      }
    });
  }
});

let container: HTMLDivElement;
let root: Root;

function stubAudio(el: HTMLMediaElement): { plays: number; pauses: number } {
  const calls = { plays: 0, pauses: 0 };
  el.play = () => {
    calls.plays += 1;
    el.dispatchEvent(new Event('play'));
    return Promise.resolve();
  };
  el.pause = () => {
    calls.pauses += 1;
    el.dispatchEvent(new Event('pause'));
  };
  return calls;
}

function mountQuote(onJump: () => void): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Quote quote={quotedVoice()} isMine={false} languages={['de', 'fr']} onJump={onJump} citingId="m-reply" now={NOW} />);
  });
  return container;
}

describe('les deux zones sont EXCLUSIVES (#8320)', () => {
  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test('toucher la lecture joue, un second toucher met en pause — et rien n’ouvre le message', async () => {
    let jumps = 0;
    const el = mountQuote(() => {
      jumps += 1;
    });
    const calls = stubAudio(el.querySelector('audio')!);
    const play = el.querySelector<HTMLButtonElement>('[data-quote-play]')!;

    await act(async () => {
      play.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(calls.plays).toBe(1);
    expect(play.getAttribute('data-quote-play')).toBe('playing');
    expect(play.getAttribute('aria-label')).toBe('Mettre en pause le message cité');

    await act(async () => {
      play.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(calls.pauses).toBe(1);
    expect(play.getAttribute('data-quote-play')).toBe('idle');
    expect(jumps).toBe(0);
  });

  test('toucher le reste de la citation saute au message, sans jouer', async () => {
    let jumps = 0;
    const el = mountQuote(() => {
      jumps += 1;
    });
    const calls = stubAudio(el.querySelector('audio')!);
    const jump = el.querySelector<HTMLButtonElement>('button[data-quote-media]')!;

    await act(async () => {
      jump.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(jumps).toBe(1);
    expect(calls.plays).toBe(0);
  });

  test('la cible de lecture fait au moins 44 px de haut', () => {
    const el = mountQuote(() => {});
    expect(el.querySelector<HTMLElement>('[data-quote-play]')!.style.minHeight).toBe('44px');
  });

  test('deux réponses qui citent le même vocal sont deux lecteurs : l’une met l’autre en pause', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <>
          <Quote quote={quotedVoice()} isMine={false} languages={['de', 'fr']} onJump={() => {}} citingId="m-reply-1" now={NOW} />
          <Quote quote={quotedVoice()} isMine={false} languages={['de', 'fr']} onJump={() => {}} citingId="m-reply-2" now={NOW} />
        </>,
      );
    });
    const [first, second] = [...container.querySelectorAll('audio')].map((a) => stubAudio(a));
    const [playFirst, playSecond] = [...container.querySelectorAll<HTMLButtonElement>('[data-quote-play]')];
    await act(async () => {
      playFirst!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      playSecond!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(first!.pauses).toBe(1);
    expect(second!.plays).toBe(1);
  });
});
