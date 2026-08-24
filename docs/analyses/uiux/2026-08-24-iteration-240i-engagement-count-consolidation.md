# Iteration-240i — « 1 réponses » : les compteurs d'engagement du fil qu'aucune clé plate ne pouvait accorder

**Date** : 2026-08-24
**Piste** : iOS (suffixe `i`)
**Surfaces** : `FeedPostCard` (2 sites) · `ReelFeedCard` · `FeedCommentsSheet`
(2 sites) · `PostStatAccessibility` (helper) · catalogue `Localizable.xcstrings`
**Base** : `main` HEAD `924c8618`
**Branche** : `claude/intelligent-noether-64z546`

## Pourquoi cette surface

Suite **(b)** du pointeur 239i : « les compteurs de like/commentaire
interpolent encore l'entier brut sur `FeedCommentsSheet:2354`,
`PostDetailView:1640/1770/2262` ».

En ouvrant les sites, le défaut de chiffres s'est révélé — comme en 239i — **le
moins grave**. Un défaut plus vieux, plus grand, plus visible dormait à côté :
**cinq surfaces SwiftUI du fil réécrivaient à la main un libellé dont la source
unique existait déjà**, par **quatre clés plates** qui ne pouvaient pas accorder.

## Le pire n'est pas dans un lecteur d'écran

`FeedPostCard:1422` rendait la ligne de statistiques d'un commentaire par :

```swift
Text(String(localized: "feed.post.comment.replies_count",
            defaultValue: "\(comment.replies) réponses", bundle: .main))
```

La clé est **plate**. Pour un commentaire à 1 réponse, l'écran affiche
« **1 réponses** » en français, « **1 replies** » en anglais. **Pas à
VoiceOver — à l'écran, en toutes locales, à tout le monde**. Ce n'est pas un
défaut d'accessibilité, c'est une **faute de français visible** en production.

## L'inventaire

La source unique existe : `PostStatAccessibility` (`Views/Cells/`) et ses trois
clés `feed.post.stat.{likes,comments,reposts}`, chacune une
`variations.plural` complète — 2 formes dans les 6 locales latines, **6 en
arabe**. Elle n'était appelée que par deux cellules **UIKit** (`TextPostCell`,
`MediaPostCell`). Les cinq surfaces SwiftUI ont recopié la règle sans jamais la
trouver, par quatre clés plates différentes :

| Site | Rendu (fr, n = 1) avant 240i | Clé plate | Défaut |
|---|---|---|---|
| `FeedPostCard:1422` | « **1 réponses** » — **VISIBLE À L'ÉCRAN** | `feed.post.comment.replies_count` | plate → pas d'accord singulier |
| `FeedPostCard:1088` | « Aimer, **1 j'aime** » | `a11y.feed.post.like.value` | plate ; arabe reçoit 1 forme sur 6 |
| `ReelFeedCard:598` | « Aimer, **1 j'aime** » | `a11y.feed.post.like.value` | idem |
| `FeedCommentsSheet:2381` | « Répondre, **1 réponses** » | `a11y.comment.replies.count` | plate |
| `FeedCommentsSheet:2402` | « **Voir 1 réponses** » | `a11y.comment.show_replies` | plate — mais **phrase**, pas compteur nu |

Ce que le doc-comment de `PostStatAccessibility` disait, écrit en 2025, était
**périmé** :

> Proper multi-language plurals would require a `.xcstrings` plural variant.

Elles existaient — sur ce type même. La phrase faisait lire le helper comme un
pis-aller UIKit, ce qui explique pourquoi cinq écrans SwiftUI l'ont ignoré.

## Le correctif

**Une famille, quatre clés plurielles, un helper.**

`PostStatAccessibility.repliesLabel(_:)` s'ajoute — le **quatrième** nom compté
(likes, comments, reposts, **replies**) — avec sa clé `feed.post.stat.replies`
plurielle (7 locales, 6 formes arabes). Les sites 1 à 4 passent par le helper.

Le site 5, `a11y.comment.show_replies`, reste une clé propre — c'est une
**phrase** (« Voir N réponses »), pas un compteur nu — mais elle est
**convertie sur place** flat → `variations.plural`, dans les 7 locales, avec la
même forme %lld que le catalogue attend d'une clé pluralisée.

Les trois clés plates devenues orphelines sont **supprimées** du catalogue.
`LocalizationConsistencyTests.test_everyAppCatalogIdentifierKeyIsReferencedInCode`
en aurait rejeté toute survivance — la leçon 239i disait exactement ça (« une
clé sans appelant force la clé à sortir du catalogue »).

Le doc-comment de `PostStatAccessibility` est réécrit : il explique désormais
que le helper couvre les compteurs SwiftUI **autant** qu'UIKit, cite les
quatre clés retirées et dit pourquoi elles étaient une régression silencieuse.

## Ce qui NE bouge pas

Les compteurs de type **label + valeur nue** ne sont **pas** rebranchés sur
`PostStatAccessibility.*Label(_:)` :

