## La page d'un éditeur nomme le profil Meeshy qui l'édite ; la boutique, elle, continue de ne servir que le nom de boutique (2026-11-06, #16433)

**Statut** : Accepté — amende le point 7 de [la décision du 2026-11-05 (#16274)](2026-11-05-un-editeur-de-packs-est-un-compte-meeshy-16274.md). Audit `auditeur-adversarial` requis avant fusion (contrôle d'accès : un champ de compte servi à tout inscrit).

**Contexte** : directive porteur du 2026-11-06 (#16433) — sur la fiche d'un pack, « le profil Meeshy qui édite, avec un lien vers ce profil », et une page éditeur avec son identité et tout son catalogue. La décision #16274 servait l'éditeur à la boutique SANS son compte propriétaire, que seule l'administration lisait.

**Décision** :
1. **Une route nouvelle, `GET /publishers/:slug/page`**, sert `{ publisher, owner, website }` : `publisher` est le `PackPublisherRef` de la boutique, inchangé ; `owner` est la carte du compte qui édite — `{ id, username, displayName, avatar }`, de quoi ouvrir son profil et rien d'autre (ni e-mail, ni numéro, ni rôle, ni dates) ; `website` est le site https du profil de partenaire.
2. **Un compte désactivé ou supprimé n'est jamais nommé** : `owner` vaut `null`, la page reste servie (le catalogue de l'éditeur reste lisible). Le compte officiel (`MEESHY_OFFICIAL_ACCOUNT_ID`) est nommé pour `meeshy`, aux mêmes conditions.
3. **`GET /publishers/:slug`, `/packs/shop` et tous les autres chemins de boutique sont INCHANGÉS** : ils continuent de ne servir que le nom de boutique. Seul celui qui ouvre la page d'un éditeur lit le compte, et l'adresse neutre `editeur` ne désigne personne (404).
4. **Le catalogue d'un éditeur n'a pas de route** : la boutique (`/packs/shop`) sert déjà `publisher.slug` sur chaque pack, et le client filtre — une seconde liste aurait dû rejouer la visibilité (verrou, possession, statut) que la boutique applique déjà.

**Conséquences** : publier un pack rend désormais son compte joignable depuis la boutique — c'est l'intention du porteur (un éditeur est un vrai compte). Comptes INSCRITS seulement, comme toute la famille `/publishers`. Le web et Android portent la page éditeur par leurs issues jumelles (`publishers.bySlugPage` déclarée en attente dans `scripts/check-ts-catalog-dead-entries.mjs`, plafond `TO_PORT_CEILING` relevé à 129).
