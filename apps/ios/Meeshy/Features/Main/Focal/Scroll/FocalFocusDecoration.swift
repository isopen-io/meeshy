import UIKit
import SwiftUI
import MeeshyUI

/// La carte de focus et le flash d'atterrissage — **en `CALayer`, jamais en
/// SwiftUI** (contrat Focal §4.6, §4.7).
///
/// Pourquoi des layers : la carte est re-cadrée à CHAQUE passe (la self-sizing
/// `.estimated(…)` fait varier les hauteurs) et le pass tourne à 120 Hz.
/// Rendre la carte en SwiftUI la ferait passer par une invalidation de
/// configuration d'hébergement — c'est-à-dire un relayout par frame, ce que le
/// critère « le pass n'alloue pas et ne déclenche aucun relayout » interdit
/// frontalement.
///
/// **Deux disciplines non négociables, sinon le critère de perf tombe :**
/// 1. *Aucune allocation par frame.* Les `CGColor` sont mémoïsés (une
///    conversion `Color(hex:) → UIColor → CGColor` par changement d'accent ou
///    de thème, pas par cellule et par frame), et chaque cellule réutilise SON
///    layer via une `NSMapTable` à clés faibles.
/// 2. *Aucune animation implicite.* Un `CALayer` ajouté à la main n'est pas
///    adossé à une `UIView` : ses écritures de `frame`/`opacity` déclenchent
///    les actions implicites de CoreAnimation (~0,25 s). Sur un pass appelé à
///    chaque frame, la carte traînerait derrière le doigt. Toutes les
///    écritures passent donc par `CATransaction.setDisableActions(true)`.
///
/// **Ce fichier n'écrit NI `cell.transform` NI `cell.alpha`** — ces deux
/// propriétés appartiennent à `FocalScrollPass`, et deux écrivains sur la même
/// propriété est le bug n°1 de ce chantier (§4.4). C'est aussi la raison
/// d'être du `flashCell` réécrit : l'ancien remettait `cell.transform =
/// .identity` et `cell.alpha = 1.0` en fin d'animation, ce qui EFFAÇAIT la
/// perspective sur exactement la cellule où atterrit la recherche (§4.7).
///
/// @see tasks/focal-implementation-contract.md §4.6, §4.7
@MainActor
final class FocalFocusDecoration {

    /// **L'interrupteur du cadre de focus.** `false` ⇒ aucune décoration
    /// dessinée autour de la rangée élue (essai visuel en cours). Repasser à
    /// `true` rétablit anneau + halo + teinte tels quels.
    ///
    /// Ne touche PAS le flash d'atterrissage de recherche (§4.7), qui est un
    /// signal transitoire d'une autre nature et reste actif.
    static let drawsFocusCard = false

    private static let cardLayerName = "focal.focus.card"
    private static let haloLayerName = "focal.focus.halo"
    private static let flashLayerName = "focal.focus.flash"
    private static let flashAnimationKey = "focal.focus.flash.opacity"

    /// Clés FAIBLES : une cellule relâchée par la collection ne doit pas être
    /// retenue par la décoration (et son layer part avec elle).
    private let cards = NSMapTable<UICollectionViewCell, CALayer>.weakToStrongObjects()
    private let halos = NSMapTable<UICollectionViewCell, CALayer>.weakToStrongObjects()
    private let flashes = NSMapTable<UICollectionViewCell, CALayer>.weakToStrongObjects()

    // MARK: - Mémoïsation des couleurs (discipline 1)

    /// Clé de mémoïsation de l'accent : l'hexadécimal, ou la chaîne vide pour
    /// le repli sur le token de marque (`nil` et `""` sont le même cas — une
    /// chaîne d'accent vide n'est pas un accent).
    private var cachedAccentKey: String?
    private var cachedAccentColor: CGColor?
    private var cachedIsDark: Bool?
    private var cachedSurfaceKey: String?
    private var cachedSurfaceColor: CGColor?

    init() {}

    // MARK: - Carte de focus (§4.6)

