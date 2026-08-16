import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Lentille Conversation Row (contrat LWS-7, workshop I-065)
//
// Rang plat de la Lentille — MÊMES entrées que `ThemedConversationRow`
// (`Meeshy/Features/Main/Views/ThemedConversationRow.swift`, INTERDIT
// d'édition : c'est le modèle d'entrées et de `==` de ce fichier), rendu
// radicalement différent : AUCUNE carte (ni `backgroundSecondary`, ni
// gradient de chaleur, ni bordure — la focus card de LWS-8 est la seule
// carte de l'écran), rang plat `LentilleMetrics.Row.height` (64), avatar
// `LentilleMetrics.Avatar` (44, contexte `.conversationHeaderCollapsed`) +
// anneau accent propre, `Nom · heure`, ligne 2 dont la précédence
// (typing > brouillon > pont ✦ > préview) est **inchangée** par rapport au
// rang historique.
//
// Le rang ne porte AUCUN `@State` de langue : la résolution du texte passe
// exclusivement par `resolvedLastMessagePreview(preferredLanguages:)` (SDK,
// gelé) pour la préview, et par le même algorithme copié pour l'étage agent
// du pont (`LentilleBridgeLine.resolveAgentText`, voir ce fichier) — jamais
// un cache local de traduction.

struct LentilleConversationRow: View {
    let conversation: Conversation
    var community: MeeshyCommunity? = nil
    var availableWidth: CGFloat = 200
    var isDragging: Bool = false
    var presenceState: PresenceState = .offline
    var onViewStory: (() -> Void)? = nil
    var onViewProfile: (() -> Void)? = nil
    var onViewConversationInfo: (() -> Void)? = nil
    var onMoodBadgeTap: ((CGPoint) -> Void)? = nil
    var onCreateShareLink: (() -> Void)? = nil
    var onCommunityTap: (() -> Void)? = nil

    var isDark: Bool = false
    var storyRingState: StoryRingState = .none
    var moodStatus: StatusEntry? = nil
    var typingUsername: String? = nil
    /// iPad / macOS split-view : la ligne active est signalée par une fine
    /// barre latérale accent — JAMAIS un fond, ce serait une carte.
    var isSelected: Bool = false
    var draftSummary: DraftSummary? = nil
    var preferredContentLanguages: [String] = []

    private var accentColorHex: String { conversation.accentColor }
    private var accent: Color { Color(hex: accentColorHex) }
    private var textPrimary: Color { MeeshyColors.textPrimary(isDark: isDark) }
    private var textSecondary: Color { MeeshyColors.textSecondary(isDark: isDark) }
    private var textMuted: Color { MeeshyColors.textMuted(isDark: isDark) }

    // MARK: - Pont ✦ — précédence (contrat §LWS-7, §3.2)

    /// `unreadCount > 0 ∧ bridge != nil` — la SEULE condition d'apparition
    /// du pont. `static` et pure pour rester testable sans construire de vue
    /// (I-065, « tests minimaux embarqués »). `nonisolated` : la cible app
    /// compile sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, et
    /// `LentilleConversationRow` (une `View`) hérite ce défaut — sans cette
    /// sortie explicite, un XCTest `nonisolated` ne pourrait pas appeler
    /// cette loi pure sans `await` (même précédent que
    /// `ConversationListView.isSectionContentVisible`/`LentilleRailPolicy`).
    nonisolated static func showsBridge(unreadCount: Int, bridge: ConversationBridge?) -> Bool {
        unreadCount > 0 && bridge != nil
    }

    private var showsBridge: Bool {
        Self.showsBridge(unreadCount: conversation.userState.unreadCount, bridge: conversation.bridge)
    }

    /// Opacité du rang — sourdine ⇒ `LentilleMetrics.Muted.opacity` (jamais
    /// un littéral, contrat §4.3), composée avec le retour visuel de drag
    /// existant (`isDragging`, repris du rang historique). `nonisolated`
    /// pure pour rester testable sans vue (même raison que `showsBridge`).
    nonisolated static func rowOpacity(isMuted: Bool, isDragging: Bool) -> Double {
        (isMuted ? LentilleMetrics.Muted.opacity : 1.0) * (isDragging ? 0.8 : 1.0)
    }

    private var rowOpacity: Double {
        Self.rowOpacity(isMuted: conversation.userState.isMuted, isDragging: isDragging)
    }

