import Foundation
import QuartzCore
import AVFoundation

/// **La description jouée par Core Animation : une `CAKeyframeAnimation` par
/// piste, posée UNE fois par slide (#9865).**
///
/// Les animations vivent dans le temps local du conteneur que pilote
/// `StoryAnimationClock` (une seconde locale = une seconde de slide).
/// - `beginTime` 0 serait lu « maintenant » par Core Animation : il devient
///   `AVCoreAnimationBeginTimeAtZero`, la convention que partagent l'aperçu et
///   `AVSynchronizedLayer` / `AVVideoCompositionCoreAnimationTool` à l'export ;
/// - `fillMode = .forwards` sans remplissage arrière : avant sa première clé la
///   couche garde sa base, après la dernière la valeur est tenue ;
/// - la position est PROJETÉE (normalisée → points du rendu) par l'appelant, qui
///   seul connaît la géométrie ; l'échelle se compose avec la transformation de
///   base, comme `StoryRenderer.applyKeyframeOverrides`.
extension StoryKeyframeAnimationPlan {
    @MainActor
    public func coreAnimations(projectPosition: (CGPoint) -> CGPoint,
                               baseTransform: CATransform3D) -> [CAKeyframeAnimation] {
        tracks.map { track in
            let animation = CAKeyframeAnimation(keyPath: Self.keyPath(of: track.channel))
            animation.values = track.values.map {
                Self.layerValue($0, channel: track.channel, projectPosition: projectPosition, baseTransform: baseTransform)
            }
            animation.keyTimes = track.keyTimes.map { NSNumber(value: $0) }
            animation.timingFunctions = track.timings.map { timing in
                let (c1x, c1y, c2x, c2y) = timing.controlPoints
                return CAMediaTimingFunction(controlPoints: c1x, c1y, c2x, c2y)
            }
            animation.calculationMode = .linear
            animation.beginTime = track.beginTime > 0 ? track.beginTime : AVCoreAnimationBeginTimeAtZero
            animation.duration = track.duration
            animation.fillMode = .forwards
            animation.isRemovedOnCompletion = false
            return animation
        }
    }

    private static func keyPath(of channel: Channel) -> String {
        switch channel {
        case .position: return "position"
        case .scale: return "transform"
        case .opacity: return "opacity"
        }
    }

    @MainActor
    private static func layerValue(_ value: KeyValue, channel: Channel,
                                   projectPosition: (CGPoint) -> CGPoint,
                                   baseTransform: CATransform3D) -> Any {
        switch (channel, value) {
        case let (.position, .point(point)):
            return NSValue(cgPoint: projectPosition(point))
        case let (.scale, .scalar(scale)):
            return NSValue(caTransform3D: CATransform3DScale(baseTransform, scale, scale, 1))
        case let (_, .scalar(scalar)):
            return NSNumber(value: Float(scalar))
        case let (_, .point(point)):
            return NSValue(cgPoint: point)
        }
    }
}
