import { create } from 'zustand';
import type { WorkflowMode, WorkflowState } from '@/types/workflow';
import type { WorkflowType } from '@/types/task';
import { WORKFLOW_MODE_TO_TYPE } from '@/types/workflow';

interface WorkflowStore extends WorkflowState {
  setKeywords: (keywords: string) => void;
  setWorkflowMode: (mode: WorkflowMode) => void;
  setSelectedNovel: (novelId: string) => void;
  addCompletedStep: (type: WorkflowType) => void;
  setCurrentTaskId: (taskId: string | null) => void;
  reset: () => void;
  getWorkflowType: () => WorkflowType;
}

const initialState: WorkflowState = {
  keywords: '',
  workflowMode: 'novel',
  selectedNovelId: null,
  completedSteps: [],
  currentTaskId: null,
};

export const useWorkflowStore = create<WorkflowStore>()((set, get) => ({
  ...initialState,

  setKeywords: (keywords) => set({ keywords }),
  setWorkflowMode: (workflowMode) => set({ workflowMode }),
  setSelectedNovel: (selectedNovelId) => set({ selectedNovelId }),

  addCompletedStep: (type) =>
    set((state) => ({
      completedSteps: [...state.completedSteps, type],
    })),

  setCurrentTaskId: (currentTaskId) => set({ currentTaskId }),

  getWorkflowType: () => WORKFLOW_MODE_TO_TYPE[get().workflowMode],

  reset: () => set(initialState),
}));