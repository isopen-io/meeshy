import UIKit
import QuartzCore
import CoreMedia
import AVFoundation
import Metal
import PencilKit
import Combine
import os
import MeeshySDK

// MARK: - StoryCanvasUIView + Manipulation

extension StoryCanvasUIView {
    /// Recalcule `currentManipulationLayer` à partir du contenu de la slide.
    /// Textes et stickers comptent comme foreground (cohérent avec le modèle
    /// de couches : tout ce qui n'est pas un bg media bloque la manipulation
    /// du bg). N'émet via `onManipulationLayerChanged` que si la valeur a
    /// effectivement changé — pour les re-emissions « défensives »
    /// (bootstrap, resync SwiftUI), utiliser `emitCurrentManipulationLayer()`.
    func updateManipulationLayer() {
        let new = Self.resolveManipulationLayer(for: slide.effects,
                                                override: manualManipulationLayerOverride)
        guard new != currentManipulationLayer else { return }
        currentManipulationLayer = new
        onManipulationLayerChanged?(new)
    }

    /// Sélection utilisateur explicite d'une couche manipulable via les chips
    /// « Arrière-plan » / « Premier plan » de la bordure gauche (directive
    /// user 2026-07-14). Pose l'override, recalcule la couche courante et
    /// propage au composer (highlight). L'override reste actif tant qu'il est
    /// valide pour le contenu ; sinon `updateManipulationLayer()` retombe sur
    /// l'auto-dérivation.
    public func setManipulationLayer(_ layer: CanvasManipulationLayer) {
        manualManipulationLayerOverride = layer
        let resolved = Self.resolveManipulationLayer(for: slide.effects, override: layer)
        currentManipulationLayer = resolved
        onManipulationLayerChanged?(resolved)
    }

    /// Résolution pure de la couche manipulable à partir des effets d'une
    /// slide. Extraite en `static` pour permettre les tests sans monter de
    /// UIView. Règle : fg media OU text OU sticker → `.foreground`, sinon
    /// bg media → `.background`, sinon `.canvas`.
    public static func resolveManipulationLayer(for effects: StoryEffects) -> CanvasManipulationLayer {
        if hasForegroundContent(effects) { return .foreground }
        if hasBackgroundContent(effects) { return .background }
        return .canvas
    }

    /// Résolution avec la sélection utilisateur (chips arrière-plan / premier
    /// plan). L'override prime tant qu'il correspond à du contenu réel, sinon
    /// on retombe sur l'auto-dérivation — un chip pointant vers une couche
    /// vide (ex. « Arrière-plan » sans fond) ne doit jamais geler l'édition.
    public static func resolveManipulationLayer(
        for effects: StoryEffects,
        override: CanvasManipulationLayer?
    ) -> CanvasManipulationLayer {
        let auto = resolveManipulationLayer(for: effects)
        switch override {
        case .background:
            return hasBackgroundContent(effects) ? .background : auto
        case .foreground:
            return hasForegroundContent(effects) ? .foreground : auto
        case .canvas, .none:
            return auto
        }
    }

    /// Vrai si la slide porte au moins un élément foreground manipulable
    /// (média non-bg, texte ou sticker).
    static func hasForegroundContent(_ effects: StoryEffects) -> Bool {
        let medias = effects.mediaObjects ?? []
        return medias.contains(where: { $0.isBackground != true })
            || !effects.textObjects.isEmpty
            || !(effects.stickerObjects ?? []).isEmpty
    }

    /// Vrai si la slide porte un média d'arrière-plan manipulable.
    static func hasBackgroundContent(_ effects: StoryEffects) -> Bool {
        let medias = effects.mediaObjects ?? []
        return medias.contains(where: { $0.isBackground == true })
            || effects.resolvedBackgroundMedia != nil
    }

    /// Reçoit la sélection de couche postée par les chips « Arrière-plan » /
    /// « Premier plan » du composer. Gaté `.edit` : en lecture (`.play`) aucun
    /// choix de couche manipulable n'a de sens.
    @objc func handleSelectManipulationLayer(_ note: Notification) {
        guard mode == .edit else { return }
        guard let raw = note.object as? String,
              let layer = CanvasManipulationLayer(rawValue: raw) else { return }
        setManipulationLayer(layer)
    }

    /// Force la propagation de la couche courante (sans recompute) — appelée
    /// par le `UIViewRepresentable` après (re)assignation du callback côté
    /// SwiftUI pour garantir que le chip indicator reflète bien la couche
    /// active dès la première frame, et après chaque body eval.
    public func emitCurrentManipulationLayer() {
        onManipulationLayerChanged?(currentManipulationLayer)
    }

