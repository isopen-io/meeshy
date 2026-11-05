import Foundation
import MeeshySDK

/// **« Texte du post »** (#13864, règle R2 ; #14457) : le texte d'un post ou
/// d'un réel vit HORS de la scène et se pose depuis une OPTION du rail, au pied
/// des outils (`ComposerRestTool.postText`), jamais depuis le `⋯` ni le socle :
/// une rangée de plus au socle réduisait la scène dès qu'on cochait Post.
/// Miroir d'Android `ComposerSceneTool.POST_TEXT`.
///
/// Un point discret dit qu'un texte est posé, VoiceOver en lit la première
/// ligne ; toucher l'option ouvre le champ, plafonné par
/// `ComposerPostTextPolicy` (`ComposerPostTextCap`).
nonisolated enum ComposerPostTextPill {

    static var label: String {
        String(localized: "composer.socle.postText", defaultValue: "Texte du post", bundle: .main)
    }

    /// Un texte est posé : l'option porte son point.
    static func isWritten(_ text: String) -> Bool {
        firstLine(of: text) != nil
    }

    /// Ce que VoiceOver lit après le nom de l'option : la première ligne écrite.
    static func spokenValue(_ text: String) -> String {
        firstLine(of: text) ?? ""
    }

    /// Le texte du post ne s'ouvre au montage que là où le clavier peut se lever
    /// à l'ouverture — jamais sur la scène (#16207) : le post et le réel
    /// s'ouvrent au repos, comme la story, et leur texte s'écrit depuis l'option
    /// de la colonne. Ni quand la photothèque s'ouvre d'office (#13839) : elle
    /// passe d'abord.
    static func opensOnAppear(opening: ComposerOpening, format: ComposerFormat, picksFirst: Bool = false) -> Bool {
        ComposerSurfaceRouting.raisesKeyboardOnOpen(opening: opening, format: format)
            && ComposerFormatVariant.of(format).writesPostText
            && !picksFirst
    }

    private static func firstLine(of text: String) -> String? {
        text.split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .first { !$0.isEmpty }
    }
}
