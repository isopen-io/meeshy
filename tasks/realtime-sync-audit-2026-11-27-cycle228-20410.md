# Cycle 228 — le cœur d'un commentaire cesse de dépendre d'un roster (#20410, étape 1/3)

**Date** : 2026-11-27 (livré dans la nuit du 27 au 28) · **Branche** :
`claude/exciting-planck-l8vh18` · **Issue** : #20410 (étape 1 sur 3) · touche
aussi #20415 constat 1

## Pourquoi cette étape existe

#20337 a fermé la fuite du roster des réacteurs par l'AUDIENCE ; la charge de
`comment:reaction-added` / `-removed` nomme toujours tous les réacteurs, et
`PostReactionAggregation` porte déjà la coupe six lignes plus loin (« NO
userIds, count only »). Ce qui empêche de couper, mesuré par #20410 : **iOS
dérive « mon cœur » du roster**, donc un retrait sec rendrait « un cœur de
trop » à tout lecteur ayant aimé — ce que la rétrocompatibilité interdit
(#9223).

Ce lot est l'étape 1 : rendre le registre de cœurs INDÉPENDANT du roster, pour
qu'une version déployée plus tard permette la coupe serveur.

## La prescription de l'issue avait un trou, et c'est le cœur du lot

L'issue prescrit : « les branches A/B se remplacent par
`actorUserId == myUserId ? (action == .add ? insert : remove) : ()`, **et C
reste** ». Or C est :

```swift
return likedIds.contains(commentId) ? count + 1 : count
```

Sans le roster, **tout lecteur ayant déjà aimé tombe dans C sur l'événement d'un
tiers** et voit `count + 1` — alors que le compte absolu du serveur le compte
déjà. C'est exactement le défaut que l'issue décrit comme la raison de ne pas
couper tout de suite, reproduit par sa propre réparation.

> **Le discriminant que C utilise n'est pas celui dont il a besoin.** Son
> doc-comment disait juste à quoi il sert — « l'agrégat d'un tiers qui arrive
> pendant que mon like est EN VOL ne me connaît pas encore » — et interrogeait
> `likedIds` (« mon cœur est-il posé ? ») au lieu de `inFlightIds` (« mon geste
> est-il encore en vol ? »). Les deux coïncidaient tant que le ROSTER
> interceptait le cas « déjà aimé, rien en vol » avant lui. Retirer le roster
> découvre l'écart.

La réparation garde donc l'offset optimiste d'un geste **en vol** au lieu de
l'absorber dans le compte rendu. L'affichage (`likes + delta`) est identique à
l'ancien dans tous les cas mesurés ; c'est la BASE rendue qui change, et aucun
témoin n'avait de raison de l'asserter — deux d'entre eux le faisaient, et
portent désormais sur l'affichage.

## Ce que le lot abandonne, écrit sur place

- **Un cœur local périmé n'est plus corrigé par l'événement d'un tiers** (je
  l'avais aimé depuis un autre appareil, l'état local l'ignore). Il revient par
  la lecture REST, nominative et filtrée. L'issue l'accepte explicitement.
- **Une course étroite sur-compte d'un** : le serveur a committé mon geste et un
  tiers diffuse avant que mon propre écho n'arrive. Mon écho purge l'offset, et
  c'est exactement la fenêtre pendant laquelle l'offset est légitime.

## Les quatre sites, et le troisième que l'issue ne nommait pas

L'issue nomme `PostDetailViewModel.swift:697,711` et
`CommentsSheetLiveSync.swift:62`. Le relevé rend un **troisième** applicateur :
`StoryCommentSession.applyReaction` (le fil de commentaires d'une story), qui
passait aussi `reactorUserIds`. Les trois sont corrigés ; le dernier lecteur du
roster du dépôt a disparu (mesuré : zéro occurrence de `aggregation.userIds` et
de `reactorUserIds` hors tests et hors doc-comments).

**La direction vient du champ `action` de la charge** (`"add"` / `"remove"`),
que les trois sites portent déjà — pas d'un paramètre à acheminer depuis deux
puits séparés. `CommentHeartLedger.HeartChange(wireAction:)` le lit, et rend
`nil` sur toute autre valeur : une direction illisible ne bouge le cœur dans
AUCUN sens (fail-safe — notre propre passerelle est le seul producteur).

**Le cas « sans session » est séparé**, et c'est une correction de forme : sans
`myUserId`, il n'y a aucun « moi » à reconnaître, donc aucun geste optimiste à
préserver. Le confondre avec le cas « tiers » aurait fait survivre un offset
dans un registre qui n'appartient à personne.

## La garde, parce que le roster est encore SERVI

`CommentHeartRosterIndependenceGuardTests` balaie `apps/ios/Meeshy` et
`packages/MeeshySDK/Sources` (> 1 000 fichiers, vérifié par le témoin lui-même)
et refuse `aggregation.userIds` et `reactorUserIds`. Inventaire **VIDE** : il
n'y a pas de lecture légitime du roster pour décider d'un cœur.

> **Un correctif qui retire une lecture ne retire pas la DONNÉE.** La charge
> porte toujours le roster, et le portera jusqu'à l'étape 3 : sans garde, le
> prochain lot qui a besoin de « qui a aimé » le relit, et la coupe serveur
> redevient impossible sans que rien ne rougisse. La garde a sa fixture
> NÉGATIVE — elle prouve qu'elle reconnaît ce qu'elle refuse, et qu'un
> commentaire qui RACONTE l'ancienne lecture n'en est pas une.

## Preuve

| gate | verdict |
|---|---|
| `check_house_rules.sh` | 42 règles tenues |
| `check_test_registration.sh` | 2 077 fichiers de test, tous inscrits au projet committé |
| `check_cohesion_budget.sh` | aucune régression |
| `node scripts/check-accent-color-hardcoding.mjs` | conforme (168 / 408) |

**Ce que ce conteneur ne peut pas prouver, et qui passe donc par la CI** : aucun
Xcode ici — la compilation et les suites (`CommentHeartLedgerTests`,
`PostDetailCommentsTests`, la garde neuve) sont prouvées par
`workflow_dispatch` d'`ios.yml`, la CI des PR étant gelée (`vars.PR_CI_GEL`).

**Le projet Xcode a été édité à la main, et il faut le dire** : `xcodegen` et
le toolchain Swift sont absents du conteneur, et `check_test_registration.sh`
lit le pbxproj **tel que git le porte**. Les quatre entrées du fichier de test
neuf (build file, file reference, enfant de groupe, phase `Sources`) ont donc
été ajoutées en recopiant exactement la forme de son frère
`CommentHeartLedgerTests.swift`. La CI régénère le projet avant de builder : les
identifiants seront réécrits au prochain `xcodegen generate`, ce qui est du
churn attendu, pas une divergence.

## Ce que ce lot ouvre

- **#20410 étapes 2 et 3** : train de release iOS, mesure d'usage (ou version
  minimale, #9223), puis `userIds` et `hasCurrentUser` quittent
  `CommentReactionAggregation`.
- **#20415 constat 1** (l'oracle `count` > `userIds.length`, qui apprend au
  lecteur qu'on l'a bloqué) : non résolu ici, mais ce lot retire le dernier
  lecteur iOS du roster — donc l'étape 3 pourra l'effacer en supprimant la
  donnée, plutôt qu'en alignant une garde.
