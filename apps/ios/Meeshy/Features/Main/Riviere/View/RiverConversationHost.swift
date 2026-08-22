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
    /// Échelle du plan, POSÉE par le pince (retour produit 2026-08-22).
    /// Ce n'est pas un `scaleEffect` : c'est la LARGEUR DE COULOIR qui varie
    /// (`RiverMetrics.Lane.width*`, paramètre que §7ter accorde
    /// explicitement à la peau). Le texte garde donc sa taille et sa
    /// lisibilité — zoomer élargit les couloirs, il ne grossit pas l'image —
    /// et les cadres mesurés dont dépendent le canvas et la ligne de lecture
    /// restent justes, ce qu'un `scaleEffect` aurait faussé.
    @State private var laneWidth: CGFloat = RiverMetrics.Lane.widthReference
    /// Largeur au moment où les doigts se sont posés — le pince est RELATIF
    /// à elle, sinon chaque geste repartirait de la largeur de référence.
    @State private var laneWidthAtPinchStart: CGFloat = RiverMetrics.Lane.widthReference
    @GestureState private var isPinching = false
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
        let geometry = RiverConversationMapping.resolveGeometry(messages: messages, viewerId: viewerId)
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
    /// `frame(width:height:)` FIXE ne se négocie pas.
    ///
    /// **Le retrait de l'en-tête n'est PLUS une marge extérieure**
    /// (2026-08-22). Posé en `padding`, il rétrécissait le pane et le
    /// `.background` peignait alors une DALLE PLATE derrière l'en-tête : le
    /// fond vivant de la conversation disparaissait et rien ne passait jamais
    /// dessous. Il descend dans le lecteur (`RiverStreamHost.headerInset`,
    /// consommé par son `safeAreaInset`) : le pane couvre tout l'écran — donc
    /// le fil rendu dessous reste caché, contrainte tenue — et les bulles
    /// DÉFILENT derrière un en-tête qui, lui, est déjà de verre.
    var body: some View {
        GeometryReader { proxy in
            RiverStreamHost(
                geometry: geometry,
                contents: contents,
                laneWidth: laneWidth,
                paneHeight: proxy.size.height,
                paneWidth: proxy.size.width,
                headerInset: topInset,
                navigation: navigation
            )
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .simultaneousGesture(pinch)
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
                let resolved = RiverConversationMapping.resolveGeometry(messages: messages, viewerId: viewerId)
                geometry = resolved
                navigation.updateGeometry(resolved)
            }
    }


    // MARK: - Le pince — zoomer, c'est élargir les couloirs

    /// « Le zoom et dézoom en pinch out/in doit être possible » (retour
    /// produit 2026-08-22).
    ///
    /// `simultaneousGesture` : le pince ne dispute JAMAIS le pan natif du
    /// `ScrollView` — les deux axes restent parcourables pendant et après le
    /// geste. La largeur est bornée par les tokens
    /// (`RiverMetrics.Lane.widthMin`/`widthMax`) : en deçà du plancher, une
    /// bulle devrait tronquer son texte pour tenir, ce que §7ter interdit.
    private var pinch: some Gesture {
        MagnificationGesture()
            .updating($isPinching) { _, state, _ in state = true }
            .onChanged { scale in
                laneWidth = min(
                    max(laneWidthAtPinchStart * scale, RiverMetrics.Lane.widthMin),
                    RiverMetrics.Lane.widthMax
                )
            }
            .onEnded { _ in
                // La largeur atteinte devient l'origine du geste SUIVANT :
                // sans cela, chaque pince repartirait de la référence et le
                // plan sauterait au premier contact.
                laneWidthAtPinchStart = laneWidth
            }
    }
}
