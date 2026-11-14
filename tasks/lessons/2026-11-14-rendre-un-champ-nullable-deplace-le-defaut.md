# Rendre un champ nullable déplace le défaut : toute comparaison d'identité qui le lisait devient une comparaison de deux inconnues

*2026-11-14, cycle 156. Trouvé en écrivant le correctif, pas en le relisant.*

## Le geste, et sa trappe

`ReactionUpdateEvent.userId` était `String` (requis) alors que le contrat le
déclare optionnel. Le correctif tient en un caractère :

```kotlin
val userId: String? = null
```

Deux sites le comparaient à l'identité du lecteur, et compilent toujours :

```kotlin
if (event.userId == me) { /* mon propre écho, ne rien animer */ }
```

`me` est `String?` — nul pour un lecteur **anonyme**. Avant le correctif,
`userId` ne pouvait pas être nul, donc l'égalité exigeait deux vraies valeurs.
Après, `null == null` rend **VRAI** : un lecteur anonyme prend la réaction d'un
tiers pour la sienne. La réaction cesse d'être animée et le delta n'est pas
appliqué.

Le correctif aurait donc échangé un défaut bruyant (l'événement n'arrivait
jamais) contre un défaut silencieux (il arrive et se trompe de personne) — pire,
parce que plus difficile à voir.

## La règle

**Élargir un type ne corrige rien tout seul : il RELOCALISE la question chez
tous ses lecteurs.** Un champ qui ne pouvait pas être absent portait une garantie
tacite, et chaque site qui s'y appuyait l'a perdue sans qu'une ligne ne change.

Le compilateur n'aide pas ici, et c'est ce qui rend la trappe praticable :
`String? == String?` est une comparaison parfaitement typée. Kotlin signale un
déréférencement, jamais une égalité entre deux absences.

> La question à poser en rendant un champ nullable n'est pas « est-ce que ça
> compile encore ? » mais **« qui comparait cette valeur, et que vaut sa
> comparaison quand les deux côtés sont absents ? »**

## Le remède, et pourquoi c'est un SITE et pas une condition

La réponse n'est pas de corriger les deux `if` sur place — ce serait deux copies
d'une règle, et la troisième, écrite plus tard, serait fausse. La question a un
nom et un seul site :

```kotlin
fun ReactionUpdateEvent.isOwnEcho(currentUserId: String?): Boolean =
    userId != null && userId == currentUserId
```

« Un acteur INCONNU n'est jamais moi » est une règle de produit, pas un détail de
nullabilité : elle mérite d'être énoncée une fois, testée une fois, et trouvable
par son nom.

## Où chercher la même trappe

Partout où un identifiant nullable rencontre l'identité du lecteur, qui est
elle-même nullable dès qu'un compte anonyme existe : `participantId`, `userId`,
`ownerUserId`, `actorId`, `senderId`. Le produit a des viewers anonymes — donc
`me` est nul pour de vrai, en production, régulièrement.
