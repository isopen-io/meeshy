import Foundation

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
