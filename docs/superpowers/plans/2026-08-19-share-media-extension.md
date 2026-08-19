# Share Media Extension (Volet B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre le partage de photos, vidéos, GIFs et documents depuis n'importe quelle app iOS vers plusieurs conversations Meeshy, sans jamais perdre un octet même si la feuille de partage meurt.

**Architecture:** L'extension `MeeshyShareExtension` (sans dépendance SDK, plafond 120 Mo, tuable à tout instant) **copie** les fichiers reçus dans le conteneur App Group `group.me.meeshy.apps` sous `share_pending_media/<shareId>/<index>.<ext>` par flux de 64 Kio, puis **décrit** l'envoi dans une fiche write-ahead versionnée `share_pending_sends/<shareId>.json` (v:1, état PAR CIBLE). L'app, au boot et au retour en avant-plan, reprend la fiche : elle enfile UNE ligne d'outbox par cible avec un `clientMessageId` dérivé, la première cible portant les octets (upload TUS par `OutboxDispatcher`), les suivantes réclamant une copie serveur des mêmes pièces jointes. Le lot B-2 ajoute un client TUS minimal DANS l'extension pour que les petits partages soient déjà partis à la fermeture de la feuille — pure optimisation, annulable sans perte de fonction.

**Tech Stack:** Swift 6.2 (`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`), SwiftUI + UIKit hôte, `NSItemProvider.loadFileRepresentation`, `FileHandle` streaming, `UniformTypeIdentifiers`, `URLSession`, protocole TUS 1.0.0, GRDB (outbox SDK), XCTest, XcodeGen.

---

## Global Constraints

Ces contraintes s'appliquent à CHAQUE tâche, sans être répétées.

- **TDD strict, non négociable.** Aucune ligne de production sans un test rouge écrit d'abord. RED → vérifier l'échec → implémentation minimale → vérifier le succès → commit.
- **Commits par chemins explicites.** `git add <fichiers> && git commit -- <fichiers>`. **Jamais `git add -A`, jamais `git add .`, jamais `git commit --amend`** — le worktree est partagé avec d'autres sessions.
- **Messages de commit en français**, format `type(scope): sujet`. **Aucun trailer `Co-Authored-By`.**
- **Localisation : 7 langues obligatoires** (`ar`, `de`, `en`, `es`, `fr`, `it`, `pt-BR`). Toute clé utilisée par l'extension va dans `apps/ios/MeeshyShareExtension/Localizable.xcstrings` (une extension résout `String(localized:)` contre SON bundle, pas celui de l'app) ; toute clé utilisée par l'app va dans `apps/ios/Meeshy/Localizable.xcstrings`. `ShareExtensionLocalizationTests` échoue si une clé manque dans une seule locale, et n'extrait les clés demandées que depuis `MeeshyShareExtension/ShareViewController.swift` → **garder les `String(localized:)` de l'extension dans ce fichier**.
- **L'extension n'a AUCUNE dépendance SDK** (`project.yml`, target `MeeshyShareExtension`) : ni `MeeshySDK`, ni `MeeshyUI`, ni GRDB, ni Socket.IO. Frameworks système uniquement (`Foundation`, `Security`, `UIKit`, `SwiftUI`, `UniformTypeIdentifiers`, `os`).
- **Plafond mémoire 120 Mo dans l'extension.** Interdiction absolue de `Data(contentsOf:)` sur un fichier partagé — toute lecture de fichier est **streamée** par `FileHandle` en tranches de 64 Kio.
- **`nonisolated` sur le TYPE ET sur ses extensions** pour tout type de l'extension : la cible compile sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, le bundle de tests sous `nonisolated`. Sans l'annotation aux deux endroits, les conformances synthétisées divergent entre les deux contextes.
- **Tout nouveau fichier `.swift` doit être référencé au pbxproj** : `cd apps/ios && xcodegen generate`. Les fichiers sous `MeeshyTests/` et `MeeshyShareExtension/` sont auto-inclus par globbing ; un fichier de l'extension qui doit être **testé** doit EN PLUS être listé explicitement dans `sources:` du target `MeeshyTests` de `apps/ios/project.yml` (le dépôt a déjà vécu des suites vertes par omission).
- **Simulateur de référence** : iPhone 16 Pro, UDID `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5` (runtime iOS 18.2 — 18.5+/26.x crashent au teardown xctest).
- **`-only-testing` sélectionne des CLASSES**, jamais des fichiers.

### Commandes de vérification (référencées par les steps)

```bash
# COMPILE (app + bundle de tests) — à relancer après tout changement de sources ou de project.yml
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build

# EXÉCUTION d'une classe de tests app
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/<Classe> -derivedDataPath apps/ios/Build

# EXÉCUTION d'une classe de tests SDK
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshySDKTests/<Classe> && cd -

# GATE COMPLET (avant de clore un lot)
./apps/ios/meeshy.sh test
```

> **Nettoyage après repro CI** : `xcodegen generate` réécrit `project.pbxproj` + `Meeshy.xcscheme`. Les lignes qui AJOUTENT la référence d'un fichier neuf sont le correctif et se committent ; le reste du churn est un artefact → `git checkout --` dessus.

---

## INVARIANT PRODUIT — aucun destinataire ne voit une marque de transfert

**Décision du user, non négociable, et c'est la raison d'être de tout le mécanisme de fan-out :**

> « Il ne faut pas que les autres aient l'indicateur transfert ! On crée des messages pour les autres avec les mêmes identifiants d'URL d'attachement plutôt. Il ne faut pas que les autres y voient des messages ou attachements transférés en tout cas. »

Concrètement, pour un partage vers N destinataires :

1. La **première** cible reçoit un message avec ses `attachmentIds` — l'upload réel.
2. Les cibles **2..N** reçoivent chacune un message CRÉÉ avec `copyAttachmentsFromMessageId`, pointant le message de la première cible. **Jamais `forwardedFromId`.**
3. **Aucun destinataire ne voit de marque de transfert** : pas de badge « Transféré depuis … » sur le message (`MessageHandler.ts:1187-1195` + `ForwardBadgePolicy.swift:15-21`), pas de `forwardedFromAttachmentId` ni d'`isForwarded: true` sur les pièces jointes.
4. **Les `attachmentIds` de la source ne sont JAMAIS réutilisés tels quels.** `associateAttachmentsToMessage` est un `updateMany({ data: { messageId } })` (`services/attachments/AttachmentService.ts:161-173`) : il **déplace** la pièce jointe. Réutiliser les mêmes ids ferait perdre les pièces jointes au premier destinataire. Les copies sont de NOUVELLES lignes pointant les MÊMES fichiers (`filePath` / `fileUrl` identiques) — **aucun octet n'est ré-envoyé**.

Pourquoi cette règle existe : diffuser par transfert ferait afficher « Transféré depuis Famille » aux collègues. Partager vers « Famille » puis « Collègues » révélerait le nom de la première conversation à la seconde. **Inacceptable.**

**Ce que le client doit garantir, et ce que ce plan teste :** le payload d'envoi des cibles 2..N porte `copyAttachmentsFromMessageId` et **ne porte PAS** `forwardedFromId`. Vérifié à deux niveaux :

