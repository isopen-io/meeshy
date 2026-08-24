# Cycle 117 — une couverture PARTIELLE retenait le watermark, une couverture NULLE l'avançait

Point de départ : un balayage de la garantie d'ORDRE et de RATTRAPAGE
(`_seq`, `/sync`), et non un suivi hérité. Les cycles 106 à 116 ont gouverné très
finement ce que la file hors ligne CONTIENT et comment elle est ATTEINTE.
Personne n'avait regardé l'autre canal de rattrapage — celui qu'un appareil
appelle au retour de veille.

---

## 1. Ce qui a été mesuré et trouvé SAIN — à écrire avant le défaut

Un audit qui ne publie que ses trouvailles laisse croire que tout le reste n'a
pas été regardé. Trois axes instruits, trois axes clos :

| axe | mesure | verdict |
|---|---|---|
| LOCKSTEP `_seq` | 2 sites serveur (`emitWithSeq`), tous deux `notification:new` ; 3 clients l'observent sur ce MÊME événement (web `observeSyncSeq`, iOS `SyncSeqTracker.observe`, Android idem) | **tient** |
| portée de `_seq` | les 2 sites sont user-scoped ; aucun n'émet vers une room de conversation, ce qui distribuerait le compteur d'un user aux autres | **tient** |
| `checkpointSeq` | `/sync` lit par `currentSeq` (PEEK), jamais `nextSeq` — un checkpoint qui allouerait creuserait un faux trou de 1 à chaque reconnexion | **tient** |

Et un FAUX POSITIF instruit puis écarté : `gapAction` a d'abord semblé absent du
schéma de réponse — la forme exacte de la famille « forme 1 » du dépôt, où
fast-json-stringify supprime le champ. Il est **déclaré** (`syncResponseSchema`,
`gapAction: { type: 'string', nullable: true }`). La règle du cycle 84 tient : on
ouvre le schéma avant de qualifier une suppression.

---

## 2. Le défaut : deux `describe` voisins, deux règles CONTRAIRES sur le même invariant

Le `checkpoint` rendu par `/sync` n'est pas un horodatage, c'est une
**AFFIRMATION** : « tout ce qui a changé jusqu'ici t'a été livré ». Le client le
renvoie en `since`, et la borne serveur est **stricte** (`updatedAt > since`).
Une affirmation non démontrée creuse donc un trou **définitif** — et le dépôt
l'écrit déjà mot pour mot, dans le docblock de `SYNC_CHECKPOINT_LAG_MS` :

> Tout ce qui n'est pas dans CETTE réponse mais porte un `updatedAt` antérieur au
> checkpoint tombe donc dans un trou DÉFINITIF — le client ne le redemandera
> jamais.

Le dépôt tenait cette règle **pour la troncature**, et l'énonçait :

```ts
// Une page TRONQUÉE n'a pas livré toute la fenêtre … Avancer le watermark ici
// affirmerait une couverture non démontrée, et le client qui l'adopterait
// perdrait tout l'arriéré d'un coup — définitivement.
checkpoint: (hasMore ? sinceDate : checkpoint).toISOString(),
```

Il ne la tenait sur **aucune des deux réponses qui ne livrent RIEN** :

| réponse | fenêtre couverte | watermark AVANT ce lot |
|---|---|---|
| page tronquée (`hasMore`) | **partielle** — le reste est un arriéré | **tenu** à `since` ✅ |
| chemin de gap (`hasGap`) | **nulle** — la requête est court-circuitée | **AVANCÉ** ❌ |
| aucune collection servie | **nulle** — rien n'est lu | **AVANCÉ** ❌ |

Le chemin de gap est le **maximum exact** du cas que la règle de troncature
protège. Une couverture partielle retenait le watermark ; une couverture nulle
l'avançait.

### La taille du trou, mesurée

Le témoin RED le chiffre : sur `since = 2026-07-01`, la réponse de gap rendait
`checkpoint = 2026-08-23T23:52:20`. **Près de deux mois** de fenêtre, affirmés
couverts par une réponse dont le corps est `{ added: [], modified: [], deleted: [] }`.

---

## 3. Pourquoi `gapAction` ne rattrape rien

