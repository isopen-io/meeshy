'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Users, ArrowLeft, UserPlus, Search, Filter, ChevronLeft, ChevronRight, Eye, Ghost } from 'lucide-react';
import { adminService } from '@/services/admin.service';
import type { User } from '@/services/admin.service';
import { getUserInitials } from '@/lib/avatar-utils';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/use-i18n';
import { TableSkeleton, StatCardSkeleton } from '@/components/admin/TableSkeleton';
import { useCurrentInterfaceLanguage } from '@/stores/language-store';

export default function AdminUsersPage() {
  const router = useRouter();
  const { t } = useI18n('admin');
  const interfaceLanguage = useCurrentInterfaceLanguage();
  const [users, setUsers] = useState<User[]>([]);
  const [, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    newUsers: 0,
    adminUsers: 0
  });

  // Filtres et pagination
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Debounce pour la recherche - attend 800ms après la dernière frappe
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 800);

    return () => clearTimeout(timer);
  }, [search]);

  // Fonction de chargement des données - définie avant les useEffect qui l'utilisent
  const loadUsersData = useCallback(async (showLoader = true) => {
    try {

      // Ne montrer le loader que lors du chargement initial ou sur demande
      if (showLoader) {
        setLoading(true);
      }
      const offset = (currentPage - 1) * pageSize;
      const [dashboardResponse, usersResponse] = await Promise.all([
        adminService.getDashboardStats(),
        adminService.getUsers(offset, pageSize, debouncedSearch, roleFilter, statusFilter)
      ]);

      // Le backend retourne {success: true, data: {...}}, donc il faut accéder à .data.data
      const dashboardData = (dashboardResponse.data as unknown)?.data || dashboardResponse.data;
      const usersData = (usersResponse.data as unknown)?.data || usersResponse.data;

      if (dashboardData) {
        setStats({
          totalUsers: dashboardData.statistics?.totalUsers || 0,
          activeUsers: dashboardData.statistics?.activeUsers || 0,
          newUsers: dashboardData.recentActivity?.newUsers || 0,
          adminUsers: dashboardData.statistics?.adminUsers || 0
        });
      }

      if (usersData) {
        setUsers(usersData.users || []);
        const total = usersData.pagination?.total || 0;
        setTotalPages(Math.max(1, Math.ceil(total / pageSize)));
      }
    } catch (error) {
      console.error('Erreur lors du chargement des données utilisateurs:', error);
      toast.error(t('usersList.loadError'));
      setUsers([]);
    } finally {
      setLoading(false);
      setIsInitialLoad(false);
    }
  }, [currentPage, pageSize, debouncedSearch, roleFilter, statusFilter, t]);

  // Réinitialiser la page à 1 quand les filtres changent (AVANT le chargement)
  useEffect(() => {
    if (!isInitialLoad) {
      setCurrentPage(1);
    }
  }, [debouncedSearch, roleFilter, statusFilter, isInitialLoad]);

  // Charger les données uniquement quand nécessaire
  useEffect(() => {
    loadUsersData(isInitialLoad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize, debouncedSearch, roleFilter, statusFilter, isInitialLoad]);

  const handleFilter = () => {
    setCurrentPage(1);
  };

  const handlePageSizeChange = (newSize: number) => {
    setCurrentPage(1);
    setPageSize(newSize);
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      'BIGBOSS': 'destructive',
      'ADMIN': 'default',
      'MODO': 'secondary',
      'AUDIT': 'outline',
      'ANALYST': 'outline',
      'USER': 'secondary'
    };
    return variants[role] || 'secondary';
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      'BIGBOSS': t('usersList.roleSuperAdmin'),
      'ADMIN': t('usersList.roleAdmin'),
      'MODO': t('usersList.roleModerator'),
      'MODERATOR': t('usersList.roleModerator'),
      'AUDIT': t('usersList.roleAuditor'),
      'ANALYST': t('usersList.roleAnalyst'),
      'USER': t('usersList.roleUser'),
      'MEMBER': t('usersList.roleUser'),
      'CREATOR': t('usersList.roleUser')
    };
    return labels[role] || role;
  };

  const formatDate = (date: Date | string) => {
    try {
      const d = new Date(date);
      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);

      if (diffInSeconds < 60) return t('usersList.justNow');
      if (diffInSeconds < 3600) return t('usersList.minutesAgo', { n: Math.floor(diffInSeconds / 60) });
      if (diffInSeconds < 86400) return t('usersList.hoursAgo', { n: Math.floor(diffInSeconds / 3600) });
      if (diffInSeconds < 2592000) return t('usersList.daysAgo', { n: Math.floor(diffInSeconds / 86400) });

      return d.toLocaleDateString(interfaceLanguage || 'en', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return 'N/A';
    }
  };

  if (isInitialLoad) {
    return (
      <AdminLayout currentPage="/admin/users">
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <StatCardSkeleton key={i} />)}
          </div>
          <TableSkeleton rows={10} columns={6} />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout currentPage="/admin/users">
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-2 sm:space-x-4">
            <Button
              variant="outline"
              onClick={() => router.push('/admin')}
              className="flex items-center space-x-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-200"
              size="sm"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{t('usersList.back')}</span>
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{t('usersList.pageTitle')}</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 hidden sm:block">{t('usersList.pageSubtitle')}</p>
            </div>
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              onClick={() => router.push('/admin/anonymous-users')}
              className="flex items-center space-x-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-200"
              size="sm"
            >
              <Ghost className="h-4 w-4" />
              <span className="hidden md:inline">{t('dashboard.navAnonymous')}</span>
            </Button>
            <Button
              className="flex items-center space-x-2 text-sm dark:bg-blue-700 dark:hover:bg-blue-800"
              size="sm"
              onClick={() => router.push('/admin/users/new')}
            >
              <UserPlus className="h-4 w-4" />
              <span className="hidden md:inline">{t('usersList.newUserButton')}</span>
            </Button>
          </div>
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{t('usersList.statTotal')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold dark:text-gray-100">{stats.totalUsers}</div>
              <Badge variant="outline" className="mt-1 text-xs dark:border-gray-700 dark:text-gray-300">{t('usersList.statTotal')}</Badge>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{t('usersList.statActive')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">{stats.activeUsers}</div>
              <Badge variant="outline" className="mt-1 text-xs text-green-600 dark:text-green-400 dark:border-green-700">
                {stats.totalUsers > 0 ? Math.round((stats.activeUsers / stats.totalUsers) * 100) : 0}%
              </Badge>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{t('usersList.statNew')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.newUsers}</div>
              <Badge variant="outline" className="mt-1 text-xs dark:border-gray-700 dark:text-gray-300">{t('usersList.stat7Days')}</Badge>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-900 dark:border-gray-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{t('usersList.statAdmins')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl sm:text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.adminUsers}</div>
              <Badge variant="outline" className="mt-1 text-xs text-purple-600 dark:text-purple-400 dark:border-purple-700">
                {stats.totalUsers > 0 ? Math.round((stats.adminUsers / stats.totalUsers) * 100) : 0}%
              </Badge>
            </CardContent>
          </Card>
        </div>

        {/* Liste des utilisateurs */}
        <Card className="dark:bg-gray-900 dark:border-gray-800">
          <CardHeader className="space-y-4">
            <CardTitle className="flex items-center space-x-2 text-base sm:text-lg dark:text-gray-100">
              <Users className="h-4 w-4 sm:h-5 sm:w-5" />
              <span>{t('usersList.usersWithCount', { count: users?.length || 0 })}</span>
            </CardTitle>

            {/* Filtres intégrés dans l'en-tête */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
                <Input
                  placeholder={t('usersList.searchPlaceholder')}
                  className="pl-8 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleFilter()}
                />
              </div>
              <select
                className="w-full p-2 border dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-800 dark:text-gray-200"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="">{t('usersList.filterAllRoles')}</option>
                <option value="USER">{t('usersList.roleUser')}</option>
                <option value="ADMIN">{t('usersList.roleAdmin')}</option>
                <option value="MODO">{t('usersList.roleModerator')}</option>
                <option value="AUDIT">{t('usersList.roleAuditor')}</option>
                <option value="ANALYST">{t('usersList.roleAnalyst')}</option>
                <option value="BIGBOSS">{t('usersList.roleSuperAdmin')}</option>
              </select>
              <select
                className="w-full p-2 border dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-800 dark:text-gray-200"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">{t('usersList.filterAllStatuses')}</option>
                <option value="active">{t('usersList.statusActive')}</option>
                <option value="inactive">{t('usersList.statusInactive')}</option>
              </select>
              <select
                className="w-full p-2 border dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-800 dark:text-gray-200"
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                title={t('usersList.usersWithCount', { count: pageSize })}
              >
                <option value="20">{t('usersList.perPage20')}</option>
                <option value="50">{t('usersList.perPage50')}</option>
                <option value="100">{t('usersList.perPage100')}</option>
              </select>
              <Button
                variant="outline"
                className="w-full text-sm dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-200"
                onClick={handleFilter}
              >
                <Filter className="h-4 w-4 mr-2" />
                {t('usersList.filterButton')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Vue Desktop (hidden on mobile) */}
            <div className="hidden lg:block space-y-4">
              {/* En-tête du tableau */}
              <div className="grid grid-cols-12 gap-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg font-medium text-sm text-gray-700 dark:text-gray-300 sticky top-0 z-10">
                <div className="col-span-3">{t('usersList.colUser')}</div>
                <div className="col-span-3">{t('usersList.colEmail')}</div>
                <div className="col-span-2">{t('usersList.colRole')}</div>
                <div className="col-span-1">{t('usersList.colStatus')}</div>
                <div className="col-span-2">{t('usersList.colLastActivity')}</div>
                <div className="col-span-1">{t('usersList.colActions')}</div>
              </div>

              {/* Lignes du tableau */}
              {users?.map((user) => (
                <div key={user.id} className="grid grid-cols-12 gap-4 p-3 border dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <div className="col-span-3 flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                      {getUserInitials(user)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{user.displayName || user.username}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 truncate">@{user.username}</div>
                    </div>
                  </div>
                  <div className="col-span-3 text-sm text-gray-600 dark:text-gray-400 truncate flex items-center">
                    {user.email}
                  </div>
                  <div className="col-span-2 flex items-center">
                    <Badge variant={getRoleBadgeVariant(user.role)} className="text-xs">
                      {getRoleLabel(user.role)}
                    </Badge>
                  </div>
                  <div className="col-span-1 flex items-center">
                    <Badge variant={user.isActive ? 'default' : 'secondary'} className="text-xs">
                      {user.isActive ? (
                        <span className="flex items-center">
                          <span className="w-2 h-2 bg-green-400 rounded-full mr-1"></span>
                          {t('usersList.statusActive')}
                        </span>
                      ) : t('usersList.statusInactive')}
                    </Badge>
                  </div>
                  <div className="col-span-2 text-sm text-gray-600 dark:text-gray-400 flex items-center">
                    {formatDate(user.updatedAt || user.createdAt)}
                  </div>
                  <div className="col-span-1 flex items-center justify-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/admin/users/${user.id}`)}
                      className="dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700 dark:text-gray-200"
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      {t('usersList.viewButton')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Vue Mobile/Tablet (visible only on mobile/tablet) */}
            <div className="lg:hidden space-y-3">
              {users?.map((user) => (
                <Card key={user.id} className="hover:shadow-md transition-shadow dark:bg-gray-800 dark:border-gray-700">
                  <CardContent className="p-4">
                    <div className="flex items-start space-x-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
                        {getUserInitials(user)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">{user.displayName || user.username}</h3>
                          <Badge variant={user.isActive ? 'default' : 'secondary'} className="text-xs">
                            {user.isActive ? '✓' : '✗'}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">@{user.username}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">{user.email}</p>
                        <div className="flex items-center justify-between mt-2">
                          <Badge variant={getRoleBadgeVariant(user.role)} className="text-xs">
                            {getRoleLabel(user.role)}
                          </Badge>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(user.updatedAt || user.createdAt)}</span>
                        </div>
                        <div className="mt-3">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs dark:bg-gray-700 dark:border-gray-600 dark:hover:bg-gray-600 dark:text-gray-200"
                            onClick={() => router.push(`/admin/users/${user.id}`)}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            {t('usersList.viewDetails')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Message si aucun utilisateur */}
            {(!users || users.length === 0) && (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{t('usersList.noUsersFound')}</h3>
                <p className="text-gray-500 dark:text-gray-400">{t('usersList.tryModifyingFilters')}</p>
              </div>
            )}

            {/* Pagination */}
            {users && users.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between mt-6 gap-4">
                <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  {t('usersList.paginationInfo', { page: currentPage, totalPages, count: users.length })}
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={handlePreviousPage}
                    className="text-xs sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-200 dark:disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="hidden sm:inline ml-1">{t('usersList.prevPage')}</span>
                  </Button>
                  <div className="flex items-center px-3 py-2 border dark:border-gray-700 rounded-md text-xs sm:text-sm font-medium dark:bg-gray-800 dark:text-gray-200">
                    {currentPage} / {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={handleNextPage}
                    className="text-xs sm:text-sm dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-200 dark:disabled:opacity-50"
                  >
                    <span className="hidden sm:inline mr-1">{t('usersList.nextPage')}</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </AdminLayout>
  );
}
