# Les cibles de la v3.1 — l'app iOS, drapeaux bêta ACTIVÉS

> **Source de vérité des phases Cadrer, Concevoir et Spécifier du chantier**
> (`meeshy-web-v3-bout-en-bout`, source 0 du socle). Issue #5672, décision D-20
> (`../decisions.md`). Produit le **2026-09-08** sur `claude/web-v3-parite`.
> Ce dossier PRIME sur toute spécification antérieure et sur toute capture
> faite drapeaux éteints.

## Pourquoi ce dossier existe

Directive porteur du 2026-09-08 : *« Il faut re-analyser la vue de Meeshy avec
les dernières features activées car c'est la cible : la vue Lentille, messages
Focal, Scripts et Bulle ! Il faut refaire une analyse avant implémentation. »*
Étendue le même jour : *« Si c'est possible d'avoir résumé et rivière tout de
suite alors les intégrer. »* Et précisée : *« dans cette version pas besoin de
[l'interrupteur bêta] ! par défaut la lentille est là et la conversation focal
aussi avec possibilité des choix en script ou bulle »*.

Le tour précédent avait posé ses cibles iOS **drapeaux éteints** — liste en
cartes, fil sans puce de mode — et ses spécifications avaient été écrites
depuis le MONTAGE des écrans, pas depuis le dossier de la feature. D-7 et D-9
appelaient cela « écart assumé avec iOS ». Ce n'était pas la cible.

iOS porte trois drapeaux indépendants (`lentille_list`, `reading_modes`,
`riviere_mode` — `Lentille/Core/LentilleFeatureFlag.swift`) qu'un seul
interrupteur allume, Réglages › Bêta (`meeshy.pref.beta_features_enabled`), et
qu'une installation neuve a ÉTEINTS. **La v3.1 n'a ni drapeau ni programme
bêta** : la Lentille EST la liste, le fil S'OUVRE en Focal, l'utilisateur
choisit Script ou Bulles par la puce ; le seul réglage est le paramètre de
construction `VITE_READING_MODES` (#5674, D-20).

## Ce que contient le dossier

| fichier | ce que c'est |
|---|---|
| `captures.md` | le manifeste des captures : ce que chaque écran montre, le geste qui l'a produit, la procédure d'activation qui a marché, ce qui n'a pas pu être capturé et pourquoi, l'écart ON/OFF |
| `settings.beta.*` | **la preuve** : Réglages › Bêta, toggle ON, « Liste Lentille », « Modes de lecture », « Mode Rivière » actifs |
| `lentille.*`, `lentille.scrolled.*`, `lentille.section-pill.*` | la liste : sections épinglées `ÉPINGLES` / `AUJOURD'HUI`, ligne de pont ✦, 📌 et 🔕, rangée en sourdine atténuée ; au défilement, perspective et rangée ÉLUE (sticker « Classer », encoche `AUTO · Focal`, date absolue) ; bloc « Et maintenant ? » en queue |
| `thread.focal.*`, `thread.direct.focal.*` | le fil en Focal : puce `AUTO Focal`, pastille de non-lus sur le retour, `FocalConversationStartRow`, en-têtes d'identité et rangées plates ; la variante directe avec bouton d'appel |
| `thread.focal.scene.*`, `thread.focal.timestamps.*` | **ce qui distingue Focal de Script** : la scène armée au défilement soutenu (fond teinté, carte de la rangée élue, chip d'identité agrandi, tampon « Aujourd'hui 09:02 ✓ », pilule de jour flottante) et le révélé des heures et coches, masquées au repos |
| `thread.script.*` | Script : même rangée plate, sans scène — indiscernable de Focal sur 4 messages (voir la réserve dans `captures.md` § 4.5) |
| `thread.bubbles.*` | Bulles : rayon 18 uniforme, **sans queue**, envoyée indigo à droite, reçue lavande à gauche, pied avec icône de traduction, heure, coches, identité sur la dernière bulle d'une suite |
| `thread.summary.*` | Résumé Vivant : élu par l'orchestrateur seul en sombre (`AUTO Résumé`, > 25 non-lus, « Sur les 40 derniers messages »), choisi à la main en clair |
| `thread.river.*`, `river.scrolled.*`, `river.time-handle.*` | Rivière : rail de couloir, cartes bordées par la couleur de leur couloir, poignée du temps rendue pendant le geste |
| `reading-mode-sheet.*`, `thread.chip.*` | le menu d'appui long de la puce (Focal ✓ · Script · Bulles · Résumé · Rivière grisée sous 5 membres · Automatique) et la puce après retour en auto |
| `thread.message-menu.*` | l'appui long sur un message : rail de réactions, message soulevé avec son pied, Sélectionner · Traduire · Copier · Composer · Plus… |
| `*.a11y.txt` | l'arbre d'accessibilité complet de chaque capture (`idb ui describe-all`), pris au même instant |
| `seed.md` | les comptes jetables et les conversations semés sur STAGING (mots de passe hors dépôt) |
| `lentille.md` | l'analyse de la Lentille : drapeau, anatomie, lois, états, gestes, accessibilité, tableau iOS → web-v3, écarts, contradictions |
| `focal-script.md` | l'analyse de Focal et Script : loi, rangée plate, scène, puce et menu, états, gestes, tableau, écarts, contradictions |
| `bulle.md` | l'analyse de la Bulle : loi du mode, anatomie, fil en bulles, états, gestes, tableau, écarts, ce que la charte du README affirmait |
| `resume.md` | l'analyse de faisabilité du Résumé Vivant — verdict : **intégrable sous condition** (digest calculé localement, aucun endpoint ; il manque un corpus de fixtures qui rende le mode atteignable, et l'inversion du gate) |
| `riviere.md` | l'analyse de faisabilité de la Rivière — verdict : **intégrable sous condition** (la loi des couloirs est déjà en TypeScript partagé avec 61 vecteurs, le compte de membres que lit iOS est déjà servi ; la condition est la virtualisation du tracé, D-15) |

Chaque capture existe en `light` et en `dark`. Les captures sont réduites à
l'échelle logique de l'appareil (388 × 844) ; les originaux 3× vivent hors
dépôt.

## Comment ces cibles ont été prises

- Simulateur nommé par le porteur : « Meeshy Poc-Web-V31 »
  (`54438823-4ADC-4536-88D2-FC441395FA04`, iPhone 16 Pro, iOS 26.1).
- App iOS **native** (`Meeshy.app`, build 1800, version 1.0.7), construite par
  `./apps/ios/meeshy.sh build` — le chemin de `xcrun simctl listapps` finit par
  `Meeshy.app`, jamais `App.app` (la coque Capacitor partage l'identifiant
  `me.meeshy.app`).
- Activation, sans passer par l'interface :

  ```bash
  U=54438823-4ADC-4536-88D2-FC441395FA04
  xcrun simctl terminate $U me.meeshy.app
  xcrun simctl spawn $U defaults write me.meeshy.app meeshy.pref.beta_features_enabled -bool true
  xcrun simctl launch $U me.meeshy.app
  ```

  Un seul interrupteur suffit parce qu'aucune clé propre de drapeau n'existe
  sur une installation neuve : les trois retombent sur le programme bêta.
  La preuve est l'écran Réglages › Bêta, pas un `defaults read`.
- Compte de test `cible-web-trois` sur staging (jamais la production), et les
  données de `seed.md` : sept conversations avec un second compte (une
  épinglée, une en sourdine, des non-lus), puis un « Salon Rivière » à cinq
  membres et 40 messages — la Rivière exige `memberCount ≥ 5`, et la scène
  Focal comme le révélé des heures ne se déclenchent qu'au défilement soutenu.
- Clair et sombre : `xcrun simctl ui $U appearance light|dark`, puis relance
  de l'app.

## Ce que les analyses établissent — les écarts les plus visibles

Les tableaux complets (élément iOS `fichier:ligne` → web-v3 `fichier:ligne` →
verdict) sont dans chaque analyse ; un contrôle sans effet y est « absent ».

**Lentille** (`lentille.md`) — conformes et mesurés : courbe, élection à
hystérésis 45, respiration, zéro relayout, tri partagé, Prisme de l'aperçu.
Écarts, par visibilité : hiérarchie typographique inversée (aperçu 17 px
au-dessus d'un nom de 13, iOS pose 15 / 13 / 12) ; la liste ne s'aplatit
jamais au repos (iOS retire perspective et magnification 4,5 s après le
dernier tick) ; bande de focus 70 px trop haut (iOS prend le centre, sa
constante `focusBandOffset` n'entre dans aucun calcul) ; la ligne 2 n'a que
l'aperçu (ni frappe, ni brouillon, ni pont ✦, ni les cinq formes d'aperçu) ;
magnification sans aucun contrôle actionnable (catégorie, étiquettes, mode,
effectif) ; aucune section ni sticker ; le rail n'est pas celui des stories ;
heure absolue et accentuée sur non-lu là où iOS est relatif, vivant et
toujours tertiaire ; ni squelette, ni erreur, ni hors-ligne, ni appui long, ni
pull-to-refresh, ni pagination ; texte non échelonnable.

**Focal et Script** (`focal-script.md`) — conformes : loi importée de
`@meeshy/shared`, catalogue, règle de rendu `bulles`, retrait 41, paddings,
`mountsBottomLine`, virtualisation. Le fait le plus lourd : **web-v3 applique
une courbe d'estompage qu'iOS a retirée le 2026-08-24** ; ce qui distingue
Focal de Script sur iOS est l'élection d'une rangée avec sa carte, son chip
et son tampon, armée à ≥ 1 200 pt/s ou ≥ 4 s de défilement, aplatie 4,5 s
après — absente du web. Puis : un message protégé s'affiche en clair (#5676) ;
réactions, avatar et coches inertes ; le tap d'un drapeau ne change pas le
texte servi et reste local à la rangée ; heure et coches visibles en permanence
(iOS les masque au repos) ; aucun menu d'appui long ni swipe ; onze états de
message manquants ; identité amputée (présence, story, humeur, fantôme, ✦) et
cadre de 34 non réservé ; chrome non escamoté ; cotes divergentes non gardées ;
pas de cycle au tap ; D-10 sans câble ; scope de magasin `'local'` partagé ;
libellé VoiceOver composé absent ; `typing` codé en dur ; quatre gates hors CI
(#5677).

**Bulle** (`bulle.md`) — la charte du README était juste sur le rayon 18
uniforme sans queue, l'indigo de l'envoyée, l'identité au pied de la dernière
bulle ; elle était fausse sur la reçue (iOS mêle la couleur de l'EXPÉDITEUR à
70 % d'indigo, l'accent de conversation n'est que le repli — question produit
#5680) et incomplète sur le regroupement (jamais à travers un message
système). Écarts : aucune image ne s'affiche ; l'audio ne joue pas ; aucun geste
sur une bulle ; teinte de la reçue ; le pied ment sur la protection et sur le
regroupement des drapeaux ; bande de drapeaux hors ordre du Prisme ; états
protégés absents ; réactions décoratives sans réserve d'espace ; texte long non
tronqué et sans liens ; pastille de jour non collante ; message système qui
casse une suite ; `QUOTE_RAIL_WIDTH` dérivé, gardé, et servi nulle part.

## Ce qui a été tranché, et ce qui reste à trancher

- **D-20** : la cible est iOS drapeaux activés ; la v3.1 n'a ni drapeau ni
  programme bêta ; `VITE_READING_MODES` est le seul réglage. D-7 et D-9 portent
  un renvoi daté. **Précision** : la bulle iOS n'a pas de queue dans les deux
  configurations ; la « queue » vue sur la capture drapeaux éteints était un
  texte stylé.
- **D-19** reste juste sur `script ≠ river`, mais décrit un iOS d'avant le
  2026-08-24 : ce n'est pas la perspective qui distingue les deux modes, c'est
  l'élection.
- **D-17** conclut juste (un glyphe d'épingle) sur un raisonnement faux (iOS
  peint bien 📌 avant le nom, section ET glyphe coexistent) ; le même
  raisonnement justifiait l'abandon des sections, qui tombe.
- **D-10** affirme que la v3.1 écrit le mode vers le serveur : `sync.ts` n'a
  aucun consommateur.
- **D-16** énumère les états de l'envoi et du réseau, pas ceux du message ni
  de la bulle.
- **D-8** (Résumé et Rivière hors périmètre) est rouverte par la directive du
  jour. `resume.md` tranche pour le Résumé : OUI sous condition — trois lois
  pures à porter (`DeterministicDigestBuilder`, `EpisodeSegmenter`,
  `FaceRampRanking`, 52 cas de test iOS transcriptibles), aucun endpoint, le
  panneau agent optionnel restant un no-op ; conditions : un corpus de fixtures
  qui atteigne le seuil de 25 non-lus, l'inversion de `check-reading-mode.mjs`
  (qui exige aujourd'hui « Résumé désactivé »), le cadrage des dates hors
  `'fr-FR'` en dur. `riviere.md` tranche pour la Rivière : OUI sous condition —
  la loi (`packages/shared/utils/river-lanes.ts`, 1 044 l, 61 vecteurs
  inter-plateformes) se porte à zéro ; `activeParticipantCount` est
  `conversation.memberCount` sur iOS (`ConversationView.swift:569`), déjà servi
  et affiché par web-v3 (une ligne dans `decision.ts:56`) ; aucun endpoint ;
  une peau React complète existe dans le legacy, jamais montée ; la condition
  unique est la virtualisation du tracé (D-15, miroir de
  `RiverCanvasRankPlacement`) ; manquent les gestes tactiles, la poignée du
  temps et son échelle, le mapping messages → loi. Quatre travaux, taille
  moyenne. **D-21** en tire la décision.
- **Question produit #5680** : la teinte de la bulle reçue — couleur de
  l'expéditeur mêlée d'indigo (iOS) ou accent de la conversation (directive du
  2026-09-04).
- Deux points de conception sans décision : `law.ts` copie une loi que six
  fichiers voisins importent déjà de `@meeshy/shared` ; aucun jeton Lentille
  n'est généré dans `packages/design-tokens/` alors que
  `lentille-tokens.json` en porte 24.

## Défauts de la cible elle-même, relevés en passant

Ils se corrigent à la source, jamais en les recopiant : la branche « absence »
du mode de lecture se déclenche dès 10 non-lus parce que `noteOpened` n'a aucun
site d'appel (#5681) ; le titre « Résumé Vivant » passe sous l'en-tête et le
composeur recouvre la fin du fil en Focal (#5682) ; l'encoche `AUTO · Focal`
de la rangée élue est inatteignable au doigt (#5683). Deux docstrings iOS
disent « cinq entrées » pour un menu qui en a six ; `SectionScrollPill` n'est
plus montée (retrait produit du 2026-08-23) ; la raison motivée des lignes
grisées du menu du fil n'est affichée nulle part sur iOS — le web l'affiche.

## Comment s'en servir

1. Une spécification d'écran de la liste ou du fil CITE l'analyse et la
   capture correspondantes, et part de leur tableau d'écarts ; elle ne les
   rediscute pas.
2. Une capture n'est une cible que drapeaux ON, prouvée par `settings.beta`.
   Recapturer seulement si `git log --since=2026-09-08 --
   apps/ios/Meeshy/Features/Main/{Lentille,Focal,Riviere,Views/Bubble}` montre
   du mouvement.
3. Un chiffre vient d'une cote citée (`LentilleMetrics.swift`,
   `FocalMetrics.swift`, `packages/shared/design/lentille-tokens.json`), jamais
   d'une lecture à l'œil sur ces captures.
