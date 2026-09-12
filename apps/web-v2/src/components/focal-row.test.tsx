import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
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

const placeOf = (message: Message, tail = true, head = true): PlacedMessage => ({
  message,
  head,
  tail,
  opensDay: null,
});

const render = (message: Message, opts: { tail?: boolean; head?: boolean; now?: () => number } = {}) =>
  renderToStaticMarkup(
    <FocalRow
      mode="focal"
      place={placeOf(message, opts.tail ?? true, opts.head ?? true)}
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

  /**
   * LA PIÈCE JOINTE D'UN MESSAGE PROTÉGÉ N'ATTEINT PAS LE DOM (#6184) — jumelle
   * du témoin de `bubble.test.tsx`, la loi ayant DEUX hôtes et `protection.ts`
   * un seul domicile. Le cas flouté existait déjà au-dessus, mais toujours avec
   * du TEXTE : c'est le trou du cycle 125 de `CLAUDE.md`, où les gardes
   * retenaient une CHAÎNE pendant que le fichier partait à côté.
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

/**
 * RETIRER UNE RÉACTION EN TAPANT SA CAPSULE (#5865, suivi de #5814 T12) —
 * même comportement que `bubble.test.tsx`, sur la rangée plate.
 */
describe('FocalRow — retirer une réaction en tapant sa capsule (#5865)', () => {
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
        <FocalRow
          mode="focal"
          place={placeOf(withReactions)}
          languages={['fr', 'en']}
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
});

/**
 * L'IDENTITÉ DE TÊTE DE GROUPE (#5774, travail 2/3) — présence servie et
 * marqueur « Sans compte », miroir `FocalIdentityHeader.swift:99-161`. La
 * présence vient de `presenceOf` (`view/conversation.ts`, D-1 « offline =
 * pas de pastille ») ; le marqueur d'un « Sans compte » vient du `type`
 * `Participant` (`'anonymous'`), jamais un champ recopié.
 */
describe('FocalRow — identité de tête de groupe : présence et « Sans compte » (#5774)', () => {
  test('un expéditeur EN LIGNE porte la pastille verte ; un expéditeur HORS LIGNE n’en porte AUCUNE', () => {
    const online = render({ ...BASE_MESSAGE, sender: { ...BASE_MESSAGE.sender!, isOnline: true } });
    expect(online).toContain('#34D399');

    const offline = render({ ...BASE_MESSAGE, sender: { ...BASE_MESSAGE.sender!, isOnline: false } });
    expect(offline).not.toContain('#34D399');
    expect(offline).not.toContain('#9CA3AF');
  });

  test('un visiteur SANS COMPTE (`sender.type === "anonymous"`) porte le marqueur « Sans compte » AVANT son nom', () => {
    const html = render({
      ...BASE_MESSAGE,
      sender: { ...BASE_MESSAGE.sender!, type: 'anonymous', displayName: 'Visiteur' },
    });
    expect(html).toContain('Sans compte');
    expect(html.indexOf('Sans compte')).toBeLessThan(html.indexOf('Visiteur'));
  });

  test('un membre ordinaire (`type: "user"`) ne porte AUCUN marqueur « Sans compte »', () => {
    const html = render(BASE_MESSAGE);
    expect(html).not.toContain('Sans compte');
  });

  test('la ligne d’identité réserve AVATAR_FRAME (34 px) de hauteur minimale, pastille posée ou non', () => {
    const withDot = render({ ...BASE_MESSAGE, sender: { ...BASE_MESSAGE.sender!, isOnline: true } });
    const withoutDot = render(BASE_MESSAGE);
    expect(withDot).toContain('min-height:34px');
    expect(withoutDot).toContain('min-height:34px');
  });

  /**
   * LA COULEUR DU NOM DE SOI (revue #5935, défaut majeur 2) — un message à
   * SOI porte `--color-self-name-ink` (indigo700 clair / indigo200 sombre,
   * dérivé — voir `generate-from-ios.mjs`), jamais `--color-ios-ink`
   * (l'encre PARTAGÉE avec tout autre expéditeur, qui rendrait sa tête
   * indiscernable) NI `--ios-indigo-500` servi tel quel (mesuré sous AA,
   * 4,47:1 / 4,45:1).
   */
  test('un message à SOI porte `--color-self-name-ink` sur son NOM ; un message d’autrui porte `--color-ios-ink`', () => {
    // Le `<p>` du texte servi porte TOUJOURS `--color-ios-ink` (`isMine` ne le
    // change pas) — la couleur qui compte est celle du NOM, dans
    // `[data-identity]` seul, jamais l'intégralité de la rangée.
    const nameColorOf = (html: string): string => {
      const start = html.indexOf('data-identity');
      const end = html.indexOf('</div>', start);
      const block = html.slice(start, end);
      const match = block.match(/font-extrabold[^>]*style="([^"]*)"/);
      return match?.[1] ?? '';
    };

    const mine = render({ ...BASE_MESSAGE, senderId: 'u-viewer', sender: { ...BASE_MESSAGE.sender!, userId: 'u-viewer', displayName: 'Vous' } });
    expect(nameColorOf(mine)).toContain('color:var(--color-self-name-ink)');
    expect(nameColorOf(mine)).not.toContain('var(--color-ios-ink)');

    const theirs = render(BASE_MESSAGE);
    expect(nameColorOf(theirs)).toContain('color:var(--color-ios-ink)');
    expect(nameColorOf(theirs)).not.toContain('self-name-ink');
  });
});

