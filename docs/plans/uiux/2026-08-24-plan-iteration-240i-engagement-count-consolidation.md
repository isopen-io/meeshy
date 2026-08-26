# Plan — Iteration-240i · Les compteurs d'engagement du fil

**Date** : 2026-08-24 · **Piste** : iOS (`i`) · **Base** : `main` HEAD `924c8618`
**Branche** : `claude/intelligent-noether-64z546`

## Constat

Suite **(b)** du pointeur 239i (« les compteurs de like/commentaire interpolent
encore l'entier brut »). En ouvrant les sites, le défaut de chiffres s'est
révélé — comme en 239i — **le moins grave**.

La source unique de ces libellés **existe déjà** : `PostStatAccessibility`
(`Views/Cells/`) et ses trois clés `feed.post.stat.{likes,comments,reposts}`,
**pluralisées dans les 7 locales, 6 formes arabes**. Elle n'est appelée que par
deux cellules **UIKit** (`TextPostCell`, `MediaPostCell`). Les cinq surfaces
SwiftUI du fil ont réécrit le même libellé **cinq fois** — par quatre clés
plates différentes — sans jamais la trouver.

### Le pire des cinq n'est pas dans un lecteur d'écran

`FeedPostCard:1422` rendait la ligne de statistiques d'un commentaire par :

```swift
Text(String(localized: "feed.post.comment.replies_count",
            defaultValue: "\(comment.replies) réponses", bundle: .main))
```

La clé est **plate**. Pour un commentaire à 1 réponse, l'écran affiche
« **1 réponses** » en français et « **1 replies** » en anglais. Sur l'écran,
lu par tout le monde, en toutes locales. Ce n'est pas un défaut
d'accessibilité, c'est une **faute de français visible**.

### Inventaire (5 sites, 4 clés plates)

| # | Site | Rendu (fr, n = 1) | Défaut |
|---|---|---|---|
| 1 | `FeedPostCard:1422` | « **1 réponses** » — **VISIBLE À L'ÉCRAN** | plat |
| 2 | `FeedPostCard:1088` | « Aimer, 1 j'aime » | plat, arabe reçoit 1 forme sur 6 |
| 3 | `ReelFeedCard:598` | « Aimer, 1 j'aime » | idem |
| 4 | `FeedCommentsSheet:2381` | « Répondre, **1 réponses** » | plat |
| 5 | `FeedCommentsSheet:2402` | « **Voir 1 réponses** » | plat — mais c'est une **phrase**, pas un compteur nu |

## Correctif

1. `PostStatAccessibility.repliesLabel(_:)` + clé `feed.post.stat.replies`
   (plurielle, 7 locales, 6 formes arabes) — le **quatrième** nom compté de la
   famille.
2. Les sites 1–4 passent par `PostStatAccessibility.{likesLabel,repliesLabel}`.
3. Site 5 : `a11y.comment.show_replies` **converti sur place** flat →
   `variations.plural` — c'est une **phrase** (« Voir N réponses »), pas un
   compteur nu, donc elle reste une clé propre plutôt qu'une composition.
4. Suppression des **3 clés plates** devenues orphelines
   (`a11y.feed.post.like.value`, `a11y.comment.replies.count`,
   `feed.post.comment.replies_count`). Le catalogue en interdit toute clé sans
   appelant — `test_everyAppCatalogIdentifierKeyIsReferencedInCode`.
5. Doc-comment de `PostStatAccessibility` réécrit : sa phrase « Proper
   multi-language plurals would require a `.xcstrings` plural variant » est
   **périmée** (les variantes existent), et c'est elle qui faisait lire le
   helper comme un pis-aller réservé aux cellules UIKit.

## Garde

`EngagementCountConsolidationGuardTests` (app, `Unit/Architecture/`), sur les
deux versants habituels :

- **Interdiction** — les 3 identifiants plats supprimés ne peuvent réapparaître
  nulle part (Xcode ré-extrait la clé dès que son ID littéral revient en
  source). Balaie l'app, ses 4 extensions et le SDK.
- **Consolidation** — les 5 hôtes SwiftUI + les 2 cellules UIKit nomment
  `PostStatAccessibility.`.

La garde **se garde elle-même** (leçon 238i) : le balayage voit ≥ 400 fichiers,
`stripComments` laisse les littéraux et mange les commentaires.

## Ce qui reste (suites 241i+)

- **`PostDetailView:1642 / 1772 / 2264`** — trois sites `.accessibilityValue("\(count)")`
  distincts. Ils ont un LABEL SÉPARÉ (« J'aime », « Commentaires ») qui décrit
  l'action et une VALUE qui porte le seul nombre. **Ne PAS les rebrancher sur
  `PostStatAccessibility.*Label(_:)`** : « J'aime » (label) + « 5 j'aime »
  (value) rendrait « J'aime, 5 j'aime ». Ce sont les mêmes chiffres latins-en-
  arabe que 239i a soldés sur les compteurs de portée, autre famille (boutons
  d'action) — fix par `count.formatted(locale:)` ou par un helper voisin de
  `ReachMetricLabel.spokenCount`. **Volontairement hors périmètre 240i, par
  leçon 238i : découper par NIVEAU DE DOUTE, pas par famille.**
- `conversation.view.reply.count.{one,many}` (messagerie) : deux branches en
  Swift, français juste, **arabe lésé** (6 formes → 2). Autre domaine.
- Les carry-over 239i : `MeeshyAppIntents:272` (macOS), formes `one` de
  `accessibility.unread_count`, effectif « 199+ », `InteractiveProgressBar`,
  les 3 fenêtres `prefix(1400)` de `ConversationDashboardViewAccessibilityTests`.

## Étapes

- [x] Inventaire mesuré des 5 sites + des 4 clés concernées
- [x] Catalogue : 3 clés retirées, 1 ajoutée (`feed.post.stat.replies`),
      1 convertie sur place flat→plural (`a11y.comment.show_replies`)
- [x] `PostStatAccessibility.repliesLabel(_:)` + doc-comment rectifié
- [x] 5 sites de production rebranchés
- [x] `PostStatAccessibilityTests` : 4 tests neufs pour `replies` (accord fr/en, singulier/pluriel/zero)
- [x] `InterpolatedLocalizationSubstitutionTests` : le test qui référençait la clé retirée pointe maintenant sur le helper
- [x] Garde `EngagementCountConsolidationGuardTests` (2 versants)
- [x] Contrôles déterministes hors Swift (pas de toolchain sous Linux) — la CI iOS Tests reste le gate réel
- [x] Analyse + pointeur `branch-tracking.md`
- [x] **Verdict CI tête `6c82a63e`** : suite COMPLÈTE, **7762 passés / 1 échec / 5 sautés sur 7768**. L'unique rouge (`FrenchDefaultValueRatchetTests`, 5 clés `forward.publish-*`) était **rouge sur `main` lui-même** — signalé en commentaire PR avec patch, **sans élargir cette PR**.
- [x] **Base réparée par une main tierce** (`622b5004`, catalogue + 8 clés `forward.publish*`)
- [x] **Contrôles rejoués sur l'arbre fusionné** : 2090 fichiers, 0 contrevenant, 5/5 hôtes, 0 puce, catalogue 3318 clés, mes 2 clés plurielles intactes (7 locales, 6 formes arabes)
- [ ] **Verdict CI sur l'arbre fusionné** — la fusion tierce est revenue `Build app (app + cibles de test)` = **compile seule, 0 test**. Re-poussée avec ` — run test` pour obtenir un verdict réel.
