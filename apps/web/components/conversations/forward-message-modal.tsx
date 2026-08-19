'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Send, Check, Loader2, Forward } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { ForwardPickerModel, type TargetState } from '@/lib/forward-picker-model';
import type { Conversation, Message } from '@meeshy/shared/types';

interface ForwardMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: Message;
  sourceConversationId?: string;
  conversations: readonly Conversation[];
}

const stateKey = (state: TargetState): string =>
  typeof state === 'object' ? 'failed' : state;

const conversationLabel = (conv: Conversation): string =>
  conv.title || conv.identifier || conv.id;

export function ForwardMessageModal({
  isOpen,
  onClose,
  message,
  sourceConversationId,
  conversations,
}: ForwardMessageModalProps) {
  const { t } = useI18n('conversations');
  const [searchQuery, setSearchQuery] = useState('');
  const modelRef = useRef(new ForwardPickerModel());
  const hasToastedRef = useRef(false);
  const [, bump] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    if (!isOpen) return;
    modelRef.current = new ForwardPickerModel();
    hasToastedRef.current = false;
    setSearchQuery('');
    bump();
  }, [isOpen, message.id]);

  const targets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return conversations
      .filter((conv) => conv.id !== sourceConversationId)
      .filter((conv) => {
        if (!query) return true;
        return conversationLabel(conv).toLowerCase().includes(query);
      });
  }, [conversations, sourceConversationId, searchQuery]);

  const transmit = useCallback(
    async (conversationId: string) => {
      const model = modelRef.current;
      try {
        const result = await meeshySocketIOService.sendMessage(
          conversationId,
          message.content || '',
          message.originalLanguage,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          message.id,
          sourceConversationId || undefined,
        );
        const ok = result?.success ?? false;
        model.finishSend(conversationId, ok, ok ? undefined : t('forward.failed', 'Échec du transfert'));
        if (ok && !hasToastedRef.current) {
          hasToastedRef.current = true;
          toast.success(t('forward.sent', 'Message transféré'));
        }
      } catch (error) {
        model.finishSend(
          conversationId,
          false,
          error instanceof Error && error.message
            ? error.message
            : t('forward.failed', 'Échec du transfert'),
        );
      }
      bump();
    },
    [message.content, message.originalLanguage, message.id, sourceConversationId, t],
  );

  const handleImmediateSend = useCallback(
    (conversationId: string) => {
      if (!modelRef.current.beginSend(conversationId)) return;
      bump();
      void transmit(conversationId);
    },
    [transmit],
  );

  const handleBatchSend = useCallback(() => {
    const batch = modelRef.current.beginBatch();
    bump();
    void (async () => {
      for (const id of batch) {
        await transmit(id);
      }
    })();
  }, [transmit]);

  const handleRowTap = useCallback((conversationId: string) => {
    modelRef.current.tapRow(conversationId);
    bump();
  }, []);

  const selectedCount = modelRef.current.selectedIds().length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Forward className="h-5 w-5" />
            {t('forward.title', 'Transférer le message')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('forward.search', 'Rechercher une conversation...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <ScrollArea className="h-72">
            <div className="space-y-1 pr-2">
              {targets.map((conv) => {
                const state = modelRef.current.state(conv.id);
                const key = stateKey(state);
                const isSelected = state === 'selected';
                const isSending = state === 'sending';
                const isSent = state === 'sent';
                const failedReason = typeof state === 'object' ? state.failed : null;
                const label = conversationLabel(conv);
                return (
                  <div key={conv.id}>
                    <div
                      data-testid={`forward-row-${conv.id}`}
                      data-state={key}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      className={cn(
                        'flex items-center justify-between gap-3 p-2.5 rounded-lg border cursor-pointer outline-none',
                        'hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring',
                        isSelected && 'bg-primary/10 border-primary',
                        isSent && 'opacity-70 cursor-default',
                      )}
                      onClick={() => handleRowTap(conv.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleRowTap(conv.id);
                        }
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={conv.avatar} />
                          <AvatarFallback>{label.slice(0, 1).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{label}</p>
                          <p className="text-xs text-muted-foreground">{conv.type}</p>
                        </div>
                        {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                      </div>
                      <Button
                        data-testid={`forward-send-${conv.id}`}
                        variant={isSent ? 'ghost' : 'outline'}
                        size="sm"
                        disabled={isSending || isSent}
                        aria-label={t('forward.send', 'Envoyer')}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleImmediateSend(conv.id);
                        }}
                      >
                        {isSending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isSent ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {failedReason !== null && (
                      <p
                        data-testid={`forward-failed-${conv.id}`}
                        className="px-2.5 pt-1 text-xs text-destructive"
                      >
                        {failedReason || t('forward.failed', 'Échec du transfert')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          {selectedCount > 0 && (
            <Button data-testid="forward-send-selected" onClick={handleBatchSend}>
              <Send className="h-4 w-4 mr-2" />
              {t('forward.send-selected', { count: selectedCount })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
