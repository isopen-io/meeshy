# Cycle 158 — le lot du cycle 157 mené à la fusion, et la garde de forme qui traverse enfin vers Swift

*2026-11-14. Branche `claude/exciting-planck-yajbnj`, partie de `dev` à
`aaa84631` (la tête juste après la fusion du cycle 157).*

**Livré** : la fusion de #18160 (cycles 156 + 157) dans `dev`, puis #18240 (le
message de la garde) et #18121 (son extension au miroir Swift).
**Mesuré et inventorié, non corrigé** : #18120, qui demande du Swift compilé.

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

La compilation JVM nue a demandé de reconstruire le harnais du cycle 157 (resté
hors dépôt) : un projet Gradle `kotlin("jvm")` qui pointe ses `srcDirs` sur
`core/model`, applique `gradle/call-frames-catalogue.gradle.kts` et résout depuis
`repo1.maven.org` — `repo.maven.apache.org` a rendu **429** trois fois, et
`-Pkotlin.daemon.jvmargs=-Xmx6g` (propriété **Gradle**, pas système) évite l'ICE
sur les 2 179 sources de test.

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
| #18120 | la portée COMMUNAUTÉ n'atteint jamais iOS | ouverte — inventoriée par la garde, demande Xcode |
| #18123 | les deux idiomes de routage Kotlin non vus (66 événements) | ouverte |
| #18116 | les champs imbriqués, les deux miroirs | ouverte |
| #18159, #18124, #18115 | les pièges armés du cycle 157 | ouvertes |
