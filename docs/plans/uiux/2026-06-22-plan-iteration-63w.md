# Plan itération 63w (web) — anti-pattern `t()||fallback` sur le flow reset de mot de passe

## Base
- Branche de travail : `claude/practical-fermat-ctjjy0` réinitialisée sur `main` HEAD `d63c4a5`
  (post-#835 iter-61w / post-#840 iter-62w).
- Surface **orthogonale** aux PR en vol : #842/#843 (message-bubble 62w), #847 (Badge 62wb).

## Objectif
Solder la classe de bug `t('key') || 'French'` sur le **flow de récupération de mot de passe**
(3 pages) en remplaçant par la signature de secours native `t('key', 'English')`.

## Étapes
1. [x] `git fetch origin main` + reset de la branche sur `main` HEAD.
2. [x] Inventorier l'anti-pattern (`grep`) sur les 3 pages → 43 occ. / 41 clés.
3. [x] Vérifier par script que les 41 clés existent ×4 locales (en/fr/es/pt) → **toutes présentes**.
4. [x] Remplacer `t('k') || 'FR'` → `t('k', 'EN')` (EN = valeur exacte `en/auth.json`,
       double-quote pour gérer les apostrophes).
5. [x] Vérifier grep résiduel = 0, diff mécanique conforme.
6. [x] **0 fichier locale touché** (clés déjà présentes).
7. [ ] Commit + push, créer PR, CI vert, merge dans `main`, suppression branche.
8. [x] Mettre à jour `branch-tracking.md` (ligne 63w, Next = 64, base, PR).

## Fichiers touchés
- `apps/web/app/forgot-password/page.tsx` (8)
- `apps/web/app/forgot-password/check-email/page.tsx` (23)
- `apps/web/app/reset-password/page.tsx` (12)
- `docs/analyses/uiux/2026-06-22-iteration-63w.md` (nouveau)
- `docs/plans/uiux/2026-06-22-plan-iteration-63w.md` (ce fichier)
- `docs/plans/uiux/branch-tracking.md` (ledger)

## Hors périmètre / différé 64w+
- `PhoneResetFlow.tsx` (56 occ) — gros porteur, lot dédié.
- Reste ~29 fichiers de l'anti-pattern → lots bornés par feature.
- `app/settings/loading.tsx` (server component, i18n server-side dédiée), `next-themes`
  orphelin, épuration `settings/_archived/`.
