import Foundation
import UIKit
import MeeshySDK
import MeeshyUI

// **La sauvegarde automatique du MEUBLE** (#8848).
//
// L'atelier du SDK (`StoryComposerView`) s'autosauvegardait dans
// `StoryDraftStore` depuis E1 : débounce de 2,5 s, écriture au passage en
// arrière-plan, reprise à l'ouverture. Le 2026-09-01 (a7136904dc, 7d51e2bbc1,
// #4700/#4751), story, réel et post ont quitté l'atelier pour se composer dans
// le meuble (`ComposerDocumentSurface`) — et le meuble n'a jamais reçu de
// sauvegarde. Les seules ouvertures restées sur l'atelier (`.resume`,
// `.videoCameraReady`) gardaient la leur ; toutes les autres perdaient la
// création au premier kill.
//
// Le meuble tient ce que `StoryDraftStore` ne sait pas porter : le FORMAT, le
// texte du document, les huit porteurs du média (clés par URL), le lieu, les
// personnes nommées. D'où un instantané propre, rangé par compte et par
// environnement, et jamais listé dans « Mes stories ».

/// Le compte ET l'environnement sous lesquels un brouillon est rangé.
/// Un brouillon n'est jamais servi hors du couple qui l'a écrit.
nonisolated struct ComposerAutosaveAccount: Hashable, Sendable {
    let directoryName: String

    init?(userId: String?, serverOrigin: String?) {
        guard let key = MessageStoreAccountKey(userId: userId, serverOrigin: serverOrigin) else { return nil }
        directoryName = key.fingerprint
    }
}

/// Le tiroir du brouillon sous un compte. Le meuble n'en tient qu'un, la
/// CRÉATION : l'édition d'une story se compose dans l'atelier, dont le brouillon
/// porte `editingPostId` dans `StoryDraftStore` (`ComposerEditDraftResumption`).
nonisolated struct ComposerAutosaveSlot: Hashable, Sendable {
    let directoryName: String

    static let creation = ComposerAutosaveSlot(directoryName: "creation")
}

/// Un nom de fichier STABLE par source : un même fichier, d'une sauvegarde à la
/// suivante, n'est copié qu'une fois. FNV-1a et non `hashValue`, dont la graine
/// change à chaque lancement.
nonisolated enum ComposerAutosaveFileName {
    static let sourcePrefix = "f-"

    /// Le dossier des copies de session d'un brouillon restauré.
    static let sessionDirectoryName = "meeshy_composer_autosave_session"

    static func forSource(_ url: URL) -> String {
        // Une copie de session garde le nom qu'elle avait dans le brouillon :
        // la resauvegarder ne recopie rien.
        if url.lastPathComponent.hasPrefix(sourcePrefix),
           url.pathComponents.contains(sessionDirectoryName) {
            return url.lastPathComponent
        }
        let ext = url.pathExtension.isEmpty ? "bin" : url.pathExtension.lowercased()
        return sourcePrefix + fnv1a(url.standardizedFileURL.path) + "." + ext
    }

    static func forBitmap(key: String, family: String) -> String {
        "\(family)-" + fnv1a(key) + ".jpg"
    }

    static func forBlob(key: String) -> String {
        "s-" + fnv1a(key) + ".bin"
    }

    static func fnv1a(_ text: String) -> String {
        let hash = text.utf8.reduce(UInt64(0xcbf2_9ce4_8422_2325)) { acc, byte in
            (acc ^ UInt64(byte)) &* 0x0000_0100_0000_01b3
        }
        return String(hash, radix: 16)
    }
}

