# @meeshy/web-v2

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
