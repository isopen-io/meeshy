import Foundation
import SwiftUI
import UIKit
import UniformTypeIdentifiers
import PhotosUI
import MeeshySDK
import os

/// Média unique en attente d'envoi avec un commentaire. Porte le fichier local +
/// les métadonnées nécessaires à l'upload TUS et un `FeedMedia` optimiste pour
/// l'affichage inline immédiat (avant confirmation serveur).
///
/// Un commentaire ne porte QU'UN SEUL média (cf. backend `commentId` FK sur PostMedia).
struct PendingCommentMedia: Identifiable, Sendable {
    let id: String
    let fileURL: URL
    let mimeType: String
    let thumbHash: String?
    /// Transcription Whisper produite côté mobile pour un média audio (skip
    /// re-transcription serveur). Nil pour image/vidéo.
    let mobileTranscription: MobileTranscriptionPayload?
    /// Représentation optimiste affichée inline tant que l'upload n'est pas confirmé.
    let optimistic: FeedMedia

    init(id: String = UUID().uuidString,
         fileURL: URL,
         mimeType: String,
         thumbHash: String? = nil,
         mobileTranscription: MobileTranscriptionPayload? = nil,
         optimistic: FeedMedia) {
        self.id = id
        self.fileURL = fileURL
        self.mimeType = mimeType
        self.thumbHash = thumbHash
        self.mobileTranscription = mobileTranscription
        self.optimistic = optimistic
    }
}

/// Les fichiers locaux d'un commentaire en cours d'envoi.
///
/// **Le téléversement et la création vivent dans `CommentPublisher`** — le seul
/// chemin réseau d'un commentaire, qui lie chaque requête au compte de
/// l'auteur (#9743). Le fichier local SURVIT au téléversement : il n'est
/// retiré qu'une fois le commentaire créé, sinon un échec de création ne
/// laisserait rien à confier à la file.
enum CommentMediaUploader {
    /// Le commentaire est créé : ses fichiers locaux ne servent plus.
    static func discardLocalFiles(_ medias: [PendingCommentMedia]) {
        for media in medias { try? FileManager.default.removeItem(at: media.fileURL) }
    }
}

/// Les traces de recette du chemin d'envoi d'un commentaire (Debug) :
/// `xcrun simctl spawn booted log stream --predicate 'eventMessage CONTAINS "CommentSend"'`.
enum CommentSendTrace {
    static func log(_ message: @autoclosure () -> String) {
        #if DEBUG
        NSLog("[CommentSend] %@", message())
        #endif
    }
}

/// **Un commentaire que l'envoi direct n'a pas pu poser rejoint la file AVEC
/// ses pièces** (#9743) — site unique des trois hôtes de commentaire.
enum CommentMediaDelivery {

    /// La cause réelle d'un envoi direct qui a échoué.
    static func cause(of error: Error) -> Error {
        (error as? CommentPublisher.Interrupted)?.underlying ?? error
    }

    /// **Un refus que la file ne ferait que répéter** : la limite du jour, ou
    /// un refus permanent du serveur (contenu invalide, accès refusé,
    /// publication disparue). Le confier à la file ne sert à rien — le
    /// commentaire revient au composeur, avec sa raison.
    static func isPermanentRefusal(_ error: Error) -> Bool {
        let cause = cause(of: error)
        if DailyGestureLimit.from(cause) != nil { return true }
        switch cause {
        case MeeshyError.forbidden, MeeshyError.rejected: return true
        case MeeshyError.server(let status, _): return [400, 403, 404, 413, 422].contains(status)
        default: return false
        }
    }

    /// Ce que la tentative directe avait déjà monté quand elle s'est arrêtée.
    static func acquired(from error: Error) -> [UploadedCommentMedia] {
        (error as? CommentPublisher.Interrupted)?.acquired ?? []
    }

