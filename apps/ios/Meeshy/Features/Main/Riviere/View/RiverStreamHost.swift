import SwiftUI
import MeeshyUI

/// L'écran Rivière — compose la loi (`RiverLaneResolver`), les tokens
/// (`RiverMetrics`) et les trois vues feuilles (`RiverBubbleView`,
/// `RiverLaneCanvas`, `RiverLaneHeaderStrip`) en une grille défilable à deux
/// axes. C'est le SEUL fichier qui les assemble — chacune d'elles reste
/// montable et testable seule.
///
/// **Grille, pas position absolue** : une pile de RANGÉES à colonnes FIXES
/// (`RiverMetrics.Lane.widthReference`, ou une largeur de couloir plus
/// étroite passée par l'appelant — §7ter, « `maxLanes`/la largeur de couloir
/// restent des PARAMÈTRES d'entrée, jamais tronquer le texte »), remplie en
/// ordre RANG-MAJEUR/couloir-mineur — même correspondance que la grille CSS
/// de la maquette normative (`cell.style.gridColumn/gridRow`). Un rang ne
/// porte JAMAIS plus d'une bulle (la loi le garantit) ; les autres colonnes
/// de ce rang restent des cellules vides qui préservent l'alignement — la
/// hauteur de la RANGÉE s'ajuste au contenu réel (§7ter A1, « la hauteur
/// n'est plus une constante »).
///
/// Un `LazyVGrid` portait cette grille jusqu'au lot 2 ; il ne sait PAS
/// étendre une cellule sur toutes ses colonnes, ce qu'exige l'avis système
/// pleine largeur. Une `LazyVStack` de `HStack` rend la MÊME grille
/// (couloirs contigus de `laneWidth`, `RiverColumnLayout` inchangé) et sait,
/// elle, poser un rang à cheval.
///
/// **Sérialisée** (`geometry.layout == .serialized`) : `geometry.laneCount
/// == 1` déjà côté loi — la grille tombe naturellement à une seule colonne,
/// AUCUNE branche latérale n'est dessinée (`RiverLaneCanvas` le vérifie
/// aussi, indépendamment).
///
/// **Ordre VoiceOver/lecture = ordre chronologique strict** : la grille est
/// peuplée depuis `0..<rankCount`, dans cet ordre — `geometry.bubbles` EST
/// cet ordre (§7bis/§7ter). Les cellules vides ne portent aucun contenu
/// accessible ; le Canvas est `accessibilityHidden`.
///
/// **Deux axes qui se PARCOURENT** : un balayage (`DragGesture`,
/// `.simultaneousGesture` — ne dispute jamais le pan natif du `ScrollView`)
/// traduit sa direction dominante en `.left`/`.right`/`.up`/`.down` et
/// délègue à `RiverNavigationController.step`, qui délègue lui-même à
/// `resolveRiverStep`. Un tap sur une bulle déplace le curseur dessus
/// (`moveTo`) sans passer par la loi — c'est un choix explicite, pas un pas.
struct RiverStreamHost: View {
    let geometry: RiverLaneResolver.RiverGeometry
    /// Contenu résolu (texte, nom, heure — le Prisme déjà appliqué par
    /// l'appelant) pour CHAQUE bulle de `geometry.bubbles`. Une bulle sans
    /// entrée correspondante reste une cellule vide — jamais un crash, la
    /// géométrie et le contenu peuvent transiter par des passes différentes.
    let contents: [RiverBubbleContent]
    /// Largeur de couloir — défaut `RiverMetrics.Lane.widthReference`,
    /// abaissable par l'appelant sur un écran étroit (§7ter, jamais une
    /// troncature de texte).
    var laneWidth: CGFloat = RiverMetrics.Lane.widthReference
    /// Hauteur RÉELLE du pane, DITE par l'appelant (qui la mesure déjà pour
    /// borner la Rivière à l'écran). Sert l'unique ligne de lecture
    /// (`focusRank`). Reçue plutôt que mesurée ici : `Riviere/View/` réutilise
    /// les primitives de mesure existantes, il n'en déclare jamais une
    /// troisième (`RiverSourceGuardTests`).
    var paneHeight: CGFloat = 0

    @ObservedObject var navigation: RiverNavigationController

    @State private var frames: [String: CGRect] = [:]
    @State private var horizontalOffset: CGFloat = 0
    /// Le fil s'ouvre au PRÉSENT — une seule fois. Un lecteur qui est remonté
    /// dans l'histoire ne doit jamais être ramené en bas par l'arrivée d'un
    /// message (même règle que le fil : la position de la barre ne dit pas ce
    /// qui a été vu).
    @State private var hasLandedOnCursor = false


    private var laneCount: Int { max(1, geometry.laneCount) }

    private var columns: RiverColumnLayout {
        RiverColumnLayout(laneWidth: laneWidth, gutter: RiverMetrics.Lane.gutter, laneCount: laneCount)
    }

