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
    let onOpenRules: () -> Void
    let onOpenNotebook: () -> Void

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
            GameFlamePanelView(
                game: game, online: viewModel.isOnline, buyingFreeze: viewModel.pending.freeze,
                relighting: viewModel.pending.relight, errors: viewModel.gameErrors,
                onBuyFreeze: { Task { await viewModel.buyFreeze() } },
                onRelight: { Task { await viewModel.relight() } }
            )
            door(String(localized: "game.door.rules", defaultValue: "Comment ça marche", bundle: .main), symbol: "questionmark.circle", id: "game.door.rules", action: onOpenRules)
            door(String(localized: "game.door.notebook", defaultValue: "Carnet de progression", bundle: .main), symbol: "book.closed", id: "game.door.notebook", action: onOpenNotebook)
        }
        .fullScreenCover(item: Binding(get: { photos.active }, set: { if $0 == nil { photos.close() } })) { session in
            GamePhotoFlowView(session: session) { photos.close() }
        }
    }

    // MARK: - Le guide

    @ViewBuilder
    private var guideCard: some View {
        if let card = guide.card {
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
