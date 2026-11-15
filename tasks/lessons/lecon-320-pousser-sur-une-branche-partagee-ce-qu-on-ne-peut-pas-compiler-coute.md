## Leçon 320 — Pousser sur une branche PARTAGÉE ce qu'on ne peut pas compiler coûte à tout le monde, et l'avertissement ne rachète rien

**Contexte.** Session Claude Code web, conteneur **Linux** : ni Swift, ni Xcode, ni
`xcodegen`. J'ai livré deux lots iOS (`5bbbe692`, `702df5f8`), écrit ~900 lignes de
Swift, vérifié le code à la lecture, puis poussé sur `dev` en disant honnêtement, en
commentaire de commit ET dans les issues : « Gate iOS non joué : session Linux ».

**Ce qui s'est passé.** `dev` est passé au ROUGE et l'est resté ~2 h, jusqu'à ce que
le porteur corrige lui-même (`5c66e37e`). Trois erreurs de compilation, toutes de
moi, toutes triviales — deux arguments dans le désordre (`parentId:` avant `media:`,
alors que la déclaration a `media` avant `parentId`) et une inférence de key-path
cassée en cascade — plus une erreur d'isolation dans le SDK. Le message du porteur
dit l'essentiel : *« elle bloquait toutes les sessions »*.

**La leçon n'est PAS « ne pas pousser sans gate ».** Elle est plus précise :

- **Un avertissement documente un risque, il ne le transfère pas.** J'avais écrit la
  réserve à trois endroits. Ça n'a évité aucune minute de rouge à personne. Dire
  qu'on n'a pas vérifié ne remplace pas vérifier, et sur une branche partagée le
  coût ne tombe pas sur celui qui pousse.
- **« Je ne peux pas compiler » n'est pas « je ne peux rien vérifier ».** Ce qui a
  cassé était mécaniquement détectable sans compilateur : *l'ordre des arguments
  d'un appel Swift doit suivre l'ordre de la déclaration*. Vingt lignes de Python
  comparant les labels de chaque site d'appel à la signature du helper l'attrapaient.
  Je ne l'ai écrit qu'APRÈS l'échec. **Devant un gate absent, la question n'est pas
  « puis-je pousser quand même ? » mais « quelle propriété de ce code est vérifiable
  par un moyen que j'AI ? »** — ordre des arguments, existence des symboles cités par
  une garde textuelle, chemins résolus par `#filePath`, équilibre des accolades.
- **Et si l'on pousse malgré tout : rester sur le CI.** Mon vrai tort de conduite est
  là. J'ai poussé, puis je me suis mise en veille avec une horloge de 20 minutes,
  sans jamais regarder les runs — alors que la CI iOS EST le compilateur que je
  n'avais pas, et qu'elle avait rendu son verdict en 8 minutes. **Un push sans gate
  local se surveille jusqu'au vert, il ne se planifie pas.**

**Symptôme reconnaissable.** Un commit qui dit « gate non joué, à passer avant
fusion » sur une branche que d'autres consomment. La phrase est honnête et le geste
ne l'est qu'à moitié : soit le travail attend une branche à soi, soit il part avec
une surveillance active du CI. Jamais « je pousse et je verrai ».

*(Voisine de la leçon 306 — la garde qui casse vit dans un paquet qu'on n'a pas
touché — mais l'inverse en responsabilité : ici le rouge était bien chez moi, et
seul mon environnement m'empêchait de le voir.)*

---
