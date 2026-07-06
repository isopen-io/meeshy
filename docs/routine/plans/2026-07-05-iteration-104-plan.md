# Iteration 104 — Plan d'implémentation (2026-07-05)

## Objectifs
Corriger **F71** : `PUT`/`DELETE /user-preferences/communities/:id` (pin/mute/archive/hide/rename
d'une communauté) ne diffusent aucun événement Socket.IO, contrairement à leur jumeau strict
`conversation-preferences.ts` — un second onglet/appareil du même utilisateur reste périmé jusqu'à un
refetch manuel.

## Modules affectés
- `packages/shared/types/socketio-events.ts` — nouveau `CommunityPreferencesPayload` +
  `UserPreferencesCommunityUpdatedEventData`, ajoutés à l'union `UserPreferencesUpdatedEventData`.
- `services/gateway/src/routes/community-preferences.ts` — `toPreferencesPayload` + `broadcastToUser`
  sur `PUT`/`DELETE`.
- `services/gateway/src/routes/conversation-preferences.ts` — suppression d'un commentaire obsolète
  contredisant le code (drive-by, 2 lignes).
- `apps/web/hooks/queries/use-socket-cache-sync.ts` — nouvelle branche `communityId` dans le handler
  `onPreferencesUpdated`.
- Tests : `services/gateway/src/__tests__/community-preferences-broadcast.test.ts` (nouveau),
  `apps/web/__tests__/hooks/queries/use-socket-cache-sync.test.tsx` (2 cas + mock élargi).

## Phases
1. **RED** — `community-preferences-broadcast.test.ts` (3 cas : PUT émet, DELETE émet reset:true, 404
   n'émet pas). 2/3 rouges avant fix. ✅
2. **GREEN (gateway)** — type d'événement + `toPreferencesPayload` + 2 `broadcastToUser`. ✅
3. **GREEN (web)** — branche `communityId` dans `use-socket-cache-sync.ts` + 2 tests (invalide,
   n'invalide pas sur la variante `category`). ✅
4. **Validation croisée** — `bun run build` (shared), `tsc --noEmit` (gateway + web), suites ciblées
   `preferences`/`community` des deux packages. ✅
5. **Docs** — analyse + plan + Leçon. ✅
6. **Commit + push + PR** vers `claude/ecstatic-archimedes-lthq8x`.

## Dépendances
Aucune migration Prisma (pas de champ `version` ajouté à `UserCommunityPreferences` — le consommateur
web invalide son cache plutôt que de réconcilier un snapshot optimiste versionné, donc pas besoin du
même contrat que le scope conversation).

## Risques estimés
Très faibles. Émission additive (nouvel event dans une union existante, `broadcastToUser` déjà
best-effort/no-op silencieux si Socket.IO absent). Aucun contrat existant modifié, aucun champ renommé.

## Stratégie de rollback
Revert du commit unique — 4 fichiers de code + 2 fichiers de test, aucune donnée persistée, aucune
migration à défaire.

## Validation criteria
- [x] RED prouvé (gateway, `.inject()` Fastify réel).
- [x] GREEN gateway : nouveau fichier 3/3, `community-preferences-routes.test.ts` 18/18 non régressé,
      motif `preferences` gateway complet 394/394.
- [x] GREEN web : `use-socket-cache-sync.test.tsx` 45/45, `use-socket-cache-sync.test.ts` 5/5, motif
      `community` web complet 70/70.
- [x] `packages/shared` : `bun run build` 0 erreur.
- [x] `tsc --noEmit` gateway + web : 0 nouvelle erreur (bruit préexistant documenté, non lié).
- [ ] CI verte après push.

## Completion status
- [x] F71 implémenté (gateway + shared + web), testé, documenté.
- Candidats écartés documentés (réactions de messages sans check blocage — symétrique REST/socket, pas
  un drift ; `MESSAGE_EDITED`/`MESSAGE_DELETED` — audités propres).

## Progress tracking
- Itération 104 : F71 (community-preferences broadcast manquant). **DONE** (en attente merge).

## Future improvements
- F71b (LOW) : `POST /user-preferences/communities/reorder` toujours silencieux — nécessite un event
  dédié plutôt que réutiliser `USER_PREFERENCES_REORDERED` (payload typé `conversationId`, consommé
  explicitement par `ConversationStore.applyRemoteReorder` côté iOS).
- F71c (LOW) : scope `conversationId` de `UserPreferencesUpdatedEventData` toujours non consommé côté
  web (déjà tracké par son propre commentaire dans `use-socket-cache-sync.ts`).
- F69 (LOW) : `sanitizeFileName` plafond 255 sur nom sans extension (latent, 0 appelant).
- F70 (LOW) : `deepCleanTranslationOutput` apostrophes FR (code mort, 0 appelant).
- F68b (LOW) : parité iOS des initiales (à confirmer saine).
