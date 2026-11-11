import type { Metadata } from 'next';
import { PreferencesScreen } from '@/features/preferences/preferences-screen';

export const metadata: Metadata = { title: 'Ajustes' };

// Server Component shell: the interactive screen is the only client boundary.
export default function Page() {
  return <PreferencesScreen />;
}
