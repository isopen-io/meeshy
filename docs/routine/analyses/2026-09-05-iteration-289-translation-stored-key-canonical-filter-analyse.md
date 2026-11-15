# Itération 289 — le filtre bande-passante des traductions canonicalise la CLÉ STOCKÉE, pas seulement le code demandé

Issue : #5234 (moitié symétrique de #5108). Suite de la campagne « une source de
vérité par règle de langue » (cycles 118→288). L'itération 288 a extrait
`isSameLanguage` en SSOT côté client ; ce lot ferme la face SERVEUR d'un filtre
de langue resté verbatim d'un seul côté.

## État actuel (avant ce lot)

Trois filtres de bande passante restreignent les traductions servies aux langues
demandées par le lecteur (opt-in `?languages=` REST, groupes socket). Ils
comparaient les clés de traduction **verbatim** (`.toLowerCase()`) :

- `transformTranslationsToArray` (`services/gateway/src/utils/translation-transformer.ts:49,53`)
  — traductions texte REST : `new Set(options.languages.map(l => l.toLowerCase()))`,
  puis `langFilter.has(lang.toLowerCase())`.
- `cleanAttachmentsForApi` (`services/gateway/src/routes/conversations/messages-list-query.ts:58,124`)
  — pistes audio du Prisme REST : même motif.
- `filterMessagePayloadForLanguages` (`services/gateway/src/socketio/utils/message-payload-filter.ts:27,36,48`)
  — filtre socket texte + audio : `langSet.has(targetLanguage.toLowerCase())`.

#5108 avait canonicalisé le côté **DEMANDÉ** (`parseLanguageFilterParam` →
`normalizeLanguageForDedup`), si bien que `?languages=pt-BR` filtre bien sur
`'pt'`. Restait le côté **STOCKÉ**.

## Problème identifié

Un document **legacy** porte parfois une clé de traduction RÉGIONALE (`'pt-BR'`,
`'zh-Hant-HK'`). Preuve dans le dépôt : `MessageTranslationService.ts:3157` lit
déjà `translations[targetLanguage] ?? translations[normalizedTarget]`
précisément parce que ces clés existent en base (« un document legacy portant
RÉELLEMENT une clé régionale reste servi tel quel »).

Scénario RED mesuré : `translations = { 'pt-BR': {...}, 'es': {...} }`, lecteur
dont le Prisme demande le canonique `'pt'`. Le filtre calcule
`'pt-br'.toLowerCase()` ∉ `{'pt'}` ⇒ la traduction `'pt-BR'` est **PRUNÉE** ⇒ le
lecteur retombe sur l'original alors que sa traduction existe. Violation directe
du Prisme (§ Cohérence, règle 2 — la locale appareil rang 4 diffère de la langue
applicative).

## Cause racine

Absence de source unique pour le prédicat « cette clé stockée matche-t-elle une
langue demandée ». Chaque filtre réécrivait la comparaison au `.toLowerCase()`,
canonicalisant zéro ou un seul des deux côtés. Une règle recopiée à chaque site
finit par manquer à un côté — mécanisme des « jumelles divergentes ».

## Impact métier

Un lecteur sur données héritées ne reçoit PAS la traduction qui existe pour sa
langue : friction linguistique, contraire au Prisme. Silencieux (aucune erreur,
juste l'original servi). Dégrade les dimensions 6 (Cohérence), 8 (UX/Prisme), 13
(Complétude).

## Impact technique

Surface : une fonction pure ajoutée à la SSOT existante
(`packages/shared/utils/language-normalize.ts`), 3 filtres routés, 3
constructions de `Set` verbatim supprimées. Aucun schéma, aucune frontière
réseau, aucun type public modifié.

## Évaluation du risque

Très faible. Pour des inputs déjà canoniques (le cas nominal — les écrivains
stockent canonique depuis #5108 côté ZMQ), `makeLanguageFilter` rend le même
verdict que l'ancien `.toLowerCase()` (idempotence de `normalizeLanguageForDedup`
sur un code 2-lettres). Le comportement ne change QUE pour une clé non-canonique,
qu'il rattrape au lieu de pruner — jamais moins permissif, toujours plus proche
du Prisme. L'empty-check (`languages` vide ⇒ payload inchangé) est préservé
(`makeLanguageFilter` rend `null`).

## Améliorations proposées (implémentées)

- `makeLanguageFilter(requested)` exporté depuis
  `packages/shared/utils/language-normalize.ts` : rend un prédicat qui
  canonicalise les DEUX côtés via `normalizeLanguageForDedup`, ou `null` quand la
  liste est absente/vide (« servir toutes les langues »).
- Les trois filtres routés par cette SSOT ; plus aucune construction de `Set`
  verbatim ni `.has(lang.toLowerCase())` de matching de langue dans ces sites.
- Témoins ajoutés : `makeLanguageFilter` dans `language-normalize.test.ts`
  (clé régionale ↔ demande canonique, alias legacy, ISO 639-3, casse, vide) ;
  clé stockée régionale servie dans `translation-transformer.test.ts` et
  `message-payload-filter.test.ts`.

## Critères de validation

- RED prouvé : les 6 témoins `makeLanguageFilter` échouent tant que la fonction
  n'existe pas ; les deux témoins de filtre échouent tant que la clé régionale
  est comparée verbatim.
- GREEN : vitest shared 2890/2890 · jest gateway (translation-transformer ×2,
  message-payload-filter, messages-list-language-filter-canonicalization,
  MessageHandler, message-new-producer-parity, contrats) verts · `tsc --noEmit`
  gateway ET shared EXIT=0.
- Aucun `.toLowerCase()` de matching de langue-set ne subsiste dans les trois
  filtres (`grep`).
