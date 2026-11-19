import SwiftUI

/// **Le squelette (K38)** : un aplat aux mesures et au rayon du composant attendu,
/// avec un reflet qui passe en 1,6 s. Il ne contient aucun texte, aucune icône, et se
/// tait pour le lecteur d'écran. Il n'existe qu'au tout premier chargement
/// (`MeeshySkeletonLaw`) : jamais sur un cache, même périmé, jamais sur un contenu.
///
/// Le reflet est l'UNIQUE reflet du SDK (`LoadingSheen`) : une seule horloge, tous les
/// squelettes passent ensemble. Il n'apparaît qu'après 150 ms, et reste un aplat fixe
/// sous « réduire les animations ».
public struct MeeshySkeleton: View {
    private let shape: MeeshySkeletonShape

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }
    @State private var hasWaitedDelay = false
    @State private var lineAvailableWidth: Double = 0

    public init(shape: MeeshySkeletonShape) {
        self.shape = shape
    }

    public var body: some View {
        form
            .accessibilityHidden(true)
            .task {
                do { try await Task.sleep(for: .milliseconds(MeeshySkeletonRecipe.sheenDelayMilliseconds)) } catch { return }
                hasWaitedDelay = true
            }
    }

    @ViewBuilder
    private var form: some View {
        let fixed = MeeshySkeletonRecipe.size(of: shape, availableWidth: 0)
        switch shape {
        case .line:
            let size = MeeshySkeletonRecipe.size(of: shape, availableWidth: lineAvailableWidth)
            silhouette(size: size)
                .frame(width: CGFloat(size.width), height: CGFloat(size.height))
                .frame(maxWidth: .infinity, alignment: .topLeading)
                .frame(height: CGFloat(fixed.height), alignment: .topLeading)
                .onGeometryChange(for: Double.self) { Double($0.size.width) } action: { lineAvailableWidth = $0 }
        case .pill, .circle:
            silhouette(size: fixed).frame(width: CGFloat(fixed.width), height: CGFloat(fixed.height))
        case .ticket:
            silhouette(size: fixed).frame(maxWidth: .infinity).frame(height: CGFloat(fixed.height))
        case .card(let aspect, _):
            silhouette(size: fixed).aspectRatio(aspect.isFinite && aspect > 0 ? CGFloat(aspect) : 1, contentMode: .fit)
        }
    }

    @ViewBuilder
    private func silhouette(size: MeeshySkeletonRecipe.Size) -> some View {
        let fill = Color.secondary.opacity(MeeshyOpacity.light)
        let base = RoundedRectangle(cornerRadius: CGFloat(size.cornerRadius), style: .continuous).fill(fill)
        if MeeshySkeletonRecipe.sheenAnimates(reduceMotion: reduceMotion, hasWaitedDelay: hasWaitedDelay) {
            base.modifier(LoadingSheen(style: LoadingSheenStyle(
                tint: Color.secondary.opacity(MeeshyOpacity.medium),
                band: .fraction(MeeshySkeletonRecipe.sheenBandFraction),
                duration: MeeshySkeletonRecipe.sheenDuration,
                masksToContent: false)))
        } else {
            base
        }
    }
}
