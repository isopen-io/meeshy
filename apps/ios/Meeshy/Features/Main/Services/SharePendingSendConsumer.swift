import Foundation
import MeeshySDK
import os

/// Verse dans l'`OfflineQueue` les partages que l'extension n'a pas pu envoyer.
///
/// L'extension de partage tourne sans SDK : elle ne peut pas atteindre l'outbox
/// GRDB. Quand un envoi échoue (hors-ligne, jeton périmé, gateway indisponible)
/// elle dépose un relais dans le conteneur App Group ; ce consommateur le
/// reprend au réveil de l'app et le confie à la vraie file, qui le rejoue.
///
/// Décalque de `NSEPendingMessageConsumer`, y compris son invariant central :
/// **la suppression du fichier suit le commit, jamais l'inverse**. Un échec
/// transitoire laisse le relais sur disque pour la tentative suivante.
@MainActor
final class SharePendingSendConsumer {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = SharePendingSendConsumer()

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
        /// Miroir EXACT de `SharePendingShare.Target.clientMessageId` : PROPRE
        /// à cette cible, écrit une seule fois par l'extension, jamais
        /// recalculé. Round 1 de revue : l'ancienne dérivation par index
        /// (`"\(shareId)_t\(index)"`) produisait un identifiant rejeté par le
        /// motif serveur — voir le miroir extension pour le détail.
        let clientMessageId: String
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

        /// Une fiche sans cible ne désigne personne à servir ; une origine qui
        /// ne pointe vers aucune cible ferait indexer `targets[origin]` hors
        /// bornes dans `consume`. Les deux sont structurellement inexploitables
        /// — au même titre qu'une version inconnue — donc rejetées au même
        /// endroit : `decodeRelay`, la frontière du format. La boucle de
        /// reprise n'a ainsi jamais à se défendre contre une fiche qu'elle ne
        /// peut pas recevoir.
        var hasAddressableTargets: Bool {
            guard !targets.isEmpty else { return false }
            guard let originTargetIndex else { return true }
            return targets.indices.contains(originTargetIndex)
        }
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

