import Foundation

/// **La ligne d'aperçu d'une conversation** — miroir Swift de
/// `composeConversationPreview()` (`packages/shared/utils/conversation-preview.ts`,
/// #7546). Les deux composeurs jouent le MÊME fichier de cas
/// (`packages/shared/fixtures/conversation-preview-cases.json`) : ils ne
/// peuvent pas diverger sans qu'un test rougisse.
///
/// Fonction PURE — ni horloge, ni réseau, ni cache : `now` et la réception
/// arrivent par l'entrée, les libellés par `ConversationPreviewStrings`.
///
/// Priorité (la première qui s'applique gagne) : appel en cours, frappe, mon
/// brouillon, réaction plus récente que le dernier message, puis le dernier
/// message selon sa nature.
///
/// Deux lois s'y croisent :
///  - le PRISME : le texte d'un message sort de `PrismTranslationResolver`,
///    jamais d'une boucle réécrite, et le segment dit la langue servie ;
///  - la PROTECTION : un message expiré, à vue unique, flouté ou chiffré ne
///    rend ni son texte, ni sa traduction, ni le moindre détail de ses pièces
///    jointes. Préséance : expiré > vue unique > flou > chiffré > éphémère, et
///    un effet comportemental ne s'affiche que sur un message non protégé.
public enum ConversationPreviewComposer {

    public static func compose(_ input: ConversationPreviewInput, strings: ConversationPreviewStrings) -> ConversationPreview {
        if let call = input.activeCall { return activeCallLine(call, strings) }

        let typing = (input.typing ?? []).filter(hasText)
        if !typing.isEmpty { return typingLine(typing, strings) }

        if let draft = input.draft, hasText(draft) {
            return ConversationPreview(
                kind: .draft,
                tone: .accent,
                author: .draft(label: strings(.draft)),
                segments: [.text(trimmed(draft), language: nil)]
            )
        }

        let message = input.lastMessage
        if let reaction = input.lastReaction, message.map({ reaction.createdAt > $0.createdAt }) ?? true {
            return reactionLine(reaction, input, strings)
        }

        guard let message else {
            return ConversationPreview(kind: .empty, segments: [.label(strings(.conversationEmpty))])
        }
        return messageLine(message, input, strings)
    }

    /// La ligne mise à plat, pour VoiceOver et le fichier de cas commun :
    /// `Auteur : 🎤 Message vocal · 0:12`. Le séparateur d'auteur est celui de
    /// la langue (« Alice : » en français, « Alice: » ailleurs).
    public static func render(_ preview: ConversationPreview, strings: ConversationPreviewStrings) -> String {
        let glyph = preview.icon.map { "\($0.glyph) " } ?? ""
        let line = glyph + preview.segments.map(\.text).joined(separator: " · ")
        guard let author = preview.author else { return line }
        return strings(.lineAuthor, ["author": author.label, "line": line])
    }

    // MARK: - Priorités 1 à 4

    private static func activeCallLine(_ call: ConversationActiveCall, _ strings: ConversationPreviewStrings) -> ConversationPreview {
        let count = max(0, call.participantCount)
        let participants: [ConversationPreviewSegment] = count > 0
            ? [.label(strings(count == 1 ? .callParticipantsOne : .callParticipantsOther, ["count": String(count)]))]
            : []
        return ConversationPreview(
            kind: .activeCall,
            tone: .success,
            icon: call.kind == "video" ? .callVideo : .callAudio,
            segments: [.label(strings(.callActive))] + participants,
            offersJoin: true
        )
    }

    private static func typingLine(_ names: [String], _ strings: ConversationPreviewStrings) -> ConversationPreview {
        let text: String
        switch names.count {
        case 1: text = strings(.typingOne, ["name": names[0]])
        case 2: text = strings(.typingTwo, ["name": names[0], "other": names[1]])
        default: text = strings(.typingMany, ["count": String(names.count)])
        }
        return ConversationPreview(kind: .typing, tone: .accent, segments: [.label(text)])
    }

    private static func placeholderKey(forProtection protection: String) -> ConversationPreviewStringKey {
        switch protection {
        case "expired": return .protectionExpired
        case "view-once": return .protectionViewOnce
        case "encrypted": return .protectionEncrypted
        // `blurred` — et toute protection qu'un client ancien ne connaît pas
        // encore : retenue, jamais rendue en clair.
        default: return .protectionHidden
        }
    }

