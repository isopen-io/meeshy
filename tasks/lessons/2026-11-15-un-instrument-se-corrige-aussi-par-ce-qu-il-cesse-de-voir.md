## Un instrument se corrige aussi par ce qu'il CESSE de voir (cycle 166, #18632)

Le balayage des sorties d'acquittement (`ack-exit-sweep.ts`) a été faux trois
fois avant d'être juste, et la troisième erreur n'a été vue que par accident.

**Correction 1 — la portée d'un `catch`.** 46 constats. `.catch(` d'une promesse
comptait comme un bloc d'erreur, et le compte d'accolades partant de
`} catch (error) {` — net NUL — refermait le bloc à sa première accolade
fermante, donc avant l'acquittement des trois handlers qui en portent un. Plus :
un `catch` IMBRIQUÉ absorbe l'échec d'une opération best-effort et le corps
CONTINUE — ce n'est pas une sortie. 46 → 13.

**Correction 2 — la dominance.** Un acquittement rendu dans un bloc ANCÊTRE
compte : `CommentReactionHandler` acquitte son succès, puis sort d'un
`if (reaction.unchanged) { return; }` quelques lignes plus bas. Un balayage borné
au bloc intérieur le déclarait muet. 13 → 12.

**Et c'est là qu'il faut s'arrêter.** La correction 2 était juste, et elle a fait
**DISPARAÎTRE** un constat vrai : `relayTranscriptionSegment` ouvre par
`const { userId, data, ack } = request;` — une **déstructuration**, à la
profondeur qui domine tout le corps. Elle déclarait acquittées les sorties d'une
unité dont le refus `NOT_A_PARTICIPANT` ne rend rien. Le compte a baissé de 13 à
12 en ayant l'air de s'affiner ; c'est un faux négatif qui venait d'entrer.

> **Après chaque raffinement d'un instrument, relire les constats PERDUS, pas
> seulement les constats gagnés.** Un instrument qui s'affine fait baisser son
> compte dans les deux cas — quand il retire du bruit, et quand il devient
> aveugle. Les deux se ressemblent exactement : un nombre qui descend.

**Correction 3 — nommer n'est pas rendre.** C'est le cycle 107 par l'autre bout.
« Un balayage qui cherche UN idiome mesure sa popularité » ; **un balayage qui
cherche un NOM mesure sa portée lexicale.** Le discriminant juste est un APPEL
(`ack?.(…)`) ou une REMISE (`_sendError(callback, …)`, `admitCallCaptions(…,
{ … ack })`, l'argument sur sa propre ligne) — jamais une DÉCLARATION.

### Corollaire : un cliquet qui punit le correctif juste se fait désarmer

Les cinq refus de `call:signal` répétaient `socket.emit(CALL_EVENTS.ERROR, …);
return;`. La réparation élégante n'est pas de recopier `ack?.(…)` cinq fois —
c'est UN `refuse(code, message)` qui dit le refus sur les DEUX canaux de sorte
qu'ils ne puissent plus diverger. Mais `refuse(…)` ne NOMME pas `ack` : un
balayage qui cherche le nom du rappel aurait **nommé fautives les sept sorties
réparées.**

> **Avant de geler un cliquet, lui faire lire le correctif qu'on souhaiterait
> voir écrit.** S'il le refuse, ce n'est pas le correctif qu'il faut aplatir.

Le balayage admet donc une fermeture LOCALE dont le corps rend l'acquittement —
la forme « remise » déjà reconnue, avec un avantage qu'aucun callee d'un autre
module n'offre : on peut VÉRIFIER qu'elle rend.

### Et le volet de choix : préférer le faux positif

Ce balayage admet une ligne ambiguë comme rendant l'acquittement, et le dit dans
son doc-comment. **Un faux positif fait OUVRIR le site ; un faux négatif le
tait.** Pour un cliquet dont l'inventaire doit tendre vers le vide, seul le
premier est récupérable.

### Et l'instrument le plus faux du cycle était ma façon de LIRE un résultat

Même cycle, autre erreur, et celle-ci n'était pas dans un balayage mais dans un
`tail`. La suite complète du gateway a rendu **18 rouges sur 41 662** ; mon
journal de run n'avait gardé que la fin du flux, donc UN seul des sept noms —
`UploadProcessor` HEIC, qui nomme sa cause en clair. J'ai écrit
« environnementaux », au pluriel.

La CI a nommé celui qui ne l'était pas : la règle 3 du budget de taille des
suites (`CallEventsHandler.test.ts : 4650 → 4656`), c'est-à-dire mon propre
diff, contre une règle que le dépôt énonce explicitement — *ajouter à un fichier
déjà hors budget est interdit*.

> Le dépôt porte déjà « attribuer un rouge à la machine est une AFFIRMATION qui
> se vérifie » (#18466). La forme neuve est plus précise : **je n'ai pas affirmé
> qu'un rouge était environnemental, j'ai affirmé qu'un ENSEMBLE de rouges
> l'était en ayant lu un seul de ses membres.** Un échantillon de taille 1 ne
> décrit pas un ensemble de 7, et un `tail` en rend toujours un.

Le geste qui coûte deux secondes : capturer `| grep -E "^(FAIL|Tests:)"` AVANT
de qualifier quoi que ce soit. **Un verdict sur un ensemble exige l'énumération
de l'ensemble** — c'est la même exigence que « un compte se compte, il ne
s'hérite pas » (cycle 93), appliquée à mes propres sorties d'outil.
