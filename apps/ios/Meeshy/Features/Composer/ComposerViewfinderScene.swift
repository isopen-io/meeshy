import Foundation
import CoreGraphics
import MeeshySDK

/// **La scène se pose PAR-DESSUS le viseur, et ce que prend le viseur en devient le fond**
/// (#17432, directive porteur : « Une scène par-dessus le viseur existe pour poser
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

    /// Les objets se montrent-ils sur le viseur ? Armé, filmant ou en retouche (#18654 : le
    /// sticker posé depuis la colonne s'y voit) — sauf pendant le recadrage, qui pose la prise
    /// dans un cadre —, s'il y a quelque chose à montrer, et seulement si la prise en
    /// sera le fond : sinon l'aperçu mentirait sur ce qui passe dessous.
    static func showsSceneObjects(stage: ComposerSceneCameraStage, cropFrames: Bool,
                                  effects: StoryEffects, replacesBackground: Bool) -> Bool {
        guard stage != .off, !cropFrames, hasObjects(effects) else { return false }
        return captureFoundsBackground(effects: effects, replacesBackground: replacesBackground)
    }

    static func hasObjects(_ effects: StoryEffects) -> Bool {
        !effects.textObjects.isEmpty
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
        /// Une zone vide pendant qu'on écrit : la saisie se termine, rien n'est pris.
        case endTyping
        /// La galerie ouverte par-dessus (#18709) : le toucher la referme, sans prise ni zoom.
        case closeLibrary
    }

    static func route(onChrome: Bool, onSceneObject: Bool, objectsTakeTouches: Bool, typing: Bool = false,
                      libraryOpen: Bool = false) -> Touch {
        if onChrome { return .chrome }
        if libraryOpen { return .closeLibrary }
        if onSceneObject && objectsTakeTouches { return .sceneObject }
        return typing ? .endTyping : .capture
    }

    /// **Le texte qui se saisit SUR le viseur** (#18638) : celui du modèle, tant que l'aperçu se
    /// montre avec les objets de la scène. `nil` : la scène saisit elle-même. Un seul canvas
    /// tient le clavier.
    static func typedTextId(showsViewfinder: Bool, showsSceneObjects: Bool, editingTextId: String?) -> String? {
        showsViewfinder && showsSceneObjects ? editingTextId : nil
    }

    /// Le plancher de la saisie, à l'écran : le haut du clavier (sa barre comprise) ; sans
    /// clavier à l'écran, aucun plancher.
    static func typingFloor(keyboardEndFrame: CGRect, screenHeight: CGFloat) -> CGFloat {
        keyboardEndFrame.height > 0 && keyboardEndFrame.minY < screenHeight ? keyboardEndFrame.minY : .greatestFiniteMagnitude
    }

    /// Où se posent les objets : à la place de la carte ; pendant la frappe, à celle qu'elle
    /// avait à son début — la scène couverte se réduit pour le clavier, l'aperçu garde l'écran.
    static func objectsFrame(card: CGRect, heldWhileTyping: CGRect?, typing: Bool) -> CGRect {
        typing ? heldWhileTyping ?? card : card
    }

    /// Le voile posé sur TOUT l'aperçu pendant la frappe : le texte reste lisible sur l'image vive.
    static let typingVeilOpacity: Double = 0.35

    /// Pendant la frappe, le déclencheur, le rail et la phrase du geste cèdent au clavier.
    static func servesCaptureControls(typing: Bool) -> Bool {
        !typing
    }

    /// Les objets prennent le doigt viseur armé seulement : une tenue ou une prise garde le sien.
    /// En retouche ils se montrent sans le prendre : le doigt y cadre la prise et ses outils.
    static func objectsTakeTouches(stage: ComposerSceneCameraStage, holding: Bool, editing: Bool = false) -> Bool {
        stage == .armed && !holding && !editing
    }
}
