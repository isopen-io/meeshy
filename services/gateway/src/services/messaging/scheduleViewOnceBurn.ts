import { unsetOrNull } from '../../utils/prisma-unset';

/**
 * Ce qui rend RÉELLE la promesse d'un message à vue unique.
 *
 * `recordViewOnceConsumption` compte les spectateurs exactement, la route
 * calcule `isFullyConsumed`, l'annonce `message:consumed` porte cet état à
 * toute la room et les clients masquent le média. Toute la chaîne avait l'air
 * branchée — il manquait la seule pièce que personne ne regarde parce qu'elle
 * ne produit aucun événement : **rien ne détruisait le message une fois le
 * budget épuisé**. `content`, `encryptedContent` et les pièces jointes
 * restaient servis par les ~119 lectures du modèle, toutes gardées par
 * `deletedAt` seul. Une réinstallation, un nouvel appareil, un appel d'API avec
 * un jeton valide — ou simplement le client WEB, qui n'a aucun traitement de la
 * vue unique et rend la photo comme n'importe quelle autre — relisaient
 * indéfiniment ce que l'émetteur croyait consommé.
 *
 * C'est exactement la forme de défaut qu'`expiresAt` portait avant le cycle 92,
 * et la question que la tête de cycle demande de poser à chaque champ du schéma
 * qui promet un comportement : *qui, côté serveur, fait respecter cette
 * promesse ?* Ici la réponse était « les clients » — donc personne.
 *
 * ─── DÉCIDER ICI, DÉTRUIRE AILLEURS ─────────────────────────────────────────
 *
 * La consommation est la seule à SAVOIR que le budget vient de s'épuiser. Elle
 * est aussi la plus mauvaise place pour DÉTRUIRE : `consumeViewOnce` est
 * attendu AVANT la révélation de la bulle (iOS `BubbleBlurRevealLifecycle`), et
 * le média n'est pas toujours déjà en cache. Effacer dans la foulée prendrait
 * le contenu des mains du destinataire à qui il était adressé, à l'instant
 * précis où il vient de payer sa vue.
 *
 * Ce module ne détruit donc rien : il pose l'ÉCHÉANCE. Le balayage éphémère
 * (`ExpiredMessagesCleanupService`) exécute — fichiers, clair, traductions,
 * effets de retrait et annonce `message:deleted` comprises. Une seule
 * implémentation de la destruction, déjà éprouvée, pour les deux promesses du
 * schéma qui la réclament ; et la vue unique hérite gratuitement de tout ce que
 * le balayage a coûté à écrire.
 *
 * ─── L'ÉCHÉANCE NE SE REPOUSSE JAMAIS ───────────────────────────────────────
 *
 * Un message peut être à la fois éphémère et à vue unique. Un `update` nu
 * écrirait la grâce par-dessus un `expiresAt` plus proche et RALLONGERAIT la
 * vie d'un contenu que l'émetteur a voulu plus court — une régression
 * silencieuse sur la plus forte des deux promesses. Le prédicat n'apparie donc
 * que l'absence, le nul, et les échéances POSTÉRIEURES à celle qu'on pose. La
 * conséquence utile est qu'un second appel ne réécrit rien : l'opération est
 * idempotente sans qu'aucun appelant ait à s'en souvenir.
 *
 * Les deux états « pas d'échéance » comptent tous les deux : `expiresAt` est
 * ABSENT des messages non éphémères — Prisma n'écrit pas les optionnels qu'on
 * ne lui donne pas — et présent-et-nul sur les chemins qui le remettent à zéro.
 * `{ expiresAt: null }` seul n'apparie que le second sur le connecteur MongoDB.
 */

/** La seule surface Prisma que la programmation de l'échéance touche. */
export interface ViewOnceBurnPrisma {
  message: {
    updateMany(args: {
      where: Record<string, unknown>;
      data: { expiresAt: Date };
    }): Promise<{ count: number }>;
  };
}

export interface ScheduleViewOnceBurnParams {
  readonly messageId: string;
  /** L'instant de la consommation qui a épuisé le budget. */
  readonly at: Date;
}

export interface ViewOnceBurnSchedule {
  /** Faux quand une échéance plus proche existait déjà — elle prime. */
  readonly scheduled: boolean;
  /** L'échéance que ce module a VOULU poser, écrite ou non. */
  readonly expiresAt: Date;
}

/**
 * Le sursis laissé au dernier spectateur.
 *
 * Il borne la fenêtre pendant laquelle un contenu épuisé reste lisible, donc on
 * le veut court ; il doit pourtant couvrir le téléchargement d'une vidéo sur un
 * lien médiocre APRÈS la réponse de `consume`, plus la période du balayage
 * lui-même (une minute). Cinq minutes tiennent les deux bouts : c'est un ordre
 * de grandeur au-dessus de ce qu'une lecture demande, et trois ordres en
 * dessous de l'éternité qui régnait avant.
 */
export const VIEW_ONCE_BURN_GRACE_MS = 5 * 60 * 1000;

export async function scheduleViewOnceBurn(
  prisma: ViewOnceBurnPrisma,
  params: ScheduleViewOnceBurnParams,
): Promise<ViewOnceBurnSchedule> {
  const expiresAt = new Date(params.at.getTime() + VIEW_ONCE_BURN_GRACE_MS);

  const written = await prisma.message.updateMany({
    where: {
      id: params.messageId,
      OR: [...unsetOrNull('expiresAt').OR, { expiresAt: { gt: expiresAt } }],
    },
    data: { expiresAt },
  });

  return { scheduled: written.count > 0, expiresAt };
}
