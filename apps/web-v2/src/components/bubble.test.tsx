import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { EphemeralDeadline } from '@meeshy/shared/utils/ephemeral-deadline';

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

/**
 * `onPickLanguage` EST FOURNI ICI, comme le fil le fournit toujours (#6862,
 * revue-correction) — voir la jumelle de `focal-row.test.tsx` : les contrôles
 * du pied n'existent que par cette capacité.
 */
const render = (message: Message, opts: { tail?: boolean; now?: () => number } = {}) =>
  renderToStaticMarkup(
    <Bubble
      place={placeOf(message, opts.tail ?? true)}
      languages={['fr', 'en']}
      isGrouped
      viewerId="u-viewer"
      ephemeralDeadline={{ state: 'none' }}
      onJumpToMessage={() => {}}
      onPickLanguage={() => {}}
      {...(opts.now ? { now: opts.now } : {})}
    />,
  );

/** L'ÉCHÉANCE DESCENDUE PAR L'HÔTE (#7454) — voir le témoin qui la consomme. */
const renderAvecEcheance = (message: Message, deadline: EphemeralDeadline) =>
  renderToStaticMarkup(
    <Bubble
      place={placeOf(message, true)}
      languages={['fr', 'en']}
      isGrouped
      viewerId="u-viewer"
      ephemeralDeadline={deadline}
      onJumpToMessage={() => {}}
      onPickLanguage={() => {}}
    />,
  );

/** LA LECTURE SEULE — l'administration (#6862) : aucune langue à explorer. */
const renderSansPrise = (message: Message) =>
  renderToStaticMarkup(
    <Bubble
      place={placeOf(message, true)}
      languages={['fr', 'en']}
      isGrouped
      viewerId="u-viewer"
      ephemeralDeadline={{ state: 'none' }}
      onJumpToMessage={() => {}}
    />,
  );

