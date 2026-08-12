# Itération 137i — Analyse UI/UX iOS : `ConversationLockSheet`

**Date** : 2026-07-04
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Components/ConversationLockSheet.swift`
**Base** : `main` HEAD (`ee185327`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

`ConversationLockSheet` est la sheet de saisie du PIN de verrouillage de conversation (master PIN 6ch /
code conversation 4ch) : glyphe hero de cadenas + titre/sous-titre + rangée de points + pavé numérique.
Surface **fraîche** : 3 `.font(.system(size:))`, 0 commentaire doctrine, 0 `relative`. **1 PR ouverte
(#1440, calls/`WebRTCVideoView`/`CallsTab`)** → **ne touche PAS `ConversationLockSheet`** → **0 contention**.
Numéro **137i** (136i = `MessageListView` mergé #1441).

## Constat (avant 137i)

**3 `.font(.system(size:))`** — **tous des cas de gel** :
- glyphe hero de cadenas `Image(systemName: iconName)` (44) — **hero décoratif ≥40pt**, le titre porte le
  sens ;
- glyphe `delete.left.fill` (22 medium) — **borné par la touche fixe 76×76** du pavé ;
- chiffre `Text("\(digit)")` (26 medium rounded) — **borné par la touche fixe 76×76** du pavé.

## Corrections appliquées (1 fichier, 0 logique)

- **3/3 glyphes FIGÉS** + commentaires doctrine :
  - hero cadenas → **84i** (glyphe hero décoratif ≥40pt) + **`.accessibilityHidden(true)`** (décoratif, le
    titre/sous-titre portent le sens) ;
  - `delete.left.fill` → **82i** (borné par la touche tap fixe 76×76 ; il porte déjà son
    `.accessibilityLabel` « Supprimer le dernier chiffre ») ;
  - chiffre → **82i** (borné par la touche tap fixe 76×76 ; le `Button` lit le chiffre pour VoiceOver).

Un glyphe/chiffre borné par une touche de dimension fixe (76×76) ou un hero décoratif ≥40pt garde
`.font(.system(size:))` — le scaler déborderait de la touche / déséquilibrerait le hero. **Aucune
migration `relative`** : c'est une itération d'**annotation de gel** (pas d'`import MeeshyUI` requis).

Palette (`MeeshyColors.error/indigo600` en gradient, `theme.textPrimary`) déjà conforme → non touchée.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, 0 clé i18n neuve (titres/sous-titres/
  erreurs déjà `String(localized:)`). La logique de saisie/vérification du PIN (`appendDigit`,
  `handleComplete`, `shakeAndReset`) n'est **pas** touchée.
- Aucun test ne référence `ConversationLockSheet` → aucune régression de test.

## Statut

**TERMINÉE** — `ConversationLockSheet` : 3 glyphes figés commentés (1 hero 84i masqué + 2 touches de pavé
82i). Ne plus re-flagger ces 3 glyphes.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `ConversationLockSheet` — hero cadenas figé (84i) + masqué ; `delete.left.fill` + chiffre du pavé figés
  (82i, bornés par touches fixes 76×76). **SOLDÉ 137i.**
