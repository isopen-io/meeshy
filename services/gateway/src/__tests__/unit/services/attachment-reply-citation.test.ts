/**
 * #6164 — UNE RÉPONSE CITE UNE PIÈCE NOMMÉE, PAS SEULEMENT SON MESSAGE.
 *
 * Forme de données arbitrée le 2026-09-12 (#6123, voie C hybride) : la voie
 * `metadata.attachmentReplyTo`, AUCUNE colonne. Ce qui est FIGÉ ne peut pas
 * devenir un secret — l'identifiant qui ancre le saut, le message porteur, la
 * NATURE du média ; tout le reste est RELU à chaque service et retenu par
 * `mediaMayTravel` : la vignette, le nom de fichier, la taille, la **DURÉE**,
 * la transcription, la forme d'onde.
 *
 * Le RANG est load-bearing dans tous les témoins de ce fichier. Écrits sur la
 * PREMIÈRE pièce, ils ne pourraient PAS tomber : au rang 1, le court-circuit
 * (« la première ») et la règle juste (« celle qu'on a nommée ») rendent le
 * même verdict. Ils s'écrivent donc sur la TROISIÈME pièce d'un message qui en
 * porte cinq — c'est la leçon 261, portée du Prisme à la citation.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseAttachmentReplyTo,
  attachmentReplyToFromMetadata,
  attachmentReplyKindFor,
  admitAttachmentReply,
  ATTACHMENT_REPLY_FROZEN_FIELDS,
  ATTACHMENT_REPLY_REVOCABLE_FIELDS,
} from '../../../services/messaging/attachmentReplySnapshot';
import { servedQuotedMessage } from '../../../services/messaging/servedQuotedMessage';
import { clientDeclaredMetadata } from '../../../services/messaging/clientDeclaredMetadata';

const piece = (rang: number, extra: Record<string, unknown> = {}) => ({
  id: `507f1f77bcf86cd79943900${rang}`,
  messageId: '507f1f77bcf86cd799439000',
  mimeType: 'image/jpeg',
  fileName: `piece-${rang}.jpg`,
  originalName: `la photo ${rang}.jpg`,
  fileSize: 1000 * rang,
  duration: 42 * rang,
  fileUrl: `https://cdn/piece-${rang}.jpg`,
  thumbnailUrl: `https://cdn/piece-${rang}-thumb.jpg`,
  thumbHash: `hash-${rang}`,
  transcription: `la transcription ${rang}`,
  ...extra,
});

/** Cinq pièces : la citation vise la TROISIÈME. */
const CINQ_PIECES = [piece(1), piece(2), piece(3), piece(4), piece(5)];
const TROISIEME = CINQ_PIECES[2].id;

const messageCite = {
  id: '507f1f77bcf86cd799439000',
  content: 'regarde ces cinq photos',
  messageType: 'image',
  attachments: CINQ_PIECES,
};

