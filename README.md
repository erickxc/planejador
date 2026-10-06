# Planejador

Quadro kanban das pendências de **todos os sistemas**, com um agente que procura o que ficou para trás e aponta o rumo.

```
npm install
npm run dev        # http://localhost:5180
```

## Como funciona
- **`projetos.json`** — a lista dos sistemas: `id`, `nome`, `pasta` e, se quiser, `quadro` e `rumo` (caminhos relativos à pasta do sistema) e `foco: true` para o sistema da vez.
  - Com `quadro`: o quadro mora no repositório do sistema (ex.: o Transfer usa `docs/PENDENCIAS.md`).
  - Sem `quadro`: o quadro fica aqui, em `quadros/<id>.md`, e o rumo em `rumos/<id>.md` — nada é escrito no repositório do sistema.
- **O quadro é Markdown**: `##` = coluna (Entrada, Decidir, A fazer, Fazendo, Terceiros, Feito), `###` = cartão, e a linha `<!-- id · categoria · prioridade · area -->` logo abaixo do título. Categorias: implementação, melhoria, ideia, plano, bug, erro, problema, pesquisa, documentação. Dá para editar à mão; o quadro relê a cada 4 s. O cabeçalho do quadro pode trazer regras do sistema (pastas proibidas, ambiente) que o agente segue.
- **O agente** está em `agente/planejador.md`. O botão "Pedir rumo" roda `claude -p --agent planejador` **dentro da pasta do sistema**, passando a definição do agente por `--agents` e os caminhos do quadro e do rumo. Ele só acrescenta cartões na coluna **Entrada** e reescreve o rumo; não mexe em código nem faz commit.
- `npm run instalar-agente` copia o agente para `~/.claude/agents`, para usar o "planejador" também numa conversa do Claude Code em qualquer sistema.

## Adicionar um sistema
Acrescente uma linha no `projetos.json` (`{ "id": "novo", "nome": "Novo", "pasta": "C:/projects/novo" }`). Ele aparece nos filtros de sistema, no topo; o quadro começa vazio e o primeiro "Pedir rumo" faz o levantamento inicial.
