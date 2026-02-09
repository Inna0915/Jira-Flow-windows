import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CreateTaskModal } from '../components/CreateTaskModal';

interface GlobalActionContextType {
  openCreateTask: () => void;
  closeCreateTask: () => void;
  isTaskModalOpen: boolean;
}

const GlobalActionContext = createContext<GlobalActionContextType | undefined>(undefined);

export function GlobalActionProvider({ children }: { children: ReactNode }) {
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  const openCreateTask = useCallback(() => {
    setIsTaskModalOpen(true);
  }, []);

  const closeCreateTask = useCallback(() => {
    setIsTaskModalOpen(false);
  }, []);

  return (
    <GlobalActionContext.Provider
      value={{
        openCreateTask,
        closeCreateTask,
        isTaskModalOpen,
      }}
    >
      {children}
      <CreateTaskModal
        isOpen={isTaskModalOpen}
        onClose={closeCreateTask}
        onSave={() => {
          // Task creation event is dispatched inside CreateTaskModal
          // This onSave is for additional parent-level handling if needed
        }}
      />
    </GlobalActionContext.Provider>
  );
}

export function useGlobalAction() {
  const context = useContext(GlobalActionContext);
  if (context === undefined) {
    throw new Error('useGlobalAction must be used within a GlobalActionProvider');
  }
  return context;
}

export default GlobalActionProvider;
