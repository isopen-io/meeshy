import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Extracted from ConversationListView.swift

// MARK: - Section Header View
struct SectionHeaderView: View {
    let section: ConversationSection
    let count: Int
    let isExpanded: Bool
    var isDropTarget: Bool = false
    /// #8694 — le compte de non-lus que la section cache quand elle est
    /// repliée (`SectionFoldedUnread.count`, zéro dépliée).
    var foldedUnread: Int = 0
    let onToggle: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @State private var isTapped = false

    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        Button(action: {
            withAnimation(.spring(response: 0.25, dampingFraction: 0.6)) {
                isTapped = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.6)) {
                    isTapped = false
                }
            }
            onToggle()
        }) {
            HStack(spacing: MeeshySpacing.smPlus) {
                // Section icon with glow
                ZStack {
                    // Glow ring behind icon
                    Circle()
                        .fill(Color(hex: section.color).opacity(isExpanded ? 0.15 : 0))
                        .frame(width: MeeshyControlSize.large, height: MeeshyControlSize.large)
                        .blur(radius: 4)
                        .animation(.easeInOut(duration: 0.4), value: isExpanded)

                    Circle()
                        .fill(Color(hex: section.color).opacity(isDropTarget ? 0.5 : (isDark ? 0.25 : 0.18)))
                        .frame(width: MeeshyControlSize.compact, height: MeeshyControlSize.compact)
                        .scaleEffect(isDropTarget ? 1.15 : (isTapped ? 1.2 : 1.0))

                    Image(systemName: section.icon)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(Color(hex: section.color))
                        .scaleEffect(isTapped ? 1.15 : 1.0)
                }

                // Section name
                Text(section.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(isDropTarget ? Color(hex: section.color) : (isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950))

                // Count badge
                Text("\(count)")
                    .font(.caption.weight(.bold))
                    .foregroundColor(Color(hex: section.color))
                    .padding(.horizontal, MeeshySpacing.sm)
                    .padding(.vertical, MeeshySpacing.xxs)
                    .background(
                        Capsule()
                            .fill(Color(hex: section.color).opacity(isDropTarget ? 0.4 : (isDark ? 0.2 : 0.15)))
                    )
                    .scaleEffect(isTapped ? 1.1 : 1.0)

                Spacer()

                // Drop indicator when dragging over
                if isDropTarget {
                    Image(systemName: "plus.circle.fill")
                        .font(.title3.weight(.semibold))
                        .foregroundColor(Color(hex: section.color))
                        .transition(.scale.combined(with: .opacity))
                }

                // #8694 — repliée, la pastille de non-lus à côté du chevron.
                if UnreadCountBadge.isVisible(count: foldedUnread) {
                    UnreadCountBadge(count: foldedUnread, isDark: isDark)
                        .fixedSize()
                        .accessibilityHidden(true)
                }

                // Expand/collapse chevron with rotation animation
                Image(systemName: "chevron.forward")
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(Color(hex: section.color))
                    .opacity(isDropTarget ? 0.5 : 1)
                    .rotationEffect(.degrees(isExpanded ? 90 : 0))
                    .animation(.easeOut(duration: 0.2), value: isExpanded)
            }
            .padding(.vertical, MeeshySpacing.smPlus)
            .padding(.horizontal, MeeshySpacing.md)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(isDropTarget ? Color(hex: section.color).opacity(isDark ? 0.15 : 0.1) : (isExpanded ? Color(hex: section.color).opacity(MeeshyOpacity.faint) : Color.clear))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .stroke(
                                isDropTarget ? Color(hex: section.color).opacity(MeeshyOpacity.strong) : Color.clear,
                                lineWidth: 2
                            )
                            .animation(.easeInOut(duration: 0.3), value: isDropTarget)
                    )
            )
            .contentShape(Rectangle())
            .animation(.easeOut(duration: 0.2), value: isDropTarget)
            .animation(.easeOut(duration: 0.2), value: isExpanded)
        }
        .buttonStyle(PlainButtonStyle())
        .accessibilityValue(SectionFoldedUnread.accessibilityValue(isExpanded: isExpanded, foldedUnread: foldedUnread))
    }
}

