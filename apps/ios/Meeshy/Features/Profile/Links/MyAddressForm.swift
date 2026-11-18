import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Ajouter une adresse » (planche `Mes-Adresses`) : l'adresse (prévalidée par la règle partagée, dite tout de suite),
/// le titre et son compteur (K10), l'icône en tuiles (K47), le cercle qui la voit en puces (K04), « Compter les clics »
/// (K06), puis « Ajouter » (K40). L'adresse n'apparaît qu'une fois servie : c'est le serveur qui frappe son lien de suivi.
struct MyAddressForm: View {
    @ObservedObject var store: ProfileAddressesStore
    let accent: Color

    @State private var url = ""
    @State private var title = ""
    @State private var glyph: ProfileAddressGlyph = .site
    @State private var circle: RelationLevel = .public
    @State private var countsClicks = true
    @State private var isSending = false
    @State private var isExpanded = true

    private var normalizedURL: String? { ProfileAddressRules.normalizedURL(url) }
    private var normalizedTitle: String? { ProfileAddressRules.normalizedTitle(title) }
    private var showsURLError: Bool { !url.trimmingCharacters(in: .whitespaces).isEmpty && normalizedURL == nil }
    private var canSend: Bool { normalizedURL != nil && normalizedTitle != nil && store.canAdd && !isSending }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
            MeeshySectionHeader(title: MyAddressesCopy.addTitle, isCollapsible: true, isExpanded: isExpanded,
                                onToggle: { isExpanded = $0 })
            if isExpanded {
                if store.canAdd { fields } else { MeeshyNote(MyAddressesCopy.limitReached, kind: .info) }
            }
        }
        .accessibilityIdentifier("profile.addresses.form")
    }

    private var fields: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
            LinksFormField(label: MyAddressesCopy.urlLabel, prompt: MyAddressesCopy.urlPrompt, text: $url,
                           input: .token, caption: showsURLError ? MyAddressesCopy.urlInvalid : nil)
            LinksFormField(label: MyAddressesCopy.titleLabel, prompt: ProfileLinksCopy.glyphName(glyph), text: $title)
            glyphTiles
            circleChips
            MeeshyToggleRow(MyAddressesCopy.countClicks, systemImage: "cursorarrow.click",
                            accessory: .toggle(isOn: countsClicks),
                            tint: accent, action: { countsClicks.toggle() })
            MeeshyButton(ProfileLinksCopy.addAddress, systemImage: "plus", kind: .primary, width: .fill, tint: accent,
                         isPending: isSending, action: { Task { await send() } })
                .disabled(!canSend)
        }
    }

    private var glyphTiles: some View {
        MeeshyChoiceTiles(
            label: MyAddressesCopy.glyphLabel,
            items: ProfileAddressGlyph.allCases.map {
                MeeshyChoiceItem(id: $0.rawValue, title: ProfileLinksCopy.glyphName($0),
                                 systemImage: ProfileLinksCopy.glyph(of: $0))
            },
            selection: .single(glyph.rawValue),
            columns: 4,
            content: .icon,
            format: .compact,
            tint: accent,
            onSelect: { glyph = ProfileAddressGlyph(wire: $0) }
        )
    }

    private var circleChips: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            MeeshySectionHeader(title: MyAddressesCopy.whoSees, form: .overline)
            MeeshyChipRow(
                RelationLevel.allCases.map {
                    MeeshyChip(id: $0, title: CircleLevelNames.title(of: $0), systemImage: VitrineSeenAsCopy.glyph(of: $0))
                },
                selection: [circle],
                label: MyAddressesCopy.whoSees,
                layout: .wrap,
                surface: .theme,
                size: .compact,
                onChange: { _, level in circle = level }
            )
        }
    }

    private func send() async {
        guard let url = normalizedURL, let title = normalizedTitle else { return }
        isSending = true
        let draft = ProfileAddressDraft(url: url, title: title, glyph: glyph, circle: circle, isShown: true,
                                        countClicks: countsClicks)
        if await store.add(draft) {
            HapticFeedback.success()
            self.url = ""
            self.title = ""
        }
        isSending = false
    }
}
