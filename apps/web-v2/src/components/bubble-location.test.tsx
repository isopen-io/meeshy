import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { QueryClient } from '@tanstack/react-query';

import { createHttpTransport } from '@/lib/api/http';
import { messagesQueryKey } from '@/lib/api/messages';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createOutboxStore, entriesOf } from '@/lib/send/outbox-store';
import { performSend } from '@/lib/send/perform-send';
import { threadOf, threadPages } from '@/test-support/thread-cache';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { Message } from '@/lib/api/types';
import type { PlacedMessage } from '@/lib/grouping';

import { Bubble } from './bubble';

/**
 * **LA BULLE D'UN LIEU, ET SES TROIS ÉTATS (#7328).**
 *
 * `apps/ios` fait foi — `LocationMessageView.swift` :
 *   - le lieu se rend AU-DESSUS du texte, dans la bulle
 *     (`BubbleStandardLayout.swift:1069-1082`, avant `ForEach(nonMedia…)` et
 *     avant `expandableTextView`) ;
 *   - la barre d'information n'existe QUE si `placeName != nil || address !=
 *     nil` — un lieu SANS nom ne rend donc aucune ligne vide ;
 *   - le libellé d'accessibilité est « Position : <nom> », et « Position
 *     partagée » quand le nom manque (`location.a11y.label` /
 *     `location.shared`, `MeeshyUI/Resources/Localizable.xcstrings`).
 *
 * **LE CAS SANS NOM EST LE CAS NOMINAL DU WEB**, et c'est pour cela qu'il a son
 * témoin : le web n'a aucun géocodeur inverse, la tuile « Position » n'envoie
 * que des coordonnées (`send/shared-place.ts`). Un rendu qui n'aurait été
 * éprouvé que sur un lieu NOMMÉ aurait laissé le seul cas réel non couvert.
 *
 * **LA LANGUE SE LIT SUR UN TEXTE, JAMAIS SUR UNE CLÉ** (leçon du catalogue) :
 * on asserte la CHAÎNE anglaise, qu'une clé absente ne peut pas produire.
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('fr');
  await loadInterfaceCatalog('en');
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  document.documentElement.lang = 'fr';
});

const MESSAGE: Message = {
  id: 'm-lieu',
  conversationId: 'c-lieu',
  senderId: 'u-viewer',
  content: '',
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  deliveredCount: 1,
  readCount: 0,
  reactionCount: 0,
  isEncrypted: false,
  createdAt: new Date('2026-09-21T09:00:00.000Z'),
  timestamp: new Date('2026-09-21T09:00:00.000Z'),
  translations: [],
};

const avecLieu = (location: unknown): Message => ({ ...MESSAGE, ...({ location } as object) });

const placed = (message: Message): PlacedMessage => ({ message, head: true, tail: true, opensDay: null });

const render = (message: Message): string =>
  renderToStaticMarkup(
    <Bubble
      place={placed(message)}
      languages={['fr', 'en']}
      isGrouped
      viewerId="u-viewer"
      ephemeralDeadline={{ state: 'none' }}
      onJumpToMessage={() => {}}
      onPickLanguage={() => {}}
    />,
  );

describe('la bulle rend le lieu que son expéditeur vient de joindre (#7328)', () => {
  test('un lieu NOMMÉ rend son nom, son adresse et un lien vers la carte', () => {
    const html = render(
      avecLieu({ latitude: 48.8584, longitude: 2.2945, name: 'Tour Eiffel', address: 'Champ de Mars, Paris' }),
    );
    expect(html).toContain('Tour Eiffel');
    expect(html).toContain('Champ de Mars, Paris');
    expect(html).toContain('48.85840');
  });

  test('un lieu SANS nom — le cas nominal du web — rend « Position partagée », jamais un vide', () => {
    const html = render(avecLieu({ latitude: 48.8566, longitude: 2.3522 }));
    expect(html).toContain('Position partagée');
    expect(html).toContain('2.35220');
  });

  test('en anglais, le libellé vient du catalogue — jamais du français en dur', () => {
    document.documentElement.lang = 'en';
    const html = render(avecLieu({ latitude: 48.8566, longitude: 2.3522 }));
    expect(html).toContain('Shared location');
    expect(html).toContain('Open in Maps');
    expect(html).not.toContain('Position partagée');
    expect(html).not.toContain('Ouvrir dans Plans');
  });

  test('sans lieu, aucune carte — la bulle ordinaire est inchangée', () => {
    const html = render({ ...MESSAGE, content: 'bonjour' });
    expect(html).not.toContain('Position partagée');
    expect(html).not.toContain('maps.apple.com');
  });

  /** UNE COORDONNÉE HORS BORNES N'EST PAS UN LIEU — `parseSharedPlace` la
   * rejette côté passerelle, `placeOf` doit rendre le même verdict : une carte
   * qui pointe nulle part est pire qu'aucune carte. */
  test('des coordonnées hors bornes ne rendent aucune carte', () => {
    expect(render(avecLieu({ latitude: 91, longitude: 2.35 }))).not.toContain('maps.apple.com');
  });
});

