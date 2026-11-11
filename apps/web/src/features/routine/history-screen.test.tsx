import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { makeRoutine, preferences, uuid } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import { API, server } from '@/test/server';
import { HistoryScreen, describeDiff } from './history-screen';

const summary = (overrides: Parameters<typeof makeRoutine>[0]) => {
  const { blocks: _blocks, ...rest } = makeRoutine(overrides);
  return rest;
};

describe('describeDiff', () => {
  it('summarises changes with correct plurals', () => {
    expect(describeDiff({ added: 3, removed: 1, moved: 2, kept: 4 })).toBe(
      '3 novos · 2 movidos · 1 removido · 4 mantidos',
    );
    expect(describeDiff({ added: 1, removed: 0, moved: 1, kept: 1 })).toBe(
      '1 novo · 1 movido · 1 mantido',
    );
    expect(describeDiff({ added: 0, removed: 0, moved: 0, kept: 0 })).toBe('Nenhum bloco');
    expect(describeDiff(null)).toBe('Sem comparação');
  });
});

describe('HistoryScreen', () => {
  beforeEach(() =>
    server.use(http.get(`${API}/preferences`, () => HttpResponse.json(preferences))),
  );

  it('lists versions with date, source and diff, and restores an old one', async () => {
    const v1 = summary({
      id: uuid(801),
      version: 1,
      active: false,
      source: 'HEURISTIC',
      blockCount: 5,
    });
    const v2 = summary({
      id: uuid(802),
      version: 2,
      active: true,
      trigger: 'REPLAN',
      diffSummary: { added: 1, removed: 0, moved: 2, kept: 3 },
      blockCount: 6,
    });
    let restored = false;
    server.use(
      http.get(`${API}/routines`, () => HttpResponse.json([v2, v1])),
      http.get(`${API}/tasks`, () => HttpResponse.json([])),
      http.get(`${API}/routines/active`, () => HttpResponse.json({ routine: null })),
      http.get(`${API}/routines/replan-suggestion`, () =>
        HttpResponse.json({ needsReplan: false, reasons: [] }),
      ),
      http.post(`${API}/routines/${v1.id}/restore`, () => {
        restored = true;
        return HttpResponse.json(
          makeRoutine({
            id: uuid(803),
            version: 3,
            trigger: 'RESTORE',
            notice: 'Versão 1 restaurada.',
          }),
          { status: 201 },
        );
      }),
    );
    renderWithProviders(<HistoryScreen />);
    expect(screen.getByRole('status', { name: 'Carregando histórico' })).toBeInTheDocument();

    expect(await screen.findByRole('heading', { name: 'Versão 2' })).toBeInTheDocument();
    expect(screen.getByText('Ativa')).toBeInTheDocument();
    expect(screen.getByText('Replanejamento')).toBeInTheDocument();
    expect(screen.getByText('1 novo · 2 movidos · 3 mantidos')).toBeInTheDocument();
    expect(screen.getByText('Gerada sem IA')).toBeInTheDocument();
    expect(screen.getByText(/6 blocos/)).toBeInTheDocument();
    // only non-active versions can be restored
    expect(screen.queryByRole('button', { name: 'Restaurar versão 2' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Restaurar versão 1' }));
    await waitFor(() => expect(restored).toBe(true));
    expect(await screen.findByText('Versão 1 restaurada.')).toBeInTheDocument();
  });

  it('shows failed versions without a restore action', async () => {
    server.use(
      http.get(`${API}/routines`, () =>
        HttpResponse.json([
          {
            ...summary({ id: uuid(810), version: 4, active: false }),
            status: 'FAILED',
            source: null,
            notice: 'A geração foi interrompida. Tente novamente.',
          },
        ]),
      ),
    );
    renderWithProviders(<HistoryScreen />);
    expect(await screen.findByText('Falhou')).toBeInTheDocument();
    expect(screen.getByText('A geração foi interrompida. Tente novamente.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Restaurar/ })).not.toBeInTheDocument();
  });

  it('retries a failed version and reports an error when the server refuses', async () => {
    const failedId = uuid(811);
    let retried: string | undefined;
    server.use(
      http.get(`${API}/routines`, () =>
        HttpResponse.json([
          {
            ...summary({ id: failedId, version: 4, active: false }),
            status: 'FAILED',
            source: null,
          },
        ]),
      ),
      http.post(`${API}/routines/${failedId}/retry`, () => {
        retried = failedId;
        return HttpResponse.json(
          { ...summary({ id: uuid(812), version: 5, active: false }), status: 'PENDING' },
          { status: 202 },
        );
      }),
    );
    const { store } = renderWithProviders(<HistoryScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Tentar de novo a versão 4' }));
    await waitFor(() => expect(retried).toBe(failedId));
    // the new job is followed like any other generation
    await waitFor(() => expect(store.getState().ui.pendingRoutineId).toBe(uuid(812)));

    server.use(
      http.post(`${API}/routines/${failedId}/retry`, () =>
        HttpResponse.json(
          {
            statusCode: 409,
            code: 'GENERATION_IN_PROGRESS',
            message: 'Já existe uma rotina sendo gerada.',
          },
          { status: 409 },
        ),
      ),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo a versão 4' }));
    expect(await screen.findByText('Já existe uma rotina sendo gerada.')).toBeInTheDocument();
  });

  it('has empty and error states', async () => {
    server.use(http.get(`${API}/routines`, () => HttpResponse.json([])));
    const { unmount } = renderWithProviders(<HistoryScreen />);
    expect(
      await screen.findByRole('heading', { name: 'Nenhuma versão ainda' }),
    ).toBeInTheDocument();
    unmount();

    server.use(
      http.get(`${API}/routines`, () =>
        HttpResponse.json(
          { statusCode: 400, code: 'BAD_REQUEST', message: 'Histórico indisponível' },
          { status: 400 },
        ),
      ),
    );
    renderWithProviders(<HistoryScreen />);
    expect(await screen.findByText('Histórico indisponível')).toBeInTheDocument();
  });
});
