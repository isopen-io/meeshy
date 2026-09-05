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
    /// Bande basse réservée au composeur (R-7) — l'appelant la mesure déjà
    /// pour le fil (`MessageListView.bottomInset`), il la dit ici aussi.
    var bottomInset: CGFloat = 0
    /// L2b/2b-7 — les voix qui ÉCRIVENT, DITES par l'appelant
    /// (`ConversationViewModel.typingUsernames`). Relayé tel quel au lecteur :
    /// cet hôte ne le regarde pas, et il n'entre JAMAIS dans
    /// `RiverConversationMapping` — la frappe décore la peau, elle ne compose
    /// aucun couloir.
    var typingParticipants: [TypingParticipant] = []
    /// R-5 — résolveurs d'identité vivante et ouvertures, DITS par l'appelant
    /// (qui possède `PresenceManager`, `StoryViewModel`, le routeur).
    var presence: (MeeshyMessage) -> PresenceState? = { _ in nil }
    var storyRing: (MeeshyMessage) -> StoryRingState = { _ in .none }
    var onOpenProfile: ((ProfileSheetUser) -> Void)? = nil
    var onViewStory: ((String) -> Void)? = nil
    /// Lot 3 — retours au Fil depuis une bulle (appui long), DITS par
    /// l'appelant qui possède le contrôleur de mode et le composeur.
    var onOpenInThread: ((String) -> Void)? = nil
    var onReply: ((String) -> Void)? = nil
    /// #3901 — appelé quand le curseur ATTEINT le présent (rang de la bulle
    /// la plus récente, `RiverConversationMapping.isAtPresent`) : c'est ici,
    /// et seulement ici, que l'appelant sait qu'il peut faire avancer le
    /// curseur de lecture serveur (`ConversationViewModel
    /// .markCaughtUpFromSummaryOrRiver`) — la Rivière ne rend jamais bulle
    /// par bulle (`MessageListViewController.rendersThread`), donc
    /// n'alimente aucun `seenIds` pour le chemin de rattrapage habituel.
    var onReachPresent: (() -> Void)? = nil

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
    @State private var fingerprint: RiverConversationMapping.Fingerprint
    /// Incrémenté quand le pane doit RE-CADRER le curseur : première
    /// géométrie peuplée, ou rangs préfixés (le curseur a changé de rang pour
    /// le MÊME message). Jamais pour un message qui s'ajoute en bout — un
    /// lecteur remonté dans l'histoire n'est pas ramené au présent.
    @State private var landingToken = 0

    init(
        messages: [MeeshyMessage],
        viewerId: String,
        topInset: CGFloat = 0,
        bottomInset: CGFloat = 0,
        typingParticipants: [TypingParticipant] = [],
        presence: @escaping (MeeshyMessage) -> PresenceState? = { _ in nil },
        storyRing: @escaping (MeeshyMessage) -> StoryRingState = { _ in .none },
        onOpenProfile: ((ProfileSheetUser) -> Void)? = nil,
        onViewStory: ((String) -> Void)? = nil,
        onOpenInThread: ((String) -> Void)? = nil,
        onReply: ((String) -> Void)? = nil,
        onReachPresent: (() -> Void)? = nil,
        text: @escaping (MeeshyMessage) -> String
    ) {
        self.messages = messages
        self.viewerId = viewerId
        self.topInset = topInset
        self.bottomInset = bottomInset
        self.typingParticipants = typingParticipants
        self.presence = presence
        self.storyRing = storyRing
        self.onOpenProfile = onOpenProfile
        self.onViewStory = onViewStory
        self.onOpenInThread = onOpenInThread
        self.onReply = onReply
        self.onReachPresent = onReachPresent
        self.text = text
        let geometry = RiverConversationMapping.resolveGeometry(messages: messages, viewerId: viewerId)
        _geometry = State(initialValue: geometry)
        _fingerprint = State(initialValue: RiverConversationMapping.fingerprint(messages: messages))
        _navigation = StateObject(wrappedValue: RiverNavigationController(
            geometry: geometry,
            initialCursor: RiverConversationMapping.initialCursor(geometry: geometry)
        ))
    }

    /// Cache de rendu — un type RÉFÉRENCE, délibérément : le muter pendant
    /// l'évaluation du `body` ne doit RIEN réinvalider. Un `@State` de VALEUR
    /// écrit ici déclencherait la passe suivante, c'est-à-dire exactement la
    /// boucle que #3946 corrige.
    private final class ContentsMemo {
        var key: RiverConversationMapping.ContentsKey?
        var value: [RiverBubbleContent] = []

        /// Sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, une deinit
        /// synthétisée est ISOLÉE et double-libère sur iOS 26.1 quand SwiftUI
        /// démonte la vue hors tâche (SE-0466,
        /// `MainActorDeinitSourceGuardTests`). Un corps vide n'a rien à
        /// toucher : la libération redevient non isolée.
        nonisolated deinit {}
    }

    @State private var memo = ContentsMemo()

    /// `RiverConversationMapping.contents` construit un dictionnaire de TOUS
    /// les messages puis, par bulle, résout nom d'affichage, heure, texte,
    /// aperçu de réponse, avis système et `ProfileSheetUser`. C'était rejoué à
    /// chaque passe de `body`, et la Rivière en fait beaucoup — la
    /// republication des cadres réévalue la racine (#3946, pistes 1 et 2).
    ///
    /// La clé coûte un balayage de closures BON MARCHÉ ; la construction, elle,
    /// n'a plus lieu que lorsqu'une de ses entrées a réellement changé. Ce que
    /// la clé doit couvrir — et pourquoi l'empreinte n'y suffit pas — est dit
    /// une seule fois, sur `RiverConversationMapping.ContentsKey`.
    private var contents: [RiverBubbleContent] {
        let key = RiverConversationMapping.contentsKey(
            geometry: geometry,
            messages: messages,
            viewerId: viewerId,
            text: text,
            presence: presence,
            storyRing: storyRing
        )
        if memo.key == key { return memo.value }

        let built = RiverConversationMapping.contents(
            geometry: geometry,
            messages: messages,
            viewerId: viewerId,
            text: text,
            time: { TimeStringCache.shared.format($0) },
            presence: presence,
            storyRing: storyRing
        )
        memo.key = key
        memo.value = built
        return built
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
                bottomInset: bottomInset,
                typingParticipants: typingParticipants,
                landingToken: landingToken,
                onOpenProfile: onOpenProfile,
                onViewStory: onViewStory,
                onOpenInThread: onOpenInThread,
                onReply: onReply,
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
                // Le fil s'ouvre souvent AVANT ses messages (cache puis
                // réseau) : la Rivière naît alors sur une géométrie VIDE, et
                // son curseur d'init vaut (0, 0). La PREMIÈRE géométrie
                // peuplée est le vrai moment d'ouverture — le curseur se pose
                // au présent, comme si le fil avait été là dès le départ
                // (mesuré au simulateur le 2026-08-22 : sans cela, la Rivière
                // restait en haut de l'histoire, rang 0). Ensuite, le curseur
                // survit aux arrivées de messages, jamais recalé.
                //
                // Et quand le réseau PRÉFIXE l'histoire (le cache donnait 20
                // messages, le réseau en rend 200 plus anciens), chaque rang
                // glisse : le curseur reste sur son MESSAGE, pas sur son
                // ancien numéro, et le pane le recadre.
                let wasEmpty = geometry.rankCount == 0
                let previousCursor = navigation.cursor
                let cursorMessageId = geometry.bubbles.first { $0.rank == previousCursor.rank }?.messageId
                geometry = resolved
                navigation.updateGeometry(resolved)
                if wasEmpty {
                    navigation.moveTo(RiverConversationMapping.initialCursor(geometry: resolved))
                    landingToken += 1
                } else if let cursorMessageId,
                          let remapped = RiverConversationMapping.cursor(forMessageId: cursorMessageId, geometry: resolved),
                          remapped != previousCursor {
                    navigation.moveTo(remapped)
                    landingToken += 1
                }
            }
        // #3901 — le SEUL site qui sait, à l'instant où ça se produit, que le
        // curseur vient d'ATTEINDRE le présent (`isAtPresent`) : un pas
        // (`RiverNavigationController.step`), un atterrissage (`moveTo`, tap
        // sur une bulle) ou le recadrage ci-dessus peuvent tous y mener.
        // `initial: false` (par défaut) délibérément : la Rivière atterrit
        // déjà au présent à l'ouverture (`initialCursor`), et déclarer un
        // rattrapage sur ce seul atterrissage, avant toute lecture réelle,
        // reproduirait le sur-déclarement que ce correctif évite ailleurs —
        // un survol d'un instant qui repart aussitôt ne prouve rien.
        .adaptiveOnChange(of: navigation.cursor) { _, newCursor in
            guard RiverConversationMapping.isAtPresent(cursor: newCursor, geometry: geometry) else { return }
            onReachPresent?()
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
