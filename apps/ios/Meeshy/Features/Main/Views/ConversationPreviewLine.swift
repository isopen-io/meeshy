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
    /// Le clair que CET appareil tient du dernier message scellé (#12968).
    var readOnDevice: ConversationPreviewDeviceText? = nil

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
            now: now,
            readOnDevice: readOnDevice
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
        readOnDevice: ConversationPreviewDeviceText? = nil,
        strings: ConversationPreviewStrings = ConversationPreviewCatalog.strings(),
        receipts: EphemeralReceiptRecording = EphemeralReceiptLedger.shared,
        memory: any EndToEndRegimeMemoryProviding = EndToEndRegimeMemory.shared
    ) -> ConversationPreview {
        let input = ConversationPreviewInput(
            conversation: servedSource(of: conversation, memory: memory),
            viewerId: viewerId,
            language: strings.language.rawValue,
            preferredLanguages: preferredLanguages,
            now: now,
            receivedAt: receivedAt(of: conversation, now: now, receipts: receipts),
            readOnDevice: readOnDevice
        )
        return ConversationPreviewComposer.compose(input, strings: strings)
    }

    /// Le dernier message est-il arrivé EN CLAIR dans l'ère chiffrée de la
    /// conversation (`EndToEndPlaintextLaw`, #11380) ? La ligne le marque,
    /// comme le fil — sous le régime servi ET retenu sur l'appareil, qu'une
    /// ligne servie sans régime ne fait pas tomber.
    nonisolated static func isUnencrypted(
        _ conversation: Conversation,
        memory: any EndToEndRegimeMemoryProviding = EndToEndRegimeMemory.shared
    ) -> Bool {
        let remembered = memory.resolve(conversationId: conversation.id, served: EndToEndRegime(conversation: conversation))
        return EndToEndPlaintextLaw.lastMessageStanding(of: conversation, remembered: remembered).isUnencrypted
    }

    /// La conversation telle que le composeur la lit : un dernier message de
    /// l'ère chiffrée — arrivé en clair ou déchiffré sur l'appareil —
    /// n'emporte aucune traduction du serveur, qui ne le lit pas (#11380).
    nonisolated static func servedSource(
        of conversation: Conversation,
        memory: any EndToEndRegimeMemoryProviding = EndToEndRegimeMemory.shared
    ) -> Conversation {
        let regime = memory.resolve(conversationId: conversation.id, served: EndToEndRegime(conversation: conversation))
        guard regime.governs(createdAt: conversation.lastMessageAt) else { return conversation }
        var source = conversation
        source.lastMessageTranslations = nil
        return source
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
    static func spokenPreview(
        for conversation: Conversation, preferredLanguages: [String], now: Date,
        readOnDevice: ConversationPreviewDeviceText? = nil
    ) -> String? {
        let strings = ConversationPreviewCatalog.strings()
        let preview = Self.preview(
            for: conversation,
            viewerId: AuthManager.shared.currentUser?.id ?? "",
            preferredLanguages: preferredLanguages,
            now: now,
            readOnDevice: readOnDevice,
            strings: strings
        )
        guard preview.kind != .empty else { return nil }
        let spoken = spokenText(preview, strings: strings)
        guard isUnencrypted(conversation) else { return spoken }
        return "\(UnencryptedMessageCopy.notice), \(spoken)"
    }

    /// Sans la notation (#7871) : VoiceOver dit « un mot », jamais
    /// « astérisque astérisque un mot », comme `plainTextOf` sur le web.
    ///
    /// Les LIBELLÉS du composeur se disent en mots (#15760) : une horloge en
    /// durée, « 1920 × 1080 » en « 1920 sur 1080 », « 234 Ko » en « 234
    /// kilooctets ». Un texte d'utilisateur se dit tel qu'il est écrit.
    static func spokenText(
        _ preview: ConversationPreview, strings: ConversationPreviewStrings, locale: Locale = .current,
        dimensions: String = ConversationPreviewCatalog.spokenDimensionsTemplate
    ) -> String {
        let spoken = preview.segments.map { segment -> String in
            guard case .label(let text) = segment else { return MessageTextRenderer.plainText(segment.text) }
            return spokenLabel(text, locale: locale, dimensions: dimensions)
        }.joined(separator: ", ")
        guard let author = preview.author else { return spoken }
        return strings(.lineAuthor, ["author": author.label, "line": spoken])
    }

    private static func spokenLabel(_ text: String, locale: Locale, dimensions: String) -> String {
        if let seconds = clockSeconds(text) { return MediaFormat.duration(seconds, style: .spoken, locale: locale) }
        return spokenDimensions(text, template: dimensions)
            ?? spokenFileSize(text, locale: locale)
            ?? MessageTextRenderer.plainText(text)
    }

    /// Ce que l'œil lit, en texte : l'auteur puis les segments, séparés comme
    /// la ligne les sépare. `styledText` en est la mise en forme — même
    /// préfixe, même séparateur — ce qui permet de comparer le VU au DIT.
    static func seenText(_ preview: ConversationPreview, strings: ConversationPreviewStrings) -> String {
        let body = preview.segments.map { MessageTextRenderer.plainText($0.text) }.joined(separator: segmentSeparator)
        return authorPrefix(of: preview, strings: strings) + body
    }

    nonisolated static let segmentSeparator = " · "

    private static func authorPrefix(of preview: ConversationPreview, strings: ConversationPreviewStrings) -> String {
        preview.author.map { strings(.lineAuthor, ["author": $0.label, "line": ""]) } ?? ""
    }

    /// « 1920 × 1080 » — la forme exacte que rend le composeur (le × entre
    /// deux espaces insécables), et rien d'autre : « 1920x1080 » ou un libellé
    /// qui CONTIENT un produit n'est pas une dimension.
    nonisolated static func dimensions(_ text: String) -> (width: String, height: String)? {
        let parts = text.components(separatedBy: "\u{00A0}×\u{00A0}")
        guard parts.count == 2, parts.allSatisfy(isDigits) else { return nil }
        return (parts[0], parts[1])
    }

    /// `template` : « %1$@ sur %2$@ » — la clé `accessibility.preview.dimensions`.
    nonisolated static func spokenDimensions(_ text: String, template: String) -> String? {
        dimensions(text).map { String(format: template, $0.width, $0.height) }
    }

    /// Un poids tel que `ConversationPreviewStrings.fileSize` le rend — « 234 Ko »,
    /// « 1,4 Mo » en français, « 234 KB », « 1.4 MB » ailleurs — dit en mots par
    /// Foundation (« 234 kilooctets »), dans la langue de `locale`.
    nonisolated static func spokenFileSize(_ text: String, locale: Locale) -> String? {
        let parts = text.components(separatedBy: " ")
        guard parts.count == 2, let unit = Self.storageUnit(parts[1]), let value = weight(parts[0]) else { return nil }
        return Measurement(value: value, unit: unit).formatted(
            .measurement(
                width: .wide,
                usage: .asProvided,
                numberFormatStyle: FloatingPointFormatStyle<Double>.number.precision(.fractionLength(0...1))
            )
            .locale(locale)
        )
    }

    private nonisolated static func storageUnit(_ symbol: String) -> UnitInformationStorage? {
        switch symbol {
        case "o", "B": return .bytes
        case "Ko", "KB": return .kilobytes
        case "Mo", "MB": return .megabytes
        case "Go", "GB": return .gigabytes
        default: return nil
        }
    }

    /// `234`, `1,4`, `1.4` — une décimale au plus, comme le composeur.
    private nonisolated static func weight(_ text: String) -> Double? {
        let parts = text.split(omittingEmptySubsequences: false, whereSeparator: { $0 == "." || $0 == "," })
        guard (1...2).contains(parts.count), parts.allSatisfy({ isDigits(String($0)) }),
              parts.dropFirst().allSatisfy({ $0.count == 1 })
        else { return nil }
        return Double(parts.joined(separator: "."))
    }

    private nonisolated static func isDigits(_ text: String) -> Bool {
        !text.isEmpty && text.allSatisfy { $0.isASCII && $0.isNumber }
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
        HStack(spacing: MeeshySpacing.xsPlus) {
            // #9574, #9617 — l'aperçu d'une flamme à durée montre son texte,
            // et la liste n'annonce aucune capture : il reste dans la couche
            // sécurisée (annoncé OU noir, jamais en silence). Les autres
            // protections ne montrent qu'un libellé.
            //
            // #16975 — la ligne APPLIQUE l'effet du dernier message : voile,
            // fini FIGÉ, entrée jouée une fois à l'arrivée d'un nouveau message.
            effectBody(preview, at: now)
                .lineLimit(lineLimit)
                .captureShield(preview.icon == .ephemeral)
                .modifier(ConversationPreviewEntranceModifier(
                    messageId: conversation.lastMessageId,
                    entrance: preview.effect?.entrance
                ))
            if preview.offersJoin, let onJoin {
                Button(action: onJoin) {
                    Text(String(localized: "call.header.rejoin", defaultValue: "Rejoindre", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, MeeshySpacing.smPlus)
                        .padding(.vertical, MeeshySpacing.xs)
                        .background(Capsule().fill(MeeshyColors.success))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "call.header.rejoin.a11y", defaultValue: "Appel en cours, toucher pour rejoindre", bundle: .main))
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
        }
    }

    /// Le corps selon l'effet appliqué (#16975) : voilé, fini figé, ou nu.
    /// Aucun de ces rendus ne s'anime — seule l'entrée bouge, une fois.
    @ViewBuilder
    private func effectBody(_ preview: ConversationPreview, at now: Date) -> some View {
        switch ConversationPreviewFinishStyle(effect: preview.effect) {
        case .veiled:
            veiledText(preview)
        case .glow:
            styledText(preview, at: now)
                .shadow(color: accent.opacity(isDark ? 0.7 : 0.45), radius: 3)
        case .rainbow:
            styledText(preview, at: now, paintsBody: false)
                .foregroundStyle(ConversationPreviewFinishStyle.rainbowGradient(isDark: isDark))
        case .plain:
            styledText(preview, at: now)
        }
    }

    /// Un message flouté : le préfixe reste lisible, le reste se peint en
    /// substitut voilé (le serveur n'envoie jamais le texte). VoiceOver lit le
    /// libellé de la rangée (`spokenPreview`), inchangé.
    private func veiledText(_ preview: ConversationPreview) -> some View {
        HStack(spacing: 0) {
            leadText(preview)
                .font(font)
                .layoutPriority(1)
            Text(preview.segments.map(\.text).joined(separator: Self.segmentSeparator))
                .font(font)
                .foregroundColor(MeeshyColors.textSecondary(isDark: isDark))
                .redacted(reason: .placeholder)
                .blur(radius: 1.5)
                .accessibilityHidden(true)
        }
    }

    /// UN seul `Text` — auteur, glyphe et corps — pour que la troncature
    /// morde sur la fin du message, jamais sur une colonne d'auteur.
    /// `paintsBody: false` laisse le corps à l'encre de la vue (arc-en-ciel).
    private func styledText(_ preview: ConversationPreview, at now: Date, paintsBody: Bool = true) -> Text {
        let segments = segmentsText(preview.segments, at: now)
        let content = paintsBody ? segments.foregroundColor(toneColor(preview.tone)) : segments
        let styledBody = Self.isItalic(preview) ? content.italic() : content
        return (leadText(preview) + styledBody).font(font)
    }

    /// Auteur, marque « non chiffré », glyphe et flèche d'appel — tout ce qui
    /// précède le corps, et que le voile laisse lisible.
    private func leadText(_ preview: ConversationPreview) -> Text {
        let strings = ConversationPreviewCatalog.strings()
        let author = preview.author.map { author -> Text in
            Text(Self.authorPrefix(of: preview, strings: strings))
                .font(authorFont)
                .foregroundColor(authorColor(author))
        } ?? Text("")
        let unencrypted = Self.isUnencrypted(conversation)
            ? Text(Image(systemName: UnencryptedMessageCopy.symbol)) + Text(" ")
            : Text("")
        let direction = preview.direction.map { direction -> Text in
            Text(Image(systemName: direction == .outgoing ? "arrow.up.right" : "arrow.down.left"))
                .foregroundColor(toneColor(preview.tone)) + Text(" ")
        } ?? Text("")
        return author + unencrypted + glyphText(preview) + direction
    }

    /// L'icône de la ligne. `pulse` la peint à l'accent, appuyée ; `sparkle`
    /// ajoute ✨ à l'accent quand l'icône n'en est pas déjà une. Rien ne bat.
    private func glyphText(_ preview: ConversationPreview) -> Text {
        let finish = preview.effect?.finish
        let icon = Self.symbol(for: preview.icon).map { symbol -> Text in
            let image = Text(Image(systemName: symbol))
                .foregroundColor(finish == .pulse || finish == .sparkle ? accent : iconColor(preview))
            return (finish == .pulse ? image.fontWeight(.bold) : image) + Text(" ")
        } ?? Text("")
        guard finish == .sparkle, preview.icon != .effect, let sparkles = Self.symbol(for: .effect) else { return icon }
        return icon + Text(Image(systemName: sparkles)).foregroundColor(accent) + Text(" ")
    }

    /// Le corps de la ligne. Dans la dernière minute d'un éphémère, son
    /// décompte est rendu par le système, à la seconde, sans réveiller la vue.
    private func segmentsText(_ segments: [ConversationPreviewSegment], at now: Date) -> Text {
        segments.enumerated().reduce(Text("")) { text, entry in
            let separator = entry.offset == 0 ? Text("") : Text(Self.segmentSeparator)
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
        case .contact?: return "person.crop.circle"
        case .location?: return "mappin.and.ellipse"
        case .sticker?: return "face.smiling"
        case .attachments?: return "paperclip"
        case .effect?: return "sparkles"
        case .forward?: return "arrowshape.turn.up.right"
        case .viewOnce?: return MessageProtectionSymbols.viewOnce
        case .ephemeral?: return MessageProtectionSymbols.ephemeral
        case .expired?: return MessageProtectionSymbols.expired
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
