# Itération 288 — `isSameLanguage` devient une SSOT partagée ; `MessageActionsBar` cesse de comparer les langues au `===` brut

Issue : #5167. Suite de la campagne « une source de vérité par règle de langue »
(cycles 118→287). Les itérations précédentes ont fait descendre la
canonicalisation `normalizeLanguageForDedup` dans les résolveurs SERVEUR
(aperçu de liste, bannière, recipient-language, `audienceLanguages`, filtres
`?languages=`, dispatch ZMQ). Ce lot corrige la face CLIENT du même principe :
l'ÉGALITÉ de langue, dupliquée cinq fois et absente du seul endroit où elle
manquait — la barre d'actions d'un message.

## État actuel (avant ce lot)

`apps/web/components/common/bubble-message/MessageActionsBar.tsx` compare des
codes de langue **verbatim** avec `===` en 7 sites :

```ts
const targetLang = currentDisplayLanguage === originalLanguage        // L109
  ? userLanguage : originalLanguage;
// ...
currentDisplayLanguage === originalLanguage                           // L176 (surbrillance)
  ? "bg-gray-100 ..." : "text-gray-500 ...";
aria-label={currentDisplayLanguage === originalLanguage ? ...}        // L180
<p>{currentDisplayLanguage === originalLanguage ? ...}</p>            // L186 (tooltip)
currentDisplayLanguage === originalLanguage                           // L237 (ligne menu)
{currentDisplayLanguage === originalLanguage && <CheckCircle2 />}     // L249 (coche)
const isCurrentlyDisplayed = currentDisplayLanguage === version.language; // L264
```

Ses fichiers frères produisent et consomment le MÊME état
(`currentDisplayLanguage`, `originalLanguage`, clés de traduction) via une
égalité **canonicalisée** dont le doc-comment nomme exactement ce cas :

```ts
// use-message-display.ts:20, messages-display.tsx:36 (copies identiques)
const sameLanguage = (a?: string, b?: string): boolean =>
  !!a && !!b && normalizeLanguageForDedup(a) === normalizeLanguageForDedup(b);
```

## Problème identifié

`originalLanguage` et `currentDisplayLanguage` sont **verbatim** : les messages
écrits avant la canonicalisation à l'écriture portent un `originalLanguage`
région-tagué (`'en-US'`, `'pt-BR'`), casse-mixte (`'FR'`) ou legacy (`'iw'`).
La barre d'actions les compare brutalement.

Scénario mesuré (témoin RED) : lecteur rang-1 `'en'`, message `originalLanguage`
= `'en-US'`. Le lecteur tape le drapeau ⇒ `handleFlagToggle` pose
`currentDisplayLanguage = 'en'`.

1. `displayContent` (via `sameLanguage('en','en-US')` = true, fichier frère)
   affiche correctement le texte original anglais.
2. `MessageActionsBar` évalue `'en' === 'en-US'` = **false** ⇒ le drapeau
   affiche le libellé « voir l'original » **alors que l'original est à l'écran**,
   sans surbrillance.
3. Retaper calcule `targetLang = originalLanguage = 'en-US'` (car `'en' === 'en-US'`
   est faux) ⇒ le toggle rebondit entre `'en'` et `'en-US'`, même texte, et ne
   se marque JAMAIS « original ».
4. La ligne « original » du menu (`version.language === 'en-US'`) ne reçoit
   jamais la coche « actuellement affiché » tant que `currentDisplayLanguage`
   vaut `'en'`.

## Cause racine

Absence de source unique pour l'égalité de langue conforme au Prisme. **Cinq**
copies locales BYTE-IDENTIQUES de `sameLanguage` coexistent dans `apps/web`
(`use-message-display.ts`, `messages-display.tsx`,
`components/v2/TranslationToggle.tsx`, `hooks/use-stream-translation.ts`, et une
variante à arguments non-optionnels dans `components/v2/CanvasV3Scene.tsx`), et
`MessageActionsBar` n'en portait aucune. Une règle recopiée à chaque site finit
par manquer à un site — c'est exactement le mécanisme des « jumelles
divergentes » que le `CLAUDE.md` racine punit.

## Impact métier

Un contrôle de traduction qui MENT sur son état : le drapeau annonce une action
qu'il n'exécute pas, et paraît mort (loi web « un contrôle existe s'il a un
effet »). L'utilisateur ne peut pas distinguer de façon fiable original et
traduction sur tout message hérité région-tagué. Dégrade les dimensions 4
(Fluidité — image/geste sans effet), 6 (Cohérence), 8 (UX), 11 (Maintenabilité).

## Impact technique

Surface : une fonction pure ajoutée à la SSOT existante, 7 comparaisons routées,
5 copies supprimées. Aucun schéma, aucune frontière réseau, aucun type public
modifié. Les cinq copies étant sémantiquement identiques (4 exactes, 1
compatible), la consolidation ne peut que CONVERGER.

## Évaluation du risque

Très faible. `isSameLanguage` a la sémantique exacte des copies remplacées
(`!!a && !!b && normalizeLanguageForDedup(a) === normalizeLanguageForDedup(b)`).
La variante `CanvasV3Scene` (arguments non-optionnels, sans garde de vacuité)
n'est appelée qu'avec des chaînes garanties ; la garde ajoutée renvoie `false`
pour une entrée vide — plus sûr, jamais moins.

## Améliorations proposées (implémentées)

- `isSameLanguage(a?, b?)` exporté depuis
  `packages/shared/utils/language-normalize.ts`, adossé à
  `normalizeLanguageForDedup` — SSOT unique de l'égalité de langue conforme au
  Prisme.
- `MessageActionsBar.tsx` : les 7 comparaisons passent par `isSameLanguage`.
- Les 5 copies locales de `sameLanguage` sont supprimées et importent la SSOT.
- Témoins ajoutés dans `language-normalize.test.ts` : couple `'en'`/`'en-US'`,
  variantes régionales, alias legacy `'he'`/`'iw'`, casse mixte, langues
  distinctes, entrées vides/nulles.

## Critères de validation

- RED prouvé : les nouveaux témoins échouent tant que `isSameLanguage` n'existe
  pas (import indéfini).
- GREEN : suite `language-normalize` verte, suites frères jest web
  (`use-message-display`), `tsc --noEmit` du web EXIT=0.
- Aucune copie locale de `sameLanguage` ne subsiste (`grep`).