- `PostDetailView:1642 / 1772 / 2264` — `.accessibilityLabel("J'aime")` +
  `.accessibilityValue("\(count)")`.
- `FeedCommentsSheet:2354` — même forme.

Le rebrancher donnerait « **J'aime, 5 j'aime** » — VoiceOver lirait le nom
compté deux fois. C'est le défaut **chiffres latins en arabe** que 239i a soldé
sur les compteurs de portée, **autre famille de composants** (boutons d'action,
pas ligne d'affichage). Le fix qui leur convient est `count.formatted(locale:)`
— idiome `ReachMetricLabel.spokenCount` — pas une consolidation vers un helper
qui, par contrat, produit « N unité ».

Cette découpe est celle de la leçon 238i : **découper par NIVEAU DE DOUTE, pas
par famille**. Les cinq sites de 240i sont sans ambiguïté (clés plates → clés
plurielles) ; les quatre sites label+value demandent un autre helper et une
autre analyse, qui vivront en 241i.

## La garde

`EngagementCountConsolidationGuardTests` (app, `Unit/Architecture/`), sur les
deux versants habituels de cette famille :

- **Interdiction** — les trois identifiants plats supprimés (les IDs de
  catalogue, `"…"`) ne peuvent réapparaître nulle part dans les six racines
  scannées. Xcode ré-extrait la clé dès que son ID littéral revient en source,
  donc la présence en source SUFFIT à réintroduire la clé au catalogue.
- **Consolidation** — les cinq hôtes SwiftUI + les deux cellules UIKit nomment
  `PostStatAccessibility.`.

Elle **se garde elle-même** (leçon 238i) : ≥ 400 fichiers scannés,
`stripComments` laisse les littéraux et mange les commentaires. Son propre
doc-comment cite les quatre clés retirées avec des **backticks** (` `…` `), pas
des guillemets — donc même sans dépouillement des commentaires, le motif banni
`"…"` ne matcherait pas.

## Vérification

Aucune toolchain Swift sous Linux — **gate réel = CI iOS Tests**, opt-in
` — run test` dans le sujet du commit (leçon 238i).

| Contrôle déterministe | Résultat |
|---|---|
| 3 clés plates bannies dans les 6 racines (hors tests) | **0 occurrence** |
| 5 hôtes SwiftUI + 2 UIKit citent `PostStatAccessibility.` | **7/7** |
| `feed.post.stat.replies` référencée en source | **oui** (`PostStatAccessibility:69`) |
| `a11y.comment.show_replies` toujours référencée | **oui** (`FeedCommentsSheet:2402`) |
| Catalogue JSON valide, `sourceLanguage` et `version` intacts | **oui** |
| Total clés catalogue | 3312 → **3310** (−3 orphelines, +1 neuve) |
| Diff catalogue | +284 / −162 lignes (localisé, pas un reformat global) |
| `pbxproj` | non touché (xcodegen en CI) |
| Nouveaux tests unitaires | **4** dans `PostStatAccessibilityTests` (accord fr/en, singulier/pluriel/zero) + **4** dans `EngagementCountConsolidationGuardTests` |

## Bilan

**5 fichiers prod modifiés** (`PostStatAccessibility`, `FeedPostCard`,
`ReelFeedCard`, `FeedCommentsSheet`, catalogue) + **1 test réécrit**
(`InterpolatedLocalizationSubstitutionTests` déplace son assertion vers
`PostStatAccessibility.repliesLabel`) + **1 suite étendue** (`PostStatAccessibilityTests`,
+4 tests) + **1 garde neuve** (`EngagementCountConsolidationGuardTests`).

**Changement visuel assumé** : `FeedPostCard:1422` affichait « 1 réponses » et
affichera « 1 réponse ». C'est une **régression graphique corrigée**, pas un
choix stylistique. Ailleurs, le rendu VoiceOver change : « Aimer, 1 j'aime »
reste identique, mais l'arabe reçoit maintenant les 6 formes plurielles
correctes.

**0 clé i18n neuve** au sens du cliquet : **+1** (`feed.post.stat.replies`,
fully translated) et **−3** (les orphelines), soit un solde de **−2** clés
dans le catalogue, aucune non traduite.

## Suites (241i+)

1. **`PostDetailView:1642 / 1772 / 2264` + `FeedCommentsSheet:2354`** — les
   quatre sites label+valeur nue. Défaut de chiffres latins en arabe (défaut
   239i sur autre famille), fix par `count.formatted(locale:)` — **PAS** par
   `PostStatAccessibility.*Label(_:)`.
2. `conversation.view.reply.count.{one,many}` — messagerie, deux branches en
   Swift, français juste, **arabe lésé** (6 formes → 2). Autre domaine (pas
   fil).
3. Les carry-over 239i : `MeeshyAppIntents:272` (macOS, écartée 6× — reporter
   ne sert plus à rien), formes `one` de `accessibility.unread_count`,
   effectif « 199+ », `InteractiveProgressBar`, les 3 fenêtres `prefix(1400)`
   de `ConversationDashboardViewAccessibilityTests`.
