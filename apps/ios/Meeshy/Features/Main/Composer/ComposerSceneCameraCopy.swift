import Foundation

/// **Le vocabulaire du viseur** (#4080, vue `2b`).
///
/// Séparé de la vue pour la raison habituelle du dépôt : une chaîne composée
/// dans un corps de vue est hors de portée d'un témoin, et celles-ci portent
/// une RÈGLE — la phrase du bas change avec le mode ET l'étape, et c'est elle
/// qui dit à l'auteur quoi faire de son doigt.
@MainActor
enum ComposerSceneCameraCopy {

    static func label(for mode: ComposerSceneCameraMode) -> String {
        switch mode {
        case .photo:
            return String(localized: "composer.camera.mode.photo",
                          defaultValue: "Photo", bundle: .main)
        case .video:
            return String(localized: "composer.camera.mode.video",
                          defaultValue: "Vidéo", bundle: .main)
        case .handsFree:
            return String(localized: "composer.camera.mode.handsFree",
                          defaultValue: "Mains libres", bundle: .main)
        }
    }

    /// La phrase du bas. La CLÉ vient de `ComposerSceneCamera.hintKey` — la
    /// règle est là-bas, éprouvée sans monter de vue ; ici n'est que la table
    /// de traduction. Les deux ne peuvent pas diverger : un `switch` exhaustif
    /// sur les mêmes clés.
    static func hint(mode: ComposerSceneCameraMode,
                     stage: ComposerSceneCameraStage) -> String {
        switch ComposerSceneCamera.hintKey(mode: mode, stage: stage) {
        case "composer.camera.hint.photo":
            return String(localized: "composer.camera.hint.photo",
                          defaultValue: "toucher pour prendre une photo",
                          bundle: .main)
        case "composer.camera.hint.video":
            return String(localized: "composer.camera.hint.video",
                          defaultValue: "maintenir pour filmer · relâcher pour poser dans la scène",
                          bundle: .main)
        case "composer.camera.hint.videoHolding":
            return String(localized: "composer.camera.hint.videoHolding",
                          defaultValue: "relâcher pour poser dans la scène",
                          bundle: .main)
        case "composer.camera.hint.handsFreeStart":
            return String(localized: "composer.camera.hint.handsFreeStart",
                          defaultValue: "toucher pour lancer — les mains libres",
                          bundle: .main)
        default:
            return String(localized: "composer.camera.hint.handsFreeStop",
                          defaultValue: "toucher pour arrêter et poser dans la scène",
                          bundle: .main)
        }
    }

    /// **Le compte des segments, au PLURIEL correct.** Une chaîne « %d
    /// SEGMENTS » figée dirait « 1 SEGMENTS » — et c'est la première chose
    /// qu'on voit après une prise unique, donc le cas le plus fréquent.
    static func segmentCount(_ n: Int) -> String {
        String(localized: "composer.camera.segments",
               defaultValue: "\(n) segments", bundle: .main)
    }

    static var dropSegmentLabel: String {
        String(localized: "composer.camera.dropSegment",
               defaultValue: "Retirer le dernier segment", bundle: .main)
    }

    /// « Poser », jamais « Valider » : le mot dit ce que le geste FAIT à la
    /// scène, et c'est la phrase de la planche — « ✓ pour poser dans la scène ».
    static var validateLabel: String {
        String(localized: "composer.camera.validate",
               defaultValue: "Poser dans la scène", bundle: .main)
    }

    /// **L'action VoiceOver du déclencheur.** Un lecteur d'écran ne TIENT pas
    /// un doigt : sans elle, la vidéo serait offerte à la main et refusée à la
    /// voix — une capacité que le geste rendrait inatteignable.
    static var filmActionLabel: String {
        String(localized: "composer.camera.filmAction",
               defaultValue: "Filmer", bundle: .main)
    }

    /// **Le libellé dit OÙ l'on va**, jamais où l'on est : un lecteur d'écran
    /// n'a pas la carte sous les yeux pour deviner ce qu'un appui ferait.
    static func sizeLabel(_ size: ComposerSceneCameraSize) -> String {
        size == .card
            ? String(localized: "composer.camera.size.enterFullScreen",
                     defaultValue: "Passer en plein écran", bundle: .main)
            : String(localized: "composer.camera.size.exitFullScreen",
                     defaultValue: "Revenir à la carte", bundle: .main)
    }

