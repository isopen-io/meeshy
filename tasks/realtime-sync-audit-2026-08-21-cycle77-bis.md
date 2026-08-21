# Cycle 77-bis — Le canal mort cachait un gestionnaire vide

**Date** : 2026-08-21
**Branche** : `claude/keen-hamilton-k0hlhu`
**Suffixe `-bis`** : deux cycles ont porté le numéro 77 en parallèle, sur la
MÊME piste laissée par le cycle 76 (« tout événement déclaré au contrat a-t-il
un émetteur ? »). L'autre (`claude/keen-hamilton-dw7y92`, PR #3271,
`…-cycle77.md`) a fusionné le premier et garde le nom canonique : c'est lui qui
porte la garde `socket-event-emitter-gate` et le retrait des cinq canaux.

**Ce cycle-ci ne les refait pas.** Il traite ce que le retrait a laissé
derrière lui, et que l'audit canonique ne nomme pas.

**Périmètre** : web (`hooks/use-stream-socket.ts` + sa suite). Une seule
fonction, trois tests.

---

## 1. Le reste

Le cycle 77 a retiré `conversation:online-stats` en le classant « inoffensif » :

> | `conversation:online-stats` | iOS, web | aucun consommateur d'interface, nulle part |

La moitié iOS est exacte — le sujet Combine n'avait aucun abonné. La moitié web
ne l'est pas. Au bout de la chaîne de six niveaux que l'audit décrit lui-même
(`presence.service` → … → `use-stream-socket`), il y a un consommateur
d'interface bien réel : `handleConversationOnlineStats`, quarante lignes, qui
appelle `onActiveUsersUpdate` — **la liste des présents de la vue stream**.

L'audit voit ces quarante lignes et les compte au passif (« un handler de
quarante lignes qui reconstruit une liste d'utilisateurs en ligne — pour un
événement qu'aucune version de la passerelle n'a jamais émis »). Elles sont bien
mortes. Mais la QUESTION qu'elles posent — qui tient cette liste à jour, alors ?
— n'a pas été posée.

La réponse est dans le même fichier, quarante lignes plus haut :

```ts
const handleUserStatus = useCallback((userId, username, isOnline) => {
  // Géré par les événements socket - peut être étendu si nécessaire
}, []);
```

**Vide.**

## 2. Ce que ça donne à l'écran

La liste des présents a exactement deux écrivains possibles, et elle en avait
zéro qui fonctionne :

| écrivain | quand | état |
|---|---|---|
| `conversation:stats` (`stats.onlineUsers`) | à l'ouverture, une fois | vivant |
| `conversation:online-stats` | à chaque changement | canal jamais émis |
| `user:status` | à chaque connexion/déconnexion | **gestionnaire vide** |

La liste est donc SEMÉE à l'ouverture, puis figée. Qui arrive après vous
n'apparaît jamais ; qui part reste affiché — pour toute la durée de la session.

Le retrait du cycle 77 n'a pas créé ce défaut : il l'a mis à nu. Avant, la vue
avait deux écrivains dont un mort ; maintenant elle en a un seul, et le
gestionnaire vide n'a plus rien derrière quoi se ranger.

## 3. Pourquoi personne ne l'a vu, ni alors ni maintenant

**Les deux moitiés du défaut se protégeaient l'une l'autre.** Le gestionnaire
vide paraissait couvert par le canal riche à côté de lui ; le canal riche
paraissait dispensé d'émetteur par la présence d'un récepteur complet. Chacune
des deux moitiés, lue seule, ressemble à une décision — « c'est géré
ailleurs ».

Et le commentaire du gestionnaire vide dit précisément cela : « Géré par les
événements socket - peut être étendu si nécessaire ». C'est l'aveu, pas la
note : l'endroit exact où quelqu'un s'est arrêté.

## 4. Le remède

`handleUserStatus` tient la liste à partir de `user:status` — le canal qui porte
réellement ce fait, que la passerelle diffuse aux rooms de conversation à chaque
connexion et déconnexion, et dont les trois clients se servent déjà pour leur
présence.

Ajout à l'arrivée, retrait au départ, et **trois no-op** : soi-même, un arrivant
déjà connu, un partant inconnu. Sans eux, chaque trame de présence remplacerait
la liste entière, et chaque remplacement remonte au parent.

`user:status` ne porte qu'un delta — identifiant, nom, état. L'entrée créée est
donc MINIMALE et assumée : pas de prénom, pas d'avatar, pas de langue. Le nom
d'affichage suffit à la pastille, et le prochain `conversation:stats` la
remplacera par la forme complète. **Inventer un profil ferait pire que de
l'avouer.**

C'est aussi le seul des deux canaux qu'on puisse tenir sans coût : l'instantané
complet par conversation à chaque changement — ce que promettait le canal
retiré — demanderait deux requêtes par conversation à chaque connexion. C'est
très probablement pourquoi il n'a jamais été implémenté.

## 5. Preuves

| gate | résultat |
|---|---|
| `use-stream-socket` — 3 tests neufs, sur le gestionnaire VIDE de `main` | **2 ROUGES** |
| `use-stream-socket` — après correctif | 8/8 verts |
| web — suites socket, hooks, orchestrateur | vertes (inchangées) |

Le témoin rouge est la preuve qui compte : les tests ont été écrits contre le
`main` fusionné, et deux d'entre eux échouent dessus.

## 6. Piste laissée ouverte

**Retirer un canal mort demande de regarder ce que son récepteur ALIMENTAIT.**
Ici le récepteur mort était le seul écrivain apparent d'un état d'interface ;
son retrait laisse cet état sans personne. La garde `socket-event-emitter-gate`
ne peut pas voir ça — elle raisonne sur des noms de canaux, pas sur ce que les
gestionnaires écrivent. Aucune garde ne remplace la question, qui se pose à la
main, une fois : **après ce retrait, qui écrit encore dans ce que le code retiré
écrivait ?**
