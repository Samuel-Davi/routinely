import type { Routine, RoutineBlock } from '@routinely/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { HOUR_HEIGHT } from '@/features/calendar/layout';
import {
  makeBlock,
  makeCommitment,
  makeRoutine,
  makeTask,
  preferences,
  uuid,
} from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import { API, server } from '@/test/server';
import { useRoutineDnd } from './routine-dnd';
import { WeekScreen } from './week-screen';

// Monday 2026-11-09, 06:00 in America/Manaus
const NOW = new Date('2026-11-09T10:00:00.000Z');
const BLOCK_NAME = /Tarefa: Preparar apresentação, 17:00 às 18:00/;

interface World {
  routine: Routine | null;
  suggestion: { needsReplan: boolean; reasons: { code: string; count: number }[] };
  aiConfigured: boolean;
}

function mockApi(overrides: Partial<World> = {}) {
  const world: World = {
    routine: makeRoutine(),
    suggestion: { needsReplan: false, reasons: [] },
    aiConfigured: true,
    ...overrides,
  };
  server.use(
    http.get(`${API}/preferences`, () => HttpResponse.json(preferences)),
    http.get(`${API}/auth/me`, () =>
      HttpResponse.json({ id: uuid(7), email: 'ana@example.com', name: 'Ana', isDemo: false }),
    ),
    http.get(`${API}/fixed-commitments`, () => HttpResponse.json([makeCommitment()])),
    http.get(`${API}/tasks`, () => HttpResponse.json([makeTask()])),
    http.get(`${API}/routines/active`, () => HttpResponse.json({ routine: world.routine })),
    http.get(`${API}/routines/replan-suggestion`, () => HttpResponse.json(world.suggestion)),
    http.get(`${API}/ai/status`, () =>
      HttpResponse.json({
        provider: 'gemini',
        configured: world.aiConfigured,
        model: 'm',
        retryModel: 'r',
      }),
    ),
  );
  return world;
}

