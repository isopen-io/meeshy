# Jeu Meeshy, vague 2 : contraintes de conformité

> Analyse de l'agent `conformite-juridique`, 5 octobre 2026. Périmètre : issues #9384 à #9390 et #9392 (vague 2 du jeu), plus #7742 (carte 9:16 avec lien de parrainage). L'issue #9391 porte sur la garde des préférences d'administration (#8003) et sort de ce périmètre.
>
> **Ce document n'est pas un avis juridique signé.** Il relève des obligations, des écarts constatés dans le code et des options techniques. La section 6 dit ce qu'un juriste doit trancher, et pourquoi. L'issue GitHub reste la seule source d'état de chaque tâche.

Sources de conception : `docs/product/jeu-meeshy-conception.html`, parties II.7 (ligues et saisons), II.8 (badges, Atlas), II.9 (trophées, rareté), VI (moments photo), IX (garde-fous), XI (décisions) et XII.3 (carte partagée).

---

## 1. Le traitement réel, lu dans le code (dev, c9049fb82d, puis la loi des ligues afa794340f)

| Fait | Où | Conséquence |
|---|---|---|
| L'inscription ne collecte **aucune date de naissance**. `User.birthDate` est facultatif et n'est déclaré que pour le profil vocal. | `apps/web/src/routes/signup.tsx` ; `packages/shared/prisma/schema.prisma` (`birthDate`, `ageVerifiedAt`) | L'âge de la plupart des comptes est inconnu. Pour la ligue publique, on ne peut pas savoir qui est mineur. |
| Les CGU et la politique de confidentialité **n'indiquent aucun âge minimum**. | `apps/web/src/institutional/terms.ts`, `privacy.ts` | Aucune base contractuelle pour exclure les moins de 15 ou 16 ans. |
| `isAdult()` refuse quand l'âge est inconnu (fail-closed, 18 ans). | `packages/shared/utils/age.ts` | Le modèle de garde existe déjà. Il manque un seuil paramétrable (15 ou 16). |
| La préférence `privacy` ne porte **aucun réglage de visibilité du jeu**. Seuls `showOnlineStatus`, `showLastSeen`, `hideProfileFromSearch` et `notifyContactsOnReturn` touchent l'exposition. | `packages/shared/types/preferences/privacy.ts` | La règle « rang, trésor et vitrine : tout le monde / amis (défaut) / moi seul » (IX) n'a pas encore de champ. #5738 est ouverte, et sa recommandation est l'option 2 : les amis acceptés. |
| La visibilité de la présence obéit à **une loi unique** : soi, amis acceptés, ADMIN/BIGBOSS. Un blocage, dans un sens ou dans l'autre, masque tout. | `packages/shared/utils/presence-visibility.ts` (`resolvePresenceVisibility`) | Un classement mis à jour en direct révèle l'activité au même titre qu'un `lastActiveAt` (CLAUDE.md § présence : « une SÉLECTION ou un ORDRE qui dépend de la présence révèle autant que le champ »). |
| La purge d'un compte supprimé **n'efface aucune table du jeu** : ni `MeeshLedger`, ni `GloryLedger`, ni `DailyMission`, ni `GameDay`, ni `EngagementQuota`. | `services/gateway/src/services/AccountPurgeService.ts` | Les futures `LeagueMembership`, `SeasonProgress` et `Trophy` hériteraient du même trou. |
| L'export `GET /me/export` **n'inclut aucune donnée du jeu**. | `services/gateway/src/routes/me/export.ts`, `export-sections.ts` | Écart au droit d'accès (art. 15) et à la portabilité (art. 20). |
| Le coffre du jour est déterministe pour un compte et un jour donnés. Il rapporte 60 à 200 points, avec un fragment à 1/6 et un gel à 1/20, et **jamais de Meesh**. | `packages/shared/utils/game/chest.ts` | Aucun argent n'entre ni ne sort. Les probabilités sont fixes et affichables. |
| `GET /affiliate/validate/:token` est **public, sans authentification**, et renvoie `id`, `username`, `firstName`, `lastName`, `displayName` et `avatar` du parrain. | `services/gateway/src/routes/affiliate.ts:469-600` | Une carte publiée sur Instagram ou TikTok donne le **nom civil** du parrain à toute personne qui ouvre le lien. |
| Une visite sur un lien de parrainage crédite le parrain. Le visiteur non inscrit est clé par `sha256(ip + "|" + user-agent)`, **sans clé secrète**, et la clé est stockée dans `EngagementQuota.bucket`, **sans purge**. | `services/gateway/src/routes/links/utils/link-visitor.ts:39` ; `services/engagement/EngagementQuotas.ts:89` | Un hachage sans clé d'une adresse IPv4 se retrouve par force brute : c'est presque l'IP en clair, gardée sans limite de durée. Une carte publique multiplie ces visiteurs. |
| La langue d'un message est **celle que déclare le client**, y compris dans une conversation chiffrée. Le signal de jeu `foreign-language-message` la lit sans regarder le chiffrement. | `services/gateway/src/services/messaging/MessagingService.ts:350` ; `services/game/MessageGameSignals.ts:133` ; `messagePostSaveEffects.ts:480` | L'Atlas reposerait sur une métadonnée tirée de conversations E2EE (voir E-3). |
| Les étiquettes de confidentialité App Store **ne déclarent aucune donnée de jeu**. | `apps/ios/Meeshy.xcodeproj/APPLE_PRIVACY_LABELS.md` (dernière modification en mars 2026) | Il faut les mettre à jour avant la publication de la vague 2. |

