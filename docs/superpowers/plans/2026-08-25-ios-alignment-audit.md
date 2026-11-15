# Alignement iOS — audit poussé sur 8 directives — plan d'exécution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vérifier et aligner l'app iOS sur 8 directives produit (défilement sans effet, sockets alignés, éditions effectives, contacts complets, signaux d'appel + reprise, résilience réseau des appels, bande passante, UX) SANS régression ni sous-entendu implémenté.

**Architecture:** Deux vagues. Vague A = audit multi-agents en lecture seule (11 lentilles, modèles étagés, auto-revue par agent, réfutation adversariale opus par défaut annoncé). Vague B = correctifs TDD des défauts CONFIRMÉS, dans ce worktree, par agents sans build ni git ; gate iOS/SDK/gateway tenu par l'orchestrateur avec DerivedData privé ; propositions (UX, bande passante « produit ») livrées en document, pas en code.

**Tech Stack:** SwiftUI/UIKit (MessageListViewController), MeeshySDK, Socket.IO 16, WebRTC 146, Fastify 5 gateway, packages/shared (source de vérité des événements et types).

**Spec:** la directive utilisateur du 2026-08-25 (8 points), reproduite dans `tasks/todo-ios-alignment-2026-08-25.md`.

## Global Constraints

- Worktree isolé : `/Users/smpceo/Documents/v2_meeshy-ios-align` (branche `feat/ios-alignment-2026-08-25`, base `main` = `origin/main` `ae52866a8c`). L'arbre principal `/Users/smpceo/Documents/v2_meeshy` porte le WIP non committé d'une autre session (notifications in-app) ET un `xcodebuild` vivant — interdit d'y toucher, interdit d'y lancer `meeshy.sh` (pkill global).
- Agents : lecture seule en vague A ; en vague B écriture + tests CIBLÉS seulement, **jamais** `xcodebuild`/`meeshy.sh`/`git` (mémoire : gate long avant commit ⇒ agents BLOCKED ; commits concurrents détruisent du WIP).
- Modèles par coût d'erreur : haiku (collectes), sonnet (inventaires, exécutants avec boucle de retour jest), opus (analyses iOS sans boucle de retour, revue adversariale). Fable réservé à l'orchestration.
- Aucun effet visuel retiré hors de ce que la directive 1 nomme (effets PENDANT le défilement du fil). Effets tolérés : composer→bulle, entrée de message, `Message.effectFlags`.
- Aucune feature implicite : un `proposal` se documente, ne s'implémente pas.
- iOS 16 : `adaptiveOnChange`, pas de `.onChange` brut ; pas de `try?` avaleur ; 4 gardes UI (catalogue 7 langues, clés mortes, pas de police fixe sous Focal, chevrons `forward/backward`).
- Prisme linguistique : jamais `translations.first` en repli.
- Gate final : `xcodebuild build-for-testing` + `test-without-building` avec `-derivedDataPath` PRIVÉ (scratchpad), phase SDK lancée à part (`MeeshySDK-Package`), gateway `bun run test` sur les suites touchées + `test:coverage` complet avant merge.

---

## Vague A — Audit (Workflow `ios-alignment-audit-wave1`)

| Lentille | Directive | Modèle | Sortie |
|---|---|---|---|
| L1 défilement sans effet | 1 | opus/high | inventaire animations pendant scroll × 3 modes, verdict toléré/à retirer, coûts par frame |
| L2a inventaire socket | 2 | sonnet | tables serveur→client / client→serveur / dérive noms / dérive payload |
| L2b couverture par mode | 2 | opus/high | matrice feature temps-réel × Focal/Script/Rivière |
| L2c socket social | 2 | sonnet | émis/écouté/état mis à jour, présence, notifications 2 étages |
| L3a éditions profil/contact/lien | 3 | sonnet | chaîne UI→VM→SDK→route→Prisma→réponse→cache |
| L3b éditions conversation/message/communauté | 3 | sonnet | idem |
| L4 contacts complets | 4 | sonnet | chaîne + contrat de lots pour les 3 clients |
| L5 signaux d'appel + reprise | 5 | opus/high | 13 scénarios S1–S13 avec verdict |
| L6 résilience réseau appels | 6 | opus/high | geler ≠ couper : émetteur, récepteur, transport, seuils |
| L7 bande passante | 7 | opus/high | statut BW1–8/QW/S + inventaire neuf classé, `safe_now` |
| L8 UX | 8 | opus/medium | carte des parcours, features enfouies, propositions |

Chaque lentille : auto-revue obligatoire (relecture de chaque `fichier:ligne`, recherche de sa propre réfutation, purge du hors-lentille et des sous-entendus). Chaque `defect`/`risk` passe ensuite par un sceptique opus (verdict `confirmed`/`refuted`/`uncertain`, `refuted` par défaut).

