/**
 * La protection d'un message CITÉ doit être SÉLECTIONNÉE puis ARRIVER — au
 * niveau MESSAGE, pas seulement au niveau de ses pièces jointes.
 *
 * `reply-attachment-protection-contract` garde la couche du dessous :
 * `replyTo.attachments[].isViewOnce / isBlurred` franchissent le sérialiseur.
 * Le message CITÉ lui-même n'avait rien — ni dans le `select` de
 * `messages-list-query.ts` (qui ne demandait que `content`, `originalLanguage`,
 * `createdAt`, `senderId`, `metadata`, `sender`), ni dans la copie inline de
 * `messageSchema.properties.replyTo`.
 *
 * L'effet n'est pas « un champ manquant » mais une PROTECTION CONTOURNÉE : la
 * passerelle n'arbitre la protection que sur le message PORTEUR, et sert
 * `replyTo.content` BRUT. Un message à VUE UNIQUE auquel quelqu'un répond
 * voyait donc son texte entier reparaître, en clair, dans la bulle-citation de
 * la réponse — pour tout lecteur qui ouvrait le fil, aussi longtemps que la
 * réponse existait.
 *
 * Le témoin porte sur les DEUX vérités séparées, parce que corriger l'une sans
 * l'autre ne change rien à ce qui part :
 *   1. le `select` DEMANDE les champs à la base ;
 *   2. le schéma les DÉCLARE, faute de quoi fast-json-stringify les retire.
 *
 * Les quatre formes de protection sont gardées — les trois champs hérités, le
 * bitfield canonique (`effectFlags`, seul porteur quand un client envoie le
 * bit sans le champ) et le chiffrement.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import fastJson from 'fast-json-stringify';
import { messageSchema } from '@meeshy/shared/types/api-schemas';
import { servedQuotedMessage } from '../../../services/messaging/servedQuotedMessage';

const SELECT = join(__dirname, '../../../routes/conversations/messages-list-query.ts');

const CHAMPS_DE_PROTECTION = [
  'isViewOnce',
  'isBlurred',
  'expiresAt',
  'effectFlags',
  'isEncrypted',
  'encryptionMode',
] as const;

const serialize = fastJson({
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: messageSchema as Record<string, unknown>,
  },
} as never);

const citationServie = (protection: Record<string, unknown>) =>
  JSON.parse(
    serialize({
      success: true,
      data: {
        id: '507f1f77bcf86cd799439011',
        conversationId: '507f1f77bcf86cd799439012',
        senderId: '507f1f77bcf86cd799439013',
        content: 'ma réponse',
        replyTo: {
          id: '507f1f77bcf86cd799439014',
          content: 'le secret cité',
          ...protection,
        },
      },
    } as never),
  ).data.replyTo;

/**
 * Le bloc `messageSelect.replyTo = { select: { … } }` du fichier, isolé par
 * comptage d'accolades : lire tout le fichier ferait passer le témoin sur un
 * `isViewOnce: true` posé pour le message PORTEUR, qui est précisément le
 * niveau que le défaut confondait.
 */
function selectDeLaCitation(source: string): string {
  const debut = source.indexOf('messageSelect.replyTo = {');
  if (debut === -1) throw new Error('select de replyTo introuvable');

  let profondeur = 0;
  for (let i = source.indexOf('{', debut); i < source.length; i += 1) {
    if (source[i] === '{') profondeur += 1;
    if (source[i] === '}') {
      profondeur -= 1;
      if (profondeur === 0) return source.slice(debut, i + 1);
    }
  }
  throw new Error('select de replyTo non refermé');
}

