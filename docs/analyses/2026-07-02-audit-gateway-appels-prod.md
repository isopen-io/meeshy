# Audit gateway prod — appels (fenêtre 04:52 → 07:39 UTC, 2026-07-02)

> Généré par un audit multi-agents (4 lentilles : lifecycle, VoIP/offline, signaling, erreurs ;
> chaque finding sérieux contre-vérifié par un vérificateur adversarial — 22 confirmés, 1 réfuté).
> Source : logs `meeshy-gateway` prod (dump 2231 lignes).

# Rapport d'audit consolidé — Appels Gateway Production
**Fenêtre analysée : 2026-07-02 04:52:39Z → 07:39:47Z (2h47 réelles, et non 4h — activité d'appel concentrée entre 06:25:49 et 07:37:41)**
Source : `/private/tmp/claude-504/-Users-smpceo-Documents-v2-meeshy/3c4b215c-7a3a-4224-94ae-20c08bda9d31/scratchpad/gateway-calls-4h.log` (2231 lignes)

---

## 1. Chiffres clés

| Métrique | Valeur |
|---|---|
| Appels initiés (`call:initiate`) | **17** (17 callIds uniques, 3 conversations, 4 users, tous audio sauf 1 vidéo) |
| Appels aboutis (answer + signaling bidirectionnel) | **6/17 (35 %)** — 4 terminés proprement (80 s, 278 s, 262 s, 153 s), 1 tué par rate-limit ICE, 1 encore actif en fin de log |
| Missed (ringing timeout 60 s) | **4/17 (24 %)** |
| Appels anormaux | **7/17 (41 %)** ; appels sans conversation réussie : **9/17 (53 %)** |
| Taux de handshake WebRTC (appels ayant sonné) | **~38 % (5/13)** |
| **Chemin VoIP push (notifiedSockets=0)** | 7 appels, 14/14 APNS success, réveil prouvé 5/7, **call:join 0/7 → 100 % d'échec** |
| **Chemin socket temps réel (notifiedSockets>0)** | 10 appels, **call:join 10/10** (latence 0,4–2,5 s), 0 missed |
| Signaling | 392 reçus (22 offer, 15 answer, 355 ICE), 363 forwardés, **29 perdus (7,4 %)** = 26 « Sender not a participant » (1 seul appel) + 3 rate-limit ICE |
| Toggles média (audio/vidéo) | **14/14 échecs de persistance DB (100 %)** |
| Summaries postés | 15 = 10 ended + 4 missed + **1 DOUBLON** ; **3 appels sans summary** (…e6, …e8, …be) |
| Erreurs / warnings | 0 ERROR, 46 WARN |
| Bruit | 708 lignes disconnect (32 %), churn socket quasi exclusif du user 68f2a814 ; 23 force-leave dont 21 à vide |
| Qualité média | 2 appels quasi 100 % « poor » (RTT moyens 490 ms et 1426 ms) |

---

## 2. Incohérences CONFIRMÉES (par ordre de sévérité)

### CRITIQUE

**C1. Chemin VoIP push : 0/7 call:join — 100 % d'échec de connexion du destinataire réveillé par push**
callIds : `6a46046d…92de`, `6a4604d8…92e2`, `6a460686…92e6`, `6a4606bf…92e8`, `6a461091…934c`, `6a46110c…9350`, `6a46115d…9356`
Les 7 appels avec `notifiedSockets=0` ont déclenché un VoIP push (14/14 APNS success, 2 tokens/destinataire). 5/7 destinataires prouvés réveillés (`REST: Getting call details` 0,35 s à 36 s après le push, ex. 06:35:22.402, 07:17:38.672, 07:19:41, 07:21:03). **Aucun n'a émis `call:join`.** Issues : 4 missed par timeout (ex. `…934c` : summary missed à 07:18:37.514), 2 force-ended sans trace, 1 étiqueté « completed » durée 0.
**Preuve du cas actif (…e6, cible directe du Fix 11)** : push à 06:34:46.774 → REST à 06:35:22.402 → le callee décroche et flushe **26 signaux (1 offer + 25 ICE) en 2 ms** (06:35:37.570→.592) **sans call:join préalable** → 26 WARN « Sender not a participant in call » (les 26 seuls du log) → client `failed("Not in call room")` à 06:35:37.785 → force-end à 06:35:43.191 avec `wasPreAnswered:true`. Le rejet n'est pas dû à un appel terminé (force-end 6 s APRÈS les signaux). Retry `…e8` : même sort. 3e essai `…ea` réussi car le callee y émet call:join AVANT de signaler (06:36:39). Nota : les 2 appels vers 69d72d41 n'ont produit aucune réaction (tokens périmés / device éteint probables).

### ÉLEVÉE

**C2. Rate-limit ICE gateway tue une jambe d'appel active — le client traite le throttle comme fatal, appel enregistré « completed »**
callId : `6a461199…935c`
3 WARN « Socket.IO rate limit exceeded » (counts 51/52/53, clé `socket:call:ice`) à 07:22:33.364 → 382 ms après, analytics callee `endReason: failed("Too many ICE candidates — slow down")`, `durationSeconds: 2.05`, `setupTimeMs: 28807` (07:22:33.746) → active→reconnecting (07:22:42.697) → terminé « completed » durée 50 s (07:22:53.136), les users relancent un appel à 07:23:13.
Vérifié dans le code : `CallEventsHandler.ts:1516-1529` émet `call:error RATE_LIMIT_EXCEEDED` ; `CallManager.swift` (~l.3040) fait `endCallInternal(.failed)` sur TOUT `call:error` sauf `INVALID_SIGNAL`. **Précision corrigée : la limite est 50 par fenêtre de 5 s** (`CALL_ICE_CANDIDATE`, `windowMs:5000`), pas 50/s — soit ~10/s effectifs, épuisés par un flush de gathering légitime (les clients flushent 15-25 candidats par milliseconde, pattern observé sur `…e6`, `…ea`, `…935c`). Échec masqué en « completed » dans les stats.

**C3. Appels « completed » sans AUCUN answer — signaling strictement unidirectionnel, durée serveur fabriquée**
callIds : `6a4607a9…92ee`, `6a4607bb…92f2`
Le callee joint (06:39:38.001 pour …ee) mais ne renvoie jamais d'answer : …ee = 1 offer + 27 ICE unidirectionnels ; …f2 = 3 offers (+1 replay buffer) + 54 ICE, 0 answer (15 answers loggées ailleurs dans le fichier — pas un artefact de logging). Analytics des deux côtés : `durationSeconds:0`, `setupTimeMs:-1`. Cause visible : **double join multi-socket du callee** (sockets stjOtIcs… + FTiQYiaI…, WARN « User already in call » 06:39:38.151 et 06:39:58.607) dont les 2 sockets émettent `endReason:"remote"` ~0,4 s après le join (06:39:38.487/.489, AVANT même le relais de l'offer à .644) — les 2 instances client croient que le distant a raccroché. …f2 est terminé (06:40:25.429, durée 29) alors que le statut était `reconnecting` (attempt 2 à 06:40:23.332, jamais passé `active`). Summaries « completed » 13 s / 29 s postés pour des appels sans média : la machine à états accepte connecting/reconnecting → ended(completed) et la duration = temps depuis initiate.

