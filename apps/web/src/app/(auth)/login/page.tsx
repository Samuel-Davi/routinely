import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginScreen } from '@/features/auth/login-screen';

export const metadata: Metadata = { title: 'Entrar' };

export default function LoginPage() {
  // useSearchParams (?next=) needs a Suspense boundary in the App Router.
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}