// MARK: - Conversation Preview View (for hard press)
struct ConversationPreviewView: View {
    let conversation: Conversation
    var cachedMessages: [Message] = []
    /// L'aperçu VIVANT (#11212) : seule la section des messages l'observe, et
    /// passe de « chargement » à « messages » sans jamais dire « Aucun message »
    /// avant de l'avoir constaté. `nil` ⇒ `cachedMessages`, figés.
    var previewLoader: ConversationListPreviewLoader? = nil

    var bannerURL: URL? = nil
    var avatarURL: String? = nil
    var storyState: StoryRingState = .none
    var moodEmoji: String? = nil
    var presenceState: PresenceState? = nil
    var isDirect: Bool = false
    /// Le mode que le fil ouvrirait (#11213) : la face des derniers messages —
    /// rangées plates en Script et Focal, bulles en Bulles.
    var readingMode: ConversationReadingMode = .bubbles
    /// L'aperçu natif d'iOS 26 n'est pas interactif : ses boutons y seraient
    /// inertes. À `false`, l'en-tête ne garde que ce qui SE LIT — non-lus,
    /// chiffrement, sourdine.
    var isInteractive: Bool = true
    var onCall: (() -> Void)? = nil
    var onSearch: (() -> Void)? = nil
    var onInfo: (() -> Void)? = nil
    var onProfileInfo: (() -> Void)? = nil

    @Environment(\.colorScheme) private var colorScheme
    /// La largeur que la carte occupe vraiment : les bulles s'y mesurent.
    @State private var cardWidth: CGFloat = ConversationPreviewWidthLaw.maximum

    private var isDark: Bool { colorScheme == .dark }

    private var palette: ConversationColorPalette { conversation.displayPalette(isDark: isDark) }
    private var accentColor: String { palette.primary }
    private var secondaryColor: String { palette.secondary }

    /// Couleur du texte de l'en-tête du preview. Avec bannière, le voile sombre
    /// du `headerBackground` garantit la lisibilité du blanc. Sans bannière, le
    /// fond est pâle → texte sombre en Light (le blanc y serait illisible),
    /// blanc en Dark.
    private var headerContentColor: Color {
        if bannerURL != nil { return .white }
        return isDark ? .white : .black
    }