**C4. Appels duration=0 étiquetés « completed » au lieu de missed/cancelled — notifications missed perdues**
callIds : `6a46115d…9356`, `6a461313…9378`, `6a461326…937c`
…9356 : jamais de join (VoIP push), appelant raccroche après ~35 s de sonnerie → « Call ended successfully, duration:0, endReason:completed » à 07:21:36.714, summary « completed ». …9378 : analytics appelant `endReason:"local"` à 07:28:20.414 **AVANT** le call:join du callee (07:28:20.543), end à 07:28:20.669. …937c : join 07:28:39.345 → end 07:28:39.734. Cause code confirmée : `CallService.endCall()`/`resolveEndReason()` défaulte à `completed` sans la garde pré-décrochage→missed que `leaveCall()` implémente (fix Audit P1-29) — le client émet `call:end` et contourne le fix. Aucune ligne « Missed call notifications created » pour ces 3 appels (contraste : les 4 timeouts en ont). Historique et filtre « missed » faussés.

**C5. updateParticipantMedia : 14/14 échecs de persistance — état mute/vidéo jamais écrit en DB**
callIds : `6a4606f6…92ea`, `6a4607bb…92f2`, `6a4607ee…92f6`, `6a4611e2…936a`
100 % des toggles (12 vidéo + 2 audio) produisent le WARN « no active CallParticipant, skipping DB flag » (ex. 06:37:06.170, 07:25:22.555), aucun succès dans le log ; appels bien actifs au moment des toggles. Le broadcast temps réel fonctionne, mais tout late-join/re-sync lit un état média faux. **Cause racine (contre-analyse code)** : l'ID passé (Participant/membre de conversation) est bien l'entrée attendue par `resolveActiveCallParticipantId` ; la vraie anomalie est que `findFirst({leftAt: null})` (`CallService.ts:1285`) ne matche jamais les CallParticipant créés **sans** champ `leftAt` (sémantique Prisma-MongoDB null vs missing/isSet) — cohérent avec un taux d'échec de exactement 100 %.

