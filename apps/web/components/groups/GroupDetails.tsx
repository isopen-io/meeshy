/**
 * Composant détails d'un groupe avec React.lazy pour les conversations
 * Suit les Vercel React Best Practices: bundle-dynamic-imports
 */

import { memo, lazy, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, Lock, Copy, CheckCircle2, UserPlus, Settings, Globe, Users, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Group, Conversation } from '@meeshy/shared/types';

// Lazy load du composant conversations (bundle-dynamic-imports)
const ConversationsList = lazy(() => import('./ConversationsList'));

interface GroupDetailsProps {
  group: Group;
  conversations: Conversation[];
  isLoadingConversations: boolean;
  copiedIdentifier: string | null;
  isMobile: boolean;
  onBack: () => void;
  onCopyIdentifier: (identifier: string) => void;
  onSettingsClick: () => void;
  tGroups: (key: string) => string;
}

export const GroupDetails = memo(function GroupDetails({
  group,
  conversations,
  isLoadingConversations,
  copiedIdentifier,
  isMobile,
  onBack,
  onCopyIdentifier,
  onSettingsClick,
  tGroups
}: GroupDetailsProps) {
  const router = useRouter();
  const displayIdentifier = group.identifier?.replace(/^mshy_/, '') || '';

  return (
    <>
      {/* En-tête du groupe */}
      <div className="flex-shrink-0 p-4 border-b border-border/30 dark:border-border/50 bg-background/90 dark:bg-background/95 backdrop-blur-sm rounded-tr-2xl">
        <div className="flex items-center gap-3">
          {isMobile && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onBack}
              className="rounded-full h-10 w-10 p-0 hover:bg-accent/50"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="relative">
            <Avatar className="h-10 w-10 ring-2 ring-primary/20">
              <AvatarImage src={group.avatar || undefined} />
              <AvatarFallback className="bg-primary/20 text-primary font-bold">
                {group.name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-foreground">{group.name}</h1>
              {group.isPrivate && <Lock className="h-4 w-4 text-muted-foreground" />}
            </div>
            <div className="flex items-center gap-1 group/identifier">
              <span
                className="text-sm text-primary font-mono cursor-pointer hover:text-primary/80 transition-colors"
                onClick={() => onCopyIdentifier(group.identifier || '')}
              >
                {displayIdentifier}
              </span>
              {copiedIdentifier === group.identifier ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4 text-muted-foreground opacity-0 group-hover/identifier:opacity-100 transition-opacity" />
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-2xl">
              <UserPlus className="h-4 w-4 mr-1" />
              {tGroups('actions.invite')}
            </Button>
            <Button variant="outline" size="sm" className="rounded-2xl" onClick={onSettingsClick}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="flex-1 overflow-y-auto bg-background/50 dark:bg-background/60 backdrop-blur-sm rounded-br-2xl p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Section À propos */}
          <AboutSection group={group} tGroups={tGroups} />

          {/* Section Conversations avec lazy loading */}
          <Suspense
            fallback={
              <div className="bg-background/80 dark:bg-background/90 backdrop-blur-sm rounded-2xl border border-border/30 dark:border-border/50 p-6 shadow-sm">
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  <span className="ml-2 text-muted-foreground">
                    {tGroups('details.loadingConversations')}
                  </span>
                </div>
              </div>
            }
          >
            <ConversationsList
              conversations={conversations}
              isLoading={isLoadingConversations}
              onConversationClick={(id) => router.push(`/conversations/${id}`)}
              tGroups={tGroups}
            />
          </Suspense>
        </div>
      </div>
    </>
  );
});

// Composant AboutSection extrait (rendering-hoist-jsx)
const AboutSection = memo(function AboutSection({
  group,
  tGroups
}: {
  group: Group;
  tGroups: (key: string) => string;
}) {
  return (
    <div className="bg-background/80 dark:bg-background/90 backdrop-blur-sm rounded-2xl border border-border/30 dark:border-border/50 p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <MessageSquare className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-bold text-foreground">{tGroups('details.about')}</h2>
      </div>

      <p className="text-muted-foreground leading-relaxed mb-6">
        {group.description || tGroups('details.noDescription')}
      </p>

      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          <span>
            {group._count?.members || 0} {tGroups('members')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {group.isPrivate ? (
            <>
              <Lock className="h-4 w-4" />
              <span>{tGroups('visibility.private')} community</span>
            </>
          ) : (
            <>
              <Globe className="h-4 w-4" />
              <span>{tGroups('visibility.public')} community</span>
            </>
          )}
        </div>
        {group.createdAt && (
          <div>
            {tGroups('details.createdOn')} {new Date(group.createdAt).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
});
