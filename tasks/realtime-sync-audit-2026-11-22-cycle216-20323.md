# Cycle 216 — la surface d'un module se mesure à ses appelants (#20323)

*Routine « amélioration continue du temps réel », sur `dev` à `b966bf371`. Lot
de correction d'une dette que la routine s'est faite à elle-même trois heures
plus tôt.*

## Le fait

`apps/web/src/lib/api/sync-seq.ts`, né avec #18601 (cycle 213), exportait huit
symboles. Mesuré après fusion : **un seul a un appelant** — `createSyncSeqTracker`,
par `socket.ts`. Les témoins du lot passent par la VRAIE connexion et n'importent
rien du module : ils n'en exerçaient aucun autre.

| symbole | appelant hors du module |
|---|---|
| `createSyncSeqTracker` | `socket.ts` |
| `SyncSeqState`, `EMPTY_SYNC_SEQ`, `syncSeqOf`, `detectSyncGap`, `recordSyncSeq` | aucun |
| `SyncSeqTracker.reset()`, `.lastSeq` | aucun |

## Pourquoi ce n'est pas un détail

C'est la règle que le cycle 210 a appliquée à UNE ligne de test — « aucun témoin
ne la demande, donc elle ne s'écrit pas » — et que le cycle 213 n'a pas appliquée
à son propre module, trois heures plus tard. **Écrire une règle ne l'applique pas
au lot qui l'écrit** ; c'est la forme que le `CLAUDE.md` de la passerelle signale
déjà pour un autre cas, et elle vaut ici.

Les deux méthodes mortes disaient en plus quelque chose de FAUX :

- `reset()` suggère un cycle de vie qui n'existe pas — le tracker est créé PAR
  CONNEXION, donc une reconnexion en fabrique un neuf et rien n'est jamais remis
  à zéro ;
- `lastSeq` suggère un curseur lisible de l'extérieur, c'est-à-dire ANNONÇABLE,
  alors que le cycle 214 venait d'établir, mesure à l'appui, que le web
  n'annonce pas son curseur et que `hasGap` ne le couvre pas. **L'export
  contredisait silencieusement la décision que le lot voisin venait d'écrire.**

## La preuve

Les sept témoins de `socket-sync-seq.test.ts` passent **sans modification** :
c'est exactement ce que le critère de fin demandait, et c'est ce qui vérifie le
relevé — s'ils étaient tombés, le module aurait eu un consommateur que le
balayage n'avait pas vu. Il reste deux exports : la fabrique et le type de ce
qu'elle rend.

## Gates

| gate | résultat |
|---|---|
| `bun test src/lib/api/socket-sync-seq.test.ts` | **7 verts / 0 rouge**, inchangés |
| `tsc --noEmit` (web) | **0** |
