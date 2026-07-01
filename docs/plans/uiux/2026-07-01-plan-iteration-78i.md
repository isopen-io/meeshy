# Plan — Itération 78i (iOS)

## Contexte
Piste iOS (suffixe `i`). Pointeur autoritaire à jour = **77i** (`SharePickerView` i18n).
Base = `main` HEAD `8dcfe815`. Forte contention iOS : surfaces déjà prises au moment de 77i
(cf. pointeur) incluent **SupportView (hex, PR #1149 ouverte)**, 2FA, VoiceProfileManageView,
ConversationDashboardView, FeedCommentsSheet, emoji-picker, etc.

**Surface choisie (non prise, vérifiée via `search_pull_requests`)** : `PrivacySettingsView`.
La PR #1149 la mentionne uniquement pour l'**EXCLURE** du travail palette (« vrai ladder
arc-en-ciel »). Aucune PR ouverte ne modifie ce fichier → collision nulle.

## Cible
`apps/ios/Meeshy/Features/Main/Views/PrivacySettingsView.swift` (écran Confidentialité).

## Problèmes identifiés
1. **Dynamic Type** — 8 `.font(.system(size:))` figés (header retour/titre, en-têtes de section,
   icônes de ligne, titres de ligne, statut chiffrement). Ne scalent pas avec Larger Text →
   violation HIG (`apps/ios/CLAUDE.md` § Accessibility).
2. **Bug VoiceOver réel** — `privacyToggle` construit `Toggle("", isOn:).labelsHidden()`. Le
   toggle n'a **aucun label d'accessibilité** : VoiceOver annonce « désactivé, interrupteur »
   sans dire **quel** réglage. Les 12 toggles de confidentialité (statut en ligne, dernière
   connexion, accusés de lecture, appels hors contacts, blocage captures…) sont indistinguables
   au lecteur d'écran.

## Changements (1 fichier prod)
1. Swap mécanique des 8 `.font(.system(size:w:d:))` → `MeeshyFont.relative(size, weight:, design:)`
   (idiome `ReportUserView`/`SupportView`, helper `MeeshyUI` déjà importé).
2. `.accessibilityLabel(title)` sur chaque `Toggle` → VoiceOver annonce « <réglage>, activé/désactivé ».
3. `.accessibilityHidden(true)` sur l'icône catégorielle décorative de `settingsRow` (retire un
   arrêt de focus redondant ; sans effet sur la section chiffrement déjà `children: .combine`).
4. `.accessibilityAddTraits(.isHeader)` sur le titre d'écran (navigation VoiceOver par en-têtes).

## Écartés (ne pas re-flagger)
- **Ladder catégoriel arc-en-ciel** (couleurs par-ligne `4ADE80`/`F8B500`/`FF6B6B`/`9B59B6`…) :
  décoratif volontaire, différé « charte unique » (cf. #1149). **Non touché.**
- Frames d'icône `28×28` fixes (bornées, parité `ReportUserView`/`SupportView`).
- Section chiffrement : déjà correctement gérée (grisée, `allowsHitTesting(false)`, a11y combinée).

## Tests
Pur swap de police + modificateurs a11y de vue — aucune logique testable isolément
(précédent accepté 69i/#1149 : « 0 test neuf, couverture structurelle CI »). Gate = compile.

## Gate
CI `iOS Tests` (`.github/workflows/ios-tests.yml`) — compile Xcode 26.1.x + run simu 18.2.
Pas de compile locale (env Linux). Merge dans `main` après CI verte ; supprimer la branche.

## Branche
`claude/upbeat-euler-fimy85` (base `main` HEAD `8dcfe815`).
