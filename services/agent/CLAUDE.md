# Meeshy Agent Service - Best Practices

> ## ⛔ Aucune feature sans issue — règle de démarrage (directive 2026-08-26)
> **Avant d'écrire la première ligne d'une feature, d'une amélioration ou d'un correctif non trivial**, ouvrir (ou retrouver) son **issue** dans `isopen-io/meeshy`, la placer dans un **milestone précis** (nommé par le résultat attendu, avec échéance) et l'inscrire au projet « Meeshy — pilotage » (https://github.com/orgs/isopen-io/projects/1) avec `Status = In Progress`. Le commit qui livre la ferme (`Closes #n`) avec sa preuve (gate, mesure, PR). **Une tâche sans issue n'existe pas ; un travail sans milestone n'est pas planifié.** Ce qu'on découvre en chemin (dette, dimension non mûre, suivi) devient une issue à son tour — jamais une ligne dans un fichier ou une page. Détail : § « Pilotage du développement » du `CLAUDE.md` racine.

Ce document définit les standards de développement et de configuration pour le service d'agents IA de Meeshy.

## 🛠 Commandes de Développement

-   **Build**: `pnpm run build`
-   **Dev**: `pnpm run dev`
-   **Lint**: `pnpm run lint`
-   **Tests**: `pnpm run test`
-   **Génération Prisma**: `pnpm --filter=@meeshy/agent run generate`

## 🧠 Stratégies de Contexte (Sliding Window)

L'agent utilise une fenêtre glissante de messages pour maintenir la pertinence et contrôler les coûts.

-   **Personnel (Amis)**: Recommandé `20-50` messages. Favorise la réactivité et le ton informel.
-   **SAV / Support**: Recommandé `100-200` messages. Nécessaire pour comprendre les problèmes complexes et l'historique de résolution.
-   **FAQ**: Recommandé `50-100` messages. Équilibre entre précision technique et concision.

## 📊 Analytics & Activation

Chaque conversation dispose d'une section **Agent Analytic** permettant de suivre les performances de l'IA (taux de réponse, confiance du ton, etc.).

L'agent **Animateur** est activé par défaut sur toutes les conversations pour engager les utilisateurs inactifs. Il est configuré pour produire des réponses d'une longueur comprise entre **3 et 400 mots**, imitant parfaitement le style de l'utilisateur ciblé.

## 🤖 Types d'Agents

1.  **Impersonator**: Imite un utilisateur absent. Se base sur le `ToneProfile` extrait.
2.  **Animator**: Anime une conversation de groupe (ex: Mairie, Entreprise).
3.  **Support (SAV)**: Agent dédié à la résolution de tickets ou à l'aide utilisateur. Utilise souvent le rôle `AGENT` sur son profil.
4.  **FAQ**: Répond aux questions fréquentes basées sur une base de connaissances.

## 👤 Utilisateurs Agentic

Un utilisateur est considéré comme "Agentic" lorsqu'il possède le rôle global `AGENT`. Il n'est pas un humain mais un bot géré par le service d'agent.

-   **Configuration**: Les administrateurs peuvent configurer un agent pour "prendre le contrôle" d'un utilisateur ayant le rôle `AGENT`.
-   **Usage**: SAV institutionnel, FAQ d'entreprise, bots de modération.

## 📝 Prompt Engineering

-   **Tone & Persona**: Toujours inclure le `vocabularyLevel` et `typicalLength` dans le prompt système.
-   **Institutional**: Pour les mairies/entreprises, utiliser un ton neutre, informel mais poli, et citer des sources si possible.
-   **Safety**: Toutes les sorties doivent passer par le `quality-gate.ts` pour éviter les hallucinations ou les comportements toxiques.

## 🏗 Architecture du Graphe

Le service utilise `LangGraph` pour gérer le flux de décision:
1.  **Observe**: Analyse les nouveaux messages.
2.  **Decide**: Détermine si une réponse est nécessaire.
3.  **Impersonate/Animate**: Génère la réponse brute.
4.  **QualityGate**: Valide la réponse avant envoi.

---
*Dernière mise à jour: Mars 2026*

## Pilotage & maturité (règle transverse — détail dans le `CLAUDE.md` racine)
- **Le pilotage se fait EXCLUSIVEMENT sur GitHub** (projet « Meeshy — pilotage », milestones, issues) : toute tâche de ce répertoire est une issue au titre sémantique, passée `In Progress` au démarrage et fermée par le commit qui la livre (`Closes #n`). Pas de `todo.md`, pas de page « progress » ; les artifacts servent aux brouillons, au design et aux comptes rendus — jamais à l'état.
- **Chaque feature est portée à maturité sur les treize dimensions** (sécurité, performance, mémoire, fluidité, accessibilité, cohérence de positionnement, facilité d'usage, UX, compatibilité, utilité, maintenabilité, simplicité d'usage, complétude). Ici, les témoins qui comptent d'abord : latence de réponse perçue, fenêtre de contexte bornée (mémoire), garde des prompts et des données utilisateur (sécurité), utilité MESURÉE par les analytics d'activation — le maintien de ce service est un arbitrage ouvert de la roadmap (issue `décision-produit`).
- **La complexité se paie dans le code, jamais chez l'utilisateur.** Une lenteur, une saccade, une action sans feedback immédiat sont des bugs, pas de la dette : ils ont au moins la priorité de la feature qu'ils dégradent. Le commentaire de clôture d'une issue dit quelles dimensions sont mûres et ouvre une issue par dimension restante.

## Quality Gate
Codex will review your output once you are done. Self-evaluate and ensure consistent, coherent code before marking any task as complete.
