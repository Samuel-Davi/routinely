import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { makeBlock, makeCommitment, makeRoutine, preferences } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import { API, server } from '@/test/server';
import { CalendarScreen } from './calendar-screen';

// Tuesday 2026-11-10, 10:30 in America/Manaus
const NOW = new Date('2026-11-10T14:30:00.000Z');

function mockApi(routine: ReturnType<typeof makeRoutine> | null = makeRoutine()) {
  server.use(
    http.get(`${API}/preferences`, () => HttpResponse.json(preferences)),
    http.get(`${API}/fixed-commitments`, () =>
      HttpResponse.json([
        makeCommitment(),
        makeCommitment({
          title: 'Academia',
          daysOfWeek: [1, 3, 5],
          startTime: '18:00',
          endTime: '19:00',
          category: 'HEALTH',
          color: 'green',
        }),
      ]),
    ),
    http.get(`${API}/routines/active`, () => HttpResponse.json({ routine })),
  );
}

function mockViewport(compact: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: compact,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

describe('CalendarScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    mockViewport(false);
  });
  afterEach(() => vi.useRealTimers());

  it('shows the current week with commitments and task blocks per day', async () => {
    mockApi();
    renderWithProviders(<CalendarScreen />);
    expect(screen.getByRole('status', { name: 'Carregando calendário' })).toBeInTheDocument();

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      '9 – 15 de nov. de 2026',
    );
    const monday = screen.getByRole('region', { name: 'segunda-feira, 9 de novembro' });
    expect(within(monday).getByText('Trabalho')).toBeInTheDocument();
    expect(within(monday).getByText('Academia')).toBeInTheDocument();
    expect(
      within(monday).getByRole('button', {
        name: 'Tarefa: Preparar apresentação, 17:00 às 18:00, prioridade alta',
      }),
    ).toBeInTheDocument();

    const saturday = screen.getByRole('region', { name: 'sábado, 14 de novembro' });
    expect(within(saturday).queryByText('Trabalho')).not.toBeInTheDocument();
    expect(screen.getAllByRole('region')).toHaveLength(7);
  });

  it('navigates between weeks and back to today', async () => {
    mockApi();
    renderWithProviders(<CalendarScreen />);
    const title = await screen.findByRole('heading', { level: 1 });

    await userEvent.click(screen.getByRole('button', { name: 'Próxima semana' }));
    expect(title).toHaveTextContent('16 – 22 de nov. de 2026');
    expect(screen.queryByRole('button', { name: /Preparar apresentação/ })).not.toBeInTheDocument();
    // weekly commitments repeat
    expect(
      within(screen.getByRole('region', { name: 'segunda-feira, 16 de novembro' })).getByText(
        'Trabalho',
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    await userEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    expect(title).toHaveTextContent('2 – 8 de nov. de 2026');
    await userEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(title).toHaveTextContent('9 – 15 de nov. de 2026');
  });

  it('switches to a single-day view with day tabs', async () => {
    mockApi();
    const { store } = renderWithProviders(<CalendarScreen />);
    await screen.findByRole('heading', { level: 1 });

    await userEvent.click(screen.getByRole('radio', { name: 'Dia' }));
    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'terça-feira, 10 de novembro' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('10 de novembro');
    expect(localStorage.getItem('routinely:view-mode')).toBe('day');

    const tabs = screen.getByRole('tablist', { name: 'Dias da semana' });
    expect(within(tabs).getByRole('tab', { selected: true })).toHaveAccessibleName(
      'terça-feira, 10 de novembro',
    );
    await userEvent.click(within(tabs).getByRole('tab', { name: 'segunda-feira, 9 de novembro' }));
    expect(
      screen.getByRole('region', { name: 'segunda-feira, 9 de novembro' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Preparar apresentação/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Próximo dia' }));
    expect(store.getState().calendar.selectedDate).toBe('2026-11-10');
    await userEvent.keyboard('{ArrowRight}');
  });

  it('uses the day view on phones', async () => {
    mockViewport(true);
    mockApi();
    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByRole('tablist', { name: 'Dias da semana' })).toBeInTheDocument();
    expect(screen.getAllByRole('region')).toHaveLength(1);
  });

  it('filters blocks by completion and priority', async () => {
    const done = makeBlock({
      start: '2026-11-10T21:00:00.000Z',
      end: '2026-11-10T22:00:00.000Z',
      completedAt: '2026-11-10T22:00:00.000Z',
      task: { ...makeBlock().task, title: 'Revisar relatório', priority: 'LOW' },
    });
    mockApi(makeRoutine({ blocks: [makeBlock(), done] }));
    renderWithProviders(<CalendarScreen />);
    expect(
      await screen.findByRole('button', { name: /Revisar relatório.*concluído/ }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const dialog = await screen.findByRole('dialog', { name: 'Filtros' });
    await userEvent.click(
      within(dialog).getByRole('switch', { name: 'Mostrar blocos concluídos' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Revisar relatório/ })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /Preparar apresentação/ })).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Baixa' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /Preparar apresentação/ }),
      ).not.toBeInTheDocument(),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Concluir' }));
    expect(await screen.findByRole('button', { name: 'Filtros (2)' })).toBeInTheDocument();
  });

  it('explains when there is no routine yet, still showing commitments', async () => {
    mockApi(null);
    renderWithProviders(<CalendarScreen />);
    expect(
      await screen.findByRole('heading', { name: 'Você ainda não tem uma rotina' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Trabalho').length).toBeGreaterThan(0);
  });

  it('shows an error state and retries', async () => {
    let fail = true;
    server.use(
      http.get(`${API}/preferences`, () => HttpResponse.json(preferences)),
      http.get(`${API}/fixed-commitments`, () => HttpResponse.json([])),
      http.get(`${API}/routines/active`, () =>
        fail
          ? HttpResponse.json(
              { statusCode: 400, code: 'BAD_REQUEST', message: 'Rotina indisponível' },
              { status: 400 },
            )
          : HttpResponse.json({ routine: null }),
      ),
    );
    renderWithProviders(<CalendarScreen />);
    expect(await screen.findByText('Rotina indisponível')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(
      await screen.findByRole('heading', { name: 'Você ainda não tem uma rotina' }),
    ).toBeInTheDocument();
  });
});
