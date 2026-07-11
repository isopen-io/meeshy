import SwiftUI
import MeeshySDK

/// Résout le `ColorScheme` à épingler sur le chrome (bulles, FABs, header,
/// actions) posé SUR le canvas d'une story — composer ET reader.
///
/// Le fond de la slide appartient au CONTENU, pas au thème de l'app : une app
/// en light mode sur une slide bleu nuit rendait les icônes `indigo950` de
/// `glassControlForeground` illisibles (capture user 2026-07-11). Épingler
/// `\.colorScheme` sur les grappes de contrôles fait suivre d'un coup les
/// foregrounds adaptatifs ET les fallbacks matériau d'`adaptiveGlass`.
///
/// Seuil : point d'équilibre WCAG (~0.179) — sous cette luminance relative,
/// le blanc contraste mieux que le noir sur le fond considéré.
public enum CanvasChromeScheme {

    /// Luminance relative WCAG 2.x (0 = noir … 1 = blanc) d'un hex `RRGGBB`
    /// (avec ou sans `#`). `nil` si le hex est invalide.
    public nonisolated static func relativeLuminance(hex: String) -> Double? {
        var h = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if h.hasPrefix("#") { h.removeFirst() }
        guard h.count == 6, h.allSatisfy(\.isHexDigit),
              let v = UInt32(h, radix: 16) else { return nil }
        func lin(_ c: Double) -> Double {
            c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        let r = lin(Double((v >> 16) & 0xFF) / 255)
        let g = lin(Double((v >> 8) & 0xFF) / 255)
        let b = lin(Double(v & 0xFF) / 255)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    /// Luminance d'un fond de slide SÉRIALISÉ (`RRGGBB`, `#RRGGBB` ou
    /// `gradient:AAAAAA:BBBBBB` — moyenne des deux stops, cf.
    /// `StoryBackgroundValue`). `nil` si invalide.
    public nonisolated static func backgroundLuminance(_ background: String?) -> Double? {
        guard let background, !background.isEmpty else { return nil }
        let normalized = background.replacingOccurrences(of: "#", with: "")
        switch StoryBackgroundValue.parse(normalized) {
        case .hex(let h):
            return relativeLuminance(hex: h)
        case .gradient(let a, let b):
            guard let la = relativeLuminance(hex: a),
                  let lb = relativeLuminance(hex: b) else { return nil }
            return (la + lb) / 2
        }
    }

    /// Point d'équilibre des ratios de contraste WCAG blanc-vs-noir.
    public nonisolated static let darkThreshold = 0.179

    /// Scheme du chrome pour un fond donné. Un fond MÉDIA (image/vidéo)
    /// force `.dark` : letterbox noir + photos majoritairement sombres, et
    /// c'est la convention des viewers plein écran. Fond illisible/absent →
    /// `.dark` (fallback du composer `1A1A2E` est sombre).
    public nonisolated static func scheme(background: String?, hasMediaBackground: Bool) -> ColorScheme {
        if hasMediaBackground { return .dark }
        guard let lum = backgroundLuminance(background) else { return .dark }
        return lum < darkThreshold ? .dark : .light
    }
}
