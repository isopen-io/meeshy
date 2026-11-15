## Leçon 235 — un correctif se pose sur le fichier qui porte le TRAFIC, pas sur celui qui porte le NOM (2026-08-18, routine messagerie, cycle 68)

**Contexte.** Le cycle 67 a livré les multi-réactions sur quatre surfaces. Son
message de commit décrit le volet web ainsi : « retrait du cap client
`MAX_REACTIONS_PER_USER=3` ». La phrase est exacte, et elle porte sur
`apps/web/hooks/use-message-reactions.ts` — un hook que **zéro composant de
production n'importe**. Le hook réellement monté par les quatre surfaces de
réaction est `apps/web/hooks/queries/use-reactions-query.ts`, et il gardait son
cap intact.

Livré : la fonctionnalité ne marchait pas sur le web au-delà de trois emojis.
Le 4e tap produisait un toast, aucune ligne, aucun événement — et rien côté
gateway ne pouvait l'observer, puisqu'un cap qui refuse AVANT l'émission ne
laisse aucune trace sur le transport.

**Ce qui a rendu la confusion naturelle.** Le fichier mort porte le nom de la
fonctionnalité (`use-message-reactions`) ; le fichier vivant porte le nom de sa
technique (`queries/use-reactions-query`). Une recherche par intention tombe sur
le premier. Le second ne se trouve qu'en partant des CONSOMMATEURS.

> **Avant d'éditer un fichier client, remonter à ses importateurs de
> production.** `grep -rn "<nom-du-module>" --include=*.tsx | grep -v __tests__`
> — zéro résultat hors du fichier de tests signifie que le correctif ne changera
> rien pour personne. Le coût est d'une commande ; le prix de l'omission est une
> fonctionnalité entière livrée inerte, avec sa migration de base de données et
> ses témoins verts.

### Corollaire — un témoin vert peut être la SPÉCIFICATION du défaut

`Max Reactions Limit › should prevent adding more than max reactions` affirmait
`success === false` sur la 4e réaction. Vert, et gelant exactement ce qu'il
fallait retirer. Comme au cycle 67 § 4 bis : le témoin d'un défaut ne se trouve
pas en cherchant le nom de la fonctionnalité — il se trouve en lisant ce que le
site VIVANT affirme aujourd'hui.

### Corollaire — retirer une variable a DEUX sites, et le second ne ressemble pas à un usage

Le cap retiré, `t` restait dans le tableau de dépendances de son `useCallback` :

```
ReferenceError: t is not defined
  }, [enabled, messageId, isPersisted, userReactions, addMutation, t]);
```

`tsc` ne l'a pas discriminé (le projet web porte 1 264 erreurs préexistantes
dans ses fichiers de test) ; la suite l'a vu au premier rendu. Un tableau de
dépendances est évalué à CHAQUE rendu : livré, il plantait toute bulle montée.

> **Après avoir supprimé une variable d'un composant React, grep son
> identifiant dans le fichier** — les tableaux de dépendances la mentionnent
> sans y ressembler, et un typecheck noyé dans du bruit préexistant ne
> l'attrapera pas.

### Corollaire — une raison de NE PAS faire est une affirmation, et elle se vérifie

Ce même cycle a d'abord différé la suppression du hook mort avec cette
justification : « un retrait de fichier intégralement couvert tire la couverture
globale vers le bas, et le seuil CI est à `lines: 42` ». Prudent, et **faux** :
mesurée, la couverture web est à **60,21 %** — dix-huit points de marge. Les 413
lignes retirées la déplacent de moins d'un quart de point.

La formule « à instruire avec la mesure, pas avec l'intuition » avait été écrite
dans l'audit… sans que la mesure soit prise.

> **Un motif de report qui porte sur un CHIFFRE se vérifie avant d'être écrit.**
> Sinon c'est une intuition qui a emprunté le vocabulaire de la rigueur — et
> elle est plus difficile à déloger qu'un aveu d'incertitude, précisément parce
> qu'elle en a la forme.

### Corollaire — « N suites touchées » est une note de vérification qui ANNONCE le trou

Le même commit `a0e0c2ac` a laissé `main` ROUGE : `ReactionService.test.ts`
interrogeait toujours `replacedEmojis`, champ qu'il venait de supprimer. Sept
témoins en échec, découverts par le CI de la PR suivante.

Sa note de vérification le disait déjà, sans que personne (moi compris, deux
jours plus tard) ne l'entende :

> « 493 verts sur les **5 suites gateway touchees** »

Touchées — pas la suite. Le fichier fautif n'avait pas été ouvert, donc il
n'était pas dans les cinq ; il testait pourtant la classe exacte qui changeait.
La leçon du cycle 67 § 4 bis (« lancer la suite LARGE avant de conclure »)
existait déjà, écrite deux jours plus tôt.

> **Un périmètre de test qui se décrit par les fichiers TOUCHÉS ne prouve rien
> sur un changement de CONTRAT.** Retirer un champ d'un type public rend
> suspecte toute suite qui lit ce type, pas seulement celles qu'on a éditées —
> et la seule façon de les énumérer est de toutes les lancer. Quand une note de
> vérification doit qualifier son périmètre (« les N suites touchées », « les
> tests concernés »), c'est le signe que la suite complète n'a pas tourné : la
> qualification EST l'aveu.
