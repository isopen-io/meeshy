import SwiftUI
import MeeshySDK

// MARK: - La bannière du joueur (#9494, conception XIII.1)
//
// MIROIR de `apps/web/src/components/player-banner.tsx` : le bandeau du haut, quand ni un appel ni un audio ne
// l'occupe, montre la progression du joueur en grand. Ordre FIXE, de gauche à droite : l'anneau de niveau (avec
// l'emblème du palier et son chiffre romain, #9481), la jauge vers le niveau suivant, les Meeshes, le blason du
// rang, la gemme de ligue et la place, la Flamme. SEULEMENT ce qui existe (`GamePlayerBanner`) : un élément sans
// donnée ne se dessine pas.
//
// Décor : la Signature en filigrane, teintée par la couleur du palier ; aucune bulle. Le fond est un APLAT
// (`Palette.surface`) : la bande du haut de l'app le reprend à l'identique, la couture ne peut pas dériver. Sur
// cet aplat, la BANNIÈRE DE PROFIL du joueur, en TRANSLUCIDE (`backdropOpacity`), sous les informations (#9536).
//
// Seulement ce qui a du sens (#9536) : sans détail de niveau (niveau 1) ni anneau ni jauge ; sans point, pas de
// total — le modèle (`GamePlayerBanner.showsLevel`, `showsScore`) décide, la brique obéit.
//
// La brique DESSINE. Elle ne parle aucune langue (les phrases courtes arrivent déjà formatées dans `Texts`),
// n'observe aucun singleton, ne navigue nulle part : l'hôte la pose dans un bouton qui ouvre Progression, lui
// donne sa phrase de lecteur d'écran, et joue l'entrée, la sortie et le reflet (`sheen`).
//
// Accessibilité : UN seul élément (`accessibilityLabel`, la phrase localisée de l'hôte — « Niveau 34, Éclat, 78 %
// vers le 35, 12 Meeshes, Conteur III, ligue Jade 4e, Flamme 23 jours ») ; ses dessins sont ignorés. Hauteur
// d'au moins 56 pt. Dynamic Type : au-delà de XXL, la jauge passe SOUS l'anneau et les pièces se rangent en grille.

public struct PlayerBannerView: View {

    /// Les phrases courtes, déjà localisées et formatées par l'hôte.
    public struct Texts: Equatable, Sendable {
        /// « 12 180 pts ».
        public let points: String
        /// « encore 70 » ; `nil` au sommet.
        public let missing: String?
        /// « 12 » (les Meeshes gardées).
        public let meeshes: String?
        /// « 4e ».
        public let place: String?
        /// « 23 » (les jours de la Flamme).
        public let flameDays: String?

        public init(points: String, missing: String? = nil, meeshes: String? = nil, place: String? = nil, flameDays: String? = nil) {
            self.points = points
            self.missing = missing
            self.meeshes = meeshes
            self.place = place
            self.flameDays = flameDays
        }
    }

    /// Les couleurs de l'hôte : la brique ne lit aucun thème.
    public struct Palette: Equatable, Sendable {
        /// L'APLAT du fond — le même que celui de la bande du haut.
        public let surface: Color
        public let ink: Color
        public let muted: Color
        /// Le disque central de l'anneau, sur lequel l'emblème du palier s'imprime en filigrane.
        public let disc: Color

        public init(surface: Color, ink: Color, muted: Color, disc: Color = .white) {
            self.surface = surface
            self.ink = ink
            self.muted = muted
            self.disc = disc
        }
    }

    /// La transparence de la bannière de profil posée sous les informations : assez pour qu'on la reconnaisse,
    /// jamais pour disputer le texte.
    public static let backdropOpacity: Double = 0.3

