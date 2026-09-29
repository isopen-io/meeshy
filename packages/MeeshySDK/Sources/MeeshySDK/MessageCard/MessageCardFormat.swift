import Foundation

/// **LE FORMAT D'UNE CARTE D'EXPORT** — ce que l'exportateur choisit de
/// MONTRER parmi ce qui existe déjà : le template, le titre de la
/// conversation, les noms des auteurs (ou leur anonymat), la date. Miroir de
/// `apps/web/src/lib/export/message-card-format.ts`.
///
/// L'ANONYMAT se choisit par bloc — l'auteur du message cité, celui de la
/// réponse — et ne touche jamais au filigrane, qui signe toujours la carte du
/// pseudo de qui l'exporte.
///
/// UN FORMAT PAR DÉFAUT, ENREGISTRÉ SUR L'APPAREIL, sert l'« Export rapide ».
/// Relu et VALIDÉ à chaque lecture : une valeur abîmée ou d'une version
/// antérieure retombe sur « aucun défaut », jamais sur une exception.
public struct MessageCardFormat: Equatable, Sendable {
    public var template: MessageCardTemplateID
    public var showConversationTitle: Bool
    public var showAuthors: Bool
    public var showDate: Bool
    public var anonymizeQuoted: Bool
    public var anonymizeReply: Bool

    public init(template: MessageCardTemplateID, showConversationTitle: Bool = false, showAuthors: Bool = true,
                showDate: Bool = false, anonymizeQuoted: Bool = false, anonymizeReply: Bool = false) {
        self.template = template
        self.showConversationTitle = showConversationTitle
        self.showAuthors = showAuthors
        self.showDate = showDate
        self.anonymizeQuoted = anonymizeQuoted
        self.anonymizeReply = anonymizeReply
    }

    public static let initial = MessageCardFormat(template: MessageCardTemplates.defaultID)

    public static let storageKey = "meeshy.export.message-card.default-format"

    public enum Toggle: String, CaseIterable, Sendable {
        case showConversationTitle, showAuthors, showDate, anonymizeQuoted, anonymizeReply
    }

    public subscript(toggle: Toggle) -> Bool {
        get {
            switch toggle {
            case .showConversationTitle: return showConversationTitle
            case .showAuthors: return showAuthors
            case .showDate: return showDate
            case .anonymizeQuoted: return anonymizeQuoted
            case .anonymizeReply: return anonymizeReply
            }
        }
        set {
            switch toggle {
            case .showConversationTitle: showConversationTitle = newValue
            case .showAuthors: showAuthors = newValue
            case .showDate: showDate = newValue
            case .anonymizeQuoted: anonymizeQuoted = newValue
            case .anonymizeReply: anonymizeReply = newValue
            }
        }
    }

    /// Les options OFFERTES : le titre seulement s'il existe, et l'anonymat
    /// seulement pour un nom PEINT — celui du message cité, que s'il y en a un.
    public func offeredToggles(hasConversationTitle: Bool, hasQuote: Bool) -> [Toggle] {
        var toggles: [Toggle] = []
        if hasConversationTitle { toggles.append(.showConversationTitle) }
        toggles.append(.showAuthors)
        toggles.append(.showDate)
        if showAuthors && hasQuote { toggles.append(.anonymizeQuoted) }
        if showAuthors { toggles.append(.anonymizeReply) }
        return toggles
    }

    private struct Stored: Codable {
        let template: String
        let showConversationTitle: Bool
        let showAuthors: Bool
        let showDate: Bool
        let anonymizeQuoted: Bool
        let anonymizeReply: Bool
    }

    public static func parse(_ raw: String?) -> MessageCardFormat? {
        guard let data = raw?.data(using: .utf8),
              let stored = try? JSONDecoder().decode(Stored.self, from: data),
              let template = MessageCardTemplateID(rawValue: stored.template) else { return nil }
        return MessageCardFormat(
            template: template,
            showConversationTitle: stored.showConversationTitle,
            showAuthors: stored.showAuthors,
            showDate: stored.showDate,
            anonymizeQuoted: stored.anonymizeQuoted,
            anonymizeReply: stored.anonymizeReply
        )
    }

    public var serialized: String {
        let stored = Stored(
            template: template.rawValue,
            showConversationTitle: showConversationTitle,
            showAuthors: showAuthors,
            showDate: showDate,
            anonymizeQuoted: anonymizeQuoted,
            anonymizeReply: anonymizeReply
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        guard let data = try? encoder.encode(stored) else { return "" }
        return String(decoding: data, as: UTF8.self)
    }

    public static func readDefault(from store: MessageCardPreferenceStore) -> MessageCardFormat? {
        parse(store.string(forKey: storageKey))
    }

    public static func writeDefault(_ format: MessageCardFormat, to store: MessageCardPreferenceStore) {
        store.setString(format.serialized, forKey: storageKey)
    }
}

/// Le stockage des préférences de présentation de l'export — `UserDefaults`
/// en production, une table en mémoire dans les témoins. Aucun contenu n'y entre.
public protocol MessageCardPreferenceStore: AnyObject {
    func string(forKey key: String) -> String?
    func setString(_ value: String, forKey key: String)
}

public final class UserDefaultsMessageCardStore: MessageCardPreferenceStore {
    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public func string(forKey key: String) -> String? { defaults.string(forKey: key) }
    public func setString(_ value: String, forKey key: String) { defaults.set(value, forKey: key) }
}

/// **LE COMPTEUR D'USAGE DES TEMPLATES** — miroir de `message-card-usage.ts`.
/// Chaque carte ENREGISTRÉE (galerie ou partage aboutis, jamais un simple
/// aperçu) compte une fois pour son template. Les plus utilisés remontent en
/// tête (« Populaires »), la vitrine complète tant que l'appareil a peu exporté.
public enum MessageCardUsage {

    public static let storageKey = "meeshy.export.message-card.usage"

    public static func read(from store: MessageCardPreferenceStore) -> [MessageCardTemplateID: Int] {
        guard let data = store.string(forKey: storageKey)?.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data),
              let entries = object as? [String: Any] else { return [:] }
        var usage: [MessageCardTemplateID: Int] = [:]
        for (key, value) in entries {
            guard let id = MessageCardTemplateID(rawValue: key), let count = value as? Int, count > 0 else { continue }
            usage[id] = count
        }
        return usage
    }

    public static func record(_ id: MessageCardTemplateID, in store: MessageCardPreferenceStore) {
        var entries = Dictionary(uniqueKeysWithValues: read(from: store).map { ($0.key.rawValue, $0.value) })
        entries[id.rawValue, default: 0] += 1
        guard let data = try? JSONSerialization.data(withJSONObject: entries, options: [.sortedKeys]) else { return }
        store.setString(String(decoding: data, as: UTF8.self), forKey: storageKey)
    }

    /// Les `count` templates à montrer d'abord : les plus utilisés, puis la vitrine.
    public static func popular(_ usage: [MessageCardTemplateID: Int], count: Int) -> [MessageCardTemplateID] {
        let used = usage.sorted { lhs, rhs in
            lhs.value != rhs.value ? lhs.value > rhs.value : lhs.key.rawValue < rhs.key.rawValue
        }.map(\.key)
        var seen = Set<MessageCardTemplateID>()
        return (used + MessageCardTemplates.featured).filter { seen.insert($0).inserted }.prefix(count).map { $0 }
    }
}
