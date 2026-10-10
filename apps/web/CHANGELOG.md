# @meeshy/web-v2

## 2.13.0

### Minor Changes

- Changements automatiques détectés :

  - un lien universel ouvert sans session montre le contenu public, l'invitation à se connecter et qui l'a partagé (#9171)
  - la résolution d'un lien suivi porte qui l'a partagé, et une forme illisible ne la casse pas (#9171)
  - le gate de perf des effets d'appel ne promet 30 images par seconde que là où il les a exigées (#9099)
  - un texte de scène se coupe à 88 % de la scène, comme iOS, au rendu, à la saisie et à la retouche (#9140)
  - les trois clés du sélecteur de type de l'ancienne feuille d'édition quittent le catalogue (#9178)
  - les trois clés du sélecteur de type que #9178 a remplacé quittent le catalogue
  - Teint naturel permanent + Peau lissée par séparation de fréquences en appel (#9196)
  - sans GPU, le gate de perf des effets d'appel rapporte la cadence et le coût au lieu d'échouer — les tâches longues, le relevé du worker et le flou restent exigés (#9099)
  - la feuille de stickers montre un onglet par pack installé et une Boutique qui installe ou retire un pack d'un geste (#9190)
  - une seule feuille de stickers sert la conversation et la scène d'un post, d'un réel ou d'une story (#9189)
  - la carte d'un réel dans le fil et sa langue d'origine montrent aussi la légende de scène d'un réel sans texte (#9179)
  - le gate de perf des effets d'appel lit l'horloge de la page au lieu de délais fixes, et rejoint le composite (#9099)
  - l'écran vidéo d'appel dit la caméra et le micro coupés du correspondant, tient en hauteur compacte et n'est plus recalculé chaque seconde (#8788, #8787, #8410, #8989)
  - MediaPipe rejoint son seul importeur — ni le socle ni un chunk nommé que la première peinture chargeait (#8471)
  - le passage au worker des effets d'appel ne prend plus de réglage inutilisé (#9099)
  - la voie document d'un réel recopie aussi la légende par média dans son texte (#9179)
  - un réel sans texte montre et publie la légende de sa scène, suivie de ses hashtags (#9179)
  - éditer un réel le garde réel — le type d'origine est restauré, le sélecteur toujours offert sous ses contraintes, et un post change d'agencement (#9178)
  - CallManager.swift repasse sous le budget — ses responsabilités partent dans des extensions CallManager+\*.swift, sans changer le comportement
  - les effets vidéo d'appel tournent dans un worker, le flou se fait par segmentation sans flou de caméra, et le zoom numérique recadre l'image envoyée (#9099, #8471, #8441)
  - la gigue se calcule comme sur iOS — moyenne des flux audio, niveaux 30/50 ms (#8209)
  - le glissé vers le bas dit à l'écran d'appel s'il existe — le champ que l'écran lit pour réserver le doigt (#9096)
  - un .env hérité du legacy ne fait plus d'un vite build un build de développement (#9176)
  - glisser l'écran d'appel vers le bas le réduit ; en groupe toute tuile passe à la une, la mienne aussi, et un écran partagé se zoome (#9096, #9098)
  - la règle du glissé vers le bas de l'écran d'appel et son arbitrage avec le toucher (#9096)
  - un commentaire montre ses photos et ses vidéos sous son texte (#9167)
  - les effets de visage d'appel coûtent peu par image et respectent le mouvement réduit (#9100)
  - les effets vidéo d'appel n'analysent plus l'image sur la file de capture — segmentation à 15 i/s et repères du visage sur leur propre file, flou au quart, dégradation par paliers (#9101, #9102)
  - un commentaire joint une photo ou une vidéo, et « Éditer » l'ouvre dans la retouche du composeur (#9167)
  - la garde du développement photo reconnaît le relais developShots, l'instant admin joint date et heure sans dépendre d'ICU (#9133)
  - le carrousel d'un mode ne choisit que sous un geste — un réaccrochage du navigateur n'applique plus « Naturel » (#8969)
  - une image de composition s'édite dans la scène — l'éditeur d'image plein écran ne sert plus que l'avatar (#9170)
  - « Terminé » sur la scène d'une vidéo choisie pour une citation n'abat plus l'app (#9166)
  - dans la barre de composition, Sticker, Photos et Caméra prennent le trait des icônes de gauche, et le (+) ne les répète plus (#9173)
  - le viseur en scène et le viseur plein écran partagent une seule machine de capture (#9134)
  - l'ancien éditeur vidéo et le composer unifié quittent le dépôt — la citation et la vidéo de premier plan s'éditent dans la scène (#9166)
  - un visiteur sans compte voit le réel, la publication ou la story partagée, avec par-dessus l'invitation à se connecter et le nom de qui la lui a partagée (#9149)
  - les commentaires éditent leurs médias dans la scène du composeur — « Éditer » sur une pièce ouvre ses scènes, et « Terminé » la remplace à sa place, sans les anciens éditeurs d'image et de vidéo (#9127)
  - pincer un texte agrandit son cadre entier, la taille et la coupe des lignes restent celles de l'édition (#9139)
  - une pièce retouchée s'ouvre sur ses éditions — une image du fil se recadre (Original, 1:1, 4:5, 9:16), et annuler rend son cadre entier (#9136)
  - « Éditer » un audio en attente le coupe (début, fin), et « Terminé » rend la pièce coupée à sa place (#9136)
  - une vidéo coupée s'enregistre depuis le début de sa fenêtre, et un fond recadré s'affiche à son cadre entier dans la scène (#9136)
  - les libellés des packs de stickers chargent avec la feuille, et la validation partagée passe à zod/mini (#9141)
  - une pièce retouchée se coupe et se tait (vidéo) ou se recadre (image) dans la scène, et « Terminé » la rend coupée, sans piste audio ou au cadre de son recadrage (#9136)
  - un onglet par pack installé, une boutique pour installer ou retirer, et un éditeur pour proposer un pack (#9141)
  - texte, images de premier plan, stickers et fond s'éditent dans la scène, leurs options s'ouvrent à droite depuis le haut (#9138)
  - les options du texte savent se ranger dans une colonne étroite, autant de vignettes par rangée que la largeur en tient (#9138)
  - une pièce vidéo retouchée repart à la durée de sa fenêtre coupée, et une image recadrée repart au cadre de son recadrage (#9136)
  - recadrer une image écrit sa borne sur l'objet, et le bitmap affiché se recoupe depuis le fichier d'origine (#9136)
  - la vidéo de fond se rend coupée à sa fenêtre de source, et sans piste audio quand elle est muette (#9136)
  - la note des sous-titres d'appel dit « sur cet appareil » plutôt que « Ce navigateur » (#9142)
  - l'ouverture d'un objet et les feuilles d'ingestion quittent +Intake, qui frôlait 1200 lignes (#9138)
  - éditer une pièce en attente ouvre toutes les pièces du message en scènes, et « Terminé » rend chaque retouchée à sa place, sans ré-encoder les autres (#9126, #9131)
  - un post sans média crée sa scène d'un toucher sur l'outil Texte (#9137)
  - une tuile du rail des scènes se touche là où elle se voit — la voisine ne recouvre plus la première (#9126)
  - le statut, la page blanche et la citation ouvrent le viseur du composeur, seul en plein écran ; l'ancienne CameraView quitte le dépôt (#9125)
  - CameraModel, CameraPreviewLayer et CameraResult quittent CameraView.swift pour leurs propres fichiers, sans changement de comportement (#9125)
  - CallLaunchResume et CallResumeLedger déclarent leur deinit non isolé, comme toute classe MainActor (#9132)
  - une vidéo jointe s'édite dans la scène et repart dans le message, rendue en vidéo (#9124)
  - une vidéo prise ou jointe s'édite dans la scène et repart dans le message, sans l'ancien éditeur vidéo (#9124)
  - la caméra de la barre de composition ouvre le studio viseur armé, et la prise rejoint le message après édition dans la scène (#9123)
  - la caméra et la retouche du fil ne reprennent ni n'écrasent le brouillon de création (#9123)
  - la caméra de la barre de composition ouvre le composeur viseur armé, et la prise rejoint le message après édition dans la scène (#9123)
  - dans l'espace commentaire, le ⌄ est visible d'emblée et replie la barre en une icône de commentaire (#9122)
  - dans tout espace commentaire, le ⌄ est visible d'emblée et replie la barre en une icône de commentaire (#9122)
  - le micro du champ suit aussi la teinte d'icône de l'effet armé (#9121)
  - les icônes de la barre de composition prennent la couleur de l'effet armé, sinon la couleur commune des icônes (#9121)
  - la barre de composition ouvre la photothèque (images et vidéos) d'un geste, à côté de la caméra (#9120)
  - chaque pièce en attente porte « Éditer » en son centre, et le toucher l'édite (#9119)
  - un appel coupé faute de micro offre « Réglages » dans la coque Android (#9033)
  - la bulle d'appel ne fait plus reparaître la barre d'état par-dessus une visionneuse qui la cache (#8739)
  - un appel réduit reste atteignable par-dessus un plein écran — la bulle vit dans une fenêtre passe-plat (#8739)
  - un appel en cours se reprend au lieu de s'arrêter — jamais call:end pour un appel décroché, « Appeler » rejoint, reprise au lancement (#9111)
  - un pair revenu est accepté sur un lien neuf, et une reconnexion du socket ne coupe plus un média sain (#9111)
  - la carte des liens suivis d'un message survit au cache GRDB
  - le journal d'appels garde hors ligne les pages parcourues, et cherche par nom et par type côté serveur (#8204, #8203)
  - on rejoint un appel en cours — plus de call:end à la fermeture de page ni au lien perdu, liens neufs à la reconnexion, « Appeler » rejoint l'appel actif (#9111)
  - les actions caméra de l'appel suivent iOS — on choisit sa webcam, la dernière intention gagne, l'échec se dit, Effets montre son état, PiP rejoint la rangée de l'appel (#9094, #9095, #8735)
  - la puce « Sonne… » d'une invitation se résout en « Léa a refusé » ou « Léa n'a pas répondu » (#8470)
  - la section Instants de Personnalisés montre toutes ses familles — des lignes directes, plus une pile imbriquée
  - les 55 Instants filmés s'offrent dans Personnalisés — l'index ne liste que les Instants filmés
  - la feuille de stickers a ses favoris, comme iOS — appui long ou clic droit pour épingler
  - la bulle d'appel change de taille, un écran partagé y flotte entier, et la sortie audio s'y choisit (#8145, #8164, #9097)
  - ma vignette se glisse vers quatre coins avec ses commandes, et le micro coupé du pair se voit en vidéo (#8747, #8787)
  - un invité qui n'a encore vu aucun autre membre ne perd pas l'appel quand l'initiateur raccroche (#9092)
  - quand l'initiateur quitte un appel de groupe qui continue, l'en-tête nomme le groupe et non le partant (#9091)
  - un lien se rend selon sa forme écrite — [[url]] direct, [libellé](url) suivi, URL brute en m+token (#9093)
  - le départ de l'initiateur d'un appel de groupe ne dégrade plus les invités qui restent (#9090)
  - une rafale de changements pendant la négociation ne resynchronise le maillage qu'une fois (#9089)
  - quand un membre quitte un appel de groupe, l'appel continue pour ceux qui restent (#9085)
  - l'invité d'un appel en cours se relie à tout le groupe, pas seulement à l'invitant (#9084)
  - un raccroché en bande dans un appel de groupe ne coupe plus l'appel des autres (#9085)
  - les Instants de Mee et Meo dans Personnalisés — film sans texte, texte redessiné en natif
  - la caméra se pose à l'angle droit du verre du composeur, le sticker prend la place de l'indicateur d'humeur (#9082)
  - un lien touché dans le lecteur de story s'ouvre dans l'app — la politique des liens enveloppe la couche qui le présente (#9075)
  - la rangée de commentaire peint son sticker par le rendu de la bulle, et le port d'envoi emporte un sticker (#9080)
  - la réaction qui monte pendant un appel porte le nom de son auteur, comme sur le web (#9083)
  - la légende de story, les légendes de média, les commentaires et les réels ouvrent leurs adresses par /l/ (#9075)
  - le lien suivi /l/<token> se construit sur l'origine web de l'environnement actif, plus sur meeshy.me en dur (#9075)
  - la feuille de stickers n'a plus que deux onglets, comme iOS — Mee & Meo par intention, Personnalisés avec les Instants
  - la planche Mee & Meo défile jusqu'au bout — des rangées dans la pile, plus une grille par intention
  - un commentaire ouvre ses adresses par /l/ — le type décode la carte (REST et socket), la rangée rend par RichText (#9074)
  - la légende du pied de la visionneuse ouvre ses adresses par /l/ — la carte voyage dans le porteur, du message comme du post (#9074)
  - les légendes de média du fil ouvrent leurs adresses par /l/ — carrousel et mosaïque, la carte du post voyage avec chaque légende (#9074)
  - la story ouvre ses adresses par /l/ — ses deux légendes et le texte d'une story de texte, la carte décodée une fois par le lecteur (#9074)
  - une légende posée sur un média rend ses adresses par RichText — /l/ pour la carte, le lien garde le geste, le texte le rend au lecteur (#9074)
  - Mee, Meo et leurs duos dans UN onglet rangé par intention ; un Mee s'épingle aux favoris
  - la légende d'une story se pose au ras du bas sans composeur ou interface masquée (#9072)
  - la présence d'un pair se lit sur son compte, son mood s'affiche dans la liste et le fil, et l'activité ne respire qu'à peine plus fort (#9065)
  - à l'activité, le point « ici » et le mood respirent à peine plus fort qu'au repos — seule l'arrivée pulse franchement (#9065)
  - même échelle de pulse pour le point « ici » et le mood, et le mood vit l'arrivée et le départ du point (#9065)
  - une échelle de pulse pour le point « ici » et le mood — imperceptible en plein écran, petit au repos, ample à l'activité, gros pulse à l'arrivée, rétraction au départ (#9065)
  - la liste garde la présence sous un mood (contour) et le mood pulse à peine en plein écran, aussi dans la liste et l'en-tête (#9065)
  - en plein écran, le mood pulse à peine au lieu de s'immobiliser (#9065)
  - « ici » garde un petit pulse au repos, pulse bien plus fort à l'activité et en plein écran, et se fait plus discret dans l'en-tête (#9065)
  - la visionneuse garde « ici » et le fait pulser, l'appel fait quitter, le mood se cerne de la présence (#9065)
  - le reporter dit « en plein écran » et l'écran d'appel fait quitter (#9065)
  - le plein écran garde « ici » et le fait pulser, l'appel fait quitter, le mood se cerne de la présence (#9065)
  - Mee, Meo et Mee & Meo — trois onglets rangés par intention, et les 164 films
  - un Mee ou un GIF animé laisse partir l'appui long de sa bulle
  - les ondes du point de présence quittent MeeshyAvatar — aucune animation infinie dans l'avatar (#9061)
  - le profil d'un ami montre s'il est en ligne et depuis quand il ne l'est plus
  - le point indigo « ici » est deux fois plus gros, posé sur le cercle, et pulse quand le pair regarde, écoute ou agit (#9061)
  - le point indigo « ici » est deux fois plus gros et pulse quand le pair regarde, écoute ou agit (#9061)
  - les gabarits portent le contour blanc découpé ; la feuille anime Mee et Meo
  - soixante stickers Mee, Meo et Mee & Meo comblent les intentions creuses
  - viewing:activity relaie qu'un lecteur ICI regarde, écoute ou agit (#9061)
  - les stickers Mee et Meo se rangent par intention, et les duos ont leur onglet « Mee & Meo »
  - les gates du fil et de l'harmonie suivent les emojis ×4 et les illustrations de Mee
  - la garde de la Lentille lit les tailles d'emoji seul « base × multiple »
  - un emoji seul est peint à sa taille — relative() le plafonnait à 34 pt
  - Mee et Meo partent et s'animent sur iOS ; un message d'emojis seuls grossit ×4 / ×3 / ×2
  - un plein écran ouvert depuis la conversation retire « est dans la conversation » (#9052)
  - ouvrir une image ou quitter l'écran retire « est dans la conversation » (#9052)
  - main redevient vert — deinit de la mémoire d'en-tête, clé morte, gardes à jour
  - une réaction ne dit son émoji et son auteur qu'une fois (#9049)
  - le mini-lecteur et la barre d'appel remontent hors de l'écran en partant, la bande et le contenu avec eux (Closes #9048, Closes #8983)
  - sous l'avatar, la série précède les points du jour ; le total reste à l'en-tête déplié (#9044)
  - l'en-tête déplié montre la flamme et « série · total » comme sous l'avatar, sans capsule (#9044)
  - le menu d'actions du bas garde son Liquid Glass, seule la bande d'emojis perd son cadre
  - le compte du jour sous l'avatar est cerclé de 1 pt blanc (#9044)
  - le point « ici » ne s'efface plus derrière un écran rouvert, pulse en arrivant et cède au vert en rebondissant (#9047)
  - le compte du jour sous l'avatar est rouge, cerclé de 2 pt gris anthracite, dans les deux thèmes (#9044)
  - le ×1,4 allonge la bande d'emojis, le menu garde sa hauteur et les emojis leur taille
  - la flamme pend sous le cercle, s'allume en brûlant, et rien ne s'affiche sans série (#9044)
  - le menu d'appui long d'un message s'ouvre sans cadre, 1,4 fois plus long, et glisser vers le haut réduit l'aperçu (coque Android comprise)
  - le menu d'appui long d'un message s'ouvre sans cadre, 1,4 fois plus long, et glisser vers le haut réduit l'aperçu pour dégager le menu coupé
  - la flamme du jour se pose sous l'avatar, la lueur la rejoint et la fait grandir (#9044)
  - la caméra refusée du studio offre « Réglages » dans la coque Android (#9032)
  - l'âge du cache du numéro de build se lit aussi sous GNU stat
  - vues de Mee servies en SVG précachés, clés de catalogue resserrées, gates de poids verts (#9034)
  - un build local porte le numéro de la dernière livraison App Store Connect, sans réécrire le dépôt
  - « Transférer » propose « Imager la discussion »
  - partager une carte « Imager » partage l'image, plus le chemin du fichier
  - coller une image, un son, une vidéo ou un document en fait une pièce jointe, et un texte trop long un .txt
  - Mee et Meo accueillent le lecteur sur les sept pages institutionnelles (#9034)
  - le collage mesure la limite que les frontends déclarent, MAX_MESSAGE_LENGTH partagé (2000)
  - onglets Mee, Meo et Instants dans la feuille de stickers, redessinés animés dans la bulle (#9034)
  - Transférer propose « Imager la discussion » dans le menu d'appui long
  - banderoles et cœurs géants lisibles dans l'image fixe (#9034)
  - les 204 stickers de Mee et Meo et leurs ratios mesurés (#9034)
  - partager une carte imagée remet le fichier image à la feuille, jamais un chemin
  - coller un fichier ou un texte trop long crée une pièce jointe dans le composer
  - l'aperçu s'agrandit depuis son en-tête, la flamme du jour s'anime — run test (#9031)
  - moteur des stickers Mee et Meo (#9034)
  - l'aperçu s'agrandit depuis son en-tête, la flamme du jour s'anime sous l'avatar (#9031)
  - le contour « déjà fait » du lecteur de story lit l'accent de l'auteur sous son nom, la garde des couleurs repasse au vert (#9029)
  - StoryViewerParticipation et StoryRailContourTests inscrits au projet (#9029)
  - le rail retrouve son contour, son rebond et son cœur
  - le rail rend ses effets — halo du son, cœur, anneau de participation
  - la révocation retire aussi les bannières rendues par FCM (#9028)
  - le service worker ferme la bannière de la réaction remplacée (#9028)
  - la nouvelle réaction retire la bannière de la réaction d'avant (#9028)
  - le push d'une réaction remplace la bannière du même acteur sur le même sujet (#9028)
  - une notification réécrite par une édition reprend sa place dans la cloche (#9028)
  - la NSE retire la bannière qu'un push d'édition remplace AVANT de l'afficher (#9028)
  - la liste trie par le rang servi `listRankAt` (#9026)
  - la série « 🔥4 · 120 » en rouge à côté de l'heure de la rangée, masquée en focus (#9025)
  - la feuille d'envoi partage par le pont Android et copie avec le repli (#9023)
  - le cadre téléphone connaît les paramètres des fiches de diffusion, de demande et de signalement (#8876)
  - la gate des effets d'appel attend que ma caméra rende sa première image — port de #9013 (#9015)
  - le bandeau du micro suit la langue d'interface et dit « sur cet appareil » (#9016)
  - la gate des effets d'appel attend que ma caméra rende sa première image (#9013)
  - le témoin « qui est déjà là » quitte AuthHandler.test.ts, le cliquet de taille des suites repasse au vert (#8876)
  - l'aperçu d'un vocal à l'appui long affiche sa vraie durée — la pièce jointe parle en millisecondes (Closes #9008)
  - les gates lisent enfin les requêtes de conteneur, et le cliquet du catalogue TS descend d'un cran (#8876)
  - la revue de la vue de dieu — accessibilité, kit commun, dossier membre, noms réels (#8876)
  - la revue de la vue de dieu — fuites de clés, rang d'inventaire, communautés désactivées (#8876)
  - sur un format fixe, la transcription cède d'abord et l'échelle des médias s'arrête où le texte garde sa place ; l'avis dit quand ce sont les médias (Refs #8979)
  - un son en échec se relit et retient la vidéo, et la vidéo fait entendre le son PEINT (Refs #8979)
  - le vocal CITÉ part dans la piste que la bulle fait entendre, et une piste servie ne montre jamais le texte ni la durée de l'original (Refs #8979)
  - le plateau prend sa hauteur et ne déborde plus sur les boutons ; la consigne tient sur une ligne (Refs #8979)
  - les deux gardes de la suite repassent au vert — le témoin « qui est déjà là » quitte AuthHandler.test.ts, la suite hide-read lit les vrais schémas de réponse (#8892, #8958) — run test
  - la suite iOS de dev repasse au vert — l'aperçu de notification de l'iPad vit sur le tas, et le témoin de la date se borne à sa ligne (Closes #8972)
  - l'onglet Médias d'un vocal règle sa transcription, son minuteur, sa police, la durée et le passage de la vidéo ; chaque partie de la carte se pince (Refs #8979)
  - le karaoké garde la ligne dite au-dessus, le spectre se pose et respire, et la carte se vérifie en pixels (Refs #8979)
  - les commandes d'un appel vidéo ne disparaissent plus seules — un toucher les range, le suivant les rend (Closes #8988)
  - un vocal imagé montre sa transcription qui défile et son minuteur, sur l'extrait choisi ; l'onde et le spectre se distinguent (Refs #8979)
  - les contrôles de l'appel vidéo ne disparaissent plus seuls et répondent sans délai — un toucher les cache ou les remet, un appui n'écrit plus d'état de la racine, la bascule caméra n'attend plus la session audio, la qualité ne se republie que si elle change (Refs #8978)
  - la croix du mini-lecteur le ferme sur le champ — la grâce de 5 s n'est plus que celle d'une file épuisée, et tout son cadre se touche (Refs #8983)
  - la fiche de contact copie avec le repli, et le repli copie depuis la fenêtre modale (#8986)
  - une image partagée depuis une autre app ouvre la feuille Envoyer, sur le web et la coque Android (#8884)
  - partager un post ou un réel ouvre la feuille Envoyer, l'invitation prend le même cadre (#8884)
  - chaque visionneuse plein écran partage par la feuille Envoyer, la story se transfère (#8884)
  - le transfert de messages passe par la feuille Envoyer (#8884)
  - la feuille Envoyer en verre liquide, Annuler clair, multi-destinataires et publication (#8884)
  - un moteur d'envoi unique porte transfert, partage et publication, légende comprise (#8884)
  - les témoins des catégories de la cloche recompilent — NotificationCategory vit sur le MainActor de MeeshyUI (Refs #8958)
  - la suite des catégories de notification est @MainActor — SDK Tests compile à nouveau (#8958)
  - trois vues arrivées après la charte reviennent aux jetons — run test (#8877)
  - chaque opération du barème crédite, sous ses plafonds et ses garde-fous (#8959)
  - l'écran du barème règle chaque opération, les liens, la constance et les garde-fous (#8959)
  - le titre par défaut nomme par le nom réel, et la recherche le charge enfin
  - les extensions de notification parlent la langue choisie dans l'app (#8951)
  - un média resynthétisé remplace l'ancien dans le cache de l'app — seed seul gardait la piste périmée (Refs #8855, #8921)
  - la piste jouée tient jusqu'à la photo — vocal reçu en trois phrases (9,4 à 17,7 s), capture refusée sous 7 s ; le nom d'un vocal suit sa voix et son débit (Refs #8855, #8921)
  - l'administration parle français, anglais, espagnol et portugais — les autres interfaces la lisent en anglais (#8876)
  - la cloche web se vide comme iOS — lignes consommées retirées, glissement pour supprimer, catégorie Engagements (#8960)
  - catalogue des opérations et moteur de quotas du barème (#8959)
  - la cloche se vide — lignes consommées retirées, glissement pour supprimer, catégories filtrées par la passerelle, puce Engagements (#8958)
  - l'extension de notification déployée et le partage d'écran sont signés pour la distribution (#8953)
  - le pied de la bannière se charge à la demande, le lecteur n'importe plus la barre de la visionneuse (#8860)
  - l'habillage retire les captures d'un plan précédent — le dossier final ne porte que le jeu courant (Refs #8855)
  - « prêt » s'attend 120 s — un lancement à froid sous charge a pris 69 s, une série de captures ne s'arrête plus sur lui (Refs #8855)
  - web et coque Android portent le détail du contenu comme iOS (#8860)
  - la capture refuse un fil coupé par minuit — l'app date tout depuis son horloge, une scène de conversation se prend dans la journée (Refs #8855)
  - le message que « groupe » rouvre sur son original est une réplique que l'écran de l'iPhone montre (Refs #8855)
  - la capture synthétise et dépose les médias ; six scènes dans l'ordre du storyboard (Refs #8855)
  - trois scènes — le vocal joué dans la langue du lecteur, un message rouvert sur son original, Imagine (Refs #8855)
  - intégration de la vue de dieu, écran d'attente et drapeaux retirés, poids et cliquet remesurés (#8876)
  - la demande d'un message a un site unique, que la vitrine emprunte (Refs #8855)
  - « prêt » ne tombe que sur un écran rendu — conversation affichée, progression chargée, aperçu du lien servi, fil peint (Refs #8855, #8921)
  - les gestes de membre passent par leurs adresses du catalogue (#8876)
  - membres pleine largeur, listes lisibles à 375 px, sept langues traduites (#8876)
  - anonymes sur le kit, invités nommés, langue nommée, permissions en phrases (#8876)
  - conversations et agent alignés sur le kit, fiche complète et membres nommés (#8876)
  - dossier du membre en mots, décodeur des anonymes sans libellé fabriqué (#8876, #8005, #8004, #7920)
  - comptes sur le kit, fiche membre interprétée, gestes de sécurité, préférences étiquetées (#8876, #8005, #8004, #7920)
  - le fil et les médias rangés avant le montage des racines, la liste sans cadenas (Refs #8855, #8922)
  - fixtures v2 — le couple et son vocal traduit, Pizza Night, le fil, les médias, sans cadenas (Refs #8855, #8922)
  - journal d'audit nommé et réglages d'administration sur le kit (#8876, #6727, #6732)
  - médias de la vitrine — photos mesurées, vocaux synthétisés, karaoké (Refs #8855)
  - le vocal que reçoit le lecteur et la légende d'Imagine (Refs #8855)
  - supervision de la plateforme, santé relue et usage des routes (#8876, #6730, #6734)
  - diffusions — composer, préparer, envoyer et suivre sur le kit (#8876, #6731)
  - classement nommé, podium et filtres dans l'adresse (#8876, #6730)
  - liens de suivi sur le kit, campagnes lisibles et clics interprétés (#8876, #6729)
  - demandes de contact et liens de partage sur le kit (#8876, #6729)
  - publications et communautés sur le kit, avec leurs gestes (#8876)
  - signalements — file de modération, fiche et gestes sur le kit (#8876, #6726, #6843)
  - statistiques — chaînes en sept langues, panneau en tabpanel, témoins d'erreur par graphique et d'espace /adm (#8876, #6728)
  - Statistiques (activité, messages, appels) et Langues et traductions sur le kit (#8876, #6728)
  - le tableau de bord « vue de dieu », sept zones gardées bloc par bloc (#8876)
  - la vignette de « Mes stories » passe par la route de flux et ne pose plus une vidéo dans une image (Refs #8820)
  - kit d'administration, graphiques SVG, hooks de liste et de geste (#8876)
  - publier les six adresses de supervision aux catalogues clients (#8876)
  - durcir le classement et tracer les gestes exposés (#8876)
  - les métadonnées de compte, les noms des acteurs, les diffusions suivies (#8876)
  - la fiche d'une conversation et celle d'un lien de partage (#8876)
  - fondation de la vue de dieu — interprétation, glyphes, registre, routes, catalogues (#8876)
  - superviser les communautés et rendre la désactivation effective (#8876)
  - nommer le signalant, le modérateur et l'entité signalée (#8876)
  - servir les liens de suivi et la supervision de la plateforme (#8876)
  - servir le journal d'audit nommé et interprété (#8876)
  - monter la surface de supervision `admin-oversight` (#8876)
  - les deux promesses détachées de l'arrêt et de l'échéance d'invitation portent leur .catch au site (#8297, #8470)
  - l'appel manqué d'une invitée non membre mène à sa conversation directe avec l'inviteur (#9115)
  - les invités par lien comptent dans les audiences « les autres participants » (#9106)
  - la porte optionnelle de GET /posts/:postId porte le type du middleware, plus un any (#9149)
  - la résolution d'un lien de partage nomme qui l'a partagé — nom affiché, pseudo, avatar (#9149)
  - un visiteur sans compte lit par son lien une publication publique et vivante, et rien d'autre (#9149)
  - les packs de stickers — boutique, installation par utilisateur, proposition par des tiers et modération (#9141)
  - un appel en cours se rejoint au lieu de s'arrêter, et un groupe réduit à un seul finit après la grâce (#9111, #9109)
  - un message anonyme par lien de partage garde ses adresses telles qu'écrites
  - une seule détection de langue, qui ne prend plus « légende » pour du portugais
  - une invitation d'appel se résout toujours — refus et absence de réponse annoncés à l'appel, sonnerie annulée et appel manqué pour l'invité (#8470, #8467)
  - l'historique des appels montre aussi les appels où l'on était invité sans être membre (#8468)
  - aucun filtre NOT n'écarte plus en silence les documents où le champ est absent (#8309)
  - à l'arrêt, la passerelle ferme ses sockets pour que les clients rejoignent aussitôt la nouvelle instance (#8297)
  - [[url]] n'est plus suivi ni réécrit, [libellé](url) entre dans la carte (#9093)
  - raccrocher un appel ne relit plus la session et la conversation (#9088)
  - un call:join ne liste les sockets de la room d'appel qu'une fois (#9087)
  - un commentaire porte un sticker dans la forme d'un message — descripteur validé dans metadata.sticker, image en média joint, servi hissé en REST et socket (#9080)
  - une publication suit chaque adresse qu'elle affiche — corps, textes de scène, légendes de média — et recalcule sa carte à l'édition (#9073)
  - viewing:activity relaie « regarde en plein écran » sans dire quoi (#9065)
  - la file des gestes viewing ne détache plus sa promesse de nettoyage (#9052)
  - l'attente des ouvertures avant authentification est bornée à 3 par socket (#9047)
  - une ouverture de conversation reçue avant l'authentification n'est plus perdue (#9047)
  - le push d'une édition porte lui-même l'annulation de la bannière d'avant (#9028)
  - toute activité remonte la conversation pour tous les participants (#9026)
  - GET /notifications?hideReadTypes= retire les lignes lues des types consommés (#8958)
  - une traduction garde ses adresses, mentions et hashtags (#9086)
  - le format d'un pack de stickers — trois genres, zones de texte d'Instant dont la validation prouve qu'aucun texte ne déborde (#9141)
  - le plafond quotidien du barème d'engagement se garde par prédicat — le tsc du gateway (strictNullChecks off) ne rougit plus l'image Docker

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.33.0

## 2.12.0

### Minor Changes

- Changements automatiques détectés :

  - le lecteur de la notification déployée tient sur un seul axe (#8859)
  - le fetch du magasin de série est @concurrent — plus de métadonnée de type étendue qui plante iOS 16/17 (#8182)
  - l'extension de contenu lie UserNotificationsUI dans son exécutable, la notification déployée n'est plus vide (#8859)
  - le barème lit le blanc de la charte, le plumage du colibri est déclaré illustration — le gate d'harmonie repasse au vert (#8879)
  - TypingIndicatorBubble n'est plus déclaré deux fois — la fusion de #8920 avait gardé la copie de MessageListViewController à côté de son extraction ; les jetons de #8877 passent dans le fichier extrait — run test
  - catalogue de la notification déployée en pt-BR, libellés avec valeur par défaut (#8859)
  - un seul crédit par personne ou par ensemble de membres
  - le (x) de la colonne se choisit par table ; les gates navigateur suivent les outils du fond (#8849)
  - la création rouverte reprend son format, l'édition d'une publication se sauvegarde seule (#8849)
  - la notification déployée fait écouter un vocal, explorer une position et lire une carte de visite (#8859)
  - éditer le fond ouvre les outils de droite en focus, plus l'ancien panneau Cadre (#8849)
  - le viseur armé, tenu, filme — toucher photo, tenir vidéo, glisser cadenas et zoom (#8849)
  - la ligne d'un éphémère échu peint le minuteur, plus une vignette vide — timer.badge.xmark n'existe pas (#8924) — run test
  - l'expéditeur attend la réception, puis suit l'échéance servie (#8905)
  - dev recompile sous Xcode 26.1.1 — les médias chargés d'une carte sont une donnée sans acteur
  - le cliquet d'accent reprend la référence de dev, qui a soldé son rouge (#8879)
  - le fil relit « N (M) 🔥 » à l'ouverture ; la pastille iOS nomme sa couleur accentColor
  - copier un lien de partage ou d'invitation retombe sur execCommand quand le presse-papier refuse (#8937)
  - les gardes de parité suivent l'alias du voile média, et le cliquet d'accent reprend le rouge hérité de dev (#8879)
  - la pastille relit l'état serveur à l'ouverture d'une conversation
  - le gate de design laisse story-compose.tsx au chantier du composer (#8879)
  - les visionneuses plein écran partagent un chrome commun — fermer, réagir, répondre, gestes (#8879)
  - la palette du SDK devient la seule source des couleurs du web, gardée par check-design-harmony (#8879)
  - Mee devient un colibri, en aquarelle, glyphe et réaliste (#8908)
  - rend à dev ce que la fusion de #8903 a perdu — la case de bannière conditionnelle (le SDK recompile) et le verre bord à bord de l'aperçu — run test (#8897, #8898)
  - pastille « 🔥 série · N (M) » dans l'en-tête et la rangée magnifiée, écran admin « Barème de points »
  - la vitrine ne remplace jamais une vraie session, n'accepte que l'hôte mort du port 9, et ses témoins gardent les champs optionnels affichés (Refs #8855)
  - le point indigo passe sur les auteurs, et une reconnexion repart d'un état vide (#8892)
  - une adresse relative se résout contre la base du document, jamais contre location.origin (#8901) — run test
  - pastille « 🔥 série · N (M) » dans l'en-tête et la rangée focale, mise à jour live
  - un éphémère échu disparaît vraiment — ni cache persisté, ni rangée morte, ni décompte qui repart au rechargement (#8900)
  - rend leur libellé accentHex aux deux appels voisins que le renommage avait touchés — run test (#8898)
  - qui est déjà là se voit à l'arrivée, et le point indigo passe sur les auteurs (#8892)
  - l'identité ne voyage que vers la passerelle — une pièce d'un autre hôte se charge sans jeton ni pré-vol refusé (#8901) — run test
  - Mee, la mascotte, ouvre l'écran Progression — elle compte, invite à frapper et célèbre (#8907)
  - la galerie remonte le voile de la story, et deux gardes suivent la cible 44 pt dans sa forme jeton (#8878, #8877)
  - le verre de l'en-tête reçoit l'accent sous son nom admis — cliquet des couleurs conforme — run test (#8898)
  - le plafond d'une page institutionnelle passe de 10 à 10,5 Ko, à confirmer par le porteur (#8877)
  - la citation apporte son média ; un média qui ne se charge pas le dit et se réessaie (#8901) — run test
  - un média qui ne se charge pas le dit et se réessaie ; la citation apporte son média ; une pièce chiffrée n'est jamais peinte (#8901)
  - le cliquet est inscrit au pbxproj et les gardes de parité web lisent les jetons MeeshyUI (#8877)
  - glisser → répondre, ← transférer, et l'icône Répondre au pointeur fin (#7559, #8899)
  - un éphémère mort ne renaît plus en message ordinaire depuis le cache (#7552) — run test
  - l'en-tête de l'aperçu est une bande de verre bord à bord, arête basse droite — run test (#8898)
  - la bannière in-app ne pose une case que pour une vraie vignette ou un contenu social — le type n'est dit qu'une fois, par la pastille (#8897)
  - « Plus tard » porte arrow.forward — la garde RTL de dev repasse au vert — run test
  - la relecture du lot — compteur lu par VoiceOver, cible sans trou, accent neutre et clé de carte (#8877, #8878)
  - un seul chrome pour tous les visualiseurs — fermer, menu, réagir, répondre (#8878)
  - toutes les vues suivent la charte visuelle (#8877)
  - l'élan suit la règle partagée, les Meesh frappées portent leurs dates, et le lien montre l'adresse publique (Refs #8855)
  - inscrire les fichiers de « est dans la conversation » au projet (#8892)
  - le pair qui a la conversation ouverte porte le point couleur primaire (#8892)
  - la scène se prépare, se remplit, s'ouvre après le voile et signale qu'elle est prête — lien servi sans passerelle, bandeau réseau hors champ (Refs #8855)
  - les fixtures remplissent les vraies bases — liste par le point réconcilié, messages et traductions, progression, mode de lecture (Refs #8855)
  - contrat « est dans la conversation » — viewing:start/stop/snapshot et couleur primaire du point (#8892)
  - session fictive posée ou retirée, et refus de tout vrai serveur (Refs #8855)
  - l'app lit la scène demandée et décode les fixtures du kit avec son décodeur de production (Refs #8855)
  - la fiche de contact se présente sur la fenêtre que résout DeviceLayout, pas sur une marche de scènes maison (#8858) — run test
  - ma nouvelle photo se montre partout où l'on me voit — conversations, membres, comptes de l'appareil
  - les littéraux de valeur identique deviennent des jetons MeeshyUI (#8877)
  - le kit habille les vraies captures — fond, titre, cadre — et dresse la planche contact (Refs #8855)
  - le script capture chaque scène sur les simulateurs dédiés, serveur injoignable, après le signal « prêt » (Refs #8855)
  - le kit exporte le contenu de la vitrine au format exact de la passerelle (Refs #8855)
  - deux simulateurs dédiés et des lanceurs de tests iOS ciblés (Refs #8855)
  - le vocabulaire de la charte visuelle — échelles et couleurs MeeshyUI complétées, charte § 2–5 (#8877)
  - micro ou position refusés dans la coque Android mènent aux réglages de l'app (#8882)
  - la photo et la bannière téléversées sont posées, et ma fiche publique les montre aussitôt
  - une carte de visite sans nom garde la catégorie Contacts que la passerelle déclare (#8858) — run test
  - la bannière in-app lit le détail là où la passerelle le pose — context.contentDetail imbriqué (#8858) — run test
  - PhoneChangeFlowModel déclare une deinit non isolée — pas de double libération sur iOS 26.1
  - le panneau (+) s'ouvre à la hauteur du clavier, bornée, et sa grille montre les 40 médias récents
  - les catégories du détail s'enregistrent dans le Set attendu ; banc de capture de la bannière in-app (#8858)
  - la NSE attache la carte d'une position et la vignette d'une vidéo, compose le corps du détail ; Plans, Contacts et Rejoindre deviennent des actions (#8858)
  - la bannière d'un message dit son contenu — position, contact, invitation, lien, sticker, vignette, réponse à une story
  - la création en cours se sauvegarde seule et revient après un kill — run test (#8848)
  - un lecteur unique du détail notifié — position, contact, invitation, lien — et la bannière in-app qui le rend (#8858)
  - viseur armé, l'appui long filme ; le fond s'édite par les outils de droite en focus — run test
  - le voile de l'aperçu de bannière est inventorié au verre, et la garde d'encoche ne scanne plus les fichiers de test — dev redevient vert (Refs #8821)
  - chercher ses contacts propose d'abord d'ajouter son numéro, en disant pourquoi
  - le numéro dit à quoi il sert sous le champ, et « Plus tard → » le laisse de côté depuis la ligne du libellé
  - témoin inscrit au pbxproj, clé morte retirée, glyphe après HeaderCallButtonsView — la suite iOS repasse (#8822) run test
  - « Ajoutez votre numéro » là où l'on cherche des gens, par le parcours SMS existant
  - « Plus tard → » sur la ligne du libellé, et ce que le numéro ouvre se lit d'emblée
  - la porte de l'aperçu ne teinte qu'à l'accent de la conversation — le cliquet des couleurs en dur revient à 441 (#8822)
  - le retour au premier plan rebranche le temps réel sans attendre le backoff (#8839)
  - le plafond de story_reader suit le menu (…) du lecteur — dev redevient vert
  - l'aperçu tiré de la bannière défile sous l'en-tête complet en verre, sans chevron (#8822)
  - la vitrine App Store raconte l'amour, le rire et le débat entre langues, avec de vraies photos et des vocaux traduits (Refs #8825)
  - l'aperçu s'ouvre à la souris, ses états n'ont aucun chevron, l'identité tient à 390 px (#8821)
  - l'extrait du post d'une notification sociale descend le Prisme du destinataire
  - « Enregistrer » dans le menu (…) du lecteur, pour tout lecteur
  - modernise concurrency sleep in InviteGroupCard and update quality review
  - un compte connecté rejoint un lien en « Anonyme » sans perdre sa session (#8816)
  - tirer la bannière vers le bas ouvre l'aperçu de la conversation — le fil défile sous son en-tête complet en verre, sans chevron (#8821)
  - les captures Android existent dans les sept langues
  - l'app se lit de droite à gauche en arabe
  - la couche d'appel et la bannière vivent hors de #root — une visionneuse ouverte ne les rend plus inertes (#8727)
  - voie du clavier vers le menu du fond, garde des encodeurs, budgets remesurés, gate du studio à la nouvelle géographie (#8715, #8794)
  - la porte de mise à jour mène à la vraie fiche App Store — apps.apple.com/app/meeshy rendait 404
  - la carte propose « Rejoindre ? » Anonyme / le compte nommé, et cite le message d'invitation ; catalogue des notifications à part (#8727)
  - colonne droite (effets du fond ou options de l'objet touché, historique en bas), carrousel d'effets à la place du socle avec miniatures et répétition, (+) de scène en barre haute, éclair puis Cadre après les portes, menus d'appui long du fond et du calque, bascule post → réel (#8715, #8794)
  - l'appel s'affiche par-dessus tout plein écran, interrompt la lecture et gèle la story (#8727)
  - la bannière in-app descend en relief et ne dit son aperçu qu'une fois (#8727)
  - la ligne dit le post, nomme le badge et propose Écrire / Se connecter à l'ami parrainé (#8727)
  - transitions d'ouverture/fermeture au document, mise en fond, bascule en réel, miniatures bornées et menus de scène — règles pures (#8715, #8794)
  - la ligne de la cloche ne répète rien et dit son contexte — règle pure (#8727)
  - la photo en deux temps — le premier toucher arme le viseur, le second n'importe où sur lui prend (#8715)
  - règles pures des rails de la scène et des transitions d'ouverture/fermeture (#8715, #8794)
  - copier un message n'annonce « copié » qu'une fois le texte dans le presse-papier, avec repli, web et coque Android (#8809)
  - la bascule automatique va vers le RÉEL (correction porteur) et le choix au chevron la verrouille ; garde deinit des vignettes — run test (#8793, #8792)
  - les glyphes Micro et Caméra de l'aperçu suivent Dynamic Type, bornés à leur cercle — aucune taille de police figée neuve (Refs #8795) run test
  - la page montre l'app sur iOS et Android — badges App Store et Google Play, captures des deux plateformes, liens institutionnels
  - la répétition part au premier tick et un tour après le choix — le premier effet visuel rejoue aussi (#8792) — run test
  - l'appelant choisit, contact par contact, ce que l'appelé voit et entend avant de décrocher — micro coupé et caméra activée par défaut (Refs #8795) run test
  - effets de scène en deux familles, vignettes réelles et répétition des transitions ; bascule post → story — run test (#8792, #8793)
  - une mention validée pose le curseur en fin de texte, jamais au milieu du pseudo (Closes #8791) run test
  - un brouillon tapé en milieu de mot s'écrit quand la page est masquée ou fermée, coque Android et web comme iOS (#8790)
  - l'écran d'appel suit enfin l'appel — plus de cycle SwiftUI, pilule vraiment masquée, réponse en double sans raccrocher, aperçu plein écran (Refs #8772) run test
  - ouvrir une conversation retire ses bannières de la barre de notifications, web et coque Android comme iOS (#8781)
  - le déclenchement manuel construit la ref demandée — plus de 409 « branch dev »
  - l'appel vidéo ne fait plus déborder la pile de l'iPhone, et la rangée de statistiques ne trappe plus au rendu asynchrone (Refs #8772)
  - le gate des utilitaires protège les apostrophes comme Tailwind — dev redevient vert
  - la pilule d'appel perd la classe before:content-[''] qu'aucune feuille ne sert — dev repasse au vert
  - le barème réglé par l'administration gouverne chaque crédit, par conversation et en temps réel
  - « est dans la conversation » — registre par socket, annonce et retrait temps réel (#8892)
  - un aperçu se coupe par point de code, jamais au milieu d'un emoji
  - barème d'engagement réglable et état « N (M) 🔥 » par conversation
  - la loi de la mascotte — événement et moment (#8907)

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.32.0

## 2.11.0

### Minor Changes

- Changements automatiques détectés :

  - « Et maintenant ? » ne saute plus — il attend la liste au démarrage et le pied de pagination garde une hauteur (Closes #8759) — run test
  - quote le path de CallManager+Speaker.swift dans project.pbxproj
  - expandMotif fusionne base+variant avec un typage complet de FrameLook (#8757)
  - le projet se relit dans Xcode et la géométrie « orbite » se type-vérifie à temps (Refs #8741, #8743)
  - la fenêtre d'appel résout sa scène par DeviceLayout et se montre au retour de l'app — run test
  - expandMotif fusionne base+variant avec un typage complet de FrameLook
  - les cadres entrent dans le mode Montage — puces d'ambiance, carrousel filtré par le nombre de personnes, capture au cadre (Refs #8742, #8743)
  - une bannière web se ferme quand sa notification est supprimée, comme dans la coque Android (#8752)
  - le rendu des cadres de capture — catalogue généré depuis le JSON partagé, géométrie à parité web, peintres CoreGraphics (Refs #8741, #8743)
  - les sorties du menu « … » se posent au commit qui l'ouvre — un Échap précoce ne ferme plus la feuille de story
  - en mode Effets, les autres restent à l'écran — un bloc en haut, hors de la capture (Refs #8737)
  - le moteur de rendu des cadres de capture — géométrie, textes, peintres, calques en cache (Refs #8741, #8743)
  - chaque bouton répond au premier toucher, les rangées défilent sans rebond, et les commandes de ma caméra encadrent ma vignette (Refs #8735, #8736, #8747)
  - les commandes de ma caméra encadrent ma vignette — Effets · Écran au-dessus, Retourner · Caméra en dessous, en verre interactif (Refs #8747)
  - chaque bouton de l'écran d'appel répond au premier toucher (Refs #8735, #8736)
  - le carrousel des modes suit le doigt — il ne choisit qu'une fois posé, n'est plus ramené sous le doigt, se lance sans butée et se saisit sur 88 pt (Refs #8736)
  - « Imager » cite la racine d'après le fil COURANT — les gestes suivent la liste et le prisme
  - 146 cadres en douze ambiances — chaque ambiance sert chaque nombre de 2 à 6, la signature Meeshy partout (Refs #8741)
  - en mode Effets, les autres participants restent à l'écran — vignette du duo, bande du groupe, glissée d'un coin du haut à l'autre (Refs #8737)
  - ambiances Fantastique, Futuriste, Glauque dessinées (Refs #8741)
  - le menu « … » des commentaires — copier, imager avec les réponses, modifier, supprimer, signaler — sur la publication, la story et le réel
  - menu « … » des commentaires de story — modifier, signaler, copier, Imager avec l'arbre (run test)
  - le projet committé redevient lisible par Xcode — meeshy.sh device compile de nouveau
  - six ambiances dessinées — Signature, Distingué, Élégant, Jovial, Déconnecté, Corporate (Refs #8741)
  - la carte « Imagine » porte les réponses d'un commentaire, et le presse-papiers a son repli
  - le contrat des cadres de capture — vocabulaire, schéma, règle de filtrage par nombre, témoins rouges du catalogue (Refs #8741, #8742, #8743)
  - l'appel se pose par-dessus tout plein écran et gèle la story — run test
  - la loi du menu « … » d'un commentaire — copier, imager, modifier, supprimer, signaler
  - boutons arrondis d'origine, le compte nommé, le message d'invitation en citation (run test)
  - notifications en relief, sans répétition, qui disent de quoi il s'agit — run test
  - bannière in-app en verre avec relief, page Notifications sans répétition (#8723, #8724)
  - « Rejoindre ? Anonyme / Mon compte » en capsules compactes pour un lecteur non membre
  - la vue d'appel vit dans sa propre fenêtre, au-dessus de tout plein écran (#8725)
  - le pbxproj committé enregistre les témoins et les sources du lot #8721 (xcodegen generate) — run test
  - la forme d'onde et l'export animé recompilent sous Swift 6 — accès exclusif au tampon PCM, générateur d'images envoyé une seule fois
  - l'image de la vidéo se lit sans envoyer le générateur, l'onde sans accès chevauchant — run test
  - l'accès au magasin audio ou vidéo du cache attend l'acteur — la cible de test recompile
  - l'appui long sur un média propose de le mettre en fond ou de remplacer le fond, et sur un fond de reprendre une photo
  - le menu d'appui long des objets et du fond de la scène est peint en verre (adaptiveGlass : Liquid Glass sur iOS 26, matériau avant)
  - CacheAccountBinder déclare sa deinit non isolée — la garde du core rougissait sur dev — run test
  - mon image zoomée en plein écran reste dans son cadre
  - une photo prise au composeur part originale si le développement ne se charge pas
  - développer une photo ne coûte plus que deux tableaux d’octets
  - un fond média offre ses effets à droite, leur carrousel remplace l'audience et Publier, et la scène remonte au-dessus d'un panneau du bas
  - le (+) nouvelle scène prend la place de l'éclair, l'éclair et le Cadre suivent le lieu à gauche, le rail droit porte les options du moment au-dessus d'annuler/rétablir ; toucher un objet ouvre ses options à droite, terminées par (x)
  - le journal réseau relu du stockage n'est cru qu'une fois reconnu
  - un refus de la préférence de dégradation n'empêche plus le plafond vidéo
  - le réglage Opus ne touche que la section audio qui porte Opus
  - la suite des fils revient sous sa dette de taille — le compteur de lectures de collecte part dans son propre module (Refs #8630)
  - un échec de bascule de caméra entre au journal de l'appel
  - la fiche d'un appel manqué ne montre plus une section « Qualité et réseau » vide de sens
  - le munging Opus remplace un paramètre fmtp espacé au lieu de le doubler
  - le profil d'appel lit le chemin réseau de la source unique du SDK, connu avant la première offre
  - le profil de données plafonne les émetteurs dès que l'offre ou la réponse les crée
  - la photo de scène se prend en deux temps — un toucher arme le viseur, un second n'importe où déclenche
  - le bouton de zoom de la vignette ne se pose que s'il reste une rangée libre au-dessus des commandes
  - une trame sans travail compte dans le budget — l'éclaircissement revient après une surcharge
  - le magasin du cache se lit en await hors de son acteur — run test
  - dev recompile sous Xcode 26.1.1 — await du magasin audio/vidéo, copie PCM sans accès chevauchant, générateur séquentiel non envoyé
  - la fiche d'un appel montre « Qualité et réseau »
  - le zoom de ma vignette se charge avec celui du plein écran, et les gates d'appel le mesurent
  - le journal réseau et qualité de chaque appel persiste par compte
  - la feuille qualité dit le profil de données et ses plafonds
  - un profil de données borne la vidéo, la voix Opus et la capture
  - le seau api cite l'entrée du catalogue, pas l'adresse en dur
  - zoomer ma caméra avant comme arrière, du bout des doigts ou d'un cran dans ma vignette
  - « Imager rapide » attend les pixels des médias avant d'enregistrer
  - la caméra arrière qui zoome le plus loin, et les lois du zoom sur les deux caméras
  - l'export rapide attend les pixels des médias — run test
  - la fiche d'un appel montre « Qualité et réseau » et sa transcription
  - la vidéo joue sans son bouton dans un export animé ; budget des catalogues d'« Imagine » remesuré
  - toutes les prises de vue passent par le développement unique, à l'endroit
  - un seul développement pour toute photo prise dans Meeshy
  - le commentaire du seau api cite l'entrée du catalogue, pas l'adresse en dur
  - « Imager » partout, l'atelier « Imagine » porte médias, format, Frame et GIF/vidéo — run test
  - l'appel en cours écrit son journal réseau et qualité
  - « Imager » partout, atelier « Imagine » avec Frame, Médias et GIF/vidéo ; messages et commentaires
  - l'écran reste allumé pendant un appel, comme dans la coque Android (#8701)
  - la feuille de qualité d'appel montre le profil de données et le chemin réseau
  - une seule loi du miroir de caméra pour l'aperçu, l'envoi et la capture
  - le doc-comment du seau api cite l'entrée du catalogue, plus l'adresse en dur — run test
  - profils d'économie de données en appel (Wi-Fi, cellulaire, économie, dégradé)
  - zoom d'un doigt dans les commandes caméra — pastilles 0,5×·1×·2×·3×, bouton replié de 44 pt
  - la symétrie caméra se décide en un seul endroit, sur la caméra qui livre les trames
  - la carte porte les médias, son format, l'onglet Frame et l'animation — un seul moteur, vignette comprise
  - journal réseau et qualité d'un appel, persistant et rangé par compte
  - le flux vidéo envoyé s'éclaire seul dans une scène sombre
  - caméra de conversation, composer, story et captures d'appel passent par le traitement unique
  - formats, pseudo, heures, médias d'un message ou d'un commentaire, GIF et vidéo
  - une section repliée affiche ses non-lus à côté du chevron — run test
  - un seul traitement de la prise photo — redressée, bornée, améliorée, métadonnées gardées
  - la carte porte ses médias, son format et son cadre ; la miniature garde son séparateur
  - une section repliée affiche le nombre de non-lus qu'elle cache
  - la disposition et les médias d'une carte Imagine deviennent des lois du SDK
  - texte à l'échelle de la scène réduite, double-toucher = édition sur scène, porte image = photothèque directe ; fusion de dev — run test
  - le texte saisi garde la part de la scène qu'il aura publiée — loi SceneCardProjection, taille peinte unique calque/champ, témoins
  - le catalogue perd les sept clés que la refonte au toucher n'emploie plus, et chaque zone de la carte déclare sa cible (Refs #8667) — run test
  - la saisie s'écrit à la pose et à l'échelle de la scène visible
  - les gestes de la scène vide, un par ligne, chacun sous son icône
  - scène vide sans appareil photo au-dessus du titre, un geste par ligne avec son icône — run test
  - la porte image ouvre directement la photothèque, le double-toucher d'un texte ouvre l'édition sur scène (WIP)
  - la sortie de session remet toujours les horloges de synchronisation à zéro après la liaison du cache (Refs #8674)
  - une réponse part avec le message éphémère qu'elle cite, chez son auteur aussi (#8630)
  - changer de compte garde la base de messages du compte quitté ouverte jusqu'à son retour ; seuls la déconnexion, la révocation et le retrait l'effacent (Refs #8674)
  - « Son » coupé, la coque Android ne sonne plus, comme le web et iOS (#8678)
  - le cache de chaque compte gardé est mis de côté au changement de compte et rendu à son retour avec son point de reprise (Refs #8674)
  - retirer un compte de l'appareil efface aussi son cache rangé et ses données locales
  - la scène vide tient sur petit écran, le zoom reste dans le viseur, l'état du film descend au-dessus du déclencheur
  - le seau api du service worker range chaque réponse sous son identité ; outbox, épingles et frappe d'un compte ne passent pas au suivant
  - cadenas dès l'appui, zoom au glisser vertical, curseur d'intensité du flash, scène vide commerciale — run test
  - chaque compte garde son cache, une requête en vol ne se résout pas sous le compte suivant
  - une scène vide qui donne envie, verrou et zoom au glisser pour la vidéo, curseur de verre pour l'intensité du flash
  - scène vide qui donne envie, cadenas et zoom au glisser pour la vidéo, curseur de verre pour l'intensité du flash (WIP)
  - le composer iOS se règle au toucher, en Liquid Glass adaptatif (#8667)
  - le composer d'export se règle au toucher — plateau à onglets, galerie cherchable, Liquid Glass (#8667)
  - la coque Android se construit signée pour le Play Store et un workflow la publie (Refs #8669)
  - la base d'un compte quitté quitte le disque une fois purgée — une écriture tardive ne la re-remplit plus (#8656)
  - la carte d'export nomme ses zones touchables et se cherche parmi ses templates (#8667)
  - le Cadre ouvert reçoit le focus par son (X) — la tuile qui l'a ouvert vient de devenir inerte
  - le sol blanc s'allume d'un coup, un appui relâché pendant que la lumière monte ne laisse aucun enregistreur tourner
  - une base locale des messages par compte et par environnement, basculée en synchrone au changement de compte (#8656)
  - un outil ouvert prend toute la place, la scène vide se capture d'un geste, le flash éclaire vraiment
  - VoiceOver annonce les réglages de l'outil quand ils occupent le rail — run test
  - la scène vide se capture d'un geste — toucher = photo, appui long = vidéo, (x) toujours là, vrai flash et sol blanc en caméra avant
  - un outil ouvert prend toute la place — ses réglages remplacent les portes, le reste du chrome s'efface
  - le préchargement des messages de la liste ne demande rien pour un autre compte que celui qui l'a lancé, ni pour un identifiant vide (#8651)
  - l'enveloppe de la scène qui cède ne prend plus le nom du calque de scène (Refs #8643)
  - la synchronisation de la liste appartient au compte qui la lance, et aucune URL ne part avec un segment vide (#8651)
  - répondre dans la feuille garde la cible lisible, et le fil repris ne peint plus d'anneau (Refs #8643, #8644)
  - lire les commentaires floute la scène, écrire la réduit au-dessus de la barre, le repli ⌄ vit dans la plaque (Refs #8643)
  - la scène d'une story se floute sous les commentaires, se réduit au-dessus du composeur, et le repli vit dans le verre (Refs #8642, #8644)
  - la loi de la scène qui cède — flou à la lecture, réduction à l'écriture (Refs #8643)
  - « Coller » une image en sticker fonctionne dans la coque Android (#8640)
  - l'horloge du film d'appel lit les chiffres du lecteur, et le témoin du fil d'aperçu ne compte plus la boucle d'enregistrement
  - VoiceOver annonce qu'une bulle flamme-œil disparaît après lecture (#8635)
  - la citation d'un éphémère échu dit « Message éphémère expiré », plus « Message supprimé » (#8631)
  - une flamme-œil reçue ne se lit plus en clair dans la ligne de liste ni dans la recherche (#8634)
  - une ligne complétée servie isEdited:false met à jour le contenu sans se graver « modifiée » (#8633)
  - le lecteur d'écran dit la protection d'un message — flamme-œil, éphémère, flou, vue unique (#8635)
  - un glissé du carrousel des montages n'est plus perdu (Closes #8619)
  - la citation d'un éphémère échu se lit « Message éphémère expiré », plus « Message supprimé » (#8631)
  - une flamme-œil ne se lit jamais dans la ligne de liste — placeholder servi par la passerelle et composé par le client (#8634)
  - une conversation découverte entre par la route riche, avec son aperçu
  - une ligne d'arrivées complétée met à jour l'aperçu iOS (#8565)
  - l'export ressemble au lecteur — pastille de son en verre animée, GIF animés, gabarits en cache (Refs #8609, #8610, #8611)
  - une édition du message cité ne ressuscite pas une citation scellée (#8562)
  - la réponse HTTP d'un envoi sert la citation par la garde unique (#8562)
  - message:new et message:edited scellent la citation d'un éphémère échu pour un lecteur (#8562)
  - une petite vignette porte aussi les commandes de ma caméra, repliées en un bouton qui déploie leur grille (Refs #8626)
  - filmer le montage ne redessine plus l'écran d'appel à chaque trame (Refs #8625)
  - le style choisi se déclenche — deux tapes pour la photo, appui long pour filmer le montage (Refs #8625)
  - une vue unique floutée garde son flou à l'ouverture d'un texte, une pièce s'ouvre en clair (#8567)
  - le lien de partage scelle la citation d'un éphémère échu pour son lecteur (#8562)
  - ouvrir la vue unique d'un texte flouté ne lève pas le flou (#8567)
  - une réponse floutée par contagion peut aussi être à vue unique (#8567)
  - le fil de réponses scelle la citation d'un éphémère échu pour son lecteur (#8562)
  - une ligne d'arrivées complétée met à jour l'aperçu, sans « modifié » (#8565)
  - GET …/messages scelle la citation d'un éphémère échu pour son lecteur (#8562)
  - les commandes de ma caméra vivent dans ma vignette, et en haut au centre quand mon image est en plein écran (Refs #8626)
  - la citation d'un éphémère échu pour son lecteur se scelle au site unique (#8562)
  - l'aperçu avant décroché se montre aussi sous CallKit au premier plan, tient jusqu'à la connexion, et propose le son d'emblée (Refs #8627)
  - message:edited d'une ligne complétée porte son systemEvent (#8565)
  - une notification révoquée quitte le tiroir de la coque Android (#8624)
  - la nomination de l'auteur devient un site unique
  - l'agent reçoit le nom du COMPTE, jamais un nom vide
  - Échap ferme le panneau ouvert sans réduire l'appel, le focus change de place au commit (Closes #8618)
  - changer la taille du texte d'Android ne redémarre plus la coque (#8616)
  - le modal réel se charge à la demande, le chunk story_studio remesuré à 25,31 Ko (Refs #8603)
  - la suite complète repasse au vert — chevron d'appel, trois gardes repointées, mesure Foundation (run test)
  - publier un post à une seule vidéo demande « Publier en réel ? », « C'est un Réel » par défaut (Refs #8603)
  - le ⋯ du composer remet au moteur la scène entière — stickers, retouches, sons (Refs #8599)
  - un glissé sans clic synthétique ne mange plus le tap suivant (Refs #8583)
  - écrire un commentaire de story fait le silence autour du champ (Refs #8601)
  - une scène minutée s'ouvre avec son curseur et grandit depuis le fil (Refs #8598)
  - quand on commente une story ou un réel, le chrome cède la place (Refs #8601)
  - glisser un commentaire à droite y répond, ses réponses se déplient et ses effets s'appliquent (Refs #8583)
  - une scène à timeline s'ouvre depuis sa carte, avec son curseur (Refs #8598)
  - le moteur reçoit ce que la scène tient en mémoire et peint les puces de son
  - la loi pure du glissé « répondre » d'un commentaire (Refs #8583)
  - le substrat synthétique quitte StoryExporter.swift (1335 → 1066 lignes) avant d'y ajouter (Refs #8599)
  - le fond vidéo et le fond image sortent à l'endroit — preferredTransform conjuguée au repère Core Image, orientation EXIF honorée (Refs #8600)
  - la carte d'une scène confie son cadre et son temps à la visionneuse (Refs #8598)
  - la cible de réponse de la feuille rend les deux lignes qu'elle prenait à la dette (run test)
  - la feuille de commentaires reçoit la cible de réponse par son init explicite
  - le plein écran s'ouvre vraiment dans la coque Android, comme sur le web (#8594)
  - l'option pressée d'un mode se peint par ses classes, sans verre repeint (Refs #8578)
  - les plans de l'écran d'appel — la pilule et ses panneaux au-dessus de ma vignette (Refs #8577, Refs #8579)
  - les gates d'appel mesurent la couche, les modes, le doigt, le pincement et le journal (Refs #8575, Refs #8576, Refs #8577, Refs #8578, Refs #8579, Refs #8580)
  - toucher un montage le garde — le carrousel vise le centre en position absolue (Refs #8580)
  - ma vignette reçoit le doigt — au-dessus de la colonne, et le toucher d'après un pincement (Refs #8577)
  - la contagion de réponse tient les gardes de warm-up, de taille figée et d'état armé
  - le Journal de l'appel, entier, et sa transcription dans la fiche (Refs #8579)
  - mon image — le zoom et le rail en plein écran, la vignette qui se pince en x1 · x2 · x3 (Refs #8576, Refs #8577)
  - six montages glamour rejoignent le carrousel Montage (Refs #8580)
  - glisser un commentaire à droite y répond, et ses effets s'appliquent partout (run test)
  - la carte d'export compile sur appareil — wrap ne capture plus measure dans une closure
  - la ligne de story, le fil de commentaires et l'aperçu du fil quittent leurs hôtes hors budget
  - pincer ma vignette la fait passer de x1 à x3 (Refs #8577)
  - la coupe en lignes de la carte d'export compile — fonction locale au lieu d'une closure qui capture une mesure non-escaping (Refs #8555)
  - mon image en plein écran se zoome et porte ses options caméra (Refs #8576)
  - une chose à la fois — panneaux à la place des rangées, modes Effets et Montage qui libèrent l'écran (Refs #8578)
  - le journal garde tout l'appel et se relit sans sauter (Refs #8579)
  - le contrôleur des captures d'appel déclare sa deinit nonisolated — MainActorDeinitSourceGuardTests repasse au vert (Refs #8555)
  - la découpe en lignes de la carte d'export compile (#8570)
  - une seule chose à la fois, les modes Effets et Montage libèrent l'écran (Refs #8578)
  - six montages glamour — couverture, doré, tapis rouge, pellicule, néon, noir et blanc (Refs #8580)
  - seul un téléchargement manuel vibre, jamais un auto-téléchargement
  - les rangées défilent au doigt et à la molette, sans accroche qui ramène à zéro (Refs #8575)
  - les rangées d'actions défilent au doigt (Refs #8575)
  - l'extension de transcription porte son Logger.calls ; le fichier rejoint le projet (Refs #8475)
  - micro coupé, ma voix n'est plus transcrite ni envoyée en sous-titres — iOS et web (Closes #8475)
  - la feuille d'export reçoit l'accentColor de la conversation (#8570)
  - exporter un message en image depuis son menu (#8570)
  - la réponse hérite du flou et de l'éphémère du message cité, verrouillés au composeur
  - moteur de la carte d'export d'un message en image (SDK)
  - ReplyProtectionContagion, miroir de la contagion des protections par la réponse
  - la réponse hérite du flou et de l'éphémère du message cité
  - la coque Android recharge l'app quand le moteur de rendu meurt, comme un onglet (#8564)
  - la ligne de liste dit les arrivées de Meeshy Global et le texte d'un avis non typé
  - un avis système que le serveur ne sait pas typer se lit par son texte, comme dans le fil
  - options d'outil en colonne à droite de leur porte, boutons flottants plus petits et plus hauts — run test
  - une flamme-œil consommée ne réapparaît pas au retour du lecteur
  - options du (…) en rangées horizontales, effets de visage et captures en montage — web et iOS (#8555)
  - Sauvegarder et Partager, langue d'export, métadonnées Meeshy dans le PNG
  - templates de carte d'export, filigrane « Meeshy @pseudo », anonymat des auteurs
  - la feuille d'export devient un composer simplifié, avec format par défaut (#8553)
  - un message et sa réponse s'exportent en image signée Meeshy (#8553)
  - porte le correctif de loupe de #8545 (gate « mode de lecture » rouge sur dev)
  - la coque Android montre le fond d'une vidéo sans aperçu, comme le web (#8547)
  - le texte se déplace, se zoome et se tourne au doigt dans son éditeur (#8540)
  - importer plusieurs médias d'un coup, une scène chacun, et une adoption de pré-montée imperceptible (#8540)
  - l'espace qui pend en fin de ligne ne compte plus comme encre de l'élu
  - run test — Focal, seul le contenu de l'élu grandit et ses contrôles répondent au premier toucher
  - en Focal, seul le contenu de l'élu grandit ; ses contrôles restent à l'échelle 1 et répondent au premier toucher (Refs #8536)
  - en Focal la loupe ne porte que le contenu de l'élu, son cadre débordant reçoit le toucher, la date ouvre les détails, un flou se lève d'un toucher (Refs #8537)
  - le doigt qui déplace le texte en édition reste à la saisie — capturé par la scène, il n'y arrivait plus (Refs #8535)
  - le texte en cours d'écriture se déplace, se pince et se tourne au doigt sans quitter l'édition (Refs #8535)
  - la teinte du Cadre passe aussitôt sur le sol, et le décodage tient sans `Image.decode` (Refs #8534)
  - le sol du studio ne scintille plus — une image ne cède sa place qu'à une image décodée, en fondu (Refs #8534)
  - la porte du fond importe plusieurs médias d'un geste — une scène par image ou vidéo, le surplus refusé et compté (Refs #8533)
  - sur grand écran, la bande (Cadre, fond) flotte en carte à côté du rail droit (#8532)
  - sur iPad et Mac, le composer de story suit la maquette grand écran (#8532)
  - le texte alternatif d'un média de post est lu par VoiceOver — run test
  - retoucher une image de conversation ne la dégrade plus et ne perd plus l'original
  - le corps du Cadre défile sans écraser ses champs, le titre « Filtre » suit ceux du Cadre ; D-151 (Refs #8517, #8518)
  - une vidéo éditée remplace la pièce jointe en attente — message et citation de post
  - une republication mise en file hors ligne garde son lien d'origine et ses stickers animés
  - le son de fond et le sticker de bibliothèque d'un post voyagent avec le brouillon durable
  - un post ou un réel de M scènes remis par l'atelier part en UNE publication
  - un média du studio porte son texte alternatif, et le fond choisit son filtre dans le Cadre
  - éteindre Animé rend la scène statique, et la frise se range par la tuile Temps, comme iOS
  - l'unité des secondes de la frise se traduit (Refs #8516)
  - les plaques du studio restent bornées au bureau, et le retour comme Échap ne ferment que la couche du dessus
  - on écrit un texte sur la scène au doigt et à la souris
  - le cliquet des couleurs iOS enregistre le filet retiré du verre Focal — 443 → 442 (Refs #8506)
  - le retour Android referme le menu de modération et l'alerte « Retirer de l'appel » (Refs #8504)
  - le filtre de slide va au fond, celui d'un média posé reste sur lui, à l'aller comme au retour de CanvasV3 (#8502)
  - un objet média porte son propre filtre, l'éditeur n'offre que ses outils, la barre haute redescend (#8474)
  - la scène respire et reste dans l'écran, la frise se règle à la main, le post se rédige dans un cadre de verre (#8474)
  - un commentaire se signale — atteint par sa publication, jamais le sien
  - un commentaire se signale — cible atteignable par sa publication
  - une notification sur un commentaire porte le post qui le porte, le badge « Invités venus » nomme l'invité (#8724)
  - la suite des fils de conversation revient sous sa dette de taille héritée après #8630
  - la réponse morte pour un lecteur ne garde pas son texte d'origine (originalContent), et les gardes comptent la chaîne citée (#8630)
  - une réponse meurt, pour son lecteur, avec le message éphémère qu'elle cite (#8630)
  - la contagion de réponse tient les gardes de taille et de lecture de Message
  - les gardes de vérification d'adresse quittent auth.ts, revenu à 959 lignes sous le budget de 1000
  - la destruction d'un message cité fixe l'échéance de ses réponses (#8630)
  - une règle unique dit quand un post à une seule vidéo propose le réel (Refs #8603)

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.31.0

## 2.10.0

### Minor Changes

- Changements automatiques détectés :

  - le tampon de l'élu ne borne plus sa loupe ; le gate mesure le cadre
  - le bloc de verre de Focal est la matière du panneau du composer, vrai verre d'iOS 26 — run test (Refs #8506)
  - en Focal, identité, bande et tampon vivent dans le cadre de l'élu, agrandis de x1,2 encore
  - en Focal, l'identité, la bande et l'heure de l'élu vivent dans son cadre, agrandi de 20 % (Refs #8506)
  - voir et entendre l'appelant avant de décrocher (#8480) (#8498)
  - la scène garde 10 px de chaque côté et rien ne déborde, ✕ et ⋯ redescendent, plafonds remesurés, captures du lot 7 (Refs #8474, #8482)
  - plafond du chunk story_studio porté à 25 Ko, remesuré à 23,1 Ko après le lot 7 (Refs #8474)
  - frise réglable à la main, post rédigé dans un cadre de verre, filtre propre à chaque média posé (Refs #8474)
  - on voit et, si on le choisit, on entend l'appelant avant de décrocher — passerelle et web (#8494)
  - la fenêtre d'une piste se déplace et s'étire, écart minimal 0,05 s comme iOS (Refs #8474)
  - les requêtes ne dépendent plus de AbortSignal.any, absent avant Chromium 116 (#8481)
  - la coque ne plante plus à la connexion quand FCM n'est pas configuré (#8477)
  - publier suit le délai de grâce de l'adresse — passerelle, iOS et web alignés
  - le retour Android referme les feuilles de l'écran d'appel (Refs #8466)
  - le gate des contrôles d'appel, et l'écran d'appel sous son plafond
  - la frise et le sol du composer passent par les couleurs du thème (#8457)
  - le retour Android referme le studio de retouche au lieu de quitter le fil (Refs #8460)
  - les actions du duo tombent dans les colonnes de la pilule (#8459)
  - lot 6 du composer plein écran — disques sans libellé, sélection silencieuse, plaques en bas, sol teinté, frise de la maquette
  - frise de la maquette — 6 s, Entre ici / Sort ici, pose à la tête, fantôme hors fenêtre
  - le composer plein écran suit la directive du 2026-09-27 — petits boutons, sélection silencieuse, frise de la maquette (#8457)
  - Ajouter, Réagir, modérer et choisir l'enregistrement à l'écran
  - la fiche d'un appel compte ses réactions ; les actions d'un groupe se coupent en rangées de quatre (Refs #8433, #8438, #8439)
  - la pilule est un vrai bloc Liquid Glass et le (…) s'y déploie (#8459)
  - ajouter une personne, modérer et réagir pendant l'appel — contrôleur, verbes socket et vues (Refs #8433, #8438, #8439)
  - l'enregistrement choisit audio ou vidéo ; la fiche compte les réactions
  - le moteur invite, coupe un micro, se laisse couper et réagit
  - on choisit d'enregistrer l'appel en audio seul ou en vidéo, capté par ReplayKit (Refs #8437)
  - les gardes de vérification d'adresse quittent auth.ts, revenu à 959 lignes sous le budget de 1000
  - la loupe de l'élu grossit de 26 % et ne s'écrête plus sur la hauteur

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.30.0

## 2.9.0

### Minor Changes

- Changements automatiques détectés :

  - la participation d'une personne invitée porte sa langue du Prisme
  - le contrôleur du zoom déclare sa deinit nonisolated — ses tests ne plantent plus en abrt (Refs #8445)
  - call:invite-participant fait sonner un ami, qui décroche par l'appel ordinaire
  - le verre des boutons de sonnerie passe par son site ; gate effets hors composite
  - le panneau des effets n'importe rien de l'écran d'appel ; budgets remesurés
  - audit — chaque bouton a un effet, et chaque verre est seul
  - une personne invitée dans un appel en cours y entre, et seulement dans cet appel
  - on zoome sa caméra — pincement, molette et capsule « − 1× + »
  - la garde des couleurs iOS documente les fonds du panneau Cadre (#8414)
  - la sonnerie d'appel sort de CallEventsHandler dans call-ring.ts
  - « Effets » dans le rail de mon image, et son panneau de verre
  - boutons de verre interactifs, actions au-dessus de la pilule, glissé progressif vers le PiP
  - run test — story : légende posée sur le composeur, repli ⌄ / glissé bas, ni flamme ni vue unique en commentaire
  - réactions relayées et comptées, micro coupé par l'admin de l'appel
  - la caméra envoyée passe par les effets ; call:analytics les nomme
  - pincer sa propre image zoome la caméra envoyée
  - les effets de ma vidéo — règles, traitement des images, port du moteur
  - le type d'enregistrement (audio ou vidéo) voyage avec la demande d'accord
  - mode Animé (frise, une piste par objet) et retouche d'une image du fil dans le studio plein écran
  - le micro coupé reste coupé à chaque naissance de piste ; le PiP ferme le plein écran
  - contrat partagé des contrôles d'appel et réactions servies dans la fiche
  - un seul chemin vers la conversation, « Conversation » à droite de Réduire
  - le micro coupé avant le média naît coupé et s'annonce coupé
  - la taille rendue d'une retouche lit le rapport de SceneShape, captures des lots 3 à 5 (#8416)
  - les plafonds des catalogues et du studio de story suivent le composer plein écran (#8425)
  - lois du mode Animé — une piste par objet, une durée de scène, relues par le lecteur
  - une image du brouillon d'un message s'édite dans la scène plein écran et repart dans le fil (#8416)
  - le chunk du studio et les catalogues repassent sous leur plafond (Quality rouge depuis la fusion de #8425)
  - retours de revue de #8425 — message du socle selon le format, Cadre en verre, sol du composite
  - les poignées passent au-dessus de la saisie ; captures web du composer plein écran ; D-146
  - la scène plein écran se compose animée — bascule « Animé » et frise où chaque objet a sa piste (#8415)
  - sur téléphone, plus aucune colonne ne glisse de côté et la connexion tient dans la vue (Refs #8418)
  - gates et témoins du composer plein écran réécrits sur la nouvelle règle
  - la coque Android dessine le refus des notifications et porte sa propre icône de barre d'état (Refs #7307)
  - le composer plein écran suit iOS — scène entre la barre et le socle, ⋯ Aperçu, texte du post, tuiles, sol thumbhash, panneau Cadre
  - le panneau Cadre choisit Ajuster ou Remplir et le fond des bandes d'un média de fond (#8414)
  - le lecteur peint les bandes d'un fond ajusté du fond choisi au Cadre
  - lois du composer plein écran — Cadre du fond, texte du post, aimantage, sol thumbhash
  - réponse, édition et pièces jointes vivent dans le verre du composeur
  - croix et socle hors de la scène, texte du post au socle, rail droit en tuiles, sol thumbhash, limites et lignes magnétiques — run test (#8370)
  - la scène du composer prend tout le viewport, le chrome flotte dessus — run test (#8370)
  - le dépliage d'un message long n'est plus avalé par le plafond d'invalidations du fil — run test (Refs #8232)
  - la vue d'appel « C adapté » repasse les trois gardes qu'elle faisait rougir (Refs #8394, #8396)

## 2.8.0

### Minor Changes

- Changements automatiques détectés :

  - un message long déplié se déroule en 300 ms sur la courbe du web, le repli fait glisser ses voisins (Refs #8232)
  - le préchauffage du premier rendu lit burningEphemeralIds — le témoin du warmup repasse au vert (Refs #8382)
  - dans la coque, la rangée d'un document en cours d'envoi n'ouvre plus le blob à la place de l'app (#8402)
  - la vue « C adapté » — pilule de verre, rails, rangées, une, sous-titres
  - la porte de l'e-mail trouve sa fenêtre par DeviceLayout — la garde des parcours de scènes repasse au vert ; carte des décisions du gateway (Refs #8285)
  - le volet de légende dégage les rails flottants, le verre du socle est teinté du plateau (#8388, #8370)
  - vue d'appel « C adapté » — pilule unique, rails, mise à la une, sous-titres par personne
  - règles pures de la vue « C adapté » — une, couleur, langues, verre d'appel
  - l'écran d'appel se découpe par responsabilité et repasse sous son budget
  - les rails flottants du composer passent en verre teinté du plateau (#8370)
  - toucher un message flouté le révèle sur place ; le plein écran n'arrive qu'au toucher suivant (Refs #8389)
  - « Prévenir mes contacts quand je reviens » et « Quand un contact revient » se règlent sur le web
  - toucher un message flouté le révèle sur place, le plein écran attend le toucher suivant — run test (#8389)
  - un éphémère qui échoit à l'écran brûle et quitte Focal, Script et Bulles sans attendre une écriture en base (#8382)
  - « X était sur Meeshy récemment » ouvre le profil de X — cloche, bannière, coque, catégorie Contacts
  - « X était sur Meeshy récemment » se lit, se règle et ouvre le profil de X — run test
  - le lien de parrainage partagé depuis la coque vise l'origine publique (#8385)
  - la citation se vise par son marqueur, plus par son libellé français — « Peaux web » repasse au vert (Refs #8320)
  - le socle du composer flotte au bas de la scène, sur verre (#8370)
  - une photo reçue par push rejoint l'album Meeshy au réveil — run test (#8358)
  - un média protégé mis en file hors ligne repart avec sa protection, par le POST après TUS — run test (#8350)
  - la coque Android écrit les médias reçus dans l'album Meeshy par @capacitor-community/media (#8336)
  - un éphémère déjà échu rechargé quitte le fil dans les quatre modes, sans pierre tombale (#8352)
  - la coque Android déclare le plugin de galerie @capacitor-community/media 9.1.0 (squelette, #8336)
  - toucher une case d'un message flouté multi-images ouvre CETTE pièce, en Bulles comme en Focal — run test (#8340)
  - le cliquet des entrées TS mortes enregistre l'appel de la flamme-œil par le catalogue (332, #8342)
  - la consommation flamme-œil passe par l'entrée générée, et une flamme-œil vue au milieu du fil compte comme vue (#8342, #8343)
  - les rails du composer flottent sur la scène, qui prend toute la largeur
  - un message long se déplie de nouveau dans le fil — la passe de layout revient, sans animation — run test
  - la scène du composer prend tout l'écran, les contrôles flottent dessus
  - le cliquet du catalogue Swift enregistre l'entrée que la garde de l'e-mail consomme (#8365)
  - la garde de l'e-mail lit ses routes dans le catalogue, et son poids de catalogue est documenté (#8365) — run test
  - dans une réponse, la citation d'un audio se joue sur place par le lecteur partagé, et VoiceOver nomme l'écoute et le saut (#8320)
  - dans une réponse, la citation d'un audio se joue sur place et le reste ramène au message, même hors fenêtre (#8320)
  - publier sans adresse vérifiée ouvre la validation de l'e-mail, et l'action repart au code validé (#8365)
  - raccrocher ne rouvre plus la bannière « Appel en cours · Reprendre » (#8366)
  - la zone lecture d'une citation sait quelle piste jouer, et refuse un audio protégé (#8320)
  - les images et vidéos reçues s'enregistrent seules, une fois, dans l'album Meeshy (#8307)
  - nonisolated deinit sur les deux classes des lots flamme-œil et protections collantes — run test (Refs #8303 #8305)
  - une protection armée reste armée dans la conversation jusqu'à ce qu'on la change — run test (#8305)
  - la flamme-œil de la bulle se pose au bord d'attaque, visible (#8303)
  - la flamme-œil et les 15 s au sélecteur d'éphémère, retirée à la sortie après lecture (#8303)
  - toucher une vidéo reçue ouvre le plein écran ; la lecture dans le fil ne garde que son, pause/lecture et plein écran (#8234)
  - la pierre tombale des citations sort du chunk realtime pour servir aussi la flamme-œil (#8304)
  - le verre de l'inscription n'écrit qu'aux encres qui tiennent AA sur lui (#8288)
  - témoins alignés sur les protections collantes, scellement des citations sans tirer le chunk realtime (#8304, #8306)
  - toucher une image floutée ouvre le plein écran en Rivière et depuis la case de grille — run test
  - la flamme-œil et 15 s rejoignent l'éphémère, la flamme-œil se consomme en quittant le fil, et une protection armée reste armée dans la conversation (#8304, #8306)
  - Rivière — la citation d'un audio ou d'une vidéo montre son aperçu et s'ouvre en plein écran (#8283) — run test
  - une citation d'audio ou de vidéo montre son aperçu et s'ouvre en plein écran (#8233)
  - actions en un clic et cartes de verre sur la fiche d'un membre (#8289)
  - le verre de l'inscription tient AA — le gate de contraste redevient vert
  - l'enregistrement ne fait plus planter iOS 16/17 ni 26.1, les tests d'appel gardent leur hôte
  - la coque recule au retour d'un lien suivi au lieu de rester sur « Ouverture du lien… » (#8322)
  - la flamme-œil se consomme par lecteur — route after-read/consume, échéance posée à la consommation, surfaces servies sans le plafond de rétention (#8302)
  - la coque Android enregistre seule les images et vidéos reçues dans l'album Meeshy (Refs #8308)
  - squelette — auto-enregistrement galerie coque Android (Refs #8308)
  - le glyphe play du poster vidéo se dimensionne par son cercle, plus par une police figée — run test (Refs #8231)
  - le choix du serveur n'apparaît qu'au simulateur iOS et en développement web (#8287) — run test
  - l'appelé voit la caméra de l'appelant dès le décroché
  - la fin par départ relit elle aussi le statut après un P2034 et retente (#8293)
  - le bit EPHEMERAL_AFTER_READ (flamme-œil) rejoint les effets de cycle de vie
  - le journal des appels liste les appels sans hiddenForUserIds — #8294
  - CallSession.hiddenForUserIds naît vide (@default([])) — #8294
  - la fiche d'un membre s'édite en place, section par section (#8289)
  - un P2034 au raccroché relit le statut et retente la fin au lieu de laisser l'appel « en cours » (#8293)
  - l'inscription en phases vivantes — téléphone en verre qui ondule, carte d'identité avec son code, « Parler aux autres » (#8288) — run test
  - changer de compte sans mot de passe, « Déconnexion » garde le compte listé (#8286) — run test
  - le gabarit .env du gateway ne porte plus d'identifiants MongoDB réels (Closes #8296)
  - la carte de l'inscription garde la session qu'elle ouvre, sans titre en double (#8288)
  - l'inscription se déroule en phases vivantes — téléphone en verre, adresse, carte d'identité avec son code, « Parler aux autres » (#8288)
  - plusieurs comptes sur l'appareil — changer de compte sans mot de passe, déconnexion distincte (#8286)
  - plus d'effacement manuel du Répertoire — le carnet part avec le compte (#8284)
  - plus d'effacement manuel du carnet — la politique dit qu'il part avec le compte (#8284)
  - la flèche de Publier choisit, seul Publier envoie
  - la célébration de l'arrivée passe avant l'onboarding, fusion de dev — run test
  - l'appelant garde son audio et l'appelé rattrape « connecté » après une relance ICE
  - le garde de derive compte les commits de son contexte de build
  - le sceau de la célébration suit la taille de texte, sans taille figée (#8089)
  - appels de groupe iOS — maillage p2p, grille, qui parle (#3585)
  - la célébration de l'arrivée précède l'onboarding et lance le préchargement (#8089)
  - les destinataires du retour se lisent depuis la projection du cadrage — le balayage #4642 remonte la chaîne (Refs #8285)
  - « X était sur Meeshy récemment » — amis et carnets prévenus du retour, une fois toutes les 3 h par X (Refs #8285)
  - une flamme-œil à vue unique suit la destruction de la flamme, jamais la réévaluation « vue unique héritée » (#8345)
  - la bannière d'un éphémère à durée annonce sa vraie durée, pas « 7j » (#8344)
  - la suite des routes admin revient sous sa dette de taille héritée (#8289)
  - le témoin d'enregistrement des routes users n'attend plus clearContactsDirectory (#8284)
  - renommer un membre et renvoyer une vérification depuis l'administration (#8289)
  - l'inscription sert le jeton d'attente avec la session (#8288)
  - supprimer son compte efface son carnet synchronisé et ses notifications (#8284)
  - la courbe du dépliage d'un message long devient un jeton partagé web/iOS (Refs #8232)

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.29.0

## 2.7.0

### Minor Changes

- Changements automatiques détectés :

  - le mot de passe « facile » tire des chiffres quelconques — environ 350 000 secrets au lieu de 30 000
  - effacer son carnet d'adresses depuis l'app, sans resynchronisation silencieuse (#8167)
  - le consentement à l'enregistrement d'un appel, son indicateur et sa réécoute depuis la bulle
  - l'échéance d'activation se lit par WireDate
  - la passerelle arbitre le consentement à l'enregistrement d'un appel et rattache le fichier à la bulle
  - une revendication d'adresse dit ce qu'elle retire, s'éteint si elle n'est pas prouvée, et refuse un numéro transféré (#8227)
  - l'étoile de la note d'appel prend MeeshyColors.warning au lieu d'une couleur en dur (#8072)
  - une adresse non vérifiée ne reçoit que les e-mails qui la prouvent — garde centrale (#8238)
  - le cliquet des entrées mortes du catalogue TS descend à 335
  - la vidéo du fil se lit inline à trois contrôles, son toucher ouvre le plein écran (run test)
  - le journal des appels se cherche par nom et se filtre « vidéo » côté serveur (#8203) (#8246)
  - jeu inline minimal (son, lecture/pause, plein écran) et toucher de surface qui ouvre le plein écran
  - le témoin du poster vidéo tourne sur le MainActor, où vit la conformité Equatable (run test)
  - « Validez votre compte » de J7 à J28, à l'ouverture de l'app (run test)
  - toute action venue d'un e-mail prouve l'adresse et active le compte (#8238, #8236)
  - les sessions existantes suivent le délai de grâce — REST, refresh, socket (#8238)
  - la connexion et l'inscription suivent le délai de grâce de l'adresse (#8238)
  - la carte de note appelle son modèle par des fermetures, les témoins comparent une note non optionnelle (#8072)
  - la vérification du numéro par SMS quitte AuthService (#8238)
  - la loi du délai de grâce de l'adresse — quiet, invite, blocked, done (#8238)
  - l'aplat d'attente du poster cité passe par une couleur résolue une fois — run test (#8230)
  - la citation d'un audio ou d'une vidéo s'ouvre en plein écran, même hors fenêtre — run test (#8230)
  - une citation de vidéo montre son poster, une citation de vocal son onde (#8230)
  - la pièce citée se reconstruit depuis les faits de la citation, jamais pour un secret (#8230)
  - la citation optimiste porte l'adresse du fichier cité sauf secret (#8230)
  - la citation porte l'adresse du fichier cité, jamais pour un média protégé (#8230)
  - le badge play du poster garde les cotes 64/44 que la loi de la Lentille relit (run test)
  - le poster vidéo ne promet pas à VoiceOver un geste qu'il ne porte pas (run test)
  - une vidéo du fil est un poster, le toucher ouvre le plein écran (run test)
  - après un appel, on le note en un geste (#8072)
  - le poster vidéo patiente sur son thumbHash pendant l'extraction de la première image
  - le cliquet du catalogue TS compte les deux adresses d'images de membre posées par l'administrateur (Refs #8217)
  - une adresse prise montre son détenteur masqué ; « ce n'est pas moi » + code la transfère (Closes #8214)
  - créer un compte et poser photo et bannière depuis la console web
  - adresse déjà utilisée — lien de connexion en un geste, « Est-ce vous ? », run test (#8216)
  - les mots de passe proposés font 6, 8, 12 et 16 caractères — « facile » prend la forme lisible sans se deviner
  - une session E2EE indisponible ne fait plus clignoter le retry rouge à l'envoi d'un message direct — run test (Closes #8221)
  - l'administrateur pose photo et bannière d'un membre, et la création refuse un pseudonyme pris
  - le mot de passe « simple » se tape sans se deviner — touches voisines, chiffres proches, pseudo parfois
  - l'administration écrit une adresse normalisée et refuse un doublon à la casse près
  - « Appels hors contacts » ouvert à tous par défaut ; les anciens false ne ferment plus rien (#8073)
  - « Appels hors contacts » obéi par la passerelle, iOS et le web
  - « Appels hors contacts » devient un réglage actif, et l'appelant refusé lit le motif dans sa langue (#8073)
  - la passerelle refuse de faire sonner un non-contact quand « Appels hors contacts » est coupé (#8073)
  - sortie audio et micro choisis depuis l'écran d'appel, feuille Qualité en direct
  - refuser un appel avec un message rapide (#8065)
  - le témoin du lien profond d'appel passe au routeur une fermeture @MainActor
  - journal d'appels paginé, effaçable, cherchable, participants de groupe (#8066)
  - le journal web nomme les participants d'un appel de groupe
  - le cliquet des couleurs iOS enregistre les boutons d'appel de la fiche profil
  - une notification corrigée remplace sa bannière Android, comme sur le web (#8201)
  - le journal nomme les participants d'un appel de groupe (passerelle)
  - « Rappeler » compose vraiment l'appel, sur iOS et le web
  - iOS 16 et 17 se lancent et se connectent de nouveau — preuve sur 17.5 après fusion de dev (Closes #8182) — run test
  - les types de fonction async stockés disent leur isolement — iOS 16 et 17 ne plantent plus au lancement ni à la connexion (#8182)
  - les mots de passe proposés à l'administrateur partent en Cache-Control: no-store
  - un compte à activer entend pourquoi et où chercher le code (#8186) run test
  - rendre le dixieme essai de generateUniqueToken effectif
  - le dépliage d'un message long tient dans une image, et le verre de Focal est vérifié sur iOS 17 — run test
  - un message long déplié loin du bas se déroule sous son extrait, même le haut sous le chrome
  - en Bulles, le verre du déplié épouse la bulle — et « Lire la suite » déplie le bon message
  - l'effacement du journal d'appels nomme son refus 401 et son témoin n'imite plus ce qu'il teste
  - les cliquets de catalogue enregistrent DELETE /calls/history/:callId
  - deux suites de routes reviennent sous leur dette de taille héritée après #8116
  - la bannière d'une carte de visite dit « 👤 <nom> », jamais son fichier
  - effacer une ligne ou tout son journal d'appels, et y chercher un nom (#8066) (#8174)
  - « Aller au message » depuis la liste atterrit sur le fil, pas sur le Résumé vivant — run test
  - la pellicule de la visionneuse dessine « média indisponible » pour une vignette introuvable
  - une carte de visite se dit « Contact partagé · nom » dans l'aperçu de la liste et « 👤 nom » en citation
  - le segment Contacts de l'écran Médias rend des cartes de visite, pas des documents
  - toute lecture d'une conversation répond à un non-membre comme à un identifiant inexistant
  - la bannière Android d'une conversation remplace la précédente, comme sur le web (#8171)
  - le cache des cartes de conversation se vide au logout et au changement de compte
  - la passerelle propose quatre niveaux de mot de passe à l'administrateur (#8051)
  - la politique tient sous son plafond, le catalogue remesuré (#8167) run test
  - sous la coque Android, un lieu partagé ouvre l'app de cartes par geo: (#8262)
  - un appel s'enregistre avec l'accord de tous et se réécoute depuis la bulle
  - la tuile « Contact » du composeur envoie une carte text/vcard (#8242)
  - de J7 à J28, « Validez votre compte » s'ouvre à l'ouverture de l'app
  - la clé et la réécriture de l'index vivent hors du port de l'écran des médias
  - la case « adresse vérifiée » de « Créer un compte » est cochée par défaut
  - les médias et l'infrastructure réseau adressent la passerelle par le catalogue généré
  - les publications, les stories et les notifications adressent la passerelle par le catalogue généré
  - la visionneuse ouverte depuis l'écran des médias offre Enregistrer, Réagir et Créer avec ce média
  - les liens de partage et de suivi adressent la passerelle par le catalogue généré
  - la note d'après-appel au plus une fois par jour, son chunk borné (#8072)
  - les conversations et les messages adressent la passerelle par le catalogue généré
  - le profil, l'annuaire et les communautés adressent la passerelle par le catalogue généré
  - l'authentification et le compte adressent la passerelle par le catalogue généré
  - les appels adressent la passerelle par le catalogue généré
  - l'administration adresse la passerelle par le catalogue généré
  - « Est-ce vous ? » sur une adresse déjà prise — récupérer ou revendiquer (#8216)
  - la coque ouvre Conditions et Confidentialité par leur adresse publique (#8213)
  - une adresse déjà utilisée à l'inscription reçoit le lien de connexion en un geste (#8216)
  - « Appels hors contacts » se bascule dans la confidentialité, et l'appelant refusé lit le motif (#8073)
  - borner le refus avec message à 500 caractères, et consigner la décision (#8065)
  - le décodeur des propositions de mot de passe passe à zod/mini — dev repasse sous le plafond de poids (#8051)
  - un compte à activer entend pourquoi et où chercher le code (#8186)
  - sous-titres traduits d'un appel dans les deux sens
  - toucher un média dans le fil ouvre la visionneuse de TOUTE la conversation, avec Enregistrer, Réagir, Répondre et Créer avec ce média
  - les lois de la visionneuse conversation-entière et de ses quatre actions
  - une carte de visite citée ou listée dans les accusés se nomme par son contact
  - le détail de qualité d'appel se charge au toucher (#8047)
  - un relevé de qualité lent n'en chevauche pas un autre (#8047)
  - la qualité d'un appel se voit — indicateur, détail, alertes du pair ; gate de dégradation simulée (#8047)
  - le moteur d'appel mesure, adapte et rapporte la qualité ; alertes du pair (#8047)
  - qualité d'un lien, paliers par pair, survie vidéo et rapport de fin d'appel — lois pures (#8047)
  - la feuille de réinitialisation propose quatre niveaux de mot de passe et laisse l'administrateur le saisir
  - serializeVCard et contactCardFileName, miroirs de VCardWriter et de l'export iOS (#8242)
  - le catalogue d'API généré se scinde en un module par groupe et encode ses paramètres
  - les codes d'erreur d'appel quittent video-call.ts pour tenir le budget ; témoins de sonnerie ouverts (#8073)
  - les catalogues d'adresses connaissent POST /admin/users/:userId/password-proposals
  - régénère le catalogue d'adresses et l'énumération iOS pour la route des propositions de mot de passe (#8051)

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.28.0

## 2.6.0

### Minor Changes

- Changements automatiques détectés :

  - après un appel, on le note en un geste (#8072)
  - refuser un appel avec un message rapide (#8065)
  - le projet Xcode n'inscrit plus deux fois les témoins du partage d'écran
  - les trois classes du partage d'écran déclarent nonisolated deinit {} — run test
  - le pictogramme « média indisponible » de la galerie suit Dynamic Type
  - le pictogramme de la carte de visite suit Dynamic Type, borné à son cercle de 36 pt
  - la durée d'une tuile de l'écran Médias passe par la locale — LocalizedNumber.duration
  - le menu d'une ligne de conversation parle la langue du lecteur (#8154)
  - parité web du bloc de verre — verre neutre bordé d'un filet d'accent, « Lire la suite / Réduire » à l'encre du texte, souligné — run test
  - les témoins du partage d'écran sont inscrits au projet committé
  - le dépliage n'invalide plus le layout hors du site unique (mémo de la pastille de jour) ; garde de la matrice Focal rebornée
  - le déplié garde son bord de lecture — recalage du défilement au tour suivant ; témoins du défaut Script alignés
  - la cible compile de nouveau — partage d'écran sans lazy nonisolated, CoreVideo importé, SampleHandler Sendable
  - un message long se déplie en place, sur un bloc de verre Focal, et Script devient le mode par défaut
  - un message long se déplie sur place en Focal, sur un bloc de verre
  - Script devient le mode de lecture par défaut
  - appeler une conversation depuis le menu de sa ligne
  - squelette de la loi de l'extrait d'un message long — miroir Swift de longMessageExcerpt
  - une carte reçoit le changement de sa conversation sur le MainActor, sans saut de file — run test
  - VoiceOver dit aussi le compte Meeshy d'une carte de visite quand il est connu
  - la Rivière rend aussi la carte de conversation et la carte de visite — run test
  - la rangée « est sur Meeshy » tire ses initiales du nom de l'acteur, jamais de la phrase du titre
  - initiales de lettres et libellé VoiceOver complet sur la carte « amis trouvés » — run test
  - VoiceOver annonce une carte de visite par son contact, jamais par un nom de fichier
  - un média introuvable affiche un état d'erreur dessiné avec « Réessayer »
  - l'app reconnaît les liens de l'hôte web de l'environnement sélectionné
  - rejoindre ou quitter met à jour toutes les cartes de la même conversation
  - la carte de conversation se rend en Focal, Script et Rivière comme en Bulles
  - la fiche de carte de visite place « Sur Meeshy » après les champs, comme iOS
  - un média introuvable dessine « Média indisponible » dans la visionneuse, la pellicule et la grille — jamais une image brisée
  - Rejoindre ou Quitter depuis une carte relit toutes les cartes de la même conversation
  - la carte de conversation résout l'avatar de l'inviteur et la bannière comme tout portrait, et retombe sur les initiales si l'image échoue
  - les initiales d'un avatar ne retiennent que des lettres — « Théo (foot) » donne « TF », jamais « T( »
  - un seul sélecteur d'écran à la fois, et le pair arrivé pendant un partage l'apprend
  - partager son écran pendant un appel, sur le web
  - le catalogue TS compte aussi les deux cartes générées (#8099)
  - le catalogue Swift compte les deux cartes générées pour le web (#8099)
  - le cliquet des couleurs iOS enregistre l'écran « Médias, liens et documents »
  - l'image dans l'image s'ouvre DANS le geste — la fenêtre s'enregistre, le bouton l'appelle sans import() (#8046)
  - l'onglet Médias devient « Médias, liens et documents » — sept segments sur l'index de la conversation, cherchables, même depuis la liste
  - sans SMS, « Tu ouvres la voie » ne promet plus d'invitation qu'aucun bouton ne tient — run test
  - la coque accuse la remise d'un push de message, comme le web et iOS (#8124)
  - l'onboarding propose de retrouver ses amis, « X a rejoint Meeshy » se lit et s'actionne, et « ne pas me proposer » s'active
  - les cliquets de catalogue TS et de couleurs iOS enregistrent la carte de visite et la carte de conversation
  - le service de carte nomme ses deux routes — le cliquet des entrées de catalogue Swift mortes repasse à 275 (Refs #8099)
  - carte de visite alignée sur le contrat — « demande reçue » est un état, région de l'appareil envoyée, fixture Android partagée — run test
  - « Ne pas me proposer à ceux qui ont mon numéro ou mon e-mail » se règle dans la confidentialité
  - l'écran des médias rend la carte de visite (#8101) et la carte de conversation (#8099) du fil, désormais dans dev
  - listMedia choisit ses genres et cherche — kinds= et q=, un index persisté par genre purgé en bloc
  - « X a rejoint Meeshy » ouvre le profil de l'arrivant — cloche, bannière et coque
  - « X a rejoint Meeshy » se range sous Contacts, à la teinte de sa famille
  - carte de visite — état « Demande envoyée » sur une ligne, modèle injectable pour les rendus
  - la carte 4 sait où en est la proposition « retrouver tes amis » — squelette et témoins
  - les sept genres de l'index d'une conversation — ConversationMediaKind, partition des pièces et clé d'index par genre
  - une carte de visite partagée s'affiche en carte, s'ouvre en fiche de verre copiable et remonte le compte Meeshy à connecter ou à qui écrire
  - ConversationMediaCatalog déclare sa deinit non isolée — la garde MainActorDeinitSourceGuardTests repasse au vert (Refs #8095)
  - carte — libellés d'action centrés, bannière de repli en dégradé sur la carte (Refs #8099)
  - carte de visite partagée — vCard envoyée en pièce jointe, bulle carte + fiche Liquid Glass copiable, résolution du compte Meeshy
  - carte de conversation sous le texte d'un message — Rejoindre, Rejoindre en anonyme, Quitter | Ouvrir (Refs #8099)
  - l'écran « Médias, liens et documents » d'une conversation, depuis sa feuille de détails
  - la bulle et l'image dans l'image deviennent des chunks frères de l'écran d'appel (#8046)
  - partage d'écran pendant un appel (ReplayKit + call:toggle-screen)
  - le témoin des accusés de fixtures appelle la fabrique avec sa vraie signature ; un choix de périphérique qui lève se dit (#8046)
  - carte de conversation — titre sous l'avatar, statistiques sur une ligne, boutons empilés quand ils ne tiennent pas (Refs #8099)
  - la bulle d'appel, l'image dans l'image et la feuille des périphériques (#8046)
  - toucher une ligne du journal ouvre la fiche de l'appel
  - carte de conversation — dégradé typé, initiales locales, témoins d'URL isolés MainActor (Refs #8099)
  - la passerelle relaie le partage d'écran (call:toggle-screen)
  - règles de la bulle, de l'image dans l'image et des périphériques d'appel (#8046)
  - le port de l'index d'une conversation et la visionneuse qui feuillette toute la conversation
  - parseur et rédacteur vCard purs (2.1/3.0/4.0) pour la carte de visite partagée
  - la loi des sept genres de l'index d'une conversation — chaque segment ne garde que ce qui est le sien
  - la galerie garde sa page quand l'index s'étend, et Réagir n'existe que sur une pièce chargée — run test
  - carte de conversation dans la bulle — Rejoindre, Rejoindre en anonyme, Quitter | Ouvrir (Refs #8099)
  - carte de conversation — modèle du contrat et règle des actions (squelette, Refs #8099)
  - la galerie d'une conversation feuillette l'index de ses médias, même jamais chargés (Refs #8095)
  - l'index des médias d'une conversation — MessageService.listMedia (view=media) et CacheCoordinator.conversationMedia (Refs #8095)
  - la croix « Fermer » de l'inscription vit dans sa zone, le formulaire ne défile plus dessous — run test
  - mise en avant et retrait d'un participant dans un appel de groupe
  - un code de vérification refusé se dit dans la langue de l'interface, depuis le code d'erreur de la passerelle — run test
  - un pseudo trop long se signale sous le champ pendant la saisie et ne part pas ; un refus de schéma sur le pseudo se pose sous lui — run test
  - un seul jeu de règles d'appel, lu par la passerelle et par iOS (#8074) — run test
  - appeler depuis une fiche, gate des appels rejoints, bannière qui se tait dans le fil
  - le lien de validation d'e-mail est une célébration — feu d'artifice, préchargement, puis les conversations
  - la borne du pseudo se dit pendant la saisie et bloque l'envoi ; un refus de schéma sur le pseudo parle au lecteur (Refs #8082)
  - un lien d'invitation ouvert sur iPhone rattache le compte créé à son parrain — run test
  - un refus de schéma nomme son champ sous la forme déclarée et n'est plus une « erreur non rattrapée » ; la borne du pseudo a une source unique (Refs #8082)
  - fiche d'un appel, lien profond /call/:id, pavé et bandeau « Reprendre l'appel »
  - Rejoindre sur la ligne de liste et dans l'en-tête du fil, Rappeler depuis la cloche (lot 3 des appels)
  - l'écran du code dit « Adresse confirmée ✓ » quand le lien a été ouvert ailleurs, sans jamais connecter ce téléphone (Refs #8083) — run test
  - presence:app-state, sessions d'appel, fiche, pavé et démarrage vers une personne — les règles (lot 3 des appels)
  - la release de la coque Android est signée par une clé hors du dépôt, publiée dans assetlinks ; plafond de reels porté à 16 Ko
  - le lien d'e-mail ouvert sur un téléphone est remis à l'app avant d'être consommé ; l'écran du code dit l'adresse confirmée ailleurs (Refs #8083)
  - ouvrir le lien de l'e-mail pendant la feuille du code la referme avant d'ouvrir la session — run test
  - le gate du journal d'appels raccroche par localisateur — l'écran change de phase sous le doigt
  - le retour Android ne ferme que la couche du dessus quand deux feuilles sont empilées (Closes #8078)
  - œil du mot de passe — la saisie survit au re-masquage, fusion de dev (Refs #8054) — run test
  - re-masquer le mot de passe ne vide plus la saisie à la frappe suivante ; l'œil de l'inscription dit « Afficher le mot de passe » — run test
  - « Rappeler » gardé par son effet ; le moteur d'appel n'éclate plus le point d'entrée
  - un code valide referme l'écran de vérification et fait entrer dans l'app — plus de feuille figée — run test
  - œil afficher/masquer sur chaque champ de mot de passe — fusion de dev (Refs #8054) — run test
  - sans numéro, l'inscription mène à l'écran du code au lieu d'entrer dans l'app — run test
  - le code de parrainage part avec l'inscription (#8058)
  - chaque champ de mot de passe s'affiche ou se masque d'un bouton œil
  - un lien d'e-mail à jeton est servi par le code déployé, jamais par la coquille d'une version en attente
  - chaque champ de mot de passe porte un œil qui affiche ou masque la saisie (#8054)
  - s'inscrire sans numéro mène à l'écran du code ; avec numéro, la session comme avant
  - rappeler depuis le journal et la bulle d'appel, caméra de la coque Android, témoins
  - écran d'appel, pastille, bandeau d'attente et bouton d'appel du fil
  - moteur d'appel audio et vidéo — signalisation, WebRTC pair-à-pair, sons, magasin (squelette)
  - s'inscrire sans numéro passe par une alerte qui dit à quoi il sert — run test
  - s'inscrire sans numéro passe par une alerte qui dit ce que le numéro protège
  - un email inconnu à la connexion mène au code reçu ; le code ou le lien de l'email ouvre la session
  - un email inconnu à la connexion mène à l'écran du code, qui connecte — run test
  - le code se saisit sous le compte à rebours, avant « Rien reçu ? » (Refs #8034)
  - un email inconnu à la connexion mène au code ; le code ou le lien de l'email ouvre la session (Refs #8034)
  - la touche Entrée du clavier logiciel annonce « Envoyer » dans les composeurs (Closes #8031)
  - le retour Android ferme le tiroir de l'administration au lieu de quitter l'écran (Closes #8020)
  - le segment de transcription du fil se mappe dans le SDK — l'app ne pouvait pas le nommer
  - un toucher ouvre le contenu protégé dans les trois modes, l'appui long ne l'ouvre plus — run test
  - KeyboardFirstScrollGate déclare sa deinit nonisolated — la garde iOS 26.1 repasse au vert — run test (Refs #8000)
  - toucher d'un message protégé — média caché en plein écran direct, appui long sans fuite — run test
  - les sons des contenus publics rejoignent de nouveau la bibliothèque, et leurs médias ne sont plus balayés — run test
  - toucher un média flouté ou à vue unique l'ouvre directement en plein écran ; l'appui long garde la forme protégée
  - lot 6 — 189 constats appliqués sur 31 groupes de fichiers (mort, jumelles, ré-évaluations, simplifications) — run test
  - la coque Android déclare les permissions de position — la tuile Position demande au lieu d'être refusée (Closes #8007)
  - les emojis partent en série — le filet de dédoublonnage par contenu épargne un message d'emojis seuls — run test (Refs #7985)
  - la feuille de profil se referme dans le geste qui ouvre la page complète
  - le fil iPhone cesse de s'abonner au modèle de liste qu'il ne fait que remettre à la porte de composition (#7714, point 4)
  - deux publications redondantes retirées — un dérivé déjà couvert par son parent et une pagination des demandes envoyées que rien n'appelait
  - huit hôtes qui ne faisaient que retransmettre le modèle de liste cessent de s'y abonner (#7714, point 4)
  - retire deux vues jamais montées que seul un témoin de source tenait vertes, et leurs dix clés de catalogue orphelines
  - retire 32 déclarations internes sans appelant — helpers, shims legacy, types de la liste de commentaires supprimée
  - retire 61 membres privés et wrappers SwiftUI sans lecteur, et un fichier Swift orphelin hors cible
  - la note d'après-appel s'enregistre et entre dans l'agrégat (#8072)
  - le balayage du cadrage remonte le rappel d'une chaîne de tableau et un élément de Promise.all
  - trois témoins suivent les comportements livrés par #8099, #8101 et #8105
  - l'inscription, la preuve d'e-mail, la vérification et le changement de numéro/e-mail annoncent l'arrivée aux carnets, après la réponse (Refs #8105)
  - « X a rejoint Meeshy » — annonce aux carnets qui contiennent l'arrivant, une fois par paire, regroupée, dans la langue du destinataire (Refs #8105)
  - carte — requiresAccount décrit le lien ; carte publique déclarée à la couverture d'authentification (Refs #8099)
  - « ne pas être trouvé » est honoré par toutes les résolutions identifiant → compte (Closes #8104)
  - POST /contacts/resolve — une carte de visite partagée remonte au plus trois profils publics, sans jamais servir l'identifiant apparié
  - carte de conversation — GET /links/:identifier/card et GET /conversations/:id/card (Refs #8099)
  - la recherche de comptes par carnet est bornée en IDENTIFIANTS soumis, seau partagé par match, sync et /directory/contacts (Refs #8104)
  - un lien direct ne dit rien à un non-membre — même 404 qu'une conversation inexistante (Refs #8099)
  - l'index d'une conversation couvre audios, documents, liens, contacts, conversations et lieux, et se cherche
  - cinquième vue de la collection — ?view=media indexe tous les médias visuels d'une conversation
  - l'exclu d'un appel reçoit call:force-leave et quitte la room
  - l'écran du code apprend que l'adresse est prouvée ailleurs — jeton d'attente + POST /auth/verification/status ; le lien et le code sont deux clés distinctes (Refs #8083)
  - le code de parrainage voyage avec l'inscription — rattaché à la création du compte, actif ou non
  - l'entrée decisions/ du 2026-09-26 suit la convention du dossier (un seul titre `## `)
  - titre `## ` (niveau 2) pour l'entrée decisions/ du 2026-09-26
  - sans numéro, l'inscription attend le code — aucune session avant la preuve de l'adresse
  - un vocal enregistré sur le web est stocké en M4A et se lit sur iOS
  - la vérification d'adresse ouvre la session ; staging marque ses e-mails
  - une adresse inconnue devient un compte à la connexion ; la porte e-mail seul envoie code + lien (#8033, en cours)
  - loi d'extrait d'un message long (25 %, coupé au mot) et cotes partagées du bloc de verre Focal
  - notification.ts et notification-strings.ts repassent sous le budget de 1000 lignes
  - catalogues d'adresses régénérés — /conversations/:id/card et /links/:identifier/card
  - contrat de la carte de visite partagée — type PublicContactAccount, schémas de /contacts/resolve et parseVCard pur (2.1/3.0/4.0)
  - carte de conversation — inviteur, message d'invitation, jonction anonyme (Refs #8099)
  - contrat de la carte de conversation — type et schéma de réponse (Refs #8099)

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.27.0

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
