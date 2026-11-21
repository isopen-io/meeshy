## Cycle 199 — un verdict de la passerelle reposait sur un fait du web que rien ne tenait (#20148)

**Date** : 2026-11-21. **Base** : `dev` à `36970d31db`. **Issue** : #20148.

### Le trou

`UNQUEUED_FAMILY_VERDICT` déclare `attachment-status:updated` en
**`reload-serves-truth`** — donc aucune entrée de file hors ligne — et sa raison
écrite est, pour moitié, dans un AUTRE PAQUET :

> « le web n'ENREGISTRE rien de l'événement — il invalide
> `attachmentStatusDetailsQueryKey`, les deux requêtes de
> `message-receipts-sheet.tsx` étant en `staleTime: 0`. »

Le doc du module le disait lui-même : un `reload-serves-truth` est une **mesure
datée**, qui « peut cesser d'être vraie le jour où un cache change de
`staleTime` ». **Rien ne tenait ce `staleTime`.** Le témoin web existant prouve
qu'une ligne REMPLACÉE dans le cache atteint le pixel — l'autre moitié, et pas
celle qui porte le verdict.

Une optimisation parfaitement raisonnable — `staleTime: 30_000` sur une feuille
qu'on rouvre souvent — rendait donc le verdict FAUX en silence, et ramenait le
défaut de #20019 : un lecteur revenu voit une position périmée, sans erreur et
sans trace.

### Le livrable, et où il vit

Un témoin **web**, de COMPORTEMENT et non de configuration : il sème une
position périmée dans le cache, ouvre la feuille, et exige que ce qui s'affiche
vienne du SERVEUR. Il tient donc le fait quelle que soit la mécanique qui le
produit — `staleTime`, `refetchOnMount`, ou ce qui les remplacera.

**Il vit côté web, et c'est la décision.** Un témoin de la passerelle qui lirait
`apps/web` coupleraient leurs suites et se briserait au premier déplacement de
fichier ; surtout, le fait APPARTIENT au web, donc c'est à lui de le tenir. Les
deux sites se nomment mutuellement : le témoin cite le verdict qu'il soutient,
le verdict cite le témoin qui le tient.

### Le ROUGE, prouvé par mutation

`staleTime: 60_000` sur la requête des pièces de `message-receipts-sheet.tsx` ⇒
**1 seul témoin rouge, le nouveau**. Les quinze autres de ce fichier restent
verts : ils mesurent autre chose, et le nouveau ne recouvre aucun d'eux.

### La leçon, en une phrase

**Un correctif peut avoir raison sur ce qu'il sert et faire reposer sa raison
sur un paquet que son cliquet ne lit pas.** C'est la forme du cycle 123
déplacée d'un cran : non plus « que transporte-t-il à côté ? » mais « *de quel
fait, ailleurs, dépend ce que je viens d'écrire — et qui le tient ?* »
