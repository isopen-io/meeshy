# Plan — Itération 65wb (web)

## Objectif
Corriger le **bug i18n live** de la page de détails d'un lien de tracking
`app/links/tracked/[token]/page.tsx` : 7 clés d'erreur absentes des locales font afficher la
**clé brute** (toasts + écran d'erreur plein cadre) à TOUS les utilisateurs. Solder en même
temps l'anti-pattern `t()||fallback` résiduel du fichier + 3 chaînes FR figées.

## Numérotation
**65wb** — collision : un agent web parallèle (`s5hyhl`) a aussi pris « 65w »
(`ConversationSettingsModal`) et l'a mergé sur `main` en premier. Renumérotée 65wb ;
docs `65w` canoniques de `main` conservés.

## Surface (orthogonale aux PR en vol + au 65w mergé)
- 1 composant : `app/links/tracked/[token]/page.tsx`
- 4 locales : `locales/{en,fr,es,pt}/links.json`

## Étapes
1. [x] Confirmer la cause racine : `tracking.errors.*` absentes → clé brute affichée.
2. [x] Convertir les 15 `t(k) || 'FR'` → `t(k, 'EN')` (anti-flash).
3. [x] FR figé `Une erreur inattendue…` → `tracking.details.unexpectedError`.
4. [x] `{n} clics`/`{n} uniques` → `tracking.details.{clicksCount,uniqueCount}` (interpolation).
5. [x] Ajouter 8 clés ×4 locales (append-only, JSON valide, parité).
6. [x] Tests jest verts (30 passed / 8 skipped, inchangés).
7. [x] Résoudre la collision 65w → renuméroter 65wb, merger `main`.
8. [ ] Push, CI verte, merge `main`, supprimer la branche, MAJ `branch-tracking.md`.

## Risques / non-régression
- Mock `t` ignore le 2ᵉ arg → assertions par clé inchangées. ✅
- `t('…', { count })` : `count` numérique → `toString()` OK. ✅
- Append-only locales : aucune clé existante touchée. ✅
