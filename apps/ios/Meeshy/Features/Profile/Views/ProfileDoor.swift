import Foundation

/// Les portes que ma fiche ouvre vers d'autres écrans (#18590), et où chacune MÈNE. Les sections reçoivent une porte à
/// ouvrir, jamais le routeur : elles se rendent sans navigation, et la destination de chaque porte se lit et se teste
/// ici, en un seul `switch`.
enum ProfileDoor: Hashable, CaseIterable {
    /// « Mes cercles », depuis une pastille de niveau.
    case circles
    /// Les demandes qui attendent ma réponse (amitié et montée de cercle).
    case requests
    /// Le parrainage : inviter, c'est agrandir ses cercles.
    case invite
    case starredMessages
    case bookmarks
    /// « Mes packs », que les Réglages présentent (la boutique, elle, reste aux Réglages).
    case myPacks

    func open(with router: RouterCommands) {
        switch self {
        case .circles: router.push(.contacts(.circles))
        case .requests: router.push(.peopleDiscovery(.requests))
        case .invite: router.push(.affiliate)
        case .starredMessages: router.push(.starredMessages)
        case .bookmarks: router.push(.bookmarks)
        case .myPacks: router.openMyPacks()
        }
    }
}
