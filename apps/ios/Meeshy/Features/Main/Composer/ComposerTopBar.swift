import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La barre haute du composer — `✕ · [type ▾] · rail · ⋯`** (planche § P4).
///
/// ## Pourquoi elle sort de la surface document (#4070)
///
/// Elle n'a jamais appartenu au DOCUMENT : elle agit sur la
/// `MeeshyPublication` — la fermer, choisir son profil, lire ses
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
    /// pas et n'a pas à le connaître : slot OPAQUE, comme `formatFan` et
    /// `overflowMenu` juste en dessous. `nil` ⇒ pas de rail.
    let slideRailSlot: AnyView?

    /// L'éventail des profils, monté par l'hôte. `nil` ⇒ un seul format offert,
    /// donc aucun sélecteur (loi 4).
    let formatFan: AnyView?
    /// Ce que le document sait faire. `nil` ⇒ aucune entrée n'a d'objet.
    let overflowMenu: AnyView?

    let onClose: () -> Void

    // **L'historique a quitté cette barre le 2026-08-30.** Il y lisait mal :
    // pendant qu'un outil est ouvert, « Annuler » se comprend comme « fermer
    // l'outil » et non « défaire le dernier geste » — le mot dit les deux en
    // français, et le voisinage du chrome d'outil tranchait pour le mauvais.
    // Il vit désormais au SOCLE, entre l'œil et Publier, parmi ce qui décide de
    // l'envoi : rien autour de lui ne se ferme.

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .bold))
                    // **Pas `glassControlForeground()`, et c'est délibéré.** Le
                    // helper du SDK rend `indigo950` en thème CLAIR — juste sur
                    // une surface qui suit le thème, faux ici : le plateau du
                    // composer est sombre EN PERMANENCE. On y aurait peint du
                    // sombre sur du sombre dès que l'appareil quitte la nuit.
                    .foregroundColor(MeeshyColors.textPrimary(isDark: true))
                    .frame(width: ComposerControlMetrics.visualDiameter,
                           height: ComposerControlMetrics.visualDiameter)
                    .adaptiveGlass(in: Circle())
            }
            .accessibilityLabel(Text(ComposerDocumentCopy.close))
            if let formatFan { formatFan.fixedSize() }
            slideRail
            Spacer(minLength: 0)
            if let overflowMenu { overflowMenu.fixedSize() }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
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
    /// **Aucun `＋` ici, et c'est une RÉPONSE.** La planche en dessine un ; la
    /// création d'une scène est le geste du rail DROIT (§ 2 bis), et deux portes
    /// pour un seul geste sont le motif que « une porte n'a pas de jumelle »
    /// interdit.
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
