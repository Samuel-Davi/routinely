import Link from 'next/link';
import { EmptyState } from '@/components/ui/feedback';

export default function NotFound() {
  return (
    <EmptyState
      icon="info"
      title="Página não encontrada"
      description="O endereço que você abriu não existe."
      action={
        <Link href="/" className="pressable rounded-control bg-fill px-4 py-2 font-medium">
          Voltar para a semana
        </Link>
      }
    />
  );
}
