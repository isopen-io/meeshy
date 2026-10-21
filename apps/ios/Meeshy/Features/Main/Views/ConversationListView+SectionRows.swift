import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Rangs d'une section

/// Les rangs d'UNE section : la pile paresseuse, ses modificateurs de
/// Lentille (perspective, respiration, candidature à la focus card) et la
/// transition de pliage. Le rang lui-même (`ConversationRowItem`) reste
/// assemblé par la liste, qui le passe en fermeture ; l'`onAppear` des rangs
/// — pagination, libellé de pilule — lui est rendu par `onRowAppear`.
struct ConversationListSectionRows<Row: View>: View {
    let conversations: [Conversation]
    let isVisible: Bool
    let listWidth: CGFloat
    let focusCandidateRegistry: LentilleFocusCandidateRegistry
    let onRowAppear: (Conversation) -> Void
    let row: (Conversation, CGFloat) -> Row
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    @ViewBuilder
    var body: some View {
        // Section Content — always visible when no categories, otherwise animated expand/collapse
        if isVisible {
            rows
                // **Le jeton, jamais un littéral** (retour produit 2026-08-22 :
                // « la liste de conversation semble décalée »). Ce `16` en dur
                // mettait les rangées à 16 pt du bord quand la cote de design
                // dit 8 (`list.row.marginHorizontal`,
                // `LentilleMetrics.Row.marginHorizontal`) — celle que lisent
                // la carte de focus qui les magnifie et le rail. Les rangées
                // étaient donc décalées de 8 pt par rapport à tout ce qui les
                // encadre : c'est ce décalage-là que l'œil voyait.
                .padding(.horizontal, LentilleMetrics.Row.marginHorizontal)
                .transition(.asymmetric(
                    insertion: .opacity.combined(with: .scale(scale: 0.95, anchor: .top)).combined(with: .offset(y: -8)),
                    removal: .opacity.combined(with: .scale(scale: 0.98, anchor: .top))
                ))
        }
    }

    @ViewBuilder
    private var rows: some View {
        // Depuis la colonne MESURÉE (`listColumnSize`) — redimensionnable sur iPad —, la fenêtre en repli.
        let rowWidth = ConversationRowWidthLaw.textWidth(
            listWidth: listWidth, windowWidth: DeviceLayout.windowSize.width,
            isRegular: horizontalSizeClass == .regular)
        // Drapeau résolu UNE fois par section, jamais par rang : `LentilleFeatureFlag`
        // relit `ProcessInfo.environment` (et réalloue donc son dictionnaire) à chaque
        // appel — même règle que `tracksVisibleSection` (I-063bis), un cran plus bas
        // puisque c'est ici que le rang se construit. Sous OFF, `false` fait rendre le
        // rang NU : aucun modificateur de Lentille monté (contrat LWS-8/I-069).
        let perspectiveEnabled = LentilleFeatureFlag.isLentilleListEnabled
        LazyVStack(spacing: MeeshySpacing.xsPlus) {
            ForEach(conversations, id: \.id) { conversation in
                row(conversation, rowWidth)
                    // Passe de compositor (§4.1) : opacité et échelle SEULES, sur la
                    // courbe `.list` du miroir gelé. Posée AU-DESSUS du portillon
                    // `.equatable()` du rang — elle ne rediffuse rien, elle repeint.
                    .lentillePerspective(isEnabled: perspectiveEnabled)
                    // Respiration (2026-08-22) : les voisines de la rangée élue
                    // s'écartent pendant la scène — translation seule.
                    .lentilleFocusBreathing(isEnabled: perspectiveEnabled)
                    // Candidature à la focus card : le rang publie son milieu dans
                    // une boîte INERTE. Écrire n'élit rien — seul un tick de
                    // défilement déclenche l'élection (§4.2).
                    .lentilleFocusCandidate(id: conversation.id, registry: focusCandidateRegistry, isEnabled: perspectiveEnabled)
                    .onAppear {
                        // Libellé de la pilule de section — porté par le hook
                        // qui existe DÉJÀ sur ce rang, jamais par une sonde
                        // neuve. `nil` sous drapeau OFF : rien ne s'exécute.
                        onRowAppear(conversation)
                    }
            }
        }
    
    }
}
