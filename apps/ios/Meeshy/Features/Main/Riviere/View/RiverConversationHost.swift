import SwiftUI
import MeeshySDK
import MeeshyUI

/// Hôte de la Rivière pour UNE conversation (chantier Rivière iOS, lot 1 —
/// 2026-08-21) : le point d'entrée que R-133 n'avait pas livré. Il possède la
/// navigation (`RiverNavigationController`), recalcule la géométrie quand les
/// messages « voix » changent (empreinte), et rend `RiverStreamHost` — la
/// peau ne connaît ni le VM ni le Prisme : le texte résolu lui est INJECTÉ.
struct RiverConversationHost: View {
    let messages: [MeeshyMessage]
    let viewerId: String
    /// Texte PRISME du message (traduction préférée ou original) — résolu par
    /// l'appelant (`ConversationViewModel.preferredTranslation(for:)`).
    let text: (MeeshyMessage) -> String

    @StateObject private var navigation: RiverNavigationController
    @State private var geometry: RiverLaneResolver.RiverGeometry
    @State private var fingerprint: String

    init(messages: [MeeshyMessage], viewerId: String, text: @escaping (MeeshyMessage) -> String) {
        self.messages = messages
        self.viewerId = viewerId
        self.text = text
        let geometry = RiverLaneResolver.resolveRiverLanes(RiverConversationMapping.lanesInput(messages: messages, viewerId: viewerId))
        _geometry = State(initialValue: geometry)
        _fingerprint = State(initialValue: RiverConversationMapping.fingerprint(messages: messages))
        _navigation = StateObject(wrappedValue: RiverNavigationController(
            geometry: geometry,
            initialCursor: RiverConversationMapping.initialCursor(geometry: geometry)
        ))
    }

    private var contents: [RiverBubbleContent] {
        RiverConversationMapping.contents(
            geometry: geometry,
            messages: messages,
            viewerId: viewerId,
            text: text,
            time: { TimeStringCache.shared.format($0) }
        )
    }

    var body: some View {
        RiverStreamHost(geometry: geometry, contents: contents, navigation: navigation)
            .background(ThemeManager.shared.backgroundPrimary)
            .adaptiveOnChange(of: RiverConversationMapping.fingerprint(messages: messages)) { _, next in
                guard next != fingerprint else { return }
                fingerprint = next
                let resolved = RiverLaneResolver.resolveRiverLanes(RiverConversationMapping.lanesInput(messages: messages, viewerId: viewerId))
                geometry = resolved
                navigation.updateGeometry(resolved)
            }
    }
}
