export const getTierClasses = (tier?: string) => {
  switch (tier) {
    case 'legendary':
      return 'bg-gradient-to-r from-amber-200 dark:from-amber-900/60 to-white dark:to-[#1C2128] border-amber-300 dark:border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]';
    case 'epic':
      return 'bg-gradient-to-r from-red-200 dark:from-red-900/60 to-white dark:to-[#1C2128] border-red-300 dark:border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]';
    case 'rare':
      return 'bg-gradient-to-r from-purple-200 dark:from-purple-900/60 to-white dark:to-[#1C2128] border-purple-300 dark:border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.2)]';
    case 'uncommon':
      return 'bg-gradient-to-r from-blue-200 dark:from-blue-900/60 to-white dark:to-[#1C2128] border-blue-300 dark:border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]';
    case 'common':
    default:
      return 'bg-white dark:bg-[#1C2128] border-gray-200 dark:border-gray-800 shadow-sm hover:border-gray-300 dark:hover:border-gray-600';
  }
};

export const getTierTextColor = (tier?: string) => {
  switch (tier) {
    case 'legendary': return 'text-amber-900 dark:text-amber-100';
    case 'epic': return 'text-red-900 dark:text-red-100';
    case 'rare': return 'text-purple-900 dark:text-purple-100';
    case 'uncommon': return 'text-blue-900 dark:text-blue-100';
    case 'common':
    default: return 'text-gray-900 dark:text-white';
  }
};

export const getTierSubtextColor = (tier?: string) => {
  switch (tier) {
    case 'legendary': return 'text-amber-700 dark:text-amber-200/70';
    case 'epic': return 'text-red-700 dark:text-red-200/70';
    case 'rare': return 'text-purple-700 dark:text-purple-200/70';
    case 'uncommon': return 'text-blue-700 dark:text-blue-200/70';
    case 'common':
    default: return 'text-gray-500 dark:text-gray-400';
  }
};
