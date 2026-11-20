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
| 2026-11-08 | Les publications d'une communauté se lisent dans son détail (web) et ne se lisent ou publient que par qui en a le droit (passerelle) | #16895 | #6379 | fusionnée dans dev (réveil 17) |
| 2026-11-08 | Les publications d'une communauté se lisent dans son détail (web), et la passerelle ne les sert qu'à qui peut les lire | voir réveil 15 | #6379 | voir réveil 15 |
| 2026-11-08 | L'onglet Publications du détail lit les publications (iOS) | #17061 | #16878 | fusionnée dans dev (réveil 20) |
| 2026-11-08 | Une communauté refusée dit pourquoi dans la langue du lecteur, sans proposer de réessayer (iOS, web) | #17105 | #7816 | fusionnée dans dev (réveil 21) |
| 2026-11-08 | L'emoji choisi en créant une communauté se retrouve dans son détail (iOS) | #17152 | #6380 | voir réveil 21 |
| 2026-11-09 | Une publication réservée à une communauté ne se lit que par ses membres, sur toutes les portes de lecture (passerelle) | #17183 | #16892 | fusionnée dans dev (réveil 25) |
| 2026-11-09 | Les notifications et le temps réel d'une publication réservée à une communauté ne partent qu'à ses membres (passerelle) | voir réveil 25 | #17178 | voir réveil 25 |
| 2026-11-13 | Les traductions en direct d'une story ne partent plus vers un compte bloqué (passerelle) | voir réveil 26 | #17209 | voir réveil 26 |
| 2026-11-13 | Le détail d'une communauté dit combien de membres sont en ligne, sans dire qui (passerelle, web, iOS) | voir réveil du 2026-11-13 | #18014 | voir réveil du 2026-11-13 |
| 2026-11-14 | Une image de profil ou de communauté ne désigne qu'un hôte Meeshy (passerelle) | voir réveil 38 | #16809 | voir réveil 38 |
| 2026-11-14 | Le détail Android d'une communauté dit « N en ligne », comme iOS et le web | voir réveil 40 | #18026 | voir réveil 40 |
| 2026-11-14 | Sur Android, la notification « ajouté à la communauté » ouvre la communauté | voir réveil 43 | #18061 | voir réveil 43 |
| 2026-11-15 | Sur Android, toucher la bannière in-app « ajouté à la communauté » ouvre la communauté | voir réveil du 2026-11-15 17:38 | #18670 | voir réveil du 2026-11-15 17:38 |
| 2026-11-15 | Rejoindre, quitter ou changer de rôle dans une communauté se voit aussitôt chez ses membres (passerelle, web) | voir réveil du 2026-11-15 23:38 | #18766 | voir réveil du 2026-11-15 23:38 |
| 2026-11-18 | Supprimer ou désactiver une communauté se voit aussitôt chez ses membres (passerelle, web) | voir réveil du 2026-11-18 05:38 | #19590 | voir réveil du 2026-11-18 05:38 |

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

## 2026-11-08 — réveil 11

