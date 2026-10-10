import SwiftUI

// MARK: - Où un bouton flottant peut se poser (#9679)

/// Le bord contre lequel un bouton flottant s'aimante.
public nonisolated enum FloatingButtonSide: String, Equatable, Sendable {
    case leading = "L"
    case trailing = "R"

    public var opposite: FloatingButtonSide { self == .leading ? .trailing : .leading }
}

/// La place CHOISIE d'un bouton flottant : un bord, et la hauteur de son
/// centre en fraction de la hauteur de l'ÉCRAN (0 = bord haut, 1 = bord bas).
///
/// La fraction se rapporte à l'écran, jamais à la plage permise : la plage
/// dépend de la zone sûre MESURÉE, qui peut valoir autre chose au premier
/// passage de mise en page qu'au suivant. Écrite et relue sur l'écran, une
/// position revient au point près après une relance ; la plage ne sert qu'à
/// la borner à l'affichage.
public nonisolated struct FloatingButtonPlacement: Equatable, Sendable {
    public let side: FloatingButtonSide
    public let screenFraction: CGFloat

    public init(side: FloatingButtonSide, screenFraction: CGFloat) {
        self.side = side
        self.screenFraction = min(max(screenFraction, 0), 1)
    }

    /// La forme persistée : `v3,L,0.512345`. Trois champs, pour qu'une
    /// ancienne version de l'app (qui attend `x,y`) retombe sur sa position par
    /// défaut au lieu de mal lire la valeur.
    public var storageValue: String {
        "v3,\(side.rawValue),\(String(format: "%.6f", Double(screenFraction)))"
    }
}

/// Ce que contient une chaîne `@AppStorage` de position.
public nonisolated enum FloatingButtonStoredPosition: Equatable, Sendable {
    /// La forme actuelle.
    case placement(FloatingButtonPlacement)
    /// La forme des premiers builds de #9679 (`v2,L,0.4200`) : une fraction de
    /// la PLAGE permise, relue sur la plage courante.
    case rangeFraction(side: FloatingButtonSide, fraction: CGFloat)
    /// La forme d'avant #9679 : `x,y` normalisés sur une plage qui réservait
    /// 246 pt en haut et 110 pt en bas (`FloatingButtonSafeZone`), mesurée
    /// avec une zone sûre NULLE. C'est aussi la forme des positions par défaut.
    case legacy(x: CGFloat, y: CGFloat)

    public static func parse(_ raw: String) -> FloatingButtonStoredPosition? {
        let parts = raw.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        if parts.count == 3,
           let side = FloatingButtonSide(rawValue: parts[1]),
           let value = Double(parts[2]), value.isFinite {
            switch parts[0] {
            case "v3": return .placement(FloatingButtonPlacement(side: side, screenFraction: CGFloat(value)))
            case "v2": return .rangeFraction(side: side, fraction: CGFloat(min(max(value, 0), 1)))
            default: return nil
            }
        }
        guard parts.count == 2,
              let x = Double(parts[0]), let y = Double(parts[1]),
              x.isFinite, y.isFinite else { return nil }
        return .legacy(x: CGFloat(min(max(x, 0), 1)), y: CGFloat(min(max(y, 0), 1)))
    }
}

/// Les centres effectifs des deux boutons, une fois le chevauchement résolu.
public nonisolated struct FloatingButtonsLayout: Equatable, Sendable {
    public let feed: CGPoint
    public let menu: CGPoint
}

