import SwiftUI
import MeeshyUI

/// Cotes normatives de la rangée plate du Fil (Focal) — miroir Swift de
/// `packages/shared/design/lentille-tokens.json` → `thread` (LECTURE SEULE,
/// source de vérité). Même patron que `Lentille/Core/LentilleMetrics.swift`
/// (GELÉ, imité ici — jamais édité) : structures nichées par zone d'écran,
/// `FocalMetricsTests` fait la parité valeur par valeur contre le JSON.
/// « On répare le token, jamais le test » (règle sacrée, recopiée du patron
/// `LentilleMetricsTests`).
///
/// **RE-PREUVE (tâche 0, workshop §0)** : ce fichier N'EXISTAIT PAS. Le Core
/// gelé S1 (M-042/043/044, commits locaux F-080/F-081 c5bfc38/0a99cb1) ne
/// livre QUE `Focal/Core/{ReadingModeOrchestrator,FocalFocusCurve,
/// ScrollTimePillLaw}.swift` — cf. leurs commentaires de tête, qui signalent
/// tous les trois l'absence de `FocalMetrics`. `Focal/Core/` n'est PAS gelé
/// dans son ensemble : seuls ces trois fichiers nommés le sont (mission de
/// cette tâche, §« CODE GELÉ S1 »). Ce fichier est un AJOUT, jamais une
/// édition d'un fichier gelé — même statut que `FocalRowInput.swift` (WS-4).
///
/// **Cotes `thread.*` ABSENTES du token — signalées, jamais inventées** (une
/// version antérieure et PRÉ-TOKEN de `focal-implementation-contract.md`
/// §3.11 les esquissait avant que `lentille-tokens.json` existe ; le token
/// gelé ne les a jamais reprises) :
/// - `groupTopPadding` (esquisse pré-token : `10`) — `thread.row` ne porte
///   QUE `padding.vertical`/`padding.horizontal`, aucun espacement dédié
///   « au-dessus d'un nouveau groupe d'expéditeur ». Repli : `8`
///   (= `MeeshySpacing.sm`, le palier le plus proche de l'échelle générique
///   déjà existante — écrit en dur ici, comme tout le reste de ce fichier,
///   pour rester `nonisolated`, cf. note d'isolation plus bas).
///   TODO CONTRACTUEL : ajouter `thread.row.groupTopPadding` à
///   `lentille-tokens.json` (extension de contrat — propriété Fable, le
///   token est gelé).
/// - `pill.gap` (esquisse pré-token : `8`) — `thread.pill` ne porte que
///   `top`/`fadeDurationMs`/`dismissAfterMs`, aucun espacement interne à la
///   capsule. Repli : `8` (= `MeeshySpacing.sm`, coïncidence avec l'esquisse
///   pré-token documentée ici, pas une preuve qu'elle est correcte).
///   TODO CONTRACTUEL : ajouter `thread.pill.gap` si un futur consommateur
///   en a réellement besoin (aucun aujourd'hui — WS-2/F-081 a réutilisé
///   `MeeshySpacing.md`/`.xs` génériques pour le padding de la capsule,
///   faute justement de ce miroir).
///
/// **Hors périmètre de ce miroir** (constantes d'ALGORITHME, pas des cotes de
/// maquette `thread.*`) : `optimisticAlphaCeiling` (0.7, plafond du pass de
/// perspective WS-5 — WS-4 §7 : « la rangée NE pose PAS l'opacité ») et
/// `estimatedFlatRowHeight` (64, estimation du layout compositionnel WS-6).
/// Aucun des deux n'existe dans `thread.*` ; ni consommé ni testé par
/// WS-3/WS-4 (F-082/F-083) — à mirrorer par WS-5/WS-6 s'ils en ont besoin.
///
/// **Écarts de cote assumés vs l'esquisse PRÉ-TOKEN de §3.11** (le token gelé
/// fait foi — ne jamais réintroduire les valeurs pré-token ci-dessous) :
/// - `row.padding` : token `vertical 5 / horizontal 16` — l'esquisse pré-token
///   ne donnait qu'un `rowVerticalPadding = 4` (pas de valeur horizontale).
/// - `focusCard.padding` : token `horizontal 8 / vertical 12` — l'esquisse
///   pré-token inversait (`paddingV = 8, paddingH = 12`).
/// - `focusCard.margin` : token `horizontal 3 / vertical 8` — l'esquisse
///   pré-token ne donnait qu'un scalaire unique (`margin = 8`).
///
/// **Note d'isolation** : `nonisolated` sur le type, comme `LentilleMetrics`
/// — la cible `MeeshyTests` compile en `SWIFT_DEFAULT_ACTOR_ISOLATION:
/// nonisolated`, la cible `Meeshy` en `MainActor` (SE-0466). Toutes les
/// constantes ci-dessous sont des littéraux `CGFloat`/`Double` bruts (jamais
/// une référence directe à `MeeshySpacing`/`MeeshyRadius`, dont les membres
/// sont eux-mêmes potentiellement isolés dans la cible `MeeshyUI`) — même
/// choix que `LentilleMetrics`, qui n'y référence jamais ces types non plus.
/// Seules `Name.size`/`Text.size` (qui lisent `MeeshyFont.subheadSize`/
/// `.bodySize`) sont `@MainActor`, exactement comme `LentilleMetrics.Name`/
/// `.Line2`.
nonisolated public enum FocalMetrics {

    // MARK: - Rang

    /// `thread.row.padding` — `5/16` (contrat Lentille §4.3, colonne Fil).
    nonisolated public enum Row {
        public static let paddingVertical: CGFloat = 5
        public static let paddingHorizontal: CGFloat = 16
        /// Cote ABSENTE de `thread.*` — voir doc de tête (TODO CONTRACTUEL).
        /// 8 → 4 le 2026-08-21 (« réduit l'espace entre les groupes »).
        public static let groupTopPadding: CGFloat = 4
    }

    // MARK: - Avatar (pastille)

    /// `thread.avatar` — `22` (« pastille », description du token).
    nonisolated public enum Avatar {
        public static let size: CGFloat = 22
    }

    // MARK: - Nom · Heure

    /// `thread.name` — `13` poids `800` CSS → `.heavy`
    /// (`Font.Weight.extrabold` n'existe pas en SwiftUI,
    /// `focal-implementation-contract.md` §0).
    nonisolated public enum Name {
        @MainActor public static var size: CGFloat { MeeshyFont.subheadSize }
        public static let weight: Font.Weight = .heavy
        @MainActor public static var font: Font { MeeshyFont.relative(size, weight: weight) }
    }

    /// `thread.time` — `12` poids `600` CSS → `.semibold`.
    nonisolated public enum Time {
        public static let size: CGFloat = 12
        public static let weight: Font.Weight = .semibold
        public static var font: Font { MeeshyFont.relative(size, weight: weight) }
    }

    // MARK: - Texte du message

    /// `thread.line2` — texte `15`, interligne `1.42`, retrait `29`.
    nonisolated public enum Text {
        @MainActor public static var size: CGFloat { MeeshyFont.bodySize }
        public static let lineHeightRatio: CGFloat = 1.42
        /// `22` (pastille) + `7` (gouttière). Hors échelle `MeeshySpacing` —
        /// assumé, centralisé ici (contrat Focal §3.11).
        public static let indent: CGFloat = 29

        /// Interligne ADDITIF (SwiftUI `.lineSpacing` est en points, pas un
        /// ratio, contrat Focal §3.11) : ratio `1.42` sur une taille résolue
        /// `s` ⇒ `s * 0.42`, arrondi au demi-point.
        public static func lineSpacing(forResolvedFontSize s: CGFloat) -> CGFloat {
            (s * (lineHeightRatio - 1) * 2).rounded() / 2
        }
    }

    // MARK: - Carte de focus

    /// `thread.focusCard` — ring interne `1.5`, radius `16`, marge `3/8`
    /// (horizontal/vertical), padding `8/12` (horizontal/vertical — le
    /// token fait foi, voir doc de tête pour l'écart avec l'esquisse
    /// pré-token). Rendue par WS-5 (F-084), pas WS-3/WS-4 — mirrorée ici
    /// pour la parité EXHAUSTIVE `thread.*` exigée par la tâche 0.
    nonisolated public enum FocusCard {
        public static let ringSize: CGFloat = 1.5
        public static let radius: CGFloat = 16
        public static let marginHorizontal: CGFloat = 3
        public static let marginVertical: CGFloat = 8
        public static let paddingHorizontal: CGFloat = 8
        public static let paddingVertical: CGFloat = 12

        /// Opacité de la TEINTE D'ACCENT qui remplit la carte de focus.
        ///
        /// Cotes ABSENTES de `thread.focusCard` (qui ne décrit que la
        /// géométrie de l'anneau, jamais son remplissage) — nommées ici selon
        /// le précédent `SurfaceTint`, sans revendiquer de miroir `thread.*`.
        ///
        /// La carte se remplissait jusqu'ici de `backgroundSecondary`, un
        /// aplat OPAQUE et neutre : la couleur de la conversation ne survivait
        /// que sur l'anneau de 1,5 pt, et la rangée élue lisait comme une
        /// boîte posée sur le fil. Ces deux alphas rendent la teinte à la
        /// carte entière. Volontairement bas — le texte du message garde son
        /// contraste, aucune des mesures de `FocalPaletteContrastTests` ne
        /// s'exerce sur un fond teinté à ce point.
        public static let surfaceLightAlpha: CGFloat = 0.055
        public static let surfaceDarkAlpha: CGFloat = 0.10
    }

    // MARK: - Gabarit large de la rangée

    /// RETRAIT FOCAL iOS (2026-08-18) : la magnification de l'élue (§4.6) est
    /// partie avec le pass — restent les DEUX cotes de gabarit devenues la
    /// règle CONSTANTE de toutes les rangées : la hauteur d'en-tête et le
    /// retrait de texte ne varient jamais, la liste ne saute donc jamais.
    /// Tempo de la SCÈNE Focal (2026-08-21, directive user) : la perspective
    /// n'existe que pendant le défilement ; au repos, tout redevient Script.
    nonisolated public enum Scene {
        /// Repos sans geste avant que la scène s'aplatisse (« au bout de
        /// quelques secondes sans scroller ») — 2,0 → 4,5 s le 2026-08-22
        /// (directive « passe à < 5 s ») : avec `flattenDuration`, la
        /// magnificence a disparu en 4,95 s. Liste et fil lisent ce token.
        public static let restDelay: TimeInterval = 4.5
        /// Durée de l'aplatissement (transform + opacité + carte).
        public static let flattenDuration: TimeInterval = 0.45
        /// Durée de l'entrée en perspective au premier tick d'un geste —
        /// les ticks de cette fenêtre animent depuis la valeur présentée,
        /// jamais un saut.
        public static let enterDuration: TimeInterval = 0.25
    }

    nonisolated public enum Focus {
        /// Plafond de caractères du texte du message EN FOCUS (2026-08-21) :
        /// au-delà, « Lire plus » — une magnificence qui tient à l'écran.
        public static let maxCharacters: Int = 360

        /// Gabarit de pastille réservé en permanence par l'en-tête
        /// (`FocalIdentityHeader`, `minHeight`) — la pastille rendue reste
        /// `Avatar.size` (22) dans ce cadre de 34.
        public static let avatarSize: CGFloat = 34

        /// Le retrait CONSTANT de `FocalRow` — `avatarSize` + la même
        /// gouttière de `7` que `Text.indent` (`22 + 7 = 29`).
        public static let textIndent: CGFloat = avatarSize + 7
    }

    // MARK: - Citation

    /// `thread.quote` — filet `2.5`, couleur de l'auteur cité.
    nonisolated public enum Quote {
        public static let railWidth: CGFloat = 2.5
    }

    // MARK: - Médias

    /// `thread.media` — radius `16`.
    nonisolated public enum Media {
        public static let radius: CGFloat = 16
    }

    // MARK: - Chrome masqué au défilement

    /// `thread.hiddenChrome` — identique à `list.hiddenChrome` (même loi de
    /// chrome sur les deux écrans, `translateY(94)` + opacité 0,
    /// `easeOut .25`). Propriété WS-6 (hôte de défilement), branchée depuis
    /// le 2026-08-16 : `easeOut` cadence la disparition du header entier
    /// dans `ConversationView.swift`. `translateY` et `opacityEnd` restent
    /// mirrorées pour la parité EXHAUSTIVE `thread.*` de la tâche 0, sans
    /// consommateur à ce jour.
    /// Chips de la bordure basse du message en focus (2026-08-22 : « les
    /// icônes doivent être SUR la bordure, comme CATÉGORIE dans la liste »).
    nonisolated public enum FocusStrip {
        /// TOUTES les chips du focus (identité, date+coche, traduction,
        /// drapeaux, (+), réactions) = la MÊME capsule (2026-08-22 : « les
        /// icônes en bas doivent être exactement comme ces chips »).
        public static let chipHeight: CGFloat = 24
        public static let chipMinWidth: CGFloat = 32
        /// Inset des chips depuis le bord du bloc de contenu : le bloc est à
        /// `Row.paddingHorizontal − focusCardHorizontalInset` (10 pt) du bord
        /// de la carte, 4 pt de plus ⇒ 14 pt, comme l'encoche de la liste.
        public static let chipInset: CGFloat = 4
        /// Débord pour que le CENTRE des chips tombe sur la ligne de la
        /// carte : la carte (fond SwiftUI de la rangée, même repère que les
        /// chips) dépasse le bloc de contenu de `focusCardInnerMargin`.
        public static let overhang: CGFloat = chipHeight / 2 + FocalScrollPerspective.focusCardInnerMargin
        /// L'identité du message magnifié est la SEULE chip à dépasser le
        /// gabarit commun — « en plus agrandi simplement » (directive
        /// 2026-08-24). Elle porte désormais tout ce que porte l'en-tête de
        /// rangée (présence, mood, anneau de story, fantôme d'un visiteur sans
        /// compte) : au gabarit `chipHeight` de 24, rien de tout cela n'était
        /// lisible.
        public static let identityAvatarSize: CGFloat = 26
        public static let identityNameSize: CGFloat = 13.5
        /// Débord de l'identité — elle se pose ENTIÈREMENT au-dessus de la
        /// carte (directive 2026-08-24 : « en dehors de la bordure de la
        /// bulle, juste au-dessus »), et non plus à cheval sur sa ligne comme
        /// les chips. Sa hauteur est celle de sa pastille ; la carte dépasse
        /// déjà le bloc de `focusCardInnerMargin`, et 2 pt de jour achèvent de
        /// la détacher.
        public static let identityOverhang: CGFloat = identityAvatarSize + FocalScrollPerspective.focusCardInnerMargin + 2
    }

    nonisolated public enum HiddenChrome {
        public static let translateY: CGFloat = 94
        public static let opacityEnd: Double = 0
        public static let easeOut: Double = 0.25
        /// Course d'un composant de chrome vers SON bord quand il s'escamote
        /// (directive user 2026-08-21 : « disparaissent avec fondu vers les
        /// bords, réapparaissent venant du bord vers leur position »).
        public static let edgeTravel: CGFloat = 28
    }

    // MARK: - Pilule de défilement

    /// `thread.pill` — ancrée `top 72`, fondu `280 ms`. `top` est propriété
    /// WS-6 (positionnement de l'overlay par l'hôte) ; `fadeDuration` répare
    /// l'écart signalé par F-081 (`ScrollTimePillOverlay`, qui utilisait un
    /// fondu système faute de ce miroir).
    nonisolated public enum Pill {
        public static let top: CGFloat = 72
        public static let fadeDurationMs: Double = 280
        /// Secondes, pour `.easeInOut(duration:)`.
        public static var fadeDuration: Double { fadeDurationMs / 1000 }
        /// Cote ABSENTE de `thread.pill` — voir doc de tête (TODO CONTRACTUEL).
        public static let gap: CGFloat = 8

        // `dismissAfterMs` (900 ms dans le JSON) n'est délibérément PAS
        // mirroré ici — garde R15, même raison que `LentilleMetrics.Pill` :
        // c'est une constante de LOI (`ScrollTimePillLaw.lingerMs`,
        // `Focal/Core/`, GELÉ), pas un token de design. Dupliquer `900` ici
        // referait dériver deux sources de vérité.
    }

    // MARK: - Agent ✦ / rangée pont

    /// `thread.agent.row` — bord pointillé `1.5`, radius `14`.
    nonisolated public enum Agent {
        public static let borderWidth: CGFloat = 1.5
        public static let radius: CGFloat = 14
    }

    // MARK: - Méta discrète (opacité de texte translucide)

    /// Opacité du texte méta discret (heure de suite de groupe, libellé
    /// « modifié ») — **F-083ter**. `FocalMetaRow` utilisait `0.4`/`0.45`,
    /// une régression de contraste AA sur les DEUX thèmes (2,85:1 clair,
    /// 4,49:1 sombre — découverte par `FocalPaletteContrastTests`, F-090).
    ///
    /// **Écart calculé vs la consigne littérale « aligne sur `0.5`/`0.55` »**
    /// (RE-PREUVE avant écriture, signalé plutôt que suivi aveuglément) :
    /// `WCAGContrast.ratioOfTranslucentForeground(.black.opacity(0.5), on:
    /// #FFFFFF)` mesure **3,977:1** — SOUS le seuil AA `4.5:1` (calcul
    /// vérifié : la relation opacité→contraste n'est pas linéaire, la formule
    /// WCAG applique une courbe gamma sRGB). `0.5` est la valeur de
    /// `FocalIdentityHeader`/`BubbleFooter` en thème clair, MAIS ces deux-là
    /// portent déjà ce même déficit — documenté « préexistant, hors
    /// périmètre » par F-090 (le contrat ne demandait pas de le réparer).
    /// La consigne de CE lot exige que « les 2 tests passent » : priorité au
    /// résultat sur la valeur littérale suggérée. `0.55` clair mesure
    /// **4,759:1** (AA satisfait, calcul vérifié) ; `0.55` sombre mesure
    /// **6,261:1** (déjà largement conforme). Retenu : `0.55` pour LES DEUX
    /// thèmes — un seul palier au lieu de deux, plus simple, et
    /// `FocalIdentityHeader` (qui lit désormais CETTE MÊME constante,
    /// jamais un littéral concurrent) voit son propre déficit clair
    /// préexistant corrigé EN PRIME (effet secondaire positif, jamais
    /// demandé mais jamais une régression — 3,98:1 → 4,76:1).
    nonisolated public enum MetaText {
        public static let lightOpacity: Double = 0.55
        public static let darkOpacity: Double = 0.55
    }

    // MARK: - Teinte de surface neutre (cartes plates hors focus)

    /// Fond de carte neutre translucide — utilisé par les surfaces plates
    /// SANS bulle qui ont besoin d'une légère élévation visuelle (ex. rangée
    /// d'épisode du Résumé Vivant, `Focal/Summary/EpisodeListView.swift`).
    /// Nommée (F-083ter, garde R15 `check-law-literals.sh`) plutôt que
    /// laissée en littéral `0.04`/`0.06` orphelin dans un fichier de peau —
    /// AUCUNE cote de maquette `thread.*` ne porte cette valeur (ni dans le
    /// contrat Focal ni dans `lentille-tokens.json`) : c'est une teinte
    /// décorative interne au Résumé Vivant, pas une cote normative du fil,
    /// donc centralisée ici sans revendiquer de miroir `thread.*`.
    nonisolated public enum SurfaceTint {
        public static let lightFill: Double = 0.04
        public static let darkFill: Double = 0.06
    }

    // `FocusChip` a vécu ici quelques heures le 2026-08-22 : j'y avais nommé
    // les opacités de contour des chips de la carte de focus pour satisfaire la
    // garde R15. Le tronc avait fait le MÊME travail au même moment, dans
    // `FocalScrollPerspective` — c'est SA maison qui fait foi : deux domiciles
    // pour une même cote, c'est exactement ce que la garde R15 interdit.
    // Les contours eux-mêmes ont disparu le 2026-08-24 (« plus de cadre en
    // mode focal ») ; ce qui reste des chips — leur teinte de fond, marque de
    // l'état actif — vit toujours là-bas (`focusChipFillOpacity`).
}
