import Foundation

// MARK: - Ce qu'une ligne de la page Notifications AFFICHE (#8724)

/// Les pièces d'une ligne de la page Notifications, composées UNE fois par une
/// règle pure — la vue les place, elle ne décide de rien.
///
/// Trois défauts relevés par le porteur (2026-09-29) tiennent ici :
/// - **la répétition** : « Belva a réagi ❤️ à votre commentaire » montrait le
///   commentaire en corps PUIS en citation — chaque texte ne paraît qu'une fois
///   (`NotificationRowText.distinct`) ;
/// - **le contexte** : une réaction ou une réponse sur un commentaire ou un
///   post porte en pied l'ICÔNE du contenu et l'extrait du POST, comme un
///   message porte son groupe ;
/// - **le palier** : « Badge débloqué » dit QUEL badge, avec son icône, et sa
///   raison en une ligne.
public struct NotificationRowPresentation: Equatable, Sendable {

    /// Ce qui ouvre la ligne : l'avatar de l'acteur, ou le médaillon d'un palier.
    public enum Leading: Equatable, Sendable {
        case avatar
        case milestone(symbol: String)
    }

    /// Le pied de ligne : OÙ ça s'est passé.
    public enum Footer: Equatable, Sendable {
        /// Un message de groupe — le nom du groupe.
        case conversation(title: String)
        /// Un contenu social (post, story, réel, humeur) — son icône, son
        /// extrait (ou son libellé), la date de publication, et s'il a expiré.
        case content(symbol: String, text: String, isExpired: Bool)
        /// Tout le reste — une ligne de contexte serveur.
        case plain(text: String)
    }

    public let leading: Leading
    public let title: String
    public let body: String?
    /// « En réponse à « … » » — à quoi l'on répond, quand ce n'est pas le corps.
    public let quote: String?
    public let footer: Footer?

    public init(leading: Leading, title: String, body: String?, quote: String?, footer: Footer?) {
        self.leading = leading
        self.title = title
        self.body = body
        self.quote = quote
        self.footer = footer
    }
}

// MARK: - La règle anti-répétition

/// Deux textes d'une même ligne « se répètent » quand, une fois dépouillés de
/// leurs guillemets, de leur casse, de leurs espaces et d'une troncature « … »,
/// l'un est l'autre ou le début de l'autre. Le serveur tronque ses citations
/// (« Superbe features qui vient avec tellement d'… ») : l'égalité stricte ne
/// les aurait jamais reconnues.
public enum NotificationRowText {

    public static func repeats(_ candidate: String, _ other: String) -> Bool {
        let a = normalized(candidate)
        let b = normalized(other)
        guard !a.isEmpty, !b.isEmpty else { return false }
        return a == b || a.hasPrefix(b) || b.hasPrefix(a)
    }

    /// Garde, dans l'ordre, chaque texte qui ne répète aucun des précédents.
    /// Un texte vide ou retenu devient `nil` — sa place reste, la répétition non.
    public static func distinct(_ texts: [String?]) -> [String?] {
        texts.reduce(into: (kept: [String](), out: [String?]())) { acc, text in
            guard let text, !normalized(text).isEmpty,
                  !acc.kept.contains(where: { repeats(text, $0) })
            else {
                acc.out.append(nil)
                return
            }
            acc.kept.append(text)
            acc.out.append(text)
        }.out
    }

    static func normalized(_ text: String) -> String {
        let stripped = text
            .replacingOccurrences(of: "…", with: " ")
            .replacingOccurrences(of: "...", with: " ")
            .components(separatedBy: CharacterSet(charactersIn: "«»“”„\"'’"))
            .joined()
        return stripped
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
            .lowercased()
    }
}

// MARK: - Les paliers d'engagement

/// Le palier qu'une notification d'engagement célèbre, lu dans ses champs
/// STRUCTURÉS (`axisKey`, `achievementKey`, `threshold`, `level`) — jamais dans
/// la prose du corps.
public enum NotificationMilestone: Equatable, Sendable {
    case badge(axis: EngagementAxisKey, threshold: Int?)
    case achievement(EngagementAchievementKey)
    case level(Int?)
    case streak(days: Int?)

