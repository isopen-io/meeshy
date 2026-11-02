import CoreText
import Foundation
import os
import UIKit
import MeeshySDK

// MARK: - Les polices d'apparat des cadres de gloire (§ 5.6, D10, #10158)

/// La liste FERMÉE des familles qu'un cadre peut employer. Une famille neuve
/// demande une version d'app : une police ne voyage jamais dans un pack.
/// Les fichiers sont ceux de Google Fonts, tels que distribués (SIL OFL 1.1) :
/// ni conversion ni sous-ensemble — Cinzel Decorative réserve le nom « Cinzel ».
nonisolated enum GloryFrameFontFamily: String, CaseIterable, Sendable {
    case cinzel = "Cinzel"
    case cinzelDecorative = "Cinzel Decorative"
    case cormorantGaramond = "Cormorant Garamond"
    case fraunces = "Fraunces"
    case manrope = "Manrope"

    var files: [String] {
        switch self {
        case .cinzel: ["Cinzel[wght]"]
        case .cinzelDecorative: ["CinzelDecorative-Bold", "CinzelDecorative-Black"]
        case .cormorantGaramond: ["CormorantGaramond[wght]", "CormorantGaramond-Italic[wght]"]
        case .fraunces: ["Fraunces[SOFT,WONK,opsz,wght]"]
        case .manrope: ["Manrope[wght]"]
        }
    }

    /// L'instance nommée d'où part la variation de graisse ; une famille STATIQUE
    /// (Cinzel Decorative) choisit son fichier le plus proche.
    func baseName(weight: CGFloat, italic: Bool) -> String {
        switch self {
        case .cinzel: "Cinzel-Regular"
        case .cinzelDecorative: weight >= 800 ? "CinzelDecorative-Black" : "CinzelDecorative-Bold"
        case .cormorantGaramond: italic ? "CormorantGaramond-Italic" : "CormorantGaramond-Regular"
        case .fraunces: "Fraunces-Regular"
        case .manrope: "Manrope-Regular"
        }
    }

    var isVariable: Bool { self != .cinzelDecorative }
}

/// **Quelle écriture porte un texte** : ces polices ne couvrent que le latin.
/// Une lettre d'une autre écriture (cyrillique, grec, hébreu, arabe, CJK,
/// devanagari…) ou un emoji fait prendre la pile système au texte entier — choisi
/// d'après ses PLAGES UNICODE, jamais d'après la langue de l'interface (D10).
nonisolated enum GloryFrameScript {
    private static let latin: [ClosedRange<UInt32>] = [
        0x0000...0x024F,
        0x0250...0x02FF,
        0x0300...0x036F,
        0x1AB0...0x1AFF,
        0x1DC0...0x1DFF,
        0x1E00...0x1EFF,
        0x2000...0x206F,
        0x20A0...0x20CF,
        0x2100...0x214F,
        0x2C60...0x2C7F,
        0xA720...0xA7FF,
        0xFB00...0xFB06,
    ]

    static func needsSystemFont(_ text: String) -> Bool {
        text.unicodeScalars.contains { scalar in
            if scalar.properties.isEmojiPresentation || (scalar.properties.isEmoji && scalar.value > 0x2100) { return true }
            return !latin.contains { $0.contains(scalar.value) }
        }
    }
}

/// **Les polices des cadres, enregistrées à la demande** — jamais au démarrage :
/// le premier cadre qui emploie une famille l'enregistre pour le processus
/// (`CTFontManagerRegisterFontsForURL`, `.process`), les suivants la retrouvent.
/// Un texte non latin, ou une famille qui ne s'enregistre pas, prend la pile
/// système : jamais une police de substitution choisie par le hasard du système.
nonisolated final class GloryFrameFonts: @unchecked Sendable {
    static let shared = GloryFrameFonts()

    private static let weightAxis = 0x7767_6874 as UInt32
    private let bundle: Bundle
    private let lock = NSLock()
    private var registered: Set<GloryFrameFontFamily> = []
    private let logger = MeeshyLog.logger(.game)

    init(bundle: Bundle = .main) {
        self.bundle = bundle
    }

    func font(_ family: GloryFrameFontFamily, weight: CGFloat, italic: Bool = false, size: CGFloat, for text: String) -> CTFont {
        guard !GloryFrameScript.needsSystemFont(text), register(family) else {
            return Self.systemFont(weight: weight, italic: italic, size: size)
        }
        let base = CTFontDescriptorCreateWithNameAndSize(family.baseName(weight: weight, italic: italic) as CFString, size)
        let descriptor = family.isVariable
            ? CTFontDescriptorCreateCopyWithVariation(base, NSNumber(value: Self.weightAxis), weight)
            : base
        let font = CTFontCreateWithFontDescriptor(descriptor, size, nil)
        guard CTFontCopyFamilyName(font) as String == family.rawValue else {
            return Self.systemFont(weight: weight, italic: italic, size: size)
        }
        return font
    }

    /// Idempotent ; vrai si la famille est disponible au processus.
    @discardableResult
    func register(_ family: GloryFrameFontFamily) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if registered.contains(family) { return true }
        let urls = family.files.compactMap { bundle.url(forResource: $0, withExtension: "ttf") }
        guard urls.count == family.files.count else {
            logger.error("Glory frame font missing in bundle: \(family.rawValue, privacy: .public)")
            return false
        }
        let ok = urls.allSatisfy(Self.registerFile)
        if ok { registered.insert(family) }
        return ok
    }

    private static func registerFile(_ url: URL) -> Bool {
        var error: Unmanaged<CFError>?
        if CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error) { return true }
        guard let failure = error?.takeRetainedValue() else { return false }
        return CFErrorGetCode(failure) == CTFontManagerError.alreadyRegistered.rawValue
    }

    private static func systemFont(weight: CGFloat, italic: Bool, size: CGFloat) -> CTFont {
        let font = UIFont.systemFont(ofSize: size, weight: uiWeight(weight))
        guard italic, let descriptor = font.fontDescriptor.withSymbolicTraits(.traitItalic) else { return font as CTFont }
        return UIFont(descriptor: descriptor, size: size) as CTFont
    }

    private static func uiWeight(_ weight: CGFloat) -> UIFont.Weight {
        switch weight {
        case ..<250: .ultraLight
        case ..<350: .light
        case ..<450: .regular
        case ..<550: .medium
        case ..<650: .semibold
        case ..<750: .bold
        case ..<850: .heavy
        default: .black
        }
    }
}
