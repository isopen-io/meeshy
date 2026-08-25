# Itération 266 — Plan : `skipMessageKeys` persiste le compteur qu'il a avancé

## Objectifs

1. `DoubleRatchet.skipMessageKeys`
   (`services/gateway/src/dma-interoperability/signal-protocol/DoubleRatchet.ts`)
   doit réécrire `session.messageNumberSend` / `messageNumberReceive` à la
   position atteinte (`currentMessageNumber`, = `until`) après avoir avancé la
   clé de chaîne — pour que `symmetricRatchet` étiquette la clé du bon numéro et
   que le message ordonné suivant ne soit pas re-sauté.
2. Aucun changement de signature, de type, ni de configuration jest.

## Modules affectés

- `DoubleRatchet.ts` — une clause après la boucle `while` de `skipMessageKeys`.
- `src/__tests__/unit/dma-double-ratchet-skip-counter.test.ts` — NOUVEAU témoin
  (chemin exécuté par la CI ; importe le code de production).

## Phases

### Phase 1 — RED
Écrire 4 cas : étiquette du message reçu en avance (#3 → 3), compteur porté à la
position de chaîne (4), **message DANS L'ORDRE après un message en avance** (#4
attendu, non re-sauté, 3 clés sautées inchangées), saut côté ÉMISSION
(`messageNumberSend === 2`). Prouver le rouge (4 échecs : message suivant
étiqueté `1`, `messageNumberSend` resté `0`).

### Phase 2 — GREEN
Après la boucle, avant le nettoyage anti-DoS :
```ts
if (direction === 'send') session.messageNumberSend = currentMessageNumber;
else session.messageNumberReceive = currentMessageNumber;
```
avec commentaire nommant l'invariant.

### Phase 3 — Validation
- Suite ciblée → 4/4.
- 6 suites `dma-*` → 35/35.
- Tranche chiffrement/signal (9 suites) → 234/234.
- `tsc --noEmit` gateway → 0.

## Dépendances

Aucune. `DoubleRatchetSession` inchangé ; aucun type inféré ne bouge.

## Risques estimés

**Faible.** Persistance d'une valeur déjà calculée, au seul point qui l'oubliait.
N'affecte ni la dérivation de clés, ni le stockage des clés sautées, ni le
nettoyage anti-mémoire. Rollback : revert du commit unique.

## Stratégie de rollback

Revert du commit unique.

## Critères de validation

- [x] RED prouvé (4 échecs avant fix).
- [x] GREEN suite ciblée (4/4).
- [x] Suites `dma-*` (35/35).
- [x] Tranche chiffrement/signal (234/234).
- [x] `tsc --noEmit` gateway (0 erreur).
- [x] Commit + push.

## Statut de complétion

- [x] RED écrit et prouvé.
- [x] GREEN livré.
- [x] Validation complète.
- [x] Commit + push.

## Améliorations futures (hors périmètre, nommées dans l'analyse)

- `getMessageKeyReceive` ne relit jamais les clés sautées (`retrieveSkippedMessageKey`
  n'est appelé nulle part en production) — les messages « en retard » échouent.
- Réactiver le sous-arbre de test `dma-interoperability/__tests__/` (hors CI),
  qui contient `DoubleRatchet.test.ts:252` désormais satisfait par ce correctif.
