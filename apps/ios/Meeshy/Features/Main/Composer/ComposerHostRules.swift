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
/// **Le rail qui FLOTTE sur la scène — quatre gestes, bord droit, DEDANS
/// (#4072, arbitrage du 2026-08-28 sur #4061).**
///
/// L'arbitrage a écarté la disposition « deux rails latéraux encastrant la
/// scène » au motif qu'aucune capture ne la montre. Ce que la planche `1b`
/// montre est UN rail, flottant sur le bord DROIT, à quatre actions
/// (✎ ☺ ♫ #) — **et la rangée d'outils basse conservée**.
///
/// **Deux places, deux rôles**, et c'est tout le sens de la séparation :
/// - le RAIL agit **sur** la scène — poser un texte, un sticker, un son, une
///   mention sur ce qui est déjà là ;
/// - la RANGÉE BASSE fait **entrer** de la matière — photo, caméra, fichier,
///   lieu, dessin.
///
/// Les fondre en un seul rail de huit icônes, ce que l'app faisait, mélange les
/// deux rôles ET coûte la rangée que le pouce atteint : mesuré au simulateur, la
/// rangée disparaissait entièrement dès qu'un fond était choisi.
///
/// **Le dessin n'est pas dans le rail, et ce n'est pas un oubli.** L'arbitrage
/// dit quatre ; la loi 1 dit qu'on ne retire rien. Les deux tiennent ensemble
/// parce qu'un tracé ENTRE dans la scène — c'est de la matière, comme une
/// photo — et sa place est donc la rangée basse.
nonisolated enum ComposerSceneFloatingRail {

    /// Les quatre de la planche, dans son ordre : ✎ ☺ ♫ #.
    static let doors: [ComposerRailDoor] = [.text, .sticker, .sound, .mention]

    /// **Loi 8** — un rail de scène sans scène n'a rien sur quoi agir. Il ne
    /// s'estompe pas, il n'existe pas.
    static func served(hasScene: Bool) -> [ComposerRailDoor] {
        hasScene ? doors : []
    }

    /// **La RANGÉE BASSE — tout le reste, dans l'ordre où l'hôte les sert.**
    ///
    /// Le partage n'est pas un rangement : il suit les deux rôles. Ce qui reste
    /// ici FAIT ENTRER de la matière — une photo, un lieu, un tracé — ou donne
    /// le focus à la description. Le rail, lui, agit sur ce qui est déjà là.
    ///
    /// Elle se dérive du jeu SERVI plutôt que d'être écrite en dur : une porte
    /// que l'hôte ne sert pas ne doit apparaître ni au rail ni à la rangée, et
    /// deux listes écrites séparément auraient divergé au premier ajout.
    static func lowRow(from served: [ComposerRailDoor]) -> [ComposerRailDoor] {
        served.filter { !doors.contains($0) }
    }
}

