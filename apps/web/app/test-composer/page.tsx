'use client';

import { useState, useEffect } from 'react';
import { SendButton } from '@/components/common/message-composer/SendButton';
import { usePerformanceProfile } from '@/hooks/usePerformanceProfile';
import { getAnimationConfig } from '@/constants/animations';
import { useClipboardPaste } from '@/hooks/composer/useClipboardPaste';
import { useDraftAutosave } from '@/hooks/composer/useDraftAutosave';
import { useUploadRetry } from '@/hooks/composer/useUploadRetry';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, Mic, FileText, Trash2 } from 'lucide-react';

export default function TestComposerPage() {
  // State pour les tests
  const [content, setContent] = useState('');
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            🧪 MessageComposer Components Test Lab
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Testez tous les composants développés dans les Phases 1-3 avant intégration finale
          </p>
        </div>

        {/* Performance Profile */}
        <section className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
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
