import Foundation

/// **`StoryEffects` s'égale par son ENCODAGE, et c'est un choix** (#4756).
///
/// ## Pourquoi une conformance, et pourquoi celle-ci
///
/// Trois charges du dépôt sont `Equatable` et transportent désormais le canvas :
/// `PublishIntent`, `ComposerDocumentDraft` et `CreatePostPayload`. Sans
/// `StoryEffects: Equatable`, elles perdent toutes les trois leur synthèse — et
/// avec elle les témoins qui comparent une charge composée à celle qu'on
/// attend, c'est-à-dire la façon dont ce dépôt garde ses payloads.
///
/// La synthèse ordinaire aurait exigé de conformer une dizaine de types du
/// modèle de story (`StoryMediaObject`, `StoryAudioPlayerObject`,
/// `StoryKeyframe`, `StoryClipTransition`, …) : beaucoup de surface publique
/// ouverte pour un besoin qui n'est pas le leur.
///
/// ## L'égalité par encodage ne peut pas se PÉRIMER
///
/// Un `==` écrit à la main sur une structure à vingt champs est un INVENTAIRE :
/// il paraît juste, il compile, et le jour où un champ s'ajoute il continue de
/// rendre `true` sur deux valeurs qui diffèrent — sans que rien ne rougisse.
/// C'est le mode de panne que ce fichier existe pour rendre impossible : la
/// comparaison porte sur la charge ENTIÈRE, telle qu'elle part sur le fil, et
/// un champ neuf y entre sans qu'on ait à y penser.
///
/// > `StoryEffects` EST son encodage : c'est le blob que `CreatePostSchema`
/// > accepte et que le lecteur rejoue. Deux canvas qui s'encodent à l'identique
/// > sont, pour tout consommateur du dépôt, le même canvas.
///
/// ## `runtimeSnapshot`, et surtout PAS `encode(to:)`
///
/// `StoryEffects.encode(to:)` ne sérialise pas la structure : il rend
/// `CanvasV3(migrating: self)` — la forme du FIL, une projection. Deux valeurs
/// qui diffèrent sur ce que le canvas v3 absorbe ou n'exprime pas s'y
/// encoderaient à l'identique, et `==` les déclarerait égales. Une égalité
/// LARGE est le pire des deux défauts possibles ici : elle fait taire un
/// témoin qui compare deux charges réellement différentes.
///
/// `runtimeSnapshot` est la forme v1 COMPLÈTE, et son doc-comment le dit :
/// « l'empreinte LOCALE dont l'écran dépend ». C'est celle qu'il faut pour une
/// identité, et son existence n'est pas un hasard — le composer s'en sert déjà
/// pour savoir quand repeindre.
///
/// `.sortedKeys` rend l'ordre des clés déterministe — sans lui, deux
/// dictionnaires identiques pourraient s'encoder différemment et deux canvas
/// égaux se déclareraient distincts.
///
/// **Deux échecs d'encodage ne valent PAS une égalité.** `try?` rendrait `nil`
/// des deux côtés et `nil == nil` dirait `true` : deux valeurs dont on ne sait
/// RIEN seraient déclarées identiques. Le `guard` l'interdit — on ne répond
/// `true` que sur deux encodages réels.
extension StoryEffects: Equatable {

    public static func == (lhs: StoryEffects, rhs: StoryEffects) -> Bool {
        let encodeur = JSONEncoder()
        encodeur.outputFormatting = [.sortedKeys]
        guard let gauche = try? encodeur.encode(lhs.runtimeSnapshot),
              let droite = try? encodeur.encode(rhs.runtimeSnapshot) else { return false }
        return gauche == droite
    }
}
