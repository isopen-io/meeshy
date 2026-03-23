'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  Copy,
  Loader2,
  KeyRound,
  RefreshCw,
  CheckCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { twoFactorService } from '@/services/two-factor.service';
import { useI18n } from '@/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/use-accessibility';

type FlowState =
  | { step: 'idle' }
  | { step: 'setup'; secret: string; otpauthUrl: string; qrCodeDataUrl: string }
  | { step: 'backup-codes'; codes: string[] }
  | { step: 'disable' }
  | { step: 'regenerate-confirm' };

export function TwoFactorSettings() {
  const { t } = useI18n('settings');
  const reducedMotion = useReducedMotion();

  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [backupCodesCount, setBackupCodesCount] = useState(0);
  const [flow, setFlow] = useState<FlowState>({ step: 'idle' });
  const [verifyCode, setVerifyCode] = useState('');
  const [password, setPassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    const result = await twoFactorService.getStatus();
    if (result.success && result.data) {
      setEnabled(result.data.enabled);
      setBackupCodesCount(result.data.backupCodesCount);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleStartSetup = async () => {
    setSubmitting(true);
    const result = await twoFactorService.setup();
    setSubmitting(false);

    if (result.success && result.data) {
      setFlow({
        step: 'setup',
        secret: result.data.secret,
        otpauthUrl: result.data.otpauthUrl,
        qrCodeDataUrl: result.data.qrCodeDataUrl,
      });
      setVerifyCode('');
    } else {
      toast.error(result.error || t('twoFactor.errors.setupFailed', 'Failed to start 2FA setup'));
    }
  };

  const handleEnable = async () => {
    if (verifyCode.length < 6) return;

    setSubmitting(true);
    const result = await twoFactorService.enable(verifyCode);
    setSubmitting(false);

    if (result.success && result.data) {
      setEnabled(true);
      setFlow({ step: 'backup-codes', codes: result.data.backupCodes });
      setVerifyCode('');
      toast.success(t('twoFactor.enabled', '2FA has been enabled'));
    } else {
      toast.error(result.error || t('twoFactor.errors.invalidCode', 'Invalid verification code'));
    }
  };

  const handleDisable = async () => {
    if (!password) return;

    setSubmitting(true);
    const result = await twoFactorService.disable(password, disableCode || undefined);
    setSubmitting(false);

    if (result.success) {
      setEnabled(false);
      setFlow({ step: 'idle' });
      setPassword('');
      setDisableCode('');
      toast.success(t('twoFactor.disabled', '2FA has been disabled'));
    } else {
      toast.error(result.error || t('twoFactor.errors.disableFailed', 'Failed to disable 2FA'));
    }
  };

  const handleRegenerateBackupCodes = async () => {
    setSubmitting(true);
    const result = await twoFactorService.regenerateBackupCodes();
    setSubmitting(false);

    if (result.success && result.data) {
      setFlow({ step: 'backup-codes', codes: result.data.backupCodes });
      setBackupCodesCount(result.data.backupCodes.length);
      toast.success(t('twoFactor.backupCodesRegenerated', 'Backup codes regenerated'));
    } else {
      toast.error(result.error || t('twoFactor.errors.regenerateFailed', 'Failed to regenerate backup codes'));
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(t('twoFactor.copied', 'Copied to clipboard'));
    });
  };

  const cancelFlow = () => {
    setFlow({ step: 'idle' });
    setVerifyCode('');
    setPassword('');
    setDisableCode('');

    if (flow.step === 'setup') {
      twoFactorService.cancelSetup();
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center min-h-[120px]">
          <Loader2 className={cn('h-6 w-6 text-primary', !reducedMotion && 'animate-spin')} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Shield className="h-4 w-4 sm:h-5 sm:w-5" />
            {t('twoFactor.title', 'Two-Factor Authentication')}
          </CardTitle>
          <CardDescription className="text-sm sm:text-base">
            {t('twoFactor.description', 'Add an extra layer of security to your account with TOTP-based two-factor authentication.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-3">
              {enabled ? (
                <ShieldCheck className="h-6 w-6 text-green-500" />
              ) : (
                <ShieldOff className="h-6 w-6 text-yellow-500" />
              )}
              <div>
                <p className="font-medium">
                  {enabled
                    ? t('twoFactor.statusEnabled', '2FA is active')
                    : t('twoFactor.statusDisabled', '2FA is not enabled')}
                </p>
                {enabled && (
                  <p className="text-sm text-muted-foreground">
                    {t('twoFactor.backupCodesRemaining', { count: String(backupCodesCount) }) || `${backupCodesCount} backup codes remaining`}
                  </p>
                )}
              </div>
            </div>
            <Badge variant={enabled ? 'default' : 'secondary'}>
              {enabled
                ? t('twoFactor.active', 'Active')
                : t('twoFactor.inactive', 'Inactive')}
            </Badge>
          </div>

          {/* Action buttons when idle */}
          {flow.step === 'idle' && (
            <div className="flex flex-wrap gap-3">
              {!enabled ? (
                <Button onClick={handleStartSetup} disabled={submitting}>
                  {submitting ? (
                    <Loader2 className={cn('h-4 w-4 mr-2', !reducedMotion && 'animate-spin')} />
                  ) : (
                    <ShieldCheck className="h-4 w-4 mr-2" />
                  )}
                  {t('twoFactor.enable', 'Enable 2FA')}
                </Button>
              ) : (
                <>
                  <Button
                    variant="destructive"
                    onClick={() => setFlow({ step: 'disable' })}
                  >
                    <ShieldOff className="h-4 w-4 mr-2" />
                    {t('twoFactor.disable', 'Disable 2FA')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setFlow({ step: 'regenerate-confirm' })}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {t('twoFactor.regenerateBackupCodes', 'Regenerate Backup Codes')}
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Setup Flow */}
      {flow.step === 'setup' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <KeyRound className="h-4 w-4 sm:h-5 sm:w-5" />
              {t('twoFactor.setup.title', 'Set Up Authenticator')}
            </CardTitle>
            <CardDescription className="text-sm sm:text-base">
              {t('twoFactor.setup.description', 'Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* QR Code */}
            <div className="flex justify-center">
              <div className="p-4 bg-white rounded-xl shadow-sm border">
                <img
                  src={flow.qrCodeDataUrl || `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(flow.otpauthUrl)}&size=200x200`}
                  alt="2FA QR Code"
                  width={200}
                  height={200}
                  className="rounded-lg"
                />
              </div>
            </div>

            {/* Manual Secret */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t('twoFactor.setup.manualEntry', 'Manual entry key')}
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Input
                    readOnly
                    value={showSecret ? flow.secret : flow.secret.replace(/./g, '\u2022')}
                    className="font-mono text-sm pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(prev => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(flow.secret)}
                  title={t('twoFactor.copySecret', 'Copy secret')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Verification Code */}
            <div className="space-y-2">
              <Label htmlFor="verify-code" className="text-sm font-medium">
                {t('twoFactor.setup.verifyCode', 'Enter 6-digit code from your app')}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="verify-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                  className="font-mono text-lg tracking-widest text-center max-w-[200px]"
                  autoComplete="one-time-code"
                />
                <Button
                  onClick={handleEnable}
                  disabled={verifyCode.length < 6 || submitting}
                >
                  {submitting ? (
                    <Loader2 className={cn('h-4 w-4 mr-2', !reducedMotion && 'animate-spin')} />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  {t('twoFactor.setup.verify', 'Verify & Enable')}
                </Button>
              </div>
            </div>

            <Button variant="ghost" onClick={cancelFlow} className="text-muted-foreground">
              {t('twoFactor.cancel', 'Cancel')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Backup Codes Display */}
      {flow.step === 'backup-codes' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <KeyRound className="h-4 w-4 sm:h-5 sm:w-5" />
              {t('twoFactor.backupCodes.title', 'Backup Codes')}
            </CardTitle>
            <CardDescription className="text-sm sm:text-base">
              {t('twoFactor.backupCodes.description', 'Save these codes in a safe place. Each code can only be used once.')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg border border-yellow-200 dark:border-yellow-900">
              <p className="text-sm text-yellow-700 dark:text-yellow-400 font-medium mb-3">
                {t('twoFactor.backupCodes.warning', 'These codes will not be shown again. Save them now!')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {flow.codes.map((code, index) => (
                  <div
                    key={index}
                    className="font-mono text-sm p-2 bg-background rounded border text-center"
                  >
                    {code}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => copyToClipboard(flow.codes.join('\n'))}
              >
                <Copy className="h-4 w-4 mr-2" />
                {t('twoFactor.backupCodes.copyAll', 'Copy All Codes')}
              </Button>
              <Button onClick={() => {
                setFlow({ step: 'idle' });
                fetchStatus();
              }}>
                {t('twoFactor.backupCodes.done', 'Done')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Disable Flow */}
      {flow.step === 'disable' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl text-destructive">
              <ShieldOff className="h-4 w-4 sm:h-5 sm:w-5" />
              {t('twoFactor.disableFlow.title', 'Disable Two-Factor Authentication')}
            </CardTitle>
            <CardDescription className="text-sm sm:text-base">
              {t('twoFactor.disableFlow.description', 'Enter your password to disable 2FA. This will reduce your account security.')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="disable-password" className="text-sm font-medium">
                {t('twoFactor.disableFlow.password', 'Password')}
              </Label>
              <Input
                id="disable-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('twoFactor.disableFlow.passwordPlaceholder', 'Enter your password')}
                autoComplete="current-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="disable-code" className="text-sm font-medium">
                {t('twoFactor.disableFlow.code', 'TOTP Code (optional)')}
              </Label>
              <Input
                id="disable-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                className="font-mono tracking-widest max-w-[200px]"
                autoComplete="one-time-code"
              />
            </div>

            <div className="flex gap-3">
              <Button
                variant="destructive"
                onClick={handleDisable}
                disabled={!password || submitting}
              >
                {submitting ? (
                  <Loader2 className={cn('h-4 w-4 mr-2', !reducedMotion && 'animate-spin')} />
                ) : (
                  <ShieldOff className="h-4 w-4 mr-2" />
                )}
                {t('twoFactor.disableFlow.confirm', 'Disable 2FA')}
              </Button>
              <Button variant="ghost" onClick={cancelFlow}>
                {t('twoFactor.cancel', 'Cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Regenerate Confirmation */}
      {flow.step === 'regenerate-confirm' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5" />
              {t('twoFactor.regenerate.title', 'Regenerate Backup Codes')}
            </CardTitle>
            <CardDescription className="text-sm sm:text-base">
              {t('twoFactor.regenerate.description', 'This will invalidate all existing backup codes and generate new ones.')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('twoFactor.regenerate.warning', 'Any previously saved backup codes will stop working. Make sure to save the new codes.')}
            </p>
            <div className="flex gap-3">
              <Button onClick={handleRegenerateBackupCodes} disabled={submitting}>
                {submitting ? (
                  <Loader2 className={cn('h-4 w-4 mr-2', !reducedMotion && 'animate-spin')} />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {t('twoFactor.regenerate.confirm', 'Regenerate Codes')}
              </Button>
              <Button variant="ghost" onClick={cancelFlow}>
                {t('twoFactor.cancel', 'Cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