    /// La bascule d'objectif — l'action, parce qu'elle n'a que deux positions
    /// et qu'aucune des deux n'a besoin d'être nommée pour qu'on sache ce
    /// qu'un appui fera.
    static var flipLabel: String {
        String(localized: "composer.camera.flip",
               defaultValue: "Changer d'objectif", bundle: .main)
    }

    /// **La sortie du viseur.** « Annuler » serait faux — rien n'est annulé,
    /// la scène revient telle qu'elle était. Le mot dit ce qu'on RETROUVE.
    static var disarmLabel: String {
        String(localized: "composer.camera.disarm",
               defaultValue: "Revenir à la scène", bundle: .main)
    }

    /// **L'indication grise d'une scène vide** (#8653) : elle nomme les deux
    /// gestes, ou le seul que le format sert.
    static func quickCaptureHint(_ hint: ComposerSceneQuickCapture.Hint) -> String {
        switch hint {
        case .photoOrVideo:
            return String(localized: "composer.camera.quickHint.photoOrVideo",
                          defaultValue: "Toucher : photo · Maintenir : vidéo", bundle: .main)
        case .videoOnly:
            return String(localized: "composer.camera.quickHint.videoOnly",
                          defaultValue: "Maintenir pour filmer", bundle: .main)
        }
    }

    /// **La scène vide se VEND avant de s'expliquer** (#8671, directive porteur
    /// 2026-09-29 : « être plus commercial : ceci est votre scène, ajouter
    /// texte, dessin, image, vidéo. Puis le petit détail en plus grand »).
    static var emptySceneTitle: String {
        String(localized: "composer.scene.empty.title",
               defaultValue: "Ceci est votre scène", bundle: .main)
    }

    static var emptySceneInvite: String {
        String(localized: "composer.scene.empty.invite",
               defaultValue: "Ajoutez-y un texte, un dessin, une image ou une vidéo — et faites-la vôtre.",
               bundle: .main)
    }

    /// Ce que VoiceOver lit de la scène vide : les trois lignes, dans l'ordre
    /// où l'œil les parcourt.
    static func emptySceneSpoken(_ hint: ComposerSceneQuickCapture.Hint) -> String {
        [emptySceneTitle, emptySceneInvite, quickCaptureHint(hint)].joined(separator: ". ")
    }

    /// **Le cadenas** (#8671) — dit ce que le glissé FAIT.
    static var lockHint: String {
        String(localized: "composer.camera.lock.hint",
               defaultValue: "Glisser vers le cadenas pour verrouiller", bundle: .main)
    }

    /// Annoncé quand le verrou prend : le doigt peut partir.
    static var lockedAnnouncement: String {
        String(localized: "composer.camera.lock.done",
               defaultValue: "Enregistrement verrouillé", bundle: .main)
    }

    static var zoomLabel: String {
        String(localized: "composer.camera.zoom",
               defaultValue: "Zoom", bundle: .main)
    }

    /// Le facteur tel qu'on le lit sur un appareil photo : « 2,5× ».
    static func zoomValue(_ factor: CGFloat) -> String {
        Double(factor).formatted(.number.precision(.fractionLength(1))) + "×"
    }

    static var flashIntensityLabel: String {
        String(localized: "composer.camera.flashIntensity",
               defaultValue: "Intensité du flash", bundle: .main)
    }

    static func flashIntensityValue(_ level: Double) -> String {
        (Double(ComposerFlashIntensity.percent(level)) / 100)
            .formatted(.percent.precision(.fractionLength(0)))
    }

    /// **Le libellé parlé dit l'ACTION, jamais la forme.** « Bouton rond
    /// corail » n'apprend rien ; « Prendre une photo » et « Arrêter
    /// l'enregistrement » disent ce qu'un appui fera — et ils diffèrent selon
    /// le mode, ce qu'un libellé unique ne pourrait pas rendre.
    static func shutterLabel(mode: ComposerSceneCameraMode,
                             stage: ComposerSceneCameraStage) -> String {
        if stage == .recording {
            return String(localized: "camera.record.stop",
                          defaultValue: "Arrêter l'enregistrement", bundle: .main)
        }
        switch mode {
        case .photo:
            return String(localized: "camera.capture.photo",
                          defaultValue: "Prendre une photo", bundle: .main)
        case .video, .handsFree:
            return String(localized: "camera.record.start",
                          defaultValue: "Démarrer l'enregistrement", bundle: .main)
        }
    }
}
