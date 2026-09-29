import SwiftUI
import MeeshySDK
import MeeshyUI

/// **LA GALERIE DES STYLES** — miroir de `apps/web/src/routes/thread-export-gallery.tsx`.
/// Toutes les cartes, peintes sur le message de l'utilisateur, les plus
/// utilisées d'abord. On y CHERCHE avec la recherche du système (qui porte le
/// Liquid Glass d'iOS 26), avec les mots de l'interface (« plume sombre »),
/// sans se soucier des accents ; les noms des polices et des liaisons s'offrent
/// en suggestions d'un toucher, et le ton (sombre, clair) se filtre sans le taper.
struct MessageCardExportGallery: View {
    let usage: [MessageCardTemplateID: Int]
    let selected: MessageCardTemplateID
    let source: MessageCardThumbSource
    let onPick: (MessageCardTemplateID) -> Void
    let onClose: () -> Void

    @State private var query = ""
    @State private var tone: MessageCardTone?

    private var vocabulary: MessageCardVocabulary { MessageCardExportText.vocabulary }

    private var found: [MessageCardTemplateID] {
        MessageCardSearch.search(query, vocabulary: vocabulary, usage: usage, tone: tone)
    }

    private var suggestions: [String] {
        MessageCardTypefaceID.allCases.map(MessageCardExportText.typefaceLabel)
            + MessageCardLinkID.allCases.map(MessageCardExportText.linkLabel)
    }

    var body: some View {
        let results = found
        NavigationStack {
            GeometryReader { proxy in
                let columns = 3
                let spacing: CGFloat = 10
                let width = max(60, (proxy.size.width - 32 - spacing * CGFloat(columns - 1)) / CGFloat(columns))
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        filters
                        Text(MessageCardExportText.text("export.card.gallery.count", "\(results.count) styles"))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 16)
                            .accessibilityAddTraits(.updatesFrequently)
                        if results.isEmpty {
                            Text(MessageCardExportText.text("export.card.gallery.empty", "Aucun style ne porte ce nom. Essayez une couleur, une police ou « sombre »."))
                                .font(.body)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 40)
                                .padding(.horizontal, 24)
                        } else {
                            LazyVGrid(columns: Array(repeating: GridItem(.fixed(width), spacing: spacing), count: columns), spacing: 14) {
                                ForEach(results, id: \.self) { id in
                                    VStack(alignment: .leading, spacing: 4) {
                                        MessageCardThumb(id: id, source: source, selected: id == selected, width: width) {
                                            onPick(id)
                                        }
                                        Text(MessageCardExportText.templateLabel(id))
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(1)
                                            .frame(width: width, alignment: .leading)
                                            .accessibilityHidden(true)
                                    }
                                }
                            }
                            .padding(.horizontal, 16)
                        }
                    }
                    .padding(.bottom, 24)
                }
                .scrollDismissesKeyboard(.immediately)
            }
            .navigationTitle(MessageCardExportText.text("export.card.gallery.title", "Tous les styles"))
            .navigationBarTitleDisplayMode(.inline)
            .searchable(
                text: $query,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: MessageCardExportText.text("export.card.gallery.placeholder", "Plume, sombre, bulles…")
            )
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: onClose) {
                        Image(systemName: "xmark")
                    }
                    .accessibilityLabel(MessageCardExportText.text("export.card.gallery.close", "Fermer la galerie"))
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .adaptiveSheetGlassBackground()
    }

    private var filters: some View {
        VStack(alignment: .leading, spacing: 10) {
            Picker(MessageCardExportText.text("export.card.tab.palette", "Fond"), selection: $tone) {
                ForEach([MessageCardTone?.none, .dark, .light], id: \.self) { value in
                    Text(MessageCardExportText.toneLabel(value)).tag(value)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(suggestions, id: \.self) { word in
                        Button {
                            HapticFeedback.light()
                            query = "\(query.trimmingCharacters(in: .whitespaces)) \(word)".trimmingCharacters(in: .whitespaces)
                        } label: {
                            Text(word)
                                .font(.footnote.weight(.semibold))
                                .padding(.horizontal, 12)
                                .frame(minHeight: 32)
                                .background(Capsule().fill(Color.primary.opacity(0.07)))
                        }
                        .buttonStyle(MessageCardPressStyle())
                        .foregroundStyle(.primary)
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }
}