/// **Ce que l'inspecteur d'un objet DIT de lui (#4073, vue `1c`).**
///
/// La planche montre une rangée horizontale de jetons portant des valeurs
/// lisibles — `STYLE · NÉON`, `TAILLE 38`, `ALIGN ▭`, `0:00 → 0:06`. L'app rend
/// des bulles d'icônes : on y lit ce qu'on peut CHANGER, jamais ce qui EST.
///
/// La différence n'est pas décorative. Un réglage qu'il faut ouvrir pour
/// connaître oblige l'auteur à explorer pour se souvenir ; un jeton qui porte sa
/// valeur répond sans être touché. C'est la dimension 12 — **la complexité se
/// paie dans le code, jamais chez l'utilisateur**.
///
/// La règle rend des MOTS, pas des vues : ce qu'un jeton affiche s'éprouve sans
/// monter d'écran, ce qu'il ouvre est l'affaire de la vue.
nonisolated enum ComposerObjectChips {

    struct Chip: Equatable {
        /// Identité STABLE, indépendante du libellé : c'est elle que la vue
        /// utilise pour savoir quel réglage ouvrir, et elle ne change pas quand
        /// la valeur change.
        let id: String
        let label: String
    }

    /// **Un jeton paraît quand il a quelque chose à DIRE** (loi 8). Un style
    /// absent ne fabrique pas « STYLE · — » : ce libellé occuperait la place en
    /// affirmant une valeur qui n'existe pas, ce qui enseigne moins que rien.
    ///
    /// La TAILLE fait exception et paraît toujours : elle n'est jamais absente
    /// du modèle — `fontSize` est non-optionnelle et porte une valeur par
    /// défaut. Il n'y a donc pas d'état « sans taille » à taire.
    ///
    /// L'ordre suit la planche — ce qui change l'apparence d'abord, le temps en
    /// dernier — et il ne dépend PAS de ce qui est renseigné : un jeton qui
    /// apparaît ne doit pas déplacer ses voisins sous le doigt.
    /// - Parameter locale: la locale qui FORME les nombres du jeton. Elle est
    ///   un paramètre plutôt qu'une lecture de `.current` parce qu'une règle
    ///   pure doit pouvoir être éprouvée sur une locale AUTRE que celle de la
    ///   machine qui la teste : un témoin qui lit `.current` rend le même
    ///   verdict avec et sans localisation, donc ne prouve rien.
    static func chips(for text: StoryTextObject,
                      locale: Locale = .current) -> [Chip] {
        var jetons: [Chip] = []
        if let style = text.textStyle, !style.isEmpty {
            jetons.append(Chip(id: "style", label: "STYLE · \(styleName(style))"))
        }
        let taille = LocalizedNumber.exact(Int(text.fontSize.rounded()), locale: locale)
        jetons.append(Chip(id: "size", label: "TAILLE \(taille)"))
        if let align = text.textAlign, !align.isEmpty {
            jetons.append(Chip(id: "align", label: "ALIGN · \(alignName(align))"))
        }
        if let fenetre = window(start: text.startTime,
                                duration: text.duration, locale: locale) {
            jetons.append(Chip(id: "window", label: fenetre))
        }
        return jetons
    }

    /// `nil` ⇒ le texte est PERMANENT : il n'a pas de fin à annoncer, et un
    /// « 0:00 → 0:00 » mentirait sur sa durée.
    static func window(start: Double?, duration: Double?,
                       locale: Locale = .current) -> String? {
        guard let duration, duration > 0 else { return nil }
        let debut = max(0, start ?? 0)
        return "\(timecode(debut, locale: locale)) → \(timecode(debut + duration, locale: locale))"
    }

    /// **`String(format: "%d:%02d")` vécut ici, et gravait les chiffres
    /// LATINS** — « 0:06 » dans une interface arabe, où la fenêtre de temps
    /// s'écrit « ٠:٠٦ ». Le défaut n'a pas la forme qu'une garde de littéral
    /// reconnaît : aucune chaîne interpolée, aucun `\(…)`, juste un formateur
    /// qui rend un `String` déjà faux. `NumericAccessibilityValueGuardTests`
    /// va donc le chercher à sa SOURCE, dans le corps du formateur.
    ///
    /// L'arrondi PRÉCÈDE le formatage et reste ici : `LocalizedNumber` tronque
    /// vers zéro (c'est ce qu'une position de lecture demande), là où une
    /// BORNE de fenêtre s'arrondit — 5,7 s de durée annoncent 6 s, pas 5.
    static func timecode(_ seconds: Double, locale: Locale = .current) -> String {
        LocalizedNumber.duration(seconds: max(0, Int(seconds.rounded())), locale: locale)
    }

    /// Les cinq styles du modèle, dans les mots de la planche. Un style inconnu
    /// se rend TEL QUEL en majuscules plutôt que d'être tu : une valeur que le
    /// serveur a acceptée existe, et la cacher ferait croire à son absence.
    static func styleName(_ raw: String) -> String {
        switch raw.lowercased() {
        case "neon": return "NÉON"
        case "bold": return "GRAS"
        case "typewriter": return "MACHINE"
        case "handwriting": return "MANUSCRIT"
        case "classic": return "CLASSIQUE"
        default: return raw.uppercased()
        }
    }

    static func alignName(_ raw: String) -> String {
        switch raw.lowercased() {
        case "left": return "GAUCHE"
        case "center": return "CENTRÉ"
        case "right": return "DROITE"
        default: return raw.uppercased()
        }
    }
}

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