    private var contentByMessageId: [String: RiverBubbleContent] {
        Dictionary(uniqueKeysWithValues: contents.map { ($0.bubble.messageId, $0) })
    }

    private var bubbleByRank: [Int: RiverLaneResolver.RiverBubble] {
        Dictionary(uniqueKeysWithValues: geometry.bubbles.map { ($0.rank, $0) })
    }

    /// **Hauteur de lecture, en RANG** — ce que `resolveRiverLaneHeaders`
    /// attend (§7ter B, fractionnaire).
    ///
    /// Elle valait le CURSEUR tant que l'écran n'était pas monté : un repli
    /// honnête, mais un repli. Monté, il ment — le curseur ne bouge qu'au
    /// balayage ou au tap, jamais au défilement, si bien que la bande de
    /// couloirs nommait des voix d'un tout autre instant que celui qu'on lit,
    /// ou ne nommait personne (retour produit 2026-08-21 : « aucune
    /// information de la conversation n'est préservée et visible à tout
    /// moment »).
    ///
    /// La vraie hauteur se MESURE : les cadres publiés par les bulles
    /// (`MessageFramePreferenceKey`) vivent dans le repère FIXE du pane, donc
    /// celui qui croise la ligne de lecture EST le rang qu'on lit. Aucun
    /// second calcul de loi : on nomme un rang, la loi fait le reste. Sans
    /// cadre encore mesuré (premier rendu), le curseur reprend son rôle de
    /// repli.
    private var focusRank: Double {
        guard paneHeight > 0 else { return Double(navigation.cursor.rank) }
        let readingLine = paneHeight * Self.readingLineRatio
        var best: (rank: Int, distance: CGFloat)?
        for bubble in geometry.bubbles {
            guard let frame = frames[bubble.messageId] else { continue }
            let distance = abs(frame.midY - readingLine)
            if best == nil || distance < best!.distance {
                best = (bubble.rank, distance)
            }
        }
        return Double(best?.rank ?? navigation.cursor.rank)
    }

    /// La ligne de lecture — un tiers sous le haut du pane, là où l'œil se
    /// pose quand il descend une conversation (même parti pris que la bande
    /// de focus du fil).
    private static let readingLineRatio: CGFloat = 0.34

    private var laneHeaders: [RiverLaneResolver.RiverLaneHeader] {
        RiverLaneResolver.resolveRiverLaneHeaders(
            RiverLaneResolver.ResolveRiverLaneHeadersInput(geometry: geometry, focusRank: focusRank)
        )
    }

    var body: some View {
        ScrollViewReader { proxy in
            scrollPane
                .onAppear { landOnCursor(proxy) }
        }
    }

    /// Atterrissage au PRÉSENT : le curseur d'ouverture est la bulle la plus
    /// récente (`RiverConversationMapping.initialCursor`) — sans ce cadrage,
    /// la Rivière s'ouvrait sur le message le PLUS ANCIEN de la fenêtre
    /// chargée, et il fallait dérouler toute l'histoire pour rejoindre la
    /// conversation. Le rang EST l'identité de la rangée dans la grille
    /// (`ForEach(0..<rankCount, id: \.self)`), donc la cible du `scrollTo`.
    ///
    /// Différé d'un tour de boucle : la pile paresseuse (`LazyVStack`) n'a
    /// pas encore posé ses rangées au premier `onAppear`. Si le cadrage
    /// échoue, la Rivière s'ouvre simplement en haut — jamais une erreur.
    private func landOnCursor(_ proxy: ScrollViewProxy) {
        guard !hasLandedOnCursor, geometry.rankCount > 0 else { return }
        hasLandedOnCursor = true
        let target = min(max(0, navigation.cursor.rank), geometry.rankCount - 1)
        DispatchQueue.main.async {
            // Ancre au bord GAUCHE du rang, pas `.bottom` : le pane défile sur
            // DEUX axes, et une ancre centrée en X emmenait aussi la vue vers
            // la droite du rang — c'est-à-dire dans les colonnes VIDES des
            // couloirs qui ne parlent pas à cet instant (mesuré au
            // simulateur : écran blanc, seule la pastille du dernier couloir
            // visible au bord droit). L'axe du temps se cadre, l'axe des voix
            // reste à la rive.
            proxy.scrollTo(target, anchor: UnitPoint(x: 0, y: 1))
        }
    }

