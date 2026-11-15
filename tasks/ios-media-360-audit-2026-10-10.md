# Analyse 360° — lecture, ajout, édition et animations média sur iOS (2026-10-10)

> Journal daté, pas un tableau de bord. L'état de chaque piste vit dans son issue, milestone #164
> « Meeshy iOS lit, ajoute et édite ses médias sans chauffer — mesuré sur appareil » (échéance 2026-11-30).
> En cas d'écart, l'issue a raison. Antécédent : #9702 / PR #9716, puis #9837, #9827, #9821.
> Compte rendu publié : https://claude.ai/artifact/7LznyHFnaAQteECz4sGbmL

## Méthode

- Demande du porteur (2026-10-10) : lire, ajouter et éditer un média, ainsi que les animations, INSTANTANÉMENT et sans faire chauffer l'appareil.
- Six relevés en lecture seule sur `origin/dev` (fa463992), un par axe : lecture vidéo, audio et moteur des stories, ajout, édition, animations, énergie et simplification.
- Les constats clés ont été relus à la main :
  - le téléchargement octet par octet ;
  - `rebuildLayers()` appelé à chaque tick ;
  - la pulsation des avatars de la rangée Lentille ;
  - la boucle audio de premier plan sans handler ;
  - `beginBackgroundTask` sans gestionnaire d'expiration ;
  - le `moov` absent du writer de transcodage.
- Le conteneur n'avait ni Swift ni Xcode. **Aucun gain n'est mesuré.** Chaque issue porte son scénario Instruments à rejouer sur iPhone (ProMotion de préférence).

## Classement (gain × coût × risque)

| Vague | Issue | Résultat attendu | Gain | Coût | Risque |
|---|---|---|---|---|---|
| 1 | #9876 | MetricKit remonte énergie, sorties et hitches ; signposts média agrégés (prérequis de preuve) | élevé | S | faible |
| 1 | #9868 | La liste des conversations au repos ne fait plus tourner aucune animation | élevé | S | faible |
| 1 | #9866 | Une scène muette ne prend ni session ni moteur audio | élevé | S | faible |
| 1 | #9867 | Le clip de premier plan boucle sans fin ; fondu à la fermeture | élevé | S | faible |
| 1 | #9871 | `moov` en tête de toute vidéo envoyée ; story compressée | élevé | S | faible |
| 1 | #9875 | Un upload long ne fait plus tuer l'app en arrière-plan | élevé | S | faible |
| 1 | #9869 | Le reflet de chargement ne tourne que pendant un vrai chargement | élevé | S–M | faible |
| 1 | #9864 | Verre capturé une fois ; cadence basse quand rien ne bouge | élevé | S–M | faible–moyen |
| 1 | #9863 | Téléchargement en flux vers un fichier, plus d'octet par octet | élevé | M | moyen |
| 2 | #9870 | Import photothèque par fichier, sans transcodage caché | élevé | S–M | faible |
| 2 | #9872 | Avatars et vignettes décodés à la taille affichée, hors fil principal | élevé | S–M | faible |
| 2 | #9874 | La timeline du composer ne se réévalue plus à 60 Hz | élevé | S–M | faible |
| 2 | #9873 | Curseur de filtre : aperçu GPU sur image réduite | élevé | M | moyen |
| 2 | #9880 | Politique média réactive (chaleur, économie d'énergie) | élevé | M | faible |
| 2 | #9882 | Lecteurs préparés depuis le disque seulement ; pool à priorité | moyen | S–M | faible |
| 2 | #9885 | Photo préparée décodée une fois ; passthrough JPEG | moyen | S–M | faible |
| 2 | #9883 | Effets de bulle et horloges visuelles sans refiltrage ni `Timer` | moyen | M | faible |
| 2 | #9884 | Départ ancré du composer ; pas de seeks de dérive empilés | moyen | S–M | moyen |
| 2 | #9886 | Une seule forme d'onde, à la bonne échelle | moyen | M | faible |
| 3 | #9879 | Un profil de session audio par usage | moyen–élevé | M | moyen |
| 3 | #9878 | Un seul moteur audio pour le lecteur | élevé | M–L | moyen |
| 3 | #9881 | Une story vidéo téléchargée une fois (`AVAssetResourceLoader`) | élevé | L | moyen |
| 3 | #9865 | Keyframes de story par Core Animation | élevé | L | élevé |
| 3 | #9877 | Export de story composé sur GPU, hors fil principal | élevé | L | élevé |
| décision | #9888 | Vidéos servies : faststart, rendu allégé, codec | élevé | M | moyen |
| décision | #9889 | Découpe seule en passthrough | élevé | S | moyen |
| décision | #9887 | Mode d'enregistrement vocal | moyen | S–M | moyen |
| dette | #9890 | Code média mort retiré ; aperçu plein écran par le lecteur commun | moyen | S | faible |
| dette | #9891 | Une implémentation par brique média | moyen | M | faible |
| prisme | #9892 | Piste son d'un réel élue par `ReaderPrism` | moyen | S | faible |

## Révisions de l'audit précédent (#9702)

Avant de citer un constat de l'audit de #9702, relire ces quatre révisions : il a pu changer depuis.

- `_FlatRenderer` (et `_MiniRenderer`) n'est plus atteint : c'est du code mort, et non un lecteur par cellule.
- `VideoLegacySupport` reste vivant. `ConversationView.swift:825-827` l'appelle encore : c'est une jumelle à absorber (#9890).
- `MediaThermalPolicy` plafonne le débit (`preferredPeakBitRate`), mais ce levier ne sert qu'au choix de variante HLS. Or la passerelle ne sert que du MP4 progressif (aucun `m3u8`), donc il n'a aucun effet (#9880, #9888).
- Le son préchargé d'un réel suit la même loi que le lecteur. Cette loi passe par `preferredContentLanguages`, et non par `ReaderPrism` (#9892).

## Déjà bien fait (ne pas toucher)

- Moteur vidéo partagé :
  - boucle par successeur en file, sans `seek(0)` ;
  - pool borné à 3 ;
  - `isReadyForDisplay` comme signal de première image.
- Fenêtre de préchargement des réels jumelle web/iOS. `ReelPrewarm` ne prépare de lecteur que depuis le disque.
- Composer :
  - ancre hôte commune vidéo/son ;
  - seek tolérant pendant le geste, précis au relâché ;
  - un seul peintre Core Image sur Metal pour la capture.
- Horloges et liens d'affichage : `PlayheadTickClock` en temps réel, `WeakDisplayLinkTarget`, `EditClockThrottle`.
- TUS lit et hache le fichier en flux. La capture démarre hors du fil principal et s'arrête quand on quitte l'écran.

## Ce que le cloud ne pouvait pas faire

Ces trois tâches attendent une session sur le Mac du porteur (Claude Desktop ou `claude remote-control`) :
- compiler et lancer `./apps/ios/meeshy.sh test` ;
- jouer l'app sur iPhone ou sur simulateur ;
- mesurer sous Instruments.

L'inscription des issues au projet « Meeshy — pilotage » attend aussi, pour une autre raison : l'API GraphQL n'est pas accessible depuis la session cloud.
