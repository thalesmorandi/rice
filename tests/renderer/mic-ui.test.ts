// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { bootRenderer } from '../helpers/boot-renderer';

const g = globalThis as any;
const MIC = { dir: '/R/a', name: 'Microphone (FIFINE K669 Microphone)', short: 'FIFINE K669 Microphone', isDefault: true, chosen: false, switched: false };

function boot(extra: Record<string, unknown> = {}, platform = 'win32', lang: 'pt-BR' | 'en' = 'pt-BR') {
  return bootRenderer({
    platform,
    uiLanguage: lang,
    getSettings: async () => ({ root: '/R', rootDisplay: '~/R', onboardingDone: true, transcriptionLanguage: 'pt', uiLanguage: lang, keepAudio: true, micDevice: null, asrModel: 'auto' }),
    aiStatus: async () => ({ active: 'claude-sub', models: {}, providers: {} }),
    ...extra,
  }, [{ dir: '/R/a', title: 'Reunião', startedAt: new Date().toISOString(), state: 'done', notesStatus: 'done' }]);
}
const chip = () => g.document.getElementById('mic-chip') as any;
const openAudio = async () => {
  g.document.getElementById('settings-link').click();
  await vi.waitFor(() => expect(g.document.querySelector('.settings-page .setting-section')).not.toBeNull());
  [...g.document.querySelectorAll('.set-nav-item')].find((b: any) => /^(Áudio|Audio)$/.test(b.textContent.trim())).click();
};

it('chip do microfone: aparece com o nome curto e o title com o nome completo e "padrão do Windows"; sem informação, não aparece', async () => {
  const t = boot();
  expect(chip().hidden).toBe(true); // nada antes de a gravação informar
  t.handlers['session:mic']!(MIC);
  expect(chip().hidden).toBe(false);
  expect(chip().textContent).toBe('FIFINE K669 Microphone');
  expect(chip().title).toBe('Microphone (FIFINE K669 Microphone) · padrão do Windows');
  expect(chip().querySelector('.icon, svg')).not.toBeNull();
  t.handlers['session:mic']!(null);
  expect(chip().hidden).toBe(true);
  t.handlers['session:mic']!({ name: '' });
  expect(chip().hidden).toBe(true);
});

it('chip no Mac: "padrão do sistema"; escolhido: "escolhido"; em inglês', async () => {
  const mac = boot({}, 'darwin');
  mac.handlers['session:mic']!({ ...MIC, name: 'MacBook Pro Microphone', short: 'MacBook Pro Microphone' });
  expect(chip().title).toBe('MacBook Pro Microphone · padrão do sistema');
  mac.handlers['session:mic']!({ ...MIC, chosen: true, isDefault: false });
  expect(chip().title).toContain('escolhido');
  const en = boot({}, 'win32', 'en');
  en.handlers['session:mic']!(MIC);
  expect(chip().title).toBe('Microphone (FIFINE K669 Microphone) · Windows default');
});

it('trocar o microfone no meio avisa "Microfone trocado para X"; repetir o mesmo não avisa', async () => {
  const t = boot();
  t.handlers['session:mic']!(MIC);
  expect(g.document.querySelectorAll('#toast-stack .toast').length).toBe(0);
  t.handlers['session:mic']!({ ...MIC, name: 'Realtek Audio', short: 'Realtek Audio', switched: true });
  const toast = g.document.querySelector('#toast-stack .toast');
  expect(toast.textContent).toBe('Microfone trocado para Realtek Audio');
  expect(chip().textContent).toBe('Realtek Audio');
});

it('ao recarregar a tela com a gravação em andamento, o chip volta (micCurrent); quando a gravação acaba, some', async () => {
  const t = boot({ micCurrent: vi.fn(async () => MIC), sessionState: async () => ({ state: 'recording', dir: '/R/a', paused: false }) });
  await vi.waitFor(() => expect(chip().hidden).toBe(false));
  t.handlers['session:state']!('idle');
  expect(chip().hidden).toBe(true);
});

