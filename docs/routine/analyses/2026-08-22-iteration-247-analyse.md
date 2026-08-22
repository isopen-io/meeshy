# Analyse — Itération 247 : le pré-filtre serveur d'aperçu droppait les clés de traduction taguées région

## Current state

`buildLastMessagePreviewTranslations`
(`services/gateway/src/routes/conversations/utils/last-message-preview.ts`)
construit la carte `{ langue → aperçu traduit }` que `GET /conversations` (et les
trois émetteurs temps réel de `conversation:updated` via
`resolveLastMessagePreviewPrism`) transporte pour que le Prisme Linguistique
s'applique à la ligne de liste. C'est le **pré-filtre serveur** qui s'exécute
AVANT le résolveur client (`resolveLastMessagePreview` en TS,
`MeeshyConversation.resolvedLastMessagePreview` en Swift).

Ses trois comparaisons de codes de langue étaient faites en `.toLowerCase()`
**brut** :

```ts
const original = originalLanguage?.toLowerCase() ?? null;
// …
const target = wanted.toLowerCase();
if (target === original) continue;
const match = entries.find(([lang]) => lang.toLowerCase() === target);
```

Le résolveur CLIENT, lui, a été durci à l'itération 243 pour canonicaliser ses
trois sources via la SSOT `normalizeLanguageForDedup` (casse repliée + région
strippée + réduction 3-lettres/legacy). L'itération 243 avait explicitement
nommé ce pré-filtre serveur comme **le suivi à instruire** : « auditer qu'une
clé de traduction héritée région-taguée n'y soit pas droppée AVANT d'atteindre
le résolveur client ». C'est ce lot.

## Problems identified

`viewerLanguages` sort déjà région-strippé de `resolveUserLanguagesOrdered`
(`'fr'`), mais **`originalLanguage` et les CLÉS de `Message.translations`
arrivent brutes du fil**. Un message écrit AVANT la canonicalisation au
write-boundary (`MessagingService`, `normalizeLanguageCode(claimedLanguage)`)
porte encore des codes région-tagués ou 3-lettres. Trois défauts en découlaient :