describe('replyTo (niveau MESSAGE) — la protection du message cité est demandée ET servie', () => {
  const bloc = selectDeLaCitation(readFileSync(SELECT, 'utf-8'));

  it.each(CHAMPS_DE_PROTECTION)('le select de la liste demande %s', (champ) => {
    expect(bloc).toContain(`${champ}: true`);
  });

  it('sert une citation à vue unique comme telle', () => {
    expect(citationServie({ isViewOnce: true })).toMatchObject({ isViewOnce: true });
  });

  it('sert le bitfield canonique, seul porteur quand le champ hérité est faux', () => {
    expect(citationServie({ isViewOnce: false, effectFlags: 4 })).toMatchObject({
      isViewOnce: false,
      effectFlags: 4,
    });
  });

  it('sert l’expiration et le chiffrement d’une citation', () => {
    expect(
      citationServie({
        expiresAt: '2026-09-02T00:00:00.000Z',
        isEncrypted: true,
        encryptionMode: 'e2ee',
      }),
    ).toMatchObject({
      expiresAt: '2026-09-02T00:00:00.000Z',
      isEncrypted: true,
      encryptionMode: 'e2ee',
    });
  });

  /**
   * Un SILENCE et un « non » sont deux verdicts différents : le premier laisse
   * le client rendre le texte faute de savoir, le second l'autorise en le
   * disant. Un sérialiseur qui retirerait `false` fabriquerait du silence à
   * partir d'une déclaration — et le défaut resterait invisible jusqu'au jour
   * où la valeur passe à `true`.
   */
  it('sert les faux — un silence n’est pas un « non »', () => {
    expect(citationServie({ isViewOnce: false, isBlurred: false, isEncrypted: false })).toMatchObject(
      { isViewOnce: false, isBlurred: false, isEncrypted: false },
    );
  });

  it('déclare la même forme que le schéma racine', () => {
    const inline = (messageSchema as never as Record<string, any>).properties.replyTo.properties;
    const racine = (messageSchema as never as Record<string, any>).properties;
    CHAMPS_DE_PROTECTION.forEach((champ) => {
      expect([champ, inline[champ]?.type]).toEqual([champ, racine[champ].type]);
    });
  });
});

/**
 * #4945 — la citation descend le Prisme au CHARGEMENT comme en direct.
 *
 * Le fil socket (`MessageProcessor`, `replyTo: { include }`) transporte la
 * ligne ENTIÈRE du message cité, `translations` compris ; le select nommé de
 * la liste ne les demandait pas. Un lecteur francophone répondant à un message
 * anglais déjà traduit lisait donc la citation en anglais après un
 * rechargement et en français à l'arrivée en direct — un texte qui change de
 * langue selon le chemin de chargement.
 *
 * Deux vérités, comme plus haut : le select DEMANDE (gardé par
 * `includeTranslations`, même économie que la racine), et le mapping PROJETTE
 * le JSON Prisma en tableau par `transformTranslationsToArray` — la forme que
 * tout client lit sur la racine.
 */
