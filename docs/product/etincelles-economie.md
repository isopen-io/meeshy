# Les étincelles — l'économie des points du Jeu Meeshy

> Décision du porteur du **2026-10-16**. Issues : [#10845](https://github.com/isopen-io/meeshy/issues/10845) (badges d'axe),
> [#10846](https://github.com/isopen-io/meeshy/issues/10846) (poche, total à vie, niveau),
> [#10847](https://github.com/isopen-io/meeshy/issues/10847) (coût de frappe),
> [#10848](https://github.com/isopen-io/meeshy/issues/10848) (réserves par rang),
> [#10849](https://github.com/isopen-io/meeshy/issues/10849) (palier « Lueur »).
> Loi pure : `packages/shared/utils/game/sparks.ts`, `treasury.ts`. Passerelle : `MeeshService`, `EngagementService`,
> `PrestigeService`. Rattrapage : `scripts/backfill-engagement-sparks.ts`.

« **Étincelle** » est le nom des **points**. La monnaie reste la **Meesh**.

## 1. Trois nombres, un seul solde dépensable

| nom | colonne | sur le fil | ce qu'il fait |
|---|---|---|---|
| la **poche** | `User.engagementScore` | `sparks` (et `engagementScore`, `debitablePoints`, `points`) | ce que la frappe dépense. **Tout est convertible** : plus de « points à convertir », plus de plancher inaliénable |
| le **cycle** | `User.sparksSincePrestige` (`BigInt`) | `sparksCycle` (et `level.score`) | les étincelles accumulées depuis le dernier prestige. **Le niveau se lit sur lui** |
| le **total à vie** | `User.sparksEarnedLifetime` (`BigInt`) | `sparksLifetime` | tout ce qu'un compte a gagné. Ne baisse ni à la frappe ni au prestige |

Invariant : **poche ≤ cycle ≤ total à vie.** La frappe retire de la poche seule ; le prestige vide la poche et le cycle seuls.
Un compte d'avant le rattrapage n'a pas les deux derniers champs : ils se lisent sur la poche (`sparksOf`), jamais sous elle.

### Le type numérique

`engagementScore` est un `Int` Prisma : un `long` Mongo hors Int32 y fait lever la lecture. Le niveau est sans limite
(`seuil(N) = 100 × N²` : 1,6 milliard au niveau 4 000, un Int32 est dépassé vers le niveau 4 600), le total à vie encore plus :
les deux champs neufs sont des **`BigInt`**. Sur le fil ils partent en **nombre JSON entier** — jamais un BigInt (que
`JSON.stringify` refuse), jamais une chaîne ; `sparkCount` les sature à `Number.MAX_SAFE_INTEGER` (2⁵³ − 1), qu'aucun compte
n'approche. Les clients décodent un `Int64`/`number`.

### Tous les chemins de crédit

Deux seulement créditent le score, et les deux écrivent poche, cycle et total à vie **du même montant** :
`EngagementService.updateEngagementScore` (commande brute, `$ifNull` + `$max`) et `creditGamePoints` (transaction : missions, coffre,
réponse reçue, saison, duo). Chaque `$max` relève un cycle en retard sur la poche : le niveau ne baisse jamais faute d'un champ.

### La reprise d'un contenu retiré

**Décision : elle réduit le total à vie et le cycle, de ce que ce contenu a rapporté, jamais plus** (`takeBackPoints`). Sans cela,
« publier, dépenser dans une Meesh, supprimer » garderait les étincelles dans le total et dans le niveau. La poche ne passe
pas sous zéro. La Meesh déjà frappée avec ces étincelles reste frappée : c'est la **dette** qui ferme la triche (section suivante).

### La dette d'étincelles (porteur, 2026-10-16)

Quand une reprise ne peut plus être prélevée parce que la **poche est déjà dépensée**, la part manquante devient une **dette**
(`User.sparksDebt`, `BigInt?`, `sparksDebt` sur le fil) :

- **elle se déduit des prochaines étincelles gagnées**, sur les deux chemins de crédit : seul le reste va en poche ; le cycle et le total à vie,
  eux, montent du gain **entier** (un gain remboursé reste un gain) ;
- **tant qu'elle existe, on ne frappe pas** : `POST /me/meesh/mint` → `409 MINT_BLOCKED_BY_DEBT` + `{ sparksDebt }` à la racine ;
  l'aperçu dit `mint.canMint: false`, `mint.blockedBy: 'debt'`, `mint.sparksDebt` ; la dette passe avant le refus de rang ;
- exposition additive : `level.sparksDebt` (`/me/engagement` et `game.level`), `meesh.sparksDebt` + `meesh.blockedBy`, `mint.blockedBy` + `mint.sparksDebt` ;
- le prestige ne la remet pas à zéro ; elle s'additionne d'une reprise à l'autre ; absente = 0 ; une frappe concurrente qui la verrait apparaître est annulée en bloc.

## 2. Le niveau

Le niveau se calcule sur le **cycle**. La frappe ne le fait donc **plus jamais baisser** (`levelsLost` vaut toujours 0, champ
conservé pour les clients publiés ; la remise à zéro des paliers `level:` à la frappe est supprimée).

- **Niveau max à vie** (`User.levelMaxLifetime`, `levelMaxLifetime`) : il **survit au prestige**. Il ouvre les ligues (niveau 10) et le
  duo (niveau 20) : un prestige ne les ferme plus. La « décision porteur attendue » de `PrestigeService` (conformité G-5) est tranchée dans ce sens.
- **Record du cycle** (`User.levelRecord`, `level.record`) : il repart à 1 au prestige (c'est ce que rejouent les vecteurs `prestige` de
  `game.vectors.json` : `levelRecordAfter: 1`).
- **Prestige** : poche → 0, cycle → 0, niveau actuel → 1, étoile +1. Total à vie et niveau max à vie **ne bougent pas**. Les compteurs
  par axe ne sont plus remis à zéro.
- **Vent arrière** : **éteint**. Il compensait la descente du niveau à la frappe ; le niveau ne descend plus qu'au prestige, où le record
  du cycle repart à 1 avec lui. Le garder après un prestige donnerait +25 % pendant les cent niveaux d'une boucle neuve : incohérent.
  `boosts.tailwind` est servi à `1` ; la loi pure (`tailwindFactor`) reste pour les clients publiés.
- **Palier 1 à 9** : s'affiche **« Braise »** (porteur, 2026-10-16 ; « étincelle » désigne les points). Ordre affiché : Braise (1-9), Lueur (10-19),
  puis la suite inchangée. La **clé du fil reste `etincelle`** — les clients publiés la décodent strictement (iOS `LevelTierKey`, une clé
  inconnue fait tomber tout le bloc) ; seul le nom AFFICHÉ change (`game.tier.etincelle` dans les catalogues).

## 3. Le coût d'une frappe

```
prix effectif(n, niveau) = round( prix(n) × facteur(niveau) )
facteur(niveau)          = borné(0,5 + niveau ÷ 200 ; 0,5 ; 1)      — 50 % au niveau 0, plein tarif dès le niveau 100
```

- `prix(n)` est celui du **numéro de la Meesh** (`mint.ts` : 1 221 × 1,3^⌊(n−1)÷10⌋, plafonné à 16 556) ; le facteur lit le **niveau ACTUEL**
  (celui du cycle, après étapes et rang), jamais le niveau max historique : un compte qui vient de passer en prestige paie le tarif réduit.
- **Réglable** : `MINT_COST_FACTOR_AT_LEVEL_ZERO_PERMILLE` (500) et `MINT_COST_FULL_PRICE_LEVEL` (100), dans `sparks.ts`. Tout est en
  millièmes entiers (`mintCostFactorPermille`) : iOS rejoue la loi sans flottant. Le serveur recalcule toujours le prix.
- L'aperçu annonce le numéro de la **prochaine pièce** (`meeshMintedLifetime + 1`), indépendamment du solde de la bourse ou des coffres.

## 4. Les réserves du trésor s'ouvrent par le rang

| réserve | gardées | accès |
|---|---|---|
| Bourse | 1 | ouverte à tous |
| Escarcelle, Coffret | 10, 50 | ouvertes à tous (hors de la règle du porteur) |
| **Coffre** | 100 | rang **strictement supérieur à Voix II** — donc **Voix I** au moins |
| **Trésor** | 500 | **Polyglotte III** au moins |
| **Réserve** | 1 000 | **Ambassadeur III** au moins |

⚠️ Dans `division5`, **V est la plus faible et I la plus haute** (`glory.ts`) : « II » est **au-dessus** de « III ». Le seuil se lit sur la Gloire de
la marche demandée (`gloryLadder`), jamais sur un numéro de division comparé en entier.

Ce que la règle garde : la **frappe**, seule porte qui fait entrer une Meesh dans le trésor. Une pièce qui ferait entrer dans une réserve fermée est
refusée : `409 TREASURY_LOCKED` + `{ tier, minHeld, requires: { rank, division, division5 } }` (interprétation confirmée par le porteur) ; l'aperçu (`mint.locked`, `canMint: false`,
`missingPoints: 0`) et `treasury.access[]` l'annoncent avant. Un compte qui tenait déjà plus que son rang n'est pas dépossédé : il ne frappe plus
tant que son rang ne l'a pas rattrapé. Le Mythe a tout ouvert.

## 5. Les badges d'axe disent le total réel (#10845)

Causes : `EngagementCounter.count` est parti de 0 le 2026-09-07 sans rattrapage ; la frappe le débitait et supprimait les badges, qui se
regagnaient et se renotifiaient ; les gardes de `recordActivity` ne créditent pas tout.

- **La frappe ne débite plus `count` et n'éteint plus aucun badge ni aucun palier de niveau.**
- **Garde de `credit()`** : au premier crédit d'un axe, ou quand le geste franchirait un palier, l'historique est lu ; s'il dépasse le compteur,
  celui-ci est relevé et les paliers passés sont gravés **en silence** (aucune notification).
- **Rattrapage** (`engagementCountBackfill.ts`) : cible = max(compteur, historique) ; paliers ≤ cible gravés en silence (P2002 ignoré) ; à blanc
  par défaut, idempotent, écriture gardée par la valeur lue.
- **Axes dont le total réel se reconstruit** : `content.text_message` (les `Message` des `Participant` de l'utilisateur, `messageSource: 'user'`,
  `deletedAt: null`, `messageType: 'text'`). **Ne se reconstruisent pas** : les axes d'outils (`tool.*`, aucun registre du geste), les contenus
  supprimés (`content.post|story|reel`, `comment.*` : aucune trace de la suppression), `content.audio_message` (forme d'un vocal incertaine),
  `conversation.*` (registre né le même jour que le compteur), `social.*` (faits d'autres comptes). Ils restent sur leur compteur.
- **Reste, hors périmètre** : un geste que les gardes de `recordActivity` refusent (plafond du jour, entre-soi, quota) n'incrémente pas `count` ;
  la dérive est faible et va dans le sens sûr (un badge qui arrive un peu tard). La garde ci-dessus la rattrape à chaque palier.

## 6. Le contrat d'API (additif, tout optionnel)

`GET /me/engagement` :

- `level` : `engagementScore` (poche, inchangé), **`sparks`**, **`sparksCycle`**, **`sparksLifetime`**, **`levelMaxLifetime`**.
- `meesh` : `debitablePoints` = la poche entière, `floorPoints` = 0, `mintCost` = le prix **effectif**, **`baseMintCost`**, **`costFactor`**, `missingPoints`.
- `game.level` : `score` = le **cycle** (la base du niveau, jamais la poche), **`sparks`**, **`sparksCycle`**, **`sparksLifetime`**, **`levelMaxLifetime`**,
  `ladder.levelMaxLifetime`. `record` = record du cycle.
- `game.mint` : `price` effectif, **`basePrice`**, **`costFactor`**, **`costLevel`**, **`locked`** (`{ tier, minHeld, requires }` ou `null`), `levelsLost: 0`.
- `game.treasury.access[]` : `{ key, minHeld, locked, requires: { rank, division, division5 } | null }` pour les six réserves.
- `game.boosts.tailwind` : toujours `1`.

`GET /users/:id/game` → `standing` : **`levelMaxLifetime`** (même visibilité que le niveau), **`sparks`** et **`sparksLifetime`** (même visibilité que
`points` : soi et les amis acceptés) ; `points` reste servi, aligné sur la poche.

`POST /me/meesh/mint` : le reçu ajoute `basePrice`, `costFactor` ; refus **`409 TREASURY_LOCKED`** (code ajouté à `GAME_ERROR_CODES`).

Refus **`409 MINT_BLOCKED_BY_DEBT`** `{ sparksDebt }` (voir la dette).

Réponses de mission/saison (`score`) : désormais le cycle, comme `level.score`.

Schémas : `packages/shared/types/game.ts`, `game-v2.ts`, `engagement.ts`. Vecteurs : `packages/shared/fixtures/reading-modes/sparks.vectors.json`
(fichier à part : `game.vectors.json` est rejoué à l'identique par iOS, dont le test exige la liste exacte de ses lois — il ne bouge pas tant que le lot iOS n'a pas livré ses miroirs).

## 7. Le rattrapage

`bun scripts/backfill-engagement-sparks.ts` (à blanc), `--apply` pour écrire, `--only=counts|sparks`. **Borne basse** :
total à vie ≥ poche + Σ prix des frappes ; cycle ≥ poche + Σ prix des frappes depuis le dernier prestige ; niveau max à vie ≥ record du cycle.
Ne se reconstruisent pas : les points repris par la suppression d'un contenu, ceux effacés par un prestige passé. Voir l'en-tête de `engagementSparksBackfill.ts`.
