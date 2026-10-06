# Fila de execução no Planejador

**Data:** 06/10/2026
**Status:** desenho aprovado na conversa; esperando revisão desta especificação

## Objetivo

Arrastar um cartão para a coluna **Fila** autoriza um agente a fazer a tarefa sozinho, num ramo separado.

O usuário:
- acompanha ao vivo o que o agente está fazendo;
- é notificado quando ele termina;
- revisa o resumo, os testes e as alterações no código antes de aceitar.

Arrastar para **Postergar** para o agente na hora.

**Sucesso:**
- Um cartão da Fila sai, sem ninguém mexer, num ramo `fila/<id>` com commit e testes rodados.
- O cartão pulsa em Fazendo mostrando o passo atual.
- O usuário recebe uma notificação e, no painel de revisão, vê o resumo, os testes e o diff. Com um clique, ele aceita, pede ajuste ou descarta.

## Decisões tomadas

| Decisão | Escolha |
|---|---|
| O que dispara | arrastar para a coluna **Fila** (Fazendo continua sendo do usuário também) |
| Até onde o agente vai | **ramo separado e para**: trabalha numa cópia isolada (git worktree), faz commit no ramo `fila/<id>` e para em Revisar. Nunca faz push, nunca junta ramos |
| Parar na hora | arrastar para a coluna **Postergar** (vermelha) |
| Aviso | notificação do navegador e notificação do Windows |

## Colunas

`Entrada · Decidir · A fazer · Fila · Fazendo · Revisar · Postergar · Terceiros · Feito`

- **Onde:** `COLUNAS` em `quadro.mjs` ganha `Fila`, `Revisar` e `Postergar`.
- **Quadros antigos:** um quadro sem essas colunas continua válido. Elas aparecem vazias e só são gravadas no arquivo quando ganham cartão.
- **Postergar:** fica em vermelho na tela (borda e título).

### Ciclo de um cartão

```
A fazer ──arrasta──▶ Fila ──executor pega──▶ Fazendo (pulsando)
                                               │
                         termina / falha / tempo esgotado
                                               ▼
                                            Revisar ──Aceitar──▶ Feito
                                               │ └──Pedir ajuste──▶ Fila (mesmo ramo)
                                               └──Descartar──▶ A fazer (ramo e cópia apagados)

Fila ou Fazendo ──arrasta──▶ Postergar   (Fazendo: o agente é encerrado na hora; o ramo fica)
Postergar ──arrasta──▶ Fila              (retoma no mesmo ramo, se existir)
```

### Cartões que a Fila recusa

O cartão volta para a coluna de onde veio, com um aviso na tela, quando:
- tem `area: producao` ou `area: terceiros`;
- tem a marca `adiado`;
- é da categoria `ideia`;
- o sistema não é um repositório git (sem git, não dá para isolar o trabalho em ramo).

## Estado da execução no cartão

- **Onde fica:** na linha de meta do cartão, `<!-- … -->`, que já existe e aceita campos extras (`outros`).
- **Campos:**
  - `exec: rodando | pronto | falhou | parado`;
  - `ramo: fila/<id>`;
  - `inicio: <aaaa-mm-ddThh:mm>`.
- **Histórico completo:** fica em `execucoes/<sistema>/<id>.json`, na pasta do Planejador, e sobrevive a reinícios. Ele guarda:
  - os passos;
  - o resumo do agente;
  - o resultado e a saída dos testes;
  - os arquivos alterados;
  - o commit-base;
  - as rodadas anteriores, em caso de ajuste.

## Executor (servidor do Planejador)

Módulo novo `executor.mjs`, ligado ao `vite.config.js` como o agente planejador já é.

### Laço

- **Frequência:** a cada 5 segundos.
- **Um por vez em todo o Planejador:** só começa uma execução se não houver nenhuma em andamento. Isso evita custo em paralelo e dois agentes no mesmo código.
- **Ordem:** pega o primeiro cartão da Fila, na ordem do quadro e na ordem dos sistemas do `projetos.json`.

### Preparar

1. Ler o ramo atual e o commit `HEAD` do sistema.
2. Criar a cópia isolada: `git worktree add <planejador>/worktrees/<sistema>/<id> -b fila/<id> <HEAD>`.
   - Se o ramo `fila/<id>` já existir (retomada ou ajuste), reaproveitar o ramo e a cópia.
3. Ligar as dependências: cada `node_modules` do repositório principal (o da raiz e os dos workspaces, ex.: `frontend/`, `backend/`) ganha, na cópia, uma junção do Windows (`mklink /J`) apontando para ele. Assim não instala nada.
4. Mover o cartão para **Fazendo**, com `exec: rodando`.

### Agente executor (`agente/executor.md`)

- **Comando:** `claude -p` com `--agent executor`, na pasta da cópia isolada, com `--permission-mode acceptEdits` e `--max-turns` (teto de interações).
- **Ferramentas liberadas:** `Read`, `Grep`, `Glob`, `Edit`, `Write`, `Bash(npm test:*)`, `Bash(npm run:*)`, `Bash(node:*)`, `Bash(git status:*)`, `Bash(git diff:*)`, `Bash(git add:*)`, `Bash(git commit:*)`, `Bash(git log:*)`.
- **Fora da lista:** `git push`, `git merge`, `npm install` e acesso à rede.
- **Instruções do agente:**
  - fazer **só** o que o cartão pede;
  - seguir o `CLAUDE.md` do sistema e as regras do cabeçalho do quadro (ex.: no Transfer, nunca abrir `analises/`, as bases nem os `.parquet`);
  - rodar os testes do sistema, fazer commit no ramo `fila/<id>` e terminar com um resumo curto: o que mudou, onde e o que ficou de fora;
  - no ajuste, ler o pedido de ajuste anexado ao cartão.
