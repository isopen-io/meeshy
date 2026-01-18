/**
 * Types pour le système de traduction et clonage vocal
 * =====================================================
 *
 * Définit les interfaces pour la configuration complète du clonage vocal,
 * incluant tous les paramètres Chatterbox TTS exposés du script iOS.
 */

// ═══════════════════════════════════════════════════════════════════════════
// VOICE CLONING PARAMETERS - Configuration fine du clonage vocal
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Paramètres Chatterbox TTS pour contrôle fin de la génération vocale.
 *
 * Ces paramètres permettent d'ajuster la qualité, l'expressivité et
 * les performances du clonage vocal selon les besoins de l'utilisateur.
 */
export interface ChatterboxTTSParams {
  // ─────────────────────────────────────────────────────────────────────────
  // EXPRESSIVITÉ VOCALE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Contrôle l'expressivité vocale (prosodie, intonation)
   *
   * Range: 0.0 - 1.0
   * - 0.0: Voix monotone, plate (style lecture neutre)
   * - 0.5: Expressivité équilibrée (recommandé - défaut)
   * - 1.0: Très expressif, intonations marquées (style conversationnel)
   *
   * Défaut: 0.5 (équilibré)
   */
  exaggeration?: number;

  /**
   * Guidance du modèle (Classifier-Free Guidance)
   *
   * Range: 0.0 - 1.0
   * - 0.0: Peu de guidance, plus créatif mais moins fidèle (recommandé pour langues non-anglaises)
   * - 0.5: Équilibre créativité/fidélité (recommandé pour anglais - défaut)
   * - 1.0: Guidance maximale, très fidèle mais peut sonner rigide
   *
   * NOTE: Pour langues non-anglaises, utiliser 0.0 pour meilleure qualité
   *
   * Défaut: 0.5 (anglais), 0.0 (autres langues - auto-ajusté)
   */
  cfgWeight?: number;

  // ─────────────────────────────────────────────────────────────────────────
  // SAMPLING & CRÉATIVITÉ
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Température de sampling (créativité vs stabilité)
   *
   * Range: 0.1 - 2.0
   * - 0.1-0.5: Très stable, prévisible (voix robotique)
   * - 0.8-1.0: Équilibre créativité/stabilité (recommandé)
   * - 1.5-2.0: Très créatif, variable (peut dévier de la voix source)
   *
   * Défaut: 1.0 (équilibré)
   */
  temperature?: number;

  /**
   * Nucleus sampling (Top-P) - Filtre les tokens peu probables
   *
   * Range: 0.0 - 1.0
   * - 0.5: Très conservateur, moins de variété
   * - 0.9: Équilibre variété/qualité (recommandé - défaut)
   * - 1.0: Tous les tokens possibles (plus créatif mais risqué)
   *
   * Défaut: 0.9
   */
  topP?: number;

  /**
   * Probabilité minimum (Min-P) - Seuil de probabilité absolue
   *
   * Range: 0.0 - 1.0
   * - 0.01: Très permissif (peut inclure du bruit)
   * - 0.05: Équilibre qualité/diversité (recommandé - défaut)
   * - 0.1+: Très strict (peut manquer de naturel)
   *
   * Défaut: 0.05
   */
  minP?: number;

  /**
   * Pénalité de répétition - Évite les boucles vocales
   *
   * Range: 1.0 - 3.0
   * - 1.0: Pas de pénalité (peut répéter)
   * - 1.2: Léger (recommandé pour mono-locuteur - défaut mono)
   * - 2.0: Fort (recommandé pour multi-locuteurs - défaut multi)
   * - 3.0: Très fort (peut sonner artificiel)
   *
   * Défaut: 1.2 (mono), 2.0 (multi) - auto-ajusté selon contexte
   */
  repetitionPenalty?: number;

  // ─────────────────────────────────────────────────────────────────────────
  // OPTIMISATIONS AUTOMATIQUES
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Active l'auto-optimisation basée sur analyse vocale
   *
   * Si true (recommandé):
   * - Ajuste automatiquement exaggeration basé sur voix source
   * - Optimise cfgWeight selon langue détectée
   * - Adapte repetitionPenalty au contexte (mono/multi)
   *
   * Si false: Utilise exactement les valeurs fournies
   *
   * Défaut: true (recommandé)
   */
  autoOptimize?: boolean;
}

