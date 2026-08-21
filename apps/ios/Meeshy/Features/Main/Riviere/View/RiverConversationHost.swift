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
    /// Bande haute réservée à l'en-tête FLOTTANT du fil (îlot + barre de
    /// boutons). Sans elle, la bande de couloirs se posait sous l'îlot
    /// dynamique et derrière le bouton « Retour » — l'appelant est le seul à
    /// connaître la hauteur de son propre en-tête, c'est donc lui qui la dit.
    var topInset: CGFloat = 0

    @StateObject private var navigation: RiverNavigationController
    @State private var geometry: RiverLaneResolver.RiverGeometry
    @State private var fingerprint: String

    init(
        messages: [MeeshyMessage],
        viewerId: String,
        topInset: CGFloat = 0,
        text: @escaping (MeeshyMessage) -> String
    ) {
        self.messages = messages
        self.viewerId = viewerId
        self.topInset = topInset
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

    /// **Le pane reçoit une taille MESURÉE, pas une taille négociée.**
    ///
    /// La Rivière est LARGE par nature (jusqu'à sept couloirs de 300 pt) et un
    /// `ScrollView` rend la taille IDÉALE de son contenu quand on ne lui
    /// propose rien de ferme. Deux conséquences mesurées au simulateur :
    /// l'écran hôte s'élargissait à ~2100 pt et CENTRAIT ses voisins dessus
    /// (bouton « Retour » à x = −683, hors écran, malgré son `zIndex(100)`) ;
    /// et le `ScrollView`, aussi grand que son contenu, n'avait plus RIEN à
    /// faire défiler — le pan horizontal ne déplaçait pas un pixel (retour
    /// produit 2026-08-21 : « aucune possibilité de naviguer librement
    /// horizontalement »).
    ///
    /// `frame(maxWidth: .infinity)` ne suffit pas : une taille MAXIMALE reste
    /// négociable. `GeometryReader` donne la taille RÉELLE du pane, et un
    /// `frame(width:height:)` FIXE ne se négocie pas. Le retrait de l'en-tête
    /// est posé À L'EXTÉRIEUR du lecteur, pour que `proxy.size` soit DÉJÀ la
    /// surface qui reste — aucune soustraction à faire, aucune occasion de se
    /// tromper d'un `topInset`.
    var body: some View {
        GeometryReader { proxy in
            RiverStreamHost(
                geometry: geometry,
                contents: contents,
                paneHeight: proxy.size.height,
                paneWidth: proxy.size.width,
                navigation: navigation
            )
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .padding(.top, topInset)
        // Le fond couvre TOUT le pane, bande réservée comprise : sans lui, le
        // fil (rendu sous cet hôte dans le même `ZStack`) transparaissait
        // entre les couloirs.
        .background(ThemeManager.shared.backgroundPrimary)
        // Le pane possède sa surface : sans forme de contenu explicite, les
        // zones vides entre les couloirs laissaient passer les touches
        // jusqu'au fil rendu DESSOUS.
        .contentShape(Rectangle())
        .adaptiveOnChange(of: RiverConversationMapping.fingerprint(messages: messages)) { _, next in
                guard next != fingerprint else { return }
                fingerprint = next
                let resolved = RiverLaneResolver.resolveRiverLanes(RiverConversationMapping.lanesInput(messages: messages, viewerId: viewerId))
                geometry = resolved
                navigation.updateGeometry(resolved)
            }
    }
}
