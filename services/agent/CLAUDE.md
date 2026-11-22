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

## 🚫 Un membre BANNI n'est ni élu ni servi par l'agent — les DEUX bouts (#20111)

**Toute lecture de `Participant` de ce service porte `PARTICIPATION_VIVANTE`**
— `isActive: true` **et** `bannedAt` nul ou absent —, importée de
`@meeshy/shared/utils/participation-vivante`, jamais réécrite.

**Le titre a dû être réécrit, et il faut dire pourquoi.** Il disait « l'agent ne
parle JAMAIS à la place d'un membre banni » quand le lot ne gardait que
l'ÉLECTION. Une garde partielle annoncée totale est pire qu'une garde absente :
personne ne va vérifier derrière. Ce qui est tenu, et ce qui ne l'est pas :

| ce que c'est | où | tenu ? |
|---|---|---|
| **ÉLECTION** — qui entre sous contrôle | `getPotentialControlledUsers`, `getLeastActiveParticipants` | **oui** |
| **MESURE** — quelles conversations valent un scan | le `participant.groupBy` de `getEligibleConversations` | **oui** |
| **LIVRAISON** — qui l'agent sert, juste avant de parler | `getControlledUsers`, appelé par les TROIS chemins (`reactive-handler`, `conversation-scanner`, `server.ts`) | **oui**, fail-closed |
| **le rôle déjà DÉTENU** — `AgentUserRole` au bannissement ET au départ | `releaseAgentRoleFor` (passerelle), appelé par `participant-ban-core.ts` et `leave.ts` | **oui — #20208** |
| le fil retenu sur `hasRoles` seul, donc scanné pour rien | `getEligibleConversations` | **oui — #20208** |
| l'épinglage manuel d'un ADMIN survit au bannissement | `AgentConfig.manualUserIds` | **non, par DÉCISION** — voir ci-dessous |

La LIVRAISON était le trou, et c'est un audit adversarial qui l'a ouvert : elle
ne lisait **aucune** participation — `agentUserRole.findMany({ where: {
conversationId } })` nu, puis un filtre sur la seule horloge
`User.lastActiveAt`. Donc **quiconque était élu avant son bannissement restait
animé indéfiniment**, et un **épinglage manuel** (`AgentConfig.manualUserIds`)
fabriquait un contrôlé sans lire `Participant` du tout.

> **Une garde posée sur l'ÉLECTION ne garde pas la LIVRAISON.** La question du
> cycle 202 — « qui AUTORISE ce que cette clause rend ? » — doit se poser dans
> les DEUX sens : *qui autorise ce que cette clause rend ?* **et** *cette clause
> est-elle rejouée là où l'effet se produit ?*. Et le cliquet des audiences ne
> pouvait pas voir ce trou **par construction** : un cliquet qui garde une TABLE
> ne dit rien d'un chemin qui ne l'interroge pas.

L'épinglage manuel garde exactement ce qu'il a toujours contourné —
**l'horloge d'inactivité** — jamais l'appartenance.

### Sortir quelqu'un REND son rôle (#20208)

`releaseAgentRoleFor` (`services/gateway/src/services/conversations/releaseAgentRole.ts`)
est le site UNIQUE, appelé par le bannissement **et par le départ volontaire** —
la jumelle, qui ne touchait pas davantage `AgentUserRole`.

Pourquoi ce retrait, alors que la lecture est déjà fail-closed : **écrire la
colonne rend les lectures exactes pour les lignes À VENIR, le prédicat de
lecture les rend exactes pour celles DÉJÀ EN BASE.** Ce que seul le retrait
gagne : le fil cesse d'être scanné pour rien, la place revient au vivier, et
l'administration cesse de montrer un sorti comme « contrôlé ».

Trois arbitrages, chacun avec sa raison mesurée :

- **Une SUPPRESSION, pas un champ `releasedAt`.** `AgentUserRole` porte un
  travail d'analyse (ton, catchphrases, 23 traits) — mais `AgentGlobalProfile`
  est une ligne PAR UTILISATEUR, alimentée à chaque construction de profil, et
  `getPotentialControlledUsers` la projette pour amorcer une élection neuve.
  **L'analyse survit au retrait** ; seule la liaison à CETTE conversation part.
- **Un débannissement ne ressuscite pas le rôle.** La personne redevient
  éligible à une élection, qui repartira de son profil global : elle ne
  récupère pas sa place par un geste de modération.
- **`AgentConfig.manualUserIds` reste INTACT.** Aucune fuite (la lecture le
  neutralise, fail-closed), et bannir est un geste de MODÉRATION quand
  l'épinglage est une instruction d'ADMINISTRATION : retirer silencieusement un
  id de cette liste laisserait un modérateur réécrire la configuration d'un
  administrateur. Reste un écart d'AFFICHAGE — l'administration montre un banni
  comme épinglé —, de surface et non de pouvoir.

**Best-effort, et ce qui l'autorise** : un échec du retrait ne fait pas échouer
le bannissement ni le départ, parce que la lecture d'aval est déjà fail-closed.
Sans cette garde en aval, ce best-effort serait une faute.

