import SwiftUI

// MARK: - Les valeurs que l'hôte passe

/// Ce que le bouton dit de l'action : prête, en cours (une fraction, ou aucune
/// quand la durée est inconnue, et le mot de l'hôte), ou différée jusqu'au
/// retour du réseau. Les mots sont ceux de l'hôte, déjà traduits.
public nonisolated enum MeeshySplitActionPhase: Sendable, Equatable {
    case ready
    case busy(progress: Double?, title: String)
    case deferred(title: String)
}

/// Les deux hauteurs de la fiche : 48 au repos, 44 dans un en-tête.
public nonisolated enum MeeshySplitActionSize: String, Sendable, Equatable, CaseIterable {
    case regular
    case compact
}

/// `hug` prend la largeur de son contenu ; `fill` prend celle qu'on lui offre,
/// libellé centré, chevron à la fin.
public nonisolated enum MeeshySplitActionWidth: String, Sendable, Equatable, CaseIterable {
    case hug
    case fill
}

/// Le choix de ce qui part : le nom et l'indice du chevron, son état déplié,
/// s'il est actif, et ce qu'il ouvre. L'action n'est jamais celle du libellé.
public nonisolated struct MeeshySplitActionChoose {
    public let label: String
    public let hint: String?
    public let isExpanded: Bool
    public let isEnabled: Bool
    public let action: () -> Void

    public init(
        label: String,
        hint: String? = nil,
        isExpanded: Bool = false,
        isEnabled: Bool = true,
        action: @escaping () -> Void = {}
    ) {
        assert(!label.isEmpty, "MeeshySplitActionChoose : le nom accessible est obligatoire et non vide")
        self.label = label
        self.hint = hint
        self.isExpanded = isExpanded
        self.isEnabled = isEnabled
        self.action = action
    }
}

extension MeeshySplitActionChoose: Equatable {
    public static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.label == rhs.label && lhs.hint == rhs.hint
            && lhs.isExpanded == rhs.isExpanded && lhs.isEnabled == rhs.isEnabled
    }
}

/// Un des deux segments qui se touchent.
public nonisolated enum MeeshySplitActionSegment: String, Sendable, Equatable, CaseIterable {
    case label
    case chevron
}

// MARK: - Ce que K13 demande à la matière

/// Le fond que K13 peint lui-même : la couleur de marque, sa version profonde
/// sous « Augmenter le contraste », le voile doux du différé, ou rien (le verre
/// teinté de K01 fait le fond sous Liquid Glass).
public nonisolated enum MeeshySplitActionFill: String, Sendable, Equatable, CaseIterable {
    case brand
    case brandDeep
    case softVeil
    case clear
}

/// Ce que K13 demande à K01 : aucune matière, ou un verre teinté de marque et
/// interactif (Liquid Glass seulement).
public nonisolated enum MeeshySplitActionGlassRequest: String, Sendable, Equatable, CaseIterable {
    case none
    case brand
}

/// Ce que la capsule montre : le libellé (et le chevron), l'anneau et le mot de
/// l'hôte, ou le glyphe d'état et le mot du différé.
public nonisolated enum MeeshySplitActionContent: String, Sendable, Equatable, CaseIterable {
    case label
    case ring
    case deferred
}

public nonisolated struct MeeshySplitActionShadow: Sendable, Equatable {
    public let opacity: Double
    public let radius: Double
    public let y: Double
}

// MARK: - La recette