---

## 2. Référentiels mobilisés

- **RGPD** : art. 4(5) (pseudonymisation) et considérant 26 ; art. 5(1)(b), (c) et (e) (finalité, minimisation, durée de conservation) ; art. 6(1)(a) et (f) (consentement, intérêt légitime) ; art. 7(3) (« Il est aussi simple de retirer que de donner son consentement ») ; art. 8(1) (consentement d'un enfant à « au moins 16 ans » pour un service de la société de l'information) ; art. 9(1) (catégories particulières : origine raciale ou ethnique, convictions religieuses…) ; art. 13 (information) ; art. 15, 17, 20 et 21 (accès, effacement, portabilité, opposition) ; art. 25(2) (par défaut, les données ne sont pas rendues accessibles « à un nombre indéterminé de personnes physiques sans l'intervention » de la personne) ; art. 30 (registre) ; art. 35 (analyse d'impact).
- **Loi Informatique et Libertés**, art. 45 : la France abaisse à **15 ans** l'âge du consentement de l'art. 8.
- **CJUE, 1er août 2022, C-184/20, OT** : des données qui peuvent révéler **indirectement** une catégorie de l'art. 9 relèvent de cet article. Voir aussi C-252/21, Meta Platforms, 4 juillet 2023 (inférences).
- **DSA** : art. 14 (conditions générales lisibles, en termes compréhensibles pour les mineurs quand le service s'adresse surtout à eux) ; art. 16 et 17 (signalement, motivation), applicables à tout hébergeur sans exception de taille ; art. 19 (les micro et petites entreprises sont dispensées de la section 3, donc des art. 25 et 28) ; art. 25 (interfaces trompeuses) et art. 28 (protection des mineurs), avec les lignes directrices de la Commission sur l'art. 28 (juillet 2025), qui traitent des fonctions persuasives et des objets aléatoires.
- **Code de la sécurité intérieure, art. L320-1** : un jeu d'argent suppose l'espérance d'un gain dû au hasard **et** un « sacrifice financier » du joueur.
- **App Store Review Guidelines** : 1.2 (contenu généré par les utilisateurs : filtrage, signalement, blocage, contact publié) ; 3.1.1 (« loot boxes » : les probabilités sont à afficher avant tout *achat*) ; 3.2.2(x) (ne pas exiger d'action de l'utilisateur, notation, avis, etc., en échange d'une fonction ou d'une compensation) ; 5.1.1 (chaînes d'usage des permissions, suppression de compte dans l'app).
- **Google Play** : règles Paiements (probabilités des objets aléatoires *achetés*), Contenu généré par les utilisateurs, formulaire Sécurité des données, suppression de compte.
- **Licences** : NLLB-200 et MMS-TTS sous CC-BY-NC 4.0, admis tant que Meeshy est gratuit (#9227).

---

## 3. Contraintes actionnables

Format : **Règle** · *Raison* · Source. Les contraintes marquées **[B]** bloquent l'ouverture de la feature (section 4).

### A. Ligue publique (#9384)

- **A-1 [B] Consentement explicite, distinct, daté et réversible.** Ajouter une colonne `leaguePublicConsentAt DateTime?` (jamais un booléen à côté d'une date, CLAUDE.md) avec la version de la notice acceptée. Aucun compte n'entre dans un groupe public sans cette date. Le retrait passe par un seul interrupteur, au même endroit que le consentement, et prend effet sur-le-champ : le joueur sort de la semaine en cours, et la garde côté serveur est fail-closed. · *Le consentement est la base légale choisie par la conception (II.7, XI). Il doit être démontrable et aussi simple à retirer qu'à donner.* · RGPD art. 6(1)(a), 7(1) et 7(3).
- **A-2 [B] Notice au moment du consentement.** Elle dit ce qui est montré (pseudonyme, ligue, total hebdomadaire), à qui (29 joueurs inconnus), pour combien de temps (A-9), et comment se retirer. Elle est disponible en sept langues. · *Sans information préalable, le consentement n'est pas éclairé.* · RGPD art. 4(11) et 13.
- **A-3 [B] Mineurs : la porte d'entrée refuse quand l'âge est inconnu ou sous le seuil.** La loi livrée (`leagueAccess`, `packages/shared/utils/game/league.ts`, commit afa794340f) exige une **majorité vérifiée** et rend `minor` quand elle manque. C'est conforme, et même plus protecteur que nécessaire : il faut le garder tant que le juriste n'a pas fixé de seuil. Pour l'abaisser plus tard à 16 ans (seuil par défaut de l'art. 8, qui couvre tous les États membres) ou à 15 ans en France, il faudra une fonction `isAtLeast(birthDate, years)` dans `packages/shared/utils/age.ts`, fail-closed comme `isAdult()`. La passerelle doit alimenter `adultVerified` depuis `isAdult(birthDate)` et `ageVerifiedAt`, jamais depuis un champ que le client déclare dans la même requête. La ligue Amis reste ouverte à tous. · *La ligue publique repose sur un consentement, et un compte d'âge inconnu peut être celui d'un enfant. Aucun âge minimum n'existe aujourd'hui dans les CGU.* · RGPD art. 8(1) ; LIL art. 45 ; DSA art. 28 (sous réserve de A-12).
- **A-4 [B] Pseudonyme par défaut : tiré au hasard et stocké, jamais dérivé de l'`userId`.** **Écart dans la loi livrée** : `defaultLeaguePseudonym(userId)` vaut `Colibri-` suivi de `fnv1a(userId + "|league-pseudonym") % 36^4`. C'est un hachage **sans clé et non cryptographique d'un identifiant public**. Or les ObjectId circulent : `affiliate/validate` renvoie `creator.id` à un visiteur anonyme, et les participants d'une conversation en reçoivent aussi. Quiconque connaît l'`userId` d'une personne calcule son pseudonyme et la retrouve dans la ligue publique, avec son total. Correction : tirer le pseudonyme au CSPRNG à l'entrée dans la ligue, le stocker (`LeagueMembership.alias` ou une colonne du compte), et le renouveler à chaque saison. À défaut, utiliser une clé : `HMAC(secret serveur, userId)`, ce qui reste une pseudonymisation. La ligne de classement ne mène pas au profil et ne montre ni avatar, ni nom, ni drapeau, ni langue. · *Un pseudonyme qu'un tiers peut recalculer n'en est pas un. Et même non dérivable, un pseudonyme reste une donnée personnelle : c'est une pseudonymisation, pas une anonymisation.* · RGPD art. 4(5), considérant 26, art. 25(1).
- **A-5 [B] Le pseudonyme libre est déjà permis par la loi livrée (`isValidLeaguePseudonym`), donc il faut une modération.** La forme est contrôlée (3 à 20 caractères, pas un numéro, pas une adresse web). Ce qui manque : (1) un filtre d'injures et d'usurpation à l'écriture, en sept langues, qui refuse aussi le `username`, le nom civil de l'utilisateur et les noms réservés (Meeshy, Mee, Meo, admin) ; (2) un signalement sur chaque ligne de la ligue publique ; (3) en cas de remplacement par la modération, un retour au pseudonyme par défaut et une décision motivée, visible par l'intéressé ; (4) une voie de recours. Si ces quatre points ne sont pas prêts à l'ouverture, n'ouvrir que le pseudonyme par défaut. · *Un pseudonyme choisi est une information fournie par l'utilisateur et vue par 29 inconnus : l'hébergeur doit permettre de la signaler et motiver ses décisions. L'App Store exige filtrage, signalement et blocage pour tout contenu généré par les utilisateurs.* · DSA art. 16 et 17 ; App Store 1.2 ; Google Play UGC.
- **A-6 [B] Le classement ne révèle aucune activité en temps réel.** Les autres membres voient un instantané figé une fois par jour, par exemple à 4 h dans le fuseau du groupe, et jamais un total qui bouge au fil des minutes. Seul le joueur voit son propre total en direct. Aucune notification du type « X t'a dépassé ». Le tri est calculé sur l'instantané servi, jamais sur la valeur vive. · *Un total qui monte à 14 h 03 dit que la personne était active à 14 h 03. C'est exactement la fuite par sélection ou par ordre que la loi de présence interdit hors amitié. Le « total hebdomadaire seul » de la conception ne suffit pas s'il est rafraîchi en direct.* · CLAUDE.md § présence (directive 2026-08-25) ; `resolvePresenceVisibility` ; conception IX « conformes à la règle de visibilité de la présence ».
- **A-7 [B] `showOnlineStatus = false`, `hideProfileFromSearch = true` ou le mode « Jeu masqué » excluent de la ligue publique,** ou bien suspendent l'appartenance jusqu'à ce que l'utilisateur change son réglage, avec une explication de Meo. · *Un réglage de discrétion ne se contourne pas par une surface nouvelle.* · RGPD art. 25(2) ; conception IX (« Jeu masqué »).
- **A-8 Deux comptes qui se sont bloqués, dans un sens ou dans l'autre, ne sont jamais dans le même groupe.** · *La loi de présence masque tout en cas de blocage (`isBlockedEitherWay`). Un classement commun recréerait un canal.* · `packages/shared/utils/presence-visibility.ts`.
- **A-9 [B] Durée de conservation bornée.** `LeagueWeek` et `LeagueMembership` (pseudonymes et totaux des autres) se suppriment à la fin de la saison, plus 4 semaines au plus. Ne restent que les lignes propres au joueur : `Trophy` et `GloryLedger`, jusqu'à l'effacement du compte. L'historique personnel ne garde pas la composition des groupes passés. · *Une fois la semaine close et les montées et descentes appliquées, les totaux d'autrui n'ont plus de finalité.* · RGPD art. 5(1)(c) et 5(1)(e).
- **A-10 Fuseau et heure de clôture par GROUPE, jamais par membre affiché.** · *Afficher l'heure de clôture locale de chaque membre révélerait son fuseau, donc une localisation approximative.* · RGPD art. 5(1)(c).
- **A-11 Formation des groupes « d'activité comparable » : la dire dans la notice,** sans afficher le critère d'appariement aux autres. · *C'est un profilage léger (art. 4(4)). Il ne produit aucun effet juridique, donc l'art. 22 ne s'applique pas, mais il doit être transparent.* · RGPD art. 13.
- **A-12 AIPD avant l'ouverture.** La ligue évalue et classe des comportements, entre inconnus, avec des mineurs possibles. Cela fait au moins deux critères de la liste du CEPD. · *L'analyse d'impact est probablement requise. Le juriste tranche (section 6).* · RGPD art. 35 ; lignes directrices WP248 rév. 01.
- **A-13 Rang « Mythe » (top 100 de la Gloire) : aucune liste globale publiée.** Le statut Mythe se montre selon la visibilité de la vitrine (D-1). Une liste des 100 n'existe que parmi les comptes qui ont consenti à la ligue publique. · *Publier un palmarès global exposerait des comptes qui n'ont rien consenti.* · RGPD art. 6 et 25(2) ; conception II.4.

### B. Ligue Amis et mission en duo (#9385)

- **B-1 Le périmètre est l'amitié acceptée, résolue par la même loi que la présence.** Pas de co-appartenance à une conversation ou à une communauté, et rien en cas de blocage. · *Une seule loi d'audience, déjà testée et gardée.* · `resolvePresenceVisibility`, `PresenceVisibilityService`.
- **B-2 La base légale est l'intérêt légitime, d'où un droit d'opposition simple.** Un interrupteur « Ne pas apparaître dans la ligue Amis » s'ajoute, et « Jeu masqué » l'implique. · *La ligue Amis est « toujours disponible » (II.7) : elle ne repose pas sur un consentement, donc l'opposition doit être possible sans motif à justifier.* · RGPD art. 6(1)(f) et 21.
- **B-3 Si `showOnlineStatus = false`, les amis voient le total à la granularité du jour (A-6), jamais en direct.** Même règle pour l'avancement du partenaire de duo : fait aujourd'hui ou non, et une progression arrondie, sans horodatage. · *Couper sa présence en ligne doit aussi couper le canal de jeu qui la révèle.* · CLAUDE.md § présence.
- **B-4 La mission en duo se fait sur invitation acceptée par les deux.** Chacun peut la quitter. Le départ d'un partenaire n'affiche rien de plus que « mission terminée sans duo ». · *Partager une progression est un échange de données entre deux personnes, qui ne s'impose pas.* · RGPD art. 5(1)(a) (loyauté).
- **B-5 Aucune pression sur le partenaire.** Pas de compte à rebours rouge, pas de relance « ton ami t'attend », une notification de jeu par jour au plus. · *Conception IX (« Contre l'excès »). C'est aussi la logique des interfaces trompeuses.* · DSA art. 25 (sous réserve de l'art. 19).

