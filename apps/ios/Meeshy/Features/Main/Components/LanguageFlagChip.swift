import SwiftUI
import MeeshySDK   // `LanguageData` (78 langues) — `LanguageDisplay` vit dans MeeshyUI, pas elle.
import MeeshyUI

/// **Le drapeau qui change la langue lue — une seule fois pour huit surfaces.**
///
/// Le Prisme Linguistique donne à l'utilisateur le droit d'explorer les autres
/// langues d'un contenu « via un geste naturel ». Sur iOS ce geste est TOUJOURS
/// le même : une rangée de drapeaux, celui qu'on lit souligné de sa couleur de
/// langue. Huit implémentations de cette rangée coexistaient — le même
/// `VStack(spacing: 1) { Text(drapeau) ; RoundedRectangle(…).frame(width: 10,
/// height: 1.5) }`, recopié — et **chacune n'avait raison que sur un tiers du
/// contrôle** :
///
/// | surface | contrôle | cible | nom lu | état lu |
/// |---|---|---|---|---|
/// | `BubbleFooter` (bulle) | `Button` + `contentShape` | 22 pt, servie | nom de langue seul | trait seul |
/// | `FeedCommentsSheet` ×2 | `onTapGesture` | `meeshyTapTarget(44)` **après** le geste | ✅ | ✅ |
/// | `PostDetailView` (post) | `onTapGesture` | `meeshyTapTarget(44)` **après** le geste | ✅ | ✅ |
/// | `PostDetailView` (repartage) | `onTapGesture` | — | ❌ | ❌ |
/// | `FeedPostCard` | `onTapGesture` | — | ✅ | ❌ |
/// | `StoryViewerView+Content` ×2 | `onTapGesture` | — | ❌ | ❌ |
/// | `ReelsPlayerView` | `Button` + `contentShape` | — | nom de langue seul | ❌ |
///
/// La seule qui avait raison sur le CONTRÔLE et la CIBLE est celle du pied de
/// bulle — la plus ancienne, la plus utilisée, et celle dont le doc-comment
/// expliquait déjà pourquoi un `onTapGesture` n'y marcherait pas. Ce qu'elle
/// savait n'avait voyagé vers aucune des sept autres.
///
/// Trois enseignements, portés ici une fois pour toutes :
///
/// 1. **Un agrandissement de cible posé APRÈS le geste qu'il doit agrandir est
///    au mieux fragile.** `contentShape` définit la zone sensible de la vue à
///    laquelle il s'applique ; l'idiome SwiftUI l'écrit donc AVANT
///    `onTapGesture`, jamais après. Ici la question ne se pose plus : c'est un
///    `Button`, dont la zone sensible EST le cadre de son label.
/// 2. **Un `onTapGesture` n'est pas un contrôle.** Il faut lui rajouter à la
///    main le trait `.isButton`, et il reste hors du clavier complet, du
///    pointeur iPad et des styles de bouton. Un `Button` les donne tous.
/// 3. **L'état actif ne tenait qu'à la COULEUR et à la TAILLE** — un
///    soulignement de 1,5 pt et un corps de 12 au lieu de 10. C'est WCAG 1.4.1,
///    le défaut que 242i a nommé sur la barre d'étapes de l'inscription. Il se
///    dit maintenant en toutes lettres, par `accessibilityValue` et par le
///    trait `.isSelected`.
///
/// ### La cible suit la rangée, et une seule rangée ne peut pas porter 44 pt
///
/// `.standard` sert les 44 pt de la HIG — c'est la règle du dépôt, et les
/// rangées méta du fil, du détail et des commentaires les hébergent (deux
/// d'entre elles les déclaraient déjà). `.overlay` s'arrête à 32 pt : l'entête
/// d'un commentaire de story empile ses lignes par-dessus la vidéo — 44 pt y
/// coûteraient 30 pt de hauteur PAR commentaire — et la rangée d'un reel flotte
/// sur un tap qui pilote la lecture.
///
/// Ce qu'on ne fait PAS pour gagner ces 12 pt : élargir par un `padding`
/// négatif. Deux puces espacées de 4 pt verraient alors leurs zones sensibles
/// se CHEVAUCHER, et une frappe imprécise changerait la langue lue pour une
/// AUTRE que celle visée — pire que le défaut corrigé, qui ne faisait rien.
struct LanguageFlagChip: View {