/// **La recette de K13 en VALEURS** : toute mesure du bouton vit ici, nulle part
/// ailleurs. Un `View` ne s'inspecte pas, sa recette si.
public nonisolated struct MeeshySplitActionButtonRecipe: Equatable, Sendable {
    public let content: MeeshySplitActionContent
    public let height: Double
    public let labelSize: Double
    public let smallLabelSize: Double
    public let labelPaddingHorizontal: Double
    public let showsChevron: Bool
    public let showsRule: Bool
    public let showsRing: Bool
    public let ringDiameter: Double
    public let fill: MeeshySplitActionFill
    public let glass: MeeshySplitActionGlassRequest
    public let shadow: MeeshySplitActionShadow?
    public let opacity: Double
    public let ruleOpacity: Double
    public let pressVeilOpacity: Double
    public let hoverVeilOpacity: Double
    public let pressScale: Double
    public let fadeDuration: Double?
    public let labelRespondsToTouch: Bool
    public let ink: MeeshySplitActionInk
    public let fillsWidth: Bool

    // Mesures de la planche

    public static let regularHeight = MeeshyGlassButtonSize.s48.diameter
    public static let compactHeight = Double(MeeshyControlSize.tapTarget)
    public static let labelSize = Double(MeeshyFont.bodySize)
    public static let smallLabelSize = Double(MeeshyFont.subheadSize)
    public static let labelPaddingHorizontal = Double(MeeshySpacing.mdPlus)
    public static let labelPaddingVertical = Double(MeeshySpacing.sm)
    public static let chevronGlyph = Double(MeeshyIconSize.lg)
    public static let chevronMarginStart = Double(MeeshySpacing.smPlus)
    public static let chevronMarginEnd = Double(MeeshySpacing.md)
    /// Le chevron dessiné : le glyphe et ses deux marges.
    public static let chevronDrawn = chevronGlyph + chevronMarginStart + chevronMarginEnd
    public static let tapTarget = Double(MeeshyControlSize.tapTarget)
    /// Ce dont la cible déborde le chevron dessiné, vers la fin seulement.
    public static let chevronTargetSlack = max(0, tapTarget - chevronDrawn)
    public static let ruleWidth = Double(MeeshyBorder.regular)
    public static let ruleOpacity = 0.35
    public static let ruleOpacityHighContrast = 0.6
    public static let ringDiameter = Double(MeeshyControlSize.large)
    public static let ringMarginStart = Double(MeeshySpacing.xs)
    public static let ringGap = Double(MeeshySpacing.sm)
    public static let ringMarginEnd = Double(MeeshySpacing.lg)
    public static let deferredPadding = Double(MeeshySpacing.mdPlus)
    public static let deferredGap = Double(MeeshySpacing.xsPlus)
    public static let deferredGlyph = Double(MeeshyIconSize.md)
    public static let deferredLabelSize = Double(MeeshyFont.labelSize)
    public static let deferredVeilOpacity = MeeshyGlassButtonRecipe.softRestOpacity
    public static let disabledOpacity = MeeshyGlassButtonRecipe.disabledOpacity
    public static let pressVeilPressedOpacity = MeeshyGlassButtonRecipe.pressVeilPressedOpacity
    public static let pressVeilHoveredOpacity = MeeshyGlassButtonRecipe.pressVeilHoveredOpacity
    public static let contentFadeDuration = 0.2
    /// L'ombre de la planche (`0 6px 18px`, 45 %) : le rayon SwiftUI en est la moitié.
    public static let shadowBlur = 18.0
    public static let shadowOpacity = 0.45
    public static let shadowY = 6.0
    /// L'échelle de K01 pour une surface interactive pressée, lue à sa source.
    public static let pressScale = MeeshyGlassRecipe.resolve(
        tone: .deep, density: .regular, isTinted: true, isInteractive: true,
        isPressed: true, material: .drawn, reduceMotion: false
    ).scale

    public static func resolve(
        phase: MeeshySplitActionPhase = .ready,
        size: MeeshySplitActionSize = .regular,
        width: MeeshySplitActionWidth = .hug,
        isEnabled: Bool = true,
        hasChevron: Bool = true,
        material: MeeshyGlassMaterial = .drawn,
        tone: MeeshyGlassTone = .deep,
        increasedContrast: Bool = false,
        reduceMotion: Bool = false
    ) -> MeeshySplitActionButtonRecipe {
        let content = contentKind(of: phase)
        let isReady = content == .label
        let touches = isReady && isEnabled
        let liquid = material == .liquid
        let solid = solidFill(content: content, liquid: liquid, increasedContrast: increasedContrast)
        let glassed = content != .deferred && liquid
        return MeeshySplitActionButtonRecipe(
            content: content,
            height: size == .compact ? compactHeight : regularHeight,
            labelSize: labelSize,
            smallLabelSize: smallLabelSize,
            labelPaddingHorizontal: labelPaddingHorizontal,
            showsChevron: isReady && hasChevron,
            showsRule: isReady && hasChevron,
            showsRing: content == .ring,
            ringDiameter: ringDiameter,
            fill: solid,
            glass: glassed ? .brand : .none,
            shadow: (content == .deferred || !isEnabled) ? nil : brandShadow,
            opacity: (isReady && !isEnabled) ? disabledOpacity : 1,
            ruleOpacity: increasedContrast ? ruleOpacityHighContrast : ruleOpacity,
            pressVeilOpacity: (touches && !liquid) ? pressVeilPressedOpacity : 0,
            hoverVeilOpacity: (touches && !liquid) ? pressVeilHoveredOpacity : 0,
            pressScale: (liquid || reduceMotion) ? 1 : pressScale,
            fadeDuration: reduceMotion ? nil : contentFadeDuration,
            labelRespondsToTouch: touches,
            ink: content == .deferred ? (tone == .theme ? .themeInk : .onMedia) : .onBrand,
            fillsWidth: width == .fill
        )
    }

    private static let brandShadow = MeeshySplitActionShadow(opacity: shadowOpacity, radius: shadowBlur / 2, y: shadowY)

    static func contentKind(of phase: MeeshySplitActionPhase) -> MeeshySplitActionContent {
        switch phase {
        case .ready: return .label
        case .busy: return .ring
        case .deferred: return .deferred
        }
    }

    private static func solidFill(content: MeeshySplitActionContent, liquid: Bool, increasedContrast: Bool) -> MeeshySplitActionFill {
        if content == .deferred { return .softVeil }
        if liquid { return .clear }
        return increasedContrast ? .brandDeep : .brand
    }
}

