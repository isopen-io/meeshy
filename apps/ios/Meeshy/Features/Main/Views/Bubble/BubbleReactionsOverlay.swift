import SwiftUI
import MeeshySDK
import MeeshyUI

/// Bande de reactions affichee sous la bulle. Stateless cote rendu — les
/// callbacks ne participent PAS a Equatable (cf. BubbleCallbacks).
///
/// Was: ThemedMessageBubble.reactionsOverlay + helpers
/// (`addReactionButton`, `overflowPill`, `reactionPill`,
/// `reactionPillAccessibilityLabel`) — anciennes lignes 1183-1325.
///
/// `MeeshyReactionSummary` n'est pas Equatable cote SDK, donc on projette
/// chaque resume en tuple (emoji, count, includesMe) pour comparer manuellement.
struct BubbleReactionsOverlay: View, Equatable {
    static let maxVisible = 4

    let messageId: String
    let summaries: [ReactionSummary]
    let isMe: Bool
    let isDark: Bool
    let isLastReceivedMessage: Bool
    let accentHex: String

    /// Excluded from Equatable: les callbacks ne changent pas le rendu.
    /// Le `String` passe a `onToggleReaction` est l'emoji (pas le messageId).
    var onAddReaction: ((String) -> Void)? = nil
    var onToggleReaction: ((String) -> Void)? = nil
    var onOpenReactPicker: ((String) -> Void)? = nil
    var onShowReactions: ((String) -> Void)? = nil

