'use client';

import { useWorkflow } from '@/hooks/use-workflow';
import { useWorkflowStore } from '@/stores/workflow-store';
import { Button } from '@/components/ui/button';
import type { WorkflowType } from '@/types/task';

const NEXT_STEP: Record<string, { label: string; workflowType: WorkflowType; setContent?: (result: Record<string, unknown>) => void }> = {
  generate_novel: {
    label: '下一步：生成剧本',
    workflowType: 'generate_script',
    setContent: (result) => {
      const novelContent = (result.novel_content as string) || '';
      const chapters = result.chapters as { title: string; content: string }[] | undefined;
      if (chapters) {
        useWorkflowStore.getState().setNovelContent(
          chapters.map((ch) => `# ${ch.title}\n\n${ch.content}`).join('\n\n---\n\n')
        );
      } else if (novelContent) {
        useWorkflowStore.getState().setNovelContent(novelContent);
      }
    },
  },
  generate_script: {
    label: '下一步：生成歌词',
    workflowType: 'generate_lyrics',
  },
  generate_lyrics: {
    label: '下一步：生成歌曲',
    workflowType: 'generate_song',
  },
  generate_image: {
    label: '下一步：生成视频',
    workflowType: 'generate_video',
  },
};

interface NextStepButtonProps {
  workflowType: string;
  result: Record<string, unknown>;
}

export function NextStepButton({ workflowType, result }: NextStepButtonProps) {
  const { goToNextStep } = useWorkflow();
  const step = NEXT_STEP[workflowType];
  if (!step) return null;

  return (
    <div className="flex justify-end">
      <Button
        onClick={() => {
          step.setContent?.(result);
          goToNextStep(workflowType);
        }}
      >
        {step.label}
      </Button>
    </div>
  );
}
