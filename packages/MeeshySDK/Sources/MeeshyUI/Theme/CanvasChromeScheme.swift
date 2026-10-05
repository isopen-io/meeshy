import SwiftUI
import UIKit
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
        return luminance(red: Double((v >> 16) & 0xFF) / 255,
                         green: Double((v >> 8) & 0xFF) / 255,
                         blue: Double(v & 0xFF) / 255)
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

    /// Seuil de bascule pour un fond MÉDIA, volontairement AU-DESSUS de
    /// l'équilibre WCAG pur : sur une photo, le chrome blanc reste la
    /// convention plein écran et le verre frosté ajoute du contraste local —
    /// on ne bascule en `.light` que sur un fond franchement clair (capture
    /// user 2026-07-20 : capture d'écran BLANCHE posée en Background →
    /// chrome blanc invisible avec le `.dark` forfaitaire).
    public nonisolated static let mediaDarkThreshold = 0.35

    /// Luminance relative WCAG moyenne d'un bitmap (média de fond), obtenue
    /// en le rééchantillonnant en 8×8 sRGB puis en moyennant la luminance
    /// LINÉARISÉE de chaque pixel. `nil` si le bitmap n'est pas rendable
    /// (CGImage absent) — l'appelant retombe alors sur la convention `.dark`.
    public nonisolated static func averageRelativeLuminance(of image: UIImage) -> Double? {
        guard let cg = image.cgImage else { return nil }
        let side = 8
        var pixels = [UInt8](repeating: 0, count: side * side * 4)
        guard let space = CGColorSpace(name: CGColorSpace.sRGB),
              let ctx = CGContext(data: &pixels, width: side, height: side,
                                  bitsPerComponent: 8, bytesPerRow: side * 4,
                                  space: space,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return nil }
        ctx.interpolationQuality = .medium
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: side, height: side))
        func lin(_ c: Double) -> Double {
            c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        var total = 0.0
        for p in stride(from: 0, to: pixels.count, by: 4) {
            let r = lin(Double(pixels[p]) / 255)
            let g = lin(Double(pixels[p + 1]) / 255)
            let b = lin(Double(pixels[p + 2]) / 255)
            total += 0.2126 * r + 0.7152 * g + 0.0722 * b
        }
        return total / Double(side * side)
    }

    /// Scheme du chrome pour un fond donné. Un fond MÉDIA suit la luminance
    /// RÉELLE de son bitmap quand elle est connue (`mediaLuminance`) — un
    /// média clair (capture d'écran blanche) exige un chrome sombre. Sans
    /// bitmap mesurable (vidéo sans thumbnail, chargement en cours), on garde
    /// la convention viewer plein écran : `.dark`. Fond couleur : luminance
    /// WCAG du hex/gradient ; illisible/absent → `.dark` (fallback composer
    /// `1A1A2E` sombre).
    public nonisolated static func scheme(background: String?,
                                          hasMediaBackground: Bool,
                                          mediaLuminance: Double? = nil) -> ColorScheme {
        if hasMediaBackground {
            guard let mediaLuminance else { return .dark }
            return mediaLuminance < mediaDarkThreshold ? .dark : .light
        }
        return scheme(forBareGlyphOver: backgroundLuminance(background))
    }

    /// **Scheme d'un glyphe posé NU** — sans verre ni pastille (#6704, #6693) : les rails
    /// du lecteur de story et du lecteur de Réels, et un fond uni.
    ///
    /// Le biais de `mediaDarkThreshold` s'appuie sur le contraste local du verre dépoli ;
    /// un glyphe nu ne l'a pas. Il bascule donc à l'équilibre WCAG, `darkThreshold` — la
    /// frontière d'un fond uni —, où chaque teinte de `glassControlForeground()` tient
    /// 3:1 sur toute luminance uniforme : au pire 3,49:1 (indigo950 sur L 0,179) et
    /// 4,59:1 (blanc juste en dessous). Au seuil média, un glyphe blanc sur L 0,35 tombait
    /// à 2,63:1 — Enregistrer mesuré à 2,62:1 sur la mire de la vérification du
    /// 2026-09-15. Sans luminance mesurable : la convention `.dark`.
    public nonisolated static func scheme(forBareGlyphOver luminance: Double?) -> ColorScheme {
        guard let luminance else { return .dark }
        return luminance < darkThreshold ? .dark : .light
    }

    /// **Le halo, plancher de lisibilité d'un glyphe nu** : de la polarité OPPOSÉE au
    /// glyphe — noir sous un glyphe blanc, blanc sous un glyphe sombre. Sous des bandes
    /// alternées (cyan et bleu sous un même glyphe), aucune teinte ne tient 3:1 sur les
    /// deux (blanc 1,25:1 sur cyan, indigo 1,86:1 sur bleu) : c'est le halo qui détache
    /// alors le bord du glyphe.
    public nonisolated static func legibilityHalo(for scheme: ColorScheme) -> Color {
        scheme == .dark ? .black : .white
    }

    // MARK: - Un TEXTE posé sur la scène (#9450)

    /// **L'opacité du voile sans bord posé sous un texte de scène** — la légende du
    /// composer. Le voile est le halo (`legibilityHalo`) étalé sous le bloc de texte.
    ///
    /// Le flou `.ultraThinMaterial` seul ne se calcule pas hors appareil, et il ne
    /// suffisait pas : sur le rose `FF2E63` (L 0,24, juste au-dessus de `darkThreshold`),
    /// l'invite mesurait 2,71:1. Près de la frontière, ni l'encre claire ni l'encre
    /// sombre ne tiennent 4,5:1 à nu (indigo950 sur L 0,18 : 3,4:1). Le voile éloigne
    /// le fond de la frontière, dans le sens de l'encre que le schéma a élue.
    ///
    /// 0,25 : le pire cas de la palette du composer, teintes ET dégradés échantillonnés
    /// sur toute leur course, tombe à 5,33:1 (dégradé `9B59B6 → FF6B6B`) — 0,20 donnait
    /// 4,89:1, trop près du seuil pour un modèle qui compose en sRGB encodé. Le flou
    /// reste dessous, non compté : il pousse vers la même polarité que le voile.
    public nonisolated static let sceneTextVeilOpacity: Double = 0.25

    /// **L'encre d'un texte posé sur la scène : PRIMAIRE, jamais secondaire.**
    /// `textSecondary(isDark: false)` (indigo700 à 0,8) plafonne à 4,98:1 sur du BLANC
    /// pur : aucun voile discret ne le porte à 4,5:1 sur une teinte moyenne. L'invite se
    /// distingue du texte par sa forme, pas par une encre plus pâle.
    public static func sceneTextInk(for scheme: ColorScheme) -> Color {
        MeeshyColors.textPrimary(isDark: scheme == .dark)
    }

    /// Luminance WCAG d'un fond sRGB (canaux 0…1) une fois couvert du voile de
    /// `scheme` à `sceneTextVeilOpacity` — composition « source over » en sRGB
    /// encodé, celle du compositeur.
    public nonisolated static func luminanceUnderSceneTextVeil(red: Double, green: Double, blue: Double,
                                                               scheme: ColorScheme) -> Double {
        let halo: Double = scheme == .dark ? 0 : 1
        let a = sceneTextVeilOpacity
        func veiled(_ c: Double) -> Double { halo * a + c * (1 - a) }
        return luminance(red: veiled(red), green: veiled(green), blue: veiled(blue))
    }

    /// Rapport de contraste WCAG 2.x entre deux luminances relatives.
    public nonisolated static func contrastRatio(_ a: Double, _ b: Double) -> Double {
        (max(a, b) + 0.05) / (min(a, b) + 0.05)
    }

    /// Luminance relative WCAG 2.x de canaux sRGB encodés (0…1).
    public nonisolated static func luminance(red: Double, green: Double, blue: Double) -> Double {
        func lin(_ c: Double) -> Double {
            c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * lin(red) + 0.7152 * lin(green) + 0.0722 * lin(blue)
    }
}
