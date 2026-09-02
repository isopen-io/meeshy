import Foundation

/// **Par où part ce qu'on vient de composer** (#4869).
///
/// ## Le défaut
///
/// Un Réel composé depuis le Feed ne partait JAMAIS. Deux photos, l'éventail
/// l'offre, on le choisit, on touche la flèche — rien. Aucune requête, aucun
/// post, le composer reste ouvert.
///
/// `DocumentComposerDoor.publish(_:)` refuse `.story` et `.reel` : un
/// fail-closed JUSTE, `ComposerDocumentDraft` portant du texte, des pièces
/// jointes et un lieu, jamais des slides. La story contournait ce refus ; le
/// réel descendait droit dessus.
///
/// ## Pourquoi une RÈGLE, et pas une condition de plus
///
/// Le routage s'écrivait `if selectedFormat == .story` — une LISTE de formats
/// dans le corps d'un publieur, donc hors de portée de tout témoin. #4751 a
/// fait rejoindre le meuble aux DEUX formats dans le même lot ; un seul a vu sa
/// publication routée.
///
/// Et le commentaire qui décrit le piège a été écrit par ce lot-là :
///
/// > « Router une surface et router sa PUBLICATION sont deux gestes. Le premier
/// > se voit à l'écran ; le second ne se voit qu'à l'ARRIVÉE, sur un contenu
/// > qu'on ne peut plus rattraper. »
///
/// ## Le critère : où la MATIÈRE vit
///
/// | canal | formats | ce que l'auteur y compose |
/// |---|---|---|
/// | `.scene` | story | des objets, des slides, un fond — `viewModel.slides` |
/// | `.document` | post, mood | du texte, des pièces jointes, un lieu, un emoji |
/// | `.unsupported` | **réel** | rien encore — voir ci-dessous |
///
/// ## Pourquoi le réel n'a PAS le canal de la scène
///
/// Il y a été routé, puis retiré le jour même, et la mesure vaut d'être gardée :
/// **le canal de la scène publie UN POST PAR SLIDE**
/// (`StoryViewModel+PublicationUpload` : `for (slideIdx, slide) in upload.slides.enumerated()`).
/// C'est juste pour une story, dont chaque unité EST une publication. Un réel
/// est UNE publication portant plusieurs médias — mesuré au simulateur : un réel
/// de deux photos y a produit **deux posts distincts** au lieu d'un.
///
/// > Le silence d'avant était un défaut ; publier deux posts au lieu d'un en est
/// > un PIRE, et d'une autre nature — il ne se voit qu'à l'ARRIVÉE, sur un
/// > contenu qu'on ne peut plus rattraper. C'est mot pour mot ce que le
/// > commentaire de `performSoclePublish` avertissait, et c'est en le vérifiant
/// > au simulateur, pas au gate, que le piège s'est refermé.
///
/// `.unsupported` est donc la vérité du jour, et elle est ÉCRITE : le refus le
/// dit à l'auteur au lieu de ne rien faire. Le vrai canal du réel — une
/// publication, N médias — est un lot à part (#4869).
///
/// **Ce n'est pas la SURFACE montée.** Un post à photos monte la surface de
/// scène (`documentHasScene`) et publie pourtant par le document, ce qui
/// fonctionne depuis #4514 : router sur la surface le ferait changer de canal
/// sans qu'on l'ait décidé. Le critère est ce que le format EST, pas ce que
/// l'écran montre à cet instant.
nonisolated enum ComposerPublishChannel {

    enum Channel: Equatable {
        /// `publishStoryScene()` — les unités d'histoire, avec leurs objets.
        /// **Il publie UN POST PAR SLIDE** : c'est la sémantique d'une story,
        /// dont chaque unité est une publication à part entière.
        case scene
        /// `publishDocument()` — le brouillon, avec son texte et ses pièces jointes.
        case document
        /// **Aucun canal ne sait porter ce format** — le refus est EXPLICITE,
        /// jamais un silence ni un canal approchant.
        case unsupported
    }

    /// Le `switch` est EXHAUSTIF, et c'est le gain : un cinquième format ne
    /// compilera pas tant qu'on n'aura pas décidé par où il part. La liste
    /// qu'il remplace rendait `.document` en silence pour tout ce qu'elle ne
    /// nommait pas — c'est ainsi que le réel est resté dehors.
    static func channel(for format: ComposerFormat) -> Channel {
        switch format {
        case .story: return .scene
        case .post, .status: return .document
        case .reel: return .unsupported
        }
    }
}