/**
 * Paramètres de performance pour le traitement audio
 */
export interface PerformanceParams {
  /**
   * Traiter les langues en parallèle
   *
   * - true: Génère tous les audios traduits simultanément (plus rapide)
   * - false: Génère séquentiellement (économise mémoire)
   *
   * Défaut: true (recommandé sauf si contraintes mémoire)
   */
  parallel?: boolean;

  /**
   * Nombre max de workers parallèles
   *
   * Range: 1 - 8
   * - 1: Séquentiel pur (lent mais économique)
   * - 2: Optimal pour la plupart des serveurs (défaut)
   * - 4+: Pour serveurs puissants (>16GB RAM)
   *
   * Défaut: 2
   */
  maxWorkers?: number;

  /**
   * Optimiser le modèle en mémoire (quantization)
   *
   * - true: Utilise optimisations mémoire (recommandé)
   * - false: Mode précision maximale (consomme plus de RAM)
   *
   * Défaut: true
   */
  optimizeModel?: boolean;

  /**
   * Utiliser FP16 (half-precision) pour inférence
   *
   * - true: Économise 50% de VRAM (peut réduire légèrement la qualité)
   * - false: FP32 complet (meilleure qualité, plus de VRAM)
   *
   * Défaut: false (qualité maximale)
   */
  useFp16?: boolean;

  /**
   * Préchauffer le modèle au démarrage
   *
   * - true: Première génération plus rapide (recommandé)
   * - false: Démarrage plus rapide mais première génération lente
   *
   * Défaut: true
   */
  warmup?: boolean;
}

/**
 * Paramètres de qualité et validation
 */
export interface QualityParams {
  /**
   * Seuil minimum de similarité vocale
   *
   * Range: 0.0 - 1.0
   * - 0.50: Très permissif (accepte des voix peu similaires)
   * - 0.70: Équilibre qualité/acceptance (recommandé - défaut)
   * - 0.85+: Très strict (peut rejeter des clonages acceptables)
   *
   * Si similarité < seuil → retry automatique ou fallback
   *
   * Défaut: 0.70
   */
  minSimilarityThreshold?: number;

  /**
   * Réessayer automatiquement si similarité faible
   *
   * - true: Retente avec paramètres ajustés si similarité < seuil (recommandé)
   * - false: Accepte le premier résultat
   *
   * Défaut: true
   */
  autoRetryOnLowSimilarity?: boolean;

  /**
   * Nombre max de retentatives
   *
   * Range: 0 - 5
   * - 0: Pas de retry
   * - 2: Optimal (balance qualité/délai - défaut)
   * - 5: Maximum (peut prendre du temps)
   *
   * Défaut: 2
   */
  maxRetries?: number;
}

/**
 * Configuration complète des paramètres de clonage vocal
 *
 * Combine tous les paramètres exposés du script iOS pour un contrôle
 * total sur le processus de traduction audio.
 */
export interface VoiceCloneParameters {
  /**
   * Paramètres Chatterbox TTS (expressivité, sampling)
   */
  chatterbox?: ChatterboxTTSParams;

  /**
   * Paramètres de performance (parallélisme, optimisation)
   */
  performance?: PerformanceParams;

