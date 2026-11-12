import SwiftUI

// MARK: - Le contenu

/// Le glyphe d'une rangée : un symbole système, ou un court texte (« Aa »).
public nonisolated enum MeeshyEdgeRailGlyph: Sendable, Equatable {
    case system(String)
    case text(String)
}

/// **Une rangée d'un rail** : une valeur, donc comparable. `label` est la phrase
/// lue par le lecteur d'écran ; `title` le mot court affiché en libellé (par
/// défaut `label`, et `label` doit le contenir).
public nonisolated struct MeeshyEdgeRailItem: Sendable, Equatable, Identifiable {
    public let id: String
    public let label: String
    public let title: String?
    public let glyph: MeeshyEdgeRailGlyph
    public let isOn: Bool
    public let role: MeeshyEdgeRailRole
    public let activation: MeeshyGlassButtonActivation
    public let value: String?
    public let hint: String?
    public let showsCarriedDot: Bool
    public let isEnabled: Bool
    public let isDimmed: Bool
    public let longPressLabel: String?

    public init(
        id: String,
        label: String,
        title: String? = nil,
        glyph: MeeshyEdgeRailGlyph,
        isOn: Bool = false,
        role: MeeshyEdgeRailRole = .normal,
        activation: MeeshyGlassButtonActivation = .none,
        value: String? = nil,
        hint: String? = nil,
        showsCarriedDot: Bool = false,
        isEnabled: Bool = true,
        isDimmed: Bool = false,
        longPressLabel: String? = nil
    ) {
        assert(!label.isEmpty, "MeeshyEdgeRailItem : le nom accessible est obligatoire et non vide")
        self.id = id
        self.label = label
        self.title = title
        self.glyph = glyph
        self.isOn = isOn
        self.role = role
        self.activation = activation
        self.value = value
        self.hint = hint
        self.showsCarriedDot = showsCarriedDot
        self.isEnabled = isEnabled
        self.isDimmed = isDimmed
        self.longPressLabel = longPressLabel
    }

    public var displayTitle: String { title ?? label }

    public var labelCoversTitle: Bool {
        guard let title else { return true }
        return label.localizedCaseInsensitiveContains(title)
    }

    /// L'état que le disque DIT : celui de K02, ou « sélectionné » quand seul `isOn` parle.
    public var effectiveActivation: MeeshyGlassButtonActivation {
        if activation != .none { return activation }
        return isOn ? .selected(true) : .none
    }

    public var isLit: Bool { effectiveActivation.isOn }

    public var discKind: MeeshyGlassButtonKind {
        if isLit { return .active }
        return role == .destructive ? .destructive : .normal
    }

    public var accessibilityName: String { label }
    public var accessibilityValue: String? { value }

    /// La pastille « porte déjà » : jamais sans `value` pour la dire.
    public var showsDot: Bool { showsCarriedDot && value != nil }
}

public nonisolated enum MeeshyEdgeRailEntry: Sendable, Equatable {
    case item(MeeshyEdgeRailItem)
    case divider
    case custom(id: String)
}

/// Une entrée et son identité stable, pour la pile.
nonisolated struct MeeshyEdgeRailCell: Identifiable, Equatable {
    let id: String
    let entry: MeeshyEdgeRailEntry
}