- Task 6 — `ShareSenderFanoutTests.test_body_forFollowingTargets_copiesAttachments_andNeverForwards` (le corps JSON écrit par l'extension) ;
- Task 9 — `SharePendingSendConsumerTests.test_consumeAll_followingTargets_neverCarryForwardMetadata` (la ligne d'outbox écrite par l'app) ;
- Task 10 — `ShareFanoutOriginResolverTests` + la garde de source sur `OutboxDispatcher`.

## Dépendance bloquante du lot B-1 : mode serveur « copier ces pièces jointes »

Le fan-out multi-cibles **ne fonctionne pas** sans le mode serveur, spécifié et livré par le **plan jumeau `docs/superpowers/plans/2026-08-19-forward-reach.md`, Task 5** (volet S.3 de la spec). Ce plan-ci ne le spécifie pas, ne le modifie pas, et ne duplique pas ses tests serveur.

**Ce que ce plan attend de lui, et rien d'autre :**

| Élément | Attendu |
|---|---|
| Champ du corps d'envoi | `copyAttachmentsFromMessageId: string` (optionnel) sur `POST /api/v1/conversations/:id/messages` |
| Sémantique | crée de NOUVELLES `MessageAttachment` pointant les mêmes `filePath`/`fileUrl` que celles du message source, **sans** écrire `forwardedFromId`, `forwardedFromAttachmentId` ni `isForwarded` |
| Garde de propriété | refus si l'appelant n'est pas l'auteur du message source |
| Garde d'échec | un échec de copie remonte au client (jamais de bulle vide) |

**Si le plan jumeau fixe un autre nom de champ**, seuls deux points de ce plan changent : la propriété `SendMessageRequest.copyAttachmentsFromMessageId` (Task 7) et l'argument passé par `OutboxDispatcher` (Task 10). Le reste de la chaîne (fiche, consommateur, outbox) transporte un **identifiant local** (`copyAttachmentsFromClientMessageId`) et n'est pas affecté.

**Ordre de livraison** : Tasks 1 à 9 et 11 sont livrables AVANT le mode serveur (elles ne touchent pas le réseau de fan-out). Task 10 exige `forward-reach.md` Task 5 déployée. Un partage multi-cibles enfilé avant reste durablement en outbox et part dès que le serveur l'accepte — aucune perte.

---

## Décisions figées par ce plan

| Décision | Valeur | Raison |
|---|---|---|
| Plafond de fichiers par partage | **20** | B.1 — le seau de rate limiting est PLATEFORME (300 req/min/IP, Fastify sans `trustProxy`) |
| Plafond de cibles par partage | **10** | B.1 — seau message 20/min/utilisateur |
| Plafond d'octets par partage | **500 Mio** (`524_288_000`) | Au-delà, la copie App Group elle-même devient un risque de disque plein sur un appareil chargé |
| Marge d'espace libre exigée | **128 Mio** au-delà des octets à copier | Marge de sécurité iOS avant que le système ne commence à purger |
| Taille de tranche de copie | **64 Kio** | B.2 — même arbitrage syscall/mémoire que `TusUploadManager.hashBufferSize` |
| **Seuil d'upload opportuniste (B-2)** | **8 Mio au total** (`8_388_608`), **et ≤ 4 fichiers** | Tient dans UNE tranche TUS de 10 Mo par fichier (1 POST + 1 PATCH chacun), pic mémoire ≤ 8 Mio sous un plafond de 120 Mo, et se termine en 2–4 s sur LTE — dans la fenêtre où la feuille de partage reste vivante. Au-dessus : rien n'est tenté, la fiche part telle quelle |
| Âge maximal d'une fiche | **7 jours** (`604_800` s) | Aujourd'hui `share_pending_sends` n'a ni cap ni TTL et n'est purgé qu'au logout |
| Taille de tranche TUS (B-2) | **10 Mio** | Parité exacte avec `TusUploadManager.chunkSize` (`OfflineQueue`/`TusUploadManager.swift:72`) |

---

## File Structure

### Créés — extension (`apps/ios/MeeshyShareExtension/`)

| Fichier | Responsabilité |
|---|---|
| `ShareLimits.swift` | Les plafonds du partage (fichiers, cibles, octets, seuil opportuniste) et les décisions PURES qui en découlent. Aucune E/S. |
| `ShareMediaStaging.swift` | Copie streamée d'un fichier reçu vers l'App Group : portée sécurisée, iCloud non téléchargé, espace libre, MIME. Aucune connaissance de la fiche. |
| `SharePendingShare.swift` | La fiche write-ahead v:1 (miroir EXTENSION) : structure, invariants de commit/suppression, dérivation des `clientMessageId` par cible. |
| `ShareTusClient.swift` | **(lot B-2)** Client TUS minimal : création, PATCH par tranches de 10 Mio, extraction de l'id d'attachment. Aucun checkpoint, aucune reprise. |

### Modifiés — extension

| Fichier | Changement |
|---|---|
| `Info.plist` | Trois clés d'activation (`Image`/`Movie`/`File`, valeur 20) ajoutées à l'`NSExtensionActivationRule` (`:37-43`). |
| `ShareViewController.swift` | Extraction des fichiers (copie SYNCHRONE dans la closure), écran en multi-sélection plafonnée à 10, câblage de `ForwardPickerModel`. |
| `ShareSender.swift` | `SharePendingSend` retiré (remplacé par `SharePendingShare`) ; envoi PAR CIBLE piloté par la fiche ; corps d'envoi enrichi. |

### Créés — app (`apps/ios/Meeshy/Features/Main/Services/`)

| Fichier | Responsabilité |
|---|---|
| `ShareFanoutOriginResolver.swift` | Décision PURE : une ligne d'outbox de fan-out est-elle prête à partir (origine acquittée) ou doit-elle attendre ? |

### Modifiés — app

| Fichier | Changement |
|---|---|
| `Features/Main/Components/ForwardPickerModel.swift` | `finishSend(_:outcome:)` → `finishSend(_:succeeded:reason:)` (issue primitive, `Foundation` seul). |
| `Features/Main/Components/ForwardPickerSheet.swift:330` | Unique appelant de production adapté. |
| `Features/Main/Services/MessageForwardService.swift` | `ForwardOutcome.succeeded` / `.failureReason` (le pont app-side vers l'issue primitive). |
| `Features/Main/Services/SharePendingSendConsumer.swift` | Miroir APP de la fiche v:1, enfilage PAR CIBLE, suppression du dossier média par le dernier consommateur, purge par âge. |
| `Features/Main/Services/OutboxDispatcher.swift` | Branche de fan-out : origine téléverse, cibles suivantes réclament la copie serveur. |

### Modifiés — SDK (`packages/MeeshySDK/Sources/MeeshySDK/`)

| Fichier | Changement |
|---|---|
| `Models/MessageModels.swift:578-620` | `SendMessageRequest.copyAttachmentsFromMessageId: String?`. |
| `Persistence/OfflineQueue.swift` | `OfflineQueueItem.copyAttachmentsFromClientMessageId: String?` ; `enqueueMedia` gagne `copyAttachmentsFromClientMessageId`, `deletesSourceFiles`, `createdAt` ; `enqueueMedia` rejoint le protocole `OfflineMessageQueueing` (`:517-544`). |

### Modifiés — projet

| Fichier | Changement |
|---|---|
| `apps/ios/project.yml` | `Meeshy/Features/Main/Components/ForwardPickerModel.swift` ajouté aux `sources:` de `MeeshyShareExtension` (précédent nouveau) ; `ShareLimits.swift`, `ShareMediaStaging.swift`, `SharePendingShare.swift`, `ShareTusClient.swift` ajoutés aux `sources:` de `MeeshyTests` (`:316-318`). |

### Tests

| Fichier | Statut |
|---|---|
| `apps/ios/MeeshyTests/Unit/Share/ShareExtensionSourceGuardTests.swift:122-142` | Modifié — contrat d'activation réécrit (3 clés, valeur 20) + gardes de streaming/portée sécurisée. |
| `apps/ios/MeeshyTests/Unit/Share/ShareLimitsTests.swift` | Créé |
| `apps/ios/MeeshyTests/Unit/Share/ShareMediaStagingTests.swift` | Créé |
| `apps/ios/MeeshyTests/Unit/Share/SharePendingShareTests.swift` | Créé |
| `apps/ios/MeeshyTests/Unit/Share/SharePendingSendContractTests.swift` | Modifié — contrat des deux miroirs v:1, états par cible compris |
| `apps/ios/MeeshyTests/Unit/Share/SharePendingSendConsumerTests.swift` | Modifié — reprise par cible, interruptions, purge |
| `apps/ios/MeeshyTests/Unit/Share/ShareSenderFanoutTests.swift` | Créé |
| `apps/ios/MeeshyTests/Unit/Share/ShareFanoutOriginResolverTests.swift` | Créé |
| `apps/ios/MeeshyTests/Unit/Share/ForwardPickerModelPortabilityGuardTests.swift` | Créé |
| `apps/ios/MeeshyTests/Unit/Share/ShareTusClientTests.swift` | Créé **(lot B-2)** |
| `apps/ios/MeeshyTests/Unit/Components/ForwardPickerModelTests.swift:24,45,56,63,71,79` | Modifié — six sites d'appel de `finishSend` |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OfflineQueueTests.swift` | Modifié — `enqueueMedia` étendu |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Models/MessageModelsTests.swift` | Modifié — encodage de `copyAttachmentsFromMessageId` |
| `apps/ios/MeeshyTests/Mocks/FakeOfflineMessageQueue.swift` | Modifié — conformance `enqueueMedia` |

---

# LOT B-1 — la fonction complète

Partager photos, vidéos, GIFs et documents à plusieurs personnes. À la fin de ce lot, la fonction est livrée.

---

## Task 1: Types déclarés à l'`Info.plist` et réécriture du garde de source

**Files:**
- Modify: `apps/ios/MeeshyShareExtension/Info.plist:37-43`
- Test: `apps/ios/MeeshyTests/Unit/Share/ShareExtensionSourceGuardTests.swift:122-142`

**Interfaces:**
- Consumes: rien (première tâche du lot).
- Produces: l'`NSExtensionActivationRule` déclare `NSExtensionActivationSupportsImageWithMaxCount = 20`, `NSExtensionActivationSupportsMovieWithMaxCount = 20`, `NSExtensionActivationSupportsFileWithMaxCount = 20`, en plus de `…SupportsText` et `…SupportsWebURLWithMaxCount = 1`. Les clés `NSExtensionActivationSupportsAttachmentsWithMinCount` / `…MaxCount` restent INTERDITES.

- [ ] **Step 1: Écrire le garde rouge (contrat d'activation)**

Remplacer intégralement `test_infoPlist_advertisesOnlyTextAndURL` (`:122-142`) par le bloc suivant, et ajouter le lecteur d'entier juste après :

```swift
    /// Contrat d'activation du lot B-1 : texte, URL, images, vidéos ET
    /// fichiers. L'ancienne version de ce garde ne vérifiait PAS
    /// `…SupportsFileWithMaxCount` — la troisième clé serait passée sans le
    /// faire rougir. Les trois valeurs sont vérifiées, pas seulement la
    /// présence des clés : c'est le plafond 20 qui contient le seau de rate
    /// limiting PLATEFORME (300 req/min/IP, Fastify sans `trustProxy`).
    func test_infoPlist_advertisesTextURLImageMovieAndFile() throws {
        let plist = try String(
            contentsOf: extensionDirectory.appendingPathComponent("Info.plist"),
            encoding: .utf8
        )

        XCTAssertTrue(plist.contains("NSExtensionActivationSupportsText"))
        XCTAssertTrue(plist.contains("NSExtensionActivationSupportsWebURLWithMaxCount"))

        for key in [
            "NSExtensionActivationSupportsImageWithMaxCount",
            "NSExtensionActivationSupportsMovieWithMaxCount",
            "NSExtensionActivationSupportsFileWithMaxCount"
        ] {
            XCTAssertEqual(
                Self.integerValue(of: key, in: plist), 20,
                "\(key) doit valoir 20 — sans la clé Meeshy n'apparaît pas dans la feuille "
                + "de partage correspondante ; au-delà de 20 le seau de rate limiting "
                + "plateforme rend le partage inatteignable"
            )
        }

        for unsupported in [
            "NSExtensionActivationSupportsAttachmentsWithMinCount",
            "NSExtensionActivationSupportsAttachmentsWithMaxCount"
        ] {
            XCTAssertFalse(
                plist.contains(unsupported),
                "\(unsupported) est REDONDANTE avec les règles par type, et moins précise qu'elles"
            )
        }
    }

    /// Lit `<key>K</key> … <integer>N</integer>` sans dépendre de l'indentation.
    private static func integerValue(of key: String, in plist: String) -> Int? {
        guard let keyRange = plist.range(of: "<key>\(key)</key>") else { return nil }
        let tail = plist[keyRange.upperBound...]
        guard let open = tail.range(of: "<integer>"),
              let close = tail.range(of: "</integer>"),
              open.upperBound <= close.lowerBound else { return nil }
        return Int(tail[open.upperBound..<close.lowerBound]
            .trimmingCharacters(in: .whitespacesAndNewlines))
    }
```

- [ ] **Step 2: Vérifier l'échec**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/ShareExtensionSourceGuardTests -derivedDataPath apps/ios/Build
```

Attendu : `test_infoPlist_advertisesTextURLImageMovieAndFile` ÉCHOUE trois fois — `XCTAssertEqual failed: ("nil") is not equal to ("Optional(20)")` pour chacune des trois clés.

- [ ] **Step 3: Déclarer les trois types**

Remplacer le dictionnaire `NSExtensionActivationRule` (`Info.plist:38-43`) par :

```xml
			<dict>
				<key>NSExtensionActivationSupportsFileWithMaxCount</key>
				<integer>20</integer>
				<key>NSExtensionActivationSupportsImageWithMaxCount</key>
				<integer>20</integer>
				<key>NSExtensionActivationSupportsMovieWithMaxCount</key>
				<integer>20</integer>
				<key>NSExtensionActivationSupportsText</key>
				<true/>
				<key>NSExtensionActivationSupportsWebURLWithMaxCount</key>
				<integer>1</integer>
			</dict>
```

- [ ] **Step 4: Vérifier le succès**

Rejouer la commande du Step 2. Attendu : `ShareExtensionSourceGuardTests` PASSE (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/ios/MeeshyShareExtension/Info.plist \
        apps/ios/MeeshyTests/Unit/Share/ShareExtensionSourceGuardTests.swift
git commit -- apps/ios/MeeshyShareExtension/Info.plist \
               apps/ios/MeeshyTests/Unit/Share/ShareExtensionSourceGuardTests.swift \
  -m "feat(ios): l'extension de partage s'annonce enfin pour les images, videos et fichiers"
```

---

## Task 2: Copie streamée des fichiers reçus dans l'App Group

**Files:**
- Create: `apps/ios/MeeshyShareExtension/ShareLimits.swift`
- Create: `apps/ios/MeeshyShareExtension/ShareMediaStaging.swift`
- Modify: `apps/ios/project.yml:316-318` (sources de `MeeshyTests`)
- Modify: `apps/ios/MeeshyTests/Unit/Share/ShareExtensionSourceGuardTests.swift` (deux gardes ajoutés)
- Test: `apps/ios/MeeshyTests/Unit/Share/ShareLimitsTests.swift`
- Test: `apps/ios/MeeshyTests/Unit/Share/ShareMediaStagingTests.swift`

**Interfaces:**
- Consumes: rien du plan.
- Produces:

```swift
nonisolated enum ShareLimits {
    static let maxFiles: Int
    static let maxTargets: Int
    static let maxTotalBytes: Int
    static let freeSpaceMarginBytes: Int
    static func canSelectMore(selectedCount: Int, isAlreadySelected: Bool) -> Bool
    static func fitsFileCount(_ count: Int) -> Bool
    static func fitsByteBudget(_ totalBytes: Int) -> Bool
}

nonisolated struct ShareStagedMedia: Codable, Equatable, Sendable {
    let relPath: String
    let ext: String
    let mime: String
    let bytes: Int
    init(relPath: String, ext: String, mime: String, bytes: Int)
}

nonisolated enum ShareMediaStagingError: Error, Equatable {
    case appGroupUnavailable
    case notDownloadedFromICloud
    case insufficientFreeSpace(needed: Int, free: Int)
    case byteBudgetExceeded(total: Int, limit: Int)
    case fileCountExceeded(count: Int, limit: Int)
    case copyFailed(String)
}

nonisolated enum ShareMediaStaging {
    static let directoryName: String            // "share_pending_media"
    static let copyBufferSize: Int              // 64 * 1024
    static func mediaRootURL() -> URL?
    /// Crée `<racine>/<shareId>/` et renvoie la RACINE (les `relPath` sont
    /// relatifs à elle) — d'où `prepare…`, pas `directoryURL`.
    static func prepareMediaRoot(shareId: String) -> URL?
    static func isNotDownloaded(ubiquitousDownloadingStatus: String?) -> Bool
    static func requiredFreeBytes(for bytes: Int) -> Int
    static func mimeType(typeIdentifier: String?, fileExtension: String) -> String
    static func streamCopy(from source: URL, to destination: URL, bufferSize: Int) throws -> Int
    static func stage(source: URL, into directory: URL, shareId: String,
                      index: Int, mime: String, freeBytes: Int) throws -> ShareStagedMedia
    static func availableCapacityBytes(at url: URL) -> Int
    static func discard(shareId: String, in mediaRoot: URL)
}
```

- [ ] **Step 1: Écrire les tests rouges des plafonds**

Créer `apps/ios/MeeshyTests/Unit/Share/ShareLimitsTests.swift` :

```swift
import XCTest

/// Les plafonds de B.1 ne sont pas des préférences : ils sont IMPOSÉS par le
/// rate limiting réel (seau global 300 req/min PAR IP — Fastify tourne sans
/// `trustProxy` derrière Traefik, c'est donc un seau PLATEFORME ; seau message
/// 20/min/utilisateur). Le composer in-app conserve 199 pièces jointes ; le
/// partage, non.
final class ShareLimitsTests: XCTestCase {

    func test_limits_matchTheRateLimitingBudget() {
        XCTAssertEqual(ShareLimits.maxFiles, 20)
        XCTAssertEqual(ShareLimits.maxTargets, 10)
        XCTAssertEqual(ShareLimits.maxTotalBytes, 524_288_000)
    }

    func test_canSelectMore_belowCap_isAllowed() {
        XCTAssertTrue(ShareLimits.canSelectMore(selectedCount: 9, isAlreadySelected: false))
    }

    func test_canSelectMore_atCap_isRefused() {
        XCTAssertFalse(
            ShareLimits.canSelectMore(selectedCount: 10, isAlreadySelected: false),
            "la 11e cible dépasserait le seau message de 20/minute/utilisateur"
        )
    }

    /// Décocher une cible déjà sélectionnée ne consomme rien : le refuser
    /// enfermerait l'utilisateur dans une sélection qu'il ne peut plus défaire.
    func test_canSelectMore_atCap_forAnAlreadySelectedTarget_isAllowed() {
        XCTAssertTrue(ShareLimits.canSelectMore(selectedCount: 10, isAlreadySelected: true))
    }

    func test_fitsFileCount_atAndBeyondCap() {
        XCTAssertTrue(ShareLimits.fitsFileCount(20))
        XCTAssertFalse(ShareLimits.fitsFileCount(21))
    }

    func test_fitsByteBudget_atAndBeyondCap() {
        XCTAssertTrue(ShareLimits.fitsByteBudget(524_288_000))
        XCTAssertFalse(ShareLimits.fitsByteBudget(524_288_001))
    }
}
```

- [ ] **Step 2: Écrire les tests rouges de la copie streamée**

Créer `apps/ios/MeeshyTests/Unit/Share/ShareMediaStagingTests.swift` :

```swift
import XCTest

/// `loadFileRepresentation` SUPPRIME l'URL fournie au retour de sa closure :
/// la copie doit être faite DANS la closure, de façon synchrone, par flux.
/// Ces tests portent sur la partie décidable de cette copie — le streaming
/// lui-même, les refus explicites, et la dérivation du MIME.
final class ShareMediaStagingTests: XCTestCase {

    // MARK: - Bac à sable

    private func makeDirectory() throws -> URL {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("share-staging-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private func makeFile(bytes: Int, ext: String, in directory: URL) throws -> URL {
        let url = directory.appendingPathComponent("source-\(UUID().uuidString).\(ext)")
        // Motif non constant : une copie qui tronquerait ou dupliquerait une
        // tranche produirait des octets DIFFÉRENTS, pas seulement une taille
        // différente.
        var payload = Data(capacity: bytes)
        for index in 0..<bytes { payload.append(UInt8(index % 251)) }
        try payload.write(to: url)
        return url
    }

    // MARK: - Streaming

    /// Le fichier de test dépasse DEUX tranches : une implémentation qui lirait
    /// tout d'un coup passerait un test à 1 Kio et échouerait en production sur
    /// une vidéo de 400 Mo, sous un plafond mémoire de 120 Mo.
    func test_streamCopy_acrossSeveralBuffers_reproducesTheBytesExactly() throws {
        let dir = try makeDirectory()
        let source = try makeFile(bytes: 64 * 1024 * 2 + 137, ext: "bin", in: dir)
        let destination = dir.appendingPathComponent("copy.bin")

        let written = try ShareMediaStaging.streamCopy(
            from: source, to: destination, bufferSize: ShareMediaStaging.copyBufferSize
        )

        XCTAssertEqual(written, 64 * 1024 * 2 + 137)
        XCTAssertEqual(
            try Data(contentsOf: destination), try Data(contentsOf: source),
            "les octets copiés doivent être IDENTIQUES, pas seulement de même taille"
        )
    }

    func test_streamCopy_onEmptySource_producesAnEmptyFile() throws {
        let dir = try makeDirectory()
        let source = try makeFile(bytes: 0, ext: "bin", in: dir)
        let destination = dir.appendingPathComponent("copy.bin")

        XCTAssertEqual(try ShareMediaStaging.streamCopy(
            from: source, to: destination, bufferSize: 64 * 1024), 0)
        XCTAssertTrue(FileManager.default.fileExists(atPath: destination.path))
    }

    func test_streamCopy_overAnExistingDestination_overwritesIt() throws {
        let dir = try makeDirectory()
        let source = try makeFile(bytes: 512, ext: "bin", in: dir)
        let destination = dir.appendingPathComponent("copy.bin")
        try Data(repeating: 0xFF, count: 4096).write(to: destination)

        _ = try ShareMediaStaging.streamCopy(from: source, to: destination, bufferSize: 64 * 1024)

        XCTAssertEqual(try Data(contentsOf: destination).count, 512,
                       "un résidu d'une tentative précédente ne doit pas survivre à la copie")
    }

    // MARK: - Mise en scène complète

    func test_stage_writesUnderTheShareSubdirectory_withTheOriginalExtension() throws {
        let dir = try makeDirectory()
        let source = try makeFile(bytes: 2048, ext: "HEIC", in: dir)
        let mediaRoot = try makeDirectory()

        let staged = try ShareMediaStaging.stage(
            source: source, into: mediaRoot, shareId: "cid_abc",
            index: 3, mime: "image/heic", freeBytes: 1_000_000_000
        )

        XCTAssertEqual(staged.relPath, "cid_abc/3.heic",
                       "l'extension est PRÉSERVÉE en minuscules — le consommateur en dérive le MIME")
        XCTAssertEqual(staged.ext, "heic")
        XCTAssertEqual(staged.mime, "image/heic")
        XCTAssertEqual(staged.bytes, 2048)
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: mediaRoot.appendingPathComponent(staged.relPath).path))
    }

    func test_stage_withoutExtension_fallsBackToBin() throws {
        let dir = try makeDirectory()
        let source = dir.appendingPathComponent("sans-extension")
        try Data(repeating: 7, count: 16).write(to: source)
        let mediaRoot = try makeDirectory()

        let staged = try ShareMediaStaging.stage(
            source: source, into: mediaRoot, shareId: "cid_abc",
            index: 0, mime: "application/octet-stream", freeBytes: 1_000_000_000
        )

        XCTAssertEqual(staged.relPath, "cid_abc/0.bin")
    }

    /// Un disque plein transformerait la copie en fichier TRONQUÉ, donc en
    /// pièce jointe corrompue livrée sans un mot. Le refus est explicite.
    func test_stage_withoutEnoughFreeSpace_refusesBeforeCopying() throws {
        let dir = try makeDirectory()
        let source = try makeFile(bytes: 4096, ext: "mp4", in: dir)
        let mediaRoot = try makeDirectory()

        XCTAssertThrowsError(try ShareMediaStaging.stage(
            source: source, into: mediaRoot, shareId: "cid_abc",
            index: 0, mime: "video/mp4", freeBytes: 4096
        )) { error in
            XCTAssertEqual(
                error as? ShareMediaStagingError,
                .insufficientFreeSpace(needed: 4096 + ShareLimits.freeSpaceMarginBytes, free: 4096)
            )
        }
        XCTAssertFalse(FileManager.default.fileExists(
            atPath: mediaRoot.appendingPathComponent("cid_abc/0.mp4").path),
            "aucun octet ne doit être écrit quand la place manque")
    }

    func test_requiredFreeBytes_addsTheSafetyMargin() {
        XCTAssertEqual(ShareMediaStaging.requiredFreeBytes(for: 1_000),
                       1_000 + ShareLimits.freeSpaceMarginBytes)
    }

    // MARK: - iCloud non téléchargé

    /// Un média iCloud non téléchargé produit un fichier VIDE : le laisser
    /// passer livrerait une pièce jointe de zéro octet.
    func test_isNotDownloaded_forANotDownloadedUbiquitousItem_isTrue() {
        XCTAssertTrue(ShareMediaStaging.isNotDownloaded(
            ubiquitousDownloadingStatus: URLUbiquitousItemDownloadingStatus.notDownloaded.rawValue))
    }

    func test_isNotDownloaded_forACurrentUbiquitousItem_isFalse() {
        XCTAssertFalse(ShareMediaStaging.isNotDownloaded(
            ubiquitousDownloadingStatus: URLUbiquitousItemDownloadingStatus.current.rawValue))
    }

    /// Un fichier local ordinaire n'a PAS de statut ubiquitaire : l'absence de
    /// valeur ne doit jamais être lue comme « non téléchargé ».
    func test_isNotDownloaded_forANonUbiquitousFile_isFalse() {
        XCTAssertFalse(ShareMediaStaging.isNotDownloaded(ubiquitousDownloadingStatus: nil))
    }

    // MARK: - MIME

    func test_mimeType_prefersTheTypeIdentifier() {
        XCTAssertEqual(
            ShareMediaStaging.mimeType(typeIdentifier: "com.compuserve.gif", fileExtension: "bin"),
            "image/gif",
            "un GIF conforme à public.image doit rester un image/gif, pas devenir un octet-stream"
        )
    }

    func test_mimeType_fallsBackToTheExtension() {
        XCTAssertEqual(
            ShareMediaStaging.mimeType(typeIdentifier: nil, fileExtension: "pdf"),
            "application/pdf"
        )
    }

    func test_mimeType_withNothingUsable_isOctetStream() {
        XCTAssertEqual(
            ShareMediaStaging.mimeType(typeIdentifier: nil, fileExtension: ""),
            "application/octet-stream",
            "getAttachmentType retombe sur `document` côté serveur — c'est ce qui fait passer .xls"
        )
    }

    // MARK: - Abandon

    func test_discard_removesTheWholeShareDirectory() throws {
        let mediaRoot = try makeDirectory()
        let shareDir = mediaRoot.appendingPathComponent("cid_abc", isDirectory: true)
        try FileManager.default.createDirectory(at: shareDir, withIntermediateDirectories: true)
        try Data(repeating: 1, count: 8).write(to: shareDir.appendingPathComponent("0.jpg"))

        ShareMediaStaging.discard(shareId: "cid_abc", in: mediaRoot)

        XCTAssertFalse(FileManager.default.fileExists(atPath: shareDir.path))
    }

    func test_discard_onAnAbsentDirectory_isSilent() throws {
        let mediaRoot = try makeDirectory()
        ShareMediaStaging.discard(shareId: "jamais-vu", in: mediaRoot)
    }
}
```

- [ ] **Step 3: Vérifier l'échec de compilation**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
```

Attendu : `** TEST FAILED **` / exit 65 avec `error: cannot find 'ShareLimits' in scope` et `cannot find 'ShareMediaStaging' in scope`. C'est un échec de COMPILE du bundle de tests, la forme normale du RED en Swift.

- [ ] **Step 4: Écrire `ShareLimits.swift`**

Créer `apps/ios/MeeshyShareExtension/ShareLimits.swift` :

```swift
import Foundation

/// Les plafonds du partage, et RIEN d'autre : aucune E/S, aucun état.
///
/// Ils ne sont pas des préférences de confort. Le cap produit par message est
/// bien 199 (`packages/shared/types/attachment.ts:416`), mais le rate limiting
/// le rend inatteignable depuis un partage : le seau global est de 300
/// requêtes/minute PAR IP et Fastify tourne sans `trustProxy` derrière Traefik
/// (`middleware/rate-limiter.ts:69-84`) — c'est donc un seau PLATEFORME, partagé
/// par tous les utilisateurs d'un même réseau. Chaque fichier coûte une création
/// TUS plus autant de PATCH que de tranches de 10 Mo. Le seau message, lui, est
/// de 20/minute/utilisateur (`rate-limiter.ts:20-39`) — d'où les 10 cibles.
nonisolated enum ShareLimits {

    static let maxFiles = 20
    static let maxTargets = 10

    /// 500 Mio. Au-delà, la copie App Group elle-même devient un risque de
    /// disque plein sur un appareil chargé — bien avant que le réseau ne soit
    /// en cause.
    static let maxTotalBytes = 524_288_000

    /// 128 Mio exigés AU-DELÀ des octets à copier. Sous cette marge, iOS
    /// commence à purger des caches système et une copie longue peut se
    /// retrouver tronquée en cours de route.
    static let freeSpaceMarginBytes = 134_217_728

    /// Décocher une cible déjà sélectionnée ne consomme aucun budget : la
    /// refuser au plafond enfermerait l'utilisateur dans une sélection qu'il
    /// ne pourrait plus défaire.
    static func canSelectMore(selectedCount: Int, isAlreadySelected: Bool) -> Bool {
        isAlreadySelected || selectedCount < maxTargets
    }

    static func fitsFileCount(_ count: Int) -> Bool { count <= maxFiles }

    static func fitsByteBudget(_ totalBytes: Int) -> Bool { totalBytes <= maxTotalBytes }
}
```

- [ ] **Step 5: Écrire `ShareMediaStaging.swift`**

Créer `apps/ios/MeeshyShareExtension/ShareMediaStaging.swift` :

```swift
import Foundation
import UniformTypeIdentifiers

/// Un fichier déjà copié dans le conteneur App Group, décrit par la fiche.
///
/// `relPath` est relatif à `share_pending_media/` — c'est ce que l'app relit,
/// et c'est ce qui permet aux deux process de désigner le même octet sans
/// partager un chemin absolu (leurs conteneurs diffèrent).
nonisolated struct ShareStagedMedia: Codable, Equatable, Sendable {
    let relPath: String
    let ext: String
    let mime: String
    let bytes: Int

    init(relPath: String, ext: String, mime: String, bytes: Int) {
        self.relPath = relPath
        self.ext = ext
        self.mime = mime
        self.bytes = bytes
    }
}

nonisolated enum ShareMediaStagingError: Error, Equatable {
    case appGroupUnavailable
    case notDownloadedFromICloud
    case insufficientFreeSpace(needed: Int, free: Int)
    case byteBudgetExceeded(total: Int, limit: Int)
    case fileCountExceeded(count: Int, limit: Int)
    case copyFailed(String)
}

/// Copie des fichiers reçus vers le conteneur App Group.
///
/// Trois contraintes dictent la forme de ce code :
///
/// 1. `loadFileRepresentation` SUPPRIME l'URL qu'il fournit au retour de sa
///    closure — la copie doit être faite DANS la closure, de façon synchrone ;
/// 2. le process est plafonné à ~120 Mo — la copie est STREAMÉE par tranches
///    de 64 Kio, jamais `Data(contentsOf:)` ;
/// 3. une URL issue de Fichiers/iCloud est security-scoped — l'appelant
///    (`ShareViewController`) appaire `startAccessingSecurityScopedResource` /
///    `stopAccessing…` autour de l'appel à `stage`.
nonisolated enum ShareMediaStaging {

    static let directoryName = "share_pending_media"

    /// 64 Kio : même arbitrage syscall/mémoire que la digestion SHA-256 du
    /// `TusUploadManager` du SDK. Chaque lecture alloue un `Data` neuf, drainé
    /// et relâché dans l'autoreleasepool de la boucle.
    static let copyBufferSize = 64 * 1024

    // MARK: - Emplacements

    static func mediaRootURL() -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: ShareSession.appGroupIdentifier)?
            .appendingPathComponent(directoryName, isDirectory: true)
    }

    /// Crée `<racine>/<shareId>/` et renvoie la **racine** : les `relPath` de
    /// la fiche sont relatifs à elle, et c'est elle que les deux process
    /// résolvent chacun dans son propre conteneur. Le sous-dossier est créé
    /// ici parce que la copie qui suit a besoin d'un répertoire existant.
    static func prepareMediaRoot(shareId: String) -> URL? {
        guard let root = mediaRootURL() else { return nil }
        try? FileManager.default.createDirectory(
            at: root.appendingPathComponent(shareId, isDirectory: true),
            withIntermediateDirectories: true)
        return root
    }

    // MARK: - Décisions pures

    /// L'ABSENCE de statut signifie « fichier local ordinaire », jamais
    /// « non téléchargé » : confondre les deux refuserait tous les partages
    /// venant de Photos.
    static func isNotDownloaded(ubiquitousDownloadingStatus: String?) -> Bool {
        guard let ubiquitousDownloadingStatus else { return false }
        return ubiquitousDownloadingStatus == URLUbiquitousItemDownloadingStatus.notDownloaded.rawValue
    }

    static func requiredFreeBytes(for bytes: Int) -> Int {
        bytes + ShareLimits.freeSpaceMarginBytes
    }

    /// L'identifiant de type système prime : il distingue un GIF
    /// (`com.compuserve.gif`, conforme à `public.image`) d'un JPEG là où une
    /// extension peut mentir ou manquer. Sans rien d'utilisable, le repli est
    /// `application/octet-stream` — côté serveur `getAttachmentType` retombe
    /// alors sur `document`, ce qui fait justement passer `.xls`/`.xlsx`.
    static func mimeType(typeIdentifier: String?, fileExtension: String) -> String {
        if let typeIdentifier,
           let mime = UTType(typeIdentifier)?.preferredMIMEType {
            return mime
        }
        if !fileExtension.isEmpty,
           let mime = UTType(filenameExtension: fileExtension.lowercased())?.preferredMIMEType {
            return mime
        }
        return "application/octet-stream"
    }

    // MARK: - Copie

    /// Copie `source` vers `destination` par tranches, et renvoie le nombre
    /// d'octets écrits. Une destination existante est REMPLACÉE — un résidu
    /// d'une tentative précédente ne doit jamais survivre.
    @discardableResult
    static func streamCopy(from source: URL, to destination: URL, bufferSize: Int) throws -> Int {
        if FileManager.default.fileExists(atPath: destination.path) {
            try FileManager.default.removeItem(at: destination)
        }
        guard FileManager.default.createFile(atPath: destination.path, contents: nil) else {
            throw ShareMediaStagingError.copyFailed("destination non créable")
        }

        let reader = try FileHandle(forReadingFrom: source)
        defer { try? reader.close() }
        let writer = try FileHandle(forWritingTo: destination)
        defer { try? writer.close() }

        var written = 0
        while true {
            let chunk = try autoreleasepool { () -> Data? in
                try reader.read(upToCount: bufferSize)
            }
            guard let chunk, !chunk.isEmpty else { break }
            try writer.write(contentsOf: chunk)
            written += chunk.count
        }
        return written
    }

    /// Copie UN fichier reçu vers `<mediaRoot>/<shareId>/<index>.<ext>`.
    ///
    /// L'espace libre est contrôlé AVANT le premier octet : un disque plein en
    /// cours de copie produirait un fichier tronqué, donc une pièce jointe
    /// corrompue livrée sans un mot.
    static func stage(
        source: URL,
        into mediaRoot: URL,
        shareId: String,
        index: Int,
        mime: String,
        freeBytes: Int
    ) throws -> ShareStagedMedia {
        let values = try? source.resourceValues(
            forKeys: [.fileSizeKey, .ubiquitousItemDownloadingStatusKey])

        if isNotDownloaded(ubiquitousDownloadingStatus: values?.ubiquitousItemDownloadingStatus?.rawValue) {
            throw ShareMediaStagingError.notDownloadedFromICloud
        }

        let bytes = values?.fileSize ?? 0
        let needed = requiredFreeBytes(for: bytes)
        guard freeBytes >= needed else {
            throw ShareMediaStagingError.insufficientFreeSpace(needed: needed, free: freeBytes)
        }

        let ext = source.pathExtension.isEmpty ? "bin" : source.pathExtension.lowercased()
        let directory = mediaRoot.appendingPathComponent(shareId, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        } catch {
            throw ShareMediaStagingError.copyFailed(error.localizedDescription)
        }

        let relPath = "\(shareId)/\(index).\(ext)"
        let destination = mediaRoot.appendingPathComponent(relPath)
        let written: Int
        do {
            written = try streamCopy(from: source, to: destination, bufferSize: copyBufferSize)
        } catch let error as ShareMediaStagingError {
            throw error
        } catch {
            throw ShareMediaStagingError.copyFailed(error.localizedDescription)
        }

        return ShareStagedMedia(relPath: relPath, ext: ext, mime: mime, bytes: written)
    }

    // MARK: - Câblage système

    static func availableCapacityBytes(at url: URL) -> Int {
        let values = try? url.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
        guard let capacity = values?.volumeAvailableCapacityForImportantUsage else { return 0 }
        return Int(clamping: capacity)
    }

    /// Rend les octets d'un partage abandonné ou entièrement servi.
    static func discard(shareId: String, in mediaRoot: URL) {
        let directory = mediaRoot.appendingPathComponent(shareId, isDirectory: true)
        try? FileManager.default.removeItem(at: directory)
    }
}
```

- [ ] **Step 6: Câbler les deux fichiers au bundle de tests**

Dans `apps/ios/project.yml`, target `MeeshyTests`, juste après la ligne `- path: MeeshyShareExtension/ShareSender.swift` (`:318`), ajouter :

```yaml
      # Lot B-1 : plafonds et copie streamée. `ShareMediaStaging` importe
      # UniformTypeIdentifiers (framework système, disponible au bundle de
      # tests) et n'a aucune dépendance UIKit — comme les trois helpers
      # au-dessus, il vit dans une cible app-extension que
      # `@testable import Meeshy` n'atteint pas.
      - path: MeeshyShareExtension/ShareLimits.swift
      - path: MeeshyShareExtension/ShareMediaStaging.swift
```

- [ ] **Step 7: Vérifier le succès**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/ShareLimitsTests \
  -only-testing:MeeshyTests/ShareMediaStagingTests -derivedDataPath apps/ios/Build
```

Attendu : `ShareLimitsTests` (6 tests) et `ShareMediaStagingTests` (13 tests) PASSENT.

- [ ] **Step 8: Ajouter les deux gardes de source (RED)**

Dans `apps/ios/MeeshyTests/Unit/Share/ShareExtensionSourceGuardTests.swift`, ajouter un helper et deux tests après `test_infoPlist_advertisesTextURLImageMovieAndFile` :

```swift
    private func assertPresent(_ needle: String, in fileName: String, because reason: String) throws {
        let file = try XCTUnwrap(
            try swiftSources().first { $0.name == fileName },
            "\(fileName) est absent de l'extension"
        )
        XCTAssertTrue(
            strippingComments(file.code).contains(needle),
            "\(fileName) ne contient pas « \(needle) » — \(reason)"
        )
    }

    /// Le process est plafonné à ~120 Mo : lire une vidéo de 400 Mo d'un seul
    /// tenant le fait tuer par le système AVANT la première ligne de la fiche.
    func test_extension_neverReadsAWholeFileIntoMemory() throws {
        try assertAbsent(
            "Data(contentsOf:",
            because: "le plafond mémoire de 120 Mo impose un streaming par FileHandle"
        )
    }

    /// Une URL issue de Fichiers/iCloud est security-scoped : sans la paire
    /// start/stop, la lecture échoue silencieusement et le partage livre un
    /// fichier vide.
    func test_extension_pairsTheSecurityScopedAccess() throws {
        try assertPresent(
            "startAccessingSecurityScopedResource",
            in: "ShareViewController.swift",
            because: "une URL de Fichiers/iCloud n'est lisible que sous portée sécurisée"
        )
        try assertPresent(
            "stopAccessingSecurityScopedResource",
            in: "ShareViewController.swift",
            because: "une portée ouverte et jamais refermée fuit une ressource du système"
        )
    }
```

- [ ] **Step 9: Vérifier l'échec du second garde**

Rejouer la commande du Step 7 en remplaçant les `-only-testing` par `-only-testing:MeeshyTests/ShareExtensionSourceGuardTests`.

Attendu : `test_extension_neverReadsAWholeFileIntoMemory` PASSE (aucun code ne le viole encore) et `test_extension_pairsTheSecurityScopedAccess` ÉCHOUE — `ShareViewController.swift ne contient pas « startAccessingSecurityScopedResource »`. Ce garde reste rouge jusqu'à la Task 6, qui câble l'extraction : **le noter dans le commit** et ne pas le contourner.

Pour garder l'arbre vert entre les deux tâches, marquer temporairement ce seul test :

```swift
    func test_extension_pairsTheSecurityScopedAccess() throws {
        try XCTSkipIf(true, "Activé par la Task 6 (extraction des fichiers dans ShareViewController)")
```

- [ ] **Step 10: Commit**

```bash
git add apps/ios/MeeshyShareExtension/ShareLimits.swift \
        apps/ios/MeeshyShareExtension/ShareMediaStaging.swift \
        apps/ios/MeeshyTests/Unit/Share/ShareLimitsTests.swift \
        apps/ios/MeeshyTests/Unit/Share/ShareMediaStagingTests.swift \
        apps/ios/MeeshyTests/Unit/Share/ShareExtensionSourceGuardTests.swift \
        apps/ios/project.yml apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -- apps/ios/MeeshyShareExtension/ShareLimits.swift \
               apps/ios/MeeshyShareExtension/ShareMediaStaging.swift \
               apps/ios/MeeshyTests/Unit/Share/ShareLimitsTests.swift \
               apps/ios/MeeshyTests/Unit/Share/ShareMediaStagingTests.swift \
               apps/ios/MeeshyTests/Unit/Share/ShareExtensionSourceGuardTests.swift \
               apps/ios/project.yml apps/ios/Meeshy.xcodeproj/project.pbxproj \
  -m "feat(ios): un fichier partage se copie par flux, sous controle d'espace et de portee"
```

---

## Task 3: La fiche write-ahead versionnée — miroir extension

**Files:**
- Create: `apps/ios/MeeshyShareExtension/SharePendingShare.swift`
- Modify: `apps/ios/MeeshyShareExtension/ShareSender.swift:143-197` (retrait de `SharePendingSend`)
- Modify: `apps/ios/project.yml` (sources de `MeeshyTests`)
- Test: `apps/ios/MeeshyTests/Unit/Share/SharePendingShareTests.swift`

**Interfaces:**
- Consumes: `ShareStagedMedia` (Task 2), `ShareSession.appGroupIdentifier` (existant, `ShareSession.swift:29`).
- Produces:

```swift
nonisolated struct SharePendingShare: Codable, Equatable, Sendable {
    typealias Media = ShareStagedMedia

    nonisolated enum TargetState: String, Codable, Equatable, Sendable {
        case pending, sent, failed
    }
    nonisolated struct Target: Codable, Equatable, Sendable {
        let conversationId: String
        var state: TargetState
        var serverMessageId: String?
        init(conversationId: String, state: TargetState = .pending, serverMessageId: String? = nil)
    }

    let v: Int
    let clientMessageId: String
    let createdAt: Date
    let content: String?
    var media: [Media]
    var uploadedAttachmentIds: [String]?
    var targets: [Target]
    var originTargetIndex: Int?

    static let currentVersion: Int                 // 1
    static let appGroupIdentifier: String          // "group.me.meeshy.apps"
    static let directoryName: String               // "share_pending_sends"
    static let mediaDirectoryName: String          // "share_pending_media"

    static func make(shareId: String, createdAt: Date, content: String?,
                     media: [Media], conversationIds: [String]) -> SharePendingShare
    static func derivedClientMessageId(shareId: String, targetIndex: Int) -> String
    static func encoder() -> JSONEncoder
    static func directoryURL() -> URL?

    var fileName: String
    var isFullyServed: Bool
    func commit(in directory: URL) throws
    @discardableResult func commitLive() -> Bool
}
```

- [ ] **Step 1: Écrire les tests rouges de la fiche**

Créer `apps/ios/MeeshyTests/Unit/Share/SharePendingShareTests.swift` :

```swift
import XCTest

/// La fiche est un write-ahead : elle est réécrite ATOMIQUEMENT à chaque
/// transition (fichiers copiés, upload terminé, cible servie) et n'est
/// supprimée que lorsque TOUTES les cibles sont `sent`.
///
/// Sans le premier invariant, une interruption après l'upload
/// re-téléverserait plusieurs gigaoctets (les attachments orphelins ne sont
/// balayés qu'à H+24). Sans le second, une interruption après la première
/// cible perdrait les suivantes SANS TRACE : le `clientMessageId` ne
/// dédoublonne que sur `(conversationId, clientMessageId)`, il ne rattrape
/// pas une cible jamais servie.
final class SharePendingShareTests: XCTestCase {

    private func makeDirectory() throws -> URL {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("share-fiche-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private func makeShare(
        shareId: String = "cid_00000000-0000-4000-8000-000000000000",
        media: [ShareStagedMedia] = [],
        conversationIds: [String] = ["conv1", "conv2"]
    ) -> SharePendingShare {
        SharePendingShare.make(
            shareId: shareId,
            createdAt: Date(timeIntervalSince1970: 1_785_000_000),
            content: "bonjour",
            media: media,
            conversationIds: conversationIds
        )
    }

    private let photo = ShareStagedMedia(
        relPath: "cid_00000000-0000-4000-8000-000000000000/0.jpg",
        ext: "jpg", mime: "image/jpeg", bytes: 2048
    )

    // MARK: - Construction

    func test_make_stampsTheCurrentVersion() {
        XCTAssertEqual(makeShare().v, 1)
        XCTAssertEqual(SharePendingShare.currentVersion, 1)
    }

    func test_make_marksEveryTargetPending() {
        let share = makeShare()
        XCTAssertEqual(share.targets.map(\.conversationId), ["conv1", "conv2"])
        XCTAssertEqual(share.targets.map(\.state), [.pending, .pending])
        XCTAssertTrue(share.targets.allSatisfy { $0.serverMessageId == nil })
    }

    /// La PREMIÈRE cible porte les octets : c'est elle qui téléverse, les
    /// autres réclameront une copie serveur des mêmes pièces jointes.
    func test_make_withMedia_designatesTheFirstTargetAsOrigin() {
        XCTAssertEqual(makeShare(media: [photo]).originTargetIndex, 0)
    }

    func test_make_withoutMedia_hasNoOrigin() {
        XCTAssertNil(makeShare().originTargetIndex,
                     "un partage de texte n'a pas d'octets à porter")
    }

    func test_make_startsWithoutUploadedAttachmentIds() {
        XCTAssertNil(makeShare(media: [photo]).uploadedAttachmentIds,
                     "le champ n'est écrit qu'APRÈS un upload réussi")
    }

    // MARK: - Dérivation des identifiants par cible

    /// Une fiche décrit N cibles, mais l'enfilage est fait PAR CIBLE : chaque
    /// cible a besoin de son propre `clientMessageId`, stable d'une reprise à
    /// l'autre, sinon un rejeu créerait des doublons.
    func test_derivedClientMessageId_isStableAndDistinctPerTarget() {
        let first = SharePendingShare.derivedClientMessageId(shareId: "cid_abc", targetIndex: 0)
        let second = SharePendingShare.derivedClientMessageId(shareId: "cid_abc", targetIndex: 1)

        XCTAssertNotEqual(first, second)
        XCTAssertEqual(first, SharePendingShare.derivedClientMessageId(shareId: "cid_abc", targetIndex: 0),
                       "la dérivation doit être PURE : une reprise recalcule le même identifiant")
        XCTAssertTrue(first.hasPrefix("cid_abc"),
                      "l'identifiant de la fiche reste lisible dans celui de chaque cible")
    }

    // MARK: - Sérialisation

    func test_encodedShare_roundTripsThroughJSON() throws {
        var share = makeShare(media: [photo])
        share.uploadedAttachmentIds = ["att1"]
        share.targets[0].state = .sent
        share.targets[0].serverMessageId = "srv1"

        let data = try SharePendingShare.encoder().encode(share)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        XCTAssertEqual(try decoder.decode(SharePendingShare.self, from: data), share)
    }

    func test_fileName_isDerivedFromTheShareIdentifier() {
        XCTAssertEqual(makeShare(shareId: "cid_abc").fileName, "cid_abc.json")
    }

    // MARK: - Invariants de commit

    func test_commit_withPendingTargets_writesTheFiche() throws {
        let dir = try makeDirectory()
        let share = makeShare()

        try share.commit(in: dir)

        let written = try Data(contentsOf: dir.appendingPathComponent(share.fileName))
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        XCTAssertEqual(try decoder.decode(SharePendingShare.self, from: written), share)
    }

    /// Invariant 1 : chaque transition réécrit la fiche. Une reprise doit
    /// retrouver l'ÉTAT COURANT, pas l'état initial.
    func test_commit_afterATransition_overwritesWithTheNewState() throws {
        let dir = try makeDirectory()
        var share = makeShare()
        try share.commit(in: dir)

        share.targets[0].state = .sent
        share.targets[0].serverMessageId = "srv1"
        try share.commit(in: dir)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let reread = try decoder.decode(
            SharePendingShare.self,
            from: try Data(contentsOf: dir.appendingPathComponent(share.fileName))
        )
        XCTAssertEqual(reread.targets[0].state, .sent)
        XCTAssertEqual(reread.targets[0].serverMessageId, "srv1")
        XCTAssertEqual(reread.targets[1].state, .pending)
    }

    /// Invariant 2, et c'est LE point : une seule cible servie ne supprime
    /// rien. La supprimer perdrait les autres sans trace.
    func test_commit_withOneTargetServed_keepsTheFiche() throws {
        let dir = try makeDirectory()
        var share = makeShare()
        share.targets[0].state = .sent
        try share.commit(in: dir)

        XCTAssertTrue(FileManager.default.fileExists(
            atPath: dir.appendingPathComponent(share.fileName).path),
            "la fiche n'est supprimée QUE lorsque TOUTES les cibles sont servies")
    }

    func test_commit_withEveryTargetServed_removesTheFiche() throws {
        let dir = try makeDirectory()
        var share = makeShare()
        try share.commit(in: dir)

        share.targets[0].state = .sent
        share.targets[1].state = .sent
        try share.commit(in: dir)

        XCTAssertFalse(FileManager.default.fileExists(
            atPath: dir.appendingPathComponent(share.fileName).path))
    }

    /// Une cible en échec n'est PAS servie : la fiche doit survivre pour que
    /// l'app la reprenne.
    func test_commit_withAFailedTarget_keepsTheFiche() throws {
        let dir = try makeDirectory()
        var share = makeShare()
        share.targets[0].state = .sent
        share.targets[1].state = .failed
        try share.commit(in: dir)

        XCTAssertTrue(FileManager.default.fileExists(
            atPath: dir.appendingPathComponent(share.fileName).path))
        XCTAssertFalse(share.isFullyServed)
    }

    func test_isFullyServed_requiresEveryTarget() {
        var share = makeShare()
        XCTAssertFalse(share.isFullyServed)
        share.targets[0].state = .sent
        XCTAssertFalse(share.isFullyServed)
        share.targets[1].state = .sent
        XCTAssertTrue(share.isFullyServed)
    }
}
```

- [ ] **Step 2: Vérifier l'échec**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
```

Attendu : exit 65, `error: cannot find 'SharePendingShare' in scope`.

- [ ] **Step 3: Écrire `SharePendingShare.swift`**

Créer `apps/ios/MeeshyShareExtension/SharePendingShare.swift` :

```swift
import Foundation

/// La fiche de reprise écrite par l'extension, relue par l'app.
///
/// Le relais précédent (`SharePendingSend`) ne portait que du texte, un seul
/// destinataire et aucun état — il ne pouvait décrire ni un fan-out, ni un
/// upload déjà fait. Cette fiche versionnée le remplace.
///
/// **Deux invariants, et tout le reste en découle :**
///
/// 1. elle est réécrite ATOMIQUEMENT à chaque transition (fichiers copiés,
///    upload terminé, cible servie) ;
/// 2. elle n'est supprimée que lorsque TOUTES les cibles sont `sent` — jamais
///    après la première.
///
/// Sans (1), une interruption après l'upload re-téléverserait plusieurs
/// gigaoctets : les attachments orphelins ne sont balayés qu'à H+24
/// (`MaintenanceService.ts:386-400`). Sans (2), une interruption après la
/// première cible perdrait les suivantes SANS TRACE : le `clientMessageId` ne
/// dédoublonne que sur `(conversationId, clientMessageId)`
/// (`schema.prisma:677-686`), il ne rattrape pas une cible jamais servie.
///
/// Le contrat est DUPLIQUÉ côté app (`SharePendingSendConsumer.PendingShare`) :
/// l'extension est sans dépendance SDK, les deux cibles ne peuvent donc pas
/// partager un type. `SharePendingSendContractTests` est le garde-fou — il
/// compile les deux miroirs et vérifie qu'ils s'accordent.
nonisolated struct SharePendingShare: Codable, Equatable, Sendable {

    typealias Media = ShareStagedMedia

    nonisolated enum TargetState: String, Codable, Equatable, Sendable {
        case pending
        case sent
        case failed
    }

    nonisolated struct Target: Codable, Equatable, Sendable {
        let conversationId: String
        var state: TargetState
        var serverMessageId: String?

        init(conversationId: String, state: TargetState = .pending, serverMessageId: String? = nil) {
            self.conversationId = conversationId
            self.state = state
            self.serverMessageId = serverMessageId
        }
    }

    /// Version du format. Une fiche d'une version inconnue est traitée comme
    /// illisible par le consommateur — jamais devinée.
    let v: Int
    let clientMessageId: String
    let createdAt: Date
    let content: String?
    var media: [Media]
    /// Écrit APRÈS un upload réussi. Sa présence dispense TOUTE cible de
    /// re-téléverser quoi que ce soit.
    var uploadedAttachmentIds: [String]?
    var targets: [Target]
    /// L'index de la cible qui porte les octets. `nil` quand il n'y a pas de
    /// média à porter.
    var originTargetIndex: Int?

    // MARK: - Contrat partagé avec l'app

    static let currentVersion = 1
    static let appGroupIdentifier = ShareSession.appGroupIdentifier
    static let directoryName = "share_pending_sends"
    static let mediaDirectoryName = ShareMediaStaging.directoryName

    /// L'identifiant de la fiche reste la clé de reprise ; chaque cible reçoit
    /// un identifiant DÉRIVÉ, stable d'une reprise à l'autre. Sans stabilité,
    /// un rejeu après interruption créerait des doublons ; sans distinction,
    /// deux cibles écriraient les mêmes chemins de fichiers pendants.
    static func derivedClientMessageId(shareId: String, targetIndex: Int) -> String {
        "\(shareId)_t\(targetIndex)"
    }

    static func make(
        shareId: String,
        createdAt: Date,
        content: String?,
        media: [Media],
        conversationIds: [String]
    ) -> SharePendingShare {
        SharePendingShare(
            v: currentVersion,
            clientMessageId: shareId,
            createdAt: createdAt,
            content: content,
            media: media,
            uploadedAttachmentIds: nil,
            targets: conversationIds.map { Target(conversationId: $0) },
            originTargetIndex: media.isEmpty ? nil : 0
        )
    }

    static func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }

    static func directoryURL() -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
            .appendingPathComponent(directoryName, isDirectory: true)
    }

    // MARK: - État

    /// Le nom de fichier EST l'identifiant du partage : deux écritures du même
    /// partage écrasent le même fichier, donc ne peuvent pas produire deux
    /// rejeux.
    var fileName: String { "\(clientMessageId).json" }

    var isFullyServed: Bool { targets.allSatisfy { $0.state == .sent } }

    // MARK: - Commit

    /// Le SEUL point d'écriture de la fiche — les deux invariants sont ici, et
    /// nulle part ailleurs. Écriture atomique, suppression conditionnée à
    /// `isFullyServed`.
    func commit(in directory: URL) throws {
        let file = directory.appendingPathComponent(fileName)
        guard !isFullyServed else {
            if FileManager.default.fileExists(atPath: file.path) {
                try FileManager.default.removeItem(at: file)
            }
            return
        }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try Self.encoder().encode(self).write(to: file, options: .atomic)
    }

    @discardableResult
    func commitLive() -> Bool {
        guard let directory = Self.directoryURL() else {
            ShareLog.logger.error("Conteneur App Group indisponible — fiche de reprise impossible")
            return false
        }
        do {
            try commit(in: directory)
            return true
        } catch {
            ShareLog.logger.error("Écriture de la fiche échouée : \(error.localizedDescription, privacy: .public)")
            return false
        }
    }
}
```

- [ ] **Step 4: Retirer l'ancien `SharePendingSend`**

Dans `apps/ios/MeeshyShareExtension/ShareSender.swift`, supprimer intégralement le bloc `:143-197` (le commentaire de documentation `/// Relais durable écrit par l'extension…` et la `struct SharePendingSend`), et remplacer le corps de `deferSend` (`:127-140`) par :

