import SwiftUI

// MARK: - Où un bouton flottant peut se poser (#9679)

/// Le bord contre lequel un bouton flottant s'aimante.
public nonisolated enum FloatingButtonSide: String, Equatable, Sendable {
    case leading = "L"
    case trailing = "R"

    public var opposite: FloatingButtonSide { self == .leading ? .trailing : .leading }
}

/// La place CHOISIE d'un bouton flottant : un bord, et une hauteur exprimée en
/// fraction de la plage verticale FIXE de l'écran (0 = tout en haut, sous
/// l'îlot ; 1 = tout en bas, au-dessus de l'indicateur d'accueil).
///
/// La plage ne dépend que de l'écran et de sa zone sûre — jamais d'une barre
/// qui apparaît ou disparaît —, donc un bouton posé ne bouge plus tout seul.
public nonisolated struct FloatingButtonPlacement: Equatable, Sendable {
    public let side: FloatingButtonSide
    public let height: CGFloat

    public init(side: FloatingButtonSide, height: CGFloat) {
        self.side = side
        self.height = min(max(height, 0), 1)
    }

    /// La forme persistée : `v2,L,0.4200`. Trois champs, pour qu'une ancienne
    /// version de l'app (qui attend `x,y`) retombe sur sa position par défaut
    /// au lieu de mal lire la valeur.
    public var storageValue: String {
        "v2,\(side.rawValue),\(String(format: "%.4f", Double(height)))"
    }
}

/// Ce que contient une chaîne `@AppStorage` de position.
public nonisolated enum FloatingButtonStoredPosition: Equatable, Sendable {
    /// La forme actuelle.
    case placement(FloatingButtonPlacement)
    /// La forme d'avant #9679 : `x,y` normalisés sur une plage qui réservait
    /// 246 pt en haut et 110 pt en bas (`FloatingButtonSafeZone`), mesurée
    /// avec une zone sûre NULLE. C'est aussi la forme des positions par défaut.
    case legacy(x: CGFloat, y: CGFloat)

    public static func parse(_ raw: String) -> FloatingButtonStoredPosition? {
        let parts = raw.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        if parts.count == 3, parts[0] == "v2",
           let side = FloatingButtonSide(rawValue: parts[1]),
           let height = Double(parts[2]), height.isFinite {
            return .placement(FloatingButtonPlacement(side: side, height: CGFloat(height)))
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

    public let screenSize: CGSize
    public let safeArea: EdgeInsets

    public init(screenSize: CGSize, safeArea: EdgeInsets) {
        self.screenSize = screenSize
        self.safeArea = safeArea
    }

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
        CGPoint(x: x(for: placement.side), y: minY + (maxY - minY) * placement.height)
    }

    /// La place que désigne un point : le bord le plus proche, la hauteur
    /// bornée à la plage.
    public func placement(at point: CGPoint) -> FloatingButtonPlacement {
        let side: FloatingButtonSide = point.x < screenSize.width / 2 ? .leading : .trailing
        let range = maxY - minY
        let height = range > 0 ? (point.y - minY) / range : 0
        return FloatingButtonPlacement(side: side, height: height)
    }

    // MARK: Lecture d'une valeur persistée

    /// Le centre qu'une valeur persistée désigne. Une valeur d'avant #9679 est
    /// relue avec SA géométrie (celle qui la posait à l'écran), puis bornée à la
    /// plage actuelle : le bouton reste où l'utilisateur le voyait.
    public func center(forStorage raw: String, default fallback: String) -> CGPoint {
        switch FloatingButtonStoredPosition.parse(raw) ?? FloatingButtonStoredPosition.parse(fallback) {
        case .placement(let placement):
            return center(for: placement)
        case .legacy(let x, let y):
            let side: FloatingButtonSide = x < 0.5 ? .leading : .trailing
            return CGPoint(x: self.x(for: side), y: clampY(legacyCenterY(normalized: y)))
        case nil:
            return center(for: FloatingButtonPlacement(side: .leading, height: 0))
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
                let fullFrame = full.frame(in: .global)
                content(FloatingButtonGeometry(
                    screenSize: full.size,
                    safeArea: EdgeInsets(
                        top: max(reported.top, safeFrame.minY - fullFrame.minY, 0),
                        leading: max(reported.leading, safeFrame.minX - fullFrame.minX, 0),
                        bottom: max(reported.bottom, fullFrame.maxY - safeFrame.maxY, 0),
                        trailing: max(reported.trailing, fullFrame.maxX - safeFrame.maxX, 0)
                    )
                ))
            }
            .ignoresSafeArea()
        }
        .ignoresSafeArea(.keyboard)
    }
}
