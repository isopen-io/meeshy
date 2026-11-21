## Une valeur NOMMÉE par le serveur dispense le client de sa loi — la loi du serveur doit donc être au moins aussi stricte que celle qu'elle remplace, et c'est la réparation d'une panne qui l'exige (2026-11-19, #19919)

**Contexte.** `mostRecentSharedConversation` dit au client où poser la copie vocale
d'un talkie qui n'a pas été entendu. Son `where` bornait les candidates par
`deletedAt: null` — une égalité qu'aucune conversation vivante ne satisfait sous
MongoDB — donc la fonction rendait `null` pour toute la population (#19905). Le lot
qui répare cette amputation la rend, pour la première fois, capable de NOMMER une
destination.

**Ce que personne ne regarde quand on répare une panne : ce que la valeur réparée
AUTORISE.** Les trois clients portent chacun leur propre loi d'éligibilité — web
`mayCarryTheCopy`, iOS `TalkieCopyCandidate.mayCarryTheCopy` — et tous deux
l'appliquent à la liste qu'ils CHERCHENT eux-mêmes. Quand le serveur nomme, ils ne
la rejouent pas :

```ts
if (named !== null && canSendPlaintext({ conversationId: named })) return named;   // web
```
```swift
let conversationId = if let named { named } else { try await destination(for: toUserId) }  // iOS
```

Le `where` du serveur était **strictement plus faible** que la loi cliente — il ne
disait rien de `communityId`, alors qu'un salon de communauté est une
`Conversation` de type `group` dont les membres sont des participants actifs, donc
un partage au sens de cette fonction. Le message vocal privé d'Alice à Bob aurait
été publié dans le salon, lisible par tous les membres de la communauté.

> **Une valeur nommée par le serveur est lue comme une AUTORISATION, pas comme une
> suggestion** — et aucun client ne l'écrit, parce que le court-circuit ressemble à
> une optimisation (« le serveur a déjà choisi »). La question à poser à toute
> valeur qu'un serveur NOMME à la place d'un client n'est donc pas « est-elle
> juste ? » mais **« quelle loi le client cesse-t-il d'appliquer parce que je la
> nomme, et la mienne est-elle au moins aussi stricte ? »**. Elle se répond en
> ouvrant la loi cliente ligne à ligne et en la confrontant au `where`, condition
> par condition — un tableau, pas une impression.

**Et la promesse était ÉCRITE.** Le doc-comment du fichier disait depuis #17141 :
« une copie n'atterrit ni dans une communauté, ni dans une conversation chiffrée ».
La seconde moitié était tenue par un filtre ; la première ne l'était par rien. Une
énumération de deux termes dont un seul est appliqué se relit comme une règle
complète — c'est la forme de la note de `storyAuthorSelect`, qui énumérait trois
audiences gatées en omettant la quatrième.

**La règle de lot qui l'attrape.** Le dépôt l'a déjà : « une PANNE peut tenir la
porte, et la réparer l'ouvre » (cycle 84). Ce cas en donne la version la plus
coûteuse, parce que la panne et la porte sont dans le MÊME `where`, à une clause
l'une de l'autre, et que le lot qui répare la panne croit n'avoir touché qu'elle.
**Un lot qui fait passer une fonction de « ne rend jamais rien » à « rend quelque
chose » n'est pas un correctif local : il met en service tout ce qui consomme sa
valeur**, et doit donc instruire chaque consommateur avant d'être livré.

**Mesure.** Trouvé par l'audit adversarial, pas par le lot. Reproduit de bout en
bout avant d'être corrigé : les deux clients ouverts à la ligne, la forme du salon
de communauté vérifiée au site de création, les lignes `Participant` du salon
vérifiées chez `admitSalonOccupants`. Le prédicat retiré fait tomber 3 des 13
témoins.