    var body: some View {
        VStack(spacing: 0) {
            header
                .padding(MeeshySpacing.mdPlus)
                .background(headerBackground)

            recentMessagesSection
            .frame(minHeight: 120, maxHeight: 300)
            .background(previewBackground)
        }
        // Largeur pilotée par le call site (overlay) — source de vérité unique.
        // La carte remplit la largeur proposée ; le conteneur la fixe à 340.
        .frame(maxWidth: .infinity)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width in
            guard width > 0 else { return }
            cardWidth = width
        }
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.xl))
        .overlay(
            RoundedRectangle(cornerRadius: MeeshyRadius.xl)
                .stroke(
                    LinearGradient(
                        colors: [Color(hex: accentColor).opacity(MeeshyOpacity.strong), Color(hex: secondaryColor).opacity(MeeshyOpacity.medium)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        )
        .shadow(color: Color(hex: accentColor).opacity(MeeshyOpacity.medium), radius: 20, y: 10)
    }

    // MARK: - Header (avatar, titre, indicateurs, actions)

    /// Bannière en fond, voile sombre pour la lisibilité (`headerBackground`).
    private var header: some View {
        HStack(alignment: .top, spacing: MeeshySpacing.md) {
            // Real avatar with story ring / mood / presence
            MeeshyAvatar(
                name: conversation.name,
                context: .conversationList,
                accentColor: accentColor,
                secondaryColor: secondaryColor,
                avatarURL: avatarURL,
                storyState: storyState,
                moodEmoji: moodEmoji,
                presenceState: presenceState,
                ring: isDirect ? conversation.participantRing : nil
            )

            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                // Titre pleine largeur — peut aller à la ligne (2 lignes).
                // displayName (customName prioritaire) : même convention
                // que la ligne de liste (ThemedConversationRow) — l'avatar
                // reste sur `name` (initiales/couleur du vrai nom).
                HStack(alignment: .top, spacing: MeeshySpacing.xsPlus) {
                    Text(conversation.displayName)
                        .font(.callout.weight(.bold))
                        .foregroundStyle(headerContentColor)
                        .shadow(color: .black.opacity(MeeshyOpacity.strong), radius: 3, y: 1)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)

                    if conversation.userState.isPinned {
                        Image(systemName: "pin.fill")
                            .font(.caption2)
                            .foregroundStyle(MeeshyColors.error)
                            .shadow(color: .black.opacity(MeeshyOpacity.strong), radius: 2, y: 1)
                    }

                    if conversation.userState.isMuted {
                        Image(systemName: "bell.slash.fill")
                            .font(.caption2)
                            .foregroundStyle(headerContentColor.opacity(MeeshyOpacity.heavy))
                            .shadow(color: .black.opacity(MeeshyOpacity.strong), radius: 2, y: 1)
                            .accessibilityLabel(Text(String(localized: "preview.muted.a11y", defaultValue: "Notifications désactivées", bundle: .main)))
                    }

                    Spacer(minLength: 0)
                }

                if conversation.type != .direct {
                    HStack(spacing: MeeshySpacing.xxs) {
                        Image(systemName: conversation.type == .group ? "person.2.fill" : "person.3.fill")
                            .font(.caption2)
                        Text(MembersCountLabel.text(conversation.memberCount,
                                                    capped: conversation.memberCountCapped))
                            .font(.caption2.weight(.medium))
                    }
                    .foregroundStyle(headerContentColor.opacity(MeeshyOpacity.intense))
                    .shadow(color: .black.opacity(MeeshyOpacity.strong), radius: 2, y: 1)
                }

                // Indicateurs puis boutons d'action SOUS le titre, alignés à
                // droite. Les boutons n'existent que si l'aperçu est
                // interactif : un contrôle sans effet n'est pas affiché.
                HStack(spacing: MeeshySpacing.sm) {
                    Spacer(minLength: 0)
                    headerIndicators
                    if ConversationPreviewRenderer.showsHeaderActions(isInteractive: isInteractive) {
                        foldingHeaderActions
                    }
                }
            }
        }
    }

    // MARK: - Recent messages (#11212, #11213)

    /// La zone des messages observe le chargeur (#11212) et se dessine dans le
    /// mode de lecture du fil (#11213) — `ConversationRecentMessagesPreview`.
    @ViewBuilder
    private var recentMessagesSection: some View {
        if let previewLoader {
            ConversationPreviewStateReader(loader: previewLoader, conversationId: conversation.id) { state in
                recentMessages(
                    state.messages,
                    translations: state.snapshot?.translations ?? [:],
                    served: state.snapshot?.served ?? [:],
                    phase: state.phase
                )
            }
        } else {
            recentMessages(cachedMessages, translations: [:], served: [:], phase: cachedMessages.isEmpty ? .empty : .loaded)
        }
    }

    private func recentMessages(
        _ messages: [Message],
        translations: [String: [MessageTranslation]],
        served: [String: MessageTranslation],
        phase: ConversationPreviewPhase
    ) -> some View {
        ConversationRecentMessagesPreview(
            messages: messages,
            translations: translations,
            served: served,
            phase: phase,
            readingMode: readingMode,
            accentColor: accentColor,
            skin: ConversationPreviewRenderer.skin(for: conversation, isDark: isDark),
            isDirect: isDirect,
            isDark: isDark,
            currentUserId: AuthManager.shared.currentUser?.id ?? "",
            cardWidth: cardWidth,
            backdrop: ConversationPreviewRenderer.backdrop(for: conversation, computedAccentHex: accentColor, isDark: isDark)
        )
    }

    // MARK: - Header background (banner + dark gradient)

    @ViewBuilder
    private var headerBackground: some View {
        if let bannerURL {
            ZStack {
                // Carte fixée à 340pt de large par le call site — inutile de
                // décoder la bannière au plafond plein format 1200 px.
                CachedAsyncImage(url: bannerURL.absoluteString, targetSize: CGSize(width: 340, height: 160)) {
                    LinearGradient(
                        colors: [
                            Color(hex: accentColor).opacity(0.6),
                            Color(hex: secondaryColor).opacity(0.4)
                        ],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                }
                .scaledToFill()
                .clipped()

                // Dark gradient (top → bottom) + light global veil for title legibility
                LinearGradient(
                    colors: [Color.black.opacity(0.0), Color.black.opacity(MeeshyOpacity.strong)],
                    startPoint: .top, endPoint: .bottom
                )
                Color.black.opacity(MeeshyOpacity.light)
            }
        } else {
            LinearGradient(
                    colors: [
                        Color(hex: accentColor).opacity(isDark ? 0.15 : 0.08),
                        Color(hex: accentColor).opacity(isDark ? 0.045 : 0.024)
                    ],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
                .overlay(
                    Rectangle()
                        .fill(
                            LinearGradient(
                                colors: [Color(hex: accentColor).opacity(MeeshyOpacity.subtle), Color.clear],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                )
        }
    }

    // MARK: - Header indicators (unread / E2EE)

    /// Ce qui SE LIT dans l'en-tête, interactif ou non : les non-lus et le
    /// chiffrement de bout en bout (la sourdine est posée près du titre).
    @ViewBuilder
    private var headerIndicators: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            if ConversationPreviewRenderer.isEndToEnd(conversation) {
                Image(systemName: "lock.fill")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(headerContentColor.opacity(MeeshyOpacity.heavy))
                    .shadow(color: .black.opacity(MeeshyOpacity.strong), radius: 2, y: 1)
                    .accessibilityLabel(Text(String(localized: "preview.e2ee.a11y", defaultValue: "Chiffrée de bout en bout", bundle: .main)))
            }

            if conversation.userState.unreadCount > 0 {
                Text(NotificationBadge.displayed(conversation.userState.unreadCount))
                    .font(.caption2.weight(NotificationBadge.fontWeight))
                    .foregroundColor(.white)
                    .padding(.horizontal, MeeshySpacing.xsPlus)
                    .frame(minWidth: 20, minHeight: 20)
                    .background(
                        Capsule().fill(
                            LinearGradient(
                                colors: [Color(hex: accentColor), Color(hex: secondaryColor)],
                                startPoint: .topLeading, endPoint: .bottomTrailing
                            )
                        )
                    )
                    .accessibilityLabel(Text(String(localized: "preview.unread.a11y", defaultValue: "\(conversation.userState.unreadCount) messages non lus", bundle: .main)))
            }
        }
    }

    // MARK: - Header action buttons (glass call / search / info)

    /// Trois cibles de 44 pt ne tiennent pas sous le titre dans le volet gauche
    /// étroit de l'iPad : la rangée se replie sur le cercle au lieu de déborder
    /// de la carte. Un membre à lui seul (#11411) : `ViewThatFits` mesure ses
    /// candidats sur le rendu asynchrone d'iOS 26, et posé au fil de `header`, il
    /// emportait dans sa mesure tout ce que l'en-tête construit avant lui.
    private var foldingHeaderActions: some View {
        ViewThatFits(in: .horizontal) {
            headerActions(targetSize: ConversationPreviewRenderer.headerTargetSize)
            headerActions(targetSize: ConversationPreviewRenderer.compactHeaderTargetSize)
        }
    }

    private func headerActions(targetSize: CGFloat) -> some View {
        HStack(spacing: 0) {
            if let onCall {
                headerGlassButton(icon: "phone.fill", label: String(localized: "context.call", defaultValue: "Appeler", bundle: .main), targetSize: targetSize, action: onCall)
            }

            headerGlassButton(icon: "magnifyingglass", label: String(localized: "context.search", defaultValue: "Rechercher", bundle: .main), targetSize: targetSize) { onSearch?() }

            if isDirect {
                Menu {
                    Button {
                        onInfo?()
                    } label: {
                        Label(String(localized: "conversation.info", defaultValue: "Infos conversation", bundle: .main), systemImage: "info.circle")
                    }
                    Button {
                        onProfileInfo?()
                    } label: {
                        Label(String(localized: "profile.title", defaultValue: "Profil", bundle: .main), systemImage: "person.crop.circle")
                    }
                } label: {
                    headerGlassButtonLabel(icon: "info.circle.fill", targetSize: targetSize)
                }
                .accessibilityLabel(Text(String(localized: "conversation.info", defaultValue: "Infos conversation", bundle: .main)))
            } else {
                headerGlassButton(icon: "info.circle.fill", label: String(localized: "conversation.info", defaultValue: "Infos conversation", bundle: .main), targetSize: targetSize) { onInfo?() }
            }
        }
    }

    private func headerGlassButton(icon: String, label: String, targetSize: CGFloat, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            headerGlassButtonLabel(icon: icon, targetSize: targetSize)
        }
        .buttonStyle(PlainButtonStyle())
        .accessibilityLabel(Text(label))
    }

    /// Le cercle de verre garde sa taille (32 pt) ; la cible, elle, fait au
    /// moins 44 pt (HIG) — le doigt n'a pas à viser le dessin. Repliée
    /// (`compactHeaderTargetSize`), elle garde 44 pt de haut.
    private func headerGlassButtonLabel(icon: String, targetSize: CGFloat) -> some View {
        Image(systemName: icon)
            .font(.footnote.weight(.semibold))
            .foregroundColor(.white)
            .frame(width: MeeshyControlSize.compact, height: MeeshyControlSize.compact)
            .adaptiveGlass(in: Circle(), tint: Color(hex: accentColor).opacity(MeeshyOpacity.medium))
            .frame(width: targetSize, height: ConversationPreviewRenderer.headerTargetSize)
            .contentShape(Rectangle())
    }

    private var previewBackground: some View {
        ZStack {
            LinearGradient(
                    colors: isDark
                        ? [MeeshyColors.surfaceDarkBase, MeeshyColors.surfaceDarkDeep, MeeshyColors.surfaceDarkRaised]
                        : [Color(hex: "FFFFFF"), MeeshyColors.surfaceLightMist, MeeshyColors.surfaceLightRaised],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )

            // Accent colored orbs (smaller for preview)
            Circle()
                .fill(Color(hex: accentColor).opacity(isDark ? 0.1 : 0.06))
                .frame(width: 200, height: 200)
                .blur(radius: 60)
                .offset(x: 80, y: -80)

            Circle()
                .fill(Color(hex: secondaryColor).opacity(isDark ? 0.08 : 0.05))
                .frame(width: 150, height: 150)
                .blur(radius: 50)
                .offset(x: -60, y: 100)
        }
    }
}