```swift
    /// Dépose la fiche de reprise pour un partage de texte à UNE cible.
    /// Conservé pour le chemin texte historique ; le chemin multi-cibles passe
    /// par `send(share:session:urlSession:)`.
    private static func deferSend(
        clientMessageId: String,
        conversationId: String,
        content: String
    ) -> ShareOutcome {
        SharePendingShare.make(
            shareId: clientMessageId,
            createdAt: Date(),
            content: content,
            media: [],
            conversationIds: [conversationId]
        ).commitLive()
        return .deferred
    }
```

- [ ] **Step 5: Câbler la fiche au bundle de tests**

Dans `apps/ios/project.yml`, target `MeeshyTests`, après `- path: MeeshyShareExtension/ShareMediaStaging.swift` :

```yaml
      - path: MeeshyShareExtension/SharePendingShare.swift
```

- [ ] **Step 6: Vérifier le succès**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/SharePendingShareTests -derivedDataPath apps/ios/Build
```

Attendu : `SharePendingShareTests` PASSE (13 tests). `SharePendingSendContractTests` est désormais ROUGE (il référence `SharePendingSend`, supprimé) — c'est la Task 4 qui le répare ; ne pas le contourner.

- [ ] **Step 7: Commit**

```bash
git add apps/ios/MeeshyShareExtension/SharePendingShare.swift \
        apps/ios/MeeshyShareExtension/ShareSender.swift \
        apps/ios/MeeshyTests/Unit/Share/SharePendingShareTests.swift \
        apps/ios/project.yml apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -- apps/ios/MeeshyShareExtension/SharePendingShare.swift \
               apps/ios/MeeshyShareExtension/ShareSender.swift \
               apps/ios/MeeshyTests/Unit/Share/SharePendingShareTests.swift \
               apps/ios/project.yml apps/ios/Meeshy.xcodeproj/project.pbxproj \
  -m "feat(ios): la fiche de reprise porte enfin l'etat de CHAQUE destinataire"
```

---

## Task 4: La fiche — miroir app et contrat des deux miroirs

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/SharePendingSendConsumer.swift:19-47` (le contrat dupliqué)
- Test: `apps/ios/MeeshyTests/Unit/Share/SharePendingSendContractTests.swift` (réécrit)

**Interfaces:**
- Consumes: `SharePendingShare`, `SharePendingShare.Target`, `SharePendingShare.TargetState`, `SharePendingShare.derivedClientMessageId(shareId:targetIndex:)` (Task 3).
- Produces:

```swift
extension SharePendingSendConsumer {
    nonisolated static let appGroupIdentifier: String      // "group.me.meeshy.apps"
    nonisolated static let directoryName: String           // "share_pending_sends"
    nonisolated static let mediaDirectoryName: String      // "share_pending_media"
    nonisolated static let currentVersion: Int             // 1

    nonisolated struct PendingMedia: Codable, Equatable {
        let relPath: String
        let ext: String
        let mime: String
        let bytes: Int
    }
    nonisolated enum PendingTargetState: String, Codable, Equatable {
        case pending, sent, failed
    }
    nonisolated struct PendingTarget: Codable, Equatable {
        let conversationId: String
        var state: PendingTargetState
        var serverMessageId: String?
    }
    nonisolated struct PendingShare: Codable, Equatable {
        let v: Int
        let clientMessageId: String
        let createdAt: Date
        let content: String?
        var media: [PendingMedia]
        var uploadedAttachmentIds: [String]?
        var targets: [PendingTarget]
        var originTargetIndex: Int?

        var isFullyServed: Bool
        var fileName: String
    }

    nonisolated static func decoder() -> JSONDecoder
    nonisolated static func encoder() -> JSONEncoder
    nonisolated static func directoryURL() -> URL?
    nonisolated static func mediaDirectoryURL() -> URL?
    nonisolated static func decodeRelay(_ data: Data) -> PendingShare?
    nonisolated static func derivedClientMessageId(shareId: String, targetIndex: Int) -> String
    nonisolated static func commit(_ share: PendingShare, in directory: URL) throws
}
```

- [ ] **Step 1: Réécrire le contrat des deux miroirs (RED)**

Remplacer intégralement `apps/ios/MeeshyTests/Unit/Share/SharePendingSendContractTests.swift` :

```swift
import XCTest
@testable import Meeshy

/// La fiche de reprise traverse une frontière de process : l'extension écrit
/// (`SharePendingShare`, cible MeeshyShareExtension) et l'app relit
/// (`SharePendingSendConsumer.PendingShare`, cible Meeshy). Les deux cibles ne
/// peuvent pas partager un type — l'extension est délibérément sans dépendance
/// SDK — donc le contrat est dupliqué, comme l'est déjà
/// `ConversationSnapshotPayload` / `ConversationLocalSnapshot` côté NSE.
///
/// Ce bundle de tests compile LES DEUX. C'est le seul endroit du dépôt où la
/// dérive entre les deux miroirs peut être attrapée mécaniquement — **états par
/// cible compris**, qui sont précisément ce que l'ancien relais n'avait pas.
final class SharePendingSendContractTests: XCTestCase {

    private let photo = ShareStagedMedia(
        relPath: "cid_00000000-0000-4000-8000-000000000000/0.jpg",
        ext: "jpg", mime: "image/jpeg", bytes: 2048
    )

    private func makeReference() -> SharePendingShare {
        var share = SharePendingShare.make(
            shareId: "cid_00000000-0000-4000-8000-000000000000",
            createdAt: Date(timeIntervalSince1970: 1_785_000_000),
            content: "bonjour",
            media: [photo],
            conversationIds: ["conv42", "conv43"]
        )
        share.uploadedAttachmentIds = ["att1"]
        share.targets[0].state = .sent
        share.targets[0].serverMessageId = "srv1"
        share.targets[1].state = .failed
        return share
    }

    // MARK: - Traversée du contrat

    func test_ficheWrittenByExtension_decodesInTheApp() throws {
        let data = try SharePendingShare.encoder().encode(makeReference())

        let decoded = try SharePendingSendConsumer.decoder()
            .decode(SharePendingSendConsumer.PendingShare.self, from: data)

        XCTAssertEqual(decoded.v, 1)
        XCTAssertEqual(decoded.clientMessageId, "cid_00000000-0000-4000-8000-000000000000")
        XCTAssertEqual(decoded.content, "bonjour")
        XCTAssertEqual(decoded.uploadedAttachmentIds, ["att1"])
        XCTAssertEqual(decoded.originTargetIndex, 0)
        XCTAssertEqual(
            decoded.createdAt.timeIntervalSince1970, 1_785_000_000, accuracy: 1)
    }

    /// LE point que l'ancien relais ne pouvait pas porter : chaque cible a son
    /// propre état, et il doit survivre à la traversée. Sans lui, une reprise
    /// après interruption réenverrait une cible déjà servie, ou en oublierait
    /// une jamais servie.
    func test_perTargetState_survivesTheCrossing() throws {
        let data = try SharePendingShare.encoder().encode(makeReference())

        let decoded = try SharePendingSendConsumer.decoder()
            .decode(SharePendingSendConsumer.PendingShare.self, from: data)

        XCTAssertEqual(decoded.targets.map(\.conversationId), ["conv42", "conv43"])
        XCTAssertEqual(decoded.targets.map(\.state), [.sent, .failed])
        XCTAssertEqual(decoded.targets.map(\.serverMessageId), ["srv1", nil])
    }

    func test_mediaDescriptors_surviveTheCrossing() throws {
        let data = try SharePendingShare.encoder().encode(makeReference())

        let decoded = try SharePendingSendConsumer.decoder()
            .decode(SharePendingSendConsumer.PendingShare.self, from: data)

        XCTAssertEqual(decoded.media.count, 1)
        XCTAssertEqual(decoded.media[0].relPath, photo.relPath)
        XCTAssertEqual(decoded.media[0].ext, "jpg")
        XCTAssertEqual(decoded.media[0].mime, "image/jpeg")
        XCTAssertEqual(decoded.media[0].bytes, 2048)
    }

    /// Le sens RETOUR compte aussi : l'extension du lot B-2 relit sa propre
    /// fiche après un upload, et l'app la réécrit à chaque cible servie.
    func test_ficheWrittenByTheApp_decodesInTheExtension() throws {
        let appShare = try SharePendingSendConsumer.decoder()
            .decode(
                SharePendingSendConsumer.PendingShare.self,
                from: try SharePendingShare.encoder().encode(makeReference())
            )

        let data = try SharePendingSendConsumer.encoder().encode(appShare)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        XCTAssertEqual(try decoder.decode(SharePendingShare.self, from: data), makeReference())
    }

    // MARK: - Emplacements et dérivation

    /// Les deux côtés doivent viser le MÊME répertoire, sinon l'app relit un
    /// dossier que personne ne remplit — reproduction exacte du défaut
    /// `recent_contacts` déjà corrigé.
    func test_bothSidesAgreeOnTheDirectoryNames() {
        XCTAssertEqual(SharePendingShare.directoryName,
                       SharePendingSendConsumer.directoryName)
        XCTAssertEqual(SharePendingShare.mediaDirectoryName,
                       SharePendingSendConsumer.mediaDirectoryName)
        XCTAssertEqual(SharePendingShare.mediaDirectoryName, "share_pending_media")
    }

    func test_bothSidesAgreeOnTheAppGroup() {
        XCTAssertEqual(SharePendingShare.appGroupIdentifier,
                       SharePendingSendConsumer.appGroupIdentifier)
        XCTAssertEqual(SharePendingShare.appGroupIdentifier, "group.me.meeshy.apps")
    }

    func test_bothSidesAgreeOnTheVersion() {
        XCTAssertEqual(SharePendingShare.currentVersion,
                       SharePendingSendConsumer.currentVersion)
    }

    /// L'extension POSTE avec l'identifiant dérivé (lot B-2) et l'app ENFILE
    /// avec le même : une divergence produirait un doublon serveur au lieu
    /// d'un dédoublonnage.
    func test_bothSidesDeriveTheSameClientMessageIdPerTarget() {
        for index in 0..<3 {
            XCTAssertEqual(
                SharePendingShare.derivedClientMessageId(shareId: "cid_abc", targetIndex: index),
                SharePendingSendConsumer.derivedClientMessageId(shareId: "cid_abc", targetIndex: index)
            )
        }
    }

    func test_bothSidesAgreeOnTheFileName() throws {
        let appShare = try SharePendingSendConsumer.decoder()
            .decode(
                SharePendingSendConsumer.PendingShare.self,
                from: try SharePendingShare.encoder().encode(makeReference())
            )
        XCTAssertEqual(appShare.fileName, makeReference().fileName)
        XCTAssertEqual(appShare.fileName, "cid_00000000-0000-4000-8000-000000000000.json")
    }

    // MARK: - Compatibilité descendante

    /// Un utilisateur peut mettre à jour l'app avec un relais de l'ANCIEN
    /// format encore sur disque. Le jeter perdrait un partage que
    /// l'utilisateur croit envoyé.
    func test_legacyRelay_stillDecodesAsASingleTargetShare() throws {
        let legacy = Data("""
        {"clientMessageId":"cid_legacy","conversationId":"conv7",\
        "content":"salut","createdAt":"2026-07-29T10:00:00Z"}
        """.utf8)

        let share = try XCTUnwrap(SharePendingSendConsumer.decodeRelay(legacy))

        XCTAssertEqual(share.clientMessageId, "cid_legacy")
        XCTAssertEqual(share.content, "salut")
        XCTAssertEqual(share.targets.map(\.conversationId), ["conv7"])
        XCTAssertEqual(share.targets.map(\.state), [.pending])
        XCTAssertTrue(share.media.isEmpty)
        XCTAssertNil(share.originTargetIndex)
    }

    /// Une version INCONNUE n'est pas devinée : la deviner ferait enfiler des
    /// cibles fantômes ou en oublier.
    func test_unknownVersion_isRefused() {
        let future = Data("""
        {"v":99,"clientMessageId":"cid_x","createdAt":"2026-07-29T10:00:00Z",\
        "content":null,"media":[],"targets":[]}
        """.utf8)

        XCTAssertNil(SharePendingSendConsumer.decodeRelay(future))
    }

    func test_corruptPayload_isRefused() {
        XCTAssertNil(SharePendingSendConsumer.decodeRelay(Data("pas du json".utf8)))
    }
}
```

- [ ] **Step 2: Vérifier l'échec**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
```

Attendu : exit 65, `error: type 'SharePendingSendConsumer' has no member 'PendingShare'`.

- [ ] **Step 3: Écrire le miroir app**

Dans `apps/ios/Meeshy/Features/Main/Services/SharePendingSendConsumer.swift`, remplacer le bloc `:19-47` (du commentaire `/// Contrat partagé avec SharePendingSend…` jusqu'à la fin de `directoryURL()`) par :

```swift
    /// Contrat partagé avec `SharePendingShare` (cible MeeshyShareExtension).
    /// Les deux cibles ne peuvent pas partager un type — l'extension est
    /// délibérément sans dépendance SDK — donc le contrat est dupliqué et
    /// `SharePendingSendContractTests` vérifie que les miroirs s'accordent,
    /// **états par cible compris**.
    ///
    /// `nonisolated` sur chacun de ces membres : la classe est `@MainActor`,
    /// or le contrat doit être lisible depuis un contexte nonisolated — c'est
    /// précisément ce que fait le test de contrat.
    nonisolated static let appGroupIdentifier = "group.me.meeshy.apps"
    nonisolated static let directoryName = "share_pending_sends"
    nonisolated static let mediaDirectoryName = "share_pending_media"
    nonisolated static let currentVersion = 1

    nonisolated struct PendingMedia: Codable, Equatable {
        let relPath: String
        let ext: String
        let mime: String
        let bytes: Int
    }

    nonisolated enum PendingTargetState: String, Codable, Equatable {
        case pending
        case sent
        case failed
    }

    nonisolated struct PendingTarget: Codable, Equatable {
        let conversationId: String
        var state: PendingTargetState
        var serverMessageId: String?
    }

    nonisolated struct PendingShare: Codable, Equatable {
        let v: Int
        let clientMessageId: String
        let createdAt: Date
        let content: String?
        var media: [PendingMedia]
        var uploadedAttachmentIds: [String]?
        var targets: [PendingTarget]
        var originTargetIndex: Int?

        var isFullyServed: Bool { targets.allSatisfy { $0.state == .sent } }
        var fileName: String { "\(clientMessageId).json" }
    }

    /// Le relais de l'ANCIEN format, encore possible sur le disque d'un
    /// utilisateur qui met à jour l'app avec un partage différé en attente.
    private nonisolated struct LegacyPendingSend: Decodable {
        let clientMessageId: String
        let conversationId: String
        let content: String
        let createdAt: Date
    }

    nonisolated static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }

    nonisolated static func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }

    nonisolated static func directoryURL() -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
            .appendingPathComponent(directoryName, isDirectory: true)
    }

    nonisolated static func mediaDirectoryURL() -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
            .appendingPathComponent(mediaDirectoryName, isDirectory: true)
    }

    /// L'identifiant de la fiche reste la clé de reprise ; chaque cible reçoit
    /// un identifiant DÉRIVÉ, stable. Miroir EXACT de
    /// `SharePendingShare.derivedClientMessageId` — une divergence produirait
    /// un doublon serveur au lieu d'un dédoublonnage.
    nonisolated static func derivedClientMessageId(shareId: String, targetIndex: Int) -> String {
        "\(shareId)_t\(targetIndex)"
    }

    /// Décode une fiche v:1 ; à défaut, tente l'ancien format et le PROMEUT en
    /// fiche à une cible. Une version inconnue n'est jamais devinée.
    nonisolated static func decodeRelay(_ data: Data) -> PendingShare? {
        if let share = try? decoder().decode(PendingShare.self, from: data) {
            return share.v == currentVersion ? share : nil
        }
        guard let legacy = try? decoder().decode(LegacyPendingSend.self, from: data) else {
            return nil
        }
        return PendingShare(
            v: currentVersion,
            clientMessageId: legacy.clientMessageId,
            createdAt: legacy.createdAt,
            content: legacy.content,
            media: [],
            uploadedAttachmentIds: nil,
            targets: [PendingTarget(
                conversationId: legacy.conversationId, state: .pending, serverMessageId: nil)],
            originTargetIndex: nil
        )
    }

    /// Miroir EXACT de `SharePendingShare.commit(in:)` : écriture atomique
    /// tant qu'une cible reste à servir, suppression seulement quand toutes le
    /// sont. Les deux invariants vivent ici, et nulle part ailleurs.
    nonisolated static func commit(_ share: PendingShare, in directory: URL) throws {
        let file = directory.appendingPathComponent(share.fileName)
        guard !share.isFullyServed else {
            if FileManager.default.fileExists(atPath: file.path) {
                try FileManager.default.removeItem(at: file)
            }
            return
        }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try encoder().encode(share).write(to: file, options: .atomic)
    }
```

> Le décodage `PendingShare` d'abord, `LegacyPendingSend` ensuite, n'est pas ambigu : `PendingShare` exige `v`, `media` et `targets`, absents de l'ancien format ; `LegacyPendingSend` exige `conversationId`, absent du nouveau.

- [ ] **Step 4: Neutraliser temporairement l'ancien chemin de consommation**

`consumeAll` (`:56-91`) référence encore `PendingSend` (supprimé) via `Self.decoder().decode(PendingSend.self, …)` et `makeItem(from:)`. Pour que le bundle compile pendant que la Task 9 réécrit la reprise, remplacer ces deux points par la promotion de la fiche vers l'ancien comportement (UNE cible, texte seul) :

```swift
            guard let share = Self.decodeRelay(data) else {
                // Un payload corrompu ne redeviendra jamais lisible : le garder
                // ferait relire le même déchet à chaque lancement.
                remove(url, reason: "relais corrompu")
                continue
            }

            do {
                for (index, target) in share.targets.enumerated() where target.state != .sent {
                    try await queue.enqueue(makeItem(from: share, targetIndex: index, target: target))
                }
                remove(url, reason: "relais enfilé")
            } catch {
                // Fichier CONSERVÉ : c'est ce qui rend la reprise réessayable.
                logger.error(
                    "Enfilement du relais \(share.clientMessageId, privacy: .public) échoué, conservé pour réessai : \(error.localizedDescription, privacy: .public)"
                )
            }
```

et remplacer `makeItem(from:)` (`:97-111`) par :

```swift
    /// `createdAt` est préservé pour ne pas antidater le partage. Le
    /// `clientMessageId` est DÉRIVÉ par cible : c'est lui qui garantit qu'un
    /// POST ayant abouti sans que sa réponse parvienne ne produira pas un
    /// doublon au rejeu (dédoublonnage gateway par index unique).
    private func makeItem(
        from share: PendingShare,
        targetIndex: Int,
        target: PendingTarget
    ) -> OfflineQueueItem {
        OfflineQueueItem(
            id: UUID().uuidString,
            clientMessageId: Self.derivedClientMessageId(
                shareId: share.clientMessageId, targetIndex: targetIndex),
            conversationId: target.conversationId,
            content: share.content ?? "",
            originalLanguage: nil,
            replyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            attachmentIds: share.uploadedAttachmentIds,
            localAudioPath: nil,
            createdAt: share.createdAt
        )
    }
```

- [ ] **Step 5: Vérifier le succès**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/SharePendingSendContractTests \
  -only-testing:MeeshyTests/SharePendingSendConsumerTests -derivedDataPath apps/ios/Build
```

Attendu : `SharePendingSendContractTests` PASSE (11 tests) et `SharePendingSendConsumerTests` PASSE inchangée (les payloads legacy de ses fixtures passent par `decodeRelay`, et le `clientMessageId` attendu devient le dérivé). Si `test_consumeAll_preservesClientMessageIdForServerSideDedup` échoue, corriger son attente en `[cmid + "_t0"]` et documenter la dérivation dans son commentaire.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/SharePendingSendConsumer.swift \
        apps/ios/MeeshyTests/Unit/Share/SharePendingSendContractTests.swift \
        apps/ios/MeeshyTests/Unit/Share/SharePendingSendConsumerTests.swift
git commit -- apps/ios/Meeshy/Features/Main/Services/SharePendingSendConsumer.swift \
               apps/ios/MeeshyTests/Unit/Share/SharePendingSendContractTests.swift \
               apps/ios/MeeshyTests/Unit/Share/SharePendingSendConsumerTests.swift \
  -m "feat(ios): l'app relit une fiche qui sait dire QUELLE cible reste a servir"
```

---

## Task 5: Découplage de `ForwardPickerModel` et portage vers l'extension

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/ForwardPickerModel.swift:51-57`
- Modify: `apps/ios/Meeshy/Features/Main/Services/MessageForwardService.swift:5-9`
- Modify: `apps/ios/Meeshy/Features/Main/Components/ForwardPickerSheet.swift:330`
- Modify: `apps/ios/project.yml:254-264` (sources de `MeeshyShareExtension`)
- Test: `apps/ios/MeeshyTests/Unit/Components/ForwardPickerModelTests.swift:24,45,56,63,71,79`
- Test: `apps/ios/MeeshyTests/Unit/Share/ForwardPickerModelPortabilityGuardTests.swift`

**Interfaces:**
- Consumes: rien du plan.
- Produces:

```swift
// ForwardPickerModel.swift — Foundation SEUL
mutating func finishSend(_ id: String, succeeded: Bool, reason: String?)

// MessageForwardService.swift — le pont app-side vers l'issue primitive
extension ForwardOutcome {
    var succeeded: Bool
    var failureReason: String?
}
```

`ForwardPickerModel.swift` devient compilable dans la cible `MeeshyShareExtension`.

- [ ] **Step 1: Écrire le garde de portabilité (RED)**

Créer `apps/ios/MeeshyTests/Unit/Share/ForwardPickerModelPortabilityGuardTests.swift` :

```swift
import XCTest

/// `ForwardPickerModel` est compilé DANS DEUX cibles : l'app et
/// `MeeshyShareExtension`. Ajouter un fichier de l'APP aux `sources:` d'une
/// app-extension est un précédent nouveau dans ce dépôt — `project.yml` ne
/// connaissait que l'inverse (fichiers d'extension compilés dans MeeshyTests).
///
/// L'extension est sans dépendance SDK : le premier `import MeeshySDK` glissé
/// dans ce fichier casserait la compilation de l'extension, pas celle de
/// l'app — donc au moment le plus coûteux, et pour une raison que rien
/// n'expliquerait sur place. Ce garde échoue AVANT.
final class ForwardPickerModelPortabilityGuardTests: XCTestCase {