describe('WeekScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  });
  afterEach(() => vi.useRealTimers());

  it('invites the user to generate the first routine', async () => {
    mockApi({ routine: null });
    renderWithProviders(<WeekScreen />);
    expect(
      await screen.findByRole('heading', { name: 'Pronto para montar sua semana' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replanejar' })).not.toBeInTheDocument();
  });

  it('generates a routine: starts the job, polls it and shows the blocks', async () => {
    const world = mockApi({ routine: null, aiConfigured: false });
    const generated = makeRoutine({
      source: 'HEURISTIC',
      notice: 'IA não configurada. Rotina gerada sem IA.',
    });
    let polls = 0;
    let body: unknown;
    server.use(
      http.post(`${API}/routines/generate`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          {
            ...generated,
            status: 'PENDING',
            source: null,
            active: false,
            blockCount: 0,
            blocks: undefined,
          },
          { status: 202 },
        );
      }),
      http.get(`${API}/routines/${generated.id}`, () => {
        polls += 1;
        if (polls < 2)
          return HttpResponse.json({
            ...generated,
            status: 'PENDING',
            source: null,
            active: false,
            blocks: [],
            blockCount: 0,
          });
        world.routine = generated;
        return HttpResponse.json(generated);
      }),
    );
    renderWithProviders(<WeekScreen />);
    await screen.findByRole('heading', { name: 'Pronto para montar sua semana' });

    await userEvent.click(
      screen.getAllByRole('button', { name: 'Gerar rotina' })[0] as HTMLElement,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Gerar rotina' });
    expect(within(dialog).getByText('IA não configurada')).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: /Planejar até o último prazo/ }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Gerar' }));

    expect(await screen.findByText('Montando sua rotina…')).toBeInTheDocument();
    expect(body).toEqual({ weekStart: '2026-11-09', untilLastDeadline: true });

    expect(
      await screen.findByRole('button', { name: BLOCK_NAME }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(polls).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Rotina gerada sem IA').length).toBeGreaterThan(0);
    expect(screen.getByText('IA não configurada. Rotina gerada sem IA.')).toBeInTheDocument();
    expect(screen.queryByText('Montando sua rotina…')).not.toBeInTheDocument();
  });

  it('reports a failed generation', async () => {
    mockApi({ routine: null });
    const id = uuid(950);
    const failed = {
      ...makeRoutine({ id, blocks: [] }),
      status: 'FAILED',
      source: null,
      active: false,
      notice: 'Não foi possível gerar a rotina. Tente novamente.',
    };
    server.use(
      http.post(`${API}/routines/generate`, () =>
        HttpResponse.json({ ...failed, status: 'PENDING', blocks: undefined }, { status: 202 }),
      ),
      http.get(`${API}/routines/${id}`, () => HttpResponse.json(failed)),
    );
    renderWithProviders(<WeekScreen />);
    await userEvent.click(
      (await screen.findAllByRole('button', { name: 'Gerar rotina' }))[0] as HTMLElement,
    );
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Gerar' }),
    );
    expect(
      await screen.findByText('Não foi possível gerar a rotina. Tente novamente.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Montando sua rotina…')).not.toBeInTheDocument());
  });

  it('shows why a routine has unscheduled tasks or was repaired', async () => {
    mockApi({
      routine: makeRoutine({
        source: 'AI_REPAIRED',
        notice: 'Parte da proposta da IA era inválida e foi corrigida automaticamente.',
        unscheduled: [
          {
            taskId: uuid(77),
            title: 'Tese inteira',
            reason: 'DEADLINE_IMPOSSIBLE',
            missingMinutes: 300,
          },
        ],
      }),
    });
    renderWithProviders(<WeekScreen />);
    expect(await screen.findByText('Rotina ajustada automaticamente')).toBeInTheDocument();
    expect(screen.getByText('1 tarefa ficou fora da rotina')).toBeInTheDocument();
    expect(screen.getByText(/Não cabe antes do prazo/)).toBeInTheDocument();
  });

  it('suggests a replan, which can be dismissed or accepted', async () => {
    const world = mockApi({
      suggestion: {
        needsReplan: true,
        reasons: [
          { code: 'NEW_TASK', count: 2 },
          { code: 'OVERDUE_BLOCK', count: 1 },
        ],
      },
    });
    let replans = 0;
    const next = makeRoutine({ id: uuid(951), version: 2, trigger: 'REPLAN' });
    server.use(
      http.post(`${API}/routines/replan`, () => {
        replans += 1;
        world.suggestion = { needsReplan: false, reasons: [] };
        world.routine = next;
        return HttpResponse.json(
          { ...next, status: 'PENDING', blocks: undefined },
          { status: 202 },
        );
      }),
      http.get(`${API}/routines/${next.id}`, () => HttpResponse.json(next)),
    );
    const { store } = renderWithProviders(<WeekScreen />);
    const banner = (await screen.findByText('Sua rotina pode estar desatualizada')).closest(
      '[role="status"]',
    ) as HTMLElement;
    expect(banner).toHaveTextContent('2 tarefas novas; 1 bloco ficou para trás');

    await userEvent.click(within(banner).getByRole('button', { name: 'Agora não' }));
    expect(screen.queryByText('Sua rotina pode estar desatualizada')).not.toBeInTheDocument();
    expect(store.getState().ui.dismissedSuggestionFor).toBe(world.routine?.id);

    await userEvent.click(screen.getByRole('button', { name: 'Replanejar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Replanejar' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Replanejar' }));
    expect(await screen.findByText('Rotina replanejada')).toBeInTheDocument();
    expect(replans).toBe(1);
  });

  it('sends a trimmed quick instruction, counts words and blocks an oversized one', async () => {
    mockApi({ routine: null });
    let body: unknown;
    server.use(
      http.post(`${API}/routines/generate`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { ...makeRoutine({ id: uuid(960), blocks: [] }), status: 'PENDING', blocks: undefined },
          { status: 202 },
        );
      }),
    );
    renderWithProviders(<WeekScreen />);
    await userEvent.click(
      (await screen.findAllByRole('button', { name: 'Gerar rotina' }))[0] as HTMLElement,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Gerar rotina' });
    const field = within(dialog).getByLabelText(/Instrução rápida/);
    const generate = within(dialog).getByRole('button', { name: 'Gerar' });

    await userEvent.type(field, '  priorize Web Academy  ');
    expect(within(dialog).getByText(/3\/40 palavras/)).toBeInTheDocument();

    fireEvent.change(field, { target: { value: Array.from({ length: 41 }, () => 'a').join(' ') } });
    expect(await within(dialog).findByText('Máximo de 40 palavras')).toBeInTheDocument();
    expect(generate).toBeDisabled();

    fireEvent.change(field, { target: { value: '  priorize Web Academy  ' } });
    expect(generate).toBeEnabled();
    await userEvent.click(generate);
    await waitFor(() => expect(body).toBeDefined());
    expect(body).toEqual({
      weekStart: '2026-11-09',
      untilLastDeadline: false,
      instruction: 'priorize Web Academy',
    });
  });

  it('warns that text sent to the AI is processed by Google, except for the demo account', async () => {
    mockApi({ routine: null });
    const { unmount } = renderWithProviders(<WeekScreen />);
    await userEvent.click(
      (await screen.findAllByRole('button', { name: 'Gerar rotina' }))[0] as HTMLElement,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Gerar rotina' });
    expect(await within(dialog).findByTestId('ai-privacy-notice')).toHaveTextContent(
      'processadas pelo Google (Gemini, nível gratuito)',
    );
    expect(within(dialog).queryByText('Modo demo, sem IA')).not.toBeInTheDocument();
    unmount();

    // the demo never reaches the AI: no privacy notice, an explanation instead
    server.use(
      http.get(`${API}/auth/me`, () =>
        HttpResponse.json({ id: uuid(8), email: 'demo@x.test', name: 'Conta demo', isDemo: true }),
      ),
    );
    renderWithProviders(<WeekScreen />);
    await userEvent.click(
      (await screen.findAllByRole('button', { name: 'Gerar rotina' }))[0] as HTMLElement,
    );
    const demoDialog = await screen.findByRole('dialog', { name: 'Gerar rotina' });
    expect(await within(demoDialog).findAllByText('Modo demo, sem IA')).not.toHaveLength(0);
    expect(within(demoDialog).queryByTestId('ai-privacy-notice')).not.toBeInTheDocument();
  });

  it('omits the instruction when the field is empty', async () => {
    mockApi({ routine: null });
    let body: unknown;
    server.use(
      http.post(`${API}/routines/generate`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { ...makeRoutine({ id: uuid(961), blocks: [] }), status: 'PENDING', blocks: undefined },
          { status: 202 },
        );
      }),
    );
    renderWithProviders(<WeekScreen />);
    await userEvent.click(
      (await screen.findAllByRole('button', { name: 'Gerar rotina' }))[0] as HTMLElement,
    );
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Gerar' }),
    );
    await waitFor(() => expect(body).toBeDefined());
    expect(body).not.toHaveProperty('instruction');
  });

  it('disables editing blocks while a routine is being generated', async () => {
    const block = makeBlock();
    const id = uuid(970);
    mockApi({ routine: makeRoutine({ blocks: [block] }) });
    const pending = { ...makeRoutine({ id, blocks: [] }), status: 'PENDING', active: false };
    server.use(
      http.post(`${API}/routines/replan`, () =>
        HttpResponse.json({ ...pending, blocks: undefined }, { status: 202 }),
      ),
      http.get(`${API}/routines/${id}`, () => HttpResponse.json(pending)),
    );
    renderWithProviders(<WeekScreen />);
    const blockButton = await screen.findByRole('button', { name: BLOCK_NAME });
    expect(blockButton).toHaveAttribute('aria-roledescription', 'bloco arrastável');

    await userEvent.click(screen.getByRole('button', { name: 'Replanejar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Replanejar' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Replanejar' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: BLOCK_NAME })).not.toHaveAttribute(
        'aria-roledescription',
      ),
    );
    expect(screen.getByRole('button', { name: BLOCK_NAME })).toHaveAttribute(
      'title',
      'A rotina está sendo gerada. Aguarde para editar os blocos.',
    );
    expect(screen.queryByTestId('resize-handle')).not.toBeInTheDocument();

    // The details open, but every action is disabled and explained.
    await userEvent.click(screen.getByRole('button', { name: BLOCK_NAME }));
    const details = await screen.findByRole('dialog');
    expect(within(details).getByText(/A rotina está sendo gerada/)).toBeInTheDocument();
    expect(within(details).getByRole('button', { name: 'Concluir bloco' })).toBeDisabled();
    expect(within(details).getByRole('button', { name: 'Travar' })).toBeDisabled();
    expect(within(details).getByRole('button', { name: 'Salvar horário' })).toBeDisabled();
  });

  it('opens block details, completes the block and locks it', async () => {
    const block = makeBlock();
    const world = mockApi({ routine: makeRoutine({ blocks: [block] }) });
    const calls: string[] = [];
    server.use(
      http.patch(`${API}/routines/blocks/${block.id}/lock`, async ({ request }) => {
        calls.push(`lock:${JSON.stringify(await request.json())}`);
        world.routine = makeRoutine({ blocks: [{ ...block, locked: true }] });
        return HttpResponse.json({ ...block, locked: true });
      }),
      http.patch(`${API}/routines/blocks/${block.id}/complete`, async ({ request }) => {
        calls.push(`complete:${JSON.stringify(await request.json())}`);
        const completed = {
          ...block,
          locked: true,
          completedAt: NOW.toISOString(),
          task: { ...block.task, status: 'DONE' as const },
        };
        world.routine = makeRoutine({ blocks: [completed] });
        return HttpResponse.json(completed);
      }),
    );
    renderWithProviders(<WeekScreen />);
    const trigger = await screen.findByRole('button', { name: BLOCK_NAME });
    expect(trigger).toHaveAttribute('aria-roledescription', 'bloco arrastável');

    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Preparar apresentação' });
    expect(within(dialog).getByText(/Por que este horário/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Travar' }));
    await waitFor(() => expect(calls).toContain('lock:{"locked":true}'));
    expect(await within(dialog).findByRole('button', { name: 'Destravar' })).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Concluir bloco' }));
    await waitFor(() => expect(calls).toContain('complete:{"completed":true}'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      await screen.findByRole('button', { name: /Preparar apresentação.*concluído/ }),
    ).toBeInTheDocument();
  });

  it('moves a block from the details form, validating as the user types', async () => {
    const block = makeBlock();
    const world = mockApi({ routine: makeRoutine({ blocks: [block] }) });
    let body: unknown;
    server.use(
      http.patch(`${API}/routines/blocks/${block.id}`, async ({ request }) => {
        body = await request.json();
        const moved = { ...block, ...(body as object), locked: true };
        // The server persists the move, so the refetch after the mutation returns it too.
        world.routine = makeRoutine({ blocks: [moved] });
        return HttpResponse.json(moved);
      }),
    );
    renderWithProviders(<WeekScreen />);
    await userEvent.click(await screen.findByRole('button', { name: BLOCK_NAME }));
    const dialog = await screen.findByRole('dialog');
    const save = within(dialog).getByRole('button', { name: 'Salvar horário' });
    expect(save).toBeDisabled();

    // 09:00–10:00 on Monday is inside "Trabalho"
    fireEvent.change(within(dialog).getByLabelText('Início'), { target: { value: '09:00' } });
    fireEvent.change(within(dialog).getByLabelText('Fim'), { target: { value: '10:00' } });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Conflita com um compromisso fixo');
    expect(save).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText('Início'), { target: { value: '19:00' } });
    fireEvent.change(within(dialog).getByLabelText('Fim'), { target: { value: '20:15' } });
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.click(save);

    await waitFor(() =>
      expect(body).toEqual({ start: '2026-11-09T23:00:00.000Z', end: '2026-11-10T00:15:00.000Z' }),
    );
    expect(
      await screen.findByRole('button', { name: /19:00 às 20:15.*travado/ }),
    ).toBeInTheDocument();
  });

  it('resizes a block from its handle, optimistically, and rolls back on a server conflict', async () => {
    const block = makeBlock();
    mockApi({ routine: makeRoutine({ blocks: [block] }) });
    let attempts = 0;
    server.use(
      http.patch(`${API}/routines/blocks/${block.id}`, () => {
        attempts += 1;
        return HttpResponse.json(
          {
            statusCode: 409,
            code: 'BLOCK_CONFLICT',
            message: 'O bloco não pode ficar neste horário.',
            details: { violations: ['OVERLAPS_BLOCK'] },
          },
          { status: 409 },
        );
      }),
    );
    renderWithProviders(<WeekScreen />);
    await screen.findByRole('button', { name: BLOCK_NAME });
    const handle = screen.getByTestId('resize-handle');

    fireEvent.pointerDown(handle, { button: 0, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 100 + HOUR_HEIGHT / 2, pointerId: 1 });
    // live feedback while resizing
    expect(await screen.findByText('17:00–18:30')).toBeInTheDocument();
    fireEvent.pointerUp(handle, { clientY: 100 + HOUR_HEIGHT / 2, pointerId: 1 });

    expect(await screen.findByText('Conflita com outro bloco')).toBeInTheDocument();
    expect(attempts).toBe(1);
    expect(await screen.findByRole('button', { name: BLOCK_NAME })).toBeInTheDocument();
  });

  it('refuses an invalid resize locally, without calling the server', async () => {
    const block = makeBlock();
    mockApi({ routine: makeRoutine({ blocks: [block] }) });
    renderWithProviders(<WeekScreen />);
    await screen.findByRole('button', { name: BLOCK_NAME });
    const handle = screen.getByTestId('resize-handle');

    fireEvent.pointerDown(handle, { button: 0, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 100 + HOUR_HEIGHT, pointerId: 1 }); // 2h > 90 min max
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(await screen.findByText('Maior que a duração máxima de um bloco')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: BLOCK_NAME })).toBeInTheDocument();
  });
});

describe('RoutineDndProvider api', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: NOW }));
  afterEach(() => vi.useRealTimers());

  it('previews, validates and commits a move', async () => {
    const block = makeBlock();
    const other = makeBlock({ start: '2026-11-10T21:00:00.000Z', end: '2026-11-10T22:00:00.000Z' });
    mockApi({ routine: makeRoutine({ blocks: [block, other] }) });
    let body: unknown;
    server.use(
      http.patch(`${API}/routines/blocks/${block.id}`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...block, ...(body as object), locked: true });
      }),
    );

    let api: ReturnType<typeof useRoutineDnd> | undefined;
    let target: RoutineBlock | undefined;
    function Probe({ positioned }: { positioned: { block: RoutineBlock } }) {
      api = useRoutineDnd();
      if (positioned.block.id === block.id) target = positioned.block;
      return <span>probe</span>;
    }
    // Reuse the real screen wiring, swapping the block renderer for a probe.
    const { CalendarScreen } = await import('@/features/calendar/calendar-screen');
    const { RoutineDndProvider } = await import('./routine-dnd');
    const { store } = renderWithProviders(
      <CalendarScreen
        renderBlock={(positioned) => <Probe positioned={positioned} />}
        wrapGrid={(grid) => (
          <RoutineDndProvider
            prefs={preferences}
            commitments={[makeCommitment()]}
            blocks={[block, other]}
          >
            {grid}
          </RoutineDndProvider>
        )}
      />,
    );
    await screen.findAllByText('probe');
    const at = (iso: string) => Date.parse(iso);

    // onto the other block → conflict, nothing is sent
    act(() => api?.begin(target as RoutineBlock, 'move'));
    act(() =>
      api?.preview(
        target as RoutineBlock,
        at('2026-11-10T21:30:00.000Z'),
        at('2026-11-10T22:30:00.000Z'),
      ),
    );
    expect(store.getState().drag).toMatchObject({
      blockId: block.id,
      kind: 'move',
      violations: ['OVERLAPS_BLOCK'],
    });
    act(() => api?.commit(target as RoutineBlock));
    expect(store.getState().drag.blockId).toBeNull();
    expect(await screen.findByText('Conflita com outro bloco')).toBeInTheDocument();
    expect(body).toBeUndefined();

    // dropped where it started → no request
    act(() => api?.begin(target as RoutineBlock, 'move'));
    act(() => api?.preview(target as RoutineBlock, at(block.start), at(block.end)));
    act(() => api?.commit(target as RoutineBlock));
    expect(body).toBeUndefined();

    // valid slot → request sent
    act(() => api?.begin(target as RoutineBlock, 'move'));
    act(() =>
      api?.preview(
        target as RoutineBlock,
        at('2026-11-11T21:00:00.000Z'),
        at('2026-11-11T22:00:00.000Z'),
      ),
    );
    expect(store.getState().drag.violations).toEqual([]);
    act(() => api?.commit(target as RoutineBlock));
    await waitFor(() =>
      expect(body).toEqual({ start: '2026-11-11T21:00:00.000Z', end: '2026-11-11T22:00:00.000Z' }),
    );

    act(() => api?.begin(target as RoutineBlock, 'move'));
    act(() => api?.cancel());
    expect(store.getState().drag.blockId).toBeNull();
  });
});
