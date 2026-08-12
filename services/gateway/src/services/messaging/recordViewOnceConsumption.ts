/**
 * Ce qu'une ouverture de message à vue unique DÉPENSE, et ce qu'elle ne
 * dépense pas.
 *
 * `Message.viewOnceCount` était incrémenté à chaque appel de
 * `POST …/messages/:messageId/consume`. Le compteur mesurait donc des
 * OUVERTURES, alors que tout ce qui le lit — `isFullyConsumed`, l'annonce
 * `message:consumed` diffusée à la room, la disparition du média chez les
 * clients — le lit comme un nombre de SPECTATEURS. Dans un groupe où
 * l'émetteur a posé `maxViewOnceCount: 3`, le premier destinataire qui rouvre
 * la photo trois fois épuise le budget des deux autres, qui ne l'ont jamais
 * ouverte. Et un simple rejeu de la requête — file hors-ligne, double tap,
 * retry réseau sur une mutation sans clé d'idempotence — produit le même
 * effet à lui seul.
 *
 * La donnée qui rend le compte exact était déjà écrite par le même
 * gestionnaire, deux instructions plus bas : `MessageStatusEntry.viewedOnceAt`,
 * par participant. Écrite, jamais relue. Ce module lui rend son rôle : elle
 * devient la REVENDICATION, et l'incrément n'en est que la conséquence.
 *
 * ─── POURQUOI UNE REVENDICATION GARDÉE, ET PAS UNE LECTURE ──────────────────
 *
 * « Lire si `viewedOnceAt` est nul, puis écrire » se trompe dès que le même
 * spectateur ouvre deux fois en parallèle : les deux lectures répondent « pas
 * encore vu », les deux écrivent, et le budget se dépense deux fois — le
 * défaut d'origine, déplacé d'un cran. C'est l'`updateMany` FILTRÉ qui
 * tranche : la base n'apparie qu'une fois, et seul l'appel qui a effectivement
 * modifié la ligne dépense.
 *
 * Quand rien n'est apparié, deux causes se ressemblent et se distinguent par
 * l'écriture, pas par une seconde lecture :
 *
 *  - **l'entrée n'existe pas encore** — le message n'a jamais été marqué livré
 *    ni lu pour ce participant : la création réussit, et c'est bien une
 *    première consommation ;
 *  - **l'entrée existe et porte déjà `viewedOnceAt`** — la création se heurte à
 *    `@@unique([messageId, participantId])` (P2002) : rien à dépenser.
 *
 * Toute autre panne d'écriture REMONTE. La lire comme « déjà vu » ferait
 * passer une base indisponible pour une consommation antérieure, et le
 * spectateur perdrait son ouverture sans que rien ne le signale.
 *
 * ─── LE PRÉDICAT ────────────────────────────────────────────────────────────
 *
 * `viewedOnceAt` a DEUX états « pas encore vu », et le filtre doit apparier
 * les deux :
 *
 *  - **ABSENT** — l'entrée créée par la livraison ou la lecture
 *    (`MessageReadStatusService`) n'écrit que `deliveredAt`/`readAt` : la
 *    colonne ne figure pas dans le document ;
 *  - **présent-et-nul** — une entrée écrite par un chemin qui pose la colonne.
 *
 * Sur le connecteur MongoDB de Prisma, `{ viewedOnceAt: null }` seul n'apparie
 * que le second — c'est le piège qui avait rendu inerte le balayage du contenu
 * éphémère pendant trois cycles (`ExpiredStoriesCleanupService`), et qui avait
 * vidé le feed en production avant lui. La forme `OR` est celle que les
 * chemins d'appel (`leftAt`) emploient déjà pour la même raison.
 */

/** La seule surface Prisma que la consommation touche. */
export interface ViewOnceConsumptionPrisma {
  messageStatusEntry: {
    updateMany(args: {
      where: Record<string, unknown>;
      data: { viewedOnceAt: Date; revealedAt: Date };
    }): Promise<{ count: number }>;
    create(args: {
      data: {
        messageId: string;
        conversationId: string;
        participantId: string;
        viewedOnceAt: Date;
        revealedAt: Date;
      };
    }): Promise<unknown>;
  };
  message: {
    update(args: {
      where: { id: string };
      data: { viewOnceCount: { increment: number } };
    }): Promise<{ viewOnceCount?: number | null }>;
  };
}

export interface ViewOnceConsumption {
  /** Le compte APRÈS cette ouverture — inchangé quand elle ne dépense rien. */
  readonly viewOnceCount: number;
  /**
   * Vrai seulement quand CETTE ouverture a dépensé une unité. C'est aussi ce
   * qui décide de l'annonce : rediffuser un état identique à toute la room ne
   * dit rien à personne.
   */
  readonly firstConsumption: boolean;
}

export interface ViewOnceConsumptionParams {
  readonly messageId: string;
  readonly conversationId: string;
  readonly participantId: string;
  /** Le compte lu avant l'ouverture — ce que la réponse rend quand rien n'est dépensé. */
  readonly currentViewOnceCount: number;
  readonly at: Date;
}

/** `pas encore vu` : la colonne absente ET la colonne présente-et-nulle. */
const NOT_YET_VIEWED = {
  OR: [{ viewedOnceAt: null }, { viewedOnceAt: { isSet: false } }],
} as const;

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}

export async function recordViewOnceConsumption(
  prisma: ViewOnceConsumptionPrisma,
  params: ViewOnceConsumptionParams
): Promise<ViewOnceConsumption> {
  const { messageId, conversationId, participantId, currentViewOnceCount, at } = params;

  const claimed = await prisma.messageStatusEntry.updateMany({
    where: { messageId, participantId, ...NOT_YET_VIEWED },
    data: { viewedOnceAt: at, revealedAt: at },
  });

  if (claimed.count === 0) {
    try {
      await prisma.messageStatusEntry.create({
        data: { messageId, conversationId, participantId, viewedOnceAt: at, revealedAt: at },
      });
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error;
      return { viewOnceCount: currentViewOnceCount, firstConsumption: false };
    }
  }

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { viewOnceCount: { increment: 1 } },
  });

  return {
    viewOnceCount: updated.viewOnceCount ?? currentViewOnceCount + 1,
    firstConsumption: true,
  };
}