### C. Saison (#9386)

- **C-1 La rangée Sceau et toute dépense de saison restent hors argent.** Les Meeshes ne s'achètent pas et ne se convertissent pas. Toute offre payante (passe premium, Meeshes achetables) est une **monétisation** : elle doit être **précédée du remplacement de NLLB-200 et MMS-TTS** (#9227), et elle ouvre le droit de la consommation sur le contenu numérique, ainsi que les règles d'objets aléatoires payants des stores. · *Avec de l'argent, l'usage devient « commercial » au sens de CC-BY-NC 4.0.* · Licence CC-BY-NC 4.0 ; cadre porteur #9227.
- **C-2 Les thèmes « une région » évitent les territoires contestés et les drapeaux.** · *Risque de contenu, et indice d'origine (E-1).* · Prudence éditoriale (pas d'obligation textuelle).

### D. Vitrine du profil (#9387)

- **D-1 [B] Trois niveaux, avec « amis » par défaut, résolus côté serveur et fail-closed.** Ajouter un champ `gameVisibility: 'everyone' | 'friends' | 'self'` dans `PrivacyPreferenceSchema`, avec le défaut `'friends'`. Une valeur absente ou illisible vaut `'self'` pour un visiteur. La résolution passe par la loi de présence (amitié acceptée, blocage) et ne se réécrit nulle part ailleurs. Les anciens clients ignorent le champ, ce qui est rétrocompatible. · *Par défaut, rien n'est accessible à un nombre indéterminé de personnes. « Tout le monde » est un geste de l'utilisateur.* · RGPD art. 25(2) ; #5738 (option 2) ; conception IX et XI.
- **D-2 `hideProfileFromSearch = true` plafonne la vitrine à « amis ». « Jeu masqué » la ramène à « moi seul ».** · *Même règle que #8285 (« caché de la recherche ⇒ ses amis seulement »).* · CLAUDE.md § présence, exception #8285.
- **D-3 Ce qui part à côté de la vitrine est gardé aussi.** Les dates d'obtention, la longueur d'une Flamme, les compteurs d'accumulation, le niveau et le trésor suivent le même niveau de visibilité. Un visiteur ne reçoit pas l'horodatage précis d'un trophée : le mois suffit. · *Une Flamme de 365 jours ou une date d'obtention donnent le rythme d'usage. C'est la leçon 275 : une protection se mesure sur tout ce que la charge transporte.* · #5738 (tableau « ce qu'un trophée révèle ») ; RGPD art. 5(1)(c).
- **D-4 L'Atlas n'entre jamais dans la vitrine sans un choix séparé (E-2).**

