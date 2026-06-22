# Plan d'itération 64wb (web) — Anti-pattern `t()||fallback` Magic Link

**Base** : `main` HEAD (post-merge #846 / iter-63w cluster).
**Branche** : `claude/practical-fermat-3pti6c`
**Surface** : `app/auth/magic-link/page.tsx` (+ 4 locales `auth.json`)

## Objectif
Solder un lot self-contained et orthogonal du cluster anti-pattern `t('clé') || 'fallback FR'` (~40 fichiers restants) : la page Magic Link (46 occurrences), sans collision avec les 6 PR web en vol.

## Étapes
1. [x] `git fetch` + `list_pull_requests` → confirmer orthogonalité (aucune PR ne touche magic-link).
2. [x] Vérifier présence des clés `auth.magicLink.*`/`register.*`/`login.*` ×4 locales (0 manquante sur le lot).
3. [x] Transformation mécanique `t(k) || 'FR'` → `t(k, 'EN exacte')` (45×) ; suppression du `||` mort sur les 2 clés à paramètres.
4. [x] Bug `featureGate.backToHome` (hors namespace `auth`) → nouvelle clé `auth.magicLink.backToHome` ×4 + référence corrigée.
5. [x] Insertion chirurgicale de la clé locale (préserver formatage ; pas de re-sérialisation JSON globale).
6. [x] Vérifs : grep résiduel = 0, JSON valides, échappement apostrophes, aucun test impacté.
7. [ ] Commit + push branche + PR + merge dans `main` après CI verte.
8. [ ] Mettre à jour `branch-tracking.md` (nouvelle base, historique) ; supprimer la branche après merge.

## Garde-fous
- Valeurs EN reprises **mot pour mot** du locale (anti-flash + cohérence FR/EN — leçon 50w).
- Ne PAS re-sérialiser les JSON en entier (formatage d'origine inconsistant → diff massif/conflits). Insertion par ligne.
- Surface orthogonale : NE PAS toucher feed/reels/modales/banners/audio-effects/voice-profile/_archived/details-sidebar/me (PR en vol ou soldés).

## Résultat
Voir `docs/analyses/uiux/2026-06-22-iteration-64wb.md`. Lot soldé, page entièrement i18n + anti-flash. Reste du cluster (~39 fichiers) → itérations ultérieures par lots bornés.
