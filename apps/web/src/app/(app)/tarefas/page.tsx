import type { Metadata } from 'next';
import { TasksScreen } from '@/features/tasks/tasks-screen';

export const metadata: Metadata = { title: 'Tarefas' };

// Server Component shell: the interactive screen is the only client boundary.
export default function Page() {
  return <TasksScreen />;
}
