import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les TROIS surfaces du meuble (V2, élargi au mood par le lot 4).
///
/// Le composer unifié n'a jamais eu qu'une surface : l'atelier de scène du SDK
/// (`StoryComposerView`). C'est ce qui interdisait de recâbler `.feedComposer`,
/// la porte la plus utilisée de l'app — elle ouvre un DOCUMENT (un texte, des
/// pièces jointes), pas une scène, et la router vers l'atelier aurait été une
/// régression sèche. La spec v1 le pose mot pour mot : « le host n'a pas de
/// surface document sans scène, et recâbler la porte la plus utilisée sans elle
/// serait une régression ».
///
/// **Le mood a quitté le document le 2026-08-24 (lot 4).** Il y était rangé
/// par défaut, faute de troisième cas — et l'énumération n'en portait que deux.
/// Ce que la mesure a rendu : un mood n'a NI pièce jointe (`allowsCapture:
/// false`, `ComposerIntent.swift`), NI rangée d'outils à servir, NI texte long.
/// Sa matière est une grille de dix emojis et 122 caractères. Lui monter
/// l'éditeur du document aurait affiché un `TextEditor` vide là où l'auteur
/// attend des emojis — la régression que ce dossier évite ailleurs.
nonisolated enum ComposerSurfaceKind: Equatable {
    /// L'atelier : un canvas, des diapositives, une timeline.
    case scene
    /// Le document : un texte long, des pièces jointes, aucune scène.
    case document
    /// Le mood : une grille d'emojis, 122 caractères, aucune pièce jointe.
    case mood
}

/// Quelle surface le meuble monte — et c'est une fonction PURE de ce que la
/// porte a décidé (`opensWith`) et du format COURANT (loi 9 : le format est un
/// champ, pas une identité).
///
/// Trois règles, et l'ordre entre elles est le fond de l'affaire :
///
/// 1. **Une porte qui a ouvert une CAPTURE a une scène, quel que soit le
///    format.** Basculer une story en post ne détruit pas le canvas déjà
///    composé : la loi 9 autorise à changer de format, jamais à jeter ce qui
///    est composé. Faire décider le format seul aurait vidé l'écran de
///    quiconque tape « Post » depuis le tray.
/// 2. **Une REPRISE monte la surface où la composition reprise vit
///    RÉELLEMENT.** Le seul mécanisme de reprise du meuble est
///    `StoryComposerViewModel.adoptDraft`, qui repeuple l'ATELIER. Laisser le
///    format décider ici aurait été la mine posée pour V3 :
///    `.draft`/`.share` sont les deux seules portes `routesToLegacy: nil` qui
///    ouvrent en `.resume`, et leur `initialFormat` est le `.post` TRANSITOIRE
///    de la rév. 3 — rouvrir un brouillon aurait donc affiché un éditeur de
///    texte VIDE pendant que le brouillon adopté attendait dans l'atelier,
///    juste derrière. **Condition de levée nommée** : le jour où le meuble sait
///    adopter un brouillon de DOCUMENT (et non plus seulement de scène),
///    `.resume` redescend sous la règle 3.
/// 3. **Sinon le format décide, et il décide à TROIS issues.** Une story et un
///    réel SONT des scènes (des pages, une prise continue) ; un post est un
///    document — du texte long et des pièces, sans canvas ; un mood est sa
///    PROPRE surface — dix emojis, 122 caractères, aucune pièce.
///
///    Jusqu'au 2026-08-24, cette règle rangeait le mood du côté du document.
///    C'était le repli d'une énumération qui n'avait que deux cas, pas une
///    mesure : le mood ne partage avec le document ni la rangée d'outils, ni
///    la capture, ni le plafond de saisie. Le lot 4 lui donne son cas, et
///    cette phrase-ci est réécrite dans le MÊME commit — un commentaire de
///    règle laissé sous un code qui l'a démenti devient la loi que lira la
///    session suivante. La formulation retirée est nommée hors de ce fichier,
///    par `ComposerDocumentSurfaceTests`
///    `.test_leCommentaireDeRegle_naffirmePlus_queLeMoodEstUnDocument`, pour
///    qu'elle ne puisse pas y revenir sans faire rougir quelque chose.
///
///    Le `switch` sur le format reste exhaustif : un cinquième format casserait
///    la compilation ICI, et c'est la propriété qu'on veut.
///
/// La conséquence que V3 attend : `.feedComposer` (clavier sur contenu, format
/// `.post`) monte le DOCUMENT, et bascule sur la scène le jour où son auteur
/// choisit « Story » dans l'éventail. C'est la seconde condition de levée de la
/// garde négative de l'éventail.
nonisolated enum ComposerSurfaceRouting {

    static func surface(opening: ComposerOpening, format: ComposerFormat) -> ComposerSurfaceKind {
        switch opening {
        case .cameraReady, .videoCameraReady, .resume:
            return .scene
        case .keyboardOnContent, .moodGrid:
            switch format {
            case .story, .reel: return .scene
            case .post: return .document
            case .status: return .mood
            }
        }
    }

    /// Le clavier ne se lève QUE là où la porte a promis qu'on écrirait
    /// d'emblée. Une reprise de brouillon ne le lève pas : le clavier
    /// recouvrirait le document qu'on vient de rouvrir pour le relire.
    ///
    /// `.moodGrid` ne le lève pas non plus, et ce cas n'a PAS bougé au lot 4
    /// alors même que le mood changeait de surface : on choisit un emoji avant
    /// d'écrire, et lever le clavier recouvrirait la grille — c'est-à-dire le
    /// seul geste que le mood exige (`ComposerMoodPolicy.canPublish`).
    static func focusesContentOnAppear(opening: ComposerOpening) -> Bool {
        switch opening {
        case .keyboardOnContent: return true
        case .cameraReady, .videoCameraReady, .moodGrid, .resume: return false
        }
    }
}

