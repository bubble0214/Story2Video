import { AppShell } from '@/components/app-shell';
import { WorkspaceLayout } from '@/components/workspace-layout';

export default function WorkspaceGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <WorkspaceLayout>{children}</WorkspaceLayout>
    </AppShell>
  );
}
