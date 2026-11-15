import Foundation

/// **Ce qu'« Imager » un commentaire de POST met sur la carte** (#9686).
///
/// Un commentaire de premier niveau : le post en tête puis le commentaire
/// (défaut), ou le commentaire seul. Une RÉPONSE : le fil jusqu'à elle
/// (racine → … → cette réponse, défaut), le post puis la racine puis cette
/// réponse, ou les réponses choisies — l'ordre chronologique gardé, la réponse
/// visée toujours incluse. Dans tous les modes, le post en tête se retire d'un
/// toucher (`showsPost`).
public enum PostCommentCardMode: String, CaseIterable, Sendable {
    case postAndComment
    case commentAlone
    case threadToHere
    case postRootAndReply
    case chosenReplies

    /// Le post est-il en tête quand on choisit ce mode ?
    public var showsPostByDefault: Bool {
        switch self {
        case .postAndComment, .postRootAndReply: return true
        case .commentAlone, .threadToHere, .chosenReplies: return false
        }
    }

    /// Le mode vise-t-il une réponse (et non un commentaire de premier niveau) ?
    public var isForReply: Bool {
        switch self {
        case .postAndComment, .commentAlone: return false
        case .threadToHere, .postRootAndReply, .chosenReplies: return true
        }
    }
}

/// Un bloc de la carte, dans l'ordre où elle le peint.
public enum PostCommentCardBlock: Equatable, Sendable {
    /// Le post en tête — son texte déjà tronqué lisiblement.
    case post(MessageCardPart)
    case comment(id: String, part: MessageCardPart)
    /// « +N réponses » — le milieu d'un fil trop long, replié.
    case folded(count: Int)
}

/// Ce que la composition lit : le post, le commentaire visé et le fil chargé
/// (la racine et ses réponses, dans n'importe quel ordre).
public struct PostCommentCardSource: Sendable {
    public let post: FeedPost?
    /// Le support quand le commentaire est celui d'une STORY (#10915) — `post` est alors `nil`.
    public let story: PostCommentCardStory?
    /// L'instant que la composition tient pour « maintenant » (une story échue ne s'image pas).
    public let now: Date
    public let target: FeedComment
    public let thread: [FeedComment]
    public let viewer: MessageCardSubject.Viewer
    /// La ligne du commentaire visé montre son original (puce de langue).
    public let showOriginal: Bool
    /// Ce que chaque texte écrit DONNE À LIRE, par texte brut — `[libellé](url)`
    /// → libellé, `[[url]]` → url, `**gras**` → gras. La règle est celle du fil
    /// (`MessageTextRenderer.plainText`, MeeshyUI) : `PostCommentCardSource.reading`
    /// la remplit ; un texte absent se lit tel quel.
    public let readable: [String: String]

    public init(post: FeedPost?, target: FeedComment, thread: [FeedComment], viewer: MessageCardSubject.Viewer,
                showOriginal: Bool = false, readable: [String: String] = [:],
                story: PostCommentCardStory? = nil, now: Date = Date()) {
        self.post = post
        self.story = story
        self.now = now
        self.target = target
        self.thread = thread
        self.viewer = viewer
        self.showOriginal = showOriginal
        self.readable = readable
    }

    /// Le texte tel que le lecteur le lit, sans la notation de ses liens.
    public func read(_ raw: String) -> String {
        readable[raw] ?? raw
    }

    /// La même source, sur un autre post.
    func replacing(post: FeedPost) -> PostCommentCardSource {
        PostCommentCardSource(post: post, target: target, thread: thread, viewer: viewer, showOriginal: showOriginal,
                              readable: readable, story: story, now: now)
    }

    /// La même source, sur une autre story.
    func replacing(story: PostCommentCardStory) -> PostCommentCardSource {
        PostCommentCardSource(post: post, target: target, thread: thread, viewer: viewer, showOriginal: showOriginal,
                              readable: readable, story: story, now: now)
    }
}

