# Cycle 171 — l'index que personne ne posait, et le témoin qui ne pouvait pas le voir

*2026-11-15. Branche `claude/exciting-planck-kexumt`, dans la continuité du
cycle 170.*

**Livré** : #18621 — l'index unique PARTIEL du dedup d'envoi est posé à chaque
démarrage. **Ouvert en chemin** : #18700 — les 45 migrations `.mongodb.js` que
nul déploiement ne joue.

---

## Le défaut

L'unicité de `(conversationId, clientMessageId)` est la SEULE chose qui ferme la
fenêtre de concurrence du dedup d'envoi. Le dépôt la documente sur place : « deux
requêtes concurrentes avec le même clientMessageId passent toutes les deux le
findUnique avant que l'une INSERT ». Sans contrainte réelle, le `catch` P2002
qui devait rattraper la seconde ne se déclenche jamais, et le repli « même
contenu sous 2 s » ne peut pas aider — il rend `false` dès qu'il y a une pièce
jointe.

`schema.prisma` décline `@@unique` **pour une bonne raison** : le connecteur
MongoDB poserait un index NON partiel, qui traite tous les `null` comme égaux et
casserait l'envoi pour toutes les lignes historiques. Le choix est juste.
**Ce qui manquait, c'est tout ce qui le rendait VRAI** — aucun déploiement ne
joue `prisma/migrations/*.mongodb.js`, aucun lanceur n'existe, rien ne vérifiait
sa présence.

Ce qui SURVIT sans lui : les renvois SÉQUENTIELS, absorbés par la lecture
précoce — le cas courant d'une vidange d'outbox. Ce qui ne survit pas : les
renvois réellement CONCURRENTS.

## Il a déjà manqué deux mois, et aucun témoin n'aurait pu le voir

Du 2026-05-09 au 2026-07-02, pour deux raisons qu'aucun témoin portant sur le
fichier de migration n'aurait attrapées :

| panne | ce qu'elle a donné |
|---|---|
| `$ne` dans le `partialFilterExpression` — opérateur NON supporté | `createIndex` lève, « l'index n'a JAMAIS existé en prod » |
| `db.messages` au lieu de `db.Message` — le model n'a pas de `@@map` | une collection VIDE, « l'index semblait créé et ne protégeait rien » |

Seul un audit manuel l'a trouvé. **C'est cela qui a dicté la forme des témoins
de ce lot** : ils portent sur la RÈGLE (la liste blanche des opérateurs qu'un
filtre partiel admet, telle que MongoDB la documente) et sur la SOURCE du nom de
collection (le model Prisma, qui ne porte aucun `@@map`) — jamais sur une copie
de la spec attendue. Une copie serait restée verte sur les deux pannes, parce
qu'elle aurait recopié la faute.

## La forme

`services/gateway/src/services/messaging/messageDedupIndex.ts`, posé par
`InitService.ensureMessageDedupIndexes` **hors de la porte `shouldInitialize()`**
— la base qui porte les messages à ne pas dupliquer est par définition peuplée,
donc celle que la porte ne laisse jamais passer. Le dépôt a payé exactement cette
confusion avec `ensurePostGeoIndex` (500 en production le 2026-08-25), et
`database-bootstrap.ts` existe pour rendre la séquence observable.

Le moteur n'est pas réécrit : `ensureSocialEventIndexesByCommand` a été scindé en
`ensureIndexesByCommand(prisma, specs)` + sa liste, et les deux ensembles le
partagent. Recopier la boucle aurait recopié avec elle ce qu'elle a appris — ne
jamais lire `listIndexes` par `$runCommandRaw` (Prisma lève sur un `$type`
textuel), lire « créé » au compte d'index, SIGNALER un conflit 85/86 au lieu de
droper. **Deux listes qui partagent la règle sans partager le code divergent au
premier défaut corrigé d'un seul côté.**

Postures d'échec, et elles sont DEUX :

- **conflit 85/86** ⇒ journalisé, laissé en place. Droper un index unique sous
  une base vivante est l'affaire d'une migration nommée, et refuser de servir
  laisserait en prime personne pour diagnostiquer.
- **toute autre erreur** ⇒ remonte et arrête le boot, comme chez les trois
  voisins. Un `E11000` dit que des doublons existent DÉJÀ — exactement ce que
  l'index devait empêcher. L'avaler ferait du démarrage le complice du défaut
  qu'il vient mesurer.

---

## Mutation, une garde à la fois

| # | mutation | témoins tombés |
|---|---|---|
| P1 | l'étape retirée de la séquence de boot | 2 |
| P2 | l'étape passe DERRIÈRE la porte du seed | 2 |
| P3 | la collection redevient `messages` | 3 |
| P4 | le filtre reprend l'opérateur `$ne` | 4 |
| P5 | l'index n'est plus unique | 3 |
| P6 | le filtre partiel disparaît | 4 |
| P7 | un conflit 85/86 est lu comme « présent » | 6 |
| P8 | toute erreur est avalée par `InitService` | 1 |
| P9 | `InitService` n'appelle pas le poseur | 2 |
| P10 | le poseur reçoit une liste vide | 6 |

P9 est le témoin que la séquence seule ne pouvait pas rendre : `bootstrapDatabase`
s'exécute contre un DOUBLE, donc il prouve qu'une étape est appelée, jamais
qu'elle émet quoi que ce soit vers la base de `InitService`.

## Ce que le lot n'a pas fermé

Le mécanisme qui a produit le défaut est intact : **45 migrations `.mongodb.js`,
aucune jouée par un déploiement, aucune trace de ce qui l'a été.** Plusieurs
portent des index uniques dont l'absence se lit, comme ici, comme un dedup qui
marche. Ce lot n'en ferme qu'une. → #18700.

## Preuve

- `src/services`, `src/__tests__/unit/services` et les gates de budget : 17 576
  témoins verts. Les 16 rouges sont environnementaux (`heif-convert`, `avifenc`,
  `jpegtran` absents du conteneur) et tombent à l'identique sur l'arbre STASHÉ —
  vérifié, pas supposé.
- `tsc --noEmit` EXIT=0.
