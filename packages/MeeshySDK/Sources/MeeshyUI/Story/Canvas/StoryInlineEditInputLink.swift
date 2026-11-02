import UIKit

/// **Les vues d'ENTRÉE du champ en place, fournies par l'hôte** (#13839, L4).
///
/// Pendant la frappe, l'hôte colle une barre au clavier (`accessoryView`) et peut
/// remplacer le clavier par un panneau d'options de la même hauteur
/// (`inputView`) : le champ reste premier répondant, son curseur reste visible,
/// et la scène ne bouge pas. Le canvas ne sait rien de ce que ces vues
/// contiennent — il remet son champ au lien, qui les y pose et les échange
/// quand l'hôte les change.
///
/// Un objet de RÉFÉRENCE : l'échange part de l'hôte dès qu'il écrit, sans
/// attendre qu'une mise à jour SwiftUI redescende jusqu'au canvas.
@MainActor
public final class StoryInlineEditInputLink {

    nonisolated deinit {}

    public init() {}

    /// La barre collée au clavier ; `nil` ⇒ aucune.
    public var accessoryView: UIView? {
        didSet { if oldValue !== accessoryView { applyViews() } }
    }

    /// Ce qui remplace le clavier ; `nil` ⇒ le clavier système.
    public var inputView: UIView? {
        didSet { if oldValue !== inputView { applyViews() } }
    }

    /// Le champ a été touché — l'hôte rend le clavier s'il l'avait remplacé.
    public var onEditorTouched: (() -> Void)?

    /// Réécrit le texte en cours de saisie, comme une frappe (une mention
    /// choisie dans la bande `@`). Sans effet hors d'une saisie.
    public func replaceText(_ text: String) {
        guard let editor else { return }
        editor.text = text
        editor.delegate?.textViewDidChange?(editor)
    }

    private weak var editor: StoryInlineTextEditor?

    /// Le canvas remet son champ ouvert ; il le reprend à la fin de la saisie.
    func attach(to editor: StoryInlineTextEditor) {
        self.editor = editor
        editor.onTouched = { [weak self] in self?.onEditorTouched?() }
        applyViews()
    }

    /// Le lien quitte le canvas : rien ne reste accroché au champ.
    func detach() {
        guard let editor else { return }
        editor.onTouched = nil
        setViews(on: editor, accessory: nil, input: nil)
        self.editor = nil
    }

    private func applyViews() {
        guard let editor else { return }
        setViews(on: editor, accessory: accessoryView, input: inputView)
    }

    private func setViews(on editor: StoryInlineTextEditor, accessory: UIView?, input: UIView?) {
        guard editor.inputAccessoryView !== accessory || editor.inputView !== input else { return }
        editor.inputAccessoryView = accessory
        editor.inputView = input
        if editor.isFirstResponder { editor.reloadInputViews() }
    }
}
