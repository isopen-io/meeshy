'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Lock, Unlock, UserCog } from 'lucide-react';
import {
  agentAdminService,
  type AgentRoleData,
  type ArchetypeData,
} from '@/services/agent-admin.service';
import { toast } from 'sonner';

interface AgentRolesSectionProps {
  conversationId: string;
}

export function AgentRolesSection({ conversationId }: AgentRolesSectionProps) {
  const [roles, setRoles] = useState<AgentRoleData[]>([]);
  const [archetypes, setArchetypes] = useState<ArchetypeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigningUser, setAssigningUser] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [rolesRes, archetypesRes] = await Promise.all([
          agentAdminService.getRoles(conversationId),
          agentAdminService.getArchetypes(),
        ]);
        if (rolesRes.success && rolesRes.data) {
          setRoles(Array.isArray(rolesRes.data) ? rolesRes.data : []);
        }
        if (archetypesRes.success && archetypesRes.data) {
          setArchetypes(Array.isArray(archetypesRes.data) ? archetypesRes.data : []);
        }
      } catch {
        toast.error('Erreur lors du chargement des rôles');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [conversationId]);

  const handleAssign = async (userId: string, archetypeId: string) => {
    setAssigningUser(userId);
    try {
      const response = await agentAdminService.assignArchetype(conversationId, userId, archetypeId);
      if (response.success && response.data) {
        setRoles(prev => prev.map(r => r.userId === userId ? response.data! : r));
        toast.success('Archétype assigné');
      }
    } catch {
      toast.error('Erreur lors de l\'assignation');
    } finally {
      setAssigningUser(null);
    }
  };

  const handleUnlock = async (userId: string) => {
    try {
      const response = await agentAdminService.unlockRole(conversationId, userId);
      if (response.success && response.data) {
        setRoles(prev => prev.map(r => r.userId === userId ? response.data! : r));
        toast.success('Profil déverrouillé');
      }
    } catch {
      toast.error('Erreur lors du déverrouillage');
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (roles.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-4">
        Aucun rôle observé pour cette conversation
      </p>
    );
  }

  const originLabel = (origin: string) => {
    switch (origin) {
      case 'observed': return 'Observé';
      case 'archetype': return 'Archétype';
      case 'hybrid': return 'Hybride';
      default: return origin;
    }
  };

  return (
    <div className="space-y-3">
      {roles.map(role => (
        <div
          key={role.id}
          className="rounded-lg border p-3 space-y-2"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCog className="h-4 w-4 text-gray-400" />
              <span className="font-mono text-sm">{(role.userId ?? '').slice(0, 8)}...</span>
              <Badge variant="outline" className="text-xs">{originLabel(role.origin)}</Badge>
              {role.locked && (
                <Badge variant="secondary" className="text-xs">
                  <Lock className="h-3 w-3 mr-1" />
                  Verrouillé
                </Badge>
              )}
            </div>
            {role.locked && (
              <Button variant="ghost" size="sm" onClick={() => handleUnlock(role.userId)}>
                <Unlock className="h-3 w-3 mr-1" />
                Unlock
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{role.tone}</span>
            <span>-</span>
            <span>{role.vocabularyLevel}</span>
            <span>-</span>
            <span>{role.messagesAnalyzed} msg analysés</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 w-16">Confiance</span>
            <Progress value={role.confidence * 100} className="flex-1 h-2" />
            <span className="text-xs font-mono w-10 text-right">{(role.confidence * 100).toFixed(0)}%</span>
          </div>

          {/* Assign archetype */}
          <div className="flex items-center gap-2 pt-1">
            <Select
              defaultValue={role.archetypeId ?? undefined}
              onValueChange={v => handleAssign(role.userId, v)}
              disabled={assigningUser === role.userId}
            >
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="Assigner un archétype..." />
              </SelectTrigger>
              <SelectContent>
                {archetypes.map(a => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ))}
    </div>
  );
}
