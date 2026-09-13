/**
 * Source de seed pour AgentTopicCatalog. TopicSeedService insère au boot les
 * slugs ABSENTS du catalogue (#6192) : un sujet ajouté ici atteint une base
 * déjà seedée, sans jamais réécrire un sujet que l'admin a édité.
 *
 * Les 13 premiers reflètent 1:1 les thèmes historiques du strategist ; les
 * suivants sont les faits divers et ragots par pays (Cameroun, Côte d'Ivoire,
 * Gabon, Congo, France, USA, Canada), le people d'Afrique et le buzz réseaux —
 * avec une `priority` > 0 pour qu'ils l'emportent sur les sujets tech dans une
 * conversation sans signal.
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
  /// S'ajoute au score regex à la sélection (0-10). Cf. strategist.rankProvocationTopics.
  priority: number;
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
    priority: 0,
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
    priority: 0,
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
    priority: 0,
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
    priority: 0,
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
    priority: 0,
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
    priority: 0,
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
    priority: 0,
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
    priority: 0,
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
    priority: 0,
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
    priority: 0,
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
    priority: 0,
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
    priority: 0,
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
    priority: 0,
  },
  {
    slug: 'faits_divers_cameroun',
    label: 'Faits divers Cameroun',
    description: 'Kongossa du 237 : Douala, Yaoundé, Bafoussam, Bamenda — arrestations insolites, scandales, histoires de quartier.',
    keywordPatterns: [
      '\\b(cameroun|camerounais(?:e|es)?|douala|yaound(?:e|é)|bafoussam|bamenda|garoua|kribi|bu(?:e|é)a|maroua|bertoua|ngaound(?:e|é)r(?:e|é))\\b',
      '\\b(237|mboa|mbeng|kongossa|kmer|bonab(?:e|é)ri|akwa|bonamoussadi|bastos|mvog[\\s-]?ada|mokolo)\\b',
    ],
    instructionTemplate: 'Kongossa du Cameroun ({{label}}). Lance un NOUVEAU sujet à partir d\'un fait divers ou d\'un ragot RÉCENT lu sur un site camerounais (Camerounweb, Actu Cameroun, CamerounInfo, Mimi Mefo Info, Le Bled Parle, Journal du Cameroun) : arrestation insolite, scandale, buzz de Douala ou Yaoundé, histoire de quartier ou de famille. Raconte-le comme quelqu\'un qui vient de le lire sur son téléphone, nomme le site en passant, et lance la discussion.',
    searchHintTemplate: 'faits divers Cameroun cette semaine Douala Yaoundé kongossa',
    examples: ['Un faux pasteur arrêté à Douala', 'Bagarre au marché Mokolo pour une place', 'Le mariage annulé de Bonabéri'],
    cooldownMinutes: 180,
    priority: 2,
  },
  {
    slug: 'faits_divers_cote_ivoire',
    label: "Faits divers Côte d'Ivoire",
    description: "Abidjan, Yopougon, Cocody, Bouaké, Yamoussoukro — les histoires qui font parler la Côte d'Ivoire.",
    keywordPatterns: [
      '\\b(c(?:o|ô)te[\\s-]?d[\\s\'’]?ivoire|ivoirien(?:ne|s|nes)?|abidjan|yamoussoukro|bouak(?:e|é)|san[\\s-]?p(?:e|é)dro|korhogo|daloa|man)\\b',
      '\\b(225|cocody|yopougon|treichville|marcory|abobo|adjam(?:e|é)|plateau|koumassi|grand[\\s-]?bassam|babi)\\b',
    ],
    instructionTemplate: "Faits divers de Côte d'Ivoire ({{label}}). Lance un NOUVEAU sujet à partir d'un fait divers ou d'un ragot RÉCENT lu sur un site ivoirien (Abidjan.net, Koaci, Linfodrome, Fratmat, AIP, Yeclo) : histoire de quartier à Yopougon ou Cocody, arnaque, buzz, scandale, fait insolite à Bouaké ou San-Pédro. Raconte-le comme un habitué du groupe qui vient de tomber dessus, nomme le site en passant, et lance la discussion.",
    searchHintTemplate: "faits divers Côte d'Ivoire cette semaine Abidjan",
    examples: ['Un gbaka renversé à Adjamé', 'Le voisin de Yopougon et son deuxième mariage', 'Arnaque au faux visa canadien à Cocody'],
    cooldownMinutes: 180,
    priority: 2,
  },
  {
    slug: 'faits_divers_gabon',
    label: 'Faits divers Gabon',
    description: 'Libreville, Port-Gentil, Franceville, Oyem — les faits divers et ragots du Gabon.',
    keywordPatterns: [
      '\\b(gabon|gabonais(?:e|es)?|libreville|port[\\s-]?gentil|franceville|oyem|lambar(?:e|é)n(?:e|é)|mouila|akanda|owendo|241|nkembo|pk\\d+)\\b',
    ],
    instructionTemplate: "Faits divers du Gabon ({{label}}). Lance un NOUVEAU sujet à partir d'un fait divers ou d'un ragot RÉCENT lu sur un site gabonais (Gabonreview, GabonMediaTime, L'Union, Gabonactu, Info241) : histoire de quartier à Libreville, affaire à Port-Gentil, buzz, scandale, fait insolite. Raconte-le comme quelqu'un qui vient de le lire, nomme le site en passant, et lance la discussion.",
    searchHintTemplate: 'faits divers Gabon cette semaine Libreville',
    examples: ['Coupure d\'eau et bagarre au PK8', 'Le taxi-bus de Libreville filmé en live', 'Un notable de Port-Gentil rattrapé par une affaire'],
    cooldownMinutes: 180,
    priority: 2,
  },
  {
    slug: 'faits_divers_congo',
    label: 'Faits divers Congo (Kinshasa & Brazzaville)',
    description: 'Les deux rives : Kinshasa, Lubumbashi, Goma, Brazzaville, Pointe-Noire — faits divers, ambiance et ragots.',
    keywordPatterns: [
      '\\b(congo|congolais(?:e|es)?|rdc|kinshasa|kin|brazzaville|brazza|lubumbashi|goma|bukavu|kisangani|matadi|pointe[\\s-]?noire|dolisie)\\b',
      '\\b(243|242|gombe|limete|masina|ngaliema|bandal(?:ungwa)?|kintambo|poto[\\s-]?poto|bacongo|moungali)\\b',
    ],
    instructionTemplate: "Faits divers du Congo, les deux rives ({{label}}). Lance un NOUVEAU sujet à partir d'un fait divers ou d'un ragot RÉCENT lu sur un site congolais (Actualite.cd, 7sur7.cd, Radio Okapi, Mediacongo, Les Dépêches de Brazzaville, Vox Congo) : histoire de commune à Kinshasa, ambiance de Brazzaville, buzz, arnaque, fait insolite à Lubumbashi ou Pointe-Noire. Raconte-le comme quelqu'un qui vient de le lire, nomme le site en passant, et lance la discussion.",
    searchHintTemplate: 'faits divers Congo Kinshasa Brazzaville cette semaine',
    examples: ['Un shégué devenu star de TikTok à Masina', 'Le pasteur de Limete et la Jeep offerte', 'Embouteillage record sur le boulevard du 30 juin'],
    cooldownMinutes: 180,
    priority: 2,
  },
  {
    slug: 'faits_divers_france',
    label: 'Faits divers France',
    description: 'Paris, Marseille, Lyon, la banlieue — les faits divers qui tournent en France et dans la diaspora.',
    keywordPatterns: [
      '\\b(france|fran(?:c|ç)ais(?:e|es)?|paris|parisien(?:ne|s)?|marseille|lyon|lille|toulouse|bordeaux|nantes|strasbourg|montpellier|nice)\\b',
      '\\b(banlieue|93|sarcelles|(?:e|é)vry|cr(?:e|é)teil|saint[\\s-]?denis|ch(?:a|â)teau[\\s-]?rouge|rer|sncf|ratp|pr(?:e|é)fecture|titre de s(?:e|é)jour)\\b',
    ],
    instructionTemplate: "Faits divers de France ({{label}}). Lance un NOUVEAU sujet à partir d'un fait divers RÉCENT lu sur un site français (BFMTV, Le Parisien, 20 Minutes, Actu.fr, France Bleu, Ouest-France) : histoire insolite, affaire de quartier, transport, préfecture, buzz, fait qui parle à la diaspora africaine. Raconte-le comme quelqu'un qui vient de le lire dans le métro, nomme le site en passant, et lance la discussion.",
    searchHintTemplate: 'faits divers France cette semaine insolite',
    examples: ['Un colis suspect à Château-Rouge : c\'était du poisson fumé', 'Grève RER B le jour du mariage', 'Le maire qui a interdit les barbecues'],
    cooldownMinutes: 120,
    priority: 2,
  },
  {
    slug: 'faits_divers_usa',
    label: 'Faits divers USA',
    description: 'New York, Atlanta, Texas, Floride — les histoires américaines qui font le tour du monde.',
    keywordPatterns: [
      '\\b(usa|(?:e|é)tats[\\s-]?unis|am(?:e|é)ricain(?:e|s|es)?|america|new[\\s-]?york|nyc|texas|florid[ae]|los[\\s-]?angeles|atlanta|chicago|houston|miami|washington|dallas|maryland)\\b',
      '\\b(florida[\\s-]?man|police am(?:e|é)ricaine|tiktok am(?:e|é)ricain|walmart|uber|green[\\s-]?card|dv[\\s-]?lottery)\\b',
    ],
    instructionTemplate: "Faits divers des USA ({{label}}). Lance un NOUVEAU sujet à partir d'un fait divers RÉCENT lu sur un site américain (AP News, CNN, NY Post, NBC, Fox, local news) : histoire insolite façon « Florida man », affaire qui buzze, fait qui touche la diaspora africaine d'Atlanta, du Maryland ou de New York. Raconte-le en français comme quelqu'un qui vient de le voir passer, nomme le site en passant, et lance la discussion.",
    searchHintTemplate: 'faits divers USA cette semaine insolite news',
    examples: ['Un homme du Texas paie son amende en pièces de 1 cent', 'La mariée d\'Atlanta qui a annulé sur TikTok', 'Un alligator dans un Walmart de Floride'],
    cooldownMinutes: 120,
    priority: 2,
  },
  {
    slug: 'faits_divers_canada',
    label: 'Faits divers Canada',
    description: 'Montréal, Québec, Toronto, Ottawa — l\'hiver, le loyer, les histoires du Canada vues par la diaspora.',
    keywordPatterns: [
      '\\b(canada|canadien(?:ne|s|nes)?|qu(?:e|é)bec|qu(?:e|é)b(?:e|é)cois(?:e|es)?|montr(?:e|é)al|toronto|ottawa|vancouver|laval|gatineau|sherbrooke|calgary|edmonton)\\b',
      '\\b(tva|radio[\\s-]?canada|cbc|stm|hydro[\\s-]?qu(?:e|é)bec|tim[\\s-]?hortons?|csq|pvt|immigration canada|hiver canadien)\\b',
    ],
    instructionTemplate: "Faits divers du Canada ({{label}}). Lance un NOUVEAU sujet à partir d'un fait divers RÉCENT lu sur un site canadien (TVA Nouvelles, Journal de Montréal, Radio-Canada, CBC, La Presse) : histoire insolite de l'hiver, loyer, immigration, buzz de Montréal ou Toronto, fait qui parle à la diaspora africaine. Raconte-le comme quelqu'un qui vient de le lire au chaud, nomme le site en passant, et lance la discussion.",
    searchHintTemplate: 'faits divers Canada cette semaine Montréal Québec',
    examples: ['Un orignal bloque l\'autoroute 40', 'Le loyer d\'un 3½ à Montréal fait pleurer', 'Première tempête de neige : les Africains de Laval témoignent'],
    cooldownMinutes: 120,
    priority: 2,
  },
  {
    slug: 'people_afrique',
    label: 'People & célébrités d\'Afrique',
    description: 'Artistes, influenceurs, mariages, clashs — le people d\'Afrique francophone et de sa diaspora.',
    keywordPatterns: [
      '\\b(c(?:e|é)l(?:e|é)brit(?:e|é)s?|people|star|artiste|chanteu(?:r|se)|rappeu(?:r|se)|influenceu(?:r|se)|acteur|actrice|clash|mariage|divorce|fian(?:c|ç)ailles)\\b',
      '\\b(coup(?:e|é)[\\s-]?d(?:e|é)cal(?:e|é)|afrobeats?|bikutsi|makossa|ndombolo|rumba|zouglou|amapiano|nollywood|mbol(?:e|é)|concert|album|clip|feat)\\b',
    ],
    instructionTemplate: "People d'Afrique ({{label}}). Lance un NOUVEAU sujet à partir d'un ragot ou d'une actualité people RÉCENTE lue sur un site spécialisé (Life Mag, Afrik.com, Abidjanshow, Camerounweb Divertissement, Mbote, Jeune Afrique Culture) : mariage, clash entre artistes, nouveau clip, influenceur pris en flagrant délit, rumeur de couple. Raconte-le comme quelqu'un qui partage le kongossa du jour, nomme le site en passant, et lance la discussion.",
    searchHintTemplate: 'people Afrique cette semaine artiste clash mariage',
    examples: ['Le clash entre deux rappeurs de Douala', 'L\'influenceuse d\'Abidjan et le faux Dubaï', 'Mariage surprise d\'une star du coupé-décalé'],
    cooldownMinutes: 120,
    priority: 2,
  },
  {
    slug: 'buzz_reseaux',
    label: 'Buzz des réseaux sociaux',
    description: 'TikTok, Facebook, WhatsApp — la vidéo virale, le live qui a mal tourné, le mème du jour.',
    keywordPatterns: [
      '\\b(tiktok|tik[\\s-]?tok|facebook|fb|instagram|insta|twitter|x\\.com|whatsapp|snap(?:chat)?|youtube|youtubeu(?:r|se)|tiktokeu(?:r|se))\\b',
      '\\b(buzz|viral(?:e)?|vid(?:e|é)o|live|story|capture|m(?:e|è)me|challenge|trend|hashtag|bad[\\s-]?buzz)\\b',
    ],
    instructionTemplate: "Buzz des réseaux ({{label}}). Lance un NOUVEAU sujet à partir d'un buzz RÉCENT (vidéo virale, live qui a mal tourné, challenge, capture d'écran qui tourne) repéré sur un site qui relaie les buzz d'Afrique francophone et de la diaspora. Raconte-le comme quelqu'un qui vient de le voir passer sur son fil, nomme d'où ça vient, et lance la discussion.",
    searchHintTemplate: 'buzz TikTok Facebook Afrique cette semaine vidéo virale',
    examples: ['Le live du mariage qui a tourné en bagarre', 'Le challenge qui a envahi Douala et Abidjan', 'La capture WhatsApp qui a fait le tour du pays'],
    cooldownMinutes: 90,
    priority: 1,
  },
];
