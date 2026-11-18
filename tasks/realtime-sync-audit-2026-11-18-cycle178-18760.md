# Cycle 178 — la protection de #4395 TIENT, et c'est l'objectif qui a bougé sous elle

*2026-11-18, à la suite du cycle 177 (#19599, fusionné dans `dev` par
`affca86b42`). Branche `claude/exciting-planck-7cczh7`. Instruit **#18760**,
que trois cycles de suite (175, 176, 177) ont cité comme « le défaut
d'INFRASTRUCTURE qui a le plus coûté ».*

---

## Pourquoi celui-là, et pas un lot de code

Les suivis disponibles du cycle 176 se présentaient ainsi :

| suivi | verdict de cadrage |
|---|---|
| #19604 (la loi d'appartenance au point de convergence des réactions) | **BLOQUÉ** : son propre critère de fin exige d'instruire #19603 d'abord, et #19603 est une `décision-produit` non tranchée, assignée au porteur. Une session ne la tranche pas |
| #19612, #19613 (self-test du cliquet de verrouillage, format de `bun.lock`) | ouverts, de l'outillage |
| **#18760** | cité par trois cycles, et **son point central est annoncé « inféré, à confirmer »** |

Le troisième a été pris pour cette raison précise : une issue qui NOMME son
inférence invite à la mesurer, et trois cycles l'avaient recopiée sans le faire.
C'est la règle du cycle 107 — « un suivi hérité est une AFFIRMATION, il se
mesure avant d'être recopié, et le recopier trois fois ne le rend pas vrai ».

## L'inférence était FAUSSE

Elle disait : `cancel-in-progress: ${{ expression }}` rend une CHAÎNE, et
`"false"` étant non vide donc truthy, la protection de `dev` ne s'applique
jamais. C'est un piège réel d'Actions, et il prédisait les neuf annulations en
rafale que l'issue avait relevées.

Mesuré sur les **30 derniers runs `push` de `dev`** (17 heures, la rafale de
fusions du jour) :

- **les 19 annulations tombent à la seconde où le run SUIVANT est créé** (écart
  1 à 3 s, sans exception) ;
- **les 5 qui concluent tournent 2 h 29 à 3 h 46**, en traversant jusqu'à
  **QUATRE** poussées sans être touchées.

Un run en cours qui survit à quatre poussées est l'inverse exact de
`cancel-in-progress: true`. L'expression s'évalue donc `false`, comme elle le
doit, et le modèle qui explique **100 %** des 30 points est celui que GitHub
documente : **un seul run EN ATTENTE par groupe de concurrence** — l'en-cours
est protégé, l'arrivant devient en attente, et le suivant ÉVINCE celui qui
attendait. Dans une rafale, seuls le premier et le dernier survivent.

## Et la réponse était dans le fichier que l'issue CITE

C'est la partie du cycle qui apprend quelque chose. Le commentaire de `ci.yml`
décrivait déjà ce mécanisme, quelques lignes sous le passage cité :

> « les annulations surviennent à des âges courts et IRRÉGULIERS […], signature
> d'un run qui ATTENDAIT et qu'un arrivant plus récent a évincé — **un seul run
> en attente à la fois** »

Il laissait même le test de falsification à employer (`run_started_at -
created_at` qui GRANDIT ⇒ file qui s'accumule), et ce test n'a pas été
appliqué. L'issue reprochait au commentaire d'être « une affirmation qui dit
faux » ; il avait mesuré juste.

> **La vérification d'un commentaire porte sur ce qu'il affirme EN ENTIER, pas
> sur le paragraphe qui a servi à le trouver** — et ce paragraphe est, par
> construction, celui qui ressemble le plus à la question qu'on se posait, donc
> le moins susceptible de porter la réponse qu'on n'attendait pas. Symétrique de
> la leçon 261 : une énumération affirme qu'elle est complète, une CITATION
> affirme qu'elle est représentative.

## Le vrai défaut, que l'issue avait à MOITIÉ vu

Il reste, et il est plus intéressant que celui qu'elle décrivait. `dev` obtient
un verdict — mais :

1. **il porte un commit PÉRIMÉ** : le run protégé est le PREMIER de la rafale,
   et pendant ses trois heures `dev` avance de huit commits ;
2. **la tête attend jusqu'à 3 h 46** son propre verdict ;
3. **aucun commit intermédiaire n'en a**, ce que `false` était censé offrir et
   n'offre, en rafale, jamais.

C'est exactement ce que le cycle 177 a payé : trois rouges indépendants vivaient
à la tête de `dev` (#19653, #18062, #19654) sans qu'aucun verdict ne les nomme.

**Conclusion contre-intuitive** : pour l'usage que #9226 fait de `dev` (« CI
verte autorise la fusion »), `cancel-in-progress: true` serait STRICTEMENT
MEILLEUR que `false`. #4395 a optimisé « obtenir UNE conclusion » là où le
besoin réel est « obtenir la conclusion de la TÊTE ».

> **Un réglage juste pour l'objectif de son époque devient faux quand l'objectif
> change, sans qu'une ligne bouge.** Ce n'est pas une erreur de #4395 : c'est
> #9226, arrivée après, qui a déplacé ce qu'on attend de `dev`.

## Ce que ce cycle n'a PAS fait, et pourquoi

Aucune ligne de `ci.yml` n'est touchée. Les trois pistes (retour à
`cancel-in-progress: true`, groupe par SHA sur `dev`/`main`, run planifié sur la
tête) sont des ARBITRAGES : les deux premières renversent un ADR, la troisième a
une facture en minutes de runner. Une session mesure et recommande ; elle ne
renverse pas une décision d'infrastructure documentée, et elle n'engage pas un
budget.

L'issue est donc instruite, pas refermée d'office : sa question d'origine est
répondue (la protection tient, c'est mesuré), et le défaut qu'elle visait
réellement mérite son issue avec l'arbitrage et son coût.

## Preuve

- **30 runs `push` de `dev`** relevés par l'API Actions, créations, conclusions
  et horodatages de mise à jour — le modèle rend compte des 30 ;
- les **19 annulations** appariées une à une à la création de leur successeur ;
- les **5 conclusions** appariées à un groupe libre au moment de leur création ;
- `grep` des blocs `concurrency` du dépôt : `ci.yml` n'en porte **qu'un**, au
  niveau du workflow, sans surcharge par job ; trois workflows portent la forme
  conditionnelle (`ci.yml`, `android.yml`, `android-sqlcipher-device.yml`) ;
- `grep` des annulations délibérées (`gh run cancel`, `/cancel`,
  `cancel_workflow`) dans `.github` et `scripts` : **aucune** — les annulations
  ne viennent pas d'une automatisation du dépôt ;
- et cinq fois sur ma propre branche de travail, où l'expression vaut `true` :
  cinq poussées en quarante minutes, quatre runs `ci.yml` annulés, aucun verdict
  jusqu'à l'arrêt des poussées. Le défaut que je cherchais, je le produisais.

## Suivis

- **#18760** reste ouvert, avec la mesure et les trois pistes chiffrées en
  commentaire. Le réglage est au porteur.
- **#19604** reste bloqué par **#19603** (`décision-produit`) : un membre banni
  peut-il RETIRER une réaction qu'il a posée ? Tant que l'axe BANNISSEMENT n'est
  pas tranché, resserrer le point de convergence rejouerait le défaut de #19525.
- **#19612** et **#19613** n'ont pas été instruits.
