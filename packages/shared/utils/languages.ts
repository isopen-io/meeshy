/**
 * Unified Language Configuration for Meeshy
 * ==========================================
 *
 * Source unique de vérité pour toutes les langues supportées.
 * Partagé entre Frontend, Gateway, et synchronisé avec Python Translator.
 *
 * IMPORTANT: Toute modification ici doit être propagée vers:
 * - services/translator/src/services/language_capabilities.py
 *
 * Capacités:
 * - TTS (Text-to-Speech): Synthèse vocale
 * - STT (Speech-to-Text): Transcription audio
 * - Voice Cloning: Clonage vocal (uniquement Chatterbox/XTTS)
 * - Translation: Traduction de texte
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Moteurs TTS disponibles
 */
export type TTSEngine = 'chatterbox' | 'xtts' | 'mms' | 'none';

/**
 * Moteurs STT disponibles
 */
export type STTEngine = 'whisper' | 'mms_asr' | 'none';

/**
 * Régions géographiques
 */
export type LanguageRegion =
  | 'Europe'
  | 'Asia'
  | 'Africa'
  | 'Africa (East)'
  | 'Africa (West)'
  | 'Africa (Central)'
  | 'Africa (South)'
  | 'Africa (Cameroon)'
  | 'Middle East'
  | 'Americas';

/**
 * Interface complète pour une langue supportée avec toutes ses capacités
 */
export interface SupportedLanguageInfo {
  // Identifiants
  code: string;                    // ISO 639-1 ou 639-3
  name: string;                    // Nom en anglais
  nativeName?: string;             // Nom dans la langue native
  flag: string;                    // Emoji drapeau

  // Affichage
  color?: string;                  // Classe Tailwind pour la couleur
  translateText?: string;          // Texte "Traduire en [langue]"

  // Capacités
  supportsTTS: boolean;            // Peut synthétiser la voix
  supportsSTT: boolean;            // Peut transcrire l'audio
  supportsVoiceCloning: boolean;   // Peut cloner la voix
  supportsTranslation: boolean;    // Peut traduire le texte

  // Moteurs utilisés
  ttsEngine: TTSEngine;
  sttEngine: STTEngine;

  // Codes MMS (ISO 639-3) pour Meta MMS
  mmsTTSCode?: string;             // Code pour MMS TTS
  mmsASRCode?: string;             // Code pour MMS ASR

  // Métadonnées
  region: LanguageRegion;
  notes?: string;                  // Notes spéciales
}

// ============================================================================
// LISTE DES LANGUES SUPPORTÉES
// ============================================================================

/**
 * Liste complète des langues supportées avec leurs capacités
 * Synchronisée avec services/translator/src/services/language_capabilities.py
 */
