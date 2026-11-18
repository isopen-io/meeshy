import Foundation

/// Une touche, abstraite : le composant ne connaît ni carte, ni lien, ni face. La
/// touche `primary` est la touche de commande de la machine (Commande sur Apple,
/// Contrôle ailleurs) : aucun site d'appel n'écrit l'un des deux.
public nonisolated enum MeeshyKey: Sendable, Equatable, Hashable {
    case character(String)
    case primary
    case shift
    case option
    case control
    case enter
    case escape
    case space
    case tab
    case delete
    case up
    case down
    case left
    case right
}

/// Une combinaison, dans l'ordre de frappe : jamais de signe « + », l'accolement suffit.
public typealias MeeshyKeyCombo = [MeeshyKey]

public nonisolated enum MeeshyKeyPlatform: String, Sendable, Equatable, CaseIterable {
    case apple
    case other
}

public nonisolated enum MeeshyKeyHintContext: String, Sendable, Equatable, CaseIterable {
    case free
    case inset
    case legend
}

public nonisolated enum MeeshyKeyHintSize: String, Sendable, Equatable, CaseIterable {
    case regular
    case compact
}

/// La surface sur laquelle la touche se pose ; `auto` prend celle de l'hôte.
public nonisolated enum MeeshyKeyHintSurface: String, Sendable, Equatable, CaseIterable {
    case auto
    case onFill
    case onAccent
    case onGlass
}

/// Une entrée de légende : une ou plusieurs combinaisons pour UN libellé
/// (« 1 », « 2 », « 3 » pour « Diapo »).
public nonisolated struct MeeshyKeyLegendItem: Sendable, Equatable, Identifiable {
    public let id: String
    public let combos: [MeeshyKeyCombo]
    public let title: String
    public let startsGroup: Bool

    public init(id: String, combos: [MeeshyKeyCombo], title: String, startsGroup: Bool = false) {
        self.id = id
        self.combos = combos
        self.title = title
        self.startsGroup = startsGroup
    }
}

/// **La loi des glyphes** : ce qu'on dessine, ce qu'on dit, et quand rien ne se
/// dessine. Pure : aucun écouteur de clavier, aucune lecture de l'environnement.
public nonisolated enum MeeshyKeyHintRule {

    /// Au plus trois touches par combinaison.
    public static let maximumKeys = 3

    public static func limited(_ keys: [MeeshyKey]) -> [MeeshyKey] {
        Array(keys.prefix(maximumKeys))
    }

    /// Sans clavier, ou hôte désactivé, ou sans touche : aucun nœud, aucune place.
    public static func isShown(hasKeyboard: Bool, isEnabled: Bool, keys: [MeeshyKey]? = nil) -> Bool {
        hasKeyboard && isEnabled && keys?.isEmpty != true
    }

    /// Les glyphes à dessiner. En lecture de droite à gauche, les flèches gauche
    /// et droite s'échangent ; l'ordre de frappe ne s'inverse jamais.
    public static func glyphs(keys: [MeeshyKey], platform: MeeshyKeyPlatform, isRightToLeft: Bool = false) -> [String] {
        limited(keys).map { glyph($0, platform: platform, isRightToLeft: isRightToLeft) }
    }

    static func effective(_ key: MeeshyKey, isRightToLeft: Bool) -> MeeshyKey {
        guard isRightToLeft else { return key }
        switch key {
        case .left: return .right
        case .right: return .left
        default: return key
        }
    }

    private static func glyph(_ key: MeeshyKey, platform: MeeshyKeyPlatform, isRightToLeft: Bool) -> String {
        let key = effective(key, isRightToLeft: isRightToLeft)
        let apple = platform == .apple
        switch key {
        case .character(let text): return text.uppercased()
        case .primary: return apple ? "⌘" : "Ctrl"
        case .shift: return apple ? "⇧" : "Shift"
        case .option: return apple ? "⌥" : "Alt"
        case .control: return apple ? "⌃" : "Ctrl"
        case .enter: return apple ? "↩" : "Enter"
        case .escape: return "Esc"
        case .space: return "Space"
        case .tab: return apple ? "⇥" : "Tab"
        case .delete: return apple ? "⌫" : "Del"
        case .up: return "↑"
        case .down: return "↓"
        case .left: return "←"
        case .right: return "→"
        }
    }
}

/// **La recette de K55 en VALEURS** : la touche (26, ou 20 en compact), sa lèvre,
/// son caractère, l'écart d'une combinaison. La touche est muette : aucune cible,
/// aucun survol, aucun focus.
public nonisolated struct MeeshyKeyHintRecipe: Sendable, Equatable {

    public static let glyphSize: Double = 12
    public static let pressDuration: Double = 0.12
    /// Enfoncée, la face descend de 1,5 ; la lèvre reste.
    public static let pressDepth: Double = 1.5
    /// Le filet des trois autres côtés de la touche.
    public static let edgeWidth: Double = 1

    public let side: Double
    public let minimumWidth: Double
    public let cornerRadius: Double
    public let lipWidth: Double
    public let characterSize: Double
    public let combinationGap: Double
    public let horizontalPadding: Double
    public let isPressed: Bool
    public let pressOffset: Double
    public let isHittable: Bool
    public let isHiddenFromVoiceOver: Bool

    public static func resolve(size: MeeshyKeyHintSize, isPressed: Bool, reduceMotion: Bool) -> MeeshyKeyHintRecipe {
        let compact = size == .compact
        let side: Double = compact ? 20 : 26
        return MeeshyKeyHintRecipe(
            side: side,
            minimumWidth: side,
            cornerRadius: compact ? 6 : 8,
            lipWidth: compact ? 2 : 2.5,
            characterSize: compact ? 10.5 : 12.5,
            combinationGap: compact ? 3 : 4,
            horizontalPadding: compact ? 5 : 6,
            isPressed: isPressed,
            pressOffset: isPressed && !reduceMotion ? pressDepth : 0,
            isHittable: false,
            isHiddenFromVoiceOver: true
        )
    }
}

