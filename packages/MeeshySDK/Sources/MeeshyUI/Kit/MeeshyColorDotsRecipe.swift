import SwiftUI

/// L'encre d'un groupe de pastilles : celle du média, ou celle du thème quand
/// l'hôte pose le ton `theme` (listes, réglages hors média).
public nonisolated enum MeeshyColorDotsInk: String, Sendable, Equatable, CaseIterable {
    case onMedia
    case themeInk
}

/// **La recette de K07 en VALEURS** : toute mesure du groupe vit ici, nulle part
/// ailleurs. Un `View` ne s'inspecte pas, sa recette si.
///
/// - Le disque est centré dans sa cellule de 44 pt ; le premier disque s'aligne
///   au bord du contenu, la cible déborde de `inset` ; l'encombrement est celui
///   des disques.
/// - Par ligne : ⌊(largeur + cellule − diamètre) / cellule⌋, au moins 1.
/// - La courante : `ringGap` de vide puis un cercle de `ringWidth`, hors du disque.
public nonisolated struct MeeshyColorDotsRecipe: Sendable, Equatable {
    /// Le filet intérieur au repos (planche : 1 px blanc 25 %).
    public static let hairlineOpacity: Double = 0.25
    /// Le filet au survol du pointeur et sous « Augmenter le contraste ».
    public static let hairlineEmphasisOpacity: Double = 0.6
    /// Le pré-cercle au doigt posé, avant le choix.
    public static let pressedRingOpacity: Double = MeeshyOpacity.strong
    /// Le contenu désactivé.
    public static let disabledOpacity: Double = 0.4
    /// L'échelle d'où paraît le cercle d'une nouvelle courante.
    public static let ringEnterScale: Double = 0.8
    /// Où commence l'estompe du bord de fin d'une ligne qui défile (`.fade`).
    public static let fadeStart: Double = 0.82
    /// Le contraste minimal d'un glyphe posé dans un disque.
    public static let glyphMinContrast: Double = 4.0
    /// Le glyphe occupe cette part du diamètre.
    public static let glyphScale: Double = 0.45

    public let diameter: Double
    public let cell: Double
    /// Le débord de la cible au-delà du disque, de chaque côté.
    public let inset: Double
    public let ringGap: Double
    public let ringWidth: Double
    /// Le diamètre extérieur du cercle de la courante.
    public let ringDiameter: Double
    /// Le nombre de cellules par ligne (toutes en `row`).
    public let perRow: Int
    /// Le nombre de cellules de chaque ligne.
    public let rows: [Int]
    /// Vrai quand la ligne `row` déborde : elle défile et s'estompe au bord de fin.
    public let scrolls: Bool
    public let ink: MeeshyColorDotsInk

    public static func resolve(count: Int,
                               available: Double,
                               size: MeeshyColorDotSize,
                               layout: MeeshyColorDotsLayout,
                               tone: MeeshyGlassTone = .deep) -> MeeshyColorDotsRecipe {
        let diameter = size.diameter
        let cell = size.cell
        let perRow = columns(count: count, available: available, diameter: diameter, cell: cell, layout: layout)
        let rows = count > 0 ? Self.split(count: count, perRow: perRow) : []
        let ringGap = Double(MeeshySpacing.xxs)
        let ringWidth = Double(MeeshyBorder.strong)
        return MeeshyColorDotsRecipe(
            diameter: diameter,
            cell: cell,
            inset: (cell - diameter) / 2,
            ringGap: ringGap,
            ringWidth: ringWidth,
            ringDiameter: diameter + 2 * (ringGap + ringWidth),
            perRow: perRow,
            rows: rows,
            scrolls: layout == .row && count > 0 && extent(cells: count, diameter: diameter, cell: cell) > available,
            ink: tone == .theme ? .themeInk : .onMedia
        )
    }

    /// L'encombrement de `cells` cellules jointives : celui de leurs disques.
    public static func extent(cells: Int, diameter: Double, cell: Double) -> Double {
        cells > 0 ? Double(cells) * cell - (cell - diameter) : 0
    }

    /// La taille que le groupe occupe : la largeur de la ligne la plus longue,
    /// la hauteur de ses lignes, mesurées aux disques.
    public var size: CGSize {
        CGSize(
            width: Self.extent(cells: rows.max() ?? 0, diameter: diameter, cell: cell),
            height: Self.extent(cells: rows.count, diameter: diameter, cell: cell)
        )
    }

    /// L'origine de la cellule `index`, depuis le coin du contenu : la cible
    /// déborde de `inset` avant le premier disque.
    public func cellOrigin(index: Int) -> CGPoint {
        let column = perRow > 0 ? index % perRow : 0
        let row = perRow > 0 ? index / perRow : 0
        return CGPoint(x: Double(column) * cell - inset, y: Double(row) * cell - inset)
    }

    public func inkColor(isDark: Bool) -> Color {
        switch ink {
        case .onMedia: return MeeshyColors.onMedia
        case .themeInk: return MeeshyColors.textPrimary(isDark: isDark)
        }
    }

    /// Le filet intérieur : 25 % au repos, 60 % au survol ou en contraste accru.
    public static func hairline(isHovered: Bool, increasedContrast: Bool) -> Double {
        isHovered || increasedContrast ? hairlineEmphasisOpacity : hairlineOpacity
    }

    /// La courante : la seule pastille dont l'`id` est `selection` ; aucune pour
    /// `nil` ou un `id` absent de la liste.
    public static func isCurrent(_ id: String, selection: String?) -> Bool {
        selection.map { $0 == id } ?? false
    }

    /// Le cercle : plein sur la courante, à 50 % sous le doigt, absent sinon.
    public static func ringOpacity(isSelected: Bool, isPressed: Bool) -> Double {
        isSelected ? 1 : (isPressed ? pressedRingOpacity : 0)
    }

    /// L'échelle du cercle seul : 1 dès qu'il se voit, 0,8 d'où il paraît.
    public static func ringScale(isSelected: Bool, isPressed: Bool) -> Double {
        isSelected || isPressed ? 1 : ringEnterScale
    }

    /// Le ressort du cercle ; aucun sous « réduire les animations ».
    @MainActor
    public static func ringAnimation(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : MeeshyAnimation.springFast
    }

    /// L'encre du glyphe : la plus contrastée du blanc et de l'indigo le plus
    /// sombre contre le disque (le pire arrêt d'un dégradé) ; l'encre du groupe
    /// sur un disque creux.
    public static func glyphFont(diameter: Double) -> Font {
        Font.system(size: CGFloat(diameter * glyphScale), weight: .semibold)
    }

    public static func glyphInk(on fill: MeeshyColorDotFill, groupInk: Color) -> Color {
        let stops: [Color]
        switch fill {
        case .solid(let color): stops = [color]
        case .gradient(let colors): stops = colors
        case .hollow: return groupInk
        }
        guard !stops.isEmpty else { return groupInk }
        let light = worstContrast(of: MeeshyColors.onMedia, on: stops)
        let dark = worstContrast(of: MeeshyColors.indigo950, on: stops)
        return light >= dark ? MeeshyColors.onMedia : MeeshyColors.indigo950
    }

    /// Le contraste WCAG le plus faible d'une encre sur des arrêts de couleur.
    public static func worstContrast(of ink: Color, on stops: [Color]) -> Double {
        let inkLuminance = Double(ink.luminance)
        return stops
            .map { CanvasChromeScheme.contrastRatio(inkLuminance, Double($0.luminance)) }
            .min() ?? 0
    }

    private static func columns(count: Int, available: Double, diameter: Double, cell: Double,
                                layout: MeeshyColorDotsLayout) -> Int {
        guard count > 0 else { return 0 }
        guard layout == .wrap, available.isFinite else { return count }
        let fitting = Int(((max(0, available) + cell - diameter) / cell).rounded(.down))
        return min(count, max(1, fitting))
    }

    private static func split(count: Int, perRow: Int) -> [Int] {
        let full = Array(repeating: perRow, count: count / perRow)
        let rest = count % perRow
        return rest > 0 ? full + [rest] : full
    }
}

/// Les mots du kit : le nom d'une pastille sans nom, par sa position.
/// Isolé au fil principal comme `Bundle.module`, que SPM génère sans annotation.
public enum MeeshyColorDotsWords {

    /// « Couleur 3 sur 17 », nombres dans les chiffres du lecteur ; jamais le
    /// code de la couleur. `bundle` choisit la table, `locale` ses règles.
    public static func position(index: Int,
                                total: Int,
                                bundle: Bundle? = nil,
                                locale: Locale = .current) -> String {
        let position = IntegerFormatStyle<Int>(locale: locale).format(index + 1)
        let count = IntegerFormatStyle<Int>(locale: locale).format(total)
        return String(
            localized: "kit.color_dots.position",
            defaultValue: "Couleur \(position) sur \(count)",
            bundle: bundle ?? .module,
            locale: locale
        )
    }

    /// Le nom dit d'une pastille : le sien s'il n'est pas vide, sinon sa position.
    public static func spokenName(of dot: MeeshyColorDot,
                                  index: Int,
                                  total: Int,
                                  bundle: Bundle? = nil,
                                  locale: Locale = .current) -> String {
        if let name = dot.name, !name.isEmpty { return name }
        return position(index: index, total: total, bundle: bundle, locale: locale)
    }
}
