# Journal de la routine « Communautés — un lot toutes les 2 h »

Journal, pas pilotage : l'état de chaque tâche vit dans son issue GitHub, qui fait foi.

| date | lot | PR | issues | état |
|---|---|---|---|---|
| 2026-11-07 | Rejoindre / quitter depuis le détail (web), le détail dit au lecteur son rôle (passerelle, iOS) | #16601 | #6378 | fusionnée dans dev |
| 2026-11-07 | Un ancien membre ne voit plus une communauté privée nulle part ; compteur actif partout (passerelle) | #16610 + #16611 | #16603 | fusionnées dans dev |
| 2026-11-07 | Les membres d'une communauté se lisent et se gèrent sur le web ; la passerelle protège le créateur | #16636 | #6375 | fusionnée dans dev |
| 2026-11-07 | On invite quelqu'un dans sa communauté depuis le web ; un compte non vivant ou bloqué n'est plus ajouté (passerelle) | #16670 | #6376 (refs, reste : la création) | fusionnée dans dev (réveil 5) |
| 2026-11-07 | Créer une conversation dans une communauté n'y fait plus entrer que ce que l'appelant peut admettre (passerelle) | voir réveil 6 | #16639 | PR ouverte |

## 2026-11-07 — lot 1

- Lot : #6378. `GET /communities/:id` sert `currentUserRole` ; iOS le lit (il lisait `members[]`, jamais servi) ; le web offre Rejoindre / Quitter, optimistes.
- Suivis ouverts : #16602 (miroir Android), #16603 (les autres routes comptent encore un ancien membre).
- La CI des PR est gelée (`vars.PR_CI_GEL`) : la preuve d'une branche est un `workflow_dispatch` de `ci.yml` et `ios.yml` sur la DERNIÈRE tête (ne rien pousser pendant qu'il tourne).
- Prochain lot recommandé : #16603 (sécurité, petit et vertical), puis #6375 (membres lus et gérés sur le web).

## 2026-11-07 — lot 2

- Lot : #16603. Un seul prédicat « membre » (`activeMembershipOf`, `serialization.ts`) pour la liste, les salons et le rattachement d'un salon (cible ET source) ; `COMMUNITY_ACTIVE_COUNTS` pour tout `memberCount` ; la liste et le détail servis par `communityForViewer` (la liste sert donc `currentUserRole`, additif, et ne charge plus les membres de chaque communauté).
- Passerelle seule : aucun client ne change de comportement (un ancien client ignore `currentUserRole` dans la liste).
- #16610 a été fusionnée avant les correctifs de la revue adversariale ; ils partent dans une PR de suite : `POST /conversations` avec `communityId` admettait un ancien membre puis réactivait sa ligne (élevée), le tableau de bord rendait la communauté privée quittée, la recherche et `PUT /communities/:id` comptaient les partis.
- Laissé tel quel : `CerclesAchievements.communautesRejointes` compte aussi les départs (« rejointes un jour », probablement voulu).
- Prochain lot recommandé : #6375 (membres lus et gérés sur le web).

## 2026-11-07 — lot 3

- Début du run : #16611 (suite de #16603) attendait sa CI ; elle a été fusionnée dans dev.
- Lot : #6375. Web : `/communities/:id/members` (miroir `CommunityMembersScreen`), rangée par rôle, paginée, gestes d'un administrateur optimistes avec retour arrière (nommer / repasser, retirer confirmé) ; « Membres » sous les compteurs du détail. Le droit de gérer se lit dans `currentUserRole` SERVI par le détail, jamais dans la page chargée (iOS le déduit de la page : un admin en 31e position perd son menu).
- Passerelle : `PATCH …/role` et `DELETE …/members/:id` refusent une communauté désactivée (404), le créateur (403 `COMMUNITY_CREATOR_PROTECTED`) et un ancien membre (404).
- Restes : iOS déduit l'admin de la page chargée et ses libellés français des membres sont en anglais (« No Members ») ; miroir Android ; aucun événement temps réel `community:*` ne rafraîchit la liste.
- Revue adversariale : non bloquante ; corrigés dans le lot (créateur rétrogradé réparable, 404 au retrait relu, deux témoins de plus). Ouvert : #16639 (créer une conversation réactive un membre retiré, PRÉEXISTANT, sécurité) — prioritaire.
- Prochain lot recommandé : #16639, puis #6376 (inviter depuis le web).