    /// Ensemble des emojis deja vus au rendu precedent. Une pill dont
    /// l'emoji est ABSENT de ce set est consideree "nouvelle" et joue
    /// l'animation comet. Les pills deja presentes (count qui change,
    /// re-render de liste) ne rejouent JAMAIS l'animation.
    /// Exclu de Equatable : c'est un etat de presentation interne.
    @State private var seenEmojis: Set<String> = []

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.messageId == rhs.messageId &&
        lhs.isMe == rhs.isMe &&
        lhs.isDark == rhs.isDark &&
        lhs.isLastReceivedMessage == rhs.isLastReceivedMessage &&
        lhs.accentHex == rhs.accentHex &&
        lhs.summaries.map(Self.summarySlice) == rhs.summaries.map(Self.summarySlice)
    }

    private static func summarySlice(_ summary: ReactionSummary) -> SummarySlice {
        SummarySlice(emoji: summary.emoji, count: summary.count, includesMe: summary.includesMe)
    }

    private struct SummarySlice: Equatable {
        let emoji: String
        let count: Int
        let includesMe: Bool
    }

    @ViewBuilder
    var body: some View {
        let accent = Color(hex: accentHex)
        let visible = Array(summaries.prefix(Self.maxVisible))
        let overflowCount = summaries.count - visible.count
        let showsAddButton = !isMe && isLastReceivedMessage
        let hasContent = !visible.isEmpty || showsAddButton

        Group {
            if hasContent {
                // Layout unifie : pills en ordre chronologique stable (gauche
                // -> droite), puis overflow pill (+N), puis le bouton "+"
                // d'ajout de reaction (uniquement sur le dernier message
                // recu). Le HStack lit toujours gauche -> droite ; c'est
                // l'alignement de l'overlay externe (BubbleStandardLayout)
                // qui decide de quel cote le strip flotte par rapport a
                // la bulle.
                HStack(spacing: 3) {
                    ForEach(visible, id: \.emoji) { reaction in
                        pill(reaction: reaction, accent: accent)
                    }
                    if overflowCount > 0 {
                        overflowPill(count: overflowCount, accent: accent)
                    }
                    if showsAddButton {
                        addButton(accent: accent)
                    }
                }
            }
        }
        // Synchronise l'ensemble des emojis connus a chaque changement de
        // resume. Au montage initial (`onAppear`) on enregistre tout sans
        // animer — les reactions deja chargees ne doivent pas crasher a
        // l'ouverture de la conversation. Ensuite, chaque emoji absent du
        // set est traite comme "nouveau" par `CometPillModifier`.
        .onAppear {
            if seenEmojis.isEmpty {
                seenEmojis = Set(summaries.map(\.emoji))
            }
        }
        .adaptiveOnChange(of: summaries.map(\.emoji)) { _, newEmojis in
            seenEmojis = Set(newEmojis)
        }
    }

    // MARK: - Add reaction button (was: addReactionButton)

    private func addButton(accent: Color) -> some View {
        // Visible chip stays compact (24x24 — pill-friendly) but the
        // contentShape is bumped to 40x40 so the touch target meets
        // Apple's 44pt-minimum guidance without bloating the layout.
        // Background opacity is doubled (0.18 dark / 0.14 light) so the
        // accent color reads at a glance — the previous 0.1/0.06 made
        // the pill almost invisible against the bubble's tail strip.
        Image(systemName: "face.smiling")
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(isDark ? accent.opacity(0.85) : accent.opacity(0.75))
            .frame(width: 24, height: 24)
            .background(
                Circle()
                    .fill(isDark ? accent.opacity(0.18) : accent.opacity(0.14))
                    .overlay(
                        Circle()
                            .stroke(accent.opacity(isDark ? 0.4 : 0.28), lineWidth: 0.7)
                    )
                    .shadow(color: accent.opacity(0.18), radius: 3, y: 1)
            )
            // Extended hit area so the smiley is easy to tap even when
            // it sits flush against the bubble's bottom edge. The Circle
            // here is purely a hit-testing surface — only the chip above
            // is rendered, so visually nothing changes.
            .frame(width: 40, height: 40)
            .contentShape(Circle())
            .onTapGesture {
                HapticFeedback.light()
                onAddReaction?(messageId)
            }
            .onLongPressGesture(minimumDuration: 0.4) {
                HapticFeedback.medium()
                onOpenReactPicker?(messageId)
            }
            // Layout height pinned to 22pt — la meme que les pills de
            // reaction — pour que le cadre de hit-area 40pt ci-dessus ne
            // gonfle PAS la HStack des reactions. La bande est ancree en
            // bas en overlay sur la bulle ; une bande plus haute remonte
            // et pousse le smiley DANS la bulle sur le dernier message
            // recu. Le cercle de hit 40pt deborde toujours de +/-9pt et
            // reste entierement tappable (l'overlay de bulle n'est pas clippe).
            .frame(height: 22)
            .accessibilityLabel("Ajouter une reaction")
            .accessibilityHint("Appuyer pour reagir rapidement, maintenir pour choisir un emoji")
    }

    // MARK: - Overflow pill (was: overflowPill)

    private func overflowPill(count: Int, accent: Color) -> some View {
        Button {
            HapticFeedback.light()
            onShowReactions?(messageId)
        } label: {
            Text("+\(count)")
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundColor(accent)
        }
        .frame(height: 22)
        .padding(.horizontal, 6)
        .background(
            Capsule()
                .fill(isDark ? accent.opacity(0.12) : accent.opacity(0.08))
                .overlay(
                    Capsule()
                        .stroke(accent.opacity(isDark ? 0.25 : 0.15), lineWidth: 0.5)
                )
        )
        .accessibilityLabel("\(count) reactions supplementaires")
        .accessibilityHint("Voir toutes les reactions")
    }

    // MARK: - Reaction pill (was: reactionPill)

    private func pill(reaction: ReactionSummary, accent: Color) -> some View {
        let pillContent = HStack(spacing: 2) {
            Text(reaction.emoji)
                .font(.system(size: 11))
            if reaction.count > 1 {
                Text("\(reaction.count)")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(
                        reaction.includesMe
                            ? (isDark ? .white : .white)
                            : (isDark ? .white.opacity(0.7) : accent)
                    )
            }
        }
        .padding(.horizontal, reaction.count > 1 ? 6 : 5)
        .frame(height: 22)

        // Différenciation amplifiée des pills où le user connecté a réagi :
        //  - fill saturé : 0.65 dark / 0.50 light (vs 0.08 / 0.04 pour les autres)
        //    → la pill "moi" se lit comme un bouton actif chargé en couleur
        //  - stroke 2.5pt vs 0.5pt → 5× plus épais, immédiatement repérable
        //  - shadow plus marquée pour donner un léger relief
        let fillColor: Color = reaction.includesMe
            ? (isDark ? accent.opacity(0.65) : accent.opacity(0.50))
            : (isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))

        let strokeColor: Color = reaction.includesMe
            ? accent.opacity(isDark ? 0.95 : 0.80)
            : accent.opacity(isDark ? 0.15 : 0.10)

        let strokeWidth: CGFloat = reaction.includesMe ? 2.5 : 0.5

        let shadowColor: Color = reaction.includesMe ? accent.opacity(0.40) : .clear
        let shadowRadius: CGFloat = reaction.includesMe ? 5 : 0

        // Une pill est "nouvelle" si son emoji n'etait pas dans `seenEmojis`
        // au rendu precedent. C'est vrai aussi bien quand le user local
        // ajoute une reaction que lorsqu'une reaction distante arrive via
        // socket : dans les deux cas `summaries` gagne un emoji inconnu.
        let isNew = !seenEmojis.contains(reaction.emoji)

        return pillContent
            .background(
                Capsule()
                    .fill(fillColor)
                    .overlay(
                        Capsule()
                            .stroke(strokeColor, lineWidth: strokeWidth)
                    )
                    .shadow(color: shadowColor, radius: shadowRadius, y: 2)
            )
            .modifier(CometPillModifier(isNew: isNew))
            .onTapGesture {
                HapticFeedback.light()
                onToggleReaction?(reaction.emoji)
            }
            .onLongPressGesture(minimumDuration: 0.4) {
                HapticFeedback.medium()
                onShowReactions?(messageId)
            }
            .accessibilityLabel(Self.pillAccessibilityLabel(reaction))
            .accessibilityHint("Appuyer pour basculer la reaction")
    }

    // MARK: - Accessibility helper (was: reactionPillAccessibilityLabel)

    private static func pillAccessibilityLabel(_ reaction: ReactionSummary) -> String {
        let countLabel = reaction.count == 1 ? "reaction" : "reactions"
        let meLabel = reaction.includesMe ? ", vous avez reagi" : ""
        return "\(reaction.emoji) \(reaction.count) \(countLabel)\(meLabel)"
    }
}

