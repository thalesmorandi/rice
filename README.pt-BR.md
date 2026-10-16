<p align="center">
  <img src="assets/icon/icon.png" width="128" height="128" alt="Rice">
</p>

<h1 align="center">Rice</h1>

<p align="center"><a href="README.md">English</a> · <b>Português</b> · <a href="https://ricenotes.app/pt/">ricenotes.app</a></p>

O Rice é um app para Mac que grava suas reuniões, transcreve no seu computador e escreve as notas para você.

![Rice: notas da reunião ao lado do chat](docs/images/pt-BR/02-chat.webp)

- **Transcrição local.** Grava o microfone e o áudio do sistema (os outros participantes) e transcreve com o [whisper.cpp](https://github.com/ggml-org/whisper.cpp). O áudio não sai do seu Mac.
- **Notas escritas por uma IA, a partir de templates.** Quando a gravação termina, o Rice preenche as seções de um template (Resumo, Decisões, Próximas ações…). Você escolhe a IA: Claude, ChatGPT, Gemini ou OpenCode.
- **Pergunte sobre a reunião.** Um painel de chat responde sobre o que foi dito.
- **Pastas.** Agrupe as reuniões na barra lateral, como pastas de um app de notas.
- **Busque em tudo.** Encontre uma palavra nos títulos, notas, anotações e transcrições de todas as reuniões.
- **Pergunte entre reuniões.** Uma pergunta, respondida com as notas das reuniões certas, com links para elas.
- **Compartilhe.** Copie as notas formatadas, gere um rascunho de e-mail de follow-up ou exporte um PDF.
- **Mini Rice.** Uma pílula flutuante mostra que você está gravando, com **Perguntar** e **Parar** a um passar de mouse.

## Sumário

- [Requisitos](#requisitos)
- [Instalação](#instalação)
- [Primeiros passos](#primeiros-passos)
- [Conectar uma IA](#conectar-uma-ia)
- [Uso no dia a dia](#uso-no-dia-a-dia)
- [Onde ficam os arquivos](#onde-ficam-os-arquivos)
- [Atalhos de teclado](#atalhos-de-teclado)
- [Solução de problemas](#solução-de-problemas)
- [Privacidade](#privacidade)
- [Licença](#licença)

## Requisitos

- Um Mac com **Apple Silicon** (M1 ou mais novo). Macs Intel ainda não são suportados.
- **macOS 14 (Sonoma) ou mais novo**. O Rice usa a captura de áudio do sistema que chegou nessa versão.
- **Xcode Command Line Tools** (`xcode-select --install`), para compilar os pequenos programas nativos de áudio.
- [**Homebrew**](https://brew.sh), usado para instalar o `whisper.cpp` e as ferramentas de build.
- **Node.js 22** ou mais novo.
- Cerca de **0,6 GB** livres em disco para o modelo de transcrição (baixado na primeira vez).
- Uma conta ou chave de API de pelo menos um provedor de IA (veja [Conectar uma IA](#conectar-uma-ia)). A transcrição funciona sem; notas e chat precisam dela.

## Instalação

Precisa de um Mac com Apple Silicon (arm64) e macOS 14 ou mais novo. A transcrição usa o `whisper-server` do Homebrew (`brew install whisper.cpp`).

### Opção 1 — recomendada: instalar pelo Terminal

Uma linha só. Ela baixa o código em `~/rice-src`, compila e coloca o **Rice.app** em `/Applications`. Como o app é gerado no seu Mac, o macOS não bloqueia a abertura (sem `xattr` nem "Abrir Mesmo Assim"). Rodar de novo atualiza.

```bash
curl -fsSL https://ricenotes.app/install | bash
```

Ou direto do GitHub: `curl -fsSL https://raw.githubusercontent.com/WalissonCF/rice/main/get.sh | bash`

Ou, passo a passo:

```bash
git clone https://github.com/WalissonCF/rice.git rice-src
cd rice-src
./install.sh
```

O `install.sh` confere macOS/arm64, as Ferramentas de Linha de Comando do Xcode, o Homebrew e o Node 22+, instala o que falta com o Homebrew (`whisper.cpp meson ninja pkg-config`), roda `npm ci` e `npm run dist`, copia o **Rice.app** para `/Applications` (substituindo o anterior) e remove a quarentena. Pode rodar de novo sem problema, para com uma mensagem clara (em português e inglês) quando falta algo e não usa `sudo` (só o Homebrew pode pedir). `./install.sh --check` só confere o ambiente.

### Opção 2 — baixar o .dmg

Baixe o `Rice-<versão>-arm64.dmg` na página de **Releases**, abra e arraste o **Rice** para **Aplicativos**.

O Rice tem assinatura ad hoc e **não** é assinado nem notarizado pela Apple; por isso, na primeira abertura, o macOS mostra "O item Rice não foi aberto". Para liberar, rode no Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/Rice.app
```

Ou, sem Terminal: clique em **OK** no aviso, abra **Ajustes do Sistema › Privacidade e Segurança**, role até o fim e clique em **Abrir Mesmo Assim** ao lado de "Rice foi bloqueado". (No macOS 15 ou mais novo, o clique direito > Abrir não libera mais o app.)

Como não é assinado pela Apple, o macOS pode pedir de novo as permissões (microfone, áudio do sistema, Calendário) depois de uma atualização.

Você ainda precisa do `brew install whisper.cpp` para o servidor de transcrição; o modelo de transcrição em si é baixado na primeira abertura.

### Atualizar

**Instalou com `git clone` + `./install.sh`:** rode, na pasta do clone:

```bash
cd rice-src   # ou ~/rice, se instalou antes da 0.5.1
./update.sh
```

Se o seu clone é antigo e ainda não tem o `update.sh`, atualize uma vez à mão (feche o Rice antes): `git pull && ./install.sh`. Daí em diante, use o `./update.sh`.

ou clique em **Atualizar** em **Configurações > Atualizações** quando o Rice mostrar "Nova versão disponível" (um pontinho aparece em Configurações na barra lateral; o botão abre o Terminal já rodando `./update.sh` no seu clone). O `update.sh` confere que a pasta é um clone git com remote, mostra o que mudou (até 20 linhas), roda `git pull --ff-only`, fecha o Rice, refaz o build com `./install.sh` e abre o Rice de novo. Ele para com uma explicação, sem alterar nem descartar nada, quando: há alterações locais (use `git stash`, e `git stash pop` depois), a atualização não é um fast-forward ou o Rice está **gravando** (pare a gravação antes). Se o build falhar, o Rice antigo continua em `/Applications` e é reaberto. `./update.sh --force` reconstrói mesmo sem versão nova, e `./install.sh --update` é um atalho para `./update.sh`. Suas reuniões, configurações e chaves continuam onde estavam.

**A atualização não mudou nada na tela?** O `update.sh` (e o `install.sh`) agora dizem isso em vez de falhar em silêncio. O `update.sh` fecha **qualquer** Rice aberto, em qualquer caminho, e lista onde cada um estava; depois de instalar, imprime `Rice atualizado: versão X, commit Y` e compara com o commit do seu clone (diferente é erro), registra o app no Launch Services, abre `/Applications/Rice.app` (caminho explícito, nunca `open -a Rice`) e confere que o Rice em execução é o de `/Applications`. Se houver outras cópias do Rice (um `.dmg` em Downloads, uma cópia antiga), avisa "Há outras cópias do Rice em: …" para você apagá-las ou abrir sempre `/Applications/Rice.app`; ele nunca apaga nada sozinho. Em **Configurações › Atualizações**, uma linha mostra `Versão 0.4.0 · commit abc1234 · /Applications/Rice.app`, para você ver qual cópia está aberta. Se o seu `update.sh` for anterior a esta versão, rode `./update.sh --force` mais uma vez depois da primeira atualização.

**Aviso de versão nova:** uma vez por dia o Rice faz uma requisição anônima à API pública do GitHub (`repos/WalissonCF/rice/commits/main`: sem token e sem nada sobre você ou suas reuniões) para ver se o `main` está à frente do seu build. Desligue em **Configurações > Atualizações > Procurar atualizações**. Ele só avisa: nada se atualiza sozinho, e instâncias de teste nunca consultam. Se esta cópia do Rice não veio de um clone (por exemplo o .dmg), o botão vira **Baixar no GitHub** e abre a página de releases. O build grava o commit e a pasta do clone em `out/build-info.json`, dentro do app; esse caminho fica no seu Mac e nunca é enviado a lugar nenhum.

**Instalou pelo .dmg:** baixe o `.dmg` mais novo em **Releases**, arraste o **Rice** para **Aplicativos** substituindo o antigo e rode de novo o `xattr` acima.

**Windows:** automática: **Configurações › Atualizações** mostra "Nova versão disponível" › **Baixar e instalar** › **Reiniciar e atualizar** (veja a seção Windows abaixo). Também dá para rodar o instalador mais novo das **Releases** por cima do antigo; ele substitui a versão anterior.

Depois de atualizar, o macOS pode pedir de novo as permissões (microfone, áudio do sistema, Gravação de Tela, Calendário), porque o app não é assinado pela Apple.

### Windows (x64, Windows 10 22H2 ou 11) — pronto para testar

O port para Windows é compilado e testado no CI (e a interface é conferida numa instância de teste que simula o Windows), mas **ainda não foi testado num PC de verdade**: trate como uma versão candidata e conte o que encontrar.

**Instalar (recomendado): o `.exe` da última release.** Baixe o `Rice-Setup-<versão>-x64.exe` em **Releases** e execute. Instala só para o seu usuário (sem administrador) e não é assinado: o SmartScreen pode mostrar "O Windows protegeu o seu computador"; escolha "Mais informações" e "Executar assim mesmo".

**Instalar em uma linha (PowerShell).** Baixa o instalador da última release no GitHub, confere o hash com o `latest.yml` da release (se não bater, apaga o arquivo e não instala nada) e roda:

```powershell
irm https://raw.githubusercontent.com/WalissonCF/rice/main/install-win.ps1 | iex
```

(Quando o site publicar, `irm https://ricenotes.app/install.ps1 | iex` fará o mesmo.)

**A atualização é automática.** Em **Configurações › Atualizações** o Rice mostra "Nova versão X disponível" › **Baixar e instalar** (com progresso) › **Reiniciar e atualizar**; o instalador roda e o Rice abre de novo. Nunca atualiza no meio de uma gravação (espera ela acabar), respeita **Procurar atualizações** (desligado, nada é consultado nem baixado) e o Modo 100% local bloqueia a verificação. Só vale no app instalado pelo `.exe`, e a release precisa levar o `latest.yml` e o `.blockmap` (o workflow `release-windows` anexa).

**Iniciar com o Windows** (Configurações › Inicialização, desligado por padrão) abre o Rice na bandeja, sem janela, com o atalho e os avisos de reunião prontos. **Microfone** (Configurações › Áudio): "Padrão do Windows (recomendado)" ou uma entrada específica; use o mesmo microfone que você escolheu no Teams ou no Zoom. Um chip perto do **Parar** mostra qual microfone está sendo gravado. Com 8 GB de RAM ou menos o Rice escolhe o modelo de transcrição **leve** (Configurações › Áudio mostra qual está em uso e por quê, e deixa forçar) e mantém a IA ao vivo (ideias e war room) mais contida.

**Transcrição na GPU.** O instalador traz o whisper.cpp compilado com Vulkan, então a transcrição roda na placa de vídeo quando há uma (AMD, Intel ou NVIDIA, com o driver de vídeo atualizado); num PC sem GPU ou sem driver Vulkan, ela continua na CPU. Se o driver de vídeo falhar quando a transcrição começa, o Rice volta para a CPU sozinho, e **Configurações › Áudio › Usar a placa de vídeo (GPU)** desliga a GPU de vez.

**Agenda sem o Calendário do sistema:** em **Configurações › Agenda** use **Assinar por link (ICS)** (Outlook/Microsoft 365: Publicar um calendário; Google: "Endereço secreto no formato iCal"; iCloud e Fastmail também servem) ou conecte o Google direto.

**Diferenças do Mac:** sem Antigravity, sem Lembretes, sem Calendário do sistema; o áudio do sistema vem do loopback do WASAPI (o cancelamento de eco é a parte ainda em acabamento); as notificações nativas não têm botões de ação (clicar no aviso faz a ação principal); as chaves ficam protegidas pelo Windows (DPAPI) e os atalhos usam Ctrl.

**Só para quem desenvolve:** o `install.ps1` compila o Rice a partir do código (precisa de Node 22, CMake e das ferramentas C++ do Visual Studio). Com o Vulkan SDK (`winget install KhronosGroup.VulkanSDK` e depois um terminal novo), ele também compila o whisper.cpp com GPU; sem ele, o instalador leva o whisper-server oficial, só CPU:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 -Check   # confere Windows, Node 22, CMake, as ferramentas C++ do Visual Studio e o Vulkan SDK
powershell -ExecutionPolicy Bypass -File install.ps1           # compila os helpers e o instalador (dist\Rice-Setup-*.exe) e o abre
```

## Primeiros passos

Abra **Como usar o Rice** na barra lateral. É uma lista de passos que se atualiza ao vivo.

![O guia "Como usar o Rice"](docs/images/pt-BR/11-guide.webp)

![O guia Como usar o Rice, no passo da Agenda](docs/images/pt-BR/48-guide.webp)

### 1. Escolha onde salvar as reuniões

Cada reunião vira uma pasta com a transcrição, as notas e o chat. Escolha o lugar em **Configurações › Pasta das reuniões** ou no guia (**Trocar pasta…**). Os arquivos são Markdown simples, então qualquer app abre.

![Pasta das reuniões](docs/images/pt-BR/13-meetings-folder.webp)

![Configurações em seções: Geral, IA, Reuniões e Privacidade](docs/images/pt-BR/29-settings-sections.webp)

### 2. Libere as permissões do macOS

Na primeira gravação o macOS pede duas coisas:

| Permissão | Para quê | Onde liberar |
| --- | --- | --- |
| **Microfone** | Para o Rice ouvir você. | Ajustes do Sistema › Privacidade e Segurança › Microfone |
| **Gravação de áudio do sistema** | Para o Rice ouvir os outros participantes. | Ajustes do Sistema › Privacidade e Segurança › Gravação de Tela e Áudio do Sistema |

O guia tem o botão **Abrir Ajustes de Privacidade**. Ative o **Rice** (rodando pelo código ele pode aparecer como **Electron**) e reabra o app se o macOS pedir.

![Passo de permissões do macOS](docs/images/pt-BR/12-permissions.webp)

### 3. Deixe o modelo baixar

O guia mostra o progresso do modelo de transcrição. Quando aparecer **Modelo carregado**, já dá para gravar.

## Conectar uma IA

Abra **Configurações › Inteligência artificial** (a mesma lista aparece no guia **Como usar o Rice**). Cada provedor é uma linha (Claude, ChatGPT, Gemini, OpenCode, Antigravity e **Modelo local**), com a IA ativa no topo; clique numa linha para abrir os passos dela. Dá para conectar mais de um provedor e trocar quando quiser com **Usar este**.

![Provedores de IA](docs/images/pt-BR/10-ai-providers.webp)

![Modelo leve e limite de ciclos em Inteligência artificial](docs/images/pt-BR/30-light-model.webp)

| Provedor | Opção | O que você precisa |
| --- | --- | --- |
| Claude | Assinatura | Rode `claude setup-token` no Terminal, entre pelo navegador e cole o token (começa com `sk-ant-oat`). |
| Claude | Chave de API | Crie uma chave em [console.anthropic.com](https://console.anthropic.com) › API Keys (começa com `sk-ant-api`). |
| ChatGPT | Assinatura | Instale o Codex CLI (`npm i -g @openai/codex` ou `brew install codex`), rode `codex login` e entre com sua conta do ChatGPT. Não há nada para colar. |
| ChatGPT | Chave de API | Crie uma chave em [platform.openai.com](https://platform.openai.com) › API keys (começa com `sk-`). |
| Gemini | Chave de API | Crie uma chave em [aistudio.google.com](https://aistudio.google.com) › Get API key (começa com `AIza`). O Google descontinuou o login do Gemini pelo terminal (CLI) para contas pessoais em junho de 2026, então o Gemini fica só com chave de API; quem usava por login é migrado para uma chave (ou outra IA já verificada) e recebe um aviso uma vez. |
| OpenCode | Login | Instale a CLI do [OpenCode](https://opencode.ai), rode `opencode auth login` e escolha sua assinatura. Nada para colar. Veja abaixo. |
| Antigravity | Login | Instale a CLI do Antigravity (`agy`) e rode `agy` no Terminal para entrar com sua conta. Nada para colar. Veja abaixo. |

Depois clique em **Testar conexão**.

- Chaves e tokens ficam criptografados no **Keychain do macOS** (`safeStorage` do Electron). Nunca são mostrados de novo e nunca são enviados a ninguém, a não ser ao provedor que você escolheu.
- O uso da API é cobrado pelo provedor, à parte de qualquer assinatura.

### OpenCode

O Rice usa a CLI do OpenCode já logada no seu Mac, igual ao Claude e ao ChatGPT. Instale com `curl -fsSL https://opencode.ai/install | bash` e rode `opencode auth login` no Terminal, escolhendo o provedor da sua assinatura (Claude Pro/Max, ChatGPT Plus/Pro, GitHub Copilot, OpenCode Zen…). Depois, no Rice, abra Conectar a IA > OpenCode, escolha o modelo (a lista mostra só os provedores em que você fez login) e clique em Testar conexão. O OpenCode roda só para gerar texto: com todas as permissões negadas (sem editar arquivos, rodar comandos, acessar a web, MCP ou plugins), numa pasta vazia, e sem herdar chaves de outros provedores. O modo Automático só usa modelos em que você fez login; sem nenhum, o Rice pede o login. O modelo gratuito (OpenCode Zen) só é usado se você o escolher na lista, e ele pode usar suas transcrições para melhorar modelos, então prefira sua assinatura para reuniões sensíveis.

### Antigravity (agy)

Você pode usar a assinatura do Antigravity como IA (Configurações > Inteligência artificial > Antigravity). Como o `agy` é um agente com acesso a arquivos e terminal, o Rice o roda dentro de um sandbox do macOS: ele só gera texto, não consegue gravar em lugar nenhum além de uma pasta temporária vazia, não executa comandos e não lê a sua pasta pessoal. A conversa criada a cada uso é apagada do estado do agy. O prompt entra pelo stdin, então não aparece na lista de processos. No Rice, clique em Testar conexão e escolha um modelo (a lista vem de `agy models`; no modo Automático o modelo leve das etapas simples é o menor Flash). O agente ainda tem acesso à web, por isso o Antigravity não fica disponível no War room nem no chat com ferramentas. As respostas demoram alguns segundos a mais que os outros provedores (o agy leva ~4 s para iniciar).

### Modelo local (sem internet)

Para jurídico, saúde, governo e bancos, onde as reuniões não podem ir para a nuvem: a transcrição já é local e, com o provedor **Modelo local**, a IA também é, então o Rice funciona sem internet de ponta a ponta.

1. Instale o [Ollama](https://ollama.com) e abra o app (o Rice nunca instala nada por conta própria).
2. Baixe um modelo: `ollama pull qwen3:8b` (5,2 GB, uma boa escolha para português em Macs com **16 GB**) ou um menor para **8 GB**: `ollama pull qwen3:4b` (2,5 GB) ou `ollama pull llama3.2:3b` (2,0 GB).
3. Em **Configurações › Inteligência artificial › Modelo local** escolha o **Servidor**: **Automático** (o Rice testa todas as portas padrão ao mesmo tempo, com tempo curto, e mostra o que achou, por exemplo "Encontrado: LM Studio em :1234") ou um da lista. Qualquer servidor local serve, não só o Ollama. O campo **Endereço do servidor** é editável, mas **só 127.0.0.1, localhost ou ::1** são aceitos: qualquer outro é recusado, e é isso que garante que "local" é local de verdade. Escolha o modelo (o tamanho aparece) ou digite o nome em **Nome do modelo** (para servidores que não listam modelos), clique em **Testar conexão** (uma geração curtinha) e **Usar este**.

| Servidor | Porta padrão | API | Como ligar |
| --- | --- | --- | --- |
| Ollama | 11434 | Ollama (`/api/chat`) | abra o app e `ollama pull qwen3:8b` |
| LM Studio | 1234 | compatível com OpenAI | carregue um modelo e ligue o Local Server (ou `lms server start`) |
| llama.cpp (`llama-server`) | 9931 (versões antigas: 8080) | compatível com OpenAI | `llama-server -m modelo.gguf --port 9931` |
| MLX (`mlx_lm.server`) | 8080 | compatível com OpenAI | `mlx_lm.server --model mlx-community/Qwen3-8B-4bit` |
| Jan | 1337 | compatível com OpenAI | Configurações › Local API Server › Start Server |
| Outro | qualquer, em localhost | compatível com OpenAI (`/v1/chat/completions`) | vLLM, KoboldCpp, text-generation-webui… |

Cada opção preenche a porta padrão acima (conferida na documentação oficial de cada projeto) e mostra os seus próprios passos curtos, com botão de copiar nos comandos.

**Tamanho do contexto** (8k / 16k / 32k, padrão 16k) é quanto texto o modelo lê de uma vez; ele vai para o Ollama como `num_ctx`, e o Rice dimensiona a extração de reuniões longas e o contexto do chat a partir dele. Mais contexto comporta reuniões maiores, mas usa mais RAM e é mais lento. O **modelo leve** (Automático) é o menor modelo instalado. Imagens só vão para modelos de visão (por exemplo `llava` ou `qwen2.5vl`). Busca na web, ferramentas e MCPs não existem com o modelo local.

**Limites:** as notas ficam um pouco mais simples que as dos modelos grandes e a geração é mais lenta.

**Modo 100% local** (Configurações › Privacidade, desligado por padrão) é o selo de confiança: só aceita o provedor Modelo local e bloqueia tudo o que usa a rede: busca na web, ferramentas e MCPs, war room com internet, sincronização com o Google Agenda (o Calendário do macOS continua), verificação de atualizações e download de modelos de transcrição (o modelo precisa já estar baixado). Os controles bloqueados ficam na tela, desabilitados, com o motivo, e um selo discreto **100% local** aparece no rodapé da barra lateral. Por baixo, a própria camada de rede do app recusa qualquer destino que não seja localhost enquanto o modo estiver ligado.

![Card Modelo local com o servidor encontrado](docs/images/pt-BR/37-local-model.webp)

## Uso no dia a dia

### Gravar, parar e continuar

Clique em **Nova reunião** e depois em **Gravar**. Ao parar, o Rice escreve as notas. Se a reunião não acabou, abra-a depois e clique em **Continuar gravação**: o novo áudio e a transcrição entram na mesma reunião.

**Qual microfone?** Durante a gravação, um chip perto do **Parar** mostra o microfone capturado (passe o mouse para ver o nome completo e se é o padrão do sistema ou o que você escolheu); se mudar no meio da reunião, o Rice avisa "Microfone trocado para X". O nome fica salvo na reunião (aparece nos detalhes e no recibo de privacidade). No Mac o Rice grava a entrada padrão do macOS (Ajustes do Sistema › Som › Entrada); no Windows dá para escolher o microfone em **Configurações › Áudio**.

O Rice também percebe reuniões (Zoom, Meet, Teams) e eventos da agenda e sugere gravar.

![Início com a reunião acontecendo agora e Gravar agora](docs/images/pt-BR/31-record-now.webp)

![O aviso quando um app de chamada começa a usar o microfone: Gravar?](docs/images/pt-BR/46-record-prompt.webp)

### Pausar a gravação

Para uma conversa paralela que não deve ser gravada, use **Pausar** (ao lado de **Parar**, no item **Pausar** da bandeja ou no botão do Mini Rice). Pausado, o Rice solta o microfone: o áudio não é gravado nem transcrito, o relógio para, o botão vira **Continuar · 00:42** (o tempo parado, em âmbar discreto) e o ponto de gravação da barra lateral, do item da reunião e da bandeja fica âmbar e parado. As ideias ao vivo, a War room e as capturas de tela também param. **Continuar** retoma na mesma reunião, e a transcrição ganha um marcador discreto, por exemplo “gravação pausada de 14:03 a 14:07”; os horários depois da pausa continuam certos. Pausado, o Rice não pergunta “ainda gravando?” nem para sozinho; depois de 30 minutos ele só pergunta se você quer parar. Se o app cair durante a pausa, “Recuperar reunião” funciona como sempre.

![Gravação pausada: Continuar · 00:12 e o marcador na transcrição](docs/images/pt-BR/32-pause.webp)

### Versões das notas

Gerar as notas de novo (outro template ou transcrição nova) não perde mais as anteriores: as notas antigas ficam em `notas-versoes/` (até 20; as mais antigas saem primeiro). Um chip discreto **Versões (3)** ao lado do chip do template lista todas ("Brainstorm · hoje 16:40 · atual"); escolher uma mostra a versão em leitura, com uma faixa fina (**Voltar para a atual** / **Restaurar esta**). Busca, chat, copiar e PDF usam sempre a atual.

### Agenda

O **Início** mostra os próximos 7 dias agrupados por dia (Hoje, Amanhã, "sex., 17 de out."). Eventos de dia inteiro ficam numa linha discreta por dia; os com horário mostram o intervalo ("09:00–09:30") e **Entrar** / **Fazer notas** só quando são reuniões (link de chamada ou participantes). Conecte o **Calendário do macOS** (recomendado: adicione sua conta Google em Ajustes do Sistema › Contas de Internet) ou o Google direto em **Configurações › Agenda**. Os títulos dos eventos ficam no seu Mac: só o título da reunião que você grava é usado, e eventos de dia inteiro nunca geram convite de gravação.

**Assinar por link (ICS)** (Mac e Windows): em **Configurações › Agenda** cole o link privado do seu calendário (Outlook/Microsoft 365: Configurações › Calendário › Calendários compartilhados › Publicar um calendário; Google: Configurações › o seu calendário › Integrar agenda › "Endereço secreto no formato iCal"; iCloud e Fastmail também servem; `webcal://` vale). O Rice lê só esse link, a cada 10 minutos, por https e com limite de tamanho, e entende eventos que se repetem (com exceções), fusos, dia inteiro e cancelados. O link é um segredo: fica cifrado (DPAPI no Windows, Keychain no Mac), nunca é mostrado de volta e nunca vai inteiro para a interface. O Modo 100% local bloqueia a leitura.

![Início com a agenda](docs/images/pt-BR/24-calendar.webp)

![Início com os lembretes de hoje acima da agenda](docs/images/pt-BR/25-home.webp)

![O aviso “a reunião vai começar”: Entrar e gravar, ou só gravar](docs/images/pt-BR/45-meeting-alert.webp)

![Configurações › Agenda: Calendário do macOS (recomendado) e conexão direta ao Google](docs/images/pt-BR/47-calendar-connect.webp)

### Transcrição ao vivo

A transcrição aparece enquanto você fala. O texto cinza ainda está sendo refinado e vira definitivo em instantes. Sua voz aparece como **Eu** e os outros participantes como **Outros** (com o app em inglês, aparecem como *Me* e *Others*; no arquivo da transcrição ficam sempre `Eu` e `Outros`). Você pode escrever suas próprias notas em **Anotações** a qualquer momento.

![Transcrição de uma reunião](docs/images/pt-BR/03-transcript.webp)

### Gerar notas e trocar o template

As notas são escritas assim que você para. Se faltarem ou falharem (por exemplo, ainda sem IA conectada), aparece o botão **Gerar notas**. O seletor acima das notas (por exemplo **Reunião geral**) troca o template, e o lado direito mostra as seções dele.

![Seletor de template](docs/images/pt-BR/04-template-picker.webp)

### Notas com as suas anotações

O que você digita em **Anotações** durante a reunião vira ponto importante nas notas: o Rice guarda o horário de cada linha, expande cada anotação na seção certa com o contexto da transcrição e destaca o seu texto (o que a IA acrescentou aparece num tom mais claro). Nada do que você escreveu é descartado: o que não couber vai para "Outros pontos".

![Notas com as anotações do usuário destacadas](docs/images/pt-BR/21-notes-annotations.webp)

![Anexos de uma reunião: imagens e arquivos](docs/images/pt-BR/28-attachments.webp)

### Vocabulário

Em **Configurações › Vocabulário**, adicione nomes, clientes e siglas como chips: digite um e aperte **Enter** (ou vírgula); o **×** remove, **Backspace** no campo vazio remove o último, e colar várias linhas cria vários chips (repetidos são ignorados). Eles ajudam a transcrição (vão no prompt do whisper) e as notas a acertar a grafia. Os participantes do evento da agenda entram automaticamente (dá para desligar).

![Vocabulário e participantes nas Configurações](docs/images/pt-BR/22-vocabulary-participants.webp)

### Reuniões longas

Reuniões de 1 a 2 horas são resumidas por partes de ~15 minutos e depois combinadas no template escolhido; você vê "Gerando notas… parte 2 de 6". O chat da reunião usa o resumo por partes e os trechos mais relevantes para a sua pergunta.

### Identificar participantes (beta)

Em **Configurações › Participantes**, o Rice separa as vozes do áudio do computador em Pessoa 1, Pessoa 2… Clique no rótulo para dar um nome (vale para a reunião toda; os participantes da agenda aparecem como atalho, e a IA pode sugerir pelo contexto, sempre como sugestão). Tudo roda no seu Mac: baixa um modelo de 27 MB na primeira vez e usa cerca de 100 MB de memória enquanto grava. Os nomes valem nas notas, no chat, na busca e no PDF exportado; o arquivo da transcrição continua com "Pessoa N".

![Dando um nome a um participante](docs/images/pt-BR/23-speakers.webp)

### Capturas de tela (opcional)

Desligadas por padrão. Em **Configurações › Capturas de tela** você liga, depois de um aviso. Enquanto grava, o Rice acompanha a conversa e, quando percebe que alguém vai mostrar algo (“vou compartilhar minha tela”, “olha esse gráfico”, “here’s the dashboard”), tira um print da tela uns 2 segundos depois, para dar tempo de a tela trocar. O print fica na pasta da reunião (`capturas/`), ligado à frase que o motivou: a miniatura aparece logo depois dela na transcrição, com uma legenda curta, e a IA pode citá-la nas notas. Clique na miniatura para ampliar; ⋯ remove. Quando a IA não perceber o momento, use o botão da câmera na barra (ou **⌘⇧S**).

Como funciona: um filtro local, em português e inglês, escolhe as falas que valem uma pergunta; só então o Rice envia à IA que você configurou os últimos ~60 s da transcrição (texto) para confirmar. Isso funciona com qualquer provedor, inclusive as assinaturas por CLI. Com uma chave de API (Claude, OpenAI ou Gemini) a imagem também vai para a IA, só para refinar a legenda; nas assinaturas por CLI as imagens ficam só no seu computador. No máximo uma pergunta a cada ~15 s e um print a cada ~10 s; prints iguais ao anterior são descartados. Qual tela: o Rice usa o app que o detector viu usando o microfone (Zoom, Teams, Meet no navegador…) e captura a tela onde está a janela dele; quando é outra pessoa falando (áudio do computador), captura só a janela da chamada. Sem encontrar o app, usa a tela do cursor (no Windows, sempre a do cursor). Exige a permissão de Gravação de Tela do macOS. Dá para desligar a qualquer momento, até gravando.

![Transcrição com a captura logo depois da frase que a motivou](docs/images/pt-BR/35-screenshots.webp)

### Memória entre reuniões

Em vez de cada reunião ser uma ilha, o Rice lembra o que cada pessoa e cada empresa **pediu, prometeu e decidiu**, e o que ficou pendente. Quando as notas de uma reunião ficam prontas, uma chamada ao **modelo leve** da IA (uma por reunião, só com o texto das notas, das anotações e dos participantes) extrai esses fatos. Tudo fica **neste Mac**, em `<pasta das reuniões>/.rice/memory.jsonl`; as pessoas vêm dos participantes da agenda e dos nomes que você deu, e a empresa vem do domínio do e-mail (ignorando Gmail, Outlook, iCloud e afins e o seu próprio domínio).

- **Antes da call:** na aba **Notas** da reunião de um evento da agenda aparece o cartão recolhível **O que lembrar**, com 3 a 6 pontos (pendências em aberto primeiro, as vencidas em âmbar) e um link para a reunião de origem de cada um. No **Início**, o evento que começa em até 15 minutos ganha uma linha com o primeiro ponto e “ver mais”. Sem fatos, nada aparece.
- **Pendências que se fecham:** se na reunião seguinte alguém diz “mandei a proposta”, a IA marca a pendência como feita, com a fonte (“concluída em …”). Ela nunca apaga: dá para reabrir com um clique.
- **No chat:** o chat da reunião e o de todas as reuniões ganham os fatos das pessoas e empresas envolvidas como contexto extra (“o que a Acme pediu antes?”).
- **Página Memória (barra lateral, logo abaixo de Pendências):** abas Pessoas e Empresas com busca; cada uma abre um detalhe com as pendências em aberto primeiro, depois decisões, contexto e as últimas reuniões (com links), além de editar, marcar como resolvido, apagar e “Esquecer esta pessoa/empresa”. O nome da pessoa/empresa no cartão “O que lembrar” e no Início leva direto a esse detalhe. A memória vazia explica o que vai aparecer.
- **Configurações › Memória:** a opção de ligar/desligar (ligada por padrão), um link para a página, **Apagar memória** (com confirmação, escondida quando vazia) e **Montar memória das reuniões antigas** roda em segundo plano, uma reunião por vez, com progresso e botão de cancelar, e só depois do seu clique (usa a IA uma vez para cada reunião). Apagar uma reunião remove os fatos dela.

![Página Memória com pessoas e empresas](docs/images/pt-BR/42-memory.webp)

![Cartão O que lembrar na aba Notas](docs/images/pt-BR/43-what-to-remember.webp)

### Pendências

O item **Pendências** da barra lateral (com um contador das suas pendências vencidas) reúne o que você prometeu e o que prometeram a você, de todas as reuniões, em Vencidas, Hoje, Esta semana, Depois, Sem prazo e Feitas, com filtros **Minhas**, **Dos outros** e **Todas**. Cada linha tem checkbox, texto, responsável, prazo (um clique para mudar) e o link da reunião de origem; o campo **Adicionar pendência** cria as suas, ligadas ou não a uma reunião. Os prazos relativos (“até sexta”, “semana que vem”) são convertidos em data pela IA com a data da reunião; sem prazo claro, o campo fica vazio. Marcar uma pendência marca o `- [ ]` correspondente das notas, e marcar a tarefa nas notas marca a pendência. Uma **notificação local** avisa às 9h do dia do prazo (ou ao abrir o app), juntando as do dia em uma só; dá para desligar em Configurações › Pendências. Com a integração de Lembretes ligada, **Enviar para Lembretes** leva uma pendência (ou todas as suas) ao app Lembretes do macOS.

![Página Pendências com grupos](docs/images/pt-BR/44-follow-ups.webp)

### Editar e criar templates

Abra **Templates** na barra lateral. Os templates embutidos podem ser editados (e restaurados depois); **Duplicar** cria o seu. Um template é só um título, uma descrição curta e a lista de seções que o Rice deve preencher.

![Templates](docs/images/pt-BR/05-templates.webp)
![Editando um template](docs/images/pt-BR/06-template-editor.webp)

### Perguntar à IA

Clique em **Pergunte ao Rice** (canto superior direito) e pergunte qualquer coisa sobre a reunião aberta: decisões, quem faz o quê, o que se falou sobre um assunto. Perguntas e respostas ficam salvas na reunião. **Perguntas prontas:** o botão de lâmpada dentro do campo de pergunta (à esquerda do enviar, sempre visível) abre um menu acima do campo com perguntas prontas ("Resumo para quem faltou", "Próximos passos por pessoa", "Riscos e pendências"; no chat de todas as reuniões, "O que ficou pendente esta semana?" e outras) e as suas: um clique envia a pergunta. No mesmo menu, **Salvar a última pergunta** e **Adicionar pergunta pronta…** guardam as suas (até 8) e **Remover pergunta salva** apaga uma; **⋯ > Salvar como pergunta pronta** numa pergunta já enviada faz o mesmo. As respostas que usaram *Buscar na web* guardam as fontes, e elas aparecem de novo quando você reabre a reunião. **Buscar na web** (botão do globo ao lado dos chips, desligado por padrão e por conversa) deixa o Rice pesquisar na internet nas perguntas feitas enquanto está ligado; vale no chat da reunião e no chat de todas as reuniões, e as fontes aparecem como links embaixo da resposta (título e domínio, abertos no navegador). A pergunta vai para a busca do próprio provedor de IA; as notas da reunião continuam indo só para a IA. O Claude CLI usa apenas WebSearch e WebFetch (nunca Bash, Edit nem leitura de arquivos), o Codex usa a busca ao vivo com o sandbox somente leitura e sem shell, e as APIs da Anthropic, da OpenAI e do Gemini usam as ferramentas de busca delas. Indisponível no OpenCode e no Antigravity (não dá para restringir a busca sem dar shell), onde o botão fica desabilitado com o motivo.


**Trocar a IA e o modelo no chat.** No cabeçalho do chat, o chip com o nome da IA (por exemplo "Claude · Sonnet") abre um menu com os provedores que você já configurou e os modelos de cada um; o atual aparece com ✓. A escolha vale para o app inteiro (é a mesma de Configurações > IA): a próxima pergunta e as próximas notas já usam o modelo escolhido. Provedores ainda não configurados aparecem no fim, com "Configurar…". Durante uma resposta o chip fica desabilitado. No OpenCode, o modelo gratuito é uma opção explícita e avisa que pode usar suas transcrições para melhorar modelos.

![Menu de perguntas prontas no chat](docs/images/pt-BR/33-saved-questions.webp)

![Chat com a busca na web ligada e as fontes da resposta](docs/images/pt-BR/34-web-search.webp)

### Perguntar entre reuniões

Abra o **Início** (primeiro item da barra lateral): o campo **Pergunte sobre suas reuniões** fica no topo da página. Também dá para apertar **⌘J** de qualquer lugar. O Rice abre o painel de chat no modo **Todas as reuniões**: escolhe as reuniões mais relevantes pela sua pergunta (as palavras dela, um período como "último mês" ou "semana passada", o nome de uma pasta ou de um cliente), envia as notas delas e os trechos da transcrição que combinam para a sua IA e responde citando as reuniões. Os números pequenos na resposta, e a linha **Fontes**, abrem a reunião naquele trecho.

O chip no topo do painel troca entre **Esta reunião**, **Todas as reuniões** e uma pasta (com as subpastas). A conversa fica salva em `.rice/chat-global.jsonl`; **Nova conversa** recomeça.

![Chat entre todas as reuniões, com fontes](docs/images/pt-BR/17-global-chat.webp)

### Gravar e parar de qualquer lugar

Aperte **⌥⌘R** (Ctrl+Alt+R no Windows) em qualquer app, com o Rice em segundo plano: ele começa uma reunião, usando a nota da reunião da agenda que está acontecendo ou começa em até 10 minutos (como o **Gravar agora** do Início), e para quando você aperta de novo. Uma notificação discreta diz "Gravando" ou "Gravação parada". Troque as teclas ou escolha **Nenhum** em **Configurações > Atalhos**; se outro app já usa essas teclas, as Configurações mostram um aviso para você escolher outro atalho.

![Configurações › Atalhos](docs/images/pt-BR/36-shortcuts.webp)

### Mini Rice

Durante a gravação, uma pílula flutua na tela, para você poder sair da janela do Rice. Passe o mouse sobre ela e aparecem **Perguntar** e **Parar**. Clique no logo para trazer o Rice de volta e arraste a pílula pela coluna do logo para movê-la.

![Mini Rice em repouso](docs/images/pt-BR/15-mini-rice-rest.webp)
![Mini Rice com o mouse em cima](docs/images/pt-BR/16-mini-rice-hover.webp)

*As duas imagens são a janela real do Mini Rice renderizada sobre um fundo neutro, com o estado de hover forçado.*

### Pastas

Clique no ícone de pasta ao lado de **Pastas** na barra lateral para criar uma. Uma pasta pode ter outras dentro, até 4 níveis: use **⋯ › Nova subpasta**, ou arraste uma pasta sobre outra para movê-la para dentro (solte na borda de cima ou de baixo para só reordenar). Mova uma reunião com **⋯ › Mover para pasta**, cuja lista mostra a árvore, ou arraste-a até a pasta. Linhas finas ligam cada pasta ao que há dentro dela, a contagem inclui as subpastas e aberta ou fechada é lembrado por pasta.

Pastas são apenas rótulos: a reunião continua no mesmo lugar no disco. Apagar uma pasta não apaga nada: as subpastas e as reuniões dela sobem para a pasta-mãe.

![Pastas dentro de pastas](docs/images/pt-BR/20-nested-folders.webp)

### Busca

Aperte **⌘K** e digite. O Rice busca dentro das reuniões: títulos, notas, anotações e transcrições, sem diferenciar acentos nem maiúsculas, e também o nome da pasta. Cada resultado mostra a data, um trecho de uma linha com as suas palavras em negrito e onde foi achado (nas notas, na transcrição…). Use **↑ ↓** e **Enter** para percorrer os resultados, ou clique em um: a reunião abre já rolada até o trecho, que pisca por um instante. **Esc** limpa a busca.

![Busca](docs/images/pt-BR/08-search.webp)

### Compartilhar

O menu **⋯** da reunião tem **Compartilhar**:

- **Copiar notas** coloca as notas na área de transferência formatadas (títulos, listas, tarefas) e em Markdown, então colar no Slack, no Gmail, no Notion ou no Google Docs mantém a formatação. Aparece um pequeno "Notas copiadas".
- **Copiar como Markdown** copia só o Markdown.
- **Rascunho de e-mail de follow-up**: a IA escreve assunto e corpo (agradecimento, resumo curto, decisões, próximos passos com responsáveis) no idioma da reunião. Você edita num diálogo limpo e usa **Copiar** ou **Abrir no Mail**. Se a reunião veio da agenda, os destinatários vêm preenchidos com os participantes, nunca com o seu próprio endereço. Rascunhos longos demais para um link `mailto:` só oferecem Copiar.
- **Exportar PDF…** gera uma página limpa (título, data, participantes, notas e, se você marcar, a transcrição) e pergunta onde salvar.

Não há integração com o Notion, portanto nenhuma credencial extra: use **Copiar notas** e cole no Notion, que converte sozinho.

![Menu Compartilhar](docs/images/pt-BR/18-share-menu.webp)
![Rascunho de e-mail de follow-up](docs/images/pt-BR/19-email-draft.webp)

### Idiomas

O **chip com o globo** (PT/EN), no topo de todas as telas, abre uma pequena árvore: **Idioma do app ▸** e **Idioma das reuniões ▸** (dentro de uma reunião ela tem duas seções, **Esta reunião** e **Padrão**). As mesmas duas escolhas estão em **Configurações › Idioma**:

- **Idioma do app**: os textos do Rice (Português ou English).
- **Idioma das reuniões**: a língua falada nas suas reuniões (Português, English ou Automático). Uma língua fixa dá a melhor qualidade. Dá para trocar também só para uma reunião, pelo seletor no topo dela. Não dá para trocar durante a gravação. As notas são escritas no idioma da reunião.

![Configurações](docs/images/pt-BR/09-settings.webp)

### Apagar uma reunião

**⋯ › Apagar reunião** pede confirmação e depois move a pasta inteira da reunião para a **Lixeira do macOS**, de onde dá para recuperar.

![Confirmação para apagar](docs/images/pt-BR/14-delete.webp)

### Ideias ao vivo e War room
**Tipos de ideias.** Na aba Ideias, *Tipo: Geral ▾* escolhe o que a IA sugere: Geral (ideias, perguntas e riscos), Brainstorm, Perguntas para fazer agora, Riscos e objeções, Vendas, Entrevista ou Técnico. Cada um é um template editável (instrução + categorias opcionais) e você cria os seus em **Templates > Ideias** (guardados em `.rice/idea-templates/`). A escolha é por reunião (o último escolhido vira o padrão das novas) e trocar no meio vale a partir do próximo ciclo.

**Nova war room** (barra lateral ou Início) cria uma reunião já no modo War room e abre a aba Investigação; qualquer reunião vira uma por essa aba, e um selo **War room** ao lado da data volta ao normal. As abas Ideias e Investigação ficam na página da reunião, ao lado de Notas e Transcrição, cada uma com uma explicação curta. Durante a gravação, a aba Ideias sugere 1 a 3 ideias, perguntas ou riscos a cada 2, 5, 10 ou 15 minutos (você escolhe), só quando há fala nova. Fixe as boas nas anotações. Em reuniões do tipo War room, a aba Investigação roda ciclos (com intervalo próprio, independente das ideias) e lista os **Achados** conforme chegam, os mais recentes primeiro, cada um com a fonte (URL clicável, ou arquivo dentro da pasta de trabalho revelado no Finder) e o horário. **Fixe** os que importam (vão para o topo e ficam sempre no contexto dos próximos ciclos; os mais recentes entram junto) e **descarte** o resto (com alguns segundos para **Desfazer**). O contador da aba mostra os achados novos desde a última vez que você olhou. *Parar* aborta o ciclo em andamento e *Investigação ativa* pausa a investigação sem perder as fontes. Fontes opcionais, cada uma com aviso e desligada por padrão: Internet (busca e leitura de páginas), MCPs e uma pasta de trabalho somente leitura. Funciona com Claude e Codex por assinatura. Notas e e-mails nunca usam ferramentas.

![Aba Ideias com as sugestões da IA](docs/images/pt-BR/26-ideas.webp)

![Aba Investigação com achados e fontes](docs/images/pt-BR/27-warroom.webp)

**Continue no seu próprio Claude/Codex.** Na aba Investigação, *Continuar no terminal* abre o seu CLI (Claude Code, Codex, Gemini CLI, Antigravity ou OpenCode, só os que existem no seu Mac) no Terminal, na pasta de trabalho (você escolhe antes; a pasta pessoal, `/` e pastas de credenciais são recusadas), com um prompt para acompanhar a `transcricao.md` ao vivo e investigar. O prompt leva só caminhos de arquivos e os achados que você confirmou, nunca a transcrição. *Copiar prompt* serve para qualquer outro harness ou IDE. O Rice segue gravando e atualizando o arquivo; o outro harness usa as permissões e a conta dele, e o Rice não controla o que ele faz.

## Onde ficam os arquivos

Tudo fica na pasta de reuniões que você escolheu (por exemplo `~/Rice`):

```text
Rice/
├── .rice/
│   ├── folders.json            # as pastas da barra lateral (e qual está dentro de qual)
│   ├── chat-global.jsonl       # o chat entre reuniões
│   └── templates/              # seus templates, um .json cada
└── 2026-10-09 1000 - Planejamento do trimestre/
    ├── meta.json               # título, horário, idioma, template, pasta…
    ├── transcricao.md          # a transcrição
    ├── anotacoes.md            # o que você escreveu em "Anotações"
    ├── anotacoes.json          # o horário de cada linha digitada durante a gravação
    ├── falantes.json           # qual voz é qual pessoa (se "Identificar participantes" estiver ligado)
    ├── extracoes.json          # resumos por partes das reuniões longas
    ├── notas.md                # as notas escritas pela IA
    ├── notas-versoes/          # versões anteriores das notas (até 20) + index.json
    ├── chat.md                 # o chat, legível
    ├── chat.jsonl              # o chat, para o app
    └── audio.m4a               # o áudio (se "Manter o áudio das reuniões" estiver ligado)
```

As configurações do app, os segredos e o modelo de transcrição ficam em `~/Library/Application Support/Rice`.

## Atalhos de teclado

| Atalho | Ação |
| --- | --- |
| **⌘K** | Foca o campo de busca |
| **⌘J** | Pergunta sobre todas as reuniões |
| **↑ ↓ Enter** (na busca) | Percorre os resultados e abre um |
| **Esc** | Limpa a busca / fecha um menu ou diálogo |
| **⌘⌫** | Apaga a reunião aberta (pergunta antes) |
| **⌘,** | Abre as Configurações |
| **⌥⌘R** (global, funciona com o Rice em segundo plano; **Ctrl+Alt+R** no Windows) | Começa a gravar ou, se já estiver gravando, para. Troque ou escolha *Nenhum* em Configurações > Atalhos |
| **⌘⇧S** | Captura a tela agora (só gravando, com as capturas ligadas) |
| **↑ ↓ → ← Enter** | Navega por menus e submenus |

## Solução de problemas

**Disco cheio ou pasta indisponível.** O Rice avisa antes de gravar se há menos de 1 GB livre. Se o disco encher durante a reunião, aparece um aviso vermelho, o áudio para de ser salvo e a transcrição continua sendo guardada (na memória e numa cópia local) até haver espaço. Se a pasta das reuniões sumir (volume ejetado, pasta apagada), o Rice recria a pasta ou salva em um local seguro e avisa onde ficou. Libere espaço ou reconecte o volume: o aviso some sozinho e o trecho sem áudio fica marcado na transcrição.

**O Rice fechou no meio da gravação.** Ao abrir de novo, a reunião aparece como "Gravação interrompida". Abra e clique em "Recuperar reunião": o Rice finaliza o áudio, transcreve o que ainda não tinha texto e gera as notas. Também dá para clicar em "Continuar gravação".

**O Mac dormiu durante a reunião.** A gravação continua na mesma reunião; o trecho em repouso aparece como "gravação pausada de … a …" e o áudio do sistema é reconectado.

**"Possível queda do áudio" ou "o microfone perdeu a permissão".** O Rice tenta reconectar sozinho algumas vezes. Se não voltar, use "Abrir permissões" no aviso e ative o microfone (ou a captura de áudio do sistema) para o Rice em Ajustes do Sistema > Privacidade e Segurança.

**"Ainda gravando?"** Depois de 15 minutos sem fala o Rice pergunta; sem resposta em 2 minutos ele para a gravação e oferece "Retomar". Em `settings.json`, `inactivityMinutes` muda o tempo (0 desliga). Gravações com mais de 3 horas ganham um lembrete a cada hora.

**Notas que não saem.** Se o app fechou durante a geração, a reunião mostra "Gerar notas". Falhas de rede têm uma nova tentativa automática; erros de login ou limite de uso pedem ação sua (a mensagem diz qual).

**"Precisa de reparo".** Se o `meta.json` de uma reunião estiver ilegível, ela continua na lista com esse selo; "Reparar reunião" recria título, data e estado pelo nome da pasta e guarda o arquivo ruim como `meta.json.corrompido`.

**Sem áudio do sistema (só a minha voz é transcrita).**
Libere *Gravação de áudio do sistema* para o Rice (ou Electron) em Ajustes do Sistema › Privacidade e Segurança, depois feche e abra o app. Use fones para evitar eco.

**A IA não conecta.**
Clique em **Testar conexão** no provedor. Nas assinaturas o login pode ter expirado: rode `claude setup-token` de novo (e cole o novo token), ou `codex login`. Nas chaves de API, confira se a chave está ativa e com crédito.

**A transcrição está lenta ou o Mac esquenta.**
Feche apps pesados durante a gravação. O modelo quantizado padrão é o mais leve; confira se você não definiu `RICE_WHISPER_MODEL=f16`.

**O `npm run app` diz que o Electron não foi instalado.**
Rode `node node_modules/electron/install.js`.

**O `scripts/build-native.sh` falha.**
Confira se `xcode-select -p` mostra um caminho e se o `brew install meson ninja pkg-config` terminou. A primeira compilação também precisa de internet.

**O Rice diz que falta o `whisper-server`.**
Rode `brew install whisper.cpp` ou aponte `RICE_WHISPER_SERVER` para o binário.

**Atualizar no modo de desenvolvimento (`npm run app`).** Para o app instalado, veja [Atualizar](#atualizar).
```bash
cd rice-src
git pull
npm install
scripts/build-native.sh
npm run app
```

### Ferramentas e MCPs (avançado, por sua conta e risco)
Em Configurações > Ferramentas e MCPs no chat você pode deixar o chat usar os MCPs que já configurou no Claude Code (`claude mcp add …`) ou no Codex, por exemplo para criar tarefas no Notion ou no ClickUp a partir de uma reunião. Fica desligado por padrão e vale só para o chat, nunca para notas, e-mails ou extrações. Atenção: o texto da reunião vem de terceiros e pode conter instruções maliciosas; ações de ferramentas podem ser irreversíveis. Cada uso aparece como "Ferramenta usada: servidor · ferramenta". Só Claude e Codex por assinatura.

## Privacidade

O que fica, o que sai e como conferir:

- **O áudio nunca sai do seu Mac.** Ele é gravado e transcrito localmente. Só texto pode sair: a transcrição e as suas perguntas vão para o provedor de IA que **você** escolheu, e só quando o Rice gera notas ou responde. O Rice não tem servidores, conta, telemetria nem relatório de erros. O código é aberto (MIT).
- **Recibo por reunião.** No **⋯ da reunião › O que saiu deste computador** você vê, linha a linha, o que foi enviado à IA, quantas vezes, quando e para qual provedor ("Notas: Claude (assinatura) · 1 envio · 14:31", "Capturas: 0 enviadas", "Busca na web: não usada"), ou "Nada desta reunião saiu do seu computador". Ele vem de um registro só de metadados, guardado na pasta da reunião (`.rice-egress.jsonl`: hora, tipo, provedor, tamanhos; nunca o conteúdo), e dá para copiar como texto ou salvar em PDF para a área de compliance. Toda chamada à IA é registrada num ponto central, então nenhum recurso esquece; o Modelo local conta como "não saiu".
- **Aviso de consentimento.** Ao começar a gravar (botão, Gravar agora, aviso de reunião ou o atalho ⌥⌘R) aparece um toast discreto, que nunca bloqueia a gravação, sugerindo avisar os participantes, com o botão **Copiar aviso** e uma frase pronta no idioma da reunião ("Aviso: estou usando o Rice para transcrever esta reunião localmente no meu computador, para minhas anotações…"). Edite o texto ou desligue o lembrete em **Configurações › Privacidade**. A hora em que o aviso foi copiado aparece no recibo. As leis de gravação variam: em muitos lugares é preciso avisar os participantes.
- **A sua voz nunca é salva.** Na identificação de participantes (beta) as vozes são comparadas **só na memória** durante a gravação e descartadas no fim: nenhuma assinatura de voz (embedding) vai para o disco, para a reunião ou para a rede. Versões anteriores guardavam os grupos de falantes em `falantes.json` por reunião; o Rice agora apaga esse arquivo e nunca mais o grava (um teste grava uma reunião simulada e confere que nenhum arquivo tem vetores de voz).
- **Ocultar dados pessoais.** Com **Configurações › Privacidade › Ocultar dados pessoais ao enviar para a IA**, ou numa pasta marcada como **Sensível** (⋯ da pasta; as subpastas herdam), CPF, CNPJ, cartão (com Luhn), e-mail, telefone (BR/internacional), RG e CEP viram marcadores como `[CPF 1]` e `[EMAIL 2]` antes de o texto sair do Mac, e a resposta é restaurada localmente antes de ser salva ou mostrada. O mapa dos marcadores vive só na memória, por chamada, e nunca é gravado. Falsos positivos comuns (números de pedido, datas, valores) ficam como estão. Imagens não dá para ocultar, então não são enviadas enquanto a ocultação está ligada. O recibo mostra "12 dados pessoais ocultados". Com o Modelo local não faz diferença.
- **Guarda por pasta.** ⋯ da pasta › **Tempo de guarda…** define duas regras independentes: **áudio** (manter sempre, ou apagar depois de 7, 30 ou 90 dias) e **reunião inteira** (manter sempre, ou depois de 6 meses ou 1 ano); as subpastas herdam da pasta-mãe, e **Configurações › Privacidade** tem um padrão. Uma varredura diária (ao abrir e a cada 24 h) manda só o que venceu para a **Lixeira** do sistema (nunca apaga em definitivo), nunca toca numa reunião gravando ou finalizando e avisa uma vez ("3 áudios antigos foram para a Lixeira pela regra da pasta Jurídico").
- **Modo 100% local** (Configurações › Privacidade, desligado por padrão): só o provedor Modelo local; busca na web, ferramentas e MCPs, war room com internet, Google Agenda, verificação de atualizações e download de modelos de transcrição ficam bloqueados, e a própria camada de rede do app recusa qualquer destino que não seja localhost (veja [Modelo local](#modelo-local-sem-internet)).
- As perguntas entre reuniões e os rascunhos de e-mail enviam, ao provedor que **você** escolheu, só as notas e alguns trechos da transcrição das reuniões de que precisam (no máximo 8, com limite de tamanho). A busca roda inteira no seu Mac.
- Tudo o que o Rice cria (áudio, transcrições, notas, conversas, configurações) fica em pastas e arquivos que só o seu usuário lê (permissões 0700/0600). Chaves e tokens ficam no Keychain do macOS.
- As CLIs de IA rodam sem ferramentas que toquem nos seus arquivos (Claude sem ferramentas; Codex com shell, navegador, computador e plugins desligados; OpenCode com todas as permissões negadas; Antigravity dentro de um sandbox do macOS que só permite escrever numa pasta temporária vazia).
- Memória entre reuniões (ligada por padrão, dá para desligar): os fatos ficam só neste Mac, em `.rice/memory.jsonl`; o que sai é o texto das notas de cada reunião para o provedor de IA que você escolheu (uma chamada do modelo leve por reunião), e os fatos relevantes junto das perguntas do chat e do "O que lembrar". Essas chamadas entram no recibo por reunião (tipo "memória") e respeitam a ocultação de dados pessoais, as pastas sensíveis e o Modo 100% local (com o Modelo local nada sai do computador).
- Os modelos de transcrição e de voz são baixados uma vez e conferidos por SHA-256. O Google Agenda (opcional) é só leitura; dá para usar o Calendário do macOS no lugar.
- O app só carrega as próprias páginas locais: não navega para sites, não abre janelas nem pede permissões de página.
- Capturas de tela (opcional, desligado por padrão): ficam na pasta da reunião. Para decidir quando tirar uma, trechos recentes da transcrição (texto) vão para a IA que você escolheu; a imagem só vai se for uma chave de API.
- Apagar uma reunião a manda para a Lixeira; nada fica em outro lugar.

![O que saiu deste computador: o recibo de uma reunião](docs/images/pt-BR/39-privacy-receipt.webp)

![Aviso de consentimento](docs/images/pt-BR/40-consent.webp)

![Modo 100% local em Configurações › Privacidade, com o selo na barra lateral](docs/images/pt-BR/38-fully-local.webp)

![Tempo de guarda da pasta](docs/images/pt-BR/41-retention.webp)

## Licença

MIT — veja [LICENSE](LICENSE).
