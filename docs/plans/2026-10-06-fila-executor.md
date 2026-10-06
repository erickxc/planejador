# Fila de execução no Planejador — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arrastar um cartão para a **Fila** faz um agente executar a tarefa num ramo isolado. O cartão pulsa em Fazendo, vai para Revisar com resumo, testes e diff, e o usuário recebe uma notificação. **Postergar** para o agente na hora.

**Architecture:** A lógica pura fica em módulos novos, testados com `node:assert`, como o `quadro.mjs` já é:
- `fila.mjs`: regras de quem entra e quem é o próximo;
- `git.mjs`: cópia isolada, alterações, aceitar e descartar;
- `executor.mjs`: máquina de estados com agente, testes e notificação injetados.

O `vite.config.js` só liga o executor real (Claude + PowerShell) e expõe a API. A tela (`src/App.jsx`) ganha as colunas, o cartão em execução, o painel de revisão e as notificações.

**Tech Stack:** Node 24 (ESM), Vite 8 + React 19, `node:child_process` (git, claude, powershell), `node:assert`. Sem dependência nova.

**Spec:** `C:\projects\planejador\docs\specs\2026-10-06-fila-executor-design.md`

**Onde trabalhar:** `C:\projects\planejador` não é repositório git. Antes da Task 1, rodar `git init` e fazer um commit "estado inicial" com o que existe, para os commits do plano terem base. Os worktrees que o executor cria são dos **sistemas** (ex.: `C:\projects\transfer`), não do Planejador.

## Global Constraints

- Colunas, nesta ordem: `Entrada · Decidir · A fazer · Fila · Fazendo · Revisar · Postergar · Terceiros · Feito`.
- `Fila`, `Revisar` e `Postergar` só são gravadas no `.md` quando têm cartão.
- Estado no cartão: `exec: rodando | pronto | falhou | parado`, `ramo: fila/<id>`, `inicio: <aaaa-mm-ddThh:mm>`, guardados em `outros` na linha de meta.
- Histórico: `execucoes/<sistema>/<id>.json` na pasta do Planejador. Cópias: `worktrees/<sistema>/<id>`.
- Ramo: `fila/<id>`, criado do `HEAD` do ramo atual do sistema.
- Uma execução por vez em todo o Planejador.
- Limites: **30 minutos** por execução e **`--max-turns 80`**.
- Ferramentas do agente executor (lista fechada):
  - `Read`, `Grep`, `Glob`, `Edit`, `Write`;
  - `Bash(npm test:*)`, `Bash(npm run:*)`, `Bash(node:*)`;
  - `Bash(git status:*)`, `Bash(git diff:*)`, `Bash(git add:*)`, `Bash(git commit:*)`, `Bash(git log:*)`.

  Nunca push, merge ou `npm install`.
- A Fila recusa: `area: producao`, `area: terceiros`, `adiado`, categoria `ideia` e sistema sem `.git`.
- Testes depois do agente: o comando da linha `Testes:` do cabeçalho do quadro (o trecho entre crases); sem ela, `npm test`.
- Aceitar só com `git status --porcelain` vazio no sistema; conflito → `git merge --abort` e aviso.
- Atualização da tela: a cada 2 s com execução em andamento; senão, a cada 4 s (como hoje).

## Review Focus

1. **Planejador reiniciado no meio de uma execução:** um cartão com `exec: rodando` e sem processo vivo não pode ficar preso. Na partida, vai para Revisar como `parado`. (Task 4)
2. **Aceitar com alterações sem commit no sistema:** recusa com a mensagem "o ramo atual tem alterações sem commit" e não muda nada. (Task 3)
3. **Conflito no merge do Aceitar:** `git merge --abort`, o ramo do sistema fica como estava, e o ramo `fila/<id>` continua. (Task 3)
4. **Pasta com espaço** (ex.: `C:/projects/Carteira Web`): worktree, junção e git funcionam. (Task 3)
5. **Agente sem nenhum commit** (desistiu ou só leu): vai para Revisar como `falhou`, com o motivo "nenhum commit no ramo". (Task 4)

