import Foundation
import MeeshySDK

// MARK: - DrawingEditTool

/// Les 5 contrôles de dessin exposés en mode édition flottante. L'ordre des `case`
/// fixe l'ordre d'affichage des bulles dans la rangée (mirror de `TextEditTool`).
public enum DrawingEditTool: String, CaseIterable, Sendable, Equatable {
    case tool       // pinceau : pen / marker / eraser
    case color      // couleur du pinceau / du trait sélectionné
    case thickness  // épaisseur
    case smoothing  // lissage : raw / curve / line

    var sfSymbol: String {
        switch self {
        case .tool:      return "pencil.tip"
        case .color:     return "paintpalette.fill"
        case .thickness: return "lineweight"
        case .smoothing: return "scribble.variable"
        }
    }

    var accessibilityLabel: String {
        switch self {
        case .tool:      return String(localized: "story.drawEdit.tool.tool", defaultValue: "Pinceau", bundle: .module)
        case .color:     return String(localized: "story.drawEdit.tool.color", defaultValue: "Couleur du trait", bundle: .module)
        case .thickness: return String(localized: "story.drawEdit.tool.thickness", defaultValue: "Épaisseur du trait", bundle: .module)
        case .smoothing: return String(localized: "story.drawEdit.tool.smoothing", defaultValue: "Lissage du trait", bundle: .module)
        }
    }
}

// MARK: - DrawingEditingMode

/// État du mode d'édition de dessin flottant. Orthogonal à `BandStateMachine`.
/// `strokeId` = trait sélectionné pour l'édition par-trait (`nil` = aucun, on édite
/// alors le pinceau actif). `expandedTool` = panneau d'options déplié.
public enum DrawingEditingMode: Equatable, Sendable {
    case inactive
    case active(strokeId: String?, expandedTool: DrawingEditTool?)

    public var isActive: Bool {
        if case .active = self { return true }
        return false
    }

    public var selectedStrokeId: String? {
        if case .active(let id, _) = self { return id }
        return nil
    }

    public var expandedTool: DrawingEditTool? {
        if case .active(_, let tool) = self { return tool }
        return nil
    }
}

// MARK: - StoryComposerViewModel : drawing strokes + transitions

extension StoryComposerViewModel {

    /// Traits éditables du slide courant. Source de vérité = `currentEffects.drawingStrokes`
    /// (pas de cache `@Published` séparé : l'observation SwiftUI passe par `slides`, ce qui
    /// évite la staleness du double-cache dont souffre `drawingData`). Un tableau vide
    /// remet `currentEffects.drawingStrokes` à `nil` (le rendu retombe alors sur le legacy
    /// `drawingData` s'il existe).
    var drawingStrokes: [StoryDrawingStroke] {
        get { currentEffects.drawingStrokes ?? [] }
        set {
            var effects = currentEffects
            effects.drawingStrokes = newValue.isEmpty ? nil : newValue
            currentEffects = effects
        }
    }

    // MARK: Mode transitions

    /// Entre en mode édition de dessin — MODE LISTE par défaut (user
    /// 2026-07-11 v2) : « par défaut rien n'est activé, c'est la liste des
    /// éléments de traits ». Aucun panneau déplié, pas de plein écran ; le
    /// band montre `DrawingStrokeList`. Le plein écran de tracé s'active à
    /// la sélection d'un pinceau (`enterImmersiveDrawing`). Idempotent si
    /// déjà actif (préserve la sélection/le panneau).
    /// `public` : la porte « Dessiner » du composer unifié entre et sort du
    /// mode (#4092). C'est un MODE, pas une ingestion — d'où la bascule, et
    /// d'où le besoin des deux sens depuis l'app.
    public func enterDrawingEditingMode() {
        if drawingEditingMode.isActive { return }
        drawingEditingMode = .active(strokeId: nil, expandedTool: nil)
    }

