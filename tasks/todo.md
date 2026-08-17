# Cycle 58 — la socket des notifications pouvait mourir DÉFINITIVEMENT, en silence

## La piste

- [x] Piste ouverte par la relecture de la stratégie de reconnexion (PHASE 2 :
      « reconnection strategy, exponential backoff »). Le couloir principal
      (`socketio/connection.service.ts`) porte DEUX corrections documentées ;
      sa jumelle `notification-socketio.singleton.ts` n'en porte AUCUNE des deux

## Le constat — deux défauts jumeaux, dont le premier ARME le second

- [x] **(a) Le jeton du handshake est un LITTÉRAL** : `auth: { token }`, figé à
      la construction. Socket.IO rejoue `auth` à CHAQUE tentative de
      reconnexion — toutes re-présentent donc le jeton d'origine. Après un
      rafraîchissement silencieux (chemin 401 REST), chaque tentative présente
      des identifiants que la gateway refuse
- [x] **(b) `reconnect_failed` n'est écouté par personne.** La boucle interne de
      Socket.IO abandonne DÉFINITIVEMENT après `reconnectionAttempts: 5`. Rien
      ne la relance : `connect()` n'est appelé que par un `useEffect` monté sur
      l'authentification (`use-notifications-manager-rq.tsx:128`), qui ne
      re-tourne pas sur un échec de socket
- [x] (a) fait tomber (b) en ROUTINE et non seulement sur une longue coupure :
      un rafraîchissement de jeton suffit à brûler les 5 tentatives
- [x] `reconnectionDelay: 5000` sans `reconnectionDelayMax` ⇒ les 5 tentatives
      tiennent ~25 s. Une coupure réseau de 30 s tue le canal
- [x] Conséquence : plus AUCUN `notification:new`, `read`, `deleted`, `counts`
      pour le reste de la session d'onglet. La pastille gèle. Et le rattrapage
      ne part pas non plus — `emitDesync('reconnect')` ne peut plus jamais
      être émis, alors que le fichier documente lui-même que React Query est en
      `staleTime: Infinity` et n'a « aucune autre voie de rattrapage »
- [x] `this.reconnectAttempts++` (dans `connect_error`) est un compteur ÉCRIT et
      JAMAIS LU — il donne l'apparence d'une gestion de tentatives qui n'existe pas

## Correctif — mirroir de la jumelle, plus une subtilité qu'elle n'avait pas

- [x] **(a)** `auth` devient un RÉSOLVEUR appelé à chaque handshake
      (`authManager.getAuthToken()`, repli sur le jeton confié à `connect()`
      pour les porteurs sans localStorage) — exactement `resolveHandshakeToken()`
      de la jumelle
- [x] **(b)** `reconnect_failed` passe la main à une boucle de backoff manuelle
      (exponentielle, plafonnée, avec gigue), qui reconstruit la socket
- [x] **La subtilité propre à ce fichier** : la reprise ne doit PAS passer par
      `disconnect()`. Celui-ci remet `hasConnectedBefore = false` et réinitialise
      `syncSeq` — donc la reconnexion réparée n'émettrait PAS `desync('reconnect')`
      et perdrait le curseur `_seq`. Or ce signal EST le rattrapage. Séparer le
      démontage TECHNIQUE du reset SÉMANTIQUE
- [x] Aligner `reconnectionDelay`/`Max`/`randomizationFactor` sur la jumelle
      (1000 → 30000, gigue 0.5) : la boucle interne couvre alors une coupure
      bien plus longue avant de céder la main
- [x] Retirer le compteur mort, ou l'utiliser réellement pour le backoff

## Gates

- [x] Suite web ciblée verte, témoins neufs
- [x] `tsc --noEmit` web : zéro erreur NOUVELLE (dette préexistante mesurée sur main)
- [x] Preuve par mutation dans les deux sens
- [x] `main` refusionné à la main avant push
- [x] CHANGELOG + journal de cycle + leçon

## Revue

Voir `tasks/realtime-sync-audit-2026-08-17-cycle58.md` — le tableau des deux
sockets web, pourquoi (a) arme (b), et la subtilité du §3-3 (rendre la socket
SANS rendre le rattrapage) sur laquelle une reprise « évidente » se serait
trompée en silence. Huit pistes pour le cycle 59.

Gates constatés : **suite web complète 582 suites / 12 485 témoins verts**, le
fichier visé de 55 à **65 témoins**, `tsc --noEmit` à **1234 sur `main` contre
1233 sur la branche** (zéro nouvelle, une préexistante supprimée), et
**6 mutations** — 5 sous-dosages tous rouges, 1 sur-dosage vert qui a fait
RETIRER une garde inatteignable plutôt que l'habiller d'un témoin.

Deux témoins écrits d'abord passaient à VIDE (ils émettaient sur la socket
d'origine) ; corrigés par une assertion d'identité posée avant l'émission.
Leçon 222.
