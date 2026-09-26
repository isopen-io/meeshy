## Leçon 442 — Un REFUS peut être parfaitement écrit et se lever DERRIÈRE l'écran

Suite immédiate de la 441, trouvée en vérifiant son correctif. Le refus explicite
que je venais d'ajouter n'apparaissait pas : le composer est un
`fullScreenCover`, et l'hôte des toasts était un `.overlay` de la vue RACINE —
donc dessous. **Tout toast levé depuis le composer était invisible** : la
publication ratée, le micro refusé, l'envoi hors-ligne.

Et le doc-comment du refus de la porte décrivait mot pour mot le symptôme que
cette absence produit :

> « Un refus qui se DIT. Rendre `false` sans rien dire laisserait l'auteur devant
> une flèche qui semble ne rien faire — et il la presserait encore. »

Le bon geste était fait, à la bonne place, avec la bonne raison écrite. La couche
d'AFFICHAGE le rendait sans effet.

> **La question « qui AFFICHE ce que je viens de produire ? » ne vaut pas que
> pour un contenu — elle vaut pour un REFUS, une ERREUR, un ÉTAT.** C'est la
> forme du cycle 122 du Prisme (« un correctif dont la valeur n'atteint aucun
> lecteur n'a corrigé personne ») portée d'une traduction à un message d'échec.

Corollaire de forme, mesuré dans le même lot : l'overlay était déjà écrit DEUX
fois — racine iPhone et racine iPad — et les deux avaient déjà divergé (l'un
porte le rappel de tap et l'identifiant d'accessibilité, l'autre non). Le
troisième exemplaire n'a pas été écrit : c'est un modificateur, et la racine le
consomme.

**Deux précisions dues à la session voisine, qui a repris la mesure le jour
même et trouvé SIX toasts dans le lecteur de story, dont QUATRE refus :**

- **le modificateur va sur le point de MONTAGE, pas sur la vue qui lève le
  toast** — sinon on le pose autant de fois qu'il y a de sites d'appel. Le
  conteneur du lecteur couvre à lui seul la trail, une conversation et une
  notification ;
- **le témoin garde les DEUX moitiés du lien** : que l'hôte est monté, ET que la
  surface lève encore des toasts. Un témoin qui n'assert que la présence du
  modificateur protège une ligne devenue inutile sans savoir pourquoi.