    public var symbol: String {
        switch self {
        case .badge(let axis, _): return axis.symbolName
        case .achievement: return "trophy.fill"
        case .level: return "star.fill"
        case .streak: return "flame.fill"
        }
    }
}

/// Résout une clé du catalogue de l'APP (`Localizable.xcstrings`) — `nil` quand
/// la clé n'y est pas, pour que l'appelant retombe sur le texte serveur plutôt
/// que d'afficher un identifiant.
public typealias NotificationCopyLookup = @Sendable (String) -> String?

public enum NotificationCopy {
    public static let appCatalog: NotificationCopyLookup = { key in
        let value = Bundle.main.localizedString(forKey: key, value: nil, table: nil)
        return value == key ? nil : value
    }
}

public extension APINotification {

    var milestone: NotificationMilestone? {
        switch notificationType {
        case .badgeEarned:
            guard let axis = metadata?.axisKey.flatMap(EngagementAxisKey.init(rawValue:)) else { return nil }
            return .badge(axis: axis, threshold: metadata?.threshold)
        case .achievementUnlocked, .legacyAchievementUnlocked:
            return metadata?.achievementKey.flatMap(EngagementAchievementKey.init(rawValue:)).map { .achievement($0) }
        case .levelUp:
            return .level(metadata?.level ?? metadata?.threshold)
        case .streakMilestone:
            return .streak(days: metadata?.threshold)
        default:
            return nil
        }
    }

    /// La ligne entière. `isFriend` ne sert qu'aux gestes (cf. `quickActions`),
    /// `copy` résout les mots du catalogue de l'app (injectable pour les témoins).
    func rowPresentation(copy: NotificationCopyLookup = NotificationCopy.appCatalog) -> NotificationRowPresentation {
        if let milestone {
            return milestonePresentation(milestone, copy: copy)
        }
        let parts = rowParts
        let texts = NotificationRowText.distinct([formattedTitle, parts.body, parts.quote])
        return NotificationRowPresentation(
            leading: .avatar,
            title: formattedTitle,
            body: texts[1],
            quote: texts[2],
            footer: dedupedFooter(parts.footer, against: [formattedTitle, texts[1], texts[2]].compactMap { $0 })
        )
    }

    // MARK: Composition par famille

    private var rowParts: (body: String?, quote: String?, footer: NotificationRowPresentation.Footer?) {
        switch notificationType {
        case .postComment, .legacyPostComment, .storyNewComment, .friendStoryComment, .storyThreadReply:
            return (Self.firstNonEmpty(metadata?.commentPreview, content), nil, contentFooter)
        case .commentReply:
            let quote = Self.firstNonEmpty(metadata?.parentCommentPreview).map {
                String(format: String(localized: "notification.reply.toComment.preview", defaultValue: "En réponse à « %@ »", bundle: .main), $0)
            }
            return (Self.firstNonEmpty(metadata?.commentPreview, content), quote, contentFooter)
        case .commentLike, .commentReaction:
            // Le corps est VOTRE commentaire ; le pied, le POST qui le porte —
            // jamais le commentaire une seconde fois (capture porteur).
            return (Self.firstNonEmpty(metadata?.commentPreview).map { "« \($0) »" }, nil, contentFooter)
        case .postLike, .legacyPostLike, .storyReaction, .statusReaction, .postRepost:
            // Une réaction n'apporte aucun texte neuf : le contenu visé est
            // le pied, le corps se tait.
            return (nil, nil, contentFooter)
        case .friendNewStory, .friendNewPost, .friendNewMood:
            return (formattedBody, nil, contentFooter)
        default:
            return (formattedBody, nil, conversationOrPlainFooter)
        }
    }

    private var conversationOrPlainFooter: NotificationRowPresentation.Footer? {
        if let group = Self.firstNonEmpty(context?.conversationTitle), context?.conversationType != "direct" {
            return .conversation(title: group)
        }
        return Self.firstNonEmpty(formattedContext).map { .plain(text: $0) }
    }

    /// Icône du contenu + son extrait (ou son résumé média, ou son libellé)
    /// + la date de publication. Le pied décrit le POST, jamais le commentaire.
    private var contentFooter: NotificationRowPresentation.Footer {
        .content(symbol: contentKindSymbol, text: contentFooterText(excerpt: contentExcerpt), isExpired: isLinkedContentExpired)
    }