    /// Pose (ou retire) la carte sur `cell`. Appelée une fois par cellule
    /// visible et par passe : elle ne doit donc jamais allouer sur le chemin
    /// « rien n'a changé ».
    ///
    /// Une cellule NON focalisée qui n'a jamais porté de carte ne s'en voit
    /// pas créer une : seul le focus en crée. Une cellule qui en porte une
    /// garde son layer à `opacity = 0` — la réutiliser au retour du focus
    /// coûte moins qu'un cycle création/destruction à chaque va-et-vient.
    func update(cell: UICollectionViewCell, isFocused: Bool, accentHex: String?, isDark: Bool) {
        guard isFocused else {
            if let existing = cards.object(forKey: cell) {
                withoutImplicitAnimations { existing.opacity = 0 }
            }
            if let existing = halos.object(forKey: cell) {
                withoutImplicitAnimations { existing.opacity = 0 }
            }
            return
        }

        // ── CADRE DÉSACTIVÉ (essai visuel en cours) ──────────────────────
        // Demande explicite : « enlève les bordures du Focal pour le moment,
        // voir ». Rien n'est dessiné — ni anneau, ni halo, ni fond. La
        // rangée élue reste parfaitement identifiable sans eux : elle est la
        // seule à l'échelle pleine (le pass de perspective réduit et estompe
        // ses voisines), la seule à porter un avatar de 34, un nom agrandi,
        // sa date complète et sa barre de contrôles.
        //
        // Un seul interrupteur, pour rétablir en une ligne. Tout le reste du
        // fichier — mémoïsation des couleurs, layers réutilisés, discipline
        // « aucune allocation / aucune animation implicite » — est INTACT.
        guard Self.drawsFocusCard else {
            if let existing = cards.object(forKey: cell) {
                withoutImplicitAnimations { existing.opacity = 0 }
            }
            if let existing = halos.object(forKey: cell) {
                withoutImplicitAnimations { existing.opacity = 0 }
            }
            return
        }

        let layer = cardLayer(for: cell)
        let halo = haloLayer(for: cell)
        let accent = accentColor(accentHex)
        let surface = surfaceColor(accentHex, isDark: isDark)
        let frame = decorationFrame(for: cell)

        withoutImplicitAnimations {
            // Halo — le « magnifié » du cadre : un second anneau accent très
            // dilué, posé LÉGÈREMENT EN DEHORS de la carte. Il donne au bord
            // sa présence sans épaissir l'anneau normatif (`ringSize` est une
            // cote GELÉE du token `thread.focusCard`, jamais retouchée ici).
            //
            // Un `shadow` aurait produit le même halo en une ligne — refusé :
            // sans `shadowPath`, CoreAnimation le dérive du canal alpha en
            // passe HORS ÉCRAN, à chaque frame d'un pass qui tourne à 120 Hz ;
            // avec `shadowPath`, il faudrait allouer un `CGPath` neuf par
            // frame (la carte est re-cadrée à chaque passe, self-sizing).
            // Les deux violent « le pass n'alloue pas et ne déclenche aucun
            // relayout ». Un second `CALayer` réutilisé ne coûte qu'une
            // écriture de `frame`.
            halo.frame = frame.insetBy(dx: -Self.haloOutset, dy: -Self.haloOutset)
            halo.cornerRadius = FocalMetrics.FocusCard.radius + Self.haloOutset
            halo.cornerCurve = .continuous
            halo.borderWidth = Self.haloWidth
            halo.borderColor = accent
            halo.opacity = Self.haloOpacity

            layer.frame = frame
            layer.cornerRadius = FocalMetrics.FocusCard.radius
            layer.cornerCurve = .continuous
            layer.borderWidth = FocalMetrics.FocusCard.ringSize
            layer.borderColor = accent
            layer.backgroundColor = surface
            layer.opacity = 1
        }
    }

    /// Débord du halo hors de la carte, sa largeur, son opacité. Aucune de ces
    /// trois cotes n'existe dans `thread.focusCard` (le token ne décrit qu'UN
    /// anneau) — nommées ici plutôt que laissées en littéraux orphelins
    /// (garde R15), sans revendiquer de miroir `thread.*`.
    private static let haloOutset: CGFloat = 3
    private static let haloWidth: CGFloat = 3
    private static let haloOpacity: Float = 0.22

    /// Retire toute décoration de `cell` — appelée par
    /// `FocalScrollPass.reset(_:)`, donc en première ligne de chaque
    /// registration de cellule (aucun `prepareForReuse` n'existe : sans ce
    /// nettoyage, une cellule recyclée afficherait la carte de son occupant
    /// précédent).
    func clear(_ cell: UICollectionViewCell) {
        if let card = cards.object(forKey: cell) {
            card.removeFromSuperlayer()
            cards.removeObject(forKey: cell)
        }
        if let halo = halos.object(forKey: cell) {
            halo.removeFromSuperlayer()
            halos.removeObject(forKey: cell)
        }
        if let flash = flashes.object(forKey: cell) {
            flash.removeAllAnimations()
            flash.removeFromSuperlayer()
            flashes.removeObject(forKey: cell)
        }
    }

