import Foundation
import Combine
import MeeshySDK

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
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    /// Les textes collectés, PAR NATURE puis par média.
    ///
    /// Une seule case pour les deux textes : `alt` et `caption` ont exactement
    /// le même transport (`PostMediaText`), et écrire deux dictionnaires
    /// jumeaux côte à côte est la façon la plus sûre de les faire diverger —
    /// c'est ce qui est arrivé au serveur avant `applyMediaText(column:)`.
    ///
    /// **Séparés par la CLÉ, jamais par le champ** : `texts[.alt]` et
    /// `texts[.caption]` ne se touchent pas, et `MediaCaptionCollectionTests`
    /// garde précisément ce point — le seul défaut qu'une mutualisation
    /// puisse introduire.
    @Published private(set) var texts: [PostMediaText: [String: String]] = [:]

    /// Projection historique. Conservée parce qu'elle est PUBLIQUE et lue par
    /// le panneau, les tests et le hand-off : la généralisation ne casse aucun
    /// appelant.
    var altText: [String: String] { texts[.alt] ?? [:] }
    /// `nil` tant que l'auteur n'a pas touché l'interrupteur. Contrairement à
    /// `altText`, ce n'est PAS un champ par média : `Post.allowSoundExtraction`
    /// (`schema.prisma:3125`) est un flag UNIQUE sur le post entier — « autorise
    /// l'extraction de la bande-son des VIDÉOS de ce post/réel », pas
    /// « … de CE média ». Un seul interrupteur composer-wide, pas un par clip.
    @Published private(set) var allowSoundExtractionOverride: Bool?

    /// Miroir de `CreatePostSchema.mediaAlt` / `.mediaCaption` côté gateway
    /// (`z.record(z.string(), z.string().max(1000))`,
    /// `services/gateway/src/routes/posts/types.ts`) — on ne collecte jamais
    /// plus que ce que le transport accepte.
    ///
    /// DÉLÉGUÉ à `PostMediaText.maxLength` : la borne appartient au contrat,
    /// pas à ce store, et deux constantes valant 1000 auraient fini par
    /// diverger.
    public static var maxAltLength: Int { PostMediaText.maxLength }

    public init() {}

    /// Texte courant d'un média pour l'une des deux natures — `""` tant que
    /// l'auteur ne l'a pas renseigné (jamais `nil` : le champ d'UI a toujours
    /// une valeur à afficher).
    public func text(_ kind: PostMediaText, for mediaId: String) -> String {
        texts[kind]?[mediaId] ?? ""
    }

    /// Une chaîne vide RETIRE l'entrée plutôt que de stocker `""` — un média
    /// jamais touché et un média dont l'auteur a effacé le texte doivent
    /// produire le même payload (rien pour cet id), pas une chaîne vide qui
    /// écraserait un texte serveur existant au prochain update.
    public func setText(_ value: String, _ kind: PostMediaText, for mediaId: String) {
        let clamped = String(value.prefix(PostMediaText.maxLength))
        guard !clamped.isEmpty else {
            texts[kind]?.removeValue(forKey: mediaId)
            return
        }
        texts[kind, default: [:]][mediaId] = clamped
    }

    /// Texte alternatif courant d'un média (accessibilité).
    public func alt(for mediaId: String) -> String { text(.alt, for: mediaId) }

    public func setAlt(_ value: String, for mediaId: String) { setText(value, .alt, for: mediaId) }

    /// LÉGENDE courante d'un média — ce que l'auteur écrit et que les lecteurs
    /// VOIENT, à ne pas confondre avec `alt(for:)`, que seul VoiceOver annonce.
    public func caption(for mediaId: String) -> String { text(.caption, for: mediaId) }

    public func setCaption(_ value: String, for mediaId: String) { setText(value, .caption, for: mediaId) }

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
    ///
    /// Efface les DEUX textes : un `remove` qui n'en effacerait qu'un
    /// laisserait un id orphelin fuiter dans un payload ultérieur — c'est
    /// exactement ce que la version alt-seule évitait déjà, et l'oublier pour
    /// la légende aurait rouvert le défaut sous un autre nom.
    public func remove(mediaId: String) {
        for kind in PostMediaText.allCases {
            texts[kind]?.removeValue(forKey: mediaId)
        }
    }

    /// Ce que le BROUILLON retient de la collecte (F2).
    ///
    /// Rend le dictionnaire tel quel, vide compris, là où `mediaAltPayload()`
    /// rend `nil` : un brouillon persiste un état d'édition, pas une requête —
    /// « aucun texte » n'y dit rien de plus que « dictionnaire vide », alors
    /// que le transport, lui, distingue les deux.
    public func draftSnapshot() -> StoryDraftAccessibility {
        StoryDraftAccessibility(mediaAlt: texts[.alt] ?? [:],
                                mediaCaption: texts[.caption] ?? [:],
                                allowSoundExtraction: allowSoundExtractionOverride)
    }

    /// Repose la collecte d'un brouillon adopté. REMPLACE l'état courant :
    /// reprendre un brouillon prend la place de la composition en cours, il ne
    /// fusionne pas ses textes avec ceux d'une autre — les ids d'éléments d'une
    /// composition abandonnée n'ont aucun média en face dans celle-ci.
    ///
    /// Les textes repassent par `setAlt` : un brouillon a pu être écrit sous
    /// une limite de transport différente.
    public func restore(from accessibility: StoryDraftAccessibility) {
        texts = [:]
        for (mediaId, value) in accessibility.mediaAlt { setText(value, .alt, for: mediaId) }
        for (mediaId, value) in accessibility.mediaCaption { setText(value, .caption, for: mediaId) }
        allowSoundExtractionOverride = accessibility.allowSoundExtraction
    }

    /// Snapshot prêt pour `PostService.create/update(… mediaAlt:)`. `nil`
    /// quand aucun média n'a de texte — un dictionnaire vide enverrait un
    /// signal différent (« tous les textes sont vides ») de « rien à dire ».
    public func payload(_ kind: PostMediaText) -> [String: String]? {
        let collected = texts[kind] ?? [:]
        return collected.isEmpty ? nil : collected
    }

    public func mediaAltPayload() -> [String: String]? { payload(.alt) }

    /// Snapshot prêt pour `PostService.create/update(… mediaCaption:)` (#4055).
    /// Même règle de `nil` que pour le texte alternatif.
    public func mediaCaptionPayload() -> [String: String]? { payload(.caption) }

    /// Snapshot prêt pour `PostService.create/update(… allowSoundExtraction:)`.
    /// `nil` tant que l'auteur n'a jamais touché l'interrupteur — le
    /// transport doit alors garder son défaut serveur (`false`), pas recevoir
    /// un `false` explicite qui écraserait un update partiel différent.
    public func allowSoundExtractionPayload() -> Bool? {
        allowSoundExtractionOverride
    }
}
