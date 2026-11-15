## 2026-08-16 : la LECTURE des préférences de confidentialité rejoint l'écriture, pas l'inverse

**Statut** : Accepté

**Contexte** : le dépôt porte deux rangements pour la même préférence — le document JSON
`UserPreferences.privacy` (clés camelCase) et les lignes clé/valeur `UserPreference`
(kebab-case, `show-read-receipts`). L'application n'écrit QUE le premier :
`PUT`/`PATCH /me/preferences/privacy` (`preference-router-factory.ts`), appelée par le web
(`stores/user-preferences-store.ts`) comme par iOS (`OutboxDispatcher`). Toutes les portes de
diffusion lisaient QUE le second : `PrivacyPreferencesService.fetchFromDatabase` /
`fetchManyFromDatabase`, et `MessageReadStatusService._loadReadReceiptOptOuts`. Le seul écrivain
du rangement lu, `PreferencesService.updatePrivacyPreferences`, n'a aucun appelant.

Conséquence : `showReadReceipts`, `showOnlineStatus`, `showLastSeen` et `showTypingIndicator`
étaient INERTES côté serveur. L'utilisateur coupait ses accusés de lecture, son statut en ligne
ou son indicateur de frappe, et le serveur continuait de tout diffuser.

Trois choses rendaient la panne invisible. Le `GET` de la même route relit le document : l'écran
affiche fidèlement le réglage, qui persiste entre lancements et appareils — l'aller-retour est
complet et cohérent, il ne touche simplement jamais la couche qui décide. Le défaut de chaque
préférence étant `true`, une lecture qui ne trouve rien produit exactement le comportement d'un
utilisateur n'ayant rien réglé : ni erreur, ni log, ni anomalie. Et les doubles de test ne
déclaraient que `userPreference` — un témoin qui ne connaît qu'un rangement confirme la lecture
sans jamais vérifier son adressage.

**Décision** : un résolveur unique, `services/preferences/privacy-storage.ts`
(`loadStoredPrivacyPreferences`), lit le document pour tous les utilisateurs demandés, puis
n'interroge les lignes héritées que pour ceux sans document exploitable. Les deux lecteurs y
passent. Le document prime toujours : le repli ne peut donc jamais contredire un réglage courant.

Le repli est conservé parce que l'endpoint `/user-preferences/privacy`, qui écrivait les lignes
clé/valeur, a existé du 12 au 18 janvier 2026 et a été retiré sans reprise de données. Ignorer ces
lignes rouvrirait en silence, pour les utilisateurs ayant réglé pendant cette fenêtre, la fuite
même que ce correctif ferme. Un document vide (`{}`) est traité comme une ABSENCE de document,
sans quoi il ferait taire le repli.

**Ce qui a été délibérément écarté** : faire écrire les deux rangements par la route. C'est le
plus petit diff, et il installe durablement deux sources de vérité pour une même donnée, à charge
pour chaque futur lecteur de deviner laquelle fait foi — exactement la situation qui a produit ce
défaut. `CLAUDE.md` § Single Source of Truth tranche dans l'autre sens.

**Conséquences** : `PreferencesService.updatePrivacyPreferences` est désormais nommé en commentaire
comme non branché et à ne pas rebrancher tel quel — il reste le seul écrivain survivant du
rangement hérité, donc le moyen tout prêt de recréer la divergence. Deux dettes restent ouvertes et
documentées (`tasks/realtime-sync-audit-2026-08-15-cycle46.md`) : la suppression de ce fichier
orphelin, et l'invalidation des caches à l'écriture — sans elle un réglage met jusqu'à cinq minutes
à prendre effet, là où il n'en prenait aucun avant ce cycle.
