# Iteration-206i — MessageReactionsDetailView: VoiceOver label + count value on reaction filter capsules

## Contexte

`MessageReactionsDetailView`
(`apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageReactionsDetailView.swift`)
présente le détail des réactions d'un message : une barre horizontale de
**pilules de filtre** (`reactionFilterCapsule`, l. 79) — une pilule « Toutes »
suivie d'une pilule par emoji réagi — puis la liste des utilisateurs du filtre
actif. Chaque pilule affiche un `HStack` de deux `Text` :

- `label` — soit « Toutes » (l. 26), soit l'emoji brut (l. 34)
- `count` — le nombre de réactions, rendu comme un `Text("\(count)")` nu (l. 87)

## Problème (a11y — HIG « VoiceOver clarté »)

Un `Button` SwiftUI combine automatiquement ses enfants en un seul élément
d'accessibilité dont le libellé concatène les deux `Text`. VoiceOver annonçait
donc chaque pilule comme **« Toutes 5 »** ou **« 😀 3 »** — le nombre nu `5`/`3`
est lu sans aucun contexte sémantique (« cinq » ? cinq quoi ?). L'utilisateur
non-voyant ne perçoit pas que ce chiffre est un **compteur de réactions**.

L'état sélectionné était déjà correctement exposé via
`.accessibilityAddTraits(isSelected ? [.isSelected] : [])` (l. 104, doctrine
149i→195i). Restait le **compteur sans libellé**, exactement le même défaut que
celui soldé sur le frère `MessageViewsDetailView` en 195i (PR #2194,
« selected-state + count for filter capsules »).

## Correctif

Collapse de la pilule en un unique élément d'accessibilité avec libellé + valeur
explicites, en amont du trait `.isSelected` déjà présent :

```swift
.accessibilityElement(children: .ignore)
.accessibilityLabel(label)
.accessibilityValue(String(localized: "message-detail.reactions.count-a11y",
                           defaultValue: "\(count) réaction(s)", bundle: .main))
.accessibilityAddTraits(isSelected ? [.isSelected] : [])
```

VoiceOver annonce désormais **« Toutes, 5 réaction(s), sélectionné »** (ou
« 😀, 3 réaction(s) » pour un filtre emoji) au lieu d'un chiffre nu. La valeur
nommée porte le sens du compteur ; le libellé reste le filtre (nom d'emoji lu
nativement par VoiceOver pour le cas emoji).

## Portée & sûreté

- **1 fichier**, +7 lignes (dont 4 de commentaire), 0 logique / 0 réseau /
  0 layout / 0 changement visuel / 0 test neuf.
- **1 clé i18n inline** (`message-detail.reactions.count-a11y`), 0 édition
  `.xcstrings` — la clé est extraite au build depuis `defaultValue` (les clés
  sœurs `message-detail.reactions.all/.empty` sont elles aussi purement inline,
  absentes du catalogue). Convention de pluriel « (s) » alignée sur le codebase
  (`EffectsPickerView` « %d effet(s) actif(s) », `AffiliateView` « inscrit(s) »,
  `SecurityView` « verrou(s) »).
- `.accessibilityElement(children: .ignore)` neutralise la combinaison auto des
  `Text` enfants sans changer le rendu visuel ni le tap (le `Button` reste un
  seul élément a11y, ce qu'il était déjà).
- Fichier **absent de toute PR ouverte comme fichier modifié** (vérifié
  `list_pull_requests`, 40 PR ; les 5 PR qui le citent — #2194/#2199/#2181/
  #2179/#2200 — le référencent seulement comme prior-art de sélecteur frère,
  leurs cibles réelles sont `MessageViewsDetailView`/`MessageDetailSheet`/
  `BrandSignature`). → 0 collision essaim `laughing-thompson`.

## Vérification

- Gate = CI `iOS Tests` (compile Xcode 26.1.1 / Swift 6.2, run simu iOS 18.2).
- `.accessibilityLabel` / `.accessibilityValue` / `.accessibilityAddTraits` sont
  chaînables ; `.accessibilityElement(children: .ignore)` établit l'élément
  unique dont label/value/traits décrivent l'ensemble.
- Aucun toolchain Swift dans l'environnement d'exécution (Linux) → vérification
  par inspection + gate CI.

## Statut

✅ Résolu. Ne plus re-flagger `MessageReactionsDetailView.reactionFilterCapsule`
pour le compteur VoiceOver / l'état sélectionné (soldé 206i ; le trait
`.isSelected` était déjà posé, le libellé + valeur le complètent).

## Pistes 207i+

- Autres barres de filtres à compteur nu (`MessageReportDetailView`,
  `MessageLanguageDetailView`, `ConversationInfoSheet` compteurs d'onglets) —
  auditer le couple libellé/valeur VoiceOver, vérifier collision essaim.
- Vérifier collision via `list_pull_requests` avant chaque itération.
