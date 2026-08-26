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
/// 1. **Une porte qui a ouvert une CAPTURE — ou qui a DÉJÀ posé son média —
///    a une scène, quel que soit le format.** Basculer une story en post ne
///    détruit pas le canvas déjà composé : la loi 9 autorise à changer de
///    format, jamais à jeter ce qui est composé. Faire décider le format seul
///    aurait vidé l'écran de quiconque tape « Post » depuis le tray. C'est la
///    même raison, un cran plus littéral, qui range `.mediaSeeded` ici : le
///    document ne porte NI `mediaIds`, NI fichier, NI lieu, si bien qu'un
///    « Post » routé vers lui ferait disparaître le média semé de l'écran ET de
///    la publication.
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
        case .cameraReady, .videoCameraReady, .resume, .mediaSeeded:
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
    /// `.mediaSeeded` ne le lève pas davantage, et c'est le sens même du cas :
    /// il n'existe aucun champ « contenu » sous l'atelier — on y écrit en
    /// posant un OBJET TEXTE. La porte du média reçu a annoncé ce clavier
    /// jusqu'au lot 5 sans qu'aucune ligne ne le lève.
    ///
    /// `.moodGrid` ne le lève pas non plus, et ce cas n'a PAS bougé au lot 4
    /// alors même que le mood changeait de surface : on choisit un emoji avant
    /// d'écrire, et lever le clavier recouvrirait la grille — c'est-à-dire le
    /// seul geste que le mood exige (`ComposerMoodPolicy.canPublish`).
    static func focusesContentOnAppear(opening: ComposerOpening) -> Bool {
        switch opening {
        case .keyboardOnContent: return true
        case .cameraReady, .videoCameraReady, .moodGrid, .resume, .mediaSeeded: return false
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
    /// l'atelier, qui peint les mêmes zones. La même phrase, tenue jusqu'au
    /// bout, donne les trois lignes ci-dessous.
    ///
    /// - `.scene` — RIEN. L'atelier assemble les trois ; en peindre une seconde
    ///   série donnerait deux audiences, deux yeux et deux flèches, dont une
    ///   inerte, sur la surface de création la plus utilisée.
    /// - `.document` — l'audience et la flèche, personne d'autre ne les
    ///   peignant. **L'œil en est parti le 2026-08-24, par RETRAIT et non par
    ///   réparation.** Il ouvrait `MeeshyScenePlayer` sur
    ///   `viewModel.currentEffects`, que la surface document ne remplit pas :
    ///   une scène VIDE. La cause a SURVÉCU à l'arrivée de la rangée d'outils —
    ///   le seul outil servi (`ComposerDocumentTool.effect`) insère du TEXTE et
    ///   ne rapporte aucun média, donc toujours rien à prévisualiser. Un outil
    ///   peint n'est pas un chemin d'ingestion, et confondre les deux
    ///   rebrancherait l'œil sur le même vide. Une dette CONSIGNÉE reste de l'UI morte tant qu'elle
    ///   est peinte, et la loi 4 ne fait pas d'exception pour ce qui est écrit
    ///   dans un doc-comment. La loi 6 ferme l'autre issue : fabriquer un
    ///   aperçu maison du texte serait un quatrième chemin de rendu. L'œil
    ///   revient le jour où le document a des médias à montrer, pas avant.
    ///   L'audience, elle, RESTE — et elle CHOISIT depuis le même lot
    ///   (`MeeshyComposerHost.audienceChip`), avec la mémoire du format post
    ///   (`ComposerAudienceMemory.postKey`).
    /// - `.mood` — la flèche SEULE. L'audience y est ABSENTE, jamais grisée
    ///   (loi 4) : `ComposerMoodSurface` porte son propre sélecteur six niveaux,
    ///   dans le RUBAN de son bloc 3, avec la mémoire du format status
    ///   (`ComposerAudienceMemory.statusKey`, loi 10). En peindre un second au
    ///   socle ferait deux contrôles pour un même réglage sur un même écran.
    ///
    ///   **Ce n'est PLUS la même raison qu'avant le lot 4.9**, et la nuance
    ///   compte pour la suite : `audienceChip` n'est plus un témoin inerte, c'est
    ///   un vrai sélecteur. Ce qui l'exclut ici n'est donc pas son inertie mais
    ///   la PLACE — deux formes d'un même réglage, l'une dans le corps, l'autre
    ///   dans le socle. Les deux formes existent à dessein : un ruban de six
    ///   chips tient dans un bloc, jamais dans une rangée qui porte aussi la
    ///   flèche.
    ///
    ///   L'œil est absent pour une raison plus dure : un mood n'a pas de canvas,
    ///   et la loi 6 interdit d'en fabriquer un aperçu.
    ///
    /// **Divergence ASSUMÉE avec le plan du lot 4**, qui écrivait « sous `.mood`
    /// … audience + flèche ». La mesure a tranché contre lui, et le dire ici vaut
    /// mieux que de le laisser découvrir à l'écran.
    static func socleZones(for surface: ComposerSurfaceKind) -> [ComposerTopBarControl] {
        switch surface {
        case .scene: return []
        case .document: return [.audience, .publish]
        case .mood: return [.publish]
        }
    }
}

/// **La mémoire d'audience — une par FORMAT (loi 10), et sa relecture.**
///
/// Deux choses que rien ne doit séparer : sous QUELLE clé une audience se
/// souvient, et CE QU'ELLE REND quand on la relit. Les tenir ensemble est ce qui
/// répare la forme précédente — `StatusComposerView` écrivait la clé dans la vue
/// et la relisait dans la même vue, si bien qu'aucun test ne pouvait dire ce
/// qu'une mémoire corrompue devait rendre.
///
/// **Une clé par format, jamais une pour tous.** Le cas qui commande : un auteur
/// restreint son mood à trois personnes. Sous une mémoire partagée, le post
/// qu'il écrit ensuite s'ouvrirait en `ONLY` sur ces trois personnes — un
/// rétrécissement d'audience que rien à l'écran n'annoncerait.
nonisolated enum ComposerAudienceMemory {

    /// La mémoire du format status — **celle de l'écran historique**, à l'octet
    /// près. Une clé neuve en ferait une seconde mémoire, donc deux réglages à
    /// faire diverger pour un seul geste d'auteur.
    static let statusKey = "lastStatusVisibility"

    /// La mémoire du format post. `FeedComposerSheet` n'en avait AUCUNE — son
    /// audience repart à `PUBLIC` à chaque ouverture. C'est donc une capacité
    /// que le meuble AJOUTE, et non une parité qu'il tient : le dire évite qu'on
    /// la lise plus tard comme une régression de la feuille historique.
    static let postKey = "lastPostVisibility"

    /// `nil` sous la scène, et c'est une RÉPONSE, pas un trou : l'atelier reçoit
    /// sa graine par `initialVisibility`, que le tray alimente depuis
    /// `lastComposerVisibility`. Le socle n'y peint aucune audience
    /// (`ComposerChromeOwnership.socleZones(for: .scene)` est vide), et lui
    /// inventer une mémoire ici en ferait une seconde à faire diverger de celle
    /// du tray.
    ///
    /// Le `switch` reste exhaustif : un cinquième format casse la compilation
    /// ICI, avant de pouvoir hériter d'une mémoire par défaut.
    static func key(for format: ComposerFormat) -> String? {
        switch format {
        case .status: return statusKey
        case .post: return postKey
        case .story, .reel: return nil
        }
    }

    /// Ce qu'une mémoire rend quand on la relit — `.public` dès qu'elle porte
    /// autre chose qu'une audience relisible ET exploitable.
    ///
    /// **TROIS replis, et ils répondent à DEUX questions distinctes.** Les deux
    /// premiers demandent « cette valeur est-elle LISIBLE ? » : une valeur
    /// INCONNUE (mémoire d'une version antérieure, réglage effacé) se voit tout
    /// de suite ; une valeur connue mais HORS OFFRE est plus coûteuse, aucun
    /// chip ne la montre et l'auteur publierait sous un réglage qu'aucun écran
    /// ne lui a dit.
    ///
    /// Le troisième demande « une fois relue, est-elle EXPLOITABLE ? », et c'est
    /// une autre question. `ONLY` et `EXCEPT` sont parfaitement lisibles,
    /// parfaitement offertes — et leur portée EST la liste d'utilisateurs qui
    /// les accompagne, que cette mémoire ne porte PAS : elle ne persiste qu'un
    /// `rawValue`. Les relire telles quelles restaurait donc une audience
    /// nominative avec une liste vide, que `CreatePostSchema` refuse
    /// (« EXCEPT and ONLY visibility require at least one userId in
    /// visibilityUserIds »). Et comme rien ne réécrit la mémoire sur un échec,
    /// la publication échouait à CHAQUE ouverture suivante — un seul post
    /// restreint suffisait à bloquer durablement la porte.
    ///
    /// Persister la liste À CÔTÉ du mode serait l'autre réponse possible ; elle
    /// est refusée ici : une liste d'identifiants qui survit à la session
    /// ressusciterait, des semaines plus tard, une audience que l'auteur ne
    /// reverrait qu'après avoir publié.
    static func remembered(_ rawValue: String?) -> PostVisibility {
        guard let rawValue,
              let remembered = PostVisibility(rawValue: rawValue),
              PostVisibility.composerSelectableCases.contains(remembered),
              !remembered.requiresUserSelection else {
            return .public
        }
        return remembered
    }
}

/// **Ce qu'un écran a le DROIT de proposer comme audience** — l'offre, distincte
/// de la mémoire qui en choisit une.
///
/// Elle vit à côté de `ComposerAudienceMemory` parce que les deux tiennent
/// ensemble un même invariant : *ce que la mémoire rend appartient toujours à
/// l'offre*. Séparées, un chip s'ouvrirait sans marque et l'auteur publierait
/// sous un réglage qu'aucun écran ne lui aurait dit —
/// `test_touteMemoireRelue_appartientALOffre_desDeuxCotesDeLaRepublication` le
/// tient.
///
/// # Pourquoi une REPUBLICATION n'offre pas les six
///
/// `EXCEPT` et `ONLY` ne se lisent pas seules : leur portée EST la liste
/// d'utilisateurs qui les accompagne. Sur une republication, cette liste vient
/// de la SOURCE — `StoryRepostAudience.inheritsAudienceList`, miroir de
/// `repostVisibilityInheritsAudienceList` que `PostService.createPost` applique
/// en REMPLAÇANT `data.visibilityUserIds` par ceux de l'original.
///
/// Le sélecteur nominatif était donc peint, ouvrable, renseignable — et son
/// résultat n'avait aucun effet (loi 4 : un contrôle existe s'il a un EFFET).
/// Pire : republier une humeur PUBLIQUE en `ONLY` produisait un post `ONLY`
/// portant la liste vide de la source, c'est-à-dire visible de PERSONNE, sur une
/// feuille qui s'était refermée sur un succès.
///
/// # Ce que cette règle ne fait PAS, et pourquoi elle ne le peut pas
///
/// Elle ne plafonne pas l'ÉLARGISSEMENT — republier en `PUBLIC` une humeur
/// `FRIENDS` —, que le serveur refuse par un 403 `REPOST_AUDIENCE_WIDENING` et
/// que `StoryRepostAudience.allowed(from:)` saurait plafonner… si le client
/// connaissait l'audience de l'original.
///
/// Il ne la connaît pas, et le canal est mort UNE COUCHE plus bas que là où on
/// le cherche : `StatusEntry` porte bien un `visibility`, mais
/// `APIPost.toStatusEntry()` ne le lui passe pas — il vaut `nil` pour TOUTE
/// humeur que l'app affiche. Semer `visibility:` dans les graines de
/// republication donnerait donc `StoryRepostAudience.allowed(fromRawValue: nil)`,
/// c'est-à-dire `[.private]` : un ruban à UN chip sur chaque republication, la
/// loi 4 défaite dans l'autre sens.
///
/// **Condition de levée, en deux parties et dans cet ordre** : (1)
/// `toStatusEntry()` transmet `visibility` — une ligne, `StoryModels.swift`,
/// hors du dossier Composer ; (2) cette règle prend l'audience de l'original et
/// la passe à `StoryRepostAudience.allowed(from:)`, l'intersection restant
/// ordonnée par `composerSelectableCases`. Elle est mesurée par
/// `test_lOffre_dUneRepublication_nePlafonnePasLElargissement_fauteDeConnaitreLaSource`,
/// qui se RETOURNE ce jour-là.
nonisolated enum ComposerAudienceOffer {

    /// - Parameter origin: la PORTE. C'est elle qui sait si l'on republie
    ///   (`ComposerOrigin.repostedPostId`), et la lire ici évite qu'un site de
    ///   montage recopie ce fait dans un drapeau — deux sources pour une même
    ///   question.
    static func offered(for origin: ComposerOrigin) -> [PostVisibility] {
        guard origin.repostedPostId != nil else { return PostVisibility.composerSelectableCases }
        return PostVisibility.composerSelectableCases.filter {
            !StoryRepostAudience.inheritsAudienceList($0)
        }
    }
}

/// La FAMILLE de sélecteur qu'un outil d'attache ouvre pour poser un fichier
/// LOCAL dans le brouillon — la valeur associée de
/// `ComposerDocumentToolEffect.attachesLocalMedia`, jamais trois cas
/// distincts sur l'effet lui-même : `handleDocumentTool`
/// (`MeeshyComposerHost.swift`) reste ainsi aiguillé sur l'EFFET, pas sur
/// l'outil qui l'a déclenché.
///
/// `nonisolated` au niveau du TYPE — même patron que `ComposerLanguageFlag`
/// (`ComposerModels.swift:122-124`) : la cible app compile sous
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, le bundle de tests non, et une
/// valeur associée logée dans un `enum` `Equatable` nonisolated doit l'être
/// elle aussi.
nonisolated enum ComposerMediaIntake: Equatable {
    /// La pellicule — `PhotosPicker`.
    case photoLibrary
    /// La capture en direct — `CameraView`.
    case camera
    /// L'importateur de documents — `fileImporter`.
    case files
}

/// La rangée d'outils du document — **des données, pas une vue**.
///
/// Elle miroite celle de `FeedComposerSheet` (`FeedView+Attachments.swift`),
/// dans son ORDRE : photo · caméra · emoji · document · lieu · micro. L'ordre
/// n'est pas décoratif — c'est la position que les doigts connaissent depuis
/// des mois sur la porte la plus utilisée de l'app.
/// **Ce qu'un outil de la rangée sait faire aujourd'hui.**
///
/// Un type SOMME plutôt qu'un booléen « servi / pas servi », et pour la raison
/// que ce dépôt a déjà payée ailleurs : un booléen dit qu'un geste existe, il ne
/// dit pas LEQUEL, si bien que le site qui sert la rangée et le site qui la
/// câble finissent par répondre à deux questions différentes. Une valeur ici
/// nomme la destination, et le meuble n'a plus qu'à l'honorer.
nonisolated enum ComposerDocumentToolEffect: Equatable {

    /// Insère un emoji dans le TEXTE composé — pas dans l'emoji DÉFINISSANT
    /// d'un mood, qui est une autre matière et un autre gate
    /// (`ComposerMoodPolicy.canPublish`).
    ///
    /// C'est le seul effet qui n'INGÈRE rien : sa destination est le champ que
    /// le meuble possède déjà et que le brouillon emporte. Le précédent est
    /// mesuré et vivant — le composer inline du fil monte `EmojiPickerSheet` et
    /// fait exactement `composerText += emoji`.
    case insertsEmojiIntoText

    /// Ouvre un sélecteur qui pose un fichier LOCAL dans le brouillon (T2.3) —
    /// photothèque, caméra ou importateur de documents, selon
    /// `ComposerMediaIntake`.
    ///
    /// **Une valeur associée, jamais trois cas distincts** sur cet `enum` :
    /// `handleDocumentTool` reste aiguillé sur l'EFFET et non sur l'outil qui
    /// l'a déclenché — trois cas auraient rouvert exactement ce que `effect`
    /// referme ailleurs dans ce fichier, trois branches à tenir en phase avec
    /// trois outils au lieu d'une seule question posée à `ComposerMediaIntake` :
    /// « quel sélecteur ouvrir ? ».
    ///
    /// La destination existe désormais de bout en bout : `ComposerDocumentMedia`
    /// porte le fichier et son mime déclaré, `ComposerDocumentDraft.localMedia`
    /// l'emporte (T2.1), et `PublishIntent.document(localMedia:)` le poste tel
    /// quel.
    case attachesLocalMedia(ComposerMediaIntake)

    /// Ouvre `LocationPickerView` et pose une POSITION sur le brouillon (T2.5).
    ///
    /// **Ce n'ingère aucun fichier** — c'est pourquoi cet effet n'est pas une
    /// quatrième famille de `ComposerMediaIntake` : `attachesLocalMedia` répond
    /// à « quel sélecteur ouvrir pour un FICHIER ? », celui-ci répond à une
    /// question distincte, sans sélecteur commun.
    ///
    /// La destination existe de bout en bout : `ComposerDocumentDraft.location`
    /// la porte depuis T2.1 (semée `nil` faute de picker câblé), et
    /// `PublishIntent.document(location:)` la poste déjà telle quelle. Ce lot
    /// ferme le SEUL trou restant — aucun geste du meuble n'atteignait ce
    /// champ.
    ///
    /// **Le SECOND opt-in — « rendre trouvable à proximité » — n'est PAS un
    /// second effet.** Il voyage AVEC le lieu choisi, sur le même geste :
    /// `FeedNearbyDiscoverability.offers(hasPlace:visibility:)` en décide,
    /// jamais une valeur associée ici. Une position choisie sans jamais
    /// activer ce second opt-in reste un lieu affiché ordinaire — les deux
    /// opt-ins sont indépendants, dans les deux sens.
    case attachesLocation

    /// Ouvre `AudioPostComposerView` et pose un enregistrement vocal — AVEC sa
    /// transcription — dans le brouillon (T2.6, dernier outil de la rangée).
    ///
    /// **Ce n'ouvre aucun `ComposerMediaIntake`** : le sélecteur n'est ni la
    /// photothèque, ni la caméra, ni l'importateur de fichiers — c'est la
    /// feuille d'enregistrement/transcription dédiée, la même que le composer
    /// inline du fil monte déjà (`AudioPostComposerView`,
    /// `FeedView+Attachments.swift`).
    ///
    /// **La destination est double, et c'est le cœur du lot.** Le fichier
    /// enregistré rejoint `ComposerDocumentDraft.localMedia` comme un
    /// `ComposerDocumentMedia` ORDINAIRE — il part par la file durable, comme
    /// tout média local (T2.1/T2.3). La transcription, elle, voyage À CÔTÉ,
    /// dans `ComposerDocumentDraft.mobileTranscription` : c'est elle que
    /// `PublishIntent.document(transcription:)` consulte pour ÉLIRE la langue
    /// déclarée — la langue PARLÉE gagne sur la capsule du meuble, jamais
    /// l'inverse (régression fermée par 7.4b sur `audioRecording`, rouverte
    /// ici si `originalLanguage` partait tel quel).
    case attachesTranscribedAudio
}

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

    /// **Ce que cet outil DÉCLENCHE — et `nil` veut dire « rien ».**
    ///
    /// C'est ici que la loi 4 cesse d'être une discipline pour devenir une
    /// propriété du type. La rangée SERVIE se déduit de cette réponse
    /// (`servedRow`) : un outil sans effet n'est pas peint, et un outil peint
    /// a forcément un geste. Les deux dérives que la forme précédente laissait
    /// passer — une liste servie plus longue que les gestes câblés, un geste
    /// écrit pour un outil que rien ne sert — n'ont plus d'endroit où naître.
    ///
    /// **La question à poser avant d'ajouter une valeur ici n'est pas « sait-on
    /// ouvrir le sélecteur ? » mais « où va son RÉSULTAT ? »** — jusqu'au
    /// brouillon, puis jusqu'au publieur. **Trois `nil` sont tombés au T2.3** :
    /// `ComposerDocumentDraft.localMedia` (T2.1) porte désormais un fichier
    /// LOCAL, et `PublishIntent.document(localMedia:)` le poste. Photo, caméra
    /// et fichier ont donc une destination réelle — le même trou qui les
    /// retenait tous les trois à la fois.
    ///
    /// **`.place` gagne un effet au T2.5** : `ComposerDocumentDraft.location`
    /// (T2.1) trouve enfin son geste — `.attachesLocation` ouvre
    /// `LocationPickerView`. **`.microphone` gagne le SIEN au T2.6** —
    /// `.attachesTranscribedAudio` ouvre `AudioPostComposerView`, et c'est le
    /// dernier des six. `servedRow == canonicalRow` DÉSORMAIS — la garde de la
    /// porte du document (`ComposerDocumentSurfaceTests.test_laPorteDuDocument_...`)
    /// se retourne à ce lot, sur SA première condition seulement (la rangée) ;
    /// aucun site de production ne monte encore la porte pour autant.
    ///
    /// **Ce que `.place` ne fait PAS gagner : le tri-état de la feuille
    /// absorbée** (`PostLocationUpdate` : remplacer, retirer, ne pas toucher).
    /// `ComposerDocumentDraft.location: SharedPlace?` ne porte que DEUX états —
    /// un lieu, ou son absence — le seul dont une CRÉATION a besoin. Le
    /// troisième état appartient à l'ÉDITION, hors du périmètre de ce lot
    /// (`EditParityInventoryTests`, capacité « position tri-état »).
    ///
    /// Le `switch` reste exhaustif : un septième outil casse la compilation ICI
    /// plutôt que d'hériter d'un effet par défaut.
    var effect: ComposerDocumentToolEffect? {
        switch self {
        case .photo:
            return .attachesLocalMedia(.photoLibrary)
        case .camera:
            return .attachesLocalMedia(.camera)
        case .emoji:
            return .insertsEmojiIntoText
        case .document:
            return .attachesLocalMedia(.files)
        case .place:
            return .attachesLocation
        case .microphone:
            return .attachesTranscribedAudio
        }
    }

    /// Les outils que le meuble sert RÉELLEMENT — une projection de la rangée
    /// canonique, jamais une seconde liste.
    ///
    /// L'ordre vient donc de `canonicalRow` et de nulle part ailleurs : c'est la
    /// position que les doigts connaissent sur la feuille historique, et une
    /// liste écrite à part l'aurait reprise à son compte.
    static var servedRow: [ComposerDocumentTool] {
        canonicalRow.filter { $0.effect != nil }
    }

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
    /// Texte (ou lieu) seul : durable des DEUX côtés du réseau — **chez le
    /// publieur qui l'enfile lui-même**.
    ///
    /// La nuance n'est pas rhétorique : la durabilité est une propriété du
    /// PUBLIEUR, jamais du contenu. `FeedViewModel.createPost` enfile sa branche
    /// texte sans consulter la connectivité — mesuré, ce modèle n'a pas même
    /// d'`isOffline` —, ce qui rend ce chemin durable en ligne comme hors ligne.
    /// `StatusViewModel.setStatus` fait l'INVERSE sur la même forme de contenu :
    /// il n'atteint sa file que si `isOffline()` répond oui, et un échec réseau
    /// en ligne n'y laisse qu'un toast. Lire « textOnly donc durable » sans
    /// regarder QUI publie ferait donc certifier durable un envoi qui ne l'est
    /// pas.
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

/// **UN SEUL appelant depuis le lot 4.10 : `ComposerDocumentSendPlan`.**
///
/// Elle fut sans appelant, et l'assumait : le meuble ne publiait pas, l'unique
/// publieur était la barre du SDK, et la table ne valait que comme MESURE
/// consignée chemin par chemin de ce que la feuille historique fait réellement.
/// Cette mesure reste la sienne — c'est ce qu'aucun lot ultérieur ne pourra
/// redécouvrir sans relire `FeedComposerSheet` ligne à ligne.
///
/// Le meuble possède désormais l'ENVOI du document. `ComposerDocumentSendPlan`
/// l'interroge pour décider par où un brouillon a le droit de partir, et refuse
/// tout chemin qu'elle déclare non durable. Ce n'est pas un second chemin de
/// publication : la table ne publie rien, elle NOMME — l'envoi lui-même reste
/// chez le modèle du fil, qui possède l'outbox, le cache et la réconciliation
/// optimiste.
///
/// **La garde a été RETOURNÉE, jamais supprimée.**
/// `test_leRoutageDEnvoi_nAQuUnSeulAppelant_etCEstLeMeuble` exigeait zéro
/// appelant ; elle en exige exactement un, et vérifie qu'il vit dans le dossier
/// Composer. Un second interrogateur serait le second chemin d'envoi que la
/// doctrine, C2 et le lot 7 interdisent tous les trois — et il naîtrait là où
/// personne ne le cherche, puisque la table, elle, est désormais légitime.
nonisolated enum ComposerDocumentSendRouting {

    /// **Le média ne branche plus sur `isOffline` (résolution du blocage §B.3,
    /// vague 1b, 2026-08-26).** Mesuré : `FeedViewModel.publish` enfile sa
    /// ligne SANS condition réseau (doc-comment de `publish(_:)`,
    /// `FeedViewModel.swift:878-884` — « Aucune condition réseau ici, et c'est
    /// une décision »). Router un média EN LIGNE vers `.upload` refusait donc
    /// le cas NOMINAL : `ComposerDocumentSendPlan.plan` convertit tout chemin
    /// non durable en `.refuse`, et le seul publieur qui accepte ce chemin est
    /// déjà durable des deux côtés du réseau.
    ///
    /// - Parameter hasLocalMedia: une pièce jointe portée par un fichier LOCAL
    ///   — image, vidéo, document ou **son enregistré**. Depuis c10801bbca (lot
    ///   7.4b), les deux jumeaux audio de la feuille historique —
    ///   `publishAudioPost` (`FeedView+Attachments.swift:496`) et
    ///   `publishAudioFromSheet` (`FeedView+Attachments.swift:1867`) —
    ///   convergent sur `PublishIntent.audioRecording`, transporté tel quel par
    ///   `FeedViewModel.publish` (`FeedViewModel.swift:888`) jusqu'à
    ///   `enqueueDurableMediaPost`, qui enfile SANS condition réseau (doc-comment
    ///   de `publish(_:)` : « Aucune condition réseau ici, et c'est une
    ///   décision »). Un vocal composé hors ligne n'est donc plus perdu sur la
    ///   feuille historique non plus ; il part par la même file durable qu'un
    ///   fichier local ordinaire. La distinction que ce paramètre portait a
    ///   disparu avec l'exception qui la motivait — ce que `path` fait déjà
    ///   (`hasLocalMedia` reste un booléen unique, sans branche audio) n'a donc
    ///   plus besoin d'être justifié par un rattrapage : c'était la bonne règle
    ///   avant même que le jumeau historique la respecte. Rien à conclure pour
    ///   le routage lui-même (lot 2) ; ce qui change, c'est ce que la
    ///   PRÉMISSE peut désormais affirmer sans lui.
    static func path(
        isQuote: Bool,
        hasLocalMedia: Bool,
        isOffline: Bool
    ) -> ComposerDocumentSendPath {
        if isQuote { return .quotedRepost }
        guard hasLocalMedia else { return .textOnly }
        return .durableOutbox
    }
}

/// **Pourquoi un brouillon ne part PAS** — cinq raisons, et aucune n'est un
/// échec que l'auteur doive subir.
///
/// Chacune laisse le composer OUVERT, sa saisie intacte. C'est le seul geste de
/// cette chaîne qu'aucune garde de source ne rattraperait après coup : un
/// composer refermé sur un envoi perdu reste PLAUSIBLE — il se ferme exactement
/// comme quand tout va bien, et c'est ce qui rend cette perte-là silencieuse.
nonisolated enum ComposerDocumentSendRefusal: Equatable {

    /// Le brouillon n'est pas un post. Jumelle de la garde de format sortant du
    /// mood : un format sans publieur sur ce chemin n'a pas de traduction
    /// raisonnable, et le laisser passer fabriquerait un contenu d'un AUTRE type
    /// que celui que l'auteur a composé.
    case wrongFormat(ComposerFormat)

    /// Rien à publier. Ce n'est PAS une redite du gate de la flèche : celui-ci
    /// garde le BOUTON, celui-là garde l'ENVOI — et le publieur, lui, ne garde
    /// rien. Sa branche durable exige un texte non blanc pour s'ouvrir ; un
    /// brouillon vide retomberait donc sur son appel réseau direct, c'est-à-dire
    /// sur un envoi volatil obtenu en n'écrivant rien.
    case emptyDraft

    /// Le chemin existe mais ne survit ni au hors-ligne ni à un kill de l'app.
    /// Refuser vaut mieux qu'envoyer : un contenu perdu en silence coûte plus
    /// cher qu'un geste à refaire.
    case nonDurablePath(ComposerDocumentSendPath)

    /// Le publieur a refusé la ligne — file pleine, écriture impossible. Le
    /// texte porte ce que le modèle a rendu (`publishError`), jamais une phrase
    /// réinventée ici : deux formulations d'un même échec divergent au premier
    /// cas limite.
    case publisherRejected(String)

    /// Le publieur n'a ni confirmé ni refusé. **Le doute REFUSE** : fermer coûte
    /// le texte de l'auteur, ne pas fermer ne coûte qu'un geste, et des deux
    /// erreurs possibles une seule est réparable par celui qui la subit.
    case publisherSilent

    /// L'audience exige une liste nominative, et elle est VIDE. C'est le seul
    /// refus de cette liste que le gateway émet déjà de son côté —
    /// `CreatePostSchema` rejette `EXCEPT`/`ONLY` sans aucun `visibilityUserIds`
    /// (400 `VALIDATION_ERROR`). Le laisser partir produirait donc un échec
    /// certain, présenté à l'auteur comme une erreur générique.
    ///
    /// Il porte l'audience concernée plutôt qu'un booléen : c'est elle que
    /// l'écran nomme, et un refus qui ne sait pas dire QUOI est un refus qu'on
    /// ne peut pas traduire.
    case incompleteAudience(PostVisibility)
}

/// **Ce que le meuble a le droit d'envoyer, et par où** — la question posée
/// AVANT l'envoi.
///
/// C'est l'unique appelant de `ComposerDocumentSendRouting` : la table sait
/// ordonner ses trois questions, ce plan sait ce qu'un brouillon du meuble peut
/// répondre. Les fondre aurait fait porter à la table une connaissance du
/// brouillon qu'elle n'a pas, et à ce plan une règle de routage qu'il aurait
/// fallu recopier.
///
/// **`hasLocalMedia` dérive désormais le canal RÉEL du brouillon (T2.1).**
/// `ComposerDocumentDraft` portait ni identifiants de média, ni fichier — la
/// première capacité manquante du DoD du lot 2, comblée par `localMedia`. Un
/// littéral `false` serait redevenu un MENSONGE : une composition avec photo
/// partirait par le chemin texte en laissant son fichier sur place.
///
/// **`isOffline` traverse toujours SANS effet, et c'est désormais une
/// décision, pas une absence.** `ComposerDocumentSendRouting.path` route un
/// média EN LIGNE COMME HORS LIGNE vers `.durableOutbox` — la même règle que
/// `FeedViewModel.publish` (`FeedViewModel.swift:878-884` : « Aucune condition
/// réseau ici, et c'est une décision »). Le supprimer aurait fait de ce plan
/// une fonction du seul format, et il aurait fallu le rouvrir le jour où cette
/// décision serait remise en cause.
nonisolated enum ComposerDocumentSendPlan: Equatable {

    /// Le brouillon part, et par ce chemin-là.
    case send(ComposerDocumentSendPath)

    /// Le brouillon ne part pas, et voici pourquoi.
    case refuse(ComposerDocumentSendRefusal)

    static func plan(for draft: ComposerDocumentDraft, isOffline: Bool) -> ComposerDocumentSendPlan {
        guard draft.format == .post else { return .refuse(.wrongFormat(draft.format)) }
        // Un média SEUL suffit à faire partir un post — la feuille historique
        // l'accepte, et T2.1 aligne le meuble dessus. Un LIEU seul le fait
        // partir de même (T2.5, parité avec `hasContent` de la feuille
        // historique, `FeedView+Attachments.publishPostWithAttachments`) :
        // `handleFeedLocationSelection` range un lieu dans `pendingPlace` sans
        // texte ni média, et `emptyDraft` ne doit se refuser que quand il n'y a
        // NI texte NI média NI lieu.
        let texteVide = draft.text?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true
        guard !texteVide || !draft.localMedia.isEmpty || draft.location != nil else {
            return .refuse(.emptyDraft)
        }
        // La complétude de l'audience passe par la MÊME règle que le gate de la
        // flèche : deux écritures de « un ONLY sans personne ne part pas »
        // seraient deux occasions de la corriger à moitié. Ce plan est la
        // SECONDE ligne — la porte lit le brouillon, jamais le gate.
        guard ComposerDocumentPublishGate.audienceIsComplete(
            draft.visibility,
            userIds: draft.visibilityUserIds ?? []
        ) else {
            return .refuse(.incompleteAudience(draft.visibility))
        }

        let chemin = ComposerDocumentSendRouting.path(
            isQuote: draft.repostOfId != nil,
            hasLocalMedia: !draft.localMedia.isEmpty,
            isOffline: isOffline
        )
        guard chemin.isDurable else { return .refuse(.nonDurablePath(chemin)) }
        return .send(chemin)
    }
}

/// **Ce que le publieur a rendu** — la question posée APRÈS l'envoi, et elle est
/// DISTINCTE de la précédente.
///
/// Deux types parce que deux questions. Le plan demande « ce brouillon a-t-il le
/// droit de partir, et par où ? » ; celui-ci demande « le publieur l'a-t-il
/// pris ? ». Les fondre aurait fait porter au plan une réponse qu'il ne peut pas
/// avoir — et c'est précisément ce trou qui a laissé le `Bool` de
/// `onPublishDocument` sans le moindre émetteur de `false` pendant deux lots,
/// pendant que son doc-comment le documentait comme une ACCEPTATION.
nonisolated enum ComposerDocumentSendOutcome: Equatable {
    case accepted
    case refused(ComposerDocumentSendRefusal)

    var isAccepted: Bool { self == .accepted }

    /// - Parameters:
    ///   - succeeded: `FeedViewModel.publishSuccess`, relu APRÈS l'envoi.
    ///   - error: `FeedViewModel.publishError`, la chaîne que le modèle a posée.
    ///
    /// **L'ordre des deux questions est load-bearing** : l'erreur prime sur le
    /// drapeau de succès. `publishSuccess` est un `@Published` qui SURVIT d'un
    /// envoi à l'autre ; le lire en premier ferait accepter un échec sur la foi
    /// d'un succès précédent. La règle ne suppose donc rien de l'hygiène du
    /// publieur — pas même qu'il remette ses drapeaux à zéro en entrant.
    ///
    /// Une chaîne VIDE n'est pas une erreur : `publishError` est un texte
    /// (`error.localizedDescription`), pas un `Error`, et la traiter en refus
    /// ferait republier un envoi réussi — en double.
    static func reported(succeeded: Bool, error: String?) -> ComposerDocumentSendOutcome {
        if let error, !error.isEmpty { return .refused(.publisherRejected(error)) }
        return succeeded ? .accepted : .refused(.publisherSilent)
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

    /// **Une audience NOMINATIVE sans personne n'est pas une audience.**
    ///
    /// Règle NOMMÉE plutôt qu'une condition enfouie dans le gate, parce qu'elle
    /// a deux lecteurs : la flèche s'en sert pour s'armer, et l'indice
    /// d'accessibilité pour ne pas MENTIR — « choisissez un emoji » est faux
    /// d'un mood qui en a un et que seule son audience retient.
    ///
    /// Elle miroite ce que la feuille historique du fil tenait déjà
    /// (`FeedComposerSheet.postAudienceIncomplete`) et ce que `CreatePostSchema`
    /// refuse côté serveur : « EXCEPT and ONLY visibility require at least one
    /// userId in visibilityUserIds ». Le meuble ne la tenait nulle part, si bien
    /// que deux chemins armaient la flèche sur un refus certain : la MÉMOIRE,
    /// qui restaurait un mode nominatif sans sa liste (fermé depuis par
    /// `ComposerAudienceMemory.remembered`), et le geste INTERACTIF — toucher
    /// « Annuler » dans `AudienceUserPickerView`, dont l'en-tête n'appelle
    /// `onDone` que sur « OK ». Le second survit à toute correction de la
    /// mémoire, et c'est lui qui rend cette règle nécessaire.
    static func audienceIsComplete(_ visibility: PostVisibility, userIds: [String]) -> Bool {
        !visibility.requiresUserSelection || !userIds.isEmpty
    }

    /// - Parameters:
    ///   - surface: la surface MONTÉE. `.scene` rend toujours `false`, et ce
    ///     n'est pas une précaution gratuite : le jour où le socle publiera sous
    ///     la scène, il devra passer par le gate de l'atelier (`canPublish`,
    ///     `internal` à `MeeshyUI`) et non par celui-ci, qui ne voit ni les
    ///     diapositives ni la timeline. Rendre `false` REFUSE ; il n'invente pas
    ///     une réponse qu'il n'a pas.
    ///   - visibility: l'audience COURANTE du meuble.
    ///   - visibilityUserIds: sa liste nominative. Elle et l'audience sont SANS
    ///     valeur par défaut : un défaut les aurait fait disparaître d'un site
    ///     d'appel sans casser la moindre compilation, et le gate serait
    ///     redevenu celui qui arme une flèche sur un refus certain.
    ///   - repostOfId: la publication que le meuble REPARTAGE, quand il en
    ///     repartage une. **Un ancrage a sa matière : c'est sa SOURCE.**
    ///     Republier sans un mot est un repost SIMPLE, exactement ce que
    ///     `FeedViewModel.repostPost` envoie déjà (`content: nil, isQuote:
    ///     false`) — exiger un texte y aurait laissé la flèche grise sur le cas
    ///     NOMINAL (`StatusEntry.content` est optionnel), et sans un mot
    ///     d'explication : `ComposerSocleCopy.publishBlockedHint(surface:
    ///     .document)` rend `nil`, faute d'une phrase juste déjà traduite. Sans
    ///     valeur par défaut, pour la raison de la ligne au-dessus.
    ///
    /// **L'ORDRE des gardes est la règle, pas seulement leur contenu.** La
    /// source ne dispense de rien : un `ONLY` sans personne retient AUSSI un
    /// ancrage — le gateway le rejette par un 400 `VALIDATION_ERROR`
    /// (`CreatePostSchema`) — et remonter `repostOfId != nil` au-dessus
    /// d'`audienceIsComplete` armerait la flèche sur ce refus certain.
    static func canPublish(
        surface: ComposerSurfaceKind,
        emoji: String?,
        text: String,
        visibility: PostVisibility,
        visibilityUserIds: [String],
        isPublishing: Bool,
        repostOfId: String?
    ) -> Bool {
        guard !isPublishing else { return false }
        guard audienceIsComplete(visibility, userIds: visibilityUserIds) else { return false }
        switch surface {
        case .scene:
            return false
        case .mood:
            return ComposerMoodPolicy.canPublish(emoji: emoji, isPublishing: isPublishing)
        case .document:
            return repostOfId != nil
                || !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }
}

/// Une pièce jointe LOCALE portée par un brouillon de document — image, vidéo
/// ou document, avant tout envoi.
nonisolated struct ComposerDocumentMedia: Equatable, Sendable {
    let url: URL
    let mimeType: String
    let durationMs: Int?
}

/// Traduit ce qu'un sélecteur (photothèque, caméra, importateur de documents)
/// vient de rendre en pièce jointe LOCALE du brouillon — le site UNIQUE de
/// cette conversion pour les trois familles de `ComposerMediaIntake` (T2.3).
///
/// **Le mime est toujours celui DÉCLARÉ à la source, jamais recalculé depuis
/// l'extension du fichier une fois posé sur disque.** `PublishIntent` nomme le
/// défaut mesuré (`PublishIntent.swift:64-75`) : un mime REÇU puis JETÉ,
/// re-dérivé plus loin par `MimeTypeResolver.mimeType(forURL:)`, rendait
/// `application/octet-stream` pour un fichier dont l'extension ne dit rien du
/// contenu — un nom temporaire générique, une extension absente. Cette
/// fonction ne connaît donc AUCUN chemin de repli par extension : l'appelant
/// fournit toujours le mime que la source a déjà déclaré — le `UTType` du
/// sélecteur de fichiers ou de la photothèque, ou le format que l'app
/// elle-même choisit en écrivant le fichier (JPEG pour une photo caméra,
/// QuickTime pour une vidéo caméra, le conteneur qu'`AVCaptureMovieFileOutput`
/// écrit déjà).
nonisolated enum ComposerDocumentMediaFactory {
    static func media(url: URL, declaredMimeType: String, durationMs: Int? = nil) -> ComposerDocumentMedia {
        ComposerDocumentMedia(url: url, mimeType: declaredMimeType, durationMs: durationMs)
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

    /// Les pièces jointes LOCALES du document — `[]` pour un mood, qui n'en a
    /// pas.
    let localMedia: [ComposerDocumentMedia]

    /// La position jointe au document.
    let location: SharedPlace?

    /// **T2.5 — le SECOND opt-in de position**, indépendant du premier
    /// (`location` juste au-dessus, qui EST le lieu affiché). `nil` tant que
    /// l'auteur n'a rien choisi : `NearbyDiscoverabilityChoice.precisionToSend`
    /// vaut déjà `nil` off, et poser ici une valeur par défaut rendrait
    /// trouvable un contenu que personne n'a demandé à rendre trouvable — même
    /// interdit que celui documenté sur `DiscoverabilityPrecision` (SDK).
    /// Aucune valeur par défaut, même discipline que le reste du type (T2.1).
    let discoverabilityPrecision: DiscoverabilityPrecision?

    /// La langue DÉCLARÉE du contenu. `nil` ⇒ le serveur détecte.
    let originalLanguage: String?

    /// **T2.4 — l'interrupteur POST ↔ RÉEL.** `ReelComposition.defaultType`
    /// élit `"REEL"` dès qu'une vidéo, un audio ≥ 3 s ou ≥ 2 images qualifient
    /// (`qualifiesAsReel`) ; ce champ, quand `true`, retient un POST simple
    /// malgré la qualification — la capacité que la feuille absorbée portait
    /// et que le meuble avait perdue en héritant du gate. Un mood n'a jamais
    /// de média qualifiant : sa fabrique le pose à `false` sans exposer de
    /// paramètre. Aucune valeur par défaut ici — même discipline que le reste
    /// du type (T2.1) : un défaut ferait disparaître le champ d'un site
    /// d'appel sans casser la moindre compilation.
    let forcePlainPost: Bool

    /// **T2.6 — la transcription du vocal composé sur CETTE surface.**
    /// L'enregistrement lui-même entre dans `localMedia` comme un
    /// `ComposerDocumentMedia` ordinaire ; ce champ porte ce que Whisper a
    /// compris SUR L'APPAREIL, à côté du fichier — jamais fondu dedans.
    /// `PublishIntent.document(transcription:)` le consulte pour ÉLIRE
    /// `originalLanguage` : la langue PARLÉE gagne sur `documentLanguage`
    /// (la capsule du meuble), jamais l'inverse. Aucune valeur par défaut,
    /// même discipline que le reste du type (T2.1) : un défaut le ferait
    /// disparaître d'un site d'appel sans casser la moindre compilation, et
    /// un vocal composé ici repartirait étiqueté par la capsule — exactement
    /// la régression que 7.4b avait fermée sur `PublishIntent.audioRecording`.
    let mobileTranscription: MobileTranscriptionPayload?

    /// Le brouillon d'un MOOD.
    ///
    /// `repostOfId` et `audioUrl` sont les deux graines d'une republication (lot
    /// 4.7). Elles ont un défaut ici, contrairement au reste, parce que leur
    /// absence EST le cas normal — un mood créé n'en a pas — et qu'aucun site ne
    /// peut donc les perdre en silence.
    ///
    /// **Le PLAFOND du mood s'applique ICI, et c'est une troisième
    /// normalisation** (lot 4.7). Il était tenu par le seul `adaptiveOnChange`
    /// de la surface, ce qui suffisait tant que la frappe était l'unique entrée
    /// de `documentText`. Depuis que l'éventail descend, le texte est aussi
    /// écrit par le `TextEditor` SANS plafond de la surface document — un post
    /// n'en a pas — puis rapporté sous le mood par une bascule : 300 caractères
    /// composés sous « Post » repartaient en `STATUS` tels quels, le serveur ne
    /// plafonnant qu'à 5000 (`CreatePostSchema`). La fabrique est le seul site
    /// que TOUS les chemins d'envoi traversent ; la surface, elle, tronque pour
    /// que l'auteur le VOIE.
    static func mood(
        emoji: String?,
        text: String,
        visibility: PostVisibility,
        visibilityUserIds: [String],
        references: [ComposerReference],
        repostOfId: String? = nil,
        audioUrl: String? = nil
    ) -> ComposerDocumentDraft {
        let plafonne = ComposerMoodPolicy.truncate(text)
        return ComposerDocumentDraft(
            format: .status,
            text: plafonne.isEmpty ? nil : plafonne,
            emoji: emoji,
            visibility: visibility,
            visibilityUserIds: visibility.requiresUserSelection ? visibilityUserIds : nil,
            mentions: ComposerMoodPolicy.declared(references),
            repostOfId: repostOfId,
            audioUrl: audioUrl,
            localMedia: [],
            location: nil,
            // Un mood n'a ni tuile de lieu ni second opt-in : les deux vivent
            // sous la surface document (`documentSurface`, `MeeshyComposerHost`).
            discoverabilityPrecision: nil,
            originalLanguage: nil,
            // Un mood ne porte jamais de média local (`localMedia: []`
            // au-dessus) : il ne peut donc jamais qualifier comme réel, et ce
            // champ n'a pas besoin d'un paramètre pour ce geste.
            forcePlainPost: false,
            // Un mood n'a pas d'outil micro (rangée du document seule, T2.6) :
            // aucun geste ne peut jamais alimenter ce champ pour ce format.
            mobileTranscription: nil
        )
    }

    /// Le brouillon d'un DOCUMENT.
    ///
    /// Il ne porte ni emoji ni mentions — et ce n'est pas un oubli : la surface
    /// document n'a ni grille d'emojis ni barre de références. Lui inventer des
    /// champs qu'aucune vue ne remplit aurait fabriqué une capacité que le
    /// premier lecteur aurait crue tenue.
    ///
    /// **`visibilityUserIds` est arrivé au lot 4.9, avec le sélecteur du
    /// socle**, et il n'a PAS de valeur par défaut : le socle sait désormais
    /// choisir `ONLY`/`EXCEPT`, et un brouillon qui perdrait sa liste
    /// nominative serait rejeté par le gateway — un refus que rien à l'écran
    /// n'aurait annoncé. Un défaut ici l'aurait fait disparaître d'un site
    /// d'appel sans casser la moindre compilation.
    ///
    /// **`repostOfId` est arrivé au lot 4.7, avec l'ANCRAGE**, et il n'a pas
    /// davantage de valeur par défaut — pour la MÊME raison, qui mord ici avec
    /// plus de force : perdre la source ne casse rien, ne dit rien, et
    /// transforme silencieusement un ancrage en post ordinaire. Il vient de la
    /// PORTE (`ComposerOrigin.repostedPostId`), jamais d'une graine : la porte
    /// seule sait quelle publication elle repartage, et le poser deux fois en
    /// ferait deux sources à faire diverger.
    ///
    /// La normalisation de la loi 3 est la MÊME que celle du mood, et à la même
    /// place — dans la fabrique, jamais chez l'appelant : porter une liste sous
    /// une audience qui n'en veut pas la ferait persister pour rien.
    ///
    /// **`forcePlainPost` est arrivé au T2.4, avec l'interrupteur POST ↔
    /// RÉEL du meuble**, et il n'a pas davantage de valeur par défaut, pour la
    /// MÊME raison que `repostOfId` et `visibilityUserIds` juste au-dessus :
    /// un défaut le ferait disparaître d'un site d'appel sans casser la
    /// moindre compilation, et un auteur qui viendrait de choisir « Post »
    /// verrait sa composition partir en `"REEL"` sans qu'aucun écran ne le
    /// dise.
    ///
    /// **`discoverabilityPrecision` est arrivé au T2.5, avec la tuile de
    /// lieu**, et n'a pas davantage de valeur par défaut — pour la MÊME raison
    /// que `forcePlainPost` juste au-dessus, mordant ici avec plus de force
    /// encore : un défaut non-`nil` rendrait trouvable un contenu que
    /// l'auteur n'a jamais choisi de rendre trouvable (le SECOND opt-in,
    /// `FeedNearbyDiscoverability`, off par défaut).
    ///
    /// **`mobileTranscription` est arrivé au T2.6, avec le sixième outil**, et
    /// n'a pas davantage de valeur par défaut — pour la MÊME raison que les
    /// champs juste au-dessus : un défaut le ferait disparaître d'un site
    /// d'appel sans casser la moindre compilation, et un vocal composé par le
    /// meuble repartirait sans sa transcription — le serveur re-transcrirait
    /// alors en silence un travail déjà fait sur l'appareil.
    static func document(
        format: ComposerFormat,
        forcePlainPost: Bool,
        text: String,
        visibility: PostVisibility,
        visibilityUserIds: [String],
        repostOfId: String?,
        localMedia: [ComposerDocumentMedia],
        location: SharedPlace?,
        discoverabilityPrecision: DiscoverabilityPrecision?,
        originalLanguage: String?,
        mobileTranscription: MobileTranscriptionPayload?
    ) -> ComposerDocumentDraft {
        ComposerDocumentDraft(
            format: format,
            text: text.isEmpty ? nil : text,
            emoji: nil,
            visibility: visibility,
            visibilityUserIds: visibility.requiresUserSelection ? visibilityUserIds : nil,
            mentions: nil,
            repostOfId: repostOfId,
            audioUrl: nil,
            localMedia: localMedia,
            location: location,
            discoverabilityPrecision: discoverabilityPrecision,
            originalLanguage: originalLanguage,
            forcePlainPost: forcePlainPost,
            mobileTranscription: mobileTranscription
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

/// **La PORTE du document** — le site qui monte le meuble pour un post, et le
/// seul endroit du dossier Composer qui sache ENVOYER.
///
/// Jumelle de `MoodComposerDoor`, et écrite pour la même raison : deux choses
/// sont communes à toute présentation du document sans appartenir ni à la
/// surface ni au meuble — l'ENVOI, et la lecture de ce que le publieur en a
/// fait. Les écrire dans la surface en ferait un second chemin de publication ;
/// les écrire chez chaque site de présentation en ferait autant de copies à
/// faire diverger.
///
/// **C'est la troisième capacité du DoD du lot 2**, celle dont l'oubli PERD du
/// contenu. Ce qui la rend durable n'est pas cette porte mais le publieur
/// qu'elle choisit : la branche texte de `FeedViewModel.createPost` enfile
/// elle-même sa ligne `.createPost` SANS consulter la connectivité — mesuré, ce
/// modèle n'a pas même d'`isOffline` —, insère un post optimiste et laisse
/// l'`OutboxFlusher` la dépêcher à la reconnexion. « Offline compris » est donc
/// une propriété du CHEMIN, pas une branche écrite ici. C'est exactement ce qui
/// sépare ce publieur de celui du mood, dont la file n'est atteinte que si
/// `isOffline()` répond oui, et dont un échec réseau en ligne ne laisse qu'un
/// toast.
///
/// **Ce qu'elle ne fait PAS, et qu'il ne faut pas lire comme tenu.** Elle ne
/// récupère pas un post bloqué hors ligne pour le rouvrir en brouillon :
/// `FeedViewModel.recoverUnsentPost()` existe, le mood fait la chose
/// équivalente, mais le meuble n'a pas de canal de graine pour un document
/// (`moodSeed` est le seul) et lui en ouvrir un déplacerait l'`init` que le lot
/// 5.5 a déjà réservé. Dette NOMMÉE, non refermée ici — elle ne perd rien
/// aujourd'hui, la ligne bloquée partant seule à la reconnexion.
///
/// **Elle laisse désormais l'auteur DÉCLARER la langue de son post (T2.2).**
/// `originalLanguage:` recevait `DefaultComposerLanguage.resolve()`, une
/// CONSTANTE qui rendait « fr » — un « Hello everyone » composé ici partait
/// étiqueté français, le Prisme le traduisait FR→EN sur un texte déjà anglais,
/// et la carte affichait un badge de langue faux, sans qu'aucun geste ne
/// permette de corriger. Elle poste maintenant `draft.originalLanguage`, écrit
/// par la capsule `ComposerLanguageFlag` et le sélecteur
/// `AudioLanguagePickerView` que le meuble monte — les mêmes que la feuille
/// absorbée (`FeedComposerSheet.composerLanguage`) portait dans la même barre
/// que les six outils d'attache. `DefaultComposerLanguage.resolve()` RESTE le
/// point de DÉPART du brouillon ; ce n'est pas elle qui a changé, c'est cette
/// porte qui a cessé de la rappeler à l'envoi.
///
/// **Ce que la langue déclarée ne dit toujours pas : ce n'est plus une
/// condition de levée de la porte.** La rangée d'outils, elle, en reste une —
/// `ComposerDocumentTool.canonicalRow` modélise les six boutons d'attache, et
/// T2.3 en a fait tomber TROIS (photo, caméra, fichier) :
/// `ComposerDocumentTool.servedRow` sert désormais
/// `[.photo, .camera, .emoji, .document]`. Il en reste deux — lieu et micro —
/// et c'est encore eux, seuls, qui retiennent cette porte.
///
/// **Aucun site de production ne la monte encore**, et ce n'est pas un oubli de
/// câblage : la rangée d'outils ne couvre pas ce que la feuille remplacée
/// offre. Son témoin,
/// `test_laPorteDuDocument_nEstMonteeParAucunSiteDeProduction_etCEstLaRangeeQuiLaRetient`,
/// déclare cet état.
/// **La porte du fil (T3.1) et de tout site qui compose un DOCUMENT** — texte,
/// média local, lieu, transcription. Elle NE sert PAS la citation : un repost
/// (`repostOfId != nil`) part par `POST /posts/:id/repost`, sans file durable,
/// et `ComposerDocumentSendPlan` le REFUSE (`.nonDurablePath(.quotedRepost)`)
/// plutôt que de le faire partir par un chemin que rien ne rejoue. Les deux
/// citations restent donc sur `FeedComposerSheet` (T3.2) jusqu'à la **condition
/// de levée 7.5** : un écrivain durable du repost (fondation livrée, zéro
/// appelant). La recâbler ici avant 7.5 la ferait refuser en SILENCE — le
/// composer se refermerait comme quand tout va bien.
struct DocumentComposerDoor: View {

    /// La porte au sens de la table. C'est elle qui décide du format d'ouverture
    /// et de la surface montée ; la porte ne les recopie pas.
    let intent: ComposerIntent

    /// Le modèle du fil, **sans `@ObservedObject`**. La porte n'affiche rien qui
    /// en dépende : elle l'utilise pour envoyer, puis pour lire ce qu'il a fait
    /// de l'envoi. L'observer ferait re-rendre le composer entier à chaque
    /// `post:created` reçu par la socket, pendant que l'auteur tape — c'est la
    /// raison, mot pour mot, que porte déjà la porte du mood.
    let viewModel: FeedViewModel

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        MeeshyComposerHost(
            intent: intent,
            // La mémoire d'audience du format POST est tenue par le MEUBLE, qui
            // la relit lui-même à la construction sous `ComposerAudienceMemory`.
            // Une seconde graine posée ici en ferait une seconde mémoire à faire
            // diverger. Le paramètre reste obligatoire pour la SCÈNE, que cette
            // porte ne monte jamais.
            initialVisibility: PostVisibility.public.rawValue,
            // Le canal de la SCÈNE, sans objet ici : `.keyboardOnContent` plus
            // `.post` routent vers la surface du document, jamais vers
            // l'atelier. Écrit en toutes lettres plutôt que rendu optionnel — un
            // défaut le ferait disparaître des sites qui, eux, montent vraiment
            // une scène.
            onPublishAllInBackground: { _, _, _, _, _, _, _, _, _, _, _, _ in false },
            onPublishDocument: { draft in await publish(draft) },
            // `moodSeed:` vient APRÈS `onPublishDocument:`, et l'ordre des
            // arguments est load-bearing : Swift n'autorise aucun
            // réordonnancement, et une garde le tient désormais pour le jour où
            // un paramètre s'insérera au milieu de cet `init`.
            moodSeed: nil,
            // Ni média : `ComposerDocumentDraft` n'a NI `mediaIds`, NI fichier,
            // NI lieu — semer ici poserait un canvas que cette porte ne monte
            // jamais, et dont le publieur ne saurait rien faire.
            mediaSeed: nil,
            onPreview: { _, _, _, _, _ in },
            onDismiss: { dismiss() }
        )
    }

    /// **L'ENVOI DURABLE**, en trois temps que rien ne doit fusionner.
    ///
    /// 1. le PLAN décide si ce brouillon a le droit de partir, et par où : il
    ///    refuse un format qui n'est pas un post, un brouillon sans matière, et
    ///    tout chemin qui ne survivrait pas à un kill de l'app ;
    /// 2. l'envoi passe par le MODÈLE, jamais par un service — le modèle possède
    ///    la file durable, le cache et la réconciliation optimiste, et un appel
    ///    direct les perdrait tous les trois d'un coup ;
    /// 3. l'ISSUE lit ce que le modèle a rendu. Le silence REFUSE.
    ///
    /// Elle ne referme JAMAIS la porte elle-même. La sortie appartient au
    /// meuble, qui la conditionne à l'acceptation ; un `dismiss()` posé ici
    /// court-circuiterait ce gate et jetterait la saisie sur un refus.
    ///
    /// **Ce qu'une acceptation dit exactement, et ce qu'elle ne dit pas** : la
    /// ligne est ENFILÉE, pas LIVRÉE. `createPost` insère le post optimiste et
    /// rend la main dès que l'outbox a pris la ligne ; sa livraison réelle
    /// appartient à l'`OutboxFlusher`, qui la retentera et, s'il épuise son
    /// budget, retirera le post optimiste avec son propre toast
    /// (`observeOutcome`). Fermer sur cette acceptation-là est donc juste — le
    /// contenu est durable —, et lire `true` comme « publié » serait faux.
    private func publish(_ draft: ComposerDocumentDraft) async -> Bool {
        guard case .send = ComposerDocumentSendPlan.plan(
            for: draft,
            isOffline: NetworkMonitor.shared.isOffline
        ) else {
            return refuse()
        }

        // `content:` reçoit le texte du brouillon tel quel : le plan vient de
        // garantir qu'il n'est ni absent ni blanc, et le re-normaliser ici en
        // ferait une seconde écriture de la même règle.
        // La langue est désormais celle DÉCLARÉE par l'auteur (T2.2) :
        // `draft.originalLanguage` porte ce que la capsule du meuble a écrit,
        // semé sur `DefaultComposerLanguage.resolve()` — qui RESTE le point de
        // DÉPART du brouillon, jamais rappelé ici.
        // `forcePlainPost` vient du brouillon (T2.4) — l'interrupteur du
        // meuble l'y a semé — jamais d'un littéral : un `false` en dur ferait
        // partir en `"REEL"` la composition qu'un auteur vient de retenir en
        // POST simple.
        // `location:` et `discoverabilityPrecision:` viennent tous deux du
        // brouillon (T2.5) — jamais d'un littéral `nil` : le premier est le
        // lieu choisi, le second le SECOND opt-in, indépendant, que l'auteur
        // seul peut activer (`FeedNearbyDiscoverability`, off par défaut).
        // `transcription:` vient du brouillon (T2.6) — `draft.mobileTranscription`,
        // jamais un littéral `nil` : c'est elle que `PublishIntent.document`
        // consulte pour ÉLIRE `originalLanguage`, la langue PARLÉE gagnant sur
        // la capsule. Ni ce corps ni son publieur (`FeedViewModel.publish`) ne
        // touchent au disque : le fichier composé par le meuble n'est ni
        // déplacé ni effacé ici — il survit à un refus comme à une acceptation,
        // et c'est la file durable seule qui en dispose.
        await viewModel.publish(PublishIntent.document(
            localMedia: draft.localMedia,
            forcePlainPost: draft.forcePlainPost,
            content: draft.text,
            visibility: draft.visibility.rawValue,
            visibilityUserIds: draft.visibilityUserIds,
            originalLanguage: draft.originalLanguage,
            mentions: draft.mentions,
            location: draft.location,
            discoverabilityPrecision: draft.discoverabilityPrecision,
            transcription: draft.mobileTranscription
        ))

        let issue = ComposerDocumentSendOutcome.reported(
            succeeded: viewModel.publishSuccess,
            error: viewModel.publishError
        )
        guard issue.isAccepted else { return refuse() }

        HapticFeedback.success()
        return true
    }

    /// Un refus qui se DIT.
    ///
    /// Rendre `false` sans rien dire laisserait l'auteur devant une flèche qui
    /// semble ne rien faire — et il la presserait encore. Écrit une fois pour
    /// les deux chemins de refus : deux formulations à la main diraient l'échec
    /// deux fois, ou une seule, et c'est la moitié muette qu'on découvrirait en
    /// production.
    private func refuse() -> Bool {
        FeedbackToastManager.shared.showError(ComposerDocumentCopy.publishError)
        return false
    }
}
