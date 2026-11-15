## Leçon 250i — un espace qui AÈRE n'est pas un espace qui RÉPOND

- **Quand le label d'un `Button` COMMENCE par une forme nue (`Circle`,
  `RoundedRectangle`, `Capsule`), la zone sensible du bouton est exactement le
  cadre de cette forme.** Rien ne l'élargit : pas de texte qui pousse, pas de
  `Label` qui impose sa hauteur de ligne, pas de `padding` qu'un glyphe
  hériterait. **Le dessin devient la cible**, et un dessin décoratif est presque
  toujours sous les 44 pt. C'est une FORME, pas un écran : la chercher comme
  telle a rendu trois sites là où le suivi n'en nommait qu'un.
- **Une marge posée sur le PARENT aère sans répondre.** Les deux bandes de
  couleurs du composeur portaient 8 pt de marge verticale sur leur `HStack` : la
  bande mesurait 44 pt de haut et n'en écoutait que 28. C'est ce qui les a tenues
  hors des revues — une capture d'écran, un Accessibility Inspector posé sur le
  conteneur et une mesure au doigt montrent tous les trois la bonne hauteur.
  **La question n'est pas « la rangée est-elle assez haute ? » mais « qui, dans
  cette rangée, RÉPOND ? »** — pendant géométrique de la leçon 249i, où un
  modificateur déclarait une cible sans la faire respecter.
- **Et ces marges sont le budget du correctif.** Élargir une cible ne coûte pas
  toujours de la place : les points posés AUTOUR du contrôle pour l'aérer peuvent
  passer DEDANS, où ils servent enfin à quelque chose. Bande de couleurs :
  hauteur identique. Barre d'étapes : +12 pt au lieu de +36. **Regarder ce qui
  entoure un contrôle avant de conclure qu'on ne peut pas l'agrandir.**
- **Un commentaire peut déclarer un partage au MAUVAIS NIVEAU.** « C'est le même
  contrôle, servi à deux endroits » surmontait une vue recopiée — et la phrase
  était vraie : le partage existait, au niveau de la CLÉ de traduction. Troisième
  occurrence en trois lots de « un commentaire ne fait pas d'une copie une source
  unique », et la plus trompeuse, parce qu'elle ne ment pas — elle nomme un
  partage à un niveau et laisse croire au niveau au-dessus.
- **Une extraction de vue déplace du texte que des gardes cherchent.** Trois
  assertions lisaient la SOURCE du fichier vidé de sa palette. Elles survivent —
  vérifié avant commit, pas espéré. **Avant toute extraction, chercher les gardes
  qui NOMMENT le fichier d'origine**, pas seulement celles qui testent son
  comportement (leçon 248i, appliquée cette fois en amont plutôt qu'après un
  rouge).
- **Une garde de FORME ne juge pas les valeurs.** Celle-ci exige qu'un label
  dessiné DÉCLARE sa zone sensible ; ce sont deux tests unitaires qui fixent
  44 pt. Lui faire lire les valeurs l'aurait fait rougir sur le disque de 52 pt
  du bouton « lire » d'un aperçu vidéo — une cible parfaitement valide.
