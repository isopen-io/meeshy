## 2026-09-27 : Le retour d'un contact s'annonce, une fois toutes les 3 heures — l'unique exception à la visibilité de la présence (#8285)

Décision porteur du 2026-09-27 : quand X redevient actif sur Meeshy, ses **amis acceptés** et les utilisateurs qui ont **X dans leur carnet** (`UserContact`, rapproché ou apparié par un numéro / e-mail vérifié) reçoivent « X était sur Meeshy récemment » (`contact_recently_active`). Toucher la notification ouvre le profil de X.

### Pourquoi c'est une exception, et pourquoi elle est bornée

La règle du 2026-08-25 (`visibilite-de-la-presence-soi-ami-accepte-admin-le-partage-d-une-conversation.md`) ne sert `isOnline` / `lastActiveAt` qu'à soi, aux amis acceptés et à ADMIN/BIGBOSS. Un porteur du carnet non ami n'a aucun droit de présence : la notification lui en donne un, **pour ce seul cas**, et sous trois bornes qui la rendent consentie et grossière :

1. **Le consentement de X.** Rien ne part si X a coupé `privacy.showOnlineStatus` (sa présence est masquée pour tous) **ou** le nouveau réglage `privacy.notifyContactsOnReturn` (« Prévenir mes contacts quand je reviens sur Meeshy »). Opt-out, défaut `true` : un document sans la clé vaut « activé ». Préférences illisibles ⇒ rien (repli RESTRICTIF : c'est une présence qui sortirait).
2. **La découvrabilité de X.** Caché de la recherche (`hideProfileFromSearch`, #8104) ⇒ les carnets ne sont pas interrogés ; seuls ses amis sont prévenus — même loi que `services/profile-discoverability.ts`.
3. **La résolution.** Au plus UNE annonce toutes les 3 heures PAR X, et la charge ne porte ni heure de connexion ni identifiant apparié : « récemment » est tout ce qui sort. Ce n'est pas un flux de présence, c'est un signal rare.

Le broadcast `user:status`, le `presence:snapshot` et toutes les portes de `PresenceVisibilityService` restent inchangés.

### Le verrou de 3 heures

`SET NX EX 10800` sur `notif:contact-return:<userId>` par `CacheStore.setnx` : Redis en production, sa `Map` mémoire sinon (atomique dans le processus). Deux connexions simultanées : une seule gagne. Le verrou se prend APRÈS les vérifications de consentement — couper puis rallumer la bascule ne consomme pas la fenêtre — et AVANT la résolution des destinataires.

Un compte de moins de 3 heures ne « revient » pas : son arrivée est déjà annoncée par `contact_joined` (#8105).

### Le déclencheur

La transition 0→1 des sockets d'un compte INSCRIT (`AuthHandler._authenticateJWTUser`, juste après `updateUserOnlineStatus`) — c'est-à-dire toute ouverture de l'application, quel que soit le mode de connexion, et non la seule connexion par mot de passe. La tâche part après l'appel (`deferAfterResponse`, qui porte le `.catch`) et ne retarde pas l'authentification.

### Les exclus, et le coût

X lui-même ; les comptes liés par un blocage dans un sens ou dans l'autre ; les comptes supprimés ou désactivés ; les destinataires qui ont coupé `notification.contactActivityEnabled` (« Quand un contact revient sur Meeshy », défaut `true`) — filtrés en lot, puis redemandés par `createNotification` (`type-preference.ts`). La résolution tient en un nombre FIXE de requêtes (amitiés, carnets, blocages, comptes, préférences), bornée à `FANOUT_ROW_CAP` : aucune requête par destinataire avant la création des notifications elles-mêmes, par paquets de 25.

Site unique : `services/notifications/contact-recently-active.ts`. Témoins : `services/notifications/__tests__/contact-recently-active.test.ts`, `socketio/handlers/__tests__/AuthHandler.contact-return.test.ts`.

### Ce qui n'est pas fait

Le miroir Android Kotlin ne reçoit pas le type (gel du 2026-09-16) ; la coque Android de `apps/web` le reçoit avec le web.
