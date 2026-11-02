import SwiftUI
import UIKit
import Combine
import UniformTypeIdentifiers
import MeeshyUI

/// Ce que le presse-papier porte, demandé SANS le lire : `contains(pasteboardTypes:)`
/// ne déclenche pas la bannière « Coller depuis … ».
protocol ComposerPasteboardProbing: AnyObject {
    func containsAcceptableContent(_ types: [UTType]) -> Bool
}

final class ComposerSystemPasteboardProbe: ComposerPasteboardProbing {
    nonisolated deinit {}

    func containsAcceptableContent(_ types: [UTType]) -> Bool {
        UIPasteboard.general.contains(pasteboardTypes: types.map(\.identifier))
    }
}

/// **« Coller » ne paraît que si le presse-papier porte quelque chose à coller**
/// (#13839, recette au simulateur).
///
/// Le `PasteButton` système se grise quand rien n'est acceptable, mais reste
/// peint : au repos, une pastille éteinte couvrait la scène sous la colonne. La
/// porte relit le presse-papier quand il change et quand l'app revient au
/// premier plan — ce qu'on a copié ailleurs pendant ce temps.
@MainActor
final class ComposerPasteEntryGate: ObservableObject {
    @Published private(set) var isShown: Bool

    private let probe: ComposerPasteboardProbing
    private let types: [UTType]
    private var subscription: AnyCancellable?

    nonisolated deinit {}

    init(probe: ComposerPasteboardProbing, types: [UTType], center: NotificationCenter = .default) {
        self.probe = probe
        self.types = types
        isShown = probe.containsAcceptableContent(types)
        subscription = Publishers.Merge(center.publisher(for: UIPasteboard.changedNotification),
                                        center.publisher(for: UIApplication.didBecomeActiveNotification))
            .sink { [weak self] _ in
                MainActor.assumeIsolated { self?.refresh() }
            }
    }

    private func refresh() {
        let servi = probe.containsAcceptableContent(types)
        if servi != isShown { isShown = servi }
    }
}

/// L'entrée de collage du compositeur, montée seulement quand elle a un effet.
struct ComposerPasteEntry: View {
    let canAddMedia: Bool
    let onItems: ([StoryPastedItem]) -> Void

    @StateObject private var gate = ComposerPasteEntryGate(
        probe: ComposerSystemPasteboardProbe(),
        types: StoryComposerView.pasteStarterContentTypes)

    var body: some View {
        if gate.isShown {
            BlankCanvasPasteStarter(canAddMedia: canAddMedia, onItems: onItems)
                .labelStyle(.iconOnly)
                // `.capsule` et non `.circle` : celle-ci est iOS 17+, et le plancher de l'app
                // est iOS 16. Sur une cible de 44 pt, la capsule EST un cercle.
                .buttonBorderShape(.capsule)
        }
    }
}