    /// La typographie du drapeau suit la surface qui l'accueille — c'est la
    /// seule différence légitime entre les huit copies soldées ici. Le CONTRAT
    /// (cible, nom, état, contrôle natif) ne varie jamais.
    enum Metrics {
        /// Rangées méta en ligne (fil, détail d'une publication, commentaires)
        /// — les seules qui peuvent héberger les 44 pt de la HIG.
        case standard
        /// Pied d'une bulle de message : la rangée la plus dense du produit
        /// (horodatage, coches de remise, badge de rôle, pastille translate).
        /// Sa cible de 22 pt est une décision documentée du pied de bulle, pas
        /// un oubli — l'élargir grandirait CHAQUE bulle traduite.
        case compact
        /// Superpositions au-dessus d'une VIDÉO — entête d'un commentaire de
        /// story, rangée méta d'un reel. Deux raisons de s'arrêter à 32 pt :
        /// l'entête de story empile ses lignes, et le tap de la vidéo pilote la
        /// lecture — une bande de 44 pt le lui prendrait.
        case overlay

        func flagFont(isActive: Bool) -> Font {
            switch self {
            case .standard, .compact:
                return isActive ? .caption : .caption2
            case .overlay:
                return MeeshyFont.relative(isActive ? 12 : 10)
            }
        }

        /// Côté de la zone sensible, en points. Voir « La cible suit la
        /// rangée » ci-dessus.
        var hitSide: CGFloat {
            switch self {
            case .standard: return 44
            case .overlay:  return 32
            case .compact:  return 22
            }
        }
    }

    /// Géométrie du soulignement d'état. Les huit copies écrivaient 10×1,5 sauf
    /// une (8×1,5, sur le repartage) — un écart sans intention.
    private static let underlineWidth: CGFloat = 10
    private static let underlineHeight: CGFloat = 1.5

    let code: String
    let isActive: Bool
    var metrics: Metrics = .standard
    let action: () -> Void

