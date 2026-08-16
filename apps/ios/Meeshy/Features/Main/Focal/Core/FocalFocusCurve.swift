import CoreGraphics

/// Miroir Swift EXACT de `packages/shared/utils/focus-curve.ts` (GELÉ S1,
/// version POST-C-032 — contrat `tasks/lentille-implementation-contract.md`
/// LWS-0 §4.1/§4.2, amendement A3 `tasks/lentille-focal-workshop.md`
/// : « une forme, deux jeux de constantes »).
///
/// `focusCurve` transforme une distance verticale au focus en `(alpha,
/// scale)` — jamais une hauteur, jamais une police (invariant §4.1 : la
/// perspective ne touche pas la géométrie du rang). `electFocusRow` élit,
/// parmi des candidats de rang, celui qui occupe la carte de focus, avec
/// une bande d'hystérésis qui empêche le gagnant de trembler.
///
/// Fonctions pures, aucun I/O, aucune dépendance de plateforme au-delà de
/// `CGFloat` (le type géométrique natif des laws SwiftUI du dépôt — cf.
/// `MessageOverlayDragLaw`, `ComposerPanelHandleLaw`). Les vues (Focal
/// `.thread`, Lentille `.list`) consomment cette loi et ses constantes,
/// JAMAIS l'inverse : aucune de ces valeurs ne se réécrit en dur hors ce
/// fichier (garde R15).
///
/// `nonisolated` sur le type : la cible app compile sous
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` (SE-0466) — sans cette
/// sortie explicite, chaque déclaration hériterait de l'isolation
/// `@MainActor` par défaut et les témoins synchrones non isolés de
/// `FocusCurveVectorTests` ne pourraient ni appeler la loi ni comparer ses
/// résultats (même précédent que `ComposerPanelHandleLaw`).
///
/// @see packages/shared/utils/focus-curve.ts
/// @see tasks/lentille-implementation-contract.md LWS-0, §4.1, §4.2
/// @see tasks/lentille-focal-workshop.md A3
nonisolated enum FocalFocusCurve {

    // MARK: - Variant

    /// Miroir de `FocusCurveVariant` (TS `'thread' | 'list'`).
    enum Variant: Sendable {
        /// Fil (Focal) : `f = min(1, d/380)`, `scale = 1 − 0.40f`, `alpha = 1 − 0.82f`.
        case thread
        /// Liste (Lentille) : `f = min(1, d/520)`, `alpha = 1 − 0.45f`, `scale = 1 − 0.04f`.
        case list
    }

    /// Miroir de `FocusCurveResult`.
    struct Result: Equatable, Sendable {
        let alpha: CGFloat
        let scale: CGFloat
    }

    // MARK: - Constantes gelées (miroir de FOCUS_CURVE_CONSTANTS)

    /// Miroir de `FOCUS_CURVE_CONSTANTS.thread` — RÉSERVE 1, revue REV-1.
    static let threadMaxDistance: CGFloat = 740
    static let threadScaleDecay: CGFloat = 0.4
    static let threadAlphaDecay: CGFloat = 0.82

    /// Miroir de `FOCUS_CURVE_CONSTANTS.list`.
    static let listMaxDistance: CGFloat = 520
    static let listAlphaDecay: CGFloat = 0.45
    static let listScaleDecay: CGFloat = 0.04

    /// Miroir de `FOCUS_CURVE_CONSTANTS.belowBand` — fondu court sous la
    /// bande de focus (liste uniquement, §4.1). Rampe PROPORTIONNELLE
    /// plafonnée — jamais `max(d/160, −0.35)` (BLOCAGE 1 REV-1 : cette
    /// ancienne forme saturait à `d=-56` au lieu de `d=-160`). Reprise
    /// littérale de la maquette normative
    /// `docs/design/2026-08-15-conversation-list-lentille.html:647` :
    /// `op = 1 − 0.35·min(1, d/160)`.
    static let listBelowBandDistance: CGFloat = 160
    static let listBelowBandAlphaCap: CGFloat = 0.35

    // MARK: - Bande de focus (miroir de FOCUS_BAND_OFFSET / FOCUS_BAND_HALF_HEIGHT)

    /// Miroir de `FOCUS_BAND_OFFSET` (§4.2 : « bottom − 140 ± 45 »).
    /// Distance verticale entre le bas du viewport et le centre de la
    /// bande de focus. RÉSERVE 2, revue REV-1. Déclarée UNE fois ici — les
    /// vues (Lentille `list.focusCard`, Focal atterrissage) la lisent
    /// d'ici, jamais en dur (garde R15).
    static let focusBandOffset: CGFloat = 140

    /// Miroir de `FOCUS_BAND_HALF_HEIGHT`. Demi-hauteur de la bande de
    /// focus, c'est-à-dire l'hystérésis passée à `electFocusRow`.
    static let focusBandHalfHeight: CGFloat = 45

    private static func clampUnit(_ value: CGFloat) -> CGFloat {
        min(1, max(0, value))
    }

    // MARK: - focusCurve

    /// Interprétation du signe de `distance` (documentée ici car §4.1 la
    /// laisse implicite, et le contrat exige qu'elle soit explicitée) :
    ///
    ///   - `distance` est la distance verticale AU-DESSUS de la bande de
    ///     focus. Un rang qui défile loin au-dessus de la bande a
    ///     `distance` grand et positif ; un rang PILE dans la bande a
    ///     `distance = 0`.
    ///   - `distance < 0` signifie que le rang est SOUS la bande de focus —
    ///     cas marginal en liste puisque la bande est ancrée près du bas de
    ///     l'écran (§4.2).
    ///   - Le terme `f = min(1, d/…)` du variant `.list` est borné à
    ///     `[0, 1]` : pour `distance < 0`, `f = 0`, donc le terme de base ne
    ///     contribue AUCUN fondu (`alpha` de base reste `1`, `scale` reste
    ///     `1`). Le fondu sous la bande est un terme ADDITIF distinct :
    ///     `belowBandFade = −0.35 · clampUnit(−d/160)`, borné à `[0.65, 1]`
    ///     une fois recombiné — un fondu volontairement COURT (rayon
    ///     `160px` contre `520px` au-dessus de la bande).
    ///   - Le variant `.thread` n'a pas d'amendement « sous la bande » : par
    ///     symétrie et pour rester une loi pure et totale, `distance ≤ 0` y
    ///     rend `alpha = 1` et `scale = 1` (le rang pile au focus, ou
    ///     « au-delà » dans le sens du focus, ne s'estompe ni ne rétrécit).
    static func focusCurve(distance: CGFloat, variant: Variant) -> Result {
        switch variant {
        case .thread:
            let f = clampUnit(distance / threadMaxDistance)
            return Result(
                alpha: 1 - threadAlphaDecay * f,
                scale: 1 - threadScaleDecay * f
            )

        case .list:
            let f = clampUnit(distance / listMaxDistance)
            let belowBandFade: CGFloat = distance < 0
                ? -listBelowBandAlphaCap * clampUnit(-distance / listBelowBandDistance)
                : 0

            return Result(
                alpha: clampUnit(1 - listAlphaDecay * f + belowBandFade),
                scale: 1 - listScaleDecay * f
            )
        }
    }

    // MARK: - electFocusRow

    /// Miroir de `FocusRowCandidate`.
    struct RowCandidate: Equatable, Sendable {
        let id: String
        let midY: CGFloat

        init(id: String, midY: CGFloat) {
            self.id = id
            self.midY = midY
        }
    }

    /// Élection de la focus card (§4.2) — bande d'hystérésis : le rang
    /// courant garde la main tant que son `midY` reste dans
    /// `focusY ± hysteresis` (borne INCLUSIVE — `<=`, pas `<`) ; sinon le
    /// candidat dont le `midY` est le plus proche de `focusY` gagne.
    /// Départage déterministe par `id` croissant à égalité de distance.
    /// Un `currentId` absent des candidats (rang défilé hors écran) est
    /// traité comme « aucun courant ». `candidates` vide → `nil`.
    ///
    /// « La carte suit le défilement, jamais les événements » (§4.2) :
    /// cette loi ne consulte que les positions données en entrée, jamais
    /// une horloge ni un flux d'événements — c'est aux vues d'appeler
    /// `electFocusRow` à chaque passe de défilement.
    static func electFocusRow(
        candidates: [RowCandidate],
        focusY: CGFloat,
        currentId: String?,
        hysteresis: CGFloat
    ) -> String? {
        guard !candidates.isEmpty else { return nil }

        let current = currentId.flatMap { id in
            candidates.first { $0.id == id }
        }

        if let current, abs(current.midY - focusY) <= hysteresis {
            return current.id
        }

        var winner: RowCandidate?
        for candidate in candidates {
            guard let best = winner else {
                winner = candidate
                continue
            }
            let bestDistance = abs(best.midY - focusY)
            let candidateDistance = abs(candidate.midY - focusY)
            if candidateDistance < bestDistance {
                winner = candidate
            } else if candidateDistance == bestDistance && candidate.id < best.id {
                winner = candidate
            }
        }

        return winner?.id
    }
}
