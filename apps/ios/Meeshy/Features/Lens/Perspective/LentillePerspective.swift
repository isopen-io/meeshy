import SwiftUI

// MARK: - Bande de focus

/// La bande de focus de la liste — le seul endroit, côté peau, qui sait OÙ
/// elle se trouve (contrat `tasks/lentille-implementation-contract.md` §4.2).
///
/// Elle est ancrée au BAS de la région visible du défilement, à la distance
/// que le miroir gelé publie (`FocalFocusCurve.focusBandOffset`, miroir de
/// `FOCUS_BAND_OFFSET` dans `packages/shared/utils/focus-curve.ts`). Cette
/// cote ne se réécrit JAMAIS ici (garde R15, `scripts/check-law-literals.sh`).
///
/// **Pourquoi un type à part, pour une seule ligne.** Deux consommateurs
/// distincts en dépendent — la perspective (LWS-8/I-069 : la distance d'un
/// rang à la bande) et l'élection de la focus card (LWS-8/I-070 : le rang dont
/// le milieu tombe DANS la bande). Les laisser calculer chacun leur bande, ce
/// serait deux vérités qui dérivent au premier changement de cote : la carte
/// s'élirait à un endroit et la perspective piquerait à un autre.
///
/// `nonisolated` : la cible app compile sous `SWIFT_DEFAULT_ACTOR_ISOLATION =
/// MainActor` (SE-0466). Sans cette sortie explicite, le calcul hériterait de
/// l'isolation `@MainActor` et deviendrait inappelable depuis la closure
/// `@Sendable` de `.visualEffect` — même précédent que `FocalFocusCurve`.
nonisolated enum LentilleFocusBand {

    /// Ordonnée du CENTRE de la bande, dans le même repère que le `midY` des
    /// rangs qu'on lui compare. `viewportBottom` est le bas de la région
    /// visible du défilement, exprimé dans ce même repère.
    /// Centre de la bande (2026-08-21, directive user : « la magnificence
    /// presque au centre de l'écran » et « doit pouvoir toucher la première
    /// conversation en tête ») : le CENTRE de la région visible — sauf près
    /// du haut de la liste : à `offsetFromTop == 0` (au repos en haut) la
    /// bande est au bord haut, et elle descend linéairement jusqu'au centre
    /// sur la première demi-hauteur de défilement. Même loi pour l'élection
    /// et pour la perspective des rangées — un seul `LentilleFocusBand`.
    /// Le relais publie le `minY` de la sentinelle de `MeeshyRefreshableScroll`
    /// (0 au repos en haut, NÉGATIF en descendant dans la liste) ; la bande
    /// raisonne en « distance parcourue depuis le haut », positive. UNE
    /// conversion, partagée par l'élection et la scène — jamais deux signes.
    static func offsetFromTop(relayOffset: CGFloat) -> CGFloat {
        -relayOffset
    }

    static func centerY(viewportTop: CGFloat, viewportBottom: CGFloat, offsetFromTop: CGFloat) -> CGFloat {
        let center = (viewportTop + viewportBottom) / 2
        let travel = center - viewportTop
        guard travel > 0 else { return center }
        let t = min(1, max(0, offsetFromTop / travel))
        return viewportTop + travel * t
    }
}

// MARK: - Perspective de liste

/// La perspective au défilement de la Lentille (contrat LWS-8, §4.1) : une
/// passe **de compositor, PURE, SANS ÉTAT**.
///
/// **Ce qu'elle fait.** Pour chaque rang visible, elle mesure sa distance à la
/// bande de focus et demande au miroir gelé (`FocalFocusCurve`, variant
/// `.list`) l'opacité et l'échelle qui en découlent. Elle applique ces deux
/// valeurs — et rien d'autre.
///
/// **Ce qu'elle ne fait jamais.**
/// - Elle ne réécrit pas la courbe. Aucune de ses constantes ne figure dans ce
///   fichier, commentaires compris : la loi vit dans le miroir, elle-même
///   miroir de `packages/shared/utils/focus-curve.ts`. Une copie ici ferait
///   diverger iOS du web au premier ajustement.
/// - Elle ne touche pas au layout : ni hauteur, ni police, ni invalidation
///   (invariant §4.1 — « la hauteur du rang n'apparaît nulle part dans la
///   loi : c'est ce qui garantit le zéro relayout »). `.visualEffect` s'exécute
///   dans la passe d'affichage, après le layout ; le rang ne change pas de
///   taille, il change d'APPARENCE. C'est ce qui rend le critère R2 tenable :
///   coût en O(rangs visibles), aucune allocation, aucune invalidation.
/// - Elle ne retient rien. Aucun `@State` : deux rangs à la même distance
///   rendent le même résultat, quel que soit le chemin parcouru pour y
///   arriver. C'est ce qui permet à SwiftUI de la rejouer à chaque frame sans
///   qu'elle ait besoin d'être « remise à jour ».
///
/// **Reduce motion ⇒ identité.** Critère d'acceptation LWS-8 : « toutes les
/// opacités à 1 ». Le réglage n'est pas passé au miroir — il court-circuite la
/// passe entière, qui rend alors exactement `(1, 1)`. L'ÉLECTION, elle, est
/// conservée (I-070) : la focus card reste, réduite à son fond (I-071). Un
/// utilisateur qui coupe le mouvement perd la perspective, jamais le repère.
///
/// **Cote de déploiement.** `.visualEffect` est iOS 17+. La cible `Meeshy` de
/// `project.yml` est encore `16.0` : la passe est donc gardée par
/// `#available`, et sur iOS 16 le rang est rendu tel quel — exactement ce que
/// rend déjà le drapeau OFF. Aucun repli géométrique n'est écrit ici : il
/// exigerait de LIRE la position du rang pendant le layout, c'est-à-dire
/// précisément l'invalidation que le §4.1 interdit. L'écart est signalé au
/// contrat plutôt que contourné dans la peau.
///
/// @see tasks/lentille-implementation-contract.md LWS-8, §4.1, §4.2, §4.3
/// @see apps/ios/Meeshy/Features/Main/Focal/Core/FocalFocusCurve.swift
struct LentillePerspective: ViewModifier {

