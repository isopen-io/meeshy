# Itération 288 — le filtre bande-passante `?languages=` de la liste de messages canonicalise ses codes

Suite de la campagne « une source de vérité par règle de langue » (cycles 118→287,
Prisme + `recipient-language.ts` + `normalizeLanguageForDedup`). En balayant les
résolveurs qui DÉDUPLIQUENT ou FILTRENT des codes de langue au niveau du gateway,
un site restait sur un `.toLowerCase()` brut là où son JUMEAU socket canonicalise
déjà : le filtre bande-passante `?languages=` de
`GET /conversations/:id/messages`.

## État actuel (avant ce lot)

`services/gateway/src/routes/conversations/messages-list.ts` :

```ts
const languageFilter = languagesStr
  ? Array.from(new Set(
      languagesStr.split(',').map((l) => l.trim().toLowerCase()).filter(Boolean)
    )).slice(0, 20)
  : undefined;
```

Ce filtre (opt-in bande-passante, #E3/A3) restreint les traductions servies aux
seules langues du Prisme demandées par le client. Il alimente TROIS surfaces qui
le partagent, toutes en aval de cette unique variable :

- les traductions TEXTE (`transformTranslationsToArray`, `messages-list-query.ts:650`) ;
- le message CITÉ (`servedQuotedMessage(..., { languages })`, même filtre) ;
- les pistes AUDIO du Prisme (`cleanAttachmentsForApi`, même `languageFilter`).

## Problème identifié

Les codes arrivent **verbatim du client**. Le SDK iOS documente sa liste comme
« opaque » (`MessageService.languagesQueryItem`) : c'est l'app qui résout le
Prisme, et la descente inclut la **locale appareil** au rang 4
(`Locale.current.identifier` → `en_US`, `pt_BR`). Le web l'alimente depuis
`Accept-Language` (`en-US`, `pt-BR`). Ces codes région-tagués / à casse mixte
atteignent donc le filtre intacts.

Or les traductions sont stockées sous des clés **canoniques 2-lettres** :
`Message.translations` est une carte `langue → {text}` dont les clés sont les
cibles NLLB résolues, et `transformTranslationsToArray` matche
`langFilter.has(lang.toLowerCase())`. Conséquence, mesurée par témoin RED :

1. **La variante régionale ne matche jamais la clé canonique.** `?languages=pt-BR`
   produit le filtre `['pt-br']`, qui ne matche pas la clé stockée `'pt'`. La
   traduction est **prunée**, et le lecteur retombe sur le contenu ORIGINAL —
   violation directe du Prisme (règle critique 1), et sur le **cas nominal** de
   la règle 2 (la locale appareil, rang 4, diffère de la langue applicative).

2. **Les variantes dédupliquent comme des langues distinctes.** `new Set` sur des
   `.toLowerCase()` bruts compte `'fr'`, `'fr-FR'` et `'FR'` pour trois entrées :
   le plafond de 20 se remplit de variantes.

3. **Le symptôme est INVISIBLE côté serveur.** La traduction existe, la requête
   réussit, la réponse est bien formée — simplement amputée d'une traduction que
   le client aurait dû recevoir. Aucune trace, aucun log.

## Cause racine

Le résolveur n'appelait pas la SSOT de canonicalisation-avec-repli
(`normalizeLanguageForDedup`, `packages/shared/utils/language-normalize.ts`).
C'est une **jumelle divergente** : le chemin SOCKET, jumeau bande-passante exact,
canonicalise DÉJÀ la langue du destinataire avant de tailler
(`normalizeGroupLanguage` → `normalizeLanguageCode`,
`socketio/utils/message-payload-filter.ts`), et son doc-comment décrit MOT POUR
MOT ce défaut pour le cas du participant anonyme. La règle n'avait jamais été
portée au chemin REST.

## Impact métier

Un utilisateur dont la seule préférence effective est la locale appareil (compte
neuf, aucune préférence in-app configurée — cas nominal de la règle 2) recevait
sur REST (premier chargement, cold-start, refresh) des messages dans leur langue
ORIGINALE au lieu de sa langue lue, alors que la traduction existait en base et
que le chemin temps réel (socket) la servait correctement. Incohérence
REST↔socket sur le même contenu, pour le même lecteur.

## Impact technique

- Divergence de résolution de Prisme entre deux jumeaux (REST/socket).
- Le plafond de 20 langues consommé par des variantes régionales.
- Aucun outil ne l'attrapait : le balayage de schéma ne voit pas la sémantique
  de matching de langue ; le filtre « marche » (200, réponse bien formée).

## Évaluation du risque

Faible. Le correctif RESSERRE : il canonicalise le filtre côté CLIENT
uniquement, plaçant les codes dans l'espace exact des clés stockées. `?languages=`
absent/vide reste « toutes les langues » (comportement historique inchangé). Un
code déjà canonique est idempotent ; un code 3-lettres supporté (`bas`, `ewo`)
est préservé (`normalizeLanguageCode` le rend tel quel, ligne 124-125).

## Amélioration proposée (implémentée)

Canonicaliser le paramètre à la frontière, via la SSOT :

```ts
const languageFilter = languagesStr
  ? Array.from(new Set(
      languagesStr.split(',').map((l) => l.trim()).filter(Boolean).map(normalizeLanguageForDedup)
    )).slice(0, 20)
  : undefined;
```

Symétrique exact de `normalizeGroupLanguage` sur le chemin socket. La dédup se
fait APRÈS canonicalisation (les variantes collapse), et les trois surfaces en
aval (texte, cité, audio) héritent du filtre corrigé sans autre changement — le
site UNIQUE qui parse `?languages=` en filtre de Prisme.

## Bénéfices attendus

- REST et socket servent le MÊME Prisme pour le même lecteur (cohérence,
  maintenabilité — une règle, deux jumeaux réconciliés).
- La locale appareil (rang 4) fonctionne enfin sur REST comme sur socket.
- Le plafond de 20 compte des langues, pas des variantes.

## Complexité d'implémentation

Triviale : un import + une transformation à un site. Aucun changement de contrat
client, aucune migration.

## Critères de validation

- RED prouvé : `?languages=pt-BR` / `pt_BR` / `pt-BR,es-ES` rendaient des
  traductions VIDES avant le correctif (3 témoins rouges), les codes canoniques
  (`es`) restaient verts.
- GREEN : les 5 témoins passent
  (`messages-list-language-filter-canonicalization.test.ts`).
- Non-régression : 12 suites liées (messages-list*, translation-transformer,
  reply-message-protection-contract) — 108 témoins verts.
- `tsc --noEmit` gateway : EXIT=0.

## Suivi / dimensions

- Complétude : le seul site REST qui parse `?languages=` en filtre de Prisme est
  couvert (vérifié : `admin/languages.ts` est un autre concern). Le chemin socket
  l'était déjà.
- Le matching interne de `transformTranslationsToArray` / `filterMessagePayloadForLanguages`
  reste `.toLowerCase()`-only sur les clés STOCKÉES — correct tant que le stockage
  est canonique (invariant existant, partagé par le jumeau socket). Aucune dette
  ouverte : canonicaliser la frontière est le geste symétrique retenu.