    /// **Le compte courant est-il encore l'auteur ?** L'enfilement arrive après
    /// des attentes réseau ; si le compte a changé entre-temps, la ligne ne
    /// s'écrit pas dans la file du suivant. Rend le compte vérifié.
    static func confirmAuthor(_ payload: CreateCommentPayload) throws -> String {
        guard let current = CommentPublisher.currentAccountId(),
              CommentOwnership.owns(payload, currentUserId: current) else {
            throw CommentOwnership.Refusal.notTheAuthor
        }
        return current
    }

    /// Confie le commentaire à la file. Sans pièce, c'est l'enfilement
    /// ordinaire ; avec, les fichiers sont copiés dans un dossier durable et
    /// la ligne les rejoue. Refusé si le compte courant n'est pas l'auteur
    /// déclaré par la charge.
    static func entrust(_ payload: CreateCommentPayload, medias: [PendingCommentMedia],
                        acquired: [UploadedCommentMedia]) async throws {
        // Lu UNE fois : c'est ce compte-là qui possède la ligne ET le dossier
        // de ses pièces. La file revérifie à l'écriture et au rejeu.
        let owner: String
        do {
            owner = try confirmAuthor(payload)
        } catch {
            CommentSendTrace.log("file : refus — le compte du jeton n'est pas l'auteur (jeton lisible : \(CommentPublisher.currentAccountId() != nil))")
            throw error
        }
        CommentSendTrace.log("file : enfilement décidé, pièces=\(medias.count), acquises=\(acquired.count)")
        guard !medias.isEmpty else {
            do {
                try await OfflineQueue.shared.enqueueComment(payload, ownerId: owner)
                CommentSendTrace.log("file : accepté (texte)")
            } catch {
                CommentSendTrace.log("file : refusé — \(String(describing: error))")
                throw error
            }
            return
        }
        do {
            try await OfflineQueue.shared.enqueueCommentMedia(
                payload,
                sourceMediaURLs: medias.map(\.fileURL),
                sourceMediaMimeTypes: medias.map(\.mimeType),
                acquired: acquired,
                ownerId: owner
            )
            CommentSendTrace.log("file : accepté avec \(medias.count) pièce(s)")
        } catch {
            CommentSendTrace.log("file : refusé — \(String(describing: error))")
            throw error
        }
        // Les fichiers d'origine restent : la ligne optimiste les affiche
        // encore. La file tient SA copie, durable.
    }
}

/// Helpers partagés de staging d'un média de commentaire — utilisés par TOUTES les
/// surfaces de composer commentaire (feed/reels `CommentsSheetView`, `PostDetailView`,
/// composer stories) pour garantir un comportement identique (image/vidéo/audio ;
/// voix réelle ; `MAX_POST_MEDIA` pièces au plus, le plafond du serveur).
enum CommentComposerStaging {
    /// Construit un `PendingCommentMedia` depuis une pièce jointe stagée par le
    /// composer. Renvoie nil pour les types hors périmètre (file/location) ou sans
    /// fichier local. L'`optimistic` pointe sur le fichier local pour l'affichage
    /// inline immédiat. Le mimeType est dérivé de l'extension (fallback par type).
    static func pendingMedia(from attachment: ComposerAttachment) -> PendingCommentMedia? {
        guard let url = attachment.url else { return nil }
        let feedType: FeedMediaType
        let fallbackMime: String
        switch attachment.type {
        case .image: feedType = .image; fallbackMime = "image/jpeg"
        case .video: feedType = .video; fallbackMime = "video/mp4"
        case .voice: feedType = .audio; fallbackMime = "audio/mp4"
        case .file, .location: return nil
        }
        let mimeType = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? fallbackMime
        let optimistic = FeedMedia(
            type: feedType,
            url: url.absoluteString,
            thumbnailColor: attachment.thumbnailColor,
            duration: attachment.duration.map { Int($0) },
            fileName: attachment.name
        )
        return PendingCommentMedia(
            fileURL: url, mimeType: mimeType, mobileTranscription: nil, optimistic: optimistic
        )
    }

