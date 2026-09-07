import SwiftUI
import MeeshySDK
import MeeshyUI
import UIKit
import ImageIO

// **Les règles du DOCUMENT** — ce qu'un outil fait entrer, où un envoi part,
// ce qui le refuse, ce que la flèche a le droit de publier, et les mots que
// la surface emploie. Extraites de `ComposerDocumentSurface.swift` au #4103 ;
// le contrat du découpage est écrit en tête de `ComposerSurfaceRules.swift`.

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
nonisolated enum ComposerMediaIntake: Equatable, Hashable, CaseIterable {
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

    /// Ouvre la feuille qui NOMME quelqu'un — recherche de la personne, puis
    /// choix du MODE (`PostReferenceDisplay`).
    ///
    /// **Ce n'est pas un raccourci vers la frappe `@`.** Le composer a DEUX
    /// portes pour nommer, et elles ne font pas la même chose :
    ///
    /// - la **frappe** `@` — inline, pendant la saisie : la liste de
    ///   suggestions paraît au-dessus du champ et le nom s'écrit DANS le
    ///   texte. Elle vit déjà (`ComposerMentionControllerBox` →
    ///   `handleQuery(in:)` → `ComposerMentionStrip`) et n'a jamais eu besoin
    ///   de bouton ;
    /// - la **feuille**, ouverte par cet outil — « nommer quelqu'un SANS
    ///   l'écrire » : on cherche la personne correctement, puis on choisit
    ///   comment elle paraît — `INLINE` (écrite dans le texte), `NOTE`
    ///   (rangée « Avec … » sous le contenu) ou `SILENT` (notifiée,
    ///   invisible aux tiers).
    ///
    /// Insérer `@` dans le texte aurait confondu les deux : le mode ne se
    /// choisit pas à la frappe, et une mention en `NOTE` ou `SILENT` n'a par
    /// définition rien à écrire dans le texte.
    case opensReferencePicker

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
    case mention
    case document
    case place
    case microphone

    /// L'ordre de la feuille historique. `allCases` suit l'ordre de
    /// déclaration, mais rien ne garantit qu'il ne bougera pas : la rangée est
    /// écrite ici en toutes lettres, et `ComposerDocumentSurfaceTests` vérifie
    /// qu'aucun outil n'en manque.
    /// **L'ordre est celui de la cible `1a`, et les ajouts de l'app viennent
    /// APRÈS (#4071).**
    ///
    /// Mesuré au simulateur : la rangée ne peut pas montrer ses sept tuiles
    /// nommées sur 402 pt à taille nominale — rien ne le pourrait sans passer
    /// sous la cible tactile de 44 pt. Il y aura donc toujours un débordement ;
    /// la seule question est CE QUI déborde.
    ///
    /// `.mention` occupait le 4e rang et poussait `.document`, `.place` et
    /// `.microphone` hors champ — trois outils dont la chaîne va pourtant
    /// jusqu'au brouillon et au publieur, et dont AUCUN pixel ne paraissait.
    /// Ce sont les six de la maquette qui passent devant ; ce que l'app ajoute
    /// en propre défile. La loi 1 dit que ce qui dépasse RESTE — elle ne dit
    /// pas que ça passe en premier.
    ///
    /// `.mention` perd le moins à ce déplacement : la mention s'écrit aussi en
    /// tapant `@` dans le texte, avec sa bande de suggestions — c'est le seul
    /// outil de la rangée qui a une seconde porte.
    static let canonicalRow: [ComposerDocumentTool] = [
        .photo, .camera, .emoji, .document, .place, .microphone, .mention
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
    /// se retourne : sa PREMIÈRE condition (la rangée) tombe ici, la SECONDE (la
    /// langue) l'était depuis T2.2 — et à T3.1 un site la monte enfin
    /// (`RootViewComponents`, `montages == 1`).
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
        case .mention:
            return .opensReferencePicker
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

    /// **La rangée canonique appartient au POST** (directive porteur
    /// 2026-09-01).
    ///
    /// > « Enlever les éléments de la rangée canonique car destinés pour les
    /// > posts (seule entité qui peut avoir un texte spécifiquement pour
    /// > contenu). »
    ///
    /// Les sept outils servent tous la même chose : composer un CHAMP DE TEXTE
    /// et ce qu'on y joint. Emoji et mention s'insèrent dedans ; photo, caméra,
    /// fichier, lieu et micro y attachent une pièce. Or une story n'a pas de
    /// champ de contenu — on y écrit en POSANT un objet texte sur un canvas,
    /// avec sa police, sa couleur et sa place. Servir la rangée sous une story
    /// offrirait sept gestes qui visent un champ que l'écran n'a pas.
    ///
    /// **Le RÉEL la garde**, et ce n'est pas un oubli : ses canvas sont ses
    /// médias, comme ceux d'un post, et il se compose depuis le même document.
    /// Ce qui distingue la story n'est pas d'avoir un canvas — c'est que
    /// chacun de ses canvas est une unité d'histoire à publier, pas un média de
    /// la publication.
    ///
    /// **Remis en cause le 2026-09-02, RÉTABLI le même jour** (retour porteur) :
    /// j'y avais servi les outils qui posent un objet de scène, pour réparer un
    /// défaut que je venais de créer en retirant les rails. Les rails sont
    /// restaurés — la story se compose par eux et par la rangée contextuelle.
    static func servedRow(for format: ComposerFormat) -> [ComposerDocumentTool] {
        format == .story ? [] : servedRow
    }

    /// **Le jeu SF MODERNE — décision produit 2026-08-26 : SF retravaillés
    /// d'abord, glyphes à identité forte « dans un second temps ».**
    ///
    /// Une famille LIGNE cohérente remplace le mélange `.fill` daté : chaque
    /// glyphe DIT ce que l'outil fait — `photo` (bibliothèque), `camera`,
    /// `face.smiling` (emoji), `paperclip` (joindre un fichier, plus parlant que
    /// `doc`), `mappin.and.ellipse` (un LIEU, pas une flèche de localisation),
    /// `mic`. Tous disponibles dès iOS 16 ; rendus en `.hierarchical` et animés
    /// d'un rebond au tap par `ComposerDocumentSurface.toolRow`.
    var symbolName: String {
        switch self {
        case .photo: return "photo"
        case .camera: return "camera"
        case .emoji: return "face.smiling"
        case .mention: return "at"
        case .document: return "paperclip"
        case .place: return "mappin.and.ellipse"
        case .microphone: return "mic"
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
        repostOfId: String?,
        /// **La matière de l'ATELIER, RELAYÉE** (#4135) — jamais recalculée ici.
        /// Le meuble ne voit ni le son de fond ni les traits de dessin : il
        /// conclurait « rien à publier » sur une story « fond + musique »
        /// parfaitement publiable. `StoryComposerView.canPublish` reste
        /// l'unique juge, et la télécommande le transporte.
        ///
        /// Défaut `false`, et c'est le sens SÛR : un appelant qui l'ignore
        /// obtient une flèche INERTE sur la scène, jamais une flèche armée
        /// au-dessus d'une composition vide.
        atelierHasMatter: Bool = false,
        /// **La matière du DOCUMENT — des pièces jointes, un lieu (#4514).**
        ///
        /// Elle manquait, et le défaut était silencieux : un post de deux photos
        /// sans légende était REFUSÉ, bouton peint et désactivé, sans que rien
        /// ne dise que la seule chose absente était du texte. Mesuré au
        /// simulateur le 2026-08-31.
        ///
        /// Défaut `false` des deux côtés — le sens SÛR : un appelant qui ne se
        /// prononce pas obtient le comportement d'avant, jamais une porte
        /// ouverte sur un brouillon vide.
        hasMedia: Bool = false,
        hasLocation: Bool = false
    ) -> Bool {
        guard !isPublishing else { return false }
        guard audienceIsComplete(visibility, userIds: visibilityUserIds) else { return false }
        switch surface {
        case .scene:
            return atelierHasMatter
        case .mood:
            return ComposerMoodPolicy.canPublish(emoji: emoji, isPublishing: isPublishing)
        case .document:
            // **Publier une photo sans un mot est le cas NOMINAL d'un réseau
            // social, pas un cas limite.** La porte n'acceptait qu'un repost ou
            // du texte : les pièces jointes ne figuraient pas dans la question,
            // alors que l'écran les montrait déjà en vignettes.
            //
            // Un lieu seul compte aussi — « je suis ici » est une publication
            // en soi et n'a pas besoin d'une légende pour en être une.
            return repostOfId != nil
                || hasMedia
                || hasLocation
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

    /// **LE CANVAS composé sur la scène** (#4756).
    ///
    /// Ce type portait déjà « du texte, des pièces jointes, un lieu » — et le
    /// commentaire de `DocumentComposerDoor` affirmait qu'il ne pouvait PAS
    /// porter de scène : « il n'a ni slides, ni effets, ni images chargées ».
    /// C'était vrai de ses slides ; ça ne l'était pas de ses EFFETS, qui sont un
    /// blob que `CreatePostSchema` accepte depuis toujours.
    ///
    /// Mesuré au simulateur le 2026-09-04 : un post composé avec un fond et un
    /// objet texte publiait une carte de TEXTE NU. Le canvas ne s'arrêtait pas
    /// faute de modèle — il s'arrêtait faute de champ.
    ///
    /// `nil` pour un mood et pour tout post sans scène. Un blob vide à sa place
    /// ferait croire à une scène composée puis effacée.
    let storyEffects: StoryEffects?

    /// **Les LÉGENDES par média, clées par URL locale** (#4756).
    ///
    /// Écrites par le volet de description en profil Post
    /// (`ComposerSlideTextRole.applyCaption`), elles n'avaient jusqu'ici aucun
    /// lecteur sur la voie DOCUMENT — celle que prend tout post du meuble. La
    /// légende s'affichait dans le composer, se relisait d'une ouverture à
    /// l'autre, et mourait à l'envoi.
    ///
    /// Vide pour un mood, qui n'a pas de média.
    let mediaCaptions: ComposerMediaCaptions

    /// **Les textes ALTERNATIFS par média, clés par URL locale** (2026-09-05).
    ///
    /// Ils étaient saisis (section « Décrire » de l'éditeur d'objet), stockés
    /// (`documentMediaAlts`, au meuble) et relus — et n'allaient nulle part sur
    /// la voie DOCUMENT, la seule que prenne un post. Le chemin STORY, lui, les
    /// portait depuis #4756 : deux voies pour une même saisie, dont une seule
    /// arrivait.
    ///
    /// Vide pour un mood, qui n'a pas de média.
    let mediaAlts: ComposerMediaCaptions

    /// **`URL source → identifiant d'objet de canvas`** (#5280) — le chaînon
    /// de l'adoption. Vide pour un post sans scène.
    let mediaObjectIds: ComposerMediaCaptions

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

    /// **L'autorisation d'extraction du son** (#3996) — même champ, même
    /// sémantique que `ComposerMediaAccessibility.allowSoundExtraction`
    /// (`nil` ⇒ l'auteur n'a rien décidé). Aucune valeur par défaut, même
    /// discipline que le reste du type : un défaut le ferait disparaître
    /// d'un site d'appel sans casser la moindre compilation, exactement le
    /// mode de panne que ce champ vient corriger sur la voie DOCUMENT.
    let allowSoundExtraction: Bool?

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
            // Un mood n'a pas de SCÈNE : sa surface est une grille de dix
            // emojis et 122 caractères (`ComposerSurfaceKind.mood`). Aucun
            // geste ne peut alimenter ce champ pour ce format — même raison,
            // même forme que `mobileTranscription` plus bas.
            storyEffects: nil,
            // Un mood n'a pas de média, donc aucune légende par média.
            mediaCaptions: [:],
            // Un mood n'a pas de média, donc pas d'alternative non plus.
            mediaAlts: [:],
            // Un mood n'a pas de scène : aucun objet de canvas à adopter.
            mediaObjectIds: [:],
            forcePlainPost: false,
            // Un mood n'a pas d'outil micro (rangée du document seule, T2.6) :
            // aucun geste ne peut jamais alimenter ce champ pour ce format.
            mobileTranscription: nil,
            // Un mood n'a pas de média (`localMedia: []` au-dessus) : aucun
            // son à extraire, donc `nil` — « aucune décision » — plutôt qu'un
            // `false` qui affirmerait un refus jamais exprimé.
            allowSoundExtraction: nil
        )
    }

    /// Le brouillon d'un DOCUMENT.
    ///
    /// Il ne porte pas d'emoji — et ce n'est pas un oubli : la surface document
    /// n'a pas de grille d'emojis DÉFINISSANTS (celle de la rangée écrit dans
    /// le texte, ce qui est autre chose). Lui inventer un champ qu'aucune vue
    /// ne remplit aurait fabriqué une capacité que le premier lecteur aurait
    /// crue tenue.
    ///
    /// **`references` est arrivé avec l'outil `@` de la rangée** — retour
    /// porteur 2026-08-28 : « il manque `@` pour mentionner ». La surface a
    /// désormais sa porte pour NOMMER sans écrire, et ce paramètre est ce qui
    /// l'empêche d'être décorative : sans lui, la feuille aurait laissé choisir
    /// des personnes et un mode, puis le brouillon serait parti avec
    /// `mentions: nil` — un geste complet, une conséquence nulle.
    ///
    /// Pas de valeur par défaut, pour la MÊME raison que les champs ci-dessous :
    /// un défaut le ferait disparaître d'un site d'appel sans casser la moindre
    /// compilation, et les personnes nommées ne seraient prévenues de rien.
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
        mobileTranscription: MobileTranscriptionPayload?,
        references: [ComposerReference],
        /// Le canvas de la slide courante, ou `nil` sans scène (#4756).
        storyEffects: StoryEffects?,
        /// Les légendes par média saisies dans le composer (#4756).
        mediaCaptions: ComposerMediaCaptions,
        /// Les alternatives textuelles saisies dans l'éditeur d'objet, déjà
        /// TRADUITES en clés d'URL par le meuble — c'est lui, et lui seul, qui
        /// tient le pont `identifiant d'objet → URL source`.
        mediaAlts: ComposerMediaCaptions,
        /// Le pont `URL source → identifiant d'objet`, tenu par le meuble
        /// depuis le retour d'`applyContentMedia`.
        mediaObjectIds: ComposerMediaCaptions,
        /// **L'autorisation d'extraction du son** (#3996), arrivée avec ce
        /// lot — pour la MÊME raison que les champs juste au-dessus : un
        /// défaut le ferait disparaître d'un site d'appel sans casser la
        /// moindre compilation, et l'auteur croirait décider pendant que le
        /// serveur ne l'apprend jamais.
        allowSoundExtraction: Bool?
    ) -> ComposerDocumentDraft {
        ComposerDocumentDraft(
            format: format,
            text: text.isEmpty ? nil : text,
            emoji: nil,
            visibility: visibility,
            visibilityUserIds: visibility.requiresUserSelection ? visibilityUserIds : nil,
            // `ComposerMoodPolicy.declared` malgré son nom : c'est le SITE
            // UNIQUE de la normalisation de la loi 3 pour les références
            // (`payload`, puis vide ⇒ `nil`). La recopier ici en ferait une
            // jumelle à faire diverger — le nom du porteur est une dette, la
            // règle n'en est pas une.
            mentions: ComposerMoodPolicy.declared(references),
            repostOfId: repostOfId,
            audioUrl: nil,
            localMedia: localMedia,
            location: location,
            discoverabilityPrecision: discoverabilityPrecision,
            originalLanguage: originalLanguage,
            storyEffects: storyEffects,
            mediaCaptions: mediaCaptions,
            mediaAlts: mediaAlts,
            mediaObjectIds: mediaObjectIds,
            forcePlainPost: forcePlainPost,
            mobileTranscription: mobileTranscription,
            allowSoundExtraction: allowSoundExtraction
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
