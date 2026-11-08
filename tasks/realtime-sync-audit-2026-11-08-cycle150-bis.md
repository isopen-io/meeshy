# Audit de synchronisation temps réel — cycle 150 bis (2026-11-08)

Branche `claude/exciting-planck-asw4sp`, partie de `origin/dev` à `1793afe61`.

**Ce journal est le SECOND du cycle 150, et il faut dire pourquoi avant toute
chose.** Une autre session a mené le même relevé de départ — les quatre issues
restantes du cycle 148 — et a fusionné #17128 pendant que ce lot-ci se
développait : « cycle 150, le plancher ET la porte des statistiques, et le lot
de mentions borné ». Deux de mes trois lots y étaient déjà, livrés plus large
que les miens.

## Ce qui a été CÉDÉ, et pourquoi sans négocier

| issue | mon lot | ce qui est retenu |
|---|---|---|
| #17076 — le plancher de `…/stats` | écrit, prouvé, poussé | **le leur**, en entier |
| #17081 — la borne du lot de mentions | écrit, prouvé, poussé | **le leur**, en entier |
| #17080 — l'enveloppe de l'appareil | écrit, prouvé, poussé | **le mien** — ils n'y ont pas touché |

La règle du dépôt tranche sans discussion : « quand deux lots se disputent un
fichier, celui qui n'a rien écrit cède ». Ici les DEUX avaient écrit, et c'est
la seconde moitié qui décide — **une PR fusionnée est finie.** Résoudre vers
`dev` EN ENTIER, pas hunk par hunk au mérite : prendre ma version d'un fichier
et la leur d'un autre aurait composé deux conceptions, et leur lot porte des
décisions que le mien n'a pas (un module `messageStatsAggregate.ts` à lui,
`personalHistoryFilter` élargi, la porte du lien en plus du plancher).

Leur propre journal porte la leçon depuis l'autre bord, sur #17077 : « le
dernier gate d'un lot est `dev` LUI-MÊME ». Elle vaut dans les deux sens, et
elle s'est vérifiée deux fois dans la même journée.

Deux points où leur version est MEILLEURE que la mienne, notés parce qu'ils
survivent à ce cycle :

- la borne n'est **pas réexportée** depuis `messageNotificationFanOut.ts`,
  comme je l'avais fait — « un ré-export ne traverse pas un double qui énumère
  ses clés à la main », et ce module est doublé partout. Mon ré-export aurait
  rendu `undefined` derrière ces doubles.
- l'agrégation bornée vit dans son propre module
  (`conversations/messageStatsAggregate.ts`) plutôt qu'extraite dans le service,
  et leur lot ferme AUSSI la porte du lien, que le mien ne voyait pas.

## Ce qui reste de ce cycle : lot K — l'enveloppe de l'appareil (#17080)

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
(`createNotification`), pour l'appelant solo qui n'a pas traversé l'éventail.

> Et c'est l'absence de garde qui avait l'air d'être la garde. Un champ dont le
> verrou évident est manifestement faux se lit comme un champ qu'on a décidé de
> ne pas garder. Détail :
> `tasks/lessons/2026-11-08-un-verrou-qui-garde-le-clair-et-le-fichier-peut-laisser-partir-la-cle.md`.

## Un ajout au lot FUSIONNÉ des mentions, et c'est tout

Leur `createMentionNotificationsBatch` passe à `settleWithConcurrency`, donc
survit à l'échec d'un destinataire — et rend ses pertes MUETTES : quarante
échecs sur cinquante ne laissent qu'un compte plus petit, que personne ne
compare à rien. L'éventail `regular` journalise la sienne depuis #10819, en un
signalement pour tout le lot. Ces dix lignes-là sont reprises ici, dans les
mêmes termes, sur la version fusionnée.

## Preuve

| gate | résultat |
|---|---|
| `tsc --noEmit` gateway, après fusion manuelle de `dev` | **EXIT=0**, 0 ligne (code de retour lu sans pipe) |
| témoin du lot K, neuf | **12/12** |
| rouge du lot K | 7 rouges / 3 verts avant production ; les 3 verts sont les modes d'échec |
| mutation, lot K | le second verrou retiré ⇒ exactement les 2 témoins qui le nomment tombent, et eux seuls |
| suite gateway COMPLÈTE avant la fusion de `dev` | 2 584 suites, 40 307 témoins — 7 rouges, dont 6 codecs d'image (ligne de base de `dev`, cycles 147-148) et 1 budget de taille, corrigé |
| suite gateway après la fusion | voir le commit de clôture |

## La mesure de méthode de ce cycle

**Un relevé de départ n'est pas une réservation.** J'ai lu les quatre issues
restantes du cycle 148, vérifié chaque constat en primaire, et commencé par la
plus petite — sans jamais demander si une branche VIVANTE écrivait déjà ces
chemins. La doctrine du dépôt le prescrit noir sur blanc (« une session qui
découvre, au relevé, qu'une branche vivante écrit déjà ses chemins cède ce
travail et en prend un autre »), et le relevé coûte un `git fetch` plus un
`git log origin/dev` — ce que j'ai fait au DÉBUT, quand la branche concurrente
n'existait pas encore, et pas une seule fois pendant les trois lots.

Le coût exact : deux lots écrits, prouvés et jetés. Le gain conservé : un lot
que personne d'autre n'avait vu, et qui portait une fuite vers l'écran
verrouillé.

> **Pousser le squelette tôt réduit la fenêtre ; il ne la ferme pas, et il
> n'informe que ceux qui regardent.** Ce qui aurait coupé ce cycle en deux n'est
> pas un push plus rapide — le mien est parti dans les quinze minutes — mais un
> `git fetch origin dev` AVANT chaque nouveau lot, jamais seulement avant le
> premier.