describe('replyTo — les traductions du message cité sont demandées et projetées (#4945)', () => {
  const source = readFileSync(SELECT, 'utf-8');
  const bloc = selectDeLaCitation(source);

  it('le select de la liste demande translations, sous la même garde que la racine', () => {
    expect(bloc).toMatch(/\.\.\.\(includeTranslations \? \{ translations: true \} : \{\}\)/);
  });

  it('le mapping sert la citation par le site unique — texte, traductions et média ensemble', () => {
    const debut = source.indexOf('mappedMessage.replyTo = ');
    expect(debut).toBeGreaterThan(-1);
    const mapping = source.slice(debut, source.indexOf('return mappedMessage;', debut));
    expect(mapping).toMatch(
      /\.\.\.servedQuotedMessage\(message\.replyTo, \{\s*includeTranslations,\s*languages: hasLanguageFilter \? languageFilter : undefined,\s*\}\)/,
    );
  });

  /**
   * La garde ne se lit plus dans une chaîne de caractères : elle s'EXERCE. Un
   * témoin de source atteste qu'un prédicat existe ; seul un témoin de
   * comportement atteste que le secret ne part pas — et la garde d'origine ne
   * retenait QUE les traductions pendant que `...message.replyTo` répandait le
   * texte et qu'`attachmentFullSelect` servait la vignette, le ThumbHash, les
   * dimensions et la transcription (leçon 275).
   */
  describe('servedQuotedMessage — ce que la citation d’un message protégé a le droit de transporter', () => {
    const secret = {
      id: '507f1f77bcf86cd799439014',
      content: 'le code du coffre est 4271',
      messageType: 'image',
      translations: { en: { text: 'the vault code is 4271', translationModel: 'basic' as const, createdAt: new Date() } },
      attachments: [
        {
          id: '507f1f77bcf86cd799439015',
          mimeType: 'image/jpeg',
          fileUrl: 'https://cdn/secret.jpg',
          thumbnailUrl: 'https://cdn/secret-thumb.jpg',
          thumbHash: 'AQIDBA==',
          width: 1024,
          height: 768,
          transcription: 'la transcription du vocal',
        },
      ],
    };

    it.each([
      ['vue unique', { isViewOnce: true }],
      ['flouté', { isBlurred: true }],
      ['chiffré', { isEncrypted: true }],
      ['bitfield vue unique', { effectFlags: 4 }],
    ])('ne republie ni le texte ni ses traductions — %s', (_nom, protection) => {
      const servi = servedQuotedMessage({ ...secret, ...protection });
      expect(String(servi['content'])).not.toContain('4271');
      expect(servi['translations']).toBeUndefined();
    });

    it('ne laisse partir ni vignette, ni ThumbHash, ni dimensions, ni transcription', () => {
      const servi = servedQuotedMessage({ ...secret, isViewOnce: true });
      const piece = (servi['attachments'] as Record<string, unknown>[])[0];
      expect(piece['mimeType']).toBe('image/jpeg');
      for (const champ of ['fileUrl', 'thumbnailUrl', 'thumbHash', 'width', 'height', 'transcription']) {
        expect(piece[champ]).toBeUndefined();
      }
    });

    it('retient le média d’une PIÈCE JOINTE protégée sous un message qui ne l’est pas — les deux niveaux déclarent', () => {
      const servi = servedQuotedMessage({
        ...secret,
        attachments: [{ ...secret.attachments[0], isViewOnce: true }],
      });
      expect((servi['attachments'] as Record<string, unknown>[])[0]['fileUrl']).toBeUndefined();
    });

    it('laisse passer une citation ORDINAIRE, traductions projetées en tableau', () => {
      const servi = servedQuotedMessage(secret);
      expect(servi['content']).toBeUndefined();
      expect(servi['translations']).toEqual([
        expect.objectContaining({ targetLanguage: 'en', translatedContent: 'the vault code is 4271' }),
      ]);
      expect((servi['attachments'] as Record<string, unknown>[])[0]['fileUrl']).toBe('https://cdn/secret.jpg');
    });

    /**
     * L'ÉPHÉMÈRE n'est pas une protection au sens de la citation — son texte
     * est lisible dans le fil jusqu'à l'expiration, et la citation vit dans ce
     * même fil. Même verdict exactement qu'`APIMessageReplyTo.isProtected` côté
     * iOS : masquer ici afficherait un placeholder là où le client attend le
     * texte.
     */
    it('ne masque PAS un message seulement éphémère', () => {
      const servi = servedQuotedMessage({ ...secret, expiresAt: new Date() });
      expect(servi['content']).toBeUndefined();
    });
  });

  it('le schéma de sérialisation DÉCLARE replyTo.translations — sinon fast-json-stringify strippe la projection', () => {
    const schema = readFileSync(join(__dirname, '../../../../../../packages/shared/types/api-schemas/message.ts'), 'utf-8');
    const debut = schema.indexOf('    replyTo: {');
    expect(debut).toBeGreaterThan(-1);
    const fin = schema.indexOf('    forwardedFromId:', debut);
    const bloc = schema.slice(debut, fin);
    expect(bloc).toMatch(/translations:\s*\{\s*type: 'array',\s*nullable: true,\s*items: messageTranslationSchema/);
  });
});
