## 2026-11-07 — Une règle ÉCRITE relative au lecteur peut être implémentée sur une colonne, et sa prose ne le dit pas (#16604)

*Sixième porte de l'éphémère. Cycles précédents : #16578, #16581, #16583, #16586, #16590.*

### Le fait

La décision #7377 énonce, règle 2 : « supprimé pour tous, **expiré**, ou à vue unique :
la ligne SORT de la liste », et règle 3 : « éphémère **encore vivant** : la ligne est un
PLACEHOLDER ». Les deux discriminants sont relatifs au lecteur — « expiré » et « encore
vivant » n'ont pas de sens absolu pour un éphémère, dont l'échéance est `D(u) =
première réception par u + durée`.

L'implémentation lisait `Message.expiresAt`, qui pour un tel message est l'heure INTERNE
de destruction : `max D(u) + 1 h`, ou `envoi + 7 jours` tant que personne n'a reçu. Dans
un groupe, tout destinataire ayant reçu avant le dernier se voyait donc servir la ligne
jusqu'au décompte du dernier.

**La prose et le code disaient le même mot.** « Expiré » est vrai des deux lectures ; il
ne distingue pas l'horloge. Relire la décision pour vérifier l'implémentation ne pouvait
pas trouver l'écart : la décision ne nomme pas l'horloge, elle nomme l'état.

### La règle

> **Devant une règle de service dont le prédicat est relatif à un lecteur — « expiré »,
> « déjà vu », « encore disponible », « non lu » —, la question n'est pas « le code
> applique-t-il la règle ? » mais « sur quelle HORLOGE, et qui la possède ? ».** Un état
> relatif implémenté sur une colonne partagée a l'air juste partout où un seul lecteur
> existe, et se trompe exactement là où la règle avait un sens.

Le dépôt portait déjà l'avertissement, au bon endroit, dans la bonne unité :
`hasPerReaderEphemeralDeadline` dit « quand la réponse est oui, `Message.expiresAt` est
une heure INTERNE de destruction **et ne se sert à personne** ». Six portes l'avaient lu ;
la septième ne l'avait jamais appelé. **Un avertissement écrit dans le prédicat qui le
porte ne protège que ses appelants** — c'est la leçon 276 (une projection trop étroite) et
la leçon 97 (un invariant de paire ne garde que l'exemplaire qui l'écrit) appliquées à une
horloge.

### Ce qui l'a trouvée, et ce que ça dit de la recette

La recette est dans le doc-comment de `keepAliveForReader`, et elle a tenu six fois :

```
grep -l 'prisma\.message\.' | xargs grep -L 'keepAliveForReader'
```

croisé avec « cette porte sert-elle `Message.content` à un lecteur ? ». Elle rend ~115
fichiers ; le travail est le croisement, pas le `grep`.

**Et le croisement se fait sur le MÉDIUM, pas sur la chaîne** (leçon 275, leçon 284). Ici
le texte était bien masqué : la règle 3 place un éphémère vivant en placeholder, donc
`content: null`. S'arrêter à « sert-elle du texte ? » aurait classé la porte conforme. Ce
qui partait était le FAIT — l'existence du message, son auteur, sa conversation, sa date,
son type — pour un message que son destinataire croit détruit chez lui.

> **Un placeholder n'est pas une absence de fuite : c'est une fuite dont on a retiré la
> phrase.** La question à une porte protégée est « que reste-t-il quand le masque a
> fait son travail, et ce reste a-t-il le droit d'être là ? ».

Et la seconde coupure, elle, servait bien du texte : **une réponse n'est pas elle-même
protégée.** Son verdict est `served`, donc texte, traductions et pièces jointes avec leurs
URL — alors que le fil l'avait retirée avec ce qu'elle cite (#8630). La coupure héritée
était absente de cette porte, et aucune règle de la décision ne la nommait : elle est
postérieure de huit jours à la décision. **Une décision ne s'étend pas d'elle-même aux
lois votées après elle.**

### Corollaire de lot : corriger la lecture sans la pose aurait créé la divergence qu'un fichier existait pour interdire

`starredMessageVerdict.ts` s'ouvre sur sa raison d'être : « pour que la pose d'une étoile
et sa lecture ne puissent pas diverger ». Le verdict est partagé — donc le défaut l'était,
et le correctif devait l'être. Ne corriger que la liste aurait laissé poser, avec succès,
une étoile sur une flamme déjà morte chez soi, pour une ligne que la liste ne servirait
jamais : le « succès silencieux » que la règle 2 refuse nommément.

**La forme outillée de la question** (leçon du cycle 123 bis) : compter les appelants de
production du helper qu'on corrige. Ils étaient DEUX, aux deux bouts du geste. Un helper à
deux appelants dont un seul est corrigé n'a pas une règle à moitié appliquée — il a deux
règles.

Le paramètre qui porte l'horloge est donc **REQUIS par le type**, jamais optionnel : un
paramètre dont l'absence désactive une garde est un demi-correctif, et chaque appelant doit
dire comment il l'a lu — la liste par le balayage de page
(`keepAliveForReaderAcrossConversations`), la pose par la lecture CIBLÉE
(`readEphemeralReaderResolution`, #9579), parce qu'une porte qui décide seule ne peut pas
lire « ligne absente d'une tranche plafonnée » comme « décompte pas démarré ».

### Et le témoin : un témoin d'horloge pose les DEUX horloges ensemble

Variante de « un témoin de RANG s'écrit sur un rang AUTRE que le premier » (leçon 261).
Un témoin qui ne poserait qu'une colonne `expiresAt` passée ne peut pas tomber : la lecture
fausse et la juste y rendent le même verdict. Chaque témoin de ce lot pose donc une colonne
encore FUTURE au-dessus d'une échéance de lecteur DÉJÀ PASSÉE — la seule configuration où
les deux horloges se contredisent. Six ont rougi ; huit, déjà verts, gardent les
non-régressions (la grâce d'une heure, le décompte non démarré, l'expéditeur, et la colonne
seule maîtresse en l'absence d'échéance par lecteur).

Deux de plus assertent sur la **REQUÊTE** : le faux Prisma rend des lignes entières,
`select` ignoré, donc aucun témoin de verdict ne peut voir une colonne manquante au
`select`. Sans eux, `senderId` / `ephemeralDuration` / `replyToId` auraient pu disparaître
du `select` sans un seul rouge, et la coupure serait morte en production en lisant
« décompte pas démarré » sur une page entière — le piège que `services/gateway/CLAUDE.md`
décrit sous « le `select` est le seul des trois qu'aucun témoin de rang ne peut voir ».
