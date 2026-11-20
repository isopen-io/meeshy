/**
 * #20017 — **la porte la plus exposée des cinq : les visiteurs ANONYMES d'un
 * lien de partage.**
 *
 * `mediaSideContentMayTravel` (#11329, #12333, câblée par #19978) ferme la
 * transcription, la description et les traductions d'une pièce dès que la pièce
 * ou le message qui la porte est protégé. Le formateur des liens posait
 * `attachments: message.attachments || []` — la ligne BRUTE — et le schéma de
 * sortie ne la retient pas : `linkMessageSchema.attachments.items` est
 * `messageAttachmentSchema`, qui DÉCLARE `transcription` et `translations`, et
 * dont la description dit même « with their Prisme transcription/translations ».
 *
 * Le texte prononcé dans un vocal à vue unique partait donc en entier à qui
 * ouvre l'URL du lien, sans compte.
 *
 * ─── Et la loi SEULE n'aurait rien gardé ─────────────────────────────────────
 *
 * Le second défaut est dans le `select`, et c'est lui qui rendait le premier
 * invisible : les pièces du lien sont chargées par `attachmentMediaSelect`, qui
 * porte `transcription` et `translations` et **aucun drapeau de protection**
 * (mesuré : zéro occurrence de `isViewOnce`, `isBlurred`, `effectFlags`,
 * `isEncrypted`). Appliquer la loi sans toucher au `select` aurait produit un
 * correctif VERT et INERTE — `maskedAttachment` ne regarde que les drapeaux
 * PRÉSENTS, et `mediaSideContentMayTravel` rend `true` quand le porteur est
 * absent.
 *
 * C'est pourquoi ce témoin passe des pièces dont les drapeaux sont PRÉSENTS, et
 * pourquoi le lot touche le `select` dans le même geste.
 *
 * ─── Troisième conséquence du même `select` ──────────────────────────────────
 *
 * Aucun drapeau de protection n'atteignait le client. Le dépôt écrit déjà ce que
 * ça coûte, pour la citation (`api-schemas/message.ts`) : « côté client
 * l'absence n'est pas un champ manquant mais une INVERSION — rend `nil` quand
 * les deux sont absents, un silence que la citation lit comme *rien à
 * protéger* ». Un visiteur anonyme rendait donc une pièce à vue unique
 * ENTIÈRE, faute de savoir qu'elle l'était.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

import { messageSchema } from '../../routes/links/types';
import { formatLinkMessageWithDetails } from '../../routes/links/utils/message-formatters';

const TEXTE = 'le code du coffre est 4791';
const TRANSCRIPTION = { text: TEXTE, segments: [{ text: 'le code', start: 0, end: 1 }] };
/** `type`, `transcription` et `createdAt` sont REQUIS sur chaque piste — voir le bloc #20015. */
const PISTES = {
  fr: { type: 'audio', transcription: TEXTE, url: '/f/fr.mp3', createdAt: '2026-11-20T09:00:00.000Z' },
  en: { type: 'audio', transcription: 'the vault code is 4791', url: '/f/en.mp3', createdAt: '2026-11-20T09:00:00.000Z' },
};

const vocal = (protection: Record<string, unknown>) => ({
  id: 'a1',
  messageId: 'm1',
  fileName: 'memo.m4a',
  originalName: 'memo.m4a',
  mimeType: 'audio/mp4',
  fileSize: 4096,
  fileUrl: '/uploads/memo.m4a',
  thumbnailUrl: null,
  width: null,
  height: null,
  duration: 12_000,
  createdAt: new Date('2026-11-20T09:00:00.000Z'),
  transcription: TRANSCRIPTION,
  translations: PISTES,
  alt: 'un mémo vocal',
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  isEncrypted: false,
  ...protection,
});

const message = (att: Record<string, unknown>, porteur: Record<string, unknown> = {}) => ({
  id: 'm1',
  content: 'écoute ça',
  originalLanguage: 'fr',
  messageType: 'audio',
  deletedAt: null,
  isViewOnce: false,
  isBlurred: false,
  isEncrypted: false,
  effectFlags: 0,
  expiresAt: null,
  createdAt: new Date('2026-11-20T09:00:00.000Z'),
  updatedAt: new Date('2026-11-20T09:00:00.000Z'),
  sender: { id: 'p1', userId: null, type: 'anonymous', displayName: 'Camille', avatar: null, language: 'fr', user: null },
  attachments: [{ ...att, message: { ...baseCarrier, ...porteur } }],
  reactions: [],
  replyTo: null,
  translations: {},
  ...porteur,
});

