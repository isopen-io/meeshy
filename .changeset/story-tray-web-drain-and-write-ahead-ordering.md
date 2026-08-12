---
"@meeshy/web": patch
---

Le tray de stories du web draine ses pages, et l'intent write-ahead d'une story publiée cesse de courir contre son propre succès

`storyService.getStories` appelait `GET /posts/feed/stories` **sans aucun paramètre** et rendait
`response.data?.data ?? []` : ni `limit`, ni `cursor`, et surtout aucune lecture de
`pagination.hasMore`/`nextCursor`. Le tray web était donc coupé à 50 stories exactement comme
l'était celui d'iOS avant le cycle 80, pour la même raison, avec le même silence.

Il draine désormais, avec les **deux arrêts** que le cycle 80 avait établis comme distincts et tous
deux nécessaires : un plafond de pages (6, valeur miroir d'iOS) protège contre un serveur qui
annoncerait `hasMore` sans fin, et un `hasMore` **sans curseur** s'arrête au lieu de rejouer la même
page indéfiniment. La pagination de cette route est réellement exacte — sa fenêtre est filtrée par
`updatedAt` mais son curseur porte sur le couple `(createdAt, id)` de l'ordre — c'est ce qui rend le
drain suffisant, sans l'escalade dont le delta des conversations avait besoin.

Deux services se disputaient la route. L'inventaire des consommateurs a tranché :
`postsService.getStories` n'avait **aucun lecteur de production** — sa seule occurrence dans tout le
dépôt était son propre test. Copie morte supprimée, test compris ; paginer les deux aurait dupliqué
la dette au lieu de la payer. Rien de la troncature de tombstones n'est transposé : le web ne passe
jamais `updatedSince`, donc `meta.deletedStoryIdsTruncated` lui vaut toujours `false`.

Côté iOS, `StoryViewModel.launchUploadTask` retirait l'intent write-ahead d'une story publiée dans
un `Task.detached`, puis vidait `activeUploads` et déclarait le succès à l'écran sans que rien
n'ordonne les deux. Ce que l'intent protège est écrit sur place — « sinon le boot suivant
re-publierait » : détaché, le retrait ouvre une fenêtre où l'app meurt avec l'intent encore en base
alors que la story est **déjà en ligne**, et le drain de boot la publie une seconde fois. Le retrait
est désormais awaité (la tâche englobante est déjà `async`), exactement comme le fait le chemin de
drain hors-ligne depuis toujours ; le ménage disque reste détaché, c'est de l'IO synchrone qu'on ne
veut pas sur le MainActor.
