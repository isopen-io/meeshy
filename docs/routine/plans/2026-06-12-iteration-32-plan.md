# Iteration 32 — Plan d'implémentation (2026-06-12)

## Objectif
Optimiser le chemin chaud d'envoi de message côté gateway : supprimer l'instanciation par message de `PrivacyPreferencesService` (fuite de timers + cache mort), batcher/paralléliser l'auto-delivery, fusionner les deux requêtes participants, paralléliser la validation des attachments. Aucun changement de contrat (events, payloads identiques).

## Étapes (TDD : RED → GREEN sur le test existant `MessageHandler.autoDeliver.test.ts`)

### Phase 1 — Injection du service privacy partagé
- [ ] Ajouter `privacyPreferencesService: PrivacyPreferencesService` à `MessageHandlerDependencies` + champ privé (`MessageHandler.ts`)
- [ ] Passer `this.privacyPreferencesService` depuis `MeeshySocketIOManager` (création du `MessageHandler`)
- [ ] Supprimer le `await import(...)` + `new PrivacyPreferencesService(...)` dans `_autoDeliverToOnlineRecipients`

### Phase 2 — Auto-delivery batché et parallèle
- [ ] Mettre à jour le test : mock injecté `getPreferencesForUsers` (remplace le module mock `shouldShowReadReceipts`), mock participants unique (tous actifs, sender inclus)
- [ ] Requête unique `participant.findMany({ conversationId, isActive: true })` ; destinataires dérivés (`id !== senderId`, en ligne) ; fan-out rooms dérivé de la même liste
- [ ] Privacy en batch : `getPreferencesForUsers(onlineRecipients)` puis filtre `showReadReceipts`
- [ ] `markMessagesAsReceived` en `Promise.allSettled` ; `firstAcker` = premier fulfilled dans l'ordre des destinataires ; warn sur les rejets
- [ ] Tests verts : `pnpm --filter gateway test -- MessageHandler.autoDeliver`

### Phase 3 — Validation attachments parallèle
- [ ] `Promise.all(attachmentIds.map(getAttachment))` puis détection du premier invalide (même message d'erreur `Attachment ${id} invalid`)

### Phase 4 — Vérification & livraison
- [ ] `tsc` gateway sans erreur (`pnpm --filter gateway build` ou `npx tsc --noEmit`)
- [ ] Suite jest unitaire gateway ciblée verte
- [ ] Commit + push `claude/inspiring-euler-0agvk8`, PR vers `main`, CI verte, merge

## Hors périmètre (consigné dans l'analyse, itérations futures)
- F1/F6 : cap participants + gardes pagination sur `GET /conversations/:id` (validation clients requise)
- F2 : activation par défaut de `SOCKET_LANG_FILTER` (validation staging)
- F3-F5 : refactors web (stores Zustand selectors, pollings admin → Socket.IO, lazy recharts/mermaid)

## Continuité
Iter 33+ : reprendre F1+F6 (API conversations), puis F2 (bande passante multilingue), puis lot web F3-F5.
