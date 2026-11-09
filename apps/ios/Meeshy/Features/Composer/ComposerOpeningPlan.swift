import Foundation

/// **Ce que le composer fait en s'ouvrant, réglable** (#17269, retour porteur du
/// 2026-11-09) : « armer la caméra à l'ouverture du composeur pendant
/// l'ouverture des images à sélectionner […] Ces deux fonctions doivent être
/// paramétrables […] par défaut True et True ».
///
/// Les deux se règlent dans Réglages › Médias, « À l'ouverture du composer » ;
/// ce type est la seule lecture que le composer en fait.
nonisolated struct ComposerOpeningPreferences: Equatable, Sendable {
    static let armsCameraKey = "composer.opening.armsCamera"
    static let opensLibraryKey = "composer.opening.opensLibrary"

    var armsCamera: Bool
    var opensLibrary: Bool

    static let standard = ComposerOpeningPreferences(armsCamera: true, opensLibrary: true)

    static func stored(in defaults: UserDefaults = .standard) -> ComposerOpeningPreferences {
        ComposerOpeningPreferences(
            armsCamera: defaults.object(forKey: armsCameraKey) as? Bool ?? standard.armsCamera,
            opensLibrary: defaults.object(forKey: opensLibraryKey) as? Bool ?? standard.opensLibrary)
    }
}

/// **L'ouverture d'un composer vierge : la caméra armée derrière, la photothèque
/// à mi-hauteur devant** (#17269). On ne touche plus la scène pour armer : la
/// caméra l'est déjà, et l'appui long sur la scène filme.
nonisolated struct ComposerOpeningPlan: Equatable, Sendable {
    let armsCamera: Bool
    let opensLibrary: Bool

    static let nothing = ComposerOpeningPlan(armsCamera: false, opensLibrary: false)

    /// La caméra s'arme sur une composition vierge, ouverte pour CRÉER, dans un
    /// format qui a un viseur et une scène qui en sert un. La photothèque suit la
    /// loi d'ouverture de `ComposerScenePicking`. Chacune se coupe dans Réglages.
    static func resolve(origin: ComposerOrigin,
                        compositionIsEmpty: Bool,
                        format: ComposerFormat,
                        sceneServesCapture: Bool,
                        preferences: ComposerOpeningPreferences) -> ComposerOpeningPlan {
        let filme = sceneServesCapture && ComposerSceneCamera.initialMode(for: format) != nil
        return ComposerOpeningPlan(
            armsCamera: preferences.armsCamera && filme
                && ComposerScenePicking.opensOnPicker(origin: origin, compositionIsEmpty: compositionIsEmpty),
            opensLibrary: preferences.opensLibrary
                && ComposerScenePicking.opensOnPicker(origin: origin, compositionIsEmpty: compositionIsEmpty))
    }

    /// **Choisir dans la photothèque d'ouverture rend la scène** : la caméra armée
    /// à l'ouverture se retire, sans quoi elle couvrirait les scènes fondées. Elle
    /// reste si l'auteur a déjà filmé, filme ou retouche : rien ne part en silence.
    static func disarmsCameraOnLibraryPick(openingPick: Bool,
                                           stage: ComposerSceneCameraStage,
                                           pendingSegments: Int,
                                           editing: Bool) -> Bool {
        openingPick && stage == .armed && pendingSegments == 0 && !editing
    }

    /// La photothèque d'ouverture se présente à mi-hauteur, la caméra visible
    /// derrière, dès que le système sait le faire (iOS 17) ; avant, en plein écran.
    static func presentsLibraryAtHalfHeight(systemMajorVersion: Int) -> Bool {
        systemMajorVersion >= 17
    }
}
