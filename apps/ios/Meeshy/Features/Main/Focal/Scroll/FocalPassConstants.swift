import CoreGraphics

/// **Le domicile UNIQUE des cotes d'algorithme du pass de perspective (§4)
/// que ni le miroir gelé ni le token de design ne portent.**
///
/// Règle du chantier (garde R15) : une constante de loi ne se pose jamais en
/// dur dans une vue ou dans un pass. Elle vient
/// 1. du miroir GELÉ `Focal/Core/FocalFocusCurve.swift` (courbe, bande,
///    hystérésis) — jamais réécrit, jamais dupliqué ; ou
/// 2. de `Focal/Core/FocalMetrics.swift` (cotes de maquette `thread.*` de
///    `packages/shared/design/lentille-tokens.json`) ; ou
/// 3. à défaut, de CE fichier — un seul, documenté, avec son TODO contractuel.
///
/// **RE-PREUVE (§0, faite avant écriture)** — aucune des valeurs ci-dessous
/// n'existe ailleurs :
/// - `lentille-tokens.json` → `thread.*` ne porte QUE `row`, `avatar`, `name`,
///   `time`, `line2`, `focusCard`, `quote`, `media`, `hiddenChrome`, `pill`,
///   `agent` (dump exhaustif rejoué à l'ouverture de F-084). Aucune entrée de
///   bande de focus, de plafond d'alpha ni d'inset de tête.
/// - `FocalFocusCurve` (GELÉ) porte `threadMaxDistance`, `threadScaleDecay`,
///   `threadAlphaDecay`, `focusBandOffset`, `focusBandHalfHeight` — et rien
///   d'autre côté fil.
/// - `FocalMetrics` (F-082, FIGÉ) a explicitement laissé
///   `optimisticAlphaCeiling` et `estimatedFlatRowHeight` HORS de son miroir
///   (« constantes d'ALGORITHME, pas des cotes de maquette `thread.*` … à
///   mirrorer par WS-5/WS-6 s'ils en ont besoin »). WS-5 en a besoin : les
///   voici, ici, et nulle part ailleurs.
///
/// **TODO CONTRACTUEL (propriété Fable — le token et les miroirs sont gelés)** :
/// remonter ces cinq valeurs dans `lentille-tokens.json` → `thread.focusBand`
/// / `thread.optimistic`, puis les mirrorer dans `FocalMetrics` et supprimer
/// ce fichier. Tant que l'extension n'est pas actée, ce fichier est la source
/// de vérité — et il est la SEULE : aucun autre fichier de `Focal/Scroll/` ne
/// contient de littéral numérique de loi (garde
/// `FocalScrollPassSourceGuardTests`).
nonisolated enum FocalPassConstants {

    // MARK: - Plafond d'alpha (§4.4)

    /// Plafond d'opacité d'une rangée OPTIMISTE (message en vol, pas encore
    /// accusé par le gateway) : `alpha = min(0.7, alphaPerspective)`.
    ///
    /// Vit dans le **descripteur** fourni par WS-6, jamais dans la rangée :
    /// `cell.alpha` appartient au pass, et deux écrivains sur la même
    /// propriété est le bug n°1 de ce chantier (§4.4). `FocalRow` (WS-4) ne
    /// pose donc AUCUNE opacité — vérifié F-083.
    ///
    /// TODO CONTRACTUEL : `thread.optimistic.alphaCeiling` absent du token.
    static let optimisticAlphaCeiling: CGFloat = 0.7

    /// Plafond d'une rangée confirmée — l'opacité pleine. Nommé plutôt que
    /// posé en `1` littéral aux sites d'appel : le descripteur de WS-6 en a
    /// besoin comme valeur par défaut, et un `1` anonyme dans une vue se lit
    /// « opacité arbitraire » au lieu de « plafond neutre ».
    static let opaqueAlphaCeiling: CGFloat = 1

    // La LOUPE positionnelle (spec Magnificence 2026-08-17 : pic 1.18,
    // rayon demi-bande, plafond 48 pt, élévation zPosition) et le plancher
    // `neighbourAlphaFloor` (mort depuis le retrait du fondu) sont RETIRÉS
    // 2026-08-18 : la spec « Focal Grandeur Nature » §5, réancrée comme
    // contrat, ne connaît qu'une échelle ≤ 1 et le fondu de la courbe gelée
    // (plancher 0.18 par construction). Voir `FocalPerspectiveGeometry`.

    // MARK: - ESSAI VISUEL — bande de focus au CENTRE (demande user 2026-08-18)

    /// `true` ⇒ la ligne de focus vit au CENTRE du viewport
    /// (`H · centeredBandRatio` depuis le bas) au lieu du « bas − 150 » de la
    /// spec §5. La moitié estompée se réduit de ~80 % à ~50 % de l'écran —
    /// c'est l'hypothèse à juger à l'œil. Même patron d'interrupteur que
    /// `FocalFocusDecoration.drawsFocusCard` : l'essai se REVERT en une ligne
    /// (`false` ⇒ spec §5 bit-à-bit). Le clavier garde la priorité : la bande
    /// remonte toujours au-dessus de `composeur + bandGap` quand celui-ci
    /// dépasse le centre.
    static let centersFocusBand = true

    /// Fraction du viewport, mesurée depuis le BAS, où vit la ligne de focus
    /// pendant l'essai. `0.5` = centre géométrique.
    static let centeredBandRatio: CGFloat = 0.5

    // MARK: - Bande de focus (§4.3)

    /// Marge minimale entre la ligne de focus et le haut du composeur, dans
    /// `focusY = H − max(bandLift, contentInset.top + bandGap)`.
    ///
    /// Le `bandLift` (plancher) vient du miroir de la bande du FIL
    /// (`FocalFocusCurve.threadFocusBandOffset` = 150, spec §5 — arbitrage
    /// 150/140 clos 2026-08-18). Le `bandGap`, lui, n'existe nulle part :
    /// il est ici.
    ///
    /// TODO CONTRACTUEL : `thread.focusBand.gap` absent du token.
    static let bandGap: CGFloat = 8

    // MARK: - Inset de tête (§4.5)

    /// Borne haute de `headInset`, en fraction de la hauteur du viewport :
    /// `clamp(0, H · headInsetMaxRatio, …)`. Empêche un fil d'une seule
    /// rangée d'ouvrir un gouffre de défilement au-dessus d'elle.
    ///
    /// TODO CONTRACTUEL : `thread.focusBand.headInsetMaxRatio` absent du token.
    static let headInsetMaxRatio: CGFloat = 0.8

    // MARK: - Atterrissage (§4.7, critère d'acceptation §WS-6)

    /// Tolérance d'atterrissage : après `scrollToMessage(Fast)`, le critère
    /// §WS-6 exige `|visualMidY(cible) − focusY| ≤ 8`. Déclarée ici pour que
    /// WS-6 et ses tests la lisent au même endroit que le calcul d'offset
    /// (`FocalPerspectiveGeometry.landingContentOffsetY`) — deux `8` recopiés
    /// dériveraient au premier ajustement.
    ///
    /// Sémantiquement DISTINCTE de `bandGap` malgré la valeur commune : l'une
    /// est un dégagement de composeur, l'autre une tolérance de mesure.
    ///
    /// TODO CONTRACTUEL : `thread.focusBand.landingTolerance` absent du token.
    static let landingTolerance: CGFloat = 8

    // MARK: - Atterrissage d'élection (§4.7bis — zone d'activation sans conflit)

    /// Dégagement entre le bord BAS visuel du message élu et le haut du
    /// composeur, une fois le défilement posé. C'est la définition de la
    /// zone d'activation demandée : « plus du tout en conflit avec la zone
    /// de saisie » — l'élu atterrit ENTIER au-dessus du composeur, ses
    /// contrôles de bord compris.
    ///
    /// Sémantiquement distinct de `bandGap` (position de la LIGNE de focus)
    /// et de `landingTolerance` (tolérance de mesure §WS-6) : celui-ci borne
    /// un BORD de cellule, pas un centre.
    ///
    /// TODO CONTRACTUEL : `thread.focusBand.settleGap` absent du token.
    static let settleGap: CGFloat = 12

    // MARK: - Flash d'atterrissage (§4.7)

    /// Cadences du flash de recherche. Reprises **verbatim** du `flashCell`
    /// existant (`MessageListViewController.swift:1344-1347`, relu à
    /// l'ouverture de F-084) pour que l'atterrissage garde EXACTEMENT son
    /// tempo actuel — seul son support change : une décoration `CALayer`
    /// dédiée au lieu de `cell.alpha`/`cell.transform`, que le pass est seul
    /// à écrire (§4.7 « flashCell réécrit »).
    ///
    /// TODO CONTRACTUEL : aucune de ces cadences n'est un token ; si le design
    /// les revendique un jour, `thread.focusCard.flash.*`.
    nonisolated enum Flash {
        /// Délai avant le flash — laisse le défilement programmatique se poser.
        static let delay: Double = 0.35
        static let strongDelay: Double = 0.25
        /// Montée du surlignage.
        static let riseDuration: Double = 0.18
        static let strongRiseDuration: Double = 0.15
        /// Retour au repos.
        static let fallDuration: Double = 0.22
        static let strongFallDuration: Double = 0.25

        /// Opacité de crête du surlignage.
        ///
        /// **Dérivation honnête** : l'ancien `flashCell` faisait CHUTER
        /// `cell.alpha` à `0.4` (normal) / `0.2` (fort) — il retirait donc
        /// `0.6` / `0.8` de présence, le « fort » étant le plus marqué. La
        /// décoration inverse le support (elle AJOUTE un surlignage au lieu de
        /// retirer de l'opacité) : la crête reprend la quantité retirée,
        /// ce qui préserve à la fois l'intensité relative et l'ordre
        /// normal < fort. Aucun nombre neuf n'a été inventé.
        static let peakOpacity: Float = 0.6
        static let strongPeakOpacity: Float = 0.8
    }
}