- **Progresso:** os passos chegam pelo `stream-json`, como no planejador, e são guardados no estado e no histórico.

### Terminar

1. **Testes por conta própria:** o Planejador roda os testes do sistema na cópia. O comando vem do cabeçalho do quadro, linha "Testes:", e o padrão é `npm test`. Vale este resultado, e não o que o agente disse.
2. **Alterações:** `git diff --stat <base>..fila/<id>` e o diff completo, guardados no histórico.
3. **Status:**
   - `pronto`: agente terminou e testes passaram;
   - `falhou`: erro, testes falhando ou nenhum commit;
   - `parado`: tempo esgotado.
4. Mover para **Revisar** e disparar a notificação.

### Limites

- **Tempo:** 30 minutos por execução. Passou disso, o processo é encerrado, o cartão vai para Revisar como `parado`, e o que foi feito fica no ramo.
- **Interações:** `--max-turns` 80.
- **Postergar:** quando um cartão em execução vai para Postergar, o processo é encerrado na hora, o ramo e a cópia ficam, e o cartão ganha `exec: parado`.

## Tela

### Cartão em Fazendo (executando)
- **Visual:** borda pulsando, selo "executando há 4 min" e o **passo atual** embaixo do título (ex.: "editando Tabela.jsx", "rodando npm test").
- **Atualização:** a tela relê o estado a cada 2 segundos enquanto houver execução; sem execução, a cada 4 segundos, como hoje.
- **Botão Parar:** faz o mesmo que arrastar para Postergar.

### Gravidade em vermelho (todos os cartões)
- **Prioridade alta, ou execução que falhou:** fundo vermelho-claro e faixa vermelha forte à esquerda.
- **Prioridade média:** fundo levemente rosado e faixa vermelha suave.
- **Baixa ou sem prioridade:** como hoje.
- **Execução:** o pulsar azul do cartão em execução fica por cima dessa cor.

### Painel de revisão (clicar num cartão em Revisar)
- **Resumo do agente**, com o tempo e o número de passos.
- **Testes:** passou ou falhou, com a saída (as últimas linhas, e a saída completa se o usuário expandir).
- **Arquivos alterados:** lista com +/− linhas.
- **Alterações:** diff por arquivo, com linhas adicionadas em verde e removidas em vermelho, recolhível por arquivo.
- **Ações:**
  - **Aceitar:** `git merge --no-ff fila/<id>` no ramo atual do sistema, **só** se ele não tiver alterações sem commit. Se tiver, avisa e não faz nada. Depois do merge, apaga a cópia e o ramo, e o cartão vai para Feito com "feito pela Fila em dd/mm, ramo fila/<id>".
  - **Pedir ajuste:** caixa de texto. O texto entra no corpo do cartão ("Ajuste pedido em dd/mm: …"), e o cartão volta para a Fila no mesmo ramo.
  - **Descartar:** apaga a cópia e o ramo, e o cartão volta para A fazer.

### Notificação
- **Navegador:**
  - pede permissão uma vez;
  - ao virar `pronto`, `falhou` ou `parado`, mostra uma notificação ("✓ <título>: pronto para revisar" / "✗ <título>: falhou");
  - toca um som curto e põe um contador no título da aba ("(1) Planejador");
  - clicar na notificação abre o painel de revisão.
- **Windows:** o servidor dispara também uma notificação do Windows por PowerShell (sem instalar nada), para avisar com o navegador fechado ou minimizado.

## Fora do escopo

- Executar vários cartões ao mesmo tempo.
- Push, abrir PR ou juntar no `main`.
- Executar cartões de sistemas sem git.
- Editar o código da revisão pela tela: ajustes são pedidos ao agente ou feitos à mão no ramo.
- Prioridade ou agendamento além da ordem da Fila.

## Testes

- **`quadro.check.mjs`:**
  - as três colunas novas;
  - um quadro antigo, sem elas, continua válido;
  - os campos `exec`, `ramo` e `inicio` passam por ler + escrever sem mudar.
- **`executor.check.mjs`** (novo):
  - escolha do próximo cartão;
  - cartões recusados (produção, terceiros, adiado, ideia, sistema sem git);
  - Postergar encerra a execução.
- **Ensaio completo com agente falso** (um script que edita um arquivo e faz commit, sem gastar uso), num repositório git de teste: Fila → Fazendo → Revisar → Aceitar, e de novo → Descartar. Confere o ramo, a cópia, o merge e a limpeza.

## Riscos

- **Custo:** cada execução é uma sessão do Claude. Os limites são um por vez, 30 minutos e 80 interações.
- **Código errado aceito:** a barreira é a revisão. Aceitar exige um clique do usuário, e os testes rodados pelo próprio Planejador aparecem antes.
- **Conflito no Aceitar:** se o ramo do usuário andou e o merge der conflito, o merge é cancelado (`git merge --abort`). O painel avisa e o ramo `fila/<id>` continua disponível para juntar à mão.
- **Dados de clientes:** o agente segue as regras do cabeçalho do quadro. No Transfer, a cópia isolada não tem `frontend/public/bases/` nem `analises/`, porque essas pastas estão no `.gitignore` e não vão para o worktree.
