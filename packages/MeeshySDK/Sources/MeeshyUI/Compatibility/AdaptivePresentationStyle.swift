import SwiftUI

/// Style de présentation timeline applicable aux sheets — wrappers iOS 16.4
/// (`presentationBackground`, `presentationContentInteraction`, `presentationCornerRadius`)
/// guardés par `if #available(iOS 16.4, *)`. Sur iOS 16.0-16.3, la sheet
/// utilise le style natif par défaut (pas de background `.ultraThinMaterial`,
/// pas de scrolls interaction, coins iOS standard).
///
/// Spec : alignement iOS 16 — Session 5 + sites manqués (StoryComposerView).
public struct StoryTimelinePresentationStyle: ViewModifier {
    public init() {}

    public func body(content: Content) -> some View {
        if #available(iOS 16.4, *) {
            content
                .presentationBackground(.ultraThinMaterial)
                .presentationContentInteraction(.scrolls)
                .presentationCornerRadius(28)
        } else {
            content
        }
    }
}
