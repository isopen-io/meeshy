# Confidentialité de la présence — plan d'exécution (2026-08-25)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hors amitié, personne ne voit ni mon état en ligne ni ma dernière connexion — seule mon ACTIVITÉ dans une conversation (m'écrire / répondre : frappe, message) révèle que je suis en ligne ; ADMIN et au-dessus voient toujours.

**Architecture:** Une seule loi, déjà en place mais trop large — `resolvePresenceVisibility` (`packages/shared/utils/presence-visibility.ts`) résolue par `PresenceVisibilityService` (gateway) — resserrée (amitié acceptée OU soi OU ADMIN+ ; le partage d'une conversation ne donne plus rien) et rendue OBLIGATOIRE : `resolvePrefsOnly` (préférences seules, aveugle au viewer) disparaît, chaque site de service passe par la résolution viewer-aware, et le broadcast `user:status` / `presence:snapshot` filtre par DESTINATAIRE. Les clients ne fabriquent rien : présence absente ⇒ aucun point (règle existante « offline = pas de pastille »).

**Tech Stack:** gateway Fastify 5 + Socket.IO + Prisma ; shared TS (zod) ; clients iOS / web / Android (vérification, pas de nouvelle logique).

**Spec:** directive utilisateur du 2026-08-25 (ci-dessus). Worktree `../v2_meeshy-presence`, branche `feat/presence-privacy-2026-08-25` (base `origin/main` 55d364d58b).

## Global Constraints
- TDD strict (jest gateway/shared) ; aucun `any` ; schémas Fastify de réponse à jour (un champ absent du schéma est tronqué).
- La règle vit en UN site (`resolvePresenceVisibility`) ; les sites de service ne réécrivent JAMAIS la boucle.
- Frappe (`typing:start/stop`) : inchangée — c'est l'activité que la directive autorise à révéler.
- Rôles : ADMIN, BIGBOSS = privilégiés ; MODERATOR et en dessous = comme un utilisateur.
- Anonymes (viewer sans compte) : présence toujours cachée.
- Clients : vérifier qu'aucune surface ne fabrique une présence quand `isOnline` est faux/nul et `lastActiveAt` nul, et que les caches ne rejouent pas une présence reçue avant (snapshot).

## Décisions
- Charges `message:new` / listes de messages : la présence de l'EXPÉDITEUR y est projetée par destinataire quand la charge est par destinataire, sinon `isOnline` = activité (il vient d'écrire) et `lastActiveAt` = null (voir inventaire).
- `resolvePrefsOnly` est SUPPRIMÉE (pas dépréciée) : une porte laissée ouverte est une porte réutilisée.

## Tâches (écrites après l'inventaire — voir § ci-dessous)

## Inventaire (2026-08-25, 3 agents) — synthèse
- Clients (iOS, web, Android) : aucune surface ne fabrique de présence quand `isOnline` est faux/nul et `lastActiveAt` nul ; le forçage « frappe = en ligne » (iOS `PresenceManager.noteActivity`, web `typing.service`) est l'activité que la directive autorise. **Aucune modification client.**
- Gateway : la loi `resolvePresenceVisibility` existe (soi / `isGlobalModerator` / ami / `sharesConversation`) ; les listes de conversation, messages, communautés (co-membre), stories (auteur lié) et le snapshot/statut socket contournent l'amitié (`resolvePrefsOnly`, audience = rooms) ; 4 trous sans aucune gate ; routes admin servies à MODERATOR/AUDIT/ANALYST.

## Tâches
### W1 — loi + service (séquentiel)
- [ ] `packages/shared/utils/presence-visibility.ts` : privilégié = `isSelf || isGlobalAdmin(viewerRole)` ; autorisé = privilégié || `areConnected` ; suppression de `sharesConversation` de l'entrée ; tests shared réécrits (MODERATOR/AUDIT/ANALYST ne voient pas ; co-participant ne voit pas).
- [ ] `PresenceVisibilityService` : `isGlobalAdmin` ; suppression de `sharesConversation`/`allowConversationContext` ; `resolvePrefsOnly` marquée `@deprecated` (supprimée en W3) ; tests.
- [ ] `GET /users/presence` : ids de participants ANONYMES gatés (cachés sauf ADMIN+) ; option conversation retirée ; tests.
- [ ] `services/gateway/decisions.md` : décision « présence = amis / soi / ADMIN+ ».
### W2 — sites de service (parallèle, fichiers disjoints)
- [ ] W2a conversations : `core.ts` ×3, `participants.ts` (liste, rôle, **profil de participant** = trou #1, charge `PARTICIPANT_ROLE_UPDATED` sans présence), `search.ts`, `sharing.ts`, `messages.ts` ×3 → `resolveForTargets(viewerFromAuthContext)`.
- [ ] W2b `routes/messages.ts` (`reveal` → viewer), historique d'appels (trou #3 : `CallService.listHistory` / `callHistory.ts`), liens publics (trou #4 : `anonymousParticipants.isOnline` redacted comme les membres).
- [ ] W2c communautés : `members.ts` (co-membre → STRICT), `membership.ts`, `member-presence.ts` (`gateCoMemberPresence`), `community-member-presence.ts` (régime par ligne → STRICT), `search.ts`, `core.ts` (`/communities/:id/conversations` + trou #2 `POST …/conversations/:conversationId`).
- [ ] W2d socket : `_broadcastUserStatus` → audience = rooms `user:<id>` des AMIS acceptés + ADMIN/BIGBOSS connectés + soi (plus de rooms de conversation ; anonyme : aucun broadcast hors ADMIN+) ; `_emitPresenceSnapshot` → `resolveForTargets(viewer)` (rôle du viewer relu) ; tests audience.
- [ ] W2e stories (`resolveStoryAuthorPresence` : lien ≠ amitié ⇒ STRICT) + admin (`canViewPresence` = ADMIN/BIGBOSS dans `permissions.service`, `sanitizeUser`, `GET /admin/conversations/:id/participants`).
### W3 — clôture
- [ ] suppression de `resolvePrefsOnly` + garde de source (0 appelant) ; `CLAUDE.md` § Présence (règle de visibilité) ; suites shared + gateway complètes ; revue opus ; commit ; PR.
