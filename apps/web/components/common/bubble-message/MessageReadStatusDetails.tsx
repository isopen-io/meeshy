'use client';

import { memo, useState, useEffect } from 'react';
import { Check, CheckCheck, Eye, EyeOff, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useMessageStatusDetails, type MessageStatusEntry } from '@/hooks/queries/use-message-status-details';

interface MessageReadStatusDetailsProps {
  messageId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const StatusEntry = memo(function StatusEntry({
  entry,
  type,
}: {
  entry: MessageStatusEntry;
  type: 'read' | 'delivered' | 'not-seen';
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-1">
      <Avatar className="h-9 w-9 flex-shrink-0">
        {entry.avatar && <AvatarImage src={entry.avatar} alt={entry.displayName} />}
        <AvatarFallback className="text-xs bg-muted">
          {getInitials(entry.displayName)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{entry.displayName}</p>
        {type === 'read' && entry.readAt && (
          <p className="text-xs text-muted-foreground">{formatTime(entry.readAt)}</p>
        )}
        {type === 'delivered' && entry.deliveredAt && (
          <p className="text-xs text-muted-foreground">{formatTime(entry.deliveredAt)}</p>
        )}
      </div>
      <div className="flex-shrink-0">
        {type === 'read' && (
          <span className="inline-flex -space-x-1">
            <Check className="h-4 w-4 text-sky-500" />
            <Check className="h-4 w-4 text-sky-500" />
          </span>
        )}
        {type === 'delivered' && (
          <span className="inline-flex -space-x-1">
            <Check className="h-4 w-4 text-gray-400" />
            <Check className="h-4 w-4 text-gray-400" />
          </span>
        )}
        {type === 'not-seen' && (
          <Check className="h-4 w-4 text-gray-300" />
        )}
      </div>
    </div>
  );
});

const StatusList = memo(function StatusList({
  entries,
  type,
  emptyMessage,
}: {
  entries: MessageStatusEntry[];
  type: 'read' | 'delivered' | 'not-seen';
  emptyMessage: string;
}) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        {type === 'not-seen' ? <EyeOff className="h-8 w-8 mb-2 opacity-50" /> : <Eye className="h-8 w-8 mb-2 opacity-50" />}
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {entries.map(entry => (
        <StatusEntry key={entry.participantId} entry={entry} type={type} />
      ))}
    </div>
  );
});

export const MessageReadStatusDetails = memo(function MessageReadStatusDetails({
  messageId,
  open,
  onOpenChange,
}: MessageReadStatusDetailsProps) {
  const [tab, setTab] = useState<string>('all');
  const { data, isLoading } = useMessageStatusDetails(messageId, { enabled: open });

  useEffect(() => {
    if (open) setTab('all');
  }, [messageId, open]);

  const statuses = data?.statuses ?? [];

  const readEntries = statuses.filter(s => s.readAt);
  const deliveredEntries = statuses.filter(s => s.deliveredAt && !s.readAt);
  const notSeenEntries = statuses.filter(s => !s.deliveredAt && !s.readAt);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCheck className="h-5 w-5" />
            Message info
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="flex-1 min-h-0">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all" className="text-xs">
                All ({statuses.length})
              </TabsTrigger>
              <TabsTrigger value="read" className="text-xs">
                <Eye className="h-3.5 w-3.5 mr-1" />
                Read ({readEntries.length})
              </TabsTrigger>
              <TabsTrigger value="unread" className="text-xs">
                <Clock className="h-3.5 w-3.5 mr-1" />
                Pending ({deliveredEntries.length + notSeenEntries.length})
              </TabsTrigger>
            </TabsList>

            <div className="overflow-y-auto mt-3 max-h-[45vh]">
              <TabsContent value="all" className="mt-0">
                {readEntries.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 px-1">
                      Read
                    </p>
                    <StatusList entries={readEntries} type="read" emptyMessage="" />
                  </div>
                )}
                {deliveredEntries.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 px-1">
                      Delivered
                    </p>
                    <StatusList entries={deliveredEntries} type="delivered" emptyMessage="" />
                  </div>
                )}
                {notSeenEntries.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 px-1">
                      Not delivered
                    </p>
                    <StatusList entries={notSeenEntries} type="not-seen" emptyMessage="" />
                  </div>
                )}
              </TabsContent>

              <TabsContent value="read" className="mt-0">
                <StatusList entries={readEntries} type="read" emptyMessage="No one has read this message yet" />
              </TabsContent>

              <TabsContent value="unread" className="mt-0">
                <StatusList
                  entries={[...deliveredEntries, ...notSeenEntries]}
                  type="not-seen"
                  emptyMessage="Everyone has read this message"
                />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
});
