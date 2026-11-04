import { describe, it, expect } from '@jest/globals';
import { LAST_MESSAGE_PREVIEW_MAX_LENGTH } from '../../../routes/conversations/utils/last-message-preview';
import {
  resolvePreviewMediaFields,
  resolveLastMessagePreviewPrism,
  type PreviewMediaAttachmentInput,
  type PreviewPrismParticipant,
} from '../lastMessagePreviewPrism';

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

const SERVED_ATTACHMENT_KEYS = [
  'id', 'mimeType', 'thumbnailUrl', 'originalName', 'fileSize', 'duration', 'width', 'height',
  'pageCount', 'alt', 'isViewOnce', 'isBlurred', 'effectFlags',
].sort();

const DETAIL_KEYS = ['thumbnailUrl', 'originalName', 'fileSize', 'duration', 'width', 'height', 'pageCount', 'alt'] as const;

const richAttachment = (overrides: Partial<PreviewMediaAttachmentInput> = {}): PreviewMediaAttachmentInput => ({
  id: 'a1',
  mimeType: 'video/mp4',
  thumbnailUrl: 'https://cdn/a1-thumb.jpg',
  originalName: 'a1.mp4',
  fileSize: 3_000_000,
  duration: 12_000,
  width: 1920,
  height: 1080,
  pageCount: 2,
  alt: 'Le code est 4521',
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  ...overrides,
});

const firstServed = (
  attachment: PreviewMediaAttachmentInput,
  protection: Parameters<typeof resolvePreviewMediaFields>[1] = null,
) => {
  const [served] = resolvePreviewMediaFields({ attachments: [attachment] }, protection).lastMessageAttachments;
  if (!served) throw new Error('aucune pièce servie');
  return served;
};

describe('resolvePreviewMediaFields — la pièce du socket ne sert aucun détail sous protection', () => {
  it.each([
    ['vue unique de la pièce', { isViewOnce: true }],
    ['floutée', { isBlurred: true }],
    ['effet VIEW_ONCE seul', { effectFlags: 4 }],
    ['effet BLURRED seul', { effectFlags: 2 }],
  ])('pièce %s : nature et drapeaux gardés, aucun détail', (_label, flags) => {
    const served = firstServed(richAttachment(flags));
    expect(served.id).toBe('a1');
    expect(served.mimeType).toBe('video/mp4');
    DETAIL_KEYS.forEach((key) => expect(served[key] ?? null).toBeNull());
    expect(served.isViewOnce === true || served.isBlurred === true || (served.effectFlags ?? 0) !== 0).toBe(true);
  });

  it("pièce d'un message éphémère actif : aucun détail, drapeaux propres gardés", () => {
    const served = firstServed(richAttachment(), 'ephemeral');
    DETAIL_KEYS.forEach((key) => expect(served[key] ?? null).toBeNull());
    expect(served.isViewOnce).toBe(false);
  });

  it('les clés de la pièce servie restent celles du contrat (rétrocompatible)', () => {
    expect(Object.keys(firstServed(richAttachment({ isBlurred: true }))).sort()).toEqual(SERVED_ATTACHMENT_KEYS);
    expect(Object.keys(firstServed(richAttachment(), 'ephemeral')).sort()).toEqual(SERVED_ATTACHMENT_KEYS);
  });

  it('non-régression : sans protection, tous les détails partent', () => {
    expect(firstServed(richAttachment())).toMatchObject({
      thumbnailUrl: 'https://cdn/a1-thumb.jpg',
      originalName: 'a1.mp4',
      fileSize: 3_000_000,
      duration: 12_000,
      width: 1920,
      height: 1080,
      pageCount: 2,
      alt: 'Le code est 4521',
    });
  });
});
