import SwiftUI
import MeeshySDK

/// Façade SwiftUI sur `AttachmentKind` : reprend ses propriétés pures
/// (`sfSymbolName`, `hexTintColor`, `shortLabel`) et y ajoute la couleur
/// `SwiftUI.Color` dérivée du hex. Le mapping `mimeType → présentation` reste
/// déclaré une seule fois dans `AttachmentKind` (MeeshySDK) ; cette façade
/// existe uniquement parce que `SwiftUI.Color` n'est pas disponible dans le
/// target SDK qui n'importe pas SwiftUI.
///
/// Pure value type — `nonisolated` partout pour rester appelable depuis les
/// tests (qui ne tournent pas sous `@MainActor`) malgré le
/// `defaultIsolation(MainActor)` du package MeeshyUI. Aucun état mutable,
/// aucune dépendance UIKit/SwiftUI runtime au-delà de `Color`.
public struct AttachmentDisplay: Sendable, Equatable {
    public nonisolated let icon: String                 // SF Symbol name
    public nonisolated let tintColor: Color
    public nonisolated let hexTintColor: String         // hex sans préfixe `#`
    public nonisolated let shortLabel: String           // "Photo", "Vidéo", "Excel"...

    public nonisolated init(icon: String, tintColor: Color, hexTintColor: String, shortLabel: String) {
        self.icon = icon
        self.tintColor = tintColor
        self.hexTintColor = hexTintColor
        self.shortLabel = shortLabel
    }

    /// Construit la présentation à partir de la famille — tout en réutilisant
    /// les primitives déclarées dans `AttachmentKind`. Aucune duplication.
    public nonisolated static func make(for kind: AttachmentKind) -> AttachmentDisplay {
        AttachmentDisplay(
            icon: kind.sfSymbolName,
            tintColor: Color(hex: kind.hexTintColor),
            hexTintColor: kind.hexTintColor,
            shortLabel: kind.shortLabel
        )
    }

    /// Raccourci : dérive la présentation directement depuis un mimeType.
    public nonisolated static func make(for mimeType: String) -> AttachmentDisplay {
        make(for: AttachmentKind(mimeType: mimeType))
    }
}
