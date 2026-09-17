import { describe, expect, test } from 'bun:test';

import type { FeedPost } from '@/lib/api/feed-pages';

import { resolveFeedCardModel } from './card-model';

const NOW = new Date('2026-09-13T12:00:00.000Z');

const basePost = (partial: Partial<FeedPost>): FeedPost => ({
  id: 'p1',
  type: 'POST',
  createdAt: '2026-09-13T11:55:00.000Z',
  ...partial,
});

describe('resolveFeedCardModel — le SITE UNIQUE qui compose type, Prisme, accent et heure', () => {
  test('un post sans média ni texte ⇒ `text` absent, `media` vide', () => {
    const model = resolveFeedCardModel(basePost({ author: { id: 'u1', displayName: 'Léa' } }), {
      preferredLanguages: ['fr'],
      now: NOW,
    });
    expect(model.text).toBeUndefined();
    expect(model.media).toEqual([]);
    expect(model.relativeTime).toBe('5 min');
  });

  test('l’auteur absent retombe sur un nom de repli, jamais une chaîne vide', () => {
    const model = resolveFeedCardModel(basePost({}), { preferredLanguages: ['fr'], now: NOW });
    expect(model.author.name).toBe('Quelqu’un');
    expect(model.author.initials).not.toBe('');
  });

  test('username sert de repli quand displayName manque', () => {
    const model = resolveFeedCardModel(basePost({ author: { id: 'u1', username: 'lea.dupont' } }), {
      preferredLanguages: ['fr'],
      now: NOW,
    });
    expect(model.author.name).toBe('lea.dupont');
  });

  /** TÉMOIN DE RANG ≠ 1 (leçon 261) — voir `lib/feed/text.test.ts` pour le
   * témoin de la loi elle-même ; celui-ci prouve que `resolveFeedCardModel`
   * l’APPELLE bel et bien plutôt que de réécrire sa propre descente. */
  test('descend le Prisme jusqu’au rang 2 — jamais un repli sur l’original', () => {
    const model = resolveFeedCardModel(
      basePost({
        content: 'Buenos días a todos',
        originalLanguage: 'es',
        translations: { en: { text: 'Good morning everyone' } },
        author: { id: 'u1', displayName: 'Sofia' },
      }),
      { preferredLanguages: ['fr', 'en'], now: NOW },
    );
    expect(model.text).toEqual({ full: 'Good morning everyone', language: 'en', translated: true });
  });

  test('l’attribution de republication porte le pseudo, jamais un objet vide', () => {
    const model = resolveFeedCardModel(
      basePost({ content: 'Bien vu.', originalLanguage: 'fr', repostOf: { author: { username: 'yann.petit' } } }),
      { preferredLanguages: ['fr'], now: NOW },
    );
    expect(model.repostOfHandle).toBe('yann.petit');
  });

  test('sans republication, aucune clé `repostOfHandle` (pas `undefined` posé)', () => {
    const model = resolveFeedCardModel(basePost({ content: 'x', originalLanguage: 'fr' }), {
      preferredLanguages: ['fr'],
      now: NOW,
    });
    expect('repostOfHandle' in model).toBe(false);
  });

  test('type REEL ⇒ isReel vrai et le ratio du média suit reelCardRatio, pas postMediaRatio', () => {
    const model = resolveFeedCardModel(
      basePost({
        type: 'REEL',
        media: [{ id: 'm1', mimeType: 'video/mp4', fileUrl: 'reel.mp4', width: 1080, height: 1920 }],
      }),
      { preferredLanguages: ['fr'], now: NOW },
    );
    expect(model.isReel).toBe(true);
    expect(model.media[0]?.ratio).toBe(1.25); // borné, jamais 1920/1080 brut
    expect(model.media[0]?.kind).toBe('video');
  });

  test('les médias sont ORDONNÉS par `order`, même servis dans le désordre', () => {
    const model = resolveFeedCardModel(
      basePost({
        media: [
          { id: 'm-2', fileUrl: 'b.jpg', order: 1, mimeType: 'image/jpeg' },
          { id: 'm-1', fileUrl: 'a.jpg', order: 0, mimeType: 'image/jpeg' },
        ],
      }),
      { preferredLanguages: ['fr'], now: NOW },
    );
    expect(model.media.map((m) => m.id)).toEqual(['m-1', 'm-2']);
  });

  test('les compteurs absents retombent sur zéro, jamais `undefined`', () => {
    const model = resolveFeedCardModel(basePost({}), { preferredLanguages: ['fr'], now: NOW });
    expect(model.stats).toEqual({ likeCount: 0, commentCount: 0, repostCount: 0, bookmarkCount: 0, shareCount: 0 });
  });

  test('un avatar d’auteur SERVI passe par le résolveur d’URL de pièce jointe', () => {
    const model = resolveFeedCardModel(basePost({ author: { id: 'u1', displayName: 'Léa', avatar: '2026/09/lea.png' } }), {
      preferredLanguages: ['fr'],
      now: NOW,
    });
    expect(model.author.avatarSrc).toContain('2026%2F09%2Flea.png');
  });

  /**
   * LA CHARGE RÉELLE DE LA PASSERELLE (défaut BLOQUANT, revue-correction
   * #5893) — relevée le 2026-09-13 sur `gate.staging.meeshy.me`,
   * `GET /api/v1/social/posts?scope=home` : le compte `demo-test-stagin` sert
   * `author.avatar: null`, et chaque média sans vignette sert
   * `thumbnailUrl/thumbHash/caption/alt/width/height/duration: null`. Prisma
   * sérialise une colonne optionnelle en `null`, jamais en clé ABSENTE.
   *
   * Avant ce témoin, `resolveAuthorSrc` testait `avatar === undefined` puis
   * appelait `avatar.trim()` : l'écran levait `TypeError: Cannot read
   * properties of null (reading 'trim')` PENDANT LE RENDU et restait figé sur
   * son squelette — aucun état d'erreur, aucun message. Le corpus de fixtures
   * ne portant aucun `null`, aucun témoin ne pouvait rougir.
   */
  test('la charge RÉELLE — `null` partout où la passerelle sert une colonne optionnelle — se résout sans lever', () => {
    const model = resolveFeedCardModel(
      basePost({
        type: 'REEL',
        content: null,
        originalLanguage: 'fr',
        translations: null,
        author: { id: 'u-null', username: 'demo-test-stagin', displayName: 'Demo Test Staging Loop', avatar: null },
        repostOf: null,
        media: [
          {
            id: 'm-null',
            mimeType: 'image/jpeg',
            fileUrl: '2026/09/u/0_photo.jpeg',
            thumbnailUrl: null,
            thumbHash: null,
            width: null,
            height: null,
            duration: null,
            caption: null,
            alt: null,
            order: null,
          },
        ],
        likeCount: null,
        commentCount: null,
      }),
      { preferredLanguages: ['fr'], now: NOW },
    );

    expect(model.author.name).toBe('Demo Test Staging Loop');
    expect('avatarSrc' in model.author).toBe(false);
    expect(model.media[0]?.kind).toBe('image');
    // Une LÉGENDE `null` ne doit pas devenir une légende VIDE : la carte
    // peindrait sinon son voile dégradé sur chaque média sans texte.
    expect('caption' in (model.media[0] ?? {})).toBe(false);
    expect('thumbnailSrc' in (model.media[0] ?? {})).toBe(false);
    expect('placeholder' in (model.media[0] ?? {})).toBe(false);
    expect('durationMs' in (model.media[0] ?? {})).toBe(false);
    expect(model.media[0]?.ratio).toBe(1.25); // le repli d'un RÉEL sans cotes
    expect(model.stats.likeCount).toBe(0);
    expect(model.text).toBeUndefined();
  });

  /** `PostMedia.alt` est le texte d'ACCESSIBILITÉ que la passerelle sert
   * (`schema.prisma:3618`) ; il était déclaré sur le wire et jeté par le
   * modèle — chaque image partait `alt=""` (revue-correction #5893). */
  test('le texte d’accessibilité servi (`alt`) atteint le modèle, et la légende ne le remplace pas', () => {
    const model = resolveFeedCardModel(
      basePost({
        media: [{ id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg', alt: 'Un marché couvert au petit matin', caption: 'Le marché' }],
      }),
      { preferredLanguages: ['fr'], now: NOW },
    );
    expect(model.media[0]?.altText).toBe('Un marché couvert au petit matin');
    expect(model.media[0]?.caption).toBe('Le marché');
  });

  /** LA LÉGENDE DESCEND SON PROPRE PRISME (#6280) — `captionLanguage` /
   * `captionTranslations`, DISTINCTS de `originalLanguage` / `translations`
   * du post (§ Prisme, trois contenus jamais confondus). TÉMOIN DE RANG ≠ 1
   * (leçon 261), comme pour le corps du post ci-dessus. */
  test('la légende d’un média descend le Prisme jusqu’au rang 2, avec la langue servie', () => {
    const model = resolveFeedCardModel(
      basePost({
        media: [
          {
            id: 'm1',
            mimeType: 'image/jpeg',
            fileUrl: 'a.jpg',
            caption: 'The morning market',
            captionLanguage: 'en',
            captionTranslations: {
              fr: { text: 'Le marché du matin', translationModel: 'nllb-200', createdAt: '2026-09-14T00:00:00.000Z' },
            },
          },
        ],
      }),
      { preferredLanguages: ['de', 'fr'], now: NOW },
    );
    expect(model.media[0]?.caption).toBe('Le marché du matin');
    expect(model.media[0]?.captionLanguage).toBe('fr');
    expect(model.media[0]?.captionTranslated).toBe(true);
  });

  test('sans traduction vers une langue du lecteur, la légende ORIGINALE est servie à sa langue', () => {
    const model = resolveFeedCardModel(
      basePost({
        media: [
          { id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg', caption: 'The morning market', captionLanguage: 'en' },
        ],
      }),
      { preferredLanguages: ['fr'], now: NOW },
    );
    expect(model.media[0]?.caption).toBe('The morning market');
    expect(model.media[0]?.captionLanguage).toBe('en');
    expect(model.media[0]?.captionTranslated).toBe(false);
  });

  test('un média sans légende ne porte aucune clé `captionLanguage`', () => {
    const model = resolveFeedCardModel(
      basePost({ media: [{ id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg' }] }),
      { preferredLanguages: ['fr'], now: NOW },
    );
    expect('caption' in (model.media[0] ?? {})).toBe(false);
    expect('captionLanguage' in (model.media[0] ?? {})).toBe(false);
  });

  /**
   * LE REPLI SUR LE CONTENU DU POST (#6864, directive porteur 2026-09-16) —
   * quatre vecteurs, chacun distinguable des autres :
   * 1. un seul média AVEC légende propre ⇒ sa légende propre ;
   * 2. un seul média SANS légende propre ⇒ le contenu du post ;
   * 3. plusieurs médias, l'un AVEC légende propre ⇒ sa légende, et RIEN sur
   *    les autres (jamais le contenu du post) ;
   * 4. plusieurs médias, AUCUNE légende propre ⇒ AUCUNE légende nulle part.
   */
  describe('le repli sur le contenu du post — un média SEUL sans légende propre (#6864)', () => {
    test('vecteur 1 — un média seul AVEC légende propre garde SA légende, jamais le contenu du post', () => {
      const model = resolveFeedCardModel(
        basePost({
          content: 'Contenu du post',
          originalLanguage: 'fr',
          media: [{ id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg', caption: 'Légende propre' }],
        }),
        { preferredLanguages: ['fr'], now: NOW },
      );
      expect(model.media[0]?.caption).toBe('Légende propre');
    });

    test('vecteur 2 — un média seul SANS légende propre reçoit le contenu du post', () => {
      const model = resolveFeedCardModel(
        basePost({
          content: 'Contenu du post',
          originalLanguage: 'fr',
          media: [{ id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg' }],
        }),
        { preferredLanguages: ['fr'], now: NOW },
      );
      expect(model.media[0]?.caption).toBe('Contenu du post');
      expect(model.media[0]?.captionLanguage).toBe('fr');
      expect(model.media[0]?.captionTranslated).toBe(false);
    });

    test('vecteur 2 bis — le repli descend le MÊME Prisme que le corps du post (rang ≠ 1)', () => {
      const model = resolveFeedCardModel(
        basePost({
          content: 'Buenos días',
          originalLanguage: 'es',
          translations: { en: { text: 'Good morning' } },
          media: [{ id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg' }],
        }),
        { preferredLanguages: ['fr', 'en'], now: NOW },
      );
      expect(model.media[0]?.caption).toBe('Good morning');
      expect(model.media[0]?.captionLanguage).toBe('en');
      expect(model.media[0]?.captionTranslated).toBe(true);
    });

    test('vecteur 3 — à plusieurs médias, la légende propre d’UN média ne se propage jamais aux autres via le contenu du post', () => {
      const model = resolveFeedCardModel(
        basePost({
          content: 'Contenu du post',
          originalLanguage: 'fr',
          media: [
            { id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg', order: 0, caption: 'Légende propre' },
            { id: 'm2', mimeType: 'image/jpeg', fileUrl: 'b.jpg', order: 1 },
          ],
        }),
        { preferredLanguages: ['fr'], now: NOW },
      );
      expect(model.media[0]?.caption).toBe('Légende propre');
      expect('caption' in (model.media[1] ?? {})).toBe(false);
    });

    test('vecteur 4 — à plusieurs médias sans AUCUNE légende propre, aucune légende nulle part', () => {
      const model = resolveFeedCardModel(
        basePost({
          content: 'Contenu du post',
          originalLanguage: 'fr',
          media: [
            { id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg', order: 0 },
            { id: 'm2', mimeType: 'image/jpeg', fileUrl: 'b.jpg', order: 1 },
          ],
        }),
        { preferredLanguages: ['fr'], now: NOW },
      );
      expect('caption' in (model.media[0] ?? {})).toBe(false);
      expect('caption' in (model.media[1] ?? {})).toBe(false);
    });

    test('un média seul SANS légende propre et un post SANS contenu ⇒ toujours aucune légende', () => {
      const model = resolveFeedCardModel(
        basePost({ media: [{ id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg' }] }),
        { preferredLanguages: ['fr'], now: NOW },
      );
      expect('caption' in (model.media[0] ?? {})).toBe(false);
    });
  });

  test('une durée servie voyage en MILLISECONDES, sous un nom qui le dit (PostMedia.duration // ms)', () => {
    const model = resolveFeedCardModel(
      basePost({ media: [{ id: 'm1', mimeType: 'video/mp4', fileUrl: 'v.mp4', duration: 28_000 }] }),
      { preferredLanguages: ['fr'], now: NOW },
    );
    expect(model.media[0]?.durationMs).toBe(28_000);
  });

  test('deux auteurs de MÊME nom mais d’id différent reçoivent des accents DIFFÉRENTS (D-1, FeedModels.swift:255)', () => {
    const a = resolveFeedCardModel(basePost({ author: { id: 'u1', displayName: 'Alex' } }), {
      preferredLanguages: ['fr'],
      now: NOW,
    });
    const b = resolveFeedCardModel(basePost({ author: { id: 'u2', displayName: 'Alex' } }), {
      preferredLanguages: ['fr'],
      now: NOW,
    });
    expect(a.author.accentColor).not.toBe(b.author.accentColor);
  });

  /**
   * **L'ORIGINE DE LA LÉGENDE EST PORTÉE, PAS DEVINÉE** (#6864, complément de
   * `709e35b51e` qui a livré la règle elle-même).
   *
   * Les vecteurs de la règle sont déjà couverts ci-dessus ; ce témoin garde la
   * seule chose qu'ils ne disent pas : D'OÙ vient le texte servi.
   *
   * `captionTranslated` est documenté « vrai quand `caption` est une traduction
   * de sa source ». Dès qu'une légende peut venir du média OU du post, ce
   * drapeau ne dit plus DE QUELLE source — et les deux provenances n'ont pas
   * les mêmes traductions : `PostMedia.captionTranslations` d'un côté,
   * `Post.translations` de l'autre. Servir les unes sur l'autre est exactement
   * ce que #4904 a coûté, et une chaîne nue ne permet pas de les distinguer en
   * aval (puce de traduction, `lang`, recette).
   */
  test('la légende porte son ORIGINE — `media` pour la propre, `post` pour le repli (#6864)', () => {
    const propre = resolveFeedCardModel(
      basePost({
        content: 'Le marché de ce matin.',
        originalLanguage: 'fr',
        media: [{ id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg', caption: 'Sept heures du matin.' }],
      }),
      { preferredLanguages: ['fr'], now: NOW },
    );
    expect(propre.media[0]?.captionOrigin).toBe('media');

    const repli = resolveFeedCardModel(
      basePost({
        content: 'Le marché de ce matin.',
        originalLanguage: 'fr',
        media: [{ id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg' }],
      }),
      { preferredLanguages: ['fr'], now: NOW },
    );
    expect(repli.media[0]?.captionOrigin).toBe('post');

    /* Aucune légende ⇒ aucune origine : la clé est ABSENTE, jamais posée à
       `undefined` (`exactOptionalPropertyTypes`). */
    const nue = resolveFeedCardModel(
      basePost({
        content: 'Deux vues du même sentier.',
        originalLanguage: 'fr',
        media: [
          { id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg', order: 0 },
          { id: 'm2', mimeType: 'image/jpeg', fileUrl: 'b.jpg', order: 1 },
        ],
      }),
      { preferredLanguages: ['fr'], now: NOW },
    );
    expect('captionOrigin' in (nue.media[0] ?? {})).toBe(false);
    expect('captionOrigin' in (nue.media[1] ?? {})).toBe(false);
  });
});

/** T1 (#6898) — `model.scene` : le document canvas v3 déjà PARSÉ, ou absent
 * (repli média, D-78). */
describe('resolveFeedCardModel — la scène (D-78)', () => {
  test('storyEffects v3 avec scenes ⇒ model.scene.document.scenes.length', () => {
    const model = resolveFeedCardModel(
      basePost({
        storyEffects: {
          v: 3,
          scenes: [
            { id: 's1', objects: [] },
            { id: 's2', objects: [] },
          ],
        },
      }),
      { preferredLanguages: ['fr'], now: NOW },
    );
    expect(model.scene?.document.scenes.length).toBe(2);
    expect(model.scene?.carrier.postId).toBe('p1');
  });

  test('v: 3 SANS scenes (POST_HERO) ⇒ scene absent (repli média, D-78)', () => {
    const model = resolveFeedCardModel(basePost({ storyEffects: { v: 3, layout: 'hero' } }), {
      preferredLanguages: ['fr'],
      now: NOW,
    });
    expect(model.scene).toBeUndefined();
  });

  test('transform: {} (copie de 6a9d0ad5) ⇒ parsé, scene présent', () => {
    const model = resolveFeedCardModel(
      basePost({
        storyEffects: {
          v: 3,
          scenes: [
            {
              id: 's1',
              objects: [
                {
                  id: 'bg1',
                  kind: 'media',
                  anchor: { t: 'free', x: 0.5, y: 0.5 },
                  plane: 'bg',
                  z: 0,
                  transform: {},
                  payload: { background: '#4338CA' },
                },
              ],
            },
          ],
        },
      }),
      { preferredLanguages: ['fr'], now: NOW },
    );
    expect(model.scene).toBeDefined();
    expect(model.scene?.document.scenes[0]?.objects[0]?.transform).toEqual({ scale: 1, rotation: 0, opacity: 1 });
  });

  test('v: 1 ⇒ scene absent', () => {
    const model = resolveFeedCardModel(basePost({ storyEffects: { v: 1, background: '#fff' } }), {
      preferredLanguages: ['fr'],
      now: NOW,
    });
    expect(model.scene).toBeUndefined();
  });

  test('le porteur reprend les médias DÉJÀ résolus par le Prisme — jamais une seconde descente', () => {
    const model = resolveFeedCardModel(
      basePost({
        media: [{ id: 'media-a', mimeType: 'image/jpeg', fileUrl: 'a.jpg', caption: 'Bonjour', order: 0 }],
        storyEffects: { v: 3, scenes: [{ id: 's1', objects: [] }] },
      }),
      { preferredLanguages: ['fr'], now: NOW },
    );
    expect(model.scene?.carrier.media).toEqual([
      { id: 'media-a', src: 'https://gate.meeshy.me/api/v1/attachments/file/a.jpg', caption: 'Bonjour', captionOrigin: 'media' },
    ]);
  });
});