const renderRetenu = (message: Message) =>
  renderToStaticMarkup(
    <Bubble
      place={placeOf(message, true)}
      languages={['fr', 'en']}
      isGrouped
      viewerId="u-viewer"
      ephemeralDeadline={{ state: 'none' }}
      onJumpToMessage={() => {}}
      revealable={false}
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

  /**
   * LA PIÈCE JOINTE D'UN MESSAGE PROTÉGÉ N'ATTEINT PAS LE DOM (#6184) — le cas
   * flouté existait déjà juste au-dessus, mais TOUJOURS avec du TEXTE. C'est
   * précisément le trou du cycle 125 de `CLAUDE.md` : les quatre gardes
   * retenaient une CHAÎNE, et le fichier partait à côté, dans l'objet voisin.
   * Une garde vérifiée sur du texte ne dit rien de ce qui TRANSPORTE.
   *
   * Le témoin porte sur le MÉDIA, sur les deux formes de la loi « l'un OU
   * l'autre » (`protectionOf:63`), et sur le balisage plutôt que sur une classe :
   * un `filter: blur()` n'est pas une rétention — les octets seraient dans la
   * page. Sa jumelle vit dans `focal-row.test.tsx`, la loi ayant deux hôtes.
   */
  const MEDIA_MESSAGE: Message = {
    ...BASE_MESSAGE,
    content: '',
    messageType: 'image',
    translations: [],
    attachments: [
      {
        id: 'a-secrete',
        messageId: BASE_MESSAGE.id,
        fileName: 'plan.png',
        originalName: 'plan.png',
        mimeType: 'image/png',
        fileSize: 96,
        fileUrl: 'data:image/png;base64,SECRET-PIXEL',
        uploadedBy: 'u-amina',
        createdAt: '2026-09-08T09:00:00.000Z',
        isViewOnce: false,
        viewOnceCount: 0,
        isBlurred: false,
        viewedCount: 0,
        downloadedCount: 0,
        consumedCount: 0,
        isEncrypted: false,
        isForwarded: false,
        isAnonymous: false,
        capturedInApp: false,
      },
    ],
  } as unknown as Message;

  for (const [forme, protection] of [
    ['floutée', { isBlurred: true }],
    ['à vue unique NON consommée', { isViewOnce: true, viewOnceCount: 0 }],
  ] as const) {
    test(`pièce jointe ${forme} : ni <img> ni l’URL du fichier dans le HTML, et la marque du voile est posée`, () => {
      const html = render({ ...MEDIA_MESSAGE, ...protection });
      expect(html).not.toContain('SECRET-PIXEL');
      expect(html).not.toContain('<img');
      expect(html).not.toContain('<audio');
      expect(html).not.toContain('data-attachment');
      expect(html).toContain('data-protected="hidden"');
    });
  }

  /**
   * LA CONTRE-ÉPREUVE — le MÊME média, non protégé, est bien rendu. Sans elle,
   * un `Bubble` qui cesserait de rendre TOUTE pièce jointe ferait passer les
   * deux témoins ci-dessus (leçon 261 : un témoin ne s'écrit pas sur le rang qui
   * rendrait le même verdict par accident).
   */
  test('CONTRÔLE : le MÊME média NON protégé rend bien son <img> et l’URL du fichier', () => {
    const html = render(MEDIA_MESSAGE);
    expect(html).toContain('SECRET-PIXEL');
    expect(html).toContain('<img');
    expect(html).not.toContain('data-protected="hidden"');
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

  /**
   * L'ÉCHÉANCE VIENT DE L'HÔTE (#7454) — cette peau ne lit plus `expiresAt`
   * pour décider d'un décompte : `resolveEphemeralDeadline` la compose chez
   * `ThreadModes`, depuis la RÉCEPTION locale, et la descend ici. Le témoin la
   * passe donc telle quelle, ce qui est aussi ce qui le rend déterministe.
   */
  test('échéance dans 2 minutes : aria-label « Message éphémère, disparaît dans 2m 00s »', () => {
    /* L'ÉCHÉANCE EST RELATIVE À MAINTENANT, et elle doit l'être : le décompte
       se lit sur l'horloge partagée, pas sur une horloge injectée — une date
       fixe de 2026-09-08 serait déjà passée au moment du run. */
    const html = renderAvecEcheance(BASE_MESSAGE, { state: 'scheduled', expiresAtMs: Date.now() + 120_500 });
    expect(html).toContain('Message éphémère, disparaît dans 2m 00s');
  });

  test('l’EXPÉDITEUR sans échéance voit « en attente de réception », jamais un décompte', () => {
    const html = renderAvecEcheance(BASE_MESSAGE, { state: 'awaiting-reception', durationSeconds: 120 });
    expect(html).toContain('data-ephemeral="awaiting"');
    expect(html).toContain('En attente de réception');
  });

  test('une VUE UNIQUE est nommée même SANS pièce jointe', () => {
    const html = renderAvecEcheance({ ...BASE_MESSAGE, isViewOnce: true }, { state: 'none' });
    expect(html).toContain('data-view-once');
    expect(html).toContain('Vue unique');
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
      ephemeralDeadline={{ state: 'none' }}
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
        ephemeralDeadline={{ state: 'none' }}
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
        ephemeralDeadline={{ state: 'none' }}
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
 * T4 (#6171) — après une traduction GREFFÉE (`message:translation`, via
 * `applyMessageTranslation`), `lang` SUIT la langue SERVIE : le nœud porteur
 * (`bubble.tsx`, inchangé) est déjà branché sur `served()` — ce témoin PROUVE
 * qu'il suit, à trois rangs du Prisme `['fr','en']` sur un original ESPAGNOL.
 */
describe('Bubble — `lang` SUIT la langue servie après une traduction greffée (#6171, T4)', () => {
  const spanish: Message = { ...BASE_MESSAGE, originalLanguage: 'es', content: 'Hola, ¿todo bien?', translations: [] };
  const renderAt = (translations: Message['translations']) =>
    renderToStaticMarkup(
      <Bubble place={placeOf({ ...spanish, translations })} languages={['fr', 'en']} isGrouped viewerId="u-viewer" ephemeralDeadline={{ state: 'none' }} onJumpToMessage={() => {}} />,
    );

  test('aucune traduction ⇒ lang="es", l’ORIGINAL', () => {
    const html = renderAt([]);
    expect(html).toContain('lang="es"');
    expect(html).toContain('Hola, ¿todo bien?');
  });

  test('traduction `en` greffée (rang 2) ⇒ lang="en"', () => {
    const html = renderAt([
      { id: 't-en', messageId: spanish.id, targetLanguage: 'en', translatedContent: 'Hi, all good?', translationModel: 'medium', createdAt: new Date() },
    ]);
    expect(html).toContain('lang="en"');
    expect(html).toContain('Hi, all good?');
  });

  test('traduction `fr` greffée EN PLUS (rang 1) ⇒ lang="fr", reprend la main sur `en`', () => {
    const html = renderAt([
      { id: 't-en', messageId: spanish.id, targetLanguage: 'en', translatedContent: 'Hi, all good?', translationModel: 'medium', createdAt: new Date() },
      { id: 't-fr', messageId: spanish.id, targetLanguage: 'fr', translatedContent: 'Salut, ça va ?', translationModel: 'medium', createdAt: new Date() },
    ]);
    expect(html).toContain('lang="fr"');
    expect(html).toContain('Salut, ça va ?');
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
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterAll(async () => {
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
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
          ephemeralDeadline={{ state: 'none' }}
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

/**
 * L'IDENTITÉ AU PIED DE LA BULLE PORTE LA PRÉSENCE (#5935, parité 1.3) —
 * miroir `BubbleStandardLayout.swift:1195-1203` : le pied de la DERNIÈRE
 * bulle d'une suite rend `SenderIdentity` avec `presence: presenceState`, la
 * même loi 1/3/5 que la rangée plate (`presenceOf`, `view/conversation.ts`,
 * déjà câblée sur `FocalRow` par #5774). La bulle en était l'unique lacune :
 * `bubble.tsx` posait un `<Avatar>` de pied SANS `presence`.
 */
describe('Bubble — identité au pied de la dernière bulle : présence servie (#5935)', () => {
  test('expéditeur EN LIGNE, groupé, tail, pas à moi ⇒ la pastille verte est rendue', () => {
    const html = render({ ...BASE_MESSAGE, sender: { ...BASE_MESSAGE.sender!, isOnline: true } }, { tail: true });
    expect(html).toContain('#34D399');
  });

  test('expéditeur HORS LIGNE ⇒ aucune pastille (ni verte ni grise)', () => {
    const html = render({ ...BASE_MESSAGE, sender: { ...BASE_MESSAGE.sender!, isOnline: false } }, { tail: true });
    expect(html).not.toContain('#34D399');
    expect(html).not.toContain('#9CA3AF');
  });

  test('message à SOI ⇒ aucun avatar de pied, donc aucune pastille', () => {
    const html = render(
      { ...BASE_MESSAGE, senderId: 'u-viewer', sender: { ...BASE_MESSAGE.sender!, isOnline: true } },
      { tail: true },
    );
    expect(html).not.toContain('#34D399');
  });
});

/**
 * T13 (#5936) — LES ÉTATS DU MESSAGE, en BULLE : mêmes sept vérités que
 * `focal-row.test.tsx`, avec les différences de peau (badges AVANT
 * `.rounded-bubble`, « modifié » INLINE dans la boîte, aucune boîte pour un
 * emoji seul ou un sticker).
 */
describe('Bubble — les états du message (#5936)', () => {
  const renderFull = (message: Message, onOpenStory?: (messageId: string) => void) =>
    renderToStaticMarkup(
      <Bubble
        place={placeOf(message)}
        languages={['fr', 'en']}
        isGrouped
        viewerId="u-viewer"
        ephemeralDeadline={{ state: 'none' }}
        onJumpToMessage={() => {}}
        {...(onOpenStory === undefined ? {} : { onOpenStory })}
      />,
    );

  test('(i) badges AVANT .rounded-bubble ; « modifié » DANS .rounded-bubble, AVANT le <p> du texte', () => {
    const html = renderFull({
      ...BASE_MESSAGE,
      pinnedAt: new Date('2026-09-10T09:00:00.000Z'),
      forwardedFromId: 'm-far',
      forwardedFromConversation: { id: 'c1', title: 'Salon', type: 'public' },
      isEdited: true,
    });
    const badgesIndex = html.indexOf('data-badges');
    const bubbleIndex = html.indexOf('rounded-bubble');
    expect(badgesIndex).toBeGreaterThan(-1);
    expect(badgesIndex).toBeLessThan(bubbleIndex);

    const editedIndex = html.indexOf('data-badge="edited"');
    const textIndex = html.indexOf('Bonjour, comment vas-tu');
    expect(editedIndex).toBeGreaterThan(bubbleIndex);
    expect(editedIndex).toBeLessThan(textIndex);
  });

  test('(ii) système ⇒ data-system avec la capsule system-notice, aucune .rounded-bubble, aucun pied', () => {
    const html = renderFull({
      ...BASE_MESSAGE,
      messageType: 'system',
      messageSource: 'system',
      content: 'Le chiffrement de bout en bout est activé',
    });
    expect(html).toContain('data-system="notice"');
    expect(html).toContain('system-notice');
    expect(html).not.toContain('rounded-bubble');
    expect(html).not.toContain('avatar-root');
  });

  test('(iii) emoji seul ⇒ aucune .rounded-bubble', () => {
    const html = renderFull({ ...BASE_MESSAGE, content: '👍' });
    expect(html).toContain('data-emoji-only="1"');
    expect(html).not.toContain('rounded-bubble');
  });

  test('(iv) sticker ⇒ côté 160, aucune .rounded-bubble', () => {
    const html = renderFull({ ...BASE_MESSAGE, content: '🔥', metadata: { sticker: { emoji: '🔥' } } });
    expect(html).toContain('data-sticker-emoji');
    expect(html).not.toContain('rounded-bubble');
  });

  test('(vi) story citée : bouton armé seulement avec id ET onOpenStory, HORS de la boîte colorée', () => {
    const messageWithStory: Message = {
      ...BASE_MESSAGE,
      storyReplyToId: 'p1',
      metadata: { postReplyTo: { id: 'p1', type: 'STORY', moodEmoji: null, previewText: 'x', thumbnailUrl: null, createdAt: '' } },
    };
    const armed = renderFull(messageWithStory, () => {});
    /* UN libellé, l'aperçu de scène compris (revue-correction #5936, défaut
       majeur 8) — miroir de l'assertion de `focal-row.test.tsx`. */
    expect(armed).toContain('aria-label="réponse à sa story, x"');
    const citationIndex = armed.indexOf('data-story-citation');
    const bubbleIndex = armed.indexOf('rounded-bubble');
    expect(citationIndex).toBeGreaterThan(-1);
    expect(citationIndex).toBeLessThan(bubbleIndex);
  });
});

/**
 * REVUE-CORRECTION #5936 — LE CORPS NU SORT DE LA BOÎTE, DONC DE SA TEINTE.
 * Un emoji seul ou un sticker ENVOYÉ n'a plus d'indigo derrière lui : ni son
 * heure ni son « modifié » ne peuvent porter `--color-meta-mine`
 * (`white 70%`) — iOS sert « la couleur meta neutre quel que soit isMe »
 * exactement là (`BubbleFooter.compactMetaColor:62-66`).
 */
describe('Bubble — le corps nu d’un message envoyé reste lisible', () => {
  const renderMineBare = (message: Message) =>
    renderToStaticMarkup(
      <Bubble
        place={placeOf(message)}
        languages={['fr']}
        isGrouped
        viewerId="u-viewer"
        ephemeralDeadline={{ state: 'none' }}
        onJumpToMessage={() => {}}
      />,
    );

  test('un emoji seul envoyé ne sert aucune teinte de bulle', () => {
    const html = renderMineBare({ ...BASE_MESSAGE, senderId: 'u-viewer', content: '👏', isEdited: true });
    expect(html).toContain('data-emoji-only="1"');
    expect(html).not.toContain('rounded-bubble');
    expect(html).not.toContain('var(--color-meta-mine)');
  });

  test('la bulle BOÎTÉE d’un message envoyé garde, elle, la teinte de marque', () => {
    const html = renderMineBare({ ...BASE_MESSAGE, senderId: 'u-viewer', isEdited: true });
    expect(html).toContain('rounded-bubble');
    expect(html).toContain('var(--color-meta-mine)');
  });
});

/**
 * L'INDICATEUR D'EFFETS DÉCORATIFS (#6175, revue-correction défaut majeur 1)
 * — `message.effectFlags` voyageait jusqu'au serveur sans qu'aucune surface
 * ne le rende. Voir le doc-comment de `EffectsIndicator` (`message-blocks.tsx`)
 * pour ce que ce lot rend (un badge statique) et diffère (le célébratoire
 * animé, sous réserve de la règle 32 de la charte).
 */
describe('Bubble — l’indicateur d’effets décoratifs (#6175, défaut majeur 1)', () => {
  test('aucun effet ⇒ aucun badge « effects »', () => {
    const html = render({ ...BASE_MESSAGE });
    expect(html).not.toContain('data-badge="effects"');
  });

  test('un bit de CYCLE DE VIE seul (BLURRED) ⇒ aucun badge « effects »', () => {
    const html = render({ ...BASE_MESSAGE, effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED, isBlurred: true });
    expect(html).not.toContain('data-badge="effects"');
  });

  test('CONFETTI actif ⇒ badge « effects » rendu, aria-hidden (le libellé vit dans rowLabel)', () => {
    const html = render({ ...BASE_MESSAGE, effectFlags: MESSAGE_EFFECT_FLAGS.CONFETTI });
    expect(html).toContain('data-badge="effects"');
    expect(html).toContain('aria-hidden');
    expect(html).toContain('title="Confettis"');
    expect(html).toContain('>1<');
  });

  test('deux bits décoratifs ⇒ le compte est 2, pas 1', () => {
    const html = render({
      ...BASE_MESSAGE,
      effectFlags: MESSAGE_EFFECT_FLAGS.SHAKE | MESSAGE_EFFECT_FLAGS.SPARKLE,
    });
    expect(html).toContain('>2<');
  });
});

/**
 * L'HÔTE REMET LE CARRIER À LA VISIONNEUSE (#6169, U3) — `bubble.tsx:289-294`
 * appelle `mediaCarrierOf({ message, caption: rendered })` et le passe à
 * `Attachments`. `MediaCarrier` n'a pas de prop de rendu directe sur la
 * grille (loi 4 : un carrier absent ne change RIEN visuellement AVANT
 * l'ouverture) — la preuve passe donc par l'OUVERTURE de la visionneuse
 * (chunk `lazy()`, `Suspense`), seul consommateur de `carrier`
 * (`CarrierFooter`, `media-viewer.tsx`).
 */
describe('Bubble — remet le carrier (auteur, date) à la visionneuse ouverte (#6169)', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterAll(async () => {
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });

  let container: HTMLDivElement;
  let root: Root;
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const withFourImages: Message = {
    ...BASE_MESSAGE,
    id: 'm-carrier-grid',
    messageType: 'image',
    sender: { ...BASE_MESSAGE.sender!, displayName: 'Kwame Mensah' },
    attachments: [1, 2, 3, 4].map((n) => ({
      ...attachmentDefaults,
      id: `att-carrier-${n}`,
      messageId: 'm-carrier-grid',
      fileName: `photo-${n}.png`,
      originalName: `photo-${n}.png`,
      mimeType: 'image/png',
      fileSize: 96,
      width: 640,
      height: 427,
      fileUrl: `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNITvsIAALqAbsneUV/AAAAAElFTkSuQmCC`,
      uploadedBy: 'u-amina',
      createdAt: '2026-09-08T09:00:00.000Z',
    })),
  };

  test('la 1ʳᵉ tuile ouvre la visionneuse, dont le pied porte le NOM de l’expéditeur', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <Bubble place={placeOf(withFourImages)} languages={['fr', 'en']} isGrouped viewerId="u-viewer" ephemeralDeadline={{ state: 'none' }} onJumpToMessage={() => {}} />,
      );
    });

    const tile = container.querySelector('[data-media-tile]') as HTMLButtonElement;
    expect(tile).not.toBeNull();
    act(() => {
      tile.click();
    });
    // `MediaViewer` est un CHUNK À LA DEMANDE — `lazy(() => import('./media-
    // viewer'))`, `attachment-blocks.tsx:51`. Le coût de ce `import()` n'est
    // PAS une constante : il ne se paie qu'au PREMIER importateur du process.
    // Un seul tour de boucle suffisait donc quand un autre fichier avait déjà
    // chargé le module, et pas quand celui-ci est le premier — c'est bun qui
    // décide, en répartissant les fichiers. Attendre l'EFFET plutôt qu'une
    // durée rend le témoin indépendant de cette répartition, sans lui retirer
    // ses dents : la boucle est bornée, et un pied qui ne vient jamais fait
    // tomber l'assertion ci-dessous comme avant.
    const footerWithin = async (attempts: number): Promise<Element | null> => {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
        // `MediaViewer` rend par `createPortal(…, document.body)` (§ media-
        // viewer.tsx) — HORS de `container`, il faut donc interroger le
        // DOCUMENT, pas la racine montée.
        const found = document.querySelector('[data-viewer-footer]');
        if (found) return found;
      }
      return null;
    };

    const footer = await footerWithin(50);
    expect(footer).not.toBeNull();
    expect(footer?.textContent).toContain('Kwame Mensah');
  });
});

/** LA BULLE DÉCLARE SA FORME DE GRILLE (revue #6169) — une boîte noire unique (`BubbleStandardLayout.swift:814-817`). */
describe('Bubble — la grille de médias en boîte unique (revue #6169)', () => {
  test('4 images ⇒ [data-media-grid][data-media-frame="box"]', () => {
    const fourImages: Message = {
      ...BASE_MESSAGE,
      id: 'm-frame-grid',
      messageType: 'image',
      attachments: [1, 2, 3, 4].map((n) => ({
        ...attachmentDefaults,
        id: `att-frame-${n}`,
        messageId: 'm-frame-grid',
        fileName: `photo-${n}.png`,
        originalName: `photo-${n}.png`,
        mimeType: 'image/png',
        fileSize: 96,
        width: 640,
        height: 427,
        fileUrl: 'data:image/png;base64,iVBORw0KGgo=',
        uploadedBy: 'u-amina',
        createdAt: '2026-09-08T09:00:00.000Z',
      })),
    };
    const html = renderToStaticMarkup(
      <Bubble place={placeOf(fourImages)} languages={['fr']} isGrouped viewerId="u-viewer" ephemeralDeadline={{ state: 'none' }} onJumpToMessage={() => {}} />,
    );
    expect(html).toContain('data-media-frame="box"');
    expect(html).not.toContain('data-media-frame="tiles"');
  });
});

/**
 * **LE CONTENU RETENU AU SERVEUR** (#6862) — `revealable={false}`.
 *
 * Distinct des quatre protections que `protectionOf` connaît : ici le texte
 * n'est pas MASQUÉ à l'affichage, il n'est PAS DANS LA CHARGE. La lecture
 * souveraine de l'administration le retient au serveur
 * (`messageContentIsProtected`) et sert `isProtected` à la place.
 *
 * Deux choses à garder, et la seconde est la vraie :
 *
 * 1. la mention est PEINTE — sans elle, un message chiffré rend une bulle VIDE,
 *    puisque la loi CLIENT ne connaît ni `isEncrypted` ni `encryptionMode` et
 *    le classe « standard » ;
 * 2. AUCUN voile à toucher — « Toucher pour révéler le contenu » découvrirait
 *    une bulle vide. C'est le contrôle sans effet que la loi 4 interdit, sous
 *    sa forme la plus trompeuse : un bouton qui promet ce que personne ne lui a
 *    donné.
 *
 * Jumelle dans ``focal-row.test.tsx`` — la loi a DEUX hôtes, et `thread-modes.tsx` ne monte
 * qu'UN mode à la fois : un témoin d'écran ne peut donc en couvrir qu'un seul.
 */
describe('Bubble — contenu retenu au serveur (#6862)', () => {
  test('rend la mention, jamais une bulle vide — même quand la loi client dit « standard »', () => {
    const html = renderRetenu({ ...BASE_MESSAGE, content: '', translations: [], isEncrypted: true });
    expect(html).toContain('Contenu retenu');
  });

  test('n’offre AUCUN voile à toucher : il n’y a rien à révéler', () => {
    const html = renderRetenu({ ...BASE_MESSAGE, content: '', translations: [], isEncrypted: true });
    expect(html).not.toContain('data-protected="hidden"');
    expect(html).not.toContain('Toucher pour révéler');
  });

  test('et il PRIME sur le voile ordinaire — un message flouté SANS son texte ne promet pas de le rendre', () => {
    const html = renderRetenu({ ...BASE_MESSAGE, content: '', translations: [], isBlurred: true });
    expect(html).toContain('Contenu retenu');
    expect(html).not.toContain('data-protected="hidden"');
  });

  test('CONTRASTE — `revealable` par défaut laisse le voile ordinaire intact', () => {
    const html = render({ ...BASE_MESSAGE, isBlurred: true, content: 'SECRET-4817', translations: [] });
    expect(html).toContain('data-protected="hidden"');
    expect(html).not.toContain('Contenu retenu');
  });

  /**
   * **ET L'HÔTE PASSE LES PIÈCES** (#7023, relecture adversaire).
   *
   * `protection-notice.test.tsx` monte `ProtectionNotice` DIRECTEMENT : il
   * prouve que le composant SAIT dire le constat sur ses deux surfaces, jamais
   * que la bulle le lui DONNE. Et le chemin produit du constat — la lecture
   * souveraine — est câblé en `focal` (`MODE_DE_LECTURE`,
   * `routes/admin-conversation-reading.tsx`), donc aucun témoin d'écran ne
   * traverse la peau BULLE : retirer `attachments={message.attachments}` de
   * `bubble.tsx` ne faisait rougir personne (mesuré).
   *
   * C'est « un import dit ce qui est DISPONIBLE, jamais ce qui est APPELÉ »
   * appliqué à une prop, et la même forme que le défaut que ce lot ferme :
   * la surface bulle du COMPOSANT était couverte, le câblage de son HÔTE
   * ne l'était pas. Piège armé plutôt que fuite — la bulle ne rend aucun
   * `withheld` aujourd'hui — mais c'est exactement le régime que la règle du
   * cycle 84 refuse de laisser en place : le jour où l'administration offre
   * un sélecteur de mode, le constat disparaîtrait sans qu'un témoin tombe.
   */
  const pieceRetenue = (id: string, mimeType: string) => ({
    ...attachmentDefaults,
    id,
    messageId: BASE_MESSAGE.id,
    fileName: id,
    originalName: id,
    mimeType,
    fileSize: 2048,
    fileUrl: '',
    uploadedBy: 'u-amina',
    createdAt: '2026-09-08T09:00:00.000Z',
  });

  test('… et il DIT les pièces retenues — c’est l’HÔTE qui passe `attachments`, pas le composant qui les devine', () => {
    const html = renderRetenu({
      ...BASE_MESSAGE,
      content: '',
      translations: [],
      isEncrypted: true,
      attachments: [
        pieceRetenue('a-1', 'image/png'),
        pieceRetenue('a-2', 'image/png'),
        pieceRetenue('a-3', 'video/mp4'),
      ],
    });
    expect(html).toContain('Contenu retenu');
    expect(html).toContain('data-withheld-media');
    expect(html).toContain('2 images, 1 vidéo');
  });

  test('CONTRASTE — retenu SANS pièce ne porte aucun constat (sans quoi le témoin ci-dessus ne mesure rien)', () => {
    const html = renderRetenu({ ...BASE_MESSAGE, content: '', translations: [], isEncrypted: true });
    expect(html).toContain('Contenu retenu');
    expect(html).not.toContain('data-withheld-media');
  });
});

/**
 * **AUCUN CONTRÔLE DE LANGUE SANS CAPACITÉ DE LANGUE** (#6862,
 * revue-correction) — jumelle du témoin de `focal-row.test.tsx`, la loi ayant
 * DEUX peaux. La pastille et les drapeaux sont de vrais boutons ; sans
 * `onPickLanguage`, leur clic appelait `undefined` et le texte lu ne changeait
 * pas. L'administration est le premier hôte qui n'a pas cette capacité.
 */
describe('Bubble — la prise de langue absente retire le GESTE, pas le fait (#6862)', () => {
  const TRADUIT: Message = {
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

  test('sans `onPickLanguage` : AUCUN bouton de prise de langue', () => {
    const html = renderSansPrise(TRADUIT);
    expect(html).not.toContain('data-prism-toggle');
    expect(html).not.toContain('data-prism-flag');
    expect(html).not.toContain('langue d’origine');
  });

  test('sans `onPickLanguage` : le FAIT de la traduction reste dit', () => {
    const html = renderSansPrise(TRADUIT);
    expect(html).toContain('data-prism-indicator');
  });

  test('CONTRASTE — le fil, lui, porte la capacité : les deux contrôles sont là', () => {
    const html = render(TRADUIT, { tail: true });
    expect(html).toContain('data-prism-toggle');
    expect(html).toContain('data-prism-flag');
  });
});