/// La SEULE source de la géométrie des boutons flottants : le conteneur qui les
/// pose, l'échelle du menu qui s'ouvre depuis l'un, et l'ancre des réels qui
/// naît de l'autre la lisent tous trois.
///
/// `safeArea` est la zone sûre RÉELLE de l'écran (îlot, indicateur d'accueil),
/// mesurée par la mise en page (`FloatingButtonsSafeAreaReader`), jamais lue
/// sur la fenêtre depuis l'intérieur de cette fenêtre.
public nonisolated struct FloatingButtonGeometry: Equatable, Sendable {
    public static let buttonSize: CGFloat = 52
    /// Écart horizontal entre le disque et le bord de l'écran.
    public static let edgePadding: CGFloat = 20
    /// Écart entre le disque et la zone sûre, en haut comme en bas.
    public static let verticalMargin: CGFloat = 8
    /// Écart minimal entre deux disques posés du même côté.
    public static let discGap: CGFloat = 12
    /// Distance minimale entre deux centres du même côté.
    public static var minimumSeparation: CGFloat { buttonSize + discGap }

    /// Les positions persistées par défaut — inchangées depuis avant #9679 :
    /// le Flux en haut à gauche, le Menu en haut à droite, sous les stories.
    public static let defaultFeedStorage = "0.0,0.0"
    public static let defaultMenuStorage = "1.0,0.0"

    /// L'écran, en coordonnées GLOBALES (origine au coin haut de l'écran).
    public let screenSize: CGSize
    /// La zone sûre de l'écran, en coordonnées globales.
    public let safeArea: EdgeInsets
    /// L'origine globale du conteneur qui dessine : toute la géométrie est
    /// globale, seul le dessin se fait dans le repère local (`local(_:)`).
    public let origin: CGPoint

    public init(screenSize: CGSize, safeArea: EdgeInsets, origin: CGPoint = .zero) {
        self.screenSize = screenSize
        self.safeArea = safeArea
        self.origin = origin
    }

    /// La géométrie de l'ÉCRAN depuis deux cadres globaux : celui du conteneur
    /// qui ignore la zone sûre, celui du même conteneur qui la respecte.
    ///
    /// Le conteneur des boutons peut ne pas commencer en haut de l'écran : la
    /// bannière du joueur (#9494) le pousse vers le bas, de sa hauteur, et cette
    /// hauteur change quand elle se replie. Mesurée dans le repère du conteneur,
    /// une position écrite bannière repliée revenait 69 à 80 pt plus bas
    /// bannière dépliée (recette 2026-10-08). L'écran, lui, ne bouge pas : il va
    /// du haut de la fenêtre (y = 0) au bas du conteneur, qui touche le bas de
    /// l'écran. Quand le conteneur ne touche pas le haut, l'encoche n'y est pas
    /// mesurable : on la majore (`FloatingButtonSafeZone.maxTopInset`), et le
    /// bouton peut se poser par-dessus la bannière — la plage ne dépend pas
    /// de son état.
    public static func measured(container: CGRect, safeRegion: CGRect, reported: EdgeInsets) -> FloatingButtonGeometry {
        let touchesTop = container.minY <= 0.5
        let top = touchesTop
            ? max(reported.top, safeRegion.minY - container.minY, 0)
            : FloatingButtonSafeZone.maxTopInset
        return FloatingButtonGeometry(
            screenSize: CGSize(width: max(container.maxX, 0), height: max(container.maxY, 0)),
            safeArea: EdgeInsets(
                top: top,
                leading: container.minX + max(reported.leading, safeRegion.minX - container.minX, 0),
                bottom: max(reported.bottom, container.maxY - safeRegion.maxY, 0),
                trailing: max(reported.trailing, container.maxX - safeRegion.maxX, 0)
            ),
            origin: container.origin
        )
    }

    /// Un point global, dans le repère du conteneur qui dessine.
    public func local(_ point: CGPoint) -> CGPoint {
        CGPoint(x: point.x - origin.x, y: point.y - origin.y)
    }

    /// Un point du repère du conteneur, en coordonnées globales.
    public func global(_ point: CGPoint) -> CGPoint {
        CGPoint(x: point.x + origin.x, y: point.y + origin.y)
    }

    /// Faux tant que la mise en page n'a pas encore donné l'écran : rien ne se
    /// pose ni ne se persiste sur une géométrie vide.
    public var isMeasured: Bool { screenSize.width > 0 && screenSize.height > 0 }

    private var half: CGFloat { Self.buttonSize / 2 }
    private static let tolerance: CGFloat = 0.5

    // MARK: Plage

    /// Le plus haut centre possible : juste sous la zone sûre du haut.
    public var minY: CGFloat { safeArea.top + Self.verticalMargin + half }

    /// Le plus bas centre possible : juste au-dessus de la zone sûre du bas.
    public var maxY: CGFloat {
        max(minY, screenSize.height - safeArea.bottom - Self.verticalMargin - half)
    }

    public func x(for side: FloatingButtonSide) -> CGFloat {
        switch side {
        case .leading: return safeArea.leading + Self.edgePadding + half
        case .trailing: return screenSize.width - safeArea.trailing - Self.edgePadding - half
        }
    }

    public func center(for placement: FloatingButtonPlacement) -> CGPoint {
        CGPoint(x: x(for: placement.side), y: clampY(placement.screenFraction * screenSize.height))
    }

    /// La place que désigne un point : le bord le plus proche, la hauteur
    /// bornée à la plage, exprimée sur l'écran.
    public func placement(at point: CGPoint) -> FloatingButtonPlacement {
        let side: FloatingButtonSide = point.x < screenSize.width / 2 ? .leading : .trailing
        let fraction = screenSize.height > 0 ? clampY(point.y) / screenSize.height : 0
        return FloatingButtonPlacement(side: side, screenFraction: fraction)
    }

    // MARK: Lecture d'une valeur persistée

    /// Le centre qu'une valeur persistée désigne. Une valeur d'avant #9679 est
    /// relue avec SA géométrie (celle qui la posait à l'écran), puis bornée à la
    /// plage actuelle : le bouton reste où l'utilisateur le voyait.
    public func center(forStorage raw: String, default fallback: String) -> CGPoint {
        switch FloatingButtonStoredPosition.parse(raw) ?? FloatingButtonStoredPosition.parse(fallback) {
        case .placement(let placement):
            return center(for: placement)
        case .rangeFraction(let side, let fraction):
            return CGPoint(x: x(for: side), y: minY + (maxY - minY) * fraction)
        case .legacy(let x, let y):
            let side: FloatingButtonSide = x < 0.5 ? .leading : .trailing
            return CGPoint(x: self.x(for: side), y: clampY(legacyCenterY(normalized: y)))
        case nil:
            return CGPoint(x: x(for: .leading), y: minY)
        }
    }

    /// La hauteur que la géométrie d'avant #9679 donnait à `y` : zone sûre
    /// nulle, 246 pt réservés en haut, 110 pt en bas (barre de recherche
    /// visible, l'état au repos).
    private func legacyCenterY(normalized y: CGFloat) -> CGFloat {
        let top = FloatingButtonSafeZone.top + half
        let bottom = max(top, screenSize.height - FloatingButtonSafeZone.legacyBottom - half)
        return top + (bottom - top) * y
    }

    private func clampY(_ y: CGFloat) -> CGFloat { min(max(y, minY), maxY) }

    // MARK: Les deux boutons ensemble

    /// Le Flux garde sa place ; le Menu, s'il tombe sur lui, se décale.
    public func layout(feedStorage: String, menuStorage: String) -> FloatingButtonsLayout {
        let feed = center(forStorage: feedStorage, default: Self.defaultFeedStorage)
        let menu = center(forStorage: menuStorage, default: Self.defaultMenuStorage)
        return FloatingButtonsLayout(feed: feed, menu: resolved(menu, awayFrom: feed))
    }

    /// La place d'un bouton lâché en `point` quand l'autre est en `other` : le
    /// bord le plus proche, et, s'il tombe sur l'autre, juste au-dessus ou
    /// juste en dessous de lui (du côté où le doigt l'a lâché).
    public func placement(droppedAt point: CGPoint, avoiding other: CGPoint) -> FloatingButtonPlacement {
        let wanted = center(for: placement(at: point))
        return placement(at: resolved(wanted, awayFrom: other))
    }

    /// `center` décalé hors de `anchor` s'ils sont du même côté et trop près.
    public func resolved(_ center: CGPoint, awayFrom anchor: CGPoint) -> CGPoint {
        let separation = Self.minimumSeparation
        guard abs(center.x - anchor.x) < Self.tolerance,
              abs(center.y - anchor.y) < separation - Self.tolerance else { return center }
        let below = anchor.y + separation
        let above = anchor.y - separation
        let candidates = center.y >= anchor.y ? [below, above] : [above, below]
        if let y = candidates.first(where: { $0 >= minY - Self.tolerance && $0 <= maxY + Self.tolerance }) {
            return CGPoint(x: center.x, y: clampY(y))
        }
        let side: FloatingButtonSide = center.x < screenSize.width / 2 ? .trailing : .leading
        return CGPoint(x: x(for: side), y: center.y)
    }

    // MARK: Écriture — le SEUL chemin

    /// Course en deçà de laquelle un geste est un TOUCHER, pas un glisser.
    public static let dragThreshold: CGFloat = 12

    /// La valeur à persister à la FIN d'un glisser parti de `start` (centre
    /// global affiché), ou `nil` : rien à écrire. Un toucher — même avec le
    /// tremblement du doigt — n'écrit rien. C'est le seul producteur d'une
    /// position persistée : la mise en page, l'anti-chevauchement et l'ancre
    /// des réels LISENT, ils n'écrivent jamais.
    public func storage(afterDragFrom start: CGPoint, translation: CGSize, avoiding other: CGPoint) -> String? {
        guard hypot(translation.width, translation.height) >= Self.dragThreshold else { return nil }
        let dropped = CGPoint(x: start.x + translation.width, y: start.y + translation.height)
        return placement(droppedAt: dropped, avoiding: other).storageValue
    }

    // MARK: Menu

    /// L'échelle s'ouvre vers le bas si elle y tient, sinon vers le haut si
    /// elle y tient, sinon du côté qui a le plus de place.
    public func menuOpensDownward(from center: CGPoint, ladderExtent: CGFloat) -> Bool {
        let below = screenSize.height - safeArea.bottom - (center.y + half)
        let above = (center.y - half) - safeArea.top
        if below >= ladderExtent { return true }
        if above >= ladderExtent { return false }
        return below >= above
    }
}