/// **LA COMPOSITION D'UNE CARTE « COMMENTAIRE DE POST »** (#9686) — une
/// fonction PURE : la même source et le même choix donnent toujours les mêmes
/// blocs. Le web la reproduit à l'identique (#9687).
///
/// GARDES — les mêmes que la carte d'un commentaire : un commentaire protégé
/// (éphémère, flouté, vue unique) ne s'image pas. Une réponse dont un ANCÊTRE
/// est protégé ne s'image dans aucun mode : elle le cite, et la peindre sans
/// lui serait un fil troué (la loi de la discussion, #9573). Une réponse
/// voisine protégée ou vide, elle, n'entre simplement pas dans le fil. Un post
/// qui disparaît (story, statut), sans rien à montrer ou dont l'audience n'est
/// pas `PUBLIC` ne se met pas en tête.
///
/// BORNES : le texte du post s'arrête à `maxPostLines` lignes et
/// `maxPostCharacters` caractères ; la carte compte au plus `maxBlocks` blocs —
/// au-delà, le milieu du fil se replie en « +N réponses », la racine et les
/// dernières réponses restant visibles ; au plus `maxMedia` médias.
public enum PostCommentCardComposition {

    public static let maxPostLines = 4
    public static let maxPostCharacters = 280
    public static let maxBlocks = 6
    public static let maxMedia = 4

    // MARK: - Ce qui s'offre

    /// Les modes qui composent une carte, le défaut en tête — vide : rien ne s'image.
    public static func modes(of source: PostCommentCardSource) -> [PostCommentCardMode] {
        guard isPaintable(source.target) else { return [] }
        guard source.target.parentId != nil else {
            return postHead(of: source) == nil ? [.commentAlone] : [.postAndComment, .commentAlone]
        }
        guard let chain = ancestors(of: source), !chain.contains(where: isProtected) else { return [] }
        var offered: [PostCommentCardMode] = [.threadToHere]
        if postHead(of: source) != nil { offered.append(.postRootAndReply) }
        if choosable(of: source).count >= 2 { offered.append(.chosenReplies) }
        return offered
    }

    /// **Le repli « commentaire seul »** : aucun mode ne compose parce que le fil
    /// de la réponse n'est pas chargé (sa racine manque), mais elle est peignable
    /// et aucun ancêtre CONNU n'est protégé — la carte du commentaire seul s'offre,
    /// comme avant la composition.
    public static func fallsBackToCommentAlone(_ source: PostCommentCardSource) -> Bool {
        guard source.target.parentId != nil, isPaintable(source.target), modes(of: source).isEmpty else { return false }
        return !knownAncestors(of: source).contains(where: isProtected)
    }

    /// Le mode d'ouverture : « Post + commentaire » ou « Fil jusqu'ici ».
    public static func defaultMode(of source: PostCommentCardSource) -> PostCommentCardMode? {
        modes(of: source).first
    }

    /// Le post peut-il être en tête de cette carte ?
    public static func offersPost(_ source: PostCommentCardSource) -> Bool {
        postHead(of: source) != nil
    }

    /// **Les médias que la tête peut montrer** (#11783), dans l'ordre du support : chaque
    /// photo, vidéo et son d'un post ou d'un réel ; le seul visuel qui représente une story.
    /// Vide quand le support ne se met pas en tête.
    public static func headMedia(of source: PostCommentCardSource, audioLanguages: [String: String] = [:]) -> [MessageCardSubjectMedia] {
        guard postHead(of: source) != nil else { return [] }
        return support(of: source, audioLanguages: audioLanguages)?.media ?? []
    }

    /// Le média de tête par défaut : le premier visuel, à défaut le premier média (un son).
    public static func defaultHeadMediaID(of source: PostCommentCardSource) -> String? {
        let candidates = headMedia(of: source)
        return (candidates.first { $0.media.kind.isVisual } ?? candidates.first)?.media.id
    }

