import { AppShell } from '@/components/app-shell';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
