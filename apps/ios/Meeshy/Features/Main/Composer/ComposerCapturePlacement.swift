import CoreGraphics

/// **Où le viseur se pose** (#9566, porteur 2026-10-07) — une règle, lue par le
/// montage unique pour ses deux couches.
///
/// > « Le mode édition doit afficher l'image en plein écran même si on était en
/// > mode selfie et qu'on avait la scène et le sol blanc pour le flash ! […]
/// > préserver le bouton plein écran quand on est en mode scène avec selfie
/// > permettant d'agrandir et de prendre tout l'écran, ce qui n'activera le
/// > flash blanc qu'au moment de la prise de vue sans le blanc autour en continu. »
///
/// Deux présentations, pas trois : la SCÈNE (une carte aux coins arrondis, que
/// le sol blanc entoure quand l'écran est le flash) et le PLEIN ÉCRAN (jamais
/// de blanc en continu : l'écran ne blanchit qu'à la prise). Un hôte sans carte
/// — la caméra de conversation — n'a de scène que sous le flash d'écran : c'est
/// l'écran, moins un anneau.
nonisolated enum ComposerCapturePlacement {

    /// L'anneau de sol qu'un hôte sans carte laisse autour de sa scène.
    static let sceneRim: CGFloat = 28

    /// La taille que le viseur prend. La retouche occupe toujours l'écran — sa
    /// scène s'y pose sur le sol (`ComposerEditScene`) ; un hôte sans carte ne
    /// se réduit que si l'écran est le flash.
    static func size(requested: ComposerSceneCameraSize, hostHasCard: Bool,
                     screenFlash: Bool, editing: Bool) -> ComposerSceneCameraSize {
        guard !editing else { return .fullScreen }
        guard !hostHasCard else { return requested }
        return screenFlash ? requested : .fullScreen
    }

    /// Le rectangle de la scène : la carte de l'hôte, ou l'écran moins l'anneau.
    static func card(anchor: CGRect, full: CGRect, hostHasCard: Bool) -> CGRect {
        hostHasCard ? anchor : full.insetBy(dx: sceneRim, dy: sceneRim)
    }

    /// Le sol blanc n'entoure que la scène.
    static func showsFloor(size: ComposerSceneCameraSize, screenFlash: Bool) -> Bool {
        screenFlash && size == .card
    }

    /// En plein écran, l'écran blanchit le temps de la prise ; en scène, le sol
    /// éclaire déjà et rien ne recouvre l'aperçu.
    static func showsBurst(bursting: Bool, size: ComposerSceneCameraSize) -> Bool {
        bursting && size == .fullScreen
    }

    /// Les coins : une carte en a, un plein écran non — et la scène de
    /// retouche, posée sur le sol, en a toujours (#9567).
    static func radius(for size: ComposerSceneCameraSize, editing: Bool) -> CGFloat {
        editing ? ComposerSceneCameraFrame.cardRadius : ComposerSceneCameraFrame.radius(for: size)
    }

    /// Le bouton de taille : offert par un hôte à carte, et à tout selfie
    /// éclairé par l'écran ; la retouche n'a qu'une taille.
    static func offersSizeToggle(hostHasCard: Bool, screenFlash: Bool, editing: Bool) -> Bool {
        !editing && (hostHasCard || screenFlash)
    }
}
