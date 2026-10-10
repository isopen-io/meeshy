## 2026-10-08 : Un nouvel inscrit crée jusqu'à cinq liens de partage pendant le délai de grâce de son adresse (#9713)

Milestone « Un inconnu rejoint une conversation traduite par un lien, en deux gestes ». Décision porteur du 2026-10-08 : option 2, plafond 5.

### Avant

`POST /links` et `POST /conversations/:id/new-link` étaient dans `EMAIL_VERIFICATION_GATED_ROUTES` (#6437) : un compte neuf recevait `403 EMAIL_NOT_VERIFIED` au premier geste de la boucle d'acquisition — partager sa conversation.

### La loi

La loi vit dans `services/auth/share-link-grace.ts` ; `requireShareLinkGrace` (`middleware/verification-gates.ts`) la monte sur les deux routes de création :

| appelant | verdict |
|---|---|
| adresse prouvée (`emailVerifiedAt`) | passe, sans compter |
| non prouvée, délai en cours | passe tant qu'il a moins de `UNVERIFIED_ACTIVE_SHARE_LINK_CAP` (5) liens actifs |
| non prouvée, 5 liens actifs ou plus | `403 EMAIL_NOT_VERIFIED` |
| délai échu (`blocked`) ou activation absente | `403 EMAIL_NOT_VERIFIED` (fail-closed) |

- **Le délai** est celui de #8238 tel que publier le lit (#8476) : `mayPublish(activation)`, jamais une seconde lecture de la phase.
- **Un lien actif** : `createdBy` = l'appelant, `isActive`, et une échéance `null`, absente ou future (`activeShareLinksWhere`). Les trois formes Mongo de l'échéance sont lues — `{ expiresAt: null }` ne matche pas une clé absente.
- Désactiver un lien libère sa place : c'est la définition, pas un contournement. Un lien créé avec sa conversation (`POST /links` sans `conversationId`) compte comme les autres.
- **Rouvrir un lien reprend sa place, sous la même loi.** L'audit adversarial l'a démontré : désactiver ses cinq liens, en créer cinq autres puis rouvrir les premiers donnait dix liens actifs, et sans fin en répétant. `PATCH /links/:linkId`, `/toggle` et `/extend` écrivent tous par `applyShareLinkUpdate` (`routes/links/management.ts`) : quand l'écriture fait entrer le lien dans le compte (`isActive` rendu à `true`, ou échéance passée repoussée), `assertShareLinkMayReopen` lit la loi pour le CRÉATEUR du lien (`createdBy`, dont l'activation est recalculée depuis sa ligne `User`), et le refus sort en `403 SHARE_LINK_CREATOR_EMAIL_NOT_VERIFIED` — pas `EMAIL_NOT_VERIFIED`, car celui qui rouvre peut être un co-administrateur dont l'adresse est prouvée, et le code ne doit rien prétendre de la sienne. Les clients ne mènent à la validation que sur un `POST` : ce code ne change rien à ce qu'ils font. Un créateur introuvable est refusé (fail-closed).
- La réouverture d'un lien par un administrateur de la PLATEFORME (`PATCH /admin/share-links/:id`) ne lit pas la loi : c'est une décision de modération, pas un geste du créateur.
- Le compte d'un numéro de téléphone n'est jamais `blocked` (#8238) : il reste plafonné à cinq liens actifs tant qu'il n'a pas prouvé son adresse. Une adresse cédée à une revendication (`emailReleasedAt`, phase `done` sans `emailVerifiedAt`) aussi.
- `POST /invitations/email` reste sous la garde stricte (`requireEmailVerification`) : il écrit à une adresse TIERCE.

### Le code du refus

Le refus au plafond garde `EMAIL_NOT_VERIFIED` plutôt qu'un code neuf : c'est le code que le web (`email-gated-transport.ts`) et iOS (`EmailVerificationGate`) savent mener à la validation de l'adresse PUIS rejouer — et une fois l'adresse prouvée, la création rejouée passe sans limite. Un code neuf aurait laissé les clients publiés devant une erreur muette. Seul le texte `error` distingue le plafond (`Email verification required to create more share links`), avec un `message` qui le dit.

Les deux clients retiennent toutefois la création de lien D'AVANCE quand la session sait l'adresse non prouvée : tant que #9715 n'est pas livrée, la grâce n'atteint l'utilisateur que si la session l'ignore. Le serveur est rétrocompatible dans les deux sens : un ancien client garde son comportement d'avant, et ne peut rien obtenir de plus que ce que la loi permet.

### La course au cinquième lien

Le comptage précède l'insertion de toute la durée du gestionnaire : sans précaution, N créations simultanées au 4e lien passent toutes. Une première version réservait une place entre comptage et réponse ; l'audit en a mesuré les deux défauts — trois comptages lents donnaient deux liens de trop (la réservation se rendait avant qu'ils finissent), et un lien inséré mais pas encore répondu comptait deux fois (refus à tort du 5e).

Retenu : un TOUR par compte (`takeShareLinkTurn`, chaîne de promesses en mémoire d'instance). La garde le prend avant de compter et ne le rend qu'à la fermeture de la réponse ; la réouverture le prend autour de sa relecture et de son écriture. Comptage ET écriture sont couverts : la création suivante compte une fois la précédente écrite. À la création, seules les adresses non prouvées en grâce le prennent — une adresse prouvée ne compte rien et n'attend personne. Une réponse déjà close (client parti pendant le comptage) rend le tour sur-le-champ, et un tour jamais rendu s'éteint après 30 s. Conséquence assumée : si une réponse ne se fermait jamais (cas pathologique), la création suivante du même compte ATTENDRAIT jusqu'à 30 s au lieu d'être servie.

**Le tour vit EN MÉMOIRE : il ne tient que sur UNE instance de passerelle.** Il n'y en a qu'une aujourd'hui (#9232). Dès qu'il y en aura deux, chaque instance a son propre tour : deux requêtes du même compte servies par deux instances ne s'attendent pas, et le plafond peut déborder d'un lien par instance supplémentaire. Un plafond anti-abus l'accepte ; passer à plusieurs instances exigera un verrou partagé (Redis) si le débordement compte.

Le comptage n'a pas d'index (`ConversationShareLink` n'en porte aucun sur `createdBy`) : à moins de 1 000 utilisateurs c'est sans effet ; l'index `[createdBy, isActive]` est #9720.

### Témoins

`__tests__/unit/middleware/share-link-grace-gate.test.ts` (la loi, la requête de comptage, la course — huit créations simultanées d'un compte vide n'en écrivent que cinq —, pas de double compte, le tour rendu), `routes/links/share-link-reopen-cap.test.ts` (les trois routes de réouverture), `routes/links/creation.test.ts` et `routes/conversation-new-link-email-verification.test.ts` (le câblage des deux routes, effet sur l'insertion), `routes/invitations-routes.test.ts` (l'invitation reste stricte en grâce).
