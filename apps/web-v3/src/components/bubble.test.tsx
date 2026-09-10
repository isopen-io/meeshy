import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Bubble } from './bubble';
import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Message } from '@/lib/api/types';
import type { PlacedMessage } from '@/lib/grouping';

/**
 * « LA BULLE APPELLE LA LOI » — D-23, #5676. `renderToStaticMarkup`
 * (`react-dom/server`), même patron que `avatar.test.tsx` : bun test compile
 * ce fichier vers de VRAIS éléments React (hors du pipeline Vite qui
 * redirige vers Preact), et c'est un rendu réel qu'il faut ici, pas une
 * déduction sur les props.
 */

const BASE_MESSAGE: Message = {
  id: 'm-witness',
  conversationId: 'c-witness',
  senderId: 'u-amina',
  content: 'Bonjour, comment vas-tu ?',
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
  createdAt: new Date('2026-09-08T09:00:00.000Z'),
  updatedAt: new Date('2026-09-08T09:00:00.000Z'),
  timestamp: new Date('2026-09-08T09:00:00.000Z'),
  translations: [],
  sender: {
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
  },
};

const placeOf = (message: Message, tail = true): PlacedMessage => ({
  message,
  head: true,
  tail,
  opensDay: null,
});

const render = (message: Message, opts: { tail?: boolean; now?: () => number } = {}) =>
  renderToStaticMarkup(
    <Bubble
      place={placeOf(message, opts.tail ?? true)}
      languages={['fr', 'en']}
      isGrouped
      viewerId="u-viewer"
      onJumpToMessage={() => {}}
      {...(opts.now ? { now: opts.now } : {})}
    />,
  );

describe('Bubble — protection (D-23, #5676)', () => {
  test('flouté : le HTML ne contient PAS le contenu, porte data-protected="hidden" et l’affordance, aucun drapeau ni pastille', () => {
    const html = render({ ...BASE_MESSAGE, isBlurred: true, content: 'SECRET-4817', translations: [] });
    expect(html).not.toContain('SECRET-4817');
    expect(html).toContain('data-protected="hidden"');
    expect(html).toContain('Contenu masqué');
    expect(html).not.toContain('aria-pressed');
    expect(html).not.toContain('langue d’origine');
  });

  test('traduit, tail, non voilé ⇒ au moins un drapeau (aria-pressed) ; le MÊME message tail:false ⇒ aucun (#3919)', () => {
    const translated: Message = {
      ...BASE_MESSAGE,
      originalLanguage: 'en',
      content: 'Hello there!',
      translations: [
        {
          id: 't1',
          messageId: BASE_MESSAGE.id,
          targetLanguage: 'fr',
          translatedContent: 'Bonjour !',
          translationModel: 'medium',
          createdAt: new Date('2026-09-08T09:00:00.000Z'),
        },
      ],
    };
    const tailHtml = render(translated, { tail: true });
    expect(tailHtml).toContain('aria-pressed');

    const headOnlyHtml = render(translated, { tail: false });
    expect(headOnlyHtml).not.toContain('aria-pressed');
  });

  test('supprimé : le HTML ne contient PAS le contenu, contient « Message supprimé »', () => {
    const html = render({ ...BASE_MESSAGE, deletedAt: new Date('2026-09-08T09:05:00.000Z'), content: 'JAMAIS' });
    expect(html).not.toContain('JAMAIS');
    expect(html).toContain('Message supprimé');
  });

  test('vue unique consommée : « Vu et supprimé », sans le contenu', () => {
    const html = render({
      ...BASE_MESSAGE,
      isViewOnce: true,
      isBlurred: true,
      maxViewOnceCount: 1,
      viewOnceCount: 1,
      content: 'Contenu brûlé',
    });
    expect(html).toContain('Vu et supprimé');
    expect(html).not.toContain('Contenu brûlé');
  });

  test('éphémère échu : la rangée ne rend RIEN (ni contenu ni tombstone)', () => {
    const html = render({
      ...BASE_MESSAGE,
      expiresAt: new Date('2026-09-08T08:59:00.000Z'),
      content: 'Message qui a expiré',
    });
    expect(html).toBe('');
  });

  test('éphémère dans 2 minutes : aria-label du badge « Message éphémère, expire dans 2m 00s »', () => {
    const now = () => new Date('2026-09-08T09:00:00.000Z').getTime();
    const html = render(
      { ...BASE_MESSAGE, expiresAt: new Date('2026-09-08T09:02:00.000Z') },
      { now },
    );
    expect(html).toContain('Message éphémère, expire dans 2m 00s');
  });

  /**
   * LE TÉMOIN QUI MANQUAIT (revue de #5676) — le message voilé du premier
   * test n'a AUCUNE traduction : `languageBand` rend `[]` et `PrismPastille`
   * se tait déjà quand la langue servie EST l'originale
   * (`message-blocks.tsx:60`). Retirer la garde `isVeiled` de l'appel à
   * `mountsBottomLine` laissait donc TOUTE la suite verte — mesuré.
   * Un message VOILÉ **et TRADUIT** est le seul qui puisse la faire rougir :
   * sans la garde, sa bande porterait le drapeau de sa langue d'origine, ce
   * que la loi du pied interdit précisément (« jamais de drapeau en clair sur
   * un message voilé »).
   */
  test('voilé ET traduit, tail ⇒ AUCUN drapeau (la garde isVeiled de mountsBottomLine est bien appelée)', () => {
    const veiledAndTranslated: Message = {
      ...BASE_MESSAGE,
      isBlurred: true,
      originalLanguage: 'en',
      content: 'Door code 5531',
      translations: [
        {
          id: 't2',
          messageId: BASE_MESSAGE.id,
          targetLanguage: 'fr',
          translatedContent: 'Code de la porte 5531',
          translationModel: 'medium',
          createdAt: new Date('2026-09-08T09:00:00.000Z'),
        },
      ],
    };
    const html = render(veiledAndTranslated, { tail: true });
    expect(html).not.toContain('aria-pressed');
    expect(html).not.toContain('Door code 5531');
    expect(html).not.toContain('Code de la porte 5531');

    /* LE MÊME message, voile RETIRÉ : la bande revient. Sans ce second volet
       le premier passerait aussi sur un composant qui ne monterait JAMAIS de
       drapeau — un témoin qui ne peut distinguer « gardé » de « absent ». */
    const { isBlurred: _removed, ...unveiled } = veiledAndTranslated;
    expect(render({ ...unveiled, isBlurred: false }, { tail: true })).toContain('aria-pressed');
  });
});

