import Foundation
import MeeshySDK

/// **Ce que l'auteur a produit, composé UNE seule fois.**
///
/// Un même geste — enregistrer sa voix, puis publier — était composé à deux
/// endroits, et les deux compositions divergeaient sur trois points à la fois :
/// l'une DÉTRUISAIT le fichier dans son `catch` et l'autre le laissait
/// orphelin ; l'une étiquetait l'enregistrement avec la langue de la
/// TRANSCRIPTION et l'autre avec celle du sélecteur de TEXTE du composer ;
/// elles ne portaient pas les mêmes mentions. Aucune de ces trois divergences
/// ne se voit en lisant l'un des deux sites.
///
/// Ce type est la réponse : **la matière d'une publication se compose une fois,
/// à un endroit nommé, et le reste du chemin ne fait que la transporter.**
///
/// ## Trois règles gravées ici, et pourquoi
///
/// 1. **Aucune valeur par défaut sur les fabriques.** Un défaut fait
///    disparaître un champ d'un site d'appel sans casser la moindre
///    compilation. Ce n'est pas une crainte théorique : `CreatePostPayload.init`
///    pose un défaut sur ses dix derniers paramètres, et c'est très exactement
///    par là que la branche hors ligne de `StatusViewModel.setStatus` a perdu la
///    source et la voix d'un mood pendant que sa jumelle en ligne les passait.
///    Chaque geste DÉCLARE tout ce qu'il publie, `nil` compris. Une garde de
///    source le tient (`PublishIntentTests`).
/// 2. **L'init est PRIVÉ.** On n'entre dans ce type que par un geste NOMMÉ. Un
///    huitième site de publication ne peut donc pas se composer une intention à
///    sa façon : il doit d'abord dire QUEL GESTE il publie.
/// 3. **`type` est une chaîne SERVEUR (`"POST"` / `"REEL"`), pas un format
///    d'UI.** Ce qui voyage sur le fil est ce que `ReelComposition.defaultType`
///    élit ; faire dépendre la matière d'une publication du vocabulaire d'une
///    surface la ferait bouger à chaque refonte du meuble.
///
/// ## Ce que ce type n'est PAS
///
/// Ce n'est **pas** une table de routage. Il n'existe aucun `PublishRouting`
/// dans le dépôt, et il ne doit pas en naître ici : le routage du document est
/// déjà tranché par `ComposerDocumentSendRouting`, qui vit dans le meuble et
/// n'a le droit qu'à UN appelant. Une seconde table répondant à la même
/// question serait un second chemin d'envoi — et elle divergerait dès sa
/// naissance, pas un jour.
///
/// Ce n'est pas non plus le format ON-DISK : `CreatePostPayload` le reste.
/// L'intention est la porte d'entrée SANS défaut ; la charge persistée est
/// construite en aval par `OfflineQueue`.
///
/// `nonisolated` : l'app compile sous `defaultIsolation(MainActor)`, et cette
/// matière se compose depuis une vue puis se lit depuis un modèle — la clouer
/// au main actor la rendrait intransportable, exactement comme pour
/// `CreatePostBody`.
nonisolated struct PublishIntent: Equatable, Sendable {

    /// Le jeton d'ENVOI, jamais une empreinte de contenu : deux envois d'une
    /// même matière sont deux envois. Un identifiant dérivé du contenu ferait
    /// prendre le second pour un rejeu du premier, et le gateway répondrait le
    /// résultat du premier au lieu de publier.
    let clientMutationId: String
    /// Le type SERVEUR (`"POST"` / `"REEL"`), élu par `ReelComposition`.
    let type: String
    /// Les fichiers LOCAUX à téléverser. Ils ne sont ni effacés ni déplacés par
    /// ce type : la file durable les relocalise, et c'est elle qui en dispose.
    let localMediaURLs: [URL]
    /// Le MIME **DÉCLARÉ** de chaque fichier, aligné par INDEX sur
    /// `localMediaURLs`.
    ///
    /// Il était REÇU par la fabrique et JETÉ : il ne servait qu'à élire le type
    /// (`ReelComposition`), après quoi le dispatcher re-dérivait un MIME depuis
    /// l'EXTENSION du fichier relocalisé. Pour un vocal importé depuis Fichiers
    /// en `.caf` / `.aiff` / `.opus`, cette dérivation rendait
    /// `application/octet-stream` : le gateway, qui ne reconnaît un média audio
    /// qu'à `mimeType.startsWith('audio/')`, ignorait alors la transcription
    /// embarquée ET ne déclenchait pas Whisper — et la carte optimiste
    /// s'affichait comme une IMAGE. Un paramètre consommé puis jeté se lit
    /// comme s'il voyageait ; celui-ci voyage.
    let localMediaMimeTypes: [String]
    let content: String?
    let visibility: String
    let visibilityUserIds: [String]?
    /// La langue DÉCLARÉE du contenu. `nil` ⇒ le serveur détecte.
    let originalLanguage: String?
    let mentions: [PostMentionInput]?
    let location: SharedPlace?
    let discoverabilityPrecision: DiscoverabilityPrecision?
    /// Ce qui QUALIFIE un enregistrement vocal : le texte transcrit SUR
    /// L'APPAREIL, celui que l'auteur a relu avant d'envoyer. Sans lui, le
    /// serveur re-transcrit et jette ce travail en silence.
    let mobileTranscription: MobileTranscriptionPayload?

    /// **LE CANVAS — ce que l'auteur a COMPOSÉ sur la scène** (#4756).
    ///
    /// ## Le défaut, mesuré à l'écran le 2026-09-04
    ///
    /// Un post composé avec un fond et un objet texte a été publié depuis
    /// `Meeshy-iOS26` : la carte du fil affichait **le texte seul**. Ni fond, ni
    /// objet, ni dessin, ni sticker — la scène entière perdue, sans une erreur,
    /// sans un log, sans un état d'échec.
    ///
    /// La cause tenait en une ligne : `PublishIntent` portait douze champs et
    /// aucun n'était `storyEffects`. Le blob existe pourtant de bout en bout —
    /// `CreatePostRequest.storyEffects` le déclare, `CreatePostSchema` l'accepte,
    /// et `createCanvasPost` s'en sert déjà. Seule la voie DOCUMENT, celle que
    /// prend tout post du meuble, ne le transportait pas.
    ///
    /// > **Un champ absent d'une charge ne rougit nulle part.** Le compilateur
    /// > ne le réclame pas, le schéma le tolère, le serveur publie. Le seul
    /// > témoin possible est ce que l'auteur VOIT — et il faut aller le
    /// > regarder.
    ///
    /// ## Pourquoi ici, et pas seulement dans le brouillon du meuble
    ///
    /// Parce que ce type est la matière composée UNE fois. La voie durable
    /// (`CreatePostPayload` → `OutboxDispatcher`) est la seule que prenne un
    /// post du meuble, en ligne comme hors ligne : un canvas qui s'arrêterait au
    /// brouillon serait perdu au premier flush, silencieusement.
    ///
    /// `nil` ⇒ aucune scène. C'est le cas nominal d'un post TEXTE, et un blob
    /// vide encodé à sa place ferait croire à une scène composée puis effacée.
    let storyEffects: StoryEffects?

    private init(
        clientMutationId: String,
        type: String,
        localMediaURLs: [URL],
        localMediaMimeTypes: [String],
        content: String?,
        visibility: String,
        visibilityUserIds: [String]?,
        originalLanguage: String?,
        mentions: [PostMentionInput]?,
        location: SharedPlace?,
        discoverabilityPrecision: DiscoverabilityPrecision?,
        mobileTranscription: MobileTranscriptionPayload?,
        storyEffects: StoryEffects?
    ) {
        self.clientMutationId = clientMutationId
        self.type = type
        self.localMediaURLs = localMediaURLs
        self.localMediaMimeTypes = localMediaMimeTypes
        self.content = content
        self.visibility = visibility
        self.visibilityUserIds = visibilityUserIds
        self.originalLanguage = originalLanguage
        self.mentions = mentions
        self.location = location
        self.discoverabilityPrecision = discoverabilityPrecision
        self.mobileTranscription = mobileTranscription
        self.storyEffects = storyEffects
    }

    /// Le geste « **j'ai composé un document** » — un post ou un réel né du
    /// meuble, portant ses fichiers LOCAUX, sa position et sa langue déclarée.
    ///
    /// AUCUN paramètre n'a de valeur par défaut : même discipline que
    /// `audioRecording`, vérifiée par la même garde de source. Un média local
    /// part par la file durable (le type l'enfile) — jamais un upload direct.
    ///
    /// **`transcription` — le CRUX du lot T2.6.** Le meuble peut composer un
    /// vocal comme sixième outil de sa rangée (`.microphone`), et cet
    /// enregistrement entre par CE geste — `localMedia` porte le fichier,
    /// `transcription` porte ce que Whisper a compris SUR L'APPAREIL. La règle
    /// tranchée par `audioRecording` s'applique ICI À L'IDENTIQUE, et c'est la
    /// régression que 7.4b avait fermée sur les deux jumeaux audio :
    /// **quand une transcription a une langue, elle GAGNE sur la capsule.**
    /// `originalLanguage: transcription?.language ?? originalLanguage` — jamais
    /// `originalLanguage: originalLanguage` telle quelle, qui laisserait un
    /// vocal wolof composé dans un meuble réglé « fr » partir étiqueté
    /// français, et le Prisme le traduirait FR→WO sur un texte déjà wolof.
    static func document(
        localMedia: [ComposerDocumentMedia],
        declaredType: PostType?,
        forcePlainPost: Bool,
        content: String?,
        visibility: String,
        visibilityUserIds: [String]?,
        originalLanguage: String?,
        mentions: [PostMentionInput]?,
        location: SharedPlace?,
        discoverabilityPrecision: DiscoverabilityPrecision?,
        transcription: MobileTranscriptionPayload?,
        /// **Le canvas composé sur la scène** (#4756). `nil` pour un post
        /// TEXTE — la règle 1 de ce fichier interdit un défaut : un site qui
        /// n'a pas de scène l'écrit en toutes lettres, sinon le champ
        /// disparaîtrait demain d'un appelant sans casser la compilation.
        storyEffects: StoryEffects?
    ) -> PublishIntent {
        PublishIntent(
            clientMutationId: ClientMutationId.generate(),
            // La règle de composition vit dans `ReelComposition`, jamais ici —
            // un `"REEL"`/`"POST"` codé en dur ferait diverger la surface
            // d'atterrissage d'un document de celle d'un vocal ou d'un média.
            // **Un type DÉCLARÉ gagne sur un type déduit** (directive porteur
            // 2026-09-01). `ReelComposition` répond à « qu'est-ce que cette
            // composition RESSEMBLE à être ? » — une question de médias, qui ne
            // sait rendre que POST ou RÉEL. Depuis que la story se compose sur
            // cette surface, l'auteur peut avoir CHOISI son format dans
            // l'éventail : une déduction faite sur les mimes publierait alors
            // un post là où il vient de dire « story ».
            //
            // `nil` laisse la déduction faire son travail — c'est le cas des
            // portes qui n'offrent aucun choix de format.
            type: (declaredType ?? ReelComposition.defaultType(
                mimeTypes: localMedia.map(\.mimeType),
                durationsMs: localMedia.map(\.durationMs),
                forcePlainPost: forcePlainPost
            )).rawValue,
            localMediaURLs: localMedia.map(\.url),
            localMediaMimeTypes: localMedia.map(\.mimeType),
            content: content,
            visibility: visibility,
            visibilityUserIds: visibilityUserIds,
            // **E2 (#3887) — texte et média portent DEUX langues distinctes,
            // SANS rouvrir la régression 7.4b.** La bascule est le TEXTE :
            //  • `content == nil` (vocal/média PUR) → il n'y a pas de texte,
            //    donc la langue PARLÉE de la transcription EST celle du contenu
            //    et gagne sur la capsule — exactement 7.4b, gardé par
            //    `ComposerDocumentToolChainTests.test_leCrux…`.
            //  • `content != nil` (texte + média) → le TEXTE garde la langue
            //    DÉCLARÉE (la capsule) ; le MÉDIA garde SA propre langue sur
            //    `mobileTranscription` ci-dessous, résolue à part (famille
            //    audio). Les conflater faisait un audio wolof retitrer le
            //    texte français, ou l'inverse.
            originalLanguage: content == nil ? (transcription?.language ?? originalLanguage) : originalLanguage,
            mentions: mentions,
            location: location,
            discoverabilityPrecision: discoverabilityPrecision,
            mobileTranscription: transcription,
            storyEffects: storyEffects
        )
    }

    /// Le geste « **j'ai enregistré ma voix** ».
    ///
    /// **AUCUN paramètre n'a de valeur par défaut**, et une garde de source le
    /// vérifie sur le code dépouillé de ses commentaires. Un appelant qui n'a
    /// ni lieu ni mentions écrit `nil` en toutes lettres : c'est le prix, et
    /// c'est le seul moyen qu'un champ ajouté demain ne disparaisse pas
    /// silencieusement d'un site d'appel.
    ///
    /// **La langue n'est PAS un paramètre, et c'est le cœur du correctif.**
    /// Elle est celle de la transcription — celle qu'on a PARLÉE — ou aucune.
    /// L'un des deux jumeaux empruntait la langue du sélecteur de TEXTE du
    /// composer quand la transcription manquait : un vocal en wolof composé
    /// dans un composer réglé sur « fr » partait déclaré français, et le Prisme
    /// le servait au rang 0 sous une étiquette fausse. Accepter ici un
    /// `composerLanguage`, même optionnel, garderait l'occasion de refaire
    /// exactement cela.
    static func audioRecording(
        fileURL: URL,
        mimeType: String,
        durationMs: Int,
        transcription: MobileTranscriptionPayload?,
        forcePlainPost: Bool,
        content: String?,
        visibility: String,
        visibilityUserIds: [String]?,
        mentions: [PostMentionInput]?,
        location: SharedPlace?,
        discoverabilityPrecision: DiscoverabilityPrecision?
    ) -> PublishIntent {
        PublishIntent(
            clientMutationId: ClientMutationId.generate(),
            // La règle de composition vit dans `ReelComposition`, et nulle part
            // ailleurs : un `"REEL"` codé en dur ici ferait diverger la surface
            // d'atterrissage d'un vocal de celle d'un média visuel.
            type: ReelComposition.defaultType(
                mimeTypes: [mimeType],
                durationsMs: [durationMs],
                forcePlainPost: forcePlainPost
            ).rawValue,
            localMediaURLs: [fileURL],
            localMediaMimeTypes: [mimeType],
            content: content,
            visibility: visibility,
            visibilityUserIds: visibilityUserIds,
            originalLanguage: transcription?.language,
            mentions: mentions,
            location: location,
            discoverabilityPrecision: discoverabilityPrecision,
            mobileTranscription: transcription,
            // **Un vocal n'a pas de scène**, et ce `nil` est écrit ici plutôt
            // que porté par un défaut : la règle 1 de ce fichier veut que
            // chaque geste DÉCLARE tout ce qu'il publie. Le jour où un
            // enregistrement gagnera un canvas, c'est cette ligne qui refusera
            // de rester fausse en silence.
            storyEffects: nil
        )
    }
}
