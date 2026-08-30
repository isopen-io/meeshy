import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

// Les RÈGLES pures du meuble — éprouvables sans monter la moindre vue, et
// c'est pourquoi elles vivent hors du type qui les lit (#4102).


/// Le gate du réel, en UN seul endroit — **et nourri de la composition RÉELLE
/// depuis V1**.
///
/// Il fut une constante `false`, lue aux deux seuls sites qui construisent un
/// profil : l'éventail était écrit, testé, et débranché. Ce qu'il lit
/// maintenant est la composition que l'auteur a posée.
///
/// **Aucun second prédicat n'est fabriqué ici.** `ReelComposition` reste
/// l'unique juge — miroir du gateway (`reelComposition.ts`) et du web. Ce type
/// ne fait qu'une PROJECTION : traduire les objets d'une diapositive en la
/// liste `(kind, durationMs)` que le prédicat attend. Écrire « une vidéo de
/// plus de 3 s qualifie » une seconde fois côté app aurait donné deux règles à
/// faire diverger, exactement la dette que ce dépôt paie déjà ailleurs.
///
/// **Ce qu'il lit, et ce qu'il ne lit pas.** `currentEffects` est la seule
/// lucarne publique du SDK sur la composition : `slides` et `loadedVideoURLs`
/// sont internes à `MeeshyUI`. Le gate ne voit donc que la diapositive
/// COURANTE. L'erreur est bornée dans un seul sens — il peut MANQUER un réel
/// (deux images réparties sur deux diapositives), jamais en inventer un. C'est
/// le sens sûr : la loi 9 dit que le gate AJOUTE le réel et ne retire jamais le
/// format propre d'une porte, donc un gate qui sous-détecte dégrade l'offre
/// sans jamais publier ce que personne n'a demandé.
nonisolated enum ComposerReelGate {

    static func compositionQualifiesAsReel(_ effects: StoryEffects) -> Bool {
        ReelComposition.qualifiesAsReel(mediaKinds: mediaKinds(of: effects))
    }

    /// Ce que vaut le gate quand il n'y a RIEN à juger. Dérivé du prédicat sur
    /// une composition vide plutôt qu'écrit `false` : le littéral en dur est
    /// précisément ce que V1 a eu à retrouver en deux exemplaires.
    static var withoutComposition: Bool {
        compositionQualifiesAsReel(StoryEffects())
    }

    /// La projection. Les images n'ont jamais de durée (la règle produit ne la
    /// leur demande pas) ; pour une vidéo, la durée NATIVE de l'asset prime sur
    /// sa durée de lecture — c'est celle du fichier téléversé que le serveur
    /// jugera, et un clip de 10 s ramené à 1 s sur la timeline reste une vidéo
    /// de 10 s aux yeux du gateway.
    static func mediaKinds(of effects: StoryEffects) -> [(kind: FeedMediaType, durationMs: Int?)] {
        let visuels: [(kind: FeedMediaType, durationMs: Int?)] = (effects.mediaObjects ?? [])
            .compactMap { objet -> (kind: FeedMediaType, durationMs: Int?)? in
                guard let kind = objet.kind else { return nil }
                switch kind {
                case .image:
                    return (kind: .image, durationMs: nil)
                case .video:
                    return (kind: .video, durationMs: milliseconds(objet.intrinsicDuration ?? objet.duration))
                }
            }
        let sons: [(kind: FeedMediaType, durationMs: Int?)] = (effects.audioPlayerObjects ?? [])
            .map { objet -> (kind: FeedMediaType, durationMs: Int?) in
                (kind: .audio, durationMs: milliseconds(objet.duration.map { Double($0) }))
            }
        return visuels + sons
    }

    /// Une durée nulle ou négative n'est pas une durée : elle rend `nil`, et le
    /// prédicat la traite comme inconnue — donc non qualifiante. Le rendre `0`
    /// aurait dit « connue et trop courte », ce qui est la même conclusion
    /// aujourd'hui mais cesserait de l'être si le plancher passait à zéro.
    private static func milliseconds(_ seconds: Double?) -> Int? {
        guard let seconds, seconds > 0 else { return nil }
        return Int((seconds * 1000).rounded())
    }
}

