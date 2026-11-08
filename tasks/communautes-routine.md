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
