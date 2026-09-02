import Foundation
import MeeshySDK
import MeeshyUI

/// **Ce que la ligne de l'AVATAR a le droit d'afficher** (#4670).
///
/// > Directive porteur 2026-09-01 : « Un son mis sur le contenu ne doit pas
/// > apparaître à côté de l'avatar ! »
///
/// ## Deux places, deux propos
///
/// | place | ce qu'elle dit | ce qui l'alimente |
/// |---|---|---|
/// | à côté de l'avatar | AVEC QUOI la publication est publiée | le son de fond de la scène |
/// | sous le texte | CE QUE la publication dit | les médias audio du document |
///
/// La ligne de l'avatar porte les attributs qui existent AVANT le premier
/// caractère tapé — qui publie, et sous quelle bande-son. Un son de contenu est
/// le propos lui-même : l'y montrer ferait lire deux pistes là où il n'y en a
/// qu'une, et un doublon de cette forme ne se lit pas comme un doublon.
///
/// ## Pourquoi une LOI, et pas la propriété d'un site d'appel
///
/// Les deux colonnes ne se croisent pas aujourd'hui : `resolvedBackgroundAudio`
/// ne lit que `currentEffects`, `ComposerForegroundSound.resolve` ne lit que
/// `documentLocalMedia`. Mais c'est une propriété des sites qui ÉCRIVENT, pas
/// une garantie de ce qui LIT — et ils sont quatre à écrire des sons
/// (`applyCreatedAudio`, `ingestSoundFiles`, `attachPastedAudio`, la reprise de
/// brouillon). Le jour où l'un d'eux pose le même fichier des deux côtés, la
/// pastille se remet à mentir sans qu'aucune ligne n'ait changé ici.
///
/// > Une séparation tenue par « personne ne fait ça » n'est pas une séparation.
/// > Elle tient jusqu'au prochain chemin, et c'est le chemin qui la casse qui
/// > devra s'en apercevoir.
nonisolated enum ComposerSoundColumn {

    /// La pastille de la ligne d'avatar — le son de FOND, et rien d'autre.
    ///
    /// `nil` ⇒ la ligne reste ce qu'elle était : avatar et texte côte à côte.
    ///
    /// - Parameters:
    ///   - background: ce que la scène tient pour son fond.
    ///   - backgroundLocalURL: le fichier local de ce son, quand la session en
    ///     connaît un (`StoryComposerViewModel.loadedAudioURLs`). C'est le SEUL
    ///     handle commun aux deux magasins : un objet de scène et un média de
    ///     document ne partagent ni identifiant ni type, seulement — quand le
    ///     son est local — le chemin de leur fichier.
    ///   - contentMediaURLs: les fichiers que le DOCUMENT publie.
    static func avatarBadge(background: StoryAudioPlayerObject?,
                            backgroundLocalURL: URL?,
                            contentMediaURLs: [URL]) -> StoryAudioPlayerObject? {
        guard let background else { return nil }
        // Un son de fond DISTANT (emprunté à l'étagère) n'a pas de fichier
        // local : il ne peut pas être un média du document, qui n'accepte que
        // des fichiers. L'absence d'URL est donc une preuve, pas une lacune.
        guard let backgroundLocalURL else { return background }
        return contentMediaURLs.contains(backgroundLocalURL) ? nil : background
    }

    /// **La pastille s'OUVRE-t-elle ?** (#4668)
    ///
    /// Non pour un son EMPRUNTÉ, et le motif tient au crédit. Rouvrir passe par
    /// « Création audio », qui rend un FICHIER (`onPublish`) : republier une
    /// piste de l'étagère par ce chemin la détacherait de son `soundId`, donc
    /// de l'attribution de son auteur. La doctrine du crédit
    /// (`addBorrowedSound`) l'interdit, et un rognage qui vole une signature est
    /// pire que pas de rognage du tout.
    ///
    /// **L'absence est structurelle, pas un refus.** Sans `onTap`, la pastille
    /// ne s'annonce ni comme bouton ni comme activable : elle ne PROMET rien.
    /// Un bouton monté puis muet serait la loi 4 dans sa forme la plus coûteuse.
    ///
    /// Rogner un son emprunté DÉJÀ POSÉ demande de muter `sourceStart` /
    /// `sourceEnd` sur l'objet plutôt que de repasser par un fichier — un
    /// chemin qui n'existe pas encore. Il a son issue.
    /// **La lecture est partagée, la conclusion non.** Le prédicat vient de
    /// `StoryAudioIdentity`, site unique de « cette piste est-elle captée ou
    /// empruntée ? » — le relire ici (`soundId?.isEmpty != false`) faisait un
    /// TROISIÈME site à corriger le jour où la réponse bouge. Ce qui reste
    /// propre à cette fonction est son MOTIF, qui n'a rien d'un motif
    /// d'affichage : c'est le crédit qu'on protège, pas la place à l'écran.
    static func opensEditor(_ sound: StoryAudioPlayerObject) -> Bool {
        StoryAudioIdentity.isRecording(sound)
    }
}

