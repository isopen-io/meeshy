# Itération 269 — Analyse : le miroir Kotlin de `normalizeLanguageCode` n'avait jamais reçu `LEGACY_ISO_639_1`

## État courant

La réduction d'un identifier de langue hétérogène (BCP-47, ISO 639-2/3, aliases
dépréciés) vers un code supporté par Meeshy vit en **TROIS exemplaires** — un par
client, comme l'exige le Prisme Linguistique (CLAUDE.md, règle 3) :

| plateforme | site | tables |
|---|---|---|
| TypeScript (SSOT) | `packages/shared/utils/language-normalize.ts` → `normalizeLanguageCode` | `ISO_639_3_TO_1` + `LEGACY_ISO_639_1` |
| Swift (iOS/SDK) | `MeeshyUser.normalizeLanguageCode` (`AuthModels.swift`) | `iso639ReductionMap` + `legacyISO6391Map` |
| Kotlin (Android) | `LanguageCodeNormalizer.normalize` (`apps/android/core/model/.../lang/`) | `ISO_639_3_TO_1` **seulement** |

Le SSOT TS porte, depuis l'ajout de la réduction des aliases ISO 639-1
**dépréciés**, une seconde table :

```ts
export const LEGACY_ISO_639_1 = { iw: 'he', in: 'id', ji: 'yi' };
```

`iw`/`in`/`ji` sont les codes RETIRÉS du registre ISO 639-1 pour l'hébreu,
l'indonésien et le yiddish. **La JVM les conserve pour compatibilité
descendante** : `java.util.Locale.getLanguage()` normalise `he→iw`, `id→in`,
`yi→ji`.

## Problèmes identifiés

1. **Le miroir Kotlin n'a JAMAIS reçu `LEGACY_ISO_639_1`.** Sa fonction
   `normalize` traite le cas 3-lettres puis retombe directement sur « code
   2-lettres inconnu → conservé verbatim ». Un `iw` (ni supporté, ni 3-lettres,
   ni dans aucune table de repli côté Android) est donc **rendu `"iw"` tel
   quel**.
2. **`"iw"` ne matche AUCUNE ligne `MessageTranslation`** (clé `he`). Le lecteur
   retombe sur l'original non traduit — **violation directe du Prisme
   Linguistique**, sur la plateforme même dont la JVM ÉMET ces codes.
3. **Le témoin de parité ne couvrait que deux plateformes sur trois.**
   `packages/shared/__tests__/language-normalize-swift-parity.test.ts` prouvait
   l'égalité TS↔Swift des DEUX tables — mais rien ne surveillait TS↔Kotlin.
   C'est précisément ce trou qui a laissé Android dériver : la règle « Any change
   here MUST touch the TS + Swift mirrors » (commentaire Kotlin) ne nommait même
   pas Kotlin comme cible à maintenir, et aucun test ne pouvait tomber.

Mesure (témoin ROUGE prouvé avant correctif) :

| appel | Android AVANT | attendu (parité TS/iOS) |
|---|---|---|
| `normalize("iw")` | `"iw"` (verbatim) | `"he"` |
| `normalize("in")` | `"in"` (verbatim) | `"id"` |
| `normalize("iw-IL")` | `"iw"` | `"he"` |
| `normalize("ji")` | `"ji"` (verbatim) | `null` (`yi` hors catalogue) |

## Causes racines

L'invariant « la table de réduction est identique sur les trois clients » ne
tenait, côté Android, **que par une consigne en commentaire**. Une consigne n'est
pas un témoin (leçon récurrente du dépôt) : l'ajout de `LEGACY_ISO_639_1` au TS +
Swift n'a pas propagé au Kotlin, et rien n'a rougi. C'est la forme, sur une table
mirrorée à trois exemplaires, de la règle du dépôt : *une divergence entre N
implémentations de la même règle se supprime en installant UN témoin qui peut
tomber sur CHAQUE exemplaire* — ici le témoin n'existait que pour deux d'entre eux.

Le paradoxe qui la rend coûteuse : c'est l'**existence** de la JVM (`Locale`
émettant `iw`) qui a MOTIVÉ la création de `LEGACY_ISO_639_1` ; pourtant le
seul client tournant sur la JVM ne l'appliquait pas.