/// **QUI peint le chrome de publication — audience, aperçu, flèche — sous la
/// surface que le meuble a montée.**
///
/// La règle vit ICI, à côté de `ComposerSurfaceRouting`, pour exactement la même
/// raison qu'elle : elle est éprouvable sans monter la moindre vue. Elle
/// remplace une CONSTANTE (`chromeOwner: ComposerChromeOwner = .atelier`) qui
/// portait, pour les trois surfaces, une raison qui n'en concernait qu'une.
///
/// Les deux blocages qui imposaient `.atelier` sont MESURÉS, et ce sont des
/// blocages de la SCÈNE, tous deux dans `MeeshyUI` : `visibilityMenu` est
/// l'unique écrivain d'audience de l'atelier, et l'œil du socle rendrait un
/// aperçu amputé des médias préchargés, `internal` au SDK. Sous le document et
/// sous le mood, **il n'y a pas d'atelier** — rien à retirer à personne, aucun
/// média local à précharger. Une raison qui ne vaut que pour l'une des trois
/// surfaces n'a rien à faire dans une constante qui les gouverne toutes.
nonisolated enum ComposerChromeOwnership {

    /// `.scene` cède à l'atelier ; les deux autres reviennent au meuble.
    ///
    /// Ce n'est pas « le host publie » : c'est « le host PEINT le chrome ».
    /// L'envoi reste une fermeture que le site de montage fournit
    /// (`MeeshyComposerHost.onPublishDocument`) — le meuble transmet.
    static func owner(for surface: ComposerSurfaceKind) -> ComposerChromeOwner {
        switch surface {
        case .scene: return .atelier
        case .document, .mood: return .host
        }
    }

    /// Les zones que le socle peint RÉELLEMENT sous une surface donnée.
    ///
    /// La loi 5 dit que le socle ne varie jamais selon la PORTE. Elle n'a jamais
    /// dit qu'il peignait une commande sans objet : il s'efface déjà devant
    /// l'atelier, qui peint les mêmes trois zones. La même phrase, tenue jusqu'au
    /// bout, donne les trois lignes ci-dessous.
    ///
    /// - `.scene` — RIEN. L'atelier assemble les trois ; en peindre une seconde
    ///   série donnerait deux audiences, deux yeux et deux flèches, dont une
    ///   inerte, sur la surface de création la plus utilisée.
    /// - `.document` — les trois, personne d'autre ne les peignant. **Dette
    ///   CONSIGNÉE, non refermée ici** : l'œil ouvre `MeeshyScenePlayer` sur
    ///   `viewModel.currentEffects`, que la surface document ne remplit pas — il
    ///   rendrait donc une scène VIDE. La cause est celle de
    ///   `servedDocumentTools == []` : le meuble n'a pas de chemin d'ingestion,
    ///   donc pas de média, donc rien à prévisualiser. Aucune porte de production
    ///   ne monte ce document, et
    ///   `test_aucunSiteDeProduction_neMonteUnePorteDocument_tantQueLeDocumentEstUneImpasse`
    ///   le retient.
    /// - `.mood` — la flèche SEULE. L'audience y est ABSENTE, jamais grisée
    ///   (loi 4) : `ComposerMoodSurface` porte son propre sélecteur six niveaux
    ///   avec sa mémoire `@AppStorage("lastStatusVisibility")` (loi 10), tandis
    ///   qu'`audienceChip` n'est qu'un témoin inerte. Le poser au-dessus d'un
    ///   vrai sélecteur ferait deux affichages pour un même réglage — ce que le
    ///   commentaire d'`audienceChip` s'interdit lui-même. L'œil est absent pour
    ///   une raison plus dure : un mood n'a pas de canvas, et la loi 6 interdit
    ///   d'en fabriquer un aperçu.
    ///
    /// **Divergence ASSUMÉE avec le plan du lot 4**, qui écrivait « sous `.mood`
    /// … audience + flèche ». La mesure a tranché contre lui, et le dire ici vaut
    /// mieux que de le laisser découvrir à l'écran.
    static func socleZones(for surface: ComposerSurfaceKind) -> [ComposerTopBarControl] {
        switch surface {
        case .scene: return []
        case .document: return [.audience, .preview, .publish]
        case .mood: return [.publish]
        }
    }
}

