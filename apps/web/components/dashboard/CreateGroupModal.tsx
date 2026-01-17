import { Users, Shield, Eye, Search, X, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { User } from '@/types';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupName: string;
  setGroupName: (name: string) => void;
  groupDescription: string;
  setGroupDescription: (desc: string) => void;
  isGroupPrivate: boolean;
  setIsGroupPrivate: (isPrivate: boolean) => void;
  availableUsers: User[];
  selectedUsers: User[];
  groupSearchQuery: string;
  setGroupSearchQuery: (query: string) => void;
  isLoadingUsers: boolean;
  isCreatingGroup: boolean;
  currentUser: User | undefined;
  toggleUserSelection: (user: User) => void;
  onCreateGroup: () => void;
}

export function CreateGroupModal({
  isOpen,
  onClose,
  groupName,
  setGroupName,
  groupDescription,
  setGroupDescription,
  isGroupPrivate,
  setIsGroupPrivate,
  availableUsers,
  selectedUsers,
  groupSearchQuery,
  setGroupSearchQuery,
  isLoadingUsers,
  isCreatingGroup,
  currentUser,
  toggleUserSelection,
  onCreateGroup,
}: CreateGroupModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <span className="dark:text-gray-100">Créer une nouvelle communauté</span>
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            Créez une communauté pour organiser vos conversations avec plusieurs personnes
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Group name */}
          <div>
            <Label htmlFor="groupName" className="text-sm font-medium dark:text-gray-200">
              Nom de la communauté *
            </Label>
            <Input
              id="groupName"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Ex: Équipe Marketing, Famille, Amis..."
              className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="groupDescription" className="text-sm font-medium dark:text-gray-200">
              Description (optionnelle)
            </Label>
            <Textarea
              id="groupDescription"
              value={groupDescription}
              onChange={(e) => setGroupDescription(e.target.value)}
              placeholder="Décrivez le but de cette communauté..."
              className="mt-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
              rows={2}
            />
          </div>

          {/* Privacy */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium dark:text-gray-200">Communauté privée</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isGroupPrivate
                  ? 'Seuls les membres invités peuvent rejoindre'
                  : "La communauté peut être découverte et rejointe par d'autres"}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              {isGroupPrivate ? (
                <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              ) : (
                <Eye className="h-4 w-4 text-gray-400 dark:text-gray-500" />
              )}
              <Switch checked={isGroupPrivate} onCheckedChange={setIsGroupPrivate} />
            </div>
          </div>

          {/* User search */}
          <div>
            <Label htmlFor="userSearch" className="text-sm font-medium dark:text-gray-200">
              Rechercher des membres
            </Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
              <Input
                id="userSearch"
                value={groupSearchQuery}
                onChange={(e) => setGroupSearchQuery(e.target.value)}
                placeholder="Rechercher par nom ou username..."
                className="pl-10 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
              />
            </div>
          </div>

          {/* Selected users */}
          {selectedUsers.length > 0 && (
            <div>
              <Label className="text-sm font-medium dark:text-gray-200">
                Membres sélectionnés ({selectedUsers.length + 1} au total, vous inclus)
              </Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {/* Current user (admin) */}
                <Badge variant="default" className="flex items-center gap-1">
                  {currentUser?.displayName || currentUser?.username}
                  <Shield className="h-3 w-3" />
                </Badge>
                {/* Selected members */}
                {selectedUsers.map((user) => (
                  <Badge
                    key={user.id}
                    variant="secondary"
                    className="flex items-center gap-1 dark:bg-gray-700 dark:text-gray-300"
                  >
                    {user.displayName || user.username}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => toggleUserSelection(user)} />
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Users list */}
          <div>
            <Label className="text-sm font-medium dark:text-gray-200">Utilisateurs disponibles</Label>
            <ScrollArea className="h-48 mt-2 border rounded-lg dark:border-gray-600 dark:bg-gray-700/50">
              {isLoadingUsers ? (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 dark:border-blue-400 mx-auto mb-2"></div>
                  Chargement des utilisateurs...
                </div>
              ) : availableUsers.length === 0 ? (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                  {groupSearchQuery.trim()
                    ? 'Aucun utilisateur trouvé pour cette recherche'
                    : 'Aucun utilisateur disponible'}
                </div>
              ) : (
                <div className="p-2">
                  {availableUsers.map((user) => {
                    const isSelected = selectedUsers.some((u) => u.id === user.id);
                    return (
                      <div
                        key={user.id}
                        className={`flex items-center space-x-3 p-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600/50 ${
                          isSelected
                            ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
                            : ''
                        }`}
                        onClick={() => toggleUserSelection(user)}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.avatar} />
                          <AvatarFallback className="dark:bg-gray-600 dark:text-gray-300">
                            {(user.displayName || user.username).charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="font-medium text-sm dark:text-gray-100">
                            {user.displayName || user.username}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">@{user.username}</p>
                        </div>
                        {isSelected && <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Actions */}
          <div className="flex space-x-3 pt-4">
            <Button onClick={onCreateGroup} disabled={!groupName.trim() || isCreatingGroup} className="flex-1">
              <Users className="mr-2 h-4 w-4" />
              {isCreatingGroup ? 'Création...' : 'Créer la communauté'}
            </Button>
            <Button
              onClick={onClose}
              variant="outline"
              className="dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Annuler
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
