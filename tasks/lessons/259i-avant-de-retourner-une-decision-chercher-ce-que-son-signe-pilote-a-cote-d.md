## 259i — avant de retourner une DÉCISION, chercher ce que son signe pilote à côté d'elle

- **SwiftUI retourne les piles, pas le SIGNE d'un glissement.** Troisième famille
  de défauts RTL, après celle que SwiftUI traite seul (piles, alignements, marges)
  et celle que garde `RightToLeftLayoutGuardTests` (symboles nommés par un côté
  physique). `translation.width` est un déplacement à l'ÉCRAN : « `dx < -60` ⇒
  suivant » dit en réalité « glisser vers la GAUCHE avance », vrai en français et
  faux en arabe. Aussi silencieuse que la deuxième : rien ne casse, la navigation
  part simplement à l'envers.

- **Le tri fait partie de la mesure.** Sur 25 comparaisons, **16 ne doivent PAS se
  retourner** : 9 n'encodent aucun sens (`abs()`, dominance d'axe) et 7 déplacent
  un objet qui suit le doigt — une pastille d'appel jetée vers la droite part vers
  la droite dans toutes les langues. Une garde qui aurait interdit le signe brut
  aurait produit un bruit permanent ; elle épingle donc ce qui est DÉCIDÉ.

- **La forme sûre d'un correctif qu'on ne peut pas exécuter : l'IDENTITÉ dans le
  cas dominant.** Le helper rend `width` en LTR et `-width` en RTL ; les sites
  gardent leurs comparaisons, seul l'opérande change. En LTR c'est ×1 — le
  comportement de la quasi-totalité des sessions est préservé *par construction*,
  vérifiable par lecture ET par test, sans simulateur.

- **`.offset(x:)` n'est PAS retourné par SwiftUI**, contrairement aux marges et
  aux alignements. C'est le discriminant qui a séparé les deux sites : `ReelsPlayerView`
  a pu être retourné parce que son visuel tient en UN `.offset` (repassé en espace
  écran par le même helper, qui est sa propre réciproque) ; le cube des stories,
  non.

- **Retourner une décision sans retourner sa GÉOMÉTRIE est pire que le défaut.**
  J'ai retourné la navigation par groupe des stories, puis ANNULÉ : `horizontalDrag`,
  `groupSlide`, `totalSlideX`, `exitX = forward ? -screenW : screenW` et
  l'orientation des faces voisines vivent tous en espace écran et pilotent un cube
  3D. En arabe, le doigt aurait poussé à droite, le cube suivi à droite, puis le
  commit envoyé la face à GAUCHE. Aujourd'hui l'arabe est orienté comme le
  français : faux, mais COHÉRENT — et un demi-retournement casse la relation entre
  le doigt et l'image, ce qui se ressent immédiatement. **Un défaut cohérent vaut
  mieux qu'un correctif partiel**, quand le partiel contredit le geste.

- **C'est la forme du 257i sur une autre surface.** Là : « la valeur de repos n'est
  pas la cible de l'animation ». Ici : « le signe de la décision n'est pas le seul
  signe du geste ». Dans les deux cas, le remède ÉVIDENT dégradait le site, et ce
  qui l'a révélé est la même question — **suivre la donnée jusqu'au PIXEL**, pas
  jusqu'à la décision. `edgeDrag` avait l'air d'un simple seuil ; il pilotait aussi
  une translation trente lignes plus haut.
