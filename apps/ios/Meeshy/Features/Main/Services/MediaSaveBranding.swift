import Foundation
import MeeshySDK
import MeeshyUI
import os

private let brandingLog = Logger(subsystem: "me.meeshy.app", category: "media-branding")

// MARK: - Résultat

/// Ce qui sera réellement écrit sur le disque de l'utilisateur.
struct BrandedMedia: Equatable, Sendable {
    /// Fichier à enregistrer.
    let url: URL
    /// `true` quand `url` est une COPIE marquée — donc un temporaire dont
    /// l'appelant doit disposer après usage. `false` quand c'est le fichier
    /// d'origine servi tel quel (famille non marquable, ou marquage renoncé) :
    /// il appartient au cache et ne doit JAMAIS être supprimé.
    let isStamped: Bool

    static func original(_ url: URL) -> BrandedMedia { BrandedMedia(url: url, isStamped: false) }
}

// MARK: - Seam

/// Appose la marque Meeshy sur un média qui sort de l'app.
///
/// Séparé du coordinateur pour que celui-ci reste testable sans AVFoundation
/// ni photothèque — même patron que `MediaSaveSourceResolving`.
protocol MediaSaveBranding: Sendable {
    func stamp(_ file: URL, kind: AttachmentKind) async -> BrandedMedia
}

// MARK: - Règle produit

/// LA règle : un média qui quitte Meeshy porte sa marque.
///
/// - **Image** → filigrane FIXE (logo + « meeshy » + « @pseudo »), sans
///   animation — une image ne joue rien.
/// - **Vidéo** → le filigrane ANIMÉ des exports de story, gravé dans le MP4.
/// - **Audio** → la signature sonore Meeshy, posée après le contenu.
/// - **Tout le reste** (documents, archives, localisations…) → intouché : il
///   n'existe pas de marque qui n'abîmerait pas un PDF ou un ZIP.
///
/// **Un marquage qui échoue n'empêche JAMAIS un enregistrement.** Chaque
/// chemin retombe sur le fichier d'origine : l'utilisateur qui demande
/// « Enregistrer » obtient son fichier, marqué si on a su, nu sinon. C'est
/// aussi ce qui protège des cas où marquer serait pire que ne pas marquer
/// (vidéo dont l'orientation n'est pas redressée, GIF animé qu'on aplatirait,
/// vidéo trop longue pour un ré-encodage raisonnable).
///
/// Orchestration produit → app-side (SDK purity) : les atomes de rendu
/// (`MeeshyImageWatermark`, `MeeshyVideoWatermarkBaker`,
/// `MeeshyAudioSignature`) vivent dans le SDK et ne connaissent ni
/// `AuthManager`, ni les familles d'attachment.
struct MeeshyMediaSaveBranding: MediaSaveBranding {

    /// Pseudo gravé dans la marque. Injectable pour les tests ; en production
    /// c'est l'utilisateur connecté.
    private let username: @Sendable () async -> String?

    init(username: @escaping @Sendable () async -> String? = {
        await MainActor.run { AuthManager.shared.currentUser?.username }
    }) {
        self.username = username
    }

    /// Familles qui reçoivent une marque.
    static func stamps(_ kind: AttachmentKind) -> Bool {
        kind == .image || kind == .video || kind == .audio
    }

    func stamp(_ file: URL, kind: AttachmentKind) async -> BrandedMedia {
        guard Self.stamps(kind) else { return .original(file) }
        do {
            switch kind {
            case .image:
                let stamped = try await MeeshyImageWatermark.stampedCopy(
                    of: file, username: await username())
                return BrandedMedia(url: stamped, isStamped: true)
            case .video:
                let handle = await username()
                guard let watermark = await MainActor.run(
                    body: { MeeshyExportWatermark.make(username: handle) })
                else { return .original(file) }
                let stamped = try await MeeshyVideoWatermarkBaker.bake(source: file, watermark: watermark)
                return BrandedMedia(url: stamped, isStamped: true)
            case .audio:
                let stamped = try await MeeshyAudioSignature.stampedCopy(of: file)
                return BrandedMedia(url: stamped, isStamped: true)
            default:
                return .original(file)
            }
        } catch {
            // Renoncer au marquage est un chemin NORMAL, pas une panne : un GIF
            // animé, une vidéo couchée ou trop longue passent par ici et
            // s'enregistrent nus. On trace en `info` pour pouvoir le constater
            // sans faire croire à une erreur d'enregistrement.
            brandingLog.info("marque renoncée pour \(kind.rawValue, privacy: .public) — \(String(describing: error), privacy: .public)")
            return .original(file)
        }
    }
}