it('Configurações › Áudio (Windows): seletor "Padrão do Windows (recomendado)" + as entradas; escolher grava; explicação do Teams/Zoom', async () => {
  const setMic = vi.fn(async () => ({ ok: true, micDevice: 'b' }));
  boot({ listMicInputs: async () => ({ supported: true, inputs: [{ id: 'a', name: 'FIFINE K669', isDefault: true }, { id: 'b', name: 'Webcam C920', isDefault: false }] }), setMic });
  await openAudio();
  const section = () => g.document.querySelector('[data-section=audio]') as any;
  await vi.waitFor(() => expect(section().textContent).toContain('Use o mesmo microfone que você escolheu no Teams ou no Zoom'));
  expect(section().querySelector('select')).toBeNull(); // nada de <select> nativo
  const btn = [...section().querySelectorAll('.menu-select-btn')].find((b: any) => b.getAttribute('aria-label') === 'Microfone');
  expect(btn.textContent).toContain('Padrão do Windows (recomendado)');
  btn.click();
  const items = [...g.document.querySelectorAll('.menu-popover [role=option], .menu-popover .menu-item, .menu-popover button')].map((i: any) => i.textContent.trim());
  expect(items.join('|')).toContain('FIFINE K669 (padrão)');
  expect(items.join('|')).toContain('Webcam C920');
  [...g.document.querySelectorAll('.menu-popover [role=option], .menu-popover .menu-item, .menu-popover button')].find((i: any) => i.textContent.includes('Webcam C920')).click();
  await vi.waitFor(() => expect(setMic).toHaveBeenCalledWith('b'));
  await vi.waitFor(() => expect(section().textContent).toContain('Vale na próxima vez que o Rice abrir o microfone'.replace('Vale', 'Vale')));
});

it('helper sem a opção de listar: só o padrão, com a explicação; microfone salvo que sumiu aparece como "(não está conectado)"', async () => {
  boot({ getSettings: async () => ({ root: '/R', rootDisplay: '~/R', onboardingDone: true, transcriptionLanguage: 'pt', uiLanguage: 'pt-BR', keepAudio: true, micDevice: 'sumiu', asrModel: 'auto' }), listMicInputs: async () => ({ supported: false, inputs: [] }), setMic: async () => ({ ok: true }) });
  await openAudio();
  const section = g.document.querySelector('[data-section=audio]') as any;
  await vi.waitFor(() => expect(section.textContent).toContain('ainda não consegue listar os microfones'));
  const btn = [...section.querySelectorAll('.menu-select-btn')].find((b: any) => b.getAttribute('aria-label') === 'Microfone');
  expect(btn.textContent).toContain('Microfone escolhido (não está conectado)');
});

it('Mac: "Escolher o microfone automaticamente" (ligado por padrão) e o microfone fixo opcional', async () => {
  const setMicAuto = vi.fn(async () => ({ ok: true }));
  const setMic = vi.fn(async () => ({ ok: true }));
  boot({ setMicAuto, setMic, listMicInputs: async () => ({ supported: true, inputs: [{ id: 'u1', name: 'MacBook Pro Microphone', isDefault: true, state: 'active' }, { id: 'u2', name: 'fifine Microphone', isDefault: false, state: 'active' }] }) }, 'darwin');
  await openAudio();
  const section = g.document.querySelector('[data-section=audio]') as any;
  const auto = section.querySelector('#mic-auto') as any;
  expect(auto.checked).toBe(true);
  expect(section.textContent).toContain('Escolher o microfone automaticamente');
  expect(section.textContent).toContain('o microfone que o app da reunião está usando');
  auto.checked = false;
  auto.dispatchEvent(new g.window.Event('change'));
  expect(setMicAuto).toHaveBeenCalledWith(false);
  const fixed = [...section.querySelectorAll('.menu-select-btn')].find((b: any) => b.getAttribute('aria-label') === 'Microfone fixo') as any;
  expect(fixed).toBeTruthy();
  expect(fixed.textContent).toContain('Nenhum: detectar sozinho');
});

