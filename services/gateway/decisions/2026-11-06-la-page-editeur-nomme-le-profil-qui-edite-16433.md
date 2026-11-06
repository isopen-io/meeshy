## La page d'un éditeur nomme le profil Meeshy qui l'édite ; la boutique, elle, continue de ne servir que le nom de boutique (2026-11-06, #16433)

**Statut** : Accepté — amende le point 7 de [la décision du 2026-11-05 (#16274)](2026-11-05-un-editeur-de-packs-est-un-compte-meeshy-16274.md). Audit `auditeur-adversarial` requis avant fusion (contrôle d'accès : un champ de compte servi à tout inscrit).

**Contexte** : directive porteur du 2026-11-06 (#16433) — sur la fiche d'un pack, « le profil Meeshy qui édite, avec un lien vers ce profil », et une page éditeur avec son identité et tout son catalogue. La décision #16274 servait l'éditeur à la boutique SANS son compte propriétaire, que seule l'administration lisait.

**Décision** :
1. **Une route nouvelle, `GET /publishers/:slug/page`**, sert `{ publisher, owner, website }` : `publisher` est le `PackPublisherRef` de la boutique, inchangé ; `owner` est la carte du compte qui édite — `{ id, username, displayName, avatar }`, de quoi ouvrir son profil et rien d'autre (ni e-mail, ni numéro, ni rôle, ni dates) ; `website` est le site https du profil de partenaire.
2. **Le compte n'est nommé que si TOUT tient** (audit adversarial du 2026-11-06), sinon `owner` vaut `null` et la page reste servie (le catalogue de l'éditeur reste lisible) :
   - l'adresse n'a qu'UN titulaire — un doublon (course sans index unique) ne désigne pas un compte qui n'édite pas ce pack ;
   - le nom n'a pas été neutralisé par `servable` (ancien nom qui se lit comme Meeshy) — et dans ce cas le SITE ne part pas non plus : un lien posé à côté d'une identité jugée trompeuse est un vecteur d'hameçonnage ;
   - le compte est actif, ni désactivé ni supprimé ;
   - il a publié au moins un pack APPROUVÉ (stickers, apparence ou lens) : un profil de partenaire créé avant cette page, sous la promesse du point 7 de #16274, et qui n'a rien publié, reste anonyme. Le compte officiel en est dispensé (ses packs sont ceux du dépôt, attribués par l'index) ;
   - la loi « ne pas être trouvé » (#8104, `undiscoverableAmong`) ne le cache pas à ce lecteur — une adresse d'éditeur se devine depuis son nom, c'est donc une résolution « nom → compte » ;
   - ni lui ni le lecteur ne se sont bloqués (`isBlockedBetween`, `utils/blocking.ts`, jamais réécrite) — **sans exemption pour le compte officiel**.
   Sans loi de visibilité injectée (`ownerVisibility`), personne n'est nommé : fermé par défaut. Le lecteur est le compte inscrit de la requête ; un invité de lien est refusé (403 `REGISTERED_USER_REQUIRED`) avant toute lecture. La route est plafonnée à 30 lectures par minute et par lecteur.
3. **`GET /publishers/:slug`, `/packs/shop` et tous les autres chemins de boutique sont INCHANGÉS** : ils continuent de ne servir que le nom de boutique. Seul celui qui ouvre la page d'un éditeur lit le compte, et l'adresse neutre `editeur` ne désigne personne (404).
4. **Le catalogue d'un éditeur n'a pas de route** : la boutique (`/packs/shop`) sert déjà `publisher.slug` sur chaque pack, et le client filtre — une seconde liste aurait dû rejouer la visibilité (verrou, possession, statut) que la boutique applique déjà.

**À trancher par le porteur** : un compte qui a publié AVANT ce lot l'a fait sous la promesse « jamais le compte » (#16274, point 7). Ce lot le nomme dès lors qu'il a un pack approuvé et qu'il ne se cache pas de la recherche. L'avis de `conformite-juridique` (information des intéressés, RGPD) et la décision du porteur sont requis avant la promotion en production.

**Conséquences** : publier un pack rend désormais son compte joignable depuis la boutique — c'est l'intention du porteur (un éditeur est un vrai compte). Comptes INSCRITS seulement, comme toute la famille `/publishers`. Le web et Android portent la page éditeur par leurs issues jumelles (`publishers.bySlugPage` déclarée en attente dans `scripts/check-ts-catalog-dead-entries.mjs`, plafond `TO_PORT_CEILING` relevé à 129).
