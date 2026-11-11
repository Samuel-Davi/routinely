/** Shown wherever text can reach the AI. Short on purpose: it is read, not scrolled past. */
export const AI_PRIVACY_TEXT =
  'As informações enviadas para a IA são processadas pelo Google (Gemini, nível gratuito) e podem ser usadas para melhorar os produtos deles. Não escreva dados sensíveis.';

export function AiPrivacyNotice({ className }: { className?: string }) {
  return (
    <p
      data-testid="ai-privacy-notice"
      className={`rounded-control bg-fill px-3 py-2 text-footnote text-label-secondary ${className ?? ''}`}
    >
      {AI_PRIVACY_TEXT}
    </p>
  );
}
