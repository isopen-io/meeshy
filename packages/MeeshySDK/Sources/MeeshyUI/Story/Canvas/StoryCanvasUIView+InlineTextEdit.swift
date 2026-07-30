import UIKit
import QuartzCore
import MeeshySDK

extension StoryCanvasUIView: UITextViewDelegate {

    /// Démarre l'édition du texte `textId`. Pendant l'édition, le texte
    /// REPREND LE CENTRE de l'écran par-dessus le canvas (convention story :
    /// le champ est toujours lisible, jamais sous le clavier ni collé à un
    /// bord, ni tourné) : la calque est recentrée SANS muter le modèle
    /// (`x`/`y`/`rotation` intacts) et un `StoryInlineTextEditor` est
    /// superposé dessus, glyphes de la calque masqués (son fond — solide,
    /// glass, losange, bulle… — reste visible et suit les changements de
    /// style en live). À la fermeture, le texte retrouve sa position réelle.
    public func beginInlineTextEdit(textId: String) {
        guard inlineEditingTextId != textId,
              let textLayer = textLayer(forId: textId),
              let textObject = textLayer.textObject else { return }

        // Bascule directe d'un texte A vers un texte B (tap sur un autre texte
        // pendant l'édition) : A doit retrouver ses glyphes ET sa position
        // réelle immédiatement — sans ça il resterait centré/vidé jusqu'au
        // prochain `rebuildLayers()`.
        if let previousId = inlineEditingTextId,
           let previousLayer = self.textLayer(forId: previousId) {
            previousLayer.setGlyphsHidden(false)
            restoreLayerAfterEditing(previousLayer)
        }

        let editor = inlineEditor ?? StoryInlineTextEditor()
        editor.delegate = self
        if editor.superview == nil { addSubview(editor) }
        inlineEditor = editor
        inlineEditingTextId = textId

        centerLayerForEditing(textLayer)
        position(editor, over: textLayer)
        editor.apply(textObject: textObject, geometry: geometry, setText: true)
        // Garantit que l'éditeur a au moins la taille nécessaire pour
        // afficher son placeholder (l'auto-add part d'un texte vide donc
        // d'une calque bounds quasi-nulle).
        editor.sizeToFitTextContent(maxWidth: bounds.width * 0.88)
        // Ancrage APRÈS le dimensionnement : c'est la hauteur réelle du champ
        // qui décide si le bloc doit remonter au-dessus des chips.
        anchorInlineEditing(layer: textLayer, editor: editor)
        textLayer.setGlyphsHidden(true)
        editor.becomeFirstResponder()
    }

    /// Termine l'édition en place : retire le champ, restaure les glyphes et
    /// renvoie la calque à sa position/rotation réelles (celles du modèle,
    /// jamais mutées par le recentrage d'édition).
    public func endInlineTextEdit() {
        guard let id = inlineEditingTextId else { return }
        if let layer = textLayer(forId: id) {
            layer.setGlyphsHidden(false)
            restoreLayerAfterEditing(layer)
        }
        let editor = inlineEditor
        inlineEditor = nil
        // `inlineEditingTextId` est mis à nil AVANT `resignFirstResponder()` :
        // résigner déclenche un `textViewDidEndEditing` dont la guard sur
        // `inlineEditingTextId` échoue alors — ce qui évite un second
        // `onInlineTextEditEnded` ré-entrant.
        inlineEditingTextId = nil
        editor?.resignFirstResponder()
        editor?.removeFromSuperview()
    }

