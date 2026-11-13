#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK08 = MeeshyKitCatalogEntry(
        key: "K08",
        name: "MeeshyField",
        states: [
            MeeshyKitCatalogState(id: "recherche-vide", boardView: "A16", backdrop: .dark),
            MeeshyKitCatalogState(id: "recherche-texte", boardView: "A18", backdrop: .dark),
            MeeshyKitCatalogState(id: "occupe", backdrop: .dark),
            MeeshyKitCatalogState(id: "hashtag", boardView: "A17", backdrop: .dark),
            MeeshyKitCatalogState(id: "phrase-compteur", boardView: "P5", backdrop: .media),
            MeeshyKitCatalogState(id: "plafond", backdrop: .media),
            MeeshyKitCatalogState(id: "paragraphe", boardView: "O9", backdrop: .media),
            MeeshyKitCatalogState(id: "temps", boardView: "O10", backdrop: .media),
            MeeshyKitCatalogState(id: "theme", backdrop: .light),
            MeeshyKitCatalogState(id: "desactive", backdrop: .dark),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK08(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyFieldSample(stateID: state.id)
            .frame(width: 342, alignment: .leading)
    }
}

/// L'échantillon d'un état de K08, à la largeur d'une feuille de la planche
/// (342 pt) : un champ réel, dans la forme que la vue lui donne. Les textes
/// sont ceux de la planche ; aucune couleur : tout vient du composant.
private struct MeeshyFieldSample: View {
    let stateID: String

    @State private var text: String
    @State private var start = "0:02"
    @State private var end = "0:08"

    init(stateID: String) {
        self.stateID = stateID
        _text = State(initialValue: Self.initialText(for: stateID))
    }

    var body: some View {
        switch stateID {
        case "recherche-vide":
            search(prompt: "Rechercher une personne")
        case "recherche-texte":
            search(prompt: "Rechercher un lieu")
        case "occupe":
            search(prompt: "Rechercher un lieu", isBusy: true)
        case "hashtag":
            MeeshyField("Hashtag", text: text, input: .token, leading: .glyph("#"), onChange: { text = $0 })
        case "phrase-compteur", "plafond":
            MeeshyField("Humeur", text: text, prompt: "Une phrase courte", limit: 60, onChange: { text = $0 })
        case "paragraphe":
            MeeshyField("Description", text: text, input: .paragraph,
                        caption: "Décrire l’image pour les personnes qui ne la voient pas",
                        limit: 1000, counter: .hosted, onChange: { text = $0 })
        case "temps":
            time
        case "theme":
            MeeshyField("Rechercher", text: text, input: .search, prompt: "Rechercher",
                        leading: .icon(systemImage: "magnifyingglass"), tone: .theme, onChange: { text = $0 })
        default:
            search(prompt: "Rechercher une personne").disabled(true)
        }
    }

    private func search(prompt: String, isBusy: Bool = false) -> some View {
        MeeshyField("Rechercher", text: text, input: .search, prompt: prompt,
                    leading: .icon(systemImage: "magnifyingglass"), isBusy: isBusy, onChange: { text = $0 })
    }

    private var time: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            MeeshyField("Début", text: start, input: .numeric, caption: "Début",
                        onChange: { start = $0 }, onStep: { _ in })
            MeeshyField("Fin", text: end, input: .numeric, caption: "Fin",
                        onChange: { end = $0 }, onStep: { _ in })
        }
    }

    private static func initialText(for stateID: String) -> String {
        switch stateID {
        case "recherche-texte", "occupe": return "Plage de Ngor"
        case "hashtag": return "coucher"
        case "phrase-compteur": return "Enfin en vacances"
        case "plafond": return "Enfin en vacances au bord de la mer, le soleil se couche"
        case "paragraphe": return "Coucher de soleil sur la plage de Ngor, un palmier à gauche, la mer calme."
        default: return ""
        }
    }
}
#endif
