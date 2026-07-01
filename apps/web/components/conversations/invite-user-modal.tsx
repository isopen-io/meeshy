'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Search, 
  UserPlus, 
  Users, 
  X,
  Loader2
} from 'lucide-react';
import { User } from '@/types';
import { toast } from 'sonner';
import { apiService } from '@/services/api.service';
import { getUserInitials } from '@/lib/avatar-utils';
import { useI18n } from '@/hooks/useI18n';

interface InviteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  currentParticipants: User[];
  onUserInvited: (user: User) => void;
}

export function InviteUserModal({ 
  isOpen, 
  onClose, 
  conversationId, 
  currentParticipants,
  onUserInvited 
}: InviteUserModalProps) {
  const { t } = useI18n('conversations');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);

  // Rechercher des utilisateurs
  const searchUsers = async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await apiService.get<User[]>(`/api/users/search?q=${encodeURIComponent(query)}`);

      if (response.data) {
        const users = response.data;
        // Filtrer les utilisateurs qui ne sont pas déjà participants
        const filteredUsers = users.filter((user: User) => 
          !currentParticipants.some(participant => participant.id === user.id)
        );
        setSearchResults(filteredUsers);
      } else {
        toast.error(t('inviteModal.searchError'));
      }
    } catch (error) {
      console.error('Erreur lors de la recherche:', error);
      toast.error(t('inviteModal.searchError'));
    } finally {
      setIsSearching(false);
    }
  };

  // Effet pour la recherche avec debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchUsers(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Ajouter un utilisateur à la sélection
  const addUserToSelection = (user: User) => {
    if (!selectedUsers.some(u => u.id === user.id)) {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  // Retirer un utilisateur de la sélection
  const removeUserFromSelection = (userId: string) => {
    setSelectedUsers(selectedUsers.filter(u => u.id !== userId));
  };

  // Inviter les utilisateurs sélectionnés
  const inviteSelectedUsers = async () => {
    if (selectedUsers.length === 0) return;

    setIsInviting(true);
    try {
      // Inviter chaque utilisateur
      const invitePromises = selectedUsers.map(user => 
        apiService.post(`/api/conversations/${conversationId}/invite`, { userId: user.id })
      );

      const results = await Promise.all(invitePromises);

      // Vérifier les résultats
      const successfulInvites = results.filter(r => (r.data as unknown)?.success);
      const failedInvites = results.filter(r => !(r.data as unknown)?.success);

      if (successfulInvites.length > 0) {
        toast.success(t('inviteModal.inviteSuccess', { count: successfulInvites.length }));
        
        // Notifier le parent des utilisateurs invités
        selectedUsers.forEach(user => onUserInvited(user));
        
        // Fermer la modale
        onClose();
        setSelectedUsers([]);
        setSearchQuery('');
        setSearchResults([]);
      }

      if (failedInvites.length > 0) {
        toast.error(t('inviteModal.partialError', { count: failedInvites.length }));
      }

    } catch (error) {
      console.error('Erreur lors de l\'invitation:', error);
      toast.error(t('inviteModal.inviteError'));
    } finally {
      setIsInviting(false);
    }
  };

  // Fermer la modale
  const handleClose = () => {
    setSelectedUsers([]);
    setSearchQuery('');
    setSearchResults([]);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[80vh] flex flex-col sm:max-w-2xl sm:w-[90vw] sm:max-h-[75vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {t('inviteModal.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-4">
          {/* Barre de recherche */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('conversationDetails.inviteSearchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
            {isSearching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Utilisateurs sélectionnés */}
          {selectedUsers.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{t('inviteModal.selectedUsers', { count: selectedUsers.length })}</h4>
              <div className="flex flex-wrap gap-2">
                {selectedUsers.map(user => {
                  const userName = user.displayName || `${user.firstName} ${user.lastName}`.trim() || user.username;
                  return (
                  <Badge key={user.id} variant="secondary" className="flex items-center gap-2">
                    <Avatar className="h-4 w-4">
                      <AvatarImage src={user.avatar} />
                      <AvatarFallback className="text-xs">
                        {getUserInitials(user)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs">
                      {userName}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => removeUserFromSelection(user.id)}
                      aria-label={t('inviteModal.removeUserAria', { name: userName })}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Résultats de recherche */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">{t('inviteModal.searchResults')}</h4>
            <ScrollArea className="h-64">
              {searchResults.length === 0 && searchQuery.length >= 2 && !isSearching ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2" />
                  <p>{t('inviteModal.noUsersFound')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {searchResults.map(user => {
                    const isSelected = selectedUsers.some(u => u.id === user.id);
                    const displayName = user.displayName || `${user.firstName} ${user.lastName}`.trim() || user.username;
                    return (
                    <div
                      key={user.id}
                      role="button"
                      tabIndex={isSelected ? -1 : 0}
                      aria-disabled={isSelected}
                      aria-label={isSelected
                        ? t('inviteModal.selectedUserAria', { name: displayName })
                        : t('inviteModal.addUserAria', { name: displayName })}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                      onClick={() => !isSelected && addUserToSelection(user)}
                      onKeyDown={(e) => {
                        if (!isSelected && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          addUserToSelection(user);
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.avatar} />
                          <AvatarFallback>
                            {getUserInitials(user)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {displayName}
                          </p>
                          <p className="text-sm text-muted-foreground">@{user.username}</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        tabIndex={-1}
                        aria-hidden="true"
                        disabled={isSelected}
                      >
                        <UserPlus className="h-4 w-4 mr-1" />
                        {isSelected ? t('inviteModal.selected') : t('inviteModal.add')}
                      </Button>
                    </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isInviting}>
            {t('inviteModal.cancel')}
          </Button>
          <Button 
            onClick={inviteSelectedUsers} 
            disabled={selectedUsers.length === 0 || isInviting}
          >
            {isInviting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('inviteModal.inviting')}
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4 mr-2" />
                {t('inviteModal.inviteButton', { count: selectedUsers.length })}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