/// L'encre du bouton : celle du fond de marque, celle du média (le voile doux du
/// différé) ou celle du thème.
public nonisolated enum MeeshySplitActionInk: String, Sendable, Equatable, CaseIterable {
    case onBrand
    case onMedia
    case themeInk
}

public nonisolated extension MeeshySplitActionButtonRecipe {
    func fillColor() -> Color {
        switch fill {
        case .brand: return MeeshyColors.brandPrimary
        case .brandDeep: return MeeshyColors.brandDeep
        case .softVeil: return MeeshyColors.onMedia.opacity(Self.deferredVeilOpacity)
        case .clear: return .clear
        }
    }

    /// La teinte demandée à K01 sous Liquid Glass : la même que le fond plein.
    func glassTint(increasedContrast: Bool) -> Color {
        increasedContrast ? MeeshyColors.brandDeep : MeeshyColors.brandPrimary
    }

    func inkColor(isDark: Bool) -> Color {
        switch ink {
        case .onBrand: return MeeshyColors.onBrand
        case .onMedia: return MeeshyColors.onMedia
        case .themeInk: return MeeshyColors.textPrimary(isDark: isDark)
        }
    }

    /// Le contraste WCAG de l'encre contre le fond plein de marque, `nil` quand
    /// le fond n'est pas plein.
    func solidContrast() -> Double? {
        guard fill == .brand || fill == .brandDeep else { return nil }
        return CanvasChromeScheme.contrastRatio(
            Double(MeeshyColors.onBrand.luminance), Double(fillColor().luminance)
        )
    }
}

// MARK: - La loi du libellé

/// Les largeurs que la loi lit : le titre à sa taille, à `subheadSize`, son mot le
/// plus long à `subheadSize`, puis le titre court (s'il y en a un) aux deux tailles.
public nonisolated struct MeeshySplitActionLabelWidths: Sendable, Equatable {
    public let title: Double
    public let titleSmall: Double
    public let titleLongestWordSmall: Double
    public let shortTitle: Double?
    public let shortTitleSmall: Double?

    public init(
        title: Double,
        titleSmall: Double,
        titleLongestWordSmall: Double,
        shortTitle: Double? = nil,
        shortTitleSmall: Double? = nil
    ) {
        self.title = title
        self.titleSmall = titleSmall
        self.titleLongestWordSmall = titleLongestWordSmall
        self.shortTitle = shortTitle
        self.shortTitleSmall = shortTitleSmall
    }
}

/// Les six marches de la loi du libellé, dans l'ordre où on les essaie.
public nonisolated enum MeeshySplitActionLabelStep: String, Sendable, Equatable, CaseIterable {
    case title
    case titleSmall
    case titleSmallWrapped
    case shortTitle
    case shortTitleSmall
    case glyphOnly
}