/// **Ce que CE meuble sait servir sur la scène** — les portes du rail *leading*
/// et les contrôleurs du rail *trailing*, déclarés UNE fois.
///
/// ## Pourquoi une règle, et pas deux littéraux dans le corps de la vue
///
/// Les deux ensembles vécurent en `Set` littéraux, écrits à la volée dans
/// l'expression `sceneSurface`. Un littéral posé là est INÉPROUVABLE autrement
/// que par une garde de source — et une garde de source sur un littéral est
/// exactement le témoin qui passe au vert le jour où quelqu'un réécrit la liste
/// autrement. Sortis ici, les deux ensembles s'interrogent directement : un test
/// demande « la porte sticker est-elle servie ? » et obtient une réponse, pas
/// une sous-chaîne.
///
/// ## La loi 4, et ce qu'elle exige VRAIMENT d'une capacité
///
/// « Un contrôle sans effet est ABSENT, jamais grisé. » Une entrée n'entre donc
/// ici **qu'accompagnée de son chemin** : le meuble doit savoir, pour chacune,
/// ouvrir le portail et poser le résultat. C'est la seule question à se poser
/// avant d'ajouter une ligne — pas « la maquette la dessine-t-elle ? ».
///
/// ## Ce que l'absence de `sticker` cachait, et qui vaut d'être dit
///
/// La porte `sticker` fut retenue au motif qu'« aucun chemin ne pose un objet de
/// ce kind ». Le motif était faux : `StoryComposerViewModel.addSticker(emoji:)`
/// existe depuis C13, `StickerPickerView` est publique depuis C8, et le meuble
/// injecte déjà « Mes stickers » (`storyStickerLibraryProvided`). Ce qui
/// manquait n'était pas le chemin, c'était le niveau d'ACCÈS de la primitive —
/// et un `internal` ressemble, vu du site d'appel, à une règle produit.
///
/// Même histoire pour l'empilement : `bringForward` / `sendBackward` vivent sur
/// le MODÈLE, pas sur la vue UIKit, et l'auraient toujours pu.
///
/// ## Ce qui n'y est PAS, et pourquoi
///
/// - `edit` — l'inspecteur par kind est la vue `1c`, pas encore montée (#4073) ;
///   servir l'action ouvrirait un éditeur qui n'existe pas.
/// - `leaveScene` — sortir un objet de la scène demande de décider ce qu'il
///   devient dehors, ce qu'aucune règle du dépôt ne tranche encore (#4038).
nonisolated enum ComposerSceneCapabilities {

    /// Les portes du rail *leading*. Passées à `ComposerRailDoor.offered`, qui
    /// leur applique ensuite la règle du FORMAT — une porte de niveau objet
    /// disparaît d'un `status`, qui n'a pas de scène.
    static let doors: Set<ComposerRailDoor> = [
        .description, .media, .sound, .text, .drawing, .sticker, .mention, .place
    ]

    /// Les contrôleurs du rail *trailing*. Passés à
    /// `ComposerTrailingRailPolicy.actions`, qui leur applique ensuite ce que
    /// l'OBJET admet (verrouillé, fond, seul de son plan).
    /// `.trim` y est entrée au #4082 : le meuble sait désormais ouvrir la bande
    /// de rognage sous la scène. Ce jeu dit ce que CE meuble sait faire ; ce
    /// qu'un OBJET admet reste à la règle du SDK, qui n'offre le rognage qu'à
    /// une vidéo ou un son (`hasTrimmableSource`).
    static let controllers: Set<StoryCanvasContextAction> = [
        .duplicate, .delete, .bringForward, .sendBackward, .trim
    ]

    /// Les bandes contextuelles du bas de scène. Passées à
    /// `ComposerSceneBand.opened`, qui n'ouvre JAMAIS une bande demandée mais
    /// non servie — sans quoi un contexte déclaré avant d'avoir son contenu
    /// occuperait les ≈ 170 pt que l'encastrement des rails vient de libérer.
    ///
    /// `timeline` et `textStyles` appartiennent au critère de
    /// `ComposerSceneBand` — un axe horizontal, une comparaison latérale — mais
    /// n'ont pas d'hôte ici : la timeline vit dans l'atelier (#4075), et les 18
    /// styles exigent un objet `text` SÉLECTIONNÉ, qu'aucune porte de cette
    /// surface ne pose encore (#4083).
    static let bands: Set<ComposerSceneBand> = [.palette]

    /// **`timeline` est servie SEULEMENT quand elle a de quoi se remplir**
    /// (#4082) — c'est-à-dire quand l'objet sélectionné a une source à rogner.
    ///
    /// Sans cette condition, la bande deviendrait un membre permanent du jeu
    /// servi, et `ComposerSceneBand.opened` l'ouvrirait sur une sélection qui
    /// n'a rien à rogner : une bande VIDE occupant les ≈ 170 pt que
    /// l'encastrement des rails vient de libérer, c'est-à-dire précisément le
    /// résultat que la règle `opened(_:served:)` existe pour interdire.
    ///
    /// Le jeu de base reste `bands` : il dit ce qui est servi quel que soit
    /// l'état, et c'est lui que les gardes interrogent pour vérifier
    /// qu'aucune bande sans hôte n'y est entrée par distraction.
    static func bands(canTrimSelection: Bool) -> Set<ComposerSceneBand> {
        canTrimSelection ? bands.union([.timeline]) : bands
    }
}