    private var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Share
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
    }

    private func source(_ relativePath: String) throws -> String {
        try String(contentsOf: iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    private var modelSource: String {
        get throws { try source("Meeshy/Features/Main/Components/ForwardPickerModel.swift") }
    }

    func test_forwardPickerModel_importsFoundationOnly() throws {
        let imports = try modelSource
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { $0.hasPrefix("import ") }

        XCTAssertEqual(
            imports, ["import Foundation"],
            "ForwardPickerModel est compilé dans MeeshyShareExtension, qui n'a AUCUNE "
            + "dépendance SDK (plafond mémoire 120 Mo, GRDB + Socket.IO exclus). "
            + "Imports trouvés : \(imports)"
        )
    }

    /// `ForwardOutcome` vit dans `MessageForwardService.swift`, qui
    /// `import MeeshySDK` : le modèle ne peut pas le nommer.
    func test_forwardPickerModel_neverNamesForwardOutcome() throws {
        XCTAssertFalse(
            try modelSource.contains("ForwardOutcome"),
            "l'issue d'un envoi doit être PRIMITIVE (succeeded/reason) pour que le "
            + "fichier traverse la frontière app ↔ extension — comme la jumelle web "
            + "`forward-picker-model.ts:44` le fait déjà (finishSend(id, ok, reason?))"
        )
    }

    /// Le fichier doit être RÉELLEMENT compilé par l'extension : le déclarer
    /// portable sans le câbler laisserait l'écran de partage sans machine à
    /// états, sans que rien ne rougisse.
    func test_projectYml_compilesTheModelIntoTheShareExtension() throws {
        let projectYml = try source("project.yml")
        let extensionSection = try XCTUnwrap(
            projectYml.range(of: "  MeeshyShareExtension:").map { projectYml[$0.lowerBound...] }
        )
        let bounded = extensionSection.prefix(while: { _ in true })
        let untilNextTarget = bounded.range(of: "\n  MeeshyTests:")
            .map { String(bounded[..<$0.lowerBound]) } ?? String(bounded)

        XCTAssertTrue(
            untilNextTarget.contains("Meeshy/Features/Main/Components/ForwardPickerModel.swift"),
            "MeeshyShareExtension doit lister explicitement ForwardPickerModel.swift dans ses sources"
        )
    }
}
```

- [ ] **Step 2: Adapter les six sites d'appel de test (RED)**

Dans `apps/ios/MeeshyTests/Unit/Components/ForwardPickerModelTests.swift`, remplacer les six appels :

| Ligne | Avant | Après |
|---|---|---|
| `:24` | `model.finishSend("a", outcome: .sent)` | `model.finishSend("a", succeeded: true, reason: nil)` |
| `:45` | `model.finishSend("a", outcome: .sent)` | `model.finishSend("a", succeeded: true, reason: nil)` |
| `:56` | `model.finishSend("a", outcome: .sent)` | `model.finishSend("a", succeeded: true, reason: nil)` |
| `:63` | `model.finishSend("a", outcome: .failed(reason: "Un message à vue unique ne peut pas être transféré"))` | `model.finishSend("a", succeeded: false, reason: "Un message à vue unique ne peut pas être transféré")` |
| `:71` | `model.finishSend("a", outcome: .queuedOffline)` | `model.finishSend("a", succeeded: true, reason: nil)` |
| `:79` | `model.finishSend("a", outcome: .failed(reason: "x"))` | `model.finishSend("a", succeeded: false, reason: "x")` |

Renommer `test_finishSend_queuedOffline_countsAsSent` en `test_finishSend_succeededWithoutReason_marksTheTargetSent` et remplacer son message d'assertion par :

```swift
        XCTAssertEqual(model.state(of: "a"), .sent,
                       "un enfilage durable vaut envoi pour l'affichage — l'outbox garantit la livraison ; "
                       + "la traduction ForwardOutcome → succeeded appartient à l'app, pas au modèle")
```

Ajouter, à la fin de la classe, la preuve que l'issue sans raison ne fabrique pas de raison :

```swift
    func test_finishSend_failedWithoutReason_stillCarriesAnEmptyReason() {
        var model = ForwardPickerModel()
        model.beginSend("a")
        model.finishSend("a", succeeded: false, reason: nil)
        XCTAssertEqual(model.state(of: "a"), .failed(""),
                       "un échec sans motif reste un échec réessayable, pas un succès")
    }
```

- [ ] **Step 3: Vérifier l'échec**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
```

Attendu : exit 65, `error: incorrect argument labels in call (have '_:succeeded:reason:', expected '_:outcome:')` sur les sept sites de test.

- [ ] **Step 4: Rendre l'issue primitive**

Dans `apps/ios/Meeshy/Features/Main/Components/ForwardPickerModel.swift`, remplacer `finishSend` (`:51-57`) par :

```swift
    /// L'issue est PRIMITIVE (`succeeded` + `reason`) et non un `ForwardOutcome` :
    /// ce fichier est compilé DANS `MeeshyShareExtension`, qui n'a aucune
    /// dépendance SDK, et `ForwardOutcome` vit dans `MessageForwardService.swift`,
    /// qui `import MeeshySDK`. La jumelle web a la même signature depuis
    /// toujours (`forward-picker-model.ts:44` — `finishSend(id, ok, reason?)`).
    /// La traduction depuis `ForwardOutcome` appartient à l'app
    /// (`ForwardOutcome.succeeded` / `.failureReason`).
    mutating func finishSend(_ id: String, succeeded: Bool, reason: String?) {
        guard state(of: id) == .sending else { return }
        states[id] = succeeded ? .sent : .failed(reason ?? "")
    }
```

Mettre à jour l'en-tête du fichier : remplacer la ligne `/// RÈGLE JUMELLE : apps/web/lib/forward-picker-model.ts — toute évolution` … par :

```swift
/// RÈGLE JUMELLE : apps/web/lib/forward-picker-model.ts — toute évolution
/// touche les deux sites. Ce fichier est aussi compilé dans
/// `MeeshyShareExtension` : il n'importe QUE `Foundation`, et
/// `ForwardPickerModelPortabilityGuardTests` l'y maintient.
```

- [ ] **Step 5: Poser le pont app-side**

Dans `apps/ios/Meeshy/Features/Main/Services/MessageForwardService.swift`, juste après la déclaration de `ForwardOutcome` (`:5-9`), ajouter :

```swift
/// Traduction de l'issue riche vers l'issue PRIMITIVE que `ForwardPickerModel`
/// expose (le modèle est partagé avec l'extension de partage, sans SDK).
/// Un enfilage durable VAUT un envoi pour l'affichage — l'outbox garantit la
/// livraison.
extension ForwardOutcome {
    var succeeded: Bool {
        if case .failed = self { return false }
        return true
    }

    var failureReason: String? {
        if case .failed(let reason) = self { return reason }
        return nil
    }
}
```

- [ ] **Step 6: Adapter l'unique appelant de production**

Dans `apps/ios/Meeshy/Features/Main/Components/ForwardPickerSheet.swift`, remplacer la ligne `:330` :

```swift
            model.finishSend(conv.id, succeeded: outcome.succeeded, reason: outcome.failureReason)
```

- [ ] **Step 7: Compiler le modèle dans l'extension**

Dans `apps/ios/project.yml`, target `MeeshyShareExtension`, remplacer le bloc `sources:` (`:258-259`) par :

```yaml
    sources:
      - path: MeeshyShareExtension
      # PRÉCÉDENT NOUVEAU : un fichier de l'APP compilé dans une app-extension.
      # `project.yml` ne connaissait que l'inverse (helpers d'extension compilés
      # dans MeeshyTests). L'écran de partage a besoin de la MÊME machine à
      # états que le sélecteur de transfert — la réécrire produirait deux
      # sémantiques de sélection divergentes pour un même geste.
      # Le fichier n'importe QUE Foundation ; garde :
      # `ForwardPickerModelPortabilityGuardTests`.
      - path: Meeshy/Features/Main/Components/ForwardPickerModel.swift
```

- [ ] **Step 8: Vérifier le succès**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/ForwardPickerModelTests \
  -only-testing:MeeshyTests/ForwardPickerModelPortabilityGuardTests -derivedDataPath apps/ios/Build
```

Attendu : `ForwardPickerModelTests` (9 tests) et `ForwardPickerModelPortabilityGuardTests` (3 tests) PASSENT. Le build de la cible `MeeshyShareExtension` doit réussir — c'est lui qui prouve la portabilité, pas seulement le garde de source.

- [ ] **Step 9: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Components/ForwardPickerModel.swift \
        apps/ios/Meeshy/Features/Main/Components/ForwardPickerSheet.swift \
        apps/ios/Meeshy/Features/Main/Services/MessageForwardService.swift \
        apps/ios/MeeshyTests/Unit/Components/ForwardPickerModelTests.swift \
        apps/ios/MeeshyTests/Unit/Share/ForwardPickerModelPortabilityGuardTests.swift \
        apps/ios/project.yml apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -- apps/ios/Meeshy/Features/Main/Components/ForwardPickerModel.swift \
               apps/ios/Meeshy/Features/Main/Components/ForwardPickerSheet.swift \
               apps/ios/Meeshy/Features/Main/Services/MessageForwardService.swift \
               apps/ios/MeeshyTests/Unit/Components/ForwardPickerModelTests.swift \
               apps/ios/MeeshyTests/Unit/Share/ForwardPickerModelPortabilityGuardTests.swift \
               apps/ios/project.yml apps/ios/Meeshy.xcodeproj/project.pbxproj \
  -m "refactor(ios): l'issue d'un envoi devient primitive pour traverser la frontiere d'extension"
```

---

## Task 6: Écran de l'extension en multi-sélection et corps d'envoi par cible

**Files:**
- Modify: `apps/ios/MeeshyShareExtension/ShareSender.swift`
- Modify: `apps/ios/MeeshyShareExtension/ShareViewController.swift`
- Modify: `apps/ios/MeeshyShareExtension/Localizable.xcstrings`
- Modify: `apps/ios/MeeshyTests/Unit/Share/ShareExtensionSourceGuardTests.swift` (retrait du `XCTSkipIf` de la Task 2)
- Test: `apps/ios/MeeshyTests/Unit/Share/ShareSenderFanoutTests.swift`

**Interfaces:**
- Consumes: `SharePendingShare`, `SharePendingShare.derivedClientMessageId(shareId:targetIndex:)`, `SharePendingShare.commit(in:)` (Task 3) ; `ShareLimits.canSelectMore(selectedCount:isAlreadySelected:)`, `ShareMediaStaging.stage(source:into:shareId:index:mime:freeBytes:)` (Task 2) ; `ForwardPickerModel.tapRow(_:)`, `.beginBatch()`, `.finishSend(_:succeeded:reason:)`, `.selectedIds`, `.state(of:)` (Task 5).
- Produces:

```swift
nonisolated struct ShareSendBody: Encodable, Equatable, Sendable {
    let clientMessageId: String
    let content: String?
    let attachmentIds: [String]?
    /// Cibles 2..N : le serveur crée de NOUVELLES pièces jointes pointant les
    /// MÊMES fichiers. `forwardedFromId` n'existe PAS sur ce corps — par
    /// construction, aucun destinataire ne peut voir une marque de transfert.
    let copyAttachmentsFromMessageId: String?
}

nonisolated extension ShareSender {
    static func body(for share: SharePendingShare, targetIndex: Int) -> ShareSendBody?
    static func request(conversationId: String, body: ShareSendBody,
                        session: ShareSession) -> URLRequest?
    static func serverMessageId(fromResponse data: Data) -> String?
    static func send(share: SharePendingShare,
                     session: ShareSession,
                     urlSession: URLSession = .shared,
                     directory: URL? = SharePendingShare.directoryURL()
    ) async -> SharePendingShare
    static func outcome(of share: SharePendingShare) -> ShareOutcome
}
```

> **`ShareSendBody` ne déclare AUCUN champ de transfert.** C'est le point d'application de l'invariant produit : l'extension ne PEUT PAS marquer un message comme transféré, même par inadvertance, parce que la structure qu'elle sérialise n'a pas de champ pour le dire.

- [ ] **Step 1: Écrire les tests rouges du corps d'envoi**

Créer `apps/ios/MeeshyTests/Unit/Share/ShareSenderFanoutTests.swift` :

```swift
import XCTest

/// Intercepte chaque requête et répond selon une file de réponses préparée —
/// un partage multi-cibles émet PLUSIEURS POST, et c'est justement leur
/// enchaînement qu'on vérifie.
private final class ShareStubURLProtocol: URLProtocol {
    // Le projet compile sous SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor
    // (SE-0466) : un `static var` nu serait isolé MainActor, alors que
    // `startLoading()` surcharge une exigence Foundation nonisolated et
    // s'exécute hors du main actor. Chaque test prépare la file avant
    // d'attendre ses requêtes — pas d'accès concurrent.
    nonisolated(unsafe) static var responses: [(status: Int, body: Data)] = []
    nonisolated(unsafe) static var capturedBodies: [Data] = []
    nonisolated(unsafe) static var capturedURLs: [String] = []

    static func reset() {
        responses = []
        capturedBodies = []
        capturedURLs = []
    }

    override nonisolated class func canInit(with request: URLRequest) -> Bool { true }

    /// `URLProtocol` vide `httpBody` au profit de `httpBodyStream` : sans
    /// cette re-matérialisation, chaque corps capturé serait `nil` et les
    /// assertions passeraient sur du vide.
    override nonisolated class func canonicalRequest(for request: URLRequest) -> URLRequest {
        var canonical = request
        if canonical.httpBody == nil, let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var data = Data()
            let bufferSize = 4096
            let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
            defer { buffer.deallocate() }
            while stream.hasBytesAvailable {
                let read = stream.read(buffer, maxLength: bufferSize)
                if read <= 0 { break }
                data.append(buffer, count: read)
            }
            canonical.httpBody = data
        }
        return canonical
    }

    override nonisolated func startLoading() {
        Self.capturedURLs.append(request.url?.absoluteString ?? "")
        Self.capturedBodies.append(request.httpBody ?? Data())

        let next = Self.responses.isEmpty
            ? (status: 500, body: Data())
            : Self.responses.removeFirst()
        let response = HTTPURLResponse(
            url: request.url ?? URL(string: "https://stub.meeshy.test")!,
            statusCode: next.status, httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: next.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override nonisolated func stopLoading() {}
}

/// Diffusion multi-destinataires depuis l'extension.
///
/// INVARIANT PRODUIT (décision user) : **aucun destinataire ne voit une marque
/// de transfert.** La première cible porte les octets ; les suivantes reçoivent
/// un message CRÉÉ avec `copyAttachmentsFromMessageId` — jamais
/// `forwardedFromId`. Diffuser par transfert ferait afficher « Transféré depuis
/// Famille » aux collègues.
final class ShareSenderFanoutTests: XCTestCase {

    override func setUp() {
        super.setUp()
        ShareStubURLProtocol.reset()
    }

    override func tearDown() {
        ShareStubURLProtocol.reset()
        super.tearDown()
    }

    private func makeSession() -> ShareSession {
        ShareSession(userId: "u1", token: "jwt", apiBaseURL: "https://gate.meeshy.me")
    }

    private func makeStubbedSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [ShareStubURLProtocol.self]
        return URLSession(configuration: config)
    }

    private func makeDirectory() throws -> URL {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("share-fanout-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private let photo = ShareStagedMedia(
        relPath: "cid_abc/0.jpg", ext: "jpg", mime: "image/jpeg", bytes: 2048)

    private func makeShare(
        media: [ShareStagedMedia] = [],
        conversationIds: [String] = ["conv1", "conv2", "conv3"]
    ) -> SharePendingShare {
        SharePendingShare.make(
            shareId: "cid_abc",
            createdAt: Date(timeIntervalSince1970: 1_785_000_000),
            content: "bonjour",
            media: media,
            conversationIds: conversationIds
        )
    }

    private func decodeBody(_ data: Data) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    private func successBody(id: String) -> Data {
        Data("""
        {"success":true,"data":{"id":"\(id)","conversationId":"c","createdAt":"2026-08-19T10:00:00Z"}}
        """.utf8)
    }

    // MARK: - Le corps d'envoi

    func test_body_forATextShare_carriesOnlyTheDerivedIdAndContent() throws {
        let body = try XCTUnwrap(ShareSender.body(for: makeShare(), targetIndex: 1))

        XCTAssertEqual(body.clientMessageId, "cid_abc_t1")
        XCTAssertEqual(body.content, "bonjour")
        XCTAssertNil(body.attachmentIds)
        XCTAssertNil(body.copyAttachmentsFromMessageId)
    }

    /// La PREMIÈRE cible porte les octets réellement téléversés.
    func test_body_forTheOriginTarget_carriesTheUploadedAttachmentIds() throws {
        var share = makeShare(media: [photo])
        share.uploadedAttachmentIds = ["att1", "att2"]

        let body = try XCTUnwrap(ShareSender.body(for: share, targetIndex: 0))

        XCTAssertEqual(body.attachmentIds, ["att1", "att2"])
        XCTAssertNil(body.copyAttachmentsFromMessageId)
    }

    /// LE test de l'invariant produit. Les cibles 2..N réclament une COPIE
    /// serveur des mêmes fichiers, et rien d'autre.
    func test_body_forFollowingTargets_copiesAttachments_andNeverForwards() throws {
        var share = makeShare(media: [photo])
        share.uploadedAttachmentIds = ["att1"]
        share.targets[0].state = .sent
        share.targets[0].serverMessageId = "srv1"

        let body = try XCTUnwrap(ShareSender.body(for: share, targetIndex: 1))

        XCTAssertEqual(body.copyAttachmentsFromMessageId, "srv1")
        XCTAssertNil(
            body.attachmentIds,
            "réutiliser les mêmes attachmentIds les DÉPLACERAIT "
            + "(associateAttachmentsToMessage est un updateMany) — le premier destinataire "
            + "perdrait ses pièces jointes"
        )

        // La preuve sur les OCTETS envoyés, pas seulement sur le type Swift :
        // aucun champ de transfert ne peut apparaître dans le JSON.
        let json = try decodeBody(try JSONEncoder().encode(body))
        XCTAssertNil(json["forwardedFromId"],
                     "un destinataire ne doit JAMAIS voir « Transféré depuis … »")
        XCTAssertNil(json["forwardedFromConversationId"])
        XCTAssertNil(json["forwardedFromAttachmentId"])
        XCTAssertNil(json["isForwarded"])
    }

    /// Sans identifiant serveur de l'origine, la cible suivante n'a rien à
    /// copier : l'extension n'invente pas, elle laisse la cible à l'app.
    func test_body_forAFollowingTarget_withoutAnOriginServerId_isNil() {
        var share = makeShare(media: [photo])
        share.uploadedAttachmentIds = ["att1"]

        XCTAssertNil(ShareSender.body(for: share, targetIndex: 1))
    }

    /// Lot B-1 : sans upload, l'extension ne poste RIEN pour un partage média.
    /// Elle copie et décrit ; elle ne garantit jamais l'upload.
    func test_body_forAMediaShareWithoutUpload_isNil() {
        XCTAssertNil(ShareSender.body(for: makeShare(media: [photo]), targetIndex: 0))
    }

    func test_encodedBody_omitsEveryNilField() throws {
        let body = try XCTUnwrap(ShareSender.body(for: makeShare(), targetIndex: 0))
        let json = try decodeBody(try JSONEncoder().encode(body))

        XCTAssertEqual(Set(json.keys), ["clientMessageId", "content"],
                       "un champ nil ne doit pas partir en `null` — le schéma REST le rejetterait")
    }

    // MARK: - L'envoi par cible

    func test_send_aTextShare_postsOncePerTarget_withDerivedIds() async throws {
        ShareStubURLProtocol.responses = [
            (200, successBody(id: "srv1")),
            (200, successBody(id: "srv2")),
            (200, successBody(id: "srv3"))
        ]

        let result = await ShareSender.send(
            share: makeShare(), session: makeSession(), urlSession: makeStubbedSession())

        XCTAssertEqual(ShareStubURLProtocol.capturedBodies.count, 3)
        let ids = try ShareStubURLProtocol.capturedBodies.map {
            try decodeBody($0)["clientMessageId"] as? String
        }
        XCTAssertEqual(ids, ["cid_abc_t0", "cid_abc_t1", "cid_abc_t2"])
        XCTAssertEqual(result.targets.map(\.state), [.sent, .sent, .sent])
        XCTAssertEqual(result.targets.map(\.serverMessageId), ["srv1", "srv2", "srv3"])
        XCTAssertTrue(result.isFullyServed)
    }

    func test_send_postsToEachTargetConversation() async {
        ShareStubURLProtocol.responses = [
            (200, successBody(id: "srv1")),
            (200, successBody(id: "srv2")),
            (200, successBody(id: "srv3"))
        ]

        _ = await ShareSender.send(
            share: makeShare(), session: makeSession(), urlSession: makeStubbedSession())

        XCTAssertEqual(ShareStubURLProtocol.capturedURLs, [
            "https://gate.meeshy.me/api/v1/conversations/conv1/messages",
            "https://gate.meeshy.me/api/v1/conversations/conv2/messages",
            "https://gate.meeshy.me/api/v1/conversations/conv3/messages"
        ])
    }

    /// Une cible en échec ne stoppe PAS les suivantes, et la fiche survit :
    /// c'est la différence entre « une cible perdue » et « tout le partage
    /// perdu ».
    func test_send_whenOneTargetFails_servesTheOthers_andKeepsTheFiche() async throws {
        let dir = try makeDirectory()
        ShareStubURLProtocol.responses = [
            (200, successBody(id: "srv1")),
            (503, Data()),
            (200, successBody(id: "srv3"))
        ]

        let result = await ShareSender.send(
            share: makeShare(), session: makeSession(),
            urlSession: makeStubbedSession(), directory: dir)

        XCTAssertEqual(result.targets.map(\.state), [.sent, .failed, .sent])
        XCTAssertFalse(result.isFullyServed)
        XCTAssertTrue(
            FileManager.default.fileExists(atPath: dir.appendingPathComponent("cid_abc.json").path),
            "une cible non servie doit rester décrite sur disque — sinon elle est perdue SANS TRACE"
        )
    }

    func test_send_whenEveryTargetSucceeds_removesTheFiche() async throws {
        let dir = try makeDirectory()
        ShareStubURLProtocol.responses = [
            (200, successBody(id: "srv1")),
            (200, successBody(id: "srv2")),
            (200, successBody(id: "srv3"))
        ]

        _ = await ShareSender.send(
            share: makeShare(), session: makeSession(),
            urlSession: makeStubbedSession(), directory: dir)

        XCTAssertFalse(
            FileManager.default.fileExists(atPath: dir.appendingPathComponent("cid_abc.json").path))
    }

    /// Invariant 1 : la fiche est écrite AVANT le premier POST. Une extension
    /// tuée entre les deux ne doit rien perdre.
    func test_send_writesTheFicheBeforeTheFirstPost() async throws {
        let dir = try makeDirectory()
        ShareStubURLProtocol.responses = [(503, Data()), (503, Data()), (503, Data())]

        _ = await ShareSender.send(
            share: makeShare(), session: makeSession(),
            urlSession: makeStubbedSession(), directory: dir)

        let written = try Data(contentsOf: dir.appendingPathComponent("cid_abc.json"))
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let reread = try decoder.decode(SharePendingShare.self, from: written)
        XCTAssertEqual(reread.targets.count, 3)
    }

    /// Lot B-1 : un partage média ne poste rien, mais sa fiche part sur disque.
    func test_send_aMediaShare_postsNothing_andDefersEverything() async throws {
        let dir = try makeDirectory()

        let result = await ShareSender.send(
            share: makeShare(media: [photo]), session: makeSession(),
            urlSession: makeStubbedSession(), directory: dir)

        XCTAssertTrue(ShareStubURLProtocol.capturedBodies.isEmpty)
        XCTAssertEqual(result.targets.map(\.state), [.pending, .pending, .pending])
        XCTAssertEqual(ShareSender.outcome(of: result), .deferred)
        XCTAssertTrue(
            FileManager.default.fileExists(atPath: dir.appendingPathComponent("cid_abc.json").path))
    }

    // MARK: - Issue affichée

    func test_outcome_isSentOnlyWhenEveryTargetIsServed() {
        var share = makeShare()
        XCTAssertEqual(ShareSender.outcome(of: share), .deferred)
        share.targets[0].state = .sent
        share.targets[1].state = .sent
        XCTAssertEqual(ShareSender.outcome(of: share), .deferred,
                       "« Envoyé » ne se dit qu'une fois TOUTES les cibles servies")
        share.targets[2].state = .sent
        XCTAssertEqual(ShareSender.outcome(of: share), .sent)
    }

    // MARK: - Décodage de la réponse

    func test_serverMessageId_readsTheGatewayEnvelope() {
        XCTAssertEqual(ShareSender.serverMessageId(fromResponse: successBody(id: "srv9")), "srv9")
    }

    func test_serverMessageId_onAnUnexpectedShape_isNil() {
        XCTAssertNil(ShareSender.serverMessageId(fromResponse: Data("{\"success\":true}".utf8)))
    }
}
```

- [ ] **Step 2: Vérifier l'échec**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
```

Attendu : exit 65, `error: cannot find 'ShareSendBody' in scope` et `type 'ShareSender' has no member 'body'`.

- [ ] **Step 3: Écrire le corps d'envoi et l'envoi par cible**

Dans `apps/ios/MeeshyShareExtension/ShareSender.swift`, remplacer la `private struct Body` (`:57-60`) et la fonction `request(conversationId:clientMessageId:content:session:)` (`:62-82`) par :

```swift
/// Le corps d'un envoi de partage.
///
/// **Il n'existe AUCUN champ de transfert sur cette structure, et c'est
/// délibéré.** L'invariant produit (décision user) est qu'aucun destinataire ne
/// voie de marque de transfert : diffuser par `forwardedFromId` ferait afficher
/// « Transféré depuis Famille » aux collègues (`MessageHandler.ts:1187-1195` +
/// `ForwardBadgePolicy.swift:15-21`). Ne PAS pouvoir l'exprimer est une garantie
/// plus solide que se rappeler de ne pas le faire.
///
/// Les cibles 2..N passent par `copyAttachmentsFromMessageId` : le serveur crée
/// de NOUVELLES pièces jointes pointant les MÊMES fichiers. Réutiliser les
/// `attachmentIds` de la première cible les DÉPLACERAIT
/// (`associateAttachmentsToMessage` est un `updateMany({ data: { messageId } })`,
/// `AttachmentService.ts:161-173`) — le premier destinataire les perdrait.
///
/// L'encodage synthétisé omet les optionnels nil : un champ absent ne part pas
/// en `null`.
nonisolated struct ShareSendBody: Encodable, Equatable, Sendable {
    let clientMessageId: String
    let content: String?
    let attachmentIds: [String]?
    let copyAttachmentsFromMessageId: String?
}

nonisolated extension ShareSender {

    /// Le corps à poster pour UNE cible — ou `nil` quand cette cible doit être
    /// laissée à l'app (média pas encore téléversé, origine pas encore
    /// acquittée). L'extension ne devine rien : elle décrit.
    static func body(for share: SharePendingShare, targetIndex: Int) -> ShareSendBody? {
        let clientMessageId = SharePendingShare.derivedClientMessageId(
            shareId: share.clientMessageId, targetIndex: targetIndex)

        guard !share.media.isEmpty else {
            return ShareSendBody(
                clientMessageId: clientMessageId, content: share.content,
                attachmentIds: nil, copyAttachmentsFromMessageId: nil)
        }

        guard let uploaded = share.uploadedAttachmentIds, !uploaded.isEmpty else {
            return nil
        }

        let origin = share.originTargetIndex ?? 0
        if targetIndex == origin {
            return ShareSendBody(
                clientMessageId: clientMessageId, content: share.content,
                attachmentIds: uploaded, copyAttachmentsFromMessageId: nil)
        }

        guard share.targets.indices.contains(origin),
              let originServerId = share.targets[origin].serverMessageId else {
            return nil
        }
        return ShareSendBody(
            clientMessageId: clientMessageId, content: share.content,
            attachmentIds: nil, copyAttachmentsFromMessageId: originServerId)
    }

    static func request(
        conversationId: String,
        body: ShareSendBody,
        session: ShareSession
    ) -> URLRequest? {
        guard let url = URL(
            string: "\(session.apiBaseURL)/api/v1/conversations/\(conversationId)/messages"
        ) else { return nil }
        guard let payload = try? JSONEncoder().encode(body) else { return nil }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = payload
        return request
    }

    /// L'identifiant serveur du message créé — indispensable aux cibles
    /// suivantes, qui copieront SES pièces jointes.
    static func serverMessageId(fromResponse data: Data) -> String? {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let payload = root["data"] as? [String: Any] else { return nil }
        return payload["id"] as? String
    }

    /// « Envoyé » ne se dit qu'une fois TOUTES les cibles servies : le dire
    /// plus tôt mentirait sur les cibles restantes.
    static func outcome(of share: SharePendingShare) -> ShareOutcome {
        share.isFullyServed ? .sent : .deferred
    }

    /// Sert les cibles l'une après l'autre, en COMMITANT la fiche à chaque
    /// transition.
    ///
    /// La fiche est écrite AVANT le premier POST : une extension tuée entre les
    /// deux ne perd rien. Une cible en échec n'interrompt pas les suivantes —
    /// perdre une cible n'est pas perdre le partage.
    static func send(
        share: SharePendingShare,
        session: ShareSession,
        urlSession: URLSession = .shared,
        directory: URL? = SharePendingShare.directoryURL()
    ) async -> SharePendingShare {
        var current = share
        commit(current, in: directory)

        for index in current.targets.indices where current.targets[index].state != .sent {
            guard let body = body(for: current, targetIndex: index),
                  let request = request(
                    conversationId: current.targets[index].conversationId,
                    body: body, session: session)
            else { continue }

            do {
                let (data, response) = try await urlSession.data(for: request)
                let status = (response as? HTTPURLResponse)?.statusCode
                if outcome(statusCode: status, error: nil) == .sent {
                    current.targets[index].state = .sent
                    current.targets[index].serverMessageId = serverMessageId(fromResponse: data)
                } else {
                    ShareLog.logger.error(
                        "Cible refusée par le gateway (statut \(status ?? -1, privacy: .public)) — reprise différée")
                    current.targets[index].state = .failed
                }
            } catch {
                ShareLog.logger.error(
                    "Cible en échec réseau (\(error.localizedDescription, privacy: .public)) — reprise différée")
                current.targets[index].state = .failed
            }
            commit(current, in: directory)
        }
        return current
    }

    private static func commit(_ share: SharePendingShare, in directory: URL?) {
        guard let directory else {
            ShareLog.logger.error("Conteneur App Group indisponible — fiche de reprise impossible")
            return
        }
        do {
            try share.commit(in: directory)
        } catch {
            ShareLog.logger.error(
                "Écriture de la fiche échouée : \(error.localizedDescription, privacy: .public)")
        }
    }
}
```

Supprimer ensuite l'ancienne `send(content:to:session:urlSession:)` (`:95-125`) et `deferSend` : `ShareViewController` bascule sur `send(share:session:urlSession:)` au Step 5.

- [ ] **Step 4: Vérifier le succès des tests d'envoi**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/ShareSenderFanoutTests -derivedDataPath apps/ios/Build
```

Attendu : `ShareSenderFanoutTests` PASSE (15 tests). `ShareSenderTests` (l'existante) doit être adaptée si elle appelait `request(conversationId:clientMessageId:content:session:)` — la remplacer par `request(conversationId:body:session:)` avec un `ShareSendBody` littéral, sans changer ses assertions d'en-tête ni d'URL.

- [ ] **Step 5: Câbler l'extraction des fichiers dans `ShareViewController`**

Dans `apps/ios/MeeshyShareExtension/ShareViewController.swift`, remplacer l'en-tête de documentation de la classe (`:5-14`) par :

```swift
/// Feuille « Partager vers Meeshy ».
///
/// L'extension est AUTONOME : elle lit la session et les conversations dans
/// l'App Group, décrit l'envoi dans une fiche de reprise durable, et n'ouvre
/// jamais l'app.
///
/// Portée : texte, URL, images, vidéos, GIFs et documents (`Info.plist`,
/// 20 fichiers max), vers 10 destinataires au plus.
///
/// **L'extension COPIE les fichiers et DÉCRIT l'envoi ; elle ne garantit
/// jamais l'upload.** Elle est tuable à tout instant, plafonnée à ~120 Mo, et
/// n'a pas droit à `beginBackgroundTask`. Ce que la feuille n'a pas eu le temps
/// de faire, `SharePendingSendConsumer` le reprend à la prochaine ouverture de
/// l'app.
```

Remplacer `viewDidLoad` et `extractContent` par :

```swift
    private let shareId = ShareSender.makeClientMessageId()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        extractContent { [weak self] content in
            guard let self else { return }
            self.extractAttachments { media, failure in
                self.installInterface(content: content, media: media, failure: failure)
            }
        }
    }

    /// Accumulateur des fichiers copiés — même verrou que `ExtractionBox` :
    /// `loadFileRepresentation` rappelle sur une file arbitraire, et plusieurs
    /// pièces jointes répondent en parallèle.
    private final class StagingBox: @unchecked Sendable {
        private let lock = NSLock()
        nonisolated(unsafe) private var staged: [Int: ShareStagedMedia] = [:]
        nonisolated(unsafe) private var failure: ShareMediaStagingError?

        nonisolated func offer(index: Int, media: ShareStagedMedia) {
            lock.lock(); defer { lock.unlock() }
            staged[index] = media
        }

        nonisolated func offer(failure value: ShareMediaStagingError) {
            lock.lock(); defer { lock.unlock() }
            if failure == nil { failure = value }
        }

        nonisolated var snapshot: (media: [ShareStagedMedia], failure: ShareMediaStagingError?) {
            lock.lock(); defer { lock.unlock() }
            return (staged.sorted { $0.key < $1.key }.map(\.value), failure)
        }
    }

    /// Copie chaque fichier reçu DANS la closure de `loadFileRepresentation`,
    /// de façon synchrone : l'URL fournie est SUPPRIMÉE au retour de cette
    /// closure. La copier plus tard, ou l'ouvrir en asynchrone, ne trouverait
    /// plus rien.
    private func extractAttachments(
        completion: @escaping ([ShareStagedMedia], ShareMediaStagingError?) -> Void
    ) {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem],
              let mediaRoot = ShareMediaStaging.prepareMediaRoot(shareId: shareId) else {
            completion([], nil)
            return
        }

        let fileProviders: [NSItemProvider] = items
            .flatMap { $0.attachments ?? [] }
            .filter { provider in
                !provider.hasItemConformingToTypeIdentifier(UTType.url.identifier)
                    && !provider.hasItemConformingToTypeIdentifier(UTType.text.identifier)
            }

        guard !fileProviders.isEmpty else {
            completion([], nil)
            return
        }

        guard ShareLimits.fitsFileCount(fileProviders.count) else {
            completion([], .fileCountExceeded(count: fileProviders.count, limit: ShareLimits.maxFiles))
            return
        }

        let box = StagingBox()
        let group = DispatchGroup()
        let shareId = shareId

        for (index, provider) in fileProviders.enumerated() {
            guard let typeIdentifier = provider.registeredTypeIdentifiers.first else { continue }
            group.enter()
            provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { url, error in
                defer { group.leave() }
                guard let url else {
                    box.offer(failure: .copyFailed(error?.localizedDescription ?? "aucune URL fournie"))
                    return
                }
                // Une URL issue de Fichiers/iCloud est security-scoped :
                // sans la paire start/stop, la lecture échoue en silence.
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                do {
                    let media = try ShareMediaStaging.stage(
                        source: url,
                        into: mediaRoot,
                        shareId: shareId,
                        index: index,
                        mime: ShareMediaStaging.mimeType(
                            typeIdentifier: typeIdentifier,
                            fileExtension: url.pathExtension),
                        freeBytes: ShareMediaStaging.availableCapacityBytes(at: mediaRoot)
                    )
                    box.offer(index: index, media: media)
                } catch let error as ShareMediaStagingError {
                    box.offer(failure: error)
                } catch {
                    box.offer(failure: .copyFailed(error.localizedDescription))
                }
            }
        }

        group.notify(queue: .main) {
            let (media, failure) = box.snapshot
            let total = media.reduce(0) { $0 + $1.bytes }
            guard ShareLimits.fitsByteBudget(total) else {
                ShareMediaStaging.discard(shareId: shareId, in: mediaRoot)
                completion([], .byteBudgetExceeded(total: total, limit: ShareLimits.maxTotalBytes))
                return
            }
            completion(media, failure)
        }
    }
```

Le filtre d'extraction texte/URL de `extractContent` reste inchangé — il ignorait déjà tout ce qui n'est ni URL ni texte.

- [ ] **Step 6: Passer l'écran en multi-sélection**

Dans `ShareContentView`, remplacer `@State private var selectedId: String?` par `@State private var model = ForwardPickerModel()`, et :

- `conversationList` : le `Button` appelle
  ```swift
                        Button {
                            guard ShareLimits.canSelectMore(
                                selectedCount: model.selectedIds.count,
                                isAlreadySelected: model.state(of: target.id) == .selected
                            ) else { return }
                            model.tapRow(target.id)
                        } label: {
                            ShareTargetRow(target: target, isSelected: model.state(of: target.id) == .selected)
                        }
  ```
- l'en-tête de liste devient
  ```swift
            Text(String(
                localized: "share.sendToMany",
                defaultValue: "Send to (up to 10)"
            ))
  ```
- `canSend` devient
  ```swift
    private var canSend: Bool {
        !model.selectedIds.isEmpty && !isSending && (content?.isEmpty == false || !media.isEmpty)
    }
  ```
- `send()` devient
  ```swift
    private func send() {
        guard case .ready(let session, let targets) = state else { return }
        let selected = model.beginBatch()
        let conversationIds = targets.map(\.id).filter { selected.contains($0) }
        guard !conversationIds.isEmpty else { return }

        isSending = true
        Task {
            let served = await onSend(session, conversationIds, content, media)
            for (index, target) in served.targets.enumerated() {
                model.finishSend(
                    target.conversationId,
                    succeeded: target.state == .sent,
                    reason: target.state == .sent ? nil : "\(index)"
                )
            }
            isSending = false
            resultMessage = ShareSender.outcome(of: served) == .sent
                ? String(localized: "share.status.sent", defaultValue: "Envoyé")
                : String(localized: "share.status.deferred", defaultValue: "Sera envoyé à la reconnexion")
            try? await Task.sleep(nanoseconds: 700_000_000)
            onFinish()
        }
    }
  ```
- la signature de `onSend` devient
  ```swift
    let onSend: (ShareSession, [String], String?, [ShareStagedMedia]) async -> SharePendingShare
  ```
  et deux propriétés nouvelles s'ajoutent : `let media: [ShareStagedMedia]` et `let stagingFailure: ShareMediaStagingError?`.
- au-dessus de `contentPreview`, la vue affiche l'échec de copie quand il existe :
  ```swift
                if stagingFailure != nil {
                    message(
                        systemImage: "exclamationmark.icloud",
                        text: String(
                            localized: "share.media.unavailable",
                            defaultValue: "Some files could not be prepared. Download them first, then try again."
                        )
                    )
                    Divider()
                } else if !media.isEmpty {
                    mediaPreview(media)
                    Divider()
                }
  ```
  avec
  ```swift
    private func mediaPreview(_ media: [ShareStagedMedia]) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "photo.on.rectangle.angled")
                .font(.title2)
                .foregroundStyle(.tint)
            Text(String(
                localized: "share.media.count",
                defaultValue: "\(media.count) file(s) ready to send"
            ))
            .font(.callout)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding()
        .background(Color.secondary.opacity(0.1))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(
            localized: "share.media.count",
            defaultValue: "\(media.count) file(s) ready to send"
        ))
    }
  ```

Enfin, `installInterface` construit la vue :

```swift
    private func installInterface(
        content: String?,
        media: [ShareStagedMedia],
        failure: ShareMediaStagingError?
    ) {
        let session = ShareSession.resolveLive()
        let state = ShareScreenState.resolve(
            session: session,
            targets: ShareConversationStore.liveTargets()
        )
        let shareId = shareId

        let root = ShareContentView(
            content: content,
            media: media,
            stagingFailure: failure,
            state: state,
            onSend: { session, conversationIds, content, media in
                await ShareSender.send(
                    share: SharePendingShare.make(
                        shareId: shareId,
                        createdAt: Date(),
                        content: content,
                        media: media,
                        conversationIds: conversationIds
                    ),
                    session: session
                )
            },
            onFinish: { [weak self] in self?.complete() }
        )
        // … le reste du câblage UIHostingController est inchangé …
    }
```

- [ ] **Step 7: Ajouter les trois clés dans les 7 langues**

Dans `apps/ios/MeeshyShareExtension/Localizable.xcstrings`, ajouter `share.sendToMany`, `share.media.count` et `share.media.unavailable`, chacune avec `"extractionState": "manual"` et les sept `localizations` :

| Clé | fr | en | de | es | pt-BR | it | ar |
|---|---|---|---|---|---|---|---|
| `share.sendToMany` | Envoyer à (10 max) | Send to (up to 10) | Senden an (max. 10) | Enviar a (máx. 10) | Enviar para (até 10) | Invia a (max 10) | إرسال إلى (10 كحد أقصى) |
| `share.media.count` | %lld fichier(s) prêt(s) à envoyer | %lld file(s) ready to send | %lld Datei(en) sendebereit | %lld archivo(s) listo(s) para enviar | %lld arquivo(s) pronto(s) para enviar | %lld file pronti all'invio | %lld ملف جاهز للإرسال |
| `share.media.unavailable` | Certains fichiers n'ont pas pu être préparés. Téléchargez-les d'abord, puis réessayez. | Some files could not be prepared. Download them first, then try again. | Einige Dateien konnten nicht vorbereitet werden. Laden Sie sie zuerst herunter und versuchen Sie es erneut. | Algunos archivos no se pudieron preparar. Descárgalos primero y vuelve a intentarlo. | Alguns arquivos não puderam ser preparados. Baixe-os primeiro e tente novamente. | Alcuni file non sono stati preparati. Scaricali prima e riprova. | تعذّر تحضير بعض الملفات. نزّلها أولاً ثم أعد المحاولة. |

Le `%lld` de `share.media.count` correspond à l'interpolation `\(media.count)` (un `Int` Swift s'interpole en `%lld` dans un catalogue).

- [ ] **Step 8: Réactiver le garde de portée sécurisée**

Dans `apps/ios/MeeshyTests/Unit/Share/ShareExtensionSourceGuardTests.swift`, retirer la ligne `try XCTSkipIf(true, "Activé par la Task 6 …")` posée au Step 9 de la Task 2.

- [ ] **Step 9: Vérifier le succès complet**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/ShareSenderFanoutTests \
  -only-testing:MeeshyTests/ShareSenderTests \
  -only-testing:MeeshyTests/ShareExtensionSourceGuardTests \
  -only-testing:MeeshyTests/ShareExtensionLocalizationTests \
  -only-testing:MeeshyTests/ShareExtensionAccessibilityTests -derivedDataPath apps/ios/Build
```

Attendu : les cinq classes PASSENT. `ShareExtensionLocalizationTests` est le garde qui prouve les trois nouvelles clés présentes dans les sept locales.

- [ ] **Step 10: Commit**

```bash
git add apps/ios/MeeshyShareExtension/ShareSender.swift \
        apps/ios/MeeshyShareExtension/ShareViewController.swift \
        apps/ios/MeeshyShareExtension/Localizable.xcstrings \
        apps/ios/MeeshyTests/Unit/Share/ShareSenderFanoutTests.swift \
        apps/ios/MeeshyTests/Unit/Share/ShareSenderTests.swift \
        apps/ios/MeeshyTests/Unit/Share/ShareExtensionSourceGuardTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -- apps/ios/MeeshyShareExtension/ShareSender.swift \
               apps/ios/MeeshyShareExtension/ShareViewController.swift \
               apps/ios/MeeshyShareExtension/Localizable.xcstrings \
               apps/ios/MeeshyTests/Unit/Share/ShareSenderFanoutTests.swift \
               apps/ios/MeeshyTests/Unit/Share/ShareSenderTests.swift \
               apps/ios/MeeshyTests/Unit/Share/ShareExtensionSourceGuardTests.swift \
               apps/ios/Meeshy.xcodeproj/project.pbxproj \
  -m "feat(ios): partager a dix personnes a la fois, sans qu'aucune y voie un transfert"
```

---

## Task 7: Les champs SDK du fan-out

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift:578-620`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift:8-120`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/MessageModelsTests.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OfflineQueueTests.swift`

**Interfaces:**
- Consumes: le champ serveur `copyAttachmentsFromMessageId` livré par `docs/superpowers/plans/2026-08-19-forward-reach.md` Task 5.
- Produces:

```swift
// MessageModels.swift
public struct SendMessageRequest: Encodable, Sendable {
    public var copyAttachmentsFromMessageId: String?
    public init(content: String?, originalLanguage: String? = nil, replyToId: String? = nil,
                storyReplyToId: String? = nil, forwardedFromId: String? = nil,
                forwardedFromConversationId: String? = nil, attachmentIds: [String]? = nil,
                expiresAt: Date? = nil, ephemeralDuration: Int? = nil, isViewOnce: Bool? = nil,
                maxViewOnceCount: Int? = nil, isBlurred: Bool? = nil, effectFlags: UInt32? = nil,
                isEncrypted: Bool? = nil, encryptionMode: String? = nil,
                clientMessageId: String? = nil, location: SharedPlace? = nil,
                copyAttachmentsFromMessageId: String? = nil)
}

// OfflineQueue.swift
public struct OfflineQueueItem: Codable, Identifiable, Sendable {
    public let copyAttachmentsFromClientMessageId: String?
}
```

- [ ] **Step 1: Écrire les tests rouges du corps REST**

Ajouter à `packages/MeeshySDK/Tests/MeeshySDKTests/Models/MessageModelsTests.swift` :

```swift
    // MARK: - Fan-out de partage : copier, jamais transférer

    private func encodedKeys(_ request: SendMessageRequest) throws -> Set<String> {
        let data = try JSONEncoder().encode(request)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        return Set(json.keys)
    }

    /// La diffusion multi-destinataires d'un partage crée des messages qui
    /// COPIENT les pièces jointes du premier — jamais des transferts. Un
    /// transfert ferait afficher « Transféré depuis <conversation source> »
    /// aux destinataires suivants : partager vers « Famille » puis
    /// « Collègues » révélerait « Famille » aux collègues.
    func test_sendMessageRequest_carriesCopyAttachmentsFromMessageId() throws {
        let request = SendMessageRequest(
            content: "bonjour", clientMessageId: "cid_abc_t1",
            copyAttachmentsFromMessageId: "srv1")

        let data = try JSONEncoder().encode(request)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(json["copyAttachmentsFromMessageId"] as? String, "srv1")
    }

    func test_sendMessageRequest_withCopyMode_carriesNoForwardMetadata() throws {
        let keys = try encodedKeys(SendMessageRequest(
            content: "bonjour", clientMessageId: "cid_abc_t1",
            copyAttachmentsFromMessageId: "srv1"))

        XCTAssertFalse(keys.contains("forwardedFromId"),
                       "un destinataire ne doit JAMAIS voir « Transféré depuis … »")
        XCTAssertFalse(keys.contains("forwardedFromConversationId"))
    }

    /// Réutiliser les mêmes `attachmentIds` les DÉPLACERAIT
    /// (`associateAttachmentsToMessage` est un `updateMany`) : le premier
    /// destinataire perdrait ses pièces jointes.
    func test_sendMessageRequest_withCopyMode_carriesNoAttachmentIds() throws {
        let keys = try encodedKeys(SendMessageRequest(
            content: nil, clientMessageId: "cid_abc_t1",
            copyAttachmentsFromMessageId: "srv1"))

        XCTAssertFalse(keys.contains("attachmentIds"))
        XCTAssertTrue(keys.contains("copyAttachmentsFromMessageId"))
    }

    func test_sendMessageRequest_withoutCopyMode_omitsTheKeyEntirely() throws {
        let keys = try encodedKeys(SendMessageRequest(content: "bonjour"))

        XCTAssertFalse(keys.contains("copyAttachmentsFromMessageId"),
                       "un optionnel nil ne doit pas partir en `null`")
    }
```

- [ ] **Step 2: Écrire le test rouge de la ligne d'outbox**

Ajouter à `packages/MeeshySDKTests/Persistence/OfflineQueueTests.swift` (section « OfflineQueueItem Model ») :

```swift
    // MARK: - Fan-out de partage

    /// La ligne d'outbox porte un identifiant LOCAL (le `clientMessageId` de
    /// la cible d'origine), pas un identifiant serveur : au moment de
    /// l'enfilage, l'origine n'a pas encore été envoyée. Le dispatcher le
    /// résoudra en identifiant serveur au moment de partir.
    func test_item_carriesCopyAttachmentsFromClientMessageId() throws {
        let item = OfflineQueueItem(
            conversationId: "conv-2", content: "bonjour",
            clientMessageId: "cid_abc_t1",
            copyAttachmentsFromClientMessageId: "cid_abc_t0")

        XCTAssertEqual(item.copyAttachmentsFromClientMessageId, "cid_abc_t0")
        XCTAssertNil(item.forwardedFromId,
                     "un partage multi-destinataires COPIE, il ne transfère jamais")
        XCTAssertNil(item.attachmentIds,
                     "réutiliser les ids DÉPLACERAIT les pièces jointes du premier destinataire")
    }

    func test_item_roundTripsCopyAttachmentsFromClientMessageId() throws {
        let item = OfflineQueueItem(
            conversationId: "conv-2", content: "bonjour",
            clientMessageId: "cid_abc_t1",
            copyAttachmentsFromClientMessageId: "cid_abc_t0")

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let decoded = try decoder.decode(
            OfflineQueueItem.self, from: try encoder.encode(item))
        XCTAssertEqual(decoded.copyAttachmentsFromClientMessageId, "cid_abc_t0")
    }

    /// Les lignes déjà sur le disque des utilisateurs doivent continuer à
    /// décoder sans migration — même convention que `attachmentKinds` et
    /// `localAudioPaths`.
    func test_item_decodesLegacyRowsWithoutTheNewField() throws {
        let legacy = Data("""
        {"id":"o1","clientMessageId":"cid_x","conversationId":"c1","content":"hi",\
        "createdAt":"2026-08-19T10:00:00Z"}
        """.utf8)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        let decoded = try decoder.decode(OfflineQueueItem.self, from: legacy)

        XCTAssertNil(decoded.copyAttachmentsFromClientMessageId)
    }
```

- [ ] **Step 3: Vérifier l'échec**

```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshySDKTests/MessageModelsTests \
  -only-testing:MeeshySDKTests/OfflineQueueTests && cd -
```

Attendu : échec de compile — `error: extra argument 'copyAttachmentsFromMessageId' in call` et `value of type 'OfflineQueueItem' has no member 'copyAttachmentsFromClientMessageId'`.

- [ ] **Step 4: Ajouter le champ au corps REST**

Dans `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift`, après `public var location: SharedPlace?` (`:607`), ajouter :

```swift
    /// Fan-out de partage — clé JSON `copyAttachmentsFromMessageId`. Le serveur
    /// crée de NOUVELLES `MessageAttachment` pointant les MÊMES fichiers
    /// (`filePath`/`fileUrl`) que celles du message source, **sans** écrire
    /// `forwardedFromId` : aucun destinataire ne voit de badge « Transféré
    /// depuis … ». Réutiliser les `attachmentIds` de la source les
    /// DÉPLACERAIT (`associateAttachmentsToMessage` est un `updateMany`,
    /// `AttachmentService.ts:161-173`), ce qui les retirerait au premier
    /// destinataire. Contrat serveur :
    /// `docs/superpowers/plans/2026-08-19-forward-reach.md` Task 5.
    /// L'encodage synthétisé omet les optionnels nil.
    public var copyAttachmentsFromMessageId: String?
```

et dans l'initialiseur (`:609-619`), ajouter le paramètre `copyAttachmentsFromMessageId: String? = nil` **en dernière position** (après `location`) et l'affectation `self.copyAttachmentsFromMessageId = copyAttachmentsFromMessageId`.

- [ ] **Step 5: Ajouter le champ à la ligne d'outbox**

Dans `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift`, après `public let location: SharedPlace?` (dans `OfflineQueueItem`), ajouter :

```swift
    /// Fan-out de partage — le `clientMessageId` LOCAL de la cible qui porte
    /// les octets. Au moment de l'enfilage, cette cible n'a pas encore été
    /// envoyée : son identifiant SERVEUR n'existe pas. `OutboxDispatcher` le
    /// résout au moment de partir (`PendingIdRecord`) et, à défaut, réessaie
    /// plus tard. `nil` pour tout message ordinaire ET pour les lignes écrites
    /// avant ce champ — décodé en `decodeIfPresent` pour que les payloads déjà
    /// sur le disque des utilisateurs continuent à décoder sans migration
    /// (même convention que `attachmentKinds` / `localAudioPaths`).
    public let copyAttachmentsFromClientMessageId: String?
```

Ajouter `copyAttachmentsFromClientMessageId: String? = nil` **en dernière position** des deux initialiseurs (`:66-95` et `:98-120`) et les deux affectations correspondantes.

- [ ] **Step 6: Vérifier le succès**

Rejouer la commande du Step 3. Attendu : `MessageModelsTests` et `OfflineQueueTests` PASSENT.

- [ ] **Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Models/MessageModelsTests.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OfflineQueueTests.swift
git commit -- packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift \
               packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift \
               packages/MeeshySDK/Tests/MeeshySDKTests/Models/MessageModelsTests.swift \
               packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OfflineQueueTests.swift \
  -m "feat(sdk): un envoi peut COPIER les pieces jointes d'un autre message, sans le transferer"
```

---

## Task 8: `enqueueMedia` rejoint le protocole, avec `createdAt` et la garde des sources

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift:517-544` (protocole), `:1624-1734` (implémentation)
- Modify: `apps/ios/MeeshyTests/Mocks/FakeOfflineMessageQueue.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OfflineQueueTests.swift`

**Interfaces:**
- Consumes: `OfflineQueueItem.copyAttachmentsFromClientMessageId` (Task 7).
- Produces (exigence de protocole ET implémentation — mêmes étiquettes, mêmes types) :

```swift
public protocol OfflineMessageQueueing: Sendable {
    // … exigences existantes inchangées …
    @discardableResult
    func enqueueMedia(
        sourceMediaURLs: [URL],
        kinds: [String],
        conversationId: String,
        content: String?,
        clientMessageId: String,
        originalLanguage: String?,
        replyToId: String?,
        forwardedFromId: String?,
        forwardedFromConversationId: String?,
        copyAttachmentsFromClientMessageId: String?,
        deletesSourceFiles: Bool,
        createdAt: Date?
    ) async throws -> OfflineQueue.EnqueueMediaResult
}
```

> **Trois pièges, tous déjà vécus dans ce dépôt :**
> 1. un paramètre présent sur l'implémentation seule est **jeté** avant le mock — l'exigence doit lister TOUS les paramètres (précédent : `location` sur `enqueuePostMedia`) ;
> 2. `enqueueMedia` supprime aujourd'hui ses fichiers sources en phase C (`:1721-1723`) — un partage multi-cibles perdrait ses octets après la PREMIÈRE cible, d'où `deletesSourceFiles` ;
> 3. `enqueueMedia` force `createdAt = Date()` — un partage repris trois jours plus tard serait **antidaté au jour de la reprise**, alors que le relais texte préserve déjà l'horodatage du partage (`SharePendingSendConsumer.swift:110`).

- [ ] **Step 1: Écrire les tests rouges**

Ajouter à `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OfflineQueueTests.swift` :

```swift
    // MARK: - enqueueMedia : reprise d'un partage (createdAt, sources, fan-out)

    /// Un partage repris trois jours plus tard ne doit pas être antidaté au
    /// jour de la reprise : le relais texte préserve déjà l'horodatage
    /// d'origine, le chemin média doit faire pareil.
    func test_enqueueMedia_withAnExplicitCreatedAt_preservesIt() async throws {
        let cid = "cid_\(UUID().uuidString.lowercased())"
        let shared = Date(timeIntervalSince1970: 1_785_000_000)

        _ = try await queue.enqueueMedia(
            sourceMediaURLs: [try makeTempMediaFile(ext: "jpg")],
            kinds: [AttachmentKind.image.rawValue],
            conversationId: "conv-1", content: nil, clientMessageId: cid,
            createdAt: shared
        )

        let item = try XCTUnwrap(try await readBackItems(forClientMessageId: cid).first)
        XCTAssertEqual(item.createdAt.timeIntervalSince1970,
                       shared.timeIntervalSince1970, accuracy: 1)
    }

    func test_enqueueMedia_withoutACreatedAt_stampsNow() async throws {
        let cid = "cid_\(UUID().uuidString.lowercased())"
        let before = Date()

        _ = try await queue.enqueueMedia(
            sourceMediaURLs: [try makeTempMediaFile(ext: "jpg")],
            kinds: [AttachmentKind.image.rawValue],
            conversationId: "conv-1", content: nil, clientMessageId: cid
        )

        let item = try XCTUnwrap(try await readBackItems(forClientMessageId: cid).first)
        XCTAssertGreaterThanOrEqual(item.createdAt, before.addingTimeInterval(-1))
    }

    /// LE piège du fan-out : les fichiers sont PARTAGÉS entre les cibles. Les
    /// supprimer après la première laisserait les suivantes sans octets.
    func test_enqueueMedia_withDeletesSourceFilesFalse_keepsTheSources() async throws {
        let source = try makeTempMediaFile(ext: "jpg")

        _ = try await queue.enqueueMedia(
            sourceMediaURLs: [source],
            kinds: [AttachmentKind.image.rawValue],
            conversationId: "conv-1", content: nil,
            clientMessageId: "cid_\(UUID().uuidString.lowercased())",
            deletesSourceFiles: false
        )

        XCTAssertTrue(
            FileManager.default.fileExists(atPath: source.path),
            "un dossier média partagé n'est supprimé que par le DERNIER consommateur"
        )
    }

    func test_enqueueMedia_byDefault_stillSweepsTheSources() async throws {
        let source = try makeTempMediaFile(ext: "jpg")

        _ = try await queue.enqueueMedia(
            sourceMediaURLs: [source],
            kinds: [AttachmentKind.image.rawValue],
            conversationId: "conv-1", content: nil,
            clientMessageId: "cid_\(UUID().uuidString.lowercased())"
        )

        XCTAssertFalse(FileManager.default.fileExists(atPath: source.path),
                       "le comportement historique du composer in-app est préservé")
    }

    func test_enqueueMedia_carriesTheFanoutOrigin() async throws {
        let cid = "cid_\(UUID().uuidString.lowercased())"

        _ = try await queue.enqueueMedia(
            sourceMediaURLs: [try makeTempMediaFile(ext: "jpg")],
            kinds: [AttachmentKind.image.rawValue],
            conversationId: "conv-1", content: nil, clientMessageId: cid,
            copyAttachmentsFromClientMessageId: "cid_origin_t0"
        )

        let item = try XCTUnwrap(try await readBackItems(forClientMessageId: cid).first)
        XCTAssertEqual(item.copyAttachmentsFromClientMessageId, "cid_origin_t0")
    }

    /// L'exigence de PROTOCOLE, pas seulement l'implémentation concrète : le
    /// consommateur de partage appelle à travers `OfflineMessageQueueing` et ne
    /// peut ni l'appeler ni le bouchonner si le protocole reste muet.
    func test_enqueueMedia_isReachableThroughTheProtocol() async throws {
        let queueing: OfflineMessageQueueing = OfflineQueue.shared
        let cid = "cid_\(UUID().uuidString.lowercased())"

        let result = try await queueing.enqueueMedia(
            sourceMediaURLs: [try makeTempMediaFile(ext: "jpg")],
            kinds: [AttachmentKind.image.rawValue],
            conversationId: "conv-1", content: nil, clientMessageId: cid,
            originalLanguage: nil, replyToId: nil, forwardedFromId: nil,
            forwardedFromConversationId: nil,
            copyAttachmentsFromClientMessageId: nil,
            deletesSourceFiles: false, createdAt: nil
        )

        XCTAssertEqual(result.localMediaPaths.count, 1)
    }
```

- [ ] **Step 2: Vérifier l'échec**

```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshySDKTests/OfflineQueueTests && cd -
```

Attendu : `error: extra argument 'createdAt' in call`, puis `value of type 'any OfflineMessageQueueing' has no member 'enqueueMedia'`.

- [ ] **Step 3: Étendre l'implémentation**

Dans `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift`, remplacer la signature d'`enqueueMedia` (`:1624-1633`) par :

```swift
    public func enqueueMedia(
        sourceMediaURLs: [URL],
        kinds: [String],
        conversationId: String,
        content: String?,
        clientMessageId: String,
        originalLanguage: String? = nil,
        replyToId: String? = nil,
        forwardedFromId: String? = nil,
        forwardedFromConversationId: String? = nil,
        copyAttachmentsFromClientMessageId: String? = nil,
        deletesSourceFiles: Bool = true,
        createdAt: Date? = nil
    ) async throws -> EnqueueMediaResult {
```

Remplacer `let now = Date()` par :

```swift
        // Un partage repris trois jours après sa création ne doit pas être
        // antidaté au jour de la reprise — le relais texte préserve déjà
        // l'horodatage d'origine (`SharePendingSendConsumer`).
        let now = createdAt ?? Date()
```

Ajouter `copyAttachmentsFromClientMessageId: copyAttachmentsFromClientMessageId` à la construction de l'`OfflineQueueItem`, et remplacer la phase C (`:1720-1723`) par :

```swift
        // Phase C — nettoyage des sources temporaires. DÉSACTIVÉ quand les
        // octets sont PARTAGÉS entre plusieurs cibles : les supprimer après la
        // première laisserait les suivantes sans rien à téléverser. Le dernier
        // consommateur les rend lui-même.
        if deletesSourceFiles {
            for source in sourceMediaURLs {
                FileManager.default.removeItemLogging(at: source, context: "enqueueMedia tmp source cleanup")
            }
        }
```

- [ ] **Step 4: Ajouter l'exigence au protocole**

Dans `OfflineMessageQueueing` (`:517-544`), avant `func cancelPendingSend(clientMessageId:)`, ajouter :

```swift
    /// Enfilage durable d'un message média (photo/vidéo/document) hors ligne,
    /// ou repris d'un partage. Sur le PROTOCOLE, et non seulement sur
    /// l'implémentation : `SharePendingSendConsumer` appelle à travers ce
    /// protocole et ne pourrait ni l'appeler ni le bouchonner en test s'il
    /// restait muet.
    ///
    /// TOUS les paramètres sont dans l'exigence — un paramètre présent sur la
    /// seule implémentation concrète est JETÉ avant le mock, et un test vert
    /// prouve alors l'inverse de ce qu'il croit (précédent vécu : `location`
    /// sur `enqueuePostMedia`).
    ///
    /// `deletesSourceFiles: false` pour un dossier média PARTAGÉ entre
    /// plusieurs cibles ; `createdAt` non nil pour préserver l'horodatage d'un
    /// partage repris.
    @discardableResult
    func enqueueMedia(
        sourceMediaURLs: [URL],
        kinds: [String],
        conversationId: String,
        content: String?,
        clientMessageId: String,
        originalLanguage: String?,
        replyToId: String?,
        forwardedFromId: String?,
        forwardedFromConversationId: String?,
        copyAttachmentsFromClientMessageId: String?,
        deletesSourceFiles: Bool,
        createdAt: Date?
    ) async throws -> OfflineQueue.EnqueueMediaResult
```

- [ ] **Step 5: Faire conformer le double de test**

Dans `apps/ios/MeeshyTests/Mocks/FakeOfflineMessageQueue.swift`, ajouter le suivi et la méthode :

```swift
    private(set) var enqueuedMediaCalls: [EnqueuedMedia] = []

    struct EnqueuedMedia: Equatable {
        let sourceMediaURLs: [URL]
        let kinds: [String]
        let conversationId: String
        let content: String?
        let clientMessageId: String
        let copyAttachmentsFromClientMessageId: String?
        let deletesSourceFiles: Bool
        let createdAt: Date?
    }

    @discardableResult
    func enqueueMedia(
        sourceMediaURLs: [URL],
        kinds: [String],
        conversationId: String,
        content: String?,
        clientMessageId: String,
        originalLanguage: String?,
        replyToId: String?,
        forwardedFromId: String?,
        forwardedFromConversationId: String?,
        copyAttachmentsFromClientMessageId: String?,
        deletesSourceFiles: Bool,
        createdAt: Date?
    ) async throws -> OfflineQueue.EnqueueMediaResult {
        if let delay { try? await Task.sleep(for: delay) }
        if shouldThrow { throw errorToThrow }
        enqueuedMediaCalls.append(EnqueuedMedia(
            sourceMediaURLs: sourceMediaURLs, kinds: kinds,
            conversationId: conversationId, content: content,
            clientMessageId: clientMessageId,
            copyAttachmentsFromClientMessageId: copyAttachmentsFromClientMessageId,
            deletesSourceFiles: deletesSourceFiles, createdAt: createdAt))
        return OfflineQueue.EnqueueMediaResult(
            outboxId: "ofq_fake_\(clientMessageId)",
            localMediaPaths: sourceMediaURLs.indices.map {
                "pending-media/\(clientMessageId)/\($0).\(sourceMediaURLs[$0].pathExtension)"
            })
    }

    // MARK: - Lectures pratiques

    var enqueuedMediaConversationIds: [String] {
        enqueuedMediaCalls.map(\.conversationId)
    }
```

- [ ] **Step 6: Vérifier le succès**

```bash
cd packages/MeeshySDK && xcodebuild test -scheme MeeshySDK-Package \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshySDKTests/OfflineQueueTests \
  -only-testing:MeeshySDKTests/OutboxUnifiedSignalsTests && cd -
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
```

Attendu : les deux classes SDK PASSENT et le bundle de tests de l'app compile (preuve que `FakeOfflineMessageQueue` conforme au protocole étendu).

- [ ] **Step 7: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift \
        packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OfflineQueueTests.swift \
        apps/ios/MeeshyTests/Mocks/FakeOfflineMessageQueue.swift
git commit -- packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift \
               packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/OfflineQueueTests.swift \
               apps/ios/MeeshyTests/Mocks/FakeOfflineMessageQueue.swift \
  -m "feat(sdk): l'enfilage media devient atteignable par contrat, sans antidater ni voler les octets"
```

---

## Task 9: Reprise par l'app — enfilage PAR CIBLE

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/SharePendingSendConsumer.swift:56-111`
- Test: `apps/ios/MeeshyTests/Unit/Share/SharePendingSendConsumerTests.swift`

**Interfaces:**
- Consumes: `SharePendingSendConsumer.PendingShare` / `.decodeRelay` / `.commit(_:in:)` / `.derivedClientMessageId` (Task 4) ; `OfflineMessageQueueing.enqueueMedia(…)` (Task 8) ; `OfflineQueueItem.copyAttachmentsFromClientMessageId` (Task 7).
- Produces:

```swift
@MainActor final class SharePendingSendConsumer {
    func consumeAll(
        in directory: URL? = SharePendingSendConsumer.directoryURL(),
        mediaRoot: URL? = SharePendingSendConsumer.mediaDirectoryURL()
    ) async
}
```

**Règles d'enfilage (l'invariant produit, appliqué côté app) :**

