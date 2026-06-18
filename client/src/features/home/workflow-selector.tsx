'use client';

import { BookOpen, FileText, Music, Video } from 'lucide-react';
import { useWorkflowStore } from '@/stores/workflow-store';

const WORKFLOW_OPTIONS = [
  { mode: 'novel' as const, label: 'Novel', Icon: BookOpen },
  { mode: 'lyrics' as const, label: 'Lyrics', Icon: FileText },
  { mode: 'song' as const, label: 'Song', Icon: Music },
  { mode: 'video' as const, label: 'Video', Icon: Video },
];

export function WorkflowSelector() {
  const workflowMode = useWorkflowStore((s) => s.workflowMode);
  const setWorkflowMode = useWorkflowStore((s) => s.setWorkflowMode);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {WORKFLOW_OPTIONS.map((opt) => {
        const isSelected = workflowMode === opt.mode;
        const Icon = opt.Icon;

        return (
          <button
            key={opt.mode}
            type="button"
            onClick={() => setWorkflowMode(opt.mode)}
            className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm transition-all ${
              isSelected
                ? 'border-primary bg-primary/10 font-medium text-primary'
                : 'border-border hover:border-primary/50 hover:bg-muted'
            }`}
          >
            <Icon className="h-5 w-5" />
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
