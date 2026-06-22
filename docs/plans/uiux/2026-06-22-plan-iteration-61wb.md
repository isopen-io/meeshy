# Plan — Itération 61wb (web only)

**Base** : `main` HEAD post-merge iter-60wd (#811) — commit `799ea44` (rebasée)
**Branche** : `claude/practical-fermat-bhskup-61w`
**Objectif** : éliminer le *flash-of-raw-keys* (anti-pattern `t(key) || 'fallback'`) sur le
chrome global live — cluster `components/layout/`.
**Numérotée 61wb** : `61w` pris par VideoLightbox (#816), surface disjointe.

## Étapes
1. [x] Audit contention : PR iter-61w en vol (#816 VideoLightbox = 61w, #837 doublon #804, #835, #818) →
   cibler `layout/` (non couvert).
2. [x] Vérifier que `landing.footer.*`, `header.shareText`, `common.navigation.feeds` existent ×4 locales.
3. [x] `Footer.tsx` — 7× `t(k) || 'x'` → `t(k, 'x')`, fallbacks alignés EN locale.
4. [x] `Header.tsx` — 4× `t('shareText') || 'FR…'` → `t('shareText', 'EN…')` (anglicisé).
5. [x] `DashboardLayout.tsx` — 1× `t('navigation.feeds') || 'Feeds'` → `t('navigation.feeds', 'Feed')`.
6. [x] Grep anti-pattern résiduel = 0 sur les 3 fichiers.
7. [x] Confirmer compat tests existants (mocks ignorent le 2e arg).
8. [x] Housekeeping : fermer doublons #837 (=#804) et #812 (=#806).
9. [x] Rebase sur `main` post-#811/#816 ; renumérotation 61w→61wb (collision VideoLightbox).
10. [ ] Push + CI verte → merger dans `main` ; supprimer la branche.

## Hors périmètre (différé)
- Reste de la classe de bug `t()||fallback` (~260 occ) — lots bornés ultérieurs.
