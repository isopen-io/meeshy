# #7392 — Le texte alternatif du fil atteint son lecteur dans sa langue, et en direct

**Issue** : #7392 (ouverte le 2026-09-21 pendant #7383/#7382, jamais travaillée).
**Branche** : `claude/exciting-planck-t1dj8f`.
**Surface** : `apps/web` (le fil, les réels), aucun contrat de fil touché.

## Comment ce lot a été trouvé

Un balayage du contrat Socket.IO : **quel événement SERVEUR aucun client ne
consomme ?** Les trois gardes du dépôt n'interrogent pas cette direction —
forme du nom, « tout nom épelé par un client appartient au contrat », « tout
nom déclaré a un émetteur ». Aucune ne demande *qui l'écoute*.

Dix orphelins sur 167, dont `media:alt-translation-updated` — **jumelle exacte**
(son type le dit) de `media:caption-translation-updated`, qui est câblée sur le
web ET sur iOS. La légende a reçu ses deux lecteurs ; le texte alternatif, zéro.

## Le défaut

| contenu de `PostMedia` | couple de traduction | le fil web |
|---|---|---|
| `caption` | `captionLanguage` / `captionTranslations` | descend le Prisme (`resolveMediaCaption`) |
| `alt` | `altLanguage` / `altTranslations` | **servi BRUT** (`textOrUndefined(m.alt)`) |

Et `FeedMedia` (`lib/api/feed-pages.ts`) ne DÉCLARE ni `altLanguage` ni
`altTranslations` : la carte est jetée au décodage, donc la descente était
impossible en aval. La passerelle les sert pourtant (`postIncludes.ts`).

Le texte alternatif est la seule chaîne qu'un lecteur d'écran PRONONCE. Le
doc-comment de `lib/api/prism.ts` nomme exactement ce défaut comme sa raison
d'exister — « un lecteur d'écran qui prononce un texte français avec une voix
anglaise est ce défaut-là, rendu audible » — et c'est la chaîne qui ne le
traversait pas.

**La jumelle est DANS LE MÊME CLIENT** : la conversation descend déjà le Prisme
sur `alt` par la loi partagée `resolveMediaDescription` (#12333,
`lib/view/media.ts` → `electDescription`). Seul le FIL ne le fait pas.

## Suivi

- La garde manquante — « tout événement serveur déclaré a un consommateur
  client, ou est déclaré non consommé AVEC sa raison » — est une issue à part :
  c'est elle qui aurait fait tomber #6737 à sa naissance.