    /// Le seul état lu par la passe — et il vient de l'environnement, pas
    /// d'elle. Un changement de réglage système re-rend le rang une fois ; il
    /// ne remonte jamais la vue (le modificateur reste en place, seule la
    /// valeur qu'il transmet change).
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // MARK: - Règles pures (testables sans rendu)

    /// Pivot du zoom — cote normative §4.3 (`transform-origin` du rang),
    /// domiciliée dans `LentilleMetrics.Row`, elle-même miroir de
    /// `packages/shared/design/lentille-tokens.json`. Jamais un nombre écrit
    /// ici, et jamais le `.center` de SwiftUI : le rang pivote près de son
    /// avatar, pas autour de son milieu.
    nonisolated static var transformOrigin: UnitPoint {
        UnitPoint(x: LentilleMetrics.Row.transformOriginX, y: LentilleMetrics.Row.transformOriginY)
    }

    /// Distance d'un rang à la bande, dans la convention de signe DOCUMENTÉE
    /// par le miroir : positive au-DESSUS de la bande (le rang est plus haut à
    /// l'écran, donc son `midY` est plus petit), nulle dans la bande, négative
    /// dessous — le seul régime qui active le fondu court.
    nonisolated static func distance(rowMidY: CGFloat, viewportTop: CGFloat, viewportBottom: CGFloat, offsetFromTop: CGFloat) -> CGFloat {
        LentilleFocusBand.centerY(viewportTop: viewportTop, viewportBottom: viewportBottom, offsetFromTop: offsetFromTop) - rowMidY
    }

    /// La passe elle-même, réduite à sa décision : déléguer, ou rendre
    /// l'identité. Aucune arithmétique de courbe ne vit ici.
    /// Loi `.list` sur la distance ABSOLUE (règle de consommation 2026-08-21 :
    /// la bande est au centre, les rangées du dessous ne sont plus « passées »
    /// — le fondu court sous la bande du miroir, pensé pour une bande en bas
    /// d'écran, effacerait la moitié de la liste), fondue vers l'identité
    /// selon le niveau de scène (`LentilleSceneActivity.blend`).
    nonisolated static func pass(distance: CGFloat, level: CGFloat, reduceMotion: Bool) -> FocalFocusCurve.Result {
        guard !reduceMotion else { return FocalFocusCurve.Result(alpha: 1, scale: 1) }
        return LentilleSceneActivity.blend(
            FocalFocusCurve.focusCurve(distance: abs(distance), variant: .list),
            level: level
        )
    }

    // MARK: - Application

    /// `@ViewBuilder` explicite : `ViewModifier.body(content:)` le porte déjà
    /// dans la déclaration du protocole, mais le rendre visible ici évite
    /// qu'une lecture rapide prenne les deux branches de `#available` pour une
    /// erreur — c'est la seule structure de contrôle du fichier.
    /// Niveau de scène (0 au repos, 1 en défilement) — observé ICI, par le
    /// modificateur seul : son basculement (deux fois par session) ne
    /// ré-évalue que les modificateurs, jamais les corps de rangée. `scene`
    /// est aussi capturé par référence pour relire l'offset par frame.
    @EnvironmentObject private var scene: LentilleSceneActivity

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.visualEffect { [reduceMotion, level = scene.level, scene] effect, proxy in
                // Repère LOCAL du rang : `bounds(of:)` rend la région visible
                // du défilement CONVERTIE dans ce repère, et le milieu du rang
                // y vaut la moitié de sa propre hauteur. Les deux ordonnées
                // sont donc comparables sans conversion supplémentaire.
                //
                // Hors défilement (aperçu Xcode, rang monté seul), `bounds`
                // rend `nil` : distance nulle, donc identité — jamais une
                // perspective calculée sur un repère inventé.
                let distance = proxy.bounds(of: .scrollView(axis: .vertical)).map { viewport in
                    Self.distance(
                        rowMidY: proxy.size.height / 2,
                        viewportTop: viewport.minY,
                        viewportBottom: viewport.maxY,
                        offsetFromTop: scene.offset
                    )
                } ?? 0

                let result = Self.pass(distance: distance, level: level, reduceMotion: reduceMotion)

                return effect
                    .opacity(result.alpha)
                    .scaleEffect(result.scale, anchor: Self.transformOrigin)
            }
        } else {
            content
        }
    }
}

// MARK: - Point d'entrée

extension View {

    /// Monte la perspective — ou ne monte RIEN.
    ///
    /// Sous drapeau OFF le rang est rendu nu : pas de modificateur neutralisé,
    /// pas de `.visualEffect` inerte dans l'arbre. Un modificateur « qui ne
    /// fait rien » coûterait quand même une passe de compositor par rang et
    /// par frame, et le contrat exige que le rendu hors Lentille reste celui
    /// d'aujourd'hui au bit près.
    ///
    /// Le drapeau est reçu DÉJÀ RÉSOLU (un `Bool`), jamais interrogé ici :
    /// `LentilleFeatureFlag` relit `ProcessInfo.environment` à chaque appel, et
    /// le corps d'un rang est un chemin chaud (même règle que
    /// `tracksVisibleSection`, LWS-6/I-063bis).
    @ViewBuilder
    func lentillePerspective(isEnabled: Bool) -> some View {
        if isEnabled {
            modifier(LentillePerspective())
        } else {
            self
        }
    }
}
