# iOS ne lit pas le CODE d'erreur du gateway — « inconnu » se dit « parti »

**Ouvert le 2026-08-22.** Défaut constaté en intégrant le travail
« un avis d'arrivée mène à la fiche » (commit `88c2e91f0`).

## Le fait

Le gateway distingue deux situations sur
`GET /conversations/:id/participants/:pid/profile`, et le dit dans son propre
commentaire — « seul le CODE distingue, jamais le corps » :

| situation | réponse |
|---|---|
| participant inconnu de cette conversation | 404 nu |
| participant **parti** | 404 + `code: 'PARTICIPANT_LEFT'` |

- **Le web respecte ce contrat** : `use-participant-profile.ts` fait voyager le
  code avec l'erreur (`failure.code = response.code`), la vue choisit la bonne
  phrase.
- **iOS ne le peut pas** : `ParticipantProfileSheet` tranche sur
  `if case APIError.serverError(404, _)`, donc **tout** 404 affiche « Cette
  personne a quitté la conversation ». Un `participantId` inconnu ou invalide y
  affiche donc une phrase FAUSSE.

## Pourquoi ce n'est pas corrigeable là où le défaut se voit

Le code n'atteint jamais la couche vue : `APIResponse` (APIClient.swift:84) ne
décode que `success` / `data` / `error` — ses `CodingKeys` ne listent pas
`code` — et `APIError.serverError(Int, String?)` porte un MESSAGE, pas un code.
Discriminer sur le message serait fragile et non localisable.

## Où cela doit se faire

**Lot C, tâche C4** (« La rupture client — en-tête, 426, porte bloquante »).
`Networking/APIClient.swift` est un fichier POSSÉDÉ par le lot C, et C4 doit de
toute façon apprendre à APIClient à reconnaître un code d'erreur serveur pour la
porte 426. Faire remonter `code` jusqu'à l'appelant est le même geste, fait une
fois : y greffer ce correctif évite une seconde ouverture du même fichier et le
conflit avec le lot en cours.

## Définition de fini

- `APIResponse` décode `code` ; `APIError` le fait remonter à l'appelant.
- `ParticipantProfileSheet` n'affiche « a quitté la conversation » que sur
  `PARTICIPANT_LEFT`, et retombe sur « Fiche indisponible » pour tout autre 404.
- Un test qui ROUGIT sur un 404 nu affichant la phrase du départ — sans quoi la
  garde ne garde que son nom.
