# iOS UI/UX — Iteration 194i

**Date** : 2026-07-20
**Surface** : `apps/ios/Meeshy/Features/Main/Components/BrandSignature.swift`
**Axes** : i18n + a11y (VoiceOver label littéral anglais sur un contenu visible localisé)
**Base** : `main` HEAD `546b420`

## Contexte

`BrandSignature` est la signature de marque partagée par **deux surfaces
à haute visibilité** : l'écran splash (`MeeshyApp`) et l'écran de connexion
(`LoginView`). Chaque utilisateur la voit au démarrage et à la connexion.
Le composant est par ailleurs mûr : contenu visible localisé
(`splash.madeWithLove`, traduit de/en/es/fr/pt-BR), logo décoratif
`.accessibilityHidden(true)`, `.accessibilityElement(children: .combine)`,
fonts sémantiques `MeeshyFont.relative`.

## Constat

### Label VoiceOver shippé en littéral anglais brut (i18n + a11y)

Le contenu **visible** est correctement localisé — `Text(String(localized:
"splash.madeWithLove", …))` s'affiche « Fait avec ❤️ par Services CEO » en
français, « Made with ❤️ by Services CEO » en anglais, etc. (5 langues).

Mais le `.accessibilityLabel` posé au-dessus de `.combine` **écrasait** cette
combinaison par un **littéral anglais codé en dur** :

```swift
.accessibilityLabel(Text("Meeshy version \(appVersion), build \(buildNumber). Made with love by Services CEO."))
```

Conséquence : un utilisateur VoiceOver **francophone** (ou hispanophone,
germanophone, lusophone) entendait la signature en **anglais** — alors que
tout le reste de l'écran, y compris ce même crédit **visuellement**, est dans
sa langue. Régression a11y d'autant plus visible que `children: .combine`
seul aurait déjà lu le crédit localisé : le label explicite anglais **annulait**
la localisation existante. Même classe de défaut « string non localisée
shipped » que 176i / 185i, mais côté couche VoiceOver.

Note : sans label explicite, `children: .combine` lirait
`« Meeshy 1.0.0 · 42 »` — le point médian `·` et l'absence des mots
« version » / « build » donnent une lecture VoiceOver pauvre. Le label
explicite reste donc justifié pour la qualité de lecture ; il fallait
simplement le **localiser**.

## Correctif (194i)

1. **Nouvelle clé i18n `splash.version.a11y`** ajoutée à
   `Localizable.xcstrings` avec les **5 traductions** (de/en/es/fr/pt-BR),
   format `"Meeshy version %@, build %@"` (de : `Version`/`Build`,
   es : `versión`/`compilación`, pt-BR : `versão`/`compilação`). Placée en
   ordre alphabétique après `splash.tagline`.

2. **Helper privé `accessibilityDescription`** compose le label VoiceOver à
   partir de deux sources **déjà localisées** :
   - la ligne version via `String(format:)` sur la nouvelle clé,
   - le crédit via **réutilisation** de `splash.madeWithLove` (0 duplication —
     même clé que le `Text` visible, garantissant que visuel et VoiceOver ne
     divergent jamais).

3. `.accessibilityLabel(Text("… hardcoded EN …"))` remplacé par
   `.accessibilityLabel(accessibilityDescription)`.

## Portée

- **2 fichiers** : `BrandSignature.swift` (+1 helper, −0 littéral EN),
  `Localizable.xcstrings` (+1 clé, 5 langues).
- **0 logique / 0 réseau / 0 changement visuel** — le rendu à l'écran est
  strictement inchangé (le `Text` visible n'est pas touché).
- **0 test cassé** : aucun test ne référence `BrandSignature` /
  `splash.version.a11y` / le littéral supprimé (grep vide).
- **Insertion xcstrings ciblée** (textuelle) pour préserver le formatage Xcode
  (`" : "`, blocs compacts single-line ailleurs) — pas de re-dump JSON global
  qui aurait reformaté les 1245 autres clés.

## Vérification

- `json.load` OK, `splash.version.a11y` présent avec les 5 langues attendues,
  1246 clés au total (1245 + 1).
- Équilibre accolades/parenthèses/crochets `BrandSignature.swift` : 7/7, 37/37,
  2/2.
- `list_pull_requests` : aucune PR ouverte ne touche `BrandSignature` /
  `LoginView` / splash / version.
- Build iOS non exécutable sous Linux (pas de toolchain Xcode) → **gate = CI
  `iOS Tests`**.

## NE PLUS re-flagger

`BrandSignature` : label VoiceOver localisé (194i). Contenu visible déjà
localisé, logo décoratif masqué, `.combine` en place. Rien à reprendre.

## Restant (pistes 195i+, cf. exploration 194i)

- **`AudioPostComposerView` — `AudioLanguagePickerView` list rows**
  (`~726-752`) : sélection signalée par checkmark + poids de font **sans**
  `.accessibilityAddTraits(.isSelected)`. Précédent direct `88c3419`
  (`MessageLanguageDetailView`). Candidat le plus propre pour 195i.
- **`MessageReactionsDetailView.emptyReactionsView`** (`141-154`, fichier 200
  lignes) + son jumeau `MessageDetailSheet.emptyStateView` (`1488-1500`, appel
  `1640` avec un littéral EN `"Aucune reaction"` non localisé) : deux
  réimplémentations privées de `EmptyStateView` à collapser (dédup + i18n).
- `VoiceProfileManageView.emptyState` (`92-135`), `AffiliateView.emptyTokensState`
  (`182-210`), `MemberManagementSection.emptyState` (`306-322`) : empty states
  custom dupliquant `EmptyStateView` (déjà localisés → dédup structurelle).
