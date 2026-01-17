import type { BrowserTranscription, VoiceProfileSegment, VoicePreviewSample } from '@meeshy/shared/types/voice-api';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

export const READING_TEXTS: Record<string, string> = {
  // Langues européennes
  fr: "Bonjour, je suis en train de créer mon profil vocal pour Meeshy. Cette phrase permettra de cloner ma voix dans différentes langues. J'aime communiquer avec des personnes du monde entier et cette technologie va m'aider à le faire plus facilement.",
  en: "Hello, I am creating my voice profile for Meeshy. This sentence will allow my voice to be cloned in different languages. I love communicating with people from around the world and this technology will help me do it more easily.",
  es: "Hola, estoy creando mi perfil de voz para Meeshy. Esta frase permitirá clonar mi voz en diferentes idiomas. Me encanta comunicarme con personas de todo el mundo y esta tecnología me ayudará a hacerlo más fácilmente.",
  de: "Hallo, ich erstelle gerade mein Stimmprofil für Meeshy. Dieser Satz ermöglicht es, meine Stimme in verschiedenen Sprachen zu klonen. Ich kommuniziere gerne mit Menschen aus der ganzen Welt und diese Technologie wird mir dabei helfen.",
  pt: "Olá, estou criando meu perfil de voz para o Meeshy. Esta frase permitirá clonar minha voz em diferentes idiomas. Adoro me comunicar com pessoas de todo o mundo e essa tecnologia vai me ajudar a fazer isso mais facilmente.",
  it: "Ciao, sto creando il mio profilo vocale per Meeshy. Questa frase permetterà di clonare la mia voce in diverse lingue. Amo comunicare con persone di tutto il mondo e questa tecnologia mi aiuterà a farlo più facilmente.",
  nl: "Hallo, ik maak mijn stemprofiel aan voor Meeshy. Deze zin maakt het mogelijk om mijn stem te klonen in verschillende talen. Ik communiceer graag met mensen van over de hele wereld en deze technologie zal me daarbij helpen.",
  ru: "Привет, я создаю свой голосовой профиль для Meeshy. Это предложение позволит клонировать мой голос на разных языках. Мне нравится общаться с людьми со всего мира, и эта технология поможет мне делать это легче.",
  // Langues asiatiques
  zh: "你好，我正在为Meeshy创建我的语音档案。这句话将允许我的声音被克隆成不同的语言。我喜欢与来自世界各地的人交流，这项技术将帮助我更轻松地做到这一点。",
  ja: "こんにちは、Meeshyのボイスプロファイルを作成しています。このフレーズにより、私の声を様々な言語でクローンすることができます。世界中の人々とコミュニケーションを取るのが大好きで、この技術がそれをより簡単にしてくれます。",
  ko: "안녕하세요, 저는 Meeshy를 위해 음성 프로필을 만들고 있습니다. 이 문장을 통해 제 목소리를 다양한 언어로 복제할 수 있습니다. 저는 전 세계 사람들과 소통하는 것을 좋아하고, 이 기술이 그것을 더 쉽게 해줄 것입니다.",
  ar: "مرحباً، أقوم بإنشاء ملفي الصوتي لـ Meeshy. ستسمح هذه الجملة باستنساخ صوتي بلغات مختلفة. أحب التواصل مع أشخاص من جميع أنحاء العالم وستساعدني هذه التقنية على القيام بذلك بسهولة أكبر.",
  // Langues africaines (MMS-TTS pipeline hybride)
  sw: "Habari, ninaunda wasifu wangu wa sauti kwa Meeshy. Sentensi hii itaruhusu sauti yangu kuigwa katika lugha tofauti. Napenda kuwasiliana na watu kutoka duniani kote na teknolojia hii itanisaidia kufanya hivyo kwa urahisi zaidi.",
  am: "ሰላም፣ ለMeeshy የድምፄን መገለጫ እየፈጠርኩ ነው። ይህ ዓረፍተ ነገር ድምፄን በተለያዩ ቋንቋዎች እንዲባዛ ያስችላል። ከዓለም ዙሪያ ካሉ ሰዎች ጋር መግባባት እወዳለሁ እናም ይህ ቴክኖሎጂ ይህን በቀላሉ እንድሰራ ይረዳኛል።",
  ha: "Sannu, ina ƙirƙirar bayanin muryata don Meeshy. Wannan jimla za ta ba da damar kwafin muryata cikin harsuna daban-daban. Ina son sadarwa da mutane daga ko'ina cikin duniya kuma wannan fasaha za ta taimake ni yin hakan cikin sauƙi.",
  yo: "Pẹlẹ o, mo n ṣẹda profaili ohùn mi fun Meeshy. Gbolohun yii yoo gba laaye lati ṣe ẹda ohùn mi ni awọn ede oriṣiriṣi. Mo fẹran lati ba awọn eniyan lati gbogbo agbaye sọrọ ati pe imọ-ẹrọ yii yoo ran mi lọwọ lati ṣe eyi ni irọrun.",
  zu: "Sawubona, ngidala iphrofayili yami yezwi ku-Meeshy. Lo musho uzovumela izwi lami lilinganiswe ngezilimi ezahlukene. Ngiyathanda ukuxhumana nabantu abavela emhlabeni wonke futhi le theknoloji izongisiza ngikwenze lokhu kalula.",
  ln: "Mbote, nazali kosala profil ya mongongo na ngai mpo na Meeshy. Frazi oyo ekopesa nzela mongongo na ngai ezala kopanzama na minoko ndenge na ndenge. Nalingaka kosolola na bato ya mokili mobimba mpe teknoloji oyo ekosalisa ngai kosala yango na pɛtɛɛ.",
};

