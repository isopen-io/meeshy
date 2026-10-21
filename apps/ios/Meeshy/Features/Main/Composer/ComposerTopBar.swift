import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La barre haute du composer — `✕ · rail · ⋯`** (planche § P4).
///
/// ## Pourquoi elle sort de la surface document (#4070)
///
/// Elle n'a jamais appartenu au DOCUMENT : elle agit sur la
/// `MeeshyPublication` — la fermer, lire ses
/// `MeeshySlide`, ouvrir ce que le document sait faire. Toute surface du
/// meuble en a besoin, et la scène incrustée devenant sa propre surface, la
/// garder privée à l'une des deux aurait obligé l'autre à la recopier.
///
/// C'est la tâche **4.3** de la planche prise dans l'autre sens : quand un
/// contexte gagne sa surface, ce qui est COMMUN doit d'abord devenir un
/// composant — sans quoi l'extraction duplique le chrome au lieu de le
/// partager, et les deux copies divergent au premier ajustement.
///
/// **Rien de son comportement ne change dans ce lot** : c'est un déplacement,
/// pas une réécriture. Les décisions qu'elle portait restent écrites ici.
struct ComposerTopBar: View {

    /// **Le rail des scènes, monté par l'HÔTE** (constat porteur 2026-09-06).
    ///
    /// Il recevait auparavant une liste de MÉDIAS filtrée par l'index des
    /// fondations, sur l'équivalence « une slide = un média de fond » — vraie
    /// jusqu'au jour où une scène naît d'un fond COLORÉ. La scène existait alors
    /// sans tuile, et créer une scène ne produisait aucun retour à l'écran.
    ///
    /// Le rail montre désormais une mini-preview par SCÈNE, ce qui demande le
    /// ViewModel (effets vivants, bitmaps chargés). Cette barre ne le connaît
    /// pas et n'a pas à le connaître : slot OPAQUE, comme `overflowMenu`
    /// juste en dessous. `nil` ⇒ pas de rail.
    let slideRailSlot: AnyView?

    /// Ce que le document sait faire. `nil` ⇒ aucune entrée n'a d'objet.
    let overflowMenu: AnyView?

    let onClose: () -> Void

    /// **La teinte du verre de la croix** (#8370). Sur la scène plein écran, la
    /// barre flotte sur la scène elle-même : nu, le verre d'iOS 26 vire au clair
    /// sur une photo claire et la croix blanche disparaît (mesuré au simulateur
    /// le 2026-09-27). Teinté du plateau, il reste sombre partout.
    let plateauTint: Color

    /// Une pastille posée avant le `⋯` — le `(+)` d'une nouvelle scène depuis
    /// #8713 (l'éclair « Animé » y vivait, #8415). `nil` ⇒ rien.
    var trailingAccessory: AnyView? = nil
    /// La marge de bord : 16 pt sur téléphone, celle de la maquette iPad/Mac
    /// (`ComposerRailGeometry.roomyMargin`) sur grand écran.
    var edgeMargin: CGFloat = 16

    static let topPadding: CGFloat = 12

    /// Le haut de la rangée de la Dynamic Island : la barre de la scène plein
    /// écran monte jusque-là (`ComposerSceneSurface.chromeLift`).
    static let islandRowTop: CGFloat = 4
    /// La part de la zone sûre que la barre remonte : la moitié la pose juste
    /// sous la Dynamic Island (retour porteur 2026-09-28, « redescendre »).
    static let liftShare: CGFloat = 0.5

    /// **Ce que la barre occupe sous la zone sûre** — lu par la scène plein
    /// écran (#8370) pour se poser JUSTE SOUS la croix, jamais dessous.
    static var height: CGFloat { topPadding + ComposerControlMetrics.visualDiameter }

