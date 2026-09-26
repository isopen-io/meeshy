# @meeshy/web-v2

## 2.5.0

### Minor Changes

- Changements automatiques détectés :

  - défiler vers les anciens ferme d'abord le clavier ; la bulle « retour en bas » ne se replie plus — run test
  - défiler vers les anciens ferme d'abord le clavier ; le bouton « revenir en bas » ne se replie plus
  - le fil ne montre plus la capsule « Messages récents » — la bulle de retour en bas suffit — run test
  - configurer une conversation depuis la fiche d'un membre, sans en être membre (Closes #7999)
  - la pill de jour démarre sous la hauteur MESURÉE de l'en-tête (#7998) — run test
  - la barre d'outils du composer défile au lieu d'élargir l'écran en Dynamic Type XXXL — run test
  - en Script et Focal, le contenu s'aligne sur ses citations, l'avatar seul dans sa marge — run test
  - une réponse reçue en direct garde sa citation — l'écho message:new ne la jette plus
  - en Script et Focal, le contenu s'aligne sur ses citations, l'avatar seul dans sa marge
  - la feuille de profil se referme dans le geste qui ouvre la page complète
  - un double appui sur Envoyer n'envoie plus l'emoji revenu sous le doigt — run test
  - le démarrage à froid ne construit plus la pile d'appel ; la profondeur du type de la racine est plafonnée — run test
  - le nom de l'auteur d'un message d'historique ouvre de nouveau son profil
  - trois emojis rapides en permanence, envois en série, retour après envoi adouci (#7985)
  - les emojis partent en série — le filet de dédoublonnage par contenu épargne un message d'emojis seuls — run test (Refs #7985)
  - la barre de langue d'une publication prend rounded-full, rounded-pill n'existe pas
  - les gardes suivent le panneau des effets de #7967 — clés mortes retirées, seule la barre choisit la protection — run test
  - le retour de la coque Android se réarme après une sortie (#7988)
  - repartager une publication depuis la carte du Flux, la publication citée se lit en carte
  - repartager depuis le Flux ouvre une confirmation avant d'envoyer (Refs #6278)
  - trois emojis rapides en permanence, envoi en série sans dédoublonnage de contenu, retour après envoi adouci — run test (Refs #7985)
  - le composeur suit iOS — emojis rapides en cadre sur tout le côté droit, trois au focus, effets en petit panneau (#7980)
  - le cliquet des couleurs admet le filet de citation partagé (433 → 434)
  - une story retirée et un éphémère expiré atteignent GRDB, conversation ouverte ou fermée — run test
  - le retrait d'une story citée s'annonce aux conversations qui la citent ; une citation d'éphémère expiré est scellée
  - « Vous » se décide sur l'identité utilisateur servie avec l'aperçu — run test
  - la liste dit « Vous » sur l'identité utilisateur servie avec l'aperçu
  - en Focal, aucune pastille du message magnifié ne recouvre plus de texte ; la carte de story citée porte le filet de citation — run test
  - seul index.html reçoit le réglage de la barre du navigateur (#7970)
  - finir la carte citée d'un repost — pastille de Prisme, vignette « +N », geste optimiste mesuré au pixel, extraction sous budget (Refs #6278)
  - le script d'amorçage allume la barre du thème choisi (#7970)
  - la story supprimée se rend « Story indisponible » depuis postReplyTo.deletedAt — run test
  - check-curve relit slots(for:) paramétré par maxWidth — le gate suit #7881
  - au focus, trois emojis rapides sur une rangée ; les effets s'ouvrent en panneau comme la durée éphémère — run test (#7966, #7967)
  - la traduction de mon propre message ne remplace plus « Vous » par mon nom dans la liste (#7952)
  - le cadre des emojis rapides prend tout le côté droit du composeur — run test (#7961)
  - Script et Focal — média sous l'avatar, crayon « modifié » visible, texte atténué lisible en sombre, témoins de rendu qui ne plantent plus — run test
  - un favori posé ou retiré d'un autre appareil suit conversation fermée — run test
  - « ma réaction » se lit sur la page de messages, plus aucun GET /reactions/:id (#7936)
  - les témoins de la citation recompilent — la fusion de #7929 avait mangé la fermeture d'un bloc
  - referme le test et le describe que la fusion de #7944 avait tronqués dans quoted-preview.test.ts
  - la suite SDK recompile — StoryCanvasInlineEditTouchPolicyTests passe sur le MainActor comme la règle qu'elle teste (#7943)
  - referme le bloc de test tronqué par la fusion eaa49e30 dans quoted-preview.test.ts
  - « Mes stickers » dans le composeur — créer depuis une image ou un collage, envoyer en un geste (#7938)
  - le profil d'un auteur s'ouvre par-dessus l'écran courant (#7946)
  - port « Mes stickers » et préparation d'une image collée ou choisie (#7938)
  - en Script et Focal, le contenu part sous l'avatar et seules les citations sont en retrait
  - solde les sept avertissements de concurrence Swift 6 relevés sur dev
  - le témoin de colonne centrée attend jusqu'à 20 s sur un runner lent — run test
  - réactions, modifications et suppressions suivent en direct (run test)
  - cinq emojis rapides sur deux rangées, l'appui long ouvre la feuille des emojis — run test (#7931)
  - la coque Android déclare la requête IMAGE_CAPTURE (#7930)
  - story disparue « indisponible », citations alignées et citation d'un média en Script/Focal — run test
  - réactions, édition et suppression d'un message suivent en direct
  - dev reçoit le dernier correctif de #7885 — chaînes mortes de la pastille retirées, témoin de la Recherche à jour — run test
  - chaînes mortes de la pastille retirées, témoin de la Recherche à jour — run test (#7884, #7921)
  - onboarding — carte du courriel, points servis élan compris, récapitulatif sans chiffres inventés
  - une story citée sans instantané est « indisponible » — prédicat unique et cache aligné (Refs #7895)
  - onglet « Personnalisés », lieu à la position exacte, autour de soi et sur la carte — run test (#7921, #7922)
  - carte « valide ton adresse », refus définitif d'une story, crédit réel, célébrations et permission différées — run test
  - bouton d'envoi dès qu'il y a du texte, tuiles du (+) réduites, emojis rapides en verre — run test (#7884)
  - le passage prononcé d'un vocal passe en gras à l'encre primaire, lisible sur chaque fond
  - squelette — étape email, champs de vérification et refus définitif d'une story (SDK)
  - le nom affiché tiré d'une adresse ne garde que ses lettres — une adresse à chiffres s'inscrit enfin, run test (Closes #7912)
  - réactions d'une pièce jointe et coins de la tuile protégée en grille
  - les réactions d'une pièce s'affichent sur cette pièce, en direct
  - la coque annonce une version publiée sur le magasin (#6937)
  - nom affiché et pseudo en saisie directe, mot de passe expliqué à la demande
  - nom affiché et pseudo en saisie directe, prénom et nom hors de l'inscription
  - la coque Android reçoit ses notifications par FCM natif, application fermée (Refs #7307)
  - recette du verre nonisolated + témoin inscrit au projet — run test (#7884)
  - un lien meeshy.me ouvre la coque Android sur son écran
  - l'inscription montre prénom, nom, nom affiché et pseudo en saisie directe
  - VoiceOver lit l'aperçu d'une conversation sans la notation markdown
  - chiffres, préférences éditables et conversations triables dans la fiche d'un membre
  - statistiques, préférences et tri des conversations d'un membre
  - toutes les vidéos et sons d'une scène suivent sa timeline, en lecture comme au seek (#7879)
  - sticker sans débord, citations de story, d'humeur et de pièce nommée
  - la tuile protégée d'une grille se lit sur la boîte noire des Bulles
  - le fond vidéo BOUCLÉ suit le doigt pendant le parcours d'une scène — run test
  - quoter le chemin UniversalComposerBar+Format.swift du pbxproj — run test
  - carrousel d'images et métadonnées complètes sur le profil d'un membre
  - une réponse à une story ne s'applique que dans le DM de son auteur — run test
  - mes stories ne tracent que les barres des stories en cours — run test (#7887)
  - la fiche d'un membre sert sa bannière avec son avatar
  - le verre du champ n'est pas interactif, le curseur reste au doigt — run test (#7884)
  - la barre de composition repose sur un panneau de verre liquide — run test (#7884)
  - la pause d'un glissé se pose sans réécrire le reflet de la pause hôte
  - la barre du réel à scène et celle de la story se parcourent au doigt
  - la loi de la piste parcourue quitte media-transport.ts pour seek-track.ts (#7879)
  - le segment actif d'une story se parcourt au doigt — l'avance attend, la scène suit (#7879)
  - la barre d'un réel à scène se parcourt au doigt — elle s'agrandit, la scène suit (#7879)
  - une scène se parcourt au doigt — ScenePlaybackScrubber jusqu'au canvas du lecteur
  - le moteur de scène remet son horloge à l'hôte et recale ses médias au temps pointé (#7879)
  - la PWA installée tourne en paysage comme les coques (#7877)
  - l'horloge de scène se parcourt — seek, subscribeSeek, now (#7879)
  - les listes d'administration montrent la photo par la loi partagée, et le budget du catalogue d'administration est remesuré (Refs #7873)
  - la fiche d'un membre s'organise en onglets — profil, conversations, médias, contacts, communautés, profil vocal, sécurité, signalements (Refs #7845, #7873)
  - décodeurs du dossier d'un membre (contacts, communautés, voix, sessions, sécurité, signalements) (Refs #7845)
  - la liste des conversations se trie dans les deux ordres et se filtre par type et état (Refs #7873)
  - l'administration prend toute la largeur, menu latéral repliable, comptes et anonymes en tableaux triables (Refs #7873)
  - un ban jamais levé est ABSENT de liftedAt — listActiveBans et le balayage l'apparient enfin (Refs #7999)
  - la garde des surfaces de lecture déclare announceCitedPostWithdrawal — run test
  - chaque aperçu de dernier message porte l'identité utilisateur de son auteur
  - la citation d'une story supprimée par son auteur sort expurgée, marquée postReplyTo.deletedAt
  - une réponse à une story ne vit que dans le DM de son auteur ; un sticker seul est un corps
  - la liste des messages et /sync servent à nouveau mes réactions par message (#7936)
  - routes /api/v1/me/stickers — créer depuis une image, lister, utiliser, retirer (#7938)
  - bibliothèque « Mes stickers » — modèle UserSticker, normalisation serveur, stickerId de message (#7938)
  - l'édition d'une réponse passe sa citation par la garde unique
  - la citation d'un message supprimé ne sert plus son texte
  - première story sans courriel vérifié, et l'état d'onboarding qui le dit
  - /me/engagement sans balayage de base, et « premier message » après un premier message
  - la story citée doit être visible par l'expéditeur de la réponse
  - une réponse à une story n'est admise que si son auteur est membre de la conversation
  - l'administration lit les communautés et le profil vocal d'un membre, et la fiche d'un anonyme (Refs #7873, #7845)
  - définition d'un sticker de bibliothèque — types, bornes, reniflage (#7938)

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.26.0

## 2.4.0

### Minor Changes

- Changements automatiques détectés :

  - l'export des données passe par le portail de livraison (#7864)
  - le gate du manifeste Android ne compte que les déclarations effectives, et ne se tait plus lancé par un lien (Closes #7869)
  - le gate exige exactement une déclaration par permission, jamais commentée (Closes #7844-residual)
  - un second texte pendant le vol du premier n'est jamais `done` (Refs #7534)
  - l'auteur modifie le texte de sa publication depuis le menu « ⋯ » (Closes #7534)
  - une story de plusieurs scènes composée sur le web part en autant de stories (Closes #7707)
  - une story de plusieurs pages part en autant de stories (Refs #7707)
  - la coque Android enregistre sa story par MeeshyShare.shareFile (#7863)
  - markdown léger, liens www./courriel et barre de format du compositeur (#7849)
  - gras, italique, souligné, barré en un geste dans le compositeur (#7849)
  - rendu du markdown léger et liens Meeshy ouverts dans l'app (#7849)
  - code inline, liens markdown, www., courriels et blocs dans le découpage d'un message (#7849)

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.25.0

## 2.3.0

### Minor Changes

- Changements automatiques détectés :

  - la recherche @ trouve toutes les personnes mentionnables, et aucune que l'envoi refuserait
  - taper @ montre d'abord ses contacts depuis le cache, puis cherche les autres dès la 2e lettre — dans tous les champs qui mentionnent, run test
  - toucher un participant actif de l'en-tête ouvre sa story non vue, sinon son profil — run test
  - dev repasse sous ses gardes — racine iPad à 24 niveaux, glyphe du lien en attente relatif, cliquet du catalogue à 262 — run test (Refs #7808 #7811 #7797)
  - le cliquet du catalogue Swift descend à 262, run test (Refs #7797)
  - la route des statistiques d'un lien passe par le catalogue généré — run test (Refs #7797)
  - l'arabe garde ses ligatures dans les titres espacés de l'invitation et de la fiche — run test (Refs #7795, #7797)
  - « Prénom, nom et pseudo » en une phrase, dates grégoriennes dans toutes les locales — run test (Refs #7795, #7797)
  - la légende des langues ne coupe plus ni ne mélange les écritures ; « Nom complet » — run test (Refs #7795, #7797)
  - le lien résolu du choix d'invitation quitte la valeur de la vue racine — run test (Refs #7795)
  - page d'invitation avec un compte et fiche détails + édition d'un lien — run test (Closes #7795, Refs #7797)
  - la page d'invitation remplace l'aperçu du lien — qui invite, le groupe, ses langues, les droits en anonyme, les choix (Refs #7795)
  - modèle de l'invitation et de la fiche d'un lien — droits invités, réglages, statistiques d'arrivée (Refs #7795, #7797)
  - « Mes stories » livrée — la pastille « moi » du rail ouvre le listing, chaque story active se retire
  - une seule déclaration ACCESS_NETWORK_STATE dans la coque Android (Refs #7844)
  - la pastille « moi » du rail de stories ouvre « Mes stories », où chaque story active se retire
  - tous les champs qui mentionnent passent par le même mécanisme — commentaire, modification, texte de la scène, note d'humeur
  - un mécanisme unique de champ qui mentionne ; le composeur du fil s'y branche, matrice @ / 1 / 2 lettres témoignée (Refs #7846)
  - les mentions proposent les contacts du cache d'abord, puis les participants, puis les autres (Refs #7846)
  - la coque Android declare ACCESS_NETWORK_STATE (#7844)
  - toucher une identité ouvre la story NON VUE, sinon le profil — partout
  - taper @ dans le composeur propose les personnes à mentionner
  - l'en-tête d'un groupe montre ses trois participants les plus actifs
  - toucher le titre d'une conversation ouvre ses détails — identité, membres, lien de partage
  - un lien de suivi s'ouvre par /l/:token et compte son clic
  - un appui long sur l'avatar d'un auteur ouvre son menu, plus celui du message
  - lois pures de la mention au composeur et port des suggestions (#7826)

## 2.2.0

### Minor Changes

- Changements automatiques détectés :

  - un lien Meeshy touché dans un message s'ouvre dans l'app sur iPad aussi (Closes #7808)
  - dans la coque Android, fermer la feuille de partage n'est plus compté comme un partage (Closes #7822)
  - un lien Meeshy se lit à un seul endroit — le lancement système traduit le parseur (Closes #7815)
  - un post préchargé par la NSE entre en .stale — peint puis revalidé (Closes #7809)
  - les téléversements hors APIClient portent l'identité cliente (Refs #7810)
  - aucune porte ne reste muette — communauté, widgets Non lus/Récente, lien reçu sans compte (Closes #7811)
  - un réel ou une story s'ouvre dans le même lecteur par toutes ses portes, iPad compris (Closes #7805, Refs #7806, #7807, #7808)
  - la NSE précharge un post comme l'app le demande — X-Canvas-Caps compris (Refs #7804)
  - la barre collée ne porte que l'action primaire ; les champs de l'invité reviennent dans la page (Refs #7796)
  - le logo du groupe retombe sur ses initiales quand l'image manque ou échoue (Refs #7796)
  - invitations en RTL, contrastes AA de la carte du lien, budgets mesurés (Refs #7796, #7797)
  - les invitations parlent les sept langues, tiennent AA et l'arabe ; le gate des liens suit la page du créateur (Refs #7796, #7797)
  - la page du créateur d'un lien montre ses chiffres et sa configuration, et se modifie (Refs #7797)
  - le fil redescend sous 1000 lignes, découpé par responsabilité (Closes #7429)
  - le port des liens lit la politique, les statistiques, modifie et supprime un lien (Refs #7797)
  - la page d'accueil d'invitation montre qui invite, le groupe, ses chiffres et ses droits (Refs #7796)
  - l'invitation décodée porte le groupe, son message et ses chiffres sans identité (Refs #7796)
  - le clavier réduit l'écran au lieu de recouvrir le composeur dans Chrome Android (Closes #7799)
  - la réhydratation importe Combine — dev recompile, run test (Refs #7787)
  - l'auteur d'une story voit qui l'a vue, la partage et l'enregistre (Closes #7116)
  - la liste relue au réveil montre le dernier message reçu en arrière-plan — run test (Closes #7787)
  - l'activation expirée pendant l'export retape, elle n'échoue pas (Refs #7116)
  - « Enregistrer » porte le tracé télécharger, pas archiver (Refs #7116)
  - l'export lit la source de données par l'adaptateur unique (Refs #7116)
  - la progression de l'export reste lisible au lecteur d'écran (Refs #7116)
  - l'anneau d'export naît indéterminé et se pose sur le disque du rail (Refs #7116)
  - le rail auteur du lecteur de stories tient ce qu'il promet (Refs #7116)
  - l'auteur d'une story voit qui l'a vue, la partage et l'enregistre
  - l'onboarding réglé ne se redemande plus, attend la fin d'un deep link, et « Plus tard » tient la place principale (Refs #7729) run test
  - seconde relecture du kit — drapeaux de pays, pastille neutre sans « App Store », Y1 signée sans émoji, X6 sans doublon, S4 signée et épicène, iPad 05 rempli, affiche dégagée, corps de légende unique par vitrine, brouillons déclarés, « 19 h » insécable, Meeshy Global entier (Refs #7727, Refs #7728)
  - la barre du navigateur suit le thème choisi dans l'app, pas le système (Closes #7776)
  - la cause d'un envoi refusé se dit dans la langue d'interface, délai du serveur compris (Refs #7740)
  - la dette any du gateway enregistre la baisse du lot anti-spam (506 → 505) (Refs #7740)
  - le retour du studio ne crédite la story qu'avec sa preuve de publication (Refs #7729)
  - la série du récapitulatif dit ses jours, accordés, et un « +7 » ne finit plus seul sa ligne (Refs #7729)
  - l'onboarding appelle MeEndpoint.onboarding généré, l'adresse écrite à la main disparaît (Refs #7729)
  - l'aperçu de l'onboarding remplace l'écran de connexion au lieu de s'y superposer (Refs #7729)
  - les rayons de la médaille reprennent le rayon d'iOS (78 pt) et ne barrent plus le surtitre ni le titre de la révélation (Refs #7728)
  - l'onboarding se pose au-dessus de la pastille de synchronisation et de l'appel (Refs #7729)
  - l'accueil relit le serveur à chaque lecture, un parcours clos ailleurs ne se rejoue plus (Refs #7729)
  - un salut en échec se rejoue au nouveau tap, jamais un second message dans Meeshy Global (Refs #7729)
  - chaque personnage porte son genre — Min-jun au masculin, l'amie de C1-2 toujours une lectrice (l'italien montrait Lucas sous « Lei ») (Refs #7728)
  - l'arabe accorde aussi la fenêtre de l'élan, et le deux-points français prend une espace pleine (Refs #7728, Refs #7772)
  - une illustration réduite sous 60 % disparaît au lieu de devenir un timbre-poste (Refs #7729)
  - relecture du kit — bidi Y1, couvertures dans la grille 3:4, Min-jun au masculin, arabe accordé, « défi » et « inconnus » hors visuel, Y2 corrigée et signée, capture 8 et appel refaits (Refs #7728, Refs #7727)
  - la famille /…/new se dérive de la table des routes, et les deux portes qu'elle a trouvées exigent une session (Refs #7462)
  - la carte des notifications ne s'ouvre que là où un abonnement push peut suivre le « Oui » (Refs #7729)
  - un salut accusé ou une story publiée ne se rejouent plus à la reprise (Refs #7729)
  - les catalogues Swift et TS comptent l'entrée /me/onboarding, morte à la naissance
  - la composition d'humeur exige une session, comme la story et le post (Closes #7462)
  - la story de l'onboarding ne crédite qu'au succès de l'upload, et les cartes tiennent dans l'écran (Refs #7729)
  - dev redevient vert — endpoints régénérés, lectures d'onboarding et d'anti-répétition déclarées, témoin des Réels indépendant de l'ordre
  - kit social — miroir RTL des téléphones et des loupes, éventail agrandi, sous-titre d'appel dans la zone sûre (Refs #7728)
  - le « +N » se voit en vol et ne compte qu'à l'arrivée, l'arabe n'inverse plus un montant (Refs #7729)
  - kit social — compositions resserrées, loupes ajustées à leur cible, écran d'enregistrement, globe pointillé, nombres insécables (Refs #7728)
  - onboarding validé au simulateur — RTL, chiffres arabes, AX5, envolée du +N (Refs #7729) run test
  - kit réseaux sociaux — 9:16, carrousels, X / Threads, YouTube, stories, vérificateur de débordement (Refs #7728)
  - les cinq cartes de l'accueil post-inscription et leur récapitulatif (Refs #7729)
  - captures App Store — rangées non rognées, légendes plus grandes, panorama miroir en arabe, affiche au-dessus du vocal, loupe sur le solde Meesh (Refs #7727)
  - gabarits App Store — panorama indigo→violet, légende ajustée à sa boîte, surimpressions ancrées, affiche d'App Preview, dépôt fastlane et vérification en navigateur (Refs #7727)
  - la loi du parcours d'accueil, sa proposition à l'arrivée et son catalogue en sept langues (Refs #7729)
  - le retour matériel Android ferme la feuille de commentaires, pas le lecteur (Refs #6484)
  - le port de l'accueil post-inscription lit et écrit /me/onboarding (Refs #7729)
  - dates grégoriennes en arabe, Progression iPad en colonnes, surimpression dans le cadre (Refs #7727, #7728)
  - bibliothèque complète d'écrans iPhone et iPad, illustrations maison, typographie (Refs #7727, #7728)
  - les cinq cartes de l'onboarding post-inscription (Refs #7729)
  - revue-correction du rail commenter/repartager des Réels (Refs #6484)
  - un envoi refusé par le mode lent des nouveaux comptes dit pourquoi et le délai réel (Refs #7740)
  - la ligne d'arrivées regroupées de Meeshy Global se dit dans la langue du lecteur (Refs #7740)
  - socle du kit — design system dérivé d'ios.css, écrans DM vocal/groupe/Global/Progression/succès, moteur de rendu PNG sans alpha (Refs #7727, #7728)
  - contrat de l'onboarding post-inscription — modèles et service (Refs #7729)
  - la fiche App Store promet 76 langues traduisibles et une voix qui ressemble à la tienne, si tu l'actives
  - le plafond du chunk reels redescend à 7 Ko (Refs #6484)
  - lancer une vidéo ou ouvrir une story ne reconfigure plus une session audio déjà prête
  - GET /links/:linkId/stats rend visites, arrivées, langues, pays et arrivées récentes d'un lien (Refs #7797)
  - une arrivée par lien d'invitation enregistre son pays, dérivé de l'IP sans la garder (Refs #7797)
  - l'aperçu d'un lien d'invitation sert le logo, la bannière et les types réels, et compte la visite (Refs #7794)
  - le type-check ne reconstruit plus @meeshy/shared lui-même (Refs #7789)
  - les registres de surfaces et les témoins suivent l'anti-spam de Global (Refs #7740)
  - une ligne d'arrivées qui refuse sa mise à jour n'avale plus l'arrivant (Refs #7740)
  - un refus du mode lent des nouveaux comptes sur un lien répond 429 + Retry-After, jamais 403 (Refs #7740)
  - POST /translate-blocking traduit un texte sans plus jamais écrire de message (Refs #7740)
  - le mode lent des nouveaux comptes tient sous une rafale d'envois simultanés (Refs #7740)
  - la file des arrivées ne laisse aucune promesse détachée (Refs #7740)
  - les suggestions d'onboarding ne croisent plus un mineur vérifié et un âge inconnu
  - Meeshy Global regroupe ses arrivées — une ligne par fenêtre de 10 min, mise à jour plutôt que multipliée (Refs #7740)
  - GET et PATCH /me/onboarding servent l'état du parcours d'accueil
  - le refus du mode lent voyage jusqu'au client — 429 + Retry-After en REST, ACK et événement error en socket (Refs #7740)
  - Meeshy Global ralentit les comptes de moins de 24 h — un message toutes les 30 s (Refs #7740)
  - un texte répété dans Meeshy Global ne rapporte plus de points
  - un message dans Meeshy Global crédite l'engagement public, plus jamais la conversation privée
  - contrat de l'aperçu d'un lien d'invitation et de ses statistiques (Refs #7794, #7797)
  - colonnes des statistiques d'un lien d'invitation — visites et pays d'arrivée (Refs #7794, #7797)
  - la ligne d'arrivées regroupées — metadata, texte et ligne de liste dans les sept langues (Refs #7740)
  - le contrat d'onboarding — User.onboardingCompletedAt, onboardingSteps et schémas Zod

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.24.0

## 2.1.0

### Minor Changes

- Changements automatiques détectés :

  - le lecteur de stories ne se ré-évalue plus quand quelqu'un tape ailleurs
  - la rangée de stories ne se ré-évalue plus quand quelqu'un tape ailleurs
  - la page d'un réel audio ne se ré-évalue plus à chaque battement du lecteur
  - StoryViewerView repasse sous son budget de valeur — outgoingStory indirect — run test
  - le lecteur de stories rentre dans son budget de pile — run test
  - la barre d'état de la coque suit le thème choisi dans l'app (#7731)
  - partager depuis la coque Android ouvre la feuille du système (#7710)
  - les surfaces de lecture ne se ré-évaluent plus à la cadence du moteur
  - un post publié depuis le web porte plusieurs pages de médias, agencées au choix de l'auteur
  - les migrations à jour ne prennent plus le verrou d'écriture au démarrage
  - session audio, lectures du fil et démarrage à froid hors du main thread
  - encodeurs d'empreinte et contextes Core Image construits une fois
  - plus aucun objet coûteux reconstruit à chaque image dans les chemins média et fil
  - un post publié depuis le web porte plusieurs pages de médias, agencées au choix de l'auteur (Closes #7684)
  - retire la deinit dupliquée de MessageListCell — run test (Refs #7700)
  - retire la deinit dupliquée de MessageListCell — run test
  - MessageListCell ne déclare qu'une seule deinit — run test
  - une publication part avec l'audience choisie, et le studio s'en souvient
  - un vocal déjà sur l'appareil se dessine prêt dès le premier rendu — run test (#7660)
  - MessageListCell écrit sa deinit nonisolated (run test)
  - le studio publie l'audience choisie, et s'en souvient (Refs #7683)
  - la garde SE-0466 dit le critère qu'elle applique — run test (Refs #7685)
  - MessageListCell déclare sa deinit nonisolated (SE-0466) — run test
  - MessageListCell écrit sa deinit non isolée — la garde iOS 26.1 rougissait dev (#7579) — run test
  - la frappe n'alloue plus de regex ni de minuteur à chaque touche (run test)
  - 48 écrans ne s'abonnent plus au thème système pour une valeur jamais lue
  - MessageSocketManager+ViewOnce importe Combine — run test
  - le fil dit qui a ajouté, retiré ou renommé, dans la langue du lecteur (#7673)
  - l'éphémère remet la barre au ROUGE d'alerte, directive porteur — run test (Refs #7667, décision #7677)
  - une photo à vue unique s'ouvre en clair dans le plein écran (#7672)
  - la liste lit « Ouvert », le sticker et la position que la passerelle sert (#7671)
  - la purge serveur d'une vue unique vide la bulle en direct, sans la retirer (#7644)
  - la barre du composeur prend la couleur de la protection la plus forte — éphémère > vue unique > flou, flou et vue unique exclusifs (Refs #7667)
  - les gates du fil mesurent le drapeau, la pastille se taisant devant lui (#7599)
  - la sortie ne consomme plus ce que l'auteur a révélé, et la purge serveur vide la bulle sans la retirer (#7579) — run test
  - une rangée du fil garde sa hauteur en traversant la bande de l'îlot (#7660)
  - une rangée du fil iPhone est peinte dès sa naissance, et la page suivante arrive sous des cartes fantômes (Refs #7657, Refs #6987)
  - une cellule du fil ne redemande plus de taille pour un bruit de flottant — run test (#7624)
  - le plafond redemande une passe de layout au lieu de rejouer le contexte avalé (#7624)
  - la carte de l'élu Focal attend une vitesse de lecture — plus de reconfiguration en plein fling (#7624)
  - le plafond d'invalidations du fil DIFFÈRE au lieu de tout invalider — plus de cascade au repos (#7624)
  - le témoin des couleurs d'état lit sa feuille par import.meta.url, comme ses voisins typés
  - le fil écrit moins de géométrie par image, et un reflet de chargement n'anime que lui-même — run test (Refs #7625)
  - le réel voisin est téléchargé avant le swipe, dans le fil comme en plein écran (Refs #7625, Refs #7009)
  - une vue unique ouverte reste « (1) · Déjà ouvert », par personne, contenu purgé (#7579, #7619) — run test
  - le fil dit chaque état une fois, par sa couleur (#7599)
  - la ligne de liste dit ce qui vient de se passer — éphémère vivant, aperçu non lu, appel, réaction, « Vous » — run test
  - modernize concurrency sleep calls and update review audit
  - le chemin d'échec du health check ZMQ n'est plus déclaré mort

## 2.0.12

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.23.0

## 2.0.11

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.22.0

## 2.0.10

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.21.4

## 2.0.9

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.21.3

## 2.0.8

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.21.2

## 2.0.7

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.21.1

## 2.0.6

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.21.0

## 2.0.5

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.20.0

## 2.0.4

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.19.5

## 2.0.3

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.19.4

## 2.0.2

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.19.3

## 2.0.1

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.19.2

## 2.0.0

### Major Changes

- Le chantier web s'appelle `apps/web-v2` (paquet `@meeshy/web-v2`), en version 2.0.0 : il était `apps/web-v3`, la v3.1. Il deviendra `apps/web` quand il sera mûr en staging (#6042).

## 3.1.3

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.19.1

## 3.1.2

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.19.0

## 3.1.1

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.18.0