export const SUPPORTED_LANGUAGES: readonly SupportedLanguageInfo[] = [
  // =========================================================================
  // LANGUES EUROPÉENNES (Chatterbox/XTTS + Whisper)
  // =========================================================================
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    flag: '🇬🇧',
    color: 'bg-red-500',
    translateText: 'Translate this message to English',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    region: 'Europe'
  },
  {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    flag: '🇫🇷',
    color: 'bg-blue-500',
    translateText: 'Traduire ce message en français',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    region: 'Europe'
  },
  {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    flag: '🇪🇸',
    color: 'bg-yellow-500',
    translateText: 'Traducir este mensaje al español',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    region: 'Europe'
  },
  {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    flag: '🇩🇪',
    color: 'bg-gray-800',
    translateText: 'Diese Nachricht ins Deutsche übersetzen',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    region: 'Europe'
  },
  {
    code: 'it',
    name: 'Italian',
    nativeName: 'Italiano',
    flag: '🇮🇹',
    color: 'bg-green-600',
    translateText: 'Traduci questo messaggio in italiano',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    region: 'Europe'
  },
  {
    code: 'pt',
    name: 'Portuguese',
    nativeName: 'Português',
    flag: '🇵🇹',
    color: 'bg-green-500',
    translateText: 'Traduzir esta mensagem para português',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    region: 'Europe'
  },
  {
    code: 'nl',
    name: 'Dutch',
    nativeName: 'Nederlands',
    flag: '🇳🇱',
    color: 'bg-orange-600',
    translateText: 'Vertaal dit bericht naar het Nederlands',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    region: 'Europe'
  },
  {
    code: 'pl',
    name: 'Polish',
    nativeName: 'Polski',
    flag: '🇵🇱',
    color: 'bg-red-600',
    translateText: 'Przetłumacz tę wiadomość na polski',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    region: 'Europe'
  },
  {
    code: 'ru',
    name: 'Russian',
    nativeName: 'Русский',
    flag: '🇷🇺',
    color: 'bg-blue-600',
    translateText: 'Перевести это сообщение на русский',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    region: 'Europe'
  },
  {
    code: 'uk',
    name: 'Ukrainian',
    nativeName: 'Українська',
    flag: '🇺🇦',
    color: 'bg-blue-500',
    translateText: 'Перекласти це повідомлення українською',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'whisper',
    mmsTTSCode: 'ukr',
    region: 'Europe'
  },
  {
    code: 'cs',
    name: 'Czech',
    nativeName: 'Čeština',
    flag: '🇨🇿',
    color: 'bg-blue-600',
    translateText: 'Přeložit tuto zprávu do češtiny',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    region: 'Europe'
  },
  {
    code: 'ro',
    name: 'Romanian',
    nativeName: 'Română',
    flag: '🇷🇴',
    color: 'bg-yellow-500',
    translateText: 'Traduceți acest mesaj în română',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'whisper',
    mmsTTSCode: 'ron',
    region: 'Europe'
  },
  {
    code: 'hu',
    name: 'Hungarian',
    nativeName: 'Magyar',
    flag: '🇭🇺',
    color: 'bg-red-600',
    translateText: 'Fordítsa le ezt az üzenetet magyarra',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    region: 'Europe'
  },
  {
    code: 'bg',
    name: 'Bulgarian',
    nativeName: 'Български',
    flag: '🇧🇬',
    color: 'bg-red-600',
    translateText: 'Преведете това съобщение на български',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'whisper',
    mmsTTSCode: 'bul',
    region: 'Europe'
  },
  {
    code: 'hr',
    name: 'Croatian',
    nativeName: 'Hrvatski',
    flag: '🇭🇷',
    color: 'bg-red-600',
    translateText: 'Prevedi ovu poruku na hrvatski',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'whisper',
    mmsTTSCode: 'hrv',
    region: 'Europe'
  },
  {
    code: 'el',
    name: 'Greek',
    nativeName: 'Ελληνικά',
    flag: '🇬🇷',
    color: 'bg-blue-500',
    translateText: 'Μετάφραση αυτού του μηνύματος στα ελληνικά',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    region: 'Europe'
  },
  {
    code: 'tr',
    name: 'Turkish',
    nativeName: 'Türkçe',
    flag: '🇹🇷',
    color: 'bg-red-600',
    translateText: 'Bu mesajı Türkçe\'ye çevir',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    region: 'Europe'
  },
  {
    code: 'sv',
    name: 'Swedish',
    nativeName: 'Svenska',
    flag: '🇸🇪',
    color: 'bg-blue-500',
    translateText: 'Översätt det här meddelandet till svenska',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    region: 'Europe'
  },
  {
    code: 'da',
    name: 'Danish',
    nativeName: 'Dansk',
    flag: '🇩🇰',
    color: 'bg-red-500',
    translateText: 'Oversæt denne besked til dansk',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    region: 'Europe'
  },
  {
    code: 'fi',
    name: 'Finnish',
    nativeName: 'Suomi',
    flag: '🇫🇮',
    color: 'bg-blue-600',
    translateText: 'Käännä tämä viesti suomeksi',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    region: 'Europe'
  },
  {
    code: 'no',
    name: 'Norwegian',
    nativeName: 'Norsk',
    flag: '🇳🇴',
    color: 'bg-blue-600',
    translateText: 'Oversett denne meldingen til norsk',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    region: 'Europe'
  },
  {
    code: 'lt',
    name: 'Lithuanian',
    nativeName: 'Lietuvių',
    flag: '🇱🇹',
    color: 'bg-yellow-500',
    translateText: 'Išversti šį pranešimą į lietuvių kalbą',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'whisper',
    mmsTTSCode: 'lit',
    region: 'Europe'
  },
  {
    code: 'hy',
    name: 'Armenian',
    nativeName: 'Հdelays',
    flag: '🇦🇲',
    color: 'bg-red-500',
    translateText: 'Թdelays delays այdelays delays delays delays հdelays',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'whisper',
    mmsTTSCode: 'hye',
    region: 'Europe'
  },

  // =========================================================================
  // LANGUES ASIATIQUES
  // =========================================================================
  {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    flag: '🇸🇦',
    color: 'bg-green-600',
    translateText: 'ترجمة هذه الرسالة إلى العربية',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    mmsTTSCode: 'ara',
    mmsASRCode: 'ara',
    region: 'Middle East'
  },
  {
    code: 'he',
    name: 'Hebrew',
    nativeName: 'עברית',
    flag: '🇮🇱',
    color: 'bg-blue-400',
    translateText: 'תרגם הודעה זו לעברית',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    mmsTTSCode: 'heb',
    mmsASRCode: 'heb',
    region: 'Middle East'
  },
  {
    code: 'fa',
    name: 'Persian',
    nativeName: 'فارسی',
    flag: '🇮🇷',
    color: 'bg-green-700',
    translateText: 'ترجمه این پیام به فارسی',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'whisper',
    mmsTTSCode: 'pes',
    mmsASRCode: 'pes',
    region: 'Middle East'
  },
  {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    flag: '🇮🇳',
    color: 'bg-orange-500',
    translateText: 'इस संदेश का हिंदी में अनुवाद करें',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    mmsTTSCode: 'hin',
    mmsASRCode: 'hin',
    region: 'Asia'
  },
  {
    code: 'bn',
    name: 'Bengali',
    nativeName: 'বাংলা',
    flag: '🇧🇩',
    color: 'bg-green-500',
    translateText: 'এই বার্তাটি বাংলায় অনুবাদ করুন',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'whisper',
    mmsTTSCode: 'ben',
    mmsASRCode: 'ben',
    region: 'Asia'
  },
  {
    code: 'ur',
    name: 'Urdu',
    nativeName: 'اردو',
    flag: '🇵🇰',
    color: 'bg-green-600',
    translateText: 'اس پیغام کا اردو میں ترجمہ کریں',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'whisper',
    mmsTTSCode: 'urd',
    mmsASRCode: 'urd',
    region: 'Asia'
  },
  {
    code: 'th',
    name: 'Thai',
    nativeName: 'ไทย',
    flag: '🇹🇭',
    color: 'bg-red-600',
    translateText: 'แปลข้อความนี้เป็นภาษาไทย',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'whisper',
    mmsTTSCode: 'tha',
    mmsASRCode: 'tha',
    region: 'Asia'
  },
  {
    code: 'vi',
    name: 'Vietnamese',
    nativeName: 'Tiếng Việt',
    flag: '🇻🇳',
    color: 'bg-red-600',
    translateText: 'Dịch tin nhắn này sang tiếng Việt',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'whisper',
    mmsTTSCode: 'vie',
    mmsASRCode: 'vie',
    region: 'Asia'
  },
  {
    code: 'id',
    name: 'Indonesian',
    nativeName: 'Bahasa Indonesia',
    flag: '🇮🇩',
    color: 'bg-red-600',
    translateText: 'Terjemahkan pesan ini ke Bahasa Indonesia',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'whisper',
    mmsTTSCode: 'ind',
    mmsASRCode: 'ind',
    region: 'Asia'
  },
  {
    code: 'ms',
    name: 'Malay',
    nativeName: 'Bahasa Melayu',
    flag: '🇲🇾',
    color: 'bg-red-600',
    translateText: 'Terjemahkan mesej ini ke Bahasa Melayu',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    mmsTTSCode: 'zsm',
    mmsASRCode: 'zsm',
    region: 'Asia'
  },
  {
    code: 'ja',
    name: 'Japanese',
    nativeName: '日本語',
    flag: '🇯🇵',
    color: 'bg-white border',
    translateText: 'このメッセージを日本語に翻訳',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    mmsTTSCode: 'jpn',
    mmsASRCode: 'jpn',
    region: 'Asia'
  },
  {
    code: 'ko',
    name: 'Korean',
    nativeName: '한국어',
    flag: '🇰🇷',
    color: 'bg-blue-600',
    translateText: '이 메시지를 한국어로 번역',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    mmsTTSCode: 'kor',
    mmsASRCode: 'kor',
    region: 'Asia'
  },
  {
    code: 'zh',
    name: 'Chinese',
    nativeName: '中文',
    flag: '🇨🇳',
    color: 'bg-red-600',
    translateText: '将此消息翻译成中文',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',
    mmsTTSCode: 'cmn',
    mmsASRCode: 'cmn',
    region: 'Asia'
  },

  // =========================================================================
  // LANGUES AFRICAINES - AVEC TTS MMS (vérifiées disponibles)
  // =========================================================================
  {
    code: 'am',
    name: 'Amharic',
    nativeName: 'አማርኛ',
    flag: '🇪🇹',
    color: 'bg-green-600',
    translateText: 'ይህን መልዕክት ወደ አማርኛ ተርጉም',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'mms_asr',
    mmsTTSCode: 'amh',
    mmsASRCode: 'amh',
    region: 'Africa (East)',
    notes: 'MMS TTS verified available'
  },
  {
    code: 'sw',
    name: 'Swahili',
    nativeName: 'Kiswahili',
    flag: '🇰🇪',
    color: 'bg-green-600',
    translateText: 'Tafsiri ujumbe huu kwa Kiswahili',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: true,  // Chatterbox Multilingual supporte Swahili
    supportsTranslation: true,
    ttsEngine: 'chatterbox',
    sttEngine: 'whisper',  // Whisper supporte Swahili
    mmsTTSCode: 'swh',     // Fallback MMS si voice cloning désactivé
    mmsASRCode: 'swh',
    region: 'Africa (East)',
    notes: 'Chatterbox voice cloning + MMS fallback, Whisper STT'
  },
  {
    code: 'yo',
    name: 'Yoruba',
    nativeName: 'Yorùbá',
    flag: '🇳🇬',
    color: 'bg-green-600',
    translateText: 'Túmọ̀ ifiranṣẹ́ yìí sí Yorùbá',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'mms_asr',
    mmsTTSCode: 'yor',
    mmsASRCode: 'yor',
    region: 'Africa (West)',
    notes: 'MMS TTS verified available'
  },
  {
    code: 'ha',
    name: 'Hausa',
    nativeName: 'Hausa',
    flag: '🇳🇬',
    color: 'bg-green-600',
    translateText: 'Fassara wannan saƙo zuwa Hausa',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'mms_asr',
    mmsTTSCode: 'hau',
    mmsASRCode: 'hau',
    region: 'Africa (West)',
    notes: 'MMS TTS verified available'
  },
  {
    code: 'rw',
    name: 'Kinyarwanda',
    nativeName: 'Ikinyarwanda',
    flag: '🇷🇼',
    color: 'bg-blue-500',
    translateText: 'Hindura ubu butumwa mu Kinyarwanda',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'mms_asr',
    mmsTTSCode: 'kin',
    mmsASRCode: 'kin',
    region: 'Africa (East)',
    notes: 'MMS TTS verified available'
  },
  {
    code: 'rn',
    name: 'Kirundi',
    nativeName: 'Ikirundi',
    flag: '🇧🇮',
    color: 'bg-red-500',
    translateText: 'Hindura iki kibazo mu Kirundi',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'mms_asr',
    mmsTTSCode: 'run',
    mmsASRCode: 'run',
    region: 'Africa (East)',
    notes: 'MMS TTS verified available'
  },
  {
    code: 'sn',
    name: 'Shona',
    nativeName: 'chiShona',
    flag: '🇿🇼',
    color: 'bg-green-600',
    translateText: 'Shandura mashoko aya kuchiShona',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'mms_asr',
    mmsTTSCode: 'sna',
    mmsASRCode: 'sna',
    region: 'Africa (South)',
    notes: 'MMS TTS verified available'
  },
  {
    code: 'lg',
    name: 'Luganda',
    nativeName: 'Luganda',
    flag: '🇺🇬',
    color: 'bg-black',
    translateText: 'Vvuunula obubaka buno mu Luganda',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'mms_asr',
    mmsTTSCode: 'lug',
    mmsASRCode: 'lug',
    region: 'Africa (East)',
    notes: 'MMS TTS verified available'
  },
  {
    code: 'om',
    name: 'Oromo',
    nativeName: 'Afaan Oromoo',
    flag: '🇪🇹',
    color: 'bg-red-500',
    translateText: "Ergaa kana gara Afaan Oromootti hiiki",
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'mms_asr',
    mmsTTSCode: 'orm',
    mmsASRCode: 'orm',
    region: 'Africa (East)',
    notes: 'MMS TTS verified available'
  },
  {
    code: 'ti',
    name: 'Tigrinya',
    nativeName: 'ትግርኛ',
    flag: '🇪🇷',
    color: 'bg-blue-500',
    translateText: 'ነዚ መልእኽቲ ናብ ትግርኛ ተርጉሞ',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'mms_asr',
    mmsTTSCode: 'tir',
    mmsASRCode: 'tir',
    region: 'Africa (East)',
    notes: 'MMS TTS verified available'
  },
  {
    code: 'ny',
    name: 'Chichewa',
    nativeName: 'Chinyanja',
    flag: '🇲🇼',
    color: 'bg-red-600',
    translateText: 'Tamuzirani uthenga uwu ku Chichewa',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'mms_asr',
    mmsTTSCode: 'nya',
    mmsASRCode: 'nya',
    region: 'Africa (South)',
    notes: 'MMS TTS verified available'
  },
  {
    code: 'ee',
    name: 'Ewe',
    nativeName: 'Eʋegbe',
    flag: '🇬🇭',
    color: 'bg-green-600',
    translateText: 'Ɖe gbe sia gɔme na Eʋegbe',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'mms_asr',
    mmsTTSCode: 'ewe',
    mmsASRCode: 'ewe',
    region: 'Africa (West)',
    notes: 'MMS TTS verified available'
  },
  {
    code: 'mg',
    name: 'Malagasy',
    nativeName: 'Malagasy',
    flag: '🇲🇬',
    color: 'bg-red-500',
    translateText: 'Adikao amin\'ny teny Malagasy ity hafatra ity',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'mms_asr',
    mmsTTSCode: 'mlg',
    mmsASRCode: 'mlg',
    region: 'Africa (East)',
    notes: 'MMS TTS verified available'
  },
  {
    code: 'so',
    name: 'Somali',
    nativeName: 'Soomaali',
    flag: '🇸🇴',
    color: 'bg-blue-500',
    translateText: 'Fariintaan u tarjum Soomaali',
    supportsTTS: true,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'mms',
    sttEngine: 'mms_asr',
    mmsTTSCode: 'som',
    mmsASRCode: 'som',
    region: 'Africa (East)',
    notes: 'MMS TTS verified available'
  },

  // =========================================================================
  // LANGUES AFRICAINES - SANS TTS (transcription et traduction uniquement)
  // =========================================================================
  {
    code: 'ln',
    name: 'Lingala',
    nativeName: 'Lingála',
    flag: '🇨🇩',
    color: 'bg-blue-500',
    translateText: 'Kobongola nsango oyo na Lingala',
    supportsTTS: false,  // TTS NOT AVAILABLE (HTTP 403)
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'none',
    sttEngine: 'mms_asr',
    mmsASRCode: 'lin',
    region: 'Africa (Central)',
    notes: 'TTS not available - transcription and translation only'
  },
  {
    code: 'ig',
    name: 'Igbo',
    nativeName: 'Igbo',
    flag: '🇳🇬',
    color: 'bg-green-600',
    translateText: "Tụgharịa ozi a n'Igbo",
    supportsTTS: false,  // TTS NOT AVAILABLE (HTTP 403)
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'none',
    sttEngine: 'mms_asr',
    mmsASRCode: 'ibo',
    region: 'Africa (West)',
    notes: 'TTS not available - transcription and translation only'
  },
  {
    code: 'zu',
    name: 'Zulu',
    nativeName: 'isiZulu',
    flag: '🇿🇦',
    color: 'bg-green-600',
    translateText: 'Humusha lo mlayezo ngesiZulu',
    supportsTTS: false,  // TTS NOT AVAILABLE
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'none',
    sttEngine: 'mms_asr',
    mmsASRCode: 'zul',
    region: 'Africa (South)',
    notes: 'TTS not available - transcription and translation only'
  },
  {
    code: 'xh',
    name: 'Xhosa',
    nativeName: 'isiXhosa',
    flag: '🇿🇦',
    color: 'bg-green-600',
    translateText: 'Guqulela lo myalezo ngesiXhosa',
    supportsTTS: false,  // TTS NOT AVAILABLE
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'none',
    sttEngine: 'mms_asr',
    mmsASRCode: 'xho',
    region: 'Africa (South)',
    notes: 'TTS not available - transcription and translation only'
  },
  {
    code: 'af',
    name: 'Afrikaans',
    nativeName: 'Afrikaans',
    flag: '🇿🇦',
    color: 'bg-green-600',
    translateText: 'Vertaal hierdie boodskap na Afrikaans',
    supportsTTS: false,  // TTS NOT AVAILABLE via MMS
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'none',
    sttEngine: 'whisper',  // Whisper supports Afrikaans
    mmsASRCode: 'afr',
    region: 'Africa (South)',
    notes: 'TTS not available - Whisper STT available'
  },
  {
    code: 'wo',
    name: 'Wolof',
    nativeName: 'Wolof',
    flag: '🇸🇳',
    color: 'bg-green-600',
    translateText: 'Tektal bataaxal bii ci Wolof',
    supportsTTS: false,  // TTS NOT AVAILABLE
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'none',
    sttEngine: 'mms_asr',
    mmsASRCode: 'wol',
    region: 'Africa (West)',
    notes: 'TTS not available - transcription and translation only'
  },

  // =========================================================================
  // LANGUES CAMEROUNAISES (Sans TTS)
  // =========================================================================
  {
    code: 'bas',
    name: 'Basaa',
    nativeName: 'Basaa',
    flag: '🇨🇲',
    color: 'bg-green-600',
    translateText: 'Traduire ce message en Basaa',
    supportsTTS: false,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'none',
    sttEngine: 'mms_asr',
    mmsASRCode: 'bas',
    region: 'Africa (Cameroon)',
    notes: 'TTS not available - transcription and translation only'
  },
  {
    code: 'ksf',
    name: 'Bafia',
    nativeName: 'Rikpa',
    flag: '🇨🇲',
    color: 'bg-green-600',
    translateText: 'Traduire ce message en Bafia',
    supportsTTS: false,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'none',
    sttEngine: 'mms_asr',
    mmsASRCode: 'ksf',
    region: 'Africa (Cameroon)',
    notes: 'TTS not available - transcription and translation only'
  },
  {
    code: 'nnh',
    name: 'Ngiemboon',
    nativeName: 'Ngiemboon',
    flag: '🇨🇲',
    color: 'bg-green-600',
    translateText: 'Traduire ce message en Ngiemboon',
    supportsTTS: false,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'none',
    sttEngine: 'mms_asr',
    mmsASRCode: 'nnh',
    region: 'Africa (Cameroon)',
    notes: 'TTS not available - transcription and translation only'
  },
  {
    code: 'dua',
    name: 'Duala',
    nativeName: 'Duala',
    flag: '🇨🇲',
    color: 'bg-green-600',
    translateText: 'Traduire ce message en Duala',
    supportsTTS: false,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'none',
    sttEngine: 'mms_asr',
    mmsASRCode: 'dua',
    region: 'Africa (Cameroon)',
    notes: 'TTS not available - transcription and translation only'
  },
  {
    code: 'ewo',
    name: 'Ewondo',
    nativeName: 'Ewondo',
    flag: '🇨🇲',
    color: 'bg-green-600',
    translateText: 'Traduire ce message en Ewondo',
    supportsTTS: false,
    supportsSTT: true,
    supportsVoiceCloning: false,
    supportsTranslation: true,
    ttsEngine: 'none',
    sttEngine: 'mms_asr',
    mmsASRCode: 'ewo',
    region: 'Africa (Cameroon)',
    notes: 'TTS not available - transcription and translation only'
  },
] as const;