/// **Les trois sources qu'UNE porte média ouvre** — et pourquoi la porte du
/// rail n'en servait qu'une.
///
/// `ComposerRailDoor.offered` porte, sur son paramètre `allowsCapture`, cette
/// phrase :
///
///   > « Le rail n'ayant qu'UNE porte pour les trois sources, la gater ici
///   > retirerait la bibliothèque avec la caméra […]. Le drapeau est donc reçu,
///   > documenté, et volontairement sans effet sur cette liste : c'est le
///   > SÉLECTEUR qu'il gouverne, en aval. »
///
/// Le raisonnement est juste. **Le sélecteur en aval n'existait pas** :
/// `handleRailDoor(.media)` allait droit à la photothèque. Dès qu'une scène
/// existait, la CAMÉRA et l'IMPORT DE FICHIER — deux des sept entrées de la
/// rangée canonique — disparaissaient de l'écran sans qu'aucune règle les
/// retire. C'est la leçon 335 une seconde fois, sur le même écran : un
/// commentaire qui décrit un mécanisme ABSENT ne se fait contredire par rien.
///
/// ## Ce que la règle décide, et ce qu'elle laisse au meuble
///
/// Elle dit QUELLES sources sont offertes ; le meuble décide comment les
/// présenter — et notamment qu'**une source unique se présente DIRECTEMENT**,
/// sans feuille de choix : une liste à un seul élément est un geste de plus
/// pour zéro décision (loi 7, chemin nominal ≤ 2 gestes).
///
/// ## `allowsCapture` retire la caméra, jamais les deux autres
///
/// Le drapeau existe pour ce qui REPREND un contenu déjà publié (repost,
/// édition) : on n'y filme pas, mais on garde le droit d'ajouter une image de
/// sa bibliothèque ou un fichier. Le gater plus haut aurait fermé les trois.
nonisolated enum ComposerMediaSourcePolicy {

    static func offered(allowsCapture: Bool) -> [ComposerMediaIntake] {
        [.photoLibrary, .camera, .files].filter { $0 != .camera || allowsCapture }
    }

    /// L'outil de la rangée canonique qui NOMME cette source.
    ///
    /// Le libellé n'est pas réécrit ici : c'est `ComposerDocumentCopy.label`
    /// qui le rend, donc exactement le mot que la rangée du document emploie
    /// pour le même geste. Une seconde table aurait fait dire « Photos » d'un
    /// côté et « Photothèque » de l'autre pour un seul sélecteur (dimension 6),
    /// et dédoublé sept traductions.
    static func namingTool(_ intake: ComposerMediaIntake) -> ComposerDocumentTool {
        switch intake {
        case .photoLibrary: return .photo
        case .camera:       return .camera
        case .files:        return .document
        }
    }

    /// Le titre de la feuille est **le libellé de la porte elle-même**, pas une
    /// clé neuve : `composer.rail.media` dit déjà « Ajouter un média » dans les
    /// sept langues servies. Une seconde clé pour la même phrase, ce sont sept
    /// traductions à faire diverger — le raisonnement que
    /// `ComposerDocumentCopy.label` tient déjà pour la rangée du document.
    static var chooserTitle: String { ComposerRailCopy.label(.media) }

    static var cancel: String {
        String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)
    }
}


