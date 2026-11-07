# #16655 — la file hors ligne rejoue les adresses NUES d'une pièce signée par lecteur

**Issue** : #16655. **Branche** : `claude/exciting-planck-t1dj8f` (repartie de `dev` après la fusion de #16661).
**Cycle** : 138 bis, suite du balayage du cycle 138.

## Le défaut, en une ligne

UNE charge est construite, puis servie de DEUX façons : signée par lecteur pour
les destinataires EN LIGNE, **nue et sans condition** pour la file des absents.
Au reconnect, le rejeu écrase les URLs signées que le client détient par des
adresses mortes — et `mergedAttachment` fait de la valeur morte la valeur EN
CACHE.

C'est la forme du cycle 125 : la garde est juste, bien placée, testée — et la
porte de sortie VOISINE, dans la même fonction, expédie ce que la garde existe
pour retenir.

## Ce que la passe de conception a CORRIGÉ à l'issue

| l'issue disait | la mesure dit |
|---|---|
| deux chemins de charge | **CINQ** — `attachment-updated`, `edited`, `new` (socket), `new` (REST/ZMQ), `link-message` |
| « iOS remplace la carte en bloc » | à moitié faux ; et les **trois** clients ont **trois** règles différentes |

Les trois règles, mesurées :

| client | `fileUrl` | `translations` |
|---|---|---|
| web | `{...cached, ...incoming}` ⇒ **l'URL signée est écrasée** | carte présente aux entrées sans url ⇒ **remplace en bloc** |
| iOS | **jamais écrit** (préservé) | dépouillée des entrées sans url ; carte vide ⇒ `nil` ⇒ **préservée** |
| Android | la nue **gagne** (`incoming ?? held`) | fusion PAR LANGUE, l'horloge peut faire gagner une entrante SANS url |

> **« Il suffit d'omettre les URLs » n'est pas à moitié sûr : c'est
> DIFFÉREMMENT dangereux par client** — destructeur sur le web, inutile sur
> iOS. C'est le vrai argument pour signer AU DRAIN, et il va dans le message de
> commit.

Et `message:new` est le pire des cinq : `announcesMessageArrival` y est VRAI,
donc un rejeu nu fait aussi avancer la coche de l'expéditeur à « remis » pour
un message dont le média est mort.

## Pourquoi au DRAIN, et pas à l'enfilage

Une adresse signée vit 6–7 h (`READER_FILE_URL_LIFETIME_SECONDS` + `_STEP_`) ;
une entrée de file vit 48 h (`DELIVERY_QUEUE_TTL_SECONDS`). Signer à l'enfilage
échangerait un 404 contre un autre. Le drain, lui, connaît le lecteur AU MOMENT
de l'émission.

Et le correctif va au drain **une fois**, clavé par `eventType`, plutôt que chez
cinq producteurs : celui qui oublierait n'aurait, par construction, aucun
témoin — la doctrine que `resolvePayloadForReader` écrit déjà.

## Deux prémisses VÉRIFIÉES avant d'écrire une ligne

- **Idempotence** : `storageKeyFromMediaUrl` rend `null` pour
  `/api/v1/attachments/signed/<token>/<key>` — pas de segment
  `/attachments/file/`, et le repli « clé nue » refuse ce qui commence par `/`.
  Le drain peut donc signer SANS se demander si la charge l'était déjà.
- **Coût** : `withoutExpiredShareLinks` rend ses participants tels quels quand
  aucun ne porte de `shareLinkId` (retour anticipé, zéro requête). Avec une
  lecture de protection GROUPÉE par `messageId`, le total est de **+2 requêtes
  AU PLUS pour un drain de 500 entrées**, indépendamment du nombre d'entrées.
  Un drain par entrée serait un amplificateur de tempête de reconnexions.

## Fail-closed contre fail-open — et l'argument qui inverse l'intuition

`restoreForRetry` est PRIVÉE : le manager ne peut pas remettre une entrée en
file. « Fail closed » ne peut donc signifier qu'ABANDONNER.

> **Une entrée abandonnée laisse le cache du client INTACT et nomme sa
> conversation pour relecture** (`pending-messages:delivered.conversationIds`
> est bâti depuis `[...delivered, ...undelivered]`) ; **une entrée nue ÉCRASE
> une URL qui marchait par une morte, et fait de la morte la valeur en cache.**
> Abandonner est donc STRICTEMENT moins destructeur qu'émettre nu — ce qui
> inverse la lecture naïve « le drain est destructif, donc fail open ».

| situation | verdict |
|---|---|
| pas de clé de signature | fail **OPEN** — rien n'est signé dans cette configuration |
| aucune clé signable dans l'entrée | tel quel |
| appartenance `'unavailable'` | gate d'autorisation : fail-OPEN (inchangé) ; signature : abandonne les entrées PORTEUSES seulement |
| lecture de protection qui lève | fail **CLOSED**, par entrée |
| ligne `Message` absente | fail **CLOSED ⇒ on signe** |
| lecteur non admis (lien expiré) | fail **CLOSED** |
| la signature lève | fail **CLOSED**, dans le `try` par entrée |

Deux invariants : le code neuf ne lève **jamais** hors de la boucle, et chaque
refus porte sa **propre `reason`** — le doc-comment du drain énumère « les
QUATRE refus de ce chemin » et cette énumération doit suivre, sinon elle
devient un de ces commentaires périmés que le dépôt paie en boucle.

## Hors périmètre, chacun son issue

1. Un lien de partage expiré doit-il aussi arrêter le rejeu du TEXTE ? Question
   de `shareLinkReadGate`, pas de lecture de fichier.
2. Le compteur du gate `ATTACHMENT_URL_SIGNATURE_ENFORCE` ne devient mesurable
   qu'APRÈS ce lot. Remesurer, puis décider de la bascule.

## Budget, remesuré sur cet arbre

`MeeshySocketIOManager.ts` : 3601 lignes contre 3816 gelées (215 de marge) — le
câblage y tient, tout le reste va dans le module neuf.
`MeeshySocketIOManager.test.ts` : 8156 contre 8158 (**2 lignes**) — le témoin de
câblage ne peut PAS y vivre.
