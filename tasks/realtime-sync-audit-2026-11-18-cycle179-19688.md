# Cycle 179 — l'amont gardait la LECTURE, et trois cliquets sont devenus aveugles en même temps

*2026-11-18, à la suite du cycle 178 (#18760, fusionné dans `dev` par
`19aa3d2ce0`). Branche `claude/exciting-planck-4dbkfo`. Instruit **#19688**,
relevé par l'audit adversarial de la PR #19686 comme « la correction la plus
importante que cet audit a produite ».*

---

## Pourquoi celui-là

Les suivis disponibles du cycle 178 étaient : #18760 (instruit, son réglage est
un ARBITRAGE qui revient au porteur), #19604 (BLOQUÉ par #19603, une
`décision-produit` non tranchée), #19612 / #19613 (de l'outillage). La
cartographie des issues ouvertes du jour a rendu une famille gateway de six
issues autour de la même loi d'appartenance, dont #19688 dit explicitement
qu'elle **tarit la source** que les cinq autres filtrent :

> #19677 propose de trier et resserrer 199 lookups de lecture. Celui-ci tarit la
> source. Un état impossible n'a pas besoin d'être filtré 199 fois.

C'est le critère retenu : entre un lot qui garde un état et un lot qui
l'empêche d'exister, le second rend l'autre moins urgent, et l'inverse n'est pas
vrai.

## Le défaut, mesuré aux trois portes

`resolveConversationEntry` refuse un banni. C'est vrai, c'est testé, et
**c'est vrai de la LECTURE seulement.** `resolveBanWrite` n'écrit QUE `bannedAt`
quand la cible est déjà inactive, si bien qu'un bannissement commis entre la
décision `'rejoin'` et l'écriture laissait celle-ci poser `isActive: true` sur
une ligne BANNIE — l'état qu'aucune lecture du service ne sait refuser, et que
#19525, #19604 et #19676 refusent tous les trois.

Le RED, mesuré par un témoin de COURSE par porte :

| porte | ce que la porte rendait sur une ligne bannie dans sa fenêtre | `isActive` |
|---|---|---|
| ajouter un membre (`memberAdmission`) | `outcome: 'rejoin'` | **`true`** |
| lien de partage (`performLinkJoin`) | `kind: 'joined'` | **`true`** |
| invitation (`POST …/invite`) | `500` (l'aval tombait APRÈS l'écriture) | **`true`** |

La quatrième porte — `restore-for-me`, #10436/#10443 — portait la garde dans son
`where` **et disait pourquoi**. Une sur quatre.

## Ce qui rend le témoin capable de tomber

Un `jest.fn().mockResolvedValue(row)` rend la ligne quelle que soit la clause :
il ACCEPTE l'écriture que la production doit refuser, et **aucune des trois
portes ne pouvait rougir**. Le double manquant est `updateIn`
(`__tests__/helpers/mongo-where.ts`), qui ÉVALUE le `where` contre la ligne et
lève `P2025` comme le vrai client sous une clause étendue.

> C'est le jumeau de « un double Prisma qui rend `[]` rend tout témoin de
> contenu trivialement vert », pris par l'autre bout : **un double ment aussi
> par ce qu'il ACCEPTE**, et ce mensonge-là ne se voit jamais, parce que le test
> qu'il sert PASSE.

## Le correctif

`commitParticipantRejoin` (`services/conversations/rejoinParticipantWrite.ts`)
porte `unsetOrNull('bannedAt')` dans le `where` et le `catch` P2025 qui relit la
ligne pour SÉPARER les deux causes que `P2025` confond — bannie, ou disparue.
Les trois portes commettent par cette unité et rendent chacune SON refus
(403 `BANNED`, le verdict `banned` du lot, `sendForbidden`) ; la ligne disparue
est fail-closed, jamais recréée. La note de `REJOIN_PARTICIPANT_STATE` cesse
d'affirmer que l'amont suffit.

## Ce que le lot a trouvé en se faisant : TROIS cliquets aveuglés d'un coup

C'est la partie du cycle qui apprend quelque chose, et elle n'était pas dans
l'issue. Centraliser l'écriture a déplacé la frontière que trois cliquets
gardent, **sans qu'une ligne de leurs inventaires bouge** :