/// **D'où vient un son posé sur la scène** — et pourquoi la porte n'en servait
/// qu'une provenance.
///
/// La porte `sound` du rail routait vers `handleDocumentTool(.microphone)` :
/// elle n'ENREGISTRAIT que. Emprunter un son à l'étagère était impossible
/// depuis le composer unifié — aucune occurrence de `SoundLibraryPicker` ni
/// d'`addBorrowedSound` dans tout le meuble — alors que le socle de la vue `1b`
/// affiche déjà un crédit de son (« ♫ NUITS BLANCHES · @lume · 0:28 »).
///
/// **Troisième fois sur le même écran** qu'une porte unique ne sert qu'une de
/// ses sources, après le média (caméra et fichier perdus) et les capacités de
/// la scène (sticker, empilement). Le motif se répète parce que rien n'oppose
/// une porte à ce qu'elle PROMET : le rail dit « Ajouter un son », le handler
/// en sert un seul type.
///
/// ## Les deux provenances ne posent pas le même objet, et c'est la doctrine
///
/// La vue `2c` le dit sans détour — « la provenance gouverne l'affichage » :
///
/// | provenance | ce qu'elle pose | conséquence |
/// |---|---|---|
/// | étagère | `addBorrowedSound` → objet audio `isBackground` | allume le crédit et le 🔇 des surfaces de lecture |
/// | micro | une note vocale | **n'est JAMAIS un fond audio** |
///
/// ## Ce que cette doctrine confondait, et que le porteur a tranché (#4483)
///
/// Elle concluait « les fondre en un seul geste ferait d'une note vocale la
/// bande-son de la publication ». La conclusion ne suivait pas de sa prémisse :
/// elle mêlait deux champs ORTHOGONAUX de `StoryAudioPlayerObject`.
///
/// | ce qui est en jeu | le champ qui le porte | qui l'écrit |
/// |---|---|---|
/// | le CRÉDIT (« ♫ NUITS BLANCHES · @lume ») | `soundId` + `soundAuthorUsername` | `addBorrowedSound`, et lui seul |
/// | le rôle de MIXAGE | `isBackground` | n'importe quel son |
///
/// Un vocal mis en fond porte donc `isBackground = true` et `soundId = nil` : le
/// bon mixage, sans ligne de crédit mensongère. Ce que la doctrine protégeait
/// vraiment — qu'un enregistrement personnel ne s'attribue pas le crédit d'une
/// piste empruntée — reste protégé, et l'auteur gagne le choix que le porteur a
/// demandé le 2026-08-30 : « les mettre en background ou en foreground ».
///
/// L'ORDRE change avec elle. La doctrine rangeait l'étagère en premier, au motif
/// qu'emprunter est le geste nominal. Le porteur a demandé que la porte « ouvre
/// directement l'enregistrement audio » : le micro passe donc devant, et les
/// deux autres provenances deviennent des entrées SOUS lui, dans la même
/// feuille — plus un choix préalable qui coûtait un geste pour rien.
///
/// ## Aucun gate, et c'est mesuré
///
/// `allowsCapture` ne retire que la CAMÉRA (`ComposerDocumentToolPolicy.visibleTools`
/// filtre `.camera`, jamais `.microphone`) : reprendre un contenu publié
/// n'interdit pas d'y enregistrer un vocal. Et la porte `sound` étant de niveau
/// OBJET, elle n'existe déjà que là où une scène peut recevoir le résultat.
nonisolated enum ComposerSoundSource: Equatable, Hashable, CaseIterable {
    /// L'étagère — un son EMPRUNTÉ, qui devient le fond de la scène.
    case library
    /// Le micro — la surface PRINCIPALE de la feuille depuis #4483.
    case record
    /// Un fichier audio du disque.
    case files
}

/// Les mots du rôle de mixage (#4483).
///
/// « Fond » et « premier plan » sont les deux mots du DOMAINE — le modèle les
/// porte déjà sous `isBackground`. On ne dit ni « musique » ni « voix » : le
/// rôle ne dépend pas de ce qu'est le son, mais de la place qu'il occupe.
nonisolated enum ComposerSoundRoleCopy {

    static var title: String {
        String(localized: "composer.sound.role.title",
               defaultValue: "Place du son", bundle: .main)
    }

    static func label(_ role: ComposerAudioRole) -> String {
        switch role {
        case .background:
            return String(localized: "composer.sound.role.background",
                          defaultValue: "En fond", bundle: .main)
        case .foreground:
            return String(localized: "composer.sound.role.foreground",
                          defaultValue: "Au premier plan", bundle: .main)
        }
    }
}