/**
 * **L'ALLER-RETOUR, D'UN SEUL TENANT (#7328).** Les témoins ci-dessus
 * mesurent la BULLE sur une charge posée à la main ; ceux de
 * `perform-send-location.test.ts` mesurent l'ENVOI. Entre les deux restait
 * l'écart où le défaut vivait : le message que `performSend` compose est-il
 * bien celui que la bulle sait rendre ?
 *
 * Ce témoin ne pose aucune charge — il ENVOIE, puis rend ce qui est sorti.
 * Il tomberait si le lieu voyageait sous une forme que `placeOf` ne lit pas,
 * ce qu'aucun des deux autres ne peut dire.
 */
describe('j’envoie un lieu, il apparaît dans MON fil (#7328)', () => {
  const ackFetch = (async (input: RequestInfo | URL) =>
    new Response(
      String(input).includes('/messages')
        ? JSON.stringify({
            success: true,
            data: { id: 'm-serveur', conversationId: 'c-lieu', senderId: 'u-viewer', createdAt: '2026-09-21T09:00:00.000Z' },
          })
        : null,
      { status: 200 },
    )) as typeof fetch;

  const envoi = async (online: boolean) => {
    const deps = {
      source: 'gateway' as const,
      transport: createHttpTransport({ base: '', fetchImpl: ackFetch }),
      queryClient: new QueryClient(),
      outbox: createOutboxStore(),
      online,
    };
    deps.queryClient.setQueryData(messagesQueryKey('c-lieu'), threadPages([]));
    await performSend({
      conversationId: 'c-lieu',
      draft: { content: online ? 'me voici' : 'me voici, hors ligne', originalLanguage: 'fr', place: { latitude: 48.8566, longitude: 2.3522 } },
      viewerId: 'u-viewer',
      deps,
    });
    return deps;
  };

  test('en OPTIMISTE — avant tout accusé, la bulle porte déjà la carte', async () => {
    const deps = await envoi(false);
    const optimiste = entriesOf(deps.outbox.getState(), 'c-lieu')[0]?.message;
    expect(optimiste).toBeDefined();
    const html = render(optimiste as Message);
    expect(html).toContain('Position partagée');
    expect(html).toContain('maps.apple.com/?ll=48.85660,2.35220');
  });

  test('puis CONFIRMÉ — l’accusé change l’identifiant, jamais la carte', async () => {
    const deps = await envoi(true);
    const confirmé = threadOf(deps.queryClient, 'c-lieu')?.messages[0];
    expect(confirmé?.id).toBe('m-serveur');
    const html = render(confirmé as Message);
    expect(html).toContain('Position partagée');
    expect(html).toContain('maps.apple.com/?ll=48.85660,2.35220');
  });
});