export const CLONE_PREVIEW_LANGUAGES = ['fr', 'en', 'es', 'de', 'pt', 'it', 'zh', 'ja'];

export const AVAILABLE_LANGUAGES: Array<{ code: string; name: string; nativeName: string; region?: string }> = [
  // Langues européennes
  { code: 'fr', name: 'French', nativeName: 'Français', region: 'europe' },
  { code: 'en', name: 'English', nativeName: 'English', region: 'europe' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', region: 'europe' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', region: 'europe' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', region: 'europe' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', region: 'europe' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', region: 'europe' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', region: 'europe' },
  // Langues asiatiques
  { code: 'zh', name: 'Chinese', nativeName: '中文', region: 'asia' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', region: 'asia' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', region: 'asia' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', region: 'asia' },
  // Langues africaines (pour tester pipeline hybride MMS-TTS)
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', region: 'africa' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ', region: 'africa' },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa', region: 'africa' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá', region: 'africa' },
  { code: 'zu', name: 'Zulu', nativeName: 'isiZulu', region: 'africa' },
  { code: 'ln', name: 'Lingala', nativeName: 'Lingála', region: 'africa' },
];

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface StoredRecording {
  audioBlob: Blob;
  recordingTime: number;
  browserTranscription: BrowserTranscription | null;
  liveTranscript: string;
  transcriptSegments: VoiceProfileSegment[];
  savedAt: string;
}

export interface StoredVoicePreview {
  id: string; // `${userId}_${language}`
  userId: string;
  language: string;
  originalText: string;
  translatedText: string;
  audioBlob: Blob;
  audioFormat: string;
  durationMs: number;
  generatedAt: string;
  profileVersion: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// INDEXEDDB STORAGE
// ═══════════════════════════════════════════════════════════════════════════

const VOICE_PROFILE_DB_NAME = 'meeshy-voice-profile';
const VOICE_PROFILE_STORE_NAME = 'recordings';
const VOICE_PROFILE_KEY = 'pending-recording';
const VOICE_PREVIEWS_STORE_NAME = 'voicePreviews';

export const openVoiceProfileDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(VOICE_PROFILE_DB_NAME, 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(VOICE_PROFILE_STORE_NAME)) {
        db.createObjectStore(VOICE_PROFILE_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(VOICE_PREVIEWS_STORE_NAME)) {
        const previewStore = db.createObjectStore(VOICE_PREVIEWS_STORE_NAME, { keyPath: 'id' });
        previewStore.createIndex('userId', 'userId');
        previewStore.createIndex('language', 'language');
      }
    };
  });
};

