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

    /// Ce que l'objectif sert, plafonné. Un appareil sans zoom (simulateur,
    /// objectif fixe) rend `min...min` : le geste n'y a aucun effet.
    static func range(deviceMin: CGFloat, deviceMax: CGFloat) -> ClosedRange<CGFloat> {
        let bas = max(1, deviceMin)
        return bas...max(bas, min(deviceMax, ceiling))
    }

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

    /// Le badge ne dit rien tant que le cadrage est celui d'origine.
    static func showsBadge(_ factor: CGFloat) -> Bool {
        factor > 1.01
    }
}

/// Le point d'ancrage d'un glissé de zoom : le facteur au premier contact et la
/// course déjà faite à cet instant (l'appui long a pu bouger avant que la
/// prise démarre).
nonisolated struct ComposerCaptureZoomAnchor: Equatable, Sendable {
    let factor: CGFloat
    let translationY: CGFloat
}