    /// Résout l'id de l'élément manipulable courant pour un gesture qui
    /// vient de commencer. Retourne `nil` si la couche active est `.canvas`
    /// (gesture absorbé), ou si le hit-test n'a rien trouvé de manipulable
    /// pour la couche courante.
    ///
    /// Règle `.foreground` : SEULS les éléments foreground sont manipulables.
    /// Le fond n'est mouvable QUE via le chip Background (règle produit,
    /// user 2026-07-11 : « le background ne doit être mouvable que si le
    /// chip background est sélectionné ») — l'ancien fallback bg (spec
    /// 2026-05-22) rendait n'importe quel raté de hit-test destructeur pour
    /// le cadrage du fond.
    internal func resolveManipulationTarget(at location: CGPoint) -> String? {
        switch currentManipulationLayer {
        case .canvas:
            return nil
        case .background:
            return resolveBackgroundMediaId()
        case .foreground:
            return hitTestForegroundItem(at: location)
        }
    }

    /// Résolution unique du bg media : préfère le flag explicite
    /// `isBackground == true`, retombe sur `resolvedBackgroundMedia`.
    func resolveBackgroundMediaId() -> String? {
        if let bg = slide.effects.mediaObjects?.first(where: { $0.isBackground == true }) {
            return bg.id
        }
        return slide.effects.resolvedBackgroundMedia?.id
    }

    func currentItemNormalizedPosition(forId id: String) -> (Double, Double)? {
        if let t = slide.effects.textObjects.first(where: { $0.id == id }) {
            return (t.x, t.y)
        }
        if let m = slide.effects.mediaObjects?.first(where: { $0.id == id }) {
            return (m.x, m.y)
        }
        if let s = slide.effects.stickerObjects?.first(where: { $0.id == id }) {
            return (s.x, s.y)
        }
        return nil
    }

    func currentScale(forId id: String) -> Double? {
        if let t = slide.effects.textObjects.first(where: { $0.id == id }) { return t.scale }
        if let m = slide.effects.mediaObjects?.first(where: { $0.id == id }) { return m.scale }
        if let s = slide.effects.stickerObjects?.first(where: { $0.id == id }) { return s.scale }
        return nil
    }

    func currentRotation(forId id: String) -> Double? {
        if let t = slide.effects.textObjects.first(where: { $0.id == id }) { return t.rotation }
        if let m = slide.effects.mediaObjects?.first(where: { $0.id == id }) { return m.rotation }
        if let s = slide.effects.stickerObjects?.first(where: { $0.id == id }) { return s.rotation }
        return nil
    }

    func updatePosition(slideId: String, x: Double, y: Double) -> StorySlide {
        mutateItem(slideId: slideId,
                   text:    { $0.x = x; $0.y = y },
                   media:   { $0.x = x; $0.y = y },
                   sticker: { $0.x = x; $0.y = y })
    }

    func updateScale(slideId: String, scale: Double) -> StorySlide {
        mutateItem(slideId: slideId,
                   text:    { $0.scale = scale },
                   media:   { $0.scale = scale },
                   sticker: { $0.scale = scale })
    }

    func updateRotation(slideId: String, rotation: Double) -> StorySlide {
        mutateItem(slideId: slideId,
                   text:    { $0.rotation = rotation },
                   media:   { $0.rotation = rotation },
                   sticker: { $0.rotation = rotation })
    }

    func mutateItem(slideId: String,
                            text:    (inout StoryTextObject)  -> Void,
                            media:   (inout StoryMediaObject) -> Void,
                            sticker: (inout StorySticker)     -> Void) -> StorySlide {
        var newSlide = slide
        for i in newSlide.effects.textObjects.indices where newSlide.effects.textObjects[i].id == slideId {
            text(&newSlide.effects.textObjects[i])
            return newSlide
        }
        if var arr = newSlide.effects.mediaObjects {
            for i in arr.indices where arr[i].id == slideId {
                media(&arr[i])
                newSlide.effects.mediaObjects = arr
                return newSlide
            }
        }
        if var arr = newSlide.effects.stickerObjects {
            for i in arr.indices where arr[i].id == slideId {
                sticker(&arr[i])
                newSlide.effects.stickerObjects = arr
                return newSlide
            }
        }
        return newSlide
    }

    nonisolated func clamp(_ value: Double) -> Double {
        max(0, min(1, value))
    }

    func deleteItem(id: String) {
        var newSlide = slide
        newSlide.effects.textObjects.removeAll { $0.id == id }
        newSlide.effects.mediaObjects?.removeAll { $0.id == id }
        newSlide.effects.stickerObjects?.removeAll { $0.id == id }
        slide = newSlide
        onItemModified?(slide)
    }

