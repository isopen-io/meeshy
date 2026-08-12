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
  isSearching: _isSearching,
  title,
  description,
}: NotificationEmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="backdrop-blur-xl bg-card/60 rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/20 border border-border/40 p-12 text-center"
    >
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-muted to-muted/60 flex items-center justify-center">
        <Bell className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">
        {title}
      </h3>
      <p className="text-muted-foreground">
        {description}
      </p>
    </motion.div>
  );
});