/// **Le contenu d'un rail** : son nom accessible, son en-tête (affiché en
/// libellé seulement), ses entrées et son pied épinglé.
public nonisolated struct MeeshyEdgeRailSpec: Sendable, Equatable {
    public let name: String
    public let header: String?
    public let entries: [MeeshyEdgeRailEntry]
    public let foot: [MeeshyEdgeRailItem]

    public init(
        name: String,
        header: String? = nil,
        entries: [MeeshyEdgeRailEntry],
        foot: [MeeshyEdgeRailItem] = []
    ) {
        assert(!name.isEmpty, "MeeshyEdgeRailSpec : le nom accessible du groupe est obligatoire")
        self.name = name
        self.header = header
        self.entries = entries
        self.foot = foot
    }

    /// Les entrées sans filet en tête, en queue ni doublé.
    public var cleanedEntries: [MeeshyEdgeRailEntry] {
        var result: [MeeshyEdgeRailEntry] = []
        for entry in entries {
            if entry == .divider, result.isEmpty || result.last == .divider { continue }
            result.append(entry)
        }
        while result.last == .divider { result.removeLast() }
        return result
    }

    public var buttonCount: Int {
        cleanedEntries.filter { $0 != .divider }.count
    }

    public var dividerCount: Int {
        cleanedEntries.filter { $0 == .divider }.count
    }

    /// Un rail sans bouton n'existe pas.
    public var isRenderable: Bool { buttonCount > 0 }

    public var hasFoot: Bool { !foot.isEmpty }

    /// Le rail tel qu'on le dessine : nettoyé, ou rien.
    public var normalized: MeeshyEdgeRailSpec? {
        guard isRenderable else { return nil }
        return MeeshyEdgeRailSpec(name: name, header: header, entries: cleanedEntries, foot: foot)
    }

    var cells: [MeeshyEdgeRailCell] {
        cleanedEntries.enumerated().map { index, entry in
            switch entry {
            case .item(let item): return MeeshyEdgeRailCell(id: item.id, entry: entry)
            case .divider: return MeeshyEdgeRailCell(id: "divider-\(index)", entry: entry)
            case .custom(let id): return MeeshyEdgeRailCell(id: id, entry: entry)
            }
        }
    }

    /// L'ordre de lecture : l'en-tête, les entrées de haut en bas, le pied.
    public var readingOrder: [String] {
        (header == nil ? [] : ["header"])
            + cleanedEntries.compactMap { entry in
                switch entry {
                case .item(let item): return item.id
                case .custom(let id): return id
                case .divider: return nil
                }
            }
            + foot.map(\.id)
    }
}

// MARK: - La présence

/// **La présence d'un rail court**, en valeurs : absent, entrant (monté, encore
/// hors de sa place), présent, sortant (il repart, garde sa dernière liste et
/// répond au toucher). Le rail se démonte quand la sortie est jouée.
public nonisolated struct MeeshyEdgeRailsPresence<Content: Equatable & Sendable>: Equatable, Sendable {
    public nonisolated enum Phase: Equatable, Sendable {
        case absent
        case entering
        case present
        case leaving
    }

    public private(set) var phase: Phase = .absent
    public private(set) var content: Content?

    public init() {}

    public var isMounted: Bool { phase != .absent }
    public var isAway: Bool { phase != .present }
    public var acceptsTouch: Bool { isMounted }

    /// L'hôte veut ce contenu (`nil` : il veut le rail rangé).
    public mutating func wants(_ wanted: Content?) {
        guard let wanted else {
            if phase == .entering || phase == .present { phase = .leaving }
            return
        }
        content = wanted
        switch phase {
        case .absent: phase = .entering
        case .leaving: phase = .present
        case .entering, .present: break
        }
    }

    /// Une image plus tard : le rail entrant va à sa place.
    public mutating func settled() {
        if phase == .entering { phase = .present }
    }

    /// La sortie est jouée : le rail se démonte.
    public mutating func exited() {
        guard phase == .leaving else { return }
        phase = .absent
        content = nil
    }
}

// MARK: - L'activation

public nonisolated enum MeeshyEdgeRailsHaptic: String, Sendable, Equatable {
    case light
    case medium
}

/// Ce qui se passe à un toucher ou à un appui long : désactivé, rien ; sinon UN
/// impact (léger au toucher, moyen à l'appui long), puis l'action.
@MainActor
public enum MeeshyEdgeRailsTrigger {
    @discardableResult
    public static func tap(
        isEnabled: Bool,
        play: @MainActor (MeeshyEdgeRailsHaptic) -> Void = MeeshyEdgeRailsTrigger.playSystemHaptic,
        action: () -> Void
    ) -> Bool {
        perform(isEnabled: isEnabled, haptic: .light, play: play, action: action)
    }

    @discardableResult
    public static func longPress(
        isEnabled: Bool,
        play: @MainActor (MeeshyEdgeRailsHaptic) -> Void = MeeshyEdgeRailsTrigger.playSystemHaptic,
        action: () -> Void
    ) -> Bool {
        perform(isEnabled: isEnabled, haptic: .medium, play: play, action: action)
    }

    public static func playSystemHaptic(_ haptic: MeeshyEdgeRailsHaptic) {
        switch haptic {
        case .light: HapticFeedback.light()
        case .medium: HapticFeedback.medium()
        }
    }

    private static func perform(
        isEnabled: Bool,
        haptic: MeeshyEdgeRailsHaptic,
        play: @MainActor (MeeshyEdgeRailsHaptic) -> Void,
        action: () -> Void
    ) -> Bool {
        guard isEnabled else { return false }
        play(haptic)
        action()
        return true
    }
}
