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
