import SwiftUI
import MeeshySDK
import MeeshyUI

/// LA LISTE DE LA PREMIÈRE PAGE (#9564) — la ligne courte de Mee, UNE CARTE PAR CONCEPT servi, puis Carnet, Comment ça marche et Réglages. Elle remplace l'empilement d'avant (guide, héros,
/// jauges, missions, ligue, frappe, étagère, Flamme, portes) : chaque vue du jeu est rangée dans la fiche de son
/// concept, et cette liste ne porte AUCUN geste du jeu — seulement des touchers qui ouvrent une page.
///
/// Le bloc `game` reste la seule source : la liste ne calcule rien, elle lit `ProgressionConceptModel`. Devant un
/// ancien serveur (pas de bloc), les cartes d'avant restent — niveau, Meeshes, Flamme, Élans, badges, défis, succès.
/// Sous « Jeu masqué », la carte masquée REMPLACE la liste. Les cartes rebondissent au toucher et entrent en scène
/// une fois, l'une après l'autre.
struct ProgressionFrontList: View {
    @ObservedObject var viewModel: ProgressionViewModel
    @ObservedObject var guide: GameGuideSession
    @ObservedObject var photos: GamePhotoCoordinator
    let progress: EngagementProgress
    let onOpenConcept: (ProgressionConcept) -> Void
    let onOpenConversations: () -> Void
    /// Le carnet des règles, ouvert à la règle donnée (`nil` ⇒ en haut).
    let onOpenRules: (Int?) -> Void
    let onOpenNotebook: () -> Void
    /// Une page du jeu — ici, les réglages.
    let onOpenPage: (GamePage) -> Void

    @State private var showsFullGuide = false
    /// Les cartes sont entrées en scène. Gardé tant que la page vit : rien ne rejoue au retour d'une fiche.
    @State private var entered = false
    /// « Jeu masqué » et « Célébrations » : deux commodités PAR APPAREIL (#9481).
    @ObservedObject private var prefs = GameDevicePrefsStore.current()

    private var theme: ThemeManager { ThemeManager.shared }

    private var celebrates: Bool { prefs.prefs.celebrations }
    private var game: GameBlock? { viewModel.game }

    private var cardPhoto: PhotoMoment? {
        guard let game, let card = guide.card, card.photo else { return nil }
        if let moment = card.photoMoment { return moment }
        guard let key = GuideMomentKey(rawValue: card.key) else { return nil }
        return GamePhotoMoments.fromCard(key: key, game: game)
    }

    /// Les propositions de photo en attente, hors celle que la carte de Mee porte déjà.
    private var offers: [PhotoMoment] {
        guard game != nil, celebrates else { return [] }
        return photos.offers.filter { $0.id != cardPhoto?.id }
    }

    var body: some View {
        // « Jeu masqué » : la carte masquée REMPLACE la liste (#9481, #9564) — rien du jeu ne paraît autour.
        if prefs.prefs.hidden, viewModel.game != nil {
            GameHiddenCard(onSettings: { onOpenPage(.settings) })
        } else {
            list
        }
    }

    private var list: some View {
        let cards = ProgressionConceptModel.cards(progress: progress, game: game)
        return VStack(spacing: MeeshySpacing.md) {
            if game != nil, celebrates, let card = guide.card {
                ProgressionGuideLine(card: card, onOpen: { showsFullGuide = true })
            }
            ForEach(offers) { offer in
                ProgressionConceptRow(
                    title: ConceptText.photoOffer, subtitle: offer.title, symbol: "camera",
                    identifier: "game.photo.offer.\(offer.id)", action: { photos.start(offer) }
                )
            }
            ForEach(Array(cards.enumerated()), id: \.element.id) { index, card in
                ProgressionConceptCardView(card: card, game: game, entered: entered, onOpen: { onOpenConcept(card.concept) })
                    .modifier(GameStaggeredEntrance(index: index, entered: entered))
            }
            if game != nil {
                ProgressionConceptRow(
                    title: String(localized: "game.door.notebook", defaultValue: "Carnet de progression", bundle: .main),
                    symbol: "book.closed", identifier: "game.door.notebook", action: onOpenNotebook
                )
                ProgressionConceptRow(
                    title: String(localized: "game.door.rules", defaultValue: "Comment ça marche", bundle: .main),
                    symbol: "questionmark.circle", identifier: "game.door.rules", action: { onOpenRules(nil) }
                )
                ProgressionConceptRow(
                    title: GameText.doorSettings, symbol: "gearshape", identifier: "game.door.settings",
                    action: { onOpenPage(.settings) }
                )
            }
        }
        // L'entrée en scène se joue UNE fois, à la première apparition de la liste.
        .onAppear { entered = true }
        .fullScreenCover(item: Binding(get: { photos.active }, set: { if $0 == nil { photos.close() } })) { session in
            GamePhotoFlowView(session: session) { photos.close() }
        }
        .sheet(isPresented: $showsFullGuide) { fullGuide }
    }

    // MARK: - Le guide

    /// Le message ENTIER de Mee, ouvert par un toucher sur sa ligne : c'est là que vivent ses boutons.
    @ViewBuilder
    private var fullGuide: some View {
        if let card = guide.card {
            ScrollView {
                GameGuideCardView(
                    card: card.presenting(.full),
                    onAction: { showsFullGuide = false; act(on: card) },
                    onDismiss: { showsFullGuide = false; guide.dismiss() },
                    onSkipAll: card.step == nil ? nil : { showsFullGuide = false; guide.skipAll() },
                    onPhoto: cardPhoto.map { moment in { showsFullGuide = false; photos.start(moment) } }
                )
                .padding(MeeshySpacing.lg)
            }
            .background(theme.backgroundGradient.ignoresSafeArea())
        }
    }

    /// Le bouton d'une carte mène où la loi le dit (`GameGuideTarget`) : ouvrir la FICHE du concept visé — au
    /// deuxième niveau, jamais une sous-page sautée par-dessus sa fiche (carte de navigation, #9564) —, la liste des
    /// conversations, ou la photo.
    private func act(on card: GuideCard) {
        if let page = card.wave2Page {
            guide.dismiss()
            onOpenConcept(GameNavigationMap.guideConcept(for: page))
            return
        }
        let target = GameGuideTarget.target(for: card.action)
        let moment: PhotoMoment? = card.action == .takeStartPhoto ? GamePhotoMoments.start() : cardPhoto
        guide.dismiss()
        switch target {
        case .scroll(let anchor): onOpenConcept(ProgressionConceptModel.concept(for: anchor))
        case .conversations: onOpenConversations()
        case .badges: onOpenConcept(.badges)
        case .photo: if let moment { photos.start(moment) }
        }
    }
}
