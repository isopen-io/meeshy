# @meeshy/gateway

## 1.36.0

### Minor Changes

- Changements automatiques détectés :

  - deleteNotIn sur page non exhaustive + décodage table entière sortent du client
  - 518 et 519 designaient QUATRE lecons — les deux miennes passent a 522 et 523
  - le fil ne recalcule plus tout l'historique sur un signal étranger à son contenu
  - le rattrapage des messages passe par le forward watermark after
  - le document refuse de remettre au navigateur l'adresse INTERNE de la passerelle — et /healthz le dit
  - une revalidation sans changement ne repaie plus le corps complet
  - les conversations consomment le delta-sync du gateway au lieu de tout retélécharger
  - la LÉGENDE d'un média atteint enfin le lecteur — et le type déclaré cesse de se perdre
  - durcit le correctif #5186 — purge chunkée + direction de panne côté DELETE
  - revalidate() des conversations ne purge plus au-delà de la page reçue
  - un ratio MESURÉ survit à l'aller-retour v3 — le pont cesse d'en fabriquer un
  - le CANVAS d'un post voyage enfin jusqu'au fil — et la carte optimiste le porte
  - le démarrage à froid tient en une poignée de requêtes — le plein descend par /sync en pages d'ancre
  - --radius-md disparaît — champs en lg, tuiles en lg, .saut en pill (#5178)
  - l'accordéon de join rend le verdict des droits, plus seulement leur nom (#5175)
  - canonicalize language equality in MessageActionsBar and its 5 divergent twins (#5173)
  - le drapeau original/traduit d'un message canonicalise ses codes de langue (#5167)
  - propagate a failed message-list read instead of a silent empty page (#5165)
  - dev se réintègre AVANT les gates, et Playwright se joue par projet — les deux leçons du tour 1
  - remesure documents_du_fil et documents_de_la_galerie après dev
  - les fixtures de test suivent les ONZE modules après la fusion de dev
  - `links` déclare enfin son état de session dans jetons-de-vues.json
  - médias, profil membre, story indisponible et fermeture d'un lien
  - le convertisseur socket cesse d'écraser translations et isEdited (#5145)
  - une borne de lecture SEULE ouvre la fenetre -- ma propre analogie avait cree une divergence
  - un post a enfin un CORPS qu'on peut écrire — la porte CONTENU entre dans la rangée canonique
  - .bandeau p porte --color-text, pas --color-text-muted
  - le temoin du brouillon attend l'EFFET du module, plus une minuterie — la CI dev repasse au vert
  - la légende SORT enfin du composer, et la langue se choisit où le texte se valide
  - la date et l accusé se posent au bas de la bulle — la ligne qu ils occupaient disparaît
  - le module du composer DIT qu'il est arme, et son temoin cesse de dormir
  - la cloche s'observe par ce qu'elle fait PARTIR — seam du service de notifications et temoin de boucle au niveau VM
  - la cloche emprunte le curseur que le serveur lui sert — et le doublon redevient un SIGNAL
  - les trois chaines alimentent la fenetre -- un clip rogne joue enfin sa fenetre
  - le correctif de fusion n'etait pas DANS la fusion
  - les deux surfaces de lecture SAVENT jouer une fenetre -- il leur manque qui la leur donne
  - la galerie des medias se compare pleine, et un serveur de test ne laisse plus d'orphelin
  - le NAVIGATEUR DE ZONE — la coquille ne se reconstruit plus, et l'ecran quitte meurt proprement a chaque traversee
  - les bornes de LECTURE arrivent au modele -- un clip rogne cesse d'etre invisible au fil
  - la zone a son TRAVAILLEUR — le role premier se relit hors ligne, et un seul worker detient la portee de l'origine
  - un paramètre `locale` INERTE est pire qu une absence — et le formatage des tailles avait déjà sa source
  - le bon modèle au bon moment — fable décrit, sonnet et haiku développent, opus relit et corrige à chaque travail
  - l objet DIT l état de son asset — « MONTÉE EN COURS · 34 % — 4,8 / 14,2 Mo »
  - un format porte UN mot -- et le temoin en a trouve deux de plus que je n'en avais vu
  - un temoin qui depend d'un artefact de build ne juge pas le code
  - un glyphe figé à 13 pt dans une capsule qui, elle, s'étire
  - DEV était cassé par mon élargissement de CameraResult — trois consommateurs manqués, et le compilateur déguisait la cause
  - l'etat vide et le heros portent la charte du tour 3 (#5115)
  - /feed se rafraichit au retour — la question 13 tranchee par une quatrieme voie
  - le brouillon du composer survit — un module de 441 o, et sessionStorage
  - chaque navigation fond-enchaine au lieu de flasher — View Transitions inter-documents et prechargement des hubs, zero octet execute
  - la banniere en application, sur la loi partagee — une seule, trois clients
  - le bandeau de reponse cite comme les deux autres peaux -- et la regle redevient PURE
  - la PLACE OÙ DÉPOSER une pré-montée — adopter par FICHIER, pas par identifiant
  - la rangee plate cite comme la bulle -- le texte part du deux-points, la miniature se pose sous l'auteur
  - la loi de la PRÉ-MONTÉE — et sa garantie tient à la FORME, pas à un catch
  - le TROISIÈME lecteur voit le recadrage — et la projection prend deux axes
  - le recadrage traversait la passerelle SANS AUCUN LECTEUR — le web le voit, et le fil le déclare
  - la boîte de notifications se prolonge au-delà de ses trente premières lignes (#5105)
  - `aspectRatio = 1.0` disait « carré » ET « pas encore mesuré » — l'absence devient représentable
  - une story part avec son audience REELLEMENT choisie — et la duree annoncee est celle que le serveur applique
  - on publie un post ou une humeur depuis /composer — deux onglets servis, l'audience qui MUTE la charge
  - la vignette d'une slide ouvre son FOND — la porte qui manquait à l'éditeur d'objet
  - un exclude qui désigne un dossier de RUNTIME rend le dépôt inconstructible depuis un clone
  - une citation part du deux-points de l'auteur, et sa miniature se pose sous lui
  - les réels connectés jouent dans le MÊME lecteur que les réels partagés (#5101)
  - l appui long sur la scène DÉCIDE — photo à la levée, vidéo si l on tient, menu si un fond y est déjà
  - iOS emprunte enfin le curseur des notifications — plus de rang par defaut, la paire du temoin portee cote client
  - l'éditeur plein écran se manipule — rail détaché, outil qui se referme, texte qui rappelle le clavier
  - un chrono bâti sur les segments CLOS reste figé pendant toute la prise
  - l'espace membre ouvre les quatre écrans que rien n'atteignait (#5094)
  - un trou de sequence declenche la resynchronisation /sync — le hook gapDetected sert enfin les conversations
  - un aperçu qui se REMPLACE ne peut pas grandir — le viseur devient unique et enveloppe le socle
  - le delta des conversations passe par /sync — un aller-retour, fusion par champs servis, repli NOMME
  - la photo arrivait COUCHEE, le seuil trahissait la visee, et (x) devient [ ]
  - le moteur de sync devient une famille de quatre fichiers — l'extraction qui rend #4172 greffable
  - le commentaire part sans emporter l'ecran — huitieme module, le fil s'echange, la voix du geste servie
  - la prise du viseur n'arrivait JAMAIS sur la slide -- scene noire et pastille muette etaient un seul defaut
  - un commentaire s'ecrit depuis /post/:id — le chemin pauvre d'abord, saisie tenue, motifs dits
  - creer un lien n'emporte plus l'ecran — la feuille postee par fetch, le carnet echange, trois reponses trois gestes
  - le verrou d'enregistrement se glisse vers la DROITE, et il se voit approcher
  - la recherche devient INCREMENTALE — debouncee, un seul vol par saisie, et l'ecran n'est plus jamais recharge
  - le SDK possede un client /sync — trois issues nettes, les champs qu'il demande, et le 304 enfin atteignable
  - le recadrage entre au CONTRAT -- une borne normalisee, appliquee par le compositeur, jamais un reencodage
  - accepter et refuser une demande deviennent optimistes — et le refus est REVERSIBLE, fenetre et focus compris
  - une permission refusee DIT pourquoi -- « noir » n'etait pas un etat, c'etait trois etats confondus
  - le rattrapage de la liste ne demande que les deux champs qu'il lit — fields= sur /sync, borne prouvee dans les deux sens
  - le declencheur ecrasait le volet de description -- ce que le viseur OCCUPE devient une regle
  - l'apercu naissait a ZERO, le chrome flottait hors de la scene, et le mode se choisissait au lieu de se lire
  - la surface DOCUMENT quitte l'hote du composer -- 1248 lignes, plafond 1200
  - /notifications vit en direct — arrivee, lecture, compteur et « Tout lire » optimiste, sans un rechargement
  - la boîte du mémo d'images animées écrit sa `deinit` nonisolated — NSCache la libère où il veut
  - « pivoter » avait son champ et pas son ecrivain -- le quart de tour existe enfin
  - la prise en SEGMENTS -- relacher clot, le bandeau compte, la croix retire un fichier, la coche pose
  - les options de l'editeur plein ecran s'ancrent EN BAS -- deux causes, et aucune ne suffisait seule
  - la loi des SEGMENTS -- un segment est un fichier, le retirer en supprime un, valider n'en reencode aucun
  - le viseur en scene a un flash, une bascule d'objectif -- et surtout une SORTIE
  - bun.lock recopie les versions des manifestes — trois champs restes au numero d'avant la release
  - les outils d'un POST descendent sous l'avatar, a gauche, comme en story
  - une prise du viseur en scene se POSE par le chemin de la feuille, et le viseur se retire
  - le viseur en scene porte sa barre -- trois pastilles, un declencheur, et une phrase qui DIT le geste
  - la porte de PARTAGE porte le canal élargi — un site d'appel né pendant l'élargissement
  - l'appui long ARME le viseur DANS la scene -- la feuille modale ne s'ouvre plus
  - l'import orphelin du spec tableau — TS6133, la CI type-check l'a vu avant moi
  - un objet partage depuis une autre app peut se COMPOSER avant de partir (vue 2a)
  - une story citee garde sa SCENE dans les quatre modes, et la riviere marque enfin les transferts
  - la capacité de détourage porte son type AVANT le ternaire
  - /chats n'elevait AUCUNE de ses deux surimpressions en modale
  - les deux erreurs de compilation du lot — isolation d'extension, et un ternaire non inférable
  - les trois témoins de la mémoire d'images animées déclarent @MainActor
  - coller un GIF le pose comme sticker ANIMÉ, et détourer un sujet le fait entrer dans la bibliothèque
  - /chats connecte rendait 500 — le { params } d'App Router entrait dans la couture et se faisait appeler comme un fetch
  - la loi du viseur EN SCENE -- trois pastilles, trois gestes, et la pose qui reutilise la galerie
  - l'adresse rendue sur /links s'ouvre enfin — identifier mshy\_\* pris pour un linkId, des deux côtés
  - le routeur de staging reclame les six ecrans connectes livres de la v3
  - la feuille « nouvelle conversation » — deux gestes, et le succes mene AU FIL
  - la MOITIE PRODUCTION du lot 5054/5055 -- 240ed2a931 n avait pousse que ses temoins
  - plus aucune porte ne monte un composer historique -- et l ancrage publie enfin
  - Echap ne ferme pas la feuille des liens, et le temoin le DIT
  - la feuille « nouveau lien » — trois chemins pour la fermer, aucun champ decoratif
  - le socle de la feuille « nouveau lien » — ce que la passerelle accepte, et le champ inerte qu'elle n'appliquera jamais
  - un message transfere se voit avec le MEME nom dans toutes les peaux
  - editer et republier une story ouvrent le MEUBLE, plus l'atelier nu
  - une legende depliee se lit sur le media -- ni voile, ni barre
  - les reglages, un theme a trois etats et la lecon 500
  - un second fixture de test oubliait 'affiche' — Test web-v3 rouge sur #5062
  - les six ecrans de reglages, et un theme qui change vraiment
  - /feed et /composer entrent dans V3_ZONE_PREFIXES — check-v3-pipeline rouge sur #5062
  - MediaDeStory.affiche manque a un fixture de test — CI rouge sur #5062
  - les hashtags COLLENT au bas de la scene -- 77 pt de letterbox refermes, et l'ORDRE ne suffisait pas
  - le socle des réglages — six écrans servables, et les quatre qui ne le sont pas
  - un texte encore vide se DIT vide -- VoiceOver ne s'arrete plus sur un separateur orphelin
  - fonds et effets se listent en grille verticale, le nom SOUS la boite -- et trois pastilles cessent de mentir sur leur couleur
  - les deux bandes de la scene s'alignent enfin sur le MEME bord
  - /feed sert le fil social — aimer, reposter, rail de stories (#5031)
  - le panneau de profil d'un participant s'ouvre en modale sur le fil (§ 12.10.3)
  - l'app cesse de planter au lancement -- le warm-up ne rend plus rien
  - les passe-plats d'horloge de la story appellent la porte qui existe
  - sheet:lang — choisir une langue change le texte lu, et l'annonce à voix haute
  - l'éditeur d'objet s'exploite clavier levé, et se range d'un geste
  - /reels/:id et /moods/:id — un seul lecteur, et le gate qui interdit la jumelle
  - l'appui long sur la trace du son offre enfin de la mettre sur la scene
  - un son de fond peut SORTIR du fond -- la regle, le verbe qui manquait, le menu qui cesse de mentir
  - les options d'un outil ont le bas pour elles seules
  - la trace du son se pose enfin sur la carte qu'elle etiquette
  - la porte image compte AUSSI le fond, et la porte fond se tait
  - la palette sépare la NATURE de la FAMILLE — switch sticker/smiley, catégories à la verticale
  - le fil devient un CHAT complet, et /chats se rattrape en temps réel — citation, plein écran, transcription, profil en modale, balayage (#4835, #4753)
  - une mention NOTE ne part plus sur TOUTES les slides — elle appartient à sa publication
  - une langue porte UN nom — et c'est le français, puisque le document l'est
  - l'horloge de /stories/:id s'injecte — la suite ne rougit plus au passage d'une date (#5021)
  - le point d'état DIT son état — et un témoin de story ne rougit plus à cinq heures
  - forward-source reciprocity fails closed when participants fetch fails (#5211)
  - un 403 « not found » ne dit plus ce que son statut tait (#5126)
  - deactivate share links on conversation closure (#3740) (#5207)
  - retirer pendingEmail/pendingPhone de formatUserResponse (#4653) (#5180)
  - GET /attachments/search — média à travers toutes les conversations (#5170) (#5174)
  - GET /links accepte q, filtre name/identifier (#4962) (#5171)
  - admin broadcast targeting/report canonicalize systemLanguage (#5166)
  - enforce per-attachment-type send rights on message send (#5162)
  - canonicalize ZMQ translation target languages before dedup/send (#5160)
  - usersByLanguage replie systemLanguage sur son code canonique (#5155)
  - canSendMessages s'applique au transport canonique et au socket (#5150)
  - require conversation membership for attachment transcription (#5153)
  - GET /attachments/:id/metadata exige enfin une appartenance (#4923) (#5149)
  - GET /attachments/:id/metadata exige enfin une appartenance (#4923)
  - un message protégé trouvé par recherche/fil/lien sert enfin ses drapeaux (#4885) (#5148)
  - un message protégé trouvé par recherche/fil/lien sert enfin ses drapeaux (#4885)
  - le sender ZMQ canonicalise ses langues cibles avant l'envoi — la liste envoyée ne diverge plus de son suivi
  - un visiteur sans identité sur /links/:id/messages reçoit 401, pas 403
  - canonicalize ?languages= codes on the REST messages filter
  - un 403 « not found » disait ce qu'il refusait de dire (#5130)
  - garder les deux suites sous leur budget de lignes hérité
  - un 403 « not found » ne dit plus ce que son statut tait (#4856)
  - le filtre `?languages=` de la liste de messages canonicalise ses codes
  - expose ETag par CORS — le 304 de /sync devient atteignable
  - \_merge_group propage un float, plus un booléen (voice_similarity_score)
  - stop faking autoTranslateEnabled on a served participant (#5172)
  - la loi de la banniere devient UNE loi pour trois clients

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.16.1

## 1.35.0

### Minor Changes

- Changements automatiques détectés :

  - la scène naît VISIBLE — l'appui long ouvre la caméra, le viseur ne s'impose plus
  - la porte de la story tient son HORLOGE — le fixture echouait le jour de son echeance
  - le son de fond se lit en tête de scène sans capsule, aligné sur le bord du DESSIN
  - « Tout effacer » laissait partir trois champs avec la publication suivante
  - le compteur de hashtags LIT le site unique au lieu de le refaire
  - la scène dit ce qu'elle emporte d'invisible — le son de fond en tête, les références au pied
  - la scène DIT ce qu'elle porte, et le geste terminal se voit
  - la porte de story reçoit son horloge — la fixture échue à 05:00Z ne fait plus rougir « Test web-v3 » pour tout le monde
  - une décoration animée bouge PENDANT qu'on compose, et la palette dit lesquelles bougent
  - les médias d'un réel cessent d'être injoignables — une porte vers la galerie, et un site unique pour l'ouvrir
  - la courbe du clavier ne vit que le temps du mouvement, Speech se demande au premier vocal, l'envoi n'attend jamais plus de 700 ms, l'ouverture réarme le fil
  - UNE descente du Prisme grave la citation — ReaderPrism, résolu à la mise en file, jamais dans la boucle d'écriture
  - l'entrée de cache du rendu de sticker déclare sa deinit non isolée — la garde MeeshyUI l'exigeait
  - un GIF de commentaire arrive en GIF — le format se perdait dans un NOM DE FICHIER
  - un sticker de message et un GIF de commentaire ANIMENT — la vue existait, personne ne la montait
  - le prisme du lecteur se lit sur le MainActor avant la fermeture qui convertit les aperçus de liste
  - un son de fond emprunté peut enfin être retiré
  - l'inset du fil suit la durée et la courbe du clavier système au lieu d'un pas sec
  - une citation se lit « Auteur : » puis 2-3 lignes, ou sa miniature ThumbHash avec dimensions · durée · taille — une règle, trois peaux
  - la citation optimiste porte les mêmes faits que la citation servie, et le prisme du lecteur atteint chaque site qui grave une citation
  - la conversation s'ouvre en UNE lecture GRDB et UNE publication — réconciliations en parallèle, fenêtre ancrée bornée, transcription locale suivie à l'écho
  - la palette d'emoji s'OUVRE vraiment — trois defauts que seul l'ecran pouvait dire
  - deux objets posés ne se superposent plus au pixel près
  - trois gardes rouges après la vague 1 — le rendu du sticker sort du chemin d'envoi, la loi de rattrapage lit la famille du ViewModel, la constante d'espion SDK rejoint le MainActor
  - les cinq familles d'objets ouvrent le même éditeur
  - le plein ecran audio allege son site d'appel, et sa garde nomme la LOI plutot qu'un nom de fonction
  - /post/:id est servie — la publication, son fil, et le lang= sur ce qui est traduit
  - la comète des réactions respecte « Réduire les animations » ; ThumbHash et écriture JPEG quittent le fil principal
  - une bulle audio reçue réserve la hauteur de sa transcription — plus de saut quand Whisper répond
  - un vocal envoyé est transcrit sur l'appareil dès l'arrêt de l'enregistrement et part avec sa transcription ; la tuile de lieu disparaît au tap
  - un sticker apparaît dans le fil à l'instant du tap — encodage et écriture hors du fil principal, rendu mémoïsé
  - la citation transporte miniature ThumbHash, dimensions, durée, taille, langue et protection
  - la liste ne reconstruit plus son snapshot à chaque événement — préparation mémoïsée par empreinte, chemin court pour la frappe, insets animés
  - ConversationViewModel repasse sous 1 200 lignes — dix extensions par responsabilité, comportement inchangé
  - #4960, troisième et dernier tiers — CanvasItemKind disait encore « location »
  - la lecture des commentaires — et le Prisme descendu, pas seulement consulté au rang 1
  - la palette sort des deux fichiers hors budget — j'avais ajoute sans extraire, la regle l'interdit
  - /search est servie — un GET de formulaire, et zéro appel tant qu'on n'a rien demandé
  - l'icone d'un etat vide suit Dynamic Type — l'extraction lui avait fait perdre son amnistie, la garde avait raison
  - #4960 était à MOITIÉ fait — l'union disait encore « location »
  - la lecture de la recherche — deux groupes, parce que deux seulement existent
  - une famille d'objets porte UN nom — « place », comme le fil le dit
  - mes deux suites d'audit tombaient dans le mauvais projet, et sept témoins étrangers rougissaient
  - la flèche de retour de l'éditeur d'objet se retourne en arabe
  - le bon modèle au bon moment — sonnet par défaut, opus réservé
  - le rail d'outils DIT qu'il continue — deux entrées sur dix étaient hors du champ
  - /links est servie — et une sonde qui mourait de la croissance est réparée
  - la lecture du carnet de liens — et le compteur qui ne dit pas « vues »
  - l'éditeur d'objet prend l'anatomie du plateau — outils à gauche, historique à droite
  - le plein ecran d'un media garde la bascule de langue que la carte offrait (#4934)
  - /contacts est servie — une liste, trois sortes de lignes, deux gestes qui font quelque chose
  - la lecture du carnet, contre ce que la passerelle sert vraiment
  - /notifications est servie — et elle ne paie pas l'appel des autres écrans
  - le plein ecran d'un media saura dans quelles LANGUES sa legende se lit — la regle qui decide (#4934)
  - la vue de la boîte — « Tout lire » a un effet SANS JavaScript
  - la copie de la boîte, et un glyphe qui ne peut pas être vide
  - la boîte de notifications se lit — et LIRE la passerelle a évité deux compteurs morts
  - une citation protégée ne transporte que son placeholder — texte, traductions ET média, sur les trois producteurs de replyTo
  - l'image se construit de nouveau — anyio 4.15.0 a rendu `anyio.abc` inatteignable

## 1.34.0

### Minor Changes

- Changements automatiques détectés :

  - l'en-tête de l'éditeur d'objet ramène en arrière et dit combien la scène porte
  - le rail gauche gagne la porte FOND — et une ligne de gouvernance change de côté
  - un sticker anime ANIME sur la scene — les octets remontent enfin jusqu'a la couche (#4925)
  - une image animee peut enfin etre decodee et jouee — le moteur qui manquait a TOUTES les surfaces (#4925)
  - le son d'un post, d'un reel ou d'un commentaire se joue dans la langue du lecteur — le Prisme s'arretait au fil
  - le sticker se dessine dans les QUATRE modes de lecture, et la palette d'emoji s'ouvre partout
  - un son de fond posé sur une story laisse enfin une trace
  - la sonde s'éteignait à chaque lot — elle porte enfin un chemin que RIEN ne peut servir
  - une story partagée s'ouvre au lecteur connecté, et INVITE l'autre au lieu de le rejeter
  - la galerie des pieces jointes CHARGE enfin — et le harnais de 755 lignes qui couvrait le defaut posait zero question
  - trois gardes du composer épinglaient la forme que trois directives ont remplacée — run test
  - un 404 n'est pas une panne — et la regle qui le dit filtre le type que le client leve VRAIMENT
  - les médias d'une conversation se parcourent sans qu'un seul octet de média ne parte
  - un echec reseau cesse de s'annoncer comme une suppression — et rend a l'utilisateur le seul geste utile
  - la Bezier de la trainee d'avion passe de 12 759 ms a moins de 300 — dev iOS etait rouge
  - les trois dernières familles — voyage, travail, musique — portent le catalogue à 200 décorations
  - « absent du tray » cesse de vouloir dire « absent » — un lien recu designe presque toujours une story que le cache local ignore
  - un lien vers UNE story ouvre CETTE story — le postId servait a trouver le groupe, puis etait jete
  - `rich` devient MESURABLE — le gate de conformité que son critère de fin exigeait n'existait pas
  - deux familles de plus vers les 200 — nourriture et sport (20 décorations)
  - deux regressions de a96a4bf8 que mes runs cibles ne pouvaient pas voir
  - le catalogue se somme en DEUX constantes — une chaîne de dix-sept « + » finit par ne plus se type-checker
  - les trois familles compilent — un type imbriqué en double, un switch non exhaustif, et l'emoji que le lot s'interdisait
  - les trois passes de `rich` ont trouvé ce que les tests ne pouvaient pas voir
  - trois familles de plus vers les 200 — nature, encouragement, réponses (30 décorations)
  - la fenetre d'une pastille de lieu s'atteint AU DOIGT — le lot precedent n'en livrait que le fil
  - le texte d'une slide sait ce qu'il EST — contenu en story et réel, légende du média en post
  - la place d'un outil du composer dépend du FORMAT — en Story lieu, hashtag, mention et corpus se POSENT ; ailleurs ils qualifient l'envoi
  - un message CITE, TRANSFÈRE ou PARTAGE une story — trois formes qui n'existaient nulle part
  - la fenetre temporelle d'une pastille de lieu s'atteint enfin, et voyage
  - une décision du porteur prise EN COURS DE TOUR prime, et le socle la porte
  - « je ne sais pas encore » cesse de vouloir dire « il y en a plus »
  - trois collisions de numero de lecon d'un coup — dev repasse au vert
  - les deux fils se lisent et s'écrivent en temps réel, membre ou invité, à la même vue
  - un média posé par le rail de la scène n'atteignait jamais une story — un guard qui portait le NOM de sa fonction a vieilli avec lui
  - les agents passent d'un modèle dont le quota s'épuise à celui de la session
  - six refus muets du chemin média se DISENT — sans réparateur, un canvas resté noir n'est attribuable à rien
  - les portes d'ingestion marquent le rail AVANT d'écrire — un drapeau consommé après l'observateur qui le lit ne vaut rien
  - « ce blob est-il du v3 ? » a DEUX sens, et les confondre gravait une forme v1 dans un document v3+
  - les constats de la revue adverse de #4870 — l'ombre suit les glyphes même sans cadre, le rail lit l'ordre de la rangée, l'éditeur en ligne ne rogne plus la lueur
  - les six retours du lecteur ne se lèvent plus derrière l'écran
  - un texte de story porte un EFFET — lueur, ombre, relief — à part de sa police, rendu à l'identique sur les trois clients
  - un Réel ne partait JAMAIS, et le refus qui aurait dû le dire se levait DERRIÈRE l'écran
  - trois gardes rouges du lot stickers — un « /\* » dans un doc-comment, l'inventaire des téléversements sans contexte, le plafond du PNG garanti (run test)
  - les unions de publication DERIVENT de leur source au lieu d'etre recopiees
  - un refus de format nomme sa CAUSE — « Text only » sur un composer vide, et « une vidéo » quand deux photos suffisaient
  - « Charger plus » ne s'affiche plus sous zéro commentaire
  - cinq gardes rouges héritées de dev repassent au vert à la SOURCE — RTL, tailles figées, deinit isolée, unité du meuble, veille de la rivière (run test)
  - le témoin du chargement asynchrone attendait un finish enfilé AVANT la suspension — et une couche sans adresse ne lance plus de tâche (run test)
  - l'export MP4 d'une story peint ses stickers image — l'index PostMedia → fichier local remonte jusqu'au compositor (run test)
  - accentColor retrouve son private — un faux positif de balayage ouvre en SILENCE
  - un sticker IMAGE collé se PEINT sur la scène — couche, renderer, export, cover, vignette de slide (run test)
  - le resume cesse d'annoncer « disabled » pour un job qui TOURNE, et un cliquet garde la liste
  - deux rouges hérités de dev — l'audience du viewer sort de PostService (cliquet #4426), et la leçon 438 doublée reprend un numéro unique
  - le post CITE quitte PostDetailView — la dette du cliquet est soldee
  - dev repasse au vert — engagementAggregateIncrements sort dans son module
  - l'éditeur plein écran perd son cadre violet, et sa section s'appelle POLICE — parce que la mesure dit que c'en est une
  - un sticker s'envoie et se lit dans une conversation — bulle sans chrome, animée, palette dans le composer (run test)
  - tout ce que le lecteur POSE au-dessus de la scène vit dans un seul fichier
  - un écran se reporte au tour suivant par `sauter` — livrer plus tôt ce qui est prêt
  - l'affichage des notifications se regle — apercu masquable respecte par la banniere in-app
  - commenter un reel ouvre une feuille superposee — la video continue, l'envoi est optimiste, le fil se pagine
  - les tuiles Camera et Emoji du tiroir d'attachements prennent vie — capture in-app et insertion au curseur
  - une story s'envoie a une conversation depuis le viewer — picker interne filtre par droit d'ecriture, message de citation sur le wire
  - Demandes et Bloques s'ouvrent cache-first — Room persiste les deux listes, et le logout vide AUSSI le cache memoire de blocage
  - lu, supprime et compteurs se synchronisent en temps reel entre appareils — a portee PROCESSUS, pas d'ecran
  - PALLIATIF — la légende d'une story n'est plus son index de recherche, mais la recopie continue d'être ÉCRITE
  - un `content` de story a DEUX natures pour un seul nom — la règle qui dit laquelle, miroir du prédicat que la passerelle possède déjà
  - le son passe en tête du rail, et les blocs cessent d'être numérotés à la main
  - un message porte un STICKER — champ dédié, hissé partout où le lieu l'est, colonne GRDB (run test)
  - le corpus déplié se lit sans voile, se défile sans faire tourner la story, et son invite reste visible
  - l'éditeur d'objet ouvre UNE section à la fois — neuf étaient dépliées d'un coup, et seul le MOT d'un en-tête était touchable
  - démarrer un enregistrement vidéo TUAIT l'app — AVFoundation ne rend pas d'erreur ici, il lève une exception qu'aucun catch Swift ne rattrape
  - la septième entrée de la rangée canonique ne rendait AUCUN pixel — et la loi qui l'aurait vue ne gouvernait qu'une rangée sur quatre
  - la pastille de lieu emporte enfin son gabarit — meme piege, TROISIEME morsure
  - le composer du lecteur de story quitte le canvas — la dette héritée repasse sous son cliquet (run test)
  - les registres de famille passent une fermeture à map, et browserslist est épinglé (run test)
  - cent vingt décorations en douze familles — joie, stupeur, humeur, salutations, réactions, fête, disponibilité, et les compléments amour, heure, lieu
  - les MOTS de l'auteur deviennent une décoration — et la météo ouvre les familles du catalogue
  - une décoration peut être ANIMÉE — une fonction pure du temps, identique au lecteur, dans le post et dans l'export
  - une décoration publiée arrive avec son gabarit et ses valeurs — et le rendu passe par un REGISTRE de dessinateurs
  - une decoration publiee revenait EMOJI — le fil v3 portait son repli, jamais son gabarit
  - la suppression de compte exige le mot de passe courant et passe par la route moderne — sans deconnexion sauvage sur refus
  - la bascule haut-parleur/ecouteur existe — decision pure, setCommunicationDevice sur 31+, repli speakerphone, intent du geste respecte
  - l'outil de dessin du composer est cable — trace au doigt, undo/redo, palette, et les traits voyagent jusqu'au viewer
  - like et bookmark durables hors-ligne, pagination infinie des reels, ouverture instantanee par seed
  - taper une ligne ouvre le contenu vise, et la phrase d'action est celle de la banniere
  - les fichiers recus s'ouvrent depuis la bulle — telechargement avec progression, ouverture et partage, tap direct
  - typing:start recu vaut preuve d'activite — l'expediteur est force en ligne localement, regle produit racine
  - l'echelle du menu remplace le radial — six barreaux badges, avatar en anneau, Profil au double-tap, et le NavHost cable Nearby et le picker de lien
  - l'en-tete des Chats devient iOS — lien de partage et nouvelle conversation, repli au scroll, picker d'une conversation eligible
  - l'en-tete du Flux devient iOS — « Meeshy Feed » repliable, Reels et « A proximite », et l'ecran des publications proches existe
  - le socle du chrome iOS — CollapsibleHeader a courbes pures, loi ScrollMotion, badge 99+, eligibilite d'un lien de partage
  - les cibles de la rangee d'actions faisaient le TIERS du minimum — une regle qu'aucun label auto-dimensionne ne convoque
  - le cliquet comptait ZERO des que tsc colorisait sa sortie
  - la baseline de dette de types revient a 1180 — la dette n'est pas soldee
  - la rangee du detail retrouve son item COMMENTAIRES — quatre items, comme la cible 2h
  - la legende depliee LAISSE la place au rail — un bloc qui grandit ne rencontre pas les memes voisins
  - le badge de sélection se DIT — il était lisible à l'œil et absent de l'arbre d'accessibilité
  - la legende deplie MONTE depuis sa place, la scene s'efface au lieu de se voiler, et l'invite se touche enfin
  - les CINQ familles d'objets de scène ont leur badge — le son et le lieu se nommaient à personne
  - la livraison ouvre sa PR et arme l'auto-merge — un tour se fusionne sans intervention
  - l'invite « voir plus » d'une story recevait ses taps par la couche de GESTES — un controle rendu, cable, et inerte
  - deplier une legende prend de la place, et chaque surface la prend AILLEURS
  - une chip de son sélectionnée montre ses réglages — elle était le seul objet manipulable sans inspecteur
  - la priorité aux deux fils vit dans le script — une reprise de run ne relit pas ses args
  - la legende du plein ecran media rejoint la couche PARTAGEE — la troisieme surface portait encore la forme inerte
  - deux leçons portaient le numéro 419 — la seconde prend 421, le garde du gateway repasse au vert
  - les écrans phares — les deux fils — passent en premier, sur le modèle le plus fort, avec une recette au navigateur
  - la legende d'une story tient la colonne du CANVAS — une vue ne peut pas se defendre d'un conteneur trop large
  - la présence d'une scène a UN prédicat — deux divergeaient, et la story ouverte n'avait plus de canvas
  - la scène naît INCRUSTÉE — on entre dans son éditeur par un geste
  - le credit du son se lisait a 1,03:1 sur la carte du fil — la garde AA etait passee, une branche sur deux la consultait
  - une chip de son a un RANG — quatre sites la lisaient, aucun ne savait l'écrire
  - le temoin du lien partage mesure LE SAUT DU LIEN, plus celui de sa destination
  - la porte « Créer une story » ouvre le composer v3 — et sa flèche publie vraiment
  - la description se lit sous la scene, la vignette ne ment plus, et un gabarit se deplace sans se deformer
  - les deux rails s'ancrent au bas du DESSIN, plus au bas de la frame
  - les trois gates e2e de la v3 construisent packages/shared — la v3 en importe depuis ce matin, et rien ne le batissait
  - les trois jobs Playwright de la v3 construisent @meeshy/shared avant next build
  - une scène posée accepte de nouveau un son — et la puce qu'elle promettait existe enfin
  - la scène reste montée tant qu'elle a des objets — retirer la dernière tuile ne les emporte plus hors de vue
  - une slide VIERGE ne part plus en publication — elle devenait une story qui ne montre rien
  - un 403 de la passerelle veut AUSSI dire reconnecte-toi — la semantique de manuel ne decrit pas ce depot
  - un sticker peut porter une donnee FIGEE — lieu, heure et coeurs se posent en decoration
  - une tuile de la rangée haute dit le FOND d'une slide, plus n'importe quel média
  - la v3 web se développe de bout en bout par un workflow versionné
  - le contrat de la v3 lisait son tsconfig en JSON strict — le fichier est du JSONC, et il est VALIDE
  - deux lecons portaient 397 et 398 en double — deuxieme occurrence en quatre-vingt-dix minutes
  - dans l'IMAGE, le type-check de la v3 balayait les sources de packages/shared — et rien en local ne pouvait le dire
  - dev repasse au vert — applyMediaText sort dans son module, et le correctif de securite de #4714 tient
  - /chats/:cle sert le FIL d'une conversation — Prisme applique, protection respectee, ecriture sans JavaScript
  - staging sert /chats depuis la v3
  - dev repasse au vert — deux lecons portaient le numero 396, la garde de cle unique le refusait
  - la racine sert le TABLEAU DE BORD apres la connexion, et /chats liste les conversations — rendus par le serveur, chiffres compris
  - staging sert /login et /signup depuis la v3
  - « Refaire » demandait rien avant de detruire la prise — et la poignee de rognage tombe dessus
  - on se connecte et on s'inscrit sans une ligne de JavaScript — et la racine cesse de servir la vitrine a qui est deja connecte
  - deux vocaux font deux cartes, un son pose se supprime, et la description se redige toujours
  - une story se compose dans le MEUBLE — l'autre composer quitte son chemin, et elle part avec ses unites
  - « Devenir Partenaire » etait le dernier <h2> de /partners ET le titre de sa rangee de suite
  - une piste a UNE identite — la regle qui la disait deux fois en rendait deux reponses
  - /partners repetait « Solutions Entreprise » en section ET en carte — et la reprise avait invente trois mots
  - /privacy faisait lire deux fois le meme paragraphe — une accroche qui REPETE la premiere section n'annonce rien
  - PathPrefix(`/l`) emportait /login et /links — Traefik ne segmente pas, et le depot le modelisait comme s'il segmentait
  - les cinq pages institutionnelles sont servies par la v3 — et le worker legacy s'efface enfin devant la vitrine
  - toucher une pastille audio du canvas ouvre « Creation audio » — elle DESELECTIONNAIT
  - la vitrine sert la landing du LEGACY, redessinee dans la langue des planches
  - N sons de contenu, N cartes — le second cesse de voler la transcription du premier
  - « Creation audio » ne se re-presente plus PERIMEE — une ouverture, une feuille neuve
  - staging sert la vitrine v3 a la racine — Path exact, pas PathPrefix
  - la vitrine publique ANNONCE le Prisme, et ne fait rien payer pour le dire
  - staging bascule /l vers la v3 — etape 2 du § 4.9, second temps
  - le fond appartient a la SLIDE, et son libelle le dit enfin
  - une piste DIT ce qu'elle est — onde pour un enregistrement, titre et credit pour un emprunt — et la surface dit si sa transcription se lit
  - bun.lock recopie les versions des manifestes — les cinq champs restes au numero d'avant la release
  - poser un son en FOND remplace celui qui y est — et la duree cesse d'etre le premier mot tronque
  - la puce audio de premier plan s'endort avec l'ecran — 30 fps continus retires d'un canvas au repos
  - les trois grands boutons de demarrage tiennent jusqu'a dix conversations
  - le credit d'une republication n'est du qu'a une story PUBLIQUE — et la pastille devient une capsule de verre qu'on deplace
  - la pastille du son de fond s'ouvre, le socle rend la sienne, et un son emprunte se charge sous les yeux
  - la legende d'un reel et d'une story se pose SUR l'image, sans cartouche, alignee sur sa colonne
  - quitter un compte sans le faire disparaitre du selecteur
  - un son en CONTENU de publication s'ecoute sous le texte, sa transcription defile, et un doigt le rouvre pour l'editer
  - le message d'erreur garde sa phrase, ses trois sorties passent dessous
  - la feuille audio se resserre — placement compact sous le carre, langue DU SON, et trois defauts de mise en page mesures a l'ecran
  - le placement devient un choix de NATURE, la langue reste ouverte, et un son de bibliotheque se rogne
  - the analytics-consent gate now covers all four dwell surfaces (#4658)
  - le son de fond se lit a cote de l'avatar — note, onde et duree, et le texte descend
  - « Vocal » et « Ajouter un son » ouvrent la MEME vue — Creation audio, son rognage et son placement
  - le rognage d'un son — bande defilante, curseur au centre, poignees larges
  - dwell tracking obeys the reader's analytics-consent toggle (#4655)
  - la dette de types du web a BAISSE de deux — le cliquet enregistre le gain
  - la pastille de jour ne garde plus un jour calcule pour une geometrie disparue
  - inviter N personnes part en UN appel — et un refus partiel cesse de ressembler a une panne
  - the in-app banner leads its group name with the favorite emoji (#4650)
  - the client sends X-Device-Locale, reviving the Prisme's 4th-priority arm (#4647)
  - six requetes de create-link-modal cessent de courir contre un re-rendu — findByText au lieu d'une requete nue
  - dev repasse au vert — cinq lecons renumerotees, une requete bornee, un temoin dont la premisse a ete levee
  - la reprise multi-appareil se reconcilie EN CONTINU — le premier contact ne gagne plus pour toujours
  - le web garde enfin ce qu'il ecoute — reprise, cloture au demontage, trace de segments
  - la porte TEXTE ouvrait un editeur sur un objet DEJA detruit
  - les deux clients mobiles savent composer une adresse du magasin statique
  - une reference de media DIT son magasin — le web sait enfin composer une adresse statique
  - les sept dernieres cles traduisibles entrent au catalogue — et le cliquet peut enfin viser zero
  - the in-app banner pulls down when the reader opens its thread (#4644)
  - editer un texte ouvre enfin un ecran ou tout est visible, et l'audience montre ce qu'elle decide
  - foreground FCM pushes consult a presentation gate before raising a banner (#4629)
  - aucune image ne resonde le disque pour une absence deja connue
  - la veille manquait le cas NOMINAL — une conversation OUVERTE en Riviere gardait son horloge
  - sous un pane opaque, plus un seul snapshot n'atteint le data source
  - un son choisi dans Fichiers arrive enfin sur la scene, et la bande d'outils quitte le canvas
  - la liste ne REVEILLE plus rien sous la Riviere ni sous le Resume
  - la Riviere ne rebatit ses bulles que si une ENTREE change — traduction comprise
  - l'image de la v3 ne se construisait pas — ses propres scripts etaient filtres a l'entree
  - le rapport de visionnage d'un reel disait « langue inconnue » — le contrat qui la portait n'etait ecrit nulle part
  - la v3 entre dans staging, et la garde cesse de regarder ailleurs
  - il n'y a plus de porte par FORMAT — `.reelTab` est retiree, le format se choisit dans le composer
  - le cluster VIDEO des reels sort de son fichier hote
  - les stats de conversation se calculent en local quand le serveur manque (#4619)
  - un lien qui sort du perimetre de zone echoue au lint, et le 404 retrouve sa sortie
  - l'image de la v3 retrouve les scripts que son build EXIGE
  - les portes du composer ont un inventaire — et celle qui perdait ce qu'on lui confiait est reparee
  - la premiere banniere de la v3 nait avec les sept cadrages
  - aucun message ne partait — le corps portait un cmid* la ou les trois portes exigent cid*
  - la bande du specimen s'aligne sur la rangee de jetons — elle demarrait au ras du bord
  - le specimen des 18 styles trouve son hote — le jeton STYLE cessait de mener nulle part
  - les deux emojis rapides atteignent la cible de 44 pt
  - l'appui long propose enfin « Modifier » — et cesse de l'offrir a qui n'a pas d'editeur
  - trois gardes cherchaient leur regle dans un fichier qu'un decoupage avait vide
  - la bande de la scene se monte enfin — trois surfaces etaient inertes derriere un `if let` toujours vrai
  - la pastille de lieu apparait et disparait quand elle veut — six sites disaient le contraire, en cercle
  - story viewer records a dwell-aware view beside its impression (#4607)
  - status bubble records a dwell-aware view beside its impression (#4601)
  - les gestes et l'empilement lisent la SCENE — et trois cascades ne seront JAMAIS repointees
  - post detail records a dwell-aware view beside its impression (#4597)
  - l'en-tete remonte sous la barre systeme, et la banniere cesse de la recouvrir
  - la timeline voit une SCENE — et « 66 cascades » etait un compte de FORMES
  - les temoins du defaut allowAnalytics suivent #4578 — j'avais casse le CI Android
  - la cible de TEST du SDK ne compilait plus — sept sites qu'un remplacement mecanique n'aurait pas du toucher
  - le protocole ne prend plus que des adresses TYPEES — un chemin ecrit a la main ne compile plus
  - reels record a dwell-aware view off a ported EngagementTracker heart (#4593)
  - l'audit cherchait une SYNTAXE D'APPEL, pas un chemin — deux sites lui avaient echappe
  - plus AUCUN chemin d'API n'est ecrit a la main — zero litteral sur 135
  - six cascades repointees sur MeeshySceneObject — dont une de douze lignes a une
  - MeeshySceneObject existe — la planche parlait d'un objet, le code n'en avait pas
  - global-search rows highlight the query that PRODUCED them, not the live input (#4587)
  - cinquante-cinq chemins d'API cotes app quittent les chaines — et l'audit apprend a ne pas rougir sur le progres
  - soixante-quinze chemins d'API quittent les chaines pour le catalogue genere
  - une preference inconnue est REFUSEE et NOMMEE — elle recevait 200 sans rien ecrire
  - la console d administration passe par le catalogue, et son temoin en DERIVE
  - cinq chemins d'API rendaient 404 — la reinitialisation de mot de passe et la verification du telephone ne pouvaient pas aboutir
  - l'historique rejoint le rail des OBJETS — au socle il voisinait ce qui decide de l'envoi
  - un compte neuf peut enfin regler son theme — trois categories sur sept lui etaient fermees
  - la porte SON quitte la rangee — c'etait un bouton en double, jamais une capacite
  - les trois politiques qu'APIClient deduisait d'une comparaison de chaine ont un NOM, un temoin, et bientot un type
  - le catalogue d'endpoints iOS existe — 441 adresses generees depuis le manifeste, et un cliquet qui les y tient
  - la rangee d'outils DEFILE et sa sortie reste — 422 pt pour 373 disponibles
  - un enregistrement sans micro ne se deguise plus en vocal — l'URL etait fabriquee
  - le projet cesse de referencer un fichier absent du depot — quatre lignes du WIP voisin
  - la console d administration peut fermer un lien de partage
  - le tri des signalements n accepte plus que trois colonnes, et la presence d un lien passe par la loi
  - la place d'une porte se lit a son NIVEAU — une regle raisonnee etait doublee par un litteral
  - « un seul objet a la fois » se VOIT enfin — le canvas n'avait aucune notion de selection
  - l'ecriture d'un lien de partage a un seul site, et une reponse ne porte plus deux paginations
  - les jetons de l'inspecteur menent enfin quelque part — six boutons promettaient dans le vide
  - le mot de passe de la base cesse d etre publie par un repli
  - highlight the query in global-search message result rows (#4549)
  - la page de pilotage ne se declenche plus hors de main
  - in-app banner dedup — one SSOT window, not a re-coded twin (#4539)
  - la version de politique a UN site, et un refus de consentement DIT quel champ manque
  - le validateur de deploiement ne tient plus aucune liste — et il valide enfin quelque chose
  - le jeton d'une route parametree vit dans une annexe que la capture n'ouvre jamais
  - une variable d'hote absente arrete le demarrage au lieu de faire MENTIR le service
  - un outil de verification REFUSE ce qu'il ne sait pas honorer, au lieu d'en inventer un verdict
  - pure video-dismiss watch-report guard (#4533)
  - deux gardes du dessin repointees — elles etaient ROUGES sur dev depuis 42b02bc9a9
  - un refus de consentement dit ce qu'il attendait, et le client cesse de jeter la reponse
  - pure audio-player render-posture plan (#4512)
  - la rangee de jetons de `1c` PARAIT — une vue qui existe toujours ne temoigne de rien
  - un temoin qui lit un artefact de build vit dans le job qui construit
  - l'inspecteur de `1c` PORTE ses valeurs — « TAILLE 140 % », pas une icone a ouvrir
  - le rattrapage de lecture cesse d'exiger une coincidence de lot
  - la bande du letterbox se peint dans l'ATELIER — le ThumbHash seul n'y existe pas encore
  - la bande d'un media AJUSTE porte le ThumbHash de la scene — la zone hors 16:9 cesse d'etre un trou
  - une vue CONSTRUITE puis JETEE ne rougit nulle part — la bande des mentions n'a jamais pu paraitre
  - une story repondue se CITE en scene, et son lien mort cesse de se taire
  - le filtre par pays cesse d'etre PROPOSE — la decision de #4167 atteint enfin ses trois surfaces
  - trois places, trois niveaux — les controles a gauche, le document a droite, l'outil en bas
  - la SCENE est figee en 9:16 — le fond ne lui impose plus sa forme
  - l'outil dessin trace enfin DANS le canvas — un trait hors carte etait perdu a la publication
  - un lot de medias se PARCOURT — le carrousel de la carte de fil porte une legende par slide
  - un post de PHOTOS sans legende peut enfin partir — et cinq gardes retrouvent leur sujet
  - trois gardes rendues aveugles par mes propres decoupages retrouvent leur code, et une classe neuve sa deinit
  - l'inspecteur d'un objet DIT sa valeur — « TAILLE 38 », pas une bulle muette
  - la scene reprend ses deux places — le rail FLOTTE sur elle, la rangee basse revient
  - pure karaoke resolver — active transcription segment (#4506)
  - un lien partagé s'ouvre en un aller-retour, et un lien fermé dit pourquoi
  - le canvas du detail obeit a UNE regle — une story republiee dont la source a disparu ne rend plus un rectangle noir
  - l'heure du viewer story rejoint le nom qu'elle qualifie, et le credit du son prend sa ligne
  - le muet reste LOCAL a sa surface — une notification diffusee ne franchit plus un verrou
  - ouvrir le composer cessait de planter — la cinquieme zone du socle debordait la profondeur de type
  - la porte de la SCENE reste visible — l'arbitrage de la rangee porte sur les portes, pas sur les outils
  - le composer dit QUI publie — l'avatar entre a gauche du champ
  - une fixture rattrape le contrat de fil dont un champ a ete retire, et le cliquet de dette repasse au vert
  - le retour arriere optimiste des preferences s'execute enfin, et lire le mauvais rang ne compile plus
  - le lecteur de réel rejoint la couche de légende partagée — la RÈGLE se partage, le moteur de texte non
  - la bascule de format montre les QUATRE formats — les refus portent leur raison
  - la bande-son de la publication entre au socle — et la porte son devient atteignable
  - trois entrees du composer cessent d'etre invisibles — doc, lieu et micro
  - la carte du fil porte la vue 1h — trois attributions, trois lignes, et l'état de la scène se DIT
  - le panneau des documents parle enfin a une categorie qui existe, et nommer une categorie fausse devient inexprimable
  - les deux jumelles de setCredentials prennent un objet nomme, et la confusion de creneaux devient inexprimable partout
  - la route CANONIQUE des demandes d'ami cesse de sauter une ligne que son alias deprecie ne saute plus
  - les droits d'un invite servent l'ensemble RESOLU, jamais l'instantane fige au join
  - la telemetrie de lecture entre par UNE porte, filtree par audience — et un post inexistant ne se distingue plus d'un post interdit
  - les quatre charges qui RECOMPOSAIENT repandent — quatorze cles cessent de se perdre
  - le rang, les droits et le bannissement d'un participant se changent a UNE adresse — et un corps qui mele deux autorites est refuse en bloc
  - une page de liste s'ancre sur la derniere ligne SERVIE — et le comptage de toute la collection disparait du chemin nominal
  - un appelant demande ses champs sur le detail d'une conversation et sur /sync — et la REQUETE retrecit, pas seulement la reponse
  - trois listes servaient des colonnes lourdes que personne ne lit — et l'une envoyait l'enveloppe E2EE entiere
  - le fil devient une collection parametree par vue — et les trois lectures ne rendaient pas la meme forme
  - le corps d'une publication vit dans UN noyau — et la fusion rend a une porte trois effets qu'elle avait perdus
  - les deux portes d'ajout exigent le meme rang, et participantId cesse d'etre retire du corps en silence
  - les trois refus 410 de l'apercu d'un lien portent son linkId — et le schema est ce qui les laisse sortir
  - maxUses borne l'ADMISSION, jamais la LECTURE — un lien plein cesse de refuser le fil a son dernier admis
  - l'inscription cesse d'inventer un rang 1 — le Prisme n'est plus rempli par un litteral
  - un refus de schema porte enfin `success` — le seul champ que tout client teste, absent du seul cas ou il compte
  - engagementAggregateIncrements sort dans son module — le cliquet de taille reprend ses droits sur PostService
  - le texte de scène ne rejoint plus le contenu d'une story — deux sites de recopie, dont celui que l'issue cherchait du mauvais côté du fil
  - un mot de passe refuse ne deconnecte plus — 400, comme les trois routes jumelles
  - le convertisseur v1→v3 perdait le GABARIT d'une decoration — meme piege, deuxieme morsure
  - l'acces a une conversation rend un VERDICT, plus un booleen
  - lire ses conversations sans session rend 401, plus 403
  - une session ABSENTE rend 401, un role INSUFFISANT rend 403
  - le gestionnaire d'erreurs global ne pose plus que ce que le schema declare
  - les quatre gestes de gestion d'un participant exposent un noyau appelable
  - la legende et l'alternative d'un media partaient BRUTES en base — la garde existait, personne ne l'appelait
  - le sens de l'echec du debit cesse de s'heriter en silence — trois familles le DECLARENT, et la garde l'exige
  - un ObjectId ne rejoint plus une conversation, et la recherche admin cesse d'epeler le secret qu'elle cache
  - deux routes echappaient aux fabriques de debit et comptaient par ADRESSE — et une garde interdit la troisieme
  - le producteur de Participant.language descend le Prisme — et une garde interdit qu'un cinquieme ecrive cette colonne autrement
  - l'e-mail de verification descend les quatre rangs du Prisme — et un balayage garde le COUPLE select/appel
  - ajouter N personnes part en UN appel, avec un verdict par personne
  - la passe des issues cessait d'etre vraie — declarer n'est exige que la ou un serialiseur existe
  - le refus d'un canvas parle la forme des quatre autres sites, et son contrat cesse d'etre un piege arme
  - une banniere reglee cesse d'etre servie null a chaque connexion — et le contrat gagne une garde par VALEUR
  - la preference de traduction automatique se REGLE et se RELIT — elle etait acceptee puis jetee
  - les trois portes de connexion servent la meme ligne — un select, pas trois listes
  - packages/shared entre dans le budget de taille, et le genere en sort
  - les gardes hors-hook du manifeste suivent le prefixe servi
  - une piece jointe TRANSFEREE retrouve son adresse sur la cle nue
  - le registre d'usage suit le prefixe SERVI, au lieu de l'ecrire
  - la consommation d'un MEDIA quitte le service des accuses de lecture
  - POST /posts/:postId/view DECLARE son succes — la garde de fermeture le reclamait
  - mes deux ajouts cessent de faire grossir des fichiers deja hors budget
  - les seize dernieres adresses COMPOSEES cessent d'ecrire le prefixe d'API
  - les trente-quatre adresses de SUCCESSION cessent d'ecrire le prefixe d'API
  - un accuse de LECTURE sans caughtUpToMessageId rendait 500 — la porte unique de #4349 echouait dans son cas nominal
  - POST /posts/:id/view declare son corps et borne `duration` a la FRONTIERE
  - le SECOND canary du nombre de routes suit l ajout de admin-share-links
  - le consentement fantome n'etait pas absent pour tous — il etait POSE par une migration, et la garde passait ou non selon la LIGNE
  - un nouveau membre recoit les memes droits, quelle que soit la porte qui l'ajoute
  - un consentement que personne ne pouvait accorder ne bloque plus rien, et un refus de schema dit enfin quel champ manque
  - un refus de consentement nomme de nouveau le champ, et nomme la CLE refusee
  - un code SMS n est plus accepte comme jeton d etape 2, ni l inverse
  - une preference illisible ne fait plus DISPARAITRE l evenement de statut
  - un lien magique ne contourne plus le second facteur
  - une seule regle decide quelles origines la passerelle sert, et elle a enfin un temoin d'EFFET
  - la preference « se souvenir de cet appareil » est retenue par le SERVEUR entre les deux etapes du second facteur
  - admin/content.ts repasse sous le budget, et ses TROIS cliquets suivent
  - les chemins de la consigne existent, et une garde les tient
  - extraire la surface Report de admin/users.ts, ma régression du budget de taille
  - une adresse RETIREE reste comptable — sinon son zero ne prouve rien
  - un invite dont le lien a ete revoque apprend POURQUOI son acces est refuse
  - les deux dernieres listes d'agent comptent en base, et la fenetre qu'elles exposaient cesse d'etre ouverte
  - la recherche de l'administration cesse d'etre un oracle sur le texte masque
  - la reciprocite showReadReceipts gouverne enfin la consommation audio/video
  - les quatre familles de tests hors gate resolvent enfin leurs modules, et les deux configurations ne peuvent plus diverger en silence
  - la console de traduction cesse de servir le texte d'un message supprime ou protege
  - les deux derniers gabarits d'e-mail sans appelant sortent du depot
  - le CORPS d'un message signale ne part plus vers AUDIT, et l'ecart entre les deux portes est DECLARE
  - notification.ts repasse sous 1000 — trente-six lignes de commentaire pour trois de code
  - « MOOD » cesse d'etre une valeur de FIL — et reste un mot de PROSE, ce qui n'est pas la meme frontiere
  - le catalogue derive suit le manifeste — dev etait rouge parce que j'ai regenere la source et pas ce qui en decoule
  - les adresses générées rattrapent le manifeste — une route ajoutée sans régénérer rougissait « Test shared »
  - le contrat de scene est atteignable par l'index du paquet
  - socketio-events se decoupe par domaine — 3238 lignes en 22 fichiers, l'adresse reste importable
  - les deux portes qui CALCULENT isTrusted le servent enfin — sessionMinimalSchema le declare
  - le contrat de reponse tient dans des fichiers qu'on peut lire — api-schemas se decoupe par domaine
  - la projection SWIFT du catalogue d'API se rend depuis les MEMES entrees que la projection TypeScript
  - la derivation du catalogue d'API expose ses ENTREES — pour que les autres surfaces portent les memes noms

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.16.0

## 1.33.0

### Minor Changes

- Changements automatiques détectés :

  - la page de pilotage cesse de se tuer elle-meme pendant sa publication
  - le fond ThumbHash du reel plein ecran cesse d'etre recouvert par le thumbnail
  - la legende se replie a 30 mots et en montre 15 — deux nombres, pas un
  - le rail ne lit plus le disque pendant son body
  - rogner une video ou un son de scene — des BORNES, jamais un fichier cuit
  - la cible de mesure device ne compilait pas — une cible hors gate n'est compilée par personne
  - un numero de lecon redevient une cle, et le cliquet compte l'identifiant CITABLE plutot que la suite de chiffres
  - in-app real-time toast wired — pure ToastDedupWindow + orchestrator VM (#4493)
  - la garde de parite lisait « ( » comme un parametre — son fusible l'a dit
  - la bannière in-app dit CE QUI vient d'arriver — la politique qui décidait n'avait aucun lecteur
  - le fling du fil devient mesurable sur appareil réel — une cible XCUITest porte les métriques
  - la liste du fil ne se dessine plus sous la Rivière et le Résumé, qui la recouvrent
  - un effet de message persistant s'arrête quand son message quitte l'écran
  - la Rivière cesse de se réveiller elle-même à chaque mesure de bulle
  - la porte son ouvre le micro, et le son pose sa PLACE avant d'atterrir
  - setCredentials prend un objet nomme, et la confusion de creneaux devient inexprimable
  - le catalogue retrouve son ordre — 188 lignes voulues, 16 760 touchees
  - le socle L0 tient en UN site par donnée — jetons, sprite, thème, cycle de vie, jeton invité
  - la legende du lecteur se deplie enfin — dix mots, de l'ombre, plein ecran
  - depuis le plein ecran, repondre au media — au message qui le porte
  - depuis le plein ecran, creer une story, un reel ou un post avec ce media
  - ConversationMediaGalleryView rentre dans son budget — 1259 lignes decoupees par responsabilite
  - incoming-call & friend-content notifications honour a real toggle (#4481)
  - un clip de scene peut dire QUELLE PART de sa source il joue
  - ecrire « @ » dans un texte de scene ouvre la rail des mentions
  - la notification in-app passe devant la pastille — qui cede, plutot que de lutter pour un pixel
  - composer avec un message AUDIO — le son devient le son de la scene
  - l'annulation descend au socle, le sticker se pose en grand, et le rail ajoute a la scene courante
  - l'ecriture miroir du consentement passe APRES celle qui fait foi
  - le double tap gagne les cellules media — et quatre temoins qui ne s'executaient PAS entrent enfin dans leur classe
  - les consentements se lisent et s'ecrivent sous /me/consents
  - la garde du mode de lecture balaie la FAMILLE de fichiers, et cesse de mesurer un chemin
  - le COLLAGE rejoint le rail — et c'est la forme du controle qui a dicte la forme du rail
  - un double tap sur une bulle ouvre la barre de reaction rapide
  - un compte a double facteur peut enfin se connecter par le formulaire principal
  - le composer cesse de terminer l'app — une seule feuille, et le type l'impose
  - les statistiques de traduction temps réel descendent le Prisme jusqu'au rang 4
  - deux setters redeviennent accessibles a leurs extensions -- le decoupage de StoryViewModel cassait private(set)
  - toast honours per-type notification toggles (isTypeEnabled port) (#4464)
  - ComposerDocumentSurface rentre dans son budget, et six cliquets suivent le decoupage
  - deux doubles de test enumeraient leurs exports, et la banniere en a lu deux de plus -- run test
  - StoryViewModelRules importe MeeshyUI, sans quoi #4425 ne compile pas — run tests
  - le rail gauche devient MODAL — les outils remplacent les portes, et le rail droit gagne sa frame [+]
  - la connexion a deux facteurs vise la porte qui peut l'authentifier, et le corps qu'elle exige
  - la banniere in-app dit CE QUI est arrive, pas seulement QUI -- run test
  - le plateau emprunte les VRAIS outils — dessin complet, texte enfin posable, et trois defauts vus au simulateur
  - une entree de la pastille mene au MESSAGE, plus seulement a sa conversation
  - système → notice centrée (BubbleRenderKind.System) (#4435)
  - la conversation restauree revient sur les AUTRES appareils -- run test
  - StoryViewModel rentre dans son budget, et sept gardes cessent de lire un seul fichier
  - douze mots cessent de repondre en francais a tout le monde
  - la v3 est joignable, se construit et sa conformite se mesure
  - la scene se dessine — la surface de l'atelier est EXTRAITE, pas recopiee
  - retirer le hook mort `useMessageTranslations` — jumelle divergente rang-1 du Prisme (#4390)
  - le fond du plateau retrouve sa rangee « Ouverture »
  - le jeton de rafraichissement cesse d'occuper une case que personne ne remplit
  - le plateau annule et retablit — une pose ratee cesse d'etre definitive
  - la porte son du plateau ouvre l'ETAGERE autant que le micro
  - une story pas encore publiee cesse de condamner sa ligne d'outbox — et un id malforme repond au lieu de lever
  - l'adresse de l'image d'apercu porte sa VERSION, et s'ecrit a un seul endroit
  - l'image d'apercu que quatre pages annoncaient depuis toujours est enfin SERVIE
  - notification-center category filter (11 chips) via pure NotificationFilterCategory (#4421)
  - trois chemins d'authentification cessent de ranger leurs jetons dans les mauvais creneaux
  - la porte media de la scene ouvre les TROIS sources — la camera et le fichier revenaient de nulle part
  - cache-first global search via pure SearchQueryCache + socket invalidation (#4408)
  - la suppression pour soi APPELLE le geste partage au lieu de le recopier
  - le plateau sert le sticker et l'empilement — deux absences que leur commentaire disait impossibles
  - la conversation restauree revient dans la liste des autres appareils, par un abonnement qui s'attache vraiment
  - le rafraichissement de session vise l'adresse servie, avec le corps que la route exige vraiment
  - l'octroi d'historique s'utilise sans voir, et son plafond ne tranche plus
  - le like d'un commentaire dit enfin qu'il est le mien — et le « reste » annoncé se réduit à ce seul site
  - les quatre appels de jeton push visent l'adresse servie, avec le verbe et le champ que la route exige
  - le lecteur de conversation d'administration demande son motif et ne s'offre qu'au rang qui peut l'obtenir
  - coller du TEXTE pose enfin quelque chose, et « Coller » cesse de s'afficher les mains vides
  - accent-insensitive search highlight via pure SearchTextFolder (#4385)
  - les entrees du composer disent ce qu'elles font
  - les deux derniers fichiers du composer rentrent dans leur budget
  - « Coller » descend sur sa rangee, et la regle qui decide OU coller est ecrite
  - le glissement de la description devient CONTROLE — et la regle vaut pour tous les glissements (run test)
  - la description ne s'affiche que si on la demande, et sa validation n'a plus deux boutons pour un acte (run test)
  - reaction emoji length bound is the SSOT on the REST/AJV path too (#4373)
  - ecrire une description ne cache plus la scene, et l'ecran de lancement cesse d'avaler les gestes (run test)
  - pure canvas reprojector — center-anchored [0,1] rescale + items-repositioned count (story-canvas-reprojection) (#4369)
  - le message recu app fermee atteint le DISQUE avant qu'iOS suspende le processus (run test)
  - l'aperçu de réponse (replyTo) descend le Prisme ordonné (rangs 1→4), plus seulement la langue du parent
  - les six pastilles de l'atelier deviennent la rangee canonique, et la description y entre (run test)
  - drawing-stroke wire model in :core:model + v3 drawing projection (story-drawing-strokes-wire) (#4355)
  - la garde des chemins d'API compile, et le point regagne est grave
  - le web cesse d'ecrire ses adresses d'API a la main, et deux cent dix-sept sites passent par le catalogue
  - l'audience, l'oeil et la fleche descendent au socle sous la scene — et l'audience ne ment pas (run test)
  - la garde des chemins d'API lit le DEPOT, plus le disque
  - le gate app repasse ENTIEREMENT au vert — 9097 tests, 0 echec (run test)
  - trois ecrans tronquaient leur liste a 100 relations — le double repondait par le PONT du protocole, pas par l'exigence
  - un changement de police quitte enfin le navigateur, et les reglages parlent a une seule route
  - le meuble du composer rentre dans son budget — et l'adresse de ses gardes devient l'UNITE, pas un fichier
  - pure freehand-drawing board — undo/redo/clear + per-stroke edit (story-drawing-board) (#4331)
  - collapse raw PowerManager.THERMAL*STATUS*\* onto the ThermalState tier the sender-cap plan consumes (#4295)
  - la route posee sur une cle de media porte sa VERSION, et une cle n'est pas qu'une date
  - le corps du message descend le Prisme ordonné (rangs 1→4), plus seulement le rang 1 (#4316)
  - quatre resolveurs d'URL de media n'en font plus qu'un, et il POSE la route
  - le SDK iOS POSE la route d'un media, au lieu d'attendre que la base la porte
  - pure ThumbHash source-downscale planner (thumbhash-source-plan) (#4321)
  - la garde d'execution s'importe avec son extension, comme tout le reste
  - pure WebRTC stats reducer + interval loss-ratio (call-stats-reduce) (#4314)
  - un Node trop ancien le DIT au moment ou il echoue, pas a l'installation
  - lever un bannissement se dit dans les sept langues, comme le poser
  - l'ordre des arguments suit la DECLARATION, pas l'intention de qui appelle
  - recalibrate call-quality RTT ladder to iOS long-haul parity (#4304)
  - une decision PURE n'a que faire de l'isolation du module qui l'heberge
  - un glissement de navigation se retourne pour l'arabe, un objet qu'on déplace non (#4299)
  - un JWT porte sa session, pour qu'une revocation ciblee l'atteigne
  - ouvrir une session ne passe plus par une jumelle appauvrie, et un oracle de session disparait
  - les listings d'amitie passent du decalage au curseur, sur les trois clients
  - fermer une video en pause ne detruit plus la position de reprise qu'on vient d'ecrire
  - le plein ecran d'un media de commentaire feuillette l'objet entier, legendes comprises
  - une boucle de STATUT s'arrête sous Reduce Motion sans cesser de le dire (#4290)
  - l'onglet sante lit trois sondes qui existent, et dessine leur echec
  - creer un groupe depuis le tableau de bord aboutit — un groupe est une COMMUNAUTE
  - les six routes des sujets de l'agent repondent, et un motif explosif ne fige plus le gateway
  - pure low-light-boost decision core folded from the frame's luma (#4272)
  - signaler un contenu n'est plus un geste d'administration
  - le vocabulaire des bascules était enfermé par son NOM (253i) (#4268)
  - une permission ne garde pas une ROUTE, elle garde un CHAMP
  - la puce de langue avait une NEUVIÈME copie, que la garde ne pouvait pas voir (252i) (#4261)
  - toute garde d'administration s'écrit avec le vocabulaire de la loi unique
  - a media-only story queued offline surfaces its ring and failure strip, not silent loss (#4262)
  - une seule matrice dit qui peut administrer, et les clients la lisent à une adresse
  - le point qui sépare naît muet, et ne s'écrit plus qu'à un endroit (251i) (#4257)
  - une erreur typée garde son sens, et révoquer une session coupe CE socket
  - a story slide shows an instant blur behind its loading background image (#4259)
  - le carnet d'adresses se synchronise par DELTA, jamais en entier
  - un bouton dessiné ne laisse plus son dessin faire la cible (250i) (#4252)
  - une demande d'amitié suit UN chemin, dans les deux sens
  - a story draft's on-canvas stickers survive leaving the composer, retiring the fidelity gate (#4253)
  - bloquer devient un ÉTAT, et la présence d'un inconnu ne fuit plus
  - la puce de langue se dessine à UN endroit, et sa cible est enfin servie (249i) (#4249)
  - a story draft's on-canvas text elements survive leaving the composer (#4247)
  - les trois clients lisent un profil à l'adresse canonique, en un aller-retour
  - a story draft's colour/media background survives leaving the composer (#4244)
  - verifier un numero ne dit plus s'il appartient a un compte
  - trouver une personne passe par deux portes
  - un écran de réglages dont le chargement a échoué ne remet plus les autres réglages à zéro
  - leaveCall() décide "dernier participant ?" sur une lecture fraîche, plus un instantané périmé (Vague 183)
  - les préférences se relisent à la reconnexion socket (parité #4197/#4209)
  - changer un réglage de confidentialité ne remet plus le chiffrement à zéro
  - l'API ne sert plus de route « to be implemented »
  - a story draft's pinned duration survives leaving the composer (#4229)
  - ouvrir une suppression de compte exige la preuve qu'on est la
  - un onglet ouvert hors ligne ne déclare plus une hydratation qui n'a rien lu
  - visiter un lien de suppression ne supprime plus un compte
  - aucun ecran n'appelle plus une route qui n'existe pas — et une garde qui le prouve
  - le double des préférences se rattrape à la reconnexion, sans annuler un geste en cours
  - leaveCall() rediffusait encore call:ended/summary sur la branche « conflit de version »
  - couper ses accusés de lecture éteint les coches sans recharger la page
  - un réglage changé sur un autre appareil atteint l'iPhone tout de suite
  - l'import manquant du double d'outbox dans les témoins de synchro
  - les préférences user-level se rattrapent à la connexion, sans annuler un geste en attente
  - coturn TURN config was versioned but never mounted (#3641)
  - le collecteur de test vit dans backgroundScope, pas dans le TestScope
  - les deux GET neufs manquaient au double de CategoryRepositoryTest
  - un réglage changé sur un autre appareil atteint enfin le magasin local
  - la scene de l'atelier se centre, respire et s'ecrit par-dessus — la carte se detache par son OMBRE
  - un glob de chemin dans un KDoc ouvrait un commentaire imbriqué
  - les préférences changées sur un autre appareil atteignent enfin le téléphone
  - le titre du mood devient la question, Publier rejoint la croix en LiquidGlass
  - le @ ouvre les mentions dans la description, et le CI iOS repasse au VERT (beta)
  - les quatre portes du rail ouvrent enfin — un portail d'ingestion appartient au MEUBLE, jamais a une surface
  - le bas respire — la rangee d'outils devient conditionnelle, la description devient un calque de LECTURE
  - meeshy.sh sait viser un simulateur du PROJET — et le budget de taille des fichiers devient une regle
  - la scene incrustee devient une SURFACE — quatrieme vue, zero exception dans le document
  - le document cesse de porter les exceptions de la scene — retour a la regle 4.3
  - le rail trailing porte les controleurs — la MEME regle que l'appui long, une autre geographie
  - les filtres de conversation se composent, sous le rail — et un second appui les retire
  - le rail se pose DANS le couloir reserve — et la preuve est un NOMBRE, pas un coup d'oeil
  - débloquer un contact aboutit enfin — un type trop strict transformait le succès serveur en échec client
  - le rail leading porte les portes — et les six n'agissent PAS sur le meme niveau
  - la frappe s'annonce depuis la Dynamic Island — la pastille garde sa taille et retrouve son assise
  - la scene s'ENCASTRE entre les deux rails — l'encastrement cesse d'etre un litteral
  - « Sortir de la scene » — la quatrieme action de l'appui long, celle qui ecrit le PLAN
  - la LEGENDE d'un media voyage enfin jusqu'au serveur — la colonne servie que personne n'ecrivait
  - le survol d'envoi disparaît — le message part, la bulle arrive, rien entre les deux
  - le gate redevient vert — et l'outil « @ » ouvre enfin la feuille qui nomme
  - l'amorce « derniere capture » parait enfin — un mode PhotoKit qui ne telechargeait jamais
  - le socle RETRECIT aux grandes tailles de texte — il ne se casse plus en syllabes
  - la rangee d'outils DEFILE, et son occultation est la teinte du plateau
  - l'appui long n'offre plus que les actions qui ont un EFFET
  - un son pose sur une scene en devient la BANDE-SON — le troisieme emplacement
  - l'inspecteur de scene etait cable de bout en bout — et INATTEIGNABLE
  - le mime DECLARE voyage avec le media pose — l'extension cesse d'etre devinee
  - le composant Position dit QUEL lieu — entete, bascule, croix de verre, et le chip disparait
  - le Mood rejoint l'eventail du fil — et l'ordre publieur-avant-offre est tenu
  - la fiche d'un participant existe enfin, et un administrateur y ouvre l'historique par date
  - « qui voit l'historique » quitte la diffusion large, et un départ du salon global est respecté
  - le ⋯ arrive avec son premier contenu — et « tout effacer » revele que reset() n'oubliait pas ce qu'il avait porte
  - le header du composer d'un seul tenant — fermeture, type en menu de verre, rail des slides — et l'oeil revient au socle
  - un post à plusieurs médias devient un carrousel de slides, navigable et peint plein cadre
  - la frappe atteint enfin le pixel, et l'accent tient six secondes réarmables
  - accent SyncPill lié au signal, retry nettoie la file, suppression sans confirmation
  - une rangée qui entre à l'écran arrive à sa hauteur, jamais étirée
  - taper un objet de la scène incrustée fait paraître ses contrôles au-dessus de la rangée d'outils
  - transférer arme la sélection, coche visuelle fiable, suppression groupée
  - choisir un fond fait NAÎTRE la scène incrustée en haut de l'écran document — plus de switch vers l'atelier plein écran (Phase 2 composer unifié #3939)
  - EmbeddedSceneCanvas — le canvas de scène éditable, borné et arrondi (Phase 1 composer unifié #3939)
  - la toolRow redevient statique à fond uniforme — fini le fond noir sous le drapeau
  - la liste de mentions montre avatar + nom d'affichage + @pseudo
  - la toolRow défile sous le drapeau fixe, la palette de couleur se replie derrière une icône (#4031 #4032)
  - le fold « Position » (découvrabilité à proximité) redevient lisible sur le plateau sombre
  - un SIMPLE tap sur une vidéo l'ouvre en plein écran (double tap réservé aux réactions #4020)
  - la coche de sélection s'affiche sur TOUT message coché, compteur « N sélectionnés » dès 2 (#4022 #4023)
  - Sélectionner promu en action primaire, clavier ne se rouvre plus, cercles toujours à gauche, reconfigure ciblé (#4004, #4005 ter, #515)
  - la pastille de synchro se voit, s'anime et s'efface (#4016 #4017 #4018)
  - un double-tap sur une vidéo l'ouvre en plein écran et la lit
  - une citation média désigne la MÊME pièce jointe à l'icône et à l'ouverture
  - le survol d'envoi ne double plus l'emoji à gauche en Focal/Script
  - décale les bulles reçues pour loger le cercle de sélection dans la marge (#4005 bis)
  - sélection multiple de messages, plafonnée à 100, pour un transfert groupé (#4005)
  - le forward retrouve son cache-first — les conversations de la machine s'affichent sans spinner
  - le repositionnement du longpress lisait un frame jamais alimenté en mode liste standard (#4004)
  - le menu longpress ferme le clavier, remonte vers le centre si trop bas, et restitue l'état après (#4004)
  - éditer un message ne perd plus le brouillon en cours (#4003)
  - « depuis le 15 » ouvre bien le 15, et un silence n'efface plus l'octroi
  - mentions sous le curseur, sans chevauchement toolRow, repli découvrabilité (beta)
  - une conversation ouverte longtemps ne chauffe plus — le pouls de la pastille de synchro n'empile plus ses animations
  - la révocation par push atteint le DISQUE avant qu'iOS suspende le processus
  - le fond flou reste un FOND — jamais la vignette nette, jamais un blob abandonné
  - dette technique du plein écran net — cache, gardes, reprise de poster
  - la vignette reste un état de chargement lisible, jamais un blocage silencieux
  - un admin pose ou retire « voit l'historique depuis le <date> » sur la fiche
  - la visionneuse plein écran d'image ouvre nette, jamais sur la vignette
  - le plein écran d'une image ou d'une vidéo ouvre net, jamais sur la vignette
  - un push de révocation met à jour le cache et la cloche, pas seulement la bannière
  - mentions sous le texte, fond n'active plus la scène plein écran (#3904, #3939)
  - retire la remontée du survol d'envoi — ne garde que le fondu
  - retire le padding mort qui faisait déborder toolRow (#3903)
  - toolRow sans chevauchement, @mention et repli découvrabilité (#3903, #3904, #3905)
  - un emoji rapide envoie directement au lieu de rester dans le champ
  - le survol d'envoi passe derrière la barre, prend la forme réelle et se pose en douceur
  - persist a story draft's photo filter (+intensity) across leaving the composer (#3936)
  - la garde des durées SUIT l'hôte qui a déménagé (248i, run tests)
  - persist the story-draft canvas framing (pan/zoom) across leaving the composer (#3932)
  - une étiquette de média se résout à UN endroit — 17 gravures et 44 jumelles soldées (248i)
  - logout teardown wipes the in-progress story composer draft (#3929)
  - Prism preview parity mirror tracks the fixture's 30 vectors (#3930)
  - le repli de la clé de dedup strippe la région — parité des 3 miroirs (iter 278)
  - rend la gate iOS verte — 3 gardes rouges (1 de mon fix carte, 2 héritées) (beta)
  - un seul sélecteur de mode — l'éventail absorbe le sélecteur de destination, RÉEL rejoint STORY sur la scène (B3, #3926)
  - une description repliable sous le canvas, affichée par le reader par-dessus la scène — B2, #3925
  - le média composé au document SUIT dans la scène — B1 clôt la préservation du contenu (texte + média), #3924
  - le survol d'envoi monte depuis hors écran (sous le clavier) avec un effet ressort
  - le bouton d'envoi apparaît/disparaît en tourbillon ; deux emojis rapides envoient directement
  - la carte à proximité passe à deux niveaux — switch Nearby/Discover en haut, puis sous-modes (Nearby: Densité·Points·Liste ; Discover: Densité·Populaire, chaleur par vues+impressions)
  - le canvas se travaille dans une carte franche — contour arrondi SOLIDE, plus de pointillé ; le magnet reste, il représente les zones de vue/vie (directive 2026-08-27)
  - le contenu écrit suit dans la scène qui naît — loi 9, changer de mode ne jette pas le texte (B1 incrément 1, #3924)
  - l'horloge d'édition s'éteint après quelques secondes d'inactivité
  - E2 ne conflate que quand il y a du TEXTE — un vocal PUR garde la langue parlée (7.4b), le crux bascule sur content==nil (E2, #3887)
  - câble le nom de l'expéditeur sur la pastille de retour
  - le texte envoyé s'envole du composer vers le fil
  - en Script/Focal, le drapeau de langue ferme le groupe
  - l'UI langue par élément couvre média/audio/sticker/lieu — barre flottante sur sélection, mêmes choix que le texte, point d'entrée unique (E3 UI, #3888)
  - la pastille de retour au direct nomme l'expéditeur
  - chaque élément de la scène porte sa langue d'origine — sticker/lieu rejoignent texte/média/audio, défaut = langue déclarée, round-trip wire (E3 couche données, #3888)
  - la barre est transparente, le bouton d'envoi n'apparaît qu'avec du contenu
  - a restored story draft drops media that's gone instead of resurrecting it (#3922)
  - le média de fond porte sa propre langue, distincte du texte — le crux document ne conflate plus texte et audio (E2, #3887)
  - structure d'affichage média par le poste — carousel (post) / diapositives horizontales (réel), dérivé du type, sans autre choix (directive 2026-08-27)
  - l'invalidation de récupération du scroll ancre la lecture
  - le badge de non-lus rattrape le curseur serveur depuis Résumé et Rivière
  - la langue déclarée au composer est le défaut de tout objet de la scène et du contenu réel/story (E1, #3886)
  - choisir STORY route vers la scène et publie STORY — le type choisi gouverne vraiment la publication (F1/F2, #3884 #3885)
  - choisir une couleur de fond fait naître la scène 9:16 — un post sans visuel devient une toile (F2, #3885)
  - le média qui qualifie se choisit d'un geste — POST · RÉEL · STORY, et le type choisi gouverne la publication (F1, #3884)
  - le plein écran d'une image ou d'une vidéo ouvre net, jamais sur une vignette
  - codes de vérification cryptographiques + neutralisation d'injection CSV
  - story composer draft survives leaving and reopening (#3899)
  - retire la clé morte `emoji.close` — la feuille d'emoji est passée à `common.cancel` (suivi A, #3880)
  - on VOIT le média choisi — ruban de vignettes retirables, et le type POST↔RÉEL suit le média (B, #3883)
  - l'inscription s'annonce dans Meeshy, et l'historique ne s'ouvre que depuis l'arrivée
  - la rangée d'outils passe à un jeu SF moderne — famille ligne, rendu hiérarchique, rebond au tap (C, #3882)
  - un push de contrôle annule la bannière déjà livrée au retrait/à la suppression, et l'édition la remplace
  - les feuilles de création du composer portent un Cancel SÉMANTIQUE — placé par le système, miroité en RTL, lié à Échap (A, #3880)
  - un composant réutilisé annonce le titre de SON contexte — la langue du post ne dit plus « Langue de l'audio » (beta)
  - repost someone else's story — composer carries repostOfId to the wire (#3889)
  - les schémas de pagination admin convergent sur UNE forme entière bornée
  - reader-side locked repost attribution badge in the story viewer (#3864)
  - la page du fil récupérée est persistée AVANT que loadFeed rende la main — plus de sauvegarde détachée jamais attendue
  - le test d'échappement </ porte sur un champ que la page embarque encore (horizon), pas sur title retiré de KEEP_ITEM
  - la page n'embarque que les champs qu'elle lit (164 → 100 Ko) ; pagination GraphQL, parseur --paginate et repli REST testés
  - la page « Avancement Meeshy » sur GitHub Pages — % global, par horizon, par milestone, rythme par période — régénérée par une Action
  - la revue adversariale du lot 3 attrape 3 commentaires stale et un nom de test qui ment
  - le CONTENU d'une diffusion admin descend le Prisme ORDONNÉ
  - une traduction vide ne vide plus la ligne de liste — le résolveur iOS rejoint la SSOT TS et le jumeau Android ; le test « session anonyme nulle » cesse d'hériter du jeton de son voisin
  - la citation reste sur la feuille, l'overlay iPad reçoit un nom, et le retrait de la feuille a son inventaire opposable
  - le PLEIN composer du fil passe par le meuble unifié — sans perdre un seul de ses outils
  - unified long-press context menu for canvas text elements (#3859)
  - les cinq outils de la barre du composer font enfin quelque chose — le micro clôt le lot 2, et la voix garde SA langue
  - composer draws the persistent safe-zone + rule-of-thirds overlay while dragging (#3855)
  - un socket vivant prouve la connexion — le bandeau « hors ligne » cesse de croire navigator.onLine, et une adhésion orpheline ne perd plus l'instantané des non-lus
  - le 5e outil pose un LIEU sur le post — avec son second opt-in de trouvabilité, off par défaut et jamais posé sans consentement
  - sept boucles de travail continu éteintes — le chrome respire à l'annonce, se tait au repos
  - une vidéo composée dans le meuble peut rester un post simple — l'interrupteur POST ↔ RÉEL que la feuille absorbée portait
  - le glow des six boutons du menu ne respire plus invisible derrière la liste
  - visée vérifiée des sauts de message + lecture de fenêtre GRDB hors MainActor
  - trois outils du meuble posent un fichier local — et ce fichier part avec sa VRAIE durée et son VRAI mime, pas figé
  - modernize TaskTimeout async sleep to duration API
  - viewer honours a text element's frosted-glass / solid backdrop (#3748)
  - un post écrit en anglais cesse de partir étiqueté français (T2.2)
  - ComposerDocumentMedia retrouve son doc-comment, ComposerDocumentDraft le sien (revue Opus T2.1, constat 1)
  - un post composé dans le meuble peut enfin porter une photo, une position et sa langue — et il part par la file durable (T2.1)
  - composer authors a background video's framing (#3618)
  - `autoTranslateEnabled` devient une préférence écrivable servie depuis une source unique, et l'export RGPD a enfin un bouton qui exporte
  - la réaction à une story survit à une coupure réseau, et le 4e chemin des commentaires descend enfin le Prisme
  - l'attribution d'une republication n'est plus contournable, et « Mettre au premier plan » a enfin un effet
  - l'export MP4 rend enfin le zoom et le slide d'ouverture — et StoryPlaybackClock, sans appelant, disparaît
  - resetMetrics cacheSize omits onlineEnsureCache
  - resolve reactor identity via participant SSOT (181i)
  - enforce numeric 6-digit regex on verifyPhone.code for parity with verifyEmail.code
  - ouvrir une conversation au cache CHAUD rejoue le rattrapage par watermark — un trou de plus de trente messages n'est plus invisible
  - l'accent d'un salon public/global/broadcast rejoint la couleur community, et Android rejoue enfin les 24 vecteurs partagés
  - reader honours a background video's framing transform (#3530)
  - composer authors a background image's framing transform (#3527)
  - les durées passent par la locale, et VoiceOver les dit en mots (247i) — run test
  - le regroupement de bulles brise le groupe au changement de jour — parité avec la règle canonique iOS/Rivière
  - viewer honours a background image's framing transform (#3524)
  - la présence n'est servie qu'aux amis, à soi et aux ADMIN+ — et la règle gouverne aussi ce qu'on SÉLECTIONNE, ce qu'on TRIE et ce qui part À CÔTÉ
  - la famille deinit iOS 26.1 couvre TOUTE classe @MainActor de l'app, pas seulement les ObservableObject
  - la lane release nomme sa cible à get_version_number — le projet a quatre targets et le prompt « What target ? » faisait échouer la lane APRÈS l'upload, en mode non interactif
  - la garde core rend parse/bodyContainsDeinit private — result type privé
  - la carte « Posts sur la carte » fusionne dans « À proximité » — mode Discover, réservé au staff de la plateforme
  - 13 classes @MainActor du CORE MeeshySDK cessent de tuer les suites sur iOS 26.1 — 3e site de la famille
  - TileBox gagne sa nonisolated deinit — le trou que la garde durcie a trouvé après le merge
  - les gardes deinit encaissent la revue Opus — doc-comment exact, parseur qui ne blanchit plus à tort
  - l'auteur choisit si la vidéo d'arrière-plan de story boucle (#3522)
  - la garde deinit borne son seuil de sanité à l'effectif réel de MeeshyUI (88, pas 150)
  - l'écran « À proximité » trappait à la première transition réseau — le sink d'un ViewModel @MainActor recevait sur la file utility de NetworkMonitor
  - 69 classes de MeeshyUI sans deinit cessent de tuer les suites sur iOS 26.1 — et une garde l'interdit
  - 71 classes @MainActor sans deinit cessent de tuer les suites sur iOS 26.1 — et une garde l'interdit
  - fiche App Store complète — positionnement « amis sans frontières » branché sur la lane release
  - composer designates a slide's looping background media (#3518)
  - la présence n'est visible que des amis, de soi et des ADMIN+
  - le renfort « c'est moi » gagne les pièces jointes, les commentaires de story et le détail de post — et la règle qu'il applique est enfin mesurée pour ce qu'elle dit
  - la cellule C8 nomme enfin la sha qu'elle mesure — R2 de la revue 1b
  - le renforcement « c'est moi » quitte ses quatre copies pour un composant — et la règle qu'il énonçait devient vérifiable
  - la lede redit 109, plus 104 — R1 de la revue 1b
  - l'action que J'AI faite se distingue à vue d'œil — un contour à l'accent du contenu
  - réduire les aliases ISO 639-1 dépréciés (iw→he, in→id) — parité Prisme 3 clients
  - author a text element's per-element visibility timing (#3516)
  - l'ancien composer de mood disparaît — la parité est prouvée bloc par bloc
  - trois signatures audio mortes quittent le SDK, et deux gardes cessent d'être vertes-et-vides
  - defilement sans effet ni saut, accuses de lecture fideles a l'ecran, conversation ouverte a jour, frappe en Riviere (directives 1, 2, 3)
  - --require-connected du gate devient un drapeau qui existe vraiment
  - l'ancrage « garder sur mon fil » cesse d'emprunter le glyphe des favoris
  - la garde A4 borne enfin sa fenêtre au site suivant, plus à 400 caractères aveugles
  - libelles localises, bouton d'envoi a l'accent de la conversation, jetons de couleur (directive 8)
  - geler la video au lieu de la couper sous mauvais reseau, iOS et web (directives 5, 6)
  - prechargement soumis a la politique reseau, cache des commentaires reecrit, repost STORY hors du fil (directives 2, 7)
  - la traduction tardive bascule la bulle, l'edition purge les caches, markAsReceived coalesce (directives 2, 3, 7)
  - sockets compressees, session revoquee ecoutee, amis et notifications en masse synchronises (directives 2, 7)
  - une mise a jour de profil n'efface plus les champs qu'elle n'edite pas (directive 3)
  - synchroniser TOUT le carnet par lots avec filigrane serveur (directive 4)
  - gate a timed element to its own play-mode visibility window (#3512)
  - sur une story, republier et garder sur mon fil cessent d'être le même dessin
  - la porte de mise a jour crashait toute suite de tests sur iOS 26.1 — une deinit isolee sans tache courante
  - author a per-slide colour/gradient/random-pastel backdrop in the composer (#3510)
  - un message rétracte la frappe qu'il annonçait — et la bannière in-app cesse de filtrer un utilisateur PRÉSENT
  - ouvrir une conversation ne relisait RIEN du serveur — le fil restait sur un cache perime pendant que la liste, elle, etait reparee
  - la garde trouve la FEUILLE, l'itérer trouve l'ARBRE [244i] — run test
  - recharger une conversation rendait l etat n-1 pour toujours, et retirer une reaction en effacait une au hasard
  - the viewer honours a slide's serialised colour background
  - author a per-slide duration pin in the composer (#3505)
  - lot 6 W8-W9 + lot 7 (7.5/7.7/7.8) — editer un REEL republie le reconvertissait en POST, sans un geste
  - la règle ObjectId rejoint le SSOT partagé, et config.ts gagne sa borne testée [It. 266]
  - the viewer honours per-slide duration (SSOT), not a flat 5s (#3503)
  - la borne .max(5) des codes de langue rejetait bas-CM dans neuf schémas [It. 266]
  - fold realtime story:updated into the tray cache (#3501)
  - la garde lit le corpus UNE fois — et le rouge du fil est une course, pas un flake [243i] — run test
  - lot 7 (7.2/7.3/7.4) — un post media publie HORS LIGNE arrivait VIDE, sans un mot
  - fold realtime story:deleted into the tray cache (#3499)
  - cinq fonctions que personne n'appelle, trois traductions que personne ne lit [243i] — run test
  - une republication cesse de se dupliquer, et un media publie depuis le web EXISTE
  - lot 5 — un media RECU se compose, et la porte cesse d etre une promesse
  - skipMessageKeys avançait la chaîne sans avancer le compteur [It. 266]
  - fold realtime story:updated into the open viewer (#3496)
  - le témoin des chiffres arabes jugeait une GRAPHIE avec une API de COLLATION [242i]
  - lot 4.7 — l ancrage atteint un ecran, et le publieur naît avant la fleche
  - lot 6 W7 — les portes de CREATION basculent sur le meuble unifie
  - le consentement de decouvrabilite, sa precision, et l ecran de proximite
  - le socle cesse d offrir une audience que le serveur remplacera, et une memoire d audience cesse de boucler sur un refus
  - le NOM cesse d etre tactile, l avatar devient la seule porte du profil, et un media cite se joue en plein ecran
  - fold a realtime story:deleted out of the open viewer (#3494)
  - lot 6 tranche W4-W6 — le micro devient un OUTIL, la story est absorbee, le mood et l audience passent par format
  - la protection d un media CITE etait retiree par le serialiseur — la vignette d une vue unique s affichait apres un rechargement
  - la bannière d'un vocal servait la bonne langue et attachait le mauvais son
  - fold a realtime repost from post:reposted onto the feed head (#3490)
  - summarizeCallReliability diluted qualityDistribution with never-connected calls [Vague 180]
  - WebRtcCallCoordinatorTest.kt never stubbed engine.createAnswer() [Vague 178]
  - WebRtcCallCoordinatorTest.kt had an unimportable io.mockk.match [Vague 178]
  - le glisser-déposer d'une communauté n'atteignait aucun autre appareil
  - l arc-en-ciel cesse d encadrer du vide, et son spectre cesse de tourner
  - le double tap prend l action de la carte, l appui long retourne au menu du message
  - le mood entre dans le meuble — et un doc-comment rendait 738 lignes INVISIBLES a toutes les gardes de source
  - un message RAPPELÉ poussait son texte original vers la personne visée et les mentionnés
  - reportIncomingVoIPCall never arms the background observer during ring (run test)
  - UpdateMessageBodySchema n'avait aucun plafond de contenu — le seul transport d'écriture sans borne
  - fold realtime post edits from post:updated onto the cached card (#3485)
  - la bulle pré-enregistrée d'une réponse ou d'une mention était ordonnée par l'horloge du DEVICE
  - le composer unifie arrive au web — le contrat partage trouve son premier consommateur, l eventail et la surface document
  - fold realtime comment edits from comment:updated into the thread (#3482)
  - rappeler depuis un avis d appel exige un APPUI LONG — le tap ne pose plus d appel
  - expel an accountless visitor by participantId — main was red (#3479)
  - isIpInRange admettait des IP HORS plage (allow-list sur-permissive)
  - CallKit late-promotion of a still-ringing call was permanently unreachable
  - la planche devient FIXE — plus aucune animation entre les messages
  - répondre par un VOCAL poussait une bannière au corps VIDE
  - un repost visait le MAILLON et non la RACINE, et reposter un mood fabriquait un contenu detruit une heure plus tard
  - la porte du fil cesse de designer sa feuille historique — et le lot nomme les trois capacites qu il ne tient PAS
  - WebRtcCallCoordinator applied any incoming WebRTC signal with no negotiation-epoch guard [Vague 178]
  - la protection masquait le TEXTE et laissait partir le FICHIER
  - les résolveurs posts + focal consomment resolvePrismTranslation au lieu de réécrire la descente (itération 262)
  - la reconciliation depuis le cache cesse d ecrire « user » en dur
  - la NATURE d un message devient corrigible — un avis d arrivee fige en « user » ne pouvait plus jamais redevenir « system »
  - une conversation redevient modifiable, et un visiteur sans compte expulsable
  - un sticker devient un MEDIA INTEGRE du post — pose, publie, dessine, et copiable depuis ce qu on recoit
  - houseSpectrum traversait la frontiere d acteur a chaque appel
  - une reaction recue ecrasait le message reagi dans la base locale
  - le token `thread.row.padding.vertical` etait applique a iOS seulement
  - le banc d'essai passait le locale sans le bundle — gabarit anglais en CI [242i] — run test
  - une SEULE ligne basse — drapeaux et reactions a gauche, date et coches tout a droite
  - la langue de cadrage d un destinataire nomme descendait au rang 1
  - call:check-active dropped a rejoin when the departed CallParticipant row sorted last [Vague 177]
  - les quatre rouges de la CI — un token de design ignore, une marge geometriquement fausse, deux interpolations Swift copiees telles quelles
  - huit boutons dont le libellé est une FORME — la barre de progression de l'inscription [242i] — run test
  - fold realtime comment translations from comment:translation-updated (#3469)
  - fin de fichier en `\n` LITTERAL — la seule erreur du build iOS [cycle 124]
  - l auteur retourne en bordure, les groupes respirent moins dedans et plus entre eux, 3 ou 5 drapeaux selon la magnificence
  - la bulle pre-enregistree au demarrage a froid n'a jamais eu de corps [cycle 124]
  - la vague 3 pose la cle de voute — le meuble a enfin un appelant de production
  - trois arbitrages en attente — un golden qui ne se decode pas, des televersements sans locale, cinq gardes perdues
  - la magnificence ne s arme plus au premier pixel — vitesse franche, ou defilement soutenu
  - l auteur sort de la bulle magnifiee — sans capsule, comme en Script
  - 67 cles affichaient leur identifiant en francais — et le cliquet ne pouvait pas le voir
  - les deux gardes du dashboard épinglaient une graphie, pas leur règle [241i] — run test
  - le fil push porte enfin `content` et `originalLanguage` — la bulle pré-enregistrée par la NSE était VIDE
  - un vocal protégé ne pousse plus sa transcription, et la bannière d'un vocal descend le Prisme
  - on ne lit pas ce qu on n a pas recu — « Distribue 0 » en face de « Lu 2 » sur le meme message
  - l auteur d une bulle magnifiee redevient entier — et son toucher mene a ses conditions dans la conversation
  - l arc-en-ciel des bulles devient une aurore — et les couleurs de l auteur cessent d etre ignorees
  - deux orthographes du pourcentage dans un même composant — les nombres que la locale ne touchait pas [241i] — run test
  - route message-search page size through validatePagination
  - outgoing call ignored a real call:missed after the callee early-joined [Vague 176]
  - fold realtime post:translation-updated into the feed (#3460)
  - la coupe a trente mots ne vaut que pour la rangee plate — la bulle garde son depliage en ligne
  - le fil au repos ne montre plus ses details de reception, la carte du focus perd son cadre, une transcription tient en trente mots
  - les trois warnings du build, et quatre suites de tests qui ne tournaient nulle part
  - « 1 réponses » — les compteurs d'engagement du fil qu'aucune clé plate ne pouvait accorder [240i] — run test
  - un champ sans ecrivain sort des deux contrats de fil
  - l'e-mail de demande d'amitie sort du depot — le canal etait deja servi
  - `updatedSince` est REFUSE la ou il n'est pas implemente
  - la lecture des posts d'un son porte sa borne EXPLICITE, et le cliquet des findMany nus redevient vert
  - hasMore et le curseur portent enfin sur la MEME collection, filtree
  - l'instrumentation du collecteur cesse de MODIFIER le graphe qu'elle observe
  - un middleware d'authentification DECLARE son regime, au lieu de le laisser deviner
  - le compteur d'acces part desormais du CODE, et couvre les trente-sept adresses depreciees qu'aucune liste ne voyait
  - les trois portes de profil public transmettent enfin le parametre qui reduit la requete
  - le manifeste cesse d'annoncer publiques 211 routes qui exigent un jeton
  - quatre suites de tests redemarrent, et le cliquet couvre aussi ce qui n'est pas un package.json
  - canonicaliser les langues cibles d'audience de story avant filtre de pivot et dédup (#4485)
  - deux listes d'administration comptent en base, et la forme d'agregation suit ce que la donnee replie
  - le compteur qui gouverne le retrait des alias voit enfin les adresses qu'il doit retirer
  - les langues cibles d'audience de story sont canonicalisées avant filtre de pivot et dédup
  - le manifeste voit les quatre routes d'administration Socket.IO, et un temoin garde ce qu'il ne voyait pas
  - le predicat qui decide si un TEXTE peut voyager rejoint son jumeau MEDIA
  - les six lectures de statistiques comptent en base, et le temoin porte sur les lignes lues
  - les trois portes de profil annoncent une adresse que le client peut suivre
  - le limiteur du test de motifs declare son sens de l'echec, au lieu de l'heriter en silence
  - la collection d'accuses rentre dans son budget, et son alias se redeclare a son site
  - les portes d'accuses de lecture annoncent leur successeur, et la garde qui l'exigeait cesse de regarder deux fichiers
  - le limiteur des appels compte enfin le compte qu'il annonce, et son refus cesse de repondre 500
  - un identifiant de mutation mal forme dit enfin POURQUOI
  - LocationHandler valide sa frontière socket par Zod et borne la télémétrie diffusée (281) (#4267)
  - MaintenanceService arme ses tâches périodiques par la forme bénie (non-async + .catch) (#4412)
  - translation:request valide sa frontière socket par Zod (284i) (#4336)
  - le plus gros fichier de routes se decoupe, y compris son handler de 1140 lignes
  - six fichiers de routes hors budget se decoupent par responsabilite
  - les onze plugins de profil rentrent dans leur budget, derriere une facade
  - le predicat qui dit si un TEXTE peut voyager quitte le fichier de route
  - les accuses de lecture passent par une collection unique, et markedCount cesse de nommer deux grandeurs
  - un motif de mot-cle sain cesse d'etre refuse parce que la machine est chargee
  - les categories de conversation ont leur adresse canonique sous /me
  - le cinquieme analyseur de champs rejoint le module, et deux lectures de profil PROUVENT qu'elles ne le peuvent pas
  - la porte des liens d'une conversation annonce son successeur, et le refus d'un lien clos est enfin ATTESTE
  - un seul analyseur de champs, et la requete se reduit vraiment
  - lire ses propres droits ne traverse plus le prefixe d'administration
  - restaurer une conversation le dit enfin aux autres appareils, et le piege pose par le lot precedent tombe
  - la liste d'administration des messages cesse de servir le texte, et les cinq medias, d'un message protege
  - le premier a avoir ete administrateur herite du fil, par UNE loi que les deux portes posent
  - le premier a avoir ete admin herite du fil — une seule loi pour les deux portes
  - lire une conversation privee depuis l'administration devient un geste souverain, motive et trace
  - trois listes de posts rejoignent l'union des scopes, et leurs gardes viennent avec elles
  - les deux routes d'administration Socket.IO portent enfin la version
  - l'OpenAPI publie ecrit ses chemins comme le reste du depot
  - la porte inscrite d'un lien applique enfin la loi d'admission, et la derniere place ne se donne plus deux fois
  - la jointure par lien ne charge plus la conversation ENTIERE
  - la fiche cesse de servir a tout membre le fait de moderation que le socket ne diffuse plus
  - sept lectures cessent de charger ce qu'elles ne servent pas, et une garde empeche la huitieme
  - le changement de contact vit sous une seule surface, exige le mot de passe, et se compte par NUMERO VISE
  - une session revoquee ferme aussi les requetes REST, pas seulement le rafraichissement
  - les quatre dernieres fabriques de debit comptent enfin par compte
  - un garde-fou de harnais cesse de mesurer la DETTE et mesure enfin l'OUTIL
  - une seule loi decide qui entre par un lien, et la derniere place ne se donne plus deux fois
  - un plafond « par compte » pose sans hook compte par adresse partagee
  - l'enregistrement des routes devient une table de donnees, et un nom d'alias cesse d'etre une identite
  - les categories de conversation cessent de compter le debit sur l'IP, et un rejeu ne cree plus deux fois
  - l'import dedouble par la fusion part, et les deux temoins suivent la version retenue
  - un membre peut enfin lister ses propres liens, et une seule porte les gere
  - la lecture de son propre compte cesse d'exister en deux exemplaires
  - la corbeille de conversations montre enfin ce que l'utilisateur a supprime
  - un code a six chiffres se devine quand personne ne compte les essais
  - la protection posee sur une porte manquait a sa voisine
  - la moitie qui ecrit dans la colonne que personne ne lit passe en sursis
  - l'alias non versionne des pieces jointes DIT qu'il est en sursis
  - l'ancienne adresse des demandes d'ami cesse de diverger de la nouvelle
  - un curseur de lecture ne saute plus sur l'horloge d'un fil voisin
  - une ecriture sociale couteuse ne part plus sans plafond, et la cle est le COMPTE
  - ce qui se PERSISTE est la cle du media, plus son adresse
  - le fil socket d'un attachement porte enfin capturedInApp, comme le select et le REST (#4291)
  - un fil social se lit par une route parametree, et une query invalide se dit
  - une fenetre de messages ne revele plus l'instant d'un fil voisin
  - fabriquer un lien de partage exige un rang, et une seule porte l'ecrit
  - changer son adresse de contact exige de prouver qu'on la possede
  - chaque route d'admin porte le niveau que la matrice lui donne, pas une permission empruntee
  - le manifeste cesse d'annoncer PUBLIQUES cinquante et une routes qui exigent un jeton
  - les cliquets d'inventaire disent ce que ce lot a REPARE, deplace et ajoute
  - les temoins suivent la forme fusionnee, et la jumelle du manifeste ne part pas
  - une liste ne rend plus une collection entiere
  - aucune route ne remonte a la racine par oubli de prefixe
  - le delta sait rendre les conversations, et se compte par compte
  - le fil qui coupe un motif explosif ne peut plus emporter la passerelle
  - le cliquet des schemas ouverts cesse d'etre clé par NUMERO DE LIGNE
  - la table des routes servies devient un artefact, et elle fait foi
  - une reponse ne transporte plus un champ que personne n'a declare
  - une route depreciee le DIT, a un seul endroit
  - le retrait d'une route se prouve par un compteur, pas par une revue de code
  - aucune porte morte ne subsiste sur les messages ni sur les liens de partage
  - le televersement, la voix et le fil social ne montent plus de route sans appelant
  - les octets d'une piece jointe ne sont plus joignables par deux chemins
  - quatre routes servaient {"success":true} et rien d'autre
  - une ligne mal typee ne dort plus des mois — la sonde de derive la compte et le dit
  - le balayage des enveloppes voit aussi les charges passees par une variable
  - AttachmentReactionHandler valide sa frontière socket par Zod, comme ses trois jumelles
  - un profil se lit à UNE adresse, se resserre par expand, et se relit en 304
  - un profil PUBLIC ne porte plus six champs privés, et les quatre compteurs intimes ne partent qu'à soi
  - le journal du rattrapage n'ecrit plus de numero de telephone
  - une ligne corrompue n'arrete plus le rattrapage des 199 autres
  - le rattrapage des jetons de recherche s'execute enfin
  - chercher une personne passe par un index, plus par un balayage
  - `deletedAt: null` n'atteignait aucune ligne, et ecartait tout le monde
  - la réaction par-pièce-jointe valide son emoji comme sa jumelle
  - une garde de segment doublé, et la seconde route morte qu'elle trouve
  - le verrou de connexion existait tout entier — personne ne l'armait
  - endCall() lève CallAlreadyEndedError aussi sur conflit de version
  - le nombre de maillons de confiance s'exprime par une fonction
  - le type de `trustProxy` cesse de casser l'inference de fastify()
  - retirer un lien de partage retire enfin l'accès à ses invités
  - le lien « ce n'etait pas moi » mene enfin quelque part
  - la recherche d'utilisateurs ne sert plus les adresses e-mail
  - un ADMIN ne peut pas desarmer le second facteur d'un BIGBOSS
  - reinitialiser son mot de passe par SMS aboutit
  - un role de membre ne se change que dans sa propre communaute
  - un limiteur de debit compte enfin les appels qui arrivent par Traefik
  - une promesse détachée sans .catch arrête la passerelle — quatorze sites, et un cliquet
  - endCall() devient idempotent — plus de rediffusion sur un appel déjà terminé
  - supprimer une catégorie de conversations redevient possible (#4129)
  - supprimer une categorie de conversations redevient possible
  - la LEGENDE d'un media de post s'ecrit enfin — la colonne cesse d'etre servie sans producteur
  - l'administrateur de la plateforme agit avec les droits du créateur, aux quatorze points de contrôle
  - l'hôte d'une conversation est joignable, et la casse d'un rang ne décide plus de rien
  - un échec d'enrichissement optionnel ne fait plus échouer POST /posts/:id/view
  - une géolocalisation seule n'est plus rejetée comme message vide
  - une inscription ne balaie plus le salon global, et la diffusion ne fait plus échouer l'écriture
  - l'octroi d'historique par date passe par les hôtes, pas la salle
  - le bypass d'historique administrateur devient un rôle de PLATEFORME
  - plancher d'historique — plus de copie manuelle ni d'agrégat oublié
  - la fiche participant dit QUI peut poser l'octroi d'historique
  - un compte créé par un administrateur rejoint le salon global
  - normalise la casse de Participant.role en minuscules
  - hygiène des tokens push — purge par deviceId et désactivation immédiate des raisons APNs permanentes
  - plus aucun contenu utilisateur dans les logs ZMQ, redactPII répare les Dates, trace perf à DEBUG
  - snapshot de non-lus tolérant aux orphelins + présence dérivée du compteur de sockets
  - le balayage éphémère exclut explicitement les échéances null/absentes
  - l'affinité de langue du reel viewer descend le Prisme jusqu'à la locale appareil
  - POST /posts/from-attachment cesse de publier un média protégé et de publier en silence (iOS-01/iOS-02)
  - retire dead AuthTestService + legacy authenticate() path
  - align call + dashboard participant avatars on resolveParticipantAvatar SSOT
  - les 7 troncateurs d'aperçu de notification servis coupent sans casser une paire de substituts UTF-16
  - l'index 2dsphere de Post.geoPoint est posé à CHAQUE boot — il vivait derrière la porte du premier démarrage et manquait en production
  - le nom d'un contact rejoint le contrat de sa jumelle exportée — coupe UTF-16 sûre et jeu complet de séparateurs de ligne
  - la porte d'émission appelait `emit` DÉTACHÉ de son objet — tout le temps réel social levait
  - le favori d'un post cesse d'être invisible — et les catch de posts cessent d'être muets
  - truncate ne coupe plus au milieu d'une paire de substituts UTF-16 [It. 268]
  - normalizeDisplayName tient enfin son contrat « une seule ligne » [It. 266b]
  - un ?limit malformé cesse de rendre HTTP 500 — 14 routes rejoignent le SSOT de pagination [It. 266]
  - isPrivateIp ne connaissait que l IPv4, une adresse interne IPv6 partait vers un tiers [It. 266]
  - consolidate reaction-limit guard into assertReactionAllowed [It. 264]
  - decodeCursor validait la véracité des champs, jamais leur TYPE
  - repondre par une photo poussait une banniere au corps VIDE
  - achève la SSOT ObjectId — 3 idiomes rebranchés, +OBJECT_ID_PATTERN
  - le masque de protection n'avait qu'UN appelant — trois sites servaient le texte nu [cycle 123 bis]
  - la protection gardait le corps de la banniere, pas le fil [cycle 123]
  - un consentement ne se prouve plus par deux mains, dont une est celle du client
  - la borne de longueur d'un emoji admet les emojis RGI valides (SSOT EMOJI_MAX_LENGTH) (#4300)
  - customDestinationLanguageCode admet un code 639-3 région-taggé (borne .max(6), parité SSOT) (#4307)
  - le prefixe d'API se CONSTRUIT, et six sites cessent de l'ecrire
  - un alias hors-prefixe cesse de disputer son nom de catalogue a la route qu'il double
  - les chemins d'API vivent dans un catalogue DERIVE, plus tape a la main
  - la garde de parite des mots de passe cesse de citer un fichier supprime
  - isValidEmoji accepte enfin teint/ZWJ/drapeaux et refuse '1️' — bascule sur \p{RGI_Emoji} [iteration 240]
  - quatre gardes MIME sur six ignoraient les paramètres, à la frontière accept/reject

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.15.0

## 1.32.1

### Patch Changes

- Changements automatiques détectés :

  - langgraph 1.x exige @langchain/core 1.x — le bump seul cassait la résolution

## 1.32.0

### Minor Changes

- Changements automatiques détectés :

  - les 8 clés « publier depuis la feuille de partage » n'entraient pas au catalogue
  - comments & status descend the ordered Prisme (rank-conscious) [itération 257]
  - REST leave route attributed a moderator kick to the kicked target, not the moderator [Vague 175]
  - merge realtime overlay translations pushed over story:translation-updated (#3455)
  - la bannière RÉSOLVAIT le Prisme sans jamais le SERVIR [cycle 122]
  - la réponse et la mention n'appliquaient AUCUN Prisme [cycle 122]
  - language bar descends the Prisme over ALL slide content (#3432)
  - call links dropped their post-login destination — redirect vs returnUrl [Vague 174]
  - la bannière ne descendait que le rang 1 du Prisme [cycle 121]
  - le Prisme des posts ne descendait que le rang 1 — parité iOS/Android [cycle 120]
  - re-resolve text overlays into the Exploration language (#3427)
  - WebRtcEngine's remote-video replay leaked the ended call's disposed track into the next call [Vague 173]
  - la langue d'origine gagne à son RANG, jamais en court-circuit [cycle 119]
  - importer `encodeToString` — le témoin de cache ne compilait pas [cycle 118]
  - call:join's own ack is the joiner's completion signal, never a broadcast the server sends back [Vague 172] (#3422)
  - la ligne de liste n'appliquait pas le Prisme — le 3e client n'avait jamais reçu la règle [cycle 118]
  - project text objects into the story viewer (#3421)
  - retirer `feed.post.reach`, devenue clé morte — ma décision de la garder était fausse [239i] — run test
  - SSOT des formateurs de planification d'agent
  - applySurvivalVideoSend's OS-suspension guard only blocked resume, not suspend [Vague 171]
  - reader fadeIn/fadeOut envelope on the viewer canvas (#3416)
  - le catalogue app n a plus AUCUNE cle en double — et A3 est applique
  - une garde de hash perimee remplacee par son invariant, une cle etrangere adoptee
  - un agrégat DIFFUSÉ ne peut pas porter la réponse d'un lecteur [cycle 115]
  - MediaAccessibilityStore declarait ObservableObject sans importer Combine
  - les deux rouges du catalogue — trois cles mortes de mon fait, une cle absente qui bloquait main
  - vague 2 + ses correctifs — rendre ATTEIGNABLE ce qui etait ecrit
  - backfiller capturedInApp — sans quoi les conversations anciennes cessent de charger
  - l audience nommee de la file prend son defaut — un parametre sans defaut casse tous ses appelants
  - une note vocale enregistrée DÉCLARE sa provenance
  - publier depuis la feuille de partage — le troisième client rejoint la règle
  - la confirmation de publication d'une capture ne s'est jamais déclenchée
  - clip-transition opacity ramp on the viewer canvas (#3412)
  - un post peut NAITRE avec une audience nommee — les six modes, jusqu au bout de la file
  - une suite arrivee par la fusion n etait enregistree nulle part
  - la date et les coches vivent EN BAS — magnifie ou non
  - les deux rouges du gate — une garde retournee, une cle morte
  - la borne STRICTE endMs > startMs triplée entre enfin dans time-range [itération 256]
  - play back keyframe animation on the story viewer canvas (#3406)
  - toggleVideo's three video-disabling failure paths also reset videoSurvivalController [Vague 169]
  - en conversation chiffree, nommer quelqu'un ne produisait rien
  - vague 1 du lot C — quatre chantiers a fichiers disjoints
  - l'appui long en mode Focal montre le message NORMAL, plus une capture tranchée
  - la magnification de la Lentille n'est plus une carte — c'est la rangée
  - l audience d une publication se change apres coup — et une story y naît publique
  - handleHold's unhold generic catch also resets videoSurvivalController — run test [Vague 168]
  - rebrancher deux pastilles de langue sur la SSOT du Prisme
  - derive story text base writing direction (RTL) from content (#3402)
  - les six audiences, offertes partout et jusqu au bout — y compris apres publication
  - une publication naît publique — l audience se resserre, elle ne se devine pas
  - le glyphe de synchronisation quitte la rangee — arbitrage produit rendu
  - la rangee remonte sur l atome de non-lus, et le point du pont cesse d etre reclame
  - per-element fade in/out timing for text elements (parity iOS) (#3396)
  - handleAudioRouteChange's .newDeviceAvailable reverts isSpeaker on applySpeakerRoute() failure — run test [Vague 167]
  - l accuse de reception dit enfin ce qu il envoie
  - la surface decide de ce qu un collage produit — et un document n est jamais avale
  - publier une piece jointe recue, sans la retelecharger
  - typer la liste des versions de la rangee de drapeaux
  - un nombre, un élément, un nom — les statistiques de portée que VoiceOver ne pouvait pas attribuer [239i] — run test
  - un mot peut accompagner un transfert
  - le corps d un post se lit UNE fois, et une rangee de drapeaux dit sa langue
  - web call-signaling emits stop hiding their contract behind casts [Vague 166]
  - le `Server` NU pris pour emettre n'etait garde par rien
  - la porte de mise a jour, sur les DEUX racines
  - le binaire annonce sa version et entend le 426 du gateway
  - SSOT du prédicat ObjectId — 8 copies du littéral rebranchées sur isValidMongoId [258]
  - le checkpoint /sync n'avance que sur une reponse qui a COUVERT la fenetre
  - la file hors ligne de message:new ne depend plus de la synchro de liste
  - le seul rejeu qui ne pouvait pas se declarer indelivrable annoncait sa remise [cycle 114]
  - une entrée de file dont l'id de conversation est illisible désarmait le gate d'autorisation du lot ENTIER [cycle 113]
  - les identifiants PUBLICS cessent de dire quand ils sont nés — et de collisionner en silence
  - le rejeu hors ligne diffusait une charge informe, et une entrée non datée désordonnait les saines [cycle 111]
  - l import de l enveloppe vivait SOUS le schema qui la lit
  - le chemin d'envoi PRIMAIRE strippait l'enveloppe de chiffrement
  - le rejeu hors ligne ne peut plus perdre un message en silence
  - retirer le SecurityMonitor mort (supplanté par les securityEvent.create en ligne)
  - retirer le `participant-resolver` util mort, homonyme du vivant [itération 254]
  - SSOT du prédicat ObjectId — 4 copies rebranchées, 2 regex divergentes fondues [itération 259]
  - le témoin de post.ts affirmait « aucune valeur d'exécution » sur un module qui en exporte une

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.14.1

## 1.31.0

### Minor Changes

- Changements automatiques détectés :

  - le cliquet appelait une fonction que la fusion avait emportee
  - story text elements get a discrete font size, born at the iOS-parity 96 (#3390)
  - le meuble du composer — plateau, atelier enveloppe, socle permanent
  - le lecteur web enchaine enfin les scenes d une story v3 (W2)
  - sept casts de socket sur le chemin de MESSAGERIE — six etaient inutiles
  - le contrat de socket existait — neuf casts le retiraient au site d'appel
  - story text elements get a stroke outline (borderColor/borderWidth) (#3384)
  - le web peint enfin le lieu et le dessin d'une story iOS
  - le cliquet de dette derivait de 3 avec l'etat du BUILD — il refuse
  - le repost du fil miroitait un type qu il ne portait pas — main etait rouge
  - la loi du miroir manquait la CARTE DU FIL — et le type l'avait dit
  - le repost miroite le format de sa source, et l'ancrage devient un geste
  - remove dead call-mode type guards, one a landmine for a future SFU wiring
  - l'écran À propos renvoie aux pages réelles du site
  - story text elements get a stroke outline (borderColor/borderWidth)
  - le repost vise la RACINE, au format de la CARTE
  - C3 — les portes portent leur format, et le profil son eventail
  - les cinq directives produit — socle posé, DEUX VÉRIFICATEURS RENDENT ROUGE
  - le cliquet de dette criait « RÉGRESSION » sur un arbre intact [cycle 108]
  - la lecture v3 ne doit pas dependre du reglage de l'appelant
  - resserrer le cliquet de dette de types — 1241 → 1239 [cycle 107]
  - réciprocité sur la source des transferts — socle posé, FUITE ENCORE OUVERTE
  - Android jetait le curseur `_seq` pendant que le contrat disait qu'il le lisait [cycle 108]
  - endCallParticipationForDepartedMember cleared the call-wide ring timer even when the group call continued [Vague 165]
  - Android annonce enfin ce qu'il sait lire (X-Canvas-Caps: 3)
  - Android sait lire le canvas v3 -- sans changer son viewer
  - text-element background (none/solid/glass) [story-text-element-background] (#3379)
  - un keyframe sans identifiant emportait le post entier
  - une transition inconnue ne doit pas emporter le post entier
  - un identifiant de conversation cesse de publier ses participants
  - retirer la carte ouverte ne ferme rien — c'est le SPREAD qui fait taire le compilateur [cycle 106]
  - router les comparaisons de langue par la SSOT [itération 251]
  - call:end/leave/force-leave cleared the call-wide ring timer even when the group call continued [Vague 164]
  - render reposted post's shared location in the quote embed (#3371)
  - D7 — la respiration est écrêtée à la marge qui la reçoit
  - la pilule de section centrale n'est plus montée — le sticker épinglé le dit déjà
  - l'amnistie de type-check — six cycles de contrat gardés par rien [cycle 105]
  - un cast est une porte, et `_seq` n'était déclaré nulle part [cycle 105]
  - borner la garde VoiceOver de StatRing à sa struct, pas à 2600 caractères [238i] — run test
  - messageType — la moitié CLIENT que le serveur ne peut pas corriger [cycle 104]
  - fermer la famille « abrégé compact » et interdire la 8ᵉ copie [238i] — run test
  - feed post shows its shared location [feed-post-location-sticker] (#3365)
  - call:check-active replay re-armed the callee's 45s no-answer timer on every reconnect [Vague 163]
  - call:join CALL_ENDED ack during reconnect left iOS in a zombie active-call state [Vague 162]
  - repost embed shows the reposted post's mood emoji [feed-repost-embed-mood-emoji] (#3361)
  - D5 — le sticker dit enfin qu'il est replié
  - empreintes de cache sur octets déterministes (.sortedKeys) + test du skip sur compteur de chiffrements — run test
  - les deux tests DND s'ancrent sur un now fixe — rouges chaque jour dans la minute 23:59 — run test
  - self.namespace explicite dans l'autoclosure du Logger d'upsertEntriesDiffed — run test
  - correctifs revue adversariale (2 blockers, 2 majors, 6 minors) — run test
  - correctifs de la revue adversariale du diff — 2 blockers, 2 majors, 6 minors
  - rejoin-after-reconnect hardcoded reason:'completed', defeating retry [Vague 161]
  - show the reposted post's like count in the repost embed (#3354)
  - ReelAudioBackdrop — la boucle repeatForever s'arrête quand le réel perd l'élection autoplay
  - écriture-diff du cache GRDB — plus de réécriture + re-chiffrement intégral par flush ni par save
  - découvertes d'audit — tri feed memoisé, .equatable() hashtag, boot iPad parallèle, lecture audio streamée, caches bornés, ticks story allégés
  - ScrollOffsetRelay sur les 8 écrans restants — le body complet ne se ré-évalue plus à ~120 Hz au scroll
  - démarrage et données — hydratation traductions hors boot, compteurs de livraison batchés, déchiffrement mémoïsé, budgets L1 audio/vidéo
  - quick wins hot-path — decode emojis memoise, formatters caches, Reduce Motion sur 4 sites, rangée notification Equatable, brouillons commentaires debouncés, chemin miniatures memoisé
  - D4 et D7 — la contre-expertise renverse deux de mes faux positifs
  - stale-callId roster mutation (web) + 3rd suspension flag on camera actuators (iOS) [Vague 160]
  - post-detail repost + quote-repost (#3350)
  - un refus de jonction TRANSITOIRE effaçait la conversation [cycle 99]
  - le compteur de vecteurs Rivière compte les 61 cas qui existent
  - l'effectif quitte la rangée au repos, le chip rouge de non-lus y prend sa place
  - quote-repost composer + root-target fix in the feed [feed-quote-repost] (#3345)
  - call:force-leave listener leak (web) + camera hold guard (iOS) [Vague 159]
  - le témoin de cadence dérive son seuil de la géométrie, au lieu de le poser
  - le canevas se souvient de son cadre, et le recadrage cesse d'etre sans retour
  - la rangée à trois lignes a la hauteur de ses trois lignes
  - un message chiffré par un bout se déchiffre enfin à l'autre [cycle 98]
  - le témoin du badge compact suit la proportion, pas l'ancienne taille
  - la rangée dit « auteur : message », la date vit seule en bas à droite, l'effectif sur la bordure
  - D2 — les boutons flottants ne mordent plus l'en-tete ni ses cibles tactiles
  - la dédup des traductions fusionne les codes région-tagués de même langue [iter 246]
  - toggleVideo() could re-acquire the camera during a CallKit hold [Vague 158]
  - lot 6 D8+D1 — l'unite mois prend son espace, le squelette cesse de faire sauter la liste
  - route guest-join deep link through the entry brain (#3340)
  - l'espace admin envoie une diffusion en notification in-app à tous les comptes ciblés
  - « Activer les bêta » naît OFF, et dit au lancement quelles fonctionnalités bêta sont actives
  - une diffusion admin peut partir en notification in-app à tous les comptes ciblés
  - une story legacy « média seul » vidéo se lit comme un fond vidéo, plus comme une image
  - le parc natif annonce enfin le canvas qu'il sait deja lire
  - leaveCall idempotent group-continue branch leaked departed participant heartbeat
  - share-link entry-fact resolver (app-side) (#3335)
  - l'intention du composer est un modele pur, et sa table se demontre
  - le hook des traductions matche les codes de langue tagués région/casse [itération 244]
  - onnegotiationneeded's auto-renegotiation crashed the process on failure [Vague 156]
  - un seul abrégé compact pour les deux cartes communauté
  - sanitizeFileName tient enfin son plafond de 255 et ne fabrique plus de dotfile
  - la notation compacte se construit sans inférence — .compactName, pas .compact
  - l'abrégé « 1.5k » des cartes communauté gravait le format anglais dans toutes les langues
  - authenticated share-link join (POST conversations/join/{linkId})
  - le changement de rang n'atteignait jamais le trombinoscope Android [cycle 92]
  - la loi Rivière Swift ne nomme plus une colonne au rang d'un avis système — miroir de #3270
  - le lecteur de scenes ne prend la main que sur un v3 natif, l'archive garde son hote
  - un bouton de son par-dessus la video du fil — le son cesse d'exiger le plein ecran
  - l'aperçu Prisme ne rétrograde plus la langue primaire sur une origine région-taguée [iteration 243]
  - moderator kick checked only the CALLER's rank, never the TARGET's [Vague 155]
  - pure share-link entry-decision policy (#3321)
  - l'appui long sur une bulle ouvre le message dans le fil, répond ou copie ; le bord atteint se sent [lot 3]
  - le viewer story lit ses scenes par le lecteur, plus par l'hote nu
  - l'axe des ordonnées est le temps — une poignée graduée saute à la période voulue [R-3]
  - l'analyse et la comparaison vocales etaient mortes en production [cycle 90]
  - l'identité d'une voix devient vivante — avatar avec présence et story, nom qui ouvre la fiche [R-5]
  - le bouton de son du fil pilote vraiment le lecteur (corrige rejet DoD S2)
  - rails et connecteurs se tracent dans le repère du pane, même cadré au présent ; la citation tient sur une ligne [R-8]
  - la Rivière s'ouvre vraiment au présent, la citation mène à sa cible, le composeur garde sa place [R-6, R-7, cadrage]
  - une édition de message REST ne rendait rien — la clé déclarée n'existait pas dans la charge
  - unblock base CI — BubbleContentMatrixTests missing JoinNotice.participantId
  - l'identite d'un montage s'enracine dans ce qu'il peint, jamais dans la place du cadre
  - anonymous shared-link guests can call back / join from a bubble
  - conversation-lock master PIN change + remove flows (#3313)
  - deux bulles d'un même groupe partagent UNE bordure — jointure pointillée, fond continu, plus de contours fermés intercalés [lot G]
  - BubbleContentMatrixTests nomme le participantId que JoinNotice exige depuis 88c2e91f0 — le bundle de tests de main recompile
  - parite des jetons Lentille — sept jetons river manquaient dans le CSS
  - un avis d'arrivee mene a la fiche, et « parti » cesse de se dire « indisponible »
  - bouton de son sur les videos du fil (reel natif + repost)
  - le lecteur de scene accepte le porteur, la commande de muet et les fils du viewer
  - la console de moderation servait des listes vides, par deux defauts independants [cycle 87]
  - close the remaining 7 duplicate-toast sites Vague 151 left open in use-webrtc-p2p [Vague 152]
  - use-webrtc-p2p forwards call-connected via onConnected instead of a hardcoded English toast [Vague 153]
  - conversation-stats sentiment three-way bar (slice conversation-stats-sentiment-bar) (#3304)
  - un seul compteur de non-lus — 5 clés, 3 mécanismes, 3 accords faux (iteration 236i) (#3293)
  - AI participant persona profiles + trait bars (parity iOS) (#3295)
  - floating participant tiles could spawn off-screen in group calls
  - VoiceOver énonçait « %lld messages non lus » sur chaque rangée non lue (iteration 235i) (#3257)
  - three calling-stack audit fixes — network handoff, duplicate VoIP push, stale audio reactivation (run test)
  - AI conversation-analysis summary card (parity iOS) (#3287)
  - la scène de carte parle le prisme, garde son 9:16 réel et sait dire son nom
  - la scène du post naît en pause dans la carte, jamais dans le fil
  - le bouton muet du fond pilote un lecteur, jamais un decor
  - le compteur de likes d'un commentaire ne savait que MONTER [cycle 81]
  - conversation stats dashboard (rings + activity + content-type breakdown) (#3283)
  - D6d restaure le STOP D4 et rend sa propre preuve falsifiable
  - connection/ICE failure toasted twice, only one translated [cycle 151]
  - le bouton muet du fond existe sur trois surfaces, jamais deux conditions
  - D6d referme le lot D - hygiene reglee, dettes rendues visibles, STOP D4 leve par derogation produit
  - le rejet de la bannière d'épingle était un booléen collant [cycle 80]
  - le miroir CSS des jetons Lentille déclare la carte de focus magnifiée (height 104, padding 14, avatar 52, nom 17)
  - le resolveur du fond audio lit enfin la forme empruntee dominante
  - un losange audio pose SON CLIP sur le bus de selection, pas son propre id
  - huit gardes rouges du run iOS complet après le merge — chevron RTL, fuseau du jour de semaine, clé de catalogue, drapeau en premier, littéral en commentaire, clamp Focal retiré
  - les opacités de la carte de focus et de ses chips sont nommées en Core — plus de littéral de loi en dur
  - réaligner le garde-fou du header story sur le résolveur E1
  - l'annonce du fond audio passe par un résolveur unique, trois surfaces
  - un losange audio ouvre la fiche de son clip, un losange rogne rentre dans sa barre, et la selection ne se pose que si une fiche s ouvre
  - on-demand story translation via the language bar's request arm (#3278)
  - la Rivière se parcourt vraiment — elle cesse de pousser l'en-tête hors de l'écran, respire entre ses rangs et nomme la voix qu'on lit
  - la Rivière s'ouvre vraiment — l'écran est monté au fil, l'avis système y est gravé, et la bêta en tient l'interrupteur
  - chips d'étiquettes plus petites et marge autour de la carte de focus de la liste
  - le bannissement retirait la ligne, la levée ne la remettait pas
  - la scène de magnificence se désarme en moins de 5 s
  - effectif → participants, carte de liste ample, chips uniformes sur toutes les bulles en focus, aperçu « Auteur : texte » sur deux lignes
  - la carte du message en focus est le fond de la rangée — chips consolidées sur ses lignes ; reconfiguration différée (plus d'apply réentrant)
  - un battement de 90 s dont le serveur faisait déjà le travail
  - la bulle en focus montre tout avec la carte ; effectif, synchronisation et nom original sur les lignes de la carte de liste
  - on-demand comment translation via the flag strip's request arm (#3273)
  - chips du focus sur la ligne de la carte, présence et respiration de la carte de focus, affiliations en état vide
  - remove-participant confirm dialog leaked the {name} sentinel on $-names
  - la carte de focus porte catégorie, étiquettes, date complète et dernier expéditeur ; bordure basse du message en focus
  - deux présences dans le même tick, deux personnes affichées
  - la liste des présents suit enfin le canal qui porte le fait
  - le message en focus porte sa date, la carte encadre aux mêmes espaces, le chrome revient près de la fin du scroll — et la Rivière a son point d'entrée
  - cinq canaux que le contrat promettait et que personne n'émettait
  - on-demand post-detail translation via the flag strip's request-missing-language arm (#3269)
  - la magnificence n'existe que pendant le défilement — focus au centre, retour à plat au repos, accès rapides en fin de liste
  - Android écoutait deux canaux que personne ne prononce
  - l'aperçu d'appui long d'une conversation montre les derniers messages, plus le menu des modes
  - Focal revient en passe MINIMALE, Bulles devient un choix, Script gagne le (+) de réaction — et la pilule de section nomme le sticker qui tient la ligne
  - un message rendu à ma vue revient, au lieu d'attendre un défilement
  - on-demand post translation via the flag strip's request-missing-language arm (#3265)
  - sortir quelqu'un d'un fil le sort de l'appel qui s'y tient
  - createPeerConnection() closes the previous RTCPeerConnection before overwriting it [Vague 150]
  - fil de messages — egalite sans allocation, statut O(1), preference audio resolue une fois, plus de GeometryReader mort par cellule ; Script : video solo au format reel
  - le suffixe verrouille etait en francais brut, et le bord volait la selection a la piste
  - liste Lentille — carte de focus magnifiee qui suit le defilement, encoche en menu natif, pull-to-refresh repare, rail « moi » aligne sur le tray, couts par passe reduits
  - un avis système n'est la voix de personne
  - un message système ne prend jamais part à un groupe de bulles
  - removingHandle n'ampute plus un @handle collé à un e-mail — frontière gauche du SSOT
  - la piste selectionnee ne se voyait plus, et un fond verrouille se laissait deplacer
  - live feed comment-count sync — comment:added/deleted overlay on the feed card (#3260)
  - l aimant du plan lisait une echelle qui n est plus celle du plan
  - le rognage d un bord ne se dispute plus le doigt avec le scroller du plan
  - reordonner une piste ne la deplace plus dans le temps — un doigt vertical porte toujours quelques points d horizontal
  - conversation lock "unlock-all" — verify master PIN, drop every lock at once (#3258)
  - D4 corrige un verdict budget usurpe - l'appareil mesure est un plafond, pas le plancher A11
  - le montage de story-v3-roundtrip expirait pour de vrai — main rouge sans qu'une ligne ait changé
  - un seul compteur de membres — 3 clés, 2 helpers jumeaux et 4 concaténations fusionnés (iteration 234i) (#3251)
  - le mode Bulles groupe enfin, et c'est le DERNIER message qui porte l'identité
  - la rangee Focal transmet une identite deja resolue, elle ne la compose plus
  - les deux mocks de socket conforment au protocole etendu
  - l'hote pilote les droits d'un visiteur depuis sa fiche
  - l'acces a l'historique se fige au join, et l'hote pilote les droits d'un visiteur
  - debounce the sub-200ms sending clock glyph (parity iOS) (#3256)
  - un visiteur sans compte ouvre sa fiche, non une page de profil vide
  - une scene qui ne porte qu'une empreinte existe quand meme - le thumbHash calcule en aval du persist survivait pas a un canvas sans objet (rouge CI StoryUploadQueueTests depuis le lot B) ; O3 reste tenu pour le canvas reellement vide, miroir Swift/TS
  - la feuille d'un visiteur enonce ses capacites et, pour l'hote, les reglages du lien
  - la fiche s'ouvre depuis toutes les surfaces d'une conversation, et enonce les contraintes d'entree
  - un message système n'est pas une prise de parole — il ne groupe plus la rangée suivante (Focal)
  - le pont SDK gardait un bounds audio inverse quand seule une borne existait (Task F7e, addendum rev. 2 du plan lot F, arbitrage 11, constat 25)
  - la fiche d'un visiteur enonce ses capacites et, pour l'hote, les reglages du lien
  - la garde de forme jumelle du texte racine est restauree (9/9) et l'arbitrage 4 du plan suit le code - le Prisme se ferme a la LECTURE, l'emission ne devine jamais (rattrapage F7d, correctifs DoD par l'orchestrateur)
  - la regle 3 du Prisme restait cassee en lecture - F7d ne fermait le constat 4 qu'en apparence (correction rejet DoD, addendum rev. 2 du plan lot F)
  - la locale devinee de l'objet texte rouvrait le court-circuit que F7d fermait au niveau post (F7d, correction rejet DoD, addendum rev. 2 du plan lot F)
  - le plan 2D rend le mute par clip, les echos de boucle, l accessibilite des pistes et le glissement temporel (D3, revue DoD)
  - la story ecrite en anglais se retaguait francaise, le texte racine et le fond du canvas n'avaient pas de forme jumelle avec iOS/gateway (F7d, addendum rev. 2 du plan lot F)
  - un losange de keyframe se posait au temps RELATIF de son clip sur un axe ABSOLU (D3, revue DoD)
  - le badge du fond restait muet sur carte et detail, la republication gardait son verbe hors de la carte (F7c, addendum rev. 2 du plan lot F)
  - composer draft persists the manual language pick (parity iOS) (#3254)
  - D3 corrige six constats de la deuxieme revue DoD sur son propre correctif
  - F7b rejetee par le DoD - Prisme vide pour le visiteur sans compte, voile v3 peignant au-dessus du texte (addendum rev. 2 du plan lot F)
  - StoryViewer cablait CanvasV3Scene a moitie - mute, playhead, tampon, prisme complet et credit audio l'atteignent enfin (F7b, addendum rev. 2 du plan lot F)
  - le plan 2D retrouve son scrub, son trim de keyframe et ses transitions perdus au premier passage (D3, revue DoD)
  - le fond de scene disparaissait sous une transition de clip (F7a, correction de revue)
  - la scène v3 tenait un rendu appauvri — elle retrouve le plancher du chemin legacy (F7a)
  - composer draft persists armed message effects (parity iOS) (#3252)
  - le CTA de l'inscription perdait son nom au moment de créer le compte
  - la fiche conversation collait un « s » latin sur toutes les langues au chapeau « Membres » (iteration 232i) (#3241)
  - le v3 emis par le composer redevient LISIBLE - le funnel jetait le document entier (F5b, correction de revue)
  - pure message-bubble accessibility-label composer (parity iOS) (#3248)
  - le composer story emet enfin du v3 - le fond, le porteur, l'audio et le texte racine deviennent des objets de scene (F5b)
  - originalLanguage atteint enfin le vrai point de publication de la story (F5, correction revue Codex)
  - le plan 2D remplace le conteneur mono-piste de la timeline, et un bord tire peut de nouveau suivre la slide (D3)
  - originalLanguage part enfin en creant une story - le funnel createPost le resout depuis la locale d'interface active (F5)
  - l'attribution de repost cesse de dire « Reposted from », l'icone dit deja tout (F4)
  - un tap sur une poignee de bord non deplacee n'ouvrait jamais l'Inspecteur, et les graduations du plan 2D restaient mortes (D2)
  - l'annonce du fond + bouton muet arrivent enfin sur le web (F3)
  - le plan 2D se dessine en un seul passe Canvas, jamais une vue par keyframe (D2)
  - la couche fetch annonce enfin X-Canvas-Caps: 3 (F2b)
  - StoryViewer monte enfin CanvasV3Scene, le legacy devient le repli (F2)
  - le plan 2D sait ordonner l ecran et distinguer une duree choisie d un fantome (D1)
  - le web sait enfin dessiner une scene v3 — CanvasV3Scene, rendu pur et statique (F1)
  - AudioForegroundChip cesse de mentir a froid, code mort retire, P0 remonte a 57 (B8f)
  - le chemin lecture reclame le player du media porteur, et la config du player cesse d'etre decorative (rattrapage B8e)
  - un composer multi-slides ne rouvre plus en portrait au-dela de sa premiere slide (rattrapage B8d, correction DoD)
  - le mode Focal ne groupe plus la première bulle d'un arrivant avec son avis système
  - row mood badge wires peer's ephemeral status emoji (parity iOS) (#3246)
  - un brouillon 16:9 ne rouvre plus en portrait apres sa migration v1 vers v3 (rattrapage B8d)
  - un ObjectV3 malformé ne vide plus la scène, v:4 ne rétrograde plus en legacy
  - row story ring wires peer's unviewed-story affordance (parity iOS) (#3244)
  - un message système n'est pas une prise de parole — il ne groupe plus la bulle suivante
  - les catalogues interpolaient en {{nom}}, que nul interpolateur de l'app ne comprend
  - un canvas sans cadre perdait son son, et un objet sans rang tombait a zero (rattrapage B8b)
  - le pont v3 loge tout ce que le runtime porte (B8b)
  - le contrat v3 loge le dessin, les variantes et l'empreinte (B8a)
  - l'invariant endMs>=startMs a une source unique — et le 3e site le gagne enfin
  - le fil v3 entre dans StoryEffects, et tout encodage repart du canvas COURANT (B7)
  - AudioChipDisplay.backgroundAnnouncement, resolveur pur promu (B5)
  - MeeshyScenePlayer, trois modes qui naissent TOUS en pause (B4)
  - les brouillons v1 se réencodent en v3 au chargement sans vider firstSlideEffects
  - pont bidirectionnel StoryEffects vers CanvasV3 (B2) - migre au golden PARTAGE du gateway (remap letterbox U20, Prisme C6, karaoke C7, champs vivants sticker U21, filtre G3), rend une scene v3 dans les familles runtime, ancres band en constantes provisoires 0.08/0.92, 4/4 verts + gate complet 2 cibles, P0 a 12/51
  - modèles Swift CanvasV3 (B1) - unions discriminées sur t, kind réservé ré-encodé tel quel, les 6 fixtures gelées décodent et round-trippent, P0 à 11/51
  - repair a 3-way merge artifact, extend numbering to the 2 entries #3073 added
  - update StoryRepostFlowTests for repost visibility parameter
  - le composeur d'humeur ne collapse plus en split view vide sur iPad (220i)
  - hide decorative SF Symbols in ConversationEncryptionDetailSheet (214i)
  - fermer la fuite de source de transfert par l URL — main etait rouge dessus
  - retirer le `CaptchaService` mort, doublon de la vérif vivante [itération 253]
  - main etait rouge sur une bombe a retardement de 24 heures [cycle 108 bis]
  - un témoin qui a viré au rouge tout seul, à 10:00:00Z [cycle 108]
  - deux cas d'édition étaient des bombes à retardement — main est rouge depuis 10:00 UTC
  - retirer le `TranslationCache` Redis mort, homonyme du vivant [itération 252]
  - la porte d'ÉCOUTE rejoint le contrat — un cast ouvrait un sous-système [cycle 107]
  - rendre son doc-comment à `PREVIEW_PRISM_PARTICIPANT_SELECT`
  - la file rejoint le contrat — ce qu'on ENFILE est tenu à ce qu'on ÉMET [cycle 106]
  - retirer `_findUsersForLanguage`, code mort à comparaison brute [itération 250]
  - la porte d'émission — huit copies d'une déclaration qui ne dit rien [cycle 104]
  - `message:edited` — le transport REST que le contrat ne gouvernait pas [cycle 103]
  - messageType — une règle écrite QUATRE fois, et un client qui ne peut pas la dire [cycle 102]
  - le scoring d'affinité des réels canonicalise ses codes de langue [it. 249]
  - une édition faite en WebSocket n'atteignait aucun client iOS [cycle 101]
  - le transport d'édition PRIMAIRE servait une charge que le décodeur iOS rejette [cycle 101]
  - six handlers Socket.IO de plus contraints par le contrat [cycle 100]
  - la porte des langues d'un lien partagé comparait des codes bruts [iter 248]
  - message:new avait deux producteurs qui ne disaient plus la même chose [cycle 99]
  - l'aperçu de liste matche les clés de traduction taguées région/casse [itération 247]
  - les deux bouts de X3DH dérivent enfin les mêmes clés [cycle 97]
  - X3DH vérifie enfin la signature qui l'authentifie, et la garde que le retrait désarmait [cycle 96]
  - donner un contrat de réponse à GET /sync, et corriger les trois défauts qu'il rend observables [cycle 95]
  - aligner GET /messages/:messageId sur son enveloppe, et les deux défauts qu'elle couvrait
  - remettre le sous-arbre DMA/Signal sous le compilateur, et corriger ce qu'il révèle [cycle 94]
  - la présence était gardée sur ce qui LISTE un participant, sur rien qui en MUTE un [cycle 92]
  - toute la signalisation d'appel servait `{"success":false,"error":{}}` [cycle 92]
  - reparer une enveloppe rend lisibles les defauts de ce qu'elle contenait [cycle 93]
  - la banniere push ne dit plus deux fois la meme phrase
  - la connexion 2FA, l'édition et la suppression d'un message ne rendaient RIEN [cycle 91]
  - le schema partage decrivait la bonne enveloppe et le mauvais expediteur [cycle 92]
  - la forme juste etait trois cents lignes plus bas, et elle tronquait [cycle 91]
  - onze schemas d'erreur ecrits a la main supprimaient `code` [cycle 89]
  - mettre a jour le cliquet du balayage — cinq sites de presence repares [cycle 88]
  - les cinq sites de presence, et un faux positif qui cachait une fuite ACTIVE [cycle 88]
  - la pagination du listing des membres actifs redémarrait à la page 1 sur un curseur périmé [iteration 241]
  - trois listes d'administration servaient des rangees VIDES [cycle 87]
  - le dossier routes/communities/ n'a jamais servi une requete [cycle 86]
  - porter le correctif de la recherche de communautes sur la route SERVIE [cycle 86]
  - porter le correctif du cycle 84 bis sur la route SERVIE — il vivait dans un module ombre
  - le balayage rend 38 schemas de reponse qui vident ce qu'ils declarent [cycle 86]
  - la liste des membres servait la presence brute — le gate etait dans le fichier masque [cycle 86]
  - la presence des membres d'une communaute sortait brute [cycle 85]
  - reordonner ses communautes ne persistait rien [cycle 85]
  - un schema de reponse sans properties EFFACE, et la panne tenait la porte [cycle 84]
  - PATCH conversation servait la presence brute de ses participants [cycle 84]
  - le fil de stories servait la presence brute de ses auteurs [cycle 83]
  - la liste d'amis servait la presence brute, meme quand l'ami l'avait coupee [cycle 82]
  - les limit des query-schemas admin non bornés interdisent enfin le take négatif [iteration 239]
  - le carnet d'adresses applique le blocage a la LECTURE, et filtre sa presence [cycle 81]
  - un emit socket en panne emportait le push et l'e-mail avec lui
  - la route des droits passe par le manager, comme ses voisines
  - la resolution des droits d'un participant cesse d'etre prisonniere de auth.ts
  - admettre limit=0 sur MyMentionsQuerySchema (préserve le repli || 50 du endpoint)
  - MyMentionsQuerySchema.limit gagne la garde numérique + clamp 1..100 (take Prisma négatif interdit)
  - le convertisseur v1→v3 ne sert plus un timing d'objet inversé
  - une écoute continue rapportée avec endMs ≤ startMs ne peut plus fuir en silence
  - les quatre acks d'appel que le contrat exigeait et que personne n'envoie [cycle 108]
  - V0 — le contrat du composer, la loi produit et rien d'autre
  - la règle de source de transfert accueille un troisième acteur, sans le collecter
  - `SocketIOMessage` cesse de sous-déclarer la charge utile qu'il gouverne [cycle 101]
  - rendre les couloirs vivants de la Rivière par colonne, pas par naissance [iter 245]
  - callSessionMinimalSchema.mode déclarait le type d'appel, pas l'architecture WebRTC
  - removingHandle ne crashe plus sur un username à tiret (SSOT escapeRegex) [iteration 242]
  - une réaction sans emoji ne fabrique plus un double espace dans le titre de notification [iteration 240]
  - normalizeLanguageForDedup strip la région des codes irréductibles
  - formatFileSize ne rend plus « 512 undefined » sous l'octet
  - resolveRiverLaneAt ne nomme plus une colonne au rang d'un avis système
  - SignalSchemas.encryptedMessage.iv exige 16 car. base64 (12 octets), pas 24
  - un expiresAt absent ne fuit plus « NaNm » à l'écran — formatTimeRemaining garde la finitude
  - chunk() honore enfin « size < 1 ⇒ tranche unique » (le fini < 1 fragmentait en singletons)
  - les deux dernières primitives de rôle folded enfin la casse comme toute leur famille

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.14.0

## 1.30.0

### Minor Changes

- Changements automatiques détectés :

  - message-summary-kind on row preview (#3238)
  - CanvasV3 refuse un intervalle temporel qui finit avant de commencer
  - composer attachment-ladder tray groups 6 tiles (parity iOS carouselTiles)
  - la clé « • %d membres » du picker de transfert gravait sa règle de pluriel
  - les suites ForwardPickerSpokenName et SystemNoticeEngravedTime entrent au bundle de tests
  - (beta) tout message systeme se grave — heure en tete centree, replis Bulles/Script sans combine telephone
  - (beta) l'avis d'arrivee survit au fil rouvert, se grave heure en tete, et l'anonyme retrouve nom + @pseudo
  - l'origine servie par l'extension de partage livre enfin ses copies
  - retenter une fois l'upload direct tus après un refus d'authentification
  - le téléversement TUS retente une fois après un refus d'authentification
  - retenter une fois l'upload tus après un refus d'authentification
  - retenter une fois l'upload de pièce jointe après un refus d'authentification
  - narrow conversation infinite-cache page type to drop dead delta envelope fields (iteration 235)
  - conversation-row activity-heat gradient (parity iOS) (#3234)
  - l'avis d'arrivee survit au cache, perd son combine et gagne pseudo, nom donne et regles du lien
  - POST /refresh ne rattrape plus une signature invalide par une session
  - retire le rattrapage inter-formes du chemin de téléversement TUS
  - retire le rattrapage inter-formes et la règle d'application du round 5
  - conversation-row tag chips with "+N" overflow (#3232)
  - (beta) la liste affiche 199+ quand l'effectif est plafonne par le serveur
  - la liste affiche 199+ quand l'effectif est plafonne par le serveur
  - un petit partage est deja parti quand la feuille se referme
  - l'extension sait televerser un petit fichier elle-meme
  - lecteur de stories — ouverture instantanee, interlude 500ms inter-groupes, tap = barre de reactions
  - un partage en cours de composition n'est plus balayé comme orphelin
  - le bouton Aa saute de nouveau des bulles directement à Script
  - un partage jamais repris finit par rendre son disque
  - la bulle devient le mode de lecture par defaut
  - les droits du lien atteignent le composer en booléens
  - la borne d'attente du fan-out se mesure depuis l'entrée réelle en file
  - le composer porte lui-même le droit de joindre un fichier
  - ToolbarButtons sait ce qui est permis
  - fan-out de partage — ordre de départ explicite et garde 501 sur le chemin socket
  - une ligne qui attend son origine de partage n'épuise plus son budget de tentatives
  - keep conversation infinite cache pages ↔ pageParams parallel (iteration 233) (#3231)
  - conversation-list rows show who is typing (#3230)
  - forwarded badge names its source conversation (#3228)
  - le filet de citation Focal porte la couleur de l'auteur, et la méta nomme la langue vraiment servie
  - les liens de partage crees pointent sur /chat — /join n'est plus qu'une 308 legacy
  - le filtre de commentaires de l'extension de partage reconnaît enfin un littéral
  - les destinataires suivants recoivent une copie, jamais un transfert
  - la garde de commentaire commentaire du bouton Annuler filtre les commentaires
  - la garde d'idempotence du partage se verrouille par construction
  - la conversation partagee /chat devient un fil — recent en bas, Lentille, composer fige
  - composer language pill + picker override with a 10-word detection lock (#3226)
  - une fiche de reprise sans cible adressable est écartée, jamais indexée
  - le bouton Annuler ne redevient plus actif après un envoi tenté
  - une reprise sert chaque destinataire, et le dernier seul rend les octets
  - l'extension de partage n'abandonne plus de médias orphelins et rend le texte à l'aperçu
  - l'identifiant d'un destinataire se génère et se garde, il ne se déduit plus d'un index
  - l'enfilage media devient atteignable par contrat, sans antidater ni voler les octets
  - un envoi peut COPIER les pieces jointes d'un autre message, sans le transferer
  - l'écran de partage passe en sélection multiple et extrait les fichiers reçus
  - le corps d'envoi ShareSender diffuse par cible sans jamais marquer un transfert
  - live sentiment emoji in the chat composer (#3224)
  - l'issue d'un envoi devient primitive pour traverser la frontiere d'extension
  - l'app relit une fiche qui sait dire QUELLE cible reste a servir
  - la fiche de reprise porte enfin l'etat de CHAQUE destinataire
  - un fichier partage se copie par flux, sous controle d'espace et de portee
  - l'extension de partage s'annonce enfin pour les images, videos et fichiers
  - le picker de transfert prononçait « cette conversation » à la place du nom de la cible
  - le sélecteur de transfert filtre sur le drapeau serveur, pas sur cinq participants
  - le sélecteur de transfert lit le drapeau serveur, plus un tableau tronqué
  - la famille de styles de texte passe de 11 a 18
  - les participants de la recherche ne sortent que pour un membre, qui se déclare
  - un nom d'appelant avec un `$` fuitait la sentinelle {name} dans les alertes d'appel
  - gate opening a locked conversation behind its PIN code (#3221)
  - fusionner les correspondances locales pendant la recherche du selecteur de transfert
  - borner la pagination des amis face a un hasMore qui ne retombe jamais
  - verrou de conversation par code PIN, extrait en réducteur pur (#3219)
  - le sélecteur de transfert atteint tous les amis, pas la première page
  - la garde anti-boucle du sélecteur conserve la page qu'elle protège
  - le sélecteur de transfert n'offre plus un salon public dont on n'est pas membre
  - le nouvel écran de conversation lit la même liste d'amis que les contacts
  - effacer la recherche du sélecteur de transfert rend enfin la liste
  - un contact neuf hors ligne échoue proprement, le toast succès ouvre sa conversation créée
  - transférer à un contact même sans conversation, sans en créer une à la sélection
  - la recherche du sélecteur de transfert filtre enfin ses amis et rejette ses réponses périmées
  - un @handle du texte cite d'un repost etait un lien mort
  - une story qui nomme quelqu'un en NOTE le montre enfin
  - le sélecteur de transfert pagine et cherche au-delà de sa première page
  - la garde anti-réponse-périmée du transfert invalide aussi la requête redescendue sous 2 caractères
  - l'attribution d'un repost se reduit a l'icone et a l'auteur d'origine
  - les outils de pose du composer deviennent des icones, en gros
  - le sélecteur de transfert atteint toutes les conversations et les contacts
  - diffuser un média a plusieurs sans le faire passer pour un transfert
  - une cible de transfert, qu'elle vienne d'une conversation ou d'un contact
  - lire le second niveau d'enveloppe HTTP du carnet d'adresses
  - l'ecran d'appel s'arretait aux bords de la safe area, laissant voir le fond du cover
  - lire le carnet d'adresses synchronisé, avec sa recherche serveur
  - accepter ou retirer un contact met a jour connected sans attendre le reseau
  - les relations acceptées dans les deux sens entrent dans les contacts
  - une relation acceptée dont je suis le receveur entre enfin dans mes contacts
  - un fil affichait en direct ce que sa propre lecture lui refuse
  - un son emprunte publie depuis le composer jetait les references qu on venait d y nommer
  - activer les sous-titres ne faisait de vous qu'un emetteur
  - editer une story aurait revoque toutes ses references silencieuses
  - l'edition d'une story declare enfin ses references, ou se tait
  - referencer quelqu'un devient possible depuis le composer que les auteurs ouvrent
  - la regle des modes quitte le composer de repost pour le type qui la porte
  - retirer les references du composer de repost, ou elles etaient injoignables
  - l'edition d'un post peut enfin declarer ses references, en tri-etat
  - UpdatePostRequest n'avait aucun ecrivain pour le tri-etat des references
  - une story expiree affichee grace au droit de reference n'enregistrait jamais sa vue
  - un second transfert voulu part vraiment, la confirmation succès se voit, la règle transférable se nomme une fois
  - l'aperçu de transfert atteint enfin le client, le socket accepte un média sans texte, une source disparue ne crée plus de bulle vide
  - le transfert nomme ses destinataires, survit au temps réel et ne double plus au retry
  - une story expirée s'ouvre quand le serveur l'autorise
  - un badge retouche survivait a son propre retrait
  - une reference illisible emportait tout le lot de stories
  - upsertReference lowercase l'ajout — divergence avec le jumeau Swift
  - resolve APIPost mentions parameter and PostReferenceDisplay UI extension
  - la publication déclare les modes au lieu de deviner les pseudos
  - fix MeeshyFont.relative calls and modernize iOS SDK components
  - modernize date formatting, concurrency, and design tokens
  - un post reference restait muet — la mention ne quittait jamais le composer
  - transfert multi-cibles depuis le menu message, badge nommant le groupe source
  - le composer de post gagne les deux entrées de référence
  - le composer story pose les quatre modes, badge compris
  - la feuille de mention pilote l'ensemble, et ne se ferme plus au tap
  - une reference dans un post etait un tap muet sur iPad
  - le badge transféré nomme le groupe source, jamais un tête-à-tête
  - un handle inexistant devenait un lien mort, et un tiret le tronquait
  - un seul chemin de transfert multi-cibles, raisons d'échec et aperçu média
  - la vue unique n'offre plus un transfert que le serveur refuse
  - les composers referencent des personnes hors du texte
  - un selecteur de reference a modes, partage par les composers
  - Plus… rouvre la grille complète, les accès directs gardent leur saut
  - une story expirée s'ouvre quand le serveur l'autorise, le clic d'une référence route par postType
  - la rangée « Avec … » montre ceux que le texte ne nomme pas
  - un badge de référence survivait jamais au trajet JSON
  - un @handle inexistant devenait un lien vers un profil qui n'existe pas
  - un menu de mode et une rangée d'état, partagés par tous les composers
  - le client sait lire comment une référence se montre (beta)
  - la notification dit dans QUOI la personne a été référencée
  - les trois formes de partage manquaient à l'appel sur une story non publique (beta)
  - republier une story ouvre enfin le composeur, avec son audience plafonnée (beta)
  - une story se republie à audience égale ou plus restreinte, jamais plus large (beta)
  - references de posts — charge utile d'exposition et audience de repost
  - « Activer les bêta » allume enfin la liste Lentille, pas seulement les modes de lecture (beta)
  - quatre modes d'exposition pour une référence de post
  - l'app mourait au lancement — le type d'un body dépassait la pile du device (beta)
  - la relation Prisma s'appelle postMentions, pas mentions
  - la route hashtag n'avait aucun layout — useToast levait, les reels restaient vides
  - un invité de lien ne pouvait joindre aucun média — le client lui refusait ce que le serveur lui accorde
  - `POST /posts` accepte enfin des mentions — nommer quelqu'un n'oblige plus à l'écrire dans la légende
  - un visiteur entré par lien ne pouvait rien charger — le client ne parlait qu'un seul protocole d'identité
  - un lien de story expirée ouvrait une page blanche — l'écran de détail n'avait aucun état « contenu indisparu »
  - le titre cédé lâchait la vue, pas le geste — les premiers anneaux de la trail étaient inertes
  - mentionner quelqu'un dans une story ou un post — la liste qui n'apparaissait pas, et l'étiquette qui ne s'écrit pas
  - trois liens morts — le /l/ qui rejoint une conversation, la trail bornée aux boutons, l'appel rogné par son propre clip
  - le drapeau-toggle pilote la piste audio, coche unique cote heure, lectures auteur comptees (beta)
  - l'inscription échouait à la dernière étape — trois longueurs pour un seul mot de passe
  - sortir d'un fil VIVANT n'éteignait pas ce qu'on y tenait de vivant — la position en direct [cycle 74] (#3216)
  - un seul anonyme par conversation — l'index unique le plafonnait
  - drapeau de langue sur la ligne des réactions, header déplié épuré, fix bouton dernier message (beta)
  - le drapeau de langue devient un toggle original ⇄ langue du profil (beta)
  - drapeau de langue d'origine à la place du chip translate (beta)
  - la garde behaviour-matrix ne balaie plus les worktrees imbriques sous .claude
  - rouleau sans ressort, gestes reply/forward uniformes, citations riches (profil + miniature + lecture)
  - translate PEER_CONNECTION_FAILED/ICE_CONNECTION_FAILED instead of leaking the raw code [Vague 149] (#3214)
  - fermer une conversation n'éteignait pas ce qu'elle portait de vivant — la position en direct [cycle 73]
  - handleAnswer closes the orphaned peer connection when setRemoteDescription fails [Vague 148]
  - migration de nettoyage des usernames à espace, dry-run par défaut
  - mail de rappel d'identifiant, sans un mot sur une quelconque modification
  - l'espace n'est plus saisissable dans le pseudo, le charset devient ASCII comme le serveur
  - l'espace n'est plus saisissable dans le pseudo, et le champ dit enfin pourquoi il refuse
  - « no one can write » n'était appliqué qu'à UN verbe — réagir et éditer écrivaient dans un fil CLOS [cycle 71]
  - les temoins de notification sociale pinnaient le corps d'avant #3203
  - kicking an anonymous group-call guest failed unconditionally [Vague 145] (#3203)
  - a single peer exhausting ICE restart attempts no longer escalates to a call-wide error [Vague 147]
  - reconfigure CIBLÉ du snapshot — la scène ne re-héberge plus toutes ses cellules à chaque mutation du store
  - une seule phrase, l'auteur dedans, et le corps montre la cible
  - canCallBack gains the !isAnonymous guard canJoin already had [Vague 146] (#3206)
  - la suppression se committait en deux écritures sur les deux routes REST [cycle 68-bis] (#3204)
  - essai visuel bande centrée + lot 3 — cartes lieu/fichier réelles, préview iOS 26 plate, date du premier message
  - défilement réancré sur la spec §5 « Focal Grandeur Nature » — courbe 380/0.40/0.82, fondu rétabli, loupe retirée, crash long fling corrigé
  - la bannière push dit l'action et montre l'avatar de l'auteur
  - [A-158] D-18 soldée — l'heure de la rangée Lentille passe AA, le tint indigo assombri au cran minimal, témoin de ratio posé
  - [A-157] R5-6 soldée — le magasin de mode de lecture a une identité, la route G-121 est branchée
  - la clôture committait avant ce qui la rend cohérente [cycle 69] (#3205)
  - le double Prisma des réactions de PJ modélisait encore la clé à 2 champs [cycle 68]
  - [A-152] Q142-c tranchée — l'encoche et le LensSwitcher disent le défaut Bulles provisoire
  - [A-155] D-12 soldée — l'heure relative de la liste vit, un seul tick partagé de 60 s
  - les temoins des deux vagues multi-reactions rattrapent le contrat livre (#3201)
  - [A-151] Q142-a tranchée — le gris des métadonnées de la focus card passe AA en thème clair
  - [P0-150] retrait de la cascade bêta I-075 — reading_modes OFF par défaut, opt-in explicite préservé (décision produit 2026-08-18)
  - main était ROUGE — 7 témoins gelaient le swap supprimé [cycle 68]
  - supprimer le hook de réactions mort — la cause racine du cycle 68
  - multi-reactions sur TOUT contenu a reaction — pieces jointes, posts, commentaires
  - les multi-réactions étaient livrées sur le hook que rien ne rend [cycle 68]
  - un message entrant vaut trois trames — une seule relecture [cycle 61] (#3180)
  - multi-reactions — un participant empile plusieurs emojis par message
  - scope ICE-restart backoff/rate-limit per peer [Vague 144] (#3197)
  - le quatrième écrivain de clôture n'enregistrait pas la clôture [cycle 67] (#3199)
  - un segment de transcription live ne peut finir avant de commencer
  - le refus au plafond de réactions remonte enfin à l'utilisateur
  - plafonner à cinq réactions par personne sur post et commentaire
  - plafonner à cinq réactions par personne sur message et pièce jointe
  - le pipeline de traduction des objets texte parle v3 (A7b, revue C6) - persistance scenes[].objects[] ciblee par id, trigger et index de recherche enumerent les textes v3, chemin v1 inchange pour l'archive
  - claim des stickers poses O8 - un objet sticker/media du canvas v3 referencant un media par id doit appartenir a body.mediaIds sinon 400 MEDIA_NOT_CLAIMED, la propriete reste jugee par claimableMediaWhere, sous CANVAS_V3_WRITE_STRICT donc merge inerte
  - plancher X-App-Version sur les creations a scene - en-tete present sous plancher arme = 426, ABSENCE passe (web exempt R6), plancher vide desarme, GET /app/min-version pour le bootstrap de la porte cliente
  - ecriture stricte storyEffects sous CANVAS_V3_WRITE_STRICT - 426 UPGRADE_REQUIRED pour le blob du passe (storeUrl par X-App-Platform), 400 CANVAS_INVALID pour le v3 casse, defaut OFF donc merge inerte
  - negociation de forme a la lecture O17 - sentinelle v1 localisee pour les blobs v3-natifs servis sans caps, lecteur X-Canvas-Caps threade des routes aux services, broadcast tel quel (F3), garde de source sur withMentions
  - lecture v3 branchee sur withMentions sous CANVAS_V3_READ - racine et repost imbrique, early-return couvert, defaut OFF donc merge inerte
  - la famille mediaObjects v1 est enfin convertie - le porteur media atterrit en plane content avec volume et muted, hors remap U20, cible vivante du filtre racine
  - convertisseur v1 vers v3 a la lecture - tolerant, golden gele, clot le gel et ouvre le lot B
  - l'avis d'arrivee porte pseudo, nom donne et regles du lien — et atteint enfin le visiteur anonyme
  - le repli de session de confiance ignorait l'application d'origine
  - l'effectif se plafonne a 199+ et le listing des membres au top-99 des plus actifs
  - TUS ne masque plus une panne de magasin en laissez-passer
  - le plafond de upload-text comptait des caractères, pas des octets
  - POST /attachments/upload-text gagne une garde anonyme et un plafond
  - TUS retrouve son repli de session et gagne un garde-fou de propriétaire
  - un jeton dont la signature échoue est refusé, jamais décodé sans vérification
  - TUS ignorait le droit du lien, la signature ne verrouillait qu'un préfixe
  - l'exemption audio anonyme se mérite par les octets, pas par la déclaration
  - la voix anonyme suit le droit d'écrire, pas le droit d'envoyer des fichiers
  - audio ZMQ dedup consumed the at-least-once slot before validating messageId
  - un fichier partagé par plusieurs copies ne meurt qu'avec la dernière ligne
  - la troisieme porte de l'exemption de contenu vide s'ouvre enfin sur le socket
  - un nom d'ami avec un `$` fuitait la sentinelle du gabarit dans l'email
  - la copie diffusee compare des identites, pas des lignes Participant
  - la recherche de conversations nomme enfin ses interlocuteurs
  - reposter une story fabriquait une story — elle partait dans le tray, jamais dans le fil demande
  - les demandes d'amis disent enfin s'il reste des pages, et savent filtrer par statut
  - un post publié jurait n'avoir référencé personne — sa charge utile était lue avant l'écriture
  - une référence retirée laissait sa notification vivante sur l'appareil du référencé
  - un droit de référence consommé ouvrait encore le fil et la room, et « moi seul » ne refermait rien
  - une référence déclarée par userId n'était validée nulle part — un seul id fantôme fermait le post à tous ses lecteurs
  - un transfert de média sans texte est non-vide, une référence illisible ne casse plus l'envoi
  - quatre sorties servaient encore la relation Prisma sous son nom
  - la notification d'une référence menait à un 404 — le détail ne connaissait que l'audience
  - changer le mode d'une référence ne changeait rien — l'écriture ne savait que créer
  - le droit de voir un contenu expiré se déclare, il ne se déduit pas
  - un statut référencé survit au balayeur tant qu'un droit vit
  - le rejeu d'un like ne parlait plus la même forme que son écriture
  - le droit de voir un contenu expiré se dépense à la vue, pas à la lecture
  - être nommé dans un contenu l'ouvre, même expiré
  - une référence silencieuse se montre à deux personnes, pas à trois
  - le surlignage d'un post se devinait au lieu de se lire
  - une référence retirée laissait sa notification pointer vers un accès révoqué
  - l'auteur choisit comment une référence se montre
  - un @handle tapé sur le canevas d'une story ne nommait personne
  - un refus de schéma disait « erreur inattendue » au lieu du champ fautif
  - le body Ajv de changement d'username porte enfin le pattern, normalizeUsername compile depuis la source
  - « no one can write » ignorait le canal qui écrit ET qui réveille — l'APPEL [cycle 72]
  - une conversation close n'admet plus personne — les quatre portes posent enfin la question [cycle 70]
  - la règle des cinq réactions se déclare une seule fois
  - fixtures canvas-v3 - le gel inter-lots, six documents + l'entree v1 du convertisseur
  - CanvasV3 dans types/ - inclus au build, exporte, mappe ; kinds reserves refuses
  - un segment de transcription ne peut finir avant de commencer
  - indexer les chemins de fichier — le comptage de références balayait la collection à chaque suppression
  - la règle des références, jumelle exacte de son homologue Swift
  - usernamePatternSource devient la source unique, Ajv et Zod rendent enfin le même verdict

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.13.0

## 1.29.0

### Minor Changes

- Changements automatiques détectés :

  - la présence n'était adressée qu'au fil, où la pastille ne se regarde pas [cycle 66]
  - l'invité de lien partagé rejoignait sa seule room sans réessai [cycle 65]
  - l'accusé de lecture ne part plus deux fois — l'alias sans client est retiré [cycle 64] (#3195)
  - lire le compteur par `userState`, le proxy legacy n'existe plus
  - per-peer adaptive bitrate/tier degradation [Vague 143] (#3192)
  - le pont ✦ avait deux formes pour trois phrases — « je n'ai pas calculé » effaçait [cycle 63]
  - la garde de matrice vitest borne enfin sa lecture — B5 porté au jumeau (trouvaille Q-145)
  - group-hangup fast path leaked the participant FK into PARTICIPANT_LEFT [Vague 142] (#3187)
  - `try?` aplatit l'optionnel — la liaison conditionnelle en trop ne compilait pas
  - l'encoche lit la décision du serveur — suggestedMode branché [R6-5]
  - drop stale/replayed renegotiation offers and answers (security audit) (#3182)
  - le pont ✦ gagne un troisième état — le silence ne détruit plus [cycle 63]
  - le lecteur d'écran entend le pont ✦ que l'œil voit [Q-140/L16-iOS]
  - scroll-to-bottom control surfaces an offline pill (#3189)
  - le profil s'ouvre en modale depuis l'auteur d'un message [profile-modal]
  - borner la passe de ponts de la reconnexion à une page de liste [cycle 62]
  - wire the email notification toggle (#3185)
  - la reconnexion effaçait le pont ✦ de TOUTES les lignes [cycle 62]
  - le rail des vivants s'alimente enfin — typing et salve ✦ [lentille-fidelity]
  - ligne 2 — le non-lu se lit, la sourdine grise le pont [lentille-fidelity]
  - ligne 1 du rang — grammaire « Nom · heure », favori et pastilles de tags [lentille-fidelity]
  - l'avatar du rang Lentille ouvre le profil, jamais la conversation [lentille-fidelity]
  - « Bulles » par défaut, décision produit provisoire du 2026-08-17 [default-bubbles]
  - le fil Focal/Script affiche toutes les données du message [focal-parity]
  - le pont ✦ traverse enfin du payload au rang [REV-5/B1]
  - P2 — le chip de mode unique : tap = cycle, appui long = menu ; le bouton Aa et la feuille Lentille tirent leur reverence
  - aucun type de message ne rend une rangée vide [focal-empty]
  - la pastille de reconnexion existait, et le serveur la refusait aux invités (#3183)
  - un lien à l'historique privé garde sa porte de jonction [anon-join]
  - le handshake socket nomme la session anonyme [anon-join]
  - l'identité anonyme n'occupe plus l'emplacement du jeton JWT [anon-join]
  - ConversationView — débordement de pile Swift au 1er rendu (démarrage app cassé)
  - wire moderator "remove from call" to the REST kick endpoint (W6) (#3177)
  - la loupe obeit a une regle STRICTE — zone exacte, plafond absolu, messages seuls
  - live presence dot on a direct conversation's header (#3181)
  - first answer in a group call silenced the rest's missed-call notification (#3173)
  - le pont ✦ survit à une lecture PARTIELLE — dernier émetteur instruit (#3191)
  - le pont ✦ survit à une lecture PARTIELLE [cycle 63]
  - le pont du fan-out socket cesse de payer 5 requêtes par destinataire [REV-5/B2]

## 1.28.0

### Minor Changes

- Changements automatiques détectés :

  - ScrollTimePill consomme la loi d'activité de défilement [V4ter/B3]
  - la garde R15 voit la peau de lecture du tronc [V4ter/B3-RED]
  - isDisabled manquant dans Entry(...) — régression introduite par R-135
  - identité hors bulle, contour sérialisé sans découpe [R-136/§7ter-A5-A6]
  - dégrise Rivière dans les menus quand éligible [R-135]
  - swipe-to-delete and swipe-to-mark-read (#3178)
  - ConversationFirstRenderWarmup — démontage synchrone, plus de course avec le premier rendu réel
  - la Magnificence — loupe continue, fond accentue sans bord, Lire plus scrollable
  - les clés Rivière entrent au catalogue — plus de français par défaut échappé [R-133 erratum]
  - GatewayBridgeProvider — NSLock async-context lock/unlock interdits par Swift 6
  - le memo de LentilleRow refuse enfin quelque chose [V4bis/R4-6]
  - la passe de perspective et l'élection démarrent en prod [V4bis/B1]
  - MeeshyAudioSignature stops swallowing real FileManager failures (#3175)
  - peau Rivière — rendu SVG overlay, grille rang-majeur, mêmes lois, mêmes tokens [R-134]
  - les 6 actions du ⋮ atteignables sous drapeau Lentille [V4bis/B3]
  - pagination et branches vides rendues au chemin Lentille [V4bis/B2]
  - la liste rejouait toutes ses pages sur trois déclencheurs socket [cycle 60]
  - tokens `river` + peau iOS Canvas/Path — la Rivière devient visible [R-131+R-133]
  - audio a plat fidele maquette — deux tenues decidees par l'election
  - main ne compilait plus — ISO8601DateFormatter statiques non Sendable
  - la garde de matrice devient déterministe à froid [V4bis/B5]
  - débouché de lecture non écrivant adossé à l'observer, sans generator ni livraison [G-126]
  - check-law-literals ne confond plus docstring et code — S-003 durci [V4bis/B4]
  - RiverLaneResolver — miroir Swift de la loi Rivière, 53 vecteurs rejoués [R-132]
  - rejoinActiveCall() gates on microphone permission like answerCall() (#3159)
  - résumé de l'observer borné à une plage de messages, format une ligne [G-125]
  - invite by SMS from the Discover tab (#3172)
  - la ligne de liste reculait quand un message arrivait dans le désordre [cycle 60]
  - le témoin d'index 0 de la carte ignorait le halo posé dessous
  - replying to a reply now prefills @username in the composer (#3169)
  - la liste de conversations rejouait toutes ses pages à chaque retour de réseau [cycle 59]
  - paginate the notification list (#3162)
  - le lien partagé ouvre la conversation dans la vue courante (#3157) [skip ci]
  - le masquage personnel d'un message n'atteignait jamais les autres appareils [cycle 54] (#3113)
  - show a live presence dot on direct conversation rows (#3161)
  - la socket des notifications pouvait mourir définitivement, en silence [cycle 58]
  - track mood status impressions and views (#3158)
  - ESLint plantait avant de lire une ligne — trois causes empilées
  - le rattrapage des réactions dépensait le budget dont il dépend [cycle 57] (#3154)
  - MediaSaveCoordinator no longer swallows a real removeItem failure (#3155)
  - record post views and show author-only reach stats (#3153)
  - userId-change teardown left reconnect-signal refs stale, unlike cleanup() (#3152)
  - le lien partagé ouvre la conversation dans la vue courante, la jonction passe en modale
  - let viewers delete their own comments and replies (#3151)
  - editing the last message left the Prism card translating the pre-edit text (#3101)
  - main ne compilait plus — NSLock.lock/unlock sont noasync dans bridgeFor async
  - le defilement suit enfin la courbe — compensation d'offset des corrections de layout sous la fenetre
  - invite friends by email from Discover (#3149)
  - le serveur promet cinq fois que « les pairs se réalignent au prochain sync » — il n'y en avait pas [cycle 56] (#3143)
  - 14 échecs du flux Focal triés (0 régression code, 14 témoins recalibrés)
  - la décoration de focus redevient éprouvable derrière son interrupteur
  - GatewayBridgeProvider — injection au point de composition [G-124]
  - décode et relaie le pont ✦ et la préférence de lecture serveur [G-124]
  - call:media-toggled's remote mute/camera indicator never updated for a registered peer (#3123)
  - answerCallReady() gates on microphone permission like answerCall() (#3128)
  - câblage focus card — trois points d'entrée, une préférence [WL-108]
  - focus card + encoche « AUTO · <décision> » [WL-108]
  - élection de la focus card côté liste [WL-108]
  - focal — citation, médias, capsule date, rangée pont [WF-112]
  - perspective .thread, élection, pilule jour·heure [WF-111]
  - FocalRow — rangée plate du fil, densité Script [WF-110]
  - ReadingModeMenu + LentillePeek — 3 chemins, une préférence [LWS-11/WL-106]
  - useLentillePerspective + useScrollActivity [LWS-10/WL-104]
  - stickers, pilule, rail, squelette Lentille [LWS-10/WL-103]
  - LentilleRow + LentilleBridgeLine — rang plat, pont ✦ [LWS-10/WL-102]
  - mux Lentille sous drapeau — dynamic, boundary, typing [LWS-10/WL-101]
  - resolveLentilleFlag — résolveur pur du drapeau, unique décideur [LWS-10/WL-100]
  - étage agent du pont ✦ — intersection exacte, repli déterministe C2, paire E7 [G-127]
  - le mode lent d'une conversation est enfin APPLIQUÉ (#3154)
  - une partie d'un tête-à-tête pouvait faire TAIRE l'autre [cycle 56]
  - retire `USER_STATUS` de CLIENT_EVENTS — déclaration parasite [cycle 60]
  - la Rivière borne son axe, nomme la ligne qu'on lit, et porte le message en entier [R-130/R3]
  - la Rivière navigue sur deux axes, ses branches naissent et meurent [R-130/R2]

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.12.0

## 1.27.0

### Minor Changes

- Changements automatiques détectés :

  - pin your own posts (#3129)
  - cinq des six événements qui décrivent l'ORGANISATION de la liste n'arrivaient nulle part [cycle 55] (#3126)
  - stale-while-revalidate cache for notifications (#3127)
  - les six écrivains locaux de la ligne de liste laissaient la carte du Prisme décrire l'ancien message [cycle 54-bis] (#3125)
  - MediaSessionCoordinator no longer swallows AVAudioSession errors (#3124)
  - l'épingle d'un message position-seule se perdait sur deux des trois chemins (#3122)
  - batched feed impression tracking (#3121)
  - call:signal's answer-received cleanup swept the whole call, not just the negotiating pair (#3119)
  - pure decision core for the in-app notification toast (#3118)
  - call:join's stale-buffered-offer drop swept the whole call, not just the joiner's own slot (#3110)
  - failCall() guards callState.isActive like its siblings (#3106)
  - wire real-time notification socket updates (#3117)
  - share-target lot 2 — image/video attachments (#3114)
  - share-target lot 1 (text/URL) — ACTION_SEND receiver (#3112)
  - la ligne de liste décrivait un mélange de deux messages [cycle 53] (#3111)
  - CameraView no longer swallows real capture/merge failures (#3109)
  - ban a conversation member — PATCH .../participants/{userId}/ban (#3107)
  - la ligne de liste décrivait un mélange de deux messages (#3105)
  - Focal — parite audio complete avec le chemin bulle
  - Focal — l'appui long eleve la CELLULE VIVANTE, plus jamais une bulle reconstruite
  - Focal — le fil court jusqu'au bord bas physique + plus aucun fondu de distance sur les bulles
  - Focal — chrome escamote pendant le defilement + zone d'activation sans conflit avec la saisie
  - add-member sheet — POST /conversations/{id}/participants (#3104)
  - reposer la perspective dans layoutSubviews, jamais dans apply(\_:)
  - la perspective Focal survit a l'application d'attributs de layout
  - transpose la cinematique de la maquette de reference -- constantes ET pivot
  - join the story-viewer realtime room (post:join/post:leave) (#3103)
  - aligne l'estimation de hauteur du layout sur le mode rendu -- MESURE NON CONCLUANTE
  - buffered-offer cleanup on participant leave wiped siblings' pending offers in group calls
  - le titre BRUT d'un DM entrait par le cache disque (#3099)
  - retire le travail MORT fait a chaque frame de defilement + etend la portee de la courbe
  - la reconfiguration d'arret de defilement effacait la perspective sans jamais la reposer
  - join the feed-comments-sheet realtime room (post:join/post:leave) (#3100)
  - l'exclusion « thread.hiddenChrome » avait survécu à sa cause (#3098)
  - la magnification ne change plus la hauteur de la cellule -- fin des sauts au defilement
  - "Missed" call-history filter never matched a group call the user was bystander to (#3095)
  - MessageLanguageDetailView drives sync through adaptiveOnChange (#3097)
  - la garde "entierement visible" comparait deux reperes qui ne coincidaient pas
  - la base de la carte devient la rangee d'action, et le cadre se referme autour
  - ressuscite la magnification du message elu et rend l'heure aux messages
  - join the post room from the reel viewer (post:join/post:leave) (#3093)
  - wire the first ThumbHash Coil placeholder (feed images) (#3094)
  - recalibrer 3 gardes source du lot de réserves — run #99
  - wire post-detail realtime room (post:join/post:leave) (#3092)
  - [R-d] monte la rangée .conversationStart sous drapeau
  - [R-a] safeAreaInset sticky monté uniquement drapeau ON
  - [R-j] constante partagée Notification.Name.openMyStories
  - la feuille de commentaires trappait à l'envoi sous macOS (#3087)
  - translated call captions leaked every group-call language to the whole room
  - paginate user search in the new-conversation picker (#3088)
  - reading_modes cascades to BetaFeaturesPreference — beta ON activates the reading-mode system app-wide [I-075, second amendment]
  - 'Focal (beta)' item + Settings toggle 'Activate betas' [I-075 amendment]
  - amendment — visibility gate is a user preference, not a dev flag [I-075]
  - 'Focal (dev)' long-press menu item — force Focal, one open, no writes [I-075]
  - thread forcedReadingMode through the existing nav path to ConversationView [I-075]
  - ReadingModeController.init(forcedMode:) — ephemeral open-time override [I-075]
  - third Lentille flag focalDevPreview — env/defaults, default OFF [I-075]
  - header round-chrome gutter 20→28pt — (+) toujours au bord
  - wire per-conversation tags, closing the preferences line (#3085)
  - transcription-invite badge never cleared when a peer left mid-transcription (#3084)
  - themedComposer stack overflow — fractionner la chaîne de modificateurs
  - « plus aucun message visible » était dit par le serveur et entendu par personne [cycle 49]
  - shiftHue en formules pures — parité bit à bit avec le domicile TS
  - group-call hang-up no longer ends the call for everyone (#3080)
  - wire favorite reaction, fixing a dead FAVORITES filter tab (#3082)
  - isSelf reads through the nullable id, not a smart cast
  - paginated conversation member list + role moderation
  - la résolution Socket.IO s'exécute hors du try de son appelant
  - wire per-conversation custom name (rename) (#3079)
  - la remise à zéro ne prévenait personne, et échouait pour qui était déjà à zéro
  - conversation delete-for-all (creator-only) + conversation:closed real-time purge (#3077)
  - une préférence, un cache — six mémoires purgées par un seul point d'entrée (#3076)
  - forceCleanupParticipationAfterLeaveFailure omitted userId, its own sibling emit (#3073)
  - rétablir la cible des modificateurs des trois états vides (build cassé sur main)
  - un aperçu recalculé a le droit de reculer — le serveur le déclare [cycle46]
  - Lentille empty branches restyled under flag; B1 RED tests renamed green [REV-3/V3ter L17]
  - Lentille focus card — type/memberCount chip absorbed from the row [REV-3/V3ter L08]
  - Lentille row — honest presence/typing, tertiary timestamp, pin, kind glyphs, live-call badge [REV-3/V3ter L01/L03/L06/L07/L10/L13]
  - migrate ComposerLanguagePickerDialog to the shared LanguagePickerDialog (#3072)
  - raison Rivière honnête — jamais/seuil/compte-inconnu, amendement S1 [REV-3/B3]
  - un seul magasin de préférence de mode, scopé identité — l'adaptateur Lentille rejoint le stockage Focal [REV-3/B2]
  - l'écran Confidentialité écrivait dans un tiroir que le serveur n'ouvrait pas
  - extract shared LanguagePickerDialog into :sdk-ui (#3070)
  - chevron d'épisode nommé par la direction de lecture, pas par un côté [F-088/WS-9]
  - routage audio — le `.audio` pur + texte est soleWithFooter, comme la bulle [F-082/WS-3]
  - pilule de défilement — les tests tiquent en ms, comme la loi [F-081/WS-2]
  - topSenders départage par userId ASC, plus par récence [F-087/WS-8]
  - les assertions i18n V3 résolvent par le catalogue, plus par le repli français
  - l'accusé de livraison dépendait du transport — les deux émetteurs socket ne l'ÉCRIVAIENT pas
  - FocalHostSourceGuardTests R15 searched a MARK comment in comment-stripped source
  - clear remaining Focal/Lentille build-break — app + test targets compile clean
  - `status` construit à chaque message, jamais rempli, jamais servi
  - CallQualityOverlay mislabels group-call peer alerts with wrong name
  - un message d'invité arrivait sans nom, le fil sans pièce jointe ni réponse citée
  - trois chargements d'accusés nominatifs jetés à la sérialisation
  - la préférence d'accusés de lecture tenait à trois portes sur quatre
  - OngoingCallBanner counted participants who already left
  - LivingSummaryModels missing MeeshySDK import breaks iOS CI
  - l'arriéré de lecture d'une personne partait à toute la conversation
  - crash-safe call:signal, cross-call quality-ladder leak, timedOutPerforming identity guard
  - delete conversation for me from the list context menu (#3057)
  - leave conversation from the list context menu (#3055)
  - mentions-only per-conversation notification preference (#3054)
  - ConversationListViewModel mirrors live conversation-lock state (#3053)
  - un invité de lien était nommé de deux façons selon le transport
  - close signal-size gap, end-reason spoofing, and two call-setup swallowed-failure paths
  - BubbleGridImageView reads display scale from the environment (#3050)
  - focal F-083ter — F05/F06/F10/F11/F15 trous visuels comblés [2/2]
  - focal F-083ter — filet contraste méta réparé, R15 vert [1/2]
  - garde R15 en jetons, commentaires exclus — indigo900 et les docs de loi ne sont plus des faux positifs [S-003/F-090]
  - LentillePeekView sur le chemin natif iOS 26 [LWS-7/I-067ter]
  - un lecteur sans compte n'accusait jamais réception au drain
  - focal WS-10 — surfaces agent ✦ stub, grammaire pointillée OFF [WS-10/F-089]
  - focal WS-9 — Résumé Vivant, l'état d'abord la preuve à un tap [WS-9/F-088]
  - LentilleModeMenu, LentillePeekView, sous-menu Mode de lecture [LWS-8/I-072]
  - focal WS-8 — digest déterministe, épisodes, Rampe [WS-8/F-087]
  - logout wipes conversation-lock PINs (was dead code) (#3048)
  - focus card + encoche AUTO·décision + chip mode mémorisé [LWS-8/I-071]
  - le message d'un invité de lien n'accusait jamais réception au rejeu (#3047)
  - le garde du cycle sous-titres bornait à 900 octets — le commentaire de la branche « réception seule » l'a débordé
  - le garde d'horodatage exigeait l'écoulé depuis l'appel, remplacé par l'horloge murale de capture
  - le garde du nom de locuteur cherchait `Text(speakerName)` que la ligne de journal a fusionné avec l'heure
  - focal WS-6/7 — flash immédiat, pilule montée, menu Aa [WS-7/F-086bis]
  - le garde d'auto-révélation du panneau visait une règle retirée — il garde la MÊME garantie à la source
  - drop 2 dead catalog keys — every app-catalog identifier is referenced in code again
  - 19 code call sites carried a French defaultValue with no catalog entry — no French leak into other locales
  - le garde d'échec transcription exigeait une fermeture de panneau que le spec 2026-08-13 a retirée
  - les gardes de hint VoiceOver de la pill bornaient à 1000 octets — ils bornent à la déclaration suivante
  - l'icône décorative de l'état vide des favoris n'était jamais masquée à VoiceOver
  - le relais recherche vers la plateforme ne se déclenchait jamais — Bob ne matche plus "awa" par son email hérité
  - les filtres de recherche par défaut de la factory de test faussaient l'assertion — Bob ne matche plus "awa" par un email/téléphone hérité
  - les gardes rejoinActiveCall lisaient les COMMENTAIRES — rejoinBody ne renvoie plus que du code
  - le garde d'adjacence start/stopSystemPiP cassait sur son propre doc comment — adjacence structurelle
  - le garde proximité grepait `!isVideoEnabled` que le fix C7 a remplacé — il relit la vraie condition
  - élection de la focus card sur le défilement [LWS-8/I-070]
  - LentillePerspective — passe compositor sur la courbe .list [LWS-8/I-069]
  - ConversationLockStore foundation (PIN storage, no UI yet) (#3045)
  - screen-capture privacy alert last-writer-wins across peers
  - focal WS-7 — coquille, orchestrateur dans ConversationView.init [WS-7/F-086]
  - mux du squelette Lentille dans la branche cache vide [LWS-7/I-067bis]
  - focal WS-6 — hôte de défilement, six sites montés sous drapeau [WS-6/F-085]
  - mux de rang Lentille sous drapeau dans ConversationRowItem [LWS-7/I-067]
  - LentilleSkeletonRow — géométrie exacte du rang [LWS-7/I-066]
  - LentilleConversationRow + LentilleBridgeLine — rang plat, pont ✦ [LWS-7/I-065]
  - focal WS-5 — FocalScrollPass, géométrie inversée et ancrage corrigé [WS-5/F-084]
  - focal WS-3 — filet de citation au token, flou et vue unique dans la grille [WS-3/F-083bis]
  - sticky visible, rail fusionné, pilule sur le relais existant [LWS-6/I-063bis]
  - focal WS-4 — FocalRow, densité Script comprise [WS-4/F-083]
  - montage pilule de section et rail vivants sur le signal existant [LWS-6/I-063]
  - focal WS-3 — blocs riches de la rangée plate [WS-3/F-082]
  - conteneur sticky Section/pinnedViews, pliage et drop conservés [LWS-6/I-062]
  - FocalMetrics — miroir des cotes thread + parité tokens [WS-0/F-082-pre]
  - focal WS-2 — pilule jour·heure sur ScrollTimePillLaw [WS-2/F-081]
  - focal WS-1 — préférence locale, identité lecteur, VoiceOver [WS-1/F-080]
  - vues Chrome Lentille — sticker, pilule, rail vivants [LWS-6/I-061]
  - greffe groupConversations sur LentilleSectionResolver [LWS-5/I-060]
  - attache le pont ✦ au payload — liste, socket, suggestedMode [G-123]
  - ConversationBridgeService — le pont ✦ en requêtes agrégées [G-122]
  - route préférences — readingMode validé, patch partiel, broadcast utilisateur [G-121]
  - ajoute readingMode à UserConversationPreferences (colonne typée, jamais clé/valeur) [G-120]
  - CategoryStorage prend un PrismaClient, plus un any
  - un PATCH de préférences n'a jamais été partiel (cycle 49)
  - la ligne de liste se corrigeait à toute mutation SAUF au masquage

## 1.26.3

### Patch Changes

- 94222b9: Le repost d'une story ou d'un statut ne perd plus les dimensions, l'accessibilité et la transcription du média qu'il duplique.

  **Les octets étaient dupliqués, la ligne qui les décrit était réénumérée à la main.** Quand la source est ÉPHÉMÈRE (STORY 21h, STATUS 1h), `repostPost` copie réellement les fichiers pour que le repost survive au hard-delete de l'original — c'est la garantie qui empêche le « statut/story vide ». Mais la ligne `PostMedia` créée par-dessus n'énumérait que huit champs, alors que `mediaSelect` en avait chargé dix-sept. Tout le reste naissait sur le défaut Prisma, c'est-à-dire nul :

  - `width` / `height` : sans elles, `FeedMedia.aspectRatio` rend `nil` et le lecteur ne peut pas réserver le cadre avant le téléchargement — le repost saute au chargement, là où l'original ne sautait pas ;
  - `thumbHash` : le placeholder instantané est DÉRIVÉ de ces pixels-là. Le laisser derrière condamnait la copie à l'attente pleine taille pour un travail déjà fait — exactement le défaut corrigé sur les pièces jointes de message au correctif précédent, ici sur la famille post ;
  - `duration` : un lecteur audio/vidéo sans durée ne sait pas dessiner sa barre de progression tant que le média entier n'est pas descendu ;
  - `alt` / `caption` : le texte alternatif EST l'accessibilité du média. Un repost qui le perd rend muet à VoiceOver un contenu que son auteur avait pris la peine de décrire — et rien ne le signalait, l'image s'affichant normalement ;
  - `language` / `transcription` : le Prisme Linguistique s'applique à TOUT le contenu, transcriptions comprises. Une story repostée perdait la transcription Whisper de son audio, donc ses sous-titres et toute traduction ultérieure : le prisme n'avait plus rien à résoudre et le contenu retombait dans la langue de l'auteur d'origine.

  `Post.audioDuration` relevait du même oubli : `audioUrl` était remplacé par celui de la copie, `audioDuration` restait derrière, et la note vocale d'un statut reposté affichait 0:00 jusqu'au téléchargement complet du fichier.

  La copie emporte désormais ces faits, et elle emporte l'ABSENCE aussi fidèlement que la présence : un média sans dimensions ni légende ne s'en voit pas inventer. Elle pose aussi son `uploaderId` — le reposteur vient d'en écrire les octets, et le schéma ne tolère ce champ nul que pour les lignes antérieures à son introduction.

  Deux champs restent volontairement en dehors de la copie, et c'est un choix, pas un oubli. `variantOf` pointe vers une AUTRE ligne `PostMedia` : un pointeur n'est pas un fait sur ces octets, et recopié tel quel il désignerait la ligne source que le balayage de l'éphémère va effacer — même raisonnement que le remap d'ids déjà appliqué à `storyEffects` juste en dessous. `translations` porte les URL des variantes TTS, dont les blobs n'ont PAS été dupliqués : les recopier promettrait au lecteur des pistes audio qui disparaîtront avec la source. Dupliquer ou régénérer les TTS d'un repost est une décision produit, consignée comme telle.

## 1.26.2

### Patch Changes

- 8495c31: Le transfert d'une pièce jointe chiffrée ne fabrique plus une copie qui ment sur ses propres octets.

  **Les octets voyagent par référence, le fait qui les décrit restait derrière.** `copyForwardedAttachments` reprend `filePath` et `fileUrl` À L'IDENTIQUE : la copie et l'original désignent le MÊME blob sur disque. Quand l'original est chiffré, ce blob est du chiffré — et la copie naissait pourtant sans un seul des onze champs de chiffrement, donc avec le défaut Prisma `isEncrypted: false`, sans IV et sans tag d'authentification.

  Or le gateway ne déchiffre rien : `routes/attachments/download.ts` sert les octets bruts (`createReadStream(filePath)`) et c'est le CLIENT qui déchiffre, d'après ce que la ligne DÉCLARE — `attachmentIncludes` publie `isEncrypted`, `encryptionMode`, `encryptionIv` et `encryptionAuthTag` exactement pour ça. Une copie qui annonce « clair » en pointant du chiffré fait donc rendre le CHIFFRÉ TEL QUEL comme s'il était le média, sous le `mimeType` et le nom d'origine : le client ne déchiffre pas, puisqu'on vient de lui dire qu'il n'y avait rien à déchiffrer. Transférer une photo chiffrée produisait un fichier illisible que rien, ni côté serveur ni côté client, ne signalait comme tel — `isAttachmentEncrypted()` répondait `false` sur la copie.

  `originalFileSize` comptait au même titre : `fileSize` porte la taille CHIFFRÉE quand la pièce est chiffrée (`UploadProcessor`) et il EST copié, si bien que la copie annonçait la taille du chiffré comme celle du fichier, sans le `originalFileHash` qui permet de vérifier un déchiffrement.

  La copie emporte désormais les onze champs qui décrivent ses octets — `isEncrypted`, `encryptionMode`, `encryptionIv`, `encryptionAuthTag`, `encryptionHmac`, `originalFileHash`, `encryptedFileHash`, `originalFileSize`, `serverKeyId`, `thumbnailEncryptionIv`, `thumbnailEncryptionAuthTag` — ainsi que `thumbHash` et `imageVariants`, déjà dérivés de ce même média, dont la perte condamnait la copie au téléchargement pleine taille pour un travail déjà fait. Une pièce jointe en clair reste en clair : la copie recopie l'ABSENCE du fait aussi fidèlement que sa présence.

## 1.26.1

### Patch Changes

- 2838397: Le chemin REST d'envoi ne gate plus le chiffrement sur un booléen posé à côté du chiffré.

  **Le fait, c'est le chiffré — pas le drapeau.** `SendMessageBodySchema` compte `encryptedContent` parmi les porteurs de contenu : son `.refine()` admet, en quatrième branche, un corps qui n'apporte QUE du chiffré. La route, elle, ne consommait ce chiffré que sous condition d'`isEncrypted` — un booléen SÉPARÉ, optionnel, que le schéma n'a jamais lié au chiffré. Les deux ordres perdaient. Chiffré sans le drapeau : `encryptedPayload` restait `undefined`, le chiffré était jeté, et le corps que le schéma venait d'approuver ressortait en 400 « Message content cannot be empty » — la branche validée ne menait à aucune écriture. Drapeau sans le chiffré : `ciphertext: encryptedContent!` mentait, la charge partait avec un `ciphertext: undefined` que `MessageProcessor` refusait à son tour (`data.encryptedContent && data.encryptionMetadata`), et le message était écrit EN CLAIR avec `isEncrypted: false` — puis traduit, scanné pour ses liens et poussé en notification. Un message que le client avait déclaré chiffré, rétrogradé sans un mot. La route sert désormais la présence du chiffré, comme le chemin socket le faisait déjà ; le schéma refuse explicitement la promesse sans porteur plutôt que de la rétrograder.

  **Le mode n'est plus rejeté sur sa casse.** `encryptionMode` était un enum strictement minuscule là où le client iOS émet `"E2EE"` et où la description OpenAPI de la route annonçait `e2e` — deux valeurs que la validation retournait en 400 sur un champ dont le jeu est pourtant connu et fermé. La casse est normalisée à la frontière d'écriture, comme le code de langue l'est déjà ; le jeu de valeurs reste fermé (`e2e` reste refusé), et il vaut désormais `e2ee` par défaut quand un chiffré arrive sans mode. La description publiée est réalignée sur ce qui est réellement appliqué : elle annonçait un jeu de valeurs que le serveur n'acceptait pas, et taisait `hybrid` qu'il acceptait.

## 1.26.0

### Minor Changes

- Changements automatiques détectés :

  - conversation invite links now open the app that generated them (#3039)
  - un corps approuvé par le validateur faisait tomber la route en 500 (#3038)
  - toggleTranscription starts capture for a dead call after the permission prompt (#3037)
  - profile share links now open the app that generated them (#3036)
  - REV-2 — le compteur du protocole redevient autoritatif dans LocalBridgeProvider TS — run test
  - retirer `checkPermissions`, la règle orpheline que personne n'appelait
  - l'état de la conversation ne gouvernait rien sur le chemin d'envoi
  - ressources de bundle réellement copiées — run test
  - StoryCacheSource.revalidate() no longer deletes stories past page 1 (#3034)
  - providers de substitution Swift — protocoles + implémentations locales [M-048]
  - Self covariant interdit en argument par défaut — nom de type explicite [M-043/CI]
  - miroir Swift ReadingModeOrchestrator — clamp, cascade d'assistance, garde e2ee [M-042]
  - miroir Swift LentilleBridgeFormatter — pont en données, pluriel One/Other [M-041]
  - miroir Swift LentilleSectionResolver — sections, tri, calendrier lecteur [M-040]
  - miroir Swift ScrollTimePillLaw — fenêtre semi-ouverte 900 ms, machine pure [M-044]
  - miroir Swift FocalFocusCurve — courbe .thread/.list, élection, bande 140±45 [M-043]
  - @MainActor sur les ponts LentilleMetrics vers le SDK (AvatarContext.size, MeeshyFont) [M-045/CI]
  - formatBridge sélectionne messagesOne/Other ; enums Lentille nonisolated [B1+CI]
  - participantCount included participants who had already left
  - cohérence orchestrateur↔capacités↔pont, isComplete jusqu'au rang [C-033]
  - réserves REV-1 — garde R15 auto-testée, vecteurs frontière+DST, i18n lentille atteignable [C-034]
  - listTokens en propriété calculée — Swift 6 refuse un static let [String: Any] partagé [M-045]
  - LentilleMetrics + test de parité avec lentille-tokens.json [M-045]
  - variables CSS --lentille-\* + test de parité bidirectionnel avec les tokens [M-049]
  - drapeaux lentille_list et reading_modes — défaut OFF, ProcessInfo prime [M-046]
  - bridge sur MeeshyConversation + repli dans renderFingerprint — E13 [C-029/C-030]
  - le tri de la liste délègue à sortConversations — lastMessageAt, jamais lastMessage.createdAt [C-031]
  - une clôture GLOBALE s'annonçait comme une suppression PERSONNELLE
  - la recherche matche le préview résolu par le Prisme — E-audit [W9-001]
  - E14 — l'appel i18n s'aligne sur le chemin réel conversationSearch.noConversationsFound [W9-003]
  - déduplication par id à la sélection du cache infini — E10 [W9-002]
  - la suppression d'un commentaire laissait l'appelant choisir son audience
  - REST leave/kick never broadcast PARTICIPANT_LEFT to the call room
  - le jumeau REST du like de commentaire diffusait aussi vers le postId de l'URL
  - le client choisissait l'adresse de diffusion, et la synchro ne gardait aucune audience
  - group calls formed a star, not a mesh — non-initiators never offered each other
  - brancher ExplodeOverlay et WaooOverlay, jamais montés
  - rate-limit call:transcription-active presence signal
  - a second deferred hang-up/decline silently dropped the first one's server reconciliation
  - reconnecting indicator stuck true + fullscreen pane blanked after a group-call peer left
  - a single group-call decline was killing the ring for every other invitee
  - la garde d'état terminal était inerte sur la branche `mshy_`
  - une conversation FERMÉE restait pleinement inscriptible
  - la déconnexion d'un invité anonyme ouvrait une fenêtre de perte sèche
  - le rejeu hors ligne livrait le contenu des conversations quittées pendant l'absence
  - la file de rejeu hors ligne n'avait de borne que du côté qui ne sert jamais
  - une transition de présence coûtait le serveur entier pour savoir qui l'avait bloquée
  - une traduction hors ligne était mise en file chez des lecteurs qui ne peuvent pas la lire (#3017)
  - providers de substitution — le mock rejoue les vecteurs du vrai [M-047]
  - corrections REV-1 — fondu sous-focus fidèle à la maquette, pont jamais vide, exports providers [C-032]
  - sectionnement et tri — pinned/live/catégories/temporel, calendrier lecteur [C-017/C-018]
  - orchestrateur, capacités, cascade d'assistance — les lois LWS-0 [C-011/C-012/C-013]
  - buildBridgeData + formatBridge — le pont ✦ voyage en données, l'i18n compose [C-019/C-020]
  - portage TS de l'accent conversationnel — miroir exact du Swift [C-021]
  - protocoles providers figés — pont ✦, préférence de mode, appel live [C-028]
  - focusCurve paramétrée .thread/.list + electFocusRow à hystérésis [C-014/C-015]
  - scrollActivityLaw — visible au premier scroll, effacée à 900 ms exactement [C-016]
  - types gelés des modes de lecture et du pont ✦ — §3.1-3.3, Zod d'abord [C-010]
  - lentille-tokens.json — domicile des cotes §4.3, trois consommateurs de parité [C-026]

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.11.0

## 1.25.8

### Patch Changes

- Updated dependencies [87a7779]
  - @meeshy/shared@1.10.4

## 1.25.7

### Patch Changes

- aaba8a0: Beta 2026-08-12 — vie sociale des reposts, effectifs de conversation, messages éphémères

  **Gateway (backend).**

  - Un repost de STORY/STATUS garde désormais **sa propre** vie sociale. La redirection des interactions vers la racine — la règle des reposts simples — est levée quand cette racine est éphémère, parce que le repost porte son propre instantané (média/audio/`storyEffects` dupliqués à la création). Deux défauts disparaissent : les like/commentaires ne partent plus vers la racine en `story:reacted` pour une action posée sur une carte de feed, et le repost ne devient plus définitivement 404 dès qu'`ExpiredStoriesCleanupService` soft-supprime la racine (~7 j après expiry) alors que la carte reste affichée. Lecture (`PostService.getPostById`, `PostFeedService.resolveUserReactionsMap`) et écriture (`resolveRedirectTarget`) partagent le même prédicat `isEphemeralPostType`, pour qu'elles ne puissent pas diverger.
  - `post:join` / `post:leave` suivent enfin la même redirection que la lecture du fil : un viewer ouvrant le fil d'un repost simple rejoignait la room du repost quand tous les broadcasts partent vers celle de la racine — il ne recevait plus aucun événement. `leave` est redevenu symétrique, sans quoi la vraie room ne se libérait jamais.
  - `conversation:participant-joined` : nouvel événement, symétrique de `participant-left`, émis vers les rooms personnelles des membres. `conversation:joined` ne pouvait pas porter ce fait — le gateway l'émet aussi comme ack self-only à chaque ouverture de fil.
  - Départ, retrait et ajout de participant atteignent tous les membres et non plus la seule room du fil ouvert.
  - `GET /me/preferences/encryption` rapporte préférence de chiffrement et état des clés Signal, en lisant l'existence réelle d'un `SignalPreKeyBundle` actif plutôt que les colonnes miroir jamais renseignées.
  - Un message rappelé par son auteur ne reste plus lisible en clair dans l'inbox de mentions ; ses liens courts sont désactivés et ses notifications retirées.
  - Le transfert n'est plus la sortie de secours de l'éphémère et de la vue unique : la copie hérite désormais de la **durée** de la source, recomptée depuis le transfert, et un message à vue unique refuse d'être transféré — propager son budget de vues ne fermerait rien, puisqu'il repartirait à zéro sur la ligne neuve.

  **Web (frontend).**

  - L'effectif d'un groupe ne dérive plus : il grossissait d'une unité à chaque ouverture du fil et en perdait une à chaque fermeture, les deux erreurs se compensant sans jamais s'annuler. L'incrémentation passe sur `conversation:participant-joined` ; `conversation:joined` ne fait plus qu'invalider la liste des participants.

  **Shared.**

  - Types et payloads de `conversation:participant-joined`, alignés sur le socle d'événements existant.

  **iOS.** Chrome global unifié — bannière d'appel en `safeAreaInset` pleine largeur et point de montage unique du SyncPill ; tray de stories qui ne se coupe plus silencieusement à 50 ; effectif de conversation qui ne peut plus que décroître.

- Updated dependencies [aaba8a0]
  - @meeshy/shared@1.10.3

## 1.25.6

### Patch Changes

- b3e95ef: Les messages autodestructibles ne s'autodétruisaient que sur l'écran

  `Message.expiresAt` est écrit par les deux transports d'envoi (WS et REST), et les trois
  clients replient la bulle quand l'échéance passe — iOS (`ThemedMessageBubble`,
  `BubbleStandardLayout`), Android (« collapse ephemeral bubble when its self-destruct timer
  expires »). Le serveur, lui, ne balayait **rien**.

  Aucune des ~119 lectures du modèle `Message` ne filtre `expiresAt` : elles sont toutes
  gardées par le seul `deletedAt`. Et aucun service ne posait ce `deletedAt` sur une échéance
  passée — `MaintenanceService` ne balaye que les messages **vides**,
  `ExpiredStoriesCleanupService` ne connaît que les `Post`.

  Conséquence : le texte en clair d'un message « autodestructible » restait servi par
  `GET /conversations/:id/messages` **indéfiniment** après son échéance. Une réinstallation,
  un nouvel appareil, le client web (qui n'a aucun traitement d'éphémère) ou un simple appel
  d'API avec un jeton valide le rendaient intégralement. Ce que l'expéditeur croyait effacé
  au bout de trente secondes était intact un an plus tard, en clair, en base.

  **`ExpiredMessagesCleanupService`** ferme les deux fuites — celle de lecture et celle au
  repos. À la minute (la plus courte durée offerte par les clients est de 30 s), il écrase
  `content` et `encryptedContent`, vide les traductions, supprime les pièces jointes
  (fichiers et lignes), puis pose `deletedAt` — ce qui suffit à retirer le message des ~119
  lectures sans en toucher une seule. Cinquième écrivain de `deletedAt` sur un message, il
  appelle `applyMessageRemovalEffects`, l'unité que les quatre autres partagent déjà.

  L'effacement du CONTENU est propre à ce chemin, et délibérément : une suppression demandée
  par une personne veut dire « retire-le de la vue » et laisse la ligne récupérable ; une
  échéance dit « détruis-le ».

  Deux garde-fous, parce que ce balayage peut faire pire que le défaut qu'il ferme :

  - `unsetOrNull('deletedAt')` plutôt que `deletedAt: null` — une ligne dont le créateur n'a
    pas écrit `LIVE_MESSAGE_MARK` a la colonne ABSENTE et ne serait jamais balayée.
  - un filtre `_isLapsed` dans le processus en plus du prédicat Mongo. `$lt` avec une date
    est bracketé par type et n'apparie pas les nuls — mais le rayon de souffle d'une erreur
    ici est la destruction de tous les messages de la base, et un invariant à ce prix se
    revérifie plutôt que de se documenter.

  Index partiel `expiresAt_ephemeral_partial` fourni en migration MongoDB
  (`packages/shared/prisma/migrations/2026-08-12-message-expires-at-partial-index.mongodb.js`) :
  `expiresAt` étant écrit explicitement à `null` par tous les créateurs, un index ordinaire
  porterait une entrée par message pour servir une fraction infime d'entre eux.

## 1.25.5

### Patch Changes

- af390d8: Les accusés de lecture ne se rattrapaient sur AUCUN client mobile après une coupure socket

  `read-status:updated` n'est émis que par une **action** d'accusé — un pair qui lit, une
  remise automatique. Un socket coupé à cet instant ne le reçoit jamais, et **rien ne le lui
  rejoue** : la file de livraison hors ligne ne porte que des messages et leurs mutations.

  La coche de l'expéditeur reste donc figée sur sa valeur d'avant la coupure. Les compteurs
  étant monotones côté client depuis le cycle 85, un événement manqué n'est pas un retard
  qu'un suivant corrigerait — c'est un **gel permanent**. Une personne qui lit sans écrire ne
  voit plus jamais ses coches avancer.

  Le cycle 90 a réparé le **web** en relançant son lot REST sur le front montant de la
  reconnexion (`use-conversation-messages-rq.ts`). iOS et Android n'ont pas de lot REST
  équivalent : ils n'avaient **aucun** rattrapage.

  ## Le rattrapage vit sur `conversation:join`

  `ConversationHandler._resyncReadStatusToSocket` renvoie le résumé d'accusés courant
  (`getLatestMessageSummary`) au socket qui rejoint. `conversation:join` est le point de
  rattachement de **chaque** reconnexion des trois clients — web `_autoJoinLastConversation`,
  iOS et Android re-joignent après authentification — et le payload est celui qu'ils traitent
  déjà : **aucun changement client**.

  Les deux rattrapages ne font pas double emploi : celui-ci pousse le résumé de conversation
  vers les trois clients, celui du web détaille message par message pour un seul.

  ## `type: 'received'`, jamais `'read'`

  Ce n'est pas un détail de forme. iOS (`ConversationSyncEngine`, `NotificationCoordinator`)
  et Android ne remettent le compteur de non-lus à zéro que sur un `'read'` émis par
  **soi-même**. Un rattrapage estampillé `read` aurait vidé la pastille du rejoignant à
  **chaque ouverture de conversation** — le correctif aurait fabriqué un défaut pire que celui
  qu'il ferme.

  `received` ne porte que le `summary` agrégé : même contrat que la remise automatique en lot
  (`MessageHandler.autoDeliverToOnlineRecipients`), qui est le précédent de cette forme. Ni
  `lastReadAt` ni `unreadCount` ne l'accompagnent — ils n'appartiennent qu'aux diffusions
  `read`.

  ## Le rattrapage ne peut pas faire reculer une coche

  Vérifié sur les trois clients avant d'écrire la ligne, parce que c'était le seul moyen que ce
  correctif nuise : `isStaleReceipt` (web, `conversation-ui-store.ts`),
  `if newStatus.isBetterThan(current)` (iOS, `applyReadReceipt`), `deliveryRank` (Android,
  `MessageRepository.applyReadReceipt`). Les trois n'appliquent le résumé que **vers le haut**.

  Une conversation sans message n'émet rien. Canal best-effort : le join a déjà réussi et la
  room est déjà rejointe, donc un rattrapage qui échoue ne le défait pas.

  `participantId` porte la ligne `Participant` que le contrôle d'appartenance vient de
  résoudre, jamais l'identité de room (un `User.id` dès que le rejoignant a un compte).

  Documentation : `services/gateway/src/socketio/README.md` gagne la section
  « `read-status:updated` — l'evenement manque pendant une coupure n'est rejoue nulle part ».

## 1.25.4

### Patch Changes

- 74eee6a: Cinq défauts temps réel : un invité qui rejoignait en silence, une traduction fabriquée, un socket coupé, une réaction fantôme et un audio envoyé en double

  ## 1. Gateway — l'invité de lien partagé rejoignait en silence

  Le handler gatait **toutes** ses émissions post-join sur `connectedUser.userId`,
  `undefined` pour un anonyme — alors que le contrôle d'appartenance juste au-dessus l'a
  laissé passer et que le socket EST dans la room. Résultat : un invité rejoignait en
  silence, badge de non-lus vide, et rien pour le remplir.

  `getUnreadCount` accepte indifféremment un `Participant.id` ou un `User.id` — son en-tête
  nomme même le chemin anonyme comme le cas courant. Le compteur sort donc du garde et
  reçoit `participantId`. **Pas `connectedUser.id`** (le jeton de session) : il ne résout
  aucune ligne Participant et aurait rendu `0` en silence, un badge « correct » et faux. Un
  test verrouille l'identité exacte transmise, pas seulement le fait qu'un compteur parte.

  **L'accusé `conversation:joined` part lui aussi**, sous la même identité. Le blocage annoncé
  — « quelle identité mettre dans `userId` pour un participant sans compte ? » — s'est dissous à
  la lecture des clients : les cinq consommateurs (web `use-socket-cache-sync`,
  `use-stream-socket`, `orchestrator` ; iOS `ConversationSyncEngine`, `ParticipantsView`)
  n'exploitent QUE `conversationId`. Aucun ne lit `userId`.

  La seule contrainte dure est de **décodage** : `ConversationParticipationEvent.userId` est un
  `String` **non optionnel** côté Swift — omettre le champ ferait échouer le décodage et l'accusé
  serait silencieusement jeté sur iOS. Le champ doit donc être présent ; sa valeur n'est lue par
  personne. D'où `participationId = userId ?? participantId`, une seule résolution d'identité
  pour les deux émissions.

  ## 2. Gateway — une traduction présentée comme telle, mais jamais traduite

  `getTranslation()` lisait `translations[targetLanguage]` **verbatim** quand tous les
  écrivains stockent sous la forme canonique de `normalizeLanguageCode` (`'pt-BR'` →
  `'pt'`). Une demande `pt-BR` interrogeait donc une clé absente pendant que la traduction
  attendait une clé plus loin ; l'appelant sondait 20 fois sur 10 s, puis rendait un repli
  **fabriqué** `[PT-BR] <texte original>` — le texte source affublé d'une étiquette de
  langue. Violation directe du Prisme Linguistique, et dans sa pire forme : du contenu non
  traduit présenté comme traduit.

  Verbatim d'abord, forme normalisée en repli : un document legacy portant réellement une
  clé régionale reste servi tel quel. Aucune traduction ne change de gagnant — seules
  celles qu'on ne trouvait pas deviennent trouvables. La cible **rendue** reste celle
  demandée (`'pt-BR'`), le client corrèle sa requête dessus.

  ## 3. Web — ouvrir un profil coupait la connexion temps réel

  `useSocketIOMessaging` appelait `meeshySocketIOService.reconnect()` **sans condition** au
  montage. Or `reconnect()` n'est pas un « connecte si besoin » : c'est `disconnect()` suivi
  d'une reconnexion différée par backoff, 1 à 2,5 s au premier essai. Cinq composants
  montent ce hook — ouvrir un profil coupait donc un socket parfaitement sain, messages
  temps réel compris.

  L'étape 1C, quinze lignes plus bas, fait exactement le même geste correctement gardé
  (`!isConnected && !isConnecting`) ; c'est cette garde qui est appliquée au montage.

  ## 4. Web — une réaction refusée par le serveur restait affichée pour toujours

  Les deux mutations de réaction gardaient leur rollback derrière
  `if (context?.previousData)`. Or `onMutate` **fabrique** l'état optimiste quand le cache
  est vide : `previousData` vaut alors `undefined`, et le garde refusait précisément de
  défaire ce qui venait d'être inventé.

  Le rollback devient inconditionnel — mais `setQueryData(key, undefined)` n'y suffit pas :
  React Query traite `undefined` comme « ne rien changer ». Restaurer l'absence de donnée
  exige `removeQueries`. `restoreReactionSnapshot` retire donc l'entrée quand il n'y avait
  rien, et la réécrit sinon.

  ## 5. Translator — chaque audio traduit partait en double

  Bloc `if audio_bytes:` dupliqué verbatim dans le sender multipart : 2× la charge ZMQ par
  message vocal multilingue. La seconde copie écrasait en outre la métadonnée avec son
  propre index, si bien qu'elle désignait le doublon et que la première copie restait un
  frame orphelin. Rien ne cassait — le gateway résout les frames strictement par
  `info.index`, bornes vérifiées — ce qui explique la survie du défaut. Origine sans
  ambiguïté au `git log -L` : un hunk de conflit résolu en double.

  ## Vérification

  - **RED prouvé pour chacun des quatre correctifs TypeScript** avant correction ; le
    rollback de réaction est resté rouge après un premier correctif « évident »
    (`setQueryData(key, undefined)`, no-op), ce que seul le test a révélé.
  - **Suite gateway complète verte** : 654/654 suites, 16 504/16 504 tests.
    `tsc --noEmit` gateway : 0 diagnostic.
  - **Suite web complète verte** : 563/563 suites, 12 089 tests passés, 21 ignorés,
    0 échec.
  - **Réserve sur le translator** : sa suite pytest n'a pas pu être exécutée dans cet
    environnement (`numpy`/`torch` s'installent depuis l'index PyTorch, bloqué par le
    proxy). La sûreté du retrait est établie par lecture des deux côtés du contrat —
    producteur, et consommateur `extractAudioBinaryFrames` — **pas par exécution**.

- 2111603: Deux compteurs qui mentaient sans jamais se corriger : la pastille après une suppression REST, et les accusés après une coupure socket

  ## 1. Gateway — les deux transports REST de suppression ne repoussaient pas la pastille de non-lus

  Le cycle 89 a câblé le recalcul du badge sur le transport WebSocket
  (`MessageHandler.handleMessageDelete`). Les deux transports REST — `DELETE /messages/:id`
  (celui d'Android) et `DELETE /conversations/:id/messages/:messageId` (celui du SDK iOS) —
  ne le faisaient pas : le lecteur voyait le message disparaître pendant que sa pastille
  continuait de le compter. La liste de conversations du web tourne en `staleTime: Infinity`,
  donc sans poussée la valeur ne vieillit pas — **elle ment, indéfiniment**.

  Le décompte lui-même était déjà juste (`getUnreadCountsForParticipants` filtre
  `deletedAt: null`) : il ne manquait que de le **redemander**.

  La poussée vit dans `broadcastMessageMutation`, l'unique broadcaster des cinq routes de
  mutation REST — donc écrite **une seule fois** pour les deux suppressions. Les trois autres
  appelants sont des éditions, et une édition ne change aucun compte : le badge n'y est pas
  touché, ce qui aurait coûté deux requêtes par frappe validée pour zéro delta.

  **L'exclusion porte sur l'AUTEUR (`authorId`), jamais sur l'acteur** : un modérateur qui
  retire le message d'un autre est lui-même un destinataire dont la pastille doit bouger.
  C'est le contraire de la file hors ligne, dix lignes plus bas, qui exclut bien l'acteur.

  **C'est le TYPE qui tient la règle**, pas la vigilance : `MessageMutationParams` est une
  union discriminée où `authorId` est **requis** sur `eventType: 'deleted'` et **absent** de
  `'edited'`. Un sixième transport de suppression ne compile pas sans nommer l'auteur — les
  deux callsites REST ont d'ailleurs été trouvés par `tsc`, pas par lecture.

  La table du § « La pastille de non-lus » de `socketio/README.md` annonçait TROIS transports
  REST de suppression, et les disait dépourvus d'aperçu de liste. Vérification faite : il y en
  a **deux**, et ils émettent bien `emitConversationPreviewUpdate` depuis qu'ils passent par
  `broadcastMessageMutation`. Le document est corrigé.

  ## 2. Web — les accusés de lecture n'étaient jamais re-synchronisés après une coupure socket

  Le lot REST `messagesService.getReadStatuses` est gardé par une clé
  `${conversationId}:${dernier message à soi}` : il ne se relance donc que lorsqu'on **ENVOIE**
  un nouveau message. Et `conversation:join` ne re-émet aucun `read-status:updated`.

  Depuis que le cycle 85 a rendu ces compteurs **monotones** (`isStaleReceipt` rejette tout
  résumé qui recule à `totalMembers` inchangé), un `read-status:updated` manqué pendant une
  coupure n'est plus une valeur en retard qu'un événement suivant corrigerait : c'est un **gel
  permanent**. L'expéditeur regarde une coche « remis » sur un message que tout le monde a lu,
  jusqu'à ce qu'il en envoie un autre.

  Le hook rattrapait déjà les MESSAGES manqués sur le front montant de la reconnexion
  (« Trigger 1 » → `syncNewerMessages`). Ce front est désormais compté **une seule fois**
  (`reconnectEpoch`, en tête du hook) et sert les deux dettes du même instant : les messages
  manqués et les accusés manqués. La détection de front, qui était dupliquée pour le premier
  et absente pour le second, n'existe plus qu'en un endroit.

  ## Vérification

  - **RED prouvé avant chaque correctif** : la pastille au niveau de l'unité partagée ET des
    deux routes (le type impose de passer _une_ identité ; seuls les tests de route disent
    LAQUELLE) ; le rattrapage des accusés par un cycle connecté → coupé → reconnecté sans
    envoi de message.
  - **Suite gateway complète verte** : 680/680 suites, 16 847/16 847 tests.
    `tsc --noEmit` gateway : 0 diagnostic.
  - **Suite web complète verte** : 564/564 suites, 12 122 tests passés, 21 ignorés.
  - **Réserve honnête sur le typecheck web** : `tsc --noEmit -p tsconfig.json` rend **1 224
    diagnostics, tous situés dans `**tests**/**`, et strictement PRÉ-EXISTANTS\*\* — le même
    compte exactement, mesuré sur l'arbre stashé. Ce travail n'en ajoute aucun, et aucun ne
    porte sur un fichier qu'il touche. Le décompte n'a pas été assaini (hors périmètre) mais
    il est consigné ici pour que le prochain cycle ne le découvre pas comme une nouveauté.
  - Le test de rattrapage a d'abord été écrit avec `waitFor` et s'est révélé **flaky sous la
    suite complète** (564 suites en parallèle, délai par défaut d'une seconde dépassé). Il
    asserte désormais directement après `rerender` — le front monté relance le lot de façon
    synchrone, il n'y avait rien à attendre. RED/GREEN re-prouvé sous cette forme.

- 45d82ce: Quitter une conversation retracte la frappe qu'on y diffusait — la moitié serveur du correctif typing, pour tous les clients

  Le cycle précédent a réparé les indicateurs de saisie **du web**. Le défaut qu'il
  contournait côté client était serveur : `conversation:leave` ne retracte pas la frappe.

  Seul `disconnecting` le faisait (`StatusHandler.handleSocketDisconnecting`), et changer de
  conversation **ne déconnecte pas le socket**. Un utilisateur qui tape dans une conversation puis
  passe à une autre laissait donc « X est en train d'écrire… » chez tous ses pairs jusqu'à
  l'expiration de leur filet de sécurité local — sur **tous** les clients. Le correctif web faisait
  émettre un `typing:stop` au navigateur avant de partir ; iOS et Android restaient exposés, et le
  web ne l'était plus que par la grâce d'un geste client qu'aucune règle serveur ne garantissait.

  **Le geste juste existait déjà en entier** dans `handleTypingStop`, et il n'est pas anodin :
  l'identité de la retraction est tirée de l'entrée `activeTypers` (donc juste même si l'utilisateur
  s'est renommé pendant la frappe), le verrou de throttle est levé pour que la frappe suivante ne
  soit pas avalée par la fenêtre de coalescence de 2 s, et la suppression multi-appareils évite
  d'effacer un indicateur qu'un autre appareil du même utilisateur doit encore. Le réécrire pour le
  départ de conversation aurait été la dixième copie d'une règle qui en a déjà coûté cher.

  Il est donc **extrait tel quel** en `retractTypingIn(socket, normalizedId)` — deux entrées, un seul
  énoncé — et `ConversationHandler.handleConversationLeave` l'appelle par une dépendance optionnelle
  que le manager injecte.

  Deux décisions, chacune verrouillée par un test :

  **L'id est passé DÉJÀ NORMALISÉ.** Brancher `handleTypingStop` directement sur
  `CONVERSATION_LEAVE` aurait été plus court d'une ligne, mais ce handler commence par valider puis
  `normalizeConversationId` — un `conversation.findUnique` — avant même de regarder s'il y a quelque
  chose à retracter. `handleConversationLeave` vient de résoudre exactement le même id : le
  brancher naïvement aurait payé une seconde résolution à **chaque changement de conversation**,
  pour un socket qui neuf fois sur dix ne tapait pas.

  **La retraction précède `socket.leave(room)` et porte son propre `try/catch`.** L'ordre garde
  l'énoncé lisible — « je retire ce que j'ai diffusé, puis je sors » — et le catch local est ce qui
  empêche une retraction en échec de transformer un départ demandé par le client en
  `conversation:leave` refusé.

  **Un test du fichier ne discriminait rien.** Le double de `validateSocketEvent` y rend un
  `conversationId` CONSTANT : « id normalisé » et « id brut » y étaient indistinguables, et la
  mutation correspondante survivait au premier passage. Le test fait désormais échoïser son entrée au
  double et écarte explicitement l'id normalisé de l'identifiant reçu — sans quoi il aurait validé
  les deux versions du code (leçon 128).

  Vérification :

  - **RED prouvé** avant le correctif : d'abord à la compilation (la dépendance n'existait pas),
    puis 3 rouges de comportement une fois le type en place.
  - **Mutation appliquée et vérifiée — 5 réversions, 5 rouges** : retraction jamais appelée (3),
    retraction déplacée après la sortie de room (1), id brut relayé à la place du normalisé (1),
    `try/catch` local retiré (1), et l'extraction rendue injoignable depuis `typing:stop` (10 rouges
    sur les suites StatusHandler, qui prouvent que le chemin d'origine passe bien par elle).
    Restauré, re-vérifié vert.
  - **Suite gateway complète : 654/654 suites, 16 491 tests verts** (baseline au même commit :
    16 486 — les 5 tests neufs).
  - `tsc --noEmit` gateway : **0 diagnostic avant comme après**.

- 6baa30e: Deux compteurs de lecture qui mentaient : la synchro multi-appareils d'iOS, et le badge d'un invité de lien partagé

  Deux défauts indépendants, même symptôme pour l'utilisateur — un compteur de non-lus
  qui ne bouge pas quand il devrait, ou qui retombe à zéro quand il ne devrait pas.

  ## 1. `mark-read` diffusait un `read-status:updated` amputé

  `POST /conversations/:id/mark-read` construisait son payload sans `lastReadAt` ni
  `unreadCount`. Or `ReadStatusUpdatedEventData` les déclare comme une **paire** sur
  `type: 'read'`, et le contrat dit explicitement qu'un consommateur « les applique
  ensemble ou pas du tout ». iOS le fait à la lettre :

  ```swift
  guard event.type == "read",
        let lastReadAt = event.lastReadAt,
        let unreadCount = event.unreadCount else { return }
  ```

  Un payload amputé n'est donc pas appliqué partiellement — il est **silencieusement
  jeté**. Et c'est précisément cette route que poste `ConversationService.markRead`, le
  transport de lecture primaire d'iOS : **la synchronisation de lecture multi-appareils
  d'iOS ne partait jamais**. Lire une conversation sur son iPhone ne descendait pas le
  badge sur son iPad. La route jumelle (`message-read-status.ts`) envoyait le couple
  correctement depuis toujours — le défaut était la divergence entre deux routes qui
  doivent dire la même chose.

  Le couple est désormais résolu **une fois et utilisé deux fois** : il accompagne la
  diffusion, et il alimente la remise à zéro du badge, qui faisait jusqu'ici son propre
  `getUnreadCount`. Une requête de moins par marquage de lecture. Il ne voyage que sur un
  `read` — seule action qui avance un curseur de lecture ; un `received` (distribution) ne
  déplace jamais `lastReadAt`. Le payload est en outre typé `ReadStatusUpdatedEventData`
  au lieu d'être structurellement libre.

  ## 2. Un invité de lien partagé voyait toujours `unreadCount: 0`

  `GET /conversations/:id` recalculait le compteur avec un
  `where: { conversationId, userId, isActive: true }` **écrit à la main**. Pour un invité
  de lien partagé, `authContext.userId` porte un `Participant.id` (branche anonyme
  d'`UnifiedAuthService`) : la clause comparait un id de participant à la colonne `userId`,
  ne matchait rien, et le compteur retombait à `0` — un `0` qui **écrasait ensuite le badge
  que le socket venait de pousser juste**. Le badge d'un invité ne pouvait donc que
  disparaître à chaque ouverture de la conversation.

  `resolveCallerParticipant` existe exactement pour ce site : sa précédence
  (`participantId` avant `userId`) est celle de `canAccessConversation`, donc l'accès et le
  comptage ne peuvent plus diverger sur l'identité de l'appelant. Le helper exclut de plus
  les participants bannis, ce que la clause manuelle ne faisait pas.

  ## Vérification

  - **RED prouvé pour chacun** en réintroduisant le défaut : le couple retiré du payload →
    2 rouges ; la clause manuelle restaurée → 1 rouge. Restaurés, re-vérifiés verts.
  - Le double de base de données du test d'invité ne répond **que sur la colonne
    interrogée** — une clause `{ userId: <participant id> }` n'y matche rien, comme en base.
    Et le module d'access-control n'y est plus stubbé que sur `canAccessConversation` : la
    vraie règle de précédence est exercée, pas un mock qui la répète.
  - Suite gateway complète verte, `tsc --noEmit` gateway : 0 diagnostic.

## 1.25.3

### Patch Changes

- 34383f0: Un `typing:stop` retracte ce que ce socket a réellement diffusé — et ne coûte plus rien quand il n'a rien à retracter

  `handleTypingStop` reconstruisait depuis zéro tout ce que `handleTypingStart` avait déjà établi :
  `resolveParticipant` (participation), `shouldShowTypingIndicator` (préférence), puis
  `_resolveTypingIdentity` (identité), avant de consulter enfin l'état de suivi `activeTypers`. Or
  `activeTypers` EST l'enregistrement exact de ce qui a été diffusé — `_trackTyping` ne s'exécute que
  sur un start ayant franchi ces mêmes portes. Le commentaire du fichier énonçait déjà la règle (« A
  stop must retract exactly what a prior start broadcast, so the handler proceeds on tracking state —
  NOT the live preference ») ; il ne l'appliquait qu'à moitié. L'entrée de suivi est désormais à la
  fois l'autorisation, l'audience et la charge utile de la retraction, et rien ne la surcharge.

  Trois conséquences, chacune verrouillée par un test.

  **Amplification.** `typing:start` est limité en débit (`SOCKET_RATE_LIMITS.TYPING_INDICATOR`),
  `typing:stop` ne l'est pas. Un stop sans start correspondant dépensait pourtant `resolveParticipant`

  - la lecture de préférence + la requête des viewers bloqués (`participant.findMany` puis la requête
    de blocage), puis diffusait une retraction fantôme à **tous** les sockets de la conversation : un
    paquet client non throttlé achetait trois allers-retours base + un fan-out N-way. Le socket qui n'a
    rien diffusé n'a rien à reprendre : on sort avant toute I/O. La borne de débit manquante devient
    sans objet plutôt que d'être ajoutée — un limiteur sur `typing:stop` aurait jeté de vraies
    retractions, ce qui est précisément le défaut qu'on ne veut pas.

  **Indicateur fantôme.** Re-vérifier la participation sur le chemin du stop ne pouvait que REFUSER de
  reprendre ce que les pairs voyaient déjà. Un participant désactivé en cours de frappe (retrait par
  un admin) voyait donc son stop rejeté, son entrée `activeTypers` fuir, et ses pairs garder « X est
  en train d'écrire… » jusqu'à la déconnexion du socket. Même classe de défaut que celui déjà corrigé
  pour la préférence qui bascule en cours de rafale — la même cause, l'autre porte.

  **Identité de la retraction.** Le stop ré-interrogeait l'identité au lieu de reprendre celle sous
  laquelle le start était parti. Le cache masquait le coût jusqu'à son invalidation (une édition de
  profil) : après renommage en cours de rafale, le start partait sous « Alice S » et le stop sous
  « Alice Renamed » — une retraction désignant quelqu'un que les pairs n'ont jamais vu. L'entrée de
  suivi porte déjà `username`/`displayName` ; elle les rend, sans lookup.

  Les tests qui appelaient `handleTypingStop` sans start préalable ont été corrigés plutôt que
  contournés : un stop sans start n'est pas une scène de fond, c'est un cas distinct — désormais
  couvert explicitement, dans les deux fichiers de suite.

## 1.25.2

### Patch Changes

- 778e96c: Un invité de lien partagé peut enfin acquitter ses messages — son badge de non-lus ne pouvait jusqu'ici que monter

  Le serveur soutenait déjà la MOITIÉ anonyme du suivi de lecture, et délibérément :
  `MessageReadStatusService.getUnreadCount` résout aussi bien un `Participant.id` qu'un `User.id`,
  `emitUnreadCountsToRecipients` adresse `ROOMS.user(userId ?? id)`, et `AuthHandler` fait rejoindre
  cette room aux sockets anonymes précisément « because joining anything else had already left
  anonymous participants without their unread badge ». Le compte était donc tenu, et poussé.

  L'autre moitié — celle qui REMET LE COMPTEUR À ZÉRO — était fermée deux fois :

  1. **La porte.** `message-read-status.ts` et les trois routes de lecture de `conversations/messages.ts`
     (`mark-read`, `read`, `mark-unread`) portaient `allowAnonymous: false` : 403 avant même de
     regarder la conversation. Elles acceptent désormais un appelant **authentifié sans compte** —
     `requireAuth: true` reste, un appelant sans jeton n'entre toujours pas. C'est la règle que
     `routes/reactions.ts` applique depuis toujours (« Les anonymes peuvent aussi réagir ») et que le
     POST d'envoi de message applique aussi : l'invité écrivait et réagissait, il ne pouvait pas lire.

  2. **La clé.** Les six gardes d'appartenance de ces routes filtraient `Participant.userId` avec
     `authContext.userId`, qui **vaut un `Participant.id`** pour un anonyme (`middleware/auth.ts`,
     branche anonyme : `userId: participant.id`). La comparaison n'appariait donc rien : la garde ne
     sautait pas une ligne inexistante, elle rendait invisible une ligne qui existe. Les six passent
     par un `resolveCallerParticipant` unique, dont la précédence (`participantId` d'abord, `userId`
     ensuite) est celle de `canAccessConversation`, dans le même fichier — les deux réponses ne
     peuvent plus diverger sur l'identité de l'appelant.

  Effets de bord réparés au passage : les préférences de confidentialité d'un anonyme sont désormais
  demandées EN TANT QU'anonyme (`shouldShowReadReceipts(userId, isAnonymous)` — trois sites codaient
  `false` en dur sous le commentaire « les utilisateurs authentifiés ne sont pas anonymes ici », qui
  n'était vrai que parce que la porte était fermée) ; `mark-unread` ne relit plus deux fois le même
  participant ; et `GET /messages/:messageId/read-status` cesse de filtrer l'appartenance EN RELATION,
  la cinquième copie de la règle.

  Le client iOS envoie déjà `X-Session-Token` sur ses appels REST (`APIClient.swift`) et appelle
  exactement `/conversations/:id/mark-read` et `/mark-unread` : le suivi de lecture des invités y
  fonctionne dès ce correctif, sans une ligne de Swift. La webapp, elle, avait débranché son propre
  suivi pour les sessions anonymes (`bubble-stream-page.tsx`, « la route mark-as-read est JWT-only ») ;
  le rebrancher demande d'abord que `apiService` porte `X-Session-Token`, ce qu'il ne fait pas encore.

## 1.25.1

### Patch Changes

- ac3c088: L'enrichissement d'une pièce jointe (transcription, audio traduit) atteint enfin les lecteurs qui ne sont pas dans le fil

  `message:attachment-updated` — le delta émis quand Whisper finit de transcrire une note
  vocale, puis quand NLLB+Chatterbox rendent chaque langue d'audio traduit — n'était diffusé
  que dans la room `conversation:<id>`. Deux audiences le perdaient :

  - **Le lecteur resté sur la liste de conversations.** iOS ne rejoint une room de
    conversation qu'à l'OUVERTURE du fil : au lancement de l'app, un lecteur sur la liste
    n'est dans aucune room de conversation. Son SDK applique pourtant ce delta sans regarder
    quel fil est ouvert (`ConversationSyncEngine.handleAttachmentUpdated` patche le message
    en cache de n'importe quelle conversation) — la room personnelle n'est donc pas une
    audience plus large pour le principe, c'est l'endroit où l'écriture atterrit vraiment.
  - **Le lecteur hors ligne.** Le `message:new` mis en file à l'ENVOI porte la pièce jointe
    telle qu'elle était alors : sans transcription, sans audio traduit, les deux arrivant une
    à deux secondes plus tard. Sans rejeu de l'enrichissement, la copie rejouée à la
    reconnexion reste définitivement celle-là.

  Même classe de défaut que l'aperçu de liste qui ne se retraduisait jamais : le Prisme
  (« il s'applique à TOUT le contenu, transcriptions audio comprises ») dépendait de la
  ROUTE du lecteur — avoir le fil ouvert au moment où Whisper a fini — et non de ses
  préférences de langue.

  L'émission chaîne désormais la room de conversation et les rooms personnelles de tous les
  participants (une seule copie par socket, `emitToConversationParticipants`), et met
  l'enrichissement en file pour les participants hors ligne sous le nouveau
  `eventType: 'attachment-updated'`, rejoué en `message:attachment-updated` à la
  reconnexion. La clé de dédup est l'id de la PIÈCE JOINTE : l'identité par défaut
  `(messageId, eventType)` ferait superséder l'enrichissement de la première pièce jointe
  par celui de la seconde sur un message à deux audios. Le payload n'est pas filtré par
  langue du destinataire — les clients REMPLACENT la carte de traductions de la pièce
  jointe, donc un sous-ensemble par lecteur effacerait les langues déjà en cache.

  Une panne de la requête participants dégrade vers la room de conversation seule (l'audience
  d'avant), jamais vers le silence.

- ac3c088: Une page delta de conversations tronquée se rattrape au lieu de sauter des lignes

  `GET /conversations?updatedSince=` plafonne à 100 lignes et triait par `lastMessageAt`
  décroissant — l'ordre de l'écran de liste, sans aucun rapport avec le filtre. Une fenêtre
  de synchronisation ayant touché plus de 100 conversations rendait donc une page tronquée
  dont les lignes coupées n'étaient pas « les moins récemment mises à jour ». Les deux
  clients avancent pourtant leur watermark au max des `updatedAt` REÇUS : les lignes coupées
  étaient enjambées définitivement, jusqu'à la réconciliation complète (1×/24 h sur iOS).
  Entre-temps la liste affichait des compteurs de non-lus et des aperçus périmés sans qu'aucun
  signal ne l'indique.

  Une page delta est désormais triée par `updatedAt` croissant (`id` départage les égalités) :
  les lignes coupées sont exactement celles d'`updatedAt` supérieur à la dernière ligne
  rendue, donc le watermark qui les enjambait pointe dessus et l'appel suivant les rend. La
  troncature devient une pagination naturelle, sans aucun changement client. Une page
  ordinaire (sans `updatedSince`) garde l'ordre de récence.

  Reste à la charge des clients, et le web le couvre déjà (`DELTA_PAGE_LIMIT` ⇒ relecture
  complète) : plus de 100 conversations portant la MÊME milliseconde d'`updatedAt` débordent
  d'une page que la borne stricte `gt` ne peut pas reprendre.

- Updated dependencies [ac3c088]
  - @meeshy/shared@1.10.2

## 1.25.0

### Minor Changes

- Changements automatiques détectés :

  - une notification manquée l'était pour la session entière — le web ignorait `_seq` (#2844)
  - deuxieme widget ecran d'accueil — conversations recentes (#2841)
  - CallNotification no longer orphans the ringtone on fast unmount (#2843)
  - déclare `userUpdated` sur `MessageSocketProviding` — main était rouge

## 1.24.1

### Patch Changes

- 70a0e04: user:updated — les composants du nom voyagent en groupe, et iOS applique enfin l'événement

  La gateway diffusait `user:updated` à tous les contacts depuis des mois ; le web
  l'appliquait, iOS n'avait aucun listener. Un interlocuteur qui changeait d'avatar
  ou de nom restait figé sur la ligne de liste, l'en-tête et le sélecteur de
  transfert jusqu'au prochain refetch complet.

  Le payload envoie désormais les quatre composants du nom ensemble
  (`displayName`, `firstName`, `lastName`, `username`) dès que l'un change : un
  delta partiel est irrecomposable chez un client qui ne stocke que le nom déjà
  composé. `null` y signifie EFFACÉ, seule façon de faire retomber le nom sur le
  composant suivant.

- Updated dependencies [70a0e04]
  - @meeshy/shared@1.10.1

## 1.24.0

### Minor Changes

- Changements automatiques détectés :

  - reinitialise isPaused au changement de story pour eviter un gel permanent
  - convertit la duree audio ms->s avant formatDuration sur la tuile PostCard
  - purge 39 cles orphelines du catalogue, adapte MiniAudioPlayerBar a la relance de tete, etend le timeout AuthService
  - release.yml ne tourne plus sur dev — stoppe les bumps/tags fantomes qui bloquaient la release de main
  - réconcilie l'échec silencieux du serveur (success:true, attachments tronqués)
  - live mood-emoji badge on the Contacts list avatars
  - retombe sur la durée client quand ffprobe échoue pour une vidéo
  - expose l'erreur d'upload via l'API du hook
  - purge selectedFiles sur échec d'upload image/vidéo
  - l'ouverture cesse d'avaler la fermeture dans l'aperçu du composer
  - corrige le double comptage de la limite d'attachments
  - extrait la durée média côté client et la transmet à l'upload
  - archives Xcode Cloud signées avec entitlements + boot DB jamais fatal (crash-loop macOS build 1750)
  - CallDetailSheet uses per-caller accentColor, not hardcoded indigo500
  - migre 5 sites SDK restants vers adaptiveOnChange
  - l'effectif de la ligne de liste — compté par la base, et convergent en temps réel
  - signalement gated par auteur sur les réels et le hashtag (revue #3)
  - repost story gated PUBLIC + partage ne ment plus au clic annulé (revue #1 et #2)
  - restore background+foreground video/audio playback in the story viewer (#2818)
  - repost minimal des stories via « Republier » (point 4)
  - téléchargement média sur PostCard/PostDetail/ReelPlayer (point 3)
  - survol continu entre tuiles (fallback nearest-X borne), reset scrub au changement de slide, doc pulse
  - partage enrichi via lien traçable + navigator.share (point 2)
  - repost sur ReelPlayer (point 1)
  - active le payoff de l'optimistic media (point 0bis)
  - câble le report hérité sur les 5 dernières surfaces (point 0)
  - l'effectif de la ligne de liste peut enfin AUGMENTER
  - l'effectif d'un groupe cesse de bouger à chaque ouverture ou fermeture de fil
  - unrelated call:ended no longer dismisses a ringing call (web) + iOS retain-cycle convention + dead-code removal (#2815)
  - le picker de réaction story met en pause l'auto-advance
  - hard-press conversation preview popover (#2813)
  - aligner coordinateSpace scrub sur le pin de taille, identite par vol, sentinelles reaction a jour
  - brancher un point d'entrée UI pour le signalement (point 2)
  - exposer l'audience du post audio
  - tap coeur direct, scrub longpress, vol de reaction, big reaction retiree
  - corrige les commentaires obsolètes et localise le toggle Reel/Post
  - inclure les médias dans le post optimiste
  - brancher les réactions story sur le viewer
  - PostComposer — toggle Reel ⇄ Post sur composition qualifiante
  - add report services for posts and stories
  - invalidate post detail cache on bookmark/unbookmark
  - hisse l'extraction du tri-état en fonction nommée
  - la ligne de liste applique le Prisme reçu par conversation:updated
  - change email / phone with two-step verification (#2808)
  - StoryLanguageQuickBar scrubbable (survol + cadres publies)
  - EmojiReactionPicker scrubbable (survol + publication des cadres, parametres opaques)
  - PostComposer — cap média fiable + fuite de blob URLs
  - resolver pur de survol scrub + espace de coordonnees partage
  - audioPlayerObjects embarque placement/volume/waveformSamples (decode iOS)
  - PostsFeedScreen relaie mediaIds et visibilityUserIds
  - câble l'upload média (photo/vidéo) sur PostComposer
  - root-space bars/flight offset, repeat-reaction flight, exclusive rail bars
  - storyEffects embarque mediaObjects/audioPlayerObjects (parité iOS)
  - scrub de reactions/langues au longpress + vol vers le coeur, strip du bas retiree
  - prevent tap double-fire on static long-press with guard flag
  - rail lateral coeur+langue avec tap et flux de scrub longpress
  - LanguageQuickStrip scrubbable (chips drapeau, actif souligne)
  - EmojiQuickStrip scrubbable (survol + bounds, parametres opaques)
  - langues disponibles + override de langue ephemere dans le viewer
  - override de langue (Exploration) dans la resolution Prisme des stories
  - plan du rail lateral (react + langue) en parite iOS
  - resolver pur de survol scrub (hit-test + action au relachement)
  - un événement pour l'ADHÉSION, et les trois routes d'appartenance atteignent les écrans de liste
  - PostService consomme qualifiesAsReel depuis @meeshy/shared
  - le renommage et la clôture d'une conversation atteignent les écrans de LISTE
  - qualifiesAsReel devient la source unique partagée

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.10.0

## 1.23.0

### Minor Changes

- Changements automatiques détectés :

  - après une édition, la ligne de liste affichait le texte d'avant (#2802)
  - restore two-factor authentication (gateway route exists) (#2805)
  - ravive la carte Now Playing après un vol de lecture transitoire + polis AirPlay
  - traduit le bouton AirPlay du plein écran audio dans les 7 langues
  - bouton AirPlay dans le plein écran audio
  - per-post language override for the Feed post composer (#2804)
  - useCallAnalyticsReporter's reconnection counter could never increment
  - attach device location to a Feed post composer (#2801)
  - migre 5 NavigationView vers NavigationStack (soft-dépréciée iOS 16+) (#2798)
  - épingler un message traduit rendait la route d'épingles inexploitable
  - enableVideo()/switchCamera() snapshot connected peers before getUserMedia, dropping late joiners
  - addLocalMedia clones outgoing video track instead of sharing it across peers (#2790)
  - TUS uploads resume from the last confirmed chunk on retry (feature-parity §Q) (#2795)
  - OutboxFlushWorker never discovered per-conversation message lanes (#2794)
  - l'aperçu de liste servi par socket pouvait afficher un cryptogramme (#2789)
  - Feed post composer audio attachment (feature-parity §F) (#2791 follow-up) (#2792)
  - real MediaRecorder capture for chat voice-recording pill (feature-parity §Q) (#2791)
  - attribue l'audio d'un post cité au bon auteur sur la carte Now Playing
  - feed, commentaires et posts audio passent par le coordinator Now Playing
  - stabilise l'abonnement audio du bouton scroll-to-bottom
  - le bouton scroll-to-audio démarre la file du coordinator
  - playKeepingQueue préserve la file au swipe plein écran, playVariant survit à la reprise d'appel
  - le plein écran audio fusionne dans le coordinator (carte + file + variantes)
  - termine le background task d'avance de file bloquée par le garde CallKit
  - fixture d'appel avec discriminant kind, mocks partagés du target, await GRDB async
  - la greffe store se limite à userState+suppressions — un snapshot en retard réécrivait un rename frais
  - l'avance de file audio est couverte par un background task
  - résorbe les deux warnings d'intégration (await inutile, résultat de write ignoré)
  - la file audio en pause garde sa carte Now Playing en background
  - un instantane store VIDE est un teardown, pas N suppressions
  - ne jamais confondre un avis d'appel avec une edition, armer aussi sur iPad
  - patcher les traductions temps reel sous TOUTES les cles de cache
  - persister les moods temps reel et abonner status:unreacted
  - armer le pont de persistance app-wide et persister le media de commentaire
  - route la tray vers la gestion pour les stories passées sans story active
  - persister conversation:updated/deleted et les mutations de message hors conversation ouverte
  - affiche la progression d'export en cours sur les cards « Mes stories »
  - carte Now Playing avec date du vocal et position de file
  - relance la lecture de la timeline après un export (fin/échec/annulation)
  - allonge les interludes de lecture à 1,2 s et lie l'export à la SSOT
  - corrige le flip vertical du fond dans StoryStaticSnapshot
  - icone de telechargement media coherente avec la convention
  - désarme la reprise d'interruption sur retrait AirPods et suspension d'appel
  - seedMediaConsumption alimente les stores de reprise audio/video
  - frappe hors conversation dans la pastille de synchronisation
  - reprise de lecture video via VideoPlaybackPositionStore
  - VideoPlaybackPositionStore, miroir strict d'AudioPlaybackPositionStore
  - lecture instantanee a l ouverture, au bas atteint et au bouton
  - pourcentage + barre de progression par participant dans mediaConsumptionCard
  - promotion immediate de l accumulateur de lecture, retrait du code mort
  - pause/reprise de l'audio de conversation sur interruption système
  - decode position/pourcentage sur attachment-status:updated et alimente MediaConsumptionStore
  - le moteur du coordinator audio devient Now Playing éligible (.content)
  - profils de session audio avec pause/reprise et plomberie moteur
  - l'écho REST de message:new ne portait pas le clientMessageId
  - le chemin socket sérialisait les traductions dans une forme qu'iOS ne peut pas décoder (#2793)
  - transporte position/durée/pourcentage sur attachment-status:updated

## 1.22.24

### Patch Changes

- b3d6ebe: La recherche de conversations servait la dernière ligne de liste restée hors
  Prisme Linguistique.

  `GET /conversations/search` construit son `lastMessage` à la main. Son `include`
  Prisma rapportait déjà `Message.translations` et `Message.originalLanguage` — ce
  sont des colonnes du même document Mongo, aucun `select` restrictif ne les
  excluait — mais le mapping manuel les jetait : la donnée était payée puis perdue,
  exactement comme `metadata.location` avant le Lot 3. Un lecteur francophone
  cherchant une conversation lisait « Hello » dans le résultat et « Bonjour » dans
  sa liste, pour le même message.

  La réponse porte désormais `lastMessageOriginalLanguage` et
  `lastMessageTranslations`, construits par le même
  `buildLastMessagePreviewTranslations` et le même `resolveUserLanguagesOrdered`
  que `GET /conversations` — `conversationMinimalSchema` les déclarait déjà.
  L'aperçu original est tronqué à la même borne : sans cela, le poids de la ligne
  aurait dépendu de la langue du lecteur, la carte traduite étant plafonnée et
  l'original non.

  Côté iOS, la ligne de résultat de recherche résout enfin via
  `resolvedLastMessagePreview` au lieu de rendre l'aperçu brut — même texte que
  `ThemedConversationRow`, sur les deux chemins (cache local et réseau).

## 1.22.23

### Patch Changes

- Updated dependencies [fcc82a6]
  - @meeshy/shared@1.8.13

## 1.22.22

### Patch Changes

- 6df3fac: Un message envoyé par lien de partage n'arrivait en temps réel sur aucun client mobile.

  `link:message:new` n'a jamais eu qu'un seul auditeur : le web. iOS
  (`MeeshySDK/Sockets/MessageSocketManager.swift`) et Android
  (`sdk-core/socket/MessageSocketManager.kt`) n'enregistrent qu'un listener de création,
  `message:new`. Or l'envoi par lien est le **seul** transport d'envoi dont dispose un participant
  anonyme : un invité qui écrivait dans une conversation partagée n'apparaissait donc chez aucun
  membre iOS ou Android — ni en direct par la room, ni au reconnect par la file hors ligne, qui
  rejouait ce même event unique. Le message ne surgissait qu'au prochain refetch complet, que rien
  ne déclenchait.

  Les deux diffuseurs — la room live (`broadcastLinkMessage`) et le rejeu hors ligne
  (`MeeshySocketIOManager._drainPendingMessages`) — passent désormais par un seul point d'appel
  public, `linkMessageEmissions`, qui met les **deux** events sur le fil, chacun dans sa forme :
  `link:message:new` garde son enveloppe `{ message }`, `message:new` transporte le message
  lui-même. Rejouer l'enveloppe sous `message:new` aurait donné aux clients mobiles un payload sans
  `conversationId` au premier niveau, donc non routable.

  Additif, jamais substitutif : le web continue de recevoir l'event qu'il écoute déjà. Les deux
  copies portent le même `id` et les deux gestionnaires web dédupent dessus, donc le second arrivé
  est un no-op quel que soit l'ordre ; la pastille de non-lus ne se déduit d'aucun des deux (valeur
  absolue de `conversation:unread-updated`), il n'y a rien à double-compter.

- Updated dependencies [6df3fac]
  - @meeshy/shared@1.8.12

## 1.22.21

### Patch Changes

- f2c0708: Le Prisme Linguistique s'applique enfin à l'aperçu de la liste de conversations.

  `GET /conversations` ne transportait ni les traductions du dernier message ni sa
  langue d'origine : la ligne de liste restait dans la langue de l'expéditeur pour
  tout le monde, à chaque démarrage à froid. Le résolveur client existait pourtant
  (`MeeshyConversation.resolvedLastMessagePreview`), et sa documentation attendait
  explicitement ce câblage serveur.

  La réponse porte désormais, au niveau conversation, `lastMessageOriginalLanguage`
  et `lastMessageTranslations` — une carte `{ langue: aperçu }` restreinte aux
  langues du prisme du LECTEUR (`resolveUserLanguagesOrdered`), tronquée au même
  plafond que `lastMessage.content`, débarrassée des traductions chiffrées et de la
  langue d'origine (qui EST déjà `lastMessage.content`). `null` quand il ne reste
  rien, pour que le client retombe sur l'original — règle #3 du Prisme.

  Coût nul côté base : `Message.translations` est une colonne JSON du même
  document, pas une relation.

- Updated dependencies [f2c0708]
  - @meeshy/shared@1.8.11

## 1.22.20

### Patch Changes

- f57ae9d: Les participants anonymes venus par lien de partage se voyaient refuser l'accès à leur propre conversation, et demander un nouveau lien magique ou un nouveau lien de réinitialisation ne révoquait jamais le précédent.

  Quatre lectures gardaient un état « pas encore » par une égalité à `null` sur une colonne
  qu'aucun créateur n'écrit. Sur le connecteur MongoDB de Prisma, un champ optionnel absent du `create`
  n'est pas écrit dans le document : le filtre `{ champ: null }` — une égalité — ne l'apparie pas. C'est
  le piège qui avait déjà vidé feed / reels / stories en production (post-mortem en tête de
  `services/posts/softDelete.ts`) et fait no-op 100 % des bascules média d'appel
  (`CallService.initiateCall`).

  - **`canAccessConversation` refusait tous les anonymes.** Aucun des neuf créateurs de `Participant`
    n'écrit `bannedAt` ; `{ bannedAt: null }` n'appariait donc que les rares lignes qu'un
    débannissement avait remises à zéro. Comme seul un contexte d'auth anonyme porte un
    `participantId`, cette porte était fermée à tout arrivant par lien de partage — 403
    « Unauthorized access to this conversation » sur la lecture des messages, l'envoi, les fils, les
    statistiques et la liste des participants. La garde reste en place et reste porteuse : un
    bannissement écrit bien `isActive: false`, mais une restauration de compte rallume `isActive` sans
    regarder `bannedAt`.
  - **`PasswordResetService.revokeExistingTokens` et son jumeau magic-link n'atteignaient aucun
    jeton.** `create` ne renseigne pas `usedAt`, donc la colonne est absente de tout jeton encore
    vierge — soit exactement ceux que la révocation existe pour annuler. Chaque demande laissait la
    précédente valide jusqu'à son expiration, et `revokedReason: 'NEW_REQUEST'` n'a jamais été écrit.
  - **Le rattachement d'un lien de tracking à son message n'écrivait rien.** La réécriture crée le
    lien avec un `messageId` encore indisponible, donc omis ; le filtre `{ messageId: null }` du
    rattachement post-envoi ne retrouvait pas le lien qu'elle venait de créer.
  - **Le compteur `activeTokens` du balayage des jetons périmés rendait toujours 0.**

  Le prédicat de lecture porte désormais un nom et couvre les DEUX états « pas encore » — colonne
  absente et colonne explicitement nulle : `unsetOrNull(champ)` (`utils/prisma-unset.ts`), pendant côté
  lecture du `LIVE_MESSAGE_MARK` côté écriture. Contrairement à une discipline d'écriture, il répare
  aussi les lignes DÉJÀ en base.

  Les témoins de ces quatre clauses les jugent maintenant en les APPLIQUANT à des documents
  (`__tests__/helpers/mongo-where.ts`, qui honore la règle « absent ≠ null ») au lieu de les comparer à
  une copie de la clause attendue — un double ordinaire rend ce qu'on lui dit de rendre, et c'est
  ainsi que ce piège avait traversé des suites vertes.

## 1.22.19

### Patch Changes

- 437557d: Les messages d'appel entraient en base sans la colonne que toutes les lectures de messages vivants interrogent — ils étaient invisibles de l'aperçu de conversation, du compte de non-lus et du delta `/sync`.

  Le modèle `Message` résout le piège MongoDB du soft-delete par le côté ÉCRITURE : ses ~119 lectures
  filtrent `deletedAt: null`, et c'est chaque créateur qui rend ce filtre vrai en écrivant explicitement
  la colonne à `null`. Sur le connecteur MongoDB de Prisma, une colonne `DateTime?` jamais écrite est
  ABSENTE du document et n'apparie pas ce filtre — c'est le même piège qui, du côté LECTURE, avait vidé
  feed / reels / stories en production (post-mortem en tête de `services/posts/postIncludes.ts`).

  Cette convention n'était portée par aucun nom : sept `message.create` répartis dans six fichiers
  répétaient le littéral, et **deux d'entre eux l'avaient perdu** — `createCallSummaryMessage` et
  `createLiveCallMessage`. Les lignes qu'ils écrivaient n'étaient appariées par aucune des lectures
  gardées par ce filtre :

  - `emitConversationPreviewUpdate` — un « Appel audio en cours » ou un « Appel manqué » ne devenait
    jamais l'aperçu de la conversation ; la liste affichait le message précédent ;
  - `MessageReadStatusService` — un résumé d'appel ne faisait monter aucun badge de non-lus ;
  - le delta `/sync` — les messages d'appel n'étaient jamais livrés à la synchronisation incrémentale ;
  - l'admission d'édition, de suppression et de réaction (`{ id, deletedAt: null }`) — un message
    d'appel était introuvable, donc non réactionnable ;
  - les statistiques de conversation, qui ne les comptaient pas.

  Les sept créateurs étalent désormais une seule constante nommée, `LIVE_MESSAGE_MARK`
  (`services/messaging/liveMessage.ts`), jumeau côté écriture du `NOT_DELETED` côté lecture du modèle
  `Post`. L'invariant a maintenant un endroit où être écrit une fois et un nom à chercher avant
  d'ajouter un huitième créateur.

## 1.22.18

### Patch Changes

- 16f2a75: Le budget d'un message à vue unique se dépense enfin par SPECTATEUR, et non par ouverture.

  `POST /conversations/:id/messages/:messageId/consume` incrémentait `Message.viewOnceCount` à chaque
  appel, sans condition et sans clé d'idempotence. Le compteur mesurait donc des OUVERTURES, alors que
  tout ce qui le lit — `isFullyConsumed`, l'annonce `message:consumed` diffusée à la room, la
  disparition du média chez les clients — le lit comme un nombre de SPECTATEURS.

  Dans un groupe où l'émetteur a posé `maxViewOnceCount: 2`, le premier destinataire qui rouvre la
  photo deux fois portait `isFullyConsumed` à vrai ; la route l'annonçait à toute la conversation, et
  le second destinataire perdait un média qu'il n'avait jamais ouvert. Un simple rejeu de la requête —
  file hors-ligne, double tap, retry réseau — produisait le même effet à lui seul.

  **La donnée qui rend le compte exact était déjà écrite par ce même gestionnaire, deux instructions
  plus bas** : `MessageStatusEntry.viewedOnceAt`, par participant. Écrite, jamais relue. Elle devient
  la revendication (`services/messaging/recordViewOnceConsumption.ts`), et l'incrément n'en est plus
  que la conséquence.

  La revendication est GARDÉE côté base plutôt que décidée après une lecture : deux ouvertures
  simultanées du même spectateur liraient toutes deux « pas encore vu ». C'est l'`updateMany` filtré
  qui tranche, et quand il n'apparie rien, c'est la création qui distingue l'entrée absente (première
  consommation) de l'entrée déjà estampillée (conflit `@@unique([messageId, participantId])`). Son
  prédicat apparie les DEUX états « pas encore vu » — colonne absente autant que présente-et-nulle —
  parce qu'une entrée créée par la livraison n'écrit jamais `viewedOnceAt` et que
  `{ viewedOnceAt: null }` seul ne l'apparie pas sur le connecteur MongoDB de Prisma.

  Deux corollaires :

  - **Un spectateur anonyme laisse enfin sa trace.** `authContext.userId` porte un jeton de session
    pour un anonyme : la recherche par `userId` ne trouvait jamais sa ligne, si bien qu'il dépensait
    le budget sans qu'aucune entrée de statut l'enregistre — et pouvait donc le dépenser
    indéfiniment. La résolution suit désormais l'ordre de `canAccessConversation`, dont le succès
    garantit qu'une ligne de participant existe.
  - **L'annonce ne part plus sur un rejeu.** Rediffuser un compte identique à toute la room ne dit
    rien à personne et ferait clignoter chez les pairs un événement qui ne correspond à aucune
    ouverture nouvelle.

  La route emploie enfin `ROOMS.conversation()` et `SERVER_EVENTS.MESSAGE_CONSUMED` au lieu d'un nom
  de room et d'un nom d'événement écrits à la main — même valeur, une source de moins à tenir à jour.

## 1.22.17

### Patch Changes

- a7427af: Supprimer un commentaire annonce enfin le fil qu'il emporte — ses réponses restaient à l'écran, et rien ne les en enlevait jamais.

  `PostCommentService.deleteComment` soft-delete le SOUS-ARBRE ENTIER depuis le cycle qui a corrigé
  l'invariant de `commentCount` : la cible et tous ses descendants, sur la même liste d'ids, et le
  retrait des notifications porte déjà sur cette même liste. Mais cette liste mourait dans la méthode —
  la valeur de retour ne disait que `{ success: true }`.

  Son seul appelant, la route `DELETE /posts/:postId/comments/:commentId`, n'avait donc rien d'autre à
  annoncer que la cible : `broadcastCommentDeleted` partait avec le seul `commentId`. Chez tout client
  qui avait déplié les réponses du commentaire supprimé, ces réponses restaient affichées — des lignes
  que le serveur venait de retirer.

  **Et aucun rechargement ne les enlevait.** `getComments` filtre `parentId: null` : le parent
  supprimé n'est plus rendu, donc `getReplies` n'est plus jamais appelé pour ses réponses. Le fil ne
  se nettoyait qu'au rechargement complet de la page. Le compteur, lui, était juste depuis le début —
  il voyage en ABSOLU (`commentCount`), donc l'écran affichait « 3 commentaires » au-dessus de quatre
  lignes visibles.

  **Le correctif tient en une liste qui remonte.** `deleteComment` rend désormais
  `deletedCommentIds` — exactement la liste qu'il a soft-deletée, jamais une seconde dérivation (après
  le soft-delete, la reconstruire demanderait de relire des lignes que `NOT_DELETED` masque
  désormais). La route la place dans le payload, et le web en purge tous ses caches de commentaires
  d'un coup, réponses comprises.

  Le web était le SEUL client à montrer ce défaut. iOS (`repliesMap[id] = nil` +
  `expandedThreads.remove(id)`) et Android (`CommentRepliesState.removedThread`) compensaient déjà,
  chacun par sa propre traversée locale — deux re-dérivations indépendantes d'une liste que le serveur
  connaissait et taisait. `deletedCommentIds` les rend caduques : c'est le gain de fond, au-delà du
  défaut visible sur le web.

  `CommentDeletedEventData.deletedCommentIds` est **optionnel** pour rester additif : iOS et Android
  gardent le comportement d'avant sans changer une ligne. Un client qui le lit se replie sur
  `[commentId]` quand il est absent — c'est le cas du rejeu idempotent (`onDuplicate`), qui ne rend
  qu'un `{ id }` parce que la suppression a déjà eu lieu et que son sous-arbre n'est plus
  reconstructible par une lecture vivante. Le repli reproduit exactement le comportement d'avant ce
  correctif ; une liste vide, elle, ferait survivre la cible elle-même à l'écran.

- Updated dependencies [a7427af]
  - @meeshy/shared@1.8.10

## 1.22.16

### Patch Changes

- 24e8410: Un `/l/<token>` qui visait une story DÉTRUITE restait actif pour toujours et redirigeait vers une page morte.

  Le retrait interactif d'un post — l'app comme la console de modération — coupe ses liens de partage :
  c'est le troisième effet de `applyPostRemovalEffects`, écrit il y a trois cycles, et son commentaire
  en donne la raison exacte — « le soft-delete ne bascule que `deletedAt`, le `onDelete: Cascade` de
  Prisma ne se déclenche jamais, les `/l/<token>` qui visent ce post resteraient donc opérationnels ».

  Le balayage du contenu éphémère (`ExpiredStoriesCleanupService`) est l'AUTRE chemin qui rend un post
  inatteignable, et le SEUL du gateway qui détruise réellement la ligne `Post`. Il ne coupait rien.

  Rien ne pouvait le rattraper ensuite : `TrackingLink.targetId` n'a ni relation ni cascade vers
  `Post` — le champ porte indifféremment un `postId`, un `conversationId` ou un `userId`, et le schéma
  l'écrit. Une fois la ligne `Post` détruite, plus aucun chemin du gateway ne sait relier le lien à sa
  cible disparue. Le lien survivait donc `isActive: true` : la route `/l/:token` comptait son clic,
  incrémentait `totalClicks` et `lastClickedAt`, écrivait un `TrackingLinkClick`, puis redirigeait
  vers une page morte — là où le même contenu retiré à la main répond 410 `LINK_INACTIVE`. Côté
  résolution typée, `resolveTarget` rendait `isActive: true` avec un `targetId` que plus rien ne
  résout, et la page web comme le `DeepLinkRouter` iOS ouvraient un post inexistant. Le même objet
  avait deux fins de vie selon le chemin de retrait — et la plus fréquente des deux, l'expiration, que
  TOUTE story finit par atteindre, était la mauvaise.

  Ce défaut n'était visible qu'aujourd'hui : jusqu'au cycle précédent le balayage n'appariait aucun
  post, donc aucune story n'était jamais détruite. Le rendre effectif rendait effectif ce qu'il
  oubliait de faire.

  La règle vit désormais dans son propre module, `posts/deactivatePostTrackingLinks.ts`, appliquée par
  les deux chemins et réécrite par aucun. Trois choix y sont fixés :

  - **Désactivation, jamais suppression** — les `TrackingLinkClick` sont une histoire d'audience qui
    survit à sa cible, et le tableau de bord du partageur les lit encore.
  - **`allPostIds` et jamais `ids`** — un repost est détruit par la cascade de son original sans avoir
    jamais été soft-deleté pour son propre compte (son `expiresAt` est postérieur de plusieurs
    heures), et c'est justement le repost qu'on partage.
  - **Avant toute destruction, et il rejette** — même contrat que ses deux voisins de bloc
    (`retractPostNotifications`, `releasePosts`) et pour la même raison : sans relation ni cascade,
    détruire les posts après une désactivation en échec laisserait des liens que plus aucun chemin
    n'atteindrait, la passe suivante ne voyant plus les posts. Le retrait interactif, lui, garde son
    régime best-effort — quand il s'exécute, `deletedAt` est déjà committé et rien ne doit transformer
    une suppression réussie en 500.

  Aucune réparation rétroactive : les liens des posts détruits AVANT ce correctif restent actifs en
  base. Le correctif ne vaut que pour les passes à venir.

## 1.22.15

### Patch Changes

- 9f2641a: Le balayage du contenu éphémère balaie enfin — il n'appariait aucun post, et il n'en connaissait qu'un type sur deux.

  `ExpiredStoriesCleanupService` tourne toutes les heures depuis sa mise en service et n'a, en deux
  passes, jamais détruit une story périmée. Trois défauts d'une même famille, tous dans la même
  fonction, dont le premier masquait les deux autres.

  **D1 — la passe de soft-delete n'appariait aucun post.** Son filtre était
  `deletedAt: null`. Sur le connecteur MongoDB de Prisma, ce filtre ne matche que les documents où le
  champ est **présent-et-null** ; or `post.create` n'écrit jamais cette colonne, donc sur un post
  vivant elle est **ABSENTE**. Tout le reste du dépôt lit la vivacité par `NOT_DELETED`
  (`{ isSet: false }`), dont le module dédié existe précisément parce que le filtre naïf avait déjà
  vidé le feed, les reels et les stories en production — toutes les routes renvoyaient `data: []`
  sur une collection pleine. Cette passe en portait le dernier exemplaire du modèle `Post`, du côté
  ÉCRITURE cette fois : au lieu de masquer tous les posts vivants d'une lecture, il les excluait tous
  d'un balayage. `softDeleted` valait 0 à chaque heure. Et comme la passe de hard-delete exige un
  `deletedAt` non nul, elle ne voyait par conséquent que les stories supprimées **à la main** : ni la
  purge des médias (G7), ni la libération des usages de sons, ni le retrait des notifications
  (cycle 53) ne s'étaient jamais appliqués à une story périmée.

  **D2 — le balayage ne connaissait qu'un des deux types éphémères.** Il filtrait `type: 'STORY'`.
  Un `STATUS` (mood) expire en 1 h, disparaît bien des lectures à l'échéance
  (`getStatuses`/`getDiscoverStatuses` filtrent `expiresAt > now`), et sa ligne vivait pour toujours —
  avec ses médias, ses usages de sons et ses notifications. La cause est une liste dupliquée : celui
  qui POSE l'échéance (`PostService`) et celui qui l'HONORE en portaient chacun sa copie, et elles
  avaient divergé. Les deux dérivent désormais d'une table unique, `posts/ephemeralPosts.ts` : un type
  éphémère ajouté là reçoit son échéance ET son balayage.

  **D3 — la fournée du hard-delete n'était bornée par rien**, ce qui était sans conséquence tant que
  D1 la gardait vide. Corrigée, la première passe affronte tout l'historique. Or le retrait des
  notifications **rejette** à son plafond de drainage (40 000 lignes) et s'exécute AVANT toute
  destruction : sans borne il aurait renoncé, rien n'aurait été détruit, et la passe suivante aurait
  retrouvé le même ensemble — non pas lente, bloquée. La fournée est bornée à 500 posts (réglable),
  prise du plus anciennement périmé au plus récent, et une fournée pleine est journalisée : le
  rattrapage converge en passes horaires au lieu d'échouer d'un bloc.

  Le nom de la classe ne dit toujours que « Stories » et reste inchangé volontairement — des plans et
  des analyses archivés le citent. La liste des types balayés est celle de `ephemeralPosts.ts`, pas
  celle du nom.

  Aucune réparation rétroactive : le correctif ne vaut que pour les passes à venir, qui rattraperont
  d'elles-mêmes le passif accumulé, fournée par fournée.

## 1.22.14

### Patch Changes

- 2218e08: La famille est complète : toute notification qui DÉSIGNE un message hérite de son échéance.

  Le lot précédent a branché les trois producteurs que l'éventail d'un message appelle — message
  régulier, réponse, mention — et a laissé en backlog les deux autres ancrés sur un
  `context.messageId`. Les voici, et l'un des deux n'existait pas vraiment.

  **La réaction.** `createReactionNotification` lisait déjà le message pour en tirer l'extrait
  (`select: { content: true }`) : `expiresAt` voyage dans la même lecture, aucune requête ajoutée. Une
  réaction à un message éphémère ouvrait sinon, après expiration, un message absent.

  **La mention ajoutée par ÉDITION.** `reconcileEditedMentions` est le second appelant de
  `createMentionNotificationsBatch` — le paramètre existait depuis le lot précédent, personne ne le
  lui passait. Les deux transports REST chargent déjà le message par `include` (donc `expiresAt` est
  là) ; le transport socket ajoute un champ à un `select` qu'il émettait déjà. Aucune requête ajoutée
  là non plus.

  **La traduction prête n'était pas un producteur.** `createTranslationReadyNotification` n'avait
  AUCUN appelant de production — un test était sa seule invocation dans tout le dépôt. Il n'a jamais
  écrit une ligne, et aucun client n'a jamais reçu ce type. Retiré. `NotificationTypeEnum.TRANSLATION_READY`
  reste déclaré (le SDK iOS le décode) mais porte désormais la mention explicite qu'aucun producteur
  ne l'émet — la leçon du lot précédent : une valeur déclarée n'est pas une fonctionnalité, et sans
  cette note l'énumération redonnerait à tout audit un cinquième cas à instruire.

  L'énumération est vérifiable et fait partie de la revue : quatre méthodes `create*` posent un
  `context.messageId`, les quatre estampillent l'échéance.

- cf56be4: Supprimer une demande d'amitié laissait sa notification derrière, sans destination.

  `DELETE /friend-requests/:id` retire la ligne `FriendRequest` **inconditionnellement** — que
  l'expéditeur annule, ou que le destinataire écarte sans répondre. Il émettait bien
  `friend_request:cancelled` à l'autre partie pour que sa liste d'attente s'invalide, mais il ne
  touchait pas la seule chose durable que la demande avait produite : la notification
  « X vous a envoyé une demande d'amitié », écrite par `createFriendRequestNotification` dans l'inbox
  du destinataire.

  Rien ne l'en retirait. `Notification.context` est un blob JSON, pas une clé étrangère : aucun
  `onDelete: Cascade` ne peut se déclencher sur `context.friendRequestId`. Et son unique voie de
  consommation — `markFriendRequestNotificationsAsRead`, appelée par la route soeur `PATCH` — devient
  inatteignable au moment même où la ligne part : on ne peut plus répondre à une demande qui n'existe
  plus. La notification restait donc **non lue indéfiniment**, à compter dans la cloche et dans le
  badge, avec un `metadata.action: accept_or_reject_contact` qui n'ouvre plus qu'un écran de demande
  répondant 404.

  Quatrième occurrence du même mécanisme après les `TrackingLink`, les `Mention` et les
  `Notification` d'un message rappelé : une ligne dénormalisée survit au retrait de son référent
  parce que le retrait ne l'a jamais nommée.

  **Retrait, pas marquage** — et c'est ce qui distingue cette route de sa voisine. Répondre
  (accept/reject) laisse la ligne `FriendRequest` en place : la notification est _consommée_, donc
  lue. Supprimer emporte la ligne : la notification n'a plus rien à afficher **et** rien où mener.
  Même arbitrage, pour la même raison, que le rappel d'un message (`retractMessageNotifications`) — et
  même geste, le seul que les clients savent déjà recevoir (`notification:deleted`, écouté par le web
  et par le SDK iOS), doublé d'un `notification:counts` sans lequel la cloche resterait sur un
  compteur incluant des lignes que le serveur vient de supprimer.

  Trois conséquences du caractère inconditionnel de la suppression, chacune verrouillée par un test :

  - **Aucun filtre `isRead`**, seule différence de prédicat avec le marquage. Une notification déjà
    lue est tout aussi morte qu'une non lue ; la laisser garderait dans la liste une ligne sans
    destination.
  - **Le destinataire est toujours `receiverId`**, quel que soit celui des deux qui a appelé la
    route : `createFriendRequestNotification` ne notifie que lui. Le scope `userId` reste la garde
    anti-IDOR que porte déjà le marquage.
  - **`context.friendRequestId` n'appartient qu'à `friend_request`** — le `friend_accepted` de
    l'expéditeur porte `context.conversationId`, jamais cette clé, donc le retrait ne peut pas
    l'emporter au passage.

  La lecture passe par `$runCommandRaw` pour la raison déjà établie par le marquage (Prisma ne filtre
  pas les chemins JSON sur MongoDB), mais la suppression porte sur les ids **relus**, pas sur le
  prédicat : l'ensemble supprimé et l'ensemble annoncé sont alors identiques par construction, et
  aucune ligne ne peut disparaître sans son `notification:deleted`. `singleBatch` ferme le curseur
  côté serveur plutôt que de le laisser ouvert.

  L'écriture ne dépend pas du câblage socket et l'échec n'est jamais fatal : la suppression est déjà
  committée quand le retrait s'exécute, et un retrait qui échoue ne doit pas transformer une
  suppression réussie en 500 — le test le verrouille, y compris sur le fait que le signal temps réel à
  l'autre partie n'est pas emporté par cet échec.

  Couvert (RED→GREEN, rouges observés sur les deux surfaces) par 6 tests neufs sur le service et 3 sur
  la route, dont un témoin d'ordonnancement : l'annonce vient **après** l'écriture durable, sans quoi
  les compteurs qu'elle recalcule liraient la base d'avant le retrait.

- 7c2fb34: Une notification ne survit plus au message éphémère qu'elle annonce.

  `createMessageNotification` refuse déjà de créer une notification pour un message DÉJÀ expiré. Rien
  ne disait ce qu'il advient de celle qui est créée AVANT l'expiration : le message éphémère disparaît
  quelques minutes plus tard, la ligne reste. Elle ne montre rien (l'extrait d'un message protégé est
  déjà un libellé générique), elle ne mène nulle part (`action: view_message` ouvre un message absent),
  et son badge non lu ne peut plus être décrémenté par une lecture — on ne lit pas ce qui n'est plus là.

  `Notification.expiresAt` existait pour exactement ça, depuis l'origine du modèle, et le type partagé
  le publie jusqu'aux clients (`state.expiresAt`, `isNotificationExpired`). Aucun producteur ne
  l'écrivait, aucune lecture ne l'honorait : les deux moitiés d'une même règle, mortes chacune de son
  côté. Ce lot les rebranche.

  **Producteur.** La notification hérite de l'échéance du message qu'elle désigne — message régulier,
  réponse et mention. Le chemin `new_message` la prend de sa propre relecture VIVANTE (celle de la
  garde d'admission : aucune lecture ajoutée) ; la réponse et les mentions la reçoivent de l'éventail,
  qui la tient déjà, plutôt que de la relire une fois par destinataire. Les deux sources ne peuvent pas
  diverger : `Message.expiresAt` est écrit à l'insertion et jamais modifié ensuite.

  **Lectures.** Un filtre à la lecture, et non un balayage : contrairement au rappel, la péremption
  n'est pas un événement — personne ne passe à l'instant T, et un balayage périodique laisserait
  toujours une fenêtre. Le filtre est exact à la milliseconde et ne coûte aucune écriture. Les sept
  lectures qui répondent à la même question — liste REST et son total, compte non-lus REST, les deux
  compteurs poussés par socket, le badge embarqué dans le push, le digest e-mail — la posent désormais
  par une seule unité, `visibleNotificationsWhere`. `emitCountsUpdate` portait déjà en commentaire la
  trace d'une divergence passée entre le prédicat du badge et celui de la liste ; sept copies l'auraient
  rejouée.

  **Index.** `Notification[userId, isRead]` devient `[userId, isRead, expiresAt]` — un remplacement, pas
  un index de plus : l'ancienne clé est un préfixe de la nouvelle. Sans `expiresAt` dans l'index, le
  filtre force un fetch de document par candidat sur un compteur qui tourne à CHAQUE notification créée,
  donc une fois par destinataire de chaque message ; avec, les deux branches du OU restent des plages
  d'index et le compte reste couvert. Migration `010_notification_expiry_index.js` pour les bases
  existantes (idempotente, crée avant de supprimer).

  Ce que ce lot ne fait pas : la ligne expirée reste en base (elle ne porte aucune copie du contenu), et
  un badge déjà affiché ne se corrige qu'au prochain recalcul — cohérence à terme, pas immédiate.

- 857b769: Supprimer un commentaire laissait derrière lui toutes les notifications qu'il avait produites, avec
  l'extrait de son texte.

  Sixième occurrence du mécanisme déjà vu sur les `TrackingLink` et les `Mention` d'un message
  rappelé, sur ses `Notification`, sur celles d'une demande d'amitié supprimée puis sur celles d'un
  post retiré — et la première un cran **en dessous** du post. `PostCommentService.deleteComment`
  soft-delete le sous-arbre (`PostComment.deletedAt`), décrémente `commentCount` et `replyCount`,
  puis rend `{ success: true }`. Il ne touchait rien de ce que le commentaire avait écrit dans
  l'inbox des autres.

  Rien ne l'en retirait, pour les trois raisons habituelles réunies : le retrait est **doux**, donc
  aucune cascade ne se déclenche ; le lien vit dans un blob JSON, donc il n'y a même pas de relation
  déclarée qui pourrait le faire ; et la ligne détient une copie **dénormalisée** du contenu retiré
  (`content` = l'extrait du commentaire, `metadata.commentPreview`), donc aucun filtre à la lecture ne
  peut la rattraper — la notification ne relit jamais le commentaire. Résultat : « X a commenté votre
  publication · <le texte qu'il vient d'effacer> » restait affiché, non lu, dans l'inbox de toute
  l'audience du fil, avec un `action: view_post` qui ouvre un fil où la cible est filtrée partout
  (`getComments` / `getReplies` excluent `deletedAt`).

  **Deux différences avec le jumeau côté post décident l'implémentation, et la première n'était pas
  attendue.**

  Le lien vers un commentaire vit dans **deux** chemins JSON, et aucun des deux ne couvre tous les
  types. Les huit producteurs se répartissent en trois familles : `context.commentId` seul
  (`comment_reaction`) ; `metadata.commentId` seul (`post_comment`, `comment_like`) ; les deux
  (`comment_reply`, `user_mentioned` en commentaire, `story_new_comment`, `story_thread_reply`,
  `friend_story_comment`). Une transposition littérale du retrait de post — qui ne connaît que
  `context.<clé>` — aurait donc laissé en base les `post_comment`, c'est-à-dire la notification la
  **plus fréquente** de toute la famille : une par commentaire, vers l'auteur du contenu. D'où le
  `$or` sur les deux chemins. Uniformiser les huit producteurs sur `context` serait le correctif de
  fond ; il change un contrat que les clients lisent, et n'aiderait de toute façon pas les lignes
  déjà écrites.

  La cible est une **liste**, pas un id. `deleteComment` soft-delete le sous-arbre entier — le
  commentaire et ses réponses à profondeur arbitraire, parce que `commentCount` compte le fil complet
  — et le retrait reçoit exactement la liste d'ids que le soft-delete a écrite. Ne traiter que la
  cible aurait laissé derrière lui les notifications des réponses emportées avec elle.

  `parentCommentId` est **volontairement** hors du filtre. C'est la seule autre clé de `context` qui
  désigne un commentaire, et elle ne désigne jamais le sujet de la ligne : sur un `comment_reply`,
  `commentId` est la réponse et `parentCommentId` le commentaire auquel on répond. Le cas où le parent
  disparaît est déjà couvert par le sous-arbre — la réponse part, donc la ligne part par son
  `commentId`.

  **Retrait plutôt que marquage**, comme pour le post et pour la demande d'amitié : la cible est
  filtrée partout à la lecture, donc la ligne n'a plus rien à afficher **et** rien où mener. Et seul
  l'auteur peut retirer son commentaire (`deleteComment` rejette `FORBIDDEN` sinon), donc il n'existe
  pas de retrait de modération dont la notification serait la seule trace. Le geste est celui que les
  clients savent déjà recevoir (`notification:deleted`, écouté par le web et par le SDK iOS), doublé
  d'un `notification:counts` par destinataire sans lequel la cloche resterait sur un compteur incluant
  des lignes que le serveur vient de supprimer.

  La forme reprend celle du retrait de post, pour les mêmes raisons : commande brute (Prisma ne filtre
  pas les chemins JSON sur MongoDB), suppression par ids **relus** et non par prédicat — l'ensemble
  supprimé et l'ensemble annoncé sont alors identiques par construction — annonce **après**
  l'écriture durable, et drainage par lots de 200 en série, un fil populaire cumulant `post_comment`,
  `comment_reply`, `comment_like` et mentions sur chaque commentaire du sous-arbre.

  **Best-effort** comme les quatre effets du retrait de post : `deletedAt` est déjà committé quand le
  retrait s'exécute, et une inbox récalcitrante ne doit pas transformer une suppression réussie en 500. La route n'a rien à câbler — l'annonceur se résout par défaut de paramètre sur le service
  partagé du processus, le seul branché avec `io`, évalué à chaque appel puisque ce service n'est
  enregistré qu'au démarrage du socket.

  Couvert (RED→GREEN, rouges observés sur les deux surfaces) par 12 tests sur l'unité de retrait et 4
  sur le câblage, dont quatre témoins re-vérifiés par sonde en réintroduisant le défaut : un filtre
  sur le seul `context.commentId`, un retrait borné à la cible au lieu du sous-arbre, l'appel retiré
  de `deleteComment`, et l'annonce placée avant l'écriture durable. Ne rattrape pas les lignes déjà
  orphelines en base : action humaine, sur le patron des scripts de réparation existants.

- 931abf6: Les notifications d'une story DÉTRUITE sont retirées avec elle — et l'expiration, elle, ne retire rien.

  Le balayage des stories expirées (`ExpiredStoriesCleanupService`) est le **seul chemin de
  hard-delete de post du gateway** : au bout de 7 jours il supprime définitivement les lignes `Post`
  des stories périmées, leurs reposts et tous leurs commentaires. Il ne retirait pas les notifications
  que ces posts avaient produites. Elles survivaient à leur cible, indéfiniment : une copie
  dénormalisée d'un contenu qui n'existe plus (`content`, `metadata.commentPreview`, et
  `metadata.firstAttachmentUrl`, la vignette d'un média supprimé), un `action: view_post` qui n'ouvre
  plus qu'un 404, et un badge non lu que plus personne ne peut décrémenter — on ne lit pas ce qui
  n'est plus là. Toutes les stories expirent, donc toutes finissaient par en laisser.

  **L'expiration N'EST PAS le retrait, et le correctif n'y touche pas.** Tant que la story n'est que
  périmée, sa notification reste une trace légitime : les deux clients l'affichent marquée
  « expirée » à partir de `context.postExpiresAt` (web `notification-helpers`, iOS
  `expiryLabel` / `isLinkedContentExpired`), et `getPostById` ne filtre pas l'expiration — la cible
  répond encore. Estampiller `Notification.expiresAt` depuis l'échéance du post, par symétrie avec le
  message éphémère, aurait donc masqué côté serveur des lignes que le produit montre délibérément, et
  transformé en code mort l'affichage « expirée » des deux clients. C'est à la DESTRUCTION que les
  deux appuis tombent ensemble, et c'est là que le retrait est ancré.

  Le retrait précède les suppressions et **rejette** volontairement — même raison que la libération
  des usages de sons juste à côté : `context.postId` n'a ni relation ni cascade, donc détruire les
  posts après un retrait en échec laisserait des lignes que plus aucun chemin n'atteindrait, la passe
  suivante ne voyant plus les posts. La passe horaire suivante rejoue tout.

  `retractPostNotifications` prend désormais une **liste** de posts, comme son jumeau
  `retractCommentNotifications` : ce qui part ensemble se retire ensemble, en un `$in` au lieu d'une
  lecture par post. Son plafond de drainage rejette au lieu d'avertir — inatteignable tant que
  l'entrée était un post unique, il ne l'est plus quand elle est une heure d'expirations de toute la
  plateforme.

  Aucune réparation de données : le correctif ne vaut que pour les destructions à venir. Les lignes
  déjà orphelines demandent un script, sur le patron de `repair-mention-user-ids.ts`.

- 7510f76: Supprimer un post laissait derrière lui toutes les notifications qu'il avait produites — avec
  l'extrait de son contenu et la vignette de son média.

  `applyPostRemovalEffects` est l'unité qui NOMME tout ce qu'un retrait de post doit écrire en base,
  créée précisément parce que la console avait rattrapé un par un, à trois cycles d'intervalle, ce que
  le service faisait et qu'elle ne faisait pas. Elle listait l'audit de modération, la coupure des
  liens de partage et la libération des usages de sons. Elle n'a jamais listé les **notifications**,
  alors que son jumeau côté message (`applyMessageRemovalEffects`) les retire depuis deux cycles.

  Rien ne les en retirait. Le retrait d'un post est **doux** (`deletedAt`), donc aucun
  `onDelete: Cascade` ne se déclenche — et il n'y a de toute façon aucune relation à ne pas
  déclencher : le lien vit dans `context.postId`, un chemin dans un blob JSON. Chaque `post_comment`,
  `comment_reply`, `comment_like`, `post_repost`, `story_new_comment`, `story_thread_reply`,
  `friend_story_comment`, `friend_new_story`, `friend_new_post` et `user_mentioned` de ce post
  survivait donc indéfiniment, avec la copie **dénormalisée** que `createNotification` en a prise —
  `content`, `metadata.commentPreview`, et `metadata.firstAttachmentUrl`, la vignette du média retiré.
  Aucun filtre à la lecture ne peut les rattraper : la ligne ne relit jamais le post. Le
  `action: view_post` qu'elles portent n'ouvre plus qu'un écran 404, et leur badge non lu n'est plus
  décrémentable — on ne consomme pas ce qui n'est plus là. Le diagnostic du 2026-08-04 en comptait
  **≈ 8 100 non lues** en production.

  Cinquième occurrence du même mécanisme après les `TrackingLink`, les `Mention`, les `Notification`
  d'un message rappelé et celles d'une demande d'amitié supprimée : une ligne dénormalisée survit au
  retrait de son référent parce que le retrait ne l'a jamais nommée. C'est la plus large des cinq.

  **Retrait plutôt que neutralisation**, même arbitrage et même geste que le rappel d'un message : une
  notification dont le post n'existe plus n'a rien à afficher **et** rien où mener, et
  `notification:deleted` est le seul geste que les clients savent déjà recevoir (écouté par le web et
  par le SDK iOS), doublé d'un `notification:counts` par destinataire sans lequel la cloche resterait
  sur un compteur incluant des lignes que le serveur vient de supprimer.

  Deux différences de forme avec le jumeau message, et elles décident toute l'implémentation :

  - **Aucune colonne ne porte le lien.** `Notification.messageId` existe ; rien d'équivalent pour un
    post. La seule trace est `context.postId`, que l'API Prisma ne sait pas filtrer sur MongoDB —
    d'où la commande brute, exactement comme `markPostNotificationsAsRead`. Et le filtre n'est **pas**
    scopé à un `userId` : un post notifie une AUDIENCE (auteur, commentateurs du fil, amis prévenus de
    la publication), donc la relecture projette `userId` et l'annonce se groupe par destinataire.
  - **Le lot n'est pas la fin.** L'audience d'un post dépasse la taille d'un lot bien plus vite que
    les quelques destinataires d'un message ; une lecture unique laisserait la queue en base sans le
    moindre signal, puisque le premier lot, lui, a réussi. D'où le drainage, par lots de 200 en
    série — taille modeste délibérément, `announceNotificationsRetracted` déclenchant un recalcul de
    compteurs par destinataire distinct : le lot borne la rafale, et l'enchaînement en série garde le
    pic à un lot quelle que soit l'audience.

  La suppression porte sur les ids **relus** et non sur le prédicat : l'ensemble supprimé et
  l'ensemble annoncé sont identiques par construction, et aucune ligne ne peut disparaître sans son
  `notification:deleted`. La course avec une notification créée pendant le retrait est fermée de
  l'autre côté, à l'admission — `canNotifyAboutPost` passe par `loadPostAcl`, qui rend `null` pour un
  post supprimé.

  Le retrait est placé **juste après l'audit** et avant les deux autres effets : l'audit reste le
  premier écrit (c'est la trace de modération), mais le retrait est le seul des quatre dont le retard
  se voit, l'extrait et la vignette restant affichés dans l'inbox de toute l'audience tant qu'il n'a
  pas eu lieu. Il est **best-effort** comme les trois autres — `deletedAt` est déjà committé quand la
  liste s'exécute, et un retrait qui échoue ne doit jamais transformer une suppression réussie en 500.

  Les deux routes qui retirent un post (`DELETE /posts/:postId` via `PostService.deletePost`, et
  `DELETE /admin/posts/:postId` qui écrit `deletedAt` en direct) n'ont **rien à câbler** : l'annonceur
  se résout par défaut sur le service partagé du processus, le seul branché avec `io`, exactement
  comme chez le jumeau message. Le port `RetractedNotificationAnnouncer` déménage de `messaging/` vers
  `notifications/`, à côté de son unique implémenteur — le déclarer une seconde fois sous `posts/`
  aurait fabriqué deux ports rivaux pour une seule règle, la configuration même que ces modules
  existent pour empêcher ; `messaging/` le ré-exporte pour ses importateurs historiques.

  Couvert (RED→GREEN, rouges observés sur les deux surfaces) par 9 tests sur l'unité de retrait et 3
  sur la liste d'effets, dont deux témoins re-vérifiés par sonde — chaque ligne repart vers **son**
  destinataire (le double rend des `userId` tous différents, un retrait qui les confondrait
  adresserait des appareils qui n'ont jamais eu la ligne), et le drainage va bien au-delà d'un lot
  plein. Ne rattrape pas les lignes déjà orphelines en base : action humaine, sur le patron des
  scripts de réparation existants.

- e4ada9e: Débannir quelqu'un qui était parti de lui-même le faisait rentrer.

  `PATCH …/participants/:userId/ban` cherche sa cible **sans filtrer `isActive`**, et c'est
  délibéré : bannir un ancien membre est précisément ce qui l'empêche de revenir par un lien de
  partage, `resolveConversationEntry` refusant toute entrée sur `bannedAt`. Cette capacité n'est pas
  retirée. Mais les deux moitiés du geste écrivaient sans condition —
  `ban: { bannedAt: now, isActive: false, leftAt: now }`,
  `unban: { bannedAt: null, isActive: true, leftAt: null }` — et composées sur un ancien membre,
  elles font autre chose que ce que leurs noms annoncent.

  **Bannir effaçait le départ.** `leftAt` était réécrit à l'instant du bannissement alors qu'il datait
  un départ volontaire vieux de plusieurs mois. L'information n'était pas remplacée par une
  meilleure : elle était perdue, et c'est elle qui aurait permis au débannissement de savoir quoi
  rendre.

  **Débannir faisait entrer.** `{ isActive: true, leftAt: null }` sur une personne que le bannissement
  n'avait pas sortie — parce qu'elle était déjà dehors — n'annule rien : ça CRÉE une appartenance. Le
  débannissement devenait une **quatrième porte d'entrée** dans la conversation, la seule qui
  n'obéisse pas à `resolveConversationEntry`, qui ne redonne ni rang ni permissions de nouvel arrivant
  (l'ancien `admin` retrouvait son rang dans une ligne périmée — l'inverse exact de ce que la
  leçon 89 exige), et qui rebranchait de force les sockets de quelqu'un qui était parti seul.

  La décision vit désormais dans une unité pure, `services/conversations/conversationBanState.ts` :
  un bannissement ne retire une appartenance que s'il en trouve une ; un débannissement ne rend que ce
  que le bannissement a pris. Il lève l'interdiction dans tous les cas — sinon « débannir » ne lèverait
  rien, et toutes les portes continueraient de refuser. Savoir laquelle des deux histoires s'est
  produite ne demande aucun champ nouveau : le bannissement laisse la trace dans la ligne
  (`leftAt === bannedAt` ⟺ c'est lui qui a mis fin à l'appartenance), et l'égalité est **exacte par
  construction**, les deux champs recevant le même objet `Date`. Les lignes écrites avant ce cycle
  portent toutes cette égalité, donc conservent à l'identique le comportement qu'elles ont toujours eu :
  aucune réparation de base n'est nécessaire.

  **Le débannissement n'oubliait pas la ligne mise en cache.** `participant-lookup-cache` mémorise
  `isActive` 30 s pour éviter une lecture par message envoyé ; le bannissement l'invalide, le
  débannissement ne le faisait pas. Pendant une demi-minute, la personne réintégrée restait
  `isActive: false` pour le chemin d'envoi et chacun de ses messages était refusé sans qu'aucune ligne
  en base ne le justifie.

  **Les compteurs de membres des clients suivaient l'événement, pas le fait.**
  `conversation:participant-banned` et `conversation:participant-unbanned` portent maintenant
  `membershipEnded` / `membershipRestored`. Web (`use-socket-cache-sync`) et iOS
  (`ConversationListViewModel`) décrémentaient et incrémentaient sans condition : bannir un ancien
  membre faisait dériver le compteur vers le bas, durablement côté iOS où la valeur fausse est
  persistée dans le cache local. Les deux champs sont optionnels et leur absence se lit comme `true` —
  un serveur antérieur à ce contrat ne bannissait qu'en retirant. Android expose bien les deux
  événements mais n'en dérive aucun effectif : rien à corriger de ce côté.

- Updated dependencies [2218e08]
- Updated dependencies [7c2fb34]
- Updated dependencies [e4ada9e]
  - @meeshy/shared@1.8.9

## 1.22.13

### Patch Changes

- c4082f5: L'éventail de notification ferme la course que le rappel d'un message ne peut pas fermer seul.

  Le cycle précédent fait retirer, au rappel, les notifications qu'un message avait produites — un
  `deleteMany` filtré sur `messageId`. Il emporte donc tout ce qui existe à son instant, et rien de ce
  qui naît après lui. Or l'éventail de notification du même message COURT CONTRE lui : une ligne créée
  après ce balayage survit, avec la copie de l'extrait que `createNotification` dénormalise, et
  qu'aucun filtre à la lecture ne rattrape.

  La piste inscrite au cycle précédent — une garde d'admission en tête d'éventail — RÉTRÉCIT la
  fenêtre sans la fermer : `deletedAt` peut être committé entre la relecture et la création. C'est
  exactement le trou que porte déjà la garde de `createMessageNotification`, et c'est pourquoi
  `createReplyNotification` et `createMentionNotificationsBatch` n'ont pas reçu la même.

  Le geste qui ferme est à l'autre bout : une relecture de `deletedAt` APRÈS l'éventail. Soit D
  l'instant du commit de `deletedAt`, X celui du `deleteMany` du rappel (X > D — les effets tournent
  après le commit), [c1..cn] les créations de l'éventail et R sa relecture finale. Si X > cn, le rappel
  voit toutes les lignes ; si X < cn, alors D < X < cn < R et la relecture lit `deletedAt`, donc
  l'éventail retire lui-même. Aucun troisième cas.

  Placée après le compte rendu, elle ne coûte rien au chemin de latence du push — les notifications
  sont déjà parties — là où une garde d'admission aurait allongé TOUS les envois d'un aller-retour.
  Elle n'est payée que par un éventail qui visait au moins un destinataire.

  Le retrait lui-même passe dans une unité partagée, `retractMessageNotifications`, que les DEUX bouts
  appellent : deux copies du même geste auraient divergé comme les listes d'effets de suppression
  avaient divergé avant `applyMessageRemovalEffects`.

## 1.22.12

### Patch Changes

- Updated dependencies [36911f8]
  - @meeshy/shared@1.8.8

## 1.22.11

### Patch Changes

- b5ac96c: Le rappel d'un message retire les notifications qu'il avait produites, et l'annonce aux appareils.

  Le cycle précédent a sorti le message rappelé de l'inbox de mentions ; il a laissé derrière lui
  l'inbox de notifications, qui porte le MÊME contenu par une autre voie. `Notification.content` et
  `metadata.messagePreview` sont un extrait du message, **dénormalisé à la création** : aucun filtre à
  la lecture ne pouvait les rattraper, la ligne ne relit jamais le message dont elle détient une
  copie. « Bob vous a mentionné · <le texte qu'il regrette> » restait donc lisible, avec l'identité de
  l'auteur et le titre de la conversation, dans la liste de notifications de chaque destinataire —
  mention, réponse et réaction confondues — sans date de fin.

  Rien ne l'en retirait : le `onDelete: Cascade` de `Notification.message` demande une suppression
  **physique**, et le retrait doux ne bascule que `deletedAt`. Même mécanisme que les `TrackingLink`
  du cycle 43 et les `Mention` du cycle 46.

  Le retrait vit dans `applyMessageRemovalEffects` — l'unité que les trois écrivains interactifs de
  `deletedAt` traversent — et porte sur `Notification.messageId`, la colonne que `createNotification`
  renseigne depuis `context.messageId` pour les cinq types ancrés sur un message. La moitié volatile
  (`notification:deleted` par ligne, un `notification:counts` par destinataire) est déléguée au
  `NotificationService` partagé via un port étroit : l'écriture durable ne dépend jamais du câblage
  socket, seule l'annonce est optionnelle.

## 1.22.10

### Patch Changes

- 5f68822: L'inbox `/mentions/me` honore enfin le rappel d'un message et l'appartenance à la conversation.

  `MentionService.getRecentMentionsForUser` ne filtrait que sur `mentionedUserId` : c'était le seul
  chemin du gateway rendant `Message.content` sans vérifier `deletedAt`. Un message supprimé par son
  auteur — retiré de la conversation pour tout le monde, `message:deleted` diffusé, `translations`
  vidées — restait donc lisible en clair, avec son auteur et le titre de sa conversation, dans
  l'inbox de chaque personne qu'il nommait, et pour toujours : aucun écrivain ne supprime la ligne
  `Mention`, et le `onDelete: Cascade` du schéma ne se déclenche que sur une suppression physique que
  le retrait doux ne fait jamais. Même absence de garde sur l'appartenance : une personne retirée d'un
  groupe continuait d'y lire une entrée dont le titre de conversation est relu à chaque appel.

  L'admission est désormais celle de `GET /mentions/messages/:messageId`, la route soeur du même
  fichier : message non supprimé, appelant participant toujours actif.

## 1.22.9

### Patch Changes

- e20ccf7: Un participant sans compte voit enfin sa liste de conversations se retrier — et une conversation neuve y apparaître.

  Le cycle précédent avait réuni **trois** copies de l'éventail d'accusés de lecture derrière
  `emitToConversationParticipants`, en énonçant la règle qui les corrigeait toutes : un participant
  est adressé par `userId ?? id`, parce que `AuthHandler` nomme la room personnelle d'une socket
  anonyme d'après son `Participant.id`. Il laissait une piste, littérale : « la règle vaut pour tout
  émetteur personnel, et rien ne garantit que les autres la respectent. À instruire par une recherche
  sur `ROOMS.user(` plutôt que par déduction. »

  La recherche en a trouvé **cinq** autres, et la plus lourde n'était pas un accusé de lecture.

  ## `conversation:updated` ne parvenait à aucun anonyme, sur aucun des trois chemins d'envoi

  C'est le seul signal qui fait remonter une conversation en tête de liste, et le seul par lequel une
  conversation **toute neuve** entre dans la liste d'un client déjà connecté. `message:new` ne suffit
  pas : il n'atteint que les sockets déjà dans `conversation:<id>`, que le client sur sa liste a
  justement quittée. Les trois émetteurs le sautaient de la même façon :

  | chemin                | émetteur                                     |
  | --------------------- | -------------------------------------------- |
  | envoi WS              | `MessageHandler.broadcastNewMessage`         |
  | envoi REST/ZMQ        | `MeeshySocketIOManager._broadcastNewMessage` |
  | édition / suppression | `emitConversationPreviewUpdate`              |

  Pour un invité de lien partagé — le mode d'entrée principal du produit — la liste des conversations
  était donc **figée** : pas de re-tri à la réception d'un message, pas de rafraîchissement de l'aperçu
  après une édition ou une suppression, et un fil créé après sa connexion n'apparaissait pas du tout,
  jusqu'au prochain refetch manuel. `emitConversationPreviewUpdate` documentait même le manque comme
  une intention (« anonymous participants are skipped, exactly as the send path does ») : la phrase
  était exacte sur les deux moitiés, et fausse sur les deux.

  ## Deux copies de l'éventail d'accusés avaient survécu au regroupement

  `POST /messages/:id/status` (quatrième copie verbatim, jamais recensée) et le rejeu de remise à la
  reconnexion (`_emitDeliveryForDrainedMessages`) portaient encore le filtre sur `userId` seul. Un
  expéditeur sans compte restait donc bloqué sur un unique tic « envoyé », y compris quand son
  destinataire revenait en ligne et vidait sa file — le moment même où l'accusé existe.

  ## Correctif — `participantUserRooms`

  Les deux familles d'émetteurs ne partagent pas une forme d'émission : les accusés **chaînent** la
  room de conversation avec les rooms personnelles (livraison au plus une fois par socket), tandis que
  `conversation:updated` n'adresse **que** les rooms personnelles — en doubler une copie vers la room
  de conversation serait inutile pour qui regarde déjà le fil. Ce qu'elles ont en commun est la liste
  de rooms, et c'est exactement la ligne que chaque copie ratait. Elle est donc extraite seule,
  `participantUserRooms(participants, seed?)`, et `emitToConversationParticipants` s'appuie dessus.

  Une garde s'y ajoute que les copies n'avaient pas : un participant ne portant **ni** `userId` **ni**
  `id` ne nomme aucune room. Deux des sites corrigés ici sélectionnaient `{ userId: true }` seul ;
  sans cette garde, la même erreur de `select` commise demain n'aurait plus rien sauté du tout — elle
  aurait déversé le trafic de toutes les conversations dans l'unique room `user:undefined`.

  Aucun changement de contrat client : les cinq sites émettent les mêmes événements avec les mêmes
  charges utiles, à davantage de destinataires. Un participant enregistré est adressé exactement comme
  avant.

## 1.22.8

### Patch Changes

- 220af2e: Un post retiré depuis la console de modération coupe enfin ses liens de partage et laisse une trace d'audit.

  `DELETE /admin/posts/:postId` écrit `deletedAt` en direct, sans passer par
  `PostService.deletePost`. Deux effets que le service tient depuis toujours manquaient encore à ce
  raccourci — les deux derniers d'une série que trois cycles successifs ont rattrapée un par un
  (usages de sons, puis diffusion temps réel, puis ceci) :

  **Les liens de partage restaient actifs.** Un soft-delete ne bascule que `deletedAt` : aucun
  `onDelete: Cascade` ne se déclenche, et les `TrackingLink` visant le post gardaient
  `isActive: true`. Un contenu retiré **pour motif de modération** restait donc atteignable par ses
  `/l/<token>` déjà partagés — c'est-à-dire par le chemin même de sa diffusion. Le service coupait
  ces liens ; la console, non.

  **Aucune ligne `AdminAuditLog` n'était écrite.** La route accepte un champ `reason`, que son propre
  schéma OpenAPI documente « Reason for deletion (for audit trail) » : la raison n'allait pourtant
  que dans un `fastify.log.info`, jamais dans la table que la console interroge. Le geste de
  modération le plus sensible du produit ne laissait aucune trace requêtable, là où
  `DELETE /posts/:postId` en laisse une pour exactement le même geste — alors que
  `services/gateway/CLAUDE.md` pose « Admin audit trail required for all admin actions ».

  Correctif : les trois effets durables d'un retrait (ligne d'audit, coupure des liens de partage,
  libération des usages de sons) vivent désormais dans une unité unique,
  `services/posts/postRemovalEffects.ts` → `applyPostRemovalEffects`, par laquelle passent les deux
  routes. C'est le symétrique de `broadcastPostRemoval`, qui tient depuis le cycle précédent la
  moitié volatile du même geste. Un effet ajouté demain s'applique aux deux chemins sans que
  personne ait à se souvenir du second écrivain. La raison fournie par la console est désormais
  portée dans `metadata` de la ligne d'audit ; `deletePost` accepte pour cela un `reason` optionnel.

  Inchangé, délibérément : un auteur qui retire son propre contenu n'ouvre pas de ligne d'audit —
  se supprimer soi-même n'est pas un acte de modération.

## 1.22.7

### Patch Changes

- b6f85d1: Un participant sans compte reçoit enfin les accusés de lecture et de remise de ses pairs.

  L'éventail de rooms chaîné — celui qui garantit que Socket.IO ne livre qu'**une** copie à une
  socket présente à la fois dans la room de conversation et dans sa room personnelle — existait
  en **trois copies verbatim** : `MessageHandler.autoDeliverToOnlineRecipients`,
  `routes/message-read-status.ts` et `routes/conversations/messages.ts`. Les trois portaient le
  même `if (!p.userId) continue`, donc le même angle mort ; deux des trois ne chargeaient même
  pas `Participant.id` (`select: { userId: true }`), si bien que l'identité de repli n'était pas
  ignorée, elle n'était pas lue.

  Ce n'est pas une room absente qu'elles sautaient, c'en est une qui existe. `AuthHandler` fait
  rejoindre `ROOMS.user(participant.id)` à toute socket anonyme, et le commentaire qui l'a mis là
  dit pourquoi : c'est « la seule room que TOUT émetteur d'événement personnel adresse
  (`io.to(ROOMS.user(participant.userId ?? participant.id))`) », et l'avoir nommée autrement avait
  déjà privé les anonymes de leur pastille de non-lus. La room de conversation n'est pas un
  substitut — c'est même la raison d'être du chaînage : un client parti sur la liste des
  conversations a quitté `conversation:<id>` et n'est plus joignable que par sa room personnelle.

  Conséquence observable, sur les trois chemins : un participant anonyme n'apprenait ni qu'un
  pair avait lu, ni — depuis le correctif d'accusé de remise qui vient de précéder — que la
  remise qu'il venait lui-même d'acquitter avait eu lieu. Le correctif précédent l'avait fait
  entrer dans le NUMÉRATEUR de `getLatestMessageSummary` sans le faire entrer dans la diffusion
  qui l'annonce.

  Correctif : une unité unique `emitToConversationParticipants`
  (`socketio/emitToConversationParticipants.ts`) par laquelle passent désormais les trois sites,
  adressant chaque participant par `userId ?? id`. La forme correcte existait déjà à un fichier
  de distance, dans `emitUnreadCountsToRecipients` — c'est donc une extraction, pas une
  invention. Les deux routes y perdent au passage leurs casts `any` sur l'émetteur.

## 1.22.6

### Patch Changes

- 34fa613: `PUT /user-preferences/conversations/:conversationId` écrivait une ligne
  `UserConversationPreferences` à partir de **deux identifiants fournis par
  l'appelant**, sans vérifier ni l'un ni l'autre.

  **Fuite inter-locataires (`categoryId`).** `UserConversationCategory` est une
  table par utilisateur et privée. La route acceptait n'importe quel `categoryId`,
  puis renvoyait la ligne avec `include: { category: true }` : le corps du `200` —
  et toutes les lectures ultérieures, qui font la même jointure — rendaient le
  `name`, la `color` et l'`icon` de la catégorie d'un **autre utilisateur**. Les
  noms de catégorie sont des libellés écrits par l'utilisateur ; c'est une lecture
  inter-locataires. Les six routes de `me/preferences/categories.ts` restreignent
  pourtant chaque accès à `{ id, userId }` — ce `PUT` était le seul écrivain de
  `categoryId` à ne pas le faire. Répond désormais `404 Category not found`, comme
  ses routes sœurs, ce qui ne confirme pas l'existence de la catégorie.

  **Écriture hors périmètre (`conversationId`).** L'écriture étant un `upsert`,
  tout appelant authentifié pouvait créer des lignes de préférences contre des ids
  de conversation arbitraires et faire diffuser `USER_PREFERENCES_UPDATED` pour
  elles. Répond désormais `403 Not a member of this conversation`, avec le prédicat
  déjà utilisé par `GET /conversations` et par les trois routes de
  `user-deletions.ts` — aucun accès légitime n'est restreint.

  Les deux contrôles vivent dans `writeConversationPreferences`, au même endroit
  que l'incrément de `version` et la diffusion : la ligne n'est atteignable que par
  cette fonction, donc c'est le seul endroit qu'un futur écrivain ne peut pas
  oublier. `reorderConversationPreferences` filtrait déjà sur l'appartenance ;
  c'est cette asymétrie qui a rendu le trou visible.

  `POST /user-preferences/reorder` borne enfin son lot (`maxItems: 200`) : le
  filtre d'appartenance ne s'applique qu'après le parsing et la déduplication.

- 73fadd5: La coche d'un message envoyé par lien de partage passe enfin de « envoyé » à « remis » — et
  un destinataire anonyme cesse d'être invisible à l'accusé de livraison, sur TOUS les chemins.

  Deux défauts distincts, la même racine : une obligation dont la seule implémentation est
  hors de portée de celui qui la doit.

  **1. Aucune des deux routes de lien n'émettait d'accusé de livraison.**
  `MessageHandler.autoDeliverToOnlineRecipients` marque le message `received` pour chaque
  destinataire connecté, puis émet le `read-status:updated` consolidé qui fait avancer la coche
  de l'expéditeur. Les deux transports nominaux l'atteignent — le chemin WS par
  `broadcastNewMessage`, le chemin REST/ZMQ par `MeeshySocketIOManager._broadcastNewMessage` —
  mais elle est une méthode de `MessageHandler` (elle a besoin de `io`, `connectedUsers`, du
  service de statut de lecture et de celui de confidentialité), donc invisible depuis une
  route. Les deux routes d'envoi par lien (`POST /links/:identifier/messages` et son jumeau
  `/messages/auth`) contournant `MessagingService.handleMessage`, l'auteur d'un message par
  lien regardait une coche unique **définitivement figée**, quel que soit le nombre de pairs
  assis dans la conversation. Sixième cycle consécutif sur la même racine.

  **2. L'accusé excluait les participants ANONYMES par construction, y compris sur le chemin
  nominal.** La sonde de présence s'écrivait `!!p.userId && connectedUsers.has(p.userId)`. Or
  `AuthHandler._registerUser` indexe un inscrit par `User.id` mais un anonyme par
  `Participant.id` — la seule identité qu'il possède, n'ayant pas de ligne `User`. Ce prédicat
  ne pouvait donc jamais être vrai pour un anonyme : exclusion par construction, pas par
  circonstance. Et l'exclusion n'était pas neutre pour l'expéditeur : `getLatestMessageSummary`
  compte TOUT participant actif par `Participant.id` dans `totalMembers`. Un anonyme présent au
  dénominateur et inatteignable au numérateur rendait « remis à tous » **impossible pour la
  conversation entière** — soit exactement la forme de toute conversation ouverte par lien.

  Correctif : la présence et les préférences se lisent désormais sous une clé unique
  (`_presenceKey` = `userId ?? id`), et les préférences sont demandées avec `isAnonymous`
  correctement renseigné — ce qui sert les défauts sans requête plutôt que d'envoyer un
  `Participant.id` à `fetchManyFromDatabase` comme s'il s'agissait d'un `User.id`. Le paramètre
  de l'unité est ramené aux deux champs qu'elle lit (`{ id, senderId }`) au lieu d'un `Message`
  Prisma complet : exiger ce dont on n'a pas besoin est précisément ce qui la rendait
  inatteignable depuis une route. `broadcastLinkMessage` l'appelle comme quatrième obligation,
  avec le même contrat best-effort que les trois autres (deux gardes, jamais dans le chemin du
  201, jamais un 500) — via un relais public du manager, pour que les trois transports partagent
  une seule implémentation plutôt que trois accusés subtilement différents.

  Conséquence de contrat : `ReadStatusUpdatedEventData.userId` est déclaré `string | null`,
  ce qu'il était déjà en fait pour un acteur anonyme. iOS le décodait déjà en `String?` et le
  web ne le lit pas — aucun client n'a à changer, et un consommateur qui compare cette valeur à
  sa propre identité (synchro multi-appareils du curseur) garde le bon comportement : `null` ne
  correspond à personne.

- 5ee49df: Un message envoyé par lien de partage notifie enfin ses destinataires — et un expéditeur
  anonyme cesse d'être invisible partout.

  Deux défauts distincts, la même racine.

  **1. Le chemin de lien ne notifiait personne du tout.** `createMessageNotification`,
  `createReplyNotification` et `createMentionNotificationsBatch` n'avaient qu'un appelant :
  `MessageProcessor.triggerAllNotifications`, `private`, atteinte uniquement par
  `handleMentionsAndNotifications` — `private` elle aussi. Les deux routes d'envoi par lien
  (`POST /links/:identifier/messages` et son jumeau `/messages/auth`) contournent
  `MessagingService.handleMessage`, donc `MessageProcessor` en entier : ni push APNs/FCM, ni
  notification in-app, ni ligne `Notification`. Un destinataire qui n'avait pas l'application
  au premier plan n'apprenait jamais qu'il avait reçu un message. Silence complet, pas une
  dégradation. Cinquième cycle consécutif sur la même racine : une obligation destinataire sans
  nom appelable est inatteignable.

  **2. L'éventail se taisait pour tout expéditeur ANONYME, y compris sur le chemin nominal.**
  `triggerAllNotifications` résolvait l'expéditeur par `user.findUnique({ id: senderId })` et
  sortait en silence sur `null`. Un participant anonyme a `Participant.userId = null`, donc
  `senderId` restait un `Participant.id` et la lecture ne rendait jamais rien : réponse,
  mentions et messages réguliers étaient tous abandonnés. Le défaut valait aussi pour un
  anonyme envoyant par socket `message:send` — il ne notifiait déjà personne en production. Le
  même verrou était recopié une couche plus bas dans les trois créateurs de notification.

  Correctif : une unité unique `notifyMessageRecipients`
  (`services/messaging/messageNotificationFanOut.ts`), appelée par `MessageProcessor` comme par
  les deux routes de lien. Sa résolution d'identité a trois branches et aucune impasse —
  participant inscrit, participant anonyme (nommé par son `displayName`/`avatar`, la seule
  identité qui existe pour lui), ou id déjà utilisateur (le participant synthétique de la
  conversation globale `meeshy`). L'identité résolue descend jusqu'aux créateurs via
  `senderProfile`, ce qui sert deux choses à la fois : nommer un acteur absent de `User`, et
  supprimer une lecture `User` **par destinataire** sur le chemin le plus chaud du service.
  `createMentionNotificationsBatch` voit ses paramètres `senderUsername`/`senderAvatar` —
  qu'elle recevait sans jamais les lire — remplacés par ce profil.

  Best-effort de bout en bout : l'unité ne lève jamais, reste hors du chemin de l'ACK, et une
  panne de notification ne transforme pas un envoi réussi en 500.

  Reste hors de portée et documenté : les mentions du chemin de lien, dont la donnée
  (`Message.validatedMentions`) n'est écrite que par `MessageProcessor` — l'unité accepte donc
  une liste de mentions vide sans que réponse ni message régulier n'en souffrent.

- 72270e8: Un message envoyé par lien de partage est désormais traduit, et remonte sa conversation.

  `POST /links/:identifier/messages` et son jumeau authentifié `/messages/auth` appelaient
  `prisma.message.create` puis diffusaient — et c'était tout. Le chemin nominal
  (`MessagingService.runPostSaveSideEffects`) exécute quatre écritures après le commit ; ces
  deux routes contournent la classe entière, donc elles n'en exécutaient **aucune** :

  - **Le Prisme Linguistique était éteint sur ce transport.** Le message n'était jamais poussé
    au translator, et `Message.translations` n'est jamais rempli après coup (aucune
    retraduction n'est déclenchée hors édition ou demande explicite). Un participant qui lit
    français voyait donc indéfiniment en clair le message espagnol de l'anonyme assis dans la
    même conversation — sur le seul transport d'envoi dont dispose un participant anonyme, et
    celui qu'emprunte la conversation globale `meeshy`.
  - **`Conversation.lastMessageAt` restait périmé.** `GET /conversations` trie dessus
    (`orderBy: { lastMessageAt: 'desc' }`) et pagine par curseur sur ce même champ : une
    conversation dont tout le trafic récent arrive par lien restait enterrée à sa position
    d'avant. Le client web remontait bien la conversation depuis `link:message:new` — et le
    prochain refetch la redescendait, le serveur n'ayant jamais enregistré le bump.
  - Les statistiques de langue de la conversation n'étaient pas incrémentées.

  Racine : l'obligation vivait dans une méthode `private` de `MessagingService`, donc
  inatteignable par tout écrivain hors de cette classe — exactement la configuration qui avait
  déjà produit les trous des cycles précédents. Correctif : une unité publique unique
  `runMessagePostSaveEffects` (bump, poussée au translator, statistiques), appelée par le
  chemin nominal ET par les deux routes de lien. Ce qui est poussé au translator est le
  contenu **stocké** (URLs de tracking réécrites) sous la langue source **normalisée**, celle
  qui est persistée. Le quatrième effet du chemin nominal — l'avancement du curseur de lecture
  de l'auteur — reste délibérément hors de l'unité : il ne corrige aucun défaut observable (le
  décompte de non-lus exclut déjà ses propres messages) et la route de lien authentifiée peut
  porter un participant synthétique pour la conversation globale, sous lequel il créerait un
  curseur orphelin.

- 5647020: Un message envoyé par lien de partage atteint désormais les participants hors ligne.

  `POST /links/:identifier/messages` et son jumeau authentifié `/messages/auth` créaient le
  message puis l'annonçaient par une seule ligne :
  `io.to(conversation:<id>).emit(LINK_MESSAGE_NEW)`. Cette room ne contient que les sockets
  **connectées**. Aucun des deux chemins n'enfilait quoi que ce soit dans
  `RedisDeliveryQueue`, donc un participant hors ligne à cet instant ne recevait rien à la
  reconnexion — `_drainPendingMessages` n'avait rien à rejouer, et le client web ne refetch
  pas (`staleTime: Infinity`). Le message n'apparaissait qu'au prochain refetch complet et
  sans rapport de la conversation.

  C'est la classe d'événement la plus grave à laquelle ce trou pouvait rester ouvert : pas un
  compteur de réactions périmé mais un **message entier**, sur le seul transport d'envoi dont
  dispose un participant anonyme.

  Correctif : un diffuseur unique `broadcastLinkMessage` nommant les **deux** audiences
  (room live + file hors ligne) par lequel passent les deux routes, un nouvel `eventType`
  `'link-message'` rejoué en `link:message:new` par le drain, et — pour que la prochaine
  famille d'événements soit un appel plutôt qu'une sixième copie — une implémentation unique
  de la troisième audience (`offlineParticipantQueue`) à laquelle délèguent désormais les
  cinq fan-out jusqu'ici recopiés dans `MessageHandler`, `MeeshySocketIOManager`,
  `reactionOfflineQueue` et `AttachmentReactionHandler`.

- 2588559: La pastille de non-lus bouge enfin quand un message arrive par lien de partage.

  `conversation:unread-updated` est le seul signal live qui incrémente le compteur de non-lus
  d'un destinataire. Les deux routes d'envoi par lien (`POST /links/:identifier/messages` et
  son jumeau `/messages/auth`) ne l'émettaient pas : elles annoncent le message dans la room
  puis l'enfilent pour les hors-ligne, et c'est tout.

  Le handler web `link:message:new` remonte bien la conversation en tête de liste avec son
  nouvel aperçu — mais il ne touche **pas** au compteur, et la liste tourne en
  `staleTime: Infinity`. La conversation sautait donc en tête pendant que sa pastille
  continuait d'afficher sa valeur d'avant : le badge ne devenait pas périmé, il mentait. Le
  lien de partage étant le seul transport d'envoi d'un participant anonyme, tout ce trafic
  produisait ce mensonge.

  Racine, quatrième cycle consécutif sur la même : l'éventail destinataire existait en **deux**
  implémentations — `MessageHandler._updateUnreadCounts` (`private`) et un bloc inline de
  `MeeshySocketIOManager._broadcastNewMessage` — ne différant que par le prédicat d'exclusion de
  l'expéditeur, c'est-à-dire par une valeur et non par un comportement. Aucune des deux n'était
  atteignable depuis une route.

  Correctif : une unité unique `emitUnreadCountsToRecipients` (`socketio/emitUnreadCountsToRecipients.ts`)
  par laquelle passent désormais les trois transports d'envoi. Elle exclut l'auteur par ses
  **deux** identités (`Participant.id` sur REST/ZMQ et lien, `User.id` sur WS — deux espaces
  d'ObjectIds qui ne se recoupent jamais, donc élargir ne coûte aucun faux positif), adresse un
  participant sans compte par son id de participant (la population même du transport lien), et
  accepte une liste de participants préchargée pour ne pas ajouter d'aller-retour sur le chemin
  le plus chaud du service. Best-effort : jamais dans le chemin de l'ACK, jamais un 500.

  `conversation:updated` reste délibérément absent du chemin de lien, pour la raison inchangée
  du cycle précédent — et c'est précisément l'argument qui ne tient PAS pour la pastille, que ce
  handler n'applique jamais.

- Updated dependencies [5647020]
  - @meeshy/shared@1.8.7

## 1.22.5

### Patch Changes

- 1475348: Les réactions faites en REST atteignent désormais les participants hors ligne.

  `ReactionHandler` (transport socket) enfilait chaque bascule de réaction dans la file de
  livraison pour chaque participant hors ligne. Les **quatre routes REST** de réaction
  (`POST /reactions`, `DELETE /reactions/:messageId/:emoji`,
  `POST|DELETE /conversations/:id/messages/:messageId/reactions`) et le chemin de réaction
  d'agent n'émettaient que vers la room `conversation:<id>` : une réaction posée pendant
  qu'un pair était hors ligne lui était perdue définitivement. REST est le transport
  **primaire** des réactions sur iOS (`MeeshySDK/Services/ReactionService.swift`).

  Correctif : une implémentation unique de l'audience hors ligne
  (`socketio/reactionOfflineQueue.ts`) et un diffuseur unique nommant les deux audiences
  (`socketio/broadcastReactionMutation.ts`), par lesquels passent désormais les sept
  écrivains de réaction.

## 1.22.4

### Patch Changes

- 9773739: `POST /user-preferences/reorder` répondait `200` et diffusait le nouvel ordre à
  tous les appareils de l'utilisateur **sans rien écrire** dès que la conversation
  n'avait pas encore de ligne de préférences : `updateMany` ne matche aucun
  document, et n'en signale rien.

  Les deux clients appliquent l'ordre de façon optimiste et prennent ce `200` pour
  le commit (iOS `ConversationStore.reorderConversations`, web
  `UserPreferencesService.reorderInCategory`). Tous les appareils affichaient donc
  un ordre que le serveur ne détenait pas, jusqu'à ce qu'un refetch sans rapport le
  fasse revenir en arrière.

  La route était aussi le dernier écrivain de `UserConversationPreferences` hors
  de `conversationPreferencesSync`. Le nouveau `reorderConversationPreferences` y
  rentre : il `upsert` (donc crée la ligne manquante), restreint le lot aux
  conversations dont l'utilisateur est participant actif — un `upsert` non
  restreint laisserait n'importe quel appelant authentifié créer des lignes contre
  des ids arbitraires, ce que `updateMany` absorbait pour la mauvaise raison — et
  ne diffuse **que ce qui a été écrit**.

  `version` n'est délibérément pas incrémenté : `USER_PREFERENCES_REORDERED` ne
  porte pas de version et iOS `applyRemoteReorder` l'applique sans garde ;
  l'incrémenter avancerait un compteur qu'aucune diffusion ne transporte.

## 1.22.3

### Patch Changes

- c89044d: Supprimer/restaurer une conversation et vider son historique se propagent enfin aux autres appareils

  `UserConversationPreferences` est une ligne **par utilisateur**, pas par
  appareil : chacune de ses écritures doit incrémenter `version` (le schema la
  déclare monotone, les clients jettent `incoming.version <= local`) **et**
  diffuser l'instantané sur `user:<id>`. Les deux moitiés ne valent que
  conjointes — un incrément que personne ne reçoit ne change rien, une diffusion
  non versionnée est jetée par tous.

  Trois écrivains vivaient hors de `conversation-preferences.ts` —
  `DELETE /api/conversations/:id/delete-for-me`,
  `POST /api/conversations/:id/restore-for-me`,
  `POST /api/conversations/:id/clear-history` — et n'honoraient **ni l'une ni
  l'autre**, alors qu'ils écrivent précisément les deux colonnes
  (`deletedForUserAt`, `clearHistoryBefore`) que `ConversationPreferencesPayload`
  déclare et que `ConversationStoreSocketBridge` (iOS) mappe déjà sur `userState`.

  Un unique `writeConversationPreferences`
  (`services/gateway/src/services/conversationPreferencesSync.ts`) porte désormais
  les trois obligations en un seul endroit, et les quatre sites d'écriture y
  passent — un cinquième ne peut plus n'en appliquer qu'une partie.

## 1.22.2

### Patch Changes

- 00d7230: Le reset des préférences d'une conversation ne casse plus la monotonie de `version`

  `DELETE /user-preferences/conversations/:id` diffusait un reset porteur de
  `version = ligne.version + 1` **puis supprimait la ligne**. Le compteur vivant
  sur la ligne, l'`upsert` suivant repartait à `version: 1` — en dessous du reset
  que les autres appareils venaient d'enregistrer. Appliquant la règle documentée
  `incoming.version <= local -> drop` (schema Prisma : « Monotonic version for
  optimistic-concurrency resolution »), ils jetaient silencieusement ce premier
  épinglage/sourdine/archivage post-reset, et tous les suivants avec lui, jusqu'à
  un refetch complet sans rapport.

  Le reset restaure désormais les colonnes de préférence à leurs valeurs par
  défaut **en place**, en incrémentant `version` dans la même écriture atomique :
  la séquence traverse le reset. `version` est un état de protocole, pas une
  préférence utilisateur — un reset ne doit pas le rembobiner. Contrat REST
  inchangé (P2025 → 404 sur une conversation sans ligne). `CONVERSATION_PREFERENCES_DEFAULTS`
  gagne au passage `mentionsOnly` et `clearHistoryBefore`, qui manquaient à
  l'instantané par défaut alors qu'ils font partie du payload diffusé.

- 49a661d: Echo the clientMessageId back to a share-link message's author, and withhold it from its peers

  The share-link send routes persist the `clientMessageId` the client sends
  (`message.create` writes it) but never gave it back. Neither the 201 body nor
  the `link:message:new` payload carried it, so an author had no way to tie the
  server's message to the optimistic row already on screen: reconciliation by cid
  is impossible when the cid never comes back, and the message renders twice.

  The nominal `message:send` path settled this contract already (Phase 4 §6.2) and
  splits it in two: the sender's payload keeps the cid so the by-cid promotion can
  run; the peers' broadcast is stripped of it so a third party never learns the
  sender's optimistic-id space. The share-link routes now follow the same rule
  through the same helper — `buildLinkMessagePayload` builds the author's payload,
  `stripClientMessageId` derives the peers'.

  Consequently the 201 body and the socket payload are no longer byte-identical;
  they are equal modulo `clientMessageId`, which is what the response-contract
  test now asserts. `stripClientMessageId` became generic and type-preserving:
  returning `Record<string, unknown>` re-widened every typed payload passing
  through it, which is exactly what broke the typed `link:message:new` emit whose
  contract requires `id`/`conversationId`/`senderId`.

  Also declares `clientMessageId` in `sendMessageBodySchema`. Both routes read it
  and the Zod schema requires it, but the published request contract omitted its
  only mandatory field. Declared without `required`, so Zod stays the single
  validator and the error body for a missing cid is unchanged.

- 94e7074: Share-link send routes now return the whole message to its author, not a truncated shell

  The 201 body of `POST /links/:identifier/messages` and `.../messages/auth` is
  serialized by fast-json-stringify, which **silently drops every property the
  response schema does not declare** — no error, no log, just an absent key. Both
  schemas named five fields while the routes were building fifteen, so eleven were
  truncated on every send: `conversationId`, `senderId`, `isEdited`, `editedAt`,
  `deletedAt`, `replyToId`, `updatedAt`, the shared `location`, and most of the
  sender.

  The anonymous route was the worst case: it declared `sender: { type: 'null' }`,
  so the participant it had just loaded from Prisma was serialized as literal
  `null`. `use-anonymous-messages.ts` reads exactly that field to build the
  author's own optimistic message, which therefore never had a sender. A location
  shared through a share link came back with no location at all, and neither route
  told the author which conversation its message belonged to — the same routing
  gap the socket path closed one cycle earlier.

  Root cause of the drift: each route built the message payload **twice**, once for
  the `link:message:new` emit and once for the REST body. When `conversationId`
  and `senderId` were added to the socket literal, the REST twin was left behind.
  Both now derive from a single `buildLinkMessagePayload`, so the author and the
  other participants receive the same object by construction, and one
  `linkMessageSchema` declares that shape for both routes.

  `sender` is a `Participant` (id, userId, displayName, avatar, type, language,
  nested user), which is what the socket path has always delivered;
  `messageSenderSchema` described a user shape a participant cannot satisfy and
  only ever let the intersection through. The change is additive on the wire — no
  previously present field was removed.

- Updated dependencies [49a661d]
- Updated dependencies [9b5921f]
- Updated dependencies [94e7074]
  - @meeshy/shared@1.8.6

## 1.22.1

### Patch Changes

- e842007: fix(gateway/zmq): a malformed translation_completed frame no longer poisons the
  (taskId, targetLanguage) dedup slot

  `ZmqMessageHandler.handleTranslationCompleted` stamped `resultKey` as processed
  _before_ validating the payload. A malformed frame (missing `result` /
  `result.messageId`) therefore consumed the dedup slot and early-returned; the
  translator's at-least-once re-delivery of the valid result for the same
  `taskId+targetLanguage` was then dropped by the `has(resultKey)` guard, leaving
  the recipient stranded on the untranslated original (Prisme violation). The
  dedup `add` + LRU trim now run only after validation succeeds, so only accepted
  events consume a slot.

## 1.22.0

### Minor Changes

- Changements automatiques détectés :

  - dedupe missed-call notifications across racing terminal paths
  - dead call:check-active replay + web listener leak on unmount (#2574)
  - presence check for immediate high-priority email must target ROOMS.user, not the bare user id
  - corrige ITMS-90035 a la source — identifier des stubs de frameworks sans code
  - colore mentions et hashtags de façon adaptative light/dark dans posts/commentaires/reels/moods
  - accepte [beta] {beta} et guillemets en plus de (beta)
  - unifie l'affichage de la progression audio (waveform, pourcentage, minuteur)
  - synchronise le badge non-lu de la conversation au chargement initial
  - le push APNs n'écrase plus la facette liste posée par le socket message:new
  - repli sur l'identité locale quand un écho socket omet l'enveloppe expéditeur
  - hasLocalVideoTrack survives a survival downgrade, camera-switch mirroring desync on failure
  - un retry de transcription n'ecrase plus une transcription livree
  - drop translations completing after a message is soft-deleted (#2566)
  - drop translations completing after a message is soft-deleted
  - transcription-segment guard used literal 'ended' instead of CALL_TERMINAL_STATUSES (#2564)
  - guard call:ended against a stale/unrelated callId (#2562)
  - synchronisation fiable des non-lus — gateway + web + iOS (#2560)
  - guard against stale transcription callbacks and redundant CallKit mute round-trip (#2559)
  - résout l'auteur du DM immédiatement au bump temps réel
  - résout 8 warnings Xcode Cloud (concurrence, code mort, dépréciation)
  - résout 3/4 warnings Xcode Cloud sur StoryExporter
  - résout 2 warnings Xcode Cloud (fullSync, switch exhaustif)
  - résout les warnings de concurrence sur ExtractionBox
  - propage draftId au chemin de publication en ligne
  - normalize source language sent to translator (Prisme parity)
  - fan out disconnectUser/sendToUser/isUserInConversationRoom across all devices
  - ajoute la clé hashtag.results.empty au catalogue (7 langues)
  - fusionne ancienneté et « Republier » sur une ligne de pied
  - sync own message reactions across devices via reactor userId
  - reduce deprecated ISO 639-1 aliases (iw/in/ji) to canonical codes
  - route friend-request read-marking through NotificationService (multi-device bell sync)
  - déclare metadata dans messageSchema — la bulle d'appel restait figée sur "en cours"
  - traduction audio cassee en prod — TTS opus + echec silencieux (#2565)
  - align canEditMessage SSOT with the real 24h edit window

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.8.5

## 1.21.0

### Minor Changes

- Changements automatiques détectés :

  - methodes tus explicites au lieu de fastify.all — QUERY exclu
  - aligne fastify agent sur ^5.11.0 — copie unique, augmentation @fastify/jwt restaurée
  - correct stale grpcio-tools guard comment post #2515
  - revert typescript 7.0.2 vers 6.0.3 — ts-jest incompatible TS 7
  - pinch-to-resize PiP bulle d'appel + fix long-press
  - keyGenerator explicite pour ROUTE_RATE_LIMITS calls (#2529)
  - resolve early-dedup senderId to User.id, not Participant.id (#2509)

## 1.20.1

### Patch Changes

- Changements automatiques détectés :

  - restreindre le build translator de release.yml a amd64 (#2505)

## 1.20.0

### Minor Changes

- Changements automatiques détectés :

  - My Stories grid + publish-time cover use pixel-perfect renderer
  - pixel-perfect story cover rendering (StoryStaticSnapshot)

## 1.19.0

### Minor Changes

- Changements automatiques détectés :

  - affiche le bouton commentaire de manière fiable
  - corrige le rognage du texte story (hauteur emoji + largeur police cursive)
  - badge reset for opted-out users emitted a hardcoded unreadCount:0, wrongly clearing the reader's badge on a partial read
  - page de résultats /hashtag/[tag] + hashtags tendance
  - ReelPlayer rend la caption via PostContentText
  - PostCard + PostDetail rendent la caption via PostContentText
  - composant PostContentText (mentions+liens+hashtags)
  - postsService.getPostsByHashtag + getTrendingHashtags
  - #hashtag tap route vers HashtagResultsView (deep link)
  - Route.hashtagResults + rendu
  - écran de résultats HashtagResultsView
  - PostServiceProviding.getPostsByHashtag + getTrendingHashtags
  - les captions passent par MessageTextRenderer (mentions/liens/hashtags)
  - nouveau segment hashtag dans MessageTextRenderer
  - les mentions sont colorées (mentionColor jamais passé)
  - endpoints recherche + tendances
  - câblage création + édition de post
  - nettoyage des hashtags retirés à l'édition
  - persistance createPostHashtags + recompte usageCount
  - extraction pure — HashtagService.extractHashtags
  - schema Hashtag + PostHashtag
  - forceCleanupParticipationAfterLeaveFailure invalidated the call:signal cache before the leftAt write, not after
  - markCallAsMissed never invalidated the call:signal session cache (#2478)
  - bound \_seq allocation so a stalled nextSeq never blocks the realtime path
  - xcodegen régénère le pbxproj -- AppSourceGuard(.swift/Tests) manquait au target
  - ferme le circuit succès/échec/annulation du brouillon gelé
  - supprime un reel EN DIRECT sur post:deleted
  - la republication met à jour la fenêtre au lieu de l'avaler, endMs plafonné à la durée réelle
  - découverte par proximité géographique (posts/reels/stories)
  - l'upload manuel accepte une forme d'onde du client
  - le header descend la fenêtre du fond — le compteur M:SS s'arme au reader
  - l'item de publication porte son draftId de bout en bout
  - cycle de vie de publication sur StoryDraftStore
  - les composers et l'edition appliquent la regle de composition REEL
  - le crédit son défile en cercle et se termine par le temps restant
  - la capture grave enfin la forme d'onde sur le Sound cree
  - la forme d'onde du client traverse jusqu'au CaptureTrack
  - la regle de composition d'un REEL exige video, audio ou >= 2 images
  - SoundUsage enregistre la part du SON, plus la position sur la timeline
  - borner sourceStart et intrinsicDuration sur les DEUX schemas
  - les parseurs lisent les fenetres timeline ET source
  - computeStoryDurationMs redevient le miroir exact d'iOS
  - la video de FOND recoit le bouton de coupure du son
  - resolution pure du fond video pour le bouton de coupure
  - impose la fenêtre d'édition 24h sur message:edit (parité REST)
  - clear stale retry offer once a later call on the conversation resolves
  - l'aperçu de conversation compose un libellé pour un message position-seule
  - chips Fichiers et Bibliothèque dans la feuille d'enregistrement audio
  - le brouillon audio-seul devient un citoyen de plein droit
  - phase 3 — un upload PostMedia sans uploadeur identifiable est REFUSÉ
  - zéro any dans CallEventsHandler — parsing d'erreur unifié
  - localise l'unité de taille de fichier des attachments
  - l'upload ecrit durationMs — la story dure enfin tout l'audio
  - fidélité de reprise des brouillons (audience + langue) et sélection visible
  - le credit defilant du son de bibliotheque atteint le HEADER du reader
  - mute d'auteur un-bouton par piste, honore par canvas, previewer et reader
  - le funnel reseau presente l'auth aux medias proteges de MEME ORIGINE
  - REST end/leave routes never invalidated the call:signal cache
  - parité du nettoyage d'appel pour un participant anonyme qui se déconnecte
  - le tap sur l'avatar Moi rouvre la liste « Mes stories » (supersession 2026-08-02)
  - lire l'ENSEMBLE des rooms atteintes, pas la forme des appels io.to
  - pagination offline du feed depuis feed_posts locale (lecteur GRDB activé)
  - credit defilant du son de bibliotheque dans la chip audio
  - le like d'un tiers reçu par socket n'allume plus isLikedByMe en GRDB
  - la localisation live n'est plus renvoyée à son propre partageur (self-echo)
  - post:updated et post:deleted atteignent aussi la post room
  - une mutation sociale enfilée en ligne part immédiatement
  - la bibliotheque n'est plus invisible — mutedAt:null ne matche pas un champ absent
  - les 4 sinks socket muets persistent leur mutation en cache
  - le détail de post rattrape post + commentaires au reconnect social
  - le test du save debounce survit au retardataire d'un test voisin
  - trois cles a11y orphelines de MyStoryRow quittent le catalogue
  - 6 cles des confirmations et de la reprise d'echec au catalogue (7 langues)
  - reprendre un echec de publication, confirmations de suppression, purge du code mort
  - publier un brouillon repris ne detruit plus ses medias, adoption sans double invite
  - le store de brouillons ne peut plus perdre le travail qu'il protege
  - message:send-with-attachments preserve view-once/blur/expiry effects
  - les 9 cles story.mine des onglets et cartes entrent au catalogue (7 langues)
  - le guard CallManager suit la vraie fin de l'init
  - DiskCacheStoreTests cesse de dependre du reseau vivant
  - staging couvre la bibliotheque de sons (UPLOAD_DIR, volume, drapeau)
  - le reconnect social rattrape le tray par un delta depuis le curseur affiché
  - broadcast call:ended for initiateCall's own GC sweeps
  - detach zmqClient listeners on translateTextDirectly timeout
  - typing:stop retracts + untracks when the indicator preference flips OFF mid-burst
  - broadcast participant-left for anonymous guest disconnects
  - le ré-armement des sinks feed rattrape le trou par un refresh silencieux
  - retour sur le feed = rejoindre la room feed:subscribe explicitement
  - flush() pagine le backlog au lieu de geler les rows au-delà de la 50e
  - sendReply transite par l'outbox durable et effectFlags survit à l'enfilement
  - les traductions des messages envoyés survivent au cold start
  - la collision d'ids de traduction ne fait plus rollback le batch de messages
  - les événements d'engagement socket écrivent toutes les clés cache du post
  - le like optimiste écrit TOUTES les clés cache du post, pas seulement la sienne
  - un changement de userState mergé depuis le store persiste la liste
  - le coalescing markAsRead fusionne les messageIds au lieu de les jeter
  - garde anti-clobber outbox sur insertPosts + reapplication memoire des likes pending
  - duration formatting, retry-logic dedup, toggle-handler dedup, silent validation drops
  - les resultats messages locaux affichent le nom de conversation du cache — plus d'ObjectId brut offline
  - loadMore() separe le premier rendu cache de la pagination reseau
  - .expired/.empty peignent GRDB avant le reseau — metadonnees audio hydratees offline
  - savePreservingFreshness — les mutations locales ne rajeunissent plus l'horloge SWR
  - le cache main-feed garde les 100 posts les plus RECENTS — plus de tranche vieille servie en .fresh
  - FriendshipCache seede depuis les stores persistes — statuts d'amitie justes au cold start offline
  - la branche .expired peint la derniere donnee disque — plus d'ecran vide offline apres TTL
  - deleteAll(conversationId:) cascade aux tables enfants — plus d'orphelins apres revocation
  - la retention 6 mois fonctionne enfin — cascade reelle, plus de rollback avale
  - les reconciliateurs bumpent changeVersion — leur refresh n'est plus avale par le diff O(1)
  - la maintenance SQLite passe sous la garde beginBackgroundTask — fin du risque 0xdead10cc
  - le trio de traduction texte reste chaud sous memory warning
  - la branche .expired de load() flushe la victime dirty avant de la jeter
  - flushAll, eviction et compteur de test couvrent les 27 stores GRDB — plus d'etat perdu au kill
  - un memory warning ne detruit plus la table des traductions persistees
  - authToken/anonymousSessionToken sous verrou — la paire ne se dechire plus
  - annulation au logout + gate de session dans les handlers — fin de la boucle deconnectee
  - reset() purge MediaConsumptionStore et les checkpoints TUS — residus cross-compte
  - purge des impressions persistees et de PendingStatusQueue — residus cross-compte
  - UserCategoryStore — reset au logout et CRUD optimiste avec rollback
  - reset() purge UserDisplayNameCache — residu cross-compte en RAM
  - l'invalidation de session signale la perte des envois en attente — la purge reste inconditionnelle
  - les watermarks de delta-sync sont remis a zero au logout ET a la re-authentification
  - un brouillon compose son thumbHash des le premier enregistrement
  - le logout wipe l'App Group — widgets et relais du compte sortant
  - plus de conversations fabriquees — etats vides explicites et samples reserves a la galerie
  - le logout purge les tables feed et send_attempts — residu cross-compte at-rest
  - reset() purge l'outbox d'etat de conversation — fin du rejeu cross-compte
  - le logout purge la file d'actions settings — fin du PATCH cross-compte
  - retryAll ne rejoue plus les messages media en texte-only
  - la bande de glyphes debordait sa colonne, les cartes se chevauchaient
  - VideoFilterConfig devient nonisolated — le bundle de tests recompile
  - la vignette de carte delegue au resolver, elle ne le reimplemente pas
  - « Mes stories » passe a deux onglets — Publiees et Brouillons
  - la délivrance d'un message ne dépend plus d'un enrichissement best-effort
  - la carte et sa bande de glyphes, comparables donc peu couteuses
  - le bouton Reprendre du bandeau de brouillon ne casse plus sur quatre lignes
  - le canvas du composer parle à VoiceOver — et le code mort du flux story disparaît
  - le canvas s'ouvre vivant — amorces discrètes, swipe vers le texte, zéro délai artificiel
  - synchronize VideoFilterPipeline.config against the capture-queue race
  - isole l'extraction des frames binaires multipart dans un helper pur testé
  - complète le commit publication — mock et clés de catalogue restés hors commit
  - le fond s'affiche même quand le média n'est pas rattaché au post
  - le repost rend enfin un Bool, et s'ouvre sur la dernière audience
  - l'audience initiale s'injecte, et reprendre un brouillon la filtre
  - ajouter un son ne déforme plus le panneau — forme d'onde bornée
  - les regles de la carte « Mes stories » deviennent des donnees
  - autant de brouillons qu'on veut — le store cesse d'en ecraser un
  - le badge d'echec ne confisque plus l'acces a mes stories
  - termine la migration du loquet de publication, et la sonde -O cesse de mentir
  - l'éditeur audio cesse de sortir du viewport — safe area comptée deux fois
  - la mesure du champ ne doit pas rearmer le layout qui l'appelle
  - l'edition de texte a enfin sa ZONE — centree, bornee, ombragee
  - la fiche de profil adopte la trame aérée des réglages
  - publier rend la main immédiatement — file d'uploads, visibilité mémorisée, queue robuste
  - « 99+ » s'affiche enfin, la pastille s'élargit, le gras tombe
  - reapplique 1.0.1 au pbxproj, perdu par un auto-merge
  - trame aérée partagée, filets alignés, fiches (i) en verre
  - retire cinq clés mortes du cache, rend son hint au bouton de purge
  - PiP système — ancre survivante, mode restauré, signal caméra honnête
  - retablit -O + wholemodule, le contournement d'avril est obsolete
  - suspendre le Now Playing pendant un appel, reprendre au retour au repos
  - reliquats de revue du chrome — grabber tapable, code mort, contexte de sortie exact
  - identité d'icônes — variante dark vide, tinted inversée, template CallKit absent
  - l'ouverture de la Timeline devient une intention UNIQUE — le canvas réserve enfin sa place
  - le chrome du composer devient une machine à état unique — plus d'écran nu possible
  - la page du son — ce qui a été publié avec lui
  - un composer vierge ne piège plus la sortie ni ne sème de brouillon fantôme
  - la suppression d'un swap ne disparaît plus si l'agrégation échoue (#2437)
  - résolveur audio nonisolated, et plus de faux « terminé »
  - purge sélective du cache par type et par domaine
  - un aperçu qui échoue ne laisse plus la ligne sur « stop »
  - un son emprunté ne publie plus en silence
  - l'aperçu joue vraiment, et la ligne se lit sans titre
  - l'éviction trie par date d'ACCÈS, plus par date de téléchargement
  - compteurs affichables — publications distinctes et lectures
  - sélecteur de sons — « Mes sons » et « Tendances », avec recherche
  - remplissage ouvert (PUBLIC + COMMUNITY) et vignette pour le sélecteur
  - crédit d'auteur, titre donné par l'auteur, page du son
  - les lots d'impressions etaient perdus a la sortie d'ecran et a la fermeture
  - aligne la semantique d'impression sur celle des clients iOS
  - portee comptee a chaque apparition, et le detail ecoute enfin les likes
  - le like ne survivait que dans la vue qui l'avait pose
  - corrections issues de la revue multi-prisme (correction, sécurité, tests)
  - purge la dette bloquante du lot A — recomptage, libération, formats
  - restaure les 5 cles de position ecrasees par un checkout concurrent
  - la vignette map n'etire plus la card du post + titres et theme assainis
  - 5 cles de position au catalogue, purge d'une cle morte, numero de build degele
  - ferme la troisième porte d'attribution et la purge sur édition partielle
  - descente du plafond a 5 Mbps (÷11,8 depuis l'origine)
  - le MP4 exporte passe de 58,8 a 7,5 Mbps (÷7,8)
  - l'ecran des demandes d'ajout laissait ses notifications non lues en cache
  - fullSync perdait la frontiere de lecture des pages 2+
  - les lectures ne se defaisaient plus — pastille et notifications
  - referme la porte repost de createPost et pose le drapeau de rollout
  - accepte post, story et sound — les signalements iOS partaient en 400
  - purge les usages des stories supprimées et décrémente le compteur
  - mutedAt arrête réellement la diffusion de la copie de bibliothèque
  - le build local repart de 1263, et un mecanisme va chercher la verite chez Apple
  - ferme la route /use, hache l'upload manuel, projette la liste publique
  - routes /sounds avec garde d'autorisation et projection explicite
  - capture branchée sur création et édition, rattachement gardé
  - la position d'un post se change et se retire à l'ÉDITION
  - SoundCaptureService — hash en flux, scope post, garde d'emprunt
  - borne soundId et les champs audio non validés du blob storyEffects
  - volume dédié servi par la route JWT, fin de l'écrêtage de durée
  - modèle Sound + SoundUsage, collection figée par @@map
  - le fond ne rembobine plus a la frappe, le texte reste au-dessus de ses outils
  - reposts et commentaires gardent leur position ; purge de la voie morte FeedMedia.location
  - la position d'un post s'affiche et s'ouvre en plein ecran partout
  - la pastille de lieu s'ouvre en carte plein ecran au tap
  - la position d'un post survit au passage domaine
  - le hit-test de la pastille de lieu partage la mesure du rendu
  - défaut français partout au composer — drapeau seul sur le bouton langue du post
  - l'aperçu photothèque sonne, 19 vignettes derrière un « + » de tête
  - warm-up à pile PLATE + coupes du header flottant — le boot rend la vue sans déborder
  - pré-rendu DEBUG au boot — éteint la classe des stack-overflows du décodeur de métadonnées
  - journalise les échecs de snapshot et de collage, ajoute la garde de câblage onIngest
  - la vignette de lieu devient une image statique — le snapshot ne crashe plus
  - horloge sur l'heure de publication, note + onde pour l'audio de fond, noms bornés à 16
  - une mise à jour de point ne publie plus qu'une fois, et la garde des entrées du composer de mood couvre les quatre sites
  - le dépôt ne fabrique plus de repli, et garde le vrai nom
  - les doubles d'exporteur suivent la signature `branding:`
  - le picker de lieu ne gele plus — la carte n'ouvre plus en .userLocation(fallback:)
  - les mocks de `@/lib/config` gardent l'implémentation réelle
  - le drop résout ses providers en séquence, pas en TaskGroup
  - un seul débit, marque fusionnée et mémoïsée — 5,6 s → 3,8 s
  - la position manquait au protocole — iOS ne compilait plus
  - envoyer le lieu partagé depuis une conversation
  - rendu du lieu reçu depuis message.location
  - crash device (3e coupe) — le glyphe du bouton recherche devient une struct nominale
  - transporter le lieu partagé sur les trois transports d'un message
  - les echantillons photo cessent d'etre flous — .fastFormat rendait un degrade definitif
  - câblage onIngest des surfaces commentaires et réponse à une story
  - retirer les DTOs mortes du partage de position statique
  - les deux extractRepostPayload oublient la pastille de lieu
  - câblage onIngest dépôt/collage sur les deux composers de la surface POST
  - câble onIngest (dépôt & collage) du composer vers les pipelines existants
  - cible de dépôt et collage file:// dans UniversalComposerBar
  - composerHasContent ignore les pastilles de lieu
  - couche pure d'ingestion dépôt/collage (résolveur, routeur MIME, détecteur file://) avec tests
  - la pastille de lieu prend la palette de marque, plus les couleurs systeme
  - poser, deplacer et exporter une pastille de lieu
  - meeshy.sh test execute enfin la suite du package MeeshySDK
  - la cover du tray et le ThumbHash montrent la pastille de lieu
  - le canvas live cesse d'evincer la calque de la pastille a chaque tick
  - la pastille de lieu vit dans StoryEffects, donc elle survit au brouillon et part au serveur
  - la suite MeeshySDK redevient verte — le décodeur du test refusait les dates du gateway
  - un « vu » de story épuisé squattait la pastille pour 7 jours
  - la pastille de lieu est dessinee par StoryRenderer, donc exportee
  - StoryLocationObject, une pastille de lieu posable sur une slide
  - retire force-init, qui offrait un compte BIGBOSS à qui la demandait
  - la garde d'authentification cesse d'être toujours fausse
  - le contenu d'une conversation cesse d'être lisible par n'importe qui
  - le fond audio enregistré s'annonce — note au header, waveform au canvas
  - un jeton à signature invalide ne délivre plus de jeton valide
  - l'aperçu du tray se rend à la volée côté récepteur
  - les cinq routes d'administration exigent enfin une identité
  - un envoi hors-ligne conserve sa position au flush
  - les avatars/bannières relatifs se résolvent contre l'origine API
  - ferme le contournement d'authentification x-user-id sur les routes voice
  - un post et un commentaire conservent leur lieu partage
  - l'avatar du compte affiché partout où les données le fournissent
  - un message conserve son lieu partage apres relaunch
  - les bulles d'appel ne testent plus la langue du simulateur
  - le commentaire du feed envoie enfin la position choisie
  - createOfflineMediaPost accepte un lieu en attente
  - exclure les posts texte+position de la file durable
  - lot 3 - les apercus de conversation restituent la position
  - authentification obligatoire et garde d'appartenance inconditionnelle sur /translate-blocking
  - un seul rendu de lieu, alimente par SharedPlace
  - la position d'un message survit aux deux chemins d'envoi
  - les deux chemins de publication transportent la position, meme sans texte
  - lot 1 - le message affiche en entier restitue sa position
  - la tuile d'aperçu de lieu n'imbrique plus un String(localized:) dans le defaultValue d'un autre
  - pointOfInterestCategory vit sur MKMapItem, pas MKPlacemark
  - dette française à zéro — 26 dernières clés, et 84 valeurs sources réaccentuées
  - les 8 surfaces du feed restituent la position d'un post
  - la position d'un commentaire survit a l'apercu embarque dans un post
  - un post et un commentaire transportent et restituent un lieu partage
  - un message transporte et restitue un lieu partage
  - supprime le hop MainActor qui envoyait geoManager hors de son acteur
  - message, post et commentaire decodent un lieu partage
  - un seul CLLocationManager pour les en-tetes geo, et un cache negatif
  - SharedPlace, representation unique d'un lieu partage
  - validation d'un lieu partage et extraction depuis metadata
  - un seul releve en vol, un echec rearme la garde
  - le delegate CoreLocation est cable au premier usage, pas depuis init
  - le modele du picker est nonisolated, sa deinit ne double-libere plus au demontage
  - l'identité d'une épingle de carte ne change plus à chaque rendu
  - lot 6 — liens, parrainage, affiliation, chaînes à format (35 clés)
  - lot 5 — sécurité, compte, profil vocal, états vides (109 clés)
  - lot 4 — bulles, composer, statuts, permissions, appels (65 clés)
  - lot 3 — feed, réels, communautés, appels (63 clés)
  - lot 2 — réglages, profil, conversation, authentification (83 clés)
  - 97 clés cessent de s'afficher en français dans une interface anglaise
  - une seule bulle de pensée, quel que soit l'imbrication des hôtes
  - les événements story/post à dates ISO ne sont plus silencieusement perdus
  - supprime le pont de publication qui bouclait sur lui-même
  - la liste dit les vues, le cœur ne ment plus, et l'édition d'une story publiée existe enfin
  - plus une seule clé .module sans traduction
  - une story publiée depuis un iPad partait dans une file sans consommateur
  - éditer une story remet son engagement à zéro, jamais sa date de publication
  - les vues du SDK parlent enfin les 7 langues
  - une seule source de chemin réseau, et plus aucune file qui dort
  - le tray de stories quitte le fil, et ScrollOffsetRelay compile
  - la ligne de conversation dit la vérité, le badge tombe à l'arrivée en bas
  - rendre la timeline navigable et sa fiche honnête
  - plus aucun bouton inerte à l'ouverture sur iPad
  - call:analytics now requires real call participation, not just conversation membership (#2435)
  - add missing localization keys, fix mistranslation, add hint (#2433)
  - anonymous disconnect leaveCall now stamps connectionLost (#2431)
  - la permission d'envoi ne se ferme plus sur le quota de joins du lien (#2430)
  - reconcile CallKit action timeouts and audio-reactivation race (#2428)
  - replay offline delivery queue even when presence snapshot build fails (#2434)
  - normalize recipient language before per-language message fan-out (#2432)
  - réancre les gardes a11y et purge les clés mortes
  - l'extension de partage envoie réellement
  - « +10 s » revient, adossé à une durée d'auteur
  - la barre de défilement s'aligne sur la course des clips
  - une poignée de défilement sous les pistes
  - la courbe de volume prend sa propre bande, sous le titre
  - la règle d'activation passe sous NSExtensionAttributes
  - la garde des cibles tactiles lit enfin le fichier qu'elle prétend garder
  - la règle reste lisible sur toute la plage de zoom
  - le secrets.yml ANDP redescend dans .andp/
  - l'export applique enfin l'atténuation automatique
  - l'auteur peut couper l'atténuation automatique d'un clip
  - la version reprend le séparateur · avant le build
  - la signature met la version en gros et se réduit à « Par Services CEO »
  - poser et lire les points de volume depuis la fiche
  - forme d'onde sous les vidéos et courbe de volume sur les pistes
  - region-strip the resolveParticipantLanguage fallback (#2429)
  - la graisse rejoint l'alignement, un tap dehors referme le panneau, les bulles portent leur couleur de trait
  - message-edit 24h bypass reads global User.role, not Participant.role
  - predicat pur de composition REEL + degradation creation + 422 edition
  - un media TUS sans champ commentId redevient rattachable
  - un auteur revoit SES stories expirees, dans une fenetre bornee
  - resolve conversation id for stats on identifier join
  - order read/delivered cursor freshness by createdAt, not ObjectId string (#2439)
  - phase 2 — la revendication d'un média exige son propriétaire
  - propriétaire sur PostMedia — phase 1 du point 21
  - les impressions repetees d'un meme post n'en comptaient qu'une
  - impressions de story en 400 + route de marquage lu par post
  - ferme les quatre derniers trous d'authentification de l'audit
  - le cleanup des orphelins épargne les avatars/bannières de profil

## 1.18.0

### Minor Changes

- Changements automatiques détectés :

  - courbe d'automation du volume sur les pistes
  - poser et retirer des points de volume
  - le volume d'un clip peut monter jusqu'à 200 %
  - la forme d'onde reflète le niveau réel et se garde sur disque
  - la vidéo exportée reproduit l'automation de volume
  - le volume des médias suit le playhead
  - la clé de cache couvre tous les octets, la couleur du texte se rend enfin en direct
  - la vidéo de fond respecte enfin le volume choisi
  - un resolver unique décide du volume d'un clip
  - le volume devient un canal de keyframe, l'audio gagne l'automation
  - le volume d'un média peut monter jusqu'à 200 %
  - disconnect-grace expiry now ends calls with connectionLost, not completed (#2426)
  - le canvas reste plein écran pendant l'édition
  - une seule rangée de sept outils, Terminé seul en haut
  - le panneau Cadre gagne Aucun, une marge et un liseré
  - taille et graisse deviennent des curseurs du panneau Police
  - la rangée basse tourne au tap, ouvre à l'appui long
  - les sept attributs tournent au tap, le cadre ne repeint plus
  - les fonds préréglés deviennent une source unique
  - le calque rend la marge et le liseré du cadre
  - le cadre se détache du fond — aucun, marge, liseré
  - la fiche montre tout, temps comme espace
  - les poignées suivent le surlignage, un clip ne dépasse plus sa source
  - le tap surligne, le double tap ouvre, le glissement déplace
  - le header ne clignote plus entre gris opaque et transparent
  - la durée de slide dérive du contenu, sans exception
  - la barre de timing peut enfin allonger un clip
  - un seul chemin pour régler début, fin et durée
  - une seule règle pour les bornes d'une fenêtre de clip

## 1.17.1

### Patch Changes

- Updated dependencies [27d78d9]
  - @meeshy/shared@1.8.4

## 1.17.0

### Minor Changes

- Changements automatiques détectés :

  - traduire aussi les REEL et les STATUS à la publication
  - l'appui long des boutons rotatifs passe en geste prioritaire
  - rangée haute à rotation pour l'éditeur de texte
  - preserve $-sequences in link processing
  - canonicalize originalLanguage at the posts & comments write boundary (220i)
  - floating sticky day-header pill (WhatsApp-style) (#2403)
  - stamp negotiationId on outgoing WebRTC signals
  - canonicalize originalLanguage on write paths that bypass the funnel (#2401)
  - E2EE disclaimer at the top of encrypted history (#2400)
  - reject reactions on soft-deleted messages
  - canonicalize HH:MM at the write boundary + pad in isWithinDnd
  - scroll to the unread boundary on open (#2379)
  - skip re-broadcast + re-notify on idempotent post/comment reaction add (220i)
  - unread-messages separator above the first unread (#2376)
  - le parcours d'inscription parle enfin la langue de l'utilisateur (225i)
  - drag-to-category (re)assignment (#2373)
  - canonicalize customDestinationLanguage at the write boundary (219i)
  - les préférences de langue invalides retombent sur le niveau suivant (#2372)
  - normalize NODE_ENV before TURN secret security guard
  - restaure l'accessibilité perdue à la resynchronisation
  - canonicalize originalLanguage at the edit + link write boundaries (219i)
  - real-time category catalogue socket sync (#2365)
  - le profil vocal retrouve ses accents et sa barre de titre
  - hide decorative SF Symbols in ConversationEncryptionDetailSheet (214i) (#2334)
  - 220i `StatusComposerView` → `NavigationStack` + bouton « Publier » accessible · 221i `MeeshyShareExtension` localisée + rangée de contact accessible (#2346)
  - retire les marqueurs de conflit laisses par la resynchronisation
  - localize the bookmark feedback toasts (218i) (#2347)
  - canonicalize originalLanguage at share-link write boundary (219i)
  - le mini-lecteur devient atteignable au doigt (221i)
  - le formulaire de lien de parrainage devient audible (222i)
  - cache-first user-category catalogue hydration (#2361)
  - réconcilie la table d'armement avec le zoom d'ouverture corrigé
  - le test de recouvrement suit le champ openingSlideFraction
  - gestes verticaux, politique d'intro de groupe et overlay de révélation
  - remplace 293 try? par do/catch tracés — 7 pertes de données silencieuses corrigées
  - canonicalize originalLanguage at the write boundary (218i) (#2360)
  - dédup canonique des langues de l'aperçu de lien partagé (#2357)
  - scope analytics writes to the active row, fix stale docs (#2356)
  - plus aucun plafond de durée d'enregistrement, sur aucune surface
  - la durée attendue de l'export suit la carte de fin en 2 temps
  - pure UserCategoryCatalog reducer (parity iOS UserCategoryStore) (#2359)
  - le zoom d'ouverture du lecteur tournait à l'envers
  - expect the author end-card's two-phase tail in the export duration
  - la miniature d'une story filtrée montre enfin ce que le lecteur rend
  - group the list by user categories (Pinned → categories → Autres) (#2355)
  - le préchargement du repost range enfin sous une clé qu'on relit
  - unbreak the test bundle — realign MockPostService with PostService
  - MockPostService rend à repost son défaut de visibilité, et le flux repost teste enfin l'audience
  - rétablit la compilation du bundle de tests après le repost à audience
  - les médias de publication différée ne laissent plus de référence fantôme
  - explorateur de langues du reader — liste de conversation, plus LanguagePickerSheet
  - le dernier NavigationView passe à NavigationStack (220i)
  - le formulaire de signalement se lit dans le mode où il est rendu (220i)
  - un sticker a la même taille au canvas, en miniature et à l'export
  - les réglages fins de temps agissent enfin
  - converge window metrics on a single resolution (217i)
  - StatusComposerView — NavigationStack, écran localisé, bouton Publier nommé
  - les tuiles d'aperçu disent enfin ce qu'on s'apprête à partager
  - le composeur d'humeur devient une feuille native (220i)
  - route hand-rolled haptics through HapticFeedback (217i)
  - la feuille de partage devient utilisable au doigt, à VoiceOver et hors anglais
  - carte de fin d'auteur en 2 temps — logo muet PUIS interlude + jingle
  - « Envoyer » partage un lien tracké /l/<token> de la story, pas l'URL brute
  - l'inspecteur suit enfin le clip que la lecture traverse
  - l'audience choisie au repost décide enfin de qui verra le post
  - la traduction à la demande atteint enfin les textes du canvas
  - la lane sticker ouvre son inspecteur, le « +N » compte juste
  - la durée de slide suit l'undo, et ses recalculs s'annoncent
  - les trois chemins d'export coupent au même endroit après la résolution d'identité
  - le basculement « plus annulable » de l'anneau devient visible
  - la barre rapide de langues a EXACTEMENT la taille de la barre de réaction
  - l'interlude d'ouverture révèle la vidéo par un fondu, plus de coupure sèche
  - XCTUnwrap prend un autoclosure — sortir l'await du call site
  - assertion filigrane réellement sensible au pseudo + onDismiss sur la sheet « Partager » de la liste
  - nettoyer vraiment l'audience orpheline en passant à Public/Privé
  - borner la résolution d'identité du chemin « Partager »
  - « Export annulé » ne peut plus mentir pendant l'écriture Photos
  - une intro expirée ne doit plus faire perdre la carte de fin
  - barre rapide de langues — « + » épinglé + ~5 drapeaux visibles
  - la carte de fin de marque manquait sur le chemin d'export timeline
  - revue Task 9 round 2 — pseudo/interlude vérifiés et bornés dans le temps
  - retirer un hunk étranger accidentellement inclus dans 1057ed03d
  - le reader retrouve « Partager », distinct d'« Enregistrer »
  - l'export timeline partage la fabrique d'interlude+filigrane du SDK
  - retirer le compteur de commentaires dupliqué de MyStoryRow
  - la validation d'email converge sur le SSOT RFC 5322 partagé
  - la feuille d'export d'une story se lit enfin en mode sombre (219i)
  - pure conversation category-picker decision core (#2331)
  - windowSize reste sans allocation dans le body des cellules
  - le repli de windowSize reste dans la scène de premier plan
  - la bulle se mesure sur la fenêtre, pas sur l'écran (218i)
  - la pagination converge sur le clamp `limit=0 → 1` du SSOT
  - le commentaire survit au hors-ligne, et une bascule ouverte se referme d'abord
  - la bulle d'humeur se mesure sur son conteneur, pas sur l'écran (217i)
  - pure conversation tag-autocomplete decision core (#2327)
  - read implies delivered when no cursor exists (exact mode)
  - « Répondre » réapparaît quand la story s'ouvre depuis une conversation
  - un post doit porter quelque chose
  - le lecteur ne s'arrête plus sur des stories sans contenu
  - carte de fin de marque (fondu logo + jingle de fermeture)
  - commentaires d'une story depuis « Mes stories »
  - revue Task 7 — export du rail toujours membre, percent unifié
  - anneau d'export partagé entre le reader et « Mes stories »
  - StoryVisibilityMenuResolverTests — annoter @MainActor
  - « Listing des vues » et sous-menu de modification de la visibilité
  - adopt native ShareLink for synchronous links (216i) (#2324)
  - converge synchronous shares on native ShareLink (216i)
  - present the system share sheet through SwiftUI (215i) (#2322)
  - le filtre d'auto-traduction converge sur le SSOT normalizeLanguageCode
  - pure registration nav-chrome projection core (#2321)
  - interlude grave le displayName + barre langues à gauche de « Abc »
  - la ligne garde une identité de vue stable pendant la sauvegarde
  - badge langue au rail + barre rapide de langues avec (+)
  - applyVisibility — écriture optimiste et rollback exact
  - l'action VoiceOver d'annulation n'est présente que job en vol
  - la garde de l'interlude s'ancre sur le comportement, pas la signature
  - interlude — l'avatar et la bannière ne sont plus retournés
  - le « … » de la ligne devient un anneau de progression pendant la sauvegarde
  - réancre la garde dismissGroupIntro sur le nom, pas la signature
  - libellé VoiceOver de la ligne porte la progression de sauvegarde
  - defaut memberwise sur APIPost.visibilityUserIds + site manque
  - rend l'identité de tentative intrinsèque, ferme la fenêtre post-Photos
  - update transmet enfin visibilityUserIds, et StoryItem le porte
  - migre les conteneurs NavigationView dépréciés vers NavigationStack (214i)
  - le dégradé de fond se lisait sur le mauvais séparateur
  - registration wizard collects the regional (secondary) language (#2318)
  - le lecteur préserve la pause, enchaîne les groupes expirés et se dit à voix haute
  - borne la résolution d'identité et isole les tentatives d'export
  - pastille sync + preview média ne dépendent plus de la locale du simu
  - registration recap summary core (RegistrationSummary) (#2316)
  - per-link detail screen (completes share-link vertical) (#2314)
  - created-link success sheet with copy/share (#2312)
  - extend a link's expiry (PATCH /links/{id}/extend) (#2310)
  - interlude compile — import UIKit + ThumbHashDecoder public
  - l'interlude résout avatar + fond + mood de l'auteur
  - interlude — initiales, mood, fond gradient/scrim alignés viewer
  - extrait la résolution de langue et l'identité d'export en helpers purs
  - la transcription vocale atteint enfin le lecteur
  - le filigrane change de coin toutes les 12s (au lieu de 5s)
  - l'identité du préambule d'export est injectée, plus lue dans le singleton
  - les libellés de stats ne dépendent plus de la langue du simulateur
  - logo du filigrane — tracé sur 3s + couleur primaire indigo
  - MeeshyUITests au vert — outil de langue et inspecteur en sheet
  - câble le filigrane sur le chemin d'export de l'auteur
  - filigrane animé — logo Meeshy + pseudo, alternant 5s
  - rend verte la suite iOS — gardes ancrées, compteurs en delta
  - les libellés de stats sont attendus en français
  - purge les clés de la bande de langues supprimée
  - l'export continue en arrière-plan (beginBackgroundTask)
  - les vidéos overlay apparaissent dans le MP4 exporté
  - l'auteur choisit la langue de son texte
  - my-links list + stats + manage (copy/share/activate/delete) (#2308)
  - freezeMessageStatus converge sur le SSOT mergeViewedLanguages
  - create-link side — form → LinkApi → screen (moderator-gated) (#2306)
  - l'inspecteur s'ouvre en sheet, plus en survol translucide
  - le fond vidéo apparaît dans le MP4 (fini le "son sur fond noir")
  - la transcription se demande depuis « … », plus imposée
  - le suivi de lecture suit le SSOT de langue (deviceLocale 4e priorité)
  - isUserAnonymous cesse de classer tout inscrit comme anonyme
  - guest-join flow — preview → form → join (#2304)
  - l'italien et l'arabe deviennent des langues d'interface réelles
  - les flèches suivent le sens de lecture, pas un côté d'écran
  - les libellés affichés en dur deviennent traduisibles
  - chaque export partagé s'ouvre sur l'interlude et le jingle
  - annote deux suites @MainActor pour rétablir la compilation
  - une écoute hors-ligne n'est plus perdue
  - signature sonore Meeshy — 2,2 s, synthétisée
  - le bouton Traductions ouvre la feuille de langues
  - le retour d'arrière-plan respecte la pause et recale le playhead
  - la lecture ne démarre plus sous gel, par aucun des trois chemins
  - bandeau de stats (postes/réels/stories) en tête des postes du profil
  - un seul « Voir le profil » dans le menu DM + libellé « Infos conversation »
  - une surface du reader se referme au toucher, où qu'il tombe
  - des textes qui captent une prosodie, dans les langues de l'app
  - SSOT décodage JWT base64url-safe (utils/jwt)
  - interlude affiché partout, centré, et muet jusqu'à sa sortie
  - admin conversation-settings editor (write-role/announcement/slow-mode/auto-translate) (#2302)
  - plus d'audio audible pendant l'interlude d'identité
  - long-press en bascule et bande centrale rendue au double tap
  - transmettre la langue réellement lue avec chaque lot
  - capturer l'interaction média et l'afficher enrichie
  - déclarer la langue RÉELLEMENT affichée, pas celle préférée
  - menu longpress premium, langue UI, story reader multilingue
  - exposer la couverture, la trace et le prisme linguistique
  - exactitude de lecture + trace écoute/langue consultée
  - trace motivée persistée, images comptées, langue consultée
  - trace motivée de l'écoute + langue consultée au schéma
  - localise date formatting via SSOT formatShortDate (groups/voice/contacts)
  - capture fidèle de l'interaction média, pilotée par événements
  - la face du cube révèle l'interlude, et corrections gestuelles
  - unify composer send gating across all send paths (#2300)
  - double tap pause et swipe vertical plein écran
  - fusion des portions réellement écoutées ou regardées
  - bandes de tap 30/40/30 et décisions verticales
  - le fade des textes et stickers ne se fige plus au premier tick
  - réciprocité showReadReceipts à l'affichage
  - StoryPlaybackClock, arbitrage playhead vs wall-clock
  - localise tracking-link dates on interface locale via SSOT formatShortDateTime (203i)
  - banner dans storyAuthorSelect
  - le log de marquage expose le nombre d'ids rapportés
  - l'app rapporte les messages réellement affichés
  - la webapp rapporte les messages réellement affichés
  - enforce conversation slow mode at the composer (#2298)
  - converge profile language names on shared SSOT (202i)
  - markAsRead transporte les ids des messages affichés
  - stats 500 + clear langue régionale 400 — filtres validés contre le runtime prod
  - gate composer affordances by participant send permissions (#2296)
  - markedCount compte ce qui a réellement été figé
  - profil, état vide et préférences — suite du backlog E2E réglages
  - SessionService + auth middleware — suite du backlog E2E réglages
  - restore corrupted Armenian nativeName + translateText in the language SSOT
  - anonymous-session join/restore/leave use-case + persistence (#2294)
  - converge agent-dashboard relative-time on shared SSOT
  - debounced availability network probe wiring the registration wizard's on…Availability seam (#2292)
  - app-side RegistrationViewModel wiring the shipped registration cores (#2290)
  - converge language flag/name on shared SSOT — end globe fallback for 40+ langs, restore native names
  - mark-as-read accepte aussi les ids rapportés
  - accumulateur de visibilité des messages — miroirs TS et Swift
  - le participant opt-out sort du numérateur ET du dénominateur
  - overlay glass vibrant — fond assombri sans flou plein écran
  - media file-size badge caps at MB — converge on formatFileSize SSOT (#2289)
  - VoiceOver labels for ConversationInfoSheet icon-only buttons (213i)
  - hide decorative SF Symbols in StatusComposerView (213i)
  - VoiceOver selected-state for onboarding terms consent checkbox (199i)
  - l'en-tête de conversation directe converge sur le SSOT getUserDisplayName
  - la liste de conversations converge sur le SSOT getUserDisplayName
  - language-utils drapeaux/noms convergent sur la SSOT partagée
  - ActiveUsersSection nom + initiales convergent sur les SSOT display-name
  - la résolution du nom d'affichage converge sur le SSOT getUserDisplayName
  - affichage des tailles converge sur le SSOT formatFileSize

## 1.16.0

### Minor Changes

- Changements automatiques détectés :

  - build cassé — MeeshyColors.error est déjà un Color
  - curseur de lecture borné au préfixe contigu réellement lu
  - borne le gel readAt aux messages réellement affichés

## 1.15.0

### Minor Changes

- Changements automatiques détectés :

  - « Plus… » bande = TOUTES les actions + bouton « + » réactions
  - fonctions pures du suivi de lecture exact
  - chasse au commentaire ciblé côté web + parité story/réel
  - crash device à l'ouverture — AnyView sur l'overlay menu
  - mutations de préférences persistées et flushées immédiatement
  - « Plus… » morph icônes horizontales + Réactions voir+ajouter
  - « Plus… » enrichi — éditer/copier/partager/traduire + partage réel
  - chasse paginée bornée — le commentaire notifié est TOUJOURS atteint
  - le tap mène à l'entité EXACTE — story/réel/réponse/iPad
  - overlay a11y modale + isolation du drag (fluidité)
  - gating NSE app tuée (miroir App Group) + toggle « Appels entrants »
  - câblage effectif des préférences — chaque toggle a un consommateur réel
  - overlay custom partout + masquage cellule (anti double-bulle)
  - menu appui-long compact + « Plus… » unifié (pin/star/delete)
  - checkpoint câblage réglages/profil (iOS + SDK + gateway)
  - aligner VoiceProfileService sur les routes réelles du gateway
  - footer de pagination rendu uniquement sur liste non vide
  - picker de conversation contact-first + polish story/thème
  - recalibrer les seuils RTT de l'indicateur qualité pour les liens long-courrier
  - garde d'injection insensible à Foundation + mesure du coalescing
  - tirer la poignée vers le haut ouvre toute la photothèque
  - fiabiliser les deux tests qui rougissaient SDK Tests
  - ne plus avaler en silence un média non résolvable du strip photothèque
  - stop the photo-strip video pick from killing the app (SIGTRAP PhotoKit)
  - notifications absentes de la cloche et de la page en temps réel
  - ancrer Button et Badge au graphe client (build Docker rouge)
  - retirer les blocs dupliqués par un auto-merge (SDK Tests rouge)
  - demander les permissions média AVANT d'engager appel et capture
  - AutoFill trousseau sur les champs d'identifiants
  - dates ISO écrites dans le cache conversations (3 erreurs TS)
  - router par l'entité, jamais par le nom du type
  - messages reçus invisibles jusqu'à plusieurs rechargements
  - anonymous-session permission hardening core
  - endpoint-aware token-refresh + reactive 401 decision core (#2283)
  - converge last-seen label on formatPresenceLabel SSOT, drop 2 divergent copies (197)
  - sent single check is regular weight, not semibold
  - await actor-isolated SettingsActionQueue.count/pendingItems
  - delegate display-name/initials/last-seen to SSOT helpers (196) (#2281)
  - content-language step picker + live-preview decision core (#2280)
  - normalize language codes via SSOT, drop last blind slice(0,2) truncations (195) (#2279)
  - unified registration per-step proceed-gate core (#2277)
  - visible, draggable sticker lane (view layer)
  - sticker clips in the data layer (list + move + trim, undoable)
  - registration step-navigation decision core (next/previous/skip) (#2274)
  - resolve language badge flags via normalizeLanguageCode SSOT (194) (#2273)
  - registration progress-bar decision core (jump-back gate) (#2272)
  - unify media-card flag lookup on shared flags.ts (193) (#2271)
  - pure JWT-expiry decoder + refresh-decision core (#2270)
  - handleUnauthorized guards on isAuthenticated instead of activeUserId
  - render time-only for future/clock-skewed conversation dates (192) (#2268)
  - StoryCanvasSnapshotTests — missing import + record real baselines
  - cancel leftover tokenRefreshTask between AuthServiceTests
  - email-link password-recovery flow core (guarded 2-state machine + send gate) (#2267)
  - stop swallowing waitForCondition cancellation in filter pipeline test
  - stopLocalCapture never touches AVAudioEngine when capture never started
  - make MeeshyError typed catch blocks exhaustive in AuthServiceTests
  - drop dead constant, fix header doc, collapse vacant ∞ switch (191) (#2266)
  - remove permanent XCTSkipIf from AuthManagerRefreshTests via keychain seam
  - pure phone-recovery flow core (state machine + input gates) (#2265)
  - rename 52 test functions to test*{method}*{condition}\_{expectedResult}
  - replace wall-clock sleeps with deterministic waits (#1869)
  - gate perf benchmark suites out of ios-tests.yml, grant photos-add for camera guard
  - unfreeze dot-pulse timers in SyncPill + ConversationScrollControlsView
  - stop iPadRootView re-rendering on every network flap
  - rank auto-preview against rendered order; loadState-first empty branch; private-log search query
  - ThemedConversationRow VoiceOver label + live-ticking timestamp
  - NewConversationViewModel.performSearch surfaces failures distinctly
  - distinguish idle/search-empty branches; cap preview auto-load to first 20 rows
  - presence pastilles refresh via debounced signal
  - audioEnrichmentSignature - skip scan when no owned audio, compare full enrichment content
  - localize join-flow and registration error messages
  - handle meeshy://c/<id> short alias in custom-scheme router
  - close Equatable gate gaps + add deviceLocale flag axis
  - align stale test expectations with intentional a11y doctrine changes
  - normalize code before the empty/'unknown' sentinel in getLanguageInfo (190) (#2255)
  - labelled VoiceOver value for CallView audio duration capsules (212i)
  - VoiceOver label+value for CallView duration readouts (212i)
  - VoiceOver labels for DownloadBadgeView media controls (195i)
  - VoiceOver username + online status for KeypadTab result row (212i)
  - VoiceOver kind+state for EditPostSheet media thumbnails (211i)
  - localize MessageViewsDetailView empty-state strings (213i)
  - localize MessageViewsDetailView deliveryBadge via SSOT keys (208i)
  - localize InviteFriendsSheet type name + expiration picker (209i)
  - VoiceOver progress for ConversationLockSheet PIN dots (208i)
  - VoiceOver label + value for call duration in FloatingCallPillView (211i) (#2253)
  - reconcile ProfileHeaderBuilderTest to the 1/3/5 presence SSOT (#2254)
  - measure validateMessageContent length after trim to match send path (189) (#2249)
  - group ProfileView stats card into one VoiceOver element with hint (210i) (#2252)
  - VoiceOver label + value for audio recording duration timer (210i) (#2251)
  - dead xcstrings key + locale-dependent test assertions (B12/B17)
  - post-merge compile — LoadState namespace collision, AnyKeyPath Sendable
  - full a11y pass on MessageDetailSheet + LanguageDisplay dedup
  - consume LanguageDisplay for the 18-language translation picker set
  - relativeTime delegates to RelativeTimeFormatter.longString
  - GlobalSearchView.formatTimeAgo delegates to RelativeTimeFormatter
  - ClipInspector.formatTime delegates to TransportBar SSOT
  - use MeeshySDK.LoadState instead of local shadow enum
  - reject truncated ASCII videoId instead of accepting prefix, encode '/' in path segment
  - annotate TextAnalyzer @MainActor, drop @unchecked Sendable
  - log AppDatabase in-memory fallback migration failures
  - restrict EmbeddableVideoResolver videoId to ASCII, drop force-unwraps
  - grey out allowContactRequests/allowGroupInvites too (placebo)
  - reflect application.theme back into ThemeManager after sync
  - DnD hours use DatePicker(.hourAndMinute) instead of free TextField
  - applyRemote skips pending categories; drop dead auto-DL engine
  - remove dead 'Langue de l'interface' picker
  - grey out 5 placebo privacy toggles instead of faking effect
  - mark makeEmptyResponse @MainActor (AnyCodable's Decodable conformance is MainActor-isolated, 7th occurrence of the SE-0466 footgun)
  - fix real test failures surfaced by first green build after Vague 4
  - mark ReelEngineOwnershipPolicy nonisolated (4th occurrence of the SE-0466 default-isolation footgun this session)
  - resolve build errors surfaced by build after Vague 4 merges
  - propagate attachmentId-as-load-param fix to MeeshyVideoPlayer+Renderers + reset ownsEngine on disappear
  - fix actor-isolation compile breaks + ThreadView optimistic-reply drop
  - ThreadView seeds replies from cache, sends via outbox
  - overlay menu audio preview resolves disk cache first
  - seed reactions detail from message.reactions
  - route share/forward sends through the offline outbox
  - MessageForwardDetailView loads conversations cache-first
  - BlockedUsersView routes through cache-first BlockedViewModel
  - route sendFriendRequest through the durable outbox
  - FriendRequestListView routes through cache-first RequestsViewModel
  - preserve original mime on HEIC downsample/encode failure
  - regenerate pbxproj — drop stale AttachmentSendService refs
  - cacheImageForPreview inserts synchronously with budget guard
  - gate bubble carousel ±1 prefetch on MediaDownloadPolicyEngine
  - delete dead AttachmentSendService (0 call sites, 2 latent bugs)
  - transcode HEIC/HEIF photos to real JPEG, not renamed HEIC
  - do/catch on file-import copy, drop phantom attachments
  - hop synchronous Data(contentsOf:) off the MainActor on send
  - B9 findings — auto-seeded language never steers playback; race loser never awaits its own cancelled task
  - apply Prisme Linguistique to audio transcription default language
  - startDownloadFlow honors registerInFlightDownload's Bool contract
  - AudioPlaybackManager gains shouldLoop, mirroring the video reel engine
  - sweep AuthTextField/AudioPlayerView/MediaTranscriptionView onto adaptiveOnChange
  - unify byte-size formatting behind one SDK helper
  - AudioPlayerManager playLocalFile/playData no longer swallow errors
  - AudioPlayerView leaf view no longer observes ThemeManager singleton
  - CachedBannerImage.pixelSize accounts for full-bleed width
  - CodeViewerView colorScheme migration (Zero Unnecessary Re-render)
  - DocumentViewerView accessibility labels + colorScheme migration
  - fullscreen image bypasses network policy gate + dedupe fetch cascade (SDK purity)
  - transient network failure no longer permanently kills pagination
  - wire attachmentId/isForceMuted, scope re-render, fix repost pause, Prisme audio
  - attachmentId survives load() cleanup, per-surface mute intent
  - reconcile self-echo comment:added against optimistic temp\_ entry (P1)
  - remove dead publishStory/publishStorySingle pipelines (P3)
  - roll back optimistic comment/reply on post or media failure (P1)
  - discriminate 404 vs network error on notification tap (P2)
  - mirror commentCount realtime updates in the open viewer (P2)
  - localize StatusEntry.timeAgo/timeRemaining (P2)
  - preserve viewedAt/updatedAt/impressionCount across translation merge (P2)
  - log foreground media asset missing during publish (P2)
  - roll back optimistic reaction on any react() failure (P1)
  - isolate test_pullToRefresh_resetsCursorAndRefetches from shared cache singleton
  - native EmptyStateView for RequestsTab empty state (207i) (#2228)
  - saved-account picker list core (multi-account) (#2250)
  - server-environment selector enum + URL-derivation core (#2248)
  - code-point-safe truncation of share-link conversation titles (188) (#2247)
  - 6-digit OTP field sanitiser + verify/resend gate core (#2245)
  - resolve build errors surfaced by device build after Vague 3 merges
  - VoiceOver labels for OnboardingStepViews photo buttons (208i)
  - VoiceOver label for ConversationView error-banner dismiss (208i)
  - RequestsTab empty-state → AdaptiveContentUnavailableView (208i)
  - legal screens open in the user's preferred language (208i)
  - info-token consolidation for ConversationPreferencesTab organizationSection (208i)
  - close remaining Prisme + retry/delete race gaps in send fallback
  - VoiceOver handle+last-seen in ContactsListTab row label (208i)
  - tokenize CallView retry CTA green to MeeshyColors.success (208i)
  - restate handle + last-seen in ContactsListTab row VoiceOver label (208i)
  - P1/P2 — settings-flush 429 no longer terminal, mapUnauthorized scope narrowed to login
  - bumpToTop clears stale preview/translations, .expired branch gets VM-level coverage
  - remediation B5 — comments merge race, like/comment outbox rollback, Prisme code mirror
  - merge offline settings-queue payloads field-by-field
  - re-inject StatusViewModel across ForwardPickerSheet sheet boundary
  - honor Prisme in Copier + drop wrong-message reaction-picker fallback
  - route .failed message delete through local purge, no REST resurrection
  - stop hardcoding originalLanguage to fr on send fallback paths
  - route manual retry of failed media messages through the durable outbox
  - restore offline pagination via GRDB cache fallback
  - recover pagination after a fresh-cache-only session
  - map effectFlags/translation/reactions on realtime comment:added
  - P1/P2 — bound the proactive session refresh + capture the logout token before the wipe
  - P1 — UserProfileViewModel reads blocked state from BlockService, not the login snapshot
  - re-seed like/bookmark/repost flags after flag-only refresh; share count bumps only on confirmed success
  - P2 — do/catch + log the boot-recovery call before the outbox flusher
  - comments sheet fetches full comment list instead of embedded top-3
  - P1 — replace dead `catch APIError` sites with the real MeeshyError type
  - drop FeedPostCard's onSendComment param (leftover from previous commit)
  - route like + comment send through the durable outbox on failure
  - persist engagement counters + bookmark/repost flags through FeedPost Codable
  - Unicode-safe community slugs + code-point-safe truncation (187)
  - P1 — clearSessions() targets the outgoing user's Keychain namespace, not nil
  - deterministic Prisme language resolution in feed card + clearTranslationOverride
  - P1 — map 401 on login/2FA/register/magic-link to invalidCredentials, not sessionExpired
  - fetch-then-replace refresh + surface offline data past expiry
  - P0 — teardown full session before applying a magic link while already authenticated
  - reset stale last-message fields on lightweight bumps, search by displayName
  - recover on-disk data past expiry via loadIgnoringExpiry
  - drop permanently-failing settings actions after maxAttempts
  - repair offline profile save (endpoint, silent encode, clearing)
  - dispatch avatar PATCH separately from strict /users/me body
  - decode gateway's fileUrl key for avatar uploads
  - no retry button on 7 avatar/banner sites (Lane AV, D2)
  - full VoiceOver label for CallsTab call-journal row (207i)
  - magic-link countdown state-machine + strict email gate cores (#2225)
  - remove dead xcstrings key story.groupIntro.recent (superseded by .idle in presence 1/3/5 rule)
  - social pushes carry triggering commentId; friend_request carries friendRequestId
  - mark NSEDecryptor statics nonisolated under MainActor default isolation (test build was failing)
  - VoiceOver label + count value for reaction filter capsules (206i)
  - stop treating apostrophe as a quote + preserve newlines in deepCleanTranslationOutput (186) (#2223)
  - native EmptyStateView for ContactsListTab empty state (205i)
  - pure signup local-validation gate + availability-debounce policy core (#2221)
  - accent-fold + non-degenerate auto username handle
  - native EmptyStateView for VoiceProfileManageView empty hero (204i)
  - pure signup device-locale language/country inference core (#2218)
  - VoiceOver selected-state for BubbleFooter translation flag strip (203i)
  - localize FeedPostCard+Media document/pages/location labels (202i)
  - Unicode-aware name normalization for account recovery (#2215)
  - localize SyncPill VoiceOver hint + multi-signal label (201i)
  - password requirements checklist + confirm-gate cores (#2213)
  - VoiceOver labels for DnD time fields in NotificationSettingsView (200i)
  - VoiceOver selected-state trait for ThemedConversationRow (195i) (#2196)
  - accent-color for ConversationPreferencesTab "My display" section (199i)
  - pure country/dial-code catalogue core (CountryCatalog) (#2210)
  - email digest preserves each notification's delivery state
  - private-mode push carries no content, localized generic body, APNs budget re-check, mute before throttle
  - harden background action flow — expiration lease, outbox pool wiring, friend-response fallback
  - VoiceOver selected-state for onboarding language step (198i)
  - device-locale 4th-priority resolution + BCP-47 normalisation (#2208)
  - heartbeat refresh reaches live viewers + engine-pong coverage + metrics coherence
  - honor showPreview/showSenderName, tz-aware DND (shared), track pushSent
  - pin MainActor closure types on injected seams (Swift 6 isolation)
  - retry voip token registration; drop unused FirebaseMessaging link
  - dedicated callsEnabled pref, alert fallback when no voip token, stale-foreground guard
  - friend request actions actually call API; split call categories (no Answer on ended calls)
  - inline comment action on social pushes (threaded reply, durable outbox)
  - refresh lastActiveAt on socket heartbeat (passive-connected stays online under 5min guard)
  - push payload carries createdAt/messageType and Prism-resolved translation
  - reliable action handler — background task, token restore, durable outbox reply
  - 1/3/5 rule mirror
  - native threadId + category on push payloads
  - 1/3/5 rule — idle grey dot displayed, offline hidden everywhere
  - labeled surfaces follow 1/3/5 — no badge/element beyond 5min
  - apply per-conversation mute to message/reply/reaction fan-out (mentions pierce)
  - pre-persisted bubble carries media type from attachment mime
  - read namespaced E2EE session key (restore encrypted push preview & pre-persist)
  - 30s tick + flip windows aligned to 1/3/5
  - 1/3/5 rule — idle grey state displayed, 5min stale guard
  - busy_timeout on both pools + explicit file protection for shared message DB
  - friendContentEnabled preference gating friend content pushes
  - wire posts notifications to configured service (friend_new_post push)
  - surface silent failures + localize ForwardPickerSheet (197i)
  - VoiceOver structure for CommentAttachmentsTray staged chips (197i)
  - native empty state for ActiveSessionsView (196i)
  - update timeline panel-height test 320 -> 392 (#2173)
  - hide decorative glyphs in EditPostSheet language row (196i)
  - VoiceOver selected state for VideoFiltersPanel preset pills (192i)
  - localize + VoiceOver selected-state for ConversationDashboard period picker (192i) (#2167)
  - localize + tokenize + VoiceOver Siri snippet views (195i)
  - VoiceOver structure for CreateTrackingLinkView (190i) (#2163)
  - shared CharacterCountLabel (188i) (#2159)
  - VoiceOver value+label for video position Slider in MessageOverlayMenu (195i)
  - localize BrandSignature VoiceOver label (195i)
  - VoiceOver selected-state + count for MessageViewsDetailView filter capsules (195i)
  - VoiceOver structure for ThreadView (195i)
  - native Button retry for StatusBarView error indicator (195i)
  - cold-start skeleton for CommunityLinksView (195i)
  - VoiceOver labels for ChangePasswordView secure fields (193i)
  - VoiceOver-reachable clear-all action for KeypadTab (189i) (#2162)
  - locale-aware + VoiceOver-labelled translation-confidence badge in PostTranslationSheet (186i) (#2149)
  - VoiceOver selected-state for MessageDetailSheet selectors (193i)
  - conversation messages modal with infinite load on the user fiche
  - VoiceOver structure for LinksHubView cards (194i) (#2174)
  - VoiceOver selected-state for MessageDetailSheet segmented selectors (194i)
  - Dynamic Type + VoiceOver + localize TopLevelCommentCell (187i) (#2153)
  - VoiceOver retranslate label + selected-state for MessageDetailSheet languageRow (193i)
  - dedup ProfileUserPostsList empty state to EmptyStateView (183i) (#2148)
  - VoiceOver selected-state for MessageDetailSheet filters (193i)
  - accessible page control + hide demo bubbles for OnboardingView (186i) (#2145)
  - VoiceOver selected-state for MessageDetailSheet selectors (192i)
  - localize CameraView mode tabs + VoiceOver labels for capture controls (185i) (#2141)
  - native ContentUnavailableView for FriendRequestListView empty state (185i) (#2140)
  - brand-color consolidation for TermsOfServiceView (194i)
  - VoiceOver reachability for StatusBubbleOverlay (191i) (#2168)
  - Indigo brand-color consolidation for DataStorageView (182i)
  - VoiceOver selected-state for ConversationInfoSheet tab selector (194i)
  - VoiceOver-reachable delete + heading for GlobalSearchView recent searches (191i) (#2164)
  - VoiceOver slider values for VideoFilterControlView (189i) (#2161)
  - VoiceOver structure for LinksHubView cards (194i)
  - VoiceOver selected-state + close label for MessageMoreSheet (186i) (#2157)
  - VoiceOver online/blocked status for NewConversationView row (185i) (#2155)
  - brand-color consolidation for DataStorageView (186i) (#2154)
  - Dynamic Type for shared EmptyStateView primitive (181i) (#2151)
  - VoiceOver structure for CreateShareLinkView (186i) (#2150)
  - VoiceOver selected-state for AudioFullscreenView speed + language pickers (186i) (#2144)
  - Indigo brand-color consolidation for the Affiliate pair (180i) (#2142)
  - localize + VoiceOver selected-state for RequestsTab filter pills (185i) (#2139)
  - VoiceOver labels + selected state for MessageLanguageDetailView (185i) (#2137)
  - localize + VoiceOver selected-state for PeopleDiscoveryView sub-tabs (178i) (#2114)
  - VoiceOver selected-state for segmented pickers (186i) (#2143)
  - normalize case in language display helpers to match shared SSOT (184) (#2171)
  - VoiceOver-reachable Unblock + loading label for BlockedTab (193i) (#2170)
  - dedup TrackingLinksView empty state to EmptyStateView (184i) (#2138)
  - raise CommonSchemas.language max length to 6 so bas-CM parses (184) (#2172)
  - timeline operations band, +10s extend, sectioned wider tiles, 5-800% zoom (timeline-ops-band-round)
  - band shadow no longer bleeds above the timeline header (band-shadow-compositing-group)
  - pure rolling live-transcript accumulator (call-transcript-buffer) (#2169)
  - resolve inflect plural labels explicitly (fixes red iOS Tests) (#2165)
  - canvas returns to its static state when playback ends (timeline-playback-end-static-canvas)
  - timeline panel spans the full sheet width (timeline-panel-edge-to-edge)
  - timeline lanes ordered by sections — BG then FG (timeline-bg-fg-sections)
  - pure call-reliability decision core (call-reliability-policy) (#2166)
  - VoiceOver-reachable copy action for CommunityLinksView rows (183i) (#2134)
  - VoiceOver structure for TrackingLinkDetailView (180i) (#2122)
  - P2P data-channel control protocol codec (call-datachannel-protocol) (#2160)
  - native DisclosureGroup + ShareLink label for CrashReportSheet (178i) (#2120)
  - explicit ISO 639-3→639-1 reduction, stop mapping Filipino to Finnish (#2067)
  - drop dead inner .combine on transcription banner
  - VoiceOver labels for ConversationMediaGalleryView (180i) (#2124)
  - localize + VoiceOver + Dynamic Type for CategoryPickerView (178i) (#2102)
  - repair app build broken by today's a11y merges (app-build-a11y-merge-repair)
  - finger-first clip timing bar + labeled inspector actions (clip-inspector-timing-bar)
  - chrome scheme follows real background-media luminance (story-chrome-media-luminance)
  - VoiceOver selected-state for StatusComposerView pickers (184i) (#2135)
  - deterministic StoryPublishQueue tests — reset leaked publish handler in setUp
  - VoiceOver structure for EditProfileView (151i) (#1988)
  - VoiceOver structure for MessageTranscriptionDetailView (179i) (#2123)
  - Dynamic Type + VoiceOver for ReplyCell (182i) (#2133)
  - VoiceOver labels for feed post stat counters (179i) (#2119)
  - dedup BlockedTab empty state to EmptyStateView (179i) (#2111)
  - localize + VoiceOver the send-history card in MessageViewsDetailView (178i) (#2107)
  - VoiceOver structure for EmailVerificationView (178i) (#2100)
  - correct false cross-field-validation claim on attachmentTranslationsMapSchema (183) (#2132)
  - native ShareLink for TrackingLinkDetailView URL share (180i) (#2121)
  - VoiceOver label + Dynamic Type for VideoFullscreenPlayer dismiss (179i) (#2106)
  - VoiceOver structure for BlockedUsersView (178i) (#2101)
  - split KeypadTab result-row interactive controls for VoiceOver (181i) (#2130)
  - brand-color consolidation + VoiceOver headers for MediaDownloadSettingsView (179i) (#2125)
  - Reduce Motion + decorative VoiceOver for ReelAudioBackdrop (178i) (#2113)
  - localize + reuse SSOT keys for scroll-to-bottom button (178i) (#2112)
  - VoiceOver selection state for MessageReportDetailView (178i) (#2103)
  - VoiceOver structure for DiscoverTab search + result rows (178i) (#2099)
  - VoiceOver active/inactive status + fix concat for ShareLinksView (178i) (#2098)
  - native empty states for AddParticipantSheet (176i) (#2097)
  - dedup ShareLinksView empty state to EmptyStateView + heading trait (178i) (#2096)
  - Dynamic Type + VoiceOver for MessageViewsDetailView state icons (144i) (#1974)
  - pure in-call video-filter config + presets + auto-degrade cores (call-video-filter-config) (#2136)
  - bound deviceCountry debounce cache + clamp explicit limit=0 to floor (183) (#2146)
  - revert pytest-asyncio 1.4.0 -> 0.25.2 (pytest pinned 8.3.4)
  - revert protobuf 7.35.1 -> 6.33.6 (grpcio-tools 1.76.0 caps <7.0.0)

## 1.14.0

### Minor Changes

- Changements automatiques détectés :

  - pure live in-call captions core (call-captions-mode) (#2128)
  - VoiceOver validation feedback for DeleteAccountView confirmation phrase (150i) (#1986)
  - localize FeedView+Attachments post-composer toasts + reuse attachment-label SSOT (157i) (#2006)
  - canvas card follows the sheet live when raising/lowering (no dynamic truncation)
  - VoiceOver row grouping + presence for ParticipantsView (174i) (#2062)
  - VoiceOver traits + labels for ContactsListTab (175i) (#2066)
  - Dynamic Type + VoiceOver for StatsTimelineChart (165i) (#2028)
  - Dynamic Type + VoiceOver for BubbleExpandableText (156i) (#2001)
  - VoiceOver pass for MessageTranscriptionDetailView (166i) (#2030)
  - localize + VoiceOver for MessageEditsDetailView (167i) (#2039)
  - VoiceOver structure for ShareLinkDetailView (167i) (#2040)
  - VoiceOver structure for ActiveSessionsView session rows (168i) (#2041)
  - VoiceOver loading states + native search for SharePickerView (169i) (#2043)
  - VoiceOver labels + settingsToggleRow for ConversationPreferencesTab (169i) (#2045)
  - Indigo brand alignment + VoiceOver for MagicLinkView (172i) (#2049)
  - native ShareLink for CommunityLinkDetailView (171i) (#2051)
  - VoiceOver structure for MiniAudioPlayerBar now-playing cluster (173i) (#2059)
  - localize + Dynamic Type + Indigo + VoiceOver for LoadMoreRepliesCell (176i) (#2069)
  - reserve the canvas from the band's REAL top edge (kills the truncation)
  - VoiceOver identity + i18n for LinkPreviewCard (iteration-168i) (#2071)
  - localize ContactsHubView tab bar + VoiceOver selected-state (iteration-176i) (#2072)
  - localize load-error string in ConversationEncryptionDetailSheet (176i) (#2074)
  - VoiceOver selection state for ReportMessageSheet (177i) (#2076)

## 1.13.0

### Minor Changes

- Changements automatiques détectés :

  - Modernize ContactCardView with design tokens and relative fonts (#2054)
  - consolidate generateConversationIdentifier onto shared SSOT (182) (#2060)
  - native ContentUnavailableView for StarredMessagesView empty state (175i) (#2064)
  - BookmarksView empty state → shared EmptyStateView (168i) (#2095)
  - composer glass chrome follows the REAL slide backdrop (story-chrome-scheme-media-bg)
  - move the export action into the transport as a "Save" button (after Play)
  - landscape canvas shrinks (never cropped) as the sheet grows + gap above the sheet
  - pure camera-covered (dark-frame) detection core (call-dark-frame-detection) (#2094)
  - landscape canvas hugs the sheet, sheet overlays it past the visibility cap
  - realtime status:unreacted — live bar reaction-removal (status-unreacted-socket) (#2075)
  - kill the black letterbox — blurred bg fill + centered landscape canvas
  - realtime socket wiring — live bar updates (status-realtime-socket) (#2073)
  - localise the status\_\* string family (FR/ES/PT) (status-strings-i18n) (#2070)
  - surface freshly-added media bitmaps to the composer canvas reader
  - offline pending banners — warning amber + truncation-safe
  - disk L2 status-bar cache — cold-launch parity across process death (status-bar-l2-cache) (#2068)
  - tappable '...' menu on My Stories rows — adds Enregistrer (Photos) and Transférer (conversation forward)
  - pending-stories banner dismiss, upload badge tap passthrough, failed-publish history
  - port enriched track labels + persisted clip name/timing config onto the unified timeline
  - Friends/Discover status-feed toggle (status-feed-mode-toggle) (#2065)
  - bound the debounce cache to stop unbounded per-user memory growth (#2057)
  - reaction picker in the mood-status popover (status-popover-reaction-picker) (#2063)
  - transport controls no longer clip off-screen (chrome lane width leak)
  - L1 in-memory status-bar cache (cache-first paint) (status-bar-l1-cache) (#2061)
  - popover Republish action + repost-seeded composer (#2058)
  - status composer sheet + pure StatusComposerDraft (status-composer) (#2055)
  - Compose StatusBarView mood-pill rail + pure cell builder (status-bar-compose) (#2052)
  - StatusesViewModel + pure bar-accumulation state (statuses-viewmodel) (#2050)
  - StatusRepository transport + status feed endpoints (status-repository) (#2048)
  - one unified timeline — Simple/Pro toggle, ProTimelineView, TimelineMode and TimelineToolbar removed
  - mood-status model + expiry/mapper SSOT (status-mood-core) (#2046)
  - snap toggle joins the transport bar (unified view keeps every Pro control)
  - extract TimelineInspectorHost — quick view gains clip/keyframe/transition inspectors
  - normalize language codes emitted by getUserLanguageChoices (180i) (#2044)
  - comment composer @-mention remote directory merge (#2042)
  - localize + VoiceOver structure for UploadProgressBar (167i) (#2037)
  - also reload timeline snapshot on activeTool -> .timeline
  - reload timeline snapshot when the timeline tab actually becomes visible
  - chrome lane now reflects the live-picked opening/closing effect, not a stale slide snapshot

## 1.12.0

### Minor Changes

- Changements automatiques détectés :

  - comment composer @-mention autocomplete + shared mention SSOT (#2029)
  - fullscreen media gallery on collage tile tap (#2027)
  - adaptive multi-image collage layouts (1–5+ media) (#2026)
  - read-only chrome lane shows opening/closing transitions on the ruler
  - no-op drag release also cleared pre-drag duration baseline
  - per-comment Prisme language switcher (#2023)
  - drag-end duration toast never fired — compare against pre-drag baseline
  - slide duration always reflects current content, not a stale pin
  - extract contentDerivedDuration core onto StoryEffects (no behavior change)
  - merge Dissolve into Crossfade — it rendered identically everywhere
  - VoiceOver for InviteFriendsSheet options summary (164i)
  - render @-mentions + rich text in comments (#2021)
  - shrink track label column to icon-only, reclaim width for the lane
  - real Liquid Glass for composer band on iOS 26+
  - Dynamic Type + a11y for MessageViewsDetailView empty/error states
  - live header comment-count badge — comment:added/deleted resync (#2019)
  - Dynamic Type + VoiceOver for AudioCarouselView page indicator (163i)
  - live comment heart reactions — comment:reaction-added/removed sync (#2016)
  - adopt design tokens and a11y in JoinFlow
  - Dynamic Type + VoiceOver for StoryViewerView+Content (162i)
  - live comment:deleted — deleted comments/replies vanish from the open thread (#2014)
  - preserve MyStoryRow selection-trait guard literal (161i)
  - Dynamic Type + VoiceOver for MyStoriesView (161i)
  - post-detail realtime room — live comment:added in the open post (#2012)
  - VoiceOver parity for MessageForwardDetailView (160i)
  - auto-preview replies — first replies show without a tap (#2010)
  - VoiceOver grouping for AttachmentLoadingTile (159i)
  - VoiceOver pass for SecurityVerificationView (158i)
  - reply composition — optimistic replies targeting a comment (#2007)
  - composer chrome overlaps sheet + loop-fill visualization
  - comment replies — 1-level expandable threads ("View N replies") (#2005)
  - Liquid Glass + alignment gaps, video export overlay dark bug
  - Timeline mode switcher a11y label + empty-state picker dead-end
  - comment likes — optimistic heart toggle (#2004)
  - localize drawing toolbar (tools, undo/redo, stroke list, smoothing)
  - localize text-edit toolbar, offline-queue banner, draft-resume a11y
  - post-detail threaded comments — optimistic send + Prisme thread (#2003)
  - localize video editor category and tool titles
  - localize story canvas VoiceOver accessibility labels
  - repost / quote embed cell (a reposted post rendered inside the card) (#2002)
  - localize export-as-video sheet subtitle, verify export flow
  - localize EXCEPT/ONLY audience picker title + search placeholder
  - full-screen post detail screen (fixes non-reel tap dead-end) (#2000)
  - visibility picker was hardcoded French (5th localization gap)
  - "Slide opening" transition chips were hardcoded French
  - Timeline switch-chip did nothing from any other open panel
  - improve accessibility and i18n of iPadResizableHandle
  - My Stories list thumbnail shows the actual composed content
  - reader + Mes stories were entirely unlocalized (84 keys)
  - VoiceOver for MessageReactionsDetailView (155i)
  - user-profile posts feed — cursor pagination + generalized post-list SSOT (#1997)
  - VoiceOver + content selection for AudioPostComposerView (154i)
  - bookmarked posts (saved) feed — cursor pagination + optimistic un-bookmark (#1995)
  - VoiceOver grouping for MessageDetailSentimentTab gauge (153i)
  - bookmark/un-bookmark — optimistic toggle + live post:bookmarked overlay (#1993)
  - live post:liked/unliked count sync — like overlay (#1992)
  - Dynamic Type freeze + dead-code cleanup for IncomingCallView (152i)
  - live post:deleted removal — tombstone overlay (#1990)
  - new-posts banner + realtime-head merge (#1989)
  - file/photo attachment picker → REST send (#1987)
  - @-mention autocomplete — debounced remote directory merge (#1985)
  - ChangePasswordView validation checklist + rotor + success hero (149i)
  - send message with attachments — durable upload→graft chain + clipboard-content send (#1983)
  - VoiceOver labels for StoryViewerContainer error state (148i)
  - report a message (typed reasons + detail) (#1981)
  - Dynamic Type + VoiceOver data summary for StatsTimelineChart (147i)
  - in-app browser routing + rich-card image band (#1979)
  - VoiceOver + Dynamic Type for VoiceProfileManageView (146i)
  - live-location socket start/update/stop wiring → session badges (#1977)
  - VoiceOver grouping for ConversationDashboard stat gauges (145i)
  - large-paste detection → clipboard-content preview (#1975)
  - live-location timed-session core + badge/duration-picker UI (#1973)
  - VoiceOver structure for StoryExpiredContent (143i)
  - async OpenGraph link-preview cache — dedupe/negative-cache/logout-purge (#1971)
  - VoiceOver structure for FriendRequestListView (142i)
  - pure OpenGraph link-preview core + tracker stripping (#1969)
  - in-overlay interactive audio preview transport SSOT (#1967)
  - Dynamic Type for ThemedBackButton chevron (140i)
  - iMessage-style voice-recording pill logic + UI (#1965)
  - floating preview-bubble overlay layout law + lifted hero (#1964)
  - pure overlay drag-to-detail gesture law SSOT (#1963)
  - pure action-grid SSOT for the long-press overlay menu (#1962)
  - iOS modernization, design tokens, and CI fix
  - modernize iOS app for HIG, A11Y, and reliability
  - persistent sparkle-canvas twinkle treatment (#1960)
  - one-shot shake/zoom/explode/waoo appearance transforms (#1959)
  - one-shot confetti/fireworks appearance particles (#1957)
  - render message effects on received bubbles (#1956)
  - composer message-effects picker + real send wiring (#1955)
  - view-once "Seen and deleted" burned tombstone (#1954)
  - corrige les findings de la revue de code post-implémentation
  - sélection multiple + suppression groupée dans Mes stories
  - StorySelectionResolver — sélection multiple filtrée contre la liste vivante
  - bouton créer une story depuis la liste Mes stories
  - tap avatar « Ma story » ouvre la liste au lieu du player direct
  - taper une story dans Mes stories ouvre la story tapée, pas toujours la 1re
  - StoryIndexResolver — résout l'index de lecture par postId
  - vignette Mes stories proportionnelle au ratio réel du contenu
  - FeedMedia.aspectRatio — dérivé de width/height pour les vignettes proportionnelles
  - StoryThumbnailSizing — largeur de vignette proportionnelle au contenu
  - blurred / view-once "tap to reveal" lifecycle (#1953)
  - reader stays alive through Notification Center peek, unify group-switch intro, fix reposted-story playback stall
  - timeline opens inline in the composer band, modal sheet removed
  - ComposerToolPanelHost renders a real inline timeline panel
  - StoryCanvasFraming.isCarded gains timelineActive
  - BandStateMachine stops special-casing .timeline
  - canvas follows background's continuous aspect ratio, clamped 9:21-21:9
  - text size slider tracks live pinch scale, resets scale on manual resize
  - pull-to-refresh reloads stories, not just posts
  - collapse ephemeral bubble when its self-destruct timer expires (#1952)
  - durée de boucle du fond = max(vidéo, audio) + pause sur scenePhase + entrée voisin
  - aperçu menu natif standalone + confirmation suppression média/signalement
  - désactiver CallKit en Chine (Guideline 5 MIIT) + retirer bluetooth-peripheral inutilisé
  - save-to-gallery from the image viewer (#1951)
  - ephemeral self-destruct countdown badge (#1950)
  - message-effects render-plan + persistent treatment layer (#1949)
  - message-effects send-path wire encoding (#1947)
  - effet snap au cadrage de l'arrière-plan (centre + bords)
  - vue « Mes stories envoyées » + menu d'actions
  - preview joue le son d'arrière-plan + durée audio à l'import
  - pickers audience & forward cache-first + liste des vues (profil/mood/présence)
  - contours du canvas visibles + timeline = durée de la donnée la plus longue
  - message-effects composer editor + ephemeral-duration enum (#1946)
  - chips « Arrière-plan » / « Premier plan » pilotant la couche manipulable du canvas
  - retenir sut (souscription Combine vivante) + retirer clé morte story.viewer.viewsCount
  - message-effects wire contract + resolver (#1945)
  - gallery neighbour prefetch ±2 (#1944)
  - gallery per-page author + date header (#1943)
  - StoryItem porte impressionCount + sheet « vu par » = viewCount autoritatif + impressions
  - unifie les compteurs vues/impressions entre Détail, Réel, Feed et Story
  - erreurs de compile + warnings Swift 6 du bundle de tests
  - conversation media gallery per-page caption (iOS captionMap parity) (#1942)
  - notification-row relative timestamp (iOS NotificationRowView parity) (#1941)
  - lecture de story plus fluide — haptics, swipe continu, republications, audio de fond (#1939)
  - per-type notification row accent colour (iOS NotificationRowView parity) (#1940)
  - conversation-row relative timestamp (iOS ThemedConversationRow parity) (#1937)
  - long relative-time rendering layer + profile "last seen" line (#1936)
  - error-recovery force-end évince aussi signalSessionCache (#1931)
  - ne pas empiler l'offre « Réessayer » sur l'appel en attente promu (#1927)
  - count only active memberships in totalConversations (iter 173) (#1926)
  - REST likeComment enforces max-1-reaction-per-user (socket parity) (#1933)
  - résout l'avatar des feuilles de détail via la source unique (fallback compte + chaîne-vide) (#1934)
  - retire la pill pop-up « réseau faible » au profit d'indicateurs discrets (iOS + web)
  - relative-time short rendering layer + feed wiring (time-relative-format-strings) (#1935)
  - résout getTranslationFromJSON insensible à la casse (#1905)
  - resolveParticipantAvatar treats blank strings as absent (#1925)
  - per-conversation message ordering SSOT (chat-message-ordering) (#1924)
  - relative-time long-framing SSOT pure core (§Q) (#1923)
  - conversation-wide fullscreen media gallery (§C) (#1902)
  - catch escaping swap-remove broadcast rejection (#1897)
  - accept NANP local phone format (555) 123-4567 (#1901)
  - résout le nom auteur via getUserDisplayName (displayName vide → username) (#1903)
  - relative-time classification SSOT pure core (§Q) (#1904)
  - consecutive-sender message grouping (§C) (#1900)
  - ThumbHash blur-placeholder encoder pure core (§P) (#1899)
  - ThumbHash blur-placeholder decoder pure core (§P) (#1898)
  - durcit l'isolation Swift 6 (private(set) scale + nonisolated fadePresets)
  - décodage résilient d'ActiveCallParticipant (fallback userId → user.id)
  - supprime le refresh REST, s'appuie sur presence:snapshot socket
  - remplace le chunking par push-only — supprime le pull REST (#8)
  - live-waveform pure core (metering + rolling window + interpolation) (#1896)
  - diffuse call:ended au pair sur les chemins REST end/leave (parité socket)
  - aplatit l'identité participant dans les réponses REST (crash-recovery iOS)
  - remplacement de pile atomique pour les deep-links (#16)
  - dedup forceReregister sur le cooldown (anti PushKit churn #13)
  - reconcilie call:error CALL_ENDED au lieu de toaster 'already ended' (#12)
  - ne rearme la socket qu'apres un vrai background (#11)
  - garde les emits fire-and-forget sur l'etat connecte (#10)
  - elargit le timeout ACK call:join a 6s (anti false NOT-ACKed #9)
  - chunk le refresh presence (50/req concurrent) au lieu d'1 URL de 200 ids (#8)
  - differe la synchro colorScheme->mode hors passe d'update (#7)
  - batch le flush en 1 POST anti-429 (#6)
  - borne le flush engagement en transition BG (anti-watchdog #5)
  - URL contenant m+<token> — fin des parts chevauchantes (F91) (#1893)
  - context-aware image compression plan (§P) (#1895)
  - open-source licenses screen (§L static screens complete) (#1894)
  - bannière call-waiting — contenu (suite de 44a708d56)
  - bannière call-waiting — swap « Terminer & répondre » (parité iOS/Android)
  - finalise la bulle « en cours » sur les chemins REST end/leave (bulles orphelines)
  - découple RootView/iPadRootView du churn ConversationListViewModel (re-render idle)
  - découple RootView/iPadRootView du churn CallManager — cause du watchdog 0x8BADF00D
  - buffer answer signals for late-rejoining callers (§4.6) (#1889)
  - Help & Support screen (§L static screens) (#1892)
  - guard translatedAudios in handleAudioProcessCompleted against missing field (#1890)
  - offer retry on call:ended, not just the connect watchdog (#1891)
  - busy-path — auto-décline un 2e appel entrant pendant un appel actif (parité iOS/Android)
  - retry sur échec transitoire signalé par le serveur/pair (parité iOS/web)
  - retry-on-failure — « Réessayer » un appel échoué transitoirement (parité web/Android)
  - retry-on-failure — « Réessayer » un appel échoué transitoirement (parité web)
  - retry-on-failure — « Réessayer » après un échec transitoire d'appel
  - sort per-sender buckets so the unread-count binary search holds regardless of row order (#1888)
  - expose callFailureRate — la KPI de fiabilité n°1 dans l'endpoint
  - avgRtt/avgPacketLoss n'incluent plus les appels jamais connectés (0 déflatant)
  - le web émet enfin call:analytics au raccroché — fin du trou de télémétrie
  - les échecs failed(message) s'agrègent en un seul bucket « failed »
  - la sentinelle -1 « jamais connecté » ne pollue plus la moyenne de setup time
  - endpoint admin de fiabilité des appels — le côté LECTURE de call:analytics
  - align no-answer ring timeout to 45s, matching iOS convention (#1879)
  - la pill « Rejoindre » se masque quand ce device est déjà en appel
  - câble onRejoinCall — rejoint l'appel existant via le deep-link entrant autoAnswer
  - pill « Rejoindre » dans le header — parité iOS (b69509366)
  - ChatViewModelTest — harness field est `vm`, pas `viewModel`
  - pill « Rejoindre l'appel » après crash/relaunch mid-call — parité iOS/web
  - derive comment like-state from the comment's own reactions (#1880)
  - guard RTCPeerConnectionDelegate callbacks against a torn-down connection (#1883)
  - normalize call:end's client-supplied reason before casting to CallEndReason (#1885)
  - unify ToS + Privacy Policy into one data-driven legal screen (§L) (#1887)
  - About screen — pure version/link/info SSOTs + Compose glue (§L) (#1886)
  - crash-report diagnostics viewer with share (§L) (#1884)
  - découverte active-call — modèles + API REST (parité rejoin, tranche 1)
  - blank-aware participant displayName via shared SSOT
  - repost of a repost now renders — remap storyEffects media ids on snapshot
  - add pure storyEffects media-id remap helper
  - revert pytest + httpcore bumps from PR #1907/#1910 (unresolvable pins)
  - revert numpy bump from PR #1909 (documented ESPnet/chatterbox-tts ceiling)

## 1.11.0

### Minor Changes

- Changements automatiques détectés :

  - le type audio/video voyage enfin dans le payload REST active-call — une visio rejointe reprenait en audio
  - un refus socket-down est différé et rejoué AVEC sa raison — parité Android DeclinedCallStore
  - le refus depuis l'écran verrouillé émet reason=rejected — dernier chemin de refus non couvert
  - captions traduites en direct — consommation de call:translated-segment
  - GET /reactions/user/:userId resolves userId → participant ids (#1882)
  - auto-download decision pipeline — network monitor + first policy consumer (#1881)
  - le refus émet call:end reason=rejected — aligné Android/web
  - un refus explicite écrit status=rejected — fin de la fausse notification « appel manqué »
  - les refus portent reason=rejected — le journal de l'appelant ne dit plus « manqué » pour un refus
  - le bouton Répondre décroche directement — autoAnswer câblé de bout en bout
  - Refuser depuis la notification (CallStyle) — le correspondant ne sonne plus 60 s dans le vide
  - canal de sonnerie v2 — le heads-up d'appel entrant SONNE au lieu d'un ding
  - expiration APNs 60 s sur les pushes d'appel iOS — miroir du TTL FCM
  - TTL 60 s sur les pushes d'appel Android — fin du ring fantôme post-reconnexion
  - pushes d'appel Android data-only — la chaîne FCM background revit
  - watchdog de connexion — l'appel jamais connecté se termine à 45 s
  - watchdog de la phase de connexion — un appel répondu jamais connecté est borné à 45 s
  - budget d'attente socket aligné sur iOS (8 s → 30 s)
  - initiate/join attendent la connexion socket — le décroché à froid ne meurt plus en silence
  - clampe l'attempt de call:reconnecting à la borne du schéma gateway (10)
  - émet call:reconnecting/reconnected — le serveur suit enfin les restarts ICE web
  - watchdog du budget de reconnexion — ReconnectFailed enfin tiré, fenêtre bornée ~30 s
  - rejoindre l'appel en cours depuis la bulle
  - bulle d'appel vivante + rendu annulé par-spectateur
  - résilience réseau mid-call — stalls ICE détectés, restart + renégociation, reconnecting/reconnected émis
  - message:edited avec callSummary route vers applyCallNoticeUpdate — transition live→terminal sans badge « modifié »
  - call:check-active à chaque connexion — le ring manqué mid-reconnexion est rejoué
  - support call-live côté iOS — décodage, transition terminale in-place, anti-régression snapshot
  - indicateurs mute/caméra du pair — call:media-toggled n'est plus jeté
  - bulle d'appel vivante + annulé par-spectateur + fallback durci
  - message d'appel vivant créé dès call:initiate
  - sort peek() memory-only fallback by enqueuedAt to match drain() (#1877)
  - avatar + banner upload (media pipeline) (#1878)
  - les sweeps GC d'initiateCall postent la conversion du message live
  - drop residual {emoji:0} on optimistic unlike (align with socket sync) (#1876)
  - émet call:analytics — télémétrie de cycle de vie à la fin d'appel
  - endedBy stampé sur les deux branches terminales de leaveCall
  - upsert terminal du message d'appel (anti-freeze + GC failed)
  - evict signalSessionCache entry when a participant leaves (audit #10 regression) (#1875)
  - clear pending-message timers on eviction & cleanup (no timer/Map leak) (#1873)
  - relaie call:screen-capture-detected — l'enregistrement d'écran local alerte le pair
  - live transcript panel auto-reveals on first segment, not only local toggle
  - broadcast message:edited système (payload complet + offline)
  - Transcript section in the call detail sheet — gated, deletable, disclaimed
  - création du message d'appel vivant (non branchée)
  - métadonnée call-live + endedByInitiator + conversion GC
  - parité alertes distantes — quality-alert + screen-capture-alert (solde parité web)
  - route call-message long-press through the shared decision point
  - media cache management (per-category sizes + clear) (#1874)
  - creds TURN frais reçus mid-reconnect ré-arment le restart ICE en vol (audit #9)
  - écoute des 4 side-channels manquants — participant-left, quality-alert, screen-capture-alert, translated-segment (audit #5, solde listeners)

## 1.10.0

### Minor Changes

- Changements automatiques détectés :

  - CallTranscriptStore actor — merge-on-save, real CacheResult handling
  - encrypted callTranscripts store, swept on logout/account-deletion
  - add CallTranscript/CallTranscriptSegment pure models

## 1.9.9

### Patch Changes

- 6d5cb1e: Deux corrections de robustesse alignant le code sur son contrat documenté.

  **`RedisDeliveryQueue.peek()` — ordre de rejeu (gateway).** Le chemin rapide de
  `peek()` (aucune entrée en repli mémoire) renvoyait la tranche Redis dans l'ordre
  brut de la liste (ordre de slot), sans le tri `byEnqueuedAt` qu'appliquent
  `drain()` et le chemin mixte de `peek()`. Or `ENQUEUE_DEDUP_LUA` remplace un
  événement mutable **sur place** — il conserve le slot FIFO d'origine tout en
  estampillant un `enqueuedAt` plus récent — donc l'ordre de slot peut diverger de
  l'ordre chronologique. L'aperçu remontait alors un ordre de rejeu que le client
  en reconnexion ne verra jamais (p. ex. une édition avant le message qu'elle cible),
  violant l'invariant « order by enqueuedAt exactly like drain() » de `peek()`
  lui-même. Correction : lecture complète `(0, -1)` puis tri par `enqueuedAt` **avant**
  d'appliquer la limite (un `lrange(0, limit-1)` borné découpe en ordre de slot et
  peut écarter l'entrée chronologiquement la plus ancienne).

  **`CommonSchemas.pagination` — coercion défensive (shared).** Les transforms
  `limit`/`offset` appliquaient `|| défaut` à la chaîne brute **avant** `parseInt`,
  ne rattrapant donc que `undefined`/`''` : `'abc'` produisait `NaN` et `'-5'` passait
  tel quel, l'un comme l'autre pouvant fuiter dans un `take`/`skip` Prisma. Le repli
  est désormais appliqué **après** `parseInt`, avec bornage (`limit` 1..100,
  `offset` ≥ 0), à l'image du `validatePagination` de la gateway. Couvre `pagination`
  et `messagePagination`. Aucun changement de schéma, d'API ni de migration.

- Updated dependencies [6d5cb1e]
  - @meeshy/shared@1.8.3

## 1.9.8

### Patch Changes

- Changements automatiques détectés :

  - contrat d'events gelé — literals migrés, events morts dépréciés (audit #4/#6)

## 1.9.7

### Patch Changes

- 49dff55: Reçus de livraison : l'expéditeur n'est plus compté comme destinataire de son propre message sur le chemin WebSocket `message:send`, éliminant un faux ✓✓ (« delivered ») et un compteur `deliveredCount` gonflé.

  `MessagingService.createSuccessResponse` normalise `senderId` vers le `User.id` de l'expéditeur (les clients comparent à leur propre userId), alors que le chemin REST/ZMQ conserve `senderId` = `Participant.id` brut. Les trois filtres d'exclusion de l'expéditeur de `MessageHandler` (`autoDeliverToOnlineRecipients`, `_updateUnreadCounts`, l'enqueue hors-ligne) comparaient `p.id === senderId` — vrai en permanence quand `senderId` est un `User.id`, puisqu'un `Participant.id` ne l'égale jamais. L'expéditeur, toujours en ligne au moment du broadcast, passait donc le filtre : `markMessagesAsReceived` était appelé sur son propre participant, `getLatestMessageSummary` remontait `deliveredCount ≥ 1` et un `read-status:updated` était émis vers l'expéditeur — son UI affichait « delivered » alors qu'aucun destinataire n'avait reçu le message. En groupe, chaque envoi WS gonflait `deliveredCount` de 1 ; une déconnexion juste après l'ACK pouvait aussi ré-enqueuer à l'expéditeur son propre message (bulle dupliquée au reconnect).

  L'exclusion passe désormais par un prédicat unique `_isSender(p, senderId)` qui matche `p.id === senderId` OU `p.userId === senderId`. Les `Participant.id` et `User.id` n'entrent jamais en collision, donc l'expéditeur est correctement exclu sur les deux transports sans jamais écarter un destinataire légitime ; les expéditeurs anonymes (sans `userId`) restent matchés par `p.id`. Comportement du chemin REST/ZMQ inchangé. Aucun changement de schéma, d'API ni de migration.

## 1.9.6

### Patch Changes

- 54d5e06: Reçus de livraison : le chemin de broadcast REST/ZMQ marque désormais « delivered » les destinataires en ligne mais hors de la conversation, à parité avec le chemin WebSocket `message:send`.

  `MeeshySocketIOManager._broadcastNewMessage` (emprunté par `broadcastMessage`, appelé par la route REST `POST /conversations/:id/messages` et par le rejeu ZMQ) émettait `message:new` uniquement vers `conversation:<id>`, faisait la synchro liste (`conversation:updated` / `conversation:unread-updated`) et l'enqueue hors-ligne, mais n'appelait jamais `markMessagesAsReceived` pour un destinataire connecté qui consulte un autre écran. L'expéditeur restait bloqué sur un simple ✓ (« sent ») jusqu'à ce que le destinataire ouvre réellement la conversation — alors que le chemin WS `message:send` upgrade immédiatement en ✓✓ via `MessageHandler._autoDeliverToOnlineRecipients`.

  La logique d'auto-livraison est désormais exposée en source unique (`MessageHandler.autoDeliverToOnlineRecipients`) et le chemin REST/ZMQ y délègue (mêmes instances `io` / `connectedUsers` / services read-status + privacy), garantissant un comportement de reçu identique quel que soit le transport. Respecte toujours la préférence `showReadReceipts` par destinataire. Aucun changement de schéma, d'API ni de migration.

## 1.9.5

### Patch Changes

- b2aeabf: Delivery queue hors-ligne : le rejeu mémoire respecte désormais l'ordre chronologique (FIFO) comme le chemin Redis.

  `RedisDeliveryQueue.drain` triait les entrées par `enqueuedAt` uniquement sur le chemin Redis ; le repli mémoire (Redis indisponible) retournait les entrées dans l'ordre brut du tableau. Or une supersession en place (`edited`/`deleted`/`reaction-*`) conserve le slot d'origine — donc antérieur — tout en portant un `enqueuedAt` plus récent : l'ordre du tableau et l'ordre chronologique divergent. Un utilisateur hors-ligne dont tous les événements ont été mis en file mémoire (Redis KO) pouvait ainsi rejouer, par ex., une réaction ré-ajoutée AVANT le retrait intermédiaire, convergeant vers un état que l'expéditeur n'a jamais eu (réaction perdue). `drain` trie maintenant le repli mémoire par `enqueuedAt`, alignant les deux backends. Aucun changement de schéma, d'API ni de migration.

## 1.9.4

### Patch Changes

- 917f9c9: Delivery queue hors-ligne : la dernière édition d'un message gagne au rejeu.

  `RedisDeliveryQueue.enqueue` dédupliquait sur `(messageId, eventType)` en gardant la **première** entrée. Comme plusieurs éditions d'un même message partagent toutes `eventType === 'edited'`, une 2e édition faite pendant qu'un destinataire est hors-ligne était silencieusement jetée, et le rejeu au reconnect livrait le contenu intermédiaire périmé au lieu du contenu final de l'expéditeur.

  `new` reste strictement idempotent (retry → première entrée gardée). Les événements mutables (`edited`/`deleted`) **supersèdent en place** l'entrée existante (Redis `LSET` à sa position FIFO, chemin mémoire par remplacement immuable) : une seule entrée par `(messageId, eventType)` est conservée, portant le payload le plus récent. Aucun changement de schéma, d'API ni de migration.

## 1.9.3

### Patch Changes

- f16a057: Offline delivery queue for reactions — a reaction added or removed while a participant is offline is now replayed on reconnect, closing the gap that only covered message edits/deletes.

  Gateway: `ReactionHandler` enqueues `reaction-added`/`reaction-removed` events for offline conversation participants (excluding the reacting actor and every online peer), mirroring the existing `MessageHandler` edit/delete enqueue. On reconnect `MeeshySocketIOManager` drains these entries and replays them as `reaction:added` / `reaction:removed`, so an offline peer's cached reaction counts converge instead of staying stale until an unrelated full refetch. The single-reaction swap path also queues the replaced emoji's removal. Reaction entries never carry a delivery receipt.

  Shared: `QueuedMessagePayload.eventType` gains `'reaction-added'` and `'reaction-removed'`.

- Updated dependencies [f16a057]
  - @meeshy/shared@1.8.2

## 1.9.2

### Patch Changes

- Updated dependencies [71046e6]
  - @meeshy/shared@1.8.1

## 1.9.1

### Patch Changes

- 2c28c9d: Fiabilisation des messages en temps réel et de la présence.

  Web : revalidation non destructive du fil de conversation (rattrapage par watermark `after` à l'ouverture, au focus et à la reconnexion — les derniers messages reçus apparaissent désormais après un rechargement) ; sync socket→cache active sur la vue liste ; règle de présence vert/orange/gris unifiée sur toutes les surfaces d'avatars.

  Gateway : file de livraison hors-ligne pour les participants anonymes, drain multi-device vers la room utilisateur, jointure des rooms socket à la création de conversation/DM/lien d'invitation, gate de confidentialité de la présence (showOnlineStatus/showLastSeen) sur les endpoints REST, et override de présence temps réel sur le détail des conversations.

## 1.9.0

### Minor Changes

- Changements automatiques détectés :

  - serialize per-user \_seq allocation+emit to preserve SyncEngine ordering (#1713)
  - pinned-message banner (chat §C read side) (#1715)
  - serialize thermal video downgrade, fix unhold error swallow, TURN/STUN reliability (#1692)
  - stop dependabot proposing Next.js major bumps (#1694)
  - reply-count pills — pure ReplyThreads SSOT (#1684)
  - two realtime correctness bugs — presence list leak + moderator-delete offline enqueue (iter 144) (#1685)
  - fix WebRTC task isolation races, dead analytics field, ObservedObject re-subscription (#1665)
  - getUserLanguagePreferences injects deviceLocale — parity with display resolution (iter 143) (#1666)
  - synchronise la présence du profil avec la liste de conversations (#1664)
  - UA detection — specific platform swallowed by generic token (iter 142) (#1662)
  - who-reacted breakdown sheet — pure ReactionBreakdown SSOT (#1663)
  - overnight DND morning tail bound to window start day (iter 141) (#1661)
  - restore DELETE/PUT/PATCH in CORS preflight
  - web rejoin race + signaling leak, gateway zombie-socket scoping + DND bypass (#1660)
  - idempotent attachment:reaction — no re-broadcast on a no-op add/remove (iter 141) (#1659)
  - pure ConversationSections SSOT — pinned/others split, no phantom empty section (#1657)
  - snapToScale honors octave wrap — auto-tune no longer mis-snaps B (iter 139) (#1656)
  - formatFileSize rolls Ko→Mo — no more "1024 Ko" (iter 138) (#1655)
  - clicksByHour in UTC — coherent with clicksByDate (iter 137) (#1654)
  - gateway call-lifecycle fanout hardening + iOS accessibility/HIG fixes (#1653)
  - FIFO drain order — a memory-fallback edit no longer replays before its Redis-backed new (iter 136) (#1652)
  - discard-draft affordance (§B draft lifecycle) (#1651)
  - locationCount never incremented on the live path — count by messageType like recompute (iter 135) (#1650)
  - dropped ICE restart never recovered when a renegotiation was already in flight (web) (#1649)
  - idempotent reaction:add — no re-broadcast/re-notify on a no-op re-react (iter 134) (#1648)
  - iconified empty-state card (iOS parity §B) (#1647)
  - aggregate packet loss across all inbound streams (iter 133) (#1646)
  - orphan-recovery gaps, duration anchor drift, dead push, quality-monitor loop, banner re-arm (#1645)
  - email fragments no longer linkified/extracted as mentions — unify SSOT left boundary (iter 132) (#1644)
  - pure empty-state decision (iOS parity §B) (#1643)
  - quality-first dedup — a newer basic no longer downgrades a premium (iter 129) (#1640)
  - "End &amp; Answer" never answered the waiting call + third caller silently dropped (#1639)
  - draft-aware ordering + draft row preview (iOS parity §B) (#1638)
  - message-list route ignored frozen receipts, under-counting delivered/read vs read-status endpoints (#1637)
  - bouton 'voir la conversation' sur l'ecran d'appel (minimise + ouvre le DM)
  - minimiser l'appel en pilule flottante (voir la conversation pendant l'appel)
  - call:end recovery bypassed the wide fanout + web never sent call:heartbeat (#1636)
  - clamp truncateFilename output for maxLength &lt; 4 (iter 128) (#1635)
  - faire aboutir l'appel SORTANT Android (peerId du joiner)
  - fermer automatiquement l'ecran d'appel termine
  - persist reply reference with draft (iOS DraftStore parity) (#1633)
  - scope anonymous membership check to the target conversation (#1634)
  - missed-call notification skipped on force-end cleanup + dead field names in adaptive degradation (#1631)
  - per-conversation text draft auto-save/restore (iOS parity) (#1630)
  - batch read-statuses ignored frozen receipts, under-counting vs single-message endpoint (#1629)
  - faire aboutir l'appel entrant WebRTC (join-with-ACK + to-field)
  - demander la permission micro/camera au runtime avant le media
  - disconnect-grace missed calls never notified + stale perfect-negotiation state on rejoin (#1627)
  - extract preprocessContent to a pure module so its test guards production (iter 126) (#1628)
  - anonymous socket joins ROOMS.user room so unread badge updates live (#1626)
  - importer le media WebRTC P1-P4 (moteur + coordinateur + video)
  - faire sonner l'appel entrant au niveau app (offer socket foreground)
  - filter STT alternatives by region, drop tautology + var shadowing (#1620)
  - EMOJI_PATTERN range swallowed CJK/Kana/Hangul (#1622)
  - split delete into "for everyone" vs "for me" (iOS parity) (#1624)
  - extract normalizeMarkdown to a pure module so its test guards production (#1621)
  - version-bump gap in initiateCall cleanup + web quality-report never emitted (#1606)
  - release dedup key on failure so retries aren't swallowed (#1608)
  - unify sanitizer dangerous-key guard, close sanitizeMongoQuery prototype-pollution gap (#1605)
  - key message-translation cache by preferred language (iter 124) (#1613)
  - NLLB language-map coverage, uppercase URL scheme, group senderName SSOT (#1602)
  - is_list_item bullet class was an unintended char range (#1593)
  - deliver notification:new to the right room + close anon typing/reaction cross-conversation gap (#1588)
  - stop duplicate message:new re-broadcast on sequential retry + linkify mixed-case mentions (#1592)
  - render a live sub-minute countdown as 1m, not 0m (#1590)
  - call banner swipe-to-collapse bubble (#1618)
  - header typing-avatar chips (stacked + overflow) (#1616)
  - evict sockets from call room on GC force-end (#1601)
  - remove duplicate/false typing:stop on multi-device disconnect (#1617)
  - correct destructured prop name in DraggableParticipantOverlay (#1597)
  - callee accepting an audio-only call no longer activates camera/transmits video (#1614)
  - callee accepting an audio-only call no longer activates camera/transmits video
  - enforce the 2-hour message-edit window (#1612)
  - resolve mixed-case @mentions via OR+equals, not case-broken `in` (#1611)
  - header-level typing indicator + group member subtitle (#1607)
  - declarer les permissions media appels (RECORD_AUDIO/CAMERA)
  - nom de conv/appel direct = autre participant, pas soi
  - Reels P6 — boutons flottants alignes iOS (+ Contacts au radial)
  - Reels P5 — reels dans le Feed (carte + lancement gate)
  - Reels P4 — route nav + lancement Feed + item radial
  - Reels P3 — module :feature:reels + ViewModel + ecran vertical
  - Reels P2 — Media3 + atome ReelVideoSurface
  - Reels P1 — API getReels + repo + plan de portage
  - habillage Profile (MeeshyBackground gradient + tokens)
  - retirer la deconnexion de la vue principale (reste dans Reglages)
  - route notification:new to ROOMS.user, not raw userId (#1604)
  - polish — habillage Contacts (gradient + tokens)
  - polish — habillage Calls (MeeshyBackground gradient)
  - fold typing roster into scroll-to-bottom control (#1603)
  - Option A — retrait bottom nav -> MeeshyMenuFab radial
  - keyed typing-participants roster + label SSOT (#1599)
  - P2-S2 Chat increment 1 — fond gradient + app bar transparent
  - P2-S3 Feed habillage glass + formateur date partage
  - P2-S5 Notifications — timestamp ISO -> label localise
  - hydrater currentUser au boot (me() renvoie {user}, pas MeeshyUser)
  - P2-S4 Reglages — icones colorees de section + tokens
  - P2-S4 habillage Reglages (MeeshyBackground + chrome transparent)
  - enforce read⇒delivered in markMessagesAsRead
  - P2-S1 barre de recherche glass en bas (parite iOS)
  - P2-S1 retirer les chips filtres Material (parite iOS)
  - mapper userPreferences (debloque pin/mute/archive/customName)
  - P2-S1 sections repliables liste conv (CollapsibleSection)
  - P2-S1 resoudre le nom des conversations directes
  - P2-S1 habillage liste conv (MeeshyBackground+glass+grand titre)
  - GC missed-call notifications, force-leave timer cleanup, web offer/TURN-refresh gaps (#1594)
  - swipe-to-reply gesture with rubber-band commit core (#1595)
  - scroll-to-bottom control with unread badge + preview (#1591)
  - all-or-nothing group delivery semantics for own-message checks (#1587)
  - tap a quoted-reply preview to scroll to the original (#1584)
  - P1-8 MeeshyToast (feedback pill + notification card)
  - P1-7 MeeshyMenuFab (menu radial iOS = stack vertical staggere)
  - P1-7 FloatingGradientFab (FAB gradient corail/indigo)
  - P1-6 CollapsibleSection (sections repliables liste conv)
  - P1-5 MeeshyAvatar v2 (ring/presence/mood + fill gradient)
  - apiCall degrade sur reponse malformee au lieu de crasher
  - degrade SerializationException to a PARSE failure instead of crashing
  - affiliate relations no longer leak presence to non-friends
  - call:join never acked failures (gateway+web) + 2 P2034 gaps in CallService
  - use RFC 7232 §3.2 weak comparison for If-None-Match
  - gate cached translation path with conversation-membership check
  - chat @-mention autocomplete + roster display-name resolution
  - repair phantom-ringing fanout gap + call teardown edge cases
  - dedup on the resolved message id, not the constant "latest"
  - in-conversation message search + search-highlight wiring
  - restore F84 load-more offset fix reverted by a stale merge
  - P0-4 primitives chrome glass + habillage pilote Notifications
  - P0-3 typographie rounded Nunito (substitut SF Pro Rounded)
  - P0-2 ColorScheme Material complet indigo (zero surface grise)
  - improve iOS quality, accessibility and fix CI flakiness
  - restore web P0 initiator UI + check-active replay + transient-error whitelist silently dropped by 8ebd497b, absorb PR #1558's boot-floor/race fixes
  - converge getParticipantDisplayName to canonical name resolver
  - P0-1 verrouiller les design tokens sur la parite iOS
  - count text messages by messageType in incremental path to match recompute (F85)
  - rich-text rendering (markdown/mentions/m+/URL/highlight) (#1571)
  - bound participantId cache + reset typing throttle on stop
  - \_segment_text no longer drops a short sentence before a huge one (F85)
  - restore ~450 lines of call-safety fixes silently reverted by 8ebd497b
  - honest all-or-nothing delivery indicator (DeliveryStatusResolver) (#1568)
  - serialize per-user \_seq emission to guarantee ordering
  - message-effects lifecycle (ephemeral/blurred/view-once) (#1562)
  - authoritative groupBy recompute for post/comment reactionSummary (F84c)
  - improve iOS app quality, accessibility, and reliability
  - remove 7 dead Localizable.xcstrings keys surfaced by the merge
  - clear typing throttle on typing:stop so the next start re-emits
  - hasMentions no longer flags email addresses as mentions
  - harden message reaction summary (tx + authoritative count + P2002 idempotency)
  - use canonical display-name SSOT in V2 conversation-list transform (F84)
  - load-more advances offset instead of refetching page 1 forever (F84)
  - boot-floor gap in phantom-cleanup + web initiator race/dead-timeout regressions
  - first/last-name fields in the profile editor (§K) (#1556)
  - stop scroll ticks re-rendering the whole list body
  - cap list previews at 300 graphemes, add ScrollOffsetRelay, make mood-badge pulse idempotent
  - cap lastMessage.content preview at 300 code points in GET /conversations
  - comprehensive UX/UI quality and accessibility improvements
  - forward message language to conversation stats so languageDistribution stops freezing (F84)
  - regional (content) language preference (§L) (#1530)
  - apply query filters to status-breakdown groupBy in getAffiliateStats (F83)
  - offline-queued notification-preference backend sync (§L) (#1526)
  - fold participant-scoped counts to users so leaderboards stop duplicating/hiding users (F82)
  - stop stripping ZWNJ/ZWJ — preserve emoji, Persian & Indic text (F82)
  - web initiator never entered its own call + gateway phantom-cleanup killed live cross-conversation calls
  - PATCH /messages/:messageId now broadcasts message:edited and retranslates
  - per-event notification type toggles (§L)
  - DND quiet-hours schedule editor (§L) (#1517)
  - remove dead NOTIFICATION socket event + fix broken Prisma import (F77)
  - honor failureWindowMs so isolated failures no longer trip the breaker (F77)
  - validate E.164 by digit count, not prefixed string length (F80)
  - guard CallsViewModel.loadCalls() against stale-filter races
  - durable notification master toggles (§L) (#1512)
  - honor bidirectional blocking on typing indicators
  - persisted interface language (settings-interface-language) (#1508)
  - close concurrent-call and cross-call correctness gaps in WebRTC/CallKit stack
  - auto-detect Spanish UI language — es was missing from detectBestInterfaceLanguage (F79)
  - clear stale typing indicators on ConversationSocketHandler teardown
  - persisted light/dark/system theme (settings-theme-mode) (#1504)
  - isUrlOnly no longer absorbs CJK/Thai text glued to a URL (F76)
  - web never replayed a missed ringing call on reconnect + rate-limit call:check-active
  - join rooms before marking socket connected to close message-loss race
  - getEmailValidationError agrees with isValidEmail (F73)
  - remove dead voice-effects audio pipeline
  - phantom-ringing callees now get the call_cancel push from GC tier 1 too
  - optimistic + offline profile edit incl. content languages (§K) (#1500)
  - reactionSummary self-heals from authoritative Reaction rows
  - durable Room cache for the profile stats/timeline dashboard (§K) (#1496)
  - capitalize hyphenated/apostrophe names + strip CR from displayName (F72)
  - stop toasting transient call:error codes iOS already treats as non-fatal
  - clear qualityDegradedStreaks on GC-forced call end too
  - community pin/mute/archive/hide no longer stale across devices (F71)
  - relay real error code on call:toggle-audio/video failure
  - renegotiate video SDP direction on CallKit hold/unhold
  - chip release during active edge auto-scroll no longer drops
  - getInitials emits broken half-surrogate for emoji names (F68)
  - profile 30-day activity timeline sparkline (§K)
  - make calendarDayDiff DST-immune (F67)
  - guard setAudioEffect against a dead capture-hook collision risk
  - real-time presence broadcast bypassed blocking check
  - stats projection SSOT + read-only dashboard section (#1489)
  - reapply AVAudioSession mode on A/V switch, track cumulative reconnect count
  - terminal-write protocol for orphaned sessions, rate-limit backgrounded/foregrounded, sweep quality-streak leak
  - stop truncateFilename overflow + formatCompactNumber "1000.0K" boundary (F65/F66)
  - unconditional VoIP registration, dark-chrome text contrast, defensive audio unwraps (#1484)
  - extract shared CallTypeBadgeView, drop unreachable a11y label (#1476)
  - treat Mongo P2034 write-conflict as retryable on endCall/leaveCall too (#1480)
  - stop orphaning offline messages after a Redis blip, bound participantId cache
  - secondary identity rows — languages · country · timezone
  - dual-emit message:read-status-updated alongside legacy event
  - profile-header enrichment — presence · completion ring · E2EE · member-since (#1482)
  - support hyphenated usernames end-to-end via MENTION_HANDLE_CHARS SSOT (F60)
  - derive worker drain lanes from a kind→lane SSOT (#1478)
  - make post/comment reaction removal idempotent
  - header title follows displayName like the list row
  - normalize language-code case at all write/read boundaries (F63/F64)
  - close duplicate-reaction race in AttachmentReactionService
  - three-state presence dot on friend rows (#1474)
  - text tool — centered editing, 6 new fonts, visible weights, diamond/cloud/speech frames
  - ship customName (and unstrip reaction) in the list payload
  - socket conversation:updated no longer clobbers DM display names
  - resolveUserLanguage lowercases in-app prefs — case parity with resolveUserLanguagesOrdered (F62)
  - stop CallView defaulting callManager to CallManager.shared (P1-16)
  - @username fallback uses the module's Unicode boundary, not ASCII (#1464)
  - per-filter chip counts on the Contacts list (#1470)
  - drop the chip on Épingles to pin the conversation
  - bump CallSession.version on all terminal writers
  - comment_reaction honors commentLikeEnabled, no opt-out bypass (F59)
  - durable Room cache for Discover suggestions cold-start paint (#1466)
  - stop stale offline broadcast on anonymous reconnect race
  - comment-reaction carries the real postType, no REEL/STATUS collapse (F58)
  - edge auto-scroll while dragging the chip (Phase 3)
  - auto-scroll aux bords pendant le drag de chip (Phase 3 long-press)
  - STUN-only fallback no longer strands calls without TURN
  - friends Room cache for cold-start paint (#1461)
  - close TOCTOU race that could resurrect a deleted message with edited content
  - the card sits flush under the expiry line — top vertical alignment (C-DIR5)
  - media load failures speak up (C16, targeted audit 4)
  - empty texts are purged when inline editing ends (C15, targeted audit 3)
  - VoiceOver speaks the UI's language on the chrome (C14, targeted audit 1)
  - gradient backgrounds end-to-end — format, three renderers, palette row (C11)
  - trim redundant comments that overflowed a byte-bounded test window
  - complete fr/en/es/de coverage for all 108 story.\* keys (C12)
  - unbreak pre-existing structural/behavioral CI tests
  - discreet undo/redo — header icons exist only when the trajectory allows (C9 inc.4+5)
  - hasMentions Unicode-aware — detect accented @DisplayName (F57)
  - global undo/redo apply snapshots; media purge becomes lazy (C9 inc.3)
  - close camera-state race, guard doomed CallKit transactions, drop dead code
  - durable offline friend-request send with cmid idempotency (#1458)
  - global undo capture — one debounced trigger, gap-free by construction (C9 inc.2)
  - HistoryStore — pure state stack for global undo (C9 inc.1)
  - carded canvas no longer reserves the hidden header, viewport zoom resets on carding (C-DIR4 bug 4)
  - hung-participant detector in call-reliability-report
  - letterbox takes the slide background colour in full-chrome (C-DIR4 bug 2)
  - letterbox du canvas 9:16 aux couleurs du fond du slide en présentation libre (BUG-2 C-DIR4)
  - background colour applies instantly + draft resume no longer restores an empty composer (C-DIR4 bugs 1&3)
  - stickers get a single source of truth — currentEffects passthrough (C13)
  - self-heal playback when the primary player is stuck .paused (C-DIR3)
  - reword close() comment so it doesn't self-match the new test
  - flush pending DataChannel bye before peer connection teardown
  - unified chrome — header follows the FABs, collapsed-band handle removed (C-DIR2 b/c/d)
  - close TOCTOU race that could regress the delivered/read cursor
  - stickers are reachable again — picker wired into the Text panel (C8)
  - nonisolated data-channel value types — unbreak CallSignalIndicatorTests compile
  - durable offline block/unblock via the outbox (block-outbox-durable)
  - the add-story badge no longer gets clipped (user report)
  - ghost handle to recover hidden chrome (C3)
  - unbreak main build — register CallSignalGlyph.swift in pbxproj, hoist typealias out of ViewBuilder body
  - slide opening effect reachable by gesture from the Fond panel — VM-owned state (C1)
  - the Transitions sheet becomes real — slide opening-effect picker (C7)
  - transient quality pills, color-coded signal glyph, WhatsApp-style banner, instant remote hangup
  - add-slide affordance at the end of the slide strip (C6)
  - gesture exit for viewport zoom — double-tap resets, near-identity pinch snaps to 1.0 (C4)
  - exécution phasée — le run se termine connecté au compte de test
  - timeline FAB/tile/swipe-up open the timeline sheet instead of an empty band panel (C5)
  - sync reels affinity caches on post edit/delete (F55)
  - cache-first Discover suggestions (empty-query) (#1451)
  - single-flight SUB receive + silence watchdog — translation return channel self-heals
  - map Mongo P2034 write conflict on join to the existing conflict-retry path
  - Dynamic Type for MentionSuggestionPanel (139i)
  - background URLs are allow-listed — no more viewer IP-leak (W7)
  - hard-delete no longer orphans media rows forever (G7)
  - single canonical visibility filter (G5)
  - reaction self-echo no longer double-counts likeCount (F56)
  - zoom transition on secondary surfaces (U1 inc.2)
  - zoom transition from tray bubble to viewer on iOS 18+ (U1 inc.1)
  - stop logging DTMF digits and transcript content
  - EXCEPT/ONLY can no longer publish without an audience (W6)
  - Blocked-users tab + BlockCache SSOT binding the resolver seam (#1446)
  - EXCEPT/ONLY audience picker in the story composer (W3 inc.2)
  - COMMUNITY visibility in the story composer + visibilityUserIds plumbing (W3 inc.1)
  - dedup offline delivery queue by messageId+eventType, not messageId alone
  - intra-slide crossfades render in the web viewer (W1 inc.4)
  - intra-slide crossfades finally render at playback (R14)
  - Dynamic Type for KeypadTab (138i)
  - local mutations persist through the dirty-flush path (R12 inc.2)
  - silent refresh consumes the G1 delta-sync (R8 inc.1)
  - Discover live user-search with inline connect (#1443)
  - keyset cursor pagination on the stories tray (G1c)
  - lean tray projection on GET /posts/feed/stories (G1b)
  - undo/redo history survives a hard crash (E4 inc.2)
  - Dynamic Type for MessageListView swipe indicator (136i)
  - remove dead FirebaseNotificationService FCM sender (F51)
  - unit-fetch out-of-tray stories by postId on deep link (R4 inc.2)
  - Dynamic Type for SyncPill (135i)
  - close duplicate-reaction race with atomic upsert
  - forward real postType + ephemeral context on socket reaction notifications
  - hop CXPlayDTMFCallAction to MainActor; tie TURN TTL to CallCleanupService
  - online-first friends list + cross-screen cache reconciliation (#1434)
  - guard mark-unread cursor rewind against a fresher concurrent read
  - friendship & relationship-state SSOT (#1431)
  - remove dead handleIncomingOffer, dedupe call-notice presentation logic
  - exclude source language from story caption translation targets
  - the draft-resume card replaces the bare text alert (U4 increment 2)
  - DraftResumeCard building block (U4 increment 1)
  - Dynamic Type + a11y for AchievementBadgeView (134i)
  - regenerate pbxproj — drop phantom AudioEffectsPanel.swift reference
  - viewedAt timestamp alongside isViewed — soft migration (R11)
  - replay message edits/deletes to offline recipients too
  - VoiceOver custom actions for prev/next story navigation (U6 increment 2)
  - VoiceOver announces slide changes in the reader (U6 increment 1)
  - preload the next slide's media (W5)
  - live story deletion and per-text-object translation merge (W4)
  - legacy story content resolves over the full language chain (R10)
  - fix two self-inflicted test assertions from the previous commit
  - client expiry fallback aligned with the server's 21h (G6)
  - read overlay text from canonical `text`, not legacy `content`
  - CXAnswerCallAction hold + system-PiP frozen-frame placeholder
  - key typing-indicator roster by userId, not display name
  - adaptive video-sender-cap plan (network + thermal) (#1417)
  - haptic ticks on slide change and buffering freeze/resume (U2)
  - live translation + delete on the feed realtime hook (W4)
  - stop leaking CallParticipant.analytics on active-call route
  - enqueue offline recipients on the WS message:send path too
  - foreground media-object keyframes animate too (W1 increment 2)
  - text-object keyframes animate in the web reader (W1 increment 1)
  - auto-advance timer freezes while the primary video buffers (W2)
  - textObjects translate to the audience's real languages (G3)
  - single translation pipeline for story content (G2)
  - identity-aware active-call teardown (#1415)
  - encrypt the stories tray store like every other social store (R9)
  - logout purges the story draft AND the persisted publish queue (E9)
  - actually run the legacy offline-queue migration at boot (E6)
  - the queue cleans up its media copies (E10 disk leak)
  - last-message preview excludes soft-deleted messages
  - screen-capture participant spoofing, pocket-dial, HIG hit targets, stale-peer cleanup
  - sniff the URL extension before routing media to disk stores (R7)
  - story view receipts are durable via the outbox (R6)
  - chip drop moves the conversation onto a section header
  - delta-sync via ?updatedSince on the stories tray (G1)
  - debounce the sending clock glyph for sub-200ms sends (B.4)
  - write-ahead makes the online publish survive process kills (E5)
  - undo/redo history survives the timeline sheet lifecycle (E4)
  - flush the open timeline into the slide before persisting (E3)
  - deep-link container serves the cached tray before forcing network (R4)
  - identity interstitial between story groups (user directive)
  - call-reliability-report — prod health report for the multi-hour calls goal
  - periodic in_progress analytics snapshots survive app kills
  - update two source-guard tests for the TURN-refresh watchdog refactor
  - split press-state detector from long-press trigger
  - discreet buffering indicator during mid-slide stalls (R3)
  - propagate deviceLocale to the last 2 resolveUserLanguage sites
  - freeze timeline while the bg image bitmap is still loading (R2)
  - debounced draft autosave — editing survives hard crashes (E1)
  - retry TURN refresh on dropped ACK, surface busy/failure feedback, finish a11y hints
  - DM dedup reopens the most recently ACTIVE duplicate
  - auto-dismiss call-waiting banner on remote end (#1411)
  - buildEffects no longer wipes timeline-authored fields (E2)
  - pin viewed-story media until expiry (R5 wiring)
  - serialize updateOnNewMessage per conversation to stop a lost-update race
  - direct-DM creation is idempotent — reopen the existing DM
  - pinning exempts keys from DiskCacheStore eviction (R5)
  - amplify row scale animation dampingFraction for visible rebounce
  - freeze timeline while slide audio is still caching (R1)
  - Dynamic Type for MoodReplyConfirmationOverlay (132i)
  - persist end-of-call analytics on CallParticipant
  - Dynamic Type + a11y for MessageDetailSheet hero glyphs (131i)
  - apply URL-only translation guard on all 3 entry points
  - negotiationTimeMs separates WebRTC setup from human ring time
  - add negotiationTimeMs metric for WebRTC connection timing
  - Dynamic Type for ReelFeedCard glyphs (130i)
  - wire dead PiP rotation hook, fix VoiceOver double-read, fix Dynamic Type clipping
  - guard REST message-delete lastMessageAt with optimistic concurrency
  - re-anchor already-answered source-guard on the real subscriber
  - call_answered_elsewhere silent push — multi-device socketless ring dismissal
  - call-waiting banner for a second incoming call (#1403)
  - la liste de conversations scrolle à nouveau — retrait du DragGesture plein-ligne
  - call_cancel silent push ends phantom ringing (client side)
  - fan out sendToUser to device tokens in parallel
  - call_cancel background push kills phantom ringing on socketless devices
  - rate-limit reconnect/ICE-refresh handlers, remove dead signaling hook
  - quality-alert requires sustained degradation and excludes the reporter
  - remove unauthenticated-admin debug notification routes
  - quality-monitor warm-up gate fails closed when start date is nil
  - GC tier 3 spares multi-hour calls with fresh heartbeats
  - Dynamic Type + a11y for CameraView (129i)
  - re-wire MessageDraftMediaStore + 2 test files into pbxproj, purge warnings
  - useSocialSocket retries once the socket bootstraps
  - Dynamic Type for FeedPostCard action-bar glyphs (128i)
  - forward badge as android notificationCount (F1 Android)
  - keep the literal videoToggleTask?.cancel() call CI checks for
  - toggleVideo() can run two concurrent camera/transceiver actuations on rapid double-tap
  - GC force-end never fanned out call:ended to ringing callee's user room
  - typing:start/stop now require active conversation membership
  - WebRTC-plumbing outbound emits (call-webrtc-plumbing-emits) (#1393)
  - Dynamic Type for BubbleDeliveryCheck status glyphs (127i)
  - photothèque du composer — long press vidéo, actions Ajouter/Sélectionner/Éditer, présélection picker, Liquid Glass iOS 26 (#1389)
  - correct two false-positive assertions from prior commit
  - getReels curseur chronologique (lossless) + languageCodeSchema accepte les 639-3
  - CallEffectsOverlay ObservedObject re-subscription bug + a11y/dead-code cleanup
  - resync feed room + typing keepalive across reconnect/long sessions
  - badge unread embarqué dans le push — badge d'icône iOS et widget gelés app fermée (F1)
  - appel jamais décroché = missed (critère answeredAt) + garde FSM reconnecting
  - refactor conversation row long-press gesture with proper priority
  - fallback pendingCount cohérent avec pendingUIItems sur échec de lecture (item H cause D)
  - reclaim visibility-timeout des rows .inflight orphelines (item H)
  - les pièces jointes du brouillon survivent au kill (phase 2 — câblage)
  - store durable des pièces jointes de brouillon de message (phase 1)
  - Dynamic Type + VoiceOver for conversation composer (iter 126i)
  - pure video-survival auto-disable policy (#1387)
  - curseur getReplies aligné asc + codes langue 639-3 acceptés
  - call:ended atteint l'appelé qui sonne (fanout rooms user)
  - réaligne le garde AdjustBitrate sur le merge BWE gated + pbxproj regen
  - auto-save du brouillon au passage en background (D1)
  - auto-retry of failed messages now forwards clientMessageId
  - indicateur qualité fiable + écran d'appel décalé de 30pt
  - action « Enregistrer » dans le menu appui-long (composant unifié)
  - Dynamic Type + VoiceOver for AttachmentLoadingTile (iter 125i)
  - hooks onSaveRequested sur les viewers SDK + câblage du fullscreen média des bulles
  - report « downloaded » best-effort dans le coordinateur unifié (parité P7-9)
  - câbler audio + galerie média sur le composant unifié Enregistrer
  - Dynamic Type + VoiceOver for iPad panel header (iter 124i)
  - implement drag-to-reorder during long-press with smooth transition
  - correct offset windows and setEffect precondition in new tests
  - atomic conditional consume closes brute-force TOCTOU on SMS reset attempt caps
  - remplacement 1-réaction-par-user + gate messages système dans toggleReaction
  - adjust scale animation timing for smoother rebounce
  - sémantique de remplacement 1-réaction-par-user + gate messages système
  - resolve duplicate CallEffectsOverlayAccessibilityTests class
  - restore VideoConfig, actually used by P2PWebRTCClient
  - implement row scale animation reset on menu dismiss
  - thread-safety, dead code, and VoiceOver gaps in calling stack
  - add long-press scale animation to conversation rows
  - connection-quality classification core + live signal indicator (#1381)
  - type decodePayload's corrupt-payload error as MeeshyError
  - gate FRIENDS-visibility posts through buildVisibilityFilter
  - re-join call room on socket reconnect (production component)
  - idempotence du remove de réaction sur le chemin socket
  - DELETE de réaction idempotent (not-found → succès, pas 404)
  - pure telecom-connection policy (ConnectionService state reports) + reporter fold (#1377)
  - totalMembers exclut le sender par identité (pas -1 aveugle)
  - bootRecovery détecte aussi les fichiers média visuels manquants au crash
  - annuler un envoi média offline balaie ses fichiers (fuite disque)
  - pure call-audio policy (ringback/ringtone/cues) + tone controller fold (#1375)
  - le merge edit-into-send offline détruisait les médias en attente
  - dead-letter immédiat des rejets serveur 4xx permanents dans l'outbox
  - watermark conversation-list dérivé de l'horloge locale (R15b)
  - watermark de gap-recovery messages empoisonné par clock-skew (R15a)
  - SyncEngine A3.2 — pagination cursor keyset composite /sync
  - SyncEngine A5.4 — resync notifications au reconnect (fenêtre aveugle)
  - SyncEngine A5.3 — resync notifications sur gap de séquence
  - SyncEngine A5.2 — hook gapDetected sur SyncSeqTracker
  - SyncEngine A5.1 — décodage \_seq + tracker de gap (bénéfice multi-device)
  - SyncEngine A2.1 — emitWithSeq sur notification:new (event pilote \_seq)
  - SyncEngine A3.1 — endpoint /sync read-only, collection messages
  - terminal statuses are immutable — leave/disconnect can no longer rewrite missed as completed
  - SyncEngine A1 — UserEventSeq + SequenceService.nextSeq atomique
  - unify REST/socket CallService instance, harden markCallAsMissed, remove dead beacon fallback
  - report downloaded pour les documents (gap P7-9 P3 comblé)
  - enforce maxUses cap atomically (F47 TOCTOU)
  - BlockActionCoordinator — block/unblock durable pour les sites Views (R6-4 complet)
  - BlockedViewModel.unblock via l'outbox durable (R6-4 incr.2, 1/N sites)
  - primitive block optimiste + fix caveat swipe labels périmés (R6-4 incrément 1/2)
  - atomic increments for calibrateProfile counters (lost-update race)
  - release active-call claim on ringing-timeout missed + self-heal leaked claims
  - sliding window des sessions trusted — champ lastActivityAt (P7-3)
  - recordView — catch P2002 différencié + log des pannes réelles (P7-2)
  - verrous + master PIN purgés au logout (P7-11, invariant 9)
  - ConversationLockManager logout hook — purge cross-account leak (P7-11)
  - close cap TOCTOU — reserve slot atomically before creating relation (F47)
  - réconciliation complète périodique — purge des conversations fantômes hard-supprimées (P7-10)
  - release active-call claim on missed-timeout, harden signaling authz, fix waiting-banner reject
  - propagate profile changes to conversation partners (USER_UPDATED)
  - une panne gateway ne consomme plus le budget de retries de l'outbox (P7-7)
  - le composer ne se verrouille plus pendant qu'un message est sur l'horloge ⏳
  - live in-call duration timer (slice call-duration-timer) (#1371)
  - AgentAdminRelay ne démarrait jamais — connect() avant subscribe()
  - purge du cache HTTP URLCache au logout (T15b-b, invariant 9)
  - C8 — dédup des sockets same-user au join (last join wins)
  - document Dynamic Type freeze doctrine for FeedView chrome (iter 123i)
  - tolerate GRDB Date round-trip noise in markEdited ordering guard
  - decode editedAt onto APIMessage (CI compile failure)
  - guard message:edited against out-of-order stale delivery
  - atomic increments in ConversationMessageStats edit/delete hooks (F48)
  - stop clearing ringing timeout on early-join; fix web duplicate-offer race
  - call:join ne désarme plus le ringing timer — l'answer SDP et les chemins terminaux le possèdent
  - Dynamic Type + VoiceOver for EmojiPickerSheet (iter 122i)
  - Dynamic Type for message context menu (iter 121i)
  - réconciliation call:end aussi sur ACK-échec (chaos-test 2)
  - joinCall transitionne vers RINGING — l'early-join du callee n'est pas un décrochage (item F matérialisé)
  - version-guard call-termination writes, align REST/socket end-call authorization
  - harden two lost-update/out-of-order races on shared counter & cursor
  - guard read/delivery cursors against out-of-order regression
  - deep-link a full-screen call push into the incoming-call screen
  - un appel sortant non décroché ne bascule plus en écran connecté 00:00 — garde FSM .reconnecting, horloge d'appel, bannières Dynamic Island, avatars duo + fond profil
  - hide decorative conversation backdrop from VoiceOver (iter 120i)
  - unify 5 bounded-cache copies into a single BoundedTtlCache SSOT
  - grâces disconnect affinées — extension si socket vivant, grâce courte pré-answer (chaos-tests prod)
  - guard stale ICE-restart/call-waiting async continuations
  - close lost-update race on message reaction summary
  - Dynamic Type + VoiceOver for message-bubble media grid (iter 119i)
  - route FCM call pushes to a full-screen incoming-call notification (#1354)
  - reconcile with concurrent session's merged fix, keep only the surviving bug
  - pre-existing CI failures — PiP filter button a11y hint, dead localization keys, stale auto-hide test
  - CallKit informé sur tout teardown .failed, TURN préservé sur End & Answer, bannière call-waiting nettoyée, indicateur signaling dégradé
  - iOS CallKit/TURN/banner triad + gateway endCall idempotency gap
  - bound participant-lookup cache (FIFO 5000 + expired sweep)
  - un restart/blip ne tue plus un appel établi — ownership disconnect, réhydratation boot, hygiène timers
  - appels tués à tort — garde socket-zombie + sémantique leftAt (C5, 14 sites)
  - réaligner 3 source-guards CallView hérités du merge main
  - bound resolveConversationId identifier→ObjectId cache (FIFO 2000)
  - exact @mention resolution — anchor Unicode name boundaries
  - endCall() resolves pre-answer hangups as missed, not completed
  - pure incoming-call push decision core (#1347)
  - Dynamic Type + VoiceOver for ConversationView message-row affordances (iter 118i)
  - claim activeCallId — matcher aussi les documents sans le champ
  - gateway audit follow-through — leftAt persistence, missing summary index, force-leave missed path, ICE rate limit
  - drop stale retranslation results (edit ordering race)
  - survive gateway restart — active P2P call no longer cut by signaling-socket drop
  - remove dead previewRouter + unify conversation preview width (deferred NITs)
  - dedup key must include messageId, not just conversation
  - appels — vidéo distante, join VoIP fiable, chrono CallKit, contrôles cadre
  - Dynamic Type in action menu + inert-modifier cleanup (deferred review)
  - call:missed contract + video layout on remote escalation
  - restore call metric glyphs and move call time bottom-right
  - contraste blanc-sur-verre en Light + a11y overlay (déférés revue)
  - dedicated Calls bottom-nav tab + re-dial gesture (calls-tab-nav) (#1340)
  - dismissContextMenu — purge asyncAfter annulable
  - bannière DM strippée sur la route LIST (schéma minimal)
  - bound StatusHandler identityCache to stop unbounded typing-path growth
  - remove dead activeCallSession() call breaking sdk-tests compile
  - close call:heartbeat authz gap to strict active-participant check
  - gate CallKit plateforme — le simulateur pilote l'appel in-app
  - add missing banner arg to APIConversationUser test fixture
  - Dynamic Type + VoiceOver for StoryViewerView canvas (iter 117i)
  - stale-broadcast ordering races + unbounded conversationId cache
  - remontee banniere de profil (DM) + boutons header conversation en glass
  - hide decorative onboarding backdrop from VoiceOver + Dynamic Type CTA (iter 116i)
  - unify timeout via withTimeout helper, fix leaked timers
  - evict VoIP dedup entry on CallKit report failure (busy path)
  - close initiateCall/joinCall TOCTOU races on concurrent starts
  - Dynamic Type doctrine for CallView control bar (iter 115i)
  - update stale transcription-segment tests for active-participant authz
  - Dynamic Type + VoiceOver for StoryExportShareSheet (iter 114i)
  - hide dead voice-effects panel (video filters only)
  - coalesce reconnect triggers, epoch half-open re-arm, TURN refresh at restart, stuck-muted fallback
  - raffinements apercu long-press conversation
  - redesign system call bubble — compact, direction-aware, timestamped
  - Dynamic Type + VoiceOver for OnboardingFlowView chrome (iter 113i)
  - close conversation-membership authz bypass on transcription-segment
  - thread real conversationId into outgoing call route (call-nav-conversation-thread)
  - apercu long-press conversation enrichi (banniere, avatar, actions, dernier message)
  - action Renommer dans le menu contextuel conversation
  - Dynamic Type + VoiceOver for OnboardingStepViews (iter 112i)
  - close membership-check bypass, post call-summary on every terminal path
  - restore reaction notifications on the socket path
  - bind the realtime socket to the auth session (realtime-session-coordinator) (#1321)
  - restore CallMediaConfig.swift — VideoConfig is a real prod dependency
  - scope Opus SDP munging to audio, enforce per-call authz, drop dead code
  - idempotent P2002 handling on message reaction add
  - zoom in/out sur l'overlay long-press conversation
  - Dynamic Type for StatusBubbleOverlay (iter 111i)
  - MessageMoreSheet en grille verre (Liquid Glass iOS 26)
  - Dynamic Type + VoiceOver for ReelsPlayerView (iter 110i)
  - fold CallSignalManager into CallViewModel (VM-fold)
  - restore conversation long-press menu (remove .onDrag conflict)
  - ACK-based call:initiate (emitInitiate + pure parser) (#1311)
  - custom conversation context menu (icons on iOS 26)
  - clear participant heartbeat on mid-call leave
  - preserve supported ISO 639-3 language codes in normalizeLanguageCode
  - add safety-net expiry for stuck remote typing indicators
  - stop SDP-munging RED into audio offers/answers, use setCodecPreferences
  - typed FRIEND_REQUEST_NEW/ACCEPTED/REJECTED events
  - context-menu icons + story quit alert legibility
  - Dynamic Type + VoiceOver for StoryTrayView (iter 109i)
  - apply late/refreshed TURN credentials to a live peer connection
  - recent/missed-calls list UI (CallHistoryViewModel + screen) (#1304)
  - native-lean long-press menu (reactions + bubble + vertical list)
  - emit friend-request:cancelled so the other party's list syncs live
  - Dynamic Type for StoryViewerView sidebar/header (iter 108i)
  - resistant swipe on audio/video bubbles
  - route quick affordances to native MessageMoreSheet
  - menu longpress - new components + MessageDetailSheet decomposition
  - Dynamic Type + VoiceOver for FeedPostCard media (iter 107i)
  - Dynamic Type + VoiceOver for AudioEffectsPanel (iter 106i)
  - serialize camera switch, close stale peer connection, fix VoIP dedup eviction
  - VoiceOver labels for feed attachment remove buttons (iter 105i)
  - Dynamic Type + VoiceOver for AudioEffectsPanel (iter 105i)
  - Dynamic Type + VoiceOver for VideoFilterControlView (iter 105i)
  - Dynamic Type + VoiceOver for ShareLinksView (iter 104i)
  - VoiceOver labels for AudioFullscreenView icon-only controls (iter 103i)
  - Dynamic Type + VoiceOver for EditPostSheet (iter 100i)
  - Dynamic Type + VoiceOver for ConversationMediaGalleryView (iter 103i)
  - Dynamic Type + VoiceOver + content selection for LicensesView (iter 98i)
  - finish Dynamic Type + VoiceOver for LoginView (iter 102i)
  - resolve committed merge-conflict markers in routine uiux docs
  - Dynamic Type + VoiceOver for TrackingLinksView (iter 101i)
  - Dynamic Type + VoiceOver for CommunityLinkDetailView (iter 99i) (#1272)
  - resolve committed conflict markers from triple 93i collision
  - Dynamic Type + VoiceOver + content copy for SupportView (iter 95i) (#1262)
  - call-history repository (REST + Room cache-first SWR)
  - Dynamic Type + VoiceOver for ConversationListView overlays (iter 94i)
  - source unique presse-papier pour les pages links — iter 70
  - Dynamic Type + VoiceOver for ForwardPickerSheet (iter 100i)
  - Dynamic Type for MessageOverlayMenu (iter 99i)
  - Dynamic Type + VoiceOver for UserStatsView (iter 98i)
  - copy diagnostics via long-press menu in AboutView (iter 98i)
  - remove duplicate accessibilityElement on AffiliateView stat card (iter 92i)
  - trim background-observer comment to fit CI's fixed-window source test
  - serialize hold/unhold video ops, fix glare-path state leak, GC race guard
  - memoize participantLookup to cut per-message DB round-trip (B.3)
  - update quality-report test for participant-gated persistCallStats
  - moderator-kick wrong-participant, quality-report authz gap, ringing-call CallKit gap
  - thread-safe audio effect counters, cache-first filter switch, a11y hint (#1257)
  - Dynamic Type + destructive-red token for EffectsPickerView (iter 87i)
  - source unique formatFileSize — iter 70
  - relocate stragglin docs, drop orphan MARK dividers
  - split StoryComposerView into view-builder extensions
  - Dynamic Type + VoiceOver for AddParticipantSheet (iter 97i)
  - pure call-journal model (CallRecord + CallDirection/CallMediaType) (#1254)
  - keep attachments on message:edit realtime broadcast
  - Dynamic Type + VoiceOver for NotificationSettingsView (iter 96i)
  - split StoryCanvasUIView into method extensions
  - split StoryComposerViewModel into method extensions
  - extract free top-level types into dedicated files
  - widen access private→internal on the 3 refactor targets
  - resolve Participant.id before handleMessage in agent + non-blocking-translation paths
  - content selection + VoiceOver for TwoFactorSetupView (iter 95i)
  - Dynamic Type + VoiceOver for SharePickerView (iter 94i)
  - Dynamic Type + VoiceOver for AffiliateView (iter 94i)
  - Dynamic Type + VoiceOver for MemberManagementSection (iter 94i)
  - Dynamic Type for SharePickerView (iter 94i)
  - Dynamic Type for LocationPickerView (iter 93i)
  - Dynamic Type + VoiceOver for LocationPickerView (iter 93i)
  - Dynamic Type + VoiceOver for ConversationPreferencesTab (iter 93i)
  - CallSignalManager — inbound call:\* → SharedFlow<CallEvent> + outbound emit table (#1230)
  - render comment audio/media in feed preview + fix notification badge truncation
  - Dynamic Type + VoiceOver for AffiliateView (iter 92i)
  - Dynamic Type + VoiceOver for NewConversationView (iter 91i)
  - Dynamic Type + VoiceOver for CommunityLinksView (iter 91i)
  - Dynamic Type + VoiceOver AffiliateView (iter 91i)
  - Dynamic Type + VoiceOver for AffiliateView (iter 91i)
  - Dynamic Type + VoiceOver for DataExportView (iter 91i)
  - stop audio-toggle self-echo, rate-limit transcription relay, reset PiP fps
  - Dynamic Type + VoiceOver DataExportView (iter 90i)
  - Dynamic Type for NewConversationView (iter 90i)
  - Dynamic Type + VoiceOver for MagicLinkView (iter 90i)
  - Dynamic Type + VoiceOver + palette for EffectsPickerView (iter 89i)
  - Dynamic Type + i18n/render fixes for DeleteAccountView (iter 88i)
  - Dynamic Type + VoiceOver for DeleteAccountView (iter 88i)
  - Dynamic Type + VoiceOver for voice profile wizard (iter 87i)
  - route legacy slide.mediaURL background via directURLIfAny (WS5.4a)
  - retire le code mort du filtre temps-reel Story
  - retire le dead StoryFilteredLayer, extrait StoryFilterKind
  - ne plus exposer l'email des co-participants (PII)
  - notify peer on local SDP failure, drop dead emitCallEnd overload
  - Dynamic Type + VoiceOver for storage & auto-download settings (iter 83i)
  - retire les références orphelines ReplyThread du pbxproj
  - story par défaut en Contacts + filtres par média
  - inbound call:\* signalling event models + pure CallEvent mapper (#1207)
  - Dynamic Type + VoiceOver headers for AboutView (iter 86i)
  - VoiceOver selection semantics for the language picker (iter 85i)
  - Dynamic Type + VoiceOver for StarredMessagesView (iter 85i)
  - corrections du review présence (conformité + decay)
  - respecter les prefs présence dans les listes (Lot 5)
  - Dynamic Type + VoiceOver for EditProfileView (iter 84i)
  - présence datée + colorée après le pseudo (fiche profil, Lot 6 iOS)
  - keep PR1157/PR1148 catalog-backed localization (fix dead keys)
  - Dynamic Type + i18n parity for legal screens (iter 83i)
  - unify sheet grabber affordance (iter 79i)
  - Dynamic Type parity for call-screen inline glyphs (iter 79ib)
  - Dynamic Type for the feed attachment composer (iter 79i)
  - source unique du temps restant avant expiration — iter 59
  - Dynamic Type for the fullscreen audio player (iter 82i)
  - complete ConversationSettingsView localization (iter 78i)
  - Dynamic Type for the active sessions screen (iter 82i)
  - relay real toggle-media errors + unify CallService instance (RC-4)
  - RelativeTimeFormatter.lastSeenString (Lot 6 iOS)
  - localize ConversationLockSheet + VoiceOver/Dynamic Type (iter 81i)
  - import Combine in OfflineQueueTests (CI restore)
  - add missing import Combine to OfflineQueueTests (unblock sdk-tests CI)
  - CountryPicker VoiceOver labels + sheet grabber (iter 80i)
  - Dynamic Type for the feed post composer (iter 78i)
  - drop dead-on-read maintenance of cursor.unreadCount (iter 57 / F23c)
  - consolidate destructive/error/expired reds to MeeshyColors.error (iter 78i)
  - mock createUnifiedAuthMiddleware in profile-extended tests
  - complete story-viewer localization catalog (iter 79i)
  - :feature:calls CallViewModel + minimal call screen (Calls slice) (#1169)
  - localize MessageOverlayMenu message menu (iter 78ib)
  - localize Router route/scene titles + deep-link error (iter 79i)
  - :feature:calls CallViewModel + minimal call screen (Calls slice)
  - Dynamic Type for the link preview card (iter 78i)
  - tokenize semantic hardcoded colors to MeeshyColors (iter 78i)
  - localize SharePickerView chrome strings (iter 77i) (#1162)
  - Dynamic Type ConversationDashboardView (iter 71i)
  - Dynamic Type for the invite friends sheet (iter 76i)
  - localize message quick-action menu — iter 71i
  - harden call signaling against payload spoofing + DoS
  - mark EmojiGridCategoryTests @MainActor (iter 71i)
  - Dynamic Type 2FA security flow (iter 71i)
  - pure call-lifecycle FSM (core:model) (#1153)
  - localize emoji-picker category VoiceOver labels (iter 71i)
  - retry transient push failures + stop deactivating tokens on provider outages
  - Dynamic Type for the voice profile management screen (iter 75i)
  - consolidate hardcoded hex tints to MeeshyColors tokens on Support/Report screens (iter 71i)
  - categorised + searchable sticker picker (#1135)
  - localize 6 hardcoded French VoiceOver labels/hints (iter 71i)
  - scope push notification collapse-id per-conversation (#1140)
  - Dynamic Type for the conversation dashboard (iter 74i)
  - respecter les prefs privacy dans presence:snapshot (Lot 2, E1)
  - mock createUnifiedAuthMiddleware in profile.test (unblock CI)
  - ne pas divulguer la présence des membres via /links (Lot 2, E2)
  - retire la présence des payloads friend-requests (Lot 4)
  - typage viewer dans /users/search (authContext cast)
  - unifier la résolution d'avatar participant + corriger notSeenBy (iter 47)
  - gate présence dans /users/search (Lot 4)
  - batch resolveForTargets + gate /users/presence (Lot 2)
  - mock createUnifiedAuthMiddleware in profile.test.ts (unblock CI)
  - hoist actor-isolated pendingCount() out of XCTAssert autoclosure
  - re-apply await-hoist in PendingStatusQueueTests (merge reverted 87f85d68d)
  - restore iOS work reverted by the PresenceVisibilityService merge (84fedd79)
  - gate présence sur les lookups email/phone/id dédiés (Lot 3 fin)
  - remove orphaned ReplyThreadOverlay.swift (complete #1122 cluster removal)
  - grace period before treating a transient socket drop as call-leave (P0-7)
  - localize hardcoded French VoiceOver strings (iter 73i)
  - gate présence sur la fiche profil (Lot 3/6)
  - remove ReplyThreadOverlay.swift resurrected by a merge artifact (unblocks CI)
  - Dynamic Type for the feed comments sheet (iter 72i)
  - hoist await out of XCTAssert autoclosure (iter 71i unblock)
  - PresenceVisibilityService (Lot 1/6 présence)
  - wire invite-user-modal row aria-label to selection state
  - guard call-waiting pending-clear against newer overwrite (#1133)
  - remove dead ReplyThreadOverlay to unblock iOS compile (iter 71i)
  - unread-count batch must exclude each participant's own messages (iter 46 / F23b)
  - Dynamic Type for the 2FA security flow (iter 71i)
  - collapse per-message unread counts to a single query (iter 45 / F23) (#1134)
  - hoist await out of XCTAssertEqual autoclosure in PendingStatusQueueTests
  - remove ReplyThreadOverlay.swift resurrected by a merge artifact
  - guard call-waiting pending-clear against newer overwrite
  - repair invite-modal result row broken by merge (unblocks CI)
  - calibrate coverageThreshold to CI-bun baseline (~9.5pp below local-node)
  - batch unread counts in one read (F23, iter 45)
  - fix hover-prefetch cache key mismatch crashing on new message
  - sync reels cache on post edit/delete (socket + optimistic) (#1615)
  - recharger sur erreur de chunk perime attrapee par ErrorBoundary
  - recover socket.io realtime delivery after reconnect_failed
  - converge formatDuration onto shared formatClock (iter 74)
  - converge local formatDuration onto shared formatClock
  - supprime à nouveau le doublon d'import copyToClipboard (régression réintroduite) (#1291)
  - adopte la source unique copyToClipboard dans TwoFactorSettings (F30-f) (#1284)
  - adopte la source unique copyToClipboard dans TwoFactorSettings (F30-f)
  - supprime le doublon d'import copyToClipboard (régression merge parallèle) (#1266)
  - remove duplicate copyToClipboard import introduced by main merge
  - remove duplicate copyToClipboard import breaking the build
  - annule les vérifications de disponibilité obsolètes (AbortController) — iter 70
  - clôture F30 — unification presse-papiers via source unique (iter 70)
  - source unique de validation d'ObjectId MongoDB — iter 69 (#1251)
  - converge conversation-share clipboard fallback on copyToClipboard (F30-d, iter 68)
  - converge partage conversation (fallback presse-papier) vers copyToClipboard (F30-d, iter 68)
  - converge partage conversation vers copyToClipboard (F30-d)
  - converge copie identifiant groupe vers copyToClipboard (F30-c)
  - converge partage feed/reel vers copyToClipboard (F30-b)
  - converge copie contenu/lien vers la source unique copyToClipboard (F30-a) (#1216)
  - remove duplicate getUserInitials import in u/[id] page
  - restaure isExpired reverté par le même merge parallèle — iter 64 (#1210)
  - restaure formatCompactNumber reverté par un merge parallèle — iter 63 (#1208)
  - restaure formatCompactNumber reverté par un merge parallèle — iter 63
  - source unique de la troncature de texte (truncate) — iter 62 (#1203)
  - source unique du formatage de durée média (formatClock) — iter 62
  - source unique du compteur compact (formatCompactNumber) — iter 61 (#1201)
  - source unique du prédicat d'expiration (isExpired) — iter 60 (#1199)
  - source unique du « temps restant avant expiration » — iter 59 (#1187)
  - restore contacts avatar initials to getUserInitials (iter 59, anti-régression F26c-c(b))
  - source unique de la classification du temps relatif — iter 58 (#1177)
  - source unique des initiales — profil public → getUserInitials (iter 58, F26c-c(c))
  - source unique des initiales — page profil app/u/[id] → getUserInitials (iter 58)
  - stop duplicate Socket.IO listener registration on reconnect-adjacent calls (iter 57)
  - source unique des initiales — famille contacts → getUserInitials — iter 57 (#1181)
  - initiales admin/users → getUserInitials + fix(gateway/test) createUnifiedAuthMiddleware mock — iter 56 (#1170)
  - source unique des initiales — MemberSelectionStep → getUserInitials — iter 55 (#1167)
  - source unique des initiales — MemberSelectionStep → getUserInitials (iter 55)
  - supprime le module mort utils/user.ts (clôt le cluster getUserDisplayName) — iter 54 (#1163)
  - source unique du nom d'affichage (username-first → canonique) — iter 53 (#1161)
  - source unique du nom d'affichage (déjà displayName-first) — iter 52 (#1159)
  - source unique des initiales d'avatar (objet) — iter 51 (#1158)
  - source unique des initiales d'avatar (string) — iter 50 (#1156)
  - source unique du nom d'affichage — copies locales (iter 50)
  - source unique du nom d'affichage utilisateur (iter 49) (#1147)
  - source unique de la validation d'email + dernière horloge inline (iter 48) (#1146)
  - unifier formatDuration sur le canonique formatClock (iter 47) (#1141)
  - présence colorée + datée sur la fiche profil (Lot 6 web)
  - unifier formatFileSize sur la source canonique partagée (iter 46) (#1136)
  - pin espnet==202412 — 202511 exige numpy>=2.0 et casse le build Docker
  - emoji extraction stripped CJK/Kana/Hangul, leaving CJK text untranslated (#1625)
  - pin pytest back to 8.3.4 — pytest-asyncio 0.25.2 requires pytest<9
  - deduplicate in-flight tasks — gateway retries no longer self-strangle long texts
  - repair stale outer-exception test in translation_processor
  - stop dividing torch threads by async worker count — inference ran 2× slow
  - sequential language fan-out — budgets now cover real inference time
  - proportional inference budget — long texts are translated again
  - boot import failure no longer permanently kills the audio pipeline
  - pin floating ML deps to stop non-deterministic Docker build breaks
  - sync uv.lock project version (unblock Test Python CI)
  - restore numpy<1.24 ESPnet constraint (revert breaking Dependabot #825)
  - import ESM avec extension .js + test-garde des imports relatifs
  - add .js extension to mention-parser import — prod gateway crash-loop
  - helper pur resolvePresenceVisibility (Lot 1/6 présence)

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.8.0

## 1.8.0

### Minor Changes

- Changements automatiques détectés :

  - serialize thermal video downgrade, fix unhold error swallow, TURN/STUN reliability (#1692)
  - stop dependabot proposing Next.js major bumps (#1694)
  - reply-count pills — pure ReplyThreads SSOT (#1684)
  - fix WebRTC task isolation races, dead analytics field, ObservedObject re-subscription (#1665)
  - getUserLanguagePreferences injects deviceLocale — parity with display resolution (iter 143) (#1666)
  - synchronise la présence du profil avec la liste de conversations (#1664)
  - UA detection — specific platform swallowed by generic token (iter 142) (#1662)
  - who-reacted breakdown sheet — pure ReactionBreakdown SSOT (#1663)
  - overnight DND morning tail bound to window start day (iter 141) (#1661)
  - fix hover-prefetch cache key mismatch crashing on new message
  - web rejoin race + signaling leak, gateway zombie-socket scoping + DND bypass (#1660)
  - idempotent attachment:reaction — no re-broadcast on a no-op add/remove (iter 141) (#1659)
  - pure ConversationSections SSOT — pinned/others split, no phantom empty section (#1657)
  - snapToScale honors octave wrap — auto-tune no longer mis-snaps B (iter 139) (#1656)
  - formatFileSize rolls Ko→Mo — no more "1024 Ko" (iter 138) (#1655)
  - clicksByHour in UTC — coherent with clicksByDate (iter 137) (#1654)
  - gateway call-lifecycle fanout hardening + iOS accessibility/HIG fixes (#1653)
  - FIFO drain order — a memory-fallback edit no longer replays before its Redis-backed new (iter 136) (#1652)
  - discard-draft affordance (§B draft lifecycle) (#1651)
  - locationCount never incremented on the live path — count by messageType like recompute (iter 135) (#1650)
  - dropped ICE restart never recovered when a renegotiation was already in flight (web) (#1649)
  - idempotent reaction:add — no re-broadcast/re-notify on a no-op re-react (iter 134) (#1648)
  - iconified empty-state card (iOS parity §B) (#1647)
  - aggregate packet loss across all inbound streams (iter 133) (#1646)
  - orphan-recovery gaps, duration anchor drift, dead push, quality-monitor loop, banner re-arm (#1645)
  - email fragments no longer linkified/extracted as mentions — unify SSOT left boundary (iter 132) (#1644)
  - pure empty-state decision (iOS parity §B) (#1643)
  - quality-first dedup — a newer basic no longer downgrades a premium (iter 129) (#1640)
  - "End &amp; Answer" never answered the waiting call + third caller silently dropped (#1639)
  - draft-aware ordering + draft row preview (iOS parity §B) (#1638)
  - message-list route ignored frozen receipts, under-counting delivered/read vs read-status endpoints (#1637)
  - bouton 'voir la conversation' sur l'ecran d'appel (minimise + ouvre le DM)
  - minimiser l'appel en pilule flottante (voir la conversation pendant l'appel)
  - call:end recovery bypassed the wide fanout + web never sent call:heartbeat (#1636)
  - clamp truncateFilename output for maxLength &lt; 4 (iter 128) (#1635)
  - faire aboutir l'appel SORTANT Android (peerId du joiner)
  - fermer automatiquement l'ecran d'appel termine
  - persist reply reference with draft (iOS DraftStore parity) (#1633)
  - scope anonymous membership check to the target conversation (#1634)
  - missed-call notification skipped on force-end cleanup + dead field names in adaptive degradation (#1631)
  - per-conversation text draft auto-save/restore (iOS parity) (#1630)
  - batch read-statuses ignored frozen receipts, under-counting vs single-message endpoint (#1629)
  - faire aboutir l'appel entrant WebRTC (join-with-ACK + to-field)
  - demander la permission micro/camera au runtime avant le media
  - disconnect-grace missed calls never notified + stale perfect-negotiation state on rejoin (#1627)
  - extract preprocessContent to a pure module so its test guards production (iter 126) (#1628)
  - anonymous socket joins ROOMS.user room so unread badge updates live (#1626)
  - importer le media WebRTC P1-P4 (moteur + coordinateur + video)
  - faire sonner l'appel entrant au niveau app (offer socket foreground)
  - filter STT alternatives by region, drop tautology + var shadowing (#1620)
  - EMOJI_PATTERN range swallowed CJK/Kana/Hangul (#1622)
  - split delete into "for everyone" vs "for me" (iOS parity) (#1624)
  - sync reels cache on post edit/delete (socket + optimistic) (#1615)
  - extract normalizeMarkdown to a pure module so its test guards production (#1621)
  - version-bump gap in initiateCall cleanup + web quality-report never emitted (#1606)
  - release dedup key on failure so retries aren't swallowed (#1608)
  - unify sanitizer dangerous-key guard, close sanitizeMongoQuery prototype-pollution gap (#1605)
  - key message-translation cache by preferred language (iter 124) (#1613)
  - NLLB language-map coverage, uppercase URL scheme, group senderName SSOT (#1602)
  - is_list_item bullet class was an unintended char range (#1593)
  - deliver notification:new to the right room + close anon typing/reaction cross-conversation gap (#1588)
  - stop duplicate message:new re-broadcast on sequential retry + linkify mixed-case mentions (#1592)
  - render a live sub-minute countdown as 1m, not 0m (#1590)
  - call banner swipe-to-collapse bubble (#1618)
  - header typing-avatar chips (stacked + overflow) (#1616)
  - evict sockets from call room on GC force-end (#1601)
  - remove duplicate/false typing:stop on multi-device disconnect (#1617)
  - correct destructured prop name in DraggableParticipantOverlay (#1597)
  - callee accepting an audio-only call no longer activates camera/transmits video (#1614)
  - callee accepting an audio-only call no longer activates camera/transmits video
  - enforce the 2-hour message-edit window (#1612)
  - resolve mixed-case @mentions via OR+equals, not case-broken `in` (#1611)
  - header-level typing indicator + group member subtitle (#1607)
  - declarer les permissions media appels (RECORD_AUDIO/CAMERA)
  - nom de conv/appel direct = autre participant, pas soi
  - Reels P6 — boutons flottants alignes iOS (+ Contacts au radial)
  - recharger sur erreur de chunk perime attrapee par ErrorBoundary
  - Reels P5 — reels dans le Feed (carte + lancement gate)
  - Reels P4 — route nav + lancement Feed + item radial
  - Reels P3 — module :feature:reels + ViewModel + ecran vertical
  - Reels P2 — Media3 + atome ReelVideoSurface
  - Reels P1 — API getReels + repo + plan de portage
  - habillage Profile (MeeshyBackground gradient + tokens)
  - retirer la deconnexion de la vue principale (reste dans Reglages)
  - route notification:new to ROOMS.user, not raw userId (#1604)
  - polish — habillage Contacts (gradient + tokens)
  - polish — habillage Calls (MeeshyBackground gradient)
  - fold typing roster into scroll-to-bottom control (#1603)
  - Option A — retrait bottom nav -> MeeshyMenuFab radial
  - keyed typing-participants roster + label SSOT (#1599)
  - P2-S2 Chat increment 1 — fond gradient + app bar transparent
  - P2-S3 Feed habillage glass + formateur date partage
  - P2-S5 Notifications — timestamp ISO -> label localise
  - hydrater currentUser au boot (me() renvoie {user}, pas MeeshyUser)
  - P2-S4 Reglages — icones colorees de section + tokens
  - P2-S4 habillage Reglages (MeeshyBackground + chrome transparent)
  - enforce read⇒delivered in markMessagesAsRead
  - P2-S1 barre de recherche glass en bas (parite iOS)
  - P2-S1 retirer les chips filtres Material (parite iOS)
  - mapper userPreferences (debloque pin/mute/archive/customName)
  - P2-S1 sections repliables liste conv (CollapsibleSection)
  - P2-S1 resoudre le nom des conversations directes
  - P2-S1 habillage liste conv (MeeshyBackground+glass+grand titre)
  - GC missed-call notifications, force-leave timer cleanup, web offer/TURN-refresh gaps (#1594)
  - swipe-to-reply gesture with rubber-band commit core (#1595)
  - scroll-to-bottom control with unread badge + preview (#1591)
  - all-or-nothing group delivery semantics for own-message checks (#1587)
  - tap a quoted-reply preview to scroll to the original (#1584)
  - P1-8 MeeshyToast (feedback pill + notification card)
  - P1-7 MeeshyMenuFab (menu radial iOS = stack vertical staggere)
  - P1-7 FloatingGradientFab (FAB gradient corail/indigo)
  - P1-6 CollapsibleSection (sections repliables liste conv)
  - P1-5 MeeshyAvatar v2 (ring/presence/mood + fill gradient)
  - apiCall degrade sur reponse malformee au lieu de crasher
  - degrade SerializationException to a PARSE failure instead of crashing
  - affiliate relations no longer leak presence to non-friends
  - call:join never acked failures (gateway+web) + 2 P2034 gaps in CallService
  - use RFC 7232 §3.2 weak comparison for If-None-Match
  - gate cached translation path with conversation-membership check
  - chat @-mention autocomplete + roster display-name resolution
  - repair phantom-ringing fanout gap + call teardown edge cases
  - dedup on the resolved message id, not the constant "latest"
  - in-conversation message search + search-highlight wiring
  - restore F84 load-more offset fix reverted by a stale merge
  - P0-4 primitives chrome glass + habillage pilote Notifications
  - P0-3 typographie rounded Nunito (substitut SF Pro Rounded)
  - P0-2 ColorScheme Material complet indigo (zero surface grise)
  - improve iOS quality, accessibility and fix CI flakiness
  - restore web P0 initiator UI + check-active replay + transient-error whitelist silently dropped by 8ebd497b, absorb PR #1558's boot-floor/race fixes
  - converge getParticipantDisplayName to canonical name resolver
  - P0-1 verrouiller les design tokens sur la parite iOS
  - count text messages by messageType in incremental path to match recompute (F85)
  - rich-text rendering (markdown/mentions/m+/URL/highlight) (#1571)
  - bound participantId cache + reset typing throttle on stop
  - \_segment_text no longer drops a short sentence before a huge one (F85)
  - restore ~450 lines of call-safety fixes silently reverted by 8ebd497b
  - honest all-or-nothing delivery indicator (DeliveryStatusResolver) (#1568)
  - serialize per-user \_seq emission to guarantee ordering
  - message-effects lifecycle (ephemeral/blurred/view-once) (#1562)
  - authoritative groupBy recompute for post/comment reactionSummary (F84c)
  - improve iOS app quality, accessibility, and reliability
  - remove 7 dead Localizable.xcstrings keys surfaced by the merge
  - clear typing throttle on typing:stop so the next start re-emits
  - hasMentions no longer flags email addresses as mentions
  - harden message reaction summary (tx + authoritative count + P2002 idempotency)
  - use canonical display-name SSOT in V2 conversation-list transform (F84)
  - load-more advances offset instead of refetching page 1 forever (F84)
  - boot-floor gap in phantom-cleanup + web initiator race/dead-timeout regressions
  - first/last-name fields in the profile editor (§K) (#1556)
  - stop scroll ticks re-rendering the whole list body
  - cap list previews at 300 graphemes, add ScrollOffsetRelay, make mood-badge pulse idempotent
  - comprehensive UX/UI quality and accessibility improvements
  - forward message language to conversation stats so languageDistribution stops freezing (F84)
  - regional (content) language preference (§L) (#1530)
  - apply query filters to status-breakdown groupBy in getAffiliateStats (F83)
  - offline-queued notification-preference backend sync (§L) (#1526)
  - fold participant-scoped counts to users so leaderboards stop duplicating/hiding users (F82)
  - stop stripping ZWNJ/ZWJ — preserve emoji, Persian & Indic text (F82)
  - web initiator never entered its own call + gateway phantom-cleanup killed live cross-conversation calls
  - per-event notification type toggles (§L)
  - DND quiet-hours schedule editor (§L) (#1517)
  - remove dead NOTIFICATION socket event + fix broken Prisma import (F77)
  - honor failureWindowMs so isolated failures no longer trip the breaker (F77)
  - validate E.164 by digit count, not prefixed string length (F80)
  - guard CallsViewModel.loadCalls() against stale-filter races
  - durable notification master toggles (§L) (#1512)
  - honor bidirectional blocking on typing indicators
  - persisted interface language (settings-interface-language) (#1508)
  - close concurrent-call and cross-call correctness gaps in WebRTC/CallKit stack
  - auto-detect Spanish UI language — es was missing from detectBestInterfaceLanguage (F79)
  - clear stale typing indicators on ConversationSocketHandler teardown
  - persisted light/dark/system theme (settings-theme-mode) (#1504)
  - isUrlOnly no longer absorbs CJK/Thai text glued to a URL (F76)
  - web never replayed a missed ringing call on reconnect + rate-limit call:check-active
  - getEmailValidationError agrees with isValidEmail (F73)
  - remove dead voice-effects audio pipeline
  - phantom-ringing callees now get the call_cancel push from GC tier 1 too
  - optimistic + offline profile edit incl. content languages (§K) (#1500)
  - reactionSummary self-heals from authoritative Reaction rows
  - durable Room cache for the profile stats/timeline dashboard (§K) (#1496)
  - capitalize hyphenated/apostrophe names + strip CR from displayName (F72)
  - stop toasting transient call:error codes iOS already treats as non-fatal
  - clear qualityDegradedStreaks on GC-forced call end too
  - community pin/mute/archive/hide no longer stale across devices (F71)
  - relay real error code on call:toggle-audio/video failure
  - renegotiate video SDP direction on CallKit hold/unhold
  - chip release during active edge auto-scroll no longer drops
  - getInitials emits broken half-surrogate for emoji names (F68)
  - profile 30-day activity timeline sparkline (§K)
  - make calendarDayDiff DST-immune (F67)
  - guard setAudioEffect against a dead capture-hook collision risk
  - real-time presence broadcast bypassed blocking check
  - stats projection SSOT + read-only dashboard section (#1489)
  - reapply AVAudioSession mode on A/V switch, track cumulative reconnect count
  - terminal-write protocol for orphaned sessions, rate-limit backgrounded/foregrounded, sweep quality-streak leak
  - stop truncateFilename overflow + formatCompactNumber "1000.0K" boundary (F65/F66)
  - unconditional VoIP registration, dark-chrome text contrast, defensive audio unwraps (#1484)
  - extract shared CallTypeBadgeView, drop unreachable a11y label (#1476)
  - treat Mongo P2034 write-conflict as retryable on endCall/leaveCall too (#1480)
  - stop orphaning offline messages after a Redis blip, bound participantId cache
  - secondary identity rows — languages · country · timezone
  - dual-emit message:read-status-updated alongside legacy event
  - profile-header enrichment — presence · completion ring · E2EE · member-since (#1482)
  - support hyphenated usernames end-to-end via MENTION_HANDLE_CHARS SSOT (F60)
  - derive worker drain lanes from a kind→lane SSOT (#1478)
  - make post/comment reaction removal idempotent
  - header title follows displayName like the list row
  - normalize language-code case at all write/read boundaries (F63/F64)
  - close duplicate-reaction race in AttachmentReactionService
  - three-state presence dot on friend rows (#1474)
  - text tool — centered editing, 6 new fonts, visible weights, diamond/cloud/speech frames
  - ship customName (and unstrip reaction) in the list payload
  - socket conversation:updated no longer clobbers DM display names
  - resolveUserLanguage lowercases in-app prefs — case parity with resolveUserLanguagesOrdered (F62)
  - stop CallView defaulting callManager to CallManager.shared (P1-16)
  - @username fallback uses the module's Unicode boundary, not ASCII (#1464)
  - per-filter chip counts on the Contacts list (#1470)
  - drop the chip on Épingles to pin the conversation
  - bump CallSession.version on all terminal writers
  - comment_reaction honors commentLikeEnabled, no opt-out bypass (F59)
  - durable Room cache for Discover suggestions cold-start paint (#1466)
  - stop stale offline broadcast on anonymous reconnect race
  - comment-reaction carries the real postType, no REEL/STATUS collapse (F58)
  - edge auto-scroll while dragging the chip (Phase 3)
  - auto-scroll aux bords pendant le drag de chip (Phase 3 long-press)
  - STUN-only fallback no longer strands calls without TURN
  - friends Room cache for cold-start paint (#1461)
  - the card sits flush under the expiry line — top vertical alignment (C-DIR5)
  - media load failures speak up (C16, targeted audit 4)
  - empty texts are purged when inline editing ends (C15, targeted audit 3)
  - VoiceOver speaks the UI's language on the chrome (C14, targeted audit 1)
  - gradient backgrounds end-to-end — format, three renderers, palette row (C11)
  - trim redundant comments that overflowed a byte-bounded test window
  - complete fr/en/es/de coverage for all 108 story.\* keys (C12)
  - unbreak pre-existing structural/behavioral CI tests
  - discreet undo/redo — header icons exist only when the trajectory allows (C9 inc.4+5)
  - hasMentions Unicode-aware — detect accented @DisplayName (F57)
  - global undo/redo apply snapshots; media purge becomes lazy (C9 inc.3)
  - close camera-state race, guard doomed CallKit transactions, drop dead code
  - durable offline friend-request send with cmid idempotency (#1458)
  - global undo capture — one debounced trigger, gap-free by construction (C9 inc.2)
  - HistoryStore — pure state stack for global undo (C9 inc.1)
  - carded canvas no longer reserves the hidden header, viewport zoom resets on carding (C-DIR4 bug 4)
  - hung-participant detector in call-reliability-report
  - letterbox takes the slide background colour in full-chrome (C-DIR4 bug 2)
  - letterbox du canvas 9:16 aux couleurs du fond du slide en présentation libre (BUG-2 C-DIR4)
  - background colour applies instantly + draft resume no longer restores an empty composer (C-DIR4 bugs 1&3)
  - stickers get a single source of truth — currentEffects passthrough (C13)
  - self-heal playback when the primary player is stuck .paused (C-DIR3)
  - reword close() comment so it doesn't self-match the new test
  - flush pending DataChannel bye before peer connection teardown
  - unified chrome — header follows the FABs, collapsed-band handle removed (C-DIR2 b/c/d)
  - stickers are reachable again — picker wired into the Text panel (C8)
  - nonisolated data-channel value types — unbreak CallSignalIndicatorTests compile
  - durable offline block/unblock via the outbox (block-outbox-durable)
  - the add-story badge no longer gets clipped (user report)
  - ghost handle to recover hidden chrome (C3)
  - unbreak main build — register CallSignalGlyph.swift in pbxproj, hoist typealias out of ViewBuilder body
  - slide opening effect reachable by gesture from the Fond panel — VM-owned state (C1)
  - the Transitions sheet becomes real — slide opening-effect picker (C7)
  - transient quality pills, color-coded signal glyph, WhatsApp-style banner, instant remote hangup
  - add-slide affordance at the end of the slide strip (C6)
  - gesture exit for viewport zoom — double-tap resets, near-identity pinch snaps to 1.0 (C4)
  - exécution phasée — le run se termine connecté au compte de test
  - timeline FAB/tile/swipe-up open the timeline sheet instead of an empty band panel (C5)
  - sync reels affinity caches on post edit/delete (F55)
  - cache-first Discover suggestions (empty-query) (#1451)
  - single-flight SUB receive + silence watchdog — translation return channel self-heals
  - map Mongo P2034 write conflict on join to the existing conflict-retry path
  - Dynamic Type for MentionSuggestionPanel (139i)
  - background URLs are allow-listed — no more viewer IP-leak (W7)
  - hard-delete no longer orphans media rows forever (G7)
  - single canonical visibility filter (G5)
  - reaction self-echo no longer double-counts likeCount (F56)
  - zoom transition on secondary surfaces (U1 inc.2)
  - zoom transition from tray bubble to viewer on iOS 18+ (U1 inc.1)
  - stop logging DTMF digits and transcript content
  - EXCEPT/ONLY can no longer publish without an audience (W6)
  - Blocked-users tab + BlockCache SSOT binding the resolver seam (#1446)
  - EXCEPT/ONLY audience picker in the story composer (W3 inc.2)
  - COMMUNITY visibility in the story composer + visibilityUserIds plumbing (W3 inc.1)
  - intra-slide crossfades render in the web viewer (W1 inc.4)
  - intra-slide crossfades finally render at playback (R14)
  - Dynamic Type for KeypadTab (138i)
  - local mutations persist through the dirty-flush path (R12 inc.2)
  - silent refresh consumes the G1 delta-sync (R8 inc.1)
  - Discover live user-search with inline connect (#1443)
  - keyset cursor pagination on the stories tray (G1c)
  - lean tray projection on GET /posts/feed/stories (G1b)
  - undo/redo history survives a hard crash (E4 inc.2)
  - Dynamic Type for MessageListView swipe indicator (136i)
  - remove dead FirebaseNotificationService FCM sender (F51)
  - unit-fetch out-of-tray stories by postId on deep link (R4 inc.2)
  - Dynamic Type for SyncPill (135i)
  - close duplicate-reaction race with atomic upsert
  - forward real postType + ephemeral context on socket reaction notifications
  - hop CXPlayDTMFCallAction to MainActor; tie TURN TTL to CallCleanupService
  - online-first friends list + cross-screen cache reconciliation (#1434)
  - guard mark-unread cursor rewind against a fresher concurrent read
  - friendship & relationship-state SSOT (#1431)
  - remove dead handleIncomingOffer, dedupe call-notice presentation logic
  - exclude source language from story caption translation targets
  - the draft-resume card replaces the bare text alert (U4 increment 2)
  - DraftResumeCard building block (U4 increment 1)
  - Dynamic Type + a11y for AchievementBadgeView (134i)
  - regenerate pbxproj — drop phantom AudioEffectsPanel.swift reference
  - viewedAt timestamp alongside isViewed — soft migration (R11)
  - replay message edits/deletes to offline recipients too
  - VoiceOver custom actions for prev/next story navigation (U6 increment 2)
  - VoiceOver announces slide changes in the reader (U6 increment 1)
  - preload the next slide's media (W5)
  - live story deletion and per-text-object translation merge (W4)
  - legacy story content resolves over the full language chain (R10)
  - fix two self-inflicted test assertions from the previous commit
  - client expiry fallback aligned with the server's 21h (G6)
  - read overlay text from canonical `text`, not legacy `content`
  - CXAnswerCallAction hold + system-PiP frozen-frame placeholder
  - key typing-indicator roster by userId, not display name
  - adaptive video-sender-cap plan (network + thermal) (#1417)
  - haptic ticks on slide change and buffering freeze/resume (U2)
  - live translation + delete on the feed realtime hook (W4)
  - stop leaking CallParticipant.analytics on active-call route
  - enqueue offline recipients on the WS message:send path too
  - foreground media-object keyframes animate too (W1 increment 2)
  - text-object keyframes animate in the web reader (W1 increment 1)
  - auto-advance timer freezes while the primary video buffers (W2)
  - textObjects translate to the audience's real languages (G3)
  - single translation pipeline for story content (G2)
  - identity-aware active-call teardown (#1415)
  - encrypt the stories tray store like every other social store (R9)
  - logout purges the story draft AND the persisted publish queue (E9)
  - actually run the legacy offline-queue migration at boot (E6)
  - the queue cleans up its media copies (E10 disk leak)
  - last-message preview excludes soft-deleted messages
  - screen-capture participant spoofing, pocket-dial, HIG hit targets, stale-peer cleanup
  - sniff the URL extension before routing media to disk stores (R7)
  - story view receipts are durable via the outbox (R6)
  - chip drop moves the conversation onto a section header
  - delta-sync via ?updatedSince on the stories tray (G1)
  - debounce the sending clock glyph for sub-200ms sends (B.4)
  - write-ahead makes the online publish survive process kills (E5)
  - undo/redo history survives the timeline sheet lifecycle (E4)
  - flush the open timeline into the slide before persisting (E3)
  - deep-link container serves the cached tray before forcing network (R4)
  - identity interstitial between story groups (user directive)
  - call-reliability-report — prod health report for the multi-hour calls goal
  - periodic in_progress analytics snapshots survive app kills
  - update two source-guard tests for the TURN-refresh watchdog refactor
  - split press-state detector from long-press trigger
  - discreet buffering indicator during mid-slide stalls (R3)
  - propagate deviceLocale to the last 2 resolveUserLanguage sites
  - freeze timeline while the bg image bitmap is still loading (R2)
  - debounced draft autosave — editing survives hard crashes (E1)
  - retry TURN refresh on dropped ACK, surface busy/failure feedback, finish a11y hints
  - DM dedup reopens the most recently ACTIVE duplicate
  - auto-dismiss call-waiting banner on remote end (#1411)
  - buildEffects no longer wipes timeline-authored fields (E2)
  - pin viewed-story media until expiry (R5 wiring)
  - serialize updateOnNewMessage per conversation to stop a lost-update race
  - direct-DM creation is idempotent — reopen the existing DM
  - pinning exempts keys from DiskCacheStore eviction (R5)
  - amplify row scale animation dampingFraction for visible rebounce
  - freeze timeline while slide audio is still caching (R1)
  - Dynamic Type for MoodReplyConfirmationOverlay (132i)
  - persist end-of-call analytics on CallParticipant
  - Dynamic Type + a11y for MessageDetailSheet hero glyphs (131i)
  - apply URL-only translation guard on all 3 entry points
  - negotiationTimeMs separates WebRTC setup from human ring time
  - add negotiationTimeMs metric for WebRTC connection timing
  - Dynamic Type for ReelFeedCard glyphs (130i)
  - wire dead PiP rotation hook, fix VoiceOver double-read, fix Dynamic Type clipping
  - guard REST message-delete lastMessageAt with optimistic concurrency
  - re-anchor already-answered source-guard on the real subscriber
  - call_answered_elsewhere silent push — multi-device socketless ring dismissal
  - call-waiting banner for a second incoming call (#1403)
  - la liste de conversations scrolle à nouveau — retrait du DragGesture plein-ligne
  - call_cancel silent push ends phantom ringing (client side)
  - fan out sendToUser to device tokens in parallel
  - call_cancel background push kills phantom ringing on socketless devices
  - rate-limit reconnect/ICE-refresh handlers, remove dead signaling hook
  - quality-alert requires sustained degradation and excludes the reporter
  - remove unauthenticated-admin debug notification routes
  - quality-monitor warm-up gate fails closed when start date is nil
  - GC tier 3 spares multi-hour calls with fresh heartbeats
  - Dynamic Type + a11y for CameraView (129i)
  - re-wire MessageDraftMediaStore + 2 test files into pbxproj, purge warnings
  - useSocialSocket retries once the socket bootstraps
  - Dynamic Type for FeedPostCard action-bar glyphs (128i)
  - forward badge as android notificationCount (F1 Android)
  - keep the literal videoToggleTask?.cancel() call CI checks for
  - toggleVideo() can run two concurrent camera/transceiver actuations on rapid double-tap
  - GC force-end never fanned out call:ended to ringing callee's user room
  - typing:start/stop now require active conversation membership
  - WebRTC-plumbing outbound emits (call-webrtc-plumbing-emits) (#1393)
  - Dynamic Type for BubbleDeliveryCheck status glyphs (127i)
  - photothèque du composer — long press vidéo, actions Ajouter/Sélectionner/Éditer, présélection picker, Liquid Glass iOS 26 (#1389)
  - correct two false-positive assertions from prior commit
  - getReels curseur chronologique (lossless) + languageCodeSchema accepte les 639-3
  - CallEffectsOverlay ObservedObject re-subscription bug + a11y/dead-code cleanup
  - resync feed room + typing keepalive across reconnect/long sessions
  - badge unread embarqué dans le push — badge d'icône iOS et widget gelés app fermée (F1)
  - appel jamais décroché = missed (critère answeredAt) + garde FSM reconnecting
  - refactor conversation row long-press gesture with proper priority
  - fallback pendingCount cohérent avec pendingUIItems sur échec de lecture (item H cause D)
  - reclaim visibility-timeout des rows .inflight orphelines (item H)
  - les pièces jointes du brouillon survivent au kill (phase 2 — câblage)
  - store durable des pièces jointes de brouillon de message (phase 1)
  - Dynamic Type + VoiceOver for conversation composer (iter 126i)
  - pure video-survival auto-disable policy (#1387)
  - curseur getReplies aligné asc + codes langue 639-3 acceptés
  - call:ended atteint l'appelé qui sonne (fanout rooms user)
  - réaligne le garde AdjustBitrate sur le merge BWE gated + pbxproj regen
  - auto-save du brouillon au passage en background (D1)
  - auto-retry of failed messages now forwards clientMessageId
  - indicateur qualité fiable + écran d'appel décalé de 30pt
  - action « Enregistrer » dans le menu appui-long (composant unifié)
  - Dynamic Type + VoiceOver for AttachmentLoadingTile (iter 125i)
  - hooks onSaveRequested sur les viewers SDK + câblage du fullscreen média des bulles
  - report « downloaded » best-effort dans le coordinateur unifié (parité P7-9)
  - câbler audio + galerie média sur le composant unifié Enregistrer
  - Dynamic Type + VoiceOver for iPad panel header (iter 124i)
  - implement drag-to-reorder during long-press with smooth transition
  - correct offset windows and setEffect precondition in new tests
  - atomic conditional consume closes brute-force TOCTOU on SMS reset attempt caps
  - remplacement 1-réaction-par-user + gate messages système dans toggleReaction
  - adjust scale animation timing for smoother rebounce
  - sémantique de remplacement 1-réaction-par-user + gate messages système
  - resolve duplicate CallEffectsOverlayAccessibilityTests class
  - restore VideoConfig, actually used by P2PWebRTCClient
  - implement row scale animation reset on menu dismiss
  - thread-safety, dead code, and VoiceOver gaps in calling stack
  - add long-press scale animation to conversation rows
  - connection-quality classification core + live signal indicator (#1381)
  - type decodePayload's corrupt-payload error as MeeshyError
  - gate FRIENDS-visibility posts through buildVisibilityFilter
  - re-join call room on socket reconnect (production component)
  - idempotence du remove de réaction sur le chemin socket
  - DELETE de réaction idempotent (not-found → succès, pas 404)
  - pure telecom-connection policy (ConnectionService state reports) + reporter fold (#1377)
  - totalMembers exclut le sender par identité (pas -1 aveugle)
  - bootRecovery détecte aussi les fichiers média visuels manquants au crash
  - annuler un envoi média offline balaie ses fichiers (fuite disque)
  - pure call-audio policy (ringback/ringtone/cues) + tone controller fold (#1375)
  - le merge edit-into-send offline détruisait les médias en attente
  - dead-letter immédiat des rejets serveur 4xx permanents dans l'outbox
  - watermark conversation-list dérivé de l'horloge locale (R15b)
  - watermark de gap-recovery messages empoisonné par clock-skew (R15a)
  - SyncEngine A5.4 — resync notifications au reconnect (fenêtre aveugle)
  - SyncEngine A5.3 — resync notifications sur gap de séquence
  - SyncEngine A5.2 — hook gapDetected sur SyncSeqTracker
  - SyncEngine A5.1 — décodage \_seq + tracker de gap (bénéfice multi-device)
  - terminal statuses are immutable — leave/disconnect can no longer rewrite missed as completed
  - unify REST/socket CallService instance, harden markCallAsMissed, remove dead beacon fallback
  - report downloaded pour les documents (gap P7-9 P3 comblé)
  - enforce maxUses cap atomically (F47 TOCTOU)
  - BlockActionCoordinator — block/unblock durable pour les sites Views (R6-4 complet)
  - BlockedViewModel.unblock via l'outbox durable (R6-4 incr.2, 1/N sites)
  - primitive block optimiste + fix caveat swipe labels périmés (R6-4 incrément 1/2)
  - atomic increments for calibrateProfile counters (lost-update race)
  - release active-call claim on ringing-timeout missed + self-heal leaked claims
  - verrous + master PIN purgés au logout (P7-11, invariant 9)
  - ConversationLockManager logout hook — purge cross-account leak (P7-11)
  - close cap TOCTOU — reserve slot atomically before creating relation (F47)
  - réconciliation complète périodique — purge des conversations fantômes hard-supprimées (P7-10)
  - release active-call claim on missed-timeout, harden signaling authz, fix waiting-banner reject
  - propagate profile changes to conversation partners (USER_UPDATED)
  - une panne gateway ne consomme plus le budget de retries de l'outbox (P7-7)
  - le composer ne se verrouille plus pendant qu'un message est sur l'horloge ⏳
  - live in-call duration timer (slice call-duration-timer) (#1371)
  - purge du cache HTTP URLCache au logout (T15b-b, invariant 9)
  - C8 — dédup des sockets same-user au join (last join wins)
  - document Dynamic Type freeze doctrine for FeedView chrome (iter 123i)
  - tolerate GRDB Date round-trip noise in markEdited ordering guard
  - decode editedAt onto APIMessage (CI compile failure)
  - guard message:edited against out-of-order stale delivery
  - atomic increments in ConversationMessageStats edit/delete hooks (F48)
  - stop clearing ringing timeout on early-join; fix web duplicate-offer race
  - call:join ne désarme plus le ringing timer — l'answer SDP et les chemins terminaux le possèdent
  - Dynamic Type + VoiceOver for EmojiPickerSheet (iter 122i)
  - Dynamic Type for message context menu (iter 121i)
  - réconciliation call:end aussi sur ACK-échec (chaos-test 2)
  - joinCall transitionne vers RINGING — l'early-join du callee n'est pas un décrochage (item F matérialisé)
  - version-guard call-termination writes, align REST/socket end-call authorization
  - guard read/delivery cursors against out-of-order regression
  - deep-link a full-screen call push into the incoming-call screen
  - un appel sortant non décroché ne bascule plus en écran connecté 00:00 — garde FSM .reconnecting, horloge d'appel, bannières Dynamic Island, avatars duo + fond profil
  - hide decorative conversation backdrop from VoiceOver (iter 120i)
  - grâces disconnect affinées — extension si socket vivant, grâce courte pré-answer (chaos-tests prod)
  - guard stale ICE-restart/call-waiting async continuations
  - close lost-update race on message reaction summary
  - Dynamic Type + VoiceOver for message-bubble media grid (iter 119i)
  - route FCM call pushes to a full-screen incoming-call notification (#1354)
  - reconcile with concurrent session's merged fix, keep only the surviving bug
  - pre-existing CI failures — PiP filter button a11y hint, dead localization keys, stale auto-hide test
  - CallKit informé sur tout teardown .failed, TURN préservé sur End & Answer, bannière call-waiting nettoyée, indicateur signaling dégradé
  - iOS CallKit/TURN/banner triad + gateway endCall idempotency gap
  - un restart/blip ne tue plus un appel établi — ownership disconnect, réhydratation boot, hygiène timers
  - recover socket.io realtime delivery after reconnect_failed
  - réaligner 3 source-guards CallView hérités du merge main
  - exact @mention resolution — anchor Unicode name boundaries
  - pure incoming-call push decision core (#1347)
  - Dynamic Type + VoiceOver for ConversationView message-row affordances (iter 118i)
  - gateway audit follow-through — leftAt persistence, missing summary index, force-leave missed path, ICE rate limit
  - drop stale retranslation results (edit ordering race)
  - survive gateway restart — active P2P call no longer cut by signaling-socket drop
  - remove dead previewRouter + unify conversation preview width (deferred NITs)
  - dedup key must include messageId, not just conversation
  - appels — vidéo distante, join VoIP fiable, chrono CallKit, contrôles cadre
  - Dynamic Type in action menu + inert-modifier cleanup (deferred review)
  - call:missed contract + video layout on remote escalation
  - restore call metric glyphs and move call time bottom-right
  - contraste blanc-sur-verre en Light + a11y overlay (déférés revue)
  - dedicated Calls bottom-nav tab + re-dial gesture (calls-tab-nav) (#1340)
  - dismissContextMenu — purge asyncAfter annulable
  - bannière DM strippée sur la route LIST (schéma minimal)
  - remove dead activeCallSession() call breaking sdk-tests compile
  - close call:heartbeat authz gap to strict active-participant check
  - gate CallKit plateforme — le simulateur pilote l'appel in-app
  - add missing banner arg to APIConversationUser test fixture
  - Dynamic Type + VoiceOver for StoryViewerView canvas (iter 117i)
  - stale-broadcast ordering races + unbounded conversationId cache
  - remontee banniere de profil (DM) + boutons header conversation en glass
  - hide decorative onboarding backdrop from VoiceOver + Dynamic Type CTA (iter 116i)
  - evict VoIP dedup entry on CallKit report failure (busy path)
  - close initiateCall/joinCall TOCTOU races on concurrent starts
  - Dynamic Type doctrine for CallView control bar (iter 115i)
  - update stale transcription-segment tests for active-participant authz
  - Dynamic Type + VoiceOver for StoryExportShareSheet (iter 114i)
  - hide dead voice-effects panel (video filters only)
  - coalesce reconnect triggers, epoch half-open re-arm, TURN refresh at restart, stuck-muted fallback
  - raffinements apercu long-press conversation
  - redesign system call bubble — compact, direction-aware, timestamped
  - Dynamic Type + VoiceOver for OnboardingFlowView chrome (iter 113i)
  - close conversation-membership authz bypass on transcription-segment
  - thread real conversationId into outgoing call route (call-nav-conversation-thread)
  - apercu long-press conversation enrichi (banniere, avatar, actions, dernier message)
  - action Renommer dans le menu contextuel conversation
  - Dynamic Type + VoiceOver for OnboardingStepViews (iter 112i)
  - close membership-check bypass, post call-summary on every terminal path
  - restore reaction notifications on the socket path
  - bind the realtime socket to the auth session (realtime-session-coordinator) (#1321)
  - restore CallMediaConfig.swift — VideoConfig is a real prod dependency
  - scope Opus SDP munging to audio, enforce per-call authz, drop dead code
  - converge formatDuration onto shared formatClock (iter 74)
  - idempotent P2002 handling on message reaction add
  - zoom in/out sur l'overlay long-press conversation
  - Dynamic Type for StatusBubbleOverlay (iter 111i)
  - MessageMoreSheet en grille verre (Liquid Glass iOS 26)
  - Dynamic Type + VoiceOver for ReelsPlayerView (iter 110i)
  - fold CallSignalManager into CallViewModel (VM-fold)
  - restore conversation long-press menu (remove .onDrag conflict)
  - ACK-based call:initiate (emitInitiate + pure parser) (#1311)
  - custom conversation context menu (icons on iOS 26)
  - clear participant heartbeat on mid-call leave
  - preserve supported ISO 639-3 language codes in normalizeLanguageCode
  - add safety-net expiry for stuck remote typing indicators
  - converge local formatDuration onto shared formatClock
  - stop SDP-munging RED into audio offers/answers, use setCodecPreferences
  - typed FRIEND_REQUEST_NEW/ACCEPTED/REJECTED events
  - context-menu icons + story quit alert legibility
  - Dynamic Type + VoiceOver for StoryTrayView (iter 109i)
  - apply late/refreshed TURN credentials to a live peer connection
  - recent/missed-calls list UI (CallHistoryViewModel + screen) (#1304)
  - native-lean long-press menu (reactions + bubble + vertical list)
  - emit friend-request:cancelled so the other party's list syncs live
  - Dynamic Type for StoryViewerView sidebar/header (iter 108i)
  - resistant swipe on audio/video bubbles
  - route quick affordances to native MessageMoreSheet
  - menu longpress - new components + MessageDetailSheet decomposition
  - Dynamic Type + VoiceOver for FeedPostCard media (iter 107i)
  - Dynamic Type + VoiceOver for AudioEffectsPanel (iter 106i)
  - serialize camera switch, close stale peer connection, fix VoIP dedup eviction
  - VoiceOver labels for feed attachment remove buttons (iter 105i)
  - Dynamic Type + VoiceOver for AudioEffectsPanel (iter 105i)
  - Dynamic Type + VoiceOver for VideoFilterControlView (iter 105i)
  - Dynamic Type + VoiceOver for ShareLinksView (iter 104i)
  - VoiceOver labels for AudioFullscreenView icon-only controls (iter 103i)
  - supprime à nouveau le doublon d'import copyToClipboard (régression réintroduite) (#1291)
  - adopte la source unique copyToClipboard dans TwoFactorSettings (F30-f) (#1284)
  - Dynamic Type + VoiceOver for EditPostSheet (iter 100i)
  - Dynamic Type + VoiceOver for ConversationMediaGalleryView (iter 103i)
  - Dynamic Type + VoiceOver + content selection for LicensesView (iter 98i)
  - finish Dynamic Type + VoiceOver for LoginView (iter 102i)
  - resolve committed merge-conflict markers in routine uiux docs
  - Dynamic Type + VoiceOver for TrackingLinksView (iter 101i)
  - adopte la source unique copyToClipboard dans TwoFactorSettings (F30-f)
  - Dynamic Type + VoiceOver for CommunityLinkDetailView (iter 99i) (#1272)
  - supprime le doublon d'import copyToClipboard (régression merge parallèle) (#1266)
  - resolve committed conflict markers from triple 93i collision
  - Dynamic Type + VoiceOver + content copy for SupportView (iter 95i) (#1262)
  - remove duplicate copyToClipboard import introduced by main merge
  - call-history repository (REST + Room cache-first SWR)
  - Dynamic Type + VoiceOver for ConversationListView overlays (iter 94i)
  - remove duplicate copyToClipboard import breaking the build
  - source unique presse-papier pour les pages links — iter 70
  - Dynamic Type + VoiceOver for ForwardPickerSheet (iter 100i)
  - Dynamic Type for MessageOverlayMenu (iter 99i)
  - Dynamic Type + VoiceOver for UserStatsView (iter 98i)
  - copy diagnostics via long-press menu in AboutView (iter 98i)
  - remove duplicate accessibilityElement on AffiliateView stat card (iter 92i)
  - trim background-observer comment to fit CI's fixed-window source test
  - serialize hold/unhold video ops, fix glare-path state leak, GC race guard
  - update quality-report test for participant-gated persistCallStats
  - moderator-kick wrong-participant, quality-report authz gap, ringing-call CallKit gap
  - thread-safe audio effect counters, cache-first filter switch, a11y hint (#1257)
  - Dynamic Type + destructive-red token for EffectsPickerView (iter 87i)
  - source unique formatFileSize — iter 70
  - relocate stragglin docs, drop orphan MARK dividers
  - annule les vérifications de disponibilité obsolètes (AbortController) — iter 70
  - split StoryComposerView into view-builder extensions
  - Dynamic Type + VoiceOver for AddParticipantSheet (iter 97i)
  - pure call-journal model (CallRecord + CallDirection/CallMediaType) (#1254)
  - clôture F30 — unification presse-papiers via source unique (iter 70)
  - Dynamic Type + VoiceOver for NotificationSettingsView (iter 96i)
  - source unique de validation d'ObjectId MongoDB — iter 69 (#1251)
  - split StoryCanvasUIView into method extensions
  - split StoryComposerViewModel into method extensions
  - extract free top-level types into dedicated files
  - widen access private→internal on the 3 refactor targets
  - content selection + VoiceOver for TwoFactorSetupView (iter 95i)
  - converge conversation-share clipboard fallback on copyToClipboard (F30-d, iter 68)
  - Dynamic Type + VoiceOver for SharePickerView (iter 94i)
  - Dynamic Type + VoiceOver for AffiliateView (iter 94i)
  - Dynamic Type + VoiceOver for MemberManagementSection (iter 94i)
  - Dynamic Type for SharePickerView (iter 94i)
  - Dynamic Type for LocationPickerView (iter 93i)
  - Dynamic Type + VoiceOver for LocationPickerView (iter 93i)
  - converge partage conversation (fallback presse-papier) vers copyToClipboard (F30-d, iter 68)
  - Dynamic Type + VoiceOver for ConversationPreferencesTab (iter 93i)
  - CallSignalManager — inbound call:\* → SharedFlow<CallEvent> + outbound emit table (#1230)
  - render comment audio/media in feed preview + fix notification badge truncation
  - Dynamic Type + VoiceOver for AffiliateView (iter 92i)
  - Dynamic Type + VoiceOver for NewConversationView (iter 91i)
  - Dynamic Type + VoiceOver for CommunityLinksView (iter 91i)
  - Dynamic Type + VoiceOver AffiliateView (iter 91i)
  - Dynamic Type + VoiceOver for AffiliateView (iter 91i)
  - converge partage conversation vers copyToClipboard (F30-d)
  - Dynamic Type + VoiceOver for DataExportView (iter 91i)
  - stop audio-toggle self-echo, rate-limit transcription relay, reset PiP fps
  - Dynamic Type + VoiceOver DataExportView (iter 90i)
  - Dynamic Type for NewConversationView (iter 90i)
  - converge copie identifiant groupe vers copyToClipboard (F30-c)
  - Dynamic Type + VoiceOver for MagicLinkView (iter 90i)
  - converge partage feed/reel vers copyToClipboard (F30-b)
  - Dynamic Type + VoiceOver + palette for EffectsPickerView (iter 89i)
  - converge copie contenu/lien vers la source unique copyToClipboard (F30-a) (#1216)
  - Dynamic Type + i18n/render fixes for DeleteAccountView (iter 88i)
  - Dynamic Type + VoiceOver for DeleteAccountView (iter 88i)
  - Dynamic Type + VoiceOver for voice profile wizard (iter 87i)
  - remove duplicate getUserInitials import in u/[id] page
  - route legacy slide.mediaURL background via directURLIfAny (WS5.4a)
  - retire le code mort du filtre temps-reel Story
  - restaure isExpired reverté par le même merge parallèle — iter 64 (#1210)
  - retire le dead StoryFilteredLayer, extrait StoryFilterKind
  - notify peer on local SDP failure, drop dead emitCallEnd overload
  - Dynamic Type + VoiceOver for storage & auto-download settings (iter 83i)
  - retire les références orphelines ReplyThread du pbxproj
  - story par défaut en Contacts + filtres par média
  - restaure formatCompactNumber reverté par un merge parallèle — iter 63 (#1208)
  - inbound call:\* signalling event models + pure CallEvent mapper (#1207)
  - Dynamic Type + VoiceOver headers for AboutView (iter 86i)
  - restaure formatCompactNumber reverté par un merge parallèle — iter 63
  - source unique de la troncature de texte (truncate) — iter 62 (#1203)
  - VoiceOver selection semantics for the language picker (iter 85i)
  - Dynamic Type + VoiceOver for StarredMessagesView (iter 85i)
  - source unique du formatage de durée média (formatClock) — iter 62
  - corrections du review présence (conformité + decay)
  - source unique du compteur compact (formatCompactNumber) — iter 61 (#1201)
  - Dynamic Type + VoiceOver for EditProfileView (iter 84i)
  - source unique du prédicat d'expiration (isExpired) — iter 60 (#1199)
  - présence datée + colorée après le pseudo (fiche profil, Lot 6 iOS)
  - keep PR1157/PR1148 catalog-backed localization (fix dead keys)
  - Dynamic Type + i18n parity for legal screens (iter 83i)
  - unify sheet grabber affordance (iter 79i)
  - source unique du « temps restant avant expiration » — iter 59 (#1187)
  - Dynamic Type parity for call-screen inline glyphs (iter 79ib)
  - Dynamic Type for the feed attachment composer (iter 79i)
  - source unique du temps restant avant expiration — iter 59
  - restore contacts avatar initials to getUserInitials (iter 59, anti-régression F26c-c(b))
  - Dynamic Type for the fullscreen audio player (iter 82i)
  - complete ConversationSettingsView localization (iter 78i)
  - Dynamic Type for the active sessions screen (iter 82i)
  - source unique de la classification du temps relatif — iter 58 (#1177)
  - relay real toggle-media errors + unify CallService instance (RC-4)
  - RelativeTimeFormatter.lastSeenString (Lot 6 iOS)
  - localize ConversationLockSheet + VoiceOver/Dynamic Type (iter 81i)
  - source unique des initiales — profil public → getUserInitials (iter 58, F26c-c(c))
  - source unique des initiales — page profil app/u/[id] → getUserInitials (iter 58)
  - stop duplicate Socket.IO listener registration on reconnect-adjacent calls (iter 57)
  - source unique des initiales — famille contacts → getUserInitials — iter 57 (#1181)
  - import Combine in OfflineQueueTests (CI restore)
  - add missing import Combine to OfflineQueueTests (unblock sdk-tests CI)
  - CountryPicker VoiceOver labels + sheet grabber (iter 80i)
  - Dynamic Type for the feed post composer (iter 78i)
  - initiales admin/users → getUserInitials + fix(gateway/test) createUnifiedAuthMiddleware mock — iter 56 (#1170)
  - consolidate destructive/error/expired reds to MeeshyColors.error (iter 78i)
  - complete story-viewer localization catalog (iter 79i)
  - :feature:calls CallViewModel + minimal call screen (Calls slice) (#1169)
  - localize MessageOverlayMenu message menu (iter 78ib)
  - localize Router route/scene titles + deep-link error (iter 79i)
  - source unique des initiales — MemberSelectionStep → getUserInitials — iter 55 (#1167)
  - :feature:calls CallViewModel + minimal call screen (Calls slice)
  - Dynamic Type for the link preview card (iter 78i)
  - source unique des initiales — MemberSelectionStep → getUserInitials (iter 55)
  - tokenize semantic hardcoded colors to MeeshyColors (iter 78i)
  - supprime le module mort utils/user.ts (clôt le cluster getUserDisplayName) — iter 54 (#1163)
  - localize SharePickerView chrome strings (iter 77i) (#1162)
  - Dynamic Type ConversationDashboardView (iter 71i)
  - source unique du nom d'affichage (username-first → canonique) — iter 53 (#1161)
  - source unique du nom d'affichage (déjà displayName-first) — iter 52 (#1159)
  - Dynamic Type for the invite friends sheet (iter 76i)
  - source unique des initiales d'avatar (objet) — iter 51 (#1158)
  - localize message quick-action menu — iter 71i
  - source unique des initiales d'avatar (string) — iter 50 (#1156)
  - harden call signaling against payload spoofing + DoS
  - mark EmojiGridCategoryTests @MainActor (iter 71i)
  - Dynamic Type 2FA security flow (iter 71i)
  - pure call-lifecycle FSM (core:model) (#1153)
  - localize emoji-picker category VoiceOver labels (iter 71i)
  - source unique du nom d'affichage — copies locales (iter 50)
  - source unique du nom d'affichage utilisateur (iter 49) (#1147)
  - Dynamic Type for the voice profile management screen (iter 75i)
  - consolidate hardcoded hex tints to MeeshyColors tokens on Support/Report screens (iter 71i)
  - categorised + searchable sticker picker (#1135)
  - localize 6 hardcoded French VoiceOver labels/hints (iter 71i)
  - source unique de la validation d'email + dernière horloge inline (iter 48) (#1146)
  - Dynamic Type for the conversation dashboard (iter 74i)
  - unifier formatDuration sur le canonique formatClock (iter 47) (#1141)
  - hoist actor-isolated pendingCount() out of XCTAssert autoclosure
  - re-apply await-hoist in PendingStatusQueueTests (merge reverted 87f85d68d)
  - restore iOS work reverted by the PresenceVisibilityService merge (84fedd79)
  - remove orphaned ReplyThreadOverlay.swift (complete #1122 cluster removal)
  - présence colorée + datée sur la fiche profil (Lot 6 web)
  - grace period before treating a transient socket drop as call-leave (P0-7)
  - localize hardcoded French VoiceOver strings (iter 73i)
  - remove ReplyThreadOverlay.swift resurrected by a merge artifact (unblocks CI)
  - Dynamic Type for the feed comments sheet (iter 72i)
  - hoist await out of XCTAssert autoclosure (iter 71i unblock)
  - unifier formatFileSize sur la source canonique partagée (iter 46) (#1136)
  - wire invite-user-modal row aria-label to selection state
  - guard call-waiting pending-clear against newer overwrite (#1133)
  - remove dead ReplyThreadOverlay to unblock iOS compile (iter 71i)
  - Dynamic Type for the 2FA security flow (iter 71i)
  - hoist await out of XCTAssertEqual autoclosure in PendingStatusQueueTests
  - remove ReplyThreadOverlay.swift resurrected by a merge artifact
  - guard call-waiting pending-clear against newer overwrite
  - repair invite-modal result row broken by merge (unblocks CI)
  - two realtime correctness bugs — presence list leak + moderator-delete offline enqueue (iter 144) (#1685)
  - restore DELETE/PUT/PATCH in CORS preflight
  - cap lastMessage.content preview at 300 code points in GET /conversations
  - PATCH /messages/:messageId now broadcasts message:edited and retranslates
  - join rooms before marking socket connected to close message-loss race
  - close TOCTOU race that could resurrect a deleted message with edited content
  - close TOCTOU race that could regress the delivered/read cursor
  - dedup offline delivery queue by messageId+eventType, not messageId alone
  - SyncEngine A3.2 — pagination cursor keyset composite /sync
  - SyncEngine A2.1 — emitWithSeq sur notification:new (event pilote \_seq)
  - SyncEngine A3.1 — endpoint /sync read-only, collection messages
  - SyncEngine A1 — UserEventSeq + SequenceService.nextSeq atomique
  - sliding window des sessions trusted — champ lastActivityAt (P7-3)
  - recordView — catch P2002 différencié + log des pannes réelles (P7-2)
  - AgentAdminRelay ne démarrait jamais — connect() avant subscribe()
  - harden two lost-update/out-of-order races on shared counter & cursor
  - unify 5 bounded-cache copies into a single BoundedTtlCache SSOT
  - bound participant-lookup cache (FIFO 5000 + expired sweep)
  - appels tués à tort — garde socket-zombie + sémantique leftAt (C5, 14 sites)
  - bound resolveConversationId identifier→ObjectId cache (FIFO 2000)
  - endCall() resolves pre-answer hangups as missed, not completed
  - claim activeCallId — matcher aussi les documents sans le champ
  - bound StatusHandler identityCache to stop unbounded typing-path growth
  - unify timeout via withTimeout helper, fix leaked timers
  - memoize participantLookup to cut per-message DB round-trip (B.3)
  - keep attachments on message:edit realtime broadcast
  - resolve Participant.id before handleMessage in agent + non-blocking-translation paths
  - ne plus exposer l'email des co-participants (PII)
  - respecter les prefs présence dans les listes (Lot 5)
  - drop dead-on-read maintenance of cursor.unreadCount (iter 57 / F23c)
  - mock createUnifiedAuthMiddleware in profile-extended tests
  - retry transient push failures + stop deactivating tokens on provider outages
  - scope push notification collapse-id per-conversation (#1140)
  - respecter les prefs privacy dans presence:snapshot (Lot 2, E1)
  - mock createUnifiedAuthMiddleware in profile.test (unblock CI)
  - ne pas divulguer la présence des membres via /links (Lot 2, E2)
  - retire la présence des payloads friend-requests (Lot 4)
  - typage viewer dans /users/search (authContext cast)
  - unifier la résolution d'avatar participant + corriger notSeenBy (iter 47)
  - gate présence dans /users/search (Lot 4)
  - batch resolveForTargets + gate /users/presence (Lot 2)
  - mock createUnifiedAuthMiddleware in profile.test.ts (unblock CI)
  - gate présence sur les lookups email/phone/id dédiés (Lot 3 fin)
  - gate présence sur la fiche profil (Lot 3/6)
  - PresenceVisibilityService (Lot 1/6 présence)
  - unread-count batch must exclude each participant's own messages (iter 46 / F23b)
  - collapse per-message unread counts to a single query (iter 45 / F23) (#1134)
  - calibrate coverageThreshold to CI-bun baseline (~9.5pp below local-node)
  - batch unread counts in one read (F23, iter 45)
  - pin espnet==202412 — 202511 exige numpy>=2.0 et casse le build Docker
  - emoji extraction stripped CJK/Kana/Hangul, leaving CJK text untranslated (#1625)
  - pin pytest back to 8.3.4 — pytest-asyncio 0.25.2 requires pytest<9
  - deduplicate in-flight tasks — gateway retries no longer self-strangle long texts
  - repair stale outer-exception test in translation_processor
  - stop dividing torch threads by async worker count — inference ran 2× slow
  - sequential language fan-out — budgets now cover real inference time
  - proportional inference budget — long texts are translated again
  - boot import failure no longer permanently kills the audio pipeline
  - pin floating ML deps to stop non-deterministic Docker build breaks
  - sync uv.lock project version (unblock Test Python CI)
  - restore numpy<1.24 ESPnet constraint (revert breaking Dependabot #825)
  - import ESM avec extension .js + test-garde des imports relatifs
  - add .js extension to mention-parser import — prod gateway crash-loop
  - helper pur resolvePresenceVisibility (Lot 1/6 présence)

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.7.0

## 1.7.0

### Minor Changes

- Changements automatiques détectés :

  - serialize thermal video downgrade, fix unhold error swallow, TURN/STUN reliability (#1692)
  - stop dependabot proposing Next.js major bumps (#1694)
  - reply-count pills — pure ReplyThreads SSOT (#1684)
  - fix WebRTC task isolation races, dead analytics field, ObservedObject re-subscription (#1665)
  - getUserLanguagePreferences injects deviceLocale — parity with display resolution (iter 143) (#1666)
  - synchronise la présence du profil avec la liste de conversations (#1664)
  - UA detection — specific platform swallowed by generic token (iter 142) (#1662)
  - who-reacted breakdown sheet — pure ReactionBreakdown SSOT (#1663)
  - overnight DND morning tail bound to window start day (iter 141) (#1661)
  - fix hover-prefetch cache key mismatch crashing on new message
  - web rejoin race + signaling leak, gateway zombie-socket scoping + DND bypass (#1660)
  - idempotent attachment:reaction — no re-broadcast on a no-op add/remove (iter 141) (#1659)
  - pure ConversationSections SSOT — pinned/others split, no phantom empty section (#1657)
  - snapToScale honors octave wrap — auto-tune no longer mis-snaps B (iter 139) (#1656)
  - formatFileSize rolls Ko→Mo — no more "1024 Ko" (iter 138) (#1655)
  - clicksByHour in UTC — coherent with clicksByDate (iter 137) (#1654)
  - gateway call-lifecycle fanout hardening + iOS accessibility/HIG fixes (#1653)
  - FIFO drain order — a memory-fallback edit no longer replays before its Redis-backed new (iter 136) (#1652)
  - discard-draft affordance (§B draft lifecycle) (#1651)
  - locationCount never incremented on the live path — count by messageType like recompute (iter 135) (#1650)
  - dropped ICE restart never recovered when a renegotiation was already in flight (web) (#1649)
  - idempotent reaction:add — no re-broadcast/re-notify on a no-op re-react (iter 134) (#1648)
  - iconified empty-state card (iOS parity §B) (#1647)
  - aggregate packet loss across all inbound streams (iter 133) (#1646)
  - orphan-recovery gaps, duration anchor drift, dead push, quality-monitor loop, banner re-arm (#1645)
  - email fragments no longer linkified/extracted as mentions — unify SSOT left boundary (iter 132) (#1644)
  - pure empty-state decision (iOS parity §B) (#1643)
  - quality-first dedup — a newer basic no longer downgrades a premium (iter 129) (#1640)
  - "End &amp; Answer" never answered the waiting call + third caller silently dropped (#1639)
  - draft-aware ordering + draft row preview (iOS parity §B) (#1638)
  - message-list route ignored frozen receipts, under-counting delivered/read vs read-status endpoints (#1637)
  - bouton 'voir la conversation' sur l'ecran d'appel (minimise + ouvre le DM)
  - minimiser l'appel en pilule flottante (voir la conversation pendant l'appel)
  - call:end recovery bypassed the wide fanout + web never sent call:heartbeat (#1636)
  - clamp truncateFilename output for maxLength &lt; 4 (iter 128) (#1635)
  - faire aboutir l'appel SORTANT Android (peerId du joiner)
  - fermer automatiquement l'ecran d'appel termine
  - persist reply reference with draft (iOS DraftStore parity) (#1633)
  - scope anonymous membership check to the target conversation (#1634)
  - missed-call notification skipped on force-end cleanup + dead field names in adaptive degradation (#1631)
  - per-conversation text draft auto-save/restore (iOS parity) (#1630)
  - batch read-statuses ignored frozen receipts, under-counting vs single-message endpoint (#1629)
  - faire aboutir l'appel entrant WebRTC (join-with-ACK + to-field)
  - demander la permission micro/camera au runtime avant le media
  - disconnect-grace missed calls never notified + stale perfect-negotiation state on rejoin (#1627)
  - extract preprocessContent to a pure module so its test guards production (iter 126) (#1628)
  - anonymous socket joins ROOMS.user room so unread badge updates live (#1626)
  - importer le media WebRTC P1-P4 (moteur + coordinateur + video)
  - faire sonner l'appel entrant au niveau app (offer socket foreground)
  - filter STT alternatives by region, drop tautology + var shadowing (#1620)
  - EMOJI_PATTERN range swallowed CJK/Kana/Hangul (#1622)
  - split delete into "for everyone" vs "for me" (iOS parity) (#1624)
  - sync reels cache on post edit/delete (socket + optimistic) (#1615)
  - extract normalizeMarkdown to a pure module so its test guards production (#1621)
  - version-bump gap in initiateCall cleanup + web quality-report never emitted (#1606)
  - release dedup key on failure so retries aren't swallowed (#1608)
  - unify sanitizer dangerous-key guard, close sanitizeMongoQuery prototype-pollution gap (#1605)
  - key message-translation cache by preferred language (iter 124) (#1613)
  - NLLB language-map coverage, uppercase URL scheme, group senderName SSOT (#1602)
  - is_list_item bullet class was an unintended char range (#1593)
  - deliver notification:new to the right room + close anon typing/reaction cross-conversation gap (#1588)
  - stop duplicate message:new re-broadcast on sequential retry + linkify mixed-case mentions (#1592)
  - render a live sub-minute countdown as 1m, not 0m (#1590)
  - call banner swipe-to-collapse bubble (#1618)
  - header typing-avatar chips (stacked + overflow) (#1616)
  - evict sockets from call room on GC force-end (#1601)
  - remove duplicate/false typing:stop on multi-device disconnect (#1617)
  - correct destructured prop name in DraggableParticipantOverlay (#1597)
  - callee accepting an audio-only call no longer activates camera/transmits video (#1614)
  - callee accepting an audio-only call no longer activates camera/transmits video
  - enforce the 2-hour message-edit window (#1612)
  - resolve mixed-case @mentions via OR+equals, not case-broken `in` (#1611)
  - header-level typing indicator + group member subtitle (#1607)
  - declarer les permissions media appels (RECORD_AUDIO/CAMERA)
  - nom de conv/appel direct = autre participant, pas soi
  - Reels P6 — boutons flottants alignes iOS (+ Contacts au radial)
  - recharger sur erreur de chunk perime attrapee par ErrorBoundary
  - Reels P5 — reels dans le Feed (carte + lancement gate)
  - Reels P4 — route nav + lancement Feed + item radial
  - Reels P3 — module :feature:reels + ViewModel + ecran vertical
  - Reels P2 — Media3 + atome ReelVideoSurface
  - Reels P1 — API getReels + repo + plan de portage
  - habillage Profile (MeeshyBackground gradient + tokens)
  - retirer la deconnexion de la vue principale (reste dans Reglages)
  - route notification:new to ROOMS.user, not raw userId (#1604)
  - polish — habillage Contacts (gradient + tokens)
  - polish — habillage Calls (MeeshyBackground gradient)
  - fold typing roster into scroll-to-bottom control (#1603)
  - Option A — retrait bottom nav -> MeeshyMenuFab radial
  - keyed typing-participants roster + label SSOT (#1599)
  - P2-S2 Chat increment 1 — fond gradient + app bar transparent
  - P2-S3 Feed habillage glass + formateur date partage
  - P2-S5 Notifications — timestamp ISO -> label localise
  - hydrater currentUser au boot (me() renvoie {user}, pas MeeshyUser)
  - P2-S4 Reglages — icones colorees de section + tokens
  - P2-S4 habillage Reglages (MeeshyBackground + chrome transparent)
  - enforce read⇒delivered in markMessagesAsRead
  - P2-S1 barre de recherche glass en bas (parite iOS)
  - P2-S1 retirer les chips filtres Material (parite iOS)
  - mapper userPreferences (debloque pin/mute/archive/customName)
  - P2-S1 sections repliables liste conv (CollapsibleSection)
  - P2-S1 resoudre le nom des conversations directes
  - P2-S1 habillage liste conv (MeeshyBackground+glass+grand titre)
  - GC missed-call notifications, force-leave timer cleanup, web offer/TURN-refresh gaps (#1594)
  - swipe-to-reply gesture with rubber-band commit core (#1595)
  - scroll-to-bottom control with unread badge + preview (#1591)
  - all-or-nothing group delivery semantics for own-message checks (#1587)
  - tap a quoted-reply preview to scroll to the original (#1584)
  - P1-8 MeeshyToast (feedback pill + notification card)
  - P1-7 MeeshyMenuFab (menu radial iOS = stack vertical staggere)
  - P1-7 FloatingGradientFab (FAB gradient corail/indigo)
  - P1-6 CollapsibleSection (sections repliables liste conv)
  - P1-5 MeeshyAvatar v2 (ring/presence/mood + fill gradient)
  - apiCall degrade sur reponse malformee au lieu de crasher
  - degrade SerializationException to a PARSE failure instead of crashing
  - affiliate relations no longer leak presence to non-friends
  - call:join never acked failures (gateway+web) + 2 P2034 gaps in CallService
  - use RFC 7232 §3.2 weak comparison for If-None-Match
  - gate cached translation path with conversation-membership check
  - chat @-mention autocomplete + roster display-name resolution
  - repair phantom-ringing fanout gap + call teardown edge cases
  - dedup on the resolved message id, not the constant "latest"
  - in-conversation message search + search-highlight wiring
  - restore F84 load-more offset fix reverted by a stale merge
  - P0-4 primitives chrome glass + habillage pilote Notifications
  - P0-3 typographie rounded Nunito (substitut SF Pro Rounded)
  - P0-2 ColorScheme Material complet indigo (zero surface grise)
  - improve iOS quality, accessibility and fix CI flakiness
  - restore web P0 initiator UI + check-active replay + transient-error whitelist silently dropped by 8ebd497b, absorb PR #1558's boot-floor/race fixes
  - converge getParticipantDisplayName to canonical name resolver
  - P0-1 verrouiller les design tokens sur la parite iOS
  - count text messages by messageType in incremental path to match recompute (F85)
  - rich-text rendering (markdown/mentions/m+/URL/highlight) (#1571)
  - bound participantId cache + reset typing throttle on stop
  - \_segment_text no longer drops a short sentence before a huge one (F85)
  - restore ~450 lines of call-safety fixes silently reverted by 8ebd497b
  - honest all-or-nothing delivery indicator (DeliveryStatusResolver) (#1568)
  - serialize per-user \_seq emission to guarantee ordering
  - message-effects lifecycle (ephemeral/blurred/view-once) (#1562)
  - authoritative groupBy recompute for post/comment reactionSummary (F84c)
  - improve iOS app quality, accessibility, and reliability
  - remove 7 dead Localizable.xcstrings keys surfaced by the merge
  - clear typing throttle on typing:stop so the next start re-emits
  - hasMentions no longer flags email addresses as mentions
  - harden message reaction summary (tx + authoritative count + P2002 idempotency)
  - use canonical display-name SSOT in V2 conversation-list transform (F84)
  - load-more advances offset instead of refetching page 1 forever (F84)
  - boot-floor gap in phantom-cleanup + web initiator race/dead-timeout regressions
  - first/last-name fields in the profile editor (§K) (#1556)
  - stop scroll ticks re-rendering the whole list body
  - cap list previews at 300 graphemes, add ScrollOffsetRelay, make mood-badge pulse idempotent
  - comprehensive UX/UI quality and accessibility improvements
  - forward message language to conversation stats so languageDistribution stops freezing (F84)
  - regional (content) language preference (§L) (#1530)
  - apply query filters to status-breakdown groupBy in getAffiliateStats (F83)
  - offline-queued notification-preference backend sync (§L) (#1526)
  - fold participant-scoped counts to users so leaderboards stop duplicating/hiding users (F82)
  - stop stripping ZWNJ/ZWJ — preserve emoji, Persian & Indic text (F82)
  - web initiator never entered its own call + gateway phantom-cleanup killed live cross-conversation calls
  - per-event notification type toggles (§L)
  - DND quiet-hours schedule editor (§L) (#1517)
  - remove dead NOTIFICATION socket event + fix broken Prisma import (F77)
  - honor failureWindowMs so isolated failures no longer trip the breaker (F77)
  - validate E.164 by digit count, not prefixed string length (F80)
  - guard CallsViewModel.loadCalls() against stale-filter races
  - durable notification master toggles (§L) (#1512)
  - honor bidirectional blocking on typing indicators
  - persisted interface language (settings-interface-language) (#1508)
  - close concurrent-call and cross-call correctness gaps in WebRTC/CallKit stack
  - auto-detect Spanish UI language — es was missing from detectBestInterfaceLanguage (F79)
  - clear stale typing indicators on ConversationSocketHandler teardown
  - persisted light/dark/system theme (settings-theme-mode) (#1504)
  - isUrlOnly no longer absorbs CJK/Thai text glued to a URL (F76)
  - web never replayed a missed ringing call on reconnect + rate-limit call:check-active
  - getEmailValidationError agrees with isValidEmail (F73)
  - remove dead voice-effects audio pipeline
  - phantom-ringing callees now get the call_cancel push from GC tier 1 too
  - optimistic + offline profile edit incl. content languages (§K) (#1500)
  - reactionSummary self-heals from authoritative Reaction rows
  - durable Room cache for the profile stats/timeline dashboard (§K) (#1496)
  - capitalize hyphenated/apostrophe names + strip CR from displayName (F72)
  - stop toasting transient call:error codes iOS already treats as non-fatal
  - clear qualityDegradedStreaks on GC-forced call end too
  - community pin/mute/archive/hide no longer stale across devices (F71)
  - relay real error code on call:toggle-audio/video failure
  - renegotiate video SDP direction on CallKit hold/unhold
  - chip release during active edge auto-scroll no longer drops
  - getInitials emits broken half-surrogate for emoji names (F68)
  - profile 30-day activity timeline sparkline (§K)
  - make calendarDayDiff DST-immune (F67)
  - guard setAudioEffect against a dead capture-hook collision risk
  - real-time presence broadcast bypassed blocking check
  - stats projection SSOT + read-only dashboard section (#1489)
  - reapply AVAudioSession mode on A/V switch, track cumulative reconnect count
  - terminal-write protocol for orphaned sessions, rate-limit backgrounded/foregrounded, sweep quality-streak leak
  - stop truncateFilename overflow + formatCompactNumber "1000.0K" boundary (F65/F66)
  - unconditional VoIP registration, dark-chrome text contrast, defensive audio unwraps (#1484)
  - extract shared CallTypeBadgeView, drop unreachable a11y label (#1476)
  - treat Mongo P2034 write-conflict as retryable on endCall/leaveCall too (#1480)
  - stop orphaning offline messages after a Redis blip, bound participantId cache
  - secondary identity rows — languages · country · timezone
  - dual-emit message:read-status-updated alongside legacy event
  - profile-header enrichment — presence · completion ring · E2EE · member-since (#1482)
  - support hyphenated usernames end-to-end via MENTION_HANDLE_CHARS SSOT (F60)
  - derive worker drain lanes from a kind→lane SSOT (#1478)
  - make post/comment reaction removal idempotent
  - header title follows displayName like the list row
  - normalize language-code case at all write/read boundaries (F63/F64)
  - close duplicate-reaction race in AttachmentReactionService
  - three-state presence dot on friend rows (#1474)
  - text tool — centered editing, 6 new fonts, visible weights, diamond/cloud/speech frames
  - ship customName (and unstrip reaction) in the list payload
  - socket conversation:updated no longer clobbers DM display names
  - resolveUserLanguage lowercases in-app prefs — case parity with resolveUserLanguagesOrdered (F62)
  - stop CallView defaulting callManager to CallManager.shared (P1-16)
  - @username fallback uses the module's Unicode boundary, not ASCII (#1464)
  - per-filter chip counts on the Contacts list (#1470)
  - drop the chip on Épingles to pin the conversation
  - bump CallSession.version on all terminal writers
  - comment_reaction honors commentLikeEnabled, no opt-out bypass (F59)
  - durable Room cache for Discover suggestions cold-start paint (#1466)
  - stop stale offline broadcast on anonymous reconnect race
  - comment-reaction carries the real postType, no REEL/STATUS collapse (F58)
  - edge auto-scroll while dragging the chip (Phase 3)
  - auto-scroll aux bords pendant le drag de chip (Phase 3 long-press)
  - STUN-only fallback no longer strands calls without TURN
  - friends Room cache for cold-start paint (#1461)
  - the card sits flush under the expiry line — top vertical alignment (C-DIR5)
  - media load failures speak up (C16, targeted audit 4)
  - empty texts are purged when inline editing ends (C15, targeted audit 3)
  - VoiceOver speaks the UI's language on the chrome (C14, targeted audit 1)
  - gradient backgrounds end-to-end — format, three renderers, palette row (C11)
  - trim redundant comments that overflowed a byte-bounded test window
  - complete fr/en/es/de coverage for all 108 story.\* keys (C12)
  - unbreak pre-existing structural/behavioral CI tests
  - discreet undo/redo — header icons exist only when the trajectory allows (C9 inc.4+5)
  - hasMentions Unicode-aware — detect accented @DisplayName (F57)
  - global undo/redo apply snapshots; media purge becomes lazy (C9 inc.3)
  - close camera-state race, guard doomed CallKit transactions, drop dead code
  - durable offline friend-request send with cmid idempotency (#1458)
  - global undo capture — one debounced trigger, gap-free by construction (C9 inc.2)
  - HistoryStore — pure state stack for global undo (C9 inc.1)
  - carded canvas no longer reserves the hidden header, viewport zoom resets on carding (C-DIR4 bug 4)
  - hung-participant detector in call-reliability-report
  - letterbox takes the slide background colour in full-chrome (C-DIR4 bug 2)
  - letterbox du canvas 9:16 aux couleurs du fond du slide en présentation libre (BUG-2 C-DIR4)
  - background colour applies instantly + draft resume no longer restores an empty composer (C-DIR4 bugs 1&3)
  - stickers get a single source of truth — currentEffects passthrough (C13)
  - self-heal playback when the primary player is stuck .paused (C-DIR3)
  - reword close() comment so it doesn't self-match the new test
  - flush pending DataChannel bye before peer connection teardown
  - unified chrome — header follows the FABs, collapsed-band handle removed (C-DIR2 b/c/d)
  - stickers are reachable again — picker wired into the Text panel (C8)
  - nonisolated data-channel value types — unbreak CallSignalIndicatorTests compile
  - durable offline block/unblock via the outbox (block-outbox-durable)
  - the add-story badge no longer gets clipped (user report)
  - ghost handle to recover hidden chrome (C3)
  - unbreak main build — register CallSignalGlyph.swift in pbxproj, hoist typealias out of ViewBuilder body
  - slide opening effect reachable by gesture from the Fond panel — VM-owned state (C1)
  - the Transitions sheet becomes real — slide opening-effect picker (C7)
  - transient quality pills, color-coded signal glyph, WhatsApp-style banner, instant remote hangup
  - add-slide affordance at the end of the slide strip (C6)
  - gesture exit for viewport zoom — double-tap resets, near-identity pinch snaps to 1.0 (C4)
  - exécution phasée — le run se termine connecté au compte de test
  - timeline FAB/tile/swipe-up open the timeline sheet instead of an empty band panel (C5)
  - sync reels affinity caches on post edit/delete (F55)
  - cache-first Discover suggestions (empty-query) (#1451)
  - single-flight SUB receive + silence watchdog — translation return channel self-heals
  - map Mongo P2034 write conflict on join to the existing conflict-retry path
  - Dynamic Type for MentionSuggestionPanel (139i)
  - background URLs are allow-listed — no more viewer IP-leak (W7)
  - hard-delete no longer orphans media rows forever (G7)
  - single canonical visibility filter (G5)
  - reaction self-echo no longer double-counts likeCount (F56)
  - zoom transition on secondary surfaces (U1 inc.2)
  - zoom transition from tray bubble to viewer on iOS 18+ (U1 inc.1)
  - stop logging DTMF digits and transcript content
  - EXCEPT/ONLY can no longer publish without an audience (W6)
  - Blocked-users tab + BlockCache SSOT binding the resolver seam (#1446)
  - EXCEPT/ONLY audience picker in the story composer (W3 inc.2)
  - COMMUNITY visibility in the story composer + visibilityUserIds plumbing (W3 inc.1)
  - intra-slide crossfades render in the web viewer (W1 inc.4)
  - intra-slide crossfades finally render at playback (R14)
  - Dynamic Type for KeypadTab (138i)
  - local mutations persist through the dirty-flush path (R12 inc.2)
  - silent refresh consumes the G1 delta-sync (R8 inc.1)
  - Discover live user-search with inline connect (#1443)
  - keyset cursor pagination on the stories tray (G1c)
  - lean tray projection on GET /posts/feed/stories (G1b)
  - undo/redo history survives a hard crash (E4 inc.2)
  - Dynamic Type for MessageListView swipe indicator (136i)
  - remove dead FirebaseNotificationService FCM sender (F51)
  - unit-fetch out-of-tray stories by postId on deep link (R4 inc.2)
  - Dynamic Type for SyncPill (135i)
  - close duplicate-reaction race with atomic upsert
  - forward real postType + ephemeral context on socket reaction notifications
  - hop CXPlayDTMFCallAction to MainActor; tie TURN TTL to CallCleanupService
  - online-first friends list + cross-screen cache reconciliation (#1434)
  - guard mark-unread cursor rewind against a fresher concurrent read
  - friendship & relationship-state SSOT (#1431)
  - remove dead handleIncomingOffer, dedupe call-notice presentation logic
  - exclude source language from story caption translation targets
  - the draft-resume card replaces the bare text alert (U4 increment 2)
  - DraftResumeCard building block (U4 increment 1)
  - Dynamic Type + a11y for AchievementBadgeView (134i)
  - regenerate pbxproj — drop phantom AudioEffectsPanel.swift reference
  - viewedAt timestamp alongside isViewed — soft migration (R11)
  - replay message edits/deletes to offline recipients too
  - VoiceOver custom actions for prev/next story navigation (U6 increment 2)
  - VoiceOver announces slide changes in the reader (U6 increment 1)
  - preload the next slide's media (W5)
  - live story deletion and per-text-object translation merge (W4)
  - legacy story content resolves over the full language chain (R10)
  - fix two self-inflicted test assertions from the previous commit
  - client expiry fallback aligned with the server's 21h (G6)
  - read overlay text from canonical `text`, not legacy `content`
  - CXAnswerCallAction hold + system-PiP frozen-frame placeholder
  - key typing-indicator roster by userId, not display name
  - adaptive video-sender-cap plan (network + thermal) (#1417)
  - haptic ticks on slide change and buffering freeze/resume (U2)
  - live translation + delete on the feed realtime hook (W4)
  - stop leaking CallParticipant.analytics on active-call route
  - enqueue offline recipients on the WS message:send path too
  - foreground media-object keyframes animate too (W1 increment 2)
  - text-object keyframes animate in the web reader (W1 increment 1)
  - auto-advance timer freezes while the primary video buffers (W2)
  - textObjects translate to the audience's real languages (G3)
  - single translation pipeline for story content (G2)
  - identity-aware active-call teardown (#1415)
  - encrypt the stories tray store like every other social store (R9)
  - logout purges the story draft AND the persisted publish queue (E9)
  - actually run the legacy offline-queue migration at boot (E6)
  - the queue cleans up its media copies (E10 disk leak)
  - last-message preview excludes soft-deleted messages
  - screen-capture participant spoofing, pocket-dial, HIG hit targets, stale-peer cleanup
  - sniff the URL extension before routing media to disk stores (R7)
  - story view receipts are durable via the outbox (R6)
  - chip drop moves the conversation onto a section header
  - delta-sync via ?updatedSince on the stories tray (G1)
  - debounce the sending clock glyph for sub-200ms sends (B.4)
  - write-ahead makes the online publish survive process kills (E5)
  - undo/redo history survives the timeline sheet lifecycle (E4)
  - flush the open timeline into the slide before persisting (E3)
  - deep-link container serves the cached tray before forcing network (R4)
  - identity interstitial between story groups (user directive)
  - call-reliability-report — prod health report for the multi-hour calls goal
  - periodic in_progress analytics snapshots survive app kills
  - update two source-guard tests for the TURN-refresh watchdog refactor
  - split press-state detector from long-press trigger
  - discreet buffering indicator during mid-slide stalls (R3)
  - propagate deviceLocale to the last 2 resolveUserLanguage sites
  - freeze timeline while the bg image bitmap is still loading (R2)
  - debounced draft autosave — editing survives hard crashes (E1)
  - retry TURN refresh on dropped ACK, surface busy/failure feedback, finish a11y hints
  - DM dedup reopens the most recently ACTIVE duplicate
  - auto-dismiss call-waiting banner on remote end (#1411)
  - buildEffects no longer wipes timeline-authored fields (E2)
  - pin viewed-story media until expiry (R5 wiring)
  - serialize updateOnNewMessage per conversation to stop a lost-update race
  - direct-DM creation is idempotent — reopen the existing DM
  - pinning exempts keys from DiskCacheStore eviction (R5)
  - amplify row scale animation dampingFraction for visible rebounce
  - freeze timeline while slide audio is still caching (R1)
  - Dynamic Type for MoodReplyConfirmationOverlay (132i)
  - persist end-of-call analytics on CallParticipant
  - Dynamic Type + a11y for MessageDetailSheet hero glyphs (131i)
  - apply URL-only translation guard on all 3 entry points
  - negotiationTimeMs separates WebRTC setup from human ring time
  - add negotiationTimeMs metric for WebRTC connection timing
  - Dynamic Type for ReelFeedCard glyphs (130i)
  - wire dead PiP rotation hook, fix VoiceOver double-read, fix Dynamic Type clipping
  - guard REST message-delete lastMessageAt with optimistic concurrency
  - re-anchor already-answered source-guard on the real subscriber
  - call_answered_elsewhere silent push — multi-device socketless ring dismissal
  - call-waiting banner for a second incoming call (#1403)
  - la liste de conversations scrolle à nouveau — retrait du DragGesture plein-ligne
  - call_cancel silent push ends phantom ringing (client side)
  - fan out sendToUser to device tokens in parallel
  - call_cancel background push kills phantom ringing on socketless devices
  - rate-limit reconnect/ICE-refresh handlers, remove dead signaling hook
  - quality-alert requires sustained degradation and excludes the reporter
  - remove unauthenticated-admin debug notification routes
  - quality-monitor warm-up gate fails closed when start date is nil
  - GC tier 3 spares multi-hour calls with fresh heartbeats
  - Dynamic Type + a11y for CameraView (129i)
  - re-wire MessageDraftMediaStore + 2 test files into pbxproj, purge warnings
  - useSocialSocket retries once the socket bootstraps
  - Dynamic Type for FeedPostCard action-bar glyphs (128i)
  - forward badge as android notificationCount (F1 Android)
  - keep the literal videoToggleTask?.cancel() call CI checks for
  - toggleVideo() can run two concurrent camera/transceiver actuations on rapid double-tap
  - GC force-end never fanned out call:ended to ringing callee's user room
  - typing:start/stop now require active conversation membership
  - WebRTC-plumbing outbound emits (call-webrtc-plumbing-emits) (#1393)
  - Dynamic Type for BubbleDeliveryCheck status glyphs (127i)
  - photothèque du composer — long press vidéo, actions Ajouter/Sélectionner/Éditer, présélection picker, Liquid Glass iOS 26 (#1389)
  - correct two false-positive assertions from prior commit
  - getReels curseur chronologique (lossless) + languageCodeSchema accepte les 639-3
  - CallEffectsOverlay ObservedObject re-subscription bug + a11y/dead-code cleanup
  - resync feed room + typing keepalive across reconnect/long sessions
  - badge unread embarqué dans le push — badge d'icône iOS et widget gelés app fermée (F1)
  - appel jamais décroché = missed (critère answeredAt) + garde FSM reconnecting
  - refactor conversation row long-press gesture with proper priority
  - fallback pendingCount cohérent avec pendingUIItems sur échec de lecture (item H cause D)
  - reclaim visibility-timeout des rows .inflight orphelines (item H)
  - les pièces jointes du brouillon survivent au kill (phase 2 — câblage)
  - store durable des pièces jointes de brouillon de message (phase 1)
  - Dynamic Type + VoiceOver for conversation composer (iter 126i)
  - pure video-survival auto-disable policy (#1387)
  - curseur getReplies aligné asc + codes langue 639-3 acceptés
  - call:ended atteint l'appelé qui sonne (fanout rooms user)
  - réaligne le garde AdjustBitrate sur le merge BWE gated + pbxproj regen
  - auto-save du brouillon au passage en background (D1)
  - auto-retry of failed messages now forwards clientMessageId
  - indicateur qualité fiable + écran d'appel décalé de 30pt
  - action « Enregistrer » dans le menu appui-long (composant unifié)
  - Dynamic Type + VoiceOver for AttachmentLoadingTile (iter 125i)
  - hooks onSaveRequested sur les viewers SDK + câblage du fullscreen média des bulles
  - report « downloaded » best-effort dans le coordinateur unifié (parité P7-9)
  - câbler audio + galerie média sur le composant unifié Enregistrer
  - Dynamic Type + VoiceOver for iPad panel header (iter 124i)
  - implement drag-to-reorder during long-press with smooth transition
  - correct offset windows and setEffect precondition in new tests
  - atomic conditional consume closes brute-force TOCTOU on SMS reset attempt caps
  - remplacement 1-réaction-par-user + gate messages système dans toggleReaction
  - adjust scale animation timing for smoother rebounce
  - sémantique de remplacement 1-réaction-par-user + gate messages système
  - resolve duplicate CallEffectsOverlayAccessibilityTests class
  - restore VideoConfig, actually used by P2PWebRTCClient
  - implement row scale animation reset on menu dismiss
  - thread-safety, dead code, and VoiceOver gaps in calling stack
  - add long-press scale animation to conversation rows
  - connection-quality classification core + live signal indicator (#1381)
  - type decodePayload's corrupt-payload error as MeeshyError
  - gate FRIENDS-visibility posts through buildVisibilityFilter
  - re-join call room on socket reconnect (production component)
  - idempotence du remove de réaction sur le chemin socket
  - DELETE de réaction idempotent (not-found → succès, pas 404)
  - pure telecom-connection policy (ConnectionService state reports) + reporter fold (#1377)
  - totalMembers exclut le sender par identité (pas -1 aveugle)
  - bootRecovery détecte aussi les fichiers média visuels manquants au crash
  - annuler un envoi média offline balaie ses fichiers (fuite disque)
  - pure call-audio policy (ringback/ringtone/cues) + tone controller fold (#1375)
  - le merge edit-into-send offline détruisait les médias en attente
  - dead-letter immédiat des rejets serveur 4xx permanents dans l'outbox
  - watermark conversation-list dérivé de l'horloge locale (R15b)
  - watermark de gap-recovery messages empoisonné par clock-skew (R15a)
  - SyncEngine A5.4 — resync notifications au reconnect (fenêtre aveugle)
  - SyncEngine A5.3 — resync notifications sur gap de séquence
  - SyncEngine A5.2 — hook gapDetected sur SyncSeqTracker
  - SyncEngine A5.1 — décodage \_seq + tracker de gap (bénéfice multi-device)
  - terminal statuses are immutable — leave/disconnect can no longer rewrite missed as completed
  - unify REST/socket CallService instance, harden markCallAsMissed, remove dead beacon fallback
  - report downloaded pour les documents (gap P7-9 P3 comblé)
  - enforce maxUses cap atomically (F47 TOCTOU)
  - BlockActionCoordinator — block/unblock durable pour les sites Views (R6-4 complet)
  - BlockedViewModel.unblock via l'outbox durable (R6-4 incr.2, 1/N sites)
  - primitive block optimiste + fix caveat swipe labels périmés (R6-4 incrément 1/2)
  - atomic increments for calibrateProfile counters (lost-update race)
  - release active-call claim on ringing-timeout missed + self-heal leaked claims
  - verrous + master PIN purgés au logout (P7-11, invariant 9)
  - ConversationLockManager logout hook — purge cross-account leak (P7-11)
  - close cap TOCTOU — reserve slot atomically before creating relation (F47)
  - réconciliation complète périodique — purge des conversations fantômes hard-supprimées (P7-10)
  - release active-call claim on missed-timeout, harden signaling authz, fix waiting-banner reject
  - propagate profile changes to conversation partners (USER_UPDATED)
  - une panne gateway ne consomme plus le budget de retries de l'outbox (P7-7)
  - le composer ne se verrouille plus pendant qu'un message est sur l'horloge ⏳
  - live in-call duration timer (slice call-duration-timer) (#1371)
  - purge du cache HTTP URLCache au logout (T15b-b, invariant 9)
  - C8 — dédup des sockets same-user au join (last join wins)
  - document Dynamic Type freeze doctrine for FeedView chrome (iter 123i)
  - tolerate GRDB Date round-trip noise in markEdited ordering guard
  - decode editedAt onto APIMessage (CI compile failure)
  - guard message:edited against out-of-order stale delivery
  - atomic increments in ConversationMessageStats edit/delete hooks (F48)
  - stop clearing ringing timeout on early-join; fix web duplicate-offer race
  - call:join ne désarme plus le ringing timer — l'answer SDP et les chemins terminaux le possèdent
  - Dynamic Type + VoiceOver for EmojiPickerSheet (iter 122i)
  - Dynamic Type for message context menu (iter 121i)
  - réconciliation call:end aussi sur ACK-échec (chaos-test 2)
  - joinCall transitionne vers RINGING — l'early-join du callee n'est pas un décrochage (item F matérialisé)
  - version-guard call-termination writes, align REST/socket end-call authorization
  - guard read/delivery cursors against out-of-order regression
  - deep-link a full-screen call push into the incoming-call screen
  - un appel sortant non décroché ne bascule plus en écran connecté 00:00 — garde FSM .reconnecting, horloge d'appel, bannières Dynamic Island, avatars duo + fond profil
  - hide decorative conversation backdrop from VoiceOver (iter 120i)
  - grâces disconnect affinées — extension si socket vivant, grâce courte pré-answer (chaos-tests prod)
  - guard stale ICE-restart/call-waiting async continuations
  - close lost-update race on message reaction summary
  - Dynamic Type + VoiceOver for message-bubble media grid (iter 119i)
  - route FCM call pushes to a full-screen incoming-call notification (#1354)
  - reconcile with concurrent session's merged fix, keep only the surviving bug
  - pre-existing CI failures — PiP filter button a11y hint, dead localization keys, stale auto-hide test
  - CallKit informé sur tout teardown .failed, TURN préservé sur End & Answer, bannière call-waiting nettoyée, indicateur signaling dégradé
  - iOS CallKit/TURN/banner triad + gateway endCall idempotency gap
  - un restart/blip ne tue plus un appel établi — ownership disconnect, réhydratation boot, hygiène timers
  - recover socket.io realtime delivery after reconnect_failed
  - réaligner 3 source-guards CallView hérités du merge main
  - exact @mention resolution — anchor Unicode name boundaries
  - pure incoming-call push decision core (#1347)
  - Dynamic Type + VoiceOver for ConversationView message-row affordances (iter 118i)
  - gateway audit follow-through — leftAt persistence, missing summary index, force-leave missed path, ICE rate limit
  - drop stale retranslation results (edit ordering race)
  - survive gateway restart — active P2P call no longer cut by signaling-socket drop
  - remove dead previewRouter + unify conversation preview width (deferred NITs)
  - dedup key must include messageId, not just conversation
  - appels — vidéo distante, join VoIP fiable, chrono CallKit, contrôles cadre
  - Dynamic Type in action menu + inert-modifier cleanup (deferred review)
  - call:missed contract + video layout on remote escalation
  - restore call metric glyphs and move call time bottom-right
  - contraste blanc-sur-verre en Light + a11y overlay (déférés revue)
  - dedicated Calls bottom-nav tab + re-dial gesture (calls-tab-nav) (#1340)
  - dismissContextMenu — purge asyncAfter annulable
  - bannière DM strippée sur la route LIST (schéma minimal)
  - remove dead activeCallSession() call breaking sdk-tests compile
  - close call:heartbeat authz gap to strict active-participant check
  - gate CallKit plateforme — le simulateur pilote l'appel in-app
  - add missing banner arg to APIConversationUser test fixture
  - Dynamic Type + VoiceOver for StoryViewerView canvas (iter 117i)
  - stale-broadcast ordering races + unbounded conversationId cache
  - remontee banniere de profil (DM) + boutons header conversation en glass
  - hide decorative onboarding backdrop from VoiceOver + Dynamic Type CTA (iter 116i)
  - evict VoIP dedup entry on CallKit report failure (busy path)
  - close initiateCall/joinCall TOCTOU races on concurrent starts
  - Dynamic Type doctrine for CallView control bar (iter 115i)
  - update stale transcription-segment tests for active-participant authz
  - Dynamic Type + VoiceOver for StoryExportShareSheet (iter 114i)
  - hide dead voice-effects panel (video filters only)
  - coalesce reconnect triggers, epoch half-open re-arm, TURN refresh at restart, stuck-muted fallback
  - raffinements apercu long-press conversation
  - redesign system call bubble — compact, direction-aware, timestamped
  - Dynamic Type + VoiceOver for OnboardingFlowView chrome (iter 113i)
  - close conversation-membership authz bypass on transcription-segment
  - thread real conversationId into outgoing call route (call-nav-conversation-thread)
  - apercu long-press conversation enrichi (banniere, avatar, actions, dernier message)
  - action Renommer dans le menu contextuel conversation
  - Dynamic Type + VoiceOver for OnboardingStepViews (iter 112i)
  - close membership-check bypass, post call-summary on every terminal path
  - restore reaction notifications on the socket path
  - bind the realtime socket to the auth session (realtime-session-coordinator) (#1321)
  - restore CallMediaConfig.swift — VideoConfig is a real prod dependency
  - scope Opus SDP munging to audio, enforce per-call authz, drop dead code
  - converge formatDuration onto shared formatClock (iter 74)
  - idempotent P2002 handling on message reaction add
  - zoom in/out sur l'overlay long-press conversation
  - Dynamic Type for StatusBubbleOverlay (iter 111i)
  - MessageMoreSheet en grille verre (Liquid Glass iOS 26)
  - Dynamic Type + VoiceOver for ReelsPlayerView (iter 110i)
  - fold CallSignalManager into CallViewModel (VM-fold)
  - restore conversation long-press menu (remove .onDrag conflict)
  - ACK-based call:initiate (emitInitiate + pure parser) (#1311)
  - custom conversation context menu (icons on iOS 26)
  - clear participant heartbeat on mid-call leave
  - preserve supported ISO 639-3 language codes in normalizeLanguageCode
  - add safety-net expiry for stuck remote typing indicators
  - converge local formatDuration onto shared formatClock
  - stop SDP-munging RED into audio offers/answers, use setCodecPreferences
  - typed FRIEND_REQUEST_NEW/ACCEPTED/REJECTED events
  - context-menu icons + story quit alert legibility
  - Dynamic Type + VoiceOver for StoryTrayView (iter 109i)
  - apply late/refreshed TURN credentials to a live peer connection
  - recent/missed-calls list UI (CallHistoryViewModel + screen) (#1304)
  - native-lean long-press menu (reactions + bubble + vertical list)
  - emit friend-request:cancelled so the other party's list syncs live
  - Dynamic Type for StoryViewerView sidebar/header (iter 108i)
  - resistant swipe on audio/video bubbles
  - route quick affordances to native MessageMoreSheet
  - menu longpress - new components + MessageDetailSheet decomposition
  - Dynamic Type + VoiceOver for FeedPostCard media (iter 107i)
  - Dynamic Type + VoiceOver for AudioEffectsPanel (iter 106i)
  - serialize camera switch, close stale peer connection, fix VoIP dedup eviction
  - VoiceOver labels for feed attachment remove buttons (iter 105i)
  - Dynamic Type + VoiceOver for AudioEffectsPanel (iter 105i)
  - Dynamic Type + VoiceOver for VideoFilterControlView (iter 105i)
  - Dynamic Type + VoiceOver for ShareLinksView (iter 104i)
  - VoiceOver labels for AudioFullscreenView icon-only controls (iter 103i)
  - supprime à nouveau le doublon d'import copyToClipboard (régression réintroduite) (#1291)
  - adopte la source unique copyToClipboard dans TwoFactorSettings (F30-f) (#1284)
  - Dynamic Type + VoiceOver for EditPostSheet (iter 100i)
  - Dynamic Type + VoiceOver for ConversationMediaGalleryView (iter 103i)
  - Dynamic Type + VoiceOver + content selection for LicensesView (iter 98i)
  - finish Dynamic Type + VoiceOver for LoginView (iter 102i)
  - resolve committed merge-conflict markers in routine uiux docs
  - Dynamic Type + VoiceOver for TrackingLinksView (iter 101i)
  - adopte la source unique copyToClipboard dans TwoFactorSettings (F30-f)
  - Dynamic Type + VoiceOver for CommunityLinkDetailView (iter 99i) (#1272)
  - supprime le doublon d'import copyToClipboard (régression merge parallèle) (#1266)
  - resolve committed conflict markers from triple 93i collision
  - Dynamic Type + VoiceOver + content copy for SupportView (iter 95i) (#1262)
  - remove duplicate copyToClipboard import introduced by main merge
  - call-history repository (REST + Room cache-first SWR)
  - Dynamic Type + VoiceOver for ConversationListView overlays (iter 94i)
  - remove duplicate copyToClipboard import breaking the build
  - source unique presse-papier pour les pages links — iter 70
  - Dynamic Type + VoiceOver for ForwardPickerSheet (iter 100i)
  - Dynamic Type for MessageOverlayMenu (iter 99i)
  - Dynamic Type + VoiceOver for UserStatsView (iter 98i)
  - copy diagnostics via long-press menu in AboutView (iter 98i)
  - remove duplicate accessibilityElement on AffiliateView stat card (iter 92i)
  - trim background-observer comment to fit CI's fixed-window source test
  - serialize hold/unhold video ops, fix glare-path state leak, GC race guard
  - update quality-report test for participant-gated persistCallStats
  - moderator-kick wrong-participant, quality-report authz gap, ringing-call CallKit gap
  - thread-safe audio effect counters, cache-first filter switch, a11y hint (#1257)
  - Dynamic Type + destructive-red token for EffectsPickerView (iter 87i)
  - source unique formatFileSize — iter 70
  - relocate stragglin docs, drop orphan MARK dividers
  - annule les vérifications de disponibilité obsolètes (AbortController) — iter 70
  - split StoryComposerView into view-builder extensions
  - Dynamic Type + VoiceOver for AddParticipantSheet (iter 97i)
  - pure call-journal model (CallRecord + CallDirection/CallMediaType) (#1254)
  - clôture F30 — unification presse-papiers via source unique (iter 70)
  - Dynamic Type + VoiceOver for NotificationSettingsView (iter 96i)
  - source unique de validation d'ObjectId MongoDB — iter 69 (#1251)
  - split StoryCanvasUIView into method extensions
  - split StoryComposerViewModel into method extensions
  - extract free top-level types into dedicated files
  - widen access private→internal on the 3 refactor targets
  - content selection + VoiceOver for TwoFactorSetupView (iter 95i)
  - converge conversation-share clipboard fallback on copyToClipboard (F30-d, iter 68)
  - Dynamic Type + VoiceOver for SharePickerView (iter 94i)
  - Dynamic Type + VoiceOver for AffiliateView (iter 94i)
  - Dynamic Type + VoiceOver for MemberManagementSection (iter 94i)
  - Dynamic Type for SharePickerView (iter 94i)
  - Dynamic Type for LocationPickerView (iter 93i)
  - Dynamic Type + VoiceOver for LocationPickerView (iter 93i)
  - converge partage conversation (fallback presse-papier) vers copyToClipboard (F30-d, iter 68)
  - Dynamic Type + VoiceOver for ConversationPreferencesTab (iter 93i)
  - CallSignalManager — inbound call:\* → SharedFlow<CallEvent> + outbound emit table (#1230)
  - render comment audio/media in feed preview + fix notification badge truncation
  - Dynamic Type + VoiceOver for AffiliateView (iter 92i)
  - Dynamic Type + VoiceOver for NewConversationView (iter 91i)
  - Dynamic Type + VoiceOver for CommunityLinksView (iter 91i)
  - Dynamic Type + VoiceOver AffiliateView (iter 91i)
  - Dynamic Type + VoiceOver for AffiliateView (iter 91i)
  - converge partage conversation vers copyToClipboard (F30-d)
  - Dynamic Type + VoiceOver for DataExportView (iter 91i)
  - stop audio-toggle self-echo, rate-limit transcription relay, reset PiP fps
  - Dynamic Type + VoiceOver DataExportView (iter 90i)
  - Dynamic Type for NewConversationView (iter 90i)
  - converge copie identifiant groupe vers copyToClipboard (F30-c)
  - Dynamic Type + VoiceOver for MagicLinkView (iter 90i)
  - converge partage feed/reel vers copyToClipboard (F30-b)
  - Dynamic Type + VoiceOver + palette for EffectsPickerView (iter 89i)
  - converge copie contenu/lien vers la source unique copyToClipboard (F30-a) (#1216)
  - Dynamic Type + i18n/render fixes for DeleteAccountView (iter 88i)
  - Dynamic Type + VoiceOver for DeleteAccountView (iter 88i)
  - Dynamic Type + VoiceOver for voice profile wizard (iter 87i)
  - remove duplicate getUserInitials import in u/[id] page
  - route legacy slide.mediaURL background via directURLIfAny (WS5.4a)
  - retire le code mort du filtre temps-reel Story
  - restaure isExpired reverté par le même merge parallèle — iter 64 (#1210)
  - retire le dead StoryFilteredLayer, extrait StoryFilterKind
  - notify peer on local SDP failure, drop dead emitCallEnd overload
  - Dynamic Type + VoiceOver for storage & auto-download settings (iter 83i)
  - retire les références orphelines ReplyThread du pbxproj
  - story par défaut en Contacts + filtres par média
  - restaure formatCompactNumber reverté par un merge parallèle — iter 63 (#1208)
  - inbound call:\* signalling event models + pure CallEvent mapper (#1207)
  - Dynamic Type + VoiceOver headers for AboutView (iter 86i)
  - restaure formatCompactNumber reverté par un merge parallèle — iter 63
  - source unique de la troncature de texte (truncate) — iter 62 (#1203)
  - VoiceOver selection semantics for the language picker (iter 85i)
  - Dynamic Type + VoiceOver for StarredMessagesView (iter 85i)
  - source unique du formatage de durée média (formatClock) — iter 62
  - corrections du review présence (conformité + decay)
  - source unique du compteur compact (formatCompactNumber) — iter 61 (#1201)
  - Dynamic Type + VoiceOver for EditProfileView (iter 84i)
  - source unique du prédicat d'expiration (isExpired) — iter 60 (#1199)
  - présence datée + colorée après le pseudo (fiche profil, Lot 6 iOS)
  - keep PR1157/PR1148 catalog-backed localization (fix dead keys)
  - Dynamic Type + i18n parity for legal screens (iter 83i)
  - unify sheet grabber affordance (iter 79i)
  - source unique du « temps restant avant expiration » — iter 59 (#1187)
  - Dynamic Type parity for call-screen inline glyphs (iter 79ib)
  - Dynamic Type for the feed attachment composer (iter 79i)
  - source unique du temps restant avant expiration — iter 59
  - restore contacts avatar initials to getUserInitials (iter 59, anti-régression F26c-c(b))
  - Dynamic Type for the fullscreen audio player (iter 82i)
  - complete ConversationSettingsView localization (iter 78i)
  - Dynamic Type for the active sessions screen (iter 82i)
  - source unique de la classification du temps relatif — iter 58 (#1177)
  - relay real toggle-media errors + unify CallService instance (RC-4)
  - RelativeTimeFormatter.lastSeenString (Lot 6 iOS)
  - localize ConversationLockSheet + VoiceOver/Dynamic Type (iter 81i)
  - source unique des initiales — profil public → getUserInitials (iter 58, F26c-c(c))
  - source unique des initiales — page profil app/u/[id] → getUserInitials (iter 58)
  - stop duplicate Socket.IO listener registration on reconnect-adjacent calls (iter 57)
  - source unique des initiales — famille contacts → getUserInitials — iter 57 (#1181)
  - import Combine in OfflineQueueTests (CI restore)
  - add missing import Combine to OfflineQueueTests (unblock sdk-tests CI)
  - CountryPicker VoiceOver labels + sheet grabber (iter 80i)
  - Dynamic Type for the feed post composer (iter 78i)
  - initiales admin/users → getUserInitials + fix(gateway/test) createUnifiedAuthMiddleware mock — iter 56 (#1170)
  - consolidate destructive/error/expired reds to MeeshyColors.error (iter 78i)
  - complete story-viewer localization catalog (iter 79i)
  - :feature:calls CallViewModel + minimal call screen (Calls slice) (#1169)
  - localize MessageOverlayMenu message menu (iter 78ib)
  - localize Router route/scene titles + deep-link error (iter 79i)
  - source unique des initiales — MemberSelectionStep → getUserInitials — iter 55 (#1167)
  - :feature:calls CallViewModel + minimal call screen (Calls slice)
  - Dynamic Type for the link preview card (iter 78i)
  - source unique des initiales — MemberSelectionStep → getUserInitials (iter 55)
  - tokenize semantic hardcoded colors to MeeshyColors (iter 78i)
  - supprime le module mort utils/user.ts (clôt le cluster getUserDisplayName) — iter 54 (#1163)
  - localize SharePickerView chrome strings (iter 77i) (#1162)
  - Dynamic Type ConversationDashboardView (iter 71i)
  - source unique du nom d'affichage (username-first → canonique) — iter 53 (#1161)
  - source unique du nom d'affichage (déjà displayName-first) — iter 52 (#1159)
  - Dynamic Type for the invite friends sheet (iter 76i)
  - source unique des initiales d'avatar (objet) — iter 51 (#1158)
  - localize message quick-action menu — iter 71i
  - source unique des initiales d'avatar (string) — iter 50 (#1156)
  - harden call signaling against payload spoofing + DoS
  - mark EmojiGridCategoryTests @MainActor (iter 71i)
  - Dynamic Type 2FA security flow (iter 71i)
  - pure call-lifecycle FSM (core:model) (#1153)
  - localize emoji-picker category VoiceOver labels (iter 71i)
  - source unique du nom d'affichage — copies locales (iter 50)
  - source unique du nom d'affichage utilisateur (iter 49) (#1147)
  - Dynamic Type for the voice profile management screen (iter 75i)
  - consolidate hardcoded hex tints to MeeshyColors tokens on Support/Report screens (iter 71i)
  - categorised + searchable sticker picker (#1135)
  - localize 6 hardcoded French VoiceOver labels/hints (iter 71i)
  - source unique de la validation d'email + dernière horloge inline (iter 48) (#1146)
  - Dynamic Type for the conversation dashboard (iter 74i)
  - unifier formatDuration sur le canonique formatClock (iter 47) (#1141)
  - hoist actor-isolated pendingCount() out of XCTAssert autoclosure
  - re-apply await-hoist in PendingStatusQueueTests (merge reverted 87f85d68d)
  - restore iOS work reverted by the PresenceVisibilityService merge (84fedd79)
  - remove orphaned ReplyThreadOverlay.swift (complete #1122 cluster removal)
  - présence colorée + datée sur la fiche profil (Lot 6 web)
  - grace period before treating a transient socket drop as call-leave (P0-7)
  - localize hardcoded French VoiceOver strings (iter 73i)
  - remove ReplyThreadOverlay.swift resurrected by a merge artifact (unblocks CI)
  - Dynamic Type for the feed comments sheet (iter 72i)
  - hoist await out of XCTAssert autoclosure (iter 71i unblock)
  - unifier formatFileSize sur la source canonique partagée (iter 46) (#1136)
  - wire invite-user-modal row aria-label to selection state
  - guard call-waiting pending-clear against newer overwrite (#1133)
  - remove dead ReplyThreadOverlay to unblock iOS compile (iter 71i)
  - Dynamic Type for the 2FA security flow (iter 71i)
  - hoist await out of XCTAssertEqual autoclosure in PendingStatusQueueTests
  - remove ReplyThreadOverlay.swift resurrected by a merge artifact
  - guard call-waiting pending-clear against newer overwrite
  - repair invite-modal result row broken by merge (unblocks CI)
  - two realtime correctness bugs — presence list leak + moderator-delete offline enqueue (iter 144) (#1685)
  - restore DELETE/PUT/PATCH in CORS preflight
  - cap lastMessage.content preview at 300 code points in GET /conversations
  - PATCH /messages/:messageId now broadcasts message:edited and retranslates
  - join rooms before marking socket connected to close message-loss race
  - close TOCTOU race that could resurrect a deleted message with edited content
  - close TOCTOU race that could regress the delivered/read cursor
  - dedup offline delivery queue by messageId+eventType, not messageId alone
  - SyncEngine A3.2 — pagination cursor keyset composite /sync
  - SyncEngine A2.1 — emitWithSeq sur notification:new (event pilote \_seq)
  - SyncEngine A3.1 — endpoint /sync read-only, collection messages
  - SyncEngine A1 — UserEventSeq + SequenceService.nextSeq atomique
  - sliding window des sessions trusted — champ lastActivityAt (P7-3)
  - recordView — catch P2002 différencié + log des pannes réelles (P7-2)
  - AgentAdminRelay ne démarrait jamais — connect() avant subscribe()
  - harden two lost-update/out-of-order races on shared counter & cursor
  - unify 5 bounded-cache copies into a single BoundedTtlCache SSOT
  - bound participant-lookup cache (FIFO 5000 + expired sweep)
  - appels tués à tort — garde socket-zombie + sémantique leftAt (C5, 14 sites)
  - bound resolveConversationId identifier→ObjectId cache (FIFO 2000)
  - endCall() resolves pre-answer hangups as missed, not completed
  - claim activeCallId — matcher aussi les documents sans le champ
  - bound StatusHandler identityCache to stop unbounded typing-path growth
  - unify timeout via withTimeout helper, fix leaked timers
  - memoize participantLookup to cut per-message DB round-trip (B.3)
  - keep attachments on message:edit realtime broadcast
  - resolve Participant.id before handleMessage in agent + non-blocking-translation paths
  - ne plus exposer l'email des co-participants (PII)
  - respecter les prefs présence dans les listes (Lot 5)
  - drop dead-on-read maintenance of cursor.unreadCount (iter 57 / F23c)
  - mock createUnifiedAuthMiddleware in profile-extended tests
  - retry transient push failures + stop deactivating tokens on provider outages
  - scope push notification collapse-id per-conversation (#1140)
  - respecter les prefs privacy dans presence:snapshot (Lot 2, E1)
  - mock createUnifiedAuthMiddleware in profile.test (unblock CI)
  - ne pas divulguer la présence des membres via /links (Lot 2, E2)
  - retire la présence des payloads friend-requests (Lot 4)
  - typage viewer dans /users/search (authContext cast)
  - unifier la résolution d'avatar participant + corriger notSeenBy (iter 47)
  - gate présence dans /users/search (Lot 4)
  - batch resolveForTargets + gate /users/presence (Lot 2)
  - mock createUnifiedAuthMiddleware in profile.test.ts (unblock CI)
  - gate présence sur les lookups email/phone/id dédiés (Lot 3 fin)
  - gate présence sur la fiche profil (Lot 3/6)
  - PresenceVisibilityService (Lot 1/6 présence)
  - unread-count batch must exclude each participant's own messages (iter 46 / F23b)
  - collapse per-message unread counts to a single query (iter 45 / F23) (#1134)
  - calibrate coverageThreshold to CI-bun baseline (~9.5pp below local-node)
  - batch unread counts in one read (F23, iter 45)
  - pin espnet==202412 — 202511 exige numpy>=2.0 et casse le build Docker
  - emoji extraction stripped CJK/Kana/Hangul, leaving CJK text untranslated (#1625)
  - pin pytest back to 8.3.4 — pytest-asyncio 0.25.2 requires pytest<9
  - deduplicate in-flight tasks — gateway retries no longer self-strangle long texts
  - repair stale outer-exception test in translation_processor
  - stop dividing torch threads by async worker count — inference ran 2× slow
  - sequential language fan-out — budgets now cover real inference time
  - proportional inference budget — long texts are translated again
  - boot import failure no longer permanently kills the audio pipeline
  - pin floating ML deps to stop non-deterministic Docker build breaks
  - sync uv.lock project version (unblock Test Python CI)
  - restore numpy<1.24 ESPnet constraint (revert breaking Dependabot #825)
  - import ESM avec extension .js + test-garde des imports relatifs
  - add .js extension to mention-parser import — prod gateway crash-loop
  - helper pur resolvePresenceVisibility (Lot 1/6 présence)

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.6.0

## 1.6.0

### Minor Changes

- Changements automatiques détectés :

  - serialize thermal video downgrade, fix unhold error swallow, TURN/STUN reliability (#1692)
  - stop dependabot proposing Next.js major bumps (#1694)
  - reply-count pills — pure ReplyThreads SSOT (#1684)
  - fix WebRTC task isolation races, dead analytics field, ObservedObject re-subscription (#1665)
  - getUserLanguagePreferences injects deviceLocale — parity with display resolution (iter 143) (#1666)
  - synchronise la présence du profil avec la liste de conversations (#1664)
  - UA detection — specific platform swallowed by generic token (iter 142) (#1662)
  - who-reacted breakdown sheet — pure ReactionBreakdown SSOT (#1663)
  - overnight DND morning tail bound to window start day (iter 141) (#1661)
  - fix hover-prefetch cache key mismatch crashing on new message
  - web rejoin race + signaling leak, gateway zombie-socket scoping + DND bypass (#1660)
  - idempotent attachment:reaction — no re-broadcast on a no-op add/remove (iter 141) (#1659)
  - pure ConversationSections SSOT — pinned/others split, no phantom empty section (#1657)
  - snapToScale honors octave wrap — auto-tune no longer mis-snaps B (iter 139) (#1656)
  - formatFileSize rolls Ko→Mo — no more "1024 Ko" (iter 138) (#1655)
  - clicksByHour in UTC — coherent with clicksByDate (iter 137) (#1654)
  - gateway call-lifecycle fanout hardening + iOS accessibility/HIG fixes (#1653)
  - FIFO drain order — a memory-fallback edit no longer replays before its Redis-backed new (iter 136) (#1652)
  - discard-draft affordance (§B draft lifecycle) (#1651)
  - locationCount never incremented on the live path — count by messageType like recompute (iter 135) (#1650)
  - dropped ICE restart never recovered when a renegotiation was already in flight (web) (#1649)
  - idempotent reaction:add — no re-broadcast/re-notify on a no-op re-react (iter 134) (#1648)
  - iconified empty-state card (iOS parity §B) (#1647)
  - aggregate packet loss across all inbound streams (iter 133) (#1646)
  - orphan-recovery gaps, duration anchor drift, dead push, quality-monitor loop, banner re-arm (#1645)
  - email fragments no longer linkified/extracted as mentions — unify SSOT left boundary (iter 132) (#1644)
  - pure empty-state decision (iOS parity §B) (#1643)
  - quality-first dedup — a newer basic no longer downgrades a premium (iter 129) (#1640)
  - "End &amp; Answer" never answered the waiting call + third caller silently dropped (#1639)
  - draft-aware ordering + draft row preview (iOS parity §B) (#1638)
  - message-list route ignored frozen receipts, under-counting delivered/read vs read-status endpoints (#1637)
  - bouton 'voir la conversation' sur l'ecran d'appel (minimise + ouvre le DM)
  - minimiser l'appel en pilule flottante (voir la conversation pendant l'appel)
  - call:end recovery bypassed the wide fanout + web never sent call:heartbeat (#1636)
  - clamp truncateFilename output for maxLength &lt; 4 (iter 128) (#1635)
  - faire aboutir l'appel SORTANT Android (peerId du joiner)
  - fermer automatiquement l'ecran d'appel termine
  - persist reply reference with draft (iOS DraftStore parity) (#1633)
  - scope anonymous membership check to the target conversation (#1634)
  - missed-call notification skipped on force-end cleanup + dead field names in adaptive degradation (#1631)
  - per-conversation text draft auto-save/restore (iOS parity) (#1630)
  - batch read-statuses ignored frozen receipts, under-counting vs single-message endpoint (#1629)
  - faire aboutir l'appel entrant WebRTC (join-with-ACK + to-field)
  - demander la permission micro/camera au runtime avant le media
  - disconnect-grace missed calls never notified + stale perfect-negotiation state on rejoin (#1627)
  - extract preprocessContent to a pure module so its test guards production (iter 126) (#1628)
  - anonymous socket joins ROOMS.user room so unread badge updates live (#1626)
  - importer le media WebRTC P1-P4 (moteur + coordinateur + video)
  - faire sonner l'appel entrant au niveau app (offer socket foreground)
  - filter STT alternatives by region, drop tautology + var shadowing (#1620)
  - EMOJI_PATTERN range swallowed CJK/Kana/Hangul (#1622)
  - split delete into "for everyone" vs "for me" (iOS parity) (#1624)
  - sync reels cache on post edit/delete (socket + optimistic) (#1615)
  - extract normalizeMarkdown to a pure module so its test guards production (#1621)
  - version-bump gap in initiateCall cleanup + web quality-report never emitted (#1606)
  - release dedup key on failure so retries aren't swallowed (#1608)
  - unify sanitizer dangerous-key guard, close sanitizeMongoQuery prototype-pollution gap (#1605)
  - key message-translation cache by preferred language (iter 124) (#1613)
  - NLLB language-map coverage, uppercase URL scheme, group senderName SSOT (#1602)
  - is_list_item bullet class was an unintended char range (#1593)
  - deliver notification:new to the right room + close anon typing/reaction cross-conversation gap (#1588)
  - stop duplicate message:new re-broadcast on sequential retry + linkify mixed-case mentions (#1592)
  - render a live sub-minute countdown as 1m, not 0m (#1590)
  - call banner swipe-to-collapse bubble (#1618)
  - header typing-avatar chips (stacked + overflow) (#1616)
  - evict sockets from call room on GC force-end (#1601)
  - remove duplicate/false typing:stop on multi-device disconnect (#1617)
  - correct destructured prop name in DraggableParticipantOverlay (#1597)
  - callee accepting an audio-only call no longer activates camera/transmits video (#1614)
  - callee accepting an audio-only call no longer activates camera/transmits video
  - enforce the 2-hour message-edit window (#1612)
  - resolve mixed-case @mentions via OR+equals, not case-broken `in` (#1611)
  - header-level typing indicator + group member subtitle (#1607)
  - declarer les permissions media appels (RECORD_AUDIO/CAMERA)
  - nom de conv/appel direct = autre participant, pas soi
  - Reels P6 — boutons flottants alignes iOS (+ Contacts au radial)
  - recharger sur erreur de chunk perime attrapee par ErrorBoundary
  - Reels P5 — reels dans le Feed (carte + lancement gate)
  - Reels P4 — route nav + lancement Feed + item radial
  - Reels P3 — module :feature:reels + ViewModel + ecran vertical
  - Reels P2 — Media3 + atome ReelVideoSurface
  - Reels P1 — API getReels + repo + plan de portage
  - habillage Profile (MeeshyBackground gradient + tokens)
  - retirer la deconnexion de la vue principale (reste dans Reglages)
  - route notification:new to ROOMS.user, not raw userId (#1604)
  - polish — habillage Contacts (gradient + tokens)
  - polish — habillage Calls (MeeshyBackground gradient)
  - fold typing roster into scroll-to-bottom control (#1603)
  - Option A — retrait bottom nav -> MeeshyMenuFab radial
  - keyed typing-participants roster + label SSOT (#1599)
  - P2-S2 Chat increment 1 — fond gradient + app bar transparent
  - P2-S3 Feed habillage glass + formateur date partage
  - P2-S5 Notifications — timestamp ISO -> label localise
  - hydrater currentUser au boot (me() renvoie {user}, pas MeeshyUser)
  - P2-S4 Reglages — icones colorees de section + tokens
  - P2-S4 habillage Reglages (MeeshyBackground + chrome transparent)
  - enforce read⇒delivered in markMessagesAsRead
  - P2-S1 barre de recherche glass en bas (parite iOS)
  - P2-S1 retirer les chips filtres Material (parite iOS)
  - mapper userPreferences (debloque pin/mute/archive/customName)
  - P2-S1 sections repliables liste conv (CollapsibleSection)
  - P2-S1 resoudre le nom des conversations directes
  - P2-S1 habillage liste conv (MeeshyBackground+glass+grand titre)
  - GC missed-call notifications, force-leave timer cleanup, web offer/TURN-refresh gaps (#1594)
  - swipe-to-reply gesture with rubber-band commit core (#1595)
  - scroll-to-bottom control with unread badge + preview (#1591)
  - all-or-nothing group delivery semantics for own-message checks (#1587)
  - tap a quoted-reply preview to scroll to the original (#1584)
  - P1-8 MeeshyToast (feedback pill + notification card)
  - P1-7 MeeshyMenuFab (menu radial iOS = stack vertical staggere)
  - P1-7 FloatingGradientFab (FAB gradient corail/indigo)
  - P1-6 CollapsibleSection (sections repliables liste conv)
  - P1-5 MeeshyAvatar v2 (ring/presence/mood + fill gradient)
  - apiCall degrade sur reponse malformee au lieu de crasher
  - degrade SerializationException to a PARSE failure instead of crashing
  - affiliate relations no longer leak presence to non-friends
  - call:join never acked failures (gateway+web) + 2 P2034 gaps in CallService
  - use RFC 7232 §3.2 weak comparison for If-None-Match
  - gate cached translation path with conversation-membership check
  - chat @-mention autocomplete + roster display-name resolution
  - repair phantom-ringing fanout gap + call teardown edge cases
  - dedup on the resolved message id, not the constant "latest"
  - in-conversation message search + search-highlight wiring
  - restore F84 load-more offset fix reverted by a stale merge
  - P0-4 primitives chrome glass + habillage pilote Notifications
  - P0-3 typographie rounded Nunito (substitut SF Pro Rounded)
  - P0-2 ColorScheme Material complet indigo (zero surface grise)
  - improve iOS quality, accessibility and fix CI flakiness
  - restore web P0 initiator UI + check-active replay + transient-error whitelist silently dropped by 8ebd497b, absorb PR #1558's boot-floor/race fixes
  - converge getParticipantDisplayName to canonical name resolver
  - P0-1 verrouiller les design tokens sur la parite iOS
  - count text messages by messageType in incremental path to match recompute (F85)
  - rich-text rendering (markdown/mentions/m+/URL/highlight) (#1571)
  - bound participantId cache + reset typing throttle on stop
  - \_segment_text no longer drops a short sentence before a huge one (F85)
  - restore ~450 lines of call-safety fixes silently reverted by 8ebd497b
  - honest all-or-nothing delivery indicator (DeliveryStatusResolver) (#1568)
  - serialize per-user \_seq emission to guarantee ordering
  - message-effects lifecycle (ephemeral/blurred/view-once) (#1562)
  - authoritative groupBy recompute for post/comment reactionSummary (F84c)
  - improve iOS app quality, accessibility, and reliability
  - remove 7 dead Localizable.xcstrings keys surfaced by the merge
  - clear typing throttle on typing:stop so the next start re-emits
  - hasMentions no longer flags email addresses as mentions
  - harden message reaction summary (tx + authoritative count + P2002 idempotency)
  - use canonical display-name SSOT in V2 conversation-list transform (F84)
  - load-more advances offset instead of refetching page 1 forever (F84)
  - boot-floor gap in phantom-cleanup + web initiator race/dead-timeout regressions
  - first/last-name fields in the profile editor (§K) (#1556)
  - stop scroll ticks re-rendering the whole list body
  - cap list previews at 300 graphemes, add ScrollOffsetRelay, make mood-badge pulse idempotent
  - comprehensive UX/UI quality and accessibility improvements
  - forward message language to conversation stats so languageDistribution stops freezing (F84)
  - regional (content) language preference (§L) (#1530)
  - apply query filters to status-breakdown groupBy in getAffiliateStats (F83)
  - offline-queued notification-preference backend sync (§L) (#1526)
  - fold participant-scoped counts to users so leaderboards stop duplicating/hiding users (F82)
  - stop stripping ZWNJ/ZWJ — preserve emoji, Persian & Indic text (F82)
  - web initiator never entered its own call + gateway phantom-cleanup killed live cross-conversation calls
  - per-event notification type toggles (§L)
  - DND quiet-hours schedule editor (§L) (#1517)
  - remove dead NOTIFICATION socket event + fix broken Prisma import (F77)
  - honor failureWindowMs so isolated failures no longer trip the breaker (F77)
  - validate E.164 by digit count, not prefixed string length (F80)
  - guard CallsViewModel.loadCalls() against stale-filter races
  - durable notification master toggles (§L) (#1512)
  - honor bidirectional blocking on typing indicators
  - persisted interface language (settings-interface-language) (#1508)
  - close concurrent-call and cross-call correctness gaps in WebRTC/CallKit stack
  - auto-detect Spanish UI language — es was missing from detectBestInterfaceLanguage (F79)
  - clear stale typing indicators on ConversationSocketHandler teardown
  - persisted light/dark/system theme (settings-theme-mode) (#1504)
  - isUrlOnly no longer absorbs CJK/Thai text glued to a URL (F76)
  - web never replayed a missed ringing call on reconnect + rate-limit call:check-active
  - getEmailValidationError agrees with isValidEmail (F73)
  - remove dead voice-effects audio pipeline
  - phantom-ringing callees now get the call_cancel push from GC tier 1 too
  - optimistic + offline profile edit incl. content languages (§K) (#1500)
  - reactionSummary self-heals from authoritative Reaction rows
  - durable Room cache for the profile stats/timeline dashboard (§K) (#1496)
  - capitalize hyphenated/apostrophe names + strip CR from displayName (F72)
  - stop toasting transient call:error codes iOS already treats as non-fatal
  - clear qualityDegradedStreaks on GC-forced call end too
  - community pin/mute/archive/hide no longer stale across devices (F71)
  - relay real error code on call:toggle-audio/video failure
  - renegotiate video SDP direction on CallKit hold/unhold
  - chip release during active edge auto-scroll no longer drops
  - getInitials emits broken half-surrogate for emoji names (F68)
  - profile 30-day activity timeline sparkline (§K)
  - make calendarDayDiff DST-immune (F67)
  - guard setAudioEffect against a dead capture-hook collision risk
  - real-time presence broadcast bypassed blocking check
  - stats projection SSOT + read-only dashboard section (#1489)
  - reapply AVAudioSession mode on A/V switch, track cumulative reconnect count
  - terminal-write protocol for orphaned sessions, rate-limit backgrounded/foregrounded, sweep quality-streak leak
  - stop truncateFilename overflow + formatCompactNumber "1000.0K" boundary (F65/F66)
  - unconditional VoIP registration, dark-chrome text contrast, defensive audio unwraps (#1484)
  - extract shared CallTypeBadgeView, drop unreachable a11y label (#1476)
  - treat Mongo P2034 write-conflict as retryable on endCall/leaveCall too (#1480)
  - stop orphaning offline messages after a Redis blip, bound participantId cache
  - secondary identity rows — languages · country · timezone
  - dual-emit message:read-status-updated alongside legacy event
  - profile-header enrichment — presence · completion ring · E2EE · member-since (#1482)
  - support hyphenated usernames end-to-end via MENTION_HANDLE_CHARS SSOT (F60)
  - derive worker drain lanes from a kind→lane SSOT (#1478)
  - make post/comment reaction removal idempotent
  - header title follows displayName like the list row
  - normalize language-code case at all write/read boundaries (F63/F64)
  - close duplicate-reaction race in AttachmentReactionService
  - three-state presence dot on friend rows (#1474)
  - text tool — centered editing, 6 new fonts, visible weights, diamond/cloud/speech frames
  - ship customName (and unstrip reaction) in the list payload
  - socket conversation:updated no longer clobbers DM display names
  - resolveUserLanguage lowercases in-app prefs — case parity with resolveUserLanguagesOrdered (F62)
  - stop CallView defaulting callManager to CallManager.shared (P1-16)
  - @username fallback uses the module's Unicode boundary, not ASCII (#1464)
  - per-filter chip counts on the Contacts list (#1470)
  - drop the chip on Épingles to pin the conversation
  - bump CallSession.version on all terminal writers
  - comment_reaction honors commentLikeEnabled, no opt-out bypass (F59)
  - durable Room cache for Discover suggestions cold-start paint (#1466)
  - stop stale offline broadcast on anonymous reconnect race
  - comment-reaction carries the real postType, no REEL/STATUS collapse (F58)
  - edge auto-scroll while dragging the chip (Phase 3)
  - auto-scroll aux bords pendant le drag de chip (Phase 3 long-press)
  - STUN-only fallback no longer strands calls without TURN
  - friends Room cache for cold-start paint (#1461)
  - the card sits flush under the expiry line — top vertical alignment (C-DIR5)
  - media load failures speak up (C16, targeted audit 4)
  - empty texts are purged when inline editing ends (C15, targeted audit 3)
  - VoiceOver speaks the UI's language on the chrome (C14, targeted audit 1)
  - gradient backgrounds end-to-end — format, three renderers, palette row (C11)
  - trim redundant comments that overflowed a byte-bounded test window
  - complete fr/en/es/de coverage for all 108 story.\* keys (C12)
  - unbreak pre-existing structural/behavioral CI tests
  - discreet undo/redo — header icons exist only when the trajectory allows (C9 inc.4+5)
  - hasMentions Unicode-aware — detect accented @DisplayName (F57)
  - global undo/redo apply snapshots; media purge becomes lazy (C9 inc.3)
  - close camera-state race, guard doomed CallKit transactions, drop dead code
  - durable offline friend-request send with cmid idempotency (#1458)
  - global undo capture — one debounced trigger, gap-free by construction (C9 inc.2)
  - HistoryStore — pure state stack for global undo (C9 inc.1)
  - carded canvas no longer reserves the hidden header, viewport zoom resets on carding (C-DIR4 bug 4)
  - hung-participant detector in call-reliability-report
  - letterbox takes the slide background colour in full-chrome (C-DIR4 bug 2)
  - letterbox du canvas 9:16 aux couleurs du fond du slide en présentation libre (BUG-2 C-DIR4)
  - background colour applies instantly + draft resume no longer restores an empty composer (C-DIR4 bugs 1&3)
  - stickers get a single source of truth — currentEffects passthrough (C13)
  - self-heal playback when the primary player is stuck .paused (C-DIR3)
  - reword close() comment so it doesn't self-match the new test
  - flush pending DataChannel bye before peer connection teardown
  - unified chrome — header follows the FABs, collapsed-band handle removed (C-DIR2 b/c/d)
  - stickers are reachable again — picker wired into the Text panel (C8)
  - nonisolated data-channel value types — unbreak CallSignalIndicatorTests compile
  - durable offline block/unblock via the outbox (block-outbox-durable)
  - the add-story badge no longer gets clipped (user report)
  - ghost handle to recover hidden chrome (C3)
  - unbreak main build — register CallSignalGlyph.swift in pbxproj, hoist typealias out of ViewBuilder body
  - slide opening effect reachable by gesture from the Fond panel — VM-owned state (C1)
  - the Transitions sheet becomes real — slide opening-effect picker (C7)
  - transient quality pills, color-coded signal glyph, WhatsApp-style banner, instant remote hangup
  - add-slide affordance at the end of the slide strip (C6)
  - gesture exit for viewport zoom — double-tap resets, near-identity pinch snaps to 1.0 (C4)
  - exécution phasée — le run se termine connecté au compte de test
  - timeline FAB/tile/swipe-up open the timeline sheet instead of an empty band panel (C5)
  - sync reels affinity caches on post edit/delete (F55)
  - cache-first Discover suggestions (empty-query) (#1451)
  - single-flight SUB receive + silence watchdog — translation return channel self-heals
  - map Mongo P2034 write conflict on join to the existing conflict-retry path
  - Dynamic Type for MentionSuggestionPanel (139i)
  - background URLs are allow-listed — no more viewer IP-leak (W7)
  - hard-delete no longer orphans media rows forever (G7)
  - single canonical visibility filter (G5)
  - reaction self-echo no longer double-counts likeCount (F56)
  - zoom transition on secondary surfaces (U1 inc.2)
  - zoom transition from tray bubble to viewer on iOS 18+ (U1 inc.1)
  - stop logging DTMF digits and transcript content
  - EXCEPT/ONLY can no longer publish without an audience (W6)
  - Blocked-users tab + BlockCache SSOT binding the resolver seam (#1446)
  - EXCEPT/ONLY audience picker in the story composer (W3 inc.2)
  - COMMUNITY visibility in the story composer + visibilityUserIds plumbing (W3 inc.1)
  - intra-slide crossfades render in the web viewer (W1 inc.4)
  - intra-slide crossfades finally render at playback (R14)
  - Dynamic Type for KeypadTab (138i)
  - local mutations persist through the dirty-flush path (R12 inc.2)
  - silent refresh consumes the G1 delta-sync (R8 inc.1)
  - Discover live user-search with inline connect (#1443)
  - keyset cursor pagination on the stories tray (G1c)
  - lean tray projection on GET /posts/feed/stories (G1b)
  - undo/redo history survives a hard crash (E4 inc.2)
  - Dynamic Type for MessageListView swipe indicator (136i)
  - remove dead FirebaseNotificationService FCM sender (F51)
  - unit-fetch out-of-tray stories by postId on deep link (R4 inc.2)
  - Dynamic Type for SyncPill (135i)
  - close duplicate-reaction race with atomic upsert
  - forward real postType + ephemeral context on socket reaction notifications
  - hop CXPlayDTMFCallAction to MainActor; tie TURN TTL to CallCleanupService
  - online-first friends list + cross-screen cache reconciliation (#1434)
  - guard mark-unread cursor rewind against a fresher concurrent read
  - friendship & relationship-state SSOT (#1431)
  - remove dead handleIncomingOffer, dedupe call-notice presentation logic
  - exclude source language from story caption translation targets
  - the draft-resume card replaces the bare text alert (U4 increment 2)
  - DraftResumeCard building block (U4 increment 1)
  - Dynamic Type + a11y for AchievementBadgeView (134i)
  - regenerate pbxproj — drop phantom AudioEffectsPanel.swift reference
  - viewedAt timestamp alongside isViewed — soft migration (R11)
  - replay message edits/deletes to offline recipients too
  - VoiceOver custom actions for prev/next story navigation (U6 increment 2)
  - VoiceOver announces slide changes in the reader (U6 increment 1)
  - preload the next slide's media (W5)
  - live story deletion and per-text-object translation merge (W4)
  - legacy story content resolves over the full language chain (R10)
  - fix two self-inflicted test assertions from the previous commit
  - client expiry fallback aligned with the server's 21h (G6)
  - read overlay text from canonical `text`, not legacy `content`
  - CXAnswerCallAction hold + system-PiP frozen-frame placeholder
  - key typing-indicator roster by userId, not display name
  - adaptive video-sender-cap plan (network + thermal) (#1417)
  - haptic ticks on slide change and buffering freeze/resume (U2)
  - live translation + delete on the feed realtime hook (W4)
  - stop leaking CallParticipant.analytics on active-call route
  - enqueue offline recipients on the WS message:send path too
  - foreground media-object keyframes animate too (W1 increment 2)
  - text-object keyframes animate in the web reader (W1 increment 1)
  - auto-advance timer freezes while the primary video buffers (W2)
  - textObjects translate to the audience's real languages (G3)
  - single translation pipeline for story content (G2)
  - identity-aware active-call teardown (#1415)
  - encrypt the stories tray store like every other social store (R9)
  - logout purges the story draft AND the persisted publish queue (E9)
  - actually run the legacy offline-queue migration at boot (E6)
  - the queue cleans up its media copies (E10 disk leak)
  - last-message preview excludes soft-deleted messages
  - screen-capture participant spoofing, pocket-dial, HIG hit targets, stale-peer cleanup
  - sniff the URL extension before routing media to disk stores (R7)
  - story view receipts are durable via the outbox (R6)
  - chip drop moves the conversation onto a section header
  - delta-sync via ?updatedSince on the stories tray (G1)
  - debounce the sending clock glyph for sub-200ms sends (B.4)
  - write-ahead makes the online publish survive process kills (E5)
  - undo/redo history survives the timeline sheet lifecycle (E4)
  - flush the open timeline into the slide before persisting (E3)
  - deep-link container serves the cached tray before forcing network (R4)
  - identity interstitial between story groups (user directive)
  - call-reliability-report — prod health report for the multi-hour calls goal
  - periodic in_progress analytics snapshots survive app kills
  - update two source-guard tests for the TURN-refresh watchdog refactor
  - split press-state detector from long-press trigger
  - discreet buffering indicator during mid-slide stalls (R3)
  - propagate deviceLocale to the last 2 resolveUserLanguage sites
  - freeze timeline while the bg image bitmap is still loading (R2)
  - debounced draft autosave — editing survives hard crashes (E1)
  - retry TURN refresh on dropped ACK, surface busy/failure feedback, finish a11y hints
  - DM dedup reopens the most recently ACTIVE duplicate
  - auto-dismiss call-waiting banner on remote end (#1411)
  - buildEffects no longer wipes timeline-authored fields (E2)
  - pin viewed-story media until expiry (R5 wiring)
  - serialize updateOnNewMessage per conversation to stop a lost-update race
  - direct-DM creation is idempotent — reopen the existing DM
  - pinning exempts keys from DiskCacheStore eviction (R5)
  - amplify row scale animation dampingFraction for visible rebounce
  - freeze timeline while slide audio is still caching (R1)
  - Dynamic Type for MoodReplyConfirmationOverlay (132i)
  - persist end-of-call analytics on CallParticipant
  - Dynamic Type + a11y for MessageDetailSheet hero glyphs (131i)
  - apply URL-only translation guard on all 3 entry points
  - negotiationTimeMs separates WebRTC setup from human ring time
  - add negotiationTimeMs metric for WebRTC connection timing
  - Dynamic Type for ReelFeedCard glyphs (130i)
  - wire dead PiP rotation hook, fix VoiceOver double-read, fix Dynamic Type clipping
  - guard REST message-delete lastMessageAt with optimistic concurrency
  - re-anchor already-answered source-guard on the real subscriber
  - call_answered_elsewhere silent push — multi-device socketless ring dismissal
  - call-waiting banner for a second incoming call (#1403)
  - la liste de conversations scrolle à nouveau — retrait du DragGesture plein-ligne
  - call_cancel silent push ends phantom ringing (client side)
  - fan out sendToUser to device tokens in parallel
  - call_cancel background push kills phantom ringing on socketless devices
  - rate-limit reconnect/ICE-refresh handlers, remove dead signaling hook
  - quality-alert requires sustained degradation and excludes the reporter
  - remove unauthenticated-admin debug notification routes
  - quality-monitor warm-up gate fails closed when start date is nil
  - GC tier 3 spares multi-hour calls with fresh heartbeats
  - Dynamic Type + a11y for CameraView (129i)
  - re-wire MessageDraftMediaStore + 2 test files into pbxproj, purge warnings
  - useSocialSocket retries once the socket bootstraps
  - Dynamic Type for FeedPostCard action-bar glyphs (128i)
  - forward badge as android notificationCount (F1 Android)
  - keep the literal videoToggleTask?.cancel() call CI checks for
  - toggleVideo() can run two concurrent camera/transceiver actuations on rapid double-tap
  - GC force-end never fanned out call:ended to ringing callee's user room
  - typing:start/stop now require active conversation membership
  - WebRTC-plumbing outbound emits (call-webrtc-plumbing-emits) (#1393)
  - Dynamic Type for BubbleDeliveryCheck status glyphs (127i)
  - photothèque du composer — long press vidéo, actions Ajouter/Sélectionner/Éditer, présélection picker, Liquid Glass iOS 26 (#1389)
  - correct two false-positive assertions from prior commit
  - getReels curseur chronologique (lossless) + languageCodeSchema accepte les 639-3
  - CallEffectsOverlay ObservedObject re-subscription bug + a11y/dead-code cleanup
  - resync feed room + typing keepalive across reconnect/long sessions
  - badge unread embarqué dans le push — badge d'icône iOS et widget gelés app fermée (F1)
  - appel jamais décroché = missed (critère answeredAt) + garde FSM reconnecting
  - refactor conversation row long-press gesture with proper priority
  - fallback pendingCount cohérent avec pendingUIItems sur échec de lecture (item H cause D)
  - reclaim visibility-timeout des rows .inflight orphelines (item H)
  - les pièces jointes du brouillon survivent au kill (phase 2 — câblage)
  - store durable des pièces jointes de brouillon de message (phase 1)
  - Dynamic Type + VoiceOver for conversation composer (iter 126i)
  - pure video-survival auto-disable policy (#1387)
  - curseur getReplies aligné asc + codes langue 639-3 acceptés
  - call:ended atteint l'appelé qui sonne (fanout rooms user)
  - réaligne le garde AdjustBitrate sur le merge BWE gated + pbxproj regen
  - auto-save du brouillon au passage en background (D1)
  - auto-retry of failed messages now forwards clientMessageId
  - indicateur qualité fiable + écran d'appel décalé de 30pt
  - action « Enregistrer » dans le menu appui-long (composant unifié)
  - Dynamic Type + VoiceOver for AttachmentLoadingTile (iter 125i)
  - hooks onSaveRequested sur les viewers SDK + câblage du fullscreen média des bulles
  - report « downloaded » best-effort dans le coordinateur unifié (parité P7-9)
  - câbler audio + galerie média sur le composant unifié Enregistrer
  - Dynamic Type + VoiceOver for iPad panel header (iter 124i)
  - implement drag-to-reorder during long-press with smooth transition
  - correct offset windows and setEffect precondition in new tests
  - atomic conditional consume closes brute-force TOCTOU on SMS reset attempt caps
  - remplacement 1-réaction-par-user + gate messages système dans toggleReaction
  - adjust scale animation timing for smoother rebounce
  - sémantique de remplacement 1-réaction-par-user + gate messages système
  - resolve duplicate CallEffectsOverlayAccessibilityTests class
  - restore VideoConfig, actually used by P2PWebRTCClient
  - implement row scale animation reset on menu dismiss
  - thread-safety, dead code, and VoiceOver gaps in calling stack
  - add long-press scale animation to conversation rows
  - connection-quality classification core + live signal indicator (#1381)
  - type decodePayload's corrupt-payload error as MeeshyError
  - gate FRIENDS-visibility posts through buildVisibilityFilter
  - re-join call room on socket reconnect (production component)
  - idempotence du remove de réaction sur le chemin socket
  - DELETE de réaction idempotent (not-found → succès, pas 404)
  - pure telecom-connection policy (ConnectionService state reports) + reporter fold (#1377)
  - totalMembers exclut le sender par identité (pas -1 aveugle)
  - bootRecovery détecte aussi les fichiers média visuels manquants au crash
  - annuler un envoi média offline balaie ses fichiers (fuite disque)
  - pure call-audio policy (ringback/ringtone/cues) + tone controller fold (#1375)
  - le merge edit-into-send offline détruisait les médias en attente
  - dead-letter immédiat des rejets serveur 4xx permanents dans l'outbox
  - watermark conversation-list dérivé de l'horloge locale (R15b)
  - watermark de gap-recovery messages empoisonné par clock-skew (R15a)
  - SyncEngine A5.4 — resync notifications au reconnect (fenêtre aveugle)
  - SyncEngine A5.3 — resync notifications sur gap de séquence
  - SyncEngine A5.2 — hook gapDetected sur SyncSeqTracker
  - SyncEngine A5.1 — décodage \_seq + tracker de gap (bénéfice multi-device)
  - terminal statuses are immutable — leave/disconnect can no longer rewrite missed as completed
  - unify REST/socket CallService instance, harden markCallAsMissed, remove dead beacon fallback
  - report downloaded pour les documents (gap P7-9 P3 comblé)
  - enforce maxUses cap atomically (F47 TOCTOU)
  - BlockActionCoordinator — block/unblock durable pour les sites Views (R6-4 complet)
  - BlockedViewModel.unblock via l'outbox durable (R6-4 incr.2, 1/N sites)
  - primitive block optimiste + fix caveat swipe labels périmés (R6-4 incrément 1/2)
  - atomic increments for calibrateProfile counters (lost-update race)
  - release active-call claim on ringing-timeout missed + self-heal leaked claims
  - verrous + master PIN purgés au logout (P7-11, invariant 9)
  - ConversationLockManager logout hook — purge cross-account leak (P7-11)
  - close cap TOCTOU — reserve slot atomically before creating relation (F47)
  - réconciliation complète périodique — purge des conversations fantômes hard-supprimées (P7-10)
  - release active-call claim on missed-timeout, harden signaling authz, fix waiting-banner reject
  - propagate profile changes to conversation partners (USER_UPDATED)
  - une panne gateway ne consomme plus le budget de retries de l'outbox (P7-7)
  - le composer ne se verrouille plus pendant qu'un message est sur l'horloge ⏳
  - live in-call duration timer (slice call-duration-timer) (#1371)
  - purge du cache HTTP URLCache au logout (T15b-b, invariant 9)
  - C8 — dédup des sockets same-user au join (last join wins)
  - document Dynamic Type freeze doctrine for FeedView chrome (iter 123i)
  - tolerate GRDB Date round-trip noise in markEdited ordering guard
  - decode editedAt onto APIMessage (CI compile failure)
  - guard message:edited against out-of-order stale delivery
  - atomic increments in ConversationMessageStats edit/delete hooks (F48)
  - stop clearing ringing timeout on early-join; fix web duplicate-offer race
  - call:join ne désarme plus le ringing timer — l'answer SDP et les chemins terminaux le possèdent
  - Dynamic Type + VoiceOver for EmojiPickerSheet (iter 122i)
  - Dynamic Type for message context menu (iter 121i)
  - réconciliation call:end aussi sur ACK-échec (chaos-test 2)
  - joinCall transitionne vers RINGING — l'early-join du callee n'est pas un décrochage (item F matérialisé)
  - version-guard call-termination writes, align REST/socket end-call authorization
  - guard read/delivery cursors against out-of-order regression
  - deep-link a full-screen call push into the incoming-call screen
  - un appel sortant non décroché ne bascule plus en écran connecté 00:00 — garde FSM .reconnecting, horloge d'appel, bannières Dynamic Island, avatars duo + fond profil
  - hide decorative conversation backdrop from VoiceOver (iter 120i)
  - grâces disconnect affinées — extension si socket vivant, grâce courte pré-answer (chaos-tests prod)
  - guard stale ICE-restart/call-waiting async continuations
  - close lost-update race on message reaction summary
  - Dynamic Type + VoiceOver for message-bubble media grid (iter 119i)
  - route FCM call pushes to a full-screen incoming-call notification (#1354)
  - reconcile with concurrent session's merged fix, keep only the surviving bug
  - pre-existing CI failures — PiP filter button a11y hint, dead localization keys, stale auto-hide test
  - CallKit informé sur tout teardown .failed, TURN préservé sur End & Answer, bannière call-waiting nettoyée, indicateur signaling dégradé
  - iOS CallKit/TURN/banner triad + gateway endCall idempotency gap
  - un restart/blip ne tue plus un appel établi — ownership disconnect, réhydratation boot, hygiène timers
  - recover socket.io realtime delivery after reconnect_failed
  - réaligner 3 source-guards CallView hérités du merge main
  - exact @mention resolution — anchor Unicode name boundaries
  - pure incoming-call push decision core (#1347)
  - Dynamic Type + VoiceOver for ConversationView message-row affordances (iter 118i)
  - gateway audit follow-through — leftAt persistence, missing summary index, force-leave missed path, ICE rate limit
  - drop stale retranslation results (edit ordering race)
  - survive gateway restart — active P2P call no longer cut by signaling-socket drop
  - remove dead previewRouter + unify conversation preview width (deferred NITs)
  - dedup key must include messageId, not just conversation
  - appels — vidéo distante, join VoIP fiable, chrono CallKit, contrôles cadre
  - Dynamic Type in action menu + inert-modifier cleanup (deferred review)
  - call:missed contract + video layout on remote escalation
  - restore call metric glyphs and move call time bottom-right
  - contraste blanc-sur-verre en Light + a11y overlay (déférés revue)
  - dedicated Calls bottom-nav tab + re-dial gesture (calls-tab-nav) (#1340)
  - dismissContextMenu — purge asyncAfter annulable
  - bannière DM strippée sur la route LIST (schéma minimal)
  - remove dead activeCallSession() call breaking sdk-tests compile
  - close call:heartbeat authz gap to strict active-participant check
  - gate CallKit plateforme — le simulateur pilote l'appel in-app
  - add missing banner arg to APIConversationUser test fixture
  - Dynamic Type + VoiceOver for StoryViewerView canvas (iter 117i)
  - stale-broadcast ordering races + unbounded conversationId cache
  - remontee banniere de profil (DM) + boutons header conversation en glass
  - hide decorative onboarding backdrop from VoiceOver + Dynamic Type CTA (iter 116i)
  - evict VoIP dedup entry on CallKit report failure (busy path)
  - close initiateCall/joinCall TOCTOU races on concurrent starts
  - Dynamic Type doctrine for CallView control bar (iter 115i)
  - update stale transcription-segment tests for active-participant authz
  - Dynamic Type + VoiceOver for StoryExportShareSheet (iter 114i)
  - hide dead voice-effects panel (video filters only)
  - coalesce reconnect triggers, epoch half-open re-arm, TURN refresh at restart, stuck-muted fallback
  - raffinements apercu long-press conversation
  - redesign system call bubble — compact, direction-aware, timestamped
  - Dynamic Type + VoiceOver for OnboardingFlowView chrome (iter 113i)
  - close conversation-membership authz bypass on transcription-segment
  - thread real conversationId into outgoing call route (call-nav-conversation-thread)
  - apercu long-press conversation enrichi (banniere, avatar, actions, dernier message)
  - action Renommer dans le menu contextuel conversation
  - Dynamic Type + VoiceOver for OnboardingStepViews (iter 112i)
  - close membership-check bypass, post call-summary on every terminal path
  - restore reaction notifications on the socket path
  - bind the realtime socket to the auth session (realtime-session-coordinator) (#1321)
  - restore CallMediaConfig.swift — VideoConfig is a real prod dependency
  - scope Opus SDP munging to audio, enforce per-call authz, drop dead code
  - converge formatDuration onto shared formatClock (iter 74)
  - idempotent P2002 handling on message reaction add
  - zoom in/out sur l'overlay long-press conversation
  - Dynamic Type for StatusBubbleOverlay (iter 111i)
  - MessageMoreSheet en grille verre (Liquid Glass iOS 26)
  - Dynamic Type + VoiceOver for ReelsPlayerView (iter 110i)
  - fold CallSignalManager into CallViewModel (VM-fold)
  - restore conversation long-press menu (remove .onDrag conflict)
  - ACK-based call:initiate (emitInitiate + pure parser) (#1311)
  - custom conversation context menu (icons on iOS 26)
  - clear participant heartbeat on mid-call leave
  - preserve supported ISO 639-3 language codes in normalizeLanguageCode
  - add safety-net expiry for stuck remote typing indicators
  - converge local formatDuration onto shared formatClock
  - stop SDP-munging RED into audio offers/answers, use setCodecPreferences
  - typed FRIEND_REQUEST_NEW/ACCEPTED/REJECTED events
  - context-menu icons + story quit alert legibility
  - Dynamic Type + VoiceOver for StoryTrayView (iter 109i)
  - apply late/refreshed TURN credentials to a live peer connection
  - recent/missed-calls list UI (CallHistoryViewModel + screen) (#1304)
  - native-lean long-press menu (reactions + bubble + vertical list)
  - emit friend-request:cancelled so the other party's list syncs live
  - Dynamic Type for StoryViewerView sidebar/header (iter 108i)
  - resistant swipe on audio/video bubbles
  - route quick affordances to native MessageMoreSheet
  - menu longpress - new components + MessageDetailSheet decomposition
  - Dynamic Type + VoiceOver for FeedPostCard media (iter 107i)
  - Dynamic Type + VoiceOver for AudioEffectsPanel (iter 106i)
  - serialize camera switch, close stale peer connection, fix VoIP dedup eviction
  - VoiceOver labels for feed attachment remove buttons (iter 105i)
  - Dynamic Type + VoiceOver for AudioEffectsPanel (iter 105i)
  - Dynamic Type + VoiceOver for VideoFilterControlView (iter 105i)
  - Dynamic Type + VoiceOver for ShareLinksView (iter 104i)
  - VoiceOver labels for AudioFullscreenView icon-only controls (iter 103i)
  - supprime à nouveau le doublon d'import copyToClipboard (régression réintroduite) (#1291)
  - adopte la source unique copyToClipboard dans TwoFactorSettings (F30-f) (#1284)
  - Dynamic Type + VoiceOver for EditPostSheet (iter 100i)
  - Dynamic Type + VoiceOver for ConversationMediaGalleryView (iter 103i)
  - Dynamic Type + VoiceOver + content selection for LicensesView (iter 98i)
  - finish Dynamic Type + VoiceOver for LoginView (iter 102i)
  - resolve committed merge-conflict markers in routine uiux docs
  - Dynamic Type + VoiceOver for TrackingLinksView (iter 101i)
  - adopte la source unique copyToClipboard dans TwoFactorSettings (F30-f)
  - Dynamic Type + VoiceOver for CommunityLinkDetailView (iter 99i) (#1272)
  - supprime le doublon d'import copyToClipboard (régression merge parallèle) (#1266)
  - resolve committed conflict markers from triple 93i collision
  - Dynamic Type + VoiceOver + content copy for SupportView (iter 95i) (#1262)
  - remove duplicate copyToClipboard import introduced by main merge
  - call-history repository (REST + Room cache-first SWR)
  - Dynamic Type + VoiceOver for ConversationListView overlays (iter 94i)
  - remove duplicate copyToClipboard import breaking the build
  - source unique presse-papier pour les pages links — iter 70
  - Dynamic Type + VoiceOver for ForwardPickerSheet (iter 100i)
  - Dynamic Type for MessageOverlayMenu (iter 99i)
  - Dynamic Type + VoiceOver for UserStatsView (iter 98i)
  - copy diagnostics via long-press menu in AboutView (iter 98i)
  - remove duplicate accessibilityElement on AffiliateView stat card (iter 92i)
  - trim background-observer comment to fit CI's fixed-window source test
  - serialize hold/unhold video ops, fix glare-path state leak, GC race guard
  - update quality-report test for participant-gated persistCallStats
  - moderator-kick wrong-participant, quality-report authz gap, ringing-call CallKit gap
  - thread-safe audio effect counters, cache-first filter switch, a11y hint (#1257)
  - Dynamic Type + destructive-red token for EffectsPickerView (iter 87i)
  - source unique formatFileSize — iter 70
  - relocate stragglin docs, drop orphan MARK dividers
  - annule les vérifications de disponibilité obsolètes (AbortController) — iter 70
  - split StoryComposerView into view-builder extensions
  - Dynamic Type + VoiceOver for AddParticipantSheet (iter 97i)
  - pure call-journal model (CallRecord + CallDirection/CallMediaType) (#1254)
  - clôture F30 — unification presse-papiers via source unique (iter 70)
  - Dynamic Type + VoiceOver for NotificationSettingsView (iter 96i)
  - source unique de validation d'ObjectId MongoDB — iter 69 (#1251)
  - split StoryCanvasUIView into method extensions
  - split StoryComposerViewModel into method extensions
  - extract free top-level types into dedicated files
  - widen access private→internal on the 3 refactor targets
  - content selection + VoiceOver for TwoFactorSetupView (iter 95i)
  - converge conversation-share clipboard fallback on copyToClipboard (F30-d, iter 68)
  - Dynamic Type + VoiceOver for SharePickerView (iter 94i)
  - Dynamic Type + VoiceOver for AffiliateView (iter 94i)
  - Dynamic Type + VoiceOver for MemberManagementSection (iter 94i)
  - Dynamic Type for SharePickerView (iter 94i)
  - Dynamic Type for LocationPickerView (iter 93i)
  - Dynamic Type + VoiceOver for LocationPickerView (iter 93i)
  - converge partage conversation (fallback presse-papier) vers copyToClipboard (F30-d, iter 68)
  - Dynamic Type + VoiceOver for ConversationPreferencesTab (iter 93i)
  - CallSignalManager — inbound call:\* → SharedFlow<CallEvent> + outbound emit table (#1230)
  - render comment audio/media in feed preview + fix notification badge truncation
  - Dynamic Type + VoiceOver for AffiliateView (iter 92i)
  - Dynamic Type + VoiceOver for NewConversationView (iter 91i)
  - Dynamic Type + VoiceOver for CommunityLinksView (iter 91i)
  - Dynamic Type + VoiceOver AffiliateView (iter 91i)
  - Dynamic Type + VoiceOver for AffiliateView (iter 91i)
  - converge partage conversation vers copyToClipboard (F30-d)
  - Dynamic Type + VoiceOver for DataExportView (iter 91i)
  - stop audio-toggle self-echo, rate-limit transcription relay, reset PiP fps
  - Dynamic Type + VoiceOver DataExportView (iter 90i)
  - Dynamic Type for NewConversationView (iter 90i)
  - converge copie identifiant groupe vers copyToClipboard (F30-c)
  - Dynamic Type + VoiceOver for MagicLinkView (iter 90i)
  - converge partage feed/reel vers copyToClipboard (F30-b)
  - Dynamic Type + VoiceOver + palette for EffectsPickerView (iter 89i)
  - converge copie contenu/lien vers la source unique copyToClipboard (F30-a) (#1216)
  - Dynamic Type + i18n/render fixes for DeleteAccountView (iter 88i)
  - Dynamic Type + VoiceOver for DeleteAccountView (iter 88i)
  - Dynamic Type + VoiceOver for voice profile wizard (iter 87i)
  - remove duplicate getUserInitials import in u/[id] page
  - route legacy slide.mediaURL background via directURLIfAny (WS5.4a)
  - retire le code mort du filtre temps-reel Story
  - restaure isExpired reverté par le même merge parallèle — iter 64 (#1210)
  - retire le dead StoryFilteredLayer, extrait StoryFilterKind
  - notify peer on local SDP failure, drop dead emitCallEnd overload
  - Dynamic Type + VoiceOver for storage & auto-download settings (iter 83i)
  - retire les références orphelines ReplyThread du pbxproj
  - story par défaut en Contacts + filtres par média
  - restaure formatCompactNumber reverté par un merge parallèle — iter 63 (#1208)
  - inbound call:\* signalling event models + pure CallEvent mapper (#1207)
  - Dynamic Type + VoiceOver headers for AboutView (iter 86i)
  - restaure formatCompactNumber reverté par un merge parallèle — iter 63
  - source unique de la troncature de texte (truncate) — iter 62 (#1203)
  - VoiceOver selection semantics for the language picker (iter 85i)
  - Dynamic Type + VoiceOver for StarredMessagesView (iter 85i)
  - source unique du formatage de durée média (formatClock) — iter 62
  - corrections du review présence (conformité + decay)
  - source unique du compteur compact (formatCompactNumber) — iter 61 (#1201)
  - Dynamic Type + VoiceOver for EditProfileView (iter 84i)
  - source unique du prédicat d'expiration (isExpired) — iter 60 (#1199)
  - présence datée + colorée après le pseudo (fiche profil, Lot 6 iOS)
  - keep PR1157/PR1148 catalog-backed localization (fix dead keys)
  - Dynamic Type + i18n parity for legal screens (iter 83i)
  - unify sheet grabber affordance (iter 79i)
  - source unique du « temps restant avant expiration » — iter 59 (#1187)
  - Dynamic Type parity for call-screen inline glyphs (iter 79ib)
  - Dynamic Type for the feed attachment composer (iter 79i)
  - source unique du temps restant avant expiration — iter 59
  - restore contacts avatar initials to getUserInitials (iter 59, anti-régression F26c-c(b))
  - Dynamic Type for the fullscreen audio player (iter 82i)
  - complete ConversationSettingsView localization (iter 78i)
  - Dynamic Type for the active sessions screen (iter 82i)
  - source unique de la classification du temps relatif — iter 58 (#1177)
  - relay real toggle-media errors + unify CallService instance (RC-4)
  - RelativeTimeFormatter.lastSeenString (Lot 6 iOS)
  - localize ConversationLockSheet + VoiceOver/Dynamic Type (iter 81i)
  - source unique des initiales — profil public → getUserInitials (iter 58, F26c-c(c))
  - source unique des initiales — page profil app/u/[id] → getUserInitials (iter 58)
  - stop duplicate Socket.IO listener registration on reconnect-adjacent calls (iter 57)
  - source unique des initiales — famille contacts → getUserInitials — iter 57 (#1181)
  - import Combine in OfflineQueueTests (CI restore)
  - add missing import Combine to OfflineQueueTests (unblock sdk-tests CI)
  - CountryPicker VoiceOver labels + sheet grabber (iter 80i)
  - Dynamic Type for the feed post composer (iter 78i)
  - initiales admin/users → getUserInitials + fix(gateway/test) createUnifiedAuthMiddleware mock — iter 56 (#1170)
  - consolidate destructive/error/expired reds to MeeshyColors.error (iter 78i)
  - complete story-viewer localization catalog (iter 79i)
  - :feature:calls CallViewModel + minimal call screen (Calls slice) (#1169)
  - localize MessageOverlayMenu message menu (iter 78ib)
  - localize Router route/scene titles + deep-link error (iter 79i)
  - source unique des initiales — MemberSelectionStep → getUserInitials — iter 55 (#1167)
  - :feature:calls CallViewModel + minimal call screen (Calls slice)
  - Dynamic Type for the link preview card (iter 78i)
  - source unique des initiales — MemberSelectionStep → getUserInitials (iter 55)
  - tokenize semantic hardcoded colors to MeeshyColors (iter 78i)
  - supprime le module mort utils/user.ts (clôt le cluster getUserDisplayName) — iter 54 (#1163)
  - localize SharePickerView chrome strings (iter 77i) (#1162)
  - Dynamic Type ConversationDashboardView (iter 71i)
  - source unique du nom d'affichage (username-first → canonique) — iter 53 (#1161)
  - source unique du nom d'affichage (déjà displayName-first) — iter 52 (#1159)
  - Dynamic Type for the invite friends sheet (iter 76i)
  - source unique des initiales d'avatar (objet) — iter 51 (#1158)
  - localize message quick-action menu — iter 71i
  - source unique des initiales d'avatar (string) — iter 50 (#1156)
  - harden call signaling against payload spoofing + DoS
  - mark EmojiGridCategoryTests @MainActor (iter 71i)
  - Dynamic Type 2FA security flow (iter 71i)
  - pure call-lifecycle FSM (core:model) (#1153)
  - localize emoji-picker category VoiceOver labels (iter 71i)
  - source unique du nom d'affichage — copies locales (iter 50)
  - source unique du nom d'affichage utilisateur (iter 49) (#1147)
  - Dynamic Type for the voice profile management screen (iter 75i)
  - consolidate hardcoded hex tints to MeeshyColors tokens on Support/Report screens (iter 71i)
  - categorised + searchable sticker picker (#1135)
  - localize 6 hardcoded French VoiceOver labels/hints (iter 71i)
  - source unique de la validation d'email + dernière horloge inline (iter 48) (#1146)
  - Dynamic Type for the conversation dashboard (iter 74i)
  - unifier formatDuration sur le canonique formatClock (iter 47) (#1141)
  - hoist actor-isolated pendingCount() out of XCTAssert autoclosure
  - re-apply await-hoist in PendingStatusQueueTests (merge reverted 87f85d68d)
  - restore iOS work reverted by the PresenceVisibilityService merge (84fedd79)
  - remove orphaned ReplyThreadOverlay.swift (complete #1122 cluster removal)
  - présence colorée + datée sur la fiche profil (Lot 6 web)
  - grace period before treating a transient socket drop as call-leave (P0-7)
  - localize hardcoded French VoiceOver strings (iter 73i)
  - remove ReplyThreadOverlay.swift resurrected by a merge artifact (unblocks CI)
  - Dynamic Type for the feed comments sheet (iter 72i)
  - hoist await out of XCTAssert autoclosure (iter 71i unblock)
  - unifier formatFileSize sur la source canonique partagée (iter 46) (#1136)
  - wire invite-user-modal row aria-label to selection state
  - guard call-waiting pending-clear against newer overwrite (#1133)
  - remove dead ReplyThreadOverlay to unblock iOS compile (iter 71i)
  - Dynamic Type for the 2FA security flow (iter 71i)
  - hoist await out of XCTAssertEqual autoclosure in PendingStatusQueueTests
  - remove ReplyThreadOverlay.swift resurrected by a merge artifact
  - guard call-waiting pending-clear against newer overwrite
  - repair invite-modal result row broken by merge (unblocks CI)
  - two realtime correctness bugs — presence list leak + moderator-delete offline enqueue (iter 144) (#1685)
  - restore DELETE/PUT/PATCH in CORS preflight
  - cap lastMessage.content preview at 300 code points in GET /conversations
  - PATCH /messages/:messageId now broadcasts message:edited and retranslates
  - join rooms before marking socket connected to close message-loss race
  - close TOCTOU race that could resurrect a deleted message with edited content
  - close TOCTOU race that could regress the delivered/read cursor
  - dedup offline delivery queue by messageId+eventType, not messageId alone
  - SyncEngine A3.2 — pagination cursor keyset composite /sync
  - SyncEngine A2.1 — emitWithSeq sur notification:new (event pilote \_seq)
  - SyncEngine A3.1 — endpoint /sync read-only, collection messages
  - SyncEngine A1 — UserEventSeq + SequenceService.nextSeq atomique
  - sliding window des sessions trusted — champ lastActivityAt (P7-3)
  - recordView — catch P2002 différencié + log des pannes réelles (P7-2)
  - AgentAdminRelay ne démarrait jamais — connect() avant subscribe()
  - harden two lost-update/out-of-order races on shared counter & cursor
  - unify 5 bounded-cache copies into a single BoundedTtlCache SSOT
  - bound participant-lookup cache (FIFO 5000 + expired sweep)
  - appels tués à tort — garde socket-zombie + sémantique leftAt (C5, 14 sites)
  - bound resolveConversationId identifier→ObjectId cache (FIFO 2000)
  - endCall() resolves pre-answer hangups as missed, not completed
  - claim activeCallId — matcher aussi les documents sans le champ
  - bound StatusHandler identityCache to stop unbounded typing-path growth
  - unify timeout via withTimeout helper, fix leaked timers
  - memoize participantLookup to cut per-message DB round-trip (B.3)
  - keep attachments on message:edit realtime broadcast
  - resolve Participant.id before handleMessage in agent + non-blocking-translation paths
  - ne plus exposer l'email des co-participants (PII)
  - respecter les prefs présence dans les listes (Lot 5)
  - drop dead-on-read maintenance of cursor.unreadCount (iter 57 / F23c)
  - mock createUnifiedAuthMiddleware in profile-extended tests
  - retry transient push failures + stop deactivating tokens on provider outages
  - scope push notification collapse-id per-conversation (#1140)
  - respecter les prefs privacy dans presence:snapshot (Lot 2, E1)
  - mock createUnifiedAuthMiddleware in profile.test (unblock CI)
  - ne pas divulguer la présence des membres via /links (Lot 2, E2)
  - retire la présence des payloads friend-requests (Lot 4)
  - typage viewer dans /users/search (authContext cast)
  - unifier la résolution d'avatar participant + corriger notSeenBy (iter 47)
  - gate présence dans /users/search (Lot 4)
  - batch resolveForTargets + gate /users/presence (Lot 2)
  - mock createUnifiedAuthMiddleware in profile.test.ts (unblock CI)
  - gate présence sur les lookups email/phone/id dédiés (Lot 3 fin)
  - gate présence sur la fiche profil (Lot 3/6)
  - PresenceVisibilityService (Lot 1/6 présence)
  - unread-count batch must exclude each participant's own messages (iter 46 / F23b)
  - collapse per-message unread counts to a single query (iter 45 / F23) (#1134)
  - calibrate coverageThreshold to CI-bun baseline (~9.5pp below local-node)
  - batch unread counts in one read (F23, iter 45)
  - pin espnet==202412 — 202511 exige numpy>=2.0 et casse le build Docker
  - emoji extraction stripped CJK/Kana/Hangul, leaving CJK text untranslated (#1625)
  - pin pytest back to 8.3.4 — pytest-asyncio 0.25.2 requires pytest<9
  - deduplicate in-flight tasks — gateway retries no longer self-strangle long texts
  - repair stale outer-exception test in translation_processor
  - stop dividing torch threads by async worker count — inference ran 2× slow
  - sequential language fan-out — budgets now cover real inference time
  - proportional inference budget — long texts are translated again
  - boot import failure no longer permanently kills the audio pipeline
  - pin floating ML deps to stop non-deterministic Docker build breaks
  - sync uv.lock project version (unblock Test Python CI)
  - restore numpy<1.24 ESPnet constraint (revert breaking Dependabot #825)
  - import ESM avec extension .js + test-garde des imports relatifs
  - add .js extension to mention-parser import — prod gateway crash-loop
  - helper pur resolvePresenceVisibility (Lot 1/6 présence)

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.5.0

## 1.5.0

### Minor Changes

- Changements automatiques détectés :

  - reply-count pills — pure ReplyThreads SSOT (#1684)
  - fix WebRTC task isolation races, dead analytics field, ObservedObject re-subscription (#1665)
  - getUserLanguagePreferences injects deviceLocale — parity with display resolution (iter 143) (#1666)
  - synchronise la présence du profil avec la liste de conversations (#1664)
  - UA detection — specific platform swallowed by generic token (iter 142) (#1662)
  - who-reacted breakdown sheet — pure ReactionBreakdown SSOT (#1663)
  - overnight DND morning tail bound to window start day (iter 141) (#1661)
  - fix hover-prefetch cache key mismatch crashing on new message
  - web rejoin race + signaling leak, gateway zombie-socket scoping + DND bypass (#1660)
  - idempotent attachment:reaction — no re-broadcast on a no-op add/remove (iter 141) (#1659)
  - pure ConversationSections SSOT — pinned/others split, no phantom empty section (#1657)
  - snapToScale honors octave wrap — auto-tune no longer mis-snaps B (iter 139) (#1656)
  - formatFileSize rolls Ko→Mo — no more "1024 Ko" (iter 138) (#1655)
  - clicksByHour in UTC — coherent with clicksByDate (iter 137) (#1654)
  - gateway call-lifecycle fanout hardening + iOS accessibility/HIG fixes (#1653)
  - FIFO drain order — a memory-fallback edit no longer replays before its Redis-backed new (iter 136) (#1652)
  - discard-draft affordance (§B draft lifecycle) (#1651)
  - locationCount never incremented on the live path — count by messageType like recompute (iter 135) (#1650)
  - dropped ICE restart never recovered when a renegotiation was already in flight (web) (#1649)
  - idempotent reaction:add — no re-broadcast/re-notify on a no-op re-react (iter 134) (#1648)
  - iconified empty-state card (iOS parity §B) (#1647)
  - aggregate packet loss across all inbound streams (iter 133) (#1646)
  - orphan-recovery gaps, duration anchor drift, dead push, quality-monitor loop, banner re-arm (#1645)
  - email fragments no longer linkified/extracted as mentions — unify SSOT left boundary (iter 132) (#1644)
  - pure empty-state decision (iOS parity §B) (#1643)
  - quality-first dedup — a newer basic no longer downgrades a premium (iter 129) (#1640)
  - "End &amp; Answer" never answered the waiting call + third caller silently dropped (#1639)
  - draft-aware ordering + draft row preview (iOS parity §B) (#1638)
  - message-list route ignored frozen receipts, under-counting delivered/read vs read-status endpoints (#1637)
  - bouton 'voir la conversation' sur l'ecran d'appel (minimise + ouvre le DM)
  - minimiser l'appel en pilule flottante (voir la conversation pendant l'appel)
  - call:end recovery bypassed the wide fanout + web never sent call:heartbeat (#1636)
  - clamp truncateFilename output for maxLength &lt; 4 (iter 128) (#1635)
  - faire aboutir l'appel SORTANT Android (peerId du joiner)
  - fermer automatiquement l'ecran d'appel termine
  - persist reply reference with draft (iOS DraftStore parity) (#1633)
  - scope anonymous membership check to the target conversation (#1634)
  - missed-call notification skipped on force-end cleanup + dead field names in adaptive degradation (#1631)
  - per-conversation text draft auto-save/restore (iOS parity) (#1630)
  - batch read-statuses ignored frozen receipts, under-counting vs single-message endpoint (#1629)
  - faire aboutir l'appel entrant WebRTC (join-with-ACK + to-field)
  - demander la permission micro/camera au runtime avant le media
  - disconnect-grace missed calls never notified + stale perfect-negotiation state on rejoin (#1627)
  - extract preprocessContent to a pure module so its test guards production (iter 126) (#1628)
  - anonymous socket joins ROOMS.user room so unread badge updates live (#1626)
  - importer le media WebRTC P1-P4 (moteur + coordinateur + video)
  - faire sonner l'appel entrant au niveau app (offer socket foreground)
  - filter STT alternatives by region, drop tautology + var shadowing (#1620)
  - EMOJI_PATTERN range swallowed CJK/Kana/Hangul (#1622)
  - split delete into "for everyone" vs "for me" (iOS parity) (#1624)
  - sync reels cache on post edit/delete (socket + optimistic) (#1615)
  - extract normalizeMarkdown to a pure module so its test guards production (#1621)
  - version-bump gap in initiateCall cleanup + web quality-report never emitted (#1606)
  - release dedup key on failure so retries aren't swallowed (#1608)
  - unify sanitizer dangerous-key guard, close sanitizeMongoQuery prototype-pollution gap (#1605)
  - key message-translation cache by preferred language (iter 124) (#1613)
  - NLLB language-map coverage, uppercase URL scheme, group senderName SSOT (#1602)
  - is_list_item bullet class was an unintended char range (#1593)
  - deliver notification:new to the right room + close anon typing/reaction cross-conversation gap (#1588)
  - stop duplicate message:new re-broadcast on sequential retry + linkify mixed-case mentions (#1592)
  - render a live sub-minute countdown as 1m, not 0m (#1590)
  - call banner swipe-to-collapse bubble (#1618)
  - header typing-avatar chips (stacked + overflow) (#1616)
  - evict sockets from call room on GC force-end (#1601)
  - remove duplicate/false typing:stop on multi-device disconnect (#1617)
  - correct destructured prop name in DraggableParticipantOverlay (#1597)
  - callee accepting an audio-only call no longer activates camera/transmits video (#1614)
  - callee accepting an audio-only call no longer activates camera/transmits video
  - enforce the 2-hour message-edit window (#1612)
  - resolve mixed-case @mentions via OR+equals, not case-broken `in` (#1611)
  - header-level typing indicator + group member subtitle (#1607)
  - declarer les permissions media appels (RECORD_AUDIO/CAMERA)
  - nom de conv/appel direct = autre participant, pas soi
  - Reels P6 — boutons flottants alignes iOS (+ Contacts au radial)
  - recharger sur erreur de chunk perime attrapee par ErrorBoundary
  - Reels P5 — reels dans le Feed (carte + lancement gate)
  - Reels P4 — route nav + lancement Feed + item radial
  - Reels P3 — module :feature:reels + ViewModel + ecran vertical
  - Reels P2 — Media3 + atome ReelVideoSurface
  - Reels P1 — API getReels + repo + plan de portage
  - habillage Profile (MeeshyBackground gradient + tokens)
  - retirer la deconnexion de la vue principale (reste dans Reglages)
  - route notification:new to ROOMS.user, not raw userId (#1604)
  - polish — habillage Contacts (gradient + tokens)
  - polish — habillage Calls (MeeshyBackground gradient)
  - fold typing roster into scroll-to-bottom control (#1603)
  - Option A — retrait bottom nav -> MeeshyMenuFab radial
  - keyed typing-participants roster + label SSOT (#1599)
  - P2-S2 Chat increment 1 — fond gradient + app bar transparent
  - P2-S3 Feed habillage glass + formateur date partage
  - P2-S5 Notifications — timestamp ISO -> label localise
  - hydrater currentUser au boot (me() renvoie {user}, pas MeeshyUser)
  - P2-S4 Reglages — icones colorees de section + tokens
  - P2-S4 habillage Reglages (MeeshyBackground + chrome transparent)
  - enforce read⇒delivered in markMessagesAsRead
  - P2-S1 barre de recherche glass en bas (parite iOS)
  - P2-S1 retirer les chips filtres Material (parite iOS)
  - mapper userPreferences (debloque pin/mute/archive/customName)
  - P2-S1 sections repliables liste conv (CollapsibleSection)
  - P2-S1 resoudre le nom des conversations directes
  - P2-S1 habillage liste conv (MeeshyBackground+glass+grand titre)
  - GC missed-call notifications, force-leave timer cleanup, web offer/TURN-refresh gaps (#1594)
  - swipe-to-reply gesture with rubber-band commit core (#1595)
  - scroll-to-bottom control with unread badge + preview (#1591)
  - all-or-nothing group delivery semantics for own-message checks (#1587)
  - tap a quoted-reply preview to scroll to the original (#1584)
  - P1-8 MeeshyToast (feedback pill + notification card)
  - P1-7 MeeshyMenuFab (menu radial iOS = stack vertical staggere)
  - P1-7 FloatingGradientFab (FAB gradient corail/indigo)
  - P1-6 CollapsibleSection (sections repliables liste conv)
  - P1-5 MeeshyAvatar v2 (ring/presence/mood + fill gradient)
  - apiCall degrade sur reponse malformee au lieu de crasher
  - degrade SerializationException to a PARSE failure instead of crashing
  - affiliate relations no longer leak presence to non-friends
  - call:join never acked failures (gateway+web) + 2 P2034 gaps in CallService
  - use RFC 7232 §3.2 weak comparison for If-None-Match
  - gate cached translation path with conversation-membership check
  - chat @-mention autocomplete + roster display-name resolution
  - repair phantom-ringing fanout gap + call teardown edge cases
  - dedup on the resolved message id, not the constant "latest"
  - in-conversation message search + search-highlight wiring
  - restore F84 load-more offset fix reverted by a stale merge
  - P0-4 primitives chrome glass + habillage pilote Notifications
  - P0-3 typographie rounded Nunito (substitut SF Pro Rounded)
  - P0-2 ColorScheme Material complet indigo (zero surface grise)
  - improve iOS quality, accessibility and fix CI flakiness
  - restore web P0 initiator UI + check-active replay + transient-error whitelist silently dropped by 8ebd497b, absorb PR #1558's boot-floor/race fixes
  - converge getParticipantDisplayName to canonical name resolver
  - P0-1 verrouiller les design tokens sur la parite iOS
  - count text messages by messageType in incremental path to match recompute (F85)
  - rich-text rendering (markdown/mentions/m+/URL/highlight) (#1571)
  - bound participantId cache + reset typing throttle on stop
  - \_segment_text no longer drops a short sentence before a huge one (F85)
  - restore ~450 lines of call-safety fixes silently reverted by 8ebd497b
  - honest all-or-nothing delivery indicator (DeliveryStatusResolver) (#1568)
  - serialize per-user \_seq emission to guarantee ordering
  - message-effects lifecycle (ephemeral/blurred/view-once) (#1562)
  - authoritative groupBy recompute for post/comment reactionSummary (F84c)
  - improve iOS app quality, accessibility, and reliability
  - remove 7 dead Localizable.xcstrings keys surfaced by the merge
  - clear typing throttle on typing:stop so the next start re-emits
  - hasMentions no longer flags email addresses as mentions
  - harden message reaction summary (tx + authoritative count + P2002 idempotency)
  - use canonical display-name SSOT in V2 conversation-list transform (F84)
  - load-more advances offset instead of refetching page 1 forever (F84)
  - boot-floor gap in phantom-cleanup + web initiator race/dead-timeout regressions
  - first/last-name fields in the profile editor (§K) (#1556)
  - stop scroll ticks re-rendering the whole list body
  - cap list previews at 300 graphemes, add ScrollOffsetRelay, make mood-badge pulse idempotent
  - comprehensive UX/UI quality and accessibility improvements
  - forward message language to conversation stats so languageDistribution stops freezing (F84)
  - regional (content) language preference (§L) (#1530)
  - apply query filters to status-breakdown groupBy in getAffiliateStats (F83)
  - offline-queued notification-preference backend sync (§L) (#1526)
  - fold participant-scoped counts to users so leaderboards stop duplicating/hiding users (F82)
  - stop stripping ZWNJ/ZWJ — preserve emoji, Persian & Indic text (F82)
  - web initiator never entered its own call + gateway phantom-cleanup killed live cross-conversation calls
  - per-event notification type toggles (§L)
  - DND quiet-hours schedule editor (§L) (#1517)
  - remove dead NOTIFICATION socket event + fix broken Prisma import (F77)
  - honor failureWindowMs so isolated failures no longer trip the breaker (F77)
  - validate E.164 by digit count, not prefixed string length (F80)
  - guard CallsViewModel.loadCalls() against stale-filter races
  - durable notification master toggles (§L) (#1512)
  - honor bidirectional blocking on typing indicators
  - persisted interface language (settings-interface-language) (#1508)
  - close concurrent-call and cross-call correctness gaps in WebRTC/CallKit stack
  - auto-detect Spanish UI language — es was missing from detectBestInterfaceLanguage (F79)
  - clear stale typing indicators on ConversationSocketHandler teardown
  - persisted light/dark/system theme (settings-theme-mode) (#1504)
  - isUrlOnly no longer absorbs CJK/Thai text glued to a URL (F76)
  - web never replayed a missed ringing call on reconnect + rate-limit call:check-active
  - getEmailValidationError agrees with isValidEmail (F73)
  - remove dead voice-effects audio pipeline
  - phantom-ringing callees now get the call_cancel push from GC tier 1 too
  - optimistic + offline profile edit incl. content languages (§K) (#1500)
  - reactionSummary self-heals from authoritative Reaction rows
  - durable Room cache for the profile stats/timeline dashboard (§K) (#1496)
  - capitalize hyphenated/apostrophe names + strip CR from displayName (F72)
  - stop toasting transient call:error codes iOS already treats as non-fatal
  - clear qualityDegradedStreaks on GC-forced call end too
  - community pin/mute/archive/hide no longer stale across devices (F71)
  - relay real error code on call:toggle-audio/video failure
  - renegotiate video SDP direction on CallKit hold/unhold
  - chip release during active edge auto-scroll no longer drops
  - getInitials emits broken half-surrogate for emoji names (F68)
  - profile 30-day activity timeline sparkline (§K)
  - make calendarDayDiff DST-immune (F67)
  - guard setAudioEffect against a dead capture-hook collision risk
  - real-time presence broadcast bypassed blocking check
  - stats projection SSOT + read-only dashboard section (#1489)
  - reapply AVAudioSession mode on A/V switch, track cumulative reconnect count
  - terminal-write protocol for orphaned sessions, rate-limit backgrounded/foregrounded, sweep quality-streak leak
  - stop truncateFilename overflow + formatCompactNumber "1000.0K" boundary (F65/F66)
  - unconditional VoIP registration, dark-chrome text contrast, defensive audio unwraps (#1484)
  - extract shared CallTypeBadgeView, drop unreachable a11y label (#1476)
  - treat Mongo P2034 write-conflict as retryable on endCall/leaveCall too (#1480)
  - stop orphaning offline messages after a Redis blip, bound participantId cache
  - secondary identity rows — languages · country · timezone
  - dual-emit message:read-status-updated alongside legacy event
  - profile-header enrichment — presence · completion ring · E2EE · member-since (#1482)
  - support hyphenated usernames end-to-end via MENTION_HANDLE_CHARS SSOT (F60)
  - derive worker drain lanes from a kind→lane SSOT (#1478)
  - make post/comment reaction removal idempotent
  - header title follows displayName like the list row
  - normalize language-code case at all write/read boundaries (F63/F64)
  - close duplicate-reaction race in AttachmentReactionService
  - three-state presence dot on friend rows (#1474)
  - text tool — centered editing, 6 new fonts, visible weights, diamond/cloud/speech frames
  - ship customName (and unstrip reaction) in the list payload
  - socket conversation:updated no longer clobbers DM display names
  - resolveUserLanguage lowercases in-app prefs — case parity with resolveUserLanguagesOrdered (F62)
  - stop CallView defaulting callManager to CallManager.shared (P1-16)
  - @username fallback uses the module's Unicode boundary, not ASCII (#1464)
  - per-filter chip counts on the Contacts list (#1470)
  - drop the chip on Épingles to pin the conversation
  - bump CallSession.version on all terminal writers
  - comment_reaction honors commentLikeEnabled, no opt-out bypass (F59)
  - durable Room cache for Discover suggestions cold-start paint (#1466)
  - stop stale offline broadcast on anonymous reconnect race
  - comment-reaction carries the real postType, no REEL/STATUS collapse (F58)
  - edge auto-scroll while dragging the chip (Phase 3)
  - auto-scroll aux bords pendant le drag de chip (Phase 3 long-press)
  - STUN-only fallback no longer strands calls without TURN
  - friends Room cache for cold-start paint (#1461)
  - the card sits flush under the expiry line — top vertical alignment (C-DIR5)
  - media load failures speak up (C16, targeted audit 4)
  - empty texts are purged when inline editing ends (C15, targeted audit 3)
  - VoiceOver speaks the UI's language on the chrome (C14, targeted audit 1)
  - gradient backgrounds end-to-end — format, three renderers, palette row (C11)
  - trim redundant comments that overflowed a byte-bounded test window
  - complete fr/en/es/de coverage for all 108 story.\* keys (C12)
  - unbreak pre-existing structural/behavioral CI tests
  - discreet undo/redo — header icons exist only when the trajectory allows (C9 inc.4+5)
  - hasMentions Unicode-aware — detect accented @DisplayName (F57)
  - global undo/redo apply snapshots; media purge becomes lazy (C9 inc.3)
  - close camera-state race, guard doomed CallKit transactions, drop dead code
  - durable offline friend-request send with cmid idempotency (#1458)
  - global undo capture — one debounced trigger, gap-free by construction (C9 inc.2)
  - HistoryStore — pure state stack for global undo (C9 inc.1)
  - carded canvas no longer reserves the hidden header, viewport zoom resets on carding (C-DIR4 bug 4)
  - hung-participant detector in call-reliability-report
  - letterbox takes the slide background colour in full-chrome (C-DIR4 bug 2)
  - letterbox du canvas 9:16 aux couleurs du fond du slide en présentation libre (BUG-2 C-DIR4)
  - background colour applies instantly + draft resume no longer restores an empty composer (C-DIR4 bugs 1&3)
  - stickers get a single source of truth — currentEffects passthrough (C13)
  - self-heal playback when the primary player is stuck .paused (C-DIR3)
  - reword close() comment so it doesn't self-match the new test
  - flush pending DataChannel bye before peer connection teardown
  - unified chrome — header follows the FABs, collapsed-band handle removed (C-DIR2 b/c/d)
  - stickers are reachable again — picker wired into the Text panel (C8)
  - nonisolated data-channel value types — unbreak CallSignalIndicatorTests compile
  - durable offline block/unblock via the outbox (block-outbox-durable)
  - the add-story badge no longer gets clipped (user report)
  - ghost handle to recover hidden chrome (C3)
  - unbreak main build — register CallSignalGlyph.swift in pbxproj, hoist typealias out of ViewBuilder body
  - slide opening effect reachable by gesture from the Fond panel — VM-owned state (C1)
  - the Transitions sheet becomes real — slide opening-effect picker (C7)
  - transient quality pills, color-coded signal glyph, WhatsApp-style banner, instant remote hangup
  - add-slide affordance at the end of the slide strip (C6)
  - gesture exit for viewport zoom — double-tap resets, near-identity pinch snaps to 1.0 (C4)
  - exécution phasée — le run se termine connecté au compte de test
  - timeline FAB/tile/swipe-up open the timeline sheet instead of an empty band panel (C5)
  - sync reels affinity caches on post edit/delete (F55)
  - cache-first Discover suggestions (empty-query) (#1451)
  - single-flight SUB receive + silence watchdog — translation return channel self-heals
  - map Mongo P2034 write conflict on join to the existing conflict-retry path
  - Dynamic Type for MentionSuggestionPanel (139i)
  - background URLs are allow-listed — no more viewer IP-leak (W7)
  - hard-delete no longer orphans media rows forever (G7)
  - single canonical visibility filter (G5)
  - reaction self-echo no longer double-counts likeCount (F56)
  - zoom transition on secondary surfaces (U1 inc.2)
  - zoom transition from tray bubble to viewer on iOS 18+ (U1 inc.1)
  - stop logging DTMF digits and transcript content
  - EXCEPT/ONLY can no longer publish without an audience (W6)
  - Blocked-users tab + BlockCache SSOT binding the resolver seam (#1446)
  - EXCEPT/ONLY audience picker in the story composer (W3 inc.2)
  - COMMUNITY visibility in the story composer + visibilityUserIds plumbing (W3 inc.1)
  - intra-slide crossfades render in the web viewer (W1 inc.4)
  - intra-slide crossfades finally render at playback (R14)
  - Dynamic Type for KeypadTab (138i)
  - local mutations persist through the dirty-flush path (R12 inc.2)
  - silent refresh consumes the G1 delta-sync (R8 inc.1)
  - Discover live user-search with inline connect (#1443)
  - keyset cursor pagination on the stories tray (G1c)
  - lean tray projection on GET /posts/feed/stories (G1b)
  - undo/redo history survives a hard crash (E4 inc.2)
  - Dynamic Type for MessageListView swipe indicator (136i)
  - remove dead FirebaseNotificationService FCM sender (F51)
  - unit-fetch out-of-tray stories by postId on deep link (R4 inc.2)
  - Dynamic Type for SyncPill (135i)
  - close duplicate-reaction race with atomic upsert
  - forward real postType + ephemeral context on socket reaction notifications
  - hop CXPlayDTMFCallAction to MainActor; tie TURN TTL to CallCleanupService
  - online-first friends list + cross-screen cache reconciliation (#1434)
  - guard mark-unread cursor rewind against a fresher concurrent read
  - friendship & relationship-state SSOT (#1431)
  - remove dead handleIncomingOffer, dedupe call-notice presentation logic
  - exclude source language from story caption translation targets
  - the draft-resume card replaces the bare text alert (U4 increment 2)
  - DraftResumeCard building block (U4 increment 1)
  - Dynamic Type + a11y for AchievementBadgeView (134i)
  - regenerate pbxproj — drop phantom AudioEffectsPanel.swift reference
  - viewedAt timestamp alongside isViewed — soft migration (R11)
  - replay message edits/deletes to offline recipients too
  - VoiceOver custom actions for prev/next story navigation (U6 increment 2)
  - VoiceOver announces slide changes in the reader (U6 increment 1)
  - preload the next slide's media (W5)
  - live story deletion and per-text-object translation merge (W4)
  - legacy story content resolves over the full language chain (R10)
  - fix two self-inflicted test assertions from the previous commit
  - client expiry fallback aligned with the server's 21h (G6)
  - read overlay text from canonical `text`, not legacy `content`
  - CXAnswerCallAction hold + system-PiP frozen-frame placeholder
  - key typing-indicator roster by userId, not display name
  - adaptive video-sender-cap plan (network + thermal) (#1417)
  - haptic ticks on slide change and buffering freeze/resume (U2)
  - live translation + delete on the feed realtime hook (W4)
  - stop leaking CallParticipant.analytics on active-call route
  - enqueue offline recipients on the WS message:send path too
  - foreground media-object keyframes animate too (W1 increment 2)
  - text-object keyframes animate in the web reader (W1 increment 1)
  - auto-advance timer freezes while the primary video buffers (W2)
  - textObjects translate to the audience's real languages (G3)
  - single translation pipeline for story content (G2)
  - identity-aware active-call teardown (#1415)
  - encrypt the stories tray store like every other social store (R9)
  - logout purges the story draft AND the persisted publish queue (E9)
  - actually run the legacy offline-queue migration at boot (E6)
  - the queue cleans up its media copies (E10 disk leak)
  - last-message preview excludes soft-deleted messages
  - screen-capture participant spoofing, pocket-dial, HIG hit targets, stale-peer cleanup
  - sniff the URL extension before routing media to disk stores (R7)
  - story view receipts are durable via the outbox (R6)
  - chip drop moves the conversation onto a section header
  - delta-sync via ?updatedSince on the stories tray (G1)
  - debounce the sending clock glyph for sub-200ms sends (B.4)
  - write-ahead makes the online publish survive process kills (E5)
  - undo/redo history survives the timeline sheet lifecycle (E4)
  - flush the open timeline into the slide before persisting (E3)
  - deep-link container serves the cached tray before forcing network (R4)
  - identity interstitial between story groups (user directive)
  - call-reliability-report — prod health report for the multi-hour calls goal
  - periodic in_progress analytics snapshots survive app kills
  - update two source-guard tests for the TURN-refresh watchdog refactor
  - split press-state detector from long-press trigger
  - discreet buffering indicator during mid-slide stalls (R3)
  - propagate deviceLocale to the last 2 resolveUserLanguage sites
  - freeze timeline while the bg image bitmap is still loading (R2)
  - debounced draft autosave — editing survives hard crashes (E1)
  - retry TURN refresh on dropped ACK, surface busy/failure feedback, finish a11y hints
  - DM dedup reopens the most recently ACTIVE duplicate
  - auto-dismiss call-waiting banner on remote end (#1411)
  - buildEffects no longer wipes timeline-authored fields (E2)
  - pin viewed-story media until expiry (R5 wiring)
  - serialize updateOnNewMessage per conversation to stop a lost-update race
  - direct-DM creation is idempotent — reopen the existing DM
  - pinning exempts keys from DiskCacheStore eviction (R5)
  - amplify row scale animation dampingFraction for visible rebounce
  - freeze timeline while slide audio is still caching (R1)
  - Dynamic Type for MoodReplyConfirmationOverlay (132i)
  - persist end-of-call analytics on CallParticipant
  - Dynamic Type + a11y for MessageDetailSheet hero glyphs (131i)
  - apply URL-only translation guard on all 3 entry points
  - negotiationTimeMs separates WebRTC setup from human ring time
  - add negotiationTimeMs metric for WebRTC connection timing
  - Dynamic Type for ReelFeedCard glyphs (130i)
  - wire dead PiP rotation hook, fix VoiceOver double-read, fix Dynamic Type clipping
  - guard REST message-delete lastMessageAt with optimistic concurrency
  - re-anchor already-answered source-guard on the real subscriber
  - call_answered_elsewhere silent push — multi-device socketless ring dismissal
  - call-waiting banner for a second incoming call (#1403)
  - la liste de conversations scrolle à nouveau — retrait du DragGesture plein-ligne
  - call_cancel silent push ends phantom ringing (client side)
  - fan out sendToUser to device tokens in parallel
  - call_cancel background push kills phantom ringing on socketless devices
  - rate-limit reconnect/ICE-refresh handlers, remove dead signaling hook
  - quality-alert requires sustained degradation and excludes the reporter
  - remove unauthenticated-admin debug notification routes
  - quality-monitor warm-up gate fails closed when start date is nil
  - GC tier 3 spares multi-hour calls with fresh heartbeats
  - Dynamic Type + a11y for CameraView (129i)
  - re-wire MessageDraftMediaStore + 2 test files into pbxproj, purge warnings
  - useSocialSocket retries once the socket bootstraps
  - Dynamic Type for FeedPostCard action-bar glyphs (128i)
  - forward badge as android notificationCount (F1 Android)
  - keep the literal videoToggleTask?.cancel() call CI checks for
  - toggleVideo() can run two concurrent camera/transceiver actuations on rapid double-tap
  - GC force-end never fanned out call:ended to ringing callee's user room
  - typing:start/stop now require active conversation membership
  - WebRTC-plumbing outbound emits (call-webrtc-plumbing-emits) (#1393)
  - Dynamic Type for BubbleDeliveryCheck status glyphs (127i)
  - photothèque du composer — long press vidéo, actions Ajouter/Sélectionner/Éditer, présélection picker, Liquid Glass iOS 26 (#1389)
  - correct two false-positive assertions from prior commit
  - getReels curseur chronologique (lossless) + languageCodeSchema accepte les 639-3
  - CallEffectsOverlay ObservedObject re-subscription bug + a11y/dead-code cleanup
  - resync feed room + typing keepalive across reconnect/long sessions
  - badge unread embarqué dans le push — badge d'icône iOS et widget gelés app fermée (F1)
  - appel jamais décroché = missed (critère answeredAt) + garde FSM reconnecting
  - refactor conversation row long-press gesture with proper priority
  - fallback pendingCount cohérent avec pendingUIItems sur échec de lecture (item H cause D)
  - reclaim visibility-timeout des rows .inflight orphelines (item H)
  - les pièces jointes du brouillon survivent au kill (phase 2 — câblage)
  - store durable des pièces jointes de brouillon de message (phase 1)
  - Dynamic Type + VoiceOver for conversation composer (iter 126i)
  - pure video-survival auto-disable policy (#1387)
  - curseur getReplies aligné asc + codes langue 639-3 acceptés
  - call:ended atteint l'appelé qui sonne (fanout rooms user)
  - réaligne le garde AdjustBitrate sur le merge BWE gated + pbxproj regen
  - auto-save du brouillon au passage en background (D1)
  - auto-retry of failed messages now forwards clientMessageId
  - indicateur qualité fiable + écran d'appel décalé de 30pt
  - action « Enregistrer » dans le menu appui-long (composant unifié)
  - Dynamic Type + VoiceOver for AttachmentLoadingTile (iter 125i)
  - hooks onSaveRequested sur les viewers SDK + câblage du fullscreen média des bulles
  - report « downloaded » best-effort dans le coordinateur unifié (parité P7-9)
  - câbler audio + galerie média sur le composant unifié Enregistrer
  - Dynamic Type + VoiceOver for iPad panel header (iter 124i)
  - implement drag-to-reorder during long-press with smooth transition
  - correct offset windows and setEffect precondition in new tests
  - atomic conditional consume closes brute-force TOCTOU on SMS reset attempt caps
  - remplacement 1-réaction-par-user + gate messages système dans toggleReaction
  - adjust scale animation timing for smoother rebounce
  - sémantique de remplacement 1-réaction-par-user + gate messages système
  - resolve duplicate CallEffectsOverlayAccessibilityTests class
  - restore VideoConfig, actually used by P2PWebRTCClient
  - implement row scale animation reset on menu dismiss
  - thread-safety, dead code, and VoiceOver gaps in calling stack
  - add long-press scale animation to conversation rows
  - connection-quality classification core + live signal indicator (#1381)
  - type decodePayload's corrupt-payload error as MeeshyError
  - gate FRIENDS-visibility posts through buildVisibilityFilter
  - re-join call room on socket reconnect (production component)
  - idempotence du remove de réaction sur le chemin socket
  - DELETE de réaction idempotent (not-found → succès, pas 404)
  - pure telecom-connection policy (ConnectionService state reports) + reporter fold (#1377)
  - totalMembers exclut le sender par identité (pas -1 aveugle)
  - bootRecovery détecte aussi les fichiers média visuels manquants au crash
  - annuler un envoi média offline balaie ses fichiers (fuite disque)
  - pure call-audio policy (ringback/ringtone/cues) + tone controller fold (#1375)
  - le merge edit-into-send offline détruisait les médias en attente
  - dead-letter immédiat des rejets serveur 4xx permanents dans l'outbox
  - watermark conversation-list dérivé de l'horloge locale (R15b)
  - watermark de gap-recovery messages empoisonné par clock-skew (R15a)
  - SyncEngine A5.4 — resync notifications au reconnect (fenêtre aveugle)
  - SyncEngine A5.3 — resync notifications sur gap de séquence
  - SyncEngine A5.2 — hook gapDetected sur SyncSeqTracker
  - SyncEngine A5.1 — décodage \_seq + tracker de gap (bénéfice multi-device)
  - terminal statuses are immutable — leave/disconnect can no longer rewrite missed as completed
  - unify REST/socket CallService instance, harden markCallAsMissed, remove dead beacon fallback
  - report downloaded pour les documents (gap P7-9 P3 comblé)
  - enforce maxUses cap atomically (F47 TOCTOU)
  - BlockActionCoordinator — block/unblock durable pour les sites Views (R6-4 complet)
  - BlockedViewModel.unblock via l'outbox durable (R6-4 incr.2, 1/N sites)
  - primitive block optimiste + fix caveat swipe labels périmés (R6-4 incrément 1/2)
  - atomic increments for calibrateProfile counters (lost-update race)
  - release active-call claim on ringing-timeout missed + self-heal leaked claims
  - verrous + master PIN purgés au logout (P7-11, invariant 9)
  - ConversationLockManager logout hook — purge cross-account leak (P7-11)
  - close cap TOCTOU — reserve slot atomically before creating relation (F47)
  - réconciliation complète périodique — purge des conversations fantômes hard-supprimées (P7-10)
  - release active-call claim on missed-timeout, harden signaling authz, fix waiting-banner reject
  - propagate profile changes to conversation partners (USER_UPDATED)
  - une panne gateway ne consomme plus le budget de retries de l'outbox (P7-7)
  - le composer ne se verrouille plus pendant qu'un message est sur l'horloge ⏳
  - live in-call duration timer (slice call-duration-timer) (#1371)
  - purge du cache HTTP URLCache au logout (T15b-b, invariant 9)
  - C8 — dédup des sockets same-user au join (last join wins)
  - document Dynamic Type freeze doctrine for FeedView chrome (iter 123i)
  - tolerate GRDB Date round-trip noise in markEdited ordering guard
  - decode editedAt onto APIMessage (CI compile failure)
  - guard message:edited against out-of-order stale delivery
  - atomic increments in ConversationMessageStats edit/delete hooks (F48)
  - stop clearing ringing timeout on early-join; fix web duplicate-offer race
  - call:join ne désarme plus le ringing timer — l'answer SDP et les chemins terminaux le possèdent
  - Dynamic Type + VoiceOver for EmojiPickerSheet (iter 122i)
  - Dynamic Type for message context menu (iter 121i)
  - réconciliation call:end aussi sur ACK-échec (chaos-test 2)
  - joinCall transitionne vers RINGING — l'early-join du callee n'est pas un décrochage (item F matérialisé)
  - version-guard call-termination writes, align REST/socket end-call authorization
  - guard read/delivery cursors against out-of-order regression
  - deep-link a full-screen call push into the incoming-call screen
  - un appel sortant non décroché ne bascule plus en écran connecté 00:00 — garde FSM .reconnecting, horloge d'appel, bannières Dynamic Island, avatars duo + fond profil
  - hide decorative conversation backdrop from VoiceOver (iter 120i)
  - grâces disconnect affinées — extension si socket vivant, grâce courte pré-answer (chaos-tests prod)
  - guard stale ICE-restart/call-waiting async continuations
  - close lost-update race on message reaction summary
  - Dynamic Type + VoiceOver for message-bubble media grid (iter 119i)
  - route FCM call pushes to a full-screen incoming-call notification (#1354)
  - reconcile with concurrent session's merged fix, keep only the surviving bug
  - pre-existing CI failures — PiP filter button a11y hint, dead localization keys, stale auto-hide test
  - CallKit informé sur tout teardown .failed, TURN préservé sur End & Answer, bannière call-waiting nettoyée, indicateur signaling dégradé
  - iOS CallKit/TURN/banner triad + gateway endCall idempotency gap
  - un restart/blip ne tue plus un appel établi — ownership disconnect, réhydratation boot, hygiène timers
  - recover socket.io realtime delivery after reconnect_failed
  - réaligner 3 source-guards CallView hérités du merge main
  - exact @mention resolution — anchor Unicode name boundaries
  - pure incoming-call push decision core (#1347)
  - Dynamic Type + VoiceOver for ConversationView message-row affordances (iter 118i)
  - gateway audit follow-through — leftAt persistence, missing summary index, force-leave missed path, ICE rate limit
  - drop stale retranslation results (edit ordering race)
  - survive gateway restart — active P2P call no longer cut by signaling-socket drop
  - remove dead previewRouter + unify conversation preview width (deferred NITs)
  - dedup key must include messageId, not just conversation
  - appels — vidéo distante, join VoIP fiable, chrono CallKit, contrôles cadre
  - Dynamic Type in action menu + inert-modifier cleanup (deferred review)
  - call:missed contract + video layout on remote escalation
  - restore call metric glyphs and move call time bottom-right
  - contraste blanc-sur-verre en Light + a11y overlay (déférés revue)
  - dedicated Calls bottom-nav tab + re-dial gesture (calls-tab-nav) (#1340)
  - dismissContextMenu — purge asyncAfter annulable
  - bannière DM strippée sur la route LIST (schéma minimal)
  - remove dead activeCallSession() call breaking sdk-tests compile
  - close call:heartbeat authz gap to strict active-participant check
  - gate CallKit plateforme — le simulateur pilote l'appel in-app
  - add missing banner arg to APIConversationUser test fixture
  - Dynamic Type + VoiceOver for StoryViewerView canvas (iter 117i)
  - stale-broadcast ordering races + unbounded conversationId cache
  - remontee banniere de profil (DM) + boutons header conversation en glass
  - hide decorative onboarding backdrop from VoiceOver + Dynamic Type CTA (iter 116i)
  - evict VoIP dedup entry on CallKit report failure (busy path)
  - close initiateCall/joinCall TOCTOU races on concurrent starts
  - Dynamic Type doctrine for CallView control bar (iter 115i)
  - update stale transcription-segment tests for active-participant authz
  - Dynamic Type + VoiceOver for StoryExportShareSheet (iter 114i)
  - hide dead voice-effects panel (video filters only)
  - coalesce reconnect triggers, epoch half-open re-arm, TURN refresh at restart, stuck-muted fallback
  - raffinements apercu long-press conversation
  - redesign system call bubble — compact, direction-aware, timestamped
  - Dynamic Type + VoiceOver for OnboardingFlowView chrome (iter 113i)
  - close conversation-membership authz bypass on transcription-segment
  - thread real conversationId into outgoing call route (call-nav-conversation-thread)
  - apercu long-press conversation enrichi (banniere, avatar, actions, dernier message)
  - action Renommer dans le menu contextuel conversation
  - Dynamic Type + VoiceOver for OnboardingStepViews (iter 112i)
  - close membership-check bypass, post call-summary on every terminal path
  - restore reaction notifications on the socket path
  - bind the realtime socket to the auth session (realtime-session-coordinator) (#1321)
  - restore CallMediaConfig.swift — VideoConfig is a real prod dependency
  - scope Opus SDP munging to audio, enforce per-call authz, drop dead code
  - converge formatDuration onto shared formatClock (iter 74)
  - idempotent P2002 handling on message reaction add
  - zoom in/out sur l'overlay long-press conversation
  - Dynamic Type for StatusBubbleOverlay (iter 111i)
  - MessageMoreSheet en grille verre (Liquid Glass iOS 26)
  - Dynamic Type + VoiceOver for ReelsPlayerView (iter 110i)
  - fold CallSignalManager into CallViewModel (VM-fold)
  - restore conversation long-press menu (remove .onDrag conflict)
  - ACK-based call:initiate (emitInitiate + pure parser) (#1311)
  - custom conversation context menu (icons on iOS 26)
  - clear participant heartbeat on mid-call leave
  - preserve supported ISO 639-3 language codes in normalizeLanguageCode
  - add safety-net expiry for stuck remote typing indicators
  - converge local formatDuration onto shared formatClock
  - stop SDP-munging RED into audio offers/answers, use setCodecPreferences
  - typed FRIEND_REQUEST_NEW/ACCEPTED/REJECTED events
  - context-menu icons + story quit alert legibility
  - Dynamic Type + VoiceOver for StoryTrayView (iter 109i)
  - apply late/refreshed TURN credentials to a live peer connection
  - recent/missed-calls list UI (CallHistoryViewModel + screen) (#1304)
  - native-lean long-press menu (reactions + bubble + vertical list)
  - emit friend-request:cancelled so the other party's list syncs live
  - Dynamic Type for StoryViewerView sidebar/header (iter 108i)
  - resistant swipe on audio/video bubbles
  - route quick affordances to native MessageMoreSheet
  - menu longpress - new components + MessageDetailSheet decomposition
  - Dynamic Type + VoiceOver for FeedPostCard media (iter 107i)
  - Dynamic Type + VoiceOver for AudioEffectsPanel (iter 106i)
  - serialize camera switch, close stale peer connection, fix VoIP dedup eviction
  - VoiceOver labels for feed attachment remove buttons (iter 105i)
  - Dynamic Type + VoiceOver for AudioEffectsPanel (iter 105i)
  - Dynamic Type + VoiceOver for VideoFilterControlView (iter 105i)
  - Dynamic Type + VoiceOver for ShareLinksView (iter 104i)
  - VoiceOver labels for AudioFullscreenView icon-only controls (iter 103i)
  - supprime à nouveau le doublon d'import copyToClipboard (régression réintroduite) (#1291)
  - adopte la source unique copyToClipboard dans TwoFactorSettings (F30-f) (#1284)
  - Dynamic Type + VoiceOver for EditPostSheet (iter 100i)
  - Dynamic Type + VoiceOver for ConversationMediaGalleryView (iter 103i)
  - Dynamic Type + VoiceOver + content selection for LicensesView (iter 98i)
  - finish Dynamic Type + VoiceOver for LoginView (iter 102i)
  - resolve committed merge-conflict markers in routine uiux docs
  - Dynamic Type + VoiceOver for TrackingLinksView (iter 101i)
  - adopte la source unique copyToClipboard dans TwoFactorSettings (F30-f)
  - Dynamic Type + VoiceOver for CommunityLinkDetailView (iter 99i) (#1272)
  - supprime le doublon d'import copyToClipboard (régression merge parallèle) (#1266)
  - resolve committed conflict markers from triple 93i collision
  - Dynamic Type + VoiceOver + content copy for SupportView (iter 95i) (#1262)
  - remove duplicate copyToClipboard import introduced by main merge
  - call-history repository (REST + Room cache-first SWR)
  - Dynamic Type + VoiceOver for ConversationListView overlays (iter 94i)
  - remove duplicate copyToClipboard import breaking the build
  - source unique presse-papier pour les pages links — iter 70
  - Dynamic Type + VoiceOver for ForwardPickerSheet (iter 100i)
  - Dynamic Type for MessageOverlayMenu (iter 99i)
  - Dynamic Type + VoiceOver for UserStatsView (iter 98i)
  - copy diagnostics via long-press menu in AboutView (iter 98i)
  - remove duplicate accessibilityElement on AffiliateView stat card (iter 92i)
  - trim background-observer comment to fit CI's fixed-window source test
  - serialize hold/unhold video ops, fix glare-path state leak, GC race guard
  - update quality-report test for participant-gated persistCallStats
  - moderator-kick wrong-participant, quality-report authz gap, ringing-call CallKit gap
  - thread-safe audio effect counters, cache-first filter switch, a11y hint (#1257)
  - Dynamic Type + destructive-red token for EffectsPickerView (iter 87i)
  - source unique formatFileSize — iter 70
  - relocate stragglin docs, drop orphan MARK dividers
  - annule les vérifications de disponibilité obsolètes (AbortController) — iter 70
  - split StoryComposerView into view-builder extensions
  - Dynamic Type + VoiceOver for AddParticipantSheet (iter 97i)
  - pure call-journal model (CallRecord + CallDirection/CallMediaType) (#1254)
  - clôture F30 — unification presse-papiers via source unique (iter 70)
  - Dynamic Type + VoiceOver for NotificationSettingsView (iter 96i)
  - source unique de validation d'ObjectId MongoDB — iter 69 (#1251)
  - split StoryCanvasUIView into method extensions
  - split StoryComposerViewModel into method extensions
  - extract free top-level types into dedicated files
  - widen access private→internal on the 3 refactor targets
  - content selection + VoiceOver for TwoFactorSetupView (iter 95i)
  - converge conversation-share clipboard fallback on copyToClipboard (F30-d, iter 68)
  - Dynamic Type + VoiceOver for SharePickerView (iter 94i)
  - Dynamic Type + VoiceOver for AffiliateView (iter 94i)
  - Dynamic Type + VoiceOver for MemberManagementSection (iter 94i)
  - Dynamic Type for SharePickerView (iter 94i)
  - Dynamic Type for LocationPickerView (iter 93i)
  - Dynamic Type + VoiceOver for LocationPickerView (iter 93i)
  - converge partage conversation (fallback presse-papier) vers copyToClipboard (F30-d, iter 68)
  - Dynamic Type + VoiceOver for ConversationPreferencesTab (iter 93i)
  - CallSignalManager — inbound call:\* → SharedFlow<CallEvent> + outbound emit table (#1230)
  - render comment audio/media in feed preview + fix notification badge truncation
  - Dynamic Type + VoiceOver for AffiliateView (iter 92i)
  - Dynamic Type + VoiceOver for NewConversationView (iter 91i)
  - Dynamic Type + VoiceOver for CommunityLinksView (iter 91i)
  - Dynamic Type + VoiceOver AffiliateView (iter 91i)
  - Dynamic Type + VoiceOver for AffiliateView (iter 91i)
  - converge partage conversation vers copyToClipboard (F30-d)
  - Dynamic Type + VoiceOver for DataExportView (iter 91i)
  - stop audio-toggle self-echo, rate-limit transcription relay, reset PiP fps
  - Dynamic Type + VoiceOver DataExportView (iter 90i)
  - Dynamic Type for NewConversationView (iter 90i)
  - converge copie identifiant groupe vers copyToClipboard (F30-c)
  - Dynamic Type + VoiceOver for MagicLinkView (iter 90i)
  - converge partage feed/reel vers copyToClipboard (F30-b)
  - Dynamic Type + VoiceOver + palette for EffectsPickerView (iter 89i)
  - converge copie contenu/lien vers la source unique copyToClipboard (F30-a) (#1216)
  - Dynamic Type + i18n/render fixes for DeleteAccountView (iter 88i)
  - Dynamic Type + VoiceOver for DeleteAccountView (iter 88i)
  - Dynamic Type + VoiceOver for voice profile wizard (iter 87i)
  - remove duplicate getUserInitials import in u/[id] page
  - route legacy slide.mediaURL background via directURLIfAny (WS5.4a)
  - retire le code mort du filtre temps-reel Story
  - restaure isExpired reverté par le même merge parallèle — iter 64 (#1210)
  - retire le dead StoryFilteredLayer, extrait StoryFilterKind
  - notify peer on local SDP failure, drop dead emitCallEnd overload
  - Dynamic Type + VoiceOver for storage & auto-download settings (iter 83i)
  - retire les références orphelines ReplyThread du pbxproj
  - story par défaut en Contacts + filtres par média
  - restaure formatCompactNumber reverté par un merge parallèle — iter 63 (#1208)
  - inbound call:\* signalling event models + pure CallEvent mapper (#1207)
  - Dynamic Type + VoiceOver headers for AboutView (iter 86i)
  - restaure formatCompactNumber reverté par un merge parallèle — iter 63
  - source unique de la troncature de texte (truncate) — iter 62 (#1203)
  - VoiceOver selection semantics for the language picker (iter 85i)
  - Dynamic Type + VoiceOver for StarredMessagesView (iter 85i)
  - source unique du formatage de durée média (formatClock) — iter 62
  - corrections du review présence (conformité + decay)
  - source unique du compteur compact (formatCompactNumber) — iter 61 (#1201)
  - Dynamic Type + VoiceOver for EditProfileView (iter 84i)
  - source unique du prédicat d'expiration (isExpired) — iter 60 (#1199)
  - présence datée + colorée après le pseudo (fiche profil, Lot 6 iOS)
  - keep PR1157/PR1148 catalog-backed localization (fix dead keys)
  - Dynamic Type + i18n parity for legal screens (iter 83i)
  - unify sheet grabber affordance (iter 79i)
  - source unique du « temps restant avant expiration » — iter 59 (#1187)
  - Dynamic Type parity for call-screen inline glyphs (iter 79ib)
  - Dynamic Type for the feed attachment composer (iter 79i)
  - source unique du temps restant avant expiration — iter 59
  - restore contacts avatar initials to getUserInitials (iter 59, anti-régression F26c-c(b))
  - Dynamic Type for the fullscreen audio player (iter 82i)
  - complete ConversationSettingsView localization (iter 78i)
  - Dynamic Type for the active sessions screen (iter 82i)
  - source unique de la classification du temps relatif — iter 58 (#1177)
  - relay real toggle-media errors + unify CallService instance (RC-4)
  - RelativeTimeFormatter.lastSeenString (Lot 6 iOS)
  - localize ConversationLockSheet + VoiceOver/Dynamic Type (iter 81i)
  - source unique des initiales — profil public → getUserInitials (iter 58, F26c-c(c))
  - source unique des initiales — page profil app/u/[id] → getUserInitials (iter 58)
  - stop duplicate Socket.IO listener registration on reconnect-adjacent calls (iter 57)
  - source unique des initiales — famille contacts → getUserInitials — iter 57 (#1181)
  - import Combine in OfflineQueueTests (CI restore)
  - add missing import Combine to OfflineQueueTests (unblock sdk-tests CI)
  - CountryPicker VoiceOver labels + sheet grabber (iter 80i)
  - Dynamic Type for the feed post composer (iter 78i)
  - initiales admin/users → getUserInitials + fix(gateway/test) createUnifiedAuthMiddleware mock — iter 56 (#1170)
  - consolidate destructive/error/expired reds to MeeshyColors.error (iter 78i)
  - complete story-viewer localization catalog (iter 79i)
  - :feature:calls CallViewModel + minimal call screen (Calls slice) (#1169)
  - localize MessageOverlayMenu message menu (iter 78ib)
  - localize Router route/scene titles + deep-link error (iter 79i)
  - source unique des initiales — MemberSelectionStep → getUserInitials — iter 55 (#1167)
  - :feature:calls CallViewModel + minimal call screen (Calls slice)
  - Dynamic Type for the link preview card (iter 78i)
  - source unique des initiales — MemberSelectionStep → getUserInitials (iter 55)
  - tokenize semantic hardcoded colors to MeeshyColors (iter 78i)
  - supprime le module mort utils/user.ts (clôt le cluster getUserDisplayName) — iter 54 (#1163)
  - localize SharePickerView chrome strings (iter 77i) (#1162)
  - Dynamic Type ConversationDashboardView (iter 71i)
  - source unique du nom d'affichage (username-first → canonique) — iter 53 (#1161)
  - source unique du nom d'affichage (déjà displayName-first) — iter 52 (#1159)
  - Dynamic Type for the invite friends sheet (iter 76i)
  - source unique des initiales d'avatar (objet) — iter 51 (#1158)
  - localize message quick-action menu — iter 71i
  - source unique des initiales d'avatar (string) — iter 50 (#1156)
  - harden call signaling against payload spoofing + DoS
  - mark EmojiGridCategoryTests @MainActor (iter 71i)
  - Dynamic Type 2FA security flow (iter 71i)
  - pure call-lifecycle FSM (core:model) (#1153)
  - localize emoji-picker category VoiceOver labels (iter 71i)
  - source unique du nom d'affichage — copies locales (iter 50)
  - source unique du nom d'affichage utilisateur (iter 49) (#1147)
  - Dynamic Type for the voice profile management screen (iter 75i)
  - consolidate hardcoded hex tints to MeeshyColors tokens on Support/Report screens (iter 71i)
  - categorised + searchable sticker picker (#1135)
  - localize 6 hardcoded French VoiceOver labels/hints (iter 71i)
  - source unique de la validation d'email + dernière horloge inline (iter 48) (#1146)
  - Dynamic Type for the conversation dashboard (iter 74i)
  - unifier formatDuration sur le canonique formatClock (iter 47) (#1141)
  - hoist actor-isolated pendingCount() out of XCTAssert autoclosure
  - re-apply await-hoist in PendingStatusQueueTests (merge reverted 87f85d68d)
  - restore iOS work reverted by the PresenceVisibilityService merge (84fedd79)
  - remove orphaned ReplyThreadOverlay.swift (complete #1122 cluster removal)
  - présence colorée + datée sur la fiche profil (Lot 6 web)
  - grace period before treating a transient socket drop as call-leave (P0-7)
  - localize hardcoded French VoiceOver strings (iter 73i)
  - remove ReplyThreadOverlay.swift resurrected by a merge artifact (unblocks CI)
  - Dynamic Type for the feed comments sheet (iter 72i)
  - hoist await out of XCTAssert autoclosure (iter 71i unblock)
  - unifier formatFileSize sur la source canonique partagée (iter 46) (#1136)
  - wire invite-user-modal row aria-label to selection state
  - guard call-waiting pending-clear against newer overwrite (#1133)
  - remove dead ReplyThreadOverlay to unblock iOS compile (iter 71i)
  - Dynamic Type for the 2FA security flow (iter 71i)
  - hoist await out of XCTAssertEqual autoclosure in PendingStatusQueueTests
  - remove ReplyThreadOverlay.swift resurrected by a merge artifact
  - guard call-waiting pending-clear against newer overwrite
  - repair invite-modal result row broken by merge (unblocks CI)
  - two realtime correctness bugs — presence list leak + moderator-delete offline enqueue (iter 144) (#1685)
  - restore DELETE/PUT/PATCH in CORS preflight
  - cap lastMessage.content preview at 300 code points in GET /conversations
  - PATCH /messages/:messageId now broadcasts message:edited and retranslates
  - join rooms before marking socket connected to close message-loss race
  - close TOCTOU race that could resurrect a deleted message with edited content
  - close TOCTOU race that could regress the delivered/read cursor
  - dedup offline delivery queue by messageId+eventType, not messageId alone
  - SyncEngine A3.2 — pagination cursor keyset composite /sync
  - SyncEngine A2.1 — emitWithSeq sur notification:new (event pilote \_seq)
  - SyncEngine A3.1 — endpoint /sync read-only, collection messages
  - SyncEngine A1 — UserEventSeq + SequenceService.nextSeq atomique
  - sliding window des sessions trusted — champ lastActivityAt (P7-3)
  - recordView — catch P2002 différencié + log des pannes réelles (P7-2)
  - AgentAdminRelay ne démarrait jamais — connect() avant subscribe()
  - harden two lost-update/out-of-order races on shared counter & cursor
  - unify 5 bounded-cache copies into a single BoundedTtlCache SSOT
  - bound participant-lookup cache (FIFO 5000 + expired sweep)
  - appels tués à tort — garde socket-zombie + sémantique leftAt (C5, 14 sites)
  - bound resolveConversationId identifier→ObjectId cache (FIFO 2000)
  - endCall() resolves pre-answer hangups as missed, not completed
  - claim activeCallId — matcher aussi les documents sans le champ
  - bound StatusHandler identityCache to stop unbounded typing-path growth
  - unify timeout via withTimeout helper, fix leaked timers
  - memoize participantLookup to cut per-message DB round-trip (B.3)
  - keep attachments on message:edit realtime broadcast
  - resolve Participant.id before handleMessage in agent + non-blocking-translation paths
  - ne plus exposer l'email des co-participants (PII)
  - respecter les prefs présence dans les listes (Lot 5)
  - drop dead-on-read maintenance of cursor.unreadCount (iter 57 / F23c)
  - mock createUnifiedAuthMiddleware in profile-extended tests
  - retry transient push failures + stop deactivating tokens on provider outages
  - scope push notification collapse-id per-conversation (#1140)
  - respecter les prefs privacy dans presence:snapshot (Lot 2, E1)
  - mock createUnifiedAuthMiddleware in profile.test (unblock CI)
  - ne pas divulguer la présence des membres via /links (Lot 2, E2)
  - retire la présence des payloads friend-requests (Lot 4)
  - typage viewer dans /users/search (authContext cast)
  - unifier la résolution d'avatar participant + corriger notSeenBy (iter 47)
  - gate présence dans /users/search (Lot 4)
  - batch resolveForTargets + gate /users/presence (Lot 2)
  - mock createUnifiedAuthMiddleware in profile.test.ts (unblock CI)
  - gate présence sur les lookups email/phone/id dédiés (Lot 3 fin)
  - gate présence sur la fiche profil (Lot 3/6)
  - PresenceVisibilityService (Lot 1/6 présence)
  - unread-count batch must exclude each participant's own messages (iter 46 / F23b)
  - collapse per-message unread counts to a single query (iter 45 / F23) (#1134)
  - calibrate coverageThreshold to CI-bun baseline (~9.5pp below local-node)
  - batch unread counts in one read (F23, iter 45)
  - pin espnet==202412 — 202511 exige numpy>=2.0 et casse le build Docker
  - emoji extraction stripped CJK/Kana/Hangul, leaving CJK text untranslated (#1625)
  - pin pytest back to 8.3.4 — pytest-asyncio 0.25.2 requires pytest<9
  - deduplicate in-flight tasks — gateway retries no longer self-strangle long texts
  - repair stale outer-exception test in translation_processor
  - stop dividing torch threads by async worker count — inference ran 2× slow
  - sequential language fan-out — budgets now cover real inference time
  - proportional inference budget — long texts are translated again
  - boot import failure no longer permanently kills the audio pipeline
  - pin floating ML deps to stop non-deterministic Docker build breaks
  - sync uv.lock project version (unblock Test Python CI)
  - restore numpy<1.24 ESPnet constraint (revert breaking Dependabot #825)
  - import ESM avec extension .js + test-garde des imports relatifs
  - add .js extension to mention-parser import — prod gateway crash-loop
  - helper pur resolvePresenceVisibility (Lot 1/6 présence)

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.4.0

## 1.4.1

### Patch Changes

- 46e625c: fix(realtime): bound the participant-id cache and reset the typing throttle on stop

  Two correctness/reliability fixes in the Socket.IO realtime handlers:

  - **`MessageHandler.participantIdCache` was an unbounded `Map`.** Its 5-minute TTL was only ever checked lazily on read, so a one-shot `(user, conversation)` sender that never sends in that conversation again — and never leaves it — left an entry that was never read again and therefore never evicted. On a long-lived gateway the map grew by one entry for every distinct `(user, conversation)` pair that has ever sent a message: steady, unbounded heap growth. It now uses the shared `BoundedTtlCache` (hard size cap + lazy/bulk TTL eviction), matching `StatusHandler.identityCache`, so memory is bounded regardless of read patterns.

  - **`typing:stop` did not reset the `typing:start` throttle.** `handleTypingStart` throttles re-emits to once per 2s per `(user, conversation)`; `handleTypingStop` cleared the tracking but left the throttle timestamp in place. A user who paused (client sends `typing:stop`) and resumed typing inside the 2s window had the new `typing:start` swallowed, so peers saw no indicator even though the user was actively typing. `handleTypingStop` now clears the throttle entry so a restart begins a fresh burst and emits immediately.

  Also adds `BoundedTtlCache.keys()` for prefix-scoped invalidation.

## 1.4.0

### Minor Changes

- Changements automatiques détectés :

  - improve iOS quality, accessibility and fix CI flakiness
  - rich-text rendering (markdown/mentions/m+/URL/highlight) (#1571)
  - restore ~450 lines of call-safety fixes silently reverted by 8ebd497b
  - honest all-or-nothing delivery indicator (DeliveryStatusResolver) (#1568)
  - serialize per-user \_seq emission to guarantee ordering
  - message-effects lifecycle (ephemeral/blurred/view-once) (#1562)
  - authoritative groupBy recompute for post/comment reactionSummary (F84c)
  - improve iOS app quality, accessibility, and reliability
  - remove 7 dead Localizable.xcstrings keys surfaced by the merge
  - clear typing throttle on typing:stop so the next start re-emits
  - hasMentions no longer flags email addresses as mentions
  - harden message reaction summary (tx + authoritative count + P2002 idempotency)
  - use canonical display-name SSOT in V2 conversation-list transform (F84)
  - load-more advances offset instead of refetching page 1 forever (F84)
  - boot-floor gap in phantom-cleanup + web initiator race/dead-timeout regressions
  - first/last-name fields in the profile editor (§K) (#1556)
  - stop scroll ticks re-rendering the whole list body
  - cap list previews at 300 graphemes, add ScrollOffsetRelay, make mood-badge pulse idempotent
  - comprehensive UX/UI quality and accessibility improvements
  - forward message language to conversation stats so languageDistribution stops freezing (F84)
  - regional (content) language preference (§L) (#1530)
  - apply query filters to status-breakdown groupBy in getAffiliateStats (F83)
  - offline-queued notification-preference backend sync (§L) (#1526)
  - fold participant-scoped counts to users so leaderboards stop duplicating/hiding users (F82)
  - stop stripping ZWNJ/ZWJ — preserve emoji, Persian & Indic text (F82)
  - web initiator never entered its own call + gateway phantom-cleanup killed live cross-conversation calls
  - per-event notification type toggles (§L)
  - DND quiet-hours schedule editor (§L) (#1517)
  - remove dead NOTIFICATION socket event + fix broken Prisma import (F77)
  - honor failureWindowMs so isolated failures no longer trip the breaker (F77)
  - validate E.164 by digit count, not prefixed string length (F80)
  - guard CallsViewModel.loadCalls() against stale-filter races
  - durable notification master toggles (§L) (#1512)
  - honor bidirectional blocking on typing indicators
  - persisted interface language (settings-interface-language) (#1508)
  - close concurrent-call and cross-call correctness gaps in WebRTC/CallKit stack
  - auto-detect Spanish UI language — es was missing from detectBestInterfaceLanguage (F79)
  - clear stale typing indicators on ConversationSocketHandler teardown
  - persisted light/dark/system theme (settings-theme-mode) (#1504)
  - isUrlOnly no longer absorbs CJK/Thai text glued to a URL (F76)
  - web never replayed a missed ringing call on reconnect + rate-limit call:check-active
  - getEmailValidationError agrees with isValidEmail (F73)
  - remove dead voice-effects audio pipeline
  - phantom-ringing callees now get the call_cancel push from GC tier 1 too
  - optimistic + offline profile edit incl. content languages (§K) (#1500)
  - reactionSummary self-heals from authoritative Reaction rows
  - durable Room cache for the profile stats/timeline dashboard (§K) (#1496)
  - capitalize hyphenated/apostrophe names + strip CR from displayName (F72)
  - stop toasting transient call:error codes iOS already treats as non-fatal
  - clear qualityDegradedStreaks on GC-forced call end too
  - community pin/mute/archive/hide no longer stale across devices (F71)
  - relay real error code on call:toggle-audio/video failure
  - renegotiate video SDP direction on CallKit hold/unhold
  - chip release during active edge auto-scroll no longer drops
  - getInitials emits broken half-surrogate for emoji names (F68)
  - profile 30-day activity timeline sparkline (§K)
  - make calendarDayDiff DST-immune (F67)
  - guard setAudioEffect against a dead capture-hook collision risk
  - real-time presence broadcast bypassed blocking check
  - stats projection SSOT + read-only dashboard section (#1489)
  - reapply AVAudioSession mode on A/V switch, track cumulative reconnect count
  - terminal-write protocol for orphaned sessions, rate-limit backgrounded/foregrounded, sweep quality-streak leak
  - stop truncateFilename overflow + formatCompactNumber "1000.0K" boundary (F65/F66)
  - unconditional VoIP registration, dark-chrome text contrast, defensive audio unwraps (#1484)
  - extract shared CallTypeBadgeView, drop unreachable a11y label (#1476)
  - treat Mongo P2034 write-conflict as retryable on endCall/leaveCall too (#1480)
  - stop orphaning offline messages after a Redis blip, bound participantId cache
  - secondary identity rows — languages · country · timezone
  - dual-emit message:read-status-updated alongside legacy event
  - profile-header enrichment — presence · completion ring · E2EE · member-since (#1482)
  - support hyphenated usernames end-to-end via MENTION_HANDLE_CHARS SSOT (F60)
  - derive worker drain lanes from a kind→lane SSOT (#1478)
  - make post/comment reaction removal idempotent
  - header title follows displayName like the list row
  - normalize language-code case at all write/read boundaries (F63/F64)
  - close duplicate-reaction race in AttachmentReactionService
  - three-state presence dot on friend rows (#1474)
  - text tool — centered editing, 6 new fonts, visible weights, diamond/cloud/speech frames
  - ship customName (and unstrip reaction) in the list payload
  - socket conversation:updated no longer clobbers DM display names
  - resolveUserLanguage lowercases in-app prefs — case parity with resolveUserLanguagesOrdered (F62)
  - stop CallView defaulting callManager to CallManager.shared (P1-16)
  - @username fallback uses the module's Unicode boundary, not ASCII (#1464)
  - per-filter chip counts on the Contacts list (#1470)
  - drop the chip on Épingles to pin the conversation
  - bump CallSession.version on all terminal writers
  - comment_reaction honors commentLikeEnabled, no opt-out bypass (F59)
  - durable Room cache for Discover suggestions cold-start paint (#1466)
  - stop stale offline broadcast on anonymous reconnect race
  - comment-reaction carries the real postType, no REEL/STATUS collapse (F58)
  - edge auto-scroll while dragging the chip (Phase 3)
  - auto-scroll aux bords pendant le drag de chip (Phase 3 long-press)
  - STUN-only fallback no longer strands calls without TURN
  - friends Room cache for cold-start paint (#1461)
  - the card sits flush under the expiry line — top vertical alignment (C-DIR5)
  - media load failures speak up (C16, targeted audit 4)
  - empty texts are purged when inline editing ends (C15, targeted audit 3)
  - VoiceOver speaks the UI's language on the chrome (C14, targeted audit 1)
  - gradient backgrounds end-to-end — format, three renderers, palette row (C11)
  - trim redundant comments that overflowed a byte-bounded test window
  - complete fr/en/es/de coverage for all 108 story.\* keys (C12)
  - unbreak pre-existing structural/behavioral CI tests
  - discreet undo/redo — header icons exist only when the trajectory allows (C9 inc.4+5)
  - hasMentions Unicode-aware — detect accented @DisplayName (F57)
  - global undo/redo apply snapshots; media purge becomes lazy (C9 inc.3)
  - close camera-state race, guard doomed CallKit transactions, drop dead code
  - durable offline friend-request send with cmid idempotency (#1458)
  - global undo capture — one debounced trigger, gap-free by construction (C9 inc.2)
  - HistoryStore — pure state stack for global undo (C9 inc.1)
  - carded canvas no longer reserves the hidden header, viewport zoom resets on carding (C-DIR4 bug 4)
  - hung-participant detector in call-reliability-report
  - letterbox takes the slide background colour in full-chrome (C-DIR4 bug 2)
  - letterbox du canvas 9:16 aux couleurs du fond du slide en présentation libre (BUG-2 C-DIR4)
  - background colour applies instantly + draft resume no longer restores an empty composer (C-DIR4 bugs 1&3)
  - stickers get a single source of truth — currentEffects passthrough (C13)
  - self-heal playback when the primary player is stuck .paused (C-DIR3)
  - reword close() comment so it doesn't self-match the new test
  - flush pending DataChannel bye before peer connection teardown
  - unified chrome — header follows the FABs, collapsed-band handle removed (C-DIR2 b/c/d)
  - stickers are reachable again — picker wired into the Text panel (C8)
  - nonisolated data-channel value types — unbreak CallSignalIndicatorTests compile
  - durable offline block/unblock via the outbox (block-outbox-durable)
  - the add-story badge no longer gets clipped (user report)
  - ghost handle to recover hidden chrome (C3)
  - unbreak main build — register CallSignalGlyph.swift in pbxproj, hoist typealias out of ViewBuilder body
  - slide opening effect reachable by gesture from the Fond panel — VM-owned state (C1)
  - the Transitions sheet becomes real — slide opening-effect picker (C7)
  - transient quality pills, color-coded signal glyph, WhatsApp-style banner, instant remote hangup
  - add-slide affordance at the end of the slide strip (C6)
  - gesture exit for viewport zoom — double-tap resets, near-identity pinch snaps to 1.0 (C4)
  - exécution phasée — le run se termine connecté au compte de test
  - timeline FAB/tile/swipe-up open the timeline sheet instead of an empty band panel (C5)
  - sync reels affinity caches on post edit/delete (F55)
  - cache-first Discover suggestions (empty-query) (#1451)
  - single-flight SUB receive + silence watchdog — translation return channel self-heals
  - map Mongo P2034 write conflict on join to the existing conflict-retry path
  - Dynamic Type for MentionSuggestionPanel (139i)
  - background URLs are allow-listed — no more viewer IP-leak (W7)
  - hard-delete no longer orphans media rows forever (G7)
  - single canonical visibility filter (G5)
  - reaction self-echo no longer double-counts likeCount (F56)
  - zoom transition on secondary surfaces (U1 inc.2)
  - zoom transition from tray bubble to viewer on iOS 18+ (U1 inc.1)
  - stop logging DTMF digits and transcript content
  - EXCEPT/ONLY can no longer publish without an audience (W6)
  - Blocked-users tab + BlockCache SSOT binding the resolver seam (#1446)
  - EXCEPT/ONLY audience picker in the story composer (W3 inc.2)
  - COMMUNITY visibility in the story composer + visibilityUserIds plumbing (W3 inc.1)
  - intra-slide crossfades render in the web viewer (W1 inc.4)
  - intra-slide crossfades finally render at playback (R14)
  - Dynamic Type for KeypadTab (138i)
  - local mutations persist through the dirty-flush path (R12 inc.2)
  - silent refresh consumes the G1 delta-sync (R8 inc.1)
  - Discover live user-search with inline connect (#1443)
  - keyset cursor pagination on the stories tray (G1c)
  - lean tray projection on GET /posts/feed/stories (G1b)
  - undo/redo history survives a hard crash (E4 inc.2)
  - Dynamic Type for MessageListView swipe indicator (136i)
  - remove dead FirebaseNotificationService FCM sender (F51)
  - unit-fetch out-of-tray stories by postId on deep link (R4 inc.2)
  - Dynamic Type for SyncPill (135i)
  - close duplicate-reaction race with atomic upsert
  - forward real postType + ephemeral context on socket reaction notifications
  - hop CXPlayDTMFCallAction to MainActor; tie TURN TTL to CallCleanupService
  - online-first friends list + cross-screen cache reconciliation (#1434)
  - guard mark-unread cursor rewind against a fresher concurrent read
  - friendship & relationship-state SSOT (#1431)
  - remove dead handleIncomingOffer, dedupe call-notice presentation logic
  - exclude source language from story caption translation targets
  - the draft-resume card replaces the bare text alert (U4 increment 2)
  - DraftResumeCard building block (U4 increment 1)
  - Dynamic Type + a11y for AchievementBadgeView (134i)
  - regenerate pbxproj — drop phantom AudioEffectsPanel.swift reference
  - viewedAt timestamp alongside isViewed — soft migration (R11)
  - replay message edits/deletes to offline recipients too
  - VoiceOver custom actions for prev/next story navigation (U6 increment 2)
  - VoiceOver announces slide changes in the reader (U6 increment 1)
  - preload the next slide's media (W5)
  - live story deletion and per-text-object translation merge (W4)
  - legacy story content resolves over the full language chain (R10)
  - fix two self-inflicted test assertions from the previous commit
  - client expiry fallback aligned with the server's 21h (G6)
  - read overlay text from canonical `text`, not legacy `content`
  - CXAnswerCallAction hold + system-PiP frozen-frame placeholder
  - key typing-indicator roster by userId, not display name
  - adaptive video-sender-cap plan (network + thermal) (#1417)
  - haptic ticks on slide change and buffering freeze/resume (U2)
  - live translation + delete on the feed realtime hook (W4)
  - stop leaking CallParticipant.analytics on active-call route
  - enqueue offline recipients on the WS message:send path too
  - foreground media-object keyframes animate too (W1 increment 2)
  - text-object keyframes animate in the web reader (W1 increment 1)
  - auto-advance timer freezes while the primary video buffers (W2)
  - textObjects translate to the audience's real languages (G3)
  - single translation pipeline for story content (G2)
  - identity-aware active-call teardown (#1415)
  - encrypt the stories tray store like every other social store (R9)
  - logout purges the story draft AND the persisted publish queue (E9)
  - actually run the legacy offline-queue migration at boot (E6)
  - the queue cleans up its media copies (E10 disk leak)
  - last-message preview excludes soft-deleted messages
  - screen-capture participant spoofing, pocket-dial, HIG hit targets, stale-peer cleanup
  - sniff the URL extension before routing media to disk stores (R7)
  - story view receipts are durable via the outbox (R6)
  - chip drop moves the conversation onto a section header
  - delta-sync via ?updatedSince on the stories tray (G1)
  - debounce the sending clock glyph for sub-200ms sends (B.4)
  - write-ahead makes the online publish survive process kills (E5)
  - undo/redo history survives the timeline sheet lifecycle (E4)
  - flush the open timeline into the slide before persisting (E3)
  - deep-link container serves the cached tray before forcing network (R4)
  - identity interstitial between story groups (user directive)
  - call-reliability-report — prod health report for the multi-hour calls goal
  - periodic in_progress analytics snapshots survive app kills
  - update two source-guard tests for the TURN-refresh watchdog refactor
  - split press-state detector from long-press trigger
  - discreet buffering indicator during mid-slide stalls (R3)
  - propagate deviceLocale to the last 2 resolveUserLanguage sites
  - freeze timeline while the bg image bitmap is still loading (R2)
  - debounced draft autosave — editing survives hard crashes (E1)
  - retry TURN refresh on dropped ACK, surface busy/failure feedback, finish a11y hints
  - DM dedup reopens the most recently ACTIVE duplicate
  - auto-dismiss call-waiting banner on remote end (#1411)
  - buildEffects no longer wipes timeline-authored fields (E2)
  - pin viewed-story media until expiry (R5 wiring)
  - serialize updateOnNewMessage per conversation to stop a lost-update race
  - direct-DM creation is idempotent — reopen the existing DM
  - pinning exempts keys from DiskCacheStore eviction (R5)
  - amplify row scale animation dampingFraction for visible rebounce
  - freeze timeline while slide audio is still caching (R1)
  - Dynamic Type for MoodReplyConfirmationOverlay (132i)
  - persist end-of-call analytics on CallParticipant
  - Dynamic Type + a11y for MessageDetailSheet hero glyphs (131i)
  - apply URL-only translation guard on all 3 entry points
  - negotiationTimeMs separates WebRTC setup from human ring time
  - add negotiationTimeMs metric for WebRTC connection timing
  - Dynamic Type for ReelFeedCard glyphs (130i)
  - wire dead PiP rotation hook, fix VoiceOver double-read, fix Dynamic Type clipping
  - guard REST message-delete lastMessageAt with optimistic concurrency
  - re-anchor already-answered source-guard on the real subscriber
  - call_answered_elsewhere silent push — multi-device socketless ring dismissal
  - call-waiting banner for a second incoming call (#1403)
  - la liste de conversations scrolle à nouveau — retrait du DragGesture plein-ligne
  - call_cancel silent push ends phantom ringing (client side)
  - fan out sendToUser to device tokens in parallel
  - call_cancel background push kills phantom ringing on socketless devices
  - rate-limit reconnect/ICE-refresh handlers, remove dead signaling hook
  - quality-alert requires sustained degradation and excludes the reporter
  - remove unauthenticated-admin debug notification routes
  - quality-monitor warm-up gate fails closed when start date is nil
  - GC tier 3 spares multi-hour calls with fresh heartbeats
  - Dynamic Type + a11y for CameraView (129i)
  - re-wire MessageDraftMediaStore + 2 test files into pbxproj, purge warnings
  - useSocialSocket retries once the socket bootstraps
  - Dynamic Type for FeedPostCard action-bar glyphs (128i)
  - forward badge as android notificationCount (F1 Android)
  - keep the literal videoToggleTask?.cancel() call CI checks for
  - toggleVideo() can run two concurrent camera/transceiver actuations on rapid double-tap
  - GC force-end never fanned out call:ended to ringing callee's user room
  - typing:start/stop now require active conversation membership
  - WebRTC-plumbing outbound emits (call-webrtc-plumbing-emits) (#1393)
  - Dynamic Type for BubbleDeliveryCheck status glyphs (127i)
  - photothèque du composer — long press vidéo, actions Ajouter/Sélectionner/Éditer, présélection picker, Liquid Glass iOS 26 (#1389)
  - correct two false-positive assertions from prior commit
  - getReels curseur chronologique (lossless) + languageCodeSchema accepte les 639-3
  - CallEffectsOverlay ObservedObject re-subscription bug + a11y/dead-code cleanup
  - resync feed room + typing keepalive across reconnect/long sessions
  - badge unread embarqué dans le push — badge d'icône iOS et widget gelés app fermée (F1)
  - appel jamais décroché = missed (critère answeredAt) + garde FSM reconnecting
  - refactor conversation row long-press gesture with proper priority
  - fallback pendingCount cohérent avec pendingUIItems sur échec de lecture (item H cause D)
  - reclaim visibility-timeout des rows .inflight orphelines (item H)
  - les pièces jointes du brouillon survivent au kill (phase 2 — câblage)
  - store durable des pièces jointes de brouillon de message (phase 1)
  - Dynamic Type + VoiceOver for conversation composer (iter 126i)
  - pure video-survival auto-disable policy (#1387)
  - curseur getReplies aligné asc + codes langue 639-3 acceptés
  - call:ended atteint l'appelé qui sonne (fanout rooms user)
  - réaligne le garde AdjustBitrate sur le merge BWE gated + pbxproj regen
  - auto-save du brouillon au passage en background (D1)
  - auto-retry of failed messages now forwards clientMessageId
  - indicateur qualité fiable + écran d'appel décalé de 30pt
  - action « Enregistrer » dans le menu appui-long (composant unifié)
  - Dynamic Type + VoiceOver for AttachmentLoadingTile (iter 125i)
  - hooks onSaveRequested sur les viewers SDK + câblage du fullscreen média des bulles
  - report « downloaded » best-effort dans le coordinateur unifié (parité P7-9)
  - câbler audio + galerie média sur le composant unifié Enregistrer
  - Dynamic Type + VoiceOver for iPad panel header (iter 124i)
  - implement drag-to-reorder during long-press with smooth transition
  - correct offset windows and setEffect precondition in new tests
  - atomic conditional consume closes brute-force TOCTOU on SMS reset attempt caps
  - remplacement 1-réaction-par-user + gate messages système dans toggleReaction
  - adjust scale animation timing for smoother rebounce
  - sémantique de remplacement 1-réaction-par-user + gate messages système
  - resolve duplicate CallEffectsOverlayAccessibilityTests class
  - restore VideoConfig, actually used by P2PWebRTCClient
  - implement row scale animation reset on menu dismiss
  - thread-safety, dead code, and VoiceOver gaps in calling stack
  - add long-press scale animation to conversation rows
  - connection-quality classification core + live signal indicator (#1381)
  - type decodePayload's corrupt-payload error as MeeshyError
  - gate FRIENDS-visibility posts through buildVisibilityFilter
  - re-join call room on socket reconnect (production component)
  - idempotence du remove de réaction sur le chemin socket
  - DELETE de réaction idempotent (not-found → succès, pas 404)
  - pure telecom-connection policy (ConnectionService state reports) + reporter fold (#1377)
  - totalMembers exclut le sender par identité (pas -1 aveugle)
  - bootRecovery détecte aussi les fichiers média visuels manquants au crash
  - annuler un envoi média offline balaie ses fichiers (fuite disque)
  - pure call-audio policy (ringback/ringtone/cues) + tone controller fold (#1375)
  - le merge edit-into-send offline détruisait les médias en attente
  - dead-letter immédiat des rejets serveur 4xx permanents dans l'outbox
  - watermark conversation-list dérivé de l'horloge locale (R15b)
  - watermark de gap-recovery messages empoisonné par clock-skew (R15a)
  - SyncEngine A5.4 — resync notifications au reconnect (fenêtre aveugle)
  - SyncEngine A5.3 — resync notifications sur gap de séquence
  - SyncEngine A5.2 — hook gapDetected sur SyncSeqTracker
  - SyncEngine A5.1 — décodage \_seq + tracker de gap (bénéfice multi-device)
  - terminal statuses are immutable — leave/disconnect can no longer rewrite missed as completed
  - unify REST/socket CallService instance, harden markCallAsMissed, remove dead beacon fallback
  - report downloaded pour les documents (gap P7-9 P3 comblé)
  - enforce maxUses cap atomically (F47 TOCTOU)
  - BlockActionCoordinator — block/unblock durable pour les sites Views (R6-4 complet)
  - BlockedViewModel.unblock via l'outbox durable (R6-4 incr.2, 1/N sites)
  - primitive block optimiste + fix caveat swipe labels périmés (R6-4 incrément 1/2)
  - atomic increments for calibrateProfile counters (lost-update race)
  - release active-call claim on ringing-timeout missed + self-heal leaked claims
  - verrous + master PIN purgés au logout (P7-11, invariant 9)
  - ConversationLockManager logout hook — purge cross-account leak (P7-11)
  - close cap TOCTOU — reserve slot atomically before creating relation (F47)
  - réconciliation complète périodique — purge des conversations fantômes hard-supprimées (P7-10)
  - release active-call claim on missed-timeout, harden signaling authz, fix waiting-banner reject
  - propagate profile changes to conversation partners (USER_UPDATED)
  - une panne gateway ne consomme plus le budget de retries de l'outbox (P7-7)
  - le composer ne se verrouille plus pendant qu'un message est sur l'horloge ⏳
  - live in-call duration timer (slice call-duration-timer) (#1371)
  - purge du cache HTTP URLCache au logout (T15b-b, invariant 9)
  - C8 — dédup des sockets same-user au join (last join wins)
  - document Dynamic Type freeze doctrine for FeedView chrome (iter 123i)
  - tolerate GRDB Date round-trip noise in markEdited ordering guard
  - decode editedAt onto APIMessage (CI compile failure)
  - guard message:edited against out-of-order stale delivery
  - atomic increments in ConversationMessageStats edit/delete hooks (F48)
  - stop clearing ringing timeout on early-join; fix web duplicate-offer race
  - call:join ne désarme plus le ringing timer — l'answer SDP et les chemins terminaux le possèdent
  - Dynamic Type + VoiceOver for EmojiPickerSheet (iter 122i)
  - Dynamic Type for message context menu (iter 121i)
  - réconciliation call:end aussi sur ACK-échec (chaos-test 2)
  - joinCall transitionne vers RINGING — l'early-join du callee n'est pas un décrochage (item F matérialisé)
  - version-guard call-termination writes, align REST/socket end-call authorization
  - guard read/delivery cursors against out-of-order regression
  - deep-link a full-screen call push into the incoming-call screen
  - un appel sortant non décroché ne bascule plus en écran connecté 00:00 — garde FSM .reconnecting, horloge d'appel, bannières Dynamic Island, avatars duo + fond profil
  - hide decorative conversation backdrop from VoiceOver (iter 120i)
  - grâces disconnect affinées — extension si socket vivant, grâce courte pré-answer (chaos-tests prod)
  - guard stale ICE-restart/call-waiting async continuations
  - close lost-update race on message reaction summary
  - Dynamic Type + VoiceOver for message-bubble media grid (iter 119i)
  - route FCM call pushes to a full-screen incoming-call notification (#1354)
  - reconcile with concurrent session's merged fix, keep only the surviving bug
  - pre-existing CI failures — PiP filter button a11y hint, dead localization keys, stale auto-hide test
  - CallKit informé sur tout teardown .failed, TURN préservé sur End & Answer, bannière call-waiting nettoyée, indicateur signaling dégradé
  - iOS CallKit/TURN/banner triad + gateway endCall idempotency gap
  - un restart/blip ne tue plus un appel établi — ownership disconnect, réhydratation boot, hygiène timers
  - recover socket.io realtime delivery after reconnect_failed
  - réaligner 3 source-guards CallView hérités du merge main
  - exact @mention resolution — anchor Unicode name boundaries
  - pure incoming-call push decision core (#1347)
  - Dynamic Type + VoiceOver for ConversationView message-row affordances (iter 118i)
  - gateway audit follow-through — leftAt persistence, missing summary index, force-leave missed path, ICE rate limit
  - drop stale retranslation results (edit ordering race)
  - survive gateway restart — active P2P call no longer cut by signaling-socket drop
  - remove dead previewRouter + unify conversation preview width (deferred NITs)
  - dedup key must include messageId, not just conversation
  - appels — vidéo distante, join VoIP fiable, chrono CallKit, contrôles cadre
  - Dynamic Type in action menu + inert-modifier cleanup (deferred review)
  - call:missed contract + video layout on remote escalation
  - restore call metric glyphs and move call time bottom-right
  - contraste blanc-sur-verre en Light + a11y overlay (déférés revue)
  - dedicated Calls bottom-nav tab + re-dial gesture (calls-tab-nav) (#1340)
  - dismissContextMenu — purge asyncAfter annulable
  - bannière DM strippée sur la route LIST (schéma minimal)
  - remove dead activeCallSession() call breaking sdk-tests compile
  - close call:heartbeat authz gap to strict active-participant check
  - gate CallKit plateforme — le simulateur pilote l'appel in-app
  - add missing banner arg to APIConversationUser test fixture
  - Dynamic Type + VoiceOver for StoryViewerView canvas (iter 117i)
  - stale-broadcast ordering races + unbounded conversationId cache
  - remontee banniere de profil (DM) + boutons header conversation en glass
  - hide decorative onboarding backdrop from VoiceOver + Dynamic Type CTA (iter 116i)
  - evict VoIP dedup entry on CallKit report failure (busy path)
  - close initiateCall/joinCall TOCTOU races on concurrent starts
  - Dynamic Type doctrine for CallView control bar (iter 115i)
  - update stale transcription-segment tests for active-participant authz
  - Dynamic Type + VoiceOver for StoryExportShareSheet (iter 114i)
  - hide dead voice-effects panel (video filters only)
  - coalesce reconnect triggers, epoch half-open re-arm, TURN refresh at restart, stuck-muted fallback
  - raffinements apercu long-press conversation
  - redesign system call bubble — compact, direction-aware, timestamped
  - Dynamic Type + VoiceOver for OnboardingFlowView chrome (iter 113i)
  - close conversation-membership authz bypass on transcription-segment
  - thread real conversationId into outgoing call route (call-nav-conversation-thread)
  - apercu long-press conversation enrichi (banniere, avatar, actions, dernier message)
  - action Renommer dans le menu contextuel conversation
  - Dynamic Type + VoiceOver for OnboardingStepViews (iter 112i)
  - close membership-check bypass, post call-summary on every terminal path
  - restore reaction notifications on the socket path
  - bind the realtime socket to the auth session (realtime-session-coordinator) (#1321)
  - restore CallMediaConfig.swift — VideoConfig is a real prod dependency
  - scope Opus SDP munging to audio, enforce per-call authz, drop dead code
  - converge formatDuration onto shared formatClock (iter 74)
  - idempotent P2002 handling on message reaction add
  - zoom in/out sur l'overlay long-press conversation
  - Dynamic Type for StatusBubbleOverlay (iter 111i)
  - MessageMoreSheet en grille verre (Liquid Glass iOS 26)
  - Dynamic Type + VoiceOver for ReelsPlayerView (iter 110i)
  - fold CallSignalManager into CallViewModel (VM-fold)
  - restore conversation long-press menu (remove .onDrag conflict)
  - ACK-based call:initiate (emitInitiate + pure parser) (#1311)
  - custom conversation context menu (icons on iOS 26)
  - clear participant heartbeat on mid-call leave
  - preserve supported ISO 639-3 language codes in normalizeLanguageCode
  - add safety-net expiry for stuck remote typing indicators
  - converge local formatDuration onto shared formatClock
  - stop SDP-munging RED into audio offers/answers, use setCodecPreferences
  - typed FRIEND_REQUEST_NEW/ACCEPTED/REJECTED events
  - context-menu icons + story quit alert legibility
  - Dynamic Type + VoiceOver for StoryTrayView (iter 109i)
  - apply late/refreshed TURN credentials to a live peer connection
  - recent/missed-calls list UI (CallHistoryViewModel + screen) (#1304)
  - native-lean long-press menu (reactions + bubble + vertical list)
  - emit friend-request:cancelled so the other party's list syncs live
  - Dynamic Type for StoryViewerView sidebar/header (iter 108i)
  - resistant swipe on audio/video bubbles
  - route quick affordances to native MessageMoreSheet
  - menu longpress - new components + MessageDetailSheet decomposition
  - Dynamic Type + VoiceOver for FeedPostCard media (iter 107i)
  - Dynamic Type + VoiceOver for AudioEffectsPanel (iter 106i)
  - serialize camera switch, close stale peer connection, fix VoIP dedup eviction
  - VoiceOver labels for feed attachment remove buttons (iter 105i)
  - Dynamic Type + VoiceOver for AudioEffectsPanel (iter 105i)
  - Dynamic Type + VoiceOver for VideoFilterControlView (iter 105i)
  - Dynamic Type + VoiceOver for ShareLinksView (iter 104i)
  - VoiceOver labels for AudioFullscreenView icon-only controls (iter 103i)
  - supprime à nouveau le doublon d'import copyToClipboard (régression réintroduite) (#1291)
  - adopte la source unique copyToClipboard dans TwoFactorSettings (F30-f) (#1284)
  - Dynamic Type + VoiceOver for EditPostSheet (iter 100i)
  - Dynamic Type + VoiceOver for ConversationMediaGalleryView (iter 103i)
  - Dynamic Type + VoiceOver + content selection for LicensesView (iter 98i)
  - finish Dynamic Type + VoiceOver for LoginView (iter 102i)
  - resolve committed merge-conflict markers in routine uiux docs
  - Dynamic Type + VoiceOver for TrackingLinksView (iter 101i)
  - adopte la source unique copyToClipboard dans TwoFactorSettings (F30-f)
  - Dynamic Type + VoiceOver for CommunityLinkDetailView (iter 99i) (#1272)
  - supprime le doublon d'import copyToClipboard (régression merge parallèle) (#1266)
  - resolve committed conflict markers from triple 93i collision
  - Dynamic Type + VoiceOver + content copy for SupportView (iter 95i) (#1262)
  - remove duplicate copyToClipboard import introduced by main merge
  - call-history repository (REST + Room cache-first SWR)
  - Dynamic Type + VoiceOver for ConversationListView overlays (iter 94i)
  - remove duplicate copyToClipboard import breaking the build
  - source unique presse-papier pour les pages links — iter 70
  - Dynamic Type + VoiceOver for ForwardPickerSheet (iter 100i)
  - Dynamic Type for MessageOverlayMenu (iter 99i)
  - Dynamic Type + VoiceOver for UserStatsView (iter 98i)
  - copy diagnostics via long-press menu in AboutView (iter 98i)
  - remove duplicate accessibilityElement on AffiliateView stat card (iter 92i)
  - trim background-observer comment to fit CI's fixed-window source test
  - serialize hold/unhold video ops, fix glare-path state leak, GC race guard
  - update quality-report test for participant-gated persistCallStats
  - moderator-kick wrong-participant, quality-report authz gap, ringing-call CallKit gap
  - thread-safe audio effect counters, cache-first filter switch, a11y hint (#1257)
  - Dynamic Type + destructive-red token for EffectsPickerView (iter 87i)
  - source unique formatFileSize — iter 70
  - relocate stragglin docs, drop orphan MARK dividers
  - annule les vérifications de disponibilité obsolètes (AbortController) — iter 70
  - split StoryComposerView into view-builder extensions
  - Dynamic Type + VoiceOver for AddParticipantSheet (iter 97i)
  - pure call-journal model (CallRecord + CallDirection/CallMediaType) (#1254)
  - clôture F30 — unification presse-papiers via source unique (iter 70)
  - Dynamic Type + VoiceOver for NotificationSettingsView (iter 96i)
  - source unique de validation d'ObjectId MongoDB — iter 69 (#1251)
  - split StoryCanvasUIView into method extensions
  - split StoryComposerViewModel into method extensions
  - extract free top-level types into dedicated files
  - widen access private→internal on the 3 refactor targets
  - content selection + VoiceOver for TwoFactorSetupView (iter 95i)
  - converge conversation-share clipboard fallback on copyToClipboard (F30-d, iter 68)
  - Dynamic Type + VoiceOver for SharePickerView (iter 94i)
  - Dynamic Type + VoiceOver for AffiliateView (iter 94i)
  - Dynamic Type + VoiceOver for MemberManagementSection (iter 94i)
  - Dynamic Type for SharePickerView (iter 94i)
  - Dynamic Type for LocationPickerView (iter 93i)
  - Dynamic Type + VoiceOver for LocationPickerView (iter 93i)
  - converge partage conversation (fallback presse-papier) vers copyToClipboard (F30-d, iter 68)
  - Dynamic Type + VoiceOver for ConversationPreferencesTab (iter 93i)
  - CallSignalManager — inbound call:\* → SharedFlow<CallEvent> + outbound emit table (#1230)
  - render comment audio/media in feed preview + fix notification badge truncation
  - Dynamic Type + VoiceOver for AffiliateView (iter 92i)
  - Dynamic Type + VoiceOver for NewConversationView (iter 91i)
  - Dynamic Type + VoiceOver for CommunityLinksView (iter 91i)
  - Dynamic Type + VoiceOver AffiliateView (iter 91i)
  - Dynamic Type + VoiceOver for AffiliateView (iter 91i)
  - converge partage conversation vers copyToClipboard (F30-d)
  - Dynamic Type + VoiceOver for DataExportView (iter 91i)
  - stop audio-toggle self-echo, rate-limit transcription relay, reset PiP fps
  - Dynamic Type + VoiceOver DataExportView (iter 90i)
  - Dynamic Type for NewConversationView (iter 90i)
  - converge copie identifiant groupe vers copyToClipboard (F30-c)
  - Dynamic Type + VoiceOver for MagicLinkView (iter 90i)
  - converge partage feed/reel vers copyToClipboard (F30-b)
  - Dynamic Type + VoiceOver + palette for EffectsPickerView (iter 89i)
  - converge copie contenu/lien vers la source unique copyToClipboard (F30-a) (#1216)
  - Dynamic Type + i18n/render fixes for DeleteAccountView (iter 88i)
  - Dynamic Type + VoiceOver for DeleteAccountView (iter 88i)
  - Dynamic Type + VoiceOver for voice profile wizard (iter 87i)
  - remove duplicate getUserInitials import in u/[id] page
  - route legacy slide.mediaURL background via directURLIfAny (WS5.4a)
  - retire le code mort du filtre temps-reel Story
  - restaure isExpired reverté par le même merge parallèle — iter 64 (#1210)
  - retire le dead StoryFilteredLayer, extrait StoryFilterKind
  - notify peer on local SDP failure, drop dead emitCallEnd overload
  - Dynamic Type + VoiceOver for storage & auto-download settings (iter 83i)
  - retire les références orphelines ReplyThread du pbxproj
  - story par défaut en Contacts + filtres par média
  - restaure formatCompactNumber reverté par un merge parallèle — iter 63 (#1208)
  - inbound call:\* signalling event models + pure CallEvent mapper (#1207)
  - Dynamic Type + VoiceOver headers for AboutView (iter 86i)
  - restaure formatCompactNumber reverté par un merge parallèle — iter 63
  - source unique de la troncature de texte (truncate) — iter 62 (#1203)
  - VoiceOver selection semantics for the language picker (iter 85i)
  - Dynamic Type + VoiceOver for StarredMessagesView (iter 85i)
  - source unique du formatage de durée média (formatClock) — iter 62
  - corrections du review présence (conformité + decay)
  - source unique du compteur compact (formatCompactNumber) — iter 61 (#1201)
  - Dynamic Type + VoiceOver for EditProfileView (iter 84i)
  - source unique du prédicat d'expiration (isExpired) — iter 60 (#1199)
  - présence datée + colorée après le pseudo (fiche profil, Lot 6 iOS)
  - keep PR1157/PR1148 catalog-backed localization (fix dead keys)
  - Dynamic Type + i18n parity for legal screens (iter 83i)
  - unify sheet grabber affordance (iter 79i)
  - source unique du « temps restant avant expiration » — iter 59 (#1187)
  - Dynamic Type parity for call-screen inline glyphs (iter 79ib)
  - Dynamic Type for the feed attachment composer (iter 79i)
  - source unique du temps restant avant expiration — iter 59
  - restore contacts avatar initials to getUserInitials (iter 59, anti-régression F26c-c(b))
  - Dynamic Type for the fullscreen audio player (iter 82i)
  - complete ConversationSettingsView localization (iter 78i)
  - Dynamic Type for the active sessions screen (iter 82i)
  - source unique de la classification du temps relatif — iter 58 (#1177)
  - relay real toggle-media errors + unify CallService instance (RC-4)
  - RelativeTimeFormatter.lastSeenString (Lot 6 iOS)
  - localize ConversationLockSheet + VoiceOver/Dynamic Type (iter 81i)
  - source unique des initiales — profil public → getUserInitials (iter 58, F26c-c(c))
  - source unique des initiales — page profil app/u/[id] → getUserInitials (iter 58)
  - stop duplicate Socket.IO listener registration on reconnect-adjacent calls (iter 57)
  - source unique des initiales — famille contacts → getUserInitials — iter 57 (#1181)
  - import Combine in OfflineQueueTests (CI restore)
  - add missing import Combine to OfflineQueueTests (unblock sdk-tests CI)
  - CountryPicker VoiceOver labels + sheet grabber (iter 80i)
  - Dynamic Type for the feed post composer (iter 78i)
  - initiales admin/users → getUserInitials + fix(gateway/test) createUnifiedAuthMiddleware mock — iter 56 (#1170)
  - consolidate destructive/error/expired reds to MeeshyColors.error (iter 78i)
  - complete story-viewer localization catalog (iter 79i)
  - :feature:calls CallViewModel + minimal call screen (Calls slice) (#1169)
  - localize MessageOverlayMenu message menu (iter 78ib)
  - localize Router route/scene titles + deep-link error (iter 79i)
  - source unique des initiales — MemberSelectionStep → getUserInitials — iter 55 (#1167)
  - :feature:calls CallViewModel + minimal call screen (Calls slice)
  - Dynamic Type for the link preview card (iter 78i)
  - source unique des initiales — MemberSelectionStep → getUserInitials (iter 55)
  - tokenize semantic hardcoded colors to MeeshyColors (iter 78i)
  - supprime le module mort utils/user.ts (clôt le cluster getUserDisplayName) — iter 54 (#1163)
  - localize SharePickerView chrome strings (iter 77i) (#1162)
  - Dynamic Type ConversationDashboardView (iter 71i)
  - source unique du nom d'affichage (username-first → canonique) — iter 53 (#1161)
  - source unique du nom d'affichage (déjà displayName-first) — iter 52 (#1159)
  - Dynamic Type for the invite friends sheet (iter 76i)
  - source unique des initiales d'avatar (objet) — iter 51 (#1158)
  - localize message quick-action menu — iter 71i
  - source unique des initiales d'avatar (string) — iter 50 (#1156)
  - harden call signaling against payload spoofing + DoS
  - mark EmojiGridCategoryTests @MainActor (iter 71i)
  - Dynamic Type 2FA security flow (iter 71i)
  - pure call-lifecycle FSM (core:model) (#1153)
  - localize emoji-picker category VoiceOver labels (iter 71i)
  - source unique du nom d'affichage — copies locales (iter 50)
  - source unique du nom d'affichage utilisateur (iter 49) (#1147)
  - Dynamic Type for the voice profile management screen (iter 75i)
  - consolidate hardcoded hex tints to MeeshyColors tokens on Support/Report screens (iter 71i)
  - categorised + searchable sticker picker (#1135)
  - localize 6 hardcoded French VoiceOver labels/hints (iter 71i)
  - source unique de la validation d'email + dernière horloge inline (iter 48) (#1146)
  - Dynamic Type for the conversation dashboard (iter 74i)
  - unifier formatDuration sur le canonique formatClock (iter 47) (#1141)
  - hoist actor-isolated pendingCount() out of XCTAssert autoclosure
  - re-apply await-hoist in PendingStatusQueueTests (merge reverted 87f85d68d)
  - restore iOS work reverted by the PresenceVisibilityService merge (84fedd79)
  - remove orphaned ReplyThreadOverlay.swift (complete #1122 cluster removal)
  - présence colorée + datée sur la fiche profil (Lot 6 web)
  - grace period before treating a transient socket drop as call-leave (P0-7)
  - localize hardcoded French VoiceOver strings (iter 73i)
  - remove ReplyThreadOverlay.swift resurrected by a merge artifact (unblocks CI)
  - Dynamic Type for the feed comments sheet (iter 72i)
  - hoist await out of XCTAssert autoclosure (iter 71i unblock)
  - unifier formatFileSize sur la source canonique partagée (iter 46) (#1136)
  - wire invite-user-modal row aria-label to selection state
  - guard call-waiting pending-clear against newer overwrite (#1133)
  - remove dead ReplyThreadOverlay to unblock iOS compile (iter 71i)
  - Dynamic Type for the 2FA security flow (iter 71i)
  - hoist await out of XCTAssertEqual autoclosure in PendingStatusQueueTests
  - remove ReplyThreadOverlay.swift resurrected by a merge artifact
  - guard call-waiting pending-clear against newer overwrite
  - repair invite-modal result row broken by merge (unblocks CI)
  - cap lastMessage.content preview at 300 code points in GET /conversations
  - PATCH /messages/:messageId now broadcasts message:edited and retranslates
  - join rooms before marking socket connected to close message-loss race
  - close TOCTOU race that could resurrect a deleted message with edited content
  - close TOCTOU race that could regress the delivered/read cursor
  - dedup offline delivery queue by messageId+eventType, not messageId alone
  - SyncEngine A3.2 — pagination cursor keyset composite /sync
  - SyncEngine A2.1 — emitWithSeq sur notification:new (event pilote \_seq)
  - SyncEngine A3.1 — endpoint /sync read-only, collection messages
  - SyncEngine A1 — UserEventSeq + SequenceService.nextSeq atomique
  - sliding window des sessions trusted — champ lastActivityAt (P7-3)
  - recordView — catch P2002 différencié + log des pannes réelles (P7-2)
  - AgentAdminRelay ne démarrait jamais — connect() avant subscribe()
  - harden two lost-update/out-of-order races on shared counter & cursor
  - unify 5 bounded-cache copies into a single BoundedTtlCache SSOT
  - bound participant-lookup cache (FIFO 5000 + expired sweep)
  - appels tués à tort — garde socket-zombie + sémantique leftAt (C5, 14 sites)
  - bound resolveConversationId identifier→ObjectId cache (FIFO 2000)
  - endCall() resolves pre-answer hangups as missed, not completed
  - claim activeCallId — matcher aussi les documents sans le champ
  - bound StatusHandler identityCache to stop unbounded typing-path growth
  - unify timeout via withTimeout helper, fix leaked timers
  - memoize participantLookup to cut per-message DB round-trip (B.3)
  - keep attachments on message:edit realtime broadcast
  - resolve Participant.id before handleMessage in agent + non-blocking-translation paths
  - ne plus exposer l'email des co-participants (PII)
  - respecter les prefs présence dans les listes (Lot 5)
  - drop dead-on-read maintenance of cursor.unreadCount (iter 57 / F23c)
  - mock createUnifiedAuthMiddleware in profile-extended tests
  - retry transient push failures + stop deactivating tokens on provider outages
  - scope push notification collapse-id per-conversation (#1140)
  - respecter les prefs privacy dans presence:snapshot (Lot 2, E1)
  - mock createUnifiedAuthMiddleware in profile.test (unblock CI)
  - ne pas divulguer la présence des membres via /links (Lot 2, E2)
  - retire la présence des payloads friend-requests (Lot 4)
  - typage viewer dans /users/search (authContext cast)
  - unifier la résolution d'avatar participant + corriger notSeenBy (iter 47)
  - gate présence dans /users/search (Lot 4)
  - batch resolveForTargets + gate /users/presence (Lot 2)
  - mock createUnifiedAuthMiddleware in profile.test.ts (unblock CI)
  - gate présence sur les lookups email/phone/id dédiés (Lot 3 fin)
  - gate présence sur la fiche profil (Lot 3/6)
  - PresenceVisibilityService (Lot 1/6 présence)
  - unread-count batch must exclude each participant's own messages (iter 46 / F23b)
  - collapse per-message unread counts to a single query (iter 45 / F23) (#1134)
  - calibrate coverageThreshold to CI-bun baseline (~9.5pp below local-node)
  - batch unread counts in one read (F23, iter 45)
  - pin pytest back to 8.3.4 — pytest-asyncio 0.25.2 requires pytest<9
  - deduplicate in-flight tasks — gateway retries no longer self-strangle long texts
  - repair stale outer-exception test in translation_processor
  - stop dividing torch threads by async worker count — inference ran 2× slow
  - sequential language fan-out — budgets now cover real inference time
  - proportional inference budget — long texts are translated again
  - boot import failure no longer permanently kills the audio pipeline
  - pin floating ML deps to stop non-deterministic Docker build breaks
  - sync uv.lock project version (unblock Test Python CI)
  - restore numpy<1.24 ESPnet constraint (revert breaking Dependabot #825)
  - import ESM avec extension .js + test-garde des imports relatifs
  - add .js extension to mention-parser import — prod gateway crash-loop
  - helper pur resolvePresenceVisibility (Lot 1/6 présence)

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.3.0

## 1.3.0

### Minor Changes

- Changements automatiques détectés :

  - first/last-name fields in the profile editor (§K) (#1556)
  - stop scroll ticks re-rendering the whole list body
  - cap list previews at 300 graphemes, add ScrollOffsetRelay, make mood-badge pulse idempotent
  - forward message language to conversation stats so languageDistribution stops freezing (F84)
  - regional (content) language preference (§L) (#1530)
  - apply query filters to status-breakdown groupBy in getAffiliateStats (F83)
  - offline-queued notification-preference backend sync (§L) (#1526)
  - fold participant-scoped counts to users so leaderboards stop duplicating/hiding users (F82)
  - stop stripping ZWNJ/ZWJ — preserve emoji, Persian & Indic text (F82)
  - web initiator never entered its own call + gateway phantom-cleanup killed live cross-conversation calls
  - per-event notification type toggles (§L)
  - DND quiet-hours schedule editor (§L) (#1517)
  - remove dead NOTIFICATION socket event + fix broken Prisma import (F77)
  - honor failureWindowMs so isolated failures no longer trip the breaker (F77)
  - validate E.164 by digit count, not prefixed string length (F80)
  - guard CallsViewModel.loadCalls() against stale-filter races
  - durable notification master toggles (§L) (#1512)
  - honor bidirectional blocking on typing indicators
  - persisted interface language (settings-interface-language) (#1508)
  - close concurrent-call and cross-call correctness gaps in WebRTC/CallKit stack
  - auto-detect Spanish UI language — es was missing from detectBestInterfaceLanguage (F79)
  - clear stale typing indicators on ConversationSocketHandler teardown
  - persisted light/dark/system theme (settings-theme-mode) (#1504)
  - isUrlOnly no longer absorbs CJK/Thai text glued to a URL (F76)
  - web never replayed a missed ringing call on reconnect + rate-limit call:check-active
  - getEmailValidationError agrees with isValidEmail (F73)
  - remove dead voice-effects audio pipeline
  - phantom-ringing callees now get the call_cancel push from GC tier 1 too
  - optimistic + offline profile edit incl. content languages (§K) (#1500)
  - reactionSummary self-heals from authoritative Reaction rows
  - durable Room cache for the profile stats/timeline dashboard (§K) (#1496)
  - capitalize hyphenated/apostrophe names + strip CR from displayName (F72)
  - stop toasting transient call:error codes iOS already treats as non-fatal
  - clear qualityDegradedStreaks on GC-forced call end too
  - community pin/mute/archive/hide no longer stale across devices (F71)
  - relay real error code on call:toggle-audio/video failure
  - renegotiate video SDP direction on CallKit hold/unhold
  - chip release during active edge auto-scroll no longer drops
  - getInitials emits broken half-surrogate for emoji names (F68)
  - profile 30-day activity timeline sparkline (§K)
  - make calendarDayDiff DST-immune (F67)
  - guard setAudioEffect against a dead capture-hook collision risk
  - real-time presence broadcast bypassed blocking check
  - stats projection SSOT + read-only dashboard section (#1489)
  - reapply AVAudioSession mode on A/V switch, track cumulative reconnect count
  - terminal-write protocol for orphaned sessions, rate-limit backgrounded/foregrounded, sweep quality-streak leak
  - stop truncateFilename overflow + formatCompactNumber "1000.0K" boundary (F65/F66)
  - unconditional VoIP registration, dark-chrome text contrast, defensive audio unwraps (#1484)
  - extract shared CallTypeBadgeView, drop unreachable a11y label (#1476)
  - treat Mongo P2034 write-conflict as retryable on endCall/leaveCall too (#1480)
  - stop orphaning offline messages after a Redis blip, bound participantId cache
  - secondary identity rows — languages · country · timezone
  - dual-emit message:read-status-updated alongside legacy event
  - profile-header enrichment — presence · completion ring · E2EE · member-since (#1482)
  - support hyphenated usernames end-to-end via MENTION_HANDLE_CHARS SSOT (F60)
  - derive worker drain lanes from a kind→lane SSOT (#1478)
  - make post/comment reaction removal idempotent
  - header title follows displayName like the list row
  - normalize language-code case at all write/read boundaries (F63/F64)
  - close duplicate-reaction race in AttachmentReactionService
  - three-state presence dot on friend rows (#1474)
  - text tool — centered editing, 6 new fonts, visible weights, diamond/cloud/speech frames
  - ship customName (and unstrip reaction) in the list payload
  - socket conversation:updated no longer clobbers DM display names
  - resolveUserLanguage lowercases in-app prefs — case parity with resolveUserLanguagesOrdered (F62)
  - stop CallView defaulting callManager to CallManager.shared (P1-16)
  - @username fallback uses the module's Unicode boundary, not ASCII (#1464)
  - per-filter chip counts on the Contacts list (#1470)
  - drop the chip on Épingles to pin the conversation
  - bump CallSession.version on all terminal writers
  - comment_reaction honors commentLikeEnabled, no opt-out bypass (F59)
  - durable Room cache for Discover suggestions cold-start paint (#1466)
  - stop stale offline broadcast on anonymous reconnect race
  - comment-reaction carries the real postType, no REEL/STATUS collapse (F58)
  - edge auto-scroll while dragging the chip (Phase 3)
  - auto-scroll aux bords pendant le drag de chip (Phase 3 long-press)
  - STUN-only fallback no longer strands calls without TURN
  - friends Room cache for cold-start paint (#1461)
  - the card sits flush under the expiry line — top vertical alignment (C-DIR5)
  - media load failures speak up (C16, targeted audit 4)
  - empty texts are purged when inline editing ends (C15, targeted audit 3)
  - VoiceOver speaks the UI's language on the chrome (C14, targeted audit 1)
  - gradient backgrounds end-to-end — format, three renderers, palette row (C11)
  - trim redundant comments that overflowed a byte-bounded test window
  - complete fr/en/es/de coverage for all 108 story.\* keys (C12)
  - unbreak pre-existing structural/behavioral CI tests
  - discreet undo/redo — header icons exist only when the trajectory allows (C9 inc.4+5)
  - hasMentions Unicode-aware — detect accented @DisplayName (F57)
  - global undo/redo apply snapshots; media purge becomes lazy (C9 inc.3)
  - close camera-state race, guard doomed CallKit transactions, drop dead code
  - durable offline friend-request send with cmid idempotency (#1458)
  - global undo capture — one debounced trigger, gap-free by construction (C9 inc.2)
  - HistoryStore — pure state stack for global undo (C9 inc.1)
  - carded canvas no longer reserves the hidden header, viewport zoom resets on carding (C-DIR4 bug 4)
  - hung-participant detector in call-reliability-report
  - letterbox takes the slide background colour in full-chrome (C-DIR4 bug 2)
  - letterbox du canvas 9:16 aux couleurs du fond du slide en présentation libre (BUG-2 C-DIR4)
  - background colour applies instantly + draft resume no longer restores an empty composer (C-DIR4 bugs 1&3)
  - stickers get a single source of truth — currentEffects passthrough (C13)
  - self-heal playback when the primary player is stuck .paused (C-DIR3)
  - reword close() comment so it doesn't self-match the new test
  - flush pending DataChannel bye before peer connection teardown
  - unified chrome — header follows the FABs, collapsed-band handle removed (C-DIR2 b/c/d)
  - stickers are reachable again — picker wired into the Text panel (C8)
  - nonisolated data-channel value types — unbreak CallSignalIndicatorTests compile
  - durable offline block/unblock via the outbox (block-outbox-durable)
  - the add-story badge no longer gets clipped (user report)
  - ghost handle to recover hidden chrome (C3)
  - unbreak main build — register CallSignalGlyph.swift in pbxproj, hoist typealias out of ViewBuilder body
  - slide opening effect reachable by gesture from the Fond panel — VM-owned state (C1)
  - the Transitions sheet becomes real — slide opening-effect picker (C7)
  - transient quality pills, color-coded signal glyph, WhatsApp-style banner, instant remote hangup
  - add-slide affordance at the end of the slide strip (C6)
  - gesture exit for viewport zoom — double-tap resets, near-identity pinch snaps to 1.0 (C4)
  - exécution phasée — le run se termine connecté au compte de test
  - timeline FAB/tile/swipe-up open the timeline sheet instead of an empty band panel (C5)
  - sync reels affinity caches on post edit/delete (F55)
  - cache-first Discover suggestions (empty-query) (#1451)
  - single-flight SUB receive + silence watchdog — translation return channel self-heals
  - map Mongo P2034 write conflict on join to the existing conflict-retry path
  - Dynamic Type for MentionSuggestionPanel (139i)
  - background URLs are allow-listed — no more viewer IP-leak (W7)
  - hard-delete no longer orphans media rows forever (G7)
  - single canonical visibility filter (G5)
  - reaction self-echo no longer double-counts likeCount (F56)
  - zoom transition on secondary surfaces (U1 inc.2)
  - zoom transition from tray bubble to viewer on iOS 18+ (U1 inc.1)
  - stop logging DTMF digits and transcript content
  - EXCEPT/ONLY can no longer publish without an audience (W6)
  - Blocked-users tab + BlockCache SSOT binding the resolver seam (#1446)
  - EXCEPT/ONLY audience picker in the story composer (W3 inc.2)
  - COMMUNITY visibility in the story composer + visibilityUserIds plumbing (W3 inc.1)
  - intra-slide crossfades render in the web viewer (W1 inc.4)
  - intra-slide crossfades finally render at playback (R14)
  - Dynamic Type for KeypadTab (138i)
  - local mutations persist through the dirty-flush path (R12 inc.2)
  - silent refresh consumes the G1 delta-sync (R8 inc.1)
  - Discover live user-search with inline connect (#1443)
  - keyset cursor pagination on the stories tray (G1c)
  - lean tray projection on GET /posts/feed/stories (G1b)
  - undo/redo history survives a hard crash (E4 inc.2)
  - Dynamic Type for MessageListView swipe indicator (136i)
  - remove dead FirebaseNotificationService FCM sender (F51)
  - unit-fetch out-of-tray stories by postId on deep link (R4 inc.2)
  - Dynamic Type for SyncPill (135i)
  - close duplicate-reaction race with atomic upsert
  - forward real postType + ephemeral context on socket reaction notifications
  - hop CXPlayDTMFCallAction to MainActor; tie TURN TTL to CallCleanupService
  - online-first friends list + cross-screen cache reconciliation (#1434)
  - guard mark-unread cursor rewind against a fresher concurrent read
  - friendship & relationship-state SSOT (#1431)
  - remove dead handleIncomingOffer, dedupe call-notice presentation logic
  - exclude source language from story caption translation targets
  - the draft-resume card replaces the bare text alert (U4 increment 2)
  - DraftResumeCard building block (U4 increment 1)
  - Dynamic Type + a11y for AchievementBadgeView (134i)
  - regenerate pbxproj — drop phantom AudioEffectsPanel.swift reference
  - viewedAt timestamp alongside isViewed — soft migration (R11)
  - replay message edits/deletes to offline recipients too
  - VoiceOver custom actions for prev/next story navigation (U6 increment 2)
  - VoiceOver announces slide changes in the reader (U6 increment 1)
  - preload the next slide's media (W5)
  - live story deletion and per-text-object translation merge (W4)
  - legacy story content resolves over the full language chain (R10)
  - fix two self-inflicted test assertions from the previous commit
  - client expiry fallback aligned with the server's 21h (G6)
  - read overlay text from canonical `text`, not legacy `content`
  - CXAnswerCallAction hold + system-PiP frozen-frame placeholder
  - key typing-indicator roster by userId, not display name
  - adaptive video-sender-cap plan (network + thermal) (#1417)
  - haptic ticks on slide change and buffering freeze/resume (U2)
  - live translation + delete on the feed realtime hook (W4)
  - stop leaking CallParticipant.analytics on active-call route
  - enqueue offline recipients on the WS message:send path too
  - foreground media-object keyframes animate too (W1 increment 2)
  - text-object keyframes animate in the web reader (W1 increment 1)
  - auto-advance timer freezes while the primary video buffers (W2)
  - textObjects translate to the audience's real languages (G3)
  - single translation pipeline for story content (G2)
  - identity-aware active-call teardown (#1415)
  - encrypt the stories tray store like every other social store (R9)
  - logout purges the story draft AND the persisted publish queue (E9)
  - actually run the legacy offline-queue migration at boot (E6)
  - the queue cleans up its media copies (E10 disk leak)
  - last-message preview excludes soft-deleted messages
  - screen-capture participant spoofing, pocket-dial, HIG hit targets, stale-peer cleanup
  - sniff the URL extension before routing media to disk stores (R7)
  - story view receipts are durable via the outbox (R6)
  - chip drop moves the conversation onto a section header
  - delta-sync via ?updatedSince on the stories tray (G1)
  - debounce the sending clock glyph for sub-200ms sends (B.4)
  - write-ahead makes the online publish survive process kills (E5)
  - undo/redo history survives the timeline sheet lifecycle (E4)
  - flush the open timeline into the slide before persisting (E3)
  - deep-link container serves the cached tray before forcing network (R4)
  - identity interstitial between story groups (user directive)
  - call-reliability-report — prod health report for the multi-hour calls goal
  - periodic in_progress analytics snapshots survive app kills
  - update two source-guard tests for the TURN-refresh watchdog refactor
  - split press-state detector from long-press trigger
  - discreet buffering indicator during mid-slide stalls (R3)
  - propagate deviceLocale to the last 2 resolveUserLanguage sites
  - freeze timeline while the bg image bitmap is still loading (R2)
  - debounced draft autosave — editing survives hard crashes (E1)
  - retry TURN refresh on dropped ACK, surface busy/failure feedback, finish a11y hints
  - DM dedup reopens the most recently ACTIVE duplicate
  - auto-dismiss call-waiting banner on remote end (#1411)
  - buildEffects no longer wipes timeline-authored fields (E2)
  - pin viewed-story media until expiry (R5 wiring)
  - serialize updateOnNewMessage per conversation to stop a lost-update race
  - direct-DM creation is idempotent — reopen the existing DM
  - pinning exempts keys from DiskCacheStore eviction (R5)
  - amplify row scale animation dampingFraction for visible rebounce
  - freeze timeline while slide audio is still caching (R1)
  - Dynamic Type for MoodReplyConfirmationOverlay (132i)
  - persist end-of-call analytics on CallParticipant
  - Dynamic Type + a11y for MessageDetailSheet hero glyphs (131i)
  - apply URL-only translation guard on all 3 entry points
  - negotiationTimeMs separates WebRTC setup from human ring time
  - add negotiationTimeMs metric for WebRTC connection timing
  - Dynamic Type for ReelFeedCard glyphs (130i)
  - wire dead PiP rotation hook, fix VoiceOver double-read, fix Dynamic Type clipping
  - guard REST message-delete lastMessageAt with optimistic concurrency
  - re-anchor already-answered source-guard on the real subscriber
  - call_answered_elsewhere silent push — multi-device socketless ring dismissal
  - call-waiting banner for a second incoming call (#1403)
  - la liste de conversations scrolle à nouveau — retrait du DragGesture plein-ligne
  - call_cancel silent push ends phantom ringing (client side)
  - fan out sendToUser to device tokens in parallel
  - call_cancel background push kills phantom ringing on socketless devices
  - rate-limit reconnect/ICE-refresh handlers, remove dead signaling hook
  - quality-alert requires sustained degradation and excludes the reporter
  - remove unauthenticated-admin debug notification routes
  - quality-monitor warm-up gate fails closed when start date is nil
  - GC tier 3 spares multi-hour calls with fresh heartbeats
  - Dynamic Type + a11y for CameraView (129i)
  - re-wire MessageDraftMediaStore + 2 test files into pbxproj, purge warnings
  - useSocialSocket retries once the socket bootstraps
  - Dynamic Type for FeedPostCard action-bar glyphs (128i)
  - forward badge as android notificationCount (F1 Android)
  - keep the literal videoToggleTask?.cancel() call CI checks for
  - toggleVideo() can run two concurrent camera/transceiver actuations on rapid double-tap
  - GC force-end never fanned out call:ended to ringing callee's user room
  - typing:start/stop now require active conversation membership
  - WebRTC-plumbing outbound emits (call-webrtc-plumbing-emits) (#1393)
  - Dynamic Type for BubbleDeliveryCheck status glyphs (127i)
  - photothèque du composer — long press vidéo, actions Ajouter/Sélectionner/Éditer, présélection picker, Liquid Glass iOS 26 (#1389)
  - correct two false-positive assertions from prior commit
  - getReels curseur chronologique (lossless) + languageCodeSchema accepte les 639-3
  - CallEffectsOverlay ObservedObject re-subscription bug + a11y/dead-code cleanup
  - resync feed room + typing keepalive across reconnect/long sessions
  - badge unread embarqué dans le push — badge d'icône iOS et widget gelés app fermée (F1)
  - appel jamais décroché = missed (critère answeredAt) + garde FSM reconnecting
  - refactor conversation row long-press gesture with proper priority
  - fallback pendingCount cohérent avec pendingUIItems sur échec de lecture (item H cause D)
  - reclaim visibility-timeout des rows .inflight orphelines (item H)
  - les pièces jointes du brouillon survivent au kill (phase 2 — câblage)
  - store durable des pièces jointes de brouillon de message (phase 1)
  - Dynamic Type + VoiceOver for conversation composer (iter 126i)
  - pure video-survival auto-disable policy (#1387)
  - curseur getReplies aligné asc + codes langue 639-3 acceptés
  - call:ended atteint l'appelé qui sonne (fanout rooms user)
  - réaligne le garde AdjustBitrate sur le merge BWE gated + pbxproj regen
  - auto-save du brouillon au passage en background (D1)
  - auto-retry of failed messages now forwards clientMessageId
  - indicateur qualité fiable + écran d'appel décalé de 30pt
  - action « Enregistrer » dans le menu appui-long (composant unifié)
  - Dynamic Type + VoiceOver for AttachmentLoadingTile (iter 125i)
  - hooks onSaveRequested sur les viewers SDK + câblage du fullscreen média des bulles
  - report « downloaded » best-effort dans le coordinateur unifié (parité P7-9)
  - câbler audio + galerie média sur le composant unifié Enregistrer
  - Dynamic Type + VoiceOver for iPad panel header (iter 124i)
  - implement drag-to-reorder during long-press with smooth transition
  - correct offset windows and setEffect precondition in new tests
  - atomic conditional consume closes brute-force TOCTOU on SMS reset attempt caps
  - remplacement 1-réaction-par-user + gate messages système dans toggleReaction
  - adjust scale animation timing for smoother rebounce
  - sémantique de remplacement 1-réaction-par-user + gate messages système
  - resolve duplicate CallEffectsOverlayAccessibilityTests class
  - restore VideoConfig, actually used by P2PWebRTCClient
  - implement row scale animation reset on menu dismiss
  - thread-safety, dead code, and VoiceOver gaps in calling stack
  - add long-press scale animation to conversation rows
  - connection-quality classification core + live signal indicator (#1381)
  - type decodePayload's corrupt-payload error as MeeshyError
  - gate FRIENDS-visibility posts through buildVisibilityFilter
  - re-join call room on socket reconnect (production component)
  - idempotence du remove de réaction sur le chemin socket
  - DELETE de réaction idempotent (not-found → succès, pas 404)
  - pure telecom-connection policy (ConnectionService state reports) + reporter fold (#1377)
  - totalMembers exclut le sender par identité (pas -1 aveugle)
  - bootRecovery détecte aussi les fichiers média visuels manquants au crash
  - annuler un envoi média offline balaie ses fichiers (fuite disque)
  - pure call-audio policy (ringback/ringtone/cues) + tone controller fold (#1375)
  - le merge edit-into-send offline détruisait les médias en attente
  - dead-letter immédiat des rejets serveur 4xx permanents dans l'outbox
  - watermark conversation-list dérivé de l'horloge locale (R15b)
  - watermark de gap-recovery messages empoisonné par clock-skew (R15a)
  - SyncEngine A5.4 — resync notifications au reconnect (fenêtre aveugle)
  - SyncEngine A5.3 — resync notifications sur gap de séquence
  - SyncEngine A5.2 — hook gapDetected sur SyncSeqTracker
  - SyncEngine A5.1 — décodage \_seq + tracker de gap (bénéfice multi-device)
  - terminal statuses are immutable — leave/disconnect can no longer rewrite missed as completed
  - unify REST/socket CallService instance, harden markCallAsMissed, remove dead beacon fallback
  - report downloaded pour les documents (gap P7-9 P3 comblé)
  - enforce maxUses cap atomically (F47 TOCTOU)
  - BlockActionCoordinator — block/unblock durable pour les sites Views (R6-4 complet)
  - BlockedViewModel.unblock via l'outbox durable (R6-4 incr.2, 1/N sites)
  - primitive block optimiste + fix caveat swipe labels périmés (R6-4 incrément 1/2)
  - atomic increments for calibrateProfile counters (lost-update race)
  - release active-call claim on ringing-timeout missed + self-heal leaked claims
  - verrous + master PIN purgés au logout (P7-11, invariant 9)
  - ConversationLockManager logout hook — purge cross-account leak (P7-11)
  - close cap TOCTOU — reserve slot atomically before creating relation (F47)
  - réconciliation complète périodique — purge des conversations fantômes hard-supprimées (P7-10)
  - release active-call claim on missed-timeout, harden signaling authz, fix waiting-banner reject
  - propagate profile changes to conversation partners (USER_UPDATED)
  - une panne gateway ne consomme plus le budget de retries de l'outbox (P7-7)
  - le composer ne se verrouille plus pendant qu'un message est sur l'horloge ⏳
  - live in-call duration timer (slice call-duration-timer) (#1371)
  - purge du cache HTTP URLCache au logout (T15b-b, invariant 9)
  - C8 — dédup des sockets same-user au join (last join wins)
  - document Dynamic Type freeze doctrine for FeedView chrome (iter 123i)
  - tolerate GRDB Date round-trip noise in markEdited ordering guard
  - decode editedAt onto APIMessage (CI compile failure)
  - guard message:edited against out-of-order stale delivery
  - atomic increments in ConversationMessageStats edit/delete hooks (F48)
  - stop clearing ringing timeout on early-join; fix web duplicate-offer race
  - call:join ne désarme plus le ringing timer — l'answer SDP et les chemins terminaux le possèdent
  - Dynamic Type + VoiceOver for EmojiPickerSheet (iter 122i)
  - Dynamic Type for message context menu (iter 121i)
  - réconciliation call:end aussi sur ACK-échec (chaos-test 2)
  - joinCall transitionne vers RINGING — l'early-join du callee n'est pas un décrochage (item F matérialisé)
  - version-guard call-termination writes, align REST/socket end-call authorization
  - guard read/delivery cursors against out-of-order regression
  - deep-link a full-screen call push into the incoming-call screen
  - un appel sortant non décroché ne bascule plus en écran connecté 00:00 — garde FSM .reconnecting, horloge d'appel, bannières Dynamic Island, avatars duo + fond profil
  - hide decorative conversation backdrop from VoiceOver (iter 120i)
  - grâces disconnect affinées — extension si socket vivant, grâce courte pré-answer (chaos-tests prod)
  - guard stale ICE-restart/call-waiting async continuations
  - close lost-update race on message reaction summary
  - Dynamic Type + VoiceOver for message-bubble media grid (iter 119i)
  - route FCM call pushes to a full-screen incoming-call notification (#1354)
  - reconcile with concurrent session's merged fix, keep only the surviving bug
  - pre-existing CI failures — PiP filter button a11y hint, dead localization keys, stale auto-hide test
  - CallKit informé sur tout teardown .failed, TURN préservé sur End & Answer, bannière call-waiting nettoyée, indicateur signaling dégradé
  - iOS CallKit/TURN/banner triad + gateway endCall idempotency gap
  - un restart/blip ne tue plus un appel établi — ownership disconnect, réhydratation boot, hygiène timers
  - recover socket.io realtime delivery after reconnect_failed
  - réaligner 3 source-guards CallView hérités du merge main
  - exact @mention resolution — anchor Unicode name boundaries
  - pure incoming-call push decision core (#1347)
  - Dynamic Type + VoiceOver for ConversationView message-row affordances (iter 118i)
  - gateway audit follow-through — leftAt persistence, missing summary index, force-leave missed path, ICE rate limit
  - drop stale retranslation results (edit ordering race)
  - survive gateway restart — active P2P call no longer cut by signaling-socket drop
  - remove dead previewRouter + unify conversation preview width (deferred NITs)
  - dedup key must include messageId, not just conversation
  - appels — vidéo distante, join VoIP fiable, chrono CallKit, contrôles cadre
  - Dynamic Type in action menu + inert-modifier cleanup (deferred review)
  - call:missed contract + video layout on remote escalation
  - restore call metric glyphs and move call time bottom-right
  - contraste blanc-sur-verre en Light + a11y overlay (déférés revue)
  - dedicated Calls bottom-nav tab + re-dial gesture (calls-tab-nav) (#1340)
  - dismissContextMenu — purge asyncAfter annulable
  - bannière DM strippée sur la route LIST (schéma minimal)
  - remove dead activeCallSession() call breaking sdk-tests compile
  - close call:heartbeat authz gap to strict active-participant check
  - gate CallKit plateforme — le simulateur pilote l'appel in-app
  - add missing banner arg to APIConversationUser test fixture
  - Dynamic Type + VoiceOver for StoryViewerView canvas (iter 117i)
  - stale-broadcast ordering races + unbounded conversationId cache
  - remontee banniere de profil (DM) + boutons header conversation en glass
  - hide decorative onboarding backdrop from VoiceOver + Dynamic Type CTA (iter 116i)
  - evict VoIP dedup entry on CallKit report failure (busy path)
  - close initiateCall/joinCall TOCTOU races on concurrent starts
  - Dynamic Type doctrine for CallView control bar (iter 115i)
  - update stale transcription-segment tests for active-participant authz
  - Dynamic Type + VoiceOver for StoryExportShareSheet (iter 114i)
  - hide dead voice-effects panel (video filters only)
  - coalesce reconnect triggers, epoch half-open re-arm, TURN refresh at restart, stuck-muted fallback
  - raffinements apercu long-press conversation
  - redesign system call bubble — compact, direction-aware, timestamped
  - Dynamic Type + VoiceOver for OnboardingFlowView chrome (iter 113i)
  - close conversation-membership authz bypass on transcription-segment
  - thread real conversationId into outgoing call route (call-nav-conversation-thread)
  - apercu long-press conversation enrichi (banniere, avatar, actions, dernier message)
  - action Renommer dans le menu contextuel conversation
  - Dynamic Type + VoiceOver for OnboardingStepViews (iter 112i)
  - close membership-check bypass, post call-summary on every terminal path
  - restore reaction notifications on the socket path
  - bind the realtime socket to the auth session (realtime-session-coordinator) (#1321)
  - restore CallMediaConfig.swift — VideoConfig is a real prod dependency
  - scope Opus SDP munging to audio, enforce per-call authz, drop dead code
  - converge formatDuration onto shared formatClock (iter 74)
  - idempotent P2002 handling on message reaction add
  - zoom in/out sur l'overlay long-press conversation
  - Dynamic Type for StatusBubbleOverlay (iter 111i)
  - MessageMoreSheet en grille verre (Liquid Glass iOS 26)
  - Dynamic Type + VoiceOver for ReelsPlayerView (iter 110i)
  - fold CallSignalManager into CallViewModel (VM-fold)
  - restore conversation long-press menu (remove .onDrag conflict)
  - ACK-based call:initiate (emitInitiate + pure parser) (#1311)
  - custom conversation context menu (icons on iOS 26)
  - clear participant heartbeat on mid-call leave
  - preserve supported ISO 639-3 language codes in normalizeLanguageCode
  - add safety-net expiry for stuck remote typing indicators
  - converge local formatDuration onto shared formatClock
  - stop SDP-munging RED into audio offers/answers, use setCodecPreferences
  - typed FRIEND_REQUEST_NEW/ACCEPTED/REJECTED events
  - context-menu icons + story quit alert legibility
  - Dynamic Type + VoiceOver for StoryTrayView (iter 109i)
  - apply late/refreshed TURN credentials to a live peer connection
  - recent/missed-calls list UI (CallHistoryViewModel + screen) (#1304)
  - native-lean long-press menu (reactions + bubble + vertical list)
  - emit friend-request:cancelled so the other party's list syncs live
  - Dynamic Type for StoryViewerView sidebar/header (iter 108i)
  - resistant swipe on audio/video bubbles
  - route quick affordances to native MessageMoreSheet
  - menu longpress - new components + MessageDetailSheet decomposition
  - Dynamic Type + VoiceOver for FeedPostCard media (iter 107i)
  - Dynamic Type + VoiceOver for AudioEffectsPanel (iter 106i)
  - serialize camera switch, close stale peer connection, fix VoIP dedup eviction
  - VoiceOver labels for feed attachment remove buttons (iter 105i)
  - Dynamic Type + VoiceOver for AudioEffectsPanel (iter 105i)
  - Dynamic Type + VoiceOver for VideoFilterControlView (iter 105i)
  - Dynamic Type + VoiceOver for ShareLinksView (iter 104i)
  - VoiceOver labels for AudioFullscreenView icon-only controls (iter 103i)
  - supprime à nouveau le doublon d'import copyToClipboard (régression réintroduite) (#1291)
  - adopte la source unique copyToClipboard dans TwoFactorSettings (F30-f) (#1284)
  - Dynamic Type + VoiceOver for EditPostSheet (iter 100i)
  - Dynamic Type + VoiceOver for ConversationMediaGalleryView (iter 103i)
  - Dynamic Type + VoiceOver + content selection for LicensesView (iter 98i)
  - finish Dynamic Type + VoiceOver for LoginView (iter 102i)
  - resolve committed merge-conflict markers in routine uiux docs
  - Dynamic Type + VoiceOver for TrackingLinksView (iter 101i)
  - adopte la source unique copyToClipboard dans TwoFactorSettings (F30-f)
  - Dynamic Type + VoiceOver for CommunityLinkDetailView (iter 99i) (#1272)
  - supprime le doublon d'import copyToClipboard (régression merge parallèle) (#1266)
  - resolve committed conflict markers from triple 93i collision
  - Dynamic Type + VoiceOver + content copy for SupportView (iter 95i) (#1262)
  - remove duplicate copyToClipboard import introduced by main merge
  - call-history repository (REST + Room cache-first SWR)
  - Dynamic Type + VoiceOver for ConversationListView overlays (iter 94i)
  - remove duplicate copyToClipboard import breaking the build
  - source unique presse-papier pour les pages links — iter 70
  - Dynamic Type + VoiceOver for ForwardPickerSheet (iter 100i)
  - Dynamic Type for MessageOverlayMenu (iter 99i)
  - Dynamic Type + VoiceOver for UserStatsView (iter 98i)
  - copy diagnostics via long-press menu in AboutView (iter 98i)
  - remove duplicate accessibilityElement on AffiliateView stat card (iter 92i)
  - trim background-observer comment to fit CI's fixed-window source test
  - serialize hold/unhold video ops, fix glare-path state leak, GC race guard
  - update quality-report test for participant-gated persistCallStats
  - moderator-kick wrong-participant, quality-report authz gap, ringing-call CallKit gap
  - thread-safe audio effect counters, cache-first filter switch, a11y hint (#1257)
  - Dynamic Type + destructive-red token for EffectsPickerView (iter 87i)
  - source unique formatFileSize — iter 70
  - relocate stragglin docs, drop orphan MARK dividers
  - annule les vérifications de disponibilité obsolètes (AbortController) — iter 70
  - split StoryComposerView into view-builder extensions
  - Dynamic Type + VoiceOver for AddParticipantSheet (iter 97i)
  - pure call-journal model (CallRecord + CallDirection/CallMediaType) (#1254)
  - clôture F30 — unification presse-papiers via source unique (iter 70)
  - Dynamic Type + VoiceOver for NotificationSettingsView (iter 96i)
  - source unique de validation d'ObjectId MongoDB — iter 69 (#1251)
  - split StoryCanvasUIView into method extensions
  - split StoryComposerViewModel into method extensions
  - extract free top-level types into dedicated files
  - widen access private→internal on the 3 refactor targets
  - content selection + VoiceOver for TwoFactorSetupView (iter 95i)
  - converge conversation-share clipboard fallback on copyToClipboard (F30-d, iter 68)
  - Dynamic Type + VoiceOver for SharePickerView (iter 94i)
  - Dynamic Type + VoiceOver for AffiliateView (iter 94i)
  - Dynamic Type + VoiceOver for MemberManagementSection (iter 94i)
  - Dynamic Type for SharePickerView (iter 94i)
  - Dynamic Type for LocationPickerView (iter 93i)
  - Dynamic Type + VoiceOver for LocationPickerView (iter 93i)
  - converge partage conversation (fallback presse-papier) vers copyToClipboard (F30-d, iter 68)
  - Dynamic Type + VoiceOver for ConversationPreferencesTab (iter 93i)
  - CallSignalManager — inbound call:\* → SharedFlow<CallEvent> + outbound emit table (#1230)
  - render comment audio/media in feed preview + fix notification badge truncation
  - Dynamic Type + VoiceOver for AffiliateView (iter 92i)
  - Dynamic Type + VoiceOver for NewConversationView (iter 91i)
  - Dynamic Type + VoiceOver for CommunityLinksView (iter 91i)
  - Dynamic Type + VoiceOver AffiliateView (iter 91i)
  - Dynamic Type + VoiceOver for AffiliateView (iter 91i)
  - converge partage conversation vers copyToClipboard (F30-d)
  - Dynamic Type + VoiceOver for DataExportView (iter 91i)
  - stop audio-toggle self-echo, rate-limit transcription relay, reset PiP fps
  - Dynamic Type + VoiceOver DataExportView (iter 90i)
  - Dynamic Type for NewConversationView (iter 90i)
  - converge copie identifiant groupe vers copyToClipboard (F30-c)
  - Dynamic Type + VoiceOver for MagicLinkView (iter 90i)
  - converge partage feed/reel vers copyToClipboard (F30-b)
  - Dynamic Type + VoiceOver + palette for EffectsPickerView (iter 89i)
  - converge copie contenu/lien vers la source unique copyToClipboard (F30-a) (#1216)
  - Dynamic Type + i18n/render fixes for DeleteAccountView (iter 88i)
  - Dynamic Type + VoiceOver for DeleteAccountView (iter 88i)
  - Dynamic Type + VoiceOver for voice profile wizard (iter 87i)
  - remove duplicate getUserInitials import in u/[id] page
  - route legacy slide.mediaURL background via directURLIfAny (WS5.4a)
  - retire le code mort du filtre temps-reel Story
  - restaure isExpired reverté par le même merge parallèle — iter 64 (#1210)
  - retire le dead StoryFilteredLayer, extrait StoryFilterKind
  - notify peer on local SDP failure, drop dead emitCallEnd overload
  - Dynamic Type + VoiceOver for storage & auto-download settings (iter 83i)
  - retire les références orphelines ReplyThread du pbxproj
  - story par défaut en Contacts + filtres par média
  - restaure formatCompactNumber reverté par un merge parallèle — iter 63 (#1208)
  - inbound call:\* signalling event models + pure CallEvent mapper (#1207)
  - Dynamic Type + VoiceOver headers for AboutView (iter 86i)
  - restaure formatCompactNumber reverté par un merge parallèle — iter 63
  - source unique de la troncature de texte (truncate) — iter 62 (#1203)
  - VoiceOver selection semantics for the language picker (iter 85i)
  - Dynamic Type + VoiceOver for StarredMessagesView (iter 85i)
  - source unique du formatage de durée média (formatClock) — iter 62
  - corrections du review présence (conformité + decay)
  - source unique du compteur compact (formatCompactNumber) — iter 61 (#1201)
  - Dynamic Type + VoiceOver for EditProfileView (iter 84i)
  - source unique du prédicat d'expiration (isExpired) — iter 60 (#1199)
  - présence datée + colorée après le pseudo (fiche profil, Lot 6 iOS)
  - keep PR1157/PR1148 catalog-backed localization (fix dead keys)
  - Dynamic Type + i18n parity for legal screens (iter 83i)
  - unify sheet grabber affordance (iter 79i)
  - source unique du « temps restant avant expiration » — iter 59 (#1187)
  - Dynamic Type parity for call-screen inline glyphs (iter 79ib)
  - Dynamic Type for the feed attachment composer (iter 79i)
  - source unique du temps restant avant expiration — iter 59
  - restore contacts avatar initials to getUserInitials (iter 59, anti-régression F26c-c(b))
  - Dynamic Type for the fullscreen audio player (iter 82i)
  - complete ConversationSettingsView localization (iter 78i)
  - Dynamic Type for the active sessions screen (iter 82i)
  - source unique de la classification du temps relatif — iter 58 (#1177)
  - relay real toggle-media errors + unify CallService instance (RC-4)
  - RelativeTimeFormatter.lastSeenString (Lot 6 iOS)
  - localize ConversationLockSheet + VoiceOver/Dynamic Type (iter 81i)
  - source unique des initiales — profil public → getUserInitials (iter 58, F26c-c(c))
  - source unique des initiales — page profil app/u/[id] → getUserInitials (iter 58)
  - stop duplicate Socket.IO listener registration on reconnect-adjacent calls (iter 57)
  - source unique des initiales — famille contacts → getUserInitials — iter 57 (#1181)
  - import Combine in OfflineQueueTests (CI restore)
  - add missing import Combine to OfflineQueueTests (unblock sdk-tests CI)
  - CountryPicker VoiceOver labels + sheet grabber (iter 80i)
  - Dynamic Type for the feed post composer (iter 78i)
  - initiales admin/users → getUserInitials + fix(gateway/test) createUnifiedAuthMiddleware mock — iter 56 (#1170)
  - consolidate destructive/error/expired reds to MeeshyColors.error (iter 78i)
  - complete story-viewer localization catalog (iter 79i)
  - :feature:calls CallViewModel + minimal call screen (Calls slice) (#1169)
  - localize MessageOverlayMenu message menu (iter 78ib)
  - localize Router route/scene titles + deep-link error (iter 79i)
  - source unique des initiales — MemberSelectionStep → getUserInitials — iter 55 (#1167)
  - :feature:calls CallViewModel + minimal call screen (Calls slice)
  - Dynamic Type for the link preview card (iter 78i)
  - source unique des initiales — MemberSelectionStep → getUserInitials (iter 55)
  - tokenize semantic hardcoded colors to MeeshyColors (iter 78i)
  - supprime le module mort utils/user.ts (clôt le cluster getUserDisplayName) — iter 54 (#1163)
  - localize SharePickerView chrome strings (iter 77i) (#1162)
  - Dynamic Type ConversationDashboardView (iter 71i)
  - source unique du nom d'affichage (username-first → canonique) — iter 53 (#1161)
  - source unique du nom d'affichage (déjà displayName-first) — iter 52 (#1159)
  - Dynamic Type for the invite friends sheet (iter 76i)
  - source unique des initiales d'avatar (objet) — iter 51 (#1158)
  - localize message quick-action menu — iter 71i
  - source unique des initiales d'avatar (string) — iter 50 (#1156)
  - harden call signaling against payload spoofing + DoS
  - mark EmojiGridCategoryTests @MainActor (iter 71i)
  - Dynamic Type 2FA security flow (iter 71i)
  - pure call-lifecycle FSM (core:model) (#1153)
  - localize emoji-picker category VoiceOver labels (iter 71i)
  - source unique du nom d'affichage — copies locales (iter 50)
  - source unique du nom d'affichage utilisateur (iter 49) (#1147)
  - Dynamic Type for the voice profile management screen (iter 75i)
  - consolidate hardcoded hex tints to MeeshyColors tokens on Support/Report screens (iter 71i)
  - categorised + searchable sticker picker (#1135)
  - localize 6 hardcoded French VoiceOver labels/hints (iter 71i)
  - source unique de la validation d'email + dernière horloge inline (iter 48) (#1146)
  - Dynamic Type for the conversation dashboard (iter 74i)
  - unifier formatDuration sur le canonique formatClock (iter 47) (#1141)
  - hoist actor-isolated pendingCount() out of XCTAssert autoclosure
  - re-apply await-hoist in PendingStatusQueueTests (merge reverted 87f85d68d)
  - restore iOS work reverted by the PresenceVisibilityService merge (84fedd79)
  - remove orphaned ReplyThreadOverlay.swift (complete #1122 cluster removal)
  - présence colorée + datée sur la fiche profil (Lot 6 web)
  - grace period before treating a transient socket drop as call-leave (P0-7)
  - localize hardcoded French VoiceOver strings (iter 73i)
  - remove ReplyThreadOverlay.swift resurrected by a merge artifact (unblocks CI)
  - Dynamic Type for the feed comments sheet (iter 72i)
  - hoist await out of XCTAssert autoclosure (iter 71i unblock)
  - unifier formatFileSize sur la source canonique partagée (iter 46) (#1136)
  - wire invite-user-modal row aria-label to selection state
  - guard call-waiting pending-clear against newer overwrite (#1133)
  - remove dead ReplyThreadOverlay to unblock iOS compile (iter 71i)
  - Dynamic Type for the 2FA security flow (iter 71i)
  - hoist await out of XCTAssertEqual autoclosure in PendingStatusQueueTests
  - remove ReplyThreadOverlay.swift resurrected by a merge artifact
  - guard call-waiting pending-clear against newer overwrite
  - repair invite-modal result row broken by merge (unblocks CI)
  - cap lastMessage.content preview at 300 code points in GET /conversations
  - PATCH /messages/:messageId now broadcasts message:edited and retranslates
  - join rooms before marking socket connected to close message-loss race
  - close TOCTOU race that could resurrect a deleted message with edited content
  - close TOCTOU race that could regress the delivered/read cursor
  - dedup offline delivery queue by messageId+eventType, not messageId alone
  - SyncEngine A3.2 — pagination cursor keyset composite /sync
  - SyncEngine A2.1 — emitWithSeq sur notification:new (event pilote \_seq)
  - SyncEngine A3.1 — endpoint /sync read-only, collection messages
  - SyncEngine A1 — UserEventSeq + SequenceService.nextSeq atomique
  - sliding window des sessions trusted — champ lastActivityAt (P7-3)
  - recordView — catch P2002 différencié + log des pannes réelles (P7-2)
  - AgentAdminRelay ne démarrait jamais — connect() avant subscribe()
  - harden two lost-update/out-of-order races on shared counter & cursor
  - unify 5 bounded-cache copies into a single BoundedTtlCache SSOT
  - bound participant-lookup cache (FIFO 5000 + expired sweep)
  - appels tués à tort — garde socket-zombie + sémantique leftAt (C5, 14 sites)
  - bound resolveConversationId identifier→ObjectId cache (FIFO 2000)
  - endCall() resolves pre-answer hangups as missed, not completed
  - claim activeCallId — matcher aussi les documents sans le champ
  - bound StatusHandler identityCache to stop unbounded typing-path growth
  - unify timeout via withTimeout helper, fix leaked timers
  - memoize participantLookup to cut per-message DB round-trip (B.3)
  - keep attachments on message:edit realtime broadcast
  - resolve Participant.id before handleMessage in agent + non-blocking-translation paths
  - ne plus exposer l'email des co-participants (PII)
  - respecter les prefs présence dans les listes (Lot 5)
  - drop dead-on-read maintenance of cursor.unreadCount (iter 57 / F23c)
  - mock createUnifiedAuthMiddleware in profile-extended tests
  - retry transient push failures + stop deactivating tokens on provider outages
  - scope push notification collapse-id per-conversation (#1140)
  - respecter les prefs privacy dans presence:snapshot (Lot 2, E1)
  - mock createUnifiedAuthMiddleware in profile.test (unblock CI)
  - ne pas divulguer la présence des membres via /links (Lot 2, E2)
  - retire la présence des payloads friend-requests (Lot 4)
  - typage viewer dans /users/search (authContext cast)
  - unifier la résolution d'avatar participant + corriger notSeenBy (iter 47)
  - gate présence dans /users/search (Lot 4)
  - batch resolveForTargets + gate /users/presence (Lot 2)
  - mock createUnifiedAuthMiddleware in profile.test.ts (unblock CI)
  - gate présence sur les lookups email/phone/id dédiés (Lot 3 fin)
  - gate présence sur la fiche profil (Lot 3/6)
  - PresenceVisibilityService (Lot 1/6 présence)
  - unread-count batch must exclude each participant's own messages (iter 46 / F23b)
  - collapse per-message unread counts to a single query (iter 45 / F23) (#1134)
  - calibrate coverageThreshold to CI-bun baseline (~9.5pp below local-node)
  - batch unread counts in one read (F23, iter 45)
  - deduplicate in-flight tasks — gateway retries no longer self-strangle long texts
  - repair stale outer-exception test in translation_processor
  - stop dividing torch threads by async worker count — inference ran 2× slow
  - sequential language fan-out — budgets now cover real inference time
  - proportional inference budget — long texts are translated again
  - boot import failure no longer permanently kills the audio pipeline
  - pin floating ML deps to stop non-deterministic Docker build breaks
  - sync uv.lock project version (unblock Test Python CI)
  - restore numpy<1.24 ESPnet constraint (revert breaking Dependabot #825)
  - import ESM avec extension .js + test-garde des imports relatifs
  - add .js extension to mention-parser import — prod gateway crash-loop
  - helper pur resolvePresenceVisibility (Lot 1/6 présence)

### Patch Changes

- Updated dependencies
  - @meeshy/shared@1.2.0

## 1.2.0

### Minor Changes

- 4c888a2: Premier release avec système de versioning automatisé

  **Corrections CI/CD:**

  - Fix scan Trivy pour utiliser les tags `latest` et `staging`
  - Standardisation tagging Docker: production → `latest`, staging → `staging`
  - Auto-génération de changesets depuis conventional commits

  **Fonctionnalités principales:**

  - Traduction vocale multi-locuteurs avec diarisation
  - Clonage vocal avec Chatterbox Multilingual (23 langues)
  - E2EE avec Signal Protocol
  - Magic Link et authentification 2FA
  - Notifications push Firebase
  - Cache multi-niveaux pour performance
  - Interface web Next.js avec i18n (FR, EN, ES, PT, IT, DE)
  - API Gateway Fastify avec ZMQ
  - Service ML Python avec Whisper, NLLB, TTS

  **Infrastructure:**

  - Docker Compose production et staging séparés
  - Traefik v3.6 avec Let's Encrypt
  - MongoDB 8.0 avec replica set
  - Redis 8 pour cache
  - Architecture monorepo avec Turborepo
  - CI/CD GitHub Actions complet

### Patch Changes

- Updated dependencies [4c888a2]
  - @meeshy/shared@1.1.0

## 1.0.40

### Patch Changes

- Mise en place du système de versioning automatisé avec Changesets

  - Ajout de Changesets pour la gestion sémantique des versions
  - Script de synchronisation package.json → VERSION files
  - Workflow de release automatisé avec tags Docker multiples
  - Tags Docker avec SemVer (1.0.41) et date/heure (20260124.143022)
  - Documentation complète du système de versioning

- Updated dependencies
  - @meeshy/shared@1.0.1
