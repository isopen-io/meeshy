/**
 * La protection d'un média CITÉ doit ARRIVER, pas seulement être sélectionnée.
 *
 * `attachmentFullSelect` rend `isViewOnce` / `isBlurred` sur
 * `replyTo.attachments` (`routes/conversations/messages.ts`, `take: 4`) — le
 * select est juste depuis toujours. Mais `messageSchema` porte sous `replyTo`
 * une copie INLINE du schéma d'attachement, plus pauvre que
 * `messageAttachmentSchema` qui, lui, les déclare : fast-json-stringify les
 * retirait donc du seul chemin REST.
 *
 * L'effet côté client n'est pas « un champ manquant » mais une INVERSION.
 * `APIMessageAttachment.declaredProtection` rend `nil` quand les DEUX
 * drapeaux sont absents — un silence, que la citation lit comme « rien à
 * protéger » et qui laisse sa zone média ouverte. La citation d'un média à
 * VUE UNIQUE affichait donc sa vignette entière après un rechargement REST,
 * pendant que le même message reçu par socket (aucun sérialiseur) la
 * masquait : deux rendus pour un seul message, selon le chemin d'arrivée.
 *
 * Le témoin SÉRIALISE au lieu d'inspecter `properties` : c'est le stripping
 * qui est gardé. Une assertion de forme resterait verte le jour où la route
 * cesserait de monter ce schéma-là.
 *
 * Même famille que `message-translations-response-contract` : ce que la route
 * CONSTRUIT et ce que le schéma DÉCLARE sont deux vérités séparées, et seule
 * la seconde décide de ce qui part.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import fastJson from 'fast-json-stringify';
import { messageSchema, messageAttachmentSchema } from '@meeshy/shared/types/api-schemas';

const serialize = fastJson({
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: messageSchema as Record<string, unknown>,
  },
} as never);

const quotedAttachmentWith = (protection: Record<string, unknown>) => ({
  success: true,
  data: {
    id: '507f1f77bcf86cd799439011',
    conversationId: '507f1f77bcf86cd799439012',
    senderId: '507f1f77bcf86cd799439013',
    content: 'ce que je cite',
    replyTo: {
      id: '507f1f77bcf86cd799439014',
      content: 'original',
      attachments: [
        {
          id: '507f1f77bcf86cd799439015',
          fileName: 'secret.jpg',
          originalName: 'secret.jpg',
          mimeType: 'image/jpeg',
          fileSize: 1024,
          fileUrl: 'https://cdn.example/secret.jpg',
          thumbnailUrl: 'https://cdn.example/secret-thumb.jpg',
          ...protection,
        },
      ],
    },
  },
});

const servedQuotedAttachment = (protection: Record<string, unknown>) =>
  JSON.parse(serialize(quotedAttachmentWith(protection) as never)).data.replyTo.attachments[0];

describe('replyTo.attachments — les drapeaux de protection survivent au sérialiseur', () => {
  it('sert isViewOnce à true', () => {
    expect(servedQuotedAttachment({ isViewOnce: true })).toMatchObject({ isViewOnce: true });
  });

  it('sert isBlurred à true', () => {
    expect(servedQuotedAttachment({ isBlurred: true })).toMatchObject({ isBlurred: true });
  });

  /**
   * Le SILENCE et le « faux » sont deux verdicts différents côté client : le
   * premier laisse la zone média ouverte faute de savoir, le second l'ouvre
   * en l'affirmant. Un sérialiseur qui retirerait `false` fabriquerait du
   * silence à partir d'une déclaration — la vignette resterait visible pour
   * la bonne raison, ce qui masquerait la panne le jour où la valeur passe
   * à `true`.
   */
  it('sert isViewOnce et isBlurred à false — un silence n’est pas un « non »', () => {
    expect(servedQuotedAttachment({ isViewOnce: false, isBlurred: false })).toMatchObject({
      isViewOnce: false,
      isBlurred: false,
    });
  });

  /**
   * La copie inline n'a pas à égaler le schéma racine — une citation ne rend
   * ni le bandeau de consommation ni l'enveloppe de chiffrement. Mais ce
   * qu'elle déclare doit avoir la même FORME, sinon un client typé sur la
   * racine lit un booléen là où le fil enverrait autre chose.
   */
  it('déclare la même forme que le schéma racine', () => {
    const inline = (messageSchema as never as Record<string, any>)
      .properties.replyTo.properties.attachments.items.properties;
    const root = (messageAttachmentSchema as never as Record<string, any>).properties;
    expect(inline.isViewOnce).toMatchObject({ type: root.isViewOnce.type });
    expect(inline.isBlurred).toMatchObject({ type: root.isBlurred.type });
  });
});
