import SwiftUI
import MeeshySDK
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
    /// Largeur RÉELLE du pane, DITE par l'appelant — ce qui sépare les voix
    /// nommées de celles qui attendent hors du champ.
    var paneWidth: CGFloat = 0
    /// Bande haute occupée par l'en-tête FLOTTANT du fil, DITE par l'appelant.
    ///
    /// C'est un inset de CONTENU, pas une marge du pane (retour produit
    /// 2026-08-22 : « le header doit être transparent »). Posé en marge
    /// extérieure, il faisait peindre au pane une DALLE PLATE derrière
    /// l'en-tête : on ne voyait plus le fond vivant de la conversation, et
    /// rien ne passait jamais dessous. Porté ici, dans le `safeAreaInset` du
    /// `ScrollView`, il pousse le contenu AU REPOS sous l'en-tête tout en le
    /// laissant DÉFILER DERRIÈRE — ce que fait déjà le fil en Bulles/Script.
    var headerInset: CGFloat = 0
    /// R-7 — bande basse occupée par le COMPOSEUR, DITE par l'appelant.
    /// Même patron que `headerInset` : un inset de contenu (`safeAreaInset`),
    /// pas une marge du pane — la dernière bulle peut remonter AU-DESSUS du
    /// composeur, et aucune ne reste sous une zone qu'aucun doigt n'atteint.
    var bottomInset: CGFloat = 0
    /// L2b/2b-7 — le roster de frappe, DIT par l'appelant
    /// (`ConversationView` → `RiverConversationHost`, qui lit
    /// `ConversationViewModel.typingUsernames`).
    ///
    /// **Décoration de PEAU, jamais une entrée de la LOI.** Il n'entre ni
    /// dans `RiverLaneResolver` ni dans `lanesInput` : une voix qui n'a encore
    /// rien DIT ne doit pas faire naître un couloir — et ce couloir
    /// survivrait au `typing:stop` (`RiverTypingIndicatorTests`).
    var typingParticipants: [TypingParticipant] = []
    /// Demande de RE-CADRAGE venue de l'appelant (première géométrie
    /// peuplée, rangs préfixés) — chaque incrément recadre le curseur.
    var landingToken: Int = 0
    /// R-5 — la fiche d'une voix, la story d'une voix : l'hôte les ouvre.
    var onOpenProfile: ((ProfileSheetUser) -> Void)? = nil
    var onViewStory: ((String) -> Void)? = nil
    /// Lot 3 — retours au Fil depuis une bulle (appui long).
    var onOpenInThread: ((String) -> Void)? = nil
    var onReply: ((String) -> Void)? = nil

    @ObservedObject var navigation: RiverNavigationController
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.layoutDirection) private var layoutDirection

    @State private var frames: [String: CGRect] = [:]
    @State private var horizontalOffset: CGFloat = 0
    /// Le fil s'ouvre au PRÉSENT — une seule fois. Un lecteur qui est remonté
    /// dans l'histoire ne doit jamais être ramené en bas par l'arrivée d'un
    /// message (même règle que le fil : la position de la barre ne dit pas ce
    /// qui a été vu).
    @State private var hasLandedOnCursor = false
    /// **Un cadrage est une DEMANDE, pas un acte** — il tient jusqu'à ce que
    /// la cellule visée soit RÉELLEMENT apparue. Mesuré au simulateur
    /// (2026-08-22) : un `scrollTo` lancé au premier `onAppear` ne bougeait
    /// pas d'un point — le pane n'avait pas encore de hauteur
    /// (`GeometryReader` à 0), et la pile paresseuse ne connaissait pas
    /// encore la cellule. La demande est donc rejouée à chaque occasion
    /// (hauteur du pane connue, nouvelle demande) et CONCLUE par la cellule
    /// elle-même, dans son `onAppear` (`completeLanding`). R-6 réutilise le
    /// même canal pour la citation.
    @State private var landingTarget: RiverLaneResolver.RiverCursor?
    @State private var landingAnchor: UnitPoint = UnitPoint(x: 0.5, y: 1)
    @State private var landingIsAnimated = false
    @State private var scrollProxy: ScrollViewProxy?
    /// L'axe des VOIX se pose par un offset explicite (voir
    /// `RiverHorizontalOffsetWriter`) — `scrollTo` ne bouge que l'axe du temps.
    @State private var horizontalRequest: RiverHorizontalOffsetWriter.Request?
    /// R-3 — la poignée du temps ne se montre qu'au défilement, et s'efface
    /// au repos (`RiverTimeHandleMetrics.restDelay`).
    @State private var isTimeHandleVisible = false
    @State private var timeHandleRest: Task<Void, Never>?


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

    /// La frappe porte la couleur de SA VOIX — la MÊME loi que la bande des
    /// couloirs (`RiverLaneHeaderStrip` : `DynamicColorGenerator.colorForName`
    /// sur le `colorSeed`). `RiverConversationMapping.contents(...)` est le
    /// SEUL producteur de `RiverBubbleContent` et y pose `colorSeed:
    /// displayName(of: message)` — EXACTEMENT `senderDisplayName`
    /// (`RiverConversationMapping.swift:229`/`:235`) : la graine EST le nom
    /// affiché, par construction, sans qu'il y ait de correspondance à
    /// chercher parmi les voix déjà dites (F4, revue adversariale
    /// 2026-08-25). Aucune couleur en dur : une peau ne redéclare jamais une
    /// loi de couleur.
    private var typingAccentHex: String {
        DynamicColorGenerator.colorForName(typingParticipants.first?.displayName ?? "")
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
        // La ligne de lecture se compte dans la surface RÉELLEMENT LUE, sous
        // l'en-tête : la rapporter au pane entier la ferait tomber DANS la
        // bande de l'en-tête, et la bande de couloirs nommerait une voix qu'on
        // ne voit pas — le défaut même corrigé la veille.
        let readingLine = headerInset + (paneHeight - headerInset) * Self.readingLineRatio
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

    /// R-3 — l'échelle du temps, RÉSOLUE par la règle pure depuis ce que la
    /// loi sert (rang + instant) ; `nil` quand il n'y a rien à graduer.
    private var timeScale: RiverTimeScale? {
        RiverTimeScale.resolve(
            ranks: geometry.bubbles.map { RiverTimeScale.RankTime(rank: $0.rank, timeMs: $0.createdAtMs) },
            calendar: .current
        )
    }

    private var laneHeaders: [RiverLaneResolver.RiverLaneHeader] {
        RiverLaneResolver.resolveRiverLaneHeaders(
            RiverLaneResolver.ResolveRiverLaneHeadersInput(geometry: geometry, focusRank: focusRank)
        )
    }

    var body: some View {
        ScrollViewReader { proxy in
            scrollPane
                .onAppear {
                    scrollProxy = proxy
                    landOnCursor()
                }
                // Chaque occasion rejoue la demande en cours : le pane reçoit
                // sa hauteur, ou une nouvelle cible est posée.
                .adaptiveOnChange(of: paneHeight) { _, _ in attemptLanding() }
                .adaptiveOnChange(of: landingTarget) { _, _ in attemptLanding() }
                // La géométrie arrive souvent APRÈS le premier `onAppear`
                // (messages chargés ensuite), et l'histoire peut se PRÉFIXER :
                // l'appelant le dit par un jeton, le pane recadre le curseur.
                .adaptiveOnChange(of: landingToken) { _, _ in
                    hasLandedOnCursor = false
                    landOnCursor()
                }
        }
    }

    /// Atterrissage au PRÉSENT : le curseur d'ouverture est la bulle la plus
    /// récente (`RiverConversationMapping.initialCursor`) — sans ce cadrage,
    /// la Rivière s'ouvrait sur le message le PLUS ANCIEN de la fenêtre
    /// chargée, et il fallait dérouler toute l'histoire pour rejoindre la
    /// conversation. Demandé UNE fois : un lecteur remonté dans l'histoire
    /// ne doit jamais être ramené en bas par l'arrivée d'un message.
    private func landOnCursor() {
        guard !hasLandedOnCursor, geometry.rankCount > 0 else { return }
        hasLandedOnCursor = true
        let rank = min(max(0, navigation.cursor.rank), geometry.rankCount - 1)
        requestLanding(
            on: RiverLaneResolver.RiverCursor(laneIndex: navigation.cursor.laneIndex, rank: rank),
            // La base de la cellule sur le haut du composeur (R-7), la voix
            // du curseur au milieu de l'écran, ses voisines de part et d'autre.
            anchor: UnitPoint(x: 0.5, y: 1),
            animated: false
        )
    }

    /// R-6 — la citation mène à sa cible : le curseur se pose sur le message
    /// cité (choix explicite du lecteur, pas un pas de la loi) et le pane le
    /// cadre sous la ligne de lecture — la MÊME hauteur relative que
    /// `focusRank` lit (`readingLineRatio`), pour que la bande de couloirs
    /// nomme aussitôt la voix rejointe. Le couloir et le rang viennent du
    /// mapping, jamais recalculés ici.
    private func openReply(_ messageId: String) {
        guard let cursor = RiverConversationMapping.cursor(forMessageId: messageId, geometry: geometry) else { return }
        navigation.moveTo(cursor)
        requestLanding(on: cursor, anchor: UnitPoint(x: 0.5, y: Self.readingLineRatio), animated: !reduceMotion)
    }

    private func requestLanding(on target: RiverLaneResolver.RiverCursor, anchor: UnitPoint, animated: Bool) {
        landingAnchor = anchor
        landingIsAnimated = animated
        landingTarget = target
    }

    /// Le cadrage vise le RANG (identité directe de la pile paresseuse,
    /// toujours connue) avec l'ancre qui centre le couloir ; la cellule visée
    /// CONCLUT le cadrage dans son propre `onAppear` (`completeLanding`), une
    /// fois posée avec ses cotes réelles. Si elle est déjà à l'écran, aucun
    /// `onAppear` ne viendra : la demande s'éteint d'elle-même peu après.
    private func attemptLanding() {
        guard let target = landingTarget, scrollProxy != nil, paneHeight > 0 else { return }
        frame(target)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            if landingTarget == target { landingTarget = nil }
        }
    }

    /// Conclusion du cadrage par la cellule visée, au moment où elle existe
    /// (la pile paresseuse vient de la poser : ses cotes sont enfin réelles).
    private func completeLanding(rank: Int, laneIndex: Int) {
        guard let target = landingTarget,
              target.rank == rank, target.laneIndex == laneIndex else { return }
        DispatchQueue.main.async {
            frame(target)
            landingTarget = nil
        }
    }

    /// **Deux axes, deux gestes.** L'axe du TEMPS se cadre par `scrollTo` sur
    /// le rang (identité directe de la pile paresseuse, connue même non
    /// matérialisée) ; l'axe des VOIX par un offset explicite
    /// (`RiverColumnLayout.horizontalOffset`, rail du couloir au centre du
    /// pane), écrit au `UIScrollView` par `RiverHorizontalOffsetWriter` —
    /// `scrollTo` ne bouge pas X sur un pane à deux axes (mesuré). Animée, la
    /// glissade horizontale suit la verticale plutôt que de la couper.
    private func frame(_ target: RiverLaneResolver.RiverCursor) {
        guard let proxy = scrollProxy else { return }
        let animated = landingIsAnimated
        scroll(animated: animated) { proxy.scrollTo(target.rank, anchor: UnitPoint(x: 0, y: landingAnchor.y)) }
        let x = columns.horizontalOffset(centeringLane: target.laneIndex, paneWidth: paneWidth)
        DispatchQueue.main.asyncAfter(deadline: .now() + (animated ? 0.4 : 0)) {
            horizontalRequest = RiverHorizontalOffsetWriter.Request(
                token: (horizontalRequest?.token ?? 0) + 1, x: x, animated: animated
            )
        }
    }

    private func scroll(animated: Bool, _ body: () -> Void) {
        if animated {
            withAnimation(.easeInOut(duration: RiverMetrics.Motion.landingDuration)) { body() }
        } else {
            body()
        }
    }

    private var scrollPane: some View {
        ScrollView([.horizontal, .vertical]) {
            grid
                // Écrivain d'offset horizontal — DANS le contenu, pour
                // retrouver son `UIScrollView` par ses parents.
                .background(RiverHorizontalOffsetWriter(request: horizontalRequest))
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
        // Le tracé vit dans le repère FIXE du pane — le même que les cadres
        // publiés par les bulles (`RiverCoordinateSpace.name`, posé sur le
        // `ScrollView`). En fond de la GRILLE, il vivait dans le repère du
        // contenu et ne coïncidait avec les cadres qu'à l'offset zéro
        // (mesuré au simulateur le 2026-08-22 : plus aucun rail ni connecteur
        // une fois cadré au présent). Sous la bande des couloirs, rien.
        .background(
            RiverLaneCanvas(
                geometry: geometry,
                frames: frames,
                columns: columns,
                horizontalOffset: horizontalOffset,
                topExclusion: headerInset + RiverMetrics.LaneHeader.height
            )
        )
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
        // R-7 : la place du composeur, vide et transparente — le contenu au
        // repos s'arrête au-dessus, et défile derrière au besoin.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Color.clear.frame(height: bottomInset)
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            VStack(spacing: 0) {
                // La place de l'en-tête du fil — vide et TRANSPARENTE : les
                // bulles la traversent au défilement, l'en-tête de verre les
                // laisse voir.
                Color.clear.frame(height: headerInset)
                // **La bande est un OVERLAY, jamais un enfant de l'inset.**
                // Son cadre est FIXE à la largeur de tous les couloirs
                // (jusqu'à 7 × 300 pt) et `frame(maxWidth: .infinity)` ne
                // réduit jamais un enfant sous son minimum : posée en enfant,
                // elle gonflait l'inset, donc le `ScrollView` entier, à cette
                // largeur — mesuré au simulateur le 2026-08-22 (chaîne UIKit :
                // `PlatformContainer[1800×874 @−699]` dans `HostingView[402]`) :
                // un pane centré par son parent, que rien ne faisait défiler
                // horizontalement, et dont `contentOffset.x` ne pouvait pas
                // bouger (débordement nul). Un overlay reçoit la taille de son
                // hôte et ne la fait JAMAIS grandir.
                Color.clear
                    .frame(height: RiverMetrics.LaneHeader.height)
                    .overlay(alignment: .leading) {
                        RiverLaneHeaderStrip(
                            headers: laneHeaders,
                            columns: columns,
                            horizontalOffset: horizontalOffset,
                            visibleWidth: paneWidth
                        )
                    }
                    .clipped()
            }
        }
        .simultaneousGesture(swipeGesture)
        // R-3 — la poignée du temps, au bord droit, entre la bande des
        // couloirs et le composeur. Posée en overlay du pane : elle ne fait
        // jamais grandir son hôte et ne dispute pas le pan du contenu
        // (geste prioritaire sur sa seule bande).
        .overlay(alignment: .trailing) {
            if let scale = timeScale {
                RiverTimeHandle(
                    scale: scale,
                    fraction: scale.fraction(ofRank: Int(focusRank.rounded())),
                    isVisible: isTimeHandleVisible,
                    isDark: colorScheme == .dark,
                    onSeek: seek
                )
                .frame(width: RiverTimeHandleMetrics.handleWidth * 4)
                .padding(.top, headerInset + RiverMetrics.LaneHeader.height)
                .padding(.bottom, bottomInset)
            }
        }
        // L2b/2b-7 — la frappe atteint le lecteur QUEL QUE SOIT son mode.
        //
        // En Script/Focal/Bulles elle est une CELLULE du flux ; ici, le pane
        // est OPAQUE (`RiverConversationHost.background`) et la couvrait
        // entièrement : le seul signe qu'une voix parle disparaissait avec le
        // changement de mode, et le repli de la pastille de connexion exclut
        // délibérément la conversation OUVERTE.
        //
        // **Overlay, jamais enfant du `safeAreaInset`** — la même raison que
        // la bande des couloirs plus haut : un enfant d'inset impose sa
        // largeur au `ScrollView` entier, un overlay reçoit la taille de son
        // hôte et ne la fait JAMAIS grandir. `bottomInset` le remonte
        // au-dessus du composeur, comme la dernière bulle (R-7).
        //
        // La MÊME vue que le Fil (`TypingIndicatorBubble`, tenue plate),
        // jamais une seconde : deux vues divergeraient sur les timings, le
        // libellé et l'accessibilité — seul l'accent diverge ASSUMÉMENT
        // (couleur de VOIX ici, de conversation au Fil : voir `typingAccentHex`).
        //
        // F3 (revue adversariale 2026-08-25) : la tenue plate n'a NI capsule
        // ni fond — c'est le rendu voulu en cellule de flux (Fil), où elle
        // pousse le contenu. Ici elle est un CALQUE posé en `.overlay`, pile
        // sur la bande où le curseur ancré en bas (`landingAnchor`) fait
        // reposer la bulle la plus récente : sans surface propre, la pastille
        // d'avatar et les trois points se peignaient à nu par-dessus le texte
        // de cette bulle. `.background(.ultraThinMaterial, in: Capsule())`
        // donne au bandeau la même lisibilité que la tenue capsule, sans
        // changer sa tenue mandatée (`isFlat: true`).
        .overlay(alignment: .bottom) {
            if !typingParticipants.isEmpty {
                TypingIndicatorBubble(
                    participants: typingParticipants,
                    accentHex: typingAccentHex,
                    isDark: colorScheme == .dark,
                    isFlat: true
                )
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(.ultraThinMaterial, in: Capsule())
                .padding(.bottom, bottomInset)
                // Décoration : elle ne prend jamais un doigt destiné à la
                // bulle qui passe dessous.
                .allowsHitTesting(false)
            }
        }
        // Les cadres publiés bougent à chaque défilement : c'est le signal
        // qui montre la poignée, sans second lecteur d'offset.
        .adaptiveOnChange(of: frames) { _, _ in noteScrollActivity() }
        // Lot 3 — le bord atteint se SENT : la loi a dit `.edge`, le
        // contrôleur a incrémenté son jeton, la peau frappe une fois.
        .adaptiveOnChange(of: navigation.edgeBounceToken) { _, _ in HapticFeedback.light() }
        .accessibilityElement(children: .contain)
    }

    // MARK: - R-3 — poignée du temps

    private func noteScrollActivity() {
        isTimeHandleVisible = true
        timeHandleRest?.cancel()
        timeHandleRest = Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(RiverTimeHandleMetrics.restDelay * 1_000_000_000))
            guard !Task.isCancelled else { return }
            isTimeHandleVisible = false
        }
    }

    /// La poignée lâchée à `fraction` : la règle dit le rang, la loi dit son
    /// couloir, le pane le cadre sous la ligne de lecture — un choix
    /// explicite du lecteur, comme un tap.
    private func seek(_ fraction: Double) {
        guard let scale = timeScale else { return }
        let rank = scale.rank(atFraction: fraction)
        guard let bubble = bubbleByRank[rank] else { return }
        let cursor = RiverLaneResolver.RiverCursor(laneIndex: bubble.laneIndex, rank: bubble.rank)
        navigation.moveTo(cursor)
        requestLanding(on: cursor, anchor: UnitPoint(x: 0.5, y: Self.readingLineRatio), animated: !reduceMotion)
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
                    // Identité de RANG, explicite : `ForEach(…, id: \.self)`
                    // la donne déjà à la pile, et c'est elle que le premier
                    // pas du cadrage vise (`frame(_:anchor:proxy:)`).
                    .id(rank)
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
            RiverBubbleView(
                content: content,
                contentWidth: columns.bubbleContentWidth,
                onOpenReply: openReply,
                onOpenProfile: onOpenProfile,
                onViewStory: onViewStory,
                onOpenInThread: onOpenInThread,
                onReply: onReply
            )
                .padding(.horizontal, RiverMetrics.Lane.gutter)
                .onTapGesture {
                    navigation.moveTo(RiverLaneResolver.RiverCursor(laneIndex: laneIndex, rank: rank))
                }
                .onAppear { completeLanding(rank: rank, laneIndex: laneIndex) }
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
                    // Le signe brut disait « vers la GAUCHE de l'écran », donc
                    // « vers l'avant » — vrai en français, faux en arabe. La
                    // comparaison ne bouge pas ; seul l'opérande passe dans le
                    // sens de la LECTURE, identité en LTR (#4297).
                    let dx = ReadingDirection.readingDelta(
                        value.translation.width,
                        layoutDirection: layoutDirection
                    )
                    direction = dx < 0 ? .right : .left
                } else {
                    direction = value.translation.height < 0 ? .down : .up
                }
                navigation.step(direction)
            }
    }
}

