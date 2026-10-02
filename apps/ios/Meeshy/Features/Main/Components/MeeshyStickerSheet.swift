import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La feuille de stickers du produit (#9189, #9190)

/// **Ce que l'auteur a choisi dans la feuille** — une famille par cas. La
/// destination décide de ce qu'elle en fait : l'ENVOYER (conversation) ou le
/// POSER (scène d'un post, d'un réel ou d'une story).
enum StickerSheetChoice {
    case emoji(String)
    case library(StoryStickerLibraryItem)
    case template(StickerTemplate, slots: [String: String])
    case locationTemplate(SharedPlace, StickerTemplate)
    case mee(MeeSticker)
    case instant(MeeInstant, slots: [MeeSlot: String])
    case packItem(StickerPack, StickerPackItem)
}

/// **La seule chose qui distingue une feuille d'une autre** : ce que devient
/// un choix, et l'apparence des gabarits (contournés de blanc là où ils
/// partent contournés — la conversation, #9060 ; nus sur une scène).
struct StickerSheetDestination {
    let diesCut: Bool
    let onChoice: (StickerSheetChoice) -> Void
}

/// **UNE feuille de stickers pour toutes les portes** (#9189, porteur
/// 2026-10-02 : « afficher la même feuille de sticker lors de l'appel des
/// stickers de composition de scène réel, story, post etc. ! On doit avoir un
/// seul composant ! »).
///
/// La conversation la montait avec tous ses injecteurs ; la scène du composer
/// la montait nue (ni Mee, ni Instants, ni « Mes stickers », détente moyenne
/// seule) ; l'atelier du SDK en montait une troisième. Les injecteurs vivent
/// désormais ICI, une fois : chaque destination reçoit les mêmes onglets, les
/// mêmes détentes, et un onglet par pack installé avec la Boutique (#9190).
///
/// Garde : `StickerSheetHasOneMountSiteTests` — `StickerPickerView(` ne se
/// monte nulle part ailleurs, app et SDK confondus.
struct MeeshyStickerSheet: View {
    let destination: StickerSheetDestination
    var accentColor: String = MeeshyColors.brandPrimaryHex
    @ObservedObject var packs: StickerPackStore = .shared

    var body: some View {
        let choose = destination.onChoice
        StickerPickerView(onStickerSelected: { choose(.emoji($0)) },
                          onLibraryStickerSelected: { choose(.library($0)) },
                          onTemplateSelected: { choose(.template($0, slots: $1)) },
                          onLocationTemplateSelected: { choose(.locationTemplate($0, $1)) })
            .storyPasteProvided()
            .storyStickerLibraryProvided()
            .stickerNearbyPlacesProvided()
            .stickerSheetDieCut(destination.diesCut)
            .meeStickersProvided { choose(.mee($0)) }
            .meeInstantsProvided { choose(.instant($0, slots: $1)) }
            .stickerPackShelfProvided(StickerPackShelf(
                installed: packs.installed,
                onPick: { choose(.packItem($0, $1)) },
                shop: { [packs] in AnyView(StickerPackShopScreen(store: packs)) }
            ))
            // « Ma position… » ouvre la carte (#7922) ; sans ce fournisseur, la
            // puce n'est pas rendue.
            .storyLocationPickerProvided(accentColor: accentColor)
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
            .task { await packs.loadInstalled() }
    }
}

/// La Boutique, branchée sur le magasin : la vue du SDK ne parle à aucun
/// service, celle-ci lui remet l'état optimiste et le geste.
struct StickerPackShopScreen: View {
    @ObservedObject var store: StickerPackStore

    var body: some View {
        StickerPackShopView(packs: store.state.catalogue,
                            pending: store.state.pending,
                            showsFailure: store.state.failed) { pack in
            Task { await store.toggle(pack) }
        }
        .task { await store.loadCatalogue() }
    }
}
