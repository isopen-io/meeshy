# Plan d'implémentation E2EE — État de l'art & conformité DMA

**Date** : 2026-08-13 · **Statut** : PROPOSED (ADR à ratifier en Phase 0)
**Prérequis de lecture** : `docs/audits/2026-08-13-e2ee-implementation-audit.md` (17 findings, sévérités, preuves fichier:ligne). Ce plan est la réponse structurée à cet audit.

---

## 1. Ce que font les leaders (état de l'art vérifiable)

| Capacité | Signal | WhatsApp | Messenger (Meta) | Enseignement pour Meeshy |
|---|---|---|---|---|
| Établissement de session | **PQXDH** (X3DH hybridé ML-KEM/Kyber, depuis 2023) | X3DH (protocole Signal, whitepaper 2016+) | Protocole Signal | Ne jamais réécrire l'AKE soi-même ; utiliser libsignal qui livre PQXDH |
| Messagerie continue | **Double Ratchet** (forward secrecy + post-compromise security) | Double Ratchet | Double Ratchet | Idem — le ratchet est le cœur non négociable |
| Groupes | Ratchet par paire + fan-out client | **Sender Keys** (clé d'expéditeur distribuée par sessions par paire) | Sender Keys | Sender Keys = SOTA pragmatique ; MLS = SOTA émergent (RFC 9420) |
| Multi-appareil | **Sesame** (registre d'appareils, sessions par appareil) | Identité par appareil, liste d'appareils signée par le téléphone primaire (2021) | Par appareil | Une identité par appareil, jamais de partage de clé privée entre appareils |
| Annuaire de clés | Serveur = distribution uniquement | **Key Transparency** (annuaire auditable AKD, 2023) | Key transparency (déployé progressivement) | Le serveur ne détient JAMAIS de clé privée ; l'annuaire devient auditable |
| Vérification d'identité | Safety numbers (QR + décimal) | Safety numbers | Comparaison de clés | Indispensable contre le MITM du serveur de clés (finding #3 de l'audit) |
| Historique / backup | Local + backup chiffré | Backup chiffré adossé à un HSM (2021) | **Labyrinth** (stockage serveur chiffré, whitepaper 2023) | Le stockage serveur d'historique E2EE est résoluble (Labyrinth) mais en phase tardive |
| Post-quantique | PQXDH ; (cf. aussi iMessage **PQ3**, 2024) | En cours | En cours | Gratuit si on prend libsignal ≥ 0.x actuel (PQXDH intégré) |
| Bibliothèque | **libsignal** : cœur Rust, bindings **Swift** (SPM), **Java/Android**, **TypeScript (Node)** | Implémentation interne compatible | Implémentation interne compatible | Un seul cœur crypto, des bindings officiels pour chacune de nos plateformes |

**Constat central** : aucun leader ne fait de crypto maison côté protocole. Tous convergent sur le protocole Signal (PQXDH + Double Ratchet + Sender Keys), avec MLS (RFC 9420, portée par l'IETF et le groupe **MIMI** pour l'interopérabilité) comme standard d'avenir pour les groupes fédérés.

### L'angle DMA — pourquoi libsignal EST la voie élégante

Le règlement DMA impose aux *gatekeepers* (Meta) d'ouvrir l'interopérabilité. **L'offre de référence de Meta (mars 2024) exige que les tiers utilisent le protocole Signal** (ou prouvent une équivalence stricte) pour se connecter à WhatsApp/Messenger. Autrement dit :

> Adopter libsignal officiel pour la messagerie native de Meeshy **est simultanément** le ticket d'entrée pour l'interop DMA avec WhatsApp/Messenger. Un seul stack, deux usages. Pas de pont, pas de double implémentation.

Le plan DMA actuel du repo (`docs/dma-interoperability/DMA_IMPLEMENTATION_PLAN.md`, pari MLS-first avec X3DH/Double Ratchet maison sur P-256 — mort et non interopérable, cf. audit finding #8) est **inversé** par ce plan : Signal/libsignal d'abord (natif + interop Meta), MLS en veille active via MIMI (Google Messages/RCS annonce la même trajectoire). La couture est préparée en Phase 1 : le gateway devient un **annuaire de clés + relais de ciphertext opaque, agnostique au protocole** — un jour `protocol: "signal"` ou `protocol: "mls"` dans l'enveloppe, même infrastructure.

### Traduction × E2EE — préserver le Prisme Linguistique

C'est LE différenciateur Meeshy et la vraie difficulté : personne dans l'industrie ne traduit côté serveur du contenu E2EE (c'est contradictoire par définition). La résolution élégante :

1. **Mode `e2ee` : traduction côté émetteur, sur l'appareil.** Le fan-out par paire du protocole Signal joue pour nous : l'expéditeur chiffre déjà une enveloppe **par destinataire** (par appareil). Il connaît les langues préférées déclarées des participants (métadonnées de conversation déjà présentes). Il traduit **localement** (iOS : framework Apple Translation / modèle NLLB distillé CoreML ; Android : modèle on-device ; web : modèle WASM léger) et place dans l'enveloppe de chaque destinataire : l'original + la traduction correspondant à sa langue. Le Prisme est préservé à l'identique — le destinataire lit dans sa langue, peut voir l'original — et le serveur ne voit jamais un octet de clair.
2. **Repli honnête** : si le modèle on-device n'est pas disponible (vieux device, langue non couverte), le message part chiffré **sans** traduction ; le destinataire voit l'original avec l'indicateur discret habituel. Jamais de dégradation silencieuse vers du plaintext.
3. **Modes `server`/`hybrid`** : pipeline de traduction serveur actuel, conservé, mais **étiqueté honnêtement** (« chiffré en transit et au repos » — pas « bout en bout »). Le choix du mode reste par conversation, immuable, comme aujourd'hui.

---

## 2. Architecture cible (décision à ratifier en ADR)

```
┌────────────── Clients (iOS, Android, Web) ──────────────┐
│  libsignal officiel (bindings Swift / Java / WASM)      │
│  PQXDH + Double Ratchet + Sender Keys + Sesame          │
│  Traduction on-device (mode e2ee)                       │
│  Clés privées : Keychain/Keystore, jamais exportées     │
└───────────────┬─────────────────────────────────────────┘
                │ ciphertext opaque + enveloppe typée
┌───────────────▼─────────────────────────────────────────┐
│  Gateway = 3 rôles, AUCUNE crypto E2EE :                │
│   1. Annuaire de clés (bundles publics, signature       │
│      vérifiée, pool d'OTPK consommables)                │
│   2. Relais/queue de ciphertext (Socket.IO + REST)      │
│   3. Coffre serveur (modes server/hybrid, inchangé)     │
│  → agnostique protocole (signal aujourd'hui, mls demain)│
└───────────────┬─────────────────────────────────────────┘
                │ (mode e2ee : translator JAMAIS sollicité)
        MongoDB : bundles PUBLICS, messages chiffrés,
        aucune colonne de clé privée
```

Principes non négociables (issus de l'audit) :
- **Le serveur ne détient jamais de clé privée** → suppression des colonnes `identityKeyPrivate`/`signedPreKeyPrivate`/`preKeyPool.privateKey` (finding #7).
- **Fail-closed partout** : plaintext rejeté en conversation `e2ee` (finding #5), pas de repli plaintext silencieux client (audit iOS 🟠 DEBUG).
- **Une seule implémentation par plateforme** : le code Signal maison (~4 000 L mort : `dma-interoperability`, `node-signal-stores`, `browser-signal-stores`, MVP CryptoKit) est supprimé au fil des phases, jamais maintenu en parallèle.
- **UI honnête** : le cadenas n'apparaît que lorsqu'une session E2EE fonctionnelle existe (finding #1/#2).

---

## 3. Plan step-by-step

Chaque étape suit le TDD du repo (RED → GREEN → REFACTOR), livre un incrément fonctionnel, et cite les fichiers touchés. Les phases 2/3/4 sont parallélisables par équipe plateforme après la Phase 1.

### Phase 0 — Assainissement & honnêteté (1 semaine) — P0 de l'audit

Objectif : arrêter de mentir à l'utilisateur et fermer les trous serveur, sans nouvelle crypto.

| # | Étape | Fichiers | Test d'acceptation |
|---|---|---|---|
| 0.1 | Rejeter (422) le plaintext entrant en conversation `e2ee` — remplacer le `logger.warn` | `services/gateway/src/services/message-processing/MessageProcessor.ts:188-196` | RED : message plaintext dans conv `e2ee` → aujourd'hui stocké ; GREEN : rejeté avec code d'erreur dédié |
| 0.2 | Contre-vérifier `encryptionMode`/`isEncrypted` client contre `Conversation.encryptionMode` (source de vérité serveur) | `MessageProcessor.ts:328-335`, `MessageHandler.ts:322` | Client déclarant `e2ee` dans une conv non-e2ee → rejeté |
| 0.3 | Ne plus persister le clair à côté du chiffré en `server`/`hybrid` | `packages/shared/encryption/encryption-service.ts:489` | Le document Message ne contient plus `content` en clair quand `encryptedContent` existe |
| 0.4 | Passer `conversationId` à `getOrCreateConversationKey()` (verrou TOCTOU restauré) | `services/gateway/src/routes/conversation-encryption.ts:210` | Deux activations concurrentes → une seule clé |
| 0.5 | Web : ne plus afficher le cadenas « bout en bout » (le remplacer par « chiffrement serveur » pour `server`/`hybrid`, rien pour `e2ee` tant que Phase 4 non livrée) | `apps/web/components/conversations/header/use-encryption-info.ts` | Snapshot UI : plus aucun label E2EE mensonger |
| 0.6 | iOS : supprimer le repli plaintext DEBUG | `apps/ios/Meeshy/Features/Main/Views/ConversationViewModel.swift:2684-2693` | Échec de chiffrement → échec d'envoi, en DEBUG aussi |
| 0.7 | Réintégrer les suites E2EE exclues du CI (quitte à en `skip` individuellement avec ticket) | `services/gateway/jest.config.json:18-30` | `bun run test` exécute `__tests__/e2ee/` et `integration/e2ee-full-flow` |
| 0.8 | Marquer supersédés les docs 2025-11-19, dater la roadmap | `docs/ENCRYPTION_IMPLEMENTATION_STATUS.md`, `docs/E2EE_TESTS_SUMMARY.md`, `docs/SIGNAL_PROTOCOL_ROADMAP.md` | Bandeau « SUPERSEDED par audit 2026-08-13 » |
| 0.9 | **ADR** : ratifier l'architecture cible §2 (libsignal partout, gateway sans crypto E2EE, DMA via offre de référence Meta) | `services/gateway/decisions.md`, `apps/ios/decisions.md`, `apps/web/decisions.md`, `packages/shared/decisions.md` | ADR mergée |

### Phase 1 — Gateway : annuaire durci + relais opaque (2-3 semaines)

Objectif : un serveur digne de confiance minimale — il distribue des clés publiques vérifiées et relaie du ciphertext, rien d'autre.

1. **Modèle de données** (`packages/shared/prisma/schema.prisma`)
   - Migration : supprimer `identityKeyPrivate`, `signedPreKeyPrivate` et le champ `privateKey` du `preKeyPool` de `SignalPreKeyBundle` (`:2334, :2353, :2362`). Le code DMA mort qui les écrivait part avec (étape 1.6).
   - Nouveau modèle `OneTimePreKey { id, userId, deviceId, keyId, publicKey, consumedAt DateTime? }` — pool consommable, conforme à la règle repo « nullable DateTime, pas de boolean ».
   - `SignalPreKeyBundle` devient par-appareil : clé composite `(userId, deviceId)` (préparation Sesame, Phase 6).
2. **Durcissement de l'annuaire** (`services/gateway/src/routes/signal-protocol.ts`)
   - `POST /signal/keys` : le bundle transporte désormais la **clé publique de signature** (Ed25519) ; le serveur **vérifie** `signedPreKeySignature` avant upsert (finding #13) et rejette les bundles incohérents. Champ `pqPreKey` (ML-KEM) accepté dès maintenant (nullable) pour PQXDH.
   - `GET /signal/keys/:userId` : **consomme atomiquement** une OTPK du pool (`findOneAndUpdate` sur `consumedAt: null`) ; répond avec compteur restant ; endpoint `POST /signal/keys/replenish` pour le réapprovisionnement client (WhatsApp fait exactement cela).
   - Supprimer `POST /signal/session/establish` et le `signalService` fantôme (`EncryptionService.ts:383`) : **l'établissement de session est purement client-side** dans le protocole Signal — cet endpoint n'aurait jamais dû exister. (Ferme le 503 permanent, finding #4.)
3. **Transport typé** (`packages/shared/types/socketio-events.ts:1637-1668`)
   - Ajouter à `MessageSendData` / `MessageSendWithAttachmentsData` : `encryptedPayload?: { protocol: 'signal'; envelopes: ReadonlyArray<{ recipientUserId; recipientDeviceId; messageType: 'prekey' | 'whisper'; ciphertext: string }> }` — schéma Zod, fin du cast `as unknown` (`MessageHandler.ts:322`, finding #9).
   - Le fan-out par destinataire est **fourni par l'émetteur** (client-side fan-out, comme Signal/WhatsApp) ; le gateway route chaque enveloppe vers sa file par appareil, sans lire dedans.
4. **File de distribution** : les enveloppes non délivrées persistent (collection `EncryptedEnvelopeQueue`) jusqu'à ACK de l'appareil destinataire — nécessaire car les messages `prekey` initiaux ne doivent jamais se perdre.
5. **Traduction** : en mode `e2ee`, le pipeline translator n'est pas sollicité (déjà correct, `MessageTranslationService.ts:243-262`) — verrouiller par test de non-régression.
6. **Nettoyage** : suppression de `src/dma-interoperability/` (3 193 L, P-256 mislabellé, imports cassés), `src/adapters/node-signal-stores.ts` (301 L en mémoire), `generatePreKeyBundle()` orphelin (`EncryptionService.ts:781-840`) et alignement `@signalapp/libsignal-client` sur **une seule version** (findings #8, #15, #16). Corriger le swagger `['e2e','server']` → `['e2ee','server','hybrid']` (`messages.ts:1659`).
7. **Tests** : suite d'intégration « annuaire » (upload vérifié, consommation OTPK concurrente, réapprovisionnement, autorisation conversation/amitié conservée) + tests de relais (enveloppe opaque in → out, ACK, redelivery).

### Phase 2 — iOS : libsignal officiel, remplacement du MVP (4-6 semaines)

Objectif : première paire de plateformes réellement E2EE (iOS ↔ iOS), en remplaçant le MVP CryptoKit cassé (findings #1, #3).

1. **Dépendance** : ajouter `LibSignalClient` (binding Swift officiel du repo `signalapp/libsignal`) via **SPM** dans `packages/MeeshySDK/Package.swift` — cohérent avec l'audit : SPM est le mécanisme unique, aucun CocoaPods. Retirer au passage `gem "cocoapods"` du `apps/ios/Gemfile` et supprimer le leurre `apps/ios/Package.swift` (finding #17).
2. **Stores** (TDD, protocol-first selon la règle iOS du repo) : implémenter `IdentityKeyStore`, `PreKeyStore`, `SignedPreKeyStore`, `KyberPreKeyStore`, `SessionStore`, `SenderKeyStore` de libsignal sur **GRDB chiffré** (le cache SDK existant) + Keychain pour les clés maîtresses. Namespacer par utilisateur (corrige les clés long-terme non namespacées, audit iOS 🟡).
3. **Cycle de vie des clés** : génération identité + signed prekey + pool d'OTPK (~100) + prekey ML-KEM à l'installation ; réapprovisionnement quand le serveur signale un pool bas ; rotation de la signed prekey (hebdo, comme Signal) ; wipe au logout (réutiliser le chemin `clearSessions`/`resolveWipeUserId` existant, déjà bien fait).
4. **Session & messagerie** : `SessionBuilder.processPreKeyBundle` à l'envoi initial (PQXDH — la vérification de signature du bundle est faite par libsignal, fermant le MITM du finding #3), `signalEncrypt`/`signalDecrypt` ensuite. Brancher sur les points d'entrée existants : `ConversationViewModel.sendMessage` (`:2677-2694`) et `DecryptionActor`/`LiveSessionProvider` — l'orchestration actuelle (batching, signposts, socket-first exclu) est conservée, seule la crypto change.
5. **Suppression du MVP** : `E2EEService.deriveSymmetricKey`, `E2ESessionManager.getOrCreateSession`/`deriveSessionFromIncoming` et le slot Keychain mono-directionnel disparaissent. Le NSE (`NSEDecryptor`) est ré-écrit sur le `SessionStore` partagé via l'app group.
6. **Le test qui manquait** : suite round-trip **inter-parties** — deux instances de stores, A chiffre → B déchiffre, B répond → A déchiffre, y compris premier message (prekey) et ratchet avancé. C'est l'absence exacte qui a laissé passer le finding #1.
7. **Safety numbers (v1)** : écran de comparaison de numéro de sécurité (libsignal `Fingerprint`), accessible depuis la fiche conversation. Alerte non bloquante sur changement de clé (blocage strict en Phase 7).
8. **Feature flag** : `e2ee_signal_v1` par conversation ; les conversations MVP existantes (illisibles de toute façon, cf. audit) affichent un état « re-établissement de session requis ».

### Phase 3 — Android : libsignal-android (3-4 semaines, parallèle à la Phase 2 dès la fin de Phase 1)

1. Remplir `apps/android/core/crypto` (aujourd'hui `CryptoModulePlaceholder`, 9 lignes) avec `org.signal:libsignal-android` — exactement le plan déjà écrit dans le module (« libsignal pairwise (X3DH + Double Ratchet)… Fail-closed ») et les ADR-018..020 prévues par `apps/android/ARCHITECTURE.md`.
2. Stores sur Room/SQLCipher + Android Keystore ; mêmes contrats de tests round-trip que la Phase 2 (partage des vecteurs de test).
3. Premier jalon cross-platform : **iOS ↔ Android round-trip** en staging — le vrai test du protocole.

### Phase 4 — Web : appareil lié (3-4 semaines)

Le binding TypeScript officiel de libsignal est Node-only (addon natif — c'est pourquoi `browser-signal-stores.ts` est mort, audit web). Deux options, dans l'ordre de préférence :

1. **Option A (recommandée) — cœur Rust compilé en WASM** : compiler `libsignal` (cœur Rust) vers WASM avec un binding TS minimal (sessions, encrypt/decrypt, stores IndexedDB). Précédent industriel : le client web de WhatsApp embarque le protocole complet en JS/WASM.
2. **Option B — web = appareil lié sans historique** (modèle Signal Desktop/WhatsApp Web au lancement) : le web reçoit uniquement les messages postérieurs à son enrôlement, enrôlé par QR code signé par le mobile (préfigure Sesame, Phase 6).

Dans les deux cas : suppression de `browser-signal-stores.ts` (`@ts-nocheck`), du hook orphelin `use-encryption.ts`, du barrel mort, et **chiffrement des clés au repos dans IndexedDB** (clé non-extractable WebCrypto + wrapping — corrige finding #12). Réparer « Générer les clés » (`encryption-settings.tsx:114`, finding #11) — ou supprimer ce bouton : avec libsignal, la génération est automatique à l'enrôlement.
Le câblage existant (`messaging.service.ts:313-336`, fail-closed, suppression du fallback REST) est conservé : on remplace la source du mode (serveur, plus IndexedDB local — ferme le finding #2) et l'implémentation de `encrypt`/`decrypt`.

### Phase 5 — Groupes : Sender Keys (3 semaines)

1. Modèle WhatsApp : à l'entrée dans un groupe `e2ee`, chaque membre génère une **Sender Key** et la distribue à chaque autre membre via les sessions par paire (déjà en place). Messages de groupe = une seule passe de chiffrement + fan-out serveur du même ciphertext.
2. Rotation de la Sender Key à chaque départ de membre (sécurité) ; re-distribution à chaque arrivée.
3. `SenderKeyStore` déjà implémenté en Phases 2-4 (fourni par libsignal).
4. Traduction on-device : l'enveloppe Sender Key transporte original + traductions vers les langues déclarées du groupe (bornées aux N langues actives, métadonnée déjà disponible côté client).

### Phase 6 — Multi-appareil : Sesame (3-4 semaines)

1. Registre d'appareils par utilisateur (le schéma par-appareil de la Phase 1 le prépare) ; enrôlement d'un nouvel appareil par QR signé par l'appareil primaire (modèle WhatsApp 2021 : la liste d'appareils est signée par le primaire, le serveur ne peut pas en injecter).
2. Fan-out : chaque message est chiffré vers chaque appareil de chaque participant (libsignal gère les sessions multiples nativement).
3. C'est ce qui rend l'Option B de la Phase 4 pleinement fonctionnelle.

### Phase 7 — Confiance vérifiable (2-3 semaines + tâche de fond)

1. **Safety numbers v2** : vérification par QR, badge « vérifié », **blocage strict** de l'envoi sur changement de clé non re-vérifié (paramètre utilisateur).
2. **Key transparency** (trajectoire WhatsApp AKD/Parakeet) : journal auditable en append-only des bundles publiés ; les clients auditent leur propre entrée. Commencer par un log signé simple + monitoring, standardiser ensuite.
3. Audit crypto externe **obligatoire** avant d'étendre le label « bout en bout » au marketing.

### Phase 8 — Prisme Linguistique on-device (4-6 semaines, parallèle dès Phase 2)

1. iOS : framework Apple Translation (on-device, iOS 18+) en premier ; fallback NLLB distillé CoreML pour les langues manquantes. Android : équivalent ML Kit / NLLB distillé. Web : modèle WASM léger, sinon pas de traduction en `e2ee`.
2. L'API cliente réutilise `resolveUserLanguage()` (source de vérité du Prisme) pour choisir la traduction embarquée par enveloppe destinataire.
3. Règles du Prisme inchangées : pas de traduction disponible → original (jamais `translations.first`), indicateur discret, exploration par geste.
4. Mesure : taux de couverture linguistique on-device vs serveur, budget batterie/latence (< 150 ms par message court visé).

### Phase 9 — Historique & backup chiffrés (optionnel, 4+ semaines)

Trajectoire Labyrinth (Messenger) / backup HSM (WhatsApp) : stockage serveur de l'historique sous clés client, récupération par clé de backup (phrase ou passkey). À ne lancer qu'après Phases 2-6 stabilisées.

### Phase 10 — Interop DMA effective (dépend de l'accès à l'offre de référence Meta)

1. Dossier de candidature à l'offre de référence WhatsApp/Messenger (Meta) : notre stack libsignal satisfait l'exigence protocolaire par construction (Phases 2-4).
2. Couche d'adaptation : mapping identités (annuaire Meta ↔ Meeshy), proxy média selon les modalités de l'offre, enveloppe `protocol:` déjà prévue en Phase 1.
3. Veille MIMI/MLS : prototyper un `SenderKeyStore`-équivalent MLS (OpenMLS) le jour où l'IETF MIMI se stabilise — l'architecture gateway (relais opaque) n'exige aucun changement serveur pour ce basculement.
4. Le Prisme s'applique au trafic interop entrant : messages WhatsApp reçus → déchiffrés localement → traduits on-device → affichés dans la langue du lecteur. **La traduction devient le différenciateur d'interop que personne d'autre n'a.**

---

## 4. Migration & rollout

1. **Feature flags par phase** (`e2ee_signal_v1`, `e2ee_groups`, `e2ee_multidevice`…) + cohortes internes → beta → GA.
2. **Compatibilité** : les conversations `server`/`hybrid` existantes ne bougent pas. Les conversations `e2ee` MVP (iOS) sont ré-établies sur libsignal — aucune perte réelle : l'audit démontre que leur déchiffrement n'a jamais fonctionné.
3. **Versionnement protocolaire** dans l'enveloppe (`protocol`, `messageType`) dès la Phase 1 — les évolutions (MLS, PQ) ne casseront pas le transport.
4. **Kill-switch honnête** : si une phase régresse, on désactive le flag et l'UI redevient « chiffrement serveur » — jamais un cadenas E2EE sans E2EE.

## 5. Stratégie de tests (conforme au TDD du repo)

- **Round-trip inter-parties systématique** (le test dont l'absence a produit le finding #1) : par plateforme, puis cross-platform iOS↔Android↔Web en staging, y compris message initial prekey, ratchet long, désynchronisation, appareil ajouté/retiré.
- **Vecteurs officiels** : suites de tests libsignal exécutées dans les CI des trois plateformes.
- **Adversarial** : bundle à signature invalide rejeté, OTPK réutilisée refusée, plaintext en conv `e2ee` rejeté, changement de clé détecté, enveloppe rejouée refusée.
- **CI** : plus aucune suite E2EE dans `testPathIgnorePatterns` (Phase 0.7) ; couverture des stores et du cycle de vie des clés dans le seuil global.

## 6. Risques principaux

| Risque | Mitigation |
|---|---|
| Poids/latence des modèles de traduction on-device | Phase 8 découplée : `e2ee` livrable sans traduction (repli original), langues ajoutées progressivement |
| Binding WASM libsignal (Phase 4, option A) non trivial | Option B (appareil lié) livrable seule ; l'option A peut suivre |
| Offre de référence Meta : conditions d'accès (Phase 10) | Aucune dépendance des phases 0-9 à Meta ; l'interop est additive |
| Charge de migration des stores iOS (MVP → libsignal) | Les sessions MVP sont de fait inertes (audit) : migration = régénération propre |
| Tentation de garder « juste un peu » de crypto maison | Interdit par l'ADR 0.9 : libsignal ou rien ; le code maison est supprimé phase par phase |

## 7. Références

- Signal : specs X3DH / PQXDH / Double Ratchet / Sesame — signal.org/docs ; libsignal — github.com/signalapp/libsignal
- WhatsApp : Security Whitepaper (protocole Signal, Sender Keys, multi-device), Key Transparency (2023), Encrypted Backups (2021)
- Meta/Messenger : « Messenger End-to-End Encryption Overview » (2023), whitepaper **Labyrinth**, offre de référence d'interopérabilité DMA (mars 2024)
- IETF : RFC 9420 (**MLS**), groupe de travail **MIMI** (More Instant Messaging Interoperability)
- Apple : iMessage **PQ3** (2024) — référence post-quantique
- Interne : `docs/audits/2026-08-13-e2ee-implementation-audit.md` (findings #1-#17 cités dans ce plan)
