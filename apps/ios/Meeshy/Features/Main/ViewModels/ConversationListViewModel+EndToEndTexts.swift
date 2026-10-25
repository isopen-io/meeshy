import Combine
import Foundation
import MeeshySDK

// La ligne de liste d'une conversation chiffrée lit le clair local de son
// dernier message (#12968) : relu quand la liste change, et quand libsignal
// ouvre une enveloppe. Une seule lecture en vol ; la plus récente gagne.
extension ConversationListViewModel {

    func observeEndToEndTexts() {
        $conversations
            .debounce(for: .milliseconds(16), scheduler: DispatchQueue.main)
            .sink { [weak self] conversations in self?.refreshEndToEndTexts(conversations) }
            .store(in: &cancellables)
        endToEnd.opened
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                guard let self else { return }
                self.refreshEndToEndTexts(self.conversations)
            }
            .store(in: &cancellables)
    }

    func refreshEndToEndTexts(_ conversations: [Conversation]) {
        let known = endToEndTexts
        let endToEnd = endToEnd
        endToEndTextsTask?.cancel()
        endToEndTextsTask = Task { [weak self] in
            let texts = await ConversationListEndToEndTexts.resolve(conversations, known: known, from: endToEnd)
            guard !Task.isCancelled, let self, self.endToEndTexts != texts else { return }
            self.endToEndTexts = texts
        }
    }
}