    /// **Le support existe mais son AUDIENCE le retient** (#11783) : la carte part hors de
    /// Meeshy, seul le commentaire y figure — la feuille le DIT au lieu de taire le média.
    /// Vrai seulement quand le même support, public, serait en tête (une story échue ou
    /// un post vide ne sont pas retenus par leur audience).
    public static func withheldByAudience(_ source: PostCommentCardSource) -> Bool {
        guard postHead(of: source) == nil else { return false }
        if let post = source.post {
            guard !isPublicAudience(post.visibility) else { return false }
            var opened = post
            opened.visibility = "PUBLIC"
            return postHead(of: source.replacing(post: opened)) != nil
        }
        guard let story = source.story, !isPublicAudience(story.visibility) else { return false }
        return postHead(of: source.replacing(story: story.withVisibility("PUBLIC"))) != nil
    }

    /// Les commentaires qu'on peut cocher sous « Choisir les réponses » — la
    /// racine et ses réponses peignables, sans la réponse visée, dans l'ordre.
    public static func choosable(of source: PostCommentCardSource) -> [FeedComment] {
        guard let root = Self.root(of: source) else { return [] }
        let tree = source.thread.filter { $0.id == root.id || descends(from: root.id, $0, in: source.thread) }
        return chronological(unique(tree).filter { $0.id != source.target.id && isPaintable($0) })
    }

    /// Les cases cochées à l'ouverture de « Choisir les réponses » : le fil jusqu'ici.
    public static func initialChoice(of source: PostCommentCardSource) -> Set<String> {
        Set(threadToHere(of: source).map(\.id).filter { $0 != source.target.id })
    }

    // MARK: - Les blocs

    /// Les blocs de la carte, dans l'ordre — vide quand le mode ne s'offre pas.
    public static func blocks(of source: PostCommentCardSource, mode: PostCommentCardMode,
                              showsPost: Bool, chosen: Set<String> = []) -> [PostCommentCardBlock] {
        guard modes(of: source).contains(mode) else { return [] }
        let head = showsPost ? postHead(of: source) : nil
        let comments: [FeedComment]
        switch mode {
        case .postAndComment, .commentAlone:
            comments = [source.target]
        case .threadToHere:
            comments = threadToHere(of: source)
        case .postRootAndReply:
            guard let root = Self.root(of: source) else { return [] }
            comments = [root, source.target]
        case .chosenReplies:
            comments = choosable(of: source).filter { chosen.contains($0.id) } + [source.target]
        }
        let budget = maxBlocks - (head == nil ? 0 : 1)
        return (head.map { [PostCommentCardBlock.post($0)] } ?? []) + folded(comments, budget: budget, source: source)
    }

    // MARK: - La carte

