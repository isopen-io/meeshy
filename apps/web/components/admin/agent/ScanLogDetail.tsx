'use client';

import React, { memo, useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Eye, Brain, Pencil, Shield, ArrowRight, DollarSign, Clock } from 'lucide-react';
import { agentAdminService, type ScanLogDetail as ScanLogDetailType, type ScanLogNodeResult } from '@/services/agent-admin.service';

type Props = {
  logId: string;
  onClose: () => void;
};

const NODE_META: Record<string, { label: string; icon: typeof Eye; color: string }> = {
  observe: { label: 'Observer', icon: Eye, color: 'text-blue-500' },
  strategist: { label: 'Strategist', icon: Brain, color: 'text-purple-500' },
  generator: { label: 'Generator', icon: Pencil, color: 'text-emerald-500' },
  qualityGate: { label: 'Quality Gate', icon: Shield, color: 'text-amber-500' },
};

const BORDER_COLORS: Record<string, string> = {
  observe: '#3b82f6',
  strategist: '#a855f7',
  generator: '#10b981',
  qualityGate: '#f59e0b',
};

function NodeCard({ name, data }: { name: string; data: ScanLogNodeResult }) {
  const meta = NODE_META[name] ?? { label: name, icon: Eye, color: 'text-gray-500' };
  const Icon = meta.icon;

  return (
    <Card className="border-l-2" style={{ borderLeftColor: BORDER_COLORS[name] ?? '#6b7280' }}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
            <span className="text-xs font-semibold">{meta.label}</span>
          </div>
          <Badge variant="outline" className="text-[9px] tabular-nums">
            <DollarSign className="h-2.5 w-2.5 mr-0.5" />${data.costUsd.toFixed(4)}
          </Badge>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[10px] text-gray-500">
          <div><span className="block text-gray-400">Input</span><span className="font-mono tabular-nums">{data.inputTokens}</span></div>
          <div><span className="block text-gray-400">Output</span><span className="font-mono tabular-nums">{data.outputTokens}</span></div>
          <div><span className="block text-gray-400">Latence</span><span className="font-mono tabular-nums">{data.latencyMs}ms</span></div>
        </div>
        <div className="text-[9px] text-gray-400">Model: {data.model}</div>
        {Object.keys(data.extra).length > 0 ? (
          <pre className="text-[9px] bg-slate-50 dark:bg-slate-800 rounded p-2 overflow-x-auto max-h-32 text-gray-600 dark:text-gray-400">
            {JSON.stringify(data.extra, null, 2)}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default memo(function ScanLogDetail({ logId, onClose }: Props) {
  const [log, setLog] = useState<ScanLogDetailType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    agentAdminService.getScanLogDetail(logId)
      .then(res => { if (res.success && res.data) setLog(res.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [logId]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl lg:max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Scan Detail {log ? `— ${log.conversation?.title ?? log.conversationId.slice(0, 12)}` : ''}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : log ? (
          <ScrollArea className="max-h-[70vh] pr-2">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{log.trigger}</Badge>
                <Badge variant="outline">{log.outcome.replace('_', ' ')}</Badge>
                <Badge variant="outline" className="tabular-nums"><Clock className="h-3 w-3 mr-1" />{log.durationMs}ms</Badge>
                <Badge variant="outline" className="tabular-nums"><DollarSign className="h-3 w-3 mr-1" />${log.estimatedCostUsd.toFixed(4)}</Badge>
                <Badge variant="outline" className="tabular-nums">{log.totalInputTokens + log.totalOutputTokens} tokens</Badge>
              </div>

              <div className="space-y-2 p-3 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Preconditions</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div><span className="block text-[10px] text-gray-400">Activite</span><span className="font-mono">{log.activityScore.toFixed(2)}</span></div>
                  <div><span className="block text-[10px] text-gray-400">Messages</span><span className="font-mono">{log.messagesInWindow}</span></div>
                  <div><span className="block text-[10px] text-gray-400">Users ctrl</span><span className="font-mono">{log.controlledUserIds.length}</span></div>
                  {log.budgetBefore ? (
                    <div><span className="block text-[10px] text-gray-400">Budget</span><span className="font-mono">{log.budgetBefore.messagesUsed}/{log.budgetBefore.messagesMax}</span></div>
                  ) : null}
                </div>
              </div>

              {log.nodeResults ? (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Pipeline</h4>
                  <div className="space-y-2">
                    {['observe', 'strategist', 'generator', 'qualityGate'].map((name, i) => {
                      const node = (log.nodeResults as Record<string, ScanLogNodeResult>)[name];
                      return node ? (
                        <div key={name}>
                          {i > 0 ? <div className="flex justify-center"><ArrowRight className="h-3 w-3 text-gray-300 rotate-90" /></div> : null}
                          <NodeCard name={name} data={node} />
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2 p-3 rounded-lg bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Resultat</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div><span className="block text-[10px] text-gray-400">Messages</span><span className="font-mono text-emerald-600">{log.messagesSent}</span></div>
                  <div><span className="block text-[10px] text-gray-400">Reactions</span><span className="font-mono text-amber-600">{log.reactionsSent}</span></div>
                  <div><span className="block text-[10px] text-gray-400">Rejetes</span><span className="font-mono text-red-500">{log.messagesRejected}</span></div>
                  <div><span className="block text-[10px] text-gray-400">Users</span><span className="font-mono">{log.userIdsUsed.length}</span></div>
                </div>
              </div>

              {log.configSnapshot ? (
                <details className="text-xs">
                  <summary className="text-[10px] font-bold uppercase tracking-wider text-gray-500 cursor-pointer">Config Snapshot</summary>
                  <pre className="mt-2 text-[9px] bg-slate-50 dark:bg-slate-800 rounded p-3 overflow-x-auto max-h-40 text-gray-600 dark:text-gray-400">
                    {JSON.stringify(log.configSnapshot, null, 2)}
                  </pre>
                </details>
              ) : null}
            </div>
          </ScrollArea>
        ) : (
          <div className="text-sm text-gray-400 text-center py-12">Scan log introuvable</div>
        )}
      </DialogContent>
    </Dialog>
  );
});
