import UIKit
import MeeshyUI

/// Les SIX sites d'appel du pass (contrat Focal §4.8) — **en données, pas en
/// prose**.
///
/// « Aucun n'est optionnel » : une liste écrite en commentaire ne rougit
/// jamais. Écrite ici, elle donne à WS-6 (F-085) le moyen d'écrire sa garde de
/// montage en ÉGALITÉ D'ENSEMBLES (leçon 257 : « chercher les types déclarés
/// dont le nom n'apparaît à aucun site d'appel … écrire la garde en égalité
/// d'ensembles plutôt qu'en présence individuelle »). Un site ajouté ici
/// rougit la garde de l'hôte tant qu'il n'est pas monté.
nonisolated enum FocalPassCallSite: String, CaseIterable, Sendable {
    /// Le cas nominal — juste après `setScrollingActive`.
    case scrollViewDidScroll
    /// `scrollViewDidScroll` ne se déclenche pas quand une cellule se réalise
    /// sans changement d'offset : la cellule entrante se traite seule.
    case willDisplayCell
    /// Changements de layout programmatiques.
    case snapshotApplyCompletion
    /// Les scrolls programmatiques ne déclenchent pas fiablement `didScroll`
    /// (documenté dans `MessageListViewController.scrollToBottom`).
    case programmaticScrollCompletion
    /// La ligne de focus dépend de `contentInset.top` : la déplacer sans
    /// rejouer le pass laisse les cellules à l'échelle de l'inset précédent.
    case contentInsetChange
    /// Passer en Script doit remettre TOUT à l'identité.
    case readingModeChange

    /// Symbole de `MessageListViewController.swift` qui DOIT contenir l'appel.
    /// Ancres RE-PROUVÉES sur cette lignée (F-084, `grep`) : les numéros de
    /// ligne du contrat ont bougé, les symboles non.
    var hostAnchor: String {
        switch self {
        case .scrollViewDidScroll: return "scrollViewDidScroll"
        case .willDisplayCell: return "willDisplay"
        case .snapshotApplyCompletion: return "dataSource.apply"
        case .programmaticScrollCompletion: return "scrollToMessage"
        case .contentInsetChange: return "applyTopInsetToViews"
        case .readingModeChange: return "readingMode"
        }
    }
}

/// **Le pass de perspective du fil** : transform + alpha, `O(cellules
/// visibles)`, sans allocation, sans invalidation de layout, plus la
/// décoration de carte de focus.
///
/// ## Contrainte dure (§WS-5)
///
/// Ce type **ne connaît pas** `MessageListViewController`, `MessageStore` ni
/// `MessageListItem`. Il reçoit une `UICollectionView` et une closure de
/// description. C'est ce qui rend WS-5 et WS-6 disjoints — et c'est vérifié
/// par `FocalScrollPassSourceGuardTests`.
///
/// ## Ce qu'il ne fait pas
///
/// Aucune arithmétique : elle vit dans `FocalPerspectiveGeometry` (pure) et,
/// pour la courbe et l'élection, dans le miroir GELÉ `FocalFocusCurve`. Aucun
/// `frame(height:)`, aucun `invalidateLayout`, aucun `reconfigureItems` : le
/// pass est **pur compositor**. La typographie 15 → 16 de la rangée nette
/// (§4.6) n'est PAS de son ressort : la faire varier par frame déclencherait un
/// relayout SwiftUI à 120 Hz — elle est reportée à l'arrêt du défilement, par
/// un `reconfigureItems([ancien, nouveau])` qui appartient à WS-6.
///
/// ## Les six sites d'appel — ce que WS-6 doit monter
///
/// | # | Site (`FocalPassCallSite`) | Appel |
/// |---|---|---|
/// | 1 | `scrollViewDidScroll` | `apply(to:describe:)` |
/// | 2 | `willDisplayCell` | `apply(to:in:descriptor:)` — la cellule entrante SEULE |
/// | 3 | `snapshotApplyCompletion` | `apply(to:describe:)` |
/// | 4 | `programmaticScrollCompletion` | `apply(to:describe:)`, après `landingContentOffsetY` pour les deux `scrollToMessage…` |
/// | 5 | `contentInsetChange` | `apply(to:describe:)` en fin de `applyTopInsetToViews` ET de `applyBottomInset` |
/// | 6 | `readingModeChange` | `readingModeDidChange(...)` (= `resetAll` puis `apply`) |
///
/// Plus, hors sites : `reset(_:)` en **première ligne** de chacune des
/// registrations de cellule (aucune sous-classe, aucun `prepareForReuse` —
/// une cellule recyclée hériterait sinon du transform de son occupant
/// précédent). `slowScrollTick` écrit `contentOffset.y` directement : il
/// déclenche le site 1 gratuitement, aucun appel supplémentaire.
///
/// @see tasks/focal-implementation-contract.md §WS-5, §4.2 → §4.9
@MainActor
final class FocalScrollPass {

