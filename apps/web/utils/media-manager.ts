/**
 * Gestionnaire global de médias pour s'assurer qu'un seul média (audio ou vidéo) joue à la fois
 * Singleton qui coordonne AudioManager et VideoManager
 */

type MediaElement = HTMLAudioElement | HTMLVideoElement;
type MediaType = 'audio' | 'video';

class MediaManager {
  private static instance: MediaManager;
  private currentMedia: MediaElement | null = null;
  private currentMediaType: MediaType | null = null;

  private constructor() {}

  static getInstance(): MediaManager {
    if (!MediaManager.instance) {
      MediaManager.instance = new MediaManager();
    }
    return MediaManager.instance;
  }

  /**
   * Enregistre un média en lecture et arrête tout autre média en cours
   */
  play(media: MediaElement, type: MediaType) {
    // Si un autre média est en cours de lecture, l'arrêter
    if (this.currentMedia && this.currentMedia !== media) {
      this.currentMedia.pause();
      this.currentMedia.currentTime = 0;
    }

    // Enregistrer le nouveau média actif
    this.currentMedia = media;
    this.currentMediaType = type;
  }

  /**
   * Désactive le média spécifié
   */
  stop(media: MediaElement) {
    if (this.currentMedia === media) {
      this.currentMedia = null;
      this.currentMediaType = null;
    }
  }

  /**
   * Arrête tout média en cours
   */
  stopAll() {
    if (this.currentMedia) {
      this.currentMedia.pause();
      this.currentMedia.currentTime = 0;
      this.currentMedia = null;
      this.currentMediaType = null;
    }
  }

  /**
   * Obtient le média actuellement en lecture
   */
  getCurrentMedia(): { media: MediaElement; type: MediaType } | null {
    if (this.currentMedia && this.currentMediaType) {
      return {
        media: this.currentMedia,
        type: this.currentMediaType
      };
    }
    return null;
  }

  /**
   * Vérifie si un média spécifique est en cours de lecture
   */
  isPlaying(media: MediaElement): boolean {
    return this.currentMedia === media;
  }
}

export default MediaManager;