### E. Atlas des langues (#9388)

- **E-1 Une langue n'est pas en soi une donnée de l'art. 9, mais elle peut en révéler une.** Une langue minoritaire ou diasporique (kurde, ouïghour, romani, tamoul, yoruba, etc.), ou une langue liturgique, peut laisser **inférer une origine ethnique ou une conviction religieuse**. Depuis l'arrêt C-184/20, une donnée qui peut révéler indirectement une catégorie particulière relève de l'art. 9. · *On ne peut pas exclure que l'Atlas, s'il est rendu public, constitue un traitement de l'art. 9(1).* · RGPD art. 9(1) ; CJUE C-184/20 ; C-252/21.
- **E-2 [B] L'Atlas est privé par défaut (« moi seul »),** quelle que soit `gameVisibility`. Le montrer demande un choix séparé et explicite, avec une phrase de Meo qui dit ce que la liste peut révéler. Pas de public par défaut, jamais dans la ligue publique, jamais dans une liste ou un tri servi à autrui (« joueurs qui parlent X »). · *C'est la seule configuration qui reste hors de l'art. 9 sans avoir besoin d'un consentement explicite au sens de l'art. 9(2)(a).* · RGPD art. 9(2)(a) et 25(2).
- **E-3 [B] Aucun tampon depuis une conversation chiffrée.** Le signal d'Atlas, comme le signal de mission `foreign-language-message` déjà livré, ignore les messages des conversations dont `encryptionEnabledAt` est posé. · *La langue d'un message chiffré est une métadonnée déclarée par le client. En faire un profil durable par compte contredirait « avec E2EE, le serveur ne voit jamais le clair » (#9224) et la conception IX (« seuls comptent les gestes que le serveur voit déjà »). L'écart existe déjà en vague 1 (`MessagingService.ts:350`, `MessageGameSignals.ts:133`).* · #9224 ; conception IX. À relire par l'agent `crypto-e2ee`.
- **E-4 Stocker la langue et la date du premier tampon, jamais l'interlocuteur.** Pas de `counterpartUserId`, ni de `conversationId` sur le tampon. La garde « reçu de quelqu'un qui l'écrit » se calcule au moment de l'échange et ne se conserve pas. · *L'Atlas n'a besoin que de la liste. Garder qui parle quelle langue créerait un fichier sur les tiers.* · RGPD art. 5(1)(c).
- **E-5 Effacement d'un tampon à la demande,** et suppression de l'Atlas avec le compte. · RGPD art. 17.

### F. Coffre à contenu aléatoire (vague 1, #9376, revu ici)

- **F-1 Invariant : aucun argent n'entre et aucun gain monnayable ne sort.** Le coffre ne contient jamais de Meesh, et ce qu'il donne (points, fragments, gels) n'est ni transférable ni convertible. Il faut un témoin de test qui garde `CHEST_ODDS` sans issue « Meesh » et sans transfert d'un fragment. · *Sans « sacrifice financier », ce n'est pas un jeu d'argent. Si un objet du coffre pouvait se donner (le don d'une Meesh existe, #5750), un marché gris l'en rapprocherait. Le régime des JONUM (loi SREN, 2024) ne vise que des objets monétisables.* · CSI art. L320-1 ; conception II.3 et II.5.
- **F-2 Les probabilités sont affichées avant l'ouverture, dans les sept langues, et ce sont celles du code (`CHEST_ODDS`).** · *Apple 3.1.1 et Google Play ne l'exigent que pour un achat, mais l'affichage est déjà décidé (XI) et doit rester exact.* · App Store 3.1.1 ; Google Play Paiements.
- **F-3 Aucun coffre payant, aucune clé achetable, aucun accélérateur payant.** Sinon : divulgation des probabilités obligatoire, questionnaires d'âge (IARC, App Store) à refaire, et monétisation au sens de #9227. · App Store 3.1.1 ; #9227.
- **F-4 Remplir à nouveau les questionnaires de classification d'âge** (App Store Connect, IARC) à la publication du coffre et des ligues, en déclarant le hasard gratuit sans y répondre « jeu simulé ». · *La classification doit refléter les fonctions réelles.* · Règles des stores (à confirmer par le juriste, section 6).
- **F-5 Mineurs :** si le juriste conclut que l'art. 28 du DSA s'applique (A-12, section 6), le coffre aléatoire et la Flamme doivent être désactivables ou absents pour les comptes déclarés mineurs. · Lignes directrices art. 28 (juillet 2025).

### G. Prestige, rareté, badges 1 000 et 5 000 (#9389, #9390, #9392)

- **G-1 Prestige : confirmer explicitement, et dire avant le geste ce qui repart à 1 (le niveau) et ce qui reste** (Gloire, trésor, rang). · *Pas d'interface trompeuse sur une action peu réversible.* · DSA art. 25 (sous réserve de l'art. 19) ; loyauté.
- **G-2 La rareté se calcule sur des agrégats, avec un seuil minimal.** Le dénominateur est le nombre de comptes actifs, sans les comptes supprimés ni anonymisés. Tant qu'un succès compte moins de *k* titulaires (proposition : *k* = 20), afficher « rareté en cours de mesure » plutôt qu'un pourcentage. · *À moins de 1 000 comptes, « mythique < 0,2 % » désigne 1 ou 2 personnes. Croisé avec une vitrine ou un succès lié à une langue rare (E-1), cela réidentifie.* · RGPD art. 5(1)(c), considérant 26.
- **G-3 La Gloire est figée à l'obtention, et la notice le dit.** · *Transparence : la rareté change, pas la récompense.* · Conception II.9.
- **G-4 Les compteurs d'accumulation (1 000, 5 000) suivent la visibilité de la vitrine (D-3).** · *« 5 000 messages » mesure une intensité d'usage.*

### H. Carte partagée avec lien de parrainage (#7742, XII.3)

- **H-1 [B] Le lien public ne livre pas le nom civil.** `GET /affiliate/validate/:token` ne sert plus que `displayName` (ou `username`) et un avatar **si** l'utilisateur l'a choisi pour sa carte. `firstName` et `lastName` ne partent plus vers un visiteur non authentifié. Côté client, il faut garder le contrat de manière rétrocompatible : servir `null`, pas une absence de champ. · *Une carte publiée sur Instagram ou TikTok rend le lien accessible à un nombre indéterminé de personnes. Le parrain croit partager un pseudonyme et livre son état civil.* · RGPD art. 5(1)(c) et 25(2).
- **H-2 [B] Aperçu exact avant le partage, avec des choix.** L'utilisateur voit la carte telle qu'elle partira, et peut retirer son nom (par défaut, la carte porte son `displayName`, pas son nom civil), la Flamme et la photo. · *La Flamme révèle un rythme d'usage. Publier est un geste de l'utilisateur, à condition qu'il voie ce qu'il publie.* · RGPD art. 25(2) ; conception VI (« Vie privée »).
- **H-3 Image du visage : aucun traitement côté serveur tant que la photo n'est pas publiée dans Meeshy.** Aucune analyse du visage, aucun recadrage automatique par détection de visage côté serveur. Si un jour une détection sert au cadrage sur l'appareil, elle reste locale et ne produit aucun gabarit conservé. · *Une photo n'est une donnée biométrique que lorsqu'elle subit un traitement technique spécifique d'identification.* · RGPD art. 4(14), considérant 51 ; conception VI.
- **H-4 Rappel du droit à l'image des tiers** au moment du selfie (« Les personnes présentes sur la photo sont d'accord ? »), une ligne de Meo, sans écran bloquant. · *Meeshy n'est pas responsable du cliché, mais la photo partagée en story devient du contenu hébergé.* · Code civil art. 9 ; DSA art. 16 (la story partagée est signalable comme toute story).
- **H-5 Partager ne rapporte rien de plus qu'un partage ordinaire.** Le crédit `social.share` est le même que pour tout partage. Aucune mission « partage ta carte », aucun déblocage, aucun coffre ou Meesh conditionné au partage. · *L'App Store interdit de conditionner une fonction ou une compensation à une action de l'utilisateur. Le partage social n'est pas nommé dans la liste, mais la clause « ou d'autres actions similaires » le couvre probablement si la récompense est spécifique.* · App Store 3.2.2(x).
- **H-6 [B] Visiteurs non inscrits du lien : empreinte à clé, à courte durée.** Remplacer `sha256(ip|ua)` par `HMAC(clé secrète tournante, ip|ua)`, la clé tournant au moins à chaque fenêtre `dedupHours`. Purger les seaux `visit:*` d'`EngagementQuota` à l'expiration de la fenêtre (index TTL ou purge planifiée). · *Un hachage sans clé d'une IPv4 se renverse. Une empreinte à clé reste une pseudonymisation, pas une anonymisation, mais elle limite le risque. Une conservation sans fin n'a aucune finalité au-delà de la déduplication.* · RGPD art. 4(5), 5(1)(e), considérant 26 ; cadre porteur #9225 (même doctrine que le carnet).
- **H-7 Partage vers Instagram et TikTok (#3692) : vérifier les conditions des plateformes** (Meta « Sharing to Stories », qui exige un App ID, et TikTok Share Kit) sur les **incitations au partage** et l'usage des liens. · *Je n'ai pas le texte en vigueur sous les yeux. À vérifier avant d'activer un crédit lié à ces cibles.* · Conditions développeur Meta et TikTok (à lire par le juriste).
- **H-8 Sans lien disponible, la carte part sans lien, comme le prévoit XII.3, et sans placeholder qui ressemblerait à un lien.** · *Aucune donnée inventée.* · Conception XII.3.

### I. Transverse

- **I-1 [B] Effacement : la purge de compte couvre toutes les tables du jeu.** Ajouter à `purgeAccountIsolatedData` les tables `DailyMission`, `GameDay`, `EngagementQuota`, `LeagueMembership`, `SeasonProgress`, `Trophy`, l'Atlas, les possessions cosmétiques et le carnet photo synchronisé. Pour `MeeshLedger` et `GloryLedger`, deux options : supprimer, ou conserver sous l'identifiant du compte anonymisé. Pour les lignes de don qui portent un `actorId` tiers, l'agrégat peut survivre sans l'identité. · *Droit à l'effacement. Apple et Google exigent aussi la suppression du compte et de ses données depuis l'app.* · RGPD art. 17 ; App Store 5.1.1(v) ; Google Play, suppression de compte.
- **I-2 [B] Export : ajouter une section « jeu » à `GET /me/export`** (registres, missions, ligues propres, trophées, Atlas, préférences de visibilité, consentement de ligue). · RGPD art. 15 et 20.
- **I-3 Registre des traitements : quatre nouvelles fiches.** Ligue publique (consentement), ligue Amis et duo (intérêt légitime), vitrine et Atlas (intérêt légitime, choix utilisateur), visites des liens de parrainage (intérêt légitime, durée courte). · RGPD art. 30.
- **I-4 Étiquettes de confidentialité App Store et formulaire Sécurité des données Google Play** : déclarer « Contenu de jeu » et « Interactions avec le produit », liés à l'identité et non utilisés pour le suivi ; « Photos » seulement si la synchronisation du carnet est activable. · App Store Connect, App Privacy ; Google Play, Sécurité des données.
- **I-5 Politique de confidentialité et CGU** : ajouter une section jeu (ligues, pseudonyme, durées, Atlas, carte et parrainage, coffre gratuit sans valeur), **un âge minimum**, et l'interdiction de vendre comptes, Meeshes ou objets. · RGPD art. 13 ; DSA art. 14.
- **I-6 Licences** : aucune feature de la vague 2 ne rend l'usage « commercial » tant qu'il n'y a ni publicité, ni offre payante, ni revente de données. Le crédit de parrainage reste de la Gloire et des points, jamais de l'argent ni une remise. **À surveiller** : tout passe payant, sceau achetable ou partenariat de marque sur une saison. · CC-BY-NC 4.0 ; #9227.

---

## 4. Bloquants avant l'ouverture

Ce qui doit être livré, ou tranché, avant qu'une feature soit visible en production :

| Feature | Bloquants |
|---|---|
| Ligue publique (#9384) | A-1, A-2, A-3, A-4 (pseudonyme dérivable, écart dans la loi livrée), A-5 (modération du pseudonyme libre), A-6, A-7, A-9, A-12 (AIPD ou décision motivée de ne pas en faire), I-1, I-2, I-5 (âge minimum) |
| Ligue Amis et duo (#9385) | B-2 (opposition), B-3, I-1 |
| Vitrine (#9387) | D-1, D-2, D-3 |
| Atlas (#9388) | E-2, E-3, E-4 |
| Carte et parrainage (#7742) | H-1, H-2, H-6 |
| Toutes | I-1, I-2, I-4 |

---

## 5. Écarts constatés : corrections et issues à ouvrir

Titres proposés, à ouvrir dans `isopen-io/meeshy` avec un milestone :

1. **« Le pseudonyme de ligue par défaut ne se recalcule plus depuis l'identifiant du compte »** : alias tiré au CSPRNG et stocké, ou HMAC à clé serveur, avec un témoin qui interdit `fnv1a(userId…)` dans `defaultLeaguePseudonym`. (A-4, `packages/shared/utils/game/league.ts:129`)
2. **« Un pseudonyme de ligue choisi passe un filtre, se signale et se remplace par décision motivée »**. (A-5)
3. **« Le lien de parrainage public ne livre plus le nom civil du parrain »** : il sert `displayName` ou `username`, `firstName` et `lastName` passent à `null`, avec un test sur la route `affiliate/validate`. (H-1)
4. **« Le visiteur d'un lien de parrainage est clé par une empreinte HMAC tournante, purgée après la fenêtre de déduplication »** : `link-visitor.ts`, et un TTL sur les seaux `visit:*` d'`EngagementQuota`. (H-6)
5. **« Supprimer un compte efface ses données de jeu »** : `AccountPurgeService` couvre les tables du jeu, avec un témoin qui échoue si une table `userId` du jeu manque. (I-1)
6. **« L'export de mes données contient mon jeu »** : section `game` dans `GET /me/export`. (I-2)
7. **« Une conversation chiffrée ne nourrit ni l'Atlas ni la mission "autre langue" »** : gate sur `encryptionEnabledAt` dans `MessageGameSignals`, avec relecture par `crypto-e2ee`. (E-3)
8. **« Le jeu a un réglage de visibilité : tout le monde, amis (défaut), moi seul »** : `gameVisibility` dans `PrivacyPreferenceSchema`, résolu côté serveur et fail-closed. (D-1, à relier à #5738)
9. **« Rejoindre la ligue publique demande un consentement daté, réversible d'un geste, et la majorité vérifiée côté serveur »** : `leaguePublicConsentAt` avec la version de la notice, et `adultVerified` calculé par la passerelle (la loi `leagueAccess` le demande déjà). (A-1, A-3)
10. **« Les CGU disent l'âge minimum et les règles du jeu »** : issue `décision-produit` assignée au porteur, rédaction par un juriste. (I-5)
11. **« Les étiquettes de confidentialité des stores déclarent les données du jeu »** : à faire au moment de la soumission. (I-4)

---

## 6. Ce qu'un juriste humain doit trancher

| Question | Pourquoi un juriste |
|---|---|
| **Âge minimum du service et seuil de la ligue publique** (13, 15 ou 16 ans ; un seuil unique ou par pays) ; forme de la déclaration d'âge. | C'est un engagement contractuel (CGU). Le seuil varie selon les États membres (art. 8(1), LIL art. 45). La loi française de 2023 sur la « majorité numérique » (15 ans pour les réseaux sociaux) a une applicabilité incertaine au regard du droit de l'Union. |
| **Meeshy est-il une micro ou petite entreprise au sens de l'art. 19 du DSA ?** | Cela décide si les art. 25 (interfaces trompeuses) et 28 (mineurs), avec leurs lignes directrices sur la gamification et les objets aléatoires, s'appliquent formellement. Les contraintes F-5 et B-5 en dépendent. |
| **L'AIPD est-elle requise pour la ligue publique ?** Si oui, faut-il consulter l'autorité ? | Qualification au titre de l'art. 35 et de la liste de la CNIL. Une consultation préalable (art. 36) est une démarche auprès d'une autorité. |
| **L'Atlas public relève-t-il de l'art. 9 ?** | C'est une qualification au cas par cas, à la lumière de C-184/20. Elle conditionne la base légale (consentement explicite, art. 9(2)(a)) si la publication est un jour permise. |
| **Les incitations au partage et au parrainage** au regard de l'App Store (3.2.2), des conditions Meta et TikTok, et du droit de la consommation (pratiques commerciales). | Ce sont des textes contractuels de tiers, dont je ne peux pas garantir la version en vigueur. |
| **Classification d'âge des stores** avec coffre aléatoire gratuit, ligues entre inconnus et contenu généré par les utilisateurs. | Les réponses aux questionnaires sont des déclarations de l'éditeur. |
| **Toute monétisation** (passe de saison, Meeshes achetables, cosmétiques payants, publicité). | Elle exige d'abord le remplacement de NLLB-200 et MMS-TTS (#9227), puis une revue du droit des jeux (L320-1, JONUM), des règles d'achat des stores et du droit de la consommation. |

Les agents `conformite-juridique`, `auditeur-adversarial` et `crypto-e2ee` outillent ces décisions. Ils ne remplacent ni un avis juridique signé, ni un audit tiers.
