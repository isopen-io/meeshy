# Plan Itération 149i — `ChangePasswordView` (a11y checklist + rotor + héros succès)

**Date** : 2026-07-16 · **Piste** : iOS (`i`) · **Branche** : `claude/laughing-thompson-uj2nmm`
**Base** : `main` HEAD `ab6df74` · **Gate** : CI `iOS Tests`

## Objectif
Combler 3 lacunes a11y réelles de l'écran sensible de changement de mot de passe, sans toucher la
logique ni le rendu visuel :
1. la checklist de validation ne repose plus sur la **couleur seule** (WCAG 1.4.1) ;
2. l'overlay de succès transitoire est masqué (héros décoratif) + lu d'un bloc ;
3. titres de section/écran ancrés au rotor VoiceOver (parité `DeleteAccountView`).

## Périmètre (1 fichier)
`apps/ios/Meeshy/Features/Main/Views/ChangePasswordView.swift`

## Étapes
1. `validationRow` : masquer l'icône décorative (`.accessibilityHidden(true)`) ; combiner la
   rangée (`.accessibilityElement(children: .combine)`) et porter l'état via
   `.accessibilityAddTraits(met ? .isSelected : [])` (trait système localisé → 0 clé i18n neuve).
2. `successOverlay` : `.accessibilityHidden(true)` + commentaire de gel (doctrine 84i/87i) sur le
   héros `checkmark.shield.fill` 48pt ; `.accessibilityElement(children: .combine)` sur le VStack.
3. `sectionHeader` : `.accessibilityElement(children: .combine)` + `.accessibilityAddTraits(.isHeader)`
   (parité `DeleteAccountView`).
4. Titre d'en-tête : `.accessibilityAddTraits(.isHeader)` ; bouton retour :
   `.accessibilityLabel(common.back)` (parité `DeleteAccountView`).

## Contraintes respectées
- **0 clé i18n neuve** : état de validation via trait système `.isSelected` ; `common.back`
  déjà présente.
- **0 police visible modifiée** : l'unique `.system(size: 48)` reste figé (héros décoratif ≥40pt).
- **0 logique / 0 test neuf / 1 fichier**. Additif pur (7 modificateurs a11y + 4 commentaires).

## Vérification
- CI `iOS Tests` (compile + snapshots inchangés puisque zéro changement de layout/police).
- Contrôle manuel VoiceOver : règles de checklist annoncées avec leur état ; héros de succès retiré
  du focus + confirmation groupée ; rotor « En-têtes » sur les 2 sections + titre.

## Sync
- Base : `main` HEAD `ab6df74`. Branche repartie propre depuis `origin/main`.
- Highest iOS en vol au run : 148i (#1982 `StoryViewerContainer`) → ce lot = **149i**.
- Cibles claimées à ne pas dupliquer : 140i–148i (voir analyse).