/**
 * L'ÉCHEC D'ENVOI, DANS LA BULLE (#5813, revue-correction). Deux défauts que
 * ces témoins tiennent fermés :
 *
 * 1. Un envoi ÉCHOUÉ porte `deliveredCount: 0`, que `deliveryOf` lit — à
 *    raison — comme « envoyé » : la coche ✓ s'affichait donc, avec
 *    `title="envoyé"`, à dix pixels de la bande « Non envoyé ». Deux
 *    affirmations contraires sur le même message. iOS ne peint jamais
 *    l'accusé d'un `.sendFailed` (`BubbleFooter.swift:186-197`).
 * 2. `lastError` était capturé sur l'entrée d'outbox et lu par PERSONNE — le
 *    défaut du cycle 122 du `CLAUDE.md` racine : « qui AFFICHE ce qu'il
 *    élit ? ». La cause est désormais DANS la bande.
 */
const renderMine = (props: {
  readonly localDelivery?: 'pending' | 'failed';
  readonly sendFailureReason?: string;
}) =>
  renderToStaticMarkup(
    <Bubble
      place={placeOf({ ...BASE_MESSAGE, senderId: 'u-viewer', deliveredCount: 0, readCount: 0 })}
      languages={['fr', 'en']}
      isGrouped
      viewerId="u-viewer"
      onJumpToMessage={() => {}}
      onRetry={() => {}}
      {...props}
    />,
  );

