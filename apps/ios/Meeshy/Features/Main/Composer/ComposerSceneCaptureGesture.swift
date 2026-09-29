import Foundation
import MeeshySDK

// MARK: - Le geste qui ouvre la caméra depuis la scène (#4036, #4851)

/// **L'appui long sur une scène vide ouvre la caméra ; l'ouverture du meuble ne
/// l'ouvre plus.**
///
/// ## Ce que cette règle remplace
///
/// `armsCameraOnAppear` (#4751) présentait le viseur AU MONTAGE. Le choix était
/// défendable — la porte « Ajouter une story » promet un appareil photo, et
/// router sans armer aurait tenu la lettre de la directive en perdant ce que la
/// porte annonce. Le porteur l'a révoqué le 2026-09-02 (#4851) : l'auteur qui
/// veut composer traversait un plein écran noir qu'il devait fermer.
///
/// > **ARMER n'est pas PRÉSENTER.** La promesse de la porte survit ici — elle
/// > choisit le MODE — mais elle se tient par un geste disponible plutôt que
/// > par un écran imposé. C'est la distinction que l'ancien nom ne faisait pas,
/// > et elle a coûté un viseur devant chaque scène.
///
/// ## La doctrine, telle que la planche l'écrit
///
/// Vue `2b` de `MeeshyComposerMobile.dc.html` — « Capture : l'appui long ouvre
/// la caméra » :
///
/// > « aperçu caméra · 9:16 · PHOTO · VIDÉO · MAINS LIBRES — maintenir pour
/// > filmer · relâcher pour poser dans la scène. **La caméra est une ENTRÉE,
/// > pas un mode.** Ce qu'elle rend est posé dans la scène. »
///
/// Et la ligne C6a : « l'appui long ouvre la caméra », gardée par
/// `offersCameraStarter` et `profile.allowsCapture`.
///
/// **Le tap bref ne pose PAS de texte** (porteur, 2026-09-03 : « il était
/// question d'ajouter, pour un touché très bref, la possibilité d'ajouter un
/// texte directement, mais on va annuler cela ») — il reste la sélection
/// d'objet que `ComposerSceneBackgroundTapPolicy` gouverne.
nonisolated enum ComposerSceneCaptureGesture {

    /// **Le FORMAT prime la porte, et c'est le sens du geste.**
    ///
    /// À l'ouverture, seule la porte parle. À l'appui long, l'auteur a peut-être
    /// basculé de format entre-temps — la loi 9 lui en donne le droit sans
    /// perdre son contenu. Un réel qui ouvrirait la caméra PHOTO parce que la
    /// porte disait `.cameraReady` poserait une image dans un format qui attend
    /// une vidéo, et l'auteur ne comprendrait pas d'où vient l'erreur.
    ///
    /// La promesse de la porte n'est pas perdue pour autant : elle est le
    /// SECOND rang, honoré partout où le format ne tranche pas lui-même.
    static func mode(format: ComposerFormat, opening: ComposerOpening) -> CameraCaptureMode {
        switch format {
        case .reel: return .video
        case .story, .post, .status:
            return ComposerCameraMode.mode(for: opening)
        }
    }

    /// **Le geste n'existe que là où il a un sens** — c'est la clause « scène
    /// vide ou avec fond vide » de la directive.
    ///
    /// Une scène qui porte déjà un fond rend l'appui long à ce que le canvas en
    /// fait depuis toujours : la manipulation d'objet. Le lui reprendre
    /// casserait l'atelier plein écran, que ce lot doit laisser intact.
    ///
    /// Le mood n'a pas de scène du tout : son profil retire l'entrée caméra
    /// (`ComposerMoodSurface`), et offrir ici un geste que la rangée d'entrées
    /// grise serait une contradiction visible.
    static func offersCapture(backgroundIsEmpty: Bool, format: ComposerFormat) -> Bool {
        guard format != .status else { return false }
        return backgroundIsEmpty
    }
}

// MARK: - La capture RAPIDE sur une scène vide (#8653)

