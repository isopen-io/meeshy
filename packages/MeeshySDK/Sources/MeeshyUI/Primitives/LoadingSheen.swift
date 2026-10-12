import SwiftUI
import UIKit

// MARK: - Loading sheen — l'UNIQUE reflet de chargement du SDK (#9869)
//
// Trois reflets jumeaux vivaient dans MeeshyUI (`ShimmerModifier`,
// `ShimmerEffect` avec `GeometryReader` + `.mask`, et la pulsation de
// `transcriptionShimmer`). Ils convergent ici. Le balayage est une
// `CABasicAnimation` posée sur un `CAGradientLayer` : le serveur de
// composition l'interpole, aucun corps SwiftUI n'est réévalué à chaque image,
// et rien ne tourne quand le reflet n'est pas à l'écran.
//
// Surtout, le reflet ne tourne que pendant un VRAI chargement. Une image dont
// le téléchargement a échoué, ou que la politique de téléchargement retient en
// attendant un geste, garde un placeholder STATIQUE : un balayage infini y
// dirait « ça charge » alors que rien ne charge.

/// Ce que fait réellement le contenu derrière un placeholder.
nonisolated public enum LoadingSheenPhase: Sendable, Equatable {
    /// Un chargement est en cours (ou va partir) : le reflet balaie.
    case loading
    /// Le chargement a été demandé et n'arrivera pas (erreur, URL absente).
    case failed
    /// La politique de téléchargement retient la requête : rien ne charge
    /// tant que l'utilisateur ne l'a pas demandé.
    case deferred
}

/// Loi PURE du reflet, testable hors SwiftUI.
nonisolated public enum LoadingSheenLaw {

    /// Seul un chargement réel anime, et jamais sous Reduce Motion.
    public static func animates(phase: LoadingSheenPhase, reduceMotion: Bool) -> Bool {
        phase == .loading && !reduceMotion
    }

    /// L'état d'un placeholder d'image, dérivé de ce que la vue sait de son
    /// chargement. L'échec l'emporte sur la retenue : une requête partie puis
    /// tombée n'attend plus un geste, elle a échoué.
    public static func phase(
        hasURL: Bool,
        fetchDeferredByPolicy: Bool,
        fetchFailed: Bool
    ) -> LoadingSheenPhase {
        guard hasURL else { return .failed }
        if fetchFailed { return .failed }
        if fetchDeferredByPolicy { return .deferred }
        return .loading
    }
}

private struct LoadingSheenPhaseKey: EnvironmentKey {
    static let defaultValue: LoadingSheenPhase = .loading
}

public extension EnvironmentValues {
    /// Posé par l'hôte d'un placeholder (`ProgressiveCachedImage`,
    /// `CachedAsyncImage`) : un `.shimmer()` / `.skeletonShimmer()` du
    /// sous-arbre ne balaie que si cet état vaut `.loading`. Défaut `.loading`,
    /// donc un squelette posé hors de ces hôtes garde son comportement.
    var loadingSheenPhase: LoadingSheenPhase {
        get { self[LoadingSheenPhaseKey.self] }
        set { self[LoadingSheenPhaseKey.self] = newValue }
    }
}

public extension View {
    /// Déclare l'état de chargement réel au reflet du sous-arbre.
    func loadingSheenPhase(_ phase: LoadingSheenPhase) -> some View {
        environment(\.loadingSheenPhase, phase)
    }
}

/// Réglages visuels des deux tenues historiques du reflet.
public struct LoadingSheenStyle: Equatable {
    public enum Band: Equatable {
        case points(CGFloat)
        case fraction(CGFloat)
    }

    public let tint: Color
    public let band: Band
    public let duration: Double
    /// `true` : le reflet ne se dessine que sur les pixels du contenu (formes
    /// rondes, rangées de squelette à trous). `false` : le contenu est rogné à
    /// son cadre, le reflet le couvre entièrement.
    public let masksToContent: Bool

    public init(tint: Color, band: Band, duration: Double, masksToContent: Bool) {
        self.tint = tint
        self.band = band
        self.duration = duration
        self.masksToContent = masksToContent
    }

    /// Tenue de `.shimmer()` : voile blanc, bande à 60 % de la largeur, 2 s.
    public static let veil = LoadingSheenStyle(
        tint: Color.white.opacity(0.15),
        band: .fraction(0.6),
        duration: 2.0,
        masksToContent: true
    )

