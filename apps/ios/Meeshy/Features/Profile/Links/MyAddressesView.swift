import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Mes adresses » (#18871, planche `Mes-Adresses`), poussé depuis la face Liens : chaque adresse dans sa carte de
/// groupe (K43) — son titre modifiable (K10), son adresse en chasse fixe, « Afficher sur ma vitrine » (K06), le cercle
/// qui la voit et ses clics —, rangées par la liste réordonnable (K52) ; puis « Ajouter une adresse ». Chaque geste
/// s'applique tout de suite et se défait, en le disant, si le serveur refuse.
struct MyAddressesView: View {
    @ObservedObject private var store: ProfileAddressesStore
    let accent: Color

    /// Le même magasin que la face Liens : ce qu'on règle ici s'y voit au retour, sans relecture.
    init(store: ProfileAddressesStore? = nil, accent: Color) {
        _store = ObservedObject(wrappedValue: store ?? ProfileAddressesStore.shared)
        self.accent = accent
    }

    @State private var circleFor: ProfileAddress?
    @State private var removing: ProfileAddress?

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        LinksPage(title: ProfileLinksCopy.addressesTitle, accent: accent) {
            ScrollViewReader { proxy in
                VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
                    MeeshyNote(MyAddressesCopy.intro, lead: .systemImage("eye"))
                    if !store.addresses.isEmpty {
                        MeeshyNote(MyAddressesCopy.summary(count: store.addresses.count, clicks: store.totalClicks),
                                   lead: .systemImage("cursorarrow.click"), tint: accent)
                    }
                    list(scrollToForm: {
                        withAnimation(.easeInOut) { proxy.scrollTo(Self.formAnchor, anchor: .top) }
                    })
                    MyAddressForm(store: store, accent: accent)
                        .id(Self.formAnchor)
                    MeeshyNote(MyAddressesCopy.leaving, kind: .security, lead: .systemImage("checkmark.shield"))
                }
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.top, MeeshySpacing.sm)
                .padding(.bottom, 40)
            }
        }
        .task { await store.load() }
        .refreshable { await store.refresh() }
        .confirmationDialog(MyAddressesCopy.whoSees, isPresented: isAsking($circleFor), titleVisibility: .visible,
                            presenting: circleFor) { address in circleChoices(address) }
        .confirmationDialog(removing.map { MyAddressesCopy.removeConfirm($0.title) } ?? MyAddressesCopy.remove,
                            isPresented: isAsking($removing), titleVisibility: .visible, presenting: removing) { address in
            Button(MyAddressesCopy.remove, role: .destructive) { Task { await store.remove(id: address.id) } }
        }
        .alert(store.refusal ?? "", isPresented: Binding(get: { store.refusal != nil }, set: { if !$0 { store.refusal = nil } })) {
            Button(ProfileLinksCopy.close, role: .cancel) { store.refusal = nil }
        }
        .accessibilityIdentifier("profile.addresses")
    }

    private func isAsking(_ item: Binding<ProfileAddress?>) -> Binding<Bool> {
        Binding(get: { item.wrappedValue != nil }, set: { if !$0 { item.wrappedValue = nil } })
    }

    @ViewBuilder
    private func circleChoices(_ address: ProfileAddress) -> some View {
        ForEach(RelationLevel.allCases, id: \.self) { level in
            Button(CircleLevelNames.title(of: level)) { Task { await store.setCircle(level, for: address.id) } }
        }
    }

    private static let formAnchor = "profile.addresses.form.anchor"

    @ViewBuilder
    private func list(scrollToForm: @escaping () -> Void) -> some View {
        switch (store.phase, store.addresses.isEmpty) {
        case (.loading, true):
            ForEach(0..<2, id: \.self) { _ in MeeshySkeleton(shape: .card(aspect: 3, radius: Double(MeeshyRadius.lg))) }
        case (.failed, true):
            MeeshyStateBlock(kind: .error, title: ProfileLinksCopy.addressesUnavailable,
                             primary: MeeshyStateBlockAction(title: ProfileLinksCopy.retry, systemImage: "arrow.clockwise",
                                                             perform: { Task { await store.refresh() } }),
                             art: .none, size: .compact, tint: accent)
        case (_, true):
            MeeshyStateBlock(
                kind: .empty,
                title: MyAddressesCopy.emptyTitle,
                primary: MeeshyStateBlockAction(title: MyAddressesCopy.addTitle, systemImage: "plus", perform: scrollToForm),
                art: .glyph,
                tint: accent
            ) {
                MyAddressesEmptyTiles(accent: accent)
            }
        default:
            MeeshyReorderList(
                label: MyAddressesCopy.listLabel,
                items: store.addresses,
                id: { $0.id },
                title: { $0.title },
                labels: MeeshyReorderLabels(handle: { MyAddressesCopy.handle($0) }, moveUp: MyAddressesCopy.moveUp,
                                            moveDown: MyAddressesCopy.moveDown,
                                            announce: { MyAddressesCopy.announce($0, rank: $1, count: $2) }),
                onMove: { from, to in Task { await store.move(from: from, to: to) } },
                tint: accent
            ) { address, context in
                MyAddressRow(address: address, accent: accent, handle: context.handle,
                             onRename: { title in Task { await store.rename(title, for: address.id) } },
                             onShown: { shown in Task { await store.setShown(shown, for: address.id) } },
                             onCircle: { circleFor = address },
                             onRemove: { removing = address })
            }
        }
    }
}

