// Types globaux pour corriger les problèmes de compilation

declare global {
  // Extension des types de Fastify Logger
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV?: string;
      PORT?: string;
      JWT_SECRET?: string;
      DATABASE_URL?: string;
    }
  }
}

// Type helper pour les erreurs de log
export type LogError = string | Error | any | unknown;

export {};
