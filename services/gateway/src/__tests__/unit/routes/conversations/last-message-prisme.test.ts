import { describe, it, expect } from '@jest/globals';

import {
  buildLastMessagePreviewTranslations,
  LAST_MESSAGE_PREVIEW_MAX_LENGTH,
} from '../../../../routes/conversations/utils/last-message-preview';

/**
 * Prisme Linguistique appliqué à l'APERÇU de la liste de conversations.
 *
 * Le principe produit dit « le prisme s'applique à TOUT le contenu — messages
 * texte, transcriptions audio, métadonnées, previews ». La ligne de liste était
 * la seule surface où il ne s'appliquait pas : `GET /conversations` ne
 * transportait ni les traductions du dernier message ni sa langue d'origine, si
 * bien que le résolveur client (`MeeshyConversation.resolvedLastMessagePreview`)
 * ne pouvait QUE rendre le texte brut de l'expéditeur.
 *
 * Ces témoins épinglent le contrat du constructeur de la carte d'aperçu :
 * ce qui entre dans le payload, ce qui en est exclu, et pourquoi.
 */
describe('buildLastMessagePreviewTranslations', () => {
  const translationJson = (text: string, extra: Record<string, unknown> = {}) => ({
    text,
    translationModel: 'medium' as const,
    createdAt: new Date('2026-08-10T00:00:00Z'),
    ...extra,
  });

  it('rend la traduction de la langue préférée du lecteur', () => {
    const result = buildLastMessagePreviewTranslations({
      translations: { fr: translationJson('Bonjour'), es: translationJson('Hola') },
      originalLanguage: 'en',
      viewerLanguages: ['fr'],
    });

    expect(result).toEqual({ fr: 'Bonjour' });
  });

  it('retient TOUTES les langues du prisme du lecteur, pas seulement la première', () => {
    const result = buildLastMessagePreviewTranslations({
      translations: {
        fr: translationJson('Bonjour'),
        es: translationJson('Hola'),
        de: translationJson('Guten Tag'),
      },
      originalLanguage: 'en',
      viewerLanguages: ['fr', 'es'],
    });

    expect(result).toEqual({ fr: 'Bonjour', es: 'Hola' });
  });

  it("n'expose AUCUNE langue hors du prisme du lecteur", () => {
    const result = buildLastMessagePreviewTranslations({
      translations: { es: translationJson('Hola') },
      originalLanguage: 'en',
      viewerLanguages: ['fr', 'de'],
    });

    expect(result).toBeNull();
  });

  it('apparie la langue sans tenir compte de la casse', () => {
    const result = buildLastMessagePreviewTranslations({
      translations: { FR: translationJson('Bonjour') },
      originalLanguage: 'en',
      viewerLanguages: ['fr'],
    });

    expect(result).toEqual({ fr: 'Bonjour' });
  });

  it("omet la langue d'origine : elle EST déjà `lastMessage.content`", () => {
    const result = buildLastMessagePreviewTranslations({
      translations: { fr: translationJson('Bonjour'), en: translationJson('Hello') },
      originalLanguage: 'FR',
      viewerLanguages: ['fr', 'en'],
    });

    expect(result).toEqual({ en: 'Hello' });
  });

  it('écarte une traduction CHIFFRÉE — son `text` est un cryptogramme, pas un aperçu', () => {
    const result = buildLastMessagePreviewTranslations({
      translations: {
        fr: translationJson('U2FsdGVkX1+0Zm9v', { isEncrypted: true }),
        es: translationJson('Hola'),
      },
      originalLanguage: 'en',
      viewerLanguages: ['fr', 'es'],
    });

    expect(result).toEqual({ es: 'Hola' });
  });

  it('applique le MÊME plafond que le contenu original', () => {
    const result = buildLastMessagePreviewTranslations({
      translations: { fr: translationJson('x'.repeat(5000)) },
      originalLanguage: 'en',
      viewerLanguages: ['fr'],
    });

    expect(result?.fr).toHaveLength(LAST_MESSAGE_PREVIEW_MAX_LENGTH);
  });

  it('ne coupe pas une paire de surrogates au plafond', () => {
    const result = buildLastMessagePreviewTranslations({
      translations: { fr: translationJson('a'.repeat(299) + '😀😀') },
      originalLanguage: 'en',
      viewerLanguages: ['fr'],
    });

    expect(result?.fr).toBe('a'.repeat(299) + '😀');
  });

  it('rend `null` — jamais `{}` — quand il ne reste rien : le client doit retomber sur l’original', () => {
    expect(
      buildLastMessagePreviewTranslations({
        translations: null,
        originalLanguage: 'en',
        viewerLanguages: ['fr'],
      }),
    ).toBeNull();

    expect(
      buildLastMessagePreviewTranslations({
        translations: {},
        originalLanguage: 'en',
        viewerLanguages: ['fr'],
      }),
    ).toBeNull();

    expect(
      buildLastMessagePreviewTranslations({
        translations: { fr: translationJson('Bonjour') },
        originalLanguage: 'en',
        viewerLanguages: [],
      }),
    ).toBeNull();
  });

  it("écarte une entrée dont le `text` n'est pas une chaîne exploitable", () => {
    const result = buildLastMessagePreviewTranslations({
      translations: {
        fr: { translationModel: 'medium' } as never,
        es: translationJson('   '),
        de: translationJson('Guten Tag'),
      },
      originalLanguage: 'en',
      viewerLanguages: ['fr', 'es', 'de'],
    });

    expect(result).toEqual({ de: 'Guten Tag' });
  });

  it('survit à un `translations` de forme inattendue (colonne JSON libre)', () => {
    expect(
      buildLastMessagePreviewTranslations({
        translations: 'not-an-object' as never,
        originalLanguage: 'en',
        viewerLanguages: ['fr'],
      }),
    ).toBeNull();
  });
});
