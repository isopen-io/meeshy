# Itération 138i — Analyse UI/UX iOS : `KeypadTab`

**Date** : 2026-07-04
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Contacts/KeypadTab.swift`
**Base** : `main` HEAD (`44053b50`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

`KeypadTab` est l'onglet **Pavé** du hub People : un cadran qui trouve une personne par numéro de téléphone
ou par nom (champ de saisie + résultats + pavé numérique 4×3). Surface **fraîche** : 3
`.font(.system(size:))`, 0 commentaire doctrine, 0 `relative`. **0 PR iOS ouverte** au démarrage → **0
contention**. Numéro **138i** (137i = `ConversationLockSheet` mergé #1444).

## Constat (avant 138i)

**3 `.font(.system(size:))`** :
- champ de saisie `TextField` (26 medium rounded) — **vrai champ texte**, sans cadre fixe ;
- chiffre de touche `Text(key.digit)` (30 regular rounded) — **borné par la touche fixe 72×56** du pavé ;
- lettres de touche `Text(key.letters)` (9 semibold) — **bornées par la touche fixe 72×56** du pavé.

## Corrections appliquées (1 fichier, 0 logique)

- **1/3 champ de saisie → `MeeshyFont.relative(26, weight: .medium, design: .rounded)`** : le `TextField`
  (numéro ou nom) **scale désormais sous Dynamic Type** (weight + `design: .rounded` conservés).
- **2/3 glyphes de touche FIGÉS** + commentaires doctrine **82i** : chiffre + lettres, tous deux **bornés
  par la touche de dimension fixe 72×56** (le `VStack` du bouton porte `.frame(width: 72, height: 56)`) —
  un glyphe borné par une touche de dimension fixe garde `.font(.system(size:))` (le scaler déborderait de
  la touche qui, elle, ne grandit pas).

Accessibilité déjà conforme → **intacte** : le `TextField` porte son `.accessibilityLabel` ; chaque
`keyButton` porte `.accessibilityLabel(key.digit)` (VoiceOver lit le chiffre) → les lettres décoratives
sont déjà aplaties par le bouton labellisé. Palette (`theme.textPrimary/textMuted`) déjà conforme → non
touchée.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, 0 clé i18n neuve (placeholder/labels déjà
  `String(localized:)`). `import MeeshyUI` déjà présent. La logique de recherche (`KeypadViewModel`,
  `scheduleSearch`, `append`/`deleteLast`) n'est **pas** touchée.
- Aucun test ne référence `KeypadTab` (la seule occurrence est un **commentaire** dans
  `CallStarterTests`) → aucune régression de test.

## Statut

**TERMINÉE** — `KeypadTab` Dynamic Type soldé (1 champ → `relative`, 2 glyphes de touche figés commentés
82i). Ne plus re-flagger les 2 glyphes de touche (bornés par touches fixes 72×56).

---

## Analyses corrigées & complètes (ne pas reproduire)

- `KeypadTab` — champ de saisie → `MeeshyFont.relative` ; chiffre + lettres de touche figés (82i, bornés par
  touches fixes 72×56) ; a11y déjà en place (TextField labellisé, keyButton lit le chiffre). **SOLDÉ 138i.**
