import Foundation

// Payloads des mutations hors ligne des posts et commentaires.
// Même contrat que MutationPayloads.swift : clientMutationId = clé de
// déduplication partagée avec le MutationLog de la passerelle.

// MARK: - Posts & comments

/// **Un média DÉJÀ monté par une tentative précédente**, rangé sous son index
/// d'origine dans `CreatePostPayload.localMediaPaths`.
///
/// Les deux valeurs voyagent ENSEMBLE parce que les deux servent : l'`id`
/// devient un `PostMedia` dans le corps de `POST /posts`, et l'`url` est ce que
/// le canvas d'un réel affiche — adopter l'id sans l'url laisse le lecteur
/// devant un `file://` que l'assainisseur annule.
public struct UploadedPostMedia: Codable, Sendable, Equatable {
    /// Position du fichier dans `localMediaPaths` au moment de la composition.
    public let sourceIndex: Int
    /// L'identifiant `PostMedia`/`MessageAttachment` rendu par TUS.
    public let id: String
    /// La clé de stockage servie (`2026/09/<uid>/<nom>`), jamais une adresse.
    public let url: String

    public init(sourceIndex: Int, id: String, url: String) {
        self.sourceIndex = sourceIndex
        self.id = id
        self.url = url
    }
}

public struct CreatePostPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let content: String
    public let attachmentIds: [String]
    /// `"public" | "friends" | "community:<id>"` — kept as free-form string to
    /// avoid coupling the offline payload to backend enum churn.
    public let visibility: String
    /// Source language of `content`, forwarded to the gateway so the Prisme
    /// translation pipeline detects the right source. `nil` lets the gateway
    /// auto-detect. Optional so older persisted rows (pre-U1 ST3) decode as nil.
    public let originalLanguage: String?
    /// U1b — local media file paths (stored relative to the pending-media dir,
    /// resolved via `OfflineQueue.absoluteMediaPath(forStored:)`) for an OFFLINE
    /// media post: the dispatcher uploads them via TUS on reconnect, then creates
    /// the post with the resulting ids (+ any already-uploaded `attachmentIds`).
    /// `nil`/empty = text-only or already-uploaded post. Optional so older
    /// persisted rows decode as nil. Mirrors message media durability (S7b/S8).
    public let localMediaPaths: [String]?
    /// Server-side post type (`"POST" | "REEL" | "STATUS" | …`), forwarded to the
    /// gateway so an OFFLINE create lands on the right surface — a video /
    /// multi-image post created offline becomes a `REEL` exactly like the online
    /// path (`ReelComposition.defaultType`), and a mood becomes a `STATUS`.
    /// `nil` = the gateway default (`POST`). Optional so older persisted rows
    /// (pre-reel-offline) decode as nil and keep replaying as plain posts.
    public let type: String?
    /// STATUS/mood emoji (`type == "STATUS"`). Optional + ignored by the gateway
    /// for non-status types. Carried here so a mood survives offline durably via
    /// the same `.createPost` row as posts/reels.
    public let moodEmoji: String?
    /// Already-uploaded audio URL for an audio STATUS. `nil` for text/visual.
    public let audioUrl: String?
    /// Duration (seconds) of `audioUrl`. `nil` when there is no audio.
    public let audioDuration: Int?
    /// Explicit recipient ids for `EXCEPT` / `ONLY` visibility (and audience
    /// scoping for statuses). `nil` for the public/friends default.
    public let visibilityUserIds: [String]?
    /// Lieu partagé en attente d'envoi. `nil` pour l'immense
    /// majorité des posts — porté ici pour que le chemin durable (outbox)
    /// transporte la position exactement comme le chemin direct
    /// (`PostService.create`), au lieu de la perdre au flush après un envoi
    /// hors-ligne. Optionnel : un enregistrement persisté avant ce champ
    /// décode toujours sans cette clé.
    public let location: SharedPlace?
    /// Les personnes que l'auteur a nommées SANS les écrire (note sous le
    /// contenu, métadonnée silencieuse). `nil` — et jamais `[]` — quand il n'en
    /// a déclaré aucune : le serveur relit alors le texte lui-même.
    ///
    /// Porté ici pour la même raison que `location` : un post TEXTE, le cas le
    /// plus courant de l'app, ne passe jamais par `PostService.create` mais par
    /// cette file. Une déclaration absente du payload persisté serait perdue au
    /// premier redémarrage — et silencieusement, même en ligne.
    public let mentions: [PostMentionInput]?
    /// Le SECOND opt-in de position : le grain de
    /// découvrabilité géographique DEMANDÉ au serveur, indépendant du badge
    /// gouverné par `location` ci-dessus.
    ///
    /// Porté ici pour la même raison que `location` et `mentions`, et c'est ici
    /// que cela compte le plus : un post TEXTE + lieu — le cas nominal de
    /// cette fonctionnalité — n'emprunte JAMAIS `PostService.create`, il part
    /// par cette file (`FeedViewModel.isDurableTextOnly`). Sans ce champ,
    /// l'utilisateur coche « trouvable à proximité », voit sa publication
    /// partir, et son consentement disparaît au flush — silencieusement, même
    /// en ligne.
    ///
    /// `nil` — le défaut — vaut « non découvrable » : le gateway laisse alors
    /// `geoPoint`/`geoPrecision` nuls. Optionnel aussi pour que toute ligne
    /// persistée avant ce champ continue de décoder.
    ///
    /// Rien ici n'arrondit `location` : la coordonnée est persistée puis
    /// envoyée telle qu'elle a été reçue, le serveur seul quantifie.
    public let discoverabilityPrecision: DiscoverabilityPrecision?
    /// La publication que celle-ci REPARTAGE. **Seul porteur de l'attribution
    /// dans cette charge** : il n'y a pas de `viaUsername` sur le fil, et il
    /// n'y en a jamais eu que le gateway lise — `CreatePostSchema` ne le
    /// déclare pas, et un `z.object()` écarte les clés inconnues en silence. Le
    /// « via @X » qu'un composer affiche est un fait LOCAL d'affichage, jamais
    /// une écriture. Ne pas rouvrir ce champ-là en croyant compléter celui-ci.
    ///
    /// Porté ici parce que le chemin HORS LIGNE de `StatusViewModel.setStatus`
    /// en a besoin : sans lui, republier un mood sans réseau publierait un mood
    /// ORIGINAL, sans sa source — un contenu attribué à
    /// quelqu'un d'autre par omission. `nil` — le cas immensément majoritaire —
    /// vaut « publication d'origine ». Optionnel aussi pour que toute ligne
    /// persistée avant ce champ continue de décoder.
    public let repostOfId: String?
    /// La transcription faite SUR L'APPAREIL, telle que l'auteur l'a relue
    /// avant d'envoyer. Le gateway la persiste sur le premier `PostMedia` audio
    /// et **évite alors la re-transcription Whisper** (`PostService.createPost`).
    ///
    /// Sans elle ici, un vocal routé par la file durable arriverait sans son
    /// texte : le serveur re-transcrirait, le travail de l'appareil serait jeté
    /// en silence, et le résultat pourrait différer de celui qui avait été
    /// affiché. C'est ce qui QUALIFIE un enregistrement, pas ce qui le compose
    /// — et c'est précisément ce genre de champ qu'un lot de convergence laisse
    /// derrière lui.
    ///
    /// Sa graphie est celle du serveur (`duration_ms`, `speaker_id`,
    /// `MobileTranscriptionSchema`) : elle est portée par les `CodingKeys` du
    /// type lui-même, jamais réécrite ici.
    public let mobileTranscription: MobileTranscriptionPayload?
    /// Le type MIME **DÉCLARÉ** de chaque fichier de `localMediaPaths`, aligné
    /// par INDEX sur lui. `nil` (ou un index absent) ⇒ le dispatcher le
    /// re-dérive de l'extension, ce qui est le comportement des lignes écrites
    /// avant ce champ.
    ///
    /// Il existe parce que l'extension NE SUFFIT PAS. La file relocalise les
    /// fichiers « extension préservée pour que le dispatcher en dérive le
    /// MIME » — un contrat qui tient tant que la table des extensions connaît
    /// le conteneur. Un vocal importé depuis Fichiers en `.caf` / `.aiff` /
    /// `.opus` retomberait sur `application/octet-stream`, et le gateway ne
    /// reconnaît un média audio qu'à `mimeType.startsWith('audio/')` : le
    /// message partirait sans sa transcription embarquée ET sans
    /// re-transcription. Le site d'envoi, LUI, connaît le MIME — il doit
    /// l'emporter.
    ///
    /// C'est un champ de QUALIFICATION, pas de composition : il ne dit rien de
    /// ce que la publication CONTIENT, seulement de la façon dont ses octets
    /// doivent être annoncés. Un lot de convergence est exactement ce qui les
    /// laisse derrière.
    public let localMediaMimeTypes: [String]?

    /// Le nom choisi de chaque fichier, aligné par index sur `localMediaPaths`
    /// (#11166). Le fichier en file s'appelle `pending-media/<cmid>/0.pdf` : sans
    /// ce champ, le serveur garderait `0.pdf` en `originalName`. `nil` : aucune
    /// copie importée dans cette publication, ou ligne écrite avant ce champ.
    public let localMediaOriginalNames: [String?]?

    /// **LE CANVAS composé sur la scène.**
    ///
    /// Porté ici pour la même raison que `location` et `mentions`, et c'est ici
    /// que cela compte le plus : un post du meuble n'emprunte JAMAIS
    /// `PostService.create`, il part par cette file — en ligne comme hors ligne
    /// (`FeedViewModel.publish`). Sans ce champ, l'auteur compose un fond, des
    /// objets, un dessin, voit sa publication apparaître, et **la carte du fil
    /// n'affiche que le texte**.
    ///
    /// Optionnel : un enregistrement persisté avant ce champ décode toujours sans
    /// cette clé, et `nil` y dit la vérité — ces posts-là n'avaient pas de
    /// scène à transporter.
    public let storyEffects: StoryEffects?

    /// **La LÉGENDE de chaque fichier, alignée par INDEX sur
    /// `localMediaPaths`.
    ///
    /// Clée par index et non par id serveur, parce que l'id n'existe pas encore
    /// quand cette ligne est écrite : c'est l'upload qui l'attribue, au flush.
    /// Le dispatcher fait la traduction, seul étage à connaître les deux.
    ///
    /// `nil` à une position ⇒ ce fichier n'a pas de légende. Optionnel :
    /// un enregistrement persisté avant ce champ décode sans cette clé.
    public let mediaCaptions: [String?]?

    /// **Le texte ALTERNATIF par fichier, même alignement par INDEX**
    ///
    /// Jumeau de `mediaCaptions` par la forme, distinct par le destinataire :
    /// la légende s'adresse à qui VOIT le média, l'alternative à qui ne le voit
    /// pas. Le gateway les reçoit dans deux champs séparés
    /// (`CreatePostSchema.mediaCaption` / `.mediaAlt`), et aucun des deux ne
    /// sert de repli à l'autre.
    ///
    /// Optionnel pour la même raison : une ligne persistée avant ce champ décode
    /// sans cette clé.
    public let mediaAlts: [String?]?

    /// **L'identifiant d'OBJET de canvas de chaque fichier.**
    ///
    /// Il ne part PAS au serveur : il sert au dispatcher, une fois les ids
    /// serveur créés, à réécrire le canvas pour qu'il désigne les médias que
    /// le post possède réellement. Persisté avec le reste parce que le
    /// dispatch peut avoir lieu des heures après l'enfilage — et que ce lien
    /// n'existe nulle part ailleurs à ce moment-là.
    public let mediaObjectIds: [String?]?

    /// **L'autorisation d'extraction du son**, même clé top-level
    /// `allowSoundExtraction` que le chemin direct (`CreatePostRequest`,
    /// `PostService.create`).
    ///
    /// Porté ici pour la même raison que `storyEffects` et `location` : un
    /// post du meuble n'emprunte JAMAIS `PostService.create`, il part par
    /// cette file — en ligne comme hors ligne. Sans ce champ, le choix de
    /// l'auteur survivrait jusqu'à la composition de `PublishIntent`, et
    /// mourrait au premier passage par la file durable : déclaré, jamais
    /// transmis.
    ///
    /// `nil` — le défaut — vaut « l'auteur n'a rien décidé » ; le gateway
    /// applique alors son propre défaut (`CreatePostSchema.allowSoundExtraction`).
    /// Optionnel aussi pour que toute ligne persistée avant ce champ continue
    /// de décoder.
    public let allowSoundExtraction: Bool?

    /// **La publication naît fermée aux commentaires** (#16541), même clé
    /// top-level `commentsDisabled` que `CreatePostSchema`.
    ///
    /// Le choix vit sur la LIGNE, et c'est ce qui le rend aussi durable que la
    /// publication : il s'écrit dans la même transaction, se rejoue avec elle
    /// et disparaît avec elle. `nil` omet la clé — ouvert, le défaut de la
    /// passerelle —, et c'est aussi ce que relit toute ligne d'avant ce champ.
    public let commentsDisabled: Bool?

    /// Le MIME que ce média a DÉCLARÉ, ou `nil` si la ligne n'en portait pas
    /// (écrite avant ce champ, ou site d'envoi qui n'en connaît aucun).
    ///
    /// Un accès par index sur un tableau parallèle est une lecture hors bornes
    /// en puissance : la lire à UN endroit, ici, vaut mieux que de la répéter
    /// chez chaque consommateur.
    public func declaredMimeType(at index: Int) -> String? {
        guard let mimes = localMediaMimeTypes, mimes.indices.contains(index) else { return nil }
        return mimes[index]
    }

    /// Le nom choisi du fichier en file `fileURL`, ou `nil` s'il n'en a pas : le
    /// téléverseur prend alors le nom du fichier. La lecture se fait par nom de
    /// fichier parce qu'une variante réencodée n'est pas le fichier choisi.
    public func originalMediaName(forSentFile fileURL: URL) -> String? {
        guard let paths = localMediaPaths, let names = localMediaOriginalNames,
              let index = paths.firstIndex(where: { URL(fileURLWithPath: $0).lastPathComponent == fileURL.lastPathComponent }),
              names.indices.contains(index) else { return nil }
        return names[index]
    }

    /// **Ce qu'une tentative PRÉCÉDENTE a déjà monté.**
    ///
    /// Sans ce champ, `OutboxDispatcher.dispatchCreatePost` reparcourrait
    /// `localMediaPaths` DEPUIS L'INDEX 0 à chaque rejeu : un fichier téléversé
    /// avec succès à la tentative *n* serait **jeté** dès que la tentative
    /// échoue sur un fichier suivant. Seul l'offset TUS d'un fichier survivrait
    /// — jamais le fait qu'un fichier soit FINI. Une publication à trois médias
    /// et 56 Mo dont aucune tentative ne peut tout finir d'un trait ne se
    /// publierait JAMAIS, quel que soit le nombre de tentatives.
    ///
    /// La clé est l'INDEX D'ORIGINE, jamais la longueur d'un tableau : c'est la
    /// seule jointure entre ce que l'auteur a composé et ce que le serveur a
    /// créé, et un fichier sauté rompt tout alignement positionnel (même
    /// raison que `uploadedSourceIndexes` côté dispatcher).
    ///
    /// `nil` — le cas de toute ligne écrite avant ce champ, et de toute
    /// première tentative — vaut « rien d'acquis ».
    public let uploadedMedia: [UploadedPostMedia]?

    public init(
        clientMutationId: String,
        content: String,
        attachmentIds: [String],
        visibility: String,
        originalLanguage: String? = nil,
        localMediaPaths: [String]? = nil,
        type: String? = nil,
        moodEmoji: String? = nil,
        audioUrl: String? = nil,
        audioDuration: Int? = nil,
        visibilityUserIds: [String]? = nil,
        location: SharedPlace? = nil,
        mentions: [PostMentionInput]? = nil,
        discoverabilityPrecision: DiscoverabilityPrecision? = nil,
        repostOfId: String? = nil,
        mobileTranscription: MobileTranscriptionPayload? = nil,
        localMediaMimeTypes: [String]? = nil,
        localMediaOriginalNames: [String?]? = nil,
        storyEffects: StoryEffects? = nil,
        mediaCaptions: [String?]? = nil,
        mediaAlts: [String?]? = nil,
        mediaObjectIds: [String?]? = nil,
        allowSoundExtraction: Bool? = nil,
        commentsDisabled: Bool? = nil,
        uploadedMedia: [UploadedPostMedia]? = nil
    ) {
        self.clientMutationId = clientMutationId
        self.content = content
        self.attachmentIds = attachmentIds
        self.visibility = visibility
        self.originalLanguage = originalLanguage
        self.localMediaPaths = localMediaPaths
        self.type = type
        self.moodEmoji = moodEmoji
        self.audioUrl = audioUrl
        self.audioDuration = audioDuration
        self.visibilityUserIds = visibilityUserIds
        self.location = location
        self.mentions = mentions
        self.discoverabilityPrecision = discoverabilityPrecision
        self.repostOfId = repostOfId
        self.mobileTranscription = mobileTranscription
        self.localMediaMimeTypes = localMediaMimeTypes
        self.localMediaOriginalNames = localMediaOriginalNames
        self.storyEffects = storyEffects
        self.mediaCaptions = mediaCaptions
        self.mediaAlts = mediaAlts
        self.mediaObjectIds = mediaObjectIds
        self.allowSoundExtraction = allowSoundExtraction
        self.commentsDisabled = commentsDisabled
        self.uploadedMedia = uploadedMedia
    }
}

