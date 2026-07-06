# Iteration 59 — Plan d'implémentation (2026-07-01)

## Objectif
Lot « Source unique — temps restant avant expiration (F28) » : extraire `formatTimeRemaining`
(`apps/web/utils/time-remaining.ts`) et converger `StatusBar` + `StoryViewer` dessus, sans changer
la sortie visible.

## Pré-requis runner (parité CI)
- [x] `bun install` (jest web présent).
- [x] Baseline : `story-viewer-comments.test.tsx` (rend `StoryViewer`) **5/5** vert.
- [x] Aucun test ne verrouille `getTimeRemaining` / le bloc inline `StoryViewer`.

## Étapes (délégation → vérification)

### Phase A — Source unique
- [x] `utils/time-remaining.ts` : `formatTimeRemaining(expiresAt: string|number|Date, nowMs = Date.now())`
      → `${h}h${m}m` / `${h}h` / `${m}m` pour délai > 0, `null` si ≤ 0. Pure, `nowMs` injectable.
- [x] Test `__tests__/utils/time-remaining.test.ts` (8 cas).

### Phase B — Convergence StatusBar
- [x] Import `formatTimeRemaining` ; supprimer `getTimeRemaining` local.
- [x] `const timeRemaining = formatTimeRemaining(status.expiresAt) ?? 'Expire';` (libellé préservé).

### Phase C — Convergence StoryViewer
- [x] Import `formatTimeRemaining` ; remplacer le bloc inline par
      `const r = formatTimeRemaining(story.expiresAt); if (!r) return null; return <span…>{r}</span>;`.

### Phase D — Vérification & livraison
- [x] `jest time-remaining.test.ts` **8/8** ; `story-viewer-comments.test.tsx` **5/5**.
- [x] `tsc --noEmit` : aucune erreur sur les 3 fichiers touchés.
- [ ] Commit + push `claude/sharp-wozniak-9e5y85` ; PR vers `main` ; CI verte ; **merge**.

## Hors périmètre (consigné dans l'analyse)
- `DeliveryQueueItemCard.formatCountdown` (granularité seconde).
- F26c-c(c), F25b, F2, F10, F21.

## Continuité
Iter 60 : nouveau scout. Pistes : `formatCountdown` seconde (si 2ᵉ site apparaît), slug/url, sanitize,
validateurs téléphone (F25b).

## Incidents de merge (parallélisme multi-agents)
- Plusieurs agents tournent (tracks initiales + iOS). Les numéros d'itération **ne sont pas réservés** :
  re-vérifier `origin/main` juste avant le merge ; si le slot de docs iter-59 est pris, renuméroter
  (le code de cette piste — `utils/time-remaining.ts`, `StatusBar`, `StoryViewer` — est disjoint des
  autres tracks, donc jamais en conflit de code).

## Statut (mis à jour en fin d'itération)
- [x] Phase A / B / C — util extrait + testé, deux convergences appliquées, sortie préservée.
- [x] Phase D — tests + tsc verts ; reste : commit + push + PR + CI + merge.
