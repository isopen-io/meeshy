# Cycle 53 — la ligne de liste web décrivait un mélange de deux messages

## Piste

- [x] Reprise de la piste n°1 du cycle 52, qu'il qualifie lui-même de « la plus
      grosse » et que son CHANGELOG nomme : « Web non traité, défaut réel et
      documenté […] son correctif demande une décision de RENDU »
- [x] `main` frais (cycle 52 atterri), la piste est prise

## Constat

- [x] `conversation:updated` porte **huit** champs d'aperçu ; le web en lisait
      **trois** (`lastMessageAt` + la paire du Prisme)
- [x] `lastMessageId` n'était traité que dans sa forme NULLE ; sa forme PLEINE —
      celle qui nomme un remplaçant — était ignorée
- [x] `lastMessagePreview`, `senderId`, `previewRecalculated`, `location` étaient
      recopiés sur la conversation, où `Conversation` ne les déclare pas et où
      personne ne les lit — un champ fantôme par ligne, à chaque message
- [x] La ligne rend l'OBJET `conversation.lastMessage`, que rien ne réécrivait —
      pendant que la carte du Prisme du NOUVEAU message, elle, entrait bien
- [x] **Les deux moitiés de la ligne sont écrites par des chemins différents**,
      et le résolveur PRÉFÉRANT la traduction à l'aperçu brut, c'est le champ
      patché qui gagne à l'écran : « Windie : Bonsoir », où « Bonsoir » est le
      texte du remplaçant et « Windie », l'heure et la vignette celles du
      message masqué

## Les deux chemins qui restaient faux

- [x] **Masquage PERSONNEL** — aucun `message:deleted` ne part (le message reste
      vivant pour les autres), `refreshPersonalConversationPreview` n'émet que
      ce `conversation:updated`, et seul le serveur connaît le remplaçant
- [x] **Suppression POUR TOUS, conversation non ouverte** —
      `handleMessageDeleted` balaie un cache vide et renonce délibérément,
      refusant une ambiguïté que l'événement d'à côté avait déjà tranchée
- [x] Rien ne corrige ensuite : la conversation n'a plus aucune raison d'émettre

## Correctif

- [x] `mergeConversationUpdate(conversation, raw)` — point d'entrée du cache,
      applique la règle de la **leçon 211** écrite au cycle précédent pour iOS
- [x] Quatre formes : clé absente ⇒ rien ; `null` ⇒ vider ; même id ⇒ réécrire
      le TEXTE et rien d'autre ; autre id ⇒ message NEUTRE depuis le payload
- [x] **Neutre, pas hérité** — l'auteur et les pièces jointes du précédent sont
      exactement le mélange qu'on ferme. Ligne INCOMPLÈTE et corrigible plutôt
      que FAUSSE et durable, comme `LastMessageFacet` côté iOS
- [x] **La borne fait le correctif** : sans le no-op « même id », chaque message
      reçu dépouillerait sa propre ligne (le chemin de l'envoi)
- [x] Pas d'horodatage lisible ⇒ on ne compose rien (« Invalid Date »)
- [x] `normalizeConversationPatch` reste PURE ; les cinq champs du groupe
      d'aperçu sont consommés par la fusion, plus recopiés

## Gates

- [x] Suite web COMPLÈTE : 580 suites, 12 430 témoins verts, 21 ignorés, 0 échec
- [x] `bun run test:coverage` — seuils tenus (exit 0)
- [x] `tsc --noEmit` — aucune erreur sur les 3 fichiers touchés (le dépôt en
      porte une trentaine par ailleurs, préexistantes, comparées fichier par
      fichier plutôt que sur le code de sortie)
- [x] Gardes CI `check-law-literals.sh` et `check-swift-viewbuilder.sh` vertes
- [x] `packages/shared` reconstruit avant la campagne — `moduleNameMapper` pointe
      sur `dist/`, et un `dist` périmé faisait échouer une suite à la RÉSOLUTION,
      sur `main` comme sur la branche (vérifié des deux côtés)
- [x] `main` refusionné à la main avant push — merge propre, suite relancée verte
- [x] CHANGELOG racine + ADR `apps/web/decisions.md` + journal cycle 53 +
      leçon 212

## Revue

Voir `tasks/realtime-sync-audit-2026-08-16-cycle53.md` — pourquoi le cycle 52
avait conclu le web « indemne par structure » (vrai du recalcul LOCAL, faux du
fan-out SERVEUR), pourquoi le mélange se cache à la jointure de deux modèles
(un objet d'un côté, des scalaires frères de l'autre), et les quatre pistes du
cycle 54.

PR #3111.
