## 257i — la valeur de repos d'une animation n'est pas la valeur qu'elle visait

- **Une animation qui dit un STATUT s'arrête aussi, mais elle doit continuer à
  le DIRE.** Sept `repeatForever` sur 68 n'avaient aucun portillon Reduce
  Motion, et c'étaient toutes des animations de statut — frappe, enregistrement,
  sauvegarde, appel en cours. Elles avaient survécu à quatre audits
  d'accessibilité parce qu'elles ressemblaient à de l'information, et qu'on ne
  coupe pas une information. La règle qui les rattrape n'est pas « coupe le
  mouvement » mais **« retire le VOYAGE, garde le SENS »**.

- **Le portillon qu'on copie du voisin peut rendre le produit PIRE.**
  `OnboardingAnimations.settleWithoutMotion` se pose sur la valeur CIBLE de
  l'animation, ce qui est juste pour une décoration qui converge. Appliqué au
  point d'appel en cours, dont l'animation tend vers `opacity 0.3`, il aurait
  laissé un indicateur presque invisible ; appliqué aux formes d'onde
  d'enregistrement, dont la cible est TIRÉE AU HASARD, il aurait rendu un trait
  plat qui se lit « cassé ». **Avant de reprendre un remède éprouvé, demander
  vers quoi l'animation qu'on arrête était en train d'aller** — la bonne valeur
  de repos est tantôt la cible, tantôt son inverse, tantôt ni l'une ni l'autre.

- **Une garde par FICHIER rend « gardé » dès qu'une AUTRE partie du fichier
  décide.** Rejouée sur `origin/main`, ma règle attrapait 5 des 7 défauts :
  `MeeshyApp` passait pour conscient parce qu'il injecte la clé d'environnement
  à la racine, `MessageListViewController` parce qu'il appelle le prédicat 2 500
  lignes au-dessus du site fautif, pour un autre sujet. Le proxy par fichier
  reste le bon choix (une règle par déclaration condamnerait les treize boucles
  légitimement gardées en amont de `ConversationAnimatedBackground`) — mais il
  se COMPLÈTE par des épinglages nommés. **On ne découvre ce qu'une garde ne
  voit pas qu'en la faisant ROUGIR sur l'état d'avant, jamais en la regardant
  verdir sur sa branche.**

- **Le zéro qui voulait dire « nulle part » (256i, revenu au cycle suivant).**
  Un `cd apps/ios/Meeshy` d'un appel d'outil précédent a fait chercher
  `apps/ios/Meeshy` SOUS `apps/ios/Meeshy` : la sonde a rendu « 0 occurrence »
  sur tout le dépôt. Plausible — l'app venait de passer quatre sondes sans rien
  à corriger. La forme est celle de 256i, mais plus dangereuse : là le
  répertoire courant produisait un chemin d'écriture FAUX (visible), ici un
  ensemble VIDE (invisible). Ce qui l'a attrapé n'est pas la relecture du
  script, c'est **la borne** : « combien de `.swift` cette racine voit-elle ? ».
  Chemin absolu toujours ; et un zéro ne se publie jamais sans une mesure
  voisine dont la réponse est connue.

- **Entre l'élégance non vérifiable et l'idiome prouvé, livrer l'idiome et
  ouvrir l'issue.** Le `@propertyWrapper` `DynamicProperty` qui déclarait les
  deux moitiés de Reduce Motion en une ligne était écrit, et c'était le bon
  design. Retiré avant le push : zéro précédent dans le dépôt, cible app en
  `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` (SE-0466), et aucune toolchain
  Apple sur ce plan de travail pour le prouver — or une CI iOS rouge bloque
  TOUTES les PR iOS. C'est 252i pris par l'autre bout : là j'avais AJOUTÉ des
  marqueurs d'isolation « par sécurité » (huit erreurs de compilation), ici j'ai
  refusé d'en supposer. **Ce qu'on ne peut pas compiler ne se pousse pas parce
  qu'on en est raisonnablement sûr.**

- **Deux vues voisines, deux formes, une seule raison.**
  `BubbleEditedIndicator` est `Equatable` par SYNTHÈSE : une propriété stockée
  `@Environment` (non `Equatable`) l'aurait cassée, donc elle passe par
  `.meeshyAnimation` du SDK, qui lit l'environnement lui-même. Sa voisine
  `BubbleCallNoticeView`, dont le `==` est MANUEL, peut déclarer les propriétés
  sans risque. **Avant d'ajouter une propriété stockée à une vue, regarder
  comment elle obtient son `Equatable`** — la synthèse est un contrat invisible
  qu'un ajout anodin résilie.

---