### MOYENNE

**C6. Double call:ended → summary dupliqué persisté en DB + index unique d'idempotence ABSENT en prod**
callId : `6a4611e2…936a` (appel sain de 262 s, 7 cycles offer/answer de renégociation vidéo, chacun answeré <2,2 s)
Raccrochages à 465 ms d'écart : end + summary à 07:27:37.624/.650, puis 2e « Ending call » 07:27:38.077 → WARN « Call already ended » .080 → **2e « Call summary message posted » .103** + 2e broadcast « Call ended by user » .110. La garde (`CallService.endCall:1092-1095` retourne au lieu de throw) ne court-circuite pas les effets de bord du handler (`CallEventsHandler.ts:1905-1942`). **Aggravant vérifié en base prod** : deux documents Message persistés (même `clientMessageId: call-summary:…936a`), et l'index unique partiel `(conversationId, clientMessageId)` **n'existe pas** (`getIndexes`) — la migration `2026-05-09-message-client-id.mongodb.js` utilise `$ne:''` en `partialFilterExpression`, non supporté par MongoDB. La dédup offline-queue des messages ordinaires est donc probablement cassée aussi.

**C7. Chemin force-leave « Idempotent leave » : appel terminé sans summary NI notification missed — aucune trace UX pour le destinataire**
callIds : `6a460686…92e6`, `6a4606bf…92e8`
Force-ends à 06:35:43.191 et 06:36:38.211 (`wasPreAnswered:true`) : aucun des 15 summaries ni des lignes « Missed call notifications created » ne concerne ces callIds. Cause code : le handler `call:force-leave` (`CallEventsHandler.ts:~1429`) ne déclenche summary/broadcast que si `status === 'ended'`, or l'idempotent-leave pré-answer termine en `'missed'` ; `handleMissedCall` n'y est jamais appelé — contrairement au handler `call:leave` qui traite `'ended' || 'missed'` (fix P1-29). Seul chemin terminal sans trace ; le callee de …e6 avait pourtant décroché. (La CallSession est bien persistée `missed` en DB — le Recents la montrerait, mais ni push ni bulle.)

**C8. Join dupliqué multi-socket du même user — fan-out du signaling vers 2 sockets, analytics double-comptées**
callIds : `6a4607a9…92ee`, `6a4607bb…92f2`
User 68f2a814 avec 2 sessions socket simultanées (`notifiedSockets:4` pour 2 membres) joint deux fois (WARN « User already in call » 06:39:38.151 et 06:39:58.607). Le gateway est idempotent (même participantId, replay du buffered offer à 06:39:58.618) mais les offers partent en `targetSockets:2` (risque de glare/double handling) et chaque device émet ses analytics en double. Corrélé directement aux échecs C3.

