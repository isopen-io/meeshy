# Cycle 220 — six familles de diffusion d'ACTIVITÉ taisent ce qu'un blocage sépare (#20338)

Réservation de branche. Suivi du cycle 218 (audit adversarial de #20236,
constat 6), et suite directe du cycle 219 (#20337), qui a fermé la CHARGE des
réactions de commentaire.

## Le périmètre

#20236 a fermé les quatre événements d'activité d'un **commentaire**. La question
« quels AUTRES sites d'activité ne filtrent rien ? » en a rendu six, toutes sur
des posts, des stories et des statuts.

| événement | site |
|---|---|
| `post:liked` / `post:unliked` | `SocialEventsHandler.broadcastPostLiked` / `…Unliked` |
| `story:reacted` / `story:unreacted` | `SocialEventsHandler` |
| `status:reacted` / `status:unreacted` | `SocialEventsHandler` |
| `post:reaction-added` / `post:reaction-removed` | `PostReactionHandler` |

`post:liked` est la **jumelle exacte** de `comment:liked` — même forme, même
défaut, laissée de côté par #20236 qui s'arrêtait au commentaire.

## Ce qui est déjà en place

La loi est écrite et partagée : `socketio/separatedRooms.ts` (#20236, étendu par
#20337 avec son option `cached`). Ces six familles n'ont qu'à l'appeler avec leur
propre couple de sujets.

**Et `keep: actorId` est ici le bon choix**, contrairement au cycle 219 : ces
charges ne portent **aucun roster** (`PostReactionAggregation` est
`{ emoji, count }`, « NO userIds, count only »), donc rien ne nomme un TIERS.
L'acteur reste dans l'audience de son propre geste — décision porteur du
2026-09-13, « le like n'est pas synchronisé entre les différentes vues ».

À mesurer et à livrer dans ce lot.