// MARK: - Themed Community Card
struct ThemedCommunityCard: View, Equatable {
    let community: Community
    var action: (() -> Void)? = nil
    @State private var isPressed = false
    @State private var displayColor: String

    init(community: Community, action: (() -> Void)? = nil) {
        self.community = community
        self.action = action
        _displayColor = State(initialValue: UserDefaults.standard.string(forKey: "community.color.\(community.id)") ?? community.color)
    }

    // Leaf-cell equality (CLAUDE.md "Leaf Views"): only the community data
    // drives the body — the `action` closure and transient `@State` do not.
    static func == (lhs: ThemedCommunityCard, rhs: ThemedCommunityCard) -> Bool {
        lhs.community == rhs.community
    }

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            // Banner image — full-bleed. Falls back to the community's
            // derived accent colour gradient when no banner is set.
            CachedBannerImage(
                urlString: community.banner,
                fallbackColor: displayColor,
                height: CommunityCardMetrics.height
            )

            // Dark overlay for text readability over any banner
            LinearGradient(
                colors: [.clear, .clear, Color.black.opacity(MeeshyOpacity.heavy)],
                startPoint: .top,
                endPoint: .bottom
            )

            // Le nom seul, sur deux lignes : à la moitié de la taille d'avant
            // (#10841) les compteurs ne tiennent plus ; ils restent dans le
            // libellé d'accessibilité.
            Text(community.name)
                .font(MeeshyFont.relative(CommunityCardMetrics.nameSize, weight: .bold))
                .foregroundColor(.white)
                .lineLimit(2)
                .minimumScaleFactor(0.85)
                .padding(CommunityCardMetrics.padding)
        }
        .frame(width: CommunityCardMetrics.width, height: CommunityCardMetrics.height)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
        .scaleEffect(isPressed ? 0.95 : 1)
        .contentShape(Rectangle())
        .onTapGesture {
            withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) {
                isPressed = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) {
                    isPressed = false
                }
                action?()
            }
            HapticFeedback.light()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(community.name), "
            + MembersCountLabel.text(community.memberCount) + ", "
            + "\(community.conversationCount) " + String(localized: "tab.conversations", defaultValue: "Conversations")
        )
        .accessibilityAddTraits(.isButton)
    }
}

