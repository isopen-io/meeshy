# Audit d'alignement iOS — 8 directives — 2026-08-25

Compagnons : `2026-08-25-ios-alignment-audit-digest.md` (constats bruts, verdicts des sceptiques) · `2026-08-25-ios-ux-and-bandwidth-proposals.md` (propositions, décisions produit attendues) · plan `docs/superpowers/plans/2026-08-25-ios-alignment-audit.md`.

## Méthode
- **Vague A** — 11 lentilles en lecture seule (sonnet pour les inventaires, opus pour les analyses à fort coût d'erreur), auto-revue imposée, puis un sceptique opus par lentille : 30 défauts + 10 risques + 15 améliorations + 15 propositions ; **35 confirmés, 5 réfutés**. Sondages orchestrateur concordants.
- **Vague B** — 12 grappes de correctifs TDD à fichiers disjoints (9 opus iOS sans boucle de retour, 3 sonnet gateway/web avec jest), puis **revue adversariale opus par grappe** (4 blockers, 12 majors, ~15 mineurs — tous appliqués sauf 2 refus motivés), puis gate.
- Worktree `../v2_meeshy-ios-align`, branche `feat/ios-alignment-2026-08-25` (base `main` = `ae52866a8c`).

## Résultat par directive

### 1. Fil de messages fluide, sans effet au défilement
| Constat | Verdict | Correctif |
|---|---|---|
| L1-01 Focal : la rangée élue changeait de HAUTEUR en plein momentum (plafond 360 caractères sous focus vs 512) — l'invariant « aucune hauteur ne dépend du focus » qui autorise la reconfiguration au tick d'élection était faux | confirmé | `truncateLimit` constant (`BubbleExpandableText.truncateLimit`), `decisions.md` amendé, garde négative |
| L1-02 Bulles : les reconfigurations de cellules visibles n'étaient pas différées pendant le geste (une traduction/réaction faisait sauter le fil sous le doigt) | confirmé | **décision (ii)** : la règle de fluidité vaut dans tous les modes — report pendant le geste, flush à la pose ; garde négative |
| L1-03/04/05 gaspillages par frame (sur-réserve `focalOverscan` d'une compaction non appliquée, géométries construites avant la garde d'armement, `indexPathsForVisibleItems` recalculé 2-3×) | — | appliqués, sans effet visible ; A5 corrigé en reprise (inventaire partagé seulement sur la branche sans `setContentOffset`) |
| 2b-4 accusés de lecture émis pour des messages jamais affichés (liste UIKit vivante sous les panes Rivière/Résumé) | confirmé | prédicat `rendersThread` aux quatre sites de suivi + re-notation au retour, timer conservé |
| L1-06/07/08 (révélé des heures/coches, carte élue mobile, Rivière republiant les cadres par frame) | proposals | documentés (arbitrage produit ; patron « relais par référence » pour la Rivière) |

Les trois effets tolérés : (c) `effectFlags` intact ; (a) envol composer→bulle et (b) animation d'entrée **n'existent pas aujourd'hui** (directive ROULEAU 2026-08-18) — rien n'a été retiré.

### 2. Sockets messagerie et social — alignement et couverture par mode
- Inventaire : 121 événements serveur→client, 58 client→serveur ; **zéro dérive de nom** iOS ↔ shared ; payloads critiques conformes.
- Défauts corrigés : `auth:session-revoked` non écouté (révocation forcée jamais appliquée — écouteur + `AuthManager.handleSessionRevoked()` sans re-armement de session) ; `friend-request:cancelled` / `:rejected` non écoutés (FriendshipCache + invalidation persistée) ; `notification:read-bulk` / `deleted-bulk` non écoutés (mapping pur vers `NotificationReadScope` existant, republication par les subjects existants) ; comment:* reçus à distance sans réécriture du cache ; repost STORY persisté dans la table du fil (secours hors-ligne) ; **la traduction arrivée après coup ne basculait jamais la bulle** (cache de résolution du Prisme empoisonné — invalidation portée par le champ) ; Résumé Vivant né vide en mode d'ouverture ; frappe absente en Rivière (bandeau de peau, hors loi des couloirs).
- Réfutés : `friend_rejected` legacy (aucun émetteur), `call:initiated.conversationTitle` (proposal), bannière de post consulté (proposal).
- Documentés : 2b-3 (Résumé instantané), 2b-5 (Rivière R-4), 2b-6 (fantôme), 2b-8 (position en direct : 5 sites), portée `friendRequestId` non représentable côté iOS.

### 3. Modifications effectives (profil, conversation, message, communauté, lien, contact)
- Routes gateway saines ; défauts côté client : l'apply optimiste du profil effaçait 7 champs ; 4 sites iOS remplaçaient `currentUser` en bloc par une réponse plus pauvre (`voicePublic` perdu — corrigé sur ProfileView, ProfileCompletionUploader ET `AuthManager.updateUserAfterRevalidation`/`applySession`) ; les routes avatar/bannière tronquaient la réponse (`formatUserResponse` partagé, test par sérialisation réelle) ; la conversation ouverte gardait l'ancien titre/avatar après édition (`liveConversation`) ; l'édition d'un message laissait la traduction périmée dans QUATRE caches dont deux persistants, et sous deux espaces d'ids (temp/serveur) ; contact (email/téléphone, blocage) et lien : conformes.
- Suivi documenté : `currentUser?.isAnonymous ?? true` prive tous les inscrits du mode Résumé (lot distinct).

### 4. Synchroniser TOUS ses contacts
- Réel : troncature à 2 000 côté device ET gateway, envoi unique en `replace` ⇒ **suppression silencieuse et récurrente** des contacts au-delà de la fenêtre ; lecture plafonnée à 5 000.
- Livré : protocole par lots avec **filigrane serveur** (`syncStartedAt` renvoyé par le lot 1, `isFinalBatch` ⇒ purge `lastSyncedAt < watermark`, watermark borné à `receivedAt`, lot tronqué jamais final, > 24 h ignoré), client sans troncature (lots de 2 000, repli `merge` sur gateway antérieure), match par lots, lecture 25 → 250 pages journalisées. 18 tests iOS + 11 gateway.

### 5. Signaux d'appel et reprise après redémarrage
- Couverts avec preuve des deux côtés : VoIP→CallKit→join fiable (buffer 150 s), socket vivant en arrière-plan, call waiting, reconnexion socket (grâce 30 s × 4), redémarrage gateway (réhydratation), dédup fin d'appel, symétrie web/iOS, offre bufferée, freshness/`call_cancel`.
- Corrigé : `reportIncomingVoIPCall` mutait l'état de l'appel EN COURS avant sa garde « busy » (2ᵉ sonnerie VoIP corrompait le premier appel).
- Réfuté : « aucune reprise globale après relance » — le message système « Appel en cours » et « Rejoindre » dans l'en-tête existent ; bannière globale via `GET /calls/active` en proposition. Propositions : appels de groupe iOS, grâce serveur vs redémarrage du téléphone.

### 6. Appels stables sous mauvais réseau — geler, ne pas couper
- Réel : la couche de survie iOS ET web **coupaient** la vidéo (piste retirée, renégociation) et l'annonçaient au pair comme une coupure caméra volontaire ⇒ avatar à la place de la dernière image.
- Livré (iOS) : le gel est un ÉTAT de `WebRTCService` (`survivalFloorActive`) substitué au palier dans `applyVideoQuality` (résiste aux ré-applications palier/thermique et à la ré-acquisition `upgradeToVideo`), plancher 2 fps · bitrate minimal · `maintainResolution`, plus aucune renégociation ni `media-toggled`, cinq gardes `isVideoSuspended` ramenées à hold+interruption, dégel sur le front descendant du contrôleur (9 `reset()` couverts), budget de reconnexion 3 → 6 (≈ 80 s pire cas < 90 s de grâce socket). Web : palier `frozen` comme ENTRÉE de `usePerPeerVideoTier`, tuile locale qui garde l'image gelée. Pastille « Réseau faible » existante = seul indicateur (couverture partielle assumée).
- Proposals : priorité réseau vidéo, tableau des seuils.

### 7. Bande passante
- Roadmap de mai largement soldée côté serveur/HTTP ; trois mécanismes existants **non branchés** corrigés : `.compress` jamais passé aux sockets iOS (permessage-deflate inerte), prefetch stories/feed ignorant `MediaDownloadPolicyEngine` (vidéo/audio entiers sur cellulaire — saut réversible au retour du Wi-Fi), `markAsReceived` un POST par message (coalescé 1 s / conversation), battement social nu retiré, préchargement d'arrière-plan gardé Wi-Fi.
- Non fait, motivé : `?languages=` (l'exploration AUDIO des autres langues dépend des pistes hors prisme servies par la liste — deux voies documentées).
- Proposals : traductions vers les 4 rangs de chaque participant, variantes d'avatars, prefetch de 20 conversations, Firebase Performance.

### 8. UX et esthétique
- Défauts corrigés : 9 libellés français en dur (menus d'avatar), puces de filtre Contacts non localisées, bouton d'envoi hors accent de conversation (avec second arrêt cohérent chez les quatre hôtes), hex bruts.
- Propositions (document dédié) : langue principale à 5 gestes, auto-traduction introuvable en conversation directe, micro à 2 gestes, accès rapides en queue de liste, tuile « Voir mes contacts ». Mesure de contraste signalée : glyphe blanc < 3:1 sur 11/39 accents vibrants — décision produit.

## Gates (worktree `../v2_meeshy-ios-align`, simulateur dédié iOS 18.2)
| Gate | Résultat |
|---|---|
| gateway `tsc --noEmit` | 0 erreur |
| gateway jest (876 suites) | 4 rouges sous la charge des 12 agents → **95/95 verts à la relance** (timeouts, flake prouvé) |
| web jest (793 suites) | 5 rouges sous charge → **100/100 verts à la relance** ; `tsc` : erreurs PRÉEXISTANTES hors de nos fichiers, aucune ajoutée |
| iOS phase 0 SDK (`MeeshySDK-Package`) | 3 975 + 3 557 tests, **0 échec** (1er passage). Relances après les correctifs post-revue : passage 2 rouge sur 3 cas → une suite neuve laissait une fixture dans `AuthManager.shared.currentUser` (corrigé : snapshot/restauration) ; passage 3 rouge sur 4 cas → résidu de l'outbox App Group laissé par le gate APP sur le même simulateur + purge de caches simulateur par une session voisine (environnement) ; passage 4 sur simulateur effacé : voir ligne suivante |
| iOS phase 0 SDK — passage 4 (simulateur effacé) | `MeeshyUITests` 3 557 verts ; `MeeshySDKTests` 3 975 dont **1 rouge de timing** (`OfflineQueueOutcomeTests`, mock dispatcher, fichiers non touchés par la branche) — 17/17 verts en relance isolée des deux classes outbox : flake (ensembles d'échec disjoints sur 4 passages) |
| iOS build-for-testing (app + bundle de tests, ~117 fichiers) | 1 erreur au 1er build (isolation `nonisolated` d'un carnet de contacts), **0 au 2e** ; garde d'orphelins `nm` : 0 classe absente |
| iOS phase 1 (isolées) | **3 509 verts / 1 rouge** (garde de source sur une mention de `RiverStreamHost` dans un commentaire — corrigée) / 5 sautés |
| iOS phase 2 (contenu, 422 classes) | **4 905 verts / 0 rouge** |
| iOS phase 3 (session connectée, login réel) | **1/1 vert** |
| Relance ciblée après revue A+C (21 classes A/C + gardes Rivière) | build vert ; **227 verts / 0 rouge** après réécriture de 4 témoins qui supposaient « rien ne part sous le pane » (F1 dit l'inverse : ce qui a été acquis avant part) |


### Après fusion de `main` (14 commits arrivés pendant le chantier — frappe avec visage, bannières in-app, gateway/shared/android)
| Gate | Résultat |
|---|---|
| Fusion | 1 seul conflit textuel (`TypingIndicatorBubble` : `internal` + `participants:`), câblage Rivière adapté ; 8 fichiers auto-fusionnés audités (catalogues JSON valides, aucune déclaration en double) |
| gateway `tsc` + suites profil/contacts | 0 erreur ; 130/130 |
| web suites appels | 406/406 |
| iOS phase 0 SDK (passage 5, simulateur vierge, sous charge jest concurrente) | `MeeshyUITests` verts ; `MeeshySDKTests` 1 rouge : `OfflineQueuePendingUIItemsPublisherTests.test_publisher_emits_one_after_enqueue_send_message` (« 2 rows ≠ 1 ») — **rouge 3 passages sur 5 sur un code d'outbox strictement identique à `main`**, vert isolé 17/17 : flake, à durcir dans un lot dédié (compte exact d'un publisher sur `OfflineQueue.shared`) |
| iOS build + phases 1-3 après fusion | build vert, 0 orphelin ; **phase 1 = 3 513 / 0 · phase 2 = 4 913 / 0 · phase 3 = 1 / 0** ; le test SDK flaky rejoué isolé : 8/8 |
| PR | #3515 vers `main`, mergeable après fusion ; CI en cours au moment de la rédaction |
