# Iteration-202i — FeedPostCard+Media : localisation des libellés document / pages / lieu

## Contexte

`FeedPostCard+Media.swift`
(`apps/ios/Meeshy/Features/Main/Views/FeedPostCard+Media.swift`) fournit les vues
de pièces jointes des cartes de post du feed :
`documentMediaView(_:)` (l. ~334) et `locationMediaView(_:)` (l. ~387). Ces deux
vues rendent le nom du fichier / du lieu, avec un **fallback** affiché lorsque la
métadonnée est absente.

## Problème (i18n)

Trois libellés visibles par l'utilisateur étaient des **chaînes anglaises codées en
dur**, jamais traduites (l'app est francophone par défaut, entièrement localisée via
`String(localized:defaultValue:bundle:.main)`) :

- l. 352 : `Text(media.fileName ?? "Document")` — fallback nom de document
- l. 367 : `Text("\(pages) pages")` — suffixe « pages » du compteur
- l. 411 : `Text(media.locationName ?? "Location")` — fallback nom de lieu

Un utilisateur francophone voyait donc « Document » / « 3 pages » / « Location » en
anglais, brisant le prisme de cohérence linguistique produit.

## Correctif

Les mêmes médias sont rendus par le **frère direct `PostDetailView.swift`** (vue
détail du post) de façon **déjà localisée**, via trois clés que le code source
référence déjà :

- `feed.post.detail.document` — `PostDetailView.swift:1742`
- `feed.post.detail.pages` — `PostDetailView.swift:1752`
- `feed.post.detail.location` — `PostDetailView.swift:1778`

`FeedPostCard+Media` est mis en **parité exacte** avec ce frère : chaque littéral est
enveloppé dans `String(localized:defaultValue:bundle:.main)` en **réutilisant les
clés déjà présentes en source** — aucune clé neuve, aucune divergence de signature.

```swift
Text(media.fileName ?? String(localized: "feed.post.detail.document", defaultValue: "Document", bundle: .main))
Text("\(pages) \(String(localized: "feed.post.detail.pages", defaultValue: "pages", bundle: .main))")
Text(media.locationName ?? String(localized: "feed.post.detail.location", defaultValue: "Location", bundle: .main))
```

## Portée & sûreté

- **1 fichier**, 3 lignes modifiées (parité 1:1 avec `PostDetailView`), 0 logique /
  0 réseau / 0 layout / 0 changement visuel (defaultValue = ancien littéral) / 0 test
  neuf.
- **0 clé i18n neuve** : les trois clés `feed.post.detail.*` sont déjà référencées
  par `PostDetailView`. La signature `String(localized:defaultValue:bundle:.main)` est
  identique à celle du frère → extraction Xcode cohérente à la compile.
- `String(localized:)` provient de Foundation (déjà importé) → aucun import ajouté.
- Fallback préservé : quand `fileName`/`locationName`/`pageCount` sont présents, le
  rendu est inchangé ; seuls les fallbacks deviennent traduisibles.
- Fichier **absent de toute PR ouverte** (`search_pull_requests FeedPostCard` →
  `total_count: 0`) → 0 collision avec l'essaim `laughing-thompson`.

## Vérification

- Gate = CI `iOS Tests` (compile Xcode 26.1.1 / Swift 6.2, run simu iOS 18.2).
- Parité de signature vérifiée ligne à ligne avec `PostDetailView.swift:1742/1752/1778`.

## Statut

✅ Résolu. Ne plus re-flagger `FeedPostCard+Media` pour ces trois littéraux (soldé
202i). Les glyphes décoratifs (`doc.fill` l. 344, `mappin.circle.fill` l. 403) sont
déjà `.accessibilityHidden(true)` — bloc a11y du fichier complet.

## Pistes 203i+

- Auditer les autres fallbacks `?? "<littéral anglais>"` dans les vues média du feed
  et des reels (vérifier collision essaim via `search_pull_requests` avant chaque
  itération).
- `FriendRequestListView.swift:99` (`?? "Inconnu"`) : mirroir `RequestsTab.swift:119`
  qui localise via `common.unknown` — candidat 203i propre (hors avoid-list).