// MARK: - Themed Filter Chip
struct ThemedFilterChip: View {
    let title: String
    let color: String
    let isSelected: Bool
    /// Rangée COMPACTE — celle qui vit sous le rail de stories (#4069). Elle
    /// cohabite avec le rail, elle ne le concurrence pas : sans cette
    /// réduction, deux bandes de même poids se disputeraient la tête de liste.
    var isCompact: Bool = false
    let action: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    private var horizontalPadding: CGFloat { isCompact ? 11 : 16 }
    private var verticalPadding: CGFloat { isCompact ? 5 : 9 }
    private var font: Font { isCompact ? .caption2.weight(.semibold) : .footnote.weight(.semibold) }

    /// **Mat et épais quand c'est POSÉ** (#4069).
    ///
    /// Le sélectionné portait un DÉGRADÉ et perdait son contour (`opacity: 0`).
    /// Un dégradé se lit comme une invite — il brille, il attire — là où un
    /// filtre actif doit se lire comme un état : posé, stable, retirable. Un
    /// aplat opaque et un trait plus large disent cela sans un mot, et se
    /// distinguent au premier coup d'œil de la chip simplement proposée.
    ///
    /// C'est ce qui rend la composition LISIBLE : avec plusieurs filtres à la
    /// fois, la question n'est plus « lequel est actif » mais « lesquels le
    /// sont », et il faut pouvoir répondre sans lire.
    private var borderWidth: CGFloat { isSelected ? 2.5 : 1 }

