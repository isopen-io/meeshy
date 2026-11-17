# Un contenu lisible sans compte se déplie chez les robots d'aperçu (2026-11-17, #3673, parapluie #19331)

## Contexte

Le porteur, le 2026-11-17 : « hors de Meeshy, ce doivent être des aperçus OG avec titre et contenu affichés ». Un post, un réel, une story ou une humeur partagé circule sous deux formes : son adresse directe (`/post|reel|story|mood/<id>`, `/feeds/post/<id>`, les anciennes `/p/<id>` et `/s/<id>`) et le lien SUIVI `/l/<jeton>` que frappe la feuille de partage (`PostService.shareWithTrackingLink`, cible typée `POST`/`REEL`/`STORY`/`STATUS`).

Jusqu'ici, les deux formes rendaient l'aperçu GÉNÉRIQUE de Meeshy. L'adresse directe tombait dans la coquille préconstruite de la famille `app` (nginx, aucun routeur `*-unfurl`), et le lien suivi d'un contenu était classé, dans `services/linkUnfurl/trackingLink.ts`, parmi « toute AUTRE adresse Meeshy (une conversation, un post, un profil), dont l'aperçu dirait ce qu'un lien ne doit pas dire ».

Ce classement datait d'avant #9149. Depuis, `GET /posts/:postId` sert un lecteur SANS compte sous `mayServePostToAnonymous` : public, vivant, d'un auteur actif, et l'original d'une republication aussi. Un contenu qui passe cette loi est déjà lisible par quiconque tient le lien. Son aperçu n'en dit pas plus.

## Décision

1. **Une page d'aperçu par contenu**, `GET /posts/:postId/og` (`routes/links/unfurl.ts`), composée par `services/linkUnfurl/content.ts` et servie aux seuls robots d'aperçu. Les routeurs Traefik `frontend(-staging)-content-unfurl` portent le même hôte, la même liste de robots et la même sortie humaine (`?open=1`) que les autres routeurs `*-unfurl`.
2. **La loi est celle de la lecture anonyme, sans copie.** Le `select` est un sur-ensemble de `ANONYMOUS_POST_ACL_SELECT`, et `isServableToAnonymous` décide. Tout refus (réservé, supprimé, expiré, auteur inactif ou désactivé, original réservé ou disparu, identifiant inconnu, malformé, lecture qui tombe) rend l'aperçu générique, octet pour octet celui d'un contenu inconnu.
3. **Ce qui part** :
   - le type et l'auteur (« Réel de Amani Diallo », sept langues) ;
   - le texte nettoyé, 200 caractères au plus, l'émoji devant le texte d'une humeur ;
   - l'image : la plus grande variante WebP de 1 200 px au plus, sinon la vignette, sinon l'original ; pour une vidéo, sa vignette ; sinon l'avatar de l'auteur en petite carte ; sinon l'image de marque ;
   - pour une vidéo, `og:video`, jamais un original qu'un robot ne lirait pas : le rendu H.264, sinon l'original MP4 s'il est H.264.
   
   Jamais un compteur, une audience, un destinataire ni une coordonnée : le `select` ne les charge pas. Un média sans texte se décrit par sa nature et sa durée (« 🎬 Vidéo · 0:42 »). L'adresse d'un fichier audio ne part jamais.
4. **La langue (cadrage)** : celle que le robot demande (`Accept-Language`), puis la langue d'origine du contenu, puis le français. **Le texte** descend les langues du robot par `resolvePrismTranslation` : une traduction à un rang servi gagne, sinon l'original (Prisme, règle 1).
5. **Le lien suivi d'un contenu** compose le même aperçu, à son adresse SUIVIE (`og:url` = `/l/<jeton>`), pour que l'ouverture se compte sur le lien. La cible se lit par `targetType` + `targetId`. Pour un ancien lien, ou un lien frappé dans le texte d'un message (sans cible typée), elle se lit par le chemin de `originalUrl` (`contentPathTarget`, `@meeshy/shared/utils/content-link`). Une cible hors de l'application n'est jamais redirigée pour un contenu.
6. **Une seule table des adresses de contenu**, `CONTENT_WEB_PATHS` / `contentLinkTarget` (`@meeshy/shared/utils/content-link`). `shareWithTrackingLink` y compose ses adresses, et les clients en tiennent des miroirs (Swift, Kotlin) aux mêmes vecteurs de test.

## Conséquences

- Aucune vue n'est comptée par la page : un robot n'est pas un lecteur.
- Le cache est celui des autres aperçus (5 min en mémoire, `Cache-Control: public, max-age=300`). Un contenu rendu privé peut donc encore se déplier pendant ce délai chez un robot qui le redemande ; c'est le régime déjà accepté pour les invitations.
- Les images servies sont des clés de stockage absolutisées par `publicMediaUrlFromEnv` ; un média de post n'est pas une pièce jointe de message et se lit par l'adresse nue (`fileRouteVerdict`, « média de post »).
- La route est déclarée d'exploitation (`packages/shared/api/ops-only-routes.ts`) : aucun catalogue client ne la porte. L'app lit le contenu par `GET /posts/:postId` pour sa carte vivante.

## Alternatives écartées

- **Préconstruire une coquille par contenu côté web** : impossible, une copie de build ne connaît aucun contenu (`apps/web/src/share-preview/share-preview.ts`, règle de sécurité structurelle).
- **Nommer aussi un contenu réservé à ses amis** (titre seul, sans texte) : le titre nommerait l'auteur et le type d'un contenu que le lien n'ouvre pas à un lecteur sans compte. C'est un oracle d'existence, refusé comme pour les invitations closes.