    // MARK: - Flash d'atterrissage (§4.7)

    /// Surbrillance brève après un saut de recherche / de citation.
    ///
    /// Remplace `MessageListViewController.flashCell` : même tempo (cadences
    /// reprises verbatim, `FocalPassConstants.Flash`), autre support. Une
    /// `CAKeyframeAnimation` plutôt qu'une `CABasicAnimation` `autoreverses` :
    /// la montée et la descente de l'effet historique n'ont PAS la même durée
    /// (0,18 / 0,22 en normal, 0,15 / 0,25 en fort), qu'un aller-retour
    /// symétrique ne saurait reproduire.
    ///
    /// **Extension F-086bis (arbitrage coordinateur, ouverture EXCEPTIONNELLE
    /// de ce fichier)** : `immediate` supprime le délai INTERNE (`beginTime`)
    /// — réservé à l'appelant qui a DÉJÀ payé, de son côté, le délai
    /// d'acquisition de la cellule cible (WS-6, `MessageListViewController
    /// .flashCell`, §4.7 « écart assumé » du rapport F-085) : additionner un
    /// délai externe ET ce délai interne doublait le tempo (~0,70 s au lieu
    /// de ~0,35 s). Défaut `false` : comportement EXACT d'avant cette
    /// extension — **aucun autre appelant n'est modifié**, aucun paramètre
    /// existant ne change de sens. L'ordre normal < fort (`strongDelay <
    /// delay`, `strongPeakOpacity > peakOpacity`) est PRÉSERVÉ dans les deux
    /// cas — seul `beginTime` change, jamais les autres cadences.
    func flash(cell: UICollectionViewCell, accentHex: String?, strong: Bool, immediate: Bool = false) {
        let layer = flashLayer(for: cell)
        let rise = strong ? FocalPassConstants.Flash.strongRiseDuration : FocalPassConstants.Flash.riseDuration
        let fall = strong ? FocalPassConstants.Flash.strongFallDuration : FocalPassConstants.Flash.fallDuration
        let peak = strong ? FocalPassConstants.Flash.strongPeakOpacity : FocalPassConstants.Flash.peakOpacity
        let delay: TimeInterval = immediate
            ? 0
            : (strong ? FocalPassConstants.Flash.strongDelay : FocalPassConstants.Flash.delay)
        let accent = accentColor(accentHex)
        let frame = decorationFrame(for: cell)

        withoutImplicitAnimations {
            layer.frame = frame
            layer.cornerRadius = FocalMetrics.FocusCard.radius
            layer.cornerCurve = .continuous
            layer.backgroundColor = accent
            layer.opacity = 0
        }

        let animation = CAKeyframeAnimation(keyPath: "opacity")
        animation.values = [Float(0), peak, Float(0)]
        animation.keyTimes = [0, NSNumber(value: rise / (rise + fall)), 1]
        animation.duration = rise + fall
        animation.beginTime = CACurrentMediaTime() + delay
        animation.timingFunctions = [
            CAMediaTimingFunction(name: .easeOut),
            CAMediaTimingFunction(name: .easeOut)
        ]
        animation.fillMode = .backwards
        animation.isRemovedOnCompletion = true

        layer.removeAnimation(forKey: Self.flashAnimationKey)
        layer.add(animation, forKey: Self.flashAnimationKey)
    }

    // MARK: - Lecture d'état (tests, gardes)

    /// Layer de carte actuellement attaché à `cell`, s'il existe.
    func cardLayer(attachedTo cell: UICollectionViewCell) -> CALayer? {
        cards.object(forKey: cell)
    }

    /// Layer de flash actuellement attaché à `cell`, s'il existe.
    func flashLayer(attachedTo cell: UICollectionViewCell) -> CALayer? {
        flashes.object(forKey: cell)
    }

    // MARK: - Interne

    /// Rectangle commun à la carte et au flash : les marges `thread.focusCard`
    /// du token (`FocalMetrics.FocusCard`), jamais un littéral.
    ///
    /// Re-cadré à chaque passe : la self-sizing `.estimated(…)` de la
    /// collection fait varier les hauteurs de cellule d'une frame à l'autre
    /// (§4.6). Lire `bounds` ne provoque aucun layout.
    private func decorationFrame(for cell: UICollectionViewCell) -> CGRect {
        cell.contentView.bounds.insetBy(
            dx: FocalMetrics.FocusCard.marginHorizontal,
            dy: FocalMetrics.FocusCard.marginVertical
        )
    }