    var body: some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            VStack(spacing: 1) {
                Text(Self.flag(for: code))
                    .font(metrics.flagFont(isActive: isActive))
                    .scaleEffect(isActive ? 1.05 : 1.0)
                if isActive {
                    RoundedRectangle(cornerRadius: 1)
                        .fill(Color(hex: LanguageDisplay.colorHex(for: code)))
                        .frame(width: Self.underlineWidth, height: Self.underlineHeight)
                }
            }
            .meeshyAnimation(.easeInOut(duration: 0.2), value: isActive)
            .frame(minWidth: metrics.hitSide, minHeight: metrics.hitSide)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        // Pas de `accessibilityElement(children: .ignore)` : un `Button` EST
        // déjà un élément unique porteur du trait `.isButton`, et le poser
        // par-dessus reconstruit un élément qui peut perdre ce trait. Les copies
        // qui le posaient en avaient besoin : ce n'étaient pas des contrôles.
        .accessibilityLabel(Self.spokenLabel(for: code))
        .accessibilityValue(isActive ? Self.shownValue() : "")
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }

    // MARK: - Vocabulaire

    /// Le drapeau, ou le CODE en capitales quand la langue n'est pas au
    /// catalogue de `LanguageDisplay`.
    ///
    /// Les huit copies servaient deux replis pour une seule situation : `"?"`
    /// (six puces) ou le code (quatre). Un point d'interrogation ne dit rien à
    /// personne ; « JA » se lit, se reconnaît et s'annonce. Le `"?"` ne reste
    /// que pour le cas où il n'y a **rien** à dire — aucun code du tout, ce
    /// qu'une source optionnelle peut rendre.
    /// **Deux tables, dans cet ordre — et la seconde n'est pas un luxe.**
    ///
    /// `LanguageDisplay` porte 41 langues, avec la couleur dont la puce a
    /// besoin ; `LanguageData` en porte **78**, dont l'écrasante majorité des
    /// langues africaines et sud-asiatiques du produit (wolof, yoruba, igbo,
    /// persan, ourdou, tamoul, serbe…) et les alias (`fil` → `tl`).
    ///
    /// Le 252i (#4260) a failli livrer la régression que cet ordre empêche :
    /// `FocalRow` lisait `LanguageData`, et le router vers une source unique
    /// qui n'aurait lu que `LanguageDisplay` aurait rendu « WO » là où la
    /// rangée montrait 🇸🇳 — silencieusement, pour 39 langues, et seulement
    /// chez les locuteurs concernés. **Une source unique doit être plus riche
    /// que la plus riche des copies qu'elle remplace, jamais leur
    /// intersection.**
    /// Le troisième essai — la NORMALISATION — vient en dernier et ne change
    /// rien à ce que #4248 a testé (`"xx"` → `"XX"`, `""` → `"?"`) : il ne
    /// s'exerce que sur les codes RÉGIONAUX, `pt-BR` ou `zh-Hans`, qu'aucune
    /// table n'indexe tels quels et que toutes deux servent sous leur base.
    nonisolated static func flag(for code: String) -> String {
        if let flag = LanguageDisplay.from(code: code)?.flag { return flag }
        if let flag = LanguageData.info(for: code.lowercased())?.flag { return flag }
        if let base = MeeshyUser.normalizeLanguageCode(code) {
            if let flag = LanguageDisplay.from(code: base)?.flag { return flag }
            if let flag = LanguageData.info(for: base)?.flag { return flag }
        }
        return Self.rawName(for: code) ?? "?"
    }

    nonisolated private static func rawName(for code: String) -> String? {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed.uppercased()
    }

    /// « Afficher en Français ».
    ///
    /// Un drapeau seul se prononce « drapeau de la France » sous VoiceOver —
    /// c'est-à-dire un PAYS, pas une action ni une langue. Le nom du contrôle
    /// dit donc ce que l'appui fait, avec le nom natif de la langue.
    static func spokenLabel(for code: String,
                            bundle: Bundle = .main,
                            locale: Locale = .current) -> String {
        let name = Self.spokenName(for: code)
        return String(
            format: String(localized: "a11y.language.show",
                           defaultValue: "Afficher en %@",
                           bundle: bundle,
                           locale: locale),
            name
        )
    }

    /// « Traduit de English vers Français ».
    ///
    /// Une paire de drapeaux NON interactive — l'aperçu d'un commentaire dans le
    /// fil — dit à l'œil « ce texte a été traduit, de là vers ici ». À VoiceOver
    /// elle disait deux PAYS : « drapeau du Royaume-Uni, drapeau de la France ».
    /// Les deux glyphes et la pastille qui les suit ne forment qu'UNE
    /// information ; ils s'annoncent donc en une phrase, et une seule.
    static func translationSummary(from origin: String,
                                   to target: String,
                                   bundle: Bundle = .main,
                                   locale: Locale = .current) -> String {
        String(
            format: String(localized: "a11y.language.translated_from",
                           defaultValue: "Traduit de %1$@ vers %2$@",
                           bundle: bundle,
                           locale: locale),
            spokenName(for: origin), spokenName(for: target)
        )
    }

    /// Le nom NATIF de la langue, ou son code faute de mieux — le même repli que
    /// `flag(for:)`, pour que l'écrit et le parlé ne divergent jamais.
    /// Même ordre que `flag(for:)`, pour la même raison : ce que VoiceOver
    /// PRONONCE doit couvrir les 78 langues, pas les 41. Sans la seconde table,
    /// un lecteur wolof entendait « Afficher en WO ».
    nonisolated static func spokenName(for code: String) -> String {
        if let name = LanguageDisplay.from(code: code)?.name { return name }
        if let name = LanguageData.info(for: code.lowercased())?.nativeName { return name }
        if let base = MeeshyUser.normalizeLanguageCode(code) {
            if let name = LanguageDisplay.from(code: base)?.name { return name }
            if let name = LanguageData.info(for: base)?.nativeName { return name }
        }
        return Self.rawName(for: code) ?? Self.flag(for: code)
    }

    /// La valeur du contrôle quand c'est CETTE langue qu'on lit.
    ///
    /// Elle est vide sinon : une valeur « Non affichée » sur chacune des trois
    /// puces inactives ferait lire trois fois une information que le lecteur
    /// déduit de la seule puce qui en porte une.
    static func shownValue(bundle: Bundle = .main,
                           locale: Locale = .current) -> String {
        String(localized: "a11y.language.shown",
               defaultValue: "Affichée",
               bundle: bundle,
               locale: locale)
    }
}