    private var scrollPane: some View {
        ScrollView([.horizontal, .vertical]) {
            grid
                .background(RiverLaneCanvas(geometry: geometry, frames: frames, columns: columns))
                // La sonde d'offset horizontal DOIT vivre DANS le contenu
                // défilant : son cadre, exprimé dans le repère nommé porté
                // par le `ScrollView` (fixe), bouge avec le défilement.
                // Posée sur le `ScrollView` lui-même elle mesurerait son
                // PROPRE cadre dans SON PROPRE repère — une constante, jamais
                // l'offset (piège classique du patron `ScrollOffsetPreferenceKey`,
                // documenté par `ScrollOffsetTracking.swift`).
                .background(
                    GeometryReader { proxy in
                        Color.clear.preference(
                            key: HorizontalScrollOffsetKey.self,
                            value: -proxy.frame(in: .named(RiverCoordinateSpace.name)).minX
                        )
                    }
                )
        }
        .coordinateSpace(name: RiverCoordinateSpace.name)
        .onPreferenceChange(MessageFramePreferenceKey.self) { frames = $0 }
        .onPreferenceChange(HorizontalScrollOffsetKey.self) { horizontalOffset = $0 } // iOS 16–17
        .trackScrollContentOffsetX { horizontalOffset = $0 } // iOS 18+
        // La bande NOMME les couloirs et suit leur défilement horizontal : sa
        // largeur intrinsèque est celle de TOUS les couloirs
        // (`columns.totalWidth`, jusqu'à 7 × 300 pt). Posée nue en
        // `safeAreaInset` — hors du `ScrollView`, donc en LARGEUR RÉELLE —
        // elle imposait cette largeur à son parent : l'écran hôte s'élargissait
        // à 2100 pt et poussait l'en-tête du fil hors de l'écran (mesuré au
        // simulateur : bouton « Retour » à x = −683). Le cadre extensible +
        // rognage la borne à la largeur proposée sans rien changer à son
        // contenu ni à son offset.
        .safeAreaInset(edge: .top, spacing: 0) {
            RiverLaneHeaderStrip(headers: laneHeaders, columns: columns, horizontalOffset: horizontalOffset)
                .frame(maxWidth: .infinity, alignment: .leading)
                .clipped()
        }
        .simultaneousGesture(swipeGesture)
        .accessibilityElement(children: .contain)
    }

    // MARK: - Grille

    /// **Rang-majeur, couloir-mineur** — la boucle de RANG enveloppe celle de
    /// COULOIR : rang 0 tous couloirs, puis rang 1, etc. C'est l'ordre
    /// d'insertion dans l'arbre SwiftUI, donc l'ordre VoiceOver, donc l'ordre
    /// chronologique strict (`RiverStreamHostSourceGuardTests`).
    ///
    /// **Lot 2 — un rang système n'a pas de couloir** : la loi le sert dans
    /// `bubbles` avec son rang mais l'a retiré de toute branche, et documente
    /// que « la peau le rend PLEINE LARGEUR ». Ce rang-là saute donc la rangée
    /// de couloirs et prend toute la largeur du pane. Le `LazyVGrid` d'origine
    /// ne savait pas faire une cellule à cheval sur plusieurs colonnes ; une
    /// pile de rangées le sait, et reproduit la MÊME grille.
    private var grid: some View {
        LazyVStack(alignment: .leading, spacing: 0) {
            ForEach(0..<max(0, geometry.rankCount), id: \.self) { rank in
                if let bubble = bubbleByRank[rank],
                   bubble.isSystem,
                   let content = contentByMessageId[bubble.messageId] {
                    RiverBubbleView(content: content, contentWidth: columns.totalWidth)
                        .padding(.vertical, RiverMetrics.Bubble.baseGap)
                } else {
                    HStack(alignment: .top, spacing: 0) {
                        ForEach(0..<laneCount, id: \.self) { laneIndex in
                            cell(rank: rank, laneIndex: laneIndex)
                        }
                    }
                }
            }
        }
        .frame(width: columns.totalWidth, alignment: .leading)
    }

    @ViewBuilder
    private func cell(rank: Int, laneIndex: Int) -> some View {
        if
            let bubble = bubbleByRank[rank],
            bubble.laneIndex == laneIndex,
            let content = contentByMessageId[bubble.messageId]
        {
            RiverBubbleView(content: content, contentWidth: columns.bubbleContentWidth)
                .padding(.horizontal, RiverMetrics.Lane.gutter)
                .onTapGesture {
                    navigation.moveTo(RiverLaneResolver.RiverCursor(laneIndex: laneIndex, rank: rank))
                }
        } else {
            // Cellule VIDE — préserve l'alignement de colonne pour que
            // `LazyVGrid` garde la grille synchronisée avec `RiverColumnLayout`.
            // Jamais de contenu accessible : le rang existe déjà ailleurs
            // (dans la colonne de son auteur) dans l'ordre du DOM.
            Color.clear
                .frame(width: laneWidth, height: 1)
                .accessibilityHidden(true)
        }
    }

    // MARK: - Balayage — deux axes, `resolveRiverStep`

    private var swipeGesture: some Gesture {
        DragGesture(minimumDistance: 40)
            .onEnded { value in
                let isHorizontal = abs(value.translation.width) > abs(value.translation.height)
                let direction: RiverLaneResolver.RiverStepDirection
                if isHorizontal {
                    direction = value.translation.width < 0 ? .right : .left
                } else {
                    direction = value.translation.height < 0 ? .down : .up
                }
                navigation.step(direction)
            }
    }
}


