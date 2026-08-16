import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ligne 2 du pont ✦ (contrat §3.2, workshop I-065) — rend UN
/// `ConversationBridge` en texte + point accent `LentilleMetrics.UnreadDot`
/// (8, couleur accent). Vue de FEUILLE PURE : aucun `@State`, aucune
/// résolution de langue à elle — les DEUX étages du pont se résolvent par
/// une loi déjà écrite ailleurs (E7) :
///
/// - `kind == .fallback` → `LentilleBridgeFormatter.formatBridge` (miroir
///   Swift GELÉ, `Lentille/Core/LentilleBridgeFormatter.swift`), avec un `t`
///   iOS concret (`LentilleBridgeTranslator`, ce fichier) sur les données
///   déterministes du pont — rien à traduire, la phrase naît déjà dans la
///   langue du lecteur.
/// - `kind == .agent` → une vraie phrase, donc soumise au Prisme :
///   `resolveAgentText` applique le MÊME algorithme que
///   `MeeshyConversation.resolvedLastMessagePreview` (SDK, gelé) à la paire
///   `bridge.translations`/`bridge.originalLanguage`. Ce n'est PAS une
///   seconde loi de langue (interdite par le contrat §5.2, conséquence 2) —
///   c'est la même règle en trois points (langue d'origine à son propre
///   rang, sinon première traduction du prisme, sinon repli sur le texte),
///   copiée ici parce que le type SDK gelé n'expose sa loi que sur les
///   champs `lastMessage*`, jamais sur `ConversationBridge`.
struct LentilleBridgeLine: View {
    let bridge: ConversationBridge
    let preferredLanguages: [String]
    let accentColor: String
    var isDark: Bool = false

    var body: some View {
        HStack(spacing: MeeshySpacing.xs) {
            Circle()
                .fill(Color(hex: accentColor))
                .frame(width: LentilleMetrics.UnreadDot.size, height: LentilleMetrics.UnreadDot.size)

            Text(resolvedText)
                .font(LentilleMetrics.Line2.font)
                .foregroundColor(textColor)
                .lineLimit(1)

            // `isComplete == false` (`LentilleProviders.swift`, gelé) :
            // la fenêtre de calcul du producteur ne couvre pas tout
            // l'intervalle non lu — la ligne le déclare, jamais un chiffre
            // extrapolé au-delà de ce qui a réellement été vu.
            if bridge.isComplete == false, let count = bridge.data?.messageCount {
                Text(String(format: partialFormat, count))
                    .font(LentilleMetrics.Line2.font)
                    .foregroundColor(MeeshyColors.textMuted(isDark: isDark))
                    .lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
    }

    /// Ligne 2 en indigo pour l'étage agent (contrat §4.3 : « Agent ✦ …
    /// ligne 2 en indigo ») — distingue visuellement une phrase générée
    /// d'un décompte déterministe, sans dupliquer l'anneau pointillé de
    /// l'avatar (LWS-8, hors périmètre de ce fichier).
    private var textColor: Color {
        bridge.kind == .agent ? MeeshyColors.indigo400 : textSecondary
    }

    private var textSecondary: Color { MeeshyColors.textSecondary(isDark: isDark) }

    private var partialFormat: String {
        String(localized: "lentille.bridge.partial", defaultValue: "sur les %d derniers messages", bundle: .main)
    }

    private var resolvedText: String {
        switch bridge.kind {
        case .fallback:
            guard let data = bridge.data else { return "" }
            return LentilleBridgeFormatter.formatBridge(data: data, t: LentilleBridgeTranslator.translate)
        case .agent:
            return Self.resolveAgentText(bridge: bridge, preferredLanguages: preferredLanguages) ?? ""
        }
    }

    /// Preuve E7 côté rendu — voir le commentaire d'en-tête. `nonisolated
    /// static` pour rester directement testable (I-065, « tests minimaux
    /// embarqués ») sans construire de vue ni traverser `@MainActor`
    /// (`LentilleBridgeLine` est une `View`, MainActor par défaut de cible).
    nonisolated static func resolveAgentText(bridge: ConversationBridge, preferredLanguages: [String]) -> String? {
        guard let translations = bridge.translations, !translations.isEmpty else {
            return bridge.text
        }
        let preferred = preferredLanguages.filter { !$0.isEmpty }.map { $0.lowercased() }
        let original = bridge.originalLanguage?.lowercased()
        for lang in preferred {
            if let original, lang == original {
                return bridge.text
            }
            if let translated = translations[lang] {
                return translated
            }
        }
        return bridge.text
    }
}

/// Concrétisation iOS du `BridgeTranslate` attendu par
/// `LentilleBridgeFormatter.formatBridge` (Lentille/Core, gelé) — les 8 clés
/// `lentille.bridge.*` du contrat §3.2, résolues via `String(localized:
/// defaultValue:)` (extraction automatique du catalogue Xcode — même patron
/// que `ThemedConversationRow`, ex. `conversation.summary.location`).
/// Positionnel (`%@`/`%d`), pas nommé : la plateforme iOS n'a pas
/// d'interpolation `{name}` native comme le TS, donc chaque clé connaît
/// l'ORDRE de ses propres paramètres plutôt que leur nom.
nonisolated enum LentilleBridgeTranslator {
    static func translate(_ key: String, _ params: [String: String]) -> String {
        switch key {
        case "lentille.bridge.authorsOne":
            return String(format: authorsOneFormat, params["name"] ?? "")
        case "lentille.bridge.authorsTwo":
            return String(format: authorsTwoFormat, params["a"] ?? "", params["b"] ?? "")
        case "lentille.bridge.authorsMore":
            return String(format: authorsMoreFormat, params["a"] ?? "", params["b"] ?? "", params["count"] ?? "")
        case "lentille.bridge.messagesOne":
            return String(format: messagesOneFormat, params["count"] ?? "")
        case "lentille.bridge.messagesOther":
            return String(format: messagesOtherFormat, params["count"] ?? "")
        case "lentille.bridge.media.images":
            return String(format: mediaImagesFormat, params["count"] ?? "")
        case "lentille.bridge.media.audio":
            return String(format: mediaAudioFormat, params["count"] ?? "")
        case "lentille.bridge.media.files":
            return String(format: mediaFilesFormat, params["count"] ?? "")
        default:
            return key
        }
    }

    private static var authorsOneFormat: String {
        String(localized: "lentille.bridge.authorsOne", defaultValue: "%@", bundle: .main)
    }
    private static var authorsTwoFormat: String {
        String(localized: "lentille.bridge.authorsTwo", defaultValue: "%@ et %@", bundle: .main)
    }
    private static var authorsMoreFormat: String {
        String(localized: "lentille.bridge.authorsMore", defaultValue: "%@, %@ et %@ autres", bundle: .main)
    }
    private static var messagesOneFormat: String {
        String(localized: "lentille.bridge.messagesOne", defaultValue: "%@ message", bundle: .main)
    }
    private static var messagesOtherFormat: String {
        String(localized: "lentille.bridge.messagesOther", defaultValue: "%@ messages", bundle: .main)
    }
    private static var mediaImagesFormat: String {
        String(localized: "lentille.bridge.media.images", defaultValue: "%@ photo(s)", bundle: .main)
    }
    private static var mediaAudioFormat: String {
        String(localized: "lentille.bridge.media.audio", defaultValue: "%@ audio", bundle: .main)
    }
    private static var mediaFilesFormat: String {
        String(localized: "lentille.bridge.media.files", defaultValue: "%@ fichier(s)", bundle: .main)
    }
}