---

### Task 1: Colunas novas no quadro

**Files:**
- Modify: `quadro.mjs`: `COLUNAS` e `escrever()`
- Test: `quadro.check.mjs`

**Interfaces:**
- Produces:
  - `COLUNAS` com as 9 colunas na ordem global;
  - `NOVAS = ['Fila', 'Revisar', 'Postergar']` exportado;
  - `escrever(q)` omite as colunas de `NOVAS` vazias.

- [ ] **Step 1: Write the failing tests** (no fim de `quadro.check.mjs`)

```js
{
  const q = ler(md); // o md do topo do arquivo, sem as colunas novas
  assert.deepStrictEqual(q.colunas.slice(0, 9).map(c => c.nome), ['Entrada', 'Decidir', 'A fazer', 'Fila', 'Fazendo', 'Revisar', 'Postergar', 'Terceiros', 'Feito']);
  assert(!/## (Fila|Revisar|Postergar)/.test(escrever(q)), 'colunas novas vazias não vão para o arquivo');
  const q2 = mover(q, ler(md).colunas.flatMap(c => c.cartoes)[0].id, 'Fila');
  assert(/## Fila/.test(escrever(q2)), 'Fila com cartão vai para o arquivo');
  const c = ler('## Fazendo\n\n### T\n<!-- id: t · exec: rodando · ramo: fila/t · inicio: 2026-10-06T10:00 -->\n').colunas.find(x => x.nome === 'Fazendo').cartoes[0];
  assert.deepStrictEqual(c.outros, { exec: 'rodando', ramo: 'fila/t', inicio: '2026-10-06T10:00' });
  assert(escrever(ler('## Fazendo\n\n### T\n<!-- id: t · exec: rodando · ramo: fila/t · inicio: 2026-10-06T10:00 -->\n')).includes('exec: rodando · ramo: fila/t · inicio: 2026-10-06T10:00'));
}
console.log('ok colunas Fila, Revisar e Postergar');
```

- [ ] **Step 2: Run** `node quadro.check.mjs`. Expected: FAIL na ordem das colunas.
- [ ] **Step 3: Implement** a nova ordem de `COLUNAS`, o `NOVAS` e o `continue` em `escrever()` para coluna de `NOVAS` sem cartão.
- [ ] **Step 4: Run** `node quadro.check.mjs`. Expected: todas as linhas `ok`, inclusive a checagem dos quadros dos sistemas do `projetos.json` que já existe no arquivo.
- [ ] **Step 5: Commit** `git add quadro.mjs quadro.check.mjs && git commit -m "feat(quadro): colunas Fila, Revisar e Postergar"`

---

### Task 2: Regras da Fila (`fila.mjs`)

**Files:**
- Create: `fila.mjs`
- Test: `fila.check.mjs`; acrescentar `node fila.check.mjs` ao script `check` do `package.json`

**Interfaces:**
- Consumes: `ler`, `mover` de `quadro.mjs`.
- Produces:
  - `podeExecutar(cartao, { temGit }) -> { ok: boolean, motivo?: string }`;
  - `proximo(quadros) -> { projeto, cartao } | null`, onde `quadros` é `[{ projeto, quadro }]` na ordem do `projetos.json` e o resultado é o primeiro cartão da coluna `Fila` que pode executar;
  - `marcar(q, id, campos) -> quadro novo`, que mescla `campos` em `outros` (ex.: `{ exec: 'rodando', ramo: 'fila/x', inicio: '…' }`; valor `null` apaga o campo);
  - `comandoTestes(cabecalho) -> string`, que pega o trecho entre crases da linha que começa com `- Testes:`; padrão `'npm test'`.

- [ ] **Step 1: Write the failing tests** (`fila.check.mjs`)

