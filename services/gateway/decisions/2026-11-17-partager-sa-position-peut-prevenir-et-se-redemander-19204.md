## Partager sa position peut prévenir le destinataire, qui peut demander à prolonger ou redemander ; la batterie peut accompagner le partage, sous la loi de la batterie (2026-11-17, #19204)

**Statut** : Accepté (lot serveur de #19204, planche du profil #18857).

**Contexte** : la planche ajoute trois gestes autour du partage temporaire de position — « Prévenir Léo », « Demander à prolonger », « Partage terminé il y a 1 h · Redemander » — et la bascule « Partager aussi ma batterie — pendant le partage seulement ». Le contrat de démarrage était `.strict()` ; aucune notification de position, aucune demande, aucun lien entre partage et batterie n'existait.

**Décision** :

1. **Prévenir** : `notifyRecipients` (optionnel, faux par défaut) fait partir `location_share_started` vers chaque destinataire SERVI — ceux que l'éventail vient de servir : loi `location.temporary` (dès Ami, sans blocage), comptes utilisables, émetteur hors fantôme — et qui n'étaient pas des destinataires vivants du partage remplacé. Un nom et la durée pour CE lecteur (son échéance propre), jamais une position. Préférence `locationShareEnabled` (reçue par défaut) ; le dernier recours de blocage (`blocked-actor-content.ts`) tient le type.
2. **Demander** : `POST /relations/:userId/location/request` `{ kind: 'extend' | 'reask' }`. La loi `location.temporary` juge la paire comme si l'émetteur consentait ; sous Ami, entre bloqués ou vers un compte inutilisable : `403 SHARED_LOCATION_REQUEST_FORBIDDEN` (ce que le lien dit déjà, comme le relevé de batterie à la demande). Une demande par paire orientée et par 30 min, quel que soit son genre (`SET NX EX`) : `429 SHARED_LOCATION_REQUEST_TOO_SOON`. L'émetteur reçoit `location:share-requested` et `location_share_requested`. **Aucun effet automatique** : rien du partage n'est lu ni écrit.
3. **Batterie** : `shareBattery` se range dans l'état scellé du partage et vit avec lui (terme, échéance de chacun, arrêt, remplacement). La batterie lit cet accord (`sharedBatteryGrantsAmong`) comme CONSENTEMENT de l'émetteur pour `device.battery` seulement ; **la loi de la batterie reste le plafond** (dès Proche, sans blocage), la coupure globale ferme, et le fantôme global met la batterie du partage en pause comme le partage. Le geste explicite du partage l'emporte, le temps du partage, sur un retrait par personne. Démarrage et arrêt rejouent la batterie des personnes touchées. Aucune table, aucune clé à part.

**Alternatives rejetées** :
- *Ouvrir la batterie à un Ami pendant le partage* : ce serait abaisser le plancher de `device.battery` hors de la loi d'accès ; un Ami destinataire ne reçoit donc pas la batterie, et l'écart avec la planche est une décision produit à trancher, pas une exception de code.
- *Prévenir à chaque remplacement* : ajouter une personne réveillerait tous les autres.
- *Demande avec effet (prolongation automatique)* : l'émetteur décide seul de ce que sa position fait.

**Conséquences** : rétrocompatible — un ancien client sans les clés est inchangé ; un serveur antérieur refuse `notifyRecipients`/`shareBattery` (`INVALID`), et le client renvoie alors sans elles. La clé du plafond de demande (identifiants de la paire, 30 min) s'éteint d'elle-même et n'est pas purgée à part. Au terme d'un partage avec batterie, rien n'émet : la batterie se retire chez le lecteur au relevé suivant, et le client la cache avec le partage.
