import Foundation
import MeeshySDK
import MeeshyUI

/// **« Modifier » un post ou un réel ouvre le compositeur qui l'a créé** (#9333).
///
/// Le compositeur rouvre une publication sur UNE scène. Il ne s'ouvre donc que
/// si cette scène la montre ENTIÈRE : un média qu'elle ne peint pas, l'auteur ne
/// pourrait ni le voir ni le retirer, et une seconde scène de canevas resterait
/// derrière sans qu'il le sache. Tout le reste — un repost, une story, plusieurs
/// scènes, un média que rien ne montre — garde l'éditeur historique : dégrader,
/// jamais cacher.
nonisolated enum PostEditComposerEligibility {

    static func opensInComposer(_ post: FeedPost) -> Bool {
        guard !post.isStory, post.repost == nil,
              ["POST", "REEL"].contains((post.type ?? "POST").uppercased()),
              (post.storyEffects?.canvasV3?.scenes.count ?? 0) <= 1 else { return false }
        let montres = PublicationEditHydration.shownMediaIds(media: post.media, effects: post.storyEffects)
        return Set(post.media.map(\.id)).isSubset(of: montres)
    }
}

/// Ce que la publication ÉTAIT à l'ouverture — la référence de chaque « a
/// changé ? ». Un champ inchangé n'est pas envoyé : c'est le même contrat que
/// `EditPostSheet`, et c'est lui qui empêche une réouverture d'écraser ce
/// qu'une autre surface a modifié entre-temps.
nonisolated struct PostEditBaseline: Equatable {
    let postId: String
    let content: String
    /// La langue que la capsule MONTRE à l'ouverture : celle du post, sinon la
    /// langue par défaut du compositeur. La comparer à la langue du post brute
    /// relancerait la traduction de tout post sans langue déclarée.
    let language: String
    let declaredLanguage: String?
    let format: ComposerFormat
    let visibility: PostVisibility
    let visibilityUserIds: [String]
    let location: SharedPlace?
    let mediaIds: [String]
    let backgroundMediaId: String?
    let backgroundURL: String?

    init(post: FeedPost, defaultLanguage: String) {
        postId = post.id
        content = post.content
        declaredLanguage = post.originalLanguage
        language = post.originalLanguage ?? defaultLanguage
        format = (post.type ?? "").uppercased() == "REEL" ? .reel : .post
        visibility = post.visibility.map(PostVisibility.init(served:)) ?? .public
        visibilityUserIds = post.visibilityUserIds ?? []
        location = post.location
        mediaIds = post.media.map(\.id)
        let fond = PublicationEditHydration.background(media: post.media, effects: post.storyEffects)
        backgroundMediaId = fond?.id
        backgroundURL = fond?.url
    }
}

/// Pourquoi l'enregistrement refuse — chaque refus se DIT, et le compositeur
/// reste ouvert avec tout ce que l'auteur a fait.
nonisolated enum PostEditComposerRefusal: Equatable {
    /// Un média neuf exige un téléversement que la modification ne porte pas.
    case addsMedia
    /// Un objet ajouté, retiré (hors média) ou réécrit sur la scène.
    case reshapesScene
    case notADocumentFormat
    case incompleteAudience
    case tooLong
    case empty
}

nonisolated enum PostEditComposerOutcome {
    case save(EditPostDraft)
    case refuse(PostEditComposerRefusal)
}