/** Le porteur tel que le `select` de la loi le charge sous chaque pièce. */
const baseCarrier = {
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  expiresAt: null,
  deletedAt: null,
  isEncrypted: false,
  encryptionMode: null,
};

async function servi(raw: unknown): Promise<any> {
  const app: FastifyInstance = Fastify();
  app.get('/probe', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object', properties: { messages: { type: 'array', items: messageSchema } } },
          },
        },
      },
    },
  }, async () => ({ success: true, data: { messages: [formatLinkMessageWithDetails(raw as never)] } }));

  const response = await app.inject({ method: 'GET', url: '/probe' });
  await app.close();
  const parsed = JSON.parse(response.body);
  if (!parsed.data) throw new Error(`status=${response.statusCode} body=${response.body.slice(0, 600)}`);
  return parsed.data.messages[0];
}

const protections: ReadonlyArray<readonly [string, Record<string, unknown>, Record<string, unknown>]> = [
  ['la PIÈCE est à vue unique', { isViewOnce: true }, {}],
  ['la PIÈCE est floutée', { isBlurred: true }, {}],
  ['la PIÈCE est chiffrée', { isEncrypted: true }, {}],
  ['le MESSAGE est à vue unique', {}, { isViewOnce: true }],
  ['le MESSAGE est ÉPHÉMÈRE (échéance posée)', {}, { expiresAt: new Date('2026-11-20T12:00:00.000Z') }],
];

describe('GET /links/:identifier/messages — un visiteur ANONYME ne reçoit pas la transcription d’une pièce protégée (#20017)', () => {
  it.each(protections)('retient la transcription et la description quand %s', async (_nom, piece, porteur) => {
    const served = await servi(message(vocal(piece), porteur));
    const [att] = served.attachments;

    expect(att.transcription ?? null).toBeNull();
    expect(att.alt ?? null).toBeNull();
  });

  it('sert la transcription d’une pièce ORDINAIRE — la garde n’est pas un interrupteur', async () => {
    const served = await servi(message(vocal({})));
    const [att] = served.attachments;

    // Le schéma ne déclare que `text` sur chaque segment : on assert le TEXTE
    // servi, pas la forme brute, qui ne traverse pas le sérialiseur telle quelle.
    expect(att.transcription?.text).toBe(TEXTE);
  });

  it('sert les DRAPEAUX de protection, sans quoi le client lit le silence comme « rien à protéger »', async () => {
    const served = await servi(message(vocal({ isViewOnce: true })));
    const [att] = served.attachments;

    expect(att.isViewOnce).toBe(true);
  });

  /**
   * **CE QUE CE LOT NE FERME PAS, ÉPINGLÉ pour que ça se voie (#20015).**
   *
   * Les MOTS des pistes traduites continuent de voyager, et la contrainte est
   * la même que sur le chemin porteur — mesurée ici, pas héritée :
   * `messageAttachmentSchema.translations.additionalProperties.required` vaut
   * `['type', 'transcription', 'createdAt']`, et `fast-json-stringify` LÈVE sur
   * une requise absente. Mesuré sur ce témoin même : une piste sans
   * `createdAt` rend `GET /links/:identifier/messages` en **500**, la page
   * ENTIÈRE et non la pièce.
   *
   * Le chemin de la CITATION, lui, a pu les retirer (#20018) — son schéma ne
   * déclare ni l'une ni l'autre. **Une dette ne se recopie pas d'un chemin à
   * l'autre sans vérifier que sa cause y est présente : ici elle l'est.**
   *
   * Ce témoin tombera quand #20015 tranchera le contrat partagé. C'est voulu :
   * il est la trace falsifiable de la dette, pas sa bénédiction.
   */
  it('laisse encore les MOTS des pistes traduites — dette #20015, épinglée', async () => {
    const served = await servi(message(vocal({ isViewOnce: true })));
    const [att] = served.attachments;

    expect(att.translations?.en?.transcription).toBe('the vault code is 4791');
  });
});
