import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// **Les deux cibles du glisser** (K25) : la duplication en haut, la poubelle
/// en bas. Pendant un glisser, deux disques de verre apparaissent ; celui que
/// le doigt survole grossit (la poubelle rougit), un `medium` marque l'entrée,
/// et lâcher dessus appelle l'hôte.
///
/// Le composant ne connaît que des rectangles, un point de doigt (par
/// `MeeshyDragTargetsState`) et deux rappels : il sert hors du composer, sur
/// toute surface où l'on glisse un élément. Il ne prend AUCUN toucher, ne porte
/// aucune légende, et ne dessine une cible que si son rappel est passé.
///
/// - `topSlot`, `bottomSlot` : les rectangles laissés par l'en-tête et par la
///   pilule, dans l'espace de la vue ; `nil` : à `MeeshySpacing.lg` des bords sûrs ;
/// - `labels` : les quatre noms accessibles, traduits par l'hôte ;
/// - `tone` : celui de l'hôte par défaut ; `haptic: .none` laisse l'hôte jouer le sien.
///
/// Les rappels sont relus à chaque ouverture des cibles.
public struct MeeshyDragTargets<DuplicateGlyph: View, RemoveGlyph: View>: View {
    @ObservedObject private var state: MeeshyDragTargetsState
    private let topSlot: CGRect?
    private let bottomSlot: CGRect?
    private let labels: MeeshyDragTargetsLabels
    private let tone: MeeshyGlassTone?
    private let haptic: MeeshyDragTargetsHaptic
    private let duplicateGlyph: DuplicateGlyph
    private let removeGlyph: RemoveGlyph
    private let onDuplicate: (() -> Void)?
    private let onRemove: (() -> Void)?

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userReduceMotion

    public init(
        state: MeeshyDragTargetsState,
        topSlot: CGRect? = nil,
        bottomSlot: CGRect? = nil,
        labels: MeeshyDragTargetsLabels,
        tone: MeeshyGlassTone? = nil,
        haptic: MeeshyDragTargetsHaptic = .medium,
        @ViewBuilder duplicateGlyph: () -> DuplicateGlyph,
        @ViewBuilder removeGlyph: () -> RemoveGlyph,
        onDuplicate: (() -> Void)? = nil,
        onRemove: (() -> Void)? = nil
    ) {
        self.state = state
        self.topSlot = topSlot
        self.bottomSlot = bottomSlot
        self.labels = labels
        self.tone = tone
        self.haptic = haptic
        self.duplicateGlyph = duplicateGlyph()
        self.removeGlyph = removeGlyph()
        self.onDuplicate = onDuplicate
        self.onRemove = onRemove
    }

    public var body: some View {
        let reduce = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userReduceMotion)
        ZStack {
            if state.isActive {
                MeeshyDragTargetsLayer(
                    state: state,
                    hovered: state.hovered,
                    topSlot: topSlot,
                    bottomSlot: bottomSlot,
                    labels: labels,
                    tone: tone,
                    duplicateGlyph: onDuplicate == nil ? nil : duplicateGlyph,
                    removeGlyph: onRemove == nil ? nil : removeGlyph,
                    reduceMotion: reduce
                )
                .transition(Self.transition(reduceMotion: reduce))
                .onAppear(perform: bindHandlers)
            }
        }
        .animation(MeeshyDragTargetsRecipe.presence(appearing: state.isActive), value: state.isActive)
        .allowsHitTesting(false)
        .onAppear(perform: bindHandlers)
        .adaptiveOnChange(of: state.hovered) { _, target in
            guard let target else { return }
            MeeshyDragTargetsAnnouncement.post(labels.name(of: target, isHot: true))
        }
    }

    private func bindHandlers() {
        state.bind(haptic: haptic, onDuplicate: onDuplicate, onRemove: onRemove)
    }

    private static func transition(reduceMotion: Bool) -> AnyTransition {
        reduceMotion
            ? .opacity
            : .asymmetric(
                insertion: .opacity.combined(with: .scale(scale: MeeshyDragTargetsRecipe.appearScale)),
                removal: .opacity
            )
    }
}

