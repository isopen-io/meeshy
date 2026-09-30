import SwiftUI
import MeeshySDK
import MeeshyUI

/// **LE PLATEAU DE L'ATELIER « IMAGINE »** — miroir de
/// `apps/web/src/routes/thread-export-tray.tsx`. Une surface Liquid Glass sous
/// l'aperçu, qui ne montre qu'UN panneau à la fois : les styles tout faits,
/// le format de l'image, la disposition (« Frame »), le fond, la police, la
/// liaison, les médias, les détails, la langue. Toucher une partie de la carte
/// ouvre l'onglet qui la règle ; l'onglet se choisit aussi à la main.
///
/// Les tuiles du plateau ne sont PAS en verre : on ne pose pas de verre sur du
/// verre. Elles sont teintées de l'encre du système, et l'élu se reconnaît à
/// son contour.
struct MessageCardExportTray: View {
    let tabs: [MessageCardExportTab]
    let tab: MessageCardExportTab
    let focus: MessageCardPartID?
    @Binding var format: MessageCardFormat
    let popular: [MessageCardTemplateID]
    let hasQuote: Bool
    let hasTitle: Bool
    /// Le pseudo des auteurs est connu : « pseudo au lieu du nom » s'offre.
    let hasHandles: Bool
    /// Les médias du contenu — « Médias » ne propose que ce qui a un effet.
    let mediaKinds: [MessageCardMediaKind]
    let languages: [String]
    @Binding var exportLanguage: String?
    let thumbs: MessageCardThumbSource
    let onTab: (MessageCardExportTab) -> Void
    let onGallery: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
            tabBar
            panel
                .frame(minHeight: 96, alignment: .top)
                .animation(.spring(response: 0.35, dampingFraction: 0.85), value: tab)
        }
        .padding(.vertical, MeeshySpacing.md)
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 28, style: .continuous))
    }

    // MARK: - Onglets

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: MeeshySpacing.xs) {
                ForEach(tabs) { item in
                    let selected = item == tab
                    Button {
                        HapticFeedback.light()
                        onTab(item)
                    } label: {
                        Label(item.label, systemImage: item.systemImage)
                            .labelStyle(.titleAndIcon)
                            .font(.subheadline.weight(selected ? .semibold : .regular))
                            .padding(.horizontal, MeeshySpacing.md)
                            .frame(minHeight: 36)
                            .background(Capsule().fill(selected ? Color.primary.opacity(0.12) : Color.clear))
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(selected ? Color.primary : Color.secondary)
                    .accessibilityAddTraits(selected ? [.isSelected] : [])
                }
            }
            .padding(.horizontal, MeeshySpacing.md)
        }
    }

    // MARK: - Panneaux

    @ViewBuilder
    private var panel: some View {
        switch tab {
        case .styles: stylesPanel
        case .format: formatPanel
        case .frame: framePanel
        case .palette: palettePanel
        case .typeface: typefacePanel
        case .link: linkPanel
        case .media: mediaPanel
        case .details: detailsPanel
        case .language: languagePanel
        }
    }

    private var stylesPanel: some View {
        row {
            ForEach(popular, id: \.self) { id in
                MessageCardThumb(id: id, source: thumbs, selected: id == format.template, width: 72) {
                    format.template = id
                }
            }
            Button {
                HapticFeedback.light()
                onGallery()
            } label: {
                VStack(spacing: MeeshySpacing.xs) {
                    Image(systemName: "square.grid.3x3.fill").font(.title3)
                    Text(verbatim: "\(MessageCardTemplates.all.count)").font(.caption.weight(.bold))
                    Text(MessageCardExportText.text("export.card.gallery.open", "Tout voir")).font(.caption2)
                }
                .frame(width: 72, height: 76)
                .background(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous).fill(Color.primary.opacity(0.07)))
            }
            .buttonStyle(MessageCardPressStyle())
            .foregroundStyle(.primary)
            .accessibilityLabel(MessageCardExportText.text("export.card.gallery.title", "Tous les styles"))
        }
    }

    private var palettePanel: some View {
        row {
            ForEach(MessageCardPaletteID.allCases, id: \.self) { palette in
                tile(palette.palette.name, selected: palette == format.template.palette) {
                    format.template = format.template.with(palette: palette)
                } content: {
                    MessageCardSwatch(palette: palette.palette, shape: Circle())
                        .frame(width: 40, height: 40)
                        .overlay(Circle().strokeBorder(Color.primary.opacity(0.12), lineWidth: 1))
                }
            }
        }
    }

    private var typefacePanel: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            row {
                ForEach(MessageCardTypefaceID.allCases, id: \.self) { typeface in
                    tile(MessageCardExportText.typefaceLabel(typeface), selected: typeface == format.template.typeface) {
                        format.template = format.template.with(typeface: typeface)
                    } content: {
                        Text(verbatim: "Aa")
                            .font(MessageCardFontStyle.font(typeface.typeface.replyFace, size: 24))
                            .frame(width: 40, height: 40)
                    }
                }
            }
            HStack(spacing: MeeshySpacing.sm) {
                Text(MessageCardExportText.text("export.card.typeface.pairs", "La police habille la citation et la réponse"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                Spacer(minLength: 0)
                if let toggle = anonymizeToggle {
                    pill(MessageCardExportText.toggleLabel(toggle), selected: format[toggle]) {
                        format[toggle].toggle()
                    }
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
        }
    }

    /// L'anonymat de la partie touchée — seulement si un nom y est peint.
    private var anonymizeToggle: MessageCardFormat.Toggle? {
        guard format.showAuthors else { return nil }
        switch focus {
        case .some(.quote) where hasQuote: return .anonymizeQuoted
        case .some(.reply): return .anonymizeReply
        default: return nil
        }
    }

    private var linkPanel: some View {
        row {
            ForEach(MessageCardLinkID.allCases, id: \.self) { link in
                tile(MessageCardExportText.linkLabel(link), selected: link == format.template.link) {
                    format.template = format.template.with(link: link)
                } content: {
                    MessageCardLinkGlyph(link: link).frame(width: 46, height: 40)
                }
            }
        }
    }

    private var detailsPanel: some View {
        row {
            ForEach(format.offeredToggles(hasConversationTitle: hasTitle, hasQuote: hasQuote), id: \.self) { toggle in
                pill(MessageCardExportText.toggleLabel(toggle), selected: format[toggle]) {
                    format[toggle].toggle()
                }
            }
        }
    }

    private var languagePanel: some View {
        row {
            pill(MessageCardExportText.text("export.card.language.asRead", "Comme je le lis"), selected: exportLanguage == nil) {
                exportLanguage = nil
            }
            ForEach(languages, id: \.self) { code in
                pill(LanguageDisplay.from(code: code)?.name ?? code.uppercased(), selected: exportLanguage == code) {
                    exportLanguage = code
                }
            }
        }
    }

    // MARK: - Briques

    func row<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: MeeshySpacing.smPlus) { content() }
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.vertical, MeeshySpacing.xxs)
        }
    }

    func tile<Content: View>(
        _ label: String,
        selected: Bool,
        action: @escaping () -> Void,
        @ViewBuilder content: () -> Content
    ) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            VStack(spacing: MeeshySpacing.xsPlus) {
                content()
                    .frame(width: 56, height: 56)
                    .background(RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous).fill(Color.primary.opacity(selected ? 0.14 : 0.06)))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous)
                            .strokeBorder(selected ? Color.primary : Color.clear, lineWidth: MeeshyBorder.strong)
                    )
                Text(label)
                    .font(.caption2.weight(selected ? .semibold : .regular))
                    .lineLimit(1)
                    .frame(width: 64)
            }
        }
        .buttonStyle(MessageCardPressStyle())
        .foregroundStyle(.primary)
        .accessibilityLabel(label)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }

    func pill(_ label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            HStack(spacing: MeeshySpacing.xsPlus) {
                if selected { Image(systemName: "checkmark").font(.footnote.weight(.bold)) }
                Text(label).font(.subheadline.weight(.semibold)).lineLimit(1)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .frame(minHeight: 44)
            .foregroundStyle(selected ? Color(uiColor: .systemBackground) : Color.primary)
            .background(Capsule().fill(selected ? Color.primary : Color.primary.opacity(0.07)))
        }
        .buttonStyle(MessageCardPressStyle())
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}
