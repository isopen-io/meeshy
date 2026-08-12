'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import AdminLayout from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  MessageSquare,
  Users as UsersIcon,
  Activity,
  Shield,
  Calendar,
  Link2,
  Target,
  UserPlus,
  Share2
} from 'lucide-react';
import { apiService } from '@/services/api.service';
import { adminService, type User as AdminUserType } from '@/services/admin.service';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/use-i18n';
import { useCurrentInterfaceLanguage } from '@/stores/language-store';

// Import des composants modulaires
import { UserPersonalInfoSection } from '@/components/admin/user-detail/UserPersonalInfoSection';
import { UserContactInfoSection } from '@/components/admin/user-detail/UserContactInfoSection';
import { UserLanguageSection } from '@/components/admin/user-detail/UserLanguageSection';
import { UserSecuritySection } from '@/components/admin/user-detail/UserSecuritySection';
import { UserGeolocationSection } from '@/components/admin/user-detail/UserGeolocationSection';
import { UserActivitySection } from '@/components/admin/user-detail/UserActivitySection';
import { UserConversationsSection } from '@/components/admin/user-detail/UserConversationsSection';
import { UserPostsSection } from '@/components/admin/user-detail/UserPostsSection';
import { UserMediaSection } from '@/components/admin/user-detail/UserMediaSection';
import { UserReportsSection } from '@/components/admin/user-detail/UserReportsSection';
import { UserReportedMessagesSection } from '@/components/admin/user-detail/UserReportedMessagesSection';

interface AdminApiResponse<T> {
  success: boolean;
  data: T;
}

