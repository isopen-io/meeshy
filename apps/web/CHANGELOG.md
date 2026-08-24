# @meeshy/web

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

## 1.25.12

### Patch Changes

- d49fbfb: La boîte d'envoi du socket survit désormais à une coupure survenue pendant son vidage, et plus rien ne la double.

  **Durabilité.** `SocketIOOrchestrator.processPendingMessages()` évaluait la liaison une seule fois, en tête de fonction, puis parcourait la file entière. Or cette file n'existe QUE parce que le lien a déjà lâché une fois, et un lien qui vient de revenir est celui qui peut relâcher au milieu du vidage : le tour suivant appelait l'envoi avec un socket mort, qui rend `{ success: false }` sans rien émettre. Le reliquat — déjà retiré de la file, minuterie d'expiration déjà annulée — s'effondrait d'un bloc en une rafale d'échecs dont aucune tentative n'avait quitté l'onglet, et l'utilisateur voyait tout son envoi virer au rouge d'un coup pour une microcoupure. La liaison est réévaluée à chaque tour, avant le retrait : sur lien mort le vidage sort, le reliquat reste en file avec sa minuterie armée, et la prochaine authentification de socket le reprend. Une tentative RÉELLE reste terminale — un ack en erreur, ou une coupure survenue pendant l'attente, sort le message de la file — sans quoi la boucle tournerait sur un lien pourtant vivant. `isProcessingQueue` passe sous `try/finally` : un verrou de vidage laissé à `true` ne scellerait pas un tour, il scellerait la file pour la session.

  **Ordre.** Le chemin d'envoi direct ne regardait que la liaison, jamais le reliquat : un message tapé pendant le vidage — ou dans la fenêtre entre la reconnexion du socket et son authentification, qui est ce qui DÉCLENCHE le vidage — partait avant des messages plus anciens encore en attente, et l'horodatage serveur entérinait l'inversion. La règle devient celle de toute boîte d'envoi : tant qu'elle contient quelque chose, on entre par la queue. La liaison ne décide plus que de la suite — attendre une reconnexion (lien mort) ou relancer le vidage sur-le-champ (lien vivant), faute de quoi on aurait échangé une inversion d'ordre contre un blocage.

## 1.25.11

### Patch Changes

- cc31c68: L'arbitre de version garde désormais les deux portes d'écriture des préférences de conversation, et un onglet revenu au premier plan reprend son temps réel sans attendre.

  **Web.** Les quatre bascules optimistes (`togglePin`, `toggleMute`, `toggleArchive`, `setReaction`) posaient la réponse de leur `PUT` sans arbitrage, à côté du portillon `version` que `applyRemotePreferences()` applique déjà aux diffusions socket. Trois pertes d'état en découlaient : deux bascules rapprochées dont les réponses reviennent dans le désordre laissaient gagner la plus ANCIENNE ; une diffusion arrivée pendant le vol de la requête était rembobinée par la réponse ; la rétractation d'un échec réseau restaurait un instantané périmé et annulait une action sans rapport. `isStaleWriteResponse()` arbitre les réponses HTTP comme les diffusions — mais seulement quand la réponse PORTE une version, sans quoi un déploiement mixte perdrait l'écriture — et la rétractation ne s'applique qu'à sa propre écriture, reconnue par identité référentielle sur un état immuable. Les quatre méthodes passent par un `writeOptimistic(conversationId, patch, request)` unique.

  **Web (socket).** `visibilitychange` → reprise immédiate. Un onglet en arrière-plan voit ses timers étranglés à ~1/minute et son socket coupé ; les deux boucles de reprise reposant sur des timers, un lecteur passif pouvait rester privé de tout événement temps réel une minute ou plus après son retour. La garde teste l'état réel du socket et non le miroir local, précisément parce qu'un onglet gelé peut être déconnecté sans que `disconnect` atteigne jamais ce miroir ; le timer de backoff en attente est annulé et l'échelle repart de zéro.

  **Gateway.** `PUT /api/user-preferences/conversations/:id` répond `400` sur un `categoryId` malformé au lieu de `500` : l'id atteignait Prisma, qui levait `Malformed ObjectID`, et le `catch` du handler classait une erreur d'appelant en incident serveur.

## 1.25.10

### Patch Changes

- Updated dependencies [87a7779]
  - @meeshy/shared@1.10.4

## 1.25.9

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

## 1.25.8

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

## 1.25.7

### Patch Changes