/// **La traduction d'un brouillon du compositeur en requête de MODIFICATION.**
///
/// Elle rend exactement ce que `EditPostSheet` rendait — contenu, langue, type,
/// médias retirés, lieu, audience — sous la même déclaration de champs connus
/// (`EditPostDraft.documentFields`), si bien que le `PUT /posts/:id` qui part
/// est celui d'aujourd'hui. Le canevas ne part PAS : la scène sert à montrer la
/// publication et à en retirer un média, et ce qu'elle ne sait pas encore
/// enregistrer, elle le refuse plutôt que de le perdre en silence.
nonisolated enum PostEditComposerSave {

    static let maxLength = ReelPublishedContent.maxLength

    static func outcome(draft: ComposerDocumentDraft, baseline: PostEditBaseline,
                        openedSlides: [StorySlide], slides: [StorySlide]) -> PostEditComposerOutcome {
        guard draft.format == .post || draft.format == .reel else { return .refuse(.notADocumentFormat) }
        guard draft.localMedia.isEmpty else { return .refuse(.addsMedia) }
        let retires = removedMediaIds(baseline: baseline, slides: slides)
        let signature = { (scene: [StorySlide]) in
            PostEditSceneSignature(slides: scene, removed: Set(retires), backgroundURL: baseline.backgroundURL,
                                   backgroundRemoved: baseline.backgroundMediaId.map(retires.contains) ?? false)
        }
        guard signature(openedSlides) == signature(slides) else { return .refuse(.reshapesScene) }

        let contenu = (draft.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard contenu.count <= maxLength else { return .refuse(.tooLong) }
        guard !contenu.isEmpty || baseline.mediaIds.count > retires.count else { return .refuse(.empty) }

        let audience = EditPostAudienceRule.draftAudience(selected: draft.visibility, ids: draft.visibilityUserIds ?? [])
        let audienceChangee = draft.visibility != baseline.visibility || audience != baseline.visibilityUserIds
        guard !audienceChangee
            || EditPostAudienceRule.isComplete(visibility: draft.visibility, audienceCount: audience.count)
        else { return .refuse(.incompleteAudience) }

        let langue = draft.originalLanguage.flatMap { $0 == baseline.language ? nil : $0 }
        let type = draft.format == baseline.format ? nil : (draft.format == .reel ? "REEL" : "POST")
        var connus = EditPostDraft.documentFields
        if baseline.mediaIds.isEmpty { connus.remove(.removeMediaIds) }
        return .save(EditPostDraft(
            content: contenu,
            language: langue,
            type: type,
            removeMediaIds: retires,
            location: locationUpdate(from: baseline.location, to: draft.location),
            visibility: audienceChangee ? draft.visibility.rawValue : nil,
            visibilityUserIds: audienceChangee ? audience : nil,
            known: connus
        ))
    }

    /// Les médias d'origine que la scène ne montre plus, dans l'ordre du post.
    static func removedMediaIds(baseline: PostEditBaseline, slides: [StorySlide]) -> [String] {
        var montres = slides.reduce(into: Set<String>()) {
            $0.formUnion(PublicationEditHydration.referencedMediaIds($1.effects))
        }
        if let fond = baseline.backgroundMediaId, slides.contains(where: { $0.mediaURL == baseline.backgroundURL }) {
            montres.insert(fond)
        }
        return baseline.mediaIds.filter { !montres.contains($0) }
    }

    /// Tri-état, comme la feuille : `nil` = inchangé (clé absente du PUT).
    static func locationUpdate(from original: SharedPlace?, to current: SharedPlace?) -> PostLocationUpdate? {
        guard original != current else { return nil }
        return current.map(PostLocationUpdate.set) ?? .remove
    }
}

/// **Ce que la scène PORTE, hors média retiré** — de quoi dire si l'auteur l'a
/// remaniée. Elle compte les objets et leurs textes, jamais leurs positions :
/// la scène normalise ses objets à l'affichage, et un refus né d'un arrondi
/// interdirait d'enregistrer le moindre mot.
nonisolated struct PostEditSceneSignature: Equatable {
    let slides: [[String]]

    init(slides: [StorySlide], removed: Set<String>, backgroundURL: String?, backgroundRemoved: Bool) {
        self.slides = slides.map { slide in
            let effets = slide.effects
            let origine = backgroundURL != nil && slide.mediaURL == backgroundURL
            let fond = origine ? (backgroundRemoved ? "" : "fond-origine") : (slide.mediaURL ?? "")
            let medias = (effets.mediaObjects ?? []).filter { !removed.contains($0.postMediaId) }
                .map { "media:\($0.id)" }
            let sons = (effets.audioPlayerObjects ?? []).filter { !removed.contains($0.postMediaId) }
                .map { "son:\($0.id)" }
            return ["fond:\(fond)"]
                + effets.textObjects.map { "texte:\($0.id):\($0.text)" }
                + medias + sons
                + (effets.stickerObjects ?? []).map { "sticker:\($0.id)" }
                + effets.locationObjects.map { "lieu:\($0.id)" }
                + ["traits:\(effets.drawingStrokes?.count ?? 0)", "dessin:\(effets.drawingData?.count ?? 0)"]
        }
    }
}
