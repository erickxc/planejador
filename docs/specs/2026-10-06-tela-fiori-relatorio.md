# Tela do Planejador no SAP Fiori — relatório da implementação

**Data:** 06/10/2026 · **Ramo:** `feat/fiori` · **Especificação:** `2026-10-06-tela-fiori-design.md`

## Componentes por parte da tela
| Parte | Componentes (`@ui5/webcomponents-react` 2.27) |
|---|---|
| Topo | `ShellBar` (título "Planejador", subtítulo "N em aberto · M para revisar"), `ShellBarSearch` (busca), botão `Button` Emphasized "Planejar a Fila · <sistema>" no slot `content`, `ShellBarItem` para mostrar/recolher o rumo e para o tema claro/escuro, `Button` "menu" no `startButton` (recolhe a lista de sistemas) |
| Filtros | `Toolbar` com `SegmentedButton` (seleção múltipla) das categorias com contagem, `ToolbarButton` "Todas as categorias" (aparece com filtro ativo) e `ToolbarSelect` da área |
| Sistemas | `SideNavigation` com `SideNavigationGroup` "Em foco" / "Sistemas", `SideNavigationItem` (olho aberto = visível, olho riscado = escondido; `Tag` com o número em aberto ou "planejando"); "Mostrar todos" no topo; Ctrl+clique deixa só aquele sistema |
| Executor | bloco sob a lista: `Label`, `ObjectStatus` (Executando há N / Livre), `Text` com cartão e passo |
| Coluna | `Card` + `CardHeader` (título, dica, contagem em `additionalText`, Fazendo "n/1", `Button` "+" no `action`) |
| Coluna vazia | `IllustratedMessage` `EmptyList` `design="Dot"` "Arraste um cartão para cá" |
| Cartão | bloco próprio arrastável (HTML5) dentro do Card: `Title`, `Text` (resumo em 2 linhas), `Tag` (sistema, categoria, área, adiado, planejador), `ObjectStatus` (prioridade Alta=Negative, Média=Critical; exec pronto=Positive, falhou=Negative, parado=None), lixeira `Button` Transparent `delete` no hover |
| Executando | `BusyIndicator` S + `Tag` "executando há N" + `Button` "Parar" + `Text` do passo; borda pulsando (CSS) |
| Ver/editar/criar cartão | `Dialog` (cabeçalho `Bar` com `Tag` da coluna, sistema, Excluir/Editar/Fechar); leitura com `Title` + Markdown; edição com `Form`/`FormItem` + `Input`, `Select`/`Option`, `CheckBox`, `TextArea`; rodapé `Bar` (Excluir Negative, Cancelar, Salvar Emphasized) |
| Revisão | `Dialog` grande: `Title`, `ObjectStatus` do status, tempo e passos, ramo; Resumo; `Panel` "Testes" (recolhido se passaram) com a saída (ver tudo/menos por `Link`); `Table` de arquivos com +/− (`ObjectStatus`); um `Panel` por arquivo com o diff em `<pre>` colorido; rodadas anteriores; rodapé `Bar` (Descartar Negative, Pedir ajuste, Aceitar Emphasized) |
| Pedir ajuste | `Dialog` com `TextArea` obrigatório, "Enviar à Fila" (desabilitado sem texto) |
| Rumo | painel à direita: `Bar` (voltar, `Title`, `Tag` do sistema, recolher), `Button` "Planejar a Fila", `BusyIndicator` + tempo enquanto roda, `Timeline`/`TimelineItem` com os passos (hora em cada um), `MessageStrip` de erro da rodada, rumo em Markdown |
| Rumo por sistema | `List` com `ListItemCustom` (estrela no foco, `highlight` Critical, `Link` do nome, próximo passo, `Link` "Planejar a Fila" ou `ObjectStatus` "planejando…") |
| Erros | `MessageStrip` Negative no topo do quadro (fechável) |
| Confirmações | `Toast` (cartão salvo/excluído, planejador iniciado, revisão concluída) |
| `confirm()` | `Dialog` "Confirmar" (`state="Negative"`) com `Button` Negative; o foco inicial fica em Cancelar |
| Tema | `setTheme('sap_horizon' | 'sap_horizon_dark')` lembrado em `localStorage` (`planejador:tema`, com try/catch); `setLanguage('pt')` |