// ============================================================================
// TYPE DÉRIVÉ
// ============================================================================

/**
 * Type pour les codes de langue supportés
 */
export type SupportedLanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];

// ============================================================================
// CACHE ET UTILITAIRES
// ============================================================================

/**
 * Cache pour améliorer les performances des recherches répétées
 */
const languageCache = new Map<string, SupportedLanguageInfo>();

/**
 * Initialise le cache des langues
 */
function initializeLanguageCache() {
  if (languageCache.size === 0) {
    SUPPORTED_LANGUAGES.forEach(lang => {
      languageCache.set(lang.code, lang);
    });
  }
}

// ============================================================================
// FONCTIONS DE RECHERCHE
// ============================================================================

/**
 * Obtient les informations complètes d'une langue par son code
 */
export function getLanguageInfo(code: string | undefined): SupportedLanguageInfo {
  initializeLanguageCache();

  const normalizedCode = code?.toLowerCase().trim() ?? '';

  if (normalizedCode === '' || normalizedCode === 'unknown') {
    return languageCache.get('fr')!;
  }

  const found = languageCache.get(normalizedCode);

  if (found) {
    return found;
  }

  // Fallback pour langues non supportées
  return {
    code: normalizedCode,
    name: normalizedCode.toUpperCase(),
    flag: '🌐',
    color: 'bg-gray-500',
    translateText: `Translate this message to ${normalizedCode}`,
    supportsTTS: false,
    supportsSTT: false,
    supportsVoiceCloning: false,
    supportsTranslation: false,
    ttsEngine: 'none',
    sttEngine: 'none',
    region: 'Europe'
  };
}

