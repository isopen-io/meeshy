import Foundation
import MeeshySDK
import MeeshyUI

/// **« Modifier » un post ou un réel ouvre le compositeur qui l'a créé** (#9333, #15631).
///
/// Le compositeur rouvre une publication sur ses scènes — une par scène de
/// canevas, une de plus par image ou vidéo qu'aucun objet ne désigne. Il ne
/// s'ouvre donc que si ces scènes la montrent ENTIÈRE : un média qu'elles ne
/// peignent pas (un document), l'auteur ne pourrait ni le voir ni le retirer.
/// Un repost s'y ouvre aussi : son texte, son audience, sa langue et son lieu
/// s'éditent, son type et sa citation non. Reste à l'éditeur historique ce que
/// la scène ne peut pas montrer, et la story, qui a sa propre porte.
nonisolated enum PostEditComposerEligibility {

    static func opensInComposer(_ post: FeedPost) -> Bool {
        guard !post.isStory, ["POST", "REEL"].contains((post.type ?? "POST").uppercased()) else { return false }
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
    /// Un repost miroite le type de sa source : il ne se choisit pas.
    let isRepost: Bool
    let visibility: PostVisibility
    let visibilityUserIds: [String]
    let location: SharedPlace?
    let mediaIds: [String]
    /// Ce que les scènes rouvertes MONTRENT : seul un média montré peut être
    /// retiré, jamais un média que l'auteur n'a pas vu.
    let shownMediaIds: Set<String>
    /// Les fonds rouverts, par URL — ce qui dit qu'une slide montre ENCORE un
    /// média d'origine.
    let backgroundIdsByURL: [String: String]
    let media: [PostEditMediaKind]
    /// Le canevas publié : c'est lui que réécrit un changement d'agencement.
    let originalCanvas: CanvasV3?
    /// La publication portait-elle une SCÈNE (des effets) ? Seule une scène
    /// publiée peut avoir été DÉPLACÉE ; une publication de médias seuls ne
    /// reçoit pas de canevas parce qu'un fond s'est renormalisé.
    let hadScene: Bool

    init(post: FeedPost, defaultLanguage: String) {
        postId = post.id
        content = post.content
        declaredLanguage = post.originalLanguage
        language = post.originalLanguage ?? defaultLanguage
        format = (post.type ?? "").uppercased() == "REEL" ? .reel : .post
        isRepost = post.repost != nil
        visibility = post.visibility.map(PostVisibility.init(served:)) ?? .public
        visibilityUserIds = post.visibilityUserIds ?? []
        location = post.location
        mediaIds = post.media.map(\.id)
        shownMediaIds = PublicationEditHydration.shownMediaIds(media: post.media, effects: post.storyEffects)
        let fonds = PublicationEditHydration.scenes(media: post.media, effects: post.storyEffects)
            .compactMap(\.background)
            .compactMap { fond in fond.url.map { ($0, fond.id) } }
        backgroundIdsByURL = Dictionary(fonds, uniquingKeysWith: { premier, _ in premier })
        originalCanvas = post.storyEffects?.canvasV3
        hadScene = post.storyEffects != nil
        media = post.media.map { PostEditMediaKind(id: $0.id, kind: $0.type, durationMs: $0.duration.map { $0 * 1000 }) }
    }

    /// Les médias d'origine que les slides MONTRAIENT et ne montrent plus, dans
    /// l'ordre du post. Un média que l'auteur n'a jamais vu n'est jamais retiré.
    func removedMediaIds(slides: [StorySlide]) -> [String] {
        let objets = slides.reduce(into: Set<String>()) {
            $0.formUnion(PublicationEditHydration.referencedMediaIds($1.effects))
        }
        let fonds = Set(slides.compactMap { $0.mediaURL.flatMap { backgroundIdsByURL[$0] } })
        let montres = objets.union(fonds)
        return mediaIds.filter { shownMediaIds.contains($0) && !montres.contains($0) }
    }

    /// **L'agencement se change-t-il ?** Là où l'éditeur historique l'offrait
    /// (`PostEditTypeChoice.offersLayout`) : un post de plusieurs scènes de
    /// canevas, dont aucun média n'est retiré — un retrait laisserait le
    /// canevas désigner un fichier détaché.
    func layoutIsEditable(slides: [StorySlide]) -> Bool {
        guard let canvas = originalCanvas, !isRepost,
              ComposerMosaicChoice.isServed(slideCount: canvas.scenes.count, format: .post) else { return false }
        return removedMediaIds(slides: slides).isEmpty
    }

    /// **Le réel reste-t-il choisissable ?** La règle de l'éditeur historique,
    /// mot pour mot (`PostEditTypeChoice.reelIsChoosable`) : le type d'origine
    /// est restauré tant que rien n'est retiré, et un retrait qui dé-qualifie la
    /// composition impose le post — le gateway refuse un réel non qualifiant.
    func reelIsChoosable(slides: [StorySlide]) -> Bool {
        let retires = Set(removedMediaIds(slides: slides))
        let restants = media.filter { !retires.contains($0.id) }.map { (kind: $0.kind, durationMs: $0.durationMs) }
        return PostEditTypeChoice.reelIsChoosable(originalType: format == .reel ? "REEL" : "POST",
                                                  remainingQualifies: ReelComposition.qualifiesAsReel(mediaKinds: restants),
                                                  removedAny: !retires.isEmpty)
    }
}

/// Ce que la règle du réel lit d'un média d'origine — la durée en
/// millisecondes, comme `EditablePostMedia` (`FeedMedia.duration` est en
/// secondes).
nonisolated struct PostEditMediaKind: Equatable {
    let id: String
    let kind: FeedMediaType
    let durationMs: Int?
}

/// Pourquoi l'enregistrement refuse — chaque refus se DIT, et le compositeur
/// reste ouvert avec tout ce que l'auteur a fait.
nonisolated enum PostEditComposerRefusal: Equatable {
    /// Des médias neufs se téléversent avant la modification : hors ligne, ils
    /// ne partiraient pas.
    case offline
    case notADocumentFormat
    case incompleteAudience
    case tooLong
    case empty
}

nonisolated enum PostEditComposerOutcome {
    case save(EditPostDraft)
    /// La modification porte des médias NEUFS : ils se téléversent d'abord, puis
    /// la requête part avec leurs ids (`PostEditMediaUpload`).
    case upload(EditPostDraft, PostEditPendingMedia)
    case refuse(PostEditComposerRefusal)
}

/// **La traduction d'un brouillon du compositeur en requête de MODIFICATION.**
///
/// Elle rend exactement ce que `EditPostSheet` rendait — contenu, langue, type,
/// médias retirés, lieu, audience — sous la même déclaration de champs connus
/// (`EditPostDraft.documentFields`). Ce que la SCÈNE change s'y ajoute (#15630) :
/// une scène remaniée — objet ajouté, retiré, déplacé, média neuf — renvoie le
/// canevas ENTIER du brouillon, les médias neufs se téléversent avant le PUT,
/// et les références déclarées partent dès que le compositeur a relu
/// l'ensemble servi. Une scène intacte ne renvoie que son agencement, s'il a
/// changé.
enum PostEditComposerSave {

    static let maxLength = ReelPublishedContent.maxLength

    static func outcome(draft: ComposerDocumentDraft, baseline: PostEditBaseline,
                        openedSlides: [StorySlide], slides: [StorySlide],
                        knowsDeclaredReferences: Bool = false) -> PostEditComposerOutcome {
        guard draft.format == .post || draft.format == .reel else { return .refuse(.notADocumentFormat) }
        let retires = removedMediaIds(baseline: baseline, slides: slides)
        let neufs = PostEditPendingMedia(draft: draft)
        let remaniee = neufs != nil || sceneReshaped(baseline: baseline, removed: retires,
                                                     opened: openedSlides, now: slides)

        let contenu = (draft.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard contenu.count <= maxLength else { return .refuse(.tooLong) }
        guard !contenu.isEmpty || baseline.mediaIds.count > retires.count else { return .refuse(.empty) }

        let audience = EditPostAudienceRule.draftAudience(selected: draft.visibility, ids: draft.visibilityUserIds ?? [])
        let audienceChangee = draft.visibility != baseline.visibility || audience != baseline.visibilityUserIds
        guard !audienceChangee
            || EditPostAudienceRule.isComplete(visibility: draft.visibility, audienceCount: audience.count)
        else { return .refuse(.incompleteAudience) }

        let canevas = remaniee && !baseline.isRepost
            ? draft.storyEffects.map { neufs == nil ? $0.sanitizedForServerPublish() : $0 }
            : layoutUpdate(draft: draft, baseline: baseline, removed: retires)
        let langue = draft.originalLanguage.flatMap { $0 == baseline.language ? nil : $0 }
        let type = draft.format == baseline.format || baseline.isRepost ? nil : (draft.format == .reel ? "REEL" : "POST")
        var connus = EditPostDraft.documentFields
        if baseline.mediaIds.isEmpty { connus.remove(.removeMediaIds) }
        if baseline.isRepost { connus.remove(.type) }
        if canevas != nil { connus.insert(.storyEffects) }
        if knowsDeclaredReferences { connus.insert(.mentions) }
        let modification = EditPostDraft(
            content: contenu,
            language: langue,
            type: type,
            removeMediaIds: retires,
            location: locationUpdate(from: baseline.location, to: draft.location),
            visibility: audienceChangee ? draft.visibility.rawValue : nil,
            visibilityUserIds: audienceChangee ? audience : nil,
            known: connus,
            storyEffects: canevas,
            additions: PostEditAdditions(mentions: knowsDeclaredReferences ? (draft.mentions ?? []) : nil)
        )
        return neufs.map { .upload(modification, $0) } ?? .save(modification)
    }

    /// **La scène a-t-elle été remaniée ?** Un objet ajouté, retiré ou réécrit
    /// (la signature), ou DÉPLACÉ (l'empreinte, positions arrondies : la scène
    /// normalise ses objets à l'affichage, et un arrondi ne doit pas passer pour
    /// un geste). L'empreinte ne vaut que pour un post qui avait un canevas : une
    /// publication de médias seuls n'en reçoit pas un parce qu'un fond s'est
    /// renormalisé.
    static func sceneReshaped(baseline: PostEditBaseline, removed: [String],
                              opened: [StorySlide], now: [StorySlide]) -> Bool {
        let signature = { (scene: [StorySlide]) in
            PostEditSceneSignature(slides: scene, removed: Set(removed), backgrounds: baseline.backgroundIdsByURL)
        }
        guard signature(opened) == signature(now) else { return true }
        return baseline.hadScene && PostEditSceneFingerprint(opened) != PostEditSceneFingerprint(now)
    }

    /// Les médias d'origine que la scène MONTRAIT et ne montre plus.
    static func removedMediaIds(baseline: PostEditBaseline, slides: [StorySlide]) -> [String] {
        baseline.removedMediaIds(slides: slides)
    }

    /// **Le canevas d'origine, seul `layout` réécrit** — ce que l'éditeur
    /// historique envoyait (#9178). La capsule publie sans agencement (`nil`)
    /// tant que l'auteur n'en choisit pas un : `nil` = inchangé.
    static func layoutUpdate(draft: ComposerDocumentDraft, baseline: PostEditBaseline,
                             removed: [String]) -> StoryEffects? {
        guard draft.format == .post, removed.isEmpty, let canvas = baseline.originalCanvas, !baseline.isRepost,
              ComposerMosaicChoice.isServed(slideCount: canvas.scenes.count, format: .post),
              let choisi = draft.storyEffects?.canvasV3?.layout, choisi != canvas.resolvedLayout else { return nil }
        var effets = StoryEffects(rendering: canvas, sceneIndex: 0)
        effets.canvasV3 = CanvasV3(v: canvas.v, scenes: canvas.scenes, sound: canvas.sound, layout: choisi)
        return effets
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
/// interdirait d'enregistrer le moindre mot. Une slide qui ne porte plus rien
/// ne compte pas : retirer le seul média d'une diapo, ou la diapo entière,
/// est le même geste.
nonisolated struct PostEditSceneSignature: Equatable {
    let slides: [[String]]

    init(slides: [StorySlide], removed: Set<String>, backgrounds: [String: String]) {
        self.slides = slides.map { Self.objects(of: $0, removed: removed, backgrounds: backgrounds) }
            .filter { !$0.isEmpty }
    }

    private static func objects(of slide: StorySlide, removed: Set<String>, backgrounds: [String: String]) -> [String] {
        let effets = slide.effects
        let fond: [String] = slide.mediaURL.map { url in
            backgrounds[url].map { removed.contains($0) ? [] : ["fond:\($0)"] } ?? ["fond:\(url)"]
        } ?? []
        let medias: [String] = (effets.mediaObjects ?? []).filter { !removed.contains($0.postMediaId) }
            .map { "media:\($0.id)" }
        let sons: [String] = (effets.audioPlayerObjects ?? []).filter { !removed.contains($0.postMediaId) }
            .map { "son:\($0.id)" }
        let textes: [String] = effets.textObjects.map { "texte:\($0.id):\($0.text)" }
        let stickers: [String] = (effets.stickerObjects ?? []).map { "sticker:\($0.id)" }
        let lieux: [String] = effets.locationObjects.map { "lieu:\($0.id)" }
        let traits: [String] = (effets.drawingStrokes ?? []).isEmpty ? [] : ["traits:\(effets.drawingStrokes?.count ?? 0)"]
        let dessin: [String] = (effets.drawingData ?? Data()).isEmpty ? [] : ["dessin:\(effets.drawingData?.count ?? 0)"]
        let objets: [[String]] = [fond, textes, medias, sons, stickers, lieux, traits, dessin]
        return objets.flatMap { $0 }
    }
}

/// **Où sont les objets de la scène** — l'empreinte de chaque slide, nombres
/// arrondis au centième : un objet DÉPLACÉ la change, la renormalisation que
/// la scène fait à l'affichage non. Elle complète `PostEditSceneSignature`, qui
/// compte les objets sans jamais regarder leur place.
nonisolated struct PostEditSceneFingerprint: Equatable {
    let slides: [String]

    init(_ slides: [StorySlide]) {
        self.slides = slides.map(Self.fingerprint)
    }

    private static func fingerprint(_ slide: StorySlide) -> String {
        let encodeur = JSONEncoder()
        encodeur.outputFormatting = [.sortedKeys]
        guard let octets = try? encodeur.encode(slide.effects),
              let arbre = try? JSONSerialization.jsonObject(with: octets),
              let arrondi = try? JSONSerialization.data(withJSONObject: rounded(arbre), options: [.sortedKeys])
        else { return slide.mediaURL ?? "" }
        return (slide.mediaURL ?? "") + String(decoding: arrondi, as: UTF8.self)
    }

    private static func rounded(_ valeur: Any) -> Any {
        switch valeur {
        case let nombre as NSNumber where CFGetTypeID(nombre) != CFBooleanGetTypeID():
            return (nombre.doubleValue * 100).rounded() / 100
        case let objet as [String: Any]:
            return objet.mapValues(rounded)
        case let liste as [Any]:
            return liste.map(rounded)
        default:
            return valeur
        }
    }
}