describe('Bubble — l’échec d’envoi (#5813)', () => {
  test('échoué : AUCUN accusé peint, et jamais le libellé « envoyé »', () => {
    const html = renderMine({ localDelivery: 'failed' });
    expect(html).toContain('Non envoyé');
    // `Glyph` sert son `title` en `aria-label` (`glyph.tsx`) : c'est CE nom
    // accessible qui disait « envoyé » sur un message qui ne l'était pas.
    expect(html).not.toContain('aria-label="envoyé"');
  });

  test('sans opinion locale, le MÊME message peint bien son accusé « envoyé » — le témoin ci-dessus mesure la GARDE, pas une absence de code', () => {
    expect(renderMine({})).toContain('aria-label="envoyé"');
  });

  test('la CAUSE est dans la bande, à l’œil et en info-bulle — jamais un champ mort', () => {
    const html = renderMine({ localDelivery: 'failed', sendFailureReason: 'envoi refusé pour cette conversation' });
    expect(html).toContain('Non envoyé — envoi refusé pour cette conversation');
    expect(html).toContain('title="envoi refusé pour cette conversation"');
  });

  test('hors ligne (aucune cause) : la bande reste sobre — le bandeau de coupure le dit déjà', () => {
    const html = renderMine({ localDelivery: 'failed' });
    expect(html).toContain('Non envoyé</span>');
    expect(html).not.toContain('Non envoyé —');
  });

  /**
   * LA CIBLE TACTILE DE LA BANDE (revue-correction #5813, défaut majeur 7) —
   * mesurée à 27 px de haut en police 10 px (`text-check`,
   * `--ios-font-caption`), le SEUL contrôle de réparation du fil sous la
   * règle « cibles >= 44 px » que le dépôt tient déjà ailleurs
   * (`routes/conversations.tsx`, l'erreur de liste).
   */
  test('la bande de reprise couvre au moins 44 px de haut, en text-mini (jamais text-check, 10 px)', () => {
    const html = renderMine({ localDelivery: 'failed' });
    expect(html).toContain('min-height:44px');
    expect(html).toContain('text-mini');
    expect(html).not.toContain('text-check');
  });
});

/**
 * UN REFUS PERMANENT N'OFFRE PAS DE REJEU (revue-correction #5813, défaut
 * majeur 2) — un rejeu ne peut PAS aboutir en rejouant le MÊME appel (403,
 * 401) : le geste « Réessayer » disparaît, la cause reste. `onRetry` absent
 * de la bulle EST le signal (`thread.tsx` l'omet des `sendProps` sur
 * `permanentOf` — pas une propriété booléenne séparée sur `Bubble`).
 */
describe('Bubble — un refus permanent perd le geste, jamais la cause (#5813)', () => {
  const renderPermanent = (reason: string) =>
    renderToStaticMarkup(
      <Bubble
        place={placeOf({ ...BASE_MESSAGE, senderId: 'u-viewer', deliveredCount: 0, readCount: 0 })}
        languages={['fr', 'en']}
        isGrouped
        viewerId="u-viewer"
        onJumpToMessage={() => {}}
        localDelivery="failed"
        sendFailureReason={reason}
      />,
    );

  test('sans onRetry : la cause reste affichée, « Réessayer » a disparu, et la bande n’est plus un bouton', () => {
    const html = renderPermanent('session expirée — reconnectez-vous');
    expect(html).toContain('Non envoyé — session expirée — reconnectez-vous');
    expect(html).not.toContain('Réessayer');
    expect(html).not.toContain('<button');
  });
});

/** `displayLanguage` / `myReactions` / `selected` (#5814, T12). */
describe('Bubble — displayLanguage, myReactions, selected (#5814, T12)', () => {
  const translated: Message = {
    ...BASE_MESSAGE,
    id: 'm2',
    originalLanguage: 'fr',
    content: 'Oui, tout est passé vers 3 h.',
    translations: [
      {
        id: 't-m2-en',
        messageId: 'm2',
        targetLanguage: 'en',
        translatedContent: 'Yes, everything went through around 3am.',
        translationModel: 'medium',
        createdAt: new Date('2026-09-08T09:00:00.000Z'),
      },
    ],
    reactionSummary: { '👍': 1 },
  };

  const renderWith = (extra: {
    displayLanguage?: string;
    myReactions?: readonly string[];
    selected?: boolean;
    onToggleSelect?: (id: string) => void;
  }) =>
    renderToStaticMarkup(
      <Bubble
        place={placeOf(translated)}
        languages={['es', 'en']}
        isGrouped
        viewerId="u-viewer"
        onJumpToMessage={() => {}}
        {...extra}
      />,
    );

  test('displayLanguage="fr" ⇒ lang="fr" et l’ORIGINAL, même si le Prisme servirait "en"', () => {
    const html = renderWith({ displayLanguage: 'fr' });
    expect(html).toContain('lang="fr"');
    expect(html).toContain('Oui, tout est passé vers 3 h.');
  });

  test('myReactions inclut l’emoji ⇒ la capsule se dit « la vôtre », sans aria-pressed', () => {
    const html = renderWith({ myReactions: ['👍'] });
    expect(html).toContain('la vôtre');
    // Compté, jamais cherché : les drapeaux du pied sont de vrais
    // `<button aria-pressed>` — un `not.toContain` global les mesurerait.
    const countOf = (markup: string) => markup.split('aria-pressed').length - 1;
    expect(countOf(html)).toBe(countOf(renderWith({})));
  });

  test('selected=true ⇒ une coche role="checkbox" aria-checked="true"', () => {
    const html = renderWith({ selected: true, onToggleSelect: () => {} });
    expect(html).toContain('role="checkbox"');
    expect(html).toContain('aria-checked="true"');
  });

  test('selected non fourni ⇒ aucune coche, et aucun aria-selected (invalide ici)', () => {
    const html = renderWith({});
    expect(html).not.toContain('role="checkbox"');
    expect(html).not.toContain('aria-selected');
  });
});