/// L'instantané écrit sur disque. Toute URL y devient un NOM de fichier du
/// dossier du brouillon : une URL de `tmp/` ne survit pas à la purge de l'OS.
nonisolated struct ComposerAutosaveSnapshot: Codable, Sendable {

    static let currentVersion = 1

    struct Media: Codable, Equatable, Sendable {
        let file: String
        let mimeType: String
        let durationMs: Int?
    }

    struct Reference: Codable, Equatable, Sendable {
        let username: String
        let userId: String?
        let display: PostReferenceDisplay
        let publicationKey: String?
    }

    var version: Int = currentVersion
    var savedAt: Date
    var format: String
    var text: String
    var background: String?
    var visibility: String
    var visibilityUserIds: [String]
    var language: String
    var location: SharedPlace?
    var references: [Reference]
    var editingPostId: String?
    var slides: [StorySlide]
    var currentSlideIndex: Int
    var localMedia: [Media]
    var roleByFile: [String: String]
    var slideIdByFile: [String: String]
    var objectIdByFile: [String: String]
    var captionByFile: [String: String]
    var altsByObjectId: [String: String]
    var transcriptionByFile: [String: MobileTranscriptionPayload]
    var railPosedFiles: [String]
    var images: [String: String]
    var slideImages: [String: String]
    var videos: [String: String]
    var audios: [String: String]
    var stickerAnimations: [String: String]
}

/// Ce que le meuble tient au moment de la capture — des VALEURS, lues sur le
/// fil principal, remises telles quelles à l'écriture hors du fil.
nonisolated struct ComposerAutosaveState: @unchecked Sendable {
    var format: ComposerFormat
    var text: String
    var background: String?
    var visibility: String
    var visibilityUserIds: [String]
    var language: String
    var location: SharedPlace?
    var references: [ComposerReference]
    var editingPostId: String?
    var slides: [StorySlide]
    var currentSlideIndex: Int
    var porters: ComposerMediaPorters
    var images: [String: UIImage]
    var slideImages: [String: UIImage]
    var videos: [String: URL]
    var audios: [String: URL]
    var stickerAnimations: [String: Data]
    /// Les fichiers locaux des objets déjà PRÉ-MONTÉS (`postMediaId` → fichier).
    var adoptedLocalMedia: [String: URL] = [:]

    /// Un fond de palette seul n'est pas une création : le composer en pose un
    /// au hasard à la naissance, et le sauvegarder ferait naître un brouillon
    /// fantôme à chaque ouverture.
    var hasContent: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !porters.localMedia.isEmpty
            || location != nil
            || !images.isEmpty || !slideImages.isEmpty
            || !videos.isEmpty || !audios.isEmpty
            || slides.contains { !$0.sceneObjects.isEmpty || !($0.content ?? "").isEmpty }
    }
}

/// Ce qu'une sauvegarde remet au magasin : l'instantané, et les matières à
/// recopier dans le dossier du brouillon, déjà nommées.
nonisolated struct ComposerAutosaveWrite: @unchecked Sendable {
    let snapshot: ComposerAutosaveSnapshot
    let files: [String: URL]
    let bitmaps: [String: UIImage]
    let blobs: [String: Data]

    var referencedFiles: Set<String> {
        Set(files.keys).union(bitmaps.keys).union(blobs.keys)
    }
}

/// Ce qu'une restauration rend : l'instantané et ses matières, déjà recopiées
/// hors du dossier du brouillon — publier efface le brouillon, et l'envoi qui
/// lit encore ses fichiers ne doit pas les perdre sous lui.
nonisolated struct ComposerAutosaveRestored: @unchecked Sendable {
    let snapshot: ComposerAutosaveSnapshot
    let urlByFile: [String: URL]
    let bitmapByFile: [String: UIImage]
    let blobByFile: [String: Data]
}

nonisolated enum ComposerAutosaveFormatCode {
    static func code(_ format: ComposerFormat) -> String {
        switch format {
        case .story: return "story"
        case .post: return "post"
        case .reel: return "reel"
        case .status: return "status"
        }
    }

    static func format(_ code: String) -> ComposerFormat? {
        switch code {
        case "story": return .story
        case "post": return .post
        case "reel": return .reel
        case "status": return .status
        default: return nil
        }
    }
}