    private let model: GamePlayerBanner
    private let texts: Texts
    private let palette: Palette
    private let sheen: Double
    private let backdrop: String?
    private let accessibilityLabel: String?

    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .body) private var ringSide: CGFloat = 52

    /// - Parameters:
    ///   - model: ce qui existe du joueur (`GamePlayerBanner`).
    ///   - texts: les phrases courtes, formatées par l'hôte.
    ///   - palette: l'aplat, l'encre, le texte discret.
    ///   - sheen: le reflet Metal (ou son repli) qui traverse l'anneau au passage d'un niveau — de 0 à 1, l'hôte
    ///     l'anime ; hors de ]0, 1[ il ne pose aucun effet.
    ///   - backdrop: l'adresse de la bannière de profil du joueur, posée en translucide sous les informations ;
    ///     `nil` ou vide ⇒ l'aplat seul.
    ///   - accessibilityLabel: `nil` ⇒ décorative ; l'hôte dit la phrase complète.
    public init(model: GamePlayerBanner, texts: Texts, palette: Palette, sheen: Double = 0, backdrop: String? = nil,
                accessibilityLabel: String? = nil) {
        self.model = model
        self.texts = texts
        self.palette = palette
        self.sheen = sheen
        self.backdrop = backdrop
        self.accessibilityLabel = accessibilityLabel
    }

    /// La hauteur minimale : le plus grand des deux, 56 pt et l'anneau — jamais moins qu'une cible de 44 pt.
    public static let minimumHeight: CGFloat = 56

    private var tint: Color { LevelTierPalette.color(for: model.tier) }
    private var stacked: Bool { typeSize > .xxLarge }

    public var body: some View {
        // Jamais de `ViewThatFits` : sous iOS 26 il mesure ses candidats sur le rendu asynchrone, où les fermetures
        // de `GeometryReader` (l'anneau, la jauge) trappent à l'isolation du main actor (#9135, #9456). La
        // disposition se choisit sur la taille du texte, et la ligne tient sur 320 pt en laissant ses textes
        // se réduire.
        Group {
            if stacked {
                stackedLayout
            } else {
                singleRow
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, minHeight: Self.minimumHeight, alignment: .leading)
        .background(alignment: .topTrailing) {
            palette.surface
                .overlay { backdropLayer }
                .overlay(alignment: .topTrailing) {
                    SignatureMark(style: .flat, color: tint)
                        .frame(width: 120, height: 120)
                        .opacity(0.12)
                        .offset(x: 18, y: -26)
                        .accessibilityHidden(true)
                }
                .clipped()
        }
        .overlay(alignment: .bottom) {
            Rectangle().fill(palette.ink.opacity(0.08)).frame(height: 0.5)
        }
        .modifier(BannerAccessibility(label: accessibilityLabel))
    }

    // MARK: La bannière de profil, en translucide

    @ViewBuilder
    private var backdropLayer: some View {
        if let backdrop, !backdrop.isEmpty {
            CachedAsyncImage(url: backdrop, targetSize: CGSize(width: 480, height: 160), showsStatusOverlays: false) {
                Color.clear
            }
            .scaledToFill()
            .opacity(Self.backdropOpacity)
            .accessibilityHidden(true)
            .allowsHitTesting(false)
        }
    }

    // MARK: Les deux dispositions

    /// Sur une ligne : anneau, jauge qui prend la place restante, puis les pièces — chacun seulement s'il a du sens.
    private var singleRow: some View {
        HStack(spacing: 10) {
            if model.showsLevel {
                ring
                gauge
                pieces
            } else if model.showsScore {
                scoreOnly
                Spacer(minLength: 0)
                pieces
            } else {
                pieces
                Spacer(minLength: 0)
            }
        }
    }

    /// Au-delà de XXL : l'anneau et les pièces en haut, la jauge SOUS l'anneau.
    private var stackedLayout: some View {
        VStack(alignment: .leading, spacing: 6) {
            if model.showsLevel {
                HStack(alignment: .center, spacing: 10) {
                    ring
                    Spacer(minLength: 0)
                }
                gauge
            } else if model.showsScore {
                scoreOnly
            }
            if hasPieces {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), spacing: 10, alignment: .leading)], alignment: .leading, spacing: 6) {
                    pieceViews
                }
            }
        }
    }

    // MARK: L'anneau

    private var ring: some View {
        LevelRingView(
            level: model.level, progress: model.progress, tier: model.tier, prestige: model.prestige,
            trackColor: palette.ink.opacity(0.12), inkColor: palette.ink, mutedColor: palette.muted,
            discColor: palette.disc
        )
        .gameSpecularSheen(progress: reduceMotion ? 0 : sheen)
        .frame(width: ringWidth, height: ringHeight)
    }

    private var ringWidth: CGFloat { min(ringSide, 76) }

    /// Les étoiles de Prestige se posent SOUS l'anneau : la boîte de l'anneau grandit d'autant (56 × 66 au lieu de 56 × 56).
    private var ringHeight: CGFloat { model.prestige > 0 ? ringWidth * 66 / 56 : ringWidth }

    // MARK: La jauge

    /// Le total de points seul — niveau 1 : rien à jauger encore, mais des points gagnés.
    private var scoreOnly: some View {
        Text(texts.points)
            .font(.system(.footnote, design: .rounded).weight(.bold))
            .monospacedDigit()
            .foregroundColor(palette.ink)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .modifier(BannerNumericRoll())
    }

    private var gauge: some View {
        VStack(alignment: .leading, spacing: 3) {
            if model.showsScore {
                scoreOnly
            }
            GaugeBar(progress: model.progress, tint: LevelTierPalette.style(for: model.tier), rail: palette.ink.opacity(0.12), animated: !reduceMotion)
                .frame(height: 6)
            if let missing = texts.missing {
                Text(missing)
                    .font(.caption2.weight(.medium))
                    .monospacedDigit()
                    .foregroundColor(palette.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
        .frame(minWidth: 44, maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Les pièces — seulement ce qui existe

    private var hasPieces: Bool {
        model.meeshes != nil || model.rank != nil || model.league != nil || model.flame != nil
    }

    private var pieces: some View {
        HStack(spacing: 8) { pieceViews }
    }

    @ViewBuilder
    private var pieceViews: some View {
        if model.meeshes != nil, let meeshes = texts.meeshes {
            piece(text: meeshes) { MeeshCoinView(face: .obverse, edition: .silver, figures: nil).frame(width: 22, height: 22) }
        }
        if let rank = model.rank {
            RankBlasonView(rank: rank.rank, division: rank.division, figures: nil)
                .frame(width: 34)
        }
        if let league = model.league {
            piece(text: texts.place) { LeagueGemView(league: league.league).frame(width: 22, height: 22) }
        }
        if model.flame != nil, let form = model.flame?.form {
            piece(text: texts.flameDays) { FlameView(form: form, flickers: false).frame(width: 22, height: 22) }
        }
    }

    private func piece<Symbol: View>(text: String?, @ViewBuilder symbol: () -> Symbol) -> some View {
        HStack(spacing: 4) {
            symbol()
            if let text {
                Text(text)
                    .font(.system(.footnote, design: .rounded).weight(.bold))
                    .monospacedDigit()
                    .foregroundColor(palette.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
    }
}

// MARK: - La barre de la jauge

/// Un rail et son remplissage, à la couleur du palier. Le remplissage s'étend par la LARGEUR (animable : l'hôte
/// anime `progress`), du côté d'où l'on lit — la gauche en français, la droite en arabe.
private struct GaugeBar: View {
    let progress: Double
    let tint: AnyShapeStyle
    let rail: Color
    let animated: Bool

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(rail)
                Capsule()
                    .fill(tint)
                    .frame(width: max(0, proxy.size.width * CGFloat(min(max(progress, 0), 1))))
                    .animation(animated ? .easeOut(duration: 0.42) : nil, value: progress)
            }
        }
        .accessibilityHidden(true)
    }
}

/// UN seul élément pour le lecteur d'écran, nommé de la phrase complète de l'hôte — sans le trait « image » que
/// `gameAccessibility` pose sur les objets : l'hôte met la brique dans un bouton, et un bouton n'est pas une image.
/// Sans phrase, la brique est décorative.
private struct BannerAccessibility: ViewModifier {
    let label: String?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let label {
            content.accessibilityElement(children: .ignore).accessibilityLabel(label)
        } else {
            content.accessibilityHidden(true)
        }
    }
}

/// Le chiffre « roule » quand les points changent (iOS 17+) ; sur iOS 16 il change net.
private struct BannerNumericRoll: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 17.0, macOS 14.0, *) {
            content.contentTransition(.numericText())
        } else {
            content
        }
    }
}
