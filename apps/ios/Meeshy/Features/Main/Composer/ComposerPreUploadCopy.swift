import Foundation

/// **Ce que la vue `4c` DIT de l'état d'un asset** (#5086).
///
/// La planche l'écrit à deux états et deux seulement :
///
/// > `PRÊT`
/// > `MONTÉE EN COURS · 34 %` — `4,8 / 14,2 Mo`
///
/// ## Pourquoi les OCTETS et pas seulement le pourcentage
///
/// C'est la planche qui les met côte à côte, et elle a raison : **un
/// pourcentage seul ne dit pas s'il reste dix secondes ou dix minutes.** « 34 %
/// » sur 200 ko et « 34 % » sur 800 Mo sont la même phrase pour deux attentes
/// sans commune mesure — et la seule décision que l'auteur ait à prendre ici
/// est justement « est-ce que j'attends ? ».
///
/// ## Pourquoi rien du tout dans les deux autres états
///
/// `idle` n'a rien commencé. `failed` a échoué, et **l'échec ne se montre
/// pas** : la publication reprendra l'envoi, l'auteur ne peut ni le comprendre
/// ni le corriger, et le lui dire transformerait une optimisation invisible en
/// inquiétude. Rendre `nil` plutôt qu'une chaîne vide oblige l'appelant à
/// décider s'il peint quelque chose — une chaîne vide se concatène en silence
/// et laisse un séparateur orphelin, le défaut exact du « Texte : » de
/// VoiceOver.
// `nonisolated` comme son voisin `ComposerObjectChipsCopy`, et pour la même
// raison : le badge qui l'appelle est une RÈGLE, éprouvable sans monter de
// vue. La rendre `@MainActor` obligerait la règle à l'être, et une règle
// isolée n'est plus interrogeable depuis un test synchrone.
nonisolated enum ComposerPreUploadCopy {

    /// La phrase de l'état, ou `nil` quand il n'y a rien à dire.
    static func label(for state: ComposerPreUploadState,
                      locale: Locale = .current) -> String? {
        switch state {
        case .idle, .failed:
            return nil
        case .ready:
            return String(localized: "composer.preupload.ready",
                          defaultValue: "PRÊT", bundle: .main)
        case let .uploading(sent, total):
            // Le pourcentage est ENTIER : la planche écrit « 34 % », et une
            // décimale sur une barre qui bouge est du bruit qu'aucun œil ne lit.
            let pourcent = LocalizedNumber.percent(
                Int(((state.fraction ?? 0) * 100).rounded()), locale: locale)
            let octets = bytes(sent: sent, total: total, locale: locale)
            let entete = String(localized: "composer.preupload.uploading",
                                defaultValue: "MONTÉE EN COURS", bundle: .main)
            return "\(entete) · \(pourcent) — \(octets)"
        }
    }

    /// **« 4,8 / 14,2 Mo » — l'unité une seule fois, à la fin.**
    ///
    /// La planche l'écrit ainsi, et c'est la bonne forme : répéter l'unité
    /// (« 4,8 Mo / 14,2 Mo ») double la longueur pour ne rien ajouter, et les
    /// deux nombres partagent forcément l'échelle — un envoi ne change pas
    /// d'ordre de grandeur en route.
    ///
    /// L'échelle est choisie sur le TOTAL, jamais sur l'envoyé : sur les
    /// premiers octets d'un fichier de 14 Mo, une échelle choisie sur `sent`
    /// afficherait « 12,0 / 14,2 » en mélangeant kilo-octets et méga-octets.
    static func bytes(sent: Int64, total: Int64, locale: Locale = .current) -> String {
        let formateur = ByteCountFormatter()
        formateur.countStyle = .file
        formateur.includesUnit = false
        formateur.allowedUnits = allowedUnits(for: total)

        let unite = ByteCountFormatter()
        unite.countStyle = .file
        unite.allowedUnits = allowedUnits(for: total)

        let envoye = formateur.string(fromByteCount: max(0, min(sent, total)))
        return "\(envoye) / \(unite.string(fromByteCount: max(0, total)))"
    }

    private static func allowedUnits(for total: Int64) -> ByteCountFormatter.Units {
        if total >= 1_000_000_000 { return .useGB }
        if total >= 1_000_000 { return .useMB }
        return .useKB
    }
}