1. **Clé de traduction région-taguée DROPPÉE (le défaut principal).** Prisme du
   lecteur `['fr']`, message d'origine `en`, traduction sous la clé `'fr-FR'`.
   `.find(([lang]) => lang.toLowerCase() === 'fr')` échoue (`'fr-fr' !== 'fr'`) :
   la carte revient `null`, le client ne reçoit AUCUNE traduction et retombe sur
   l'original anglais — alors qu'une traduction française existe. Violation
   directe du Prisme (#3). Le résolveur client durci ne peut rien y faire : la
   donnée n'arrive jamais jusqu'à lui.
2. **Clé de traduction 3-lettres héritée DROPPÉE.** Même cause, autre forme :
   une clé `'fra'` (ISO 639-2) doit réduire vers `'fr'` ; `.toLowerCase()` seule
   laissait `'fra' !== 'fr'`.
3. **Garde « langue d'origine » court-circuitée sur origine taguée.** Message
   d'origine `'en-US'`, prisme `['en', 'fr']`. La garde #2 (« ne pas re-servir
   la langue d'origine, elle EST déjà `content` ») comparait `'en-us'` au rang
   `'en'` : ne se déclenchait pas, et une éventuelle auto-traduction `en`
   redondante était servie (doublon d'octets, même langue que `content`).

## Root causes

Le dépôt possède la SSOT `normalizeLanguageForDedup`
(`packages/shared/utils/language-normalize.ts`), déjà consommée par le résolveur
client jumeau depuis l'itération 243 et par plusieurs sites gateway
(`message-payload-filter`, `offlineParticipantQueue`, `deviceLocale`). Le
pré-filtre serveur n'y avait jamais été routé : la canonicalisation s'arrêtait
au résolveur client et laissait le pré-filtre serveur — **le point où la donnée
est réellement perdue** — sur des codes bruts.

## Business impact

- Aperçu de ligne de liste servi dans la langue de l'EXPÉDITEUR au lieu de la
  langue du lecteur, dès que le backend a émis (ou stocke encore) une clé de
  traduction région-taguée/3-lettres pour la cible. Perte silencieuse de la
  qualité perçue du produit sur la surface la plus vue (liste de conversations),
  à chaque démarrage à froid, sans erreur ni trace.
- Doublon d'octets sur la carte quand la langue d'origine taguée n'est pas
  reconnue comme telle.

## Technical impact

Surface minimale : trois comparaisons dans une seule fonction. Aucun schéma,
aucun contrat wire, aucune signature publique modifiée. Les valeurs de sortie
(clés `target` de la carte) restent les codes canoniques déjà produits par
`resolveUserLanguagesOrdered` — inchangées pour les entrées réelles. Le résolveur
client re-canonicalise de toute façon les clés reçues : rien en aval ne dépend
de la forme de la clé.

## Risk assessment

Faible. `normalizeLanguageForDedup` est idempotente sur les codes canoniques
(`'fr'` → `'fr'`, `'en'` → `'en'`) : les messages dont origine et clés sont déjà
canoniques sont inchangés (les 11 témoins pré-existants restent verts sans
modification). Seuls les cas région-tagués/3-lettres/casse-mixte changent de
résultat, dans le sens attendu (matché au lieu de droppé). `normalizeLanguageForDedup`
ne supprime jamais une donnée (repli sur le sous-tag primaire lowercased pour un
code irréductible inconnu), donc aucune traduction ne disparaît qui n'était pas
déjà droppée.

## Proposed improvements (implemented)

Canonicaliser les trois sources via `normalizeLanguageForDedup` :

```ts
const original = originalLanguage ? normalizeLanguageForDedup(originalLanguage) : null;
// …
const target = normalizeLanguageForDedup(wanted);
if (target === original) continue;
const match = entries.find(([lang]) => normalizeLanguageForDedup(lang) === target);
```

Jumeau exact du résolveur client — les deux moitiés (serveur pré-filtre, client
résolveur) canonicalisent désormais par la MÊME SSOT.

## Expected benefits

- Une traduction taguée région (`'fr-FR'`) ou 3-lettres (`'fra'`) atteint enfin
  le lecteur dont le prisme la demande.
- La garde « langue d'origine » se déclenche même sur une origine taguée
  (`'en-US'`) — plus de doublon.
- Robustesse : le pré-filtre est désormais indépendant de la normalisation de
  l'appelant, comme le résolveur client.

## Implementation complexity

Triviale : un import + trois substitutions dans une seule fonction.

## Validation criteria

- 3 témoins RED posés d'abord (clé `'fr-FR'` ⇒ matchée ; clé `'fra'` ⇒ réduite ;
  origine `'en-US'` ⇒ garde #2 active), verts après le fix.
- Suite `last-message-prisme` 14/14 ; suites voisines (`lastMessagePreviewPrism`,
  `emitConversationPreviewUpdate`, autres `last-message*`) 52/52.
- `tsc --noEmit` gateway : exit 0, zéro erreur.

## Future improvements (relevées par l'audit, hors périmètre de ce lot)

L'audit croisé du 22/08 (recherche des comparaisons de codes de langue
bypassant la SSOT dans gateway/web/shared) a relevé plusieurs autres sites, à
instruire séparément et par ordre de sévérité :

1. **`services/gateway/src/routes/anonymous.ts:311-316` (ACCÈS)** — la garde des
   langues autorisées d'un lien partagé compare
   `allowedLanguages.some(l => l.toLowerCase() === body.language)` : un joignant
   `'fr-FR'` est REFUSÉ (`sendForbidden`) quand le lien autorise `['fr']`.
   Décision d'accès ⇒ sévérité supérieure à un défaut d'affichage ; la SSOT
   nomme d'ailleurs `anonymous.ts` comme site à agréger via la SSOT. Priorité 1
   pour la prochaine itération.
2. **`services/gateway/src/services/posts/reelAffinity.ts:114,124`** — scoring de
   reels : `c.originalLanguage === seed.originalLanguage` et
   `viewerLanguages.has(c.originalLanguage)` en brut ⇒ un reel région-tagué perd
   le poids `seedSameLanguage`/`viewerLanguage`. Ranking dégradé, zéro risque.
3. **`services/gateway/src/socketio/MeeshySocketIOManager.ts:2262-2273`
   (`_findUsersForLanguage`)** — le repli `user.language.toLowerCase() === lang`
   et la clé `lang` ne sont pas canonicalisés ⇒ un destinataire `'en-US'` peut
   manquer un emit filtré par langue (derrière `SOCKET_LANG_FILTER`).
4. **Web (jest web, à valider dans un lot web dédié)** :
   `apps/web/components/v2/CanvasV3Scene.tsx` (`sameLanguage` via `split('-')`),
   `apps/web/components/common/BubbleMessage.tsx` (`===` brut sur origine + clé),
   `apps/web/components/v2/TranslationToggle.tsx` (`startsWith` sur codes),
   `apps/web/hooks/use-stream-translation.ts` (prefs non normalisées).
5. **Backfill** de `Message.originalLanguage`/clés de `translations` tagués en
   base (migration) — supprimerait la classe de défaut à la SOURCE plutôt qu'à
   la lecture. Décision produit + fenêtre de migration.
