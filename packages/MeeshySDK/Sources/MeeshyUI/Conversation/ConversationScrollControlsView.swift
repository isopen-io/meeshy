import SwiftUI
import Combine
import MeeshySDK

public struct ConversationScrollControlsView: View {
    public var unreadCount: Int
    public var typingParticipants: [TypingParticipant]
    public var lastUnreadMessageContent: String?
    public var unreadAttachmentTypeLabel: String?
    public var unreadAttachmentThumbHash: String?
    public var unreadAttachmentThumbnailUrl: String?
    public var unreadAttachmentFullUrl: String?
    public var unreadAttachmentIsAudio: Bool
    /// Pre-formatted media detail of the last unread attachment, e.g.
    /// "0:34 · 410 KB" (audio), "1280×720 · 2.3 MB" (image/video). Built
    /// app-side so the SDK component stays agnostic of byte/duration
    /// formatting. `nil` when no detail is available.
    public var unreadAttachmentDetail: String?
    /// SF Symbol name for the last unread attachment's type (waveform, photo,
    /// video, doc, mappin…). Lets the preview show a type glyph when there is
    /// no thumbnail to render. `nil` for plain-text messages.
    public var unreadAttachmentSymbol: String?
    public var isAudioPlaying: Bool
    public var isOffline: Bool
    public var isSearchingQuotedMessage: Bool
    public var accentColor: String
    public var secondaryColor: String
    /// SF Symbol du dernier message non lu quand c'est une notice d'appel
    /// (téléphone / caméra). `nil` quand le dernier non-lu n'est pas un appel.
    public var unreadCallSymbol: String? = nil
    /// Teinte hex du glyphe d'appel (ex. "F87171"). Même convention que
    /// `accentColor`/`secondaryColor`. `nil` → pas de teinte spécifique.
    public var unreadCallTint: String? = nil

    public var onScrollToBottom: () -> Void
    public var onPlayAudio: () -> Void
    
    public init(
        unreadCount: Int,
        typingParticipants: [TypingParticipant],
        lastUnreadMessageContent: String?,
        unreadAttachmentTypeLabel: String?,
        unreadAttachmentThumbHash: String?,
        unreadAttachmentThumbnailUrl: String?,
        unreadAttachmentFullUrl: String?,
        unreadAttachmentIsAudio: Bool,
        unreadAttachmentDetail: String? = nil,
        unreadAttachmentSymbol: String? = nil,
        isAudioPlaying: Bool,
        isOffline: Bool,
        isSearchingQuotedMessage: Bool = false,
        accentColor: String,
        secondaryColor: String,
        unreadCallSymbol: String? = nil,
        unreadCallTint: String? = nil,
        onScrollToBottom: @escaping () -> Void,
        onPlayAudio: @escaping () -> Void
    ) {
        self.unreadCount = unreadCount
        self.typingParticipants = typingParticipants
        self.lastUnreadMessageContent = lastUnreadMessageContent
        self.unreadAttachmentTypeLabel = unreadAttachmentTypeLabel
        self.unreadAttachmentThumbHash = unreadAttachmentThumbHash
        self.unreadAttachmentThumbnailUrl = unreadAttachmentThumbnailUrl
        self.unreadAttachmentFullUrl = unreadAttachmentFullUrl
        self.unreadAttachmentIsAudio = unreadAttachmentIsAudio
        self.unreadAttachmentDetail = unreadAttachmentDetail
        self.unreadAttachmentSymbol = unreadAttachmentSymbol
        self.isAudioPlaying = isAudioPlaying
        self.isOffline = isOffline
        self.isSearchingQuotedMessage = isSearchingQuotedMessage
        self.accentColor = accentColor
        self.secondaryColor = secondaryColor
        self.unreadCallSymbol = unreadCallSymbol
        self.unreadCallTint = unreadCallTint
        self.onScrollToBottom = onScrollToBottom
        self.onPlayAudio = onPlayAudio
    }
    
    private var hasTypingIndicator: Bool {
        !typingParticipants.isEmpty
    }

    /// Noms seuls — `typingLabel(for:)` reste une fonction pure sur `[String]`.
    private var typingUsernames: [String] { typingParticipants.displayNames }

    /// Visages montrés dans la pile, dédupliqués par identité et bornés à trois :
    /// au-delà la pile déborderait la largeur utile du bouton (260 pt), et le
    /// libellé dit déjà « +N ».
    private var typingFaces: [TypingParticipant] {
        var seen = Set<String>()
        return typingParticipants.filter { seen.insert($0.id).inserted }.prefix(3).map { $0 }
    }
    