/// **Ce que le socle MONTRE quand le texte grossit (#4057).**
///
/// Ses deux zones nommées portent un pictogramme ET un mot. Aux paliers
/// d'ACCESSIBILITÉ, le mot ne tient plus : mesuré au simulateur le 2026-08-28,
/// en allemand à `accessibility-XXXL`, « Veröffentlichen » se cassait en
/// syllabes EMPILÉES — « Ver- / öf- / fent- / li- » — et « Öffentlich » se
/// tronquait en « Öffe… ». Le socle, qui est une RANGÉE, devenait une colonne
/// de fragments.
///
/// Au-delà de ce seuil, les libellés se réduisent donc à leur ICÔNE. C'est la
/// forme qui préserve la loi 5 (« le socle ne bouge jamais ») : les zones ne se
/// déplacent pas et ne passent pas à la ligne — elles RÉTRÉCISSENT, au même
/// endroit.
///
/// **Ce que la réduction ne touche PAS** : le nom accessible. Un contrôle qui
/// perd son nom en devenant compact est le défaut que `StatusComposerView` a dû
/// corriger, et que la flèche de publication évite déjà en refusant d'échanger
/// son libellé contre un `ProgressView`. VoiceOver et Voice Control lisent le
/// même mot à toutes les tailles ; seul l'ŒIL en est privé, et seulement quand
/// le montrer le rendrait illisible.
///
/// Le seuil est `isAccessibilitySize` et non un palier choisi à la main : c'est
/// la frontière que le système lui-même trace entre « plus grand » et « conçu
/// pour l'accessibilité », et la recopier en dur la ferait diverger.
nonisolated enum ComposerSocleDensity {
    static func showsLabels(_ size: DynamicTypeSize) -> Bool {
        !size.isAccessibilitySize
    }
}

/// **Ce qu'un tap sur le FOND de la scène incrustée sélectionne (#4035).**
///
/// Règle PURE, hors de tout `body` : une condition posée dans une vue est
/// invisible aux tests, et celle-ci gouverne l'existence même de la zone
/// contextuelle.
///
/// **Pourquoi elle existe.** L'inspecteur était câblé de bout en bout — la
/// scène transmet `onItemTapped`, l'hôte retient la sélection, la surface monte
/// la zone — et pourtant INATTEIGNABLE sur l'écran document. En profil Post une
/// slide ne porte qu'UN média, et la règle 4 en fait son FOND (#4038) ; or le
/// hit-test du canvas n'itère que le conteneur des ITEMS, où un fond ne vit
/// pas. Le tap retombait donc sur `onBackgroundTapped`, qui effaçait la
/// sélection : écran identique au bit près, mesuré au simulateur le 2026-08-28.
///
/// **Elle vit côté APP, pas dans le geste du SDK.** Rendre le fond
/// « hit-testable » côté canvas changerait la manipulation de l'atelier plein
/// écran, que ce lot doit laisser intact — c'est la condition même de
/// l'arbitrage porteur (« coquille NEUVE, modèle PARTAGÉ »). Le SDK dit ce qui a
/// été TOUCHÉ ; l'app décide ce que cela SÉLECTIONNE.
nonisolated enum ComposerSceneBackgroundTapPolicy {

    /// `nil` ⇒ aucune sélection ⇒ aucune zone contextuelle (loi 4).
    static func selection(
        currentSelection: StoryCanvasUIView.CanvasItemKind?,
        backgroundIsMedia: Bool
    ) -> StoryCanvasUIView.CanvasItemKind? {
        guard currentSelection == nil, backgroundIsMedia else { return nil }
        return .media
    }
}

