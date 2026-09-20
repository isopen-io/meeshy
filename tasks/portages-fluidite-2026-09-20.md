# Les cinq correctifs de fluidité qui existent déjà, portés aux sites restants

**Lot ouvert le 2026-09-20.** Issues : #6226 (les deux abonnements qui font
battre tout un écran), #7010 (la racine et le fil re-diffusés), #7158 (le
texte de recherche). Milestone #96 — « L'app iOS est fluide, sobre et
instantanée — mesurée ».

## La forme du lot

Aucun de ces cinq défauts ne demande d'invention. Pour chacun, la réponse
existe dans le dépôt : elle est écrite, mesurée sur appareil, documentée avec
sa raison, et adoptée ailleurs. Ce qui manque est le PORTAGE — et dans deux
cas, un seul mot.

| # | Site resté sur l'ancien montage | Le correctif, déjà écrit |
|---|---|---|
| 1 | `RootViewComponents.swift` (`ThemedFeedOverlay`), `FeedView.swift`, `PeopleDiscoveryView.swift` — `@State CGFloat headerScrollOffset` | `ScrollOffsetRelay`, adopté par `ConversationListView` et `ContactsHubView` |
| 2 | `RootViewComponents.swift` — `@StateObject reelAutoplay` | `FeedView.swift:58-60`, `@State` avec la raison écrite (#7010) |
| 3 | `ConversationView.swift` — `@StateObject pendingAudioPlayer` | `ConversationView.swift:273`, `@State audioRecorder`, deux lignes plus haut (#6226) |
| 4 | `ConversationListViewModel.swift` — `@Published searchText` sur le modèle partagé | `ConversationComposerTextModel` + `ComposerTextHost` |
| 5 | `MeeshyVideoPlayer+Renderers.swift` — `@ObservedObject manager` | `ReelFeedVideoSurface.swift:78-100`, miroirs `@State` + `.onReceive` cantonnés |

S'y ajoutent les trois `Equatable` écrites et jamais posées que #6226
énumère : `RiverBubbleView`, `CommentRowView`, `ProfilePostRow`.

## Ce qui est repéré AVANT d'écrire

`ScrollMotionGeneralizationTests.test_feedHeader_wiresBothHalvesOfTheLaw`
attend aujourd'hui l'expression `.scrollMotionActive(offset: headerScrollOffset)`
dans `FeedView.swift`. Porter le relais la fera ROUGIR : c'est la garde qui
EXEMPTAIT le défaut. Elle se met à jour dans le même commit que le portage
qu'elle juge — jamais après.

## Preuve

Un témoin de source par portage, sur le modèle de
`RootRerenderSourceGuardTests` (#7010) : l'invariant se tient sur la SOURCE,
parce qu'un abonnement inutile ne change aucun pixel — il coûte des images.
Chaque témoin garde AUSSI son pendant : ce que la racine cesse d'observer,
quelqu'un, plus bas, doit encore le lire. Un correctif dont la valeur
n'atteint aucun lecteur n'a corrigé personne.

## Source

Audit iOS du 2026-09-20, branche `fix/nouvelle-connexion-appareil-7035`,
§ « Cinq correctifs déjà écrits, qu'il reste à recopier ». Étape 02 du plan,
après la fermeture des deux caches qui franchissaient la déconnexion (#7146,
livrée par la PR #7147).
