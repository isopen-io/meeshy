## Leçon 291 — une règle à N miroirs sans témoin de parité est un « N−1 » où N vaut zéro (2026-08-26, itération 270)

> Coordination : les numéros 288/289/290 ont été posés par des itérations sœurs.
> Cette leçon-ci est disjointe et numérotée 291 pour éviter la collision au merge
> de `tasks/lessons.md`.

L'itération 269 a fermé un trou de parité en le décrivant comme « N−1 des N
sites » (leçon 288) : le témoin langue couvrait TS↔Swift mais pas Kotlin. En
appliquant sa question — *ce test énumère-t-il TOUS les exemplaires de la
règle ?* — à une AUTRE règle à trois miroirs (le barème de présence 1/3/5, TS
`PRESENCE_*_WINDOW_MS` · Swift `state(now:)` · Kotlin `Presence.*_WINDOW_MS`),
la réponse n'était pas « N−1 » mais **« zéro sur N »** : aucun test cross-plateforme
n'existait. L'invariant ne tenait que par des consignes en commentaire
(« miroir Android `Presence.kt` », « toute évolution touche les trois sites »).

> **Le trou de parité le plus dangereux n'est pas le témoin qui couvre N−1 sites,
> c'est la règle à N miroirs qui n'a AUCUN témoin — parce qu'aucun test ne rougit
> pour signaler son absence.** Un témoin partiel se trouve en lisant le test ; un
> témoin absent se trouve en RECENSANT les règles dupliquées documentées et en
> demandant, pour chacune, « laquelle a un `*-mirror-parity` ? ». CLAUDE.md nomme
> lui-même ces règles (« miroirs plateforme », « toute évolution touche les trois
> sites ») : chaque occurrence de cette formule est une règle à auditer.

Trois corollaires, mesurés dans ce lot :

- **Un témoin de parité peut lire un miroir SANS l'obliger à extraire des
  constantes nommées.** iOS déclare ses seuils en littéraux inline (`elapsed <= 60
  { return .online }`) ; Kotlin et TS en constantes. Le témoin ancre son
  extraction Swift sur l'ÉTAT RETOURNÉ (`{ return .online }`), pas sur une forme
  de déclaration — il garde donc la parité sans exiger de toucher la source
  iOS/Android (non compilable ici). La parité se mesure là où chaque plateforme
  DÉCLARE la valeur, quelle que soit sa forme.

- **La contre-épreuve d'un témoin de parité s'ancre sur la valeur ATTENDUE, pas
  seulement sur l'égalité mutuelle.** Trois extractions qui rendraient toutes `0`
  seraient mutuellement égales : le test compare aussi le barème TS à `{online:60,
  away:180, idle:300}` en dur, pour qu'une extraction cassée tombe au lieu de
  passer. Même rôle que l'ancrage de taille (`length > 50`) du témoin langue.

- **Un sous-invariant caché voyage avec la règle principale.** Le chemin `isOnline`
  de Swift porte un `$0 <= 300` qui DOIT égaler le seuil idle (sinon un flag
  serveur périmé survit plus longtemps sur iOS qu'ailleurs). Le témoin le garde
  séparément : une règle à seuils a souvent une garde ANNEXE réglée sur l'un de
  ses seuils, et cette garde dérive indépendamment. Forme des cycles 123–126
  (« que transporte la charge À CÔTÉ de ce qu'elle affiche ? ») appliquée à un
  barème plutôt qu'à un contenu.
