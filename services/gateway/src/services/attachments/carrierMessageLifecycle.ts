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
 * Ce prédicat ne connaît ni `isViewOnce`, ni `viewOnceCount`, ni
 * `maxViewOnceCount` — délibérément. `scheduleViewOnceBurn` écrit le budget
 * épuisé SOUS FORME d'échéance (`expiresAt = consommation + 5 min`), parce que
 * le dernier spectateur n'a pas fini de regarder au moment où il paie sa vue.
 * L'échéance EST la brûlure. Rejouer ici le calcul du budget refuserait le média
 * pendant ce sursis, c'est-à-dire exactement à la personne à qui il était
 * adressé, à l'instant où elle vient de le mériter.
 *
 * ─── POURQUOI 404, ET NON 403 ───────────────────────────────────────────────
 *
 * Le balayage `unlink` le fichier une minute plus tard, et la route rend alors
 * un 404 « File not found on disk ». Refuser en 404 rend les deux réponses
 * IDENTIQUES de part et d'autre du balayage : aucun client ne voit son
 * comportement changer selon qu'il arrive avant ou après. Un 403 aurait en plus
 * confirmé l'existence d'un contenu que l'émetteur a voulu disparu.
 *
 * ─── CE QUE CE PRÉDICAT NE FERME PAS ────────────────────────────────────────
 *
 * L'URL publique qu'un client reçoit (`MessageAttachment.url`) ne pointe PAS
 * ici : `UploadProcessor.getAttachmentUrl` émet
 * `/api/v1/attachments/file/<chemin>`, servie SANS authentification et par
 * chemin — donc sans identifiant de pièce jointe à partir duquel remonter au
 * message. C'est une URL-capacité (nom de fichier en UUIDv4, 122 bits), pas une
 * énumération ; son défaut est l'absence de révocation, et il se referme
 * aujourd'hui par l'`unlink` du balayage, pas par une garde. Y ajouter une
 * lecture base coûterait un aller-retour sur la route la plus chaude du produit
 * (chaque avatar, chaque vignette) pour ne gagner que la fenêtre d'une minute
 * qui sépare l'échéance du balayage. Le compromis est assumé et documenté, pas
 * oublié.
 */

/** Les deux seules colonnes qui décident si un message rend encore ses octets. */
export interface CarrierMessageLifecycle {
  readonly deletedAt?: Date | string | null;
  /**
   * Échéance de destruction — éphémère (cycle 92) comme brûlure de vue unique
   * (cycle 93), les deux promesses s'écrivent dans cette même colonne.
   */
  readonly expiresAt?: Date | string | null;
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

  if (!message.expiresAt) return true;

  // Une échéance illisible ne doit PAS passer pour une échéance dépassée : un
  // accident de sérialisation détruirait alors du média vivant. Elle se lit
  // comme l'absence d'échéance, l'état que la colonne portait avant écriture.
  const deadline = new Date(message.expiresAt).getTime();
  if (!Number.isFinite(deadline)) return true;

  return deadline > now.getTime();
}
