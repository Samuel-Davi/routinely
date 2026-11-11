import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { makeCommitment, preferences } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import { API, server } from '@/test/server';
import { CommitmentsScreen } from './commitments-screen';

const prefsHandler = http.get(`${API}/preferences`, () => HttpResponse.json(preferences));
const suggestion = http.get(`${API}/routines/replan-suggestion`, () =>
  HttpResponse.json({ needsReplan: false, reasons: [] }),
);

describe('CommitmentsScreen', () => {
  beforeEach(() => server.use(prefsHandler));

  it('shows a loading state, then the commitments', async () => {
    server.use(
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
    );
    renderWithProviders(<CommitmentsScreen />);
    expect(screen.getByRole('status', { name: 'Carregando compromissos' })).toBeInTheDocument();

    expect(await screen.findByRole('heading', { name: 'Trabalho' })).toBeInTheDocument();
    expect(screen.getByText('08:00–12:00')).toBeInTheDocument();
    expect(screen.getByText('Seg a Sex')).toBeInTheDocument();
    expect(screen.getByText('Seg, Qua, Sex')).toBeInTheDocument();
    expect(screen.getByText('Saúde')).toBeInTheDocument();
  });

  it('shows an empty state with a call to action', async () => {
    server.use(http.get(`${API}/fixed-commitments`, () => HttpResponse.json([])));
    renderWithProviders(<CommitmentsScreen />);
    expect(
      await screen.findByRole('heading', { name: 'Nenhum compromisso fixo' }),
    ).toBeInTheDocument();
  });

  it('shows an error state and retries', async () => {
    let fail = true;
    server.use(
      http.get(`${API}/fixed-commitments`, () =>
        fail
          ? HttpResponse.json(
              { statusCode: 400, code: 'BAD_REQUEST', message: 'Falha ao listar' },
              { status: 400 },
            )
          : HttpResponse.json([makeCommitment()]),
      ),
    );
    renderWithProviders(<CommitmentsScreen />);
    expect(await screen.findByText('Falha ao listar')).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('heading', { name: 'Trabalho' })).toBeInTheDocument();
  });

  it('creates a commitment through the form', async () => {
    const created = makeCommitment({
      title: 'Aula de inglês',
      daysOfWeek: [2, 4],
      startTime: '19:00',
      endTime: '20:30',
      category: 'STUDY',
      color: 'purple',
    });
    let saved: Record<string, unknown> | undefined;
    let list = [] as ReturnType<typeof makeCommitment>[];
    server.use(
      http.get(`${API}/fixed-commitments`, () => HttpResponse.json(list)),
      suggestion,
      http.post(`${API}/fixed-commitments`, async ({ request }) => {
        saved = (await request.json()) as Record<string, unknown>;
        list = [created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    renderWithProviders(<CommitmentsScreen />);
    await screen.findByRole('heading', { name: 'Nenhum compromisso fixo' });
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Novo compromisso' })[0] as HTMLElement,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Novo compromisso' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByText('Informe um título')).toBeInTheDocument();
    expect(within(dialog).getByText('Escolha ao menos um dia')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Título'), 'Aula de inglês');
    await userEvent.click(within(dialog).getByRole('button', { name: 'terça-feira' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'quinta-feira' }));
    expect(within(dialog).getByRole('button', { name: 'terça-feira' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.clear(within(dialog).getByLabelText('Início'));
    await userEvent.type(within(dialog).getByLabelText('Início'), '19:00');
    await userEvent.clear(within(dialog).getByLabelText('Fim'));
    await userEvent.type(within(dialog).getByLabelText('Fim'), '20:30');
    await userEvent.selectOptions(within(dialog).getByLabelText('Categoria'), 'STUDY');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Roxo' }));
    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: /Exige deslocamento depois/ }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(saved).toEqual({
        title: 'Aula de inglês',
        daysOfWeek: [2, 4],
        startTime: '19:00',
        endTime: '20:30',
        category: 'STUDY',
        color: 'purple',
        requiresTravel: true,
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Aula de inglês' })).toBeInTheDocument();
    expect(await screen.findByText('Compromisso criado')).toBeInTheDocument();
  });

  it('rejects an end time before the start', async () => {
    server.use(http.get(`${API}/fixed-commitments`, () => HttpResponse.json([makeCommitment()])));
    renderWithProviders(<CommitmentsScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Trabalho' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar compromisso' });
    expect(within(dialog).getByLabelText('Título')).toHaveValue('Trabalho');
    await userEvent.clear(within(dialog).getByLabelText('Fim'));
    await userEvent.type(within(dialog).getByLabelText('Fim'), '07:00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByText('O fim deve ser depois do início')).toBeInTheDocument();
  });

  it('warns about overlapping commitments in the form and in the list, without blocking', async () => {
    const etica = makeCommitment({
      title: 'Aula de Ética',
      daysOfWeek: [5],
      startTime: '16:00',
      endTime: '18:00',
    });
    const piola = makeCommitment({
      title: 'Piola',
      daysOfWeek: [5],
      startTime: '17:00',
      endTime: '19:00',
      overlapsWith: [{ id: etica.id, title: 'Aula de Ética', daysOfWeek: [5] }],
    });
    server.use(
      http.get(`${API}/fixed-commitments`, () => HttpResponse.json([etica, piola])),
      http.get(`${API}/preferences`, () => HttpResponse.json(preferences)),
    );
    renderWithProviders(<CommitmentsScreen />);
    expect(await screen.findByText(/Sobrepõe\s+Aula de Ética \(Sex\)/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Editar Piola' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar compromisso' });
    expect(await within(dialog).findByText('Sobrepõe outro compromisso')).toBeInTheDocument();
    expect(within(dialog).getByText(/Aula de Ética \(Sex\)/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Salvar' })).toBeEnabled();

    // moving it out of the way clears the warning
    await userEvent.clear(within(dialog).getByLabelText('Início'));
    await userEvent.type(within(dialog).getByLabelText('Início'), '18:00');
    await waitFor(() =>
      expect(within(dialog).queryByText('Sobrepõe outro compromisso')).not.toBeInTheDocument(),
    );
  });

  it('warns when a commitment starts before the travel time is over', async () => {
    server.use(
      http.get(`${API}/preferences`, () =>
        HttpResponse.json({ ...preferences, travelMinutes: 60 }),
      ),
      http.get(`${API}/fixed-commitments`, () =>
        HttpResponse.json([
          makeCommitment({
            title: 'Aula presencial',
            daysOfWeek: [2],
            startTime: '16:00',
            endTime: '18:00',
            requiresTravel: true,
          }),
          makeCommitment({
            title: 'Web Academy',
            daysOfWeek: [2],
            startTime: '18:15',
            endTime: '21:15',
          }),
        ]),
      ),
    );
    renderWithProviders(<CommitmentsScreen />);
    expect(await screen.findByText('Deslocamento apertado')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Ter: Web Academy começa antes do fim do deslocamento de Aula presencial \(19:00\)/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Com deslocamento')).toBeInTheDocument();
  });

  it('asks for confirmation before deleting', async () => {
    const commitment = makeCommitment();
    let deleted = false;
    server.use(
      http.get(`${API}/fixed-commitments`, () => HttpResponse.json(deleted ? [] : [commitment])),
      suggestion,
      http.delete(`${API}/fixed-commitments/${commitment.id}`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<CommitmentsScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir Trabalho' }));
    const dialog = await screen.findByRole('dialog', { name: 'Excluir compromisso?' });
    expect(deleted).toBe(false);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(deleted).toBe(true));
    expect(
      await screen.findByRole('heading', { name: 'Nenhum compromisso fixo' }),
    ).toBeInTheDocument();
  });
});
