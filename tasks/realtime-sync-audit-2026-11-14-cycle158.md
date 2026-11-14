# Cycle 158 — le lot du cycle 157 mené à la fusion, et la garde de forme qui traverse enfin vers Swift

*2026-11-14. Branche `claude/exciting-planck-yajbnj`, partie de `dev` à
`aaa84631` (la tête juste après la fusion du cycle 157).*

**Livré, fusionné dans `dev`** : #18160 (les cycles 156 + 157, qui attendaient),
#18240 (le message de la garde), #18121 (son extension au miroir Swift), #18249
(un contrat qui mentait sur son propre émetteur), #18116 (les objets imbriqués),
#18123 (les cinq idiomes de routage Android), #18269 (le miroir Swift dans les
deux sens), #18159 (sept pièges armés retirés) et #18252 + #18340 (quatre des
six rouges Android de `dev`).
**Mesuré et inventorié, non corrigé** : #18120 (demande du Swift compilé) et les
deux derniers rouges de `dev`, qui demandent une décision de copie de l'épure
#18099 — #18340 les documente.

---

## Lot A — la PR du cycle précédent n'était pas fusionnée, et c'était le premier travail

La routine dit de reprendre là où le cycle précédent s'est arrêté. #18160
attendait depuis 1 h 40, prouvée localement mais sur une base que `dev` avait
dépassée de deux fusions. **Une preuve vieillit avec sa base** : les gates du
cycle 157 avaient tourné contre `2e210c8e`, pas contre `cf1beb368`.

Refaites sur l'arbre FUSIONNÉ, avant de fusionner :

| preuve | résultat |
|---|---|
| les 5 gardes socket | 23/23 |
| `packages/shared`, suite complète | 402 fichiers, 9 639 témoins |
| `tsc --noEmit` | vert |
| `:core:model` compilé sur JVM nue (2 272 sources) | BUILD SUCCESSFUL |
| les témoins de fil, dont `SocketPayloadWireContractTest` | 34/34 |

Et une mesure qui vaut autant que les gates : **aucun fichier n'est commun à la
PR et aux commits que `dev` a reçus depuis la base de fusion.** Un `git merge`
sans conflit dit que les TEXTES ne se contredisent pas ; l'absence de
recouvrement dit que les SUJETS ne se touchent pas. Les deux ensemble valent
mieux que l'un des deux.

Pour cette compilation, j'ai reconstruit à la main un harnais Gradle
`kotlin("jvm")` — **et c'était une erreur : il existe**
(`./apps/android/meeshy.sh jvm-check`, voir plus bas « Ce que ce cycle a appris
sur son propre outillage »). Deux choses apprises en chemin restent vraies quel
que soit le harnais : `repo.maven.apache.org` rend **429** sous ce proxy là où
`repo1.maven.org` répond, et `kotlin.daemon.jvmargs` se passe en propriété
**Gradle** (`-P`), pas système (`-D`), faute de quoi le compilateur tombe sur un
ICE qui ressemble à un manque de mémoire.

---

## Lot B — #18240 : la garde PLANTAIT au lieu de nommer ce qu'elle trouvait

En relisant `socket-payload-shape-gate` avant de l'étendre, `REPO` apparaît deux
fois — et n'est pas importé. Vérifié en injectant un champ requis dans
`TranslationEvent` :

```
AssertionError → ReferenceError: REPO is not defined
```

La garde **bloquait** toujours. Elle n'**informait** plus. Les deux
interpolations fautives vivent dans des `.map()` que le chemin vert n'exécute
jamais : trois jours de suites vertes n'en disaient rien.

> **Le message d'une garde ne s'évalue que sur ROUGE.** « Vue rougir » ne
> suffit donc pas comme preuve — un `ReferenceError` est un rouge. Il faut avoir
> LU le message.

La composition sort du fichier de test
(`socket-payload-shape/required-field-report.ts`), devient une fonction pure, et
un témoin l'exerce sur des fixtures — **sur le chemin vert**. Le symptôme de la
plateforme devient un paramètre, ce qui a payé immédiatement au lot C.

Leçon : `tasks/lessons/2026-11-14-le-message-d-une-garde-ne-s-evalue-que-sur-rouge.md`.

