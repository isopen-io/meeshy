import Foundation

/// Répartition PURE des contrôles de transport entre la barre unique visible
/// et le menu ⋯ (lifting Liquid Glass 2026-07-11). L'API `ControlSet` reste
/// la seule entrée : les call sites existants n'ont pas changé, seul le rendu
/// des options `.speed`/`.loop`/`.pip` (menu) et `.mute`/`.airplay` (barre)
/// a été déplacé.
public nonisolated enum TransportLayout {
    public enum BarItem: Hashable, Sendable { case mute, airplay }
    public enum MenuItem: Hashable, Sendable { case speed, loop, pip }

    public static func barItems(for controls: MeeshyVideoPlayer.ControlSet) -> [BarItem] {
        var items: [BarItem] = []
        if controls.contains(.mute) { items.append(.mute) }
        if controls.contains(.airplay) { items.append(.airplay) }
        return items
    }

    public static func menuItems(for controls: MeeshyVideoPlayer.ControlSet) -> [MenuItem] {
        var items: [MenuItem] = []
        if controls.contains(.speed) { items.append(.speed) }
        if controls.contains(.loop) { items.append(.loop) }
        if controls.contains(.pip) { items.append(.pip) }
        return items
    }

    public static func showsMenuButton(for controls: MeeshyVideoPlayer.ControlSet) -> Bool {
        !menuItems(for: controls).isEmpty
    }
}
