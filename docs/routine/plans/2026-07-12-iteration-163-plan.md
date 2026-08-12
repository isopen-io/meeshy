# Iteration 163 — Plan d'implémentation (2026-07-12)

## Objectif
Deux fixes web pure-logic indépendants remontés par le fan-out Explore :
- **A (F132)** : `formatContentPublishedAt` délègue le bornage jour à la SSOT
  DST-safe `calendarDayDiff` au lieu d'un delta fixe de 24 h.
- **B (F133)** : `formatVideoDuration` factorise la composante heures (parité
  `formatAudioDuration`).

## Modules affectés
- `apps/web/utils/notification-helpers.ts` (A) + son test.
- `apps/web/components/conversations/conversation-item/message-formatting.tsx` (B)
  + son test.

## Phases
1. **A** — remplacer `startOfToday`/`startOfYesterday` par `calendarDayDiff` ;
   retirer l'import `startOfLocalDayMs` inutilisé ; +2 tests régression
   (bucket « heures aujourd'hui », bucket « avant-veille absolu »). ✅
2. **B** — brancher `hours > 0` comme `formatAudioDuration` ; +2 tests
   (≥ 1 h factorisé, < 1 h inchangé) via `formatLastMessage`. ✅
3. **VALIDATION** — jest (92/92) ; tsc sans nouvelle erreur (35==35). ✅

## Dépendances
Aucune (`calendarDayDiff` déjà importé/utilisé dans le fichier A ; B est local).

## Risques estimés
Très faibles. A délègue à la SSOT déjà employée par la fonction sœur ; B recopie
la jumelle audio. Parité stricte hors des cas défectueux.

## Rollback
Revert des commits (2 fichiers de prod + 2 de test).

## Statut
- [x] Analyse / Plan
- [x] A : fix + tests
- [x] B : fix + tests
- [x] Validation (jest + tsc)
- [ ] Commit + push

## Améliorations futures (backlog)
- Primitive `formatDuration` commune audio/vidéo (refactor).
- `utils/pagination.ts:51` `hasMore` off-by-one.
- `routes/admin/messages.ts:262` `/trends` buckets heure locale vs UTC.
