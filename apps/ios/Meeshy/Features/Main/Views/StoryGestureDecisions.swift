import CoreGraphics
import Foundation

/// État d'un toucher en cours sur l'overlay story — capture le minimum
/// nécessaire pour décider quoi faire au touch-down et au touch-up sans
/// avoir besoin du contexte SwiftUI (`@State`, `View`).
///
/// Utilisé par `StoryGestureOverlayView` à travers `StoryGestureDecisions`
/// pour rendre le comportement testable en XCTest.
struct StoryGestureContext: Equatable {
    /// `true` si le toucher en cours est un long-press confirmé (≥ 200 ms).
    var holdActive: Bool
    /// `true` si la story est en pause (source de vérité : long-press
    /// posé `true`, tap suivant pose `false`).
    var isPaused: Bool
    /// `true` si le tap en cours est le tap de reprise (touch-down a remis
    /// `isPaused = false`) — son release doit être consommé sans nav.
    var isResumingTap: Bool
    /// `true` si le composer est focused / engaged — toutes les actions
    /// gestuelles sont court-circuitées dans ce cas.
    var isComposerEngaged: Bool
    /// `true` si le doigt a franchi le slop de tap pendant ce toucher. Le drag
    /// parent (`unifiedDragGesture`) est reconnu EN PARALLÈLE depuis le fix de
    /// précédence : sans ce drapeau, un swipe rapide parti d'une bande latérale
    /// validerait à la fois une navigation de story et un changement de groupe.
    /// Défaut `false` = « toucher immobile », le cas historique — les contextes
    /// existants (dont ceux des tests) restent valides sans être modifiés.
    var didExceedSlop: Bool = false
}

/// Action à appliquer suite à un événement gestuel sur l'overlay story.
/// Pure value type — pas d'effet de bord ; le caller (la View) traduit
/// l'action en appels aux callbacks.
enum StoryGestureAction: Equatable {
    /// Rien à faire (no-op de cohérence : seuil franchi sans suite, etc.).
    case none
    /// Le composer était engagé : on délègue à `onDismissComposer`.
    case dismissComposer
    /// Touch-down sur story en pause → reprend la lecture (pose `isPaused
    /// = false`) et arme `isResumingTap = true` pour neutraliser le release.
    case resumeFromPause
    /// Touch-up d'un long-press confirmé : la story reste en pause
    /// (`isPaused` est resté `true`), pas de nav.
    case confirmLongPressPause
    /// Tap court → navigation slide précédente (bande gauche).
    case navigatePrevious
    /// Tap court → navigation slide suivante (bande droite).
    case navigateNext
    /// Double tap dans la bande centrale → bascule pause / lecture.
    case togglePause
}

/// Bande horizontale sous le doigt, au touch-down.
///
/// La navigation par tap est le geste le plus fréquent d'une story : elle doit
/// rester IMMÉDIATE. Un double tap actif sur tout l'écran forcerait le tap
/// simple à attendre l'échec du double tap (~250 ms) et rendrait la navigation
/// molle. On réserve donc une bande centrale au double tap, et les bords
/// naviguent sans délai (décision utilisateur 2026-07-25).
///
/// Le long-press reste un raccourci de pause disponible sur toute la surface.
enum StoryTapZone: Equatable {
    case previous
    case center
    case next

    /// Fraction de largeur occupée par CHAQUE bande de navigation.
    static let edgeFraction: CGFloat = 0.30

    static func zone(forX x: CGFloat, width: CGFloat) -> StoryTapZone {
        // Largeur dégénérée : pas de division, on garde le comportement
        // historique du bord (`.next`).
        guard width > 0 else { return .next }
        let edge = width * edgeFraction
        if x < edge { return .previous }
        if x >= width - edge { return .next }
        return .center
    }
}

/// Namespace de fonctions pures qui décident des transitions de l'overlay
/// gestuel story. Découplé de SwiftUI pour être unit-testable.
///
/// **Sémantique** : `isPaused` est l'unique source de vérité du toggle
/// long-press. La story est en pause ⇔ `isPaused == true` ⇔ timer arrêté
/// + tout média (bg vidéo, audios, effets) en pause.
enum StoryGestureDecisions {

    /// Décide quoi faire au TOUCH-DOWN d'un nouveau geste sur l'overlay.
    ///
    /// Un toucher **sur les bords** reprend une lecture en pause : la
    /// navigation gauche/droite doit rester immédiate en toutes circonstances.
    /// Dans la **bande centrale**, on ne reprend PAS — cette bande appartient au
    /// double tap, dont le premier relâchement relancerait sinon la story avant
    /// que le second n'arrive, rendant impossible le « double tap relance »
    /// (spec 2026-07-25).
    static func decideTouchDown(context: StoryGestureContext,
                                touchStartX: CGFloat,
                                width: CGFloat) -> StoryGestureAction {
        if context.isComposerEngaged { return .none }
        guard context.isPaused else { return .none }
        return StoryTapZone.zone(forX: touchStartX, width: width) == .center
            ? .none
            : .resumeFromPause
    }

    /// Décide quoi faire au TOUCH-UP (.onEnded) d'un geste.
    ///
    /// - Parameters:
    ///   - context: état courant du toucher.
    ///   - touchStartX: coordonnée X du touch-down (pour décider la bande).
    ///   - width: largeur du viewport.
    ///   - elapsed: durée écoulée depuis le touch-down (s).
    ///   - holdThreshold: seuil long-press en secondes.
    ///
    /// La bande centrale ne navigue PAS : elle est réservée au double tap
    /// (pause). Sans cela, le premier tap d'un double tap ferait avancer la
    /// story avant l'arrivée du second.
    static func decideTouchUp(
        context: StoryGestureContext,
        touchStartX: CGFloat,
        width: CGFloat,
        elapsed: TimeInterval,
        holdThreshold: TimeInterval
    ) -> StoryGestureAction {
        if context.isComposerEngaged { return .dismissComposer }
        if context.isResumingTap { return .none }
        if context.holdActive { return .confirmLongPressPause }
        // Le doigt a bougé : ce n'était pas un tap. Le geste appartient au drag
        // parent, qui décidera seul du changement de groupe / du plein écran.
        // Sans cette porte, un swipe parti d'une bande latérale naviguait d'une
        // story ET changeait de groupe — les deux recognizers étant désormais
        // simultanés. Placé APRÈS `holdActive` : un hold confirmé puis relâché
        // garde son contrat (`confirmLongPressPause`), inchangé.
        if context.didExceedSlop { return .none }
        // Race rare : seuil franchi mais le tick `onChanged` n'a pas posé
        // `holdActive = true` à temps. On évite la nav surprise.
        if elapsed >= holdThreshold { return .none }
        switch StoryTapZone.zone(forX: touchStartX, width: width) {
        case .previous: return .navigatePrevious
        case .next: return .navigateNext
        case .center: return .none
        }
    }

    /// Décide quoi faire sur un DOUBLE TAP.
    ///
    /// Actif uniquement dans la bande centrale : sur les bords, les deux taps
    /// ont déjà navigué immédiatement, il n'y a plus rien à décider.
    static func decideDoubleTap(
        context: StoryGestureContext,
        touchStartX: CGFloat,
        width: CGFloat
    ) -> StoryGestureAction {
        if context.isComposerEngaged { return .dismissComposer }
        guard StoryTapZone.zone(forX: touchStartX, width: width) == .center else { return .none }
        return .togglePause
    }
}
