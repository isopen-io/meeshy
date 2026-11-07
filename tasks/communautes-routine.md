# Journal de la routine « Communautés — un lot toutes les 2 h »

Journal, pas pilotage : l'état de chaque tâche vit dans son issue GitHub, qui fait foi.

| date | lot | PR | issues | état |
|---|---|---|---|---|
| 2026-11-07 | Rejoindre / quitter depuis le détail (web), le détail dit au lecteur son rôle (passerelle, iOS) | #16601 | #6378 | fusionnée dans dev |
| 2026-11-07 | Un ancien membre ne voit plus une communauté privée nulle part ; compteur actif partout (passerelle) | #16610 + #16611 | #16603 | fusionnées dans dev |
| 2026-11-07 | Les membres d'une communauté se lisent et se gèrent sur le web ; la passerelle protège le créateur | #16636 | #6375 | fusionnée dans dev |
| 2026-11-07 | On invite quelqu'un dans sa communauté depuis le web ; un compte non vivant ou bloqué n'est plus ajouté (passerelle) | #16670 | #6376 (refs, reste : la création) | fusionnée dans dev (réveil 5) |
| 2026-11-07 | Créer une conversation dans une communauté n'y fait plus entrer que ce que l'appelant peut admettre (passerelle) | #16697 | #16639 | fusionnée dans dev |
| 2026-11-07 | Un salon d'une communauté privée n'accueille que ce que la communauté admet — inviter, ajouter, lien (passerelle) | #16705 | #16695 | fusionnée dans dev |
| 2026-11-07 | Retiré ou parti d'une communauté privée, on ne lit plus ses salons (passerelle) | #16710 | #16704 | voir réveil 8 |

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
- CI de preuve rouge au premier passage : `conversation-core.test.ts` (non lancé en local, chemin `unit/routes/` racine) n'avait pas `user.findFirst` dans son double, et la vérification « compte vivant » comparait des TAILLES (un double qui rend plus de lignes la trompait) — elle compare désormais des IDENTIFIANTS. Gotcha : lancer `src/__tests__/unit/routes` en entier, pas seulement `…/routes/conversations`.
- Prochain lot recommandé : #16695 (sécurité, même loi), puis la seconde moitié de #6376 (la création propose l'ajout de membres).

## 2026-11-07 — réveil 7

- Lot : #16695 (sécurité, préexistant). Les trois portes qui ajoutent à un salon déjà rattaché — `POST /conversations/:id/invite`, `POST /conversations/:id/participants` (verdict par personne `community-forbidden`, additif ; forme `userId` : 403 `COMMUNITY_INVITE_FORBIDDEN`) et la jonction par lien (cœur `performLinkJoin`, donc aussi `/conversations/join/:linkId` et `/anonymous/join/:linkId` ; 403 `COMMUNITY_MEMBERS_ONLY`) — consultent `planSalonEntry` (`services/conversations/communityMembershipSync.ts`), qui est `planCommunityAdmission` avec `admitActor: false`. Un lien ne donne que ce que son AUTEUR pourrait donner aujourd'hui (rang relu à chaque jonction) ; un invité sans compte n'entre que par le lien d'un créateur / admin / modérateur. Communauté publique vivante et salon hors communauté : inchangés.
- Revue adversariale avant la PR : non bloquante ; corrigé dans le lot : une communauté DÉSACTIVÉE se garde comme une privée (elle était « tout permis »). Ouvertes, préexistantes : #16703 (débannir, rattacher une conversation, restaurer un « supprimé pour moi » contournent la loi), #16704 (un retiré d'une communauté privée reste actif dans ses salons).
- Reste côté clients : le web range `COMMUNITY_MEMBERS_ONLY` dans le refus générique « indisponible » (`apps/web/src/lib/api/link-join.ts`, `REFUSAL_BY_CODE`) — à expliquer dans la langue du lecteur avec #7816.
- Prochain lot recommandé : #16704 puis #16703 (sécurité, même loi), puis la seconde moitié de #6376.

## 2026-11-07 — réveil 8