- Lot : seconde moitié de #6376 (web). « Créer une communauté » propose « Ajouter des membres » comme iOS (`CommunityCreateScreen.memberSearchSection`) : rien avant la première lettre, les amis du cache persisté dès elle, la recherche de la passerelle à deux lettres ; on coche, une pastille retire (« Retirer X »). Les personnes choisies sont invitées APRÈS la création par le port de la feuille « Inviter » (`performCreateCommunityWithMembers` → `performInviteMembers`, donc la garde `isAddableUser`) ; une création refusée n'invite personne. Le détail ouvert dit une fois ce que l'invitation a donné (`handInviteStatus` / `takeInviteStatus`).
- Une seule source des personnes proposées : `usePeopleCandidates` (`lib/communities/use-people-candidates.ts`), extrait de la feuille « Inviter », et une seule phrase d'issue : `inviteStatusOf` (`lib/communities/invite-status.ts`).
- Données de démonstration : le créateur d'une communauté peut y inviter (`fixtureInviteMember`), comme la passerelle (il y est admin).
- Gate navigateur `check-communities.mjs` étendu (clair/sombre, 390 et 320) : cocher, pastille nommée, cibles ≥ 44, le détail dit « 1 personne a rejoint la communauté. ». Catalogue `community-membership` remesuré : 5,87 Ko pour un plafond de 6 (inchangé) — le prochain ajout de clés devra ouvrir un second catalogue paresseux.
- Gotcha : sous happy-dom, un champ texte se lit par `onInput` (convention du dépôt, `list-toolbar.tsx`) ; `onChange` n'y est jamais rappelé.
- iOS et Android : rien à changer (iOS sert déjà l'écran ; Android : suivi #16153 et suivants).
- Prochain lot recommandé : #16739 (désactivation d'une communauté publique, invités), puis #6377 (réglages du créateur, web).

## 2026-11-08 — réveil 13

- Lot : #6377, première moitié. Web : `/communities/:id/settings` (miroir `CommunitySettingsScreen`) — nom, description, confidentialité, « Enregistrer » inerte tant que rien ne change, optimiste avec retour arrière (`lib/api/community-settings.ts`) ; suppression confirmée qui ramène à la liste. « Réglages » sur le détail au créateur seul (`canEditSettingsOf`, identité de session). Catalogue paresseux `community.settings.*` × 7 langues (3,91 Ko, plafond 5) ; une seule clé de plus dans celui de l'adhésion (« Réglages »).
- Passerelle : `PUT /communities/:id` rend 400 `INVALID_COMMUNITY` (au lieu de 500), 403 `COMMUNITY_CREATOR_ONLY`, 409 `COMMUNITY_IDENTIFIER_TAKEN` ; `DELETE` rend 404 sans rien effacer sur une communauté désactivée par l'administration.
- Revue adversariale avant la PR : non bloquante ; corrigés dans le lot — un nom servi échappé (« &amp; ») se lit à sa lettre (`decodeCommunity`), sinon chaque enregistrement l'abîmait ; un refus ne rend plus que la fiche et la ligne de cette communauté. Suivis : #16786 (stockage échappé, iOS/Android), #16787 (prévenir avant de passer en privée ; 404 en cours d'édition), #16788 (avatar/bannière : https seulement), #16784 (la confirmation iOS promet d'effacer les messages, la passerelle les garde).
- Gate navigateur : `check-communities.mjs` tourne désormais avec un lecteur CONNECTÉ (`u-viewer`, créateur d'« Équipe déploiement ») ; à 320 × 568, deux contrôles seulement sont visibles au repos.
- Reste de #6377 : avatar et bannière (motif du profil, recompressés) — #6377 reste ouverte.
- Prochain lot recommandé : seconde moitié de #6377 (avec #16788), puis #16739.

## 2026-11-08 — réveil 14

- Lot : seconde moitié de #6377 (web) + #16788 (passerelle). Le créateur change l'avatar et la bannière depuis `/communities/:id/settings`, miroir `CommunitySettingsScreen.visualSection` : bannière 120 px (« Modifier »), avatar qui la chevauche (crayon), deux boutons nommés de 44 px. L'image choisie s'affiche aussitôt sous un voile annoncé, passe par le chemin du profil (`uploadProfileImage` : recompression 512 / 1500 px, `POST attachments.upload`) puis entre dans le brouillon comme un PATCH posé sur la fiche courante ; elle part avec « Enregistrer », optimiste avec retour arrière (`performCommunityImageUpload`, `community-settings.ts`). Un envoi est abandonné au démontage ; l'aperçu local est libéré quoi qu'il arrive.
- Passerelle (#16788) : `format: 'uri'` (schéma JSON de `PUT /communities/:id`) refusait le chemin RELATIF que rend un téléversement — **iOS et Android ne pouvaient donc jamais enregistrer une image de communauté** (mesuré par la revue : `UserService.uploadImage` rend le `fileUrl` brut) — et laissait passer `javascript:` / `data:`. Avatar et bannière (PUT et POST) suivent désormais `isProfileImageReference`, la loi du profil ; `POST /communities` rend 400 `INVALID_COMMUNITY` au lieu de 500. Décision : `http://` reste admis comme pour le profil (une liste d'hôtes Meeshy est le vrai correctif, #16809), au lieu du « https seulement » de l'issue.
- Revue adversariale avant la PR : non bloquante ; corrigés dans le lot — un envoi qui finissait après un renommage venu d'ailleurs ressuscitait l'ancien nom (le brouillon était reconstruit d'une fiche périmée), et l'envoi n'était pas abandonné au démontage. Suivis ouverts : #16809 (hôtes tiers), #16810 (`/api/..`), #16811 (fichier d'un autre utilisateur).
- Catalogue `community.settings.*` remesuré : 4,81 Ko pour un plafond de 5 — le prochain ajout ouvre un second catalogue paresseux.
- Gotcha : `src/test-support/act-leak-guard.test.ts` rougit en conteneur (il relance `bun test` sur des fixtures) indépendamment du lot.
- iOS/Android : aucun code client à changer, ils profitent du correctif de passerelle. #6377 se ferme (la couleur et l'emoji iOS ne quittent pas l'appareil : aucun champ serveur).
- Prochain lot recommandé : #16739 (désactivation d'une communauté publique, invités), puis #6379 (publications dans le détail, web).

## 2026-11-08 — réveil 15

- Lot : #6379 (web + passerelle). Le détail d'une communauté porte deux onglets, Conversations et Publications, miroir du `Picker(.segmented)` d'iOS (`routes/community-tabs.tsx` : liste d'onglets, flèches et Début/Fin, 44 px). Publications (`routes/community-posts.tsx`, chargé à la demande) lit le port `lib/api/community-posts.ts` (`scope=community`, curseur opaque), cache d'abord, caisse inscrite au registre des cartes (`card-caches.ts`) ; la même `FeedPostCard` et les mêmes gestes que le Flux ; chargement, vide, échec, hors ligne dessinés. Les dix clés `community.posts.*` × 7 langues sont repliées dans le catalogue paresseux de l'adhésion (6,62 Ko, plafond 6 → 7), chargé avec le détail.
- Passerelle : `GET social.posts?scope=community` (et l'alias `/posts/community/:id`) servait les publications PUBLIC d'une communauté PRIVÉE à tout le monde, celles d'une communauté désactivée et celles d'un auteur bloqué. Lecture extraite dans `services/posts/communityFeed.ts` (`PostFeedService.ts` était hors budget) : communauté vivante, privée réservée aux membres actifs et au créateur, blocage dans les deux sens. Page vide, jamais d'erreur : aucun client installé ne change de contrat.
- Budget `community_detail` remesuré 3 → 6 Ko : 2,67 Ko sur dev, 5,07 Ko après — surtout la carte de préchargement que Vite écrit pour l'onglet paresseux (graphe de `FeedPostCard`). Alternatives écartées dans `budgets.json`. Nouveau plafond `community_posts` (2,03 Ko, plafond 3).
- Gotcha : un `lazy(import())` d'un écran qui monte `FeedPostCard` coûte ~2 Ko gzip de liste de préchargement au chunk qui l'appelle.
- Revue adversariale avant la PR : non bloquante ; corrigés dans le lot — `POST /posts` acceptait un `communityId` de n'importe qui (une publication posée dans le fil d'une communauté privée par un non-membre) : 403 `COMMUNITY_POST_FORBIDDEN`, même refus partout ; rejoindre relit / quitter retire la caisse des publications ; hors ligne sur un cache vide, l'onglet le dit (la requête était en pause, le squelette tournait) ; identifiant malformé ⇒ page vide au lieu d'un 500. Suivis : #16892 (`COMMUNITY` se lit « une communauté quelconque » sur les autres portes, élevée), #16893 (décision : une publication PUBLIC d'une communauté privée sort-elle ?), #16894 (blocage et republication / aperçu des commentaires).
- Première peinture : la CI a mesuré 96,17 Ko pour un plafond de 96 (dev : 95,94). Deux coûts, lus en comparant la carte de préchargements de l'index à celle de dev : un nom de chunk de plus (le catalogue `community.posts.*` à lui, puis un module de clé à lui) et `card-caches.ts` qui importait `communities.ts`, ce qui ajoutait `communities` et `html-text` aux préchargements de trente-six écrans. Correctif : clés repliées dans le catalogue de l'adhésion, racine `['community-posts']` recopiée dans le registre des cartes, liée à `communityPostsQueryKey` par un témoin. Local : 95,94 Ko, comme dev. **Leçon : sous ce plafond, tout nouvel import partagé se mesure en diffant les préchargements de l'index, pas seulement le poids de son chunk.**
- Suite : même ramené à zéro (le panneau d'onglet est posé par `community.tsx`, l'onglet paresseux n'importe plus `community-tabs.tsx`, et l'index est identique octet pour octet à celui de dev), la PR reste rouge parce que **dev lui-même dépasse** : 96,07 Ko en CI depuis `@tanstack/react-query` 5.106.1 (+0,10 Ko dans `core`). Les mesures locales qui disaient 95,94 venaient d'un `node_modules` antérieur à la vague dependabot : **refaire `bun install --ignore-scripts` après tout `fetch` qui touche `bun.lock` avant de mesurer**, puis restaurer `bun.lock` (bun 1.4.4 le réécrit au format 3). Décision demandée au porteur, issue #16931 (épingler react-query, ou remesurer le plafond).
- iOS : l'onglet « Feed » est un état vide FIXE (aucune lecture) → #16878. Android → #16879.
- Prochain lot recommandé : #16739 (désactivation d'une communauté publique, invités — décision à prendre), sinon #6381 (vérification connectée sur staging) ou #16878.

## 2026-11-08 — réveil 17

- Run consacré à mener #16895 (#6379) à la fusion. Le blocage de la première peinture est levé sur `dev` (`2ef0031a6` : plafond 96 → 97 Ko, #16931). `origin/dev` intégré sans conflit (56 fichiers, chemins disjoints).
- Gates locaux sur la fusion : passerelle `src/__tests__/unit/routes` + `PostFeedService` 857/857 suites, `tsc --noEmit` vert ; web `bun test` 30 063 verts, 1 rouge (`act-leak-guard.test.ts`, connu en conteneur), typecheck vert, `measure-weight` vert (96,10 Ko / 97 ; `community_detail` 5,03, `community_posts` 2,01).
- Le porteur a fusionné #16895 dans dev à 13:56 UTC (tête `2f3a4eac6`, avant l'intégration de dev). La CI de preuve lancée ensuite sur la branche (run 42487522146) est rouge pour une raison étrangère au lot : le cliquet `check-any-debt` lisait 490 usages pour une base de 492 (amélioration de dev non enregistrée), corrigé depuis sur dev (490/490, relancé localement). #6379 fermée.
- Prochain lot recommandé : #16739 (désactivation d'une communauté publique, invités), sinon #16878 (l'onglet Feed iOS lit enfin les publications) ou #6381.

## 2026-11-08 — réveil 18

- Lot : #10622 (web, maintenabilité). Les trois copies privées de l'interrupteur d'iOS (`routes/settings-sections.tsx`, `routes/communities-parts.tsx`, `routes/share-link-form.tsx`) consomment `components/ios-switch.tsx` ; le témoin `ios-switch-single-source.test.ts` refuse toute source qui redessine la pastille glissante hors du composant. Cliquet `check-animated-properties.mjs` abaissé de trois sites (10 → 7 fichiers tolérés).
- Gates locaux : `type-check` vert ; `bun test` 30 095 verts, 2 rouges avant correction du cliquet (le cliquet lui-même, corrigé dans le lot ; `act-leak-guard.test.ts`, connu en conteneur) ; `measure-weight` vert ; navigateurs `check-communities`, `check-settings`, `check-links` verts. `check-design-harmony` rouge sur dev hors lot (27 violations dans 9 fichiers qu'il ne touche pas).
- iOS/Android : rien à changer (le web rejoint le `Toggle` d'iOS).
- Prochain lot recommandé : #16878 (l'onglet Feed iOS lit les publications), puis #16739 (décision à prendre) ; #6381 attend une session de staging.

## 2026-11-08 — réveil 19

- Lot : #16878 (iOS). L'onglet « Publications » du détail d'une communauté lit enfin ses publications (il était un état vide FIXE). `CommunityPostsViewModel` (`apps/ios/Meeshy/Features/Community/`) lit `PostService.getCommunityPosts` (`GET /posts/community/:id`, gardé par la passerelle depuis #6379) : cache d'abord sous `community:<id>` (frais ⇒ aucun réseau ; périmé ⇒ peint puis remplacé ; expiré ⇒ le disque se peint hors ligne), page suivante par curseur dédoublonnée, gestes de la carte optimistes avec retour arrière (aimer, repartager, enregistrer, partager). `CommunityPostsTab` monte la même `FeedPostCard` que le fil, ouvre un post sur son détail et un réel dans le lecteur (origine `.community`), compte les impressions (`source: "feed"`, surface `.community` — `community` n'est pas une source admise par la passerelle). États dessinés : chargement (cache vide seulement), vide, échec avec « Réessayer », hors ligne.
- SDK : `CommunityDetailScreen` reçoit l'onglet par un emplacement `postsTab` (la carte du fil vit dans l'app) ; l'état vide fixe et le paramètre `onCreatePost` du SDK disparaissent (l'hôte le passe à l'onglet). Onglets « Conversations » / « Publications » en sept langues, au lieu de « Channels » / « Feed ».
- Quitter une communauté efface ses publications en cache (une communauté privée ne se relit plus hors ligne) ; la rejoindre les fait relire sous le rôle de membre.
- Témoins : `CommunityPostsViewModelTests` (12) et trois de plus dans `CommunityDetailViewModelTests`. iOS ne compile pas en conteneur : preuve par `ios.yml` sur la PR.
- Reste : l'onglet ouvert pendant une adhésion garde sa page de visiteur jusqu'au prochain affichage ; Android → #16879.
- État en fin de run : PR #17061 ouverte, NON fusionnée. Gardes iOS texte vertes en local sur la tête (`check_test_registration`, `check_pbxproj_*`, `check_house_rules`, `check_cohesion_budget`, catalogue Swift, ViewBuilder). Les trois fichiers sont inscrits au pbxproj À LA MAIN : la régénération `[xcodegen]` (macOS) a été annulée deux fois, et le `ios.yml` de preuve aussi — « canceled by @jcnm » en moins d'une minute, comme toutes les runs iOS des branches `claude/*` de ce créneau (file Mac saturée). Le prochain réveil relance `ios.yml` sur la tête et fusionne au vert.
- Gotcha : un fichier Swift ajouté sous `apps/ios` doit entrer au pbxproj COMMITÉ (garde `check_test_registration`) ; sans Mac, l'inscrire à la main en clonant les quatre lignes d'un voisin (PBXBuildFile, PBXFileReference, groupe, phase Sources). Règles maison : un ViewModel ne nomme aucun `.shared` (la vue les injecte), une vue lit `routerCommands` plutôt que `@EnvironmentObject Router`, pas de `Task.detached`.

## 2026-11-08 — réveil 20

- Début du run : #17061 (#16878) fusionnée par le porteur à 19:04 UTC ; un correctif de suite est passé sur dev (`8e4f6651d`, lecture du cache par `await` sur l'acteur `CacheCoordinator`) et Android a suivi le renommage `tab_feed`.
- Lot : #7816 (iOS + web). iOS : le détail ne rend plus le message brut du serveur ; `CommunityLoadFailure` (SDK, `MeeshyUI/Community/`) dit refusée / réseau / serveur, classée par `ContentFetchFailure.classify` dans le ViewModel ; 403 et 404 se disent pareils (comme le web, D-6) et n'offrent que « Retour aux communautés ». Sept clés au catalogue SDK. Web : `COMMUNITY_MEMBERS_ONLY` à la jonction par lien se lit « réservée aux membres de sa communauté » et retire « Rejoindre » (il tombait dans « indisponible », refus passager).
- Pas de revue adversariale : ni authentification, ni permission, ni migration (copie et classement d'erreurs côté clients).
- Suivi ouvert : #17104 (Android : même cause dite, sans réessayer).
- Gotcha : `Localizable.xcstrings` du SDK se réécrit à l'identique par `json.dumps(indent=2, ensure_ascii=False)` + saut de ligne final, mais SANS `sort_keys` (l'ordre Xcode n'est pas l'ordre Python) : insérer les clés nouvelles à leur place.
- Prochain lot recommandé : #6380 (emoji de création iOS sans effet) ou #6451 (libellés iOS sans accents), puis #16739 (décision) ; #14227 et #16696 (index de `CommunityMember`) demandent une session de staging.

## 2026-11-08 — réveil 21

- Début du run : #17105 (#7816) fusionnée par le porteur à 20:39 UTC ; #7816 fermée.
- Lot : #6380 (iOS). L'emoji choisi à la création n'allait nulle part, et celui des réglages n'était rendu nulle part (le détail le RELISAIT sans l'afficher). `CommunityLocalAppearance` (SDK, `Models/`) devient le seul site des clés `community.emoji.<id>` / `community.color.<id>` (mêmes clés : les installations existantes gardent leur choix) ; une valeur vide efface au lieu d'écrire `""` (une couleur vide rendait un hex vide au détail). La création l'écrit après le succès (jamais sur un échec), les réglages et le détail le lisent ; `CommunityEmojiMark` pose l'emoji en coin de bannière, le même dans l'aperçu de création et dans le détail.
- Android faisait déjà de même (`appearanceStore.setEmoji` après la création) ; le web n'a rien à porter (aucun champ serveur, D-60, commentaire de `community-new.tsx` mis à jour).
- Pas de revue adversariale : ni authentification, ni permission, ni migration (préférence d'affichage locale).
- Témoins : `CommunityLocalAppearanceTests` (SDK, 5) et trois de plus dans `CommunityCreateViewModelTests`. iOS ne compile pas en conteneur : preuve par `ios.yml`.
- Prochain lot recommandé : #6451 (libellés iOS sans accents), puis #16739 (décision) ; #14227 et #16696 demandent une session de staging.
- État en fin de run : PR #17152 ouverte, NON fusionnée. `ios.yml` sur la tête `5da395a14` : gardes texte et compilation vertes, les quatre tranches de tests rouges sur 14 échecs TOUS hors du diff (composer surtout, plus `MessageSearchResultRow`) — dev ne lance pas les tests à la fusion, ce rouge s'y est accumulé sans être vu : #17172. Le prochain réveil relance `ios.yml` quand #17172 est soldée, puis fusionne au vert.

## 2026-11-09 — réveil 22

- Début du run : #17152 (#6380, réveil 21) ouverte, menée EN DIRECT par sa session (commentaire posté une minute avant ce réveil, `ios.yml` en cours) : cédée, non touchée. Ses rouges iOS viennent des lots du composer fusionnés ce soir, pas d'elle.
- Lot : #16892 (passerelle, sécurité). Une publication `COMMUNITY` dont `Post.communityId` est posé ne se lit que par les membres actifs et le créateur de CETTE communauté, vivante — plus par « un co-membre de n'importe quelle communauté de l'auteur ». Filtre de liste (`buildPostVisibilityOrFilter`) : la branche co-membre ne vaut plus que pour `communityId` nul ou absent ; une branche `communityId ∈ getReadableCommunityIds(lecteur)` (sans cache : quitter ferme aussitôt), résolue dans `buildFeedVisibilityFilter` (fil, profil, réels, stories, statuts, recherche) et `buildViewerVisibilityFilter` (détail, vue). Verdict unitaire (`canUserViewPost`) : `isCommunityReadableBy`. Hashtags : même paire de branches. `communityId` entre dans la tranche ACL REQUISE (`PostVisibilityRecord`), le compilateur a trouvé le seul site qui ne le lisait pas (`storyReplyAdmission`).
- Une publication PUBLIC rattachée à une communauté privée reste servie comme avant (décision #16893).
- Revue adversariale avant la PR : un BLOQUANT corrigé dans le lot — une republication (`repostPost`, et `POST /posts` avec `repostOfId`) naissait sans `communityId`, donc lisible par les co-membres de n'importe quelle communauté du REPUBLIEUR, avec le contenu de l'original. `repostCommunityId` (`services/posts/repostCommunity.ts`) fait hériter la communauté de la source et refuse une autre (403 `REPOST_COMMUNITY_MISMATCH`). `PostService.ts` 2118 → 2114 lignes (budget abaissé).
- Suivis ouverts : #17178 (notifications, temps réel et traductions de story suivent encore la règle co-membre — le temps réel diffuse le contenu : priorité élevée), #17182 (les favoris ne filtrent aucune audience, préexistant). Index de `CommunityMember(userId, isActive)` et `Community(createdBy, isActive)` : rejoint #14227 / #16696. Une mention ouvre toujours le post à un non-membre nommé (voie des références, inchangée).
- Gotcha : huit suites moquent `communityVisibility` par une fabrique qui ne connaît que `getCommunityCoMemberIds` ; une nouvelle export lue par `viewerAudience` doit y entrer.


## 2026-11-09 — réveil 25

- Début du run : #17183 (#16892) et #17152 (#6380) fusionnées par le porteur à 05:30–05:35 UTC ; dev n'est plus verrouillé.
- Lot : #17178 (passerelle, sécurité). Les trois portes d'ÉMISSION d'une publication `COMMUNITY` posée dans une communauté suivent la loi de lecture de #16892 (membres actifs + créateur, communauté vivante) :
  - admission des éventails (`filterPostConsumers`, `communityId: string | null` REQUIS dans `PostAudienceParams` et dans les paramètres des éventails ami, mention de commentaire, commentaire de story ; relu par le relais d'activité) → `filterCommunityPostReadersAmong` ;
  - temps réel (`SocialEventsHandler.getVisibilityFilteredRecipients` reçoit la référence du post ; la communauté est relue quand l'appelant ne tient que `postId`) → `communityPostAudienceIdsOf` ;
  - traductions de texte de story → `communityPostAudienceIds`.
  Sans communauté : règle co-membre inchangée. Post introuvable, id malformé, communauté désactivée, panne ⇒ personne d'autre que l'auteur. Borne 5 000 membres par diffusion.
- Revue adversariale avant la PR : non bloquante ; corrigé dans le lot : témoins « post introuvable / malformé / communauté désactivée » (le témoin de panne seul ne pouvait pas tomber) et fail-closed côté story. Suivi ouvert : #17209 (les traductions de story ignorent le blocage, préexistant). Index de `CommunityMember` : rejoint #14227 / #16696.
- Gotcha : un appel de test à `filterPostConsumers` ou à un éventail sans `communityId` est désormais FERMÉ en `COMMUNITY` (undefined ≠ null) : passer `communityId: null` pour l'ancienne règle.
- Prochain lot recommandé : #6451 (libellés iOS sans accents), puis #17209 ; #16739 attend une décision ; #14227 / #16696 demandent une session de staging.

## 2026-11-13 — réveil « N en ligne »

- Début du run : cinq PR de la routine ouvertes (#17960 #6451, #17972 #17968, #17974 #17209, #17983 #17182, #18006 #17104), toutes menées EN DIRECT par d'autres sessions (commentaires et poussées de moins de deux heures) : cédées, non touchées. Le run précédent de ce fil avait été coupé par une erreur d'API le 2026-11-10 ; sa branche était déjà fusionnée.
- Lot : #18014 (issue ouverte). `GET /communities/:id` sert `onlineMemberCount` (additif) : les AUTRES membres actifs en ligne (règle 1/3/5), hors comptes non vivants, bloqués dans un sens ou dans l'autre, ou ayant coupé `showOnlineStatus` ; `null` sous dix autres membres actifs (`ONLINE_COUNT_ANONYMITY_FLOOR`) — dans une petite communauté, un compte désigne quelqu'un. Site unique : `services/community-online-count.ts`. Lecture bornée (membres dans la fenêtre de 5 min, 1 000 au plus), comptage APRÈS la garde d'accès, panne ⇒ `null` sans casser le détail.
- Web : `CommunityStats` écrit « N en ligne » ; iOS : `CommunityDetailScreen.statsSection`. Rien à 0, `null` ou absent. Clé `community.detail.online` × 7 langues des deux côtés.
- Suivi ouvert : #18026 (miroir Android).
- Décision prise sur la lecture la plus probable, à confirmer par le porteur : plancher d'anonymat à 10 ; le compte est servi aussi à un non-membre d'une communauté PUBLIQUE (il peut déjà la lire).
- Gotcha : `act-leak-guard.test.ts` (web) est rouge en conteneur sans ce diff aussi (mesuré par `git stash`).
- Revue adversariale : BLOQUANTE. Corrigés dans le lot : bloquer-relire-débloquer faisait du compte un oracle (le compte ne dépend plus du lecteur), dix comptes désactivés franchissaient le plancher (population = comptes vivants), préférence illisible fail-closed. Reste ouvert, et c'est ce qui retient la PR : une communauté FABRIQUÉE (dix comptes de l'attaquant + la cible ajoutée sans son accord, `POST …/members` ou `…/invite`, #16669) fait du compte exact un oracle de la présence de la cible, mineurs compris. Parade proposée au porteur : ne compter que les membres entrés d'eux-mêmes (champ `CommunityMember.joinedVia`, lignes existantes exclues) + paliers. M1 (aucun index sur `CommunityMember`) rejoint #14227 / #16696.
- État en fin de run : PR #18028 en BROUILLON, non fusionnée, en attente de la décision du porteur sur la parade. Ne pas la fusionner sans elle.
- **Décision du porteur, 2026-11-14 : « ce n'est pas grave ».** Le risque de la communauté fabriquée est ACCEPTÉ, sans parade (ni `joinedVia`, ni paliers) ; le compte exact reste servi, plancher à 10, et aussi au non-membre d'une communauté publique. La PR sort du brouillon.
- Prochain lot recommandé : la parade choisie sur #18028 ; sinon #18026 (Android, après #18028), puis les événements temps réel `community:*` (membre rejoint/parti, rôle, réglages) — dont un `community:online-count-changed` pourrait rafraîchir l'agrégat ; #16739 attend une décision ; #14227 / #16696 demandent une session de staging.
## 2026-11-13 — réveil 26

- Début du run : #17211 (#17178) fusionnée dans dev ; #17960 (#6451, libellés iOS) ouverte à 13:25 UTC par un autre réveil de cette routine et menée en direct (CI en cours) : cédée, non touchée.
- Lot : #17209 (passerelle, sécurité, préexistant). `withoutBlockedRecipients` (`utils/blocking.ts`) devient le seul filtre de blocage des diffusions d'une publication : `SocialEventsHandler.withoutBlocked` le consomme, et `StoryTextObjectTranslationService` y passe ses destinataires sur toutes les branches (ONLY, cercles, amis, EXCEPT, communauté). Une lecture du blocage qui échoue ne laisse partir que l'auteur (avant : rien du tout côté temps réel, inchangé puisque l'auteur n'y est pas candidat).
- Témoin : `storyTranslationBlocking.test.ts` (12 cas : chaque branche × bloqué dans les deux sens, et panne), rouge sans le correctif, vert avec.
- Clients : rien à changer.
- Prochain lot recommandé : mener #17960 si elle reste ouverte, sinon #17182 (favoris, audience) ; #16739 et #16893 attendent une décision ; #14227 / #16696 demandent une session de staging.
- Début du run : aucune PR ouverte ; toutes les branches `claude/communautes-*` sont dans dev. Le journal s'arrêtait au réveil 25 (2026-11-09).
- Lot : #6451 (iOS, cohérence). Les accents des libellés de communauté avaient déjà été réparés par #10606, qui a posé `FrenchLabelAccentGuardTests`. Mais la mesure a trouvé pire : **21 valeurs `fr` de communauté recopiaient l'ANGLAIS** (« Invite Members », « No Users Found », « Members », « Remove », « No Posts Yet »…) pendant que l'arabe, l'allemand et l'espagnol étaient traduits — la garde des accents ne pouvait pas les voir, un texte anglais n'ayant aucun accent manquant. Traduites (vocabulaire du web et d'iOS : « Conversations », « Publications », « Membres », « Retirer »), plus « Touchez pour réduire / développer » (transcription) et deux défauts que la garde laissait passer : « ECHANTILLONS » (forme CAPITALE) et « irreversible » (absent de la liste).
- Garde étendue : formes capitales, « irreversible », et `test_frenchValues_ofCommunityKeys_areNotTheEnglishCopy` (une valeur `fr` de `community.*` égale à l'anglais rougit, sauf mots communs aux deux langues).
- Gates locaux : simulation Python des trois balayages verte ; `xcstrings_to_android.py --check` vert (ces clés n'alimentent pas Android). iOS ne compile pas en conteneur : preuve par `ios.yml` / `sdk-tests.yml`.
- Reste hors communautés (même défaut, autre domaine) : `story.post.*`, `story.slide.addSlide`, repères de timeline (« Keyframe », « Playhead », « VIDEO ») — laissés au composer, issue de suivi.
- Prochain lot recommandé : #17209 (traductions de story et blocage), puis #16739 (décision) ; #14227 / #16696 et #6381 demandent une session de staging.
- Suivi ouvert : #17958 (libellés du composer de story). PR #17960.
- État en fin de run : #17960 ouverte, NON fusionnée. « Gardes iOS (texte) » rouge HORS du lot : dev l'est depuis `b5b8216122` (correctif d'appel entrant du porteur, `PlayingSoundLoop` ajoute un `@unchecked Sendable`, 112 → 113) — #17968, cédée au chantier des appels. Le prochain réveil relance `ios.yml` quand #17968 est soldée, puis fusionne au vert.
- Preuve au SHA `733ae908c` : `sdk-tests.yml` ciblé sur `FrenchLabelAccentGuardTests` VERT (run 43433787041) ; `ios.yml` (run 43433810304) rouge sur deux points HORS du lot, tous deux venus de `b5b8216122` : la garde maison (`unchecked-sendable` 112 → 113) et, en tranche 1, `test_everyMainActorObservableObject_declaresADeinit` (`PlayingSoundLoop` sans `nonisolated deinit`) — #17968. dev intégré dans la branche (sans conflit), garde maison toujours rouge sur dev.

## 2026-11-13 — réveil 27

- Début du run : #17960 (#6451, réveil 26) ouverte et menée EN DIRECT par sa session (commit poussé 4 minutes après ce réveil ; elle attend #17968, la garde maison iOS rouge sur dev depuis `b5b821612`). Une autre session écrit #17209 (`claude/communautes-story-blocage`). Les deux cédées, non touchées.
- Lot : #17182 (passerelle, sécurité). `getBookmarks` servait les publications en favori sans aucun filtre d'audience : une publication `COMMUNITY` d'une communauté quittée, une `FRIENDS` d'un ami retiré, une publication passée en `PRIVATE` ou d'un auteur bloqué restaient lisibles entières depuis les favoris. La requête des favoris pose désormais `post: { is: { deletedAt: NOT_DELETED, AND: [audience] } }`, l'audience étant `viewerPostAudience` (amis ∪ contacts DM, co-membres, puis `buildFeedVisibilityFilter` : blocage, cercles, communautés lisibles). Dans la requête, pas après : la page reste pleine et le curseur reste sur la table des favoris. Le favori lui-même n'est pas supprimé : il réapparaît si l'audience se rouvre (on rejoint de nouveau).
- `viewerPostAudience` quitte `search/globalPostSearch.ts` pour `posts/feedVisibility.ts` (le module de l'audience des listes), ré-exporté par la recherche : une seule composition, deux consommateurs.
- Pas de revue adversariale : resserrement d'une lecture sur une loi existante, ni authentification, ni nouvelle permission, ni migration.
- Témoins : `bookmarks-audience.test.ts` (4 : loi posée, communautés lisibles, blocage, suppression + curseur), rouges avant le correctif.
- iOS / web / Android : aucun code client à changer (une page de favoris plus courte se décode à l'identique).
- Reste : `bookmarkCount` d'une publication compte toujours les favoris des lecteurs qui ne la lisent plus (agrégat sans identité, inchangé).

## 2026-11-13 — réveil 28

- Début du run : cinq PR de la routine ouvertes (#17960, #17972, #17974, #18006, #18028), chacune menée par sa session ou en file CI (Mac saturé) ; aucune reprise, aucune touchée.
- Lot : #16787 (web, iOS, Android). Rendre une communauté publique PRIVÉE se confirme sur les trois plateformes avant d'enregistrer : « Anciens membres et comptes bloqués quitteront ses conversations, sans retour. » (la passerelle les sort depuis #16723). Rouvrir une communauté, ou tout autre changement, part sans détour ; « Annuler » garde le brouillon.
  - Web : `privacyConfirmationNeeded` (`lib/api/community-settings.ts`), `ConfirmDialog` « community-private » ; un `PUT` qui rend 404 (communauté désactivée pendant l'édition) retire la fiche de chaque liste et de chaque détail, et l'écran dessine le refus au lieu d'un formulaire actif.
  - iOS : `needsPrivacyConfirmation` / `showPrivacyConfirm` (protocole `CommunitySettingsModeling`, ViewModel de l'app), alerte destructive dans `CommunitySettingsScreen`.
  - Android : `CommunitySettingsDraft.needsPrivacyConfirmation`, `AlertDialog` dans `CommunitySettingsScreen.kt` ; chaînes générées depuis le catalogue SDK (manifeste `community.json`).
- Le corps tient en 80 caractères : la garde de bavardage natif (`check-verbosity-native.mjs`) plafonne à deux les libellés longs des familles communauté iOS et Android.
- Catalogue `community.settings.*` remesuré : 5,27 Ko, plafond 5 → 6 (un second catalogue paresseux pour trois clés a été écarté, justification dans `budgets.json`).
- Pas de revue adversariale : ni authentification, ni permission, ni migration (confirmation et cache côté clients).
- Rouge étranger connu : `call_overlay` 21,01 Ko pour un plafond de 21 sur dev nu (#17930) ; la garde maison iOS rouge sur dev (#17968).
- Prochain lot recommandé : #16741 (le nouveau membre d'une communauté devenue privée est prévenu), puis #16739 (décision) ; #14227 / #16696 demandent une session de staging.

## 2026-11-13 — réveil 28 (14:34 UTC)

- Début du run : quatre PR de la routine ouvertes depuis moins d'une heure par une autre session (#17960 #6451, #17972 #17968, #17974 #17209, #17983 #17182), CI en file : cédées, non touchées.
- Lot : #17104 (Android). Le détail d'une communauté dit POURQUOI il ne s'ouvre pas, comme iOS et le web (#7816). `CommunityLoadFailure` (`:core:model`) : refusée (403 = 404), réseau, serveur ; `CommunityFetchException` porte sa cause, classée par `ApiError.toContentFetchFailure()` (un hors-ligne n'a pas de statut). Un refus efface la fiche en cache et le dit avec « Retour aux communautés » (la fermeture silencieuse sur 404 disparaît) ; réseau et serveur gardent une fiche déjà peinte. Sept chaînes adoptées du catalogue SDK.
- Pas de revue adversariale : ni authentification, ni permission serveur, ni migration.
- Gotcha : `./apps/android/meeshy.sh jvm-check` échoue en conteneur (`build-artifacts.signal.org` refusé par le proxy) ; seule `android.yml` prouve, même pour `:core:model`.
- PR #18006. CI des PR gelée (`PR_CI_GEL`) : preuve par `workflow_dispatch` d'`android.yml` sur la tête. Premier run rouge sur « Graphe des modules » : le cliquet de bavardage (`scripts/check-verbosity-native.mjs`) compte comme explication toute clé contenant `detail` ; les sept clés `community_detail_*` portaient la famille de 32 à 39. Renommées `community_load_*`, run suivant vert (assemble + tests unitaires).
- Prochain lot recommandé : mener à la fusion les PR ouvertes (#17960 après #17972), puis #16879 (publications de la communauté sur Android) ; #16739 attend une décision ; #14227 / #16696 demandent une session de staging.
- Run consacré à mener #17960 (#6451) à la fusion. Ses deux rouges iOS venaient de `b5b8216122` (sonnerie d'appel) et non du lot : la garde maison (`unchecked-sendable` 112 → 113) et, en tranche 1, `MainActorDeinitSourceGuardTests` (`PlayingSoundLoop` sans `deinit` sous l'isolation MainActor par défaut). Personne ne portait #17968 (la branche `claude/fix-dev-house-rules` est un reliquat du 2026-11-05) : correctif minimal en #18004 — le lecteur sous `Locked<AVAudioPlayer>(uncheckedState:)`, `nonisolated deinit {}` — fusionnée par le porteur à 17:08 UTC, #17968 fermée. `check_house_rules.sh` : « 36 règles tenues » sur dev.
- `origin/dev` intégré dans #17960 (conflit du seul journal : réveils 26 et 27 gardés tous deux, dans l'ordre).
- Gotcha : sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, toute classe de `apps/ios/Meeshy/**` non marquée `nonisolated` doit écrire `nonisolated deinit {}` — une garde de tests (tranche 1), pas une garde texte : elle ne rougit qu'au Mac.

## 2026-11-13 — réveil 29 (15:26 UTC)

- Début du run : quatre PR de la routine ouvertes. #18006, #17974 et #17960 poussées par leurs sessions moins de 20 minutes avant : cédées, non touchées. #17983 (#17182, favoris) sans session vivante, CI des PR gelée, preuve complète par `workflow_dispatch` (run 43438023758) en file depuis 13:56 : reprise.
- Intégration vérifiée en local (dev fusionné dans la branche, non poussé pour ne pas relancer la file) : jest ciblé `bookmarks-audience|globalPostSearch|feedVisibility|PostFeedService` 6 suites, 130/130 ; `tsc --noEmit` vert (avec `--max-old-space-size=8192`, l'heap par défaut casse en conteneur).
- Le porteur a fusionné #17983 dans dev à 15:59 UTC ; #17182 fermée. Le run de preuve a fini rouge sur les trois tranches gateway, mais UNIQUEMENT sur `CallEventsHandler-*` (appels, hors lot) : ces suites passent sur dev à 17:20 UTC (14/14 relancés), rouge passager de dev à l'heure du run.
- Aucun lot nouveau : le run a été consacré à la PR orpheline, comme le veut la routine.
- Prochain lot recommandé : mener #17960, #17974, #18006 à la fusion s'ils restent ouverts, puis #16741 ou #16879 ; #16739 attend une décision ; #14227 / #16696 demandent une session de staging.

## 2026-11-13 — réveil 30 (17:40 UTC)

- Lot : #18052. La personne qu'on fait entrer dans une communauté l'apprend (« Ajouté à la communauté Y »), dans SA langue (Prisme de cadrage, rang 4 témoigné), et le tap ouvre la communauté. Trois portes : invitation (`POST /communities/:id/invite`), ajout administrateur (`POST /communities/:id/members`, pas sur une réactivation déjà active), bascule en privée (#16723, au nom du créateur, seulement pour qui est réellement admis). Site unique `services/notifications/community-added.ts`, après la réponse.
- La charge ne porte que `communityId` / `communityName` et l'acteur ; le nom part tel qu'écrit (#16786). Push : clé `communityId` sur la carte `data` (`''` = absent).
- Web : destination `community` dans `target.ts` + son jumeau `sw-push.js` (parité 13 destinations), décodage `communityId`/`communityName` dans `record.ts`, `TargetLink`. iOS : `communityId` sur `NotificationContext`, `SocketNotificationEvent`, `NotificationPayload` et `NotificationNavContext` ; les deux aiguillages ouvrent le détail (iPhone `router.push`, iPad `rightPanelRoute`), repli conversation inchangé. Un ancien client ignore la clé et garde son comportement.
- #16669 (invitation à accepter ou ajout direct) reste ouverte : l'annonce sert les deux réponses.
- Gotcha : `NotificationService.ts` est à 3710/3761 lignes sous cliquet ; la clé push a été ajoutée à solde nul de lignes.

## 2026-11-13 — réveil 31 (19:40 UTC)

- Début du run : deux PR de la routine ouvertes. #18028 (« N en ligne », #18014) retenue par le porteur (relecture bloquante : le compte révèle la connexion d'une personne précise) : non touchée, décision au porteur. #18054 (#18052, réveil 30) sans session depuis 17:57 : reprise.
- CI des branches coupée depuis 18:16 (`CI_DEV_SEUL`, #18048 : seuls `dev`, `main` et `ci/promotion-*` tournent ; consigne du porteur : fusionner les PR ouvertes et corriger `dev` en continu). La preuve d'une branche est donc LOCALE, puis la CI de `dev` qui suit la fusion.
- `origin/dev` intégré dans #18054 sans conflit. Gates sur la branche intégrée : passerelle `src/__tests__/unit/routes` 877/877 suites (13 697 tests), communautés + conversations + notifications 150/150 suites (2 379 tests), `tsc --noEmit` vert ; web `bun test src/lib/notifications src/components` 6 626/6 628 — les deux rouges (`focal-row.test.tsx`, `lens-row.test.tsx`, pastille de présence) passent seuls (105/105) : pollution entre suites, hors lot ; `check-push-target-parity.mjs` vert ; `tsc` web : une erreur dans `src/lib/push/shell-push-runtime.ts`, identique sur dev, hors lot. iOS : aucun runner (gel) — à surveiller sur la CI iOS de dev après fusion.
- Prochain lot recommandé : suivi Android de #18052 (la notification « ajouté à la communauté » ouvre le détail), puis #16741 ou #16879 ; #16739 et #18028 attendent une décision ; #14227 / #16696 demandent une session de staging.

## 2026-11-13 — réveil 32 (21:38 UTC)

- Début du run : une seule PR de la routine ouverte, #18028 (« N en ligne », #18014), retenue par le porteur pour une décision (le compte révèle la connexion d'une personne précise) : non touchée. CI des branches toujours coupée (`CI_DEV_SEUL`, #18048) : preuve locale, puis CI de `dev` après fusion. Le suivi Android #18061 a été écarté pour cette raison (aucun compilateur Android joignable hors CI).
- Lot : #16724 (passerelle, sécurité, préexistant). Le pont `ensureParticipantFromMember` (`services/messaging/MessagingService.ts`), qui recrée une participation ACTIVE depuis un `ConversationMember` hérité quand aucune ligne `Participant` n'existe, entre désormais sous `mayReturnToSalon` : dans le salon d'une communauté privée (ou désactivée), seuls le créateur et les membres actifs sont recréés ; conversation illisible ou lecture qui échoue ⇒ rien n'est créé (le `catch` du pont rend `null`, donc refus d'écrire). Salon hors communauté et communauté publique vivante : inchangés.
- Témoins : `MessagingService.legacyMemberCommunityLaw.test.ts` (8), quatre rouges avant le correctif (ancien membre, publique désactivée, panne, conversation illisible).
- Rouge de dev soldé au passage, venu du réveil 30 : `recipient-language-projection-sweep` ne savait pas remonter le paramètre d'un rappel `async` (`recipients.map(async (recipient) => …)` dans `community-added.ts`). Le balayage l'accepte désormais ; preuve qu'il mord : `community-added.ts` muté en `select: { id, systemLanguage }` ⇒ nommé « sans regionalLanguage, customDestinationLanguage, deviceLocale ».
- Rouge de dev laissé à son lot : `gateway-test-file-size-budget` (`ZmqTranslationClient.test.ts` 2476 → 2477, #18042).
- Pas de revue adversariale : resserrement d'une porte sur une loi existante (`mayReturnToSalon`, revue avec #16703), ni nouvelle permission ni migration.
- Prochain lot recommandé : #16712 (salon sans créateur, décision à prendre sur la lecture la plus probable) ou #18061 dès que la CI des branches revient ; #16739, #16893, #16669 et #18028 attendent une décision ; #14227 / #16696 demandent une session de staging.

## 2026-11-13 — réveil 33 (23:40 UTC)

- Début du run : une seule PR de la routine ouverte, #18028 (« N en ligne »), retenue par le porteur pour décision : non touchée. CI des branches toujours coupée (`CI_DEV_SEUL`, #18048) : preuve locale, puis CI de `dev`.
- Lot : #16712 (passerelle, sécurité). Lecture retenue des deux options de l'issue : « les accès des invités restants sont coupés », sans donner à quiconque un rang qu'il n'a pas reçu. Quand le créateur d'un salon d'une communauté privée ou désactivée sort sans héritier INSCRIT (`creatorSuccession` rend `close`), tous les liens de partage du salon passent inactifs et marqués (`guestRevocationPendingAt`) PENDANT la requête — `guestAccessEnd` refuse dès cet instant chaque invité — puis leurs invités sont révoqués en arrière-plan par `runWithRetries` (`socketio/closeShareLinkRevokingGuests.ts`, désormais exporté : 1 min, 5 min, puis balayage horaire). Le salon reste actif (la clôture reste un geste du créateur). Salon avec héritier, simple départ, communauté publique : inchangés.
- Témoins : quatre dans `community-salon-exit.test.ts`, deux rouges avant le correctif. Gates : gateway `src/__tests__/unit` + `src/__tests__/security`, `route-manifest`, `src/socketio`, `src/routes/__tests__`, `src/utils` et les suites racine — vertes ; `tsc --noEmit` vert.
- Revue adversariale : aucun bloquant. Suivi ouvert #18104 (une fermeture de liens qui lève n'est reprise par rien ; mesurer les invités sans lien en staging).
- Prochain lot recommandé : #18104, puis #18061 dès que la CI des branches revient ; #16739, #16893, #16669 et #18028 attendent une décision ; #14227 / #16696 demandent une session de staging.

## 2026-11-14 — réveil 34 (01:40 UTC)

- Début du run : une seule PR de la routine ouverte, #18028 (« N en ligne »), retenue par le porteur pour décision : non touchée. #18105 (#16712) fusionnée.
- Lot : #18104 (passerelle, sécurité). Le balayage horaire des liens (`ExpiredShareLinksCleanupService.cleanup`) appelle désormais `closeLinksOfOrphanedSalons` (`services/conversations/orphanedSalonLinks.ts`, qui porte aussi `closeOrphanedSalonLinks`, sorti de `communitySalonExit.ts`) AVANT la reprise des révocations différées : il retrouve les salons VIVANTS d'une communauté privée ou désactivée qui ont encore un lien actif, dont un créateur est SORTI (ligne `creator` inactive) et qu'aucun créateur INSCRIT actif ne gouverne ; il ferme et marque leurs liens, et la reprise révoque leurs invités dans la même passe.
- Décision prise : la preuve de sortie est exigée, et bornée. Seule une ligne `creator` sortie DEPUIS le 2026-11-13 (`ORPHANED_SALON_SWEEP_SINCE`, la règle de #16712) compte, et seuls les liens créés AVANT cette sortie se ferment. Un salon laissé sans créateur par d'anciens chemins (données héritées) n'a jamais promis la fermeture de ses liens, et une révocation ne se défait pas ; un lien créé plus tard n'est pas celui que la sortie devait fermer. La lecture part des sorties récentes, jamais de toutes les communautés.
- Revue adversariale avant la PR : deux points élevés corrigés dans le lot (données héritées révoquées à la première passe ; balayage qui aurait refermé chaque nouveau lien), plus la casse « Creator » et le coût (lecture qui partait de toutes les communautés privées). Reste : la mesure en staging des invités sans lien → suivi.
- Gates locaux (CI des branches coupée, #18048) : passerelle `src/__tests__ src/services src/socketio src/utils src/routes` 2647/2659 suites — les 12 rouges hors lot : 6 de conversion d'images (binaire natif absent sous `--ignore-scripts`) et 6 qui passent seules (81/81, mémoire du lot complet) ; suites conversations + balayage des liens 27/27 après intégration de dev ; `tsc --noEmit` vert ; cliquet `tsc-never-loaded-tests-ratchet` vert après correction d'un `leftAt` manquant dans le témoin (77 → 76).
- Gotcha : `tsc-never-loaded-tests-ratchet` type-checke TOUS les fichiers de test (`tsconfig.test.json`) — un nouveau témoin se vérifie par ce cliquet, que ts-jest ne remplace pas.
- Prochain lot recommandé : #18061 dès que la CI des branches revient ; sinon #16739 (décision), #16741 ou #16879 ; #16893, #16669 et #18028 attendent une décision ; #14227 / #16696 / la mesure de #18104 demandent une session de staging.
- Témoins : `orphaned-salon-links-sweep.test.ts` (6) et `ExpiredShareLinksCleanupService.orphaned-salons.test.ts` (2) ; le second rouge sans le câblage.

## 2026-11-14 — réveil 35 (03:40 UTC)

- Début du run : une seule PR de la routine ouverte, #18028 (« N en ligne »), retenue par le porteur pour décision : non touchée. CI des branches toujours coupée (`CI_DEV_SEUL`, #18048) : preuve locale, puis CI de `dev`. #18061 (Android) reste écarté pour cette raison.
- Lot : #16810 (sécurité, partagé). `isProfileImageReference` (`packages/shared/utils/profile-image-reference.ts`) admettait TOUT `/api/…` : `/api/../../x` ou n'importe quelle route GET passait comme avatar ou bannière, de profil comme de communauté. La branche n'admet plus que la route de flux des pièces jointes, `/api/(v1/)attachments/file/<clé>`, la clé DÉCODÉE suivant la loi du chemin de stockage (`%2e%2e`, double encodage, encodage illisible, requête, fragment refusés). La clé reste admise percent-encodée : c'est la forme que `apiPath('/attachments/file/<encodeURIComponent>')` a gravée jusqu'au 2026-09-16.
- Rétrocompatibilité : seule l'ÉCRITURE est gardée ; les trois clients n'envoient l'avatar et la bannière que lorsqu'ils changent (web `community-settings.ts`, iOS `CommunitySettingsViewModel.save`, Android `CommunitySettingsViewModel`), et un téléversement rend le chemin de stockage relatif. Une valeur déjà stockée sous une autre forme n'est pas relue.
- Témoins : `packages/shared/__tests__/profile-image-reference.test.ts` (4, trois rouges avant), `apps/web/src/lib/api/profile.test.ts` (1, rouge avant), passerelle `settings.test.ts` (3 cas de refus de `PUT /communities/:id`). `validation.test.ts` disait « accepts /api/ paths » avec `/api/v1/static/banner.jpg` (la route AUTHENTIFIÉE de l'audio des stories) : il dit désormais l'inverse.
- Gates locaux : shared vitest 9651 (après correction du témoin périmé) ; passerelle `unit/routes/communities` + `unit/routes/users` + cliquet `tsc-never-loaded-tests-ratchet` 88/88 suites, `tsc --noEmit` vert ; web `bun test src/lib/api src/lib/profile src/routes` 9073/9073, `tsc --noEmit` vert.
- Pas de revue adversariale : resserrement d'une validation d'entrée, ni permission ni migration.
- Prochain lot recommandé : #16811 (une image d'identité ne désigne qu'un fichier de l'appelant), puis #16809 (hôtes Meeshy) ; #18061 dès que la CI des branches revient ; #16739, #16893, #16669 et #18028 attendent une décision ; #14227 / #16696 demandent une session de staging.

## 2026-11-14 — réveil 36 (05:38 UTC)

- Début du run : une seule PR de la routine ouverte, #18028 (« N en ligne », #18014). Le porteur a accepté le risque de l'oracle « communauté fabriquée » (décision consignée à 04:58 UTC, aucune parade) et la PR est sortie du brouillon ; dernière poussée 40 minutes avant, sans session active : run consacré à sa fusion, aucun lot nouveau.
- `origin/dev` intégré sans conflit. Gates locaux sur la tête intégrée : passerelle `unit/routes/communities` + `community-online-count` + cliquet `tsc-never-loaded-tests-ratchet` 33/33 suites (530 tests), `tsc --noEmit` vert (il n'avait pas pu tourner au run précédent : client Prisma généré ici) ; web `bun test src/lib/api src/routes/community` 4226/4226, `tsc --noEmit` vert, `bun run build` + `measure-weight.mjs` verts. `check-communities.mjs` ne tourne pas en conteneur (Playwright cherche `chromium_headless_shell-1248`, absent) — hors lot.
- Prochain lot recommandé : #16811 (une image d'identité ne désigne qu'un fichier de l'appelant), #18026 (miroir Android de « N en ligne ») et #18061 dès que la CI des branches revient ; #16739, #16893, #16669 attendent une décision ; #14227 / #16696 demandent une session de staging.

## 2026-11-14 — réveil 37 (07:38 UTC)

- Début du run : aucune PR de la routine ouverte ; #18028 (« N en ligne ») fusionnée. CI des branches toujours coupée (`CI_DEV_SEUL`, #18048) : preuve locale, puis CI de `dev`.
- Lot : #16811 (passerelle + partagé, sécurité). Une image d'identité ne désigne plus qu'un fichier TÉLÉVERSÉ par celui qui la pose. `profileImageStorageKey` (`packages/shared/utils/profile-image-reference.ts`) rend la clé de stockage sous ses trois formes (chemin relatif, route de flux, adresse absolue de la route de flux — quel que soit l'hôte) ; `identityImageIsCallers` (`services/attachments/identityImageOwnership.ts`) exige une ligne `MessageAttachment` image avec `uploadedBy` = l'appelant (`filePath` ou `fileUrl`), la règle que la source `upload` de l'administration appliquait déjà (#8217). Branché sur `POST /communities`, `PUT /communities/:id`, `PATCH /users/me/avatar` et `/banner` : sinon 400 `IDENTITY_IMAGE_NOT_OWNED`, rien d'écrit ; une lecture qui échoue ⇒ 500.
- Rétrocompatible : la valeur DÉJÀ posée passe sans lecture (une valeur stockée avant la garde n'est jamais refusée à son propriétaire) ; les trois clients posent le `fileUrl` que leur propre téléversement vient de rendre. Un hôte tiers reste l'affaire de #16809.
- Témoins : `profile-image-ownership.test.ts` (14), cinq de plus dans `settings.test.ts`, un dans `core.test.ts`, quatre pour `profileImageStorageKey` ; 17 rouges sans le correctif des routes.
- Pas de revue adversariale : resserrement d'une validation d'entrée sur une règle existante, ni permission ni migration.
- Gates locaux (CI des branches coupée, #18048) : passerelle `unit/routes` + `routes/__tests__` + `security` 930/930 suites (14 155 tests), `tsc --noEmit` vert, cliquet `tsc-never-loaded-tests-ratchet` vert ; shared vitest ciblé 95/95. Un rouge corrigé en route : `search-tokens-write-guard` lit toute clé `displayName` dans le `data` d'un `user.update` comme une écriture de nom — la composition explicite du taux de complétion l'y faisait entrer, revenue à l'étalement.
- PR #18355.
- Prochain lot recommandé : #16809 (hôtes Meeshy, même loi), #18026 et #18061 dès que la CI des branches revient ; #16739, #16893, #16669 attendent une décision ; #14227 / #16696 demandent une session de staging.

## 2026-11-14 — réveil 38 (09:38 UTC)

- Début du run : aucune PR de la routine ouverte ; #18355 (#16811) fusionnée. CI des branches toujours coupée (`CI_DEV_SEUL`, #18048) : preuve locale, puis CI de `dev`.
- Lot : #16809 (passerelle, sécurité, vie privée). Une image d'identité ABSOLUE — avatar ou bannière d'un profil, d'une communauté — n'est plus admise que sur un hôte de médias Meeshy : `meeshyMediaHosts.ts` (`services/attachments/`) lit les hôtes de `PUBLIC_URL`, `API_PUBLIC_URL`, `BACKEND_URL` et `MEESHY_MEDIA_HOSTS` (liste), plus `gate.meeshy.me` toujours ; l'hôte se compare à la forme que `URL` analyse (port compris), une adresse à identifiants est refusée. `identityImageIsCallers` refuse désormais toute référence qui ne désigne aucun fichier du volume (hôte tiers, route Meeshy qui ne sert pas un fichier) et son PROPRE fichier servi par un hôte tiers ; 400 `IDENTITY_IMAGE_NOT_OWNED`, rien d'écrit, aucune lecture.
- Rétrocompatible : écriture stricte, lecture tolérante. La valeur DÉJÀ posée passe toujours (un renommage qui renvoie la bannière tierce existante n'échoue pas) ; les trois clients ne posent que la clé de leur propre téléversement. Le web n'a rien à changer.
- Reste : #18404 — la mesure des lignes existantes vers un hôte tiers (User.avatar/banner, Community.avatar/banner) demande une base, et ce qu'on fait de celles qu'on trouve (laisser, purger, masquer à la lecture) est une décision.
- Témoins : `meeshy-media-hosts.test.ts` (18), `profile-image-ownership.test.ts` et `settings.test.ts` (hôte tiers ⇒ 400, valeur tierce déjà posée ⇒ 200), `core.test.ts` (création). Fixtures de trois suites `users/` passées de `https://example.com/…` à un téléversement de l'appelant sur `gate.meeshy.me`.
- Gates locaux : passerelle `unit/routes` + `unit/services` + `routes/__tests__` + `security` + cliquet `tsc-never-loaded-tests-ratchet` 1587/1588 suites (26 507 tests) — le rouge restant est `UploadProcessor.heif-conversion` (binaire natif absent sous `--ignore-scripts`, hors lot) ; `tsc --noEmit` vert.
- Pas de revue adversariale : resserrement d'une validation d'entrée sur la règle de #16811, ni permission ni migration.
- Prochain lot recommandé : #18026 (miroir Android de « N en ligne ») et #18061 dès que la CI des branches revient ; sinon #16741 ou #16879 ; #16739, #16893, #16669 attendent une décision ; #14227 / #16696 demandent une session de staging.

## 2026-11-14 — réveil 39 (11:38 UTC)

- Début du run : aucune PR de la routine ouverte. CI des branches toujours coupée (`CI_DEV_SEUL`, #18048).
- Lot : #18435 (première tranche de #16857, contrat + passerelle + web). Un nom NEUF au contrat, `community:updated` (`CommunityUpdatedEventData`, `packages/shared/types/socketio-events/community.ts`) : l'identité publique ÉCRITE (identifiant, nom et description tels que stockés, avatar, bannière, confidentialité, `updatedAt` ISO) et l'effectif ACTIF — ni membres, ni présence, ni coordonnées, ni créateur. `services/community-updated-broadcast.ts` le diffuse APRÈS la réponse sur la room personnelle de chaque membre actif et du créateur, une fois chacun ; communauté désactivée ⇒ rien. Branché sur `PUT /communities/:id` et `PATCH /admin/communities/:id`. Le web l'applique au détail et à chaque liste en cache (`lib/api/community-live.ts`), chargé par `import()` (`community-live-binding.ts`, chunk `realtime` au plafond) : première peinture 97,51 → 97,53 Ko (plafond 98).
- Décision prise : audience = rooms personnelles des membres actifs, pas de room `community:<id>` (aucune adhésion de socket à tenir à jour, et la loi « membre = ligne active » reste la seule). L'effectif part avec l'identité : une bascule en privée fait entrer des membres (#16741).
- Témoins : passerelle `community-updated-broadcast.test.ts` (7), `community-updated-emission.test.ts` (4, deux rouges sans le branchement), `admin-communities.test.ts` (+2, un rouge sans le branchement) ; web `community-live.test.ts` (5, trois rouges sous mutation), `community-live-binding.test.ts` (2). Le cliquet `socket-event-orphan-gate` (shared) a rougi tant qu'aucun client ne citait l'événement.
- Suivi ouvert : #18439 (iOS et Android consomment `community:updated`). Reste de #16857 : membres (rejoint/parti/rôle), suppression.
- Pas de revue adversariale : diffusion vers les seuls membres actifs d'une identité qu'ils lisent déjà, ni permission ni migration.
- Après fusion de #18440 : la suite complète a rougi `server-emit-door-sweep` (une dépendance nommée `emit: (userId: string, …)` ressemble, pour le balayage, à une porte d'émission redéclarée). Rattrapé en renommant la dépendance `deliver` (PR suivante). Gotcha : lancer `server-emit-door-sweep` sur tout nouveau diffuseur, même quand sa porte réelle est `broadcastToUser`.

## 2026-11-14 — réveil 40 (13:38 UTC)

- Début du run : aucune PR de la routine ouverte ; #18440 et #18448 (`community:updated`, #18435) fusionnées. Le gel de la CI des PR est levé (#18048 fermée : `CI_DEV_SEUL=false`, `PR_CI_GEL=false`) : la CI de la PR redevient la preuve, ce qui rouvre les lots Android.
- Lot : #18026 (Android). `ApiCommunity.onlineMemberCount: Int? = null` (un ancien serveur reste lisible), porté par `Community` ; `Community.onlineLine` rend le nombre à écrire, rien quand il est absent, nul ou négatif. `CommunityDetailScreen.StatsRow` l'écrit sous les compteurs, point `Indigo500` (iOS `brandPrimary`), rangée fusionnée pour TalkBack. Chaîne `community.online` adoptée du catalogue iOS dans les sept langues (`i18n/manifest/community.json` + `xcstrings_to_android.py`).
- Témoins : `CommunityDecodingTest` (+4 : servi, `null`/absent, zéro/négatif, résultat de recherche).
- Gates locaux : `xcstrings_to_android.py --check` vert, tests des scripts i18n 218/218. `meeshy.sh jvm-check` ne tourne plus en conteneur : `libsignal-client` vient de `build-artifacts.signal.org`, refusé (403) par le proxy — la preuve est `android.yml` sur la PR.
- Prochain lot recommandé : #18061 (Android, la notification « ajouté à la communauté » ouvre la communauté), puis #18439 (iOS et Android consomment `community:updated`), puis le reste de #16857 (membres, suppression) ; #16739, #16893, #16669 attendent une décision ; #14227 / #16696 demandent une session de staging.

## 2026-11-14 — réveil 41 (15:38 UTC)

- Run consacré à mener #18479 (#18026) à la fusion : PR de la routine ouverte, dernière poussée à 14:06, donc inactive.
- CI de la tête `5039d5f4e` : tout vert sauf `Android (assemble + unit tests)`, rouge sur les 7 mêmes tests de `:feature:calls` que `dev` (#18490, ouverte), que la PR ne touche pas. `assembleDebug` vert ; `:core:model`, `:core:network` et `:feature:community` (dont `CommunityDecodingTest`) passés avant l'arrêt de Gradle sur `:feature:calls`.
- `origin/dev` intégré sans conflit ; `xcstrings_to_android.py --check` vert sur la fusion.
- Prochain lot recommandé : inchangé (#18061, puis #18439, puis le reste de #16857).

## 2026-11-14 — réveil 42 (17:38 UTC)

- Run consacré à fusionner #18479 (#18026, « N en ligne » sur Android) une fois `dev` déverrouillé : fusion `8078bfefd`. Non journalisé à ce réveil-là ; consigné ici.

## 2026-11-14 — réveil 43 (19:38 UTC)

- Début du run : aucune PR de la routine ouverte, `dev` déverrouillé.
- Lot : #18061 (Android). `PushPayload.communityId` (la clé `communityId` de la carte ; `''` = absente) et `NotificationContext.communityId` ; `PushTapDestination.Community`, élue avant la conversation pour la famille communauté / membres d'iOS (`RootNotificationNavigator` : `community_invite`, `community_joined`/`left`, `member_*`, `added_to_conversation`, `new_conversation*`, `removed_from_conversation`) ; sans la clé, le chemin d'avant. Une seule table pour les deux portes : la ligne de la cloche (`NotificationDestination.Community` → `onOpenCommunity` → `CommunityRoutes.detail`) et le push (`PushTapExtras` transporte `communityId`, `LaunchRouter` ouvre `CommunityRoutes.detail`).
- Hors lot : la bannière in-app (`NotificationBannerHost`) n'ouvre que conversation, publication ou jeu ; un toucher sur la bannière d'un ajout reste sans effet, comme avant.
- Témoins : `PushTapDestinationTest` (+4), `PushPayloadTest` (+1), `NotificationDestinationResolverTest` (+3), `LaunchRouterTest` (+2), `PushTapIntentFactoryTest` (+1). Preuve : `android.yml` sur la PR (`jvm-check` ne tourne pas en conteneur, `libsignal-client` refusé par le proxy).
- Prochain lot recommandé : #18439 (iOS et Android consomment `community:updated`), puis le reste de #16857 (membres, suppression) ; #16739, #16893, #16669 attendent une décision ; #14227 / #16696 demandent une session de staging.

## 2026-11-15 — réveil 17:38 UTC

- Début du run : #18682 (iOS consomme `community:updated`, #18439) est ouverte et a reçu une poussée à 17:32, donc vivante : cédée à sa session. #18568 (#18061) fusionnée.
- Lot : #18670 (Android). `InAppBanner.communityId`, posé quand `NotificationDestinationResolver` (la table de la cloche et du push) élit `Community` ; l'ordre du toucher devient la fonction pure `InAppBanner.tapTarget()` (`BannerTapTarget.kt`) : jeu, communauté, conversation, publication. `NotificationBannerHost.onOpenCommunity` → `CommunityRoutes.detail` dans `MeeshyApp`. Un message qui nomme seulement une communauté ouvre toujours sa conversation.
- Témoins : `BannerTapTargetTest` (5), `NotificationBannerViewModelTest` (+2). Preuve : `android.yml` sur la PR (Gradle ne joint pas `dl.google.com` en conteneur).
- Prochain lot recommandé : le volet Android de #18439 une fois #18682 fusionnée, puis le reste de #16857 (membres, suppression) ; #16739, #16893, #16669 attendent une décision ; #14227 / #16696 demandent une session de staging.
## 2026-11-14/15 — réveils 44 à 51 (rattrapage)

- Runs consacrés à fusionner #18568 (#18061, la notification « ajouté à la communauté » ouvre la communauté sur Android) : `dev` verrouillé plusieurs heures, puis rouges Android étrangers ; fusion `17a816d67` une fois `dev` réparé. Suppression de branche refusée par le proxy (API 403). Suivi ouvert : #18670 (la bannière in-app Android n'ouvre pas la communauté).

## 2026-11-15 — réveil 52 (15:38 UTC)

- Début du run : aucune PR de la routine ouverte, `dev` déverrouillé.
- Lot : #18439, volet iOS (la référence). `community:updated` est décodé par le SDK (`CommunityUpdatedEvent`, `Sockets/CommunityUpdateChannel.swift`, canal hors de `MessageSocketManager` comme `ConversationObsolescenceChannel`), routé (`SocketEvent.communityUpdated`, table des conversations) et servi par `MessageSocketProviding.communityUpdated`. Une seule règle d'application (`Models/CommunityUpdatedEvent+Apply.swift`) pour le modèle d'écran (`MeeshyCommunity.applying`) et la ligne persistée (`APICommunity.applying`) : autre communauté ⇒ rien, événement plus ancien que la copie ⇒ rien, rôle du lecteur, « N en ligne », emoji et nombre de canaux gardés, empreinte floue d'une image qui change oubliée. Appliqué sans relance réseau à `CacheCoordinator.communities` (toutes clés, `repaintEverywhere`), à `CommunityListViewModel` et à `CommunityDetailViewModel` (flux injecté, défaut `CommunityUpdateChannel.live`).
- Témoins : SDK `CommunityUpdatedEventTests` (6, décodage clé par clé depuis la charge de l'émetteur), `SocketInboundRouteTableTests` (+1 route, relevé figé +1 nom), `CacheCoordinatorCommunityUpdatesTests` (2) ; app `CommunityListViewModelTests` (+3), `CommunityDetailViewModelTests` (+2). Preuve : CI iOS de la PR (pas de Swift en conteneur).
- Gates locaux : shared `ios-socket-event-enum-parity`, `socket-event-name-gate`, `socket-payload-shape`, `socket-event-orphan-gate` verts ; cliquets maison iOS identiques à `dev` (ses rouges `fixed-font`/`kit-glass-*` et la suite non enregistrée `UserActivityCardsTests` sont étrangers).
- Reste de #18439 : le volet Android (#18439 reste ouverte) ; la rangée Communautés de la liste des conversations relit le cache réécrit à son prochain chargement, sans rafraîchissement en direct.

## 2026-11-15 — réveil 19:38 UTC

- Début du run : aucune PR de la routine ouverte ; #18682 (iOS) et #18693 (#18670) fusionnées.
- Lot : #18439, volet Android (le dernier). `CommunityUpdatedEvent` (`core/model`, miroir de `CommunityUpdatedEventData`) et la règle d'application `ApiCommunity.applying` / `List<ApiCommunity>.applying`, mêmes règles qu'iOS : autre communauté ⇒ rien, événement plus ancien que la copie ⇒ rien (date illisible ⇒ appliqué), membres, créateur, « N en ligne » et nombre de canaux gardés. `SocketEventNames.COMMUNITY_UPDATED`. `CommunityUpdateBinding` (`sdk-core/community`, `RealtimeBinding` en `@IntoSet`, modèle de `ConversationCreatedBinding`) installe la route sur le routeur série et applique chaque événement sous le compte auquel il est ARRIVÉ (`collectArrived`) à `CommunityCacheRepository.applyUpdate`, qui réécrit la fiche et la première page DÉJÀ tenues sans rajeunir l'instant de lecture : la liste et le détail, qui lisent ce cache, se ré-émettent sans relance réseau. Aucun ViewModel touché.
- Cliquets partagés : `community:updated` sort de l'inventaire d'asymétrie de `socket-event-platform-parity-gate` (lu par les trois clients) ; `SWEPT_EVENTS_AT_LAST_MEASURE` 125 → 126 (la forme de la charge est désormais confrontée au miroir Kotlin). `packages/shared/__tests__/ci/` 24 fichiers, 204 tests verts.
- Témoins : `CommunityUpdatedEventTest` (8), `CommunityCacheRepositoryTest` (+3), `CommunityUpdateBindingTest` (4). Preuve : `android.yml` sur la PR (`jvm-check` refusé en conteneur : `libsignal-client` 403).
- Reste : les pages 2+ et la recherche de la liste Android ne sont pas réécrites (elles relisent au prochain chargement), comme la rangée Communautés de la liste des conversations iOS.
- Prochain lot recommandé : le reste de #16857 (membres rejoint/parti/rôle, suppression) ; #16739, #16893, #16669 attendent une décision ; #14227 / #16696 demandent une session de staging.

## 2026-11-15 — réveil 21:38 UTC

- Début du run : #18718 (#18439, volet Android) ouverte, dernière poussée à 20:11, donc inactive : run consacré à la mener à la fusion.
- État : fusionnable sans conflit avec `dev`, mais `dev` est verrouillé (`lock_branch` actif) : fusion impossible. Le second `android.yml` lancé à la main sur `472a2325b` (21:08) a été annulé à la main à 21:28 pendant les tests unitaires, après un `assembleDebug` vert, comme celui de 19:46. Pas de nouveau lancement : la preuve Android manque toujours.
- Prochain lot recommandé : fusionner #18718 dès que `dev` est déverrouillé et qu'un `android.yml` va au bout ; ensuite le reste de #16857 (membres, suppression).

## 2026-11-15 — réveil 23:38 UTC

- Début du run : #18718 (#18439, volet Android) fusionnée ; aucune PR de la routine ouverte ; `dev` verrouillé (`lock_branch`).
- Lot : #18766, seconde tranche de #16857 (l'effectif). Contrat : `community:member-joined` (`role`, `via: self|invited`), `community:member-left` (`reason: left|removed`), `community:member-role-updated`, chacun avec `memberCount` actif après l'écriture et `at` ISO ; la personne n'est nommée que par son identifiant. Passerelle : `services/community-member-broadcast.ts` (audience = membres actifs ∪ créateur ∪ personne concernée, communauté désactivée ⇒ rien, envoi qui lève isolé, après la réponse), branché sur les six gestes (`join`, `leave`, `invite`, `POST …/members` hors ligne déjà active, `PATCH …/role` avec le rôle ÉCRIT, `DELETE …/members/:userId`). Web : `community-member-live.ts`, monté par `bindCommunityLive` avec `viewerId` — `memberCount` recopié au détail et aux listes, rôle du lecteur suivi, liste des membres relue, lecteur sorti ⇒ détail et listes relus.
- Témoins : passerelle `community-member-broadcast.test.ts` (6) et `communities-member-broadcast-wiring.test.ts` (11, dont 5 refus muets) ; web `community-member-live.test.ts` (7) + `community-live-binding.test.ts` adapté (quatre écoutes).
- Gates locaux : gateway `tsc` 0 erreur, `src/__tests__/unit/routes` + services communauté + sweeps 892 suites vertes (le cliquet `tsc-never-loaded` vert seul, la passe groupée ayant été tuée par manque de mémoire) ; shared `__tests__/ci/` 24 fichiers / 204 tests ; web `tsc` 0, `bun test` 33 088 / 33 089 (le rouge `act-leak-guard` est étranger : rouge aussi sans le lot), `vite build` + `measure-weight` verts ; `check-communities.mjs` ne lance pas Chromium en conteneur (version Playwright).
- Cliquet de parité : famille « effectif d'une communauté » ajoutée à `ASYMETRIES` (absents iOS #18767, Android #18768).
- Hors lot : les entrées INDIRECTES (créer ou rejoindre un salon d'une communauté via `applyCommunityAdmission`, désactivation des appartenances d'un compte supprimé) n'émettent pas encore — suivi à ouvrir ; la suppression d'une communauté reste muette (reste de #16857).
- Prochain lot recommandé : #18767 (iOS lit l'effectif), puis #18768 (Android), puis la suppression d'une communauté (#16857).

## 2026-11-17 — réveil 15:38 UTC

- Début du run : aucune PR de la routine ouverte ; #18770 (#18766) fusionnée le 2026-11-16. #18767 (iOS) cédé : la PR vivante #18954 (revue des caches iOS) écrit `CommunityDetailViewModel` et `CommunityListViewModel`.
- Lot : #18768 (Android lit l'effectif). `core/model` : `CommunityMemberJoinedEvent` / `LeftEvent` / `RoleUpdatedEvent` (miroirs des trois charges), lus en `CommunityMemberChange` (geste, effectif, rôle tenu ou `null`) ; rôle inconnu, effectif négatif ou identifiant vide ⇒ écarté. Règles d'application : `ApiCommunity.applying(change, viewerId)` recopie `memberCount` et fait suivre la ligne de la personne dans `members` — c'est de là que `CommunityMembership` tire les droits d'écran du lecteur (entré ⇒ sa ligne, promu ⇒ son rôle, retiré ⇒ plus de ligne) ; un tiers qui entre n'est pas inventé. `applyingMember` réécrit la liste des membres tenue sur un départ ou un rôle.
- `sdk-core` : `CommunityCacheRepository.applyMemberChange` (fiche, première page, membres ; une ENTRÉE fait relire la liste des membres tenue ; le lecteur qui entre ou sort relit sa liste ; sorti d'une communauté privée, il n'en garde ni membres ni channels). `CommunityMemberBinding` (`RealtimeBinding` en `@IntoSet`, modèle de `CommunityUpdateBinding`) installe les trois routes. Aucun ViewModel touché : détail, liste et membres lisent ce cache.
- Cliquets partagés : Android sort de la famille « effectif d'une communauté » d'`ASYMETRIES` ; `SWEPT_EVENTS_AT_LAST_MEASURE` 131 → 134. `__tests__/ci/` 25 fichiers, 215 tests verts.
- Gates locaux : `jvm-check -PjvmCheckModelOnly` (le mode complet bute sur `libsignal-client`, 403) : `CommunityMemberEventsTest` 12/12 et les suites `Community*` + `socket.*` de `core/model` vertes. `sdk-core` (Robolectric) ne se prouve que par `android.yml` : `CommunityMemberBindingTest` (4), `CommunityCacheRepositoryTest` (+6).
- Prochain lot recommandé : #18767 (iOS lit l'effectif) dès que #18954 est fusionnée, puis la suppression d'une communauté (#16857).

## 2026-11-17 — réveil 17:38 UTC

- Début du run : aucune PR de la routine ouverte ; #19266 (#18768, Android) et #18954 fusionnées, ce qui débloque #18767.
- Lot : #18767 (iOS lit l'effectif), le dernier client. SDK : `CommunityMemberJoinedEvent` / `LeftEvent` / `RoleUpdatedEvent` (miroirs des trois charges, `Sockets/CommunityMemberChannel.swift`), lus en `CommunityMemberChange` (communauté, personne, effectif, rôle TENU ou `nil`) ; identifiant vide, effectif négatif, rôle inconnu ou `creator` ⇒ écarté. Trois routes vers `CommunityMemberChannel`, servi par `MessageSocketProviding.communityMemberChanged`. Règles d'application (`Models/CommunityMemberChange+Apply.swift`) : `MeeshyCommunity.applying` recopie l'effectif ; `APICommunity.applying(_:readerId:)` recopie l'effectif et fait suivre `currentUserRole` au seul geste du lecteur. `CacheCoordinator` réécrit `communities` sous toutes ses clés.
- App : `CommunityDetailViewModel` (tiers ⇒ effectif ; lecteur promu ⇒ droits ; lecteur sorti ⇒ droits, canaux et publications gardées retirés, « mes communautés » allégée, fiche relue ; entré d'ailleurs ⇒ fiche relue), `CommunityListViewModel` (effectif ; le lecteur entré sans ligne ou sorti avec une ⇒ liste relue), `CommunityMembersViewModel` (liste ouverte relue), `MyCommunities` (effectif ; lecteur sorti ⇒ retiré de la bande et du cache de partage ; entré ⇒ bande relue). Flux par `OrderedEventLane.relay` (la règle maison interdit `sink { Task }`).
- Cliquets partagés : la famille « effectif d'une communauté » quitte `ASYMETRIES` (les trois clients lisent) ; `SWIFT_SWEPT_EVENTS_AT_LAST_MEASURE` 162 → 165. `__tests__/ci/` 25 fichiers, 215 tests verts.
- Témoins : SDK `CommunityMemberEventsTests` (9), `SocketInboundRouteTableTests` (+1, relevé figé +3 noms), `CacheCoordinatorCommunityMemberChangesTests` (2) ; app `CommunityDetailViewModelTests` (+5), `CommunityListViewModelTests` (+3), `MyCommunitiesTests` (+2), `CommunityMembersViewModelTests` (+3). Preuve : CI iOS de la PR (pas de Swift en conteneur). Gardes iOS locales : `check_house_rules.sh` (42 règles tenues), `check_cohesion_budget.sh`, `check_test_registration.sh`, accent-color verts.
- Prochain lot recommandé : la suppression d'une communauté (reste de #16857) ; les entrées INDIRECTES (salon rejoint via `applyCommunityAdmission`, compte supprimé) n'émettent toujours pas.

## 2026-11-17 — réveil 21:38 UTC

- Début du run : #19297 (#18767, iOS lit l'effectif) ouverte, dernière poussée à 19:38, donc inactive : run consacré à la mener à la fusion.
- État trouvé : CI de `70124379f` encore en file Mac depuis 19:38 (builds app et SDK non partis) ; seul rouge, la tranche 4 des gardes navigateur web (`media-16` lit `flow-end` pour `justify-end`, plus un 404 de script) — étrangère au lot (aucun fichier web touché) et suivie par #19370.
- `dev` (60 commits) fusionnée dans la branche sans conflit. Rejoués sur l'arbre fusionné : shared `__tests__/ci/` 25 fichiers / 215 tests verts ; `check_house_rules.sh` 42 règles tenues, `check_cohesion_budget.sh` et `check_test_registration.sh` verts, `check-accent-color-hardcoding.mjs` conforme.
- Les runs de l'ancienne tête sont annulés, ci.yml / ios.yml / ios-sdk relancés sur la nouvelle.
- Prochain lot recommandé : fusionner #19297 dès que la CI iOS est verte (la tranche 4 web reste rouge tant que #19370 est ouverte : fusion à faire valider par Jacques), puis la suppression d'une communauté (#16857).

## 2026-11-17 — réveil 23:38 UTC

- Début du run : #19297 (#18767) ouverte, dernière poussée à 21:41, donc inactive : run consacré à la mener à la fusion.
- État trouvé : la CI iOS SDK de `8521abb25` a enfin tourné et rendu un VRAI rouge du lot : `CommunityMemberEventsTests.swift:14` — `static let joinedPayload: [String: Any]` refusé par Swift 6 (« not concurrency-safe, non-Sendable »). Corrigé en propriété calculée. Deux tranches gateway encore en file d'attente depuis 21:41.
- `dev` (50 commits) fusionnée dans la branche sans conflit. Rejoués sur l'arbre fusionné : shared `__tests__/ci/` 25 fichiers / 215 tests verts ; `check_house_rules.sh`, `check_cohesion_budget.sh`, `check_test_registration.sh`, `check-accent-color-hardcoding.mjs` verts.
- Prochain lot recommandé : fusionner #19297 dès que la CI iOS SDK est verte sur la nouvelle tête, puis la suppression d'une communauté (#16857).
## 2026-11-18 — réveil 05:38 UTC

- Début du run : #19297 (#18767, iOS lit l'effectif) est ouverte et a reçu une poussée à 05:30 d'une autre session qui la mène (rouges `Verdict iOS SDK` étrangers) : cédée. Elle écrit `CommunityDetailViewModel` / `CommunityListViewModel`, donc le volet iOS de ce lot attend sa fusion.
- Lot : #19590, dernière tranche de #16857 (la disparition). Contrat : `community:deleted` (`CommunityDeletedEventData` : `communityId`, `reason: deleted|deactivated`, `at` ISO) — ni membres, ni créateur, ni identité. Passerelle : `services/community-deleted-broadcast.ts` ; l'audience (membres actifs ∪ créateur) se lit AVANT l'écriture (`readCommunityDeletedAudience` : la suppression efface les appartenances ; une lecture qui échoue rend une audience vide, jamais un échec de la suppression), l'envoi part après la réponse, isolé par destinataire. Branché sur `DELETE /communities/:id` (`deleted`) et sur `PATCH /admin/communities/:id` avec `isActive: false` (`deactivated`) ; la réactivation reste annoncée par `community:updated`. Web : `lib/api/community-deleted-live.ts`, monté par `bindCommunityLive` — la communauté sort de chaque liste en cache ; le détail REGARDÉ se relit (404, l'état de refus déjà dessiné), tout ce que personne ne regarde (détail par id ou par identifiant, membres, salons, publications) est oublié.
- Témoins : passerelle `community-deleted-broadcast.test.ts` (9), `community-deleted-emission.test.ts` (3, la suppression rouge sans branchement ; le faux Prisma efface vraiment les appartenances, une audience lue après serait vide), `admin-communities.test.ts` (+3, la désactivation rouge sans branchement) ; web `community-deleted-live.test.ts` (4), `community-live-binding.test.ts` (+1, cinq écoutes). Le cliquet `socket-event-orphan-gate` a rougi tant que le web ne citait pas l'événement.
- Cliquet de parité : famille « disparition d'une communauté » ajoutée à `ASYMETRIES` (absents iOS #19591, Android #19592).
- Gates locaux : passerelle `tsc --noEmit` vert (8 Go de tas ; il meurt faute de mémoire en parallèle d'autres gates), `unit/routes` + services communauté + balayages d'émission, de promesses détachées et `tsc-never-loaded` 929 suites / 14 233 tests verts ; shared vitest 437 fichiers / 10 602 tests verts ; web `tsc` vert, `bun test` 34 381 / 34 382 (le rouge `act-leak-guard` est étranger, comme aux runs précédents), `vite build` + `measure-weight` verts (première peinture 99,76 Ko, inchangée : le module est dans l'import paresseux de `community-live`).
- Pas de revue adversariale : diffusion, vers les seuls membres actifs, d'un fait qu'ils découvriraient au prochain chargement ; ni permission ni migration.
- #16857 : les trois tranches de son contrat sont livrées (identité, effectif, disparition) ; reste les entrées INDIRECTES qui n'émettent pas (salon d'une communauté via `applyCommunityAdmission`, compte supprimé), à ouvrir en issue avant de la fermer.
- Prochain lot recommandé : #19592 (Android lit la disparition), puis #18767 / #19591 côté iOS quand #19297 est fusionnée ; #16739, #16893, #16669 attendent une décision ; #14227 / #16696 demandent une session de staging.

## 2026-11-18 — réveil 07:38 UTC

- Début du run : #19602 (#19590, la disparition) ouverte, dernière poussée à 06:02, donc inactive : run consacré à la mener à la fusion. #19297 (#18767, iOS) poussée à 07:10 par une autre session : cédée.
- État : CI de `e858f87b1` en file depuis 06:03 (94 runs en attente sur le dépôt), cinq tâches jamais démarrées (`Tests · web`, Playwright 2 et 3, deux du traducteur), tout le reste vert. `dev` avait 54 commits d'avance : fusionné sans conflit.
- Gates locaux sur l'arbre fusionné : shared `__tests__/ci/` 25 fichiers / 215 tests ; passerelle `tsc --noEmit` vert, suites communauté + admin + `tsc-never-loaded` 37 suites / 609 tests ; web `tsc` vert, `bun test src/lib/api/community` 114 / 114.

## 2026-11-18 — réveil 09:38 UTC

- Début du run : aucune PR de la routine ouverte ; #19297 (#18767, iOS lit l'effectif) et #19602 (#19590, disparition passerelle + web) fusionnées à 07:40.
- Lot : #19592 (Android lit la disparition). `core/model` : `CommunityDeletedEvent` (miroir de `CommunityDeletedEventData` : `communityId`, `reason`, `at`), `disappearedId` (`null` si la charge ne désigne rien), `List<ApiCommunity>.withoutCommunity`. `SocketEventNames.COMMUNITY_DELETED`. `sdk-core` : `CommunityCacheRepository.applyDeleted` retire la ligne de la première page tenue sans réseau et oublie fiche, membres et channels ; le détail ouvert repart donc à froid, relit, et `CommunityDetailViewModel.onDetailFailure` dessine le refus (404) qu'il sait déjà dessiner — même règle que le web. `CommunityDeletedBinding` (`RealtimeBinding` en `@IntoSet`, modèle de `CommunityUpdateBinding`) ; charge sans communauté écartée sans couper le flux. Aucun ViewModel touché.
- Cliquets partagés : Android sort de la famille « disparition d'une communauté » d'`ASYMETRIES` (reste iOS, #19591) ; `SWEPT_EVENTS_AT_LAST_MEASURE` 135 → 136. `__tests__/ci/` 25 fichiers, 215 tests verts.
- Gates locaux : `jvm-check -PjvmCheckModelOnly` (compilation en processus, le démon Kotlin manquant de mémoire) : `CommunityDeletedEventTest` 4/4, les suites `Community*` et `socket.*` de `core/model` vertes. `sdk-core` (Robolectric) ne se prouve que par `android.yml` : `CommunityDeletedBindingTest` (4), `CommunityCacheRepositoryTest` (+3).
- Prochain lot recommandé : #19591 (iOS lit la disparition, débloqué par la fusion de #19297), puis fermer #16857 après avoir ouvert l'issue des entrées INDIRECTES (salon via `applyCommunityAdmission`, compte supprimé).

## 2026-11-18 — réveil 11:38 UTC

- Début du run : aucune PR de la routine ouverte ; #19655 (#19592, Android lit la disparition) fusionnée. #19591 (iOS lit la disparition) cédé : #19665 et #19667, vivantes (poussées à 11:30), écrivent `ConversationListView+CommunitiesLoader.swift` et `CommunityListViewModelTests.swift`.
- Lot : #19406 (une communauté grandit en silence), première moitié de #18769. `applyCommunityAdmission` (écrivain UNIQUE des admissions implicites) reçoit `CommunityMemberAnnounce` en paramètre REQUIS et annonce ce qu'il a ÉCRIT : `community:member-joined`, `via: self` (l'appelant qui revient admin) ou `invited`, rang écrit (une ligne réactivée repart `member`) ; un lot de réactivations qu'une course a déjà en partie fait ne s'annonce pas. Les plans portent désormais `userId` et `via` sur chaque entrée. `broadcastCommunityMemberChanges` relit communauté et effectif UNE fois pour tout le lot (un salon à cent participants n'en fait pas cent lectures). Deux fabriques : `communityMemberAnnouncerFrom(fastify)` (routes) et `communityMemberAnnouncerOverIO(prisma, io)` (`admitConversationMember`, débannissement, entrée par lien de salon). Sept appelants branchés (`core-lifecycle`, `participants-writes` via `memberAdmission`, `call-invite-events` idem, `link-admission`, `sharing-invite`, `participant-ban-core`, `communities/core`) + `admitSalonOccupants` / `closeSalonsAfterSwitch` (`settings`, `admin/communities-oversight`).
- Cliquet : `src/__tests__/community-member-writer-sweep.test.ts` fige les six fichiers qui écrivent `CommunityMember` et leur émetteur ; seul muet nommé : la désactivation d'un compte supprimé (#18769, qui reste ouverte pour elle — `MeeshySocketIOManager` étant hors budget, l'injection d'une annonce dans `MaintenanceService` demande son propre lot).
- Aucun client touché : web, iOS et Android lisent déjà `community:member-joined` (#18766, #18767, #18768).
- Prochain lot recommandé : #19591 (iOS lit la disparition) dès que #19665 / #19667 sont fusionnées ; sinon la moitié « compte supprimé » de #18769.

## 2026-11-18 — réveil 13:38 UTC

- Début du run : #19678 (#19406, admissions implicites) ouverte, poussée à 13:12 : vivante, cédée. #19655 (#19592, Android) fusionnée.
- Lot : #19591 (iOS lit la disparition), le dernier client. SDK : `CommunityDeletedEvent` (miroir de `CommunityDeletedEventData` : `communityId`, `reason`, `at` ; `disappearedId` nul si la charge ne désigne rien), `CommunityDeletedChannel` (publie l'identifiant, écarte une charge vide), route `community:deleted`, `MessageSocketProviding.communityDeleted`. `CacheCoordinator.applyCommunityDeletion` retire la communauté de TOUTES les clés de `communities` (`removeEverywhere`), sans réseau.
- App : `CommunityDetailViewModel.applyDisappearance` — la fiche regardée passe aussitôt à l'état « indisponible » (`community` nul, `loadFailure = .refused`, plus aucun rôle ni geste de créateur), oublie canaux et publications gardées, quitte « mes communautés », puis se relit SANS indicateur (un compte qui la lit encore la retrouve). `CommunityListViewModel` retire la ligne sans relance ; `MyCommunities` la retire de la bande et du cache de partage.
- Cliquets partagés : la famille « disparition d'une communauté » quitte `ASYMETRIES` (les trois clients lisent) ; `SWIFT_SWEPT_EVENTS_AT_LAST_MEASURE` 166 → 167 (+1, `community:deleted`, après le correctif appels de dev).
- Rouges ÉTRANGERS trouvés sur `dev` nu (`3bb5b20e8`), reproduits avant le lot : `swift-socket-payload-shape-gate` mesure 160 au lieu de 165 (cinq événements d'appel ne sont plus balayés : `call:invite-declined`, `call:invite-expired`, `call:muted-by-moderator`, `call:participant-invited`, `call:reaction-received`, après le lot appels `65738b005`) et `socket-event-platform-parity-gate` signale `call:conversation-changed` absent d'Android. Avec le lot : 161 (+1).
- Témoins : SDK `CommunityDeletedEventTests` (5), `CacheCoordinatorCommunityDeletionsTests` (2), `SocketInboundRouteTableTests` (+1, relevé figé +1 nom) ; app `CommunityDetailViewModelTests` (+3), `CommunityListViewModelTests` (+2), `MyCommunitiesTests` (+1). Preuve : CI iOS de la PR. Gardes iOS locales : `check_house_rules.sh` (42 règles), `check_cohesion_budget.sh`, `check_test_registration.sh`, accent-color verts.
- Prochain lot recommandé : ouvrir l'issue des entrées INDIRECTES restantes puis fermer #16857 ; #16739, #16893, #16669 attendent une décision ; #14227 / #16696 demandent une session de staging.

## 2026-11-18 — réveil 15:38 UTC

- Début du run : #19694 (#19591, iOS lit la disparition) poussée à 15:01, donc vivante : cédée. #19678 (#19406) inactive depuis 14:20 : run consacré à la mener à la fusion.
- `dev` (11 commits, appels et miroirs Swift ; seul `packages/shared/types/call-rules.ts` côté partagé) fusionnée dans la branche sans conflit. Rejoués sur l'arbre fusionné : passerelle `tsc --noEmit` vert, `unit/routes` + `unit/services/conversations` + `services/conversations/__tests__` + balayage des écrivains + `tsc-never-loaded` 976 suites / 14 845 tests verts ; shared `__tests__/ci/` 25 fichiers / 216 tests verts.
- Prochain lot recommandé : la moitié « compte supprimé » de #18769 ; #16739, #16893, #16669 attendent une décision ; #14227 / #16696 demandent une session de staging.

## 2026-11-18 — réveil 17:38 UTC

- Début du run : deux PR de la routine ouvertes, inactives depuis plus d'une heure (dernières poussées 16:26 et 16:31) : #19694 (#19591, iOS lit la disparition) et #19678 (#19406, admissions implicites). Run consacré à les mener à la fusion.
- État trouvé : leur CI n'avait pas démarré (102 runs en file sur le dépôt), et `dev` avait reçu deux commits utiles aux deux branches : `725488896` (la deinit isolée au MainActor qui tuait xctest au démontage) et `2fcb40b94` (leçon jvm-check, garde `journal-one-file-per-entry-guard`).
- `dev` (`2fcb40b94`) fusionnée dans les deux branches sans conflit. Rejoués sur les arbres fusionnés : shared `__tests__/ci/` 25 fichiers / 216 tests verts (les deux), gardes de leçons de la passerelle vertes ; pour #19694, `check_house_rules.sh`, `check_cohesion_budget.sh`, `check_test_registration.sh` et `check-accent-color-hardcoding.mjs` (410 = référence) verts.
- Prochain lot recommandé : fusionner #19694 et #19678 dès que leur CI est verte sur ces têtes (la seconde fusionnée devra reprendre `dev` : les deux écrivent ce journal) ; puis fermer #16857.
- 17:43 : #19678 fusionnée par Jacques (`ba1f209bf`), #19406 fermée. `dev` reprise dans #19694 (seul conflit : ce journal, les deux entrées gardées dans l'ordre des réveils).

## 2026-11-18 — réveil 19:38 UTC

- Début du run : CI du dépôt gelée par le porteur depuis 19:20 (tous les workflows désactivés) ; la session `v2-meeshy-88` fusionne seule vers `dev`. #19694 (#19591, iOS lit la disparition) seule PR ouverte de la routine, déclarée « prête » à 19:27 sur `dev` `ffb60040e`.
- `dev` avait avancé (`c465db99c`, dont `packages/shared/types/voice-api.ts` et `api-schemas/message-attachment.ts`) : fusionnée dans la branche sans conflit. Rejoués sur l'arbre fusionné : shared `__tests__/ci/` 25 fichiers / 216 tests verts ; `check_house_rules.sh` (42 règles), `check_cohesion_budget.sh`, `check_test_registration.sh` (2 045 fichiers inscrits), `check-accent-color-hardcoding.mjs` (168 / 410 = références) verts. Branche redéclarée prête sur la PR.
- Aucun nouveau lot ouvert : une seule PR de la routine à la fois, et rien ne se prouve tant que la CI est gelée.
- Prochain lot recommandé : après la fusion de #19694, ouvrir l'issue des entrées INDIRECTES restantes et fermer #16857, puis la moitié « compte supprimé » de #18769.

## 2026-11-18 — réveil 21:38 UTC

- Début du run : #19694 (#19591, iOS lit la disparition) fusionnée à 21:28 par la file coordonnée ; aucune PR de la routine ouverte. CI de PR toujours gelée (`pull_request` « skipped »), la preuve passe par `workflow_dispatch`.
- Lot : #18769, seconde moitié — un compte supprimé quitte ses communautés, et ça se voit. `deactivateCommunityMembershipsOfDeletedAccount` reçoit `CommunityMemberAnnounce` en paramètre REQUIS (même règle qu'`applyCommunityAdmission`), lit ses communautés actives AVANT l'écriture (après, il n'y en a plus), et annonce `community:member-left` (`reason: 'removed'`) dans chacune — rien si l'écriture lève, rien si une course l'a déjà faite (`count === 0`). `MaintenanceService` branche `communityMemberAnnouncerOverIO(prisma, resolveIO())` sur le serveur que le manager lui injecte déjà (`setShareLinkRevocationLive`) : aucune ligne ajoutée à `MeeshySocketIOManager`, hors budget.
- Audience : celle de la loi partagée (membres actifs restants, créateur, et la room du compte lui-même, dont les sessions sont déjà révoquées à ce stade de la suppression). Charge : l'identifiant seul, déjà anonymisé en place par #5691.
- Cliquet `community-member-writer-sweep` : plus aucun écrivain muet (l'entrée `silent #18769` devient `member-broadcast`).
- Témoins : `deactivateDeletedAccountCommunityMemberships.test.ts` (+4), `MaintenanceService.test.ts` (+2, dont le branchement traversant le vrai annonceur jusqu'aux rooms `user:<id>`). Rouge prouvé : 6 échecs sans le correctif.
- Gates locaux : passerelle `tsc --noEmit` vert ; 31 suites / 811 tests verts (MaintenanceService, écrivains, diffusion, promesses détachées). Rouge ÉTRANGER : `tsc-never-loaded-tests-ratchet` mesure 80 erreurs non muettes pour un plafond de 76 — identique sur `dev` nu (même liste avant / après le lot).
- Aucun client touché : les trois lisent déjà `community:member-left`.
- Prochain lot recommandé : fermer #16857 (ses trois tranches et ses entrées indirectes sont livrées) ; #16739, #16893, #16669 attendent une décision ; #14227 / #16696 demandent une session de staging.

## 2026-11-19 — réveil 05:38 UTC

- Début du run : #19763 (#18769, un compte supprimé quitte ses communautés) seule PR de la routine ouverte, dernière poussée à 01:38, donc inactive : run consacré à la mener à la fusion.
- `dev` (`d88c406d7`, 14 commits : iOS, SDK, garde passerelle `participation-soft-state-equality-filter-guard`) fusionnée dans la branche sans conflit. Rejoués sur l'arbre fusionné : passerelle `tsc --noEmit` vert ; `MaintenanceService`, `deactivateDeletedAccountCommunityMemberships`, `community-member-writer-sweep`, `participation-soft-state-equality-filter-guard` et `tsc-never-loaded` verts.
- Seul rouge : `gateway-test-file-size-budget` règle 3 (`calls-routes.test.ts : 2154 → 2175`), ÉTRANGER et identique sur `dev` nu ; avec la garde web `capability-guard` (`lib/calls/call-network-recovery.ts`), il est corrigé par #19772, vivante (poussée à 05:06 par une autre session) : cédée.
- Pas de `workflow_dispatch` sur cette tête : son verdict serait rouge pour ces deux causes, et la branche devra reprendre `dev` après #19772.
- Prochain lot recommandé : dès que #19772 est sur `dev`, reprendre `dev`, lancer `ci.yml` en `workflow_dispatch` et fusionner #19763 sur un verdict vert ; puis fermer #16857.

## 2026-11-19 — réveil 07:38 UTC

- Début du run : #19763 (#18769, compte supprimé) seule PR de la routine ouverte, inactive depuis 05:45 : run consacré à la mener à la fusion.
- Blocage inchangé : les deux rouges ÉTRANGERS de son verdict (`capability-guard` qui vise `lib/calls/call-network-recovery.ts`, et `calls-routes.test.ts` à 2 175 lignes pour une référence de 2 154) sont toujours sur `dev` (`89bece81d`). #19772, qui corrige les deux, est ouverte et poussée à 06:44 par une autre session : vivante, cédée.
- `dev` (`89bece81d`, 3 commits iOS / Android / web uiux, aucun chemin sous `services/` ni `packages/shared`) fusionnée dans la branche sans conflit ; les gardes passerelle du réveil précédent restent valables pour cet arbre. Pas de dispatch : son verdict ne serait rouge que de ces deux étrangers, et la file en compte déjà plusieurs.
- Prochain lot recommandé : dès que #19772 est sur `dev`, la refusionner, dispatcher `ci.yml`, fusionner #19763, fermer #18769 puis #16857.

## 2026-11-19 — réveil 09:38 UTC

- Début du run : #19763 (#18769) fusionnée (`1ff276909`) ; aucune PR de la routine ouverte.
- Lot : #19868 — demander à rejoindre une communauté qui valide chaque entrée dit « Demande envoyée » (passerelle + web), jamais un faux membre.
- Constat : le web lisait le 409 `COMMUNITY_JOIN_PENDING` d'une communauté qui valide chaque entrée (#19429) comme « déjà membre » — « Quitter », compteur +1 et entrée dans « mes communautés » pour quelqu'un qui n'était pas entré. iOS affichait le message brut en anglais.
- Passerelle : `GET /communities/:id` sert `currentUserJoinRequest` (`'pending' | null`, additif), la demande du LECTEUR seul, lue seulement pour un non-membre d'une communauté qui valide chaque entrée (`routes/communities/join-request-state.ts`) ; lecture qui lève ⇒ `null`.
- Web : la jonction annonce `acceptsPending` ; « Demander à rejoindre », puis l'état « Demande envoyée » (un statut, pas un bouton) ; 403 `COMMUNITY_JOIN_COOLDOWN` dit le délai ; un 202 sur un cache périmé défait l'entrée optimiste ; `community:member-joined` sur soi efface la demande. Quatre clés en sept langues ; budget `interface_catalogs_community_membership` 7 → 8 Ko (7,11 Ko au `measure-weight`). Glyphe `clock` ajouté au jeu des communautés (`extract-glyphs.mjs`).
- Témoins : passerelle `communities-core.test.ts` (+6, rouge prouvé : 5 échecs) ; web `community-membership.test.ts` (+8), `view.test.ts` (+3), `community-membership.test.tsx` (+3), `community-member-live.test.ts` (+1) — rouge prouvé (12 échecs).
- Gates locaux : passerelle `tsc --noEmit` vert, 51 suites / 772 tests verts (communautés, `routes/__tests__`, `tsc-never-loaded`) ; shared `__tests__/ci/` 25 / 216 verts ; web `tsc --noEmit` vert, build vert, `measure-weight` vert, suite complète 34 700 verts, 1 rouge ÉTRANGER (`act-leak-guard.test.ts`, identique sur `dev` nu `cd0157b87`).
- Auditeur adversarial : non bloquant ; deux états hérités relevés → #19872.
- Suivis ouverts (milestone 284) : iOS #19869, Android #19870, intendants (liste, accepter, refuser, `community:join-requested`) #19871, clôture des demandes #19872.
- Prochain lot recommandé : #19871 (web d'abord), sans quoi une demande envoyée n'a personne pour y répondre.

## 2026-11-19 — réveil 11:38 UTC

- Début du run : aucune PR de la routine ouverte ; #19868 fusionnée (`6f3155bf4`).
- Lot : #19871 — les intendants d'une communauté voient, acceptent et refusent les demandes d'entrée (web d'abord).
- Web : l'écran Membres ouvre, pour l'intendant SEUL (`isCommunityStewardOf` : administrateur, modérateur, créateur, lus dans ce que le détail sert), la section « Demandes en attente · N » (« + » quand d'autres pages restent) : avatar, nom, pays (code ISO rendu par `Intl.DisplayNames`), date ; « Accepter » et « Refuser », vrais boutons de 44 nommés pour le lecteur d'écran ; refuser est confirmé (sept jours avant une nouvelle demande). La liste n'est même pas demandée à un autre lecteur (la passerelle lui répondrait 404).
- Optimiste (`community-join-request-actions.ts`) : la ligne part au geste, accepter fait monter `memberCount` aussitôt et le membre servi entre dans l'effectif ; un échec rend exactement le cache d'avant ; un 404 (déjà tranchée ailleurs, compte fermé, blocage) laisse la ligne partie, remet le compteur et relit liste, effectif et fiche. Hors ligne, rien ne part.
- Temps réel : `community:join-requested` relit la liste de CETTE communauté (`community-join-request-live.ts`, branché dans `bindCommunityLive`) ; `community:member-joined` la relit aussi (une demande acceptée par un autre intendant s'efface).
- Passerelle inchangée. Cliquets partagés : `community:join-requested` quitte `SANS_LECTEUR` (orphan gate) et entre dans l'asymétrie « web seul » (parity gate, iOS #19877, Android #19878) ; `check-ts-catalog-dead-entries.mjs` perd les trois entrées `join-requests` (269 = référence). Budget `interface_catalogs_community_membership` 8 → 9 Ko (8,16 Ko mesurés).
- Gardes web ajustées : `press-ratchet` (réponse d’appui sur les trois boutons), `avatar-presence-guard` (exemption : un demandeur n’a pas de présence servie), `community-live-binding.test.ts` (sept événements écoutés). Suite web complète : 34 719 verts, 1 rouge ÉTRANGER (`act-leak-guard.test.ts`, rouge aussi sans le lot).
- Témoins : `community-join-requests.test.ts` (13), `community-join-requests.test.tsx` (6), `community-live.test.ts` (+1), `community-member-live.test.ts` (+1) — rouge prouvé sur les deux branchements temps réel (2 échecs sans eux).
- Suivis ouverts (milestone 284) : iOS #19877, Android #19878, refus notifié au demandeur #19879.

## 2026-11-19 — réveil 13:38 UTC

- Début du run : #19880 (#19871, intendants web) seule PR de la routine ouverte, dernière poussée à 11:55, donc inactive : run consacré à la mener à la fusion.
- Verdict trouvé sur `4390a6065` : seconde tentative du `workflow_dispatch` de `ci.yml`, tous les travaux verts (les rouges de la première tentative étaient d'infrastructure : miroir apt de Playwright, tranche passerelle annulée).
- `dev` (`fbfaa617b`, 20 fichiers : position partagée, rang de liste, carte iOS ; aucun chemin du lot) fusionnée dans la branche sans conflit. Rejoués sur l'arbre fusionné : shared `__tests__/ci/` 25 fichiers / 216 tests verts ; web `tsc --noEmit` vert, suites du lot (6 fichiers, 41 tests) vertes, `check-ts-catalog-dead-entries` 269 = référence.
- 15:29 : `ci.yml` (`workflow_dispatch`) VERT sur `2d4149e7c`. `dev` ayant reçu 21 commits (appels web, position partagée, relations ; aucun chemin du lot), `dev` `07609bfa9` refusionnée sans conflit ; rejoués : shared `__tests__/ci/` 216 verts, web `tsc --noEmit` vert, suites communautés + appels (182 fichiers, 2 632 tests) vertes, catalogue 269 = référence.
- Prochain lot recommandé : iOS #19877 (les intendants tranchent les demandes), puis #19869 / #19879.

## 2026-11-19 — réveil 15:38 UTC

- Début du run : #19880 (#19871, intendants web) ouverte, poussée à 15:31 par une autre session avec une CI dispatchée en file : vivante, cédée.
- Lot : #19869 — iOS dit « Demander à rejoindre » puis « Demande envoyée » sur une communauté qui valide chaque entrée.
- SDK : `CommunityService.join` annonce `acceptsPending` et rend `CommunityJoinOutcome` (`.joined(membre)` ou `.pending(requestId)`, la réponse 202 se distinguant d'une rangée de membre par `requestId`) ; `CommunityJoinRefusal.classify` lit 403 `COMMUNITY_JOIN_COOLDOWN` par son code ; `APICommunity` décode `requiresJoinApproval` et `currentUserJoinRequest` (servis depuis #19868).
- App : `CommunityDetailViewModel` — « Demande envoyée » dès le toucher, défaite sur un échec ; une demande ne fait membre de rien, ne relit pas la fiche et n'entre pas dans « mes communautés » ; `community:member-joined` sur soi fait membre et efface la demande ; un cache qui croyait l'entrée directe lit la demande servie. La porte « Rejoindre » de la fiche de profil ne compte plus une demande comme une adhésion.
- Écran : la demande envoyée est un statut (pas un bouton), avec « Un administrateur ou un modérateur doit l'accepter » ; le délai d'un refus récent se dit. Quatre clés au catalogue MeeshyUI en sept langues, reprises du web.
- Témoins : SDK `CommunityServiceTests` (+5), app `CommunityDetailViewModelTests` (+8). Preuve : CI iOS de la PR. Gardes iOS locales : `check_house_rules.sh` (42 règles, après correction d'une police fixe), `check_cohesion_budget.sh`, `check_test_registration.sh` (2 056), `check-accent-color-hardcoding.mjs` (168 / 408 = références) verts.
- Prochain lot recommandé : #19877 (intendants sur iOS).

## 2026-11-19 — réveil 17:38 UTC

- Début du run : #19903 (#19869, iOS « Demande envoyée ») ouverte, poussée à 16:55 par une autre session, ses `workflow_dispatch` en file : vivante, cédée.
- Lot : #19872 (passerelle) — une demande d'entrée se clôt quand la personne entre par une autre porte, et n'attend jamais indéfiniment.
- Constat : une demande `pending` survivait à une entrée par une autre porte (invitation, ajout, salon) — repartie, la personne relisait « Demande envoyée » et accepter la vieille demande la faisait revenir ; et une demande qu'aucun intendant ne voit (blocage, compte un temps inutilisable) attendait indéfiniment.
- Passerelle : `services/community-join-request-lifecycle.ts`. `closePendingJoinRequests` (`accepted`, au nom de qui fait entrer, ne lève jamais) appelée par les quatre écrivains d'entrée (`admitCommunityMember`, `…/invite`, `…/members`, `applyCommunityAdmission`) ; `liveJoinRequestWhere` (trente jours, `JOIN_REQUEST_TTL_MS`) dans chaque lecture et bascule : détail du demandeur, liste et décisions des intendants, compteur de `community:join-requested`, déduplication de `requestCommunityEntry`, qui écrit `expired` sur la vieille avant d'en poser une nouvelle. Décision écrite (`services/gateway/decisions/2026-11-19-…-19872.md`) : l'expiration plutôt qu'un refus implicite au blocage, qui le révélerait.
- Cliquet `community-member-writer-sweep` : chaque écrivain d'entrée doit appeler `closePendingJoinRequests`.
- Témoins : `join-request-lifecycle-19872.test.ts` (15, rouge prouvé : 11 échecs sur un module vide) ; `communities-core` et `link-entries-19429` ajustés (le `where` porte `createdAt`).
- Aucun client touché, aucun contrat d'API changé.
- Auditeur adversarial : non bloquant. Corrigés dans le lot : une invitation qui fait entrer pendant que la demande s'écrit (la demande naît close, personne n'est relancé) ; une réactivation déjà faite par une course clôt quand même (tout le plan d'`applyCommunityAdmission`) ; témoin de l'ajout sur une ligne réactivée. Rouge prouvé (2 échecs sans les correctifs). Ouverte, préexistante : #19914 (accepter rouvre la demande si une panne survient après l'entrée). Rappel : pas d'index unique sur la paire `CommunityMember` (#16696).

## 2026-11-19 — réveil 19:38 UTC

- Début du run : #19903 (#19869, iOS « Demande envoyée ») ouverte et inactive depuis 16:56 ; une autre session y a fusionné `dev` à 19:39 et relancé ses vérifications : vivante, cédée.
- Lot : #19914 (passerelle) — accepter une demande d'entrée ne la rouvre jamais quand la personne est déjà entrée.
- Constat : `POST …/join-requests/:requestId/accept` remettait la demande en `pending` sur TOUTE exception d'`admitCommunityMember`, y compris une panne levée APRÈS l'écriture de l'appartenance (diffusion, engagement levant en synchrone) : membre active ET demande de nouveau tranchable, 500 pour l'intendant.
- Passerelle : `admitCommunityMember` sépare l'ÉCRITURE de ses suites (`afterEntry` : succès « cercles », engagement, diffusion, clôture des demandes), chacune gardée seule et journalisée, jamais remontée — le correctif vaut aussi pour l'adhésion directe. Sur erreur, l'acceptation relit l'appartenance (`membershipAfterFailure`, trois états) : `entered` ⇒ succès et membre servi ; `absent` ⇒ la demande redevient tranchable ; `unknown` (la relecture lève) ⇒ 500 sans rouvrir, une ignorance ne rouvre rien.
- Témoins : `join-request-accept-19914.test.ts` (8, rouge prouvé : 4 échecs avant le correctif, puis 2 sur la présence).
- Auditeur adversarial : non bloquant. Corrigé dans le lot : la réponse de l'acceptation servait l'`isOnline` brut du nouveau membre à l'intendant (préexistant, et le chemin `entered` l'étendait) ; elle passe désormais par `gateCoMemberPresence`, comme l'ajout d'un membre (`deactivatedAt` lu, jamais servi). Ouverte : #19924 (une demande `accepted` sans membre, quand écriture et relecture ont échoué, n'est réparée par rien). Rappel : pas d'index unique sur la paire `CommunityMember` (#16696).
- Gates locaux : passerelle `tsc --noEmit` vert ; suites communautés / demandes / admission / présence / balayages / `tsc-never-loaded` 169 fichiers, 2 258 tests verts ; balayages et cliquets (`sweep|ratchet|guard`) 135 / 136 fichiers verts, 1 rouge ÉTRANGER (`DoubleRatchet.test.ts`, 2 échecs identiques sans le lot).
- Aucun client touché, aucun contrat d'API changé.
- Prochain lot recommandé : iOS #19877 (intendants) une fois #19903 fusionnée, sinon #19879 (refus notifié, passerelle + web).

## 2026-11-19 — réveil 21:38 UTC

- Début du run : #19926 (#19914) et #19903 (#19869) ouvertes, leurs `workflow_dispatch` relancés à 21:20–21:36 par une autre session : vivantes, cédées.
- Lot : #19879 — le demandeur apprend que sa demande d'entrée a été refusée, dans sa langue (passerelle + web).
- Passerelle : `services/community-join-request-decided.ts`. Le refus (`…/reject`) annonce, après la réponse, `community:join-request-decided` `{ communityId, decision: 'rejected', retryAt, at }` sur la room du DEMANDEUR seul, et une notification `community_invite` (même famille et même préférence que « Ajouté à la communauté ») dans sa langue de cadrage (`recipientLanguage`) — jamais l'intendant nommé (ni acteur, ni identifiant). `decide` rend l'instant écrit ; `retryAt` = décision + `JOIN_REQUEST_COOLDOWN_MS`, désormais déclaré dans `community-join-request-lifecycle.ts` (site unique, `admission.ts` le reprend). `GET /communities/:id` sert `currentUserJoinRetryAt` (additif, ISO ou `null`), lu seulement pour un non-membre d'une communauté qui valide chaque entrée et sans demande en attente.
- Choix : type de notification EXISTANT plutôt qu'un `community_join_rejected` neuf — les trois clients le rendent et l'ouvrent déjà (rétrocompatible), la préférence `groupInviteEnabled` le coupe.
- Web : état « Demande refusée » + « Vous pourrez en refaire une à partir du {date} » (date `Intl` dans la langue), un statut, pas un bouton, jusqu'à `retryAt` ; puis « Demander à rejoindre ». L'événement patche le détail en cache sans relecture (`applyCommunityJoinRequestDecidedEvent`, branché dans `bindCommunityLive`). Deux clés en sept langues.
- Cliquets partagés : `community:join-request-decided` entre dans l'asymétrie « web seul » (iOS #19948, Android #19949).
- Témoins : passerelle `community-join-request-decided.test.ts` (8), `join-request-rejected-19879.test.ts` (6), `communities-core.test.ts` (+5) — rouges prouvés (4 échecs sans le détail, 2 sans le branchement de la route, 2 si l'annonce part vers l'intendant, 1 si l'acteur est posé). Web `community-join-request-decided.test.ts` (6), `view.test.ts` (+2), `community-membership.test.tsx` (+1), `community-live.test.ts` (+1) — rouges prouvés (3 échecs avant le code).
- Auditeur adversarial : non bloquant. Corrigés dans le lot : titre de la notification = nom de la communauté (iOS retombait sur « Invitation à la conversation ») ; la date web dit aussi l'heure (le délai court jusqu'à l'heure du refus + 7 jours) ; le témoin « compte inutilisable » pose une vraie ligne supprimée (rouge prouvé en retirant `USABLE_ACCOUNT_WHERE`) ; la résolution du service de notification passe dans le travail différé. Restent, assumés : notification coupée par `groupInviteEnabled` (le détail dit quand même le refus) ; « Demande refusée » ne bascule qu'au prochain rendu quand la date passe écran ouvert.

## 2026-11-19 — réveil 23:38 UTC

- Début du run : #19950 (#19879, refus notifié) poussée à 23:25 et #19903 (#19869, iOS « Demande envoyée ») dont le `workflow_dispatch` iOS tourne (seconde tentative relancée vers 23:33) : vivantes, cédées.
- Lot : #14227 — les appartenances de communauté se lisent par index, jamais par un parcours complet de la collection (une lenteur est un bug).
- Constat : `CommunityMember` ne portait que `(communityId, isActive, joinedAt)`. Les lectures par personne (`{ userId, isActive }` : « mes communautés », accès d'un post COMMUNITY, co-appartenance, purge, export) parcouraient la collection entière ; les lectures de paire (`{ communityId, userId }` : contrôle d'accès de chaque route, invitation, adhésion, demandes d'entrée) parcouraient tout l'effectif de la communauté.
- Schéma : `@@index([userId, isActive])` et `@@index([communityId, userId])`, non uniques (l'unicité de la paire reste #16696).
- Migration : `packages/shared/prisma/migrations/2026-11-19-community-member-lookup-indexes.mongodb.js`, même forme que `2026-11-13-circle-pair-reverse-indexes` : index reconnu par sa clé, aucun index ni donnée touché, un index de même clé partiel ou épars signalé (sortie 2) jamais remplacé, `DRY_RUN=1`, idempotente, commande `explain` de vérification dans l'en-tête.
- Témoin : `community-member-lookup-indexes-migration.test.ts` (9, exécute le fichier mongosh dans un contexte isolé et lit `schema.prisma`) — rouge prouvé : 9 échecs sans le lot.
- Reste pour fermer #14227 : jouer la migration sur le staging et y relever le plan (IXSCAN) ; la production attend le feu vert du porteur, sauvegarde vérifiée d'abord. Le conteneur de la routine n'atteint pas l'hôte.

## 2026-11-20 — réveil 01:38 UTC

- Début du run : trois PR de la routine ouvertes. #19950 (#19879, refus notifié) poussée à 01:11 : vivante, cédée. #19951 (#14227, index) a son `workflow_dispatch` de `ci.yml` encore en file depuis 23:44 : rien à mener tant qu'il n'a pas de verdict. #19903 (#19869, iOS « Demande envoyée ») inactive depuis 19:39 avec `ci.yml`, `ios.yml` et `sdk-tests.yml` VERTS sur `495efb8b7` : run consacré à la mener à la fusion.
- `dev` (`b66be57f7`, 46 commits : profil, jeu, talkie, position partagée iOS ; passerelle communautés #19914) fusionnée dans la branche sans conflit (le journal s'est fusionné seul). Aucun chemin iOS / SDK du lot touché par `dev`.
- Rejoués sur l'arbre fusionné : `check_house_rules.sh` (42 règles tenues), `check_cohesion_budget.sh` (code 0), `check_test_registration.sh` (2 056 fichiers inscrits), `check-accent-color-hardcoding.mjs` (168 / 408 = références).

## 2026-11-20 — réveil 05:38 UTC

- Début du run : #19983 (doublon de `retained.json`) poussée à 05:37 par le run précédent, encore actif : cédée. #19951 (#14227, index des appartenances), #19950 (#19879) et #19903 (#19869) inactives depuis plus de deux heures ; le rouge étranger qui les bloquait (#19964) est corrigé sur `dev` (#19974, `fb8f5c167`).
- Lot : mener #19951 à la fusion. `dev` (`b06982a21`) fusionnée dans la branche sans conflit. Rejoués sur l'arbre fusionné : passerelle `tsc --noEmit` vert ; témoin de migration + `tsc-never-loaded` (2 suites, 11 tests) verts ; les deux anciens rouges étrangers verts (shared `glory-frames-generated` 29/29, web `lottie/sources` 3/3).
- `ci.yml` relancé en `workflow_dispatch` sur cette tête.

## 2026-11-20 — réveil 07:38 UTC

- Début du run : quatre PR de la routine ouvertes (#19951 index, #19950 refus notifié, #19903 iOS « Demande envoyée », #19983 doublon `retained.json`), inactives depuis 05:49, leurs `workflow_dispatch` toujours en file (92 travaux en attente sur le dépôt) : rien à y faire sans annuler leur verdict.
- Lot : #19924 (passerelle) — une demande acceptée dont l'entrée n'a pas eu lieu redevient tranchable.
- Passerelle : `reopenOrphanedAcceptances` (`services/community-join-request-lifecycle.ts`), appelée avant la première page de la liste des intendants et dans `viewerJoinRequestState` (détail du demandeur). Rouvre une acceptation sur PREUVE seulement : décision de plus de dix minutes (`ORPHAN_ACCEPTANCE_GRACE_MS`), demande vivante par son âge, aucune demande plus récente de la personne (en attente, refusée, expirée), aucune ligne d'appartenance de la paire ou seulement des lignes quittées AVANT la décision. Si la personne entre par une autre porte pendant la réparation, la demande rouverte se reclôt. Ne lève jamais.
- Témoins : `join-request-orphan-19924.test.ts` (18 ; rouge prouvé : 13 échecs sans le module, puis 3 sur les correctifs d'audit) ; `join-request-lifecycle-19872` et `link-entries-19429` visent désormais l'appel de LISTE (la réparation lit avant).
- Auditeur adversarial : bloquant corrigé dans le lot (une demande plus récente REFUSÉE était annulée par la réouverture de la vieille acceptation, contournant l'attente de sept jours) ; course lecture/écriture corrigée (reclôture). Suivis ouverts : #20002 (réouverture silencieuse pour les intendants), #20003 (coût et portée de la relecture à l'accès).
- Gates locaux : passerelle `tsc --noEmit` vert ; communautés / demandes / `tsc-never-loaded` / balayage des écrivains 72 suites, 1 044 tests verts ; balayages et cliquets (`sweep|ratchet|detached`) 56 suites, 440 tests verts.
- Aucun client touché, aucun contrat d'API changé.
- Prochain lot recommandé : mener à la fusion #19951, #19950, #19903, #19983 dès que leurs vérifications rendent un verdict ; puis iOS #19877.
## 2026-11-20 — réveil 09:37 UTC

- Début du run : #19983 (doublon de `retained.json`) verte et inactive depuis 05:37 : fusionnée dans `dev` (`cab1ec1ae`). #19950 (#19879) et #20005 (#19924) attendent leur `workflow_dispatch` en file depuis 08:37 (n'y rien pousser) ; #19903 (#19869, iOS) poussée à 09:34 par une autre session : vivante, cédée.
- Lot : Android #16602 + #19870 — le détail d'une communauté lit le rôle SERVI au lecteur et dit « Demande envoyée » sur une communauté qui valide chaque entrée.
- Constat : `GET /communities/:id` ne sert plus `members[]` ; Android décidait membre / admin depuis cette liste, donc un membre non créateur voyait « Rejoindre » (409) et jamais « Quitter » — le défaut qu'iOS portait avant #16601. Et `CommunityApi.join` n'envoyait pas `acceptsPending` : une communauté qui valide chaque entrée répondait 409 `COMMUNITY_JOIN_PENDING`.
- `:core:model` : `ApiCommunity` décode `currentUserRole`, `requiresJoinApproval`, `currentUserJoinRequest` ; `CommunityMembership.resolve` lit le rôle servi d'abord, la liste en repli (ancien serveur), le créateur vaut admin ; `CommunityAccess.of(api, me)` est le site unique du détail et des membres. `CommunityJoinOutcome` (`Joined` / `Pending`, `requestId` désigne la demande) et `CommunityJoinRefusal` (`COMMUNITY_JOIN_COOLDOWN`). `applying` (temps réel) suit aussi le rôle servi du lecteur et clôt sa demande à l'entrée.
- Écran : « Demander à rejoindre », puis une tuile « Demande envoyée » qui n'est pas un bouton, et la ligne « Un administrateur ou un modérateur doit l'accepter. » ; le délai après refus se dit en rouge. Quatre chaînes × sept langues (`strings_join_request_19870.xml`), mêmes mots que les clés iOS de #19903.
- Gotcha : le `Json` de Retrofit n'encode pas les valeurs par défaut — un `JoinCommunityRequest(acceptsPending = true)` déclaré avec défaut partait `{}`. Le témoin d'encodage l'a attrapé ; le champ n'a plus de défaut.
- Gate local : `./apps/android/meeshy.sh jvm-check -PjvmCheckModelOnly` (le mode complet ne résout pas `libsignal-client`, hôte refusé par le proxy) — les suites `*Communit*` vertes. ViewModel, écran, réseau : prouvés par `android.yml`.

## 2026-11-20 — réveil 13:04 UTC

- Début du run : #20049 (iOS #19877, intendants) poussée à 13:02 et `claude/communautes-reouverture-annoncee` (#20002) à 13:04 : vivantes, cédées. Aucune autre PR de la routine ouverte.
- Lot : Android #19949 — le demandeur lit « Demande refusée — nouvelle demande possible le … » sans relecture (miroir de #19879, passerelle + web).
- `:core:model` : `ApiCommunity.currentUserJoinRetryAt` ; `CommunityJoinRequestDecidedEvent` (miroir de `CommunityJoinRequestDecidedEventData`, `refusedUntil` ne rend une date que pour `rejected` et une date lisible) ; `ApiCommunity.joinDeclinedUntil(now)` (date à venir seulement, jamais pour un membre ni une demande en attente — `membershipActionOf` du web) ; `ApiCommunity.applying(event)` : autre communauté, charge illisible ou lecteur déjà entré ⇒ rien.
- `sdk-core` : `CommunityJoinRequestDecidedBinding` (modèle de `CommunityDeletedBinding`) → `CommunityCacheRepository.applyJoinRequestDecided`, qui réécrit la fiche DÉJÀ tenue sans rajeunir sa lecture. Écran : tuile « Demande refusée » (statut, pas un bouton) et la date en rouge (`ShareLinkDateFormat.dayAndTime`, grégorienne) ; `join()` n'envoie rien avant la date. Deux chaînes × sept langues (`strings_join_declined_19949.xml`), mêmes mots que le web.
- Cliquets partagés : `community:join-request-decided` passe à « absent iOS seulement » (#19948) ; `SWEPT_EVENTS_AT_LAST_MEASURE` 144 → 145. `packages/shared/__tests__/ci/` 25 fichiers, 216 tests verts.
- Gate local : `jvm-check -PjvmCheckModelOnly` — `CommunityJoinRequestDecidedEventTest` 9/9, `SocketEventNamesParityTest` 5/5, suites `*Community*` vertes. Témoin écrit avant le code, mais son rouge n'a pas été exécuté seul (le premier passage a eu lieu avec l'implémentation). Liaison, cache, ViewModel et écran : prouvés par `android.yml` sur la PR.
- Prochain lot recommandé : iOS #19948 (même décision, dernière plateforme) une fois #20049 fusionnée ; puis Android #19878 (intendants).

## 2026-11-20 — réveil 13:38 UTC

- Début du run : quatre PR de la routine ouvertes et vivantes (#20049 iOS intendants, #20057 réouverture annoncée, #20064 texte tel qu'écrit, #20065 Android refus lu), toutes poussées entre 13:06 et 13:26, leurs `workflow_dispatch` en file : cédées.
- #14516 et #12417 (doublons, Android « rôles, permissions, lien canonique ») : déjà livrés sur `dev` ; prouvés par `jvm-check -PjvmCheckModelOnly` (`CommunityPermissionsTest`, `CommunityDecodingTest`, `CommunityLinkTest`, `CommunityPresentationTest` : `BUILD SUCCESSFUL`) et fermés avec la preuve.
- Lot : #19541 (passerelle) — les salons d'une communauté ne listent que ce que le membre peut ouvrir, avec leur vrai effectif.
- Constat : `GET /communities/:id/conversations` servait les salons quittés, bannis, fermés et obsolètes (ni la participation ni la conversation n'étaient filtrées sur `isActive`, quand `GET /conversations` exige les deux) ; `memberCount` était la colonne morte `Conversation.memberCount` (0 partout, d'où « 0 membre » sur le web, effectif masqué sur Android) ; `_count.participants` comptait les partis ; `conversationCount` de la communauté comptait les salons fermés.
- Passerelle : `where` = conversation active + participation active du lecteur (le total paginé lit le même `where`) ; participants affichés = les actifs ; `_count` par `conversationActiveMemberCountSelect` ; `memberCount` servi depuis ce `_count`. Même correctif sur la jumelle `POST /communities/:id/conversations/:conversationId`. `COMMUNITY_ACTIVE_COUNTS.Conversation` ne compte que les salons actifs (liste, détail, recherche).
- Témoins : `communities/salons-actifs-19541.test.ts` (5, double Prisma qui FILTRE sur le `where` et COMPTE selon le `_count.select` reçus) et `communities-core.test.ts` (+1, la jumelle) — rouges prouvés (5 puis 1 échec avant le correctif).
- Gates locaux : passerelle `tsc --noEmit` vert ; suites communautés 44 fichiers, 716 tests verts ; `tsc-never-loaded-tests-ratchet` 2/2 vert (relancé seul, le premier passage avait été tué faute de mémoire).
- Aucun client touché, aucun contrat d'API changé (mêmes champs, valeurs justes) : web, iOS et Android lisent déjà `memberCount` en premier.
