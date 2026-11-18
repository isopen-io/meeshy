# Cycle 178 — la loi manquante n'était pas le symptôme : Android n'a rien à restituer

*2026-11-18. Branche `claude/exciting-planck-7zb3i0`, partie de la tête de `dev`
(`3c3484729`), `origin/dev` (`09fc63152`) fusionnée dedans avant la PR. Livre
**#19662**, le suivi que le cycle 177 avait laissé sur le miroir Kotlin.*

---

## Le point de départ

Le cycle 177 s'était clos sur ce suivi :

> **Le miroir Kotlin n'a pas de `remainingUnread`**, que Swift porte depuis
> #7350 (I-2). Écart de parité hérité du gel Android, hors périmètre de ce lot
> — à ouvrir en issue.

L'issue #19662 l'a posé, et elle a fait mieux que décrire l'écart : elle a
inscrit, dans ses « ce qui reste à instruire », la question qui décide du lot.

> **Qui APPELLERAIT `remainingUnread` sur Android ?** Si aucun écran ne consomme
> ce que la fonction rend, le lot est une entrée PRÉMATURÉE — à dire comme
> telle, pas à livrer en silence.

C'est cette question qui a payé. La réponse n'est pas « personne ».

## Mesure 1 — le consommateur existe EN ENTIER, et il est mort

| maillon | site |
|---|---|
| noter le reste | `UnreadLedger.noteUnreadRemaining` (`sdk-core/.../sync/UnreadLedger.kt:69`) |
| le retenir | `OpenConversations.toRestoreOnClose` (`core/model/.../sync/UnreadRules.kt:45`) |
| le rendre à la DERNIÈRE fermeture | `OpenConversations.close` → `UnreadLedger.close:57` |
| le persister + journaliser | `ConversationReadLedgerStore.close:42` → `persist:52` |
| ouvrir / fermer la fenêtre | `UnreadLedgerBinding.followOpenConversation:105` |

Les cinq maillons sont là, testés, et le dernier est bien branché sur le temps
réel. Et `git grep noteUnreadRemaining -- 'apps/android/**/*.kt'` ne rend, hors
tests, que la déclaration et son relais : **aucun site de production ne la
nourrit.** Un contrôle sans effet, au sens de la loi 4.

L'hypothèse de l'issue était donc fausse dans les deux sens : le consommateur
n'était pas absent, il était *inerte* — et c'est plus instructif, parce qu'un
maillon absent se voit en lisant la liste, tandis qu'un maillon inerte la
complète.

## Mesure 2 — pourquoi il est mort, et ce n'est pas un oubli de câblage

C'est la mesure qui a changé le lot. `ChatViewModel.markConversationReadOnOpening`
part dès l'`init`, dès que la fenêtre a répondu (3 s au plus,
`ReadAcknowledgement.WINDOW_WAIT_MILLIS`), et compose son accusé par
`ReadReceiptLanguages.declare`, qui pose :

```kotlin
caughtUpToMessageId = named.lastOrNull()?.id   // ReadReceiptLanguages.kt:54
```

— le message **le plus récent de la fenêtre, sans condition**. Or
`caughtUpToMessageId` est précisément le champ qui dit au serveur d'avancer son
curseur *quels que soient les messages sautés*. Ouvrir une conversation à 99
non-lus et ne lire que les cinq derniers met donc le compte SERVEUR à zéro.

La seule garde de ce chemin, `ReadAcknowledgement.mayAcknowledge`, ne parle pas
d'affichage : elle retient l'accusé quand un non-lu est un cryptogramme que
l'appareil ne sait pas ouvrir (#13793). **Rien, sur Android, n'exige qu'un
message ait été VU pour être accusé lu.**

iOS tient l'inverse, et son doc-comment l'écrit :

> Rapporter dix messages sur deux cents ne veut pas dire que la conversation est
> lue — le badge ne tombe donc PAS sur un lot quelconque. Il tombe quand le lot
> contient le message le PLUS RÉCENT.

`ConversationViewModel.markAsRead(messageIds:visibleIds:)` ne pose `caughtUpId`
que par `ConversationCatchUpLaw`, et confie le reste à `notePartialRead`.

> **Android n'a rien à restituer parce qu'il a déjà tout déclaré.** La loi
> manquante n'était pas la cause de la chaîne morte : elle en était le dernier
> symptôme visible. La cause est deux couches plus haut, dans un champ posé
> sans condition par un helper de langues.

## Ce que cette mesure a décidé du DÉCOUPAGE

La tentation était de livrer la loi ET son câblage — le lot aurait eu l'air
complet. Mesuré, le câblage seul produirait un badge que le serveur contredit
dans la seconde :

```
99  (compte servi à l'ouverture)
 0  (accusé d'ouverture : caughtUpToMessageId inconditionnel)
94  (restitution locale à la fermeture, par la loi qu'on vient de brancher)
 0  (prochain conversation:unread-updated)
```