- [ ] Lancer le workflow, lire le `promptPreview` du premier agent (piège `args` → chemin interpolé littéralement dans le script)
- [ ] Revue COMPLÈTE des résultats (porte obligatoire avant la vague B) : vérifier moi-même chaque `confirmed` contre le code
- [ ] Consigner les `refuted` avec la raison ; classer les `confirmed` par directive et par risque de régression

## Vague B — Correctifs (plan détaillé écrit APRÈS la revue de la vague A)

Règle de découpage : une tâche = un défaut confirmé = un test rouge → vert → commit par chemins explicites (orchestrateur). Ordre : gateway/shared (boucle de retour jest, sonnet) → iOS SDK → iOS app (opus). Les tâches connues d'avance, à confirmer par L4/L6 :

- [ ] **Contacts complets** — `ContactSyncService.readEntries()` ne tronque plus ; envoi par lots (taille = `MAX_CONTACTS_PER_SYNC` gateway) avec `replace` au premier lot puis `merge` ; `DirectoryPaging.maxPages` remplacé par un arrêt sur `hasMore == false` ; même contrat pour `contacts/match`. Tests : `ContactSyncServiceTests` (lots, ordre replace→merge, idempotence), gateway `contacts-directory` (lot N accepté sans troncature silencieuse).
- [ ] **Appel sous mauvais réseau** — `VideoSurvivalPolicy` conservée ; l'ACTION `.suspend` gèle l'encodeur (framerate plancher, bitrate plancher, pas de retrait de piste ni renégociation) et signale l'état au pair ; récepteur : dernière image conservée + indicateur discret ; `.resume` sans renégociation. Tests : `VideoSurvivalControllerTests` (actions), `CallManager` (pas de `replaceTrack` sur suspend), `CallView` (placeholder avatar uniquement sur coupure volontaire).
- [ ] Tâches issues de L1, L2, L3, L5, L7 — écrites après la revue.

## Livrables documentaires (pas de code)

- `docs/audits/2026-08-25-ios-alignment-audit.md` — résultats A par directive, confirmés/réfutés, statut de chaque correctif.
- `docs/audits/2026-08-25-ios-ux-proposals.md` — L8 + propositions bande passante « produit » (L7 non `safe_now`).

---

## Vague B — plan détaillé (écrit après la revue de la vague A, 2026-08-25)

Résultats A : 11 lentilles, 30 défauts + 10 risques + 15 améliorations + 15 propositions ; 35 confirmés / 5 réfutés par les sceptiques ; sondages orchestrateur concordants (digest : `docs/audits/2026-08-25-ios-alignment-audit-digest.md`).

