# Audit de synchronisation temps réel — cycle 150 (2026-11-08)

Branche `claude/exciting-planck-asw4sp`, partie de `origin/dev` à `1793afe61` :
la PR du cycle 149 a été fusionnée, et une PR fusionnée ne reçoit pas de suite.

Le cycle 148 avait rendu onze constats ; trois sont devenus ses lots, huit des
issues (#17075 à #17082). Le cycle 149 en a pris quatre. Ce cycle-ci prend les
**trois derniers qui sont des lots** — #17080, #17081, #17076 — et laisse
#17075, qui porte le label `décision-produit` : « supprimer pour moi » met fin à
l'appartenance pour tout le monde sans l'annoncer, et les deux issues possibles
(le geste redevient personnel / le geste annonce son départ) changent ce que le
produit PROMET. Ce n'est pas à une session de le trancher.

## Lot K — l'enveloppe de l'appareil, et ce qu'elle a le droit de porter (#17080)

L'issue décrivait une ABSENCE, et elle était juste : `encryptedContent` ne
partait que sur l'éventail `regular`, si bien qu'en conversation chiffrée de
bout en bout une RÉPONSE ou une MENTION restait « 🔒 💬 » à vie — la NSE ne
remplace le corps par le clair que si la clé est non vide, et
`createNotification` lit `context.encryptedContent || ''`.

**La vérification en primaire a trouvé l'autre moitié, et elle est l'inverse
exacte.** Le champ voyage sous le seul `showPreview`, hors du second verrou
`notificationLocKey` qui retient déjà le média (cycle 125) et le corps
pré-enregistré (cycle 124). Côté client, `applyBodyRewrites` écrit
`content.body = decrypted` **sans jamais regarder ce verrou** : sa branche
`locKey` n'est qu'un repli pour l'échec de déchiffrement. Le texte ENTIER d'un
message à VUE UNIQUE, ÉPHÉMÈRE ou FLOUTÉ s'affichait donc sur l'écran
verrouillé, sous une bannière disant « 👁️ 🖼️ ».

Les deux moitiés ne pouvaient pas être deux lots : **le correctif de complétude
est le véhicule de la fuite.** Propager l'enveloppe sans le verrou l'aurait
portée aux deux populations les plus exposées — celle à qui on répond, et les
mentionnés, dont la bannière perce la sourdine. C'est la leçon du cycle 127
(« une garde qui protège la population la plus NOMBREUSE peut manquer la plus
EXPOSÉE ») prise à l'envers : ici le chemin nombreux portait déjà le défaut.

**Le discriminant n'est pas « ce message est-il protégé ? »** En `e2ee` tout
message l'est — `protectedPreview` rend la branche `encrypted`, la moins
restrictive de sa préséance — donc la garde du média (`protectedOverride ===
null`) retirerait l'enveloppe au cas NOMINAL, c'est-à-dire la feature entière.
C'est « la protection est-elle le CHIFFREMENT SEUL ? ». Site unique :
`envelopeMayTravelUnder()`, fail-CLOSED sur l'inconnu, posé aux DEUX niveaux
comme le média — à la SOURCE (l'éventail) et au point de passage
(`createNotification`), pour l'appelant solo.

> Et c'est l'absence de garde qui avait l'air d'être la garde. Un champ dont le
> verrou évident est manifestement faux se lit comme un champ qu'on a décidé de
> ne pas garder. Détail :
> `tasks/lessons/2026-11-08-un-verrou-qui-garde-le-clair-et-le-fichier-peut-laisser-partir-la-cle.md`.

## Lot L — l'éventail de MENTIONS a la borne de son jumeau (#17081)

`createMentionNotificationsBatch` était un `Promise.all(…​.map(…))` nu, jusqu'à
`MAX_MENTIONS_PER_MESSAGE = 50`, quand l'éventail `regular` est borné à seize
depuis #10819 — avec sa mesure de production en doc-comment.

La borne avait été posée sur le site qui AVAIT la mesure. Le coût, lui, vient de
`createNotification` → `computeConversationUnreadBadge`, que les deux chemins
paient à l'identique. Elle a donc QUITTÉ `messageNotificationFanOut.ts` pour
`notifications/fanout-concurrency.ts`, chez le service qui porte le coût, et
reste réexportée à l'ancienne adresse pour ses appelants historiques.

> C'est la leçon 261 (« une énumération de sites porte DEUX affirmations »)
> appliquée à une BORNE : #10819 a nommé « l'éventail `new_message` », et ce nom
> décrit le site mesuré, jamais la propriété — « ce qui lâche N créations de
> notification en vol ».

`settleWithConcurrency` apporte aussi la sémantique SETTLE, et c'est une
décision assumée, pas un effet de bord du helper : le rejet d'un seul mentionné
emportait le compte rendu de ses quarante-neuf voisins, dont les bannières
étaient déjà parties.

## Lot M — `GET …/stats` agrège sur la fenêtre du LECTEUR (#17076)

La route n'avait que ses deux gardes d'ACCÈS. Ce qu'elle servait est NOMMÉ
(`participantStats` porte le profil), DATÉ (`firstMessageAt`, `dailyActivity`,
une ligne par jour depuis la création) et ATTRIBUÉ : exactement l'historique que
le fil, la recherche, les fils de réponses et les traductions partagées refusent
message par message à un inscrit entré par un lien `allowViewHistory: false`.
Fuite ACTIVE — deux clients livrés l'ouvrent.

**RECALCULÉ, jamais PLAFONNÉ**, et c'est ce choix qui a dispensé de décider
champ par champ : agréger sur la fenêtre répond pour tous les champs d'un coup,
`firstMessageAt` devenant le premier message VISIBLE, qui ne nomme rien
d'antérieur. Un agrégat plafonné aurait laissé déduire le reste par soustraction.

Trois propriétés, chacune fermant un piège : UNE boucle d'agrégation
(`aggregateMessages`, partagée avec `recompute`, sans quoi deux jumelles
auraient fait diverger la vue d'un lecteur borné de celle de tout le monde) ; la
passe bornée ne PERSISTE rien (un `upsert` aurait changé la fuite en
corruption) ; le cache est par (conversation, plancher, masquage) et
`invalidate()` vide tous les seaux.

### Et c'est un CLIQUET qui a trouvé la suite du lot

`personal-history-hiding-surface-guard` classe chaque lecteur de `Message` de la
couche service. Ce fichier y était EXEMPT, avec une raison juste : « une valeur
stockée une fois et lue par tout le monde ». **Le lot venait de la rendre fausse
pour la moitié du fichier** — `aggregateFloored` n'est ni stockée ni partagée —
et le cliquet a rougi en nommant exactement cela : « 2 lectures, 0 applications ».

> C'est « le lot qui rend une chose possible doit relire les commentaires qui la
> déclaraient impossible » (cycle 108), avec la variante qui la rend chère : ce
> commentaire n'était pas faux au départ, il l'est DEVENU. Un commentaire
> d'exemption ne rougit jamais — celui-ci l'a fait parce qu'un cliquet le tenait.

La passe bornée applique donc le masquage personnel, la ligne partagée non, et
l'asymétrie est écrite aux deux endroits. Le masquage n'est chargé que SOUS
plancher : sur le chemin nominal, deux lectures de plus par appel seraient un
coût sans objet.

## La forme du cycle

Les trois lots partagent une forme, et ce n'est plus celle du cycle 149 (« le
voisinage portait déjà la réponse »). C'est : **la bonne règle était écrite,
appliquée, testée — et son ÉNONCÉ ne couvrait pas le site où elle manquait.**

| lot | la règle existait | ce que son énoncé ne couvrait pas |
|---|---|---|
| K | le second verrou de protection, sur le corps et le média | un champ qui n'est ni le contenu ni son qualificatif, mais le MOYEN de l'obtenir |
| L | la borne de débit, mesurée en production | un second éventail qui paie le même coût sous un autre nom |
| M | le plancher d'historique, appliqué par quatre lectures | une porte qui sert l'historique AGRÉGÉ plutôt que message par message |

Dans les trois cas, chercher « où cette règle est-elle appliquée ? » rend la
liste des sites conformes. La question qui trouve le défaut est l'autre :
**« quelle est la PROPRIÉTÉ que cette règle protège, et qui d'autre la met en
jeu ? »** — et elle se pose contre le nom du lot qui a posé la règle, parce que
ce nom décrit presque toujours le site mesuré et non la propriété.

## Preuve

| gate | résultat |
|---|---|
| `tsc --noEmit` gateway (code de retour lu SANS pipe) | **EXIT=0**, 0 ligne |
| suite gateway COMPLÈTE, machine au repos | voir le tableau du commit de clôture |
| rouges à l'arrivée comme au départ | les **SIX** suites de codecs d'image, celles que les cycles 147 et 148 ont relevées sur `dev` |
| le diff touche-t-il leur chemin ? | non — zéro fichier sous `attach`/`upload`/`exif`/`heif`/`avif`/`sharp` |
| rouge, lot K | 7 rouges / 3 verts ; les 3 verts sont les modes d'échec du correctif |
| mutation, lot K | le second verrou retiré ⇒ exactement les 2 témoins qui le nomment tombent |
| rouge, lot L | pic mesuré à **50** au lieu de 16, plus le témoin de perte partielle |
| rouge, lot M | 6 rouges / 2 verts ; mutation A (plancher hors du `where`) et mutation B (la route repasse `null`) tombent chacune sur SON témoin, aucune sur l'autre |
| cliquets | 3 rougis puis repassés par DÉCLARATION : `orphaned-sender-repair` (1→2 lectures), `personal-history-hiding` (exempt → applies), `journal-one-file-per-entry` (format de la leçon) |

## Trois mesures de méthode

1. **Un cliquet qui rougit sur un lot de sécurité peut avoir RAISON sur le
   fond.** Les deux premiers n'étaient pas du bruit à déclarer : le second
   nommait une exemption que le lot venait de périmer, et sa réparation a été un
   bout de correctif, pas une ligne d'inventaire.

2. **Un splice par index trouve la PREMIÈRE occurrence, pas celle de la
   fonction qu'on édite.** `s.index(marqueur)` a rendu une position ANTÉRIEURE
   au début de la fonction, et `s[:start] + neuf + s[end:]` a dupliqué tout ce
   qui séparait les deux — six « Duplicate function implementation ». La forme
   juste est `s.index(marqueur, debut_de_la_fonction)`, et le signal a été lu
   parce que `tsc` tournait **sans pipe** : `npx tsc | head` avait rendu
   `EXIT=0` au même instant (§ un gate rend DEUX verdicts).

3. **Un témoin qui lit `mock.calls[0]` exige une remise à zéro par cas.** Deux
   des miens inspectaient l'appel du témoin PRÉCÉDENT et attestaient un verdict
   qui n'était pas le leur — la variante « harnais » de « un témoin qui ne peut
   pas tomber ».
