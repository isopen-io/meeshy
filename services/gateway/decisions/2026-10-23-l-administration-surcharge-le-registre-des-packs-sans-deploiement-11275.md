## L'administration publie, retire, date, cible et met à prix un pack par l'API, journalisée, sans déploiement (2026-10-23, #11275)

### Contexte

Le registre des packs officiels (`PackIndex`) est une donnée versionnée du dépôt, lue au démarrage. Retirer un pack, changer son prix ou sa fenêtre (#11274) exigeait donc un déploiement.

### Décision

1. **Le dépôt reste la source de l'EXISTENCE d'un pack ; la base n'en porte que des SURCHARGES** (`PackRegistryEntry`, `PackRegistryOverride`) : `hidden` (retirer ou republier), `order`, `price`, `availability`, `targeting`. `null` retire un champ.
   - Une surcharge ne crée jamais un pack : un slug absent du dépôt rend 404.
   - L'entrée fusionnée repasse par `PackIndexEntrySchema` : une fusion qui viole une loi du registre est refusée (422) et, lue en base, ignorée.
2. **Un pack gratuit au dépôt ne devient jamais payant par surcharge** (revue adversariale) : qui l'a installé gratuitement le perdrait, puisque le rendu exige la possession. Une surcharge ajuste ou retire un prix existant.
3. **Servir** : `startupPackIndex()` rend le registre du dépôt surchargé (`overlayPackIndex`).
   - Les specs de domaine relisent leur registre à chaque accès : la boutique suit sans redémarrer.
   - L'instantané est relu au plus toutes les 30 s, à l'accès, sans minuterie. Une base injoignable garde la dernière lecture et attend un délai.
   - Chaque passerelle converge seule : la passerelle reste sans état.
4. **Administrer** : `GET|PUT|DELETE /api/v1/admin/packs/registry[/:domain/:slug]`.
   - Garde : `canManageGame` (BIGBOSS, ADMIN), fail-closed.
   - Écriture : compare-and-set sur `revision`.
   - Journal : chaque action passe par `AdminAuditLog` AVANT d'agir, avec l'état d'avant ; un journal indisponible n'écrit rien, et les refus sont journalisés aussi.

### Corrigé après l'audit adversarial de #12293

- **Un pack gratuit ne redevient jamais payant.** La garde compare au prix EFFECTIF courant (dépôt + surcharge), et non plus au seul dépôt. Elle vaut sur PUT comme sur DELETE (retour au dépôt) : 422 `PACK_OVERRIDE_UNLAWFUL`, refus journalisé.
- **Fail-closed au démarrage.** La route d'administration charge les surcharges dans `onReady`, donc avant que le serveur écoute. Tant qu'aucune lecture n'a abouti (base injoignable au démarrage), l'instantané est inconnu et chaque pack du registre est servi MASQUÉ. Il est hors rayon, ni installable ni achetable, et reste rendu chez qui le tient déjà.
- **La relecture après écriture se fait au mieux.** Une écriture réussie reste un succès, même si la relecture échoue. La réponse sert ce qui a été écrit. La passerelle qui écrit attend une relecture déjà en vol, puis relit. Un retour au dépôt qui échoue est journalisé `PACK_REGISTRY_RESET_FAILED`.
- **Un pack masqué, ou dont la fenêtre n'est pas ouverte, ne se lit plus par son slug** (`PackCatalog.detail`), sauf pour qui l'a installé ou le tient. La règle est la même que pour l'installation.

### Ce que ce lot ne fait pas

- La modération d'un pack COMMUNAUTAIRE déjà publié (retrait d'une lens ou d'un pack d'apparence de tiers) garde ses routes de revue par domaine. Ce lot porte sur le registre officiel.
- La console web qui appelle ces routes reste à faire (issue de suivi).
