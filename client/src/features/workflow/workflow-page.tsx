'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkflowStore } from '@/stores/workflow-store';
import { useMutation } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import { ModelSelector } from '@/components/model-selector';
import type { WorkflowType } from '@/types/task';

interface WorkflowPageProps {
  workflowType: WorkflowType;
  title: string;
  description: string;
  promptPlaceholder?: string;
}

export function WorkflowPage({
  workflowType,
  title,
  description,
  promptPlaceholder = 'Enter your content or ideas here...',
}: WorkflowPageProps) {
  const router = useRouter();
  const keywords = useWorkflowStore((s) => s.keywords);
  const selectedNovelId = useWorkflowStore((s) => s.selectedNovelId);
  const currentTaskId = useWorkflowStore((s) => s.currentTaskId);
  const setCurrentTaskId = useWorkflowStore((s) => s.setCurrentTaskId);
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [showProgress, setShowProgress] = useState(false);
  const hasStarted = useRef(false);

  const createMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {};
      if (prompt.trim()) {
        payload.prompt = prompt.trim();
      }
      if (keywords.trim()) {
        payload.keywords = keywords;
      }
      if (selectedNovelId) {
        payload.novel_id = selectedNovelId;
      }
      if (selectedModel) {
        payload.model = selectedModel;
      }
      return tasksApi.create({
        workflow_type: workflowType,
        input_params: payload,
      });
    },
    onSuccess: ({ data }) => {
      setCurrentTaskId(data.id);
      setShowProgress(true);
      hasStarted.current = true;
    },
    onError: () => {
      toast({ title: 'Failed to create task', variant: 'destructive' });
    },
  });

  const handleGenerate = useCallback(() => {
    if (!prompt.trim() && !keywords.trim()) {
      toast({ title: 'Please enter a prompt first', variant: 'destructive' });
      return;
    }
    createMutation.mutate();
  }, [prompt, keywords, createMutation]);

  if (showProgress && createMutation.isSuccess && currentTaskId) {
    return (
      <div className="py-8 px-4 max-w-2xl mx-auto space-y-8">
        <div className="max-w-md mx-auto">
          <Card>
            <CardContent className="pt-6 pb-6 text-center space-y-4">
              <div className="flex items-center justify-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse" />
                <span className="font-semibold">Processing...</span>
              </div>
              <p className="text-sm text-muted-foreground">{description}</p>
              <Progress value={30} />
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  onClick={() => router.push(`/task/${currentTaskId}`)}
                >
                  View Progress Details
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowProgress(false);
                    hasStarted.current = false;
                    setCurrentTaskId(null);
                  }}
                >
                  Back
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 px-4 max-w-2xl mx-auto space-y-10">
      {/* Header + Prompt Input */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-1">{description}</p>
        </div>

        <div className="space-y-2">
          <div className="relative">
            <textarea
              className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-4 py-3 pr-28 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
              placeholder={promptPlaceholder}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
            />
            <div className="absolute bottom-2 right-3">
              <ModelSelector value={selectedModel} onChange={setSelectedModel} />
            </div>
          </div>
          {keywords && (
            <p className="text-xs text-muted-foreground">
              Using keywords: <span className="font-medium">{keywords}</span>
            </p>
          )}
        </div>

        <Button
          className="w-full h-12 text-base"
          onClick={handleGenerate}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? 'Generating...' : 'Generate'}
        </Button>

        {createMutation.isError && (
          <Card className="border-destructive">
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-destructive mb-2">
                Failed to start task. Please try again.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => createMutation.mutate()}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
