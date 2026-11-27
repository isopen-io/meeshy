# Journal de la routine « Cercles proches — un lot par réveil »

Ce fichier RACONTE ce que chaque réveil a fait. L'état fait foi dans les issues
(épopée #13925, milestones #215, #220, #223), jamais ici.

## 2026-11-07 — réveil 1 : le Bring sur le web (`proche-bring@web`, #13936)

- Reprise : aucun journal, aucune PR ouverte de la routine. Le sous-lot serveur du Bring
  est fusionné (PR #14441) ; aucun client ne le sert encore (ni web, ni iOS, ni Android).
- Lot choisi : `proche-bring@web` — le seul sous-lot client prouvable en conteneur
  (iOS et Android ne compilent qu'en CI).
- Livré dans la PR (voir l'issue) : recevoir (écran d'alerte, sonnerie de l'appel
  réutilisée, arrêt au geste propagé, expiration sans événement, dédoublonnage par
  `bringId`), envoyer (fiche d'un ami : bouton expliqué, compteur du jour, confirmation,
  « Ça sonne chez X · Annuler », refus silencieux), bloquer (« Bloquer ses Bring » actif
  sur la fiche d'un lien, optimiste).
- Gates locaux : typecheck vert ; `bun test` 29 755 verts, 1 rouge hors lot
  (`act-leak-guard.test.ts`, sous-processus bun 1.4.4 local, rouge aussi sans ce lot) ;
  build et poids verts ; les gates Playwright ne tournent pas en conteneur (navigateur
  absent), ils se prouvent en CI.
- Ce qui reste du Bring : `proche-bring@ios` (référence, Critical Alerts / time-sensitive,
  NSE), `proche-bring@android` (`USAGE_ALARM`, plancher `bring_stopped`), l'interrupteur
  global « Recevoir des Bring » sur le web (suivi), décisions #14409 et #14450.
- Prochain lot recommandé : `proche-bring@ios` (prouvé par la CI iOS), puis Android ;
  ensuite le talkie (#13935).

## 2026-11-07 — réveil 2 : le Bring sur iOS (`proche-bring@ios`, #13936)

- Reprise : aucune PR de la routine ouverte ; le web du Bring est fusionné (#16589). Aucune branche vivante
  n'écrit les chemins iOS du Bring (les branches `lot/proche-*` datent du 2026-11-02, déjà fusionnées).
- Lot choisi : `proche-bring@ios`, recommandé par le réveil 1 — iOS est la référence de disposition.
- Livré dans la PR #16608 : SDK (`BringService`, `bring:ring`/`bring:stopped` routés et publiés, pushes ramenés à
  la même forme), recevoir (`BringCenter` + écran plein par-dessus l'app, `Ringtone.caf` réutilisé en
  `.playback`, arrêt d'un geste propagé, expiration sans événement, dédoublonnage socket/push), NSE (`bring` passe
  Ne pas déranger, push et sons coupés), envoyer (fiche d'un ami : explication, compteur, confirmation « pas un
  service d'urgence », « Ça sonne chez X · Annuler »), bloquer (« Bloquer ses Bring » actif sur la fiche d'un lien).
- Gates locaux : gardes iOS texte vertes (localisation, règles maison, cohésion, littéraux de loi, ViewBuilder,
  catalogue mort à 329, couleurs), vitest `packages/shared/__tests__/ci` 122/122. iOS ne compile pas en
  conteneur : preuve par la CI iOS de la branche (projet Xcode régénéré par `[xcodegen]`).
- Ce qui reste du Bring : `proche-bring@android` ; interrupteur global sur iOS (#16609) et sur le web (#16588) ;
  Critical Alerts (#14112) ; décisions #14409, #14450 inchangées.
- Prochain lot recommandé : `proche-bring@android` (prouvé par `android.yml`), puis le talkie (#13935) côté web
  ou iOS.

## 2026-11-07 — réveil 3 : le Bring sur Android (`proche-bring@android`, #13936)

- Reprise : aucune PR de la routine ouverte ; l'iOS du Bring est fusionné (#16608). Aucune branche vivante n'écrit
  `apps/android/**/bring` ni `push-type-routing.ts`.
- Lot choisi : `proche-bring@android`, recommandé par le réveil 2.
- Trouvé en chemin : le jeton FCM de l'Android natif ne déclarait ni `appVersion` ni `bundleId` ; la passerelle ne lui
  servait donc AUCUN type à plancher. Le jeton les déclare désormais, `versionName` passe à 3.1.0 et le plancher
  Android de `bring_stopped` est posé à 3.1.0.
- Livré et FUSIONNÉ dans `dev` par la PR #16616 (CI verte, `android.yml` vert sur le dernier commit : assembleDebug + testDebugUnitTest) : loi pure `BringPushRouter` (`:core:model`), `BringPushHandler` avant le chemin des messages,
  `BringRingService` (premier plan, `USAGE_ALARM`, vibration, expiration), notification alarme sur canal muet dédié,
  écran plein `BringRingActivity` iso `BringRingView.swift`, « Arrêter » optimiste puis `DELETE /bring/:bringId`
  (`BringApi.stop`, cliquet « à porter » 129 → 128), libellés `bring.incoming.*` adoptés du catalogue iOS.
- Gates locaux : passerelle 147/147 (Bring, routage, push) et `tsc` vert ; `BringPushRouterTest` 13/13 par
  `meeshy.sh jvm-check` (Kotlin pur ; demande `-Dorg.gradle.jvmargs=-Xmx6g` et
  `-Pkotlin.compiler.execution.strategy=in-process`, sinon le démon Kotlin manque de mémoire). Le reste d'Android se
  prouve par `android.yml` (déclenché en `workflow_dispatch`, la CI de PR étant gelée).
- Ce qui reste du Bring : envoyer et bloquer sur Android (#16617) ; avatar de l'expéditeur sur l'écran plein Android
  (iOS l'affiche, la charge le porte) ; interrupteurs globaux iOS (#16609) et web (#16588) ; Critical Alerts (#14112) ;
  décisions #14409, #14450.
- Prochain lot recommandé : #16617 (envoyer et bloquer sur Android), puis le talkie (#13935).
- Revue adversariale : non bloquante. Corrigé dans le lot : la durée de sonnerie se lit sur les horloges du serveur
  (un téléphone en avance ne perdait plus le Bring sans un signe), `stopSelfResult` protège un second Bring arrivé
  pendant l'arrêt, le repli sans service libère l'état à l'échéance, le témoin du jeton peut tomber. Consignés :
  registre persistant, type du service au regard de Play, quota de priorité FCM (#16619).

## 2026-11-07 — réveil 4 : envoyer et bloquer le Bring sur Android (#16617)

- Reprise : la PR #16616 (réception du Bring sur Android) était ouverte ; sa CI (`android.yml` et `ci.yml` en
  `workflow_dispatch`) est passée au vert et le réveil 3 l'a fusionnée dans `dev` pendant ce réveil. La PR #16624
  (présence sur l'écran du Bring iOS) est menée par le réveil 2 : ce réveil ne l'a pas touchée. Un réveil 5 a démarré
  en parallèle ; la branche de ce lot a été poussée vide avant toute écriture et le réveil 5 prévenu (« celui qui n'a
  rien écrit cède »).
- Lot : #16617. SDK : modèles du contrat (`Bring.kt`), `BringApi` (disponibilité, envoi), `RelationsApi` (réglages par
  personne), `bring:stopped` sur la socket (étend `RelationSocketEventsManager`, pas de jumelle), `BringRepository`
  (refus rangés sans dire « bloqué », « Ça sonne » suivi jusqu'à l'arrêt, l'échéance ou l'annulation). Fiche d'un ami :
  `ProfileBringRow` iso `ProfileBringRow.swift`. Fiche d'un lien : « Bloquer ses Bring » ACTIF, optimiste, retour
  arrière dit. Cliquet « à porter » 128 → 124. Douze libellés adoptés du catalogue iOS.
- Gates locaux : modèles Kotlin purs (`jvm-check`) verts, chaînes générées à jour, budget de taille respecté. Le reste
  se prouve par `android.yml` sur la PR.
- Prochain lot recommandé : le talkie (#13935), côté serveur puis iOS ; restent du Bring les suivis #16619, #16609,
  #16588, #14112.

## 2026-11-07 — réveil 5 : le talkie reçu sur le web (`proche-talkie@web`, #16638)

- Reprise : #16624 (présence sur l'écran du Bring iOS) est menée par le réveil 2, encore actif ; #16617 (envoyer et
  bloquer le Bring sur Android) est réservée par le réveil 3 (branche `claude/cercles-bring-android-envoyer`). Ce
  réveil n'avait rien écrit (le réveil 4 l'a prévenu) : il cède les deux et prend le talkie (#13935).
- Lot choisi : la RÉCEPTION du talkie sur le web et « Couper son talkie » sur la fiche d'un lien (#16638).
- Livré dans la PR (voir #16638) : `lib/talkie/talkie-live.ts` (`talkie:incoming` / `talkie:chunk` / `talkie:ended`,
  ordre par `seq`, dédoublonnage, émetteur vérifié, expiration à l'horloge de l'onglet, `cut` fait taire sur-le-champ),
  `lib/talkie/talkie-player.ts` (chaque fragment AAC ADTS décodé en parallèle et planifié À LA SUITE du précédent,
  tampon de gigue de 80 ms, `AudioContext` créé au premier fragment), `components/talkie-host.tsx` (indicateur non modal
  « X vous parle » + « Couper », armé dans le chrome différé), « Couper son talkie » ACTIF dès Proche sur la fiche d'un
  lien. Le réglage par personne est GÉNÉRALISÉ : `lib/relations/person-settings.ts` (une lecture pour la fiche, une
  écriture stricte d'un champ) sert Bring et talkie, `circle-bring-block.tsx` devient `circle-reception-block.tsx`.
  `packages/shared/types/talkie-constants.ts` sort les constantes du talkie de `talkie.ts` (qui les répand) pour que le
  web les lise sans embarquer Zod (le cliquet de poids du chunk `zod` l'exigeait).
- Ce qui reste du talkie : ÉMETTRE depuis le web (#16641, encodage AAC du navigateur), `proche-talkie@ios`
  (PushToTalk, NSE), `proche-talkie@android` ; décisions #14465, #14492.
- Prochain lot recommandé : `proche-talkie@ios` (référence ; recevoir d'abord, prouvé par la CI iOS), sinon l'écoute
  (#13934) côté web avec le titre défilant sur l'avatar.

## 2026-11-07 — réveil 6 : recevoir le talkie sur iOS (#16673)

- Reprise : deux autres réveils menaient encore leur PR (#16624 écran du Bring iOS, #16644 réception du talkie sur le
  web) ; ce réveil ne les a pas touchées et a pris le sous-lot iOS du talkie, que personne n'écrivait. Issue #16673
  ouverte sous #13935 (milestone #215), branche réservée avant toute écriture, l'autre réveil prévenu.
- Livré dans la PR #16674 : SDK (`Talkie.swift`, trois événements routés, fragment binaire lu en `Data` et passé par la
  même file ordonnée que les charges décodées, `talkieBlocked` lu, `setReceptionBlocked` écrit un champ) ; app
  (`TalkieCenter` iso `talkie-live.ts`, `TalkieVoicePlayer` par fragments planifiés sur l'horloge audio, silencieux
  respecté, indicateur non modal « X vous parle · Couper », « Couper son talkie » actif dès Proche ;
  `CircleBringBlock*` → `CircleReceptionBlock*`).
- Gates locaux : `check_localization.py`, `check_house_rules.sh` (30 règles), `check_cohesion_budget.sh` verts ;
  `vitest packages/shared/__tests__/ci` 122/122. iOS se prouve par la CI de la PR (`[xcodegen]` puis `ios.yml` en
  `workflow_dispatch`).
- Ce qui reste du talkie : Android (réception + couper), émission iOS / web (#16641) / Android, arrière-plan iOS
  (PushToTalk ou NSE) et Android (FCM), décodeur continu iOS si la recette entend une couture entre fragments.
- Prochain lot recommandé : réception du talkie sur Android (#16675, iso iOS), puis l’émission iOS.
## 2026-11-07 — réveil 7 : l'écoute partagée, côté serveur (`proche-sang-ecoute`, #16686 ⊂ #13934)

- Reprise : #16674 (talkie reçu sur iOS) est menée par le réveil 6, #16624 (présence sur l'écran du Bring iOS) par le
  réveil 2 ; ni l'une ni l'autre n'est touchée ici. Aucune branche vivante n'écrit `now-playing` ni `services/nowPlaying`.
- Lot choisi : le sous-lot SERVEUR de l'écoute (#13934), premier de son ordre (`proche-sang-ecoute` → iOS → Android →
  web). Issue #16686 ouverte au milestone #215.
- Livré dans la PR (voir #16686) : contrat partagé `now-playing:update|clear` → `now-playing:changed|cleared` ; état
  complet rangé SCELLÉ (`secret-at-rest`, lié au compte, 15 min) ; projection par lecteur (rien sous Proche, catégorie
  seule pour un Proche qui l'a reçue, titre + origine pour un Sang qui les a reçus au rituel) ; recalcul aux montées
  (acceptation, rituel, accord), aux baisses, blocages et retraits ; `GET /relations/now-playing` ; la catégorie devient
  un consentement de l'émetteur (`listeningCategoryShared`, refusé par défaut, accordé dès Proche, retiré et daté par
  personne, exporté) ; `pairAccessAmong` prend le consentement.
- Ce qui reste de l'écoute : émettre et recevoir sur iOS (`proche-sang-ecoute@ios`, avec l'écran d'accord de la
  catégorie), Android, puis la réception web avec le titre DÉFILANT sur l'avatar (demande de Jacques du 2026-11-07) ;
  le fantôme (ciblé et global) n'existe pas encore en base.
- Prochain lot recommandé : `proche-sang-ecoute@web` (réception + bandeau défilant sur l'avatar, petit et prouvable en
  conteneur), puis `@ios`.

## 2026-11-07 — réveil 8 : émettre le talkie depuis le web (`proche-talkie@web`, #16641)

- Reprise : deux PR de la routine sont ouvertes, chacune menée par un réveil encore actif — #16674 (talkie reçu sur
  iOS) et #16694 (relais serveur de l'écoute, #16686). Ce réveil ne les touche pas (« celui qui n'a rien écrit
  cède ») ; l'écoute sur le web attend la fusion de #16694. Branche `claude/cercles-talkie-web-emettre` poussée vide
  avant toute écriture.
- Lot choisi : ÉMETTRE le talkie depuis le web (#16641), suite de #16638 (le web le reçoit déjà).
- Livré dans la PR : `lib/talkie/talkie-sender.ts` (appuyer ouvre `talkie:start` et le micro ensemble, ce qui est capté
  avant l'accusé part dès l'ouverture, trames AAC ADTS regroupées en fragments de ~250 ms sous le plafond servi,
  `seq` croissant, relâcher vide le reste puis `talkie:end`, durée maximale et plafonds fermés avant que le serveur ne
  coupe, un `talkie:ended` qui porte MON `talkieId` arrête le micro, refus codés rendus sans fuite : blocage et repli
  donnent la même phrase), `lib/talkie/talkie-encoder.ts` (WebCodecs : `getUserMedia` → `MediaStreamTrackProcessor` →
  `AudioEncoder` `mp4a.40.2` en `adts`, 64 kb/s ; sonde une fois par onglet), `routes/user-profile-talkie.tsx`
  (« Maintenir pour parler » sur la fiche d'un Proche ou d'un Sang, pointeur ou Espace/Entrée maintenus ; ailleurs,
  une phrase propose le message vocal ; `TALKIE_NOT_ALLOWED` retire le bouton). Treize libellés en sept langues.
- Ce qui reste du talkie : la copie en message vocal après la prise de parole et le bouton
  « Envoyer un message vocal » qui ouvre la conversation directe (#16698) ; Safari et Firefox (#16699, worklet ou second encodage
  Opus) ; l'émission iOS et Android ; la recette deux navigateurs sur staging.
- Prochain lot recommandé : l'écoute sur le web (#13934, réception + titre défilant sur l'avatar), le relais serveur
  (#16694) étant fusionné dans `dev` pendant ce réveil ; sinon l'émission du talkie sur iOS.

## 2026-11-07 — réveil 9 : mener #16700 à la fusion

- Reprise : #16700 (émettre le talkie depuis le web, #16641) n'avait plus de réveil pour la suivre ; sa CI complète
  tournait encore sur le commit de fusion précédent. #16674 (talkie reçu sur iOS) est menée par le réveil 6, encore
  actif : ce réveil ne la touche pas.
- Fait : `origin/dev` fusionné à la main dans la branche (aucun conflit, aucun fichier du lot touché par `dev`) ;
  gates locaux relancés : témoins du talkie et de la fiche 48/48, `tsc --noEmit` du web vert ; CI complète relancée
  sur le dernier commit, puis fusion dans `dev`.
- Prochain lot recommandé : l'écoute sur le web (#13934 : réception + titre défilant sur l'avatar).

## 2026-11-07 — réveil 10 : #16700 menée à la fusion (suite du réveil 9)

- Reprise : le réveil 9 s'est arrêté en attendant la CI de #16700 et de #16714 (`ci.yml` épinglé sur `ubuntu-24.04`,
  #16713). Aucun réveil vivant ne suivait ni l'une ni l'autre.
- CI de #16700 (run 42412024556) : verte sauf « Traducteur · tests Python », tombé sur un runner sans disque
  (`No space left on device` dans le diagnostic du runner, hors lot). #16714 entièrement verte : fusionnée dans `dev`.
- `origin/dev` fusionné à la main dans la branche (aucun conflit ; `dev` n'a touché que les communautés, le traducteur
  et l'iOS des appels). Gates locaux : `bun test` du web sur talkie, relations et composants 5558/5558, `tsc --noEmit`
  du web vert. CI complète relancée sur le dernier commit avant fusion.
- Prochain lot recommandé : l'écoute sur le web (#13934 : réception + titre défilant sur l'avatar).

## 2026-11-07 — réveil 11 : l'écoute d'un Proche ou d'un Sang défile sur son avatar, web (#16729 ⊂ #13934)

- Reprise : aucune PR de la routine ouverte (#16700, #16674, #16694 fusionnées). #16650 (outils de cercle entre comptes
  de l'équipe, #16623) est menée par une autre session et touche la loi d'accès, pas la réception de l'écoute.
- Lot choisi : la réception web de l'écoute avec le titre DÉFILANT sur l'avatar (demande de Jacques du 2026-11-07).
  Issue #16729 ouverte, rattachée à #13934 (milestone #215), branche `claude/cercles-ecoute-web` réservée avant toute
  écriture. PR #16732 vers `dev`.
- Livré : `lib/api/now-playing.ts` (décodeurs bornés au contrat, rattrapage `GET /relations/now-playing`),
  `lib/now-playing/listening-live.ts` (store par personne : montée ⇒ titre sans recharger, baisse ⇒ titre retiré,
  `cleared`, échéance locale bornée au TTL, rattrapage départagé par repère d'arrivée), `listening-band.ts`
  (catégorie pour un Proche, titre · origine pour un Sang), `ListeningMarquee` + `Avatar.listening` (bandeau en boucle
  sur le bas du cercle, arrêté sous `prefers-reduced-motion`, dit avec le nom), posé sur la fiche et l'en-tête d'un
  direct ; hôte dans le chrome différé. `relations.nowPlaying` sort de `PENDING_CLIENT_ENTRIES`.
- Ce qui reste de l'écoute : `proche-sang-ecoute@ios` (émettre + afficher le même bandeau sur `MeeshyAvatar`),
  Android, la rangée de liste (avatar < 40 px : une autre forme à décider), le fantôme.
- Prochain lot recommandé : `proche-sang-ecoute@ios`, sinon l'émission du talkie sur iOS.

## 2026-11-08 — réveil 12 : l'écoute d'un Proche ou d'un Sang défile sur son avatar, iOS (#16755 ⊂ #13934)

- Reprise : #16732 (écoute reçue sur le web) fusionnée dans `dev` ; aucune PR de la routine ouverte, aucune branche
  vivante n'écrit `now-playing` côté iOS. Issue #16755 ouverte sous #13934 (milestone #215), branche
  `claude/cercles-ecoute-ios` réservée avant toute écriture.
- Lot : la RÉCEPTION iOS, iso du web. SDK : `Relations/NowPlaying.swift` (décodage borné au contrat : catégorie
  connue, titre ≤ 200, origine ≤ 60, origine sans titre jetée, durée bornée au TTL ; un élément illisible du
  rattrapage est écarté sans faire tomber le reste), routes `now-playing:changed|cleared`, `RelationsProviding.nowPlaying()`.
  MeeshyUI : `AvatarListeningBand` (bandeau sur le bas du cercle, défilement de `AudioChipMarquee` RÉUTILISÉ, statique
  sous Réduire les animations, rien sous 40 pt, dit à VoiceOver) et `AvatarListeningSource` (source opaque posée par
  l'app, abonnée par personne, sans `AnyView`). App : `ListeningCenter` (iso `listening-live.ts`), posé sur la fiche
  d'une personne et l'en-tête d'un direct (déplié et replié). `RelationsEndpoint.nowPlaying` sort des exceptions du
  catalogue Swift mort (son appelant existe).
- Ce qui reste de l'écoute : ÉMETTRE depuis iOS (avec l'écran d'accord de la catégorie), Android, la rangée de liste,
  le fantôme.
- PR #16757 vers `dev` ; projet Xcode régénéré par `[xcodegen]`, preuve iOS par `ios.yml` en `workflow_dispatch`.
- Prochain lot recommandé : ÉMETTRE son écoute depuis iOS (source Meeshy d'abord, écran d'accord de la catégorie),
  sinon la réception du talkie sur Android (#16675).

## 2026-11-08 — réveil 13 : mener #16757 à la fusion

- Reprise : #16757 (écoute reçue sur iOS, #16755) était ouverte sans réveil pour la suivre. Sa CI iOS sur l'avant-dernier
  commit avait trois tranches rouges : les deux gardes d'isolement d'iOS 16/17 sur `ListeningCenter` (corrigées par le
  réveil 12 en `@concurrent`), les clés mortes `video.filter.*` (soldées sur `dev`) et `test_show_autoDismissesAfterDelay`
  (toast, hors lot).
- Fait : `origin/dev` fusionné à la main. Un conflit, `cohesion-budget.json` (`CallManager` abaissé des deux côtés) :
  après fusion le type mesure 2831, référence verrouillée à cette valeur. Gardes iOS texte relancées : règles maison,
  cohésion, localisation, inscription des tests, cohérence et guillemets du pbxproj, toutes vertes. CI complète, iOS et
  SDK relancées sur le dernier commit.
- La branche porte aussi le correctif de `dev` rouge après OPUS-5 (#16743, autre session) qu'elle avait fusionné pour
  verdir sa CI iOS.
- Tranche 4 d'iOS rouge deux fois, de façon déterministe : `MessageAuthorRingTests` portait deux fois la clé
  `Bring/BringRingView.swift` dans un littéral de dictionnaire (deux fusions de `dev`), ce qui piège à l'exécution.
  `dev` était rouge du même défaut (ses push ne lancent pas les tests). Doublon retiré dans ce lot ; diagnostic du
  réveil 12.

## 2026-11-08 — réveil 15 : émettre son écoute depuis iOS (#16803 ⊂ #13934)

- Reprise : #16757 (écoute reçue sur iOS) fusionnée ; #16778 (talkie reçu sur Android) est menée par le réveil 14,
  encore actif (CI relancée à 06:47) : ce réveil ne la touche pas. Aucune branche n'écrivait l'émission de l'écoute.
  Issue #16803 ouverte sous #13934 (milestone #215), branche `claude/cercles-ecoute-ios-emettre` réservée avant toute
  écriture.
- Lot : aucun client n'ÉMETTAIT et aucun n'ACCORDAIT `listeningCategoryShared` ; l'écoute partagée n'atteignait
  personne. Livré dans la PR #16805 : « Ce que j'écoute » ACTIF dès Proche sur la fiche d'un lien (`CirclePersonSwitch`
  généralise l'interrupteur des réceptions : blocage ou accord) ; `ListeningBroadcastLaw` (pure) + `ListeningBroadcaster`
  (état complet une fois par changement, rafraîchi à 10 min, effacé à la pause, en arrière-plan et au retrait du choix) ;
  source Apple Music après l'autorisation Médiathèque, demandée au premier accord ; SDK `NowPlayingUpdate`,
  `NowPlayingSocketEmitter` (hors de `MessageSocketManager`, garde de cohésion), réglages lus.
- Décision prise en chemin : les messages vocaux Meeshy ne sont JAMAIS une source d'écoute (message privé d'un tiers).
- Gates locaux : règles maison (30 tenues, après retrait d'une date dans un commentaire et d'un `@unchecked Sendable`),
  cohésion, localisation, inscription des tests verts ; `vitest packages/shared/__tests__/ci` 122/122. iOS par la CI.
- Ce qui reste de l'écoute : interrupteur global dans les réglages de confidentialité, Spotify, arrière-plan, Android
  (émettre + recevoir), accorder la catégorie depuis le web, rangée de liste (#16733), fantôme.
- Prochain lot recommandé : accorder « Ce que j'écoute » depuis le web et Android (le web reçoit déjà), sinon
  l'émission du talkie sur iOS.
## 2026-11-08 — réveil 14 : la voix d'un Proche sort sur Android (`proche-talkie@android`, #16675)

- Reprise : #16757 (écoute reçue sur iOS) était menée par le réveil 13, encore actif (elle a fusionné depuis) : ce
  réveil ne l'a pas touchée. L'émission de l'écoute depuis iOS toucherait les mêmes fichiers ; il prend donc la réception
  du talkie sur Android, qui n'en partage aucun. Branche `claude/cercles-talkie-android` réservée avant toute écriture.
- Livré dans la PR (voir #16675) : `TalkieFloor` (loi pure, iso `TalkieCenter.swift`) et `TalkieAdts` (découpage des
  trames, configuration du décodeur) dans `:core:model` ; les trois événements sur UN flux ordonné de
  `RelationSocketEventsManager` (le fragment en binaire natif) ; `TalkieCenter`, `TalkieVoicePlayer` (MediaCodec →
  AudioTrack en flux, silencieux respecté, rien pendant un appel) et l'indicateur `TalkieOverlay` dans `:app` ;
  « Couper son talkie » actif dès Proche sur la fiche d'un lien, le réglage par personne généralisé
  (`RelationReceptionSetting`, `CircleReceptionBlock*`, ex `CircleBringBlock*`). Libellés adoptés du catalogue iOS.
- Gates : les 18 témoins de `:core:model` verts en local (kotlinc 2.1 + JUnit, hors Gradle) ; le reste se prouve par
  `android.yml` sur la PR.
- Ce qui reste du talkie : arrière-plan Android (FCM haute priorité + service au premier plan), émission iOS et
  Android, copie en message vocal (#16698), Safari/Firefox (#16699).
- Prochain lot recommandé : émettre l'écoute depuis iOS (#16757 est fusionnée), sinon l'émission du talkie sur iOS.

## 2026-11-08 — réveil 16 : accorder « Ce que j'écoute » depuis le web (#16831 ⊂ #13934)

- Reprise : #16805 (émettre son écoute depuis iOS) fusionnée ; aucune PR de la routine ouverte. Branches vivantes des
  autres sessions (`cercles-16733-ios`, `cercles-16642-serveur`, `cercles-16643-android`, `cercles-16623-serveur`)
  n'écrivent pas la fiche d'un lien web. Issue #16831 ouverte sous #13934 (milestone #215), branche
  `claude/cercles-ecoute-web-accorder` réservée avant toute écriture.
- Lot : la fiche d'un lien web montrait « Ce que j'écoute » désactivé alors que le serveur (#16686) et iOS (#16805) le
  tiennent. `CircleReceptionBlockSwitch` (web) porte désormais un troisième champ, `listeningCategoryShared`, un ACCORD
  refusé par défaut, actif dès Proche, optimiste avec retour arrière dit ; le décodeur lit le champ absent d'un ancien
  serveur « non accordé ». Texte d'aide en 7 langues (l'iPhone, Apple Music, le titre au rituel du Sang seulement,
  jamais les vocaux). Seule « Position en direct » reste montrée désactivée.
- Gates locaux : `bun test` des fichiers touchés 132/132, `tsc --noEmit` vert ; suite web complète 30041 verts, 1 rouge
  préexistant sur `dev` (`act-leak-guard.test.ts`, rouge aussi sans ce lot dans ce conteneur, bun 1.4).
- Ce qui reste de l'écoute : accorder depuis Android, interrupteur global des réglages de confidentialité, Spotify,
  arrière-plan iOS, Android (émettre + recevoir), rangée de liste (#16733, autre session), fantôme.
- Prochain lot recommandé : accorder « Ce que j'écoute » depuis Android (fiche d'un lien, `RelationReceptionSetting`),
  sinon l'émission du talkie sur iOS.
- Issue : PR #16835 fusionnée dans `dev` à 16387ee par la fusion automatique, sur la CI de PR gelée. Le run complet
  `ci.yml` de cette tête était rouge pour deux raisons extérieures au lot : Trivy (504 au téléchargement) et
  Playwright tranche 4 (`bun.lock` au format 3 que bun 1.3.14 ne lit pas, plus la gate `media-16 … obtenu flow-end`).
  Lockfiles réparés dans la PR #16873 (#16872).

## 2026-11-08 — réveil 17 : émettre le talkie depuis iOS (#16927 ⊂ #13935)

- Reprise : aucune PR de la routine ouverte ; #16835 (accorder « Ce que j'écoute » depuis le web) fusionnée. Le lot
  recommandé, l'accord de l'écoute sur Android, touche `CircleReceptionBlockSection.kt` / `CircleLinkSheet.kt` qu'une
  branche vivante (`claude/cercles-16643-android`) écrit déjà : ce réveil cède et prend l'émission du talkie sur iOS,
  que personne n'écrivait. Issue #16927 ouverte sous #13935 (milestone #215), branche
  `claude/cercles-talkie-ios-emettre` réservée avant toute écriture.
- Lot : SDK — `TalkieSending.swift` (verdict de `talkie:start` et refus codés, blocage et repli rendus par la même issue
  `voice` ; en-tête ADTS ; `TalkieFragmenter` ~250 ms sous le plafond d'octets ; `TalkieBudget` en octets et en nombre),
  `TalkieSocketEmitter` (les trois événements client, fragment en binaire natif, hors de `MessageSocketManager`),
  `talkieStart` / `talkieSendChunk` / `talkieEnd` dans `SocketEvent`. App — `TalkieSender` (iso `createTalkieSender` :
  appui = accusé ET micro en même temps, capté avant l'accusé envoyé après, relâcher vide puis ferme, durée servie,
  `talkie:ended` de MA prise de parole), `TalkieMicCapture` (AVAudioEngine → AAC-LC mono 64 kb/s → trames ADTS, session
  par `MeeshyRecordingSession` comme les vocaux), « Maintenir pour parler » sur la fiche dès Proche
  (`ProfileTalkieRow`, retirée sur `TALKIE_NOT_ALLOWED`). Treize libellés `talkie.send.*` en sept langues.
- Ce qui reste du talkie : copie en message vocal (#16698 web, iOS à suivre), émission Android, arrière-plan iOS
  (PushToTalk) et Android, Safari/Firefox (#16699).
- PR #16928, fusionnée dans `dev` par Jacques le 2026-11-08 à 15:15 (9e7aa1b10), #16927 fermée. Gates locaux verts
  (règles maison, cohésion, localisation, couleurs en dur, parité `SocketEvent`, inscription des témoins 1909/1909,
  cliquet `any`). Quatre rouges hérités de `dev` levés en chemin : cliquet `any` et `LocationHandler.blocking` par
  refusion de `dev` ; `.foregroundColor(` (2299 > 2294) et `Color(hex:)` sur variable inconnue (476 > 475) corrigés au
  site fautif (`RainbowLetters.palette(isDark:)`), sans relever de référence. Les runs iOS, SDK et CI dispatchés sur le
  dernier commit ont été annulés par la fusion : la preuve de compilation iOS/SDK se lit sur les runs `push` de `dev`.
- Prochain lot recommandé : accorder « Ce que j'écoute » depuis Android quand #16643 aura fusionné, sinon l'émission du
  talkie sur Android.

## 2026-11-08 — réveil 18 : le partage temporaire de position, côté serveur (#16980 ⊂ #14109)

- Reprise : #16928 (talkie émis depuis iOS) est ouverte, et le réveil 17 la mène encore (il a poussé une fusion de
  `dev` à 13:43 pendant ce réveil) : ce réveil ne l'a pas touchée. L'accord de l'écoute sur Android (#16836) attend
  `claude/cercles-16643-android`, vivante. Ce réveil prend donc le lot suivant du jalon 2 dans l'ordre de la spec, la
  position temporaire (#14109), par son socle serveur. Issue #16980 ouverte, branche
  `claude/cercles-position-temporaire-serveur` réservée avant toute écriture.
- Lot : aucune voie ne partageait une position À DES PERSONNES ni ne la tronquait par lecteur. Livré dans la PR :
  loi `location.temporary` (dès Ami, consentement de l'émetteur = la liste de ses destinataires et son terme), miroirs
  Swift et Kotlin, quatre cas communs ; contrat additif `location:share-start|update|stop` →
  `location:share-changed|ended` (le partage en conversation garde `location:live-*`, inchangé) ;
  `services/sharedLocation/` sur le patron de l'écoute (état complet scellé, TTL = temps restant, projection exacte /
  quartier / ville au centre d'une maille fixe, rayon de flou) ; `GET /relations/locations?bbox=` filtré sur la
  position SERVIE ; recalcul à la baisse, au blocage, au retrait de lien et à l'acceptation.
- Audit avant fusion (porteur, deux passes « non fusionnable ») : la mise à jour écrivait sans condition, l'arrêt
  dépendait de l'horloge, le limiteur muet laissait passer. Premier correctif par sessions + pointeur + génération,
  sur `CacheStore` ; le contre-audit a montré que ce schéma supposait un magasin unique (A : `CacheStore` se replie en
  mémoire d'instance, un arrêt pendant une coupure Redis répondait `success` puis le partage revenait), une génération
  à durée de vie (B : retour à l'état initial au bout de 8 h) et une prise non atomique (C : un destinataire retiré
  sans `ended`). Réponse : `sharedLocationKv.ts`, magasin Redis STRICT sur le client natif, sans repli (panne ⇒
  `UNAVAILABLE`), trois scripts Lua (prise sous condition de génération rendant la session réellement remplacée,
  écriture sous condition de session courante, arrêt par `INCR` sans TTL), clés étiquetées `{id}`. Le repli de débit
  ne s'applique plus quand la limitation est coupée hors production et s'élague par la tête.
- Contre-audit adversarial de cette réponse (non fusionnable, trois défauts prouvés) : la fin partait vers un
  destinataire désigné qui n'avait jamais rien vu (un blocage répété révélait le partage), une fin était perdue si
  l'arrêt échouait après avoir pris, et un démarrage était annoncé en échec alors qu'il courait. Réponse : chaque
  session tient l'ensemble de ceux qu'elle a SERVIS (empreintes HMAC salées par la session, notées avant l'envoi,
  rattrapage compris) et la fin ne part qu'à eux, une fois ; une session remplacée ou arrêtée entre, dans le même
  script Lua, dans un ensemble « à retirer » qu'un nouvel essai vide ; l'accusé dit l'état réel après la prise.
  Résiduels consignés dans #16987 : course entre la loi lue par une position et une baisse concurrente, comptes
  désactivés ou supprimés pendant un partage, purge de la génération à la suppression du compte.
- Leçon : un schéma de concurrence se juge sur la cohérence du MAGASIN qu'il suppose, pas seulement sur l'ordre des
  gestes ; un cache à repli silencieux n'est pas une source de vérité pour un arrêt.
- Gates locaux : voir la PR.
- Ce qui reste de la position temporaire : iOS (#16983, émetteur + carte), web (#16984, carte en lecture), Android
  (#16985) ; « jusqu'à l'arrivée » (ETA, Live Activity, Live Update), fantôme (LOC-12), précision par niveau (RG-15).
- Prochain lot recommandé : #16983 (iOS, la référence), sinon #16984 (web, prouvable en conteneur).

## 2026-11-08 — réveil 19 : regarder ou écouter ensemble, côté serveur (#17012 ⊂ #17011)

- Reprise : #16928 (talkie émis depuis iOS) est menée par le réveil 17, qui attend sa CI ; #16986 (position temporaire,
  serveur) par le réveil 18, encore actif. Ce réveil ne touche ni l'une ni l'autre.
- Deux demandes de Jacques n'avaient AUCUNE issue : la lecture synchronisée « regarder/écouter ensemble » (#17011, et son
  sous-lot serveur #17012) et l'icône de position par cercle sur la carte (#17013, qui attend les clients de la position
  temporaire #16983–#16985). Toutes trois au milestone #215, sous l'épopée #13925.
- Lot : le sous-lot SERVEUR de « ensemble », PR #17021 vers `dev`. Contrat `together:invite|join|sync|leave` →
  `invited|started|synced|ended` ; feature `together` (dès Proche, adressée, l'invitation acceptée tient lieu de
  consentement) et ses miroirs Swift/Kotlin ; porte (loi par `pairAccess`, pièce audio/vidéo non protégée d'une
  conversation où les deux sont membres actifs, refus indistincts) ; relais scellé (`secret-at-rest`, une séance par
  paire, TTL 2 min puis 4 h), horloge serveur, rejugement à chaque geste, coupure après blocage, baisse ou retrait.
- Revue adversariale : bloquante sur deux points, corrigés dans le lot — une coupure se disait `cut` au bloqué (elle se
  dit désormais `left` aux deux, et `join`/`sync` rendent `NOT_FOUND`), et une acceptation ou une synchronisation jugée
  avant un blocage pouvait réécrire la séance après lui (pierre tombale posée par la fin, relue après chaque écriture).
  Corrigés aussi : l'index de paire est un HMAC (plus d'identifiants en clair dans les clés), une séance en clair n'est
  jamais lue quand la clé est posée, témoins de route (blocage, baisse, retrait) et de porte (banni, désactivé, vue
  unique du message). Ouverts en suivi : les autres chemins de coupure (#17022) et la préférence de réception avec un
  plafond par paire (#17023).
- Gates locaux : témoins « ensemble » et routes touchées 297/297 ; shared 9506/9506 ; `tsc` passerelle et web verts ; cliquet `any` 490 ; catalogue
  TS mort 270/270. Rouge préexistant sur `dev`, hors lot : `orphaned-sender-repair-surface-guard` (globalMessageSearch).
- Décision ouverte pour Jacques (dans #17011) : la séance reste ouverte dans une conversation E2EE (le serveur ne voit que
  des identifiants et une position) — à confirmer par `crypto-e2ee`.
- Prochain lot recommandé : « ensemble » sur le web (inviter depuis une vidéo/un audio, accepter, lecteur synchronisé),
  puis iOS ; l'icône par cercle (#17013) quand les clients de la position temporaire auront fusionné.

## 2026-11-08 — réveil 20 : regarder ou écouter ensemble sur le web (#17055 ⊂ #17011)

- Reprise : #16986 (position temporaire, serveur) est menée par le réveil 18, encore actif après deux contre-audits ;
  ce réveil ne la touche pas. #17043 (réserves de l'audit d'« ensemble ») est fusionnée. Aucune branche n'écrivait le
  web d'« ensemble » : issue #17055 ouverte sous #17011 (milestone #215), branche `claude/cercles-ensemble-web` réservée
  avant toute écriture.
- Lot : PR #17060 vers `dev`. Loi pure de synchronisation (`together-sync.ts` : position à l'horloge du serveur, écart
  d'horloge par le plus grand `at − local`, vitesse ±5 % dès 150 ms puis saut dès 1 s, un geste local ne part que s'il
  change l'état partagé) ; séance sur l'onglet (`together-live.ts` : décodeurs, store, `rev`, séance close jamais
  rouverte, gestes avec accusé) ; hôte du chrome différé (bandeau d'invitation non modal, attente annulable, lecteur
  flottant aux commandes natives) ; invitation depuis la fiche d'un Proche ou d'un Sang, par la galerie servie de la
  conversation directe (`GET /conversations/:id/attachments`, référence des entrées TS mortes 270 → 269, l'index des
  médias devant rester `import()` seulement). Libellés `together.*` en sept langues.
- Gates locaux : 42 témoins du lot verts, `tsc` web vert, `vite build` et `measure-weight` verts, catalogue TS conforme.
  Les gates Playwright ne tournent pas en conteneur (navigateur absent).
- Ce qui reste d'« ensemble » : iOS (référence), Android, inviter depuis la visionneuse et dans un groupe, coupures
  manquantes côté serveur (#17022), préférence de réception (#17023), décision E2EE ouverte (#17011).
- Prochain lot recommandé : « ensemble » sur iOS (recevoir, rejoindre, lecteur synchronisé, inviter depuis la fiche),
  sinon l'icône de position par cercle (#17013) quand les clients de la position temporaire auront fusionné.

## 2026-11-08 — réveil 21 : regarder ou écouter ensemble sur iOS (#17097 ⊂ #17011)

- Reprise : aucune PR de la routine ouverte ; `claude/cercles-16984-web` (carte des positions sur le web) est vivante
  et tenue par un autre réveil, ce réveil ne la touche pas. Issue #17097 ouverte sous #17011 (milestone #215), branche
  `claude/cercles-ensemble-ios` réservée avant toute écriture.
- Lot : PR #17101 vers `dev`. SDK : contrat `together:*` lu en Swift (décodeurs stricts, accusés), loi de
  synchronisation portée à l'identique du web (`TogetherSync`), état de séance en valeur (`TogetherState`), émetteur
  socket, galerie des pièces lisibles ensemble (`TogetherService`). App : `TogetherCenter`, `TogetherPlaybackDriver`
  (commandes de l'app seulement, pour qu'une correction du pilote ne se relise jamais comme un geste),
  `TogetherAVSurface` (AVPlayer adopté par la politique média), bandeau, attente et lecteur flottant montés dans
  `OverlayHost`, ligne sur la fiche d'un Proche. 27 libellés `together.*` en sept langues. Suivi Android : #17100.
- Le bot `[xcodegen]` a été annulé deux fois sans obtenir de runner macOS (les dispatches iOS des autres branches
  aussi) : les références du pbxproj sont posées à la main, gardes Linux vertes.
- Gates locaux : `check_house_rules.sh` 33 règles tenues, `check_cohesion_budget.sh` code 0,
  `check_localization.py`, `check_pbxproj_consistency.sh`, `check_test_registration.sh` verts. Swift ne compile pas
  en conteneur : la preuve est la CI iOS et SDK dispatchée sur la PR.
- État en fin de réveil : **PR #17101 en brouillon, NON fusionnée, aucune preuve Swift.** Les deux dispatches sur
  `1d6835a16` ont été annulés au bout d'une minute, avant tout job macOS et avant la fin des gardes Linux : iOS run
  42517215302 (« File d'attente Mac » annulée à 19:53:32, 3 suites devant), SDK run 42517212606. Ce n'est pas une
  concurrence de la branche (aucun run plus récent dans le groupe) : tous les dispatches iOS du moment, sur d'autres
  branches (#17099, #17103), finissent annulés de la même façon. Le brouillon empêche le vert vide de la CI gelée
  (`PR_CI_GEL`) d'emporter la fusion. Prochain réveil : redispatcher `ios.yml` et `sdk-tests.yml` sur la tête de la
  branche, corriger ce que Swift refuse, fusionner `origin/dev`, puis sortir du brouillon et fusionner sur CI verte.

## 2026-11-08 — réveil 22 : une séance « ensemble » s'arrête aussi quand un compte part, un membre est banni ou le média supprimé (#17022)

- Reprise : #17101 (« ensemble » sur iOS) a été fusionnée dans `dev` par le porteur à 20:39, sans preuve Swift
  propre ; le run iOS de `dev` qui la contient (42523576676) est en attente de runner. Aucune PR de la routine ouverte.
  Aucune branche vivante n'écrit `services/together/` : lot #17022 réservé sur `claude/cercles-ensemble-coupures`.
- Lot : PR #17146 vers `dev`. Relais : `rejudgeTogetherWhere` rejuge une paire, un compte (restreint ou non à une
  conversation) ou une conversation ; la paire se lit aussi par l'index du compte, ce qui retrouve une séance sortie de
  l'index de paire par des invitations concurrentes. Un index par conversation (HMAC, borné à 20, effacé avec la séance).
  `cutTogetherWhere`, relais du processus posé au démarrage par `MeeshySocketIOHandler.setupSocketIO`, appelé après
  l'écriture qui ferme par : `endConversationMembership` (départ, bannissement, retrait, suppression pour soi),
  `applyMessageRemovalEffects` (les quatre écrivains de retrait), `DELETE /attachments/:id`, l'obsolescence d'une
  conversation, la désactivation et la suppression par l'administration (bannissement de plateforme compris), la purge
  de compte et la fin de grâce.
- Revue adversariale : bloquante sur trois points, corrigés dans le lot (relais absent avant la première socket,
  suppression d'une pièce, conversation obsolète). Ouvert en suivi : la porte ne lit pas une conversation CLOSE (#17147).
  Assumés et écrits dans la PR : l'index de conversation plafonné à 20 et non atomique entre instances (la sauvegarde
  suivante réinscrit), les séances déjà en cours au déploiement absentes de l'index de conversation jusqu'à leur
  prochaine synchronisation.
- Gates locaux : 374 suites voisines (together, socketio, messaging, admin, conversations, directory, relations,
  attachments, handlers, jobs) 5 854/5 854 vertes ; `tsc` passerelle vert après fusion de `origin/dev` ; cliquet `any` 490.
- Prochain lot recommandé : #17147 (la porte lit la conversation close, petit et serveur), puis « ensemble » sur Android
  (#17100), puis l'icône de position par cercle (#17013) quand les clients de la position temporaire auront fusionné.

## 2026-11-08 — réveil 23 : mener #17148 (suite de #17146) jusqu'à la fusion (#17022)

- Reprise : #17146 a été fusionnée dans `dev` sur son premier commit (auto-fusion de la CI de PR gelée) ; ses
  corrections d'audit sont dans #17148, restée ouverte parce que `dev` était verrouillée à 22:30. `dev` a repris ses
  fusions depuis : ce réveil n'ouvre rien d'autre et mène #17148.
- Fusion de `origin/dev` dans la branche : sans conflit, les nouveautés de `dev` ne touchent que l'iOS (caméra,
  écoute) — aucun fichier de la passerelle. Le `ci.yml` dispatché sur la tête d'avant fusion (`ac2abe92`) était vert ;
  un nouveau dispatch prouve le commit de fusion.
- Prochain lot recommandé : inchangé — #17147 (la porte lit la conversation close), puis « ensemble » sur Android
  (#17100), puis l'icône de position par cercle (#17013).

## 2026-11-09 — réveil 24 : mener #17148 à la fusion (#17022)

- Reprise : #17148 (coupures « ensemble » au démarrage, à la suppression d'une pièce ou d'une conversation) restait
  ouverte, la fusion ayant été refusée deux fois (`dev` verrouillée la nuit, 405). Aucun nouveau lot ouvert.
- `origin/dev` fusionnée à la main dans la branche (aucun conflit) ; témoins touchés 14 suites, 191/191 verts ; `tsc`
  passerelle vert. `ci.yml` redispatché sur la nouvelle tête avant la fusion.
- Prochain lot recommandé : #16983 (position temporaire sur iOS) ou #16984 (web), puis l'icône par cercle (#17013).

## 2026-11-13 — réveil 25 : mener #16987 (partage de position : comptes qui partent, ligne de maille, course) à la fusion

- Reprise : #17956 (carte des positions sur le web, #16984) et `claude/cercles-ensemble-conversation-close` (#17147)
  sont menées par des réveils actifs (poussées dans la dernière demi-heure) ; `claude/cercles-16588-web` aussi. Ce réveil
  ne les touche pas.
- Trouvé : la branche `claude/cercles-16987-serveur`, écrite et contre-auditée deux fois le 2026-11-08 (voir #16987),
  n'avait jamais été proposée et n'avait plus de réveil depuis quatre jours. Ce réveil la reprend.
- `origin/dev` fusionnée à la main : un conflit dans `AccountPurgeService.ts`, les deux côtés gardés (dev efface les
  relais externes ouverts par le compte, la branche arrête son partage de position), l'arrêt placé en dernier pour ne
  pas décaler la déstructuration du résumé de purge.
- Gates locaux : `tsc --noEmit` passerelle (8 Go de tas) et shared verts ; témoins passerelle du lot et voisins
  (sharedLocation, rituel, blocage, purge, administration, suppression de compte, maintenance, relations, balayages,
  gardes et cliquets) 1 689/1 689 ; shared (`shared-location`, `relation-access`) 252/252.
- Contre-audit adversarial des dernières corrections (b5837a213c, fede6d4463) relancé avant la fusion.
- Contre-audit de 7e7dde1 : **bloquant**, deux constats élevés (un socket resté ouvert d'un compte désactivé ou
  supprimé rangeait un nouveau partage, que la réactivation faisait revenir) et deux moyens (le rejeu d'une montée et
  le rattrapage ne relisaient pas la loi après avoir noté le lecteur ; un lecteur dont l'accès se fermait sans rejeu,
  un rôle d'équipe qui redescend, gardait le point). Corrigés en TDD : le démarrage relit l'émetteur après la
  génération, le rejeu, la réconciliation et le rattrapage relisent après avoir noté, et l'éventail envoie la fin aux
  servis dont l'accès est fermé. Le monde des témoins du relais sort dans un helper partagé (budget de taille).
- Vérification des corrections : une régression trouvée (le rattrapage qui constatait une perte dénotait le lecteur
  sans lui envoyer la fin, et la baisse ne le trouvait plus), corrigée : la fin part à qui avait reçu le point en
  direct, rien à qui n'avait rien vu. Chaque correction a son témoin, prouvé rouge sur la tête d'avant.
- Constats faibles mis en suivi : #17992 (ligne de maille au franchissement, purge annulée, fin perdue sans socket,
  `MGET` sous Redis Cluster, p95 de la relecture, rejeu au changement de rôle).
- Prochain lot recommandé : #16983 (position temporaire sur iOS, la référence), puis l'icône par cercle (#17013).

## 2026-11-13 — réveil repris après coupure : clore #17188 sur sa preuve

- Reprise : run coupé à 05:13 par une erreur d'API, repris à 13:49. Onze PR de la routine ou voisines sont ouvertes et
  toutes écrites dans les vingt dernières minutes par des réveils vivants (#17956, #17967, #17969, #17973, #17976,
  #17979, #17981…) : ce réveil n'en prend aucune et n'ouvre pas de branche de code concurrente (« celui qui n'a rien
  écrit cède »).
- Lot : #17188 (témoin « ensemble » du SDK, écart d'horloge en `Double`) fermée sur preuve. Le correctif était sur
  `dev` par #17186 ; `sdk-tests.yml` sur `0a77cc7dbd` (run 43391316368) rend « Verdict iOS SDK » vert, six tranches
  `Passed`, 0 échec, aucun témoin `TogetherTests` désactivé.
- Décisions ouvertes pour le porteur : #17218 (niveau d'accès servi entre deux comptes de l'équipe dont l'un bloque
  l'autre) et #17971 (une communauté désactivée coupe-t-elle ses séances « ensemble »).
- Prochain lot recommandé : mener à la fusion les PR ouvertes avant d'en ouvrir d'autres ; ensuite « ensemble » sur
  Android (#17100), aucune branche ne l'écrivant au 2026-11-13 13:50.

## 2026-11-13 — réveil 25 : une séance « ensemble » s'arrête dans une conversation close (#17147)

- Reprise : aucune PR de la routine ouverte ; #17148 fusionnée le 2026-11-09. #17956 (carte des positions sur le web,
  `claude/cercles-16984-web`) est tenue par un autre réveil, active : ce réveil ne la touche pas. Aucune branche n'écrit
  `services/together/` : lot #17147 réservé sur `claude/cercles-ensemble-conversation-close`.
- Lot : la porte `judgeTogether` lit désormais la conversation (ouverte : `isActive`, ni `closedAt`, ni `deletedAt`,
  lue en JS car `closedAt: null` ne retient pas un champ absent sous MongoDB) ; une ligne absente refuse. La clôture
  coupe : `announceConversationClosed`, point de convergence des cinq chemins de clôture, appelle
  `cutTogetherWhere({ conversationId })` (détaché, `.catch` posé). Refus indistinct, fin dite `left` aux deux.
- Gates locaux : témoins rouges prouvés (6 dans `togetherRelay.test.ts`, 1 dans `announceConversationClosed.test.ts`),
  puis 443 suites voisines (together, socketio, conversations, relations, directory, attachments, admin, security,
  balayage des promesses détachées) 6 806/6 806 vertes ; `tsc` passerelle vert.
- Revue adversariale : fusionnable, un défaut moyen corrigé dans le lot — l'archivage admin (`isActive: false` sans
  `closed`) ne passe pas par `announceConversationClosed` ; la route souveraine appelle désormais `cutTogetherWhere`
  après l'écriture (témoin de route). Assumé : `obsoleteConversation` rejuge deux fois (sans effet). Hors lot, en
  suivi : la désactivation d'une communauté ne touche pas ses conversations (#17971).
- CI : `dev` était rouge sur six suites d'appel depuis #17952 (doubles partiels de `socket-rate-limiter` sans
  `callSignalBudgetId`, 22 témoins `SIGNAL_FAILED`) ; corrigé dans ce lot en prolongeant `jest.requireActual`.
- Prochain lot recommandé : « ensemble » sur Android (#17100), sinon la préférence de réception d'« ensemble » (#17023),
  puis la position temporaire iOS (#16983) et l'icône par cercle (#17013) quand #17956 aura fusionné.

## 2026-11-13 — réveil 28 : « ensemble » sur Android, couche cœur (#17100)

- Reprise : neuf PR de la routine (#17956, #17967, #17969, #17973, #17976, #17979, #17981, #17984, #17985) étaient
  toutes poussées par d'autres sessions dans les vingt minutes précédentes : ce réveil n'en a doublé aucune. Aucune
  branche vivante n'écrivait « ensemble » côté Android : lot #17100 réservé sur `claude/cercles-17100-android`.
- Lot : la couche `:core:model` (Kotlin pur) de « ensemble » — lecture stricte des quatre événements et des accusés
  `invite`/`join` (`Together.kt`), loi de synchronisation portée à l'identique du web et d'iOS (`TogetherSync.kt`), état
  de séance en valeur (`TogetherState.kt`). Les 20 témoins reprennent un à un les cas web et iOS.
- Gate local : `./meeshy.sh jvm-check -PjvmCheckModelOnly --tests '*TogetherTest*'` 20/20 vert (module entier compilé).
  La preuve Android complète est `android.yml` sur la PR.
- Reste pour fermer #17100 : émetteur socket et flux d'événements (`sdk-core`), lecteur Media3 piloté par la loi,
  bandeau d'invitation, ligne de la fiche d'un Proche, libellés `together.*`.

## 2026-11-13 — réveil de 14:52 : débloquer `dev`, rouge sur les témoins de `call:signal`

- Reprise : seize PR de la routine ouvertes, toutes écrites dans l'heure par des réveils vivants ; aucune n'est prise
  ici (« celui qui n'a rien écrit cède »). #17967 (#17147) attend sa CI, rouge en tranche gateway 3/3.
- Cause de ce rouge, hors cercles : depuis #17952, `call:signal` appelle `callSignalBudgetId`, que six suites simulant
  `utils/socket-rate-limiter` ne fournissaient pas — 18 témoins rouges sur `dev` même, donc sur toute PR passerelle
  qui la fusionne.
- Lot : PR #18012 vers `dev` — la fonction réelle passe dans les modules simulés par `jest.requireActual`. Gates :
  `src/__tests__/unit/socketio` + `src/socketio` 3 380/3 380 (18 rouges avant), `tsc` passerelle vert.
- Prochain lot recommandé : fusionner `origin/dev` dans les PR passerelle de la routine restées rouges (#17967,
  #17984) une fois #18012 sur `dev`, puis « ensemble » sur Android (#17100, couche cœur fusionnée par #17998).
## 2026-11-13 — réveil : un Bring refusé ne dit plus le blocage (#14677, volet refus)

- Reprise : 14 PR « cercles » ouvertes, toutes tenues par des branches vivantes (mises à jour dans l'heure) ; ce réveil
  n'en touche aucune. Lot libre pris : #14677, branche `claude/cercles-14677-bring-neutre`.
- Lot : le blocage par personne et la coupure globale se servent désormais en `403 BRING_NOT_ALLOWED`, la réponse
  exacte d'un niveau insuffisant (même statut, même corps, même disponibilité). Le nom `BRING_UNAVAILABLE` proposé par
  l'issue n'a pas été pris : il désigne déjà le compteur injoignable (503, « réessayer » chez les clients).
  `BRING_BLOCKED` reste dans le contrat, plus servi ; les clients web, iOS et Android le lisaient déjà comme « parti ».
  Décision du 2026-11-02 (point 2) et spec § Bring amendées.
- Reste de #14677 : retirer `resetsAt` de la disponibilité servie à l'expéditeur. Non fait : #18000 (#14473) corrige au
  même moment l'heure « de nouveau à » que le client affiche depuis `resetsAt` — les deux issues se contredisent, à
  trancher par le porteur.
- Prochain lot recommandé : une issue libre du jalon 2 (#14685/#14686, retrait d'un partage du Sang), ou finir les PR
  ouvertes dont la branche s'est arrêtée.
## 2026-11-13 — réveil 29 : le passage en E2EE coupe le talkie à l'instant (#14490)

- Reprise : dix-neuf PR de la routine ouvertes, toutes poussées par d'autres réveils dans l'heure ; aucune n'a été
  doublée. Aucune branche n'écrivait le talkie côté passerelle hors `talkieRelay.ts` (#18010, traces seulement) : lot
  #14490 réservé sur `claude/cercles-14490-talkie-e2ee`, témoins rouges poussés avant toute logique.
- Lot : `cutTalkiesOnEndToEnd` (`talkieCut.ts`) pose la coupure partagée d'un blocage dans les deux sens de la paire,
  appelée par `POST /conversations/:id/encryption` juste après l'écriture du régime `e2ee` ; `REJUDGE_TIMEOUT_MS`
  (`talkieRelay.ts`) coupe une prise de parole dont le rejugement ne rend pas en 2 s. Une coupure qui ne s'écrit pas
  ne défait pas la bascule : le rejugement borné prend le relais.
- Gates locaux : 69 suites voisines (talkie, conversation-encryption, handlers socket, gardes de minuterie et de
  promesse détachée) 1 318/1 318 vertes ; ROUGE prouvé en retirant la production (9 témoins tombent) ; `tsc`
  passerelle vert ; cliquet `any` 489 inchangé.
- Revue adversariale : fusionnable après correctifs. Corrigés dans le lot : un tête-à-tête qui NAÎT `e2ee`
  (`POST /conversations`, `core-lifecycle.ts`) coupe aussi (M1) ; les deux sens sont coupés localement avant toute
  écriture partagée, chacune tentée (m2) ; la coupure par délai se journalise (m3) ; un témoin qui ne pouvait pas
  tomber est réécrit (m7). Ouverts en suivi : #18033 (une coupure non écrite dans Redis le dit), #18034 (délai
  du rejugement mesuré sous charge), #18035 (restaurer « pour moi » un tête-à-tête chiffré), #18036 (une seule
  définition de « paire chiffrée »).
- Gates après correctifs : 165 suites voisines (talkie, conversations, encryption, handlers, gardes) 2 363/2 363
  vertes ; ROUGE du témoin de création prouvé ; `tsc` vert ; cliquet `any` inchangé.
- Prochain lot recommandé : #18035 ou #18036 (petits, serveur, talkie), sinon mener à la fusion les PR ouvertes.
## 2026-11-13 — réveil repris (15:15) : un contenu de Sang n'offre plus « Republier » sur le web (#14501)

- Reprise : run du 2026-11-12 coupé par une erreur d'API sans trace. Seize PR de la routine sont ouvertes ; toutes
  écrites dans l'heure par des sessions vivantes. #17956 (carte web des positions) semblait abandonnée depuis 14:05 :
  sa fusion de `dev` était faite ici quand une autre session y a poussé à 15:16 — ce réveil a cédé sans rien pousser.
- Lot : #14501, aucune branche ne l'écrivant. `isRepostable` (vue « offre-t-on le geste ? » de
  `allowedRepostVisibilities`, `packages/shared/utils/repost-audience.ts`), `FeedCardModel.repostClosed`, carte du fil
  et rail des réels sans hôte « Republier » sur un contenu `BLOOD`. Le rail des stories web n'a aucun gestionnaire de
  republication : rien à fermer. Gater sa loi (`showsRepost`) faisait passer `story_reader` à 16,02 Ko pour 16 Ko de
  plafond, sans effet visible : laissé, à reprendre le jour où le rail reçoit le geste.
- Gates : shared `repost-audience` 14/14 ; web, témoins voisins 1 336/1 336, `tsc --noEmit` vert, `measure-weight`
  vert (feed 15,51 Ko, story_reader 15,97 Ko) ; suite web complète 31 645/31 648, les trois échecs hors lot (deux
  témoins de présence verts isolément, `act-leak-guard` rouge aussi sur `dev`).
- Prochain lot recommandé : la jumelle iOS (#14417, ouverte), après avoir mené les PR ouvertes de la routine.
## 2026-11-13 — réveil 29 : « ensemble » sur Android, couche transport (#17100)

- Reprise (run coupé le 2026-11-11 par une erreur d'API, relancé à 15:02) : 25 PR ouvertes vers `dev`, toutes poussées
  dans l'heure par des réveils vivants ; ce réveil n'en double aucune. Aucune branche n'écrivait le transport
  Android d'« ensemble » : lot réservé sur `claude/cercles-17100-android-socket`.
- Lot : `TogetherWire` (`:core:model`, Kotlin pur) — les quatre charges sortantes au schéma STRICT du serveur (position
  bornée à [0, 24 h] et arrondie, comme iOS), l'accusé de `sync`, et la lecture typée des quatre événements entrants ;
  `TogetherSocket` (`sdk-core`) — les quatre routes sur la voie série commune, UN flux `events` dans l'ordre du fil, et
  l'émetteur à accusé (8 s, comme le web et iOS), « hors ligne » sans rien émettre quand la socket est tombée.
- Gate local : `jvm-check -PjvmCheckModelOnly` sur `TogetherWireTest` + `TogetherTest`. Le `sdk-core` (Robolectric)
  se prouve par `android.yml` sur la PR.
- Reste pour fermer #17100 : lecteur Media3 piloté par la loi, bandeau d'invitation, ligne de la fiche d'un Proche,
  libellés `together.*`.
## 2026-11-13 — réveil suivant : la copie vocale du talkie sur le web (#16698)

- Reprise : toutes les PR ouvertes de la routine sont tenues par des réveils vivants, et #17100 (Android) a un brouillon
  (#17998) : ce réveil les cède. #16698 n'avait aucune branche : c'est le lot.
- Fait : un talkie refusé en voix (repli ou blocage, indiscernables) garde le micro ouvert, l'en-tête dit « Enregistré »
  et la fiche « Le talkie ne passe pas : votre voix part en message vocal » ; au relâcher (ou à 30 s), la voix part en
  message vocal. Une voix réveillée que personne n'a rejointe (`joined: false`) part aussi en copie ; un verdict arrivé
  pendant que le micro s'arrête attend la voix. Destination iso iOS et #17141 : la conversation nommée par la passerelle,
  sinon la partagée la plus récente qui peut la porter, sinon le direct EN CLAIR — jamais une conversation chiffrée.
- Sites : `apps/web/src/lib/talkie/talkie-sender.ts` (mode copie, `ended(…, joined)`), `talkie-voice-copy.ts` (choix
  de la destination, fichier `audio/aac`, envoi), `talkie-live.ts` (`joined` décodé), `useTalkieSender`.
- Prochain lot recommandé : « ensemble » sur Android (#17100) si son brouillon s'arrête, sinon l'icône de position par
  cercle (#17013).
## 2026-11-13 — réveil de 14:34 : la purge et l'export des cercles lisent par index (#14529)

- Reprise : run précédent coupé (erreur d'API). Les onze PR « cercles » ouvertes ont toutes été écrites dans l'heure par
  des réveils vivants : ce réveil n'en prend aucune (« celui qui n'a rien écrit cède »). #14677 (Bring neutre) cédé
  aussi : #18000 écrit `bringDay.ts` / `resetsAt`. #14678 (copie de talkie à 30 jours) laissé : la copie est créée par
  les trois clients, et la poser en éphémère change sa bannière — à instruire comme un lot client, pas en un réveil.
- Lot : #14529, serveur seul. `@@index([otherId])` sur `RelationFeatureSetting`, `@@index([userHighId, day])` sur
  `PairInteractionDay` (le préfixe sert la purge, `day` la fenêtre de `loadProgressByPartner`) ; la branche basse est
  déjà servie par l'unique. Migration `2026-11-13-circle-pair-reverse-indexes.mongodb.js`, additive et idempotente,
  témoin qui exécute le fichier et confronte `schema.prisma`.
- Reste : jouer la migration sur staging et relever l'`explain()` avant/après (critère de preuve de l'issue) ; la
  production attend le feu vert du porteur.
- Prochain lot recommandé : mener les PR ouvertes ; puis « ensemble » sur Android (#17100, PR #17998 en cours).

## 2026-11-13 — réveil repris : le prochain minuit du Bring quand le minuit local n'existe pas (#14473)

- Reprise : onze PR de la routine ouvertes et toutes poussées dans l'heure par des réveils vivants ; ce réveil n'en prend
  aucune. Aucune branche n'écrit `services/bring/` : lot #14473 (petit, serveur seul, prouvable en conteneur) réservé
  sur `claude/cercles-14473-minuit`, témoin rouge poussé avant le correctif.
- Lot : `bringDayOf` lisait minuit avec le décalage d'APRÈS le changement d'heure ; un jour où l'heure saute à minuit
  (Santiago le 2026-09-06, La Havane), `resetsAt` tombait une heure trop tôt, encore dans la veille. Il garde désormais
  le plus tôt des deux minuits candidats qui tombe dans le jour visé. La clé du quota était déjà juste.
- Gates locaux : `bringDay.test.ts` 12/12 (dont un balayage des 365 jours de 2026 sur sept fuseaux, rouge sur
  Santiago et La Havane sans le correctif) ; routes et services du Bring 101/101 ; `tsc` passerelle vert.
- Reste du Bring côté décisions : #14450 (fuseau servi) inchangée.
- Prochain lot recommandé : mener à la fusion les PR ouvertes ; ensuite un autre petit lot serveur sans branche vivante
  (#14468, #14469 ou #14470, contre-audit du Bring).

## 2026-11-13 — réveil repris (15:27) : mener #18000 (minuit du Bring) à la fusion (#14473)

- Reprise : dix-neuf PR de la routine ouvertes ; toutes sauf #18000 et #17979 poussées dans l'heure par des réveils
  vivants. #18000 était en conflit (journal seul) et sans écriture depuis 14:21 : ce réveil la mène à la fusion.
- `origin/dev` fusionnée à la main, conflit du journal résolu en gardant les deux entrées.

## 2026-11-13 — réveil repris (17:15) : #18000 rouge sur le poids web hérité de `dev`

- La CI dispatchée sur `7c2ea8c85` rend « Qualité TS » rouge : `call_overlay` 21.01 Ko > plafond 21 Ko, chunk web
  que ce lot ne touche pas (diff passerelle seule). `origin/dev` refusionnée à la main (journal : les trois entrées
  gardées) pour reprendre le correctif de `dev`, puis CI redispatchée.
## 2026-11-13 — réveil 26 : couper les invitations « ensemble » d'une personne ou de tous, et borner leurs rafales (#17023)

- Reprise : #17148 fusionnée le 2026-11-09. Lots vivants d'autres réveils, non touchés : #16984 (carte web, PR #17956),
  #17147 (conversation close) et #17013 (cercle de la position), réservés à 13:34 et 13:36. Lot #17023 réservé sur
  `claude/cercles-17023-ensemble-reception` avant toute écriture.
- Lot : l'invité coupe les invitations « ensemble » d'une personne (`togetherBlocked` sur
  `GET|PUT /relations/:userId/settings`, colonne `RelationFeatureSetting.togetherBlockedAt`, optionnelle et sans
  migration) ou de tous (`notification.togetherEnabled`, actif par défaut, gardé quand un remplacement ne le nomme pas).
  Une paire n'invite pas plus de 5 fois par 10 minutes (`TOGETHER_INVITES_PER_PAIR`, compteur sous un nom HMAC qui ne
  dit ni l'hôte ni l'invité, pris en DERNIER : seule une invitation qui part consomme la fenêtre). Tout refus est le
  `NOT_ALLOWED` d'un inconnu. La préférence gouverne l'INVITATION, pas la séance : une séance rejointe continue, d'où
  son absence du consentement de la loi d'accès (aucun miroir Swift / Kotlin à changer). Web : l'interrupteur sur la
  fiche d'un Proche, sept langues.
- Suivis ouverts : iOS #17988, Android #17989, réglage global sur le web #17990.
- Prochain lot recommandé : #17988 (iOS, la référence), puis l'icône de position par cercle (#17013) si son réveil ne
  l'a pas fini.
## 2026-11-13 — réveil : « Recevoir des Bring » se règle sur le web (#16588)

- Reprise : deux autres réveils sont actifs — #17956 (carte des positions sur le web, #16984) et la branche
  `claude/cercles-ensemble-conversation-close` (#17147), toutes deux poussées dans le quart d'heure. Ce réveil n'y touche
  pas (« celui qui n'a rien écrit cède ») et prend un lot web court, sans chemin commun.
- Lot : PR #17981 vers `dev`. Le port des réglages lit `notification.bringEnabled` (optionnel : absent = reçu), le rend
  après écriture seulement s'il est servi, l'écrit sous `notification` ; rangée « Recevoir des Bring » + explication
  dans Réglages › Notifications, optimiste avec retour arrière, sept langues (tranche `contact-discovery`).
- Gates locaux : 11 témoins rouges sans l'implémentation, puis verts ; `tsc` web vert ; `bun test` web 31 652 verts,
  1 rouge hors lot (`act-leak-guard`, bun 1.4.4 local) ; `vite build` vert ; poids 96,97 Ko avant le premier pixel.
- Ce qui reste du Bring : interrupteur global sur iOS (#16609) et sur Android (à ouvrir quand #16617 aura fusionné),
  Critical Alerts (#14112, #17475–#17477), #16619, décisions #14409 et #14450.
- Prochain lot recommandé : #16609 (le même interrupteur sur iOS), sinon l'icône de position par cercle (#17013) une fois
  #17956 fusionnée.
## 2026-11-13 — réveil 25 : la carte web des positions partagées menée jusqu'à `dev` (#16984)

- Reprise : aucune PR de la routine ouverte (#17148 fusionnée). Un réveil du 2026-11-10 a été coupé par une erreur
  d'API sans rien laisser. La branche `claude/cercles-16984-web` portait la carte web des positions, écrite et passée
  par deux revues-corrections le 2026-11-08 (commentaires de #16984), mais aucune PR ne l'avait proposée et aucune
  session ne l'écrivait depuis cinq jours : ce réveil la reprend plutôt que d'ouvrir un autre lot.
- Fait : `origin/dev` fusionnée à la main (un conflit dans `scripts/check-ts-catalog-dead-entries.mjs` : les entrées
  ajoutées par `dev` gardées, `relations.locations` retirée puisque la carte l'appelle). Gates : témoins du lot 118/118,
  `tsc --noEmit` web vert, `vite build` et `check-sw-api-cache` verts, catalogue TS 269/269.
- Trouvé en chemin : `dev` tenait à 0,02 Ko du plafond de la première peinture (97,01 Ko en local, 96,98 en CI) ; la
  route neuve le portait à 97,10. Plafond relevé à 98 avec son relevé daté (`budgets.json`), selon la procédure des lots
  précédents — à confirmer par le porteur.
- PR #17956 vers `dev`. CI complète (`ci.yml` en `workflow_dispatch`, run 43432690919) : tout est vert sauf la tranche
  2/3 de la passerelle (et donc la couverture fusionnée et le Verdict), rouge sur `dev` du même témoin
  (`CallEventsHandler.test.ts` 4650 → 4657, apporté par #17952) ; ouvert en #17986. **Non fusionnée par ce réveil** :
  la règle de la routine veut une CI verte ; elle fusionnera dès que `dev` sera reverdi (ou sur décision du porteur).
- Prochain lot recommandé : #16983 (position temporaire sur iOS, émettre + carte), puis #17147 (la porte « ensemble »
  lit la conversation close), puis l'icône de position par cercle (#17013).
## 2026-11-13 — réveil repris (14:20) : l'écoute d'un Proche sur l'avatar de la liste web (#16733)

- Reprise : onze branches de la routine écrites dans les 45 dernières minutes par des réveils vivants (#17100 Android,
  #16984 web, #16983 iOS, #17013, #17023, #16987…) ; ce réveil n'en touche aucune. Le volet WEB de #16733 (la rangée
  d'un direct dans la liste) n'était écrit par personne : branche `claude/cercles-16733-web` réservée avant écriture.
- Lot : `LensRow` lit l'écoute servie du pair (`useListeningBand`, la clé de l'en-tête du fil) et la pose sur l'avatar
  de 44 px, iso `ConversationRowAvatar` (iOS, #17083) ; un groupe n'en porte jamais ; le lien principal de la rangée la
  dit au lecteur d'écran (`listening.spoken`, une fois), le bandeau restant décoratif. Aucun libellé neuf.
- Gates locaux : `lens-row-listening.test.tsx` 5/5 (rouge avant le correctif sur 3 cas) ; rangée, focale, avatar et
  écoute 492/492 ; `tsc --noEmit` vert ; `vite build` et `measure-weight` verts.
- Ce qui reste de #16733 : décision #17085 (écoute sur une conversation verrouillée par PIN), recette appareil.
- En chemin : la tranche 2/3 de la passerelle était rouge sur `dev` (six suites `CallEventsHandler-*` moquaient
  `socket-rate-limiter` sans `callSignalBudgetId`, ajouté par dda1585572) ; corrigé dans ce lot, 2282/2282.
- Prochain lot recommandé : mener à la fusion les PR ouvertes ; « ensemble » sur Android (#17100) est tenu par le
  réveil 28.

## 2026-11-13 — réveil 26 : la position partagée dit de quel cercle vient la personne (#17966 ⊂ #17013)

- Reprise : #17956 (carte web des positions, #16984) est menée par un réveil actif (commits de 13:13 à 13:19) ;
  #17147 (« ensemble » dans une conversation close) a été réservée à 13:34 par un autre réveil
  (`claude/cercles-ensemble-conversation-close`). Ce réveil n'avait rien écrit : il cède les deux.
- Lot choisi : la tranche SERVEUR de l'icône de position par cercle (#17013), petite, prouvable en conteneur, et
  préalable aux trois marqueurs. Issue #17966 ouverte sous #17013 (milestone #215).
- Livré dans la PR : `location:share-changed` et `GET /relations/locations` portent `circle` (`FRIEND` · `CLOSE` ·
  `BLOOD`), le niveau effectif du verdict qui ouvre `location.temporary` pour CE lecteur ; l'accès d'un lecteur est
  `{précision, cercle}`, donc une montée ou une baisse de cercle à précision égale ressert la position ; le schéma
  du rattrapage déclare le champ (enum) et retire toujours tout voisin. Champ additif : un ancien client l'ignore.
- Décision écrite dans la PR : entre deux comptes de l'équipe, la loi rend le niveau Sang (#16623) ; le marqueur
  le montre donc en Sang, comme les autres outils de cercle.
- Ce qui reste de #17013 : les marqueurs web (après la fusion de #17956), iOS (#16983) et Android (#16985).
- Prochain lot recommandé : la position temporaire sur iOS (#16983), qui dessinera directement le marqueur du cercle ;
  sinon « ensemble » sur Android (#17100).
- Le 2026-11-13 à 17:17, la passe de fusion a signalé un conflit de fond avec #17976 (maille retenue par
  destinataire, heure arrondie, rayons 1200/12000) : `dev` fusionnée à la main dans la branche, le cercle reposé
  sur la forme de `dev` (projection, `snapshotAllowed` rend désormais le cercle par émetteur), les témoins du cercle
  déplacés dans `sharedLocationRelay.cercle.test.ts` pour tenir le budget de taille.

## 2026-11-13 — réveil 29 : la position du Sang, socle serveur, menée vers `dev` (#13937)

- Reprise : run interrompu le 2026-11-10 par une erreur d'API, repris à 15:09. Quinze PR de la routine étaient vivantes
  (poussées dans l'heure et demie) : ce réveil n'en a doublé aucune. La branche `claude/cercles-13937-serveur`
  (historique scellé, fantôme, journal, proximité, derrière un drapeau éteint) était écrite et auditée depuis le
  2026-11-09, sans PR et sans session pour la suivre : reprise.
- Fait : `origin/dev` fusionnée à la main (trois conflits : purge du compte, manifeste des routes régénéré à 809,
  plafond Android « à porter » 125 → 130 en gardant les deux histoires) ; catalogues TS, Swift et Kotlin régénérés ; les
  cinq routes déclarées « en attente de leur client » dans les deux cliquets de catalogue mort. PR #18019 (brouillon).
- Contre-audit adversarial : non bloquant. Corrigé dans le lot en TDD : un point téléporté servait d'ancre au point voisin
  (le verrou de vitesse se contournait), un effacement rendait vraisemblable n'importe quel point (un point sans ancre
  n'est plus jamais évalué), le fantôme se devinait au temps de réponse. Les témoins négatifs de proximité reçoivent une
  ancre : sans elle, la nouvelle règle les aurait rendus verts sans rien prouver.
- Ouverts : #18023 et #18024 (décisions du porteur : points antérieurs à l'accord, capacité de sondage résiduelle de la
  proximité), #18025 (relire son fantôme et ses rayons, plafond atomique du journal, porte du drapeau, prérequis staging).
- Gates locaux : `tsc` passerelle vert ; position du Sang, routes `me`, purge 1 745/1 745 ; ciblé plus large 151 suites,
  2 043 témoins ; `packages/shared` `api/__tests__` 109/109 et `__tests__/ci` 149/149 ; cliquets de catalogue mort conformes.
- Prochain lot recommandé : les clients de la position du Sang après les décisions #18023/#18024, sinon les PR ouvertes
  de la routine à mener à la fusion.

## 2026-11-13 — réveil de 14:40 : une prise de parole talkie se localise dans le journal (#17252, volet serveur)

- Reprise : run coupé le 2026-11-10 par une erreur d'API, relancé à 14:40. Les PR de la routine ouvertes (#17956,
  #17969, #17976, #17979, #17981, #17984, #17994, #17998…) sont toutes écrites dans l'heure par des réveils vivants ;
  ce réveil n'en prend aucune. #17249 (APNs absent) est déjà livrée côté code (`b90b576e1`) et n'attend que la clé
  sandbox du porteur. Aucune branche n'écrivait le talkie : lot #17252 réservé sur `claude/cercles-17252-journal`.
- Lot : `TalkieRelay` journalise `[TALKIE_STARTED]` (mode, codec, scellée ou non), `[TALKIE_RELAYED]` une fois, au
  premier fragment dont l'émission n'a pas levé (rang, délai depuis l'ouverture) et `[TALKIE_ENDED]` (raison, fragments
  reçus et relayés, octets, durée, rejointe ou non). Identifiants et compteurs seulement, aucun octet de voix ; un
  témoin le vérifie. Aucun changement de contrat ni de client.
- Ouvert en suivi : #18009, l'accusé « entendu » du destinataire et l'état « non reçu » chez l'émetteur (trois clients,
  capacité annoncée pour ne jamais accuser un ancien client).
- Gates locaux : 8 suites talkie 198/198 vertes (dont 11 témoins neufs, 8 rouges avant le correctif), 4 suites
  voisines 38/38, `tsc` passerelle vert.
- Prochain lot recommandé : #18009 côté passerelle (capacité + délai), ou mener à la fusion les PR ouvertes.

## 2026-11-13 — réveil de 17:15 : mener #18010 (journal du talkie) à la fusion (#17252)

- Reprise : `dev` venait de recevoir d'un coup quinze PR de la routine (17:09–17:14 UTC) ; les dix PR encore ouvertes
  étaient toutes en conflit sur ce journal. #18010 était la plus ancienne sans écriture (14:47) : ce réveil la mène, les
  autres restent à leurs réveils.
- `origin/dev` fusionnée à la main : conflit du journal seul, les entrées des deux côtés gardées ; `talkieRelay.ts`
  fusionné sans conflit avec la coupure E2EE du talkie (#14490). Gates relancés : suites talkie 185/185, routes talkie
  et `socketio` 942/942, `tsc` passerelle vert.
- Gates sur la branche refusionnée (17:35) : talkie + routes talkie + `socketio` 1127/1127, `tsc` passerelle vert.
- CI : les deux `ci.yml` dispatchés sur la branche ont été annulés — le porteur a gelé la CI des branches de lot le
  2026-11-13 (#18048, `CI_DEV_SEUL` : seuls `dev`, `main` et `ci/promotion-*` tournent) avec la consigne de fusionner
  les PR ouvertes et de corriger `dev` en continu. La preuve de ce lot est donc locale (gates ci-dessus, sur la
  branche refusionnée) et la CI de `dev` qui suit la fusion ; `origin/dev` refusionnée une seconde fois à la main.

## 2026-11-13 — réveil repris (14:21) : accorder « Ce que j'écoute » depuis Android (#16836 ⊂ #13934)

- Reprise : onze PR de la routine ouvertes, toutes tenues par des réveils vivants (CI en cours) ; aucune n'est
  touchée. #16836 attendait la fusion de #16643 (faite, #17056) ; aucune branche n'écrivait la fiche d'un lien Android.
  Branche `claude/cercles-16836-android` réservée vide avant toute écriture.
- Lot : `:core:model` — `RelationPersonSettings.listeningCategoryShared` (absent ⇒ non accordé), `RelationShareGrant`,
  `RelationPersonSwitch` (Réception = blocage, Partage = accord ; iso `CirclePersonSwitch` iOS),
  `CirclePersonSetting.personSwitch`, `ListeningCategoryShareBody`. Réseau : `setListeningCategoryShared`. Dépôt :
  `BringGateway.setShareGranted`. Fiche d'un lien : `CircleReceptionBlockViewModel` porte un interrupteur
  (`isOn` / `setOn`), « Ce que j'écoute » actif dès Proche, décoché par défaut, optimiste avec retour arrière dit.
- Écart à l'issue : le texte d'explication sous l'interrupteur n'est PAS posé — le cliquet du texte natif (#17587)
  refuse un libellé d'explication de plus dans `feature/contacts` (15 > 14). Le libellé du titre suffit à iso du geste ;
  l'explication suivra derrière un (i) si le porteur la veut.
- Gates locaux : `jvm-check` (modèle) `RelationPersonSwitchTest` 5/5 et `ProfileCircleTest` 4/4 verts ;
  `check-verbosity-native` sans échec ; budget de taille et frontières des modules verts. Compose, Hilt et les témoins
  de `:feature:contacts` / `:sdk-core` se prouvent par `android.yml` sur la PR.
- Prochain lot recommandé : mener à la fusion les PR ouvertes ; ensuite l'émission de l'écoute sur Android, ou la
  position temporaire sur Android (#16985), aucune branche ne l'écrivant au 2026-11-13 14:40.

## 2026-11-13 — réveil : couper tous les Bring depuis les réglages de notification iOS (#16609)

- Reprise : le réveil du 2026-11-10 a été interrompu sans rien laisser (aucune branche, aucune PR). Quatre autres réveils
  tournent en même temps et ont déjà réservé #16984 (carte web, PR #17956), #17147, #17013 et #16983 ; la branche
  `claude/cercles-16588-web` est posée sur `dev` sans écriture. Lot libre et petit retenu : #16609.
- Lot : PR #17973 vers `dev` (brouillon tant que la CI Swift n'a pas parlé). SDK : `bringEnabled: Bool?` stocké tel que
  servi ou choisi, jamais encodé tant qu'il est `nil` (la passerelle le garde, `keptWhenUnnamed`), `receivesBrings` lu par
  l'écran. Un `Bool` à défaut vrai aurait rallumé, à la première synchronisation d'un cache d'avant le champ, un refus posé
  sur le web. App : « Recevoir des Bring » sous « Appels entrants », avec son explication, sept langues.
- Gates locaux : localisation, cohésion, pbxproj (cohérence, guillemets), inscription des tests, littéraux de loi,
  ViewBuilder verts ; `check_house_rules.sh` rouge à l'identique sur `dev` (appels, hors lot). Swift : `sdk-tests.yml`
  et `ios.yml` dispatchés sur la branche.
- Reste du Bring : l'interrupteur global sur le web (#16588, réservé) et sur Android (issue à ouvrir), Critical Alerts
  (#14112), décisions #14409 et #14450.
- Prochain lot recommandé : « ensemble » sur Android (#17100) ou la position temporaire sur Android (#16985), les lots
  web et iOS de la position étant tenus par d'autres réveils.
- Gel de la CI des branches de lot (#18048, `CI_DEV_SEUL`) : les runs Swift dispatchés sur la branche ont été annulés
  sans runner. `origin/dev` refusionnée à la main (journal seul), la preuve Swift du lot est la CI de `dev` qui suit la
  fusion, comme le demande la consigne du porteur.

## 2026-11-13 — réveil 27 : deux collègues de l'équipe consentent entre eux sans lien, et le consentement tombe avec le rôle (#16642, #16814)

- Reprise : sept réveils parallèles écrivent `together/`, `sharedLocation/`, la carte web et iOS, les réglages Bring.
  Aucun n'écrit `routes/relations/settings.ts` ni `relationConsent.ts` : lot réservé sur
  `claude/cercles-16642-consentement-equipe`. Le travail de #16642, écrit et revu le 2026-11-08 sur
  `claude/cercles-16642-serveur` sans jamais être proposé, est repris par cherry-pick sur `dev` (trois commits),
  et #16814 (sa suite de sécurité) s'y ajoute.
- Lot : PR #17984 vers `dev`. #16642 repris et mis à jour pour la décision du 2026-11-10 (ANALYST et AUDIT
  consentent comme l'équipe). #16814 : `updateRole`, `updateStatus` (désactivation, bannissement) et `deleteUser`
  appellent `revokeTeamSharesOf`, qui éteint dans les deux sens ce que le lien réel n'ouvre pas (rituel hors Sang,
  catégorie d'écoute sous Proche), daté chez chaque émetteur, puis efface l'écoute chez le lecteur qui la voyait.
- Revue adversariale : un constat à corriger (l'écoute restait affichée 15 min chez l'ex-collègue), corrigé dans le
  lot avec son témoin rouge ; le reste en suivi #17991 (chemins d'auto-suppression, provenance, dates, concurrence).
- Gates locaux : 155 suites voisines, 2 857/2 857 vertes ; `tsc` passerelle vert ; contrats shared verts. La CI de PR
  étant gelée, `ci.yml` est dispatché sur la tête de branche.
- Prochain lot recommandé : #17991, ou un client pour accorder l'écoute et la position entre collègues (#16864).

## 2026-11-13 — réveil 28 bis : la branche orpheline des partages du rituel menée à sa PR (#14924)

- Reprise : 25 PR cercles ouvertes, toutes écrites dans l'heure par des réveils vivants ; ce réveil n'en prend aucune.
  `claude/cercles-17100-android` (« ensemble » sur Android) écrite à 14:13 : cédée. Trouvée en revanche une branche
  ORPHELINE, `claude/cercles-14924-serveur`, écrite jusqu'au 2026-11-08 et jamais proposée en PR : ce réveil la reprend.
- Lot : PR #18013 vers `dev`. `origin/dev` fusionnée à la main (conflit dans `user-management.service.ts` : coupure
  « ensemble » et oubli des cercles d'équipe gardés à côté du retrait des partages).
- Revue adversariale : non bloquante. Corrigés dans le lot, témoins vus rouges : la rupture d'une demande acceptée ne
  rend plus 500 quand le retrait des partages tombe en panne (constat 1) ; l'annulation d'une suppression, par lien de
  courriel ou par nouvelle demande, éteint les partages avant de rendre le compte (constat 3). Suites : #18015
  (décision : le blocage éteint-il aussi la catégorie d'écoute ?), #18016 (levée de bannissement en panne, témoin de
  course moins dépendant de l'implémentation).
- Gates locaux : 2 368 témoins (me, suppression, annuaire, relations, admin) verts, `tsc` passerelle vert.
- Prochain lot recommandé : mener à la fusion les PR de la routine ouvertes ; ensuite #18015 si le porteur tranche A.

## 2026-11-13 — réveil 25 : recevoir sur iOS les positions qu'on me partage, couche SDK (#16983)

- Reprise : #17956 (carte web, #16984), #17147 (séance « ensemble » et conversation close) et #17013 (icône par cercle,
  serveur) sont menés en ce moment par d'autres réveils de la routine (branches poussées dans les minutes précédentes) :
  ce réveil leur cède et prend #16983, libre.
- Lot : PR vers `dev`, SDK seulement. `SharedLocation.swift` (lecture Swift de `shared-location.ts`, décodeur borné :
  un champ en trop n'a pas de place, une coordonnée hors du globe ou une précision inconnue sont refusées),
  `location:share-changed|ended` routés et publiés (`SharedLocationEvents`), `RelationsService.sharedLocations(within:)`
  (`GET /relations/locations?bbox=`, l'entrée sort de `PENDING_CLIENT_ENTRIES`), `SharedLocationsLive` (magasin en
  mémoire, iso du web : montée de précision sans recharger, fin et échéance qui effacent, rattrapage qui fait foi dans
  son emprise).
- Gates locaux : catalogue Swift 328/328 conforme, `check_cohesion_budget.sh` et `check_pbxproj_consistency.sh` verts.
  `check_house_rules.sh` est rouge sur `dev` AVANT ce lot (`unchecked-sendable` 112 → 113, fichiers d'appel et
  d'onboarding), identique avec et sans le lot. Swift ne compile pas en conteneur : la preuve est `sdk-tests.yml` et
  `ios.yml` dispatchés sur la PR.
- Reste de #16983 : la carte de réception (épingles, cercle de flou, VoiceOver) câblée sur `SharedLocationsLive`,
  puis l'émission (fiche d'un Ami, durée, précision, arrêt) et les chaînes `InfoPlist.strings`.
- Suite du réveil (17:20–18:10 UTC) : #18004 fusionnée dans `dev` (rouges hérités de `PlayingSoundLoop`), `origin/dev`
  fusionnée à la main dans la branche (seul conflit : ce journal, entrées des deux côtés gardées). Relecture du porteur,
  bloquante et juste : une position ancienne rejouée par un rattrapage survivait à `expiresAt` (échéance posée à
  `now + (expiresAt − updatedAt)`). Correctif `deadline = min(now + durée servie, expiresAt)`, deux témoins (position
  rejouée bornée à son terme, position rejouée déjà échue jamais affichée). CI de branche coupée par `CI_DEV_SEUL`
  (#18048, directive du porteur : fusionner les PR ouvertes, seul `dev` tourne) : la preuve Swift est la CI de `dev`.
  Nouveau rouge hérité de `dev` signalé : #18050 (`try-sleep` 6 → 8, `sleep-nanoseconds` 0 → 2).

## 2026-11-13 — réveil du soir : recevoir sur Android les positions qu'on me partage, couche SDK (#16985)

- Reprise : aucune PR cercles ouverte, toutes les branches `claude/cercles-*` des dernières heures fusionnées dans
  `dev`. Aucune branche n'écrit les chemins Android de la position : lot réservé sur `claude/cercles-16985-android`.
- Lot : la couche SDK de RÉCEPTION, iso `SharedLocation.swift` / `SharedLocationsLive.swift` (#16983) et
  `shared-locations-live.ts` (#16984). `:core:model` : `SharedLocation.kt` (décodeur borné champ par champ, un élément
  fautif d'un rattrapage écarté sans faire tomber la liste, cercle ADDITIF lu optionnel, emprise `bbox` sans notation
  scientifique) et `SharedLocationsState.kt` (réduction pure). `location:share-changed|ended` routés par
  `RelationSocketEventsManager` ; `RelationsApi.sharedLocations` ; `SharedLocationsRepository` (rattrapage à chaque
  socket accrochée, minuteur d'échéance, vidé à la déconnexion, réponse partie sous un autre compte écartée).
- `GET /relations/locations` n'était pas « à porter » : le motif `relations/{userId}` le couvrait déjà au cliquet de
  classement. `TO_PORT_CEILING` ne bouge donc pas.
- Gates locaux : `jvm-check` (`-PjvmCheckModelOnly`, la dépendance libsignal est refusée par le proxy) 24/24 verts sur
  `SharedLocationTest` et `SharedLocationsStateTest`, et le témoin de l'échéance vu rouge quand on retire la borne
  `expiresAt`. `sdk-core` (socket, dépôt) se prouve par `android.yml`.
- Reste de #16985 : la carte de réception (`TileMapView.kt`, épingles, cercle de flou, TalkBack) câblée sur
  `SharedLocationsGateway`, puis l'émission depuis la fiche d'un Ami (durée, précision, service au premier plan).
- Prochain lot recommandé : la carte de réception Android, ou la carte de réception iOS (reste de #16983).

## 2026-11-13 — réveil de la nuit : la carte iOS des positions qu'on me partage (#16983)

- Reprise : aucune PR cercles ouverte ; aucune branche n'écrit `Features/Contacts` côté position. Lot réservé sur
  `claude/cercles-16983-ios-carte`.
- Lot : la carte de RÉCEPTION iOS, câblée sur `SharedLocationsLive` (SDK, réveil 25), dans « Mes cercles » comme
  l'onglet Cercles du web (#16984). `SharedLocationsMapViewModel` projette le magasin en épingles (position et rayon
  SERVIS, jamais plus fins ; nom par `CirclePeopleDirectory`, « Quelqu'un » sinon ; présence servie, aucun anneau hors
  ligne) ; rattrapage du monde à l'ouverture, puis de l'emprise visible après 300 ms de calme.
  `SharedLocationsMapSection` : `MKMapView` natif comme `PostsMapRepresentable` (dont il reprend le choix, pas la
  carte : celle-ci sert les publications et reste réservée au staff), épingle aux initiales teintée par la présence,
  cercle de flou au rayon servi, libellé VoiceOver « nom, précision · jusqu'à HH:MM ». Un magasin par compte connecté
  (`SharedLocationsLiveHolder`) : une position servie à un compte ne s'affiche jamais chez un autre. Huit chaînes en
  sept langues.
- Gates locaux : `check_localization.py` vert, `check_house_rules.sh` vert (36 règles), `check_cohesion_budget.sh`
  rouge À L'IDENTIQUE avec et sans le lot (`iPadRootView.navigateFromNotification` 93 → 96, hérité de `dev`).
  `check_test_registration.sh` attend le pbxproj régénéré par `[xcodegen]`. Swift ne compile pas en conteneur : la
  preuve est la CI de `dev` après fusion (`CI_DEV_SEUL`, #18048).
- Reste de #16983 : l'émission (fiche d'un Ami : durée, précision, arrêt ; `location:share-start|update|stop`) et les
  chaînes `InfoPlist.strings` de la permission de position.
- Prochain lot recommandé : la carte de réception Android (reste de #16985), puis l'émission iOS.

## 2026-11-13 — réveil de minuit : la carte Android des positions qu'on me partage (#16985)

- Reprise : aucune PR cercles ouverte ; #18068 (carte iOS) et #18060 (couche SDK Android) fusionnées. Aucune branche
  n'écrit `feature/contacts/**/circles` côté position : lot réservé sur `claude/cercles-16985-android-carte`.
- Lot : la carte de RÉCEPTION Android dans « Mes cercles », iso `SharedLocationsMapSection.swift` (#16983) et de l'onglet
  Cercles du web (#16984). `:core:model` : `SharedLocationsMap` (projection PURE en épingles — position, rayon et précision
  SERVIS, jamais plus fins ; nom par l'annuaire des cercles, sans nom ⇒ « Quelqu'un » ; emprise visible au format `bbox`,
  `null` quand elle franchit l'antiméridien ; cadrage initial qui montre toutes les épingles ; rayon du cercle de flou en
  mètres au sol). `feature/contacts` : `SharedLocationsMapViewModel` (projette `SharedLocationsGateway`, rattrapage du monde
  à l'apparition puis de la dernière emprise après 300 ms de calme) et `SharedLocationsMapSection` posée sous la bannière,
  sur `TileMapView` (la carte à tuiles du dépôt : aucune seconde carte), épingle aux initiales teintée par la présence
  servie (indigo hors ligne), libellé TalkBack « nom, précision · jusqu'à HH:MM ». Huit chaînes adoptées du catalogue iOS.
- Reste de #16985 : l'émission depuis la fiche d'un Ami (durée, précision, service au premier plan de type position).
- Prochain lot recommandé : l'émission iOS (reste de #16983, `location:share-start|update|stop` depuis la fiche d'un Ami).

## 2026-11-14 — réveil du matin : partager ma position depuis la fiche d'un Ami, sur iOS (#16983)

- Reprise : aucune PR cercles ouverte ; #18094 (carte Android) fusionnée. Aucune branche n'écrit l'émission iOS : lot
  réservé sur `claude/cercles-16983-ios-emission`.
- Lot : l'ÉMISSION iOS, dernier morceau de #16983. SDK : `SharedLocationSending.swift` (la charge de
  `location:share-start|update|stop` bornée comme `sharedLocationStartPayloadSchema` — relevé hors du globe refusé,
  précision plafonnée, doublons fondus, plafond de 50 —, la lecture de l'accusé et la cadence `SharedLocationUpdateGate`,
  5 s au plus et 50 m ou un battement de 2 min, dix fois sous le débit servi) et `SharedLocationSocketEmitter`, type à
  part. App (`Features/SharedLocation/`) : la ligne « Partager ma position » de la fiche dès Ami
  (`offersSharedLocation`, miroir `RelationFeature.locationTemporary`), sa feuille (1 h · 8 h ; ville par défaut,
  quartier, exacte), « X voit ta position (…) jusqu'à HH:MM » et « Arrêter ». `SharedLocationSharingCenter`, un par
  compte : le serveur ne connaît qu'UN partage dont la durée vaut pour tous, donc le centre garde l'échéance de CHAQUE
  personne et la retire du partage serveur à la sienne ; il suit l'appareil au premier plan seulement
  (`SharedLocationFixSource`, « pendant l'utilisation ») et garde la liste (identifiants et échéances, jamais une
  position) d'un lancement à l'autre, pour que « Arrêter » reste à un geste après que l'app a été tuée. Dix-sept
  chaînes en sept langues ; les chaînes de permission (`InfoPlist.xcstrings`) existaient déjà en sept langues.
- Gates locaux : `check_localization.py` vert, `check_house_rules.sh` vert (aucun compteur ne monte),
  `check_cohesion_budget.sh` identique avec et sans le lot, parité des événements socket Swift ↔ contrat
  (`ios-socket-event-enum-parity`, `socket-event-name-gate`) verte. Swift ne compile pas en conteneur : la preuve est
  la CI de `dev` après fusion (`CI_DEV_SEUL`, #18048).
- Reste : la mise à jour en arrière-plan (l'app suspendue se tait, le terme serveur borne tout), l'émission Android
  (#16985), l'émission web, et un indicateur global « tu partages ta position » hors de la fiche.
- Prochain lot recommandé : l'émission Android depuis la fiche d'un Ami (reste de #16985).

## 2026-11-14 — réveil de midi : partager ma position depuis la fiche d'un Ami, sur Android (#16985)

- Reprise : aucune PR cercles ouverte ; #18134 (émission iOS) fusionnée. Aucune branche n'écrit l'émission Android :
  lot réservé sur `claude/cercles-16985-android-emission`.
- Lot : l'ÉMISSION Android, dernier morceau de #16985, iso #16983. `:core:model` : `SharedLocationSending.kt` (charge
  de `location:share-start|update|stop` bornée comme le schéma serveur, lecture de l'accusé, cadence
  `SharedLocationUpdateGate`, `SharedLocationOfferRule` dès Ami) et `SharedLocationRoster.kt` (échéance par personne,
  durée serveur qui couvre la plus lointaine, gardée sans aucune position). `sdk-core` : `SharedLocationSocketEmitter`
  (type à part sur `SocketAckEmitter`) et `SharedLocationSharingCenter`, un par compte, qui RÉUTILISE la source de
  positions et la porte de permission de `LiveLocationDeviceSource` (aucune jumelle). Fiche : la ligne
  « Partager ma position », sa feuille (1 h · 8 h ; ville par défaut, quartier, exacte), « X voit ta position (…)
  jusqu'à HH:MM » et « Arrêter ». Dix-neuf chaînes adoptées du catalogue iOS en sept langues.
- Écart assumé avec l'iOS : la phrase d'explication de la feuille (> 80 caractères, clé `explain`) n'est pas portée,
  le cliquet du texte natif (`check-verbosity-native.mjs`) l'interdit sur `feature/profile`.
- Aucun service de premier plan ni permission d'arrière-plan : le suivi vit tant que l'app est utilisée, comme sur
  iOS ; l'émission en arrière-plan reste #18135 (attend #13942). Constat en passant : `LiveLocationForegroundService`
  (partage en conversation) n'est déclaré dans aucun manifeste et son contrôleur n'est câblé à aucun écran.
- Gates locaux : `jvm-check -PjvmCheckModelOnly` 17/17 verts (`SharedLocationSendingTest` 8, `SharedLocationRosterTest`
  4, `SocketEventNamesParityTest` 5), le témoin de l'accusé vu rouge d'abord ; `xcstrings_to_android.py --check`,
  `check-feature-edges.sh`, `check-file-budget.sh`, `check-verbosity-native.mjs` verts. `sdk-core` et `feature/profile`
  se prouvent par `android.yml` sur `dev` après fusion (`CI_DEV_SEUL`, #18048).
- Audit adversarial avant PR : cinq constats bloquants de RÉVOCATION, tous corrigés et témoignés dans le lot. Un
  seul verrou sérialise démarrages, arrêts, échéances et mises à jour (une mise à jour ne part pas pendant qu'un
  démarrage attend son accusé) ; chaque opération porte un ticket de compte et de session, et une réponse arrivée après
  la déconnexion n'adopte, n'écrit ni ne rallume rien ; sans relevé, retirer une personne ARRÊTE tout ; un accusé perdu
  (`UNCONFIRMED`) garde « Arrêter » pour chaque personne que le serveur peut servir (`SharedLocationRoster.union`) ; une
  échéance non soldée est rejouée toutes les 30 s et à chaque socket accrochée (sans ouvrir de fiche) ; la ligne reste
  sur la fiche tant qu'un partage existe, même sous Ami. L'iOS fusionné porte les mêmes défauts : #18166.
- Reste : l'émission web (#14109), l'arrière-plan (#18135), l'indicateur global « tu partages » (#18136, iOS ;
  Android à suivre), la révocation iOS (#18166).
- Prochain lot recommandé : la révocation iOS (#18166, sécurité), puis l'émission web (#14109).

## 2026-11-14 — réveil de l'après-midi : arrêter un partage de position marche toujours, sur iOS (#18166)

- Reprise : aucune PR cercles ouverte ; #18170 (émission Android) fusionnée. Aucune branche n'écrit le centre iOS :
  lot réservé sur `claude/cercles-18166-ios-revocation`.
- Lot : la RÉVOCATION iOS, iso du centre Android audité. `SharedLocationSharingCenter.swift` : un verrou d'ordre
  d'arrivée (`SharedLocationSerialGate`) sérialise démarrages, arrêts, échéances et mises à jour (une mise à jour
  saute son tour si le verrou est pris) ; une réponse arrivée après `abandon()` n'adopte, n'écrit ni ne rallume rien ;
  sans relevé (liste reprise d'un lancement, permission retirée), retirer une personne ARRÊTE tout ; un accusé perdu
  (`SharedLocationSendOutcome.unconfirmed`, nouveau cas du SDK, `.timedOut` ne vaut plus `.offline`) garde « Arrêter »
  pour l'union des deux listes (`SharedLocationRoster.union`) ; une échéance non soldée est rejouée toutes les 30 s
  (`SharedLocationWakeScheduling`) et à chaque socket accrochée (`socketReady`, depuis `connectionState`) ; la ligne
  de la fiche reste tant qu'un partage court, même sous Ami (`showsRow`). Aucune chaîne neuve : un accusé perdu dit
  le message hors ligne, comme Android.
- Témoins XCTest : un par scénario de l'issue, plus le compte quitté et `union` ; le témoin du SDK suit le nouveau cas.
- Gates locaux : `check_house_rules.sh` vert (36 règles), `check_cohesion_budget.sh` identique avec et sans le lot,
  `check_localization.py` et `check_test_registration.sh` verts. Swift ne compile pas en conteneur : la preuve est
  la CI de `dev` après fusion (`CI_DEV_SEUL`, #18048).
- Audit adversarial avant PR : un BLOQUANT corrigé et témoigné. `abandon()` n'était appelé qu'à l'ouverture d'une fiche :
  après un changement de compte, le centre du compte quitté réconciliait sur la socket du suivant (un `start` au nom de
  l'autre compte) et effaçait sa propre liste sur un `NOT_SHARING`. Le centre connaît désormais son compte (`owner`) et
  ne lit, n'émet ni n'adopte rien tant que le compte connecté n'est pas le sien (`isLive`, iso du ticket Android),
  avant chaque émission et après chaque `await`. Suivis ouverts : « Arrêter » tenté hors ligne jamais rejoué, iOS et
  Android (#18204) ; échéance par destinataire tenue par la passerelle, seule réponse quand l'app dort (#18205).
  Mineurs non traités : « Arrêter » peut attendre le relevé (jusqu'à 30 s) quand aucun n'a été envoyé ; un accusé
  perdu dit « a besoin du réseau » (même phrase qu'Android).
- Prochain lot recommandé : l'émission web (#14109), puis #18204 (iOS + Android), puis la passerelle #18205.

## 2026-11-14 — réveil du matin : partager ma position depuis le web (#18345 ⊂ #14109)

- Reprise : aucune PR cercles ouverte ; #18228 (révocation iOS) fusionnée. Aucune branche n'écrit l'émission web :
  issue #18345 ouverte (milestone #215, sous-issue de #14109), lot réservé sur `claude/cercles-18345-web-emission`.
- Lot : l'ÉMISSION web, iso #16983 et des lois de révocation de #18166. `lib/shared-locations/` :
  `shared-location-sending.ts` (charge bornée comme le schéma serveur, sans Zod ; accusé ; cadence 5 s / 50 m / 120 s),
  `shared-location-roster.ts` (échéance par personne, terme serveur qui couvre la plus lointaine, union),
  `shared-location-sharing.ts` (le centre : verrou unique, compte propriétaire relu après chaque attente, « dans le
  doute on arrête »), `shared-location-sharing-live.ts` (`navigator.geolocation`, la socket vivante, un centre par
  compte, liste en `localStorage` par compte — identifiants et échéances, jamais une position). La fiche d'un Ami porte
  « Partager ma position » (feuille : 1 h · 8 h, ville par défaut, quartier, exacte), puis « X voit votre position (…)
  jusqu'à HH:MM » et « Arrêter », gardés sous Ami tant qu'un partage court. Le chrome différé reprend le partage au
  chargement. 21 libellés en sept langues (adaptés du catalogue iOS, vouvoiement du web).
- Audit adversarial avant PR : un BLOQUANT corrigé et témoigné — deux onglets du même compte, un arrêt fait dans l'un
  était republié par l'autre (liste relue sous le verrou et à l'événement `storage`). Corrigés aussi : la liste gardée
  couvre l'union AVANT l'accusé (onglet fermé pendant l'attente), aucune demande de géolocalisation sans geste
  (reprise et retrait lisent la permission sans la demander), un retrait refusé retombe sur l'arrêt complet, une
  échéance réveillée trop tôt se réarme. Ouvert : « Se déconnecter arrête mon partage » (#18351, `décision-produit`,
  vaut aussi pour iOS et Android).
- Gates locaux : `bun test` du lot 74/74 (témoins des correctifs vus rouges d'abord) ; `tsc --noEmit` vert ; build,
  `check-utilities`, `measure-weight` verts. Suite web complète : 31 958 verts, 5 rouges hors lot (parité des
  catalogues du jeu web/iOS ×2, `act-leak-guard`, et deux témoins de présence `focal-row`/`lens-row` qui passent seuls).
- Prochain lot recommandé : #18204 (« Arrêter » hors ligne rejoué, iOS + Android), puis la passerelle #18205, puis
  #18351 une fois tranchée.

## 2026-11-14 — réveil du soir : un « Arrêter » hors ligne part au retour du réseau, iOS et Android (#18204)

- Reprise : aucune PR cercles ouverte ; #18352 (émission web) fusionnée. Aucune branche n'écrit les centres de partage :
  lot réservé sur `claude/cercles-18204-arreter-hors-ligne`.
- Lot : le RETRAIT EN ATTENTE, iOS et Android ensemble (même loi). La liste (`SharedLocationRoster`, Swift et Kotlin)
  gagne `withdrawing` (la personne sort, son identifiant est gardé au plus 8 h, le plus long terme serveur possible),
  `settled` (la liste envoyée solde tous les retraits), `isSettled`, `hasRecipients`, `hasPendingWithdrawals` ; le
  format gardé ajoute `withdrawals` (identifiants et bornes, jamais une position), une liste d'avant se relit sans
  retrait. Le centre : un « Arrêter » qui échoue (hors ligne, accusé perdu) rend `withdrawalPending`, arme le rejeu de
  30 s, coupe le suivi s'il ne reste personne ; `reconcile()` rejoue dès que la liste n'est pas soldée (minuteur,
  socket accrochée, lancement) ; aucune mise à jour de position ne part tant qu'un retrait attend. Message neuf
  « Le partage s'arrêtera dès le retour du réseau » (sept langues, iOS, adopté par Android), en toast d'information.
- Le témoin « un accusé perdu en arrêtant une personne garde Arrêter pour tous » change de sens : l'intention est
  désormais gardée par le centre et rejouée, la personne n'attend plus un second toucher.
- Suivi ouvert : la même loi sur le web (#18388).
- Audit adversarial avant PR : un BLOQUANT corrigé et témoigné — sur iOS, le centre ne naissait qu'à l'ouverture d'une
  fiche : un retrait gardé n'aurait pas pu partir après un relancement. Il naît désormais avec la session du compte
  (`SharedLocationSharingHolder.followAccounts()`, appelé par la séquence de lancement, réveillé une fois par compte
  connecté). Android l'avait déjà (le centre est un `PerAccountCache` tiré au lancement par `LaunchPurgeHook`).
  Corrigés aussi, sur les deux : un retrait refusé pour autre chose que le réseau (débit, liste invalide) ARRÊTE tout
  au lieu de se rejouer des heures ; une dernière position plus vieille qu'un battement (120 s) n'est plus republiée
  comme fraîche, l'appareil est redemandé ; un retrait passé sa borne s'oublie sans rien émettre (plus de boucle).
  Noté : revenir à une version antérieure de l'app perd un retrait en attente (le format ancien ignore la clé).
  Suivis : la même loi sur le web (#18388) ; un second appareil du même compte (#18389).
- Gates locaux : `jvm-check -PjvmCheckModelOnly` `SharedLocationRosterTest` 8/8 verts ; `xcstrings_to_android.py
  --check`, `check-verbosity-native.mjs`, `check-file-budget.sh` verts ; iOS `check_localization.py`,
  `check_test_registration.sh` verts, `check_house_rules.sh` et `check_cohesion_budget.sh` identiques avec et sans le
  lot (rouge hérité de `dev` pour le premier). Swift et `sdk-core` se prouvent par la CI de `dev` après fusion
  (`CI_DEV_SEUL`, #18048).
- Prochain lot recommandé : #18388 (le web), puis la passerelle #18205 avec #18389.

## 2026-11-14 — réveil de la nuit : un « Arrêter » hors ligne part au retour du réseau, sur le web (#18388)

- Reprise : aucune PR cercles ouverte ; #18390 (iOS + Android) fusionnée. Aucune branche n'écrit
  `apps/web/src/lib/shared-locations/` : lot réservé sur `claude/cercles-18388-web-arreter-hors-ligne`.
- Lot : le RETRAIT EN ATTENTE sur le web, même loi que iOS/Android (#18204). `shared-location-roster.ts` : la liste
  devient `{ entries, withdrawals }` avec `withdrawing` (8 h au plus), `settled`, `isSettled`, `hasRecipients`,
  `hasPendingWithdrawals`. Le centre : un « Arrêter » qui échoue (hors ligne, accusé perdu) rend `withdrawal-pending`,
  coupe le suivi s'il ne reste personne et se rejoue toutes les 30 s et à la socket accrochée ; aucune mise à jour ne
  part tant qu'un retrait attend ; un refus autre que le réseau arrête tout ; une dernière position plus vieille qu'un
  battement est redemandée à l'appareil. Message « Le partage s'arrêtera dès le retour du réseau » en sept langues.
- Audit adversarial avant PR : deux défauts corrigés et témoignés — (1) un démarrage en vol dans un autre onglet
  ressuscitait la personne mise en retrait pendant l'attente : après l'accusé, les retraits gardés l'emportent et se
  rejouent aussitôt ; (2) un onglet d'une version d'avant effaçait le retrait en réécrivant la liste : les retraits
  vivent sous leur propre clé (`<clé>.withdrawals`), la liste garde le format d'avant. Corrigé aussi : une écriture
  refusée par le stockage laisse la mémoire faire foi (la liste gardée en retard n'est plus relue).
  Suivis ouverts : verrou entre onglets pour un arrêt RÉUSSI (#18431, course antérieure au lot) ; la fiche dit qu'un
  arrêt attend le réseau, et un arrêt complet décidé en arrière-plan se dit, sur les trois clients (#18432).
- Gates locaux : `bun test` du lot 97/97 (témoins vus rouges d'abord) ; `tsc --noEmit` vert ; build,
  `check-utilities`, `measure-weight` verts.
- Prochain lot recommandé : la passerelle #18205 avec #18389, puis #18431, puis #18351 une fois tranchée.

## 2026-11-14 — réveil de l'après-midi : la passerelle tient l'échéance de chaque personne (#18205, serveur + web)

- Reprise : aucune PR cercles ouverte ; #18433 (web) fusionnée. Aucune branche n'écrit `services/sharedLocation/` :
  lot réservé sur `claude/cercles-18205-echeance-par-personne`.
- Lot : `location:share-start` accepte `recipients[].expiresInSeconds` (optionnel, entier, au plus 8 h, ramené au
  terme). La passerelle range l'échéance de chaque destinataire dans l'état scellé (`secret-at-rest`, inchangé) ;
  `accessOf` ne garde que les destinataires non échus (`liveRecipients`), donc aucun chemin (direct, rattrapage,
  remontée de cercle, réconciliation) ne sert plus un lecteur échu, sans que l'appareil de l'émetteur tourne ; chaque
  lecteur reçoit SA propre échéance en `expiresAt`, plus le terme du partage (qui trahissait qu'un autre voyait plus
  longtemps). Sans la clé (ancien client), le terme vaut pour tous. Le web envoie l'échéance de chaque personne qui
  tombe avant le terme (`rosterOps.deadlinedRecipients`) et renvoie la liste sans échéances si une passerelle d'avant
  la refuse (`startTolerant`).
- Audit adversarial avant PR : aucun bloquant. Corrigés et témoignés : une personne échue pendant l'attente d'un relevé
  ne part plus (même pour une seconde) ; une échéance rangée illisible ferme l'état au lieu de retomber sur le terme.
  Assumés et écrits dans la PR : une passerelle d'avant le lot qui réécrit un état (retour arrière, deux versions en
  déploiement) efface les échéances des sessions touchées ; le code `INVALID` sert aussi au refus « appelant non
  inscrit », d'où un repli sans échéances possible dans une fenêtre de quelques millisecondes (retombe au
  comportement d'avant). Suivi ouvert : iOS et Android (#18467).
- Gates locaux : gateway `jest` `sharedLocation` + handler + admin 11 suites, 197 verts (témoins vus rouges d'abord,
  mutations prouvées) ; `tsc` gateway et shared verts ; contrat partagé `vitest` 6/6 ; web `bun test` du lot 97/97,
  `tsc --noEmit`, build, `check-utilities`, `measure-weight` verts.
- Prochain lot recommandé : #18467 (iOS + Android), puis #18389 (multi-appareils), puis #18431.

## 2026-11-14 — réveil du soir : iOS et Android envoient l'échéance de chaque personne (#18467)

- Reprise : aucune PR cercles ouverte ; #18469 (passerelle + web, #18205) fusionnée. Aucune branche n'écrit les chemins
  du partage de position natif : lot réservé sur `claude/cercles-18467-natifs-echeance`.
- Lot : SDK Swift et `:core:model` Kotlin — `SharedLocationRecipient.expiresInSeconds` (borné de 1 s à 8 h, la clé ne
  part que si elle est posée), `SharedLocationStartRequest.carriesDeadlines` / `withoutDeadlines`, un doublon garde sa
  dernière échéance. Les listes iOS et Android gagnent `deadlinedRecipients` (iso web : échéance arrondie à la seconde
  au-dessus pour chaque personne qui tombe avant le terme, personne échue écartée). Les deux centres passent par
  `startTolerant` : un refus `INVALID` d'une liste qui porte des échéances repart une fois sans elles (passerelle d'avant
  #18205), sous la garde de compte (`isLive` / `isCurrent(ticket)`).
- Audit adversarial avant PR : aucun bloquant. Retenus et témoignés : un refus autre que `INVALID` ne rejoue rien (iOS
  et Android), titre de témoin Kotlin corrigé. Assumés : le bornage Kotlin se fait dans `SharedLocationStartRequest.of`
  (seul chemin d'émission) et non à la construction ; après un accusé perdu, l'union peut faire couper la passerelle
  plus tôt que l'écran ne le dit (sens du moins servi).
- Gates locaux : `jvm-check` `:core:model` `*SharedLocation*` vert (52 témoins ; le premier passage a rougi sur un
  témoin mal calculé, corrigé) ; gardes iOS cohésion et localisation vertes, `check_house_rules.sh` rouge comme sur
  `dev` (hérité). iOS (SDK + app) et le centre Android ne compilent qu'en CI : preuve par la CI de `dev` après fusion.
- Prochain lot recommandé : #18389 (multi-appareils), puis #18431, puis #18351 une fois tranchée. #18205 se ferme avec ce
  lot (serveur, web, iOS, Android).

## 2026-11-14 — réveil de la nuit : la PR #18520 menée à la fusion (#18467, #18205)

- Reprise : la PR #18520 (iOS et Android envoient l'échéance de chaque personne) était ouverte et rouge ; le run a
  consisté à la fusionner, pas à en ouvrir une autre.
- `origin/dev` fusionné à la main dans la branche : un seul conflit, `EphemeralBurnLayer.swift`, où la branche et
  `dev` portaient le MÊME correctif (lectures sorties de la fermeture Sendable de `visualEffect`) ; la version de
  `dev` a été gardée telle quelle.
- Rouge hérité de `dev` corrigé au passage : `DirectIconUsageRatchetTest` (sdk-ui) refusait
  `CallDuoAudioCompactHeightTest.kt` (#18488), qui importait `Icons.Filled.VolumeUp` en direct ; il passe par
  `MeeshyIcons.VolumeUpFilled` (même icône).
- CI de la PR sur le dernier commit (`c5b6c1da8`) : Build SDK, Build app, SDK tranches 1, 2, 5 vertes ; Android
  `:core:model`, `:sdk-core`, `:sdk-ui` verts. Rouges étrangers au lot, hérités de `dev` : SDK tranches 4 et 6
  (`MeeshyObjectMenu` K18 : instantanés absents et ordre des lignes), Android `:feature:calls` (8 témoins d'appel
  après les lots Réduire les animations #18459/#18524). Tranche 3 jamais servie par un runner macOS (verte sur le
  commit précédent, même code du lot).
- Fusionnée dans `dev` (41ba0a2a5). #18467 et #18205 fermées.
- Prochain lot recommandé : #18389 (multi-appareils), puis #18431, puis #18351 une fois tranchée.

## 2026-11-14 — réveil de fin de soirée : un retrait fait sur un appareil vaut pour tous les appareils du compte (#18389)

- Reprise : aucune PR cercles ouverte ; #18520 fusionnée. Aucune branche n'écrit `services/sharedLocation/` ni
  `apps/web/src/lib/shared-locations/` : lot réservé avant toute écriture.
- Constat : un retrait fait sur un appareil hors ligne ne PEUT pas atteindre la passerelle tant qu'aucun appareil qui le
  connaît n'est en ligne ; ce qui se répare, c'est qu'un autre appareil ne le défasse pas (il republiait sa liste
  périmée au prochain ajout) et qu'il l'apprenne dès que la passerelle le reçoit.
- Lot : la passerelle fait foi. Après chaque démarrage ou arrêt accepté, `location:share-own-changed` (sans charge) part
  vers tous les appareils du compte ; `GET /relations/locations/mine` rend la liste CHOISIE (personnes, précisions,
  échéances ; ni position, ni verdict de cercle ou de blocage, `private, no-store`). Le web relit à chaque socket
  accrochée (avant de rejouer ses retraits) et à chaque annonce, et adopte la liste servie (`rosterOps.withServed`) :
  ses retraits en attente gagnent, l'échéance servie l'emporte. Une liste REÇUE d'un autre appareil ne fait jamais
  partir la position d'ici (marque `<clé>.received` : ni suivi, ni rechargement, échéances soldées sans envoi).
- Audit adversarial avant PR : un bloquant corrigé (l'appareil qui recevait la liste publiait sa propre position à la
  première échéance ou au rechargement), une prolongation faite ailleurs n'est plus défaite, un ajout non confirmé que
  le serveur ne sert pas sort de la liste (témoin). Assumés : un arrêt de compte côté serveur (suppression) ne s'annonce
  pas ; un « Arrêter » fait sur un appareil qui n'a pas démarré envoie SA position une fois (#18580).
- Suivis ouverts : iOS et Android (#18578), un seul appareil publie (#18580). #18389 reste ouverte jusqu'à #18578.

## 2026-11-15 — réveil de 1 h : la PR #18581 menée à la fusion (#18389, serveur + web)

- Reprise : la PR #18581 (un partage, plusieurs appareils) était ouverte ; le run consiste à la fusionner, pas à en
  ouvrir une autre. Dernier commit de la session précédente à 23 h 51, aucune autre session ne l'écrivait.
- Rouge de la PR : Android `:feature:game:testDebugUnitTest`, un seul témoin (`GameRulesScreenComposeTest` « toucher le
  i de la frappe déplie le calcul », ligne 109). Étranger au lot (épure du jeu #17584) ; il n'apparaît que parce que la
  session précédente a fait recompiler ces témoins. La PR #18595 reprend déjà `:feature:game` : on lui cède.
- `origin/dev` fusionné à la main : aucun conflit.
- Gates locaux après la fusion : gateway `jest` `sharedLocation` + handler + `routes/relations` 13 suites, 243 verts ;
  `tsc` gateway vert ; web `bun test` du lot 90/90, `tsc --noEmit` vert.
- Rouge du lot trouvé par la CI : `Tests · shared` (garde de parité des événements, #18342) comptait Android comme
  lecteur de `location:share-own-changed` parce qu'un commentaire du cliquet des routes Android citait le nom de
  l'événement. Commentaire reformulé : l'inventaire (Android et iOS en retard) redevient juste ; `vitest` shared
  409 fichiers, 9 727 verts.
- CI du dernier commit (`4b80a97a5`) : passerelle (3 tranches + couverture), shared, web, agent, builds (bun, SDK,
  app) verts. Rouges étrangers : Android `:feature:game` (ci-dessus) et Playwright tranche 3 (une puce d'appel sous
  44 pt en sombre 320×568, verte sur le commit précédent au même code web).
- **Fusion BLOQUÉE** : `dev` est verrouillée (`lock_branch` activé, aucun commit sur `dev` depuis le 2026-11-14 à
  23 h 08 UTC) ; la fusion rend `405 Cannot change this locked branch`. Le verrou ne se lève que par un administrateur :
  la routine ne le contourne pas. La PR est prête à fusionner dès qu'il est levé.
- Prochain lot recommandé : #18578 (iOS + Android se recalent sur la passerelle), puis #18580, puis #18431.

## 2026-11-15 — réveil de 15 h : `dev` déverrouillée, la PR #18581 repart vers la fusion (#18389)

- Reprise : `dev` n'est plus verrouillée (`lock_branch` désactivé, commits sur `dev` depuis 13 h UTC). La branche avait
  déjà reçu `dev` à 13 h 37 UTC ; `dev` ayant encore avancé, `origin/dev` y est refusionné à la main : aucun conflit.
- Gates locaux sur le résultat fusionné : gateway `jest` `sharedLocation` + handler + `relation-locations` 8 suites,
  120 verts ; `tsc` gateway et web verts ; web `bun test` du lot 140/140 ; garde shared de parité des événements 5/5.
- Rouge vu sur le commit précédent, étranger au lot : `Gardes iOS (texte)` — cliquet des couleurs `Color(hex:)` à 468
  pour une référence de 466 ; la PR ne touche aucune couleur iOS (seul Swift : deux lignes de `RelationsEndpoint`).
- Prochain lot recommandé : #18578 (iOS + Android se recalent sur la passerelle), puis #18580, puis #18431.

## 2026-11-15 — réveil de 19 h : iOS se recale sur le partage que la passerelle sert (#18578, moitié iOS)

- Reprise : la PR #18581 (#18389, serveur + web) a été fusionnée dans `dev` par le porteur ; aucune PR cercles ouverte.
  Aucune branche vivante n'écrit `apps/ios/Meeshy/Features/SharedLocation/` ni le centre Android : lot réservé avant
  toute écriture.
- Lot : la moitié iOS de #18578 (iso `shared-location-sharing.ts` du web). SDK : `location:share-own-changed` routé
  (`SharedLocationEvents.ownChanged`), `RelationsService.ownSharedLocation()` lit `GET /relations/locations/mine`
  (`SharedLocationOwnSnapshot`). App : `SharedLocationRoster.withServed` (la liste servie fait foi, retraits en attente
  d'ici gagnants), `SharedLocationSharingCenter.sync()` à chaque socket accrochée (avant la réconciliation) et à chaque
  annonce ; une liste REÇUE d'un autre appareil (marque gardée par compte) ne suit pas la position, ne reprend pas au
  lancement et solde ses échéances sans rien envoyer ; « Partager » fait de cet iPhone celui qui publie.
- Gardes : `RelationsEndpoint.locationsMine` sort des entrées en attente du catalogue Swift ; la garde de parité des
  événements ne compte plus iOS comme absent de `location:share-own-changed` (Android seul).
- Ce qui reste de #18578 : Android (centre `SharedLocationSharingCenter.kt`, `ApiRoutesRelations.LOCATIONS_MINE`).
- Audit adversarial avant PR : un bloquant corrigé (une réponse SANS liste lisible se lisait « plus rien n'est
  partagé » : l'iPhone perdait ses « Arrêter » pendant que la passerelle servait encore sa position ; elle échoue
  désormais, comme sur le web), un « Partager » refusé sur un appareil qui n'a fait que recevoir ne le fait plus
  publier au lancement suivant (la marque ne tombe qu'à l'accusé). Les trois écarts communs aux trois clients (liste
  périmée republiée avant la relecture, deux appareils qui publient, demande de permission sur un « Arrêter » iOS)
  sont ouverts en #18714.
- Prochain lot recommandé : la moitié Android de #18578, puis #18714, puis #18580.
- CI : la garde de forme des charges Swift a rougi comme prévu (iOS confronte un événement de plus) ; cliquet relevé à
  156, gardes `packages/shared/__tests__/ci` 24 fichiers, 204 verts. Les runs de branche (CI, iOS, iOS SDK) ont été
  annulés, comme ceux de toutes les branches ce soir (CI sur `dev` seulement) ; iOS se prouvera sur `dev`.
- `origin/dev` refusionné à la main sans conflit ; gardes iOS texte et shared vertes sur le résultat.
- **Fusion BLOQUÉE** : `dev` est verrouillée (`lock_branch`), la fusion rend `405 Cannot change this locked branch`. La
  PR #18715 est prête dès que le verrou est levé.

## 2026-11-15 — réveil de 23 h : Android se recale sur le partage que la passerelle sert (#18578, moitié Android)

- Reprise : la PR #18715 (moitié iOS) a été fusionnée par le porteur ; aucune PR cercles ouverte. `dev` est de nouveau
  verrouillée (`lock_branch`). Aucune branche vivante n'écrit le centre de partage Android : lot réservé avant toute
  écriture (`claude/cercles-18578-android`).
- Lot : la moitié Android de #18578, iso iOS (#18715) et web (#18581). `:core:model` : `SharedLocationOwnSnapshotWire`
  (personne illisible écartée, réponse sans liste lisible ⇒ `null`, « je ne sais pas »), `SharedLocationRoster.withServed`.
  Réseau : `RelationsApi.ownSharedLocation` (`GET /relations/locations/mine`). Socket : `location:share-own-changed`
  routé (`RelationSocketEventsManager.sharedLocationOwnChanged`). Centre : `sync()` à chaque socket accrochée (avant la
  réconciliation) et à chaque annonce ; marque « reçue » gardée par compte (ni suivi, ni reprise au lancement, échéance
  soldée sans envoi), levée seulement par un « Partager » accepté.
- Gardes : cliquet des routes « à porter » 131 → 130 ; la garde de parité des événements ne compte plus Android absent
  de `location:share-own-changed` (`vitest packages/shared/__tests__/ci` 24 fichiers, 204 verts) ; `jvm-check`
  `*SharedLocation*` 57 verts.
- Trouvé en chemin : `BatteryRosterSnapshotTest.kt` (lot batterie #14147) portait un « : » dans un nom de test ; la
  compilation JVM des témoins de `:core:model` rompait sur `dev` (« Name contains illegal characters »). Corrigé dans
  le lot (une virgule).
- Audit adversarial avant PR : non bloquant. Corrigé dans le lot : la marque « reçue » s'écrit AVANT la liste reçue (un
  processus tué entre les deux écritures se relançait en publiant), une relecture qui lève n'importe quelle exception
  vaut « je ne sais pas » au lieu de tuer pour de bon le collecteur des reconnexions ; témoins ajoutés pour une relecture
  en vol pendant un changement de compte et pour un « Arrêter » hors ligne qui gagne sur la liste servie. L'ordre
  d'écriture est le même sur iOS : suivi ouvert.
- Ce qui reste : #18714 (liste périmée republiée, deux appareils qui publient, permission iOS), #18580, #18431.
  #18578 se ferme avec cette PR ; #18389 aussi (serveur, web, iOS et Android livrés).
- PR #18762 ouverte vers `dev`. CI : la CI de PR est gelée (`skipped`) ; `android.yml` lancé à la main sur la branche a
  été annulé par le porteur au bout d'une minute (« canceled by @jcnm »), `ci.yml` en cours. `dev` est verrouillée : la
  routine ne relance rien et ne fusionne pas ; la PR attend le porteur. `:core:model` et les gardes shared sont prouvés en
  local ; `sdk-core` et `:core:network` ne le seront que par `android.yml`.

## 2026-11-17 — réveil de 16 h : les onglets d'un même compte sérialisent leur partage de position (#18431)

- Reprise : la PR #18762 (moitié Android de #18578) a été fusionnée le 2026-11-16 ; aucune PR cercles ouverte, `dev`
  déverrouillée. Aucune branche vivante n'écrit `apps/web/src/lib/shared-locations/` : lot réservé avant toute écriture
  (`claude/cercles-18431-onglets`).
- Lot : #18431, web seul. Chaque opération du centre de partage passe par un verrou Web Locks par compte
  (`navigator.locks`, exclusif, `sharedLocationAcrossTabs`), avec repli sur le verrou de l'onglet sans Web Locks. Un
  « Arrêter » attend l'accusé d'un démarrage d'un autre onglet, puis relit la liste avant de retirer la personne. Le
  relevé de « Partager » (qui peut ouvrir la demande de permission du navigateur) se prend HORS du verrou du compte : une
  demande laissée ouverte ne retient pas les « Arrêter » des autres onglets.
- Audit adversarial avant PR : non bloquant. Corrigé dans le lot : un `not-sharing` reçu en retard sur une mise à jour
  vidait la liste qu'un autre onglet venait de démarrer (défaut déjà sur `dev`) ; il ne vide plus que si la liste relue
  sous le verrou du compte est celle d'avant l'envoi. Consignés sans correctif : un onglet dont l'écriture a échoué
  (quota) ne relit rien sous le verrou (déjà sur `dev`) ; comportement de Web Locks dans un onglet gelé et dans la
  WebView Capacitor non vérifié.
- Gates locaux : `bun test src/lib/shared-locations/` 125 verts (témoins rouges d'abord) ; fichiers de test qui citent le
  partage 222 verts ; `tsc --noEmit` web vert.
- Prochain lot recommandé : #18714 (liste périmée, deux appareils qui publient, permission iOS), puis #18580 ; #18351
  attend la décision du porteur.

## 2026-11-17 — réveil de 17 h : un retrait republie la liste sans position (#19284 ⊂ #18580, passerelle + web)

- Reprise : la PR #19264 (#18431) a été fusionnée par le porteur ; aucune PR cercles ouverte. Aucune branche vivante
  n'écrit `services/sharedLocation/` ni `apps/web/src/lib/shared-locations/` : lot réservé avant toute écriture
  (`claude/cercles-19284-liste-seule`).
- Lot : #19284, la première tranche de #18580 (et du point 3 de #18714). `location:share-start` accepte une charge SANS
  position (« liste seule ») : la passerelle reprend le point qu'elle garde, scellé, avec son heure et la maille de
  chacun. Une liste seule ne fait que RETIRER : qui n'est plus servi est ignoré, la précision ne monte pas, le terme et
  les échéances ne reculent pas, une liste vide vaut un arrêt ; après la prise du pointeur, elle se rejoue sur la session
  remplacée relue (un retrait ou une position d'un autre appareil écrits pendant l'envoi ne sont ni défaits ni reculés).
  Web : un retrait ou une échéance envoie la liste seule, sans relevé ; une passerelle d'avant (`INVALID`) fait repartir
  l'envoi avec position ; « pas de partage » relit la passerelle avant de vider la liste.
- Audit adversarial avant PR : BLOQUANT au premier passage (un `INVALID` « ajoute quelqu'un » renvoyait le web vers
  l'envoi avec position, et la vérification n'était pas atomique avec la prise du pointeur). Corrigé dans le lot, avec
  les points non bloquants (terme prolongé, précision relevée, « pas de partage » vidé à l'aveugle). Restent ouverts en
  #19288 : une projection inchangée resservie, et une fenêtre étroite où une position peut reculer d'un pas.
- Gates locaux : passerelle `sharedLocation/` + porte socket 122 verts (témoins rouges prouvés par mutation), `tsc` vert ;
  web `src/lib/shared-locations/` 140 verts + suites qui citent le partage 117 verts, `tsc` vert ; gardes
  `packages/shared/__tests__/ci` 215 verts sur l'arbre fusionné avec `dev`.
- Ce qui reste : iOS et Android (#19287), #18714 (points 1 et 2), #19288, #18351 (décision du porteur).
- Prochain lot recommandé : #19287 (iOS puis Android, prouvés par leur CI).

## 2026-11-17 — réveil de 23 h : mener la PR #19289 (liste seule) à la fusion

- Reprise : deux PR cercles ouvertes. #19354 (icône de cercle, #17013) avait un commit poussé quatre minutes plus tôt
  par une autre session : je lui cède. #19289 n'avait plus bougé depuis 21 h 23 et sa CI attendait des runners.
- `origin/dev` (95ffb1dcc) fusionné à la main sans conflit (seuls le traducteur et un état d'agent d'appel bougeaient).
  Gates rejoués sur l'arbre fusionné : passerelle `sharedLocation/` + porte socket 122 verts ; web
  `src/lib/shared-locations/` 140 verts.
- Prochain lot recommandé : #19287 (iOS puis Android de la liste seule), puis #18714 points 1 et 2, puis #19288.

## 2026-11-18 — réveil de 1 h : #19289 recalée sur dev, la liste seule garde le fantôme et la batterie

- Reprise : deux PR cercles ouvertes, aucune n'avait bougé depuis 23 h 15. #19289 était en conflit avec `dev`
  (`sharedLocationRelay.ts`, `shared-location.ts`) : `dev` venait d'apporter le fantôme global (#19203, `servableFrom`),
  la batterie pendant le partage et « prévenir » (#19204, `shareBattery`, `notifyRecipients`).
- Résolution à la main, les deux côtés gardés. Le contrat garde la position facultative ET les deux clés de #19204. La
  liste seule reprend désormais de la session remplacée son seuil de sortie du fantôme (sans lui, une liste seule faite
  après la sortie aurait servi le point pris EN fantôme : fuite trouvée à la fusion, témoin rouge prouvé) et sa
  batterie, qu'elle peut retirer (`shareBattery: false`) mais jamais ajouter ; « prévenir » ne part pas sur une liste
  seule (elle n'ajoute personne) ; la batterie est rejouée à partir de la session remplacée relue.
- Gates sur l'arbre fusionné : passerelle `sharedLocation/` 187 verts (3 témoins neufs, 2 rouges sans le correctif),
  porte socket + relations + fantôme + blocage 195 verts, `tsc` vert ; web `src/lib/shared-locations/` 140 verts,
  `tsc` vert ; shared `types` 1 795 verts, gardes `__tests__/ci` 215 verts.
- Audit adversarial de la résolution : non bloquant, un défaut moyen corrigé dans le lot. Une liste seule d'un autre
  appareil prise ENTRE la lecture et la retenue de la sortie du fantôme recopiait une session sans seuil, et le point
  pris en fantôme repartait (même course déjà sur `dev` avec une position). La sortie retient désormais le partage
  COURANT, relu jusqu'à cinq fois, et lève sinon (fail-closed) ; témoin rouge prouvé. L'état provisoire d'une liste
  seule, rangé avant la prise, ne sert rien (seuil posé, pas de batterie) tant qu'il n'est pas réécrit. Reste, déjà sur
  `dev` : avec une position, la session remplacée est lue avant la prise (« prévenir » peut partir deux fois).
## 2026-11-17 — réveil de 19 h : le marqueur de position dit de quel cercle vient la personne (#17013)

- Reprise : la PR #19289 (liste seule, #19284) est ouverte et conflictuelle, mais le réveil précédent la menait encore
  (commentaire sur la PR trois minutes avant ce réveil) : ce réveil ne l'a pas touchée (« celui qui n'a rien écrit
  cède »). Aucune branche vivante n'écrit les cartes de positions : lot réservé avant toute écriture
  (`claude/cercles-17013-icone-cercle`).
- Lot : #17013, demande de Jacques du 2026-11-07 (« une icône de position distincte par cercle d'amis sur la carte »).
  La passerelle servait déjà `circle` (#17966) ; aucun client ne le dessinait.
  - Web : le décodeur garde `circle` s'il est connu ; l'épingle prend la teinte et l'icône du cercle (🤝, 🔥, 🩸), le
    libellé lu et la liste disent « Nom · Proche · … ». La couleur d'un niveau vit une fois (`relationLevelTint`,
    `lib/relations/level-labels.ts`) : la fiche d'un lien et « Mes cercles » ne la recopient plus.
  - iOS : `SharedLocationChanged.circle` (FRIEND, CLOSE, BLOOD seulement) porté par `SharedLocationEntry` ; le marqueur
    MapKit prend l'icône du cercle à la place des initiales et la couleur `CircleLevelColor` ; VoiceOver dit le cercle.
  - Android : le modèle portait déjà le cercle ; `SharedLocationCircle.level` le relie au niveau du lien, l'épingle en
    tire icône, teinte et nom (TalkBack).
  - Sans cercle servi (passerelle antérieure), les trois marqueurs restent neutres : aucun client ne devine le cercle.
- Gates locaux : web `bun test` (cartes, cercles, partage) 7 904 verts, `tsc --noEmit` vert ; gardes iOS texte vertes
  (règles maison 42, cohésion, localisation, couleurs) ; `vitest packages/shared/__tests__/ci` 25 fichiers, 215 verts ;
  `jvm-check *SharedLocation*` (voir la PR). iOS et Android se prouvent par la CI de la PR.
- Prochain lot recommandé : finir #19289 si le réveil précédent ne l'a pas fusionnée, puis #19287 (iOS et Android
  envoient la liste seule), #18714, #18580.

## 2026-11-18 — réveil de 1 h : #19354 (icône de cercle) recalée sur dev

- `origin/dev` (d84e74a80) fusionnée sans conflit ; aucun fichier de carte ou de position client ne bougeait côté `dev`.
  Web `src/lib/shared-locations` + `relations` 180 verts, `tsc` vert sur l'arbre fusionné. iOS et Android par la CI.

## 2026-11-18 — réveils de 3 h à 10 h : #19289 et #19354 fusionnées dans `dev`

- Reprise : deux PR de la routine ouvertes, #19289 (liste seule, #19284) et #19354 (icône de cercle, #17013). Aucun
  nouveau lot ouvert : le run a consisté à les mener à la fusion.
- `origin/dev` fusionnée à la main dans les deux branches, sans conflit, à trois reprises (c11ad1d1, 5e5414d9, puis
  47157ee64 pour #19289) ; gates locaux sur l'arbre fusionné : passerelle `sharedLocation` 188 verts (+ `deliveryFloor`,
  197) et tsc, web `shared-locations` 140 verts, carte 40 verts, tsc web vert.
- #19354 cédée à 07:09 UTC : une autre session de la routine y a poussé (`ff317d012`).
- Fusion : les deux PR ont été fusionnées par le porteur le 2026-11-18 à 07:40 UTC (3031bed16 et 9b1090998). #19289 :
  CI verte sur sa tête (23 succès, 0 échec). #19354 : les tranches du SDK iOS ont été annulées par la fusion, son verdict
  iOS SDK est rouge par annulation, pas par un test. Le run iOS de `dev` qui suit (14404376b) rougit sur
  `ProfilePendingActionsCard.swift` (lot profil, isolation `main actor` de `.module`) : étranger aux cercles.
- Issues fermées avec leur preuve : #19284, #17013. Restent : #19287 (liste seule iOS + Android), #19288 (deux points
  mineurs), #18714, #18580 ; #18351 attend la décision du porteur.
- Prochain lot recommandé : #19287, puis #18714.
## 2026-11-18 — réveil de 9 h : iOS et Android envoient la liste seule (#19287)

- Reprise : #19289 (liste seule, passerelle + web) et #19354 (icône de cercle) sont fusionnées dans `dev`. Aucune branche
  vivante n'écrit `SharedLocationSharingCenter` ni le centre Android : lot réservé avant toute écriture
  (`claude/cercles-19287-liste-seule-natifs`).
- Livré dans la PR #19652 (vers `dev`) : le SDK iOS et le modèle Android savent écrire une liste seule (aucune
  `position`, aucun repli legacy) ; les deux centres essaient la liste seule d'abord, retombent sur l'envoi complet
  sur `INVALID` (passerelle d'avant), et relisent ce qui est servi sur `NOT_SHARING`.
- Audit adversarial : non bloquant, un constat MOYEN corrigé dans le même lot, SUR LES TROIS CLIENTS (web compris) :
  `NOT_SHARING` couvre aussi une session reprise par un autre appareil ; une relecture en échec vidait la liste et
  laissait la personne servie. Elle rend désormais « non confirmé » (retrait en attente, rejoué) ; seul un partage
  servi VIDE vide la liste.
- Mineurs consignés, sans lot : tout `INVALID` déclenche le repli avec position ; `untilStopped` dans une liste seule
  serait refusé par le schéma strict (inatteignable aujourd'hui) ; `listOnlyState` plafonnerait un partage
  « jusqu'à l'arrêt » à `durationMinutes` (à traiter quand la passerelle le servira) ; iOS envoie `shareBattery`
  dans la liste seule, Android non (sans effet).
- Gates : jvm-check `:core:model` BUILD SUCCESSFUL ; web 141/141 et `tsc` exit 0 ; gardes iOS exit 0. Swift et
  `sdk-core` ne compilent pas dans le conteneur : la CI de la PR fait foi.
- Lot suivant : voir les issues ouvertes du milestone des cercles (prochaine dimension non mûre de la liste seule :
  le cas « jusqu'à l'arrêt » côté passerelle).

## 2026-11-18 — réveil de 11 h : un seul appareil publie la position (#18580, #18714)

- Reprise : #19652 (liste seule iOS + Android) fusionnée, aucune PR de la routine ouverte, aucune branche vivante sur
  les centres de partage : lot réservé avant toute écriture (`claude/cercles-18580-un-seul-publie`).
- Ce qui restait de #18580 et #18714 après la liste seule (#19284, #19287) : un appareil qui PUBLIAIT et relisait une
  liste changée par un autre appareil l'adoptait sans céder ; les deux envoyaient leur position et la personne voyait
  le point sauter. Et iOS, au repli vers une passerelle d'avant la liste seule, pouvait faire surgir la demande de
  permission pour un simple retrait.
- Première version (comparer la liste servie à la sienne : personne de plus, précision, échéance à 5 min près) jugée
  BLOQUANTE par l'audit adversarial : l'échéance servie vient de l'horloge de la passerelle, la locale de l'appareil ;
  un appareil en retard de plus de 5 min se taisait sur son propre partage, un accusé perdu ou une liste seule qui
  abaisse la précision aussi — et plus personne ne publiait. Leçon : on ne compare jamais deux horloges pour décider
  qui publie, on fait nommer l'événement par celui qui l'a vu.
- Livré : la passerelle nomme le dernier démarrage AVEC position (`startedAt`, déjà dans l'état scellé, gardé par la
  liste seule) dans l'accusé de `location:share-start` et dans `GET /relations/locations/mine` (clés additives).
  Chaque client garde le `startedAt` de son accusé ; à la relecture, un autre démarrage servi le fait céder (marque
  « reçue », suivi coupé, aucun relevé). Inconnu (relancement, accusé perdu) : le servi est pris pour le sien ; absent
  (passerelle d'avant) : rien ne change. iOS : `silentFix()` au repli, jamais de demande de permission.
- Reste ouvert (suivi) : un appareil relancé PENDANT qu'un autre a repris la publication prend le démarrage servi pour
  le sien, et publie avec lui jusqu'au prochain « Partager » (persister `startedAt` avec la marque « reçue »).
- Contre-audit n°2 (sur `startedAt`) : quatre constats, tous corrigés. Web : `publishedStart` vit dans le stockage
  partagé des onglets (un navigateur est UN appareil ; deux onglets ne se font plus céder l'un l'autre). Un refus
  d'un démarrage avec position remet l'identité à inconnu sur les trois clients (iOS `forgetPublishedStart`, Android
  aussi au changement de compte, `resetSession`). Témoin de route : `startedAt` traverse le sérialiseur de
  `GET /relations/locations/mine`.
- Gates : passerelle `sharedLocation` + `relations` + `socketio` 1 380 verts puis `relations` + `sharedLocation` 388
  verts après l'audit, `tsc` vert ; web `shared-locations` + `api` 176 verts, `tsc` vert ; jvm-check `:core:model` `*SharedLocation*` 61 verts ; gardes iOS (règles maison 42,
  cohésion, inscription des tests) vertes ; `packages/shared/__tests__/ci` 214/215, le rouge
  (`call:conversation-changed`, parité socket) vient du lot appels de `dev`, étranger aux cercles. Swift et `sdk-core`
  se prouvent par la CI de la PR.

## 2026-11-18 — réveil de 17 h : #19683 (un seul appareil publie) menée vers la fusion

- Reprise : #19683 toujours ouverte ; le porteur y avait fusionné `dev` à 16:29 UTC (4832809f7). Aucun nouveau lot ouvert.
- `origin/dev` (2fcb40b94 : profil iOS, leçon jvm-check) fusionnée sans conflit, aucun fichier du lot touché ; la
  branche contient de nouveau la tête de `dev`. Fusion de la PR dès la CI verte sur sa tête.

## 2026-11-18 — réveil de 19 h : #19683 (un seul appareil publie) recalée sur dev

- Reprise : #19683 toujours ouverte, tête 0754c4ece intacte depuis le réveil de 17 h ; sa CI attendait encore les
  runners (passerelle, web, shared, SDK iOS en file). Aucun nouveau lot ouvert.
- `origin/dev` (ffb60040e) fusionnée à la main, sans conflit : aucun fichier du lot ne bougeait côté `dev`.
- Gates sur l'arbre fusionné : passerelle `sharedLocation` 18 suites, 217 verts, `tsc` vert ; web
  `src/lib/shared-locations` 152 verts + `api/shared-locations` 24 verts, `tsc` vert. iOS et Android par la CI.
- Prochain lot recommandé : fusion de #19683, puis #19681 (startedAt persisté au relancement natif), plafond
  `untilStopped` de `listOnlyState`, #18351 une fois décidé.

## 2026-11-18 — réveil de 23 h : un appareil relancé après une reprise ne republie plus (#19681)

- Reprise : #19683 fusionnée dans `dev` le 2026-11-18 à 20:12 UTC (f1e316f0f0), #18580 et #18714 fermées à la main.
  #19682 (début arrondi) attend toujours la décision du porteur (commentaire du 2026-11-18 à 21:23 UTC) : sa branche
  reste sans PR.
- Lot : #19681. iOS et Android gardent le démarrage accepté par CET appareil (`publishedStart`) dans le même stockage
  que la marque « reçue », sous la clé du compte : relancé après qu'un autre appareil a repris le partage, le client ne
  prend plus le démarrage de l'autre pour le sien et cède au lieu de republier. Effacé à l'arrêt, à la cession et
  quand la passerelle ne sert plus personne. Le web l'avait déjà (localStorage). Un horodatage de démarrage, aucune
  position : rien à sceller.
- Témoins : relancement après cession ⇒ aucun relevé ne part et la marque « reçue » est posée ; relancement sans
  cession ⇒ la publication continue ; partage arrêté ailleurs ⇒ le démarrage gardé s'efface (iOS
  `SharedLocationSharingSyncTests`, Android `SharedLocationSharingSyncTest`). Swift et Kotlin se prouvent par la CI.

## 2026-11-19 — réveil de 1 h : #19768 (relancement natif) recalée sur dev

- Reprise : #19768 toujours ouverte, tête 798b61316 intacte ; la CI des PR reste gelée (35 vérifications « skipped »
  sur sa tête), le porteur fusionne les PR dans `dev` une à une. Aucun nouveau lot ouvert. #19682 attend toujours la
  décision du porteur.
- `origin/dev` (e4282f1e6) fusionnée à la main, sans conflit. `dev` a touché les écrans iOS de la carte (haptiques,
  présence des observateurs), jamais `SharedLocationSharingCenter` ni le centre Android.
- Gardes iOS sur l'arbre fusionné : règles maison (42) rc=0, cohésion rc=0, inscription des tests rc=0. Swift et
  `sdk-core` ne compilent pas en conteneur : `ios.yml` et `android.yml` feront foi au dégel.

## 2026-11-19 — réveil de 5 h : #19768 (relance après reprise) recalée sur dev

- Reprise : #19768 toujours ouverte, tête a263f99ad intacte ; la CI des PR reste gelée (35 vérifications « skipped »).
  #19682 attend toujours la décision du porteur (aucune réponse depuis le 2026-11-18). Aucun nouveau lot ouvert.
- `origin/dev` (96f5519cc : appels, profil iOS, pastilles des avatars) fusionnée à la main, sans conflit : `dev` n'a
  touché ni `SharedLocationSharingCenter` iOS ni le centre Android (seules les feuilles de carte iOS bougent, hors lot).
- Gardes iOS sur l'arbre fusionné : règles maison (42) rc=0, cohésion rc=0, inscription des tests (2 046) rc=0,
  couleurs d'accent rc=0. Swift et `sdk-core` Android se prouvent par la CI de la PR, au dégel.
- Prochain lot recommandé : fusion de #19768 au dégel, puis #19767, plafond `untilStopped` de `listOnlyState`,
  #19682 une fois décidée.

## 2026-11-19 — réveil de 9 h : #19768 recalée sur dev (a6b7eada5)

- Reprise : #19768 toujours ouverte, tête 072cc35df intacte ; la CI des PR reste gelée (35 vérifications « skipped »).
  #19682 toujours sans décision du porteur. Aucun nouveau lot ouvert.
- `origin/dev` (a6b7eada5 : tests SDK iOS, appels, profil) fusionnée à la main, sans conflit et sans fichier commun
  avec le lot.
- Gardes iOS sur l'arbre fusionné : règles maison (42) rc=0, cohésion rc=0, inscription des tests (2 046) rc=0,
  couleurs d'accent rc=0.
- Prochain lot recommandé : inchangé (fusion de #19768 au dégel, puis #19767, plafond `untilStopped`, #19682 décidée).

## 2026-11-19 — réveil de 11 h : aucune position avant la relecture du partage servi (#19767)

- Reprise : #19768 fusionnée dans `dev` (f3be4322a), #19681 fermée. #19682 attend toujours la décision du porteur.
- Lot : #19767. iOS et Android suivent l'appareil au relancement mais n'envoient aucun relevé avant la première
  relecture du partage servi (`awaitsServedTruth`) ; une relecture qui échoue, ou un « Partager » d'ici, lève l'attente.
  iOS : la liste porte l'identifiant d'installation (`PushDeviceIdentity`, trousseau `ThisDeviceOnly`) de l'appareil
  qui l'a écrite ; restaurée depuis la sauvegarde iCloud d'un AUTRE appareil, elle est reçue et sans démarrage gardé.
  Une liste d'avant la marque est adoptée telle quelle puis marquée. Android épargné (`allowBackup="false"`).
- Témoins : iOS `SharedLocationSharingSyncTests` (relevé avant relecture, relecture confirmée, relecture en échec,
  « Partager » avant relecture, sauvegarde restaurée ailleurs, même appareil, liste d'avant la marque) ; Android
  `SharedLocationSharingSyncTest` (trois cas). Swift et `sdk-core` se prouvent par la CI.
- Gardes iOS : règles maison (42) rc=0, cohésion rc=0, couleurs d'accent rc=0 ; inscription des tests rc=1, rouge
  HÉRITÉ de `dev` (cd0157b87 : `AnchoredSheetNamingGuardTests.swift` absent du pbxproj), étranger au lot.
- Contre-audit : un BLOQUANT corrigé (la marque d'appareil était réécrite avant que la liste reçue soit enregistrée :
  la cession ne tenait qu'un lancement — la liste est désormais écrite « reçue », sans démarrage, avant la marque) et
  un repli fermé (une passerelle d'avant la liste seule ne reçoit pas la position de l'appareil avant la relecture ; le
  retrait reste en attente). Restent assumés : une relecture en échec lève l'attente (critère de l'issue), une liste
  d'avant la marque restaurée ailleurs publie encore (décision au porteur).
- Prochain lot recommandé : fusion de cette PR, plafond `untilStopped` de `listOnlyState`, #19682 une fois décidée.

## 2026-11-19 — réveil de 11 h 14 : #19864 (relevé avant relecture, #19767) recalée sur dev

- Reprise : #19864 toujours ouverte, tête d8648e64d intacte ; la CI des PR reste gelée (30 vérifications « skipped »).
  #19682 toujours sans décision du porteur. Aucun nouveau lot ouvert.
- `origin/dev` (fd1bb9f46 : pistes vocales de post, profil iOS, pbxproj régénéré) fusionnée à la main, sans conflit et
  sans fichier commun avec le lot.
- Gardes iOS sur l'arbre fusionné : règles maison (42) rc=0, cohésion rc=0, couleurs d'accent rc=0, et inscription des
  tests (2 055) rc=0 — le rouge hérité de `dev` (AnchoredSheetNamingGuardTests) est soldé par a14f751ff.
- Prochain lot recommandé : fusion de #19864 au dégel, puis le plafond `untilStopped` de `listOnlyState`, #19682 décidée.

## 2026-11-19 — réveil de 13 h : #19864 recalée sur dev (7ef068889)

- Reprise : #19864 toujours ouverte, tête e44bb5cb5 intacte ; la CI des PR reste gelée (35 vérifications « skipped »).
  #19682 toujours sans décision du porteur. Aucun nouveau lot ouvert.
- `origin/dev` (7ef068889 : carte iOS — épingles en éventail, feuilles rangeables, talkie à l'appui long ; rang de
  liste ; communautés) fusionnée à la main, sans conflit : `dev` n'a touché que les écrans de carte iOS, jamais
  `SharedLocationSharingCenter` ni le centre Android.
- Gardes iOS sur l'arbre fusionné : règles maison (42) rc=0, cohésion rc=0, inscription des tests (2 055) rc=0,
  couleurs d'accent rc=0. Swift et `sdk-core` Android se prouvent par la CI de la PR, au dégel.
- Prochain lot recommandé : fusion de #19864 au dégel, puis plafond `untilStopped` de `listOnlyState`, #19682 décidée.

## 2026-11-19 — réveil de 15 h : #19864 (relevé avant relecture) recalée sur dev (07609bfa9)

- Reprise : #19864 toujours ouverte, tête 4228a2fcc intacte ; la CI des PR reste gelée (35 vérifications « skipped »,
  `dev` lui-même sans vérification jouée). #19682 toujours sans décision du porteur. Aucun nouveau lot ouvert.
- `origin/dev` (07609bfa9 : mouvement sur l'épingle, pièces jointes reprenables, qualité d'appel web) fusionnée à la
  main, sans conflit. `dev` a touché `SharedLocationSharingHolder` (l'émetteur est désormais enveloppé par
  `SharedLocationMotionTaggingEmitter`) : la ligne du magasin marqué par l'identifiant d'installation est gardée,
  et `didMove` garde sa retenue `awaitsServedTruth` avant tout envoi, mouvement compris. Android non touché par `dev`.
- Gardes iOS sur l'arbre fusionné : règles maison (42) rc=0, cohésion rc=0, inscription des tests (2 056) rc=0,
  couleurs d'accent rc=0. Swift et `sdk-core` Android se prouvent par la CI de la PR, au dégel.
- Prochain lot recommandé : inchangé (fusion de #19864 au dégel, plafond `untilStopped` de `listOnlyState`, #19682
  décidée).

## 2026-11-19 — réveil de 17 h : #19864 recalée sur dev (1c183a31c)

- Reprise : #19864 toujours ouverte, tête cd6681ff1 intacte ; la CI des PR reste gelée (35 vérifications « skipped »
  sur sa tête). #19682 toujours sans décision du porteur. Aucun nouveau lot ouvert.
- `origin/dev` (1c183a31c : demandes d'entrée des communautés, discipline des états en attente) fusionnée à la main,
  sans conflit et sans fichier commun avec le lot.
- Gardes iOS sur l'arbre fusionné : règles maison (42) rc=0, cohésion rc=0, inscription des tests (2 056) rc=0,
  couleurs d'accent rc=0. Swift et `sdk-core` Android se prouvent par la CI de la PR, au dégel.
- Prochain lot recommandé : fusion de #19864 au dégel, puis plafond `untilStopped` de `listOnlyState`, #19682 décidée.

## 2026-11-19 — réveil de 19 h : #19864 recalée sur dev 56b3abc7c

- Reprise : #19864 toujours ouverte, tête 9dd6c1e6e intacte ; la CI des PR reste gelée (35 vérifications « skipped »).
  #19682 toujours sans décision du porteur. Aucun nouveau lot ouvert.
- `origin/dev` (56b3abc7c : rang « la plus récemment active », métriques d'appel Android et web, file des partenaires)
  fusionnée à la main, sans conflit et sans fichier commun avec le lot ; `dev` n'a touché ni iOS ni le SDK.
- Gardes iOS sur l'arbre fusionné : règles maison (42) rc=0, cohésion rc=0, inscription des tests (2 056) rc=0,
  couleurs d'accent rc=0.
- Prochain lot recommandé : inchangé (fusion de #19864 au dégel, plafond `untilStopped` de `listOnlyState`, #19682
  une fois décidée).

## 2026-11-19 — réveil de 21 h : #19864 recalée sur dev d156266e8

- Reprise : #19864 toujours ouverte, tête 86c9e9584 intacte ; la CI des PR reste gelée (35 vérifications « skipped »).
  #19682 toujours sans décision du porteur. Aucun nouveau lot ouvert.
- `origin/dev` (d156266e8 : profil iOS, concepts de progression, demandes d'entrée des communautés) fusionnée à la
  main, sans conflit et sans fichier commun avec le lot (`dev` touche `LocationMapPinsLayer.swift`, hors lot).
- Gardes iOS sur l'arbre fusionné : règles maison rc=0, cohésion rc=0, inscription des tests (2 056) rc=0, couleurs
  d'accent rc=0. Swift et `sdk-core` Android se prouvent par la CI de la PR, au dégel.
- Prochain lot recommandé : inchangé (fusion de #19864 au dégel, plafond `untilStopped` de `listOnlyState`, #19682
  une fois décidée).

## 2026-11-19 — reprise de #19864 après son retrait de la vague de fusion

- Cause : devant une passerelle d'avant la liste seule, l'appareil relancé qui attend la relecture rendait `Refused(UNCONFIRMED)` ; le témoin déjà sur dev `SharedLocationSharingCenterTest:344` attend l'arrêt complet. Correctif sur les deux miroirs : `stopAll` (un arrêt n'a pas besoin de la position, aucune position d'ici ne part avant la relecture). Mes deux témoins du lot suivent (arrêt, rien de la position, liste vide).
- `dev` b560659a8 fusionnée à la main ; gardes iOS vertes sur l'arbre fusionné (house_rules 42, cohesion, registration 2056 inscrits, accent 168/408). `android.yml` déclenché sur la branche, comme demandé sur la PR.
- Restent en lots suivants : #19928 (relecture en échec à garder muette), #19929 (liste restaurée effacée et reconstruite, empreinte de l'identifiant d'installation).

## 2026-11-20 — réveil de 23 h (19 nov.) : #19864 prouvée sur Android

- Reprise : #19864 corrigée à 22 h 25 après son retrait de la vague de fusion (arrêt complet devant une passerelle
  d'avant la liste seule). Aucun nouveau lot ouvert : la routine mène sa PR.
- `android.yml` (`workflow_dispatch`, run 44628440305) sur 8d9b953d4 : **vert** — assemble + tests unitaires, chaînes,
  routes, jetons et graphe des modules. La tête suivante ne touche que ce journal.
- `origin/dev` c0784d9c3 fusionnée à la main, sans conflit (seules les demandes d'entrée des communautés bougent).
  Gardes iOS sur l'arbre fusionné : règles maison, cohésion, inscription des tests, toutes rc=0. La CI iOS des PR
  reste gelée.
- Prochain lot recommandé : fusion de #19864, puis #19928 (relecture en échec gardée muette), #19929, plafond
  `untilStopped`, #19682 une fois décidée.

## 2026-11-20 — réveil de 1 h : #19864 (relevé avant relecture) recalée sur dev (b66be57f7)

- Reprise : #19864 toujours ouverte, tête cd9041f9b intacte ; la CI des PR reste gelée (vérifications « skipped »),
  le porteur fusionne par vagues. Preuve Android déjà acquise (run `android.yml` 44628440305 vert sur 8d9b953d4).
  Aucun nouveau lot ouvert : #19928 et #19929 touchent les mêmes centres et attendent la fusion de #19864.
- `origin/dev` (b66be57f7 : appels Android, pièces jointes, pagination des conversations) fusionnée à la main, sans
  conflit ; `dev` n'a touché aucun fichier de relation, de position ni `PushDeviceIdentity` depuis c0784d9c3.
- Gardes iOS sur l'arbre fusionné : règles maison (42) rc=0, cohésion rc=0, inscription des tests (2 056) rc=0,
  couleurs d'accent (408) rc=0. Swift reste à prouver par `ios.yml`.
- Prochain lot recommandé : fusion de #19864, puis #19928 (relecture en échec gardée muette), #19929, plafond
  `untilStopped`, #19682 une fois décidée.

## 2026-11-20 — réveil de 5 h : la suite iOS de #19864 est verte

- Reprise : #19864 ouverte, tête 72c172d19 (témoin `test_aListFromBeforeTheMark_isAdoptedAsIs_andStampedForNextTime`
  corrigé au réveil de 3 h, après le rouge de la tranche 3 du run 44652457362). Aucun nouveau lot ouvert.
  #19682 attend toujours la décision du porteur.
- Preuve iOS : `ios.yml` run 44677003851 (`workflow_dispatch` sur 72c172d19) VERT — build, quatre tranches de tests,
  verdict. Preuve Android : run 44628440305 vert (code du lot inchangé depuis).
- `origin/dev` (2ac2ba716) fusionnée à la main, sans conflit et sans fichier commun avec le lot. Gardes iOS sur
  l'arbre fusionné : règles maison (42) rc=0, cohésion rc=0, inscription des tests (2 056) rc=0, accent (408) rc=0.
- Prochain lot recommandé : fusion de #19864 par le porteur (CI des PR gelée), puis #19928, #19929, plafond
  `untilStopped`, #19682 une fois décidée.

## 2026-11-20 — réveil de 7 h : #19864 fusionnée, lot #19928 ouvert

- #19864 fusionnée dans `dev` par le porteur (64516f16b, tête 72c172d19), #19767 fermée. L'entrée de journal de 5 h,
  poussée après la fusion, est reprise ici.
- Lot : #19928 (une relecture en échec garde l'appareil muet), branche `claude/cercles-19928-panne-muette`.
- Mise en œuvre (6bc63e9da, 4d6e43a03), iOS et Android : la relecture de `/relations/locations/mine` a trois issues — une réponse lève l'attente, un 404 (passerelle d'avant la route) aussi, toute autre erreur est une PANNE qui garde l'appareil muet et rejoue la relecture toutes les 30 s. `reconcile` relit d'abord quand la liste n'est pas soldée ; sous attente, un retrait en attente part quand même (liste seule, sans position), et le suivi GPS s'arrête quand plus aucun destinataire ne reste. `wipe` remet l'attente à faux.
- Audit adversarial avant PR : F1 (retrait bloqué), F2 (GPS), F3 (rejeu après wipe), F4 (double relecture) corrigés dans 4d6e43a03 ; F5 (404 de Traefik pendant un déploiement) et F6 (« Arrêter » avant la relecture retire un ajout d'un autre appareil, antérieur au lot) → #19999 ; F7 → décision #19997.
- Gardes iOS rc=0 sur 4d6e43a03 (house_rules, cohesion, test_registration, accent). Swift et Kotlin ne compilent pas ici : preuve par ios.yml et android.yml en workflow_dispatch.
- Décisions ouvertes : #19682 (arrondi de startedAt), #19997 (adopter ou céder sans accusé de démarrage).
- Prochain lot : #19929, puis le plafond `untilStopped` de `listOnlyState`, puis #19999 ; #19682 et #19997 une fois tranchées.

## 2026-11-20 — réveil de 11 h : lot #20029 (404 d'un intermédiaire) → PR #20042

- Reprise : #20000 fusionnée (133a21ad2), #19928 fermée. Aucune PR de la routine ouverte. Lot : #20029, portage du
  commit 7657978cf (PR #20025 fermée en doublon) sur les sites purs de #20000.
- iOS `SharedLocationServedRead.answer` et Android `ownSharedLocationAnswer` : seul un 404 au message « Route GET:… not
  found » (Fastify, la passerelle n'a pas de `setNotFoundHandler`) vaut passerelle d'avant ; Traefik, portail captif,
  corps vide ⇒ panne, attente gardée. Android : `ApiError.servedMessage` additif, rempli dans `ApiCall.kt`.
- Témoins rouges poussés d'abord (8bc93b087), correctif e341b5182. Gardes iOS rc=0 (règles maison 42, cohésion,
  inscription 2 060, accent 408) ; tête contient `dev` 95ab23af5. CI des PR « skipped » : `ios.yml` et `android.yml`
  lancés en `workflow_dispatch` sur la branche.
- Prochain lot : #19929 (sauvegarde restaurée : liste effacée et reconstruite, identifiant en empreinte), puis le plafond
  `untilStopped` de `listOnlyState`, puis #19999 ; #19682 et #19997 attendent la décision du porteur.

## 2026-11-20 — réveil de 13 h : #20042 recalée sur dev (a34b3344b)

- Reprise : #20042 ouverte, tête b76cdc840. `android.yml` (run 44726589593) VERT sur e341b5182. `ios.yml` (run
  44726594411) ROUGE au build des tests, hors lot : `SafetyAlertNotificationTests.swift:16` appelait depuis un contexte
  non isolé une méthode `@MainActor` — défaut de `dev`, corrigé sur `dev` par 9d55ba1d6.
- `origin/dev` (a34b3344b) fusionnée à la main, sans conflit. Gardes iOS sur l'arbre fusionné : règles maison, cohésion,
  inscription des tests, accent, toutes rc=0. `ios.yml` relancé en `workflow_dispatch` sur la nouvelle tête.
- Prochain lot : fusion de #20042, puis #19929, le plafond `untilStopped` de `listOnlyState`, #19999 ; #19682 et
  #19997 attendent la décision du porteur.
## 2026-11-20 — réveil de 13 h : lot #19929 (sauvegarde restaurée)

- Reprise : #20000 (#19928, relecture en échec gardée muette) fusionnée dans `dev` à 10 h. Le réveil du 16 nov. s'était
  arrêté sur une limite d'usage avant tout travail.
- Lot : #19929, branche `claude/cercles-19929-restauration`. iOS + SDK seulement : Android a la sauvegarde désactivée
  (`allowBackup="false"` + `data_extraction_rules.xml`), aucune liste ne peut y être restaurée.
- Mise en œuvre : une liste écrite par un autre appareil s'EFFACE (liste, marque « reçue », démarrage, retraits en
  attente) et la relecture du partage servi la reconstruit, reçue — plus d'arrêt ni de liste périmée partis d'une
  sauvegarde. La marque d'appareil devient `SHA256(compte:installation)` ; une marque en clair d'avant vaut pour cet
  appareil et se réécrit. `PushDeviceIdentity.settledInstallationId` rend `nil` quand le trousseau ne tient pas
  l'identifiant : rien n'est jugé, la marque ne bouge pas. Branchement de production testé
  (`SharedLocationSharingHolder.rosterStore`).
- Témoins : `SharedLocationRestoredBackupTests` (nouveau fichier, la section #19767 de `SharedLocationSharingSyncTests`
  y a déménagé pour tenir le budget), `PushDeviceIdentityTests`.
- Audit adversarial : non bloquant. Empreinte préfixée par un domaine (F4) dans le lot. Suivis ouverts : #20054 (M1, un
  arrêt en attente perdu en silence si l'appareil légitime ne se reconnaît plus), #20055 (M2, antérieur : « Partager »
  avant la première relecture remplace la liste de l'autre appareil), #20056 (F1, sauvegarde d'avant toute marque).
  F2 (identifiant absent ⇒ rien n'est jugé) assumé, comme avant le lot.
- Prochain lot : fusion de cette PR (CI iOS en `workflow_dispatch`), puis #20055 (iOS + Android), le plafond
  `untilStopped` de `listOnlyState`, #19999, #20054 ; #19682 et #19997 une fois tranchées.

## 2026-11-20 — réveil de 17 h : lot #19999 + #20055 (relire avant de composer)

- Reprise : #20042 et #20058 fusionnées dans `dev` (#20029 et #19929 fermées). Aucune PR de la routine ouverte. Le
  plafond `untilStopped` de `listOnlyState` reste sans objet : la passerelle ne sert pas encore « jusqu'à l'arrêt ».
- Lot : #19999 et #20055 ensemble (même mécanisme), branche `claude/cercles-19999-relire-avant-de-composer`, iOS +
  Android. Un drapeau `hasReadServed` (vrai tant que la DERNIÈRE relecture a répondu) : « Partager » relit d'abord si
  besoin et réunit le partage servi, une panne le refuse (`offline`) ; « Arrêter » relit d'abord et se compose sur la
  liste servie, une panne garde #19928 (le retrait part, fail-closed) ; une passerelle d'avant ne lève pas l'attente
  avant un « Arrêter ».
- Audit adversarial : non bloquant. Corrigés dans le lot : M1 (une relecture en panne remet le drapeau à faux), M3 (un
  appareil récepteur ne republie jamais SA position dans le repli d'avant la liste seule), F1 (motif juste sur un
  changement de compte), F2 (relire avant de juger les capacités), F3 (« Arrêter » d'une personne déjà retirée
  n'envoie rien), F5 (témoins). Suivis ouverts : #20087 (M2, la relecture ne dit pas la source : un point choisi peut
  devenir position réelle), #20086 (facette de #20055 : état « partage lancé ailleurs, en attente de connexion »).
- Gardes iOS rc=0 (règles maison 42, cohésion, inscription 2 063, accent 408) ; Swift et Kotlin prouvés par `ios.yml`
  et `android.yml` en `workflow_dispatch`.
- Prochain lot : fusion de cette PR, puis #20054, #20056, #20086, #20087 ; #19682 et #19997 attendent la décision du
  porteur.

## 2026-11-20 — réveil de 23 h : lot #19557 (moitié serveur) + #20087 (moitié serveur)

- Reprise : #20088 fusionnée (b79d1f006), #19999 et #20055 fermées. Aucune PR de la routine ouverte.
- Constat : #20087 suppose une source que la passerelle ne connaissait pas — #19557 (point choisi à la main) n'avait
  jamais été servi côté passerelle. Lot : les deux moitiés SERVEUR ensemble, branche
  `claude/cercles-20087-source-servie`.
- Mise en œuvre : `location:share-start` accepte `source?: 'device' | 'manual'` (absente ⇒ device ; manual exige une
  position) ; l'état scellé garde `source: 'manual'`, la liste seule la reprend ; `GET /relations/locations/mine` sert
  `source` (additif) ; `location:share-update` sur un point choisi rend `SHARED_LOCATION_FIXED_POINT` sans rien écrire ni
  servir. Le lecteur ne reçoit rien de la source.
- `acceptsManualSource` n'est PAS annoncé : « Choisir sur la carte » reste éteint tant qu'iOS et Android ne lisent pas la
  source servie (moitié client de #20087) — sinon le défaut M2 deviendrait atteignable.
- Audit adversarial : non bloquant tant que `acceptsManualSource` n'est pas annoncé. Corrigés dans le lot : un
  démarrage AVEC position SANS source ne remplace plus un point choisi (`FIXED_POINT` ; « device » doit être dit), et un
  point choisi ne garde ni mouvement ni précision réelle. Suivi #20115 (sortie du fantôme muette pour un point choisi,
  courses mise à jour / démarrage), à solder AVANT l'annonce.
- Prochain lot : moitié client de #20087 (iOS + Android : un partage servi `manual` réuni ne republie jamais la position
  de l'appareil ; « Partager » depuis l'appareil devant un point choisi demande), puis #20115, puis annoncer
  `acceptsManualSource` (#19557), puis #20054, #20056, #20086.

## 2026-11-21 — réveil de 1 h : moitié client de #20087 (iOS)

- Reprise : #20116 fusionnée (7495763da). Aucune PR de la routine ouverte. Branche `claude/cercles-20087-source-cliente`
  réservée avant toute écriture.
- Constat : seul iOS sait CHOISIR un point (#19558). Le web et Android ne connaissent pas le point choisi ; la passerelle
  les protège déjà (`SHARED_LOCATION_FIXED_POINT`), il leur manque de lire la source et de demander : suivi #20126.
- Lot iOS : le SDK lit `source` dans la relecture (inconnue ⇒ manual, absente ⇒ rien ne change) et ne fait voyager
  `source: 'device'` que pour REMPLACER un point choisi (`replacesChosenPoint`) — une passerelle d'avant #20116 refuse la
  clé, et seule une passerelle qui sert un point peut en avoir un à remplacer. La liste réunie suit la source servie ; un
  point choisi ailleurs arrête le suivi de l'appareil ; « Partager » devant un point choisi rend `.replacesChosenPoint`
  sans rien envoyer ni demander à l'appareil, la feuille demande « Montrer ta position réelle ? » puis rejoue.
- Le fichier de test neuf n'a pas pu être inscrit au projet (`ios-xcodegen-sync` désactivé) : la classe
  `SharedLocationServedSourceTests` vit dans `SharedLocationRestoredBackupTests.swift`.
- Gardes iOS : règles maison 42, cohésion rc=0, inscription 2 063, localisation, accent 168/408 ; vitest
  `packages/shared/__tests__/ci` 216/216. Swift prouvé par `ios.yml` + `sdk-tests.yml` en `workflow_dispatch`.
- PR #20128. Suivis ouverts par l'audit : #20127 (confirmation liée au partage montré), commentaire sur #20115.

## 2026-11-21 — réveil de 5 h : fusion de #20128

- Reprise : `ios.yml` (44850786079), `sdk-tests.yml` (44850788553) et `ci.yml` (44850791219) VERTS sur ccd964264.
  Une autre session a fusionné `dev` dans la branche à 4 h 47 (c2185cdfc) ; `origin/dev` (36970d31d, trois commits de
  passerelle sans recouvrement) refusionnée à la main, sans conflit.
- Gardes iOS sur l'arbre fusionné : règles maison 42, cohésion rc=0, inscription 2 063, accent 168/408, catalogue JSON
  valide. PR fusionnée dans `dev`, #20087 fermée à la main.
- Prochain lot : #20115 (sortie du fantôme pour un point choisi) avant d'annoncer `acceptsManualSource` (#19557), puis
  #20126 (web + Android), #20127, #20054, #20056, #20086.

## 2026-11-21 — réveil de 7 h : lot #20115 (point choisi après le fantôme, courses)

- Reprise : aucune PR de la routine ouverte. Branche `claude/cercles-20115-fantome-point-choisi`, passerelle seule.
- Mise en œuvre : à la sortie du fantôme, un point choisi est REJOUÉ (daté de la sortie) au direct et au rattrapage, et
  sa fin redevient à dire ; une position d'appareil reste retenue jusqu'à la suivante. `fanOut` relit le pointeur avant
  d'émettre : une mise à jour dont l'éventail est plus lent qu'un point choisi ne sert plus rien. Un démarrage avec
  position SANS source prend le pointeur à condition qu'il désigne encore la session lue (`claim` avec `expected`,
  script Lua) : un point choisi arrivé entre-temps n'est jamais remplacé, même un instant (`FIXED_POINT`), et un partage
  d'appareil qui l'a devancé fait relire et retenter (3 essais, puis `UNAVAILABLE`).
- Audit adversarial : BLOQUANT sur la première version (une restauration après coup du point choisi défaisait un
  remplacement `device` légitime) ; corrigé par la prise conditionnelle, qui supprime la fenêtre. Mineurs actés : la
  sortie du fantôme d'un point choisi part tout de suite (un lecteur flouté apprend l'heure de sortie à l'arrivée de
  l'événement — c'est ce que l'issue demande) ; la fenêtre résiduelle entre la relecture du pointeur et l'envoi est
  antérieure au lot et rattrapée par `reconcile`.
- Gates : suites position 32/32 (401 tests), `tsc` 0, mutation de la prise conditionnelle ⇒ 2 témoins rouges, script
  Lua joué une fois contre un vrai `redis-server` local (hors dépôt).
- Prochain lot : annoncer `acceptsManualSource` (#19557, avec les préconditions du commentaire de #20115 : schéma de
  `ownSharedLocationSchema`, plancher `MIN_APP_VERSION`), puis #20126 (web + Android), #20127, #20054, #20056, #20086.

## 2026-11-21 — réveil de 11 h : annoncer « Choisir sur la carte » (#19557)

- Reprise : aucune PR de la routine ouverte ; #20173 (#20115) fusionnée par le porteur à 9 h 46. Aucune branche vivante
  n'écrit `routes/relations/locations.ts`.
- Lot : la dernière moitié de #19557. `GET /relations/locations/mine` sert `acceptsManualSource: true`, avec ou sans
  partage en cours (`servedOwnSharedLocation`), et `ownSharedLocationSchema` le DÉCLARE — sans quoi fast-json-stringify
  l'aurait retiré (précondition 1 du commentaire de #20115). `SharedLocationOwnSnapshot` le porte, additif.
- Précondition 2 (plancher `MIN_APP_VERSION`) : NON posé, par mesure. « Choisir sur la carte » (#19558, 18 nov.) et la
  lecture de la source (#20128, 21 nov.) sont tous deux sous `MARKETING_VERSION` 1.1.8 : aucun plancher de version ne les
  sépare. Le seul effet d'un binaire intermédiaire est un échec générique devant un point choisi depuis un AUTRE appareil
  (la passerelle refuse, `FIXED_POINT`) — aucune fuite. Précondition 3 (repli `INVALID`) : sans objet dès l'annonce,
  le client ne proposant le point choisi qu'à une passerelle qui l'accepte.
- Web et Android ne lisent pas l'annonce (ils n'ont pas de point choisi) : leur part reste #20126.
- Gates : témoin de sérialisation 3/3, mutation (clé retirée du schéma) ⇒ 2 rouges ; suites position + routes de
  relations 35 suites / 444 tests ; `tsc` 0.
- Prochain lot : #20126 (web + Android lisent la source servie), puis #20127, #20054, #20056, #20086.

## 2026-11-21 — réveil de 13 h : la moitié web de #20126 (un point choisi ne se remplace pas en silence)

- Reprise : la PR #20202 (#19557, annoncer `acceptsManualSource`) était menée par une autre session vivante (fusion de
  `dev` et CI relancée à 13 h 03) : ce réveil n'y touche pas. Aucune branche n'écrit `apps/web/src/lib/shared-locations`.
- Lot : web seul de #20126. Le web lit `source` sur `GET /relations/locations/mine` (inconnue ⇒ `manual`, absente ⇒
  rien) ; devant un point choisi l'onglet ne suit plus la position et n'en envoie aucune (marque `<clé>.fixedPoint`,
  relue au rechargement et entre onglets) ; un relevé refusé `FIXED_POINT` coupe le suivi et relit ; « Partager » rend
  `replaces-chosen-point` sans demander de relevé ni rien envoyer, la fiche demande « Montrer votre position réelle ? »
  (« Garder le point choisi » en premier), puis rejoue le même choix avec `source: 'device'`. Un démarrage refusé
  `FIXED_POINT` (point choisi ailleurs pendant l'envoi) relit et demande. « Arrêter » devant un point choisi republie la
  liste seule et ne se replie jamais sur la position de l'appareil.
- Audit adversarial : non bloquant. Corrigé dans le lot : trois gardes de l'onglet que la passerelle seule tenait ont
  leur témoin (relevé en vol après la marque, suivi non rallumé par un retrait, aucun repli sur la position devant un
  point choisi) ; une source absente lève la marque (une passerelle d'avant ne sert jamais de point choisi) ; un refus
  `FIXED_POINT` à l'envoi rend `received` tel qu'il était ; la liste vidée par l'échéance lève la marque ; l'écran
  redemande au lieu d'afficher le titre en toast. Noté : une source inconnue se lit `manual` (choix fail-closed).
- Android : issue de suivi #20212 (même milestone). La confirmation liée au partage montré et les noms concernés restent
  #20127.
- Gates : `bun test` complet 34 928 verts, 2 rouges dont 1 hérité (`act-leak-guard`, rouge sans le lot) et 1 corrigé
  dans le lot (cliquet des boutons sans réponse d'appui : `active:scale-[0.98]` sur les deux boutons neufs) ; `tsc` 0 ;
  `vite build` vert ; poids vert ; les gates navigateur (verbosité, Playwright) ne tournent pas en conteneur, ils se
  prouvent en CI.
- Prochain lot : #20212 (Android), puis #20127, #20054, #20056, #20086.

## 2026-11-21 — réveil de 15 h : Android lit la source servie (#20212)

- Reprise : la PR #20214 (moitié web de #20126) est menée par le réveil de 13 h, sa CI `ci.yml` en file depuis 14 h 27 :
  ce réveil n'y touche pas (un push annulerait le run) ; elle a été fusionnée dans `dev` pendant ce réveil (711e1cafc9).
  Aucune branche vivante n'écrit les chemins Android de la position.
- Lot : #20212, iso iOS (#20087) et web (#20126). `:core:model` lit `source` (inconnue ⇒ point choisi, absente ⇒ rien ne
  change), `SharedLocationRoster` garde le point choisi (survit au lancement, s'éteint sans personne), `FIXED_POINT` se lit,
  et seul un démarrage avec position ET accord porte `source: 'device'`. Le centre ne suit ni n'envoie devant un point
  choisi, ne republie jamais sa position en repli (tout s'arrête plutôt), et un refus `FIXED_POINT` (relevé ou démarrage)
  coupe le suivi et relit. La fiche d'un ami demande « Montrer ta position réelle ? », le choix fait attendant la réponse.
- Libellés : titre, confirmer et garder adoptés du catalogue iOS ; le message iOS (111 caractères en français) aurait
  fait monter le cliquet de verbosité d'`android:feature/profile` — il est remplacé par une phrase Android de moins de
  80 caractères dans les 7 langues.
- Gates locaux : `jvm-check` `:core:model` (`*SharedLocation*`, 7 classes dont la nouvelle, 0 échec), verbosité verte,
  chaînes générées à jour. Centre, ViewModel et Compose se prouvent par `android.yml` sur la PR.
- Prochain lot : #20127 (confirmation liée au partage montré, puis web et Android), #20054, #20056, #20086.

## 2026-11-21 — réveil de 17 h : la confirmation vaut pour le partage montré, sur iOS (#20127)

- Reprise : aucune PR de la routine ouverte ; #20230 (Android lit la source servie, #20212) fusionnée par le porteur à
  17 h 11. Aucune branche vivante n'écrit `apps/ios/Meeshy/Features/SharedLocation`.
- Lot : la moitié iOS de #20127 (iOS est la référence). La question « Montrer ta position réelle ? » porte
  `SharedLocationPointReplacement` — le `startedAt` servi (relu, ou rendu par l'accusé du démarrage) et ceux qui voient le
  point. La feuille le rend à `share(replacing:)` ; le centre RELIT alors le partage servi, même s'il l'a déjà lu, et ne
  fait partir la position réelle que si le démarrage est le même et que personne n'a été ajouté depuis (une personne
  sortie ne rend pas la réponse caduque) ; sinon rien ne part et la question se repose avec la liste à jour. Le message
  nomme trois personnes au plus, dans l'ordre de la feuille, puis « et N autres » (inconnus d'ici compris) — deux clés
  neuves en sept langues, dont une plurielle.
- Web et Android : issue de suivi #20248 (même milestone).
- Gates locaux : `check_localization.py`, `check_house_rules.sh` (42 règles), `check_cohesion_budget.sh`,
  `check_test_registration.sh`, couleurs codées en dur : verts. iOS ne compile pas en conteneur : preuve par la CI de la
  PR (`ios.yml`, `sdk-tests.yml` en `workflow_dispatch`).
- Prochain lot : #20248 (web + Android), puis #20054, #20056, #20086.

## 2026-11-21 — réveil de 21 h : la moitié web de #20248 (la confirmation vaut pour le partage montré)

- Reprise : la PR #20250 (moitié iOS de #20127, tête b4067fea0) attend sa CI iOS (build en cours depuis 21 h 11, tranches
  SDK en file) : ce réveil n'y pousse rien (un push annulerait le run). Aucune branche n'écrit les chemins web du lot.
- Lot : web de #20248, iso `SharedLocationPointReplacement` (#20127). `pointReplacementOps` (démarrage servi + ensemble
  des destinataires ; une personne sortie ne rend pas la réponse caduque) ; le centre garde `servedStart` (relecture et
  accusé) ; « Partager » devant un point choisi rend `{ kind: 'replaces-chosen-point', asked }`, et la réponse
  (`replacing`) relit le partage servi sous le verrou des onglets : un autre démarrage ou quelqu'un ajouté ⇒ rien ne
  part, la question se repose à jour ; relecture en panne ⇒ `offline`. La fiche nomme trois personnes au plus (l'ami
  de la fiche et les amis acceptés déjà en cache, sans requête), puis « et N autres personnes » ; 3 clés × 7 langues.
- Audit adversarial : non bloquant. Corrigé dans le lot : une question posée après un rechargement relit d'abord le
  démarrage servi (sinon une confirmation de trop) ; commentaire périmé. Le jeton ne voyage pas jusqu'à la passerelle
  (fenêtre d'un aller-retour, iso iOS) : c'est #20249.
- Gates : suites position + fiche 197/197 ; suite web complète 34 978 verts, 1 rouge hérité (`act-leak-guard`) ;
  `tsc` 0 ; `vite build` et poids verts ; mutation (démarrage ignoré) ⇒ 3 rouges. Les gates navigateur
  (`check-profile`, Playwright) ne tournent pas en conteneur.
- Android : reste à faire sous #20248. Prochain lot : #20250 à fusionner, puis Android de #20248, #20249, #20054, #20056.

## 2026-11-22 — réveil de 3 h : la moitié Android de #20248 (la confirmation vaut pour le partage montré)

- Reprise : la PR #20250 (moitié iOS de #20127, tête 37d0ba52d, `ci.yml` vert) attend toujours sa CI iOS et SDK, en file
  depuis 1 h 50 UTC (65 runs en file) : ce réveil n'y pousse rien (un push annulerait la file). Aucune branche n'écrit les
  chemins Android de la position.
- Lot : Android de #20248, iso `SharedLocationPointReplacement` (iOS #20127, web #20278). `:core:model` porte la question
  (démarrage servi + destinataires, une personne sortie tolérée) et son audience (trois noms au plus, puis le compte) ;
  `ReplacesChosenPoint` porte la question ; `share(replacing = …)` relit TOUJOURS le partage servi et la repose à jour si un
  autre démarrage a eu lieu ou si quelqu'un a été ajouté — rien ne part, aucun relevé n'est demandé ; relecture en panne ⇒
  `OFFLINE`. `servedStart` suit le dernier démarrage nommé (relu ou accusé), effacé au changement de compte et au `wipe`.
  La fiche nomme la personne de la fiche et les amis du carnet GARDÉ (`AcceptedContactsSource.cached`, aucune requête),
  puis « et N autres personnes » (`joinParticipantNames`, ICU, rendu public dans `sdk-ui`).
- Libellés : les clés iOS `messageNamed` / `others` ne sont pas encore sur `dev` (#20250 non fusionnée) : deux libellés
  Android écrits à la main, sous 80 caractères dans les 7 langues ; cliquet de verbosité vert, chaînes générées à jour.
- Gates locaux : `jvm-check` `:core:model` `*SharedLocationPointReplacement*` 6/6. Centre, ViewModel et Compose se
  prouvent par `android.yml` sur la PR.
- Audit adversarial : non bloquant. Corrigé dans le lot : une réponse prend la position AVANT de relire (iso le web ;
  iOS relit avant le relevé, et un point relancé ailleurs pendant l'attente du GPS serait écrasé), la fiche compose ses
  noms par une loi testée. Noté : la passerelle n'accepte pas de `startedAt` attendu (fenêtre d'un aller-retour, #20249) ;
  iOS et le web nomment un nom vide là où Android l'écarte.
- Prochain lot : fusionner #20250 dès sa CI iOS verte (fermer #20127 à la main), puis #20249, #20054, #20056.

## 2026-11-22 — réveil de 7 h : la moitié passerelle de #20249 (un démarrage nomme le partage qu'il remplace)

- Reprise : la PR #20309 (Android de #20248) a été fusionnée dans `dev` à 5 h 39 et #20248 est fermée. La PR #20250
  (iOS de #20127, tête 6935d929d) est menée par une autre session vivante, sa CI iOS et SDK en file depuis 5 h 43 : ce
  réveil n'y pousse rien. Aucune branche n'écrit les chemins du lot.
- Lot : passerelle de #20249. Un démarrage peut porter `expectedStartedAt` (le `startedAt` du partage MONTRÉ dans la
  confirmation « Montrer ta position réelle ? ») ; si le partage servi ne le porte plus (un autre appareil a démarré,
  ou plus de partage), la passerelle refuse `SHARED_LOCATION_STARTED_ELSEWHERE` sans rien appliquer. La prise est alors
  conditionnée au pointeur lu (#20115) et le nom se revérifie à chaque pointeur qui bouge ; une liste seule publiée
  ailleurs garde `startedAt`, donc le démarrage relit et passe. Clé additive, annoncée par `acceptsExpectedStart` sur
  `GET /relations/locations/mine` ; sans la clé, rien ne change.
- Audit adversarial : non bloquant. Corrigé dans le lot : deux démarrages dans la même milliseconde portaient le même
  `startedAt`, donc le même nom (la personne ajoutée ailleurs disparaissait encore) ; `startedAt` est désormais
  strictement postérieur à celui du partage remplacé, relu après la prise si le pointeur a bougé. Pour les lots clients :
  sur `INVALID` après avoir envoyé la clé, relire et redemander (jamais renvoyer sans la clé) ; renvoyer `startedAt` tel
  que servi ; `STARTED_ELSEWHERE` couvre aussi « le partage s'est arrêté ».
- Gates : voir la PR. Clients (iOS, web, Android) : restent sous #20249, un lot chacun.
- Prochain lot : web de #20249 (envoyer la clé sur `acceptsExpectedStart`, relire et redemander sur `STARTED_ELSEWHERE`),
  puis Android, puis iOS après #20250 ; #20308, #20054, #20056.

## 2026-11-22 — réveil de 9 h : la moitié web de #20249 (une réponse nomme le partage montré)

- Reprise : #20250 (iOS de #20127) et #20329 (passerelle de #20249) ont été fusionnées dans `dev` ; #20127 est fermée.
  Aucune branche vivante n'écrit les chemins web de la position.
- Lot : web de #20249. La relecture décode `acceptsExpectedStart` ; une réponse à « Montrer votre position réelle ? »
  nomme le partage montré (`expectedStartedAt`, le `startedAt` tel que servi, seulement s'il a la forme ISO que la
  passerelle relit). Sur `STARTED_ELSEWHERE` (partage arrêté compris) ou `INVALID` d'une charge PARTIE avec la clé, rien
  n'a été appliqué : l'onglet relit, repose la question à jour si un point choisi est encore montré, sinon rend l'échec
  sans rien relancer (la décision prise ailleurs tient). Jamais renvoyé sans la clé ; le repli sans échéances la garde.
- Audit adversarial : non bloquant pour la vie privée. Corrigé dans le lot : un refus LOCAL (au-delà du plafond de
  destinataires) relançait la même question en boucle ; un `startedAt` servi non ISO aurait bouclé de même. Noté, non
  corrigé : un refus certain efface encore `publishedStart` (comme `fixed-point` avant le lot, sans fuite) ; un partage
  servi sans `startedAt` part sans la clé (sessions d'avant #18580, comportement d'avant).
- Gates : voir la PR. Android et iOS de #20249 : un lot chacun.
- Prochain lot : Android de #20249, puis iOS ; #20308, #20054, #20056.

## 2026-11-22 — réveil de 13 h : la moitié Android de #20249 (une réponse nomme le partage montré)

- Reprise : #20345 (web de #20249) a été fusionnée dans `dev` à 12 h 41 ; aucune PR de la routine ouverte, aucune
  branche vivante n'écrit les chemins Android de la position.
- Lot : Android de #20249, iso #20345. La relecture lit `acceptsExpectedStart` (seul un booléen vrai compte) ; le
  remplacement d'un point choisi porte `expectedStartedAt` (le `startedAt` tel que servi, forme ISO seulement), le repli
  sans échéances le garde. Sur `STARTED_ELSEWHERE` (arrêt compris) ou `INVALID` d'une charge partie avec la clé, rien
  n'a été écrit : l'appareil relit, repose la question à jour si un point choisi est encore montré, sinon rend le refus
  sans rien relancer ; une relecture en panne rend « hors ligne ». Une passerelle relue sans l'annonce fait repartir la
  charge d'avant. La fiche affiche le nouveau refus comme les autres échecs : aucune chaîne nouvelle.
- Banc d'essai : `SharingDevice` sort de `SharedLocationSharingSyncTest` (1153 → 1052 lignes) et gagne `onStart` (ce qui
  se passe ailleurs pendant que le démarrage voyage).
- Gates : modèles Kotlin (`jvm-check`, `SharedLocation*`) verts ; le centre se prouve par `android.yml` sur la PR.
- Prochain lot : iOS de #20249, puis #20308, #20054, #20056.

## 2026-11-22 — réveil de 15 h : la moitié iOS de #20249 (une réponse nomme le partage montré)

- Reprise : #20398 (Android de #20249) a été fusionnée dans `dev` à 14 h 48 ; aucune PR de la routine ouverte, aucune
  branche vivante n'écrit les chemins iOS de la position.
- Lot : iOS de #20249, iso #20345 (web) et #20398 (Android). SDK : `SharedLocationOwnSnapshot.acceptsExpectedStart` (seul
  un booléen vrai compte), `SharedLocationStartRequest.expectedStartedAt` (ne part qu'avec `replacesChosenPoint` et une
  position, gardé par les replis sans options, sans échéances et sans mouvement), `SharedLocationSendOutcome.startedElsewhere`,
  `SharedLocationWireInstant.isWire` (forme `toISOString` seulement). Centre : la réponse nomme le `startedAt` servi sur
  `acceptsExpectedStart` ; sur `STARTED_ELSEWHERE` (arrêt compris) ou `INVALID` d'une charge partie avec la clé, rien n'a
  été écrit : l'appareil relit, repose la question à jour si un point choisi est encore montré, sinon rend le refus sans
  rien relancer ; une relecture en panne rend « hors ligne » ; un `INVALID` que la clé n'explique pas se dit sans reposer
  la même question. Aucune chaîne nouvelle.
- Gates : voir la PR (gardes iOS texte et `packages/shared/__tests__/ci` verts ; compilation et tests par la CI iOS).
- Avec ce lot, les trois clients et la passerelle portent #20249 : l'issue se ferme à la fusion.
- Prochain lot : #20308, puis #20054, #20056.

## 2026-11-22 — réveil de 19 h : la moitié web de #20416 et de #20308

- Reprise : #20417 (iOS de #20249) attend toujours un Mac (construction iOS en file depuis 16 h, tranche 2 du SDK
  aussi ; sa tranche 6 rouge vient de témoins étrangers corrigés sur `dev` par b35a94491). Rien à pousser sur sa branche
  tant que ces envois attendent : un nouvel envoi remplacerait celui en file. Ce réveil prend la moitié WEB de #20416 et
  de #20308, qui ne touche aucun chemin iOS.
- Lot : un refus certain (`invalid`, `fixed-point`, `started-elsewhere`, tous rendus par la passerelle avant toute
  écriture) ne fait plus oublier `publishedStart` ; seul un refus douteux (accusé perdu, panne) l'efface encore. Avant,
  un « démarré ailleurs » faisait adopter le partage de l'autre appareil comme celui d'ici, et deux appareils publiaient.
  Un nom vide ou blanc ne se nomme plus dans « Montrer votre position réelle ? » (iso Android).
- Point 1 de #20416 tranché côté passerelle : `/mine` et le démarrage relisent par le même pointeur et la même
  ouverture ; un témoin prouve que tout partage nommé par la relecture est accepté par un démarrage qui le nomme (point
  frais, liste seule republiée, échéance par personne passée, terme à 1 ms). Un terme atteint ENTRE relecture et
  démarrage rend un refus légitime, et la relecture ne nomme alors plus rien : pas de boucle.
- Audit adversarial : non bloquant. Noté : `NOTHING_WRITTEN` est une liste écrite à la main, sans lien testé avec les
  sites de la passerelle.
- Gates : web `bun test` 35 167 verts, 1 rouge hérité (`act-leak-guard`) ; `tsc` web et passerelle à 0 ; passerelle
  `sharedLocationRelay.demarrage-attendu` 14/14.
- Reste : iOS et Android de #20416 (point 2) et iOS de #20308, après la fusion de #20417.
- Prochain lot : fusionner #20417 quand ses Mac passent, fermer #20249 ; puis iOS + Android de #20416, iOS de #20308,
  #20054, #20056.

## 2026-11-22 — réveil de 21 h : la moitié Android de #20416 (point 2)

- Reprise : #20431 (web de #20416 et #20308) a été fusionnée dans `dev`. #20417 (iOS de #20249) est menée par une autre
  session vivante (merge de `dev` 3023fab02, SDK relancé à 20 h 54 UTC) : ce réveil n'y pousse rien. Aucune branche
  n'écrit les chemins Android de la position.
- Lot : Android de #20416, point 2, iso #20431. Un refus certain (`INVALID`, `FIXED_POINT`, `STARTED_ELSEWHERE`, rendus
  par la passerelle avant toute écriture) ne fait plus oublier `publishedStart` ; un refus douteux l'oublie encore. Avant,
  un « démarré ailleurs » faisait prendre le partage de l'autre appareil pour celui d'ici. Le point 1 de #20416 est
  tranché côté passerelle (#20431) ; Android n'a pas le défaut de #20308 (il écarte déjà un nom vide).
- Audit adversarial : non bloquant. Vérifié dans la passerelle : les trois refus sortent avant toute écriture, ou après
  suppression d'une session jamais pointée (sinon `UNAVAILABLE`, refus douteux) ; le repli sans échéances ne change rien.
- Gates : `sdk-core` ne se construit pas en conteneur (dépôt libsignal refusé) : `android.yml` sur la PR fait foi.
- Reste : iOS de #20416 (point 2) et de #20308, après la fusion de #20417.
- Prochain lot : fusionner #20417 et fermer #20249 ; puis iOS de #20416 et #20308 ; #20054, #20056.

## 2026-11-22 — réveil de 23 h : web de #19883 (personne ne cache personne sur la carte)

- Reprise : #20441 (Android de #20416) fusionnée. #20417 (iOS de #20249) est menée par une autre session (3023fab02,
  iOS et SDK en file depuis 20 h 54 UTC) : ce réveil n'y pousse rien. Les lots iOS de #20416, #20308, #20054 attendent
  sa fusion (mêmes fichiers).
- Lot : web de #19883, iso `LocationMapFan.spread` (iOS). À la précision « ville », toutes les positions servies
  tombaient au même centre et une seule épingle restait visible. `spreadPins` (`apps/web/src/lib/map/fan.ts`) ouvre en
  éventail les épingles qui se recouvrent (écart ≥ diamètre + 4 px), stable quel que soit l'ordre servi ; le flou reste
  centré sur la position SERVIE, chaque épingle garde le cercle de SA personne. Rien de nouveau ne part du serveur.
- Audit adversarial : non requis (affichage pur de positions déjà servies, aucun accès ni chiffrement touché).
- Gates : web `bun test` 35 179 verts, 2 rouges hérités (focal-row, act-leak-guard) ; `tsc` web 0.
- Reste : Android de #19883 = #19884.
- Prochain lot : fusionner #20417 et fermer #20249 ; puis iOS de #20416 / #20308, #19884, #20054, #20056.

## 2026-11-23 — réveil de 01 h : Android de #19883 (#19884, personne ne cache personne sur la carte)

- Reprise : #20449 (web de #19883) fusionnée, #19883 fermée. #20417 (iOS de #20249) est toujours menée par une autre
  session (3023fab02, iOS et SDK en file depuis 20 h 54 UTC) : ce réveil n'y pousse rien. Aucune branche n'écrit les
  chemins de la carte Android.
- Lot : #19884, iso `LocationMapFan.spread` (iOS) et `spreadPins` (web). `SharedLocationsFan` (`:core:model`) ouvre en
  éventail les épingles qui se recouvrent à l'écran et les repose sur la projection `SlippyMap` du zoom courant ; une
  épingle seule garde exactement sa position servie. La carte plein écran et la section de la fiche des cercles ne
  superposent plus leurs épingles (décalage de 6 dp). Rien de nouveau ne part du serveur.
- Audit adversarial : non requis (affichage pur de positions déjà servies).
- Gates : `jvm-check -PjvmCheckModelOnly` `SharedLocationsFanTest` 6/6 (rouge à la compilation avant le code),
  `SharedLocationsMapTest` 6/6 ; Compose prouvé par `android.yml` sur la PR #20463.
- Prochain lot : fusionner #20417 et fermer #20249 ; puis iOS de #20416 / #20308, #20054, #20056.

## 2026-11-27 — réveil de 13 h : web de #19888, chaque épingle dit ce que vit la personne

- Reprise : aucune PR de la routine ouverte. Le journal s'était arrêté le 2026-11-23 ; entre-temps, d'autres sessions
  ont fusionné l'alerte « un Sang s'approche » (#20540) et réservé `claude/cercles-20542-purge-alerte-sang` (#20542).
  #20514 (découpage iOS du partage de position, ouverte depuis le 2026-11-24) écrit les fichiers iOS de
  `SharedLocation/` : les lots iOS de #20416, #20308 et #20054 lui cèdent. #19682 attend toujours la décision du porteur.
- Lot : la part « épingles vivantes » de #19888, iso `PeerLiveOverlays` (iOS #19885). Chaque épingle de la carte des
  cercles porte l'écoute (bandeau défilant), la batterie, le téléphone injoignable (qui prime sur la batterie),
  « En appel » et l'alerte d'inactivité, lus dans leurs caches tels que servis à ce lecteur, et les dit dans le nom de
  l'épingle. `usePinLife` / `pinLifeLabel` (`apps/web/src/lib/shared-locations/pin-life.ts`). Rien de nouveau ne part
  du serveur ; aucune requête de plus.
- Audit adversarial : non requis (affichage de signaux déjà servis et déjà tronqués par la passerelle).
- Gates : témoins `shared-locations-map-pin-life` 7/7 (5 rouges avant le code) ; web `bun test` 35 585 verts, 1 rouge
  hérité (`act-leak-guard`) ; `tsc` web 0.
- Reste de #19888 : commandes dans la zone sûre, « Autour de toi » et la fiche rangeables, appui long ⇒ talkie,
  chrome lisible sur fond clair. La chute (#18748) n'a pas encore de glyphe d'avatar sur le web.
- Prochain lot : le reste de #19888 (feuilles rangeables + talkie à l'appui long) ; iOS de #20416 / #20308 / #20054
  dès que #20514 est fusionnée ou abandonnée.

## 2026-11-27 — réveil de 13 h (second run, même heure) : la liste dit la vie de la personne (#20658)

- Collision : ce run a écrit la même tranche de #19888 en parallèle du run ci-dessus, qui a fusionné le premier
  (867e62f8b, plus complet : appel et inactivité en plus). Selon la règle « celui qui a payé le second cède », ce run
  a repris la version de `dev` et n'a gardé que ce qu'elle ne faisait pas.
- Lot : #20658. La ligne de la liste des positions dit la même vie que le nom de l'épingle (`usePinLife` /
  `pinLifeLabel`), y compris pour une personne hors de l'emprise, dont l'épingle n'est pas posée.
- Gates : `shared-locations-map-pin-life` 9/9 (2 rouges avant le code), `shared-locations-map-view` vert ; `tsc` web 0.

## 2026-11-27 — réveil de 14 h : une alerte de proximité entre Sangs ne survit pas (#20542)

- Reprise : #20417 (iOS de #20249) fusionnée le 23/11, #20463 (Android de #19883) aussi. Aucune PR de la routine
  ouverte. Les lots iOS de position (#20416 point 2, #20308, #20054, #20056) touchent
  `SharedLocationSharingCenter.swift` et `SharedLocationRosterStore.swift`, que la PR brouillon #20514 (découpage par
  responsabilité, autre session) a déjà écrits : ce réveil cède et prend un lot serveur.
- Lot : #20542. L'effacement de l'historique retire toute alerte `blood_proximity` qui nomme le titulaire (chez tous ses
  Sangs) et celles de sa cloche ; retirer `location.proximity` à un Sang retire chez lui les alertes qui nomment le
  titulaire. Lignes supprimées puis annoncées (`notification:deleted`, révocation push). Index TTL PARTIEL sur
  `Notification.expiresAt` au seul type `blood_proximity` (`2026-11-27-notification-blood-proximity-ttl.mongodb.js`) :
  à jouer sur le staging ; en production, feu vert du porteur et sauvegarde vérifiée d'abord.
- PR : #20698 (vers `dev`). Suivis de l'audit : #20697.
- Prochain lot : #20514 fusionnée ou abandonnée ⇒ iOS de #20416 / #20308, #20054, #20056 ; sinon un lot web/serveur
  du jalon 2 (#20540 suites, #19888).

## 2026-11-27 — réveil de 13 h : web de #17990 (couper toutes les invitations « ensemble »)

- Reprise : #20417 (iOS de #20249) et #20463 (#19884) fusionnées le 2026-11-23 ; aucune PR de la routine ouverte.
  Les lots iOS de la position (#20416 point 2, #20308, #20054, #20056) restent cédés : #20514 (autre session, ouverte
  depuis le 2026-11-24) découpe `SharedLocationSharingCenter.swift` et ses voisins.
- #18539 constaté réglé sur `dev` (échéance arrondie à la seconde, témoins à `t + 5 ms` et `t + 999 ms`, fiche sur une
  horloge pilotée) : fermée avec la preuve.
- Lot : `notification.togetherEnabled` (#17023, déjà obéi par `guestReceivesInvitesFrom`) entre dans le port des
  réglages du web et dans « Notifications », juste après « Recevoir des Bring » : absent = reçues, écrit seul sous
  `notification`, optimiste avec retour arrière, sept langues. Le libellé dit « vos Proches ne peuvent plus vous
  inviter » et non « personne » : entre Sangs ayant donné l'accord du palier, la coupure ne ferme pas (#20361).
- Audit adversarial : non requis (une préférence de réception déjà gardée côté serveur, aucun accès ni chiffrement).
- Gates : web `bun test` 35 588 verts, 1 rouge hérité (`act-leak-guard`) ; `tsc` web 0 ; `build` 0 ;
  `check-settings` (quatorze bascules) et `check-interface-language` verts avec `CHROMIUM=/opt/pw-browsers/chromium-1243/…`
  ; `check-verbosity` vert après un relèvement motivé de `settings` (307 → 330, même convention que #20544). La CI des
  PR est gelée (`PR_CI_GEL`, jobs sautés) : la preuve du lot est locale.
- Reste : iOS #17988 et Android #17989 (même interrupteur) ; le talkie global (`talkieEnabled`) n'a pas d'interrupteur
  web non plus.
- Prochain lot : #17988 / #17989, ou les lots iOS de la position dès que #20514 est fusionnée.

## 2026-11-27 — réveil de 14 h 40 : web de #20700 (couper le talkie de tous ses Proches)

- Reprise : le run précédent de ce fil avait été coupé le 26/11 sans rien pousser. Aucune PR de la routine à finir dans
  ce fil ; #20686, #20693, #20696 et #20698 sont fusionnées. Les lots iOS et Android (#17988, #17989, position) restent
  cédés : la CI des PR est gelée (`PR_CI_GEL`), donc un lot natif ne se prouve pas avant fusion, et #20514 découpe
  encore les fichiers iOS de la position.
- Lot : `notification.talkieEnabled` (#14407, déjà obéi par `talkieGate`) entre dans le port des réglages du web et dans
  « Notifications », juste après « Recevoir les invitations « ensemble » » : absent = reçu, écrit seul sous
  `notification`, optimiste avec retour arrière, sept langues. La légende dit « vos Proches ne peuvent plus vous
  parler » : entre Sangs ayant donné l'accord du palier, la coupure ne ferme pas (#20361).
- Audit adversarial : non requis (une préférence de réception déjà gardée côté serveur, aucun accès ni chiffrement).
- Gates : témoins rouges (12) puis verts ; web `bun test` 35 607 verts, 1 rouge hérité (`act-leak-guard`) ; `tsc` web 0 ;
  `build` 0 ; `check-settings` (quinze bascules) et `check-interface-language` verts ; `check-verbosity` vert après un
  relèvement motivé de `settings` (330 → 352, même convention que #17990).
- Reste : iOS et Android du même interrupteur = #20707.
- Prochain lot : #17988 / #17989 / #20707 quand la CI des PR est rouverte, ou un lot web/serveur du jalon 2.

## 2026-11-27 — réveil de 14 h 36 : web de #19888, l'appui long sur un Proche ou un Sang lui parle par talkie

- Reprise : #20698 (#20542) fusionnée. Le suivi #20697 (retrait des alertes de proximité sur les autres chemins) est
  cédé : la PR brouillon #20691, d'une autre session, écrit `bloodRitual.ts` et `ritualShareWithdrawal.ts`.
- Lot : la part « talkie à l'appui long » de #19888, iso `TalkieLongHoldModifier` (iOS #19885). Un toucher sur
  l'épingle choisit toujours la personne ; tenu 350 ms, l'appui ouvre la voix, qui part tant que le doigt (ou Espace)
  reste posé, et le relâcher ne choisit personne. Proposé seulement sur le cercle SERVI Proche ou Sang ; un
  `TALKIE_NOT_ALLOWED` retire la personne ; téléphone injoignable ⇒ message vocal (#20241). Un émetteur pour toute la
  carte (`useSharedLocationsMapTalkie`), le geste dans `createLongHold` (`lib/talkie/talkie-long-hold.ts`). Rien de
  nouveau ne part du serveur : le talkie existant, rejugé à chaque appui.
- Audit adversarial : non requis (aucun nouveau chemin de données ; la passerelle juge le talkie comme avant).
- Reste de #19888 : commandes dans la zone sûre, feuilles « Autour de toi » et fiche rangeables, chrome sur fond clair.
- Prochain lot : le reste de #19888 ; iOS de #20416 / #20308 / #20054 dès que #20514 est fusionnée ou abandonnée ;
  #20697 si #20691 est abandonnée.

## 2026-11-27 — réveil de 13 h : Android du mouvement sur la carte (#20665, tranche de #19887)

- Reprise : #20417 (iOS de #20249) et #20463 (#19884) fusionnées. Aucune PR de la routine ouverte. D'autres sessions
  vivantes tiennent l'iOS de #20416 (`claude/cercles-20416-ios*`), le web de la carte (`claude/cercles-19888-web`, #20658)
  et « Ensemble » web (#17990) ; #20514 découpe `SharedLocationSharingCenter.swift` : les lots iOS #20308, #20054,
  #20056 attendent.
- Lot : #20665 (ouverte ce réveil). Android décode `motion`, le garde jusqu'à l'épingle, le vieillit à 5 min, ne
  dessine pas l'immobile ; glyphe sur l'épingle (plein écran et fiche), mot dans TalkBack et dans « Autour de toi ».
  Iso `LocationMotionGlyph` (iOS). Quatre rôles `MeeshyIcons`, quatre chaînes générées du catalogue iOS.
- Audit adversarial : non requis (affichage d'un champ déjà tronqué par la passerelle).
- Gates : `jvm-check -PjvmCheckModelOnly` `SharedLocationMotionTest` 6/6 (rouge à la compilation avant le code),
  `SharedLocationsMapTest` 6/6, `SharedLocationTest` 12/12 ; i18n `--check` et verbosité verts ; Compose par
  `android.yml` sur la PR #20690.
- Suivi ouvert : #20692 (Android capte et envoie son mouvement).
- Prochain lot : fusionner #20690 ; puis #20692, ou les lots iOS de position une fois #20514 et `cercles-20416-ios` fusionnés.
