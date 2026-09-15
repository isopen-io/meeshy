import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les ACTIONS du cadre — la colonne, et la traînée qu'elle ouvre
//
// Extrait de `ConversationMediaGalleryView.swift` (#6161). La colonne est du
// code NEUF, et le fichier racine était à 949 lignes sur un plafond DUR de
// 1 200 : y ajouter la règle, la cible tactile et le gabarit aurait poussé
// l'ensemble vers le plafond pour une responsabilité qui se tient toute seule.
//
// Ce que ce fichier porte : la règle de cotes de la colonne (pure, jouable en
// XCTest), la CIBLE tactile que chaque action partage, et la traînée d'émojis —
// qui déménage ici sans changer d'un caractère, `scale: 1.5` et son commentaire
// entier compris (voir plus bas : cette valeur ne survit QUE par son
// commentaire).

// MARK: - Les cotes de la colonne

/// **Ce que la colonne d'actions mesure** — et pourquoi deux nombres et non un.
///
/// Le VERRE fait 40 pt : c'est le gabarit du chrome de tout le visualiseur
/// (doctrine 82i, le glyphe est borné par un cadre fixe et ne scale pas). La
/// CIBLE fait 44 : c'est le minimum tactile de la dimension 5. Les confondre
/// rend soit une pastille trop grosse, soit une cible trop petite — et la
/// seconde erreur est la pire ici, parce qu'un doigt qui RATE une action
/// atterrit sur le cadre, qui l'interprète comme le tap de #6142 et entre en
/// plein écran. L'action ne part pas, et l'écran fait autre chose.
///
/// `nonisolated` : le target app compile en `defaultIsolation MainActor` et le
/// bundle de tests est nonisolated — sans ce modificateur, la règle n'est pas
/// jouable depuis XCTest.
nonisolated enum MediaStageActionColumn {

    /// Le cercle de verre — ce qu'on VOIT. Même valeur que la porte de sortie du
    /// couloir haut : les contrôles du visualiseur ont UN gabarit.
    static let glass: CGFloat = 40

    /// La zone tactile — ce qu'on TOUCHE. Elle déborde le verre de 2 pt tout
    /// autour, et c'est ce débordement que `mediaStageActionTarget()` doit
    /// rendre PLEIN.
    static let target: CGFloat = 44

    /// L'intervalle entre deux actions. Le gabarit de la barre latérale du
    /// lecteur de story (`StoryViewerView+Sidebar.swift`, « rapprocher les FABs,
    /// on y voit trop d'espace », directive 2026-07-10).
    static let spacing: CGFloat = 8

    /// La largeur que la colonne occupe SUR le cadre. Elle n'en retire rien au
    /// solveur : `MediaStageFraming.Corridors` ne gagne aucun champ au #6161 —
    /// le cadre garde exactement la taille qu'il avait.
    static var width: CGFloat { target }

    /// La hauteur d'une colonne de `actions` actions. Zéro pour zéro action :
    /// une colonne vide ne prend aucune place (loi 4, un contrôle absent n'a
    /// même pas d'espace).
    static func height(actions: Int) -> CGFloat {
        guard actions > 0 else { return 0 }
        return CGFloat(actions) * target + CGFloat(actions - 1) * spacing
    }
}

// MARK: - La cible tactile, une seule fois

extension View {

    /// **La cible d'une action de la colonne — pleine, et de la même taille pour
    /// les trois.**
    ///
    /// `contentShape(Rectangle())` n'est pas une précaution : c'est la garde.
    /// Sans elle, la zone touchable d'un `Image` glassé est le cercle, et les
    /// quatre coins du carré de 44 — plus l'anneau de 2 pt entre le verre et la
    /// cible — laissent passer le doigt vers le cadre, une couche plus bas.
    /// Le cadre, lui, écoute les trois portes de #6142 : le tap y ouvre le plein
    /// écran. **Rater une action n'a alors pas l'air d'un raté — ça a l'air d'un
    /// autre geste.**
    ///
    /// Un seul site pour les trois actions : trois `.frame(width: 44 …)`
    /// recopiés seraient trois règles qui se ressemblent, jusqu'au jour où l'une
    /// bouge.
    func mediaStageActionTarget() -> some View {
        frame(width: MediaStageActionColumn.target, height: MediaStageActionColumn.target)
            .contentShape(Rectangle())
    }
}

