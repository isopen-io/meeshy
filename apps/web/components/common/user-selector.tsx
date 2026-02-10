'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { User, SUPPORTED_LANGUAGES } from '@/types';
import { useI18n } from '@/hooks/useI18n';
import { getUserInitials } from '@/lib/avatar-utils';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { getUserStatus } from '@/lib/user-status';

interface UserSelectorProps {
  users: User[];
  onUserSelect: (user: User) => void;
  isLoading?: boolean;
}

export function UserSelector({ users, onUserSelect, isLoading = false }: UserSelectorProps) {
  const { t } = useI18n('conversations');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const getLanguageFlag = (languageCode: string): string => {
    const language = SUPPORTED_LANGUAGES.find(lang => lang.code === languageCode);
    return language?.flag || '🌐';
  };

  const getLanguageName = (languageCode: string): string => {
    const language = SUPPORTED_LANGUAGES.find(lang => lang.code === languageCode);
    return language?.name || languageCode;
  };

  const handleUserClick = (user: User) => {
    setSelectedUser(user);
  };

  const handleLogin = () => {
    if (selectedUser) {
      onUserSelect(selectedUser);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement des utilisateurs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Meeshy</h1>
          <p className="text-xl text-gray-600">
            Messagerie avec traduction automatique côté client
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Sélectionnez un utilisateur pour commencer à discuter
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {users.map((user) => (
            <Card
              key={user.id}
              className={`cursor-pointer transition-[box-shadow,transform] duration-200 hover:shadow-lg hover:-translate-y-1 ${
                selectedUser?.id === user.id
                  ? 'ring-2 ring-primary shadow-lg'
                  : 'hover:shadow-md'
              }`}
              onClick={() => handleUserClick(user)}
            >
              <CardHeader className="text-center">
                <div className="relative inline-block">
                  <Avatar className="w-16 h-16 mx-auto mb-2">
                    <AvatarFallback className="text-lg font-bold">
                      {getUserInitials(user)}
                    </AvatarFallback>
                  </Avatar>
                  {/* Badge de présence */}
                  <OnlineIndicator
                    isOnline={getUserStatus(user) === 'online'}
                    status={getUserStatus(user)}
                    size="lg"
                    className="absolute -bottom-1 -right-1"
                  />
                </div>
                <CardTitle className="text-lg">{user.username}</CardTitle>
                <CardDescription>
                  {user.isOnline ? (
                    <Badge variant="default" className="bg-green-500">
                      En ligne
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      Hors ligne
                    </Badge>
                  )}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Système:</span>
                  <span className="flex items-center gap-1">
                    {getLanguageFlag(user.systemLanguage)}
                    {getLanguageName(user.systemLanguage)}
                  </span>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Région:</span>
                  <span className="flex items-center gap-1">
                    {getLanguageFlag(user.regionalLanguage)}
                    {getLanguageName(user.regionalLanguage)}
                  </span>
                </div>

                {user.customDestinationLanguage && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Personnalisée:</span>
                    <span className="flex items-center gap-1">
                      {getLanguageFlag(user.customDestinationLanguage)}
                      {getLanguageName(user.customDestinationLanguage)}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t('conversationUI.autoTranslation')}</span>
                  <Badge variant={user.autoTranslateEnabled ? "default" : "secondary"}>
                    {user.autoTranslateEnabled ? t('conversationUI.enabled') : t('conversationUI.disabled')}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {selectedUser && (
          <div className="mt-8 text-center">
            <Card className="max-w-md mx-auto">
              <CardHeader>
                <CardTitle>Utilisateur sélectionné</CardTitle>
                <CardDescription>
                  Vous allez vous connecter en tant que {selectedUser.username}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleLogin} className="w-full" size="lg">
                  Se connecter
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