    /// La carte que l'atelier peint pour ces blocs — `nil` quand rien ne s'image.
    ///
    /// Deux blocs : le premier en citation, le second en réponse. Au-delà, le
    /// premier reste la citation et les suivants s'écrivent comme une
    /// discussion, « Auteur : texte », sous `title` ; le pli dit `foldedLabel`.
    /// - Parameter audioLanguages: la piste SERVIE de chaque son, par identifiant de pièce.
    /// - Parameter heroSupport: le visuel du support en HERO (défaut) ; `false` : la vignette d'avant #10915.
    /// - Parameter headMediaID: le média du support choisi pour la tête (`headMedia(of:)`) ;
    ///   `nil` ou inconnu : `defaultHeadMediaID(of:)`, le premier visuel (#11783).
    ///
    /// **HERO** (#10915) : avec `heroSupport`, le premier visuel du support (post,
    /// réel, story) n'est plus une vignette posée entre la citation et la réponse
    /// mais le HERO de la carte (`MessageCardSubject.heroID`) : grand, pleine
    /// largeur, avant tout texte. La citation devient la ligne du support : son
    /// auteur et un extrait court (`MessageCardHero.excerptLines/Characters`), ou le
    /// symbole du média quand le support n'a pas de texte.
    ///
    /// **FIL** (#10915) : plusieurs commentaires ne s'aplatissent plus, chacun
    /// garde son niveau (`MessageCardPart.thread`) — la racine à 0, ses réponses à
    /// 1 (au plus `MessageCardThread.maxLevel`), mesuré depuis le premier commentaire montré.
    public static func subject(of source: PostCommentCardSource, mode: PostCommentCardMode, showsPost: Bool,
                               chosen: Set<String> = [], title: String, foldedLabel: (Int) -> String,
                               audioLanguages: [String: String] = [:], heroSupport: Bool = true,
                               headMediaID: String? = nil) -> MessageCardSubject? {
        let composed = Self.blocks(of: source, mode: mode, showsPost: showsPost, chosen: chosen)
        guard let first = composed.first, let last = composed.last else { return nil }
        let media = Self.media(of: composed, source: source, audioLanguages: audioLanguages, heroSupport: heroSupport, headMediaID: headMediaID)
        let heroID = heroSupport ? media.head.flatMap { $0.media.kind.isVisual ? $0.media.id : nil } : nil
        var quoted = composed.count > 1 ? part(of: first) : nil
        if heroSupport, media.head != nil, case .post(let head) = first, composed.count > 1 {
            quoted = heroLine(head, media: media.head)
        }
        let rest = composed.count > 1 ? Array(composed.dropFirst()) : composed
        let reply: MessageCardPart
        if rest.count == 1, let only = part(of: last) {
            reply = only
        } else {
            let baseline = composed.compactMap { block -> Int? in
                guard case .comment(let id, _) = block else { return nil }
                return depth(of: id, source: source)
            }.first ?? 0
            let entries = rest.map { block -> MessageCardThreadLine in
                guard case .folded(let count) = block else {
                    let level = commentID(of: block).map { depth(of: $0, source: source) - baseline } ?? 0
                    return MessageCardThreadLine(text: part(of: block).map { "\($0.author) : \($0.text)" } ?? "", level: level)
                }
                return MessageCardThreadLine(text: foldedLabel(count), level: 1)
            }
            reply = MessageCardPart(author: title, text: entries.map(\.text).joined(separator: "\n"), thread: entries)
        }
        return MessageCardSubject(
            quoted: quoted,
            reply: reply,
            sentAt: source.target.timestamp,
            quotedAt: quoted == nil ? nil : time(of: first, source: source),
            media: media.items,
            heroID: heroID
        )
    }

    // MARK: - Le fil

    private static func isProtected(_ comment: FeedComment) -> Bool {
        comment.effects.flags.hasLifecycleEffect
    }

    private static func isPaintable(_ comment: FeedComment) -> Bool {
        !isProtected(comment)
            && (MessageCardText.nonBlank(comment.displayContent) != nil || !MessageCardSubject.paintableMedia(of: comment).isEmpty)
    }

