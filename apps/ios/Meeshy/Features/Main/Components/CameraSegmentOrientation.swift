import AVFoundation
import CoreGraphics

/// Où un segment se pose dans la prise fusionnée, et comment il se tenait.
nonisolated struct CameraSegmentPlacement: Sendable {
    let timeRange: CMTimeRange
    let natural: CGSize
    let transform: CGAffineTransform
}

/// **Une prise qui a basculé d'objectif reste debout** (#9464).
///
/// Chaque segment porte l'orientation de SA caméra (`preferredTransform` :
/// debout à l'arrière, debout et en miroir à l'avant). Une piste composée n'en
/// porte qu'une : tant que tous les segments s'accordent, elle la reprend et la
/// fusion reste un passthrough ; sinon chaque segment reçoit son calque, posé
/// debout sur une toile portrait — et la fusion ré-encode.
nonisolated enum CameraSegmentOrientation {

    /// La transformation commune, `nil` dès que deux segments diffèrent.
    static func uniform(_ placements: [CameraSegmentPlacement]) -> CGAffineTransform? {
        guard let premiere = placements.first?.transform else { return .identity }
        return placements.allSatisfy { $0.transform == premiere } ? premiere : nil
    }

    static func upright(_ placement: CameraSegmentPlacement) -> CGSize {
        let rect = CGRect(origin: .zero, size: placement.natural).applying(placement.transform)
        return CGSize(width: abs(rect.width), height: abs(rect.height))
    }

    /// Le segment redressé, ajusté et centré sur la toile.
    static func layerTransform(for placement: CameraSegmentPlacement, renderSize: CGSize) -> CGAffineTransform {
        let rect = CGRect(origin: .zero, size: placement.natural).applying(placement.transform)
        let debout = upright(placement)
        guard debout.width > 0, debout.height > 0 else { return placement.transform }
        let echelle = min(renderSize.width / debout.width, renderSize.height / debout.height)
        return placement.transform
            .concatenating(CGAffineTransform(translationX: -rect.minX, y: -rect.minY))
            .concatenating(CGAffineTransform(scaleX: echelle, y: echelle))
            .concatenating(CGAffineTransform(translationX: (renderSize.width - debout.width * echelle) / 2,
                                             y: (renderSize.height - debout.height * echelle) / 2))
    }

    /// Une instruction de calque par segment, sur la toile du premier, debout.
    static func composition(for track: AVCompositionTrack,
                            placements: [CameraSegmentPlacement]) -> AVMutableVideoComposition? {
        guard let premier = placements.first else { return nil }
        let toile = upright(premier)
        let composition = AVMutableVideoComposition()
        composition.renderSize = toile
        composition.frameDuration = CMTime(value: 1, timescale: 30)
        composition.instructions = placements.map { placement in
            let instruction = AVMutableVideoCompositionInstruction()
            instruction.timeRange = placement.timeRange
            let calque = AVMutableVideoCompositionLayerInstruction(assetTrack: track)
            calque.setTransform(layerTransform(for: placement, renderSize: toile), at: placement.timeRange.start)
            instruction.layerInstructions = [calque]
            return instruction
        }
        return composition
    }
}
