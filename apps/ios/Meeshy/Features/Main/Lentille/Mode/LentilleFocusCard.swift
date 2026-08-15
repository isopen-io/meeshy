import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Pourquoi ce fichier vit dans Lentille/Mode/, pas Lentille/Perspective/
//
// Re-preuve d'ancrage (règle §0 du workshop) : le contrat/workshop citent
// « Lentille/Perspective/ + Lentille/Mode/ » comme territoire d'I-071. Mais
// `Lentille/Perspective/` porte une garde de source GELÉE et déjà VERTE
// (`LentillePerspectiveCurveTests.test_perspective_appliesOpacityAndScaleOnly`,
// scan DYNAMIQUE de tout le dossier) qui interdit `.font(`, `.offset(`,
// `blur(`, `rotationEffect(`… à TOUT fichier qu'il contient — la carte, qui a
// besoin des trois pour son texte, sa position et son rendu, y ferait rougir
// une suite gelée. `Lentille/Mode/` est le SECOND dossier que LWS-8 possède
// (contrat §1.4, « Lentille/Perspective/*.swift, Lentille/Mode/*.swift ») et
// ne porte aucune garde de ce type : c'est le domicile correct de la carte.
// `Lentille/Perspective/*.swift` (GELÉ : `LentillePerspective.swift`,
// `LentilleFocusElection.swift`, `LentilleFocusElectionHost.swift`) est
// CONSOMMÉ ici, jamais édité.

/// La carte de focus de la Lentille (contrat LWS-8/I-071, §4.2/§4.3) — un
/// fond + une encoche peints EN OVERLAY sur le rang élu, jamais un
/// conteneur : le rang garde sa hauteur (`LentilleMetrics.Row.height`),
/// inchangée — cette vue ne fait que peindre PAR-DESSUS, à la position que
/// l'élection (I-070, GELÉE) publie. Zéro relayout : aucune vue de ce
/// fichier ne lit ni n'écrit la géométrie d'un rang.
///
/// Contenu, purement dérivé de ses entrées (aucun `@State` ici — la
/// résolution de la préférence vit dans `LentilleFocusCardHost`, ci-dessous) :
/// - fond `backgroundSecondary` + ring INTERNE `1.5` à l'accent DE CETTE
///   CONVERSATION (`conversation.accentColor`, le même accent SDK que
///   l'anneau de l'avatar du rang), radius `16`.
/// - reduce motion ⇒ fond SEUL, ring supprimé (l'élection, elle, tient —
///   c'est `LentilleFocusCardHost`/I-070 qui en décide, pas cette vue).
/// - encoche « AUTO · <décision> » ou chip du mode mémorisé, `Button(.plain)`
///   + `.contentShape` — le SEUL élément hit-testable de la carte.
struct LentilleFocusCard: View {

    let conversation: Conversation
    /// Préférence mémorisée (store M-048) pour CETTE conversation — `.auto`
    /// tant que rien n'est mémorisé.
    let preference: ReadingModeOrchestrator.ReadingModePreference
    /// Décision de `resolveOrchestratorDecision` sur les données de CETTE
    /// conversation (résolue par `LentilleFocusCardHost`, jamais ici : cette
    /// vue reste un pur rendu de ce qu'on lui donne).
    let decision: ReadingModeOrchestrator.OrchestratorDecision
    let isDark: Bool
    let reduceMotion: Bool
    /// Tap sur l'encoche — OUVRE le menu I-072. En I-071, câblage préparé
    /// SEUL (`Button(.plain)` + `.contentShape`) : aucun menu n'est encore
    /// présenté, la fermeture reste `{}` tant que `LentilleFocusCardHost` ne
    /// la branche pas (I-072).
    var onNotchTap: () -> Void = {}

    private var accent: Color { Color(hex: conversation.accentColor) }