| Situation | Cible d'origine | Cibles suivantes |
|---|---|---|
| `uploadedAttachmentIds` non vide (l'extension a téléversé, lot B-2) | `enqueue` avec `attachmentIds` | `enqueue` avec `attachmentIds` — les mêmes ids sont déjà associés au premier message, le serveur les COPIE au lieu de les déplacer |
| Média non téléversé (lot B-1) | `enqueueMedia(deletesSourceFiles: false)` | `enqueue` avec `copyAttachmentsFromClientMessageId` = cid dérivé de l'origine |
| Texte seul | `enqueue` | `enqueue` |

Dans **tous** les cas : `forwardedFromId` et `forwardedFromConversationId` restent `nil`.

> Ligne 1 du tableau : quand l'extension a elle-même téléversé, chaque cible reçoit les mêmes `attachmentIds` — c'est le serveur qui doit alors les copier plutôt que les déplacer. Pour ne PAS dépendre de ce comportement, l'origine est enfilée d'abord avec les `attachmentIds`, et les suivantes basculent sur `copyAttachmentsFromClientMessageId` dès la deuxième. C'est cette forme-là qui est implémentée et testée ; la première colonne décrit l'intention, la deuxième le fait.

- [ ] **Step 1: Écrire les tests rouges de la reprise**

Ajouter à `apps/ios/MeeshyTests/Unit/Share/SharePendingSendConsumerTests.swift`, en remplaçant la section `// MARK: - Chemin nominal` par ce qui suit (les tests de dégradation existants sont conservés tels quels) :

```swift
    private func makeMediaRoot() throws -> URL {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("share-media-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// Écrit une fiche v:1 et, si elle décrit des médias, les octets
    /// correspondants sous `<mediaRoot>/<shareId>/`.
    @discardableResult
    private func writeShare(
        shareId: String = "cid_abc",
        content: String? = "bonjour",
        media: [SharePendingSendConsumer.PendingMedia] = [],
        uploadedAttachmentIds: [String]? = nil,
        conversationIds: [String] = ["conv1", "conv2", "conv3"],
        states: [SharePendingSendConsumer.PendingTargetState]? = nil,
        createdAt: Date = Date(timeIntervalSince1970: 1_785_000_000),
        in directory: URL,
        mediaRoot: URL? = nil
    ) throws -> SharePendingSendConsumer.PendingShare {
        let targets = conversationIds.enumerated().map { index, id in
            SharePendingSendConsumer.PendingTarget(
                conversationId: id,
                state: states?[index] ?? .pending,
                serverMessageId: nil)
        }
        let share = SharePendingSendConsumer.PendingShare(
            v: 1, clientMessageId: shareId, createdAt: createdAt, content: content,
            media: media, uploadedAttachmentIds: uploadedAttachmentIds,
            targets: targets, originTargetIndex: media.isEmpty ? nil : 0)
        try SharePendingSendConsumer.commit(share, in: directory)

        if let mediaRoot, !media.isEmpty {
            let shareDir = mediaRoot.appendingPathComponent(shareId, isDirectory: true)
            try FileManager.default.createDirectory(at: shareDir, withIntermediateDirectories: true)
            for descriptor in media {
                try Data(repeating: 9, count: descriptor.bytes)
                    .write(to: mediaRoot.appendingPathComponent(descriptor.relPath))
            }
        }
        return share
    }

    private let photo = SharePendingSendConsumer.PendingMedia(
        relPath: "cid_abc/0.jpg", ext: "jpg", mime: "image/jpeg", bytes: 32)

    // MARK: - Chemin nominal : une fiche, N cibles

    func test_consumeAll_enqueuesOneRowPerTarget() async throws {
        let dir = try makeDirectory()
        try writeShare(in: dir)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir)

        let items = await queue.enqueuedItems
        XCTAssertEqual(items.map(\.conversationId), ["conv1", "conv2", "conv3"])
    }

    /// Les identifiants sont DÉRIVÉS par cible : un identifiant unique pour
    /// trois cibles écrirait les mêmes chemins de fichiers pendants, et le
    /// dispatcher supprimerait les octets après le premier envoi.
    func test_consumeAll_derivesADistinctClientMessageIdPerTarget() async throws {
        let dir = try makeDirectory()
        try writeShare(in: dir)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir)

        let ids = await queue.enqueuedClientMessageIds
        XCTAssertEqual(ids, ["cid_abc_t0", "cid_abc_t1", "cid_abc_t2"])
    }

    func test_consumeAll_preservesTheShareCreationDate() async throws {
        let dir = try makeDirectory()
        try writeShare(in: dir, mediaRoot: nil)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir)

        let items = await queue.enqueuedItems
        XCTAssertEqual(items.first?.createdAt.timeIntervalSince1970, 1_785_000_000, accuracy: 1)
    }

    func test_consumeAll_whenEveryTargetIsEnqueued_deletesTheFiche() async throws {
        let dir = try makeDirectory()
        try writeShare(in: dir)

        await SharePendingSendConsumer(queue: FakeOfflineMessageQueue()).consumeAll(in: dir)

        XCTAssertTrue(files(in: dir).isEmpty)
    }

    // MARK: - INVARIANT PRODUIT : copier, jamais transférer

    /// Décision user : « il ne faut pas que les autres aient l'indicateur
    /// transfert ». La deuxième cible et les suivantes réclament une COPIE des
    /// pièces jointes de la première — jamais un transfert, qui ferait
    /// afficher « Transféré depuis <conversation source> ».
    func test_consumeAll_followingTargets_copyFromTheOrigin() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(media: [photo], in: dir, mediaRoot: mediaRoot)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, mediaRoot: mediaRoot)

        let items = await queue.enqueuedItems
        XCTAssertEqual(items.map(\.conversationId), ["conv2", "conv3"],
                       "seules les cibles SUIVANTES passent par enqueue simple")
        XCTAssertEqual(
            items.map(\.copyAttachmentsFromClientMessageId),
            ["cid_abc_t0", "cid_abc_t0"],
            "chacune copie les pièces jointes du message porté par la PREMIÈRE cible"
        )
    }

    func test_consumeAll_followingTargets_neverCarryForwardMetadata() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(media: [photo], in: dir, mediaRoot: mediaRoot)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, mediaRoot: mediaRoot)

        let items = await queue.enqueuedItems
        XCTAssertEqual(items.map(\.forwardedFromId), [nil, nil],
                       "aucun destinataire ne doit voir « Transféré depuis … »")
        XCTAssertEqual(items.map(\.forwardedFromConversationId), [nil, nil])
        XCTAssertEqual(
            items.map { $0.attachmentIds }, [nil, nil],
            "réutiliser les attachmentIds de l'origine les DÉPLACERAIT — le premier "
            + "destinataire perdrait ses pièces jointes (associateAttachmentsToMessage "
            + "est un updateMany)"
        )
    }

    /// La PREMIÈRE cible porte les octets : elle seule passe par
    /// `enqueueMedia`, et sans laisser le SDK balayer les sources.
    func test_consumeAll_originTarget_enqueuesTheBytes_withoutSweepingTheSharedFolder() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(media: [photo], in: dir, mediaRoot: mediaRoot)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, mediaRoot: mediaRoot)

        let calls = await queue.enqueuedMediaCalls
        XCTAssertEqual(calls.count, 1)
        XCTAssertEqual(calls.first?.conversationId, "conv1")
        XCTAssertEqual(calls.first?.clientMessageId, "cid_abc_t0")
        XCTAssertEqual(calls.first?.kinds, ["image"])
        XCTAssertEqual(calls.first?.deletesSourceFiles, false,
                       "le dossier média est PARTAGÉ : seul le dernier consommateur le rend")
        XCTAssertEqual(calls.first?.createdAt?.timeIntervalSince1970, 1_785_000_000, accuracy: 1)
    }

    /// Le dernier consommateur — et lui seul — rend les octets.
    func test_consumeAll_afterTheLastTarget_removesTheSharedMediaFolder() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(media: [photo], in: dir, mediaRoot: mediaRoot)

        await SharePendingSendConsumer(queue: FakeOfflineMessageQueue())
            .consumeAll(in: dir, mediaRoot: mediaRoot)

        XCTAssertFalse(FileManager.default.fileExists(
            atPath: mediaRoot.appendingPathComponent("cid_abc").path))
    }

    /// Un partage déjà téléversé par l'extension (lot B-2) ne re-téléverse
    /// RIEN : sans ce champ, une interruption après l'upload renverrait
    /// plusieurs gigaoctets.
    func test_consumeAll_withUploadedAttachmentIds_neverReUploads() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(media: [photo], uploadedAttachmentIds: ["att1"],
                       in: dir, mediaRoot: mediaRoot)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, mediaRoot: mediaRoot)

        let mediaCalls = await queue.enqueuedMediaCalls
        XCTAssertTrue(mediaCalls.isEmpty, "les octets sont déjà chez le serveur")
        let items = await queue.enqueuedItems
        XCTAssertEqual(items.first?.attachmentIds, ["att1"])
        XCTAssertEqual(items.dropFirst().map(\.copyAttachmentsFromClientMessageId),
                       ["cid_abc_t0", "cid_abc_t0"])
    }

    // MARK: - Interruptions

    /// Une cible déjà servie ne doit JAMAIS être réenfilée : le
    /// `clientMessageId` dédoublonne côté serveur, mais un rejeu inutile
    /// re-téléverserait les octets de l'origine.
    func test_consumeAll_skipsTargetsAlreadyServed() async throws {
        let dir = try makeDirectory()
        try writeShare(states: [.sent, .pending, .pending], in: dir)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir)

        let items = await queue.enqueuedItems
        XCTAssertEqual(items.map(\.conversationId), ["conv2", "conv3"])
    }

    /// L'échec d'UNE cible ne perd pas les autres, et la fiche survit avec les
    /// cibles servies MARQUÉES : la reprise suivante ne rejoue que ce qui reste.
    func test_consumeAll_whenOneTargetFails_keepsTheFicheWithProgress() async throws {
        let dir = try makeDirectory()
        try writeShare(in: dir)
        let queue = FakeOfflineMessageQueue()
        await queue.setThrowFromCallIndex(1)

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir)

        let reread = try XCTUnwrap(SharePendingSendConsumer.decodeRelay(
            try Data(contentsOf: dir.appendingPathComponent("cid_abc.json"))))
        XCTAssertEqual(reread.targets.map(\.state), [.sent, .pending, .pending],
                       "la progression est PERSISTÉE : sans elle, la reprise réenfilerait conv1")
    }

    func test_consumeAll_afterAPartialFailure_resumesWhereItStopped() async throws {
        let dir = try makeDirectory()
        try writeShare(in: dir)
        let failing = FakeOfflineMessageQueue()
        await failing.setThrowFromCallIndex(1)
        await SharePendingSendConsumer(queue: failing).consumeAll(in: dir)

        let recovering = FakeOfflineMessageQueue()
        await SharePendingSendConsumer(queue: recovering).consumeAll(in: dir)

        let items = await recovering.enqueuedItems
        XCTAssertEqual(items.map(\.conversationId), ["conv2", "conv3"],
                       "conv1 était déjà servie — la rejouer créerait un doublon d'upload")
        XCTAssertTrue(files(in: dir).isEmpty)
    }

    /// Interruption APRÈS la copie mais AVANT tout enfilage : la fiche décrit
    /// des octets présents, tout est encore à faire.
    func test_consumeAll_afterCopyOnly_enqueuesEverything() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(media: [photo], in: dir, mediaRoot: mediaRoot)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, mediaRoot: mediaRoot)

        let mediaCalls = await queue.enqueuedMediaCalls
        let items = await queue.enqueuedItems
        XCTAssertEqual(mediaCalls.count + items.count, 3)
    }

    /// Interruption APRÈS la première cible : les suivantes ne sont pas
    /// perdues. Le `clientMessageId` ne dédoublonne que sur
    /// `(conversationId, clientMessageId)` — il ne rattrape PAS une cible
    /// jamais servie.
    func test_consumeAll_afterTheFirstTarget_stillServesTheOthers() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(media: [photo], states: [.sent, .pending, .pending],
                       in: dir, mediaRoot: mediaRoot)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, mediaRoot: mediaRoot)

        let mediaCalls = await queue.enqueuedMediaCalls
        XCTAssertTrue(mediaCalls.isEmpty, "l'origine était déjà servie")
        let items = await queue.enqueuedItems
        XCTAssertEqual(items.map(\.conversationId), ["conv2", "conv3"])
        XCTAssertEqual(items.map(\.copyAttachmentsFromClientMessageId),
                       ["cid_abc_t0", "cid_abc_t0"])
    }

    /// Les octets restent tant qu'une cible reste à servir.
    func test_consumeAll_withAFailedTarget_keepsTheSharedMediaFolder() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        try writeShare(media: [photo], in: dir, mediaRoot: mediaRoot)
        let queue = FakeOfflineMessageQueue()
        await queue.setThrowFromCallIndex(0)

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, mediaRoot: mediaRoot)

        XCTAssertTrue(FileManager.default.fileExists(
            atPath: mediaRoot.appendingPathComponent("cid_abc/0.jpg").path))
    }
```

Ajouter au bas du fichier, à côté de `setShouldThrow` :

```swift
    /// Échoue à partir du N-ième appel : c'est ce qui simule une interruption
    /// EN COURS de fan-out, là où `shouldThrow` échoue dès le premier.
    func setThrowFromCallIndex(_ index: Int) {
        throwFromCallIndex = index
    }
```

et le champ correspondant dans `FakeOfflineMessageQueue` :

```swift
    var throwFromCallIndex: Int?
    private var totalCalls = 0

    private func shouldFailNow() -> Bool {
        defer { totalCalls += 1 }
        if let throwFromCallIndex, totalCalls >= throwFromCallIndex { return true }
        return shouldThrow
    }
```

en remplaçant les tests `if shouldThrow { throw errorToThrow }` d'`enqueue` et d'`enqueueMedia` par `if shouldFailNow() { throw errorToThrow }`.

- [ ] **Step 2: Vérifier l'échec**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/SharePendingSendConsumerTests -derivedDataPath apps/ios/Build
```

Attendu : `consumeAll(in:mediaRoot:)` inconnu (échec de compile), puis — une fois la signature ajoutée — les tests de fan-out ÉCHOUENT (aucun appel à `enqueueMedia`, `copyAttachmentsFromClientMessageId` nul).

- [ ] **Step 3: Réécrire la reprise**

Dans `apps/ios/Meeshy/Features/Main/Services/SharePendingSendConsumer.swift`, remplacer `consumeAll` et `makeItem` (`:56-111`) par :

```swift
    func consumeAll(
        in directory: URL? = SharePendingSendConsumer.directoryURL(),
        mediaRoot: URL? = SharePendingSendConsumer.mediaDirectoryURL()
    ) async {
        guard let directory else { return }
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil
        ) else { return }

        let relays = files.filter { $0.pathExtension == "json" }
        guard !relays.isEmpty else { return }

        logger.info("Reprise de \(relays.count, privacy: .public) partage(s) différé(s)")

        for url in relays {
            guard let data = try? Data(contentsOf: url) else {
                logger.error("Relais illisible sur disque : \(url.lastPathComponent, privacy: .public)")
                continue
            }
            guard let share = Self.decodeRelay(data) else {
                // Un payload corrompu ne redeviendra jamais lisible : le garder
                // ferait relire le même déchet à chaque lancement.
                remove(url, reason: "relais corrompu")
                continue
            }
            await consume(share, in: directory, mediaRoot: mediaRoot)
        }
    }

    /// Une fiche décrit N cibles, mais l'enfilage est fait PAR CIBLE.
    ///
    /// L'ORIGINE d'abord : c'est elle qui porte les octets, et les suivantes
    /// copieront ses pièces jointes. Chaque cible servie est marquée et la
    /// fiche RÉÉCRITE — une interruption au milieu ne rejoue que ce qui reste.
    /// Le dossier média n'est rendu que lorsque la dernière cible est servie.
    private func consume(
        _ share: PendingShare,
        in directory: URL,
        mediaRoot: URL?
    ) async {
        var current = share
        let origin = current.originTargetIndex ?? 0

        // L'ORIGINE d'abord, explicitement — pas par un tri : un prédicat
        // `{ lhs, _ in lhs == origin }` n'est pas un ordre faible strict, et
        // `sorted` n'en garantit alors AUCUN résultat.
        let order = [origin] + current.targets.indices.filter { $0 != origin }
        for index in order where current.targets[index].state != .sent {
            do {
                try await enqueue(current, targetIndex: index, origin: origin, mediaRoot: mediaRoot)
                current.targets[index].state = .sent
                do {
                    try Self.commit(current, in: directory)
                } catch {
                    logger.error(
                        "Fiche \(current.clientMessageId, privacy: .public) non réécrite : \(error.localizedDescription, privacy: .public)")
                }
            } catch {
                // Fichier CONSERVÉ : c'est ce qui rend la reprise réessayable.
                logger.error(
                    "Enfilement de la cible \(current.targets[index].conversationId, privacy: .public) échoué, conservé pour réessai : \(error.localizedDescription, privacy: .public)"
                )
            }
        }

        // Le DERNIER consommateur rend les octets — jamais le premier, sinon
        // les cibles suivantes ne trouveraient plus rien à téléverser.
        if current.isFullyServed, let mediaRoot, !current.media.isEmpty {
            let shareDirectory = mediaRoot.appendingPathComponent(
                current.clientMessageId, isDirectory: true)
            do {
                try FileManager.default.removeItem(at: shareDirectory)
            } catch let error as CocoaError where error.code == .fileNoSuchFile {
                _ = error
            } catch {
                logger.error(
                    "Dossier média \(current.clientMessageId, privacy: .public) non rendu : \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    /// **INVARIANT PRODUIT (décision user) : aucun destinataire ne voit une
    /// marque de transfert.** `forwardedFromId` reste nul sur TOUS les
    /// chemins ; les cibles suivantes passent par
    /// `copyAttachmentsFromClientMessageId`, que le serveur traduit en copie
    /// des pièces jointes vers de NOUVELLES lignes pointant les MÊMES fichiers.
    /// Réutiliser les `attachmentIds` de l'origine les DÉPLACERAIT
    /// (`associateAttachmentsToMessage` est un `updateMany`) — le premier
    /// destinataire les perdrait.
    private func enqueue(
        _ share: PendingShare,
        targetIndex: Int,
        origin: Int,
        mediaRoot: URL?
    ) async throws {
        let target = share.targets[targetIndex]
        let clientMessageId = Self.derivedClientMessageId(
            shareId: share.clientMessageId, targetIndex: targetIndex)
        let originClientMessageId = Self.derivedClientMessageId(
            shareId: share.clientMessageId, targetIndex: origin)

        let isOrigin = targetIndex == origin
        let hasUploadedIds = !(share.uploadedAttachmentIds ?? []).isEmpty

        if isOrigin, !share.media.isEmpty, !hasUploadedIds {
            guard let mediaRoot else { throw ConsumeError.mediaRootUnavailable }
            try await queue.enqueueMedia(
                sourceMediaURLs: share.media.map { mediaRoot.appendingPathComponent($0.relPath) },
                kinds: share.media.map { Self.attachmentKind(for: $0.mime) },
                conversationId: target.conversationId,
                content: share.content,
                clientMessageId: clientMessageId,
                originalLanguage: nil,
                replyToId: nil,
                forwardedFromId: nil,
                forwardedFromConversationId: nil,
                copyAttachmentsFromClientMessageId: nil,
                // Les octets sont PARTAGÉS entre les cibles : les balayer ici
                // laisserait les suivantes sans rien.
                deletesSourceFiles: false,
                createdAt: share.createdAt
            )
            return
        }

        try await queue.enqueue(OfflineQueueItem(
            id: UUID().uuidString,
            clientMessageId: clientMessageId,
            conversationId: target.conversationId,
            content: share.content ?? "",
            originalLanguage: nil,
            replyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            attachmentIds: isOrigin ? share.uploadedAttachmentIds : nil,
            localAudioPath: nil,
            copyAttachmentsFromClientMessageId:
                (isOrigin || share.media.isEmpty) ? nil : originClientMessageId,
            createdAt: share.createdAt
        ))
    }

    private enum ConsumeError: Error {
        case mediaRootUnavailable
    }

    /// Miroir minimal de `getAttachmentType` côté serveur : ce que le SDK
    /// attend dans `kinds`.
    private static func attachmentKind(for mime: String) -> String {
        if mime.hasPrefix("image/") { return "image" }
        if mime.hasPrefix("video/") { return "video" }
        if mime.hasPrefix("audio/") { return "audio" }
        return "document"
    }
```

> `OfflineQueueItem`'s decoder-friendly init gagne `copyAttachmentsFromClientMessageId` en Task 7 ; l'ordre des arguments ci-dessus suit celui de la déclaration (le champ est ajouté APRÈS `localAudioPath` et AVANT `createdAt` dans cet init). Si l'ordre retenu en Task 7 diffère, adapter ici — la compile le dira immédiatement.

- [ ] **Step 4: Vérifier le succès**

Rejouer la commande du Step 2.

Attendu : `SharePendingSendConsumerTests` PASSE (toutes classes de tests confondues — les tests de dégradation existants restent verts, `decodeRelay` promeut leurs payloads legacy).

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/SharePendingSendConsumer.swift \
        apps/ios/MeeshyTests/Unit/Share/SharePendingSendConsumerTests.swift \
        apps/ios/MeeshyTests/Mocks/FakeOfflineMessageQueue.swift
git commit -- apps/ios/Meeshy/Features/Main/Services/SharePendingSendConsumer.swift \
               apps/ios/MeeshyTests/Unit/Share/SharePendingSendConsumerTests.swift \
               apps/ios/MeeshyTests/Mocks/FakeOfflineMessageQueue.swift \
  -m "feat(ios): une reprise sert chaque destinataire, et le dernier seul rend les octets"
```

---

## Task 10: Le dispatcher — l'origine téléverse, les suivantes copient

> **Cette tâche exige `docs/superpowers/plans/2026-08-19-forward-reach.md` Task 5 déployée.** Sans elle, les lignes de fan-out restent en outbox et repartent dès que le serveur accepte le champ — aucune perte, mais aucun envoi non plus.

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/ShareFanoutOriginResolver.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher.swift:671-700` (branche `dispatchSendMessage`), `:866-885` (construction de `SendMessageRequest`)
- Test: `apps/ios/MeeshyTests/Unit/Share/ShareFanoutOriginResolverTests.swift`

**Interfaces:**
- Consumes: `OfflineQueueItem.copyAttachmentsFromClientMessageId` (Task 7), `SendMessageRequest.copyAttachmentsFromMessageId` (Task 7), `MessagePersistenceActor.resolveServerId(for:)` (existant, `MessagePersistenceActor.swift:1493-1497`).
- Produces:

```swift
enum ShareFanoutOriginResolver {
    enum Resolution: Equatable {
        case notAFanout
        case ready(serverMessageId: String)
        case waitingForOrigin(clientMessageId: String)
    }
    static func resolve(
        copyAttachmentsFromClientMessageId: String?,
        resolvedServerId: String?
    ) -> Resolution
}
```

- [ ] **Step 1: Écrire les tests rouges du résolveur**

Créer `apps/ios/MeeshyTests/Unit/Share/ShareFanoutOriginResolverTests.swift` :

```swift
import XCTest
@testable import Meeshy

/// Au moment de l'enfilage, la cible d'origine n'a pas encore été envoyée :
/// son identifiant SERVEUR n'existe pas. La ligne d'outbox porte donc un
/// identifiant LOCAL, que le dispatcher résout au moment de partir.
///
/// Sans cette résolution, deux issues également mauvaises : envoyer sans le
/// champ (le destinataire recevrait un message VIDE de pièces jointes), ou
/// abandonner la ligne (la cible serait perdue sans trace).
final class ShareFanoutOriginResolverTests: XCTestCase {

    func test_resolve_withoutAFanoutField_isNotAFanout() {
        XCTAssertEqual(
            ShareFanoutOriginResolver.resolve(
                copyAttachmentsFromClientMessageId: nil, resolvedServerId: nil),
            .notAFanout
        )
    }

    /// Un identifiant serveur connu par erreur ne transforme pas un envoi
    /// ordinaire en fan-out.
    func test_resolve_withoutAFanoutField_ignoresAStrayServerId() {
        XCTAssertEqual(
            ShareFanoutOriginResolver.resolve(
                copyAttachmentsFromClientMessageId: nil, resolvedServerId: "srv1"),
            .notAFanout
        )
    }

    func test_resolve_withAnAcknowledgedOrigin_isReady() {
        XCTAssertEqual(
            ShareFanoutOriginResolver.resolve(
                copyAttachmentsFromClientMessageId: "cid_abc_t0", resolvedServerId: "srv1"),
            .ready(serverMessageId: "srv1")
        )
    }

    /// L'origine n'est pas encore acquittée : la ligne doit ATTENDRE, pas
    /// partir amputée. Le dispatcher lève, l'outbox réessaie en backoff.
    func test_resolve_withAnUnacknowledgedOrigin_waits() {
        XCTAssertEqual(
            ShareFanoutOriginResolver.resolve(
                copyAttachmentsFromClientMessageId: "cid_abc_t0", resolvedServerId: nil),
            .waitingForOrigin(clientMessageId: "cid_abc_t0")
        )
    }

    /// Un identifiant serveur vide n'est pas un identifiant : le laisser
    /// passer enverrait `copyAttachmentsFromMessageId: ""`, que Prisma rejette
    /// sur un `@db.ObjectId`.
    func test_resolve_withAnEmptyServerId_waits() {
        XCTAssertEqual(
            ShareFanoutOriginResolver.resolve(
                copyAttachmentsFromClientMessageId: "cid_abc_t0", resolvedServerId: ""),
            .waitingForOrigin(clientMessageId: "cid_abc_t0")
        )
    }
}
```

- [ ] **Step 2: Vérifier l'échec**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
```

Attendu : exit 65, `error: cannot find 'ShareFanoutOriginResolver' in scope`.

- [ ] **Step 3: Écrire le résolveur**

Créer `apps/ios/Meeshy/Features/Main/Services/ShareFanoutOriginResolver.swift` :

```swift
import Foundation

/// Décide si une ligne d'outbox de fan-out de partage peut partir.
///
/// Le consommateur de partage enfile les cibles 2..N avec le
/// `clientMessageId` LOCAL de la cible d'origine — au moment de l'enfilage,
/// l'origine n'a pas encore été envoyée, son identifiant serveur n'existe pas.
/// Le dispatcher le résout au moment de partir (`PendingIdRecord`, écrit par
/// `reconcileSuccessfulMessageSend`).
///
/// Fonction PURE : la lecture GRDB reste chez l'appelant, la décision est ici
/// et se teste sans base.
enum ShareFanoutOriginResolver {

    enum Resolution: Equatable {
        /// Envoi ordinaire — la ligne ne participe à aucun fan-out.
        case notAFanout
        /// L'origine est acquittée : le message peut réclamer la copie de ses
        /// pièces jointes.
        case ready(serverMessageId: String)
        /// L'origine n'est pas encore acquittée. Partir maintenant livrerait un
        /// message VIDE de pièces jointes — l'appelant lève, l'outbox réessaie.
        case waitingForOrigin(clientMessageId: String)
    }

    static func resolve(
        copyAttachmentsFromClientMessageId: String?,
        resolvedServerId: String?
    ) -> Resolution {
        guard let origin = copyAttachmentsFromClientMessageId, !origin.isEmpty else {
            return .notAFanout
        }
        guard let serverId = resolvedServerId, !serverId.isEmpty else {
            return .waitingForOrigin(clientMessageId: origin)
        }
        return .ready(serverMessageId: serverId)
    }
}
```

- [ ] **Step 4: Câbler le dispatcher**

Dans `apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher.swift`, dans `dispatchSendMessage`, juste avant la construction de `SendMessageRequest` (`:866`), insérer :

```swift
            // Fan-out de partage : les cibles 2..N réclament une COPIE des
            // pièces jointes du message porté par la première — jamais un
            // transfert, qui ferait afficher « Transféré depuis <conversation
            // source> » au destinataire (décision user, invariant produit).
            let fanout = ShareFanoutOriginResolver.resolve(
                copyAttachmentsFromClientMessageId: item.copyAttachmentsFromClientMessageId,
                resolvedServerId: try? await DependencyContainer.shared.messagePersistence
                    .resolveServerId(for: item.copyAttachmentsFromClientMessageId ?? "")
            )
            let copyAttachmentsFromMessageId: String?
            switch fanout {
            case .notAFanout:
                copyAttachmentsFromMessageId = nil
            case .ready(let serverMessageId):
                copyAttachmentsFromMessageId = serverMessageId
            case .waitingForOrigin(let clientMessageId):
                // Partir maintenant livrerait un message VIDE de pièces
                // jointes. L'outbox réessaie en backoff : l'origine est dans la
                // même file, elle partira d'abord.
                throw NSError(
                    domain: "OutboxDispatcher",
                    code: 425,
                    userInfo: [NSLocalizedDescriptionKey:
                        "Origine de partage \(clientMessageId) pas encore acquittée"]
                )
            }
```

et ajouter à `SendMessageRequest` (`:866-875`) :

```swift
                copyAttachmentsFromMessageId: copyAttachmentsFromMessageId
```

- [ ] **Step 5: Ajouter la garde de source du dispatcher (RED puis GREEN)**

Ajouter à `apps/ios/MeeshyTests/Unit/Share/ShareFanoutOriginResolverTests.swift` :

```swift
    // MARK: - Garde de source : le dispatcher ne transfère JAMAIS un partage

    private var dispatcherSource: String {
        get throws {
            try String(
                contentsOf: URL(fileURLWithPath: #filePath)
                    .deletingLastPathComponent()   // Share
                    .deletingLastPathComponent()   // Unit
                    .deletingLastPathComponent()   // MeeshyTests
                    .deletingLastPathComponent()   // ios
                    .appendingPathComponent(
                        "Meeshy/Features/Main/Services/OutboxDispatcher.swift"),
                encoding: .utf8
            )
        }
    }

    /// Un partage multi-destinataires COPIE. Le jour où quelqu'un « simplifie »
    /// en réutilisant le chemin de transfert déjà présent dans ce fichier, ce
    /// garde rougit — et pas un destinataire mécontent.
    func test_dispatcher_wiresTheCopyModeForFanout() throws {
        let source = try dispatcherSource
        XCTAssertTrue(source.contains("copyAttachmentsFromMessageId:"),
                      "le dispatcher doit passer le mode COPIE au corps d'envoi")
        XCTAssertTrue(source.contains("ShareFanoutOriginResolver.resolve"),
                      "l'origine doit être résolue, jamais devinée")
    }

    /// Le champ de fan-out ne doit JAMAIS être branché sur `forwardedFromId` :
    /// c'est exactement le raccourci qui ferait fuiter le nom de la première
    /// conversation vers la seconde.
    func test_dispatcher_neverBindsTheFanoutOriginToForwardedFromId() throws {
        XCTAssertFalse(
            try dispatcherSource.contains("forwardedFromId: item.copyAttachmentsFromClientMessageId"),
            "un partage vers « Famille » puis « Collègues » révélerait « Famille » aux collègues"
        )
    }
```

- [ ] **Step 6: Vérifier le succès**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/ShareFanoutOriginResolverTests -derivedDataPath apps/ios/Build
```

Attendu : `ShareFanoutOriginResolverTests` PASSE (7 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/ShareFanoutOriginResolver.swift \
        apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher.swift \
        apps/ios/MeeshyTests/Unit/Share/ShareFanoutOriginResolverTests.swift \
        apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -- apps/ios/Meeshy/Features/Main/Services/ShareFanoutOriginResolver.swift \
               apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher.swift \
               apps/ios/MeeshyTests/Unit/Share/ShareFanoutOriginResolverTests.swift \
               apps/ios/Meeshy.xcodeproj/project.pbxproj \
  -m "feat(ios): les destinataires suivants recoivent une copie, jamais un transfert"
```

---

## Task 11: Purge par âge des fiches et des dossiers médias

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/SharePendingSendConsumer.swift`
- Test: `apps/ios/MeeshyTests/Unit/Share/SharePendingSendConsumerTests.swift`

**Interfaces:**
- Consumes: `SharePendingSendConsumer.decodeRelay(_:)` (Task 4).
- Produces:

```swift
extension SharePendingSendConsumer {
    nonisolated static let maxRelayAge: TimeInterval           // 604_800 (7 jours)
    nonisolated static func isExpired(createdAt: Date, now: Date, maxAge: TimeInterval) -> Bool
    func consumeAll(
        in directory: URL? = SharePendingSendConsumer.directoryURL(),
        mediaRoot: URL? = SharePendingSendConsumer.mediaDirectoryURL(),
        now: Date = Date()
    ) async
}
```

- [ ] **Step 1: Écrire les tests rouges de la purge**

Ajouter à `apps/ios/MeeshyTests/Unit/Share/SharePendingSendConsumerTests.swift` :

```swift
    // MARK: - Purge par âge

    /// `share_pending_sends` n'a aujourd'hui NI cap NI TTL et n'est nettoyé
    /// qu'au logout (`WidgetDataManager.wipeAll`) : un partage jamais repris —
    /// parce que son compte est mort, parce que sa conversation a été
    /// supprimée — resterait sur disque INDÉFINIMENT, avec ses octets.
    func test_maxRelayAge_isSevenDays() {
        XCTAssertEqual(SharePendingSendConsumer.maxRelayAge, 604_800)
    }

    func test_isExpired_atTheBoundary_isFalse() {
        let now = Date(timeIntervalSince1970: 1_785_000_000)
        XCTAssertFalse(SharePendingSendConsumer.isExpired(
            createdAt: now.addingTimeInterval(-604_800), now: now, maxAge: 604_800),
            "exactement à l'âge maximal, la fiche vit encore")
    }

    func test_isExpired_beyondTheBoundary_isTrue() {
        let now = Date(timeIntervalSince1970: 1_785_000_000)
        XCTAssertTrue(SharePendingSendConsumer.isExpired(
            createdAt: now.addingTimeInterval(-604_801), now: now, maxAge: 604_800))
    }

    /// Une fiche datée du FUTUR (horloge changée) n'est pas expirée : la
    /// purger détruirait un partage tout juste créé.
    func test_isExpired_forAFutureDate_isFalse() {
        let now = Date(timeIntervalSince1970: 1_785_000_000)
        XCTAssertFalse(SharePendingSendConsumer.isExpired(
            createdAt: now.addingTimeInterval(3600), now: now, maxAge: 604_800))
    }

    func test_consumeAll_purgesAnExpiredFiche_withoutEnqueuingIt() async throws {
        let dir = try makeDirectory()
        let now = Date(timeIntervalSince1970: 1_785_000_000)
        try writeShare(createdAt: now.addingTimeInterval(-604_801), in: dir)
        let queue = FakeOfflineMessageQueue()

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, now: now)

        let count = await queue.enqueueCount
        XCTAssertEqual(count, 0, "une fiche expirée n'est pas enfilée, elle est jetée")
        XCTAssertTrue(files(in: dir).isEmpty)
    }

    func test_consumeAll_purgesTheMediaFolderOfAnExpiredFiche() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        let now = Date(timeIntervalSince1970: 1_785_000_000)
        try writeShare(media: [photo], createdAt: now.addingTimeInterval(-604_801),
                       in: dir, mediaRoot: mediaRoot)

        await SharePendingSendConsumer(queue: FakeOfflineMessageQueue())
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: now)

        XCTAssertFalse(FileManager.default.fileExists(
            atPath: mediaRoot.appendingPathComponent("cid_abc").path),
            "les octets d'un partage expiré partent avec lui")
    }

    func test_consumeAll_keepsAFreshFiche() async throws {
        let dir = try makeDirectory()
        let now = Date(timeIntervalSince1970: 1_785_000_000)
        try writeShare(createdAt: now.addingTimeInterval(-3600), in: dir)
        let queue = FakeOfflineMessageQueue()
        await queue.setShouldThrow(true)

        await SharePendingSendConsumer(queue: queue).consumeAll(in: dir, now: now)

        XCTAssertEqual(files(in: dir), ["cid_abc.json"],
                       "un partage récent en échec transitoire reste réessayable")
    }

    /// Un dossier média ORPHELIN — sa fiche a disparu (purge de logout,
    /// suppression manuelle, crash entre les deux écritures) — n'a plus aucune
    /// chance d'être consommé. Il ne doit pas occuper le disque à vie.
    func test_consumeAll_sweepsAnOrphanMediaFolder() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        let orphan = mediaRoot.appendingPathComponent("cid_orphelin", isDirectory: true)
        try FileManager.default.createDirectory(at: orphan, withIntermediateDirectories: true)
        try Data(repeating: 3, count: 16).write(to: orphan.appendingPathComponent("0.jpg"))
        // Une fiche vivante à côté, pour prouver que la purge ne balaie pas tout.
        try writeShare(media: [photo], in: dir, mediaRoot: mediaRoot)
        let queue = FakeOfflineMessageQueue()
        await queue.setShouldThrow(true)

        await SharePendingSendConsumer(queue: queue)
            .consumeAll(in: dir, mediaRoot: mediaRoot,
                        now: Date(timeIntervalSince1970: 1_785_000_000))

        XCTAssertFalse(FileManager.default.fileExists(atPath: orphan.path))
        XCTAssertTrue(
            FileManager.default.fileExists(atPath: mediaRoot.appendingPathComponent("cid_abc").path),
            "le dossier d'une fiche VIVANTE ne doit jamais être pris pour un orphelin"
        )
    }

    func test_consumeAll_withoutAnyFiche_stillSweepsOrphanMediaFolders() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot()
        let orphan = mediaRoot.appendingPathComponent("cid_orphelin", isDirectory: true)
        try FileManager.default.createDirectory(at: orphan, withIntermediateDirectories: true)

        await SharePendingSendConsumer(queue: FakeOfflineMessageQueue())
            .consumeAll(in: dir, mediaRoot: mediaRoot, now: Date())

        XCTAssertFalse(
            FileManager.default.fileExists(atPath: orphan.path),
            "l'ancien code sortait TÔT quand le dossier de fiches était vide — "
            + "les octets orphelins survivaient à tout"
        )
    }