- 125934c: Les indicateurs de saisie de la vue conversation existent enfin — ils étaient morts à la réception, et fantômes à l'émission

  Deux défauts indépendants, une seule fonctionnalité : sur le web, « X est en train d'écrire… »
  n'apparaissait **jamais** dans la vue conversation, et l'indicateur qu'on faisait naître chez les
  pairs n'était **jamais retracté** quand on changeait de conversation.

  ## 1. Réception — le callback socket jetait ce qu'il recevait

  `ConversationLayout` confie à `useSocketIOMessaging` un `onUserTyping` dont le corps se réduisait à
  deux gardes suivies de… rien :

  ```ts
  const onUserTyping = useCallback(
    (userId, _username, _isTyping, typingConversationId) => {
      if (!user || userId === user.id) return;
      if (typingConversationId !== selectedConversation?.id) return;
    }, // ← la fonction se termine ici
    [user, selectedConversation?.id]
  );
  ```

  `useConversationTyping` retourne pourtant `handleUserTyping`, **seul écrivain** de son état
  `typingUsers`. Cette valeur n'était pas déstructurée, et le callback ne l'appelait pas : chaque
  `typing:start` / `typing:stop` livré par le socket était filtré puis abandonné. `typingUsers` restait
  `[]` à vie, et l'en-tête — qui le rend réellement, via `ConversationView.mapTypingUsers` →
  `ConversationHeader` → `ParticipantsDisplay` → `TypingIndicator` — n'affichait donc jamais rien.

  La panne était invisible en test manuel parce que le **flux d'accueil** (`use-stream-socket.ts`) tient
  sa PROPRE copie du handler et la câble correctement : les indicateurs marchaient sur une surface et
  pas sur l'autre.

  Les deux gardes recopiées dans le layout n'ont pas été rebranchées : `handleUserTyping` les porte
  déjà toutes les deux (« pas mon propre écho », « pas une autre conversation »). Le callback remis au
  socket relaie désormais vers le hook via un ref — les deux hooks se précèdent mutuellement
  (`useConversationTyping` a besoin de `startTyping`/`stopTyping`, que produit `useSocketIOMessaging`,
  qui a besoin du récepteur), et le ref casse ce cycle sans dupliquer de règle. Effet de bord bienvenu :
  le callback devient STABLE, donc l'abonnement socket cesse de se refaire à chaque changement de
  conversation.

  ## 2. Émission — quitter une conversation laissait un fantôme chez les pairs

  Le nettoyage de `useConversationTyping` est une fermeture créée au rendu où `conversationId` a changé
  pour la dernière fois. Elle y capture un `isTyping` qui vaut alors toujours `false` :

  ```ts
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      clearAllRemoteTypingTimeouts();
      if (isTyping) {
        stopTyping();
      } // ← branche inatteignable
    };
  }, [conversationId]); // deps sans isTyping ni stopTyping
  ```

  La branche `stopTyping()` ne s'exécutait donc jamais — et le même nettoyage **annule** au passage le
  timer d'auto-stop local (3 s), si bien qu'aucun des deux chemins d'arrêt ne partait.

  Rien en aval ne rattrapait : côté gateway, `conversation:leave` ne retracte pas la frappe (seul
  `disconnecting` le fait, cf. `StatusHandler.handleSocketDisconnecting`), et changer de conversation
  ne déconnecte pas le socket. Résultat : taper dans une conversation puis cliquer sur une autre sans
  vider le composeur laissait « X est en train d'écrire… » chez tous les pairs de la première, jusqu'à
  l'expiration de leur filet de sécurité de 8 s — **à chaque changement de conversation**.

  Le correctif est un miroir SYNCHRONE de `isTyping`, écrit aux trois mêmes endroits que l'état
  (`handleTypingStart`, `handleTypingStop`, auto-stop). Un ref synchronisé par `useEffect` n'aurait pas
  suffi : React exécute tous les nettoyages avant tous les effets, l'ordre resterait à démontrer.
  Écrit à la main, le miroir est juste par construction à l'instant où le nettoyage le lit. Le
  `stopTyping` capturé par cette fermeture est celui du rendu où la conversation quittée avait été
  sélectionnée : la retraction vise donc bien la conversation qu'on QUITTE, pas celle qu'on ouvre.

  ## Deux tests qui ne prouvaient rien

  Le défaut d'émission a traversé une suite verte parce que deux tests le DOCUMENTAIENT au lieu de
  l'affirmer — « The cleanup effect may or may not call stopTyping depending on React's cleanup
  timing » — et n'assertaient donc rien sur `stopTyping`. Ils affirment désormais la vérité attendue.

  Le défaut de réception, lui, était hors de portée de tout test de la vue : `useConversationTyping` y
  était doublé en ENTIER, ce qui figeait `typingUsers: []` et rendait `undefined` tout export
  nouvellement consommé. Le double est retiré — c'est le hook qui porte la règle, il tourne
  maintenant pour de vrai sous le test de la vue.

  ## Vérification

  - **RED prouvé avant le correctif** : 2 rouges sur le hook (retraction au changement de conversation,
    au démontage), 2 rouges sur la vue (un `typing:start` de pair n'atteint pas l'en-tête, un
    `typing:stop` ne l'efface pas). Les 4 gardes négatives (écho de soi, autre conversation, pas de
    stop si on ne tapait pas, pas de double stop) passaient déjà — elles verrouillent le correctif.
  - **Mutation appliquée et vérifiée — 6 réversions, 6 rouges** : le relais `onUserTyping` neutralisé
    (2 rouges), le branchement du ref retiré (2), le nettoyage relisant l'état périmé (2), le miroir
    non armé par `handleTypingStart` (2), non désarmé par `handleTypingStop` (1), non désarmé par
    l'auto-stop (1). Restauré, re-vérifié vert.
  - **Suite web complète : 563/563 fichiers, 12 084 tests verts** (21 skipped).
  - `tsc --noEmit` : **1 224 diagnostics avant comme après** (pré-existants), **aucun** dans les
    fichiers touchés.