### Décisions d'arbitrage (orchestrateur, à confirmer par le porteur produit)
- **L1-02 variante (ii)** : le report des reconfigurations pendant le geste vaut aussi en mode Bulles (coches/réactions/éditions arrivées pendant un geste apparaissent à la pose) — la directive 1 est une règle de fluidité, pas de mode. Garde négative ajoutée.
- **L1-01** : `truncateLimit` constant (512) ; `decisions.md:328` amendé. Le plafond 360 du focus tombe (la règle « aucune hauteur ne dépend du focus » l'emporte).
- **L6-4** : `maxReconnectAttempts` 3 → 6 (~60 s, sous la grâce socket serveur 90 s). Coût nommé : +30 s de « Reconnexion… » sur une panne MÉDIA à socket vivant.
- **L6 (gel ≠ coupure)** : aucun nouvel événement socket ; le pair garde la dernière image (RTCMTLVideoView) ; la pastille « Réseau faible » existante reste le seul indicateur (couverture partielle assumée : la passerelle ne l'émet que sur RTT/perte).
- **L4 (contacts complets)** : protocole par lots, filigrane de purge GÉNÉRÉ PAR LE SERVEUR et renvoyé au client (un `syncStartedAt` client comparé à `lastSyncedAt` serveur purgerait ses propres lots dès que l'horloge du téléphone avance).
- **L8-D3** : le bouton d'envoi prend l'accent de la conversation (règle CLAUDE.md) ; les trois autres hôtes passent leur `secondaryColor` ; l'état éphémère/effet teinte le bouton comme il teinte déjà la barre.
- **Documentés, non implémentés** (propositions) : L5-F1 bannière globale « Reprendre » (`/calls/active`), L5-F3 appels de groupe iOS, L5-F4 grâce serveur vs redémarrage, 2b-3 Résumé Vivant instantané, 2b-5 Rivière R-4, 2b-6 fantôme Rivière, 2b-8 position en direct, 2b-7 Résumé (Rivière traité), L1-06/07/08, L6-5, L7 proposals (BW-GW-02/03, BW-IOS-08/11), L8-P1…P5, 3b community-settings (route morte), 3a suivi `isAnonymous ?? true`.

### Grappes (un agent = une grappe = des fichiers que personne d'autre ne touche)

| Grappe | Modèle | Constats | Fichiers principaux |
|---|---|---|---|
| A fil de messages | opus/high | L1-01, L1-02(ii), L1-03, L1-04, L1-05, 2b-4 | MessageListViewController, MessageListLayout, FocalRow, FocalScrollPerspective, decisions.md, tests Focal + `MessageListSeenTrackingModeGateTests` |
| B VM conversation + SDK cache/sync | opus/high | 2b-1, 3b message-edit, BW-IOS-04, BW-IOS-05 | ConversationViewModel, ConversationSocketHandler, SDK CacheCoordinator, MessagePersistenceActor, ConversationSyncEngine |
| C vue conversation + Résumé + Rivière | opus | 3b conv-settings, 2b-2, 2b-7 (Rivière), L8-D1 (partie app) | ConversationView(+Header), ConversationInfoSheet, RiverStreamHost, LivingSummary* |
| D SDK sockets/auth/amis/notifs | opus | BW-IOS-01, BW-IOS-07, auth-session-revoked, friend-request cancelled+rejected, notification bulk | MessageSocketManager, SocialSocketManager, AuthManager, FriendshipCache, NotificationToastManager |
| E feed/stories | opus | BW-IOS-02, BW-IOS-03, 2c-F1, 2c-F3, BW-IOS-09, L8-D3 (FeedCommentsSheet `secondaryColor`) | StoryViewModel, FeedViewModel, FeedCommentsSheet, PostDetailViewModel, FeedSocketHandler, BackgroundTaskManager |
| F profil iOS | opus | 3a-F1, 3a-F2 pas 2 | ProfileView |
| G contacts iOS | opus/high | L4 F1+F4 (lots), F3 (plafond 5 000) | ContactSyncService, PhonebookViewModel, DiscoverViewModel, SDK ContactDirectory*/ContactMatch* |
| H appels iOS | opus/high | L5-F2, L6-1, L6-2, L6-4, L6-6 | CallManager, WebRTCService, P2PWebRTCClient, WebRTCTypes, tests appels |
| I appels web | sonnet | L6-3 | VideoCallInterface, use-per-peer-video-tier, use-webrtc-p2p, webrtc-service |
| J UX/esthétique | opus | L8-D1 (SDK), L8-D2, L8-D3, L8-I1 | UniversalComposerBar, PostDetailView, StoryViewerView+Canvas, ContactsShared/ListTab, ConversationPreferencesTab, MeeshyAvatar, UserIdentityBar, 2 catalogues |
| K1 gateway profil | sonnet | 3a-F2 pas 1 | routes/users/profile.ts + test |
| K2 gateway contacts | sonnet | L4 contrat par lots | routes/users/contacts-directory.ts, services/ContactDirectoryService.ts, types partagés + tests |

### Contrat contacts par lots (G ↔ K2)
- Requête `POST /users/me/contacts/sync` : champs existants + optionnels `syncStartedAt: string(ISO)` et `isFinalBatch: boolean`.
- Réponse : champs existants + `syncStartedAt: string(ISO)` = horloge SERVEUR prise à la réception, AVANT les upserts, toujours renvoyée.
- Serveur : si `syncStartedAt` ou `isFinalBatch` présent ⇒ mode d'upsert forcé `merge` (jamais la purge `notIn`) ; `watermark = syncStartedAt ?? receivedAt` ; si `isFinalBatch === true` ⇒ `deleteMany({ ownerId, lastSyncedAt: { lt: watermark } })` ; `syncStartedAt` dans le futur ⇒ 400 ; plus vieux que 24 h ⇒ purge ignorée (`removedCount: 0`). Les upserts posent `lastSyncedAt = now()` dans les deux modes (à vérifier/garantir). Sans ces champs : comportement historique inchangé (dont la rétrogradation replace→merge d'un lot tronqué).
- Client : plus de troncature ; lots de `batchSize` (= 2000, `MAX_CONTACTS_PER_SYNC`) ; lot 1 sans jeton (mode `merge`), lots suivants avec le `syncStartedAt` renvoyé, dernier lot `isFinalBatch: true` (un seul lot ⇒ il est premier ET final). Résultat agrégé. `contacts/match` : lots concaténés côté client. Lecture : `DirectoryPaging.maxPages` 25 → 250 (filet, journalisé).

### Ordre d'exécution
1. Workflow B (12 agents, écriture, sans build ni git) → 2. revue adversariale opus par grappe sur le diff → 3. corrections → 4. gate orchestrateur : `xcodegen generate`, `build-for-testing` (DerivedData privée), suites ciblées puis complètes app + SDK, jest gateway ciblé puis complet, vitest web → 5. commits par grappe (chemins explicites) → 6. PR.