```

- [ ] **Step 2: Vérifier l'échec**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
```

Attendu : exit 65, `error: type 'SharePendingSendConsumer' has no member 'maxRelayAge'` et `extra argument 'now' in call`.

- [ ] **Step 3: Implémenter la purge**

Dans `apps/ios/Meeshy/Features/Main/Services/SharePendingSendConsumer.swift`, ajouter au contrat :

```swift
    /// Sept jours. `share_pending_sends` n'avait NI cap NI TTL et n'était
    /// nettoyé qu'au logout (`WidgetDataManager.wipeAll`) : un partage jamais
    /// repris — compte mort, conversation supprimée, fichier illisible —
    /// occupait le disque indéfiniment, avec ses octets.
    nonisolated static let maxRelayAge: TimeInterval = 604_800

    /// Une fiche datée du FUTUR (horloge de l'appareil changée) n'est PAS
    /// expirée : la purger détruirait un partage tout juste créé.
    nonisolated static func isExpired(
        createdAt: Date, now: Date, maxAge: TimeInterval
    ) -> Bool {
        now.timeIntervalSince(createdAt) > maxAge
    }
```

Remplacer la signature et le corps de `consumeAll` par :

```swift
    func consumeAll(
        in directory: URL? = SharePendingSendConsumer.directoryURL(),
        mediaRoot: URL? = SharePendingSendConsumer.mediaDirectoryURL(),
        now: Date = Date()
    ) async {
        var liveShareIds: Set<String> = []
        defer { sweepOrphanMediaFolders(in: mediaRoot, keeping: liveShareIds) }

        guard let directory else { return }
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil
        ) else { return }

        let relays = files.filter { $0.pathExtension == "json" }
        guard !relays.isEmpty else { return }

        logger.info("Reprise de \(relays.count, privacy: .public) partage(s) différé(s)")

        for url in relays {
            guard let data = try? Data(contentsOf: url) else {
                logger.error("Relais illisible sur disque : \(url.lastPathComponent, privacy: .public)")
                continue
            }
            guard let share = Self.decodeRelay(data) else {
                // Un payload corrompu ne redeviendra jamais lisible : le garder
                // ferait relire le même déchet à chaque lancement.
                remove(url, reason: "relais corrompu")
                continue
            }
            guard !Self.isExpired(
                createdAt: share.createdAt, now: now, maxAge: Self.maxRelayAge
            ) else {
                remove(url, reason: "relais expiré")
                discardMedia(shareId: share.clientMessageId, in: mediaRoot)
                continue
            }
            liveShareIds.insert(share.clientMessageId)
            await consume(share, in: directory, mediaRoot: mediaRoot)
        }
    }

    /// Un dossier média dont la fiche a disparu (purge de logout, crash entre
    /// les deux écritures) n'a plus aucune chance d'être consommé. Balayé à
    /// CHAQUE passage — et hors de la garde de sortie anticipée, sinon un
    /// dossier de fiches vide le rendrait immortel.
    private func sweepOrphanMediaFolders(in mediaRoot: URL?, keeping liveShareIds: Set<String>) {
        guard let mediaRoot,
              let folders = try? FileManager.default.contentsOfDirectory(
                at: mediaRoot, includingPropertiesForKeys: nil) else { return }
        for folder in folders where !liveShareIds.contains(folder.lastPathComponent) {
            do {
                try FileManager.default.removeItem(at: folder)
            } catch {
                logger.error(
                    "Dossier média orphelin \(folder.lastPathComponent, privacy: .public) non balayé : \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    private func discardMedia(shareId: String, in mediaRoot: URL?) {
        guard let mediaRoot else { return }
        try? FileManager.default.removeItem(
            at: mediaRoot.appendingPathComponent(shareId, isDirectory: true))
    }
```

