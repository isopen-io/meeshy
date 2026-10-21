import SwiftUI

/// Le contenu d'un plein écran ou d'une feuille se déclare au registre des
/// surfaces (#10539, #10543).
///
/// Posé sur le CONTENU présenté, jamais sur l'hôte : `onAppear` et
/// `onDisappear` n'y sont fiables que là (#9052). Sans `close`, la surface se
/// referme par le `dismiss` de sa présentation — ce qui emporte aussi tout ce
/// qu'elle a elle-même présenté (commentaires, profil, visionneuse).
struct PresentedSurfaceModifier: ViewModifier {
    let kind: PresentedSurfaceKind
    let answer: @MainActor () -> PresentedSurfaceYield
    let close: (@MainActor () -> Void)?
    let registry: PresentedSurfaceRegistryProviding

    @Environment(\.dismiss) private var dismiss
    @Environment(\.presentedSurfaceScope) private var scope
    @State private var token: PresentedSurfaceToken?

    func body(content: Content) -> some View {
        content
            .onAppear {
                guard token == nil else { return }
                let dismiss = dismiss
                let close = close
                token = registry.declare(kind, scope: scope, answer: answer) {
                    if let close { close() } else { dismiss() }
                }
            }
            .onDisappear {
                guard let declared = token else { return }
                token = nil
                registry.retire(declared)
            }
    }
}

private struct PresentedSurfaceScopeKey: EnvironmentKey {
    static let defaultValue: PresentedSurfaceScope? = nil
}

extension EnvironmentValues {
    /// La fenêtre dans laquelle une surface se présente (#10543). Posée par la
    /// racine de chaque fenêtre, héritée par ses feuilles et ses pleins écrans ;
    /// `nil` là où l'environnement ne descend pas (cellule hébergée par UIKit).
    var presentedSurfaceScope: PresentedSurfaceScope? {
        get { self[PresentedSurfaceScopeKey.self] }
        set { self[PresentedSurfaceScopeKey.self] = newValue }
    }
}

extension View {
    /// Cette surface s'efface quand une conversation s'ouvre.
    func closesForConversationOpening(
        _ kind: PresentedSurfaceKind,
        answer: @escaping @MainActor () -> PresentedSurfaceYield = { .closes },
        registry: PresentedSurfaceRegistryProviding = PresentedSurfaceRegistry.shared,
        close: (@MainActor () -> Void)? = nil
    ) -> some View {
        modifier(PresentedSurfaceModifier(kind: kind, answer: answer, close: close, registry: registry))
    }

    /// Cet écran RETIENT : il reste, et la conversation s'ouvre à son départ.
    func retainsAgainstConversationOpening(
        _ kind: PresentedSurfaceKind,
        registry: PresentedSurfaceRegistryProviding = PresentedSurfaceRegistry.shared
    ) -> some View {
        modifier(PresentedSurfaceModifier(kind: kind, answer: { .retains }, close: nil, registry: registry))
    }
}