## 2026-11-07 — lot 4

- Début du run : #16636 (#6375) avait sa CI de preuve verte et a été fusionnée par le porteur pendant l'attente.
- Lot : #6376, première moitié. Passerelle : `isAddableUser` (`routes/communities/addable-user.ts`), site unique de `POST …/invite` et `POST …/members` — compte vivant (`isActive`, ni `deactivatedAt` ni `deletedAt`) et aucun blocage ; même 404 qu'un inconnu. Web : « Inviter » sous « Membres » pour qui la passerelle l'accepte (`canInviteOf`), feuille chargée à la demande (amis d'abord, recherche), invitation optimiste par personne avec retour arrière ; 17 clés `community.invite.*` × 7 langues.
- Revue adversariale avant la PR : trois corrections dans le lot (compte supprimé par son titulaire, route jumelle `/members`, doublons dans une liste paginée pas lue jusqu'au bout).
- Décision ouverte pour le porteur : #16669 (une invitation ajoute sans accord et réactive la ligne d'un retiré ; pas de limite de débit).
- Reste de #6376 : « la création propose l'ajout de membres », par le même port (`performInviteMembers`) — prochain lot. #6376 reste ouverte.
- Gotcha : la passerelle teste beaucoup de routes avec un double `user.findFirst` inconditionnel ; toute garde qui ajoute une seconde lecture `user` (ici `isBlockedBetween`, `where.OR`) doit adapter ces doubles.

## 2026-11-07 — réveil 5

- Run consacré à mener #16670 à la fusion (règle de la routine : une PR ouverte se termine avant d'en ouvrir une autre). `origin/dev` intégré sans conflit (6 commits, chemins disjoints : sockets, zmq, scripts iOS) ; gardes `check-any-debt` (492/492) et catalogue TS (270/270) relancées sur la fusion.
- Preuve : `workflow_dispatch` de `ci.yml` sur la dernière tête ; `ios.yml` non requis (aucun chemin iOS touché).
- Prochain lot recommandé : #16639 (sécurité, préexistant : créer une conversation réactive un membre retiré), puis la seconde moitié de #6376 (la création propose l'ajout de membres, via `performInviteMembers`).

## 2026-11-07 — réveil 6

- Lot : #16639 (sécurité, préexistant). `POST /conversations` avec `communityId` : la réconciliation devient une INVITATION décidée AVANT la création (`planCommunityAdmission`, `services/conversations/communityMembershipSync.ts`) — communauté privée ⇒ créateur, admin ou modérateur (403 `COMMUNITY_INVITE_FORBIDDEN`) ; compte vivant sans blocage (404, en deux lectures pour tout le lot) ; ligne d'un retiré réactivée en `member` (garde `isActive: false`) ; communauté désactivée ⇒ 404. Le créateur sans ligne active revient `admin` (différence assumée avec `…/invite`).
- Passerelle seule : aucun client (iOS, web, Android) n'envoie `communityId` sur `POST /conversations` — mesuré par la revue.
- Revue adversariale avant la PR : non bloquante ; corrigés dans le lot (ligne active prioritaire si une paire est en double, vérification groupée au lieu d'une rafale, témoin de route du 404). Ouvertes, préexistantes : #16695 (inviter dans un salon d'une communauté privée ou y entrer par lien ignore la communauté), #16696 (aucun index unique sur la paire de `CommunityMember`). Le « retrait n'est pas un bannissement » rejoint la décision #16669.
- Prochain lot recommandé : #16695 (sécurité, même loi), puis la seconde moitié de #6376 (la création propose l'ajout de membres).
