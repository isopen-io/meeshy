# Tâche — Digest e-mail → réengagement magic-login (2026-05-30)

**Branche** : `claude/message-sync-notifications-LYtcU`
**Statut** : IMPLÉMENTÉ (TDD) — tests verts, tsc 0 erreur.
**Spec** : `docs/superpowers/specs/2026-05-30-email-digest-reengagement-magic-login-design.md`

## ⚠️ RE-PLAN majeur (cohérence) — la spec d'origine planifiait un DOUBLON

Pendant l'implémentation, vérification du code réel : un magic-login COMPLET
existe déjà. La spec proposait de tout reconstruire (MagicLoginToken,
AuthService.consume/generate, endpoint /auth/magic, page web) → abandonné au
profit de la réutilisation (Single Source of Truth).

Existant réutilisé :
- `MagicLinkService.requestMagicLink()` / `validateMagicLink()` — émet déjà
  JWT 24h + session + device tracking + security events
- Modèle `MagicLinkToken` (schema.prisma:1974) — SHA-256, usedAt, isRevoked
- Endpoints `/api/v1/auth/magic-link/request|validate` (GET+POST)
- Page web `apps/web/app/auth/magic-link/validate/page.tsx` — lit `?token` +
  `?returnUrl`, clamp open-redirect via `safeInternalPath(returnUrl,'/dashboard')`

## Décisions actées (utilisateur)
- TTL du lien digest : **24 h** · Intégration : **étendre MagicLinkService** ·
  Teaser : **compteurs seuls** (pas d'acteur/aperçu)

## Implémentation (TDD RED→GREEN)
- [x] **Phase A** — `MagicLinkService.issueLoginTokenForUser(userId, {ttlMinutes})` :
  frappe un token pour un user connu, réutilise révocation+hash+create, TTL 24h
  défaut, SANS e-mail, renvoie token brut ou null. (+9 tests)
- [x] **Phase B** — `EmailService.sendNotificationDigestEmail` : champ `magicUrl`
  (remplace `markAllReadUrl`/`notifications`), copy teaser compteurs-seuls,
  clés i18n `teaserIntro`/`linkValidity`/`buttonText` (fr/en/es/pt/it/de).
  Suppression liste acteur+aperçu. (+8 tests). Dead code retiré : `formatTimeAgo`.
- [x] **Phase C** — `notification-digest.ts` : injecte MagicLinkService, issue le
  token, calcule returnUrl (conversation la + récente via `context.conversationId`)
  + conversationCount distinct, construit
  `${frontendUrl}/auth/magic-link/validate?token=…&returnUrl=…`. Fallback gracieux
  sans token si échec. Idempotence inchangée. (+7 tests). Dead code retiré :
  `SYSTEM_NOTIFICATION_LABELS`, `resolveDigestEntry`, `MAX_NOTIFICATIONS_IN_EMAIL`.
  Wiring `jobs/index.ts` (construit MagicLinkService via getCacheStore+GeoIPService).
- [x] **Phase D** — Web : AUCUN changement requis (returnUrl + safeInternalPath
  déjà en place). Vérifié.

## Vérification
- [x] `MagicLinkService|EmailService|notification-digest` : 103/103 verts
- [x] Suite gateway complète : 3263 passed ; 6 échecs PRÉ-EXISTANTS
  (`PostFeedService`, `mark-conversation-status`) confirmés sur base via stash —
  non liés à ce changement.
- [x] `tsc --noEmit` gateway : 0 erreur (après build de @meeshy/shared)

## Hors périmètre (non fait, cf. spec §7/§8)
- List-Unsubscribe RFC 8058 (exigerait d'étendre EmailData.headers + 3 transports)
- UTM / events de mesure · rollout graduel