---

## Lot C — #18121 : la garde de forme balaie aussi le miroir Swift

### Deux questions, parce que la première ne peut pas poser la seconde

1. **Le miroir EXIGE-t-il plus que le contrat ne DÉCLARE ?** La règle Swift est
   le pendant exact de la règle Kotlin : une propriété stockée, non-optionnelle,
   sans défaut, dans un type à `init(from:)` **synthétisé**, est exigée au
   décodage ⇒ `keyNotFound` ⇒ trame perdue, erreur avalée.
   **Résultat : zéro divergence sur 154 événements.** Le SDK Swift penche
   nettement du côté permissif, et le dire est un résultat.

2. **Un aiguillage `.raw` couvre-t-il toutes les PORTÉES de sa charge ?** Cette
   question-là n'existait pas côté Kotlin, et sans elle #18120 reste invisible :
   `user:preferences-updated` est une UNION à trois portées, dont les clés
   COMMUNES restent justes quoi qu'il arrive. **Une confrontation champ par
   champ ne peut pas voir un aiguillage qui n'implémente que la moitié de son
   discriminant.** Le contrat, lui, sait combien de portées il déclare —
   `ContractPayload.variantCount`, lu une seule fois et mémoïsé.

### Couverture : 154 des 176 événements, contre 110 côté Kotlin

Non par mérite, mais par forme du dépôt : **iOS n'a que DEUX idiomes de
routage** (`route(.event, T.self)` et `.raw`), là où Android en a cinq dont la
garde n'en voit que trois (#18123). Les onze `socket.on(…)` du SDK portent tous
`clientEvent:` — ce sont les événements de Socket.IO lui-même, pas des charges.

### Deux finesses mesurées plutôt que supposées

- **`APIMessage` — le type de `message:new`, la charge la plus chargée du
  contrat — est déclaré `struct APIMessage: Sendable`** : c'est une EXTENSION qui
  porte sa conformité `Decodable` et son `init(from:)` manuel. Filtrer les types
  sur la conformité vue à la déclaration aurait écarté exactement celui-là, et le
  traiter comme synthétisé lui aurait appliqué une règle qui ne le gouverne pas.
- **Trois routes `.raw` délèguent leur décodage à un gestionnaire nommé**
  (`handleConversationLifecyclePayload`). Le relais est suivi sur **un** cran,
  jamais deux : au-delà il faudrait un graphe d'appels, et une garde qui
  approxime un graphe d'appels se trompe en silence.

### Vue rougir, dans les trois sens

