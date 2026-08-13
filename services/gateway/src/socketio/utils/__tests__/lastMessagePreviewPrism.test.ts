import { describe, it, expect } from '@jest/globals';
import { LAST_MESSAGE_PREVIEW_MAX_LENGTH } from '../../../routes/conversations/utils/last-message-preview';
import { resolveLastMessagePreviewPrism, type PreviewPrismParticipant } from '../lastMessagePreviewPrism';

const frenchReader: PreviewPrismParticipant = {
  id: 'p-fr',
  userId: 'user-fr',
  user: { systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null },
};

const accountlessGuest: PreviewPrismParticipant = { id: 'p-guest', userId: null, user: null };

const longBody = 'a'.repeat(LAST_MESSAGE_PREVIEW_MAX_LENGTH + 500);

describe('resolveLastMessagePreviewPrism', () => {
  // Le plafond existe et il est documenté (LAST_MESSAGE_PREVIEW_MAX_LENGTH) :
  // une ligne de liste ne rend qu'une à deux lignes, mais CoreText compose la
  // chaîne ENTIÈRE à chaque mesure de rangée. Les deux moitiés du même aperçu
  // doivent donc le respecter — sinon le plafond dépend de la langue du lecteur.
  it('caps the base preview at the same length the translated previews are capped at', () => {
    const prism = resolveLastMessagePreviewPrism(frenchReader, {
      content: longBody,
      originalLanguage: 'en',
      translations: { fr: { text: 'b'.repeat(LAST_MESSAGE_PREVIEW_MAX_LENGTH + 500) } },
    });

    expect(prism.lastMessagePreview).toHaveLength(LAST_MESSAGE_PREVIEW_MAX_LENGTH);
    expect(prism.lastMessageTranslations?.fr).toHaveLength(LAST_MESSAGE_PREVIEW_MAX_LENGTH);
  });

  // Le lecteur qui n'a AUCUNE traduction servie retombe sur l'aperçu de base
  // (règle #1 du Prisme). C'est exactement le cas où un plafond posé sur la
  // seule carte de traductions ne protège personne.
  it('caps the base preview for a reader whose prism yields no translation at all', () => {
    const prism = resolveLastMessagePreviewPrism(accountlessGuest, {
      content: longBody,
      originalLanguage: 'en',
      translations: { fr: { text: 'Bonjour' } },
    });

    expect(prism.lastMessageTranslations).toBeNull();
    expect(prism.lastMessagePreview).toHaveLength(LAST_MESSAGE_PREVIEW_MAX_LENGTH);
  });

  // Le découpage marche en points de code, jamais au milieu d'une paire de
  // substitution — même règle que `truncateMessagePreview`, dont ce champ
  // relève désormais.
  it('never splits a surrogate pair when cutting', () => {
    const prism = resolveLastMessagePreviewPrism(frenchReader, {
      content: '😀'.repeat(LAST_MESSAGE_PREVIEW_MAX_LENGTH + 10),
      originalLanguage: 'fr',
    });

    expect([...(prism.lastMessagePreview ?? '')]).toHaveLength(LAST_MESSAGE_PREVIEW_MAX_LENGTH);
    expect(prism.lastMessagePreview).toBe('😀'.repeat(LAST_MESSAGE_PREVIEW_MAX_LENGTH));
  });

  // Trois valeurs que le plafond ne doit PAS transformer : un aperçu court
  // passe tel quel, un message position-seule garde sa chaîne VIDE (le client
  // compose son libellé depuis `location`, un null la ferait disparaître), et
  // l'absence de dernier message reste `null`.
  it('leaves a short preview, an empty preview and a missing message untouched', () => {
    expect(resolveLastMessagePreviewPrism(frenchReader, { content: 'court' }).lastMessagePreview).toBe('court');
    expect(resolveLastMessagePreviewPrism(frenchReader, { content: '' }).lastMessagePreview).toBe('');
    expect(resolveLastMessagePreviewPrism(frenchReader, null).lastMessagePreview).toBeNull();
    expect(resolveLastMessagePreviewPrism(frenchReader, { content: null }).lastMessagePreview).toBeNull();
  });

  // Le Prisme lui-même reste intact : la carte est filtrée aux langues du
  // lecteur et la langue d'origine en est exclue (elle EST l'aperçu de base).
  it('still filters the translation map to the reader prism, original language excluded', () => {
    const prism = resolveLastMessagePreviewPrism(frenchReader, {
      content: 'Hello',
      originalLanguage: 'en',
      translations: { fr: { text: 'Bonjour' }, es: { text: 'Hola' }, en: { text: 'Hello' } },
    });

    expect(prism.lastMessageTranslations).toEqual({ fr: 'Bonjour' });
    expect(prism.lastMessageOriginalLanguage).toBe('en');
  });
});
