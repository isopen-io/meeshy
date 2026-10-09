#if DEBUG
import Foundation
import MeeshySDK

/// La publication d'un réel, en vitrine (#9820) : le composeur publie par son chemin réel (`publishStoryInBackground`,
/// file d'écriture, `runStoryUpload`), et seules les deux bouches réseau de ce chemin sont remplacées — le téléversement
/// (`VitrineTus`, derrière le VRAI `TusUploadManager`) et la création du post (`VitrinePasserelleDesPosts`). La
/// passerelle fictive pousse ensuite `post:created`, comme la vraie : le fil l'accueille par son propre abonnement.
@MainActor
enum VitrineReel {
    /// La création du post : le temps que la passerelle met à répondre, la tuile d'envoi se voit monter.
    static let montee: Duration = .milliseconds(900)

    private(set) static var lecteur: MeeshyUser?
    private(set) static var sessionDeTeleversement: URLSession?

    static func installer(lecteur: MeeshyUser) {
        self.lecteur = lecteur
        sessionDeTeleversement = VitrineTus.session()
    }

    static func retirer() {
        lecteur = nil
        sessionDeTeleversement = nil
    }

    /// Ce que `runStoryUpload` appelle pour créer le post : la passerelle de la vitrine si elle est installée, sinon le
    /// service réel, inchangé.
    static func passerelle(devant service: any PostServiceProviding) -> VitrinePasserelleDesPosts {
        VitrinePasserelleDesPosts(service: service, lecteur: lecteur, montee: montee)
    }
}

/// La bouche « créer un post » de `runStoryUpload`, à la signature EXACTE de `PostServiceProviding.createCanvasPost` :
/// l'appel de production n'en change pas une lettre.
struct VitrinePasserelleDesPosts {
    let service: any PostServiceProviding
    let lecteur: MeeshyUser?
    let montee: Duration

    func createCanvasPost(
        type: PostType, content: String?, storyEffects: StoryEffects?, visibility: String, visibilityUserIds: [String]?,
        originalLanguage: String?, mediaIds: [String]?, repostOfId: String?, mentions: [PostMentionInput]?,
        allowSoundExtraction: Bool?, mediaAlt: [String: String]?, mediaCaption: [String: String]?, alsoAsReel: Bool?
    ) async throws -> APIPost {
        guard let lecteur else {
            return try await service.createCanvasPost(
                type: type, content: content, storyEffects: storyEffects, visibility: visibility,
                visibilityUserIds: visibilityUserIds, originalLanguage: originalLanguage, mediaIds: mediaIds,
                repostOfId: repostOfId, mentions: mentions, allowSoundExtraction: allowSoundExtraction,
                mediaAlt: mediaAlt, mediaCaption: mediaCaption, alsoAsReel: alsoAsReel
            )
        }
        try? await Task.sleep(for: montee)
        let post = try VitrinePostServi.post(
            type: type, auteur: lecteur, content: content, storyEffects: storyEffects,
            originalLanguage: originalLanguage, visibility: visibility, mediaIds: mediaIds ?? []
        )
        SocialSocketManager.shared.postCreated.send(SocketPostCreatedData(post: post, clientMutationId: nil))
        VitrineRendu.shared.signaler(.reelPublie)
        return post
    }
}

/// Le post tel que la passerelle le sert (`POST /posts`), décodé par le décodeur de PRODUCTION.
nonisolated enum VitrinePostServi {
    static func post(
        type: PostType, auteur: MeeshyUser, content: String?, storyEffects: StoryEffects?,
        originalLanguage: String?, visibility: String, mediaIds: [String], creeLe: Date = Date()
    ) throws -> APIPost {
        var objet: [String: Any] = [
            "id": identifiant(),
            "type": type.rawValue,
            "visibility": visibility,
            "content": content.map { $0 as Any } ?? NSNull(),
            "originalLanguage": originalLanguage.map { $0 as Any } ?? NSNull(),
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
            "media": medias(storyEffects, retenus: mediaIds),
        ]
        let decodeur = APIClient.makeAPIPayloadDecoder()
        if let effets = storyEffects.flatMap({ try? JSONSerialization.jsonObject(with: JSONEncoder().encode($0)) }) {
            objet["storyEffects"] = effets
            if let post = try? decodeur.decode(APIPost.self, from: JSONSerialization.data(withJSONObject: objet)) { return post }
            objet["storyEffects"] = nil
        }
        return try decodeur.decode(APIPost.self, from: JSONSerialization.data(withJSONObject: objet))
    }

    /// Les médias du post : ceux de la scène que la publication rattache (`mediaIds`), à l'adresse que le téléversement
    /// leur a donnée.
    static func medias(_ effets: StoryEffects?, retenus: [String]) -> [[String: Any]] {
        (effets?.mediaObjects ?? [])
            .filter { !$0.postMediaId.isEmpty && retenus.contains($0.postMediaId) }
            .enumerated()
            .map { ordre, objet in
                let adresse = objet.mediaURL ?? ""
                let nom = URL(string: adresse)?.lastPathComponent ?? objet.postMediaId
                return [
                    "id": objet.postMediaId,
                    "fileName": nom,
                    "originalName": nom,
                    "mimeType": objet.kind == .video ? "video/mp4" : "image/jpeg",
                    "fileUrl": adresse,
                    "order": ordre,
                ]
            }
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