Pourquoi ce n'est pas une garde cosmétique : elles portaient `isActive: true`
NU, et la ligne `{ isActive: true, bannedAt ≠ null }` **existe en base** —
bannir pendant qu'une participation est inactive n'écrit que `bannedAt`
(`conversationBanState.ts` de la passerelle). La migration qui reprendrait les
lignes existantes EXISTE —
`packages/shared/prisma/migrations/2026-11-07-participant-active-and-banned.mongodb.js`
(#16690) — et n'a été exécutée **nulle part** : la population n'est donc pas
mesurée, et ce que ce § décrit est un risque instruit, pas un incident mesuré. Un membre actif-et-banni était donc éligible, et l'agent
publiait un message signé de quelqu'un d'**exclu** dans le fil dont il est
exclu. Ce n'est pas une fuite de lecture : c'est une **injection de contenu
attribuée à une personne bannie**.

Deux pièges, tous deux mesurés :

- **`bannedAt: null` seul ÉTEINT la feature.** La colonne est ABSENTE du
  document de qui n'a jamais été banni, et Prisma n'apparie pas une clé absente
  par une égalité à `null` : l'agent ne trouverait plus personne. D'où
  `unsetOrNull`, et d'où la loi PARTAGÉE plutôt qu'une transcription locale.
- **Un témoin qui compare le `where` reçu à celui qu'il attend ne vérifie que
  sa propre copie**, et passe aussi bien avec la clause juste qu'avec celle qui
  éteint tout. `src/__tests__/memory/mongo-persistence-living-participation.test.ts`
  ÉVALUE le `where` contre des documents nus (`findManyIn` / `groupByIn`, le
  **plus complet** des cinq évaluateurs de `where` du dépôt — et le seul sans
  aucune dépendance, ce pour quoi il s'importe à travers les paquets plutôt que
  de se recopier), et assert sur les utilisateurs RENDUS.

Le cliquet des audiences de la passerelle balaie désormais ce paquet
(`AUDIENCE_ROOTS`, préfixe `@meeshy/agent/`) : une quatrième lecture posée sur
`isActive` nu le fait rougir.

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

## 🗞 Archétypes de kongossa, sujets de faits divers et image du sujet lancé (#6192, 2026-09-12)

- **Archétypes** : `packages/shared/agent/archetypes.ts` en porte treize — les sept historiques et six taillés pour les faits divers et les ragots (`gossip` la commère, `chronicler` le chroniqueur, `joker` le blagueur, `diaspora`, `elder` le sage, `hustler` le débrouillard). Ces six ont des `topicsOfExpertise` REMPLIS (faits divers, kongossa, people, Cameroun, Côte d'Ivoire, Gabon, Congo, France, USA, Canada) : c'est par eux que le stratège élit qui lance un tel sujet. Leurs tons (`complice`, `journalistique`, `moqueur`, `nostalgique`, `posé`) ont chacun leur guide dans `generator.ts` (`TONE_GUIDES`) — un ton sans guide tombe sur « naturel et équilibré », donc **ajouter un ton, c'est ajouter son guide**.
- **Sujets** : `topics/seeds/initial-topics.ts` seed un sujet de faits divers par pays cible, le people d'Afrique et le buzz des réseaux, chacun avec ses motifs (villes, gentilés, indicatifs, quartiers), sa consigne (nommer le site lu) et sa requête de recherche RÉGIONALE. `TopicSeedService` insère les slugs ABSENTS à chaque boot et ne réécrit jamais un sujet existant : un sujet ajouté au seed atteint la prod, une édition admin y survit.
- **Sélection** : `rankProvocationTopics` (strategist) = occurrences regex + `AgentTopicCatalog.priority` (0-10, admin), ex æquo MÉLANGÉS avant le tri. Les faits divers sont seedés à 2, le tech à 0 : dans une conversation sans signal, ce sont eux qui partent ; une conversation qui parle clairement de Kubernetes garde le tech.
- **Image** : le fournisseur OpenAI remonte les `url_citation` de la recherche web (`LlmChatResponse.citations`) ; `generator.pickIllustration` attache la PREMIÈRE page http(s) citée au message qui OUVRE un sujet (jamais une réponse, jamais sans recherche) — `PendingMessage.illustration.sourceUrl`, transporté tel quel par `AgentResponse`. La passerelle (`services/gateway/src/services/zmq-agent/agent-illustration.ts`) résout l'image Open Graph de l'article sous garde SSRF et la joint au message ; tout refus rend un message texte. **Seule l'URL voyage** : ne jamais faire télécharger ni encoder un fichier par ce service.

---
*Dernière mise à jour: Septembre 2026*

## Pilotage & maturité (règle transverse — détail dans le `CLAUDE.md` racine)
- **Le pilotage se fait EXCLUSIVEMENT sur GitHub** (projet « Meeshy — pilotage », milestones, issues) : toute tâche de ce répertoire est une issue au titre sémantique, passée `In Progress` au démarrage et fermée par le commit qui la livre (`Closes #n`). Pas de `todo.md`, pas de page « progress » ; les artifacts servent aux brouillons, au design et aux comptes rendus — jamais à l'état.
- **Chaque feature est portée à maturité sur les treize dimensions** (sécurité, performance, mémoire, fluidité, accessibilité, cohérence de positionnement, facilité d'usage, UX, compatibilité, utilité, maintenabilité, simplicité d'usage, complétude). Ici, les témoins qui comptent d'abord : latence de réponse perçue, fenêtre de contexte bornée (mémoire), garde des prompts et des données utilisateur (sécurité), utilité MESURÉE par les analytics d'activation — le maintien de ce service est un arbitrage ouvert de la roadmap (issue `décision-produit`).
- **La complexité se paie dans le code, jamais chez l'utilisateur.** Une lenteur, une saccade, une action sans feedback immédiat sont des bugs, pas de la dette : ils ont au moins la priorité de la feature qu'ils dégradent. Le commentaire de clôture d'une issue dit quelles dimensions sont mûres et ouvre une issue par dimension restante.

## Quality Gate
Codex will review your output once you are done. Self-evaluate and ensure consistent, coherent code before marking any task as complete.