    private var contentExcerpt: String? {
        Self.firstNonEmpty(metadata?.postPreview, mediaSummary)
    }

    private func contentFooterText(excerpt: String?) -> String {
        let head = excerpt ?? socialKindLabel
        let date = context?.postCreatedAt.flatMap(Self.parseISODate).map { NotificationDateFormatter.string(for: $0) }
        return [head, date, expiryLabel].compactMap { $0 }.joined(separator: " · ")
    }

    var contentKindSymbol: String {
        switch (metadata?.postType ?? metadata?.contentType)?.uppercased() {
        case "STORY": return "circle.dashed.inset.filled"
        case "REEL": return "play.rectangle.fill"
        case "MOOD", "STATUS": return "face.smiling.fill"
        case "POST": return "square.text.square.fill"
        default:
            switch notificationType {
            case .storyReaction, .storyNewComment, .friendStoryComment, .storyThreadReply, .friendNewStory:
                return "circle.dashed.inset.filled"
            case .statusReaction, .friendNewMood:
                return "face.smiling.fill"
            default:
                return "square.text.square.fill"
            }
        }
    }

    /// Un pied dont l'extrait répète le corps retombe sur le LIBELLÉ du
    /// contenu (« 🎥 Vidéo » en corps ⇒ « Publication » en pied) ; un pied
    /// conversation ou texte qui répète quoi que ce soit disparaît.
    private func dedupedFooter(_ footer: NotificationRowPresentation.Footer?, against shown: [String]) -> NotificationRowPresentation.Footer? {
        switch footer {
        case .content(let symbol, _, let isExpired):
            let excerpt = contentExcerpt.flatMap { candidate in
                shown.contains(where: { NotificationRowText.repeats(candidate, $0) }) ? nil : candidate
            }
            return .content(symbol: symbol, text: contentFooterText(excerpt: excerpt), isExpired: isExpired)
        case .conversation(let title):
            return shown.contains(where: { NotificationRowText.repeats(title, $0) }) ? nil : footer
        case .plain(let text):
            return shown.contains(where: { NotificationRowText.repeats(text, $0) }) ? nil : footer
        case nil:
            return nil
        }
    }

    // MARK: Paliers

    private func milestonePresentation(_ milestone: NotificationMilestone, copy: NotificationCopyLookup) -> NotificationRowPresentation {
        let name = milestoneName(milestone, copy: copy) ?? formattedTitle
        let reason = milestoneReason(milestone, copy: copy) ?? Self.firstNonEmpty(content)
        let texts = NotificationRowText.distinct([name, reason])
        return NotificationRowPresentation(
            leading: .milestone(symbol: milestone.symbol),
            title: name,
            body: texts[1],
            quote: nil,
            footer: nil
        )
    }

    private func milestoneName(_ milestone: NotificationMilestone, copy: NotificationCopyLookup) -> String? {
        switch milestone {
        case .badge(let axis, _):
            return copy("progression.axis.\(axis.rawValue)")
        case .achievement(let key):
            return copy("progression.\(key.rawValue).title")
        case .level(let level):
            guard let level, let format = copy("notification.milestone.level.name") else { return nil }
            return String(format: format, level)
        case .streak(let days):
            guard let days, let format = copy("notification.milestone.streak.name") else { return nil }
            return String(format: format, days)
        }
    }

    private func milestoneReason(_ milestone: NotificationMilestone, copy: NotificationCopyLookup) -> String? {
        switch milestone {
        case .badge(.inviteJoined, _):
            guard let invitee = senderName, let format = copy("notification.milestone.inviteJoined.reason") else {
                return badgeTierReason(copy: copy)
            }
            return String(format: format, invitee)
        case .badge:
            return badgeTierReason(copy: copy)
        case .achievement(let key):
            return copy("progression.\(key.rawValue).condition")
        case .level, .streak:
            return nil
        }
    }

    private func badgeTierReason(copy: NotificationCopyLookup) -> String? {
        guard let threshold = metadata?.threshold, let format = copy("notification.milestone.badge.reason") else { return nil }
        return String(format: format, threshold)
    }
}
