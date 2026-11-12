import SwiftUI
import MeeshySDK

// MARK: - Les énumérés

/// La tenue d'une capsule de mode : du verre (Quitter, le centre) ou le plein blanc de la validation.
public nonisolated enum MeeshyModeCapsuleKind: String, Sendable, Equatable, CaseIterable {
    case glass
    case solid
}

/// Ce que la capsule montre : son titre, son seul glyphe, ou les deux. Le NOM est toujours dit au lecteur d'écran.
public nonisolated enum MeeshyModeCapsuleDisplay: String, Sendable, Equatable, CaseIterable {
    case title
    case glyph
    case glyphAndTitle
}

/// Ce que l'hôte demande au cadre : le montrer, ou le ranger (on filme) : ni visible ni touchable.
public nonisolated enum MeeshyModeChromePresence: String, Sendable, Equatable, CaseIterable {
    case shown
    case stowed

    public var isStowed: Bool { self == .stowed }
}

// MARK: - L'action

/// **Une action de capsule de mode** : le titre (le nom dit, même en coche), le glyphe, ce qu'on en montre,
/// et les états que l'hôte pilote (désactivée : rien à valider ; occupée : le rendu court). Ce que l'action
/// fait est à l'hôte ; le kit ne sait que la déclencher, une fois, par le site unique de K02.
public struct MeeshyModeAction {
    public let title: String
    public let systemImage: String?
    public let display: MeeshyModeCapsuleDisplay
    public let hint: String?
    public let isEnabled: Bool
    public let isBusy: Bool
    public let haptic: MeeshyGlassButtonHaptic
    public let action: () -> Void

    public init(
        title: String,
        systemImage: String? = nil,
        display: MeeshyModeCapsuleDisplay = .title,
        hint: String? = nil,
        isEnabled: Bool = true,
        isBusy: Bool = false,
        haptic: MeeshyGlassButtonHaptic = .light,
        action: @escaping () -> Void
    ) {
        assert(!title.isEmpty, "MeeshyModeAction : le nom est obligatoire et non vide, même en coche")
        self.title = title
        self.systemImage = systemImage
        self.display = display
        self.hint = hint
        self.isEnabled = isEnabled
        self.isBusy = isBusy
        self.haptic = haptic
        self.action = action
    }

    /// Les VALEURS de l'action : ce que `==` compare, les fermetures hors comparaison.
    var values: MeeshyModeActionValues {
        MeeshyModeActionValues(
            title: title, systemImage: systemImage, display: display, hint: hint,
            isEnabled: isEnabled, isBusy: isBusy, haptic: haptic
        )
    }

    /// L'action ne part que d'une capsule disponible : ni désactivée, ni occupée.
    var isActionable: Bool { isEnabled && !isBusy }

    /// Le chemin UNIQUE d'une action : le toucher, Échap, l'échappement du lecteur d'écran et ⌘ + Entrée.
    @MainActor
    @discardableResult
    func perform() -> Bool {
        MeeshyGlassButtonTrigger.perform(isEnabled: isActionable, haptic: haptic, action: action)
    }
}

nonisolated struct MeeshyModeActionValues: Equatable, Sendable {
    let title: String
    let systemImage: String?
    let display: MeeshyModeCapsuleDisplay
    let hint: String?
    let isEnabled: Bool
    let isBusy: Bool
    let haptic: MeeshyGlassButtonHaptic
}

// MARK: - La recette

