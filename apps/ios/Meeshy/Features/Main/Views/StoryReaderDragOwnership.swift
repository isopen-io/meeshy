import CoreGraphics
import SwiftUI

// MARK: - À QUI APPARTIENT LE GLISSÉ DU LECTEUR DE STORY ?
//
// `unifiedDragGesture` (`StoryViewerView+Content.swift`) est monté en
// `.simultaneousGesture` sur un ANCÊTRE de tout le contenu du lecteur.
// « Simultané » n'est pas « prioritaire » : aucun geste enfant, si haute que
// soit sa priorité, ne peut le subordonner — il reconnaît EN PARALLÈLE, par
// construction. La seule façon pour un enfant de gagner est donc que le drag
// parent CÈDE, ce qu'il ne peut faire qu'en LISANT un état.
//
// Ce fichier réunit les deux lois de cession, et la clé qui alimente la
// première. Elles vivaient au bas de `StoryViewerView+Content.swift`, un
// fichier hors budget (directive 2026-08-28 : extraire d'abord, ajouter
// ensuite) — et elles n'y étaient pas chez elles : ce sont des décisions
// PURES, sans état SwiftUI, là où le reste du fichier est une vue.
//
// | loi | cède sur | pour |
// |---|---|---|
// | `StoryReaderDragStartZone` | le POINT DE DÉPART | un panneau défilant pleine largeur (commentaires, légende dépliée, sélecteurs) |
// | `StoryReactionStripGesture` | la DIRECTION | une bande posée à mi-hauteur (la barre de réactions) |
//
// **Les deux critères ne sont pas interchangeables.** Une bande à mi-hauteur
// gardée par une règle de ZONE forfaiterait toute la moitié basse de l'écran,
// et emporterait avec elle le glissé VERTICAL, qui doit continuer de refermer.
// Un panneau pleine largeur gardé par une règle de DIRECTION laisserait passer
// le glissé vertical qui est justement celui qu'il consomme.

// MARK: - Cession sur le point de départ (surfaces défilantes)

/// Bord SUPÉRIEUR, en coordonnées `.global`, de la surface scrollable ouverte
/// par-dessus la story (liste de commentaires, sélecteurs plein écran).
///
/// À PUBLIER DEPUIS LE CONTENEUR PARENT DU `ScrollView`, jamais depuis
/// l'intérieur du contenu défilant : sous iOS 18+, `onPreferenceChange` ne
/// re-tire plus pour une valeur pilotée par le défilement, et la mise à jour
/// n'arriverait jamais. Ce qu'on publie ici est un cadre de LAYOUT — il ne bouge
/// qu'au (re)positionnement de la surface (ouverture, montée du clavier,
/// rotation), pas au scroll.
///
/// iOS 16 compatible : `GeometryReader` + `PreferenceKey`, aucune API scroll
/// iOS 17/18 (`onGeometryChange` est interdit sur cette cible).
struct StoryReaderScrollableSurfaceTopKey: PreferenceKey {
    static var defaultValue: CGFloat? { nil }
    /// Plusieurs surfaces peuvent être montées simultanément : on garde la plus
    /// HAUTE (minY le plus petit), c'est-à-dire la zone interdite la plus large.
    /// Céder trop est sans danger (le drag parent ne fait rien) ; céder trop peu
    /// laisse un geste naître dans un `ScrollView`, et là `onEnded` n'arrive
    /// jamais.
    static func reduce(value: inout CGFloat?, nextValue: () -> CGFloat?) {
        guard let next = nextValue() else { return }
        value = value.map { Swift.min($0, next) } ?? next
    }
}

/// Décide si le drag parent doit rendre la main à la surface scrollable ouverte,
/// en fonction du POINT DE DÉPART du geste. Pur et testable — `unifiedDragGesture`
/// est un `some Gesture` piloté par des `@State`, injouable en XCTest.
///
/// `nonisolated` : le target app compile en `defaultIsolation MainActor`, et le
/// bundle de tests est nonisolated — sans ce modificateur, la loi est
/// inappelable depuis un test (échec de COMPILE, cf. `StoryActionRailPlan`).
nonisolated enum StoryReaderDragStartZone {

    /// - Parameters:
    ///   - hasScrollableSurface: une surface embarquant son propre `ScrollView`
    ///     est ouverte.
    ///   - surfaceTopY: bord supérieur mesuré de cette surface (`.global`), ou
    ///     `nil` si inconnu.
    ///   - dragStartY: `value.startLocation.y` du drag parent (`.global`).
    /// - Returns: `true` si le geste appartient à la surface (le drag parent doit
    ///   sortir immédiatement).
    ///
    /// RÈGLE : aucune surface ouverte ⇒ le drag parent s'exécute INTÉGRALEMENT
    /// (cas nominal, la très grande majorité des gestes du lecteur). Surface
    /// ouverte et bord connu ⇒ seuls les gestes nés à l'intérieur lui reviennent ;
    /// ceux nés dans la story encore visible au-dessus restent au drag parent, qui
    /// peut ainsi refermer la surface d'un glissement. Bord INCONNU ⇒ tout lui
    /// revient (fail-safe : un swipe inerte vaut mieux qu'un `onEnded` jamais
    /// délivré, qui laisse `gestureAxis` collé et la lecture gelée).
    static func yieldsToScrollableSurface(hasScrollableSurface: Bool,
                                          surfaceTopY: CGFloat?,
                                          dragStartY: CGFloat) -> Bool {
        guard hasScrollableSurface else { return false }
        guard let top = surfaceTopY else { return true }
        return dragStartY >= top
    }
}

