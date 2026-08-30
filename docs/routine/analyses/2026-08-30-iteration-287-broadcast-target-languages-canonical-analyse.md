# Itération 287 — analyse : canonicalisation des langues cibles de diffusion admin

## État courant

L'itération 286 a fait passer `PostService.audienceLanguages` par la SSOT
`normalizeLanguageForDedup` avant filtre de pivot et déduplication, et laissait
en suivi : « balayer les autres agrégats de `systemLanguage` alimentant une liste
de cibles de traduction sans canonicalisation ». Le balayage (gateway entier,
`services/gateway/src`) a rendu **un seul** site de cette classe encore non
canonicalisé.

## Problème identifié

`services/gateway/src/routes/admin/broadcasts.ts`, handler `POST /:id/preview`
(lignes 328-340 avant correctif) :

```ts
const recipientsByLanguage = await fastify.prisma.user.groupBy({
  by: ['systemLanguage'], where, _count: true,
});
const targetLanguages = recipientsByLanguage
  .map((g: any) => g.systemLanguage)
  .filter(Boolean) as string[];
const translations = await translationService.translateContent(
  broadcast.subject, broadcast.body, broadcast.sourceLanguage, targetLanguages
);
```

`targetLanguages` est bâti depuis la colonne brute `User.systemLanguage`
(regroupée par Prisma) avec un simple `filter(Boolean)`, puis :
1. envoyé au translator comme cibles NLLB via
   `BroadcastTranslationService.translateContent` → `POST /translate/batch`
   (`target_language: targetLang` verbatim) ;
2. **persisté** comme `AdminBroadcast.targetLanguages` (ligne 348).

## Cause racine

`systemLanguage` est persisté **verbatim** (`z.string().optional()`, aucune
normalisation à l'écriture). Le `groupBy` regroupe sur la valeur BRUTE : il ne
replie donc PAS les variantes. Les codes région-tagués / casse mixte produits par
le web (`Accept-Language`) et iOS (`Locale.current`) — `en-US`, `pt-BR`, `FR`,
`fr_FR` — arrivent intacts et comme buckets DISTINCTS. Le fichier n'importait
aucun canonicaliseur.

## Impact métier

- Un francophone `fr`, un `fr-FR` et un `FR` déclenchent **trois traductions NLLB
  identiques** et **trois clés** persistées pour une même langue réelle.
- `en-US` (variante de la langue source `en`) **échappe au filtre**
  `l !== sourceLanguage` du service et part comme cible que NLLB ne reconnaît pas
  (échec ou sortie dégradée pour cette variante).
- `AdminBroadcast.targetLanguages` persiste les variantes au lieu des langues
  réelles.

Atténuation existante à la LECTURE : `localizedBroadcastText` →
`resolvePrismTranslation` canonicalise les clés de la carte au moment du rendu, si
bien qu'une clé `en-US` matche quand même le lecteur `en`. Le défaut est donc au
temps de TRADUCTION (coût, cibles invalides, données persistées sales), pas au
rendu — mais il reste un bug de performance/complétude, pas une simple dette.

## Impact technique

Coût CPU/réseau translator multiplié par le nombre de variantes dans l'audience ;
appels NLLB sur cibles invalides ; ligne `AdminBroadcast` portant des cibles
non canoniques. Aucune régression de sécurité ni de schéma.

## Évaluation du risque

Faible. Fonction PURE, idempotente sur les codes déjà canoniques. La
canonicalisation ne fait que RESSERRER l'ensemble sortant. Le service filtrait
déjà la langue source ; le helper la retire désormais sur la valeur CANONIQUE, ce
qui rend ce filtre du service redondant (et non contradictoire). Le rendu était
déjà robuste (`resolvePrismTranslation` canonicalise), donc aucun message déjà
diffusé ne change de résolution.

## Améliorations proposées (livrées)

Helper pur `routes/admin/broadcast-target-languages.ts` :
`broadcastTargetLanguages(recipientLanguages, sourceLanguage)` — canonicalise
chaque code via `normalizeLanguageForDedup`, écarte la langue source
canonicalisée, déduplique en préservant l'ordre de première apparition. Aucun cap
(une diffusion traduit vers toutes les langues réellement lues par son audience).
Câblé dans `POST /:id/preview`.

## Bénéfices attendus

Une cible NLLB par langue réelle ; plus aucune variante ni langue source dans les
cibles ; `targetLanguages` persisté canonique ; charge translator réduite au strict.

## Complexité d'implémentation

Triviale : un fichier pur (~15 lignes utiles) + 3 lignes de câblage + 8 pins.

## Critères de validation

- `broadcast-target-languages.test.ts` : 8/8 verts (dedup, canonicalisation
  région/casse, retrait source brut/tagué, audience vide).
- `admin-broadcasts-list-select.test.ts` intacte.
- 34 suites `__tests__/unit/routes/admin` : 1135/1135 verts.
- `route-manifest-ratchet` : 4/4 (aucune route ajoutée — helper pur).
- `tsc --noEmit` gateway : 0 erreur.
