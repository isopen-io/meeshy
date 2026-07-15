# Plan — Itération 141i : `MyStoriesView` (Dynamic Type + VoiceOver)

**Date** : 2026-07-15 · **Piste** : iOS (`i`) · **Base** : `main` HEAD `5195bad`
**Branche** : `claude/laughing-thompson-65518x` · **Gate** : CI `iOS Tests`

## Objectif
Solder la surface fraîche `MyStoriesView` (feuille « Mes stories ») : rendre toutes les polices scalables
sous Dynamic Type et combler la lacune VoiceOver des métriques.

## Sélection de la cible
- Peloton iOS à **140i** (`ThemedBackButton`, PR #1966) → numéro **141i**.
- `MyStoriesView` : **0 doc d'itération**, **6 `.font(.system(size:))`**, **0 PR ouverte** dessus (vérifié
  sur les 20 PR ouvertes) → fraîche + zéro contention.

## Étapes
1. **6/6 `.font(.system(size:))` → `MeeshyFont.relative(size, weight:)`** — aucun gel (aucun cadre de
   dimension fixe ; la vignette 64×64 est un frère, pas un conteneur).
2. **VoiceOver métriques** : `metric(icon:value:label:)` + `.accessibilityElement(children: .ignore)` +
   `.accessibilityLabel(label)` → « N vues / réactions / commentaires ». 3 clés `.a11y` inline.
3. **`ellipsis`** décoratif → `.accessibilityHidden(true)` (actions via `.contextMenu`).

## Contraintes
- 1 fichier, 0 logique, 0 test neuf, palette déjà tokenisée (0 swap).
- Cercle de sélection : ne pas toucher son masquage (trait `.isSelected` de la ligne).

## Vérification
- `grep '.font(.system(size:'` sur le fichier → **0** restant. ✅
- Gate = CI `iOS Tests` (build XcodeGen + suites ; aucun test ne référence la vue).
