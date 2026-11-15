# Cycle 170 — `[]` n'est pas « je n'ai pas calculé », et le signal que je n'ai pas lu

*2026-11-15. Branche `claude/exciting-planck-kexumt`. Numéro 170 : 166 à 169
étaient pris sur `dev` par #18656, #18634, #18604 et #18615.*

**Livré** : #18622 — une charge de diffusion ne porte plus de champ par lecteur.

---

## Ce que le cycle a d'abord coûté

Le lot de ce cycle devait être #18615, le plancher d'historique relu au drain.
Il a été écrit en entier — module, témoin de site, douze mutations une par une,
journal, deux leçons, commit — puis **jeté** : une autre session l'avait livré
sur `dev` deux heures plus tôt (`7afbb88fe`), avec un lot plus large et mieux
arbitré.

Le signal existait PAR CONSTRUCTION. Le dépôt impose de pousser un témoin rouge
dans les quinze minutes pour que les autres sessions le voient, et l'autre
session avait obéi : `45d77e125`, poussé avant que je commence. Une commande le
rendait — `git log --all --oneline --grep="#18615"`. J'ai toujours émis ma
moitié de la directive, jamais lu la sienne. Détail et règle :
`tasks/lessons/2026-11-15-la-directive-de-la-branche-poussee-tot-se-lit-avec-git-log-all-grep.md`.

**La vérification a servi dès son premier usage** : lancée sur le reste de
l'arriéré avant de choisir ce lot, elle a montré que #18614 est pris lui aussi.
#18622 était libre.

**Et le lot cédé n'est pas tout à fait perdu** : il portait le contexte qu'il
fallait pour auditer celui qui a gagné. Sa garde est PORTANTE (retirée du drain,
15 témoins sur 24 tombent), son `select` partagé est bien élargi, et elle était
plus juste que la mienne sur un point que mon journal défendait explicitement —
un refus par IGNORANCE est une PERTE, pas un refus prouvé, et il doit nommer sa
conversation pour envoyer le client relire.

---

## Le défaut livré

`serializeAttachmentForSocket(raw)` sans `currentParticipantId` servait
`currentUserReactions: []`, et son doc-comment le disait : « absent (broadcast)
→ vide ». **Mais `[]` ne dit pas « je n'ai pas calculé », il dit « il n'y en a
pas »**, et le client le lit comme tel.

Le web FUSIONNE (`realtime-apply.ts`, `{ ...cached, ...incoming }`) et ne
préserve que `transcription` et `translations`, et seulement sur `null`. `[]`
n'est pas `null` : `incoming` écrasait. Bob réagit 🔥 à un vocal, la piste TTS de
la langue suivante arrive, son badge cesse d'être rendu comme le SIEN et le menu
lui propose « ajouter » un emoji qu'il a déjà posé.

### Le relevé, avant de changer la forme

L'issue l'exigeait, et il a décidé la forme :

| client | ce qu'il fait de ce champ reçu par cet événement |
|---|---|
| Android | **le protège explicitement** d'une diffusion — son doc-comment le nomme |
| iOS | **ne le lit pas** : ne patche que `transcription` et `translations` |
| web | **le recopie** — le seul des trois, et le seul touché |

Deux sur trois tenaient déjà l'événement pour muet sur les réactions. La clé
ABSENTE est la seule forme qui le DISE, et la seule qui survive au `spread` du
client. Les trois la déclarent facultative : l'omettre est rétrocompatible.

### Deux choses que l'analyse de l'issue n'avait pas

1. **Le correctif est dans le SÉRIALISEUR, pas dans l'émetteur.** `MessageHandler`
   fait le même appel nu pour `message:edited`, sur un message EXISTANT dont la
   pièce peut porter des réactions. Corriger `emitAttachmentUpdated` seul aurait
   laissé ce second site — le défaut y était identique et personne ne l'avait vu,
   parce que l'issue était rédigée depuis l'émetteur.
2. **Le témoin interroge la PRÉSENCE DE LA CLÉ, jamais sa valeur.** Une clé
   présente à `undefined` écrase tout autant. `toBeUndefined()` aurait laissé
   passer la moitié du défaut.

---

## Mutation, une garde à la fois

| mutation | témoins tombés |
|---|---|
| la clé repart TOUJOURS (le défaut d'avant) | 8 |
| la clé ne part JAMAIS (correctif trop large : casse `/sync` et la page) | 4 |
| la clé part à `undefined` | 8 |
| l'agrégat PARTAGÉ disparaît avec elle | 9 |

Côté web, deux témoins de natures différentes, et la différence est dite dans
leurs doc-comments : le premier tourne sur le puits INCHANGÉ et pin le CONTRAT
que le web attend de la passerelle — il ne peut tomber d'aucune mutation locale
au web, et c'est sa fonction ; le second garde contre le correctif trop large et
tombe bien sur « le web fige toujours les réactions du cache ».

---

## Preuve

- gateway : 3 605 témoins verts (`src/socketio`, `src/__tests__/unit/socketio`,
  `src/routes/__tests__`, les deux cliquets de budget) ;
- web : 4 251 témoins verts ;
- `tsc --noEmit` EXIT=0 des deux côtés.