    /// Tenue de `.skeletonShimmer()` : teinte de texte atténuée, bande de 120 pt, 1,5 s.
    public static func skeleton(tint: Color) -> LoadingSheenStyle {
        LoadingSheenStyle(tint: tint, band: .points(120), duration: 1.5, masksToContent: false)
    }
}

/// Le seul modificateur de reflet animé du SDK.
public struct LoadingSheen: ViewModifier {
    @Environment(\.loadingSheenPhase) private var phase
    @Environment(\.accessibilityReduceMotion) private var systemReduce
    @Environment(\.meeshyForceReduceMotion) private var userForced

    public let style: LoadingSheenStyle

    public init(style: LoadingSheenStyle) {
        self.style = style
    }

    private var animates: Bool {
        LoadingSheenLaw.animates(
            phase: phase,
            reduceMotion: MeeshyMotion.shouldReduce(system: systemReduce, userForced: userForced)
        )
    }

    private var sheenLayer: some View {
        LoadingSheenLayer(style: style)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    @ViewBuilder
    public func body(content: Content) -> some View {
        if style.masksToContent {
            content.overlay {
                if animates {
                    sheenLayer.mask { content }
                }
            }
        } else {
            content
                .overlay {
                    if animates { sheenLayer }
                }
                .clipped()
        }
    }
}

// MARK: - Couche Core Animation

private struct LoadingSheenLayer: UIViewRepresentable {
    let style: LoadingSheenStyle

    func makeUIView(context: Context) -> LoadingSheenView {
        LoadingSheenView()
    }

    func updateUIView(_ view: LoadingSheenView, context: Context) {
        view.configure(tint: UIColor(style.tint), band: style.band, duration: style.duration)
    }

    static func dismantleUIView(_ view: LoadingSheenView, coordinator: ()) {
        view.stop()
    }
}

final class LoadingSheenView: UIView {
    private static let animationKey = "meeshy.loadingSheen.sweep"

    private let gradient = CAGradientLayer()
    private var tint: UIColor = .clear
    private var band: LoadingSheenStyle.Band = .points(120)
    private var duration: Double = 1.5
    private var laidOutSize: CGSize = .zero

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        accessibilityElementsHidden = true
        backgroundColor = .clear
        clipsToBounds = true
        gradient.startPoint = CGPoint(x: 0, y: 0.5)
        gradient.endPoint = CGPoint(x: 1, y: 0.5)
        layer.addSublayer(gradient)
    }

    required init?(coder: NSCoder) { nil }

    nonisolated deinit {}

    func configure(tint: UIColor, band: LoadingSheenStyle.Band, duration: Double) {
        let changed = tint != self.tint || band != self.band || duration != self.duration
        self.tint = tint
        self.band = band
        self.duration = duration
        if changed { restart() }
    }

    func stop() {
        gradient.removeAnimation(forKey: Self.animationKey)
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard bounds.size != laidOutSize else { return }
        laidOutSize = bounds.size
        restart()
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        restart()
    }

    private var bandWidth: CGFloat {
        switch band {
        case .points(let points): return points
        case .fraction(let fraction): return bounds.width * fraction
        }
    }

    private func restart() {
        stop()
        let width = bounds.width
        let bandWidth = bandWidth
        let visible = window != nil && width > 0 && bounds.height > 0 && bandWidth > 0
        let resolved = tint.resolvedColor(with: traitCollection)

        CATransaction.begin()
        CATransaction.setDisableActions(true)
        gradient.colors = [
            resolved.withAlphaComponent(0).cgColor,
            resolved.cgColor,
            resolved.withAlphaComponent(0).cgColor,
        ]
        gradient.frame = CGRect(x: -bandWidth, y: 0, width: bandWidth, height: bounds.height)
        gradient.isHidden = !visible
        CATransaction.commit()

        guard visible else { return }
        let sweep = CABasicAnimation(keyPath: "transform.translation.x")
        sweep.fromValue = CGFloat.zero
        sweep.toValue = width + bandWidth
        sweep.duration = duration
        sweep.repeatCount = .infinity
        sweep.isRemovedOnCompletion = false
        gradient.add(sweep, forKey: Self.animationKey)
    }
}
