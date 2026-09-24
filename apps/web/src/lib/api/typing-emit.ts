/**
 * LE PORT D'ÉMISSION DU TEMPS RÉEL (revue-correction #5793) — un module SANS
 * aucune dépendance, que les écrans importent à la place de `api/realtime.ts`.
 *
 * POURQUOI IL EXISTE. `view/use-typing-emitter.ts` importait `emitTyping`
 * depuis `api/realtime.ts`, qui importe `net/socket-io-factory.ts`, qui importe
 * `socket.io-client`. Comme `routes/thread.tsx` importe le hook STATIQUEMENT,
 * le graphe mesuré (`bun run build`, `dist/assets/thread-*.js`) faisait de
 * `realtime-*.js` ET de `socketio-*.js` des dépendances STATIQUES du chunk du
 * fil : ouvrir une conversation exigeait alors 17 Ko gzip de plus AVANT que le
 * module du fil puisse s'exécuter, et le libellé `on_demand_chunks` de
 * `budgets.json` affirmait le contraire de ce que le build produisait.
 *
 * CE QUE ÇA COÛTERAIT À L'ÉCHELLE. Ce hook est le PREMIER d'une famille : les
 * 40+ surfaces à porter émettront des réactions, des accusés de lecture, des
 * présences. Si chacune importe le module qui POSSÈDE la connexion,
 * `socket.io-client` devient une dépendance statique de chaque route —
 * l'inverse exact d'un chunk à la demande. Le sens de la dépendance est donc
 * INVERSÉ ici une fois pour toutes : `api/realtime.ts` (le possesseur, chargé
 * en `import()` par `main.tsx`) s'ENREGISTRE ; les écrans APPELLENT, sans
 * jamais savoir ce qui se trouve au bout.
 *
 * Motif `net/transport.ts` / `net/socket.ts` (le contrat d'abord, le
 * producteur ensuite), appliqué au sens de la dépendance plutôt qu'à sa forme.
 */

export type TypingEmitter = (conversationId: string, isTyping: boolean) => void;

let typingEmitter: TypingEmitter | null = null;

/** Appelé par `api/realtime.ts` à son chargement, et par un témoin qui veut
 * observer ce qui part. `null` DÉSARME (aucune connexion : l'appel devient un
 * no-op silencieux, ce que l'appelant n'a pas à savoir). */
export function setTypingEmitter(next: TypingEmitter | null): void {
  typingEmitter = next;
}

/** NO-OP tant qu'aucune connexion n'existe (hors ligne, session non établie,
 * temps réel pas encore chargé) — l'appelant ne le sait pas et n'a pas à le
 * savoir, motif `useSend`/`performSend` (la RÈGLE est ailleurs, le hook ne fait
 * que la DÉCLENCHER). */
export function emitTyping(conversationId: string, isTyping: boolean): void {
  typingEmitter?.(conversationId, isTyping);
}