public struct ToggleLikePostPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let postId: String
    /// `true` = like, `false` = unlike. Encoded explicitly (not as presence)
    /// so the offline replay is deterministic regardless of server state.
    public let liked: Bool
    /// Emoji de la réaction, `nil` pour un like simple.
    ///
    /// Une réaction à une story n'a pas de route à elle : elle emprunte
    /// `POST /posts/:id/like`, que le gateway journalise sous le même
    /// `kind: 'toggleLikePost'` qu'un like de post. Un `OutboxKind` dédié
    /// dupliquerait une mutation que le serveur traite déjà comme une seule —
    /// l'emoji est le seul élément qui manquait au voyage.
    ///
    /// Optionnel aussi pour les lignes DÉJÀ en file : encodées avant ce champ,
    /// elles doivent continuer à se décoder, sinon la mise à jour ferait perdre
    /// des mutations en attente.
    public let emoji: String?

    public init(clientMutationId: String, postId: String, liked: Bool, emoji: String? = nil) {
        self.clientMutationId = clientMutationId
        self.postId = postId
        self.liked = liked
        self.emoji = emoji
    }
}

/// #15997 — « Enregistrer » rejoué depuis la file durable
/// (`POST|DELETE /posts/:id/bookmark`). L'état VOULU voyage explicitement,
/// jamais une bascule : un rejeu ne peut que le poser.
public struct ToggleBookmarkPostPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let postId: String
    public let bookmarked: Bool

    public init(clientMutationId: String, postId: String, bookmarked: Bool) {
        self.clientMutationId = clientMutationId
        self.postId = postId
        self.bookmarked = bookmarked
    }
}

