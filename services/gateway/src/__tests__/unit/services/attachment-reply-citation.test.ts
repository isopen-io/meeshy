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

import { describe, it, expect, jest } from '@jest/globals';
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
import { backfillCitedAttachments } from '../../../services/messaging/citedAttachmentBackfill';

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

    it('la route l’APPELLE — un rattrapage jamais branché ne rattraperait rien', () => {
      const route = readFileSync(
        join(__dirname, '../../../routes/conversations/messages-list.ts'),
        'utf-8'
      );
      expect(route).toMatch(/await backfillCitedAttachments\(/);
    });
  });

  /**
   * LE RATTRAPAGE, ÉPROUVÉ PAR SON COMPORTEMENT.
   *
   * Ce module a DEUX propriétés de sûreté, et aucune ne se lit dans une chaîne
   * de source : la pièce rattrapée traverse le masquage du site UNIQUE en
   * recevant LE MESSAGE CITÉ (donc les deux niveaux de protection — celui du
   * MESSAGE et celui de la PIÈCE), et elle n'est recollée que sur le message
   * dont elle est la pièce. Une passe de contrôle a neutralisé les deux EN
   * LAISSANT INTACTES les expressions qu'un grep épingle — un
   * `servedQuotedAttachments({}, [piece])` et un `&& false` dans la garde — et
   * les 27 témoins d'alors sont restés VERTS sur un correctif annulé. Ceux-ci
   * INSTANCIENT, APPELLENT et OBSERVENT : ils tombent sur les deux mutations.
   */
  describe('le rattrapage hors fenêtre — ce qu’il FAIT, jamais ce qu’il ÉCRIT', () => {
    const MESSAGE_CITE = '507f1f77bcf86cd799439000';
    const AUTRE_MESSAGE = '507f1f77bcf86cd799439999';
    const CINQUIEME = CINQ_PIECES[4].id;

    /** Les quatre premières : ce que le `take: 4` du `select` a servi. */
    const QUATRE_SERVIES = [piece(1), piece(2), piece(3), piece(4)];

    const fauxPrisma = (lignes: Record<string, unknown>[]) => {
      const findMany = jest.fn(async () => lignes);
      return { prisma: { messageAttachment: { findMany } } as never, findMany };
    };

    /**
     * Un message de la PAGE qui cite `citee`, son `replyTo` tel que
     * `servedQuotedMessage` vient de le servir — l'instantané posé, et les
     * quatre pièces de la fenêtre.
     */
    const messagePage = (options: {
      readonly citee: string;
      readonly citeEstProtege?: boolean;
      readonly servies?: unknown[];
    }) => ({
      id: 'm-citant',
      replyTo: {
        id: MESSAGE_CITE,
        content: 'regarde ces cinq photos',
        messageType: 'image',
        isViewOnce: options.citeEstProtege === true,
        attachments: options.servies ?? QUATRE_SERVIES,
        attachmentReplyTo: { attachmentId: options.citee, kind: 'image' },
      },
    });

    const rattrapee = (m: { replyTo: { attachments: unknown[] } }, id: string) =>
      (m.replyTo.attachments as Record<string, unknown>[]).find((a) => a?.['id'] === id);

    it('rattrape la CINQUIÈME pièce, celle que le take de la fenêtre a laissée dehors', async () => {
      const page = [messagePage({ citee: CINQUIEME })];
      const { prisma } = fauxPrisma([piece(5)]);

      await backfillCitedAttachments(prisma, page);

      expect(rattrapee(page[0], CINQUIEME)?.['thumbnailUrl']).toBe('https://cdn/piece-5-thumb.jpg');
      expect(page[0].replyTo.attachments).toHaveLength(5);
    });

    /**
     * PREMIÈRE PROPRIÉTÉ DE SÛRETÉ. Le message cité est à VUE UNIQUE et la pièce
     * rattrapée ne déclare RIEN : seul le niveau MESSAGE la masque. Un masquage
     * qui ne recevrait pas le message cité la rendrait EN CLAIR — pendant que
     * ses quatre voisines, servies par le même `select`, sont masquées.
     */
    it('une pièce rattrapée sur un message cité à VUE UNIQUE repart MASQUÉE', async () => {
      const page = [messagePage({ citee: CINQUIEME, citeEstProtege: true })];
      const { prisma } = fauxPrisma([piece(5)]);

      await backfillCitedAttachments(prisma, page);

      const elue = rattrapee(page[0], CINQUIEME)!;
      for (const champ of ['fileUrl', 'thumbnailUrl', 'thumbHash', 'fileName', 'originalName', 'fileSize', 'duration', 'transcription']) {
        expect(elue[champ]).toBeUndefined();
      }
      expect(elue['mimeType']).toBe('image/jpeg');
    });

    it('et la protection posée sur la PIÈCE SEULE la masque aussi, message ordinaire compris', async () => {
      const page = [messagePage({ citee: CINQUIEME })];
      const { prisma } = fauxPrisma([piece(5, { isViewOnce: true })]);

      await backfillCitedAttachments(prisma, page);

      const elue = rattrapee(page[0], CINQUIEME)!;
      expect(elue['fileUrl']).toBeUndefined();
      expect(elue['thumbHash']).toBeUndefined();
    });

    /**
     * SECONDE PROPRIÉTÉ DE SÛRETÉ. La ligne relue porte un `messageId` qui n'est
     * pas celui du message CITÉ — une garde d'écriture ne dit rien des lignes
     * écrites AVANT elle. Sans la revérification, n'importe quelle pièce relue
     * se recolle sur n'importe quel message de la page.
     */
    it('une pièce dont le porteur n’est PAS le message cité n’est jamais recollée', async () => {
      const page = [messagePage({ citee: CINQUIEME })];
      const { prisma } = fauxPrisma([piece(5, { messageId: AUTRE_MESSAGE })]);

      await backfillCitedAttachments(prisma, page);

      expect(rattrapee(page[0], CINQUIEME)).toBeUndefined();
      expect(page[0].replyTo.attachments).toHaveLength(4);
    });

    it('UNE seule requête pour toute la page, jamais une par message', async () => {
      const page = [
        messagePage({ citee: CINQUIEME }),
        messagePage({ citee: CINQUIEME }),
        messagePage({ citee: CINQ_PIECES[3].id, servies: [piece(1)] }),
      ];
      const { prisma, findMany } = fauxPrisma([piece(5), piece(4)]);

      await backfillCitedAttachments(prisma, page);

      expect(findMany).toHaveBeenCalledTimes(1);
      expect(rattrapee(page[1], CINQUIEME)?.['thumbnailUrl']).toBe('https://cdn/piece-5-thumb.jpg');
      expect(rattrapee(page[2], CINQ_PIECES[3].id)?.['thumbnailUrl']).toBe('https://cdn/piece-4-thumb.jpg');
    });

    it('aucune requête quand la pièce citée est DÉJÀ dans la fenêtre, ni quand rien n’est cité', async () => {
      const { prisma, findMany } = fauxPrisma([]);

      await backfillCitedAttachments(prisma, [messagePage({ citee: CINQ_PIECES[2].id })]);
      expect(findMany).not.toHaveBeenCalled();

      await backfillCitedAttachments(prisma, [{ id: 'm', replyTo: { id: MESSAGE_CITE, attachments: [] } }]);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('une pièce SUPPRIMÉE laisse la citation intacte — elle garde son ancre et sa nature', async () => {
      const page = [messagePage({ citee: CINQUIEME })];
      const { prisma } = fauxPrisma([]);

      await backfillCitedAttachments(prisma, page);

      expect(page[0].replyTo.attachments).toHaveLength(4);
      expect(page[0].replyTo.attachmentReplyTo).toEqual({ attachmentId: CINQUIEME, kind: 'image' });
    });
  });

  /**
   * L'ENVOI. Citer la pièce d'un message qu'on ne cite pas n'est pas une faute
   * de frappe qu'on tolère en retombant sur le représentatif : l'identifiant
   * sert d'ancre à un saut, et le service qui le relit chargerait la ligne. La
   * garde refuse donc au moindre doute sur CE lien.
   *
   * Elle lie la pièce au MESSAGE CITÉ, et rien d'autre. La phrase qu'elle
   * portait — « citer la pièce d'une conversation qu'on ne lit peut-être pas »
   * — nommait le cas qu'elle NE BLOQUE PAS : `replyToId` n'est validé contre
   * aucune conversation dans le chemin d'écriture. C'est #6601 ; ces témoins
   * n'attestent que la borne qui existe.
   */
  describe('la garde d’envoi refuse un attachmentId étranger au message cité', () => {
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
