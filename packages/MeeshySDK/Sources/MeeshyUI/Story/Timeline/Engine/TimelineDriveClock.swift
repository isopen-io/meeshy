import QuartzCore

/// Le display link qui pilote la tête de lecture du moteur.
///
/// La tête n'a jamais besoin de plus de 60 Hz (l'observateur AVPlayer tire à
/// 1/60 s). Sans plage, un écran ProMotion la tirait à 120 Hz : deux fois les
/// ticks, donc deux fois les réveils des feuilles qui la dessinent, pour la
/// même image perçue.
@MainActor
enum TimelineDriveClock {
    static let frameRateRange = CAFrameRateRange(minimum: 30, maximum: 60, preferred: 60)

    static func makeLink(onTick: @escaping (CADisplayLink) -> Void) -> CADisplayLink {
        let link = WeakDisplayLinkTarget.makeLink(onTick: onTick)
        link.preferredFrameRateRange = frameRateRange
        return link
    }
}
