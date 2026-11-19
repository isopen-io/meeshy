import SwiftUI
import MeeshySDK

// MARK: - Une action de relation ratée sur la fiche (#19611, planche `Etat-Erreur` vue 2)
//
// Accepter, refuser, annuler ou renvoyer une demande : la mutation est optimiste, son échec remet le bouton comme avant
// (`ProfileConnectionActions`) et la carte le DIT, avec « Réessayer », qui rejoue la même mutation. L'échec d'une
// nouvelle demande vit dans `ProfileFriendRequestCard` (étape `.unsent`).

/// Une mutation de la demande en cours, rejouable telle quelle. `resend` commence par retirer l'ancienne demande : sa
/// mutation optimiste est ce retrait, et c'est lui qui peut rater.
nonisolated enum ProfileRelationMutation: Equatable, Sendable, CaseIterable {
    case accept
    case decline
    case cancel
    case resend

    /// La note ne reste que sur l'étape où l'action a raté : une demande qui a changé d'étape entre-temps (acceptée
    /// ailleurs, retirée) ne garde pas l'échec d'avant.
    func isShown(on stage: ProfileRequestStage) -> Bool {
        switch (self, stage) {
        case (.accept, .received), (.decline, .received), (.cancel, .sent), (.resend, .sent): return true
        default: return false
        }
    }
}

extension ProfileConnectionActions {

    /// Joue la mutation : instantané, local, réseau, retour arrière. `false` quand le réseau l'a refusée.
    func perform(_ mutation: ProfileRelationMutation, requestId: String, userId: String,
                 afterOptimistic: () -> Void) async -> Bool {
        switch mutation {
        case .accept:
            return await acceptRequest(requestId: requestId, senderId: userId, afterOptimistic: afterOptimistic)
        case .decline:
            return await declineRequest(requestId: requestId, senderId: userId, afterOptimistic: afterOptimistic)
        case .cancel, .resend:
            return await cancelRequest(requestId: requestId, userId: userId, afterOptimistic: afterOptimistic)
        }
    }
}

/// Les mots d'une action ratée. Isolé au MainActor comme `Bundle.module` dans MeeshyUI.
enum ProfileRelationFailureCopy {

    static func title(of mutation: ProfileRelationMutation) -> String {
        switch mutation {
        case .accept:
            return String(localized: "profile.relation.failure.accept.title",
                          defaultValue: "Ton acceptation n'est pas partie", bundle: .module)
        case .decline:
            return String(localized: "profile.relation.failure.decline.title",
                          defaultValue: "Ton refus n'est pas parti", bundle: .module)
        case .cancel:
            return String(localized: "profile.relation.failure.cancel.title",
                          defaultValue: "Ta demande n'a pas été annulée", bundle: .module)
        case .resend:
            return String(localized: "profile.relation.failure.resend.title",
                          defaultValue: "Ta demande n'a pas été renvoyée", bundle: .module)
        }
    }

    static func consequence(of mutation: ProfileRelationMutation) -> String {
        switch mutation {
        case .accept, .decline:
            return String(localized: "profile.relation.failure.unchanged",
                          defaultValue: "Rien n'a été envoyé. Les boutons sont revenus comme avant.", bundle: .module)
        case .cancel, .resend:
            return String(localized: "profile.relation.failure.cancel.consequence",
                          defaultValue: "Rien n'a changé : ta demande attend toujours sa réponse.", bundle: .module)
        }
    }

    static var retry: String {
        String(localized: "profile.relation.request.unsent.retry", defaultValue: "Réessayer", bundle: .module)
    }
}

/// La note posée sous la carte (K46, sens `warn`, annoncée) : ce qui n'est pas parti, que rien n'a changé, et
/// « Réessayer » (K40, cible 44).
struct ProfileRelationFailureNote: View {
    let mutation: ProfileRelationMutation
    let onRetry: () -> Void

    var body: some View {
        MeeshyNote(
            ProfileRelationFailureCopy.title(of: mutation),
            form: .band,
            kind: .warn,
            detail: ProfileRelationFailureCopy.consequence(of: mutation),
            announces: true
        ) {
            MeeshyButton(
                ProfileRelationFailureCopy.retry,
                systemImage: "arrow.clockwise",
                kind: .outline,
                size: .s44,
                action: onRetry
            )
            .accessibilityIdentifier("profile.relation.failure.retry")
        }
        .accessibilityIdentifier("profile.relation.failure")
    }
}

/// L'emplacement de la note sous la carte : rien tant qu'aucune action n'a raté sur l'étape montrée.
struct ProfileRelationFailureSlot: View {
    let failure: ProfileRelationMutation?
    let stage: ProfileRequestStage
    let onRetry: (ProfileRelationMutation) -> Void

    var body: some View {
        if let failure, failure.isShown(on: stage) {
            ProfileRelationFailureNote(mutation: failure) { onRetry(failure) }
                .padding(.top, MeeshySpacing.md)
        }
    }
}
