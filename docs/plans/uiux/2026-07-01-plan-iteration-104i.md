# Plan — Iteration 104i (2026-07-01) — iOS Dynamic Type + a11y `ShareLinksView`

## Objectif
Rendre `ShareLinksView` (écran « Liens de partage » : header, cartes de stats, liste de liens avec
copie + navigation détail, état vide) conforme **Dynamic Type** et améliorer **VoiceOver**, sans
changer le layout par défaut, la logique, la palette ni les chaînes i18n visibles.

## Piste / numéro
- iOS uniquement (suffixe `i`).
- Essaim saturé jusqu'à 103i + 101i = `TrackingLinksView` (jumeau, fichier distinct) → prochain
  libre **`104i`**. `ShareLinksView.swift` disjoint (vérifié `list_pull_requests` + `search_pull_requests`
  = 0 PR) → aucun conflit de code.
- Base : `main` HEAD (`5a47053b`). Branche : `claude/upbeat-euler-6r2un5` (recréée depuis main).

## Étapes
1. ✅ Resync `main`, reset branche (après supersession de 94i #1277 fermée sans merge).
2. ✅ Scan `main` : `ShareLinksView.swift` = 7 `.font(.system(size:))`, 0 relative, palette tokenisée,
   i18n couvert. Vérifié non réclamé.
3. ✅ **Dynamic Type** : 5/7 `.font(.system(size:))` → `MeeshyFont.relative(size, weight:)` (weight préservé).
4. ✅ **2 figés justifiés & commentés** : hero d'état vide `link.badge.plus` 40pt (doctrine 84i/86i)
   + icône de ligne 16pt dans cercle fixe 40×40 (doctrine 86i), tous deux `accessibilityHidden`.
5. ✅ **VoiceOver** : label du bouton de copie comblé (`share.links.copy.a11y`, VoiceOver-only) ;
   `.isHeader` sur « MES LIENS » ; `.combine` sur cartes de stat + état vide ;
   `.accessibilityHidden` sur 4 glyphes décoratifs.
6. ✅ Analyse `2026-07-01-iteration-104i.md` + ce plan + `branch-tracking.md`.
7. ⏳ Commit → push → PR → CI `iOS Tests` verte → merge dans `main` → suppression de branche.

## Invariants
- **1 clé de catalogue neuve** = `share.links.copy.a11y` (suffixe `.a11y`, VoiceOver-only, aucune UI
  visible — convention 100i `EditPostSheet`).
- **0 changement de logique / comportement / layout** à taille Dynamic Type par défaut (`.large`).
- **0 test neuf** (parité 55i/74i/86i/93i).
- **1 seul fichier de production touché** → orthogonal.
- SDK non touché.

## Vérification
- `grep .font(.system(size:` → 2 restants (hero 40pt + icône cercle 40×40, commentés).
- `grep MeeshyFont.relative` → 5 ; `accessibilityHidden` → 4 ; `accessibilityLabel` → 3 (back+create+copy).

## Différé 105i+
`StoryViewerView+Content` (31, i18n), `ConversationView+Composer` (22, prudent),
`OnboardingAnimations` (17), `ConversationView+MessageRow` (16).
</content>
