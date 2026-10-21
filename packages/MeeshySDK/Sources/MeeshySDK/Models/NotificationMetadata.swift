import Foundation

// MARK: - Notification Metadata

public struct NotificationMetadata: Codable, Sendable, Equatable {
    /// Résumé léger d'un attachment de message (média inline + détails).
    public struct Attachments: Codable, Sendable, Equatable {
        public let count: Int?
        /// "image" | "video" | "audio" | "document" | "text" | "code"
        public let firstType: String?
        public let firstFilename: String?
        /// Durée en ms du 1er attachment audio/vidéo.
        public let firstDurationMs: Int?
        /// Taille en octets du 1er attachment.
        public let firstFileSize: Int?
        /// Dimensions du 1er attachment image/vidéo.
        public let firstWidth: Int?
        public let firstHeight: Int?
    }

    public let messagePreview: String?
    public let action: String?
    public let reactionEmoji: String?
    public let callType: String?
    public let memberCount: Int?
    public let postId: String?
    public let commentId: String?
    /// Identifiant du commentaire parent (réponse à un commentaire) — permet de
    /// déplier le fil parent puis de défiler/surligner la réponse (`commentId`).
    public let parentCommentId: String?
    public let commentPreview: String?
    public let emoji: String?
    public let postType: String?
    /// Type de contenu pour les notifs « friend_new_* » (STORY/POST/MOOD/STATUS/REEL).
    public let contentType: String?
    /// Aperçu de l'entité visée (post/story/réel) — réactions, commentaires, partages.
    public let postPreview: String?
    /// Aperçu du commentaire parent (réponse à un commentaire).
    public let parentCommentPreview: String?
    /// Extrait textuel du contenu publié (friend_new_*).
    public let excerpt: String?
    /// Nature du média principal — "image" | "video" | "audio" | "text".
    public let mediaType: String?
    /// Miniature (image) de l'entité sociale liée (post/story/réel) — rendue
    /// comme vignette dans la ligne de notification in-app.
    public let postThumbnailUrl: String?
    /// Détails du 1er attachment d'un message (durée audio, taille, dimensions).
    public let attachments: Attachments?

    // Login new device fields
    public let deviceName: String?
    public let deviceVendor: String?
    public let deviceOS: String?
    public let deviceOSVersion: String?
    public let deviceType: String?
    public let ipAddress: String?
    public let country: String?
    public let countryName: String?
    public let city: String?
    public let location: String?

    // MARK: - Paliers d'engagement (#5809)
    //
    // La passerelle les pose depuis toujours (`EngagementService` :
    // `{ action, route, achievementKey }` pour un succès, `{ …, threshold }`
    // pour une série, `{ …, threshold, level }` pour un niveau) — et ce
    // décodeur les JETAIT en silence. Une vue de célébration ne pouvait donc
    // pas savoir QUOI célébrer : le palier voyageait, personne ne le lisait.
    /// La clé stable du succès débloqué (`achievement.first_voice`…).
    public let achievementKey: String?
    /// L'AXE du badge gagné (`content.message.text`…). Un badge ne porte pas
    /// `achievementKey` : sa paire est `axisKey` + `threshold`, et sans elle
    /// une notification de badge ne désigne aucun palier.
    public let axisKey: String?
    /// Le palier atteint — seuil du badge, jours de série, ou score du niveau.
    public let threshold: Int?
    /// Le RANG du niveau, déjà calculé par la passerelle (`levelIndexOf`).
    public let level: Int?
    /// #10298 — le rang du palier atteint. Présent ⇒ titre (le palier) et corps (l'exploit chiffré) sont
    /// composés par la passerelle, à la langue du lecteur ; absent sur les lignes d'avant.
    public let tierRank: Int?
    /// #10298 — la valeur franchie (1 000 commentaires…), que le corps servi dit déjà.
    public let value: Int?

    // MARK: - Le jeu (#9490)
    //
    // Rien d'autre ne voyage que ce que le destinataire sait déjà de LUI : jamais l'identité d'un joueur de
    // ligue (pseudonyme ou compte), jamais une heure d'activité.
    /// Où le toucher mène (`progression`) — la même valeur pour les quatre types.
    public let route: String?
    /// `duo` | `league` | `season`.
    public let gameSection: String?
    public let duoId: String?
    /// La semaine de jeu (`AAAA-MM-JJ` du lundi), pour un duo ou un résultat de ligue.
    public let weekKey: String?
    /// La ligue de la semaine (`quartz`, `jade`…) — une chaîne ouverte, jamais une énumération fermée.
    public let league: String?
    /// `promoted` | `stayed` | `relegated`.
    public let outcome: String?
    /// `gold` | `silver` | `bronze`, ou absent.
    public let cup: String?
    public let season: Int?
    public let step: Int?
    public let completed: Bool?

