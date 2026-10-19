import Foundation
import Combine

// #10927 — extrait de `ConversationListViewModel.swift`, hors budget : la
// réparation d'une liste en échec quand le serveur revient vit ici.

extension ConversationListViewModel {

    /// Une liste tombée en échec au démarrage (`loadFailed`, cache vide) restait
    /// sur « Réessayer » alors que le socket se connectait quelques secondes
    /// après — la preuve que serveur et session répondent. Sur chaque FRONT
    /// MONTANT de la connexion, elle relance `forceRefresh()` d'elle-même.
    /// Rester connecté ne relance rien ; une liste qui n'a pas échoué non plus.
    func repairsFailedLoadOnReconnect(_ isConnected: AnyPublisher<Bool, Never>) -> AnyCancellable {
        isConnected
            .removeDuplicates()
            .scan((was: false, now: false)) { previous, now in (was: previous.now, now: now) }
            .filter { !$0.was && $0.now }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self, self.loadFailed, !self.isLoading else { return }
                Task { @MainActor [weak self] in await self?.forceRefresh() }
            }
    }
}