    var body: some View {
        HStack(alignment: .center, spacing: MeeshySpacing.md) {
            avatarView

            VStack(alignment: .leading, spacing: 2) {
                headerLine
                line2
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, LentilleMetrics.Row.paddingHorizontal)
        .padding(.vertical, LentilleMetrics.Row.paddingVertical)
        .frame(height: LentilleMetrics.Row.height)
        .opacity(rowOpacity)
        .scaleEffect(isDragging ? 1.02 : 1.0)
        .animation(.easeOut(duration: 0.15), value: isDragging)
        .overlay(alignment: .leading) {
            if isSelected {
                RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                    .fill(accent)
                    .frame(width: 3)
                    .padding(.vertical, 6)
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityValue(conversation.userState.unreadCount > 0
            ? String(localized: "accessibility.unread_messages", bundle: .main)
            : "")
        .accessibilityHint(String(localized: "accessibility.opens_conversation", bundle: .main))
        .accessibilityAddTraits(.isButton)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    /// Réutilise le libellé VoiceOver du rang historique — même contenu
    /// annoncé des deux côtés du drapeau (workshop §7 : « même chose au
    /// premier coup d'œil »). `conversationAccessibilityLabel` est une
    /// propriété calculée PURE de `ThemedConversationRow` (déclarée sans
    /// `private` dans le fichier historique, précisément pour être
    /// consommée hors de ce fichier — voir son commentaire d'en-tête) ;
    /// construire une instance jetable pour la LIRE n'édite pas ce fichier
    /// interdit, ça le CONSOMME, exactement comme le reste du chantier
    /// consomme `Lentille/Core` gelé.
    private var accessibilityLabel: String {
        ThemedConversationRow(
            conversation: conversation,
            preferredContentLanguages: preferredContentLanguages
        ).conversationAccessibilityLabel
    }

    // MARK: - Avatar — 44 (`.conversationHeaderCollapsed`) + anneau accent

    private var avatarView: some View {
        ZStack {
            Circle()
                .strokeBorder(accent.opacity(LentilleMetrics.Avatar.ringOpacity), lineWidth: LentilleMetrics.Avatar.ringWidth)
                .frame(
                    width: LentilleMetrics.Avatar.size + LentilleMetrics.Avatar.ringWidth * 2,
                    height: LentilleMetrics.Avatar.size + LentilleMetrics.Avatar.ringWidth * 2
                )

            LentilleRowAvatar(
                conversation: conversation,
                presenceState: presenceState,
                storyRingState: storyRingState,
                moodStatus: moodStatus,
                onViewStory: onViewStory,
                onViewProfile: onViewProfile,
                onViewConversationInfo: onViewConversationInfo,
                onMoodBadgeTap: onMoodBadgeTap,
                onCreateShareLink: onCreateShareLink
            )
        }
    }

    // MARK: - `Nom · heure`

    private var headerLine: some View {
        HStack(spacing: MeeshySpacing.xs) {
            Text(conversation.displayName)
                .font(LentilleMetrics.Name.font)
                .foregroundColor(textPrimary)
                .lineLimit(1)
                .layoutPriority(1)

            // Sourdine — 🔕 après le nom (affordance manquante à l'audit,
            // contrat §4.3 « muted »). Annoncée par `accessibilityLabel`
            // ci-dessus (même clé que le rang historique) : décorative ici.
            if conversation.userState.isMuted {
                Text("🔕")
                    .font(MeeshyFont.relative(LentilleMetrics.Tags.emojiSize))
                    .accessibilityHidden(true)
            }

            // Favori — même émoji de classification que le rang historique
            // (`userState.reaction`), taille du token `Tags.emojiSize`.
            if let reaction = conversation.userState.reaction, !reaction.isEmpty {
                Text(reaction)
                    .font(MeeshyFont.relative(LentilleMetrics.Tags.emojiSize))
                    .accessibilityHidden(true)
            }

            tagPastilles

            Text("·")
                .font(LentilleMetrics.Time.font)
                .foregroundColor(textMuted)

            LentilleRowTimestamp(date: conversation.lastMessageAt)
                .font(LentilleMetrics.Time.font)
                .foregroundColor(Self.timestampColor(unreadCount: conversation.userState.unreadCount, accent: accent))
                .layoutPriority(1)

            Spacer(minLength: 0)

            if conversation.userState.hasPendingSync {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                    .foregroundColor(accent.opacity(0.7))
                    .accessibilityHidden(true)
            }
        }
    }

    /// Tags — « pastilles 6 (≤ 3) » (contrat §4.3), après le nom. Adaptation
    /// au rang plat du `tagsRow` historique (capsules de texte, en propre
    /// ligne) : ici de simples points colorés, inline, jamais une carte.
    private var tagPastilles: some View {
        HStack(spacing: 3) {
            ForEach(conversation.tags.prefix(LentilleMetrics.Tags.maxCount)) { tag in
                Circle()
                    .fill(Color(hex: tag.color))
                    .frame(width: LentilleMetrics.Tags.size, height: LentilleMetrics.Tags.size)
            }
        }
        .accessibilityHidden(true)
    }

    /// Reprend `ThemedConversationRow.timestampColor` (même règle : rouge
    /// sémantique si non-lu, sinon accent) — copiée, pas importée : la
    /// méthode source est `static` mais déclarée sur un type dont ce
    /// fichier n'a pas le droit d'édition, et une extension depuis ce
    /// fichier n'ajouterait rien qu'une redéclaration locale n'apporte déjà.
    /// `nonisolated` (`MeeshyColors` l'est déjà) : testable sans `await`.
    nonisolated static func timestampColor(unreadCount: Int, accent: Color) -> Color {
        unreadCount > 0 ? MeeshyColors.error : accent
    }

    // MARK: - Ligne 2 — précédence INCHANGÉE : typing > brouillon > pont > préview

    /// Décision PURE de la ligne 2 — séparée du rendu pour rester testable
    /// sans SwiftUI (I-065, « tests minimaux embarqués : précédence
    /// ligne 2 »). Complétée par I-068. `nonisolated` — même raison que
    /// `showsBridge` ci-dessus.
    nonisolated enum Line2Kind: Equatable {
        case typing, draft, bridge, preview

        nonisolated static func resolve(hasTyping: Bool, hasDraft: Bool, showsBridge: Bool) -> Line2Kind {
            if hasTyping { return .typing }
            if hasDraft { return .draft }
            if showsBridge { return .bridge }
            return .preview
        }
    }

    private var line2Kind: Line2Kind {
        Line2Kind.resolve(
            hasTyping: typingUsername != nil,
            hasDraft: draftSummary != nil,
            showsBridge: showsBridge
        )
    }

    @ViewBuilder
    private var line2: some View {
        switch line2Kind {
        case .typing:
            typingLine
        case .draft:
            if let draftSummary { draftLine(draftSummary) }
        case .bridge:
            if let bridge = conversation.bridge {
                LentilleBridgeLine(
                    bridge: bridge,
                    preferredLanguages: preferredContentLanguages,
                    accentColor: accentColorHex,
                    isDark: isDark
                )
            }
        case .preview:
            previewLine
        }
    }

    private var typingLine: some View {
        HStack(spacing: 5) {
            Text(typingUsername.map { name in
                String(format: String(localized: "typing.named", bundle: .main), name)
            } ?? String(localized: "typing.anonymous", bundle: .main))
                .font(LentilleMetrics.Line2.font)
                .italic()
                .foregroundColor(accent)
                .lineLimit(1)
            LentilleTypingDots(accentColorHex: accentColorHex)
        }
    }

    private func draftLine(_ draft: DraftSummary) -> some View {
        HStack(spacing: 4) {
            Text(draft.previewText.isEmpty
                ? String(localized: "draft.label", bundle: .main)
                : String(localized: "draft.label_prefix", bundle: .main))
                .font(LentilleMetrics.Line2.font)
                .foregroundColor(MeeshyColors.error)
            if !draft.previewText.isEmpty {
                Text(draft.previewText)
                    .font(LentilleMetrics.Line2.font)
                    .foregroundColor(textSecondary)
                    .lineLimit(1)
            }
        }
    }

    /// B1 (Prisme Linguistique), règle 3 — la préview TELLE QU'ELLE SERA
    /// RENDUE, résolue exclusivement par le SDK gelé. Aucun `@State` de
    /// langue ici (contrat §LWS-7, contrainte dure).
    private var resolvedPreviewText: String {
        conversation.resolvedLastMessagePreview(preferredLanguages: preferredContentLanguages) ?? ""
    }

    @ViewBuilder
    private var previewLine: some View {
        switch conversation.lastMessageSummaryKind() {
        case .expired:
            Text(String(localized: "message.expired"))
                .font(LentilleMetrics.Line2.font)
                .italic()
                .foregroundColor(textMuted)
                .lineLimit(1)

        case .hidden:
            HStack(spacing: 4) {
                senderLabel
                Text(String(localized: "conversation.summary.hidden"))
                    .font(LentilleMetrics.Line2.font)
                    .italic()
                    .foregroundColor(textSecondary)
                    .lineLimit(1)
            }

        case .viewOnce:
            HStack(spacing: 4) {
                senderLabel
                Text(String(localized: "conversation.summary.view_once"))
                    .font(LentilleMetrics.Line2.font)
                    .italic()
                    .foregroundColor(accent)
                    .lineLimit(1)
            }

        case .ephemeralActive, .standard:
            standardPreview
        }
    }

    @ViewBuilder
    private var standardPreview: some View {
        let hasText = !resolvedPreviewText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let attachments = conversation.lastMessageAttachments
        let totalCount = conversation.lastMessageAttachmentCount

        if hasText {
            HStack(spacing: 4) {
                senderLabel
                Text(resolvedPreviewText)
                    .font(LentilleMetrics.Line2.font)
                    .foregroundColor(textSecondary)
                    .lineLimit(1)
            }
        } else if let first = attachments.first {
            let display = AttachmentDisplay.make(for: first.mimeType)
            HStack(spacing: 4) {
                senderLabel
                Image(systemName: display.icon)
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                    .foregroundColor(display.tintColor)
                Text(display.shortLabel)
                    .font(LentilleMetrics.Line2.font)
                    .foregroundColor(textSecondary)
                    .lineLimit(1)
                if totalCount > 1 {
                    Text("+\(totalCount - 1)")
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                        .foregroundColor(accent)
                }
            }
        } else if let place = conversation.lastMessageLocation {
            HStack(spacing: 4) {
                senderLabel
                Image(systemName: "mappin.and.ellipse")
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                    .foregroundColor(accent)
                Text(place.name ?? String(localized: "conversation.summary.location", defaultValue: "Position"))
                    .font(LentilleMetrics.Line2.font)
                    .foregroundColor(textSecondary)
                    .lineLimit(1)
            }
        } else {
            Text("")
                .font(LentilleMetrics.Line2.font)
        }
    }

    private var senderLabel: some View {
        Group {
            if let name = conversation.lastMessageSenderName, !name.isEmpty {
                Text(name)
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                    .foregroundColor(accent)
                    .lineLimit(1)
                    .layoutPriority(1)
            }
        }
    }
}

// MARK: - Equatable — COPIÉ depuis `ThemedConversationRow.==` puis ÉTENDU au
// champ `bridge` (contrat §LWS-7 : « pas réécrit — sous-comparer, c'est
// geler une ligne ; sur-comparer, c'est perdre le portillon »).
//
// `renderFingerprint` (SDK, C-029) replie déjà `bridge` en ENTIER — kind,
// unreadCount, suggestedMode, isComplete, text, originalLanguage,
// translations (valeurs comprises), data (auteurs/+N/messageCount/médias) —
// exactement pour que ce portillon ne gèle jamais un pont ré-émis (E13,
// régression jumelle de B1). La comparaison directe de `bridge` ci-dessous
// est donc redondante avec `renderFingerprint` dans tous les cas atteints
// aujourd'hui ; elle reste écrite en toutes lettres parce que c'est
// EXACTEMENT ce que demande le contrat (« étendu au champ bridge », pas
// « laissé au hash »), et parce qu'un futur hash tronqué ou une collision
// ne doit jamais pouvoir geler le pont derrière ce portillon.
extension LentilleConversationRow: @MainActor Equatable {
    static func == (lhs: LentilleConversationRow, rhs: LentilleConversationRow) -> Bool {
        lhs.conversation.id == rhs.conversation.id &&
        lhs.conversation.renderFingerprint == rhs.conversation.renderFingerprint &&
        lhs.conversation.bridge == rhs.conversation.bridge &&
        lhs.typingUsername == rhs.typingUsername &&
        lhs.availableWidth == rhs.availableWidth &&
        lhs.isDragging == rhs.isDragging &&
        lhs.isDark == rhs.isDark &&
        lhs.storyRingState == rhs.storyRingState &&
        lhs.moodStatus?.id == rhs.moodStatus?.id &&
        lhs.presenceState == rhs.presenceState &&
        lhs.isSelected == rhs.isSelected &&
        lhs.draftSummary == rhs.draftSummary &&
        lhs.preferredContentLanguages == rhs.preferredContentLanguages
    }
}

// MARK: - Avatar du rang plat

/// Même stratégie de menu contextuel que `ConversationAvatarView`
/// (`ThemedConversationRow.swift`, privée à ce fichier interdit) :
/// `ConversationAvatarMenu`/`AvatarMenuRole` sont déclarés SANS modificateur
/// d'accès dans le fichier historique (donc `internal`, module-wide) —
/// réutilisés tels quels plutôt que redéclarés (Single Source of Truth).
/// Seule différence avec l'original : le contexte d'avatar,
/// `LentilleMetrics.Avatar.context` (44pt) au lieu de `.conversationList`
/// (52pt, réservé au rang historique, §0).
private struct LentilleRowAvatar: View {
    let conversation: Conversation
    let presenceState: PresenceState?
    let storyRingState: StoryRingState
    let moodStatus: StatusEntry?
    var onViewStory: (() -> Void)? = nil
    var onViewProfile: (() -> Void)? = nil
    var onViewConversationInfo: (() -> Void)? = nil
    var onMoodBadgeTap: ((CGPoint) -> Void)? = nil
    var onCreateShareLink: (() -> Void)? = nil

    private var isDirect: Bool { conversation.type == .direct }

    private var directContextMenuItems: [AvatarContextMenuItem] {
        ConversationAvatarMenu.directRoles().map(menuItem(for:))
    }

    private var groupContextMenuItems: [AvatarContextMenuItem] {
        let sharableTypes: [MeeshyConversation.ConversationType] = [.group, .public, .global, .broadcast]
        let canShare = sharableTypes.contains(conversation.type) && onCreateShareLink != nil
        return ConversationAvatarMenu.groupRoles(canShare: canShare).map(menuItem(for:))
    }

    private func menuItem(for role: AvatarMenuRole) -> AvatarContextMenuItem {
        switch role {
        case .conversationInfo:
            return AvatarContextMenuItem(
                label: String(localized: "conversation.info", defaultValue: "Infos conversation", bundle: .main),
                icon: "info.circle.fill"
            ) { onViewConversationInfo?() }
        case .profile:
            return AvatarContextMenuItem(
                label: String(localized: "Voir le profil", bundle: .main),
                icon: "person.circle.fill"
            ) { onViewProfile?() }
        case .shareLink:
            return AvatarContextMenuItem(
                label: String(localized: "menu.create_share_link", bundle: .main),
                icon: "link.badge.plus"
            ) { onCreateShareLink?() }
        }
    }

    var body: some View {
        MeeshyAvatar(
            name: conversation.name,
            context: LentilleMetrics.Avatar.context,
            accentColor: conversation.accentColor,
            secondaryColor: conversation.colorPalette.secondary,
            avatarURL: isDirect ? conversation.participantAvatarURL : conversation.avatar,
            storyState: storyRingState,
            moodEmoji: moodStatus?.moodEmoji,
            presenceState: (isDirect && moodStatus == nil) ? presenceState : nil,
            onTap: isDirect ? onViewProfile : onViewConversationInfo,
            onViewProfile: nil,
            onViewStory: (isDirect && storyRingState != .none) ? onViewStory : nil,
            onMoodTap: onMoodBadgeTap,
            contextMenuItems: isDirect ? directContextMenuItems : groupContextMenuItems
        )
    }
}

// MARK: - Horodatage relatif (ticker 60 s)

/// Même patron que `ThemedConversationRow.RelativeTimestampText` (privée à
/// ce fichier interdit) : `TimelineView(.periodic)` ticke le texte hors du
/// portillon `.equatable()` (qui n'a délibérément aucune composante
/// temporelle), sans quoi l'horodatage relatif gèlerait au montage.
private struct LentilleRowTimestamp: View {
    let date: Date

    var body: some View {
        TimelineView(.periodic(from: date, by: 60)) { _ in
            Text(RelativeTimeFormatter.shortString(for: date))
        }
    }
}

// MARK: - Indicateur de saisie

/// Même patron que `ThemedConversationRow.TypingDotsView` (privée à ce
/// fichier interdit), reproduit ici pour le rang plat — trois points
/// pulsés, désactivés par Reduce Motion (repos à la phase HAUTE, jamais
/// figés à mi-animation).
private struct LentilleTypingDots: View {
    let accentColorHex: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isAnimating = false

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(Color(hex: accentColorHex))
                    .frame(width: 5, height: 5)
                    .scaleEffect(reduceMotion ? 1.0 : (isAnimating ? 1.0 : 0.5))
                    .opacity(reduceMotion ? 1.0 : (isAnimating ? 1.0 : 0.4))
                    .animation(
                        reduceMotion
                            ? nil
                            : Animation.easeInOut(duration: 0.5)
                                .repeatForever(autoreverses: true)
                                .delay(Double(i) * 0.18),
                        value: isAnimating
                    )
            }
        }
        .onAppear { isAnimating = true }
        .onDisappear { isAnimating = false }
        .accessibilityHidden(true)
    }
}