/// **Un toucher ouvre ET prend la photo ; un appui long ouvre ET filme**
/// (directive porteur 2026-09-29).
///
/// > « Lorsque la scène est vide mettre en gris le fait de prendre une photo ou
/// > vidéo rapidement — par tap simple ça ouvre et prend la photo, longpress
/// > ouvre et lance la vidéo ! »
///
/// Avant ce lot, seul l'appui long armait le viseur, et c'était sa LEVÉE qui
/// choisissait : relâché tôt, une photo ; tenu, une vidéo. Deux intentions sur
/// un seul geste, dont la plus courante — la photo — demandait d'appuyer
/// longtemps puis de lâcher vite. Chaque geste porte désormais UNE intention,
/// et l'indication grise de la scène vide les nomme.
nonisolated enum ComposerSceneQuickCapture {

    enum Tap: Equatable, Sendable {
        /// Le viseur s'ouvre et prend la photo dès qu'il est prêt.
        case photo
        /// Le format ne sert pas la photo (un réel) : le viseur s'ouvre, rien
        /// n'est pris — une image dans un format qui attend du mouvement serait
        /// une faute plus grave qu'un geste de plus.
        case armOnly
    }

    enum Release: Equatable, Sendable {
        case closeTake
        case keepFilming
        /// Le doigt est parti avant que la caméra soit prête : rien n'est pris,
        /// jamais une photo que personne n'a demandée.
        case cancelPending
    }

    enum Hint: Equatable, Sendable {
        case photoOrVideo
        case videoOnly
    }

    /// **Rien n'est POSÉ sur la scène.** Une couleur de fond n'y pose rien ;
    /// un texte, un média, un sticker, un tracé, un lieu ou un son, si.
    static func sceneIsBlank(_ slide: StorySlide) -> Bool {
        let effets = slide.effects
        return slide.mediaURL == nil
            && effets.textObjects.isEmpty
            && (effets.mediaObjects ?? []).isEmpty
            && (effets.stickerObjects ?? []).isEmpty
            && (effets.stickers ?? []).isEmpty
            && effets.drawingData == nil
            && (effets.drawingStrokes ?? []).isEmpty
            && effets.locationObjects.isEmpty
            && (effets.audioPlayerObjects ?? []).isEmpty
    }

    /// Le geste — et son indication — n'existent que sur une scène vide, viseur
    /// éteint, aucun outil ouvert, dans un format qui a un viseur.
    static func offers(sceneIsBlank: Bool,
                       format: ComposerFormat,
                       stage: ComposerSceneCameraStage,
                       toolIsOpen: Bool) -> Bool {
        sceneIsBlank && stage == .off && !toolIsOpen && !ComposerSceneCamera.modes(for: format).isEmpty
    }

    static func tap(format: ComposerFormat) -> Tap? {
        let modes = ComposerSceneCamera.modes(for: format)
        guard !modes.isEmpty else { return nil }
        return modes.contains(.photo) ? .photo : .armOnly
    }

    /// **Un geste, une ligne, son icône** (#8671, complément porteur
    /// 2026-09-29 : « l'instruction de taper photo peut avoir l'appareil photo
    /// au-devant, et à la ligne une caméra vidéo pour la partie long press »).
    enum GestureLine: Equatable, Sendable {
        case tapPhoto
        case holdFilm

        var symbol: String {
            switch self {
            case .tapPhoto: return "camera"
            case .holdFilm: return "video"
            }
        }
    }

    static func gestureLines(_ hint: Hint) -> [GestureLine] {
        switch hint {
        case .photoOrVideo: return [.tapPhoto, .holdFilm]
        case .videoOnly:    return [.holdFilm]
        }
    }

    static func hint(format: ComposerFormat) -> Hint? {
        switch tap(format: format) {
        case .photo:   return .photoOrVideo
        case .armOnly: return .videoOnly
        case nil:      return nil
        }
    }

    /// Le temps que l'exposition se pose après l'ouverture de la session : une
    /// photo prise sur la première image sortirait sombre.
    static let exposureSettle: TimeInterval = 0.35

    /// Au-delà, la caméra ne viendra pas (simulateur, matériel occupé) : le
    /// viseur reste ouvert, et son propre déclencheur prend le relais.
    static let readinessTimeout: TimeInterval = 3
}
