import AVFoundation
import CoreGraphics
import Foundation

/// **Le doigt qui FILME : le cadenas à droite, le zoom à la verticale** (#8671,
/// directive porteur 2026-09-29).
///
/// > « Ajouter une clé pour la vidéo permettant de lock la vidéo et de pouvoir
/// > zoomer : swipe vers le haut et swipe vers le bas ! »
///
/// Deux axes, deux intentions, et aucune ne se confond avec l'autre : le
/// verrou se lit sur la translation HORIZONTALE (le seuil de
/// `ComposerShutterGesture`, qu'il ne recopie pas), le zoom sur la VERTICALE.
/// Un pouce qui remonte pour zoomer ne verrouille donc jamais par accident, et
/// un pouce qui file vers le cadenas ne fait pas sauter le cadrage.
nonisolated enum ComposerCaptureHold {

    /// Où en est le doigt qui tient la prise.
    enum Phase: Equatable, Sendable {
        /// Le doigt tient : le lâcher clôt la prise.
        case holding
        /// Le cadenas est atteint : le doigt peut partir, la prise continue
        /// jusqu'au bouton stop.
        case locked
    }

    /// **Le verrou ne se DÉFAIT pas en revenant.** Une fois le cadenas atteint,
    /// le pouce qui repart vers la gauche pour zoomer ou pour lâcher ne rend
    /// pas la prise au maintien — c'est ce que « verrouiller » veut dire, et
    /// c'est le comportement des vocaux que le doigt connaît déjà.
    static func phase(translation: CGPoint, wasLocked: Bool) -> Phase {
        if wasLocked { return .locked }
        return ComposerShutterGesture.locks(translationX: translation.x) ? .locked : .holding
    }

    /// Ce que produit le RELÂCHEMENT — tenu, verrouillé ou annulé.
    ///
    /// Un verrou posé AVANT que la caméra soit prête (le cadenas paraît dès
    /// l'appui) vaut intention : la prise démarrera et continuera sans le
    /// doigt. Sans verrou, un doigt parti trop tôt n'a rien demandé.
    static func release(isRecording: Bool, phase: Phase) -> ComposerSceneQuickCapture.Release {
        if phase == .locked { return .keepFilming }
        return isRecording ? .closeTake : .cancelPending
    }

    /// **Le cadenas paraît dès que le doigt TIENT pour filmer** — pas seulement
    /// une fois l'enregistrement parti. Le montrer après coup, c'était le
    /// cacher tant que la caméra s'ouvre, précisément le moment où l'auteur
    /// décide s'il voudra ses deux mains.
    static func showsLock(stage: ComposerSceneCameraStage, holding: Bool, locked: Bool) -> Bool {
        guard !locked, stage != .off else { return false }
        return holding || stage == .recording
    }

    /// **Le glissé vertical du viseur ZOOME pendant une prise, et RANGE la
    /// caméra hors prise.** Sans cette règle, descendre pour dézoomer une
    /// prise verrouillée aurait fermé le viseur au milieu de l'enregistrement.
    enum VerticalDrag: Equatable, Sendable {
        case zoom
        case dismiss
    }

    static func verticalDrag(stage: ComposerSceneCameraStage) -> VerticalDrag {
        stage == .recording ? .zoom : .dismiss
    }
}