```js
import assert from 'node:assert';
import { ler } from './quadro.mjs';
import { podeExecutar, proximo, marcar, comandoTestes } from './fila.mjs';
const c = (meta) => ler(`## Fila\n\n### X\n<!-- id: x · ${meta} -->\n`).colunas.find(k => k.nome === 'Fila').cartoes[0];
assert.deepStrictEqual(podeExecutar(c('categoria: bug'), { temGit: true }), { ok: true });
for (const [meta, motivo] of [['area: producao', /produção/], ['area: terceiros', /terceiros/], ['adiado', /adiado/], ['categoria: ideia', /ideia/]])
  assert.match(podeExecutar(c(meta), { temGit: true }).motivo, motivo);
assert.match(podeExecutar(c('categoria: bug'), { temGit: false }).motivo, /git/);
const q = ler('## Fila\n\n### Ideia\n<!-- id: i · categoria: ideia -->\n\n### Bom\n<!-- id: b -->\n');
assert.strictEqual(proximo([{ projeto: { id: 's', temGit: true }, quadro: q }]).cartao.id, 'b', 'pula o recusado');
assert.strictEqual(proximo([{ projeto: { id: 's', temGit: true }, quadro: ler('## A fazer\n\n### A\n') }]), null);
const m = marcar(q, 'b', { exec: 'rodando', ramo: 'fila/b' }), b = m.colunas.find(k => k.nome === 'Fila').cartoes[1];
assert.deepStrictEqual(b.outros, { exec: 'rodando', ramo: 'fila/b' });
assert.deepStrictEqual(marcar(m, 'b', { exec: null }).colunas.find(k => k.nome === 'Fila').cartoes[1].outros, { ramo: 'fila/b' });
assert.strictEqual(comandoTestes('**Regras:**\n- Testes: `npm test` (motor, carga e backend).'), 'npm test');
assert.strictEqual(comandoTestes('sem linha'), 'npm test');
console.log('ok regras da Fila');
```

- [ ] **Step 2: Run** `node fila.check.mjs`. Expected: FAIL (módulo inexistente).
- [ ] **Step 3: Implement** as quatro funções em `fila.mjs`. Motivos em pt-BR: "cartão de produção", "cartão de terceiros", "cartão adiado", "ideia não é tarefa de código", "o sistema não é um repositório git". `marcar` reaproveita a cópia profunda (`JSON.parse(JSON.stringify(q))`), como `quadro.mjs` já faz.
- [ ] **Step 4: Run** `npm run check`. Expected: `ok regras da Fila` e as checagens do quadro.
- [ ] **Step 5: Commit** `git add fila.mjs fila.check.mjs package.json && git commit -m "feat(fila): regras de quem entra e quem é o próximo"`

---

### Task 3: Cópia isolada e ações de git (`git.mjs`)

**Files:**
- Create: `git.mjs`
- Test: `git.check.mjs` (repositório git temporário em `os.tmpdir()`, num caminho **com espaço**); acrescentar ao script `check`

**Interfaces:**
- Produces (todas síncronas, via `execFileSync('git', [...], { cwd })`; erro de git vira `Error` com a mensagem do git):
  - `temGit(pasta) -> boolean`;
  - `prepararCopia({ pasta, id, dirCopias }) -> { copia, ramo, base }`:
    - cria `dirCopias/<id>` com `git worktree add <copia> -b fila/<id> HEAD`;
    - se o ramo `fila/<id>` já existe, reaproveita (com `git worktree add <copia> fila/<id>` se a cópia sumiu);
    - `base` = commit em que o ramo nasceu (`git merge-base HEAD fila/<id>`);
    - para cada `node_modules` existente na raiz e nas pastas dos `workspaces` do `package.json`, cria a junção na cópia com `cmd /c mklink /J`;
  - `alteracoes({ copia, base, ramo }) -> { commits: number, arquivos: [{ arq, mais, menos }], diff: string }`, com base em `git rev-list --count`, `git diff --numstat` e `git diff` de `base..ramo`;
  - `aceitar({ pasta, ramo, copia }) -> { ok: true } | { ok: false, motivo }`:
    - recusa se `git status --porcelain` não vier vazio ("o ramo atual tem alterações sem commit");
    - roda `git merge --no-ff ramo -m "Fila: <ramo>"`;
    - em conflito, roda `git merge --abort` e devolve o motivo "conflito ao juntar: <arquivos>";
    - com sucesso, chama `descartar`;
  - `descartar({ pasta, ramo, copia })`: `git worktree remove --force` e `git branch -D`. Desfaz as junções antes, para não apagar os `node_modules` originais.

- [ ] **Step 1: Write the failing tests** (`git.check.mjs`):
  - **repositório de teste:** `git init` num diretório temporário `"…/plan fila <random>"`, com `package.json` (`workspaces: ['app']`), `node_modules/x.txt`, `app/node_modules/y.txt`, `a.txt` e um commit.
  - `prepararCopia` → a cópia existe; `copia/node_modules/x.txt` e `copia/app/node_modules/y.txt` são lidos; `ramo === 'fila/t1'`.
  - **chamar de novo** → mesma cópia, sem erro.
  - **alteracoes:** commit de uma mudança em `a.txt` na cópia → `{ commits: 1, arquivos: [{ arq: 'a.txt', mais: 1, menos: 1 }] }`, e o `diff` contém `+novo`.
  - **aceitar com o sistema sujo** (`b.txt` sem commit na pasta) → `{ ok: false, motivo: /sem commit/ }`; depois de apagar `b.txt` → `{ ok: true }`, `a.txt` do sistema tem `novo`, a cópia e o ramo sumiram e `node_modules/x.txt` do sistema continua existindo.
  - **conflito:** sistema e cópia mudam a mesma linha → `{ ok: false, motivo: /conflito/ }`, e `git status --porcelain` do sistema vem vazio.
  - **descartar** → a cópia e o ramo sumiram e os `node_modules` originais continuam.
- [ ] **Step 2: Run** `node git.check.mjs`. Expected: FAIL (módulo inexistente).
- [ ] **Step 3: Implement** `git.mjs` com as funções acima.
- [ ] **Step 4: Run** `npm run check`. Expected: `ok git: cópia, alterações, aceitar, conflito e descartar`.
- [ ] **Step 5: Commit** `git add git.mjs git.check.mjs package.json && git commit -m "feat(fila): cópia isolada (worktree) e aceitar/descartar"`

---

### Task 4: Executor (`executor.mjs`) com agente falso

**Files:**
- Create: `executor.mjs`, `teste/agente-falso.mjs`
- Test: `executor.check.mjs` (repositório git temporário + quadro temporário); acrescentar ao script `check`

**Interfaces:**
- Consumes: Task 2 (`proximo`, `marcar`, `comandoTestes`), Task 3 (`temGit`, `prepararCopia`, `alteracoes`, `aceitar`, `descartar`), `ler`/`escrever`/`mover` do quadro.
- Produces: `criarExecutor(deps) -> { tick(): Promise<void>, parar(projetoId, id, motivo): void, estado(): EstadoAtual|null, historico(projetoId, id): Historico|null, aceitar(projetoId, id), ajustar(projetoId, id, texto), descartar(projetoId, id), recuperar(): void }`.
  - **`deps`:**
    - `projetos() -> [{ id, nome, pasta, quadro }]`;
    - `lerQuadro(p)`, `gravarQuadro(p, q)`;
    - `rodarAgente({ copia, cartao, projeto, pedido, onPasso }) -> { pronto: Promise<{ ok, resumo }>, matar() }`;
    - `rodarTestes({ copia, comando }) -> Promise<{ ok, saida }>`;
    - `notificar({ projeto, cartao, status })`;
    - `agora() -> number`;
    - `dir` (pasta do Planejador);
    - `limiteMs` (padrão 30 × 60 × 1000).
  - **`EstadoAtual`** = `{ projeto, id, titulo, inicio, passo, passos: string[] }`.
  - **`Historico`** = `{ id, titulo, ramo, base, rodadas: [{ inicio, fim, status, resumo, passos, testes: { ok, saida }, arquivos, diff, ajuste? }] }`, gravado em `dir/execucoes/<projeto>/<id>.json`.
- **Ciclo do `tick()`:**
  1. Se há execução e o cartão dela **não está mais em Fazendo** (foi para Postergar), chama `parar(…, 'postergado')`.
  2. Se há execução e passou de `limiteMs`, encerra como `parado` ("tempo esgotado").
  3. Sem execução, busca `proximo(...)`:
     - roda `prepararCopia` e move o cartão para `Fazendo` com `marcar({ exec: 'rodando', ramo, inicio })`;
     - inicia `rodarAgente`. O `pedido` leva o título, o corpo do cartão e o último ajuste, se houver.
  4. Quando o agente termina:
     - roda `rodarTestes` com `comandoTestes(q.cabecalho)` e depois `alteracoes`;
     - status: `pronto` se `ok && testes.ok && commits > 0`; senão `falhou`, com o motivo (ex.: "nenhum commit no ramo", "testes falharam");
     - grava a rodada no histórico, move para `Revisar` com `exec: <status>` e chama `notificar`.
- **`parar`:** chama `matar()`, grava a rodada como `parado` e põe `exec: parado` no cartão. A cópia e o ramo ficam. Se o cartão ainda está em Fazendo (botão Parar), move para Postergar.
- **`aceitar`:** `git.aceitar`. Com sucesso, move para `Feito`, apaga `exec`, `ramo` e `inicio` e acrescenta ao corpo "Feito pela Fila em dd/mm (ramo fila/<id>)." Com falha, devolve o motivo e o cartão fica.
- **`ajustar`:** acrescenta "Ajuste pedido em dd/mm: <texto>" ao corpo e move para `Fila` (o ramo fica).
- **`descartar`:** `git.descartar`, apaga `exec`, `ramo` e `inicio` e move para `A fazer`.
- **`recuperar()`** (chamar na partida): todo cartão com `exec: rodando` vira `parado`, vai para Revisar e ganha uma rodada "o Planejador reiniciou no meio da execução".
- **`teste/agente-falso.mjs <copia> <modo>`:** `ok` acrescenta uma linha a `a.txt` e faz commit; `nada` termina sem commit; `lento` espera 60 s.

- [ ] **Step 1: Write the failing tests** (`executor.check.mjs`). O `rodarAgente` injetado chama `node teste/agente-falso.mjs` e o `rodarTestes` injetado devolve `{ ok: true, saida: 'ok' }`. Casos:
  - **Fila → tick** → cartão em Fazendo com `exec: rodando`, `estado().id === 'x'` → ao terminar, em `Revisar` com `exec: pronto`, histórico com `commits: 1` e `notificar` chamado uma vez com `status: 'pronto'`.
  - **modo `nada`** → Revisar com `exec: falhou` e motivo `/nenhum commit/`.
  - **modo `lento`:** mover o cartão para `Postergar` e chamar `tick()` → processo encerrado, `exec: parado`, o ramo `fila/x` continua.
  - **`limiteMs: 200` com `lento`** → `parado`, motivo `/tempo esgotado/`.
  - **dois cartões na Fila** → só um em Fazendo por vez.
  - **`recuperar()`** com um cartão `exec: rodando` no quadro e nenhum processo → vai para Revisar como `parado`.
  - **`aceitar`** → Feito, sem `exec`, e o corpo contém "Feito pela Fila". **`ajustar`** → Fila, com o corpo contendo "Ajuste pedido". **`descartar`** → A fazer, sem o ramo.
- [ ] **Step 2: Run** `node executor.check.mjs`. Expected: FAIL (módulo inexistente).
- [ ] **Step 3: Implement** `executor.mjs` e `teste/agente-falso.mjs`.
- [ ] **Step 4: Run** `npm run check`. Expected: `ok executor: ciclo, falha, postergar, tempo, um por vez, recuperar, aceitar/ajustar/descartar`.
- [ ] **Step 5: Commit** `git add executor.mjs executor.check.mjs teste/agente-falso.mjs package.json && git commit -m "feat(fila): executor com agente falso testado"`

---

### Task 5: Agente executor, notificação do Windows e API

**Files:**
- Create: `agente/executor.md`, `notificar.mjs`
- Modify: `vite.config.js` (liga o executor real e acrescenta as rotas)

**Interfaces:**
- Consumes: `criarExecutor` (Task 4), `podeExecutar` e `temGit` (Tasks 2 e 3).
- Produces:
  - **API para a Task 6:**
    - `GET /api/execucao` → `EstadoAtual | null`;
    - `GET /api/execucao/historico?p=<sistema>&id=<id>` → `Historico`;
    - `POST /api/execucao/parar|aceitar|ajustar|descartar` com `{ projeto, id, texto? }` → `{ ok, motivo? }`;
    - `POST /api/mover` para `Fila` com cartão recusado → `400 { erro: <motivo de podeExecutar> }`.
  - **`notificarWindows({ titulo, texto })`** em `notificar.mjs`: notificação do Windows por PowerShell com a API `Windows.UI.Notifications` (ToastText02, AppId do PowerShell), sem instalar nada; falha em silêncio.

- [ ] **Step 1: Escrever `agente/executor.md`** (mesmo formato de frontmatter do `planejador.md`: `description`, `tools`). As instruções:
  - fazer **só** o cartão;
  - ler o `CLAUDE.md` e o cabeçalho do quadro (as regras do sistema, ex.: pastas proibidas);
  - rodar o comando de testes e fazer commit no ramo atual (`fila/<id>`);
  - nunca push, merge nem `npm install`;
  - terminar com um resumo de até 10 linhas (o que mudou, em quais arquivos, o que ficou de fora e por quê);
  - se o pedido tiver "Ajuste pedido", tratar o ajuste por cima do que já está no ramo.
- [ ] **Step 2: Implementar `rodarAgente` real em `vite.config.js`**, reaproveitando `definicaoAgente()` e o leitor de `stream-json` que já existem:
  - `spawn(CLAUDE, ['-p', pedido, '--agent', 'executor', '--agents', JSON.stringify(def), '--permission-mode', 'acceptEdits', '--max-turns', '80', '--allowedTools', ...FERRAMENTAS_EXECUTOR, '--output-format', 'stream-json', '--verbose'], { cwd: copia })`;
  - `matar()` usa `taskkill /pid <pid> /T /F` (mata a árvore no Windows);
  - `rodarTestes` usa `spawn(comando, { cwd: copia, shell: true })` e guarda as últimas 200 linhas.
  - Com a variável de ambiente `PLANEJADOR_AGENTE_FALSO=1`, `rodarAgente` roda `node teste/agente-falso.mjs <copia> ok` no lugar do Claude (para ensaiar a tela sem gastar uso).
- [ ] **Step 3: Ligar** `criarExecutor` com `setInterval(() => executor.tick(), 5000)` e `executor.recuperar()` na partida do servidor. Acrescentar as rotas acima e a recusa no `/api/mover`.
- [ ] **Step 4: Verify:**
  - `npm run check` passa;
  - `npm run dev` sobe sem erro;
  - `curl http://localhost:5180/api/execucao` → `null`;
  - mover um cartão `categoria: ideia` para a Fila por `POST /api/mover` → `400` com "ideia não é tarefa de código";
  - `node -e "import('./notificar.mjs').then(m => m.notificarWindows({ titulo: 'Teste', texto: 'Fila' }))"` mostra a notificação do Windows.
