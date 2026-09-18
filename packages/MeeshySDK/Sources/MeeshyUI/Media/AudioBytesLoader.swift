import Foundation

/// **Les octets d'un fichier audio se lisent HORS du fil principal** (#7010).
///
/// `AudioPlaybackManager.playLocal` ouvrait sa tâche avec `Task { … }`, qui
/// HÉRITE de l'acteur de son englobant : la classe est `@MainActor`, donc
/// `Data(contentsOf:)` lisait le fichier — un vocal de plusieurs mégaoctets, un
/// son de fond de story — sur le MainActor, juste après l'acquisition de la
/// session audio. Le geste qui déclenche la lecture est justement celui pendant
/// lequel l'écran doit rester vivant.
///
/// > `Task { }` n'est PAS un saut de fil. C'est la confusion qui a produit ce
/// > défaut : la forme ressemble à du travail d'arrière-plan, et un lecteur
/// > pressé n'y voit pas que l'acteur suit. Seul `Task.detached` part vraiment.
///
/// Rendre `nil` plutôt qu'une erreur est délibéré : l'appelant a déjà vérifié
/// l'EXISTENCE du fichier juste avant (pré-vol de `playLocal`), et sa branche
/// d'échec journalise puis retombe silencieusement — elle n'a jamais rien fait
/// de la valeur de l'erreur.
enum AudioBytesLoader {

    nonisolated static func bytes(at url: URL) async -> Data? {
        await Task.detached(priority: .userInitiated) {
            try? Data(contentsOf: url)
        }.value
    }
}
