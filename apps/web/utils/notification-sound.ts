/**
 * Système de notification sonore avec Web Audio API
 * Génère des sons directement sans fichier externe
 * Respecte les préférences utilisateur et le mode DND
 */

export interface NotificationSoundOptions {
  volume?: number; // 0.0 - 1.0
  duration?: number; // en millisecondes
  type?: 'default' | 'message' | 'call' | 'urgent';
}

/**
 * Classe pour gérer les sons de notification
 */
class NotificationSoundManager {
  private audioContext: AudioContext | null = null;
  private isInitialized = false;

  /**
   * Initialise l'AudioContext (requis pour iOS)
   * Doit être appelé après une interaction utilisateur
   */
  initialize(): void {
    if (this.isInitialized) return;

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.isInitialized = true;
      console.info('[NotificationSound] AudioContext initialized');
    } catch (error) {
      console.error('[NotificationSound] Failed to initialize AudioContext:', error);
    }
  }

  /**
   * Génère un son de notification selon le type
   */
  private generateSound(type: string): { freq1: number; freq2: number; pattern: number[] } {
    switch (type) {
      case 'message':
        // Son doux pour les messages (C5 → E5)
        return {
          freq1: 523.25,
          freq2: 659.25,
          pattern: [0.1, 0.05, 0.1] // Durées des bips
        };

      case 'call':
        // Son plus intense pour les appels (A4 → C5)
        return {
          freq1: 440.00,
          freq2: 523.25,
          pattern: [0.3, 0.1, 0.3, 0.1, 0.3] // Triple bip
        };

      case 'urgent':
        // Son urgent (D5 → G5)
        return {
          freq1: 587.33,
          freq2: 783.99,
          pattern: [0.15, 0.05, 0.15] // Bips rapides
        };

      case 'default':
      default:
        // Son par défaut (C5 → G5)
        return {
          freq1: 523.25,
          freq2: 783.99,
          pattern: [0.2] // Simple bip
        };
    }
  }

  /**
   * Joue un son de notification
   */
  async play(options: NotificationSoundOptions = {}): Promise<void> {
    // Vérifier si AudioContext est disponible
    if (!this.audioContext) {
      this.initialize();
      if (!this.audioContext) {
        console.warn('[NotificationSound] AudioContext not available');
        return;
      }
    }

    const {
      volume = 0.3,
      type = 'default'
    } = options;

    const sound = this.generateSound(type);
    const { freq1, freq2, pattern } = sound;

    try {
      let currentTime = this.audioContext.currentTime;

      // Jouer chaque bip du pattern
      for (let i = 0; i < pattern.length; i++) {
        const duration = pattern[i];
        const freq = i % 2 === 0 ? freq1 : freq2;

        // Créer l'oscillateur
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        // Configuration du son
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(freq, currentTime);

        // Envelope (fade in/out rapide)
        gainNode.gain.setValueAtTime(0, currentTime);
        gainNode.gain.linearRampToValueAtTime(volume, currentTime + 0.02);
        gainNode.gain.linearRampToValueAtTime(volume, currentTime + duration - 0.02);
        gainNode.gain.linearRampToValueAtTime(0, currentTime + duration);

        // Jouer le son
        oscillator.start(currentTime);
        oscillator.stop(currentTime + duration);

        currentTime += duration;
      }
    } catch (error) {
      console.error('[NotificationSound] Failed to play sound:', error);
    }
  }

  /**
   * Vérifie si le son est supporté
   */
  isSupported(): boolean {
    return typeof AudioContext !== 'undefined' || typeof (window as any).webkitAudioContext !== 'undefined';
  }

  /**
   * Libère les ressources
   */
  dispose(): void {
    if (this.audioContext) {
      this.audioContext.close().catch(console.error);
      this.audioContext = null;
      this.isInitialized = false;
    }
  }
}

// Instance singleton
const notificationSoundManager = new NotificationSoundManager();

/**
 * Hook pour jouer un son de notification
 * Respecte les préférences utilisateur et le mode DND
 */
export async function playNotificationSound(
  options: NotificationSoundOptions = {},
  preferences?: {
    soundEnabled?: boolean;
    dndEnabled?: boolean;
    dndStartTime?: string;
    dndEndTime?: string;
  }
): Promise<void> {
  // Vérifier si les sons sont activés
  if (preferences?.soundEnabled === false) {
    console.debug('[NotificationSound] Sound disabled in preferences');
    return;
  }

  // Vérifier le mode DND (Do Not Disturb)
  if (preferences?.dndEnabled && preferences.dndStartTime && preferences.dndEndTime) {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const { dndStartTime, dndEndTime } = preferences;

    // Gérer le cas où DND traverse minuit (ex: 22:00 - 08:00)
    const isDndActive = dndStartTime <= dndEndTime
      ? currentTime >= dndStartTime && currentTime <= dndEndTime
      : currentTime >= dndStartTime || currentTime <= dndEndTime;

    if (isDndActive) {
      console.debug('[NotificationSound] Sound muted (DND mode active)');
      return;
    }
  }

  // Vérifier le support
  if (!notificationSoundManager.isSupported()) {
    console.warn('[NotificationSound] Web Audio API not supported');
    return;
  }

  // Jouer le son
  await notificationSoundManager.play(options);
}

/**
 * Initialise l'AudioContext après une interaction utilisateur
 * À appeler au clic ou au premier chargement
 */
export function initializeNotificationSound(): void {
  notificationSoundManager.initialize();
}

/**
 * Vérifie si le son est supporté
 */
export function isNotificationSoundSupported(): boolean {
  return notificationSoundManager.isSupported();
}

/**
 * Libère les ressources audio (cleanup)
 */
export function disposeNotificationSound(): void {
  notificationSoundManager.dispose();
}

export default notificationSoundManager;
