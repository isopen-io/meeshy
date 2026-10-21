import SwiftUI
import MeeshySDK

/// Libellés de la surface document, résolus par le catalogue `.main` — même
/// idiome que `ComposerFormatCopy`. Un libellé posé en littéral dans la vue
/// échappe au cliquet de complétude et n'est jamais traduit.
nonisolated enum ComposerDocumentCopy {

    /// Le placeholder n'a pas de clé neuve : c'est CELLE de la feuille
    /// historique. Deux clés pour la même phrase, c'est deux traductions à
    /// faire diverger, et la surface est censée l'absorber, pas la doubler.
    static var placeholder: String {
        String(localized: "feed.post.composer.placeholder",
               defaultValue: "Qu'avez-vous en tête ?", bundle: .main)
    }

    static var toolRow: String {
        String(localized: "composer.document.a11y.tools",
               defaultValue: "Outils du document", bundle: .main)
    }

    /// **Ce que la rangée basse annonce depuis qu'elle n'a plus d'outils** (#5082).
    ///
    /// Les outils sont passés en colonne sous l'avatar ; la rangée ne porte plus
    /// que la puce de lieu et la capsule de langue — d'où l'on publie, dans
    /// quelle langue. Deux éléments s'annonçaient « Outils du document » le
    /// temps d'une mesure : celui qui les porte, et celui qui ne les portait
    /// plus. **Une étiquette qui survit à son contenu désigne le mauvais.**
    static var publicationAccessories: String {
        String(localized: "composer.document.a11y.publicationAccessories",
               defaultValue: "Lieu et langue de la publication", bundle: .main)
    }

    /// Le libellé du ruban de vignettes (B, #3883) — clé neuve, sur le patron
    /// de `toolRow` : `composer.a11y.removeAttachment` sert déjà le BOUTON de
    /// retrait de chaque vignette, mais aucune clé ne nommait le conteneur.
    static var mediaStrip: String {
        String(localized: "composer.document.a11y.media",
               defaultValue: "Médias joints", bundle: .main)
    }

    /// Le libellé du groupe de la bande de mentions (#3904, revue Opus
    /// 2026-08-27) — même patron que `mediaStrip`/`toolRow` : sans lui, le
    /// rotor VoiceOver ne trouve la bande qu'élément par élément, jamais
    /// comme un groupe nommé.
    static var mentionStrip: String {
        String(localized: "composer.document.a11y.mentions",
               defaultValue: "Suggestions de mention", bundle: .main)
    }

    /// **Le mot qu'une bande VIDE affiche** (2026-09-05).
    ///
    /// La bande disparaissait quand rien ne correspondait, et l'auteur ne
    /// pouvait pas distinguer « cette personne n'existe pas » de « la
    /// fonctionnalité est cassée ». Le SDK dit déjà ce mot sur la même
    /// question (`mention.suggestions.empty`, catalogue `.module`) ; la clé est
    /// distincte parce que les deux bundles ne se lisent pas l'un l'autre, la
    /// phrase est la même parce que c'est la même réponse.
    static var mentionEmpty: String {
        String(localized: "composer.mention.empty",
               defaultValue: "Aucune personne trouvée", bundle: .main)
    }

    /// Le libellé du picker de couleur de fond (F2, #3883… F2, #3885) — clé
    /// neuve sur le patron de `mediaStrip` (dotée, à l'abri du cliquet
    /// français), traduite dans les sept locales.
    static var background: String {
        String(localized: "composer.document.a11y.background",
               defaultValue: "Couleur de fond", bundle: .main)
    }

    /// **Le mot PEINT sur la tuile, distinct de celui que lit VoiceOver
    /// (#4071).**
    ///
    /// « Couleur de fond » occupe à lui seul près du double d'une tuile
    /// voisine, et la rangée n'a pas cette place : mesuré au simulateur, il
    /// repoussait trois entrées hors champ à taille nominale. « Fond » est le
    /// mot du document — la vue `1b` étiquette ce plan « fond · plan bg », et
    /// la rangée de la scène le nomme déjà ainsi.
    ///
    /// La forme longue ne DISPARAÎT pas : elle reste l'étiquette
    /// d'accessibilité, là où la place ne coûte rien et où le contexte manque
    /// le plus. Raccourcir les deux aurait échangé un défaut de disposition
    /// contre un défaut d'accessibilité.
    ///
    /// **La clé est de la famille `composer.attach.*`, et pas d'une famille
    /// neuve.** La bascule de fond est une tuile de CETTE rangée : lui ouvrir
    /// `composer.document.tool.*` aurait recréé la famille parallèle que
    /// `test_lesLibellesDOutils_reutilisentLaFamilleDattacheDejaTraduite`
    /// existe pour interdire — six libellés dupliqués, deux traductions à
    /// faire diverger.
    static var backgroundShort: String {
        String(localized: "composer.attach.background",
               defaultValue: "Fond", bundle: .main)
    }

    /// **Clé neuve (T2.2), sur le patron de `toolRow` juste au-dessus.** Ne
    /// reprend PAS le littéral `"Langue du post"` de la feuille historique :
    /// sa clé contient des espaces et échappe au cliquet français
    /// (`FrenchDefaultValueRatchetTests`) — la recopier aurait importé une
    /// dette invisible dans le fichier que ce chantier construit.
    static var language: String {
        String(localized: "composer.document.a11y.language",
               defaultValue: "Langue du document", bundle: .main)
    }

    /// La SORTIE n'a pas de clé neuve : `common.close` existe et est traduite
    /// dans les sept langues du catalogue. Le cliquet de complétude de ce dépôt
    /// est épinglé à un plafond, et une clé de plus pour un mot déjà traduit
    /// l'en rapproche pour rien.
    static var close: String {
        String(localized: "common.close", defaultValue: "Fermer", bundle: .main)
    }

    /// L'échec d'un envoi, DIT à l'auteur.
    ///
    /// **Aucune clé neuve** : c'est celle du fil (`feed.post.publish.error`),
    /// traduite dans les sept langues du catalogue — et le publieur est
    /// littéralement le même objet, `FeedViewModel`. Une seconde clé pour la
    /// même phrase, sur le même échec, aurait été deux traductions à faire
    /// diverger, et un cran de plus vers le plafond du cliquet français.
    static var publishError: String {
        String(localized: "feed.post.publish.error",
               defaultValue: "Erreur lors de la publication", bundle: .main)
    }

    /// **Un format qu'aucun canal ne sait porter** (#4869).
    ///
    /// Distincte de `publishError`, et c'est le point : « erreur lors de la
    /// publication » envoie réessayer, quand rien de ce que l'auteur peut faire
    /// ne changera l'issue. Une phrase qui nomme la CAUSE lui évite le second
    /// tap — c'est la même règle que les refus de l'éventail (#4858), un cran
    /// plus loin dans le geste.
    static var publishFormatUnsupported: String {
        String(localized: "composer.publish.format.unsupported",
               defaultValue: "Ce format ne peut pas encore être publié d'ici",
               bundle: .main)
    }

    /// **Le onzième média n'a nulle part où aller** (#4059).
    ///
    /// Un post plafonne à dix slides (`StoryComposerViewModel.canAddSlide`) ;
    /// au-delà, `addSlide()` est un no-op et le média refusé doit se VOIR —
    /// jamais se poser en silence sur la dernière slide créée.
    static var mediaCapReached: String {
        String(localized: "composer.document.media.capReached",
               defaultValue: "Dix médias au maximum par post — celui-ci n'a pas été ajouté",
               bundle: .main)
    }

    /// **Aucune clé neuve pour les six outils** — la famille `composer.attach.*`
    /// existe, elle est traduite dans les sept langues du catalogue, et c'est
    /// déjà le vocabulaire d'attache du composer (`UniversalComposerBar`).
    ///
    /// La rév. précédente en avait écrit six (`composer.document.tool.*`) qui
    /// répliquaient mot pour mot les libellés que `FeedView+Attachments.swift`
    /// pose en LITTÉRAL. Deux raisons de les retirer plutôt que de les faire
    /// traduire :
    ///
    /// - le cliquet français est à ZÉRO tolérance
    ///   (`FrenchDefaultValueRatchetTests`) : six clés françaises hors
    ///   catalogue le font rougir tel quel, et six entrées de plus le
    ///   rapprochent de son plafond pour un vocabulaire déjà écrit ;
    /// - deux clés pour la même phrase, ce sont deux traductions à faire
    ///   diverger — le raisonnement que `placeholder` tenait déjà juste
    ///   au-dessus, et qui vaut identiquement ici.
    ///
    /// Ce que cela ne règle PAS, et qui est consigné comme dette : les douze
    /// sites littéraux de `FeedView+Attachments.swift` et `FeedView.swift`
    /// écrivent le français EN GUISE DE CLÉ (`String(localized: "Ajouter une
    /// photo", …)`). Ces clés-là échappent au cliquet — son motif exclut
    /// l'espace — et ne sont traduites nulle part. Leur migration vers
    /// `composer.attach.*` appartient au lot qui absorbera la feuille.
    static func label(_ tool: ComposerDocumentTool) -> String {
        switch tool {
        case .photo:
            return String(localized: "composer.attach.photo",
                          defaultValue: "Photos", bundle: .main)
        case .camera:
            return String(localized: "composer.attach.camera",
                          defaultValue: "Caméra", bundle: .main)
        // Le MÊME mot que le chip du mood (`reference.sheet.title`) : les deux
        // ouvrent la même feuille, et deux vocabulaires pour un seul geste se
        // liraient comme deux gestes (dimension 6).
        case .mention:
            return String(localized: "composer.attach.mention",
                          defaultValue: "Mentionner", bundle: .main)
        case .emoji:
            return String(localized: "composer.attach.emoji",
                          defaultValue: "Emoji", bundle: .main)
        case .textScene:
            return ComposerRailCopy.label(.text)
        case .document:
            return String(localized: "composer.attach.file",
                          defaultValue: "Fichier", bundle: .main)
        case .place:
            return String(localized: "composer.attach.location",
                          defaultValue: "Position", bundle: .main)
        case .microphone:
            return String(localized: "composer.attach.voice",
                          defaultValue: "Vocal", bundle: .main)
        }
    }
}
