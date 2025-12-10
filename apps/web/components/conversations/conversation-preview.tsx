'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User } from '@/types';
import { MessageSquare, Users, Hash, Building2, Lock, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

interface ConversationPreviewProps {
  title: string;
  identifier: string;
  selectedUsers: User[];
  selectedCommunity?: {
    id: string;
    name: string;
    isPrivate: boolean;
  };
  conversationType: 'direct' | 'group' | 'public';
  getUserAccentColor: (userId: string) => string;
}

export function ConversationPreview({
  title,
  identifier,
  selectedUsers,
  selectedCommunity,
  conversationType,
  getUserAccentColor
}: ConversationPreviewProps) {
  const { t } = useI18n('modals');
  
  if (selectedUsers.length === 0) {
    return null;
  }

  const displayTitle = title || (
    conversationType === 'direct' 
      ? t('createConversationModal.preview.defaultTitles.direct', { 
          username: selectedUsers[0]?.displayName || selectedUsers[0]?.username 
        })
      : conversationType === 'group'
      ? t('createConversationModal.preview.defaultTitles.group', {
          users: selectedUsers.map(u => u.displayName || u.username).join(', ')
        })
      : t('createConversationModal.preview.defaultTitles.public')
  );

  return (
    <Card className="border-dashed border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          {t('createConversationModal.preview.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Titre et type */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-sm">{displayTitle}</h4>
            <Badge variant="outline" className="text-xs">
              {t(`createConversationModal.conversationTypes.${conversationType}`)}
            </Badge>
          </div>
          
          {/* Identifiant */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Hash className="h-3 w-3" />
            <span className="font-mono">mshy_{identifier}</span>
          </div>
        </div>

        {/* Communauté */}
        {selectedCommunity && (
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{selectedCommunity.name}</span>
            {selectedCommunity.isPrivate ? (
              <Lock className="h-3 w-3 text-muted-foreground" />
            ) : (
              <Globe className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
        )}

        {/* Membres */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {t('createConversationModal.preview.members', { count: selectedUsers.length + 1 })}
            </span>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {/* Utilisateur actuel */}
            <Badge
              variant="outline"
              className="flex items-center gap-2 px-2 py-1 bg-primary/10 text-primary border-primary/20"
            >
              <Avatar className="h-4 w-4">
                <AvatarFallback className="text-xs">
                  {t('createConversationModal.preview.you').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium">{t('createConversationModal.preview.you')}</span>
            </Badge>
            
            {/* Autres utilisateurs */}
            {selectedUsers.map(user => (
              <Badge
                key={user.id}
                variant="outline"
                className={cn(
                  "flex items-center gap-2 px-2 py-1 border-2",
                  getUserAccentColor(user.id)
                )}
              >
                <Avatar className="h-4 w-4">
                  <AvatarImage src={user.avatar} />
                  <AvatarFallback className="text-xs">
                    {(user.displayName || user.username).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs font-medium">
                  {user.displayName || user.username}
                </span>
              </Badge>
            ))}
          </div>
        </div>

        {/* Informations supplémentaires */}
        <div className="text-xs text-muted-foreground space-y-1">
          <div>• {t('createConversationModal.preview.autoTranslation')}</div>
          <div>• {t('createConversationModal.preview.encryptedMessages')}</div>
          <div>• {t('createConversationModal.preview.historyEnabled')}</div>
        </div>
      </CardContent>
    </Card>
  );
}
