## Leçon 332 — un garde-fou posé sur un PLANCHER DE VOLUME mesure la dette, pas l'outil : il rougit sur le progrès, puis on l'abaisse à zéro

**Contexte (2026-08-30, lot 6).** `route-auth-coverage.test.ts` vérifie qu'aucun
appel littéral du web ne vise une route absente. Il extrait les appels de
`apps/web`, puis se protège lui-même :

```ts
// Garde-fou du harnais lui-même : si l'extraction cesse de trouver des
// appels, la garde passerait au vert en ne mesurant plus rien.
expect(littéraux).toBeGreaterThan(40);
```

L'intention est juste et l'énoncé du commentaire est exact. Le lot #4281 a migré
**217 sites** vers le catalogue partagé ; il en restait **3**. Le garde-fou est
tombé — et le gate a annoncé un échec là où venait de se produire une réussite.

> **Le plancher ne mesurait pas la santé de l'EXTRACTEUR, il mesurait l'ampleur
> de la DETTE.** Les deux coïncidaient le jour où il a été écrit, parce que le
> web écrivait toutes ses adresses à la main. Ils divergent dès que quelqu'un
> travaille à réduire la dette — c'est-à-dire dès que l'outil sert à quelque chose.

**Le piège n'est pas l'échec, c'est la réparation évidente.** Devant un plancher
qui rougit, le geste naturel est de l'abaisser : `> 40` devient `> 3`. Il
rougira de nouveau à la prochaine migration, deviendra `> 0`, et à `> 0` il ne
garde plus rien — exactement l'état muet qu'il avait été écrit pour interdire.
**Un plancher posé sur une quantité qu'un chantier a pour BUT de réduire à zéro
est un compte à rebours vers sa propre désactivation.**

**La question à poser à tout garde-fou de harnais n'est donc pas « ce seuil
est-il au bon niveau ? » mais « ce que je compte peut-il légitimement tomber à
zéro ? ».** Si oui, le seuil est le mauvais instrument, quel que soit sa valeur.

**Le correctif est de séparer les façons dont la garde peut devenir MUETTE, et
d'ancrer chacune sur quelque chose qui ne décroît pas** :

| devenir muette par… | ancrage qui ne décroît pas |
|---|---|
| le balayage n'atteint plus l'arbre | `fichiers.length` — le nombre de fichiers LUS, indépendant de ce qu'ils contiennent |
| l'extracteur ne reconnaît plus les appels | un **ÉCHANTILLON FIXE** dans le test, qui rougit même le jour où il ne reste plus un seul littéral en production |

L'échantillon est le point clé : il transforme « y a-t-il encore de la dette ? »
(qui décroît) en « l'outil fonctionne-t-il ? » (qui ne décroît pas). Prouvé
rouge en retirant une des deux formes d'appel du motif ; revert vérifié
identique.

**Corollaire de composition de lot.** Ce défaut ne pouvait apparaître qu'à
l'INTÉGRATION : la garde vit dans `services/gateway`, la migration qui la fait
tomber vit dans `apps/web`, et les deux appartenaient à deux issues différentes
confiées à deux agents différents. Chacun avait raison chez lui. L'agent du web
l'avait d'ailleurs vu venir à moitié — il a écrit que son critère « garde de
contrat gateway » était « mûr par ANALYSE, non exécuté », en concluant « par
construction elle ne peut que devenir plus silencieuse », et en ajoutant :
*« worth a quick gateway-side run before closing »*. Le raisonnement était juste
et la conclusion fausse — **« plus silencieuse » a franchi un plancher que
l'analyse ne connaissait pas.**

> **Un critère qualifié « mûr par analyse, non exécuté » est un critère NON
> VÉRIFIÉ**, et c'est à l'intégrateur de l'exécuter. Quand un agent dit
> lui-même quel gate manque, le lancer coûte quelques minutes ; ne pas le
> lancer coûte une CI rouge que personne n'attribue.

**Et un cliquet inter-paquets ne se voit d'aucun gate de paquet.** Le lot web
était vert sur `apps/web` (816/816) au moment même où il faisait rougir une
suite de `services/gateway`. C'est la même topologie que le catalogue dérivé
(`endpoints.ts` dans `packages/shared`, régénéré depuis un manifeste de
`services/gateway`) : **dès qu'un lot touche une frontière, le gate qui compte
est celui de l'AUTRE côté.**