it('Mac: automático desligado nas configurações aparece desligado', async () => {
  boot({ getSettings: async () => ({ root: '/R', rootDisplay: '~/R', onboardingDone: true, transcriptionLanguage: 'pt', uiLanguage: 'pt-BR', keepAudio: true, micAuto: false }) }, 'darwin');
  await openAudio();
  expect((g.document.querySelector('#mic-auto') as any).checked).toBe(false);
});

it('modelo de transcrição: mostra o em uso e o motivo (leve por pouca memória), a nota do modo leve e deixa forçar', async () => {
  const setAsrModel = vi.fn(async (choice: string) => ({ choice, model: 'full', tier: 'large', ramGb: 8, cores: 4, threads: 2, reason: 'forced-full', light: false }));
  boot({ audioProfile: async () => ({ choice: 'auto', model: 'light', tier: 'small', ramGb: 8, cores: 4, threads: 2, reason: 'low-ram', light: true }), setAsrModel });
  await openAudio();
  const section = g.document.querySelector('[data-section=audio]') as any;
  await vi.waitFor(() => expect(section.textContent).toContain('Em uso: modelo leve (small; 8 GB de RAM, 4 núcleos)'));
  expect(section.querySelector('.ai-note-line:not([hidden])').textContent).toContain('Modo leve');
  const btn = [...section.querySelectorAll('.menu-select-btn')].find((b: any) => b.getAttribute('aria-label') === 'Modelo de transcrição');
  btn.click();
  [...g.document.querySelectorAll('.menu-popover button, .menu-popover [role=option], .menu-popover .menu-item')].find((i: any) => i.textContent.trim() === 'Completo').click();
  await vi.waitFor(() => expect(setAsrModel).toHaveBeenCalledWith('full'));
  await vi.waitFor(() => expect(section.textContent).toContain('Em uso: modelo completo (escolhido por você)'));
});

it('GPU (Windows): ligada por padrão, mostra onde a última gravação foi transcrita e confirma cada troca (sem reiniciar o Rice)', async () => {
  const device = { gpu: true, backend: 'Vulkan', name: 'AMD Radeon RX 9060 XT', fellBackToCpu: false };
  let recording = false;
  const setAsrGpu = vi.fn(async (on: boolean) => ({ ok: true, appliedNow: !recording, asrGpu: on }));
  boot({ audioProfile: async () => ({ choice: 'auto', model: 'full', tier: 'large', ramGb: 16, cores: 8, threads: 6, reason: 'enough-ram', light: false, device }), setAsrGpu });
  await openAudio();
  const section = g.document.querySelector('[data-section=audio]') as any;
  const sw = section.querySelector('#asr-gpu');
  expect(sw.checked).toBe(true);
  expect(section.textContent).toContain('Usar a placa de vídeo (GPU)');
  await vi.waitFor(() => expect(section.textContent).toContain('Última gravação: transcrita na placa de vídeo (AMD Radeon RX 9060 XT).'));
  const feedback = () => section.querySelector('.audio-gpu-feedback');
  expect(feedback().hidden).toBe(true);
  sw.checked = false;
  sw.dispatchEvent(new g.window.Event('change'));
  await vi.waitFor(() => expect(setAsrGpu).toHaveBeenCalledWith(false));
  await vi.waitFor(() => expect(feedback().textContent).toBe('Salvo: a partir da próxima gravação, o Rice usa só a CPU. Não precisa reiniciar o Rice.'));
  expect(feedback().hidden).toBe(false);
  recording = true; // gravando: a de agora continua como começou
  sw.checked = true;
  sw.dispatchEvent(new g.window.Event('change'));
  await vi.waitFor(() => expect(feedback().textContent).toBe('Salvo. A gravação de agora continua como começou; a próxima já usa a nova escolha.'));
});

