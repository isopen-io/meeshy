## 2026-11-07 — Un commentaire de `select` dit ce qu'on LIT, jamais ce qu'on SERT (#16586, #16590)

Suite des deux leçons précédentes sur l'énumération de #16558 (les SERVEURS de
`Message.content`, pas les importateurs de la constante ; une copie PARTIELLE
ressemble à une conformité). Les quatrième et cinquième portes de cette
énumération — `GET /sync/messages` et `GET /users/me/dashboard-stats` — ont rendu
une leçon de MÉTHODE, pas de règle, et elle a coûté un correctif entier écrit à
l'envers.

### Ce qui s'est passé

Pour réparer l'aperçu du tableau de bord, j'ai lu
`conversationLastMessagePreviewSelect` (`routes/conversations/core-selects.ts`),
la source unique de la projection d'aperçu. Ses commentaires sont excellents et
disent, champ par champ, POURQUOI chaque colonne est lue :

```ts
// #7451 — dit à `resolveLastMessageSummaryKind` que `expiresAt` est l'heure
//   INTERNE de destruction, et non l'échéance d'un lecteur.
ephemeralDuration: true,
// Prisme Linguistique de l'aperçu. […] Sans eux, la ligne de liste restait
//   dans la langue de l'expéditeur pour tout le monde.
translations: true,
originalLanguage: true,
```

J'en ai conclu — raisonnablement, et faux — que la famille APERÇU **sert** son
bloc de protection et ses traductions, et que le client décide. J'ai donc écrit
un correctif qui DÉCLARE ces champs dans le schéma de réponse du tableau de bord,
avec ses témoins, verts.

Le site qui SERT dit l'inverse, et il est dans un autre fichier :

| ce que fait `projectListLastMessageBody` (`utils/list-last-message-body.ts`) | conséquence |
|---|---|
| `content: withheld ? '' : truncate(...)` | la retenue est **SERVEUR**, pas déléguée au client |
| `const { translations: _raw, originalLanguage: _orig, ... } = msg` | les deux champs du Prisme sont **retirés du corps** |
| `...(withheld ? { metadata: null, attachments: null } : {})` | ce qui part À CÔTÉ du texte part aussi |
| `expiresAt: servedExpiresAt` | l'échéance servie est celle du **LECTEUR** |

Et le Prisme, lui, se sert au niveau CONVERSATION (`lastMessageTranslations`,
nullé sous protection — #6111 : « masquer `lastMessage.content` sans y toucher
aurait laissé partir la traduction du même message sous un autre nom »).

Mon correctif aurait donc **déclaré le bloc sans retenir le texte** : une fuite
livrée sous un contrat d'apparence conforme, avec dix témoins verts pour
l'attester. Pire que le défaut d'origine, qui au moins ne prétendait rien.

### La règle

> **Un `select` déclare une LECTURE. La question « qu'est-ce que cette famille
> SERT ? » ne se répond jamais dans un `select`, ni dans ses commentaires, même
> quand ils sont justes — elle se répond dans le site qui compose la charge.**

C'est la leçon « avant de déclarer un champ, remonter jusqu'à l'ÉMETTEUR »
(cycle 90) et « un audit qui liste des `select:` ne liste pas des fuites »
(cycle 84), reprises par l'autre bout : ici le `select` ne surévaluait pas une
fuite, il m'a fait inventer un CONTRAT qui n'existe pas. Le commentaire était
vrai de ce qu'il décrivait — *pourquoi on lit cette colonne* — et muet sur ce
qu'une porte en fait. **Un commentaire ne devient faux que pour qui lui pose une
question qu'il ne traite pas.**

### Comment on l'attrape

La commande n'est pas « où cette colonne est-elle lue ? » mais **« qui remet la
charge, et que contient-elle ligne à ligne ? »** — et pour une famille, elle se
pose au site d'une porte CONFORME, jamais à sa projection :

```bash
# faux départ : rend le select et ses commentaires
grep -rn 'conversationLastMessagePreviewSelect' src/
# la bonne question : qui COMPOSE le lastMessage servi ?
grep -rn 'lastMessage:' src/routes/conversations/core-list.ts
```

Le second a rendu `projectListLastMessageBody` en une ligne, et avec lui les cinq
unités partagées que la porte fautive devait simplement APPELER
(`loadListEphemeralExpiries`, `loadListInheritedExpiries`,
`loadViewOnceConsumptions`, `resolvePreviewProtection`,
`projectListLastMessageBody`). Le correctif juste n'ajoute aucune loi : il en est
le second appelant.

### Corollaire de lot, mesuré sur #16586

Une projection partagée n'empêche pas la copie du `where`. `/sync` prenait bien
`MESSAGE_PROTECTION_SELECT`, et récrivait tout le reste ; le tableau de bord
prenait la projection d'aperçu de personne et récrivait aussi son `where`, perdant
l'exclusion des avis de capture (#9630). **Quand une porte doit LIRE comme une
autre, c'est le BLOC entier qui se partage — `where`, ordre, borne et
projection** : `CONVERSATION_LAST_MESSAGE_PREVIEW_QUERY` existe pour ça depuis ce
lot. Partager la seule projection laisse exactement une copie de trop, et c'est
celle qui décide quelles LIGNES entrent.