    private var hasUnreadContent: Bool {
        unreadCount > 0 || hasTypingIndicator
    }
    
    private var typingLabel: String {
        Self.typingLabel(for: typingUsernames)
    }

    /// Libellé de frappe du bouton de retour au bas : auteur(s) seul(s),
    /// SANS suffixe « écrit »/« écrivent » — l'animation de points indique
    /// déjà la frappe. Les noms sont dédupliqués (en préservant l'ordre) pour
    /// qu'un même auteur n'apparaisse jamais deux fois, et la liste est
    /// compactée pour tenir dans la largeur réduite du composant.
    public nonisolated static func typingLabel(for usernames: [String]) -> String {
        var seen = Set<String>()
        let unique = usernames.filter { seen.insert($0).inserted }
        switch unique.count {
        case 0: return ""
        case 1: return unique[0]
        case 2: return "\(unique[0]), \(unique[1])"
        default: return "\(unique[0]) +\(unique.count - 1)"
        }
    }
    
    @State private var searchPulse: Bool = false
    /// Phase d'animation des points "typing" (0 -> 1 -> 2), possedee par la vue.
    /// L'indicateur n'a de sens qu'ici : son timer 0.5s vit dans la feuille qui
    /// l'affiche, au lieu de remonter dans ConversationView (qui re-evaluait
    /// alors tout l'ecran 2x/s pendant la frappe). Pattern WWDC "isoler l'etat
    /// d'animation dans la sous-vue" ; le garde sur hasTypingIndicator evite tout
    /// tick utile quand personne ne tape.
    @State private var typingDotPhase: Int = 0
    // `@State` (not `let`) — a plain stored `let` re-evaluates its initializer
    // every time ConversationView reconstructs this leaf view (any unrelated
    // body re-evaluation — the very churn this view was pulled out to avoid,
    // see comment above), handing `.onReceive` a brand-new, not-yet-ticked
    // Timer.publish().autoconnect() each time. If reconstructions happen
    // faster than the 0.5s interval, the publisher never survives long enough
    // to fire and the typing-dot animation freezes. `@State`'s initial-value
    // expression runs once per view identity, preserving the same connected
    // publisher instance across re-renders.
    @State private var typingDotTimer = Timer.publish(every: 0.5, on: .main, in: .common).autoconnect()

    /// Couleur de contenu lisible sur la teinte glass. L'accent est déterministe
    /// par conversation et peut tomber sur une couleur claire (jaune/cyan/vert) —
    /// un contenu blanc y serait illisible (WCAG < 3:1). On choisit blanc ou sombre
    /// selon la luminance WCAG de l'accent (seuil 0.6, convention repo). Offline :
    /// la teinte neutral500 est sombre, le blanc reste lisible.
    private var contentColor: Color {
        isOffline ? .white : (Color(hex: accentColor).luminance > 0.6 ? .black : .white)
    }

    /// Repos = cercle parfait ; contenu riche/hors-ligne/recherche = capsule
    /// ovale. Extrait en fonction pure testable (même pattern que
    /// `shouldShowAttachmentPreview` plus bas) car XCTest ne peut pas
    /// introspecter la `Shape` passée à un modificateur SwiftUI — seule la
    /// DÉCISION est vérifiable, pas le rendu.
    nonisolated static func isCompactShape(hasUnreadContent: Bool, isOffline: Bool, isSearchingQuotedMessage: Bool) -> Bool {
        hasUnreadContent || isOffline || isSearchingQuotedMessage
    }

    public var body: some View {
        if Self.isCompactShape(hasUnreadContent: hasUnreadContent, isOffline: isOffline, isSearchingQuotedMessage: isSearchingQuotedMessage) {
            pill(shape: Capsule())
        } else {
            pill(shape: Circle())
        }
    }