/**
 * RETIRER UNE RÉACTION EN TAPANT SA CAPSULE (#5865, suivi de #5814 T12) —
 * iOS le permet déjà (`BubbleReactionsOverlay.swift`), seul le rail du menu
 * du message (appui long) le permettait ici. `onReact` n'est câblé QUE sur
 * les capsules `mine` (`bubble.tsx`) : taper la capsule d'autrui reste un
 * `<span>` inerte, jamais un bouton qui basculerait une réaction qui n'est
 * pas la sienne.
 */
describe('Bubble — retirer une réaction en tapant sa capsule (#5865)', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
    GlobalRegistrator.register();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterAll(async () => {
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await GlobalRegistrator.unregister();
  });

  let container: HTMLDivElement;
  let root: Root;
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const withReactions: Message = {
    ...BASE_MESSAGE,
    id: 'm-reactions',
    reactionSummary: { '👍': 1, '❤️': 2 },
  };

  const mount = (onReact: (emoji: string) => void): HTMLDivElement => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <Bubble
          place={placeOf(withReactions)}
          languages={['fr', 'en']}
          isGrouped
          viewerId="u-viewer"
          onJumpToMessage={() => {}}
          myReactions={['👍']}
          onReact={onReact}
        />,
      );
    });
    return container;
  };

  test('tap sur SA capsule 👍 ⇒ onReact("👍"), sans passer par le menu long-appui', () => {
    const seen: string[] = [];
    const el = mount((emoji) => seen.push(emoji));
    const mine = el.querySelector('button[aria-label="Retirer votre réaction 👍"]') as HTMLButtonElement;
    expect(mine).not.toBeNull();
    act(() => {
      mine.click();
    });
    expect(seen).toEqual(['👍']);
  });

  test('la capsule ❤️ (pas la mienne) reste un <span> inerte — aucun bouton', () => {
    const el = mount(() => {});
    expect(el.querySelector('button[aria-label*="❤️"]')).toBeNull();
  });

  test('la cible tactile de la capsule est étendue (`tap-target-chip`), sans grandir le dessin', () => {
    const el = mount(() => {});
    const mine = el.querySelector('button[aria-label="Retirer votre réaction 👍"]') as HTMLButtonElement;
    expect(mine.className).toContain('tap-target-chip');
  });
});


/**
 * L'IMAGE D'UNE BULLE (revue-correction #5668) — la bulle OPTIMISTE d'une
 * photo qu'on vient de choisir porte un `fileUrl` en `blob:`
 * (`attachmentPreviewOf`, `send/attachments.ts`) que RIEN ne lisait : le
 * tiroir du composeur en montrait la vignette et la bulle envoyée juste
 * au-dessus un rectangle gris. « Qui AFFICHE ce qu'il élit ? » — cycle 122 du
 * `CLAUDE.md`.
 *
 * Le second cas est le rang AUTRE que le premier : une charge SANS URL (les
 * fixtures posent `fileUrl: ''`) ne doit produire AUCUN `<img>` — `src=""`
 * redemanderait la page courante, et le glyphe reste le fond légitime.
 */