L'objection naturelle : « le client est prévenu, `gapAction:
'full_resync_required'` ». Elle ne tient pas, pour deux raisons de nature
différente.

**La première est de principe.** `gapAction` est une **INSTRUCTION**. Une réponse
ne peut pas dépendre de ce que son destinataire en fera pour rester sûre. La
resync complète peut être différée, échouer hors ligne, être interrompue par un
kill d'application — et dans ces trois cas le watermark a DÉJÀ avancé, parce
qu'il voyageait dans la même réponse.

**La seconde est mesurée.** `hasGap` et `gapAction` ont **zéro consommateur** sur
les trois clients — un `grep` sur `apps/` + `packages/` ne rend rien. Aucun
client n'appelle `/sync` aujourd'hui.

> **C'est donc un piège ARMÉ, pas une panne — et il faut le dire dans ce sens.**
> Annoncer une panne qu'on n'a pas mesurée coûte la confiance dans les cycles où
> il y en a une (règle du cycle 103). Ce qui ne change rien à la conclusion : la
> règle du cycle 84 dit qu'on ne laisse pas un piège armé au motif que personne
> n'a encore marché dessus. Le premier client qui câble `/sync` — et le SDK iOS
> porte déjà sa moitié, `SyncWatermark.advancedAfterDeltaPage` — hérite d'un
> watermark qui ment, et son seul symptôme sera des messages qui manquent.

---

## 4. La troisième façon de ne rien couvrir, que personne ne cherchait

`collections` est validé par `z.string().min(1)`. La chaîne `','` franchit donc
la validation, se réduit à `[]` après `.filter(Boolean)`, ne déclenche **aucun**
`UNSUPPORTED_COLLECTION` (il n'y a rien d'inconnu dans une liste vide) — et
`hasMore`, calculé par un `.some()` sur zéro collection, vaut `false`.

Rien n'était lu, et le watermark avançait quand même. Même invariant, troisième
porte.

---

## 5. Le correctif : écrire la règle en POSITIF

Le défaut n'est pas qu'un cas manquait, c'est que la règle était écrite **en
négatif** — une liste de refus, à laquelle il faut penser à ajouter une ligne.
Une telle liste est en retard par construction, et son retard ne ressemble pas à
une erreur : il ressemble à du code qui passe.

```ts
const coveredTheWindow = !hasMore && !hasGap && Object.keys(collectionsResult).length > 0;
checkpoint: (coveredTheWindow ? checkpoint : sinceDate).toISOString(),
```

Le nom porte l'invariant. Une nouvelle façon de ne rien couvrir doit désormais
**s'ajouter ici**, à l'endroit où la question se pose, plutôt que s'oublier
ailleurs.

**La direction est fail-safe, et c'est ce qui la rend décidable sans arbitrage** :
retenir le watermark ne coûte qu'une RELECTURE bornée, que le client déduplique
par `id` ; l'avancer à tort est irréversible. Entre les deux erreurs possibles,
une seule se rattrape.

**Et la garde est posée à la SOURCE, pas chez le client.** Un client qui adopte
`checkpoint` sans condition est désormais correct — il n'y a plus de checkpoint
menteur à adopter. C'est pourquoi ce lot ne touche PAS
`SyncWatermark.advancedAfterDeltaPage` : lui ajouter un paramètre `hasGap`
déplacerait la règle chez le consommateur, où chaque nouveau client devrait la
retaper (règle du cycle 92 bis : une règle qu'il faut retaper à chaque site est
une règle qu'un site finira par ne pas avoir).

---

## 6. Le témoin qui GELAIT le défaut, et ce qu'il faut en retenir

Le comportement n'était pas un oubli : il était **gelé par un témoin**, à vingt
lignes du témoin qui gèle la règle contraire.

```ts
it('applies the same watermark on the gap path, which returns no items at all', …)
```

L'intitulé **NOMME le défaut** — « which returns no items at all » — et le
présente comme une uniformité désirable (« the same watermark »). Or la seule
chose que le chemin de gap partage avec les autres est précisément de n'avoir
rien couvert.

> **Une uniformité n'est une vertu que si les cas unifiés se ressemblent par ce
> qui COMPTE.** Ici « le même watermark » unifiait une réponse qui a tout livré
> et une réponse qui n'a rien livré, sur le seul critère qu'elles sont toutes
> deux `hasMore: false`. C'est la famille du cycle 114 (« un témoin qui nomme
> correctement la moitié qu'il garde GÈLE l'autre »), avec une variante plus
> retorse : celui-ci nommait le fait GÊNANT et l'énonçait comme une garantie.

Devant un intitulé de témoin qui décrit une réponse VIDE, la question est :
*et c'est bien ?*

---

## 7. Vérifié / non vérifié — la distinction est la mesure

- [x] **RED prouvé sur les trois témoins neufs**, avant correctif, avec la taille
      du trou lisible dans le diff d'assertion (`2026-07-01` attendu,
      `2026-08-23` reçu).
- [x] **Le témoin NÉGATIF était vert AVANT le correctif** — « une page complète,
      servie, sans gap, avance quand même ». C'est lui qui prouve que le
      correctif n'est pas « geler le watermark », ce qu'un lot de trois témoins
      tous rouges aurait laissé passer.
- [x] **Chaque clause est PORTANTE, mesuré par mutation** : retirer `!hasGap` →
      2 témoins tombent ; retirer `Object.keys(...) > 0` → 1 ; retirer
      `!hasMore` → 3. Aucune clause n'est décorative.
- [x] `sync.test.ts` **69/69** · gateway `tsc --noEmit` **0 erreur**.
- [x] Suite gateway complète rejouée — aucune autre suite ne dépendait du
      comportement gelé.
- [ ] **Swift non compilé** : aucune chaîne d'outils sur cette machine. Ce lot ne
      touche aucun Swift (décision du §5), donc rien à y mesurer — mais la
      limite est écrite plutôt que passée sous silence.

---

## Reste ouvert

- [ ] **`emitWithSeq` BRÛLE un `_seq` sur timeout, et son docblock affirme le
      contraire.** Il annonce dégrader « exactement comme un rejet » ; c'est
      faux. `Promise.race` n'annule pas le perdant : l'`upsert` `nextSeq`
      aboutit après le délai et **incrémente** le compteur, pendant que
      l'événement est déjà parti SANS `_seq`. Un rejet, lui, n'incrémente rien.
      Conséquence : le client voit son prochain `_seq` sauter de N à N+2, donc un
      trou d'un événement qu'il a pourtant REÇU — une resync complète pour rien
      (web : `observeSyncSeq` → `emitDesync('gap')`). Coût modeste et LIVE, sur
      le seul chemin `_seq` câblé aux trois clients. Lot séparé : le correctif
      demande de décider quoi faire d'une allocation qui arrive après son
      émission, ce qui n'est pas une correction locale.
- [ ] **`hasGap` se calcule sur un compteur qui ne compte pas la même chose.**
      `checkpointSeq` ne dénombre que les `notification:new` (seuls sites
      `emitWithSeq`), et le gap qu'il déclenche blanchit la collection
      `messages`. Le proxy est défendable, il n'est pas énoncé — à instruire le
      jour où une seconde famille d'événements sera estampillée.
