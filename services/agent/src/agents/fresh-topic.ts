import type { ConversationState } from '../graph/state';

export type FreshTopicCategory =
  | 'ai'
  | 'tech'
  | 'microservices'
  | 'architecture'
  | 'devops'
  | 'security'
  | 'data'
  | 'finance'
  | 'crypto'
  | 'sport'
  | 'culture'
  | 'science'
  | 'politics'
  | 'climate'
  | 'health'
  | 'news';

const CATEGORY_KEYWORDS: Record<FreshTopicCategory, RegExp> = {
  ai: /\b(ai|ia|llm|gpt|claude|chatgpt|machine\s*learning|deep\s*learning|neural|openai|anthropic)\b/i,
  tech: /\b(tech|software|developer|developpeur|coding|programmation|startup|saas|web|mobile)\b/i,
  microservices: /\b(microservice|micro-service|grpc|kafka|rabbitmq|service\s*mesh|distributed)\b/i,
  architecture: /\b(architecture|design\s*pattern|clean\s*architecture|hexagonal|ddd|cqrs|event\s*sourcing)\b/i,
  devops: /\b(devops|kubernetes|docker|terraform|ci\/cd|gitops|sre|observability|prometheus)\b/i,
  security: /\b(security|securite|cve|owasp|zero\s*day|pentest|firewall|encryption|chiffrement)\b/i,
  data: /\b(data|database|sql|nosql|warehouse|analytics|big\s*data|etl|spark|airflow)\b/i,
  finance: /\b(finance|bourse|trading|stock|action|investissement|economie|economy|fed|bce)\b/i,
  crypto: /\b(crypto|bitcoin|btc|ethereum|eth|defi|nft|web3|blockchain)\b/i,
  sport: /\b(sport|foot|football|basket|tennis|nba|ligue|championnat|olympic|olympique)\b/i,
  culture: /\b(film|cinema|musique|music|serie|netflix|livre|book|art|theatre)\b/i,
  science: /\b(science|recherche|research|physique|chimie|biologie|nasa|esa|espace|space)\b/i,
  politics: /\b(politique|politic|election|gouvernement|government|president|congress|assemblee)\b/i,
  climate: /\b(climat|climate|environnement|environment|cop|carbone|renewable|renouvelable)\b/i,
  health: /\b(sante|health|medecine|medicine|hopital|hospital|maladie|disease|vaccin)\b/i,
  news: /\b(actualite|news|info|breaking|alerte|world|monde)\b/i,
};

const CATEGORY_SEARCH_HINTS: Record<FreshTopicCategory, (now: Date) => string> = {
  ai: (d) => `latest AI breakthroughs ${d.getUTCFullYear()} week ${weekNumber(d)} (LLM, agents, OpenAI, Anthropic)`,
  tech: (d) => `hot tech news ${d.getUTCFullYear()} this week (startups, products, releases)`,
  microservices: () => `latest microservices architecture trends and incidents (service mesh, gRPC, observability)`,
  architecture: () => `current software architecture debates (modular monolith vs microservices, hexagonal, DDD)`,
  devops: () => `recent devops/SRE news (Kubernetes releases, major incidents, tooling updates)`,
  security: (d) => `latest CVEs and security incidents ${d.getUTCFullYear()} (zero-days, breaches, OWASP)`,
  data: () => `hot data engineering news (databases, warehouses, AI x data, recent releases)`,
  finance: (d) => `markets and finance highlights this week ${d.getUTCFullYear()} (Fed, stocks, macro)`,
  crypto: () => `crypto market and ecosystem news this week (BTC, ETH, DeFi, regulation)`,
  sport: (d) => `top sports headlines this week ${d.getUTCFullYear()}`,
  culture: () => `cultural highlights this week (films, music releases, viral)`,
  science: () => `recent science breakthroughs this week (space, physics, biology)`,
  politics: () => `top political news this week (international, geopolitics)`,
  climate: () => `climate and environment news this week (policy, incidents, breakthroughs)`,
  health: () => `health and medicine news this week (research, public health alerts)`,
  news: () => `top world news headlines today`,
};

function weekNumber(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const diff = d.getTime() - start;
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
}

export function inferConversationCategories(state: ConversationState): FreshTopicCategory[] {
  const haystack = [
    state.conversationTitle,
    state.conversationDescription,
    state.agentInstructions,
    ...state.messages.slice(-15).map((m) => m.content),
  ].filter(Boolean).join(' ');

  const hits = new Set<FreshTopicCategory>();
  for (const [cat, re] of Object.entries(CATEGORY_KEYWORDS) as [FreshTopicCategory, RegExp][]) {
    if (re.test(haystack)) hits.add(cat);
  }
  return [...hits];
}

export function resolveFreshTopicCategories(state: ConversationState): FreshTopicCategory[] {
  const hints = (state.freshTopicCategoryHints ?? [])
    .map((h) => h.trim().toLowerCase())
    .filter((h): h is FreshTopicCategory => h in CATEGORY_KEYWORDS);

  if (hints.length > 0) return hints;

  const inferred = inferConversationCategories(state);
  return inferred.length > 0 ? inferred : ['news'];
}

export function pickFreshTopicSearchHint(categories: FreshTopicCategory[]): { category: FreshTopicCategory; searchHint: string } {
  const category = categories[Math.floor(Math.random() * categories.length)];
  const searchHint = CATEGORY_SEARCH_HINTS[category](new Date());
  return { category, searchHint };
}

export function shouldInjectFreshTopic(state: ConversationState): boolean {
  if (!state.webSearchEnabled) return false;
  const p = state.freshTopicProbability ?? 0.2;
  if (p <= 0) return false;
  if (p >= 1) return true;
  return Math.random() < p;
}

export function buildFreshTopicBlock(category: FreshTopicCategory, searchHint: string): string {
  return `
===== MODE SUJET NEUF (ACTIVE CE CYCLE) =====
La conversation a besoin d'air frais ; le tirage probabiliste a active ce mode.
CONTRAINTES OBLIGATOIRES pour ce cycle:
- Tu DOIS proposer EXACTEMENT 1 intervention de type "message" dans la categorie "${category}"
- Cette intervention DOIT avoir needsWebSearch: true
- Cette intervention DOIT avoir searchHint: "${searchHint.replace(/"/g, "'")}"
- Le sujet doit etre TRES recent (cette semaine si possible) et LIE au theme de la conversation
- Choisis un utilisateur dont les topicsOfExpertise matchent le mieux la categorie "${category}", sinon prends celui qui n'a pas parle aujourd'hui
- delayCategory: "short" ou "medium" pour simuler quelqu'un qui lit l'actu et la partage
- topicCategory: "${category}"
- replyToMessageId: null (c'est un nouveau sujet)
- Les autres interventions (reactions, replies) restent normales et viennent en plus
===== FIN MODE SUJET NEUF =====
`;
}
