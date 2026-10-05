import SwiftUI
import MeeshySDK
import MeeshyUI

/// LE JEU SUR « PROGRESSION » (#9383, #9379, #9382) — la carte de Mee et Meo
/// au-dessus des jauges, l'en-tête aux quatre jauges, puis les missions et le
/// coffre, l'aperçu de frappe, la Flamme à protéger, et les deux portes (« Comment
/// ça marche », « Carnet de progression »). La séquence est celle de la planche
/// (conception, partie VII) : l'écran existant s'enrichit EN HAUT, ses portes
/// (Badges, Défis, Succès) restent en dessous. Miroir de
/// `apps/web/src/routes/progression-game.tsx` et `progression-lead.tsx`.
///
/// Le bloc `game` est la seule source : cette vue ne calcule ni niveau, ni rang,
/// ni prix. Elle distribue ce que `ProgressionViewModel` pilote (retour
/// instantané, restauration sur échec). Elle n'est montée QUE si la passerelle
/// sert le bloc : devant un ancien serveur, l'écran d'avant reste intact.
struct GameSection: View {
    @ObservedObject var viewModel: ProgressionViewModel
    @ObservedObject var guide: GameGuideSession
    @ObservedObject var photos: GamePhotoCoordinator
    let game: GameBlock
    let onScrollTo: (GameAnchor) -> Void
    let onOpenConversations: () -> Void
    let onOpenBadges: () -> Void
    /// Le carnet des règles, ouvert à la règle donnée (`nil` ⇒ en haut).
    let onOpenRules: (Int?) -> Void
    let onOpenNotebook: () -> Void

    @State private var showsFullGuide = false

    private var theme: ThemeManager { ThemeManager.shared }

    private var cardPhoto: PhotoMoment? {
        guard let card = guide.card, card.photo else { return nil }
        guard let key = GuideMomentKey(rawValue: card.key) else { return nil }
        return GamePhotoMoments.fromCard(key: key, game: game)
    }

    var body: some View {
        VStack(spacing: MeeshySpacing.xl) {
            guideCard
            ForEach(photos.offers.filter { $0.id != cardPhoto?.id }) { offer in
                GamePhotoOfferView(moment: offer, onStart: { photos.start($0) }, onLater: { photos.later($0) })
            }
            // LE HÉRO (#5841) : où j'en suis, comment je gagne, comment je frappe — pleine largeur.
            // Mee se pose dans son coin avec la ligne COURTE du guide ; la version complète s'ouvre au toucher.
            GameHeroView(
                game: game,
                cornerFigure: cornerLine == nil ? nil : cornerFigure,
                cornerLine: cornerLine,
                online: viewModel.isOnline,
                minting: viewModel.isMinting,
                settled: viewModel.isSettled,
                onMint: { Task { await viewModel.mint() } },
                onOpenRule: { onOpenRules($0) },
                onOpenGuide: { showsFullGuide = true }
            )
            GameGaugesView(game: game)
            GameMissionsView(
                game: game, online: viewModel.isOnline, pendingRerollId: viewModel.pending.rerollMissionId,
                chestOpening: viewModel.pending.chest, errors: viewModel.gameErrors,
                onReroll: { id in Task { await viewModel.reroll(missionId: id) } },
                onClaim: { Task { await viewModel.claimChest() } }
            )
            GameMintPreviewView(
                game: game, badgesLost: viewModel.mintBadgeImpact?.lost, online: viewModel.isOnline,
                minting: viewModel.isMinting, error: viewModel.mintError,
                celebration: viewModel.celebration, onMint: { Task { await viewModel.mint() } }
            )
            GameBadgeShelfView(items: viewModel.progress.map(GameBadges.items(for:)) ?? [])
            GameFlamePanelView(
                game: game, online: viewModel.isOnline, buyingFreeze: viewModel.pending.freeze,
                relighting: viewModel.pending.relight, errors: viewModel.gameErrors,
                onBuyFreeze: { Task { await viewModel.buyFreeze() } },
                onRelight: { Task { await viewModel.relight() } }
            )
            door(String(localized: "game.door.rules", defaultValue: "Comment ça marche", bundle: .main), symbol: "questionmark.circle", id: "game.door.rules", action: { onOpenRules(nil) })
            door(String(localized: "game.door.notebook", defaultValue: "Carnet de progression", bundle: .main), symbol: "book.closed", id: "game.door.notebook", action: onOpenNotebook)
        }
        .fullScreenCover(item: Binding(get: { photos.active }, set: { if $0 == nil { photos.close() } })) { session in
            GamePhotoFlowView(session: session) { photos.close() }
        }
        .sheet(isPresented: $showsFullGuide) { fullGuide }
    }

    // MARK: - Le guide

    /// La ligne COURTE que Mee dit dans le coin du héro ; `nil` quand la carte doit s'afficher en entier.
    private var cornerLine: String? { GameHero.cornerLine(for: guide.card) }

    private var cornerFigure: String {
        guide.card.flatMap { GameGuideCard.figures(speaker: $0.speaker, mood: $0.mood).meeFilmID } ?? "mee-sourire"
    }

    /// La version complète, ouverte par un toucher sur Mee : mêmes boutons que la carte.
    @ViewBuilder
    private var fullGuide: some View {
        if let card = guide.card {
            ScrollView {
                GameGuideCardView(
                    card: card.presenting(.full),
                    onAction: { showsFullGuide = false; act(on: card) },
                    onDismiss: { showsFullGuide = false; guide.dismiss() },
                    onSkipAll: nil,
                    onPhoto: cardPhoto.map { moment in { showsFullGuide = false; photos.start(moment) } }
                )
                .padding(MeeshySpacing.lg)
            }
            .background(theme.backgroundGradient.ignoresSafeArea())
        }
    }

    /// La carte entière : première fois, étape d'intégration. Quand le coin du héro dit la ligne
    /// courte, la carte ne se répète pas au-dessus.
    @ViewBuilder
    private var guideCard: some View {
        if let card = guide.card, cornerLine == nil {
            GameGuideCardView(
                card: card,
                onAction: { act(on: card) },
                onDismiss: { guide.dismiss() },
                onSkipAll: card.step == nil ? nil : { guide.skipAll() },
                onPhoto: cardPhoto.map { moment in { photos.start(moment) } }
            )
            .id(card.key)
        }
    }

    /// Le bouton d'une carte mène où la loi le dit (`GameGuideTarget`) : défiler jusqu'à
    /// la carte visée, ouvrir une autre page, ou ouvrir la photo.
    private func act(on card: GuideCard) {
        let target = GameGuideTarget.target(for: card.action)
        let moment: PhotoMoment? = card.action == .takeStartPhoto ? GamePhotoMoments.start() : cardPhoto
        guide.dismiss()
        switch target {
        case .scroll(let anchor): onScrollTo(anchor)
        case .conversations: onOpenConversations()
        case .badges: onOpenBadges()
        case .photo: if let moment { photos.start(moment) }
        }
    }

    private func door(_ title: String, symbol: String, id: String, action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: symbol)
                Text(title)
            }
            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
            .foregroundColor(MeeshyColors.brandPrimary)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(theme.backgroundSecondary))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }
}
