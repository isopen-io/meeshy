import Foundation
import UniformTypeIdentifiers

/// **Quels octets d'image traversent le pipeline SANS être ré-encodés** (#4925, #4985).
///
/// ## Une règle, écrite jusqu'ici à deux endroits
///
/// Le dépôt a DÉJÀ tranché quels formats passent intacts — `MediaCompressor`
/// `.compressImageData` rend un GIF et un WebP tels quels, une PNG en PNG, et
/// transcode délibérément tout le reste (« most web clients cannot decode HEIC
/// inline »). `CommentComposerStaging.imageFileExtension` redisait la même
/// liste pour NOMMER le fichier temporaire.
///
/// Deux énoncés de la même règle tiennent tant que personne n'en touche qu'un.
/// #4985 en demandait un troisième — la bande de médias récents doit savoir, AVANT
/// de charger quoi que ce soit, si les octets d'un asset méritent d'être lus —
/// et trois copies divergent au premier format ajouté. Ce type est le site
/// unique ; `MediaCompressor` garde sa politique de COMPRESSION, qui est une
/// autre question (comment réduire) que celle-ci (quoi préserver).
///
/// ## La même règle répond à deux questions qui n'ont pas le même coût
///
/// | question | entrée | ce qu'elle coûte |
/// |---|---|---|
/// | comment nommer ces octets ? | les OCTETS | il faut déjà les tenir |
/// | faut-il aller CHERCHER ces octets ? | l'UTI de l'asset | rien du tout |
///
/// La seconde est celle qui manquait. `PHAssetResource` nomme le format d'un
/// asset **sans en charger un seul octet** ; sans cette porte, faire remonter
/// l'original depuis la photothèque coûterait plusieurs mégaoctets par vignette
/// tapée — pour un JPEG ou un HEIC, c'est-à-dire pour la quasi-totalité d'une
/// pellicule — afin de les jeter aussitôt. La dimension 2 de la roadmap appelle
/// cela un bug, pas une dette.
///
/// > L'UTI en sait même PLUS que l'en-tête : `public.heic` et `public.heics`
/// > distinguent une image fixe d'une séquence, là où les octets ne le disent
/// > qu'au-delà de la boîte `ftyp`. Ici la distinction ne sert pas — le HEIC est
/// > transcodé dans les deux cas — mais elle explique pourquoi la porte se pose
/// > sur l'UTI plutôt que sur un préfixe d'octets.
///
/// ## La direction de l'erreur, encore
///
/// Un format inconnu retombe sur `jpg` / « ne pas préserver » : c'est le
/// comportement d'hier, donc aucune régression. C'est la MÊME direction que
/// celle qu'`AnimatedImageEligibility` a choisie en sens inverse — là-bas un
/// faux « non » figeait un sticker pour toujours, donc la porte dit « peut-être »
/// ; ici un faux « oui » enverrait au web un format qu'il ne rend pas. Chaque
/// porte penche du côté où se tromper se répare.
nonisolated enum PreservedImageFormat {

    /// **Les trois formats que le dépôt a décidé de laisser passer.**
    ///
    /// Le HEIC en est absent VOLONTAIREMENT (cf. `MediaCompressor`
    /// `.compressImageData`) : le préserver servirait au web un format qu'il ne
    /// décode pas. Le JPEG en est absent parce qu'il n'a rien à préserver — il
    /// est déjà la cible du transcodage.
    static let fileExtensions: Set<String> = ["gif", "png", "webp"]

    /// `image/gif` → `"gif"`. Tout le reste — JPEG, HEIC, inconnu — → `"jpg"`.
    ///
    /// L'extension n'est pas cosmétique : le `mimeType` s'en dérive en aval
    /// (`UTType(filenameExtension:)`), donc un GIF écrit `.jpg` est un GIF que
    /// tout l'aval, jusqu'au serveur, ré-encodera (#4925).
    static func fileExtension(forMimeType mimeType: String) -> String {
        let candidate = mimeType.split(separator: "/").last.map { $0.lowercased() } ?? ""
        return fileExtensions.contains(candidate) ? candidate : "jpg"
    }

    /// **Faut-il lire les octets d'origine de cet asset — sans en lire un seul ?**
    ///
    /// `assetUTI` vient de `PHAssetResource.uniformTypeIdentifier`, que
    /// PhotoKit rend depuis son index local. La traduction UTI → extension est
    /// celle du SYSTÈME (`UTType`), jamais une table écrite à la main : une
    /// table maison serait une quatrième copie de la règle, et se tromperait
    /// sur le premier alias (`com.google.webp` contre `org.webmproject.webp`).
    static func preservesOriginalBytes(assetUTI: String) -> Bool {
        guard let ext = UTType(assetUTI)?.preferredFilenameExtension?.lowercased() else { return false }
        return fileExtensions.contains(ext)
    }
}