/// La rangée d'outils du document — **des données, pas une vue**.
///
/// Elle miroite celle de `FeedComposerSheet` (`FeedView+Attachments.swift`),
/// dans son ORDRE : photo · caméra · emoji · document · lieu · micro. L'ordre
/// n'est pas décoratif — c'est la position que les doigts connaissent depuis
/// des mois sur la porte la plus utilisée de l'app.
nonisolated enum ComposerDocumentTool: String, CaseIterable, Equatable {
    case photo
    case camera
    case emoji
    case document
    case place
    case microphone

    /// L'ordre de la feuille historique. `allCases` suit l'ordre de
    /// déclaration, mais rien ne garantit qu'il ne bougera pas : la rangée est
    /// écrite ici en toutes lettres, et `ComposerDocumentSurfaceTests` vérifie
    /// qu'aucun outil n'en manque.
    static let canonicalRow: [ComposerDocumentTool] = [
        .photo, .camera, .emoji, .document, .place, .microphone
    ]

    var symbolName: String {
        switch self {
        case .photo: return "photo.fill"
        case .camera: return "camera.fill"
        case .emoji: return "face.smiling.fill"
        case .document: return "doc.fill"
        case .place: return "location.fill"
        case .microphone: return "mic.fill"
        }
    }
}

/// Ce que la rangée montre — et la loi 4 y tient en une phrase : **un outil non
/// servi est ABSENT, jamais grisé.**
nonisolated enum ComposerDocumentToolPolicy {

    /// - Parameters:
    ///   - served: les outils que le SITE de montage sait réellement servir.
    ///     C'est lui qui possède le chemin d'ingestion ; peindre un outil qu'il
    ///     ne sert pas ouvrirait un sélecteur dont le résultat n'aurait nulle
    ///     part où aller.
    ///   - allowsCapture: `ComposerProfile.allowsCapture`. Une porte qui
    ///     reprend un contenu déjà publié (repost, édition) refuse la caméra ;
    ///     l'outil disparaît alors de la rangée au lieu d'y rester inerte.
    static func visibleTools(
        served: [ComposerDocumentTool],
        allowsCapture: Bool
    ) -> [ComposerDocumentTool] {
        guard !allowsCapture else { return served }
        return served.filter { $0 != .camera }
    }
}