// MARK: - Offset horizontal — le seul geste que `scrollTo` ne sait pas faire ici

/// Pose `contentOffset.x` sur le `UIScrollView` qui porte le pane. Une vue
/// UIKit VIDE, posée dans le contenu défilant, remonte ses parents jusqu'au
/// scroll view et y écrit l'offset demandé, borné au débordement réel.
/// Chaque `Request` s'applique UNE fois (`token`) ; ni mesure, ni
/// `PreferenceKey` (`RiverSourceGuardTests`) — un écrivain, pas un lecteur.
private struct RiverHorizontalOffsetWriter: UIViewRepresentable {
    struct Request: Equatable {
        let token: Int
        let x: CGFloat
        let animated: Bool
    }

    let request: Request?

    final class Coordinator {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
        var appliedToken = 0
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.isHidden = true
        view.isUserInteractionEnabled = false
        view.isAccessibilityElement = false
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        guard let request, context.coordinator.appliedToken != request.token else { return }
        context.coordinator.appliedToken = request.token
        DispatchQueue.main.async {
            guard let scrollView = Self.enclosingScrollView(of: view) else { return }
            let overflow = scrollView.contentSize.width - scrollView.bounds.width
                + scrollView.adjustedContentInset.left + scrollView.adjustedContentInset.right
            let x = min(max(0, request.x), max(0, overflow))
            scrollView.setContentOffset(CGPoint(x: x, y: scrollView.contentOffset.y), animated: request.animated)
        }
    }

    private static func enclosingScrollView(of view: UIView) -> UIScrollView? {
        var candidate = view.superview
        while let current = candidate {
            if let scrollView = current as? UIScrollView { return scrollView }
            candidate = current.superview
        }
        return nil
    }
}
