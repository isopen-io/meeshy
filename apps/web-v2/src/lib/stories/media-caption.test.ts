import { describe, expect, test } from 'bun:test';

import { MEDIA_CAPTION_MAX, resolveStoryMediaCaption, storyMediaCaptionPayload } from './media-caption';

describe('resolveStoryMediaCaption — la légende PROPRE d’un média, jamais Post.content', () => {
  test('sans légende, rien à rendre', () => {
    expect(resolveStoryMediaCaption({ media: {}, preferredLanguages: ['fr'] })).toBeNull();
  });

  test('une légende BLANCHE ne se rend pas', () => {
    expect(resolveStoryMediaCaption({ media: { caption: '   ' }, preferredLanguages: ['fr'] })).toBeNull();
  });

  test('sans traduction vers le prisme, l’ORIGINAL est servi, étiqueté de SA langue', () => {
    const served = resolveStoryMediaCaption({
      media: { caption: 'Sunset', captionLanguage: 'en' },
      preferredLanguages: ['fr'],
    });
    expect(served).toEqual({ text: 'Sunset', language: 'en', translated: false });
  });

  test('le RANG du prisme élit la traduction — jamais la première venue', () => {
    const served = resolveStoryMediaCaption({
      media: {

        caption: 'Sunset',
        captionLanguage: 'en',
        captionTranslations: { es: { text: 'Atardecer' }, fr: { text: 'Coucher de soleil' } },
      },
      preferredLanguages: ['fr', 'es'],
    });
    expect(served).toEqual({ text: 'Coucher de soleil', language: 'fr', translated: true });
  });

  test('rang 1 absent ⇒ la descente CONTINUE au rang suivant (le défaut du cycle 120)', () => {
    const served = resolveStoryMediaCaption({
      media: { caption: 'Sunset', captionLanguage: 'en', captionTranslations: { es: { text: 'Atardecer' } } },
      preferredLanguages: ['fr', 'es'],
    });
    expect(served).toEqual({ text: 'Atardecer', language: 'es', translated: true });
  });

  test('la règle de DÉRIVATION de `Post.content` ne s’applique PAS à une légende de média', () => {
    // `caption.ts` efface une légende repliée qui n’est que la concaténation
    // des calques ; une légende de média a SON sujet — le média —, et redire
    // le texte de la scène y est un choix de l’auteur, pas un doublon.
    const served = resolveStoryMediaCaption({
      media: { caption: 'Bonjour', captionLanguage: 'fr' },
      preferredLanguages: ['fr'],
    });
    expect(served?.text).toBe('Bonjour');
  });
});

describe('storyMediaCaptionPayload — la carte { postMediaId → texte } que POST /posts attend', () => {
  test('aucune légende ⇒ AUCUN champ (jamais une carte vide posée quand même)', () => {
    expect(storyMediaCaptionPayload([{ postMediaId: 'a', caption: '' }, { postMediaId: 'b' }])).toBeUndefined();
  });

  test('une légende s’adresse par l’identifiant SERVEUR du média', () => {
    expect(storyMediaCaptionPayload([{ postMediaId: 'a', caption: 'Le marché' }])).toEqual({ a: 'Le marché' });
  });

  test('un média SANS identité serveur ne peut rien porter — la passerelle l’ignorerait', () => {
    expect(storyMediaCaptionPayload([{ caption: 'Orpheline' }])).toBeUndefined();
  });

  test('la légende est TAILLÉE à la borne du contrat, jamais refusée en bloc par la passerelle', () => {
    const long = 'x'.repeat(MEDIA_CAPTION_MAX + 50);
    const payload = storyMediaCaptionPayload([{ postMediaId: 'a', caption: long }]);
    expect(payload?.a?.length).toBe(MEDIA_CAPTION_MAX);
  });

  test('les espaces de bord ne voyagent pas', () => {
    expect(storyMediaCaptionPayload([{ postMediaId: 'a', caption: '  Le marché  ' }])).toEqual({ a: 'Le marché' });
  });
});
