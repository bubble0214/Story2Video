'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { tasksApi } from '@/services/tasks';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { NovelTab } from '@/features/result/novel-tab';
import { ScriptTab } from '@/features/result/script-tab';
import { LyricsTab } from '@/features/result/lyrics-tab';
import { SongTab } from '@/features/result/song-tab';
import { ImageTab } from '@/features/result/image-tab';
import { VideoTab } from '@/features/result/video-tab';
import { UnavailableTab } from '@/features/result/unavailable-tab';

export default function ResultPage() {
  const params = useParams<{ taskId: string }>();
  const router = useRouter();
  const taskId = params?.taskId;

  const { data: task, isLoading, isError, error } = useQuery({
    queryKey: ['task', taskId],
    queryFn: async () => {
      const { data } = await tasksApi.get(taskId!);
      return data;
    },
    enabled: !!taskId,
  });

  if (!taskId) {
    return (
      <div className="container max-w-md mx-auto py-12 px-4 text-center">
        <p className="text-muted-foreground mb-4">No task ID provided.</p>
        <Button onClick={() => router.push('/')}>Back to Home</Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container max-w-2xl mx-auto py-12 px-4">
        <h1 className="text-2xl font-bold tracking-tight mb-6">Result</h1>
        <div className="h-48 rounded-lg border bg-muted animate-pulse" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container max-w-md mx-auto py-12 px-4 text-center">
        <p className="text-destructive mb-2">
          Failed to load results: {(error as Error)?.message}
        </p>
        <Button variant="outline" onClick={() => router.refresh()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!task) return null;

  if (task.status !== 'SUCCESS') {
    return (
      <div className="container max-w-md mx-auto py-12 px-4 text-center space-y-4">
        <p className="text-muted-foreground">
          {task.status === 'FAILED'
            ? `Task Failed: ${task.error_message}`
            : 'Task not yet completed.'}
        </p>
        <Button onClick={() => router.push('/')}>Back to Home</Button>
      </div>
    );
  }

  const result = task.result;
  const hasNovel = result.novel_content != null;
  const hasScript = result.script_content != null;
  const hasLyrics = result.lyrics_content != null;
  const hasSong = result.audio_url != null || result.song_placeholder != null;
  const hasImage = result.image_url != null || result.image_placeholder != null;
  const hasVideo = result.video_url != null || result.video_placeholder != null;

  const tabs: { value: string; label: string; available: boolean }[] = [
    { value: 'novel', label: 'Novel', available: hasNovel },
    { value: 'script', label: 'Script', available: hasScript },
    { value: 'lyrics', label: 'Lyrics', available: hasLyrics },
    { value: 'song', label: 'Song', available: hasSong },
    { value: 'image', label: 'Image', available: hasImage },
    { value: 'video', label: 'Video', available: hasVideo },
  ];

  const hasAnyTab = tabs.some((t) => t.available);

  return (
    <div className="container max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Result</h1>
        <Button variant="outline" onClick={() => router.push('/')}>
          Back to Home
        </Button>
      </div>

      {!hasAnyTab ? (
        <div className="text-center py-12 space-y-4">
          <p className="text-muted-foreground">
            No content available yet. Continue the workflow to generate more.
          </p>
          <Button onClick={() => router.push('/')}>Back to Home</Button>
        </div>
      ) : (
        <Tabs defaultValue={tabs.find((t) => t.available)?.value || 'novel'}>
          <TabsList className="w-full justify-start">
            {tabs
              .filter((t) => t.available)
              .map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
          </TabsList>
          <TabsContent value="novel" className="mt-4">
            <NovelTab
              content={(result.novel_content as string) || 'No novel content generated.'}
              workflowType={task.workflow_type}
              chapters={result.chapters as { title: string; content: string }[] | undefined}
            />
          </TabsContent>
          <TabsContent value="script" className="mt-4">
            <ScriptTab
              content={(result.script_content as string) || 'No script content generated.'}
              workflowType={task.workflow_type}
            />
          </TabsContent>
          <TabsContent value="lyrics" className="mt-4">
            <LyricsTab
              content={(result.lyrics_content as string) || 'No lyrics content generated.'}
              workflowType={task.workflow_type}
            />
          </TabsContent>
          <TabsContent value="song" className="mt-4">
            <SongTab audioUrl={result.audio_url as string | null} />
          </TabsContent>
          <TabsContent value="image" className="mt-4">
            <ImageTab imageUrl={result.image_url as string | null} workflowType={task.workflow_type} />
          </TabsContent>
          <TabsContent value="video" className="mt-4">
            <VideoTab videoUrl={result.video_url as string | null} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