nonisolated enum ComposerSoundSourcePolicy {

    /// L'ordre n'est pas décoratif : **enregistrer d'abord** depuis #4483. La
    /// porte ouvre directement le micro (directive porteur), et les deux autres
    /// provenances sont des entrées offertes SOUS lui, dans la même feuille.
    /// Auparavant l'étagère venait en tête, au motif qu'emprunter est le geste
    /// nominal — c'était vrai d'un CHOIX préalable, qui n'existe plus.
    static let offered: [ComposerSoundSource] = [.record, .library, .files]

    static func label(_ source: ComposerSoundSource) -> String {
        switch source {
        case .library:
            return String(localized: "composer.rail.sound.library",
                          defaultValue: "Emprunter un son", bundle: .main)
        case .record:
            return String(localized: "composer.rail.sound.record",
                          defaultValue: "Enregistrer un vocal", bundle: .main)
        case .files:
            return String(localized: "composer.rail.sound.files",
                          defaultValue: "Importer un fichier audio", bundle: .main)
        }
    }

    /// Le titre de la feuille est **le libellé de la porte**, comme pour le
    /// média : `composer.rail.sound` dit déjà « Ajouter un son » dans les sept
    /// langues servies.
    static var chooserTitle: String { ComposerRailCopy.label(.sound) }

    static var cancel: String { ComposerMediaSourcePolicy.cancel }
}


/// **Les libellés de l'historique** (#4402).
///
/// Ils sont ici, avec les autres règles pures du meuble, et pas dans la barre
/// haute : c'est la barre qui les AFFICHE, mais c'est le meuble qui décide que
/// l'historique existe. Un jour où une seconde surface servira l'historique,
/// elle lira les mêmes mots sans dépendre de la vue qui les portait.
nonisolated enum ComposerHistoryCopy {

    static var undo: String {
        String(localized: "composer.history.undo",
               defaultValue: "Annuler", bundle: .main)
    }

    static var redo: String {
        String(localized: "composer.history.redo",
               defaultValue: "Rétablir", bundle: .main)
    }
}


/// **Qui sert l'historique, et pourquoi pas tout le monde** (#4402).
///
/// L'historique du composer photographie `slides` — la SCÈNE et ses objets.
/// Sur l'écran DOCUMENT, ce que l'auteur vient de faire est presque toujours du
/// texte, que le clavier annule déjà par son propre geste ; y montrer un
/// « annuler » qui remonte une pose de fond faite deux écrans plus tôt
/// promettrait d'annuler la frappe et ferait autre chose. **Un contrôle qui
/// défait autre chose que le dernier geste visible est pire qu'absent.**
///
/// La scène, elle, accumule des gestes qui ne se défont par rien d'autre :
/// poser un sticker, avancer un objet d'un plan, changer le fond.
///
/// ## Le défaut que la vérification simulateur a trouvé (2026-08-30)
///
/// Ce prédicat prenait un `ComposerSurfaceKind`. Il compilait, il était testé,
/// et il ne pouvait JAMAIS rendre `true` là où il comptait : la scène incrustée
/// est un `ComposerSurfaceKind.document` **qui a une scène** — c'est
/// `ComposerMountedView.scene` qui la nomme, et seul lui. Le `.scene` du KIND
/// désigne l'ATELIER, une surface que ce meuble ne monte pas sur ce chemin.
///
/// > **Deux énumérations dont un cas porte le même nom décrivent deux niveaux
/// > différents, et le compilateur ne peut pas dire laquelle on voulait.** Le
/// > témoin qui l'aurait attrapé n'est pas un test de plus sur le prédicat —
/// > il en avait trois, tous verts — mais un test qui part de l'ÉTAT réel :
/// > « un document AVEC une scène sert-il l'historique ? »
nonisolated enum ComposerHistoryService {

    /// - Parameter view: la vue réellement MONTÉE — jamais le format, jamais le
    ///   kind de surface. C'est la présence de la scène qui décide, et elle
    ///   seule ; `ComposerMountedView` est le seul type qui la porte.
    static func servesHistory(on view: ComposerMountedView) -> Bool {
        view == .scene || view == .atelier
    }
}
