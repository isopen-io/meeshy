// Configuration centralisée Meeshy - Variables d'environnement
// Ce fichier centralise toutes les configurations depuis .env

interface MeeshyConfig {
  // Ports et URLs
  frontend: {
    url: string;
    port: number;
  };
  backend: {
    url: string;
    port: number;
  };
  translation: {
    url: string;
    port: number;
    grpcPort: number;
    zmqPort: number;
  };
  
  // Base de données
  database: {
    url: string;
    poolSize: number;
  };
  
  // Cache Redis (optionnel)
  redis: {
    url: string;
    ttl: number;
    maxEntries: number;
  };
  
  // JWT
  jwt: {
    secret: string;
    expiresIn: string;
  };
  
  // Langues
  languages: {
    default: string;
    supported: string[];
    autoDetect: boolean;
  };
  
  // Environnement
  env: {
    nodeEnv: string;
    debug: boolean;
    logLevel: string;
  };
  
  // CORS
  cors: {
    origin: string[];
  };
}

// Fonction helper pour parser les booléens
const parseBoolean = (value: string | undefined, defaultValue: boolean = false): boolean => {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
};

// Fonction helper pour parser les arrays
const parseArray = (value: string | undefined, defaultValue: string[] = []): string[] => {
  if (!value) return defaultValue;
  return value.split(',').map(item => item.trim()).filter(Boolean);
};

// Fonction helper pour vérifier si on est côté client
const isBrowser = (): boolean => typeof window !== 'undefined';

// Fonction helper pour nettoyer les URLs
const trimSlashes = (value: string): string => value.replace(/\/$/, '');
const ensureLeadingSlash = (path: string): string => (path.startsWith('/') ? path : `/${path}`);

// Configuration principale
export const config: MeeshyConfig = {
  frontend: {
    url: process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://meeshy.me',
    port: parseInt(process.env.NEXT_PUBLIC_FRONTEND_URL?.split(':')[2] || '3100'),
  },
  
  backend: {
    url: process.env.NEXT_PUBLIC_BACKEND_URL || 'https://gate.meeshy.me',
    port: parseInt(process.env.PORT || '3000'),
  },
  
  translation: {
    url: process.env.NEXT_PUBLIC_TRANSLATION_URL || 'https://ml.meeshy.me/',
    port: parseInt(process.env.FASTAPI_PORT || '8000'),
    grpcPort: parseInt(process.env.GRPC_PORT || '50051'),
    zmqPort: parseInt(process.env.ZMQ_PORT || '5555'),
  },
  
  database: {
    url: process.env.DATABASE_URL || 'file:./dev.db',
    poolSize: parseInt(process.env.PRISMA_POOL_SIZE || '10'),
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://redis:6379',
    ttl: parseInt(process.env.TRANSLATION_CACHE_TTL || '3600'),
    maxEntries: parseInt(process.env.CACHE_MAX_ENTRIES || '10000'),
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'meeshy-dev-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  
  languages: {
    default: process.env.DEFAULT_LANGUAGE || 'fr',
    supported: parseArray(process.env.SUPPORTED_LANGUAGES, ['fr', 'en', 'es', 'de', 'pt', 'zh', 'ja', 'ar']),
    autoDetect: parseBoolean(process.env.AUTO_DETECT_LANGUAGE, true),
  },
  
  env: {
    nodeEnv: process.env.NODE_ENV || 'development',
    debug: parseBoolean(process.env.DEBUG, true),
    logLevel: process.env.LOG_LEVEL || 'info',
  },
  
  cors: {
    origin: parseArray(process.env.CORS_ORIGINS, ['https://meeshy.me']),
  },
};

// Export des configurations spécifiques pour faciliter l'usage
export const isDevelopment = config.env.nodeEnv === 'development';
export const isProduction = config.env.nodeEnv === 'production';
export const isDebug = config.env.debug;

// Fonction pour afficher la configuration (utile pour le debugging)
export const logConfig = () => {
  if (isDebug) {
  }
};

// Compatibilité avec l'ancien APP_CONFIG
export const APP_CONFIG = {
  FRONTEND_URL: config.frontend.url,
  BACKEND_URL: config.backend.url,
  FRONTEND_PORT: config.frontend.port,
  BACKEND_PORT: config.backend.port,
  
  getBackendUrl: () => {
    return getBackendUrl();
  },

  getFrontendUrl: () => {
    return getFrontendUrl();
  },

  getWebSocketUrl: () => {
    return getWebSocketUrl();
  }

};

// API Configuration for consistent API URL usage
export const API_CONFIG = {
  getApiUrl: () => {
    return `${getBackendUrl()}/api`;
  }
};

export default config;

// URLs d'API fréquemment utilisées
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    ME: '/auth/me',
    LOGOUT: '/auth/logout'
  },
  CONVERSATION: {
    LIST: '/conversations',
    CREATE: '/conversations',
    JOIN: '/conversations/join',
    LINK: '/conversations/link',
    CREATE_LINK: '/api/links',
    GET_CONVERSATION_LINKS: (conversationId: string) => `/conversations/${conversationId}/links`,
    GET_LINK_CONVERSATION: (linkId: string) => `/api/links/${linkId}/conversations`,
    MESSAGES: '/conversations/:id/messages',
    GET_GROUP_CONVERSATIONS: (groupId: string) => `/conversations/group/${groupId}`,
    CHECK_IDENTIFIER: (identifier: string) => `/conversations/check-identifier/${identifier}`,
    CHECK_LINK_IDENTIFIER: (identifier: string) => `/links/check-identifier/${identifier}`
  },
  MESSAGE: {
    LIST: '/messages/conversation',
    SEND: '/messages'
  },
  USER: {
    SEARCH: '/users/search'
  },
  GROUP: {
    LIST: '/communities',
    CREATE: '/communities',
    JOIN: '/communities/:id/join',
    LEAVE: '/communities/:id/leave',
    SEARCH: '/communities/search',
    DETAILS: (id: string) => `/communities/${id}`,
    MEMBERS: (id: string) => `/communities/${id}/members`,
    UPDATE: (id: string) => `/communities/${id}`,
    ADD_MEMBER: (groupId: string) => `/communities/${groupId}/members`,
    REMOVE_MEMBER: (groupId: string, memberId: string) => `/communities/${groupId}/members/${memberId}`,
    UPDATE_MEMBER_ROLE: (groupId: string, memberId: string) => `/communities/${groupId}/members/${memberId}/role`,
    CHECK_IDENTIFIER: (identifier: string) => `/communities/check-identifier/${identifier}`
  },
  TRACKING_LINK: {
    CREATE: '/api/tracking-links',
    CLICK: (token: string) => `/api/tracking-links/${token}/click`,
    GET: (token: string) => `/api/tracking-links/${token}`,
    STATS: (token: string) => `/api/tracking-links/${token}/stats`,
    USER_LINKS: '/api/tracking-links/user/me',
    CONVERSATION_LINKS: (conversationId: string) => `/api/tracking-links/conversation/${conversationId}`,
    DEACTIVATE: (token: string) => `/api/tracking-links/${token}/deactivate`,
    DELETE: (token: string) => `/api/tracking-links/${token}`,
    REDIRECT: (token: string) => `/l/${token}`,
    CHECK_TOKEN: (token: string) => `/api/tracking-links/check-token/${token}`
  }
};

