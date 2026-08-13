# Audit d'implémentation E2EE — 13 août 2026

**Périmètre** : gateway (`services/gateway`), web (`apps/web`), iOS (`apps/ios` + `packages/MeeshySDK`), shared (`packages/shared`), Android (`apps/android`), documentation (`docs/`).
**Méthode** : lecture du code avec vérification croisée des chemins critiques (envoi/réception de messages, dérivation de clés, stockage, routes Signal, configuration de build et de tests). Chaque constat cite fichier et ligne. Audit en lecture seule — aucun changement de code.

---

## 1. Verdict global

**Meeshy ne fournit pas aujourd'hui de chiffrement de bout en bout fonctionnel sur aucune plateforme.** Ce qui fonctionne réellement en production est un chiffrement **côté serveur** (AES-256-GCM avec coffre de clés à enveloppe) pour les modes `server` et `hybrid`, plus un **annuaire de clés** (upload/fetch de pre-key bundles) correctement autorisé. Tout le reste — protocole Signal, X3DH, Double Ratchet, déchiffrement client — est soit du code mort, soit un MVP cassé, soit une branche jamais exécutée.

| Couche | État réel |
|---|---|
| Gateway | ✅ Coffre serveur + annuaire de clés fonctionnels · ❌ `POST /signal/session/establish` renvoie 503 dans 100 % des cas · 💀 ~3 500 lignes Signal non compilées |
| Web | ⚙️ Tuyauterie encrypt/decrypt câblée mais **jamais déclenchée** (le mode local n'est jamais écrit) · ❌ génération de clés cassée (400 garanti) |
| iOS | ✅ Chiffrement sortant DM câblé · ❌ **déchiffrement entrant impossible par construction** · pas de libsignal, MVP CryptoKit sans ratchet |
| Android | ∅ Placeholder délibéré (`CryptoModulePlaceholder`), aucune crypto de messagerie |
| Shared | ✅ Types et `MessageRequest.encryptedPayload` présents · ❌ le transport Socket.IO n'a **aucun champ ciphertext** |
| Docs | ⚠️ 8 documents dont 2 provablement périmés et plusieurs contradictions internes |

**Conséquence produit immédiate** : une conversation marquée `e2ee` affiche un cadenas vert (web : `ConversationHeader.tsx:68` via `use-encryption-info.ts:10-31`) alors que les messages web partent **en clair**, et les DM iOS chiffrés sont **illisibles par le destinataire** (fallback plaintext documenté dans le code lui-même).

---

## 2. Gateway — coffre serveur réel, Signal décoratif

### Ce qui fonctionne
- **`ServerKeyVault`** (`services/gateway/src/services/EncryptionService.ts:114-370`) : chiffrement d'enveloppe (clé de données sous `ENCRYPTION_MASTER_KEY`), persistance `ServerEncryptionKey`, cache LRU, zéroïsation au shutdown. Garde de prod à `:127-128` (throw si master key absente).
- **Modes** : `encryptMessage`/`decryptMessage` refusent le mode `e2ee` (`:492-494`, `:538-540`) — la frontière est respectée.
- **Annuaire de clés** (`src/routes/signal-protocol.ts`) : `POST /signal/keys` (`:60`) upsert un bundle **généré par le client** ; `GET /signal/keys/:userId` (`:147`) avec autorisation réelle (conversation active partagée `:216-231` ou amitié acceptée `:234-241`).
- **E2EE × traduction** : correctement exclusif — `MessageTranslationService.ts:243-262` skippe la traduction si `encryptionMode === 'e2ee'` ; `translateAndReEncrypt` (`EncryptionService.ts:572-608`) et `translateHybridMessage` (`:693-731`) ne fonctionnent que parce que le serveur détient le clair en `server`/`hybrid`. Le compromis est explicite : `e2ee` = pas de traduction.

### Ce qui est cassé ou mort
- **`signalService` n'est jamais assigné.** `EncryptionService.ts:383` le déclare `null` « will be initialized when… » ; aucune assignation dans tout le repo (occurrences : `:383`, `:846`, `:902` uniquement — vérifié). `POST /signal/session/establish` atteint donc toujours la branche 503 (`routes/signal-protocol.ts:426-435`). Le test unitaire masque le défaut en moquant le getter (`signal-protocol-routes.test.ts:349`) — et un autre test assume `toBeNull()` (`EncryptionService.test.ts:359-360`).
- **`generatePreKeyBundle()`** (`EncryptionService.ts:781-840`) : vraie génération libsignal, mais orpheline (aucune route ne l'appelle) et elle **jette toutes les clés privées** — le bundle retourné est cryptographiquement inutilisable. Kyber hardcodé `null` (`:836-838`).
- **`src/adapters/node-signal-stores.ts`** (301 L) : les 6 stores Signal implémentés… en `Map` mémoire, jamais importés par personne, et **hors du `include` de `tsconfig.json`** (`:38-56`) — jamais compilés. TOFU sans vérification : identité inconnue → `true` inconditionnel (`:93-96`) ; changement de clé → warning puis écrasement (`:69-77`).
- **`src/dma-interoperability/`** (3 193 L : `SignalKeyManager`, `X3DHKeyAgreement`, `DoubleRatchet`, `SignalProtocolEngine`) : exclu de tsconfig (`tsconfig.json:61`), tests ignorés par jest, imports cassés (`'../../../shared/prisma/client'` ne résout pas), et — fatal pour de l'interop — **courbe P-256 (`prime256v1`) étiquetée « Curve25519 equivalent »** (`X3DHKeyAgreement.ts:360, 381` ; `SignalKeyManager.ts:160, 185`). P-256 n'est pas X25519 : ce code ne pourra jamais parler à un client Signal réel. Aucun test-vector Signal (`SignalProtocolEngine.ts:788` TODO).

### Failles de validation sur le chemin des messages
- **Le mode déclaré par le client est cru sur parole** : `MessageProcessor.ts:328-335` accepte `encryptionMode`/`isEncrypted` sans contre-vérifier `Conversation.encryptionMode`. Un client peut marquer `isEncrypted: true` dans une conversation non chiffrée pour échapper à la traduction/modération. (Déjà signalé comme Issue #3 dans `docs/ENCRYPTION_MODE_ANALYSIS.md:672-685` — toujours ouvert.)
- **Du clair arrivant dans une conversation `e2ee` est stocké, pas rejeté** — simple `logger.warn` (`MessageProcessor.ts:188-196`).
- **`getOrCreateConversationKey()` appelé sans argument** à l'activation du chiffrement (`routes/conversation-encryption.ts:210`) : le chemin clé-par-conversation (et son verrou anti-TOCTOU, `EncryptionService.ts:426-477`) est contourné ; une clé autonome est frappée à chaque fois.
- `POST /signal/keys` **ne vérifie pas** `signedPreKeySignature` contre l'`identityKey` uploadée (`signal-protocol.ts:89-121`).
- Pre-key « one-time » : **un seul slot**, servi en boucle, jamais réapprovisionné (`signal-protocol.ts:437-457` ; `schema.prisma:2347-2349`).

### Tests désactivés silencieusement
`jest.config.json:18-30` exclut `src/__tests__/e2ee/` (602 L), `src/__tests__/integration/` (`e2ee-full-flow.test.ts` 563 L, `dma-encryption-interop.test.ts` 546 L) et tous les tests des primitives Signal. `test` et `test:coverage` utilisent cette config (`package.json:13, 21`) : **~1 700 lignes de tests de flux E2EE ne tournent jamais en CI**, uniquement via les scripts opt-in `test:e2ee`/`test:integration`.

---

## 3. Web — machinerie complète branchée sur un interrupteur toujours éteint

### Le chemin est câblé…
- Installation des handlers à l'authentification socket : `orchestrator.service.ts:170-176` (`setEncryptionHandlers(e2eeCrypto.createEncryptionHandlers())` + `initializeForUser`).
- Envoi : `messaging.service.ts:313-336` — si `getConversationMode()` retourne un mode, chiffre, pose `encryptedContent`/`encryptionMetadata`, expurge `content` en `'[Encrypted]'` pour `e2ee` (`:323`), **fail-closed** en cas d'erreur (`:332`) et suppression du fallback REST (`:366`).
- Réception : `messaging.service.ts:161, :178 → decryptMessage (:229-273)` avec classification d'erreurs et fallback `'[Encrypted message - Unable to decrypt]'`.

### …mais ne s'exécute jamais
- **`getConversationMode()` lit uniquement le store IndexedDB `conversation_keys`** (`packages/shared/encryption/encryption-service.ts:455-460`), écrit seulement par `encryptMessage` (circulaire) et `establishE2EESession` — **aucun appelant de production dans `apps/web`** (vérifié : `storeConversationKey`/`establishE2EESession` n'apparaissent que dans l'adaptateur et les tests). Le toggle serveur (`ConversationEncryptionSection.tsx:75`) écrit côté gateway mais **n'est jamais miroité en local**. Résultat : mode toujours `null` → **tout message part en clair**, cadenas vert affiché ou non.
- **`signalProtocolService` n'est jamais injecté** (`lib/encryption/index.ts:12-15`, `e2ee-crypto.ts:90-93` vs `encryption-service.ts:128`) : même avec un mode `e2ee` posé, l'exécution retombe dans la branche AES locale et étiquette quand même `metadata.mode = 'e2ee'` (`encryption-service.ts:328`) — clé AES locale jamais transmise à quiconque (`:302-308`), destinataires en `Decryption key not found` (`:374`).
- **« Générer les clés » est un 400 garanti** : `encryption-settings.tsx:114` envoie `POST /signal/keys` avec `{}` alors que le schéma exige 6 champs (`packages/shared/types/api-schemas.ts:3382`). Le test **fige le bug comme comportement attendu** (`encryption-settings.test.tsx:279`).
- **`browser-signal-stores.ts` (563 L) est du code mort** : `// @ts-nocheck` en ligne 1, non ré-exporté par `adapters/index.ts`, importe `@signalapp/libsignal-client` qui n'est **pas** dans `apps/web/package.json` et qui est un addon natif Node (pas du WASM) — inexécutable en navigateur. Son propre test le reconnaît (`browser-signal-stores.test.ts:4-7`).
- **Clés en clair dans IndexedDB** : `indexeddb-key-storage-adapter.ts:107-133` stocke les clés AES en base64 brut ; l'annotation `// Encrypted` sur `UserSignalKeys.privateKey` (`:37`) est fausse — le producteur (`encryption-service.ts:209`) porte un `// TODO: Encrypt private key with user password`. Seul le backup manuel export/import (orphelin) applique PBKDF2-600k.
- **Orphelins** : `attachment-encryption.ts` (345 L + 664 L de tests), `hooks/use-encryption.ts` (364 L), `exportKeys`/`importKeys`, le barrel `lib/encryption/index.ts`. 2 905 L de tests couvrent majoritairement du code sans appelant — et **aucun test ne couvre le chemin réel composer → ciphertext sur le fil → déchiffrement**, exactement le trou qui rend le mode-toujours-`null` invisible.

---

## 4. iOS — MVP maison câblé à l'envoi, réception impossible

### Architecture réelle
Pas de libsignal (zéro occurrence dans `apps/ios`/`packages/MeeshySDK` — vérifié). CryptoKit uniquement : identité et signed-prekey en `Curve25519.KeyAgreement`, signature Ed25519 séparée, **un seul ECDH statique-statique → HKDF-SHA256 → une clé AES-GCM par pair, à vie** (`E2EEService.swift:222-232` ; commentaire assumé `E2ESessionManager.swift:179` « Double Ratchet simplifié via un ECDH unique »). Pas de forward secrecy, pas de PCS, pas d'anti-rejeu, mono-appareil (`deviceId: 1`, `E2EEService.swift:180`), DM texte uniquement (`guard isDirect`, `ConversationViewModel.swift:1936, 2677` ; payload `Data(textContent.utf8)` `:2679`). Les champs Kyber du bundle sont `nil` cosmétiques (`E2EEService.swift:186-188`).

### 🔴 Le défaut de tête : le déchiffrement entrant ne peut jamais réussir
Précision d'abord : la dérivation entrante `deriveSessionFromIncoming` (`E2ESessionManager.swift:202-213`, `DH(my_signedPreKey_priv, sender_identity_pub)`) est **mathématiquement cohérente** avec la dérivation sortante (`:173-185`, `DH(my_identity_priv, peer_signedPreKey_pub)`) — le DH est commutatif, les deux donnent le même secret pour un même couple (identité de l'émetteur, signed-prekey du récepteur). Le design pourrait converger. Il est cassé par deux faits :

1. **Le chemin de réconciliation est inatteignable.** Le seul appelant de production est `LiveSessionProvider` (`E2ESessionManager.swift:277-281`) qui appelle `decryptMessage` **sans jamais fournir `senderIdentity`** (aucun site dans le repo ne le fournit). Donc : pas de session stockée → `SessionError.missingSession`.
2. **La session stockée, quand elle existe, est la mauvaise clé.** Un seul slot Keychain par pair (`me.meeshy.e2ee.session.<peerId>`), et les clés directionnelles diffèrent : `K(A→B) = DH(A_id, B_spk)` ≠ `K(B→A) = DH(B_id, A_spk)`. B, qui a déjà envoyé à A, détient `K(B→A)` ; A chiffre avec `K(A→B)` ; `AES.GCM.open` échoue.

Comme le récepteur ne peut jamais réussir sa première réception (fait 1), aucune paire ne converge jamais. Le codebase l'a normalisé : cooldown 600 s dont le but documenté est le repli plaintext (`E2ESessionManager.swift:68-72`), et conservation du plaintext optimiste local parce que l'écho socket est indéchiffrable (`ConversationSocketHandler.swift:381-389`). Le NSE lit le même slot défectueux (`NSEDecryptor.swift:136-152`) → les push riches ne se déchiffrent pas non plus.

### Autres constats iOS
- 🔴 **Signature de prekey invérifiable et jamais vérifiée** : le bundle publie la clé X25519 comme `identityKey` mais la signature vient d'une clé Ed25519 **dont la moitié publique n'est jamais transmise** (`BackendPreKeyBundle`, `E2EAPI.swift:11-23`). `getOrCreateSession` consomme le bundle sans aucune validation (`E2ESessionManager.swift:175-183`). `isValidSignature` n'existe **que dans les tests** (`E2EEServiceTests.swift:129-131`). Le serveur de clés peut MITM tous les DM, indétectablement — pas de safety numbers.
- 🟠 Une seule « one-time » prekey, régénérée/écrasée à chaque login (`E2EEService.swift:169-171` ; `MeeshyApp.swift:681`) et dont la clé privée n'entre dans aucune dérivation.
- 🟠 DEBUG : repli plaintext silencieux sur échec de chiffrement (`ConversationViewModel.swift:2684-2693`) ; la prod, elle, refuse correctement (fail-closed).
- 🟡 Liste des pairs en `UserDefaults` (graphe social en clair, `E2ESessionManager.swift:24, 91-103`) ; clés long-terme **non namespacées** par utilisateur contrairement aux clés de session (`E2EEService.swift:9-12`) ; pas de Secure Enclave (clés privées en base64 dans le Keychain, accessibilité `AfterFirstUnlockThisDeviceOnly` — choix correct pour le NSE).
- ✅ Bien fait : wipe au logout soigné (`MeeshyApp.swift:707` → `clearSessions` → `clearAllKeys`, avec le correctif `resolveWipeUserId`), migrations Keychain, exclusion socket-first pour les messages chiffrés (`ConversationViewModel.swift:2727`).
- **Tests** : 47 tests E2EE mais **aucun aller-retour inter-parties** (A chiffre → B déchiffre) — précisément la forme du bug. `E2ESessionManagerTests` ne couvre que statiques et messages d'erreur, zéro test de `getOrCreateSession`/`encryptMessage`/`decryptMessage`.

### Dépendances iOS : SPM seul, CocoaPods vestigial
- **Source de vérité : `apps/ios/project.yml` (XcodeGen), SPM exclusivement** — deux packages : Firebase 12.12.1 et `MeeshySDK` local (`project.yml:130-135`) ; SocketIO/GRDB/WebRTC arrivent transitivement via `packages/MeeshySDK/Package.swift:39-43`.
- **Aucun Podfile n'existe dans le repo** (vérifié par find), aucun répertoire `Pods/`, aucun workspace CocoaPods.
- `apps/ios/Gemfile` épingle `cocoapods ~> 1.14` (résolu 1.16.2) **sans aucun consommateur** — poids mort dans chaque `bundle install` CI. Les seules mentions restantes sont des docs archivées et la chaîne `org.cocoapods.FirebaseAnalytics` dans les scripts de codesign (identifiant estampillé par Xcode sur les XCFrameworks Firebase — rien à voir avec l'outil pod).
- ⚠️ `apps/ios/Package.swift` est un **leurre** : il déclare Firebase/socket.io/WebRTC en direct et mentionne « Install via CocoaPods: pod 'onnxruntime-objc' », mais le projet Xcode généré par XcodeGen ne le consomme jamais.

---

## 5. Shared — les types existent, le transport principal ne les porte pas

- **`MessageRequest.encryptedPayload` existe** (`packages/shared/types/messaging.ts:149`) — contrairement à ce qu'affirme encore `docs/ENCRYPTION_IMPLEMENTATION_STATUS.md:60-84`. Le REST `POST /conversations/:id/messages` l'accepte (`routes/conversations/messages.ts:122-130` → `:1822-1826`), avec une incohérence : le swagger déclare encore `enum: ['e2e', 'server']` (`:1659`) contre le Zod `['e2ee','server','hybrid']`.
- ❌ **`socketio-events.ts` (transport principal) n'a aucun champ ciphertext** : `MessageSendData`/`MessageSendWithAttachmentsData` (`:1637-1668`) ne portent ni `encryptedPayload` ni `encryptionMode`. Le handler gateway accepte pourtant un `encryptedPayload?: unknown` non typé (`MessageHandler.ts:213`) puis le **cast brut** (`:322`) — de l'input non validé.
- 🔴 **`encryption-service.ts:489` persiste le clair à côté du chiffré** pour `server`/`hybrid` (`content: mode === 'e2ee' ? '[Encrypted]' : content`) — signalé Issue #1 dans `ENCRYPTION_MODE_ANALYSIS.md:589-611` (janv. 2026), toujours non corrigé.
- **Schéma Prisma** : le seul état Double Ratchet persisté vit dans les modèles **DMA** (`DMASession`, `schema.prisma:2478` ; `PreKey` one-time `:2576`) — il n'existe **aucun modèle de session Signal pour la messagerie native**, cohérent avec les stores gateway en mémoire. 🔴 `SignalPreKeyBundle` a des colonnes de **clés privées côté serveur** (`identityKeyPrivate` `:2334`, `signedPreKeyPrivate` `:2353`, `preKeyPool` avec `privateKey` `:2362-2368`) — la route vivante ne les écrit pas, seul le code DMA mort le fait (`SignalKeyManager.ts:275, 344, 475`) ; ces colonnes sont une invitation permanente au key escrow, incompatible par construction avec toute prétention « zero-knowledge ».
- **Divergence de versions libsignal** : gateway `^0.99.2` en `dependencies` dures (`services/gateway/package.json:42`, résolu 0.99.3) vs shared `^0.100.0` en `optionalDependencies` (`packages/shared/package.json:111`, résolu 0.100.0) — deux modules natifs différents dans le même arbre (`bun.lock:1221, 4069`).

---

## 6. Android — trou délibéré, pas retard

`apps/android/core/crypto/.../Module.kt` est un placeholder de 9 lignes (`CryptoModulePlaceholder`) ; `build.gradle.kts` du module a des `dependencies { }` **vides** ; zéro référence libsignal dans tout `apps/android`. Seule crypto réelle : tokens au repos via Keystore (`EncryptedTokenStore.kt:15-20`). L'UI E2EE-adjacente (badge `hasE2EE`, `EncryptionDisclaimer`) ne fait que lire des chaînes serveur. Le plan de route l'assume : `:core:crypto` derrière ADR-018..020, « Proceed with… the **non-crypto** parts of Phase 3 now » (`tasks/architecture-review.md:730`).

---

## 7. Documentation — deux docs périmés, contradictions actives

Les 8 docs ont été retouchés dans un même commit (2026-08-12) ; seules les dates internes font foi.

| Contradiction | Détail |
|---|---|
| **Docs 2025-11-19 périmés** | `ENCRYPTION_IMPLEMENTATION_STATUS.md` et `E2EE_TESTS_SUMMARY.md` citent comme bloquants deux gaps **aujourd'hui fermés** : `MessageRequest.encryptedPayload` (existe, `messaging.ts:149`) et le répertoire frontend de chiffrement (existe, `apps/web/lib/encryption/`, 1 856 L). À marquer supersédés. |
| **Roadmap incohérente dans les deux sens** | `SIGNAL_PROTOCOL_ROADMAP.md:66-77` liste comme « Files to Create » des fichiers qui existent (`signal-types.ts`, `signal-store-interface.ts`) et un qui n'existe nulle part (`signal-protocol-service.ts`). Pas de date. |
| **« Zero-knowledge » vs code** | `UNIFIED_ENCRYPTION_ARCHITECTURE.md:257-259` revendique « Server never sees plaintext / PFS » ; `encryption-service.ts:489` persiste le clair en `server`/`hybrid`, et aucun état de ratchet natif n'existe (§5). |
| **« COMPLETE » trompeur** | `E2EE-ARCHITECTURE-COMPLETE.md` documente lui-même 5 piliers manquants (`:852-1421`) et 6-8 semaines restantes (`:1862`) — « complet » qualifie la doc, pas l'implémentation. |
| **Dérive du nombre de modes** | `ENCRYPTION_MODES_COMPARISON.md:30` dit « two modes » ; `types/encryption.ts:10` et `ENCRYPTION_MODE_ANALYSIS.md:22-31` en définissent quatre. |

Le plan DMA (`docs/dma-interoperability/DMA_IMPLEMENTATION_PLAN.md`) pariait sur **MLS/OpenMLS** avec libsignal en fallback ; la réalité a inversé le plan (aucun `packages/mls-core`, implémentation Signal-custom livrée… et morte). L'adaptateur s'auto-identifie `'signal-protocol-v3-custom'` (`SignalProtocolAdapter.ts:134`) — une variante maison, pas de l'interop certifiable.

---

## 8. Tableau consolidé des findings

| # | Sévérité | Constat | Preuve |
|---|---|---|---|
| 1 | 🔴 Critique | iOS : déchiffrement entrant impossible (chemin de réconciliation inatteignable + clés directionnelles dans un slot unique) → DM « chiffrés » illisibles, repli plaintext normalisé | `E2ESessionManager.swift:173-234, 277-281` ; `ConversationSocketHandler.swift:381-389` |
| 2 | 🔴 Critique | Web : chiffrement jamais déclenché — `conversation_keys` jamais écrit en prod, mode toujours `null`, cadenas UI mensonger | `encryption-service.ts:455-460` ; `messaging.service.ts:313` ; `use-encryption-info.ts:10-31` |
| 3 | 🔴 Critique | iOS : signature de prekey invérifiable (clé Ed25519 publique jamais transmise) et jamais vérifiée → MITM serveur indétectable ; pas de safety numbers | `E2EAPI.swift:11-23` ; `E2ESessionManager.swift:175-183` |
| 4 | 🔴 Haute | Gateway : `signalService` jamais assigné → `/signal/session/establish` 503 permanent, masqué par le mock des tests | `EncryptionService.ts:383, 846` ; `signal-protocol.ts:426-435` ; test `:349` |
| 5 | 🔴 Haute | Mode/`isEncrypted` déclarés par le client crus sans contre-vérification ; plaintext accepté en conversation `e2ee` (warning seulement) | `MessageProcessor.ts:328-335, 188-196` ; `MessageHandler.ts:322` |
| 6 | 🔴 Haute | Clair persisté à côté du chiffré en `server`/`hybrid` (bug documenté janv. 2026, non corrigé) | `packages/shared/encryption/encryption-service.ts:489` |
| 7 | 🟠 Haute (latente) | Colonnes de clés privées côté serveur dans `SignalPreKeyBundle` (+ code DMA qui les écrit) = key escrow structurel | `schema.prisma:2334, 2353, 2362` ; `SignalKeyManager.ts:275, 344, 475` |
| 8 | 🟠 Haute (latente) | X3DH/Double Ratchet maison sur **P-256** étiqueté « Curve25519 equivalent », sans test vectors — non interopérable Signal | `X3DHKeyAgreement.ts:360, 381` ; `SignalProtocolEngine.ts:788` |
| 9 | 🟠 Moyenne | Transport Socket.IO sans champ ciphertext typé ; le handler caste un `unknown` non validé | `socketio-events.ts:1637-1668` ; `MessageHandler.ts:213, 322` |
| 10 | 🟠 Moyenne | ~1 700 L de tests de flux E2EE + primitives Signal exclus du run CI par défaut | `services/gateway/jest.config.json:18-30` |
| 11 | 🟠 Moyenne | Web : « Générer les clés » = `POST /signal/keys {}` → 400 garanti, figé par le test | `encryption-settings.tsx:114` ; `api-schemas.ts:3382` ; test `:279` |
| 12 | 🟠 Moyenne | Web : clés AES et clé privée en clair dans IndexedDB (annotation `// Encrypted` fausse) | `indexeddb-key-storage-adapter.ts:37, 107-133` ; `encryption-service.ts:209` |
| 13 | 🟠 Moyenne | Gateway : signature de bundle non vérifiée à l'upload ; one-time prekey mono-slot jamais réapprovisionnée | `signal-protocol.ts:89-121, 437-457` |
| 14 | 🟡 Basse | `getOrCreateConversationKey()` sans argument à l'activation → clé autonome, verrou TOCTOU contourné | `conversation-encryption.ts:210` |
| 15 | 🟡 Basse | Deux versions natives de libsignal dans l'arbre (0.99.3 / 0.100.0) ; swagger `['e2e','server']` vs Zod | `bun.lock:1221, 4069` ; `messages.ts:1659` |
| 16 | 🟡 Basse | ~4 000 L de code mort donnant l'illusion d'un E2EE avancé (browser-signal-stores, node-signal-stores, dma-interoperability, orphelins web) | §2-3 |
| 17 | 🟡 Basse | `gem "cocoapods"` sans consommateur ; `apps/ios/Package.swift` leurre non consommé par XcodeGen | `apps/ios/Gemfile` ; `apps/ios/Package.swift` |

---

## 9. Recommandations priorisées

**P0 — Honnêteté produit (immédiat, sans crypto nouvelle)**
1. Ne plus afficher le cadenas « chiffré de bout en bout » tant que le client n'a pas de session fonctionnelle (web : `use-encryption-info.ts` ; iOS : équivalent). Un indicateur mensonger est pire que pas d'indicateur.
2. Gateway : **rejeter** le plaintext en conversation `e2ee` (aujourd'hui warning + stockage, `MessageProcessor.ts:188-196`) et contre-vérifier le mode client contre `Conversation.encryptionMode`.
3. Corriger `encryption-service.ts:489` (ne plus persister le clair à côté du chiffré) et `conversation-encryption.ts:210` (passer `conversationId`).

**P1 — Réparer le MVP iOS ou le désactiver**
4. Câbler `senderIdentity` dans le chemin de réception (le bundle/metadata doit transporter l'identité publique de l'émetteur) **et** résoudre le conflit de slot directionnel (clés send/recv séparées, ou convergence stricte vers `DH(initiator_id, responder_spk)`). Ajouter le test manquant : **aller-retour A chiffre → B déchiffre**, plus l'assertion de commutativité DH.
5. Transmettre la clé publique Ed25519 dans le bundle et **vérifier** `signedPreKeySignature` avant usage (le code de vérification existe déjà… dans les tests).

**P2 — Un seul chemin, une seule vérité**
6. Décision d'architecture à trancher et documenter (ADR) : soit adopter **libsignal officiel partout** (client-side, gateway = annuaire seulement), soit assumer un schéma simplifié documenté honnêtement — mais supprimer les ~4 000 L de code Signal mort (`dma-interoperability`, `node-signal-stores`, `browser-signal-stores`, orphelins web) qui font croire le contraire. Supprimer les colonnes de clés privées de `SignalPreKeyBundle`.
7. Ajouter `encryptedPayload`/`encryptionMode` typés aux événements Socket.IO (`socketio-events.ts`) — le transport principal ne peut pas rester structurellement incapable de porter du ciphertext.
8. Réintégrer les tests E2EE exclus dans le run CI par défaut (quitte à les adapter), aligner les versions libsignal, corriger le swagger.

**P3 — Hygiène**
9. Marquer supersédés les deux docs 2025-11-19, dater/réécrire `SIGNAL_PROTOCOL_ROADMAP.md`, renommer ou re-préfacer `E2EE-ARCHITECTURE-COMPLETE.md`.
10. Retirer `gem "cocoapods"` du Gemfile iOS et supprimer (ou marquer non-autoritatif) `apps/ios/Package.swift`. **SPM est et reste le seul mécanisme de dépendances iOS** — aucun Podfile n'existe, aucune dépendance ne le requiert.

---

## Annexe — corrections au rapport d'audit précédent

Le rapport antérieur (session VS Code) contenait des affirmations périmées, reprises de `ENCRYPTION_IMPLEMENTATION_STATUS.md` (2025-11-19) :
- « `MessageRequest` manque d'`encryptedPayload` » — **faux aujourd'hui** : le champ existe (`messaging.ts:149`) et le REST l'accepte de bout en bout.
- « `frontend/lib/encryption/` manquant » — **faux** : `apps/web/lib/encryption/` existe (7 fichiers, 1 856 L). Le vrai problème n'est pas l'absence de code mais le fait qu'il ne s'exécute jamais (finding #2).
- « CocoaPods présent comme alternative » — **trompeur** : aucun Podfile n'existe ; SPM est le mécanisme unique ; le gem est un vestige.