    /// Opacité du ring — pure, testable sans rendu (même discipline que
    /// `LentilleConversationRow.rowOpacity`/`showsBridge`, I-065). Reduce
    /// motion ⇒ `0` : « fond seul », critère d'acceptation LWS-8.
    nonisolated static func ringOpacity(reduceMotion: Bool) -> Double {
        reduceMotion ? 0 : 1
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            RoundedRectangle(cornerRadius: LentilleMetrics.FocusCard.radius, style: .continuous)
                .fill(MeeshyColors.backgroundSecondary(isDark: isDark))
                .overlay(
                    RoundedRectangle(cornerRadius: LentilleMetrics.FocusCard.radius, style: .continuous)
                        .strokeBorder(accent, lineWidth: LentilleMetrics.FocusCard.ringSize)
                        // Reduce motion ⇒ « fond SEUL » (critère LWS-8) : le
                        // ring disparaît, il n'est jamais figé/dépoli — la
                        // seule transformation qu'un utilisateur ayant coupé
                        // le mouvement demande à ne PAS voir est le ring
                        // « vivant », pas le ring lui-même en tant que tel ;
                        // ici on l'omet purement pour respecter « fond seul »
                        // au pied de la lettre.
                        .opacity(Self.ringOpacity(reduceMotion: reduceMotion))
                )
                // Décoratif SEUL : ne doit intercepter ni le défilement, ni
                // le tap/long-press/swipe du rang réel qu'elle recouvre.
                .allowsHitTesting(false)

            // CSS `top: -9; right: 14` (§4.3) : l'encoche POKE hors du bord
            // haut de la carte (offset y NÉGATIF, `ModeNotch.top` l'est déjà)
            // et s'inset depuis le bord droit (offset x NÉGATIF de
            // `ModeNotch.right`, positif). `.overlay(alignment: .topTrailing)`
            // pose l'origine au coin ; l'offset fait le reste.
            notch
                .offset(x: -LentilleMetrics.ModeNotch.right, y: LentilleMetrics.ModeNotch.top)
        }
        // PAS de `.accessibilityElement(children: .combine)` ici : ça
        // fusionnerait le `Button` de l'encoche dans un bloc non-actionnable
        // — le fond décoratif n'a rien à annoncer (`allowsHitTesting(false)`
        // le retire déjà du hit-testing, pas de VoiceOver), l'encoche doit
        // rester SON PROPRE élément accessible, avec le trait bouton.
    }

    // MARK: - Encoche

    private var notchText: String {
        LentilleModeLabels.notchText(decision: decision, preference: preference)
    }

    private var notch: some View {
        Button(action: onNotchTap) {
            Text(notchText)
                .font(MeeshyFont.relative(LentilleMetrics.ModeNotch.size, weight: LentilleMetrics.ModeNotch.weight))
                .foregroundColor(accent)
                .padding(.horizontal, MeeshySpacing.sm)
                .padding(.vertical, MeeshySpacing.xs)
                .background(
                    Capsule(style: .continuous)
                        .fill(MeeshyColors.backgroundSecondary(isDark: isDark))
                )
                .overlay(
                    Capsule(style: .continuous)
                        .strokeBorder(accent.opacity(LentilleMetrics.Avatar.ringOpacity), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle())
        .accessibilityLabel(notchText)
    }
}

// MARK: - Hôte — élection + préférence, posé dans l'overlay d'I-070

/// Résout l'élu (`LentilleFocusElection`, GELÉ) en `Conversation`, charge sa
/// préférence mémorisée (store M-048, `LentilleReadingModePreferenceCenter`)
/// et rend `LentilleFocusCard` À LA POSITION du rang élu — un fond/overlay,
/// jamais un conteneur qui redimensionnerait quoi que ce soit.
///
/// C'EST ce que `ConversationListView.swift` monte dans son overlay
/// d'élection (I-070) : le body de la liste ne lit JAMAIS
/// `focusElection.electedId` (garde `FocusCardElectionTests
/// .test_electedState_neverLivesInTheListBody`) — cet hôte le lit, lui, dans
/// SON fichier à lui.
struct LentilleFocusCardHost: View {

    /// Le magasin de l'élu — GELÉ, I-070. `@ObservedObject` : cet hôte se
    /// re-rend au rythme de l'élection, exactement comme prévu par le
    /// commentaire de `LentilleFocusElection` (« seuls les consommateurs
    /// réels de la carte s'abonneront »).
    @ObservedObject var election: LentilleFocusElection
    /// Le registre de positions — GELÉ, I-069/I-070. Boîte inerte, jamais
    /// observée.
    let registry: LentilleFocusCandidateRegistry
    /// Les conversations rendues par la liste — pour résoudre l'élu (un
    /// simple id) en données d'affichage.
    let conversations: [Conversation]
    let isAnonymous: Bool
    var preferenceStore: ReadingModePreferenceStoring = LentilleReadingModePreferenceCenter.shared
    var onOpenModeMenu: (Conversation) -> Void = { _ in }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    @State private var preference: ReadingModeOrchestrator.ReadingModePreference = .auto
    @State private var unsubscribe: (() -> Void)?

    private var isDark: Bool { colorScheme == .dark }

    private var electedConversation: Conversation? {
        guard let id = election.electedId else { return nil }
        return conversations.first { $0.id == id }
    }

    var body: some View {
        GeometryReader { geo in
            if let conversation = electedConversation,
               let midY = registry.midYById[conversation.id] {
                let localY = midY - geo.frame(in: .global).minY
                LentilleFocusCard(
                    conversation: conversation,
                    preference: preference,
                    decision: LentilleReadingModeContext.decision(
                        for: conversation,
                        preference: preference,
                        isAnonymous: isAnonymous,
                        // Cet hôte n'est monté par `ConversationListView`
                        // QUE derrière `LentilleFeatureFlag.isLentilleListEnabled`
                        // (même garde que `LentilleFocusElectionHost`) : le
                        // drapeau est donc déjà VRAI à chaque appel — un
                        // second appel à `ProcessInfo.environment` ici
                        // n'apporterait rien pour le seul cas qui atteint ce
                        // corps.
                        isLentilleFlagEnabled: true
                    ),
                    isDark: isDark,
                    reduceMotion: reduceMotion,
                    onNotchTap: { onOpenModeMenu(conversation) }
                )
                .frame(
                    width: geo.size.width - 2 * LentilleMetrics.Row.marginHorizontal,
                    height: LentilleMetrics.Row.height
                )
                .position(x: geo.size.width / 2, y: localY)
            }
        }
        .adaptiveOnChange(of: electedConversation?.id, initial: true) { _, newId in
            resubscribe(to: newId)
        }
        .onDisappear { unsubscribe?() }
    }

    // MARK: - Abonnement à la préférence (M-048) — la SEULE lecture/écriture

    /// Recharge la préférence de l'élu courant et s'abonne à ses
    /// changements : le sous-menu et l'aperçu (I-072) écrivent dans le MÊME
    /// magasin (`LentilleReadingModePreferenceCenter.shared`), et l'encoche
    /// doit refléter un changement fait ailleurs sans attendre une nouvelle
    /// élection.
    private func resubscribe(to conversationId: String?) {
        unsubscribe?()
        unsubscribe = nil
        guard let conversationId else { return }
        Task { @MainActor in
            preference = await preferenceStore.get(conversationId: conversationId)
        }
        unsubscribe = preferenceStore.onChange { changedId, value in
            guard changedId == conversationId else { return }
            Task { @MainActor in preference = value }
        }
    }
}
