# Itération 287 — `BroadcastTranslationService.translateContent` canonicalise et déduplique ses langues cibles avant d'appeler NLLB

Suite directe du suivi de l'itération 286 (« Balayer les autres agrégats de
`systemLanguage` verbatim non canonicalisés … les agrégats de TARGETS de
traduction sont l'autre famille »). Le second agrégat de cibles de traduction du
gateway — la génération des traductions d'une **diffusion admin** — recevait des
codes `systemLanguage` **verbatim**, jamais canonicalisés.

## État actuel (avant ce lot)

`routes/admin/broadcasts.ts` (route `POST …/generate`, passage en `READY`)
calcule ses langues cibles ainsi :

```ts
const recipientsByLanguage = await fastify.prisma.user.groupBy({
  by: ['systemLanguage'], where, _count: true,
});
const targetLanguages = recipientsByLanguage
  .map((g: any) => g.systemLanguage)
  .filter(Boolean) as string[];
const translations = await translationService.translateContent(
  broadcast.subject, broadcast.body, broadcast.sourceLanguage, targetLanguages,
);
```

et `BroadcastTranslationService.translateContent` filtrait la source par simple
égalité, puis émettait un travail NLLB par cible :

```ts
const langsToTranslate = targetLanguages.filter(l => l !== sourceLanguage);
```

## Problème identifié

`systemLanguage` est **persisté verbatim** (`z.string().optional()`, aucune
normalisation à l'écriture — cf. `normalizeInAppLanguage`,
`packages/shared/utils/conversation-helpers.ts`). Les valeurs BCP-47
région-taguées ou en casse mixte produites par le web (`Accept-Language`) et iOS
(`Locale.current.identifier`) — `'en-US'`, `'pt-BR'`, `'FR'`, `'fr_FR'` —
atteignent donc `translateContent` intactes. Trois conséquences mesurées, mêmes
que l'itération 286 :

1. **Cibles invalides envoyées au translator.** `'pt-BR'` / `'en-US'` sont
   poussées telles quelles comme `target_language` à `/translate/batch`. NLLB ne
   connaît que les codes canoniques 2-lettres ; la requête échoue et le
   destinataire `'pt'` n'obtient AUCUNE traduction (l'entrée `pt` n'est jamais
   écrite dans `translatedSubjects`/`translatedBodies`) et retombe sur la langue
   source — violation indirecte du Prisme (dimension Complétude).
2. **Les variantes dédupliquent comme des langues DISTINCTES.** `groupBy` rend un
   bucket par valeur brute : `'fr'`, `'fr-FR'`, `'FR'` produisent **trois**
   travaux de traduction pour la même langue — CPU/mémoire GPU gaspillés
   (dimension Performance).
3. **Le filtre d'auto-exclusion de la source échoue sur la forme.** `l !==
   sourceLanguage` compare des chaînes brutes : une source `'en'` face à une
   cible `'en-US'` (ou une source `'pt-BR'` face à `'pt'`) ne s'exclut pas — la
   diffusion tente de se re-traduire vers sa propre langue, avec un code invalide.

## Cause racine

`translateContent` n'appelait pas la SSOT de canonicalisation-avec-dedup
`normalizeLanguageForDedup` (`packages/shared/utils/language-normalize.ts:175`),
dont le doc-comment nomme exactement ce cas. Le côté LECTURE
(`resolvePrismTranslation`, consommé par `broadcast-sender` et
`broadcast-inapp-sender`) canonicalise déjà ses clés à la volée, donc la
consommation était robuste — mais le côté ÉCRITURE (émission des travaux NLLB)
divergeait en silence, produisant des requêtes invalides et dupliquées et des
langues d'audience non traduites.

## Impact

- **Technique** : requêtes de traduction invalides (`'en-US'`, `'pt-BR'`) et
  dupliquées (`'fr'` + `'fr-FR'`) émises à chaque passage d'une diffusion en
  `READY`.
- **Produit (Prisme, Complétude + Performance)** : une langue d'audience déclarée
  sous forme région-taguée pouvait n'être JAMAIS traduite, rétrogradant ce
  destinataire sur la langue source de la diffusion.
- **Sécurité** : nulle (aucune fuite ; l'ensemble sortant est resserré, jamais
  élargi).

## Risque

Faible. Le correctif vit au **frontière de service** (`translateContent`), seul
appelant étant `broadcasts.ts` (vérifié). La canonicalisation ne fait que
RESSERRER l'ensemble des cibles (moins de travaux, jamais plus) et préserve
l'ordre de première apparition. Les codes déjà canoniques sont idempotents sous
`normalizeLanguageForDedup` (12 pins existants inchangés). Le côté lecture
canonicalisait déjà ses clés : les nouvelles clés canoniques du côté écriture
s'alignent avec ce que les destinataires résolvent — belt-and-suspenders.

## Amélioration livrée

Canonicaliser la source ET chaque cible via `normalizeLanguageForDedup`, puis
filtrer la source et dédupliquer par langue réelle :

```ts
const canonicalSource = normalizeLanguageForDedup(sourceLanguage);
const langsToTranslate = [...new Set(
  targetLanguages
    .filter((l): l is string => !!l)
    .map(normalizeLanguageForDedup)
    .filter((l) => l !== '' && l !== canonicalSource)
)];
```

## Bénéfices attendus

- Le translator ne reçoit plus que des codes NLLB canoniques, dédupliqués par
  langue réelle.
- La source est exclue quelle que soit sa forme d'écriture (région, casse).
- Les clés de `translatedSubjects`/`translatedBodies` deviennent canoniques et
  s'alignent sur la résolution des destinataires.
- Une source de vérité de canonicalisation de plus rejoint la SSOT partagée.

## Complexité d'implémentation

Triviale — un import élargi (`normalizeLanguageForDedup`), ~9 lignes de production,
4 nouveaux pins de comportement.

## Critères de validation

- `broadcast-translation.service.test.ts` : 4 nouveaux cas RED sur l'ancien code
  (cible région-taguée canonicalisée, dédup de variantes, source exclue sous
  toute forme, source région-taguée vs cible canonique), verts après le fix ;
  12 pins existants inchangés (16/16).
- Suites broadcast + i18n de cadrage (7 suites, 188 tests) vertes.
- `tsc --noEmit` gateway : 0 erreur.

## Suivi / améliorations futures

- `ZmqRequestSender.ts:85` déduplique les cibles du pipeline de MESSAGES par
  simple `.toLowerCase()` (`[...new Set(request.targetLanguages.map(l =>
  l.toLowerCase()))]`) — exactement le piège que le doc-comment de
  `normalizeLanguageForDedup` proscrit (`'en'` vs `'en-US'` comptés distincts).
  Troisième agrégat de cibles, surface plus large (ZMQ, nombreux tests) : à
  traiter en itération dédiée.
- Le champ `broadcast.targetLanguages` persisté sur la ligne reste verbatim
  (métadonnée non consommée pour le ciblage, vérifié) — pourrait refléter les
  cibles canoniques par cohérence. Non planifié.
