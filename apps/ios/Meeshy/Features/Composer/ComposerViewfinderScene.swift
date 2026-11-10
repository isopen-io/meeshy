import Foundation
import MeeshySDK

/// **La scène se pose PAR-DESSUS le viseur, et ce que prend le viseur en devient le fond**
/// (#17432, directive porteur 2026-11-10 : « Une scène par-dessus le viseur existe pour poser
/// les éléments, et le fond se construit par ce que prend le viseur »).
///
/// Pendant qu'on cadre, l'aperçu de l'objectif EST le fond de la scène : les objets déjà posés
/// (texte, sticker, média de premier plan) se peignent dessus, sur un canvas transparent, à la
/// place même où la scène les montre, et se déplacent ou se pincent sans quitter la caméra. La
/// prise posée devient le fond de la slide, sous eux, intacts.
nonisolated enum ComposerViewfinderScene {

    /// Les calques du viseur, de bas en haut.
    enum Layer: Equatable, Sendable {
        /// L'aperçu de l'objectif — le fond.
        case viewfinder
        /// Les objets de la scène, sur un canvas sans fond.
        case sceneObjects
        /// Le déclencheur, le rail bas gauche, l'en-tête.
        case chrome
    }

    static func layers(showsSceneObjects: Bool) -> [Layer] {
        showsSceneObjects ? [.viewfinder, .sceneObjects, .chrome] : [.viewfinder, .chrome]
    }

    /// La prise sera-t-elle le FOND de la slide ? Oui sans fond média, ou quand elle le
    /// remplace (« Reprendre une photo ») ; sinon la porte du rail la pose en premier plan.
    static func captureFoundsBackground(effects: StoryEffects, replacesBackground: Bool) -> Bool {
        replacesBackground || !effects.hasVisualBackgroundMedia
    }

    /// Les objets se montrent-ils sur le viseur ? Armé ou filmant, hors retouche (plein écran,
    /// elle cadre la prise seule), s'il y a quelque chose à montrer, et seulement si la prise en
    /// sera le fond : sinon l'aperçu mentirait sur ce qui passe dessous.
    static func showsSceneObjects(stage: ComposerSceneCameraStage, editing: Bool,
                                  effects: StoryEffects, replacesBackground: Bool) -> Bool {
        guard stage != .off, !editing, hasObjects(effects) else { return false }
        return captureFoundsBackground(effects: effects, replacesBackground: replacesBackground)
    }

    static func hasObjects(_ effects: StoryEffects) -> Bool {
        !(effects.textObjects ?? []).isEmpty
            || !(effects.stickerObjects ?? []).isEmpty
            || !effects.resolvedForegroundMediaObjects.isEmpty
    }

    /// Où va un toucher du viseur.
    enum Touch: Equatable, Sendable {
        /// Un contrôle du viseur : il passe avant tout.
        case chrome
        /// Un objet posé : il se sélectionne, se déplace, se pince.
        case sceneObject
        /// Une zone vide : toucher-photo, appui long-vidéo, zoom.
        case capture
    }

    static func route(onChrome: Bool, onSceneObject: Bool, objectsTakeTouches: Bool) -> Touch {
        if onChrome { return .chrome }
        return onSceneObject && objectsTakeTouches ? .sceneObject : .capture
    }

    /// Les objets prennent le doigt viseur armé seulement : une tenue ou une prise garde le sien.
    static func objectsTakeTouches(stage: ComposerSceneCameraStage, holding: Bool) -> Bool {
        stage == .armed && !holding
    }
}