// MARK: - Cession sur la direction (barre de réactions)

/// **À qui appartient le glissé né sur la barre de réactions d'une story ?**
/// (#6083, directive porteur 2026-09-11 : « permettre de swiper gauche-droite
/// dans la liste des emojis sans swiper de story ».)
///
/// La barre (`EmojiReactionPicker(scrollable:)`, rail droit du lecteur) défile
/// horizontalement. Le lecteur pagine horizontalement aussi, et son drag est
/// simultané : un doigt qui parcourait les émojis changeait de story sous lui.
///
/// `nonisolated` : même raison que `StoryReaderDragStartZone` ci-dessus — sans
/// ce modificateur, le bundle de tests ne peut ni appeler `owner(translation:)`
/// ni lire `horizontalClaimDistance`, et le gate rougit à la COMPILATION.
nonisolated enum StoryReactionStripGesture {

    /// Qui consomme le glissé courant.
    enum Owner: Equatable, Sendable {
        /// La barre : elle défile, la story ne bouge pas.
        case strip
        /// Le lecteur : pagination horizontale, fermeture verticale, tout le
        /// reste. C'est l'issue par DÉFAUT — la barre ne prend que ce qu'elle
        /// revendique explicitement.
        case story
    }

    /// Course HORIZONTALE minimale au-delà de laquelle la barre revendique.
    ///
    /// **8 pt, et la valeur est contrainte des deux côtés.**
    ///
    /// Borne HAUTE — elle doit être franchie AVANT que le parent ne s'éveille.
    /// Celui-ci exige 15 pt de déplacement (`minimumDistance: 15`) pour son
    /// premier `onChanged`, et 8 pt de dominance (`abs(dx) > abs(dy) + 8`) pour
    /// arrêter son axe. Revendiquer à 8 pt de course horizontale place la
    /// décision strictement avant ce premier `onChanged` : le cube ne commence
    /// jamais à translater, il n'y a donc pas de demi-page à faire revenir sous
    /// le doigt.
    ///
    /// Borne BASSE — elle doit rester au-dessus du tremblement d'un appui. Un
    /// tap sur une tuile d'émoji dérive de deux ou trois points ; à 8 pt, il ne
    /// revendique rien et le `Button` de la tuile garde son tap.
    static let horizontalClaimDistance: CGFloat = 8

    /// - Parameter translation: `value.translation` du glissé en cours, tel que
    ///   le livre SwiftUI (cumulé depuis le touch-down, signé).
    /// - Returns: `.strip` quand l'horizontal DOMINE et a dépassé
    ///   `horizontalClaimDistance` ; `.story` dans tous les autres cas.
    ///
    /// La dominance est STRICTE et sans marge (`dx > dy`), contrairement à celle
    /// du parent. Deux raisons, dans cet ordre :
    ///  1. une égalité parfaite revient à la story — le glissé vertical est le
    ///     seul moyen de refermer le lecteur, il ne se perd pas sur un ex æquo ;
    ///  2. rajouter ici la marge de 8 pt du parent creuserait une bande morte
    ///     (`dy < dx < dy + 8`) que PERSONNE ne posséderait : la barre aurait
    ///     renoncé, le parent n'aurait pas encore tranché son axe, et le doigt
    ///     ne ferait rien du tout.
    ///
    /// Le verdict se recalcule à chaque tick, sur la translation CUMULÉE : un
    /// geste parti à l'horizontale puis rabattu vers le bas repasse à `.story`
    /// en cours de route, et le lecteur reprend la main sans qu'il faille lever
    /// le doigt.
    static func owner(translation: CGSize) -> Owner {
        let dx = abs(translation.width)
        let dy = abs(translation.height)
        guard dx >= horizontalClaimDistance else { return .story }
        return dx > dy ? .strip : .story
    }
}
