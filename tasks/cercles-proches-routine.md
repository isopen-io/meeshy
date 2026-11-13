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
