import Foundation
import MeeshyUI

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
    /// ## Deux corrections du 2026-09-04, trouvées par une session voisine
    ///
    /// **1. `ByteCountFormatter` n'a AUCUNE propriété `locale`.** La première
    /// écriture en employait un et déclarait pourtant un paramètre `locale:`
    /// — inerte. Résultat à l'écran : « MONTÉE EN COURS · 34 % — 4.8 / 14.2 Mo »
    /// — **une seule phrase, trois décisions de locale, deux résultats
    /// contradictoires** : le pourcentage français (`LocalizedNumber` honore le
    /// paramètre), le nombre anglais (le formateur suit le processus), l'unité
    /// française. Les témoins passaient chez moi et tombaient chez le voisin,
    /// parce qu'ils mesuraient la locale du SIMULATEUR.
    ///
    /// > **Une conformité APPARENTE est pire qu'une absence** : un paramètre
    /// > `locale` qu'on voit passer éteint la question chez le prochain lecteur.
    ///
    /// **2. Le formatage des tailles a DÉJÀ une source unique** —
    /// `formatMediaFileSize`, dont le doc-comment énumère ses consommateurs et
    /// nomme « upload progress ». En écrire un second ici rejouait exactement le
    /// défaut que ce helper dit avoir refermé : deux algorithmes derrière un
    /// commentaire qui prétend la parité. La source a été ÉTENDUE (locale +
    /// échelle imposée) plutôt que doublée.
    ///
    /// L'échelle est choisie sur le TOTAL, jamais sur l'envoyé : sur les
    /// premiers octets d'un fichier de 14 Mo, une échelle choisie sur `sent`
    /// afficherait « 12,0 / 14,2 » en mélangeant kilo-octets et méga-octets.
    ///
    /// Le premier nombre est formaté SANS unité par une division explicite —
    /// `ByteCountFormatStyle` ne sait pas l'omettre, et retirer le suffixe d'une
    /// chaîne déjà formatée serait faux dans les locales qui ne le posent pas à
    /// la fin (l'arabe en premier lieu).
    static func bytes(sent: Int64, total: Int64, locale: Locale = .current) -> String {
        let echelle = scale(for: total)
        let envoye = (Double(max(0, min(sent, total))) / echelle.divisor)
            .formatted(.number.locale(locale).precision(.fractionLength(0...1)))
        return "\(envoye) / \(formatMediaFileSize(max(0, total), allowedUnits: echelle.units, locale: locale))"
    }

    /// L'échelle et son diviseur, ensemble — les deux doivent s'accorder, et
    /// les tenir dans deux fonctions les laisserait diverger en silence.
    /// Les seuils sont DÉCIMAUX parce que `formatMediaFileSize` emploie
    /// `.file`, la convention du Finder ; des seuils binaires ici rendraient
    /// « 1024,0 / 1,0 Mo ».
    private static func scale(for total: Int64) -> (units: ByteCountFormatStyle.Units, divisor: Double) {
        if total >= 1_000_000_000 { return (.gb, 1_000_000_000) }
        if total >= 1_000_000 { return (.mb, 1_000_000) }
        return (.kb, 1_000)
    }

}
