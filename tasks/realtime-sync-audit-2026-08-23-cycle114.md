# Cycle 114 — le seul rejeu qui ne pouvait pas se déclarer indélivrable annonçait sa remise

Point de départ : le premier suivi ouvert du cycle 113 — « **La FORME des douze
charges** reste une affirmation », hérité du 109 bis et rétréci par le 111.

Le suivi prescrivait douze schémas. L'instruire a rendu autre chose, et de
meilleure nature : **onze des douze familles n'ont pas de trou de forme qui
change quoi que ce soit ; la douzième en a un qui ne se répare pas par un
schéma**, parce qu'il ne vit pas dans la charge mais dans le VERDICT que le
drain tire d'elle.

---

## 1. Ce que l'instruction du suivi a mesuré, et qui l'a fait dévier

Avant d'écrire douze schémas, quatre mesures — toutes contre les consommateurs
réels, jamais contre le type seul.

| ce qui a été mesuré | verdict |
|---|---|
| `TranslationEvent` ne déclare AUCUN `conversationId`, alors que les onze autres charges en portent un — et le rejeu re-adresse tout de la room de conversation vers la room PERSONNELLE | **non-défaut** : web (`TranslationService.handleTranslationEvent`) et iOS (`translationReceived`) clefent sur `messageId` seul |
| `ReactionUpdateEventData.action` répète, DANS la charge, ce que le nom d'événement dit déjà — et les deux ne peuvent pas être corrélés au typage, `reaction-added` et `reaction-removed` partageant leur charge | **non-défaut aujourd'hui** : les six sites d'enfilage sont cohérents, et les trois clients clefent sur le NOM, jamais sur `action` |
| divergence entre `entry.conversationId` (la clé du gate) et le `conversationId` de la charge (ce sur quoi le client route) | **non-défaut** : les huit sites d'enfilage passent la même valeur |
| le curseur de remise peut-il RECULER sur un rejeu d'arriéré ? | **non-défaut** : `_advanceCursor` est monotone, garde évaluée atomiquement dans l'écriture |

Trois de ces quatre pistes sont mortes. La quatrième — la monotonie du curseur —
est ce qui a rendu la vraie visible : **un accusé de remise faux ne se rattrape
pas.**

---

## 2. Le défaut : un verdict d'indélivrabilité qu'un membre de l'union ne peut pas rendre

Le drain ne demande pas à une entrée « quelle est ta forme ? ». Il lui demande
**« sais-tu te diffuser ? »**, et il lit la réponse dans la longueur d'une
liste :

```ts
const emissions = _drainedEmissions(entry);
if (emissions.length === 0) { dropEntry(entry, 'unresolvable-event-type'); continue; }
```

`_drainedEmissions` documente lui-même ce contrat : « Une liste VIDE dit *je ne
sais pas diffuser ceci*. C'est la seule réponse honnête. »

Onze `eventType` sur douze rendent cette liste par la table `DRAINED_EVENT`, qui
peut rendre `undefined` — donc `[]`. Le douzième, `'link-message'`, est le seul
dont la charge se **DÉPLIE**, et il passe par `linkMessageEmissions` :

```ts
const emissions: SocketEmission[] = [
  { event: SERVER_EVENTS.LINK_MESSAGE_NEW, payload: payload as LinkMessageNewEventData },
];
const message = (payload as { message?: unknown } | null | undefined)?.message;
if (message && typeof message === 'object' && !Array.isArray(message)) {
  emissions.push({ event: SERVER_EVENTS.MESSAGE_NEW, payload: message as SocketIOMessage });
}
return emissions;
```

**Cette fonction ne peut pas rendre `[]`.** L'enveloppe est poussée
INCONDITIONNELLEMENT, avant même qu'on regarde ce qu'elle contient. Le refus du
message dérivé — ancien, juste, et gardé par ses propres témoins — n'empêchait
donc rien : il retirait la seule émission qui compte et laissait la liste à 1.

> `'link-message'` était le seul membre de l'union pour lequel le verdict
> d'indélivrabilité du drain ne pouvait JAMAIS être négatif.

### Ce que l'enveloppe seule livre : rien

Mesuré sur les trois clients :

| client | écoute `link:message:new` ? | ce qu'il en fait |
|---|---|---|
| web | oui, seul auditeur | lit `data.message` — absent ⇒ n'applique rien |
| iOS (`MessageSocketManager.swift`) | **non** | n'a qu'un listener de création : `message:new` |
| Android (`MessageSocketManager.kt`) | **non** | idem |

L'unique émission maintenue va donc vers un auditeur qui n'en tire rien, et les
deux clients mobiles ne reçoivent que le `message:new` dérivé — c'est-à-dire
exactement celui qu'on vient de refuser.

