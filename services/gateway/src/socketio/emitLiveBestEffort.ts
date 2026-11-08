/**
 * Une émission VIVANTE ne peut pas emporter l'enfilage DURABLE qui la suit
 * (#17026).
 *
 * `io.to(room).emit(...)` LÈVE quand l'adaptateur ou l'encodeur est en défaut —
 * c'est une affirmation du dépôt, écrite là où il s'en garde
 * (`socketio/utils/emitWithSeq.ts` : « la cause est réelle et pas
 * hypothétique ») — et sept unités plaçaient cet appel dans le même `try` que
 * la mise en file hors ligne qui le suit, sous un `catch` de fin de méthode.
 * Une diffusion tombée annulait alors le rejeu de TOUS les absents, sur un
 * message, une édition ou une suppression DÉJÀ PERSISTÉS. Rien ne retriait, et
 * aucun client ne refetch de lui-même.
 *
 * ─── Pourquoi un helper, et pas la règle écrite quelque part ─────────────────
 *
 * Elle ÉTAIT écrite, et à deux endroits : le § « Sa PLACE fait partie de la
 * garantie » de `MessageHandler.broadcastNewMessage` et son jumeau dans
 * `postMessageSyncFanOut`, qui expliquent tous deux que l'enfilage est remonté
 * AVANT les synchros cosmétiques pour cette raison exacte. Les deux nommaient
 * ce qui vient APRÈS, et aucun des deux n'a tiré la conséquence sur ce qui vient
 * AVANT. C'est la leçon 307 : une règle ne se propage pas depuis son énoncé,
 * elle vaut là où quelqu'un l'a récitée. Un helper se trouve par ses appelants
 * et se compte ; un paragraphe ne se compte pas.
 *
 * ─── Ce que ce helper ne fait PAS ───────────────────────────────────────────
 *
 * Il ne déplace rien. L'ordre reste celui du cycle 116 — charger la liste,
 * enfiler (durable), diffuser la cosmétique. Il empêche la première étape de
 * supprimer la seconde, et rien de plus. En particulier il n'avale pas l'erreur
 * en silence : `onError` est REQUIS, parce qu'une panne d'adaptateur qui ne
 * laisse aucune trace est la même panne, simplement indiagnosticable.
 */
export function emitLiveBestEffort(emit: () => void, onError: (error: unknown) => void): void {
  try {
    emit();
  } catch (error) {
    onError(error);
  }
}