> `liveShareIds` est alimenté AVANT `consume`, pas après : une fiche entièrement servie voit son dossier rendu par `consume`, et le balayage d'orphelins n'a alors plus rien à faire — mais une fiche dont la reprise ÉCHOUE reste protégée.

- [ ] **Step 4: Vérifier le succès**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/SharePendingSendConsumerTests -derivedDataPath apps/ios/Build
```

Attendu : toute la classe PASSE.

- [ ] **Step 5: Étendre le wipe de logout au dossier média**

`WidgetDataManager.wipeAll` (`apps/ios/Meeshy/Features/Main/Services/WidgetDataManager.swift:204-208`) purge déjà `SharePendingSendConsumer.directoryURL()`. Les octets d'un partage doivent partir avec le compte sortant : ajouter à la liste `stagingDirs` :

```swift
            SharePendingSendConsumer.mediaDirectoryURL(),
```

- [ ] **Step 6: Vérifier le succès du wipe**

```bash
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/WidgetDataManagerSharedContainerWriteGuardTests \
  -derivedDataPath apps/ios/Build
```

Attendu : PASSE. Si la suite du `wipeAll` compte les répertoires purgés, mettre son attente à jour.

- [ ] **Step 7: Gate complet du lot B-1**

```bash
./apps/ios/meeshy.sh test
```

Attendu : phases 0 à 3 vertes. **Le lot B-1 est livré** : partager photos, vidéos, GIFs et documents à plusieurs personnes fonctionne de bout en bout.

- [ ] **Step 8: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Services/SharePendingSendConsumer.swift \
        apps/ios/Meeshy/Features/Main/Services/WidgetDataManager.swift \
        apps/ios/MeeshyTests/Unit/Share/SharePendingSendConsumerTests.swift
git commit -- apps/ios/Meeshy/Features/Main/Services/SharePendingSendConsumer.swift \
               apps/ios/Meeshy/Features/Main/Services/WidgetDataManager.swift \
               apps/ios/MeeshyTests/Unit/Share/SharePendingSendConsumerTests.swift \
  -m "feat(ios): un partage jamais repris finit par rendre son disque"
```

---

# LOT B-2 — upload opportuniste dans l'extension

**Pure optimisation. Annulable sans perte de fonction** : sans ce lot, tout partage média part à la prochaine ouverture de l'app (lot B-1). Avec lui, les petits partages sont déjà arrivés à la fermeture de la feuille.

**Seuil, fixé et justifié :** l'upload n'est tenté QUE si le partage pèse **au plus 8 Mio au total** ET compte **au plus 4 fichiers**. Chaque fichier tient alors dans UNE tranche TUS de 10 Mio (un POST + un PATCH), le pic mémoire reste ≤ 8 Mio sous un plafond de 120 Mo, et l'ensemble se termine en 2 à 4 s sur LTE — dans la fenêtre où la feuille de partage reste vivante. **Au-delà, rien n'est tenté** : la fiche part telle quelle et l'app reprend.

---

## Task 12: Client TUS minimal dans l'extension

**Files:**
- Create: `apps/ios/MeeshyShareExtension/ShareTusClient.swift`
- Modify: `apps/ios/MeeshyShareExtension/ShareLimits.swift`
- Modify: `apps/ios/project.yml` (sources de `MeeshyTests`)
- Test: `apps/ios/MeeshyTests/Unit/Share/ShareTusClientTests.swift`

**Interfaces:**
- Consumes: `ShareSession` (existant), `ShareStagedMedia` (Task 2), `ShareLimits` (Task 2).
- Produces:

```swift
nonisolated enum ShareLimits {
    // … existant …
    static let opportunisticUploadBudgetBytes: Int   // 8_388_608
    static let opportunisticUploadMaxFiles: Int      // 4
    static func isOpportunisticUploadEligible(totalBytes: Int, fileCount: Int) -> Bool
}

nonisolated enum ShareTusError: Error, Equatable {
    case createRefused(status: Int)
    case missingLocation
    case patchRefused(status: Int, offset: Int)
    case missingAttachmentId
}

nonisolated enum ShareTusClient {
    static let chunkSize: Int                        // 10 * 1024 * 1024
    static let resumableVersion: String              // "1.0.0"
    static func metadataValue(fileName: String, mime: String) -> String
    static func createRequest(baseURL: String, bytes: Int, fileName: String,
                              mime: String, session: ShareSession) -> URLRequest?
    static func resolveLocation(_ raw: String, baseURL: String) -> URL?
    static func patchRequest(location: URL, offset: Int, session: ShareSession) -> URLRequest
    static func attachmentId(fromFinalBody data: Data) -> String?
    static func upload(file: URL, media: ShareStagedMedia, session: ShareSession,
                       urlSession: URLSession) async throws -> String
}
```

- [ ] **Step 1: Écrire les tests rouges**

Créer `apps/ios/MeeshyTests/Unit/Share/ShareTusClientTests.swift` :

```swift
import XCTest

/// Rejoue une conversation TUS préparée, et capture ce que le client a
/// réellement émis. `TusUploadManager` du SDK est inutilisable ici : il traîne
/// un checkpoint GRDB et un seed `CacheCoordinator`, sous un plafond de 120 Mo
/// et sans droit à `beginBackgroundTask`.
private final class TusStubURLProtocol: URLProtocol {
    struct Exchange {
        let status: Int
        let headers: [String: String]
        let body: Data
    }

    // SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor (SE-0466) : `startLoading()`
    // surcharge une exigence Foundation nonisolated et s'exécute hors du main
    // actor. Chaque test prépare la file avant d'attendre ses requêtes.
    nonisolated(unsafe) static var exchanges: [Exchange] = []
    nonisolated(unsafe) static var methods: [String] = []
    nonisolated(unsafe) static var urls: [String] = []
    nonisolated(unsafe) static var headers: [[String: String]] = []
    nonisolated(unsafe) static var bodies: [Data] = []

    static func reset() {
        exchanges = []; methods = []; urls = []; headers = []; bodies = []
    }

    override nonisolated class func canInit(with request: URLRequest) -> Bool { true }

    /// `URLProtocol` vide `httpBody` au profit de `httpBodyStream` : sans
    /// re-matérialisation, les tranches capturées seraient vides et les
    /// assertions passeraient sur du néant.
    override nonisolated class func canonicalRequest(for request: URLRequest) -> URLRequest {
        var canonical = request
        if canonical.httpBody == nil, let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var data = Data()
            let size = 8192
            let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: size)
            defer { buffer.deallocate() }
            while stream.hasBytesAvailable {
                let read = stream.read(buffer, maxLength: size)
                if read <= 0 { break }
                data.append(buffer, count: read)
            }
            canonical.httpBody = data
        }
        return canonical
    }

    override nonisolated func startLoading() {
        Self.methods.append(request.httpMethod ?? "")
        Self.urls.append(request.url?.absoluteString ?? "")
        Self.headers.append(request.allHTTPHeaderFields ?? [:])
        Self.bodies.append(request.httpBody ?? Data())

        let next = Self.exchanges.isEmpty
            ? Exchange(status: 500, headers: [:], body: Data())
            : Self.exchanges.removeFirst()
        let response = HTTPURLResponse(
            url: request.url ?? URL(string: "https://stub.meeshy.test")!,
            statusCode: next.status, httpVersion: nil, headerFields: next.headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: next.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override nonisolated func stopLoading() {}
}

final class ShareTusClientTests: XCTestCase {

    override func setUp() { super.setUp(); TusStubURLProtocol.reset() }
    override func tearDown() { TusStubURLProtocol.reset(); super.tearDown() }

    private func makeSession() -> ShareSession {
        ShareSession(userId: "u1", token: "jwt", apiBaseURL: "https://gate.meeshy.me")
    }

    private func makeStubbedSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [TusStubURLProtocol.self]
        return URLSession(configuration: config)
    }

    private func makeFile(bytes: Int) throws -> URL {
        let url = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("tus-\(UUID().uuidString).jpg")
        var payload = Data(capacity: bytes)
        for index in 0..<bytes { payload.append(UInt8(index % 251)) }
        try payload.write(to: url)
        return url
    }

    private func media(bytes: Int) -> ShareStagedMedia {
        ShareStagedMedia(relPath: "cid_abc/0.jpg", ext: "jpg", mime: "image/jpeg", bytes: bytes)
    }

    private func finishBody(id: String) -> Data {
        Data("""
        {"success":true,"data":{"attachment":{"id":"\(id)","fileName":"a.jpg",\
        "mimeType":"image/jpeg","fileSize":4}}}
        """.utf8)
    }

    // MARK: - Seuil

    func test_opportunisticThreshold_isEightMebibytesAndFourFiles() {
        XCTAssertEqual(ShareLimits.opportunisticUploadBudgetBytes, 8_388_608)
        XCTAssertEqual(ShareLimits.opportunisticUploadMaxFiles, 4)
    }

    func test_isOpportunisticUploadEligible_atTheBudget_isTrue() {
        XCTAssertTrue(ShareLimits.isOpportunisticUploadEligible(
            totalBytes: 8_388_608, fileCount: 4))
    }

    func test_isOpportunisticUploadEligible_aboveTheByteBudget_isFalse() {
        XCTAssertFalse(
            ShareLimits.isOpportunisticUploadEligible(totalBytes: 8_388_609, fileCount: 1),
            "au-delà du seuil, rien n'est tenté — la feuille mourrait au milieu"
        )
    }

    func test_isOpportunisticUploadEligible_aboveTheFileCount_isFalse() {
        XCTAssertFalse(ShareLimits.isOpportunisticUploadEligible(
            totalBytes: 1_000, fileCount: 5))
    }

    func test_isOpportunisticUploadEligible_withNoFile_isFalse() {
        XCTAssertFalse(ShareLimits.isOpportunisticUploadEligible(
            totalBytes: 0, fileCount: 0))
    }

    // MARK: - Construction des requêtes

    func test_createRequest_carriesTheTusContract() throws {
        let request = try XCTUnwrap(ShareTusClient.createRequest(
            baseURL: "https://gate.meeshy.me", bytes: 2048,
            fileName: "photo.jpg", mime: "image/jpeg", session: makeSession()))

        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.absoluteString, "https://gate.meeshy.me/api/v1/uploads")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Tus-Resumable"), "1.0.0")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Upload-Length"), "2048")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer jwt")
    }

    /// Le contrat TUS : `clé <valeur base64>`, paires séparées par des virgules.
    func test_metadataValue_base64EncodesEachValue() {
        let value = ShareTusClient.metadataValue(fileName: "photo.jpg", mime: "image/jpeg")

        XCTAssertEqual(
            value,
            "filename \(Data("photo.jpg".utf8).base64EncodedString()),"
            + "filetype \(Data("image/jpeg".utf8).base64EncodedString())"
        )
    }

    func test_patchRequest_carriesTheOffsetContract() {
        let request = ShareTusClient.patchRequest(
            location: URL(string: "https://gate.meeshy.me/api/v1/uploads/x")!,
            offset: 10_485_760, session: makeSession())

        XCTAssertEqual(request.httpMethod, "PATCH")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Tus-Resumable"), "1.0.0")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"),
                       "application/offset+octet-stream")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Upload-Offset"), "10485760")
    }

    /// Le serveur peut répondre une `Location` ABSOLUE ou RELATIVE. Traiter la
    /// seconde comme absolue produirait une URL nulle et un upload
    /// silencieusement mort.
    func test_resolveLocation_acceptsAbsoluteAndRelativeForms() {
        XCTAssertEqual(
            ShareTusClient.resolveLocation(
                "https://gate.meeshy.me/api/v1/uploads/abc", baseURL: "https://gate.meeshy.me"),
            URL(string: "https://gate.meeshy.me/api/v1/uploads/abc")
        )
        XCTAssertEqual(
            ShareTusClient.resolveLocation("/api/v1/uploads/abc", baseURL: "https://gate.meeshy.me"),
            URL(string: "https://gate.meeshy.me/api/v1/uploads/abc")
        )
    }

    func test_attachmentId_readsTheGatewayEnvelope() {
        XCTAssertEqual(ShareTusClient.attachmentId(fromFinalBody: finishBody(id: "att9")), "att9")
    }

    func test_attachmentId_onAnUnexpectedShape_isNil() {
        XCTAssertNil(ShareTusClient.attachmentId(fromFinalBody: Data("{}".utf8)))
    }

    // MARK: - Upload complet

    func test_upload_smallFile_postsThenPatchesOnce_andReturnsTheAttachmentId() async throws {
        let file = try makeFile(bytes: 4096)
        TusStubURLProtocol.exchanges = [
            .init(status: 201,
                  headers: ["Location": "https://gate.meeshy.me/api/v1/uploads/abc"],
                  body: Data()),
            .init(status: 200, headers: [:], body: finishBody(id: "att1"))
        ]

        let id = try await ShareTusClient.upload(
            file: file, media: media(bytes: 4096),
            session: makeSession(), urlSession: makeStubbedSession())

        XCTAssertEqual(id, "att1")
        XCTAssertEqual(TusStubURLProtocol.methods, ["POST", "PATCH"])
        XCTAssertEqual(TusStubURLProtocol.bodies[1].count, 4096)
        XCTAssertEqual(TusStubURLProtocol.headers[1]["Upload-Offset"], "0")
    }

    /// Les octets envoyés doivent être EXACTEMENT ceux du fichier : une copie
    /// tronquée passerait un test qui ne compte que la taille.
    func test_upload_sendsTheExactBytes() async throws {
        let file = try makeFile(bytes: 1024)
        TusStubURLProtocol.exchanges = [
            .init(status: 201, headers: ["Location": "/api/v1/uploads/abc"], body: Data()),
            .init(status: 200, headers: [:], body: finishBody(id: "att1"))
        ]

        _ = try await ShareTusClient.upload(
            file: file, media: media(bytes: 1024),
            session: makeSession(), urlSession: makeStubbedSession())

        XCTAssertEqual(TusStubURLProtocol.bodies[1], try Data(contentsOf: file))
    }

    func test_upload_whenCreationIsRefused_throws() async throws {
        let file = try makeFile(bytes: 128)
        TusStubURLProtocol.exchanges = [.init(status: 413, headers: [:], body: Data())]

        do {
            _ = try await ShareTusClient.upload(
                file: file, media: media(bytes: 128),
                session: makeSession(), urlSession: makeStubbedSession())
            XCTFail("une création refusée doit remonter, pas produire un id fantôme")
        } catch {
            XCTAssertEqual(error as? ShareTusError, .createRefused(status: 413))
        }
    }

    func test_upload_withoutALocationHeader_throws() async throws {
        let file = try makeFile(bytes: 128)
        TusStubURLProtocol.exchanges = [.init(status: 201, headers: [:], body: Data())]

        do {
            _ = try await ShareTusClient.upload(
                file: file, media: media(bytes: 128),
                session: makeSession(), urlSession: makeStubbedSession())
            XCTFail("sans Location, il n'y a nulle part où écrire")
        } catch {
            XCTAssertEqual(error as? ShareTusError, .missingLocation)
        }
    }

    func test_upload_whenAChunkIsRefused_throws() async throws {
        let file = try makeFile(bytes: 128)
        TusStubURLProtocol.exchanges = [
            .init(status: 201, headers: ["Location": "/api/v1/uploads/abc"], body: Data()),
            .init(status: 409, headers: [:], body: Data())
        ]

        do {
            _ = try await ShareTusClient.upload(
                file: file, media: media(bytes: 128),
                session: makeSession(), urlSession: makeStubbedSession())
            XCTFail("l'extension n'a AUCUNE reprise : un conflit d'offset est terminal ici")
        } catch {
            XCTAssertEqual(error as? ShareTusError, .patchRefused(status: 409, offset: 0))
        }
    }

    /// Sans identifiant d'attachment, il n'y a rien à mettre dans la fiche :
    /// le prétendre réussi ferait envoyer un message VIDE de pièces jointes.
    func test_upload_withoutAnAttachmentIdInTheFinalBody_throws() async throws {
        let file = try makeFile(bytes: 128)
        TusStubURLProtocol.exchanges = [
            .init(status: 201, headers: ["Location": "/api/v1/uploads/abc"], body: Data()),
            .init(status: 200, headers: [:], body: Data("{\"success\":true}".utf8))
        ]

        do {
            _ = try await ShareTusClient.upload(
                file: file, media: media(bytes: 128),
                session: makeSession(), urlSession: makeStubbedSession())
            XCTFail("un upload sans id n'est pas un upload réussi")
        } catch {
            XCTAssertEqual(error as? ShareTusError, .missingAttachmentId)
        }
    }
}
```

- [ ] **Step 2: Vérifier l'échec**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
```

Attendu : exit 65, `error: cannot find 'ShareTusClient' in scope` et `type 'ShareLimits' has no member 'opportunisticUploadBudgetBytes'`.

- [ ] **Step 3: Ajouter le seuil aux plafonds**

Dans `apps/ios/MeeshyShareExtension/ShareLimits.swift`, ajouter :

```swift
    /// 8 Mio. Chaque fichier tient alors dans UNE tranche TUS de 10 Mio
    /// (un POST + un PATCH), le pic mémoire reste très en deçà du plafond de
    /// 120 Mo, et l'ensemble se termine en 2 à 4 s sur LTE — dans la fenêtre
    /// où la feuille de partage reste vivante. Au-delà, RIEN n'est tenté : un
    /// upload interrompu par la fermeture de la feuille laisserait des
    /// attachments orphelins jusqu'à H+24, pour un partage que l'app aurait de
    /// toute façon repris.
    static let opportunisticUploadBudgetBytes = 8_388_608

    /// Quatre fichiers au plus : au-delà, le nombre d'allers-retours devient
    /// le facteur limitant, pas le volume.
    static let opportunisticUploadMaxFiles = 4

    static func isOpportunisticUploadEligible(totalBytes: Int, fileCount: Int) -> Bool {
        fileCount > 0
            && fileCount <= opportunisticUploadMaxFiles
            && totalBytes <= opportunisticUploadBudgetBytes
    }
```

- [ ] **Step 4: Écrire `ShareTusClient.swift`**

Créer `apps/ios/MeeshyShareExtension/ShareTusClient.swift` :

```swift
import Foundation

nonisolated enum ShareTusError: Error, Equatable {
    case createRefused(status: Int)
    case missingLocation
    case patchRefused(status: Int, offset: Int)
    case missingAttachmentId
}