---

## 3. Le coût : trois signaux qui mentent d'un coup, et un qui ne se rattrape pas

Le drain est DESTRUCTIF (`drain()` retire de Redis et de la file mémoire avant
la moindre émission). Une entrée `'link-message'` dégradée y passait pour une
livraison PLEINE, et emportait avec elle les trois signaux que les cycles 109 bis
et 111 ont rendus solidaires du LIVRÉ :

1. **`pending-messages:delivered.count` la comptait comme remise.**
2. **Sa conversation n'était PAS nommée dans `conversationIds`** — le champ
   n'est alimenté que par `[...delivered, ...undelivered]`, et l'entrée n'était
   dans aucun des deux. Rien n'envoyait donc le client rechercher le message,
   qui est pourtant **toujours en base** : seul son rejeu temps réel avait
   échoué. C'est précisément la voie de récupération que le cycle 111 a
   construite, retirée au moment où elle servait.
3. **L'accusé de remise partait.** `announcesMessageArrival('link-message')` est
   VRAI par décision du cycle qui l'a posé — un message envoyé par lien est une
   arrivée pleine et entière. `markMessagesAsReceived` avançait donc le curseur
   `lastDeliveredAt` de l'auteur, et la coche de celui-ci passait de « envoyé »
   à « remis » **pour un message qu'aucun destinataire n'a reçu**.

Le troisième est le seul irréversible : `_advanceCursor` est MONOTONE — sa garde
« Never rolls the cursor back to an older message than what's already recorded »
est évaluée atomiquement dans l'écriture. Une remise faussement affirmée ne se
défait pas, et elle rend STALE tout accusé ultérieur portant sur un message plus
ancien.

> C'est mot pour mot la règle que le gate d'appartenance du drain énonce trente
> lignes plus haut — « l'affirmer d'un message qu'on vient de refuser de livrer
> mentirait à son auteur » — appliquée au seul refus qui ne l'appliquait pas.

Et la population touchée n'est pas quelconque : **l'envoi par lien de partage est
le SEUL transport d'envoi dont dispose un participant anonyme**, ce que
`queuedMessageArrival.ts` écrit déjà (« la moitié en défaut était précisément
celle de l'utilisateur qui n'a pas d'autre recours »).

---

## 4. Le correctif : rendre `[]`, et nommer le refus

```ts
export function linkMessageEmissions(payload: unknown): SocketEmission[] {
  const message = (payload as { message?: unknown } | null | undefined)?.message;
  if (!message || typeof message !== 'object' || Array.isArray(message)) return [];

  return [
    { event: SERVER_EVENTS.LINK_MESSAGE_NEW, payload: payload as LinkMessageNewEventData },
    { event: SERVER_EVENTS.MESSAGE_NEW, payload: message as SocketIOMessage },
  ];
}
```

L'inspection ne change pas d'un caractère — ce qui change est ce qu'on fait de
son verdict. L'entrée rejoint alors la voie de récupération que les trois gardes
précédentes de cette frontière empruntent déjà : refusée, journalisée par
entrée, sa conversation NOMMÉE dans `conversationIds`, exclue de `count` et de
l'accusé.

**Le journal SÉPARE les deux façons de ne rien savoir diffuser**, parce qu'elles
n'envoient pas chercher au même endroit :

```ts
dropEntry(entry, entry.eventType === 'link-message'
  ? 'link-envelope-without-message'   // accuse le PRODUCTEUR de l'enveloppe
  : 'unresolvable-event-type');       // accuse la file (un eventType d'une version voisine)
```

**Le chemin VIVANT n'y perd rien** : `broadcastLinkMessage` reçoit un
`QueuedPayloadFor<'link-message'>`, dont le `message` est REQUIS au typage et
composé sur place à partir du message qui vient d'être écrit. `[]` n'y est pas
atteignable.

---

## 5. Les témoins, et les trois qui GELAIENT le défaut

Six rouges mesurés en revertant la garde (sur 402 témoins des deux suites) :

| témoin | ce qu'il garde |
|---|---|
| `ne diffuse RIEN quand l'enveloppe ne porte aucun message` | **remplace** un témoin qui assertait `[LINK_MESSAGE_NEW]` |
| `ne diffuse RIEN quand `message` n'est pas un objet` | **remplace** idem |
| `ne diffuse RIEN quand `message` est un tableau` | **remplace** idem |
| `ne diffuse RIEN quand l'enveloppe elle-même est absente` | neuf — `null` / `undefined` |
| `ne diffuse RIEN d'une enveloppe de lien privée de son message` (manager) | **remplace** `replays a shapeless link-message entry under LINK_MESSAGE_NEW alone` |
| `n'accuse pas la remise d'une enveloppe de lien vide, mais nomme sa conversation` (manager) | neuf — les trois signaux |

> **Quatre des six témoins ne sont pas des ajouts : ce sont des retournements.**
> Ils existaient, ils étaient verts, et ils assertaient le défaut mot pour mot —
> « n'ajoute PAS `message:new` … ⇒ `[LINK_MESSAGE_NEW]` ». Chacun nommait
> correctement la MOITIÉ qu'il gardait (le refus du message dérivé) et gelait
> l'autre (l'enveloppe maintenue) sans jamais la mettre en question.

