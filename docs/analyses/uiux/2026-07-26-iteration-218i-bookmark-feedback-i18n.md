# iOS UI/UX — Iteration 218i

**Date** : 2026-07-26
**Surfaces** :
- `apps/ios/Meeshy/Features/Main/Views/FeedView.swift`
- `apps/ios/Meeshy/Features/Main/Views/RootViewComponents.swift`
- `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift`
- `apps/ios/Meeshy/Localizable.xcstrings`

**Axe** : Localisation (i18n) — chaînes visibles non traduites, dé-duplication (SSOT)
**Base** : `main` HEAD `ffef1339e`

## Comment cette classe a été trouvée

Les classes habituelles de la série sont épuisées sur les cibles faciles. Balayage
d'adoption native exécuté avant de choisir :

| Classe auditée | Résultat |
|---|---|
| `UIImagePickerController` vs `PhotosPicker` | **0** usage legacy, 17 fichiers en `PhotosPicker` — rien à faire |
| `.refreshable` / `.confirmationDialog` | adoptés (9 et 20+ fichiers) |
| Champs de recherche faits main | 15 sites, mais **déjà** `.autocorrectionDisabled()` + `.textInputAutocapitalization(.never)` ; migrer vers `.searchable` serait une refonte visuelle, pas une amélioration — **écarté** (décision produit, cf. 216i) |
| Partage impératif | soldé 215i/216i ; il ne reste que `StoryViewerView+Content` (surface chaude) |

Un balayage i18n a en revanche révélé une classe **non traitée et étendue**.

## Le défaut

**69 chaînes visibles réparties sur 13 fichiers** sont passées à
`String(localized:)` avec **une phrase française comme clé**, et ces clés sont
**absentes de `Localizable.xcstrings`** :

```swift
String(localized: "Retire des favoris", defaultValue: "Retire des favoris")
```

Une clé absente du catalogue n'a aucune traduction : `String(localized:)`
retombe sur son `defaultValue` — le français — **pour tous les utilisateurs**,
quelle que soit leur locale. Le catalogue compte 1 361 clés traduites en
7 locales (`ar`, `de`, `en`, `es`, `fr`, `it`, `pt-BR`) ; ces 69 chaînes n'en
font pas partie.

Cette itération solde le **cluster des retours de mise en favori**, choisi parce
qu'il cumule les deux défauts : non traduit **et** triplé.

| Fichier | Sites |
|---|---|
| `FeedView.swift` | 3 (l. 370, 372, 386) |
| `RootViewComponents.swift` | 3 (l. 283, 289, 290) |
| `PostDetailView.swift` | 3 (l. 244, 247, 248) |

Trois copies indépendantes des mêmes trois phrases — et sur `PostDetailView`
l. 244, le toast d'échec était une **`String` nue**, même pas enveloppée dans
`String(localized:)` : intraduisible par construction.

Défaut accessoire : deux des valeurs françaises étaient **sans accent**
(« Retire des favoris », « Ajoute aux favoris ») — le participe passé attendu
est « Retiré » / « Ajouté ».

## Correctifs (218i)

Trois clés neuves, namespacées sur la convention `post.bookmark.*` déjà en place
dans le catalogue (`a11y.post.bookmark_add` / `a11y.post.bookmark_remove`) :

| Clé | fr | en |
|---|---|---|
| `post.bookmark.added` | Ajouté aux favoris | Added to bookmarks |
| `post.bookmark.removed` | Retiré des favoris | Removed from bookmarks |
| `post.bookmark.error` | Erreur lors de l'enregistrement | Couldn't save |

**Traduites dans les 7 locales**, avec le vocabulaire du catalogue plutôt qu'une
traduction inventée : `a11y.post.bookmark_add` fixe déjà « Lesezeichen » (de),
« favoritos » (es/pt-BR), « preferiti » (it), « المفضلة » (ar). Les toasts en
reprennent la forme au participe passé.

Les 9 sites d'appel passent par ces clés ; le littéral nu de `PostDetailView`
est enveloppé comme ses deux frères.

## Ce que ce correctif ne fait PAS

Passer une clé de « phrase française » à « clé namespacée » **ne localise rien
en soi** — beaucoup de clés namespacées du dépôt (`profile.save.error`, par ex.)
sont elles aussi absentes du catalogue et rendent donc leur `defaultValue`. Ce
qui localise, c'est **l'entrée de catalogue traduite**. C'est pourquoi le test
porte d'abord sur le catalogue, et non sur la forme de la clé.

## Test

`apps/ios/MeeshyTests/Unit/Views/BookmarkFeedbackLocalizationTests.swift` (neuf).
4 tests / 35 assertions, dont l'essentiel **lit `Localizable.xcstrings`** et
échoue si une clé est référencée mais non livrée dans une locale (`value` vide
ou `state != "translated"`). Les assertions de source vérifient que les 3 sites
passent par les clés et ne réintroduisent pas les phrases françaises.

**RED prouvé** : 35/35 échouent contre `main` `ffef1339e`. **GREEN** : 35/35.

## Vérification

- Pas de toolchain Swift (Linux) → assertions rejouées déterministement contre
  les deux révisions ; accolades/parenthèses des 4 fichiers Swift contrôlées au
  tokenizer : **0/0**. Gate réel = CI `iOS Tests`.
- **Catalogue : +138 / −0 lignes, strictement additif** — aucune ré-indentation,
  aucun réordonnancement. Le style dominant du fichier (1364/1365 entrées :
  deux-points collé, pas d'`extractionState` pour les clés présentes en source)
  est reproduit à l'octet, et le JSON est re-parsé après écriture.
- Les 3 entrées sont insérées au contact du groupe `post.*` existant.
- Collision essaim : aucune PR ouverte ne touche ces fichiers.

## Suites (219i+)

Le même défaut reste sur ~60 chaînes. Par ordre de valeur :

1. `RootView.swift` (6) + `iPadRootView+Navigation.swift` (5) — messages
   d'erreur de deep-link **dupliqués verbatim entre les deux fichiers**.
2. `AudioPostComposerView.swift` (15) — plus gros bloc d'un seul tenant.
3. `FeedView.swift` (18 restantes) + `FeedView+Attachments.swift` (6).
4. `PostDetailViewModel.swift` (4), `NewConversationView.swift` (3),
   `ConversationViewModel`, `StatusViewModel`, `FeedViewModel` (1 chacun).

## Bilan

**3 fichiers de production : +3 / −3 lignes** · **catalogue : +138 / −0** ·
3 clés neuves entièrement traduites (7 locales) · 9 sites consolidés sur 3 clés ·
1 littéral nu localisé · 2 fautes d'accent françaises corrigées · 0 couleur,
0 layout, 0 logique, 0 appel réseau.