    private static func byId(_ thread: [FeedComment]) -> [String: FeedComment] {
        Dictionary(thread.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    }

    /// La chaîne des ancêtres, de la racine au parent direct — `nil` quand un maillon manque.
    static func ancestors(of source: PostCommentCardSource) -> [FeedComment]? {
        let known = byId(source.thread)
        var chain: [FeedComment] = []
        var next = source.target.parentId
        while let id = next {
            guard let parent = known[id], !chain.contains(where: { $0.id == id }), id != source.target.id else { return nil }
            chain.insert(parent, at: 0)
            next = parent.parentId
        }
        return chain
    }

    /// Les ancêtres qu'on connaît, du parent direct vers la racine, jusqu'au premier maillon manquant.
    private static func knownAncestors(of source: PostCommentCardSource) -> [FeedComment] {
        let known = byId(source.thread)
        var chain: [FeedComment] = []
        var seen: Set<String> = [source.target.id]
        var next = source.target.parentId
        while let id = next, seen.insert(id).inserted, let parent = known[id] {
            chain.append(parent)
            next = parent.parentId
        }
        return chain
    }

    private static func root(of source: PostCommentCardSource) -> FeedComment? {
        ancestors(of: source)?.first
    }

    private static func descends(from rootId: String, _ comment: FeedComment, in thread: [FeedComment]) -> Bool {
        let known = byId(thread)
        var seen: Set<String> = [comment.id]
        var next = comment.parentId
        while let id = next {
            if id == rootId { return true }
            guard seen.insert(id).inserted, let parent = known[id] else { return false }
            next = parent.parentId
        }
        return false
    }

    /// La racine, les réponses peignables écrites jusqu'à la réponse visée, puis elle.
    private static func threadToHere(of source: PostCommentCardSource) -> [FeedComment] {
        guard let chain = ancestors(of: source), !chain.isEmpty else { return [] }
        let ancestorIds = Set(chain.map(\.id))
        let others = choosable(of: source).filter { comment in
            !ancestorIds.contains(comment.id) && comment.timestamp <= source.target.timestamp
        }
        return chronological(chain + others) + [source.target]
    }

    private static func unique(_ comments: [FeedComment]) -> [FeedComment] {
        var seen = Set<String>()
        return comments.filter { seen.insert($0.id).inserted }
    }

    private static func chronological(_ comments: [FeedComment]) -> [FeedComment] {
        unique(comments).enumerated()
            .sorted { $0.element.timestamp == $1.element.timestamp ? $0.offset < $1.offset : $0.element.timestamp < $1.element.timestamp }
            .map(\.element)
    }

    /// Plus de commentaires que de place : la tête, « +N », puis les derniers.
    private static func folded(_ comments: [FeedComment], budget: Int, source: PostCommentCardSource) -> [PostCommentCardBlock] {
        let blocks = comments.map { PostCommentCardBlock.comment(id: $0.id, part: part(of: $0, source: source)) }
        guard blocks.count > budget, budget >= 3, let head = blocks.first else { return blocks }
        let tail = budget - 2
        return [head, .folded(count: blocks.count - 1 - tail)] + blocks.suffix(tail)
    }

    // MARK: - Les parties

    /// Le support (post, réel ou story) tel que la carte le lit : son auteur, son texte, son visuel.
    struct Support {
        let author: String
        let authorId: String
        let username: String?
        let text: String?
        let timestamp: Date
        let media: [MessageCardSubjectMedia]
    }

    /// **L'audience du support** : seul un support `PUBLIC` se fige sur une carte qui part
    /// hors de Meeshy — absente ou restreinte (`FRIENDS`, `COMMUNITY`, `PRIVATE`, `EXCEPT`,
    /// `ONLY`), elle le retient (fail-closed). Jumelle de `isPublicAudience` (shared, web).
    static func isPublicAudience(_ visibility: String?) -> Bool {
        (visibility ?? "").uppercased() == "PUBLIC"
    }

    /// Un post qui DISPARAÎT (story, statut — « Mes stories » l'ouvre par son `FeedPost`)
    /// n'est support que comme une story et PAR SON VISUEL, sous les gardes de la story :
    /// sans visuel, jamais en tête (#11477, jumelle de `composingPostOf`, web).
    static func support(of source: PostCommentCardSource, audioLanguages: [String: String] = [:]) -> Support? {
        if let post = source.post {
            guard !disappears(post) else {
                let story = PostCommentCardStory(feedPost: post)
                return story.heroMedia(now: source.now) == nil ? nil : storySupport(story, source: source)
            }
            guard isPublicAudience(post.visibility) else { return nil }
            let media = postMedia(of: post, audioLanguages: audioLanguages)
            // Une scène sans aucun média ne se lit pas en tête (jumelle de `postHead`, shared).
            guard post.storyEffects == nil || !media.isEmpty else { return nil }
            return Support(
                author: post.author, authorId: post.authorId, username: post.authorUsername,
                text: MessageCardText.nonBlank(source.read(post.displayContent)).map { excerpt($0) },
                timestamp: post.timestamp, media: media
            )
        }
        return source.story.flatMap { storySupport($0, source: source) }
    }

    private static func storySupport(_ story: PostCommentCardStory, source: PostCommentCardSource) -> Support? {
        guard isPublicAudience(story.visibility),
              !StoryItem.isExpired(createdAt: story.timestamp, expiresAt: story.expiresAt, at: source.now) else { return nil }
        // Une story à canvas sans vignette ne s'image pas : le garde d'avant #10915 tient.
        if story.hasCanvas, story.heroMedia(now: source.now) == nil { return nil }
        return Support(
            author: story.author, authorId: story.authorId, username: story.authorUsername,
            text: MessageCardText.nonBlank(story.text.map(source.read)).map { excerpt($0) },
            timestamp: story.timestamp, media: story.heroMedia(now: source.now).map { [$0] } ?? []
        )
    }

    /// Le support en tête : son auteur et son texte servi, tronqué — `nil` quand il ne se met pas en tête.
    static func postHead(of source: PostCommentCardSource) -> MessageCardPart? {
        guard let support = support(of: source) else { return nil }
        guard support.text != nil || !support.media.isEmpty else { return nil }
        let isViewer = !source.viewer.id.isEmpty && support.authorId == source.viewer.id
        return MessageCardPart(
            author: MessageCardSubject.author(isViewer: isViewer, names: [support.author, support.username], viewer: source.viewer),
            text: support.text ?? "",
            handle: support.username
        )
    }

    /// **La ligne du support sous son hero** (#10915) : son auteur et un extrait COURT ;
    /// sans texte, le symbole de son média — la citation vide disparaîtrait avec son auteur.
    static func heroLine(_ head: MessageCardPart, media: MessageCardSubjectMedia?) -> MessageCardPart {
        let short = MessageCardText.nonBlank(head.text).map { excerpt($0, lines: MessageCardHero.excerptLines, characters: MessageCardHero.excerptCharacters) }
        let text = short ?? media.map { symbol(of: $0.media.kind) } ?? ""
        return MessageCardPart(author: head.author, text: text, handle: head.handle)
    }

    /// Une story ou un statut disparaît : il ne se fige pas en tête d'une image. Un post ou un
    /// réel composé avec la SCÈNE porte `storyEffects` sans disparaître pour autant — le
    /// compter ici le faisait échoir 20 h après sa publication, comme une story (#11783).
    private static func disappears(_ post: FeedPost) -> Bool {
        let type = (post.type ?? "").uppercased()
        return type == "STORY" || type == "STATUS"
    }

    /// Le texte du post, lisible : `maxPostLines` lignes, `maxPostCharacters` caractères, coupé à un mot.
    static func excerpt(_ text: String, lines maxLines: Int = maxPostLines, characters maxCharacters: Int = maxPostCharacters) -> String {
        let lines = text.trimmingCharacters(in: .whitespacesAndNewlines).components(separatedBy: "\n")
        var kept = lines.prefix(maxLines).joined(separator: "\n")
        var cut = lines.count > maxLines
        if kept.count > maxCharacters {
            let prefix = String(kept.prefix(maxCharacters))
            let boundary = prefix.lastIndex(where: { $0 == " " || $0 == "\n" })
            kept = boundary.map { String(prefix[..<$0]) } ?? prefix
            cut = true
        }
        return cut ? kept.trimmingCharacters(in: .whitespacesAndNewlines) + "…" : kept
    }

    private static func part(of comment: FeedComment, source: PostCommentCardSource) -> MessageCardPart {
        let shown = comment.id == source.target.id && source.showOriginal ? comment.content : comment.displayContent
        let text = MessageCardText.nonBlank(source.read(shown)) ?? MessageCardSubject.paintableMedia(of: comment).map { symbol(of: $0.media.kind) }.joined(separator: " ")
        let isViewer = !source.viewer.id.isEmpty && comment.authorId == source.viewer.id
        return MessageCardPart(
            author: MessageCardSubject.author(isViewer: isViewer, names: [comment.author, comment.authorUsername], viewer: source.viewer),
            text: text,
            handle: comment.authorUsername
        )
    }

    private static func part(of block: PostCommentCardBlock) -> MessageCardPart? {
        switch block {
        case .post(let part), .comment(_, let part): return part
        case .folded: return nil
        }
    }

    private static func time(of block: PostCommentCardBlock, source: PostCommentCardSource) -> Date? {
        switch block {
        case .post: return support(of: source)?.timestamp
        case .comment(let id, _): return id == source.target.id ? source.target.timestamp : byId(source.thread)[id]?.timestamp
        case .folded: return nil
        }
    }

    private static func symbol(of kind: MessageCardMediaKind) -> String {
        switch kind {
        case .image: return "📷"
        case .video: return "🎬"
        case .audio: return "🎤"
        }
    }

    // MARK: - Les médias

    /// Les médias du post qui peuvent être en tête : chaque photo, vidéo et son, dans leur ordre (#11783).
    private static func postMedia(of post: FeedPost, audioLanguages: [String: String] = [:]) -> [MessageCardSubjectMedia] {
        MessageCardSubject.paintableMedia(of: post.media, audioLanguages: audioLanguages)
    }

    /// Le média choisi pour la tête parmi `candidates` — à défaut, le premier visuel, puis le premier.
    private static func chosen(_ candidates: [MessageCardSubjectMedia], id: String?) -> MessageCardSubjectMedia? {
        id.flatMap { id in candidates.first { $0.media.id == id } }
            ?? candidates.first { $0.media.kind.isVisual }
            ?? candidates.first
    }

    /// Le média CHOISI du support en tête (#11783), puis les médias des commentaires peints —
    /// les plus récents. Avec `heroSupport`, il ne porte pas d'auteur (c'est le support) : un
    /// visuel devient le HERO de la carte, un son se peint comme le son de la carte. Il compte
    /// dans le plafond `maxMedia`.
    private static func media(of blocks: [PostCommentCardBlock], source: PostCommentCardSource, audioLanguages: [String: String],
                              heroSupport: Bool, headMediaID: String?) -> (items: [MessageCardSubjectMedia], head: MessageCardSubjectMedia?) {
        let known = byId(source.thread + [source.target])
        let quotes = blocks.count > 1
        let painted = blocks.enumerated().map { (index, block) -> [MessageCardSubjectMedia] in
            let isQuoted = quotes && index == 0
            switch block {
            case .post(let part):
                let author = MessageCardMediaAuthor(name: part.author, handle: part.handle, isQuoted: isQuoted)
                let pick = chosen(support(of: source, audioLanguages: audioLanguages)?.media ?? [], id: headMediaID)
                return pick.map { [heroSupport ? $0.by(nil) : $0.by(author)] } ?? []
            case .comment(let id, let part):
                guard let comment = known[id] else { return [] }
                let author = MessageCardMediaAuthor(name: part.author, handle: part.handle, isQuoted: isQuoted)
                return MessageCardSubject.paintableMedia(of: comment, audioLanguages: audioLanguages).map { $0.by(author) }
            case .folded:
                return []
            }
        }
        let head: MessageCardSubjectMedia? = blocks.first.flatMap { first in
            guard case .post = first else { return nil }
            return painted[0].first
        }
        let rest = Array(painted.dropFirst(head == nil ? 0 : 1).joined())
        let headItems = head.map { [$0] } ?? []
        return (headItems + rest.suffix(max(0, maxMedia - headItems.count)), heroSupport ? head : nil)
    }

    // MARK: - L'imbrication

    /// La profondeur d'un commentaire dans l'arbre : le nombre de ses ancêtres connus.
    static func depth(of id: String, source: PostCommentCardSource) -> Int {
        let known = byId(source.thread + [source.target])
        var seen: Set<String> = [id]
        var depth = 0
        var next = known[id]?.parentId
        while let parent = next, known[parent] != nil, seen.insert(parent).inserted {
            depth += 1
            next = known[parent]?.parentId
        }
        return depth
    }

    private static func commentID(of block: PostCommentCardBlock) -> String? {
        guard case .comment(let id, _) = block else { return nil }
        return id
    }
}
