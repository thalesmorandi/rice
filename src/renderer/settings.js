// Tela "Configurações": idioma, pasta das reuniões, IA e áudio. Só createElement/textContent.
(function () {
  const t = (key, vars) => window.RiceI18n.t(key, vars);

  function el(tag, props, children) {
    const node = Object.assign(document.createElement(tag), props);
    for (const child of children || []) node.append(child);
    return node;
  }

  /** Botão do padrão do app: 32px, ghost (borda de 1px) ou primário. */
  function button(text, onclick, kind) {
    const b = el('button', { type: 'button', textContent: text, className: `btn ${kind || 'ghost'}` }, []);
    b.onclick = onclick;
    return b;
  }

  /** Caminho longo cortado no meio ("~/Documents/…/Reuniões"); o completo vai no tooltip. */
  function middle(text, max) {
    if (text.length <= max) return text;
    const head = Math.ceil((max - 1) * 0.4);
    return `${text.slice(0, head)}…${text.slice(text.length - (max - 1 - head))}`;
  }

  /** Interruptor do app. É um checkbox de verdade (`checked`, `onchange`), desenhado como switch. */
  function toggle(id, checked, label) {
    const input = el('input', { type: 'checkbox', id, checked: Boolean(checked), className: 'switch' }, []);
    input.setAttribute('role', 'switch');
    input.setAttribute('aria-label', label);
    return input;
  }

  /** Linha de configuração: rótulo (14px) e explicação curta (12px) à esquerda; controle à direita, centralizado na vertical. */
  function row(label, help, control) {
    const inline = control.classList && control.classList.contains('switch'); // interruptor é pequeno: fica ao lado do rótulo mesmo em largura estreita
    const text = el('div', { className: 'set-text' }, [el('div', { className: 'set-label', textContent: label }, []), ...(help ? [el('p', { className: 'set-help', textContent: help }, [])] : [])]);
    return el('div', { className: 'set-row' + (inline ? ' inline' : '') }, [text, el('div', { className: 'set-control' }, [control])]);
  }

  /** Seção: título (20px 600 no painel de seções), descrição opcional (13px, ~60ch) e o conteúdo. Todas seguem este esqueleto. */
  function section(title, description, children, id) {
    const node = el('section', { className: 'setting-section', id: `set-${id}` }, [
      el('h2', { textContent: title }, []),
      ...(description ? [el('p', { className: 'set-desc', textContent: description }, [])] : []),
      ...children,
    ]);
    node.dataset.section = id;
    return node;
  }

  /** Lista de seções do menu lateral (Ajustes do macOS): grupo, ícone de linha e chave i18n do nome. */
  const NAV = [
    { group: 'settings.group.general', items: [['language', 'globe', 'settings.language'], ['audio', 'mic', 'settings.audio'], ['folder', 'folder', 'settings.folder'], ['updates', 'download', 'settings.updates'], ['shortcuts', 'keyboard', 'settings.shortcuts'], ['startup', 'play', 'settings.startup']] }, // 'startup' só existe no Windows
    { group: 'settings.group.ai', items: [['ai', 'sparkles', 'settings.ai'], ['tools', 'plug', 'settings.nav.tools']] },
    { group: 'settings.group.meetings', items: [['calendar', 'calendar', 'settings.calendar'], ['vocabulary', 'file-text', 'settings.vocabulary'], ['speakers', 'users', 'settings.speakers'], ['screenshots', 'image', 'settings.screenshots'], ['memory', 'history', 'settings.memory'], ['followups', 'check-circle', 'settings.followups']] },
    { group: null, items: [['privacy', 'shield', 'settings.nav.privacy']] },
  ];
  const IDS = NAV.flatMap((g) => g.items.map((i) => i[0]));
  const SECTION_KEY = 'rice.settingsSection';
  const remembered = () => {
    try {
      return localStorage.getItem(SECTION_KEY);
    } catch {
      return null; // sem armazenamento: a seção só não fica lembrada
    }
  };
  const remember = (id) => {
    try {
      localStorage.setItem(SECTION_KEY, id);
    } catch {
      // sem armazenamento: nada a fazer
    }
  };

  /** `ctx`: { section?, focus?, onOpenAi() } — `section` (ou `focus`) escolhe a seção aberta; senão vale a lembrada; senão Idioma. */
  async function render(container, ctx) {
    const rice = window.rice;
    if (!container.firstChild) container.replaceChildren(el('h1', { className: 'page-title static', textContent: t('settings.title') }, [])); // esqueleto síncrono: o título já está na tela
    // a tela aparece já com as configurações; o provedor ativo (que pode envolver detectar CLIs) chega depois, sem travar nada
    const settings = await rice.getSettings();
    const again = () => render(container, { ...ctx, section: undefined, focus: undefined }); // a troca de idioma mantém a seção atual
    const keep = toggle('keep-audio', settings.keepAudio !== false, t('settings.audio.keep'));
    keep.onchange = () => rice.setKeepAudio(keep.checked);
    const identify = toggle('identify-speakers', settings.identifySpeakers === true, t('settings.speakers.label'));
    identify.onchange = () => rice.setIdentifySpeakers(identify.checked);
    // Modo 100% local (Privacidade): só liga com o provedor Modelo local ativo; o main bloqueia tudo o que usa a rede
    const localMode = toggle('local-mode', settings.fullyLocal === true, t('settings.localmode.label'));
    const localNote = el('p', { className: 'set-help warn', hidden: true }, []);
    const localGo = button(t('settings.localmode.switch'), () => show('ai'), 'ghost');
    localGo.hidden = true;
    localMode.onchange = async () => {
      const result = await rice.setLocalMode(localMode.checked);
      if (!result.ok) {
        localMode.checked = false;
        localNote.textContent = result.message;
        localNote.hidden = false;
        localGo.hidden = !result.needsProvider;
        return;
      }
      window.dispatchEvent(new CustomEvent('rice:local-mode', { detail: { fullyLocal: result.fullyLocal } }));
      await again();
    };
    // aviso de consentimento ao gravar: ligado por padrão; o texto é editável (vazio = o padrão, no idioma de cada reunião)
    const consent = toggle('consent-remind', settings.consentRemind !== false, t('settings.consent.label'));
    const consentText = el('textarea', { id: 'consent-text', rows: 3, maxLength: 600, placeholder: t('consent.default-text'), value: settings.consentText || '', className: 'consent-edit' }, []);
    consentText.setAttribute('aria-label', t('settings.consent.text'));
    let consentTimer = null;
    const saveConsent = () => {
      clearTimeout(consentTimer);
      consentTimer = setTimeout(() => rice.setConsent(consent.checked, consentText.value), 500);
    };
    consent.onchange = () => rice.setConsent(consent.checked, consentText.value);
    consentText.addEventListener('input', saveConsent);
    const consentReset = button(t('settings.consent.reset'), () => {
      consentText.value = '';
      rice.setConsent(consent.checked, '');
    }, 'ghost');
    // ocultar dados pessoais ao enviar para a IA e a guarda padrão (as pastas podem ter a própria)
    const redact = toggle('redact-pii', settings.redactPii === true, t('settings.redact.label'));
    let retentionDefault = { ...(settings.retentionDefault || {}) };
    const saveRetention = () => rice.setPrivacy({ retentionDefault });
    redact.onchange = () => rice.setPrivacy({ redactPii: redact.checked });
    const retentionAudio = window.RiceMenuSelect.create({ items: window.RiceRetention.items('audio', false), value: window.RiceRetention.valueOf(retentionDefault.audioDays ?? 0), ariaLabel: t('retention.audio'), onChoose: (v) => { retentionDefault = { ...retentionDefault, audioDays: Number(v) }; saveRetention(); } });
    const retentionMeeting = window.RiceMenuSelect.create({ items: window.RiceRetention.items('meeting', false), value: window.RiceRetention.valueOf(retentionDefault.meetingMonths ?? 0), ariaLabel: t('retention.meeting'), onChoose: (v) => { retentionDefault = { ...retentionDefault, meetingMonths: Number(v) }; saveRetention(); } });
    const localExplain = el('p', { className: 'set-desc', textContent: t('settings.localmode.explain') }, []);
    // atalho global de gravar e parar: o estado (registrado, sem atalho ou em conflito com outro app) vem do main
    const shortcutBox = el('div', { className: 'shortcut-box' }, []);
    if (rice.shortcutStatus) {
      rice.shortcutStatus().then((initial) => {
        const field = window.RiceShortcut.create({ rice, initial });
        shortcutBox.replaceChildren(row(t('settings.shortcut.label'), t('settings.shortcut.help'), field.root));
      }).catch(() => {});
    }
    // atualização: opção "Procurar atualizações" (ligada por padrão) e, com versão nova, o aviso com o botão
    const checkUpdates = toggle('check-updates', settings.checkUpdates !== false, t('settings.updates.label'));
    // página de Atualizações (Mac e Windows): cartão de versão com selo de estado e UMA ação, a opção automática e os detalhes técnicos
    const updatePage = window.RiceUpdatePage.create({
      checkNow: () => (rice.updateCheckNow ? rice.updateCheckNow() : Promise.reject(new Error('sem suporte'))),
      lastCheck: rice.updateLastCheck ? () => rice.updateLastCheck() : null,
      updateStatus: rice.updateStatus ? () => rice.updateStatus() : null,
      about: rice.updateAbout ? () => rice.updateAbout() : null,
      winStatus: rice.winUpdateStatus ? () => rice.winUpdateStatus() : null,
      run: () => (rice.updateRun ? rice.updateRun() : undefined),
      download: rice.winUpdateDownload ? () => rice.winUpdateDownload() : null,
      install: rice.winUpdateInstall ? () => rice.winUpdateInstall() : null,
    }, { platform: rice.platform, local: Boolean(settings.fullyLocal), autoRow: row(t('settings.updates.label'), t('settings.updates.help'), checkUpdates), autoToggle: checkUpdates });
    if (settings.fullyLocal) {
      checkUpdates.disabled = true; // Modo 100% local: nenhuma consulta à internet
      checkUpdates.title = t('local.mode.blocked.updates');
    }
    checkUpdates.onchange = async () => {
      const status = await rice.setCheckUpdates(checkUpdates.checked);
      window.dispatchEvent(new CustomEvent('rice:update-changed', { detail: status }));
    };
    // opt-in "por sua conta e risco": ligar pede confirmação destrutiva; o estado do provedor ativo aparece como dica
    const toolsHint = el('p', { className: 'set-desc', hidden: true }, []);
    const showHint = ({ hint }) => {
      toolsHint.textContent = hint;
      toolsHint.hidden = !hint;
    };
    const chatTools = window.RiceChatTools.create({ settings, confirm: ctx.confirm, onChange: ctx.onChatToolsChange, onStatus: showHint });
    const tools = chatTools.input;
    chatTools.status().then((st) => showHint(settings.fullyLocal ? { hint: t('local.mode.blocked.tools') } : st));
    if (settings.fullyLocal) tools.disabled = true; // Modo 100% local: sem ferramentas nem MCPs (o motivo aparece embaixo)
    let saveTimer = null;
    const vocabulary = window.RiceChips.create({
      value: window.RiceChips.parse(settings.vocabulary || '', 60),
      placeholder: t('settings.vocabulary.placeholder'),
      removeLabel: (term) => t('settings.vocabulary.remove', { term }),
      onChange: () => saveVocabulary(),
    });
    const attendees = toggle('vocab-attendees', settings.vocabularyAttendees !== false, t('settings.vocabulary.attendees'));
    const saveVocabulary = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => rice.setVocabulary(vocabulary.items().join('\n'), attendees.checked), 600);
    };
    attendees.onchange = saveVocabulary;
    // a lista de IAs carrega sozinha (detectar CLIs pode demorar) e a tela não espera por ela
    const aiBox = el('div', { className: 'ai-box' }, [el('p', { className: 'set-help', textContent: rice.aiStatus ? t('settings.ai.checking') : '' }, [])]);
    // modelo leve: etapas simples (resumos parciais, sugestões) num modelo menor do mesmo provedor
    const lightBox = el('div', { className: 'light-box' }, []);
    const loadLight = async (ai) => {
      if (!rice.setAiLight) return;
      const cat = await rice.aiModelCatalog(ai.active).then((r) => (r && r.ok ? r.models : [])).catch(() => []);
      const lightName = ai.lightModel && ((cat.find((m) => m.id === ai.lightModel) || {}).label || ai.lightModel); // nome amigável do catálogo ("Haiku 5.5"), como nas outras opções
      const auto = lightName ? t('settings.light.auto-model', { model: lightName }) : t('settings.light.auto'); // curto: o rótulo não quebra em duas linhas
      const items = [{ value: 'auto', label: auto }, { value: 'same', label: t('settings.light.same') }, ...cat.filter((m) => m.id).map((m) => ({ value: m.id, label: m.label || m.id }))];
      const picker = window.RiceMenuSelect.create({
        items,
        value: items.some((i) => i.value === ai.light) ? ai.light : 'auto',
        ariaLabel: t('settings.light.label'),
        onChoose: async (value) => {
          await rice.setAiLight(value);
          window.dispatchEvent(new CustomEvent('rice:ai-changed'));
        },
      });
      const select = picker.root;
      lightBox.replaceChildren(row(t('settings.light.label'), t('settings.light.help'), select));
    };
    // limite de ciclos da War room por reunião (0 = sem limite): menu padrão; "Sem limite" mostra um aviso discreto
    const cycleValue = settings.warroomMaxCycles ?? 120;
    const cycleWarn = el('p', { className: 'set-help', textContent: t('settings.cycles.none-warn'), hidden: cycleValue !== 0 }, []);
    const cycles = window.RiceMenuSelect.create({
      items: [30, 60, 120, 300, 0].map((n) => ({ value: n, label: n === 0 ? t('settings.cycles.none') : t('settings.cycles.option', { n }) })),
      value: cycleValue,
      ariaLabel: t('settings.cycles.label'),
      onChoose: (n) => {
        rice.setWarRoomMaxCycles(Number(n));
        cycleWarn.hidden = Number(n) !== 0;
      },
    });
    const loadAi = async () => {
      if (!rice.aiStatus) return;
      try {
        const ai = await rice.aiStatus();
        if (!aiBox.isConnected) return;
        loadLight(ai);
        aiBox.replaceChildren(window.RiceAiProviders.render({
          status: ai,
          onChange: async () => {
            window.dispatchEvent(new CustomEvent('rice:ai-changed'));
            await loadAi();
          },
        }));
      } catch {
        aiBox.replaceChildren(); // sem o status, a seção só não mostra a lista
      }
    };
    // agenda: o MESMO componente do passo "Agenda" do guia (Calendário do macOS recomendado + Google avançado)
    // lembretes do macOS no Início: ligado por padrão quando o macOS permitir
    const remBox = el('div', { className: 'rem-setting' }, []);
    const loadReminders = async () => {
      if (!rice.remindersStatus) return;
      const st = await rice.remindersStatus().catch(() => null);
      if (!st || !remBox.isConnected || st.access === 'unsupported') return; // Windows: não há app de Lembretes
      const sw = toggle('show-reminders', st.enabled !== false, t('settings.reminders.label'));
      sw.onchange = async () => {
        await rice.remindersSetEnabled(sw.checked);
        if (sw.checked && st.access === 'notDetermined') await rice.remindersRequest();
      };
      const help = st.access === 'denied' ? t('settings.reminders.denied') : t('settings.reminders.help');
      remBox.replaceChildren(row(t('settings.reminders.label'), help, sw));
    };
    // capturas de tela: desligadas por padrão; ligar pede confirmação em linguagem simples (a IA vê as imagens)
    const shots = toggle('screenshots', settings.screenshots === true, t('settings.screenshots.label'));
    const shotsNote = el('p', { className: 'set-help', hidden: true }, []);
    const shotsOpen = button(t('settings.screenshots.open'), () => rice.screenshotsOpenPrivacy(), 'ghost');
    shotsOpen.hidden = true;
    const showShotsEnv = (env) => {
      if (!env || !shots.checked) {
        shotsNote.hidden = true;
        shotsOpen.hidden = true;
        return;
      }
      const label = window.RiceAiProviders && env.provider ? window.RiceAiProviders.label(env.provider) : env.provider || '';
      const denied = env.permission === 'denied' || env.permission === 'not-determined';
      shotsNote.textContent = denied ? t('settings.screenshots.denied') : !env.seesImages ? t('settings.screenshots.no-images', { provider: label }) : '';
      shotsNote.hidden = !shotsNote.textContent;
      shotsOpen.hidden = !denied;
    };
    if (rice.screenshotsStatus) rice.screenshotsStatus().then(showShotsEnv).catch(() => {});
    shots.onchange = async () => {
      if (shots.checked) {
        const env = await rice.screenshotsStatus();
        if (!(await window.RiceScreenshots.confirmEnable(env))) {
          shots.checked = false;
          return;
        }
        showShotsEnv(await rice.screenshotsSetEnabled(true));
      } else {
        await rice.screenshotsSetEnabled(false);
        showShotsEnv(null);
      }
      window.dispatchEvent(new CustomEvent('rice:shots-changed'));
    };
    // memória entre reuniões e pendências
    const memoryNodes = window.RiceMemory && rice.memoryStatus ? window.RiceMemory.settingsNodes({ rice, settings, row, toggle, button, confirm: ctx.confirm, onOpen: ctx.onOpenMeeting, onOpenMemory: ctx.onOpenMemory }) : [];
    const notify = toggle('followup-notify', settings.followupNotify !== false, t('settings.followups.notify'));
    notify.onchange = () => rice.memorySetNotify && rice.memorySetNotify(notify.checked);
    const calBox = el('div', { className: 'cal-box' }, []);
    const loadCalendar = async () => {
      if (!rice.eventKitStatus) return;
      const [google, eventKit, ics] = await Promise.all([
        rice.googleStatus ? rice.googleStatus().catch(() => ({})) : {},
        rice.eventKitStatus().catch(() => ({ access: 'unknown' })),
        rice.icsStatus ? rice.icsStatus().catch(() => ({})) : {},
      ]);
      calBox.replaceChildren(...window.RiceCalendarConnect.render({ google, eventKit, ics, onChange: loadCalendar }));
    };
    loadCalendar();
    loadReminders();
    // privacidade: as linhas estáticas aparecem na hora; a linha "Hoje: <provedor>" chega junto com o status da IA
    const privBox = el('div', { className: 'priv-list' }, window.RicePrivacy.items(null));
    const loadPrivacy = async () => {
      if (!rice.aiStatus) return;
      try {
        const ai = await rice.aiStatus();
        if (privBox.isConnected) privBox.replaceChildren(...window.RicePrivacy.items(ai));
      } catch {
        // sem o status, ficam as linhas sem o provedor de hoje
      }
    };
    loadPrivacy();
    loadAi();
    const folder = el('div', { className: 'folder-block-row' }, [
      el('span', { className: 'ico' }, [window.RiceIcons.icon('folder')]),
      el('span', { className: 'folder-path', textContent: middle(settings.rootDisplay || settings.root, 44), title: settings.root }, []),
      el('div', { className: 'folder-actions' }, [
        button(t('settings.folder.reveal'), () => rice.revealRoot()),
        button(t('settings.folder.change'), async () => {
          await rice.chooseRoot();
          await again();
        }),
      ]),
    ]);
    // Windows: "Iniciar com o Windows" (desligado por padrão); no Mac a seção não existe
    const WIN = rice.platform === 'win32';
    const launch = toggle('launch-login', settings.launchAtLogin === true, t('settings.startup.label'));
    launch.onchange = () => rice.setLaunchAtLogin && rice.setLaunchAtLogin(launch.checked);
    // as seções ficam todas no DOM (na ordem de sempre); só a escolhida aparece (as outras têm `hidden`)
    const nodes = [
      section(t('settings.language'), null, window.RiceLanguage.rows({ settings, onChange: again, row }), 'language'),
      section(t('settings.folder'), null, [folder, el('p', { className: 'set-desc', textContent: t('settings.folder.text') }, [])], 'folder'),
      section(t('settings.ai'), t('settings.ai.text'), [aiBox, lightBox, row(t('settings.cycles.label'), t('settings.cycles.help'), cycles.root), cycleWarn], 'ai'),
      section(t('settings.calendar'), t('settings.calendar.text'), [calBox], 'calendar'),
      section(t('settings.vocabulary'), t('settings.vocabulary.help'), [vocabulary.root, row(t('settings.vocabulary.attendees'), null, attendees)], 'vocabulary'),
      section(t('settings.speakers'), null, [row(t('settings.speakers.label'), t('settings.speakers.help'), identify)], 'speakers'),
      section(t('settings.screenshots'), t('settings.screenshots.text'), [row(t('settings.screenshots.label'), t('settings.screenshots.help'), shots), shotsNote, shotsOpen], 'screenshots'),
      section(t('settings.memory'), t('settings.memory.text'), memoryNodes, 'memory'),
      section(t('settings.followups'), t('settings.followups.text'), [row(t('settings.followups.notify'), t('settings.followups.notify-help'), notify)], 'followups'),
      section(t('chat-tools.title'), null, [row(t('chat-tools.label'), t('chat-tools.help'), tools), toolsHint], 'tools'),
      section(t('settings.audio'), null, [...(window.RiceAudioSettings ? window.RiceAudioSettings.nodes({ rice, settings, row, toggle }) : []), row(t('settings.audio.keep'), t('settings.audio.help'), keep)], 'audio'),
      section(t('settings.privacy'), t('settings.privacy.text'), [row(t('settings.localmode.label'), t('settings.localmode.help'), localMode), localExplain, localNote, localGo, row(t('settings.consent.label'), t('settings.consent.help'), consent), row(t('settings.redact.label'), t('settings.redact.help'), redact), el('div', { className: 'retention-default' }, [el('div', { className: 'set-label', textContent: t('settings.retention.title') }, []), el('p', { className: 'set-help', textContent: t('settings.retention.help') }, []), row(t('retention.audio'), null, retentionAudio.root), row(t('retention.meeting'), null, retentionMeeting.root)]), el('div', { className: 'consent-edit-block' }, [el('div', { className: 'set-label', textContent: t('settings.consent.text') }, []), el('p', { className: 'set-help', textContent: t('settings.consent.text-help') }, []), consentText, consentReset]), privBox], 'privacy'),
      section(t('settings.shortcuts'), null, [shortcutBox], 'shortcuts'),
      ...(WIN ? [section(t('settings.startup'), null, [row(t('settings.startup.label'), t('settings.startup.help'), launch)], 'startup')] : []),
      section(t('settings.updates'), null, [updatePage.node], 'updates'),
    ];
    const initial = [ctx && ctx.section, ctx && ctx.focus, remembered()].find((id) => IDS.includes(id) && (id !== 'startup' || WIN)) || 'language';
    const buttons = new Map();
    const show = (id) => {
      for (const node of nodes) node.hidden = node.dataset.section !== id;
      for (const [key, button] of buttons) button.setAttribute('aria-current', key === id ? 'true' : 'false');
      const current = buttons.get(id);
      if (current && current.scrollIntoView) current.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // aba ativa sempre visível na faixa rolável
      remember(id);
    };
    const navVisible = NAV.map((g) => ({ ...g, items: g.items.filter((i) => i[0] !== 'startup' || WIN) }));
    const navChildren = navVisible.flatMap((g) => [
      ...(g.group ? [el('div', { className: 'set-nav-group', textContent: t(g.group) }, [])] : []),
      ...g.items.map(([id, icon, label]) => {
        const button = el('button', { type: 'button', className: 'set-nav-item' }, [window.RiceIcons.icon(icon), el('span', { textContent: t(label) }, [])]);
        button.setAttribute('aria-current', 'false');
        button.onclick = () => show(id);
        buttons.set(id, button);
        return button;
      }),
    ]);
    container.replaceChildren(
      el('h1', { className: 'page-title static', textContent: t('settings.title') }, []),
      el('div', { className: 'set-layout' }, [
        el('nav', { className: 'set-nav', role: 'navigation', ariaLabel: t('settings.nav.label') }, navChildren),
        el('div', { className: 'set-content' }, nodes),
      ]),
    );
    show(initial);
  }

  window.RiceSettings = { render };
})();