/// Par où part un document — la troisième capacité que la spec nomme, et la
/// seule dont l'oubli PERD du contenu.
///
/// Mesuré sur `FeedComposerSheet` le 2026-08-23, chemin par chemin :
/// - texte seul → `FeedViewModel.createPost`, qui enfile un post durable quand
///   le réseau manque (« survives offline + app kill ») ;
/// - média + hors ligne → `createOfflineMediaPost`, la file durable, avec sa
///   preview locale et son flush à la reconnexion ;
/// - média + en ligne → l'upload tus puis `createPost` ;
/// - citation → `repostPost`, un appel réseau DIRECT.
///
/// Les deux premiers sont durables, le quatrième ne l'est pas — et c'est
/// consigné ici pour que personne ne le découvre au moment de recâbler la
/// porte.
nonisolated enum ComposerDocumentSendPath: Equatable {
    /// La citation : `POST /posts/:id/repost`. Pas de file durable.
    case quotedRepost
    /// Texte (ou lieu) seul : déjà durable, en ligne comme hors ligne.
    case textOnly
    /// La file durable — le seul chemin qui survit à un hors-ligne ET à un kill.
    case durableOutbox
    /// L'upload tus, puis la création. Ne vaut qu'en ligne : hors ligne il jette.
    case upload

    /// Ce qui survit à un hors-ligne suivi d'un kill de l'app.
    var isDurable: Bool {
        switch self {
        case .textOnly, .durableOutbox: return true
        case .quotedRepost, .upload: return false
        }
    }
}

/// **Sans appelant, et ASSUMÉ tel quel** — pas un oubli de câblage.
///
/// Le meuble ne publie pas : l'unique publieur est la barre du SDK
/// (`publishAllSlides()`), et le socle NOMME la publication sans la piloter.
/// Brancher cette table aujourd'hui exigerait d'écrire le second chemin d'envoi
/// que la doctrine, C2 et le lot V7 interdisent tous les trois.
///
/// Ce qu'elle vaut donc en attendant : une MESURE consignée, chemin par chemin,
/// de ce que la feuille historique fait réellement — c'est la seule chose que
/// V7 ne pourra pas redécouvrir sans relire `FeedComposerSheet` ligne à ligne.
///
/// **Condition de levée nommée** : le jour où le meuble possède son envoi (V7,
/// file de publication unifiée), `test_leRoutageDEnvoi_nEstMonteNullePart` se
/// RETOURNE — il ne se supprime pas.
nonisolated enum ComposerDocumentSendRouting {

    /// L'ordre des trois questions EST la règle, et l'inverser perd du contenu :
    /// tester le hors-ligne après avoir choisi l'upload enverrait une
    /// composition média dans un tus qui jette dès la première requête.
    ///
    /// - Parameter hasLocalMedia: une pièce jointe portée par un fichier LOCAL
    ///   — image, vidéo, document ou **son enregistré**. La feuille historique
    ///   n'y range pas son audio (`publishAudioFromSheet` monte droit sur tus,
    ///   commentaire à l'appui : « Audio offline posts aren't queued through
    ///   this composer path yet ») ; un enregistrement composé hors ligne y est
    ///   donc perdu. La surface document ne reconduit pas cette exception : un
    ///   fichier local est un fichier local.
    static func path(
        isQuote: Bool,
        hasLocalMedia: Bool,
        isOffline: Bool
    ) -> ComposerDocumentSendPath {
        if isQuote { return .quotedRepost }
        guard hasLocalMedia else { return .textOnly }
        return isOffline ? .durableOutbox : .upload
    }
}

