# Plan — Iteration 93i (2026-07-01) — iOS Dynamic Type + a11y `LocationPickerView`

## Objectif
Rendre `LocationPickerView` (picker de lieu MapKit : carte + recherche + carte d'action) conforme
**Dynamic Type** et améliorer **VoiceOver**, sans changer le layout par défaut, la logique, la
palette ni les chaînes i18n.

## Piste / numéro
- iOS uniquement (suffixe `i`).
- `90i`/`91i`/`92i` saturés par des agents parallèles (AffiliateView, NewConversationView,
  CommunityLinksView, DataExportView) → prochain libre **`93i`**. Surface `LocationPickerView`
  disjointe (vérifiée `list_pull_requests`) → aucun conflit de code.
- Base : `main` HEAD.
- Branche : `claude/upbeat-euler-6r2un5`.

## Étapes
1. ✅ Re-sync sur `main` HEAD, création/reset de la branche.
2. ✅ Audit `LocationPickerView.swift` : 17 `.font(.system(size:))`, 0 `MeeshyFont.relative`,
   palette 100 % tokenisée, i18n déjà couvert.
3. ✅ **Dynamic Type** : 15/17 `.font(.system(size:))` → `MeeshyFont.relative(size, weight:, design:)`
   (weight + design `.monospaced` préservés 1:1).
4. ✅ **2 figés justifiés & commentés** :
   - `mappin.circle.fill` 36pt = marqueur d'annotation de carte ancré à une coordonnée (doctrine
     74i/86i).
   - `mappin` 12pt = glyphe contraint dans un badge fixe 28×28 (doctrine 86i) + `accessibilityHidden`.
5. ✅ **VoiceOver — 4 traits** :
   - `.accessibilityAddTraits(.isHeader)` sur le titre toolbar.
   - `.accessibilityHidden(true)` sur 3 glyphes décoratifs appariés (loupe, mappin badge, location.fill).
6. ✅ Analyse `2026-07-01-iteration-93i.md` + ce plan + `branch-tracking.md`.
7. ⏳ Commit → push → PR → CI `iOS Tests` verte → merge dans `main` → suppression de branche.

## Invariants
- **0 nouvelle clé de catalogue** (labels a11y via traits déclaratifs, pas de string).
- **0 changement de logique / comportement / layout** à taille Dynamic Type par défaut (`.large`).
- **0 test neuf** (sweep typographique + traits a11y pur, parité 55i/74i/86i/88i/90i ; SwiftUI ne
  compile pas sous Linux → gate = CI `iOS Tests`).
- **1 seul fichier de production touché** → orthogonal, aucun conflit attendu avec les PRs iOS en vol.
- SDK non touché (`MeeshyFont.relative` déjà exporté par `MeeshyUI`, importé ligne 5).

## Vérification
- `grep .font(.system(size:` → 2 restants (marqueur carte 36pt + badge fixe 28×28, commentés à dessein).
- `grep MeeshyFont.relative` → 15 sites.
- `grep accessibilityHidden` → 3 sites.
- Compte : 15 `relative` + 2 `.system(size:)` figés = 17 sites d'origine ✅.

## Différé 94i+
`MemberManagementSection` (17), `MessageOverlayMenu` (21, + Glass), `StoryViewerView+Content`
(coordonner i18n), `ConversationView+Composer` (22, prudent).
</content>
