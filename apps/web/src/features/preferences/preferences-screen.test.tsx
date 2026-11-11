import { DEFAULT_PREFERENCES } from '@routinely/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/test/render';
import { API, server } from '@/test/server';
import { PreferencesScreen } from './preferences-screen';

describe('PreferencesScreen', () => {
  it('loads, edits and saves preferences', async () => {
    let saved: Record<string, unknown> | undefined;
    server.use(
      http.get(`${API}/preferences`, () => HttpResponse.json(DEFAULT_PREFERENCES)),
      http.get(`${API}/routines/replan-suggestion`, () =>
        HttpResponse.json({ needsReplan: false, reasons: [] }),
      ),
      http.put(`${API}/preferences`, async ({ request }) => {
        saved = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(saved);
      }),
    );
    renderWithProviders(<PreferencesScreen />);
    const save = await screen.findByRole('button', { name: 'Salvar preferências' });
    expect(save).toBeDisabled();
    expect(screen.getByLabelText('Início do dia')).toHaveValue('07:00');

    await userEvent.selectOptions(screen.getByLabelText('Duração máxima de um bloco'), '60');
    await userEvent.selectOptions(screen.getByLabelText('Fuso'), 'America/Sao_Paulo');
    expect(screen.getByText('Alterações não salvas')).toBeInTheDocument();
    await userEvent.click(save);

    await waitFor(() =>
      expect(saved).toEqual({
        ...DEFAULT_PREFERENCES,
        maxFocusBlockMinutes: 60,
        timezone: 'America/Sao_Paulo',
      }),
    );
    expect(await screen.findByText('Preferências salvas')).toBeInTheDocument();
    await waitFor(() => expect(save).toBeDisabled());
  });

  it('validates the day window before sending', async () => {
    server.use(http.get(`${API}/preferences`, () => HttpResponse.json(DEFAULT_PREFERENCES)));
    renderWithProviders(<PreferencesScreen />);
    const end = await screen.findByLabelText('Fim do dia');
    await userEvent.clear(end);
    await userEvent.type(end, '06:00');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar preferências' }));
    expect(await screen.findByText('O fim do dia deve ser depois do início')).toBeInTheDocument();
  });

  it('shows an error state when loading fails', async () => {
    server.use(
      http.get(`${API}/preferences`, () =>
        HttpResponse.json(
          { statusCode: 400, code: 'BAD_REQUEST', message: 'Indisponível' },
          { status: 400 },
        ),
      ),
    );
    renderWithProviders(<PreferencesScreen />);
    expect(await screen.findByText('Indisponível')).toBeInTheDocument();
  });
});