| mutation | ce que la garde dit |
|---|---|
| #18120 retiré de l'inventaire | `user:preferences-updated — … décode 2 type(s) … pour une charge à 3 portées` |
| champ requis injecté dans `ConversationRestoredSocketEvent` | `« probeAbsentDuContrat » est REQUIS par … mais ABSENT au contrat … keyNotFound` |
| troisième branche ajoutée à l'aiguillage | `réparé(s) — à retirer de l'inventaire : user:preferences-updated` |

Le troisième est le **second sens du cliquet**, celui qui empêche l'inventaire
de devenir le cimetière où l'on range ce qu'on ne veut plus voir (cycle 157).

### Ce que la garde ne couvre pas, et qu'elle ÉNUMÈRE

Rendu par des `expect`, pas raconté dans un doc-comment qui vieillit : **4
routes `.raw` sans type nommé** (`auth:session-revoked`, `auth:token-expired`,
`heartbeat:ack`, `talkie:chunk`), **26 types à `init(from:)` manuel** — et un
init manuel n'est pas une preuve de tolérance, c'est par un `decode(…, forKey:)`
manuel que passent les deux pièges armés de #18120 —, et les champs imbriqués
(#18116). Les contrats opaques ne sont pas un quatrième trou : mesuré, **aucun**
des 176 événements n'a de charge `unknown` à la racine.

---

## Lot D — #18116 : la garde descend d'un cran, et le contrat ment moins

Le premier niveau tenu, la question suivante était écrite depuis le cycle 156 :
**un champ qui porte un OBJET tue la trame exactement comme un champ de premier
niveau** — `SocketCommentAddedData.comment`, `ApiNotification.actor` sont des
documents entiers derrière une seule clé.

Mesure : **40 objets imbriqués confrontés côté Kotlin, 37 côté Swift**, et deux
résultats de nature opposée.

### Côté Kotlin : UNE divergence, et c'est le CONTRAT qui avait tort

`ApiNotification.actor.id` — requis par le miroir, **optionnel au contrat**.
`NotificationEventData.actor` redéclarait une jumelle anonyme à quatre clés
toutes optionnelles, quand `NotificationActor` vit dans le même paquet, deux
fichiers plus loin, et exige `id` et `username`. C'est le type que l'émetteur
manipule de bout en bout (`createNotification` → `sanitizeNotificationInputs` →
`formatNotification`).

**La preuve que le contrat mentait est un `tsc` VERT** : remplacer la jumelle par
le type partagé laisse `packages/shared` ET `services/gateway` sans une erreur —
aucun site n'émettait la forme lâche que le contrat autorisait.

> **Une jumelle plus LÂCHE d'un type partagé ne se contente pas de dupliquer :
> elle rend indécidable tout verdict qui s'adosse au contrat.** « Le miroir exige
> trop » et « le contrat ment sur ce qu'il émet » ont la même signature — et la
> réparation tirée de la première est l'inverse de la bonne. C'est #18249.

Une fois le contrat réparé, le balayage imbriqué Kotlin rend **zéro**.

### Côté Swift : trois divergences, une seule cause, et c'est un piège ARMÉ

`APIPostComment.author` sur `comment:added`, `comment:updated` et
`comment:media-updated` — **l'un des deux pièges que #18120 nommait**, trouvé ici
mécaniquement plutôt qu'à la relecture. Les émetteurs incluent tous `author`
(relation Prisma `author: { select: postAuthorSelect }`), donc rien ne tombe
aujourd'hui.

Il est **inventorié avec son cliquet à deux sens**, et la raison de ne pas le
réparer est une mesure, pas un arbitrage : le miroir ne peut pas être relâché
sans chaîne Swift, et le contrat ne peut pas être resserré **avec preuve** — son
émetteur passe la charge en
`hoistCommentTrackingLinks(commentCite) as unknown as typeof comment`, un cast
qui retire au compilateur toute capacité de vérifier le resserrement. C'est
exactement l'INVERSE de #18249, où le `tsc` vert était la preuve.

### Deux `struct Update` à quatre-vingt-dix lignes l'un de l'autre

La résolution des types imbriqués par **nom simple** rendait le dernier
rencontré : `MessageSocketEvents+Conversations.swift` déclare deux `Update`
imbriqués dans deux événements différents, et la garde confrontait donc un type à
un contrat qui n'est pas le sien — **deux divergences qui n'existent pas**,
nommant des champs introuvables. Les noms imbriqués sont désormais QUALIFIÉS
(`Outer.Inner`), et résolus d'abord relativement au type qui les cite.

> Le faux positif n'a pas été évité par prudence : il a été PRODUIT, lu, et c'est
> son absurdité (`Update.categoryId`, qui n'existe nulle part) qui a nommé la
> cause. Un outil qu'on n'a jamais vu se tromper n'a pas été mis à l'épreuve.

Vu rougir : le contrat remis dans sa forme lâche (Kotlin), et l'inventaire
imbriqué vidé (Swift, les trois `comment.author`).

---

## Lot F — #18123 : les CINQ idiomes de routage, et la famille `call:*` enfin confrontée

La garde Kotlin n'en lisait que trois, et le trou avait une FORME plutôt qu'une
taille : toute la famille `call:*` sociale route par un **parseur écrit à la
main**, sans aucune classe `@Serializable` à confronter, et les quatre
`viewing:*` par un `decode<T>` **réifié** derrière `socketManager.on(…)`.

> La QUESTION ne change pas d'un idiome à l'autre — « le miroir exige-t-il une
> clé que le contrat ne garantit pas ? » — **seule la PREUVE change.** Un parseur
> manuel dit son exigence par `o.str("x") ?: return@decode null` : sans la clé, il
> rend `null`, la route écarte la trame, et rien ne rougit. Même panne que
> `MissingFieldException`, autre mécanisme, même silence.

Et le rapport le DIT, au lieu de recopier le symptôme de kotlinx : un lecteur qui
chercherait un `MissingFieldException` dans un fichier qui n'en produit aucun
conclurait que la garde se trompe. Le `MirrorIdentity` du cycle (lot B) a servi
une troisième fois sans une ligne de duplication.

**Couverture : 110 → 125 des 176 événements.** Zéro divergence sur les seize
événements neufs : les douze parseurs d'appel et les quatre `viewing:*` sont
conformes — et le dire est un résultat, pas un vide.

### Deux pièges, mesurés plutôt que prévenus

- **Un index global des corps de fonction par NOM rendait le dernier homonyme.**
  `recordingStarted`, `recordingStopped` et `previewSignal` existent ailleurs dans
  le dépôt : trois routes revenaient « sans aucune exigence », donc silencieusement
  non gardées, et la garde restait verte. Le corps se cherche désormais dans le
  fichier qui DÉCLARE l'objet nommé par la route. **C'est la faute des deux
  `struct Update` Swift, dans l'autre langage, à une heure d'intervalle.**
- **`previewSignal` ne lit aucune clé : il DÉLÈGUE** à `CallSignalMapper`. Il est
  ÉNUMÉRÉ comme non confronté et exclu du compte de couverture — *un zéro qu'on
  ne distingue pas d'une absence est le mode de panne silencieux d'une garde qui
  déduit sa table.*

Vu rougir : une clé requise injectée dans
`CallSocialEventParser.mutedByModerator` (le rapport nomme le fichier du PARSEUR
et son vrai symptôme) et dans `ViewingChange` (les trois `viewing:*` d'un coup).

---

## Lot G — #18269 : le miroir Swift gardé dans les DEUX sens

La quatrième case d'un tableau à deux entrées. Kotlin avait ses deux gardes
(#18070 et #18158) ; Swift n'en avait qu'une (#18121).

|  | le miroir **EXIGE** trop | le miroir **DÉCLARE** trop |
|---|---|---|
| Kotlin | #18070 | #18158 |
| Swift | #18121 | **ce lot** |

**Mesure sur 101 types de FIL : UN seul champ** déclaré et absent du contrat —
`FriendRequestRejectedEvent.senderId`, délibéré et documenté sur place (*« il ne
sert qu'à router l'émission côté gateway : déclaré optionnel par tolérance,
jamais lu »*), et son consommateur ne lit que `rejecterId`.

Le miroir Swift est donc **propre dans les deux sens aujourd'hui**. L'enjeu
n'était pas une moisson : c'est que la prochaine dérive rougisse chez celui qui
l'écrit, comme elle le fait côté Kotlin depuis le cycle 157.

Deux frontières, chacune mesurée plutôt que posée par prudence : le **FICHIER**
décide (hors de `Sockets/`, un type a un producteur REST), et les types à
`init(from:)` **manuel** sont écartés — les compter rendait 18 constats dont
**17** de cette forme, et un outil qui crie à tort finit désarmé.

---

## Ce que ce cycle a appris sur son propre outillage

J'ai reconstruit à la main un harnais Gradle « Kotlin pur » pour compiler
`:core:model` sans AGP. **Il existait**, committé et documenté :
`./apps/android/meeshy.sh jvm-check` — et il fait davantage (`:core:crypto`,
`:core:e2ee`, exclusion des fichiers liés à Android). Vérifié depuis :
`BUILD SUCCESSFUL in 3m 45s` sur l'arbre de ce cycle.

Le `CLAUDE.md` RACINE ne le mentionne pas ; celui d'`apps/android` le porte en
tête de son bandeau. Et le journal du cycle précédent citait
`gradle -p scripts/jvm-check` — un chemin RELATIF à un répertoire qu'il ne
nommait pas, que j'ai lu comme « un brouillon disparu avec sa session ».

Leçon : `tasks/lessons/2026-11-14-le-claude-md-du-repertoire-dit-l-outil-que-la-racine-ignore.md`.

---

## Lot H — #18159 : sept pièges armés retirés, et deux témoins qui attestaient une forme inexistante

Sept champs déclarés par un miroir Kotlin et portés par **aucun** événement du
contrat. Ils valaient toujours `null` ou `0` ; le jour où une branche s'y
adosse, elle ne s'exécute jamais, et rien ne rougit — c'est mot pour mot
l'histoire de #18124.

Retirés : `ConversationDeletedSocketEvent.deletedAt`,
`ConversationClosedSocketEvent.reason`, `SocketPostDeletedData.deletedAt`,
`SocketStoryViewedData.viewedAt`, `UnreadUpdateEvent.totalUnread`,
`ReactionUpdateEvent.count`, `FriendRequestRejectedEvent.senderId`. Leurs
entrées **sortent** de l'inventaire de la garde — c'est son second sens qui
l'exige.

### Ce que le compilateur a trouvé et que le balayage ne pouvait pas voir

Un `grep` sur « qui LIT ce champ ? » rend zéro. `./apps/android/meeshy.sh
jvm-check` a rendu **trois sites** de plus, tous dans des TÉMOINS — et deux
d'entre eux attestaient une forme que **personne n'émet** :

| témoin | ce qu'il affirmait | ce que la passerelle sert |
|---|---|---|
| `une fermeture porte sa raison quand la passerelle la sert` | un `reason` sur `conversation:closed` | `{ conversationId, closedBy, closedAt }` — `announceConversationClosed.ts` |
| `SocketPayloadWireContractTest` | un `count` sur `reaction:added` | `{ …, aggregation, timestamp }` — `ReactionService.createUpdateEvent` |

Le second est le plus parlant : c'est le fichier dont le doc-comment EXIGE une
charge « copiée clé par clé de l'émetteur », et dont le lot du cycle 157 disait
qu'il tenait « la moitié que les témoins Android ne tenaient pas ».

> **Un témoin de contrat de fil qui INVENTE sa charge atteste une forme que
> personne ne sert.** La règle était écrite en tête du fichier ; la charge, dix
> lignes plus bas, ne la suivait pas. Une charge de témoin se copie depuis
> l'émetteur, elle ne se compose pas de mémoire.

Les deux sont réécrits sur ce que le fil porte vraiment, et gardent ce qui
comptait : la tolérance aux clés en trop.

### Ce qui reste de #18159

`MessageDeletedEvent.deletedAt` est **lu** (`MessageRealtimeApplier`, avec
`?: now`), donc le retirer demande de toucher `sdk-core`, qu'aucun outil local
ne compile — et la branche défendable est l'autre : une suppression a une heure
SERVEUR, que le contrat ne sert à personne (iOS et le web ont le même trou).
C'est un lot d'émetteur + contrat + trois miroirs, pas un retrait.

---

## Lot I — vérifier la CI APRÈS chaque fusion, et ce que ça a rendu

Ce cycle a fusionné cinq PR dans `dev`. Après chacune, le run `android.yml`
correspondant a été ouvert et lu — c'est ce qui a rendu la moitié du travail
ci-dessus, et aucune de ces causes n'aurait pu être vue autrement :
`android.yml` ne tourne **ni sur PR ni en `workflow_dispatch`** sous
`CI_DEV_SEUL` (#18048), donc un lot Android n'est prouvable qu'une fois FUSIONNÉ.

| rouge | cause | état |
|---|---|---|
| `:feature:chat:compileDebugKotlin` | `stringResource` dans la lambda NON-inline de `joinToString` | **corrigé, vert en CI** |
| cliquet de verbosité | « %lld en ligne » compté comme explication parce que sa clé contenait le nom de son ÉCRAN | **corrigé, vert en CI** |
| `KitGlassRatchetTest` | 65 appels de verre dessiné pour un plafond de 64 | **corrigé, vert en CI** |
| `:app:compileDebugUnitTestKotlin` | lambda finale liée au paramètre `info` ajouté APRÈS `onTap` | **corrigé**, fusionné |
| `EpureComposantsPartagesStringsTest` | un texte retiré côté Android survit dans la SOURCE iOS | ouvert — #18340 |
| `StickerSheetPagesRobolectricTest` | l'épure a raccourci Android seul, le témoin garde la parité iOS | ouvert — #18340 |

> **Une lambda finale se lie au DERNIER paramètre.** Ajouter un paramètre après
> un `(() -> Unit)?` déplace donc silencieusement tous les appels à lambda
> finale. Ici le compilateur l'a attrapé parce que les types diffèrent ; si le
> paramètre ajouté avait été une lambda lui aussi, **rien n'aurait rougi** et
> l'action du toast serait devenue sa note.

Les deux derniers ne sont **pas** corrigés, et la raison est une frontière, pas
une difficulté : ils demandent de choisir une copie produit — dans sept langues
pour le premier — qui appartient à l'épure. Aligner le témoin sur le texte livré
serait pire que de le laisser rouge : il garde explicitement la parité iOS, et
le faire taire supprimerait le seul signal de la divergence.

---

## Lot J — la question que les trois gardes de NOMS ne posent pas (#18342)

Les gardes de noms vérifient qu'aucun client n'écoute **hors** contrat.
Personne ne vérifie l'inverse : qu'un événement du contrat ait au moins un
lecteur. En confrontant les 176 événements aux routes des trois clients (126
Android après #18123, 160 Swift, 129 noms cités côté web), **six** n'ont aucun
lecteur — et **trois d'entre eux sont ÉMIS** :

| événement | émis ? | déclaré par un client ? |
|---|---|---|
| `location:blood-proximity` | oui — deux `emit` par alerte | non |
| `link:message:new` | oui | non |
| `agent:admin-event` | oui | non |
| `call:transcription-result`, `call:translation-enabled`, `call:translation-requested` | non | non |

Et la mesure contredit une affirmation du dépôt : `services/gateway/CLAUDE.md`
écrit que l'enveloppe de `link:message:new` a « son unique auditeur (le web) ».
Le web ne cite ni ce nom, ni sa constante, ni rien d'approchant.

> **Un commentaire qui nomme un CONSOMMATEUR est une affirmation**, au même titre
> qu'un tri (cycle 86 bis), un compte (cycle 93) ou une contrainte de schéma
> (cycle 94). Celui-ci a survécu à la disparition de ce qu'il décrit — et tout
> le raisonnement du cycle 114 sur ce qu'une émission d'enveloppe « livre »
> s'appuie dessus.

Rien n'est retiré : trois de ces noms sont probablement des features à venir, et
`location:blood-proximity` sert une directive récente dont le client n'est
peut-être pas écrit. Chacun demande un verdict, pas un retrait automatique —
c'est #18342.

---

## Pourquoi #18120 n'est pas corrigé par ce cycle

Le correctif demande un type Swift de portée communauté (il n'en existe aucun),
son publisher et son consommateur. Ce conteneur n'a **pas de chaîne Swift**
(`swift: command not found`), et `ios.yml` ne tourne pas sur une PR sous
`CI_DEV_SEUL`. Livrer du Swift non compilé dans `dev` pendant un gel dont le
critère est « `dev` vert » est exactement ce que le cycle 155 a refusé de faire
pour Android. Le défaut est donc **mesuré, daté, inventorié par une garde qui
rougira le jour où on l'en sortira** — et il attend une session avec Xcode.

---

## Suivis ouverts

| # | ce que c'est | état |
|---|---|---|
| #18070, #18069, #18157, #18158 | les lots des cycles 156 et 157 | **fermés** par la fusion de #18160 |
| #18240 | la garde plantait au lieu de nommer | **fermée** par ce lot |
| #18121 | la garde balaie le miroir Swift | **fermée** par ce lot |
| #18249 | le contrat de `notification:new` redéclarait une jumelle plus lâche | **fermée** par ce lot |
| #18116 | les champs imbriqués, les deux miroirs | **fermée** par ce lot (UN cran ; au-delà il faudrait suivre alias et unions) |
| #18120 | la portée COMMUNAUTÉ n'atteint jamais iOS | ouverte — inventoriée par la garde, demande Xcode |
| #18123 | les deux idiomes de routage Kotlin non vus | **fermée** par ce lot (110 → 125 des 176) |
| #18269 | le miroir Swift gardé dans un seul sens | **fermée** par ce lot |
| #18252 | les deux rouges Android de `dev` | **fermée** par ce lot |
| #18159 | les neuf pièges armés | **sept retirés** ; reste `MessageDeletedEvent.deletedAt`, qui demande un lot d'émetteur |
| #18124, #18115 | les pièges armés du cycle 157 | ouvertes |
