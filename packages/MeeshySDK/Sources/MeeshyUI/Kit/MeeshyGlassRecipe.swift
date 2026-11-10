import Foundation

/// La matière d'un verre. Elle se déduit de l'appareil et ne se passe jamais :
/// `MeeshyGlassMaterial.resolve` est interne, et les seuls forçages sont ceux de
/// debug (`MeeshyGlassDebug`).
///
/// Liquid Glass l'emporte toujours quand il existe : sous « réduire la
/// transparence », iOS 26 givre lui-même son verre (comme `adaptiveGlass` le
/// laisse faire), et seul le verre DESSINÉ cède la place au fond plein.
public nonisolated enum MeeshyGlassMaterial: Sendable, Equatable {
    /// Le Liquid Glass du système (iOS 26+).
    case liquid
    /// Le verre dessiné : flou, reflet, liseré, ombre.
    case drawn
    /// Le fond plein de « réduire la transparence » : ni flou ni reflet.
    case opaque

    static func resolve(
        isLiquidAvailable: Bool,
        reduceTransparency: Bool,
        forcesDrawn: Bool,
        forcesOpaque: Bool = false
    ) -> MeeshyGlassMaterial {
        if forcesOpaque { return .opaque }
        if isLiquidAvailable && !forcesDrawn { return .liquid }
        return reduceTransparency ? .opaque : .drawn
    }
}

/// Ce qui remplit le verre au-dessus du flou.
public nonisolated enum MeeshyGlassFill: Sendable, Equatable {
    case clear
    case light
    case dark
    case system
}

/// La recette d'un verre en VALEURS : un `ViewModifier` ne s'inspecte pas, sa
/// recette si. Le ton `theme` redonne à l'identique celle de
/// `LiquidGlassFallbackRecipe` ; les trois autres suivent la planche.
public nonisolated struct MeeshyGlassRecipe: Equatable, Sendable {
    public let material: MeeshyGlassMaterial
    public let fill: MeeshyGlassFill
    public let fillOpacity: Double
    /// Parité avec la planche (24) : iOS rend le flou par le matériau système.
    public let blurRadius: Double
    public let saturation: Double
    public let tintWash: Double
    public let sheen: Double
    public let topLight: Double
    public let rimLit: Double
    public let rimShade: Double
    public let rimTail: Double
    public let shadowOpacity: Double
    public let shadowRadius: Double
    public let shadowY: Double
    public let scale: Double

    public var blursBackdrop: Bool { blurRadius > 0 }

    /// Le fondu de la teinte quand le ton change (immédiat sous « réduire les
    /// animations », que `meeshyAnimation` applique).
    public static let toneFadeDuration = GlassMeasure.toneFadeDuration

    /// `isNested` : la surface est posée DANS un verre dessiné du kit. Elle ne
    /// porte alors aucune seconde matière (ni flou, ni fond, ni reflet, ni
    /// liseré, ni ombre) et garde sa réponse au toucher. Le ton `theme`, renvoi
    /// des sites existants, n'est pas concerné. `isHovered` : pointeur au-dessus
    /// (iPad), reflet intermédiaire sans échelle.
    public static func resolve(
        tone: MeeshyGlassTone,
        density: MeeshyGlassDensity,
        isTinted: Bool,
        isInteractive: Bool,
        isPressed: Bool,
        material: MeeshyGlassMaterial,
        reduceMotion: Bool,
        isDark: Bool = false,
        isNested: Bool = false,
        isHovered: Bool = false
    ) -> MeeshyGlassRecipe {
        let rest = restRecipe(
            tone: tone, density: density, isTinted: isTinted, material: material,
            isDark: isDark, isNested: isNested
        )
        guard isInteractive else { return rest }
        if isPressed { return rest.pressed(reduceMotion: reduceMotion) }
        return isHovered ? rest.hovered() : rest
    }
}

public nonisolated extension MeeshyGlassRecipe {
    /// Le Liquid Glass du système ne se fonce pas de lui-même : sur un contenu
    /// clair, l'encre blanche d'un verre `onLight` y tombait vers 1,5:1. Ce ton
    /// y pose donc le voile sombre de la planche (#17413) ; les autres tons
    /// laissent le système faire. Une teinte explicite de l'appelant l'emporte.
    static func liquidWash(tone: MeeshyGlassTone) -> Double? {
        tone == .onLight ? GlassMeasure.onLightFill : nil
    }
}

// MARK: - Mesures de la planche

private nonisolated enum GlassMeasure {
    static let blurRadius = 24.0
    static let saturation = 1.8
    static let topLight = 0.38
    static let plainFill = 0.14
    static let deepFill = 0.46
    static let denseFill = 0.66
    static let onLightFill = 0.62
    static let plainRim = 0.24
    static let rim = 0.2
    static let opaqueRim = 0.18
    static let shadowOpacity = 0.28
    static let shadowRadius = 14.0
    static let shadowY = 10.0
    static let pressScale = 1.04
    static let pressSheenFactor = 2.0
    static let hoverSheenFactor = 1.5
    static let toneFadeDuration = 0.2
}

