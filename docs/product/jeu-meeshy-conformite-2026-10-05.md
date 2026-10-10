# Jeu Meeshy, vague 2 : contraintes de conformité

> Analyse de l'agent `conformite-juridique`, 5 octobre 2026. **Révision 2**, faite sur `dev` à `3d63a345cc`, après la relecture de la loi (`5b3f00acea`) et les deux cartes de parrainage, web (`1e8019c397`, `ab5a2cb078`) et iOS (`3d63a345cc`). Périmètre : issues #9384 à #9390 et #9392 (vague 2 du jeu), plus #7742 (carte 9:16 avec lien de parrainage). L'issue #9391 (garde des préférences d'administration, #8003) est fermée et sort du périmètre.
>
> **Ce document n'est pas un avis juridique signé.** Il relève les obligations, les écarts constatés dans le code et des options techniques. La section 6 dit ce qu'un juriste doit trancher, et pourquoi. L'issue GitHub reste la seule source d'état de chaque tâche.

Sources de conception : `docs/product/jeu-meeshy-conception.html`, parties II.7 (ligues et saisons), II.8 (badges, Atlas), II.9 (trophées, rareté), VI (moments photo), IX (garde-fous), XI (décisions) et XII.3 (carte partagée).

**Ce qui a changé depuis la révision 1.** La loi partagée a repris A-4 (pseudonyme tiré au sort), A-5 (filtre des noms réservés et d'identité), A-6 (instantané figé à 4 h), A-13 (aucune liste des Mythes), D-1 et D-2 (trois niveaux, défaut « amis », plafonds), D-3 (mois d'obtention pour un visiteur), E-2 (Atlas privé par défaut) et G-2 (rareté affichée dès 20 titulaires). La passerelle n'implémente encore **aucune** route de la vague 2 : ces contraintes sont tenues dans la loi, pas encore dans ce qui sert les données. La revue a aussi trouvé six écarts nouveaux, marqués **[nouveau]** : H-9, H-10, G-5, B-6 et D-5, A-14, F-6.

---

## 1. Le traitement réel, lu dans le code

