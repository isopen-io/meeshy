import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Aperçu de ton billet » (planches `Lien-Creer` et `Lien-Suivi-Creer`) : le billet du kit (K30) en brouillon, qui
/// suit la saisie, et ses chiffres dans la bande du kit (K34). Rien n'est dessiné ici.
struct LinkTicketPreviewView: View {
    let preview: LinkTicketPreview
    let tint: Color
    let systemImage: String

    private var spoken: String {
        ([preview.kindLabel, preview.title, preview.code] + preview.figures.map { "\($0.value) \($0.unit)" })
            .joined(separator: ", ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            MeeshySectionHeader(title: LinkCreationCopy.preview, form: .overline)
            MeeshyTicket(title: preview.title, code: preview.code, tint: tint, systemImage: systemImage,
                         figure: nil, figureCaption: nil, size: .compact, kind: .draft,
                         isFlipped: false, isSelected: false, isDragging: false,
                         label: spoken, statusLabel: nil, flipLabels: nil, onPress: nil,
                         stub: {
                             MeeshyFigureBand(items: preview.figures.map { MeeshyFigureItem(value: $0.value, unit: $0.unit) },
                                              size: .compact, emptyLabel: ProfileActivityBand.emptyLabel)
                         },
                         leading: { EmptyView() },
                         trailing: { EmptyView() },
                         status: { EmptyView() },
                         back: { EmptyView() })
                .accessibilityIdentifier("links.create.preview")
        }
    }
}

/// « Expire » : les crans de la planche en puces du kit (K04), choix unique.
struct LinkExpiryPicker: View {
    let notches: [LinkExpiryNotch]
    let selection: LinkExpiryNotch
    let onChange: (LinkExpiryNotch) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Label(LinkCreationCopy.expires, systemImage: "clock")
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .foregroundStyle(ThemeManager.shared.textSecondary)
                .accessibilityHidden(true)
            MeeshyChipRow(
                notches.map { MeeshyChip(id: $0, title: LinkCreationCopy.notchTitle($0)) },
                selection: [selection],
                label: LinkCreationCopy.expires,
                layout: .equal,
                surface: .theme,
                size: .compact,
                onChange: { _, notch in onChange(notch) }
            )
        }
    }
}

/// Une adresse courte qu'on choisit : le préfixe en tête du champ du kit (K08), la saisie normalisée à la frappe, la
/// règle dite sous le champ quand la saisie l'enfreint ; l'adresse tirée au hasard derrière le (i) du nom.
struct LinkSlugField: View {
    let prefix: String
    let slug: String
    let isAcceptable: Bool
    @Binding var openNoteID: String?
    let onChange: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
            MeeshyInfoNoted(note: LinkCreationCopy.addressNote, openNoteID: $openNoteID, tint: ThemeManager.shared.textSecondary) {
                Text(LinkCreationCopy.addressLabel)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .foregroundStyle(ThemeManager.shared.textSecondary)
                    .accessibilityHidden(true)
            }
            MeeshyField(LinkCreationCopy.addressLabel, text: slug, input: .token,
                        caption: isAcceptable ? nil : LinkCreationCopy.addressInvalid,
                        leading: .glyph(prefix), limit: LinkSlugRules.maxLength,
                        onChange: { onChange(LinkSlugRules.normalized($0)) })
                .environment(\.layoutDirection, .leftToRight)
        }
    }
}
