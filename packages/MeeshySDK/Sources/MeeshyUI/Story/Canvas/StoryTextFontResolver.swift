import UIKit
import MeeshySDK

/// Source unique de résolution `UIFont` pour le rendu canvas d'un
/// `StoryTextObject`. Extraite de `StoryTextLayer` pour être partagée avec
/// `StoryInlineTextEditor` sans dupliquer la logique de style. Le pendant
/// SwiftUI `storyFont(for:size:)` (`FontStylePicker.swift`) reste séparé : il
/// renvoie un `Font` SwiftUI ; ce resolver n'unifie que le côté UIKit.
public enum StoryTextFontResolver {

    /// Résout la `UIFont` d'un `StoryTextObject` : police custom (`fontFamily`)
    /// prioritaire, sinon dérivée du `textStyle`.
    public static func resolveFont(forTextObject text: StoryTextObject,
                                   size: CGFloat) -> UIFont {
        if text.fontFamily != "system",
           let custom = UIFont(name: text.fontFamily, size: size) {
            return custom
        }
        switch text.parsedTextStyle {
        case .bold:
            return UIFont.systemFont(ofSize: size, weight: .black)
        case .neon:
            let base = UIFont.systemFont(ofSize: size, weight: .semibold)
            let descriptor = base.fontDescriptor.withDesign(.rounded) ?? base.fontDescriptor
            return UIFont(descriptor: descriptor, size: size)
        case .typewriter:
            return UIFont.monospacedSystemFont(ofSize: size, weight: .regular)
        case .handwriting:
            if let name = text.parsedTextStyle.fontName,
               let custom = UIFont(name: name, size: size) {
                return custom
            }
            let base = UIFont.systemFont(ofSize: size, weight: .regular)
            let descriptor = base.fontDescriptor.withDesign(.serif) ?? base.fontDescriptor
            return UIFont(descriptor: descriptor, size: size)
        case .classic:
            let base = UIFont.systemFont(ofSize: size, weight: .medium)
            let descriptor = base.fontDescriptor.withDesign(.serif) ?? base.fontDescriptor
            return UIFont(descriptor: descriptor, size: size)
        }
    }
}
