import Foundation

/// Collecte, PAR média du composer, le texte alternatif d'accessibilité et le
/// choix d'extraction de son.
///
/// Le transport sait déjà porter les deux champs — gateway
/// (`CreatePostSchema.mediaAlt` / `.allowSoundExtraction`,
/// `services/gateway/src/routes/posts/types.ts`), SDK
/// (`PostService.create/update(… allowSoundExtraction: mediaAlt:)`) — mais
/// rien ne les COLLECTAIT côté UI avant ce fichier (C7-UI, 2026-08-23).
///
/// Ce store est la SURFACE de collecte, pas le point de persistance final :
/// `mediaAltPayload()` rend exactement la forme attendue par
/// `PostService.create(… mediaAlt:)` (dictionnaire id de média → texte), prête
/// à être relayée par l'appelant qui tient déjà le VM/publish (hors du
/// périmètre `Story/Controls/`).
@MainActor
public final class MediaAccessibilityStore: ObservableObject {

    @Published private(set) var altText: [String: String] = [:]
    /// `nil` tant que l'auteur n'a pas touché l'interrupteur. Contrairement à
    /// `altText`, ce n'est PAS un champ par média : `Post.allowSoundExtraction`
    /// (`schema.prisma:3125`) est un flag UNIQUE sur le post entier — « autorise
    /// l'extraction de la bande-son des VIDÉOS de ce post/réel », pas
    /// « … de CE média ». Un seul interrupteur composer-wide, pas un par clip.
    @Published private(set) var allowSoundExtractionOverride: Bool?

    /// Miroir de `CreatePostSchema.mediaAlt` côté gateway
    /// (`z.record(z.string(), z.string().max(1000))`,
    /// `services/gateway/src/routes/posts/types.ts:249`) — on ne collecte
    /// jamais plus que ce que le transport accepte.
    public static let maxAltLength = 1000

    public init() {}

    /// Texte alternatif courant d'un média — `""` tant que l'auteur ne l'a
    /// pas encore renseigné (jamais `nil` : le champ d'UI a toujours une
    /// valeur à afficher).
    public func alt(for mediaId: String) -> String {
        altText[mediaId] ?? ""
    }

    /// Une chaîne vide RETIRE l'entrée plutôt que de stocker `""` — un média
    /// jamais touché et un média dont l'auteur a effacé le texte doivent
    /// produire le même payload (rien pour cet id), pas une chaîne vide qui
    /// écraserait un texte serveur existant au prochain update.
    public func setAlt(_ text: String, for mediaId: String) {
        let trimmed = String(text.prefix(Self.maxAltLength))
        guard !trimmed.isEmpty else {
            altText.removeValue(forKey: mediaId)
            return
        }
        altText[mediaId] = trimmed
    }

    /// Défaut CONSERVATEUR : `false` tant que l'auteur n'a pas explicitement
    /// activé l'extraction — c'est un choix sur SON contenu, jamais un
    /// opt-out.
    public func allowsSoundExtraction() -> Bool {
        allowSoundExtractionOverride ?? false
    }

    public func setAllowsSoundExtraction(_ allowed: Bool) {
        allowSoundExtractionOverride = allowed
    }

    /// Efface le texte alternatif d'un média — à appeler quand le média
    /// quitte la slide (suppression), pour ne pas laisser un id orphelin
    /// fuiter dans un futur payload. `allowSoundExtractionOverride` n'est PAS
    /// touché ici : c'est un choix composer-wide, la suppression d'UN média
    /// ne l'efface pas (les autres vidéos restantes portent toujours le
    /// même choix).
    public func remove(mediaId: String) {
        altText.removeValue(forKey: mediaId)
    }

    /// Snapshot prêt pour `PostService.create/update(… mediaAlt:)`. `nil`
    /// quand aucun média n'a de texte — un dictionnaire vide enverrait un
    /// signal différent (« tous les textes sont vides ») de « rien à dire ».
    public func mediaAltPayload() -> [String: String]? {
        altText.isEmpty ? nil : altText
    }

    /// Snapshot prêt pour `PostService.create/update(… allowSoundExtraction:)`.
    /// `nil` tant que l'auteur n'a jamais touché l'interrupteur — le
    /// transport doit alors garder son défaut serveur (`false`), pas recevoir
    /// un `false` explicite qui écraserait un update partiel différent.
    public func allowSoundExtractionPayload() -> Bool? {
        allowSoundExtractionOverride
    }
}
