'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  Search,
  Users,
  UserCheck,
  UserX,
  Globe,
  MessageSquare,
  Calendar,
  MapPin,
  Eye,
  EyeOff,
  ExternalLink,
  Shield,
  Clock,
  Link2
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { adminService, AnonymousUser } from '@/services/admin.service';

export default function AdminAnonymousUsersPage() {
  const router = useRouter();
  const [anonymousUsers, setAnonymousUsers] = useState<AnonymousUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AnonymousUser | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const loadAnonymousUsers = async (page: number = 1, search?: string, status?: string) => {
    try {
      setLoading(true);
      const offset = (page - 1) * 20;
      const response = await adminService.getAnonymousUsers(offset, 20, search, status);
      
      if (response.data) {
        setAnonymousUsers(response.data.anonymousUsers || []);
        setTotalPages(Math.ceil((response.data.pagination?.total || 0) / 20));
        setTotalCount(response.data.pagination?.total || 0);
        setHasMore(response.data.pagination?.hasMore || false);
        setCurrentPage(page);
      } else {
        setAnonymousUsers([]);
        setTotalPages(1);
        setTotalCount(0);
        setHasMore(false);
        setCurrentPage(1);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des utilisateurs anonymes:', error);
      toast.error('Erreur lors du chargement des utilisateurs anonymes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnonymousUsers();
  }, []);

  const handleSearch = () => {
    loadAnonymousUsers(1, searchTerm || undefined, statusFilter || undefined);
  };

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status);
    loadAnonymousUsers(1, searchTerm || undefined, status || undefined);
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleString('fr-FR');
  };

  const getStatusBadge = (isActive: boolean, isOnline: boolean) => {
    if (isActive && isOnline) {
      return <Badge className="bg-green-100 text-green-800">Actif</Badge>;
    } else if (isActive && !isOnline) {
      return <Badge className="bg-yellow-100 text-yellow-800">Inactif</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-800">Désactivé</Badge>;
    }
  };

  if (loading) {
    return (
      <AdminLayout currentPage="/admin/anonymous-users">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2">Chargement des utilisateurs anonymes...</span>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout currentPage="/admin/anonymous-users">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button 
              variant="outline" 
              onClick={() => router.push('/admin')}
              className="flex items-center space-x-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Retour</span>
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Utilisateurs anonymes</h1>
              <p className="text-gray-600">Gestion des participants anonymes</p>
            </div>
          </div>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCount}</div>
              <p className="text-xs text-muted-foreground">
                Utilisateurs anonymes
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Actifs</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {anonymousUsers?.filter(u => u.isActive && u.isOnline).length || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Actuellement en ligne
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Messages</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {anonymousUsers?.reduce((sum, u) => sum + u._count.sentMessages, 0) || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Messages envoyés
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filtres et recherche */}
        <Card>
          <CardHeader>
            <CardTitle>Filtres et recherche</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Rechercher par nom, email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={statusFilter === '' ? 'default' : 'outline'}
                  onClick={() => handleStatusFilter('')}
                  size="sm"
                >
                  Tous
                </Button>
                <Button
                  variant={statusFilter === 'active' ? 'default' : 'outline'}
                  onClick={() => handleStatusFilter('active')}
                  size="sm"
                >
                  Actifs
                </Button>
                <Button
                  variant={statusFilter === 'inactive' ? 'default' : 'outline'}
                  onClick={() => handleStatusFilter('inactive')}
                  size="sm"
                >
                  Inactifs
                </Button>
              </div>
              <Button onClick={handleSearch} size="sm">
                Rechercher
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Liste des utilisateurs anonymes */}
        <Card>
          <CardHeader>
            <CardTitle>Liste des utilisateurs anonymes</CardTitle>
          </CardHeader>
          <CardContent>
            {!anonymousUsers || anonymousUsers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Aucun utilisateur anonyme trouvé
              </div>
            ) : (
              <div className="space-y-4">
                {anonymousUsers.map((user) => (
                  <div key={user.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                          <Users className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="font-medium text-gray-900">
                              {user.firstName} {user.lastName}
                            </h3>
                            <span className="text-sm text-gray-500">(@{user.username})</span>
                            {getStatusBadge(user.isActive, user.isOnline)}
                          </div>
                          <div className="flex items-center space-x-4 text-sm text-gray-500">
                            {user.email && (
                              <span className="flex items-center space-x-1">
                                <span>{user.email}</span>
                              </span>
                            )}
                            {user.country && (
                              <span className="flex items-center space-x-1">
                                <MapPin className="h-3 w-3" />
                                <span>{user.country}</span>
                              </span>
                            )}
                            <span className="flex items-center space-x-1">
                              <Globe className="h-3 w-3" />
                              <span>{user.language}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end space-y-2">
                        <div className="text-sm text-gray-500">
                          <div className="flex items-center space-x-1">
                            <MessageSquare className="h-3 w-3" />
                            <span>{user._count.sentMessages} messages</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Calendar className="h-3 w-3" />
                            <span>Rejoint le {formatDate(user.joinedAt)}</span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedUser(user);
                            setShowDetailsModal(true);
                          }}
                          className="flex items-center space-x-1"
                        >
                          <Eye className="h-3 w-3" />
                          <span>Détails</span>
                        </Button>
                      </div>
                    </div>
                    
                    {/* Informations sur le lien de partage */}
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center justify-between text-sm">
                        <div>
                          <span className="text-gray-500">Conversation: </span>
                          <span className="font-medium">
                            {user.shareLink.conversation.title || user.shareLink.conversation.identifier || 'Sans titre'}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-gray-500">Lien: </span>
                          <Badge variant="outline">{user.shareLink.identifier || user.shareLink.linkId}</Badge>
                        </div>
                      </div>
                    </div>

                    {/* Permissions */}
                    <div className="mt-2 flex items-center space-x-2 text-xs">
                      <span className="text-gray-500">Permissions:</span>
                      {user.canSendMessages && <Badge variant="outline" className="text-xs">Messages</Badge>}
                      {user.canSendFiles && <Badge variant="outline" className="text-xs">Fichiers</Badge>}
                      {user.canSendImages && <Badge variant="outline" className="text-xs">Images</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <div className="text-sm text-gray-500">
                  Page {currentPage} sur {totalPages} ({totalCount} utilisateurs)
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadAnonymousUsers(currentPage - 1, searchTerm || undefined, statusFilter || undefined)}
                    disabled={currentPage === 1}
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadAnonymousUsers(currentPage + 1, searchTerm || undefined, statusFilter || undefined)}
                    disabled={!hasMore}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal de détails */}
        <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
          <DialogContent className="max-w-3xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
                <span>Détails de l'utilisateur anonyme</span>
              </DialogTitle>
            </DialogHeader>

            {selectedUser && (
              <ScrollArea className="max-h-[70vh] pr-4">
                <div className="space-y-6">
                  {/* Informations générales */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center space-x-2">
                        <Shield className="h-4 w-4" />
                        <span>Informations générales</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-500">Nom complet</p>
                          <p className="text-sm font-semibold">{selectedUser.firstName} {selectedUser.lastName}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Nom d'utilisateur</p>
                          <p className="text-sm font-semibold">@{selectedUser.username}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Email</p>
                          <p className="text-sm">{selectedUser.email || 'Non renseigné'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Statut</p>
                          <div>{getStatusBadge(selectedUser.isActive, selectedUser.isOnline)}</div>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Pays</p>
                          <p className="text-sm flex items-center space-x-1">
                            <MapPin className="h-3 w-3" />
                            <span>{selectedUser.country || 'Non renseigné'}</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Langue</p>
                          <p className="text-sm flex items-center space-x-1">
                            <Globe className="h-3 w-3" />
                            <span>{selectedUser.language}</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Date d'inscription</p>
                          <p className="text-sm flex items-center space-x-1">
                            <Calendar className="h-3 w-3" />
                            <span>{formatDate(selectedUser.joinedAt)}</span>
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Dernière activité</p>
                          <p className="text-sm flex items-center space-x-1">
                            <Clock className="h-3 w-3" />
                            <span>{selectedUser.lastActivity ? formatDate(selectedUser.lastActivity) : 'Jamais'}</span>
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Permissions */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center space-x-2">
                        <Shield className="h-4 w-4" />
                        <span>Permissions et droits</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="text-sm font-medium">Envoi de messages</span>
                          <Badge variant={selectedUser.canSendMessages ? "default" : "secondary"}>
                            {selectedUser.canSendMessages ? 'Autorisé' : 'Refusé'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="text-sm font-medium">Envoi de fichiers</span>
                          <Badge variant={selectedUser.canSendFiles ? "default" : "secondary"}>
                            {selectedUser.canSendFiles ? 'Autorisé' : 'Refusé'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="text-sm font-medium">Envoi d'images</span>
                          <Badge variant={selectedUser.canSendImages ? "default" : "secondary"}>
                            {selectedUser.canSendImages ? 'Autorisé' : 'Refusé'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="text-sm font-medium">Voir l'historique</span>
                          <Badge variant={selectedUser.canViewHistory ? "default" : "secondary"}>
                            {selectedUser.canViewHistory ? 'Autorisé' : 'Refusé'}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Statistiques des messages */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center space-x-2">
                        <MessageSquare className="h-4 w-4" />
                        <span>Statistiques des messages</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-4 bg-blue-50 rounded-lg">
                          <p className="text-2xl font-bold text-blue-600">{selectedUser._count.sentMessages}</p>
                          <p className="text-sm text-gray-600">Messages envoyés</p>
                        </div>
                        <div className="text-center p-4 bg-green-50 rounded-lg">
                          <p className="text-2xl font-bold text-green-600">
                            {selectedUser._count.reactions || 0}
                          </p>
                          <p className="text-sm text-gray-600">Réactions</p>
                        </div>
                        <div className="text-center p-4 bg-purple-50 rounded-lg">
                          <p className="text-2xl font-bold text-purple-600">
                            {Math.round((selectedUser._count.sentMessages / Math.max(1, Math.ceil((new Date().getTime() - new Date(selectedUser.joinedAt).getTime()) / (1000 * 60 * 60 * 24)))) * 10) / 10}
                          </p>
                          <p className="text-sm text-gray-600">Messages/jour</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Lien de partage et conversation */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center space-x-2">
                        <Link2 className="h-4 w-4" />
                        <span>Lien de partage et conversation</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-gray-500 mb-2">Lien utilisé</p>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium">{selectedUser.shareLink.name || 'Sans nom'}</p>
                            <p className="text-sm text-gray-500">
                              ID: {selectedUser.shareLink.identifier || selectedUser.shareLink.linkId}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {selectedUser.shareLink.isActive ? 'Actif' : 'Inactif'}
                          </Badge>
                        </div>
                      </div>

                      <div>
                        <p className="text-sm font-medium text-gray-500 mb-2">Conversation rejointe</p>
                        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                          <div className="flex-1">
                            <p className="font-medium">
                              {selectedUser.shareLink.conversation.title ||
                               selectedUser.shareLink.conversation.identifier ||
                               'Sans titre'}
                            </p>
                            <p className="text-sm text-gray-500">
                              Type: {selectedUser.shareLink.conversation.type}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              router.push(`/admin/conversations?id=${selectedUser.shareLink.conversationId}`);
                              setShowDetailsModal(false);
                            }}
                            className="flex items-center space-x-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span>Voir conversation</span>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Actions admin */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Actions administrateur</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            // TODO: Implémenter la visualisation des messages
                            toast.info('Fonctionnalité à venir');
                          }}
                          className="flex items-center space-x-1"
                        >
                          <MessageSquare className="h-3 w-3" />
                          <span>Voir les messages</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            router.push(`/conversations/${selectedUser.shareLink.conversationId}`);
                            setShowDetailsModal(false);
                          }}
                          className="flex items-center space-x-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>Accéder à la conversation</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