    /// `Circle()` et `Capsule()` sont deux `Shape` distincts : `adaptiveGlass(in:)`
    /// est générique sur `S: Shape`, donc `isCompact ? Circle() : Capsule()` ne
    /// compile pas (branches de types incompatibles). Le branchement vit donc
    /// au niveau de `body` (deux appels concrets à cette même fonction
    /// générique) plutôt qu'un ternaire ici — c'est un cross-fade à l'identité
    /// de vue au changement d'état, pas un morph de rayon animé (AnyShape
    /// exclu : plancher iOS 16 ; décision spec).
    private func pill<S: Shape>(shape: S) -> some View {
        Button {
            onScrollToBottom()
        } label: {
            Group {
                if isSearchingQuotedMessage {
                    // Pulsing search indicator while loading quoted message
                    quotedMessageSearchContent
                } else if hasUnreadContent {
                    // Rich button with preview
                    unreadPreviewContent
                } else if isOffline {
                    // Offline indicator when no unread/typing
                    HStack(spacing: 8) {
                        Image(systemName: "wifi.slash")
                            .font(.system(size: 13, weight: .bold))
                        Text(String(localized: "conversation.offline", defaultValue: "Hors ligne", bundle: .module))
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundColor(contentColor)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                } else {
                    // Chevron-only pill au repos : frame CARRÉE explicite avant
                    // .adaptiveGlass(in: Circle()) — sans elle le disque peint
                    // (inscrit dans les bounds ~37×32 laissées par padding(12))
                    // est plus étroit que le glyphe et déborde horizontalement.
                    // 44×44 atteint au passage la cible tactile HIG.
                    Image(systemName: "chevron.down")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(contentColor)
                        .frame(width: 44, height: 44)
                }
            }
            // Liquid Glass iOS 26 (fallback material teinté < 26). Teinte accent
            // FORTE pour préserver le contraste du contenu blanc (badge non-lus,
            // aperçu pièce jointe) — toutes les infos restent visibles.
            .adaptiveGlass(
                in: shape,
                tint: isOffline ? MeeshyColors.neutral500.opacity(0.9) : Color(hex: accentColor).opacity(0.85)
            )
        }
        .allowsHitTesting(!isSearchingQuotedMessage)
        .onReceive(typingDotTimer) { _ in
            guard hasTypingIndicator else { return }
            typingDotPhase = (typingDotPhase + 1) % 3
        }
    }

    // MARK: - Quoted Message Search Indicator

    private var quotedMessageSearchContent: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14, weight: .bold))
                .scaleEffect(searchPulse ? 1.15 : 0.85)
                .opacity(searchPulse ? 1.0 : 0.6)

            Text(String(localized: "conversation.searching", defaultValue: "Recherche…", bundle: .module))
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(1)

            Spacer(minLength: 0)

            // Animated dots to show activity
            HStack(spacing: 3) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(Color.white.opacity(searchPulse ? 1.0 : 0.4))
                        .frame(width: 4, height: 4)
                        .scaleEffect(searchPulse ? 1.2 : 0.7)
                        .animation(
                            .easeInOut(duration: 0.6)
                                .repeatForever(autoreverses: true)
                                .delay(Double(i) * 0.15),
                            value: searchPulse
                        )
                }
            }
        }
        .foregroundColor(contentColor)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: 180)
        .onAppear { searchPulse = true }
        .onDisappear { searchPulse = false }
        .animation(
            .easeInOut(duration: 0.8).repeatForever(autoreverses: true),
            value: searchPulse
        )
    }
    
    /// Whether the last unread message carries a renderable attachment preview
    /// (audio control, image/video thumbnail, a type glyph, or a call notice).
    private var hasAttachmentPreview: Bool {
        Self.hasAttachmentPreview(
            unreadAttachmentIsAudio: unreadAttachmentIsAudio,
            unreadAttachmentThumbHash: unreadAttachmentThumbHash,
            unreadAttachmentThumbnailUrl: unreadAttachmentThumbnailUrl,
            unreadAttachmentFullUrl: unreadAttachmentFullUrl,
            unreadAttachmentSymbol: unreadAttachmentSymbol,
            unreadCallSymbol: unreadCallSymbol
        )
    }

    /// Extracted `nonisolated static` so it's unit-testable without a full view
    /// instance — same pattern as `shouldShowAttachmentPreview` below.
    nonisolated static func hasAttachmentPreview(
        unreadAttachmentIsAudio: Bool,
        unreadAttachmentThumbHash: String?,
        unreadAttachmentThumbnailUrl: String?,
        unreadAttachmentFullUrl: String?,
        unreadAttachmentSymbol: String?,
        unreadCallSymbol: String?
    ) -> Bool {
        unreadAttachmentIsAudio
            || unreadAttachmentThumbHash != nil
            || unreadAttachmentThumbnailUrl != nil
            || unreadAttachmentFullUrl != nil
            || unreadAttachmentSymbol != nil
            || unreadCallSymbol != nil
    }

    /// Whether the rich attachment preview should appear on the scroll-to-bottom
    /// pill. Gated on `unreadCount > 0` exactly like the text preview line: the
    /// attachment inputs come from `lastUnreadMessage`, which is only cleared on
    /// an explicit tap — so once the conversation is read (count 0) a mere typing
    /// indicator would otherwise keep surfacing the already-read last message's
    /// attachment preview (stale, inaccurate).
    nonisolated static func shouldShowAttachmentPreview(unreadCount: Int, hasAttachmentPreview: Bool) -> Bool {
        unreadCount > 0 && hasAttachmentPreview
    }

    /// Unified rich preview used for BOTH single and multiple unreads. Shows
    /// the count headline when more than one message is pending, followed by a
    /// preview of the LAST received message — its text, or for media its type
    /// label plus formatted detail (size / duration). Mirrors the product
    /// requirement: "le nombre de messages ET à la suite le dernier message".
    private var unreadPreviewContent: some View {
        HStack(spacing: 10) {
            // Left: rich attachment preview (audio play / image|video thumbnail
            // / type glyph) of the last unread message.
            if Self.shouldShowAttachmentPreview(unreadCount: unreadCount, hasAttachmentPreview: hasAttachmentPreview) {
                unreadAttachmentPreview
            }

            VStack(alignment: .leading, spacing: 2) {
                // Typing indicator (top priority — someone is composing now).
                if hasTypingIndicator {
                    // Les visages des frappeurs, points animés PAR-DESSUS, sur
                    // LEUR propre ligne — et non dans le slot de gauche : celui-ci
                    // appartient à l'aperçu du dernier message (miniature
                    // image/vidéo, bouton audio, glyphe de type, notice d'appel).
                    // Y loger les visages faisait disparaître la miniature pendant
                    // toute la durée d'une frappe, alors que les deux
                    // informations sont vraies en même temps.
                    HStack(spacing: 6) {
                        typingAvatarStack
                        Text(typingLabel)
                            .font(.system(size: 11, weight: .semibold))
                            .lineLimit(1)
                    }
                }

                // Count headline — only when more than one message is pending.
                if unreadCount > 1 {
                    Text(String(localized: "conversation.unread_messages", defaultValue: "\(unreadCount) messages", bundle: .module))
                        .font(.system(size: 13, weight: .heavy))
                        .lineLimit(1)
                }

                // Last received message preview (skipped when only typing).
                if unreadCount > 0 {
                    lastMessageLine
                }
            }

            Spacer(minLength: 0)

            // Right: chevron / offline glyph.
            if isOffline {
                Image(systemName: "wifi.slash")
                    .font(.system(size: 11, weight: .bold))
            } else {
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .bold))
            }
        }
        .foregroundColor(contentColor)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: 260)
    }

    /// Single-line preview of the last received message: its text when present,
    /// otherwise the attachment type label with its formatted media detail
    /// (e.g. "Audio · 0:34 · 410 KB", "Photo · 1280×720 · 2.3 MB").
    @ViewBuilder
    private var lastMessageLine: some View {
        if let content = lastUnreadMessageContent, !content.isEmpty {
            Text(content)
                .font(.system(size: 12, weight: .regular))
                .lineLimit(1)
                .opacity(0.95)
        } else if let label = unreadAttachmentTypeLabel {
            HStack(spacing: 4) {
                if let symbol = unreadAttachmentSymbol {
                    Image(systemName: symbol)
                        .font(.system(size: 10, weight: .semibold))
                }
                Text(attachmentSummary(label: label))
                    .font(.system(size: 12, weight: .regular))
                    .lineLimit(1)
                    .opacity(0.95)
            }
        }
    }

    /// Joins the attachment type label with its formatted detail when present.
    private func attachmentSummary(label: String) -> String {
        guard let detail = unreadAttachmentDetail, !detail.isEmpty else { return label }
        return "\(label) · \(detail)"
    }

    @ViewBuilder
    private var unreadAttachmentPreview: some View {
        if unreadAttachmentIsAudio {
            Image(systemName: isAudioPlaying ? "pause.fill" : "play.fill")
                .font(.system(size: 14, weight: .bold))
                .frame(width: 36, height: 36)
                .background(Circle().fill(Color.white.opacity(isAudioPlaying ? 0.4 : 0.25)))
                .contentShape(Circle())
                .highPriorityGesture(
                    TapGesture().onEnded {
                        onPlayAudio()
                    }
                )
        } else if unreadAttachmentThumbHash != nil || unreadAttachmentThumbnailUrl != nil || unreadAttachmentFullUrl != nil {
            ProgressiveCachedImage(
                thumbHash: unreadAttachmentThumbHash,
                thumbnailUrl: unreadAttachmentThumbnailUrl,
                fullUrl: unreadAttachmentFullUrl ?? unreadAttachmentThumbnailUrl
            ) {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.white.opacity(0.2))
                    .frame(width: 36, height: 36)
                    .overlay(
                        Image(systemName: unreadAttachmentTypeLabel == "Video" ? "video.fill" : "photo.fill")
                            .font(.system(size: 14))
                            .foregroundColor(.white.opacity(0.6))
                    )
            }
            .aspectRatio(contentMode: .fill)
            .frame(width: 36, height: 36)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        } else if let symbol = unreadAttachmentSymbol {
            // Media without a thumbnail (file, location, thumbnail-less video):
            // render the type glyph so the preview still reads as media.
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 36, height: 36)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.2)))
        } else if let callSymbol = unreadCallSymbol {
            // Notice d'appel (en cours/manqué/rejeté/annulé/échoué) : même
            // gabarit que le glyphe générique ci-dessus, mais teinté par
            // `unreadCallTint` (hex fourni app-side) plutôt que du blanc fixe —
            // `nil` (ex. appel en cours, pastille déjà teintée accent) retombe
            // sur `contentColor` pour rester lisible.
            Image(systemName: callSymbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(unreadCallTint.map { Color(hex: $0) } ?? contentColor)
                .frame(width: 36, height: 36)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.2)))
        } else {
            EmptyView()
        }
    }
    
    /// Les visages de ceux qui écrivent, avec les trois points animés
    /// PAR-DESSUS.
    ///
    /// Les avatars se chevauchent (décalage 14 pt pour un cercle de 28) comme
    /// une pile de participants, le plus récent derrière — l'ordre du roster est
    /// celui de première apparition, donc le premier frappeur reste en tête et
    /// la pile ne se réordonne pas à chaque frappe. Les points sont posés en
    /// `overlay` centré sur la pile entière, sur une pastille sombre translucide
    /// qui les garde lisibles quelle que soit la photo dessous.
    /// La pile vit sur la LIGNE de frappe, à côté d'un libellé de 11 pt — d'où
    /// des visages de 22 pt plutôt que la pastille de 36 pt du slot d'aperçu.
    private static let typingFaceSize: CGFloat = 22
    private static let typingFaceOverlap: CGFloat = 11

    /// Largeur de la pile : un visage, plus le débord de chaque suivant.
    private var typingStackWidth: CGFloat {
        let extra = CGFloat(max(0, typingFaces.count - 1)) * Self.typingFaceOverlap
        return Self.typingFaceSize + extra
    }

    /// Un visage de la pile. Extrait de `typingAvatarStack` : inline, la chaîne
    /// ZStack → ForEach → overlay → frame → overlay dépassait le budget de
    /// type-check de Swift (« unable to type-check this expression in
    /// reasonable time »).
    private func typingFace(_ face: TypingParticipant, at index: Int) -> some View {
        let offsetX = CGFloat(index) * Self.typingFaceOverlap
        return MeeshyAvatar(
            name: face.displayName,
            context: .custom(Self.typingFaceSize),
            accentColor: accentColor,
            avatarURL: face.avatarURL
        )
        .overlay(Circle().strokeBorder(Color(hex: accentColor), lineWidth: 1.5))
        .offset(x: offsetX)
    }

    /// Les points animés, posés sur une pastille sombre qui les garde lisibles
    /// quelle que soit la photo dessous.
    private var typingDotsBadge: some View {
        typingDotsView
            .padding(.horizontal, 5)
            .padding(.vertical, 3)
            .background(Capsule().fill(Color.black.opacity(0.55)))
    }

    /// Les visages de ceux qui écrivent, avec les trois points animés
    /// PAR-DESSUS.
    ///
    /// Les avatars se chevauchent comme une pile de participants ; l'ordre du
    /// roster étant celui de première apparition, la pile ne se réordonne pas à
    /// chaque frappe.
    private var typingAvatarStack: some View {
        ZStack(alignment: .leading) {
            ForEach(Array(typingFaces.enumerated()), id: \.element.id) { index, face in
                typingFace(face, at: index)
            }
        }
        .frame(width: typingStackWidth, height: Self.typingFaceSize, alignment: .leading)
        .overlay(typingDotsBadge)
        .accessibilityHidden(true)
    }

    private var typingDotsView: some View {
        HStack(spacing: 3) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(Color.white)
                    .frame(width: 5, height: 5)
                    .offset(y: typingDotPhase == i ? -3 : 0)
                    .animation(
                        .spring(response: 0.3, dampingFraction: 0.5)
                            .delay(Double(i) * 0.1),
                        value: typingDotPhase
                    )
            }
        }
    }
}
