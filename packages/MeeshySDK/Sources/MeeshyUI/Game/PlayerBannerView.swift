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
// d'au moins 48 pt (#11125). Dynamic Type : au-delà de XXL, la jauge passe SOUS l'anneau et les pièces se rangent en grille.

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
        /// « 4 » (les trophées).
        public let trophies: String?
        /// « 1/3 » (la mission du jour).
        public let mission: String?
        /// « S1 » (la saison).
        public let season: String?
        /// La phrase de lecteur d'écran de CHAQUE pièce quand elles sont des boutons (`onSelect`).
        public let pieceLabels: [GamePlayerBanner.Piece: String]

        public init(points: String, missing: String? = nil, meeshes: String? = nil, place: String? = nil, flameDays: String? = nil,
                    trophies: String? = nil, mission: String? = nil, season: String? = nil,
                    pieceLabels: [GamePlayerBanner.Piece: String] = [:]) {
            self.points = points
            self.missing = missing
            self.meeshes = meeshes
            self.place = place
            self.flameDays = flameDays
            self.trophies = trophies
            self.mission = mission
            self.season = season
            self.pieceLabels = pieceLabels
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
    /// Quand l'hôte le pose, CHAQUE pièce est son propre bouton vers sa fiche (#10846) : un élément de lecteur
    /// d'écran par pièce, une cible d'au moins 44 pt, et le bandeau s'élargit en hauteur plutôt que de les serrer.
    private let onSelect: ((GamePlayerBanner.Piece) -> Void)?

    /// La cible tactile minimale d'une pièce.
    public static let pieceTarget: CGFloat = 44

    /// L'ANGLE du bandeau (#11125, miroir du web `06a2061754`) : les Meeshes en haut, le rang et la mission dessous,
    /// au bout de la jauge. Deux lignes de 24 pt — compromis demandé par le porteur pour que le bandeau tienne en
    /// 48 pt, ces trois pièces sortent de la cible de 44.
    public static let cornerPieces: [GamePlayerBanner.Piece] = [.meesh, .rank, .mission]
    public static let cornerTarget: CGFloat = 24

    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .body) private var ringSide: CGFloat = 52
    @ScaledMetric(relativeTo: .body) private var compactRingSide: CGFloat = 40

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
                accessibilityLabel: String? = nil, onSelect: ((GamePlayerBanner.Piece) -> Void)? = nil) {
        self.onSelect = onSelect
        self.model = model
        self.texts = texts
        self.palette = palette
        self.sheen = sheen
        self.backdrop = backdrop
        self.accessibilityLabel = accessibilityLabel
    }

    /// La hauteur minimale : 48 pt (#11125, comme le web) — une pièce de 44 pt et sa marge.
    public static let minimumHeight: CGFloat = 48

    /// La couleur du petit texte (« encore 70 ») : le ton discret sur l'aplat seul, l'ENCRE dès qu'une bannière de
    /// profil passe dessous — une image, même translucide, lui prend le contraste que l'aplat lui garantissait.
    public static func detailColor(palette: Palette, overBackdrop: Bool) -> Color {
        overBackdrop ? palette.ink : palette.muted
    }

    private var hasBackdrop: Bool { !(backdrop ?? "").isEmpty }
    private var tint: Color { LevelTierPalette.color(for: model.tier) }
    private var stacked: Bool { typeSize > .xxLarge }

    public var body: some View {
        // Jamais de `ViewThatFits` : sous iOS 26 il mesure ses candidats sur le rendu asynchrone, où les fermetures
        // de `GeometryReader` (l'anneau, la jauge) trappent à l'isolation du main actor (#9135, #9456). La
        // disposition se choisit sur la taille du texte, et la ligne tient sur 320 pt en laissant ses textes
        // se réduire.
        Group {
            if onSelect != nil && !stacked {
                compactRow
            } else if onSelect != nil {
                selectableLayout
            } else if stacked {
                stackedLayout
            } else {
                singleRow
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, onSelect != nil && !stacked ? 2 : 6)
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
        .modifier(BannerAccessibility(label: onSelect == nil ? accessibilityLabel : nil, contains: onSelect != nil))
    }

    // MARK: Le bandeau compact (#11125)

    /// UNE rangée : l'anneau, la jauge qui prend la place restante, la ligue, la Flamme, les trophées et la saison,
    /// puis l'ANGLE — les Meeshes en haut, le rang et la mission dessous. Aucune pièce ne passe sous la jauge.
    private var compactRow: some View {
        HStack(spacing: 4) {
            if model.showsLevel { select(.level) { ring(side: compactRingSide) } }
            if model.showsScore {
                select(.sparks) { model.showsLevel ? AnyView(gauge) : AnyView(scoreOnly) }
                    .frame(minWidth: 56, maxWidth: .infinity, alignment: .leading)
            } else {
                Spacer(minLength: 0)
            }
            ForEach(model.pieces.filter { !Self.cornerPieces.contains($0) && $0 != .level && $0 != .sparks }, id: \.self) { kind in
                select(kind, minWidth: Self.cornerTarget) { pieceContent(kind) }
            }
            corner
        }
    }

    @ViewBuilder
    private var corner: some View {
        let shown = model.pieces.filter(Self.cornerPieces.contains)
        if !shown.isEmpty {
            VStack(alignment: .trailing, spacing: 0) {
                if shown.contains(.meesh) {
                    select(.meesh, target: Self.cornerTarget) {
                        piece(text: texts.meeshes) { MeeshCoinView(face: .obverse, edition: .silver, figures: nil).frame(width: 20, height: 20) }
                    }
                }
                HStack(spacing: 6) {
                    if let rank = model.rank {
                        select(.rank, target: Self.cornerTarget) {
                            RankBlasonView(rank: rank.rank, division5: rank.division, mythic: rank.mythic, figures: nil).frame(height: 22)
                        }
                    }
                    if shown.contains(.mission) {
                        select(.mission, target: Self.cornerTarget) { piece(text: texts.mission) { symbol("target", side: 16) } }
                    }
                }
            }
            .fixedSize()
        }
    }

    // MARK: Les pièces-boutons (#10846)

    /// Au-delà de XXL : l'anneau et la jauge en haut — chacun son bouton —, puis les autres pièces qui passent à la
    /// ligne ; aucune cible ne descend sous 44 pt, le bandeau prend la hauteur qu'il faut.
    private var selectableLayout: some View {
        VStack(alignment: .leading, spacing: 6) {
            if model.showsLevel || model.showsScore {
                HStack(spacing: 10) {
                    if model.showsLevel { select(.level) { ring(side: ringWidth) } }
                    if model.showsScore {
                        select(.sparks) { model.showsLevel ? AnyView(gauge) : AnyView(scoreOnly) }
                    }
                }
            }
            let rest = model.pieces.filter { $0 != .level && $0 != .sparks }
            if !rest.isEmpty {
                FlowLayout(spacing: 8) {
                    ForEach(rest, id: \.self) { kind in
                        select(kind) { pieceContent(kind) }
                    }
                }
            }
        }
    }

    /// `minWidth` : une pièce de la rangée compacte garde 44 pt de haut mais peut s'étroitiser jusqu'à son dessin.
    private func select<Content: View>(_ piece: GamePlayerBanner.Piece, target: CGFloat = PlayerBannerView.pieceTarget,
                                       minWidth: CGFloat? = nil, @ViewBuilder content: () -> Content) -> some View {
        Button {
            onSelect?(piece)
        } label: {
            content()
                .frame(minWidth: minWidth ?? target, minHeight: target)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(texts.pieceLabels[piece] ?? "")
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("game.player_banner.\(piece.rawValue)")
    }

    @ViewBuilder
    private func pieceContent(_ kind: GamePlayerBanner.Piece) -> some View {
        switch kind {
        case .meesh:
            piece(text: texts.meeshes) { MeeshCoinView(face: .obverse, edition: .silver, figures: nil).frame(width: 22, height: 22) }
        case .rank:
            if let rank = model.rank {
                RankBlasonView(rank: rank.rank, division5: rank.division, mythic: rank.mythic, figures: nil).frame(width: 34)
            }
        case .league:
            if let league = model.league {
                piece(text: texts.place) { LeagueGemView(league: league.league).frame(width: 22, height: 22) }
            }
        case .flame:
            if let form = model.flame?.form {
                piece(text: texts.flameDays) { FlameView(form: form, flickers: false).frame(width: 22, height: 22) }
            }
        case .trophies:
            piece(text: texts.trophies) { symbol("trophy.fill") }
        case .mission:
            piece(text: texts.mission) { symbol("target") }
        case .season:
            piece(text: texts.season) { symbol("calendar") }
        case .level, .sparks:
            EmptyView()
        }
    }

    private func symbol(_ name: String, side: CGFloat = 22) -> some View {
        Image(systemName: name)
            .font(.system(size: side * 16 / 22, weight: .semibold))
            .foregroundColor(palette.ink)
            .frame(width: side, height: side)
            .accessibilityHidden(true)
    }

    // MARK: La bannière de profil, en translucide

    @ViewBuilder
    private var backdropLayer: some View {
        if hasBackdrop, let backdrop {
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
                ring(side: ringWidth)
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
                    ring(side: ringWidth)
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

    private func ring(side: CGFloat) -> some View {
        LevelRingView(
            level: model.level, progress: model.progress, tier: model.tier, prestige: model.prestige,
            trackColor: palette.ink.opacity(0.12), inkColor: palette.ink, mutedColor: palette.muted,
            discColor: palette.disc
        )
        .gameSpecularSheen(progress: reduceMotion ? 0 : sheen)
        .frame(width: side, height: ringHeight(side: side))
    }

    private var ringWidth: CGFloat { min(ringSide, 76) }

    /// Les étoiles de Prestige se posent SOUS l'anneau : la boîte de l'anneau grandit d'autant (56 × 66 au lieu de 56 × 56).
    private func ringHeight(side: CGFloat) -> CGFloat { model.prestige > 0 ? side * 66 / 56 : side }

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
                    .foregroundColor(Self.detailColor(palette: palette, overBackdrop: hasBackdrop))
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
            RankBlasonView(rank: rank.rank, division5: rank.division, mythic: rank.mythic, figures: nil)
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
    /// Les pièces sont des boutons : le bandeau CONTIENT leurs éléments, il n'en est pas un.
    var contains = false

    @ViewBuilder
    func body(content: Content) -> some View {
        if contains {
            content.accessibilityElement(children: .contain)
        } else if let label {
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
