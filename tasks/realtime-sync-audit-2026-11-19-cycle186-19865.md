# Cycle 186 — le défaut était pire que son issue : il n'y avait pas de bouton du tout

*2026-11-19, à la suite du cycle 184 (#19802, fusionné dans `dev` par `b9525b350`).
Branche `claude/exciting-planck-dr9e11`. Instruit **#19865**, relevé par l'audit
adversarial de #19801 (constat A1).*

---

## Pourquoi celui-là

Le critère des trois cycles précédents — un défaut **mesuré** qui **supprime
une feature** et **s'auto-entretient** — et trois propriétés de plus :

- il est sur le chemin de la **remise de message** (phases 3 à 5 de la
  routine : file hors ligne, reprise, pièces jointes) ;
- la plateforme voisine prouve la bonne conception : iOS et Android persistent
  les OCTETS, jamais un identifiant serveur, et se réparent seuls ;
- aucune branche vivante n'écrit `apps/web/src/lib/send/` (relevé avant
  d'écrire).

Les deux candidats mieux placés du tri étaient **déjà pris** : #19881 par
`claude/exciting-planck-0vkcxe` et #19835/#19834 par
`claude/exciting-planck-wo4zwx` (cycle 185). La doctrine de la branche poussée
tôt a de nouveau tranché sans négociation — un `git diff --name-only
origin/dev...<branche>` sur les branches vivantes, avant la première ligne.

## Le défaut, mesuré — et l'issue le sous-estimait

L'issue décrit un « *« Réessayer » qui ne pourra plus JAMAIS réussir* ». Mesuré :

```ts
isPermanentFailure({ status: 404 })  // → true
```

`outcomeOf` classe tout 4xx hors 408/425/429 comme PERMANENT, et
`isPermanentFailure` gouverne — SEULE — l'existence du bouton « Réessayer » de
la bande d'envoi (`view/use-send.ts`, `components/failed-send-band.tsx`).
**Il n'y avait donc aucun « Réessayer ».** Et `flush` ne rejoue rien non plus :
`neverReachedServer` ne retient que le statut 0.

| ce que l'issue dit | ce qui est vrai |
|---|---|
| la reprise réutilise l'id et échoue | exact (`perform-send.ts:265` dans l'arbre livré) |
| « Réessayer » ne peut plus aboutir | il n'est **pas offert** |
| le `File` est encore là | exact — `upload.files`, et `revived()` le relit |

L'entrée restait donc dans le fil, en échec, sans aucun chemin : ni automatique,
ni manuel, ni au prochain lancement.

## Ce que le lot livre — deux moitiés, et aucune ne vaut seule

1. **`forgetUploadedIds`** (`outbox-store.ts`) — le geste INVERSE de
   `markUploaded`, appelé par `attempt()` sur le refus NOMMÉ, **avant**
   `markFailed` : l'entrée que la bande rend, que la file réécrit sur
   l'appareil et que `isPermanentFailure` interroge est déjà réparée. Il efface
   le LOT ENTIER, jamais le seul id nommé : la passerelle refuse l'envoi en
   bloc, donc rien n'a été attaché et les pièces survivantes du lot n'ont plus
   de porteur.
2. **`isPermanentFailure` consulte le CODE** (`api/outcome.ts`) — et
   `outcomeOf` reste INCHANGÉ, parce que ses vingt appelants décident de
   rollbacks optimistes sur des 404 qui, eux, sont définitifs. La divergence
   est documentée au site : les deux ne posent pas la même question (« ce
   MÊME appel rejoué à l'identique » / « cette ENTRÉE a-t-elle encore un
   espoir »), et la seconde porte sur une entrée que le client vient de
   modifier.
3. **Une phrase à l'utilisateur, dans les sept langues** —
   `send.failure.attachmentExpired`. Le 4xx générique disait « envoi refusé »,
   soit le contraire de ce que le produit fait désormais. Son jumeau par la
   forme est le refus de DROIT (`ATTACHMENT_RIGHT_NOT_PERMITTED`), dont la
   phrase est OPPOSÉE et que ce lot n'a pas touché — re-téléverser n'y
   changerait rien, et un témoin de non-régression le garde.

Le code vit dans `api/attachment-refusal.ts`, un module à lui : trois sites le
lisent, dans deux couches (la permanence, le chemin d'envoi, la phrase), et
`api/outcome.ts` — le prédicat GÉNÉRIQUE de l'issue d'un appel — ne doit pas
importer le port d'upload pour une chaîne. Il n'est **pas** partagé par
`@meeshy/shared`, et la raison est mesurée : la passerelle fige déjà la chaîne
par un témoin (`messages-send-attachment-admission.test.ts`, deux sites, qui
traverse le sérialiseur par `app.inject` sans doubler `api-schemas` — donc le
piège « fast-json-stringify supprime `code` » est écarté) — même discipline que
son voisin.

*(La première rédaction de ce paragraphe invoquait un CYCLE d'imports. Mesuré
faux par l'audit : la dépendance d'`attachments.ts` vers `conversations.ts` est
un `import type`, effacé à la compilation. La décision tient, sa raison
d'alors non — et c'est la forme exacte de la règle que ce dépôt applique aux
autres : **une raison écrite est une affirmation**.)*

## Ce que le lot refuse de livrer

**Aucun rejeu AUTOMATIQUE.** Faire entrer ce refus dans `neverReachedServer`
ferait repartir l'entrée sans geste de l'utilisateur, et un second refus (une
pièce que le serveur refuse pour une autre raison) tournerait en boucle de
téléversements. La sortie est un CONTRÔLE, offert et nommé.

## Preuve

Rejouée sur l'arbre FUSIONNÉ avec `dev` (`839daad993`, sept commits du cycle
185 — intersection de fichiers VIDE avec ce lot), comme la directive du
2026-11-15 l'exige.

