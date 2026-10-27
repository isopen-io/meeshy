import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Bubble } from './bubble';
import { FocalRow } from './focal-row';
import type { SocketIOMessage } from '@meeshy/shared/types/socketio-events/message';

import { rawMessageFromSocket } from '@/lib/api/realtime-apply';
import { composeMessageLabel } from '@/lib/view/message-a11y-label';
import { endToEndSealed } from '@/lib/view/end-to-end-sealed';
import { unreadPreviewText } from '@/lib/view/unread-below';
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

const bubble = (message: Message, revealable = true) =>
  renderToStaticMarkup(
    <Bubble
      place={placeOf(message)}
      languages={['fr', 'en']}
      isGrouped
      viewerId="u-viewer"
      ephemeralDeadline={{ state: 'none' }}
      onJumpToMessage={() => {}}
      onPickLanguage={() => {}}
      revealable={revealable}
    />,
  );

const row = (message: Message, revealable = true) =>
  renderToStaticMarkup(
    <FocalRow
      mode="focal"
      place={placeOf(message)}
      languages={['fr', 'en']}
      viewerId="u-viewer"
      ephemeralDeadline={{ state: 'none' }}
      onJumpToMessage={() => {}}
      onPickLanguage={() => {}}
      revealable={revealable}
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

  test('un message non chiffré n’est pas scellé par ce verdict (le clair forgé dans une conversation chiffrée relève de #12992)', () => {
    expect(endToEndSealed(variant({ isEncrypted: false, content: 'Chiffrement activé' }))).toBe(false);
  });

  test('fermé par défaut : chiffré sans mode, mode inconnu ou en majuscules ⇒ scellé', () => {
    const { encryptionMode: _omitted, ...withoutMode } = SEALED;
    expect(endToEndSealed(withoutMode)).toBe(true);
    const servedWith = (mode: string) => ({ isEncrypted: true, encryptionMode: mode }) as unknown as Message;
    expect(endToEndSealed(servedWith('E2EE'))).toBe(true);
    expect(endToEndSealed(servedWith('signal_v9'))).toBe(true);
  });
});

describe('le message reçu EN DIRECT garde son mode (#12983, audit B1)', () => {
  const socketMessage = (partial: Partial<SocketIOMessage>): SocketIOMessage => ({
    id: 'm-live',
    conversationId: 'c-e2ee',
    senderId: 'p-bruno',
    content: '[Encrypted]',
    originalLanguage: 'fr',
    messageType: 'text',
    createdAt: new Date('2026-10-25T13:39:00.000Z'),
    isEncrypted: true,
    ...partial,
  });

  test('un message e2ee reçu par le socket se scelle dans la bulle, comme rechargé', () => {
    const live = rawMessageFromSocket(socketMessage({ encryptionMode: 'e2ee' }));
    expect(live.encryptionMode).toBe('e2ee');
    expect(bubble(live)).toContain('Chiffré de bout en bout');
    expect(bubble(live)).not.toContain('[Encrypted]');
  });

  test('un message chiffré au serveur reçu par le socket garde son texte', () => {
    const live = rawMessageFromSocket(socketMessage({ encryptionMode: 'server', content: 'Bonjour Amina' }));
    expect(live.encryptionMode).toBe('server');
    expect(bubble(live)).toContain('Bonjour Amina');
  });

  test('un mode inconnu n’est pas recopié : le message reste scellé', () => {
    const live = rawMessageFromSocket(socketMessage({ encryptionMode: 'signal_v9' }));
    expect('encryptionMode' in live).toBe(false);
    expect(endToEndSealed(live)).toBe(true);
  });

  test('une vue unique chiffrée reçue en direct n’offre aucun tap qui la consommerait', () => {
    const live = rawMessageFromSocket(socketMessage({ encryptionMode: 'e2ee', isViewOnce: true }));
    for (const html of [bubble(live), row(live)]) {
      expect(html).not.toContain('data-protected="hidden"');
      expect(html).not.toContain('Touchez pour afficher');
      expect(html).toContain('Chiffré de bout en bout');
    }
  });
});

describe('le bouton « revenir en bas » (#12983, audit M2)', () => {
  test('se tait sur un message scellé, jamais le littéral', () => {
    expect(unreadPreviewText(SEALED, '[Encrypted]', Date.now())).toBeNull();
  });

  test('montre le texte servi d’un message lisible', () => {
    expect(unreadPreviewText(variant({ encryptionMode: 'server' }), 'Bonjour', Date.now())).toBe('Bonjour');
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

  test('la retenue du serveur passe avant : la lecture souveraine dit « Contenu retenu », pas « vos appareils »', () => {
    const html = render(SEALED, false);
    expect(html).toContain('Contenu retenu');
    expect(html).not.toContain('Chiffré de bout en bout');
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

  test('la retenue du serveur passe avant, comme à l’écran', () => {
    const label = composeMessageLabel({
      language: 'fr',
      protection: 'standard',
      message: SEALED,
      isMine: false,
      servedText: '[Encrypted]',
      delivery: 'sent',
      contentWithheld: true,
    });
    expect(label).toContain('Contenu retenu');
    expect(label).not.toContain('Chiffré de bout en bout');
  });
});