---

## 3. Findings réfutés

- **« 7/22 offers (32 %) sans answer = incohérence de signaling »** — RÉFUTÉ : le protocole client émet `call:join` dès la sonnerie et l'offer part sur `participant-joined` AVANT tout décrochage (`CallManager.swift` l.1121-1134, l.3235) ; une offer sans answer est la signature normale d'un appel non décroché, et le contre-exemple est dans la preuve même (…935c : offers « orphelines » 26 s puis answer, `setupTimeMs 28807` = temps humain de décrochage) ; l'heuristique « offer sans answer sous 5 s = peer mort » couperait tout décrochage lent.

---

## 4. Recommandations concrètes (classées)

**P0 — Restaurer le chemin VoIP push (C1)**
1. **iOS (Fix 11)** : garantir la séquence `call:join` → `call:signal` au décrochage via VoIP push (cold start inclus) ; bloquer le flush de la queue de signaling tant que l'ack du join n'est pas reçu.
2. **Gateway (défense)** : sur signal d'un membre légitime non-joint d'un appel vivant, soit auto-join, soit bufferiser et répondre par une erreur explicite `JOIN_REQUIRED` (au lieu du drop silencieux « Sender not a participant »).
3. **Hygiène tokens** : purger les tokens VoIP sandbox résiduels (2 tokens/destinataire dont sandbox) et investiguer les 2 destinataires sans aucune réaction (69d72d41 — tokens périmés ?).

**P1 — Rate-limit ICE (C2)**
4. **iOS** : traiter `call:error RATE_LIMIT_EXCEEDED` comme non-fatal (dropper le candidat, retry pacé) — l'ajouter à la whitelist comme `INVALID_SIGNAL` dans `CallManager.swift`.
5. **Gateway** : dimensionner `CALL_ICE_CANDIDATE` pour absorber un flush complet de gathering + renégociation (ex. 150/5 s), ou paced-flush côté client.

**P1 — Sémantique de fin d'appel (C3, C4)**
6. Aligner `endCall()` sur `leaveCall()` (P1-29) : end en `initiated/ringing/connecting` sans passage par `active` → `missed`/`cancelled`, jamais `completed` ; déclencher `handleMissedCall`.
7. Duration = temps en `active`, pas temps depuis initiate ; interdire `reconnecting → ended(completed)` sans retour actif.

**P1 — Persistance média (C5)**
8. Corriger `findFirst({leftAt: null})` : écrire `leftAt: null` explicitement au create du CallParticipant ou filtrer avec `isSet: false` ; ajouter un test d'intégration Mongo sur ce chemin.

**P2 — Idempotence de fin (C6, C7)**
9. Court-circuiter les effets de bord (summary + broadcast) après la garde « Call already ended » dans le handler `call:end`.
10. **Appliquer l'index unique partiel `(conversationId, clientMessageId)` en prod** — corriger la migration (`$ne:''` non supporté en partialFilterExpression) ; vérifie aussi la dédup offline-queue.
11. Handler `call:force-leave` : traiter `status === 'missed'` comme `call:leave` (summary + notifications + broadcast).

**P3 — Robustesse & observabilité**
12. Investiguer le phantom « remote ended » 0,4 s après join sur double-socket (C3/C8) : dédup des sessions client, vérifier la consommation d'un `call:ended` parasite du call précédent.
13. Dédupliquer l'ingestion `call:analytics` (callId+userId) et valider le contrat en Zod (endReason énuméré, sentinelles -1, cohérence isVideo/codec).
14. Réduire le churn socket du user 68f2a814 (708 disconnects/2h45) ; vérifier le tier GC heartbeat (aucun heartbeat loggé sur 2h45) et le devenir de l'appel `…8193be` sans fin dans la fenêtre ; corréler les RTT 490/1426 ms avec la config TURN.
