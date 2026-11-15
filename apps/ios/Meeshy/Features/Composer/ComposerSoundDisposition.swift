import Foundation
import MeeshySDK
import MeeshyUI

/// **Ce qu'un son DEVIENT quand un autre prend sa place, et où il reste
/// visible** (#4695, directive porteur 2026-09-01 : « normalement deux vocaux en fond
/// = 2 cartes »).
///
/// ## Le défaut que ce type remplace
///
/// #4676 avait raison sur le symptôme — poser un fond alors qu'un fond existait
/// ne faisait rien — et tort sur le remède : il SUPPRIMAIT l'occupant. Trois
/// gestes plus tard, l'auteur avait perdu deux enregistrements sans qu'aucun
/// écran ne le lui dise. Un défaut qui perd des données en silence ne se
/// corrige pas par un autre défaut qui en perd d'autres, plus discrètement.
///
/// > Une slide a UNE ambiance et N sons posés. Prendre la place de l'ambiance
/// > n'est pas prendre la vie du son qui l'occupait : il DESCEND, et sa carte
/// > le prouve.
///
/// ## Pourquoi trois issues et pas deux
///
/// La carte d'un son de contenu se dessine depuis `documentLocalMedia` — donc
/// depuis un FICHIER. Un son de l'étagère n'en a pas : son crédit voyage par
/// `soundId`, et le rétrograder lui fabriquerait une carte que rien n'alimente.
/// Et un son DÉJÀ servi en contenu (le cas que `ComposerSoundColumn.avatarBadge`
/// masque) a déjà la sienne : le rétrograder la doublerait. Les trois cas ne
/// diffèrent pas par leur gravité mais par ce que l'écran peut MONTRER — c'est
/// pourquoi ils sont énumérés ici plutôt que devinés au site d'appel.
nonisolated enum ComposerSupersededBackground {

    /// Le sort réservé au fond qu'on remplace.
    enum Fate: Equatable {

        /// Aucun fond en place — rien à déplacer.
        case none

        /// Il descend en son de CONTENU, où sa carte le rend visible, ré-ouvrable
        /// et supprimable. C'est le cas nominal.
        case demoteToContent(id: String, url: URL)

        /// Il part pour de bon : aucune carte ne pourrait le porter. Deux
        /// raisons, et elles ne se ressemblent pas — pas de fichier local (un
        /// emprunt), ou une carte qui existe DÉJÀ sous cette URL.
        case discard(id: String)
    }

    /// - Parameters:
    ///   - background: le fond actuellement servi (`resolvedBackgroundAudio`).
    ///   - audioObjects: les objets audio de la slide — un fond LEGACY
    ///     synthétisé n'y figure pas, et `supersededId` rend alors `nil`.
    ///   - localURL: le fichier du fond, s'il en a un.
    ///   - contentMediaURLs: ce que la colonne CONTENU sert déjà.
    static func fate(background: StoryAudioPlayerObject?,
                     audioObjects: [StoryAudioPlayerObject],
                     localURL: URL?,
                     contentMediaURLs: [URL]) -> Fate {
        guard let id = ComposerBackgroundSoundReplacement.supersededId(
            background: background, audioObjects: audioObjects
        ) else { return .none }
        guard let localURL else { return .discard(id: id) }
        guard !contentMediaURLs.contains(localURL) else { return .discard(id: id) }
        return .demoteToContent(id: id, url: localURL)
    }
}

/// **L'ordre des cartes est celui de la POSE, et une ÉDITION ne le change pas**
/// (#4698).
///
/// Défaut mesuré au simulateur le 2026-09-01 : rouvrir la première carte puis
/// valider sans rien changer la renvoyait en DERNIÈRE position. `applyCreatedAudio`
/// faisait `removeAll` puis `append` — deux gestes qui, ensemble, disent
/// « supprime et repose », alors que l'auteur avait dit « modifie ».
///
/// > L'ordre de la pose est le seul que l'auteur puisse prévoir. Le voir bouger
/// > sous un geste qui ne l'a pas demandé fait douter de tout le reste de
/// > l'écran — et le doute coûte plus cher que la ligne qu'il aurait fallu.
///
/// Le rognage complique le cas : `AudioSegmentExporter` rend une URL NEUVE dès
/// qu'il découpe. La clé de recherche est donc l'URL ÉDITÉE, la valeur posée
/// celle du fichier SERVI — deux URL différentes pour une seule carte, à la même
/// place.
nonisolated enum ComposerMediaOrder {

    /// Remplace la pièce d'URL `editedURL` PAR `replacement`, à son index.
    /// `editedURL` inconnue ou `nil` ⇒ la pièce s'ajoute à la fin : c'est une
    /// POSE, pas une édition.
    static func replacing(_ media: [ComposerDocumentMedia],
                          at editedURL: URL?,
                          with replacement: ComposerDocumentMedia) -> [ComposerDocumentMedia] {
        guard let editedURL,
              let index = media.firstIndex(where: { $0.url == editedURL })
        else { return media + [replacement] }
        var copie = media
        copie[index] = replacement
        return copie
    }

    /// Retire la pièce d'URL `url`. Une URL inconnue laisse la liste intacte —
    /// supprimer deux fois le même son ne doit pas emporter un voisin.
    static func removing(_ media: [ComposerDocumentMedia], at url: URL) -> [ComposerDocumentMedia] {
        media.filter { $0.url != url }
    }
}
