import SwiftUI
import MeeshySDK
import MeeshyUI

/// La ligne d'aperçu d'une rangée de conversation (#7548) — le RENDU de ce que
/// compose `ConversationPreviewComposer` (SDK), et rien d'autre.
///
/// Les deux rangées de la liste (`LentilleConversationRow`,
/// `ThemedConversationRow`) la montent : aucune ne décide plus quelle icône,
/// quel libellé, quel détail ni quelle protection dire. C'est ce qui garantit
/// que la ligne iOS lit comme la ligne web — le composeur rejoue le même
/// fichier de cas que `composeConversationPreview()`.
///
/// Un éphémère vivant se décompte LUI-MÊME : un `TimelineView` limité à cette
/// ligne recompose chaque seconde jusqu'à l'échéance, puis la ligne bascule
/// sur « expiré » sans attendre un événement — et l'horloge s'arrête là. Hors
/// éphémère, aucune horloge.
struct ConversationPreviewLine: View {
    let conversation: Conversation
    let preferredLanguages: [String]
    let accent: Color
    let isDark: Bool
    let font: Font
    var authorFont: Font = MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold)
    var lineLimit: Int = 1
    var onJoin: (() -> Void)? = nil

    var body: some View {
        let now = Date()
        let preview = compose(at: now)
        if let deadline = preview.liveUntil {
            TimelineView(CountdownSchedule(until: deadline)) { context in
                line(compose(at: context.date))
            }
        } else {
            line(preview)
        }
    }

    private func compose(at now: Date) -> ConversationPreview {
        Self.preview(
            for: conversation,
            viewerId: AuthManager.shared.currentUser?.id ?? "",
            preferredLanguages: preferredLanguages,
            now: now
        )
    }

    /// La valeur composée pour une rangée — pure, pour les témoins et pour le
    /// libellé VoiceOver, qui DOIT dire ce que l'œil lit.
    nonisolated static func preview(
        for conversation: Conversation,
        viewerId: String,
        preferredLanguages: [String],
        now: Date,
        strings: ConversationPreviewStrings = ConversationPreviewCatalog.strings()
    ) -> ConversationPreview {
        let input = ConversationPreviewInput(
            conversation: conversation,
            viewerId: viewerId,
            language: strings.language.rawValue,
            preferredLanguages: preferredLanguages,
            now: now
        )
        return ConversationPreviewComposer.compose(input, strings: strings)
    }

    /// Ce que VoiceOver dit de la ligne — la même valeur que l'œil lit, sans
    /// glyphe (l'icône se dit déjà par le libellé qu'elle précède). `nil` pour
    /// une conversation qui n'a rien à dire.
    static func spokenPreview(for conversation: Conversation, preferredLanguages: [String], now: Date) -> String? {
        let strings = ConversationPreviewCatalog.strings()
        let preview = Self.preview(
            for: conversation,
            viewerId: AuthManager.shared.currentUser?.id ?? "",
            preferredLanguages: preferredLanguages,
            now: now,
            strings: strings
        )
        guard preview.kind != .empty else { return nil }
        return spokenText(preview, strings: strings)
    }

    nonisolated static func spokenText(
        _ preview: ConversationPreview, strings: ConversationPreviewStrings, locale: Locale = .current
    ) -> String {
        let spoken = preview.segments.map { segment -> String in
            guard case .label(let text) = segment, let seconds = clockSeconds(text) else { return segment.text }
            return LocalizedNumber.spokenDuration(seconds: seconds, locale: locale)
        }.joined(separator: ", ")
        guard let author = preview.author else { return spoken }
        return strings(.lineAuthor, ["author": author.label, "line": spoken])
    }

    /// Les secondes d'une horloge `m:ss` / `h:mm:ss` — la forme exacte que rend
    /// `ConversationPreviewStrings.clock`, et rien d'autre : un libellé qui
    /// CONTIENT une heure (« Réunion à 10:30 ») n'est pas une durée.
    nonisolated static func clockSeconds(_ text: String) -> Int? {
        let parts = text.split(separator: ":", omittingEmptySubsequences: false)
        guard (2...3).contains(parts.count),
              parts.allSatisfy({ !$0.isEmpty && $0.allSatisfy(\.isASCII) && $0.allSatisfy(\.isNumber) }),
              parts.dropFirst().allSatisfy({ $0.count == 2 })
        else { return nil }
        return parts.compactMap { Int($0) }.reduce(0) { $0 * 60 + $1 }
    }

    // MARK: - Rendu

    @ViewBuilder
    private func line(_ preview: ConversationPreview) -> some View {
        HStack(spacing: 6) {
            styledText(preview)
                .lineLimit(lineLimit)
            if preview.offersJoin, let onJoin {
                Button(action: onJoin) {
                    Text(String(localized: "call.header.rejoin", defaultValue: "Rejoindre", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(MeeshyColors.success))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "call.header.rejoin.a11y", defaultValue: "Appel en cours, toucher pour rejoindre", bundle: .main))
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
        }
    }

    /// UN seul `Text` — auteur, glyphe et corps — pour que la troncature
    /// morde sur la fin du message, jamais sur une colonne d'auteur.
    private func styledText(_ preview: ConversationPreview) -> Text {
        let strings = ConversationPreviewCatalog.strings()
        let author = preview.author.map { author -> Text in
            let prefix = strings(.lineAuthor, ["author": author.label, "line": ""])
            return Text(prefix)
                .font(authorFont)
                .foregroundColor(authorColor(author))
        } ?? Text("")
        let glyph = Self.symbol(for: preview.icon).map { symbol -> Text in
            Text(Image(systemName: symbol)).foregroundColor(iconColor(preview)) + Text(" ")
        } ?? Text("")
        let direction = preview.direction.map { direction -> Text in
            Text(Image(systemName: direction == .outgoing ? "arrow.up.right" : "arrow.down.left"))
                .foregroundColor(toneColor(preview.tone)) + Text(" ")
        } ?? Text("")
        let content = Text(preview.segments.map(\.text).joined(separator: " · "))
            .foregroundColor(toneColor(preview.tone))
        let styledBody = Self.isItalic(preview) ? content.italic() : content
        return (author + glyph + direction + styledBody).font(font)
    }

    private func authorColor(_ author: ConversationPreviewAuthor) -> Color {
        if case .draft = author { return MeeshyColors.error }
        return accent
    }

    private func toneColor(_ tone: ConversationPreviewTone) -> Color {
        switch tone {
        case .default: return MeeshyColors.textSecondary(isDark: isDark)
        case .accent: return accent
        case .success: return MeeshyColors.success
        case .danger: return MeeshyColors.error
        case .system: return MeeshyColors.textMuted(isDark: isDark)
        }
    }

    private func iconColor(_ preview: ConversationPreview) -> Color {
        switch preview.icon {
        case .expired?: return MeeshyColors.textMuted(isDark: isDark)
        case .ephemeral?, .viewOnce?: return accent
        default: return preview.tone == .default ? accent : toneColor(preview.tone)
        }
    }

    /// Un placeholder de protection et un événement système se lisent en
    /// italique : ce n'est pas la voix d'un membre.
    nonisolated static func isItalic(_ preview: ConversationPreview) -> Bool {
        switch preview.icon {
        case .expired?, .viewOnce?, .hidden?, .encrypted?: return true
        default: return preview.kind == .system || preview.kind == .typing
        }
    }

    /// L'iconographie iOS de chaque icône du composeur — les protections
    /// reprennent `MessageProtectionSymbols`, le vocabulaire du reste de l'app.
    nonisolated static func symbol(for icon: ConversationPreviewIcon?) -> String? {
        switch icon {
        case .none: return nil
        case .callAudio?: return "phone.fill"
        case .callVideo?: return "video.fill"
        case .voice?: return "mic.fill"
        case .audio?: return "music.note"
        case .video?: return "film"
        case .photo?: return "photo"
        case .file?: return "doc"
        case .location?: return "mappin.and.ellipse"
        case .attachments?: return "paperclip"
        case .effect?: return "sparkles"
        case .forward?: return "arrowshape.turn.up.right"
        case .viewOnce?: return MessageProtectionSymbols.viewOnce
        case .ephemeral?: return MessageProtectionSymbols.ephemeral
        case .expired?: return "timer.badge.xmark"
        case .hidden?: return MessageProtectionSymbols.blurred
        case .encrypted?: return "lock.fill"
        }
    }
}

/// Une entrée par seconde jusqu'à l'échéance, la dernière POSÉE sur elle — puis
/// plus rien : une ligne expirée ne recompose plus.
nonisolated struct CountdownSchedule: TimelineSchedule {
    let until: Date

    func entries(from startDate: Date, mode: TimelineScheduleMode) -> AnyIterator<Date> {
        var next: Date? = startDate
        return AnyIterator {
            guard let current = next else { return nil }
            next = current >= until ? nil : min(current.addingTimeInterval(1), until)
            return current
        }
    }
}