/**
 * UN SEUL LIBELLÉ, PAS DEUX (revue #5935, défauts majeurs 1/4) —
 * `[data-row]` porte déjà `role="article"` + `aria-label` composé
 * (`thread-modes.tsx`) ; `role="article"` ne réduit PAS son sous-arbre.
 * Sans `aria-hidden` sur les nœuds PRÉSENTATIONNELS qui redisent ce que le
 * libellé dit déjà (identité, texte servi, heure/accusé), un lecteur
 * d'écran annonçait chaque rangée DEUX FOIS (mesuré, arbre AX réel CDP :
 * `[article]` PUIS `[StaticText] "Amina Diallo"` / `[paragraph]` /
 * `[time]`, aucun `ignored`). Les CONTRÔLES (pastille du Prisme, drapeaux,
 * citation, réactions) restent HORS de ce masque — ce test vérifie qu'ils
 * ne portent PAS `aria-hidden`, exactement l'inverse des trois nœuds
 * statiques.
 */
describe('FocalRow — un seul libellé au lecteur d’écran (revue #5935)', () => {
  const identityBlock = (html: string): string => {
    const start = html.indexOf('data-identity');
    const end = html.indexOf('</div>', start);
    return html.slice(start, end);
  };

  test('la ligne d’identité (`[data-identity]`) est `aria-hidden`', () => {
    const html = render(BASE_MESSAGE);
    expect(identityBlock(html)).toContain('aria-hidden="true"');
  });

  test('le texte SERVI (le `<p>` du contenu) est `aria-hidden`', () => {
    const html = render(BASE_MESSAGE);
    const pStart = html.indexOf('<p ');
    const pEnd = html.indexOf('</p>', pStart);
    const paragraph = html.slice(pStart, pEnd);
    expect(paragraph).toContain('Bonjour');
    expect(paragraph).toContain('aria-hidden="true"');
  });

  test('la colonne méta (heure + accusé) est `aria-hidden`, rangée ordinaire ET rangée élue', () => {
    const ordinary = render(BASE_MESSAGE);
    const ordinaryStart = ordinary.indexOf('focal-meta');
    expect(ordinary.slice(ordinaryStart - 80, ordinaryStart + 20)).toContain('aria-hidden="true"');
  });

  test('la pastille du Prisme et les drapeaux restent HORS du masque (ce sont des CONTRÔLES)', () => {
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
    const html = render(translated);
    expect(html).toContain('langue d’origine');
    // La pastille et les drapeaux sont des `<button>` : aucun `aria-hidden`
    // ne doit précéder leur `aria-label`/`aria-pressed` immédiat.
    const buttonStart = html.indexOf('<button');
    const buttonEnd = html.indexOf('>', buttonStart);
    expect(html.slice(buttonStart, buttonEnd)).not.toContain('aria-hidden');
  });

  /**
   * LE GLYPHE, PAS LE TEXTE (#5935) — miroir `FocalIdentityHeader.swift:129-139` :
   * le fantôme précède le nom, il ne se lit pas deux fois. `GlyphSvg` pose
   * `role="img"` + `aria-label` depuis SON `title` (`glyph.tsx:36-38`) — le
   * texte « Sans compte » n'apparaît donc plus qu'UNE fois dans le HTML,
   * porté par l'attribut, jamais par un `<span>` visible.
   */
  test('un SANS COMPTE porte le GLYPHE masque (role="img" aria-label="Sans compte") AVANT le nom, et plus aucun badge textuel', () => {
    const html = render({
      ...BASE_MESSAGE,
      sender: { ...BASE_MESSAGE.sender!, type: 'anonymous', displayName: 'Visiteur' },
    });
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Sans compte"');
    expect(html.indexOf('aria-label="Sans compte"')).toBeLessThan(html.indexOf('Visiteur'));
    expect((html.match(/Sans compte/g) ?? []).length).toBe(1);
  });

  /**
   * L'ANCRE DE GATE (#5935) — `data-identity` marque la ligne d'identité
   * pour `scripts/lib/check-identity.mjs`, qui n'a aucun autre moyen fiable
   * de la distinguer du reste de la rangée. Posée SEULEMENT en tête de
   * groupe : une continuation n'a pas d'en-tête à mesurer.
   */
  /**
   * LE NOM DIT « SOI » DEUX FOIS (revue #5935) — miroir
   * `FocalIdentityHeader.swift:87-92` : le TEXTE est le littéral de soi
   * (`focal.row.you`, « Toi » côté iOS, « Vous » côté web — la prose du web
   * vouvoie déjà partout), sa COULEUR est `MeeshyColors.indigo500`, et
   * l'AVATAR garde les initiales de la PERSONNE (`senderDisplayName`), que
   * la passerelle sert réellement dès `VITE_DATA_SOURCE=gateway`.
   */
  test('un message à SOI affiche « Vous », mais l’avatar garde les INITIALES de la personne', () => {
    const html = render({
      ...BASE_MESSAGE,
      senderId: 'u-viewer',
      sender: { ...BASE_MESSAGE.sender!, userId: 'u-viewer', displayName: 'Jeanne Kouassi' },
    });
    expect(html).toContain('>Vous</span>');
    expect(html).not.toContain('Jeanne Kouassi');
    expect(html).toContain('>JK</span>');
  });

  test('la ligne d’identité porte data-identity sur une TÊTE de groupe, et n’existe pas sur une continuation', () => {
    const head = render(BASE_MESSAGE, { head: true });
    expect(head).toContain('data-identity');

    const continuation = render(BASE_MESSAGE, { head: false });
    expect(continuation).not.toContain('data-identity');
  });
});