    /// Ce que WS-6 sait d'une cellule, et que le pass ne peut pas deviner.
    ///
    /// `localId == nil` ⇒ la cellule ne participe pas : `.dayHeader`,
    /// `.typingIndicator`, `.conversationStart` sont indiscernables sans le
    /// data source, et `visibleCells` les balaie comme les autres. Elles sont
    /// remises à l'identité, jamais mises à l'échelle (§4.8).
    nonisolated struct CellDescriptor: Equatable {
        let localId: String?
        /// `1` pour une rangée confirmée, `0,7` pour un envoi optimiste (§4.4).
        /// Vit dans le descripteur, pas dans la rangée : `cell.alpha`
        /// appartient au pass.
        let alphaCeiling: CGFloat
        let allowsFocusCard: Bool

        init(
            localId: String?,
            alphaCeiling: CGFloat = FocalPassConstants.opaqueAlphaCeiling,
            allowsFocusCard: Bool = true
        ) {
            self.localId = localId
            self.alphaCeiling = alphaCeiling
            self.allowsFocusCard = allowsFocusCard
        }

        /// Jour, typing, début de conversation.
        static let ineligible = CellDescriptor(localId: nil, allowsFocusCard: false)
    }

    /// Ce que le pass rend à l'écran.
    ///
    /// **Pourquoi trois états et non le seul `isEnabled` du contrat §WS-5.**
    /// Le booléen du contrat porte deux significations incompatibles : §4.9
    /// dit « `isEnabled` est piloté par `MeeshyMotion.shouldReduce` » et exige
    /// alors que l'élection ET la carte survivent ; §4.8 site 6 dit « passer
    /// en Script doit remettre tout à l'identité », c'est-à-dire SANS carte ni
    /// focus. Un booléen ne peut pas dire les deux. `isEnabled` reste exposé
    /// (WS-6 le lit tel que le contrat l'écrit) et se projette sur cette
    /// énumération.
    nonisolated enum Rendering: String, Equatable, Sendable, CaseIterable {
        /// Focal, mouvement autorisé : échelle + opacité de la courbe.
        case perspective
        /// Focal + Reduce Motion : tout à 1 (alpha au plafond), élection et
        /// carte CONSERVÉES (§4.9).
        case flat
        /// Script / bulles / Résumé : le pass ne participe pas.
        case off
    }

    let geometry: FocalPerspectiveGeometry
    let decoration: FocalFocusDecoration

    var rendering: Rendering = .off

    /// Forme du contrat §WS-5. `true` ⇒ perspective ; `false` ⇒ rendu plat
    /// (Reduce Motion), qui conserve l'élection. Pour éteindre complètement le
    /// pass (Script), poser `rendering = .off` — ou passer par
    /// `readingModeDidChange(...)`, qui décide des trois cas.
    var isEnabled: Bool {
        get { rendering == .perspective }
        set { rendering = newValue ? .perspective : .flat }
    }

    /// Bord ancré horizontalement sous l'échelle : la colonne pastille/nom de
    /// `FocalRow` (§4.3).
    var horizontalAnchor: FocalHorizontalAnchor = .leading

