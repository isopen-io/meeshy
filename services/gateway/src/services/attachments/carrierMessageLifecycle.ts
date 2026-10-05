/**
 * Les octets d'une pièce jointe suivent la vie du message qui la porte.
 *
 * Les cycles 92, 93 et 94 ont construit toute la chaîne de destruction du
 * contenu de message : `expiresAt` est balayé (`ExpiredMessagesCleanupService`),
 * le budget de vue unique épuisé pose son échéance (`scheduleViewOnceBurn`), et
 * le transfert ne fait plus échapper de copie (`admitMessageForward`). Chaque
 * lecture du modèle `Message` est gardée — par `deletedAt`, et depuis le cycle
 * 92 par `expiresAt`.
 *
 * **Les routes qui servent les OCTETS ne l'étaient pas.**
 * `GET /attachments/:attachmentId` et son jumeau `/thumbnail` ne vérifiaient que
 * l'APPARTENANCE à la conversation : `callerMayReadAttachment` remonte
 * `messageId → conversationId` puis cherche un `Participant` actif, et ne
 * regardait ni `deletedAt`, ni `expiresAt`. Un membre — ou un `curl` muni d'un
 * jeton valide — retéléchargeait donc la photo d'un message rappelé, expiré ou
 * brûlé aussi longtemps que le fichier restait sur disque.
 *
 * C'est la même question que la tête de cycle pose à chaque champ du schéma qui
 * promet un comportement — *qui, côté serveur, fait respecter cette promesse ?*
 * — posée cette fois au dernier maillon : celui qui rend les octets.
 *
 * ─── POURQUOI L'ÉCHÉANCE SUFFIT À COUVRIR LA VUE UNIQUE ─────────────────────
 *
 * Ce prédicat ne connaît ni `isViewOnce`, ni l'audience — délibérément.
 * `scheduleViewOnceBurn` écrit « tous les destinataires ont ouvert » SOUS FORME
 * d'échéance (`viewOnceBurnAt = dernière ouverture + 5 min`, sa colonne à elle
 * depuis #7578), et l'envoi y pose le plafond de rétention. L'échéance EST la
 * purge. Rejouer ici le calcul de l'audience refuserait le média pendant le
 * sursis, à la personne qui vient de l'ouvrir.
 *
 * ─── POURQUOI 404, ET NON 403 ───────────────────────────────────────────────
 *
 * Le balayage `unlink` le fichier une minute plus tard, et la route rend alors
 * un 404 « File not found on disk ». Refuser en 404 rend les deux réponses
 * IDENTIQUES de part et d'autre du balayage : aucun client ne voit son
 * comportement changer selon qu'il arrive avant ou après. Un 403 aurait en plus
 * confirmé l'existence d'un contenu que l'émetteur a voulu disparu.
 *
 * ─── LA ROUTE PAR CHEMIN ────────────────────────────────────────────────────
 *
 * L'URL qu'un client atteint ne pointe pas ici : ce qui se persiste est la CLÉ
 * DE STOCKAGE (#7022), que le client repose contre sa propre base pour former
 * `/attachments/file/<clé>`, sans identité. Elle a longtemps été laissée hors de
 * cette loi, au motif qu'une lecture base coûterait sur la route la plus chaude
 * pour ne gagner que la minute qui sépare l'échéance du balayage. Ce calcul
 * oubliait les fichiers DÉRIVÉS — miniature, variantes WebP, pistes traduites —
 * que le balayage n'effaçait pas : leur fuite était permanente. Depuis #9315,
 * `fileRouteVerdict.ts` remonte de la clé à ses lignes par index et applique ce
 * même prédicat ; seuls les avatars s'en dispensent, n'étant jamais une pièce
 * jointe.
 */

/**
 * Ce fichier porte DEUX formes d'une même loi, et seule la seconde connaît
 * Prisma. Le prédicat en mémoire reste STRUCTURAL — il ne lit que ce que son
 * interface déclare — parce qu'il sert des appelants qui ont déjà chargé leur
 * message. La forme-requête, elle, produit un filtre Prisma : la dépendance
 * n'est pas accidentelle, c'est son objet. La typer ici plutôt qu'au site
 * d'appel évite un `as` chez chaque surface qui l'utilise.
 */