| cliquet | ce qu'il a fait |
|---|---|
| `participant-reactivation-writers-sweep` (#10436) | est resté **VERT** avec un inventaire vidé de ses trois rentrées |
| `participant-reactivation-rejoins-room-sweep` (#16964) | n'a rougi que par sa **sonde de non-vacuité** (« ≥ 5 sites », tombée à 2) |
| `participant-language-producer-sweep` (#4662) | a classé l'unité partagée **`sans-langue`** — « ce site n'écrit pas la colonne », ce qui est FAUX |

Les deux premiers portaient **la même copie du scanner** : ils ne cherchaient
que `.participant.update(`, donc ils sont devenus aveugles ENSEMBLE. Le scanner
vit désormais une fois (`helpers/participant-reactivation-scan.ts`), avec les
deux graphies déclarées au même endroit.

Le troisième est le plus cher, parce que son verdict n'était pas un silence mais
une **affirmation fausse du côté qui absout** : un `data` posé en RACCOURCI
(`{ where, data }`) n'a pas de valeur dans l'objet, `valeurDeCle` rend
`undefined`, et le balayage concluait « aucun objet de données ». Les trois
`language` des rentrées ont quitté la surveillance en silence. Corrigé dans les
deux sens — l'opener voit `commitParticipantRejoin(`, et un `data` en raccourci
rend `non-resolue`, jamais `sans-langue`.

> **Un cliquet qui cherche une GRAPHIE mesure cette graphie, pas la propriété.**
> C'est la règle du cycle 105 — chercher une forme par son NOM de déclaration
> manque tous les sites qui l'obtiennent autrement — prise par l'autre bout :
> ici, **c'est la RÉPARATION qui a rendu les sites invisibles.** La question à
> poser à tout lot qui centralise une écriture est donc : *quels inventaires
> nommaient les sites que je viens de faire disparaître, et que disent-ils
> maintenant ?* Un cliquet resté vert après une telle manœuvre n'atteste rien.
>
> Et le corollaire sur sa sonde : des trois, **seul celui qui portait une borne
> de NON-VACUITÉ a rougi.** Une telle sonde n'est pas une formalité — c'est le
> seul organe qui distingue « rien à signaler » de « je ne vois plus rien ».

## Preuve

- **3 témoins de COURSE**, un par porte (`rejoin-ban-race.test.ts`), RED prouvé
  et nommé ci-dessus, VERT après le lot ;
- **mutation** : une porte remise à un `update` NU ⇒ 2 témoins tombent (le sien
  et le cliquet de graphie nue) ;
- **`updateIn`** : nouveau double, lève `P2025` sur clause non appariée, applique
  l'écriture à la ligne en mémoire ;
- 4 cliquets repris avec leur raison écrite : les deux de réactivation (scanner
  partagé), le recensement des portes d'activation (#19080 — la rentrée a quitté
  les trois portes pour l'unité partagée, 2 → 1 écriture chacune), et le
  producteur de langue (#4662) ;
- 3 témoins de contrat resserrés : ils assertaient `where: { id }` NU, ils
  assertent désormais **l'id ET la garde** ;
- **suite gateway complète** : `Test Suites: 7 failed, 2885 passed, 2892` /
  `Tests: 18 failed, 43694 passed` — les 7 échecs sont **identiques, suite pour
  suite et test pour test, sur un worktree de `origin/dev` nu** (6 suites
  d'images HEIC/AVIF/EXIF, environnementales, et `call-live-frame-events`). Le
  lot n'en ajoute aucun ;
- `tsc --noEmit` vert sur `services/gateway` et `packages/shared`.

## Suivis

- **#19677** (199 lookups `isActive: true` nus) reste ouvert, et ce lot en
  diminue l'urgence sans l'annuler : il tarit le producteur VIVANT, pas les
  lignes déjà en base.
- **#19604** reste bloqué par **#19603** (`décision-produit` : un membre banni
  peut-il RETIRER une réaction qu'il a posée ?).
- **#19688** est fermée par ce lot.
- Les cliquets de rentrée n'ont **aucun équivalent sur les écritures de
  `CommunityMember`** — la jumelle de `Participant` (§ « Cette entité a-t-elle
  une JUMELLE ? »). Non mesuré ici, et c'est une question, pas un constat.
