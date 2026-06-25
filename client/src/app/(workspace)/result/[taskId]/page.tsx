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
import { NextStepButton } from '@/features/result/next-step-button';

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
        <p className="text-muted-foreground mb-4">未提供任务 ID。</p>
        <Button onClick={() => router.push('/')}>返回首页</Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container max-w-2xl mx-auto py-12 px-4">
        <h1 className="text-2xl font-bold tracking-tight mb-6">结果</h1>
        <div className="h-48 rounded-lg border bg-muted animate-pulse" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container max-w-md mx-auto py-12 px-4 text-center">
        <p className="text-destructive mb-2">
          加载结果失败: {(error as Error)?.message}
        </p>
        <Button variant="outline" onClick={() => router.refresh()}>
          重试
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
            ? `任务失败: ${task.error_message}`
            : '任务尚未完成。'}
        </p>
        <Button onClick={() => router.push('/')}>返回首页</Button>
      </div>
    );
  }

  const result = task.result;
  const hasNovel = result.novel_content != null;
  const hasScript = result.script_content != null || result.novel_tweet_content != null;
  const hasLyrics = result.lyrics_content != null;
  const hasSong = result.audio_url != null || result.song_placeholder != null;
  const hasImage = result.image_url != null || result.image_placeholder != null;
  const hasVideo = result.video_url != null || result.video_placeholder != null;

  const tabs: { value: string; label: string; available: boolean }[] = [
    { value: 'novel', label: '小说', available: hasNovel },
    { value: 'script', label: '剧本', available: hasScript },
    { value: 'lyrics', label: '歌词', available: hasLyrics },
    { value: 'song', label: '歌曲', available: hasSong },
    { value: 'image', label: '图片', available: hasImage },
    { value: 'video', label: '视频', available: hasVideo },
  ];

  const hasAnyTab = tabs.some((t) => t.available);

  return (
    <div className="container max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">结果</h1>
        <Button variant="outline" onClick={() => router.push('/')}>
          返回首页
        </Button>
      </div>

      {!hasAnyTab ? (
        <div className="text-center py-12 space-y-4">
          <p className="text-muted-foreground">
            暂无可用内容。继续工作流以生成更多内容。
          </p>
          <Button onClick={() => router.push('/')}>返回首页</Button>
        </div>
      ) : (
        <>
          {/* Next step button at top — only for workflows that have a next step */}
          {task.workflow_type !== 'generate_video' && (
            <NextStepButton workflowType={task.workflow_type} result={result} />
          )}

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
              content={(result.novel_content as string) || '未生成小说内容。'}
              workflowType={task.workflow_type}
              chapters={result.chapters as { title: string; content: string }[] | undefined}
              taskId={taskId}
              resultTitle={result.title as string | undefined}
            />
          </TabsContent>
          <TabsContent value="script" className="mt-4">
            <ScriptTab
              content={(result.script_content as string) || '未生成剧本内容。'}
              workflowType={task.workflow_type}
              scriptContent={result as { novel_tweet_content?: string; video_tweet_content?: string; storyboard_content?: string }}
            />
          </TabsContent>
          <TabsContent value="lyrics" className="mt-4">
            <LyricsTab
              content={(result.lyrics_content as string) || '未生成歌词内容。'}
            />
          </TabsContent>
          <TabsContent value="song" className="mt-4">
            <SongTab audioUrl={result.audio_url as string | null} />
          </TabsContent>
          <TabsContent value="image" className="mt-4">
            <ImageTab imageUrl={result.image_url as string | null} />
          </TabsContent>
          <TabsContent value="video" className="mt-4">
            <VideoTab videoUrl={result.video_url as string | null} />
          </TabsContent>
        </Tabs>
        </>
      )}
    </div>
  );
}