/// **La loi de la légende** : un filet entre deux groupes seulement — jamais en
/// tête ni en fin —, une paire ne se coupe jamais, et zéro entrée — ou aucun
/// clavier — ne rend ni conteneur ni verre.
public nonisolated enum MeeshyKeyLegendLaw {
    public static let pairSpacing: Double = 6
    public static let ruleWidth: Double = 1
    public static let ruleHeight: Double = 18
    public static let groupSpacing: Double = 10
    public static let barHeight: Double = 44
    public static let barCornerRadius: Double = 14

    /// Un élément de la légende : une paire, ou le filet qui la précède.
    public struct Element: Sendable, Equatable, Identifiable {
        public let id: String
        public let isRule: Bool
        public let item: MeeshyKeyLegendItem?
    }

    public static func elements(_ items: [MeeshyKeyLegendItem]) -> [Element] {
        items.enumerated().flatMap { index, item -> [Element] in
            let pair = Element(id: item.id, isRule: false, item: item)
            guard item.startsGroup, index > 0 else { return [pair] }
            return [Element(id: "rule-\(item.id)", isRule: true, item: nil), pair]
        }
    }

    /// Sans clavier, la légende ne rend rien : ni barre, ni libellé privé de sa touche.
    public static func rendersContainer(itemCount: Int, hasKeyboard: Bool) -> Bool {
        hasKeyboard && itemCount > 0
    }
}

/// Les mots de K55 : le nom des touches dit à la voix, dans la langue du lecteur.
public enum MeeshyKeyHintWords {

    static func name(of key: MeeshyKey, platform: MeeshyKeyPlatform, bundle: Bundle?, locale: Locale) -> String {
        switch key {
        case .character(let text): return text.uppercased()
        case .primary: return platform == .apple ? command(bundle, locale) : control(bundle, locale)
        case .control: return control(bundle, locale)
        case .shift: return String(localized: "kit.key.shift", defaultValue: "Majuscule", bundle: bundle ?? .module, locale: locale)
        case .option:
            return platform == .apple
                ? String(localized: "kit.key.option", defaultValue: "Option", bundle: bundle ?? .module, locale: locale)
                : String(localized: "kit.key.alt", defaultValue: "Alt", bundle: bundle ?? .module, locale: locale)
        case .enter: return String(localized: "kit.key.enter", defaultValue: "Entrée", bundle: bundle ?? .module, locale: locale)
        case .escape: return String(localized: "kit.key.escape", defaultValue: "Échap", bundle: bundle ?? .module, locale: locale)
        case .space: return String(localized: "kit.key.space", defaultValue: "Espace", bundle: bundle ?? .module, locale: locale)
        case .tab: return String(localized: "kit.key.tab", defaultValue: "Tabulation", bundle: bundle ?? .module, locale: locale)
        case .delete: return String(localized: "kit.key.delete", defaultValue: "Supprimer", bundle: bundle ?? .module, locale: locale)
        case .up: return String(localized: "kit.key.up", defaultValue: "Flèche haut", bundle: bundle ?? .module, locale: locale)
        case .down: return String(localized: "kit.key.down", defaultValue: "Flèche bas", bundle: bundle ?? .module, locale: locale)
        case .left: return String(localized: "kit.key.left", defaultValue: "Flèche gauche", bundle: bundle ?? .module, locale: locale)
        case .right: return String(localized: "kit.key.right", defaultValue: "Flèche droite", bundle: bundle ?? .module, locale: locale)
        }
    }

    private static func command(_ bundle: Bundle?, _ locale: Locale) -> String {
        String(localized: "kit.key.command", defaultValue: "Commande", bundle: bundle ?? .module, locale: locale)
    }

    private static func control(_ bundle: Bundle?, _ locale: Locale) -> String {
        String(localized: "kit.key.control", defaultValue: "Contrôle", bundle: bundle ?? .module, locale: locale)
    }

    static func prefix(bundle: Bundle?, locale: Locale) -> String {
        String(localized: "kit.key_shortcut.spoken_prefix", defaultValue: "raccourci", bundle: bundle ?? .module, locale: locale)
    }
}

public extension MeeshyKeyHintRule {

    /// La combinaison dite : « Commande M ».
    @MainActor
    static func spoken(keys: [MeeshyKey],
                       platform: MeeshyKeyPlatform,
                       isRightToLeft: Bool = false,
                       bundle: Bundle? = nil,
                       locale: Locale = .current) -> String {
        limited(keys)
            .map { MeeshyKeyHintWords.name(of: effective($0, isRightToLeft: isRightToLeft), platform: platform,
                                           bundle: bundle, locale: locale) }
            .joined(separator: " ")
    }

    /// Ce que l'hôte ajoute à son nom : « raccourci : Commande M ».
    @MainActor
    static func spokenWithPrefix(keys: [MeeshyKey],
                                 platform: MeeshyKeyPlatform,
                                 prefix: String?,
                                 bundle: Bundle? = nil,
                                 locale: Locale = .current) -> String {
        let head = prefix ?? MeeshyKeyHintWords.prefix(bundle: bundle, locale: locale)
        return "\(head) : \(spoken(keys: keys, platform: platform, bundle: bundle, locale: locale))"
    }
}