/// **La pastille « translate » qui accompagne la rangée de drapeaux.**
///
/// Elle existe sous deux formes, et le dépôt les mélangeait : sur une
/// publication elle OUVRE la liste des langues ; partout ailleurs elle ne fait
/// qu'annoncer « ce contenu est traduit », doublant une information que les
/// drapeaux voisins portent déjà.
///
/// Deux des copies décoratives oubliaient `accessibilityHidden` — VoiceOver
/// s'arrêtait alors sur une image sans nom au milieu d'une ligne d'entête. La
/// forme le dit maintenant : **pas d'action ⇒ pas d'élément d'accessibilité.**
struct TranslationsBadge: View {
    var metrics: LanguageFlagChip.Metrics = .standard
    /// `nil` ⇒ pastille purement décorative, retirée de l'arbre
    /// d'accessibilité.
    var action: (() -> Void)?

    var body: some View {
        if let action {
            Button {
                HapticFeedback.light()
                action()
            } label: {
                glyph
                    .frame(minWidth: metrics.hitSide, minHeight: metrics.hitSide)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "a11y.post.translations",
                                       defaultValue: "Traductions", bundle: .main))
            .accessibilityHint(String(localized: "a11y.post.translations.hint",
                                      defaultValue: "Affiche les langues disponibles",
                                      bundle: .main))
        } else {
            glyph.accessibilityHidden(true)
        }
    }

    private var glyph: some View {
        Image(systemName: "translate")
            .font(metrics.flagFont(isActive: false).weight(.medium))
            .foregroundColor(MeeshyColors.indigo400)
    }
}

// MARK: - Le VOCABULAIRE, pour les sites qui ne peuvent pas prendre la VUE

/// **Une source unique de CONTRÔLE a deux moitiés : la vue et le vocabulaire.**
///
/// `LanguageFlagChip` est un `Button`. Un site qui rend déjà son drapeau dans
/// son propre bouton — la bande magnifiée de `FocalRow`, dont la puce porte un
/// fond `focusChip` que la vue partagée ne dessine pas — ne peut pas l'adopter
/// sans imbriquer un bouton dans un bouton. Il lui reste à dire la MÊME chose :
/// le drapeau produit par la même table avec le même repli, l'étiquette
/// d'ACTION plutôt que le nom nu, l'état porté par un trait plutôt que par la
/// seule apparence.
///
/// Ce modificateur est cette moitié-là. Sans lui, chaque site qui garde son
/// dessin ré-écrit trois lignes d'accessibilité — et c'est très exactement
/// ainsi que les copies 9 et 10 ont divergé (252i, #4260) : elles disaient
/// « Français » là où la source unique dit « Afficher en Français », et ne
/// disaient rien du tout de l'état actif.
extension View {
    func languageFlagAccessibility(code: String, isActive: Bool) -> some View {
        self
            .accessibilityLabel(LanguageFlagChip.spokenLabel(for: code))
            .accessibilityValue(isActive ? LanguageFlagChip.shownValue() : "")
            .accessibilityAddTraits(isActive ? .isSelected : [])
    }
}
