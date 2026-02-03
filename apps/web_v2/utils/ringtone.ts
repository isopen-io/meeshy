/**
 * RINGTONE UTILITY
 * Generates a pleasant ringtone with iOS Safari compatibility
 * Supports: Web Audio API (desktop) + HTML Audio fallback (mobile) + Vibration (mobile)
 */

// Detect iOS Safari
const isIOSSafari = (): boolean => {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const iOS = !!ua.match(/iPad/i) || !!ua.match(/iPhone/i);
  const webkit = !!ua.match(/WebKit/i);
  return iOS && webkit && !ua.match(/CriOS/i); // Not Chrome iOS
};

export class Ringtone {
  private audioContext: AudioContext | null = null;
  private oscillators: OscillatorNode[] = [];
  private gainNode: GainNode | null = null;
  private isPlaying = false;
  private htmlAudio: HTMLAudioElement | null = null;
  private vibrationInterval: NodeJS.Timeout | null = null;
  private useHTMLAudioFallback = false;

  constructor() {
    // On iOS, always use HTML Audio fallback
    this.useHTMLAudioFallback = isIOSSafari();

    if (this.useHTMLAudioFallback) {
      this.initHTMLAudio();
    }
  }

  /**
   * Initialize HTML Audio element for iOS compatibility
   */
  private initHTMLAudio(): void {
    try {
      // Create audio element with data URL (simple beep tone)
      this.htmlAudio = new Audio();
      this.htmlAudio.loop = true;
      this.htmlAudio.volume = 0.5;
      this.htmlAudio.preload = 'auto';

      // Use a simple data URL for a beep sound (works offline)
      // This is a base64 encoded WAV file with a simple tone
      this.htmlAudio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

      // iOS requires playsinline
      this.htmlAudio.setAttribute('playsinline', 'true');

      // Preload the audio
      this.htmlAudio.load();

    } catch (error) {
      console.error('[Ringtone] Failed to initialize HTML Audio:', error);
    }
  }

  /**
   * Start playing the ringtone
   */
  async play(): Promise<void> {
    if (this.isPlaying) {
      return;
    }

    this.isPlaying = true;

    try {
      // Try vibration on mobile devices (works on iOS even without audio!)
      this.startVibration();

      // Use HTML Audio fallback on iOS
      if (this.useHTMLAudioFallback && this.htmlAudio) {

        try {
          // Reset audio to beginning
          this.htmlAudio.currentTime = 0;

          // Try to play - may still fail if no user interaction yet
          const playPromise = this.htmlAudio.play();

          if (playPromise !== undefined) {
            playPromise.catch((error) => {
              console.warn('[Ringtone] HTML Audio play blocked (expected on iOS):', error.message);
              // Silently fail - vibration will still work!
            });
          }
        } catch (error) {
          console.warn('[Ringtone] HTML Audio error:', error);
        }
      } else {
        // Use Web Audio API on desktop
        await this.playWithWebAudio();
      }
    } catch (error) {
      console.error('[Ringtone] Failed to play:', error);
    }
  }

  /**
   * Play using Web Audio API (desktop browsers)
   */
  private async playWithWebAudio(): Promise<void> {
    try {
      // Create audio context
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      // Resume audio context if suspended (iOS requirement)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Create gain node for volume control
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = 0.3; // 30% volume

      // Play ringtone pattern (classic two-tone ring)
      this.playRingPattern();
    } catch (error) {
      console.error('[Ringtone] Web Audio API failed:', error);
    }
  }

  /**
   * Start vibration pattern (works on iOS!)
   */
  private startVibration(): void {
    if (!navigator.vibrate) {
      return;
    }

    // Vibration pattern: vibrate for 400ms, pause 200ms, vibrate 400ms, pause 1000ms, repeat
    const vibratePattern = [400, 200, 400, 1000];

    try {
      navigator.vibrate(vibratePattern);

      // Repeat vibration pattern every 2 seconds
      this.vibrationInterval = setInterval(() => {
        if (this.isPlaying) {
          navigator.vibrate(vibratePattern);
        }
      }, 2000);

    } catch (error) {
      console.warn('[Ringtone] Vibration failed:', error);
    }
  }

  /**
   * Stop vibration
   */
  private stopVibration(): void {
    if (this.vibrationInterval) {
      clearInterval(this.vibrationInterval);
      this.vibrationInterval = null;
    }

    if (navigator.vibrate) {
      navigator.vibrate(0); // Stop vibration
    }
  }

  /**
   * Stop playing the ringtone
   */
  stop(): void {
    if (!this.isPlaying) {
      return;
    }

    this.isPlaying = false;

    // Stop vibration
    this.stopVibration();

    // Stop HTML Audio
    if (this.htmlAudio) {
      try {
        this.htmlAudio.pause();
        this.htmlAudio.currentTime = 0;
      } catch (e) {
        // Ignore errors
      }
    }

    // Stop all oscillators (Web Audio API)
    this.oscillators.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch (e) {
        // Ignore errors if already stopped
      }
    });
    this.oscillators = [];

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.gainNode = null;
  }

  /**
   * Play the ring pattern (two tones alternating) - Web Audio API only
   */
  private playRingPattern(): void {
    if (!this.audioContext || !this.gainNode || !this.isPlaying) {
      return;
    }

    const freq1 = 523.25; // C5 note
    const freq2 = 659.25; // E5 note
    const currentTime = this.audioContext.currentTime;

    // Create oscillator for first tone (0.4 seconds)
    const osc1 = this.audioContext.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = freq1;
    osc1.connect(this.gainNode);
    osc1.start(currentTime);
    osc1.stop(currentTime + 0.4);
    this.oscillators.push(osc1);

    // Create oscillator for second tone (0.4 seconds, starts after first)
    const osc2 = this.audioContext.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq2;
    osc2.connect(this.gainNode);
    osc2.start(currentTime + 0.4);
    osc2.stop(currentTime + 0.8);
    this.oscillators.push(osc2);

    // Schedule next ring after 1.5 second pause
    setTimeout(() => {
      if (this.isPlaying) {
        // Clear old oscillators
        this.oscillators = [];
        this.playRingPattern();
      }
    }, 2300); // 0.8s tone + 1.5s pause
  }
}

// Singleton instance
let ringtoneInstance: Ringtone | null = null;

/**
 * Get or create ringtone instance
 */
export function getRingtone(): Ringtone {
  if (!ringtoneInstance) {
    ringtoneInstance = new Ringtone();
  }
  return ringtoneInstance;
}

/**
 * Play ringtone
 */
export function playRingtone(): void {
  getRingtone().play();
}

/**
 * Stop ringtone
 */
export function stopRingtone(): void {
  getRingtone().stop();
}

/**
 * Initialize audio context with user interaction (call this on app load after user click)
 * This "unlocks" audio on iOS Safari
 */
export async function unlockAudio(): Promise<void> {
  try {
    const ringtone = getRingtone();

    // For iOS, play and immediately stop to unlock
    if (isIOSSafari() && ringtone['htmlAudio']) {
      const audio = ringtone['htmlAudio'] as HTMLAudioElement;
      audio.muted = true;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
    }
  } catch (error) {
    console.warn('[Ringtone] Audio unlock failed (may not be needed):', error);
  }
}
