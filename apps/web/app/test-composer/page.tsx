'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageComposer, MessageComposerRef } from '@/components/common/message-composer';
import { SendButton } from '@/components/common/message-composer/SendButton';
import { usePerformanceProfile } from '@/hooks/usePerformanceProfile';
import { getAnimationConfig } from '@/constants/animations';
import { useClipboardPaste } from '@/hooks/composer/useClipboardPaste';
import { useDraftAutosave } from '@/hooks/composer/useDraftAutosave';
import { useUploadRetry } from '@/hooks/composer/useUploadRetry';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, Mic, FileText, Trash2, Reply, Image, Focus } from 'lucide-react';
import { useReplyStore } from '@/stores/reply-store';

export default function TestComposerPage() {
  // État pour le MessageComposer intégré
  const [content, setContent] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [mimeTypes, setMimeTypes] = useState<string[]>([]);
  const [sentMessages, setSentMessages] = useState<Array<{ content: string; timestamp: Date; attachments: number }>>([]);
  const composerRef = useRef<MessageComposerRef>(null);
  const { setReplyingTo, clearReply, replyingTo } = useReplyStore();

  // Simulated test messages pour la fonctionnalité reply
  const testMessages = [
    {
      id: '1',
      content: 'Bonjour! Comment ça va? Voici un message de test pour la fonctionnalité reply.',
      sender: { id: 'user1', username: 'alice', displayName: 'Alice Dupont' },
      createdAt: new Date(Date.now() - 3600000),
      attachments: [],
      translations: [{ language: 'fr', content: 'Test' }],
    },
    {
      id: '2',
      content: 'Regarde cette image intéressante! Elle montre un paysage magnifique.',
      sender: { id: 'user2', username: 'bob', displayName: 'Bob Martin' },
      createdAt: new Date(Date.now() - 7200000),
      attachments: [
        { id: 'att1', fileName: 'landscape.jpg', mimeType: 'image/jpeg', fileSize: 150000, url: 'https://via.placeholder.com/150' }
      ],
      translations: [],
    },
  ];

  // Handler pour l'envoi du composer intégré
  const handleSend = () => {
    if (!content.trim() && attachmentIds.length === 0) return;

    console.log('[TEST] Message envoyé:', {
      content,
      language: selectedLanguage,
      attachments: attachmentIds,
      mimeTypes,
      replyTo: replyingTo?.id,
    });

    setSentMessages(prev => [
      ...prev,
      {
        content,
        timestamp: new Date(),
        attachments: attachmentIds.length,
      }
    ]);

    // Reset
    setContent('');
    setAttachmentIds([]);
    setMimeTypes([]);
    clearReply();
  };

  // Handler pour les changements d'attachments
  const handleAttachmentsChange = (ids: string[], types: string[]) => {
    console.log('[TEST] Attachments changed:', ids, types);
    setAttachmentIds(ids);
    setMimeTypes(types);
  };

  // State pour les tests supplémentaires
  const [pastedImages, setPastedImages] = useState<File[]>([]);
  const [pastedText, setPastedText] = useState('');
  const [isCompressing, setIsCompressing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadAttempts, setUploadAttempts] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Hooks à tester
  const performanceProfile = usePerformanceProfile();
  const animConfig = getAnimationConfig(performanceProfile);

  const { handlePaste } = useClipboardPaste({
    onImagesPasted: (files) => {
      console.log('[TEST] Images collées:', files);
      setPastedImages(files);
    },
    onTextPasted: (text) => {
      console.log('[TEST] Texte collé:', text);
      setPastedText(text);
    },
  });

  const { saveDraft, clearDraft, draft } = useDraftAutosave({
    conversationId: 'test-conversation',
    enabled: true,
  });

  const { uploadWithRetry, retryStatus } = useUploadRetry({ maxRetries: 3 });

  // Auto-save draft quand content change
  useEffect(() => {
    saveDraft(content);
  }, [content, saveDraft]);

  // Test upload avec retry
  const testUploadRetry = async (shouldFail: boolean) => {
    setUploadAttempts(0);
    setUploadSuccess(false);
    setIsUploading(true);

    try {
      await uploadWithRetry('test-file', async () => {
        setUploadAttempts((prev) => prev + 1);
        await new Promise((resolve) => setTimeout(resolve, 500));

        if (shouldFail) {
          throw new Error('Simulated upload failure');
        }

        return { success: true, attachmentId: 'test-123' };
      });

      setUploadSuccess(true);
      console.log('[TEST] Upload réussi!');
    } catch (error) {
      console.error('[TEST] Upload échoué après retries:', error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-900 dark:to-slate-800 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-lg rounded-2xl shadow-2xl p-6 border border-white/20">
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
            🧪 MessageComposer - Test Intégré Complet
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Phase 4: Testez le composer refactorisé avec toutes ses fonctionnalités intégrées
          </p>
        </div>

        {/* MessageComposer Intégré - Section Principale */}
        <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-lg rounded-2xl shadow-2xl p-6 border border-white/20">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
            MessageComposer Intégré
          </h2>

          {/* Instructions */}
          <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border-2 border-dashed border-blue-300/50 dark:border-blue-700/50 rounded-xl p-4 mb-4">
            <div className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-3">
              💡 Fonctionnalités à tester:
            </div>
            <div className="grid md:grid-cols-2 gap-3 text-sm text-blue-600 dark:text-blue-400">
              <div className="flex items-start gap-2">
                <span className="text-lg">📋</span>
                <span><strong>Clipboard Paste:</strong> Coller une image (Ctrl+V) dans le textarea → attachment automatique</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-lg">💾</span>
                <span><strong>Draft Autosave:</strong> Le texte est sauvegardé automatiquement après 2s</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-lg">↩️</span>
                <span><strong>Reply:</strong> Cliquer "Test Reply" pour afficher la zone de réponse avec preview</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-lg">📎</span>
                <span><strong>Attachments:</strong> Cliquer le bouton trombone ou drag & drop des fichiers</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-lg">🎤</span>
                <span><strong>Audio:</strong> Cliquer le micro pour enregistrer un message vocal</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-lg">✨</span>
                <span><strong>Animations:</strong> Le bouton Send apparaît avec animation adaptive selon performance</span>
              </div>
            </div>
          </div>

          {/* Contrôles de test */}
          <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-700/30 rounded-xl">
            <div className="text-sm font-semibold mb-3 text-slate-700 dark:text-slate-300">
              Contrôles de Test:
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (replyingTo) {
                    clearReply();
                  } else {
                    setReplyingTo(testMessages[0] as any);
                  }
                }}
              >
                <Reply className="h-4 w-4 mr-2" />
                {replyingTo ? 'Clear Reply' : 'Test Reply'}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setReplyingTo(testMessages[1] as any)}
              >
                <Image className="h-4 w-4 mr-2" />
                Reply + Image
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => composerRef.current?.focus()}
              >
                <Focus className="h-4 w-4 mr-2" />
                Focus
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => composerRef.current?.clearAttachments?.()}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Attachments
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => composerRef.current?.resetTextareaSize?.()}
              >
                <FileText className="h-4 w-4 mr-2" />
                Reset Size
              </Button>
            </div>
          </div>

          {/* État en temps réel */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 p-3 rounded-lg border border-blue-200 dark:border-blue-700">
              <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">Caractères</div>
              <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{content.length}</div>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/30 p-3 rounded-lg border border-purple-200 dark:border-purple-700">
              <div className="text-xs text-purple-600 dark:text-purple-400 mb-1">Attachments</div>
              <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">{attachmentIds.length}</div>
            </div>

            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/30 dark:to-indigo-800/30 p-3 rounded-lg border border-indigo-200 dark:border-indigo-700">
              <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1">Langue</div>
              <div className="text-xl font-bold text-indigo-900 dark:text-indigo-100 uppercase">{selectedLanguage}</div>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 p-3 rounded-lg border border-green-200 dark:border-green-700">
              <div className="text-xs text-green-600 dark:text-green-400 mb-1">Reply Active</div>
              <div className="text-2xl font-bold text-green-900 dark:text-green-100">{replyingTo ? '✓' : '✗'}</div>
            </div>
          </div>

          {/* Le MessageComposer */}
          <div className="relative">
            <MessageComposer
              ref={composerRef}
              value={content}
              onChange={setContent}
              onSend={handleSend}
              selectedLanguage={selectedLanguage}
              onLanguageChange={setSelectedLanguage}
              isComposingEnabled={true}
              placeholder="Tapez votre message ici... Testez paste, reply, attachments, audio 🎤"
              onAttachmentsChange={handleAttachmentsChange}
              token="test-token-123"
              userRole="premium"
              conversationId="test-conversation-id"
              choices={[
                { value: 'en', label: 'English', flag: '🇬🇧' },
                { value: 'fr', label: 'Français', flag: '🇫🇷' },
                { value: 'es', label: 'Español', flag: '🇪🇸' },
                { value: 'de', label: 'Deutsch', flag: '🇩🇪' },
                { value: 'it', label: 'Italiano', flag: '🇮🇹' },
              ]}
            />
          </div>

          {/* Messages envoyés */}
          {sentMessages.length > 0 && (
            <div className="mt-6 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                  Messages Envoyés ({sentMessages.length})
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSentMessages([])}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Effacer
                </Button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {sentMessages.map((msg, idx) => (
                  <div key={idx} className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 rounded-lg">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-green-800 dark:text-green-300 break-words">
                          {msg.content || <em className="text-green-600">(message avec attachments uniquement)</em>}
                        </div>
                        <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                          {msg.timestamp.toLocaleTimeString()} • {msg.attachments} attachment(s)
                        </div>
                      </div>
                      <div className="text-xl text-green-600 dark:text-green-400">✓</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Debug Info */}
        <div className="bg-slate-900 text-slate-100 rounded-2xl shadow-2xl p-6">
          <h2 className="text-xl font-semibold mb-4">🔍 Debug Info - État Composer</h2>

          <div className="space-y-3 text-sm font-mono">
            <div className="bg-slate-800 p-4 rounded-lg overflow-auto">
              <div className="text-slate-400 mb-2 font-sans">État du Composer:</div>
              <pre className="text-xs">
{JSON.stringify({
  content: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
  contentLength: content.length,
  language: selectedLanguage,
  attachments: attachmentIds.length,
  hasReply: !!replyingTo,
  replyToId: replyingTo?.id,
  replyToContent: replyingTo?.content?.substring(0, 30),
  messagesSent: sentMessages.length,
}, null, 2)}
              </pre>
            </div>

            <div className="text-xs space-y-1 text-slate-400 font-sans">
              <div>• Ouvrez la console DevTools (F12) pour voir tous les logs</div>
              <div>• localStorage key: draft-test-conversation-id</div>
              <div>• Les attachments sont simulés (pas de vraie API upload pour le test)</div>
              <div>• Performance profile adaptatif selon votre device</div>
            </div>
          </div>
        </div>

        {/* Séparateur */}
        <div className="flex items-center gap-4 py-4">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 dark:via-slate-700 to-transparent"></div>
          <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            Tests Individuels des Composants (Phases 1-3)
          </div>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 dark:via-slate-700 to-transparent"></div>
        </div>

        {/* Performance Profile */}
        <section className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg rounded-xl shadow-lg p-6 border border-white/10">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            Performance Profile (Phase 1.1)
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 dark:bg-slate-700 p-4 rounded-lg">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Profil détecté</div>
              <div className="text-2xl font-bold capitalize">{performanceProfile}</div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700 p-4 rounded-lg">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Configuration</div>
              <div className="text-xs space-y-1">
                <div>Rotation: {animConfig.enableRotation ? '✅' : '❌'}</div>
                <div>Gradient: {animConfig.enableGradient ? '✅' : '❌'}</div>
                <div>Duration: {animConfig.sendButtonDuration}ms</div>
              </div>
            </div>
          </div>
        </section>

        {/* SendButton Test */}
        <section className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">SendButton (Phase 3.1)</h2>

          <div className="space-y-4">
            {/* Contrôles d'état */}
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant={isCompressing ? 'default' : 'outline'}
                onClick={() => setIsCompressing(!isCompressing)}
              >
                <FileText className="h-4 w-4 mr-2" />
                {isCompressing ? 'Compressing...' : 'Compress'}
              </Button>
              <Button
                size="sm"
                variant={isRecording ? 'default' : 'outline'}
                onClick={() => setIsRecording(!isRecording)}
              >
                <Mic className="h-4 w-4 mr-2" />
                {isRecording ? 'Recording...' : 'Record'}
              </Button>
              <Button
                size="sm"
                variant={isUploading ? 'default' : 'outline'}
                onClick={() => setIsUploading(!isUploading)}
              >
                <Upload className="h-4 w-4 mr-2" />
                {isUploading ? 'Uploading...' : 'Upload'}
              </Button>
            </div>

            {/* Zone de test SendButton */}
            <div className="bg-slate-50 dark:bg-slate-700 p-6 rounded-lg">
              <div className="flex items-center gap-4">
                <input
                  type="text"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Tapez pour activer le SendButton..."
                  className="flex-1 border border-slate-300 dark:border-slate-600 px-4 py-2 rounded-lg bg-white dark:bg-slate-800"
                />
                <SendButton
                  isVisible={true}
                  canSend={content.length > 0 && !isUploading && !isCompressing && !isRecording}
                  onClick={() => {
                    alert('Message envoyé: ' + content);
                    setContent('');
                    clearDraft();
                  }}
                  isCompressing={isCompressing}
                  isRecording={isRecording}
                  isUploading={isUploading}
                  performanceProfile={performanceProfile}
                  animConfig={animConfig}
                />
              </div>
              <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                {content.length > 0 ? (
                  <span className="text-green-600 dark:text-green-400">✓ Bouton visible</span>
                ) : (
                  <span className="text-slate-400">Tapez du texte pour voir le bouton apparaître</span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Draft Autosave Test */}
        <section className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Draft Autosave (Phase 1.2)</h2>

          <div className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-700 p-4 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <div className="text-sm text-slate-600 dark:text-slate-400">Draft sauvegardé dans localStorage</div>
                <Button size="sm" variant="outline" onClick={clearDraft}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Effacer
                </Button>
              </div>
              {draft ? (
                <div className="text-sm bg-white dark:bg-slate-800 p-3 rounded border border-slate-200 dark:border-slate-600">
                  <strong>Contenu:</strong> {draft}
                </div>
              ) : (
                <div className="text-sm text-slate-400">Aucun draft sauvegardé</div>
              )}
            </div>
            <div className="text-xs text-slate-500">
              💡 Le draft est automatiquement sauvegardé 2s après chaque changement et expire après 24h
            </div>
          </div>
        </section>

        {/* Clipboard Paste Test */}
        <section className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Clipboard Paste (Phase 3.2)</h2>

          <div className="space-y-4">
            <textarea
              onPaste={handlePaste}
              placeholder="📋 Collez une image ou du texte ici..."
              className="w-full border border-slate-300 dark:border-slate-600 p-4 rounded-lg h-32 bg-white dark:bg-slate-900 resize-none"
            />

            {pastedImages.length > 0 && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 rounded-lg">
                <div className="font-semibold text-green-800 dark:text-green-400 mb-2">
                  🖼️ Images détectées: {pastedImages.length}
                </div>
                <div className="space-y-1">
                  {pastedImages.map((file, i) => (
                    <div key={i} className="text-sm text-green-700 dark:text-green-300">
                      • {file.name} ({file.type}, {(file.size / 1024).toFixed(2)} KB)
                    </div>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => setPastedImages([])}
                >
                  Effacer
                </Button>
              </div>
            )}

            {pastedText && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
                <div className="font-semibold text-blue-800 dark:text-blue-400 mb-2">
                  📝 Texte détecté
                </div>
                <div className="text-sm text-blue-700 dark:text-blue-300 bg-white dark:bg-slate-800 p-2 rounded">
                  {pastedText}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => setPastedText('')}
                >
                  Effacer
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* Upload Retry Test */}
        <section className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Upload Retry (Phase 1.3)</h2>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                onClick={() => testUploadRetry(false)}
                disabled={isUploading}
              >
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Test Upload Réussi
              </Button>
              <Button
                variant="destructive"
                onClick={() => testUploadRetry(true)}
                disabled={isUploading}
              >
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Test Upload Échoué
              </Button>
            </div>

            {uploadAttempts > 0 && (
              <div className="bg-slate-50 dark:bg-slate-700 p-4 rounded-lg space-y-2">
                <div className="text-sm">
                  <strong>Tentatives:</strong> {uploadAttempts}
                </div>
                {Object.keys(retryStatus).length > 0 && (
                  <div className="text-sm">
                    <strong>Status:</strong>
                    <pre className="text-xs mt-1 bg-slate-100 dark:bg-slate-800 p-2 rounded overflow-auto">
                      {JSON.stringify(retryStatus, null, 2)}
                    </pre>
                  </div>
                )}
                {uploadSuccess && (
                  <div className="text-green-600 dark:text-green-400 font-semibold">
                    ✅ Upload réussi!
                  </div>
                )}
              </div>
            )}

            <div className="text-xs text-slate-500">
              💡 Le retry utilise un exponential backoff: 1s, 2s, 4s (max 3 retries)
            </div>
          </div>
        </section>

        {/* Console Logs Info */}
        <section className="bg-slate-900 text-slate-100 rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">🔍 Console Logs</h2>
          <div className="text-sm space-y-2">
            <div>• Ouvrez la console DevTools (F12) pour voir les logs détaillés</div>
            <div>• Préfixe [TEST] pour les événements de cette page</div>
            <div>• Vérifiez localStorage pour voir le draft (clé: draft-test-conversation)</div>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center text-sm text-slate-600 dark:text-slate-400 pb-8">
          <p>✨ Tous les composants Phases 1-3 sont prêts pour l'intégration</p>
          <p className="mt-1">Prochaine étape: Phase 4 - Integration dans MessageComposer</p>
        </div>
      </div>
    </div>
  );
}
