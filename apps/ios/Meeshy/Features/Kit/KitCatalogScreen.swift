#if DEBUG
import SwiftUI
import MeeshyUI

/// Le catalogue du kit : la liste des composants LIVRÉS, et le détail de l'un
/// d'eux. Ses contrôles sont ceux du système, car il existe avant le verre du
/// kit. Ni réseau, ni session, ni donnée.
struct KitCatalogScreen: View {
    @State private var path: [String]

    init(requestedKey: String? = KitCatalogLaunch.requestedKey) {
        let opened = requestedKey.flatMap { MeeshyKitCatalog.listedEntry(matching: $0) }
        _path = State(initialValue: opened.map { [$0.key] } ?? [])
    }

    var body: some View {
        NavigationStack(path: $path) {
            KitCatalogList()
                .navigationTitle(Text(verbatim: "Kit"))
                .navigationBarTitleDisplayMode(.inline)
                .navigationDestination(for: String.self) { key in
                    if let entry = MeeshyKitCatalog.listedEntry(matching: key) {
                        KitCatalogDetail(entry: entry)
                    }
                }
        }
    }
}

private struct KitCatalogList: View {
    private let entries = MeeshyKitCatalog.listedEntries

    var body: some View {
        if entries.isEmpty {
            Text(verbatim: "Aucun composant livré")
                .font(.body)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(MeeshySpacing.lg)
        } else {
            List(entries) { entry in
                NavigationLink(value: entry.key) {
                    Text(verbatim: entry.accessibilityName)
                }
                .accessibilityLabel(Text(verbatim: entry.accessibilityName))
            }
        }
    }
}

private struct KitCatalogSettings: Equatable {
    var isDark = true
    var isRightToLeft = false
    var isLargeFont = false
}

private struct KitCatalogDetail: View {
    let entry: MeeshyKitCatalogEntry
    @State private var settings = KitCatalogSettings()

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: MeeshySpacing.lg) {
                ForEach(entry.tiles) { tile in
                    KitCatalogTile(key: entry.key, tile: tile).equatable()
                }
            }
            .padding(MeeshySpacing.lg)
        }
        .background(MeeshyColors.backgroundPrimary(isDark: settings.isDark))
        .environment(\.colorScheme, settings.isDark ? .dark : .light)
        .environment(\.layoutDirection, settings.isRightToLeft ? .rightToLeft : .leftToRight)
        .dynamicTypeSize(settings.isLargeFont ? .accessibility3 : .large)
        .navigationTitle(Text(verbatim: entry.accessibilityName))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { KitCatalogSettingsMenu(settings: $settings) }
    }
}

private struct KitCatalogSettingsMenu: ToolbarContent {
    @Binding var settings: KitCatalogSettings

    var body: some ToolbarContent {
        ToolbarItem(placement: .navigationBarTrailing) {
            Menu {
                Toggle(isOn: $settings.isDark) { Text(verbatim: "dark") }
                Toggle(isOn: $settings.isRightToLeft) { Text(verbatim: "rtl") }
                Toggle(isOn: $settings.isLargeFont) { Text(verbatim: "accessibility3") }
            } label: {
                Image(systemName: "slider.horizontal.3")
            }
            .accessibilityLabel(Text(verbatim: "Réglages"))
        }
    }
}

private struct KitCatalogTile: View, Equatable {
    let key: String
    let tile: MeeshyKitCatalogTile
    @Environment(\.colorScheme) private var colorScheme

    nonisolated static func == (lhs: KitCatalogTile, rhs: KitCatalogTile) -> Bool {
        lhs.key == rhs.key && lhs.tile == rhs.tile
    }

    private var legend: String {
        [tile.state.id, tile.state.boardView, tile.isPressed ? "isPressed" : nil]
            .compactMap { $0 }
            .joined(separator: " · ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(verbatim: legend)
                .font(.caption.monospaced())
                .foregroundStyle(MeeshyColors.textSecondary(isDark: colorScheme == .dark))
                .accessibilityAddTraits(.isHeader)
                .accessibilityHeading(.h2)
            MeeshyKitCatalogStage(key: key, state: tile.state, isPressed: tile.isPressed)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous))
        }
    }
}
#endif
