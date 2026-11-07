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

## 2026-11-07 — réveil 4 : le talkie reçu sur le web (`proche-talkie@web`, #16638)

- Reprise : #16624 (présence sur l'écran du Bring iOS) est menée par le réveil 2, encore actif ; #16617 (envoyer et
  bloquer le Bring sur Android) est réservée par le réveil 3 (branche `claude/cercles-bring-android-envoyer`). Ce
  réveil n'avait rien écrit : il cède les deux et prend le talkie (#13935).
- Lot choisi : la RÉCEPTION du talkie sur le web et « Couper son talkie » sur la fiche d'un lien (#16638).