    var body: some View {
        Button(action: {
            HapticFeedback.light()
            action()
        }) {
            Text(title)
                .font(font)
                .foregroundColor(isSelected ? .white : Color(hex: color))
                .padding(.horizontal, horizontalPadding)
                .padding(.vertical, verticalPadding)
                .background(
                    Capsule()
                        .fill(
                            isSelected
                            ? AnyShapeStyle(Color(hex: color))
                            : AnyShapeStyle(Color(hex: color).opacity(colorScheme == .dark ? 0.4 : 0.3))
                        )
                        .overlay(
                            Capsule()
                                .stroke(
                                    Color(hex: color).opacity(isSelected ? 1 : 0.7),
                                    lineWidth: borderWidth
                                )
                        )
                )
        }
        // Plus d'agrandissement : la composition peut poser plusieurs chips à
        // la fois, et autant de voisines gonflées feraient sauter la rangée.
        // Le mat et l'épaisseur portent seuls l'état.
        .animation(.easeOut(duration: 0.2), value: isSelected)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityHint(ConversationFilterComposition.accessibilityHint(isSelected: isSelected))
    }
}

// MARK: - Tag Chip Component
struct TagChip: View {
    let tag: ConversationTag
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Text(tag.name)
            .font(.caption2.weight(.semibold))
            .foregroundColor(Color(hex: tag.color))
            .padding(.horizontal, MeeshySpacing.sm)
            .padding(.vertical, MeeshySpacing.xxs)
            .background(
                Capsule()
                    .fill(Color(hex: tag.color).opacity(colorScheme == .dark ? 0.25 : 0.18))
                    .overlay(
                        Capsule()
                            .stroke(Color(hex: tag.color).opacity(0.4), lineWidth: MeeshyBorder.hairline)
                    )
            )
    }
}