/// **Le zoom au glisser : exponentiel, borné à ce que l'objectif sait faire.**
///
/// Une course LINÉAIRE ferait paraître le premier centimètre énorme (1× → 2×
/// double le cadrage) et le dernier insignifiant (9× → 10×). Chaque tranche de
/// `pointsPerDoubling` points DOUBLE donc le facteur : le geste se sent pareil
/// partout, comme le pincement de l'appareil photo système.
nonisolated enum ComposerCaptureZoom {

    /// Remonter de 160 pt double le cadrage — une demi-hauteur de pouce.
    static let pointsPerDoubling: CGFloat = 160

    /// Au-delà, l'image n'est plus qu'un grain numérique : le zoom d'un
    /// capteur grand-angle se plafonne là même si l'appareil annonce plus.
    static let ceiling: CGFloat = 10

    /// - Parameter translationY: la course depuis le début du glissé — NÉGATIVE
    ///   vers le haut (repère UIKit), donc un zoom.
    static func factor(from start: CGFloat,
                       translationY: CGFloat,
                       range: ClosedRange<CGFloat>) -> CGFloat {
        let brut = start * pow(2, -translationY / pointsPerDoubling)
        return min(range.upperBound, max(range.lowerBound, brut))
    }

    /// Le pas d'un balayage VoiceOver : un lecteur d'écran ne glisse pas, il
    /// incrémente.
    static let accessibilityStep: CGFloat = 1.25

    static func stepped(_ factor: CGFloat, up: Bool, range: ClosedRange<CGFloat>) -> CGFloat {
        let brut = up ? factor * accessibilityStep : factor / accessibilityStep
        return min(range.upperBound, max(range.lowerBound, brut))
    }

    /// Le badge ne dit rien tant que le cadrage est celui d'origine (×1).
    static func showsBadge(_ factor: CGFloat) -> Bool {
        abs(factor - 1) > 0.01
    }

    /// **Le pincement** (#9295, directive porteur 2026-10-04) : l'écart des
    /// doigts MULTIPLIE le facteur du premier contact — doubler l'écart double
    /// le cadrage, comme l'appareil photo du système —, borné à l'objectif.
    static func pinched(from start: CGFloat, scale: CGFloat, range: ClosedRange<CGFloat>) -> CGFloat {
        min(range.upperBound, max(range.lowerBound, start * scale))
    }

    /// Le dernier doigt d'un pincement se lève rarement en même temps que le
    /// premier : pendant ce délai, sa levée n'est ni un toucher ni un rangement.
    static let pinchGrace: TimeInterval = 0.4

    /// **Un pincement ne range jamais le viseur, ne photographie pas et ne
    /// vise pas** : deux doigts qui descendent ensemble pour dézoomer font
    /// aussi un glissé vertical, et leurs levées ressemblent à des touchers.
    static func pinchSpoilsGestures(isPinching: Bool, pinchEndedAt: Date?, now: Date) -> Bool {
        if isPinching { return true }
        guard let pinchEndedAt else { return false }
        return now.timeIntervalSince(pinchEndedAt) < pinchGrace
    }
}

/// Le point d'ancrage d'un glissé de zoom : le facteur au premier contact et la
/// course déjà faite à cet instant (l'appui long a pu bouger avant que la
/// prise démarre).
nonisolated struct ComposerCaptureZoomAnchor: Equatable, Sendable {
    let factor: CGFloat
    let translationY: CGFloat
}

/// **Le facteur qu'on LIT n'est pas celui de l'appareil** (#9350, spec § 4.5).
///
/// Une caméra virtuelle à ultra grand-angle (triple, double grand-angle) compte
/// son facteur 1 sur l'ultra grand-angle : le ×1 de l'appareil photo du système
/// est son premier basculement. On raisonne en facteur AFFICHÉ partout (geste,
/// pastille, badge) ; seul `CameraModel` convertit, à l'écriture.
nonisolated struct ComposerCaptureZoomScale: Equatable, Sendable {
    /// Le facteur de l'appareil qui s'affiche « ×1 ».
    let base: CGFloat

    /// Le premier trouvé gagne : les caméras virtuelles d'abord, l'objectif seul en dernier.
    static let preferredDeviceTypes: [AVCaptureDevice.DeviceType] = [
        .builtInTripleCamera, .builtInDualWideCamera, .builtInDualCamera, .builtInWideAngleCamera,
    ]

    static func base(switchOvers: [CGFloat], hasUltraWide: Bool) -> CGFloat {
        guard hasUltraWide, let premier = switchOvers.first, premier > 0 else { return 1 }
        return premier
    }

    func displayed(_ deviceFactor: CGFloat) -> CGFloat { deviceFactor / base }

    func device(_ displayedFactor: CGFloat) -> CGFloat { displayedFactor * base }

    /// Ce que l'objectif sert, en facteur affiché, plafonné à `ComposerCaptureZoom.ceiling`.
    /// Un appareil sans zoom (simulateur, objectif fixe) rend `min...min`.
    func displayedRange(deviceMin: CGFloat, deviceMax: CGFloat) -> ClosedRange<CGFloat> {
        let bas = deviceMin / base
        let haut = min(deviceMax / base, ComposerCaptureZoom.ceiling)
        return bas...max(bas, haut)
    }

    /// Le viseur s'ouvre à ×1 affiché.
    var opening: CGFloat { base }

    /// Les crans que la pastille offre — ceux que l'objectif sert vraiment.
    static func presets(in range: ClosedRange<CGFloat>) -> [CGFloat] {
        guard range.upperBound > range.lowerBound else { return [] }
        return [0.5, 1, 2].filter { range.contains($0) }
    }
}
