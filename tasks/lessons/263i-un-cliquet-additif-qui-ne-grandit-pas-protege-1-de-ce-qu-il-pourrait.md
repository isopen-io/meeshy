## 263i — un cliquet ADDITIF qui ne grandit pas protège 1 % de ce qu'il pourrait

- **`fullyLocalizedScreens` protégeait 3 fichiers sur 299 porteurs de clés.** Son
  commentaire dit pourtant l'intention : « an iteration that finishes localizing
  a screen adds its path here so the screen can never silently regress ». Mesuré :
  **240 fichiers sont déjà 100 % traduits** dans les six locales requises et ne
  sont pas épinglés. Un cliquet additif qu'on n'alimente pas n'est pas faux — il
  est simplement presque vide, et personne ne s'en aperçoit puisqu'il est vert.

- **La deuxième règle m'a évité une CI rouge.** Épingler un écran le soumet AUSSI
  à `test_pinnedScreenDefaultsMatchCatalog` (le `defaultValue` inline doit égaler
  la valeur du catalogue). Sur les 25 écrans les plus riches : **161 violations**.
  Vérifier les DEUX règles avant d'écrire la liste, et non après le push, est la
  seule raison pour laquelle ce lot est vert.

- **648 `defaultValue` mentent sur ce que l'écran affiche.** Le catalogue gagne à
  l'exécution ; le `defaultValue` n'est qu'un repli pour clé absente. Donc
  `defaultValue: "Display"` en face d'un catalogue qui dit « Affichage » est du
  texte MORT qui trompe le lecteur — et plusieurs sont en ANGLAIS dans une app de
  source française (`Push`, `Preview`, `Reposts`). C'est aussi ce qui bloquait
  l'épinglage des écrans les plus riches. → #4308.

- **Un commentaire qui explique une liste doit être vérifié CONTRE la liste.**
  J'ai écrit que les écrans les plus riches — dont `SettingsView` (87 clés) — en
  étaient absents. `SettingsView` y EST : il passe les deux règles. Le commentaire
  aurait survécu à la relecture (il était plausible) et menti durablement.
  **Relire une justification en la confrontant aux données qu'elle décrit**, pas
  au souvenir qu'on en a.

- **Épingler 40 plutôt que 132, sciemment.** Les 132 candidats sortent du MÊME
  parseur non compilable ici. Le risque n'est pas par fichier mais par PARSEUR :
  s'il se trompe, il se trompe partout. Mais la session a montré quatre fois que
  mes scanners ont des angles morts — on épingle donc un lot que la CI valide,
  puis on poursuit avec une confiance mesurée plutôt que supposée.
