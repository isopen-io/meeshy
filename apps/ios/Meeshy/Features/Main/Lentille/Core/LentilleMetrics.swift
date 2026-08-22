import SwiftUI
import MeeshyUI

/// Cotes normatives du rang de la Lentille (contrat LWS-5, workshop
/// `tasks/lentille-implementation-contract.md` §4.3, colonne « Liste »).
///
/// **Domicile de vérité** : `packages/shared/design/lentille-tokens.json` →
/// `list`. Ce fichier en est le MIROIR Swift, pas une redéfinition libre —
/// `LentilleMetricsTests` fait la parité valeur par valeur contre ce JSON.
/// Toute vue de la Lentille lit ses cotes ICI ; aucune cote de rang liste ne
/// s'écrit en dur dans une vue (contrat §0, note « point accent 8 px »).
///
/// Trois écarts de design actés hors code (contrat §0) — RÉUTILISER, ne
/// jamais réintroduire un littéral concurrent :
/// - **avatar 44** → `AvatarContext.conversationHeaderCollapsed` (déjà 44pt),
///   pas de `.custom(44)`.
/// - **nom 15 extrabold** → `MeeshyFont.bodySize` (15pt) + poids `.heavy`
///   (`Font.Weight.extrabold` n'existe pas en SwiftUI).
/// - **point de non-lu 8px** → diamètre de design sans token existant
///   ailleurs ; vit ci-dessous, centralisé.
nonisolated public enum LentilleMetrics {

    // MARK: - Rang

    /// `list.row` — padding `10/16`, marge latérale `8`, radius `16`,
    /// `transform-origin: 16% 50%`.
    nonisolated public enum Row {
        /// 64 → 92 le 2026-08-22 : la rangée porte désormais TROIS lignes —
        /// nom, « auteur : message », puis la date seule à droite (retour
        /// produit : « en bas sur une nouvelle ligne à droite mettre la date »)
        /// — et, sur son bord bas, l'effectif. Le premier essai à 78 a été
        /// CONSTATÉ trop court sur simulateur : le contenu mesure ~78,6 pt à la
        /// taille de texte par défaut, si bien que la pile d'effectif sortait
        /// sous la rangée suivante et que la date passait dessous.
        public static let height: CGFloat = 92
        /// Distance du badge de bord (effectif) au bord bas de la rangée : il
        /// se pose SUR la trace que la bordure de la carte y dessinera, sans
        /// jamais sortir du cadre — dehors, il mordait la rangée voisine et s'y
        /// faisait tronquer (constaté au premier essai, débord de 6 pt).
        public static let edgeBadgeOverhang: CGFloat = 2
        public static let paddingVertical: CGFloat = 8
        public static let paddingHorizontal: CGFloat = 16
        public static let marginHorizontal: CGFloat = 8
        public static let radius: CGFloat = 16
        /// Fraction `[0, 1]` de la largeur du rang — pivot du zoom/scale au
        /// défilement (perspective LWS-8). CSS `16%`.
        public static let transformOriginX: CGFloat = 0.16
        /// CSS `50%`.
        public static let transformOriginY: CGFloat = 0.5
    }

    // MARK: - Avatar

    /// `list.avatar` — taille `44`, anneau `1.5` à l'accent (55 % d'opacité).
    nonisolated public enum Avatar {
        /// §0 — inutile de créer un `.custom(44)` : ce contexte vaut déjà
        /// 44pt (`MeeshyAvatar.swift`). Le rang Lentille RÉUTILISE ce
        /// contexte ; `.conversationList` (52pt) reste au rang historique.
        public static let context: AvatarContext = .conversationHeaderCollapsed
        @MainActor public static var size: CGFloat { context.size }
        public static let ringWidth: CGFloat = 1.5
        public static let ringOpacity: Double = 0.55
    }

    // MARK: - Dot de présence

    /// `list.presenceDot` — `11`, bordure `2.5` couleur de fond. Aucun dot
    /// hors ligne (règle produit 1/3/5, cf. CLAUDE.md racine — pas une cote).
    nonisolated public enum PresenceDot {
        public static let size: CGFloat = 11
        public static let borderSize: CGFloat = 2.5
    }

    // MARK: - Nom · Heure · Ligne 2

    /// `list.name` — `15` poids `800` CSS. `Font.Weight.extrabold` n'existe
    /// pas en SwiftUI (§0) : `800` rend `.heavy` sur l'échelle SwiftUI
    /// (100=ultraLight … 700=bold, 800=heavy, 900=black).
    nonisolated public enum Name {
        @MainActor public static var size: CGFloat { MeeshyFont.bodySize }
        public static let weight: Font.Weight = .heavy
        @MainActor public static var font: Font { MeeshyFont.relative(size, weight: weight) }
    }

    /// `list.time` — `12`, poids `700` CSS → `.bold`.
    nonisolated public enum Time {
        public static let size: CGFloat = 12
        public static let weight: Font.Weight = .bold
        public static var font: Font { MeeshyFont.relative(size, weight: weight) }
    }

    /// `list.line2` — `13`, poids régulier (non spécifié par la maquette).
    nonisolated public enum Line2 {
        @MainActor public static var size: CGFloat { MeeshyFont.subheadSize }
        public static let weight: Font.Weight = .regular
        @MainActor public static var font: Font { MeeshyFont.relative(size, weight: weight) }
    }

    // MARK: - Point de non-lu

    /// `list.unreadDot` — `8`, couleur accent. §0 : diamètre de design, pas
    /// un token repris d'ailleurs — sa seule maison est ici.
    nonisolated public enum UnreadDot {
        public static let size: CGFloat = 8
    }

    // MARK: - Carte de focus

    /// `list.focusCard` — fond `bg2` + ring INTERNE `1.5` accent, radius `16`.
    nonisolated public enum FocusCard {
        public static let ringSize: CGFloat = 1.5
        public static let radius: CGFloat = 16
        /// Carte MAGNIFIÉE (2026-08-21, accentuée le 22 : « une marge plus
        /// importante et un padding suffisant en haut et en bas ») : déborde
        /// de la rangée (64) de 20 pt de chaque côté — la loupe — sans
        /// toucher la hauteur des rangées ; aperçu sur DEUX lignes.
        /// 104 → 124 le 2026-08-22 : la carte loge les mêmes trois lignes que
        /// la rangée, avec un aperçu qui coule sur deux lignes.
        public static let height: CGFloat = 124
        public static let paddingVertical: CGFloat = 14
        /// Avatar de la carte = le contexte « liste » historique (52), un cran
        /// au-dessus de la rangée plate (44) : c'est la magnification.
        public static let avatarContext: AvatarContext = .conversationList
        public static let nameSize: CGFloat = 17
        @MainActor public static var nameFont: Font { MeeshyFont.relative(nameSize, weight: Name.weight) }
        public static let shadowRadius: CGFloat = 12
        public static let shadowY: CGFloat = 4
        /// Ombre de la carte — nommée ici (`Core/`) : `0.35` est un littéral
        /// de loi interdit en dur dans les fichiers de peau.
        public static let shadowOpacityDark: Double = 0.35
        public static let shadowOpacityLight: Double = 0.12
        /// Respiration (2026-08-22, « le triple de l'espace actuel ») : les
        /// rangées voisines s'écartent de la ligne de focus de ce montant
        /// pendant la scène — translation de compositor, zéro relayout.
        /// 18 → 30 le 2026-08-22 : les chips d'étiquettes qui débordent
        /// sous la carte gardent une marge avec la rangée suivante.
        /// **30 → 18 le 2026-08-22 (soir)** : ce n'était pas une respiration,
        /// c'était un DÉGAGEMENT creusé pour la décoration qui débordait — et
        /// il est ANIMÉ, donc les trous s'ouvraient et se refermaient pendant
        /// le défilement. C'est la moitié « espaces compliqués » du retour
        /// produit. La cause retirée (bord bas désencombré), la valeur revient.
        public static let breathing: CGFloat = 18
        /// Rampe : nulle jusqu'à une demi-rangée (la rangée élue ne bouge
        /// pas), pleine une rangée plus loin — jamais de saut au passage.
        public static let breathingRampStart: CGFloat = 36
        public static let breathingRampLength: CGFloat = 40
    }

    // MARK: - Encoche de mode

    /// `list.modeNotch` — `9.5` poids `900` CSS → `.black`, ancrée
    /// `top -9`, `right 14`.
    nonisolated public enum ModeNotch {
        public static let size: CGFloat = 9.5
        public static let weight: Font.Weight = .black
        public static let top: CGFloat = -9
        public static let right: CGFloat = 14
    }

    // MARK: - Sticker de section

    /// `list.sticker` — `10.5` poids `800` CSS → `.heavy`, letter-spacing
    /// `.1em`, majuscules, padding `4/13`, sticky.
    nonisolated public enum Sticker {
        public static let size: CGFloat = 10.5
        public static let weight: Font.Weight = .heavy
        public static let letterSpacingEm: CGFloat = 0.1
        public static let paddingVertical: CGFloat = 4
        public static let paddingHorizontal: CGFloat = 13
    }

    // MARK: - Pilule de défilement

    /// `list.pill` — ancrée `top 64`, fondu `250 ms`.
    nonisolated public enum Pill {
        public static let top: CGFloat = 64
        public static let fadeDurationMs: Double = 250
        // `dismissAfterMs` (900 ms dans le JSON) n'est délibérément PAS
        // mirroré ici : c'est une constante de LOI, pas un token de design
        // (garde R15, contrat §4.3/§0 — « le 900 ms vient de la LOI
        // partagée pas d'ici »). Domicile unique :
        // `packages/shared/utils/scroll-activity.ts` →
        // `SCROLL_ACTIVITY_LINGER_MS`. Le miroir Swift de cette loi (LWS-0,
        // hors périmètre de ce fichier — Lentille/Core possédé par LWS-5
        // couvre uniquement les métriques) fournit la valeur d'exécution ;
        // dupliquer `900` ici referait dériver deux sources de vérité.
    }

    // MARK: - Rail vivants & stories

    /// `list.rail` — pastille `48`, anneau `3.5` (pulsé si live), `≤ 6` entrées.
    nonisolated public enum Rail {
        public static let size: CGFloat = 48
        public static let ringWidth: CGFloat = 3.5
        public static let maxEntries: Int = 6
    }

    // MARK: - Tags / favori

    /// `list.tags` — pastilles `6` (`≤ 3`), émoji favori `11`.
    nonisolated public enum Tags {
        public static let size: CGFloat = 6
        public static let maxCount: Int = 3
        public static let emojiSize: CGFloat = 11
        /// Chips d'étiquettes de la carte de focus (2026-08-22 : « plus
        /// petites ») — un cran sous l'encoche de mode.
        public static let chipFontSize: CGFloat = 8
        public static let chipPaddingHorizontal: CGFloat = 6
        public static let chipPaddingVertical: CGFloat = 2
    }

    // MARK: - Sourdine

    /// `list.muted` — rang à `0.55` d'opacité.
    nonisolated public enum Muted {
        public static let opacity: Double = 0.55
    }

    // MARK: - Agent ✦

    /// `list.agent` — avatar en pointillé `1.5` (trait plein = humain).
    nonisolated public enum Agent {
        public static let avatarRingWidth: CGFloat = 1.5
    }
}