---

## 6. Ce que le lot n'a PAS fait, et pourquoi

- **Les douze schémas de forme n'ont pas été écrits**, et le suivi qui les
  prescrivait est CLOS par la mesure du §1, pas par renoncement : sur les onze
  familles restantes, une charge informe mais objet est jetée en silence par le
  décodeur client, et l'entrée est déjà — depuis le cycle 111 — comptée hors de
  `count` et nommée dans `conversationIds`. Le client la retrouve. C'est
  exactement ce que le cas `'link-message'` ne faisait pas.
- **`isDeliverableQueuedPayload` garde son plancher.** Il refuse ce qui ne peut
  être aucune des douze ; ce lot ne touche pas à son grain.
- **`announcesMessageArrival` n'est pas modifié.** Le rendre plus étroit pour
  `'link-message'` aurait retiré à l'auteur anonyme la coche que le cycle qui l'a
  posé lui a rendue — le défaut n'est pas dans le prédicat, il est dans
  l'entrée qui n'aurait jamais dû lui parvenir.

---

## 7. Suivis

- [ ] `messageId` / `dedupKey` (hérité 113, §5), avec leur rayon mesuré.
- [ ] Hérité (107 bis) — la bivariance `strictFunctionTypes: false`.
- [ ] Hérité — `ReactionUpdateEvent` / `ReactionUpdateEventData`, deux
      exemplaires de la même déclaration.
- [ ] Hérité — `LinkMessagePayload` porte encore `readonly [key: string]: unknown`.
- [ ] Hérité (108 ter) — l'en-tête du cliquet de dette, fausse de trois points.
- [ ] Hérité (113, §6 « Neuf ») — rien n'EMPÊCHE un futur double Prisma du
      harnais du manager d'accepter un argument que la colonne ne peut pas
      porter.
- [ ] **Neuf** — `ReactionUpdateEventData.action` répète dans la charge ce que le
      nom d'événement dit, sur six sites d'enfilage, sans corrélation possible au
      typage (les deux membres partagent leur charge) ni vérification à
      l'exécution. Mesuré cohérent aujourd'hui, et lu par aucun client : c'est
      un piège armé de bas rendement, pas une panne. Le geste juste est de le
      retirer du contrat, pas de le garder.

---

## 8. Leçon de méthode

**Un prédicat de validité peut être structurellement incapable d'être faux pour
un membre de l'union qu'il arbitre.**

Le drain ne teste pas la forme d'une entrée : il teste `emissions.length === 0`,
un PROXY de « sais-je diffuser ceci ? ». Onze familles pouvaient rendre ce proxy
négatif ; la douzième — la seule dont la charge se déplie, donc la seule dont
l'échec puisse venir d'autre chose que de son nom — ne le pouvait pas. Le proxy
avait l'air uniforme parce qu'il est écrit une fois, au-dessus de la boucle.

> La question à poser à tout gate qui s'exprime par un proxy (une longueur, un
> `null`, un booléen dérivé) n'est pas « est-il correct ? » mais **« chaque
> membre de ce qu'il arbitre peut-il le faire répondre NON ? »** — et si l'un ne
> le peut pas, le gate ne le couvre pas, quelle que soit la place qu'il occupe
> dans le code.

Et le corollaire sur les témoins, qui est ce qui a coûté deux cycles ici :

> **Un témoin qui nomme correctement la moitié qu'il garde gèle l'autre.** Les
> trois témoins de `linkMessageEmissions` disaient vrai — « n'ajoute PAS
> `message:new` » — et cette vérité rendait leur assertion complète
> (`⇒ [LINK_MESSAGE_NEW]`) invisible à la relecture : elle se lisait comme le
> RESTE de la phrase, pas comme une affirmation à instruire. Un `toEqual` sur
> une liste entière affirme autant sur ce qu'il GARDE que sur ce qu'il
> ADMET — et les deux moitiés se relisent séparément.
