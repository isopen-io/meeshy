import Foundation
import MeeshySDK

/// Miroir Swift EXACT de `buildBridgeData`/`formatBridge`
/// (`packages/shared/utils/conversation-bridge.ts`, LWS-1, **gelé S1**).
///
/// Deux étages, comme le TS :
/// - `buildBridgeData` produit des DONNÉES structurées, jamais une phrase.
/// - `formatBridge` compose la phrase côté client, via l'i18n injectée
///   (`t`). Preuve E7 (contrat §3.2) : cet étage ne connaît AUCUNE langue —
///   le même `data` passé à deux `t` différents rend deux phrases
///   différentes, la langue vivant entièrement dans le `t` injecté.
///
/// Types RÉUTILISÉS du SDK (C-029, `CoreModels.swift`) — `ConversationBridgeData`
/// et `ConversationBridgeMediaCounts` — jamais redéfinis ici.
///
/// `nonisolated` sur CHAQUE déclaration de ce fichier : la cible app compile
/// sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` (contrat LWS-5), et cette
/// loi doit rester appelable de manière synchrone depuis n'importe quel
/// contexte (vues, tests, futur usage hors-MainActor) — exactement le motif
/// de `ShareSession`/`ShareSender` (`MeeshyShareExtension/`).
nonisolated enum LentilleBridgeFormatter {

    /// Discriminants RÉELS d'un attachement de message — miroir de
    /// `BridgeAttachmentKind` (TS). `images` et `audio` ont chacun leur
    /// bucket ; tout le reste (`video`, `file`, `location`, et tout kind
    /// futur inconnu) tombe dans `files`, seul bucket restant du type gelé
    /// `ConversationBridgeMediaCounts`.
    nonisolated enum BridgeAttachmentKind: String, Decodable, Sendable {
        case image, video, audio, file, location
    }

    /// Vue structurelle minimale d'un attachement — miroir de
    /// `BridgeAttachment` (TS). Seul le discriminant compte pour le comptage
    /// média du pont.
    nonisolated struct BridgeAttachment: Decodable, Sendable {
        let type: BridgeAttachmentKind
    }

    /// Vue structurelle minimale d'un message côté pont — miroir de
    /// `BridgeMessage` (TS). Le nom de l'auteur est résolu par l'appelant
    /// (Participant, User, profil anonyme…) : cette loi ne sait pas résoudre
    /// une identité, seulement composer un pont à partir d'identités déjà
    /// résolues.
    nonisolated struct BridgeMessage: Decodable, Sendable {
        let senderId: String
        let senderName: String
        let attachments: [BridgeAttachment]?

        init(senderId: String, senderName: String, attachments: [BridgeAttachment]? = nil) {
            self.senderId = senderId
            self.senderName = senderName
            self.attachments = attachments
        }
    }

    /// Fonction de traduction injectée — miroir de `BridgeTranslate` (TS).
    /// Agnostique de toute bibliothèque i18n précise : `formatBridge` ne
    /// connaît ni langue ni catalogue, elle compose des clés et des
    /// paramètres, le `t` de l'appelant fait le reste.
    typealias BridgeTranslate = (String, [String: String]) -> String

    // MARK: - Clés i18n (identiques au TS, lentille.bridge.*)

    private static let authorsOneKey = "lentille.bridge.authorsOne"
    private static let authorsTwoKey = "lentille.bridge.authorsTwo"
    private static let authorsMoreKey = "lentille.bridge.authorsMore"
    private static let messagesOneKey = "lentille.bridge.messagesOne"
    private static let messagesOtherKey = "lentille.bridge.messagesOther"
    private static let mediaImagesKey = "lentille.bridge.media.images"
    private static let mediaAudioKey = "lentille.bridge.media.audio"
    private static let mediaFilesKey = "lentille.bridge.media.files"

    // MARK: - buildBridgeData

    /// Construit les données déterministes du pont ✦ à partir des messages
    /// non lus du lecteur. Miroir EXACT de `buildBridgeData` (TS) :
    ///
    /// - `unreadCount == 0` **OU** zéro message d'autrui (une fois les
    ///   messages du `viewerId` exclus) ⇒ `nil`, JAMAIS un pont vide.
    /// - Les messages du lecteur lui-même n'alimentent ni les auteurs, ni
    ///   `messageCount`, ni `mediaCounts`.
    /// - Auteurs dédupliqués par `senderId` (pas par `senderName`), dans
    ///   l'ORDRE D'APPARITION des messages d'autrui. Deux au plus nommés
    ///   dans `authors` ; le reste bascule dans `extraAuthorCount`.
    /// - `mediaCounts` est ABSENTE (`nil`) si aucun média dans la fenêtre ;
    ///   sinon, chaque compteur (`images`/`audio`/`files`) est ABSENT — pas
    ///   `0` — quand sa catégorie n'a rien à annoncer.
    static func buildBridgeData(
        messages: [BridgeMessage],
        viewerId: String,
        unreadCount: Int
    ) -> ConversationBridgeData? {
        let fromOthers = messages.filter { $0.senderId != viewerId }

        guard unreadCount != 0, !fromOthers.isEmpty else { return nil }

        var seenAuthorIds = Set<String>()
        var orderedAuthorNames: [String] = []
        for message in fromOthers where !seenAuthorIds.contains(message.senderId) {
            seenAuthorIds.insert(message.senderId)
            orderedAuthorNames.append(message.senderName)
        }

        var rawImages = 0
        var rawAudio = 0
        var rawFiles = 0
        for message in fromOthers {
            let attachments = message.attachments ?? []
            let images = attachments.filter { $0.type == .image }.count
            let audio = attachments.filter { $0.type == .audio }.count
            rawImages += images
            rawAudio += audio
            rawFiles += attachments.count - images - audio
        }

        let hasAnyMedia = rawImages > 0 || rawAudio > 0 || rawFiles > 0
        let mediaCounts: ConversationBridgeMediaCounts? = hasAnyMedia
            ? ConversationBridgeMediaCounts(
                images: rawImages > 0 ? rawImages : nil,
                audio: rawAudio > 0 ? rawAudio : nil,
                files: rawFiles > 0 ? rawFiles : nil
              )
            : nil

        return ConversationBridgeData(
            authors: Array(orderedAuthorNames.prefix(2)),
            extraAuthorCount: max(0, orderedAuthorNames.count - 2),
            messageCount: fromOthers.count,
            mediaCounts: mediaCounts
        )
    }

    // MARK: - formatBridge

    /// Compose la phrase du pont ✦ à partir de données déterministes déjà
    /// calculées par `buildBridgeData`, via l'i18n injectée par le client.
    /// Miroir EXACT de `formatBridge` (TS) — preuve E7 : cette fonction ne
    /// connaît AUCUNE langue, le même `data` passé à deux `t` de langues
    /// différentes rend deux phrases différentes.
    static func formatBridge(data: ConversationBridgeData, t: BridgeTranslate) -> String {
        [
            formatAuthorsSegment(data: data, t: t),
            formatMessagesSegment(data: data, t: t),
            formatMediaSegment(data: data, t: t),
        ]
        .compactMap { $0 }
        .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        .joined(separator: " · ")
    }

    private static func formatAuthorsSegment(data: ConversationBridgeData, t: BridgeTranslate) -> String? {
        let first = data.authors.first
        let second = data.authors.count > 1 ? data.authors[1] : nil

        if let first, let second, data.extraAuthorCount > 0 {
            return t(authorsMoreKey, ["a": first, "b": second, "count": String(data.extraAuthorCount)])
        }
        if let first, let second {
            return t(authorsTwoKey, ["a": first, "b": second])
        }
        if let first {
            return t(authorsOneKey, ["name": first])
        }
        return nil
    }

    /// `messageCount == 1` ⇒ `messagesOneKey` ; sinon ⇒ `messagesOtherKey`
    /// (jamais une clé unique) — reprise littérale de la condition 2, REV-2.
    private static func formatMessagesSegment(data: ConversationBridgeData, t: BridgeTranslate) -> String? {
        guard data.messageCount > 0 else { return nil }
        let key = data.messageCount == 1 ? messagesOneKey : messagesOtherKey
        return t(key, ["count": String(data.messageCount)])
    }

    /// Un compteur EXPLICITEMENT à `0` est ignoré, comme le `count > 0` du
    /// miroir TS (`formatMediaSegment`, conversation-bridge.ts). Inatteignable
    /// via `buildBridgeData` (qui n'émet jamais `0`), mais un
    /// `ConversationBridgeData` venu de la gateway (G-124) peut le porter —
    /// REV-2, réserve R3.
    private static func formatMediaSegment(data: ConversationBridgeData, t: BridgeTranslate) -> String? {
        guard let counts = data.mediaCounts else { return nil }

        let parts: [String] = [
            counts.images.flatMap { $0 > 0 ? t(mediaImagesKey, ["count": String($0)]) : nil },
            counts.audio.flatMap { $0 > 0 ? t(mediaAudioKey, ["count": String($0)]) : nil },
            counts.files.flatMap { $0 > 0 ? t(mediaFilesKey, ["count": String($0)]) : nil },
        ].compactMap { $0 }

        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }
}
