'use client';

import { useState, useRef } from 'react';
import { MessageComposer, MessageComposerRef } from '@/components/common/message-composer';
import { Button } from '@/components/ui/button';
import { Trash2, Reply, FileText, Image, Mic } from 'lucide-react';
import { useReplyStore } from '@/stores/reply-store';

/**
 * Page de test complète pour le MessageComposer intégré
 * Teste TOUTES les fonctionnalités en conditions réelles
 */
export default function TestComposerIntegratedPage() {
  // État du message
  const [content, setContent] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [mimeTypes, setMimeTypes] = useState<string[]>([]);
  const [sentMessages, setSentMessages] = useState<Array<{ content: string; timestamp: Date; attachments: number }>>([]);

  // Ref pour contrôler le composer
  const composerRef = useRef<MessageComposerRef>(null);

  // Store pour les réponses
  const { setReplyingTo, clearReply, replyingTo } = useReplyStore();

  // Simulated test messages pour la fonctionnalité reply
  const testMessages = [
    {
      id: '1',
      content: 'Bonjour! Comment ça va?',
      sender: { id: 'user1', username: 'alice', displayName: 'Alice' },
      createdAt: new Date(Date.now() - 3600000),
      attachments: [],
      translations: [],
    },
    {
      id: '2',
      content: 'Regarde cette image intéressante!',
      sender: { id: 'user2', username: 'bob', displayName: 'Bob' },
      createdAt: new Date(Date.now() - 7200000),
      attachments: [
        { id: 'att1', fileName: 'test.jpg', mimeType: 'image/jpeg', fileSize: 150000 }
      ],
      translations: [],
    },
  ];

  // Handler pour l'envoi
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-900 dark:to-slate-800 p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg rounded-2xl shadow-xl p-6 border border-white/20">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            🧪 MessageComposer - Test Intégré Complet
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Testez le composer refactorisé avec toutes ses fonctionnalités : reply, attachments, clipboard paste, draft autosave, etc.
          </p>
        </div>

        {/* Contrôles de test */}
        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg rounded-2xl shadow-xl p-6 border border-white/20">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
            Contrôles de Test
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {/* Test Reply */}
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
              className="flex items-center gap-2"
            >
              <Reply className="h-4 w-4" />
              {replyingTo ? 'Clear Reply' : 'Test Reply'}
            </Button>

            {/* Test Reply avec attachments */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReplyingTo(testMessages[1] as any)}
              className="flex items-center gap-2"
            >
              <Image className="h-4 w-4" />
              Reply + Image
            </Button>

            {/* Focus composer */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => composerRef.current?.focus()}
              className="flex items-center gap-2"
            >
              <FileText className="h-4 w-4" />
              Focus Composer
            </Button>

            {/* Clear attachments */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => composerRef.current?.clearAttachments?.()}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Clear Attachments
            </Button>

            {/* Reset textarea */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => composerRef.current?.resetTextareaSize?.()}
              className="flex items-center gap-2"
            >
              <Mic className="h-4 w-4" />
              Reset Size
            </Button>

            {/* Blur composer */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => composerRef.current?.blur()}
              className="flex items-center gap-2"
            >
              <FileText className="h-4 w-4" />
              Blur Composer
            </Button>
          </div>
        </div>

        {/* État du composer */}
        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg rounded-2xl shadow-xl p-6 border border-white/20">
          <h2 className="text-xl font-semibold mb-4">État en Temps Réel</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Caractères</div>
              <div className="text-2xl font-bold">{content.length}</div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Attachments</div>
              <div className="text-2xl font-bold">{attachmentIds.length}</div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Langue</div>
              <div className="text-2xl font-bold uppercase">{selectedLanguage}</div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg">
              <div className="text-sm text-slate-600 dark:text-slate-400 mb-1">Reply</div>
              <div className="text-2xl font-bold">{replyingTo ? '✓' : '✗'}</div>
            </div>
          </div>
        </div>

        {/* Le composer lui-même */}
        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg rounded-2xl shadow-xl p-6 border border-white/20">
          <h2 className="text-xl font-semibold mb-4">MessageComposer</h2>

          <div className="space-y-3">
            <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-2 border-dashed border-blue-300/50 dark:border-blue-700/50 rounded-xl p-4">
              <div className="text-sm text-blue-700 dark:text-blue-300 font-medium mb-2">
                💡 Fonctionnalités à tester:
              </div>
              <ul className="text-sm space-y-1 text-blue-600 dark:text-blue-400">
                <li>• <strong>Clipboard Paste:</strong> Coller une image (Ctrl+V) → attachment automatique</li>
                <li>• <strong>Draft Autosave:</strong> Le texte est sauvegardé automatiquement</li>
                <li>• <strong>Reply:</strong> Cliquer "Test Reply" pour afficher la zone de réponse</li>
                <li>• <strong>Attachments:</strong> Cliquer le bouton trombone ou drag & drop des fichiers</li>
                <li>• <strong>Audio:</strong> Cliquer le micro pour enregistrer un message vocal</li>
                <li>• <strong>Animations:</strong> Le bouton Send apparaît avec animation quand vous tapez</li>
                <li>• <strong>Performance:</strong> Les animations s'adaptent à votre device</li>
              </ul>
            </div>

            <MessageComposer
              ref={composerRef}
              value={content}
              onChange={setContent}
              onSend={handleSend}
              selectedLanguage={selectedLanguage}
              onLanguageChange={setSelectedLanguage}
              isComposingEnabled={true}
              placeholder="Tapez votre message... (testez paste, reply, attachments)"
              onAttachmentsChange={handleAttachmentsChange}
              token="test-token-123"
              userRole="premium"
              conversationId="test-conversation-id"
              choices={[
                { value: 'en', label: 'English', flag: '🇬🇧' },
                { value: 'fr', label: 'Français', flag: '🇫🇷' },
                { value: 'es', label: 'Español', flag: '🇪🇸' },
              ]}
            />
          </div>
        </div>

        {/* Messages envoyés */}
        {sentMessages.length > 0 && (
          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg rounded-2xl shadow-xl p-6 border border-white/20">
            <h2 className="text-xl font-semibold mb-4">Messages Envoyés</h2>

            <div className="space-y-3">
              {sentMessages.map((msg, idx) => (
                <div key={idx} className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="text-sm text-green-800 dark:text-green-300 mb-1">
                        {msg.content || <em>(message vide avec attachments)</em>}
                      </div>
                      <div className="text-xs text-green-600 dark:text-green-400">
                        {msg.timestamp.toLocaleTimeString()} • {msg.attachments} attachment(s)
                      </div>
                    </div>
                    <div className="text-green-600 dark:text-green-400">✓</div>
                  </div>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSentMessages([])}
              className="mt-4"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Effacer l'historique
            </Button>
          </div>
        )}

        {/* Debug Info */}
        <div className="bg-slate-900 text-slate-100 rounded-2xl shadow-xl p-6">
          <h2 className="text-xl font-semibold mb-4">🔍 Debug Info</h2>

          <div className="space-y-3 text-sm font-mono">
            <div className="bg-slate-800 p-3 rounded-lg overflow-auto">
              <div className="text-slate-400 mb-2">Composer State:</div>
              <pre className="text-xs">
{JSON.stringify({
  content: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
  contentLength: content.length,
  language: selectedLanguage,
  attachments: attachmentIds.length,
  hasReply: !!replyingTo,
  replyToId: replyingTo?.id,
}, null, 2)}
              </pre>
            </div>

            <div className="text-xs space-y-1 text-slate-400">
              <div>• Ouvrez la console DevTools (F12) pour voir les logs</div>
              <div>• Vérifiez localStorage: draft-test-conversation-id</div>
              <div>• Les attachments sont simulés (pas de vraie API upload)</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-slate-600 dark:text-slate-400 pb-8">
          <p className="font-semibold">✨ Phase 4 - Intégration Complète</p>
          <p className="mt-1">Tous les hooks (Phases 1-3) sont intégrés dans ce MessageComposer</p>
          <p className="mt-2 text-xs">
            usePerformanceProfile • useComposerState • useClipboardPaste • useDraftAutosave • useUploadRetry
          </p>
        </div>
      </div>
    </div>
  );
}
