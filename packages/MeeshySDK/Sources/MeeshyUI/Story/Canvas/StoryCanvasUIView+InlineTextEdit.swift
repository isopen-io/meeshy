import UIKit
import MeeshySDK

extension StoryCanvasUIView: UITextViewDelegate {

    /// Démarre l'édition en place du texte `textId` : superpose un
    /// `StoryInlineTextEditor` sur sa `StoryTextLayer`, supprime les glyphes de
    /// cette calque (son fond reste visible) et ouvre le clavier.
    public func beginInlineTextEdit(textId: String) {
        guard inlineEditingTextId != textId,
              let textLayer = textLayer(forId: textId),
              let textObject = textLayer.textObject else { return }

        let editor = inlineEditor ?? StoryInlineTextEditor()
        editor.delegate = self
        if editor.superview == nil { addSubview(editor) }
        inlineEditor = editor
        inlineEditingTextId = textId

        position(editor, over: textLayer)
        editor.apply(textObject: textObject, geometry: geometry, setText: true)
        textLayer.setGlyphsHidden(true)
        editor.becomeFirstResponder()
    }

    /// Termine l'édition en place : retire le champ, restaure les glyphes.
    public func endInlineTextEdit() {
        guard let id = inlineEditingTextId else { return }
        textLayer(forId: id)?.setGlyphsHidden(false)
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
    /// reconstruite à neuf — re-supprimer ses glyphes et re-synchroniser le
    /// style + la géométrie du champ (SANS réécrire la chaîne : le `UITextView`
    /// est la source de vérité du texte pendant l'édition).
    func reapplyInlineEditingIfNeeded() {
        guard let id = inlineEditingTextId,
              let textLayer = textLayer(forId: id) else { return }
        textLayer.setGlyphsHidden(true)
        if let editor = inlineEditor, let textObject = textLayer.textObject {
            position(editor, over: textLayer)
            editor.apply(textObject: textObject, geometry: geometry, setText: false)
        }
    }

    // MARK: - Private

    private func textLayer(forId id: String) -> StoryTextLayer? {
        itemsContainer.sublayers?
            .first { $0.name == id } as? StoryTextLayer
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
        (textView as? StoryInlineTextEditor)?.updatePlaceholderVisibility()
        guard let id = inlineEditingTextId else { return }
        onInlineTextChanged?(id, textView.text ?? "")
    }

    public func textViewDidEndEditing(_ textView: UITextView) {
        guard let id = inlineEditingTextId else { return }
        onInlineTextEditEnded?(id)
    }
}
