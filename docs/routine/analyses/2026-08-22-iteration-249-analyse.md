# Analyse — Itération 249 : le scoring d'affinité des réels comparait des codes de langue bruts

## Current state

`reelAffinityBreakdown` (`services/gateway/src/services/posts/reelAffinity.ts`)
est la **fondation** (« seam ») du moteur de recommandation de réels : quand un
réel est touché dans le Feed, le plein écran génère un thread de réels classés
par affinité. Deux des huit signaux du score portent sur la LANGUE :

- `seedSameLanguage` : le réel candidat est-il dans la même langue que le réel
  touché (« seed ») ?
- `viewerLanguage` : le réel candidat est-il dans une langue que le lecteur lit ?

Les deux comparaisons étaient faites sur des codes **bruts** :

```ts
const seedSameLanguage =
  seed && c.originalLanguage && seed.originalLanguage &&
  c.originalLanguage === seed.originalLanguage ? W.seedSameLanguage : 0;
// …
const viewerLanguage =
  c.originalLanguage && ctx.viewerLanguages.has(c.originalLanguage)
    ? W.viewerLanguage : 0;
```

C'était le **suivi #2 nommé par l'itération 247** (et repris par l'itération 248,
PR #3352, comme prochaine priorité) : un site de comparaison de codes de langue
qui bypasse la SSOT `normalizeLanguageForDedup`. Contrairement au suivi #1
(porte d'accès d'un lien partagé, décision d'ACCÈS), celui-ci n'a **aucun risque
d'accès** — c'est un défaut de RANKING.

## Problems identified

`c.originalLanguage` (candidat) et `seed.originalLanguage` viennent tous deux de
`Post.originalLanguage`, **BRUT** de la base : rien ne le canonicalise ni à
l'écriture ni à la lecture (`getReelSeed` copie la colonne verbatim, le mapping
candidat de `getReels` lit `(post as any).originalLanguage`). `ctx.viewerLanguages`
était de même construit brut par `getViewerLanguages` (Set des préférences
`systemLanguage`/`regionalLanguage`/`customDestinationLanguage` non normalisées).
Trois défauts en découlaient :

1. **`seedSameLanguage` perdu sur formes divergentes (défaut principal).**
   Candidat `'fr-FR'`, seed `'fr'` : `'fr-FR' === 'fr'` est **faux** ⇒ le réel
   perd le poids `seedSameLanguage` (0.1) alors qu'il est dans la MÊME langue que
   le réel touché. Le thread de découverte remonte moins bien les réels
   linguistiquement proches du point d'entrée.
2. **`viewerLanguage` perdu sur candidat tagué.** Candidat `'fr-FR'`,
   `viewerLanguages` brut `{'fr'}` : `.has('fr-FR')` échoue ⇒ le réel perd le
   poids `viewerLanguage` (0.1) alors qu'il est dans une langue que le lecteur
   lit. Un réel parfaitement lisible est déclassé.
3. **Double divergence possible.** Si les DEUX côtés sont tagués sous des formes
   différentes (`'fr-FR'` vs `'fr_FR'`, ou `'fra'` vs `'fr'`), l'écart se
   cumule : le réel perd les deux poids.

## Root causes

Même classe de défaut que les itérations 243 (résolveur client), 246 (clé de
dédup web), 247 (pré-filtre serveur d'aperçu) et 248 (porte d'accès de lien) :
un site de comparaison de codes de langue qui n'est jamais passé par la SSOT
`normalizeLanguageForDedup` (`packages/shared/utils/language-normalize.ts`). La
canonicalisation s'arrêtait aux surfaces déjà durcies et laissait le scoring de
réels — un chemin plus récent, ajouté après la SSOT — sur des `===`/`has()`
bruts.

## Business impact

- **Ranking de découverte dégradé, silencieux.** Un réel légitimement proche
  (même langue que le seed, ou langue du lecteur) est sous-classé dès que sa
  langue est stockée sous une forme taguée/3-lettres — ce qui arrive
  mécaniquement pour tout réel créé par un client qui envoie
  `Post.originalLanguage` verbatim (`'en-US'` d'un `Accept-Language`, `'fr-FR'`
  d'une locale iOS). Aucune erreur, aucune trace : le réel apparaît simplement
  plus bas dans le thread.
- Le produit se traduit tout (Prisme Linguistique) : la langue d'origine taguée
  est un cas courant, pas marginal.

## Technical impact

Surface minimale : deux comparaisons dans la fonction pure + une construction de
`Set` à la source. Aucun schéma, aucun contrat wire, aucune signature publique
modifiée. La fonction pure reste pure et déterministe.

## Risk assessment

Très faible. `normalizeLanguageForDedup` est idempotente sur les codes canoniques
(`'fr'` → `'fr'`) : les réels dont origine et prefs sont déjà canoniques sont
inchangés (33 témoins pré-existants restent verts). La canonicalisation ne peut
qu'**élargir** des correspondances légitimes ; elle ne fait jamais matcher deux
langues distinctes (garde anti-troncature `'fil'`/`'swe'` de la SSOT) — vérifié
par une contre-épreuve (`'en-US'` vs `'fr-FR'` ⇒ 0). Le score étant un simple
tri d'affichage (le curseur de pagination est figé AVANT le tri, cf. commentaire
de `getReels`), aucun réel n'est jamais sauté ni dupliqué : seul l'ORDRE
d'affichage change, dans le sens attendu.

## Proposed improvements (implemented)

1. **Fonction pure** — canonicaliser les atomes candidat/seed AVANT comparaison,
   robuste à un `originalLanguage` brut quelle que soit sa forme :

   ```ts
   const candidateLang = c.originalLanguage ? normalizeLanguageForDedup(c.originalLanguage) : null;
   const seedLang = seed?.originalLanguage ? normalizeLanguageForDedup(seed.originalLanguage) : null;
   // seedSameLanguage: candidateLang === seedLang
   // viewerLanguage:   ctx.viewerLanguages.has(candidateLang)
   ```

2. **Source du set** — `getViewerLanguages` (`PostFeedService`) construit
   désormais un `Set` de codes **canonicalisés** (`.map(normalizeLanguageForDedup)`),
   comme l'agrégat `spokenLanguages` d'`anonymous.ts`. Contrat documenté sur
   `ReelAffinityContext.viewerLanguages`.

Répartition volontaire : les atomes (candidat/seed) sont canonicalisés DANS la
fonction (un code, par candidat, robuste au brut) ; le set est canonicalisé À LA
SOURCE (une fois par requête, pas par candidat) — évite un rebuild de `Set` par
réel tout en gardant le `.has()` correct.

## Expected benefits

- Un réel région-tagué (`'fr-FR'`) reçoit enfin les poids `seedSameLanguage` /
  `viewerLanguage` qu'il mérite face à un seed/lecteur canonique.
- Le ranking de découverte devient indépendant de la forme sous laquelle
  `Post.originalLanguage` a été stocké.
- Convergence : un site de comparaison de codes de langue de plus routé par la
  SSOT — reste les suivis #3 (`_findUsersForLanguage`) et #4 (web).

## Implementation complexity

Triviale : un import + deux atomes canonicalisés + un `.map` à la source.

## Validation criteria

- 3 témoins RED posés d'abord (candidat `'fr-FR'` vs seed `'fr'` ; seed `'en-US'`
  vs candidat `'en'` ; candidat `'fr-FR'` vs set lecteur `{'fr'}`), verts après
  le fix. 2 contre-épreuves (langues distinctes taguées ⇒ 0) vertes.
- Suites `reelAffinity` (les deux) : 47/47 ; `PostFeedService` : 81/81.
- `tsc --noEmit` gateway : exit 0.

## Future improvements (audit it. 247, restant à instruire)

Par sévérité décroissante (suivis #1 et #2 désormais clos) :

1. **`services/gateway/src/socketio/MeeshySocketIOManager.ts:2262-2273`
   (`_findUsersForLanguage`)** — le repli `user.language.toLowerCase() === lang`
   et la clé `lang` non canonicalisés ⇒ un destinataire `'en-US'` peut manquer
   un emit filtré par langue (derrière `SOCKET_LANG_FILTER`). Priorité 1
   prochaine itération.
2. **Web (jest web, lot dédié)** : `CanvasV3Scene.tsx` (`sameLanguage` via
   `split('-')`), `BubbleMessage.tsx` (`===` brut origine + clé),
   `TranslationToggle.tsx` (`startsWith`), `use-stream-translation.ts`.
3. **Backfill base** des codes tagués (`Message.originalLanguage`, clés de
   `translations`, `Post.originalLanguage`, `ConversationShareLink.allowedLanguages`)
   — supprimerait la classe de défaut à la SOURCE (écriture). Décision produit +
   fenêtre de migration.
