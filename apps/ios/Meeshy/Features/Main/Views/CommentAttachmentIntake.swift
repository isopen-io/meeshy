import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

// **CE QUI ENTRE DANS LA ZONE D'UN COMMENTAIRE** (#9736, #9697).
//
// Trois hôtes (feuille du fil et des réels, détail d'un post, story) posaient
// leurs pièces chacun à sa façon : l'un ajoutait, l'autre remplaçait, aucun ne
// plafonnait, et tous n'envoyaient que la première. Une seule entrée
// désormais : ce qui n'est pas un média de commentaire est refusé à la pose,
// le plafond est celui du serveur, et une pièce apparaît AVANT que son fichier
// soit lu.

// ============================================================================
// MARK: - CommentAttachmentLimit
// ============================================================================

/// Le plafond de la zone, sans état. Générique : il ne lit rien des pièces.
nonisolated enum CommentAttachmentLimit {

    nonisolated struct Outcome<Piece> {
        /// La zone après la pose.
        let staged: [Piece]
        /// Ce qui est entré.
        let accepted: [Piece]
        /// Ce qui a quitté la zone pour laisser la place (zone à une pièce).
        let evicted: [Piece]
        /// Ce qui n'est pas entré, faute de place.
        let refused: [Piece]
    }

    /// Une zone à UNE pièce la remplace par la dernière venue ; une zone à
    /// plusieurs se remplit dans l'ordre, puis refuse.
    static func admitting<Piece>(_ incoming: [Piece], into staged: [Piece], limit: Int) -> Outcome<Piece> {
        guard !incoming.isEmpty else {
            return Outcome(staged: staged, accepted: [], evicted: [], refused: [])
        }
        guard limit > 1 else {
            let last = Array(incoming.suffix(1))
            return Outcome(staged: last, accepted: last, evicted: staged, refused: Array(incoming.dropLast()))
        }
        let room = max(0, limit - staged.count)
        let accepted = Array(incoming.prefix(room))
        return Outcome(staged: staged + accepted, accepted: accepted, evicted: [],
                       refused: Array(incoming.dropFirst(room)))
    }
}

// ============================================================================
// MARK: - CommentLibraryLink
// ============================================================================

/// Le lien grille ↔ zone d'un composeur de commentaire (#9697) — la même
/// carte `pièce → asset` que le message (`ConversationComposerState`), lue par
/// la même règle (`RecentMediaAttachmentLink`).
nonisolated struct CommentLibraryLink: Equatable {
    private(set) var links: [String: String] = [:]
    /// Les assets JOINTS que le sélecteur système a reçus cochés à son
    /// ouverture : ceux qui n'en reviennent pas ont été décochés.
    var pickerPreselection: [String] = []

    func attachedAssetIds(liveAttachmentIds: [String]) -> [String] {
        RecentMediaAttachmentLink.attachedAssetIds(links: links, liveAttachmentIds: liveAttachmentIds)
    }

    mutating func link(_ assetId: String, to attachmentId: String, liveAttachmentIds: [String]) {
        links = RecentMediaAttachmentLink.linking(assetId, to: attachmentId, in: links,
                                                  liveAttachmentIds: liveAttachmentIds)
    }

    /// Les pièces que le sélecteur vient de décocher.
    func deselected(returned: [String?], liveAttachmentIds: [String]) -> [String] {
        RecentMediaAttachmentLink.deselectedAttachmentIds(
            links: links, liveAttachmentIds: liveAttachmentIds,
            preselected: pickerPreselection, returned: returned)
    }
}

// ============================================================================
// MARK: - CommentAttachmentIntake
// ============================================================================

enum CommentAttachmentIntake {

    /// La pièce telle qu'un commentaire la porte — `nil` quand il ne peut pas
    /// la porter. Un fichier importé qui EST un média prend son type : un
    /// `.m4a` choisi dans Fichiers part comme un son, plus comme un document
    /// que l'envoi abandonnait sans le dire.
    static func normalized(_ attachment: ComposerAttachment) -> ComposerAttachment? {
        switch attachment.type {
        case .image, .video, .voice:
            return attachment
        case .location:
            return nil
        case .file:
            guard let url = attachment.url, let type = mediaType(of: url) else { return nil }
            return ComposerAttachment(id: attachment.id, type: type, name: attachment.name, url: url,
                                      size: attachment.size, duration: attachment.duration,
                                      thumbnailColor: attachment.thumbnailColor)
        }
    }