public struct CreateCommentPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let postId: String
    public let parentCommentId: String?
    public let content: String
    /// Lieu partagé en attente d'envoi. `nil` pour l'immense majorité des
    /// commentaires — porté ici pour que le chemin durable (offline queue)
    /// transporte la position exactement comme le chemin direct.
    public let location: SharedPlace?
    /// Effets visuels du commentaire (bitmask) — porté par le chemin durable
    /// pour ne pas être perdu à l'enfilement, comme le chemin direct le porte.
    public let effectFlags: Int?
    /// Langue d'ÉCRITURE déclarée par l'auteur à la pastille du composer.
    ///
    /// `PostComment.originalLanguage` est la langue SOURCE depuis laquelle tout
    /// lecteur descend son prisme : sans ce champ, le serveur la DEVINERAIT par
    /// heuristique de mots (`detectLanguage`), et la pastille serait un contrôle
    /// qui ment. Une devinette à la place d'une déclaration fausse la résolution
    /// pour TOUS les lecteurs, sur les trois clients.
    ///
    /// REQUIS à la construction (aucune valeur par défaut) : c'est le
    /// COMPILATEUR, jamais la discipline de l'appelant, qui impose les sites —
    /// `location` et `effectFlags`, ajoutés AVEC défaut, manquaient encore à
    /// `FeedViewModel.sendComment`. TOLÉRANT au décodage (`String?` +
    /// `decodeIfPresent`) : `FeedPersistenceActor` relit ces blobs en `try?`,
    /// donc un champ requis à la relecture ferait disparaître SANS ERREUR
    /// toute la file hors-ligne gravée avant la mise à jour de l'app.
    public let originalLanguage: String?
    /// **L'ANCRE du média du post que ce commentaire CITE.**
    ///
    /// L'ancre SEULE : la nature est dérivée du MIME par le serveur, et tout ce
    /// qui décrit le média est relu à chaque service. Graver ici une vignette
    /// ferait ressusciter, au rejeu d'une file vieille de plusieurs jours, un
    /// média que son auteur a pu retirer entre-temps.
    ///
    /// TOLÉRANT au décodage (`String?` + `decodeIfPresent`), comme ses voisins :
    /// `FeedPersistenceActor` relit ces blobs en `try?`, donc un champ requis à
    /// la relecture ferait disparaître SANS ERREUR toute la file gravée avant la
    /// mise à jour de l'app.
    public let quotedPostMediaId: String?
    /// **Les pièces du commentaire, encore sur le disque** — chemins
    /// relatifs sous `Documents/pending-media/<cmid>/`, résolus par
    /// `OfflineQueue.absoluteMediaPath(forStored:)`. Le dispatcher les
    /// téléverse au rejeu puis crée le commentaire avec leurs ids : sans ce
    /// champ, un commentaire envoyé hors ligne arriverait SANS son média. Même
    /// mécanisme que `CreatePostPayload.localMediaPaths`. `nil` pour un
    /// commentaire sans pièce, et pour toute ligne gravée avant le champ.
    public let localMediaPaths: [String]?
    /// Le MIME DÉCLARÉ de chaque pièce, aligné par index sur `localMediaPaths`.
    public let localMediaMimeTypes: [String]?
    /// Ce qu'une tentative précédente a déjà monté, par index d'origine.
    public let uploadedMedia: [UploadedCommentMedia]?
    /// Transcription produite sur l'appareil pour une pièce audio.
    public let mobileTranscription: MobileTranscriptionPayload?
    /// **Le compte qui a ÉCRIT ce commentaire.** La ligne vit dans la
    /// base de son compte, mais l'enfilement d'un envoi qui échoue arrive
    /// APRÈS une attente réseau : entre-temps le compte a pu changer, et la
    /// file — un singleton rebranché à la bascule — aurait rejoué le
    /// commentaire, pièces comprises, sous le jeton du compte SUIVANT.
    /// L'auteur voyage donc DANS la charge, et le rejeu le compare au compte
    /// courant. `nil` pour une ligne gravée avant le champ — qui, faute
    /// d'auteur lisible, ne se rejoue JAMAIS (fail-closed).
    public let authorId: String?

    public init(
        clientMutationId: String,
        postId: String,
        parentCommentId: String?,
        content: String,
        originalLanguage: String?,
        /// REQUIS, sans défaut : c'est le compilateur qui impose à chaque
        /// site d'envoi de dire QUI écrit. Une charge sans auteur ne part pas.
        authorId: String?,
        location: SharedPlace? = nil,
        effectFlags: Int? = nil,
        quotedPostMediaId: String? = nil,
        localMediaPaths: [String]? = nil,
        localMediaMimeTypes: [String]? = nil,
        uploadedMedia: [UploadedCommentMedia]? = nil,
        mobileTranscription: MobileTranscriptionPayload? = nil
    ) {
        self.clientMutationId = clientMutationId
        self.postId = postId
        self.parentCommentId = parentCommentId
        self.content = content
        self.originalLanguage = originalLanguage
        self.location = location
        self.effectFlags = effectFlags
        self.quotedPostMediaId = quotedPostMediaId
        self.localMediaPaths = localMediaPaths
        self.localMediaMimeTypes = localMediaMimeTypes
        self.uploadedMedia = uploadedMedia
        self.mobileTranscription = mobileTranscription
        self.authorId = authorId
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        clientMutationId = try c.decode(String.self, forKey: .clientMutationId)
        authorId = try c.decodeIfPresent(String.self, forKey: .authorId)
        postId = try c.decode(String.self, forKey: .postId)
        parentCommentId = try c.decodeIfPresent(String.self, forKey: .parentCommentId)
        content = try c.decode(String.self, forKey: .content)
        originalLanguage = try c.decodeIfPresent(String.self, forKey: .originalLanguage)
        location = try c.decodeIfPresent(SharedPlace.self, forKey: .location)
        effectFlags = try c.decodeIfPresent(Int.self, forKey: .effectFlags)
        quotedPostMediaId = try c.decodeIfPresent(String.self, forKey: .quotedPostMediaId)
        localMediaPaths = try c.decodeIfPresent([String].self, forKey: .localMediaPaths)
        localMediaMimeTypes = try c.decodeIfPresent([String].self, forKey: .localMediaMimeTypes)
        uploadedMedia = try c.decodeIfPresent([UploadedCommentMedia].self, forKey: .uploadedMedia)
        mobileTranscription = try c.decodeIfPresent(MobileTranscriptionPayload.self, forKey: .mobileTranscription)
    }
}

public struct DeleteCommentPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let commentId: String

    public init(clientMutationId: String, commentId: String) {
        self.clientMutationId = clientMutationId
        self.commentId = commentId
    }
}

public struct ToggleLikeCommentPayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let commentId: String
    public let liked: Bool

    public init(clientMutationId: String, commentId: String, liked: Bool) {
        self.clientMutationId = clientMutationId
        self.commentId = commentId
        self.liked = liked
    }
}
