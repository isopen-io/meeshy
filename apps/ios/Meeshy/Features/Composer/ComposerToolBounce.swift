import SwiftUI

/// Rebondit l'icône d'un outil quand `active` bascule (l'outil vient d'être
/// tapé). Statique et sûr en repli iOS 16. Partagé par les deux rails de la
/// scène depuis que la surface document qui le déclarait est partie (#13864).
private struct ComposerToolBounceModifier: ViewModifier {
    let active: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.symbolEffect(.bounce, value: active)
        } else {
            content
        }
    }
}

extension View {
    func composerToolBounce(active: Bool) -> some View {
        modifier(ComposerToolBounceModifier(active: active))
    }
}
