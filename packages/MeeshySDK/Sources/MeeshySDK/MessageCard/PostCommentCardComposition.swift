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
    public let target: FeedComment
    public let thread: [FeedComment]
    public let viewer: MessageCardSubject.Viewer
    /// La ligne du commentaire visé montre son original (puce de langue).
    public let showOriginal: Bool

    public init(post: FeedPost?, target: FeedComment, thread: [FeedComment], viewer: MessageCardSubject.Viewer, showOriginal: Bool = false) {
        self.post = post
        self.target = target
        self.thread = thread
        self.viewer = viewer
        self.showOriginal = showOriginal
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
/// qui disparaît (story, statut) ou sans rien à montrer ne se met pas en tête.
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

    /// Le mode d'ouverture : « Post + commentaire » ou « Fil jusqu'ici ».
    public static func defaultMode(of source: PostCommentCardSource) -> PostCommentCardMode? {
        modes(of: source).first
    }

    /// Le post peut-il être en tête de cette carte ?
    public static func offersPost(_ source: PostCommentCardSource) -> Bool {
        postHead(of: source) != nil
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
    public static func subject(of source: PostCommentCardSource, mode: PostCommentCardMode, showsPost: Bool,
                               chosen: Set<String> = [], title: String, foldedLabel: (Int) -> String,
                               audioLanguages: [String: String] = [:]) -> MessageCardSubject? {
        let composed = Self.blocks(of: source, mode: mode, showsPost: showsPost, chosen: chosen)
        guard let first = composed.first, let last = composed.last else { return nil }
        let quoted = composed.count > 1 ? part(of: first) : nil
        let rest = composed.count > 1 ? Array(composed.dropFirst()) : composed
        let reply: MessageCardPart
        if rest.count == 1, let only = part(of: last) {
            reply = only
        } else {
            let lines = rest.map { block -> String in
                guard case .folded(let count) = block else { return part(of: block).map { "\($0.author) : \($0.text)" } ?? "" }
                return foldedLabel(count)
            }
            reply = MessageCardPart(author: title, text: lines.joined(separator: "\n"))
        }
        return MessageCardSubject(
            quoted: quoted,
            reply: reply,
            sentAt: source.target.timestamp,
            quotedAt: quoted == nil ? nil : time(of: first, source: source),
            media: media(of: composed, source: source, audioLanguages: audioLanguages)
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

    /// Le post en tête : son auteur et son texte servi, tronqué — `nil` quand il ne se met pas en tête.
    static func postHead(of source: PostCommentCardSource) -> MessageCardPart? {
        guard let post = source.post, !disappears(post) else { return nil }
        let text = MessageCardText.nonBlank(post.displayContent).map(excerpt)
        guard text != nil || !postMedia(of: post).isEmpty else { return nil }
        let isViewer = !source.viewer.id.isEmpty && post.authorId == source.viewer.id
        return MessageCardPart(
            author: MessageCardSubject.author(isViewer: isViewer, names: [post.author, post.authorUsername], viewer: source.viewer),
            text: text ?? "",
            handle: post.authorUsername
        )
    }

    /// Une story ou un statut disparaît : il ne se fige pas en tête d'une image.
    private static func disappears(_ post: FeedPost) -> Bool {
        let type = (post.type ?? "").uppercased()
        return type == "STORY" || type == "STATUS" || post.storyEffects != nil
    }

    /// Le texte du post, lisible : `maxPostLines` lignes, `maxPostCharacters` caractères, coupé à un mot.
    static func excerpt(_ text: String) -> String {
        let lines = text.trimmingCharacters(in: .whitespacesAndNewlines).components(separatedBy: "\n")
        var kept = lines.prefix(maxPostLines).joined(separator: "\n")
        var cut = lines.count > maxPostLines
        if kept.count > maxPostCharacters {
            let prefix = String(kept.prefix(maxPostCharacters))
            let boundary = prefix.lastIndex(where: { $0 == " " || $0 == "\n" })
            kept = boundary.map { String(prefix[..<$0]) } ?? prefix
            cut = true
        }
        return cut ? kept.trimmingCharacters(in: .whitespacesAndNewlines) + "…" : kept
    }

    private static func part(of comment: FeedComment, source: PostCommentCardSource) -> MessageCardPart {
        let shown = comment.id == source.target.id && source.showOriginal ? comment.content : comment.displayContent
        let text = MessageCardText.nonBlank(shown) ?? MessageCardSubject.paintableMedia(of: comment).map { symbol(of: $0.media.kind) }.joined(separator: " ")
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
        case .post: return source.post?.timestamp
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

    /// La vignette du post : sa première photo ou vidéo.
    private static func postMedia(of post: FeedPost) -> [MessageCardSubjectMedia] {
        Array(MessageCardSubject.paintableMedia(of: post.media).filter { $0.media.kind.isVisual }.prefix(1))
    }

    /// La vignette du post en tête, puis les médias des commentaires peints — les plus récents.
    private static func media(of blocks: [PostCommentCardBlock], source: PostCommentCardSource,
                              audioLanguages: [String: String]) -> [MessageCardSubjectMedia] {
        let known = byId(source.thread + [source.target])
        let quotes = blocks.count > 1
        let painted = blocks.enumerated().map { (index, block) -> [MessageCardSubjectMedia] in
            let isQuoted = quotes && index == 0
            switch block {
            case .post(let part):
                let author = MessageCardMediaAuthor(name: part.author, handle: part.handle, isQuoted: isQuoted)
                return (source.post.map(postMedia(of:)) ?? []).map { $0.by(author) }
            case .comment(let id, let part):
                guard let comment = known[id] else { return [] }
                let author = MessageCardMediaAuthor(name: part.author, handle: part.handle, isQuoted: isQuoted)
                return MessageCardSubject.paintableMedia(of: comment, audioLanguages: audioLanguages).map { $0.by(author) }
            case .folded:
                return []
            }
        }
        let head = blocks.first.map { first -> [MessageCardSubjectMedia] in
            guard case .post = first else { return [] }
            return painted[0]
        } ?? []
        let rest = Array(painted.dropFirst(head.isEmpty ? 0 : 1).joined())
        return head + rest.suffix(max(0, maxMedia - head.count))
    }
}
