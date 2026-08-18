# Audit sync temps réel — cycle 63 ter (2026-08-17)

Branche : `claude/keen-hamilton-qchw0m` — repartie de `origin/main` (485d9a38).

> **TROIS exécutions de la routine ont tourné en parallèle sur la MÊME piste** —
> la n°1 du cycle 62 — et les trois ont livré. C'est le fait le plus instructif
> du cycle, et il vaut d'être consigné franchement, y compris ce qu'il coûte.
>
> | Passe | Branche / PR | Ce qu'elle a lu dans la piste | Statut |
> |---|---|---|---|
> | cycle 63 | `…-ndx3vw` / #3191 | le **PRIX** : l'arbitrage de coût était surcompté, `broadcastReadStatus` peut CALCULER pour 4 requêtes, et seulement sur lecture partielle | mergée |
> | cycle 63 bis | `…-mz6seg` / #3190 | le **VOCABULAIRE** : deux formes de fil pour trois faits ; troisième état, les quatre émetteurs instruits, les deux clients | mergée |
> | cycle 63 ter | `…-qchw0m` / #3193 | le **VOCABULAIRE**, indépendamment et au même moment | **superseded — ce journal** |
>
> Ce cycle-ci a conçu, écrit et vérifié la même réponse que le 63 bis : un
> troisième état sur `ConversationUnreadUpdatedEventData.bridge`, un module qui
> le nomme, les quatre émetteurs instruits, les deux clients, témoins RED
> prouvés par mutation. Les deux conceptions sont à ce point convergentes
> qu'elles ont produit **le même nom de fichier de journal** et **le même
> numéro de leçon**. La leur est arrivée sur `main` la première.

## 1. Ce que ce cycle ne livre PAS, et pourquoi

**Aucune ligne de production.** Le correctif est sur `main`, livré par #3190 et
#3191, et il est bon :

- `unreadBridgeField.ts` (`bridgeComputed` / `bridgeNotComputed`) dit exactement
  ce que disait le module de ce cycle (`bridgeKnowledgeFromCount`), avec une
  meilleure décomposition : deux fonctions qui NOMMENT les deux actes de parole,
  là où ce cycle passait un compteur à une règle ;
- la borne de l'instantané de reconnexion, la passe qui tombe, l'absence de
  constructeur : les trois y sont traitées, à l'identique ;
- les deux clients y sont, avec la même distinction clé-présente / clé-absente.

Re-livrer cela aurait été un doublon — et un doublon de contrat est exactement
la classe de défaut que les cycles 62 et 63 passent leur temps à retirer.

**Ce cycle a donc été réduit à ce que `main` n'a pas**, et son intégration a
consisté à prendre la version de `main` sur les 21 fichiers en conflit, à
supprimer son propre module et son propre fichier de témoins devenus
redondants (les 13 témoins de `broadcastReadStatus.test.ts` sur `main` couvrent
les 4 du fichier retiré, y compris la branche « accusés masqués » et le
`received`).

## 2. Ce qu'il livre

**De la documentation, aux trois endroits où un futur émetteur ira lire avant
d'écrire** — et qu'aucune des deux passes mergées n'a touchés :

1. **`services/gateway/src/socketio/README.md` disait UN émetteur.**
   « Un seul emetteur, `emitUnreadCountsToRecipients` » : vrai des chemins
   d'ENVOI, faux de l'ÉVÉNEMENT, qui en a quatre. Cette phrase est la condition
   même du défaut que trois cycles viennent de corriger — elle autorisait à
   instruire un émetteur en croyant les avoir tous instruits. Le tableau des
   quatre émetteurs et celui des trois états y entrent.
2. **`services/gateway/CLAUDE.md`** — la règle générale (« un champ qu'un client
   lit autoritativement n'est plus optionnel pour l'émetteur »), avec le tableau
   des trois formes et le renvoi à `bridgeComputed` / `bridgeNotComputed`.
3. **`apps/web/CLAUDE.md`** — la même table côté lecteur, et le discriminant
   RÉEL du code livré (`'bridge' in data`), avec le piège de test qu'il implique
   (un payload fabriqué avec `bridge: undefined` PORTE la clé, donc il efface ;
   sur le fil la question ne se pose pas, JSON ne transportant pas `undefined`).

