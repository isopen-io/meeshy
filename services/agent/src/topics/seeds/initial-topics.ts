/**
 * Source de seed pour AgentTopicCatalog. Inséré par TopicSeedService au boot
 * si le catalogue est vide. Reflète 1:1 les 13 thèmes hardcodés actuels du
 * strategist (THEME_PATTERNS + HINT_TO_THEME + buildTopicProvocationHint) —
 * la migration ne perd aucune capacité.
 *
 * Modifier ce fichier ne re-seed PAS automatiquement (idempotent). Pour
 * mettre à jour les topics existants en prod, passer par l'admin UI.
 */

export type InitialTopicSeed = {
  slug: string;
  label: string;
  description: string;
  keywordPatterns: string[];
  instructionTemplate: string;
  searchHintTemplate: string;
  examples: string[];
  cooldownMinutes: number;
};

export const INITIAL_TOPICS: InitialTopicSeed[] = [
  {
    slug: 'ai_tech',
    label: 'IA & LLM',
    description: 'Intelligence artificielle, modèles de langage, agents, providers (OpenAI, Anthropic, Mistral).',
    keywordPatterns: [
      '\\b(ia|ai|gpt|llm|claude|gemini|anthropic|openai|prompt|model|chatgpt|mistral|huggingface)\\b',
      '\\b(machine[\\s-]?learning|deep[\\s-]?learning|transformer|rag|agentic|embedding|fine[\\s-]?tuning)\\b',
    ],
    instructionTemplate: 'Cette conversation gravite autour de l\'IA / LLM ({{label}}). Lance un NOUVEAU sujet AUTOUR d\'une actualite chaude IA (nouveau modele, benchmark, levee de fonds, debat ethique, agent autonome).',
    searchHintTemplate: 'actualite IA LLM cette semaine',
    examples: ['Nouveau modèle Claude 4.7', 'Anthropic vs OpenAI sur l\'alignement'],
    cooldownMinutes: 60,
  },
  {
    slug: 'microservices',
    label: 'Microservices & Architecture distribuée',
    description: 'Kubernetes, Docker, service mesh, observabilité, patterns distribués.',
    keywordPatterns: [
      '\\b(microservice|kubernetes|k8s|docker|kafka|grpc|service[\\s-]?mesh|istio)\\b',
      '\\b(distribu(?:e|é)|message[\\s-]?broker|saga|event[\\s-]?driven|api[\\s-]?gateway|terraform|helm|prometheus|grafana|observability|monolith)\\b',
    ],
    instructionTemplate: 'Cette conversation porte sur l\'architecture distribuee / microservices ({{label}}). Lance un NOUVEAU sujet (release Kubernetes, retour d\'experience recent, debat distribue vs monolithe, observabilite, new pattern).',
    searchHintTemplate: 'microservices kubernetes actualite tendance',
    examples: ['Kubernetes 1.32', 'Service mesh : Istio vs Linkerd'],
    cooldownMinutes: 90,
  },
  {
    slug: 'web_dev',
    label: 'Développement web',
    description: 'React, Next.js, Vue, frontend/backend frameworks, bundlers.',
    keywordPatterns: [
      '\\b(react|next\\.?js|vue|svelte|angular|typescript|javascript|node\\.?js|fastify|express|tailwind|frontend|backend|fullstack|webpack|vite|deno|bun)\\b',
    ],
    instructionTemplate: 'Conversation web/frontend/backend ({{label}}). Lance un NOUVEAU sujet (release framework, retour d\'experience, debat outillage, performance).',
    searchHintTemplate: 'actualite developpement web framework',
    examples: ['React 20 RSC', 'Bun 2.0 vs Node 24'],
    cooldownMinutes: 60,
  },
  {
    slug: 'mobile_dev',
    label: 'Développement mobile',
    description: 'iOS, Android, React Native, Flutter, App Store policies.',
    keywordPatterns: [
      '\\b(swift|swiftui|kotlin|jetpack|android|ios|react[\\s-]?native|flutter|xcode|appstore|playstore)\\b',
    ],
    instructionTemplate: 'Conversation mobile iOS/Android ({{label}}). Lance un NOUVEAU sujet (release OS, framework, App Store policy, retour d\'experience).',
    searchHintTemplate: 'actualite developpement mobile iOS Android',
    examples: ['iOS 27 Liquid Glass', 'Flutter 4 et Impeller'],
    cooldownMinutes: 60,
  },
  {
    slug: 'cybersecurity',
    label: 'Cybersécurité',
    description: 'CVE, pentest, breach, zero-day, ransomware, OWASP.',
    keywordPatterns: [
      '\\b(s(?:e|é)curit(?:e|é)|cybers(?:e|é)curit(?:e|é)|pentest|cve|vuln(?:e|é)rabilit(?:e|é)|ransomware|phishing|zero[\\s-]?day|exploit|hacker|cisa|crypto[\\s-]?graphy)\\b',
    ],
    instructionTemplate: 'Conversation cybersecurite ({{label}}). Lance un NOUVEAU sujet (CVE recente, breach, retour pentest, debat zero-trust).',
    searchHintTemplate: 'actualite cybersecurite CVE breach',
    examples: ['CVE-2026-XXXX critical', 'Breach Cloudflare'],
    cooldownMinutes: 90,
  },
  {
    slug: 'data_science',
    label: 'Data science & Analytics',
    description: 'Big data, Spark, datalake, ETL, BI.',
    keywordPatterns: [
      '\\b(data[\\s-]?science|big[\\s-]?data|spark|hadoop|pandas|numpy|jupyter|datalake|warehouse|etl|bi|analytics|tableau|powerbi)\\b',
    ],
    instructionTemplate: 'Conversation data science / analytics ({{label}}). Lance un NOUVEAU sujet (release outil, tendance pipeline, retour d\'experience datalake).',
    searchHintTemplate: 'actualite data science analytics',
    examples: ['DuckDB 2.0', 'Snowflake vs Databricks'],
    cooldownMinutes: 60,
  },
  {
    slug: 'sports',
    label: 'Sports',
    description: 'Football, basket, tennis, JO, F1.',
    keywordPatterns: [
      '\\b(football|sport|match|(?:e|é)quipe|joueur|coupe|tournoi|psg|ligue|nba|formula|tennis|olympique|f1|rugby|jo|basket)\\b',
    ],
    instructionTemplate: 'Conversation sport ({{label}}). Lance un NOUVEAU sujet (resultat recent, transfert, evenement a venir).',
    searchHintTemplate: 'actualite sport resultats recents',
    examples: ['Mbappé record', 'Wimbledon final'],
    cooldownMinutes: 60,
  },
  {
    slug: 'science',
    label: 'Science',
    description: 'Découvertes, biologie, physique, espace, NASA, fusion.',
    keywordPatterns: [
      '\\b(science|recherche|(?:e|é)tude|chercheur|d(?:e|é)couverte|biologie|chimie|physique|espace|nasa|spacex|astronome|quantum|fusion)\\b',
    ],
    instructionTemplate: 'Conversation science ({{label}}). Lance un NOUVEAU sujet (decouverte recente, mission spatiale, debat).',
    searchHintTemplate: 'decouverte scientifique recente',
    examples: ['Mission lunaire Artemis 3', 'Fusion ITER première'],
    cooldownMinutes: 60,
  },
  {
    slug: 'business',
    label: 'Business & Finance',
    description: 'Startups, levée, crypto, bourse, IPO.',
    keywordPatterns: [
      '\\b(business|startup|investissement|lev(?:e|é)e|crypto|bitcoin|ethereum|bourse|action|trading|(?:e|é)conomie|finance|march(?:e|é)|ipo|fonds)\\b',
    ],
    instructionTemplate: 'Conversation business/finance ({{label}}). Lance un NOUVEAU sujet (levee, mouvement marche, tendance crypto, IPO).',
    searchHintTemplate: 'actualite business startup finance tendance',
    examples: ['Mistral IPO', 'BTC 200k$'],
    cooldownMinutes: 60,
  },
  {
    slug: 'gaming',
    label: 'Gaming',
    description: 'Sorties jeux, esport, consoles, Twitch.',
    keywordPatterns: [
      '\\b(jeu[x]?\\s|gaming|playstation|xbox|nintendo|steam|esport|twitch|gamer|ps5|switch)\\b',
    ],
    instructionTemplate: 'Conversation gaming ({{label}}). Lance un NOUVEAU sujet (sortie jeu, drama studio, esport).',
    searchHintTemplate: 'actualite gaming sortie jeu',
    examples: ['GTA VI gameplay leak', 'Worlds finals LoL'],
    cooldownMinutes: 60,
  },
  {
    slug: 'culture',
    label: 'Culture & Loisirs',
    description: 'Films, musique, séries, Netflix, cinéma.',
    keywordPatterns: [
      '\\b(film|musique|s(?:e|é)rie|netflix|spotify|concert|album|cin(?:e|é)ma|artiste|festival|livre|roman|disney|prime[\\s-]?video)\\b',
    ],
    instructionTemplate: 'Conversation culture ({{label}}). Lance un NOUVEAU sujet (sortie film, album, serie a debattre).',
    searchHintTemplate: 'sortie cinema musique serie recente',
    examples: ['Dune 3 trailer', 'Album surprise Taylor Swift'],
    cooldownMinutes: 60,
  },
  {
    slug: 'politics',
    label: 'Politique',
    description: 'Élections, gouvernement, président, assemblée.',
    keywordPatterns: [
      '\\b(politique|(?:e|é)lection|gouvernement|pr(?:e|é)sident|ministre|assembl(?:e|é)e|parti|d(?:e|é)putes?|s(?:e|é)nat|loi)\\b',
    ],
    instructionTemplate: 'Conversation politique ({{label}}). Lance un NOUVEAU sujet en lien avec une actualite politique chaude. Reste factuel, evite la polemique gratuite.',
    searchHintTemplate: 'actualite politique recente',
    examples: ['Réforme constitutionnelle', 'Élection US débat'],
    cooldownMinutes: 120,
  },
  {
    slug: 'general_news',
    label: 'Actualités générales',
    description: 'Catch-all : actualité monde, société, événement.',
    keywordPatterns: [
      '\\b(actualit(?:e|é)|news|info|monde|soci(?:e|é)t(?:e|é)|(?:e|é)v(?:e|é)nement)\\b',
    ],
    instructionTemplate: 'Lance un NOUVEAU sujet autour d\'une actualite chaude generale ({{label}}) susceptible d\'interesser les participants.',
    searchHintTemplate: 'actualite hot du moment',
    examples: ['Manifestation Paris', 'Catastrophe naturelle Pacific'],
    cooldownMinutes: 60,
  },
];