Un clignotement se lit comme une panne, pas comme une correction — et il serait
*apparu avec* le correctif. L'ordre est donc : la déclaration d'abord (**#19703**,
ouverte avec les trois mesures), le registre ensuite.

> C'est la question du cycle 122 — « qui AFFICHE ce que ce résolveur élit ? » —
> posée un cran plus loin : **« ce que mon correctif affiche, qui le
> CONTREDIT ? »** Un correctif juste dont la valeur est écrasée en aval n'a pas
> corrigé personne, et il coûte en plus la confiance dans le chemin qu'il vient
> d'emprunter.

Le fichier à toucher pour #19703 — `ReadReceiptComposition.kt` — est de plus
écrit par la PR **#19665**, poussée avant ce lot : la règle d'asymétrie (« celui
qui n'a rien écrit cède ») tranchait dans le même sens, sans négociation.

## Ce que le lot livre

- `FirstUnreadBoundary.remainingUnread` (Kotlin), miroir exact du modèle Swift,
  ses trois cas nommés compris (`windowIsAtTip`, fenêtre ouverte SUR le
  séparateur, `caughtUpMessageId`), appelant le `orderedCandidates` déjà là —
  **une seule graphie de la descente du curseur par langage**, le cliquet de
  #19599 tient.
- Les **dix cas** du modèle rejoués un pour un en JUnit. Un miroir se prouve sur
  les mêmes données que son modèle, sans quoi « miroir » n'est qu'une intention.
- Les **deux doc-comments se citent mutuellement** (leçon 261) et disent, à
  l'endroit où le prochain lecteur la trouvera, que la fonction est inerte **et
  pourquoi**. Une fonction documentée comme vivante alors qu'elle ne l'est pas
  est pire que son absence : elle fait croire la chaîne câblée.

Preuve, sur l'arbre FUSIONNÉ : `gradle -p apps/android/scripts/jvm-check test
-PjvmCheckModelOnly` → 2 262 classes, 19 030 tests, 0 échec, dont les 10 du lot.
Rouge prouvé avant le vert (`c0e17d40c` : *Unresolved reference
'remainingUnread'*).

## Le défaut d'OUTIL rencontré, et où la mesure a été rangée cette fois

La boucle TDD locale de `:core:model` tombait en
`java.lang.OutOfMemoryError: Java heap space` au `compileKotlin` — sur une
machine à 14 Go libres. Le conseil imprimé par Gradle désigne `gradle.properties`,
et `kotlin.daemon.jvmargs` **n'est pas lu comme une propriété système** : `-D…`
est ignoré en silence, seul `-P…` passe.

Les cycles **157** et **158** avaient déjà payé exactement ce diagnostic, et
l'avaient écrit — dans leur journal. Le cycle 178 l'a repayé, parce qu'un
journal daté ne se lit que par celui qui sait déjà quoi y chercher.

> **Une mesure d'outillage se range à CÔTÉ de l'outil, jamais dans le récit de
> la session qui l'a payée.** `apps/android/scripts/jvm-check/gradle.properties`
> porte désormais le tas, avec la raison : plus personne n'a à retrouver le
> drapeau. C'est la dimension 12 appliquée à nous-mêmes — la complexité se paie
> dans le code, pas chez l'utilisateur, et une session EST un utilisateur de
> ses outils.

## Suivis

- **#19703** — l'accusé d'ouverture d'Android : `caughtUpToMessageId`
  inconditionnel, pas de miroir Kotlin de `ConversationCatchUpLaw`, et la loi
  livrée ici à brancher ensuite. Il porte les six critères de fin et la cession
  de `ReadReceiptComposition.kt` à #19665.
- **Le miroir TS n'a pas non plus `remainingUnread`**, et l'issue #19662 ne le
  disait pas — elle énumérait le seul écart Kotlin. Le web n'a, mesuré, aucun
  registre de restitution équivalent (`apps/web/src/lib/view/unread-boundary.ts`
  ne porte que la frontière) : l'écart y est donc d'une autre nature — une
  feature absente, pas un miroir incomplet. À instruire avant d'ouvrir une
  issue, pour ne pas poser une parité que le web ne consomme pas.
- **`unreadCountHint` reste un `Int` non borné en haut** dans les trois miroirs
  (suivi du cycle 177, inchangé).
- Les suivis du cycle 176 restent ouverts : **#19603** (l'arbitrage produit de
  la rétractation), **#19604** (le point de convergence des réactions, PR
  #19686 ouverte), **#19612** et **#19613**.
- **#19654** (les 44 entrées du manifeste i18n Android) est VERT à la tête de
  `dev` : `xcstrings_to_android.py --check` rend `EXIT=0` sur `3c3484729`, le
  commit `1f0acea17` l'ayant soldé en passant. L'issue reste ouverte sur son
  second critère — le relevé complet à 0 entrée, et le `--check` qui RELÈVE tout
  avant de conclure plutôt que de s'arrêter au premier manquement.
