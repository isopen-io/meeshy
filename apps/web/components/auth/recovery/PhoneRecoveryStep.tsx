'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Phone, ArrowLeft, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { COUNTRY_CODES } from '@/constants/countries';

interface PhoneRecoveryStepProps {
  phone: string;
  selectedCountry: typeof COUNTRY_CODES[0];
  onPhoneChange: (phone: string) => void;
  onCountryChange: (country: typeof COUNTRY_CODES[0]) => void;
  onSubmit: () => void;
  onBack: () => void;
  isLoading: boolean;
  error: string | null;
  t: (key: string) => string | undefined;
}

export function PhoneRecoveryStep({
  phone,
  selectedCountry,
  onPhoneChange,
  onCountryChange,
  onSubmit,
  onBack,
  isLoading,
  error,
  t,
}: PhoneRecoveryStepProps) {
  return (
    <motion.div
      key="phone"
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -50, opacity: 0 }}
      className="space-y-6"
    >
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30"
        >
          <Phone className="w-8 h-8 text-white" />
        </motion.div>
        <h3 className="text-xl font-bold">{t('phoneReset.title')}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t('phoneReset.description')}
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="recovery-phone" className="text-sm font-medium">{t('phoneReset.phoneLabel')}</label>
        <div className="flex gap-2">
          <label htmlFor="recovery-country" className="sr-only">Indicatif pays</label>
          <select
            id="recovery-country"
            value={selectedCountry.code}
            onChange={(e) => {
              const country = COUNTRY_CODES.find((c) => c.code === e.target.value);
              if (country) onCountryChange(country);
            }}
            className="w-24 h-12 px-2 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            disabled={isLoading}
          >
            {COUNTRY_CODES.map((c) => (
              <option key={c.code} value={c.code}>{c.flag} {c.dial}</option>
            ))}
          </select>
          <Input
            id="recovery-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="6 12 34 56 78"
            disabled={isLoading}
            className="flex-1 h-12 border-2 border-emerald-200 dark:border-emerald-800 focus:border-emerald-500"
            autoComplete="tel"
          />
        </div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </motion.div>
      )}

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={isLoading}
          className="flex-1"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('register.wizard.back')}
        </Button>
        <Button
          onClick={onSubmit}
          disabled={isLoading || phone.replace(/\D/g, '').length < 6}
          className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <ArrowRight className="w-4 h-4 mr-2" />
          )}
          {t('phoneReset.searchButton')}
        </Button>
      </div>
    </motion.div>
  );
}
