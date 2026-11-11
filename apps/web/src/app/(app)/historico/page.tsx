import type { Metadata } from 'next';
import { HistoryScreen } from '@/features/routine/history-screen';

export const metadata: Metadata = { title: 'Histórico' };

// Server Component shell: the interactive screen is the only client boundary.
export default function Page() {
  return <HistoryScreen />;
}
