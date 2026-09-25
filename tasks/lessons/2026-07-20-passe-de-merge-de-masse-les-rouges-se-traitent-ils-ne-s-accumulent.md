## 2026-07-20 — Passe de merge de masse : les rouges se TRAITENT, ils ne s'accumulent pas

Consigne user pendant la passe (46 PR) : « Une fois mergé il faut fermer et ensuite passer aux
PR [rouges] pour savoir pourquoi c'est rouge et comment résoudre ! Si c'est résolvable résoudre
et préserver la résolution sur les autres merges ! »

**Règle : une passe de merge n'est pas finie tant que chaque PR rouge n'a pas un VERDICT** :
1. Lire le vrai log (`gh run view --job <id> --log-failed`), jamais deviner depuis le nom du check.
2. Base périmée (snapshot re-baseliné, échec translator sur PR iOS) → merge origin/main dans la
   branche + push, la CI repart ; même remède en série sur toutes les PR partageant la cause.
3. Breaking change réel (firebase-admin 14) → fixer SUR la branche dependabot + vérif locale
   (tsc + suites bun ciblées) avant push.
4. Majeur hors périmètre (tailwind 4, TS 7 qui casse ts-jest) ou PR supersédée par une itération
   plus récente déjà mergée → FERMER avec commentaire expliquant cause + condition de reprise.
Anti-pattern corrigé : lister les rouges dans le rapport final et s'arrêter là.
