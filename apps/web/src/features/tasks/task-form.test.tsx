import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { makeTask } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import { API, server } from '@/test/server';
import { TaskFormSheet } from './task-form';

const TZ = 'America/Manaus';

describe('TaskFormSheet', () => {
  it('validates required fields inline, in Portuguese', async () => {
    renderWithProviders(<TaskFormSheet open onClose={vi.fn()} timezone={TZ} />);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Informe um título')).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveAttribute('aria-invalid', 'true');
  });

  it('creates a task, converting the local deadline to UTC', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API}/tasks`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeTask({ estimationStatus: 'PENDING' }), { status: 201 });
      }),
      http.get(`${API}/tasks`, () => HttpResponse.json([])),
      http.get(`${API}/routines/replan-suggestion`, () =>
        HttpResponse.json({ needsReplan: false, reasons: [] }),
      ),
      http.get(`${API}/routines/active`, () => HttpResponse.json({ routine: null })),
    );
    const onClose = vi.fn();
    renderWithProviders(<TaskFormSheet open onClose={onClose} timezone={TZ} />);

    await userEvent.type(screen.getByLabelText('Título'), 'Estudar estatística');
    await userEvent.type(screen.getByLabelText('Descrição'), 'Capítulos 4 a 6');
    await userEvent.selectOptions(screen.getByLabelText('Prioridade'), 'URGENT');
    const deadline = screen.getByLabelText('Prazo');
    await userEvent.clear(deadline);
    await userEvent.type(deadline, '2026-11-20T18:00');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(body).toEqual({
      title: 'Estudar estatística',
      description: 'Capítulos 4 a 6',
      priority: 'URGENT',
      deadline: '2026-11-20T22:00:00.000Z', // 18:00 in Manaus
    });
    expect(await screen.findByText(/A IA está estimando/)).toBeInTheDocument();
  });

  it('keeps an unfinished new task as a draft when dismissed', async () => {
    const { store } = renderWithProviders(<TaskFormSheet open onClose={vi.fn()} timezone={TZ} />);
    await userEvent.type(screen.getByLabelText('Título'), 'Rascunho');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(store.getState().ui.drafts.task).toMatchObject({
      title: 'Rascunho',
      priority: 'MEDIUM',
    });
  });

  it('edits a task and sends the estimate only when it was overridden', async () => {
    const task = makeTask();
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.patch(`${API}/tasks/${task.id}`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(task);
      }),
      http.get(`${API}/tasks`, () => HttpResponse.json([task])),
      http.get(`${API}/routines/replan-suggestion`, () =>
        HttpResponse.json({ needsReplan: false, reasons: [] }),
      ),
      http.get(`${API}/routines/active`, () => HttpResponse.json({ routine: null })),
    );
    const onClose = vi.fn();
    const { rerender } = renderWithProviders(
      <TaskFormSheet open onClose={onClose} timezone={TZ} task={task} />,
    );

    expect(screen.getByLabelText('Título')).toHaveValue('Preparar apresentação');
    expect(screen.getByLabelText('Prazo')).toHaveValue('2026-11-13T18:00');
    expect(screen.getByLabelText('Duração (minutos)')).toHaveValue(180);

    await userEvent.clear(screen.getByLabelText('Título'));
    await userEvent.type(screen.getByLabelText('Título'), 'Apresentação final');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).not.toHaveProperty('estimate');
    expect(bodies[0]).toMatchObject({ title: 'Apresentação final' });

    rerender(<TaskFormSheet open={false} onClose={onClose} timezone={TZ} task={task} />);
    rerender(<TaskFormSheet open onClose={onClose} timezone={TZ} task={task} />);
    const minutes = await screen.findByLabelText('Duração (minutos)');
    await userEvent.clear(minutes);
    await userEvent.type(minutes, '90');
    await userEvent.selectOptions(screen.getByLabelText('Complexidade'), '2');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]?.estimate).toEqual({ complexity: 2, estimatedMinutes: 90, splittable: true });
  });

  it('rejects an estimate off the 15 minute grid', async () => {
    renderWithProviders(<TaskFormSheet open onClose={vi.fn()} timezone={TZ} task={makeTask()} />);
    const minutes = screen.getByLabelText('Duração (minutos)');
    await userEvent.clear(minutes);
    await userEvent.type(minutes, '50');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Use múltiplos de 15 minutos')).toBeInTheDocument();
  });

  it('asks the AI for a new estimate', async () => {
    const task = makeTask({ estimationSource: 'MANUAL' });
    let called = false;
    server.use(
      http.post(`${API}/tasks/${task.id}/estimate`, () => {
        called = true;
        return HttpResponse.json(
          { ...task, estimationStatus: 'PENDING', estimationSource: null },
          { status: 202 },
        );
      }),
    );
    const onClose = vi.fn();
    renderWithProviders(<TaskFormSheet open onClose={onClose} timezone={TZ} task={task} />);
    await userEvent.click(screen.getByRole('button', { name: 'Pedir à IA de novo' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(called).toBe(true);
  });

  it('shows the API error and stays open when saving fails', async () => {
    server.use(
      http.post(`${API}/tasks`, () =>
        HttpResponse.json(
          {
            statusCode: 429,
            code: 'RATE_LIMITED',
            message: 'Muitas requisições. Tente novamente em instantes.',
          },
          { status: 429 },
        ),
      ),
      http.get(`${API}/tasks`, () => HttpResponse.json([])),
      http.get(`${API}/routines/replan-suggestion`, () =>
        HttpResponse.json({ needsReplan: false, reasons: [] }),
      ),
      http.get(`${API}/routines/active`, () => HttpResponse.json({ routine: null })),
    );
    const onClose = vi.fn();
    renderWithProviders(<TaskFormSheet open onClose={onClose} timezone={TZ} />);
    await userEvent.type(screen.getByLabelText('Título'), 'Tarefa');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(
      await screen.findByText('Muitas requisições. Tente novamente em instantes.'),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
