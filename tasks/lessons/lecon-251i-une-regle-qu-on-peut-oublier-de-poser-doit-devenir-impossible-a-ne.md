## Leçon 251i — une règle qu'on peut oublier de poser doit devenir impossible à ne pas poser

- **Un suivi se ferme aussi par la NÉGATIVE, et la mesure vaut d'être écrite.**
  250i laissait « la garde s'arrête au premier enfant du label » comme suite.
  Mesurée : 2 candidats, 2 faux positifs — un cadre passé par PARAMÈTRE (invisible
  à un scanner qui cherche des littéraux) et une déclaration hors de la fenêtre de
  22 lignes. Taux de faux positifs d'un élargissement : **2/2**. Une garde qui crie
  au loup deux fois pour zéro prise apprend à ses lecteurs à l'ignorer. Écrire le
  résultat négatif empêche une itération future de re-chasser la même ombre.
- **Un savoir écrit dans un commentaire ne se répand pas tout seul** — troisième
  occurrence en quatre lots. Ici : `.accessibilityHidden(true) // decorative
  separator — not announced to VoiceOver`, une règle exacte, appliquée **8 fois
  sur 28**. Ajouter le modificateur aux 20 manquants aurait soldé le jour et rien
  du vingt-neuvième site. **Quand une règle dépend de la mémoire de celui qui
  écrit la ligne, la corriger site par site ne la fait pas tenir : il faut rendre
  l'écriture fautive impossible** — un composant qui naît conforme, plus une
  garde qui interdit l'ancienne écriture.
- **Un paramètre optionnel qui alimente un modificateur SwiftUI n'est PAS neutre
  quand il vaut nil.** `MetaSeparator(font:)` posant `.font(font)` aurait effacé
  la police des huit sites qui ne fixaient que la couleur : **`.font(nil)`
  n'hérite pas, il remet la police d'environnement à nil**. Le composant sans
  aucun paramètre laisse les modificateurs chaînés du site s'appliquer par
  l'environnement — et rend la conversion mécanique et sans risque.
- **Renommer une chose oblige à relire ce qui la CHERCHE par son ancien nom.**
  Une garde voisine interdisait `Text("·")` dans un entête ; après le renommage,
  un point ajouté sous son nouveau nom y serait passé au vert. La question à
  poser à tout renommage : *qui cherche cette chose par son ancien nom, et que
  fera-t-il quand il ne la trouvera plus ?*
- **…et cette question se pose avec un `grep`, jamais de mémoire (251i bis).**
  J'avais écrit, dans l'analyse du jour, que le contrôle ci-dessus était fait
  « pour la première fois en amont plutôt qu'après un rouge ». **C'était faux
  dans sa portée, et la CI l'a dit** : je l'avais posé à UN fichier — celui dont
  je me souvenais — et deux autres cherchaient le jeton par son ancien nom.
  `StatusBubbleOverlayLayoutTests` a rougi (1 échec sur 9008) alors que le pied
  de bulle était rigoureusement intact : il épinglait `Text("·")` quand son
  propre nom annonçait une intention (« sits inline with timeAgo »).
  `LentilleRowChromeTests`, lui, portait une assertion **négative** — un
  renommage l'a fait passer au vert **sans jamais rougir**, et c'est le rouge du
  premier qui l'a rendu visible.
  > **Une garde négative ne signale jamais son propre aveuglement.** La leçon
  > 272 (« épingler une intention, jamais une graphie ») a donc une seconde
  > moitié : **un renommage se solde par un BALAYAGE outillé de toutes les
  > graphies** (`grep` du jeton sur tout `MeeshyTests` + `packages/*/Tests`),
  > jamais par la relecture des fichiers auxquels on pense. Deux commandes,
  > quatre sites, zéro cycle perdu — au lieu d'un cycle de CI de 30 minutes.
- **« 0 test en échec » n'est pas « les tests passent » (251i bis).** Le premier
  run du gate a été TUÉ par son plafond de 50 min, et j'ai lu le
  `##[notice]0 test(s) en échec` de l'étape de dépouillement comme une preuve de
  succès — annonçant une PR vérifiée qui ne l'était pas. Le détail par étape
  disait l'inverse : `Run iOS tests … 1 min 12 s → cancelled`. **Zéro échec
  CONSTATÉ, sur une suite qui n'a pas tourné, est zéro test.** Avant de conclure
  d'un gate, lire la DURÉE et la conclusion de l'étape qui exécute, pas le
  compteur de l'étape qui résume.
- **Ne pas réutiliser un CONTRÔLE pour rendre une décoration.** La paire de
  drapeaux d'un aperçu ressemble à la puce de langue de 249i, mais rien n'y est
  cliquable : y monter `LanguageFlagChip` aurait annoncé un bouton qui n'existe
  pas. Ressemblance visuelle n'est pas identité de rôle.