## 1.25.6

### Patch Changes

- c730c3e: Les accusés de lecture ne reculent plus — un instantané REST en retard ne repeint plus les coches bleues en gris

  Deux écrivains alimentent `readStatusSummaries` / `messageReadStatuses`, et un seul des deux est
  ordonné :

  - le **socket** (`presence.service.ts` → `updateReadStatusSummary`) — ordonné par connexion, il
    porte toujours l'état le plus frais que le serveur connaisse ;
  - le **lot REST** (`use-conversation-messages-rq.ts` →
    `messagesService.getReadStatuses(…).then(updateMessageReadStatusBatch)`) — un INSTANTANÉ pris au
    départ de la requête, appliqué au retour, **sans garde d'ordre**. `updateMessageReadStatusBatch`
    faisait un `{ ...state.messageReadStatuses, ...statuses }` : le dernier arrivé écrasait, quelle
    que soit son ancienneté.

  La fenêtre n'est pas une curiosité de démarrage à froid. La clé de garde du lot
  (`batchFetchedRef`) est indexée sur l'id du dernier message propre : **chaque envoi de message
  relance la lecture REST**. Il suffit donc qu'un pair lise un message pendant que la requête est en
  vol pour que l'instantané, parti avant cette lecture, atterrisse après elle.

  Et la régression est VISIBLE : `DeliveryIndicator` rend `readCount > 0` en **double coche bleue**
  et `readCount === 0 && deliveredCount > 0` en **double coche grise**. Perdre cette course fait donc
  passer les coches au bleu puis les ramène au gris — et elles restent fausses jusqu'à ce qu'un
  prochain accusé passe par là. Le même écrasement pouvait aussi « dé-livrer » un message
  (`deliveredCount` qui redescend).

  **Le correctif** : un unique prédicat `isStaleReceipt(current, incoming)` dans le store, appliqué
  par les TROIS écrivains (`updateReadStatusSummary`, `updateMessageReadStatus`,
  `updateMessageReadStatusBatch`) — un seul énoncé de la règle, là où l'état vit, plutôt qu'une garde
  recopiée chez chaque appelant.

  Trois décisions, chacune verrouillée par un test.

  **`totalMembers` est le discriminant, et il empêche la garde de figer les compteurs à vie.** Les
  accusés ne sont croissants que pour un effectif FIXE. Quand quelqu'un quitte la conversation, le
  serveur recompte sur les survivants et rapporte légitimement moins de lectures. Un `totalMembers`
  qui bouge signifie donc que l'instantané décrit une autre conversation : il gagne sans condition.

  **Un résumé qui recule est rejeté ENTIER, jamais fusionné champ par champ.** Un maximum par champ
  synthétiserait un état qu'aucun serveur n'a jamais rapporté, alors que c'est précisément
  `readCount >= totalMembers` qui pilote la branche « lu par tous » de l'indicateur. Chaque résumé
  stocké reste un instantané serveur réel.

  **Le lot filtre par ENTRÉE, pas en tout-ou-rien.** Un message dont l'instantané a perdu sa course ne
  doit pas coûter au lot les accusés qu'il porte pour tous les autres. Et le miroir vers le dernier
  message propre (`updateReadStatusSummary` écrit aussi `messageReadStatuses[latestOwnMsgId]`) est
  gardé sur SA propre histoire, pas sur celle de la conversation : le lot REST écrit cette entrée
  directement, elle peut donc légitimement être en avance sur le résumé conversationnel.

  Vérification : 10 tests neufs (`conversation-ui-store-read-receipts.test.ts`), rouges avant
  (6 échecs / 10) et verts après. **Mutation appliquée et vérifiée — 7 réversions, 7 rouges** :
  prédicat neutralisé, discriminant `totalMembers` retiré, garde du lot retirée, garde du miroir
  retirée, garde de `updateMessageReadStatus` retirée, garde conversationnelle retirée, `||` changé
  en `&&`. Restauré, re-vérifié vert. Suite web complète : **563/563 fichiers, 12 077 tests verts**.
  `tsc --noEmit` : 1 757 diagnostics avant comme après, aucun dans les fichiers touchés.

## 1.25.5

### Patch Changes