    func duplicateItem(id: String) {
        var newSlide = slide
        if let original = newSlide.effects.textObjects.first(where: { $0.id == id }) {
            var copy = original
            copy.id = UUID().uuidString
            copy.x = clamp(copy.x + 0.05)
            copy.y = clamp(copy.y + 0.05)
            copy.zIndex = nextTopZ()
            newSlide.effects.textObjects.append(copy)
            slide = newSlide
            onItemModified?(slide)
            return
        }
        if let original = newSlide.effects.mediaObjects?.first(where: { $0.id == id }) {
            var copy = original
            copy.id = UUID().uuidString
            copy.x = clamp(copy.x + 0.05)
            copy.y = clamp(copy.y + 0.05)
            copy.zIndex = nextTopZ()
            newSlide.effects.mediaObjects = (newSlide.effects.mediaObjects ?? []) + [copy]
            slide = newSlide
            onItemModified?(slide)
            return
        }
        if let original = newSlide.effects.stickerObjects?.first(where: { $0.id == id }) {
            var copy = original
            copy.id = UUID().uuidString
            copy.x = clamp(copy.x + 0.05)
            copy.y = clamp(copy.y + 0.05)
            copy.zIndex = nextTopZ()
            newSlide.effects.stickerObjects = (newSlide.effects.stickerObjects ?? []) + [copy]
            slide = newSlide
            onItemModified?(slide)
            return
        }
    }

    func sendToBack(id: String) {
        let newZ = nextBottomZ()
        slide = mutateItem(slideId: id,
                           text:    { $0.zIndex = newZ },
                           media:   { $0.zIndex = newZ },
                           sticker: { $0.zIndex = newZ })
        onItemModified?(slide)
    }

    func bringForward(id: String) {
        var elements = slide.effects.textObjects.map { ($0.id, $0.zIndex) }
        elements += (slide.effects.mediaObjects ?? []).map { ($0.id, $0.zIndex) }
        elements += (slide.effects.audioPlayerObjects ?? []).map { ($0.id, $0.zIndex ?? 0) }
        elements += (slide.effects.stickerObjects ?? []).map { ($0.id, $0.zIndex) }
        
        elements.sort { $0.1 < $1.1 }
        
        guard let index = elements.firstIndex(where: { $0.0 == id }), index < elements.count - 1 else { return }
        
        let currentZ = elements[index].1
        let nextZ = elements[index + 1].1
        
        // Quand currentZ == nextZ (égalité fortuite), on doit "casser" l'égalité
        // en plaçant current au-dessus. Sinon swap pur (newCurrentZ = nextZ,
        // newNextZ = currentZ). Dans les deux cas, newNextZ vaut currentZ — le
        // ternaire trivial `cond ? currentZ : currentZ` a été remplacé.
        let newCurrentZ = (currentZ == nextZ) ? nextZ + 1 : nextZ
        let newNextZ = currentZ

        let nextId = elements[index + 1].0

        slide = mutateItem(slideId: id, text: { $0.zIndex = newCurrentZ }, media: { $0.zIndex = newCurrentZ }, sticker: { $0.zIndex = newCurrentZ })
        slide = mutateItem(slideId: nextId, text: { $0.zIndex = newNextZ }, media: { $0.zIndex = newNextZ }, sticker: { $0.zIndex = newNextZ })
        onItemModified?(slide)
    }

    func sendBackward(id: String) {
        var elements = slide.effects.textObjects.map { ($0.id, $0.zIndex) }
        elements += (slide.effects.mediaObjects ?? []).map { ($0.id, $0.zIndex) }
        elements += (slide.effects.audioPlayerObjects ?? []).map { ($0.id, $0.zIndex ?? 0) }
        elements += (slide.effects.stickerObjects ?? []).map { ($0.id, $0.zIndex) }
        
        elements.sort { $0.1 < $1.1 }
        
        guard let index = elements.firstIndex(where: { $0.0 == id }), index > 0 else { return }
        
        let currentZ = elements[index].1
        let prevZ = elements[index - 1].1
        
        // Miroir de bringForward : si égalité fortuite, on incrémente prev
        // au-dessus pour casser l'égalité. Sinon swap pur. newCurrentZ vaut
        // prevZ dans les deux cas (ternaire trivial nettoyé).
        let newCurrentZ = prevZ
        let newPrevZ = (currentZ == prevZ) ? currentZ + 1 : currentZ
        
        let prevId = elements[index - 1].0
        
        slide = mutateItem(slideId: id, text: { $0.zIndex = newCurrentZ }, media: { $0.zIndex = newCurrentZ }, sticker: { $0.zIndex = newCurrentZ })
        slide = mutateItem(slideId: prevId, text: { $0.zIndex = newPrevZ }, media: { $0.zIndex = newPrevZ }, sticker: { $0.zIndex = newPrevZ })
        onItemModified?(slide)
    }

    func nextTopZ() -> Int {
        let allZ = slide.effects.textObjects.map(\.zIndex)
            + (slide.effects.mediaObjects?.map(\.zIndex) ?? [])
            + (slide.effects.stickerObjects?.map(\.zIndex) ?? [])
        return (allZ.max() ?? 0) + 1
    }

    func nextBottomZ() -> Int {
        let allZ = slide.effects.textObjects.map(\.zIndex)
            + (slide.effects.mediaObjects?.map(\.zIndex) ?? [])
            + (slide.effects.stickerObjects?.map(\.zIndex) ?? [])
        return (allZ.min() ?? 0) - 1
    }
}
