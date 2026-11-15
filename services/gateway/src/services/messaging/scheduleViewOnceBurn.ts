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
 * ─── DÉCIDER ICI, PURGER AILLEURS ───────────────────────────────────────────
 *
 * La consommation est la seule à SAVOIR que le dernier destinataire vient
 * d'ouvrir. Elle est aussi la plus mauvaise place pour PURGER : le média n'est
 * pas toujours déjà en cache chez celui qui vient de l'ouvrir. Ce module pose
 * donc une ÉCHÉANCE, et le balayage (`purgeDueViewOnceContent`) purge.
 *
 * ─── UNE COLONNE À ELLE, JAMAIS `expiresAt` (#7578) ─────────────────────────
 *
 * L'échéance s'écrivait dans `expiresAt`, la colonne de l'ÉPHÉMÈRE. Deux effets
 * que personne ne voulait : la bulle était SUPPRIMÉE pour tous
 * (`message:expired`), alors que la règle produit garde « (1) · déjà ouvert »
 * chez chacun ; et l'échéance était SERVIE aux lecteurs comme un décompte
 * d'éphémère (« vu et supprimé » chez un destinataire qui n'avait rien ouvert).
 * `viewOnceBurnAt` ne dit qu'une chose — quand le CONTENU part — et ne se sert
 * à personne.
 *
 * ─── L'ÉCHÉANCE NE SE REPOUSSE JAMAIS ───────────────────────────────────────
 *
 * L'envoi pose déjà le plafond de rétention (#7450). Le prédicat n'apparie donc
 * que l'absence, le nul, et les échéances POSTÉRIEURES à celle qu'on pose : un
 * second appel ne réécrit rien, et la grâce ne rallonge jamais un plafond plus
 * proche. `{ viewOnceBurnAt: null }` seul n'apparierait pas la colonne ABSENTE
 * sur le connecteur MongoDB, d'où `unsetOrNull`.
 */

/** La seule surface Prisma que la programmation de l'échéance touche. */
export interface ViewOnceBurnPrisma {
  message: {
    updateMany(args: {
      where: Record<string, unknown>;
      data: { viewOnceBurnAt: Date };
    }): Promise<{ count: number }>;
  };
}

export interface ScheduleViewOnceBurnParams {
  readonly messageId: string;
  /** L'instant de l'ouverture qui a complété l'audience des destinataires. */
  readonly at: Date;
}

export interface ViewOnceBurnSchedule {
  /** Faux quand une échéance plus proche existait déjà — elle prime. */
  readonly scheduled: boolean;
  /** L'échéance de purge que ce module a VOULU poser, écrite ou non. */
  readonly viewOnceBurnAt: Date;
}

/**
 * Le sursis laissé au dernier destinataire.
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
  const viewOnceBurnAt = new Date(params.at.getTime() + VIEW_ONCE_BURN_GRACE_MS);

  const written = await prisma.message.updateMany({
    where: {
      id: params.messageId,
      OR: [...unsetOrNull('viewOnceBurnAt').OR, { viewOnceBurnAt: { gt: viewOnceBurnAt } }],
    },
    data: { viewOnceBurnAt },
  });

  return { scheduled: written.count > 0, viewOnceBurnAt };
}