extension ConversationMediaGalleryView {

    // MARK: - Couche haute : la traînée d'émojis

    /// **Rien ne passe devant elle, rien ne la rogne** (précision porteur
    /// 2026-09-11).
    ///
    /// Montée en DERNIER dans le `ZStack` racine — voir `body`. Aucun ancêtre de
    /// cette chaîne ne porte `.clipped()`, `.mask()` ni `.cornerRadius()` :
    /// vérifié ligne à ligne, la contrainte qu'elle subissait n'était pas un
    /// rognage mais un PARTAGE DE HAUTEUR (le `VStack` de `controlsOverlay`
    /// distribuait la même colonne entre elle et le bloc bas).
    ///
    /// **Le `Spacer` ne teste aucune touche** : quand la traînée est fermée,
    /// `attachmentReactionBar` ne rend rien et cette couche laisse passer
    /// INTÉGRALEMENT le doigt vers le pager. `allowsHitTesting(reactionBarOpen)`
    /// est la ceinture par-dessus la bretelle — il lit l'état d'interaction, pas
    /// la loi, donc il ne peut pas contredire la garde de protection qui, elle,
    /// reste dans `attachmentReactionBar`.
    ///
    /// La couche RESPECTE la zone sûre (seuls le fond noir et le pager
    /// l'ignorent), donc la traînée ne se glisse jamais sous l'indicateur
    /// d'accueil ni sous une encoche.
    ///
    /// **Elle reste ANCRÉE EN BAS au #6161**, pendant que le bouton qui l'ouvre
    /// monte dans la colonne de droite. Ce n'est pas un oubli : la traînée
    /// demande ~340 pt de large à l'échelle 1,5, soit plus que ce qui reste à
    /// droite d'un cadre de 366. La faire jaillir du bouton — le geste de la
    /// story — l'aurait poussée hors du cadre ou l'aurait comprimée. Elle garde
    /// donc la largeur entière, et la précision porteur (« par-dessus tous les
    /// autres contrôleurs ») avec elle.
    @ViewBuilder
    var reactionLayer: some View {
        if currentIndex < allAttachments.count {
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                attachmentReactionBar(allAttachments[currentIndex])
                    .padding(.bottom, reactionBarBottomInset)
            }
            .allowsHitTesting(reactionBarOpen)
        }
    }

    /// Marge basse de la traînée : elle flotte AU-DESSUS du couloir bas, donc
    /// par-dessus le bloc auteur / dimensions — c'est le recouvrement que la
    /// précision porteur demande de montrer. **Le couloir, lui, reste libre en
    /// ENTIER** : ses deux bandes sont les seuls contrôles du bas qui servent à
    /// PARCOURIR — le rail parcourt la série, la bande de transport parcourt le
    /// média (#6162) — et les couvrir enfermerait le lecteur sur l'instant
    /// courant de la pièce courante.
    ///
    /// **Elle se LIT sur les couloirs, elle ne les recompose pas.** La marge
    /// recopiait la conjonction du rail (`count > 1 ? …`) et ignorait purement la
    /// bande réservée depuis #6162 : son bas tombait 8 pt au-dessus du rail,
    /// c'est-à-dire exactement dans les 48 pt du transport — scrubber, muet et
    /// menu ⋯ couverts pendant que la traînée est ouverte, puisque
    /// `allowsHitTesting(reactionBarOpen)` rend alors la couche opaque au doigt.
    /// C'était le défaut que le commentaire de ce site prétendait éviter, mot
    /// pour mot. `stageCorridors` porte déjà les deux hauteurs, chacune avec sa
    /// condition ; une seconde conjonction ici serait une seconde loi.
    ///
    /// La couche respecte la zone sûre alors que les couloirs la réservent à
    /// part — `safeBottom` n'entre donc PAS dans cette somme, sans quoi la
    /// traînée flotterait une encoche trop haut.
    private var reactionBarBottomInset: CGFloat {
        stageCorridors.rail + stageCorridors.transport + 8
    }

    // MARK: - Réaction sur la pièce

    /// **La rangée de réactions rapides du plein écran** (#6084, directive
    /// porteur 2026-09-11 : « lorsqu'on affiche une image pièce jointe en plein
    /// écran, il faut pouvoir ajouter une réaction à l'attachement directement » ;
    /// révision du même jour : « il faut mettre un bouton réagir (emoji +) qui
    /// affiche la traille des emojis de réaction »).
    ///
    /// **Elle n'existe qu'OUVERTE.** Le bouton « Réagir » de la colonne d'actions
    /// la révèle ; un second appui, un choix d'émoji ou un changement de page la
    /// retire. Au repos rien ne se pose sur l'image — c'est ce que la révision
    /// porteur demande, et c'est aussi ce qui rend le visualiseur cohérent avec
    /// ses voisins Répondre et Composer, qui sont des actions et non des
    /// ornements.
    ///
    /// Gabarit de la story (#6083) : **aucun habillage**. Le média remplit
    /// l'écran et EST le fond — une capsule y ajouterait un cadre là où la story
    /// vient justement d'en retirer un. `scrollable` est le COROLLAIRE de
    /// l'échelle et non une option : à 1,5, six émojis plus le « + » demandent
    /// ~340 pt, et un `ScrollView` ne défile que dans une largeur bornée.
    ///
    /// **Aucun geste de cession n'est nécessaire ici**, contrairement à la story
    /// (`StoryReactionStripGesture`). Le pager de la galerie est un
    /// `UIScrollView` SŒUR dans le `ZStack` racine, pas un ancêtre montant un
    /// `.simultaneousGesture` : une touche qui atterrit sur la rangée ne lui
    /// parvient jamais, et les deux `UIScrollView` imbriqués s'arbitrent seuls.
    /// Y recopier la loi de la story aurait gardé un conflit qui n'existe pas.
    @ViewBuilder
    private func attachmentReactionBar(_ att: MessageAttachment) -> some View {
        if AttachmentReactionOffer.showsPicker(surface: .fullscreen,
                                               attachment: att,
                                               hasHandler: onReactToMedia != nil,
                                               isOpen: reactionBarOpen) {
            EmojiReactionPicker(
                quickEmojis: MeeshyQuickReactions.standard,
                style: .dark,
                // ÉCHELLE 1,5 — le gabarit de la story, dont celui-ci DÉRIVE
                // (#6083 pour la forme, #6084 pour ce site). Le 2 posé
                // l'après-midi du 2026-09-11 a été ramené à 1,5 le soir même :
                // « ×0,75, elles sont trop grosses » (directive porteur, sur
                // capture, les deux barres nommées dans la même phrase).
                //
                // Les deux barres bougent ENSEMBLE, et c'est le point : ce
                // site n'a pas d'échelle à lui, il rend le gabarit arrêté pour
                // la story. Deux valeurs différentes ici et dans
                // `StoryViewerView+Sidebar.swift` ne seraient pas deux
                // décisions, ce serait un oubli.
                scale: 1.5,
                scrollable: true,
                chrome: .none,
                onReact: { emoji in
                    onReactToMedia?(att, emoji)
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        reactionBarOpen = false
                    }
                },
                onExpandFullPicker: {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        reactionBarOpen = false
                    }
                    showFullEmojiPicker = true
                }
            )
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 4)
            .transition(.asymmetric(
                insertion: .scale(scale: 0.85, anchor: .bottomLeading).combined(with: .opacity),
                removal: .opacity
            ))
        }
    }

    /// **Le sélecteur complet vit sur la RACINE, jamais sur la rangée.**
    ///
    /// Le « + » referme la rangée et ouvre cette feuille dans la même
    /// transaction : montée sur la rangée, elle serait présentée par une vue en
    /// train d'être retirée — et SwiftUI ne présente rien. La cible se relit à la
    /// page COURANTE au moment du choix, ce qui est la seule lecture juste : la
    /// feuille survit au feuilletage, l'ancienne pièce non.
    @ViewBuilder
    var fullEmojiPickerSheet: some View {
        EmojiPickerSheet(quickReactions: MeeshyQuickReactions.standard) { emoji in
            if currentIndex < allAttachments.count {
                onReactToMedia?(allAttachments[currentIndex], emoji)
            }
            showFullEmojiPicker = false
        }
    }
}