/// Client TUS minimal, taillé pour une extension de partage.
///
/// `TusUploadManager` du SDK est inutilisable ici : il traîne un checkpoint
/// GRDB et un seed `CacheCoordinator` (`:170-200`), sous un plafond mémoire de
/// ~120 Mo et sans droit à `beginBackgroundTask`. Ce client n'a **aucune
/// reprise, aucun checkpoint, aucun `HEAD` de récupération d'offset** : il
/// réussit vite ou il échoue, et l'échec est déjà couvert — la fiche de reprise
/// part sur disque avant lui, l'app rejouera.
///
/// Il n'est appelé que sous le seuil de
/// `ShareLimits.isOpportunisticUploadEligible` : chaque fichier tient dans une
/// seule tranche.
nonisolated enum ShareTusClient {

    /// 10 Mio — parité EXACTE avec `TusUploadManager.chunkSize` du SDK. Deux
    /// clients qui découperaient différemment produiraient des offsets
    /// incompatibles sur un même upload.
    static let chunkSize = 10 * 1024 * 1024
    static let resumableVersion = "1.0.0"

    /// Contrat TUS : `clé <valeur base64>`, paires séparées par des virgules.
    static func metadataValue(fileName: String, mime: String) -> String {
        let encodedName = Data(fileName.utf8).base64EncodedString()
        let encodedType = Data(mime.utf8).base64EncodedString()
        return "filename \(encodedName),filetype \(encodedType)"
    }

    static func createRequest(
        baseURL: String, bytes: Int, fileName: String, mime: String, session: ShareSession
    ) -> URLRequest? {
        guard let url = URL(string: "\(baseURL)/api/v1/uploads") else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
        request.setValue(resumableVersion, forHTTPHeaderField: "Tus-Resumable")
        request.setValue("\(bytes)", forHTTPHeaderField: "Upload-Length")
        request.setValue(metadataValue(fileName: fileName, mime: mime),
                         forHTTPHeaderField: "Upload-Metadata")
        return request
    }

    /// Le serveur peut répondre une `Location` absolue OU relative. Traiter la
    /// seconde comme absolue produirait une URL nulle et un upload
    /// silencieusement mort.
    static func resolveLocation(_ raw: String, baseURL: String) -> URL? {
        if let absolute = URL(string: raw), absolute.scheme != nil { return absolute }
        guard let base = URL(string: baseURL) else { return nil }
        return URL(string: raw, relativeTo: base)?.absoluteURL
    }

    static func patchRequest(location: URL, offset: Int, session: ShareSession) -> URLRequest {
        var request = URLRequest(url: location)
        request.httpMethod = "PATCH"
        request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
        request.setValue(resumableVersion, forHTTPHeaderField: "Tus-Resumable")
        request.setValue("application/offset+octet-stream", forHTTPHeaderField: "Content-Type")
        request.setValue("\(offset)", forHTTPHeaderField: "Upload-Offset")
        return request
    }

    /// Le hook `onUploadFinish` du gateway renvoie l'attachment créé dans le
    /// corps de la DERNIÈRE tranche.
    static func attachmentId(fromFinalBody data: Data) -> String? {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let payload = root["data"] as? [String: Any],
              let attachment = payload["attachment"] as? [String: Any] else { return nil }
        return attachment["id"] as? String
    }

    /// Téléverse UN fichier et renvoie l'identifiant de la pièce jointe créée.
    ///
    /// Lecture par tranches via `FileHandle` : le fichier n'est jamais chargé
    /// entier en mémoire, même sous le seuil.
    static func upload(
        file: URL,
        media: ShareStagedMedia,
        session: ShareSession,
        urlSession: URLSession = .shared
    ) async throws -> String {
        guard let create = createRequest(
            baseURL: session.apiBaseURL, bytes: media.bytes,
            fileName: URL(fileURLWithPath: media.relPath).lastPathComponent,
            mime: media.mime, session: session
        ) else { throw ShareTusError.missingLocation }

        let (_, createResponse) = try await urlSession.data(for: create)
        guard let http = createResponse as? HTTPURLResponse else {
            throw ShareTusError.createRefused(status: -1)
        }
        guard http.statusCode == 201 else {
            throw ShareTusError.createRefused(status: http.statusCode)
        }
        guard let rawLocation = http.value(forHTTPHeaderField: "Location"),
              let location = resolveLocation(rawLocation, baseURL: session.apiBaseURL) else {
            throw ShareTusError.missingLocation
        }

        let handle = try FileHandle(forReadingFrom: file)
        defer { try? handle.close() }

        var offset = 0
        var lastBody = Data()
        while offset < media.bytes {
            let chunk = try autoreleasepool { () -> Data? in
                try handle.read(upToCount: chunkSize)
            }
            guard let chunk, !chunk.isEmpty else { break }

            var request = patchRequest(location: location, offset: offset, session: session)
            request.httpBody = chunk

            let (body, response) = try await urlSession.data(for: request)
            guard let patchHTTP = response as? HTTPURLResponse,
                  patchHTTP.statusCode == 200 || patchHTTP.statusCode == 204 else {
                // Aucune reprise ici : le lot B-1 a déjà écrit la fiche, l'app
                // rejouera avec le vrai `TusUploadManager` et son checkpoint.
                throw ShareTusError.patchRefused(
                    status: (response as? HTTPURLResponse)?.statusCode ?? -1, offset: offset)
            }
            offset += chunk.count
            lastBody = body
        }

        guard let id = attachmentId(fromFinalBody: lastBody) else {
            throw ShareTusError.missingAttachmentId
        }
        return id
    }
}
```

- [ ] **Step 5: Câbler le client au bundle de tests**

Dans `apps/ios/project.yml`, target `MeeshyTests`, après `- path: MeeshyShareExtension/SharePendingShare.swift` :

```yaml
      # Lot B-2 : client TUS de l'extension. LISTÉ ICI EXPRÈS — « le dépôt a
      # déjà vécu des suites vertes par omission » (spec, § Tests et gates).
      - path: MeeshyShareExtension/ShareTusClient.swift
```

- [ ] **Step 6: Vérifier le succès**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/ShareTusClientTests \
  -only-testing:MeeshyTests/ShareLimitsTests -derivedDataPath apps/ios/Build
```

Attendu : `ShareTusClientTests` (16 tests) et `ShareLimitsTests` PASSENT.

- [ ] **Step 7: Commit**

```bash
git add apps/ios/MeeshyShareExtension/ShareTusClient.swift \
        apps/ios/MeeshyShareExtension/ShareLimits.swift \
        apps/ios/MeeshyTests/Unit/Share/ShareTusClientTests.swift \
        apps/ios/MeeshyTests/Unit/Share/ShareLimitsTests.swift \
        apps/ios/project.yml apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -- apps/ios/MeeshyShareExtension/ShareTusClient.swift \
               apps/ios/MeeshyShareExtension/ShareLimits.swift \
               apps/ios/MeeshyTests/Unit/Share/ShareTusClientTests.swift \
               apps/ios/MeeshyTests/Unit/Share/ShareLimitsTests.swift \
               apps/ios/project.yml apps/ios/Meeshy.xcodeproj/project.pbxproj \
  -m "feat(ios): l'extension sait televerser un petit fichier elle-meme"
```

---

## Task 13: Upload opportuniste sous seuil dans le chemin d'envoi

**Files:**
- Modify: `apps/ios/MeeshyShareExtension/ShareSender.swift`
- Test: `apps/ios/MeeshyTests/Unit/Share/ShareSenderFanoutTests.swift`

**Interfaces:**
- Consumes: `ShareTusClient.upload(file:media:session:urlSession:)`, `ShareLimits.isOpportunisticUploadEligible(totalBytes:fileCount:)` (Task 12) ; `SharePendingShare.commit(in:)`, `ShareSender.body(for:targetIndex:)`, `.send(share:session:urlSession:directory:)` (Tasks 3 et 6).
- Produces:

```swift
nonisolated extension ShareSender {
    static func uploadIfEligible(
        share: SharePendingShare,
        session: ShareSession,
        mediaRoot: URL?,
        urlSession: URLSession
    ) async -> SharePendingShare

    static func send(
        share: SharePendingShare,
        session: ShareSession,
        urlSession: URLSession = .shared,
        directory: URL? = SharePendingShare.directoryURL(),
        mediaRoot: URL? = ShareMediaStaging.mediaRootURL()
    ) async -> SharePendingShare
}
```

- [ ] **Step 1: Écrire les tests rouges**

Ajouter à `apps/ios/MeeshyTests/Unit/Share/ShareSenderFanoutTests.swift` :

```swift
    // MARK: - Lot B-2 : upload opportuniste

    private func makeMediaRoot(bytes: Int, shareId: String = "cid_abc") throws -> URL {
        let root = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("share-optimistic-\(UUID().uuidString)", isDirectory: true)
        let shareDir = root.appendingPathComponent(shareId, isDirectory: true)
        try FileManager.default.createDirectory(at: shareDir, withIntermediateDirectories: true)
        try Data(repeating: 7, count: bytes).write(to: shareDir.appendingPathComponent("0.jpg"))
        return root
    }

    /// Le chemin complet : TUS create → PATCH → un POST par cible.
    /// `ShareStubURLProtocol` gagne au Step 1 un `locationHeader`, de sorte
    /// que la réponse 201 de création porte bien son en-tête `Location` —
    /// sans quoi le client lèverait `.missingLocation` avant le premier PATCH.
    func test_send_underTheThreshold_uploadsThenPostsEveryTarget() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot(bytes: 1024)
        ShareStubURLProtocol.locationHeader = "https://gate.meeshy.me/api/v1/uploads/abc"
        ShareStubURLProtocol.responses = [
            (201, Data()),                                          // TUS create
            (200, Data("""
            {"success":true,"data":{"attachment":{"id":"att1"}}}
            """.utf8)),                                             // TUS patch final
            (200, successBody(id: "srv1")),                          // cible 1
            (200, successBody(id: "srv2")),                          // cible 2
            (200, successBody(id: "srv3"))                           // cible 3
        ]

        let result = await ShareSender.send(
            share: makeShare(media: [photo], conversationIds: ["conv1", "conv2", "conv3"]),
            session: makeSession(), urlSession: makeStubbedSession(),
            directory: dir, mediaRoot: mediaRoot)

        XCTAssertEqual(result.uploadedAttachmentIds, ["att1"])
        XCTAssertTrue(result.isFullyServed)
        XCTAssertFalse(FileManager.default.fileExists(
            atPath: dir.appendingPathComponent("cid_abc.json").path))
    }

    /// L'invariant produit tient aussi sur ce chemin : la première cible porte
    /// les ids, les suivantes copient.
    func test_send_underTheThreshold_followingTargetsCopyFromTheOrigin() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot(bytes: 1024)
        ShareStubURLProtocol.locationHeader = "https://gate.meeshy.me/api/v1/uploads/abc"
        ShareStubURLProtocol.responses = [
            (201, Data()),
            (200, Data("{\"success\":true,\"data\":{\"attachment\":{\"id\":\"att1\"}}}".utf8)),
            (200, successBody(id: "srv1")),
            (200, successBody(id: "srv2"))
        ]

        _ = await ShareSender.send(
            share: makeShare(media: [photo], conversationIds: ["conv1", "conv2"]),
            session: makeSession(), urlSession: makeStubbedSession(),
            directory: dir, mediaRoot: mediaRoot)

        // Les deux derniers corps capturés sont les POST de message.
        let messages = ShareStubURLProtocol.capturedBodies.suffix(2)
        let first = try decodeBody(messages.first ?? Data())
        let second = try decodeBody(messages.last ?? Data())

        XCTAssertEqual(first["attachmentIds"] as? [String], ["att1"])
        XCTAssertNil(first["copyAttachmentsFromMessageId"])
        XCTAssertEqual(second["copyAttachmentsFromMessageId"] as? String, "srv1")
        XCTAssertNil(second["attachmentIds"],
                     "réutiliser les ids les DÉPLACERAIT — le premier destinataire les perdrait")
        XCTAssertNil(second["forwardedFromId"],
                     "aucun destinataire ne doit voir « Transféré depuis … »")
    }

    /// Invariant 1 de la fiche : `uploadedAttachmentIds` est écrit AVANT le
    /// premier POST. Une extension tuée entre les deux ne re-téléverserait pas
    /// les octets — les orphelins ne sont balayés qu'à H+24.
    func test_send_persistsUploadedAttachmentIds_beforePostingAnyTarget() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot(bytes: 1024)
        ShareStubURLProtocol.locationHeader = "https://gate.meeshy.me/api/v1/uploads/abc"
        ShareStubURLProtocol.responses = [
            (201, Data()),
            (200, Data("{\"success\":true,\"data\":{\"attachment\":{\"id\":\"att1\"}}}".utf8)),
            (503, Data()), (503, Data()), (503, Data())
        ]

        _ = await ShareSender.send(
            share: makeShare(media: [photo]), session: makeSession(),
            urlSession: makeStubbedSession(), directory: dir, mediaRoot: mediaRoot)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let reread = try decoder.decode(
            SharePendingShare.self,
            from: try Data(contentsOf: dir.appendingPathComponent("cid_abc.json")))
        XCTAssertEqual(reread.uploadedAttachmentIds, ["att1"])
    }

    /// Au-dessus du seuil : RIEN n'est tenté. Une feuille qui meurt au milieu
    /// d'un upload de 400 Mo laisse un orphelin pour 24 h, sans rien accélérer.
    func test_send_aboveTheThreshold_uploadsNothing() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot(bytes: 64)
        let heavy = ShareStagedMedia(
            relPath: "cid_abc/0.jpg", ext: "jpg", mime: "image/jpeg",
            bytes: ShareLimits.opportunisticUploadBudgetBytes + 1)

        let result = await ShareSender.send(
            share: makeShare(media: [heavy]), session: makeSession(),
            urlSession: makeStubbedSession(), directory: dir, mediaRoot: mediaRoot)

        XCTAssertTrue(ShareStubURLProtocol.capturedBodies.isEmpty)
        XCTAssertNil(result.uploadedAttachmentIds)
        XCTAssertEqual(result.targets.map(\.state), [.pending, .pending, .pending])
    }

    /// Un upload en échec ne perd RIEN : la fiche reste, l'app reprend. C'est
    /// ce qui rend ce lot annulable sans perte de fonction.
    func test_send_whenTheUploadFails_fallsBackToTheDeferredPath() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot(bytes: 1024)
        ShareStubURLProtocol.responses = [(500, Data())]

        let result = await ShareSender.send(
            share: makeShare(media: [photo]), session: makeSession(),
            urlSession: makeStubbedSession(), directory: dir, mediaRoot: mediaRoot)

        XCTAssertNil(result.uploadedAttachmentIds)
        XCTAssertEqual(ShareSender.outcome(of: result), .deferred)
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: dir.appendingPathComponent("cid_abc.json").path))
        XCTAssertTrue(
            FileManager.default.fileExists(
                atPath: mediaRoot.appendingPathComponent("cid_abc/0.jpg").path),
            "les octets restent : l'app les rejouera"
        )
    }

    /// Un upload PARTIEL (2 fichiers, 1 seul abouti) ne doit pas produire un
    /// message amputé : soit tout est prêt, soit rien ne part.
    func test_send_whenOnlySomeFilesUpload_defersEverything() async throws {
        let dir = try makeDirectory()
        let mediaRoot = try makeMediaRoot(bytes: 1024)
        try Data(repeating: 8, count: 512).write(
            to: mediaRoot.appendingPathComponent("cid_abc/1.png"))
        let second = ShareStagedMedia(
            relPath: "cid_abc/1.png", ext: "png", mime: "image/png", bytes: 512)
        ShareStubURLProtocol.locationHeader = "https://gate.meeshy.me/api/v1/uploads/abc"
        ShareStubURLProtocol.responses = [
            (201, Data()),
            (200, Data("{\"success\":true,\"data\":{\"attachment\":{\"id\":\"att1\"}}}".utf8)),
            (500, Data())
        ]

        let result = await ShareSender.send(
            share: makeShare(media: [photo, second]), session: makeSession(),
            urlSession: makeStubbedSession(), directory: dir, mediaRoot: mediaRoot)

        XCTAssertNil(result.uploadedAttachmentIds,
                     "un jeu de pièces jointes INCOMPLET n'est pas un upload réussi")
        XCTAssertEqual(result.targets.map(\.state), [.pending, .pending, .pending])
    }
```

Étendre `ShareStubURLProtocol` (défini au début du fichier) d'un en-tête `Location` :

```swift
    nonisolated(unsafe) static var locationHeader: String?
```

et, dans `startLoading()`, remplacer la construction de `headerFields` par :

```swift
        var fields = ["Content-Type": "application/json"]
        if let location = Self.locationHeader { fields["Location"] = location }
        let response = HTTPURLResponse(
            url: request.url ?? URL(string: "https://stub.meeshy.test")!,
            statusCode: next.status, httpVersion: nil, headerFields: fields
        )!
```

en ajoutant `locationHeader = nil` à `reset()`.

- [ ] **Step 2: Vérifier l'échec**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
```

Attendu : exit 65, `error: extra argument 'mediaRoot' in call`.

- [ ] **Step 3: Brancher l'upload opportuniste**

Dans `apps/ios/MeeshyShareExtension/ShareSender.swift`, ajouter à l'extension :

```swift
    /// Téléverse les octets DEPUIS l'extension, mais seulement si le partage
    /// est assez petit pour que ça aboutisse avant la fermeture de la feuille.
    ///
    /// **Tout ou rien.** Un jeu de pièces jointes incomplet n'est pas un
    /// upload réussi : envoyer un message amputé serait pire que de différer.
    /// En cas d'échec, la fiche est inchangée et l'app rejouera avec le vrai
    /// `TusUploadManager` du SDK, qui a checkpoint et reprise.
    static func uploadIfEligible(
        share: SharePendingShare,
        session: ShareSession,
        mediaRoot: URL?,
        urlSession: URLSession
    ) async -> SharePendingShare {
        guard share.uploadedAttachmentIds == nil, !share.media.isEmpty,
              let mediaRoot else { return share }

        let total = share.media.reduce(0) { $0 + $1.bytes }
        guard ShareLimits.isOpportunisticUploadEligible(
            totalBytes: total, fileCount: share.media.count
        ) else { return share }

        var ids: [String] = []
        for descriptor in share.media {
            do {
                ids.append(try await ShareTusClient.upload(
                    file: mediaRoot.appendingPathComponent(descriptor.relPath),
                    media: descriptor, session: session, urlSession: urlSession))
            } catch {
                ShareLog.logger.error(
                    "Upload opportuniste abandonné (\(error.localizedDescription, privacy: .public)) — reprise par l'app")
                return share
            }
        }

        var updated = share
        updated.uploadedAttachmentIds = ids
        return updated
    }
```

et remplacer le début de `send(share:session:urlSession:directory:)` par :

```swift
    static func send(
        share: SharePendingShare,
        session: ShareSession,
        urlSession: URLSession = .shared,
        directory: URL? = SharePendingShare.directoryURL(),
        mediaRoot: URL? = ShareMediaStaging.mediaRootURL()
    ) async -> SharePendingShare {
        var current = share
        commit(current, in: directory)

        // Lot B-2 — les petits partages partent avant la fermeture de la
        // feuille. Les ids sont COMMITÉS avant le premier POST : une extension
        // tuée entre les deux ne re-téléverserait pas les octets (les
        // attachments orphelins ne sont balayés qu'à H+24).
        current = await uploadIfEligible(
            share: current, session: session, mediaRoot: mediaRoot, urlSession: urlSession)
        commit(current, in: directory)

        for index in current.targets.indices where current.targets[index].state != .sent {
            // … le corps de la boucle est inchangé …
```

- [ ] **Step 4: Vérifier le succès**

```bash
cd apps/ios && xcodegen generate && cd -
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/ShareSenderFanoutTests \
  -only-testing:MeeshyTests/ShareTusClientTests -derivedDataPath apps/ios/Build
```

Attendu : les deux classes PASSENT (21 + 16 tests).

- [ ] **Step 5: Gate complet du lot B-2**

```bash
./apps/ios/meeshy.sh test
```

Attendu : phases 0 à 3 vertes.

- [ ] **Step 6: Commit**

```bash
git add apps/ios/MeeshyShareExtension/ShareSender.swift \
        apps/ios/MeeshyTests/Unit/Share/ShareSenderFanoutTests.swift
git commit -- apps/ios/MeeshyShareExtension/ShareSender.swift \
               apps/ios/MeeshyTests/Unit/Share/ShareSenderFanoutTests.swift \
  -m "perf(ios): un petit partage est deja parti quand la feuille se referme"
```

---

## Self-Review

### 1. Couverture de la spec

| Exigence de la spec (`2026-08-19-forward-reach-and-share-media-design.md`) | Tâche |
|---|---|
| **B.1** — `…SupportsImageWithMaxCount` = 20 | Task 1 |
| **B.1** — `…SupportsMovieWithMaxCount` = 20 | Task 1 |
| **B.1** — `…SupportsFileWithMaxCount` = 20 (la clé que l'ancien garde ne vérifiait PAS) | Task 1 |
| **B.1** — `…AttachmentsWithMin/MaxCount` NON déclarées | Task 1 (assertion d'absence) |
| **B.1** — justification 20 fichiers / 10 cibles (seau plateforme, seau message) | Task 2 (`ShareLimits` + `ShareLimitsTests`) |
| **B.1** — garde d'`Info.plist` réécrite, 3 clés | Task 1, Step 1 |
| **B.1** — rien à ajouter côté serveur pour les types | Aucune tâche (constat de la spec, pas un travail) |
| **B.2** — copie DANS la closure de `loadFileRepresentation`, synchrone | Task 6, Step 5 |
| **B.2** — flux par tranches de 64 Kio, jamais `Data(contentsOf:)` | Task 2 (`streamCopy`) + garde de source `test_extension_neverReadsAWholeFileIntoMemory` |
| **B.2** — `startAccessingSecurityScopedResource` / `stop…` appairés | Task 6, Step 5 + garde `test_extension_pairsTheSecurityScopedAccess` |
| **B.2** — média iCloud non téléchargé ⇒ échec EXPLICITE, jamais un fichier vide | Task 2 (`isNotDownloaded`, `.notDownloadedFromICloud`) + Task 6 (`share.media.unavailable`) |
| **B.2** — contrôle d'espace libre avant copie | Task 2 (`requiredFreeBytes`, `.insufficientFreeSpace`) |
| **B.2** — refus au-delà du plafond d'octets par partage | Task 2 (`fitsByteBudget`) + Task 6 (`.byteBudgetExceeded`) |
| **B.2** — aucune dépendance SDK, plafond 120 Mo | Global Constraints + Task 5 (`ForwardPickerModelPortabilityGuardTests`) |
| **B.3** — fiche v:1 `{ v, clientMessageId, createdAt, content, media[], uploadedAttachmentIds, targets[], originTargetIndex }` | Task 3 |
| **B.3** — invariant 1 : réécrite atomiquement à chaque transition | Task 3 (`commit(in:)`, `.atomic`) + Tasks 6, 9, 13 (commit à chaque transition) |
| **B.3** — invariant 2 : supprimée seulement quand toutes les cibles sont `sent` | Task 3 (`isFullyServed` dans `commit`) + Task 4 (miroir app) |
| **B.3** — les DEUX miroirs (extension + app) | Tasks 3 et 4 |
| **B.3** — mise à jour de `SharePendingSendContractTests` | Task 4, Step 1 (réécriture complète, états par cible compris) |
| **B.3** — purge par âge des fiches et dossiers | Task 11 |
| **B.4** — `enqueueMedia` rejoint `OfflineMessageQueueing` | Task 8 |
| **B.4** — `enqueueMedia` gagne `createdAt` | Task 8 |
| **B.4** — enfilage PAR CIBLE, `clientMessageId` dérivé | Task 9 (+ dérivation partagée Tasks 3 et 4) |
| **B.4** — dossier média partagé, supprimé par le DERNIER consommateur | Task 8 (`deletesSourceFiles`) + Task 9 |
| **B.4** — première cible = upload, suivantes = `copyAttachmentsFromMessageId` | Tasks 9 et 10 |
| **B.4** — **jamais `forwardedFromId`** | Tasks 6, 9, 10 (trois niveaux d'assertion) |
| **B.5** — cibles issues de l'App Group, sans réseau ni recherche serveur | Aucun changement : `ShareConversationStore.liveTargets()` est conservé tel quel (Task 6) |
| **B.5** — la limite est ÉCRITE dans l'écran | Task 6 (`share.sendToMany` = « Envoyer à (10 max) ») |
| **B.6** — E2EE non-objectif | Aucune tâche : ce plan n'introduit aucun chemin chiffré et n'en supprime aucun |
| **Lot 5 (ordre de livraison)** — « livre la fonction complète » | Tasks 1 à 11, gate à la Task 11 Step 7 |
| **Lot 6** — upload opportuniste sous seuil, annulable sans perte | Tasks 12 et 13 |
| **Découplage préalable de `ForwardPickerModel`** — `finishSend(_:succeeded:reason:)`, 1 appelant prod + 6 sites de test | Task 5 |
| **Découplage** — garde de source « n'importe que `Foundation` » | Task 5 (`ForwardPickerModelPortabilityGuardTests`) |
| **Tests et gates** — garde d'`Info.plist` (3 clés) | Task 1 |
| **Tests et gates** — contrat des deux miroirs, états par cible compris | Task 4 |
| **Tests et gates** — reprise après interruption à CHAQUE transition (après copie, après upload, après la première cible) | Task 9 (`…afterCopyOnly…`, `…withUploadedAttachmentIds…`, `…afterTheFirstTarget…`) |
| **Tests et gates** — purge par âge | Task 11 |
| **Tests et gates** — le client TUS listé dans les `sources:` de `MeeshyTests` | Task 12, Step 5 (avec la raison écrite dans le YAML) |
| **Tests et gates** — `./apps/ios/meeshy.sh test` | Task 11 Step 7 (lot B-1) et Task 13 Step 5 (lot B-2) |
| **Décision user** — aucun destinataire ne voit de marque de transfert | Section « INVARIANT PRODUIT » + Tasks 6, 9, 10 |

**Non couvert, et pourquoi :**

- **S.3 / mode serveur « copier ces pièces jointes »** — hors périmètre déclaré : livré par `docs/superpowers/plans/2026-08-19-forward-reach.md` Task 5. Ce plan déclare la dépendance, le contrat attendu, et les deux seuls points qui changeraient si le nom du champ diffère.
- **Volets A, C, S.1, S.2** — autres lots du même chantier, autres plans.
- **Reprise TUS avec checkpoint dans l'extension** — non-objectif explicite de la spec ; Task 12 le documente dans le code (`aucune reprise, aucun checkpoint`).
- **Durcissement de l'allowlist MIME serveur** — non-objectif explicite.
- **Contrôle de propriété d'`associateAttachmentsToMessage`** — non-objectif explicite (dette antérieure) ; la garde de propriété du NOUVEAU mode appartient au plan jumeau.

**Risques acceptés de la spec, honorés sans être « corrigés » :** partage volumineux différé à la prochaine ouverture (Tasks 11 et 13 l'assument explicitement) ; rate limiting plateforme contenu par les plafonds de la Task 2, pas supprimé.

### 2. Scan des placeholders

Aucun « TBD », « TODO », « à définir », « similaire à la tâche N », ni « ajouter la gestion d'erreur appropriée ». Trois points relevés et corrigés inline pendant cette relecture :

1. **Le seuil du lot B-2 était nommé sans être chiffré** dans la première rédaction. Fixé explicitement : **8 Mio au total ET 4 fichiers au plus**, avec sa justification (une tranche TUS par fichier, pic mémoire sous 120 Mo, 2–4 s sur LTE), dans le tableau « Décisions figées » ET dans `ShareLimits`.
2. **`ShareMediaStaging.directoryURL(shareId:)` mentait sur son retour** — il crée le sous-dossier du partage mais renvoie la RACINE. Renommé `prepareMediaRoot(shareId:)`, avec la raison écrite dans son commentaire ; le site d'appel de la Task 6 suit.
3. **`current.targets.indices.sorted { lhs, _ in lhs == origin }` (Task 9)** n'est pas un ordre faible strict — `sorted` n'en garantit alors aucun résultat. Remplacé par `[origin] + indices.filter { $0 != origin }`.

Deux références externes restent volontairement non spécifiées ici, et sont marquées comme telles : le champ serveur (plan jumeau) et les volets A/C/S.

### 3. Cohérence des types entre tâches

| Symbole | Produit par | Consommé par | Vérifié |
|---|---|---|---|
| `ShareStagedMedia(relPath:ext:mime:bytes:)` | Task 2 | Tasks 3 (`typealias Media`), 6, 12, 13 | ✅ mêmes étiquettes partout |
| `ShareLimits.canSelectMore(selectedCount:isAlreadySelected:)` | Task 2 | Task 6 | ✅ |
| `ShareLimits.isOpportunisticUploadEligible(totalBytes:fileCount:)` | Task 12 | Task 13 | ✅ |
| `ShareMediaStaging.stage(source:into:shareId:index:mime:freeBytes:)` | Task 2 | Task 6 | ✅ six arguments, même ordre |
| `ShareMediaStaging.prepareMediaRoot(shareId:)` | Task 2 | Task 6 | ✅ après correctif n° 2 |
| `ShareMediaStaging.mediaRootURL()` | Task 2 | Task 13 (défaut de `send`) | ✅ |
| `SharePendingShare.make(shareId:createdAt:content:media:conversationIds:)` | Task 3 | Tasks 4, 6, 13 | ✅ |
| `SharePendingShare.derivedClientMessageId(shareId:targetIndex:)` | Task 3 | Tasks 4 (miroir), 6, 9 | ✅ contrat testé égal entre les deux miroirs (Task 4) |
| `SharePendingShare.commit(in:)` | Task 3 | Task 6 | ✅ |
| `SharePendingSendConsumer.commit(_:in:)` | Task 4 | Tasks 9, 11, et les fixtures de test | ✅ statique côté app (la classe est `@MainActor`), méthode d'instance côté extension — délibéré, documenté |
| `SharePendingSendConsumer.decodeRelay(_:)` | Task 4 | Tasks 9, 11 | ✅ |
| `SharePendingSendConsumer.PendingShare/PendingTarget/PendingMedia` | Task 4 | Tasks 9, 11 (fixtures et assertions) | ✅ inits mémoire, `@testable import Meeshy` |
| `ShareSendBody(clientMessageId:content:attachmentIds:copyAttachmentsFromMessageId:)` | Task 6 | Task 13 (assertions JSON) | ✅ aucun champ de transfert, par construction |
| `ShareSender.send(share:session:urlSession:directory:)` | Task 6 | Task 13 (gagne `mediaRoot:` en dernier, avec défaut) | ✅ les appels de la Task 6 restent valides |
| `ShareSender.outcome(statusCode:error:)` | existant (`ShareSender.swift:87-91`) | Task 6 | ✅ réutilisé, non redéfini |
| `ForwardPickerModel.finishSend(_:succeeded:reason:)` | Task 5 | Task 6 (écran de l'extension), `ForwardPickerSheet:330` | ✅ |
| `ForwardOutcome.succeeded` / `.failureReason` | Task 5 | `ForwardPickerSheet:330` | ✅ app-side uniquement, jamais nommé par le modèle |
| `OfflineQueueItem.copyAttachmentsFromClientMessageId` | Task 7 | Tasks 8, 9, 10 | ✅ identifiant **local** partout — jamais confondu avec l'identifiant serveur |
| `SendMessageRequest.copyAttachmentsFromMessageId` | Task 7 | Task 10 | ✅ identifiant **serveur**, produit par `ShareFanoutOriginResolver` |
| `enqueueMedia(sourceMediaURLs:kinds:conversationId:content:clientMessageId:originalLanguage:replyToId:forwardedFromId:forwardedFromConversationId:copyAttachmentsFromClientMessageId:deletesSourceFiles:createdAt:)` | Task 8 | Task 9, `FakeOfflineMessageQueue` | ✅ 12 paramètres, tous dans l'EXIGENCE de protocole (un paramètre concret-seul serait jeté avant le mock) |
| `ShareFanoutOriginResolver.Resolution` | Task 10 | `OutboxDispatcher` | ✅ |
| `ShareTusClient.upload(file:media:session:urlSession:)` | Task 12 | Task 13 | ✅ |

**Deux noms proches, délibérément distincts — et c'est le point de vigilance n° 1 pour l'implémenteur :**
`copyAttachmentsFrom**ClientMessageId**` (identifiant **local**, porté par la fiche et la ligne d'outbox) et `copyAttachmentsFrom**MessageId**` (identifiant **serveur**, porté par le corps REST). `ShareFanoutOriginResolver` est le SEUL endroit qui traduit l'un en l'autre. Les confondre enverrait un `cid_…_t0` là où le serveur attend un ObjectId de 24 caractères hexadécimaux — refusé par Prisma, donc visible tout de suite, mais sur le mauvais chemin.

**Un stub par fichier de tests, délibérément :** `ShareStubURLProtocol` (`ShareSenderFanoutTests.swift`) et `TusStubURLProtocol` (`ShareTusClientTests.swift`) sont tous deux `private` à leur fichier. Les factoriser créerait une dépendance d'ordre entre deux classes de tests qui s'exécutent en parallèle sur des `nonisolated(unsafe) static var`.