- **RED prouvé par mutation, une par garantie** :

  | mutation | ce qui tombe |
  |---|---|
  | l'oubli des ids retiré | **4** témoins |
  | `isPermanentFailure` revenu à sa forme d'avant | **2**, dont celui de la phrase |
  | la clé retirée du catalogue allemand | le témoin de langues **et** `i18n-catalog.test.ts` |
  | `forgetUploadedIds` ignore son `clientMessageId` | **1** (l'envoi voisin) |
  | le prédicat ne regarde que le CODE | **1** (403/409 porteurs du même mot) |
  | l'oubli déplacé APRÈS `markFailed` | **1** (aucun état publié ne porte « en échec » ∧ ids) |

- `perform-send-stale-attachment.test.ts` **9 verts** — la revivification
  depuis IndexedDB, le lot PARTIEL, l'envoi voisin, la séquence publiée, le
  404 d'un AUTRE refus, et les bornes du prédicat ;
- `src/lib/send/` entier : **520 verts** ; `failure-reason.test.ts` **19** ;
- `tsc --noEmit` : **EXIT=0** sur `apps/web` **et** sur `services/gateway`
  (que la fusion a fait bouger) ; `bun run build` : **EXIT=0** ;
- **suite complète `apps/web` : 34 755 verts / 1 rouge**, et ce rouge
  PRÉEXISTE à ce lot — `src/test-support/act-leak-guard.test.ts`, vérifié en
  rejouant sur `dev` stashé (même échec, `3 attendus / 0 reçus` : ce témoin
  méta lance un `bun test` imbriqué, qui ne rend rien dans ce conteneur) ;
- gates statiques verts : `check-git-tracking` (qui a attrapé le nouveau
  fichier non suivi), `check-utilities`, `measure-weight`, `check-api-source`,
  `check-web-api-literals`. **Non mesurés dans ce conteneur** :
  `check-design-harmony` échoue sur 9 violations dans 8 fichiers que ce lot ne
  touche pas (même échec sur `dev` stashé), et les gates à navigateur sur
  l'absence de `chrome-headless-shell` — la CI les porte.

## Les jumelles ont été ouvertes — et mon énumération en oubliait la plus proche

`unsentComments` porte la même phrase dans son doc-comment — « le corps déjà
composé, ses `attachmentIds` compris — rien ne remonte une seconde fois » — sur
des `PostMedia` que `sweepPendingPostMedia` balaie **aussi à 24 h**. Elle n'est
pourtant pas atteinte, pour deux raisons de conception : elle est en MÉMOIRE
seule, et sur un refus définitif elle REND le texte et les pièces au brouillon.
`talkie-voice-copy.ts` téléverse et envoie d'un seul geste, sans rien
mémoriser.

**L'audit en a trouvé une troisième, et c'est la plus proche de toutes :**
`apps/web/src/lib/stories/studio-outbox.ts` — une file **DURABLE** (IndexedDB),
qui mémorise la référence serveur d'un média déjà monté, sur la table que
`sweepPendingPostMedia` balaie au MÊME seuil. Elle est saine, mais par un
mécanisme encore différent : à la relecture elle repose
`upload = { phase: 'uploading' }` et **re-téléverse** au lieu de réutiliser
l'id. Sa fenêtre résiduelle est un onglet laissé ouvert plus de 24 h sans
rechargement.

> **Trois jumelles, trois mécanismes de salut DIFFÉRENTS, et aucun n'est celui
> qu'on cherchait.** J'avais balayé « qui mémorise un `attachmentIds` ? » —
> la troisième n'emploie pas ce mot. C'est la leçon 261 une fois de plus : *ce
> que je viens de nommer est-il la propriété, ou seulement le mot par lequel je
> l'ai trouvée ?* La propriété est « une file qui survit à l'onglet et
> mémorise une poignée serveur » ; le mot était un nom de champ.

---

## L'audit adversarial a rendu RÉSERVES, et il a payé trois fois son passage

### 1. La branche ne contenait plus la tête de `dev` (bloquant procédural)

`dev` avait avancé de sept commits (cycle 185, #19835/#19834) pendant la CI de
ce lot. La directive porteur du 2026-11-15 (#18654) exige la fusion AVANT la
PR et le rejeu des gardes **sur l'arbre fusionné**. L'intersection des fichiers
est VIDE (dev ne touche que `services/gateway/` et trois journaux), la fusion
est donc triviale — et la règle vaut quand même, parce que « triviale » est une
mesure, pas une dispense.

### 2. Trois mutations de production restaient VERTES

| mutation | ce qu'elle casse | le témoin posé |
|---|---|---|
| `forgetUploadedIds` ignore `clientMessageId` | **deux envois en attente dans la même conversation** : le refus de l'un fait oublier les ids de l'autre, dont la reprise re-téléverse pour rien | une entrée refusée À CÔTÉ d'une entrée en panne passagère |
| l'oubli déplacé APRÈS `markFailed` | un arrêt brutal entre les deux `set` persiste « en échec » avec l'id mort ⇒ un premier « Réessayer » inutile | tous les états PUBLIÉS par le magasin sont relevés : aucun ne porte `failed` ∧ ids |
| le prédicat ne regarde que le CODE | `ATTACHMENT_NOT_FOUND` est servi ailleurs (`routes/posts/core.ts`) : un futur 403 porteur du même mot ferait oublier des ids | le prédicat est borné par `status === 404`, et un témoin l'exerce sur 403/409 |

**Aucun témoin n'avait deux entrées dans une conversation.** C'est le trou que
je n'aurais pas vu : tous mes scénarios sont écrits au singulier, parce que le
défaut se raconte au singulier.

### 3. Quatre affirmations fausses, dans un lot qui en fait sa doctrine

Le numéro de ligne (264 → 265), le cycle d'imports (inexistant), le
doc-comment de `forgetUploadedIds` (« rien n'a été attaché » — faux : le
RÉESSAI admet explicitement une pièce déjà portée par le message de ce même
`clientMessageId`), et un commentaire de témoin affirmant « le SEUL 4xx que la
bande propose de rejouer » alors que 408/425/429 en sont. Les quatre sont
corrigées.

> **Le lot écrivait, dans son propre journal, que le dépôt traite un chiffre et
> une raison comme des affirmations — et il en a publié quatre sans les
> mesurer.** Comme au cycle 184 : *une règle de méthode ne se transporte pas
> d'un outil à son voisin, elle se réapplique.*

### Ce que l'audit a vérifié sans rien trouver

L'idempotence par `clientMessageId` tient même quand les `attachmentIds` ont
changé (aucun message en double, aucun doublon de pièce) ; les checkpoints TUS
sont auto-réparants (un 404 purge le checkpoint et repart à neuf) ; rien de
cryptographique n'est touché (le web ne chiffre rien avant téléversement, et
`attempt` refuse en amont tout clair vers une conversation vue chiffrée) ; un
id oublié ne donne accès à rien ; la protection d'une pièce n'est pas perdue au
re-téléversement (elle est posée à l'ASSOCIATION, depuis les drapeaux du
message) ; `discardSend` ne supprime pas les pièces téléversées, donc l'oubli
n'ouvre aucune fuite d'octets par abandon.

## Ce qui n'a pas été mesuré, et ne doit pas se lire comme vert

- **Le comportement sur un vrai navigateur après 24 h** : la fenêtre du
  balayage n'est pas rejouable en témoin, et personne n'a vu l'entrée se
  réparer sur un appareil.
- **L'arriéré** : combien d'entrées d'outbox portent aujourd'hui, chez de
  vrais lecteurs, un id balayé. Elles se répareront au premier
  « Réessayer » — mais le compte n'existe nulle part.
- **#19917 — ce que le bouton allume dans un cas COMPOSÉ.** Si le message
  existe déjà sous ce `clientMessageId` (envoi #1 commité puis tombé en 5xx,
  association avalée par un `catch`), le dédoublonnage précoce de la passerelle
  rend « succès » **sans associer** les pièces neuves : l'expéditeur voit
  « envoyé » avec ses aperçus locaux, et la pièce n'existe pour personne. La
  pièce était déjà perdue à l'association ratée — le lot ne détruit rien de
  plus, il change ce que l'EXPÉDITEUR croit, et c'est la direction d'erreur que
  ce fichier même déclare inacceptable. Établi par LECTURE du code, pas par
  exécution contre une base.
- **#19918 — la quatrième cause du 404.** « Pas encore visible par ce chemin »
  (lecture servie en retard) déclenche un re-téléversement du lot entier là où
  un rejeu à l'identique aurait suffi. L'envoi aboutit ; c'est le coût qui est
  injustifié.
- **Le coût par reprise** : chaque « Réessayer » mint une copie orpheline
  COMPLÈTE du lot (octets et lignes), réclamée au balayage suivant (24–48 h).
  Pour un média protégé, cette copie est une ligne SANS drapeau de protection —
  son URL n'est connue que de son auteur, mais c'est un multiplicateur à dire.
- **Le scénario de #19917 contre un vrai MongoDB**, et la suite complète
  rejouée par l'audit (il a couvert `src/lib/send/`, `src/lib/api`,
  `src/lib/view` et `failed-send-band` — 9 400 verts — pas les 34 752).

La leçon du cycle est versée dans
`tasks/lessons/2026-11-19-un-correctif-dont-la-sortie-est-un-bouton-qui-n-existe-pas-n-a-repare-personne.md`.