export default function UserDetailPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;
  const { t } = useI18n('admin');
  const interfaceLanguage = useCurrentInterfaceLanguage();

  const [user, setUser] = useState<AdminUserType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [roleEdit, setRoleEdit] = useState({
    editing: false,
    role: '',
    reason: ''
  });

  const [passwordReset, setPasswordReset] = useState({
    open: false,
    newPassword: '',
    confirmPassword: '',
    reason: ''
  });

  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    loadUserData();
  }, [userId]);

  const loadUserData = async () => {
    try {
      setLoading(true);
      const response = await apiService.get<AdminApiResponse<AdminUserType>>(`/admin/users/${userId}`);

      if (response.data?.success && response.data?.data) {
        const userData = response.data.data as AdminUserType;
        setUser(userData);
        setRoleEdit(prev => ({ ...prev, role: userData.role }));
      }
    } catch (error) {
      console.error('Erreur chargement utilisateur:', error);
      toast.error(t('usersDetail.errorLoadingUser'));
      router.push('/admin/users');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!roleEdit.reason || roleEdit.reason.length < 10) {
      toast.error(t('usersDetail.reasonRequired'));
      return;
    }

    try {
      setSaving(true);
      const response = await adminService.updateUserRole(userId, roleEdit.role);

      if (response.success) {
        toast.success(t('usersDetail.roleUpdatedSuccess'));
        setRoleEdit({ editing: false, role: roleEdit.role, reason: '' });
        loadUserData();
      }
    } catch (error: unknown) {
      toast.error(error.message || t('usersDetail.roleUpdateError'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!user) return;

    try {
      const newStatus = !user.isActive;
      const response = await adminService.toggleUserStatus(userId, newStatus);

      if (response.success) {
        toast.success(newStatus ? t('usersDetail.userActivated') : t('usersDetail.userDeactivated'));
        loadUserData();
      }
    } catch (error: unknown) {
      toast.error(error.message || t('usersDetail.statusChangeError'));
    }
  };

  const handleResetPassword = async () => {
    if (passwordReset.newPassword !== passwordReset.confirmPassword) {
      toast.error(t('usersDetail.passwordMismatch'));
      return;
    }

    try {
      setSaving(true);
      const response = await apiService.post<AdminApiResponse<void>>(`/admin/users/${userId}/reset-password`, {
        newPassword: passwordReset.newPassword,
        reason: passwordReset.reason
      });

      if (response.data?.success) {
        toast.success(t('usersDetail.passwordResetSuccess'));
        setPasswordReset({ open: false, newPassword: '', confirmPassword: '', reason: '' });
      }
    } catch (error: unknown) {
      toast.error(error.message || t('usersDetail.passwordResetError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    try {
      setSaving(true);
      const response = await adminService.deleteUser(userId);

      if (response.success) {
        toast.success(t('usersDetail.deleteSuccess'));
        router.push('/admin/users');
      }
    } catch (error: unknown) {
      toast.error(error.message || t('usersDetail.deleteError'));
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (date: Date | string) => {
    try {
      return new Date(date).toLocaleDateString(interfaceLanguage || 'en', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'N/A';
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      'BIGBOSS': 'destructive',
      'ADMIN': 'default',
      'MODO': 'secondary',
      'MODERATOR': 'secondary',
      'AUDIT': 'outline',
      'ANALYST': 'outline',
      'USER': 'secondary'
    };
    return variants[role] || 'secondary';
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      'BIGBOSS': t('users.newUser.roleBigboss'),
      'ADMIN': t('users.newUser.roleAdmin'),
      'MODERATOR': t('users.newUser.roleModo'),
      'MODO': t('users.newUser.roleModo'),
      'AUDIT': t('users.newUser.roleAudit'),
      'ANALYST': t('users.newUser.roleAnalyst'),
      'USER': t('users.newUser.roleUser'),
    };
    return labels[role] || role;
  };

  if (loading) {
    return (
      <AdminLayout currentPage="/admin/users">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400"></div>
          <span className="ml-3 text-lg dark:text-gray-200">{t('usersDetail.loadError')}</span>
        </div>
      </AdminLayout>
    );
  }

  if (!user) {
    return (
      <AdminLayout currentPage="/admin/users">
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-red-500 dark:text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{t('usersDetail.userNotFound')}</h3>
          <Button onClick={() => router.push('/admin/users')} className="dark:bg-blue-700 dark:hover:bg-blue-800">
            {t('usersDetail.backToList')}
          </Button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout currentPage="/admin/users">
      <div className="space-y-6 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 min-w-0">
            <Button
              variant="outline"
              onClick={() => router.push('/admin/users')}
              className="flex items-center space-x-2 flex-shrink-0 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-200"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>{t('usersDetail.back')}</span>
            </Button>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
                {user.displayName || user.username}
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 truncate">@{user.username}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant={user.isActive ? 'default' : 'secondary'}>
              {user.isActive ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {t('usersDetail.statusActive')}
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-1" />
                  {t('usersDetail.statusInactive')}
                </>
              )}
            </Badge>
            <Badge variant={getRoleBadgeVariant(user.role)}>
              <Shield className="h-4 w-4 mr-1" />
              {getRoleLabel(user.role)}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Colonne gauche - Informations principales */}
          <div className="lg:col-span-2 space-y-6">
            <UserPersonalInfoSection
              user={user}
              userId={userId}
              onUpdate={loadUserData}
            />

            <UserContactInfoSection
              user={user}
              userId={userId}
              onUpdate={loadUserData}
            />

            <UserLanguageSection
              user={user}
              userId={userId}
              onUpdate={loadUserData}
            />

            <UserSecuritySection
              user={user}
              userId={userId}
              onUpdate={loadUserData}
              onResetPassword={() => setPasswordReset({ ...passwordReset, open: true })}
            />

            <UserGeolocationSection user={user} />

            <UserActivitySection userId={userId} />

            <UserConversationsSection userId={userId} />

            <UserPostsSection userId={userId} />

            <UserMediaSection userId={userId} />

            <UserReportsSection userId={userId} />

            <UserReportedMessagesSection userId={userId} />

            {/* Gestion du rôle */}
            <Card className="dark:bg-gray-900 dark:border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2 dark:text-gray-100">
                  <Shield className="h-5 w-5" />
                  <span>{t('usersDetail.roleAndPermissions')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!roleEdit.editing ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="text-sm text-gray-600 dark:text-gray-400">{t('usersDetail.currentRole')}</span>
                      <Badge variant={getRoleBadgeVariant(user.role)}>
                        {getRoleLabel(user.role)}
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRoleEdit({ ...roleEdit, editing: true })}
                      className="dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-200"
                    >
                      <Edit2 className="h-4 w-4 mr-1" />
                      {t('usersDetail.editButton')}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium dark:text-gray-200">{t('usersDetail.newRole')}</label>
                      <select
                        className="w-full p-2 border dark:border-gray-700 rounded-md text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
                        value={roleEdit.role}
                        onChange={(e) => setRoleEdit({ ...roleEdit, role: e.target.value })}
                      >
                        <option value="USER">{t('users.newUser.roleUser')}</option>
                        <option value="ADMIN">{t('users.newUser.roleAdmin')}</option>
                        <option value="MODERATOR">{t('users.newUser.roleModo')}</option>
                        <option value="AUDIT">{t('users.newUser.roleAudit')}</option>
                        <option value="ANALYST">{t('users.newUser.roleAnalyst')}</option>
                        <option value="BIGBOSS">{t('users.newUser.roleBigboss')}</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium dark:text-gray-200">
                        {t('usersDetail.reasonLabel')}
                      </label>
                      <textarea
                        className="w-full p-2 border dark:border-gray-700 rounded-md text-sm min-h-[60px] dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                        placeholder={t('usersDetail.reasonPlaceholder')}
                        value={roleEdit.reason}
                        onChange={(e) => setRoleEdit({ ...roleEdit, reason: e.target.value })}
                      />
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRoleEdit({ editing: false, role: user.role, reason: '' })}
                      >
                        {t('usersDetail.cancelButton')}
                      </Button>
                      <Button size="sm" onClick={handleUpdateRole} disabled={saving}>
                        {t('usersDetail.saveButton')}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Colonne droite - Statistiques et actions */}
          <div className="space-y-6">
            {/* Statistiques */}
            <Card className="dark:bg-gray-900 dark:border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2 dark:text-gray-100">
                  <Activity className="h-5 w-5" />
                  <span>{t('usersDetail.statistics')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400 flex items-center">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    {t('usersDetail.statMessages')}
                  </span>
                  <span className="font-medium dark:text-gray-200">{user._count?.sentMessages || 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400 flex items-center">
                    <UsersIcon className="h-4 w-4 mr-2" />
                    {t('usersDetail.statConversations')}
                  </span>
                  <span className="font-medium dark:text-gray-200">{user._count?.conversations || 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400 flex items-center">
                    <Share2 className="h-4 w-4 mr-2" />
                    {t('usersDetail.statShareLinks')}
                  </span>
                  <span className="font-medium dark:text-gray-200">{user._count?.createdShareLinks || 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400 flex items-center">
                    <Target className="h-4 w-4 mr-2" />
                    {t('usersDetail.statTrackedLinks')}
                  </span>
                  <span className="font-medium dark:text-gray-200">{user._count?.createdTrackingLinks || 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400 flex items-center">
                    <Link2 className="h-4 w-4 mr-2" />
                    {t('usersDetail.statAffiliationTokens')}
                  </span>
                  <span className="font-medium dark:text-gray-200">{user._count?.createdAffiliateTokens || 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400 flex items-center">
                    <UserPlus className="h-4 w-4 mr-2" />
                    {t('usersDetail.statContacts')}
                  </span>
                  <span className="font-medium dark:text-gray-200">
                    {(user._count?.sentFriendRequests || 0) + (user._count?.receivedFriendRequests || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm pt-2 border-t dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400 flex items-center">
                    <Calendar className="h-4 w-4 mr-2" />
                    {t('usersDetail.statMemberSince')}
                  </span>
                  <span className="font-medium text-xs dark:text-gray-200">{formatDate(user.createdAt)}</span>
                </div>
                {user.lastActiveAt && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">{t('usersDetail.statLastActivity')}</span>
                    <span className="font-medium text-xs dark:text-gray-200">{formatDate(user.lastActiveAt)}</span>
                  </div>
                )}
                {user.profileCompletionRate !== null && (
                  <div className="pt-2">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-gray-600 dark:text-gray-400">{t('usersDetail.statProfileCompletion')}</span>
                      <span className="font-medium dark:text-gray-200">{user.profileCompletionRate}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${user.profileCompletionRate}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <Card className="dark:bg-gray-900 dark:border-gray-800">
              <CardHeader>
                <CardTitle className="dark:text-gray-100">{t('usersDetail.quickActions')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-200"
                  onClick={handleToggleStatus}
                >
                  {user.isActive ? (
                    <>
                      <XCircle className="h-4 w-4 mr-2" />
                      {t('usersDetail.disableAccount')}
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      {t('usersDetail.enableAccount')}
                    </>
                  )}
                </Button>

                {!deleteConfirm ? (
                  <Button
                    variant="outline"
                    className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/30 dark:border-red-800"
                    onClick={() => setDeleteConfirm(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('usersDetail.deleteUser')}
                  </Button>
                ) : (
                  <div className="p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-950/30 space-y-3">
                    <p className="text-sm text-red-800 dark:text-red-400 font-medium">
                      {t('usersDetail.warningIrreversible')}
                    </p>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setDeleteConfirm(false)}
                      >
                        {t('usersDetail.cancelButton')}
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 bg-red-600 hover:bg-red-700"
                        onClick={handleDeleteUser}
                        disabled={saving}
                      >
                        {t('usersDetail.confirmButton')}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Modal Reset Password */}
        {passwordReset.open && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md dark:bg-gray-900 dark:border-gray-800">
              <CardHeader>
                <CardTitle className="dark:text-gray-100">{t('usersDetail.resetPasswordTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium dark:text-gray-200">{t('usersDetail.newPasswordLabel')}</label>
                  <input
                    type="password"
                    value={passwordReset.newPassword}
                    onChange={(e) =>
                      setPasswordReset({ ...passwordReset, newPassword: e.target.value })
                    }
                    className="w-full p-2 border dark:border-gray-700 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium dark:text-gray-200">{t('usersDetail.confirmPasswordLabel')}</label>
                  <input
                    type="password"
                    value={passwordReset.confirmPassword}
                    onChange={(e) =>
                      setPasswordReset({ ...passwordReset, confirmPassword: e.target.value })
                    }
                    className="w-full p-2 border dark:border-gray-700 rounded-md text-sm dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium dark:text-gray-200">{t('usersDetail.reasonResetLabel')}</label>
                  <textarea
                    className="w-full p-2 border dark:border-gray-700 rounded-md text-sm min-h-[60px] dark:bg-gray-800 dark:text-gray-100"
                    value={passwordReset.reason}
                    onChange={(e) => setPasswordReset({ ...passwordReset, reason: e.target.value })}
                    placeholder={t('usersDetail.reasonResetPlaceholder')}
                  />
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setPasswordReset({ open: false, newPassword: '', confirmPassword: '', reason: '' })
                    }
                    className="flex-1 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700"
                  >
                    {t('usersDetail.cancelButton')}
                  </Button>
                  <Button onClick={handleResetPassword} disabled={saving} className="flex-1 dark:bg-blue-700 dark:hover:bg-blue-800">
                    {t('usersDetail.resetButton')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
