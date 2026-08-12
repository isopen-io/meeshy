# Itération 170i — Analyse UI/UX iOS : `VoiceProfileWizardView`

**Date** : 2026-07-19
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/VoiceProfileWizardView.swift`
**Base** : `main` HEAD (`efedb69e4`)
**Branche** : `claude/laughing-thompson-42yxa2`
**Gate** : CI `iOS Tests`

## Contexte

`VoiceProfileWizardView` est l'assistant **multi-étapes** de création de profil vocal (clonage de
voix pour le Prisme Linguistique audio). Il enchaîne 5 étapes dans un même `body` via un `switch` sur
`viewModel.currentStep` : **consentement** → **vérification d'âge** → **enregistrement** →
**traitement** → **terminé**. Chaque étape **remplace l'intégralité du contenu** sous un header fixe
(barre de progression + bouton fermer).

Surface **fraîche** côté UI/UX : aucun doc d'analyse antérieur (le jumeau `VoiceProfileManageView` a
été traité en **146i**, fichier distinct). Numéro **170i** choisi strictement > plus haute itération
mergée observée (`164i`, #2022) pour éviter toute collision avec l'essaim en vol (165i→…).

## Constat (avant 170i)

**Typographie déjà solde** — le fichier est massivement migré :
- **4 `.font(.system(size:))` résiduels = tous des cas de gel justifiés & déjà commentés** :
  bouton fermer chrome (28, cadre de tap fixe, doctrine 82i) ; 3 icônes héros décoratives
  `waveform.circle.fill` 64 / `person.badge.shield.checkmark.fill` 64 / `checkmark.circle.fill` 72
  (≥40pt, `.accessibilityHidden(true)`).
- Tous les vrais libellés texte utilisent déjà `MeeshyFont.relative(...)` (Dynamic Type natif),
  weights et designs `.rounded`/`.monospaced` préservés. **Aucune migration `relative` requise.**

**Palette déjà tokenisée** (`Color(hex: accentColor)`, `theme.*`, `MeeshyColors.success`/`.error`) → **0 swap**.

**a11y de base déjà présente** : bouton fermer labellisé (`common.close`), barre de progression
`.accessibilityHidden` (décorative), icônes héros/glyphes de ligne `.accessibilityHidden`, lignes
d'info profil `.accessibilityElement(children: .combine)`.

**Lacune a11y RÉELLE détectée — annonce de transition d'étape absente.**
Le `switch viewModel.currentStep` échange tout le contenu de l'écran à chaque avancée
(consentement accordé → âge, échantillons envoyés → traitement, profil créé → terminé), mais
**aucune notification VoiceOver n'est postée** et le focus VoiceOver **ne se déplace jamais** :
l'utilisateur non voyant reste bloqué sur l'ancien focus (souvent le bouton qui vient de disparaître),
sans savoir que l'écran a changé ni ce qu'il contient désormais. C'est le même défaut que
`IncomingCallView` a corrigé (audit P2-iOS) via `.screenChanged`, et que `CallView` gère par
`.adaptiveOnChange` + annonces d'état.

## Correction appliquée (1 fichier, 0 logique, 0 clé i18n neuve)

Ajout d'une annonce VoiceOver à chaque transition d'étape, en miroir **exact** de la doctrine
`IncomingCallView` (`.screenChanged`) + `CallView` (`.adaptiveOnChange`) :

```swift
.adaptiveOnChange(of: viewModel.currentStep) { _, newStep in
    UIAccessibility.post(
        notification: .screenChanged,
        argument: stepAnnouncement(for: newStep)
    )
}
```

- **`.screenChanged`** (et non `.announcement`) est le choix HIG correct ici : chaque étape est un
  **remplacement plein écran** du contenu → VoiceOver **refocalise** sur le nouveau contenu ET annonce
  l'argument. `.announcement` seul laisserait le focus sur l'ancien élément.
- **`.adaptiveOnChange`** (backport iOS 16 du `onChange(of:initial:)` iOS 17, `MeeshyUI/Compatibility/`)
  garantit la compatibilité multi-version sans dupliquer la logique (exigence « IOS VERSION ADAPTATION »).
- **`stepAnnouncement(for:)`** : helper `private` pur, `switch` exhaustif sur les 5 cas de
  `VoiceProfileWizardStep`, **réutilisant les 5 clés i18n déjà présentes** dans les étapes
  (`voice.profile.wizard.title` / `.ageVerification` / `.recording.title` / `.analyzing` / `.created`).
  **0 clé neuve.**

## Périmètre / non-régression

- **1 seul fichier**, 0 logique métier, 0 mutation d'état, 0 test neuf, **0 clé i18n neuve**, 0 swap palette.
- `VoiceProfileWizardStep : Int, CaseIterable` → `Equatable` (rawValue Int) : `adaptiveOnChange<V: Equatable>`
  s'applique sans contrainte. `switch` exhaustif (5/5 cas) → compile garanti.
- `UIAccessibility.post` disponible avec les imports existants (`SwiftUI`) — prouvé par
  `IncomingCallView`/`CallView` (mêmes imports). `.adaptiveOnChange` fourni par `MeeshyUI` (déjà importé).
- Aucun impact quand VoiceOver est off : `.screenChanged` est un no-op sans lecteur d'écran actif.
- Gate = CI `iOS Tests` (compile Xcode 26.1.1 / run simu 18.2).

## NE PAS re-flagger (soldé 170i)

`VoiceProfileWizardView` : **annonce de transition d'étape VoiceOver ajoutée (170i)**. Ne pas
ré-ajouter d'annonce ailleurs pour le même changement. Dynamic Type **audité et soldé** — les 4
`.font(.system(size:))` sont **figés à dessein** (chrome fermer 28 + 3 héros ≥40pt décoratifs
`accessibilityHidden`), **ne pas les migrer en `relative`**. Palette tokenisée, libellés déjà
sémantiques. Le jumeau `VoiceProfileManageView` (146i) est un fichier distinct — ne pas confondre.
