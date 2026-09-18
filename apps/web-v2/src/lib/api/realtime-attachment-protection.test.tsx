import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { SocketIOMessage } from '@meeshy/shared/types/socketio-events';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { Attachments } from '@/components/attachment-blocks';
import type { Attachment } from '@/lib/api/types';

import { serializeAttachmentForSocket } from '../../../../../services/gateway/src/socketio/serializeAttachmentForSocket';
import { decodeMessage } from './decode';
import { rawMessageFromSocket } from './realtime-apply';

/**
 * LE FAIL-CLOSED DU CHEMIN TEMPS RÉEL (#7014) — une pièce jointe PROTÉGÉE
 * reçue par SOCKET n'atteint pas le DOM en clair.
 *
 * `attachment-blocks.test.tsx` garde déjà la moitié CLIENT : une pièce
 * `isViewOnce` / `isBlurred` / bitmask ne rend ni `<img>`, ni URL, ni nom, ni
 * taille. Elle était verte pendant toute la vie du défaut, et elle ne pouvait
 * pas le voir : elle POSE les drapeaux à la main. Ce qui manquait est le
 * SEAM — la charge que la passerelle remet vraiment au fil.
 *
 * Mesuré avant le lot : `serializeAttachmentForSocket` énumérait trente champs
 * à la main, sans les trois de la protection. Une photo à VUE UNIQUE envoyée
 * par `message:send-with-attachments` arrivait donc SANS déclaration, et
 * `maskedAttachment` — qui échoue OUVERTE quand on ne la nourrit pas — rendait
 * son `<img>` en clair jusqu'au prochain `GET /messages`.
 *
 * CE TÉMOIN IMPORTE LE VRAI PRODUCTEUR, jamais une copie de sa sortie : un
 * témoin qui fabrique lui-même la charge mesure sa propre fixture, pas le
 * contrat. L'import traverse le monorepo (`services/gateway/src/socketio/…`) —
 * le module ne dépend que de `@meeshy/shared`, aucune racine de passerelle n'est
 * chargée.
 *
 * La chaîne exercée est celle de la production, bout à bout :
 *
 *   ligne Prisma → serializeAttachmentForSocket (passerelle)
 *                → rawMessageFromSocket (`realtime-apply.ts`, ce que
 *                  `applyMessageNew` pose dans le cache)
 *                → decodeMessage (`decode.ts`, la frontière que `select`
 *                  applique au moment de servir l'écran)
 *                → <Attachments> (le site UNIQUE des deux peaux)
 *                → DOM.
 *
 * `decodeMessage` n'est pas décoratif dans cette chaîne : `rawMessageFromSocket`
 * passe `attachments` BRUT, et c'est le `select` de la requête qui décode. Un
 * témoin qui sauterait cette étape rendrait des `<img>` que l'écran ne rend
 * pas — mesuré en écrivant ce fichier, où la contre-épreuve levait sur
 * `imageVariants: null` (`media-url.ts`, le défaut que `sansNull` ferme).
 */

/** La ligne telle que `MessageProcessor` la relit après `handleAttachments` — colonnes NON NULLABLES. */
const lignePrisma = (protection: Record<string, unknown>) => ({
  id: 'att-secret',
  messageId: 'msg-secret',
  fileName: 'secret.jpg',
  originalName: 'anniversaire-surprise.jpg',
  mimeType: 'image/jpeg',
  fileSize: 204_800,
  fileUrl: 'https://cdn.meeshy.me/uploads/secret.jpg',
  thumbnailUrl: 'https://cdn.meeshy.me/uploads/secret-thumb.jpg',
  width: 1200,
  height: 900,
  createdAt: new Date('2026-09-18T10:00:00Z'),
  transcription: null,
  translations: null,
  capturedInApp: false,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  ...protection,
});

/** `message:new` tel que la passerelle l'émet, pièces jointes SÉRIALISÉES par elle. */
const messageDuFil = (protection: Record<string, unknown>): SocketIOMessage =>
  ({
    id: 'msg-secret',
    conversationId: 'c-secret',
    senderId: 'u-kwame',
    content: '',
    originalLanguage: 'fr',
    messageType: 'image',
    createdAt: '2026-09-18T10:00:00.000Z',
    translations: [],
    attachments: [serializeAttachmentForSocket(lignePrisma(protection) as Record<string, unknown>)],
  }) as unknown as SocketIOMessage;

const rendu = (protection: Record<string, unknown>): string => {
  const message = decodeMessage(rawMessageFromSocket(messageDuFil(protection)));
  const attachments = (message.attachments ?? []) as readonly Attachment[];

  expect(attachments.length).toBe(1);

  return renderToStaticMarkup(
    <Attachments attachments={attachments} languages={['fr']} fallbackLanguage="fr" mediaFrame="box" />,
  );
};

describe('message:new — une pièce PROTÉGÉE n’atteint pas le DOM en clair (#7014)', () => {
  for (const [canal, protection] of [
    ['isViewOnce', { isViewOnce: true }],
    ['isBlurred', { isBlurred: true }],
    ['effectFlags (bit VIEW_ONCE)', { effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE }],
    ['effectFlags (bit BLURRED)', { effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED }],
  ] as const) {
    test(`${canal} déclaré en base survit au fil : ni <img>, ni URL, ni nom de fichier`, () => {
      const html = rendu(protection);

      expect(html).not.toContain('<img');
      expect(html).not.toContain('https://cdn.meeshy.me/uploads/secret.jpg');
      expect(html).not.toContain('https://cdn.meeshy.me/uploads/secret-thumb.jpg');
      expect(html).not.toContain('anniversaire-surprise.jpg');
      expect(html).toContain('data-protected-attachment="hidden"');
    });
  }

  /**
   * LA CONTRE-ÉPREUVE (leçon 261) — sans elle, un sérialiseur qui cesserait de
   * servir TOUTE pièce jointe, ou un `<Attachments>` qui ne rendrait plus rien,
   * ferait passer les quatre témoins ci-dessus.
   */
  test('CONTRÔLE : la MÊME pièce SANS déclaration traverse le fil et rend son <img>', () => {
    const html = rendu({});

    expect(html).toContain('<img');
    expect(html).not.toContain('data-protected-attachment');
  });

  /**
   * LE BIT QUI NE MASQUE PAS — `EPHEMERAL` se juge au niveau MESSAGE, sur son
   * horloge. Un sérialiseur qui aurait « joué la sécurité » en masquant sur
   * `effectFlags !== 0` retiendrait le média de tout message éphémère ENCORE
   * VALIDE, et les quatre témoins ci-dessus ne le diraient pas.
   */
  test('effectFlags (bit EPHEMERAL) traverse SANS masquer — l’éphémère est au niveau MESSAGE', () => {
    const html = rendu({ effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL });

    expect(html).toContain('<img');
    expect(html).not.toContain('data-protected-attachment');
  });
});