export const saveRecordingToStorage = async (recording: StoredRecording): Promise<void> => {
  try {
    const db = await openVoiceProfileDB();
    const tx = db.transaction(VOICE_PROFILE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(VOICE_PROFILE_STORE_NAME);
    store.put(recording, VOICE_PROFILE_KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    console.log('[VoiceProfile] Recording saved to IndexedDB');
  } catch (err) {
    console.error('[VoiceProfile] Error saving recording to IndexedDB:', err);
  }
};

export const loadRecordingFromStorage = async (): Promise<StoredRecording | null> => {
  try {
    const db = await openVoiceProfileDB();
    const tx = db.transaction(VOICE_PROFILE_STORE_NAME, 'readonly');
    const store = tx.objectStore(VOICE_PROFILE_STORE_NAME);
    const request = store.get(VOICE_PROFILE_KEY);
    const result = await new Promise<StoredRecording | null>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (result) {
      console.log('[VoiceProfile] Recording loaded from IndexedDB, saved at:', result.savedAt);
    }
    return result;
  } catch (err) {
    console.error('[VoiceProfile] Error loading recording from IndexedDB:', err);
    return null;
  }
};

export const clearRecordingFromStorage = async (): Promise<void> => {
  try {
    const db = await openVoiceProfileDB();
    const tx = db.transaction(VOICE_PROFILE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(VOICE_PROFILE_STORE_NAME);
    store.delete(VOICE_PROFILE_KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    console.log('[VoiceProfile] Recording cleared from IndexedDB');
  } catch (err) {
    console.error('[VoiceProfile] Error clearing recording from IndexedDB:', err);
  }
};

export const saveVoicePreviewsToStorage = async (
  userId: string,
  previews: VoicePreviewSample[],
  profileVersion: number
): Promise<void> => {
  try {
    const db = await openVoiceProfileDB();
    const tx = db.transaction(VOICE_PREVIEWS_STORE_NAME, 'readwrite');
    const store = tx.objectStore(VOICE_PREVIEWS_STORE_NAME);

    for (const preview of previews) {
      const audioBlob = base64ToBlob(preview.audioBase64, preview.audioFormat);
      const storedPreview: StoredVoicePreview = {
        id: `${userId}_${preview.language}`,
        userId,
        language: preview.language,
        originalText: preview.originalText,
        translatedText: preview.translatedText,
        audioBlob,
        audioFormat: preview.audioFormat,
        durationMs: preview.durationMs,
        generatedAt: preview.generatedAt,
        profileVersion,
      };
      store.put(storedPreview);
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    console.log('[VoiceProfile] Voice previews saved to IndexedDB');
  } catch (err) {
    console.error('[VoiceProfile] Error saving voice previews to IndexedDB:', err);
  }
};

export const loadVoicePreviewsFromStorage = async (userId: string): Promise<StoredVoicePreview[]> => {
  try {
    const db = await openVoiceProfileDB();
    const tx = db.transaction(VOICE_PREVIEWS_STORE_NAME, 'readonly');
    const store = tx.objectStore(VOICE_PREVIEWS_STORE_NAME);
    const index = store.index('userId');
    const request = index.getAll(userId);
    const result = await new Promise<StoredVoicePreview[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    db.close();
    console.log('[VoiceProfile] Voice previews loaded from IndexedDB:', result.length);
    return result;
  } catch (err) {
    console.error('[VoiceProfile] Error loading voice previews from IndexedDB:', err);
    return [];
  }
};

export const clearVoicePreviewsFromStorage = async (userId: string): Promise<void> => {
  try {
    const db = await openVoiceProfileDB();
    const tx = db.transaction(VOICE_PREVIEWS_STORE_NAME, 'readwrite');
    const store = tx.objectStore(VOICE_PREVIEWS_STORE_NAME);
    const index = store.index('userId');
    const request = index.getAllKeys(userId);
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    for (const key of keys) {
      store.delete(key);
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    console.log('[VoiceProfile] Voice previews cleared from IndexedDB');
  } catch (err) {
    console.error('[VoiceProfile] Error clearing voice previews from IndexedDB:', err);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

export const base64ToBlob = (base64: string, mimeType: string): Blob => {
  // Supprimer le préfixe data:audio/... si présent
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
  const byteCharacters = atob(base64Data);
  const byteArrays: Uint8Array[] = [];

  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }

  return new Blob(byteArrays, { type: mimeType });
};