import type { Prisma } from '@meeshy/shared/prisma/client';

/** Les deux seules colonnes qui décident si un message rend encore ses octets. */
export interface CarrierMessageLifecycle {
  readonly deletedAt?: Date | string | null;
  /**
   * Échéance de destruction de l'éphémère (cycle 92).
   */
  readonly expiresAt?: Date | string | null;
  /** Échéance de purge d'une vue unique (#7578) — sa colonne à elle. */
  readonly viewOnceBurnAt?: Date | string | null;
}

/**
 * Les colonnes d'ÉCHÉANCE de la loi, déclarées une fois.
 *
 * Elles nourrissent les DEUX formes du prédicat — celle qui répond sur un
 * message déjà chargé ({@link carrierMessageStillServesBytes}) et celle qui
 * exclut en base ({@link carrierMessageStillServesWhere}). Deux écritures d'une
 * seule loi dérivent au premier ajout ; dérivées d'une liste, elles ne peuvent
 * pas. `deletedAt` n'y figure pas : ce n'est pas une échéance mais un fait, et
 * les deux formes le traitent à part.
 *
 * Le témoin `carrierMessageLifecycle.test.ts` relit l'interface dans la SOURCE
 * et refuse qu'une échéance y soit déclarée sans entrer ici — aucune réflexion
 * n'atteint un type TypeScript à l'exécution, et c'est pourquoi cette garde
 * existe.
 */
export const CARRIER_DEADLINE_COLUMNS = ['expiresAt', 'viewOnceBurnAt'] as const;

/**
 * Une échéance illisible ne doit PAS passer pour une échéance dépassée : un
 * accident de sérialisation détruirait alors du média vivant. Elle se lit comme
 * l'absence d'échéance, l'état que la colonne portait avant écriture.
 */
function deadlinePassed(deadline: Date | string | null | undefined, now: Date): boolean {
  if (!deadline) return false;
  const at = new Date(deadline).getTime();
  return Number.isFinite(at) && at <= now.getTime();
}

/**
 * Le message porteur rend-il encore ses octets à cet instant ?
 *
 * `null`/`undefined` — le message a disparu de la collection — refuse : c'est
 * déjà la réponse que `callerMayReadAttachment` donnait à ce cas.
 */
export function carrierMessageStillServesBytes(
  message: CarrierMessageLifecycle | null | undefined,
  now: Date
): boolean {
  if (!message) return false;
  if (message.deletedAt) return false;

  return !deadlinePassed(message.expiresAt, now) && !deadlinePassed(message.viewOnceBurnAt, now);
}

/**
 * La MÊME loi, en forme de requête — ce qu'une surface qui LISTE doit poser
 * dans son `where` (#9244).
 *
 * `carrierMessageStillServesBytes` répond sur un message déjà chargé : il sert
 * les routes qui rendent UN média. Une surface qui en liste plusieurs ne peut
 * pas s'en servir après coup, parce qu'elle PAGINE : exclure en JS ferait
 * rétrécir la page sans corriger ce qui la borne, et le total dirait alors
 * exactement ce que l'exclusion cache. Même raisonnement, et même forme, que
 * l'opt-out d'accusés de lecture (#3907) : l'exclusion entre dans la requête.
 *
 * Le défaut qu'elle ferme : `GET /conversations/:id/attachments` ne bornait que
 * `deletedAt`. La galerie listait donc le nom d'origine, les dimensions,
 * l'auteur et la date d'un média dont le porteur avait expiré ou brûlé — que le
 * DÉTAIL, lui, refusait depuis #4923. L'alignement de #4923 avait donné au
 * détail les bornes de la liste, PLUS le cycle de vie ; la liste restait en
 * retard d'une borne sur ce qui s'était aligné sur elle.
 *
 * `null` — l'échéance jamais écrite — passe, comme dans l'autre forme. Une
 * échéance illisible n'est pas représentable ici : la base compare des dates,
 * là où `deadlinePassed` doit se méfier d'une chaîne.
 */
export function carrierMessageStillServesWhere(now: Date): Prisma.MessageWhereInput {
  return {
    deletedAt: null,
    AND: CARRIER_DEADLINE_COLUMNS.map((column) => ({
      OR: [{ [column]: null }, { [column]: { gt: now } }],
    })),
  };
}