/// **Le gate de MATIÈRE du socle** — ce sans quoi une pression sur la flèche
/// partirait sur une page blanche.
///
/// Il existe parce que le socle a cessé d'être un témoin. Tant que
/// `publishButton` était un `Label`, aucun gate n'était nécessaire : rien ne
/// partait. Un vrai bouton le rend OBLIGATOIRE — et c'est la première des deux
/// conditions que le meuble consignait déjà pour la scène, « la télécommande
/// n'a pas de gate de matière ».
///
/// Il ne réécrit pas la règle du mood : il DÉLÈGUE à
/// `ComposerMoodPolicy.canPublish`, qui la tient depuis le lot 4.4. Deux gates
/// pour un même format divergeraient au premier assouplissement.
nonisolated enum ComposerDocumentPublishGate {

    /// - Parameter surface: la surface MONTÉE. `.scene` rend toujours `false`, et
    ///   ce n'est pas une précaution gratuite : le jour où le socle publiera sous
    ///   la scène, il devra passer par le gate de l'atelier (`canPublish`,
    ///   `internal` à `MeeshyUI`) et non par celui-ci, qui ne voit ni les
    ///   diapositives ni la timeline. Rendre `false` REFUSE ; il n'invente pas
    ///   une réponse qu'il n'a pas.
    static func canPublish(
        surface: ComposerSurfaceKind,
        emoji: String?,
        text: String,
        isPublishing: Bool
    ) -> Bool {
        guard !isPublishing else { return false }
        switch surface {
        case .scene:
            return false
        case .mood:
            return ComposerMoodPolicy.canPublish(emoji: emoji, isPublishing: isPublishing)
        case .document:
            return !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }
}

/// **Ce que le socle remet au site de montage quand l'auteur presse la flèche.**
///
/// Une VALEUR, pas un envoi. Le meuble ne publie toujours pas : il assemble ce
/// qui a été composé et le tend à une fermeture que la porte lui a donnée,
/// exactement comme `onPublishAllInBackground` le fait pour la scène.
///
/// **Ce canal appartient au lot 4 et y RESTE.** Ne pas écrire ici qu'un lot
/// ultérieur l'absorbera : le plan du lot 7 déclare le dossier `Composer`
/// interdit et fait naître son `PublishIntent` sous `Services/`. Un travail que
/// chacun croit chez l'autre est un travail que personne ne fait.
///
/// — Le glob du plan est écrit ici en toutes lettres, et jamais sous sa forme
/// abrégée : celle-ci contient la séquence qui OUVRE un commentaire de bloc, et
/// le dépouilleur de `MyStoriesSourceCorpus` jette alors tout le reste du
/// fichier. Voir la note jumelle dans `MeeshyComposerHost`.
///
/// **Un seul paramètre opaque**, et c'est délibéré : la fermeture de la scène
/// porte douze arguments positionnels, et c'est ce qui la rend impossible à
/// faire évoluer sans toucher chacun de ses sites. Ajouter un champ ici n'en
/// touche aucun.
///
/// Les deux normalisations que la loi impose vivent dans les FABRIQUES, pas chez
/// l'appelant : `nil` plutôt que `[]` pour les mentions (loi 3 — un tableau vide
/// est entendu par le serveur comme un EFFACEMENT), et la liste nominative
/// écartée quand l'audience ne l'exige pas. Les laisser aux quatre sites de
/// montage du lot 4.6, ce serait écrire la loi 3 quatre fois.
nonisolated struct ComposerDocumentDraft: Equatable {
    let format: ComposerFormat

    /// `nil` quand rien n'a été tapé — la forme exacte que `setStatus` attend
    /// (`statusText.isEmpty ? nil : statusText`), et qui distingue « pas de
    /// texte » de « texte effacé ».
    let text: String?

    let emoji: String?
    let visibility: PostVisibility

    /// `nil` hors `ONLY`/`EXCEPT` : porter une liste sous une audience qui n'en
    /// veut pas la ferait persister pour rien.
    let visibilityUserIds: [String]?

    let mentions: [PostMentionInput]?
    let repostOfId: String?
    let audioUrl: String?

    /// Le brouillon d'un MOOD.
    ///
    /// `repostOfId` et `audioUrl` sont les deux graines d'une republication (lot
    /// 4.7). Elles ont un défaut ici, contrairement au reste, parce que leur
    /// absence EST le cas normal — un mood créé n'en a pas — et qu'aucun site ne
    /// peut donc les perdre en silence.
    static func mood(
        emoji: String?,
        text: String,
        visibility: PostVisibility,
        visibilityUserIds: [String],
        references: [ComposerReference],
        repostOfId: String? = nil,
        audioUrl: String? = nil
    ) -> ComposerDocumentDraft {
        ComposerDocumentDraft(
            format: .status,
            text: text.isEmpty ? nil : text,
            emoji: emoji,
            visibility: visibility,
            visibilityUserIds: visibility.requiresUserSelection ? visibilityUserIds : nil,
            mentions: ComposerMoodPolicy.declared(references),
            repostOfId: repostOfId,
            audioUrl: audioUrl
        )
    }

    /// Le brouillon d'un DOCUMENT.
    ///
    /// Il ne porte ni emoji, ni mentions, ni graine de repost — et ce n'est pas
    /// un oubli : la surface document n'a ni grille d'emojis ni barre de
    /// références, et aucune porte de production ne la monte. Lui inventer des
    /// champs qu'aucune vue ne remplit aurait fabriqué une capacité que le
    /// premier lecteur aurait crue tenue.
    static func document(
        format: ComposerFormat,
        text: String,
        visibility: PostVisibility
    ) -> ComposerDocumentDraft {
        ComposerDocumentDraft(
            format: format,
            text: text.isEmpty ? nil : text,
            emoji: nil,
            visibility: visibility,
            visibilityUserIds: nil,
            mentions: nil,
            repostOfId: nil,
            audioUrl: nil
        )
    }
}

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

    /// La SORTIE n'a pas de clé neuve : `common.close` existe et est traduite
    /// dans les sept langues du catalogue. Le cliquet de complétude de ce dépôt
    /// est épinglé à un plafond, et une clé de plus pour un mot déjà traduit
    /// l'en rapproche pour rien.
    static var close: String {
        String(localized: "common.close", defaultValue: "Fermer", bundle: .main)
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
        case .emoji:
            return String(localized: "composer.attach.emoji",
                          defaultValue: "Emoji", bundle: .main)
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

/// **La surface « document sans scène »** (V2, I6) — absorbée depuis
/// `FeedComposerSheet`.
///
/// Ce qu'elle est : une PRÉSENTATION. Des valeurs immuables entrent, des
/// événements sortent. Elle ne possède ni pièces jointes, ni sélecteurs, ni
/// chemin d'envoi — ces trois-là appartiennent au site qui la monte, et les
/// dupliquer ici ferait deux pipelines d'ingestion pour un seul composer, quand
/// celui de `ComposerDropResolver`/`ComposerIngestRouter` tourne déjà sur six
/// sites de production.
///
/// Ce qu'elle n'est PAS : un second chemin de publication. Le socle du meuble
/// nomme la publication, le SDK la déclenche, et V7 unifiera la file. Une
/// surface qui publierait elle-même serait exactement la dette que ce chantier
/// défait ailleurs.
///
/// **Aucun outil monté sans destination.** `tools` est ce que le site sert, et
/// une rangée vide ne se peint pas du tout (loi 4). C'est ce qui permet à cette
/// surface d'exister AVANT que l'ingestion du meuble soit branchée sans devenir
/// l'affordance sans effet que la doctrine interdit.
struct ComposerDocumentSurface: View {

    @Binding var text: String

    /// Les outils que le site de montage sait servir, déjà filtrés par
    /// `ComposerDocumentToolPolicy`. Vide ⇒ aucune rangée.
    let tools: [ComposerDocumentTool]

    /// `ComposerSurfaceRouting.focusesContentOnAppear(opening:)`. Passé plutôt
    /// que déduit : la surface ne connaît pas la porte, et aller la chercher
    /// ferait d'elle une seconde lectrice de la table de C1.
    let focusesOnAppear: Bool

    /// **La SORTIE**, et c'est un paramètre OBLIGATOIRE — non optionnel, sans
    /// valeur par défaut.
    ///
    /// La scène tient la sienne de l'atelier du SDK (`StoryComposerView` reçoit
    /// `onDismiss` et peint la croix) ; le document n'a pas d'atelier. Une
    /// surface montée sans issue est un écran dont on ne sort pas — et comme
    /// V3 devait la brancher sur `.feedComposer`, la porte la plus utilisée de
    /// l'app, on aurait livré le cul-de-sac à l'endroit le plus fréquenté.
    ///
    /// Elle n'est pas optionnelle à dessein : un `nil` par défaut n'aurait
    /// cassé aucune compilation au site de montage suivant, et la sortie aurait
    /// disparu sans un mot — exactement le silence que `initialVisibility`
    /// avait déjà coûté un cran plus haut.
    let onClose: () -> Void

    var onTool: ((ComposerDocumentTool) -> Void)? = nil

    @FocusState private var isContentFocused: Bool

    /// Le même délai que la feuille historique. Une prise de focus posée dans
    /// le tour de boucle de la présentation est avalée par l'animation de
    /// montée : le clavier ne se lève pas, et rien ne le signale.
    private static let focusDelay: TimeInterval = 0.3

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            exitAffordance
            content
            Spacer(minLength: 0)
            toolRow
        }
        .onAppear { raiseKeyboardIfPromised() }
    }

    /// L'issue, en haut à gauche — la position qu'occupe déjà la croix de
    /// l'atelier, pour que les deux surfaces du meuble se quittent du même
    /// geste. Elle n'est PAS dans le socle : le socle a trois zones et ne bouge
    /// jamais (loi 5), y ajouter une quatrième pour la seule surface document
    /// l'aurait fait dépendre de la porte.
    private var exitAffordance: some View {
        HStack(spacing: 0) {
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(MeeshyColors.textSecondary(isDark: true))
            }
            .accessibilityLabel(Text(ComposerDocumentCopy.close))
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }

    /// Le placeholder n'est PAS peint en `textMuted`, qui serait le réflexe.
    /// Ce jeton mesure 4,41:1 sur le violet profond du plateau — sous AA texte
    /// normal, constat déjà consigné par `ComposerPlateauTests` avec un témoin
    /// négatif. `textSecondary` est le seul premier plan mesuré au-dessus du
    /// seuil sur les TROIS teintes, et le plateau se choisit.
    private var content: some View {
        ZStack(alignment: .topLeading) {
            if text.isEmpty {
                Text(ComposerDocumentCopy.placeholder)
                    .font(.body)
                    .foregroundColor(MeeshyColors.textSecondary(isDark: true))
                    .padding(.horizontal, 16)
                    .padding(.top, 12)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $text)
                .focused($isContentFocused)
                .scrollContentBackground(.hidden)
                .foregroundColor(MeeshyColors.textPrimary(isDark: true))
                .font(.body)
                .frame(minHeight: 120)
                .padding(.horizontal, 12)
                .padding(.top, 4)
                .accessibilityLabel(Text(ComposerDocumentCopy.placeholder))
        }
    }

    /// Une seule teinte pour les six outils, là où la feuille historique en
    /// portait six. Ce n'est pas un appauvrissement : ces couleurs vives
    /// avaient été mesurées sur un fond CLAIR, et le plateau du meuble est
    /// sombre par construction (`PlateauTint`, trois teintes toutes sombres).
    /// Les y recopier aurait posé six contrastes non mesurés d'un coup.
    @ViewBuilder
    private var toolRow: some View {
        if !tools.isEmpty {
            HStack(spacing: 16) {
                ForEach(tools, id: \.rawValue) { tool in
                    Button {
                        onTool?(tool)
                    } label: {
                        Image(systemName: tool.symbolName)
                            .font(.title3)
                            .foregroundColor(MeeshyColors.textSecondary(isDark: true))
                    }
                    .accessibilityLabel(Text(ComposerDocumentCopy.label(tool)))
                }
                Spacer()
            }
            .padding(16)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(Text(ComposerDocumentCopy.toolRow))
        }
    }

    private func raiseKeyboardIfPromised() {
        guard focusesOnAppear else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.focusDelay) {
            isContentFocused = true
        }
    }
}