  /**
   * Paramètres de qualité (validation, retry)
   */
  quality?: QualityParams;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT VALUES - Valeurs par défaut recommandées
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Valeurs par défaut pour Chatterbox TTS
 */
export const DEFAULT_CHATTERBOX_PARAMS: Required<ChatterboxTTSParams> = {
  exaggeration: 0.5,
  cfgWeight: 0.5,        // Auto-ajusté à 0.0 pour langues non-anglaises
  temperature: 1.0,
  topP: 0.9,
  minP: 0.05,
  repetitionPenalty: 1.2, // Auto-ajusté à 2.0 pour multi-locuteurs
  autoOptimize: true
};

/**
 * Valeurs par défaut pour paramètres de performance
 */
export const DEFAULT_PERFORMANCE_PARAMS: Required<PerformanceParams> = {
  parallel: true,
  maxWorkers: 2,
  optimizeModel: true,
  useFp16: false,
  warmup: true
};

/**
 * Valeurs par défaut pour paramètres de qualité
 */
export const DEFAULT_QUALITY_PARAMS: Required<QualityParams> = {
  minSimilarityThreshold: 0.70,
  autoRetryOnLowSimilarity: true,
  maxRetries: 2
};

/**
 * Configuration complète par défaut
 */
export const DEFAULT_VOICE_CLONE_PARAMS: Required<VoiceCloneParameters> = {
  chatterbox: DEFAULT_CHATTERBOX_PARAMS,
  performance: DEFAULT_PERFORMANCE_PARAMS,
  quality: DEFAULT_QUALITY_PARAMS
};

// ═══════════════════════════════════════════════════════════════════════════
// PRESETS - Configurations pré-définies pour cas d'usage courants
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Preset "Fast" - Génération rapide, qualité acceptable
 *
 * Cas d'usage: Messages courts, démo, tests
 */
export const VOICE_CLONE_PRESET_FAST: VoiceCloneParameters = {
  chatterbox: {
    exaggeration: 0.4,
    temperature: 0.9,
    topP: 0.85,
    autoOptimize: false
  },
  performance: {
    parallel: true,
    maxWorkers: 4,
    optimizeModel: true,
    useFp16: true,
    warmup: true
  },
  quality: {
    minSimilarityThreshold: 0.65,
    autoRetryOnLowSimilarity: false,
    maxRetries: 0
  }
};

/**
 * Preset "Balanced" - Équilibre qualité/vitesse (défaut recommandé)
 *
 * Cas d'usage: Usage général, production
 */
export const VOICE_CLONE_PRESET_BALANCED: VoiceCloneParameters = {
  chatterbox: {
    exaggeration: 0.5,
    temperature: 1.0,
    topP: 0.9,
    autoOptimize: true
  },
  performance: {
    parallel: true,
    maxWorkers: 2,
    optimizeModel: true,
    useFp16: false,
    warmup: true
  },
  quality: {
    minSimilarityThreshold: 0.70,
    autoRetryOnLowSimilarity: true,
    maxRetries: 2
  }
};

/**
 * Preset "High Quality" - Qualité maximale, plus lent
 *
 * Cas d'usage: Voix professionnelles, qualité critique
 */
export const VOICE_CLONE_PRESET_HIGH_QUALITY: VoiceCloneParameters = {
  chatterbox: {
    exaggeration: 0.6,
    temperature: 0.95,
    topP: 0.95,
    minP: 0.02,
    autoOptimize: true
  },
  performance: {
    parallel: false,
    maxWorkers: 1,
    optimizeModel: false,
    useFp16: false,
    warmup: true
  },
  quality: {
    minSimilarityThreshold: 0.80,
    autoRetryOnLowSimilarity: true,
    maxRetries: 3
  }
};

/**
 * Preset "Conversational" - Voix naturelle, expressive
 *
 * Cas d'usage: Conversations, dialogues, expressivité importante
 */
export const VOICE_CLONE_PRESET_CONVERSATIONAL: VoiceCloneParameters = {
  chatterbox: {
    exaggeration: 0.7,
    temperature: 1.1,
    topP: 0.92,
    repetitionPenalty: 1.5,
    autoOptimize: true
  },
  performance: {
    parallel: true,
    maxWorkers: 2,
    optimizeModel: true,
    useFp16: false,
    warmup: true
  },
  quality: {
    minSimilarityThreshold: 0.70,
    autoRetryOnLowSimilarity: true,
    maxRetries: 2
  }
};

/**
 * Preset "Low Resource" - Pour serveurs avec ressources limitées
 *
 * Cas d'usage: VPS entrée de gamme, environnements contraints
 */
export const VOICE_CLONE_PRESET_LOW_RESOURCE: VoiceCloneParameters = {
  chatterbox: {
    exaggeration: 0.4,
    temperature: 0.9,
    autoOptimize: false
  },
  performance: {
    parallel: false,
    maxWorkers: 1,
    optimizeModel: true,
    useFp16: true,
    warmup: false
  },
  quality: {
    minSimilarityThreshold: 0.65,
    autoRetryOnLowSimilarity: false,
    maxRetries: 0
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS - Utilitaires pour validation et fusion
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Valide les paramètres Chatterbox
 *
 * @param params Paramètres à valider
 * @returns Paramètres validés avec valeurs dans les ranges acceptables
 */
export function validateChatterboxParams(
  params: ChatterboxTTSParams
): Required<ChatterboxTTSParams> {
  return {
    exaggeration: clamp(params.exaggeration ?? 0.5, 0.0, 1.0),
    cfgWeight: clamp(params.cfgWeight ?? 0.5, 0.0, 1.0),
    temperature: clamp(params.temperature ?? 1.0, 0.1, 2.0),
    topP: clamp(params.topP ?? 0.9, 0.0, 1.0),
    minP: clamp(params.minP ?? 0.05, 0.0, 1.0),
    repetitionPenalty: clamp(params.repetitionPenalty ?? 1.2, 1.0, 3.0),
    autoOptimize: params.autoOptimize ?? true
  };
}

/**
 * Valide les paramètres de performance
 */
export function validatePerformanceParams(
  params: PerformanceParams
): Required<PerformanceParams> {
  return {
    parallel: params.parallel ?? true,
    maxWorkers: clamp(params.maxWorkers ?? 2, 1, 8),
    optimizeModel: params.optimizeModel ?? true,
    useFp16: params.useFp16 ?? false,
    warmup: params.warmup ?? true
  };
}

/**
 * Valide les paramètres de qualité
 */
export function validateQualityParams(
  params: QualityParams
): Required<QualityParams> {
  return {
    minSimilarityThreshold: clamp(params.minSimilarityThreshold ?? 0.70, 0.0, 1.0),
    autoRetryOnLowSimilarity: params.autoRetryOnLowSimilarity ?? true,
    maxRetries: clamp(params.maxRetries ?? 2, 0, 5)
  };
}

/**
 * Fusionne les paramètres utilisateur avec les défauts
 *
 * @param userParams Paramètres fournis par l'utilisateur (partiels)
 * @returns Configuration complète avec défauts appliqués
 */
export function mergeVoiceCloneParams(
  userParams?: VoiceCloneParameters
): Required<VoiceCloneParameters> {
  return {
    chatterbox: validateChatterboxParams({
      ...DEFAULT_CHATTERBOX_PARAMS,
      ...userParams?.chatterbox
    }),
    performance: validatePerformanceParams({
      ...DEFAULT_PERFORMANCE_PARAMS,
      ...userParams?.performance
    }),
    quality: validateQualityParams({
      ...DEFAULT_QUALITY_PARAMS,
      ...userParams?.quality
    })
  };
}

/**
 * Applique un preset nommé
 *
 * @param presetName Nom du preset ("fast", "balanced", "high_quality", etc.)
 * @param overrides Surcharges spécifiques à appliquer au preset
 * @returns Configuration fusionnée
 */
export function applyPreset(
  presetName: 'fast' | 'balanced' | 'high_quality' | 'conversational' | 'low_resource',
  overrides?: VoiceCloneParameters
): Required<VoiceCloneParameters> {
  const presets = {
    fast: VOICE_CLONE_PRESET_FAST,
    balanced: VOICE_CLONE_PRESET_BALANCED,
    high_quality: VOICE_CLONE_PRESET_HIGH_QUALITY,
    conversational: VOICE_CLONE_PRESET_CONVERSATIONAL,
    low_resource: VOICE_CLONE_PRESET_LOW_RESOURCE
  };

  const basePreset = presets[presetName] || VOICE_CLONE_PRESET_BALANCED;

  return mergeVoiceCloneParams({
    chatterbox: { ...basePreset.chatterbox, ...overrides?.chatterbox },
    performance: { ...basePreset.performance, ...overrides?.performance },
    quality: { ...basePreset.quality, ...overrides?.quality }
  });
}

/**
 * Utilitaire: Limite une valeur entre min et max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
