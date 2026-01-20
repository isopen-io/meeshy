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

// Fonction helper pour détecter le mode de déploiement
// - "local": Dev local (make start/start-network) → localhost:port ou IP:port
// - "docker": Docker compose → noms de services (gateway:port, translator:port)
// - "production": Production → domaines (gate.meeshy.me, etc.)
const getDeploymentMode = (): 'local' | 'docker' | 'production' => {
  const mode = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE || process.env.DEPLOYMENT_MODE;
  if (mode === 'docker') return 'docker';
  if (mode === 'production') return 'production';
  // Par défaut, en dev, on est en mode "local"
  return process.env.NODE_ENV === 'production' ? 'production' : 'local';
};

// Fonction helper pour nettoyer les URLs
const trimSlashes = (value: string): string => value.replace(/\/$/, '');
const ensureLeadingSlash = (path: string): string => (path.startsWith('/') ? path : `/${path}`);

// API Version - aligned with iOS EnvironmentConfig and gateway
export const API_VERSION = 'v1';
export const API_PATH = `/api/${API_VERSION}`;

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
    return `${getBackendUrl()}${API_PATH}`;
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
    // Priorité 1: Utiliser NEXT_PUBLIC_BACKEND_URL si défini explicitement
    const envBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (envBackendUrl && !envBackendUrl.includes('__RUNTIME_')) {
      return trimSlashes(envBackendUrl);
    }

    const deploymentMode = getDeploymentMode();
    const hostname = window.location.hostname;

    // MODE LOCAL (make start/start-network): toujours utiliser localhost:port ou IP:port
    if (deploymentMode === 'local') {
      // Si on accède via IP, utiliser IP:3000
      if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
        return trimSlashes(`http://${hostname}:3000`);
      }
      // Sinon, toujours utiliser localhost:3000 (même si hostname = meeshy.local)
      return trimSlashes('http://localhost:3000');
    }

    // MODE DOCKER: utiliser le nom du service gateway
    if (deploymentMode === 'docker') {
      // En Docker, le frontend accède au gateway via le nom de service
      return trimSlashes('http://gateway:3000');
    }

    // MODE PRODUCTION: utiliser les sous-domaines
    // Si on accède via IP ou localhost, utiliser HTTP direct avec port 3000
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname === 'localhost') {
      return trimSlashes(`http://${hostname}:3000`);
    }

    // Si on accède via un domaine, utiliser gate.{domain}
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      const gateDomain = parts[0] === 'www'
        ? `gate.${parts.slice(1).join('.')}`
        : `gate.${hostname}`;
      return trimSlashes(`${window.location.protocol}//${gateDomain}`);
    }

    // Fallback
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
    // Priorité 1: Utiliser NEXT_PUBLIC_WS_URL si défini explicitement
    const envWsUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (envWsUrl && !envWsUrl.includes('__RUNTIME_')) {
      return trimSlashes(envWsUrl);
    }

    const deploymentMode = getDeploymentMode();
    const hostname = window.location.hostname;

    // MODE LOCAL (make start/start-network): toujours utiliser ws://localhost:port ou ws://IP:port
    if (deploymentMode === 'local') {
      // Si on accède via IP, utiliser ws://IP:3000
      if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
        return trimSlashes(`ws://${hostname}:3000`);
      }
      // Sinon, toujours utiliser ws://localhost:3000 (même si hostname = meeshy.local)
      return trimSlashes('ws://localhost:3000');
    }

    // MODE DOCKER: utiliser le nom du service gateway
    if (deploymentMode === 'docker') {
      // En Docker, le frontend accède au gateway via le nom de service
      return trimSlashes('ws://gateway:3000');
    }

    // MODE PRODUCTION: utiliser les sous-domaines
    // Si on accède via IP ou localhost, utiliser WS direct avec port 3000
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname === 'localhost') {
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

    // Fallback
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
  // Handle endpoints that already have full /api/vX path
  if (endpoint.startsWith('/api/v')) {
    return `${getBackendUrl()}${endpoint}`;
  }

  // Handle endpoints with /api/ prefix but no version - add version
  if (endpoint.startsWith('/api/')) {
    const pathWithoutApi = endpoint.substring(4); // Remove '/api'
    return `${getBackendUrl()}${API_PATH}${pathWithoutApi}`;
  }

  // Add full /api/v1 prefix for endpoints without it
  return `${getBackendUrl()}${API_PATH}${ensureLeadingSlash(endpoint)}`;
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
    // Priorité 1: Utiliser NEXT_PUBLIC_TRANSLATION_URL si défini explicitement
    const envTranslationUrl = process.env.NEXT_PUBLIC_TRANSLATION_URL;
    if (envTranslationUrl && !envTranslationUrl.includes('__RUNTIME_')) {
      return trimSlashes(envTranslationUrl);
    }

    const deploymentMode = getDeploymentMode();
    const hostname = window.location.hostname;

    // MODE LOCAL (make start/start-network): toujours utiliser localhost:port ou IP:port
    if (deploymentMode === 'local') {
      // Si on accède via IP, utiliser http://IP:8000
      if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
        return trimSlashes(`http://${hostname}:8000`);
      }
      // Sinon, toujours utiliser localhost:8000 (même si hostname = meeshy.local)
      return trimSlashes('http://localhost:8000');
    }

    // MODE DOCKER: utiliser le nom du service translator
    if (deploymentMode === 'docker') {
      // En Docker, le frontend accède au translator via le nom de service
      return trimSlashes('http://translator:8000');
    }

    // MODE PRODUCTION: utiliser les sous-domaines
    // Si on accède via IP, utiliser HTTP direct avec port 8000
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
  // Côté serveur (SSR/BFF) - utiliser INTERNAL_TRANSLATION_URL pour les appels internes Docker
  return trimSlashes(process.env.INTERNAL_TRANSLATION_URL || process.env.NEXT_PUBLIC_TRANSLATION_URL || config.translation.url);
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
