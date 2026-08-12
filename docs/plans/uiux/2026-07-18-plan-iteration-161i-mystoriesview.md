# Plan Itération 161i — `MyStoriesView` (Dynamic Type + VoiceOver + i18n)

**Date** : 2026-07-18 · **Piste** : iOS (`i`) · **Base** : `main` HEAD `ffaf2de`
**Branche** : `claude/laughing-thompson-ruiv50` · **Gate** : CI `iOS Tests`

## Objectif

Solder l'accessibilité de la sheet « Mes stories » : rendre les libellés scalables (Dynamic Type) et
combler la lacune VoiceOver des compteurs d'engagement nus, sans toucher la logique produit.

## Étapes

1. [x] Resync `main` (branche précédente 160i mergée #2012) ; repartir de `main` HEAD.
2. [x] Recenser les surfaces iOS fraîches non couvertes par les 20 PR ouvertes → `MyStoriesView`.
3. [x] Dynamic Type : 5 `.font(.system)` réels/scalables → `MeeshyFont.relative` ; 2 gels commentés
       (affordance « … » décorative, overlay texte proportionnel au thumbnail).
4. [x] VoiceOver : composer `MyStoryRow` en un élément labellisé (`children: .ignore` +
       `rowAccessibilityLabel`) ; trait `.isButton` + `.isSelected` ; masquer le glyphe « … ».
5. [x] i18n : enregistrer `story.mine.row.a11y` (5 langues, spécificateurs positionnels).
6. [x] Rédiger analyse + plan 161i.
7. [ ] Commit + push `claude/laughing-thompson-ruiv50`.
8. [ ] Ouvrir la PR 161i ; laisser CI `iOS Tests` valider (env Linux → pas de build local).

## Contraintes respectées

- **iOS-only** ; 0 modif Android/Web/Backend/SDK.
- **0 logique / 0 test neuf** ; sweep + a11y pur (parité 135i–139i).
- Palette déjà tokenisée → **0 swap** ; Glass déjà présent.
- Gels documentés par commentaire pour éviter tout re-flag futur.

## Vérification

- Env Linux distant : pas de `xcodebuild` → gate = CI `iOS Tests` (compile Xcode 26.1.1 / run simu
  iOS 18.2).
- Contrôles locaux : `grep` confirme 5 `relative` + 2 `.system` gelés ; `Localizable.xcstrings`
  re-parse en JSON valide (1230 clés).
