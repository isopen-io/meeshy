import Testing
import CoreGraphics
@testable import MeeshySDK

/// **Le cadre se plie au conteneur que la page reçoit RÉELLEMENT** (#10352).
///
/// Le solveur calcule contre la FENÊTRE ; une page de galerie peut en recevoir
/// moins — une page protégée hébergée dans la couche sécurisée (#9574), dont le
/// contrôleur retranchait la zone sûre (390 × 751 dans 390 × 844), une fenêtre
/// redimensionnée sur iPad, un paysage. Un cadre FIXE plus grand que son
/// conteneur en débordait : le média sortait du viewport (retour porteur du
/// 2026-10-12). `fitted(in:)` rend un cadre qui TIENT, et un média qui y tient
/// entier, à son rapport.
@Suite("MediaStageFraming — le cadre tient dans son conteneur")
struct MediaStageFittingTests {

    static let viewport = CGSize(width: 390, height: 844)

    static let corridors = MediaStageFraming.Corridors(
        safeTop: 59, top: 56, rail: 80, transport: 0, safeBottom: 34, gutter: 12
    )

    static func stage(ratio: CGFloat,
                      presentation: MediaStageFraming.Presentation,
                      viewport: CGSize = MediaStageFittingTests.viewport) -> MediaStageFraming.Result {
        MediaStageFraming.resolve(MediaStageFraming.Input(
            viewport: viewport,
            mediaRatio: ratio,
            corridors: corridors,
            presentation: presentation,
            cardedCornerRadius: 22,
            minimumFrameHeight: 330,
            minimumFrameWidth: 204
        ))
    }

    static func close(_ a: CGFloat, _ b: CGFloat, _ tolerance: CGFloat = 0.01) -> Bool {
        abs(a - b) < tolerance
    }

    static func ratio(_ size: CGSize) -> CGFloat { size.width / size.height }

    // MARK: - Un conteneur assez grand ne change rien

    @Test("Le conteneur égal à la fenêtre rend le résultat du solveur, au point près")
    func fullContainer_isIdentity() {
        let stage = Self.stage(ratio: 0.25, presentation: .full)
        #expect(stage.fitted(in: Self.viewport) == stage)
    }

    @Test("Un cadre cardé dans un conteneur plus grand que lui ne bouge pas")
    func cardedFrame_inLargerContainer_isIdentity() {
        let stage = Self.stage(ratio: 0.8, presentation: .carded)
        #expect(stage.fitted(in: CGSize(width: 390, height: 603)) == stage)
    }

    @Test("Un conteneur sans dimension ne décide rien")
    func emptyContainer_isIdentity() {
        let stage = Self.stage(ratio: 0.8, presentation: .full)
        #expect(stage.fitted(in: .zero) == stage)
        #expect(stage.fitted(in: CGSize(width: 390, height: -1)) == stage)
        #expect(stage.fitted(in: CGSize(width: CGFloat.infinity, height: 844)) == stage)
    }

    // MARK: - Un conteneur plus petit : le cadre tient, le média tient entier

    @Test("Plein cadre, image très haute, conteneur privé de sa zone sûre : rien ne déborde")
    func full_tallImage_inSafeAreaContainer_fitsEntirely() {
        let container = CGSize(width: 390, height: 751)
        let fitted = Self.stage(ratio: 0.25, presentation: .full).fitted(in: container)

        #expect(Self.close(fitted.frame.width, 390))
        #expect(Self.close(fitted.frame.height, 751), "le cadre ne dépasse plus son conteneur")
        #expect(Self.close(fitted.media.height, 751), "le média descend à la hauteur qu'il a")
        #expect(Self.close(Self.ratio(fitted.media), 0.25), "jamais étiré")
    }

    @Test("Plein cadre, photo 3:4 qui tenait déjà : seul le cadre se plie, le média garde sa taille")
    func full_photoThatAlreadyFits_keepsItsSize() {
        let stage = Self.stage(ratio: 0.75, presentation: .full)
        let fitted = stage.fitted(in: CGSize(width: 390, height: 751))

        #expect(Self.close(fitted.frame.height, 751))
        #expect(fitted.media == stage.media, "390 × 520 tient dans 390 × 751 : aucune raison de le réduire")
    }

    @Test("Un cadre portrait posé dans un conteneur paysage tient entier, à son rapport")
    func portraitStage_inLandscapeContainer_fitsEntirely() {
        let container = CGSize(width: 844, height: 390)
        let fitted = Self.stage(ratio: 9.0 / 16.0, presentation: .full).fitted(in: container)

        #expect(fitted.frame.width <= container.width + 0.01)
        #expect(fitted.frame.height <= container.height + 0.01)
        #expect(Self.close(fitted.media.height, 390))
        #expect(Self.close(Self.ratio(fitted.media), 9.0 / 16.0))
    }

    @Test("Le rayon du cadre ne change pas avec le conteneur")
    func cornerRadius_isKept() {
        let stage = Self.stage(ratio: 0.8, presentation: .carded)
        #expect(stage.fitted(in: CGSize(width: 200, height: 200)).cornerRadius == stage.cornerRadius)
    }

    // MARK: - L'invariant, sur toutes les natures et tous les conteneurs

    @Test("Quel que soit le rapport et le conteneur : le média tient dans le cadre, le cadre dans le conteneur, le rapport survit")
    func invariant_nothingOverflows_andRatioSurvives() {
        let ratios: [CGFloat] = [0.2, 0.25, 0.5625, 0.75, 1, 4.0 / 3.0, 16.0 / 9.0, 4]
        let containers = [
            CGSize(width: 390, height: 844), CGSize(width: 390, height: 751),
            CGSize(width: 844, height: 390), CGSize(width: 320, height: 568),
            CGSize(width: 1024, height: 1366), CGSize(width: 507, height: 700),
        ]
        for presentation in [MediaStageFraming.Presentation.carded, .full] {
            for ratio in ratios {
                let stage = Self.stage(ratio: ratio, presentation: presentation)
                for container in containers {
                    let fitted = stage.fitted(in: container)
                    #expect(fitted.frame.width <= container.width + 0.01)
                    #expect(fitted.frame.height <= container.height + 0.01)
                    #expect(fitted.media.width <= fitted.frame.width + 0.01)
                    #expect(fitted.media.height <= fitted.frame.height + 0.01)
                    #expect(Self.close(Self.ratio(fitted.media), Self.ratio(stage.media), 0.001))
                }
            }
        }
    }
}
