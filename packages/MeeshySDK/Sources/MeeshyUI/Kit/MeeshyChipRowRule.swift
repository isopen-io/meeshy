import SwiftUI

// MARK: - Le vocabulaire de la rangée

/// Ce que toucher une puce fait de la sélection. `actions` : aucune puce n'est
/// courante, chacune déclenche `onAction`.
public nonisolated enum MeeshyChipRowMode: String, Sendable, Equatable, CaseIterable {
    case single
    case singleOrNone
    case multiple
    case actions
}

/// Comment les puces se posent : sur une rangée qui défile, repliées sur
/// plusieurs rangées, ou en se partageant la largeur.
public nonisolated enum MeeshyChipRowLayout: String, Sendable, Equatable, CaseIterable {
    case scroll
    case wrap
    case equal
}

/// Ce que la rangée DIT au lecteur d'écran : un choix, ou des onglets.
public nonisolated enum MeeshyChipRowSemantics: String, Sendable, Equatable, CaseIterable {
    case choice
    case tabs
}

/// Sur quoi la rangée se pose : un média ou une feuille sombre (encre claire),
/// ou le thème de l'application (encre du thème).
public nonisolated enum MeeshyChipRowSurface: String, Sendable, Equatable, CaseIterable {
    case onMedia
    case theme
}

public nonisolated enum MeeshyChipRowSize: String, Sendable, Equatable, CaseIterable {
    case regular
    case compact

    /// La hauteur de la capsule : les jetons `MeeshyControlSize`.
    public var height: CGFloat {
        switch self {
        case .regular: return MeeshyControlSize.regular
        case .compact: return MeeshyControlSize.small
        }
    }

    public var horizontalPadding: CGFloat {
        switch self {
        case .regular: return MeeshySpacing.md
        case .compact: return MeeshySpacing.smPlus
        }
    }

    public var fontSize: CGFloat {
        switch self {
        case .regular: return MeeshyFont.subheadSize
        case .compact: return MeeshyFont.smallSize
        }
    }

    /// Ce dont la cible tactile déborde la capsule, en haut et en bas : la
    /// capsule garde son encombrement.
    public var verticalSlack: CGFloat {
        max(0, (MeeshyControlSize.tapTarget - height) / 2)
    }
}

/// Le retour haptique d'un changement effectif. `none` quand l'hôte joue le sien.
public nonisolated enum MeeshyChipRowHaptic: String, Sendable, Equatable, CaseIterable {
    case light
    case none
}

/// Ce qui ferme une puce, après son titre. Il reste en fin de ligne en RTL.
public nonisolated enum MeeshyChipTrailing: String, Sendable, Equatable, CaseIterable {
    case none
    case chevron
    case remove

    public var systemImage: String? {
        switch self {
        case .none: return nil
        case .chevron: return "chevron.down"
        case .remove: return "xmark"
        }
    }
}

/// Une puce choisit (`choice`), ou déclenche (`action`, `menu`) : une puce
/// d'action ou de menu n'entre jamais dans la sélection.
public nonisolated enum MeeshyChipKind: String, Sendable, Equatable, CaseIterable {
    case choice
    case action
    case menu
}

// MARK: - La puce (valeur)

/// Une puce : une VALEUR, donc comparable. Aucune chaîne n'est fabriquée ici :
/// l'hôte passe le titre, le nom et l'aide, déjà traduits.
public nonisolated struct MeeshyChip<ID: Hashable & Sendable>: Equatable, Sendable, Identifiable {
    public let id: ID
    public let title: String
    public let systemImage: String?
    public let trailing: MeeshyChipTrailing
    public let kind: MeeshyChipKind
    public let tint: Color?
    public let isEnabled: Bool
    public let accessibilityLabel: String?
    public let hint: String?

    public init(
        id: ID,
        title: String,
        systemImage: String? = nil,
        trailing: MeeshyChipTrailing = .none,
        kind: MeeshyChipKind = .choice,
        tint: Color? = nil,
        isEnabled: Bool = true,
        accessibilityLabel: String? = nil,
        hint: String? = nil
    ) {
        self.id = id
        self.title = title
        self.systemImage = systemImage
        self.trailing = trailing
        self.kind = kind
        self.tint = tint
        self.isEnabled = isEnabled
        self.accessibilityLabel = accessibilityLabel
        self.hint = hint
    }

    /// Le nom lu : `accessibilityLabel ?? title`. Vide si la puce n'a ni l'un
    /// ni l'autre, ce que la rangée refuse.
    public var name: String {
        if let accessibilityLabel, !accessibilityLabel.isEmpty { return accessibilityLabel }
        return title
    }

    public var hasAccessibleName: Bool { !name.isEmpty }

    /// Un glyphe sans titre : il se dessine plus grand.
    public var isGlyphOnly: Bool { title.isEmpty && systemImage != nil }
}

