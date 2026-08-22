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
/// d'en-tête `38`. §7ter A (amendement 2026-08-17, `.idh .nm { max-width:
/// 44% }` / `.bub.flat { border: 1px … border-left-width: 2.5px;
/// border-bottom-width: 2.5px }`) : borne du nom `44`, contour neutre
/// sérialisé `1`.
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
        /// Bornes du PINCE (retour produit 2026-08-22). Le plancher garde une
        /// bulle lisible — §7ter interdit de tronquer le texte pour gagner une
        /// colonne, et c'est bien la LARGEUR DE COULOIR qu'on fait varier, pas
        /// une échelle appliquée au rendu : un `scaleEffect` aurait rapetissé
        /// le TEXTE lui-même, et faussé au passage les cadres mesurés dont le
        /// canvas et la ligne de lecture dépendent.
        public static let widthMin: CGFloat = 210
        public static let widthMax: CGFloat = 540
        public static let gutter: CGFloat = 28
    }

    // MARK: - Bulle

    /// `river.bubble` — rayon de contournement `14` (le trait épouse ce
    /// rayon en abordant/quittant la bulle), écart de base `8` (la ligne où
    /// vit l'heure quand la bulle n'est pas tête de groupe — amendement R,
    /// « l'heure vit en base de bulle »). §7ter A.5/A.6 (2026-08-17) ajoutent
    /// `identityNameMaxWidth` (borne du nom en tête de groupe — FRACTION,
    /// même convention que `LentilleMetrics.Row.transformOriginX` : le JSON
    /// porte `"44%"`, cette constante porte `0.44` — garantit que la
    /// branche, à l'aplomb du centre du couloir, croise du vide dans la
    /// rangée d'identité, jamais un mot) et `flatBorderWidth` (contour
    /// NEUTRE de la vue sérialisée, hors bord gauche/bas qui restent
    /// `Line.width`, couleur d'auteur).
    nonisolated public enum Bubble {
        public static let detourRadius: CGFloat = 14
        public static let baseGap: CGFloat = 8
        /// Retrait INTÉRIEUR de la bulle — retour produit 2026-08-21 : « il
        /// faut assurer une certaine distance entre les bords et le contenu ».
        /// `baseGap` en tenait lieu, à tort : c'est un ÉCART DE PILE entre les
        /// blocs d'une bulle (citation, texte, heure), pas une marge. Les
        /// confondre donnait 8 pt de respiration à un texte cerné d'un contour
        /// de 2,5 pt.
        public static let contentPadding: CGFloat = 14
        public static let identityNameMaxWidth: CGFloat = 0.44
        public static let flatBorderWidth: CGFloat = 1
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

    // MARK: - Rang

    /// `river.row` — retour produit 2026-08-21. `gap` : la respiration
    /// verticale entre DEUX RANGS ; sans elle les bulles s'empilaient bord à
    /// bord et l'axe du temps ne se lisait plus. `continuationDash*` : les
    /// tirets de la couture qui relie deux bulles CONSÉCUTIVES du même auteur
    /// — l'espace seul dirait « quelqu'un d'autre a parlé », le pointillé dit
    /// « la même voix continue ». Le GROUPEMENT lui-même reste une décision de
    /// la LOI (`RiverBubble.isFirstInGroup`) : ces cotes ne font que le
    /// dessiner.
    nonisolated public enum Row {
        public static let gap: CGFloat = 14
        /// Hauteur de la couture entre deux bulles CONSÉCUTIVES du même
        /// auteur (arbitrage produit 2026-08-21). **Depuis le lot G
        /// (2026-08-22), iOS ne la consomme plus** : la jointure n'est plus
        /// une couture posée ENTRE deux contours fermés, c'est le bord haut
        /// PARTAGÉ de la bulle qui continue (`RiverBubbleOutline`,
        /// `RiverBubbleView.sharedEdge`), dessiné avec `continuationDash*`.
        /// La cote reste ici pour la parité avec le JSON partagé, que la peau
        /// web lit encore.
        public static let continuationSeam: CGFloat = 3
        public static let continuationDashLength: CGFloat = 3
        public static let continuationDashGap: CGFloat = 4
    }

    // MARK: - Mouvement (cotes iOS, hors JSON partagé)

    /// Durées de PEAU propres à iOS — aucune cote de mouvement dans le JSON
    /// partagé à ce jour (même précédent que `FocalMetrics.FocusChip` : nommé
    /// en `Core` sans revendiquer de token). Nommées ici parce que la garde
    /// R15 bannit leurs littéraux de `Riviere/View/` (`0.35` est un jeton de
    /// loi surveillé).
    nonisolated public enum Motion {
        /// Glissade d'un cadrage demandé (citation, poignée du temps).
        public static let landingDuration: TimeInterval = 0.35
        /// Apparition/effacement de la poignée du temps.
        public static let handleFadeDuration: TimeInterval = 0.2
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
