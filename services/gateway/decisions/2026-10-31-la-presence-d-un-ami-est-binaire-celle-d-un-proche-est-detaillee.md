## 2026-10-31 : la présence d'un Ami est binaire, celle d'un Proche est détaillée

**Statut** : Accepté (lot `presence-ami-binaire`, #13928 — chantier « Cercles de proximité et mode Sang », milestone #215). Complète [la décision du 2026-08-25](visibilite-de-la-presence-soi-ami-accepte-admin-le-partage-d-une-conversation.md) sans la réécrire : elle dit « ami accepté » sans niveau, celle-ci dit ce que chaque niveau obtient.

**Contexte** : directive du porteur, 2026-10-31 : « Un Ami voit seulement "en ligne" ou rien ; un Proche voit la présence détaillée ». Jusqu'ici tout lien d'au moins Ami recevait `isOnline` ET `lastActiveAt` (donc away / idle / « vu il y a »), sous la seule réserve des préférences de la cible. La loi d'accès (#13927) nomme déjà deux features : `presence.online` (Ami) et `presence.detailed` (Proche).

**Décision** :
1. **Ami (FRIEND)** : `isOnline` servi tel quel, `lastActiveAt` TOUJOURS nul. Pas de dernière connexion, pas d'état intermédiaire (la décroissance 1/3/5 se calcule sur `lastActiveAt`, qu'il ne reçoit pas). Hors ligne ⇒ « rien » : `isOnline: false`, aucun point d'avatar.
2. **Proche (CLOSE) et au-dessus** : la présence complète, règle 1/3/5, gouvernée par `showOnlineStatus` / `showLastSeen` de la cible comme avant.
3. **Sous Ami, soi-même, ADMIN/BIGBOSS, blocage, compte désactivé** : inchangés (directive 2026-08-25).
4. **Un seul site** : `resolvePresenceVisibility` (`packages/shared/utils/presence-visibility.ts`) interroge la loi deux fois (`presence.online` puis `presence.detailed`) ; aucune comparaison de niveaux ailleurs. Les portes REST, `presence:snapshot`, les sélections et tris (`OnlineOnlyScope`, `servedOnline`, `mayOrderByRawPresence`, `servedOnlineFirst`) lisent la VALEUR servie : elles suivent sans changer. La sélection `?onlineOnly=` garde l'ensemble Ami et au-dessus (un Ami peut être vu en ligne).
5. **`user:status`** (`socketio/presence-audience.ts`) : `friendIds` devient `friendLevels` (`PresenceVisibilityService.acceptedFriendLevels`, une lecture de niveaux de plus, bornée par les amis du sujet). Trois sous-ensembles : privilégiés, Proches et au-dessus (`lastActiveAt` selon `showLastSeen`), Amis (`lastActiveAt` nul). Le motif « une émission par sous-ensemble » est conservé ; deux sous-ensembles de charge identique partent en une seule émission. La répartition se demande à la loi partagée, jamais à une comparaison de niveaux.
6. **Inchangés par décision** : `contact_recently_active` (#8285), le battement de présence (`StatusService`, 60 s), la voie d'activité (`typing:start`, `message:new`).
7. **Aucun nouveau champ, route ou événement** : les clients lisent la même charge ; un `lastActiveAt` nul rend déjà « en ligne ou rien » (iOS `UserPresence.state`, Android `Presence.kt`, `getUserPresenceStatus`). Compatibilité : D-5 (#13947), aucune compatibilité ascendante pour les cercles ; le comportement est côté serveur, un ancien client n'affiche simplement plus ce qu'il ne reçoit plus.

**Alternatives rejetées** :
- *Servir `lastActiveAt` à l'Ami mais masquer l'état côté client* : la fuite est dans la charge, pas dans le rendu (leçon 275).
- *Un `isOnline` à trois valeurs pour l'Ami* : le client le décrypterait comme un état de plus ; « vrai ou rien » suffit.
- *Comparer le niveau dans `presence-audience`* : la garde #13927 interdit toute comparaison hors de la loi.