// MARK: - La loi de sélection

/// Ce que devient un toucher : rien, une sélection nouvelle, ou une action.
public nonisolated enum MeeshyChipRowResponse<ID: Hashable & Sendable>: Equatable, Sendable {
    case ignored
    case changed(Set<ID>)
    case action
}

/// **La loi du toucher** : pure, sans écran. K04 calcule `next` et ne garde
/// rien, la sélection appartient à l'hôte.
public nonisolated enum MeeshyChipRowRule {
    public static func response<ID: Hashable & Sendable>(
        selection: Set<ID>,
        tapped: ID,
        mode: MeeshyChipRowMode,
        kind: MeeshyChipKind = .choice
    ) -> MeeshyChipRowResponse<ID> {
        guard mode != .actions, kind == .choice else { return .action }
        switch mode {
        case .actions:
            return .action
        case .single:
            return selection == [tapped] ? .ignored : .changed([tapped])
        case .singleOrNone:
            return .changed(selection.contains(tapped) ? [] : [tapped])
        case .multiple:
            return .changed(selection.symmetricDifference([tapped]))
        }
    }

    /// La sélection suivante : celle d'aujourd'hui quand le toucher est ignoré
    /// ou qu'il déclenche une action.
    public static func next<ID: Hashable & Sendable>(
        selection: Set<ID>,
        tapped: ID,
        mode: MeeshyChipRowMode,
        kind: MeeshyChipKind = .choice
    ) -> Set<ID> {
        guard case .changed(let next) = response(selection: selection, tapped: tapped, mode: mode, kind: kind) else {
            return selection
        }
        return next
    }

    /// La puce à montrer après un changement de sélection : celle qui vient
    /// d'entrer (la première, dans l'ordre de la rangée), sinon la première
    /// courante. `nil` si rien n'est courant.
    public static func revealTarget<ID: Hashable & Sendable>(
        order: [ID],
        previous: Set<ID>,
        current: Set<ID>
    ) -> ID? {
        let added = current.subtracting(previous)
        return order.first { added.contains($0) } ?? order.first { current.contains($0) }
    }
}

// MARK: - L'activation

/// Ce qui se passe quand une puce est touchée : désactivée, rien ; ignorée,
/// rien (ni rappel ni haptique) ; sinon UN impact (sauf `none`), puis le
/// rappel. Une loi pure, testée sans écran.
@MainActor
enum MeeshyChipRowTrigger {
    @discardableResult
    static func perform<ID: Hashable & Sendable>(
        response: MeeshyChipRowResponse<ID>,
        tapped: ID,
        isEnabled: Bool,
        haptic: MeeshyChipRowHaptic,
        play: @MainActor (MeeshyChipRowHaptic) -> Void = MeeshyChipRowTrigger.playSystemHaptic,
        onChange: (Set<ID>, ID) -> Void,
        onAction: ((ID) -> Void)?
    ) -> Bool {
        guard isEnabled else { return false }
        switch response {
        case .ignored:
            return false
        case .changed(let next):
            if haptic != .none { play(haptic) }
            onChange(next, tapped)
        case .action:
            if haptic != .none { play(haptic) }
            onAction?(tapped)
        }
        return true
    }

    static func playSystemHaptic(_ haptic: MeeshyChipRowHaptic) {
        switch haptic {
        case .none: break
        case .light: HapticFeedback.light()
        }
    }
}

// MARK: - Ce que le lecteur d'écran entend

public nonisolated enum MeeshyChipRole: String, Sendable, Equatable, CaseIterable {
    /// Choix simple : un bouton, sélectionné ou non.
    case choice
    /// Choix multiple : une bascule.
    case toggle
    case tab
    case button
    /// Ouvre une liste.
    case menu
}

/// Le rôle et la valeur d'une puce selon le mode, la sémantique et le genre.
public nonisolated struct MeeshyChipAccessibility: Equatable, Sendable {
    public let role: MeeshyChipRole
    public let isSelected: Bool

    public static func resolve(
        mode: MeeshyChipRowMode,
        semantics: MeeshyChipRowSemantics,
        kind: MeeshyChipKind,
        isSelected: Bool
    ) -> MeeshyChipAccessibility {
        if kind == .menu { return MeeshyChipAccessibility(role: .menu, isSelected: false) }
        if kind == .action || mode == .actions { return MeeshyChipAccessibility(role: .button, isSelected: false) }
        if semantics == .tabs { return MeeshyChipAccessibility(role: .tab, isSelected: isSelected) }
        return MeeshyChipAccessibility(role: mode == .multiple ? .toggle : .choice, isSelected: isSelected)
    }
}