    /// Hook appelé en fin de `rebuildLayers()` : la calque éditée vient d'être
    /// reconstruite à neuf (donc replacée à sa position modèle) — re-supprimer
    /// ses glyphes, la recentrer pour l'édition et re-synchroniser le style +
    /// la géométrie du champ (SANS réécrire la chaîne : le `UITextView`
    /// est la source de vérité du texte pendant l'édition).
    func reapplyInlineEditingIfNeeded() {
        guard let id = inlineEditingTextId,
              let textLayer = textLayer(forId: id) else { return }
        textLayer.setGlyphsHidden(true)
        centerLayerForEditing(textLayer)
        if let editor = inlineEditor, let textObject = textLayer.textObject {
            position(editor, over: textLayer)
            editor.apply(textObject: textObject, geometry: geometry, setText: false)
            // `position(_:over:)` aligne `editor.bounds = layer.bounds`. Si
            // le texte vient d'être vidé (backspace de tous les caractères)
            // la calque a des bounds quasi-nulles et le placeholder
            // serait clippé. `sizeToFitTextContent` rééquilibre les bounds
            // vers la taille du contenu (et du placeholder en empty).
            editor.sizeToFitTextContent(maxWidth: bounds.width * 0.88)
            anchorInlineEditing(layer: textLayer, editor: editor)
        }
    }

    /// Pose le bloc en édition (calque + champ) sur la MÊME ligne de base, de
    /// sorte que sa DERNIÈRE ligne reste au-dessus des chips de l'outil texte.
    ///
    /// Règle : centré tant que le bloc tient au-dessus du plafond ; sinon on
    /// colle son bas au plafond, ce qui fait grandir le texte vers le HAUT —
    /// quitte à ce qu'un texte très long déborde hors de l'écran par le haut
    /// (directive user 2026-07-30). Aucun clamp haut, donc : le canvas ne
    /// masque pas ses sous-vues en édition (`masksToBounds` n'est armé qu'avec
    /// un `canvasCornerRadius > 0`, et l'édition garde le canvas plein écran
    /// aux coins droits), le débordement est bien visible.
    ///
    /// La calque et le champ peuvent avoir des hauteurs différentes le temps
    /// d'un cycle — le champ grandit à la frappe, la calque au
    /// `rebuildLayers()` d'après — donc on ancre sur la PLUS HAUTE des deux :
    /// c'est elle qui déborderait sous les chips.
    func anchorInlineEditing(layer: StoryTextLayer, editor: StoryInlineTextEditor) {
        let blockHeight = max(layer.bounds.height, editor.bounds.height)
        let centerY = inlineEditCenterY(forHeight: blockHeight)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        layer.position = CGPoint(x: bounds.midX, y: centerY)
        layer.transform = CATransform3DIdentity
        CATransaction.commit()
        editor.transform = .identity
        editor.center = CGPoint(x: bounds.midX, y: centerY)
    }

    /// Marge entre la dernière ligne du texte édité et le haut des chips.
    static let inlineEditFloorGap: CGFloat = 12

    /// Centre vertical (repère canvas) d'un bloc d'édition de `height` points.
    func inlineEditCenterY(forHeight height: CGFloat) -> CGFloat {
        Self.inlineEditCenterY(canvasMidY: bounds.midY,
                               floorY: inlineEditFloorY,
                               blockHeight: height)
    }

    /// Règle d'ancrage, pure et testable hors fenêtre.
    ///
    /// - Sans plafond connu (`floorY == nil`) → centre du canvas, comportement
    ///   historique.
    /// - Avec plafond → `min` : le bloc reste centré tant qu'il tient au-dessus
    ///   des contrôleurs, puis colle son BAS au plafond. Il ne redescend jamais,
    ///   et rien ne le borne en haut : un texte long sort par le haut de
    ///   l'écran plutôt que de passer sous les chips (user 2026-07-30).
    nonisolated static func inlineEditCenterY(canvasMidY: CGFloat,
                                              floorY: CGFloat?,
                                              blockHeight: CGFloat) -> CGFloat {
        guard let floorY else { return canvasMidY }
        return min(canvasMidY, floorY - blockHeight / 2)
    }

    /// Plafond (repère canvas) au-dessus duquel le texte édité doit rester, ou
    /// `nil` si le composer n'a rapporté aucune position de contrôleurs.
    var inlineEditFloorY: CGFloat? {
        let globalY = inlineEditFloorGlobalY
        guard globalY.isFinite, globalY < .greatestFiniteMagnitude,
              window != nil else { return nil }
        return convert(CGPoint(x: 0, y: globalY), from: nil).y - Self.inlineEditFloorGap
    }

    // MARK: - Private

    private func textLayer(forId id: String) -> StoryTextLayer? {
        itemsContainer.sublayers?
            .first { $0.name == id } as? StoryTextLayer
    }