| Fait | Où | Conséquence |
|---|---|---|
| La passerelle ne sert **aucune route** de la vague 2. Les chemins sont déclarés (`leagueConsent`, `leaguePseudonym`, `leagueWeek`, `leagueFriends`, `duo*`, `seasonSeal`, `showcase*`, `userShowcase`, `prestige`), mais aucun gestionnaire n'existe. Aucun modèle Prisma `League*`, `Season*`, `Trophy`, `Atlas` n'existe non plus. | `packages/shared/types/game-routes.ts` ; `services/gateway/src/services/game/` (seul `GloryService` touche à ces sujets) | Les contraintes déjà dans la loi restent à tenir au moment de servir : tri, blocages, audience, durée de conservation, purge, export. |
| L'inscription ne collecte **aucune date de naissance**. `User.birthDate` est facultatif. Les CGU ne disent **aucun âge minimum**. | `apps/web/src/routes/signup.tsx` ; `schema.prisma` ; `apps/web/src/institutional/terms.ts` | L'âge de la plupart des comptes est inconnu. |
| `leagueAccess` refuse la ligue publique sans **majorité vérifiée** (fail-closed). | `packages/shared/utils/game/league.ts` | C'est conforme. Le seuil de 18 ans est plus protecteur que nécessaire, et il doit rester tant que le juriste n'a pas tranché. |
| Le pseudonyme par défaut vient d'un **tirage** (`leaguePseudonymFromDraw`) que la passerelle doit tirer au CSPRNG, stocker et renouveler à chaque saison. Un tirage non fini rend `Colibri-0000`. | `league.ts` | Une valeur `NaN` ferait tomber tous les comptes sur le même pseudonyme. Le tirage passe par `crypto.randomInt`, et l'unicité se garantit côté serveur. |
| `checkLeaguePseudonym` refuse la forme, les noms réservés et l'identité (`username`, prénom, nom). **Il n'y a ni filtre d'injures, ni signalement, ni décision motivée.** | `league.ts` | A-5 n'est qu'à moitié tenu. |
| Les entrées de la ligue publique ne portent **ni `userId` ni présence**, seulement `displayName`, `weekPoints`, `zone`, `cup` et `isMe`. Le schéma déclare `snapshotDay`. | `packages/shared/types/game-v2.ts` (`leagueWeekEntrySchema`) | Bon contrat. Le schéma de réponse Fastify devra être strict (`additionalProperties: false`) pour que rien ne parte à côté. |
| Le consentement à la ligue a **sa propre porte** (`POST /me/game/league/consent`, `{ consent: boolean }`). Ce n'est pas la porte canonique `PUT /me/consents/{purpose}`, dont chaque finalité s'adosse à une colonne `User.*ConsentAt` horodatée par le serveur. | `game-routes.ts` ; `services/gateway/src/routes/me/consents.ts` (#4348, #4709) | Il y aurait deux écrivains de consentement, et un consentement absent de `GET /me/consents` et de l'export (A-14). |
| `capShowcaseVisibility` prend `gameHidden` en paramètre, mais **aucun réglage « Jeu masqué » n'est stocké**. `PrivacyPreferenceSchema` ne connaît pas le jeu. | `packages/shared/utils/game/trophies.ts` ; `packages/shared/types/preferences/privacy.ts` | Le mode « Jeu masqué » (IX) n'a pas encore de source. |
| `canViewShowcase` connaît `self`, `friend`, `other` et `admin`, **mais pas le blocage**. `partitionLeagueGroups` et `canInviteToDuo` n'ont **aucune entrée de blocage**. | `trophies.ts`, `league.ts`, `duo.ts` | Une vitrine réglée sur « tout le monde » s'ouvrirait à un compte bloqué, et deux comptes qui se sont bloqués pourraient tomber dans le même groupe (D-5, A-8). |
| Le Prestige remet le **niveau record** à 1. La ligue publique demande un record de 10 ou plus, et le duo un record de 20 ou plus. | `packages/shared/utils/game/prestige.ts` ; `league.ts` (`LEAGUE_MIN_LEVEL`) ; `duo.ts` (`DUO_MIN_LEVEL`) | Passer en Prestige ferme en silence la ligue et le duo (G-5). |
| Le coffre du jour donne 60 à 200 points, un fragment (1 chance sur 6) et un gel (1 sur 20). **Il ne donne jamais de Meesh**, et un témoin le garde. Mais les points frappent des Meeshes, et le registre connaît `transfer_in` et `transfer_out` (le don, #5750, ouvert). | `packages/shared/utils/game/chest.ts` ; `packages/shared/__tests__/game/no-money-invariants.test.ts` ; `MeeshLedger.reason` | Un gain du hasard nourrit, par les points, un actif transférable (F-6). |
| `GET /affiliate/validate/:token` est **public** et renvoie `id`, `username`, `firstName`, `lastName`, `displayName` et `avatar` du parrain. | `services/gateway/src/routes/affiliate.ts:469-600` | La carte publiée mène au nom civil du parrain (H-1, toujours ouvert). |
| Le crédit `social.link_visit` clé un visiteur non inscrit par `sha256(ip + "|" + user-agent)`, **sans clé**. | `services/gateway/src/routes/links/utils/link-visitor.ts:39` | C'est presque l'adresse IP en clair (H-6, toujours ouvert). |
| **[nouveau]** `POST /affiliate/track-visit` est public. Il écrit **en clair** l'IP, l'agent utilisateur, le référent, le pays et la langue du visiteur dans une ligne `UserPreference` rangée **sous l'identifiant du parrain**. La purge de 30 jours (`AffiliateTrackingService.cleanupExpiredSessions`) n'est **appelée nulle part**. | `services/gateway/src/services/AffiliateTrackingService.ts:40-60, 382` ; `cleanupExpiredData.ts` n'appelle que l'homonyme de `SessionService` | Les données de connexion d'un tiers non inscrit sont gardées sans limite de durée, et rattachées au compte d'une autre personne (H-9). |
| **[nouveau]** La mission quotidienne `share-link` (moyenne, 60 points) se remplit par **un** `social.share`, et la carte crédite `social.share`. `social.link_visit` n'a **pas de plafond** (`cap: null`). | `packages/shared/utils/game/missions.ts:90` ; `packages/shared/types/engagement-operations.ts:210-226` | Partager la carte rapporte une mission, puis des points sans limite à chaque visite (H-10). |
| La carte web porte le lien et la Flamme **sans aucun choix**. La carte iOS a un interrupteur pour la Flamme, mais pas pour le lien. Aucune des deux ne porte de nom. L'image ne part vers aucun serveur de Meeshy. | `apps/web/src/components/game-photo-flow.tsx`, `apps/web/src/lib/game-photo/{referral,share}.ts` ; `apps/ios/.../Game/Photo/GamePhotoFlowView.swift:261` | H-2 est tenu sur iOS pour la Flamme, et pas sur le web. |
| La chaîne d'usage de la caméra iOS parle de « messages, video calls, and AR » et **pas des selfies du jeu**. | `apps/ios/Meeshy/Info.plist:67` | Usage non annoncé (H-11). |
| La purge d'un compte supprimé **n'efface aucune table du jeu** (`MeeshLedger`, `GloryLedger`, `DailyMission`, `GameDay`, `EngagementQuota`), et l'export `GET /me/export` **n'en contient aucune**. | `services/gateway/src/services/AccountPurgeService.ts` ; `services/gateway/src/routes/me/export*.ts` | Écart aux art. 15, 17 et 20, toujours ouvert (I-1, I-2). |
| Le signal `foreign-language-message` lit la langue que le client déclare, **sans regarder le chiffrement** de la conversation. | `services/gateway/src/services/game/MessageGameSignals.ts:132-135` | L'Atlas hériterait de cet écart (E-3, toujours ouvert). |
| `social.contacts_synced` rapporte 5 points à la synchronisation du carnet. | `engagement-operations.ts:230` | Hors périmètre, mais à signaler : c'est une récompense pour téléverser des données de tiers (I-7). |

---

## 2. Référentiels mobilisés

- **RGPD**
  - Pseudonymisation : art. 4(5) et considérant 26. Une empreinte à clé reste une donnée personnelle.
  - Principes : art. 5(1)(a) à (e) (loyauté, finalité, minimisation, durée de conservation).
  - Bases légales : art. 6(1)(a) (consentement) et 6(1)(f) (intérêt légitime).
  - Consentement : art. 7(1) (il doit être démontrable) et art. 7(3) (le retrait doit être aussi simple que le don).
  - Mineurs : art. 8(1), au moins 16 ans par défaut. La France abaisse ce seuil à 15 ans (LIL, art. 45).
  - Catégories particulières : art. 9(1), et CJUE C-184/20 (2022) sur la révélation indirecte.
  - Information : art. 13.
  - Droits : art. 15 (accès), 17 (effacement), 20 (portabilité) et 21 (opposition).
  - Protection par défaut : art. 25(2). Par défaut, rien n'est rendu accessible « à un nombre indéterminé de personnes physiques sans l'intervention » de la personne.
  - Registre : art. 30. Analyse d'impact : art. 35, avec les lignes directrices WP248.
- **DSA**
  - Art. 14 (conditions générales) et art. 16 et 17 (signalement, motivation des décisions), applicables à tout hébergeur.
  - Art. 19 : les micro et petites entreprises sont dispensées de la section 3, qui contient l'art. 25 (interfaces trompeuses) et l'art. 28 (mineurs, avec ses lignes directrices de juillet 2025).
- **Code de la sécurité intérieure, art. L320-1** : un jeu d'argent et de hasard suppose l'espérance d'un gain dû au hasard **et** un « sacrifice financier » du participant.
- **Code civil, art. 9** : droit à l'image.
- **App Store Review Guidelines**
  - 1.2 : contenu généré par les utilisateurs (filtrage, signalement, blocage).
  - 3.1.1 : probabilités des objets aléatoires *achetés*.
  - 3.2.2(x) : ne pas conditionner une fonction ou une compensation à une action de l'utilisateur.
  - 5.1.1 : chaînes d'usage, suppression du compte dans l'app.
  - 5.1.2(vi) : les données issues des API caméra ou photo ne servent ni au marketing ni à la fouille de données.
- **Google Play** : règles Paiements (objets aléatoires achetés), Contenu généré par les utilisateurs, formulaire Sécurité des données, suppression de compte.
- **Licences** : NLLB-200 et MMS-TTS sont sous CC-BY-NC 4.0, ce qui est admis tant que Meeshy est gratuit (#9227).

---

## 3. Contraintes actionnables

Format : **Règle** · *Raison* · Source · État. **[B]** = bloque l'ouverture de la feature (section 4).

### A. Ligue publique (#9384)

- **A-1 [B] Consentement explicite, distinct, daté et réversible.**
  - La colonne est un `publicLeagueConsentAt DateTime?` posé par le serveur, avec la version de la notice. Jamais un booléen à côté d'une date.
  - Le retrait passe par un interrupteur unique et prend effet sur-le-champ : le joueur sort du groupe de la semaine. La garde serveur est fail-closed.
  - *Raison* : la base légale choisie (II.7, XI) doit être démontrable, et aussi simple à retirer qu'à donner.
  - Source : RGPD art. 6(1)(a), 7(1), 7(3).
  - État : à faire, passerelle.
- **A-2 [B] Notice au moment du consentement, en sept langues.**
  - Elle dit ce qui est montré (pseudonyme, ligue, total de la semaine figé chaque jour), à qui (jusqu'à 29 inconnus), combien de temps (A-9), le critère d'appariement (A-11) et comment se retirer.
  - Elle dit aussi le **risque résiduel** : l'écart d'un jour à l'autre montre que la personne a joué ce jour-là.
  - Source : RGPD art. 4(11), 13.
  - État : à faire.
- **A-3 [B] Mineurs : refuser quand l'âge est inconnu.**
  - La passerelle calcule `adultVerified` depuis `isAdult(birthDate)` et `ageVerifiedAt`, jamais depuis une valeur que le client envoie.
  - Pour abaisser le seuil plus tard, ajouter `isAtLeast(birthDate, years)` à `packages/shared/utils/age.ts`, fail-closed.
  - Source : RGPD art. 8(1) ; LIL art. 45.
  - État : la loi est conforme ; le branchement de la passerelle reste à faire.
- **A-4 [B] Pseudonyme par défaut tiré au CSPRNG, stocké, renouvelé à chaque saison, unique côté serveur.**
  - Tirer par `crypto.randomInt(0, 36 ** 4)`. Refuser un tirage non fini plutôt que de servir `Colibri-0000`.
  - La ligne de classement ne mène pas au profil : ni avatar, ni drapeau, ni langue.
  - *Raison* : un pseudonyme qu'on peut recalculer n'en est pas un, et même tiré au sort il reste une pseudonymisation, pas une anonymisation.
  - Source : RGPD art. 4(5), considérant 26, art. 25(1).
  - État : la loi est corrigée (`5b3f00acea`) ; le tirage et le stockage restent à faire côté passerelle.
- **A-5 [B] Le pseudonyme choisi est modéré.**
  - Ce qui est livré : `checkLeaguePseudonym` (forme, noms réservés, identité).
  - Ce qui manque :
    1. un filtre d'injures et de haine en sept langues à l'écriture ;
    2. un bouton « Signaler » sur chaque ligne d'un tiers ;
    3. le remplacement par le pseudonyme par défaut, avec une décision motivée visible par l'intéressé ;
    4. une voie de recours.
  - La passerelle passe aussi `email` et le numéro de téléphone (partie locale, chiffres) dans `forbidden`.
  - Si ces points ne sont pas prêts à l'ouverture, n'ouvrir que le pseudonyme par défaut et rejeter `pseudonym` dans `leagueConsentRequestSchema` avec `LEAGUE_PSEUDONYM_FORBIDDEN`.
  - Source : DSA art. 16 et 17 ; App Store 1.2 ; Google Play UGC.
  - État : partiel.
- **A-6 [B] Les autres membres sont servis depuis l'instantané, et le tri aussi.**
  - Le rang, la zone et la coupe des autres se calculent sur l'instantané de `snapshotDay`, jamais sur la valeur vive. Seule la ligne `isMe` est en direct.
  - Aucune notification « X t'a dépassé ».
  - L'instantané se lit à 4 h dans le **fuseau du groupe** (A-10), jamais dans celui du lecteur.
  - Source : CLAUDE.md § présence (« une SÉLECTION ou un ORDRE qui dépend de la présence révèle autant que le champ ») ; conception IX.
  - État : la loi est livrée ; le service reste à faire.
- **A-7 [B] Couper `showOnlineStatus`, activer `hideProfileFromSearch` ou passer en « Jeu masqué » suspend l'appartenance à la ligue publique.** Meo l'explique.
  - Source : RGPD art. 25(2) ; conception IX.
  - État : à faire. « Jeu masqué » n'a pas encore de champ (voir D-1).
- **A-8 [B] Deux comptes qui se sont bloqués, dans un sens ou dans l'autre, ne partagent jamais un groupe.**
  - Ajouter à `partitionLeagueGroups` une entrée de paires exclues, et un témoin.
  - Source : `isBlockedEitherWay` (`packages/shared/utils/presence-visibility.ts`).
  - État : écart, la loi n'a pas d'entrée de blocage.
- **A-9 [B] Durée de conservation bornée.**
  - `LeagueWeek`, `LeagueMembership` et les instantanés (pseudonymes et totaux d'autrui) se suppriment au plus tard 4 semaines après la fin de la saison.
  - Ne restent que les lignes propres au joueur : trophées, Gloire et ligue courante.
  - Source : RGPD art. 5(1)(c) et (e).
  - État : à faire.
- **A-10 Fuseau et heure de clôture par groupe, jamais par membre affiché.**
  - *Raison* : un fuseau affiché par membre révélerait une localisation.
  - Source : RGPD art. 5(1)(c).
  - État : la loi prend un `LeagueMoment` et ne tranche pas. C'est à la passerelle de passer celui du groupe.
- **A-11 La notice dit l'appariement par « activité comparable »** : c'est un profilage léger.
  - Source : RGPD art. 4(4), 13.
- **A-12 [B] AIPD, ou décision écrite et motivée de ne pas en faire, avant l'ouverture.**
  - *Raison* : évaluation et classement de comportements entre inconnus, avec des mineurs possibles.
  - Source : RGPD art. 35 ; WP248.
  - État : juriste (section 6).
- **A-13 Aucune liste globale des Mythes.** Seul un drapeau par compte, servi selon la visibilité du rang.
  - État : la loi est livrée (`mythicUserIds`, commentaire) ; le service reste à faire.
- **A-14 [B] [nouveau] Une seule porte de consentement.**
  - `POST /me/game/league/consent` écrit la **même** colonne que `PUT /me/consents/public-league`, qui devient une finalité de la porte canonique (#4348). Le consentement apparaît dans `GET /me/consents` et dans l'export.
  - *Raison* : deux écrivains divergent, et un consentement qu'on ne voit pas avec les autres ne se retire pas aussi simplement qu'il se donne.
  - Source : RGPD art. 7(1) et 7(3) ; `routes/me/consents.ts`.

### B. Ligue Amis et mission en duo (#9385)

- **B-1 L'audience est l'amitié acceptée, résolue par la loi de présence** (`PresenceVisibilityService`). Rien en cas de blocage.
  - État : la loi `friendsLeagueRanking` est livrée ; le service reste à faire.
- **B-2 [B] Droit d'opposition simple.**
  - Un interrupteur « Ne pas apparaître dans la ligue de mes amis », que « Jeu masqué » implique.
  - Source : RGPD art. 6(1)(f), 21.
- **B-3 [B] Si `showOnlineStatus = false`, les amis voient le total et la part de duo à la granularité du jour, sans horodatage.**
  - *Raison* : `duoProgress` expose un compteur `partner` qui, en direct, dirait quand l'ami a agi.
  - Source : CLAUDE.md § présence.
- **B-4 Duo sur invitation acceptée, quittable par chacun** (`duoTransition`).
  - État : la loi est livrée.
- **B-5 Aucune pression** : une notification de jeu par jour au plus, ni compte à rebours rouge, ni « ton ami t'attend ».
  - Source : conception IX ; DSA art. 25 (sous réserve de l'art. 19).
- **B-6 [nouveau] Le blocage annule l'amitié pour le jeu.**
  - `canInviteToDuo.areFriends` est faux dès qu'un blocage existe, et un blocage pendant un duo actif le termine (`abandoned`) sans rien dire de plus à l'autre.
  - Source : `isBlockedEitherWay`.

### C. Saison (#9386)

- **C-1 La rangée Sceau (10 Meeshes) et toute dépense de saison restent hors argent.**
  - Toute offre payante est une monétisation : elle est **précédée du remplacement de NLLB-200 et MMS-TTS** (#9227), et elle ouvre le droit de la consommation et les règles des stores sur les achats aléatoires.
  - Source : CC-BY-NC 4.0 ; #9227.
- **C-2 Les thèmes « une région » évitent drapeaux et territoires contestés.**
  - C'est de la prudence éditoriale ; voir aussi E-1.

### D. Vitrine du profil (#9387)

- **D-1 [B] Trois niveaux résolus côté serveur, avec « amis » par défaut.**
  - La loi est livrée : `gameVisibilitySchema` (vitrine, rang, trésor, Atlas), `SHOWCASE_DEFAULT_VISIBILITY = 'friends'`, valeur inconnue = « moi seul ».
  - Reste : stocker ces réglages et un **« Jeu masqué »** (`gameHiddenAt DateTime?` ou une clé de `privacy`). Rétrocompatible : un ancien client ignore le champ.
  - Source : RGPD art. 25(2) ; #5738 ; conception IX, XI.
- **D-2 `hideProfileFromSearch` plafonne à « amis », et « Jeu masqué » ramène à « moi seul »** (`capShowcaseVisibility`).
  - État : la loi est livrée ; le branchement reste à faire.
- **D-3 Ce qui part à côté de la vitrine suit le même réglage.**
  - Pour un visiteur : le mois d'obtention seulement (`visitorAwardedMonth`), et les compteurs, la Flamme, le niveau et le trésor suivent le niveau de visibilité.
  - Le schéma de réponse de `GET /users/:userId/game/showcase` est strict.
  - Source : leçon 275 ; RGPD art. 5(1)(c).
  - État : la loi est livrée.
- **D-4 L'Atlas n'entre jamais dans la vitrine sans son propre réglage (E-2).**
- **D-5 [B] [nouveau] Un blocage ferme la vitrine, même réglée sur « tout le monde ».**
  - Ajouter `'blocked'` à `ShowcaseViewer`, qui ne voit rien. Répondre `visible: false`, jamais une erreur.
  - Source : `resolvePresenceVisibility`.

### E. Atlas des langues (#9388)

- **E-1 Une langue peut révéler indirectement une origine ou une religion.**
  - Exemples : une langue minoritaire, diasporique ou liturgique.
  - Source : RGPD art. 9(1) ; CJUE C-184/20.
- **E-2 [B] Atlas privé par défaut, publication sur un choix séparé, avec une phrase de Meo.**
  - Jamais dans la ligue publique, jamais dans une liste ou un tri servi à autrui (« joueurs qui parlent X »).
  - État : la loi est livrée (`ATLAS_DEFAULT_VISIBILITY = 'me'`) ; le service reste à faire.
- **E-3 [B] Aucun tampon depuis une conversation chiffrée.**
  - Gate sur `encryptionEnabledAt` dans `MessageGameSignals`, pour l'Atlas comme pour la mission `foreign-language-message` déjà livrée.
  - Source : #9224 ; conception IX.
  - État : écart ouvert. À relire par `crypto-e2ee`.
- **E-4 Stocker la langue, les deux sens et la date, jamais l'interlocuteur ni la conversation.**
  - État : la forme d'`AtlasEntry` est conforme.
- **E-5 Effacement d'un tampon à la demande, et suppression avec le compte.**
  - Source : RGPD art. 17.

### F. Coffre à contenu aléatoire (vague 1, revu)

- **F-1 Aucun argent n'entre, aucun gain du coffre n'est une Meesh** (témoin `no-money-invariants`).
  - Source : CSI L320-1.
  - État : livré.
- **F-2 Probabilités affichées avant l'ouverture, en sept langues, et identiques à `CHEST_ODDS`.**
  - Source : App Store 3.1.1 ; Google Play Paiements (obligatoires seulement pour un achat).
- **F-3 Aucun coffre, clé ni accélérateur payant.**
  - Sinon : affichage des probabilités obligatoire, classification d'âge à refaire, et monétisation au sens de #9227.
- **F-4 Refaire les questionnaires de classification d'âge** (App Store Connect, IARC) à la publication du coffre et des ligues.
- **F-5 Si l'art. 28 du DSA s'applique, coffre et Flamme sont désactivables pour un compte mineur.**
- **F-6 [nouveau] Le chemin « hasard → points → Meesh → don » ne crée aucun marché.**
  - Le don de Meesh (#5750) se limite aux amis acceptés, sous un plafond par jour et par paire.
  - Les CGU interdisent la vente de comptes, de Meeshes et d'objets.
  - Toute conversion en argent, remise ou bien réel est exclue.
  - *Raison* : sans sacrifice financier, ce n'est pas un jeu d'argent. Mais un actif transférable alimenté en partie par le hasard est ce qu'un marché gris revend, et le régime des JONUM (loi SREN, 2024) vise les objets monétisables.
  - Source : CSI L320-1 ; loi n° 2024-449 (à vérifier par le juriste).

### G. Prestige, rareté, badges 1 000 et 5 000 (#9389, #9390, #9392)

- **G-1 Le Prestige demande une confirmation, et dit avant le geste ce qui repart à 1 et ce qui reste.**
  - Source : loyauté ; DSA art. 25 (sous réserve de l'art. 19).
- **G-2 Rareté affichée seulement à 20 titulaires et 1 000 comptes ou plus** (`rarityShareDisplayable`). Le dénominateur exclut les comptes supprimés.
  - État : la loi est livrée.
- **G-3 La Gloire est figée à l'obtention, et la notice le dit.**
- **G-4 Les compteurs 1 000 et 5 000 suivent la visibilité de la vitrine.**
- **G-5 [nouveau] Le Prestige ne ferme pas en silence la ligue et le duo.**
  - `prestigeTransition` remet `levelRecord` à 1, ce qui rend `leagueAccess` = `locked` et refuse le duo jusqu'aux niveaux 10 et 20.
  - Deux options :
    1. faire lire aux portes un record « tous cycles » (`prestige > 0` ⇒ ouvert) ;
    2. dire explicitement la perte d'accès dans la confirmation de G-1, et préciser si le consentement de ligue est gardé ou retiré.
  - *Raison* : une conséquence cachée d'un geste peu réversible est une interface trompeuse, et un consentement qui survit à une suspension non annoncée n'est plus éclairé.
  - Source : loyauté ; RGPD art. 7.

### H. Carte partagée avec lien de parrainage (#7742, XII.3)

- **H-1 [B] Le lien public ne livre plus le nom civil.**
  - `GET /affiliate/validate/:token` sert `displayName` (ou `username`) et l'avatar. `firstName` et `lastName` valent `null` pour un appelant non authentifié : le champ reste présent, pour la rétrocompatibilité.
  - Source : RGPD art. 5(1)(c), 25(2).
  - État : écart ouvert.
- **H-2 [B] Aperçu exact avant le partage, avec des choix.**
  - L'aperçu exact existe sur les deux plateformes.
  - La Flamme est retirable sur iOS (`flameOnCard`), **pas sur le web**.
  - Le lien n'est retirable **nulle part** : ajouter « Partager sans mon lien ».
  - Pour le consentement à l'affichage du pseudonyme : la carte ne porte aucun nom, et doit le rester. Si un nom y entre un jour, il faut un choix explicite, désactivé par défaut.
  - Source : RGPD art. 25(2) ; conception VI.
  - État : partiel.
- **H-3 Image du visage : aucun traitement côté serveur, aucune analyse du visage, aucun gabarit.**
  - *Raison* : une photo n'est une donnée biométrique que traitée pour identifier.
  - Source : RGPD art. 4(14), considérant 51.
  - État : conforme. L'image ne part que par la feuille de partage du système.
- **H-4 Une ligne de Meo rappelle le droit à l'image des personnes photographiées**, sans écran bloquant.
  - Source : Code civil art. 9.
- **H-5 Partager la carte ne rapporte rien de plus qu'un partage ordinaire.**
  - Pas de mission « partage ta carte », pas de déblocage.
  - Source : App Store 3.2.2(x).
- **H-6 [B] Visiteurs non inscrits : empreinte HMAC à clé tournante, purgée à la fin de la fenêtre de déduplication.**
  - Cible : `link-visitor.ts` et les seaux `visit:*` d'`EngagementQuota`.
  - Source : RGPD art. 4(5), 5(1)(e) ; #9225.
  - État : écart ouvert.
- **H-7 Conditions de Meta (« Sharing to Stories ») et de TikTok (Share Kit) sur les incitations** : à lire avant d'activer #3692.
- **H-8 Sans lien disponible, la carte part sans lien et sans faux lien.**
  - État : conforme sur les deux plateformes.
- **H-9 [B] [nouveau] `track-visit` ne garde plus l'IP en clair.**
  - Ne stocker ni l'IP, ni l'agent utilisateur, ni le référent. Si un rattachement est nécessaire, une empreinte HMAC (comme H-6) suffit.
  - Sortir la session de `UserPreference` du parrain, vers une collection dédiée avec un index TTL de 30 jours au plus.
  - Brancher la purge dans `cleanupExpiredData`, et purger l'existant.
  - *Raison* : les données de connexion d'un tiers non inscrit sont gardées sans durée et rangées sous l'identité d'une autre personne. Une carte publique multiplie ces visiteurs.
  - Source : RGPD art. 5(1)(c), 5(1)(e), 25(1).
  - La purge de l'existant en production attend le **feu vert du porteur**, après une sauvegarde vérifiée (#9223).
- **H-10 [nouveau] Plafonner `social.link_visit` et ne pas faire de la carte de parrainage la voie de la mission `share-link`.**
  - Un plafond par jour, comme les autres crédits sociaux.
  - La mission `share-link` reste un partage quelconque, et l'interface ne la présente pas comme « partage ta carte ».
  - *Raison* : une récompense sans plafond par visite pousse à diffuser le lien en masse, ce que les conditions des plateformes tierces encadrent comme du spam. Une mission remplie par le partage de la carte se rapproche de la compensation conditionnée que vise l'App Store.
  - Source : App Store 3.2.2(x) ; conditions Meta et TikTok (H-7).
- **H-11 [nouveau] Chaîne d'usage de la caméra et marketing.**
  - `NSCameraUsageDescription`, et ses traductions, mentionne les selfies des moments de jeu.
  - Meeshy ne réutilise **jamais** une carte ou un selfie partagé pour sa propre promotion (galerie de cartes, publicité), sauf avec une licence et un consentement séparés.
  - Source : App Store 5.1.1, 5.1.2(vi) ; RGPD art. 6, 7.

### I. Transverse

- **I-1 [B] La purge de compte couvre toutes les tables du jeu**, présentes et futures.
  - Tables présentes : `DailyMission`, `GameDay`, `EngagementQuota`, `MeeshLedger`, `GloryLedger`. Tables futures : ligues, saison, trophées, Atlas, cosmétiques, duo, carnet synchronisé.
  - Un témoin échoue si une table `userId` du jeu manque.
  - Source : RGPD art. 17 ; App Store 5.1.1(v) ; Google Play.
- **I-2 [B] Section `game` dans `GET /me/export`** : registres, missions, ligues propres, trophées, Atlas, réglages, consentement.
  - Source : RGPD art. 15, 20.
- **I-3 Registre des traitements : quatre fiches.**
  - Ligue publique (consentement) ; ligue Amis et duo (intérêt légitime) ; vitrine et Atlas ; visites de liens de parrainage (intérêt légitime, durée courte).
  - Source : RGPD art. 30.
- **I-4 Étiquettes App Store et formulaire Sécurité des données de Google Play** : contenu de jeu, interactions avec le produit, données liées à l'identité, sans suivi ; « Photos » seulement si le carnet se synchronise.
- **I-5 Politique de confidentialité et CGU** : une section jeu, **un âge minimum**, l'interdiction de vendre comptes, Meeshes et objets.
  - Source : RGPD art. 13 ; DSA art. 14.
- **I-6 Licences** : aucune feature de la vague 2 ne rend l'usage commercial tant qu'il n'y a ni publicité, ni offre payante, ni revente de données.
  - Le parrainage reste de la Gloire et des points, jamais de l'argent ni une remise.
  - **À surveiller** : un passe payant, un Sceau achetable, une saison sponsorisée.
- **I-7 [nouveau, hors périmètre] `social.contacts_synced` récompense le téléversement du carnet.**
  - Avec l'empreinte HMAC (#9225), les non-inscrits sont pseudonymisés, pas anonymisés.
  - Une récompense pour livrer les données de tiers pèse sur l'appréciation de l'intérêt légitime (voir la décision de la DPC contre WhatsApp, 2021). À soumettre au juriste avec la fiche du registre sur le carnet.

---

## 4. Bloquants avant l'ouverture

| Feature | Bloquants |
|---|---|
| Ligue publique (#9384) | A-1, A-2, A-3 (branchement passerelle), A-4 (tirage CSPRNG et stockage), A-5 (filtre d'injures, signalement, décision motivée), A-6 (tri sur l'instantané), A-7, A-8, A-9, A-12, A-14, I-5 (âge minimum) |
| Ligue Amis et duo (#9385) | B-2, B-3, B-6 |
| Vitrine (#9387) | D-1 (stockage et « Jeu masqué »), D-5 |
| Atlas (#9388) | E-2 (service), E-3 |
| Prestige (#9389) | G-5 (perte d'accès annoncée ou évitée) |
| Carte et parrainage (#7742) | H-1, H-2 (lien retirable partout, Flamme retirable sur le web), H-6, H-9 |
| Toutes | I-1, I-2, I-4 |

---

## 5. Écarts constatés : corrections et issues à ouvrir

Titres proposés, à ouvrir dans `isopen-io/meeshy` avec un milestone :

1. **« Le lien de parrainage public ne livre plus le nom civil du parrain »** (H-1)
   - `affiliate/validate` sert `firstName` et `lastName` à `null` pour un appelant anonyme, avec un témoin sur la route.
2. **« Une visite de lien de parrainage ne garde ni l'IP ni l'agent utilisateur, et s'efface après 30 jours »** (H-9)
   - `AffiliateTrackingService.trackAffiliateVisit` sans données en clair.
   - Collection dédiée avec un index TTL, purge branchée dans `cleanupExpiredData`.
   - Purge de l'existant en production sur feu vert du porteur, après sauvegarde.
3. **« Le visiteur d'un lien est clé par une empreinte HMAC tournante, purgée après la fenêtre »** (H-6)
   - Cibles : `link-visitor.ts` et les seaux `visit:*`.
4. **« Les visites d'un lien rapportent des points sous un plafond quotidien »** (H-10)
   - `social.link_visit`, `cap` non nul.
5. **« La carte partagée se partage sans lien ni Flamme, au choix, sur le web comme sur iOS »** (H-2)
6. **« Supprimer un compte efface ses données de jeu »** (I-1)
   - Avec un témoin d'exhaustivité.
7. **« L'export de mes données contient mon jeu »** (I-2)
8. **« Une conversation chiffrée ne nourrit ni l'Atlas ni la mission autre langue »** (E-3)
   - Relecture `crypto-e2ee`.
9. **« Le consentement à la ligue publique passe par la porte des consentements, daté et réversible »** (A-1, A-14)
   - Finalité `public-league`, colonne `publicLeagueConsentAt`.
10. **« Un blocage sépare les joueurs : groupe de ligue, duo, vitrine »** (A-8, B-6, D-5)
    - Entrée de blocage dans `partitionLeagueGroups`, `canInviteToDuo` et `canViewShowcase`.
11. **« Le mode Jeu masqué et les réglages de visibilité du jeu sont stockés et servis »** (D-1, A-7)
    - À relier à #5738.
12. **« Le Prestige ne ferme pas en silence la ligue et le duo »** (G-5)
    - Issue `décision-produit` entre les deux options.
13. **« Un pseudonyme de ligue choisi passe un filtre d'injures, se signale et se remplace par décision motivée »** (A-5)
14. **« Les CGU disent l'âge minimum et les règles du jeu »** (I-5)
    - Issue `décision-produit` assignée au porteur, rédaction par un juriste.
15. **« Les étiquettes de confidentialité des stores et la chaîne d'usage de la caméra déclarent le jeu »** (I-4, H-11)

---

## 6. Ce qu'un juriste humain doit trancher

| Question | Pourquoi un juriste |
|---|---|
| **Âge minimum du service et seuil de la ligue publique** (13, 15 ou 16 ans ; un seuil unique ou par pays) ; forme de la déclaration d'âge. | Engagement contractuel (CGU) ; seuils nationaux de l'art. 8(1) ; applicabilité incertaine de la loi française de 2023 sur la majorité numérique. |
| **Meeshy relève-t-il de l'art. 19 du DSA ?** | Cela décide si les art. 25 et 28, et leurs lignes directrices sur la gamification et le hasard, s'appliquent (B-5, F-5, G-1, G-5). |
| **AIPD de la ligue publique** ; consultation préalable de l'autorité si le risque résiduel reste élevé. | Qualification au titre de l'art. 35 et de la liste de la CNIL. L'art. 36 est une démarche auprès d'une autorité. |
| **L'Atlas rendu visible relève-t-il de l'art. 9 ?** | Qualification au cas par cas (C-184/20). Elle conditionne un consentement explicite au sens de l'art. 9(2)(a). |
| **Récompenses du parrainage et du partage** : la mission `share-link`, les points par visite, au regard de l'App Store 3.2.2(x), des conditions Meta et TikTok et des pratiques commerciales. | Textes contractuels de tiers, dont je ne peux pas garantir la version en vigueur. |
| **Don de Meesh et régime des JONUM** (loi SREN 2024) : un actif transférable alimenté en partie par un coffre gratuit. | Qualification d'un actif numérique ; rédaction de l'interdiction de revente dans les CGU. |
| **Récompense de la synchronisation du carnet** (I-7). | Appréciation de l'intérêt légitime envers les non-inscrits. |
| **Classification d'âge des stores** avec coffre gratuit, ligues entre inconnus et contenu généré. | Déclarations de l'éditeur. |
| **Toute monétisation** (passe, Meeshes achetables, cosmétiques payants, publicité). | Elle exige d'abord le remplacement de NLLB-200 et MMS-TTS (#9227), puis une revue du droit des jeux, des règles d'achat des stores et du droit de la consommation. |

Les agents `conformite-juridique`, `auditeur-adversarial` et `crypto-e2ee` outillent ces décisions. Ils ne remplacent ni un avis juridique signé, ni un audit tiers.
