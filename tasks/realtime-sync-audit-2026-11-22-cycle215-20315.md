# Cycle 215 — un rouge local qui nomme le code d'un autre (#20315)

*Routine « amélioration continue du temps réel », après la fusion des cycles 209
à 214. Lot de MÉTHODE, né d'une vérification de santé de `dev`.*

## Pourquoi ce lot existe

Six lots ayant été fusionnés dans `dev` cette nuit à côté de ceux d'autres
sessions, la suite complète d'`apps/web` a été jouée sur `dev` — exactement ce
que la directive #18654 demande après un train de fusions. Elle a rendu **3
rouges**, tous dans du code que je n'avais pas touché et que `dev` venait de
recevoir.

**Aucun n'était un défaut.** Les trois venaient d'artefacts de build périmés dans
le conteneur, et c'est la TROISIÈME fois de la nuit, avec une signature
différente à chaque fois :

| artefact périmé | ce que le rouge DIT | où |
|---|---|---|
| `packages/shared/dist` | `TypeError: communitiesEndpoints.byIdJoinLink is not a function` | 5 rouges `apps/web` (cycle 211) |
| client Prisma généré | `TS2353: 'joinLinkPausedAt' does not exist in type 'CommunityUpdateInput'` | `tsc` passerelle (cycle 214) |
| `packages/shared/dist` | `Clé du jeu « undefined » lue en « fr » avant que sa partie du catalogue soit chargée` | 2 rouges `apps/web` (ce cycle) |

Un export manquant, un champ Prisma inconnu, une clé de catalogue `undefined` :
rien qui ressemble à « ton arbre n'est pas préparé ». Le symptôme vit en AVAL de
la cause, donc il porte le nom du code qui l'a RÉVÉLÉ — toujours le plus récent,
c'est-à-dire celui qu'on vient de fusionner.

## Ce que le lot écrit

- **Le `CLAUDE.md` racine**, là où les trois prérequis sont déjà listés, dit
  désormais **ce que leur absence produit** : les trois signatures, nommées, avec
  la commande qui les efface, et la règle qui les résume.
- **Une leçon** : *un rouge local qui nomme un lot fraîchement fusionné se
  confronte d'abord à l'ARBRE, pas au lot* — miroir de la règle du 2026-11-15
  (« une CI rouge sur des témoins qu'on n'a pas touchés se diagnostique en
  neutralisant ses propres témoins »), les deux se distinguant par la seule
  question : *où le rouge se produit-il, et où ne se produit-il PAS ?*

## Ce que la même mesure a donné de bon

Sur `dev` à `73e99b4e8`, arbre correctement préparé :

```
 35034 pass
 1 fail
Ran 35037 tests across 2707 files. [475s]
```

L'unique rouge est `act-leak-guard.test.ts` — **#20285**, la garde des `act()`
abandonnés sous bun 1.4.4, verte en CI sur 1.3.14. Autrement dit : hors de ce
rouge connu et documenté, **`dev` est vert sur le web**. La mesure a été portée
en commentaire sur #20285, qui en avait besoin : elle transforme « 3 rouges »
en une phrase défendable.

## Ce que ce lot ne fait PAS

Pas de commande unique qui rejoue les trois prérequis : elle est mentionnée dans
#20315 comme facultative, à juger sur sa valeur. Écrire la trace que personne ne
sait lire coûte trois lignes ; écrire un script que personne n'appelle coûte un
fichier de plus à tenir.

## Gates

| gate | résultat |
|---|---|
| suite complète `apps/web` sur `dev` (arbre préparé) | 35 034 verts / 1 rouge (#20285) |
| les deux fichiers de jeu, après `bun run build` | 26 verts / 0 rouge |
| `journal-one-file-per-entry-guard` | 18/18 |
