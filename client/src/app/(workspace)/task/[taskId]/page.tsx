'use client';

import { useParams, useRouter } from 'next/navigation';
import { TaskProgress } from '@/features/task/task-progress';
import { Button } from '@/components/ui/button';

export default function TaskProgressPage() {
  const params = useParams<{ taskId: string }>();
  const router = useRouter();
  const taskId = params?.taskId;

  if (!taskId) {
    return (
      <div className="container max-w-md mx-auto py-12 px-4 text-center">
        <p className="text-muted-foreground mb-4">No task ID provided.</p>
        <Button onClick={() => router.push('/')}>Back to Home</Button>
      </div>
    );
  }

  return (
    <div className="container max-w-md mx-auto py-12 px-4">
      <h1 className="text-2xl font-bold tracking-tight mb-6">
        Task Progress
      </h1>
      <TaskProgress taskId={taskId} />
    </div>
  );
}
