# Cycle 157 — le sens que la garde de forme ne regardait pas, et le compteur qu'il remettait à zéro

*2026-11-14. Branche `claude/exciting-planck-t0oe80`, partie de la branche du
cycle 156 (`claude/exciting-planck-uzlkwz`, PR #18114) puis rapprochée de `dev`
à `fc9ac0a266`.*

**Livré** : #18158 (la garde à sens inverse) et #18157 (la panne vivante qu'elle
a trouvée). **Ouvert** : #18159 (les neuf pièges armés qui restent).

---

## Pourquoi ce lot part de la branche du cycle 156, et pas de `dev`

Le cycle 156 a livré la garde « le miroir EXIGE-t-il plus que le contrat ne
DÉCLARE ? » (#18070) et l'a laissée dans une PR en brouillon, bloquée par
`CI_DEV_SEUL` (#18048). Ce cycle pose la question INVERSE **sur la même
lecture** : refaire l'extraction depuis `dev` aurait produit deux extracteurs
jumeaux, c'est-à-dire exactement la faute que ces deux gardes existent pour
interdire.

L'extraction vit donc dans `socket-payload-shape/mirror-contract.ts`, et les
deux gardes l'importent. Le doc-comment de chaque garde porte SA question ;
celui du module porte la LECTURE.

---

## Lot A — le sens inverse, et ce qu'un outil voit que la relecture n'a pas vu

### Les deux sens, et pourquoi le second est le plus silencieux

| | le miroir EXIGE trop (#18070) | le miroir DÉCLARE trop (#18158) |
|---|---|---|
| mécanisme | champ non-nullable sans défaut absent de la charge | champ déclaré absent du contrat partout |
| à l'exécution | `MissingFieldException` | le champ prend son DÉFAUT |
| effet | la trame ENTIÈRE tombe | la trame arrive **avec un trou dedans** |
| ce qui s'écrit | rien | `null` / `0` / `false`, **par-dessus la donnée juste** |

Le premier sens perd l'événement : invisible, mais au moins rien n'est écrit.
Le second le laisse arriver, et le trou a l'air d'une donnée.

### L'outil a rendu quinze divergences là où la relecture en voyait une

#18124 avait été trouvé par un audit adversarial, et l'issue disait elle-même ce
qui manquait : « personne n'a balayé le dépôt pour “champ déclaré par un miroir
et absent du contrat” ». Le balayage en rend **quinze**, dont **deux pannes
vivantes que personne ne cherchait**.

> C'est la leçon du cycle 155 rejouée à l'identique : **une règle en prose ne
> couvre que ce que son outil exprime.** La différence entre « un cas connu » et
> « quinze » n'est pas une différence de soin — c'est la différence entre une
> relecture et un balayage.

### Le critère, et les deux portes qu'il ferme

Un champ de miroir **socket** absent des propriétés déclarées par
`ServerToClientEvents` pour **tous** les événements qui routent sa classe.

- **« socket »** est la frontière du raisonnement, pas une décoration. Une
  classe de fichier `*SocketEvent*.kt` n'a qu'un producteur : le fil. Une classe
  PARTAGÉE avec le REST — `ApiMessage`, routée par `message:new` et
  `message:edited` — porte légitimement `pinnedAt`, `readCount`,
  `reactionSummary`… que l'API REST remplit. Les confondre noierait la garde
  sous **treize** faux positifs, et un outil qui crie à tort finit désarmé.
- **« pour TOUS les événements »** épargne une classe routée par plusieurs noms
  (`ConversationDeletedSocketEvent` en sert trois) pour un champ qu'un seul
  d'entre eux porte.

### L'inventaire est un cliquet à DEUX SENS, pas un baseline

Douze divergences restent, et aucune ne se corrige sans une décision que ce lot
n'a pas à prendre. Le cycle 156 avait écarté le baseline pour la bonne raison :
« une garde verte sur un défaut vivant arme le piège au lieu de le désamorcer ».

La table y répond par sa SECONDE assertion, pas par sa première. L'invariant
« aucune divergence hors table » est celui qu'on écrit spontanément ; c'est
l'autre qui compte — **« aucune entrée de la table qui ne diverge plus »** force
une divergence réparée à SORTIR de l'inventaire, donc empêche la table de
devenir le cimetière où l'on range ce qu'on ne veut plus voir. Chaque entrée
porte en plus son issue et ce que la mesure a dit de sa gravité.

---

## Lot B — #18157, et pourquoi il est pire qu'un champ mort

La passerelle sert `likeCount` ; trois miroirs lisaient `likesCount`.

| | |
|---|---|
| contrat | `PostLikedEventData` / `PostUnlikedEventData` / `CommentLikedEventData` — `likeCount: number` |
| émetteur | `PostReactionHandler.ts:136` — `likeCount: post.likeCount`, sous un doc-comment qui dit « un payload absolu `{likeCount, reactionSummary}` » |
| miroir | `SocketEvents.kt:639, :646, :694` — `val likesCount: Int = 0` |

**Six consommateurs lisent ce champ**, et leurs propres doc-comments disent ce
qu'ils en croient : « `likesCount` is the gateway's ABSOLUTE count ». Réels
(`ReelsViewModel`), fil (`FeedViewModel`), posts de profil
(`ProfilePostsRealtime`), détail (`PostDetailViewModel`).

**Un post à 42 j'aime recevait `post:liked` en direct et affichait 0.** Idem au
`post:unliked`, idem sur un commentaire. Le compteur ne revenait juste qu'au
prochain rechargement REST.

Et le choix de l'absolu était délibéré : `types/post.ts:444-449` explique qu'il
rend l'événement idempotent sous double livraison et rattrapable après un
manqué, là où un `±1` ne le serait pas. **L'intention du contrat était
entièrement perdue à l'arrivée, et remplacée par son pire cas.**

### Le correctif ne touche aucun consommateur

`@SerialName("likeCount")`. Le nom de propriété Kotlin ne change pas, donc les
six sites restent tels quels, et le miroir devient strictement **plus tolérant**
— il accepte la forme que la passerelle a toujours servie. Aucun émetteur,
aucun contrat, aucune migration, aucune rétrocompatibilité à instruire.

> **Entre deux correctifs justes, celui qui ne demande rien aux consommateurs
> est celui qui peut être prouvé ici.** `:core:model` se compile sur une JVM nue
> et depuis Maven Central ; `feature/chat`, `feature/feed` et `feature/reels`
> demandent l'AGP, donc `dl.google.com`, que le proxy refuse. Un correctif de
> même valeur qui aurait renommé la propriété aurait été invérifiable dans ce
> conteneur — ce n'est pas un détail de confort, c'est ce qui décide si le lot
> se livre prouvé ou pas.

---

## Preuves

| gate | résultat |
|---|---|
| la garde inverse (#18158) | **4/4 verte** — et **vue rougir** sur les trois divergences avant le correctif, nommant classe, champ, événement et les deux fichiers |
| la garde jumelle (#18070) | **5/5 verte** après l'extraction partagée |
| `:core:model` — compile + tests | **BUILD SUCCESSFUL**, suite complète ; 3 témoins de fil neufs |
| les trois témoins de fil | **VUS ROUGIR** sans le `@SerialName` : 0 au lieu de 42 / 41 / 7 |
| `tsc --noEmit` sur `packages/shared` | vert |

Les témoins de fil décodent du **JSON brut** copié clé par clé de
`PostReactionHandler.ts`, à travers le `Json` réel de `SdkModule`. C'est la
moitié que les témoins Android ne tenaient pas : un
`SocketPostLikedData(postId, userId, likesCount = 42)` construit en Kotlin est
vert sans rien prouver du fil — exactement ce qui a laissé vivre #18069, et
exactement ce qui a laissé vivre celui-ci.

### Un empêchement mesuré, et non déduit

`gradle -p scripts/jvm-check` est tombé deux fois sur *« Not enough memory to
run compilation »*, puis une troisième fois en ignorant `-Dkotlin.daemon.jvmargs`
— le compilateur Kotlin lit cette clé comme une propriété **Gradle**, pas comme
une propriété **système**. `-Pkotlin.daemon.jvmargs=-Xmx5g` passe, et tout
compile.

> La leçon du cycle 156 (« un blocage qui dispense de livrer se vérifie comme un
> défaut ») a une suite : **un blocage qui ne dispense de rien se vérifie aussi.**
> Trois échecs d'affilée avec le mot « memory » dans le message ressemblent à une
> machine trop petite. La machine avait 13 Go libres ; c'était un nom d'option.

---

## Ce que ce lot n'affirme pas

La garde hérite de toutes les limites de sa jumelle, et elles sont ÉCRITES
plutôt que supposées : premier niveau seulement (#18116), trois idiomes de
routage sur cinq (#18123), **Android seul** (#18121). Le miroir Swift a la même
classe de défaut dans l'autre sens, et elle y est VIVANTE (#18120).

Elle n'affirme rien non plus sur les treize champs de classes PARTAGÉES qu'elle
écarte : qu'une classe ait un producteur REST rend le champ plausible, pas
vérifié. Les confronter demanderait de résoudre le contrat REST, c'est un autre
lot.

Et « non lu » ne vaut pas « inoffensif ». Les neuf champs de #18159 sont des
pièges ARMÉS : le jour où une branche s'y adosse, elle ne s'exécutera jamais, et
rien ne rougira. C'est mot pour mot l'histoire de #18124.

---

## Suivis ouverts

| # | ce que c'est | état |
|---|---|---|
| #18157 | le compteur de j'aime remis à zéro sur quatre écrans | **fermée** par ce lot |
| #18158 | la garde à sens inverse | **fermée** par ce lot |
| #18159 | les neuf pièges armés restants, dont l'horloge de device d'une suppression | ouverte |
| #18124 | la réaction à une pièce jointe jamais marquée comme mienne — demande de trancher QUELLE identité comparer | ouverte, inventoriée par la garde |
| #18115 | la jumelle morte de `message:attachment-updated`, dont trois champs de l'inventaire | ouverte |

Leçon du cycle : `tasks/lessons/2026-11-14-une-garde-a-sens-unique-ne-voit-pas-le-defaut-qui-ecrit.md`.