    /// Les médias exploitables d'une zone, dans son ordre, plafonnés à ce que
    /// le serveur accepte sur un commentaire (`attachmentIds`, `MAX_POST_MEDIA`,
    /// #9736). La zone en montrait plusieurs et l'envoi n'en prenait qu'un.
    static func pendingMedia(in attachments: [ComposerAttachment], limit: Int = MAX_POST_MEDIA) -> [PendingCommentMedia] {
        Array(attachments.compactMap { pendingMedia(from: $0) }.prefix(max(0, limit)))
    }

    /// Premier média exploitable d'une zone — pour l'hôte qui n'en porte
    /// qu'un (la réponse à une story).
    static func firstPendingMedia(in attachments: [ComposerAttachment]) -> PendingCommentMedia? {
        attachments.lazy.compactMap { pendingMedia(from: $0) }.first
    }

    /// La pièce de zone qui correspond à un média en partance — pour la rendre
    /// au composeur quand l'envoi n'a pas pu être gardé.
    static func attachment(from media: PendingCommentMedia) -> ComposerAttachment {
        let type: ComposerAttachmentType
        switch media.optimistic.type {
        case .video: type = .video
        case .audio: type = .voice
        case .image, .document: type = .image
        }
        return ComposerAttachment(id: media.id, type: type, name: media.optimistic.fileName ?? media.fileURL.lastPathComponent,
                                  url: media.fileURL, thumbnailColor: media.optimistic.thumbnailColor)
    }

    /// Pièce jointe voix portant un VRAI fichier audio (issu d'`AudioRecorderManager`).
    static func voiceAttachment(duration: TimeInterval, url: URL) -> ComposerAttachment {
        var voice = ComposerAttachment.voice(duration: duration)
        voice.url = url
        return voice
    }

    /// **L'extension d'une image, lue dans ses OCTETS** (#4925).
    ///
    /// `loadTransferable(type: Data.self)` rend le fichier ORIGINAL de la
    /// photothèque — un GIF y arrive intact. L'écrire sous un nom `.jpg` (ce que
    /// faisait cette fonction) est une perte de données qui ne ressemble pas à
    /// une perte de données : le `mimeType` se dérive ensuite de l'extension
    /// (`pendingMedia`), et tout l'aval, jusqu'au serveur, ré-encode un GIF
    /// parfaitement valide en JPEG. Mesuré : 6 448 o de GIF animé arrivés en
    /// 4 404 o de JPEG fixe.
    ///
    /// La table de signatures n'est pas réécrite ici : `MediaCompressor` la
    /// tient déjà, et c'est elle qui décide plus tard de laisser passer un GIF.
    /// Deux tables divergeraient au premier format ajouté.
    ///
    /// **Seuls les trois formats que le dépôt a DÉJÀ décidé de laisser passer**
    /// gardent leur extension. `MediaCompressor.compressImageData` rend un GIF et
    /// un WebP tels quels, et une PNG en PNG ; il transcode en revanche le HEIC
    /// délibérément (« most web clients cannot decode HEIC inline »). Nommer un
    /// HEIC `.heic` ici irait donc CONTRE une décision existante, en servant au
    /// web un format qu'il ne rend pas.
    ///
    /// Tout le reste — JPEG compris — reste `jpg`, le comportement d'hier : ce
    /// lot ouvre un chemin, il ne change pas le cas nominal.
    static func imageFileExtension(for data: Data) async -> String {
        switch await MediaCompressor.shared.imageMimeType(of: data) {
        case "image/gif":  return "gif"
        case "image/png":  return "png"
        case "image/webp": return "webp"
        default:           return "jpg"
        }
    }

    /// URLs de fichiers importés → `ComposerAttachment[]` (copie sécurisée en temp).
    static func fileAttachments(from urls: [URL]) -> [ComposerAttachment] {
        var result: [ComposerAttachment] = []
        for url in urls {
            let didAccess = url.startAccessingSecurityScopedResource()
            defer { if didAccess { url.stopAccessingSecurityScopedResource() } }
            let dest = FileManager.default.temporaryDirectory
                .appendingPathComponent("comment_\(UUID().uuidString)_\(url.lastPathComponent)")
            try? FileManager.default.copyItem(at: url, to: dest)
            let size = (try? FileManager.default.attributesOfItem(atPath: dest.path))?[.size] as? Int
            result.append(ComposerAttachment.file(url: dest, name: url.lastPathComponent, size: size))
        }
        return result
    }
}