/// Le vide de « Mes adresses » (planche `Etat-Vide` vue 2) : trois tuiles fantômes — Site, Musique, Photos — qui disent
/// ce qu'une adresse peut être. Muettes pour le lecteur d'écran : le titre du bloc le dit.
struct MyAddressesEmptyTiles: View {
    let accent: Color
    private static let glyphs: [ProfileAddressGlyph] = [.site, .music, .photos]

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            ForEach(Self.glyphs, id: \.self) { glyph in
                VStack(spacing: MeeshySpacing.xs) {
                    Image(systemName: ProfileLinksCopy.glyph(of: glyph))
                        .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold))
                        .foregroundStyle(accent)
                    Text(ProfileLinksCopy.glyphName(glyph))
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, minHeight: 72)
                .background(RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                    .strokeBorder(Color.secondary.opacity(MeeshyOpacity.light),
                                  style: StrokeStyle(lineWidth: MeeshyBorder.emphasis, dash: [4, 3])))
            }
        }
        .accessibilityHidden(true)
    }
}

/// Une adresse dans sa carte (planche `Mes-Adresses`) : le titre se modifie sur place et part à la validation.
struct MyAddressRow: View {
    let address: ProfileAddress
    let accent: Color
    let handle: MeeshyReorderHandle
    let onRename: (String) -> Void
    let onShown: (Bool) -> Void
    let onCircle: () -> Void
    let onRemove: () -> Void

    @State private var title: String = ""
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        MeeshyGroupCard(tint: accent) {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                HStack(spacing: MeeshySpacing.sm) {
                    MeeshyField(MyAddressesCopy.titleField, text: title, input: .sentence,
                                leading: .icon(systemImage: ProfileLinksCopy.glyph(of: address.glyph)),
                                limit: ProfileAddressRules.titleMaxLength,
                                onChange: { title = $0 }, onCommit: { onRename($0) })
                    handle
                }
                HStack {
                    Text(address.displayURL)
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, design: .monospaced))
                        .foregroundStyle(theme.textSecondary)
                        .environment(\.layoutDirection, .leftToRight)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer(minLength: MeeshySpacing.sm)
                    if let clicks = address.clicks {
                        Text(MyAddressesCopy.clicks(clicks))
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                            .foregroundStyle(theme.textMuted)
                    }
                }
                MeeshyToggleRow(MyAddressesCopy.show, accessory: .toggle(isOn: address.isShown), tint: accent,
                                action: { onShown(!address.isShown) })
                MeeshyToggleRow(MyAddressesCopy.whoSees, systemImage: VitrineSeenAsCopy.glyph(of: address.circle ?? .public),
                                accessory: .value(address.circle.map(CircleLevelNames.title(of:)) ?? "—"),
                                tint: accent, action: { onCircle() })
                MeeshyButton(MyAddressesCopy.remove, systemImage: "trash", kind: .text, size: .s36, isDestructive: true,
                             action: { onRemove() })
            }
        }
        .onAppear { title = address.title }
        .adaptiveOnChange(of: address.title) { _, served in title = served }
    }
}
