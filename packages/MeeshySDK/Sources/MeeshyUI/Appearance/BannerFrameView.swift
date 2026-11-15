import SwiftUI
import UIKit
import MeeshySDK

// MARK: - BannerFrameView (#10935)
//
// Un building block AGNOSTIQUE : le cadre de bannière (`BannerFrameDesign`, #10932)
// posé PAR-DESSUS la photo de bannière ou le fond, qu'il ne remplace jamais. Le
// dessin fixe est rasterisé UNE fois par taille (sous la découpe : centre
// transparent), les mouvements sont des couches Core Animation (`FrameMotionLayers`)
// — rien ne se redessine par image. La couche Lottie facultative passe par le
// moteur partagé (`PackLottieLayer`, rendu `.coreAnimation`), découpée à la région.
// Décoratif : ni le doigt ni VoiceOver ne s'y arrêtent. L'app décide « quel cadre,
// quand » ; `animates: false` (aperçu, vignette) ⇒ le cadre fixe.

public struct BannerFrameView: View, Equatable {
    public let design: BannerFrameDesign
    public let animates: Bool

    @Environment(\.accessibilityReduceMotion) private var systemReduce
    @Environment(\.meeshyForceReduceMotion) private var userForced

    public init(design: BannerFrameDesign, animates: Bool = true) {
        self.design = design
        self.animates = animates
    }

    nonisolated public static func == (lhs: BannerFrameView, rhs: BannerFrameView) -> Bool {
        lhs.design == rhs.design && lhs.animates == rhs.animates
    }

    private var moving: Bool {
        animates && !MeeshyMotion.shouldReduce(system: systemReduce, userForced: userForced)
    }

    public var body: some View {
        BannerFrameLayers(design: design, animates: moving)
            .overlay {
                if let lottie = design.lottie {
                    PackLottieLayer(ref: lottie, animates: moving, contentMode: .fill)
                        .mask(BannerFrameRegion(design: design))
                }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

private struct BannerFrameLayers: UIViewRepresentable {
    let design: BannerFrameDesign
    let animates: Bool
    @Environment(\.displayScale) private var displayScale

    func makeUIView(context: Context) -> BannerFrameLayerView {
        BannerFrameLayerView()
    }

    func updateUIView(_ view: BannerFrameLayerView, context: Context) {
        view.configure(design: design, animates: animates, scale: displayScale)
    }
}

/// Le dessin fixe (une image, rendue à chaque nouvelle taille) sous les couches animées.
final class BannerFrameLayerView: UIView {
    private let still = UIImageView()
    let motion = FrameMotionHostView()
    private var design: BannerFrameDesign?
    private var renderedSize: CGSize = .zero
    private var renderedDesign: BannerFrameDesign?
    private var scale: CGFloat = 1
    private var renderedScale: CGFloat = 0

    var stillImage: UIImage? { still.image }

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        accessibilityElementsHidden = true
        backgroundColor = .clear
        still.contentMode = .scaleToFill
        addSubview(still)
        addSubview(motion)
    }

    required init?(coder: NSCoder) { nil }

    nonisolated deinit {}

    func configure(design: BannerFrameDesign, animates: Bool, scale: CGFloat) {
        self.design = design
        self.scale = scale
        motion.animates = animates
        render()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        still.frame = bounds
        motion.frame = bounds
        render()
    }

    /// Une nouvelle taille ou un nouveau cadre : le dessin fixe et les couches se refont, une fois.
    private func render() {
        guard let design, bounds.width > 0, bounds.height > 0 else { return }
        guard bounds.size != renderedSize || design != renderedDesign || scale != renderedScale else { return }
        renderedSize = bounds.size
        renderedDesign = design
        renderedScale = scale
        let plan = BannerFrameRenderer.plan(design, size: bounds.size)
        still.image = BannerFrameRenderer.staticImage(design, size: bounds.size, skipping: plan.animated, screenScale: scale)
        motion.show(plan.isStill ? .empty : BannerFrameRenderer.motionContent(design, size: bounds.size, plan: plan))
    }
}