/**
 * Obtient le nom d'une langue par son code
 */
export function getLanguageName(code: string | undefined): string {
  return getLanguageInfo(code).name;
}

/**
 * Obtient le drapeau d'une langue par son code
 */
export function getLanguageFlag(code: string | undefined): string {
  return getLanguageInfo(code).flag;
}

/**
 * Obtient la couleur d'une langue par son code
 */
export function getLanguageColor(code: string | undefined): string {
  return getLanguageInfo(code).color || 'bg-gray-500';
}

/**
 * Obtient le texte de traduction d'une langue par son code
 */
export function getLanguageTranslateText(code: string | undefined): string {
  const lang = getLanguageInfo(code);
  return lang.translateText || `Translate this message to ${lang.name}`;
}

/**
 * Vérifie si un code de langue est supporté
 */
export function isSupportedLanguage(code: string | undefined): boolean {
  if (!code) return false;
  initializeLanguageCache();
  return languageCache.has(code.toLowerCase().trim());
}

/**
 * Obtient tous les codes de langue supportés
 */
export function getSupportedLanguageCodes(): string[] {
  return SUPPORTED_LANGUAGES.map(lang => lang.code);
}

// ============================================================================
// FONCTIONS DE FILTRAGE PAR CAPACITÉ
// ============================================================================

