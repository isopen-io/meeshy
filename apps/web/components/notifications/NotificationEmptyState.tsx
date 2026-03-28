'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { Bell } from 'lucide-react';

type NotificationEmptyStateProps = {
  isSearching: boolean;
  title: string;
  description: string;
};

export const NotificationEmptyState = memo(function NotificationEmptyState({
  isSearching,
  title,
  description,
}: NotificationEmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="backdrop-blur-xl bg-white/60 dark:bg-gray-900/60 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-white/30 dark:border-gray-700/40 p-12 text-center"
    >
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center">
        <Bell className="h-8 w-8 text-gray-400 dark:text-gray-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        {title}
      </h3>
      <p className="text-gray-600 dark:text-gray-400">
        {description}
      </p>
    </motion.div>
  );
});