/// **Où atterrit un son de PREMIER PLAN** (#4722, directive porteur
/// 2026-09-01 : « ou en chip resizable sur la scène »).
///
/// ## Le mot « premier plan » désignait deux choses
///
/// `ComposerAudioRole.foreground` dit, au SDK, « un objet parmi les autres,
/// avec sa place et sa durée » — une puce posée sur la scène. Le meuble le
/// lisait « une carte de contenu, sous le texte ». Les deux lectures sont
/// justes chacune sur SA surface, et le meuble en sert plusieurs.
///
/// Le résultat était trois chemins d'ingestion, trois réponses :
///
/// | ce que l'auteur fait | ce que « premier plan » produisait |
/// |---|---|
/// | il enregistre (`applyCreatedAudio`) | une carte dans `documentLocalMedia` |
/// | il importe un fichier (`ingestSoundFiles`) | un objet de scène |
/// | il emprunte à l'étagère | un objet de scène, rôle décidé par la règle auto |
///
/// **Et sur une surface qui n'a pas la place, le son devient INVISIBLE sans
/// disparaître.** La carte de contenu n'est rendue que par `textOnlyContent`,
/// la branche que la surface document ne montre QUE sans scène ; l'objet de
/// scène n'est rendu que s'il y a une toile. Poser l'un sur la surface de
/// l'autre laisse donc un son qui part à la publication et qu'aucun écran ne
/// montre — le défaut exact que `ComposerForegroundSound.resolveAll` décrit
/// pour son propre compte (#4672).
///
/// > Ce qui décide n'est ni le geste ni le chemin d'ingestion, c'est la
/// > SURFACE : elle seule dit s'il existe une toile où poser une puce, ou une
/// > colonne de texte sous laquelle glisser une carte. Une règle par chemin
/// > donnait trois réponses à une question qui n'en a qu'une.
nonisolated enum ComposerSoundDestination: Equatable {

    /// Une puce POSÉE sur la scène — visible, déplaçable, redimensionnable.
    case sceneChip

    /// Une carte de lecture, sous le texte de la publication.
    case contentCard

    /// `switch` exhaustif : une cinquième vue montée ne compilera pas tant
    /// qu'elle n'aura pas dit où son premier plan atterrit — ce qui est
    /// exactement la question qu'on oublie en ajoutant un écran.
    ///
    /// `.mood` prend la carte, et c'est le repli SÛR plutôt qu'un choix : une
    /// humeur n'a ni toile ni colonne de texte, mais la carte laisse le son
    /// dans `documentLocalMedia`, d'où il part avec la publication. La puce
    /// l'aurait posé sur une scène inexistante — perdu à la première
    /// republication.
    static func forForeground(on view: ComposerMountedView) -> ComposerSoundDestination {
        switch view {
        case .atelier, .scene:  return .sceneChip
        case .document, .mood:  return .contentCard
        }
    }
}

/// **Ce qu'un nouveau son de FOND remplace** (#4676).
///
/// Défaut trouvé à la vérification simulateur du 2026-09-01 : poser un son en
/// fond alors qu'un fond existait ne faisait RIEN de visible, et perdait
/// l'enregistrement dans un cas sur trois. Deux causes, un symptôme :
///
/// - `addAudioObject(role: .background)` AJOUTE un second objet
///   `isBackground == true`, et `resolvedBackgroundAudio` sert le **premier**
///   de la liste — le nouveau existe, personne ne le regarde ;
/// - `addBorrowedSound` applique sa règle automatique
///   (`hasExistingBackgroundAudio ? nil : true`) : en présence d'un fond, la
///   piste empruntée devient un objet de PREMIER PLAN, invisible sur une
///   surface document qui n'a pas de canvas.
///
/// > Un choix EXPLICITE de l'auteur ne se fait pas arbitrer par une règle
/// > écrite pour le cas où il n'a rien dit.
///
/// La règle vit ici plutôt que dans l'hôte parce qu'elle se DÉCIDE — et une
/// décision écrite dans un corps de vue ne s'interroge qu'à la garde de source.
nonisolated enum ComposerBackgroundSoundReplacement {

    /// L'identifiant de l'objet à retirer avant de poser un nouveau fond.
    ///
    /// `nil` ⇒ rien à retirer. Deux cas rendent `nil`, et ils ne sont pas le
    /// même : **aucun fond**, et un fond **LEGACY** — celui que
    /// `resolvedBackgroundAudio` SYNTHÉTISE depuis `backgroundAudioId` quand
    /// aucun `audioPlayerObject` ne porte de drapeau. Le second n'a aucun objet
    /// à supprimer : le retirer demanderait d'effacer un champ de la slide, ce
    /// que ce chemin ne fait pas. Le composer de publication ne produit pas
    /// cette forme — seule une reprise de story ancienne le ferait — et la
    /// distinguer ici évite qu'un `deleteElement` sur un identifiant fabriqué
    /// passe pour un retrait qui n'a pas eu lieu.
    static func supersededId(background: StoryAudioPlayerObject?,
                             audioObjects: [StoryAudioPlayerObject]) -> String? {
        guard let background else { return nil }
        return audioObjects.contains(where: { $0.id == background.id }) ? background.id : nil
    }
}