- Lot : #16704 (sécurité, préexistant). `exitCommunitySalons` (`services/conversations/communitySalonExit.ts`), branché sur `POST /communities/:id/leave` et `DELETE /communities/:id/members/:memberId` quand la communauté est privée ou désactivée (`communityGuardsItsSalons`). Deux temps : couper l'accès pendant la requête (un `updateMany` pour les lignes ordinaires, salons CLOS compris ; succession du créateur par salon vivant ; cache invalidé), puis annoncer en arrière-plan (avis `member-left`, `participant-left` avec effectif, `endConversationMembership`). Jamais de clôture. Ne rejette jamais.
- Décision prise sur la lecture la plus probable : le départ VOLONTAIRE suit la même règle que le retrait (rester enfreindrait la loi d'entrée #16695). L'avis dit « X a quitté » même pour un retrait (plus discret que « Y a retiré X ») — à confirmer par le porteur.
- Clients inchangés : web (`viewerMembershipEndedOf`) et iOS (`participantSelfLeft`) traitent déjà un `participant-left` qui les vise.
- Revue adversariale avant la PR : non bloquante ; corrigés dans le lot (salons clos, écriture groupée + annonces en arrière-plan). Ouvertes : #16711 (rattrapage d'une sortie perdue, entrée concurrente), #16712 (salon sans créateur).
- Prochain lot recommandé : #16703 (débannir, rattacher, restaurer contournent la loi), puis la seconde moitié de #6376.


## 2026-11-07 — réveil 9

- Lot : #16703 (sécurité, préexistant). Les trois chemins qui REMETTENT quelqu'un dans un salon d'une communauté privée (ou désactivée) suivent la loi de #16695 :
  - débannir (`leverBannissementDeParticipant`) : l'appartenance n'est rendue que si `planSalonEntry` admet la cible, l'appelant étant le modérateur ; sinon le bannissement est levé seul (`liftBanOnly`). Admise par un admin/modérateur de la communauté, la cible y redevient membre ;
  - rattacher une conversation (`POST /communities/:id/conversations/:conversationId`) : ses participants actifs entrent dans la communauté (`planCommunityAdmission`), l'admission écrite AVANT le rattachement ; un compte qui ne peut pas entrer ⇒ 403 `COMMUNITY_PARTICIPANT_NOT_ADDABLE`, rien d'écrit ;
  - restaurer un « supprimé pour moi » : `mayReturnToSalon` ; un ancien membre ⇒ 403 `COMMUNITY_MEMBERS_ONLY`.
- `planCommunityAdmission` ne lit plus la base quand personne n'entre.
- Passerelle seule. Un ancien client affiche une erreur générique sur les deux nouveaux 403 ; la réponse de `…/unban` ne dit pas encore `membershipRestored` (l'événement socket le dit).
- Revue adversariale avant la PR : non bloquante ; corrigés dans le lot (ordre admission → rattachement, témoin d'ordre, témoins sur `communityId` et sur une communauté publique désactivée). Ouvertes, préexistantes : #16723 (passer une communauté en privée laisse les non-membres dans ses salons — prioritaire), #16724 (`ensureParticipantFromMember` crée un participant sans la loi). Fenêtres TOCTOU communes à toutes les portes : rejoignent #16711.
- Prochain lot recommandé : #16723, puis la seconde moitié de #6376 (la création propose l'ajout de membres).

## 2026-11-07 — réveil 10

- Lot : #16723 (sécurité, préexistant). Les deux portes qui rendent une communauté publique privée (`PUT /communities/:id` du créateur, `PATCH /admin/communities/:id`) appliquent `services/conversations/communitySalonAdoption.ts` :
  - AVANT d'écrire `isPrivate` : chaque occupant inscrit, actif et non banni d'un salon (clos compris) qui n'a JAMAIS été membre entre en `member`, sous l'autorité du créateur (compte vivant, aucun blocage avec lui) ; une panne laisse la communauté publique (500, rejouable) ;
  - APRÈS : une seconde passe rattrape les retardataires, puis sortent des salons (loi de #16704) ceux qui ne peuvent pas entrer et les ANCIENS membres (partis, ou retirés quand la communauté était publique) — la bascule ne défait ni un départ ni un retrait.
- Décision prise sur la lecture recommandée (carte posée au porteur) : les occupants deviennent membres plutôt que de sortir. Invités sans compte et bots : non touchés (→ #16739).
- Revue adversariale avant la PR : un BLOQUANT corrigé dans le lot (la première version réactivait la ligne d'un membre retiré par l'équipe) ; corrigés aussi : participant banni, seconde passe contre la course admission → bascule. Ouvertes : #16739 (désactivation d'une communauté publique, invités), #16740 (sortie groupée, performance), #16741 (le nouveau membre n'est pas prévenu).
- Passerelle seule ; aucun contrat d'API ne change.
- Prochain lot recommandé : la seconde moitié de #6376 (la création propose l'ajout de membres), puis #16739.