// MARK: - Ingestion dépôt / collage (rappel `onIngest` d'UniversalComposerBar)

/// Câblage commun du rappel `onIngest` pour les trois surfaces de commentaire /
/// réponse à une story (`PostDetailView`, `FeedCommentsSheet`,
/// `StoryComposerBarView`) : les `.text` d'un dépôt sont fusionnés en UNE seule
/// insertion, les `.file` sont routés par `ComposerIngestRouter` vers les
/// pipelines EXISTANTS de ces surfaces. Réutilisation délibérée (spec
/// 2026-07-30, lot 1) : toute nouvelle voie d'ingestion contournerait la
/// compression, l'affichage optimiste et le nettoyage des temporaires.
enum CommentComposerIngestion {

    private static let log = Logger(subsystem: "me.meeshy.app", category: "comment-ingest")

    /// Fusionne les `.text` d'un dépôt en un seul bloc — concaténés par un saut
    /// de ligne, dans l'ordre du dépôt — pour UNE insertion : N insertions
    /// successives feraient N fois le tour de l'analyseur de langue et de la
    /// détection de collage. Fonction pure, testable sans simulateur.
    nonisolated static func mergedText(from ingests: [ComposerIngest]) -> String? {
        let texts = ingests.compactMap { ingest -> String? in
            if case .text(let value) = ingest { return value }
            return nil
        }
        return texts.isEmpty ? nil : texts.joined(separator: "\n")
    }

    /// Les `.file` d'un dépôt, dans l'ordre. Fonction pure.
    nonisolated static func files(from ingests: [ComposerIngest]) -> [(url: URL, name: String, mime: String)] {
        ingests.compactMap { ingest -> (url: URL, name: String, mime: String)? in
            if case .file(let url, let name, let mime) = ingest { return (url, name, mime) }
            return nil
        }
    }

    /// Insère `block` à la position du curseur quand le champ du composer est
    /// premier répondant : l'insertion UIKit emprunte le même chemin qu'une
    /// frappe clavier, donc resynchronise le binding SwiftUI et ses
    /// observateurs en une seule passe. Renvoie `false` quand aucun champ
    /// texte n'a le focus — l'appelant ajoute alors le bloc à la fin.
    static func insertAtCursor(_ block: String) -> Bool {
        guard let field = firstResponderTextInput() else { return false }
        field.insertText(block)
        return true
    }

    /// Route et stage les fichiers d'un dépôt dans les pièces jointes de la
    /// surface. `append` reçoit chaque lot dès qu'il est prêt : image et vidéo
    /// passent par la compression d'`AttachmentPreparationService` ; audio et
    /// fichier générique par `CommentComposerStaging.fileAttachments` —
    /// EXACTEMENT le code de l'importateur de documents de ces surfaces. Les
    /// fichiers sources nous appartiennent (contrat `onIngest`) : consommés ou
    /// supprimés ici. Un échec produit un toast nommant le fichier — jamais de
    /// tuile fantôme.
    static func stageFiles(_ files: [(url: URL, name: String, mime: String)],
                           accentColor: String,
                           append: @escaping ([ComposerAttachment]) -> Void) {
        guard !files.isEmpty else { return }
        Task {
            var failedNames: [String] = []
            for file in files {
                switch ComposerIngestRouter.route(mime: file.mime) {
                case .image:
                    if let staged = await stageImage(file, accentColor: accentColor) {
                        append([staged])
                    } else {
                        failedNames.append(file.name)
                    }
                case .video:
                    if let staged = await stageVideo(file, accentColor: accentColor) {
                        append([staged])
                    } else {
                        failedNames.append(file.name)
                    }
                case .audio, .file:
                    let staged = CommentComposerStaging.fileAttachments(from: [file.url])
                    // La copie de staging est faite : la source du dépôt est
                    // supprimée (propriété transférée par `onIngest`).
                    FileManager.default.removeItemLogging(
                        at: file.url, context: "source de dépôt composer (fichier)", logger: log)
                    if staged.isEmpty {
                        failedNames.append(file.name)
                    } else {
                        append(staged)
                    }
                }
            }
            if !failedNames.isEmpty {
                ComposerIngestFeedback.showFailure(names: failedNames)
            }
        }
    }