/// **Le gate du MOOD — la jumelle de `ComposerReelGate` (#4030).**
///
/// Le fan du fil offrait `[.post, .story]` et, quand la composition qualifiait,
/// `.reel`. Le quatrième format n'était atteignable que par sa PORTE
/// (`.moodChip`) : un auteur qui venait d'écrire deux lignes dans le composer
/// du fil devait fermer, revenir par le chip mood et retaper — la loi 9 (le
/// contenu est PRÉSERVÉ à travers les formats) tombait sur le seul format
/// qu'aucune bascule n'atteignait.
///
/// **Les deux gates sont MUTUELLEMENT EXCLUSIFS par construction** : le réel
/// exige un média, le mood exige qu'il n'y en ait AUCUN. Aucun `if` ne l'écrit
/// — c'est le prédicat lui-même qui le tient, et un témoin le prouve sur la
/// table plutôt que de le supposer.
///
/// **Pourquoi l'emoji entre dans le prédicat.** Un gate posé sur le seul texte
/// se refermerait sous les doigts de l'auteur qui efface sa phrase pour la
/// réécrire : l'offre perdrait `.status`, le repli
/// (`ComposerFormatFanPolicy.resolvedSelection`) le ramènerait au document, et
/// la surface changerait EN PLEINE FRAPPE. Un emoji déjà posé est la preuve
/// qu'un mood est en cours — il tient le format ouvert le temps de la
/// composition. Il ne rachète pour autant PAS un média : la carte mood n'a
/// nulle part où le mettre.
nonisolated enum ComposerMoodGate {

    /// « Contenu uniquement du texte, non vide » — plus l'échappatoire de
    /// l'emoji ci-dessus.
    static func compositionQualifiesAsMood(
        text: String,
        hasMedia: Bool,
        hasScene: Bool,
        moodEmoji: String?
    ) -> Bool {
        guard !hasMedia, !hasScene else { return false }
        if let moodEmoji, !moodEmoji.isEmpty { return true }
        return !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Ce que vaut le gate quand il n'y a RIEN à juger — DÉRIVÉ du prédicat,
    /// jamais écrit `false` : le littéral en dur est précisément ce que V1 a eu
    /// à retrouver en deux exemplaires.
    static var withoutComposition: Bool {
        compositionQualifiesAsMood(text: "", hasMedia: false, hasScene: false, moodEmoji: nil)
    }
}

/// **Le meuble** du composer unifié (C2) — plateau, scène, socle permanent.
///
/// Ce que ce type est, et surtout ce qu'il n'est PAS :
///
/// - il **enveloppe** l'atelier de composition du SDK (`StoryComposerView`), il
///   ne le réécrit pas. L'atelier porte des milliers de lignes éprouvées ; en
///   refaire une version app-side ferait diverger deux surfaces sans qu'aucun
///   test ne le dise ;
/// - il **ne construit aucun aperçu**. Loi 6 de la doctrine — « le lecteur EST
///   l'aperçu » : composer et viewers partagent un seul registre de rendu, et un
///   quatrième chemin d'aperçu casserait le WYSIWYG par construction. Le socle
///   ne peint plus d'œil du tout depuis le lot 4.9 : aucune de ses deux surfaces
///   n'a de canvas à lire, et un aperçu VIDE ment autant qu'un aperçu maison.
///   L'œil de l'atelier, lui, est intact — c'est l'atelier qui le peint ;
/// - il **ne décide de rien** : ce qu'il montre est fonction du
///   `ComposerProfile` que `ComposerIntent` lui donne (C1). Le host lit la
///   table, il ne la double pas ;
/// - il **n'ouvre aucun chemin de publication**. L'unique publieur est la barre
///   du SDK (`StoryComposerView+TopBar.publishButton` → `publishAllSlides()`),
///   qui rabat les effets du canvas sur la diapositive courante avant de
///   rendre la main. Un second chemin app-side publierait un document que
///   personne n'a rabattu.
///
/// **Le socle ne bouge jamais** (loi 5 de la doctrine P1) — et ce que la loi 5
/// interdit n'est pas qu'une zone manque, c'est qu'elle manque SELON LA PORTE.
/// Les zones peintes suivent la SURFACE montée, par une règle pure
/// (`ComposerChromeOwnership.socleZones`), et gardent partout le même ordre de
/// lecture : audience, œil, publication. C'est le point fixe qui fait qu'un
/// composer reste le même objet vu de neuf endroits différents.
/// `MeeshyComposerHostGuardTests` le verrouille par garde de source, faute d'une
/// sortie observable.
///
/// **Aucune UI morte** : une capacité refusée par le profil n'est pas montée
/// puis désactivée, elle est ABSENTE (loi 4 — « rien à l'écran sans raison »).
///
/// ## Équivalence avec le cover de création (C3)
///
/// Trois choses que `StoryComposerCover` donne à l'atelier, et qu'un host les
/// perdant rendrait silencieusement moins bon que ce qu'il remplace :
///
/// 1. **l'audience mémorisée** (`initialVisibility`). Le paramètre du SDK a une
///    valeur PAR DÉFAUT (`PostVisibility.friends`) : l'oublier ne casse aucune
///    compilation, la loi 10 disparaît sans un mot. Il est ici un paramètre
///    OBLIGATOIRE du host, et `AppInitWireupTests` vérifie qu'aucun site de
///    création ne monte l'atelier sans le passer ;
/// 2. **l'adoption de brouillon** (`adoptDraft`). Sans elle le composer
///    s'autosauvegarde sous un id neuf et le brouillon repris reste intact à
///    côté, en double ;
/// 3. **les cinq fournisseurs d'environnement** (lieu, caméra, pellicule,
///    presse-papier, bibliothèque de stickers). Sans eux la pastille « Lieu »,
///    les amorces de page blanche et la bibliothèque de stickers
///    disparaissent — sans le moindre signal.
///
/// Depuis V3-2, ce n'est plus une équivalence à tenir « au cas où » : le cover
/// de création MONTE ce host, et a cessé de poser lui-même ce que le host pose.
/// Une des trois qui manquerait ici manquerait désormais à l'écran.
/// Les deux libellés d'ÉTAT de la flèche du socle — ceux que VoiceOver annonce
/// quand la publication est en vol ou refusée.
///
/// Ils ne sont pas dans la vue : un libellé posé en littéral échappe au cliquet
/// de complétude et n'est jamais traduit. Même idiome que `ComposerDocumentCopy`
/// et `ComposerMoodCopy`.
///
/// **Zéro clé neuve.** Les deux MIGRENT depuis `StatusComposerView`, où elles
/// n'avaient qu'un lecteur, et elles sont traduites dans les sept locales
/// livrées. Le socle est leur second lecteur : c'est ce qui les empêche de
/// devenir orphelines le jour du retrait (lot 4.8).
///
/// **Ce que ce déménagement n'avait pas réglé, et que le lot 4.8 a tranché** :
/// `status.composer.publish` n'était lue que par `StatusComposerView`. Le socle
/// garde `composer.socle.publish`, qui n'est pas la même phrase — « Publish »
/// contre « Post » en anglais — et fondre les deux aurait été une édition de
/// catalogue qu'aucun de ces lots ne possède. La clé a donc été RETIRÉE des sept
/// locales avec l'écran qui la lisait : la laisser aurait fait rougir la garde
/// des clés mortes (`LocalizationConsistencyTests`).
nonisolated enum ComposerSocleCopy {

    /// L'état TRANSITOIRE, porté par `accessibilityValue` et non par le libellé.
    /// Échanger le libellé contre un `ProgressView` laisserait le bouton sans
    /// nom accessible à l'instant précis où il est occupé — le défaut que
    /// `StatusComposerView` a corrigé et qu'il ne faut pas réintroduire ici.
    static var publishInProgress: String {
        String(localized: "a11y.status.publish.in-progress",
               defaultValue: "Publication en cours", bundle: .main)
    }

    /// Ce qui MANQUE pour publier.
    ///
    /// `nil` hors du mood, et c'est une lacune ASSUMÉE, pas un oubli : la seule
    /// phrase déjà traduite dit « choisissez un emoji », ce qui est faux d'un
    /// document, dont le gate porte sur le texte. Le lot 4 n'ajoute AUCUNE clé
    /// au catalogue (sept locales, cliquet français à zéro tolérance).
    ///
    /// **Une porte de production ATTEINT le document depuis le lot 4.7** — la
    /// republication d'un mood, dont l'éventail offre le chip « Post ». La
    /// lacune n'y mord pourtant pas, et c'est ce qui a rendu la descente de
    /// l'éventail possible sans clé neuve : sous un ancrage, le gate arme sur la
    /// SOURCE (`repostOfId`), jamais sur le texte, si bien que la flèche n'y est
    /// jamais grise faute d'une phrase. Le seul refus qui reste atteignable sous
    /// cette surface est l'audience nominative vide, et `publishBlockedHint`
    /// rend déjà `""` dans ce cas — un indice FAUX coûtant plus qu'un indice
    /// absent.
    ///
    /// Une phrase pour le document s'écrira le jour où une porte l'atteindra
    /// avec un gate qui porte sur le TEXTE — c'est-à-dire `.feedComposer`, dans
    /// le lot qui possède le catalogue.
    static func publishBlockedHint(surface: ComposerSurfaceKind) -> String? {
        switch surface {
        case .mood:
            return String(localized: "a11y.status.publish.disabled.hint",
                          defaultValue: "Choisissez un emoji pour publier votre status", bundle: .main)
        case .document, .scene:
            return nil
        }
    }
}

/// Une porte qui route vers un composer HISTORIQUE n'ouvre pas le meuble (C1).
///
/// Ce prédicat vit à côté du host plutôt que dedans, et c'est délibéré : c'est
/// l'APPELANT — la porte, tâche C3 — qui décide de présenter le legacy ou le
/// host. Un host qui se saborderait lui-même en rendant `EmptyView` pour ces
/// origines laisserait la porte croire qu'elle a présenté quelque chose.
nonisolated extension ComposerIntent {
    /// `nil` ⇒ la porte ouvre `MeeshyComposerHost`. Non-`nil` ⇒ elle présente
    /// le composer historique nommé, et rien d'autre.
    /// Le gate du réel n'entre PAS dans ce calcul, et ce n'est pas une
    /// approximation : le routage legacy est le même pour les deux valeurs du
    /// gate, sur les neuf portes — `ComposerIntentTests` le prouve porte par
    /// porte plutôt que de le laisser se supposer. La composition vide est donc
    /// lue ici pour ce qu'elle est, une valeur neutre, et non recopiée en
    /// littéral : le `false` en dur est exactement ce que V1 a eu à retrouver
    /// en deux exemplaires.
    var routesToLegacy: LegacyComposer? {
        ComposerProfile.profile(
            for: origin,
            compositionQualifiesAsReel: ComposerReelGate.withoutComposition
        ).routesToLegacy
    }
}