// === FONCTIONS UNIFIÉES POUR LES URLs ===

// HTTP base URL for the Gateway - Gère automatiquement client/serveur
export const getBackendUrl = (): string => {
  if (isBrowser()) {
    // Priorité 1: Utiliser NEXT_PUBLIC_BACKEND_URL si défini (via docker-compose env)
    const envBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (envBackendUrl && !envBackendUrl.includes('__RUNTIME_')) {
      return trimSlashes(envBackendUrl);
    }

    // Priorité 2: Dériver l'URL du gateway depuis l'origine actuelle
    const hostname = window.location.hostname;

    // Si on accède via IP, utiliser HTTP direct avec port 3000 (gateway)
    // Ex: https://192.168.1.171 -> http://192.168.1.171:3000
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return trimSlashes(`http://${hostname}:3000`);
    }

    // Si on accède via un domaine, utiliser gate.{domain}
    // Ex: meeshy.local -> gate.meeshy.local, smpdev02.local -> gate.smpdev02.local
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      const gateDomain = parts[0] === 'www'
        ? `gate.${parts.slice(1).join('.')}`
        : `gate.${hostname}`;
      return trimSlashes(`${window.location.protocol}//${gateDomain}`);
    }

    // Fallback: utiliser le même protocole avec gate. prefix
    return trimSlashes(`${window.location.protocol}//gate.${hostname}`);
  }
  // Côté serveur (SSR) : utiliser INTERNAL_BACKEND_URL ou config.backend.url
  return trimSlashes(process.env.INTERNAL_BACKEND_URL || config.backend.url);
};

// HTTP base URL for the Frontend - Gère automatiquement client/serveur
export const getFrontendUrl = (): string => {
  if (isBrowser()) {
    // Côté client (navigateur) - utiliser l'URL actuelle ou NEXT_PUBLIC_FRONTEND_URL
    return trimSlashes(window.location.origin || process.env.NEXT_PUBLIC_FRONTEND_URL || config.frontend.url);
  }
  // Côté serveur (SSR) - utiliser NEXT_PUBLIC_FRONTEND_URL ou config.frontend.url
  return trimSlashes(process.env.NEXT_PUBLIC_FRONTEND_URL || config.frontend.url);
};