// MARK: - Comet-landing modifier

/// Anime l'entree d'une pill de reaction comme une comete qui s'ecrase.
/// Utilise `PhaseAnimator` (iOS 17+) pour orchestrer les 3 phases sans
/// DispatchQueue.asyncAfter ni @State supplementaires.
///
/// Phases :
///   .launch  → pill fortement zoomee (2.6x) et decalee en haut (-18pt)
///   .land    → ressort rapide ramene a 1.0 / 0 — l'impact (+ haptic)
///   .shake   → oscillations decroissantes (rotation + micro-X) post-impact
///   .rest    → etat final stable
///
/// Une pill deja presente (`isNew == false`) saute directement a .rest.
private struct CometPillModifier: ViewModifier {
    let isNew: Bool

    private enum Phase: CaseIterable {
        case launch, land, shake, rest
    }

    @ViewBuilder
    func body(content: Content) -> some View {
        if isNew {
            PhaseAnimator(Phase.allCases, trigger: isNew) { phase in
                content
                    .scaleEffect(scale(for: phase))
                    .rotationEffect(rotation(for: phase))
                    .offset(x: offsetX(for: phase), y: offsetY(for: phase))
            } animation: { phase in
                switch phase {
                case .launch: return .none
                case .land:   return .spring(response: 0.32, dampingFraction: 0.55)
                case .shake:  return .easeOut(duration: 0.42)
                case .rest:   return .none
                }
            }
            .onAppear { HapticFeedback.light() }
        } else {
            content
        }
    }

    private func scale(for phase: Phase) -> CGFloat {
        switch phase {
        case .launch: return 2.6
        case .land, .shake, .rest: return 1.0
        }
    }

    private func offsetY(for phase: Phase) -> CGFloat {
        switch phase {
        case .launch: return -18
        case .land, .shake, .rest: return 0
        }
    }

    private func rotation(for phase: Phase) -> Angle {
        switch phase {
        case .launch, .land, .rest: return .zero
        case .shake: return .degrees(4)
        }
    }

    private func offsetX(for phase: Phase) -> CGFloat {
        switch phase {
        case .launch, .land, .rest: return 0
        case .shake: return 2
        }
    }
}
