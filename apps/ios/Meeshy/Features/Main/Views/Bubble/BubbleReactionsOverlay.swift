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
            .font(.caption2.weight(.semibold))
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
            .accessibilityLabel(String(localized: "bubble.reactions.add", defaultValue: "Add reaction", bundle: .main))
            .accessibilityHint(String(localized: "bubble.reactions.add.hint", defaultValue: "Appuyer pour reagir rapidement, maintenir pour choisir un emoji", bundle: .main))
    }

    // MARK: - Overflow pill (was: overflowPill)

    private func overflowPill(count: Int, accent: Color) -> some View {
        Button {
            HapticFeedback.light()
            onShowReactions?(messageId)
        } label: {
            Text("+\(count)")
                .font(.caption2.weight(.bold).monospaced())
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
        .accessibilityLabel(String(format: String(localized: "bubble.reactions.moreCount", defaultValue: "%d more reactions", bundle: .main), count))
        .accessibilityHint(String(localized: "bubble.reactions.viewAll.hint", defaultValue: "Voir toutes les reactions", bundle: .main))
    }

    // MARK: - Reaction pill (was: reactionPill)

    private func pill(reaction: ReactionSummary, accent: Color) -> some View {
        let pillContent = HStack(spacing: 2) {
            Text(reaction.emoji)
                .font(.caption2)
            if reaction.count > 1 {
                Text("\(reaction.count)")
                    .font(.caption2.weight(.bold))
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

        // Une pill ne joue son animation d'entree (comete) QUE si elle vient
        // d'etre ajoutee — toggle local ou broadcast socket `reaction:added`,
        // les deux marquent `ReactionAnimationGate`. Le simple recyclage d'une
        // cellule au scroll (qui recreerait un `@State`) ne declenche RIEN : la
        // "nouveaute" est un evenement modele, pas un evenement de vue.
        let isNew = ReactionAnimationGate.shouldAnimate(messageId: messageId, emoji: reaction.emoji)

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
            .accessibilityHint(String(localized: "bubble.reactions.toggle.hint", defaultValue: "Appuyer pour basculer la reaction, maintenir pour voir toutes les reactions", bundle: .main))
    }

    // MARK: - Accessibility helper (was: reactionPillAccessibilityLabel)

    private static func pillAccessibilityLabel(_ reaction: ReactionSummary) -> String {
        let countLabel = reaction.count == 1 ? "reaction" : "reactions"
        let meLabel = reaction.includesMe ? ", vous avez reagi" : ""
        return "\(reaction.emoji) \(reaction.count) \(countLabel)\(meLabel)"
    }
}

// MARK: - Comet-landing modifier

/// Anime l'entree d'une pill de reaction comme une comete qui s'ecrase :
/// 1. Phase ZOOM : la pill demarre fortement zoomee (~2.6x) et legerement
///    decalee en haut, comme un emoji qui fonce vers la bulle.
/// 2. Phase DEZOOM : un ressort rapide ramene l'echelle a 1.0 et l'offset
///    a zero — l'impact.
/// 3. Phase SHAKE : 2-3 oscillations decroissantes de rotation/translation
///    simulent le tremblement post-impact, puis stabilisation.
///
/// Une pill deja presente (`isNew == false`) est rendue a son etat final
/// sans aucune animation : pas de re-jeu sur un simple re-render de liste.
private struct CometPillModifier: ViewModifier {
    let isNew: Bool

    /// `progress` pilote zoom + offset (0 = comete lointaine, 1 = posee).
    @State private var progress: CGFloat
    /// `shake` pilote l'amplitude des oscillations post-impact (1 -> 0).
    @State private var shake: CGFloat = 0
    /// Phase angulaire des oscillations — avance pendant le tremblement.
    @State private var wobblePhase: CGFloat = 0
    @State private var didStart = false

    init(isNew: Bool) {
        self.isNew = isNew
        // Pills deja vues : etat final immediat. Pills neuves : etat
        // "comete" initial, l'animation est declenchee dans onAppear.
        _progress = State(initialValue: isNew ? 0 : 1)
    }

    // Echelle : 2.6x au depart, 1.0 a l'arrivee.
    private var scale: CGFloat {
        let cometScale: CGFloat = 2.6
        return cometScale - (cometScale - 1.0) * progress
    }

    // Offset : la comete tombe depuis le haut (-18pt) vers sa place.
    private var dropOffset: CGFloat {
        -18 * (1 - progress)
    }

    // Tremblement : 3 oscillations sinusoidales dont l'amplitude decroit
    // avec `shake`. Rotation legere + micro-translation horizontale.
    private var wobbleAngle: Angle {
        .degrees(Double(sin(wobblePhase * .pi * 6) * shake * 9))
    }

    private var wobbleX: CGFloat {
        cos(wobblePhase * .pi * 6) * shake * 3
    }

    func body(content: Content) -> some View {
        content
            .scaleEffect(scale)
            .rotationEffect(wobbleAngle)
            .offset(x: wobbleX, y: dropOffset)
            .onAppear {
                guard isNew, !didStart else { return }
                didStart = true
                startCometLanding()
            }
    }

    private func startCometLanding() {
        // Phase 1+2 — dezoom : ressort rapide et un peu rebondissant qui
        // ramene la comete a sa place finale.
        withAnimation(.spring(response: 0.32, dampingFraction: 0.55)) {
            progress = 1
        }
        HapticFeedback.light()

        // Phase 3 — shake : declenche a l'impact (~0.18s apres le lancement).
        // On amorce `shake` a 1, on fait avancer `wobblePhase` lineairement
        // pour generer les oscillations, puis on amortit `shake` vers 0.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            shake = 1
            wobblePhase = 0
            withAnimation(.linear(duration: 0.42)) {
                wobblePhase = 1
            }
            withAnimation(.easeOut(duration: 0.42)) {
                shake = 0
            }
        }
    }
}

// MARK: - Reaction entrance-animation gate

/// Marque les reactions qui doivent jouer l'animation d'entree (comete) a leur
/// prochain rendu. Alimentee UNIQUEMENT par de vrais evenements "reaction
/// ajoutee" — le toggle optimiste de l'utilisateur local ET le broadcast temps
/// reel `reaction:added` — JAMAIS par un chargement de liste ou la recreation
/// d'une cellule au scroll.
///
/// Pourquoi une table laterale plutot qu'un `@State` par cellule : SwiftUI
/// detruit le `@State` d'une cellule hors-ecran et le recree au scroll-in
/// (la liste est un `MessageListViewController` UIKit qui recycle ses cellules),
/// ce qui faisait rejouer l'animation d'entree a CHAQUE reaction existante. Le
/// signal "nouvellement ajoutee" doit vivre HORS de la cellule recyclee — c'est
/// un evenement modele, pas un evenement de vue. Une cle expire apres `window`
/// secondes (la duree de l'animation comete) pour qu'un scroll-in ulterieur la
/// rende de maniere statique.
@MainActor
enum ReactionAnimationGate {
    /// Source de temps injectable (tests).
    static var now: () -> Date = { Date() }
    /// Fenetre d'animabilite — doit couvrir la duree du `CometPillModifier`.
    static let window: TimeInterval = 1.3
    private static var expiries: [String: Date] = [:]

    private static func key(_ messageId: String, _ emoji: String) -> String {
        "\(messageId)\u{1F}\(emoji)"
    }

    /// Enregistre une reaction reellement nouvelle pour que son prochain rendu
    /// l'anime. Purge au passage les entrees expirees (table bornee).
    static func markAdded(messageId: String, emoji: String) {
        let current = now()
        expiries = expiries.filter { $0.value > current }
        expiries[key(messageId, emoji)] = current.addingTimeInterval(window)
    }

    /// Vrai seulement dans la fenetre d'animation suivant un `markAdded`.
    static func shouldAnimate(messageId: String, emoji: String) -> Bool {
        guard let expiry = expiries[key(messageId, emoji)] else { return false }
        return expiry > now()
    }

    #if DEBUG
    /// Remet l'etat a zero entre les tests.
    static func resetForTesting() {
        expiries = [:]
        now = { Date() }
    }
    #endif
}