    /// L'extrait du message réagi : servi par le Prisme comme un contenu, ou
    /// remplacé par le placeholder de sa protection — le serveur l'a déjà
    /// retenu (`excerptProtection`), le composeur ne fait que le nommer.
    private static func reactionExcerpt(
        _ reaction: ConversationLastReaction, _ input: ConversationPreviewInput, _ strings: ConversationPreviewStrings
    ) -> String? {
        if let protection = reaction.excerptProtection, protection != "ephemeral" {
            return strings(placeholderKey(forProtection: protection))
        }
        guard let excerpt = reaction.excerpt, hasText(excerpt) else { return nil }
        let served = PrismTranslationResolver.resolve(
            originalLanguage: reaction.excerptOriginalLanguage,
            translations: reaction.excerptTranslations ?? [:],
            preferredLanguages: input.preferredLanguages
        )
        return trimmed(served?.text ?? excerpt)
    }

    private static func reactionLine(
        _ reaction: ConversationLastReaction, _ input: ConversationPreviewInput, _ strings: ConversationPreviewStrings
    ) -> ConversationPreview {
        let isReader = reaction.reactorUserId != nil && reaction.reactorUserId == input.viewerId
        let actor = hasText(reaction.reactorName) ? reaction.reactorName : strings(.authorUnknown)
        let excerpt = reactionExcerpt(reaction, input, strings)
        let key: ConversationPreviewStringKey = isReader
            ? (excerpt != nil ? .reactionSelf : .reactionSelfBare)
            : (excerpt != nil ? .reactionMember : .reactionMemberBare)
        let text = strings(key, ["actor": actor, "emoji": reaction.emoji, "excerpt": excerpt ?? ""])
        return ConversationPreview(kind: .reaction, segments: [.label(text)])
    }

    // MARK: - Priorité 5 : le dernier message

    static func isReader(_ message: ConversationPreviewMessage, viewerId: String) -> Bool {
        (message.senderUserId != nil && message.senderUserId == viewerId)
            || (message.senderId != nil && message.senderId == viewerId)
    }

    private static func authorOf(
        _ message: ConversationPreviewMessage, _ viewerId: String, _ strings: ConversationPreviewStrings
    ) -> ConversationPreviewAuthor {
        if isReader(message, viewerId: viewerId) { return .reader(label: strings(.authorSelf)) }
        let name = message.senderName.flatMap { hasText($0) ? $0 : nil } ?? strings(.authorUnknown)
        return .member(id: message.senderId ?? "", label: name)
    }

    private static func messageLine(
        _ message: ConversationPreviewMessage, _ input: ConversationPreviewInput, _ strings: ConversationPreviewStrings
    ) -> ConversationPreview {
        if let call = message.callSummary { return callLine(call, viewerId: input.viewerId, strings) }
        if message.messageType == "system" { return systemLine(message, input, strings) }

        let author = authorOf(message, input.viewerId, strings)
        let line = { (icon: ConversationPreviewIcon?, segments: [ConversationPreviewSegment]) in
            ConversationPreview(kind: .message, icon: icon, author: author, segments: segments)
        }

        switch ConversationPreviewProtection.guardOf(message, input) {
        case .expired:
            return line(.expired, [.label(strings(.protectionExpired))])
        case .viewOnce:
            let key: ConversationPreviewStringKey = message.viewOnceConsumed == true ? .protectionViewOnceOpened : .protectionViewOnce
            return line(.viewOnce, [.label(strings(key))])
        case .hidden:
            return line(.hidden, [.label(strings(.protectionHidden)), .label(strings(.protectionHiddenHint))])
        case .encrypted:
            return line(.encrypted, [.label(strings(.protectionEncrypted))])
        case .ephemeral(let expiresAt, let durationSeconds):
            let body = ConversationPreviewBody.of(message, input, strings)
            let countdown: [ConversationPreviewSegment]
            if let expiresAt {
                let remaining = expiresAt.timeIntervalSince(input.now) * 1000
                countdown = [.countdown(strings.remaining(milliseconds: remaining), expiresAt: expiresAt)]
            } else if let durationSeconds {
                countdown = [.label(strings.remaining(milliseconds: Double(durationSeconds) * 1000))]
            } else {
                countdown = []
            }
            return ConversationPreview(
                kind: .message, icon: .ephemeral, author: author,
                segments: countdown + body.labelled, liveUntil: expiresAt
            )
        case .none:
            let body = ConversationPreviewBody.of(message, input, strings)
            let effects = effectSegments(message.effectFlags, strings)
            let fallback: ConversationPreviewIcon? = !effects.isEmpty
                ? .effect
                : (message.isForwarded == true ? .forward : nil)
            return line(body.icon ?? fallback, body.segments + effects)
        }
    }