/// **La loi du libellé** : `title` sur une ligne ; `title` à 13 ; `title` à 13 sur
/// `maxLines` lignes si `maxLines` > 1 ; `shortTitle` ; `shortTitle` à 13 ; le glyphe
/// seul. Jamais un mot coupé : le retour à la ligne exige que le mot le plus long
/// tienne dans la place.
public nonisolated enum MeeshySplitActionLabelFit {
    /// Ce qu'un retour à la ligne perd à la coupe : le titre doit tenir dans
    /// 90 % de `maxLines` fois la place.
    public static let wrapEfficiency = 0.9

    /// L'ordre des marches que la vue essaie, sans celles que l'hôte n'offre pas.
    public static func steps(hasShortTitle: Bool, maxLines: Int) -> [MeeshySplitActionLabelStep] {
        var steps: [MeeshySplitActionLabelStep] = [.title, .titleSmall]
        if maxLines > 1 { steps.append(.titleSmallWrapped) }
        if hasShortTitle { steps += [.shortTitle, .shortTitleSmall] }
        return steps + [.glyphOnly]
    }

    public static func resolve(widths: MeeshySplitActionLabelWidths, room: Double, maxLines: Int) -> MeeshySplitActionLabelStep {
        let lines = max(1, maxLines)
        if widths.title <= room { return .title }
        if widths.titleSmall <= room { return .titleSmall }
        if lines > 1, wrappedWidth(widths: widths, maxLines: lines) <= room { return .titleSmallWrapped }
        if let short = widths.shortTitle, short <= room { return .shortTitle }
        if let small = widths.shortTitleSmall, small <= room { return .shortTitleSmall }
        return .glyphOnly
    }

    /// La place qu'il faut au titre replié : son mot le plus long, ou sa largeur
    /// à 13 répartie sur les lignes permises.
    public static func wrappedWidth(widths: MeeshySplitActionLabelWidths, maxLines: Int) -> Double {
        let lines = Double(max(1, maxLines))
        return max(widths.titleLongestWordSmall, (widths.titleSmall / (lines * wrapEfficiency)).rounded(.up))
    }
}

// MARK: - Ce que le lecteur d'écran entend

/// Les mots de K13. La valeur dite en cours est celle de K09 précédée du mot de
/// l'hôte : « Publication…, 62 % ». Le nom ne change jamais.
public enum MeeshySplitActionWords {
    public static func busyValue(title: String, percent: Int?, locale: Locale = .current) -> String {
        let spoken = MeeshyProgressRingWords.spokenValue(percent: percent, valueText: nil, locale: locale)
        return [title, spoken].filter { !$0.isEmpty }.joined(separator: separator(locale: locale))
    }

    /// La virgule de la langue : « , » ou « ، » en arabe.
    public static func separator(locale: Locale) -> String {
        locale.language.languageCode?.identifier == "ar" ? "\u{060C} " : ", "
    }

    /// Le nom dit : celui que l'hôte donne, sinon le libellé visible.
    public static func spokenName(label: String?, title: String) -> String {
        guard let label, !label.isEmpty else { return title }
        return label
    }
}

// MARK: - L'activation

/// Ce qui se passe quand un segment est touché : le libellé joue l'action, le
/// chevron joue le choix, et jamais l'un pour l'autre. Une loi pure, testée sans
/// écran. Un libellé retenu ne joue ni action ni haptique : l'hôte dit la raison.
/// Le chevron garde son propre `isEnabled`.
enum MeeshySplitActionTrigger {
    @discardableResult
    static func pressLabel(
        isEnabled: Bool,
        haptic: MeeshyGlassButtonHaptic,
        play: @MainActor (MeeshyGlassButtonHaptic) -> Void = MeeshyGlassButtonTrigger.playSystemHaptic,
        action: () -> Void,
        onDisabledPress: (() -> Void)?
    ) -> Bool {
        guard isEnabled else {
            onDisabledPress?()
            return false
        }
        return MeeshyGlassButtonTrigger.perform(isEnabled: true, haptic: haptic, play: play, action: action)
    }

    @discardableResult
    static func pressChevron(
        choose: MeeshySplitActionChoose,
        haptic: MeeshyGlassButtonHaptic,
        play: @MainActor (MeeshyGlassButtonHaptic) -> Void = MeeshyGlassButtonTrigger.playSystemHaptic
    ) -> Bool {
        MeeshyGlassButtonTrigger.perform(isEnabled: choose.isEnabled, haptic: haptic, play: play, action: choose.action)
    }
}
