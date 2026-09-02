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
    /// (média non-bg, texte, sticker ou pastille de lieu). Sans la pastille,
    /// une slide qui n'en porte QU'une restait en `.canvas` : tous les gestes
    /// étaient absorbés et le badge figé là où il avait été posé.
    static func hasForegroundContent(_ effects: StoryEffects) -> Bool {
        let medias = effects.mediaObjects ?? []
        return medias.contains(where: { $0.isBackground != true })
            || !effects.textObjects.isEmpty
            || !(effects.stickerObjects ?? []).isEmpty
            || !effects.locationObjects.isEmpty
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

    /// **Ce qu'un GESTE peut saisir — quatre familles sur cinq** (#4591).
    ///
    /// L'audio en est exclu, et la cascade qui vivait ici ne le disait pas :
    /// elle interrogeait quatre tableaux et rendait `nil` pour le cinquième par
    /// omission. Le `switch` exhaustif préserve exactement ce comportement et
    /// le rend visible.
    ///
    /// > **Cette exclusion est DATÉE.** La directive porteur du 2026-08-31 pose
    /// > que tout objet de scène se redimensionne et tourne, et #4579 veut des
    /// > chips de son déplaçables. Le jour où l'audio devient saisissable, c'est
    /// > ICI que la décision se prend — le `switch` l'exige, là où la cascade
    /// > l'aurait laissée passer en silence.
    private func manipulable(_ id: String) -> MeeshySceneObject? {
        guard let objet = slide.sceneObject(id: id) else { return nil }
        switch objet.kind {
        case .text, .media, .sticker, .location: return objet
        case .audio: return nil
        }
    }

    func currentItemNormalizedPosition(forId id: String) -> (Double, Double)? {
        manipulable(id).map { ($0.x, $0.y) }
    }

    func currentScale(forId id: String) -> Double? {
        manipulable(id)?.scale
    }

    func currentRotation(forId id: String) -> Double? {
        manipulable(id)?.rotation
    }

    func updatePosition(slideId: String, x: Double, y: Double) -> StorySlide {
        mutateItem(slideId: slideId,
                   text:     { $0.x = x; $0.y = y },
                   media:    { $0.x = x; $0.y = y },
                   sticker:  { $0.x = x; $0.y = y },
                   location: { $0.x = x; $0.y = y },
                   // La chip de son porte `x`/`y` en `CGFloat` là où les quatre
                   // autres les portent en `Double` — la conversion est écrite,
                   // jamais laissée à l'implicite.
                   audio:    { $0.x = CGFloat(x); $0.y = CGFloat(y) })
    }

    func updateScale(slideId: String, scale: Double) -> StorySlide {
        mutateItem(slideId: slideId,
                   text:     { $0.scale = scale },
                   media:    { $0.scale = scale },
                   sticker:  { $0.scale = scale },
                   location: { $0.scale = scale },
                   audio:    { $0.scale = scale })
    }

    func updateRotation(slideId: String, rotation: Double) -> StorySlide {
        mutateItem(slideId: slideId,
                   text:     { $0.rotation = rotation },
                   media:    { $0.rotation = rotation },
                   sticker:  { $0.rotation = rotation },
                   location: { $0.rotation = rotation },
                   audio:    { $0.rotation = rotation })
    }

    /// **Les CINQ familles, et le paramètre `audio` est SANS défaut** (#4759).
    ///
    /// Il en connaissait QUATRE — le son manquait — pendant que `bringForward`
    /// et `sendBackward` en LISAIENT cinq. Un lecteur à cinq familles servi par
    /// un écrivain à quatre produit deux symptômes, et le second est le pire :
    /// avancer une chip de son ne faisait rien (loi 4, contrôle inerte), mais
    /// faire passer un TEXTE devant elle appliquait l'échange **à moitié** — le
    /// texte prenait le rang du son, le son gardait le sien, et les deux se
    /// retrouvaient au MÊME rang. L'utilisateur voyait alors un résultat qui
    /// n'était ni l'avant ni l'après.
    ///
    /// > Une valeur lue à un seul endroit ne peut pas être lue de travers
    /// > ailleurs — mais rien ne garantit que ce qu'on LIT soit ce qu'on puisse
    /// > ÉCRIRE. L'asymétrie lecteur/écrivain ne rougit nulle part : les deux
    /// > côtés compilent, et l'échange partiel a l'air d'un défaut d'affichage.
    ///
    /// Le paramètre n'a **aucune valeur par défaut**, délibérément : un
    /// `audio: { _ in }` implicite aurait fait taire le compilateur sur
    /// exactement la question qu'il faut poser à chaque nouvel appelant — « et
    /// pour le son ? ». C'est la même raison qui a fait déclarer sans défaut
    /// `moodSeed` et `mediaSeed` chez le meuble.
    func mutateItem(slideId: String,
                            text:     (inout StoryTextObject)        -> Void,
                            media:    (inout StoryMediaObject)       -> Void,
                            sticker:  (inout StorySticker)           -> Void,
                            location: (inout StoryLocationObject)    -> Void,
                            audio:    (inout StoryAudioPlayerObject) -> Void) -> StorySlide {
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
        for i in newSlide.locationObjects.indices where newSlide.locationObjects[i].id == slideId {
            var badges = newSlide.locationObjects
            location(&badges[i])
            newSlide.locationObjects = badges
            return newSlide
        }
        if var arr = newSlide.effects.audioPlayerObjects {
            for i in arr.indices where arr[i].id == slideId {
                audio(&arr[i])
                newSlide.effects.audioPlayerObjects = arr
                return newSlide
            }
        }
        return newSlide
    }

    nonisolated func clamp(_ value: Double) -> Double {
        max(0, min(1, value))
    }

    /// `true` quand l'élément porte le verrou d'édition. Seul le badge
    /// d'attribution d'une republication le porte, posé par
    /// `StoryComposerViewModel(reposting:)` : ce verrou EST la garantie que
    /// l'attribution ne peut pas être retirée. Le ViewModel garde déjà
    /// `deleteElement` / `duplicateElement` ; les chemins canvas — menu
    /// long-press, action VoiceOver — mutent `slide.effects` sans passer par
    /// lui et ont besoin de la leur.
    func isLockedItem(id: String) -> Bool {
        StorySceneObjectPredicates.isLocked(slide: slide, id: id)
    }

    func deleteItem(id: String) {
        guard !isLockedItem(id: id) else { return }
        var newSlide = slide
        newSlide.effects.textObjects.removeAll { $0.id == id }
        newSlide.effects.mediaObjects?.removeAll { $0.id == id }
        newSlide.effects.stickerObjects?.removeAll { $0.id == id }
        newSlide.locationObjects.removeAll { $0.id == id }
        // Cinquième famille (#4759) : sans cette ligne, une chip de son ne
        // pouvait pas être supprimée par les chemins du canvas — menu
        // long-press, action VoiceOver — et le geste n'avait AUCUN effet.
        newSlide.effects.audioPlayerObjects?.removeAll { $0.id == id }
        slide = newSlide
        onItemModified?(slide)
    }

    func duplicateItem(id: String) {
        guard !isLockedItem(id: id) else { return }
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
        if let original = newSlide.locationObjects.first(where: { $0.id == id }) {
            var copy = original
            copy.id = UUID().uuidString
            copy.x = clamp(copy.x + 0.05)
            copy.y = clamp(copy.y + 0.05)
            copy.zIndex = nextTopZ()
            newSlide.locationObjects.append(copy)
            slide = newSlide
            onItemModified?(slide)
            return
        }
    }

    func sendToBack(id: String) {
        let newZ = nextBottomZ()
        slide = mutateItem(slideId: id,
                           text:     { $0.zIndex = newZ },
                           media:    { $0.zIndex = newZ },
                           sticker:  { $0.zIndex = newZ },
                           location: { $0.zIndex = newZ },
                           audio:    { $0.zIndex = newZ })
        onItemModified?(slide)
    }

    func bringForward(id: String) {
        // **La somme à cinq cas, jamais une énumération réécrite ici** (#4759).
        // `sceneObjects` aplatit les cinq familles ET les trie déjà du fond
        // vers l'avant, à ordre de famille stable pour les `zIndex` égaux. Les
        // deux boucles manuelles qui vivaient ici et dans `allItemZIndexes()`
        // ont chacune oublié une famille différente : c'est ce que le type
        // `MeeshySceneObject` existe pour empêcher, et l'oubli a coûté #4759.
        let elements = slide.sceneObjects.map { ($0.id, $0.zIndex) }
        
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

        slide = mutateItem(slideId: id, text: { $0.zIndex = newCurrentZ }, media: { $0.zIndex = newCurrentZ },
                           sticker: { $0.zIndex = newCurrentZ }, location: { $0.zIndex = newCurrentZ },
                           audio: { $0.zIndex = newCurrentZ })
        slide = mutateItem(slideId: nextId, text: { $0.zIndex = newNextZ }, media: { $0.zIndex = newNextZ },
                           sticker: { $0.zIndex = newNextZ }, location: { $0.zIndex = newNextZ },
                           audio: { $0.zIndex = newNextZ })
        onItemModified?(slide)
    }

    func sendBackward(id: String) {
        // **La somme à cinq cas, jamais une énumération réécrite ici** (#4759).
        // `sceneObjects` aplatit les cinq familles ET les trie déjà du fond
        // vers l'avant, à ordre de famille stable pour les `zIndex` égaux. Les
        // deux boucles manuelles qui vivaient ici et dans `allItemZIndexes()`
        // ont chacune oublié une famille différente : c'est ce que le type
        // `MeeshySceneObject` existe pour empêcher, et l'oubli a coûté #4759.
        let elements = slide.sceneObjects.map { ($0.id, $0.zIndex) }
        
        guard let index = elements.firstIndex(where: { $0.0 == id }), index > 0 else { return }
        
        let currentZ = elements[index].1
        let prevZ = elements[index - 1].1
        
        // Miroir de bringForward : si égalité fortuite, on incrémente prev
        // au-dessus pour casser l'égalité. Sinon swap pur. newCurrentZ vaut
        // prevZ dans les deux cas (ternaire trivial nettoyé).
        let newCurrentZ = prevZ
        let newPrevZ = (currentZ == prevZ) ? currentZ + 1 : currentZ
        
        let prevId = elements[index - 1].0
        
        slide = mutateItem(slideId: id, text: { $0.zIndex = newCurrentZ }, media: { $0.zIndex = newCurrentZ },
                           sticker: { $0.zIndex = newCurrentZ }, location: { $0.zIndex = newCurrentZ },
                           audio: { $0.zIndex = newCurrentZ })
        slide = mutateItem(slideId: prevId, text: { $0.zIndex = newPrevZ }, media: { $0.zIndex = newPrevZ },
                           sticker: { $0.zIndex = newPrevZ }, location: { $0.zIndex = newPrevZ },
                           audio: { $0.zIndex = newPrevZ })
        onItemModified?(slide)
    }

    func nextTopZ() -> Int {
        (allItemZIndexes().max() ?? 0) + 1
    }

    func nextBottomZ() -> Int {
        (allItemZIndexes().min() ?? 0) - 1
    }

    /// **Les rangs de TOUS les objets, son compris** (#4759).
    ///
    /// Cette énumération oubliait `audioPlayerObjects` — une famille de plus que
    /// celle qu'oubliait `mutateItem`, et c'est ce décalage qui rendait le
    /// défaut si difficile à voir : chaque site oubliait une chose différente.
    /// Conséquence propre à celui-ci : `nextTopZ()` pouvait rendre un rang
    /// INFÉRIEUR à celui d'une chip de son, donc « mettre au premier plan »
    /// plaçait l'objet DERRIÈRE elle.
    private func allItemZIndexes() -> [Int] {
        slide.sceneObjects.map(\.zIndex)
    }
}