    /// Décode une fiche v:1 ; à défaut, tente l'ancien format et le PROMEUT en
    /// fiche à une cible. Une version inconnue n'est jamais devinée.
    ///
    /// La promotion RÉUTILISE `legacy.clientMessageId` tel quel comme
    /// identifiant de l'unique cible : l'ancien relais à une seule cible
    /// postait déjà cet identifiant directement (aucune dérivation par
    /// index n'existait avant ce lot), donc il est déjà conforme au motif
    /// serveur.
    nonisolated static func decodeRelay(_ data: Data) -> PendingShare? {
        if let share = try? decoder().decode(PendingShare.self, from: data) {
            guard share.v == currentVersion, share.hasAddressableTargets else { return nil }
            return share
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
                conversationId: legacy.conversationId,
                clientMessageId: legacy.clientMessageId,
                state: .pending,
                serverMessageId: nil)],
            originTargetIndex: nil
        )
    }

    /// Miroir EXACT de `SharePendingShare.commit(in:)` : écriture atomique
    /// tant qu'une cible reste à servir, suppression seulement quand toutes le
    /// sont. Les deux invariants vivent ici, et nulle part ailleurs.
    nonisolated static func commit(_ share: PendingShare, in directory: URL) throws {
        try commit(share, to: directory.appendingPathComponent(share.fileName))
    }

    /// Cœur de `commit(_:in:)`, paramétré par le fichier CIBLE plutôt que par
    /// un répertoire dont il recalculerait le nom. `consume(_:at:mediaRoot:)`
    /// s'en sert directement avec le `url` littéralement lu par `consumeAll` :
    /// recalculer `directory.appendingPathComponent(share.fileName)` à chaque
    /// réécriture de progression suppose que le nom sur disque suit toujours
    /// `share.fileName` — vrai pour tout relais écrit par l'un des deux
    /// miroirs (`commit(in:)` des DEUX côtés le garantit), mais rien ne force
    /// cette hypothèse pour un fichier lu d'ailleurs, et une reprise qui
    /// écrirait sous un autre nom laisserait DEUX fiches sur disque au
    /// prochain passage.
    nonisolated private static func commit(_ share: PendingShare, to file: URL) throws {
        guard !share.isFullyServed else {
            if FileManager.default.fileExists(atPath: file.path) {
                try FileManager.default.removeItem(at: file)
            }
            return
        }
        try FileManager.default.createDirectory(
            at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try encoder().encode(share).write(to: file, options: .atomic)
    }

    /// Round 1 de revue (Important 1) — écart minimal, en secondes, entre le
    /// `createdAt` de deux cibles CONSÉCUTIVES d'un même partage.
    ///
    /// `enqueue` posait jusqu'ici `share.createdAt` IDENTIQUE sur TOUTES les
    /// cibles, origine comprise. Or `OutboxFlusher` trie par
    /// `ORDER BY createdAt ASC` SANS départage (`OutboxFlusher.swift`) : sur
    /// une égalité stricte, l'ordre observé (origine avant copies) n'était
    /// qu'un effet de bord de l'ordre d'insertion SQLite — jamais une
    /// garantie. S'il s'inverse, chaque copie part avant son origine, tombe
    /// systématiquement dans `ShareFanoutOriginResolver.waitingForOrigin`.
    ///
    /// GRDB stocke `Date` avec une précision de la MILLISECONDE
    /// (`"yyyy-MM-dd HH:mm:ss.SSS"`, `GRDB/Core/Support/Foundation/Date.swift`)
    /// : 1 ms est le plus petit écart qui survit à cet arrondi sans jamais
    /// produire deux lignes à égalité, donc le plus petit qui rende l'ordre
    /// EXPLICITE dans la clé de tri persistée elle-même plutôt que dans un
    /// détail d'implémentation SQLite.
    private static let fanoutOrderEpsilon: TimeInterval = 0.001

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

    /// Une heure. Le dossier média EXISTE avant que la fiche ne soit écrite —
    /// `ShareViewController.extractAttachments` copie les fichiers dès
    /// `viewDidLoad`, avant même que l'utilisateur ait choisi un
    /// destinataire ; la fiche n'apparaît qu'au tap « Envoyer »
    /// (`ShareSender.send`). Tant que l'utilisateur compose son partage, le
    /// dossier est donc STRUCTURELLEMENT absent de `liveShareIds` et
    /// ressemble à un orphelin. Sans délai de grâce, n'importe quel retour de
    /// Meeshy au premier plan pendant cette fenêtre (`consumeAll` tourne à
    /// CHAQUE lancement et retour d'arrière-plan) balayait le dossier SOUS le
    /// partage en cours — silencieusement, sans jamais remonter d'erreur ; le
    /// tap « Envoyer » qui suivait écrivait alors une fiche référençant des
    /// fichiers disparus, qui échouait indéfiniment.
    ///
    /// Une heure couvre très largement la composition normale (choix d'un
    /// destinataire, l'ordre de la dizaine de secondes) ET une interruption
    /// (notification, appel entrant, détour prolongé) qui ramène
    /// l'utilisateur sur Meeshy avant qu'il ait fini. Passé ce délai, ce qui
    /// reste est un VRAI orphelin (extension tuée entre la copie et
    /// l'écriture de la fiche, feuille abandonnée) — l'attendre une heure de
    /// plus coûte au plus `ShareLimits.maxTotalBytes` (500 Mio) par partage
    /// abandonné, borné et négligeable face au risque de détruire un envoi
    /// en cours.
    nonisolated static let orphanMediaGracePeriod: TimeInterval = 3_600

    private let queue: OfflineMessageQueueing
    private let logger = Logger(subsystem: "me.meeshy.app", category: "share-consumer")

    init(queue: OfflineMessageQueueing = OfflineQueue.shared) {
        self.queue = queue
    }

    func consumeAll(
        in directory: URL? = SharePendingSendConsumer.directoryURL(),
        mediaRoot: URL? = SharePendingSendConsumer.mediaDirectoryURL(),
        now: Date = Date()
    ) async {
        var liveShareIds: Set<String> = []
        defer { sweepOrphanMediaFolders(in: mediaRoot, keeping: liveShareIds, now: now) }

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
            await consume(share, at: url, mediaRoot: mediaRoot)
        }
    }

    /// Un dossier média dont la fiche a disparu (purge de logout, crash entre
    /// les deux écritures) n'a plus aucune chance d'être consommé. Balayé à
    /// CHAQUE passage — et hors de la garde de sortie anticipée, sinon un
    /// dossier de fiches vide le rendrait immortel — mais seulement passé
    /// `orphanMediaGracePeriod` : voir sa doc pour le raisonnement complet.
    private func sweepOrphanMediaFolders(in mediaRoot: URL?, keeping liveShareIds: Set<String>, now: Date) {
        guard let mediaRoot,
              let folders = try? FileManager.default.contentsOfDirectory(
                at: mediaRoot, includingPropertiesForKeys: [.creationDateKey]) else { return }
        for folder in folders where !liveShareIds.contains(folder.lastPathComponent) {
            guard Self.isOldEnoughToSweep(folder, now: now) else { continue }
            do {
                try FileManager.default.removeItem(at: folder)
            } catch {
                logger.error(
                    "Dossier média orphelin \(folder.lastPathComponent, privacy: .public) non balayé : \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    /// La date de CRÉATION (`.creationDate`, le "birthtime" APFS) est l'ancre
    /// — posée UNE SEULE FOIS par `ShareMediaStaging.prepareMediaRoot` avant
    /// la toute première copie, et qui ne bouge plus ensuite. La date de
    /// MODIFICATION du même dossier, elle, avance à chaque fichier copié à
    /// l'intérieur (vérifié empiriquement sur APFS) : elle mesurerait « il y
    /// a combien de temps ce dossier a-t-il été touché pour la dernière
    /// fois », pas « depuis quand ce partage existe-t-il » — un mauvais
    /// signal ici, puisqu'un partage à plusieurs pièces jointes continue de
    /// s'écrire pendant toute la durée du chargement (`loadFileRepresentation`
    /// est asynchrone, potentiellement lent sur iCloud).
    ///
    /// Un dossier dont la date de création est illisible reste protégé — au
    /// même titre qu'une fiche datée du futur (`isExpired`), l'incertitude ne
    /// se résout jamais en faveur de la destruction.
    nonisolated private static func isOldEnoughToSweep(_ folder: URL, now: Date) -> Bool {
        guard let createdAt = (try? folder.resourceValues(forKeys: [.creationDateKey]))?.creationDate else {
            return false
        }
        return now.timeIntervalSince(createdAt) > orphanMediaGracePeriod
    }

    private func discardMedia(shareId: String, in mediaRoot: URL?) {
        guard let mediaRoot else { return }
        try? FileManager.default.removeItem(
            at: mediaRoot.appendingPathComponent(shareId, isDirectory: true))
    }

    /// Une fiche décrit N cibles, mais l'enfilage est fait PAR CIBLE.
    ///
    /// L'ORIGINE d'abord : c'est elle qui porte les octets, et les suivantes
    /// copieront ses pièces jointes. Chaque cible servie est marquée et la
    /// fiche RÉÉCRITE — une interruption au milieu ne rejoue que ce qui reste.
    /// Le dossier média n'est rendu que lorsque la dernière cible est servie.
    ///
    /// `at url:` — le fichier littéralement lu par `consumeAll`, PAS un
    /// chemin recalculé depuis `share.fileName` : voir la doc de
    /// `commit(_:to:)`.
    private func consume(
        _ share: PendingShare,
        at url: URL,
        mediaRoot: URL?
    ) async {
        var current = share
        let origin = current.originTargetIndex ?? 0

        // L'ORIGINE d'abord, explicitement — pas par un tri : un prédicat
        // `{ lhs, _ in lhs == origin }` n'est pas un ordre faible strict, et
        // `sorted` n'en garantit alors AUCUN résultat.
        let order = [origin] + current.targets.indices.filter { $0 != origin }
        for (position, index) in order.enumerated() where current.targets[index].state != .sent {
            // Round 1 de revue (Important 1) — `position` vient de `order`,
            // qui place TOUJOURS l'origine en position 0 : même une reprise
            // partielle (certaines cibles déjà `.sent`) recalcule le MÊME
            // `order` à partir du MÊME `origin`, donc la même cible reçoit
            // toujours le même écart d'un appel à l'autre.
            let rowCreatedAt = share.createdAt.addingTimeInterval(
                Self.fanoutOrderEpsilon * TimeInterval(position))
            do {
                try await enqueue(
                    current, targetIndex: index, origin: origin, mediaRoot: mediaRoot,
                    createdAt: rowCreatedAt)
                current.targets[index].state = .sent
                do {
                    try Self.commit(current, to: url)
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
    ///
    /// Les identifiants (`clientMessageId`) sont LUS depuis la fiche —
    /// `target.clientMessageId` et `share.targets[origin].clientMessageId` —
    /// jamais recalculés : ils ont été générés une seule fois par l'extension
    /// (`SharePendingShare.make()`) et persistés. Une ancienne dérivation par
    /// index produisait un identifiant suffixé rejeté par le motif serveur
    /// (voir la doc de `PendingTarget.clientMessageId`).
    ///
    /// **Pont origine-déjà-servie (défaut bloquant corrigé) :** quand
    /// l'origine a été envoyée par l'EXTENSION (celle-ci poste en REST sans
    /// jamais écrire de ligne locale), `OutboxDispatcher.resolveServerId`
    /// n'a AUCUN `PendingIdRecord` à lire pour `originClientMessageId` — ce
    /// registre n'est alimenté QUE par `applyEvent(.serverAck)`, appelé
    /// uniquement quand l'app elle-même a envoyé le message. Une traduction
    /// cid → id serveur demandée dans ce cas ne peut donc JAMAIS aboutir : la
    /// ligne se reporte jusqu'à épuiser son budget, et les cibles 2..N ne
    /// partent jamais. La fiche porte pourtant déjà la réponse —
    /// `target.serverMessageId`, écrit par l'extension au moment où elle sert
    /// la cible (`ShareSender.send`) — donc quand il est présent, on le
    /// transmet DIRECTEMENT via `copyAttachmentsFromServerMessageId`, sans
    /// demander cette traduction impossible. Quand l'origine est partie par
    /// l'app, `target.serverMessageId` reste `nil` (l'app ne l'y écrit
    /// jamais) et le chemin existant — résolution via `PendingIdRecord` —
    /// reste intact.
    private func enqueue(
        _ share: PendingShare,
        targetIndex: Int,
        origin: Int,
        mediaRoot: URL?,
        createdAt: Date
    ) async throws {
        let target = share.targets[targetIndex]
        let clientMessageId = target.clientMessageId
        let originTarget = share.targets[origin]
        let originClientMessageId = originTarget.clientMessageId

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
                createdAt: createdAt
            )
            return
        }

        let needsCopy = !isOrigin && !share.media.isEmpty
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
            copyAttachmentsFromClientMessageId: needsCopy ? originClientMessageId : nil,
            copyAttachmentsFromServerMessageId: needsCopy ? originTarget.serverMessageId : nil,
            createdAt: createdAt
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

    private func remove(_ url: URL, reason: String) {
        do {
            try FileManager.default.removeItem(at: url)
        } catch {
            logger.error(
                "Suppression du relais (\(reason, privacy: .public)) échouée : \(error.localizedDescription, privacy: .public)"
            )
        }
    }
}
