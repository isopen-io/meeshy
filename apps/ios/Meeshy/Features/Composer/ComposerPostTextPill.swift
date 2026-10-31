import SwiftUI
import MeeshySDK
import MeeshyUI

/// **« Texte du post »** (#13864, règle R2) : le texte d'un post ou d'un réel
/// vit HORS de la scène et se pose depuis le SOCLE, au-dessus de l'audience et
/// de « Publier », jamais depuis le `⋯`. Miroir d'Android `PostTextPill`.
///
/// La pastille dit ce qui est écrit — sa première ligne —, ou son nom tant que
/// rien ne l'est ; la toucher ouvre le champ, plafonné par
/// `ComposerPostTextPolicy` (`ComposerPostTextCap`).
nonisolated enum ComposerPostTextPill {

    static var label: String {
        String(localized: "composer.socle.postText", defaultValue: "Texte du post", bundle: .main)
    }

    static func shows(format: ComposerFormat, sceneMounted: Bool) -> Bool {
        sceneMounted && ComposerFormatVariant.of(format).writesPostText
    }

    static func isPlaceholder(_ text: String) -> Bool {
        firstLine(of: text) == nil
    }

    static func title(for text: String) -> String {
        firstLine(of: text) ?? label
    }

    /// La porte du fil promet qu'on écrit d'emblée : elle ouvre le texte du post
    /// une fois, clavier levé — jamais en story, où le texte se pose sur la scène,
    /// ni quand la photothèque s'ouvre d'office (#13839) : elle passe d'abord.
    static func opensOnAppear(opening: ComposerOpening, format: ComposerFormat, picksFirst: Bool = false) -> Bool {
        ComposerSurfaceRouting.focusesContentOnAppear(opening: opening)
            && ComposerFormatVariant.of(format).writesPostText
            && !picksFirst
    }

    private static func firstLine(of text: String) -> String? {
        text.split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .first { !$0.isEmpty }
    }
}

/// La pastille elle-même : pleine largeur, 44 pt, verre teinté du plateau
/// comme la pastille d'audience voisine.
struct ComposerPostTextPillView: View {
    let text: String
    let tint: Color
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: ComposerRailDoor.content.symbolName)
                    .accessibilityHidden(true)
                Text(ComposerPostTextPill.title(for: text))
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .opacity(ComposerPostTextPill.isPlaceholder(text) ? 0.7 : 1)
                Spacer(minLength: 0)
            }
            .font(.footnote.weight(.semibold))
            .foregroundColor(MeeshyColors.textPrimary(isDark: true))
            .padding(.horizontal, 14)
            .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.tapTarget)
            .contentShape(Capsule())
            .adaptiveLiquidGlass(in: Capsule(), tint: tint.opacity(0.55), interactive: true)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(ComposerPostTextPill.label))
        .accessibilityValue(Text(ComposerPostTextPill.isPlaceholder(text) ? "" : text))
        .accessibilityIdentifier("composer.socle.postText")
    }
}
