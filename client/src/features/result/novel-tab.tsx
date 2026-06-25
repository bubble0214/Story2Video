'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import { useWorkflowStore } from '@/stores/workflow-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Pencil, Eye, Loader2 } from 'lucide-react';

interface NovelTabProps {
  content: string;
  workflowType?: string;
  chapters?: { title: string; content: string }[];
  taskId?: string;
  resultTitle?: string;
}

export function NovelTab({ content, workflowType, chapters, taskId, resultTitle }: NovelTabProps) {
  const [currentChapter, setCurrentChapter] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const hasContent = content && content !== 'No novel content generated.';
  const hasChapters = chapters && chapters.length > 0;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const fullMarkdown = useMemo(() => {
    if (hasChapters) {
      return chapters!
        .map((ch) => `# ${ch.title}\n\n${ch.content}`)
        .join('\n\n---\n\n');
    }
    return content;
  }, [content, chapters, hasChapters]);

  const saveMutation = useMutation({
    mutationFn: (data: { novel_content: string; title?: string }) =>
      tasksApi.patch(taskId!, { result: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['asset-category'] });
      setIsEditing(false);
      toast({ title: '已保存' });
    },
    onError: (error) => {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      toast({
        title: '保存失败',
        description: err.response?.data?.detail || err.message,
        variant: 'destructive',
      });
    },
  });

  const handleEdit = () => {
    setEditedContent(fullMarkdown);
    setIsEditing(true);
  };

  const handleSave = () => {
    let title = resultTitle || '未命名';
    for (const line of editedContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('# ')) {
        title = trimmed.slice(2).trim();
        break;
      }
    }
    saveMutation.mutate({ novel_content: editedContent, title });
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  if (!hasContent && !hasChapters) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {content}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Title + Edit toggle */}
      {taskId && (
        <div className="flex items-center gap-2 pb-3 border-b">
          <h2 className="text-xl font-bold flex-1 truncate">
            {resultTitle || '未命名'}
          </h2>
          {isEditing ? (
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saveMutation.isPending || !editedContent.trim()}
              >
                {saveMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 保存中...</>
                ) : '保存'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancel}
                disabled={saveMutation.isPending}
              >
                取消
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={handleEdit}
              className="shrink-0"
            >
              <Pencil className="h-4 w-4 mr-1" />
              编辑
            </Button>
          )}
        </div>
      )}

      {isEditing ? (
        <textarea
          className="flex min-h-[500px] w-full rounded-md border border-input bg-background px-4 py-3 text-sm font-mono leading-relaxed ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
          value={editedContent}
          onChange={(e) => setEditedContent(e.target.value)}
          disabled={saveMutation.isPending}
        />
      ) : hasChapters ? (
        <>
          {/* Chapter navigation */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b">
            {chapters!.map((ch, i) => (
              <Button
                key={i}
                variant={i === currentChapter ? 'default' : 'outline'}
                size="sm"
                className="shrink-0"
                onClick={() => setCurrentChapter(i)}
              >
                {ch.title.length > 20 ? ch.title.slice(0, 20) + '…' : ch.title}
              </Button>
            ))}
          </div>

          {/* Current chapter content */}
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <h2 className="text-xl font-bold">{chapters![currentChapter].title}</h2>
            <p className="whitespace-pre-wrap leading-relaxed mt-4">
              {chapters![currentChapter].content}
            </p>
          </div>

          {/* Chapter navigation footer */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              disabled={currentChapter === 0}
              onClick={() => setCurrentChapter(currentChapter - 1)}
            >
              上一章
            </Button>
            <span className="text-sm text-muted-foreground">
              第 {currentChapter + 1} 章 / 共 {chapters!.length} 章
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentChapter === chapters!.length - 1}
              onClick={() => setCurrentChapter(currentChapter + 1)}
            >
              下一章
            </Button>
          </div>
        </>
      ) : (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
        </div>
      )}

    </div>
  );
}