    /// Recentre la calque et annule sa rotation pour la durée de l'édition —
    /// override PUREMENT visuel : le modèle (`x`, `y`, `rotation`) n'est pas
    /// touché, et `rebuildLayers()` replace toujours la calque depuis le modèle
    /// (d'où le re-recentrage dans `reapplyInlineEditingIfNeeded`).
    ///
    /// « Recentre » au sens de `inlineEditCenterY(forHeight:)` : centre du
    /// canvas tant que le bloc tient au-dessus des chips de l'outil texte,
    /// sinon bas collé à leur plafond.
    private func centerLayerForEditing(_ layer: StoryTextLayer) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        layer.position = CGPoint(x: bounds.midX,
                                 y: inlineEditCenterY(forHeight: layer.bounds.height))
        layer.transform = CATransform3DIdentity
        CATransaction.commit()
    }

    /// Replace la calque à sa position/rotation réelles depuis son
    /// `textObject` — même projection design→render que
    /// `updateManipulatedItemLayer` / `StoryTextLayer.configure`.
    private func restoreLayerAfterEditing(_ layer: StoryTextLayer) {
        guard let textObject = layer.textObject else { return }
        let designX = geometry.designLength(forNormalized: CGFloat(textObject.x))
        let designY = geometry.designHeightLength(forNormalized: CGFloat(textObject.y))
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        layer.position = geometry.render(CGPoint(x: designX, y: designY))
        layer.transform = CATransform3DMakeRotation(
            CGFloat(textObject.rotation) * .pi / 180, 0, 0, 1)
        CATransaction.commit()
    }

    /// Positionne le champ sur la calque : `bounds` + `center` + rotation.
    /// `center` (centre géométrique de la `UIView`) est dérivé de `position`
    /// (point d'ancrage de la calque) corrigé de l'`anchorPoint` — exact pour
    /// l'ancrage par défaut (0.5, 0.5) de tous les textes.
    private func position(_ editor: StoryInlineTextEditor, over layer: CALayer) {
        editor.transform = .identity
        editor.bounds = layer.bounds
        let anchor = layer.anchorPoint
        editor.center = CGPoint(
            x: layer.position.x + (0.5 - anchor.x) * layer.bounds.width,
            y: layer.position.y + (0.5 - anchor.y) * layer.bounds.height
        )
        let angle = atan2(layer.transform.m12, layer.transform.m11)
        if angle != 0 { editor.transform = CGAffineTransform(rotationAngle: angle) }
    }

    // MARK: - UITextViewDelegate

    public func textViewDidChange(_ textView: UITextView) {
        let editor = textView as? StoryInlineTextEditor
        editor?.updatePlaceholderVisibility()
        // Croissance immédiate des bounds de l'éditeur pour englober tout
        // le texte tapé. Sans ça la nouvelle frappe restait clippée par
        // les bounds dérivés de la calque pré-saisie jusqu'au prochain
        // `rebuildLayers()` (qui arrive ~1 tick async après la
        // propagation viewModel → SwiftUI → updateUIView → slide.didSet).
        // Pendant ce gap, l'utilisateur voyait des mots disparaître ; le
        // resync visuel n'arrivait qu'après zoom/dezoom ou nouvelle frappe.
        let maxWidth = bounds.width * 0.88
        editor?.sizeToFitTextContent(maxWidth: maxWidth)
        guard let id = inlineEditingTextId else { return }
        // La croissance est symétrique autour du centre (`sizeToFitTextContent`
        // préserve `center`) : sans ce ré-ancrage, une ligne de plus poussait la
        // dernière ligne SOUS les chips. On ré-ancre à chaque frappe pour que le
        // texte grandisse vers le haut dès qu'il touche le plafond.
        if let editor, let layer = textLayer(forId: id) {
            anchorInlineEditing(layer: layer, editor: editor)
        }
        onInlineTextChanged?(id, textView.text ?? "")
    }

    public func textViewDidEndEditing(_ textView: UITextView) {
        guard let id = inlineEditingTextId else { return }
        onInlineTextEditEnded?(id)
    }
}
