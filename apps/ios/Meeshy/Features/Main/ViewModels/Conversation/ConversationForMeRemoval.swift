import Foundation
import MeeshySDK

// MARK: - « Supprimer pour moi » (#11221) — ce qui part, et comment l'écran le montre

/// Un message que « Supprimer pour moi » retire de la vue du lecteur : son id
/// d'affichage (la projection du fil, la base) et son id serveur (la requête).
nonisolated struct ForMeTarget: Equatable, Sendable {
    let messageId: String
    let serverId: String
}

/// Les deux gestes de la projection du fil, que le handler COMMANDE sans la
/// posséder : cacher avant la réponse, rendre au refus.
struct ForMeProjection {
    let conceal: ([String]) -> Void
    let reveal: @MainActor ([String]) async -> Void
}

/// **Le retrait optimiste se fait dans la PROJECTION du fil, jamais en base.**
/// La ligne GRDB, ses traductions, ses transcriptions et son outbox restent
/// intactes jusqu'à l'accord du serveur : un refus lève le filtre et la base
/// rend le message — aucune relecture réseau, qui pourrait échouer à son tour
/// et perdre un message encore visible partout ailleurs. Un id vaut pour la
/// ligne qu'il désigne, par son id local comme par son id serveur.
nonisolated struct PersonalConcealment: Equatable, Sendable {
    private(set) var ids: Set<String> = []

    mutating func conceal(_ ids: [String]) {
        self.ids.formUnion(ids)
    }

    mutating func reveal(_ ids: [String]) {
        self.ids.subtract(ids)
    }

    func conceals(_ record: MessageRecord) -> Bool {
        ids.contains(record.localId) || record.serverId.map(ids.contains) == true
    }
}

/// **« Supprimer pour moi » sur une SÉLECTION** : un envoi raté n'a pas d'id
/// serveur et se retire localement ; un message que la loi n'admet pas (envoi
/// en cours, invité, ancien membre) reste ; le reste part en UNE requête.
nonisolated struct ForMeSelectionPlan: Equatable {
    let unsent: [String]
    let targets: [ForMeTarget]

    var isEmpty: Bool { unsent.isEmpty && targets.isEmpty }

    static func make(
        selected: [Message],
        isUnsent: (String) -> Bool,
        admits: (Message) -> Bool,
        serverId: (String) -> String
    ) -> ForMeSelectionPlan {
        ForMeSelectionPlan(
            unsent: selected.filter { isUnsent($0.id) }.map(\.id),
            targets: selected.filter { !isUnsent($0.id) && admits($0) }
                .map { ForMeTarget(messageId: $0.id, serverId: serverId($0.id)) }
        )
    }
}

/// **Le pont entre le view-model et le handler** : la projection du fil se
/// commande ici, et la sélection se planifie ici — hors du view-model, une
/// responsabilité, un type (comme `ConversationSelectionRemoval`).
@MainActor
struct ConversationForMeRemoval {
    let viewModel: ConversationViewModel

    var projection: ForMeProjection {
        let viewModel = viewModel
        return ForMeProjection(
            conceal: { ids in
                let gone = Set(ids)
                viewModel.messages.removeAll { gone.contains($0.id) }
                viewModel.messageStore.conceal(ids)
            },
            reveal: { await viewModel.messageStore.reveal($0) }
        )
    }

    /// Un message : la cible porte l'id affiché ET l'id serveur.
    func run(_ messageId: String) async -> ConversationCommandFailure? {
        let target = ForMeTarget(messageId: messageId, serverId: viewModel.serverId(for: messageId))
        return await viewModel.commands.deleteForMe([target], projection: projection)
    }

    /// Ce que « pour moi » ferait de la sélection : chaque message passe par
    /// le verdict de la loi (`canDeleteForMe` — compte inscrit, message
    /// envoyé), un envoi raté se retire localement.
    func plan(_ ids: Set<String>, authority: ConversationMenuAuthority) -> ForMeSelectionPlan {
        let viewModel = viewModel
        return ForMeSelectionPlan.make(
            selected: viewModel.messages.filter { ids.contains($0.id) },
            isUnsent: { viewModel.outgoingState(of: $0)?.isFailed == true },
            admits: { MessageMenuContext.make(message: $0, viewModel: viewModel, authority: authority).canDeleteForMe },
            serverId: { viewModel.serverId(for: $0) }
        )
    }

    /// La sélection : les envois ratés se retirent localement, le reste admis
    /// part en une requête, et un refus se dit une fois.
    func runSelection(_ ids: Set<String>, authority: ConversationMenuAuthority) async {
        let selection = plan(ids, authority: authority)
        for id in selection.unsent {
            await viewModel.commands.withdrawUnsent(messageId: id)
            viewModel.removeFailedMessage(messageId: id)
        }
        if let failure = await viewModel.commands.deleteForMe(selection.targets, projection: projection) {
            viewModel.error = failure.userMessage
        }
    }
}
