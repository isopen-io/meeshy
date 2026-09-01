import Foundation
import MeeshySDK

/// **Ce qu'une STORY est dans le nouveau composer** (directive porteur
/// 2026-09-01).
///
/// > « Il faut déjà désactiver dans le nouveau composer de charger l'autre vue
/// > de composer de story, et de simplement mettre à jour le type du champ en
/// > story, créer un canvas automatiquement si inexistant, enlever les éléments
/// > de la rangée canonique car destinés pour les posts. »
///
/// ## Ce que « canvas » veut dire n'est pas le même mot selon le format
///
/// > « Pour un réel et un post, les canvas sont les médias du réel ; pour une
/// > story, les canvas sont des unités d'histoire à publier l'une après
/// > l'autre. »
///
/// C'est la phrase qui gouverne tout ce fichier. Pour un POST, une slide naît
/// d'un média ingéré (`syncPostMediaIntoSlides`) : sans média, il n'y a rien à
/// cadrer, et le composer montre un document. Pour une STORY, la slide EST
/// l'unité de publication — elle précède tout contenu, puisque c'est elle qu'on
/// remplit. Attendre un média pour la faire naître, c'est demander à l'auteur
/// de fournir la matière avant de lui donner la page.
///
/// ## Pourquoi une règle plutôt que deux conditions dans le meuble
///
/// Les deux questions ci-dessous se posent à des instants différents — l'une à
/// chaque passe de rendu, l'autre au changement de format — et gouvernent des
/// choses différentes : ce qu'on MONTE, et ce qu'on SÈME. Écrites en ligne dans
/// le host, elles auraient été deux conditions sur le même format qu'un
/// correctif futur aurait fait diverger sans qu'aucun témoin ne tombe.
nonisolated enum ComposerStoryCanvas {

    /// **La story montre TOUJOURS son canvas.**
    ///
    /// `documentHasScene` répond « y a-t-il de la matière à cadrer ? » — un fond
    /// choisi, un média monté en slide. C'est la bonne question pour un POST,
    /// dont la scène est une INCRUSTATION optionnelle dans un document. Ce n'en
    /// est pas une pour une story, qui n'est rien d'autre que ses canvas : lui
    /// appliquer le prédicat du post la laisserait sur l'écran document tant
    /// qu'elle est vide, c'est-à-dire exactement au moment où l'auteur en a
    /// besoin.
    ///
    /// **La question du MOOD reste posée à `documentHasScene`**, volontairement.
    /// `ComposerMoodGate` demande si la composition ressemble à un mood ; y
    /// injecter « et c'est une story » ferait décider l'OFFRE de formats par le
    /// format déjà choisi — une boucle, et l'éventail se refermerait sous les
    /// doigts de l'auteur.
    static func showsCanvas(format: ComposerFormat, documentHasScene: Bool) -> Bool {
        format == .story || documentHasScene
    }

    /// **Faut-il semer la première unité d'histoire ?**
    ///
    /// Défensive plus que nécessaire : `StoryComposerViewModel` naît avec
    /// `slides = [StorySlide()]`. Mais le meuble ne CONTRÔLE pas cette
    /// naissance — il reçoit un modèle de vue, qu'une reprise de brouillon, une
    /// republication ou un chemin futur peuvent lui tendre vide. Une story sans
    /// aucune slide montrerait un canvas qui ne rend rien, et le rail des
    /// unités n'aurait aucun voisin à côté de qui poser la suivante.
    ///
    /// > Une invariante qu'on tient d'un AUTRE module n'est pas une invariante
    /// > qu'on tient. Le coût de la vérifier est un `isEmpty`.
    static func needsSeedSlide(format: ComposerFormat, slideCount: Int) -> Bool {
        format == .story && slideCount == 0
    }

    /// **Y a-t-il de quoi publier ?**
    ///
    /// Le gate du document mesure `documentText`, `documentLocalMedia` et
    /// `documentLocation` — les trois choses qu'un POST compose. Une story n'en
    /// remplit aucune : elle se compose EN POSANT des objets sur ses canvas, et
    /// le meuble la trouverait donc éternellement vide. La flèche refuserait
    /// sans rien dire, sur un écran plein de travail.
    ///
    /// **Le semis ne compte pas comme de la matière**, et c'est tout l'objet de
    /// cette fonction : `needsSeedSlide` vient de garantir qu'une slide existe
    /// TOUJOURS. Compter les slides rendrait donc « publiable » une story qu'on
    /// vient d'ouvrir et où personne n'a rien posé.
    ///
    /// > Ce qu'on sème pour donner une page à l'auteur ne doit jamais compter
    /// > comme ce que l'auteur y a écrit.
    /// **Une règle, un site** (#4741). Elle vivait ICI en toutes lettres et
    /// dans `StoryComposerView` sous un autre nom, et les deux divergeaient
    /// dans les DEUX sens : une pastille de lieu seule n'armait pas la flèche,
    /// un fond choisi seul l'armait puis se faisait jeter par le filtre de
    /// publication. Le meuble ne la réécrit plus — il la DEMANDE.
    ///
    /// - Parameter slideImageIds: les slides qui portent un bitmap de fond. Il
    ///   ne vit pas dans `effects` : sans lui, une story-photo n'armerait pas
    ///   la flèche.
    static func hasMatter(slides: [StorySlide], slideImageIds: Set<String>) -> Bool {
        StorySlidePublishMatter.anySlideDeservesAPost(slides, slideImageIds: slideImageIds)
    }
}
