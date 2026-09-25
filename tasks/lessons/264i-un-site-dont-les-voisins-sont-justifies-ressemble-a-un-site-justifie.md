## 264i — un site dont les voisins sont justifiés RESSEMBLE à un site justifié

- **Compter les prises d'un scanner avant d'avoir lu la doctrine qu'il traverse
  revient à mesurer sa propre ignorance.** Premier balayage de l'itération :
  « bouton à glyphe seul sans libellé VoiceOver », 871 `Button`, **6 candidats**
  — et **six faux positifs**. Le scanner cherchait `.accessibilityLabel` sans
  connaître l'idiome 183i du dépôt, qui MASQUE (`accessibilityHidden`) un bouton
  imbriqué dans un élément combiné et rend son action au conteneur
  (`.accessibilityAction(named:)`). Les six sites portaient le commentaire qui le
  disait. Avant de croire une prise, chercher l'idiome qui la rendrait légitime
  — il est souvent écrit juste en dessous.

- **Une doctrine peut être parfaitement tenue et rester totalement non
  protégée.** Les tailles de police figées sont régies par une règle énoncée sous
  trois numéros d'itération (53i / 82i / 86i) : gel autorisé quand un CADRE FIXE
  déborderait. Mesure : 247 sites, dont 37 sur du texte — et **36 des 37
  portaient leur justification en commentaire, nommément**. La discipline était
  réelle. L'instrument, inexistant. C'est la forme de #4302 (budget de taille) et
  de #4292 (cliquet i18n) : *une règle déclarée dont la mesure n'existe pas ne
  protège plus rien* — mais ici avec un raffinement : **plus une règle est bien
  tenue à la main, plus l'absence d'instrument est difficile à voir**, parce que
  chaque échantillon qu'on ouvre la confirme.

- **Le 37ᵉ site est passé PARCE QUE ses voisins étaient corrects.**
  `ProfileUserPostsList.chip` gelait son chiffre à 18 pt sous un libellé en
  `.caption2` — qui scale — dans une tuile **sans hauteur fixe**. En AX5 le
  libellé devenait 1,5× plus gros que le nombre qu'il légende : la hiérarchie
  typographique de la carte s'inversait. Tous ses voisins de la liste ont un
  cadre fixe qui justifie le gel. **Un site dont les voisins sont justifiés
  RESSEMBLE à un site justifié** : c'est l'angle mort propre à toute règle tenue
  par la relecture, et il ne se ferme qu'avec une mesure.

- **Le discriminant d'une doctrine se cherche en AVAL du site, pas sur le site.**
  Ce qui sépare un gel légitime d'un défaut n'est pas la ligne `.font(…)` — elles
  sont identiques — mais l'existence d'un `.frame(width:height:)` posé plus bas,
  et surtout **ce que font les VOISINS du même conteneur**. Un gel entouré de
  gels est cohérent ; un gel à côté d'un `.caption2` qui scale est une inversion.

- **Épingler une liste en SURENSEMBLE quand une règle repose sur une
  classification.** La garde pose deux choses : une liste de fichiers et deux
  compteurs. La liste compte TOUT site figé, sans regarder son receveur — elle ne
  dépend donc d'aucune classification, et aucune divergence entre mon scanner
  Python et le portage Swift ne peut la faire rougir à tort. Seuls les compteurs
  portent le risque de divergence, et c'est là qu'il doit être : concentré, visible,
  corrigible en un tour.

- **La borne qui compte est celle qui interroge le classifieur, pas le compte.**
  Un cliquet « ≤ 36 textes figés » resterait VERT si la classification
  s'effondrait à 0 — le mode de panne du 256i (balayage qui ne voit rien),
  transposé du balayage à la classification. La borne exige donc que les DEUX
  populations soient non vides (glyphes > 150, textes > 20), plus trois témoins
  synthétiques dont un vérifie que le masquage des commentaires tient : la
  doctrine s'écrivant JUSTE au-dessus du site qu'elle justifie, une garde non
  masquée compterait ses propres justifications.
