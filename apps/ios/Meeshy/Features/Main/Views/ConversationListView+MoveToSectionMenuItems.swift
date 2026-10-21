import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le catalogue « Déplacer vers… », écrit UNE fois.
///
/// Deux `Menu` natifs le consomment : le sous-menu du menu contextuel de la
/// rangée (ci-dessous) et l'encoche de catégorie de la carte de focus
/// (`LentilleFocusCard`, réintroduite le 2026-08-22). Un second catalogue
/// divergerait sur les deux conventions qui ne se voient pas : `""` signifie
/// « aucune catégorie » (= « Mes conversations ») côté view model, et toucher
/// la catégorie COURANTE l'en retire au lieu de la ré-appliquer.
///
/// Le retour haptique appartient au point d'appel, pas au catalogue : la
/// carte de focus le déclenche déjà dans la fermeture que la liste lui câble,
/// et un second appel ici doublerait la vibration.
///
/// Hors périmètre : le panneau custom < iOS 26 (`ConversationContextMenuView
/// .movePanel`) dessine des `actionRow` maison, pas des items de `Menu` — une
/// autre primitive de rendu pour la même action de view model.
struct ConversationMoveToSectionMenuItems: View {

    let categories: [ConversationSection]
    let currentSectionId: String?
    let onMove: (String) -> Void

    var body: some View {
        ForEach(categories) { category in
            let isCurrentCategory = currentSectionId == category.id
            Button {
                onMove(isCurrentCategory ? "" : category.id)
            } label: {
                if isCurrentCategory {
                    Label("\(category.name) \u{2713}", systemImage: category.icon)
                } else {
                    Label(category.name, systemImage: category.icon)
                }
            }
        }
        if !categories.isEmpty {
            Divider()
        }
        Button {
            onMove("")
        } label: {
            Label(
                String(localized: "context.my_conversations", defaultValue: "Mes conversations", bundle: .main),
                systemImage: "tray.fill"
            )
        }
    }
}
