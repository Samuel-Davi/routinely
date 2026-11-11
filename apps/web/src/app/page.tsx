import type { Metadata } from 'next';
import { CalendarScreen } from '@/features/calendar/calendar-screen';

export const metadata: Metadata = { title: 'Semana' };

// Server Component shell: the interactive calendar is the only client boundary.
export default function WeekPage() {
  return <CalendarScreen />;
}
