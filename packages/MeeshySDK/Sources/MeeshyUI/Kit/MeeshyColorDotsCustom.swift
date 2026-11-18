import SwiftUI

/// **Les évolutions de K07 que demande le profil, en VALEURS** : la pastille « autre
/// couleur » (un spectre et une pipette, qui délègue au sélecteur de couleur du
/// système) et la variante `swatch` (l'échantillon est une vignette d'aperçu que
/// l'hôte peint : bannière et avatar).
public nonisolated struct MeeshyColorDotsCustomRecipe: Sendable, Equatable {
    /// Le glyphe de la pastille « autre couleur ».
    public static let glyph = "eyedropper"
    /// Le puits de couleur du système mesure 28 : on l'agrandit jusqu'à la cellule de 44.
    public static let systemWellDiameter: Double = 28
    /// Les teintes du spectre, de rouge à rouge, en septièmes de tour.
    public static let hueStops: [Double] = [0, 1.0 / 6, 2.0 / 6, 3.0 / 6, 4.0 / 6, 5.0 / 6, 1]
    public static let spectrumSaturation: Double = 0.75
    public static let spectrumBrightness: Double = 0.95

    /// Une vignette : 64 × 44, coins de 12 ; la courante se cerne de 2,5 à 3 du bord.
    public static let swatchWidth: Double = 64
    public static let swatchHeight: Double = 44
    public static let swatchCornerRadius: Double = 12
    public static let swatchRingGap: Double = 3
    public static let swatchRingWidth: Double = 2.5
    public static let swatchSpacing: Double = 8

    /// L'agrandissement du puits du système pour qu'il couvre toute la cellule.
    public static func pickerScale(cell: Double) -> Double {
        guard cell.isFinite, cell > 0 else { return 1 }
        return cell / systemWellDiameter
    }

    /// Le spectre de la pastille « autre couleur ».
    public static var spectrum: [Color] {
        hueStops.map { Color(hue: $0, saturation: spectrumSaturation, brightness: spectrumBrightness) }
    }

    /// La pastille « autre couleur » telle que le disque du kit la dessine.
    public static func dot(name: String) -> MeeshyColorDot {
        MeeshyColorDot(id: "kit.color_dots.custom", fill: .gradient(spectrum), name: name, systemImage: glyph)
    }

    /// Le rayon du cercle de la courante autour d'une vignette.
    public static var swatchRingCornerRadius: Double {
        swatchCornerRadius + swatchRingGap + swatchRingWidth
    }
}

/// **La pastille « autre couleur » (K07)** : posée dans l'emplacement `trailing` d'un
/// groupe de pastilles, elle ouvre le sélecteur de couleur du système. Le disque du
/// kit (spectre, pipette, cercle de la courante) se dessine par-dessus le puits du
/// système, qui reçoit le toucher et porte le nom pour le lecteur d'écran.
public struct MeeshyColorDotCustom: View {
    private let label: String
    @Binding private var color: Color
    private let isSelected: Bool
    private let size: MeeshyColorDotSize
    private let tone: MeeshyGlassTone?

    @Environment(\.meeshyGlassTone) private var hostTone
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(_ label: String,
                color: Binding<Color>,
                isSelected: Bool = false,
                size: MeeshyColorDotSize = .s28,
                tone: MeeshyGlassTone? = nil) {
        self.label = label
        _color = color
        self.isSelected = isSelected
        self.size = size
        self.tone = tone
    }

    public var body: some View {
        let recipe = MeeshyColorDotsRecipe.resolve(count: 1, available: .infinity, size: size, layout: .row,
                                                   tone: tone ?? hostTone)
        ZStack {
            ColorPicker(label, selection: $color, supportsOpacity: false)
                .labelsHidden()
                .scaleEffect(CGFloat(MeeshyColorDotsCustomRecipe.pickerScale(cell: recipe.cell)))
                .accessibilityAddTraits(isSelected ? .isSelected : [])
            MeeshyColorDotDisc(dot: MeeshyColorDotsCustomRecipe.dot(name: label), size: size, isSelected: isSelected,
                               isPressed: false, isHovered: false, ink: recipe.inkColor(isDark: colorScheme == .dark),
                               reduceMotion: reduceMotion)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
        .frame(width: CGFloat(recipe.cell), height: CGFloat(recipe.cell))
    }
}

/// **K07 `swatch`** : un choix unique parmi des vignettes d'aperçu que l'hôte peint
/// (la bannière et l'avatar dans la teinte), au lieu de disques unis. La courante se
/// cerne ; chaque vignette est un bouton nommé, sélectionné pour la courante.
public struct MeeshyColorSwatches<Swatch: View>: View {
    private let dots: [MeeshyColorDot]
    private let selection: String?
    private let label: String
    private let tone: MeeshyGlassTone?
    private let haptic: MeeshyColorDotHaptic
    private let onSelect: (String) -> Void
    private let swatch: (MeeshyColorDot) -> Swatch

    @Environment(\.meeshyGlassTone) private var hostTone
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.isEnabled) private var isEnabled

    public init(_ dots: [MeeshyColorDot],
                selection: String? = nil,
                label: String,
                tone: MeeshyGlassTone? = nil,
                haptic: MeeshyColorDotHaptic = .light,
                onSelect: @escaping (String) -> Void,
                @ViewBuilder swatch: @escaping (MeeshyColorDot) -> Swatch) {
        self.dots = dots
        self.selection = selection
        self.label = label
        self.tone = tone
        self.haptic = haptic
        self.onSelect = onSelect
        self.swatch = swatch
    }

    @ViewBuilder
    public var body: some View {
        if !dots.isEmpty {
            HStack(spacing: CGFloat(MeeshyColorDotsCustomRecipe.swatchSpacing)) {
                ForEach(Array(dots.enumerated()), id: \.element.id) { index, dot in
                    tile(dot, index: index)
                }
            }
            .padding(CGFloat(MeeshyColorDotsCustomRecipe.swatchRingGap + MeeshyColorDotsCustomRecipe.swatchRingWidth))
            .opacity(isEnabled ? 1 : MeeshyColorDotsRecipe.disabledOpacity)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(label)
        }
    }

    private func tile(_ dot: MeeshyColorDot, index: Int) -> some View {
        let isSelected = MeeshyColorDotsRecipe.isCurrent(dot.id, selection: selection)
        let ink = MeeshyColorDotsRecipe.resolve(count: 1, available: .infinity, size: .s28, layout: .row,
                                                tone: tone ?? hostTone).inkColor(isDark: colorScheme == .dark)
        let gap = CGFloat(MeeshyColorDotsCustomRecipe.swatchRingGap + MeeshyColorDotsCustomRecipe.swatchRingWidth)
        return Button {
            MeeshyGlassButtonTrigger.perform(isEnabled: isEnabled, haptic: haptic) { onSelect(dot.id) }
        } label: {
            swatch(dot)
                .frame(width: CGFloat(MeeshyColorDotsCustomRecipe.swatchWidth),
                       height: CGFloat(MeeshyColorDotsCustomRecipe.swatchHeight))
                .clipShape(RoundedRectangle(cornerRadius: CGFloat(MeeshyColorDotsCustomRecipe.swatchCornerRadius),
                                            style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: CGFloat(MeeshyColorDotsCustomRecipe.swatchRingCornerRadius),
                                     style: .continuous)
                        .strokeBorder(ink, lineWidth: CGFloat(MeeshyColorDotsCustomRecipe.swatchRingWidth))
                        .padding(-gap)
                        .opacity(isSelected ? 1 : 0)
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(MeeshyColorDotsWords.spokenName(of: dot, index: index, total: dots.count))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}
