import Foundation

/// **LE MÉDIA DU POST QU'UN COMMENTAIRE CITE** (#6578) — côté lecture.
///
/// Le serveur ne GRAVE que deux choses : l'ancre du saut (`postMediaId`) et la
/// NATURE du média (`kind`). Tout ce qui le DÉCRIT — vignette, URL, nom,
/// taille, durée, légende — est RELU à chaque service et voyage à côté, dans
/// `media`. Le modèle reproduit cette frontière plutôt que de l'aplatir : c'est
/// elle, et elle seule, qui fait qu'un média supprimé ou détaché de sa
/// publication dit **« une photo »** et rien de plus, au lieu de ressusciter
/// une vignette que personne n'a plus le droit de voir.
///
/// > `media == nil` n'est donc PAS une erreur de décodage : c'est l'état
/// > nominal d'une citation dont la cible n'existe plus. Une vue qui en fait un
/// > cas d'échec vide la citation au lieu de la dégrader.
public struct CommentQuotedMedia: Codable, Sendable, Equatable, Identifiable {

    /// La NATURE, le seul fait descriptif qui survit à la disparition du média.
    /// Dérivée du MIME par le serveur — jamais déclarée par le client, pour
    /// qu'une citation ne puisse pas dire « un fichier » sur une vidéo.
    public enum Kind: String, Codable, Sendable {
        case image, video, audio, location, file

        /// Le symbole qui tient lieu de vignette quand le média n'est plus
        /// rattrapable — c'est la MOITIÉ figée qui parle, donc elle ne peut
        /// rien dire de plus précis que la nature.
        public var symbolName: String {
            switch self {
            case .image: return "photo"
            case .video: return "play.rectangle"
            case .audio: return "waveform"
            case .location: return "mappin.and.ellipse"
            case .file: return "doc"
            }
        }
    }

    /// L'ancre du saut — toujours un média du post COMMENTÉ (le serveur refuse
    /// l'écriture autrement, et revérifie à chaque service).
    public let postMediaId: String
    public let kind: Kind
    /// La moitié RELUE. `nil` ⇒ le média n'existe plus, ou il a quitté le post.
    public let media: FeedMedia?

    public var id: String { postMediaId }

    public init(postMediaId: String, kind: Kind, media: FeedMedia? = nil) {
        self.postMediaId = postMediaId
        self.kind = kind
        self.media = media
    }

    /// Ce que la citation MONTRE : la vignette relue, sinon rien. Séparé de
    /// `media` pour que l'appelant n'ait pas à choisir entre `thumbnailUrl` et
    /// `url` — la règle est la même partout et n'a qu'un site.
    public var thumbnailURL: String? {
        guard let media else { return nil }
        return media.thumbnailUrl ?? media.url
    }

    /// **L'égalité porte sur ce qui se VOIT, et elle est écrite à la main.**
    ///
    /// `FeedMedia` n'est pas `Equatable` — il porte un `@LossyImageVariants`
    /// dont la synthèse ne peut rien tirer — donc la comparaison ne peut pas
    /// être dérivée. C'est un bien : la seule question qu'une vue de liste pose
    /// à cette égalité est *« dois-je me repeindre ? »*, et la réponse dépend de
    /// l'ancre, de la nature, et des DEUX champs relus que la citation rend —
    /// sa vignette et sa légende. Comparer le média entier ferait repeindre sur
    /// un changement de transcription que personne ne regarde ici.
    public static func == (gauche: CommentQuotedMedia, droite: CommentQuotedMedia) -> Bool {
        gauche.postMediaId == droite.postMediaId
            && gauche.kind == droite.kind
            && gauche.thumbnailURL == droite.thumbnailURL
            && gauche.media?.caption == droite.media?.caption
    }
}

/// Ce que le fil porte : les DEUX moitiés, sous deux clés.
///
/// `quotedPostMedia` est hissé par la passerelle depuis
/// `metadata.quotedPostMedia` (même geste que `trackingLinks` et `location`) ;
/// `quotedMedia` est la ligne relue. Les recoller est le travail d'un seul
/// site — `APIPostComment.quotedCitation` — pour qu'aucune vue n'ait à savoir
/// qu'il y en avait deux.
public struct APIQuotedPostMediaRef: Decodable, Sendable, Equatable {
    public let postMediaId: String
    /// Chaîne et non `Kind` : une nature INCONNUE d'une version ultérieure ne
    /// doit pas faire échouer le décodage du commentaire ENTIER. Elle retombe
    /// sur `.file` au recollement — « une pièce jointe », ce qui est vrai.
    public let kind: String

    public init(postMediaId: String, kind: String) {
        self.postMediaId = postMediaId
        self.kind = kind
    }
}