- [ ] **Step 5: Commit** `git add agente/executor.md notificar.mjs vite.config.js && git commit -m "feat(fila): agente executor real, notificação do Windows e API"`

---

### Task 6: Tela — colunas, cartão em execução, revisão e notificação

**Files:**
- Modify: `src/App.jsx`, `src/estilo.css`
- Create: `src/Revisao.jsx` (painel de revisão)

**Interfaces:**
- Consumes: a API da Task 5.
- Produces: interface. Nada mais depende dela.

- [ ] **Step 1: Colunas.**
  - `DICA_COLUNA`: Fila "o agente faz, um por vez"; Revisar "pronto para você revisar"; Postergar "parado: o agente não pega".
  - Postergar com borda e título vermelhos.
  - Soltar na Fila e receber `400` mostra o motivo no aviso de erro que já existe.
- [ ] **Step 2: Cartão em execução.**
  - **Fonte:** `GET /api/execucao` a cada 2 s enquanto não for `null` (senão, a cada 4 s).
  - **Visual:** o cartão com `projeto + id` igual ao estado ganha a classe `executando` (borda pulsando, animação CSS de 1,6 s), o selo "executando há N min" (o `Rodando` que já existe) e o `passo` atual numa linha.
  - **Botão "Parar":** `POST /api/execucao/parar`.
  - **Selos:** cartões com `exec: pronto | falhou | parado` mostram um selo verde, vermelho ou cinza.
  - **Gravidade em vermelho** (todos os cartões, em qualquer coluna): classe `grav-alta` para `prioridade: alta` ou `exec: falhou`, e `grav-media` para `prioridade: media`.
    - `grav-alta`: fundo `#FDECEC` e faixa de 4 px `#D14343` à esquerda;
    - `grav-media`: fundo `#FFF5F5` e faixa de 4 px `#EFA3A3`;
    - baixa ou sem prioridade: sem mudança.

    O pulsar azul de `executando` fica por cima da cor de gravidade.
