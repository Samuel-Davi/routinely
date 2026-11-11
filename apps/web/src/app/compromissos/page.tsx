import type { Metadata } from 'next';
import { CommitmentsScreen } from '@/features/commitments/commitments-screen';

export const metadata: Metadata = { title: 'Compromissos' };

// Server Component shell: the interactive screen is the only client boundary.
export default function Page() {
  return <CommitmentsScreen />;
}