it('GPU (Windows): sem gravação ainda, e quando a placa falhou ao iniciar e o Rice voltou para a CPU', async () => {
  boot({ setAsrGpu: vi.fn(), audioProfile: async () => ({ choice: 'auto', model: 'full', tier: 'large', ramGb: 16, cores: 8, threads: 6, reason: 'enough-ram', light: false, device: null }) });
  await openAudio();
  await vi.waitFor(() => expect(g.document.querySelector('[data-section=audio] .audio-gpu-last').textContent).toBe('Ainda sem gravação desde que o Rice abriu: depois da primeira, aparece aqui onde ela foi transcrita.'));
  const text = g.window.RiceAudioSettings.deviceText;
  expect(text({ gpu: false, fellBackToCpu: true })).toBe('Última gravação: transcrita na CPU, porque a placa de vídeo falhou ao iniciar.');
  expect(text({ gpu: false, fellBackToCpu: false })).toBe('Última gravação: transcrita só na CPU.');
  expect(text({ gpu: true, backend: 'Vulkan', fellBackToCpu: false })).toBe('Última gravação: transcrita na placa de vídeo (Vulkan).');
});

it('GPU (Windows): se não salvou, a chave volta como estava e não promete nada', async () => {
  const setAsrGpu = vi.fn(async () => ({ ok: false }));
  boot({ setAsrGpu });
  await openAudio();
  const section = g.document.querySelector('[data-section=audio]') as any;
  const sw = section.querySelector('#asr-gpu');
  sw.checked = false;
  sw.dispatchEvent(new g.window.Event('change'));
  await vi.waitFor(() => expect(sw.checked).toBe(true));
  expect(section.querySelector('.audio-gpu-feedback').hidden).toBe(true);
});

it('GPU no Mac: sem a chave (o Mac usa sempre o Metal)', async () => {
  boot({ setAsrGpu: vi.fn() }, 'darwin');
  await openAudio();
  expect(g.document.querySelector('[data-section=audio]')).not.toBeNull();
  expect(g.document.querySelector('[data-section=audio] #asr-gpu')).toBeNull();
});

it('detalhe da reunião mostra o microfone capturado', async () => {
  const t = boot({ readMeeting: async () => ({ meta: { dir: '/R/a', title: 'Reunião', startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), state: 'done', notesStatus: 'done', gaps: [], micName: 'FIFINE K669' }, transcript: '', annotations: '', notes: '', chat: [] }) });
  await vi.waitFor(() => expect(g.document.querySelector('.meeting')).not.toBeNull());
  g.document.querySelector('.meeting').click();
  await vi.waitFor(() => expect(g.document.querySelector('.page-meta')?.textContent).toContain('Microfone: FIFINE K669'));
  void t;
});

it('Mac: o modelo aparece só como "Em uso" (sem seletor) porque o Mac ignora o modo', async () => {
  boot({ audioProfile: async () => ({ choice: 'auto', model: 'full', tier: 'large', ramGb: 16, cores: 10, threads: 6, reason: 'mac', light: false }) }, 'darwin');
  await openAudio();
  const section = g.document.querySelector('[data-section=audio]') as any;
  await vi.waitFor(() => expect(section.textContent).toContain('no Mac o Rice usa sempre o modelo grande'));
  expect([...section.querySelectorAll('.menu-select-btn')].some((b: any) => b.getAttribute('aria-label') === 'Modelo de transcrição')).toBe(false);
});

const MAC_API = (over: Record<string, unknown> = {}) => ({
  micInputs: vi.fn(async () => ({ inputs: [{ id: 'u1', name: 'MacBook Pro Microphone', short: 'MacBook Pro Microphone', isDefault: true }, { id: 'u2', name: 'AirPods de Ana', short: 'AirPods de Ana', isDefault: false }], currentId: 'u2' })),
  micSwitch: vi.fn(async () => ({ ok: true })),
  micMuteIgnore: vi.fn(async () => ({ ok: true })),
  ...over,
});
const openChipMenu = async () => {
  chip().click();
  await vi.waitFor(() => expect(g.document.querySelectorAll('.menu-popover .menu-item').length).toBeGreaterThan(0));
  return [...g.document.querySelectorAll('.menu-popover .menu-item')] as any[];
};

