import SwiftUI
import MeeshyUI

// MARK: - La mise en forme de la sélection (#7849)

/// Gras, italique, souligné, barré en UN geste : sélectionner, toucher.
///
/// La sélection d'un `TextField` n'est lisible qu'à partir d'iOS 18
/// (`TextField(text:selection:axis:)`). Sur iOS 16–17 la barre ne paraît donc
/// pas, et les marqueurs se tapent à la main — le RENDU, lui, est le même sur
/// toute la plage servie. `TextSelection` n'existant pas avant iOS 18, elle est
/// rangée dans un `Any?` (`formatSelectionStorage`) : une propriété stockée ne
/// peut pas être marquée `@available`.
extension UniversalComposerBar {

    @available(iOS 18.0, *)
    var formatSelection: Binding<TextSelection?> {
        Binding(
            get: { formatSelectionStorage as? TextSelection },
            set: { formatSelectionStorage = $0 }
        )
    }

    /// Le champ, avec la sélection quand le système la donne.
    @ViewBuilder
    var composerTextFieldBase: some View {
        if #available(iOS 18.0, *) {
            TextField("", text: $text, selection: formatSelection, axis: .vertical)
        } else {
            TextField("", text: $text, axis: .vertical)
        }
    }

    /// La sélection NON VIDE, en positions de `Character` dans `text` — `nil`
    /// si rien n'est sélectionné, avant iOS 18, ou si la sélection a été
    /// posée sur un texte qui a changé depuis.
    var selectedCharacterRange: (start: Int, end: Int)? {
        guard #available(iOS 18.0, *) else { return nil }
        guard let selection = formatSelectionStorage as? TextSelection,
              case .selection(let range) = selection.indices,
              !range.isEmpty,
              range.lowerBound >= text.startIndex, range.upperBound <= text.endIndex
        else { return nil }
        return (
            text.distance(from: text.startIndex, to: range.lowerBound),
            text.distance(from: text.startIndex, to: range.upperBound)
        )
    }

    var showsFormatBar: Bool {
        isFocused && selectedCharacterRange != nil
    }

    /// Pose ou retire l'emphase sur la sélection ; la sélection SUIT le texte
    /// mis en forme, pour enchaîner gras puis italique sans resélectionner.
    func applyEmphasis(_ style: ComposerTextFormat.Style) {
        guard #available(iOS 18.0, *), let range = selectedCharacterRange else { return }
        let result = ComposerTextFormat.toggle(text: text, start: range.start, end: range.end, style: style)
        text = result.text
        let lower = text.index(text.startIndex, offsetBy: result.start)
        let upper = text.index(text.startIndex, offsetBy: result.end)
        formatSelectionStorage = TextSelection(range: lower..<upper)
    }
}
