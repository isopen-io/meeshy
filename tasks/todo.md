# Cycle 70 — les quatre portes d'entrée admettent encore dans une conversation MORTE

**Branche** : `claude/keen-hamilton-d62bbs`
**Périmètre** : gateway (`services/conversations/conversationEntryAdmission.ts`,
`routes/conversations/participants.ts`, `routes/conversations/sharing.ts` ×2,
`routes/anonymous.ts`)

## Le défaut

`conversationWriteAdmission` (cycle 31, règle 1) fait respecter l'état terminal
d'une conversation **à l'ÉCRITURE**. Personne ne le fait respecter **à
l'ENTRÉE** : `resolveConversationEntry` répond « que faire de la ligne
`Participant` déjà là » sans jamais demander « ce fil accepte-t-il encore
quelqu'un ». Les quatre portes admettent donc dans une conversation close :

| porte | garde d'état terminal |
|-------|----------------------|
| `POST /conversations/:id/participants` | aucune |
| `POST /conversations/join/:linkId` | aucune (le LIEN est vérifié 3×, jamais le fil) |
| `POST /conversations/:id/invite` | aucune |
| `POST /anonymous/join/:linkId` | aucune (le LIEN est vérifié 5×, jamais le fil) |

Aucune route de clôture ne désactive les liens de partage : la porte reste
grande ouverte indéfiniment.

Ce que reçoit l'arrivant : une notification push, un `conversation:new` que les
deux clients ÉCRIVENT dans leur cache persistant, une room rejointe — et une
conversation que `GET /conversations` (`isActive: true` à la racine) ne sert
jamais, dans laquelle `conversationWriteAdmission` refuse chacun de ses
messages. Le tombstone ne la rattrape pas : `closedAt > since` et la clôture
est ANTÉRIEURE à son arrivée. La ligne fantôme survit à toute resynchro delta.

## Plan

- [ ] 1. RED — témoins d'unité : `resolveConversationEntry` rend `closed`
- [ ] 2. RED — témoins de route sur les 4 portes (aucune écriture, aucun emit)
- [ ] 3. GREEN — outcome `closed` dans l'unité, lecture PARESSEUSE de la
      conversation (seulement quand la décision ÉCRIRAIT), double colonne
      (`isActive === false || closedAt != null`) via `isConversationClosed`
- [ ] 4. GREEN — les 4 routes câblent le refus (410 sur les portes de LIEN,
      400 sur les portes d'admin) ; message en un seul exemplaire
- [ ] 5. Gates : `tsc --noEmit`, suites ciblées, suite gateway complète
- [ ] 6. Rapport de cycle + PR + CI verte + merge sur main

## Décisions

- **`already-member` et `banned` l'emportent sur `closed`** : aucune écriture
  n'est en jeu dans ces deux issues, et ce cycle ne retire aucune capacité
  vivante. Le refus ne frappe QUE `create` et `rejoin`.
- **Lecture paresseuse** : la porte du lien répond « déjà membre » à chaque
  réouverture d'un lien partagé — lui facturer une lecture de conversation pour
  une question sans conséquence serait un coût gratuit.
- **Double colonne, comme le jumeau d'écriture** : les lignes fermées par
  l'ancien `leave.ts` (avant cycle 67) n'ont pas de `closedAt` et rien ne les
  rétro-remplit.

## Review (2026-08-18, fin de passe)

**Livré** : la garde d'état terminal posée sur les QUATRE portes d'entrée.
- `resolveConversationEntry` gagne l'issue `closed`, sur une lecture PARESSEUSE
  (seulement quand la décision écrirait) et la double colonne d'`isConversationClosed`.
- Les 3 portes de l'unité (`participants`, `join/:linkId`, `invite`) + la 4e
  (`anonymous/join/:linkId`, gardée sur la relation déjà chargée — zéro requête
  de plus) câblent le refus ; message en un seul exemplaire.
- `banned` et `already-member` gardent leur réponse : aucune capacité vivante retirée.

**Gates** : `tsc` 0 erreur · 257/257 sur les 8 suites des portes (+39 gardes) ·
suite gateway complète 747 suites / 18 109 témoins verts.

**ROUGE prouvé** en trois temps (6, puis 8, puis 4 témoins tombés sur la
production d'avant). Aucune assertion existante réécrite — deux fabriques de
doubles ont gagné `conversation.findUnique`, rien d'autre.

**Nommé, non livré** (détail au rapport § 6) : l'auto-inscription à la
conversation globale (`AuthService`), la matérialisation d'une ligne héritée
(`MessagingService`), et le fait qu'aucune route de clôture ne désactive les
liens de partage du fil qu'elle ferme — décision produit.

Rapport complet : `tasks/realtime-sync-audit-2026-08-18-cycle70.md`
