# Plan — Iteration 94i (2026-07-01) — iOS Dynamic Type + a11y `MemberManagementSection`

## Objectif
Rendre `MemberManagementSection` (section gestion des membres : en-tête, recherche, liste de
membres avec badges de rôle + menu d'actions, bouton d'ajout, états loading/vide) conforme
**Dynamic Type** et améliorer **VoiceOver**, sans changer le layout par défaut, la logique, la
palette ni les chaînes i18n.

## Piste / numéro
- iOS uniquement (suffixe `i`).
- `90i`/`91i`/`92i` saturés + `93i` mergée (#1240, `LocationPickerView`, cette session) → prochain
  **`94i`**. Surface `MemberManagementSection` disjointe (vérifiée `list_pull_requests`) → aucun
  conflit de code.
- Base : `main` HEAD `ee334ec5` (post-merge #1240).
- Branche : `claude/upbeat-euler-6r2un5` (recréée depuis `main` HEAD après merge de 93i).

## Étapes
1. ✅ Merge 93i (#1240) dans `main`, resync sur `main` HEAD, reset de la branche.
2. ✅ Audit `MemberManagementSection.swift` : 17 `.font(.system(size:))`, 0 `MeeshyFont.relative`,
   palette tokenisée (sauf `F8B500` volontaire), i18n déjà couvert.
3. ✅ **Dynamic Type** : 15/17 `.font(.system(size:))` → `MeeshyFont.relative(size, weight:, design:)`
   (weight + design `.rounded` préservés 1:1).
4. ✅ **2 figés justifiés & commentés** :
   - `ellipsis` menu 13pt = chrome contraint dans cadre tap fixe 32×32 (doctrine 82i/90i).
   - `person.slash` état vide 28pt = décoratif (doctrine 74i/86i) + `accessibilityHidden`.
5. ✅ **VoiceOver — 8 traits** :
   - `.accessibilityAddTraits(.isHeader)` sur le titre d'en-tête.
   - `.accessibilityHidden(true)` sur 7 glyphes décoratifs appariés (person.3.fill, magnifyingglass,
     crown.fill, shield.fill, checkmark.shield.fill, person.badge.plus, person.slash).
6. ✅ Analyse `2026-07-01-iteration-94i.md` + ce plan + `branch-tracking.md`.
7. ⏳ Commit → push → PR → CI `iOS Tests` verte → merge dans `main` → suppression de branche.

## Invariants
- **0 nouvelle clé de catalogue** (traits a11y déclaratifs).
- **0 changement de logique / comportement / layout** à taille Dynamic Type par défaut (`.large`).
- **0 test neuf** (sweep typographique + traits a11y pur, parité 55i/74i/86i/90i/93i ; SwiftUI ne
  compile pas sous Linux → gate = CI `iOS Tests`).
- **1 seul fichier de production touché** → orthogonal, aucun conflit attendu.
- SDK non touché (`MeeshyFont.relative` déjà exporté par `MeeshyUI`, importé ligne 4).

## Vérification
- `grep .font(.system(size:` → 2 restants (ellipsis 32×32 + person.slash 28pt, commentés à dessein).
- `grep MeeshyFont.relative` → 15 sites.
- `grep accessibilityHidden` → 7 sites.
- Compte : 15 `relative` + 2 `.system(size:)` figés = 17 sites d'origine ✅.

## Différé 95i+
`MessageOverlayMenu` (21, + Glass), `StoryViewerView+Content` (coordonner i18n), `ConversationView+Composer`
(22, prudent).
</content>