    static func mediaType(of url: URL) -> ComposerAttachmentType? {
        guard let type = UTType(filenameExtension: url.pathExtension) else { return nil }
        if type.conforms(to: .image) { return .image }
        if type.conforms(to: .audio) { return .voice }
        if type.conforms(to: .movie) || type.conforms(to: .video) { return .video }
        return nil
    }

    /// Une pièce posée dont le fichier n'est pas encore lu.
    static func isLoading(_ attachment: ComposerAttachment) -> Bool {
        attachment.url == nil
    }

    /// Ce qui reste dans la zone après un envoi : les pièces encore en
    /// lecture attendent le commentaire suivant plutôt que de se perdre.
    static func stillLoading(_ staged: [ComposerAttachment]) -> [ComposerAttachment] {
        staged.filter(isLoading)
    }

    /// La zone une fois le fichier d'une pièce lu — `nil` quand la pièce l'a
    /// quittée entre-temps (retirée, envoyée) : le fichier est alors orphelin.
    static func filling(_ staged: [ComposerAttachment], id: String, url: URL, size: Int?) -> [ComposerAttachment]? {
        guard let index = staged.firstIndex(where: { $0.id == id }) else { return nil }
        var piece = staged[index]
        piece.url = url
        piece.size = size
        var zone = staged
        zone[index] = piece
        return zone
    }

    /// Verse des pièces dans la zone et rend celles qui y sont entrées. Ce qui
    /// n'entre pas perd son fichier temporaire.
    @discardableResult
    static func admit(_ incoming: [ComposerAttachment], into staged: inout [ComposerAttachment],
                      limit: Int = MAX_POST_MEDIA) -> [ComposerAttachment] {
        let candidates = incoming.map { (source: $0, media: normalized($0)) }
        let foreign = candidates.filter { $0.media == nil }.map { $0.source }
        let outcome = CommentAttachmentLimit.admitting(candidates.compactMap { $0.media }, into: staged, limit: limit)
        discard(foreign + outcome.evicted + outcome.refused)
        if !foreign.isEmpty { ComposerIngestFeedback.showFailure(names: foreign.map(\.name)) }
        if !outcome.refused.isEmpty { HapticFeedback.warning() }
        guard !outcome.accepted.isEmpty else { return [] }
        let zone = outcome.staged
        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) { staged = zone }
        return outcome.accepted
    }

    /// Retire des pièces de la zone, fichiers compris.
    static func remove(ids: [String], from staged: inout [ComposerAttachment]) {
        let gone = Set(ids)
        guard !gone.isEmpty else { return }
        discard(staged.filter { gone.contains($0.id) })
        let zone = staged.filter { !gone.contains($0.id) }
        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) { staged = zone }
    }

    // MARK: - Photothèque

    /// Les éléments du sélecteur système entrent AUSSITÔT dans la zone, en
    /// lecture ; chacun se remplit quand son fichier est écrit. `linked`
    /// reçoit, à la pose, l'asset et la pièce de chaque élément identifié.
    static func stage(_ items: [PhotosPickerItem], into attachments: Binding<[ComposerAttachment]>,
                      limit: Int = MAX_POST_MEDIA, linked: (_ assetId: String, _ attachmentId: String) -> Void = { _, _ in }) {
        let pairs = items.map { (item: $0, piece: placeholder(isVideo: isVideo($0))) }
        let admitted = Set(admit(pairs.map { $0.piece }, into: &attachments.wrappedValue, limit: limit).map(\.id))
        let kept = pairs.filter { admitted.contains($0.piece.id) }
        for pair in kept {
            if let assetId = pair.item.itemIdentifier { linked(assetId, pair.piece.id) }
        }
        Task { @MainActor in
            for pair in kept {
                let isVideo = pair.piece.type == .video
                let data = try? await pair.item.loadTransferable(type: Data.self)
                fill(pair.piece.id, with: await write(data, isVideo: isVideo), in: attachments)
            }
        }
    }

    /// Un média de la grille entre dans la zone avec son identifiant (#9697).
    /// Rend la pièce posée, ou `nil` quand la zone l'a refusée.
    @discardableResult
    static func stage(_ asset: RecentMediaAsset, into attachments: Binding<[ComposerAttachment]>,
                      limit: Int = MAX_POST_MEDIA) -> ComposerAttachment? {
        switch asset.payload {
        case .video(let url):
            var piece = placeholder(isVideo: true)
            piece.url = url
            return admit([piece], into: &attachments.wrappedValue, limit: limit).first
        case .imageData(let data):
            guard let piece = admit([placeholder(isVideo: false)], into: &attachments.wrappedValue, limit: limit).first else {
                return nil
            }
            Task { @MainActor in
                fill(piece.id, with: await write(data, isVideo: false), in: attachments)
            }
            return piece
        }
    }

    /// La prise du viseur rejoint la zone (#9736) : une vidéo par son fichier,
    /// une photo dès la prise, son fichier écrit ensuite.
    static func stage(capture: CameraResult, into attachments: Binding<[ComposerAttachment]>,
                      limit: Int = MAX_POST_MEDIA) {
        switch ComposerReturnedMedia(capture: capture) {
        case .video(let url):
            var piece = placeholder(isVideo: true)
            piece.url = url
            admit([piece], into: &attachments.wrappedValue, limit: limit)
        case .image(let image):
            guard let data = image.jpegData(compressionQuality: 0.9),
                  let piece = admit([placeholder(isVideo: false)], into: &attachments.wrappedValue, limit: limit).first else {
                return
            }
            Task { @MainActor in
                fill(piece.id, with: await write(data, isVideo: false), in: attachments)
            }
        }
    }

    static func placeholder(isVideo: Bool) -> ComposerAttachment {
        isVideo
            ? ComposerAttachment(id: "video-\(UUID().uuidString)", type: .video,
                                 name: MediaKindLabel.name(.video), thumbnailColor: MeeshyColors.tileCoralHex)
            : ComposerAttachment.image()
    }

    private static func isVideo(_ item: PhotosPickerItem) -> Bool {
        item.supportedContentTypes.contains { $0.conforms(to: .movie) }
    }

    /// Écrit les octets d'un média dans un fichier temporaire, hors du fil
    /// principal. L'extension d'une image se lit dans ses OCTETS (#4925).
    private static func write(_ data: Data?, isVideo: Bool) async -> (url: URL, size: Int)? {
        guard let data else { return nil }
        let ext = isVideo ? "mov" : await CommentComposerStaging.imageFileExtension(for: data)
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("comment_\(UUID().uuidString).\(ext)")
        let written = await Task.detached(priority: .userInitiated) {
            (try? data.write(to: url)) != nil
        }.value
        return written ? (url, data.count) : nil
    }

    private static func fill(_ id: String, with file: (url: URL, size: Int)?,
                             in attachments: Binding<[ComposerAttachment]>) {
        guard let file else {
            CommentSendTrace.log("préparation : échec d'écriture, pièce retirée")
            remove(ids: [id], from: &attachments.wrappedValue)
            return
        }
        guard let zone = filling(attachments.wrappedValue, id: id, url: file.url, size: file.size) else {
            CommentSendTrace.log("préparation : la pièce a quitté la zone, fichier jeté")
            try? FileManager.default.removeItem(at: file.url)
            return
        }
        attachments.wrappedValue = zone
        CommentSendTrace.log("préparation : pièce prête (\(file.size) octets)")
    }

    private static func discard(_ pieces: [ComposerAttachment]) {
        for url in pieces.compactMap(\.url) {
            try? FileManager.default.removeItem(at: url)
        }
    }
}

