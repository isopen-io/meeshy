# Plan itération 98i (iOS) — Dynamic Type + VoiceOver + sélection de contenu : `LicensesView`

## Contexte
`AboutView` (écran « À propos », Settings) a été soldé en amont : 16/17 `.font(.system(size:))`
migrés vers `MeeshyFont.relative`, `sectionHeader` avec `.accessibilityElement(.combine)` +
`.isHeader`, glyphe décoratif du badge 28×28 figé à dessein.

`LicensesView` (écran « Licences » open-source, atteint depuis « À propos ») est le **jumeau
non-migré** d'`AboutView` : même squelette (header chevron+titre, `ScrollView`, `sectionHeader`
réutilisable, `surfaceGradient`/`border` tintés), mais **0/10** `.font(.system(size:))` migré et
`sectionHeader` sans traits a11y de header. On aligne `LicensesView` sur la doctrine `AboutView`.

## Périmètre (1 fichier)
`apps/ios/Meeshy/Features/Main/Views/LicensesView.swift`

## Changements
1. **Dynamic Type — 10/10** `.font(.system(size: N, weight:[, design:]))` → `MeeshyFont.relative(...)`
   (weight + `.rounded` du `sectionHeader` préservés) :
   - header : chevron `back` (14), libellé « Retour » (15), titre « Licences » (17)
   - intro (13)
   - carte de licence : nom (15), auteur (12), badge type de licence (10), glyphe `arrow.up.right` (12)
   - `sectionHeader` : icône (12) + titre (11, `.rounded`)
   - **Aucun site figé** : `LicensesView` n'a pas de glyphe dans un badge à taille fixe (contrairement
     au `fieldIcon` 28×28 d'`AboutView`) → migration exhaustive.
2. **VoiceOver — parité `AboutView`** : `sectionHeader` reçoit `.accessibilityElement(children: .combine)`
   + `.accessibilityLabel(title)` + `.accessibilityAddTraits(.isHeader)` (rotor). Les cartes ont déjà
   leurs `.accessibilityLabel`/`.accessibilityHint` (Link → Safari). 0 clé i18n neuve.
3. **Sélection de contenu** : `.textSelection(.enabled)` sur le paragraphe d'intro légal (hors `Link`,
   donc pas de conflit de geste). Les cartes restent des `Link` (tap = ouverture dépôt).

## Hors-scope (préservé)
- Palette : `accentColor = "6366F1"` = indigo brand primary ; `badgeColor` (MIT/Apache/BSD) = code
  couleur sémantique par licence → **NE PAS** convertir (identité visuelle voulue).
- Contenu de la liste `licenses` (dont Kingfisher, retiré du produit en 2026-05) : correction de
  données hors-scope d'un sweep typo/a11y — ne pas toucher.

## Gate
CI `iOS Tests` (compile Xcode 26.1.1 / run simu 18.2). 0 logique, 0 test neuf — sweep présentation +
traits déclaratifs (parité 55i/74i/83i/86i/88i/90i/91i).

## Base de départ
`main` HEAD (`3c0a74e6`, post-#1235). Branche : `claude/upbeat-euler-8z0srs`.
