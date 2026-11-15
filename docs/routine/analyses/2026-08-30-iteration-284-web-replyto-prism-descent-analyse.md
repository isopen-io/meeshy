# Itération 284 — l'aperçu de RÉPONSE (`replyTo`) web descend le Prisme ordonné, plus seulement la langue du parent

Cinquième famille de contenu web à descendre le prisme ordonné, sœur directe de
l'itération 283 (le CORPS du message). L'énumération des « quatre familles web »
(aperçu de liste, audio, posts/commentaires, corps du message) manquait une
CINQUIÈME instance de contenu : la **bulle citée d'une réponse** (`replyTo`),
rendue au-dessus de chaque message qui répond à un autre.

## État actuel

`useMessageDisplay` (`apps/web/hooks/use-message-display.ts`) résout DEUX
contenus : le corps du message principal (`displayContent`) et l'aperçu de la
réponse citée (`replyToContent`). Les deux ne recevaient qu'UNE langue,
`currentDisplayLanguage` — la langue RÉSOLUE POUR LE MESSAGE PRINCIPAL (sortie de
`getPreferredDisplayLanguage`, corrigé au cycle 283 pour descendre le prisme
ordonné contre les traductions DU PRINCIPAL) :

```ts
const replyToContent = useMemo(() => {
  if (!message.replyTo) return null;
  if (sameLanguage(currentDisplayLanguage, message.replyTo.originalLanguage || 'fr'))
    return message.replyTo.originalContent || message.replyTo.content;
  const translation = message.replyTo.translations?.find((t) =>
    sameLanguage(t.language || t.targetLanguage, currentDisplayLanguage)
  );
  if (translation) return translation.translatedContent || translation.content;
  return message.replyTo.content;               // repli : l'ORIGINAL
}, [currentDisplayLanguage, message.replyTo]);
```

Le prisme ORDONNÉ du lecteur (`usedLanguages`, rangs 1→4 dont la locale appareil)
était pourtant **déjà en portée** chez le rendeur `BubbleMessageNormalView`, reçu
comme prop `usedLanguages` — puis **jeté** (`_usedLanguages = []`, préfixe
underscore = inutilisé) et jamais passé à `useMessageDisplay`.

## Problèmes identifiés

1. **Violation du Prisme #3 sur un contenu DISTINCT du principal.** Le message
   cité est un AUTRE message, avec ses PROPRES traductions et sa propre langue
   d'origine. Le résoudre avec la langue élue pour le PARENT est un double
   défaut :
   - **Il ignore les rangs inférieurs du lecteur.** Prisme `['fr','en']` ;
     principal allemand traduit en `fr` ⇒ `currentDisplayLanguage='fr'` ; la
     réponse citée est allemande et n'a QU'UNE traduction **anglaise** (rang 2).
     L'ancien code cherchait `fr`, n'en trouvait pas, et repliait sur l'**original
     allemand** — alors qu'une traduction d'un rang du lecteur (`en`, rang 2)
     existait. Exactement le défaut du cycle 283, une couche plus bas.
   - **Il peut servir un rang INFÉRIEUR à celui disponible.** Si le principal
     n'avait pas de `fr` mais un `en` ⇒ `currentDisplayLanguage='en'` ; une
     réponse citée qui A une traduction `fr` (rang 1 !) ne la voyait pas, l'ancien
     code ne cherchant que `en`.

2. **Repli sur l'original au lieu de la SSOT du Prisme.** La boucle était
   réécrite à la main (`.find` sur une seule langue) au lieu de déléguer à
   `resolvePrismTranslation` (`packages/shared/utils/conversation-helpers.ts`),
   la SSOT que les quatre autres familles web consomment déjà.

3. **`buildTranslationRecord` était une JUMELLE locale** dans
   `messages-display.tsx` (cycle 283), non partagée — le web aurait fini avec
   deux adaptateurs `BubbleTranslation[] → Record<lang,text>` divergents (interdit
   par le `CLAUDE.md` : « aucune jumelle divergente »).

## Causes racines