it('Mac: chip "AirPods de Ana · detectado"; clique abre o menu (Padrão do macOS, entradas, a atual marcada) e trocar chama o main', async () => {
  const api = MAC_API();
  const t = boot(api, 'darwin');
  t.handlers['session:mic']!({ ...MIC, name: 'AirPods de Ana', short: 'AirPods de Ana', isDefault: false, chosen: false, detected: true, id: 'u2' });
  expect(chip().textContent).toContain('AirPods de Ana');
  expect(chip().querySelector('.mic-chip-tag').textContent).toBe('detectado');
  expect(chip().getAttribute('role')).toBe('button');
  const items = await openChipMenu();
  expect(items.map((i) => i.textContent.trim())).toEqual(['Padrão do macOS', 'MacBook Pro Microphone', 'AirPods de Ana']);
  expect(items.map((i) => i.getAttribute('aria-checked') ?? i.getAttribute('aria-current') ?? i.className.includes('checked'))).toBeTruthy();
  items[1].click();
  await vi.waitFor(() => expect(api.micSwitch).toHaveBeenCalledWith('u1'));
});

it('Mac: "Padrão do macOS" troca com id vazio; escolhido manualmente não mostra "detectado"', async () => {
  const api = MAC_API();
  const t = boot(api, 'darwin');
  t.handlers['session:mic']!({ ...MIC, name: 'AirPods de Ana', short: 'AirPods de Ana', isDefault: false, chosen: true, detected: false });
  expect(chip().querySelector('.mic-chip-tag')).toBeNull();
  const items = await openChipMenu();
  items[0].click();
  await vi.waitFor(() => expect(api.micSwitch).toHaveBeenCalledWith(''));
});

it('Windows: o chip continua só informativo (sem menu, sem "detectado")', async () => {
  const t = boot();
  t.handlers['session:mic']!(MIC);
  expect(chip().getAttribute('role')).toBe('status');
  chip().click();
  expect(g.document.querySelector('.menu-popover')).toBeNull();
});

it('Mac: aviso "Seu microfone parece mudo. Trocar para X?" com Trocar e Ignorar; some ao agir; nova troca reabre', async () => {
  const api = MAC_API();
  const t = boot(api, 'darwin', 'pt-BR');
  t.handlers['session:mic']!({ ...MIC, isDefault: true });
  t.handlers['session:mic-mute']!({ id: 'u2', name: 'AirPods de Ana', short: 'AirPods de Ana' });
  const toast = () => g.document.querySelector('.mic-mute-toast') as any;
  expect(toast().textContent).toContain('Seu microfone parece mudo. Trocar para AirPods de Ana?');
  const [swap, ignore] = [...toast().querySelectorAll('button')] as any[];
  expect([swap.textContent, ignore.textContent]).toEqual(['Trocar', 'Ignorar']);
  expect(swap.className).not.toContain('ghost'); // Trocar é o primário
  expect(ignore.className).toContain('ghost'); // Ignorar é o secundário (contorno)
  ignore.click();
  expect(toast()).toBeNull();
  expect(api.micMuteIgnore).toHaveBeenCalledTimes(1);
  t.handlers['session:mic-mute']!({ id: 'u2', name: 'AirPods de Ana', short: 'AirPods de Ana' }); // (o main só manda de novo depois de uma troca)
  toast().querySelectorAll('button')[0].click();
  await vi.waitFor(() => expect(api.micSwitch).toHaveBeenCalledWith('u2'));
  expect(toast()).toBeNull();
  t.handlers['session:mic-mute']!(null);
  expect(toast()).toBeNull();
});

it('Mac: o aviso de mudo some quando a gravação termina e vem em inglês', async () => {
  const t = boot(MAC_API(), 'darwin', 'en');
  t.handlers['session:mic-mute']!({ id: 'u2', name: 'AirPods', short: 'AirPods' });
  expect((g.document.querySelector('.mic-mute-toast') as any).textContent).toContain('Your microphone seems muted. Switch to AirPods?');
  t.handlers['session:mic']!(null);
  expect(g.document.querySelector('.mic-mute-toast')).toBeNull();
});