    /// Accent de CETTE conversation, pour l'anneau de la carte de focus
    /// (§4.6). Posé par WS-6 en même temps que `isDark`. `nil` ⇒ repli sur le
    /// token de marque (jamais un hexadécimal en dur).
    var accentHex: String?

    /// Thème résolu, pour le fond de la carte (`backgroundSecondary`).
    var isDark: Bool = false

    private(set) var focusedLocalId: String?

    // Tampons RÉUTILISÉS d'une passe à l'autre (`removeAll(keepingCapacity:)`)
    // — le critère §7 « le pass de scroll n'alloue pas » ne tolère pas un
    // tableau neuf par frame.
    private var candidates: [FocalFocusCurve.RowCandidate] = []
    private var pending: [PendingCell] = []

    private struct PendingCell {
        let cell: UICollectionViewCell
        let localId: String?
        let allowsFocusCard: Bool
    }

    init(
        geometry: FocalPerspectiveGeometry = .standard,
        decoration: FocalFocusDecoration = FocalFocusDecoration()
    ) {
        self.geometry = geometry
        self.decoration = decoration
    }

    // MARK: - §4.9 — Les DEUX sources de Reduce Motion

    /// Décide le rendu à partir du mode de lecture et des **deux** sources de
    /// Reduce Motion : la clé système ET la bascule in-app
    /// (`\.meeshyForceReduceMotion`). 25+ vues du dépôt lisent la clé système
    /// seule et ignorent la bascule ; ce chantier ne reproduit pas ce défaut
    /// (§4.9) — d'où `MeeshyMotion.shouldReduce(system:userForced:)`, la loi
    /// partagée, plutôt qu'un `||` recopié.
    nonisolated static func resolveRendering(
        usesPerspective: Bool,
        systemReduceMotion: Bool,
        userForcedReduceMotion: Bool
    ) -> Rendering {
        guard usesPerspective else { return .off }
        return MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userForcedReduceMotion)
            ? .flat
            : .perspective
    }

    // MARK: - Site 1 / 3 / 4 / 5 — toutes les cellules visibles

    /// Rejoue le pass sur toutes les cellules visibles et renvoie le focus élu.
    ///
    /// Idempotent (§4.2) : les entrées lues — `cell.center`, `cell.bounds`,
    /// `contentOffset`, `contentInset` — sont indépendantes du transform déjà
    /// écrit. Le rejouer deux fois de suite donne le même résultat, ce
    /// qu'exigent ses six sites d'appel.
    ///
    /// **Pourquoi `center`/`bounds` et pas `frame`, deux fois plutôt qu'une.**
    /// (a) Le getter de `frame` intègre le transform déjà posé : le lire ferait
    /// dériver le calcul à chaque nouvel appel. (b) `UICollectionReusableView`
    /// pose ses `layoutAttributes` en écrivant `center` et `bounds`
    /// SÉPARÉMENT — jamais `frame` — donc la cellule ne se déforme pas sous un
    /// `layer.transform` non identitaire.
    ///
    /// **Corollaire, et vraie raison pour laquelle aucun des six sites n'est
    /// optionnel** : la même application d'attributs réécrit aussi
    /// `layer.transform` depuis `layoutAttributes.transform3D` (identité).
    /// Toute réalisation ou re-mesure de cellule EFFACE donc la perspective —
    /// d'où les sites 2 (`willDisplay`), 3 (complétion d'`apply`) et 5
    /// (changement d'inset), qui la reposent. Rien de tout cela ne perturbe la
    /// self-sizing : un transform de `CALayer` est un effet de RENDU, invisible
    /// à `systemLayoutSizeFitting`. C'est tout le sens de « pur compositor ».
    @discardableResult
    func apply(
        to collectionView: UICollectionView,
        describe: @MainActor (IndexPath) -> CellDescriptor
    ) -> String? {
        guard rendering != .off else {
            resetAll(in: collectionView)
            return nil
        }

        let viewport = collectionView.bounds.height
        guard viewport > 0 else { return focusedLocalId }

        let focusY = geometry.focusY(
            viewportHeight: viewport,
            bottomClearance: collectionView.contentInset.top
        )
        let offsetY = collectionView.contentOffset.y
        let isRightToLeft = collectionView.effectiveUserInterfaceLayoutDirection == .rightToLeft
        let usesPerspective = rendering == .perspective

        candidates.removeAll(keepingCapacity: true)
        pending.removeAll(keepingCapacity: true)

        for cell in collectionView.visibleCells {
            guard let indexPath = collectionView.indexPath(for: cell) else { continue }
            let descriptor = describe(indexPath)
            pending.append(
                PendingCell(
                    cell: cell,
                    localId: descriptor.localId,
                    allowsFocusCard: descriptor.allowsFocusCard
                )
            )

            guard let localId = descriptor.localId else {
                // §4.8 : jour / typing / début de conversation — identité, jamais d'échelle.
                write(.identity, to: cell)
                continue
            }

            let visual = geometry.visualMidY(
                contentMidY: cell.center.y,
                contentOffsetY: offsetY,
                viewportHeight: viewport
            )
            candidates.append(FocalFocusCurve.RowCandidate(id: localId, midY: visual))

            write(
                transform(
                    visualMidY: visual,
                    focusY: focusY,
                    cellSize: cell.bounds.size,
                    isRightToLeft: isRightToLeft,
                    alphaCeiling: descriptor.alphaCeiling,
                    usesPerspective: usesPerspective
                ),
                to: cell
            )
        }

        focusedLocalId = geometry.electFocus(
            candidates: candidates,
            focusY: focusY,
            current: focusedLocalId
        )

        for entry in pending {
            decoration.update(
                cell: entry.cell,
                isFocused: entry.allowsFocusCard
                    && entry.localId != nil
                    && entry.localId == focusedLocalId
                    && isFullyVisible(entry.cell, in: collectionView),
                accentHex: accentHex,
                isDark: isDark
            )
        }
        // Les références de cellules ne survivent pas à la passe.
        pending.removeAll(keepingCapacity: true)

        return focusedLocalId
    }

    /// La cellule tient-elle ENTIÈREMENT dans la zone lisible ?
    ///
    /// « N'encadrer le message que lorsqu'il est entièrement visible » : une
    /// carte dont le bord bas passe sous le composeur (ou dont le bord haut
    /// sort par le haut) dessine un cadre ouvert, et pire, coupe la barre de
    /// contrôles qui vit sur ce bord — les emojis deviennent inatteignables
    /// alors qu'ils sont la raison d'être de la carte.
    ///
    /// La zone lisible n'est PAS `bounds` : la liste est inversée, donc
    /// `contentInset.top` borne le côté COMPOSEUR (bas visuel) et
    /// `contentInset.bottom` le côté header. `frame` intègre le transform de
    /// perspective déjà posé — c'est voulu ici : on teste ce que l'œil voit,
    /// pas la boîte de layout.
    ///
    /// Le message reste ÉLU dans tous les cas (le focus pilote la
    /// magnification du contenu, qui elle n'a rien à voir avec le cadre) :
    /// seule la DÉCORATION est suspendue. Un message partiellement visible
    /// n'en devient pas moins manipulable.
    func isFullyVisible(_ cell: UICollectionViewCell, in collectionView: UICollectionView) -> Bool {
        let viewport = collectionView.bounds.height
        guard viewport > 0 else { return false }
        let offsetY = collectionView.contentOffset.y

        // La MÊME conversion que tout le reste du pass — `visualY = H −
        // (contentY − contentOffset.y)`, §4.2 — appliquée aux deux bords de
        // la cellule. L'inversion échange les extrémités : le `maxY` de
        // contenu devient le HAUT visuel.
        //
        // Deux repères faux ont précédé celui-ci, tous deux constatés au
        // simulateur (la carte ne s'affichait jamais) :
        // 1. comparer `cell.frame` décalé de `−contentOffset.y` à une fenêtre
        //    dérivée de `bounds` — dont l'origine EST déjà `contentOffset` ;
        // 2. rétrécir `bounds` par `contentInset` — or `contentInset.bottom`
        //    porte ici le `headInset` de §4.5, une réserve de DÉFILEMENT de
        //    plusieurs centaines de points, pas une occlusion de chrome :
        //    la fenêtre devenait plus petite que n'importe quelle cellule.
        let visualTop = viewport - (cell.frame.maxY - offsetY)
        let visualBottom = viewport - (cell.frame.minY - offsetY)

        // Seul le composeur occulte réellement, et sa garde est déjà nommée :
        // `contentInset.top` est ce que la géométrie appelle son
        // `bottomClearance` (cf. `focusY(viewportHeight:bottomClearance:)`).
        // Le haut de l'écran n'occulte rien en Focal — le header s'efface
        // pendant le défilement.
        let readableBottom = viewport - collectionView.contentInset.top
        return visualTop >= 0 && visualBottom <= readableBottom
    }

    // MARK: - Site 2 — la cellule entrante seule

    /// Traite UNE cellule (`willDisplay`), sans ré-élire : un candidat unique
    /// gagnerait toujours, et la carte sauterait sur chaque cellule entrante.
    /// L'élection reste celle du dernier balayage complet.
    func apply(
        to cell: UICollectionViewCell,
        in collectionView: UICollectionView,
        descriptor: CellDescriptor
    ) {
        guard rendering != .off else {
            reset(cell)
            return
        }

        let viewport = collectionView.bounds.height
        guard viewport > 0 else { return }

        guard let localId = descriptor.localId else {
            write(.identity, to: cell)
            decoration.update(cell: cell, isFocused: false, accentHex: accentHex, isDark: isDark)
            return
        }

        let focusY = geometry.focusY(
            viewportHeight: viewport,
            bottomClearance: collectionView.contentInset.top
        )
        let visual = geometry.visualMidY(
            contentMidY: cell.center.y,
            contentOffsetY: collectionView.contentOffset.y,
            viewportHeight: viewport
        )

        write(
            transform(
                visualMidY: visual,
                focusY: focusY,
                cellSize: cell.bounds.size,
                isRightToLeft: collectionView.effectiveUserInterfaceLayoutDirection == .rightToLeft,
                alphaCeiling: descriptor.alphaCeiling,
                usesPerspective: rendering == .perspective
            ),
            to: cell
        )

        decoration.update(
            cell: cell,
            isFocused: descriptor.allowsFocusCard
                && localId == focusedLocalId
                && isFullyVisible(cell, in: collectionView),
            accentHex: accentHex,
            isDark: isDark
        )
    }

    // MARK: - Reset

    /// **Première ligne de chaque registration de cellule** (§WS-6, travail 1).
    /// Sans elle, une cellule recyclée hérite du transform et de la carte de
    /// son occupant précédent : aucune sous-classe de cellule n'existe dans
    /// `MessageListViewController`, donc aucun `prepareForReuse` ne peut le
    /// faire à notre place.
    func reset(_ cell: UICollectionViewCell) {
        cell.layer.transform = CATransform3DIdentity
        cell.alpha = 1
        decoration.clear(cell)
    }

    func resetAll(in collectionView: UICollectionView) {
        for cell in collectionView.visibleCells {
            reset(cell)
        }
        focusedLocalId = nil
    }

    // MARK: - Site 6 — changement de mode de lecture

    /// `resetAll` puis `apply` (§4.8 site 6). Passer en Script remet tout à
    /// l'identité et abandonne le focus ; passer en Focal réélit immédiatement,
    /// sans attendre le premier défilement.
    @discardableResult
    func readingModeDidChange(
        usesPerspective: Bool,
        systemReduceMotion: Bool,
        userForcedReduceMotion: Bool,
        in collectionView: UICollectionView,
        describe: @MainActor (IndexPath) -> CellDescriptor
    ) -> String? {
        rendering = Self.resolveRendering(
            usesPerspective: usesPerspective,
            systemReduceMotion: systemReduceMotion,
            userForcedReduceMotion: userForcedReduceMotion
        )
        resetAll(in: collectionView)
        return apply(to: collectionView, describe: describe)
    }

    // MARK: - §4.7 — Atterrissage

    /// `contentOffset.y` à poser pour que `cellCenterY` atterrisse dans la
    /// bande. WS-6 l'utilise dans `scrollToMessage(localId:)` **et**
    /// `scrollToMessageFast(localId:)` — les deux, à la place de
    /// `.centeredVertically` — puis appelle `apply(to:describe:)`
    /// explicitement : un `setContentOffset` programmatique ne déclenche pas
    /// `scrollViewDidScroll` de façon fiable.
    func landingContentOffsetY(forCellCenterY cellCenterY: CGFloat, in collectionView: UICollectionView) -> CGFloat {
        geometry.landingContentOffsetY(
            cellCenterY: cellCenterY,
            viewportHeight: collectionView.bounds.height,
            bottomClearance: collectionView.contentInset.top,
            headClearance: collectionView.contentInset.bottom,
            contentHeight: collectionView.contentSize.height
        )
    }

    /// Flash de recherche — remplace `flashCell`, qui écrivait `cell.transform`
    /// et `cell.alpha` et EFFAÇAIT donc la perspective sur la cellule
    /// d'atterrissage (§4.7, risque R1).
    func flash(cell: UICollectionViewCell, strong: Bool) {
        decoration.flash(cell: cell, accentHex: accentHex, strong: strong)
    }

    // MARK: - §4.5 — Inset de tête (calcul ; l'ÉCRITURE appartient à WS-6)

    /// Valeur de `headInset` à composer avec `topInset` dans
    /// `applyTopInsetToViews()`. Le pass la CALCULE, il ne l'écrit jamais :
    /// `contentInset.bottom` a un écrivain unique, et deux écrivains sur cette
    /// propriété se battraient à chaque tick SwiftUI contre la garde
    /// `if != topInset` (§4.5).
    ///
    /// `firstRowHeight` : hauteur de la rangée la plus ancienne (WS-6 la lit
    /// sur les `layoutAttributes` du dernier item, ou retombe sur son
    /// estimation de layout).
    func headInset(
        in collectionView: UICollectionView,
        topInset: CGFloat,
        firstRowHeight: CGFloat
    ) -> CGFloat {
        geometry.headInset(
            viewportHeight: collectionView.bounds.height,
            bottomClearance: collectionView.contentInset.top,
            headClearance: topInset,
            firstRowHeight: firstRowHeight
        )
    }

    // MARK: - Interne

    private func transform(
        visualMidY: CGFloat,
        focusY: CGFloat,
        cellSize: CGSize,
        isRightToLeft: Bool,
        alphaCeiling: CGFloat,
        usesPerspective: Bool
    ) -> FocalCellTransform {
        guard usesPerspective else {
            return geometry.flatTransform(alphaCeiling: alphaCeiling)
        }
        return geometry.transform(
            distance: geometry.distance(visualMidY: visualMidY, focusY: focusY),
            cellSize: cellSize,
            horizontalAnchor: horizontalAnchor,
            isRightToLeft: isRightToLeft,
            alphaCeiling: alphaCeiling
        )
    }

    /// L'écriture, telle que le §4.3 la fixe. `m41`/`m42` sont les translations
    /// appliquées APRÈS la partie linéaire (convention vecteur-ligne de
    /// CoreAnimation) : pour une matrice d'échelle pure, `m42 = ty` donne
    /// `y' = s·y + ty`. Une échelle pure est symétrique en signe — elle
    /// traverse l'inversion parentale inchangée ; la translation, elle, est
    /// exprimée dans l'espace de CONTENU.
    ///
    /// `anchorPoint` n'est JAMAIS touché (§4.3, écart #2).
    private func write(_ transform: FocalCellTransform, to cell: UICollectionViewCell) {
        var matrix = CATransform3DMakeScale(transform.scale, transform.scale, 1)
        matrix.m41 = transform.translation.width
        matrix.m42 = transform.translation.height
        cell.layer.transform = matrix
        cell.alpha = transform.alpha
    }
}
