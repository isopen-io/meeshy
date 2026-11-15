## La diffusion d'une préférence vit à la portée de la préférence, et la résolution Socket.IO n'a qu'un site

**Date** : 2026-08-16 (cycle 48)

**Contexte** : `user:preferences-updated` (scope catégorie) était émis depuis une
fermeture locale du facteur de routes, qui résolvait le serveur Socket.IO par
`fastify.socketIOHandler?.getManager?.()?.getIO?.()`. C'était le QUATRIÈME site de
résolution du dépôt, alors que `utils/socket-broadcast.ts` est le point unique
déclaré — et il n'en connaissait que deux formes. Les deux marchaient, mais pas
pour la même raison : `getIO()` est l'accesseur PUBLIC du manager, `manager.io`
un champ PRIVÉ que seul l'effacement des modificateurs TypeScript à l'exécution
rendait lisible.

**Décision** :
1. `resolveSocketIO` consulte l'accesseur PUBLIC `getManager().getIO()` en
   premier ; `manager.io` puis `handler.io` restent des replis pour les doubles.
2. Le facteur cesse de réimplémenter : ses quatre verbes passent par
   `broadcastToUser`.
3. La règle « qui apprend quoi » descend dans
   `services/preferences/preferences-broadcast.ts`, à côté du résolveur
   (`privacy-storage`) et de la mémoïsation (`privacy-cache`) de la même donnée.
   Les routes importent une fonction, pas une instance.
4. Les DEUX `DELETE` diffusent, comme `PUT` et `PATCH`. La remise à zéro globale
   émet UNE FOIS PAR CATÉGORIE.
5. Les DEUX `DELETE` passent de `update` à `updateMany`.

**Alternatives rejetées** :
- **Laisser le facteur avec sa propre résolution.** Elle était la seule à viser
  l'accesseur public, donc « la bonne » — mais en quatre exemplaires la question
  « laquelle est juste ? » n'a pas de réponse stable. Le point unique apprend la
  forme publique plutôt que d'être contourné par qui la connaît.
- **Un seul événement « toutes catégories » pour la remise à zéro globale.** Le
  client ne discrimine que sur `conversationId`, `communityId` et `category` : un
  événement sans `category` tomberait dans aucune branche et serait perdu en
  silence. Sept émissions sur une action rare valent mieux qu'une émission qui ne
  fait rien.
- **`upsert` au lieu de `updateMany` pour la remise à zéro.** Aligné sur
  `PUT`/`PATCH`, mais il CRÉE une ligne pour dire qu'il n'y a rien à stocker —
  une ligne par compte qui touche « réinitialiser » sans avoir jamais rien réglé.
- **Attraper `P2025` et rendre 200.** Reconnaître une erreur à son code pour la
  déclarer normale, là où `updateMany` exprime directement « remets à zéro ce qui
  existe » et rend `{ count: 0 }` quand rien n'existe.

**Conséquences** :
- `services/preferences/PreferencesService.ts` supprimé : orphelin, et dernier
  écrivain du rangement clé/valeur hérité `UserPreference` — donc le moyen tout
  prêt de recréer la divergence fermée au cycle 46. Le baril du module exporte
  désormais des fonctions.
- La diffusion reste best-effort : `broadcastToUser` journalise et rend `false`
  quand la couche Socket.IO manque, une écriture REST ne devant jamais échouer
  pour un canal latéral.
- Sur MongoDB, `data: { champJson: null }` est la forme VALIDE et
  `Prisma.DbNull` celle qui lève — l'inverse du folklore, vérifié contre un
  client 6.19.3 généré sur ce schéma. Le `null` brut en place est conservé.
