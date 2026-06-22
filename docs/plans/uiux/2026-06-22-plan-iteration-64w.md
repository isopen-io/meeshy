# Plan — Itération 64w (web only)

**Surface** : i18n + tokens de thème sur le tooltip de profil vocal (`TranscriptionViewer`).
**Base** : `main` HEAD `a08fed7` (post iter-63w #856). Branche `claude/practical-fermat-ypjp47`.

## Objectif
Solder l'unique bloc hors charte de `components/audio/TranscriptionViewer.tsx` (déjà
i18n partout ailleurs) : le `TooltipContent` de profil vocal par locuteur, qui
contenait ~12 chaînes **FR figées** et 10 `text-gray-{400,500}` **non theme-aware**.
Surface **orthogonale** aux clusters i18n/Badge/empty-state/feed/reels en vol.

## Étapes
1. [x] Revue analyses/plans + sync `main` (iter-63w #856 mergé, base `a08fed7`).
2. [x] Identifier la surface orthogonale (audit `gray-*`/FR hors empty-states ;
   éviter audio « studio » dark-glass intentionnel).
3. [x] `locales/{fr,en,es,pt}/audioEffects.json` : ajouter `transcription.voiceProfile.*`
   (12 clés ×4 locales, parité stricte).
4. [x] `TranscriptionViewer.tsx` : littéraux FR → `t('transcription.voiceProfile.*')`.
5. [x] `TranscriptionViewer.tsx` : `text-gray-{400,500}` ×10 → `text-muted-foreground`.
6. [x] Valider JSON (4× `JSON.parse`), parité clés (12/12/12/12), grep résiduel = 0.
7. [x] `validate-i18n-structure.sh` : confirmer 0 régression (erreurs zh/conversations
   pré-existantes, identiques avant/après).
8. [x] Docs analyse + plan + `branch-tracking.md`.
9. [ ] Commit, push, PR ; CI verte ; merge `main` ; supprimer la branche.

## Non-objectifs (hors scope, documentés)
- Panneaux d'effets audio sur **dark-glass fixe** (`AudioEffectTile`,
  `AudioEffectsBadge`, `AudioEffectsTimelineView`, `AudioEffectsGraph`,
  `AudioEffectsOverview`) — `gray-900`/`white`/`gray-400` = UI sombre **intentionnelle**
  (décision design), NE PAS migrer.
- Aucun changement de comportement, de dépendance, ni de logique d'analyse vocale.
- Cluster `t()||fallback` (31 fichiers) — pris par agents parallèles.

## Critères de succès
- 0 chaîne FR figée et 0 `text-gray-*` dans `TranscriptionViewer.tsx`.
- Parité stricte des 12 clés `voiceProfile` sur les 4 locales.
- `validate-i18n-structure.sh` sans erreur **nouvelle** (audioEffects intact).
