/**
 * **QUI ne doit RIEN apprendre d'un message : le destinataire d'une DEMANDE en
 * attente** (#14107) — le prédicat, posé sur des lignes DÉJÀ LUES.
 *
 * `MentionService.withoutPendingMessageRequests` interroge la base ; ce
 * jumeau-ci sert les deux sites qui ont déjà la colonne sous la main, et c'est
 * ce qui permet à la garde d'être GRATUITE chez eux : l'éventail d'ENVOI
 * (`messageNotificationFanOut`) et l'éventail de notification d'une ÉDITION
 * (`messageMentions.notifyNewlyMentioned`) lisent tous deux les participants de
 * la conversation.
 *
 * Il existe parce que la règle était formulée DEUX fois et appliquée UNE
 * (#17074) : l'envoi l'inlinait, l'édition ne l'avait pas, et un inconnu dont
 * la demande n'était pas acceptée faisait donc sonner le téléphone de sa cible
 * en ÉDITANT son message pour y ajouter sa mention — bannière haute priorité,
 * e-mail immédiat, et le texte gravé dans la base locale de l'appareil par la
 * pré-inscription de la NSE.
 *
 * > **Avant de conclure qu'une garde coûterait une requête, regarder ce que le
 * > site lit déjà.** Les deux la lisaient ; il ne manquait qu'un nom partagé
 * > pour que la règle cesse d'être une formulation locale.
 *
 * ─── Pourquoi un module FEUILLE, et pas une fonction de `MentionService` ────
 *
 * Elle y a vécu une heure, et un double de test l'a avalée. `MentionService`
 * est un module LOURD (cache, moteur de suggestions, projections) que plusieurs
 * suites remplacent par un double qui ÉNUMÈRE cinq méthodes à la main ; mon
 * import l'a donc résolue en `undefined` chez l'un d'eux, l'appel a levé dans
 * le `try` de l'éventail, et l'intégration E2EE à deux appareils a cessé de
 * créer AUCUNE notification — un symptôme à deux fichiers de la cause.
 *
 * C'est le patron que le dépôt a déjà payé trois fois : **un double PARTIEL
 * perd en silence tout ce que le module GAGNE, et il ne se signale qu'au moment
 * où le module grandit.** Un prédicat pur n'a aucune raison de dépendre d'un
 * service : ici, il ne dépend de rien, donc aucun double ne peut le remplacer.
 *
 * Une ligne SANS la colonne (`undefined`) n'est pas silencieuse : le prédicat
 * exige une DATE. C'est le même verdict que l'éventail d'envoi rendait déjà, et
 * c'est juste — une projection qui ne demande pas la colonne est un défaut de
 * `select`, que le témoin de projection attrape, pas une autorisation.
 */
export const pendingRequestUserIds = (
  participants: ReadonlyArray<{ readonly userId?: string | null; readonly messageRequestAt?: Date | null }>,
): ReadonlySet<string> =>
  new Set(
    participants
      .filter((participant) => participant.messageRequestAt instanceof Date)
      .map((participant) => participant.userId)
      .filter((userId): userId is string => Boolean(userId)),
  );
