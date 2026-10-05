import UIKit

// MARK: - La saisie CÈDE au doigt (retour porteur 2026-09-28)
//
// > « Lorsqu'on édite un texte dans la vue d'édition, il faut être capable de
// > déplacer au doigt le texte dans la scène, zoomer, tourner sans attendre de
// > quitter pour revenir à la première scène. »
//
// En saisie, le texte est RECENTRÉ sous un `UITextView` et le reste du canvas
// passe sous un voile : il n'est plus à sa place, donc il ne se manipule pas —
// et il y restait même clavier baissé. Un hôte qui l'OPTE (l'éditeur d'objet)
// laisse la saisie se SUSPENDRE : un geste de manipulation, ou le clavier qui
// se range, rend le texte à sa position réelle et au doigt ; toucher le texte
// reprend la saisie. La scène de la première vue n'opte pas : elle garde son
// comportement.
extension StoryCanvasUIView {

    /// Suspend la saisie en cours, si l'hôte l'autorise : le texte retrouve sa
    /// position, ses glyphes et le voile se retire.
    ///
    /// - Returns: le texte suspendu quand le geste a commencé SUR le champ.
    ///   Le champ montre le texte recentré et ancré au-dessus du clavier : le
    ///   doigt qui le saisit tombe souvent à côté du calque rendu à sa vraie
    ///   place — c'est pourtant CE texte qu'il désigne.
    @discardableResult
    func suspendInlineEditForManipulation(at point: CGPoint? = nil) -> String? {
        guard inlineEditYieldsToManipulation, let id = inlineEditingTextId else { return nil }
        let surLeChamp = point.map { p in inlineEditor.map { $0.frame.insetBy(dx: -12, dy: -12).contains(p) } ?? false } ?? false
        endInlineTextEdit(parkingEditor: true)
        suspendedInlineEditId = id
        return surLeChamp ? id : nil
    }

    /// Le geste est fini : le champ garé quitte la hiérarchie.
    func releaseParkedInlineEditor() {
        parkedInlineEditor?.removeFromSuperview()
        parkedInlineEditor = nil
    }

    /// Reprend la saisie suspendue du texte `id` — le tap sur ce texte.
    /// - Returns: `true` si la saisie a repris (le tap est consommé).
    func resumeSuspendedInlineEdit(tappedId id: String) -> Bool {
        guard inlineEditYieldsToManipulation, suspendedInlineEditId == id else { return false }
        suspendedInlineEditId = nil
        beginInlineTextEdit(textId: id)
        return true
    }
}
