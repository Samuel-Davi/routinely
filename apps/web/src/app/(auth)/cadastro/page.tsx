import type { Metadata } from 'next';
import { RegisterScreen } from '@/features/auth/register-screen';

export const metadata: Metadata = { title: 'Criar conta' };

export default function RegisterPage() {
  return <RegisterScreen />;
}
