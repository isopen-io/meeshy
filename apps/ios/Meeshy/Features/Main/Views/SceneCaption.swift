import Foundation
import MeeshySDK
import MeeshyUI

/// **La légende adossée à UNE scène** — la règle, tenue une fois pour les deux
/// surfaces qui l'affichent (directive porteur 2026-09-03 : « à l'affichage en
/// plein écran ou sur le carrousel, afficher la légende qui aura été adossée »).
///
/// ## Pourquoi une règle plutôt que deux `private var`
///
/// Le plein écran et la carte du fil répondaient chacun à cette question dans
/// leur propre calcul. Le plein écran avait appris, le 2026-09-05, à demander
/// l'identité du média à la SCÈNE plutôt qu'au post — sans quoi la légende de
/// la scène 1 se peint par-dessus les scènes 2 à N. Le fil, devenu paginé le
/// lendemain (le carrousel est le mode par défaut), n'avait jamais reçu cette
/// correction : sa légende restait figée sur `post.media.first` pendant que le
/// doigt faisait défiler les scènes.
///
/// > **Une leçon écrite sur une surface ne traverse pas d'elle-même jusqu'à sa
/// > jumelle.** Deux écritures de la même règle ne divergent pas au moment où
/// > on les écrit — elles divergent le jour où l'une des deux est corrigée.
///
/// ## Les deux replis, et ce qui les sépare
///
/// 1. **Le repli sur le TEXTE DU PORTEUR** est gouverné par l'appelant
///    (`carrierFallback`), parce que la réponse dépend de ce que l'écran rend
///    DÉJÀ. En plein écran, rien d'autre ne montre le texte de la publication :
///    il est obligatoire (« en plein écran obligatoirement »). Dans le fil, ce
///    texte est rendu au-dessus de la carte : l'ajouter par-dessus la scène ne
///    serait pas afficher une légende, ce serait afficher le post deux fois.
///
/// 2. **Le repli sur le PREMIER VISUEL du post** sert les documents qui
///    n'adressent AUCUN enregistrement — une story migrée, un canvas de texte :
///    la publication n'a alors qu'un visuel, donc aucune ambiguïté. Il se juge
///    par DOCUMENT et non par scène : armé scène par scène, il rendrait à une
///    scène muette la légende d'une autre — le défaut d'origine, revenu par la
///    porte du repli.
nonisolated enum SceneCaption {

    /// - Parameters:
    ///   - sceneIndex: la scène REGARDÉE — la page du carrousel, jamais 0 par
    ///     défaut : c'est cette confusion qui figeait la légende.
    ///   - carrierFallback: le texte de la publication peut-il tenir lieu de
    ///     légende ici ? `true` en plein écran, `false` là où il est déjà rendu.
    /// - Returns: `nil` quand rien ne peut légender cette scène — aucun bandeau
    ///   n'est alors peint. Un bandeau vide occuperait la place d'une légende
    ///   pour ne rien dire.
    static func resolve(sceneIndex: Int,
                        in document: CanvasV3,
                        post: FeedPost,
                        carrierFallback: Bool) -> String? {
        guard document.scenes.indices.contains(sceneIndex) else { return nil }
        // Le texte du porteur ne descend PAS jusqu'à la carte des médias quand
        // l'appelant l'interdit : `SocialMediaCaption.map` l'y injecte de
        // lui-même dès qu'un post n'a qu'un visuel, et la garde posée plus bas
        // arriverait trop tard pour l'en retirer.
        let porteur = carrierFallback ? post.displayContent : nil
        if let identite = mediaIdentity(sceneIndex: sceneIndex, in: document, post: post),
           let propre = SocialMediaCaption.map(for: post.media, carrierText: porteur)[identite] {
            return propre
        }
        return SocialMediaCaption.resolve(own: nil, carrierText: porteur)
    }

    /// Le média que la scène MONTRE — demandé à la scène, puis, pour un document
    /// qui n'adresse rien, au post.
    static func mediaIdentity(sceneIndex: Int,
                              in document: CanvasV3,
                              post: FeedPost) -> String? {
        if let propre = MeeshyScenePlayer.carrierMediaIdentity(in: document,
                                                               sceneIndex: sceneIndex) {
            return propre
        }
        guard !addressesAnyMedia(document) else { return nil }
        return post.media.first { $0.type == .image || $0.type == .video }?.id
    }

    /// **Ce document désigne-t-il des enregistrements du post ?** La question se
    /// pose au document entier : c'est elle qui distingue « ce canvas ignore les
    /// médias » (repli légitime) de « cette scène-ci n'en montre pas » (rien à
    /// légender).
    static func addressesAnyMedia(_ document: CanvasV3) -> Bool {
        document.scenes.indices.contains {
            MeeshyScenePlayer.carrierMediaIdentity(in: document, sceneIndex: $0) != nil
        }
    }
}
