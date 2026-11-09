## 2026-11-09 — Le suivi qu'un journal DÉCLARE est le travail le plus DISPUTÉ du dépôt, pas le plus libre — et mon relevé de collision excluait exactement les branches de ma propre routine (#17080)

J'ai développé, fait auditer et rendu verte en CI une PR (#17185) que le porteur
a fermée sans fusionner, parce qu'une session parallèle avait livré le même
correctif quarante minutes plus tôt (#17193, fusionnée dans `dev` à 05:29).
**Deux autres PR du même lot ont été fermées en même temps** (#17156, #17160) :
au moins quatre sessions sur le même défaut.

### Les deux fautes, et aucune n'est « je n'ai pas vérifié »

**1. J'ai pris le suivi d'un journal pour une réservation.** Le cycle 150 avait
écrit de #17080 : « pas pris ici : le lot touche la charge push de trois
éventails et le décodage NSE, donc il demande son propre tour ». J'ai lu cela
comme *disponible*. C'est l'inverse : **un suivi écrit, motivé et borné dans un
journal public est le candidat le plus probable de la prochaine session** — le
mien, et celui de toutes les autres. La phrase qui le rend attirant pour moi le
rend attirant pour elles, au même instant, pour les mêmes raisons.

**2. Mon relevé de collision a balayé les mauvaises branches.** J'ai bien listé
les 25 branches distantes les plus récentes, et `claude/exciting-planck-asw4sp`
et `claude/exciting-planck-qj0mxr` y étaient. J'ai ensuite comparé les diffs de
**sept** branches aux fichiers que je visais — et pas une seule des
`exciting-planck-*`, c'est-à-dire **exactement les branches de ma propre
routine.** Je les ai lues comme « la mienne et ses passées », donc hors sujet,
quand ce sont les plus susceptibles de viser le même suivi que moi.

> **Un relevé de collision qui exclut les branches de sa propre routine mesure
> la collision avec les ÉTRANGERS.** Or la routine est en concurrence avec
> elle-même : plusieurs instances partent du même journal, lisent le même suivi
> déclaré et choisissent le même lot. Le voisin le plus dangereux porte le même
> préfixe de branche que moi.

### Ce qui l'aurait attrapé, et qui coûte une commande

Le discriminant n'est ni le fichier ni le préfixe de branche : c'est le **NUMÉRO
D'ISSUE**. Avant d'écrire la première ligne :

```bash
gh api -X GET search/issues -f q='repo:isopen-io/meeshy is:pr is:open 17080'
gh api "repos/isopen-io/meeshy/issues/17080/timeline" --jq '.[].source.issue.number'
```

La seconde rend les références croisées — donc toute PR qui cite déjà l'issue.
`#17156` y figurait **avant** mon premier commit, sous un titre qui disait tout
(« Cycle 150 bis — l'enveloppe de l'appareil part sur les trois éventails »). Je
n'ai cherché ni par numéro, ni par titre : j'ai cherché par **chemin de
fichier**, sur un sous-ensemble choisi par moi.

### Ce que la doctrine du dépôt dit déjà, et que je n'ai pas appliqué

« Une session qui découvre, au relevé, qu'une branche vivante écrit déjà ses
chemins cède ce travail et en prend un autre — elle ne négocie pas, ne fusionne
pas en avance, ne double pas. » La règle était juste et écrite ; **c'est mon
relevé qui était faux**, et un relevé faux rend la règle inapplicable sans
qu'aucun gate ne rougisse. C'est la leçon du cycle 107 (« un balayage qui cherche
UN idiome mesure sa popularité, pas une propriété ») appliquée à moi-même.

### Ce qui survit, et c'est la seule consolation utile

Le travail n'est pas perdu parce qu'il était en double : il est perdu parce que
**rien de ce qu'il avait en PLUS n'a de chemin vers `dev`**. Mesuré contre la
tête de `dev` après la fusion du jumeau : l'enveloppe sur les trois éventails et
la garde de cycle de vie y sont (même règle, autre forme — le jumeau la force au
COMPILATEUR, ce qui est plus élégant que mon second verrou d'exécution) ; **ne
s'y trouvent pas** les constantes de `locKey` avec leur cliquet d'unicité, ni le
littéral écrit à la main de `messageMentions.ts` qu'il corrige.

> Quand on cède un lot en double, **mesurer le delta contre le jumeau fusionné
> avant de jeter** : ce qui reste est petit, indépendant, et c'est la seule part
> qui vaut encore une PR.
