# Itération 274 — Un témoin de parité pour la COULEUR de présence (4 miroirs)

## État actuel

La règle produit « présence 1/3/5 » a DEUX moitiés :

1. **Le barème temporel** — quel ÉTAT (`online` / `away` / `idle` / `offline`)
   dériver du temps écoulé depuis la dernière activité. Gardé depuis
   l'itération 270 par `presence-mirror-parity.test.ts` (TS / Swift / Kotlin).
2. **La palette** — quelle COULEUR rendre pour cet état. **Non gardée.**

La couleur vit en quatre exemplaires, un par client, tous censés rendre la même
teinte pour un même état :

| plateforme | valeurs de couleur | mapping état → couleur |
|---|---|---|
| TypeScript (SSOT) | `PRESENCE_HEX` (`packages/shared/utils/user-presence.ts`) | `PRESENCE_TONE` (même fichier) |
| Swift (iOS/SDK) | `MeeshyColors.success/.warning/.neutral400` (`MeeshyUI/Theme/MeeshyColors.swift`) | `PresenceState.dotColor` (`MeeshyUI/Theme/PresenceStyle.swift`) |
| Kotlin (Android) | `MeeshyPalette.Success/.Warning/.Neutral400` (`sdk-ui/.../theme/MeeshyPalette.kt`) | `meeshyPresenceDotColor` (`sdk-ui/.../component/MeeshyAvatar.kt`) |
| Web | classes Tailwind (`PRESENCE_DOT_CLASS`, `apps/web/lib/user-status.ts`) | même map, indexée par état |

Valeurs de référence : `online` → vert `#34D399`, `away` → orange `#FBBF24`,
`idle` → gris `#9CA3AF`. `offline` ne rend AUCUN point sur les quatre clients
(iOS `showsIndicator == false`, Android renvoie `null`, web saute le dot) — le
gris `muted` ne sert qu'aux contextes LABELLISÉS (« Hors ligne », « vu il y a X »).

## Problèmes identifiés

L'invariant « même couleur, quatre miroirs » ne tient que par des **consignes en
commentaire** — « Ne JAMAIS redéclarer ces couleurs localement », « miroir web
`PRESENCE_DOT_CLASS` et Android `meeshyPresenceDotColor` ». C'est exactement le
trou « N miroirs, zéro témoin de parité » (leçons 291/292) que l'itération 270
a fermé pour le barème temporel et a **explicitement laissé ouvert pour la
couleur** (§ « Améliorations futures » de son plan).

## Causes racines

Une valeur DUPLIQUÉE sans témoin dérive en silence : rien ne relie
`MeeshyColors.success` à `PRESENCE_HEX.success` ni `PRESENCE_DOT_CLASS.online`
à l'un des deux. Deux dérives possibles, toutes deux invisibles en CI :

- **Dérive de teinte** — un `#34D399` retouché sur un seul site (ou une classe
  web `emerald-400` → `emerald-500`).
- **Dérive de câblage** — un état recâblé sur le mauvais ton (`idle` rendu en
  orange, `online` en gris) dans un `switch`/`when`/map.

## Impact métier

Le point de présence est vu CÔTE À CÔTE : une liste de conversations affiche la
même personne sur web et mobile, une fiche de profil idem. Une divergence de
teinte ou de câblage se voit immédiatement et lit comme un bug de rendu.

## Impact technique

Aucun. Test seul, aucune ligne de production touchée.

## Évaluation du risque

- Correctif : **NUL** — un fichier de test ajouté, zéro production.
- Témoin : **FAIBLE** — test vitest pur lisant les sources des quatre
  plateformes comme texte (littéraux `Color(hex:)` Swift, `Color(0xFF…)` Kotlin,
  classes Tailwind web). N'exige AUCUNE modification iOS/Android/web ni leurs
  toolchains (indisponibles dans ce conteneur).

## Améliorations proposées

Ajouter `packages/shared/__tests__/presence-color-mirror-parity.test.ts`,
jumeau du témoin de barème temporel, qui vérifie :

1. **Contre-épreuve** — `PRESENCE_HEX` TS EST bien la palette produit
   `{success:#34D399, warning:#FBBF24, muted:#9CA3AF}` (sinon une extraction
   native cassée « passerait » contre un TS faux).
2. **Valeurs** — `MeeshyColors` (iOS) et `MeeshyPalette` (Android) déclarent
   exactement ces trois hex.
3. **Câblage** — `PresenceState.dotColor` (iOS), `meeshyPresenceDotColor`
   (Android) et `PRESENCE_DOT_CLASS` (web) mappent `online`→success,
   `away`→warning, `idle`→muted (les trois états qui rendent un point coloré).

## Bénéfices attendus

- Trou de parité fermé : 4 miroirs sur 4 rejouent désormais le contrat couleur.
- Une future dérive (teinte retouchée, nuance web changée, état recâblé) fait
  rougir la CI sur `packages/shared`, quel que soit le seul site fautif.

## Complexité d'implémentation

Faible. ~1 fichier de test, six extracteurs regex ancrés sur la FORME de chaque
déclaration (message d'erreur explicite si la forme change).

## Critères de validation

- Les 12 cas passent au VERT sur l'état d'origine.
- Contre-épreuves (prouvées) rougissent : teinte iOS `34D399`→`34D398`,
  teinte Android idem, web `emerald-400`→`emerald-500`, câblage iOS
  `online`→warning, câblage Android `IDLE`→Success.
- Suite `packages/shared` complète verte (111 fichiers / 2662 tests).
