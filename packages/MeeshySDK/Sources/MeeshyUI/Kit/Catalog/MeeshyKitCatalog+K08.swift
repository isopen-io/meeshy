#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK08 = MeeshyKitCatalogEntry(
        key: "K08",
        name: "MeeshyField",
        states: [
            MeeshyKitCatalogState(id: "recherche-vide", boardView: "A16", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "hashtag", boardView: "A17", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "paragraphe", boardView: "O9", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "temps", boardView: "O10", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "phrase-compteur", boardView: "P5", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "theme", boardView: "A18", backdrop: .light, isTouchable: true),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK08(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyFieldSample(stateID: state.id)
            .padding(MeeshySpacing.md)
    }
}

/// L'échantillon d'un état de K08 : un champ réel, dans la forme que la planche
/// lui donne. Aucune couleur ni chaîne en dur : tout vient du composant.
private struct MeeshyFieldSample: View {
    let stateID: String

    @State private var text: String = ""

    var body: some View {
        switch stateID {
        case "recherche-vide":
            MeeshyField(label: "Rechercher", text: text, onChange: { text = $0 },
                        input: .search, prompt: "Rechercher",
                        leading: .icon(systemImage: "magnifyingglass"))
        case "hashtag":
            MeeshyField(label: "Hashtag", text: text, onChange: { text = $0 },
                        input: .token, prompt: "Hashtag",
                        leading: .glyph("#"))
        case "paragraphe":
            MeeshyField(label: "Description", text: text, onChange: { text = $0 },
                        input: .paragraph, prompt: "Décrivez la publication",
                        caption: "Description", limit: 1000, counter: .hosted)
        case "temps":
            MeeshyField(label: "Début", text: text, onChange: { text = $0 },
                        input: .numeric, caption: "Début",
                        onStep: { _ in })
        case "phrase-compteur":
            MeeshyField(label: "Message", text: text, onChange: { text = $0 },
                        input: .sentence, prompt: "Écrire", limit: 60)
        default:
            MeeshyField(label: "Lieu", text: text, onChange: { text = $0 },
                        input: .search, prompt: "Rechercher", tone: .theme,
                        leading: .icon(systemImage: "mappin.and.ellipse"))
        }
    }
}
#endif
