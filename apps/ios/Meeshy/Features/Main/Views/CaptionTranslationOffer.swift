import Foundation
import MeeshySDK

/// **Ce qu'on offre entre une légende et son invite** (#6504).
///
/// Directive porteur 2026-09-14 : « mettre entre les deux l'icône de traduction,
/// la sélection de la langue d'affichage s'il existe des traductions déjà, ou
/// l'icône pour traduire immédiatement » — et cette icône « ouvre la feuille
/// habituelle de traduction, celle des messages, des audios, pour demander une
/// traduction de ce contenu dans la langue souhaitée ».
///
/// Pure, et hors de toute vue : la rangée n'a qu'à rendre ce que la règle
/// décide. La feuille propose toutes les langues : l'icône n'est un contrôle
/// inerte que si la langue d'origine est inconnue (loi 4).
nonisolated enum CaptionTranslationOffer: Equatable {
    /// Rien à offrir.
    case none
    /// Au moins deux langues distinctes : l'origine en tête, puis les
    /// traductions dans l'ordre alphabétique. `active` est la langue affichée.
    case languages(codes: [String], active: String?)
    /// Aucune autre langue à choisir : l'icône ouvre la feuille de traduction.
    case translate

    static func resolve(originalLanguage: String?,
                        translationLanguages: [String],
                        activeLanguage: String?) -> CaptionTranslationOffer {
        let origine = originalLanguage.flatMap { $0.isEmpty ? nil : $0 }
        let cleOrigine = origine?.lowercased()

        let traductions = translationLanguages
            .filter { !$0.isEmpty && $0.lowercased() != cleOrigine }
            .reduce(into: [String]()) { vus, code in
                if !vus.contains(where: { $0.lowercased() == code.lowercased() }) { vus.append(code) }
            }
            .sorted { $0.lowercased() < $1.lowercased() }
        let codes = (origine.map { [$0] } ?? []) + traductions

        if codes.count >= 2 {
            return .languages(codes: codes, active: activeLanguage)
        }
        return origine == nil ? .none : .translate
    }

    /// **Le texte du post dans la langue affichée**, lu DEPUIS la langue active.
    ///
    /// Recette 2026-09-14 : le plein écran marquait « Français » actif sur un
    /// texte portugais — le texte venait de `translatedContent`, figé par un
    /// autre chemin, le drapeau de la descente du Prisme (#6531). Le texte et le
    /// drapeau se lisent désormais depuis UNE langue. Une langue sans texte connu
    /// rend le contenu, jamais une légende vide.
    static func carrierText(content: String,
                            originalLanguage: String?,
                            translations: [String: String],
                            language: String?) -> String {
        guard let cle = language?.lowercased(), cle != originalLanguage?.lowercased() else { return content }
        return translations.first { $0.key.lowercased() == cle }?.value ?? content
    }
}

/// **Ce qu'on traduit sous une légende : le contenu AFFICHÉ, jamais un voisin** (#6280).
///
/// Directive porteur 2026-09-14 : le contenu du post, la légende d'un média et
/// son texte alternatif sont TROIS contenus. Le plein écran d'une scène affiche
/// soit la légende PROPRE du média de la scène, soit le texte du post en repli
/// (`SceneCaption.Origin`) ; la rangée et la feuille traduisent celui-là, avec
/// ses seules traductions et par sa seule route — jamais l'un pour l'autre,
/// même à chaînes égales.
nonisolated struct CaptionTranslationSource: Equatable {
    enum Target: Equatable {
        /// `POST /posts/:postId/translate` — le contenu du post.
        case post(id: String)
        /// `POST /posts/media/:mediaId/caption/translate` — la légende du média.
        case mediaCaption(mediaId: String)

        var identifiant: String {
            switch self {
            case .post(let id): return id
            case .mediaCaption(let mediaId): return mediaId
            }
        }
    }

    let text: String
    let originalLanguage: String?
    let translations: [String: String]
    let target: Target

    static func of(origin: SceneCaption.Origin, post: FeedPost, mediaId: String?) -> CaptionTranslationSource? {
        switch origin {
        case .carrierText:
            return CaptionTranslationSource(
                text: post.content,
                originalLanguage: post.originalLanguage,
                translations: (post.translations ?? [:]).mapValues(\.text),
                target: .post(id: post.id)
            )
        case .mediaCaption:
            guard let mediaId,
                  let media = post.media.first(where: { $0.id == mediaId }),
                  let caption = media.caption,
                  !caption.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
            return CaptionTranslationSource(
                text: caption,
                originalLanguage: media.captionLanguage,
                translations: media.captionTranslations ?? [:],
                target: .mediaCaption(mediaId: mediaId)
            )
        }
    }

    /// La langue dont ce contenu s'affiche par défaut : la descente du Prisme
    /// (`PrismTranslationResolver`, la langue d'origine concourant à son rang),
    /// sinon l'original. UNE résolution pour le texte et le drapeau actif.
    func displayedLanguage(preferredLanguages: [String]) -> String? {
        PrismTranslationResolver.resolve(
            originalLanguage: originalLanguage,
            translations: translations,
            preferredLanguages: preferredLanguages
        )?.language ?? originalLanguage
    }
}

/// **Une traduction ARRIVÉE pendant que le plein écran est ouvert** (#6560).
///
/// Recette staging 2026-09-14 : l'espagnol demandé depuis la feuille est gravé
/// en 0,6 s et le store du fil le reçoit — mais le plein écran couvre la carte
/// qui le présente, et tant qu'il est ouvert le post qu'elle lui relaie ne
/// change pas : la roue tournait encore 30 s plus tard, « Español » n'apparaissait
/// qu'en rouvrant. Le plein écran plie donc lui-même, sur le post qu'il affiche,
/// ce que la socket livre pour CE post — par les règles de pose du store.
nonisolated enum CaptionTranslationArrival: Sendable {
    /// `post:translation-updated` — le texte du post.
    case post(SocketPostTranslationUpdatedData)
    /// `media:caption-translation-updated` — la légende d'un média.
    case mediaCaption(SocketMediaCaptionTranslationUpdatedData)

    var postId: String {
        switch self {
        case .post(let recue): return recue.postId
        case .mediaCaption(let recue): return recue.postId
        }
    }

    static func applying(_ arrivals: [CaptionTranslationArrival], to post: FeedPost) -> FeedPost {
        arrivals.filter { $0.postId == post.id }.reduce(into: post) { affiche, arrivee in
            switch arrivee {
            case .post(let recue):
                var traductions = affiche.translations ?? [:]
                traductions[recue.language] = PostTranslation(
                    text: recue.translation.text,
                    translationModel: recue.translation.translationModel,
                    confidenceScore: recue.translation.confidenceScore
                )
                affiche.translations = traductions
            case .mediaCaption(let recue):
                _ = FeedViewModel.applyMediaCaptionTranslation(
                    recue.translation.text, mediaId: recue.mediaId, commentId: recue.commentId,
                    language: recue.language, to: &affiche
                )
            }
        }
    }
}