    /// **TRACER, tout de suite** — l'intention du plateau, en un seul geste
    /// (#4092).
    ///
    /// L'atelier entre au dessin en DEUX temps : `enterDrawingEditingMode()`
    /// ouvre le mode LISTE (« par défaut rien n'est activé, c'est la liste des
    /// éléments de traits »), puis choisir un pinceau bascule en plein écran de
    /// tracé. C'est juste pour une surface qui a la place d'afficher une liste.
    ///
    /// La vue `3b` ne décrit pas ce parcours : taper DESSIN doit donner un
    /// doigt qui trace, avec ses couleurs et sa gomme sous la scène. Rien de
    /// plus.
    ///
    /// **Ce que la vérification simulateur a trouvé (2026-08-30)** : la porte
    /// du plateau appelait `enterDrawingEditingMode()` seul. La bande de
    /// réglages paraissait, et le doigt traçait dans le VIDE — parce que la
    /// couche de capture est montée sur `isDrawingActive`, c'est-à-dire
    /// `activeTool == .drawing`, et que rien sur ce chemin ne posait l'outil.
    /// Deux drapeaux pour un seul état apparent : la bande disait « je
    /// dessine », le canvas disait « non ».
    ///
    /// Cette méthode pose les DEUX, et c'est pourquoi elle existe plutôt que de
    /// publier `selectTool` : un site d'appel qui doit poser deux drapeaux dans
    /// le bon ordre pour obtenir un état finit par n'en poser qu'un.
    public func beginDrawing() {
        activeTool = .drawing
        enterImmersiveDrawing()
    }

    /// Sortie symétrique — elle retire les deux drapeaux que `beginDrawing` a
    /// posés. Sans le second, la porte ne pourrait plus BASCULER : elle
    /// retrouverait `isDrawingActive == true` et rentrerait dans le mode qu'on
    /// vient de lui demander de quitter.
    public func endDrawing() {
        exitDrawingEditingMode()
        if activeTool == .drawing { activeTool = nil }
    }

    /// Sélection d'un pinceau → plein écran de tracé : canvas full-bleed
    /// dessinable jusqu'aux angles, bulles flottantes seules (le band se
    /// replie côté vue), pinch-zoom 2 doigts actif.
    func enterImmersiveDrawing() {
        if !drawingEditingMode.isActive {
            drawingEditingMode = .active(strokeId: nil, expandedTool: nil)
        }
        isDrawingImmersive = true
    }

    /// Sort du mode édition de dessin. Le zoom d'inspection posé PENDANT le
    /// dessin (pinch 2 doigts sur la couche de capture) est ramené à l'échelle
    /// 1 : « lorsqu'on quitte on revient au système initial » (user
    /// 2026-07-11). Guardé sur `isActive` pour qu'un exit no-op (appelé à
    /// chaque changement d'outil) n'écrase pas un zoom posé HORS dessin.
    public func exitDrawingEditingMode() {
        guard drawingEditingMode.isActive else { return }
        drawingEditingMode = .inactive
        isDrawingImmersive = false
        if isCanvasZoomed { resetCanvasZoom() }
    }

    /// Déplie / replie le panneau d'options d'un outil. No-op si pas en édition.
    func setExpandedDrawingTool(_ tool: DrawingEditTool?) {
        guard case .active(let strokeId, _) = drawingEditingMode else { return }
        drawingEditingMode = .active(strokeId: strokeId, expandedTool: tool)
    }

    // MARK: Undo / redo (retour arrière / avant)

    /// `true` s'il reste au moins un trait à annuler.
    var canUndoStroke: Bool { !drawingStrokes.isEmpty }
    /// `true` s'il reste au moins un trait annulé à rétablir.
    var canRedoStroke: Bool { !drawingRedoStack.isEmpty }

    /// Valide un trait fraîchement dessiné : l'ajoute ET invalide la pile de redo
    /// (un nouveau trait rend le « rétablir » caduc). À utiliser à la place d'un
    /// `drawingStrokes.append` direct depuis la capture.
    func commitStroke(_ stroke: StoryDrawingStroke) {
        drawingStrokes.append(stroke)
        if !drawingRedoStack.isEmpty { drawingRedoStack.removeAll() }
    }

