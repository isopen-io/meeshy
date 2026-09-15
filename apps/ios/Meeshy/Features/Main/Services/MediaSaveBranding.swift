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

// MARK: - Origine

/// D'où vient le média qu'on s'apprête à écrire chez l'utilisateur — la SEULE
/// question que pose désormais la marque (directive porteur 2026-09-12, voir
/// `MeeshyMediaSaveBranding`).
///
/// Le TYPE du fichier ne peut plus y répondre : une image est tantôt la photo
/// qu'un correspondant a envoyée dans un fil, tantôt le rendu d'une scène que
/// Meeshy a composée. Les deux sont un `AttachmentKind.image`, et elles ne
/// doivent pas sortir de la même façon.
///
/// **L'origine se DÉCLARE, elle ne se devine pas.** Rien, dans le fichier ni
/// dans le modèle de données, ne distingue un rendu de scène d'une photo
/// attachée — mais le site qui demande l'enregistrement, lui, sait toujours sur
/// quelle surface il est. C'est pourquoi `MediaSaveRequest.origin` n'a pas de
/// valeur par défaut : le compilateur oblige chaque nouveau point d'entrée à
/// trancher, plutôt que de lui laisser hériter d'un choix en silence.
enum MediaOrigin: String, Sendable, Equatable, CaseIterable {
    /// Œuvre COMPOSÉE dans Meeshy : scène de post, scène de réel, story
    /// enregistrée ou exportée. Elle porte la marque.
    case composed
    /// Média seulement TRANSMIS : l'image, la vidéo, le vocal, le document
    /// d'une conversation. Il sort nu.
    case transmitted
}

// MARK: - Seam

/// Appose la marque Meeshy sur un média qui sort de l'app.
///
/// Séparé du coordinateur pour que celui-ci reste testable sans AVFoundation
/// ni photothèque — même patron que `MediaSaveSourceResolving`.
protocol MediaSaveBranding: Sendable {
    func stamp(_ file: URL, kind: AttachmentKind, origin: MediaOrigin) async -> BrandedMedia
}

// MARK: - Règle produit

/// LA règle : **on marque ce que Meeshy a COMPOSÉ, jamais ce que l'utilisateur
/// a seulement TRANSMIS.**
///
/// **Directive porteur du 2026-09-12 — elle SUPPLANTE la demande du
/// 2026-08-12** (« un média qui quitte Meeshy porte sa marque »), sous laquelle
/// les trois familles étaient marquées quelle que soit leur provenance :
///
/// > « On enlève la marque ! On préserve la marque uniquement pour les STORY
/// > enregistré et exporté et les SCENE de poste, réel ! Pour les images de
/// > conversation on ne met pas la marque ni sur les vidéos originaux ni sur
/// > les audios originaux ni sur les images originaux ! »
///
/// **Ce n'est pas un assouplissement de la règle de 2026-08-12, c'est un
/// arbitrage qui en change la NATURE** : le prédicat ne décide plus par le TYPE
/// du fichier, il décide par son ORIGINE (`MediaOrigin`). Le type ne disparaît
/// pas pour autant — il reste le garde-fou qui dit ce qu'on SAIT marquer sans
/// l'abîmer. Les deux questions se posent dans cet ordre : *cette œuvre a-t-elle
/// été composée chez nous ?*, puis *sait-on la marquer ?*
///
/// Ce qui sort MARQUÉ (origine `.composed`) :
/// - **Image** → filigrane FIXE (logo + « meeshy » + « @pseudo »), sans
///   animation — une image ne joue rien.
/// - **Vidéo** → le filigrane ANIMÉ des exports de story, gravé dans le MP4.
/// - **Audio** → la signature sonore Meeshy, posée après le contenu.
/// - **Tout le reste** (documents, archives, localisations…) → intouché : il
///   n'existe pas de marque qui n'abîmerait pas un PDF ou un ZIP.
///
/// Ce qui sort NU (origine `.transmitted`) : **tout**, les trois familles de
/// médias comprises. Une image, une vidéo, un vocal de conversation
/// s'enregistrent octet pour octet tels que leur auteur les a envoyés.
///
/// Conséquence heureuse, et qui explique l'absence d'un contrôle : il n'y a
/// **pas** d'entrée « Enregistrer sans la marque » à offrir. Là où rien n'est
/// marqué, un tel bouton serait inerte (loi 4).
///
/// L'export de story ne passe PAS par ici — il a sa propre chaîne
/// (`MeeshyExportWatermark` / `StoryExport…`) et la directive le préserve
/// intact.
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

    /// Le prédicat de la marque : l'origine d'abord, la famille ensuite.
    ///
    /// L'ordre n'est pas cosmétique. Un média transmis sort nu même quand on
    /// saurait parfaitement le marquer ; c'est la provenance qui refuse, pas une
    /// limite technique — et un lecteur qui inverserait les deux lignes croirait
    /// que la règle parle encore de formats.
    static func stamps(origin: MediaOrigin, kind: AttachmentKind) -> Bool {
        guard origin == .composed else { return false }
        return kind == .image || kind == .video || kind == .audio
    }

    func stamp(_ file: URL, kind: AttachmentKind, origin: MediaOrigin) async -> BrandedMedia {
        guard Self.stamps(origin: origin, kind: kind) else { return .original(file) }
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
