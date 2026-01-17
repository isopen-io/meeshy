import type { AudioEffectType } from '@meeshy/shared/types/video-call';
import { Mic2, Baby, Skull, Music } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Configuration et métadonnées des effets audio
 */

// Mapping des codes langue vers noms affichables
export const LANGUAGE_NAMES: Record<string, string> = {
  'original': 'Original',
  'fr': 'Français',
  'en': 'English',
  'es': 'Español',
  'pt': 'Português',
  'de': 'Deutsch',
  'it': 'Italiano',
  'zh': '中文',
  'ja': '日本語',
  'ko': '한국어',
  'ar': 'العربية',
  'ru': 'Русский',
};

// Noms affichables pour les effets
export const EFFECT_NAMES: Record<AudioEffectType | 'overview', string> = {
  'overview': 'Vue d\'ensemble',
  'voice-coder': 'Voice Coder',
  'baby-voice': 'Baby Voice',
  'demon-voice': 'Demon Voice',
  'back-sound': 'Background Sound',
};

// Traductions des noms de paramètres
export const PARAMETER_NAMES: Record<string, string> = {
  'pitch': 'Hauteur',
  'harmonization': 'Harmonisation',
  'strength': 'Intensité',
  'retuneSpeed': 'Vitesse',
  'scale': 'Gamme',
  'key': 'Tonalité',
  'naturalVibrato': 'Expression',
  'formant': 'Timbre',
  'breathiness': 'Souffle',
  'distortion': 'Distorsion',
  'reverb': 'Écho',
  'soundFile': 'Fichier',
  'volume': 'Volume',
  'loopMode': 'Mode',
  'loopValue': 'Valeur',
};

// Couleurs pour les effets
export const EFFECT_COLORS: Record<AudioEffectType, string> = {
  'voice-coder': '#8b5cf6', // purple
  'baby-voice': '#ec4899', // pink
  'demon-voice': '#ef4444', // red
  'back-sound': '#3b82f6', // blue
};

// Classes Tailwind pour les tabs d'effets
export const EFFECT_TAB_CLASSES: Record<AudioEffectType | 'overview', string> = {
  'overview': 'data-[state=active]:bg-gray-500 data-[state=active]:text-white',
  'voice-coder': 'data-[state=active]:bg-purple-500 data-[state=active]:text-white',
  'baby-voice': 'data-[state=active]:bg-pink-500 data-[state=active]:text-white',
  'demon-voice': 'data-[state=active]:bg-red-500 data-[state=active]:text-white',
  'back-sound': 'data-[state=active]:bg-blue-500 data-[state=active]:text-white',
};

// Icônes des effets
export const EFFECT_ICONS: Record<AudioEffectType, LucideIcon> = {
  'voice-coder': Mic2,
  'baby-voice': Baby,
  'demon-voice': Skull,
  'back-sound': Music,
};

// Couleurs pour les courbes de graphiques
export const CURVE_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#14b8a6', // teal
];

/**
 * Obtenir le nom traduit d'un paramètre
 */
export function getParameterName(key: string): string {
  return PARAMETER_NAMES[key] || key;
}

/**
 * Obtenir le nom d'un effet
 */
export function getEffectName(effect: AudioEffectType | 'overview'): string {
  return EFFECT_NAMES[effect] || effect;
}

/**
 * Obtenir la couleur d'un effet
 */
export function getEffectColor(effect: AudioEffectType): string {
  return EFFECT_COLORS[effect] || '#000000';
}

/**
 * Obtenir l'icône d'un effet
 */
export function getEffectIcon(effect: AudioEffectType): LucideIcon {
  return EFFECT_ICONS[effect];
}
