#if DEBUG
import AVFoundation
import Foundation
import MeeshySDK
import UIKit

/// La publication d'un réel, en vitrine (#9820) : le composeur publie par son chemin réel — un réel part par le canal
/// DOCUMENT (#4869) : file durable (`enqueuePostMedia`), puis `OutboxDispatcher.dispatchCreatePost` —, et seules les deux
/// bouches réseau de ce chemin sont remplacées : le téléversement (`VitrineTus`, derrière le VRAI `TusUploadManager`) et
/// `POST /posts` (`creerSiInstallee`). La vitrine pousse ensuite `post:created`, comme la vraie passerelle : le fil
/// l'accueille par son propre abonnement.
@MainActor
enum VitrineReel {
    /// La création du post : le temps que la passerelle met à répondre, la publication se voit monter.
    static let montee: Duration = .milliseconds(900)

    private(set) static var lecteur: MeeshyUser?
    private(set) static var sessionDeTeleversement: URLSession?
    private static var delai: Duration = montee

    static func installer(lecteur: MeeshyUser, montee: Duration = VitrineReel.montee) {
        self.lecteur = lecteur
        delai = montee
        sessionDeTeleversement = VitrineTus.session()
    }

    static func retirer() {
        lecteur = nil
        sessionDeTeleversement = nil
    }

    /// Ce que `dispatchCreatePost` appelle à la place de `POST /posts` : le post servi quand la vitrine est installée,
    /// `nil` sinon — la requête de production part alors, inchangée.
    static func creerSiInstallee(_ corps: CreatePostBody, televerses: [VitrineTeleverse]) async throws -> APIPost? {
        guard let lecteur else { return nil }
        try? await Task.sleep(for: delai)
        var servis: [VitrineTeleverse] = []
        for piece in televerses.map(copieEnCache) {
            servis.append(await avecSonAffiche(piece))
        }
        let post = try VitrinePostServi.post(corps, auteur: lecteur, televerses: servis)
        SocialSocketManager.shared.postCreated.send(SocketPostCreatedData(post: post, clientMutationId: nil))
        VitrineRendu.shared.signaler(.reelPublie)
        return post
    }
}

extension VitrineReel {
    /// Face à l'hôte mort, une adresse relative ne se résout pas (`MeeshyConfig.resolveMediaURL` refuse 127.0.0.1) : le
    /// lecteur chercherait la vidéo sur la passerelle. La pièce est servie à la COPIE que le téléverseur a rangée dans le
    /// cache sous son adresse — ce que le lecteur jouerait sur un cache chaud.
    nonisolated static func copieEnCache(_ piece: VitrineTeleverse) -> VitrineTeleverse {
        let copie = piece.mimeType.hasPrefix("video/") ? CacheCoordinator.videoLocalFileURL(for: piece.url)
            : piece.mimeType.hasPrefix("image/") ? CacheCoordinator.imageLocalFileURL(for: piece.url)
            : piece.mimeType.hasPrefix("audio/") ? CacheCoordinator.audioLocalFileURL(for: piece.url) : nil
        guard let copie else { return piece }
        return VitrineTeleverse(id: piece.id, url: copie.absoluteString, mimeType: piece.mimeType)
    }

    /// La passerelle tire l'affiche d'une vidéo, ses dimensions et sa durée : sans elles, la carte du réel au fil peint sa
    /// couleur d'attente en chatoiement, faute d'image à montrer avant la première frame (prise du 2026-10-09).
    nonisolated static func avecSonAffiche(_ piece: VitrineTeleverse) async -> VitrineTeleverse {
        guard piece.mimeType.hasPrefix("video/"), let video = URL(string: piece.url), video.isFileURL,
              let affiche = await VitrineAffiche.tirer(de: video) else { return piece }
        return VitrineTeleverse(id: piece.id, url: piece.url, mimeType: piece.mimeType, affiche: affiche)
    }
}

/// L'affiche d'une vidéo téléversée, comme la passerelle la sert : une image JPEG, les dimensions, la durée.
nonisolated struct VitrineAffiche: Equatable, Sendable {
    let url: String
    let largeur: Int
    let hauteur: Int
    let dureeS: Int

    static func tirer(de video: URL, dossier: URL = FileManager.default.temporaryDirectory) async -> VitrineAffiche? {
        let asset = AVURLAsset(url: video)
        guard let piste = try? await asset.loadTracks(withMediaType: .video).first,
              let geometrie = try? await piste.load(.naturalSize, .preferredTransform),
              let duree = try? await asset.load(.duration) else { return nil }
        let generateur = AVAssetImageGenerator(asset: asset)
        generateur.appliesPreferredTrackTransform = true
        guard let premiere = try? await generateur.image(at: .zero),
              let jpeg = UIImage(cgImage: premiere.image).jpegData(compressionQuality: 0.85) else { return nil }
        let fichier = dossier.appendingPathComponent("vitrine-affiche-\(UUID().uuidString).jpg")
        guard (try? jpeg.write(to: fichier)) != nil else { return nil }
        let cadre = CGRect(origin: .zero, size: geometrie.0).applying(geometrie.1)
        return VitrineAffiche(url: fichier.absoluteString, largeur: Int(abs(cadre.width)), hauteur: Int(abs(cadre.height)),
                              dureeS: max(1, Int(duree.seconds.rounded())))
    }
}