describe('#6164 — la pièce NOMMÉE d’une citation', () => {
  describe('la forme figée et sa liste de champs révocables, au même endroit', () => {
    it('ne fige QUE l’ancre du saut et la nature du média', () => {
      expect([...ATTACHMENT_REPLY_FROZEN_FIELDS].sort()).toEqual(['attachmentId', 'kind']);
    });

    it('déclare RÉVOCABLES la vignette, le nom, la taille et la DURÉE — le cycle 125 les nomme', () => {
      for (const champ of ['thumbnailUrl', 'fileUrl', 'originalName', 'fileSize', 'duration', 'transcription', 'waveform']) {
        expect(ATTACHMENT_REPLY_REVOCABLE_FIELDS as readonly string[]).toContain(champ);
      }
    });

    it('aucun champ révocable ne peut être figé : les deux listes sont disjointes', () => {
      for (const revocable of ATTACHMENT_REPLY_REVOCABLE_FIELDS) {
        expect(ATTACHMENT_REPLY_FROZEN_FIELDS as readonly string[]).not.toContain(revocable);
      }
    });

    it('refuse un instantané qui porterait un champ révocable — le premier lecteur qui en fige un de plus est arrêté ici', () => {
      const fige = parseAttachmentReplyTo({
        attachmentId: TROISIEME,
        kind: 'image',
        thumbnailUrl: 'https://cdn/piece-3-thumb.jpg',
        duration: 126,
      });
      expect(fige).not.toBeNull();
      expect(Object.keys(fige!).sort()).toEqual(['attachmentId', 'kind']);
    });

    it('lit la nature depuis le MIME, jamais depuis le nom de fichier', () => {
      expect(attachmentReplyKindFor('image/jpeg')).toBe('image');
      expect(attachmentReplyKindFor('video/mp4')).toBe('video');
      expect(attachmentReplyKindFor('audio/mp4')).toBe('audio');
      expect(attachmentReplyKindFor('application/x-location')).toBe('location');
      expect(attachmentReplyKindFor('application/pdf')).toBe('file');
      expect(attachmentReplyKindFor(null)).toBe('file');
    });

    it('relit l’instantané depuis metadata — et rend null quand le message n’en porte aucun', () => {
      expect(attachmentReplyToFromMetadata({ attachmentReplyTo: { attachmentId: TROISIEME, kind: 'image' } }))
        .toEqual({ attachmentId: TROISIEME, kind: 'image' });
      expect(attachmentReplyToFromMetadata({ postReplyTo: { id: 'x' } })).toBeNull();
      expect(attachmentReplyToFromMetadata(null)).toBeNull();
    });
  });

  describe('servedQuotedMessage élit la pièce NOMMÉE — rang 3 sur 5', () => {
    it('porte l’identifiant de la TROISIÈME pièce, jamais celui de la première', () => {
      const servi = servedQuotedMessage(messageCite, {
        attachmentReplyTo: { attachmentId: TROISIEME, kind: 'image' },
      });
      const cite = servi['attachmentReplyTo'] as Record<string, unknown>;
      expect(cite['attachmentId']).toBe(TROISIEME);
      expect(cite['attachmentId']).not.toBe(CINQ_PIECES[0].id);
      expect(cite['kind']).toBe('image');
    });

    it('rend la vignette de la TROISIÈME, jamais celle de la première', () => {
      const servi = servedQuotedMessage(messageCite, {
        attachmentReplyTo: { attachmentId: TROISIEME, kind: 'image' },
      });
      const pieces = servi['attachments'] as Record<string, unknown>[];
      const elue = pieces.find((p) => p['id'] === TROISIEME);
      expect(elue?.['thumbnailUrl']).toBe('https://cdn/piece-3-thumb.jpg');
      expect(elue?.['thumbnailUrl']).not.toBe('https://cdn/piece-1-thumb.jpg');
    });

    it('sans le champ, la citation retombe sur le représentatif — aucune citation existante ne change de rendu', () => {
      const avant = servedQuotedMessage(messageCite);
      expect(avant['attachmentReplyTo']).toBeUndefined();
      expect((avant['attachments'] as Record<string, unknown>[])[0]['thumbnailUrl'])
        .toBe('https://cdn/piece-1-thumb.jpg');
    });
  });

  describe('la protection se lit PIÈCE PAR PIÈCE — un message ordinaire peut porter une pièce à vue unique', () => {
    const avecTroisiemeSecrete = {
      ...messageCite,
      attachments: [piece(1), piece(2), piece(3, { isViewOnce: true }), piece(4), piece(5)],
    };

    it('une pièce citée à VUE UNIQUE ne fait voyager ni vignette, ni nom, ni taille, ni DURÉE', () => {
      const servi = servedQuotedMessage(avecTroisiemeSecrete, {
        attachmentReplyTo: { attachmentId: TROISIEME, kind: 'image' },
      });
      const pieces = servi['attachments'] as Record<string, unknown>[];
      const elue = pieces.find((p) => p['id'] === TROISIEME)!;
      for (const champ of ['thumbnailUrl', 'fileUrl', 'thumbHash', 'fileName', 'originalName', 'fileSize', 'duration', 'transcription']) {
        expect(elue[champ]).toBeUndefined();
      }
    });

    it('mais la citation ne se VIDE pas : elle dit encore « une photo » — l’ancre et la nature restent', () => {
      const servi = servedQuotedMessage(avecTroisiemeSecrete, {
        attachmentReplyTo: { attachmentId: TROISIEME, kind: 'image' },
      });
      expect(servi['attachmentReplyTo']).toEqual({ attachmentId: TROISIEME, kind: 'image' });
    });

    it('et la pièce VOISINE, non protégée, garde la sienne — le verdict n’est pas celui du message', () => {
      const servi = servedQuotedMessage(avecTroisiemeSecrete, {
        attachmentReplyTo: { attachmentId: TROISIEME, kind: 'image' },
      });
      const pieces = servi['attachments'] as Record<string, unknown>[];
      expect(pieces.find((p) => p['id'] === CINQ_PIECES[1].id)?.['thumbnailUrl'])
        .toBe('https://cdn/piece-2-thumb.jpg');
    });

    it('une pièce SUPPRIMÉE laisse l’ancre et la nature, et rien d’autre', () => {
      const servi = servedQuotedMessage(
        { ...messageCite, attachments: [piece(1), piece(2)] },
        { attachmentReplyTo: { attachmentId: TROISIEME, kind: 'audio' } }
      );
      expect(servi['attachmentReplyTo']).toEqual({ attachmentId: TROISIEME, kind: 'audio' });
      const pieces = servi['attachments'] as Record<string, unknown>[];
      expect(pieces.find((p) => p['id'] === TROISIEME)).toBeUndefined();
    });
  });

  describe('le fil DÉCLARE le champ — sans quoi fast-json-stringify le strippe en silence (#4945)', () => {
    const schema = readFileSync(
      join(__dirname, '../../../../../../packages/shared/types/api-schemas/message.ts'),
      'utf-8'
    );
    const blocReplyTo = () => {
      const debut = schema.indexOf('    replyTo: {');
      expect(debut).toBeGreaterThan(-1);
      return schema.slice(debut, schema.indexOf('    forwardedFromId:', debut));
    };

    it('déclare replyTo.attachmentReplyTo avec ses DEUX champs figés', () => {
      const bloc = blocReplyTo();
      expect(bloc).toMatch(/attachmentReplyTo:\s*\{/);
      const instantane = bloc.slice(bloc.indexOf('attachmentReplyTo:'));
      expect(instantane).toMatch(/attachmentId:\s*\{\s*type: 'string'/);
      expect(instantane).toMatch(/kind:\s*\{\s*type: 'string'/);
    });

    it('ne déclare AUCUN champ révocable dans l’instantané — le fil ne peut pas figer ce qui se relit', () => {
      const bloc = blocReplyTo();
      const debut = bloc.indexOf('attachmentReplyTo:');
      const instantane = bloc.slice(debut, bloc.indexOf('\n        },', debut));
      for (const revocable of ['thumbnailUrl', 'fileUrl', 'fileSize', 'duration', 'originalName']) {
        expect(instantane).not.toContain(revocable);
      }
    });
  });

  describe('la LISTE sert la pièce citée par son ID, indépendamment du take', () => {
    const source = readFileSync(
      join(__dirname, '../../../routes/conversations/messages-list-query.ts'),
      'utf-8'
    );
    const blocSelect = () => {
      const debut = source.indexOf('messageSelect.replyTo');
      expect(debut).toBeGreaterThan(-1);
      return source.slice(debut, debut + 6000);
    };

    it('ordonne les pièces de la citation — sans orderBy, « la première » est ARBITRAIRE d’un appel à l’autre', () => {
      expect(blocSelect()).toMatch(
        /attachments:\s*\{[^}]*orderBy:\s*\[\{\s*createdAt:\s*'asc'\s*\},\s*\{\s*id:\s*'asc'\s*\}\]/
      );
    });

    it('ne remonte PAS le take à 10 — chaque message du fil le paierait', () => {
      expect(blocSelect()).toMatch(/take:\s*4/);
    });

    it('lit l’instantané sur le message QUI CITE, jamais sur le message CITÉ', () => {
      expect(source).toMatch(/attachmentReplyTo:\s*attachmentReplyToFromMetadata\(message\.metadata\)/);
      expect(source).not.toMatch(/attachmentReplyToFromMetadata\(message\.replyTo/);
    });

    it('rattrape la pièce citée hors du take, en UNE requête par page — et la route l’APPELLE', () => {
      const backfill = readFileSync(
        join(__dirname, '../../../services/messaging/citedAttachmentBackfill.ts'),
        'utf-8'
      );
      // Une SEULE requête pour toute la page, jamais une par message.
      expect(backfill.match(/prisma\.messageAttachment\.findMany/g)).toHaveLength(1);
      // FAIL-CLOSED : la pièce rattrapée doit appartenir au message CITÉ.
      expect(backfill).toMatch(/piece\.messageId !== m\.replyTo\?\.id/);
      // Le masquage passe par le site UNIQUE, jamais une seconde boucle locale.
      expect(backfill).toMatch(/servedQuotedAttachments\(/);

      const route = readFileSync(
        join(__dirname, '../../../routes/conversations/messages-list.ts'),
        'utf-8'
      );
      expect(route).toMatch(/await backfillCitedAttachments\(/);
    });
  });

  /**
   * L'ENVOI. Citer la pièce d'un message qu'on ne cite pas, c'est citer la
   * pièce d'une conversation qu'on ne lit peut-être pas : ce n'est pas une
   * faute de frappe qu'on tolère en retombant sur le représentatif, c'est une
   * FUITE — l'identifiant sert d'ancre à un saut, et le service qui le relit
   * chargerait la ligne. La garde est donc FERMÉE : au moindre doute, refus.
   */
  describe('la garde d’envoi est FERMÉE — un attachmentId étranger au message cité est REFUSÉ', () => {
    const MESSAGE_CITE = '507f1f77bcf86cd799439000';
    const AUTRE_MESSAGE = '507f1f77bcf86cd799439999';

    const fauxPrisma = (row: Record<string, unknown> | null) => ({
      messageAttachment: {
        findUnique: async () => row,
      },
    });

    it('refuse une pièce qui appartient à un AUTRE message — la fuite que la citation ouvrirait', async () => {
      const verdict = await admitAttachmentReply(
        fauxPrisma({ id: TROISIEME, messageId: AUTRE_MESSAGE, mimeType: 'image/jpeg' }) as never,
        { replyToId: MESSAGE_CITE, attachmentReplyTo: { attachmentId: TROISIEME } }
      );
      expect(verdict.ok).toBe(false);
    });

    it('refuse une pièce INTROUVABLE', async () => {
      const verdict = await admitAttachmentReply(
        fauxPrisma(null) as never,
        { replyToId: MESSAGE_CITE, attachmentReplyTo: { attachmentId: TROISIEME } }
      );
      expect(verdict.ok).toBe(false);
    });

    it('refuse une pièce nommée SANS message cité — on ne cite pas une pièce hors de son porteur', async () => {
      const verdict = await admitAttachmentReply(
        fauxPrisma({ id: TROISIEME, messageId: MESSAGE_CITE, mimeType: 'image/jpeg' }) as never,
        { replyToId: undefined, attachmentReplyTo: { attachmentId: TROISIEME } }
      );
      expect(verdict.ok).toBe(false);
    });

    it('refuse une forme malformée', async () => {
      const verdict = await admitAttachmentReply(
        fauxPrisma(null) as never,
        { replyToId: MESSAGE_CITE, attachmentReplyTo: { attachmentId: '   ' } }
      );
      expect(verdict.ok).toBe(false);
    });

    it('accepte la pièce du message cité — et DÉRIVE la nature du MIME relu, jamais de ce que le client déclare', async () => {
      const verdict = await admitAttachmentReply(
        fauxPrisma({ id: TROISIEME, messageId: MESSAGE_CITE, mimeType: 'audio/mp4' }) as never,
        { replyToId: MESSAGE_CITE, attachmentReplyTo: { attachmentId: TROISIEME, kind: 'file' } }
      );
      expect(verdict).toEqual({ ok: true, snapshot: { attachmentId: TROISIEME, kind: 'audio' } });
    });

    it('laisse passer un envoi qui ne nomme aucune pièce — sans requête', async () => {
      const verdict = await admitAttachmentReply(
        { messageAttachment: { findUnique: async () => { throw new Error('aucune requête attendue'); } } } as never,
        { replyToId: MESSAGE_CITE, attachmentReplyTo: undefined }
      );
      expect(verdict).toEqual({ ok: true, snapshot: null });
    });

    it('la route REST d’envoi appelle la garde — un transport qui porte le champ sans elle serait muet', () => {
      const route = readFileSync(
        join(__dirname, '../../../routes/conversations/messages-send.ts'),
        'utf-8'
      );
      expect(route).toMatch(/\bimport\s*\{[^}]*\badmitAttachmentReply\b[^}]*\}\s*from\s*['"][^'"]*attachmentReplySnapshot['"]/);
      expect(route).toMatch(/\bawait\s+admitAttachmentReply\(/);
      expect(route).toMatch(/attachmentReplyTo:\s*z\./);
    });

    it('le site UNIQUE de composition range l’instantané sous metadata — jamais une clé posée à la main', () => {
      const compose = clientDeclaredMetadata({
        attachmentReplyTo: { attachmentId: TROISIEME, kind: 'image' },
      });
      expect(compose.attachmentReplyTo).toEqual({ attachmentId: TROISIEME, kind: 'image' });
      expect(clientDeclaredMetadata({}).attachmentReplyTo).toBeUndefined();
    });
  });
});
