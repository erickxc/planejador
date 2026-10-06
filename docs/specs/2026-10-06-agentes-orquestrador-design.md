# Agentes de fase e orquestrador no Planejador

**Data:** 06/10/2026
**Status:** desenho aprovado na conversa; esperando revisão desta especificação
**Depende de:** `2026-10-06-fila-executor-design.md` (Fila, executor, Revisar, Postergar, notificação). Aquela parte é construída primeiro.

## Objetivo

O quadro trabalha sozinho em segundo plano:
- um **agente por coluna** confere e completa o conteúdo dos cartões;
- um **orquestrador** prioriza, coloca na Fila e acompanha a execução e a revisão, em todos os sistemas com git.

O usuário só é chamado quando algo **precisa dele**, por notificação do Windows, e continua sendo **o único que aceita** (junta) um trabalho no ramo.

**Sucesso:**
- Os cartões de A fazer ficam prontos para executar, com objetivo, onde mexer e como saber que terminou.
- O orquestrador executa até 10 por dia, um por vez, e cada um chega em Revisar com o parecer do revisor.
- O usuário recebe notificações críticas só para o que trava e notificações normais para o que está pronto.

## Decisões tomadas

| Decisão | Escolha |
|---|---|
| Autonomia | o orquestrador **prioriza e executa**; **aceitar é sempre do usuário**; nunca push |
| Ritmo | **contínuo**, até **10 execuções por dia** (contando todos os sistemas), uma por vez |
| Sistemas | **todos os do `projetos.json` que são repositórios git** |
| Chamar o usuário | notificação do Windows: **crítica** (fica na tela até clicar, com som) ou **aviso** (normal) |

## Agentes por fase

Cada agente roda num cartão de uma coluna e **acrescenta ou atualiza** um bloco no fim do corpo do cartão, sem mexer no texto do usuário:

```
**Análise do agente (<coluna>, dd/mm hh:mm):**
- …
```

Se o bloco já existe, é substituído. O resultado também vai para a linha de meta do cartão (campos em `outros`).

| Coluna | O agente confere | Campos na meta |
|---|---|---|
| **Entrada** | se é novo ou repetido (compara com os cartões do sistema e com o `git log`); categoria, prioridade e área | `sugere: <coluna>` e, se for o caso, `duplicado: <id>` |
| **Decidir** | as opções, os prós e contras de cada uma e **a pergunta objetiva** que só o usuário responde | `pergunta: sim` |
| **A fazer** | se está **pronto para executar**: objetivo claro, onde mexer (arquivos), como saber que terminou e riscos. Completa o que der lendo o código | `pronto: sim` ou `pronto: nao` |
| **Revisar** | o diff do ramo `fila/<id>` contra o pedido: fez o que pediu, não fez além, os testes cobrem, nada de dados de clientes nem de segurança | `revisao: aprovado`, `revisao: ajustar` ou `revisao: reprovar`; `risco: dados` ou `risco: seguranca` quando houver |

- **Fora:** Fila, Fazendo, Postergar, Terceiros e Feito não têm agente de fase.
- **Ferramentas:** só leitura: `Read`, `Grep`, `Glob`, `Bash(git log:*)`, `Bash(git diff:*)`, `Bash(git show:*)`. Quem grava o cartão é o Planejador, a partir da resposta do agente.
- **Formato da resposta:** um JSON no fim: `{ "bloco": "<markdown>", "meta": { … }, "critico": "<texto ou vazio>" }`. Uma resposta fora desse formato faz a análise ser descartada e registrada como erro.
- **Regras do sistema:** os agentes seguem o cabeçalho do quadro e o `CLAUDE.md` (ex.: no Transfer, nunca abrir `analises/`, as bases nem os `.parquet`).
- **Modelo:** mais leve que o do executor (`--model sonnet`), com `--max-turns 20`.
- **Quando rodam:** só em cartão **novo ou alterado** desde a última análise. A meta guarda `analisado: <hash>`, com `hash` = os 8 primeiros caracteres do SHA-1 de título + corpo **sem o bloco do agente**. Se o hash não mudou, não roda.

## Orquestrador

Um ciclo **em segundo plano**, no servidor do Planejador:
- começa assim que o anterior termina;
- espera 2 minutos entre ciclos quando não há nada a fazer;
- não roda com o orquestrador pausado.

### Ciclo
1. **Fase:** para cada sistema com git, roda os agentes de fase nos cartões novos ou alterados das colunas Entrada, Decidir, A fazer e Revisar, um agente por vez.
2. **Revisar → ajuste:**
   - um cartão em Revisar com `revisao: ajustar` e `ajustes` < 1 volta para a Fila com o pedido do revisor ("Ajuste pedido pelo revisor em dd/mm: …") e ganha `ajustes: 1`;
   - com `ajustes` ≥ 1, fica em Revisar e gera aviso **crítico** "falhou duas vezes".
