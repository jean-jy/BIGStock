export const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick?: () => void, key?: string }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-3 px-4 py-3 w-full rounded-md font-inter text-xs font-semibold uppercase tracking-widest transition-all duration-300 ${
      active
        ? 'bg-white text-primary shadow-sm translate-x-1'
        : 'text-slate-500 hover:bg-surface-container-high hover:translate-x-1'
    }`}
  >
    <Icon size={18} />
    <span>{label}</span>
  </button>
);