- a14746a: Le tray de stories du web draine ses pages, et l'intent write-ahead d'une story publiée cesse de courir contre son propre succès

  `storyService.getStories` appelait `GET /posts/feed/stories` **sans aucun paramètre** et rendait
  `response.data?.data ?? []` : ni `limit`, ni `cursor`, et surtout aucune lecture de
  `pagination.hasMore`/`nextCursor`. Le tray web était donc coupé à 50 stories exactement comme
  l'était celui d'iOS avant le cycle 80, pour la même raison, avec le même silence.

  Il draine désormais, avec les **deux arrêts** que le cycle 80 avait établis comme distincts et tous
  deux nécessaires : un plafond de pages (6, valeur miroir d'iOS) protège contre un serveur qui
  annoncerait `hasMore` sans fin, et un `hasMore` **sans curseur** s'arrête au lieu de rejouer la même
  page indéfiniment. La pagination de cette route est réellement exacte — sa fenêtre est filtrée par
  `updatedAt` mais son curseur porte sur le couple `(createdAt, id)` de l'ordre — c'est ce qui rend le
  drain suffisant, sans l'escalade dont le delta des conversations avait besoin.

  Deux services se disputaient la route. L'inventaire des consommateurs a tranché :
  `postsService.getStories` n'avait **aucun lecteur de production** — sa seule occurrence dans tout le
  dépôt était son propre test. Copie morte supprimée, test compris ; paginer les deux aurait dupliqué
  la dette au lieu de la payer. Rien de la troncature de tombstones n'est transposé : le web ne passe
  jamais `updatedSince`, donc `meta.deletedStoryIdsTruncated` lui vaut toujours `false`.

  Côté iOS, `StoryViewModel.launchUploadTask` retirait l'intent write-ahead d'une story publiée dans
  un `Task.detached`, puis vidait `activeUploads` et déclarait le succès à l'écran sans que rien
  n'ordonne les deux. Ce que l'intent protège est écrit sur place — « sinon le boot suivant
  re-publierait » : détaché, le retrait ouvre une fenêtre où l'app meurt avec l'intent encore en base
  alors que la story est **déjà en ligne**, et le drain de boot la publie une seconde fois. Le retrait
  est désormais awaité (la tâche englobante est déjà `async`), exactement comme le fait le chemin de
  drain hors-ligne depuis toujours ; le ménage disque reste détaché, c'est de l'IO synchrone qu'on ne
  veut pas sur le MainActor.

## 1.25.4

### Patch Changes

- 2079119: Une page delta qui laisse du reste ne fait plus avancer le curseur iOS, et le web arrête d'escalader pour rien

  `ConversationSyncEngine.deltaSyncCore` (SDK iOS) demandait `limit=500` à
  `GET /conversations?updatedSince=`, que la route plafonne à 100 — puis avançait
  `lastSyncTimestamp` au max des `updatedAt` REÇUS, sans jamais regarder si la page avait été
  coupée. Le tri par `updatedAt` croissant (cycle 77) fait pointer le curseur sur les lignes
  coupées dans le cas général, mais pas quand plus de 100 conversations partagent la MÊME
  milliseconde : la borne serveur est stricte (`gt`), donc le débordement était enjambé
  DÉFINITIVEMENT — jusqu'à la réconciliation complète, bornée à 1× par 24 h. Entre les deux, la
  liste iOS affichait des compteurs de non-lus et des aperçus périmés sans aucun signal.

  iOS lit désormais le `pagination.hasMore` de la réponse. Quand le serveur annonce du reste :
  le curseur NE BOUGE PAS, puis `fullSync()` est enchaîné. L'ordre est le correctif — c'est
  parce que le curseur est resté en arrière qu'une escalade échouée (offline, panne gateway)
  laisse la fenêtre entière rejouable au prochain delta au lieu d'un trou permanent. La fusion
  de la page reçue, elle, est conservée dans tous les cas.

  Côté web, la même escalade se déclenchait sur `conversations.length >= DELTA_PAGE_LIMIT`.
  `hasMore` est autoritaire sur une page delta — elle part toujours d'`offset=0`, ce qui fait
  compter au serveur toutes les lignes de la même clause `updatedAt > since` — donc une fenêtre
  de très exactement 100 conversations est COMPLÈTE. Le web relisait toutes ses pages chargées
  pour rien dans ce cas ; il lit maintenant le même signal qu'iOS.

- c51cebe: Une réaction n'invalide plus la liste de conversations

  Les deux handlers socket de réaction (`use-reactions-query.ts`) faisaient
  `invalidateQueries({ queryKey: conversations.lists() })`, commentaire à l'appui : « réaction
  ajoutée = conversation modifiée ». Deux défauts dans le même geste.

  `lists()` valait `['conversations','list']` ; la sidebar lit `infinite()` =
  `['conversations','infinite']`. Les deux préfixes étaient DISJOINTS : l'intention écrite n'était
  jamais exécutée. Panne silencieuse, pas code mort — le commentaire faisait foi pour le prochain
  lecteur.

  Et l'intention elle-même est fausse : une ligne de liste ne porte rien qui dérive des réactions
  (aperçu du dernier message, non-lus, horodatage). L'emoji `reaction` rendu par `ConversationList`
  est la PRÉFÉRENCE de conversation, sans rapport avec les réactions de message. Rediriger vers
  `infinite()` aurait donc relu toutes les pages chargées à chaque réaction — exactement le
  refetch que le cycle 77 venait de retirer du chemin de focus.

  Le seul cache concerné par une réaction reste celui du message, déjà mis à jour juste en dessous
  par `updateReactionSummaryInMessageCache`. Le commentaire qui reste sur le site dit pourquoi il
  n'y a PAS d'invalidation : un retrait silencieux inviterait le prochain lecteur à « réparer
  l'invalidation manquante ».

- 0ca31f1: Un seul cache de liste de conversations — la forme plate sans lecteur est retirée

  `queryKeys.conversations` exposait `lists()` / `list(filters)` (`['conversations','list', …]`) à
  côté de `infinite()` (`['conversations','infinite']`). Les deux préfixes sont DISJOINTS, et aucun
  écran ne lisait le premier : la sidebar passe par `useConversationsPaginationRQ` →
  `useInfiniteConversationsQuery`. Une dizaine d'écrivains l'alimentaient quand même, à chaque
  événement — autant de no-ops silencieux, et un code qui se lisait comme si deux caches étaient
  tenus en phase alors qu'un seul existait.

  Retirés : la clé plate, ses écrivains, les hooks sans consommateur (`useConversationsQuery`,
  `useConversationsWithPagination`, les mutations create/delete de conversation) et tout
  `use-send-message-mutation.ts`, dont les quatre mutations n'avaient elles non plus aucun appelant —
  l'envoi réel passe par l'orchestrateur Socket.IO.

  Deux corrections de comportement au passage : les `invalidateQueries` déclenchées par une réaction
  ciblaient la clé plate et ne s'exécutaient donc jamais (supprimées — la ligne de liste ne dépend
  d'aucune réaction de message), et `useInfiniteConversationsQuery` acceptait un `filters` que sa clé
  de requête n'incluait pas, donc silencieusement ignoré.

  Les témoins de `use-socket-cache-sync` qui n'assertaient que la forme plate — « déplacer la
  conversation en tête », « avancer l'aperçu sur suppression », « purger la conversation refusée » —
  ont été rebranchés sur le cache réellement lu, et vérifiés rouges contre une écriture cassée avant
  tout retrait : le chemin que la sidebar emprunte n'avait jusqu'ici aucune couverture.

## 1.25.3

### Patch Changes

- d2b1232: Le retour d'onglet ne relit plus la liste de conversations page par page

  `useInfiniteConversationsQuery` héritait du `refetchOnWindowFocus: 'always'` global. Sur une
  `useInfiniteQuery`, ce réglage rejoue TOUTES les pages chargées et REMPLACE le cache : dix pages
  de scroll valaient dix requêtes sur une route lourde à chaque retour d'onglet, les écritures
  socket concurrentes étaient écrasées, et — la route paginant par OFFSET sur un tri
  `lastMessageAt` décroissant — un message arrivé entre deux pages décalait toutes les suivantes
  d'un cran, dupliquant une ligne à la frontière et en faisant disparaître une autre.

  Le focus tire désormais le MÊME delta borné que le reconnect socket : une requête, une fusion
  non destructrice, débouncée 1 s.

  La seule chose que le refetch de focus faisait et que le delta upsert-only ne peut pas faire —
  purger une conversation hard-supprimée côté serveur — est reprise par une réconciliation
  complète chaînée après un delta réussi et bornée à 1× par 24 h, pendant web de
  `fullReconcileInterval` sur iOS. Elle court même sur un delta VIDE (une conversation supprimée
  ne produit aucune ligne de delta), jamais sur un delta échoué (local-first : le cache reste
  intact hors ligne), et sa fenêtre démarre au premier delta d'un navigateur neuf plutôt qu'à
  l'époque zéro — le montage vient déjà de lire le serveur en entier.

## 1.25.2

### Patch Changes

- ac3c088: Retire la clé `hasMore` dupliquée dans l'appel de fusion delta de la liste de conversations

  Deux sessions parallèles ont livré la borne de fenêtre de `mergeConversationDelta` ; leur
  réunion a laissé `hasMore` deux fois dans le même littéral d'options
  (`use-conversations-delta-sync.ts`). Sans effet à l'exécution — les deux occurrences portent
  la même valeur — mais c'est une erreur TypeScript (TS1117, « An object literal cannot have
  multiple properties with the same name ») sur un chemin que le type-check du web traverse.