/**
 * Filtre les langues supportées selon un critère
 */
export function filterSupportedLanguages(
  predicate: (lang: SupportedLanguageInfo) => boolean
): SupportedLanguageInfo[] {
  return SUPPORTED_LANGUAGES.filter(predicate);
}

/**
 * Obtient les langues qui supportent TTS (synthèse vocale)
 */
export function getLanguagesWithTTS(): SupportedLanguageInfo[] {
  return SUPPORTED_LANGUAGES.filter(lang => lang.supportsTTS);
}

/**
 * Obtient les langues qui supportent STT (transcription)
 */
export function getLanguagesWithSTT(): SupportedLanguageInfo[] {
  return SUPPORTED_LANGUAGES.filter(lang => lang.supportsSTT);
}

/**
 * Obtient les langues qui supportent le clonage vocal
 */
export function getLanguagesWithVoiceCloning(): SupportedLanguageInfo[] {
  return SUPPORTED_LANGUAGES.filter(lang => lang.supportsVoiceCloning);
}

/**
 * Obtient les langues qui supportent la traduction
 */
export function getLanguagesWithTranslation(): SupportedLanguageInfo[] {
  return SUPPORTED_LANGUAGES.filter(lang => lang.supportsTranslation);
}

/**
 * Obtient les langues par région
 */