**Et deux pièges de lecture** ajoutés en addendum à la leçon 232 — les seuls
points opérationnels que ce cycle avait et que l'autre n'a pas écrits :
`decodeIfPresent` seul aplatit clé-absente et `null` côté Swift ; le
discriminant JS porte sur la PRÉSENCE de la clé. Plus le corollaire de témoins
(`objectContaining` pour ce dont le témoin parle), jumeau de la leçon 231.

**Une entrée `CHANGELOG`** pour le troisième état : `main` porte l'entrée de
#3191 (le recalcul) mais **aucune** pour la grammaire du champ, qui est
pourtant le changement de contrat.

## 3. Vérification

| Gate | Résultat |
|------|----------|
| `jest` gateway (arbre intégré) | voir §5 |
| `jest` web | 691 suites / 13 437 tests verts (avant réduction ; l'arbre final ne touche plus de code web) |
| `vitest` shared | 83 fichiers / 2 168 tests verts |
| `tsc --noEmit` gateway / shared | 0 erreur |
| CI complète sur la version PRODUCTION de ce cycle | **verte** (`Summary: success`, iOS `Build app` compris) avant réduction |

La CI verte sur la version production a une valeur qui lui survit : elle
confirme que la conception retirée était correcte, y compris son décodage Swift.
Ce n'est pas ce qui la disqualifie — c'est son arrivée en second.

## 4. La leçon, et elle porte sur la ROUTINE elle-même

> **Trois exécutions concurrentes d'une même routine, partant du même carnet de
> pistes, convergent sur la même piste — et le travail en double n'est découvert
> qu'au merge.**

Ce n'est pas un accident : c'est le comportement NORMAL d'un carnet de pistes
ordonné et partagé. La piste n°1 était la mieux instruite, donc les trois passes
l'ont choisie. Le carnet, en rendant le choix rationnel, l'a rendu identique.

Ce que ce cycle a mesuré, en heures-machine : une conception complète, deux
suites complètes, une CI verte de bout en bout, deux intégrations manuelles —
pour zéro ligne de production livrée.

Deux corollaires actionnables, dans l'ordre du moins cher au plus structurant :

1. **Regarder `main` AVANT de concevoir, pas seulement avant de merger.** Ce
   cycle a fetché `origin/main` au démarrage (485d9a38) puis n'a regardé qu'à
   l'intégration — 4 heures plus tard, avec deux PR concurrentes déjà passées.
   Un `git fetch` + `list_pull_requests` au moment de CHOISIR la piste aurait
   montré #3190 et #3191 ouvertes sur ce site.
2. **Une piste prise devrait se déclarer.** Le carnet ordonne les pistes mais ne
   porte aucune trace de qui en a pris une. Un marqueur — commit d'annonce sur
   la branche, ou ligne dans le carnet poussée avant le travail — rendrait la
   collision visible à la minute plutôt qu'à l'heure. C'est la seule des deux
   qui ferme la classe ; la première ne fait que raccourcir la fenêtre.

## 5. Pistes pour le cycle 64

Le cycle 64 est déjà entamé sur `main` (#3195, l'alias d'accusé de lecture sans
client, et `tasks/realtime-sync-audit-2026-08-17-cycle64.md`). Les pistes
restantes du carnet, **à relire contre `main` avant de choisir** :

1. `conversations.infinite()` en pagination keyset (cycles 59/60).
2. La file hors-ligne par APPAREIL (cycle 58 §7).
3. `attachment:reaction-*` et `message:consumed` sans lecteur web (cycle 57
   §8-3) — décision produit.
4. Les deux ÉVÉNEMENTS avant les deux FUSIONS côté iOS (cycles 51/52/53).
5. `PUT /conversations/:id` accepte toujours de renommer un DM.
6. **Nouvelle** : balayer les autres champs optionnels à émetteurs multiples
   pour le NOMBRE D'ÉTATS qu'ils doivent porter — `location` sur
   `conversation:updated` en tête, dont la règle actuelle (« clé absente, jamais
   `null` ») mérite d'être relue à la lumière de ce lot.
