import Foundation

/// Ce qu'un cache disque a le droit de faire d'une réponse média, lu sur son
/// en-tête `Cache-Control` (#9478).
///
/// La passerelle déclare la fraîcheur de chaque fichier de message (#9315) :
/// `private, no-store` pour une vue unique encore dans son sursis,
/// `private, no-cache` pour un éphémère vivant, un cache long pour un média
/// ordinaire — et 404 pour un fichier rappelé, expiré ou consommé.
///
/// - `persist` : le média s'écrit sur le disque et se resert sans réseau
///   (Cache-First nominal) ;
/// - `revalidateEachUse` : chaque usage repasse par le réseau — la copie n'est
///   donc pas gardée par le cache disque, qui ne revalide pas ; le cache HTTP
///   de `URLSession` s'en charge (requête conditionnelle par ETag) ;
/// - `neverStore` : aucun cache ne garde ces octets.
///
/// Règle pure, sans état : un en-tête absent garde le régime d'avant.
public enum MediaCacheDirective: Equatable, Sendable {
    case persist
    case revalidateEachUse
    case neverStore

    public init(cacheControl: String?) {
        let directives = Set(
            (cacheControl ?? "")
                .split(separator: ",")
                .compactMap { $0.split(separator: "=", maxSplits: 1).first }
                .map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
        )
        if directives.contains("no-store") {
            self = .neverStore
        } else if directives.contains("no-cache") {
            self = .revalidateEachUse
        } else {
            self = .persist
        }
    }

    public init(response: URLResponse?) {
        self.init(cacheControl: (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Cache-Control"))
    }

    /// Seul un média ordinaire s'écrit sur le disque.
    public var mayPersist: Bool { self == .persist }

    /// 404 et 410 disent que le fichier n'existe plus pour personne — la copie
    /// locale doit partir. Une panne (5xx) ou un refus d'identité (401/403)
    /// ne disent rien du contenu et la laissent en place.
    public static func meansGone(statusCode: Int) -> Bool {
        statusCode == 404 || statusCode == 410
    }
}
