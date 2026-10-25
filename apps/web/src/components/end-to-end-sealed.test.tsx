import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Bubble } from './bubble';
import { FocalRow } from './focal-row';
import { composeMessageLabel } from '@/lib/view/message-a11y-label';
import { endToEndSealed } from '@/lib/view/end-to-end-sealed';
import type { Message } from '@/lib/api/types';
import type { PlacedMessage } from '@/lib/grouping';

/**
 * UN MESSAGE CHIFFRÉ DE BOUT EN BOUT, SUR LE WEB (#12983). Le web ne détient
 * aucune clé libsignal (#10788, décision #12975) : la passerelle sert
 * `content: "[Encrypted]"`, littéral technique qui s'affichait TEL QUEL dans la
 * bulle (recette staging du 2026-10-25). Le web dit où le message se lit, sur
 * les deux peaux du fil, et le lecteur d'écran dit la même chose.
 */

const SEALED: Message = {
  id: 'm-sealed',
  conversationId: 'c-e2ee',
  senderId: 'p-bruno',
  content: '[Encrypted]',
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isViewOnce: false,
  maxViewOnceCount: 1,
  viewOnceCount: 0,
  isBlurred: false,
  deliveredCount: 1,
  readCount: 0,
  reactionCount: 0,
  isEncrypted: true,
  encryptionMode: 'e2ee',
  createdAt: new Date('2026-10-25T13:39:00.000Z'),
  updatedAt: new Date('2026-10-25T13:39:00.000Z'),
  timestamp: new Date('2026-10-25T13:39:00.000Z'),
  translations: [],
};

const variant = (patch: Partial<Message>): Message => ({ ...SEALED, ...patch });

const placeOf = (message: Message): PlacedMessage => ({ message, head: true, tail: true, opensDay: null });

const bubble = (message: Message) =>
  renderToStaticMarkup(
    <Bubble
      place={placeOf(message)}
      languages={['fr', 'en']}
      isGrouped
      viewerId="u-viewer"
      ephemeralDeadline={{ state: 'none' }}
      onJumpToMessage={() => {}}
      onPickLanguage={() => {}}
    />,
  );

const row = (message: Message) =>
  renderToStaticMarkup(
    <FocalRow
      mode="focal"
      place={placeOf(message)}
      languages={['fr', 'en']}
      viewerId="u-viewer"
      ephemeralDeadline={{ state: 'none' }}
      onJumpToMessage={() => {}}
      onPickLanguage={() => {}}
    />,
  );

describe('endToEndSealed — la loi', () => {
  test('un message chiffré de bout en bout est scellé pour le web', () => {
    expect(endToEndSealed(SEALED)).toBe(true);
  });

  test('un message chiffré au serveur ne l’est pas : le serveur le sert en clair', () => {
    expect(endToEndSealed(variant({ encryptionMode: 'server', content: 'Bonjour' }))).toBe(false);
    expect(endToEndSealed(variant({ encryptionMode: 'hybrid', content: 'Bonjour' }))).toBe(false);
  });

  test('un message en clair ne l’est pas, même dans une conversation chiffrée', () => {
    expect(endToEndSealed(variant({ isEncrypted: false, content: 'Chiffrement activé' }))).toBe(false);
  });
});

describe.each([
  ['bulle', bubble],
  ['rangée focale', row],
] as const)('%s — message chiffré de bout en bout (#12983)', (_skin, render) => {
  test('dit où le message se lit, jamais le littéral « [Encrypted] »', () => {
    const html = render(SEALED);
    expect(html).toContain('Chiffré de bout en bout');
    expect(html).toContain('vos appareils');
    expect(html).not.toContain('[Encrypted]');
  });

  test('n’offre aucun voile à toucher : il n’y a rien à révéler sur cet appareil', () => {
    const html = render(SEALED);
    expect(html).not.toContain('data-protected="hidden"');
  });

  test('CONTRASTE — un message chiffré au serveur montre son texte', () => {
    const html = render(variant({ encryptionMode: 'server', content: 'Bonjour Amina' }));
    expect(html).toContain('Bonjour Amina');
    expect(html).not.toContain('Chiffré de bout en bout');
  });
});

describe('composeMessageLabel — message chiffré de bout en bout', () => {
  test('le lecteur d’écran entend la même mention, jamais le littéral', () => {
    const label = composeMessageLabel({
      language: 'fr',
      protection: 'standard',
      message: SEALED,
      isMine: false,
      servedText: '[Encrypted]',
      delivery: 'sent',
    });
    expect(label).toContain('Chiffré de bout en bout');
    expect(label).not.toContain('[Encrypted]');
  });
});
