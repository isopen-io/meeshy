/**
 * L'ATLAS DES LANGUES (#9388) — producteur UNIQUE de `AtlasStamp`. La LOI
 * (catalogue des langues, quand un tampon se pose, résumé) vient de
 * `@meeshy/shared/utils/game/atlas` ; ce service l'applique contre la base.
 *
 * Un tampon se pose quand une langue a été ENVOYÉE et REÇUE : deux sens, une
 * date. Le document ne garde que cela — la langue, les deux sens, le jour —
 * JAMAIS l'interlocuteur ni la conversation (conformité E-4) : on ne peut pas
 * reconstruire qui a parlé avec qui depuis l'Atlas.
 *
 * ## La voie chaude
 *
 * `recordMessage` est appelé depuis les effets de bord d'un message committé,
 * hors du chemin d'envoi. Aucun agrégat : UNE lecture indexée par compte
 * concerné, et une écriture seulement quand le tampon apprend quelque chose.
 * Les destinataires sont BORNÉS (`ATLAS_RECEIVER_CAP`) : au-delà, la
 * conversation est une salle et seul l'expéditeur compte — lire des centaines
 * de comptes à chaque message ne se justifie pas pour un tampon.
 *
 * ## Le chiffrement de bout en bout (conformité E-3, #9224)
 *
 * Une conversation chiffrée ne nourrit AUCUN tampon : le serveur n'y voit ni
 * le texte ni, honnêtement, sa langue. L'état illisible se lit « chiffré »
 * (fail-closed) ; une conversation introuvable n'est pas chiffrée.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { applyAtlasEvent, atlasLanguage, type AtlasState } from '@meeshy/shared/utils/game/atlas';
import { dayKeyOf } from './gameClock';

export const ATLAS_RECEIVER_CAP = 12;

type StampRow = {
  readonly id: string;
  readonly language: string;
  readonly sentAt: Date | null;
  readonly receivedAt: Date | null;
  readonly stampedOn: string | null;
};

const STAMP_SELECT = { id: true, language: true, sentAt: true, receivedAt: true, stampedOn: true } as const;

function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

export class AtlasService {
  constructor(private readonly prisma: PrismaClient) {}

  /** La conversation est-elle chiffrée de bout en bout ? Illisible ⇒ oui (fail-closed). */
  async conversationIsEncrypted(conversationId: string): Promise<boolean> {
    try {
      const row = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { encryptionEnabledAt: true },
      });
      return row?.encryptionEnabledAt != null;
    } catch {
      return true;
    }
  }

  /** Un sens d'une langue pour un compte. Rend la langue QUI VIENT d'être tamponnée, sinon `null`. */
  async record(params: {
    readonly userId: string;
    readonly kind: 'sent' | 'received';
    readonly language: string;
    readonly now?: Date;
  }): Promise<string | null> {
    const language = atlasLanguage(params.language);
    if (language === null) return null;
    const now = params.now ?? new Date();
    const { userId, kind } = params;

    const existing = (await this.prisma.atlasStamp.findUnique({
      where: { userId_language: { userId, language } },
      select: STAMP_SELECT,
    })) as StampRow | null;
    const already = kind === 'sent' ? existing?.sentAt != null : existing?.receivedAt != null;
    if (already) return null;

    if (existing === null) {
      try {
        await this.prisma.atlasStamp.create({
          data: { userId, language, sentAt: kind === 'sent' ? now : null, receivedAt: kind === 'received' ? now : null, stampedOn: null },
          select: { id: true },
        });
        return null;
      } catch (err) {
        if (!isP2002(err)) throw err;
        return this.record(params);
      }
    }

    await this.prisma.atlasStamp.update({
      where: { id: existing.id },
      data: kind === 'sent' ? { sentAt: now } : { receivedAt: now },
      select: { id: true },
    });
    const sent = kind === 'sent' || existing.sentAt != null;
    const received = kind === 'received' || existing.receivedAt != null;
    if (!(sent && received) || existing.stampedOn !== null) return null;

    const owner = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    const step = applyAtlasEvent({
      state: { [language]: { sent: kind !== 'sent' && sent, received: kind !== 'received' && received, stampedOn: null } },
      event: { kind, language },
      dayKey: dayKeyOf(now, owner?.timezone),
    });
    if (step.stamped === null) return null;
    const stamped = await this.prisma.atlasStamp.updateMany({
      where: { id: existing.id, OR: [{ stampedOn: null }, { stampedOn: { isSet: false } }] },
      data: { stampedOn: step.state[language]?.stampedOn ?? dayKeyOf(now, owner?.timezone) },
    });
    return stamped.count === 1 ? language : null;
  }

  /**
   * Un message committé : l'expéditeur a ENVOYÉ cette langue, ses destinataires
   * l'ont REÇUE. Rien dans une conversation chiffrée.
   */
  async recordMessage(params: {
    readonly senderUserId: string;
    readonly conversationId: string;
    readonly originalLanguage: string;
    readonly now?: Date;
  }): Promise<readonly string[]> {
    if (atlasLanguage(params.originalLanguage) === null) return [];
    if (await this.conversationIsEncrypted(params.conversationId)) return [];
    const stamped: string[] = [];
    const push = (language: string | null) => {
      if (language !== null) stamped.push(language);
    };
    const common = { language: params.originalLanguage, ...(params.now ? { now: params.now } : {}) };

    push(await this.record({ ...common, userId: params.senderUserId, kind: 'sent' }));

    const members = await this.prisma.participant.findMany({
      where: { conversationId: params.conversationId, isActive: true },
      select: { userId: true },
      take: ATLAS_RECEIVER_CAP + 2,
    });
    const receivers = [...new Set(members.map((m) => m.userId).filter((id): id is string => typeof id === 'string' && id !== params.senderUserId))];
    if (receivers.length > ATLAS_RECEIVER_CAP) return stamped;
    for (const receiverId of receivers) push(await this.record({ ...common, userId: receiverId, kind: 'received' }));
    return stamped;
  }

  /** L'état de l'Atlas d'un compte, tel que la loi le lit. */
  async state(userId: string): Promise<AtlasState> {
    const rows = await this.prisma.atlasStamp.findMany({ where: { userId }, select: STAMP_SELECT, take: 400 });
    return Object.fromEntries(
      rows.map((row) => [row.language, { sent: row.sentAt != null, received: row.receivedAt != null, stampedOn: row.stampedOn ?? null }]),
    );
  }

  /** Efface UN tampon (ou tout l'Atlas) à la demande du compte (conformité E-5). */
  async erase(userId: string, language?: string): Promise<number> {
    const result = await this.prisma.atlasStamp.deleteMany({ where: { userId, ...(language ? { language } : {}) } });
    return result.count;
  }
}