    // MARK: - Retrait par la modération (#11151)
    /// L’identifiant du contenu retiré (`contentType` dit lequel).
    public let contentId: String?
    /// Le motif du retrait, que l'auteur doit lire.
    public let reason: String?

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        messagePreview = try container.decodeIfPresent(String.self, forKey: .messagePreview)
        action = try container.decodeIfPresent(String.self, forKey: .action)
        reactionEmoji = try container.decodeIfPresent(String.self, forKey: .reactionEmoji)
        callType = try container.decodeIfPresent(String.self, forKey: .callType)
        memberCount = try container.decodeIfPresent(Int.self, forKey: .memberCount)
        postId = try container.decodeIfPresent(String.self, forKey: .postId)
        commentId = try container.decodeIfPresent(String.self, forKey: .commentId)
        parentCommentId = try container.decodeIfPresent(String.self, forKey: .parentCommentId)
        commentPreview = try container.decodeIfPresent(String.self, forKey: .commentPreview)
        emoji = try container.decodeIfPresent(String.self, forKey: .emoji)
        postType = try container.decodeIfPresent(String.self, forKey: .postType)
        contentType = try container.decodeIfPresent(String.self, forKey: .contentType)
        postPreview = try container.decodeIfPresent(String.self, forKey: .postPreview)
        parentCommentPreview = try container.decodeIfPresent(String.self, forKey: .parentCommentPreview)
        excerpt = try container.decodeIfPresent(String.self, forKey: .excerpt)
        mediaType = try container.decodeIfPresent(String.self, forKey: .mediaType)
        postThumbnailUrl = try container.decodeIfPresent(String.self, forKey: .postThumbnailUrl)
        attachments = try container.decodeIfPresent(Attachments.self, forKey: .attachments)
        deviceName = try container.decodeIfPresent(String.self, forKey: .deviceName)
        deviceVendor = try container.decodeIfPresent(String.self, forKey: .deviceVendor)
        deviceOS = try container.decodeIfPresent(String.self, forKey: .deviceOS)
        deviceOSVersion = try container.decodeIfPresent(String.self, forKey: .deviceOSVersion)
        deviceType = try container.decodeIfPresent(String.self, forKey: .deviceType)
        ipAddress = try container.decodeIfPresent(String.self, forKey: .ipAddress)
        country = try container.decodeIfPresent(String.self, forKey: .country)
        countryName = try container.decodeIfPresent(String.self, forKey: .countryName)
        city = try container.decodeIfPresent(String.self, forKey: .city)
        location = try container.decodeIfPresent(String.self, forKey: .location)
        achievementKey = try container.decodeIfPresent(String.self, forKey: .achievementKey)
        // L'AXE d'un badge. `tryAwardBadge` pose `axisKey` là où
        // `tryAwardAchievement` pose `achievementKey` : la passe qui a fait
        // entrer les trois autres champs a laissé celui-ci dehors, et une
        // notification de badge n'avait donc RIEN à célébrer (#5809, moitié
        // badge).
        axisKey = try container.decodeIfPresent(String.self, forKey: .axisKey)
        threshold = try container.decodeIfPresent(Int.self, forKey: .threshold)
        level = try container.decodeIfPresent(Int.self, forKey: .level)
        tierRank = try container.decodeIfPresent(Int.self, forKey: .tierRank)
        value = try container.decodeIfPresent(Int.self, forKey: .value)
        route = try container.decodeIfPresent(String.self, forKey: .route)
        gameSection = try container.decodeIfPresent(String.self, forKey: .gameSection)
        duoId = try container.decodeIfPresent(String.self, forKey: .duoId)
        weekKey = try container.decodeIfPresent(String.self, forKey: .weekKey)
        league = try container.decodeIfPresent(String.self, forKey: .league)
        outcome = try container.decodeIfPresent(String.self, forKey: .outcome)
        cup = try container.decodeIfPresent(String.self, forKey: .cup)
        season = try container.decodeIfPresent(Int.self, forKey: .season)
        step = try container.decodeIfPresent(Int.self, forKey: .step)
        completed = try container.decodeIfPresent(Bool.self, forKey: .completed)
        contentId = try container.decodeIfPresent(String.self, forKey: .contentId)
        reason = try container.decodeIfPresent(String.self, forKey: .reason)
    }

    private enum CodingKeys: String, CodingKey {
        case messagePreview, action, reactionEmoji, callType, memberCount
        case postId, commentId, parentCommentId, commentPreview, emoji, postType
        case contentType, postPreview, parentCommentPreview, excerpt, mediaType, postThumbnailUrl, attachments
        case deviceName, deviceVendor, deviceOS, deviceOSVersion, deviceType
        case ipAddress, country, countryName, city, location
        case achievementKey, axisKey, threshold, level, tierRank, value
        case route, gameSection, duoId, weekKey, league, outcome, cup, season, step, completed
        case contentId, reason
    }
}
