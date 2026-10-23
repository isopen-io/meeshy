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

### Ce que ce lot ne fait pas

- La modération d'un pack COMMUNAUTAIRE déjà publié (retrait d'une lens ou d'un pack d'apparence de tiers) garde ses routes de revue par domaine. Ce lot porte sur le registre officiel.
- La console web qui appelle ces routes reste à faire (issue de suivi).
