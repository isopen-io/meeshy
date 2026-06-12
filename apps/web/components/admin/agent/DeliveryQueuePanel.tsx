'use client';

import React, { memo, useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Package, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  agentAdminService,
  type DeliveryQueueItem,
} from '@/services/agent-admin.service';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/useI18n';
import DeliveryQueueItemCard from './DeliveryQueueItemCard';

type DeliveryQueuePanelProps = {
  conversationId: string;
};

export default memo(function DeliveryQueuePanel({ conversationId }: DeliveryQueuePanelProps) {
  const { t } = useI18n('admin');
  const [items, setItems] = useState<DeliveryQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      setError(null);
      const res = await agentAdminService.getDeliveryQueue(conversationId);
      if (res.success && res.data) {
        setItems(Array.isArray(res.data) ? res.data : []);
      } else {
        setError(res.error ?? t('agent.deliveryQueue.loadError'));
      }
    } catch {
      setError(t('agent.deliveryQueue.serviceUnavailable'));
    } finally {
      setLoading(false);
    }
  }, [conversationId, t]);

  useEffect(() => {
    setLoading(true);
    fetchQueue();
    const interval = setInterval(fetchQueue, 10_000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await agentAdminService.deleteDeliveryItem(id);
      if (res.success) {
        setItems((prev) => prev.filter((item) => item.id !== id));
        toast.success(t('agent.toasts.queueItemDeleted'));
      } else {
        toast.error(res.error ?? t('agent.toasts.queueItemAlreadySent'));
        fetchQueue();
      }
    } catch {
      toast.error(t('agent.toasts.queueItemDeleteError'));
      fetchQueue();
    }
  }, [fetchQueue]);

  const handleEdit = useCallback(async (id: string, content: string) => {
    try {
      const res = await agentAdminService.editDeliveryItem(id, content);
      if (res.success && res.data) {
        setItems((prev) => prev.map((item) => item.id === id ? res.data! : item));
        toast.success(t('agent.toasts.queueItemEdited'));
      } else {
        toast.error(res.error ?? t('agent.toasts.queueItemAlreadySent'));
        fetchQueue();
      }
    } catch {
      toast.error(t('agent.toasts.queueItemEditError'));
      fetchQueue();
    }
  }, [fetchQueue]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-6">
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        <p className="text-xs text-gray-500">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchQueue} className="h-7 text-xs gap-1">
          <RefreshCw className="h-3 w-3" />
          {t('agent.deliveryQueue.retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] px-1.5 tabular-nums">
            {items.length}
          </Badge>
          <span className="text-[10px] text-gray-400 uppercase tracking-wider">
            {t('agent.deliveryQueue.pending')}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchQueue}
          className="h-6 text-[10px] text-gray-400 hover:text-gray-600"
        >
          <RefreshCw className="h-2.5 w-2.5" />
        </Button>
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6">
          <Package className="h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="text-xs text-gray-400">{t('agent.deliveryQueue.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <DeliveryQueueItemCard
              key={item.id}
              item={item}
              onDelete={handleDelete}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
});
