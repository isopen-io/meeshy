/**
 * #20018 — **ce que #19978 retient sur un message voyage dans l'événement
 * SUIVANT, par la citation.**
 *
 * `mediaSideContentMayTravel` ferme la transcription, la description et les
 * traductions d'une pièce dès que le message QUI LA PORTE est éphémère
 * (échéance POSÉE, pas seulement échue), supprimé, masqué ou chiffré. Le
 * `message:new` d'un vocal éphémère sert donc `transcription: null`.
 *
 * Le `message:new` de la RÉPONSE qui le cite servait la ligne entière :
 * `servedQuotedAttachments` ne masque une pièce que sur `quotedMessageIsProtected`
 * (vue unique, flouté, chiffré, bit masquant) ou sur `maskedAttachment` de la
 * pièce — et l'éphémère n'est NI l'un NI l'autre. Le texte retenu une seconde
 * plus tôt repartait en entier, sur un canal qui n'a aucun sérialiseur.
 *
 * ─── Pourquoi le correctif n'est PAS « que le prédicat lise `expiresAt` » ────
 *
 * C'est le premier critère de fin de #20018, et l'en-tête de
 * `servedQuotedMessage.ts` le REFUSE, par une décision écrite :
 *
 * > « L'ÉPHÉMÈRE n'est pas une protection au sens de la citation — son texte
 * > est lisible dans le fil jusqu'à l'expiration, et la citation vit dans ce
 * > même fil. Même lecture exactement que `APIMessageReplyTo.isProtected` côté
 * > iOS : sans cette symétrie, la passerelle masquerait un texte que le client
 * > affiche, ou l'inverse. »
 *
 * Elle est juste, et elle parle du TEXTE CITÉ. Elle ne dit rien de ce qui
 * voyage À CÔTÉ de lui — c'est la leçon 275 à son endroit le plus étroit : une
 * décision prise sur une CHAÎNE ne gouverne pas le contenu latéral d'un média.
 * Et les deux ne se valent pas : le texte cité meurt avec le fil quand
 * l'éphémère expire, la transcription est une COPIE DURABLE qui lui survit.
 *
 * D'où la forme du correctif — la citation garde son texte ET passe ses pièces
 * par la MÊME loi que le message porteur. Les deux témoins ci-dessous le
 * disent ensemble ; retirer le second ferait passer un correctif qui masque la
 * citation entière, ce que la décision interdit.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { buildMessageNewPayload } from '../messageNewPayload';

const CITE = '507f1f77bcf86cd799440000';
const PIECE = '507f1f77bcf86cd799440001';

const TRANSCRIPTION = { text: 'le code du coffre est 4791', segments: [{ text: 'le code', start: 0, end: 1 }] };
const PISTES = {
  fr: { type: 'audio', transcription: 'le code du coffre est 4791', url: '/f/fr.mp3' },
  en: { type: 'audio', transcription: 'the vault code is 4791', url: '/f/en.mp3' },
} as const;

/** Un vocal ORDINAIRE : la pièce elle-même ne porte aucune protection. */
const vocal = {
  id: PIECE,
  messageId: CITE,
  mimeType: 'audio/mp4',
  fileUrl: 'https://cdn/vocal.m4a',
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  transcription: TRANSCRIPTION,
  translations: PISTES,
  alt: 'un mémo vocal',
};

const citeEphemere = {
  id: CITE,
  content: 'écoute ça',
  messageType: 'audio',
  isViewOnce: false,
  isBlurred: false,
  isEncrypted: false,
  effectFlags: 0,
  /// L'échéance POSÉE — la colonne que `quotedMessageIsProtected` ne lit pas.
  expiresAt: new Date('2026-11-20T12:00:00.000Z'),
  ephemeralDuration: 60,
  deletedAt: null,
  attachments: [vocal],
};

const citeOrdinaire = { ...citeEphemere, expiresAt: null, ephemeralDuration: null };

const replyToServi = (cite: Record<string, unknown>): Record<string, unknown> => {
  const message = {
    id: '507f1f77bcf86cd799440100',
    conversationId: '507f1f77bcf86cd799440200',
    senderId: '507f1f77bcf86cd799440300',
    content: 'reçu',
    originalLanguage: 'fr',
    messageType: 'text',
    createdAt: new Date('2026-11-20T11:00:00.000Z'),
    updatedAt: new Date('2026-11-20T11:00:00.000Z'),
    replyToId: CITE,
    replyTo: cite,
  };
  const payload = buildMessageNewPayload(message as never, {
    conversationId: message.conversationId,
    translations: [],
    attachments: [],
    replyTo: cite,
  });
  return payload.replyTo as Record<string, unknown>;
};

const pieceCitee = (cite: Record<string, unknown>): Record<string, unknown> =>
  ((replyToServi(cite)['attachments'] as unknown[])[0] ?? {}) as Record<string, unknown>;

describe('message:new — la citation d’un vocal éphémère ne porte pas sa transcription (#20018)', () => {
  it('retient transcription, traductions et description quand le message CITÉ est éphémère', () => {
    const servie = pieceCitee(citeEphemere);

    expect(servie['transcription']).toBeUndefined();
    expect(servie['alt']).toBeUndefined();
    // Assertion DIRECTE, pas une boucle sur les clés : une boucle sur une carte
    // vidée ne s'exécute pas, donc elle passerait quelle que soit la réparation.
    expect(servie['translations']).toBeUndefined();
    // Et le texte ne survit nulle part dans la charge SÉRIALISÉE de la citation —
    // la seule assertion qui tienne quelle que soit la façon de retenir les clés.
    expect(JSON.stringify(replyToServi(citeEphemere))).not.toContain('4791');
    expect(JSON.stringify(replyToServi(citeEphemere))).not.toContain('vault code');
  });

  it('garde le TEXTE de la citation : l’éphémère n’est pas une protection au sens de la citation', () => {
    const replyTo = replyToServi(citeEphemere);

    expect(replyTo['content']).toBe('écoute ça');
    expect((replyTo['attachments'] as unknown[])).toHaveLength(1);
    expect(pieceCitee(citeEphemere)['fileUrl']).toBe('https://cdn/vocal.m4a');
  });

  it('sert la transcription quand le message cité n’est NI protégé NI éphémère', () => {
    expect(pieceCitee(citeOrdinaire)['transcription']).toEqual(TRANSCRIPTION);
  });
});