public extension MeeshyDragTargets where DuplicateGlyph == MeeshyGlassButtonSymbol, RemoveGlyph == MeeshyGlassButtonSymbol {
    /// Les glyphes de la planche : `plus.square.on.square` et `trash`.
    init(
        state: MeeshyDragTargetsState,
        topSlot: CGRect? = nil,
        bottomSlot: CGRect? = nil,
        labels: MeeshyDragTargetsLabels,
        tone: MeeshyGlassTone? = nil,
        haptic: MeeshyDragTargetsHaptic = .medium,
        onDuplicate: (() -> Void)? = nil,
        onRemove: (() -> Void)? = nil
    ) {
        self.init(
            state: state, topSlot: topSlot, bottomSlot: bottomSlot, labels: labels, tone: tone, haptic: haptic,
            duplicateGlyph: { MeeshyGlassButtonSymbol("plus.square.on.square") },
            removeGlyph: { MeeshyGlassButtonSymbol("trash") },
            onDuplicate: onDuplicate, onRemove: onRemove
        )
    }
}

/// L'annonce de l'entrée dans une cible, une fois, avec son nom chaud.
enum MeeshyDragTargetsAnnouncement {
    @MainActor
    static func post(_ text: String) {
        #if canImport(UIKit)
        guard UIAccessibility.isVoiceOverRunning else { return }
        UIAccessibility.post(notification: .announcement, argument: text)
        #endif
    }
}

/// Le calque des disques, présent dans l'arbre seulement pendant un glisser. Il
/// mesure ses cadres à l'apparition et au changement de mise en page, jamais
/// par mouvement du doigt.
private struct MeeshyDragTargetsLayer<DuplicateGlyph: View, RemoveGlyph: View>: View {
    let state: MeeshyDragTargetsState
    let hovered: MeeshyDragTarget?
    let topSlot: CGRect?
    let bottomSlot: CGRect?
    let labels: MeeshyDragTargetsLabels
    let tone: MeeshyGlassTone?
    let duplicateGlyph: DuplicateGlyph?
    let removeGlyph: RemoveGlyph?
    let reduceMotion: Bool

