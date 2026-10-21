# Plan « média de grade entreprise » — analyse SOTA et orchestration (2026-10-20)

> Journal daté, pas un tableau de bord. L'état de chaque lot vit dans son issue ; les milestones sont nommés par le résultat.
> En cas d'écart, l'issue a raison. Antécédents : #9702 (PR #9716), analyse du 2026-10-10 (`tasks/ios-media-360-audit-2026-10-10.md`, milestone #164).
> Compte rendu publié : voir le commentaire d'ouverture des issues de décision.

## La demande du porteur (2026-10-20)

Une analyse intégrale de `dev` contre l'état de l'art, puis une orchestration qui mène Meeshy à un niveau « application d'entreprise » : fluide, optimisée selon la machine, visuel adapté, les meilleurs algorithmes de compression à l'envoi, les appels vidéo, des filtres de niveau Snapchat que des partenaires créent pour un événement, des objets à débloquer (cadres, avatar, bannière, fond), et toute la gestion des médias (image, audio, vidéo) optimisée et fluide partout.

## Méthode

1. Sept relevés en lecture seule sur `origin/dev` (14dd493885), un par axe : lecture et préchargement iOS (relecture des 28 issues de #164), compression à l'envoi (trois chaînes), appels WebRTC, filtres AR partenaires, cadres et boutique, web et coque Android, chaîne média serveur.
2. Un plan de 98 lots sur quatre chaînes, attaqué par l'auditeur adversarial (preuves périmées, collisions de fichiers, rétrocompatibilité, sécurité, défauts pris sans le porteur, axes oubliés) et ordonnancé par un agent de planification (ordre par chaîne, dépendances inter-chaînes, tours, découpages, fichiers hors budget). Les deux rapports sont intégrés : 17 chemins corrigés, 3 lots amputés de ce qui était déjà livré, 3 lots bloqués jusqu'à une décision (S11, S14, S26), 5 lots ajoutés (NSE, GPS des vidéos, accessibilité des médias, sous-titres), 2 décisions ajoutées (modération des médias, droits des sons).
3. Conteneur Linux sans Xcode : le Swift est écrit ici, vérifié par `swiftc -parse` et `xcodegen` (toolchain installé sous `/opt/swift` et `/opt/XcodeGen`), compilé et testé par la CI macOS de chaque PR (sujet « run test »). **Aucune mesure n'est possible ici : tout lot iOS est « argumenté, non mesuré » jusqu'à la session Instruments sur le Mac du porteur.**

## Ce que l'analyse a trouvé (prouvé dans le code, `fichier:ligne` dans chaque issue)

- **Sécurité** : le volume des uploads de la passerelle est monté dans nginx `static-files` et servi publiquement sur `static.<domaine>/uploads` (`docker-compose.prod.yml:490-491`, `static-files.conf:26-49`) ; tout média dont on connaît la clé est joignable sans auth, vue unique comprise → S1 (#11256).
- **E2EE** : le chemin « chiffré » des pièces jointes reçoit le clair et chiffre côté serveur (`UploadProcessor.ts:607-640`) ; ce n'est pas du E2EE au sens de #9224. Chaque lot serveur le dit ; une revue cryptographique externe reste requise avant toute communication « messagerie chiffrée ».
- **Compression** : une photo de caméra subit jusqu'à quatre générations JPEG entre l'iPhone et le disque du serveur ; le serveur ré-encode chaque audio en AAC +9 dB et chaque image q80 pour retirer l'EXIF (profil ICC perdu) ; le chemin TUS (iOS, web) ne fabrique ni variantes ni plan vidéo ; aucune image AVIF ; HEIC refusé à l'envoi donc converti au pire endroit (téléphone, q0.8).
- **Lecture iOS** : sur les 28 issues ouvertes de #164, 8 sont corrigées sur `dev` sans mesure, 7 partielles, 17 intactes, 1 empirée (30 `CIContext` au lieu de 8). Aucun tier d'appareil, aucune échelle de qualité (pas de HLS ; `preferredPeakBitRate` sans effet sur du MP4), télémétrie QoE sur les réels seulement, préchargement lointain en fichiers entiers, double téléchargement des stories.
- **Appels** : maillage P2P jusqu'à 6 sans plafond par lien (cinq encodages 720p), caméra jamais rebaissée, télémétrie aveugle aux gels, TURN jamais sur 443, web sans préférence vidéo. Conformes au SOTA : Opus FEC/DTX/RED, TWCC, perfect negotiation, CallKit/PushKit, flou par segmentation, cadres composés chez le récepteur.
- **Filtres** : 70 % de la plomberie d'une « lens » existe (format déclaratif des cadres, packs adressés par contenu, modération, LUT GPU, peintre Core Image unique, suivi visage et segmentation) ; manque un vocabulaire ancré au visage, un moteur qui dessine `scene`/`behaviors` (déclarés depuis #9197, jamais rendus), une soumission de cadres/lens, le créneau et le crédit.
- **Boutique** : elle existe (Meeshes, possession vérifiée serveur, zéro argent réel) ; il manque un droit d'usage obtenu autrement qu'en payant, une disponibilité datée et ciblée, une console admin. La voie payante attend #9227.
- **Web** : lois de fenêtre jumelles identiques à iOS ; cinq `<video>` montés en permanence ; `filter: blur` sur le pager qui contient la vidéo qui joue ; photo développée sur le fil principal ; envoi TUS sans checkpoint ; aucun Web Vital.

## Les milestones

| Clé | Milestone | Échéance |
|---|---|---|
| M164 | #164 Meeshy iOS lit, ajoute et édite ses médias sans chauffer — mesuré sur appareil | 2026-11-30 |
| MB | #196 Un média envoyé pèse le minimum sans perdre une génération, et se lit sur toutes les plateformes | 2026-12-20 |
| MC | #197 La passerelle ingère, transforme et sert les médias comme une plateforme — sans état, mesurée, derrière une interface S3 | 2027-01-15 |
| MD | #198 Un appel vidéo tient en qualité et en énergie, passe derrière tout pare-feu, et dit sa qualité | 2026-12-31 |
| ME | #199 Un partenaire crée un filtre d'événement sans code, et il joue sur la caméra, la story et l'appel — iOS et web | 2027-02-28 |
| MF | #200 Cadres, contours, bannières et fonds se débloquent par le jeu et les événements, et l'admin les publie sans déploiement | 2027-01-31 |
| MG | #201 Le web et la coque Android lisent, ajoutent et animent les médias comme iOS — mesurés | 2026-12-31 |

## Les 98 lots, par chaîne


### Passerelle, shared, translator, infra

| Lot | Issue | Milestone | Taille | Résultat attendu | Dépend de | Décision |
|---|---|---|---|---|---|---|
| S1 | #11256 | MC | developper | Les octets d'un média de message ne sont joignables que par la passerelle — plus jamais par le domaine statique public | — | — |
| S2 | #11257 | MC | developper | Chaque étape de la chaîne média a son histogramme : probe, vignette, variantes, exif, audio, transcodage, whisper, nllb, tts | S5, S4 | — |
| S3 | #11258 | MB | developper | Une photo ou une vidéo perd ses GPS et son EXIF sans perdre une génération ni son profil de couleur | S5 | — |
| S4 | #11259 | MB | developper | Un audio déjà en AAC n'est plus ré-encodé, un Opus/WebM est remuxé en M4A pour iOS, et le gain est une mesure, pas un +9 dB | S5, S3 | — |
| S5 | #11260 | MB | developper | Le chemin TUS produit les mêmes rendus que le chemin multipart — variantes, plan de transcodage, codec persisté | — | — |
| S6 | #11261 | MB | developper | Une vidéo HEVC envoyée depuis un iPhone se lit sur le web et la coque Android grâce à un rendu H.264 de compatibilité, l'original restant servi à iOS | S5, S2 | DEC-COMPRESSION (défaut) |
| S7 | #11262 | MB | developper | Les images servies ont un rendu AVIF à côté du WebP, sur les deux portes, et les clients savent le choisir | S5, S2 | — |
| S8 | #11263 | MB | developper | Un HEIC ou un AVIF est accepté à l'envoi et converti par le serveur — l'iPhone cesse de fabriquer un JPEG q0.8 de compatibilité | S7 | — |
| S9 | #11264 | MC | lourd | Le traitement d'un média sort de la requête HTTP : une file sur Redis, un worker, des priorités, une reprise | S2, S4, S23 | — |
| S10 | #11265 | MB | petit | Toute route de fichier sert les plages, un ETag et `immutable` — un lecteur vidéo posé sur GET /attachments/:id joue avant la fin du téléchargement | — | — |
| S11 | #11266 | MC | developper | Les limites d'envoi dépendent du rôle, un quota journalier existe, et une vidéo est sniffée avant d'être acceptée | S8 | DEC-SERVEUR (ATTEND) |
| S12 | #11267 | MC | lourd | Les médias vivent derrière une interface S3 — MinIO en staging, écriture en double, migration par lots | S9, S23, S1 | DEC-SERVEUR (défaut) |
| S13 | #11268 | MC | developper | Un vocal de 30 s est transcrit et traduit en un temps mesuré, avec un modèle plus rapide et une diarization seulement quand il y a plusieurs voix | S2 | — |
| S14 | #11269 | MC | petit | Un média à vue unique est effacé du disque après lecture par tous ses destinataires | S9 | DEC-SERVEUR (ATTEND) |
| S15 | #11270 | ME | developper | MeeshyLens v1 est un contrat Zod partagé, toléré, relu par vitest et par un miroir Swift généré | — | — |
| S16 | #11271 | ME | developper | Un pack de lens se propose, se modère avec un créneau, un lieu et une communauté, et s'installe par le moteur de packs | S15, S21 | — |
| S17 | #11272 | MF | developper | Un pack se possède aussi par le jeu, un octroi admin ou un événement — jamais seulement par l'achat | — | DEC-UPSELL (défaut) |
| S18 | #11273 | MF | petit | Un contour d'avatar ou un cadre de bannière peut récompenser un rang du jeu | S17 | — |
| S19 | #11274 | MF | developper | Un pack a une fenêtre de disponibilité et un ciblage (communauté, pays, langue), et peut récompenser une saison | S17 | DEC-UPSELL (défaut) |
| S20 | #11275 | MF | developper | L'administration publie, retire, date, cible et modère un pack par l'API, avec une piste d'audit — sans déploiement | S19, S16 | — |
| S21 | #11276 | MF | petit | La boutique dit ce qui reste à débloquer et comment l'obtenir | S17, S19 | — |
| S22 | #11277 | MD | developper | La qualité d'un appel est persistée et lisible : gels, limitation, MOS, relais, codec, plateforme | S17 | — |
| S23 | #11278 | MD | developper | Un appel passe derrière un pare-feu qui ne laisse sortir que le 443 | S1 | — |
| S24 | #11279 | MD | petit | Un cadre en direct peut être choisi dans un appel de groupe (3 à 6) | — | — |
| S25 | #11280 | M164 | developper | Le temps-à-première-image et le rebuffer de chaque surface remontent en p50/p95 par tier d'appareil | S22 | — |
| S26 | #11327 | ME | developper | Un partenaire a une identité vérifiée, son crédit voyage avec le média, et l'usage d'une lens se compte sans identifier personne | S16 | DEC-LENS (ATTEND) |
| S27 | #11329 | MC | developper | Un média porte une description textuelle, et la transcription d'une vidéo ou d'un vocal se sert en sous-titres traduits | S9 | — |

### iOS — lecture

| Lot | Issue | Milestone | Taille | Résultat attendu | Dépend de | Décision |
|---|---|---|---|---|---|---|
| IL1 | #9892 | M164 | developper | La piste son d'un réel est élue par le Prisme strict du lecteur, pas par les défauts de composition | IL17 | — |
| IL2 | #11281 | M164 | developper | Chaque iPhone connaît son tier média (bas, moyen, haut, pro) et toutes les lois de lecture le lisent | — | — |
| IL3 | #9880 | M164 | developper | La politique média suit la chaleur, le mode Économie d'énergie et le tier EN COURS de lecture, sur tous les lecteurs | IL2, IL4, IL17, IL11 | — |
| IL4 | #11282 | M164 | petit | Un réel ou une bulle muets ne décodent pas leur piste audio | — | — |
| IL5 | #11283 | M164 | petit | La session réseau des médias est typée vidéo, respecte les données mobiles et rend la fenêtre lointaine discrétionnaire | — | — |
| IL6 | #11284 | M164 | petit | Le préchargement des réels et des stories s'arrête quand l'app passe en arrière-plan ou que l'écran est couvert, et reprend au retour | IL1 | — |
| IL7 | #11285 | M164 | petit | Tout lien d'affichage déclare sa plage de cadence, et une garde interdit le retour d'un lien sans plage | — | — |
| IL8 | #11286 | M164 | petit | Le cache média s'évince sous pression DISQUE réelle, pas seulement au-dessus de son budget | — | — |
| IL9 | #9872 | M164 | developper | Les avatars et vignettes se décodent à la taille affichée, hors du fil principal et en parallèle — suite | IL8 | — |
| IL10 | #9883 | M164 | developper | Les effets de bulle et les horloges visuelles ne refiltrent plus à chaque image et suivent l'écran, pas un Timer | — | — |
| IL11 | #9882 | M164 | developper | Seuls les fichiers sur le disque deviennent des lecteurs préparés, le pool garde en priorité les voisins du réel affiché, et la fin d'un fichier se signale au lieu d'être interrogée | IL6 | — |
| IL12 | #11287 | M164 | petit | La fin de la lecture des stories remonte un QoE comme les réels, avec le temps-à-première-image mesuré depuis isReadyForDisplay | IL2, S25 | — |
| IL13 | #9879 | M164 | developper | La libération et la requête de session audio d'un canvas sont ordonnées — plus de baisse-remontée de la musique des autres apps au balayage | — | — |
| IL14 | #9878 | M164 | lourd | Le lecteur de stories et de réels partage un seul moteur audio, et le son reprend seul après un changement de sortie | IL13 | — |
| IL15 | #9881 | M164 | lourd | Une story vidéo ne se télécharge qu'une fois et ne redémarre pas en pleine lecture ; une bulle vidéo joue avant la fin du téléchargement | IL11, IL3, IL5 | — |
| IL16 | #11288 | M164 | developper | La fenêtre lointaine des réels (N±3 à N±10) ne charge que la tête du fichier, et le reste arrive en flux à l'élection | IL15, IL11, IL2 | — |
| IL17 | #9890 | M164 | petit | Le code média mort quitte le dépôt, et l'aperçu plein écran du composer passe par le lecteur commun | — | — |
| IL18 | #9891 | M164 | developper | Une seule implémentation par brique média : vignettes vidéo, sous-échantillonnage, reflet de chargement, points de frappe, pulsation | IL17, IC6 | — |
| IL19 | #9865 | M164 | lourd | Les keyframes d'une story sont jouées par Core Animation, synchronisées à la vidéo — plus réévaluées par le CPU à chaque image | IL14 | — |
| IL20 | #11289 | M164 | developper | Un média vu récemment reste lisible hors ligne pendant N jours | IL8, IL9, IL5, IL16 | DEC-LECTURE (défaut) |
| IL21 | #11330 | M164 | developper | Une vidéo ou un vocal se lit avec ses sous-titres dans la langue du lecteur, et VoiceOver décrit chaque média | S27, IL4 | — |

### iOS — création, appels, filtres, boutique

| Lot | Issue | Milestone | Taille | Résultat attendu | Dépend de | Décision |
|---|---|---|---|---|---|---|
| IC1 | #9870 | MB | developper | Importer une vidéo de la photothèque passe par un fichier, sans transcodage caché ni gel de l'interface | — | — |
| IC2 | #9885 | MB | developper | Une photo n'est encodée qu'une fois entre la caméra et l'envoi : passthrough d'un JPEG dans le budget, octets d'origine préservés, PNG jamais converti en JPEG, GPS retiré au client | IC1 | DEC-COMPRESSION (défaut) |
| IC3 | #11290 | MB | developper | Une vidéo compressée sur iPhone garde sa stéréo, son 48 kHz, son HDR, et vise une qualité plutôt qu'un débit | IC2 | DEC-COMPRESSION (défaut) |
| IC4 | #9912 | MB | petit | La pré-montée d'une vidéo du composer part compressée, avec son vrai type MIME | IC3, IC12 | — |
| IC5 | #11291 | MB | petit | L'iPhone envoie ses HEIC tels quels dès que la passerelle les accepte | IC3, S8 | — |
| IC6 | #9873 | M164 | lourd | Glisser un curseur de filtre ou de réglage répond à chaque image : aperçu GPU sur une image réduite, un seul CIContext par domaine | — | — |
| IC7 | #9874 | M164 | developper | La timeline du composer ne réévalue plus toute la vue à chaque tick de tête de lecture | — | — |
| IC8 | #9884 | M164 | developper | Le composer démarre vidéo et son ensemble même quand la vidéo n'est pas prête, n'empile jamais deux recalages de dérive, et n'emprunte le tampon de 5 ms que pendant la lecture | IC7 | — |
| IC9 | #9886 | M164 | developper | Une seule forme d'onde, calculée par Accelerate, dessinée à la bonne échelle dans le composer | — | — |
| IC10 | #9887 | M164 | petit | Le niveau du micro pendant un vocal suit l'écran, pas un Timer à 20 Hz | — | — |
| IC11 | #9877 | M164 | lourd | L'export d'une story se compose sur le GPU, hors du fil principal, et décode ses vidéos superposées en séquence | IC6, IL19 | — |
| IC12 | #9889 | M164 | petit | Couper la longueur d'une vidéo sans la retoucher ne la ré-encode plus | — | DEC-COMPRESSION (défaut) |
| IC13 | #11292 | MD | developper | Chaque lien du maillage d'un appel de groupe encode à sa juste taille — plus cinq encodages 720p pour six participants | — | — |
| IC14 | #11293 | MD | developper | La caméra d'un appel descend avec le palier de qualité et l'état thermique, pas seulement l'encodeur | — | — |
| IC15 | #11294 | MD | developper | Les gels d'un appel se mesurent, et un MOS les résume | S22 | — |
| IC16 | #11295 | MD | petit | L'isolation vocale d'Apple s'active en un geste depuis le panneau d'appel | — | — |
| IC17 | #11296 | MD | petit | Un réglage « masquer mon adresse IP dans les appels » force le relais TURN | IC14 | — |
| IC18 | #9777 | MD | petit | Les contrôles posés sur un cadre d'appel restent lisibles : la réserve de chrome protège les textes du cadre | — | — |
| IC19 | #11297 | MD | developper | Les cadres d'appel servent le groupe (3 à 6) sur la grille, sous le même budget GPU | S24, IC18 | — |
| IC20 | #11298 | ME | lourd | Un seul peintre de lens rend l'aperçu caméra, la photo, la vidéo, la retouche et l'appel | IC6 | — |
| IC21 | #11299 | ME | developper | Le visage se lit en 76 points avec son orientation, sur une file à part, et sert les déclencheurs | — | — |
| IC22 | #11300 | ME | lourd | Les cinq primitives de MeeshyLens se rendent à l'identique sur iOS : LUT, cadre, sticker ancré, texte, particules | IC20, IC21, S15 | — |
| IC23 | #11301 | ME | developper | Les déclencheurs simples animent une lens : bouche ouverte, sourcils, sourire, clignement, toucher, temps, parole | IC22 | — |
| IC24 | #11302 | ME | petit | Un pack de lens s'installe sur iOS par le moteur de packs, avec son crédit et son créneau | S16, IC22, IC28 | — |
| IC25 | #11303 | ME | developper | La caméra du composer propose les lens à côté des filtres, effets et cadres, et les cuit dans la photo et la vidéo | IC23, IC24, IC4, IC9 | — |
| IC26 | #11304 | ME | petit | Une lens s'applique sur une image existante — story et retouche | IC25 | — |
| IC27 | #11305 | ME | developper | Une lens tient dans l'appel sans sortir de l'échelle de dégradation | IC23, IC14, IC20 | — |
| IC28 | #11306 | MF | developper | La boutique iOS montre ce qui reste à débloquer et comment, et une parure de rang s'équipe | S21, S18 | — |
| IC29 | #11328 | MB | petit | L'écran verrouillé continue d'attacher une image quand le serveur fabrique des rendus AVIF, HEIC ou H.264 de compatibilité | S7 | — |

### Web et coque Android

| Lot | Issue | Milestone | Taille | Résultat attendu | Dépend de | Décision |
|---|---|---|---|---|---|---|
| W1 | #11307 | MG | developper | Un réel sous la feuille de commentaires ne se refiltre plus à chaque image | W10 | DEC-WEB (défaut) |
| W2 | #11308 | MG | developper | La coque Android ne monte que les lecteurs vidéo qu'elle peut décoder : N±1 décodés, N±2 en octets | W1 | DEC-WEB (défaut) |
| W3 | #11309 | MB | petit | Le vocal, la vidéo et l'export suivent une seule loi de codecs, et un vocal pèse 32 kb/s | — | — |
| W4 | #11310 | MB | developper | Une photo se développe et se recompresse hors du fil principal, et part recompressée partout où le profil le fait déjà | — | — |
| W5 | #11311 | MG | developper | Un envoi coupé reprend après rechargement ou mise en arrière-plan | — | DEC-WEB (défaut) |
| W6 | #11312 | MG | petit | Le trim audio décode par fenêtre, jamais le fichier entier en mémoire | — | — |
| W7 | #11313 | MD | petit | Les compositeurs d'appel peignent au rythme des images, pas d'un setInterval | W3 | — |
| W8 | #11314 | MG | developper | Les animations de géométrie passent sur transform et opacity — six sites | — | — |
| W9 | #11315 | MB | developper | Un HEIC choisi sur Android ou Chrome part et s'affiche, jamais en échec silencieux | S8, W4 | — |
| W10 | #11316 | MG | developper | L'appareil déclare un tier de capacité unique, jumeau de la loi iOS, et tous les consommateurs le lisent | — | — |
| W11 | #11317 | MG | petit | Les Web Vitals et les tâches longues remontent avec le QoE de lecture | W10, S25 | — |
| W12 | #11318 | MB | developper | Le web choisit le rendu servi : AVIF puis WebP en <picture>, et la vidéo H.264 de compatibilité | S7, S6, W10 | — |
| W13 | #11319 | MD | petit | Le web négocie comme iOS : max-bundle, rtcp-mux, pool ICE, H264 d'abord, et « masquer mon IP » | — | — |
| W14 | #11320 | ME | lourd | Le web rend LUT, cadre, sticker, texte et particules d'une lens, ancrés à la boîte du visage | S15, W13 | — |
| W15 | #11321 | ME | developper | Le web lit 478 points de visage, chargé à la première lens de visage seulement | W14 | — |
| W16 | #11322 | ME | lourd | Un partenaire propose une lens depuis le web, avec un aperçu caméra, et la modération la publie avec créneau, lieu et crédit | S16, W14, W17 | — |
| W17 | #11323 | MF | developper | L'administration web publie, retire, date, cible et modère les packs sans déploiement | S20 | — |
| W18 | #11324 | MF | petit | La boutique web montre ce qui reste à débloquer et comment | S21 | — |
| W19 | #11325 | MG | petit | La coque Android déclare la version minimale de WebView qu'elle exige et le dit à l'utilisateur en dessous | — | — |
| W20 | #11326 | MG | developper | Un média vu récemment reste lisible hors ligne sur le web et la coque, avec les plages servies depuis le cache | W10 | DEC-WEB (défaut) |
| W21 | #11331 | MG | petit | Le web affiche les sous-titres d'une vidéo ou d'un vocal dans la langue du lecteur, et chaque média porte sa description | S27 | — |

## Les décisions qui attendent le porteur

- **#11247 — Décision : ce que « sans perte » veut dire pour une photo, une vidéo et une voix envoyées depuis Meeshy** (7 points)
- **#11248 — Décision : qualité par tier d'appareil, hors-ligne, télémétrie de lecture, et clôture des lots corrigés sans mesure** (5 points)
- **#11249 — Décision : exposition publique des médias, MinIO, transcodage serveur, CDN, file de traitement** (8 points)
- **#11250 — Décision : SFU, chiffrement de bout en bout des appels, AV1** (3 points)
- **#11251 — Décision : filtres de partenaires — ARKit, shaders, revue, rémunération, identité, crédit, géo, filigrane** (9 points)
- **#11252 — Décision : cadres, contours, bannières et fonds — gagnés, offerts, ou un jour payants** (6 points)
- **#11253 — Décision : web et coque Android — réel sous la feuille, N±2 sur Android, export hors écran, envoi en arrière-plan** (4 points)
- **#11254 — Décision : modération des photos, vidéos et sons envoyés** (1 points)
- **#11255 — Décision : droits et attribution des sons de la bibliothèque** (1 points)

## L'orchestration

Script : `.claude/workflows/meeshy-media-entreprise.js` (données : `.claude/workflows/meeshy-media-entreprise.lots.json`). Quatre chaînes en parallèle — `serveur` dans le clone principal, `ios-lecture`, `ios-creation` et `web` dans trois worktrees (le hook en refuse un quatrième) — ; dans une chaîne, les lots l'un après l'autre, chacun sur `lot/<clé>-<issue>` depuis `origin/dev`. Par tour : Synchroniser (opus : fetch, worktrees, shared rebâti, rouge préalable de `dev`, relevé des sujets tenus ailleurs) → Fusionner (opus : les PR des tours précédents, au vert ; un rouge causé par le lot se corrige, un rouge préexistant se dit) → Cadrer (opus : chaque lot vérifié contre l'arbre vivant) → Développer (sonnet ; haiku pour les petits ; opus pour les lourds) → Revue-correction (opus) → Livrer (sonnet : gates complets, merge de `dev`, PR) → Bilan (haiku : issues commentées). Un lot qui attend une décision sans défaut n'est pas lancé. Neuf tours attendus, dictés par la chaîne des filtres iOS.

## Ce que le cloud ne peut pas faire

- Compiler et tester le Swift autrement que par la CI de la PR ; mesurer (Instruments, énergie, fps) : session sur le Mac du porteur.
- Déployer en production (compose, coturn, MinIO, transcodage) et purger des données : feu vert du porteur (#9223).
- Inscrire les issues au projet « Meeshy — pilotage » (GraphQL indisponible depuis la session cloud).
