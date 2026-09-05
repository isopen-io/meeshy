# Itération 288 — les langues cibles d'une diffusion admin sont canonicalisées avant l'envoi au translator

Suite de la campagne « une source de vérité par règle de langue » (cycles 118→287,
Prisme + `recipient-language.ts` + `normalizeLanguageForDedup`). Iteration 287 a
canonicalisé `PostService.audienceLanguages`, alimenté par les `systemLanguage`
verbatim des contacts. En balayant les DERNIERS résolveurs serveur alimentés
DIRECTEMENT par un champ de langue persisté sans normalisation, un site vif
subsistait : le calcul des langues cibles d'une **diffusion admin**.

## État actuel (avant ce lot)

`services/gateway/src/routes/admin/broadcasts.ts`, handler
`POST /admin/broadcasts/:id/translate` :

```ts
const recipientsByLanguage = await fastify.prisma.user.groupBy({
  by: ['systemLanguage'], where, _count: true,
});
// Get unique target languages from recipients
const targetLanguages = recipientsByLanguage
  .map((g: any) => g.systemLanguage)
  .filter(Boolean) as string[];

const translations = await translationService.translateContent(
  broadcast.subject, broadcast.body, broadcast.sourceLanguage, targetLanguages);
```

`translateContent` STOCKE chaque traduction sous la clé du code reçu
(`subjects[targetLang] = ...`, `broadcast-translation.service.ts:76`).

La LIVRAISON, elle, résout le prisme du lecteur en codes CANONIQUES :
`localizedBroadcastText` → `recipientLanguages(user)` → `resolveUserLanguagesOrdered`
(`broadcast-recipients.ts`, `recipient-language.ts`).

## Problème identifié

`systemLanguage` est **persisté verbatim** (`z.string().optional()`, aucune
normalisation à l'écriture — cf. `normalizeInAppLanguage`). Le `groupBy` produit
donc un groupe par VARIANTE brute : `'fr'`, `'fr-FR'`, `'FR'`, `'en-US'`, `'iw'`
(hébreu Android). Trois conséquences, toutes mesurées par témoin RED :

1. **La traduction est stockée sous une clé introuvable à la livraison.** Un
   membre déclaré `'fr-FR'` fait calculer et ranger la traduction sous
   `translated['fr-FR']` ; à la livraison son prisme est résolu en `'fr'`
   (canonique). `resolvePrismTranslation({translations:{'fr-FR':…}}, prefs:['fr']})`
   ne matche pas ⇒ retour `null` ⇒ **l'original (langue source) est servi** alors
   qu'une traduction française existe. Violation directe du Prisme (règle #1).

2. **Les variantes régionales dédupliquent comme des langues DISTINCTES.** `'fr'`,
   `'fr-FR'` et `'FR'` comptent pour **trois** jobs de traduction au lieu d'un —
   gaspillage du poste ML le plus cher.

3. **Cibles non canoniques envoyées au translator.** `'pt-BR'`, `'en-US'` ne sont
   pas des cibles NLLB valides ; le translator échoue ou produit du bruit.

En prime, le cast `(g: any)` viole la règle « No `any` types — ever » du
`CLAUDE.md` (le résultat d'un `groupBy` Prisme type déjà `systemLanguage: string | null`).

## Cause racine

Le résolveur n'appelait pas la SSOT de canonicalisation-avec-dedup
`normalizeLanguageForDedup` (`packages/shared/utils/language-normalize.ts`) —
exactement le défaut d'iteration 287, sur un autre pipeline. Le reste du
répertoire (aperçu, bannière, recipient-language, `audienceLanguages`,
`anonymous.ts`) passe déjà par cette SSOT ; ce site en divergeait en silence.

## Impact métier

Un membre d'audience dont la locale a été persistée région-taguée (cas nominal
web/iOS) reçoit la diffusion admin dans la langue SOURCE au lieu de la sienne,
alors même que le calcul (coûteux) de sa traduction a été effectué puis rangé
sous une clé morte. Dimensions 1 (Sécurité/complétude du Prisme), 2 (Performance)
et 13 (Complétude) du `CLAUDE.md`.

## Impact technique

Surface minimale : une fonction pure ajoutée au module des helpers PURS de
diffusion (`broadcast-recipients.ts`), un appel substitué dans le handler, un
cast `any` supprimé. Aucun schéma, aucune requête, aucune frontière réseau
modifiée. Les traductions stockées deviennent canoniques → elles matchent la
descente de livraison déjà canonique.

## Évaluation du risque

Très faible. `normalizeLanguageForDedup` est déjà consommée par une dizaine de
sites du gateway et rend un code canonique déterministe. La détection ne peut que
CONVERGER (des variantes s'effondrent sur leur langue) — jamais introduire une
cible que l'ancien code n'aurait pas produite pour une langue réelle. L'exclusion
de la source devient robuste (comparaison canonique des deux côtés).

## Améliorations proposées (implémentées)

- Nouvelle fonction pure `broadcastTargetLanguages(rawLanguages, sourceLanguage)`
  (`broadcast-recipients.ts`) : canonicalise chaque code via
  `normalizeLanguageForDedup`, exclut la source (canonicalisée), déduplique, et
  préserve l'ordre de première apparition.
- Le handler `broadcasts.ts` l'appelle à la place du `map/filter` verbatim ; le
  cast `(g: any)` disparaît (`g.systemLanguage` est typé par Prisma).
- Six témoins (`broadcast-target-languages.test.ts`) : dédup des variantes en une
  cible, émission de codes canoniques, exclusion de la source région-taguée des
  deux côtés, rejet des vides, normalisation legacy (`iw → he`), ordre stable.

## Critères de validation

- RED prouvé : la suite échoue sans l'implémentation (import manquant), mesuré par
  `git stash` des deux fichiers d'implémentation.
- GREEN : 6/6 nouveaux témoins ; 203/203 sur les 26 suites `broadcast`.
- `tsc --noEmit` du gateway : EXIT=0 (le cast `any` retiré typecheck).

## Suivi

- `broadcast-translation.service.ts` filtre encore `l !== sourceLanguage` sur des
  codes bruts en interne — désormais inoffensif (les cibles reçues sont déjà
  canoniques et excluent la source), mais un futur appelant direct du service
  bénéficierait d'une canonicalisation à SON propre bord. Non fait ici pour garder
  la surface minimale ; à ouvrir en issue si un second appelant apparaît.
