## 258i — avant de renoncer à une amélioration qu'un cliquet interdit, mesurer le cliquet

- **Un cliquet qui laisse passer 1443 clés est un commentaire, pas un cliquet.**
  Le plafond i18n était épinglé à 1545 depuis le 226i ; le backlog réel valait
  **102**. Le catalogue s'était rempli entre-temps (3397 des 3408 entrées
  traduites dans les six locales requises) sans que le pin suive, et rien ne
  pouvait le signaler : un plafond trop HAUT ne rougit jamais. **Un seuil qui ne
  descend pas avec la mesure cesse silencieusement de protéger** — le relire
  périodiquement fait partie de sa maintenance, au même titre que le franchir.

- **Une contrainte peut interdire le bon geste parce que la valeur qui la porte
  a cessé d'être vraie.** 226i avait mesuré le trou du scanner (92 appels
  multi-lignes invisibles) et RENONCÉ à l'élargir, avec un raisonnement
  impeccable : « élargir fait apparaître des clés, donc MONTER le backlog, or le
  plafond ne doit que descendre ». Juste — contre un plafond qu'on croyait
  serré. La vraie réponse n'était ni élargir ni renoncer, mais **élargir ET
  re-piquer**. Deux ans de trou (92 → 185 appels, 46 → 61 fichiers) ont couru
  parce que personne n'a interrogé le 1545.

- **Répliquer une règle, c'est répliquer ses FILTRES, pas seulement sa boucle.**
  Ma copie a rendu 1024, puis 93, puis 102. Deux erreurs, toutes deux des
  filtres omis ou durcis : `!call.isModuleBundle` oublié (je comptais les clés
  du SDK contre le catalogue de l'app) et un `isIdentifier` plus strict que le
  Swift (j'exigeais un point, je refusais `-`). La boucle était juste dès le
  premier essai ; c'est ce qu'elle EXCLUT qui était faux.

- **Ce qui atteste une réplication n'est pas sa relecture, c'est une borne dont
  la réponse est connue.** Ici : en marqueur ÉTROIT, la réplication doit
  reproduire l'état vert ACTUEL des trois règles sœurs (0/0/0). Elle l'a fait —
  et c'est seulement à ce moment que le 102 est devenu crédible.

- **Un chiffre peut mesurer ce que le dépôt ne mesure pas.** J'ai calculé « 133
  orphelines en marqueur étroit, 23 en élargi » et j'étais à un pas d'en faire
  un argument du correctif. Faux : le test des orphelines lit `combinedSource` et
  y cherche des jetons entre guillemets — il n'appelle PAS `localizedCalls` et
  est totalement insensible à ce changement. **Avant de citer une mesure comme
  preuve, vérifier qu'elle porte sur la règle qu'on prétend améliorer**, pas sur
  une règle voisine qui lui ressemble.

- **Rendre une chose COMPTABLE est un livrable, même sans la corriger.** Les 12
  clés révélées ne sont pas traduites et ne le sont pas devenues ici : elles
  portent toutes un `defaultValue` interpolé, dont les spécificateurs de format
  ne se vérifient pas sans rendu réel. Mais elles étaient INCOMPTABLES, donc
  impossibles à planifier ; elles entrent dans le compte et ont leur issue.
  C'est le même arbitrage qu'au 257i : livrer ce qui est prouvable, ouvrir
  l'issue pour ce qui demande une chaîne d'outils qu'on n'a pas.
