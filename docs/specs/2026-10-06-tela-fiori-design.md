# Tela do Planejador no SAP Fiori (UI5 Web Components)

**Data:** 06/10/2026 · **Status:** aprovado pelo usuário na conversa ("Gostei desse, pode fazer")

## Objetivo
Trocar toda a tela do Planejador pelos componentes oficiais do SAP Fiori (`@ui5/webcomponents-react`, tema Horizon), usando todos os componentes que têm função no Planejador. O comportamento e a API não mudam.

## Decisões
- **Biblioteca:** `@ui5/webcomponents-react` 2.x (+ `@ui5/webcomponents`, `-fiori`, `-icons`), com `ThemeProvider` e `import '@ui5/webcomponents-react/dist/Assets.js'` (temas, ícones e textos).
- **Tema:** `sap_horizon` (padrão). Seletor de tema na `ShellBar` (menu do perfil ou botão): Horizon claro / Horizon escuro (`setTheme('sap_horizon_dark')`), lembrado no `localStorage`.
- **Idioma dos componentes:** `setLanguage('pt')`.
- **Sem CSS próprio de aparência:** o visual vem dos componentes e das variáveis `--sap*`. CSS próprio só para layout (grade, larguras, rolagem) e para o que o Fiori não tem (pulsar do cartão em execução, diff com cores de linha), sempre com variáveis `--sap*`.
- **Fora:** componentes sem função no Planejador (calendário, upload, carrinho, gráficos).

## Mapa
| Hoje | Componente |
|---|---|
| Topo, números, busca, filtro de categoria | `ShellBar` (título, subtítulo, busca com `Input`/`ShellBarSearch`, botão "Planejar a Fila", seletor de tema) + `Toolbar` com `SegmentedButton` de categoria |
| Lista de sistemas, foco, "novas" | `SideNavigation` (`SideNavigationItem` com contador; o sistema em foco marcado) + bloco do agente embaixo (`ObjectStatus`/`ProgressIndicator`) |
| Coluna | `Card` + `CardHeader` (titleText = coluna, subtitleText = dica, additionalText = contagem; Fazendo "1/1"); botão "+" no `action` do header |
| Cartão | item arrastável (`ListItemCustom` dentro de `List`, ou bloco próprio dentro do Card) com título, resumo, `ObjectStatus` (prioridade: Alta = Negative, Média = Critical; exec: pronto = Positive, falhou = Negative, parado = None/Information) e `Tag` (categoria, área, adiado, planejador). Lixeira no hover com `Button design="Transparent" icon="delete"` |
| Coluna vazia | `IllustratedMessage` pequeno (`design="Dot"` ou `"Spot"`) "Arraste um cartão para cá" |
| Gaveta (ver/editar/criar cartão) | `FlexibleColumnLayout` (quadro na 1ª coluna, cartão na 2ª) — ou `Dialog` se o FCL atrapalhar o arrastar; leitura com `Title`, `Label`/`Text` e o Markdown; edição com `Form`/`FormItem` + `Input`, `Select`/`Option`, `CheckBox`, `TextArea`; ações em `Bar` no rodapé |
| Painel de revisão | `ObjectPage` (ou `Dialog` grande) com cabeçalho (título, `ObjectStatus` do status, tempo e passos), seções: Resumo, Testes (`Panel` recolhível com a saída), Arquivos (`Table` com +/−), Alterações (um `Panel` por arquivo com o diff em `<pre>`, linhas coloridas com `--sapPositive*`/`--sapNegative*`), Rodadas anteriores; rodapé `Bar` com Aceitar (Emphasized), Pedir ajuste (abre `Dialog` com `TextArea` obrigatório), Descartar |
| Rumo / painel geral | painel lateral direito ou `Dialog`: `Timeline` com os passos do planejador, o rumo em Markdown, `BusyIndicator` enquanto roda |
| Erros e avisos | `MessageStrip` (no topo do quadro) e `Toast` para confirmações curtas |
| `confirm()` (excluir, descartar) | `Dialog` de confirmação com `Button` Negative |
| Executando | cartão com `ProgressIndicator` indeterminado ou `BusyIndicator` pequeno + passo atual em `Text`; selo "executando há N min" |

## O que não muda
- Rotas da API, executor, Fila, recusas, notificações (navegador + Windows), título da aba "(n) Planejador", polling (2 s com execução, 4 s sem).
- Arrastar e soltar entre colunas e para antes de um cartão (HTML5 drag-and-drop nativo nos cartões).
- `npm run check` verde.

## Como verificar
Uma segunda cópia do servidor com `PLANEJADOR_SEM_EXECUTOR=1` (não executa nada nos quadros reais) e capturas com o Chrome em modo invisível. Nunca usar rotas que gravam nos quadros reais para testar.