/**
 * T12 (#5936) — LES ÉTATS DU MESSAGE : épinglé, transféré, modifié, système,
 * sticker, emoji seul, lieu, story citée — sur la rangée PLATE.
 */
describe('FocalRow — les états du message (#5936)', () => {
  const renderFull = (message: Message, onOpenStory?: (messageId: string) => void) =>
    renderToStaticMarkup(
      <FocalRow
        mode="focal"
        place={placeOf(message)}
        languages={['fr', 'en']}
        viewerId="u-viewer"
        onJumpToMessage={() => {}}
        {...(onOpenStory === undefined ? {} : { onOpenStory })}
      />,
    );

  test('(i) épinglé + transféré + modifié : les DEUX badges sont AVANT data-identity, « modifié » est DANS .focal-meta', () => {
    const html = renderFull({
      ...BASE_MESSAGE,
      pinnedAt: new Date('2026-09-10T09:00:00.000Z'),
      forwardedFromId: 'm-far',
      forwardedFromConversation: { id: 'c1', title: 'Salon', type: 'public' },
      isEdited: true,
    });
    const pinnedIndex = html.indexOf('data-badge="pinned"');
    const forwardedIndex = html.indexOf('data-badge="forwarded"');
    const identityIndex = html.indexOf('data-identity');
    expect(pinnedIndex).toBeGreaterThan(-1);
    expect(forwardedIndex).toBeGreaterThan(pinnedIndex);
    expect(identityIndex).toBeGreaterThan(forwardedIndex);

    /* HORS de `.focal-meta` — cette colonne vaut `opacity: 0` au repos
       (`thread-scene.css:39-43`) et `opacity: 0 !important` sur la rangée
       ÉLUE (`:51-61`). iOS ne gate QUE le tampon et les coches
       (`FocalMetaRow.swift:83-99`) ; « modifié » reste visible. Le badge
       PRÉCÈDE donc la colonne méta, en sœur, au lieu d'y être enfermé
       (revue-correction #5936). */
    const focalMetaIndex = html.indexOf('focal-meta');
    const editedIndex = html.indexOf('data-badge="edited"');
    expect(editedIndex).toBeGreaterThan(-1);
    expect(editedIndex).toBeLessThan(focalMetaIndex);
  });

  test('(ii) messageSource:"system" ⇒ data-system, aucune identité/méta/avatar, heure avant le texte', () => {
    const html = renderFull({
      ...BASE_MESSAGE,
      messageType: 'system',
      messageSource: 'system',
      content: 'Le chiffrement de bout en bout est activé',
    });
    expect(html).toContain('data-system="notice"');
    expect(html).not.toContain('data-identity');
    expect(html).not.toContain('focal-meta');
    expect(html).not.toContain('avatar-root');
    expect(html).not.toContain('rounded-bubble');
    const timeIndex = html.indexOf('09:00');
    expect(timeIndex).toBeGreaterThan(-1);
  });

  test('(iii) emoji seul : le texte ORIGINAL même si une traduction existe (témoin de RANG)', () => {
    const html = renderFull({
      ...BASE_MESSAGE,
      content: '🔥🔥🔥',
      originalLanguage: 'en',
      translations: [
        { id: 't1', messageId: BASE_MESSAGE.id, targetLanguage: 'fr', translatedContent: 'feu feu feu', translationModel: 'medium', createdAt: new Date() },
      ],
    });
    expect(html).toContain('data-emoji-only="1"');
    expect(html).toContain('font-size:45px');
    expect(html).toContain('🔥🔥🔥');
    expect(html).not.toContain('feu feu feu');
  });

  test('(iv) sticker : SANS gabarit + emoji ⇒ le GLYPHE natif, même AVEC une pièce jointe (revue-correction #5936, défaut majeur 6a)', () => {
    /* `RenderSource.resolve` (`BubbleSticker.swift:60-70`) : un sticker SANS
       gabarit qui porte un emoji rend TOUJOURS le glyphe natif — le PNG
       n'est que le repli des clients qui ne dessinent pas. L'ancienne
       assertion (`alt="Sticker 🔥"`, la forme `<img>`) ENTÉRINAIT la
       priorité inversée. */
    const withPicture = renderFull({
      ...BASE_MESSAGE,
      content: '🔥',
      metadata: { sticker: { emoji: '🔥' } },
      attachments: [
        {
          id: 'a1',
          messageId: BASE_MESSAGE.id,
          fileName: 's.png',
          originalName: 's.png',
          mimeType: 'image/png',
          fileSize: 4,
          fileUrl: 'data:image/png;base64,AAAA',
          uploadedBy: 'u-amina',
          createdAt: new Date().toISOString(),
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
    });
    expect(withPicture).toContain('data-sticker-emoji');
    expect(withPicture).toContain('aria-label="Sticker 🔥"');
    expect(withPicture).not.toContain('<img');
    /* La boîte du glyphe (60) est CONSTANTE, indépendante de `side` (112 en
       rangée plate) — défaut majeur 6b. */
    expect(withPicture).toContain('width:60px');
    expect(withPicture).toContain('font-size:90px');

    const bare = renderFull({ ...BASE_MESSAGE, content: '🔥', metadata: { sticker: { emoji: '🔥' } } });
    expect(bare).toContain('data-sticker-emoji');

    /* SANS emoji, un GABARIT inconnu de web ⇒ la pièce jointe, à `side` (112). */
    const pictureOnly = renderFull({
      ...BASE_MESSAGE,
      content: '',
      metadata: { sticker: { templateId: 'gabarit-inconnu' } },
      attachments: [
        {
          id: 'a2',
          messageId: BASE_MESSAGE.id,
          fileName: 's.png',
          originalName: 's.png',
          mimeType: 'image/png',
          fileSize: 4,
          fileUrl: 'data:image/png;base64,AAAA',
          uploadedBy: 'u-amina',
          createdAt: new Date().toISOString(),
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
    });
    expect(pictureOnly).toContain('<img');
    expect(pictureOnly).toContain('width="112"');
    expect(pictureOnly).not.toContain('data-sticker-emoji');
  });

  test('(v) lieu : lien Plans nommé, aria-label composé', () => {
    const html = renderFull({
      ...BASE_MESSAGE,
      content: '',
      messageType: 'location',
      metadata: { location: { latitude: 48.8584, longitude: 2.2945, name: 'Tour Eiffel' } },
    });
    expect(html).toContain('href="https://maps.apple.com/?ll=48.85840,2.29450&amp;q=Tour%20Eiffel"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('aria-label="Position : Tour Eiffel"');
  });

  test('(vi) story citée : bouton armé seulement avec id ET onOpenStory', () => {
    const messageWithStory: Message = {
      ...BASE_MESSAGE,
      storyReplyToId: 'p1',
      metadata: { postReplyTo: { id: 'p1', type: 'STORY', moodEmoji: null, previewText: 'x', thumbnailUrl: null, createdAt: '' } },
    };
    const armed = renderFull(messageWithStory, () => {});
    expect(armed).toContain('<button');
    /* UN libellé, l'aperçu de scène compris (revue-correction #5936, défaut
       majeur 8) — jamais un texte générique dont l'aperçu de story serait
       absent, ce qui masquerait à VoiceOver la scène qu'iOS restitue. */
    expect(armed).toContain('aria-label="réponse à sa story, x"');

    const unarmed = renderFull(messageWithStory);
    expect(unarmed).not.toContain('<button');
    expect(unarmed).toContain('data-story-citation');

    const emptyId: Message = {
      ...BASE_MESSAGE,
      storyReplyToId: 'p1',
      metadata: { postReplyTo: { id: '', type: 'STORY', moodEmoji: null, previewText: '', thumbnailUrl: null, createdAt: '' } },
    };
    const emptyIdArmed = renderFull(emptyId, () => {});
    expect(emptyIdArmed).not.toContain('<button');
  });

  test('(vii) transfert depuis un groupe SOUS le seuil : « Transféré » sans nom', () => {
    const html = renderFull({
      ...BASE_MESSAGE,
      forwardedFromId: 'm-far',
      forwardedFromConversation: { id: 'c1', title: 'Privé', type: 'group' },
    });
    expect(html).toContain('Transféré<');
    expect(html).not.toContain('Privé');
  });
});

/**
 * REVUE-CORRECTION #5936 — LA TEINTE SUIT LA SURFACE, JAMAIS L'EXPÉDITEUR.
 * `--color-meta-mine` vaut `white 70%` : elle n'est lisible que POSÉE SUR
 * l'indigo de marque. La rangée plate n'a jamais de bulle — elle ne doit
 * donc jamais la servir, quel que soit l'auteur.
 */
describe('FocalRow — « modifié » d’un message ENVOYÉ reste lisible', () => {
  test('aucun blanc de bulle sur la rangée plate', () => {
    const html = renderToStaticMarkup(
      <FocalRow
        mode="focal"
        place={placeOf({ ...BASE_MESSAGE, senderId: 'u-viewer', isEdited: true })}
        languages={['fr']}
        viewerId="u-viewer"
        onJumpToMessage={() => {}}
      />,
    );
    expect(html).toContain('data-badge="edited"');
    expect(html).not.toContain('var(--color-meta-mine)');
  });
});