    private func cardLayer(for cell: UICollectionViewCell) -> CALayer {
        if let existing = cards.object(forKey: cell) {
            if existing.superlayer !== cell.contentView.layer {
                cell.contentView.layer.insertSublayer(existing, at: 0)
            }
            return existing
        }
        let layer = CALayer()
        layer.name = Self.cardLayerName
        layer.opacity = 0
        // Index 0 : DERRIÈRE le contenu SwiftUI hébergé (dont le fond est
        // transparent) — la carte encadre la rangée, elle ne la recouvre pas.
        cell.contentView.layer.insertSublayer(layer, at: 0)
        cards.setObject(layer, forKey: cell)
        return layer
    }

    /// Le halo vit SOUS la carte (index 0) : la carte, son anneau net et son
    /// fond le recouvrent, seul le débord reste visible.
    private func haloLayer(for cell: UICollectionViewCell) -> CALayer {
        if let existing = halos.object(forKey: cell) {
            if existing.superlayer !== cell.contentView.layer {
                cell.contentView.layer.insertSublayer(existing, at: 0)
            }
            return existing
        }
        let layer = CALayer()
        layer.name = Self.haloLayerName
        layer.opacity = 0
        cell.contentView.layer.insertSublayer(layer, at: 0)
        halos.setObject(layer, forKey: cell)
        return layer
    }

    private func flashLayer(for cell: UICollectionViewCell) -> CALayer {
        if let existing = flashes.object(forKey: cell) {
            if existing.superlayer !== cell.contentView.layer {
                insertFlash(existing, in: cell)
            }
            return existing
        }
        let layer = CALayer()
        layer.name = Self.flashLayerName
        layer.opacity = 0
        insertFlash(layer, in: cell)
        flashes.setObject(layer, forKey: cell)
        return layer
    }

    /// Le flash se pose AU-DESSUS de la carte (dont le fond est opaque) mais
    /// toujours SOUS le contenu hébergé — sinon il teinterait le texte.
    private func insertFlash(_ layer: CALayer, in cell: UICollectionViewCell) {
        let host = cell.contentView.layer
        if let card = cards.object(forKey: cell), card.superlayer === host {
            host.insertSublayer(layer, above: card)
        } else {
            host.insertSublayer(layer, at: 0)
        }
    }

    /// `nil` (ou chaîne vide) ⇒ repli sur le token de marque
    /// `MeeshyColors.brandPrimary` — jamais un hexadécimal en dur dans ce
    /// fichier (règle #9 du contrat : aucune couleur littérale hors token).
    private func accentColor(_ hex: String?) -> CGColor {
        let key = hex ?? ""
        if let cached = cachedAccentColor, cachedAccentKey == key { return cached }
        let resolved = key.isEmpty ? MeeshyColors.brandPrimary : Color(hex: key)
        let color = UIColor(resolved).cgColor
        cachedAccentKey = key
        cachedAccentColor = color
        return color
    }

    /// Fond de la carte — **teinte d'accent TRANSLUCIDE**, plus
    /// `backgroundSecondary` opaque.
    ///
    /// L'ancien fond opaque était la vraie cause de l'effet « boîte » : il
    /// posait un rectangle plein derrière la rangée élue, si bien que la
    /// couleur de la conversation ne se lisait que sur 1,5 pt d'anneau
    /// pendant qu'un aplat neutre occupait toute la surface. Une teinte
    /// d'accent très diluée fait exactement l'inverse — la conversation
    /// colore la carte entière, sans jamais peser sur le texte.
    ///
    /// La clé de mémoïsation combine accent ET thème : mémoïser sur le seul
    /// `isDark` (ce que faisait la version opaque, qui ne dépendait que de
    /// lui) rendrait la couleur insensible à un changement d'accent.
    private func surfaceColor(_ hex: String?, isDark: Bool) -> CGColor {
        let key = "\(hex ?? "")|\(isDark)"
        if let cached = cachedSurfaceColor, cachedSurfaceKey == key { return cached }
        let base = (hex.map { $0.isEmpty } ?? true) ? MeeshyColors.brandPrimary : Color(hex: hex ?? "")
        let alpha = isDark ? FocalMetrics.FocusCard.surfaceDarkAlpha : FocalMetrics.FocusCard.surfaceLightAlpha
        let color = UIColor(base).withAlphaComponent(alpha).cgColor
        cachedSurfaceKey = key
        cachedIsDark = isDark
        cachedSurfaceColor = color
        return color
    }

    /// Discipline 2 : aucune action implicite sur un layer non adossé à une vue.
    private func withoutImplicitAnimations(_ body: () -> Void) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        body()
        CATransaction.commit()
    }
}
