import Foundation
import MeeshySDK

/// Les mots d'« En commun » (#19377, planche `Autre-Commun`).
enum ProfileInCommonCopy {

    static func figure(_ figure: ProfileInCommonDigest.Figure) -> String {
        switch figure {
        case .conversations(let count):
            return String(localized: "profile.inCommon.summary.conversations", defaultValue: "\(count) conversations", bundle: .module)
        case .communities(let count):
            return String(localized: "profile.inCommon.summary.communities", defaultValue: "\(count) communautés", bundle: .module)
        case .friends(let count):
            return String(localized: "profile.inCommon.summary.friends", defaultValue: "\(count) amis", bundle: .module)
        }
    }

    /// « 6 conversations · 3 communautés · 12 amis » ; rien sans chiffre.
    static func summary(_ figures: [ProfileInCommonDigest.Figure]) -> String? {
        guard !figures.isEmpty else { return nil }
        return figures.map { figure($0) }.joined(separator: " · ")
    }

    static var communities: String {
        String(localized: "profile.inCommon.section.communities", defaultValue: "Communautés", bundle: .module)
    }

    static var friends: String {
        String(localized: "profile.inCommon.section.friends", defaultValue: "Amis en commun", bundle: .module)
    }

    static var media: String {
        String(localized: "profile.inCommon.section.media", defaultValue: "Médias partagés", bundle: .module)
    }

    static var history: String {
        String(localized: "profile.inCommon.section.history", defaultValue: "Notre histoire", bundle: .module)
    }

    static var nothingInCommon: String {
        String(localized: "profile.inCommon.empty", defaultValue: "Vous n'avez encore rien en commun", bundle: .module)
    }

    static var firstMessage: String {
        String(localized: "profile.conversations.firstMessage", defaultValue: "Envoyer un premier message", bundle: .module)
    }

    static func members(_ count: Int) -> String {
        String(localized: "profile.inCommon.members", defaultValue: "\(count) membres", bundle: .module)
    }

    /// « Mina, Kwame et 10 autres » ; « Mina et Kwame » quand il n'y a personne d'autre.
    static func friendLead(names: [String], others: Int, locale: Locale = .current) -> String {
        let formatter = ListFormatter()
        formatter.locale = locale
        guard others > 0 else { return formatter.string(from: names) ?? names.joined(separator: ", ") }
        let listed = names.joined(separator: ", ")
        if others == 1 {
            return String(localized: "profile.inCommon.friends.leadOne", defaultValue: "\(listed) et 1 autre", bundle: .module)
        }
        return String(localized: "profile.inCommon.friends.leadMany", defaultValue: "\(listed) et \(others) autres", bundle: .module)
    }

    static var mediaFilters: String {
        String(localized: "profile.inCommon.media.filters", defaultValue: "Type de média", bundle: .module)
    }

    static func filter(_ kind: InCommonMediaKind) -> String {
        switch kind {
        case .image: return String(localized: "profile.inCommon.media.image", defaultValue: "Photos", bundle: .module)
        case .video: return String(localized: "profile.inCommon.media.video", defaultValue: "Vidéos", bundle: .module)
        case .audio: return String(localized: "profile.inCommon.media.audio", defaultValue: "Audio", bundle: .module)
        case .link: return String(localized: "profile.inCommon.media.link", defaultValue: "Liens", bundle: .module)
        case .file: return String(localized: "profile.inCommon.media.file", defaultValue: "Fichiers", bundle: .module)
        }
    }

    static func filterGlyph(_ kind: InCommonMediaKind) -> String {
        switch kind {
        case .image: return "photo"
        case .video: return "video"
        case .audio: return "waveform"
        case .link: return "link"
        case .file: return "doc"
        }
    }

    static var voice: String {
        String(localized: "profile.inCommon.media.voice", defaultValue: "Vocal partagé", bundle: .module)
    }

    static func circle(_ level: RelationLevel) -> String {
        switch level {
        case .blood: return String(localized: "profile.inCommon.circle.blood", defaultValue: "Sang", bundle: .module)
        case .close: return String(localized: "profile.inCommon.circle.close", defaultValue: "Proche", bundle: .module)
        case .friend: return String(localized: "profile.inCommon.circle.friend", defaultValue: "Ami", bundle: .module)
        case .acquaintance: return String(localized: "profile.inCommon.circle.acquaintance", defaultValue: "Connaissance", bundle: .module)
        case .community: return String(localized: "profile.inCommon.circle.community", defaultValue: "Communauté", bundle: .module)
        case .public: return String(localized: "profile.inCommon.circle.public", defaultValue: "Public", bundle: .module)
        }
    }

    static func circleGlyph(_ level: RelationLevel) -> String {
        switch level {
        case .blood: return "drop.fill"
        case .close: return "flame.fill"
        case .friend: return "person.2.fill"
        case .acquaintance: return "hand.wave.fill"
        case .community: return "person.3.fill"
        case .public: return "globe"
        }
    }

    static func lockedTitle(_ part: ProfileInCommonDigest.Part) -> String {
        switch part {
        case .communities: return String(localized: "profile.inCommon.locked.communities", defaultValue: "Communautés en commun", bundle: .module)
        case .friends: return friends
        case .media: return media
        }
    }

    static func lockedGlyph(_ part: ProfileInCommonDigest.Part) -> String {
        switch part {
        case .communities: return "person.3"
        case .friends: return "person.2"
        case .media: return "photo.on.rectangle"
        }
    }

    static func historyTitle(_ kind: InCommonHistoryKind) -> String {
        switch kind {
        case .firstMessage: return String(localized: "profile.inCommon.history.firstMessage", defaultValue: "Premier message", bundle: .module)
        case .acquaintance: return String(localized: "profile.inCommon.history.acquaintance", defaultValue: "Connaissances", bundle: .module)
        case .friend: return String(localized: "profile.inCommon.history.friend", defaultValue: "Amis", bundle: .module)
        case .close: return String(localized: "profile.inCommon.history.close", defaultValue: "Proches", bundle: .module)
        case .blood: return String(localized: "profile.inCommon.history.blood", defaultValue: "Sang", bundle: .module)
        case .messages1000: return String(localized: "profile.inCommon.history.messages1000", defaultValue: "1 000 messages", bundle: .module)
        }
    }

    static func historyGlyph(_ kind: InCommonHistoryKind) -> String {
        switch kind {
        case .firstMessage: return "bubble.left"
        case .acquaintance: return "hand.wave"
        case .friend: return "person.2"
        case .close: return "flame"
        case .blood: return "drop"
        case .messages1000: return "sparkles"
        }
    }

    /// « 6 mars » ; l'année seulement quand ce n'est pas celle d'aujourd'hui.
    static func historyDate(_ date: Date, now: Date = Date(), calendar: Calendar = .current, locale: Locale = .current) -> String {
        let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: now)
        let style = Date.FormatStyle(locale: locale, calendar: calendar).day().month(.abbreviated)
        return sameYear ? date.formatted(style) : date.formatted(style.year())
    }
}
