import Foundation

/// Ce que l'extension a LU du fichier miroir des conversations verrouillées.
nonisolated enum NSELockMirrorRead: Equatable, Sendable {
    /// Le fichier s'est ouvert et décodé : c'est le jeu COMPLET des verrous.
    case ids([String])
    /// Le fichier existe peut-être mais ne s'ouvre pas (avant le premier
    /// déverrouillage), ou ne se décode pas : l'extension ne sait pas.
    case unreadable
    /// Le fichier n'existe pas : aucune version de l'app ne l'a encore écrit.
    case absent

    /// Les verrous que la lecture a DITS ; aucun quand elle n'a rien dit.
    var lockedIds: [String] {
        guard case .ids(let ids) = self else { return [] }
        return ids
    }
}

/// **Le miroir des conversations verrouillées par PIN, que l'app écrit et que
/// l'extension de notification lit** (#11387, #12655).
///
/// ## Un fichier, parce que le signal et la donnée doivent être UNE lecture
///
/// Le miroir vivait sous une clé du domaine `UserDefaults` du groupe d'apps.
/// Avant le premier déverrouillage, `cfprefsd` rend ce domaine VIDE sans le
/// dire, et une clé absente ne distinguait plus « aucun verrou » de « domaine
/// illisible ». Ouvrir le plist du domaine pour le savoir était une seconde
/// lecture, faite APRÈS la première : un déverrouillage entre les deux rendait
/// « ouverte » une conversation sous PIN, et le cache `CFPreferences` d'un
/// processus d'extension réutilisé pouvait encore servir le domaine vide d'avant.
/// L'app ayant `NSFileProtectionComplete` par défaut, le plist pouvait en outre
/// devenir illisible dès l'écran verrouillé, scellant TOUTES les bannières.
///
/// Le fichier miroir porte donc lui-même son signal : il s'ouvre et se décode
/// (le jeu des verrous), il ne s'ouvre pas (inconnu, fail-closed), ou il
/// n'existe pas (transition). L'app l'écrit avec
/// `completeFileProtectionUntilFirstUserAuthentication`, comme les dépôts du
/// groupe d'apps (`NSEDataSync`) : il reste lisible écran verrouillé, une fois
/// le premier déverrouillage passé.
///
/// ## La transition (#9223)
///
/// Une version antérieure de l'app n'écrit QUE la clé `UserDefaults`. Fichier
/// absent ⇒ l'extension lit cette clé : une liste lue fait foi, une clé
/// absente laisse le verrou inconnu. La clé reste écrite par cette version, et
/// lue à chaque bannière : elle ne peut qu'AJOUTER un verrou, jamais en retirer.
///
/// Ce fichier n'importe QUE Foundation : il est compilé dans l'extension, dans
/// l'app (qui l'écrit) et dans `MeeshyTests` (cf. `project.yml`).
nonisolated enum NSELockedConversationMirror {

    /// La clé `UserDefaults` du groupe d'apps, lue par les versions antérieures
    /// de l'extension et gardée en renfort.
    static let legacyDefaultsKey = "locked_conversation_ids"

    static let fileName = "locked_conversation_ids.json"

    static func fileURL(inContainer containerURL: URL?) -> URL? {
        containerURL?.appendingPathComponent(fileName, isDirectory: false)
    }

    // MARK: - L'écriture (app)

    /// Écrit le miroir, jeu VIDE compris : une liste vide dit « aucun verrou ».
    /// Le fichier d'abord, la clé ensuite ; un échec d'écriture du fichier
    /// n'empêche pas la clé (qui ne peut qu'ajouter un verrou).
    @discardableResult
    static func mirror(
        _ ids: Set<String>,
        toFile fileURL: URL?,
        defaults: UserDefaults?,
        writing: (Data, URL) throws -> Void = NSELockedConversationMirror.writeProtectedUntilFirstUnlock
    ) -> Bool {
        let sorted = ids.sorted()
        defaults?.set(sorted, forKey: legacyDefaultsKey)
        guard let fileURL, let data = try? JSONEncoder().encode(sorted) else { return false }
        do {
            try writing(data, fileURL)
            return true
        } catch {
            return false
        }
    }

    /// Lisible écran verrouillé après le premier déverrouillage, jamais avant.
    static func writeProtectedUntilFirstUnlock(_ data: Data, to url: URL) throws {
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    // MARK: - La lecture (extension)

    /// UNE lecture du fichier : son ouverture est le signal, son contenu la
    /// donnée. Toute erreur autre que « fichier absent » vaut « illisible ».
    static func readFile(
        at fileURL: URL?,
        contents: (URL) throws -> Data = { try Data(contentsOf: $0) }
    ) -> NSELockMirrorRead {
        guard let fileURL else { return .unreadable }
        do {
            let data = try contents(fileURL)
            guard let ids = try? JSONDecoder().decode([String].self, from: data) else { return .unreadable }
            return .ids(ids)
        } catch {
            return isNoSuchFile(error) ? .absent : .unreadable
        }
    }

    static func isNoSuchFile(_ error: Error) -> Bool {
        let nsError = error as NSError
        if nsError.domain == NSCocoaErrorDomain {
            return nsError.code == CocoaError.fileReadNoSuchFile.rawValue
                || nsError.code == CocoaError.fileNoSuchFile.rawValue
        }
        return nsError.domain == NSPOSIXErrorDomain && nsError.code == Int(ENOENT)
    }

    // MARK: - La composition

    /// **Ce que l'extension sait du verrou PIN de la conversation d'une charge.**
    ///
    /// Le fichier se lit EN PREMIER, et son verdict ne dépend d'aucune lecture
    /// postérieure : un déverrouillage survenu pendant la composition ne peut
    /// rien rendre « ouvert » que le fichier n'ait dit ouvert. La clé de
    /// renfort et le cliché de la liste ne peuvent qu'AJOUTER un verrou.
    static func conversationLock(
        conversationId: String?,
        readFile: () -> NSELockMirrorRead,
        readLegacyKey: () -> [String]?,
        snapshotDeclaresLock: (String) -> Bool
    ) -> NSEConversationLock {
        guard let conversationId, !conversationId.isEmpty else { return .noConversation }
        let file = readFile()
        let legacy = readLegacyKey()
        let declaredLocked = snapshotDeclaresLock(conversationId)
            || (legacy ?? []).contains(conversationId)
            || file.lockedIds.contains(conversationId)
        guard !declaredLocked else { return .locked }
        switch file {
        case .ids: return .open
        case .unreadable: return .unknown
        case .absent: return legacy == nil ? .unknown : .open
        }
    }
}
