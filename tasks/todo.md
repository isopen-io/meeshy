# Cycle 22 — `translation:request` : le chemin cache parlait une langue qu'aucun client ne lit

Routine « amélioration continue temps réel ». Le cycle 21 (PR #3012/#3013) avait
fermé le rejeu HORS LIGNE de `message:translation`. Ce cycle repart du MÊME
événement par l'autre bout : non plus « qui le reçoit », mais **quelle forme il
a selon le chemin qui l'émet**.

## Constat

**D1 — `SERVER_EVENTS.MESSAGE_TRANSLATION` avait deux constructeurs, et un seul
respectait le contrat.**

`_handleTextTranslationReady` (retour ZMQ, cache MISS) émettait un
`TranslationEvent` correct. La branche CACHE de `_handleTranslationRequest` —
la réponse à un `translation:request` explicite — construisait sa propre charge
utile : `{ messageId, translatedText, targetLanguage, confidenceScore }`. Ni
tableau `translations`, ni le nom `translatedContent` que `TranslationData`
porte.

Or le web sort de `handleTranslationEvent` par un `return` nu dès qu'il ne
trouve ni `translation` ni `translations`, et iOS décode `TranslationEvent` dont
`translations` n'est pas optionnel. Des deux côtés, l'événement disparaît **en
silence**.

Effet : « traduire ce message » ne faisait RIEN quand la traduction était déjà
en cache — le chemin censé être instantané. Elle ne « marchait » que sur cache
MISS. Le Prisme Linguistique devenu fonction de l'état du cache serveur.

**Pourquoi ça a survécu** : le test de cette branche assertait la forme cassée
(`translatedText` à la racine). Récidive du D4 du cycle 7.

## Correctifs

- [x] `socketio/buildTranslationEvent.ts` — constructeur UNIQUE des deux chemins
- [x] `cached` dit la provenance au lieu d'un `false` en dur
- [x] `id` unique par émission (le web déduplique sur `messageId_id`)
- [x] `confidenceScore` par `??` (une confiance de 0 est une valeur)
- [x] Web : le `return` silencieux devient un `logger.warn` nommant les clés
- [x] Le test qui figeait la forme cassée énonce le contrat

## Gates

- [x] 1 RED discriminant vu rouge avant correctif
- [x] 11 témoins sur le constructeur, 2 côté web
- [x] `MeeshySocketIOManager.test.ts` : 337 verts (336 pré-existants inchangés)
- [x] Suite gateway complète verte
- [x] Web : 63 suites / 2215 verts
- [x] `tsc --noEmit` gateway 0 ; web 1229 = base pré-existante inchangée
- [x] CHANGELOG + journal d'audit (§ Cycle 22)

## Revue

Voir `tasks/realtime-sync-audit-2026-08-15.md` § Cycle 22 — méthode (deux
matrices d'events), défaut, correctif, et les 5 surfaces vérifiées correctes à
ne pas re-instruire.
