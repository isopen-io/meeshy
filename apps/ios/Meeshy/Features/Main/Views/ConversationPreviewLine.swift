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
/// Un éphémère vivant se décompte LUI-MÊME (#7614), sans horloge par seconde :
/// la ligne ne se recompose qu'aux instants où son libellé change
/// (`ConversationPreviewCountdown` — une frontière de minute, puis l'échéance),
/// et le compte à la seconde de la dernière minute est rendu par le système
/// (`Text(timerInterval:)`). À l'échéance, la ligne bascule seule sur
/// « Message expiré » — et plus rien ne la réveille. Hors éphémère, aucune
/// horloge.
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
                line(compose(at: context.date), at: context.date)
            }
        } else {
            line(preview, at: now)
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
    ///
    /// `receipts` : la première réception de l'éphémère sur cet appareil, la
    /// MÊME que celle du fil (`MeeshyMessage.protection`). `message:new` ne
    /// porte pas d'échéance pour un éphémère (#7451) : sans elle, la ligne
    /// n'affichait que sa DURÉE (« 1 min »), figée, et ne basculait jamais.
    nonisolated static func preview(
        for conversation: Conversation,
        viewerId: String,
        preferredLanguages: [String],
        now: Date,
        strings: ConversationPreviewStrings = ConversationPreviewCatalog.strings(),
        receipts: EphemeralReceiptRecording = EphemeralReceiptLedger.shared
    ) -> ConversationPreview {
        let input = ConversationPreviewInput(
            conversation: conversation,
            viewerId: viewerId,
            language: strings.language.rawValue,
            preferredLanguages: preferredLanguages,
            now: now,
            receivedAt: receivedAt(of: conversation, now: now, receipts: receipts)
        )
        return ConversationPreviewComposer.compose(input, strings: strings)
    }

    /// La réception locale du dernier message quand c'est un éphémère REÇU —
    /// jamais le mien, dont l'horloge ne part qu'à la réception d'un autre
    /// (contrat #7451 point 6). La ligne ne tient pas l'id de l'auteur : elle
    /// tient le mot qui le désigne, tranché à la fusion (`ConversationListAuthor`).
    nonisolated static func receivedAt(
        of conversation: Conversation, now: Date, receipts: EphemeralReceiptRecording
    ) -> Date? {
        let nature = conversation.lastMessageNature
        let flags = MessageEffectFlags(rawValue: UInt32(truncatingIfNeeded: nature?.effectFlags ?? 0))
        let isEphemeral = (nature?.ephemeralDuration ?? 0) > 0
            || conversation.lastMessageExpiresAt != nil
            || flags.contains(.ephemeral)
        guard isEphemeral,
              let messageId = conversation.lastMessageId, !messageId.isEmpty,
              conversation.lastMessageSenderName != ConversationListAuthor.readerLabel
        else { return nil }
        return receipts.noteReception(of: messageId, at: now)
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

    /// Sans la notation (#7871) : VoiceOver dit « un mot », jamais
    /// « astérisque astérisque un mot », comme `plainTextOf` sur le web.
    static func spokenText(
        _ preview: ConversationPreview, strings: ConversationPreviewStrings, locale: Locale = .current
    ) -> String {
        let spoken = preview.segments.map { segment -> String in
            guard case .label(let text) = segment, let seconds = clockSeconds(text) else {
                return MessageTextRenderer.plainText(segment.text)
            }
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
    private func line(_ preview: ConversationPreview, at now: Date) -> some View {
        HStack(spacing: 6) {
            styledText(preview, at: now)
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
    private func styledText(_ preview: ConversationPreview, at now: Date) -> Text {
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
        let content = segmentsText(preview.segments, at: now)
            .foregroundColor(toneColor(preview.tone))
        let styledBody = Self.isItalic(preview) ? content.italic() : content
        return (author + glyph + direction + styledBody).font(font)
    }

    /// Le corps de la ligne. Dans la dernière minute d'un éphémère, son
    /// décompte est rendu par le système, à la seconde, sans réveiller la vue.
    private func segmentsText(_ segments: [ConversationPreviewSegment], at now: Date) -> Text {
        segments.enumerated().reduce(Text("")) { text, entry in
            let separator = entry.offset == 0 ? Text("") : Text(" · ")
            guard case .countdown(_, let deadline) = entry.element,
                  ConversationPreviewCountdown.showsSeconds(at: now, deadline: deadline)
            // Sans la notation (#7849) : `**gras**` se lit « gras » dans la
            // liste, comme sur le web (`plainTextOf`).
            else { return text + separator + Text(MessageTextRenderer.plainText(entry.element.text)) }
            return text + separator + Text(timerInterval: now...deadline, countsDown: true)
        }
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
        case .sticker?: return "face.smiling"
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

/// Les seuls instants où la ligne d'un éphémère change — une frontière de
/// minute, puis l'échéance (`ConversationPreviewCountdown`) — et plus rien
/// ensuite : une ligne expirée ne recompose plus. Chaque entrée est posée un
/// souffle APRÈS sa frontière, pour que la ligne recomposée lise le nouveau
/// libellé et non l'ancien.
nonisolated struct CountdownSchedule: TimelineSchedule {
    let until: Date

    func entries(from startDate: Date, mode: TimelineScheduleMode) -> AnyIterator<Date> {
        var next: Date? = startDate
        return AnyIterator {
            guard let current = next else { return nil }
            next = ConversationPreviewCountdown.nextChange(after: current, deadline: until)
                .map { $0.addingTimeInterval(0.05) }
            return current
        }
    }
}