    /// Annule le dernier trait (le déplace vers la pile de redo). Lève la sélection
    /// si le trait annulé était sélectionné. No-op si aucun trait.
    func undoLastStroke() {
        guard !drawingStrokes.isEmpty else { return }
        var strokes = drawingStrokes
        let removed = strokes.removeLast()
        drawingStrokes = strokes
        drawingRedoStack.append(removed)
        if drawingEditingMode.selectedStrokeId == removed.id { selectStroke(nil) }
    }

    /// Rétablit le dernier trait annulé. No-op si la pile de redo est vide.
    func redoLastStroke() {
        guard !drawingRedoStack.isEmpty else { return }
        let stroke = drawingRedoStack.removeLast()
        drawingStrokes.append(stroke)
    }

    // MARK: Per-stroke editing

    /// Sélectionne un trait pour l'édition par-trait. `nil` désélectionne. Un id
    /// inexistant est ignoré (no-op). No-op si pas en mode édition.
    func selectStroke(_ id: String?) {
        guard case .active(_, let expandedTool) = drawingEditingMode else { return }
        if let id, !drawingStrokes.contains(where: { $0.id == id }) { return }
        drawingEditingMode = .active(strokeId: id, expandedTool: expandedTool)
    }

    /// Supprime un trait. Si c'était le trait sélectionné, la sélection est levée.
    /// Invalide aussi la pile de redo (mutation manuelle = nouvelle action).
    func deleteStroke(_ id: String) {
        drawingStrokes.removeAll { $0.id == id }
        if !drawingRedoStack.isEmpty { drawingRedoStack.removeAll() }
        if drawingEditingMode.selectedStrokeId == id {
            selectStroke(nil)
        }
    }

    /// Recolore le trait sélectionné. No-op si aucun trait sélectionné.
    func updateSelectedStrokeColor(_ colorHex: String) {
        mutateSelectedStroke { $0.colorHex = colorHex }
    }

    /// Change l'épaisseur du trait sélectionné. No-op si aucun trait sélectionné.
    func updateSelectedStrokeWidth(_ width: Double) {
        mutateSelectedStroke { $0.width = width }
    }

    /// Change le lissage du trait sélectionné. No-op si aucun trait sélectionné.
    func updateSelectedStrokeSmoothing(_ smoothing: StrokeSmoothing) {
        mutateSelectedStroke { $0.smoothing = smoothing }
    }

    private func mutateSelectedStroke(_ transform: (inout StoryDrawingStroke) -> Void) {
        guard let id = drawingEditingMode.selectedStrokeId,
              let index = drawingStrokes.firstIndex(where: { $0.id == id }) else { return }
        var strokes = drawingStrokes
        transform(&strokes[index])
        drawingStrokes = strokes
    }
    /// **Effacer par le geste — une mutation de MODÈLE, pas de vue.**
    ///
    /// Elle vivait sur `StoryComposerView` (`+Canvas.swift`), où elle filtrait
    /// `viewModel.drawingStrokes` depuis l'extérieur. Rien ne l'y obligeait :
    /// elle ne lit aucune géométrie de vue, seulement des points DESIGN déjà
    /// projetés par la couche de capture. Sa place sur la vue était le seul
    /// obstacle à monter la gomme ailleurs (#4092).
    ///
    /// Le rayon est en pixels DESIGN — le même repère que les traits — donc il
    /// vaut identiquement quelle que soit la taille rendue de la scène. C'est
    /// ce qui fait qu'effacer sur la scène incrustée du plateau et sur
    /// l'atelier plein écran demande le même geste.
    ///
    /// **Le retour haptique n'est donné que si quelque chose a DISPARU** : une
    /// gomme passée dans le vide qui vibre ferait croire à un effacement.
    func eraseStrokes(near erasePoints: [CGPoint]) {
        guard !erasePoints.isEmpty else { return }
        let eraseRadius: CGFloat = 28  // design px
        let survivors = drawingStrokes.filter { stroke in
            let reach = CGFloat(stroke.width) / 2 + eraseRadius
            for sp in StrokePathBuilder.renderPoints(for: stroke) {
                for ep in erasePoints where hypot(sp.x - ep.x, sp.y - ep.y) <= reach {
                    return false
                }
            }
            return true
        }
        if survivors.count != drawingStrokes.count {
            drawingStrokes = survivors
            HapticFeedback.light()
        }
    }

}
