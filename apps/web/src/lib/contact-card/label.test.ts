import { describe, expect, test } from 'bun:test';

import { attachmentDefaults } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';
import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import { attachmentSegments } from '@/lib/view/message-a11y-label';
import { quotedPreviewOf } from '@/lib/view/quoted-preview';

import { contactCardLabelOf } from './label';

/**
 * UNE CARTE DE VISITE SE NOMME PAR SON CONTACT (#8122, volet web) — la
 * citation d'une réponse, le bandeau du composeur et la feuille des accusés
 * disaient « Fichier » ou `contact_<UUID>_Collègue Bravo.vcf`. Ils disent
 * désormais le nom tel que l'auteur l'a nommé, et « Contact partagé » quand le
 * fichier ne nomme personne — dans les sept langues.
 */
const UUID = '17E8744F-9AC7-45A6-9D0E-1AE50724FF9B';

const attachment = (partial: Partial<Attachment>): Attachment =>
  ({
    ...attachmentDefaults,
    id: 'a-vcf',
    messageId: 'm-quoted',
    fileName: `contact_${UUID}_Collègue Bravo.vcf`,
    originalName: `contact_${UUID}_Collègue Bravo.vcf`,
    mimeType: 'text/vcard',
    fileSize: 412,
    fileUrl: 'https://cdn.meeshy.me/c.vcf',
    uploadedBy: 'u-amina',
    createdAt: '2026-09-26T09:00:00.000Z',
    ...partial,
  }) as Attachment;

const quoted = (attachments: readonly Attachment[], content = ''): Message =>
  ({
    id: 'm-quoted',
    conversationId: 'c-a',
    senderId: 'u-amina',
    content,
    originalLanguage: 'fr',
    messageType: 'file',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    translations: [],
    attachments,
    createdAt: new Date('2026-09-26T09:00:00.000Z'),
  }) as unknown as Message;

describe('contactCardLabelOf', () => {
  test('le nom décapé de son préfixe technique', () => {
    expect(contactCardLabelOf(attachment({}), 'fr')).toBe('Collègue Bravo');
  });

  test('« Contact partagé » dans chaque langue quand le fichier ne nomme personne', async () => {
    await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadInterfaceCatalog(language)));
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const label = contactCardLabelOf(attachment({ originalName: `contact_${UUID}_.vcf` }), language);
      expect(label).toBe(translate(language, 'contactCard.shared'));
      expect(label).not.toBe('contactCard.shared');
    }
    expect(translate('fr', 'contactCard.shared')).toBe('Contact partagé');
  });

  test('null pour une pièce qui n’est pas une carte de visite', () => {
    expect(contactCardLabelOf(attachment({ mimeType: 'application/pdf', originalName: 'contact.pdf' }), 'fr')).toBeNull();
  });
});

describe('la citation d’une carte de visite (#8122)', () => {
  const preview = (message: Message) => quotedPreviewOf({ quoted: message, readerLanguages: ['fr'], interfaceLanguage: 'fr' });

  test('sans légende, elle dit le nom du contact, jamais le nom de fichier', () => {
    const result = preview(quoted([attachment({})]));
    expect(result.text).toBe('Collègue Bravo');
    expect(result.media?.kind).toBe('contact');
    expect(result.media?.label).toBe('Collègue Bravo');
    expect(result.media?.thumbnailSrc).toBeNull();
  });

  test('une légende reste le texte cité', () => {
    const result = preview(quoted([attachment({})], 'Son numéro'));
    expect(result.text).toBe('Son numéro');
    expect(result.media?.kind).toBe('contact');
  });

  test('l’inventaire lu à l’oreille compte un contact, pas un fichier', () => {
    expect(attachmentSegments([attachment({})])).toEqual(['1 contact']);
  });
});
