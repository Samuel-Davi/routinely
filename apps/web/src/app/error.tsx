'use client';

import { ErrorState } from '@/components/ui/feedback';

export default function RouteError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="Algo deu errado"
      message="Ocorreu um erro inesperado ao exibir esta tela."
      onRetry={reset}
    />
  );
}
