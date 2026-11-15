import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Section Frame Registry

/// Boîte mutable INERTE : les GeometryReader des headers de section y écrivent
/// leur frame globale à chaque layout (scroll compris) sans déclencher
/// d'invalidation SwiftUI — une @State [String: CGRect] re-évaluerait la liste
/// à chaque tick. Le morph drag de l'overlay (+Overlays) hit-teste le doigt
/// contre ces frames pour surligner puis résoudre la section de drop.
final class SectionFrameRegistry {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    var frames: [String: CGRect] = [:]
}

// MARK: - Glisser d'une conversation

/// Le glisser d'une conversation en cours : son jeton et la catégorie d'où il part.
struct PendingConversationDrag {
    let token: UUID
    let originSectionId: String?
}

/// Posé sur toute la liste : le premier passage d'un glisser au-dessus d'elle déclenche le repli des catégories.
/// Il n'accepte jamais de dépôt — les en-têtes de catégorie, plus profonds, le reçoivent ; lâché ailleurs, le
/// glisser s'annule.
struct ConversationListDragWatch: DropDelegate {
    let onEnter: () -> Void

    func validateDrop(info: DropInfo) -> Bool { info.hasItemsConforming(to: [.text]) }
    func dropEntered(info: DropInfo) { onEnter() }
    func dropUpdated(info: DropInfo) -> DropProposal? { DropProposal(operation: .cancel) }
    func performDrop(info: DropInfo) -> Bool { false }
}

// MARK: - Section Drop Delegate

/// Cible de drop d'un header de section pour le drag NATIF des lignes
/// (`.onDrag`, chemin iOS 26). Le delegate ne fait que l'affordance et le
/// forwarding — la DÉCISION (pin par drop sur « Épingles », « other » → "",
/// no-op même section) appartient à `handleDrop` via `ChipDropResolver`,
/// même sémantique que le drop de la chip du morph custom < iOS 26.
/// « Épingles » est une cible VALIDE (parité chip : drop = épingler ; le
/// retrait reste l'action dédiée du menu — jamais de dés-épinglage par drop).
struct SectionDropDelegate: DropDelegate {
    let sectionId: String
    /// `false` pour une section CALCULÉE par la loi Lentille (`EN DIRECT`,
    /// `AUJOURD'HUI`…) : sa borne vient de `lastMessageAt`, elle n'est pas
    /// assignable, et `ChipDropResolver` traduirait son id en
    /// `moveToSection(sectionId:)` — soit une catégorie fantôme dans l'état
    /// utilisateur. Le refus vit ICI, dans `validateDrop` : SwiftUI n'appelle
    /// alors ni `dropEntered` (pas de surbrillance, pas d'haptique) ni
    /// `performDrop`. Défaut `true` ⇒ chemin d'aujourd'hui (drapeau OFF,
    /// `pinned`, catégories utilisateur, `other`) strictement inchangé.
    var acceptsDrop: Bool = true
    @Binding var dropTargetSection: String?
    let onDrop: ([NSItemProvider]) -> Bool

    func validateDrop(info: DropInfo) -> Bool {
        acceptsDrop && info.hasItemsConforming(to: [.text])
    }

    func dropEntered(info: DropInfo) {
        withAnimation(.spring(response: 0.2, dampingFraction: 0.8)) {
            dropTargetSection = sectionId
        }
        HapticFeedback.light()
    }

    func dropExited(info: DropInfo) {
        withAnimation(.spring(response: 0.2, dampingFraction: 0.8)) {
            if dropTargetSection == sectionId {
                dropTargetSection = nil
            }
        }
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: .move)
    }

    func performDrop(info: DropInfo) -> Bool {
        onDrop(info.itemProviders(for: [.text]))
    }
}

// MARK: - Drop d'une conversation sur une section

/// Ce que le drag NATIF d'une conversation (`.onDrag`, chemin iOS 26) fait une
/// fois lâché sur un en-tête de section : l'id de la conversation voyage dans
/// le `NSItemProvider`, la décision revient à `ChipDropResolver` — « Épingles »
/// épingle (jamais de dés-épinglage par drop), « other » → sectionId vide,
/// no-op même section. Rend `false` quand le dépôt ne porte rien.
enum ConversationSectionDropHandler {
    static func resolve(
        _ providers: [NSItemProvider],
        onto sectionId: String,
        viewModel: ConversationListViewModel
    ) -> Bool {
        guard let provider = providers.first else { return false }
        _ = provider.loadObject(ofClass: NSString.self) { object, _ in
            guard let conversationId = object as? String else { return }
            Task { @MainActor in
                guard let conversation = viewModel.conversations
                    .first(where: { $0.id == conversationId }) else { return }
                switch ChipDropResolver.action(
                    droppedOn: sectionId,
                    isPinned: conversation.userState.isPinned,
                    currentSectionId: conversation.userState.sectionId ?? ""
                ) {
                case .none:
                    return
                case .pin:
                    HapticFeedback.success()
                    await viewModel.togglePin(for: conversation.id)
                case .move(let targetId):
                    HapticFeedback.success()
                    viewModel.moveToSection(conversationId: conversation.id, sectionId: targetId)
                }
            }
        }
        return true
    }
}
