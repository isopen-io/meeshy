import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// Ce qu'une vignette de MAQUETTE doit savoir pour se peindre (#18673) : la
/// carte de l'utilisateur, habillée par la maquette.
struct MessageCardModelThumbSource {
    let store: MessageCardThumbnailStore
    let keyOf: (MessageCardModel) -> String
    let inputOf: (MessageCardModel) -> MessageCardInput
    let pictures: MessageCardPictures
}

/// **UNE MAQUETTE, MONTRÉE PAR SA VRAIE CARTE** — peinte sur le message,
/// avec son nom dessous. En attendant sa peinture, le fond de sa palette.
struct MessageCardModelThumb: View {
    let model: MessageCardModel
    let source: MessageCardModelThumbSource
    let selected: Bool
    let width: CGFloat
    let action: () -> Void

    @State private var image: UIImage?
    @Environment(\.displayScale) private var displayScale

    private var name: String { model.name(language: Locale.current.language.languageCode?.identifier) }

    var body: some View {
        let key = source.keyOf(model)
        Button {
            HapticFeedback.light()
            action()
        } label: {
            VStack(spacing: MeeshySpacing.xs) {
                ZStack {
                    MessageCardSwatch(palette: model.palette.palette, shape: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    if let image = image ?? source.store.cached(key) {
                        Image(uiImage: image).resizable().scaledToFit()
                    }
                }
                .frame(width: width, height: width * 1.25)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(selected ? Color.primary : Color.primary.opacity(0.08), lineWidth: selected ? 2.5 : 1)
                )
                Text(name)
                    .font(.caption2.weight(selected ? .semibold : .regular))
                    .lineLimit(1)
                    .frame(width: width)
            }
        }
        .buttonStyle(MessageCardPressStyle())
        .foregroundStyle(.primary)
        .accessibilityLabel(name)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
        .task(id: key) {
            image = source.store.cached(key)
            guard image == nil else { return }
            let painted = await source.store.image(key, input: source.inputOf(model), width: Double(width), displayScale: Double(displayScale), pictures: source.pictures)
            if !Task.isCancelled { image = painted }
        }
    }
}

/// La rangée « Styles » (#18673) : les maquettes, peintes sur le message, puis
/// l'accès aux combinaisons de palette, police et liaison.
struct MessageCardModelRow: View {
    let models: [MessageCardModel]
    let selectedID: String
    let source: MessageCardModelThumbSource
    let onPick: (MessageCardModel) -> Void
    let onCombinations: () -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: MeeshySpacing.smPlus) {
                ForEach(models) { model in
                    MessageCardModelThumb(model: model, source: source, selected: model.id == selectedID, width: 64) {
                        onPick(model)
                    }
                }
                Button {
                    HapticFeedback.light()
                    onCombinations()
                } label: {
                    VStack(spacing: MeeshySpacing.xs) {
                        VStack(spacing: MeeshySpacing.xs) {
                            Image(systemName: "square.grid.3x3.fill").font(.title3)
                            Text(verbatim: "\(MessageCardTemplates.all.count)").font(.caption.weight(.bold))
                        }
                        .frame(width: 64, height: 80)
                        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.primary.opacity(0.07)))
                        Text(MessageCardExportText.text("export.card.models.combinations", "Combinaisons"))
                            .font(.caption2)
                            .lineLimit(1)
                    }
                }
                .buttonStyle(MessageCardPressStyle())
                .foregroundStyle(.primary)
                .accessibilityLabel(MessageCardExportText.text("export.card.gallery.title", "Tous les styles"))
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.xxs)
        }
    }
}
