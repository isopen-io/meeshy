import SwiftUI

/// Cotes de PIXELS de la peau Rivière — miroir Swift de
/// `packages/shared/design/lentille-tokens.json` → `river` (R-131, LECTURE
/// SEULE, source de vérité), même patron que `Lentille/Core/LentilleMetrics.swift`
/// et `Focal/Core/FocalMetrics.swift` : structures nichées par famille,
/// `RiverMetricsTests` fait la parité valeur par valeur contre le JSON.
/// « On répare le token, jamais le test. »
///
/// **Ce fichier ne porte AUCUNE constante de loi.** `RIVER_MAX_LANES` (7),
/// `RIVER_MIN_VOICES` (3), `RIVER_HEADER_FADE_RANKS` (2) et
/// `RIVER_LANE_SILENCE_WINDOW_MS` vivent dans `RiverLaneResolver` (miroir de
/// `packages/shared/utils/river-lanes.ts`), jamais ici — dupliquer l'une
/// d'elles dans ce fichier romprait la garde R15 (une seule maison par
/// constante) et créerait deux vérités qui peuvent diverger. La peau lit ces
/// deux familles de constantes à deux endroits différents, EXPRÈS : les
/// cotes de dessin ici, la géométrie/les seuils dans la loi.
///
/// **Relevées sur la maquette normative**
/// `docs/design/2026-08-17-riviere-navigation.html` (§7ter, « Tokens de
/// PIXELS — ils appartiennent à la peau, jamais à la loi », commentaire de
/// tête du script) : `LANE_W = 300`, `GUTTER = 28`, bordure/trait `2.5`,
/// rayon de bulle `14`, connecteur `1.4` (bow `max(34, |Δ| · 0.5)`), bande
/// d'en-tête `38`.
///
/// @see packages/shared/design/lentille-tokens.json → `river`
/// @see apps/ios/Meeshy/Features/Main/Riviere/Core/RiverLaneResolver.swift (la LOI, jamais ici)
/// @see tasks/lentille-workshop-execution.md R-131
nonisolated public enum RiverMetrics {

    // MARK: - Trait de branche

    /// `river.line` — largeur `2.5`, PARTAGÉE avec la bordure de la bulle
    /// (`Bubble.detourRadius` porte le rayon, pas l'épaisseur : le contour de
    /// la bulle EST un segment de la ligne, amendement R — même trait, même
    /// largeur).
    nonisolated public enum Line {
        public static let width: CGFloat = 2.5
    }

    // MARK: - Couloir

    /// `river.lane` — largeur de référence `300` (§7ter : assez pour qu'une
    /// bulle rende tout son texte), gouttière `28` de chaque côté de la
    /// bulle. `widthReference` est un DÉFAUT, pas une borne : une peau plus
    /// étroite (téléphone) peut la réduire — jamais tronquer le texte pour
    /// gagner une colonne (§7ter, « tension assumée »). `RiverLaneResolver.maxLanes`
    /// reste un paramètre d'entrée de la loi, indépendant de cette largeur.
    nonisolated public enum Lane {
        public static let widthReference: CGFloat = 300
        public static let gutter: CGFloat = 28
    }

    // MARK: - Bulle

    /// `river.bubble` — rayon de contournement `14` (le trait épouse ce
    /// rayon en abordant/quittant la bulle), écart de base `8` (la ligne où
    /// vit l'heure quand la bulle n'est pas tête de groupe — amendement R,
    /// « l'heure vit en base de bulle »).
    nonisolated public enum Bubble {
        public static let detourRadius: CGFloat = 14
        public static let baseGap: CGFloat = 8
    }

    // MARK: - Connecteur de réponse

    /// `river.connector` — trait `1.4` (plus fin que la branche), courbe de
    /// Bézier : `bow = max(minBow, |Δcouloir| · bowRatio)`.
    nonisolated public enum Connector {
        public static let strokeWidth: CGFloat = 1.4
        public static let minBow: CGFloat = 34
        public static let bowRatio: CGFloat = 0.5

        /// Contrôle de courbure pour une paire de couloirs distants de
        /// `laneDistance` colonnes — miroir arithmétique de la maquette
        /// (`Math.max(34, Math.abs(tx - fx) * 0.5)`, exprimé ici en points de
        /// COULOIRS, la peau multiplie par `Lane.widthReference` réel).
        public static func bow(laneDistancePoints: CGFloat) -> CGFloat {
            max(minBow, abs(laneDistancePoints) * bowRatio)
        }
    }

    // MARK: - En-tête de couloir

    /// `river.laneHeader` — hauteur `38`, en PIXELS. Distincte de
    /// `RiverLaneResolver.headerFadeRanks` (loi, en RANGS) : la loi dit QUI
    /// nommer et à quelle opacité, ce token dit la hauteur de la bande qui
    /// l'affiche (§7ter B — « rampe de fondu d'en-tête… si elle est un pixel
    /// et non un rang »).
    nonisolated public enum LaneHeader {
        public static let height: CGFloat = 38
    }
}