    var body: some View {
        GeometryReader { proxy in
            let offered = offeredTargets
            let centers = MeeshyDragTargetsRule.centers(
                size: proxy.size, safeTop: proxy.safeAreaInsets.top, safeBottom: proxy.safeAreaInsets.bottom,
                topSlot: topSlot, bottomSlot: bottomSlot, offered: offered
            )
            let origin = proxy.frame(in: .global).origin
            let windowCenters = centers.mapValues { CGPoint(x: $0.x + origin.x, y: $0.y + origin.y) }
            ZStack(alignment: .topLeading) {
                if let duplicateGlyph, let center = centers[.duplicate] {
                    disc(.duplicate, glyph: duplicateGlyph).position(center)
                }
                if let removeGlyph, let center = centers[.remove] {
                    disc(.remove, glyph: removeGlyph).position(center)
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
            .adaptiveOnChange(of: windowCenters, initial: true) { _, measured in
                state.updateCenters(measured)
            }
        }
        .accessibilityElement(children: .contain)
    }

    private var offeredTargets: Set<MeeshyDragTarget> {
        var result = Set<MeeshyDragTarget>()
        if duplicateGlyph != nil { result.insert(.duplicate) }
        if removeGlyph != nil { result.insert(.remove) }
        return result
    }

    private func disc<Glyph: View>(_ target: MeeshyDragTarget, glyph: Glyph) -> some View {
        let isHot = hovered == target
        return MeeshyDragTargetDisc(
            target: target,
            isHot: isHot,
            name: labels.name(of: target, isHot: isHot),
            tone: tone,
            reduceMotion: reduceMotion,
            glyph: glyph
        )
    }
}

/// Un disque : le verre de K01 au repos, le fond plein de K02 au chaud, un
/// anneau, le glyphe. Seules l'échelle et l'opacité bougent ; le disque de
/// verre ne change pas de taille, le flou n'est jamais recalculé.
private struct MeeshyDragTargetDisc<Glyph: View>: View {
    let target: MeeshyDragTarget
    let isHot: Bool
    let name: String
    let tone: MeeshyGlassTone?
    let reduceMotion: Bool
    let glyph: Glyph

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.meeshyGlassTone) private var hostTone
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    #if DEBUG
    @Environment(\.meeshyGlassForcesDrawn) private var forcesDrawn
    @Environment(\.meeshyGlassForcesOpaque) private var forcesOpaque
    #endif

    var body: some View {
        let recipe = MeeshyDragTargetsRecipe.disc(
            target: target, isHot: isHot, tone: tone ?? hostTone, material: material
        )
        let isDark = colorScheme == .dark
        return glyph
            .font(.system(size: CGFloat(recipe.glyphSize), weight: .semibold))
            .foregroundStyle(recipe.inkColor(isDark: isDark))
            .frame(width: CGFloat(recipe.diameter), height: CGFloat(recipe.diameter))
            .background {
                Circle().fill(recipe.fillColor(isDark: isDark).opacity(recipe.fillOpacity))
            }
            .modifier(MeeshyDragTargetGlass(request: recipe.glass, tone: tone))
            .animation(MeeshyDragTargetsRecipe.heatFade(reduceMotion: reduceMotion), value: isHot)
            .background {
                Circle()
                    .fill(recipe.ringColor(isDark: isDark).opacity(recipe.ringOpacity))
                    .padding(-CGFloat(recipe.ringWidth))
            }
            .scaleEffect(CGFloat(recipe.scale))
            .animation(MeeshyDragTargetsRecipe.heat(reduceMotion: reduceMotion), value: isHot)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(name)
            .accessibilityAddTraits(.isImage)
    }

    private var material: MeeshyGlassMaterial {
        MeeshyGlassMaterial.resolve(
            isLiquidAvailable: Platform.isIOS26OrLater,
            reduceTransparency: reduceTransparency,
            forcesDrawn: forcesDrawnInDebug,
            forcesOpaque: forcesOpaqueInDebug
        )
    }

    private var forcesDrawnInDebug: Bool {
        #if DEBUG
        return forcesDrawn || MeeshyGlassDebug.launchForcesDrawn
        #else
        return false
        #endif
    }

    private var forcesOpaqueInDebug: Bool {
        #if DEBUG
        return forcesOpaque
        #else
        return false
        #endif
    }
}

/// La demande faite à K01, l'unique entrée de verre : dense, non interactif ;
/// aucune quand le fond est plein ; teinté de rouge pour la poubelle chaude
/// sous Liquid Glass. Changer de demande change l'identité du disque : le fondu
/// posé au-dessus en fait un fondu enchaîné.
private struct MeeshyDragTargetGlass: ViewModifier {
    let request: MeeshyGlassButtonGlassRequest
    let tone: MeeshyGlassTone?

    @ViewBuilder
    func body(content: Content) -> some View {
        switch request {
        case .none:
            content
        case .neutral:
            content.meeshyGlass(in: Circle(), tone: tone, density: .dense)
        case .red:
            content.meeshyGlass(in: Circle(), tone: tone, density: .dense, tint: MeeshyColors.errorStrong)
        }
    }
}

extension MeeshyDragTargets: Equatable where DuplicateGlyph: Equatable, RemoveGlyph: Equatable {
    public static func == (lhs: MeeshyDragTargets, rhs: MeeshyDragTargets) -> Bool {
        lhs.state === rhs.state && lhs.topSlot == rhs.topSlot && lhs.bottomSlot == rhs.bottomSlot
            && lhs.labels == rhs.labels && lhs.tone == rhs.tone && lhs.haptic == rhs.haptic
            && lhs.duplicateGlyph == rhs.duplicateGlyph && lhs.removeGlyph == rhs.removeGlyph
            && (lhs.onDuplicate == nil) == (rhs.onDuplicate == nil)
            && (lhs.onRemove == nil) == (rhs.onRemove == nil)
    }
}