// MARK: - Mesure de la zone sûre réelle

/// Remonte la géométrie mesurée par le conteneur des boutons, pour que
/// l'échelle du menu et l'ancre des réels lisent la même.
public nonisolated struct FloatingButtonGeometryKey: PreferenceKey {
    public static let defaultValue: FloatingButtonGeometry? = nil
    public static func reduce(value: inout FloatingButtonGeometry?, nextValue: () -> FloatingButtonGeometry?) {
        value = nextValue() ?? value
    }
}

/// Mesure l'écran entier ET sa zone sûre réelle par la mise en page : un
/// lecteur qui respecte la zone sûre, un lecteur intérieur qui l'ignore, et
/// l'écart de leurs cadres. Le contenu est posé sur l'écran entier.
///
/// Un `GeometryReader` qui porte lui-même `.ignoresSafeArea()` lit une zone
/// sûre NULLE (c'est ce qui imposait les 246 pt réservés en dur) ; lire celle
/// de la fenêtre depuis l'intérieur de la fenêtre fige la vue (cycle
/// AttributeGraph). La différence de deux cadres n'a ni l'un ni l'autre défaut.
public struct FloatingButtonsSafeAreaReader<Content: View>: View {
    private let content: (FloatingButtonGeometry) -> Content

    public init(@ViewBuilder content: @escaping (FloatingButtonGeometry) -> Content) {
        self.content = content
    }

    public var body: some View {
        GeometryReader { safe in
            let safeFrame = safe.frame(in: .global)
            let reported = safe.safeAreaInsets
            GeometryReader { full in
                content(FloatingButtonGeometry.measured(
                    container: full.frame(in: .global),
                    safeRegion: safeFrame,
                    reported: reported
                ))
            }
            .ignoresSafeArea()
        }
        .ignoresSafeArea(.keyboard)
    }
}