CSS próprio (`src/estilo.css`) só para layout (grade, larguras, rolagem), pulsar do cartão em execução, faixas de gravidade, prévia ao passar o mouse, diff colorido e o Markdown — tudo com variáveis `--sap*`. `lucide-react` saiu do `package.json`; `@ui5/webcomponents-base` entrou (é importado direto para `setTheme`/`setLanguage`).

## Desvios da especificação e por quê
- **Gaveta e revisão em `Dialog`, não `FlexibleColumnLayout`/`ObjectPage`:** o quadro rola na horizontal com 9 colunas e tem a lista de sistemas e o rumo ao lado; o FCL espremeria o quadro e o ObjectPage dentro de um diálogo pesa sem ganho. A especificação já previa o `Dialog`.
- **Clicar fora do diálogo não fecha mais** (antes, clicar no fundo fechava a gaveta). O `Dialog` do Fiori é modal; fecha com Esc, com o X ou com Cancelar.
- **Cartão é bloco próprio, não `ListItemCustom`:** o `List` tem foco/teclado e arrastar próprios que conflitam com o arrastar HTML5 nativo (que é o que move entre colunas e para antes de um cartão). A especificação já previa essa alternativa.
- **Sistemas na `SideNavigation` com itens "não selecionáveis":** a `SideNavigation` só seleciona um item, e o filtro de sistemas esconde vários; por isso cada item alterna o olho (visível/escondido) e "Mostrar todos" limpa. Ctrl+clique continua deixando só um. Recolhida, a lista mostra só os olhos (o nome aparece no tooltip).
- **"Planejar a Fila" no topo:** roda no sistema aberto no rumo; sem sistema aberto, no único visível ou no sistema em foco (o nome aparece no botão). No painel continua um botão por sistema.
- **Aba vertical "Rumo" com o painel recolhido** virou o `ShellBarItem` do topo (mostrar/recolher o rumo).
- **"Executando":** sem `ProgressIndicator` (não tem modo indeterminado nesta versão); usado `BusyIndicator` pequeno.
- **Testes na revisão:** o `Panel` abre sozinho só quando os testes falharam.
- **Categorias:** sem um item "Todas" dentro do `SegmentedButton` (ele alterna o próprio estado e sairia de sincronia); "Todas as categorias" é um `ToolbarButton` que aparece quando há filtro.
- **Formulário de edição:** três `Form` seguidos (título; campos em 3 colunas; descrição) porque `FormItem.columnSpan` está obsoleto e não tem efeito nesta versão.
- **Busca na janela estreita** vira o ícone de lupa do `ShellBar` (comportamento padrão do Fiori).

## Verificação
- `npm run check` e `npx vite build` verdes (o build avisa do pacote grande, ~1,6 MB, por causa do UI5).
- Capturas no Chrome invisível contra uma cópia `PLANEJADOR_SEM_EXECUTOR=1` na porta 5181, com um modo de demonstração temporário (dados fictícios em memória, POST bloqueado) já removido: quadro claro e escuro, cartão, edição, revisão com diff aberto, pedir ajuste, confirmação, rumo rodando, prévia e o soltar na Fila (o POST bloqueado aparece no `MessageStrip`, o que confirma que o arrastar chega ao servidor).
- Nenhuma rota que grava foi chamada nos quadros reais.

## Para conferir clicando
- Arrastar entre colunas e soltar antes de um cartão (marca azul em cima do cartão; contorno tracejado na coluna); recusa da Fila aparecendo no `MessageStrip`.
- Clique e Ctrl+clique nos sistemas; filtros de categoria e área; busca (e o X da busca).
- Gaveta: Esc, editar, salvar sem título (campo fica vermelho), criar cartão pelo "+", excluir com a confirmação.
- Revisão: Aceitar, Pedir ajuste (Enviar à Fila), Descartar com a confirmação; notificação do navegador e título da aba "(n) Planejador".
- Planejar a Fila (topo e painel), passos na `Timeline`, rumo aparecendo ao terminar.
- Tema escuro pelo botão da lua/sol (fica lembrado ao recarregar).
- Prévia ao parar o mouse num cartão; lixeira no hover; "Parar" num cartão em execução.