describe('Bubble — la pièce jointe IMAGE (#5668, revue-correction)', () => {
  const withImage = (fileUrl: string): Message => ({
    ...BASE_MESSAGE,
    messageType: 'image',
    attachments: [
      {
        ...attachmentDefaults,
        id: 'att-1',
        messageId: BASE_MESSAGE.id,
        fileName: 'plage.jpg',
        originalName: 'plage.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1234,
        fileUrl,
        uploadedBy: 'u-amina',
        createdAt: '2026-09-08T09:00:00.000Z',
      },
    ],
  });

  test('une URL servie ⇒ un <img> qui la porte, avec son texte de remplacement', () => {
    const html = render(withImage('blob:http://localhost/abc'));
    expect(html).toContain('<img');
    expect(html).toContain('blob:http://localhost/abc');
    expect(html).toContain('alt="plage.jpg"');
  });

  test('AUCUNE URL ⇒ AUCUN <img> (jamais `src=""`), le glyphe reste seul et nommé', () => {
    const html = render(withImage(''));
    expect(html).not.toContain('<img');
    expect(html).toContain('aria-label="plage.jpg"');
  });
});

describe('Bubble — badges et rangée système (#5936)', () => {
  test('épinglé : le badge « épinglé » se peint', () => {
    const html = render({ ...BASE_MESSAGE, pinnedAt: new Date('2026-09-08T08:00:00.000Z') });
    expect(html).toContain('épinglé');
  });

  test('transféré, titre servi : « Transféré depuis {titre} », jamais un identifiant', () => {
    const html = render({
      ...BASE_MESSAGE,
      forwardedFromId: 'm0',
      forwardedFromConversationId: 'c-source',
      forwardedFromConversation: { id: 'c-source', title: 'Salon', identifier: 'salon-slug' },
    });
    expect(html).toContain('Transféré depuis Salon');
    expect(html).not.toContain('salon-slug');
  });

  test('transféré, titre absent : « Transféré » seul', () => {
    const html = render({ ...BASE_MESSAGE, forwardedFromConversationId: 'c-source' });
    expect(html).toContain('Transféré');
    expect(html).not.toContain('Transféré depuis');
  });

  test('modifié : « modifié » se peint dans la colonne méta', () => {
    const html = render({ ...BASE_MESSAGE, isEdited: true });
    expect(html).toContain('modifié');
  });

  test('un message ordinaire ne porte AUCUN badge', () => {
    const html = render(BASE_MESSAGE);
    expect(html).not.toContain('épinglé');
    expect(html).not.toContain('Transféré');
    expect(html).not.toContain('modifié');
  });

  test('rangée système : CENTRÉE (capsule), sans fond indigo/accent ni pied de bulle', () => {
    const html = render({
      ...BASE_MESSAGE,
      messageSource: 'system',
      content: 'Amina Diallo a rejoint la conversation.',
      translations: [],
    });
    expect(html).toContain('data-system-row');
    expect(html).toContain('rejoint la conversation');
    expect(html).not.toContain('var(--color-bubble-mine)');
  });

  test('rangée système supprimée : le tombstone GARDE priorité sur la rangée système (D-23)', () => {
    const html = render({
      ...BASE_MESSAGE,
      messageSource: 'system',
      deletedAt: new Date('2026-09-08T09:05:00.000Z'),
      content: 'JAMAIS',
    });
    expect(html).toContain('Message supprimé');
    expect(html).not.toContain('data-system-row');
    expect(html).not.toContain('JAMAIS');
  });

  test('emoji seul : le corps rend en grand (40 px), le texte SERVI décide — pas le contenu brut', () => {
    const html = render({ ...BASE_MESSAGE, content: '🎉🎊', translations: [] });
    expect(html).toContain('data-body-kind="emoji-only"');
    expect(html).toContain('font-size:40px');
  });

  test('texte ordinaire : `data-body-kind="text"`, pas de taille forcée', () => {
    const html = render(BASE_MESSAGE);
    expect(html).toContain('data-body-kind="text"');
    expect(html).not.toContain('font-size:40px');
  });

  test('les trois badges ensemble, dans l’ordre iOS : épinglé, transféré, modifié', () => {
    const html = render({
      ...BASE_MESSAGE,
      pinnedAt: new Date('2026-09-08T08:00:00.000Z'),
      forwardedFromConversationId: 'c-source',
      forwardedFromConversation: { id: 'c-source', title: 'Salon' },
      isEdited: true,
    });
    const pinnedAt = html.indexOf('épinglé');
    const forwardedAt = html.indexOf('Transféré depuis Salon');
    const editedAt = html.indexOf('modifié');
    expect(pinnedAt).toBeGreaterThan(-1);
    expect(forwardedAt).toBeGreaterThan(pinnedAt);
    expect(editedAt).toBeGreaterThan(forwardedAt);
  });
});
