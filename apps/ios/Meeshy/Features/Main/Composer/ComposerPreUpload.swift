import Foundation

/// **La pré-montée — la vue `4c`, et ce qui la rend possible** (#5086).
///
/// > « La composition continue pendant la montée : au moment de publier, il ne
/// > reste qu'un **accusé** à attendre — pas un envoi entier. »
///
/// > « Rogner n'invalide pas la montée. C'est ce qui autorise à monter le
/// > fichier pendant que l'utilisateur compose : les bornes voyagent avec la
/// > publication, le fichier reste celui qui est déjà en train de partir. »
///
/// ## Ce que la mesure disait avant ce lot
///
/// La montée ne commençait pas à la pose, elle commençait à la PUBLICATION :
/// `runStoryUpload` prenait l'état entier, ouvrait un `TusUploadManager` et
/// créait les Posts dans la foulée. Au moment de publier, l'auteur attendait
/// l'envoi ENTIER — exactement ce que la planche dit qu'il ne devrait plus
/// attendre.
///
/// ## La garantie structurelle, et pourquoi elle n'est pas un `catch`
///
/// Le critère de fin de #5086 exige qu'« un échec de pré-montée ne fasse
/// JAMAIS échouer la publication ». Ce n'est pas obtenu par une erreur
/// rattrapée : la boucle de publication ne monte QUE les objets dont
/// `postMediaId` est vide (`for i in mediaObjects.indices where
/// mediaObjects[i].postMediaId.isEmpty`). Une pré-montée qui réussit remplit ce
/// champ et l'objet est sauté ; une pré-montée qui échoue ne le remplit pas et
/// l'objet est monté comme avant.
///
/// **Le repli est le chemin nominal d'hier, et il n'a pas bougé d'une ligne.**
/// C'est ce qui rend la garantie vérifiable sans simuler un échec réseau : elle
/// tient à la FORME du code, pas à une branche d'erreur qu'il faudrait
/// atteindre.
///
/// ## Ce que le recadrage a à voir avec ça
///
/// Tout. Une pré-montée n'est justifiable que si les gestes d'édition
/// n'invalident pas le fichier déjà parti. Rogner, recadrer et couper
/// n'écrivent que des BORNES dans l'objet (#5085) ; le pixel n'est retouché
/// qu'au rendu final, côté serveur. Un éditeur qui ré-encoderait à chaque geste
/// rendrait la pré-montée impossible — et, dit la vue `4a`, serait « la seule
/// manière garantie de rendre ce composer lent ».
nonisolated enum ComposerPreUploadState: Equatable, Sendable {

    /// Rien n'a commencé — l'asset vient d'être posé, ou n'est pas éligible.
    case idle

    /// En cours. Les deux nombres sont ceux que la vue `4c` affiche
    /// (« 4,8 / 14,2 Mo »), pas une fraction : un pourcentage seul ne dit pas
    /// s'il reste dix secondes ou dix minutes.
    case uploading(sent: Int64, total: Int64)

    /// **PRÊT** — l'asset est chez le serveur, et la publication n'aura plus
    /// qu'à le référencer.
    case ready(postMediaId: String, remoteURL: String)

    /// La pré-montée a échoué. **Ce n'est pas une erreur à montrer** : la
    /// publication reprendra l'envoi, et annoncer un échec que l'auteur ne peut
    /// ni comprendre ni corriger transformerait une optimisation invisible en
    /// inquiétude.
    case failed

    /// La progression, pour la barre. `nil` quand il n'y a rien à montrer —
    /// une barre à zéro qui ne bouge pas est pire qu'aucune barre.
    var fraction: Double? {
        guard case let .uploading(sent, total) = self, total > 0 else { return nil }
        return min(1, max(0, Double(sent) / Double(total)))
    }

    /// La publication peut-elle sauter cet asset ?
    var isReady: Bool {
        if case .ready = self { return true }
        return false
    }

    /// La vue `4c` peint-elle une progression pour cet asset ?
    var showsProgress: Bool {
        if case .uploading = self { return true }
        return false
    }
}

/// Les règles de la pré-montée. Pures — aucune session, aucun fichier.
nonisolated enum ComposerPreUploadPolicy {

    /// **Ce qui vaut la peine de partir tôt.**
    ///
    /// Un fichier minuscule ne gagne rien à la pré-montée : l'envoi coûte moins
    /// que la poignée de main. Le seuil est bas — le but n'est pas d'économiser
    /// des octets mais d'éviter de MONTER puis de JETER pour rien quand
    /// l'auteur pose et retire dans la même seconde.
    static let minimumBytes: Int64 = 64 * 1024

    /// **Deux à la fois, pas plus.** La bande passante est la ressource que la
    /// composition partage avec la pré-montée : trois envois parallèles rendent
    /// le chargement des vignettes visible, et la vue `4a` budgète la fluidité
    /// à 60 fps PENDANT la montée. Le nombre est ici et non chez l'appelant
    /// pour qu'un second site ne puisse pas en choisir un autre.
    static let maximumConcurrent = 2

    /// **Blocs de 5 Mio, reprise à l'octet** — l'étage 6 de la vue `4a`. Le
    /// nombre est celui de la planche, pas un réglage : il porte le budget qui
    /// fait accepter ou refuser cet étage en revue.
    static let chunkBytes = 5 * 1024 * 1024

    /// Un asset part-il tôt ?
    ///
    /// - Parameter alreadyRemote: l'objet porte déjà un `postMediaId` — il
    ///   vient d'une republication ou d'une pré-montée précédente, et le
    ///   remonter en créerait un DOUBLON côté serveur.
    static func mayBegin(fileSize: Int64, alreadyRemote: Bool) -> Bool {
        guard !alreadyRemote else { return false }
        return fileSize >= minimumBytes
    }

    /// **Ce que la publication fait d'un asset donné.**
    ///
    /// Deux cas et deux seulement : ou bien la pré-montée a abouti et la
    /// publication RÉFÉRENCE, ou bien elle monte — y compris quand la
    /// pré-montée est encore en cours. **Attendre serait un troisième cas, et
    /// il est refusé exprès** : la publication attendrait alors précisément ce
    /// que la vue `4c` promet de ne plus faire attendre, et un envoi lent
    /// bloquerait l'auteur pour un gain qui n'existe que s'il a fini.
    ///
    /// Le coût assumé est un envoi en double pour l'asset qui n'a pas eu le
    /// temps de finir. Il est borné : la pré-montée est annulée dès que la
    /// publication démarre.
    static func publishReuses(_ state: ComposerPreUploadState) -> Bool {
        state.isReady
    }
}