- [ ] **Step 3: Painel de revisão (`Revisao.jsx`).**
  - **Abertura:** clicar num cartão em Revisar abre o painel no lugar da gaveta, com o `GET …/historico` da última rodada.
  - **Conteúdo:**
    - resumo;
    - tempo e número de passos;
    - testes (ok ou falha, com as últimas 20 linhas e "ver tudo");
    - arquivos (+/−);
    - diff por arquivo, recolhível: `+` em verde, `−` em vermelho e `@@` em cinza;
    - rodadas anteriores numa lista curta.
  - **Botões:**
    - **Aceitar:** mostra o `motivo` se vier `ok: false`;
    - **Pedir ajuste:** textarea com o texto obrigatório;
    - **Descartar:** com `confirm()`.
- [ ] **Step 4: Notificação na tela.**
  - **Permissão:** `Notification.requestPermission()` no primeiro clique do usuário na página.
  - **Quando dispara:** quando o estado sai de "executando" e o cartão aparece em Revisar, mostra `new Notification('✓ <título>', { body: 'pronto para revisar' })` (`✗` e "falhou" ou "parado", conforme o status).
  - **Som:** um bip curto com a Web Audio API, sem arquivo.
  - **Aba:** `document.title = '(n) Planejador'`, com n = cartões em Revisar ainda não abertos; zera ao abrir.
  - **Clique na notificação:** foca a janela e abre o painel de revisão do cartão.
- [ ] **Step 5: Verify** com o agente falso, sem gastar uso: `PLANEJADOR_AGENTE_FALSO=1 npm run dev` (Task 5, Step 2). Depois, num quadro de teste:
  - arrastar para a Fila → pulsa em Fazendo com o passo;
  - termina → notificação, aba "(1) Planejador";
  - painel com o diff;
  - **Aceitar** → Feito;
  - repetir com **Pedir ajuste** e com **Descartar**;
  - arrastar um em execução para **Postergar** → para na hora.
- [ ] **Step 6: Commit** `git add src && git commit -m "feat(fila): tela da Fila, cartão em execução, revisão e notificações"`

---

## Fora do plano (decisão da spec)

Execução em paralelo, push e PR, edição de código pela tela e sistemas sem git.
