// Configurações › Áudio: (1) Microfone — no Windows, seletor "Padrão do Windows (recomendado)" + as entradas; no Mac, a explicação de que vale a entrada
// padrão do macOS; (2) Modelo de transcrição em uso e o motivo (modo leve com pouca memória), com a opção de forçar; (3) no Windows, a chave da GPU.
// Só createElement/textContent.
(function () {
  const t = (key, vars) => window.RiceI18n.t(key, vars);

  function el(tag, props, children) {
    const node = Object.assign(document.createElement(tag), props);
    for (const child of children || []) node.append(child);
    return node;
  }

  /** "Em uso: modelo leve (small; 8 GB de RAM, 4 núcleos)" etc., conforme o motivo que o main informa (vem do plano do transcritor). */
  function usingText(profile) {
    const key = { 'low-ram': 'audio.model.using.low-ram', 'forced-light': 'audio.model.using.forced-light', 'forced-full': 'audio.model.using.forced-full', 'enough-ram': 'audio.model.using.enough-ram', mac: 'audio.model.using.mac', override: 'audio.model.using.override' }[profile && profile.reason];
    return key ? t(key, { ram: profile.ramGb, cores: profile.cores, tier: profile.tier, threads: profile.threads }) : '';
  }

  /** "Última gravação: transcrita na placa de vídeo (AMD Radeon RX 9060 XT)" etc.; o main lê o dispositivo do log do whisper-server. */
  function deviceText(device) {
    if (!device) return t('audio.gpu.last.none');
    if (device.gpu) return t('audio.gpu.last.gpu', { device: device.name || device.backend || '' });
    return t(device.fellBackToCpu ? 'audio.gpu.last.fallback' : 'audio.gpu.last.cpu');
  }

  /** Os nós da seção. `row(label, help, control)` e `toggle(id, checked, label)` são os do settings.js. */
  function nodes({ rice, settings, row, toggle }) {
    const out = [];
    const WIN = rice.platform === 'win32';

    // 1) microfone
    if (WIN && rice.listMicInputs && rice.setMic) {
      const feedback = el('p', { className: 'set-help mic-feedback' }, []);
      const hint = el('p', { className: 'set-help', hidden: true }, []);
      const select = window.RiceMenuSelect.create({
        items: [{ value: '', label: t('audio.mic.default') }],
        value: settings.micDevice || '',
        ariaLabel: t('audio.mic.label'),
        onChoose: async (value) => {
          select.setValue(value);
          const r = await rice.setMic(value).catch(() => null);
          feedback.textContent = r && r.ok ? t('audio.mic.saved') : '';
        },
      });
      const load = async () => {
        const list = await rice.listMicInputs().catch(() => ({ supported: false, inputs: [] }));
        const inputs = Array.isArray(list.inputs) ? list.inputs : [];
        const items = [{ value: '', label: t('audio.mic.default') }, ...inputs.map((i) => ({ value: String(i.id), label: i.isDefault ? `${i.name} (${t('audio.mic.is-default')})` : String(i.name) }))];
        const saved = settings.micDevice || '';
        if (saved && !inputs.some((i) => i.id === saved)) items.push({ value: saved, label: t('audio.mic.missing') }); // o escolhido não está conectado agora
        select.setItems(items, saved);
        hint.hidden = list.supported === true;
        hint.textContent = list.supported === true ? '' : t('audio.mic.no-list');
      };
      load();
      out.push(row(t('audio.mic.label'), t('audio.mic.help'), select.root), feedback, hint);
    } else if (!WIN) {
      // Mac: escolher o microfone sozinho ao gravar (ligado por padrão) e, opcionalmente, um microfone fixo
      const auto = el('input', { type: 'checkbox', id: 'mic-auto', className: 'switch', checked: settings.micAuto !== false }, []);
      auto.setAttribute('role', 'switch');
      auto.setAttribute('aria-label', t('audio.mic.auto.label'));
      auto.onchange = () => { if (rice.setMicAuto) rice.setMicAuto(auto.checked); };
      out.push(row(t('audio.mic.auto.label'), t('audio.mic.auto.help'), auto));
      if (rice.listMicInputs && rice.setMic) {
        const fixed = window.RiceMenuSelect.create({
          items: [{ value: '', label: t('audio.mic.fixed.none') }],
          value: settings.micDevice || '',
          ariaLabel: t('audio.mic.fixed.label'),
          onChoose: (value) => {
            fixed.setValue(value);
            rice.setMic(value).catch(() => {});
          },
        });
        rice.listMicInputs().then((list) => {
          const inputs = Array.isArray(list && list.inputs) ? list.inputs : [];
          const saved = settings.micDevice || '';
          const items = [{ value: '', label: t('audio.mic.fixed.none') }, ...inputs.map((i) => ({ value: String(i.id), label: i.isDefault ? `${i.name} (${t('audio.mic.is-default')})` : String(i.name) }))];
          if (saved && !inputs.some((i) => i.id === saved)) items.push({ value: saved, label: t('audio.mic.missing') });
          fixed.setItems(items, saved);
        }).catch(() => {});
        out.push(row(t('audio.mic.fixed.label'), t('audio.mic.fixed.help'), fixed.root));
      }
    }

    // 2) modelo de transcrição e o motivo; só o Windows deixa escolher (o Mac usa sempre o modelo grande quantizado)
    if (rice.audioProfile) {
      const using = el('p', { className: 'set-help audio-model-using' }, []);
      const note = el('p', { className: 'ai-note-line', hidden: true }, [el('span', { className: 'ico' }, [window.RiceIcons.icon('info')]), el('span', { textContent: t('audio.model.light-note') }, [])]);
      const paint = (p) => {
        using.textContent = usingText(p);
        note.hidden = !(p && p.light);
      };
      if (WIN && rice.setAsrModel) {
        const choice = window.RiceMenuSelect.create({
          items: [{ value: 'auto', label: t('audio.model.auto') }, { value: 'light', label: t('audio.model.light') }, { value: 'full', label: t('audio.model.full') }],
          value: settings.asrModel || 'auto',
          ariaLabel: t('audio.model.label'),
          onChoose: async (value) => {
            choice.setValue(value);
            paint(await rice.setAsrModel(value).catch(() => null));
          },
        });
        rice.audioProfile().then((p) => { if (p) choice.setValue(p.choice); paint(p); }).catch(() => {});
        out.push(row(t('audio.model.label'), t('audio.model.help'), choice.root), using, note);
      } else {
        rice.audioProfile().then(paint).catch(() => {});
        out.push(using);
      }
    }

    // 3) GPU, só no Windows: ligada por padrão; desligada, o whisper-server roda só na CPU (-ng), para escapar de driver de vídeo com defeito.
    // Embaixo: onde a última gravação foi transcrita e, a cada troca, quando ela passa a valer (nunca é preciso reiniciar o Rice).
    if (WIN && rice.setAsrGpu && toggle) {
      const gpu = toggle('asr-gpu', settings.asrGpu !== false, t('audio.gpu.label'));
      const last = el('p', { className: 'set-help audio-gpu-last' }, []);
      const feedback = el('p', { className: 'set-help audio-gpu-feedback', hidden: true }, []);
      gpu.onchange = async () => {
        const r = await rice.setAsrGpu(gpu.checked).catch(() => null);
        if (!r || !r.ok) {
          gpu.checked = !gpu.checked; // não salvou: a chave volta como estava
          return;
        }
        feedback.textContent = r.appliedNow === false ? t('audio.gpu.saved-recording') : t(r.asrGpu ? 'audio.gpu.saved-on' : 'audio.gpu.saved-off');
        feedback.hidden = false;
      };
      if (rice.audioProfile) rice.audioProfile().then((p) => { last.textContent = deviceText(p && p.device); }).catch(() => {});
      out.push(row(t('audio.gpu.label'), t('audio.gpu.help'), gpu), last, feedback);
    }
    return out;
  }

  window.RiceAudioSettings = { nodes, usingText, deviceText };
})();
