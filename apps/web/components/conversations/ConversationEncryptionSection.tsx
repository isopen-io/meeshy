'use client';

import { useEffect, useState } from 'react';
import { Shield, ShieldCheck, Loader2, AlertTriangle, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/hooks/useI18n';
import { conversationsService } from '@/services/conversations.service';
import type {
  EncryptionMode,
  EncryptionStatus,
} from '@/services/conversations/types';

interface ConversationEncryptionSectionProps {
  conversationId: string;
  canEnable: boolean;
}

export function ConversationEncryptionSection({
  conversationId,
  canEnable,
}: ConversationEncryptionSectionProps) {
  const { t, locale } = useI18n('conversations');
  const [status, setStatus] = useState<EncryptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [selectedMode, setSelectedMode] = useState<EncryptionMode>('server');

  const modeMeta: Record<EncryptionMode, { label: string; desc: string }> = {
    e2ee: {
      label: t('conversationDetails.encryption.modes.e2eeLabel'),
      desc: t('conversationDetails.encryption.modes.e2eeDescription'),
    },
    server: {
      label: t('conversationDetails.encryption.modes.serverLabel'),
      desc: t('conversationDetails.encryption.modes.serverDescription'),
    },
    hybrid: {
      label: t('conversationDetails.encryption.modes.hybridLabel'),
      desc: t('conversationDetails.encryption.modes.hybridDescription'),
    },
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    conversationsService
      .getEncryptionStatus(conversationId)
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const handleEnable = async () => {
    setEnabling(true);
    try {
      const result = await conversationsService.enableEncryption(conversationId, selectedMode);
      setStatus({
        isEncrypted: true,
        mode: result.mode,
        enabledAt: result.enabledAt,
        enabledBy: result.enabledBy,
        canTranslate: result.mode !== 'e2ee',
      });
      toast.success(t('conversationDetails.encryption.success'));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(t('conversationDetails.encryption.error', { message }));
    } finally {
      setEnabling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('conversationDetails.encryption.statusLoading')}
      </div>
    );
  }

  if (!status) return null;

  const inactiveNoticeHtml = t('conversationDetails.encryption.inactiveNotice');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="space-y-3"
    >
      <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
        <Shield className="h-4 w-4 flex-shrink-0" />
        <span>{t('conversationDetails.encryption.title')}</span>
      </h3>

      <div className="p-4 rounded-xl backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 border border-white/30 dark:border-gray-700/40 space-y-3">
        {status.isEncrypted && status.mode ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">
                    {t('conversationDetails.encryption.activeLabel')}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {modeMeta[status.mode].label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{modeMeta[status.mode].desc}</p>
                {status.enabledAt && (
                  <p className="text-[11px] text-muted-foreground">
                    {t('conversationDetails.encryption.enabledOn', {
                      date: new Date(status.enabledAt).toLocaleDateString(locale),
                    })}
                  </p>
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground italic border-t border-border/40 pt-2">
              {t('conversationDetails.encryption.immutabilityNotice')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span dangerouslySetInnerHTML={{ __html: inactiveNoticeHtml }} />
            </div>

            {canEnable ? (
              <>
                <Select
                  value={selectedMode}
                  onValueChange={(v) => setSelectedMode(v as EncryptionMode)}
                  disabled={enabling}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(modeMeta) as EncryptionMode[]).map((m) => (
                      <SelectItem key={m} value={m}>
                        <div className="flex flex-col text-left">
                          <span className="font-medium">{modeMeta[m].label}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {modeMeta[m].desc}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  onClick={handleEnable}
                  disabled={enabling}
                  className="w-full"
                  variant="default"
                >
                  {enabling ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t('conversationDetails.encryption.activating')}
                    </>
                  ) : (
                    <>
                      <Shield className="h-4 w-4 mr-2" />
                      {t('conversationDetails.encryption.activate')}
                    </>
                  )}
                </Button>
              </>
            ) : (
              <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{t('conversationDetails.encryption.cannotEnable')}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
