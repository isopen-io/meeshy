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

    /// **Ce que le FORMAT exige du canvas pour partir** (directive porteur
    /// 2026-09-06).
    ///
    /// > « Il faut juste rendre impossible la publication de canvas vide sans
    /// > texte, ni autre type d'object ! »
    ///
    /// Deux formats, deux exigences, et c'est voulu :
    ///
    /// - **une STORY** se publie sur un fond CHOISI — c'est le geste le plus
    ///   court qui produise une story qu'on peut regarder, décision #4741,
    ///   testée ;
    /// - **un POST** exige un OBJET. Une page de couleur nue n'y dit rien à
    ///   personne, et sa carte dans le fil serait un rectangle muet.
    ///
    /// La bifurcation vit ICI plutôt qu'aux deux sites qui la lisent — la
    /// flèche et le plan d'envoi. Les y écrire toutes deux serait deux
    /// occasions de les corriger à moitié, et l'écart entre elles a un nom
    /// mesuré : un bouton armé sur une composition que le plan refuse.
    static func hasPublishableCanvas(format: ComposerFormat,
                                     slides: [StorySlide],
                                     slideImageIds: Set<String>) -> Bool {
        switch format {
        case .story:
            return StorySlidePublishMatter.anySlideDeservesAPost(slides, slideImageIds: slideImageIds)
        case .post, .status, .reel:
            return StorySlidePublishMatter.anySlideCarriesObject(slides, slideImageIds: slideImageIds)
        }
    }
}

// MARK: - Ce qui PART, quand la publication a plusieurs slides

extension ComposerStoryCanvas {

    /// **La slide que le brouillon emporte — et TOUT ce qui l'accompagne**
    /// (directive porteur 2026-09-06).
    ///
    /// ## Le défaut que cette règle ferme
    ///
    /// Le socle posait `viewModel.currentSlide.effects` : la slide COURANTE, et
    /// elle seule. Composer trois slides, en publier une. Le fil, le détail et
    /// le plein écran savaient pourtant montrer plusieurs scènes depuis le même
    /// jour — mosaïque, carrousel, défilement vertical, tuile qui ouvre SA
    /// scène —, et aucune de ces surfaces ne pouvait s'afficher.
    ///
    /// > C'est la forme la plus coûteuse du défaut « une vue sans
    /// > consommateur » : quatre surfaces livrées, testées, correctes, et rien
    /// > à leur donner à peindre. Rien ne rougit — il n'y a pas de site où ça
    /// > pourrait.
    ///
    /// ## Comment les scènes voyagent sans qu'aucun porteur ne change de forme
    ///
    /// Le runtime (`StoryEffects`) décrit UNE slide, et c'est lui que le
    /// brouillon, l'intention de publication et la file hors-ligne
    /// transportent. Les autres slides voyagent dans `canvasV3`, la propriété
    /// que le décodage remplit DÉJÀ à la lecture d'un document v3 :
    /// `StoryEffects.encode` compose la première scène depuis le runtime et
    /// garde les suivantes du document (`CanvasV3.init(migrating:keeping:)`).
    ///
    /// Aucune signature ne change — ni le brouillon, ni `PublishIntent`, ni la
    /// file. C'est ce qui rend ce lot possible sans toucher trois fichiers déjà
    /// hors du budget de taille.
    ///
    /// ## Pourquoi la PREMIÈRE slide et non la courante
    ///
    /// Le runtime devient la scène 1. Partir de la slide courante ferait de la
    /// slide qu'on regardait au moment d'appuyer la première scène de la
    /// publication — l'ordre de lecture dépendrait alors du hasard du geste.
    ///
    /// ## La DISPOSITION voyage avec les scènes
    ///
    /// Le fil honore cinq dispositions ; le composer n'en choisissait aucune,
    /// donc `layout` partait toujours `nil` et toute publication s'affichait
    /// dans le repli. Quatre dispositions écrites, testées et peintes étaient
    /// inatteignables depuis l'app.
    ///
    /// `nil` reste une réponse LÉGITIME et c'est le défaut : il signifie « je
    /// n'impose rien », et `CanvasV3.resolvedLayout` tranche. Écrire le repli en
    /// dur ici figerait dans chaque publication une valeur que personne ne
    /// relirait le jour où le repli change.
    ///
    /// - Parameter slides: toutes les slides de l'atelier, dans l'ordre.
    /// - Parameter layout: la disposition demandée par l'auteur. `nil` ⇒ aucune
    ///   n'est imposée. Elle n'est portée que là où elle a un effet — mêmes
    ///   termes que `ComposerMosaicChoice.isServed`, et l'invariant est éprouvé
    ///   en interrogeant les deux ensemble.
    /// - Returns: `nil` quand aucune scène n'est à l'écran — un canvas vide
    ///   encodé ferait croire à une scène composée puis effacée.
    static func publishedSlide(format: ComposerFormat,
                               sceneIsPresent: Bool,
                               slides: [StorySlide],
                               layout: MosaicLayoutMode? = nil) -> StoryEffects? {
        guard sceneIsPresent, let premiere = slides.first else { return nil }
        // Une seule slide, ou un canal qui ne publie pas de document : rien ne
        // change — le comportement est celui d'avant ce lot, à l'identique.
        guard slides.count > 1,
              ComposerPublishChannel.channel(for: format) == .document
        else { return premiere.effects }
        var runtime = premiere.effects
        runtime.canvasV3 = CanvasV3(migrating: slides.map(\.effects), layout: layout)
        return runtime
    }
}
