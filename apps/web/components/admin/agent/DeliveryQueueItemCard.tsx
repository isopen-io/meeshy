'use client';

import React, { memo, useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Clock,
  Pencil,
  Trash2,
  Loader2,
  MessageSquare,
  SmilePlus,
  Check,
  X,
} from 'lucide-react';
import { UserDisplay } from './UserDisplay';
import type { DeliveryQueueItem } from '@/services/agent-admin.service';

type DeliveryQueueItemCardProps = {
  item: DeliveryQueueItem;
  onDelete: (id: string) => Promise<void>;
  onEdit: (id: string, content: string) => Promise<void>;
};

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0s';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

export default memo(function DeliveryQueueItemCard({ item, onDelete, onEdit }: DeliveryQueueItemCardProps) {
  const [remainingMs, setRemainingMs] = useState(Math.max(0, item.scheduledAt - Date.now()));
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, item.scheduledAt - Date.now());
      setRemainingMs(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [item.scheduledAt]);

  const isMessage = item.action.type === 'message';
  const content = isMessage ? item.action.content : null;
  const emoji = !isMessage ? item.action.emoji : null;

  const handleStartEdit = useCallback(() => {
    if (isMessage) {
      setEditContent(item.action.type === 'message' ? item.action.content : '');
      setEditing(true);
    }
  }, [isMessage, item.action]);

  const handleSaveEdit = useCallback(async () => {
    if (!editContent.trim()) return;
    setSaving(true);
    try {
      await onEdit(item.id, editContent.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [item.id, editContent, onEdit]);

  const handleCancelEdit = useCallback(() => {
    setEditing(false);
    setEditContent('');
  }, []);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await onDelete(item.id);
    } finally {
      setDeleting(false);
    }
  }, [item.id, onDelete]);

  const delivering = remainingMs <= 0;

  return (
    <div className={`p-3 rounded-lg border transition-all ${
      delivering
        ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20'
        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-600'
    }`}>
      {/* Header: user + type badge + countdown */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <UserDisplay userId={item.action.asUserId} size="sm" showUsername className="shrink-0" />
          {isMessage ? (
            <Badge variant="outline" className="text-[9px] px-1.5 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 shrink-0">
              <MessageSquare className="h-2.5 w-2.5 mr-0.5" />
              Message
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[9px] px-1.5 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 shrink-0">
              <SmilePlus className="h-2.5 w-2.5 mr-0.5" />
              {emoji}
            </Badge>
          )}
        </div>

        {/* Countdown */}
        <div className="flex items-center gap-1.5 shrink-0">
          {delivering ? (
            <Badge className="text-[10px] px-1.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700" variant="outline">
              <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" />
              Envoi...
            </Badge>
          ) : (
            <Badge variant="outline" className="font-mono text-[10px] px-1.5 tabular-nums border-slate-200 dark:border-slate-700">
              <Clock className="h-2.5 w-2.5 mr-0.5 text-slate-400" />
              {formatCountdown(remainingMs)}
            </Badge>
          )}
        </div>
      </div>

      {/* Content */}
      {isMessage && !editing && (
        <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed mb-2 line-clamp-3 whitespace-pre-wrap">
          {content}
        </p>
      )}

      {/* Reaction target */}
      {!isMessage && (
        <p className="text-[10px] text-gray-400 mb-2">
          Target: {item.action.type === 'reaction' ? item.action.targetMessageId.slice(0, 12) : ''}...
        </p>
      )}

      {/* Edit mode */}
      {editing && (
        <div className="space-y-2 mb-2">
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="text-xs min-h-[60px] resize-y"
            maxLength={5000}
            autoFocus
          />
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              onClick={handleSaveEdit}
              disabled={saving || !editContent.trim()}
              className="h-6 text-[10px] gap-1"
            >
              {saving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Check className="h-2.5 w-2.5" />}
              Sauvegarder
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancelEdit}
              disabled={saving}
              className="h-6 text-[10px] gap-1"
            >
              <X className="h-2.5 w-2.5" />
              Annuler
            </Button>
          </div>
        </div>
      )}

      {/* Actions */}
      {!editing && (
        <div className="flex items-center gap-1 justify-end">
          {isMessage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleStartEdit}
              disabled={delivering}
              className="h-6 text-[10px] gap-1 text-gray-400 hover:text-gray-600"
            >
              <Pencil className="h-2.5 w-2.5" />
              Modifier
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={deleting || delivering}
                className="h-6 text-[10px] gap-1 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
              >
                {deleting ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Trash2 className="h-2.5 w-2.5" />}
                Supprimer
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer ce message ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Ce message ne sera pas envoyé. Cette action est irréversible.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                  Supprimer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
});
