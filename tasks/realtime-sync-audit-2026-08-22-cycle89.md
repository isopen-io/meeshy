# Cycle 89 — Onze schémas d'erreur écrits à la main, et le piège qu'ils armaient

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-inwn81`
**Périmètre** : passerelle — `routes/admin/roles.ts`, `routes/anonymous.ts`,
`routes/signal-protocol.ts`, `routes/users/profile.ts`

**Clients touchés** : aucun changement de code client. Aucun nom d'événement
ajouté ni retiré, aucune charge utile temps réel modifiée, aucune ligne de
Socket.IO touchée. Onze réponses **400** gagnent des champs — voir §4.

---

## 1. D'où vient ce cycle

L'inventaire du cycle 88 (§8) laissait 26 sites, et nommait les onze premiers
avec une consigne précise :

> **11 champs `details`/`errors` de réponses 400** — sans producteur : les
> **retirer**, pas les déclarer.

La consigne était bonne pour la moitié du problème. En ouvrant les onze sites,
il s'est avéré qu'ils portaient un second défaut, plus intéressant que le
premier — et que « retirer » n'était pas la bonne réparation.

## 2. L'enveloppe d'erreur, telle qu'elle est réellement

`utils/response.ts` :

```ts
const response = {
  ...(options?.details ?? {}),        // ← ÉTALÉ, ce n'est pas une clé
  success: false,
  error,                               // l'identifiant
  message: options?.message || error,  // le texte
  code: options?.code,                 // le code machine
  ...(options?.violations ? { violations: options.violations } : {})
};
```

Deux faits que les onze schémas ignoraient :

1. **`details` n'est pas une clé de la réponse.** Il est ÉTALÉ à la racine —
   c'est ainsi que `suggestedNickname` remonte sur un 409 de pseudo pris. Un
   schéma qui déclare `details: { type: 'array' }` décrit donc un champ qui
   n'existe jamais.
2. **Le seul tableau que l'enveloppe sache porter s'appelle `violations`.**

## 3. Ce que les onze schémas supprimaient

Deux formes, deux pertes différentes — mesurées en isolant le compilateur sur
l'enveloppe `{ success, error, message, code }` :

| schéma écrit à la main | sortie réelle | perdu |
|---|---|---|
| `{ success, error, details[] }` (profile ×5, signal-protocol ×2) | `{"success":false,"error":"…"}` | `message`, **`code`** |
| `{ success, message, errors[] }` (roles ×2, anonymous ×2) | `{"success":false,"message":"…"}` | `error`, **`code`** |

### La portée réelle, dite sans l'enfler

**Le TEXTE survivait toujours.** Chaque schéma gardait `error` ou `message`, et
l'enveloppe pose `message = message ?? error` : le message d'erreur atteignait
donc le client par l'une ou l'autre clé, et `api.service.ts:239` lit précisément
`data.message || data.error`. Aucun utilisateur n'a jamais vu d'erreur muette.

Ce qui se perdait vraiment :

- **l'AUTRE clé**, selon la forme — inoffensif tant que le client lit les deux ;
- **`code`, sur les onze**, que `api.service.ts` lit pour construire son
  `ApiServiceError(message, status, data.code)`.

Et aucun des onze chemins ne pose de `code` aujourd'hui : `sendBadRequest(reply,
'Donnees invalides')` n'en passe pas. **C'était donc un piège armé, pas une
panne** — la première personne à ajouter un code l'aurait vu disparaître en
silence, sans qu'un témoin tombe.

C'est la troisième fois de la session que la famille rend cette forme-là
(cycles 84 bis, 88), et elle mérite d'être nommée pour ce qu'elle est : un
défaut sans victime AUJOURD'HUI, dont le coût se paiera sur le prochain
correctif de quelqu'un d'autre.

## 4. La réparation : le schéma partagé, pas la suppression

`validationErrorResponseSchema` (`@meeshy/shared`) déclare exactement les cinq
champs réels — `success`, `error`, `message`, `code`, `violations` — et son
`violations.items` porte `{ path, message }`.

Les onze blocs sont remplacés par lui, en conservant la `description` propre à
chaque route. Retirer les champs morts était la moitié du geste ; **rétablir
ceux que l'enveloppe produit était l'autre**, et c'est celle qui compte.

C'est aussi la convention du dépôt, déjà appliquée à côté :
`signal-protocol.ts` utilise `400: errorResponseSchema` pour une autre route
**du même fichier**, cent lignes plus haut ; `admin/roles.ts` fait de même pour
son 401, **trois lignes sous** le bloc écrit à la main. La forme juste était
partout à portée de regard.

### Un constat gardé au passage : `errorResponseSchema` ne déclare pas `message`

Le schéma partagé le PLUS utilisé du dépôt déclare `{ success, error, code }` —
sans `message`. Le texte y passe donc par `error`, et rien ne casse tant que les
clients lisent `data.message || data.error`, ce que fait le web.

**Ce n'est pas corrigé ici** : ajouter `message` à un schéma utilisé par des
centaines de routes est un changement de contrat qui appelle une décision, pas
une initiative de fin de cycle. Un témoin le fige (§5) pour que l'arrivée d'un
lecteur de `message` ne se découvre pas en production.

## 5. Témoins

`error-envelope-serialization.test.ts` (neuf, 5 témoins) monte une vraie
instance Fastify et traverse le sérialiseur :

- `error`, `message`, `success` servis sous le schéma partagé ;
- **`code` servi quand l'appelant en pose un** — le piège que les onze armaient ;
- `violations` servi dans la forme DÉCLARÉE (`{ path, message }`) ;
- **aucune clé `details`** — elle est étalée, et `suggestedNickname` remonte à la
  racine (le comportement réel du 409 de pseudo pris) ;
- `errorResponseSchema` ne sert PAS `message` — constat figé, pas correction.

Le ROUGE de ce lot ne se prouve pas en revertant un fichier : les onze schémas
ne cassaient rien d'observable aujourd'hui. Il se prouve en **exécutant les
anciens schémas** sur l'enveloppe réelle, ce que le §3 fait, et dont le tableau
est la mesure. Un témoin qui « tomberait » ici mentirait sur la gravité.

`response-schema-sweep.test.ts` : l'inventaire gelé passe de **26 à 15**.

## 6. Coût

Nul. Onze déclarations de sérialisation remplacées par un import partagé ;
aucune requête, aucun chemin de code, aucun handler touché.

## 7. Ce que ce cycle laisse ouvert

**Inventaire : 15 sites restants**, tous sur des charges utiles `200`/`202` —
la dette qui vide vraiment quelque chose :

| champ | sites |
|---|---|
| `analysis` × 4 | `voice-analysis.ts` |
| `message` × 2 | `conversations/messages-advanced.ts` |
| `attachment` × 2 + `transcription` | `voice/translation.ts` |
| `sender` | `messages.ts` — **dette de FORME seulement** : la déclaration y est inerte (cycle 88), et la fuite qu'elle cachait est fermée |
| `creator`, `details`, `link`, `permissions`, `user` | un par un |

Et, propre à ce cycle :

- **`errorResponseSchema` sans `message`** (§4) — décision de contrat à prendre,
  pas une initiative.
- **`validationErrorResponseSchema.details`** déclare un tableau au premier
  niveau que l'enveloppe n'y pose jamais (elle l'étale). Inerte et sans risque,
  mais c'est le même malentendu, figé dans le paquet partagé — hors de portée du
  balayage, qui ne lit que `services/gateway/src/routes`.
- **Le balayage ne voit pas `packages/shared`.** Les schémas partagés sont
  pourtant ceux dont un défaut se propage le plus loin.

## 8. La leçon

> **« Sans producteur » ne veut pas dire « à supprimer ».** Le cycle 88 avait
> classé ces onze champs comme du bruit documentaire à retirer. Ils l'étaient —
> mais le schéma qui les portait supprimait aussi des champs que l'enveloppe
> PRODUIT. Retirer le champ mort et s'arrêter là aurait laissé `code` tomber
> pour toujours. **Un schéma faux se répare en le confrontant à ce que
> l'émetteur émet, jamais en retranchant seulement ce qu'on sait faux.**

Et le corollaire, sur la façon de dire la gravité :

> **Un piège armé se raconte comme un piège, pas comme une panne.** Aucun
> utilisateur n'a jamais vu d'erreur muette : le texte passait toujours. Ce qui
> manquait — `code` — n'est demandé par aucun des onze chemins aujourd'hui. Le
> défaut est réel et vaut d'être fermé, et le décrire comme une fuite en cours
> aurait été faux. La mesure honnête, ici, n'est pas un témoin qui tombe : c'est
> l'ancien schéma exécuté sur l'enveloppe réelle, dont la sortie tient en une
> ligne.
