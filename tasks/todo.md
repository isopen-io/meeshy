# Remédiation complète iOS — suivi (2026-07-20)

Spec : `docs/superpowers/specs/2026-07-20-ios-full-remediation-design.md`
Plan détaillé : `docs/superpowers/plans/2026-07-20-ios-full-remediation.md`

## Vague 1 — lanes parallèles (fichiers disjoints, worktrees)

- [ ] **Lane GW** — gateway notifications : GW1 posts câblés (fix majeur) · GW2 friendContentEnabled · GW3 mute fan-out · GW4 threadId/category · GW5 payload enrichi (createdAt/messageType/traduction Prisme) · GW6 appels (callsEnabled, fallback no-voip, stale-foreground) · GW7 pushSent/showPreview/DND timezone
- [ ] **Lane P-X** — présence 1/3/5 hors iOS : PX1 shared TS (recent→idle, garde 5 min) · PX2 web (maps, gating, labels, dédup users.service) · PX3 Android miroir · PX4 heartbeat gateway lastActiveAt
- [ ] **Lane P-iOS** — présence iOS : PI1 PresenceModels/PresenceStyle · PI2 PresenceManager 30 s + flips · PI3 surfaces labellisées (badge story, identity bar, a11y)
- [ ] **Lane N-iOS** — notifications iOS : NI1 busy_timeout+protection fichier · NI2 clé E2EE NSE · NI3 prePersist typé média · NI4 handler fiable + reply durable outbox · NI5 commenter depuis notifs sociales (threading : réponse→commentId, nouveau post→racine) · NI6 actions ami réelles + split catégories CALL · NI7 retry VoIP token + retrait FirebaseMessaging

## Vague 2 (après merge P-iOS)

- [ ] **Lane AV** — avatars/bannières : AV1 showsRetryButton découplé · AV2 retry silencieux + cache négatif · AV3 câblage 12 sites

## Intégration

- [ ] Reviews adversariales par lane AVANT merge ; findings confirmés corrigés en lane
- [ ] Merges ordonnés GW → P-X → P-iOS → AV → N-iOS
- [ ] Vérifs intégration : prisma generate + shared build ; gateway bun test:coverage ; meeshy.sh test ciblé + build ; xcodegen (build number préservé)
- [ ] Doc/mémoire présence (CLAUDE.md, mémoire) APRÈS CI verte
- [ ] Push main au jalon, surveiller CI (pas de push docs par-dessus)

## Annexe B — audit transverse (163 défauts dédupliqués → 23 lanes ; backlog complet : tasks/audit-backlog-2026-07-20.md + tasks/audit-notes-2026-07-20.md)

Top risks : P0 magic link connecté = fuite inter-comptes (MeeshyApp:152) · P0 changement d'avatar 100% cassé (`url` vs `fileUrl`, AttachmentUploader:105) · P0 édition profil offline → 404 infini + queue settings bloquée (ProfileView:803) · P1 clés E2EE survivantes au logout → DMs indéchiffrables (E2ESessionManager:233) · P1 pullToRefresh détruit L1+L2 avant fetch (ConversationListViewModel:1352).

### Vague 3 (après merges Vague 1 ; B2 après N-iOS ; parallèles, fichiers disjoints)
- [ ] **B1 Auth & session** (8 items, P0 magic link, mapping 401→invalidCredentials, wipe E2EE avec userId capturé, splash borné, catches APIError morts ×9 sites)
- [ ] **B2 Profil/avatar/queue** (6 items, 2 P0 : fileUrl, route /users/me ; clé avatar Zod ; effacement champs '' vs nil ; SettingsActionQueue maxAttempts) — attend merge N-iOS (OutboxDispatcher partagé)
- [ ] **B3 Liste conversations — données** (6 items : pullToRefresh fetch-then-replace, Prisme preview, champs compagnons stales, .expired porteur de données)
- [ ] **B4 Conversation ouverte — VM/envoi** (8 items : retry manuel, pagination offline, 'fr' codés en dur ×4, copie traduite)
- [ ] **B5 Feed social** (8 items : Prisme FeedPostCard, compteurs manquants, durabilité offline)

### Vague 4
- [ ] **B6 Stories** (8) · **B7 Réels/vidéo** (8) · **B8 Images & viewers SDK** (6 — attend merge AV, CachedAsyncImage partagé) · **B9 Audio SDK** (7) · **B10 Pièces jointes** (6) · **B11 Surfaces secondaires offline** (8)

### Vague 5
- [ ] **B12 Réglages/préférences** (6) · **B13 Appels retry/privacy** (8) · **B14 Robustesse noyau** (4) · **B15 Profil sheet SDK** (4) · **B16 i18n/catalogues** (8) · **B17 Détail message/SSOT** (6) · **B18 Liste conversations — vues** (7, vérifier chevauchement P-iOS) · **B19 Bulles Equatable** (2) · **B20 Deep links/join** (2) · **B21 Perf divers** (2) · **B22 Tests couverture factice** (5) · **B23 Tests CI/hygiène** (4)

## Review (à compléter en fin de chantier)
