import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { uuid } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import { API, server } from '@/test/server';
import { AI_PRIVACY_TEXT } from './ai-privacy-notice';
import { safeNext } from './api';
import { LoginScreen } from './login-screen';
import { RegisterScreen } from './register-screen';
import { UserMenu } from './user-menu';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
let search = '';
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => '/',
}));

const user = { id: uuid(1), email: 'ana@example.com', name: 'Ana', isDemo: false };
const demoUser = { ...user, email: 'demo@portfolio.test', name: 'Conta demo', isDemo: true };
const config = (registrationEnabled: boolean, demoAvailable: boolean) =>
  http.get(`${API}/auth/config`, () => HttpResponse.json({ registrationEnabled, demoAvailable }));
const apiError = (status: number, code: string, message: string) =>
  HttpResponse.json({ statusCode: status, code, message }, { status });

beforeEach(() => {
  search = '';
  router.replace.mockClear();
  router.refresh.mockClear();
});

describe('safeNext', () => {
  it('only accepts same-site paths', () => {
    expect(safeNext('/tarefas?x=1')).toBe('/tarefas?x=1');
    for (const evil of ['//evil.com', 'https://evil.com', '/\\evil.com', '', null, undefined]) {
      expect(safeNext(evil)).toBe('/');
    }
  });
});

describe('LoginScreen', () => {
  it('validates inline, in Portuguese, before calling the API', async () => {
    server.use(config(false, false));
    renderWithProviders(<LoginScreen />);
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Informe um e-mail válido')).toBeInTheDocument();
    expect(screen.getByText('Informe a senha')).toBeInTheDocument();
  });

  it('signs in, caches the user and goes where the visitor was heading', async () => {
    search = '?next=/tarefas';
    let body: unknown;
    server.use(
      config(false, false),
      http.post(`${API}/auth/login`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(user);
      }),
    );
    const { queryClient } = renderWithProviders(<LoginScreen />);
    await userEvent.type(screen.getByLabelText('E-mail'), ' Ana@Example.com ');
    await userEvent.type(screen.getByLabelText('Senha'), 'cavalo-azul-42');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/tarefas'));
    expect(body).toEqual({ email: 'ana@example.com', password: 'cavalo-azul-42' });
    expect(router.refresh).toHaveBeenCalled();
    expect(queryClient.getQueryData(['auth', 'me'])).toEqual(user);
  });

  it('never redirects off-site, whatever ?next= says', async () => {
    search = '?next=//evil.example';
    server.use(
      config(false, false),
      http.post(`${API}/auth/login`, () => HttpResponse.json(user)),
    );
    renderWithProviders(<LoginScreen />);
    await userEvent.type(screen.getByLabelText('E-mail'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'cavalo-azul-42');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  });

  it('shows the generic server message on a wrong password and stays put', async () => {
    server.use(
      config(false, false),
      http.post(`${API}/auth/login`, () =>
        apiError(401, 'UNAUTHENTICATED', 'E-mail ou senha incorretos.'),
      ),
    );
    renderWithProviders(<LoginScreen />);
    await userEvent.type(screen.getByLabelText('E-mail'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'errada');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('offers signup and the demo only when the API says they exist', async () => {
    server.use(config(false, false));
    const first = renderWithProviders(<LoginScreen />);
    await screen.findByRole('button', { name: 'Entrar' });
    await waitFor(() => expect(first.queryClient.getQueryData(['auth', 'config'])).toBeDefined());
    expect(screen.queryByRole('link', { name: 'Criar conta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entrar como demo' })).not.toBeInTheDocument();
    first.unmount();

    server.use(config(true, true));
    renderWithProviders(<LoginScreen />);
    expect(await screen.findByRole('link', { name: 'Criar conta' })).toHaveAttribute(
      'href',
      '/cadastro',
    );
    expect(await screen.findByRole('button', { name: 'Entrar como demo' })).toBeInTheDocument();
    expect(screen.getByText('Modo demo, sem IA')).toBeInTheDocument();
  });

  it('enters the demo with one click, without a password', async () => {
    server.use(
      config(false, true),
      http.post(`${API}/auth/demo`, () => HttpResponse.json(demoUser)),
    );
    const { queryClient } = renderWithProviders(<LoginScreen />);
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar como demo' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(queryClient.getQueryData<typeof demoUser>(['auth', 'me'])?.isDemo).toBe(true);
  });
});

describe('RegisterScreen', () => {
  it('shows the AI privacy notice and the password rules', async () => {
    server.use(config(true, false));
    renderWithProviders(<RegisterScreen />);
    expect(await screen.findByTestId('ai-privacy-notice')).toHaveTextContent(AI_PRIVACY_TEXT);
    expect(AI_PRIVACY_TEXT).toContain('Google (Gemini, nível gratuito)');
    expect(AI_PRIVACY_TEXT).toContain('Não escreva dados sensíveis.');
    expect(screen.getByText(/Pelo menos 10 caracteres/)).toBeInTheDocument();
  });

  it('rejects a weak password inline and creates the account with a strong one', async () => {
    let body: unknown;
    server.use(
      config(true, false),
      http.post(`${API}/auth/register`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(user, { status: 201 });
      }),
    );
    renderWithProviders(<RegisterScreen />);
    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'curta');
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText(/Use pelo menos 10 caracteres/)).toBeInTheDocument();
    expect(body).toBeUndefined();

    await userEvent.clear(screen.getByLabelText('Senha'));
    await userEvent.type(screen.getByLabelText('Senha'), 'cavalo-azul-42');
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(body).toMatchObject({ email: 'ana@example.com', password: 'cavalo-azul-42' });
  });

  it('is not there when signup is closed: it sends the visitor to the login', async () => {
    server.use(config(false, false));
    renderWithProviders(<RegisterScreen />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ai-privacy-notice')).not.toBeInTheDocument();
  });
});

describe('UserMenu', () => {
  it('shows who is signed in and signs out', async () => {
    let loggedOut = false;
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json(user)),
      http.post(`${API}/auth/logout`, () => {
        loggedOut = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { queryClient } = renderWithProviders(<UserMenu />);
    const clear = vi.spyOn(queryClient, 'clear');
    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.queryByText('Modo demo, sem IA')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sair da conta' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
    expect(loggedOut).toBe(true);
    // the cache is wiped: nothing of this user stays in the browser
    expect(clear).toHaveBeenCalled();
  });

  it('shows the demo seal instead of a name for the demo account', async () => {
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.json(demoUser)));
    renderWithProviders(<UserMenu />);
    expect(await screen.findByText('Modo demo, sem IA')).toBeInTheDocument();
    expect(screen.queryByText('Conta demo')).not.toBeInTheDocument();
  });

  it('signs out locally even if the server call fails', async () => {
    server.use(
      http.get(`${API}/auth/me`, () => HttpResponse.json(user)),
      http.post(`${API}/auth/logout`, () => HttpResponse.error()),
    );
    renderWithProviders(<UserMenu />);
    await userEvent.click(await screen.findByRole('button', { name: 'Sair da conta' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
    expect(within(document.body).queryByText('Ana')).toBeInTheDocument();
  });
});
