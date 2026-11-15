## Leçon 289 — une règle qui vit en DEUX copies dérive dès que l'une est durcie, et le durcissement ne se propage pas tout seul (2026-08-25, itération 269)

> Coordination : une session sœur (#3517) réserve « leçon 288 » (aliases ISO 639-1
> Android). Cette leçon-ci est disjointe et numérotée 289 pour éviter la collision
> au merge de `tasks/lessons.md`.

Le gateway portait DEUX `normalizeDisplayName` — l'une exportée
(`utils/normalize.ts`, inscription/profil), l'autre privée
(`utils/contact-identifiers.ts`, synchro du carnet d'adresses). Jumelles par le
nom et le but (nom d'affichage, une seule ligne), divergentes par le contrat
(SUPPRIMER vs REMPLACER par un espace ; bornée vs non). La jumelle exportée a été
durcie deux fois — it. 266b (jeu complet des séparateurs de ligne Unicode) et sa
garantie « une seule ligne » — pendant que la copie du carnet n'en recevait
AUCUNE et portait en plus une troncature `.slice(0, 200)` qui coupait au milieu
d'une paire de substituts UTF-16 (défaut jumeau de l'it. 268, `truncate`).

> **Un durcissement appliqué à UNE copie d'une règle laisse l'autre exactement où
> elle était.** Le correctif ne rougit nulle part ailleurs : la seconde copie
> compile, ses tests passent (ils n'exerçaient que l'ASCII nu), et la dérive ne se
> voit qu'à l'entrée exacte que la copie durcie couvre désormais et que la copie
> restée en arrière ne couvre pas.

Trois corollaires, tous mesurés dans ce lot :

- **Le témoin qui l'attrape s'écrit sur la forme d'entrée que la copie ratée ne
  couvre pas** — un émoji à la frontière de coupe, un `U+2028` dans le nom —
  jamais sur l'ASCII que les deux traitent pareil. Même famille que la leçon 287
  (« le témoin s'écrit sur la famille AUTRE que celle qui marche ») et la
  leçon 276 (« un témoin de rang s'écrit sur un rang autre que le premier »).

- **On supprime la divergence en extrayant la RÈGLE, pas en fusionnant les
  fonctions.** Les deux `normalizeDisplayName` gardent leur contrat distinct ; ce
  qui devient unique est le seul morceau qui avait dérivé — le JEU de caractères
  de rupture de ligne (`LINE_BREAKING_CHARS_SOURCE`), dont chaque site dérive sa
  propre regex (supprimer d'un côté, remplacer par un espace de l'autre). C'est la
  leçon 287 (extraire UN site) appliquée à un fragment de règle, pas à une
  fonction entière : fusionner aurait cassé un des deux contrats.

- **Un durcissement de sécurité/rendu a des JUMELLES qui ne portent pas son nom.**
  L'it. 268 a fermé `SecuritySanitizer.truncate` (« troncateur ») ; le second
  troncateur du dépôt s'appelle `normalizeDisplayName` et ne se serait jamais
  présenté à une recherche de « truncate ». La question « cette entité a-t-elle une
  jumelle ? » (cycle 85) se pose donc aussi à un DURCISSEMENT : *quel AUTRE site
  fait la même opération sous un autre nom ?* — ici « borner une longueur de texte
  utilisateur » et « garantir une seule ligne », chacun présent deux fois.
