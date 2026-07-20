# Plan Itération 158i — `SecurityVerificationView` (a11y VoiceOver)

**Date** : 2026-07-18 · **Piste** : iOS (`i`) · **Branche** : `claude/laughing-thompson-akjplz` · **Base** : `main` HEAD `f489355`

## Objectif
Combler la lacune d'accessibilité VoiceOver de l'écran de vérification E2E, sans toucher la logique
(QR generation, formatage du safety number). Polices déjà en `MeeshyFont.relative` → hors scope.

## Étapes
1. Masquer les 2 glyphes décoratifs (`lock.shield.fill`, `hourglass.circle`) de VoiceOver — `.accessibilityHidden(true)`.
2. Labelliser le QR code — nouvelle clé `security.verify.qr.a11y` (défaut inline).
3. Fusionner le bloc safety number en un élément VoiceOver + label **épelé chiffre-par-chiffre** (`spelledSafetyNumber`)
   pour la comparaison à voix haute.
4. Titres « End-to-End Encryption » / « Verification Unavailable » → `.accessibilityAddTraits(.isHeader)`.

## Contraintes
- 1 fichier, 0 logique métier, additif uniquement (modificateurs a11y + 1 fonction pure).
- Aucun test ne référence la vue → aucune régression attendue.

## Validation
- Environnement Linux : build/test Xcode non exécutables ici. Changements limités à des modificateurs
  SwiftUI standards + une fonction pure → aucun risque de compilation. Gate = CI `iOS Tests` sur la PR.
