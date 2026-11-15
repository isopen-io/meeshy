import AVFoundation
import CoreGraphics
import MeeshySDK
import MeeshyUI

/// **Une prise tenue en paysage garde le cadrage vu au viseur** (#16506).
///
/// L'interface reste en portrait quand l'appareil se couche : l'auteur voit donc
/// le viseur TOURNÉ, et la prise sort à l'horizon, plus large que haute. La
/// recadrer dans les proportions debout du viseur lui coupait les côtés. Ce
/// qu'il voyait, ce sont ces proportions inversées.
nonisolated enum ComposerTakeAspect {

    /// Les proportions du viseur, tournées si la prise est tenue à l'autre sens.
    static func aspect(canvas: CGFloat, take: CGSize) -> CGFloat {
        guard canvas > 0, canvas != 1, take.width > 0, take.height > 0, take.width != take.height,
              (take.width > take.height) != (canvas > 1) else { return canvas }
        return 1 / canvas
    }

    static func aspect(canvas: CGFloat, video url: URL) async -> CGFloat {
        guard let debout = await uprightSize(of: url) else { return canvas }
        return aspect(canvas: canvas, take: debout)
    }

    /// Dans une scène 9:16, une prise paysage s'AJUSTE : remplie, elle perdrait
    /// ses côtés. Décision par défaut tracée sur #16506 ; le panneau Cadre
    /// garde le choix de la remplir.
    static func sceneFit(take: CGSize) -> String? {
        take.width > take.height ? StoryBackgroundFraming.fit : nil
    }

    static func sceneFit(of result: CameraResult) async -> String? {
        switch result {
        case .photo(let image, _):
            return sceneFit(take: image.size)
        case .video(let url):
            return await uprightSize(of: url).flatMap(sceneFit(take:))
        }
    }

    private static func uprightSize(of url: URL) async -> CGSize? {
        guard let piste = try? await AVURLAsset(url: url).loadTracks(withMediaType: .video).first,
              let (naturelle, transformation) = try? await piste.load(.naturalSize, .preferredTransform)
        else { return nil }
        return MeeshyVideoWatermarkBaker.orientedSize(natural: naturelle, transform: transformation)
    }
}
