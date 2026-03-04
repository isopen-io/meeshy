# Meeshy Agent Service - Best Practices

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

## 🤖 Types d'Agents

1.  **Impersonator**: Imite un utilisateur absent. Se base sur le `ToneProfile` extrait.
2.  **Animator**: Anime une conversation de groupe (ex: Mairie, Entreprise).
3.  **Support (SAV)**: Agent dédié à la résolution de tickets ou à l'aide utilisateur. Utilise souvent `isAgentic: true` sur son profil.
4.  **FAQ**: Répond aux questions fréquentes basées sur une base de connaissances.

## 👤 Utilisateurs Agentic

Un utilisateur est dit "Agentic" (`user.isAgentic = true`) lorsqu'il n'est pas un humain mais un bot géré par le service d'agent.

-   **Configuration**: Les administrateurs peuvent configurer un agent pour "prendre le contrôle" d'un utilisateur agentic.
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