private nonisolated extension MeeshyGlassRecipe {

    static func restRecipe(
        tone: MeeshyGlassTone,
        density: MeeshyGlassDensity,
        isTinted: Bool,
        material: MeeshyGlassMaterial,
        isDark: Bool,
        isNested: Bool
    ) -> MeeshyGlassRecipe {
        let legacy = LiquidGlassFallbackRecipe.resolve(isDark: isDark, isTinted: isTinted)
        if isNested, material != .liquid, tone != .theme {
            return nested(material: material, tintWash: legacy.tintWash)
        }
        switch material {
        case .liquid: return systemOwned
        case .opaque: return opaque(tone: tone, tintWash: legacy.tintWash)
        case .drawn: return tone == .theme ? theme(legacy) : toned(tone: tone, density: density, tintWash: legacy.tintWash)
        }
    }

    /// Le verre du système dessine tout : la recette n'a rien à dire.
    static let systemOwned = MeeshyGlassRecipe(
        material: .liquid, fill: .clear, fillOpacity: 0, blurRadius: 0, saturation: 1, tintWash: 0,
        sheen: 0, topLight: 0, rimLit: 0, rimShade: 0, rimTail: 0,
        shadowOpacity: 0, shadowRadius: 0, shadowY: 0, scale: 1
    )

    static func theme(_ legacy: LiquidGlassFallbackRecipe) -> MeeshyGlassRecipe {
        MeeshyGlassRecipe(
            material: .drawn, fill: .clear, fillOpacity: 0,
            blurRadius: GlassMeasure.blurRadius, saturation: GlassMeasure.saturation,
            tintWash: legacy.tintWash, sheen: legacy.sheen, topLight: 0,
            rimLit: legacy.rimLit, rimShade: legacy.rimShade, rimTail: legacy.rimLit * 0.5,
            shadowOpacity: legacy.shadowOpacity, shadowRadius: Double(legacy.shadowRadius), shadowY: 6, scale: 1
        )
    }

    static func toned(tone: MeeshyGlassTone, density: MeeshyGlassDensity, tintWash: Double) -> MeeshyGlassRecipe {
        let rim = tone == .plain ? GlassMeasure.plainRim : GlassMeasure.rim
        return MeeshyGlassRecipe(
            material: .drawn, fill: tone == .plain ? .light : .dark,
            fillOpacity: fillOpacity(tone: tone, density: density),
            blurRadius: GlassMeasure.blurRadius, saturation: GlassMeasure.saturation,
            tintWash: tintWash, sheen: 0, topLight: GlassMeasure.topLight,
            rimLit: rim, rimShade: rim, rimTail: rim,
            shadowOpacity: GlassMeasure.shadowOpacity, shadowRadius: GlassMeasure.shadowRadius,
            shadowY: GlassMeasure.shadowY, scale: 1
        )
    }

    static func fillOpacity(tone: MeeshyGlassTone, density: MeeshyGlassDensity) -> Double {
        switch tone {
        case .plain: return GlassMeasure.plainFill
        case .deep: return density == .dense ? GlassMeasure.denseFill : GlassMeasure.deepFill
        case .onLight, .theme: return GlassMeasure.onLightFill
        }
    }

    static func opaque(tone: MeeshyGlassTone, tintWash: Double) -> MeeshyGlassRecipe {
        MeeshyGlassRecipe(
            material: .opaque, fill: tone == .theme ? .system : .dark, fillOpacity: 1,
            blurRadius: 0, saturation: 1, tintWash: tintWash, sheen: 0, topLight: 0,
            rimLit: GlassMeasure.opaqueRim, rimShade: GlassMeasure.opaqueRim, rimTail: GlassMeasure.opaqueRim,
            shadowOpacity: 0, shadowRadius: 0, shadowY: 0, scale: 1
        )
    }

    /// Une surface posée dans un verre dessiné : la matière est celle de
    /// l'hôte, seule la teinte (état enclenché) et la réponse au toucher restent.
    static func nested(material: MeeshyGlassMaterial, tintWash: Double) -> MeeshyGlassRecipe {
        MeeshyGlassRecipe(
            material: material, fill: .clear, fillOpacity: 0, blurRadius: 0, saturation: 1,
            tintWash: tintWash, sheen: 0, topLight: 0, rimLit: 0, rimShade: 0, rimTail: 0,
            shadowOpacity: 0, shadowRadius: 0, shadowY: 0, scale: 1
        )
    }

    /// Le survol au pointeur : le reflet s'éclaire à mi-chemin de l'appui, sans
    /// échelle. Rien en opaque ni sous le verre du système.
    func hovered() -> MeeshyGlassRecipe {
        guard material == .drawn else { return self }
        return MeeshyGlassRecipe(
            material: material, fill: fill, fillOpacity: fillOpacity,
            blurRadius: blurRadius, saturation: saturation, tintWash: tintWash,
            sheen: min(1, sheen * GlassMeasure.hoverSheenFactor),
            topLight: min(1, topLight * GlassMeasure.hoverSheenFactor),
            rimLit: rimLit, rimShade: rimShade, rimTail: rimTail,
            shadowOpacity: shadowOpacity, shadowRadius: shadowRadius, shadowY: shadowY,
            scale: 1
        )
    }

    /// La réponse dessinée : la surface grandit, son reflet double. Sans flou ni
    /// reflet en opaque, seule l'échelle répond. Sous « réduire les animations »,
    /// l'échelle reste à 1 ; sur iOS 26 le système répond, la recette ne bouge pas.
    func pressed(reduceMotion: Bool) -> MeeshyGlassRecipe {
        guard material != .liquid else { return self }
        let glows = material == .drawn
        return MeeshyGlassRecipe(
            material: material, fill: fill, fillOpacity: fillOpacity,
            blurRadius: blurRadius, saturation: saturation, tintWash: tintWash,
            sheen: glows ? min(1, sheen * GlassMeasure.pressSheenFactor) : sheen,
            topLight: glows ? min(1, topLight * GlassMeasure.pressSheenFactor) : topLight,
            rimLit: rimLit, rimShade: rimShade, rimTail: rimTail,
            shadowOpacity: shadowOpacity, shadowRadius: shadowRadius, shadowY: shadowY,
            scale: reduceMotion ? 1 : GlassMeasure.pressScale
        )
    }
}