// WebSocket base URL for the Gateway - Gère automatiquement client/serveur
export const getWebSocketUrl = (): string => {
  if (isBrowser()) {
    // Priorité 1: Utiliser NEXT_PUBLIC_WS_URL si défini (via docker-compose env)
    const envWsUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (envWsUrl && !envWsUrl.includes('__RUNTIME_')) {
      return trimSlashes(envWsUrl);
    }

    // Priorité 2: Dériver l'URL WebSocket depuis l'origine actuelle
    const hostname = window.location.hostname;

    // Si on accède via IP, utiliser WS direct avec port 3000 (gateway)
    // Ex: https://192.168.1.171 -> ws://192.168.1.171:3000
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return trimSlashes(`ws://${hostname}:3000`);
    }

    // Si on accède via un domaine, utiliser wss://gate.{domain}
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      const gateDomain = parts[0] === 'www'
        ? `gate.${parts.slice(1).join('.')}`
        : `gate.${hostname}`;
      return trimSlashes(`${protocol}//${gateDomain}`);
    }

    // Fallback: utiliser le même protocole avec gate. prefix
    return trimSlashes(`${protocol}//gate.${hostname}`);
  }
  // Côté serveur (SSR) : utiliser INTERNAL_WS_URL ou dériver depuis backend URL
  const internalWs = process.env.INTERNAL_WS_URL;
  if (internalWs) return trimSlashes(internalWs);

  const backendUrl = getBackendUrl();
  const wsUrl = backendUrl.replace(/^http(s?):\/\//, (_m, s) => (s ? 'wss://' : 'ws://'));
  return trimSlashes(wsUrl);
};

// Helper pour construire une URL complète vers l'API Gateway
export const buildApiUrl = (endpoint: string): string => {
  // Add /api prefix for all API endpoints that don't already have it
  const apiEndpoint = endpoint.startsWith('/api/') ? endpoint : `/api${ensureLeadingSlash(endpoint)}`;

  // Route to gateway with /api prefix
  return `${getBackendUrl()}${apiEndpoint}`;
};

// Helper pour construire une URL directe vers le Gateway (sans /api prefix)
export const buildGatewayUrl = (endpoint: string): string => {
  const cleanEndpoint = ensureLeadingSlash(endpoint);
  return `${getBackendUrl()}${cleanEndpoint}`;
};

// Helper pour construire une URL WebSocket complète avec path - Version unifiée
export const buildWsUrl = (path = '/socket.io/'): string => {
  return `${getWebSocketUrl()}${ensureLeadingSlash(path)}`;
};

// Translation service URL - Gère automatiquement client/serveur
export const getTranslationUrl = (): string => {
  if (isBrowser()) {
    // Priorité 1: Utiliser NEXT_PUBLIC_TRANSLATION_URL si défini
    const envTranslationUrl = process.env.NEXT_PUBLIC_TRANSLATION_URL;
    if (envTranslationUrl && !envTranslationUrl.includes('__RUNTIME_')) {
      return trimSlashes(envTranslationUrl);
    }

    // Priorité 2: Dériver depuis l'origine actuelle
    const hostname = window.location.hostname;

    // Si on accède via IP, utiliser HTTP direct avec port 8000 (translator)
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return trimSlashes(`http://${hostname}:8000`);
    }

    // Si on accède via un domaine, utiliser ml.{domain}
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      const mlDomain = parts[0] === 'www'
        ? `ml.${parts.slice(1).join('.')}`
        : `ml.${hostname}`;
      return trimSlashes(`${window.location.protocol}//${mlDomain}`);
    }

    return trimSlashes(config.translation.url);
  }
  // Côté serveur (SSR)
  return trimSlashes(process.env.NEXT_PUBLIC_TRANSLATION_URL || config.translation.url);
};

// Static files URL - Gère automatiquement client/serveur
export const getStaticUrl = (): string => {
  if (isBrowser()) {
    // Priorité 1: Utiliser NEXT_PUBLIC_STATIC_URL si défini
    const envStaticUrl = process.env.NEXT_PUBLIC_STATIC_URL;
    if (envStaticUrl && !envStaticUrl.includes('__RUNTIME_')) {
      return trimSlashes(envStaticUrl);
    }

    // Priorité 2: Dériver depuis l'origine actuelle
    const hostname = window.location.hostname;

    // Si on accède via IP, utiliser le même host (static files servies par nginx sur port 80)
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return trimSlashes(`${window.location.origin}/static`);
    }

    // Si on accède via un domaine, utiliser static.{domain}
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      const staticDomain = parts[0] === 'www'
        ? `static.${parts.slice(1).join('.')}`
        : `static.${hostname}`;
      return trimSlashes(`${window.location.protocol}//${staticDomain}`);
    }

    return trimSlashes(`${window.location.origin}/static`);
  }
  // Côté serveur (SSR)
  return trimSlashes(process.env.NEXT_PUBLIC_STATIC_URL || 'https://static.meeshy.me');
};

// === FONCTIONS DE COMPATIBILITÉ (pour éviter les breaking changes) ===

// Helper pour construire une URL WebSocket (ancienne version)
export const buildWebSocketUrl = (path = '/socket.io/'): string => {
  return buildWsUrl(path);
};
