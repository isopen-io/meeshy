/**
 * **La charge que la loi rend TRAVERSE le sérialiseur partagé** (#19978, audit
 * adversarial, constat C1).
 *
 * La première rédaction du lot retirait la clé `transcription` de chaque piste
 * traduite. Le contrat partagé la déclare **REQUISE**
 * (`messageAttachmentSchema.translations.additionalProperties.required`), et
 * `fast-json-stringify` LÈVE sur une clé requise absente :
 *
 * ```
 * Error: "transcription" is required!
 * ```
 *
 * Conséquence mesurée : `GET /conversations/:id/messages` et `GET /sync`
 * rendaient **500 — la page ENTIÈRE**, pas la pièce. Et sur `/sync`, la
 * pagination par curseur ramenant la même ligne à chaque tentative, le
 * rattrapage delta était bloqué DÉFINITIVEMENT pour ce lecteur.
 *
 * > **Un correctif de confidentialité qui casse la lecture d'une page entière
 * > est pire que la fuite qu'il ferme.** Et le défaut était invisible à la
 * > suite complète : aucun témoin du dépôt ne faisait traverser le sérialiseur
 * > à une pièce PROTÉGÉE portant une piste traduite.
 *
 * Ce témoin est la garde de non-régression : il exerce la vraie fabrique
 * `fast-json-stringify` sur le vrai schéma partagé, avec la sortie réelle de la
 * loi, pour les quatre natures qui la font fermer.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import Fjs from 'fast-json-stringify';
import { messageAttachmentSchema } from '@meeshy/shared/types/api-schemas';

import { servedSideContent } from '../mediaSideContent';

const serialize = Fjs({ type: 'object', properties: { attachment: messageAttachmentSchema } } as never);

const vocal = {
  id: 'aaaaaaaaaaaaaaaaaaaaaaa1',
  messageId: 'bbbbbbbbbbbbbbbbbbbbbbb1',
  mimeType: 'audio/mp4',
  fileSize: 4_200,
  fileUrl: '/f/voice.m4a',
  createdAt: new Date('2026-11-20T10:00:00Z').toISOString(),
  transcription: { text: 'le secret dit à voix haute' },
  translations: {
    en: { type: 'audio', transcription: 'the secret, spoken', url: '/f/en.mp3', durationMs: 12_000, createdAt: '2026-11-20T10:00:00Z' },
  },
  alt: 'un vocal',
} as const;

const natures: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ['pièce à VUE UNIQUE', { isViewOnce: true, isBlurred: false, effectFlags: 0 }],
  ['pièce FLOUTÉE', { isViewOnce: false, isBlurred: true, effectFlags: 0 }],
  ['pièce CHIFFRÉE', { isViewOnce: false, isBlurred: false, effectFlags: 0, isEncrypted: true }],
  ['message ÉPHÉMÈRE (échéance POSÉE, pas échue)', {
    isViewOnce: false, isBlurred: false, effectFlags: 0,
    message: { isViewOnce: false, isBlurred: false, effectFlags: 0, expiresAt: new Date('2099-01-01T00:00:00Z'), deletedAt: null },
  }],
  ['message SUPPRIMÉ', {
    isViewOnce: false, isBlurred: false, effectFlags: 0,
    message: { isViewOnce: false, isBlurred: false, effectFlags: 0, expiresAt: null, deletedAt: new Date('2026-11-20T09:00:00Z') },
  }],
];

describe('la charge de `servedSideContent` traverse le sérialiseur partagé (#19978 C1)', () => {
  it('ne lève pas, et sert la transcription, sur une pièce ORDINAIRE', () => {
    const servi = { ...vocal, isViewOnce: false, isBlurred: false, effectFlags: 0 };
    const charge = { attachment: { ...servi, ...servedSideContent(servi) } };

    expect(() => serialize(charge)).not.toThrow();
    expect(serialize(charge)).toContain('le secret dit à voix haute');
  });

  for (const [nom, protection] of natures) {
    it(`ne lève pas sur ${nom}`, () => {
      const row = { ...vocal, ...protection } as never;
      const charge = { attachment: { ...(row as object), ...servedSideContent(row) } };

      // LA garde : la page entière dépend de cette ligne.
      expect(() => serialize(charge)).not.toThrow();

      const json = serialize(charge);
      expect(JSON.parse(json).attachment.transcription).toBeNull();
      // Et la clé que le contrat exige est toujours là.
      expect(JSON.parse(json).attachment.translations.en).toHaveProperty('transcription');
    });
  }
});