    // MARK: - Privé

    /// Image déposée → pipeline de compression partagé (tuile éditable, vignette,
    /// ThumbHash) puis pièce jointe image du staging commentaire.
    private static func stageImage(_ file: (url: URL, name: String, mime: String),
                                   accentColor: String) async -> ComposerAttachment? {
        guard let image = UIImage(contentsOfFile: file.url.path) else {
            log.error("dépôt : image illisible « \(file.name, privacy: .public) »")
            FileManager.default.removeItemLogging(
                at: file.url, context: "source de dépôt composer (image illisible)", logger: log)
            return nil
        }
        let preparing = AttachmentPreparationService.shared.prepareImage(
            image, context: .feedPost, accentColor: accentColor)
        let result = await preparing.awaitCompletion()
        // Le service écrit sa propre copie compressée : la source est consommée.
        FileManager.default.removeItemLogging(
            at: file.url, context: "source de dépôt composer (image)", logger: log)
        switch result {
        case .success(let prepared):
            return ComposerAttachment.image(url: prepared.fileURL, name: file.name)
        case .failure(let error):
            log.error("dépôt : préparation image échouée — \(String(describing: error), privacy: .public)")
            return nil
        }
    }

    /// Vidéo déposée → compression partagée (`deleteSourceAfterCompression` :
    /// la source du dépôt est consommée par le service) puis pièce jointe vidéo
    /// du staging commentaire — mêmes champs que `CommentAttachmentIntake.placeholder`.
    private static func stageVideo(_ file: (url: URL, name: String, mime: String),
                                   accentColor: String) async -> ComposerAttachment? {
        let preparing = AttachmentPreparationService.shared.prepareVideo(
            sourceURL: file.url,
            deleteSourceAfterCompression: true,
            context: .feedPost,
            accentColor: accentColor)
        switch await preparing.awaitCompletion() {
        case .success(let prepared):
            return ComposerAttachment(
                id: "video-\(UUID().uuidString)",
                type: .video,
                name: file.name,
                url: prepared.fileURL,
                size: prepared.attachment.fileSize,
                thumbnailColor: "FF6B6B")
        case .failure(let error):
            log.error("dépôt : préparation vidéo échouée — \(String(describing: error), privacy: .public)")
            return nil
        }
    }

    /// Premier répondant courant s'il est un champ texte (le champ du composer
    /// quand il a le focus).
    ///
    /// Fenêtres de la scène ACTIVE, résolue par `DeviceLayout` : parcourir
    /// `connectedScenes` ici rendrait un ensemble non ordonné, dont la
    /// première scène est régulièrement une scène d'arrière-plan sous Split
    /// View / Slide Over / Stage Manager — le texte déposé atterrirait alors
    /// dans un champ que l'utilisateur ne regarde pas.
    private static func firstResponderTextInput() -> (UIView & UITextInput)? {
        guard let scene = DeviceLayout.activeWindowScene else { return nil }
        for window in scene.windows {
            if let found = findFirstResponderTextInput(in: window) { return found }
        }
        return nil
    }

    private static func findFirstResponderTextInput(in view: UIView) -> (UIView & UITextInput)? {
        if view.isFirstResponder { return view as? (UIView & UITextInput) }
        for subview in view.subviews {
            if let found = findFirstResponderTextInput(in: subview) { return found }
        }
        return nil
    }
}