    // **L'historique a quitté cette barre le 2026-08-30.** Il y lisait mal :
    // pendant qu'un outil est ouvert, « Annuler » se comprend comme « fermer
    // l'outil » et non « défaire le dernier geste » — le mot dit les deux en
    // français, et le voisinage du chrome d'outil tranchait pour le mauvais.
    // Il vit désormais au SOCLE, entre l'œil et Publier, parmi ce qui décide de
    // l'envoi : rien autour de lui ne se ferme.

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .bold))
                    // **Pas `glassControlForeground()`, et c'est délibéré.** Le
                    // helper du SDK rend `indigo950` en thème CLAIR — juste sur
                    // une surface qui suit le thème, faux ici : le plateau du
                    // composer est sombre EN PERMANENCE. On y aurait peint du
                    // sombre sur du sombre dès que l'appareil quitte la nuit.
                    .foregroundStyle(MeeshyColors.textPrimary(isDark: true))
                    .frame(width: ComposerControlMetrics.visualDiameter,
                           height: ComposerControlMetrics.visualDiameter)
                    .adaptiveLiquidGlass(in: Circle(), tint: plateauTint.opacity(0.55), interactive: true)
            }
            .accessibilityLabel(Text(ComposerDocumentCopy.close))
            slideRail
            Spacer(minLength: 0)
            if let trailingAccessory { trailingAccessory.fixedSize() }
            if let overflowMenu { overflowMenu.fixedSize() }
        }
        .padding(.horizontal, edgeMargin)
        .padding(.top, Self.topPadding)
    }


 
 
    /// **Le rail des SCÈNES (#4047, corrigé le 2026-09-06).**
    ///
    /// Une mini-preview par scène, celle qu'on compose cerclée. Le contenu est
    /// monté par l'hôte : il demande les effets VIVANTS et les bitmaps chargés,
    /// que seule une vue tenant le ViewModel peut fournir. Cette barre garde
    /// son rôle — donner la PLACE, jamais l'avis.
    ///
    /// **Ce que ce rail montrait avant, et pourquoi c'était faux.** Il recevait
    /// une liste de MÉDIAS filtrée par l'index des fondations, sur
    /// l'équivalence « une slide = un média posé en fond ». Elle a tenu tant
    /// que toute scène naissait d'un média ; un fond COLORÉ la brise, et la
    /// scène existait alors sans tuile. Le doc-comment qui vivait ici l'écrivait
    /// comme une définition — c'est ce qui l'a rendue invisible.
    ///
    /// **Le `(+)` d'une nouvelle scène vit dans cette barre depuis #8713**
    /// (directive porteur 2026-09-29 : « mets à la place [de l'éclair] le bouton
    /// (+) pour créer une nouvelle scène »), posé par l'hôte en
    /// `trailingAccessory`. Il a QUITTÉ le rail droit dans le même geste : deux
    /// portes pour un seul geste sont le motif que « une porte n'a pas de
    /// jumelle » interdit.
    @ViewBuilder
    private var slideRail: some View {
        if let slideRailSlot {
            slideRailSlot
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .contain)
                // **Le libellé dit ce que la rangée MONTRE.** Il annonçait
                // « Médias joints » — vrai quand elle montrait des médias, faux
                // depuis qu'elle montre des scènes. Un libellé qui survit au
                // changement de ce qu'il nomme dit le contraire de l'écran, et
                // seul VoiceOver l'entend.
                .accessibilityLabel(Text(ComposerSlideRailCopy.rail))
        }
    }
}

/// **Qui PEINT le visage d'un menu de la barre haute** (#10542).
///
/// Retour porteur 2026-10-13, iOS 17.5 : le `⋯` se lisait plus bas que la croix
/// et le `(+)`, dans une rangée qui les centre pourtant tous les trois. La
/// croix et le `(+)` sont des `Button`, mis en page par SwiftUI de bout en
/// bout ; le libellé d'un `Menu` est peint par le système, qui n'en garantit
/// pas la place là où la barre monte dans la zone sûre. Sans verre natif, le
/// visage sort donc du `Menu` : une vue ordinaire de la rangée, comme ses
/// voisins. iOS 26 garde le verre interactif sur le libellé.
nonisolated enum ComposerTopBarMenuFace: Equatable, Sendable {
    /// Le visage est le libellé du `Menu`.
    case label
    /// Le visage est peint HORS du `Menu`, qui ne garde qu'une cible vide.
    case detached

    static func resolve(nativeGlass: Bool) -> ComposerTopBarMenuFace {
        nativeGlass ? .label : .detached
    }

    static var current: ComposerTopBarMenuFace {
        if #available(iOS 26.0, *) { return resolve(nativeGlass: true) }
        return resolve(nativeGlass: false)
    }
}

/// **Un menu de la barre haute, au gabarit de ses voisins** (#10542) — le
/// visage rond que l'hôte fournit, et les entrées qu'il ouvre. La cible vide du
/// visage détaché a le diamètre des commandes (`ComposerControlMetrics`).
struct ComposerTopBarMenu<Items: View, Face: View>: View {
    let label: String
    @ViewBuilder let items: () -> Items
    @ViewBuilder let face: () -> Face

    var body: some View {
        switch ComposerTopBarMenuFace.current {
        case .label:
            Menu(content: items, label: face)
                .accessibilityLabel(Text(label))
        case .detached:
            face()
                .accessibilityHidden(true)
                .overlay {
                    Menu(content: items) {
                        Color.clear
                            .frame(width: ComposerControlMetrics.visualDiameter,
                                   height: ComposerControlMetrics.visualDiameter)
                            .contentShape(Circle())
                    }
                    .accessibilityLabel(Text(label))
                }
        }
    }
}
