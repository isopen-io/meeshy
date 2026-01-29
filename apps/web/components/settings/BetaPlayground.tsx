'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  Cpu,
  Languages,
  Mic,
  Volume2,
  Zap,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Play,
  Square,
  Download
} from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/useI18n';

// Types pour les capacités du navigateur
interface BrowserCapabilities {
  webLLM: boolean;
  translation: boolean;
  speechRecognition: boolean;
  speechSynthesis: boolean;
}

// Types pour les métriques
interface ModelMetrics {
  latency: number;
  tokensPerSecond?: number;
  charactersProcessed?: number;
  modelSize?: number;
  status: 'idle' | 'loading' | 'running' | 'success' | 'error';
  error?: string;
}

// Interface pour Web Speech API
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

// Déclaration globale pour TypeScript
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
    translation?: {
      canTranslate?: (options: { sourceLanguage: string; targetLanguage: string }) => Promise<string>;
      createTranslator?: (options: { sourceLanguage: string; targetLanguage: string }) => Promise<any>;
    };
    ai?: {
      languageModel?: {
        capabilities?: () => Promise<{ available: string }>;
        create?: (options?: any) => Promise<any>;
      };
    };
  }
}

export function BetaPlayground() {
  const { t } = useI18n('settings');

  // État global
  const [edgeModelsEnabled, setEdgeModelsEnabled] = useState(false);
  const [capabilities, setCapabilities] = useState<BrowserCapabilities>({
    webLLM: false,
    translation: false,
    speechRecognition: false,
    speechSynthesis: false,
  });

  // États pour chaque modèle
  const [llmInput, setLlmInput] = useState('');
  const [llmOutput, setLlmOutput] = useState('');
  const [llmMetrics, setLlmMetrics] = useState<ModelMetrics>({
    latency: 0,
    tokensPerSecond: 0,
    status: 'idle',
  });

  const [translationInput, setTranslationInput] = useState('');
  const [translationOutput, setTranslationOutput] = useState('');
  const [translationSourceLang, setTranslationSourceLang] = useState('en');
  const [translationTargetLang, setTranslationTargetLang] = useState('fr');
  const [translationMetrics, setTranslationMetrics] = useState<ModelMetrics>({
    latency: 0,
    charactersProcessed: 0,
    status: 'idle',
  });

  const [transcriptionOutput, setTranscriptionOutput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [transcriptionMetrics, setTranscriptionMetrics] = useState<ModelMetrics>({
    latency: 0,
    status: 'idle',
  });
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const [ttsInput, setTtsInput] = useState('');
  const [ttsVoice, setTtsVoice] = useState<string>('');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [ttsMetrics, setTtsMetrics] = useState<ModelMetrics>({
    latency: 0,
    status: 'idle',
  });

  // Détection des capacités du navigateur
  useEffect(() => {
    const detectCapabilities = async () => {
      const caps: BrowserCapabilities = {
        webLLM: false,
        translation: false,
        speechRecognition: false,
        speechSynthesis: false,
      };

      // Vérifier Web LLM API (Chrome Built-in AI)
      try {
        if (window.ai && window.ai.languageModel) {
          const available = await window.ai.languageModel.capabilities?.();
          caps.webLLM = available?.available === 'readily';
        }
      } catch (error) {
        console.log('[BetaPlayground] Web LLM not available:', error);
      }

      // Vérifier Translation API
      try {
        if (window.translation && window.translation.canTranslate) {
          const canTranslate = await window.translation.canTranslate({
            sourceLanguage: 'en',
            targetLanguage: 'fr',
          });
          caps.translation = canTranslate === 'readily';
        }
      } catch (error) {
        console.log('[BetaPlayground] Translation API not available:', error);
      }

      // Vérifier Web Speech API (Reconnaissance vocale)
      caps.speechRecognition = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

      // Vérifier Web Speech Synthesis API
      caps.speechSynthesis = 'speechSynthesis' in window;

      setCapabilities(caps);
    };

    detectCapabilities();
  }, []);

  // Charger les voix disponibles pour TTS
  useEffect(() => {
    if (capabilities.speechSynthesis) {
      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        setAvailableVoices(voices);
        if (voices.length > 0 && !ttsVoice) {
          setTtsVoice(voices[0].name);
        }
      };

      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, [capabilities.speechSynthesis, ttsVoice]);

  // Charger les paramètres depuis localStorage
  useEffect(() => {
    const saved = localStorage.getItem('meeshy-beta-playground');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setEdgeModelsEnabled(data.enabled || false);
        if (data.llmInput) setLlmInput(data.llmInput);
        if (data.translationInput) setTranslationInput(data.translationInput);
        if (data.ttsInput) setTtsInput(data.ttsInput);
      } catch (error) {
        console.error('[BetaPlayground] Error loading saved state:', error);
      }
    }
  }, []);

  // Sauvegarder dans localStorage
  const saveToLocalStorage = useCallback(() => {
    const data = {
      enabled: edgeModelsEnabled,
      llmInput,
      translationInput,
      ttsInput,
      timestamp: Date.now(),
    };
    localStorage.setItem('meeshy-beta-playground', JSON.stringify(data));
  }, [edgeModelsEnabled, llmInput, translationInput, ttsInput]);

  useEffect(() => {
    saveToLocalStorage();
  }, [saveToLocalStorage]);

  // Handler pour LLM Edge
  const handleLLMTest = async () => {
    if (!llmInput.trim()) {
      toast.error(t('betaPlayground.errors.emptyInput'));
      return;
    }

    setLlmMetrics({ ...llmMetrics, status: 'loading' });
    const startTime = performance.now();

    try {
      if (!capabilities.webLLM) {
        throw new Error('Web LLM API not available');
      }

      // Utiliser Chrome Built-in AI
      const session = await window.ai?.languageModel?.create?.();
      const result = await session.prompt(llmInput);

      const endTime = performance.now();
      const latency = endTime - startTime;
      const tokensPerSecond = result.length / (latency / 1000);

      setLlmOutput(result);
      setLlmMetrics({
        latency,
        tokensPerSecond: Math.round(tokensPerSecond),
        status: 'success',
      });
      toast.success(t('betaPlayground.success.llm'));
    } catch (error) {
      const endTime = performance.now();
      setLlmMetrics({
        latency: endTime - startTime,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      setLlmOutput(t('betaPlayground.errors.llmNotAvailable'));
      toast.error(t('betaPlayground.errors.llmFailed'));
    }
  };

  // Handler pour Translation
  const handleTranslationTest = async () => {
    if (!translationInput.trim()) {
      toast.error(t('betaPlayground.errors.emptyInput'));
      return;
    }

    setTranslationMetrics({ ...translationMetrics, status: 'loading' });
    const startTime = performance.now();

    try {
      if (!capabilities.translation) {
        throw new Error('Translation API not available');
      }

      const translator = await window.translation?.createTranslator?.({
        sourceLanguage: translationSourceLang,
        targetLanguage: translationTargetLang,
      });
      const result = await translator.translate(translationInput);

      const endTime = performance.now();
      const latency = endTime - startTime;

      setTranslationOutput(result);
      setTranslationMetrics({
        latency,
        charactersProcessed: translationInput.length,
        status: 'success',
      });
      toast.success(t('betaPlayground.success.translation'));
    } catch (error) {
      const endTime = performance.now();
      setTranslationMetrics({
        latency: endTime - startTime,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      setTranslationOutput(t('betaPlayground.errors.translationNotAvailable'));
      toast.error(t('betaPlayground.errors.translationFailed'));
    }
  };

  // Handler pour Speech Recognition
  const handleTranscriptionToggle = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      startTranscription();
    }
  };

  const startTranscription = async () => {
    try {
      if (!capabilities.speechRecognition) {
        throw new Error('Speech Recognition not available');
      }

      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognitionAPI();

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      const startTime = performance.now();

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = Array.from(event.results)
          .map((result) => result[0].transcript)
          .join('');

        setTranscriptionOutput(transcript);

        if (event.results[event.resultIndex].isFinal) {
          const endTime = performance.now();
          setTranscriptionMetrics({
            latency: endTime - startTime,
            status: 'success',
          });
        }
      };

      recognition.onerror = (event: Event) => {
        console.error('[BetaPlayground] Speech recognition error:', event);
        setTranscriptionMetrics({
          latency: 0,
          status: 'error',
          error: 'Speech recognition error',
        });
        setIsRecording(false);
        toast.error(t('betaPlayground.errors.transcriptionFailed'));
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
      setTranscriptionMetrics({ ...transcriptionMetrics, status: 'running' });
      toast.success(t('betaPlayground.success.transcriptionStarted'));
    } catch (error) {
      setTranscriptionMetrics({
        latency: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      toast.error(t('betaPlayground.errors.transcriptionNotAvailable'));
    }
  };

  // Handler pour TTS
  const handleTTSTest = () => {
    if (!ttsInput.trim()) {
      toast.error(t('betaPlayground.errors.emptyInput'));
      return;
    }

    if (!capabilities.speechSynthesis) {
      toast.error(t('betaPlayground.errors.ttsNotAvailable'));
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const startTime = performance.now();
    setTtsMetrics({ ...ttsMetrics, status: 'running' });

    const utterance = new SpeechSynthesisUtterance(ttsInput);

    const selectedVoice = availableVoices.find((v) => v.name === ttsVoice);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
    };

    utterance.onend = () => {
      const endTime = performance.now();
      setIsSpeaking(false);
      setTtsMetrics({
        latency: endTime - startTime,
        status: 'success',
      });
      toast.success(t('betaPlayground.success.tts'));
    };

    utterance.onerror = (event) => {
      const endTime = performance.now();
      setIsSpeaking(false);
      setTtsMetrics({
        latency: endTime - startTime,
        status: 'error',
        error: event.error,
      });
      toast.error(t('betaPlayground.errors.ttsFailed'));
    };

    window.speechSynthesis.speak(utterance);
  };

  // Composant pour afficher les métriques
  const MetricsDisplay = ({ metrics }: { metrics: ModelMetrics }) => (
    <div className="mt-4 p-3 bg-muted/50 rounded-lg space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{t('betaPlayground.metrics.status')}:</span>
        <Badge
          variant={
            metrics.status === 'success'
              ? 'default'
              : metrics.status === 'error'
              ? 'destructive'
              : 'secondary'
          }
        >
          {metrics.status === 'loading' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {metrics.status === 'success' && <CheckCircle2 className="mr-1 h-3 w-3" />}
          {metrics.status === 'error' && <AlertCircle className="mr-1 h-3 w-3" />}
          {t(`betaPlayground.metrics.statusValues.${metrics.status}`)}
        </Badge>
      </div>
      {metrics.latency > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t('betaPlayground.metrics.latency')}:</span>
          <span className="font-mono tabular-nums">{metrics.latency.toFixed(2)} ms</span>
        </div>
      )}
      {metrics.tokensPerSecond !== undefined && metrics.tokensPerSecond > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t('betaPlayground.metrics.tokensPerSecond')}:</span>
          <span className="font-mono tabular-nums">{metrics.tokensPerSecond} tok/s</span>
        </div>
      )}
      {metrics.charactersProcessed !== undefined && metrics.charactersProcessed > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t('betaPlayground.metrics.charactersProcessed')}:</span>
          <span className="font-mono tabular-nums">{metrics.charactersProcessed}</span>
        </div>
      )}
      {metrics.error && (
        <div className="text-sm text-destructive">
          {t('betaPlayground.metrics.error')}: {metrics.error}
        </div>
      )}
    </div>
  );

  // Composant pour afficher l'état de disponibilité
  const CapabilityBadge = ({ available }: { available: boolean }) => (
    <Badge variant={available ? 'default' : 'secondary'} className="ml-2">
      {available ? (
        <>
          <CheckCircle2 className="mr-1 h-3 w-3" />
          {t('betaPlayground.capabilities.available')}
        </>
      ) : (
        <>
          <AlertCircle className="mr-1 h-3 w-3" />
          {t('betaPlayground.capabilities.notAvailable')}
        </>
      )}
    </Badge>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                {t('betaPlayground.title')}
              </CardTitle>
              <CardDescription className="mt-2">
                {t('betaPlayground.description')}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="edge-models-toggle">
                {t('betaPlayground.enableEdgeModels')}
              </Label>
              <Switch
                id="edge-models-toggle"
                checked={edgeModelsEnabled}
                onCheckedChange={setEdgeModelsEnabled}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!edgeModelsEnabled ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('betaPlayground.enableToTest')}
            </div>
          ) : (
            <Tabs defaultValue="llm" className="w-full">
              <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
                <TabsTrigger value="llm" className="flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('betaPlayground.tabs.llm')}</span>
                  <span className="sm:hidden">{t('betaPlayground.tabs.llmShort')}</span>
                </TabsTrigger>
                <TabsTrigger value="translation" className="flex items-center gap-2">
                  <Languages className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('betaPlayground.tabs.translation')}</span>
                  <span className="sm:hidden">{t('betaPlayground.tabs.translationShort')}</span>
                </TabsTrigger>
                <TabsTrigger value="transcription" className="flex items-center gap-2">
                  <Mic className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('betaPlayground.tabs.transcription')}</span>
                  <span className="sm:hidden">{t('betaPlayground.tabs.transcriptionShort')}</span>
                </TabsTrigger>
                <TabsTrigger value="tts" className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('betaPlayground.tabs.tts')}</span>
                  <span className="sm:hidden">{t('betaPlayground.tabs.ttsShort')}</span>
                </TabsTrigger>
              </TabsList>

              {/* LLM Tab */}
              <TabsContent value="llm" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">
                    {t('betaPlayground.llm.title')}
                  </h3>
                  <CapabilityBadge available={capabilities.webLLM} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('betaPlayground.llm.description')}
                </p>

                <div className="space-y-2">
                  <Label htmlFor="llm-input">{t('betaPlayground.llm.inputLabel')}</Label>
                  <Textarea
                    id="llm-input"
                    placeholder={t('betaPlayground.llm.inputPlaceholder')}
                    value={llmInput}
                    onChange={(e) => setLlmInput(e.target.value)}
                    rows={4}
                    disabled={!capabilities.webLLM}
                  />
                </div>

                <Button
                  onClick={handleLLMTest}
                  disabled={!capabilities.webLLM || llmMetrics.status === 'loading'}
                  className="w-full"
                >
                  {llmMetrics.status === 'loading' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('betaPlayground.actions.generating')}
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      {t('betaPlayground.actions.test')}
                    </>
                  )}
                </Button>

                {llmOutput && (
                  <div className="space-y-2">
                    <Label>{t('betaPlayground.llm.outputLabel')}</Label>
                    <div className="p-3 bg-muted rounded-lg min-h-[100px]">
                      <p className="text-sm whitespace-pre-wrap">{llmOutput}</p>
                    </div>
                  </div>
                )}

                <MetricsDisplay metrics={llmMetrics} />

                {!capabilities.webLLM && (
                  <div className="flex items-start gap-2 p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg">
                    <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium">{t('betaPlayground.llm.notAvailableTitle')}</p>
                      <p className="mt-1">{t('betaPlayground.llm.notAvailableMessage')}</p>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Translation Tab */}
              <TabsContent value="translation" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">
                    {t('betaPlayground.translation.title')}
                  </h3>
                  <CapabilityBadge available={capabilities.translation} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('betaPlayground.translation.description')}
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('betaPlayground.translation.sourceLanguage')}</Label>
                    <Select value={translationSourceLang} onValueChange={setTranslationSourceLang}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="fr">Français</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                        <SelectItem value="pt">Português</SelectItem>
                        <SelectItem value="de">Deutsch</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('betaPlayground.translation.targetLanguage')}</Label>
                    <Select value={translationTargetLang} onValueChange={setTranslationTargetLang}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="fr">Français</SelectItem>
                        <SelectItem value="es">Español</SelectItem>
                        <SelectItem value="pt">Português</SelectItem>
                        <SelectItem value="de">Deutsch</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="translation-input">{t('betaPlayground.translation.inputLabel')}</Label>
                  <Textarea
                    id="translation-input"
                    placeholder={t('betaPlayground.translation.inputPlaceholder')}
                    value={translationInput}
                    onChange={(e) => setTranslationInput(e.target.value)}
                    rows={4}
                    disabled={!capabilities.translation}
                  />
                </div>

                <Button
                  onClick={handleTranslationTest}
                  disabled={!capabilities.translation || translationMetrics.status === 'loading'}
                  className="w-full"
                >
                  {translationMetrics.status === 'loading' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('betaPlayground.actions.translating')}
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      {t('betaPlayground.actions.test')}
                    </>
                  )}
                </Button>

                {translationOutput && (
                  <div className="space-y-2">
                    <Label>{t('betaPlayground.translation.outputLabel')}</Label>
                    <div className="p-3 bg-muted rounded-lg min-h-[100px]">
                      <p className="text-sm whitespace-pre-wrap">{translationOutput}</p>
                    </div>
                  </div>
                )}

                <MetricsDisplay metrics={translationMetrics} />

                {!capabilities.translation && (
                  <div className="flex items-start gap-2 p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg">
                    <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium">{t('betaPlayground.translation.notAvailableTitle')}</p>
                      <p className="mt-1">{t('betaPlayground.translation.notAvailableMessage')}</p>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Transcription Tab */}
              <TabsContent value="transcription" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">
                    {t('betaPlayground.transcription.title')}
                  </h3>
                  <CapabilityBadge available={capabilities.speechRecognition} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('betaPlayground.transcription.description')}
                </p>

                <Button
                  onClick={handleTranscriptionToggle}
                  disabled={!capabilities.speechRecognition}
                  variant={isRecording ? 'destructive' : 'default'}
                  className="w-full"
                >
                  {isRecording ? (
                    <>
                      <Square className="mr-2 h-4 w-4" />
                      {t('betaPlayground.actions.stopRecording')}
                    </>
                  ) : (
                    <>
                      <Mic className="mr-2 h-4 w-4" />
                      {t('betaPlayground.actions.startRecording')}
                    </>
                  )}
                </Button>

                {isRecording && (
                  <div className="flex items-center gap-2 p-3 bg-red-500/10 text-red-600 dark:text-red-400 rounded-lg">
                    <div className="flex h-2 w-2 rounded-full bg-red-600 animate-pulse" />
                    <span className="text-sm font-medium">{t('betaPlayground.transcription.recording')}</span>
                  </div>
                )}

                {transcriptionOutput && (
                  <div className="space-y-2">
                    <Label>{t('betaPlayground.transcription.outputLabel')}</Label>
                    <div className="p-3 bg-muted rounded-lg min-h-[100px]">
                      <p className="text-sm whitespace-pre-wrap">{transcriptionOutput}</p>
                    </div>
                  </div>
                )}

                <MetricsDisplay metrics={transcriptionMetrics} />

                {!capabilities.speechRecognition && (
                  <div className="flex items-start gap-2 p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg">
                    <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium">{t('betaPlayground.transcription.notAvailableTitle')}</p>
                      <p className="mt-1">{t('betaPlayground.transcription.notAvailableMessage')}</p>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* TTS Tab */}
              <TabsContent value="tts" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">
                    {t('betaPlayground.tts.title')}
                  </h3>
                  <CapabilityBadge available={capabilities.speechSynthesis} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('betaPlayground.tts.description')}
                </p>

                <div className="space-y-2">
                  <Label>{t('betaPlayground.tts.voiceLabel')}</Label>
                  <Select value={ttsVoice} onValueChange={setTtsVoice} disabled={!capabilities.speechSynthesis}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('betaPlayground.tts.selectVoice')} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableVoices.map((voice) => (
                        <SelectItem key={voice.name} value={voice.name}>
                          {voice.name} ({voice.lang})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tts-input">{t('betaPlayground.tts.inputLabel')}</Label>
                  <Textarea
                    id="tts-input"
                    placeholder={t('betaPlayground.tts.inputPlaceholder')}
                    value={ttsInput}
                    onChange={(e) => setTtsInput(e.target.value)}
                    rows={4}
                    disabled={!capabilities.speechSynthesis}
                  />
                </div>

                <Button
                  onClick={handleTTSTest}
                  disabled={!capabilities.speechSynthesis}
                  variant={isSpeaking ? 'destructive' : 'default'}
                  className="w-full"
                >
                  {isSpeaking ? (
                    <>
                      <Square className="mr-2 h-4 w-4" />
                      {t('betaPlayground.actions.stopSpeaking')}
                    </>
                  ) : (
                    <>
                      <Volume2 className="mr-2 h-4 w-4" />
                      {t('betaPlayground.actions.speak')}
                    </>
                  )}
                </Button>

                {isSpeaking && (
                  <div className="flex items-center gap-2 p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg">
                    <Volume2 className="h-4 w-4 animate-pulse" />
                    <span className="text-sm font-medium">{t('betaPlayground.tts.speaking')}</span>
                  </div>
                )}

                <MetricsDisplay metrics={ttsMetrics} />

                {!capabilities.speechSynthesis && (
                  <div className="flex items-start gap-2 p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg">
                    <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium">{t('betaPlayground.tts.notAvailableTitle')}</p>
                      <p className="mt-1">{t('betaPlayground.tts.notAvailableMessage')}</p>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Browser Compatibility Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('betaPlayground.compatibility.title')}</CardTitle>
          <CardDescription>{t('betaPlayground.compatibility.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{t('betaPlayground.compatibility.webLLM')}</span>
              </div>
              <CapabilityBadge available={capabilities.webLLM} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Languages className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{t('betaPlayground.compatibility.translation')}</span>
              </div>
              <CapabilityBadge available={capabilities.translation} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{t('betaPlayground.compatibility.speechRecognition')}</span>
              </div>
              <CapabilityBadge available={capabilities.speechRecognition} />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{t('betaPlayground.compatibility.speechSynthesis')}</span>
              </div>
              <CapabilityBadge available={capabilities.speechSynthesis} />
            </div>
          </div>

          <div className="mt-4 pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              {t('betaPlayground.compatibility.note')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