export function getLanguagesByRegion(region: LanguageRegion | string): SupportedLanguageInfo[] {
  return SUPPORTED_LANGUAGES.filter(lang =>
    lang.region.toLowerCase().includes(region.toLowerCase())
  );
}

/**
 * Obtient les langues africaines
 */
export function getAfricanLanguages(): SupportedLanguageInfo[] {
  return SUPPORTED_LANGUAGES.filter(lang => lang.region.includes('Africa'));
}

/**
 * Obtient les langues qui nécessitent MMS pour TTS
 */
export function getMMSTTSLanguages(): SupportedLanguageInfo[] {
  return SUPPORTED_LANGUAGES.filter(lang => lang.ttsEngine === 'mms');
}

// ============================================================================
// STATISTIQUES
// ============================================================================

/**
 * Obtient des statistiques sur les langues supportées
 */
export function getLanguageStats() {
  const all = SUPPORTED_LANGUAGES;
  return {
    total: all.length,
    withTTS: all.filter(l => l.supportsTTS).length,
    withSTT: all.filter(l => l.supportsSTT).length,
    withVoiceCloning: all.filter(l => l.supportsVoiceCloning).length,
    withTranslation: all.filter(l => l.supportsTranslation).length,
    byTTSEngine: {
      chatterbox: all.filter(l => l.ttsEngine === 'chatterbox').length,
      xtts: all.filter(l => l.ttsEngine === 'xtts').length,
      mms: all.filter(l => l.ttsEngine === 'mms').length,
      none: all.filter(l => l.ttsEngine === 'none').length,
    },
    bySTTEngine: {
      whisper: all.filter(l => l.sttEngine === 'whisper').length,
      mms_asr: all.filter(l => l.sttEngine === 'mms_asr').length,
      none: all.filter(l => l.sttEngine === 'none').length,
    },
    byRegion: {
      europe: all.filter(l => l.region === 'Europe').length,
      asia: all.filter(l => l.region === 'Asia').length,
      middleEast: all.filter(l => l.region === 'Middle East').length,
      africa: all.filter(l => l.region.includes('Africa')).length,
    }
  };
}

// ============================================================================
// INTERFACE POUR STATISTIQUES DE LANGUES (compatibilité)
// ============================================================================

export interface LanguageStats {
  language: string;
  flag: string;
  count: number;
  color: string;
}

// ============================================================================
// CONSTANTES UTILITAIRES
// ============================================================================

export const MAX_MESSAGE_LENGTH = 2000;
export const TOAST_SHORT_DURATION = 2000;
export const TOAST_LONG_DURATION = 3000;
export const TOAST_ERROR_DURATION = 5000;
export const TYPING_CANCELATION_DELAY = 2000;
