# Plan — Itération 61w (web only)

**Base** : `main` HEAD post-merge iter-60wc (#804) — commit `43cb822`
**Branche** : `claude/practical-fermat-bhskup-61w`
**Objectif** : éliminer le *flash-of-raw-keys* (anti-pattern `t(key) || 'fallback'`) sur le
chrome global live — cluster `components/layout/`.

## Étapes
1. [x] Audit contention : 4 PR iter-61w ouvertes (#837 doublon #804, #835, #818, #816) →
   cibler `layout/` (non couvert).
2. [x] Vérifier que `landing.footer.*`, `header.shareText`, `common.navigation.feeds` existent ×4 locales.
3. [x] `Footer.tsx` — 7× `t(k) || 'x'` → `t(k, 'x')`, fallbacks alignés EN locale.
4. [x] `Header.tsx` — 4× `t('shareText') || 'FR…'` → `t('shareText', 'EN…')` (anglicisé).
5. [x] `DashboardLayout.tsx` — 1× `t('navigation.feeds') || 'Feeds'` → `t('navigation.feeds', 'Feed')`.
6. [x] Grep anti-pattern résiduel = 0 sur les 3 fichiers.
7. [x] Confirmer compat tests existants (mocks ignorent le 2e arg).
8. [ ] Commit + push + CI verte.
9. [ ] Merger dans `main` (PR) ; supprimer la branche ; MAJ `branch-tracking.md`.

## Hors périmètre (différé)
- Reste de la classe de bug `t()||fallback` (~260 occ) — lots bornés ultérieurs.
- Fermeture des doublons #837 / #812 / #802 / #803 (action de housekeeping, pas du code).