// ============================================================================
// MARK: - CommentSendGate
// ============================================================================

/// **Envoyer, ou garder** (#9743) — décidé AVANT de toucher au composeur.
/// Jamais « vider puis abandonner » : tant qu'une pièce de la zone n'a pas
/// son fichier, rien ne part et rien ne se vide.
enum CommentSendGate {
    enum Decision: Equatable {
        /// Tout est prêt : le commentaire part avec ces pièces.
        case send(pieceIds: [String])
        /// Une pièce se prépare encore : le composeur reste intact.
        case keepWhilePreparing(loading: Int)
        /// Rien à envoyer.
        case nothing
    }

    static func decide(text: String, zone: [ComposerAttachment], hasPlace: Bool) -> Decision {
        let loading = zone.filter { $0.url == nil }
        if !loading.isEmpty { return .keepWhilePreparing(loading: loading.count) }
        let hasText = !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        guard hasText || !zone.isEmpty || hasPlace else { return .nothing }
        return .send(pieceIds: zone.map(\.id))
    }
}

// ============================================================================
// MARK: - CommentAttachmentThumbnail
// ============================================================================

/// La vignette d'une pièce de commentaire, lue dans son fichier local.
enum CommentAttachmentThumbnail {
    static let maxPixelSize: CGFloat = 200

    static func load(type: ComposerAttachmentType, url: URL?) async -> UIImage? {
        guard let url else { return nil }
        switch type {
        case .image:
            return await SOTAImageThumbnail.thumbnailAsync(from: url, maxPixelSize: maxPixelSize)
        case .video:
            return await AttachmentPreparationService.generateVideoThumbnail(url: url)
        case .voice, .file, .location:
            return nil
        }
    }
}