`useMessageDisplay` a été écrit avant l'extraction de `resolvePrismTranslation`
et n'a jamais été porté quand le corps du principal l'a adopté (cycle 283).
L'énumération « les quatre familles web » comptait le corps du message comme UNE
instance ; le `replyTo`, rendu par le MÊME hook, est une instance SÉPARÉE de la
même famille (contenu de message) que personne n'avait comptée — précisément la
classe « cette règle gouverne-t-elle un autre TYPE / une autre INSTANCE de
contenu, et qui le résout ? » du `CLAUDE.md`. Le défaut restait invisible parce
qu'il « marchait » pour le cas fréquent (réponse citée dans la même langue que le
principal, tous deux ayant une traduction rang-1).

## Impact métier / technique

Un utilisateur multilingue — ou francophone sur un navigateur anglais (locale
appareil rang 4 ≠ langue applicative) — voyait la bulle citée d'une réponse en
langue étrangère alors qu'une traduction d'un de ses rangs existait, servie par
ses autres appareils (iOS, Android). Friction linguistique visible sur un
contenu central du fil de chat, contredisant le principe de « transparence » du
Prisme. Surface non couverte par les cycles 120-123 ni 283.

## Évaluation du risque

Faible. Le correctif DÉLÈGUE à `resolvePrismTranslation` (SSOT testée, partagée
par les quatre familles web) ; le corps du principal (`displayContent`) est
INCHANGÉ (`currentDisplayLanguage` reste sa langue explicite, honorant le toggle
manuel). L'ordre de descente du `replyTo` place `currentDisplayLanguage` en TÊTE
puis le prisme (`[currentDisplayLanguage, ...usedLanguages]`, dédupliqué par le
résolveur) : un toggle manuel sur le parent continue de piloter l'aperçu quand la
réponse a cette langue — le correctif n'AJOUTE que des rangs de repli, il ne
retire jamais le choix courant. `usedLanguages` est optionnel avec défaut
`[currentDisplayLanguage]` : tout appelant qui ne le passe pas reproduit à
l'identique l'ancien comportement (aucune régression).

## Améliorations proposées (implémentées)

- `buildTranslationRecord` extrait vers `apps/web/utils/translation-record.ts`
  (SSOT de l'adaptateur `BubbleTranslation[] → Record<lang,text>`) ; importé par
  `messages-display.tsx` (copie locale retirée) et `use-message-display.ts`.
- `useMessageDisplay` accepte `usedLanguages?: readonly string[]` et résout
  `replyToContent` via `resolvePrismTranslation` avec
  `preferredLanguages = [currentDisplayLanguage, ...usedLanguages]` contre les
  traductions PROPRES du `replyTo` ; `null` ⇒ original.
- `BubbleMessageNormalView` (`_usedLanguages` → `usedLanguages`) et `FocalRow`
  (nouveau prop, câblé depuis `BubbleMessage`) passent le prisme au hook — les
  DEUX chemins de rendu vivants d'une bulle sont couverts.

## Bénéfices attendus

L'aperçu de réponse web sert la même langue qu'iOS/Android pour le même lecteur ;
une traduction de rang 2/3/4 est enfin honorée sur la bulle citée ; le corps du
principal reste piloté par son toggle. Cinquième famille web alignée sur la SSOT.

## Complexité

Faible : un hook, deux rendeurs (un prop chacun), un adaptateur extrait, un
fichier de tests.

## Critères de validation (atteints)

- **RED prouvé** : les témoins de descente rang-2 du `replyTo` tombent sur le
  code courant (repli sur l'original).
- **GREEN** : `use-message-display.test.ts` vert (anciens + neufs) ; suites
  `bubble-message` / `messages-display` vertes.
- `tsc --noEmit` : aucune erreur neuve sur les fichiers touchés.

## Dimensions (roadmap treize dimensions)

**6 · Cohérence de positionnement** (mûre : le web rejoint iOS/Android sur la
bulle citée) — **11 · Maintenabilité** (mûre : une SSOT de descente + un
adaptateur partagé, plus de jumelle) — **12 · Simplicité d'usage** (mûre : la
friction linguistique disparaît sans action utilisateur) — **13 · Complétude**
(mûre : cinquième instance de contenu web à descendre le prisme, les deux chemins
de rendu couverts).

## Suivi (hors périmètre)

- `bubble-message/FocalRow` (la rangée plate) reçoit désormais `usedLanguages` ;
  la variante `conversations/focal/FocalRow` (autre lentille) résout son propre
  contenu — à vérifier au prochain passage prisme.
- Toujours aucun cliquet ne garde « toute surface web de contenu descend le
  prisme ordonné » (suivi de méthode du cycle 283, inchangé).
