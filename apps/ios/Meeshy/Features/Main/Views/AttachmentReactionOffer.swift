import Foundation
import MeeshySDK

// MARK: - À QUELLE PIÈCE OFFRE-T-ON LA BARRE DE RÉACTION RAPIDE, ET OÙ ?
//
// **La réaction appartient à la PIÈCE, pas au message qui la porte** (#6084,
// arbitrage porteur 2026-09-11 : « sur la pièce, partout où elle s'ouvre »).
// Une pièce s'ouvre à DEUX endroits — la tuile d'une grille de bulle, et le
// plein écran — et la question « offre-t-on de réagir ? » se posait jusqu'ici au
// seul premier, enfouie dans le `body` de la tuile (`BubbleGridCell`). Une
// condition dans un `body` n'est interrogeable par aucun témoin : c'est
// exactement ce qui a laissé le plein écran sans réaction sans que rien ne
// rougisse.
//
// Les deux surfaces partagent les DEUX moitiés de la règle et divergent sur la
// troisième :
//
// | moitié | grille | plein écran |
// |---|---|---|
// | un rappel est câblé (loi 4) | oui | oui |
// | la pièce n'est pas protégée | oui | oui |
// | la pièce est seule dans son porteur | l'offre se RETIRE | sans objet |
//
// **La divergence n'est pas un oubli.** En grille, une bulle à UNE seule image
// laisse la réaction au MESSAGE : la tuile y garde son simple tap pour ouvrir le
// plein écran, sans payer la fenêtre de désambiguïsation d'iOS qu'un double tap
// impose (cf. `QuickReactionDoubleTap`). En plein écran, la pièce occupe l'écran
// et il n'y a rien d'autre à viser — « seule » y décrit le cas NOMINAL, pas une
// exception, et la règle de la grille y interdirait le geste dans le cas le plus
// courant. C'est le critère 3 de #6084.
//
// **Deux questions, deux fonctions** (révision porteur du même jour : « il faut
// mettre un bouton réagir (emoji +) qui affiche la traille des emojis »). La
// première dit ce qui EXISTE — le bouton, le double tap ; la seconde dit ce qui
// est MONTÉ — la rangée d'émojis, ouverte par ce bouton. Les fondre en un seul
// booléen interdirait de garder l'une sans l'autre.
//
// `nonisolated` : le target app compile en `defaultIsolation MainActor`, et le
// bundle de tests est nonisolated — sans ce modificateur, la loi est
// inappelable depuis un témoin (échec de COMPILE, cf. `StoryActionRailPlan`).
nonisolated enum AttachmentReactionOffer {

    /// Là où la pièce s'ouvre.
    enum Surface: Equatable, Sendable, CustomStringConvertible {
        /// La grille d'une bulle : la pièce est une TUILE parmi d'autres.
        case bubbleGrid(isSolo: Bool)
        /// Le plein écran : la pièce occupe l'écran.
        case fullscreen

        var description: String {
            switch self {
            case .bubbleGrid(let isSolo): return "bubbleGrid(isSolo: \(isSolo))"
            case .fullscreen: return "fullscreen"
            }
        }
    }

    /// **Question 1 — cette pièce offre-t-elle de RÉAGIR, ici ?**
    ///
    /// Elle gouverne ce qui EXISTE : en grille, le double tap et l'appui long qui
    /// ouvrent le sélecteur ; en plein écran, le BOUTON « Réagir » de la rangée
    /// d'actions. Elle ne dit rien de l'état d'interaction — voir `showsPicker`.
    ///
    /// - Parameters:
    ///   - surface: là où la pièce s'ouvre.
    ///   - attachment: la pièce elle-même — c'est SA protection qui décide, pas
    ///     celle du message. Un message ordinaire peut porter une pièce à vue
    ///     unique, et c'est le cas qu'une garde lue au niveau du message rate.
    ///   - hasHandler: l'hôte sait-il router l'émoji. **Loi 4 : un contrôle
    ///     existe s'il a un effet** — un post, une story ou un commentaire n'a
    ///     aucune réaction par MÉDIA côté serveur, donc aucun contrôle.
    ///
    /// **La protection est LUE, jamais réécrite.** `ComposableAttachment.isProtected`
    /// est le prédicat que le menu d'appui long et la citation consultent déjà :
    /// vue unique, flouté, chiffré. La tuile de grille en écrivait une seconde
    /// version qui oubliait le chiffrement — deux écritures des mêmes drapeaux
    /// sont deux règles qui ont déjà commencé à diverger (leçon § 275 : une
    /// protection se mesure sur tout ce que la charge transporte).
    static func offersReaction(surface: Surface,
                               attachment: MessageAttachment,
                               hasHandler: Bool) -> Bool {
        guard hasHandler else { return false }
        guard !ComposableAttachment.isProtected(attachment) else { return false }
        switch surface {
        case .bubbleGrid(let isSolo): return !isSolo
        case .fullscreen: return true
        }
    }

    /// **Question 2 — la rangée d'émojis est-elle MONTÉE ?**
    ///
    /// Distincte de la première, et elle la COMPOSE. Deux raisons, la seconde
    /// décide :
    ///  1. ce sont deux questions de natures différentes — l'une porte sur la
    ///     pièce et son contexte, l'autre sur ce que l'utilisateur vient de
    ///     faire. Les fondre en un seul booléen rendrait impossible de garder
    ///     l'une sans l'autre ;
    ///  2. **fail-closed** : un drapeau d'ouverture RESTÉ vrai — une pièce
    ///     protégée atteinte alors que la rangée était ouverte, un reset manqué —
    ///     ne peut pas contourner la protection, puisqu'il ne fait que S'AJOUTER
    ///     à un verdict qui reste le premier mot.
    ///
    /// - Parameter isOpen: le bouton « Réagir » a-t-il ouvert la rangée. Cet état
    ///   se réinitialise au changement de pièce (`handlePageChange`) : la rangée
    ///   appartient à la pièce qu'on regardait.
    static func showsPicker(surface: Surface,
                            attachment: MessageAttachment,
                            hasHandler: Bool,
                            isOpen: Bool) -> Bool {
        guard isOpen else { return false }
        return offersReaction(surface: surface, attachment: attachment, hasHandler: hasHandler)
    }
}