3. **Priorizar:** se não há execução em andamento, o executor está livre e o limite do dia não foi atingido:
   - o **agente orquestrador** recebe a lista de cartões `pronto: sim` de A fazer (de todos os sistemas, com título, prioridade, categoria, área e o trecho do rumo de cada sistema);
   - ele devolve a ordem em JSON: `[{ "projeto", "id", "motivo" }]`;
   - o primeiro que a Fila aceita (`podeExecutar`) vai para a **Fila**, com `prioridade-motivo: <motivo>` na meta.
4. O **executor** (parte 1) faz o resto: Fazendo → Revisar.

### Critérios de prioridade (instruções do agente orquestrador)
- gravidade (prioridade alta primeiro);
- o que destrava outros cartões;
- prazos escritos no cartão (ex.: "19/10");
- o próximo passo do rumo do planejador;
- o sistema em foco (`foco: true`) desempata.

Cartões `adiado` e os recusados pela Fila nunca entram.

### Limite e controles
- **Limite:** 10 execuções por dia (das 00h às 24h), contando as que **começaram**.
- **Estado:** `orquestrador.json`, na pasta do Planejador, guarda `{ pausado, dia, execucoesHoje, ultimoCiclo }` e sobrevive a reinícios.
- **Na tela:**
  - botão **Pausar / Retomar orquestrador**. Pausar não interrompe a execução em andamento (para isso, Postergar);
  - contador "**N de 10 hoje**";
  - o que o orquestrador está fazendo agora ("analisando 3 cartões do Transfer", "priorizando", "esperando o executor").

## Notificações e Caixa de avisos

- **Crítico:** fica na tela até clicar, com som. É disparado quando:
  - uma **decisão** trava trabalho: há cartão em Decidir com `pergunta: sim` **e** cartão em A fazer, do mesmo sistema, cujo corpo cita aquele cartão de Decidir;
  - um cartão **falhou duas vezes** (execução ou revisão);
  - houve **conflito** no Aceitar, ou o ramo do sistema tem alterações sem commit e impede aceitar;
  - o revisor marcou `risco: dados` ou `risco: seguranca`;
  - os testes do **ramo principal** de um sistema estão vermelhos. O orquestrador roda o comando de testes na pasta do sistema uma vez por dia e depois de cada Aceitar;
  - um agente devolveu `critico` não vazio (precisa de credencial, dado ou acesso que só o usuário tem).
- **Aviso:** some sozinho. É disparado quando:
  - um cartão foi para Revisar com `revisao: aprovado` (pronto para você aceitar);
  - o limite do dia foi atingido.
- **Caixa de avisos:** painel no Planejador com todos os avisos (data, sistema, cartão, nível e texto), guardados em `avisos.json`, com "marcar como lido". Clicar abre o cartão.
- **Notificação do Windows:** pelo `notificar.mjs` da parte 1. O crítico usa a duração longa e um som de alarme (`scenario="reminder"` no XML da notificação).

## Fora do escopo

- Aceitar sozinho, push, PR.
- Agentes de fase em Fila, Fazendo, Postergar, Terceiros e Feito.
- Execução em paralelo.
- Sistemas sem git: o quadro funciona, mas o orquestrador não executa nem analisa.

## Testes

Todos com agentes falsos (scripts que devolvem o JSON combinado), sem gastar uso:
- **`fase.check.mjs`:**
  - o bloco do agente é acrescentado e depois substituído, sem mexer no texto do usuário;
  - o hash ignora o bloco do agente (cartão sem mudança não roda de novo);
  - resposta fora do formato é descartada;
  - a meta de cada coluna é gravada.
- **`orquestrador.check.mjs`:**
  - prioriza e move só um para a Fila;
  - respeita os 10 por dia;
  - pausado não move;
  - ajuste do revisor volta à Fila uma vez e, na segunda, gera aviso crítico;
  - decisão travando gera aviso crítico;
  - `critico` de um agente gera aviso crítico;
  - recusados pela Fila são pulados.
- **`avisos.check.mjs`:** grava e lê `avisos.json`; separa crítico de aviso; marca como lido.

## Riscos

- **Custo:** até 10 execuções por dia, mais as análises de fase (só no que mudou, com modelo mais leve) e as rodadas do orquestrador (só quando o executor está livre). O contador e o Pausar ficam sempre à vista.
- **Agente de fase reescrever o que não devia:** ele só devolve o bloco e a meta, e quem grava é o Planejador, sempre no fim do corpo. O texto do usuário nunca é passado de volta para gravação.
- **Prioridade ruim:** o motivo fica escrito no cartão. Postergar e Pausar corrigem na hora.
- **Vários sistemas ao mesmo tempo:** continua um por vez no total, e cada execução fica na cópia isolada do próprio sistema.
