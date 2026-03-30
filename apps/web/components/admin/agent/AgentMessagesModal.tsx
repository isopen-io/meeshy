'use client';

import React, { memo, useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Loader2, ChevronLeft, ChevronRight, Reply, Globe } from 'lucide-react';
import { agentAdminService, type AgentMessageEntry } from '@/services/agent-admin.service';
import { UserDisplay } from './UserDisplay';

type AgentMessagesModalProps = {
  conversationId: string;
  conversationTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'maintenant';
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}j`;
}

export default memo(function AgentMessagesModal({
  conversationId, conversationTitle, open, onOpenChange,
}: AgentMessagesModalProps) {
  const [messages, setMessages] = useState<AgentMessageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await agentAdminService.getAgentMessages(conversationId, page, limit);
      if (res.success && res.data) {
        setMessages(res.data);
        setTotal(res.pagination?.total ?? 0);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [conversationId, page]);

  useEffect(() => {
    if (open) fetchMessages();
  }, [open, fetchMessages]);

  const hasMore = page * limit < total;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-indigo-500" />
            Messages agent — {conversationTitle}
            <Badge variant="outline" className="text-[10px] tabular-nums ml-2">{total} messages</Badge>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-12">
            Aucun message agent pour cette conversation
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-1 pr-2">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className="px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                >
                  <div className="flex items-start gap-3">
                    {/* Sender */}
                    <div className="shrink-0 pt-0.5">
                      {msg.sender ? (
                        <UserDisplay userId={msg.senderId} size="sm" showUsername={false} />
                      ) : (
                        <div className="h-6 w-6 rounded-full bg-slate-200 dark:bg-slate-700" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                          {msg.sender?.displayName ?? msg.sender?.username ?? msg.senderId.slice(0, 8)}
                        </span>
                        {msg.originalLanguage && (
                          <Badge variant="outline" className="text-[8px] h-3.5 px-1 gap-0.5">
                            <Globe className="h-2 w-2" />
                            {msg.originalLanguage}
                          </Badge>
                        )}
                        {msg.replyToId && (
                          <Badge variant="outline" className="text-[8px] h-3.5 px-1 gap-0.5 text-indigo-500">
                            <Reply className="h-2 w-2" />
                            reply
                          </Badge>
                        )}
                      </div>

                      <p className="text-sm text-gray-700 dark:text-gray-300 break-words whitespace-pre-wrap">
                        {msg.content}
                      </p>

                      <div className="flex items-center gap-2 text-[10px] text-gray-400 tabular-nums">
                        <span>{formatDateTime(msg.createdAt)}</span>
                        <span className="text-gray-300 dark:text-gray-600">·</span>
                        <span>{formatTimeAgo(msg.createdAt)}</span>
                        <span className="text-gray-300 dark:text-gray-600">·</span>
                        <span className="font-mono">{msg.id.slice(0, 12)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {total > limit ? (
          <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700 shrink-0">
            <span className="text-[10px] text-gray-400 tabular-nums">
              {(page - 1) * limit + 1}-{Math.min(page * limit, total)} / {total}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-6 w-6 p-0" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <Button variant="outline" size="sm" className="h-6 w-6 p-0" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
});
