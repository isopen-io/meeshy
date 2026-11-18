import Foundation
import MeeshySDK

/// Le mot d'une demande reçue, tel que mon Prisme le sert (planche `Etat-Demande` étape 3, #19460) : l'original, et la
/// traduction que la descente élit. La descente parcourt mes langues DANS L'ORDRE ; la première servie gagne — par une
/// traduction, ou parce que le mot est déjà écrit dedans (alors l'original, sans marque). Sans langue d'origine servie,
/// on ne sait pas où l'original concourt : il se sert tel quel.
nonisolated struct ProfileReceivedNote: Equatable, Sendable {
    nonisolated struct Translation: Equatable, Sendable {
        let originalLanguage: String
        let language: String
        let text: String
    }

    let original: String
    let translation: Translation?

    init(original: String, translation: Translation? = nil) {
        self.original = original
        self.translation = translation
    }

    /// Le texte lu : la traduction servie, ou l'original quand le lecteur l'a demandé ou qu'aucune n'est servie.
    func text(showingOriginal: Bool) -> String {
        guard !showingOriginal, let translation else { return original }
        return translation.text
    }

    static func resolve(_ request: FriendRequest, prism: [String]) -> ProfileReceivedNote? {
        let original = request.message?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !original.isEmpty else { return nil }
        return ProfileReceivedNote(original: original, translation: translation(of: request, prism: prism))
    }

    private static func translation(of request: FriendRequest, prism: [String]) -> Translation? {
        let source = request.messageOriginalLanguage?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        guard !source.isEmpty else { return nil }
        let texts = request.noteTranslations
        let served = prism
            .map { $0.lowercased() }
            .first { $0 == source || texts[$0] != nil }
        guard let served, served != source, let text = texts[served] else { return nil }
        return Translation(originalLanguage: source, language: served, text: text)
    }
}
