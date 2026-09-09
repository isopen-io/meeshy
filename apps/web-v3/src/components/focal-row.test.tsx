import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { FocalRow } from './focal-row';
import type { Message } from '@/lib/api/types';
import type { PlacedMessage } from '@/lib/grouping';

/**
 * MÊME MATRICE QUE `bubble.test.tsx` (D-23, #5676), sur la rangée plate — et
 * un cas propre à Focal : le flou ne touche NI l'identité NI la méta
 * (`FocalRow.swift:272-277`, `FocalProtectedContent.swift:18-19`).
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
    <FocalRow
      mode="focal"
      place={placeOf(message, opts.tail ?? true)}
      languages={['fr', 'en']}
      viewerId="u-viewer"
      onJumpToMessage={() => {}}
      {...(opts.now ? { now: opts.now } : {})}
    />,
  );

describe('FocalRow — protection (D-23, #5676)', () => {
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

  test('éphémère échu : la rangée ne rend ni contenu ni tombstone', () => {
    const html = render({
      ...BASE_MESSAGE,
      expiresAt: new Date('2026-09-08T08:59:00.000Z'),
      content: 'Message qui a expiré',
    });
    expect(html).not.toContain('Message qui a expiré');
    expect(html).not.toContain('Message supprimé');
    expect(html).not.toContain('Vu et supprimé');
  });

  test('éphémère dans 2 minutes : aria-label du badge « Message éphémère, expire dans 2m 00s »', () => {
    const now = () => new Date('2026-09-08T09:00:00.000Z').getTime();
    const html = render(
      { ...BASE_MESSAGE, expiresAt: new Date('2026-09-08T09:02:00.000Z') },
      { now },
    );
    expect(html).toContain('Message éphémère, expire dans 2m 00s');
  });

  test('un message voilé garde le NOM de l’expéditeur et une heure lisibles (le flou ne touche ni l’identité ni la méta)', () => {
    const html = render({ ...BASE_MESSAGE, isBlurred: true, content: 'Secret' });
    expect(html).toContain('Amina Diallo');
    expect(html).toContain('<time');
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
 * L'ÉCHEC D'ENVOI, DANS LA RANGÉE PLATE (revue-correction #5813) — MÊME
 * matrice que `bubble.test.tsx` : la cible tactile de la bande (défaut
 * majeur 7) et le retrait du geste sur un refus permanent (défaut majeur 2).
 */
const renderFailed = (props: { readonly sendFailureReason?: string; readonly onRetry?: () => void }) =>
  renderToStaticMarkup(
    <FocalRow
      mode="focal"
      place={placeOf({ ...BASE_MESSAGE, senderId: 'u-viewer', deliveredCount: 0, readCount: 0 })}
      languages={['fr', 'en']}
      viewerId="u-viewer"
      onJumpToMessage={() => {}}
      localDelivery="failed"
      {...props}
    />,
  );

describe('FocalRow — l’échec d’envoi (#5813)', () => {
  test('la bande de reprise couvre au moins 44 px de haut, en text-mini (jamais text-check, 10 px)', () => {
    const html = renderFailed({ onRetry: () => {} });
    expect(html).toContain('min-height:44px');
    expect(html).toContain('text-mini');
    expect(html).not.toContain('text-check');
  });

  test('sans onRetry (refus permanent) : la cause reste affichée, « Réessayer » a disparu, plus de bouton', () => {
    const html = renderFailed({ sendFailureReason: 'envoi refusé pour cette conversation' });
    expect(html).toContain('Non envoyé — envoi refusé pour cette conversation');
    expect(html).not.toContain('Réessayer');
    expect(html).not.toContain('<button');
  });

  test('avec onRetry (échec transient) : le geste « Réessayer » est offert', () => {
    const html = renderFailed({ onRetry: () => {} });
    expect(html).toContain('Réessayer');
  });
});

/**
 * `displayLanguage` / `myReactions` / `selected` (#5814, T12) — le menu du
 * message (Traduire, la capsule « mienne », le mode sélection).
 */
describe('FocalRow — displayLanguage, myReactions, selected (#5814, T12)', () => {
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
      <FocalRow
        mode="focal"
        place={placeOf(translated)}
        languages={['es', 'en']}
        viewerId="u-viewer"
        onJumpToMessage={() => {}}
        {...extra}
      />,
    );

  test('sans displayLanguage : servi au rang du Prisme (en), lang="en"', () => {
    const html = renderWith({});
    expect(html).toContain('lang="en"');
    expect(html).toContain('Yes, everything went through around 3am.');
  });

  test('displayLanguage="fr" ⇒ lang="fr" et l’ORIGINAL, même si le Prisme servirait "en"', () => {
    const html = renderWith({ displayLanguage: 'fr' });
    expect(html).toContain('lang="fr"');
    expect(html).toContain('Oui, tout est passé vers 3 h.');
  });

  test('displayLanguage = la langue DÉJÀ servie ⇒ rendu identique (aucun panneau de plus)', () => {
    expect(renderWith({ displayLanguage: 'en' })).toBe(renderWith({}));
  });

  test('myReactions inclut l’emoji ⇒ la capsule se dit « la vôtre »', () => {
    expect(renderWith({ myReactions: ['👍'] })).toContain('la vôtre');
  });

  test('myReactions ne contient PAS l’emoji ⇒ aucune mention « la vôtre »', () => {
    expect(renderWith({ myReactions: ['❤️'] })).not.toContain('la vôtre');
  });

  /**
   * `aria-pressed` A ÉTÉ RETIRÉ DE LA CAPSULE (revue #5814) — il n'est défini
   * que sur `role="button"` : sur le `<span>` de la capsule il annonçait un
   * bouton bascule que rien ne bascule, sur CHAQUE capsule du fil. Le témoin
   * COMPTE les occurrences plutôt que de chercher la chaîne : les drapeaux du
   * pied sont, eux, de vrais `<button aria-pressed>` — un `not.toContain`
   * global mesurerait ceux-là et ne pourrait jamais tomber.
   */
  test('la capsule n’ajoute AUCUN aria-pressed (les drapeaux gardent le leur)', () => {
    const countOf = (html: string) => html.split('aria-pressed').length - 1;
    expect(countOf(renderWith({ myReactions: ['👍'] }))).toBe(countOf(renderWith({})));
  });

  test('selected=true ⇒ une coche role="checkbox" aria-checked="true"', () => {
    const html = renderWith({ selected: true, onToggleSelect: () => {} });
    expect(html).toContain('role="checkbox"');
    expect(html).toContain('aria-checked="true"');
  });

  test('selected=false ⇒ la coche existe, décochée', () => {
    const html = renderWith({ selected: false, onToggleSelect: () => {} });
    expect(html).toContain('role="checkbox"');
    expect(html).toContain('aria-checked="false"');
  });

  test('selected non fourni ⇒ aucune coche, et aucun aria-selected (invalide ici)', () => {
    const html = renderWith({});
    expect(html).not.toContain('role="checkbox"');
    expect(html).not.toContain('aria-selected');
  });
});
