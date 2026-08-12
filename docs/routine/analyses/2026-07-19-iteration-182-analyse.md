# Iteration 182 — `normalizeLanguageCode` : troncature aveugle 639-3→639-1 mappe Filipino sur Finnois (collision de préfixe)

## Protocole (démarrage)
`main` @ `e7b3f22` (derniers merges : #2065/#2063/#2061/#2058/#2055 android/status,
#2057 gateway/device-locale bounded cache = itér. 181). Branche
`claude/brave-archimedes-ejush8` sur `origin/main`. Ce cycle prend **182**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (gateway/shared). Les PR iOS ouvertes (#2033→#2064) et la PR gateway
#2060 (`generateConversationIdentifier`, dans `conversation-helpers.ts`) sont
pilotées par d'autres sessions et hors périmètre — `conversation-helpers.ts` est
évité pour ne pas créer de conflit. Point de départ : **revue Priorité 1**
(fonctionnalités récentes) sur la surface shared TS — le `deviceLocale` (Prisme
étendu 2026-05-26) alimente `normalizeLanguageCode`, la SSOT de canonisation de
langue, qui est l'ajout le plus récent et le plus directement testable.

## Current state
`packages/shared/utils/language-normalize.ts` → `normalizeLanguageCode()` canonise
tout identifier de langue (locale appareil iOS `fil_PH`, `Accept-Language` web,
prefs in-app) vers un code Meeshy supporté. Un code 3-lettres **sans entrée
Meeshy directe** était réduit par **troncature aveugle** au préfixe 2-lettres,
retourné si ce préfixe était lui-même supporté :

```ts
if (primary.length > 2) {
  const twoLetter = primary.slice(0, 2);          // 'fil' → 'fi'
  return SUPPORTED_CODES.has(twoLetter) ? twoLetter : undefined;
}
```

Cette heuristique suppose : « si le préfixe 2-lettres est une langue supportée,
la réduction est correcte ». Vrai pour `eng`→`en`, `fra`→`fr`. **Faux** dès que
les deux premières lettres d'un code 639-2/639-3 forment PAR HASARD une **autre**
langue supportée.

## Problems identified
1. **Filipino mappé sur Finnois (violation du Prisme).** `normalizeLanguageCode('fil')`
   → `'fi'` (Finnois). `fil` est le code canonique CLDR/Apple du Filipino
   (`Locale.current.identifier = "fil_PH"`) ; il n'a **aucune** entrée Meeshy et
   **aucun** équivalent ISO 639-1. Flux réel : iOS envoie `X-Device-Locale: fil-PH`
   → `deviceLocaleMiddleware` normalise en `'fi'` → persiste `User.deviceLocale = 'fi'`
   → le resolver Prisme 4e priorité sert des **traductions finnoises** à un
   utilisateur philippin. Attendu correct : `undefined` (afficher l'original).
2. **Suédois mappé sur Swahili.** `normalizeLanguageCode('swe')` (639-2/T du
   Suédois) → `'sw'` (Swahili) au lieu de `'sv'` (Suédois, supporté). Doublement
   faux : le code EST réductible, mais vers la mauvaise langue.
3. **Réductions légitimes rejetées à tort.** `normalizeLanguageCode('spa')` (Espagnol)
   → `undefined` alors que `es` est supporté — le préfixe `sp` n'étant pas
   supporté, la troncature échouait au lieu de réduire correctement vers `es`.

## Root cause
La troncature `slice(0, 2)` traite le **préfixe orthographique** comme s'il était
l'équivalent 639-1 canonique. Or la relation 639-2/639-3 → 639-1 n'est **pas**
préfixielle : `spa`→`es`, `deu`→`de`, `zho`→`zh`, `swe`→`sv`, et `fil`/`tgl` n'ont
pas d'équivalent 639-1 du tout. Le seul garde-fou existant (`spa`→`sp` non
supporté → rejet) fonctionnait par accident et ne couvrait pas les collisions où
le préfixe EST supporté.

## Business / Technical impact
- **UX / traduction (Prisme)** : un utilisateur dont la locale appareil est
  Filipino (ou tout code à collision de préfixe) reçoit silencieusement des
  traductions dans une langue sans rapport, exactement le mode d'échec que le
  Prisme interdit. Aucune erreur, aucun log — dérive invisible.
- **Cohérence cross-platform** : le bug était **identique** dans le miroir Swift
  `MeeshyUser.normalizeLanguageCode` (SDK) → même corruption côté iOS natif.
- **Correctness** : les codes déjà canoniques (`fr`, `en`, `eng`, `fra`, `bas`…)
  restent strictement inchangés.

## Risk assessment
Très faible. Signature et type de retour inchangés (`string | undefined`).
La table de réduction est dérivée de l'ensemble supporté (61 langues) et chaque
cible est **re-validée** contre `SUPPORTED_CODES` avant retour — une langue
retirée de `languages.ts` retombe automatiquement sur `undefined`. Changements de
comportement, tous des **corrections** : `fil`→`undefined` (était `fi`),
`swe`→`sv` (était `sw`), `spa`→`es` (était `undefined`). Aucun test existant ne
dépendait des valeurs corrompues (vérifié : 0 référence à `spa`/`swe`/`fil` hors
`language-normalize.test.ts`). 1367 tests shared restent verts.

## Proposed improvements / Correctif (TDD)
- **RED** : +3 tests (`language-normalize.test.ts`) — réduction via map explicite
  (`spa`→`es`, `deu`/`ger`→`de`, `zho`/`chi`→`zh`), collision de préfixe
  (`swe`→`sv`, `swa`→`sw`), rejet Filipino (`fil`/`fil-PH`/`tgl`→`undefined`). Le
  test « rejette 639-3 inconnu » utilise désormais `xyz`/`enx` (le cas `spa` étant
  devenu une réduction valide).
- **GREEN** :
  1. `ISO_639_3_TO_1` : table EXPLICITE 639-2/639-3 → 639-1 couvrant les 61 langues
     supportées, variantes /T (terminologie) ET /B (bibliographique) incluses.
  2. Branche de réduction : `const reduced = ISO_639_3_TO_1[primary]; return reduced
     && SUPPORTED_CODES.has(reduced) ? reduced : undefined;` — plus aucune troncature.
  3. Miroir Swift `MeeshyUser.normalizeLanguageCode` : `iso639ReductionMap` statique
     identique + même garde. Le 3e site (`ConversationLanguagePreferences.normalize`,
     app iOS) délègue déjà au SDK → corrigé transitivement.

## Expected benefits
- Zéro collision de préfixe : toute locale (dont Filipino) résout vers la bonne
  langue supportée OU vers l'original (`undefined`), jamais vers une langue sans
  rapport.
- Réductions 639-2/639-3 légitimes désormais correctes (`spa`→`es`, `deu`→`de`…).
- Parité cross-platform TS ↔ Swift restaurée sur la SSOT de normalisation.

## Implementation complexity
Faible — 1 table + 1 garde à 2 conditions dans un fichier déjà couvert par tests,
mécaniquement mirroré en Swift.

## Validation criteria
- `packages/shared` : `language-normalize.test.ts` **19/19** verts (nouveaux cas
  collision/réduction) ; suite complète **1367/1367** verts.
- `tsc --noEmit` + `tsc build` : **0 erreur**, dist émis.
- Swift : non compilable dans cet environnement (pas de toolchain) — changement
  mécanique, garde `supportedCodeSet.contains(reduced)` préserve le comportement
  pour les cibles absentes du catalogue Swift (`ny`/`om`/`ti`, divergence de
  catalogue pré-existante hors périmètre).

## Backlog (candidats consignés pour une itération future)
- **Divergence de catalogue TS↔Swift** : `languages.ts` (TS) inclut `ny`/`om`/`ti`
  absents de `LanguageData.allLanguages` (Swift). Pré-existant, sans lien avec ce
  correctif ; à traiter dans une itération dédiée (aligner les deux catalogues).
- `MeeshySocketIOManager.ts:752` — ordre de résolution différent
  (`username ?? displayName ?? …`, sémantique « présence key ») : hors périmètre,
  à ne PAS uniformiser sans analyse dédiée.
- F69 (`sanitizeFileName` overlong sans extension) : latent, 0 appelant.
- `CommonSchemas.pagination` (shared) : transform `offset` sans cap `maxOffset`
  contrairement au util gateway qu'il prétend mirrorer — mais schéma **inutilisé**
  en prod (code mort), non prioritaire.