/// Une pièce que le téléverseur a rendue : ce que la passerelle relie au post qu'elle crée.
nonisolated struct VitrineTeleverse: Equatable, Sendable {
    let id: String
    let url: String
    let mimeType: String
    var affiche: VitrineAffiche? = nil
}

/// Le post tel que la passerelle le sert (`POST /posts`), décodé par le décodeur de PRODUCTION.
nonisolated enum VitrinePostServi {
    static func post(_ corps: CreatePostBody, auteur: MeeshyUser, televerses: [VitrineTeleverse], creeLe: Date = Date()) throws -> APIPost {
        var objet: [String: Any] = [
            "id": identifiant(),
            "type": corps.type ?? PostType.post.rawValue,
            "visibility": corps.visibility,
            "content": corps.content.map { $0 as Any } ?? NSNull(),
            "originalLanguage": corps.originalLanguage.map { $0 as Any } ?? NSNull(),
            "createdAt": horodatage(creeLe),
            "updatedAt": horodatage(creeLe),
            "author": [
                "id": auteur.id,
                "username": auteur.username,
                "displayName": auteur.displayName ?? auteur.username,
            ] as [String: Any],
            "likeCount": 0,
            "commentCount": 0,
            "repostCount": 0,
            "viewCount": 0,
            "bookmarkCount": 0,
            "shareCount": 0,
            "media": medias(retenus: corps.mediaIds ?? [], televerses: televerses),
        ]
        let decodeur = APIClient.makeAPIPayloadDecoder()
        if let effets = corps.storyEffects.flatMap({ try? JSONSerialization.jsonObject(with: JSONEncoder().encode($0)) }) {
            objet["storyEffects"] = adressesDeLaScene(effets, televerses: televerses)
            if let post = try? decodeur.decode(APIPost.self, from: JSONSerialization.data(withJSONObject: objet)) { return post }
            objet["storyEffects"] = nil
        }
        return try decodeur.decode(APIPost.self, from: JSONSerialization.data(withJSONObject: objet))
    }

    /// Les médias du post : ceux que la publication rattache (`mediaIds`), dans son ordre, à l'adresse que le
    /// téléversement leur a donnée.
    static func medias(retenus: [String], televerses: [VitrineTeleverse]) -> [[String: Any]] {
        retenus
            .compactMap { id in televerses.first { $0.id == id } }
            .enumerated()
            .map { ordre, piece in
                let nom = URL(string: piece.url)?.lastPathComponent ?? piece.id
                let media: [String: Any] = [
                    "id": piece.id,
                    "fileName": nom,
                    "originalName": nom,
                    "mimeType": piece.mimeType,
                    "fileUrl": piece.url,
                    "order": ordre,
                ]
                guard let affiche = piece.affiche else { return media }
                return media.merging([
                    "thumbnailUrl": affiche.url, "width": affiche.largeur, "height": affiche.hauteur, "duration": affiche.dureeS,
                ]) { _, nouveau in nouveau }
            }
    }

    /// La scène désigne ses médias par `postMediaId` ET par `mediaURL` ; l'adresse suit celle que la pièce sert, sinon le
    /// lecteur chercherait l'adresse d'origine — qu'il ne sait pas résoudre face à l'hôte mort.
    static func adressesDeLaScene(_ effets: Any, televerses: [VitrineTeleverse]) -> Any {
        let adresses = Dictionary(televerses.map { ($0.id, $0.url) }, uniquingKeysWith: { premiere, _ in premiere })
        func parcourir(_ valeur: Any) -> Any {
            if let liste = valeur as? [Any] { return liste.map(parcourir) }
            guard var dictionnaire = valeur as? [String: Any] else { return valeur }
            dictionnaire = dictionnaire.mapValues(parcourir)
            if let id = dictionnaire["postMediaId"] as? String, let adresse = adresses[id], dictionnaire["mediaURL"] != nil {
                dictionnaire["mediaURL"] = adresse
            }
            return dictionnaire
        }
        return parcourir(effets)
    }

    private static func horodatage(_ date: Date) -> String {
        let format = ISO8601DateFormatter()
        format.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return format.string(from: date)
    }

    /// Un ObjectId plausible : 24 caractères hexadécimaux.
    private static func identifiant() -> String {
        String(UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased().prefix(24))
    }
}
#endif