/// **Toutes les valeurs du cadre d'un mode plein écran** (K16), nulle part ailleurs : les mesures de la
/// planche (`modeHead`, `plaque`), les durées, les plafonds. Les jetons du design system y sont nommés ;
/// ce qui n'a pas de jeton (le plafond de la plaque, sa largeur large, l'échelle des libellés) vit ici.
public nonisolated enum MeeshyModeChromeRecipe {

    // MARK: Capsules

    public static let capsuleHeight: CGFloat = MeeshyControlSize.tapTarget
    public static let capsuleMargin: CGFloat = MeeshySpacing.lg
    public static let glyphGap: CGFloat = MeeshySpacing.xsPlus
    public static let glyphSize: CGFloat = MeeshyIconSize.lg
    public static let checkSize: CGFloat = MeeshyIconSize.xl
    /// Entre deux éléments de l'en-tête.
    public static let itemGap: CGFloat = MeeshySpacing.sm

    // MARK: En-tête

    public static let headerInset: CGFloat = MeeshySpacing.mdPlus
    public static let wideHeaderInset: CGFloat = MeeshySpacing.xxl
    /// Les libellés réduits à 80 % avant de se tronquer.
    public static let minimumLabelScale: CGFloat = 0.8

    // MARK: Plaque

    public static let plateEdge: CGFloat = MeeshySpacing.md
    public static let plateRadius: CGFloat = MeeshyRadius.xxl
    public static let plateHorizontalPadding: CGFloat = MeeshySpacing.mdPlus
    public static let plateVerticalPadding: CGFloat = MeeshySpacing.md
    public static let plateGap: CGFloat = MeeshySpacing.md
    public static let plateBottomGap: CGFloat = MeeshySpacing.md
    public static let plateMinimumBottom: CGFloat = 28
    public static let plateCeilingShare: CGFloat = 0.42
    public static let plateFloor: CGFloat = 160
    /// La largeur de la plaque posée sous la scène d'un grand écran (I3).
    public static let widePlateWidth: CGFloat = 400

    // MARK: Mouvement

    public static let travel: CGFloat = 12
    public static let enterDuration: TimeInterval = 0.25
    public static let exitDuration: TimeInterval = 0.2
    public static let fadeDuration: TimeInterval = 0.15
    public static let contentFadeDuration: TimeInterval = 0.15

    // MARK: Lois pures

    /// La largeur d'une capsule : ses marges, son glyphe, son titre (à l'échelle des libellés).
    /// Jamais sous la hauteur de la capsule.
    public static func capsuleWidth(
        textWidth: CGFloat,
        hasGlyph: Bool,
        display: MeeshyModeCapsuleDisplay,
        labelScale: CGFloat = 1
    ) -> CGFloat {
        let text = max(textWidth.isFinite ? textWidth : 0, 0) * min(max(labelScale, minimumLabelScale), 1)
        let inner: CGFloat
        switch effectiveDisplay(display, hasGlyph: hasGlyph) {
        case .title: inner = text
        case .glyph: inner = checkSize
        case .glyphAndTitle: inner = glyphSize + glyphGap + text
        }
        return max(capsuleHeight, 2 * capsuleMargin + inner)
    }

    /// Sans glyphe, un affichage qui le demande retombe sur le titre : jamais une capsule vide.
    public static func effectiveDisplay(_ display: MeeshyModeCapsuleDisplay, hasGlyph: Bool) -> MeeshyModeCapsuleDisplay {
        hasGlyph ? display : .title
    }

    /// Le mouvement d'entrée et de retrait : translation verticale et opacité ; sous « réduire les
    /// animations », un fondu de 150 ms sans déplacement.
    public static func motion(reduceMotion: Bool) -> MeeshyModeChromeMotion {
        MeeshyModeChromeMotion(
            travel: reduceMotion ? 0 : travel,
            enterDuration: reduceMotion ? fadeDuration : enterDuration,
            exitDuration: reduceMotion ? fadeDuration : exitDuration
        )
    }

    public static func headerInset(isWide: Bool) -> CGFloat {
        isWide ? wideHeaderInset : headerInset
    }
}

/// Le mouvement du cadre.
public nonisolated struct MeeshyModeChromeMotion: Sendable, Equatable {
    public let travel: CGFloat
    public let enterDuration: TimeInterval
    public let exitDuration: TimeInterval

    public var isFadeOnly: Bool { travel == 0 }

    /// La durée vers une présence donnée.
    public func duration(toward presence: MeeshyModeChromePresence) -> TimeInterval {
        presence.isStowed ? exitDuration : enterDuration
    }
}

// MARK: - La tenue d'une capsule

/// **Ce qu'on voit d'une capsule à un instant**, en VALEURS : un `View` ne s'inspecte pas, sa recette si.
/// La capsule pleine prend le fond, l'encre et l'ombre de l'actif de K02 ; la capsule de verre ne peint
/// rien : sa matière est celle de K01.
public nonisolated struct MeeshyModeCapsuleStyle: Equatable, Sendable {
    public let kind: MeeshyModeCapsuleKind
    /// L'opacité du fond blanc (94 % au repos, 78 % pressée) ; nulle pour le verre.
    public let fillOpacity: Double
    public let shadow: MeeshyGlassButtonShadow?
    public let inkIsSolid: Bool
    /// Le voile d'appui du verre dessiné est celui de K01 ; ici, seulement l'opacité du désactivé.
    public let opacity: Double
    public let respondsToTouch: Bool

    public static func resolve(
        kind: MeeshyModeCapsuleKind,
        isPressed: Bool,
        isEnabled: Bool,
        isBusy: Bool
    ) -> MeeshyModeCapsuleStyle {
        let actionable = isEnabled && !isBusy
        let pressed = isPressed && actionable
        guard kind == .solid else {
            return MeeshyModeCapsuleStyle(
                kind: kind, fillOpacity: 0, shadow: nil, inkIsSolid: false,
                opacity: isEnabled ? 1 : MeeshyGlassButtonRecipe.disabledOpacity, respondsToTouch: actionable
            )
        }
        let active = MeeshyGlassButtonRecipe.resolve(
            kind: .active, size: .s44, tone: .deep, material: .drawn, isPressed: pressed, isEnabled: isEnabled
        )
        return MeeshyModeCapsuleStyle(
            kind: kind, fillOpacity: active.fillOpacity, shadow: active.shadow,
            inkIsSolid: active.ink == .onSolid, opacity: active.opacity, respondsToTouch: actionable
        )
    }
}