    private static let effectKeys: [(MessageEffectFlags, ConversationPreviewStringKey)] = [
        (.shake, .effectShake), (.zoom, .effectZoom), (.explode, .effectExplode),
        (.confetti, .effectConfetti), (.fireworks, .effectFireworks), (.waoo, .effectWaoo),
        (.glow, .effectGlow), (.pulse, .effectPulse), (.rainbow, .effectRainbow), (.sparkle, .effectSparkle),
    ]

    /// Les effets COMPORTEMENTAUX, dans l'ordre des bits — jamais le cycle de
    /// vie (éphémère, flou, vue unique), qui est une protection.
    private static func effectSegments(_ effectFlags: Int?, _ strings: ConversationPreviewStrings) -> [ConversationPreviewSegment] {
        let flags = MessageEffectFlags(rawValue: UInt32(truncatingIfNeeded: effectFlags ?? 0))
        let keys = effectKeys.filter { flags.contains($0.0) }.map { $0.1 }
        if keys.count == 1 { return [.label(strings(keys[0]))] }
        if keys.count > 1 { return [.label(strings(.effectCount, ["count": String(keys.count)]))] }
        return []
    }

    /// Un appel, localisé depuis sa synthèse — jamais depuis le texte stocké.
    /// La flèche vient de l'appelant : `initiatorId` est un `User.id`.
    private static func callLine(
        _ call: LastMessageCallSummary, viewerId: String, _ strings: ConversationPreviewStrings
    ) -> ConversationPreview {
        let outgoing = call.initiatorId == viewerId
        let icon: ConversationPreviewIcon = call.kind == "video" ? .callVideo : .callAudio
        let line = { (tone: ConversationPreviewTone, segments: [ConversationPreviewSegment]) in
            ConversationPreview(kind: .call, tone: tone, icon: icon, segments: segments,
                                direction: outgoing ? .outgoing : .incoming)
        }
        let named: ConversationPreviewStringKey = call.kind == "video" ? .callVideo : .callAudio
        switch call.outcome {
        case "ongoing":
            return line(.success, [.label(strings(.callActive))])
        case "missed":
            guard outgoing else { return line(.danger, [.label(strings(.callMissed))]) }
            return line(.default, [.label(strings(call.endedByInitiator ? .callCancelled : .callUnanswered))])
        case "rejected":
            return line(.default, [.label(strings(.callDeclined))])
        case "failed":
            return line(.default, [.label(strings(.callFailed))])
        default:
            let duration: [ConversationPreviewSegment] = call.durationSec > 0
                ? [.label(ConversationPreviewStrings.clock(seconds: Double(call.durationSec)))]
                : []
            return line(.default, [.label(strings(named))] + duration)
        }
    }

    /// Les clés d'événement système que ce composeur sait dire ; toute autre se
    /// rend en `system.generic`, jamais en texte brut.
    private static func systemKey(_ event: LastMessageSystemEvent) -> ConversationPreviewStringKey {
        switch event.key {
        case "system.member-joined": return .systemMemberJoined
        case "system.encryption-enabled":
            return event.params["mode"]?.rendered == "e2ee" ? .systemEncryptionE2EE : .systemEncryptionEnabled
        case "system.member-added": return .systemMemberAdded
        case "system.member-removed": return .systemMemberRemoved
        case "system.member-left": return .systemMemberLeft
        case "system.conversation-renamed": return .systemConversationRenamed
        case "system.conversation-image": return .systemConversationImage
        default: return .systemGeneric
        }
    }

    private static func systemLine(
        _ message: ConversationPreviewMessage, _ input: ConversationPreviewInput, _ strings: ConversationPreviewStrings
    ) -> ConversationPreview {
        guard let event = message.systemEvent else {
            let text = ConversationPreviewBody.servedText(message, input) ?? .label(strings(.systemGeneric))
            return ConversationPreview(kind: .system, tone: .system, segments: [text])
        }
        let someone = strings(.authorUnknown)
        let raw = event.params.mapValues(\.rendered)
        let params = ["actor": raw["name"] ?? someone, "target": someone].merging(raw) { _, given in given }
        return ConversationPreview(kind: .system, tone: .system, segments: [.label(strings(systemKey(event), params))])
    }

    // MARK: - Outils

    static func hasText(_ value: String) -> Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    static func trimmed(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
