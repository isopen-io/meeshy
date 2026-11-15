# Meeshy — Boucles virales, campagne 2026-09 (brouillon)

> Angle imposé : **« Le monde entier devient ton groupe »** (`docs/marketing/app-store-fiche-2026-08.md` § 1). Claims autorisés seulement (§ 6) : « 76 langues traduisibles », « une voix qui ressemble à la tienne », « uniquement si tu l'actives ». À ne jamais écrire : « 200 langues », « ta voix exacte dans toutes les langues », « protocole Signal », « tout est chiffré ». Cible : 16-25 ans, ton décomplexé.

## Ce qui a été vérifié dans le code pour ce brouillon

- Le parrainage **crédite déjà le parrain** : `AffiliateTrackingService.convertAffiliateVisit` (`services/gateway/src/services/AffiliateTrackingService.ts:157-168`) appelle `recordActivity(parrain, 'social.invite_joined')`, poids 7 (`SOCIAL_AXIS_WEIGHT`, `packages/shared/types/engagement.ts:143`), multiplié par l'élan (×1 à ×5, `packages/shared/utils/engagement-elan.ts`). Puis une **amitié acceptée d'office** est créée entre le parrain et le filleul (`:170-199`), et `social.friendship` crédite les deux.
- **Aucun crédit de Meesh n'est prévu à l'inscription, pour personne.** Une Meesh coûte 1 221 points et se frappe à la main (`MEESH_MINT_COST`, `packages/shared/utils/meesh.ts:33`). Le parrain gagne ~7 à 35 points, soit environ 0,6 à 3 % d'une Meesh. Le filleul ne reçoit que les points de l'amitié. Annoncer « Meesh offerts au parrain et au filleul » serait donc un **claim faux** tant qu'une décision produit n'a pas été prise.
- Un succès ne crédite aucun point, par décision (#5758, `streaks-badges-modele.md` § 8). Seul `ACHIEVEMENT_UNLOCKED` ouvre la vue de révélation sans qu'on touche à rien ; badges, séries et niveaux arrivent en notification (§ 1).
- Axes déjà instrumentés et utiles aux boucles : `social.tracked_link`, `social.share`, `social.invite_joined`, `social.friendship`, `conversation.public`.
- Il n'y a **aucun plafond par compte sur l'envoi de messages**, seulement la limite globale de 300 requêtes/min par IP (`services/gateway/CLAUDE.md`, § Rate Limiting, #4687). C'est un risque direct pour le canal Global.

---

## Boucle A — Meeshy Global, la « place du village »

| | |
|---|---|
| **Déclencheur** | L'inscription : tout nouveau compte est ajouté au canal Global. |
| **Action** | Un défi de bienvenue épinglé par l'équipe : « Dis bonjour dans TA langue + d'où tu écris ». En option : un vocal de 5 s. |
| **Ce que voit le non-utilisateur** | La capture d'un fil où 6 langues répondent et où tout se lit dans une seule. C'est le visuel TikTok « un hello, 12 pays ». |
| **Retour vers l'app** | Chaque réponse notifie l'auteur. Le premier message dans Global coche l'axe `conversation.public` (poids 5) et rapproche du succès `achievement.three_conversation_kinds`. |
| **Porté par** | Le canal Global, déjà en place (~200 membres en staging), la gamification (`EngagementService.recordActivity`) et la vue de révélation. |
| **Manque** | Les suggestions d'amis tirées des personnes qui ont réagi dans Global (#3687), et un plafond anti-spam par compte (issue à ouvrir, voir Risques). |
| **Métrique** | Part des nouveaux comptes qui postent dans Global dans les 24 h (cible ≥ 35 %). Part de ces premiers messages qui reçoivent au moins une réponse en moins de 10 min (cible ≥ 80 %). |

Règle d'animation : **aucun premier message ne reste sans réponse**. Pendant les 3 premières semaines, un roulement de l'équipe (et des ambassadeurs) répond dans la langue de l'auteur.

## Boucle B — Publications publiques → demandes d'ami

| | |
|---|---|
| **Déclencheur** | Une story ou un reel public vu dans la découverte, un hashtag de fandom ou une communauté. |
| **Action** | Commenter (la traduction est automatique), puis aller sur le profil `/u/<pseudo>` et envoyer une demande d'ami. |
| **Ce que voit le non-utilisateur** | Le profil public `/u/<pseudo>` et ses posts publics, partagés en lien, avec un appel à l'action : « Réponds-lui, dans ta langue ». |
| **Retour vers l'app** | L'acceptation crédite `social.friendship` des deux côtés (poids 7). La présence (le point vert) ne se voit qu'entre amis acceptés, ce qui donne une vraie raison de devenir amis. |
| **Porté par** | Posts, stories, reels et statuts publics, la découverte, les demandes d'ami, les communautés, les hashtags et `/u/<pseudo>`. |
| **Manque** | Le partage direct vers IG/TikTok avec watermark (#3692) : sans lui, le contenu Meeshy ne sort pas de Meeshy. Les suggestions d'amis (#3687). |
| **Métrique** | Demandes d'ami envoyées depuis un contenu public, pour 100 vues de contenu public. Taux d'acceptation (cible ≥ 40 %). |

Formats de hashtags à amorcer : `#MonHelloMeeshy`, `#FanDeCorée`, `#SquadMondiale`, un par fandom de la fiche (K-pop, anime, gaming, foot).

## Boucle C — Gamification : la rétention qui déclenche le partage

**Rétention (déjà en place)** : paliers de série à 3, 7, 14, 30, 60 et 100 jours, niveaux, badges par axe, élan jusqu'à ×5 quand on active plusieurs familles sur 7 jours, et page Progression.

**Partage (à construire)** : la vue de révélation d'un succès est le moment d'émotion maximal. Il faut y ajouter **« Partager ma carte »**, un visuel 9:16 aux couleurs Meeshy qui porte le succès, la série et le lien de parrainage de l'utilisateur. Cette carte compte sur `social.share`.

| | |
|---|---|
| **Déclencheur** | Série de 7 jours, `first_voice`, `three_conversation_kinds` ou une échelle de conversation atteinte. |
| **Ce que voit le non-utilisateur** | « 7 jours d'affilée à parler avec 5 pays » plus un lien de parrainage. |
| **Manque** | Le partage de la carte vers IG/TikTok avec watermark (#3692) et l'attribution iOS/Android du lien embarqué (#3689). |
| **Métrique** | Cartes partagées pour 100 révélations (cible ≥ 8). Installations attribuées aux cartes. |

**Meesh au parrain et au filleul : ça n'existe pas.** Aujourd'hui, seul le parrain reçoit des points (`social.invite_joined`), le filleul ne reçoit que ceux de l'amitié, et personne ne reçoit de Meesh. Il y a deux options, à trancher dans une issue `décision-produit` :

1. Communiquer sur ce qui existe : « ton pote arrive, vous êtes amis d'office et tu montes de niveau ». C'est vrai dès maintenant.
2. Créer une récompense de parrainage (par exemple un succès « Pont entre 2 pays » ou un bonus de points pour les deux). Attention au principe « un succès ne crédite aucun point » : une récompense en Meesh contournerait la règle « pas de pompe à Meeshes ». Il faut une décision explicite du porteur, et un contrôle anti-fraude (faux comptes) avant tout crédit.

## Boucle D — Parrainage

| | |
|---|---|
| **Déclencheur** | Le succès partagé (boucle C), le défi du canal Global (A), ou l'écran de parrainage. |
| **Action** | Envoyer son lien `/signup/affiliate/<token>` ou un lien tracé. Autre option, sans compte : inviter dans une conversation `/chat/<lien>`, où l'ami répond dans sa langue avant même de s'inscrire. |
| **Ce que voit le non-utilisateur** | Une conversation déjà vivante, dans sa langue, sans compte. C'est l'onboarding le plus court possible. |
| **Retour vers l'app** | Inscription, amitié acceptée d'office avec le parrain, et crédit `social.invite_joined` pour le parrain. |
| **Porté par** | `AffiliateTrackingService.ts` (relation atomique, plafond `maxUses`), les routes `services/gateway/src/routes/affiliate.ts`, et `TrackingLinksView` / `AffiliateView` côté iOS. |
| **Manque** | L'attribution iOS/Android : un lien ouvert qui passe par le store perd le token (#3689). Aujourd'hui, seul le web attribue de façon fiable. Le K-factor n'est pas mesuré (#3693). |
| **Métrique** | Taux de conversion invités → inscrits, par canal. K-factor (voir indicateurs). |

Playbook campus (BeReal) : 10 ambassadeurs par campus, chacun avec son lien tracé, et un classement **privé** entre ambassadeurs seulement. Le produit n'a volontairement aucun classement public, il ne faut pas en créer un.

## Boucle E — Amorçage : ce que l'équipe publie DANS Meeshy

1. **Canal Global** : un défi quotidien épinglé en 7 langues. Lundi « ton mot intraduisible », mercredi « vocal de 5 s », vendredi « ta chanson du moment ».
2. **Communautés de fandom** : une par segment (K-pop, anime, gaming, foot, diaspora afrique), chacune avec un modérateur et 20 membres amorcés avant l'ouverture.
3. **Reels démo** : « Je lui parle en français, il m'entend en coréen, avec une voix qui ressemble à la mienne », tourné avec le clonage activé et consenti. Chaque reel est publié dans Meeshy **et** sur TikTok, qui renvoie vers `/u/meeshy`.
4. **Statuts et stories quotidiens** du compte officiel, pour que la découverte ne soit jamais vide au premier lancement.
5. **Conversations ouvertes par lien** (`/chat/<lien>`) pour des événements live : watch party d'un comeback K-pop, match. On les partage sur Discord et Twitter.

---

## 5 indicateurs (définitions exactes)

1. **Activation J1** = nouveaux comptes du jour J qui ont envoyé au moins 1 message (dans n'importe quelle conversation, Global compris) avant J+1 00:00 UTC ÷ inscriptions du jour J. Cible ≥ 60 % à J7 (grille du rôle).
2. **Taux de premier lien social** = nouveaux comptes qui ont au moins 1 `FriendRequest.status = accepted` avant J+7 ÷ inscriptions de la cohorte. L'amitié automatique avec le parrain est exclue, pour mesurer l'organique.
3. **K-factor (7 jours)** = (invitations envoyées par utilisateur actif, c'est-à-dire liens tracés et d'affiliation créés ou partagés) × (inscriptions attribuées ÷ invitations). Mesuré par cohorte hebdomadaire. Il suppose #3693 et, pour le mobile, #3689.
4. **Rétention J7 / J30** = part de la cohorte d'inscription qui a au moins une activité qualifiante (un appel `recordActivity`) le 7e jour et le 30e jour, en UTC civil. Cibles : 40 % et 20 %.
5. **Série médiane à J14** = médiane de `currentStreakDays` parmi les comptes de la cohorte encore actifs à J14. Taux de partage des révélations = cartes partagées (`social.share` émis depuis la vue de révélation) ÷ révélations `ACHIEVEMENT_UNLOCKED` affichées.

## Calendrier de lancement — 6 semaines

| Sem. | Focus | Actions |
|---|---|---|
| S1 (29/09) | Pré-amorçage | Communautés de fandom et contenus du compte officiel publiés. Recrutement des ambassadeurs. Plafond anti-spam et modération du canal Global en place. Issues ouvertes pour le bouton partage de carte et la décision sur la récompense de parrainage. |
| S2 (06/10) | Lancement doux | Invitations vagues de 500 personnes (campus, Discords de fans). Défi de bienvenue dans Global. Équipe d'accueil en roulement de 12 h/24. |
| S3 (13/10) | Hook vocal | Reels démo sur TikTok (nano-créateurs par fandom). Promo text App Store sur le vocal. Watch party via `/chat/<lien>`. |
| S4 (20/10) | Partage | Livraison attendue de #3692 (partage IG/TikTok) et de la carte de succès. Défi « série de 7 jours ». |
| S5 (27/10) | Parrainage | Livraison attendue de #3689. Course entre campus (classement privé des ambassadeurs). Premier K-factor mesuré (#3693). |
| S6 (03/11) | Bilan | Analyse des cohortes S2 à S5. On coupe les boucles à K < 0,2 et on double la mise sur la meilleure. |

## Risques

- **Spam dans le canal Global** : il n'y a aucun plafond par compte (seulement 300 req/min par IP). Il faut, **avant S2**, un mode lent (1 message / 30 s dans Global), une restriction des liens pour les comptes de moins de 24 h, et une détection de doublons. À ouvrir en issue.
- **Modération** : ~200 membres aujourd'hui, des milliers au lancement. Il faut des modérateurs humains par langue (la traduction aide à lire, mais ne remplace pas le jugement), un signalement en un geste et un SLA de 1 h en S2-S3. La réponse de l'équipe au défi ne doit jamais ressembler à des faux comptes.
- **Mineurs de 16-17 ans** : un canal où tout le monde est ajouté d'office mélange mineurs et adultes. Il faut bloquer les DM non sollicités d'un adulte vers un mineur (demande d'ami obligatoire), ne pas exposer l'âge, et laisser la présence réservée aux amis (déjà le cas). Le clonage de voix est déjà protégé par consentement et vérification d'âge. La fiche App Store ne doit pas déclarer `ageAssurance` (rejet 1.0.0). Aucune incitation financière aux mineurs : pas de Meesh contre des inscriptions (RGPD, DSA, règles Apple sur les récompenses d'invitation).
- **Fraude au parrainage** : si une récompense forte est créée, il faut un plafond `maxUses`, une conversion qui compte seulement à l'activation (1er message) et non à l'inscription, et une détection de fermes de comptes.
- **Claims** : tout visuel est relu contre le § 6 de la fiche (76 langues, voix « qui ressemble », pas de chiffrement généralisé).
