# Plan — Iteration 79ib (2026-07-01)

## Objectif
Parité **Dynamic Type** des glyphes inline de l'écran d'appel : 4 icônes SF Symbol posées à
côté d'un `Text` scalable (`CallView` ×3, `IncomingCallView` ×1) passent de `.font(.system(size:))`
figé à `MeeshyFont.relative(...)` pour scaler en tandem avec leur label. Laisser fixes les
glyphes de contrôle en cercle fixe et les initiales d'avatar (voir analyse § FIXE).

## Base
- Branche : `claude/upbeat-euler-d34z4q` resync sur `main` HEAD `1563a447`.
- Surface disjointe de toutes les PRs iOS en vol (aucune ne touche `*Call*View*`).

## Étapes
1. [x] Analyse → `docs/analyses/uiux/2026-07-01-iteration-79ib.md`
2. [x] Plan (ce fichier)
3. [x] Éditer `CallView.swift` (l.595, 771, 1265) + `IncomingCallView.swift` (l.164) —
   `.system(size:…)` → `MeeshyFont.relative(…)`, poids `.semibold` préservé
4. [x] Vérif : aucun `@State private` touché ; glyphes de contrôle / avatars intacts
5. [ ] Commit + push `claude/upbeat-euler-d34z4q`
6. [ ] PR → CI `iOS Tests` verte
7. [ ] Merge dans `main`, supprimer la branche, MAJ `branch-tracking.md`

## Mapping (source de vérité)
`relative(12)`→`.caption`, `relative(13)`→`.footnote` (table `MeeshyFont.textStyle(for:)`,
`MeeshyUI/Theme/Accessibility.swift`). Les deux fichiers importent déjà `MeeshyUI`.

## Risque
- Compile-risk quasi nul : `MeeshyFont.relative(_:weight:)` est un pattern établi (ReportUserView,
  CallDetailSheet, TwoFactorSetupView…).
- Layout : les icônes sont dans des `Capsule`/HStack à padding — pas de frame figée qui
  clipperait ; le badge s'agrandit naturellement avec le texte.

## Gate CI
`iOS Tests` (compile Xcode 26.1.x + tests simu 18.2). Pas de test neuf (changement de
présentation pur — précédents 55i/78i).
