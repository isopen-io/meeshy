# Itération 270 — Analyse : le barème de présence 1/3/5 vit en trois miroirs sans aucun témoin de parité

## État courant

L'état de présence d'un contact (`online` / `away` / `idle` / `offline`) est
dérivé du temps écoulé depuis sa dernière activité, selon la règle produit
**1/3/5** (CLAUDE.md § User Presence, 2026-07-20) :

- `isOnline === true` (garde anti-stale : ignoré si activité > 5 min) → `online`
- `≤ 60 s` → `online` (vert, pulse)
- `≤ 3 min` → `away` (orange)
- `≤ 5 min` → `idle` (gris affiché)
- `> 5 min` (ou pas de donnée) → `offline` (aucun dot)

Ce barème vit en **TROIS exemplaires**, un par client — c'est la même exigence
que pour la table de réduction de langue traitée à l'itération 269 :

| plateforme | site | forme des seuils |
|---|---|---|
| TypeScript (SSOT) | `PRESENCE_ONLINE/AWAY/IDLE_WINDOW_MS` (`packages/shared/utils/user-presence.ts`) | constantes, ms |
| Swift (iOS/SDK) | `UserPresence.state(now:)` (`packages/MeeshySDK/.../Models/PresenceModels.swift`) | littéraux inline, secondes |
| Kotlin (Android) | `Presence.ONLINE/AWAY/IDLE_WINDOW_MS` (`apps/android/core/model/.../Presence.kt`) | constantes, ms |

Le web n'est **pas** un quatrième miroir : il consomme le SSOT TS partagé.

## Problèmes identifiés

1. **Aucun témoin ne garde la parité des trois miroirs.** L'invariant ne tient
   que par des consignes en commentaire (« miroir Android `Presence.kt` »,
   « Toute évolution de la règle doit toucher les trois sites »). Une consigne
   n'est pas un témoin : un seuil peut dériver sur un seul site sans que rien ne
   rougisse — exactement le trou que l'itération 269 a fermé pour les tables de
   langue (leçon 288 : « un témoin de parité qui couvre N−1 des N sites déplace
   le risque sur le site non couvert »). Ici la couverture est **0 sur 3**.
2. **Le seul test existant (`user-presence.test.ts`) n'exerce que le SSOT TS.**
   Il prouve le comportement de `getUserPresenceStatus`, jamais l'égalité avec
   les seuils iOS/Android. Le comportement TS peut être parfait pendant que
   Swift sert `away` là où TS sert `online`.
3. **Une divergence de seuil est directement visible par l'utilisateur.** Un
   même `lastActiveAt` afficherait un point vert sur un client et orange sur un
   autre pour la même donnée serveur — une incohérence de premier plan, sur un
   indicateur présent partout (avatars, en-têtes de conversation, listes).
4. **Sous-invariant non gardé : la garde anti-stale `isOnline` de Swift.** Le
   chemin `isOnline` ignore un flag serveur périmé au-delà de la fenêtre idle
   (`elapsed.map({ $0 <= 300 }) ?? true`). Ce `300` DOIT rester égal au seuil
   idle, sinon un `isOnline=true` obsolète survivrait plus longtemps sur iOS que
   ne le prévoit la garde TS (`elapsed <= PRESENCE_IDLE_WINDOW_MS`).

Mesure (le témoin ROUGIT sur chaque dérive, prouvé avant merge) :

| mutation | résultat |
|---|---|
| iOS `away` 180 → 200 | 1 test échoue (Swift) |
| Kotlin `ONLINE_WINDOW_MS` 60_000 → 90_000 | 1 test échoue (Kotlin) |
| TS `IDLE` 5 min → 6 min | 4 tests échouent (contre-épreuve + Swift + Kotlin) |
| état d'origine | 4 tests passent |

## Causes racines

Le barème de présence a été porté sur les trois plateformes avec des consignes
de maintenance en commentaire, mais sans témoin exécutable — le même point de
départ que la table de réduction de langue avant l'itération 269. La règle du
dépôt s'applique : *une divergence entre N implémentations de la même règle se
supprime en installant UN témoin qui peut tomber au rouge*, pas une consigne.

## Impact métier

Cohérence de l'indicateur de présence (WhatsApp-like) sur les trois clients :
un utilisateur qui voit un contact « en ligne » sur iOS et « absent » sur le web
perd confiance dans le signal. Le coût d'une dérive est faible en probabilité
mais élevé en visibilité (indicateur omniprésent).

## Impact technique

Nul sur le runtime : le correctif est un test seul, ajouté au SSOT partagé. Il
lit les seuils là où chaque plateforme les DÉCLARE (littéraux inline Swift
ancrés sur l'état retourné, constantes Kotlin), donc **n'exige aucune
modification des sources iOS/Android** — zéro risque sur les plateformes non
compilables dans cet environnement.

## Évaluation du risque

Minimal. Ajout d'un unique fichier de test dans `packages/shared/__tests__/`.
Aucune source de production touchée. Le test suit à l'identique le motif éprouvé
de `language-normalize-mirror-parity.test.ts` et `password-min-length-parity.test.ts`.

## Amélioration proposée

`packages/shared/__tests__/presence-mirror-parity.test.ts` : extrait les trois
seuils de chaque source (TS par import, Swift par regex ancrée sur l'état
retourné, Kotlin par regex sur la constante nommée), les ramène en secondes et
prouve leur égalité — plus une contre-épreuve ancrant le barème TS sur `1/3/5`
et un test dédié à la garde anti-stale `isOnline` de Swift.

## Bénéfices attendus

- La dérive d'un seul seuil sur un seul des trois clients devient impossible à
  merger en silence : le CI TS/bun rougit.
- Extension homogène du filet « parité des miroirs » posé à l'itération 269 :
  langue (269) + présence (270) partagent le même mécanisme.

## Complexité d'implémentation

Faible. Un fichier, quatre tests, extraction par regex ancrée.

## Critères de validation

- [x] Le test passe sur l'état d'origine (miroirs en phase).
- [x] Le test ROUGIT sur une dérive de seuil injectée dans CHACUN des trois
      miroirs (iOS, Android, TS), puis repasse au vert après revert.
- [x] Suite `packages/shared` complète verte (2633 tests) avec le fichier ajouté.
- [ ] CI vert après push.