- Updated dependencies [ac3c088]
  - @meeshy/shared@1.10.2

## 1.25.1

### Patch Changes

- 8cc653d: Le delta de reconnexion ne rallume plus le badge de la conversation qu'on est en train de lire

  Complément du catch-up delta de la liste de conversations (coupure socket) : la fusion
  prenait la vérité serveur pour TOUS les champs, compteur de non-lus compris. Le gateway
  calcule ce compteur pour tous les destinataires, lecteur inclus — un delta qui atterrit
  pendant qu'on lit rapporte donc la valeur d'avant l'aller-retour `mark-as-read` et
  rallume la pastille de la conversation qu'on a sous les yeux. Le handler socket
  `conversation:unread-updated` portait déjà exactement cette garde ; le delta est le
  second chemin d'écriture du même compteur et la porte désormais aussi.

  Une conversation que le delta signale inactive voit également son cache de MESSAGES
  purgé, à côté de son `detail` — miroir de `cache.messages.invalidate(for:)` sur iOS.
  Sans cela, revenir sur son URL affichait un fil que `staleTime: Infinity` ne relit
  jamais.

  La garde s'arrête volontairement à la conversation ouverte. L'étendre à la conversation
  fermée dont l'accusé de lecture traîne demanderait de faire voyager la frontière de
  lecture (`lastReadAt`, que iOS porte et que le modèle web n'a pas) : la transposer via
  `unreadCount` + `lastMessageAt` éteindrait le « marquer comme non lu » cross-device,
  puisque cette action ne déplace aucun `lastMessageAt`.

## 1.25.0

### Minor Changes

- Changements automatiques détectés :

  - une notification manquée l'était pour la session entière — le web ignorait `_seq` (#2844)
  - deuxieme widget ecran d'accueil — conversations recentes (#2841)
  - CallNotification no longer orphans the ringtone on fast unmount (#2843)
  - déclare `userUpdated` sur `MessageSocketProviding` — main était rouge

## 1.24.1

### Patch Changes

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

## 1.22.10

### Patch Changes

- fcc82a6: Le web applique enfin le Prisme Linguistique à la ligne de liste, et la langue
  d'origine cesse de rétrograder la langue primaire du lecteur.

  Le cycle précédent a mis `lastMessageTranslations` et `lastMessageOriginalLanguage`
  sur le fil de `GET /conversations`. Le web n'en voyait rien : le type `Conversation`
  ne déclarait pas ces champs, `transformConversationData` — un objet construit à la
  main — les jetait, et `formatLastMessage` rendait `lastMessage.content` brut. Quatre
  couches, aucune donnée. Un lecteur francophone lisait « Hello » dans sa sidebar et
  « Bonjour » une fois le fil ouvert, alors que la traduction était déjà arrivée.

  `resolveLastMessagePreview` (`@meeshy/shared`) devient le jumeau TypeScript de
  `MeeshyConversation.resolvedLastMessagePreview`, et la chaîne web est câblée de
  bout en bout : type → transformer → résolveur → ligne.

  **Correctif de règle, sur les deux plateformes.** Le résolveur iOS court-circuitait
  dès que la langue d'origine apparaissait _quelque part_ dans le prisme du lecteur.
  Cette formulation par appartenance rétrograde silencieusement la langue PRIMAIRE
  dès que la langue d'origine occupe un rang inférieur — précisément ce que produit
  la locale appareil, entrée en 4e priorité. Prisme `['fr', 'en']`, message anglais,
  traduction française disponible : elle rendait « Hello ». `CLAUDE.md` dit l'inverse
  noir sur blanc — « un utilisateur francophone avec un iPhone en anglais voit
  TOUJOURS ses messages en français (priorité 1) » — et le chemin du CORPS des
  messages appliquait déjà la bonne règle en ne comparant qu'à la langue de tête.

  Le prisme est désormais parcouru par RANG : la langue d'origine y concourt à sa
  place, et la première langue servie gagne — par traduction, ou parce que le message
  est déjà écrit dedans. La règle #3 est inchangée : jamais de repli sur une
  traduction quelconque.

- Updated dependencies [fcc82a6]
  - @meeshy/shared@1.8.13

## 1.22.9

### Patch Changes

- Updated dependencies [6df3fac]
  - @meeshy/shared@1.8.12

## 1.22.8

### Patch Changes

- Updated dependencies [f2c0708]
  - @meeshy/shared@1.8.11

## 1.22.7

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

## 1.22.6

### Patch Changes

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

## 1.22.5

### Patch Changes

- 36911f8: La langue auto d'un audio se re-dérive quand la traduction arrive après le montage.

  La sélection automatique de langue ne s'évaluait qu'au montage du composant. Or le cas courant est
  l'inverse : l'audio est rendu d'abord, ses traductions arrivent ensuite par socket — le pipeline
  transcription → traduction → TTS n'est jamais instantané. La piste restait donc dans la langue
  d'origine alors qu'une traduction vers la langue préférée venait d'atterrir, et seul un remontage
  du composant la faisait apparaître. Le Prisme Linguistique était rompu précisément là où il compte :
  sur le contenu reçu en temps réel.

  La résolution est extraite en fonction pure `resolveAutoLanguage`, et un effet la ré-applique quand
  `translatedAudios` change. Un `useRef` mémorise le choix explicite de la personne — un tap sur une
  pastille de langue — pour que la re-dérivation ne l'écrase jamais : l'automatisme ne reprend la main
  que tant que personne n'a tranché.

- Updated dependencies [36911f8]
  - @meeshy/shared@1.8.8

## 1.22.4

### Patch Changes

- Updated dependencies [5647020]
  - @meeshy/shared@1.8.7

## 1.22.3

### Patch Changes

- 49a661d: Route the anonymous sender's REST fallback to the share-link endpoint

  When a `message:send` ack comes back as an error (not a timeout) and the socket
  is still connected, `MessagingService` retries over REST. It always retried on
  `POST /conversations/:id/messages`, which authenticates on a JWT. An anonymous
  share-link participant has no JWT — only an `anon_*` session token — so that
  retry answered 401 for every one of them: the recovery path could not recover
  anything, and the message was lost with no second chance.

  Their endpoint already existed (`POST /links/:identifier/messages`, authenticated
  by `X-Session-Token`), and so did its client wrapper — `AnonymousChatService.sendMessage`,
  reachable from nothing since its only caller was a dead hook. The fallback now
  asks `anonymousChatService.canSendViaLink()` which pipe to take; registered
  senders keep the conversations route unchanged.

  Two things the wiring had to get right, or the fix would only trade a lost
  message for a doubled one:

  - The caller's `clientMessageId` travels with the request instead of the service
    minting a fresh one. It is the only key that ties the server message back to
    the optimistic row already on screen.
  - `AnonymousChatService.sendMessage` now declares what the route actually
    returns — `{ messageId, message }`, not `Message`. The old signature was a
    lie its single caller papered over with a double cast reading both shapes.

  `hooks/use-anonymous-messages.ts` is removed: nothing imported it, and it was
  where that cast lived.

- bc7707d: A failed message now actually spends its three retries instead of stopping after one

  `useAutoRetryFailedMessages` advertises a budget of `MAX_RETRY_COUNT = 3`
  automatic attempts, paced `RETRY_DELAY_MS` apart. It could only ever spend one.

  The flush is an effect keyed on `[isReady, rearm]`. It takes a snapshot of the
  queue, sweeps it once, and re-arms itself only when it stopped _early_ — a
  readiness flap mid-flush. A sweep that ran to completion with messages still
  queued re-armed nothing, and `isReady` was already `true`, so no dependency
  would ever change again. On a connection that never drops, a message whose send
  failed for a transient reason got exactly one retry and then sat in the failed
  queue untouched: not delivered, not marked exhausted, `retryCount` stuck at 1,
  its remaining budget unspendable. The only way to buy a second attempt was to
  lose the connection and get it back — the one condition the feature exists to
  survive without.

  The same gap stranded work queued _behind_ an in-flight sweep: a message that
  failed while the flush was running was not in that sweep's snapshot, and nothing
  scheduled another one.

  A sweep now also re-arms when it drained its snapshot but the store still owes
  attempts. This cannot spin: every sweep increments `retryCount` for each message
  it attempts, so each pass strictly shrinks the remaining budget and the
  re-arm condition goes false after `MAX_RETRY_COUNT` passes at the latest —
  termination is driven by the budget, not by wall time.

  The existing suite could not see any of this: every test drove the hook with a
  frozen store whose actions recorded calls without changing `failedMessages`, so
  a second sweep was indistinguishable from no second sweep. The new tests use a
  store that applies its updates the way the real zustand store does.

- 9b5921f: Share-link messages now reach the web message cache in real time

  `handleLinkMessageNew` opens on `if (!linkConvId) return` — and the gateway never
  put a `conversationId` in the payload, so every `link:message:new` was dropped on
  the first line. This is the ONLY event the two share-link REST routes emit (there
  is no companion `message:new`), which means no message sent through a share link
  — by an anonymous participant or a registered one — ever appeared live for anyone
  else in the conversation. It surfaced only on a manual refresh, and with
  `staleTime: Infinity`, often not even then.

  The handler also now carries the `landedInCache` fallback `handleNewMessage`
  documents: when no cache entry exists yet (initial fetch in flight, conversation
  never opened this session) the updater bails out on `if (!old) return old` and the
  message would be lost for good, since nothing re-reads the server. The query is
  invalidated instead.

- Propagate `LinkMessageNewEventData` through the socket pass-throughs

  `messaging.service` types its `link:message:new` listeners with the shared
  `LinkMessageNewEventData`, but the orchestrator and the socket facade re-declared
  `{ message: Record<string, unknown> }` in their pure pass-throughs, re-widening the
  type on the way to the handler. The payload contract now requires `id`,
  `conversationId` and `senderId`; without this, that hardening stops at
  `messaging.service` and never reaches the consumer that depends on it.

- Updated dependencies [49a661d]
- Updated dependencies [9b5921f]
- Updated dependencies [94e7074]
  - @meeshy/shared@1.8.6

## 1.22.2

### Patch Changes

- f9f8fb0: Realtime cache routing: every message write now reaches the alias-keyed cache entry

  A conversation can be cached under two keys at once — its resolved ObjectId
  (`/conversations/:id`) and its identifier, since the home page mounts the global
  conversation as `"meeshy"`. Socket payloads only ever carry the ObjectId, so six
  handlers writing to the single key `queryKeys.messages.infinite(objectId)`
  silently no-op'd on the alias entry, and with `staleTime: Infinity` nothing
  re-read it: the home-page bubble stayed frozen on pre-event state until a manual
  refresh.

  The six now route through `messageCacheKeysFor`, the same helper the new-message,
  edit, translation and transcription handlers already use:

  - `audio:translation-ready` — translated audio never appeared on the home page
  - `message:attachment-updated` — async attachment enrichment was lost
  - `attachment:status-updated` — listened/watched/viewed/downloaded marks were lost
  - `message:pinned` / `message:unpinned` — pin state diverged between the two views
  - `link:message:new` — link-preview messages never appeared on the home page

  `attachment:status-updated` additionally stamps its consumption timestamp once per
  event rather than once per cache entry, so a single consumption cannot land two
  different times now that the write fans out, and an unrecognised action is rejected
  before the field name is used as a computed key.

## 1.22.1

### Patch Changes

- 81a75c7: Realtime cache routing: transcription-ready and message deletes now reach the conversation that owns them

  - `audio:transcription-ready` was routed to the hook's active conversation and dropped
    entirely on the conversation-list view, so a voice note transcribed while reading
    another chat never reached its cache. It is now routed by the event's own
    `conversationId`, attaches to the attachment named by `attachmentId` (instead of the
    first audio attachment, which mis-attributed every transcription on a multi-voice-note
    message), and reads the language from `transcription.language` (the payload has no
    root-level `language`, so it was always `undefined`).
  - `message:deleted` was applied only to the active conversation, leaving deletes in every
    other conversation unapplied. The message is now located by id across all cached message
    lists, including identifier-keyed alias entries, and the conversation-list preview
    advances using the conversation the deleted message actually belonged to.

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

## 1.9.6

### Patch Changes

- Updated dependencies [6d5cb1e]
  - @meeshy/shared@1.8.3

## 1.9.5

### Patch Changes

- Changements automatiques détectés :

  - contrat d'events gelé — literals migrés, events morts dépréciés (audit #4/#6)

## 1.9.4

### Patch Changes

- a759a79: Présence : un utilisateur hors ligne (>30 min) n'affiche plus de pastille sur les avatars.

  Suite au retour produit sur la centralisation de la présence (PR #1729), l'état `offline` ne rend plus de point sur les avatars et indicateurs (`OnlineIndicator`, `Avatar` v2, `ConversationItem`, `UserPresenceBadge`, `UserPresenceLabel`) — comportement standard (WhatsApp/Telegram) : vert = online/recent, orange = away, rien au-delà de 30 min.

  Le gris `#9CA3AF` reste défini dans les maps centrales (`PRESENCE_DOT_CLASS.offline`, `presenceDotClassV2.offline`) pour les affichages explicitement labellisés (en-têtes de section « Hors ligne », badge story-intro), mais les dots d'avatar ne le rendent jamais.

## 1.9.3

### Patch Changes

- Updated dependencies [f16a057]
  - @meeshy/shared@1.8.2

## 1.9.2

### Patch Changes

- 71046e6: Présence : palette verte rétablie + source de vérité centralisée.

  Nouvelle source de vérité partagée `@meeshy/shared/utils/user-presence` (`getUserPresenceStatus`) : le flag backend `isOnline` (actif < 1 min) est désormais autoritatif pour l'état online (garde anti-stale au-delà de 30 min), la décroissance 60s/5min/30min sur `lastActiveAt` reste inchangée.

  Palette conforme à la convention produit : vert `#34D399` = online/recent (pulse sur online), orange `#FBBF24` = away 5–30 min, gris `#9CA3AF` = hors ligne. Mapping couleur centralisé dans `lib/user-status.ts` (`PRESENCE_DOT_CLASS`/`PRESENCE_BADGE_CLASS`/`PRESENCE_TEXT_CLASS`) et consommé par toutes les surfaces (OnlineIndicator, badges, labels, StreamSidebar, v2 Avatar/ContactCard/ConversationItem, recherche).

  Un `typing:start` reçu force l'état online de l'émetteur dans le user-store : une personne en train d'écrire affiche toujours la pastille verte.

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

## 1.0.41

### Patch Changes

- Mise en place du système de versioning automatisé avec Changesets

  - Ajout de Changesets pour la gestion sémantique des versions
  - Script de synchronisation package.json → VERSION files
  - Workflow de release automatisé avec tags Docker multiples
  - Tags Docker avec SemVer (1.0.41) et date/heure (20260124.143022)
  - Documentation complète du système de versioning

- Updated dependencies
  - @meeshy/shared@1.0.1