## Impact métier

**Panne réelle, ciblée, silencieuse.** Tout utilisateur Android dont la locale
appareil est l'hébreu ou l'indonésien (rang 4 du Prisme — `deviceLocale`) voyait
son fil rester dans la langue de l'expéditeur là où une traduction `he`/`id`
existait, dès que ses préférences in-app supérieures ne couvraient pas le message.
Aucune erreur, aucun log : juste « pas de traduction » là où il fallait en servir
une. Classe de collision silencieuse identique à `fil→fi` / `swe→sw` que la table
3-lettres ferme déjà — mais pour la locale la plus courante d'un marché entier
(Israël) et d'un autre (Indonésie).

## Impact technique

- Résolution de Prisme divergente entre clients pour un même compte : un
  utilisateur hébréophone voyait la bonne langue sur web/iOS et la mauvaise sur
  Android.
- Le trou vivait dans un utilitaire `core:model` partagé (feed, bulles, aperçus
  de liste, résolution audio) : sa surface est TOUTE résolution de langue Android.

## Évaluation du risque

**Très faible.** Le correctif n'ajoute qu'une branche pour trois codes précis
(`iw`/`in`/`ji`) qui, aujourd'hui, produisent une sortie inutile (un code mort de
traduction). Toute autre entrée (supportée, 3-lettres, 2-lettres inconnue,
invalide) est rendue à l'identique — tous les témoins existants d'Android restent
verts. La cible est re-validée contre le catalogue (`ji→yi` absent ⇒ `null`),
exactement comme TS/iOS, donc jamais de sur-correction.

## Améliorations proposées (implémentées)

1. **Kotlin** — ajouter `LEGACY_ISO_639_1` et l'appliquer dans la branche
   2-lettres, entre le repli 3-lettres et le « conservé verbatim », en miroir
   strict de TS/iOS (cible re-validée contre `LanguageData.supportedCodeSet`).
2. **Témoin cross-plateforme** — renommer `language-normalize-swift-parity.test.ts`
   → `language-normalize-mirror-parity.test.ts` et y ajouter l'extraction du
   fichier **Kotlin** : les DEUX tables (`ISO_639_3_TO_1`, `LEGACY_ISO_639_1`)
   sont désormais prouvées égales TS↔Swift **et** TS↔Kotlin. Le garde tombe au
   ROUGE dès qu'une entrée diverge sur l'un des trois sites.
3. **Docstring Kotlin** — la consigne dit désormais « Any change here MUST touch
   the TS + Swift mirrors » ➜ elle reste, et le témoin la rend EXÉCUTABLE.

## Bénéfices attendus

- Un utilisateur Android sur locale hébraïque/indonésienne reçoit enfin ses
  traductions — parité stricte de Prisme avec web/iOS.
- La table de réduction ne peut plus diverger sur AUCUN des trois clients sans
  qu'un test ne rougisse : le mécanisme même qui a laissé passer cette dérive est
  fermé.

## Complexité d'implémentation

Triviale : une table + une branche en Kotlin (miroir mot-à-mot du TS déjà testé),
deux cas de test Kotlin ajoutés à la suite Android existante, deux `it()` ajoutés
au témoin de parité TS.

## Critères de validation

- [x] Témoin ROUGE prouvé AVANT correctif : le nouveau cas de parité Kotlin
      throw « Kotlin map `LEGACY_ISO_639_1` introuvable » (map retirée →
      1 failed / 3 passed).
- [x] Suite de parité VERTE après correctif : 4/4 (2 Swift + 2 Kotlin).
- [x] Suite `language-normalize.test.ts` + parité : 31/31.
- [x] Tables croisées mesurées identiques TS↔Kotlin (66 entrées `ISO_639_3_TO_1`,
      `{iw:he,in:id,ji:yi}` pour `LEGACY_ISO_639_1`).
- [ ] Gate Android (`:core:model:testDebugUnitTest`) — non exécutable dans le
      conteneur (SDK Android absent) ; couvert par CI. Logique tracée à la main
      sur les 5 cas ajoutés + non-régression `"xx"`.
