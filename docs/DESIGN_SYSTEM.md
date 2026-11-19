# Design system

Arquivos: `public/assets/ds.css` (tokens e componentes base) e um CSS por superfície
(`site.css`, `convite.css`, `painel.css`, `landing.css`).

## Princípios
- **Editorial, não dashboard.** Linhas finas no lugar de cartões com sombra; números em serifa;
  muito espaço em branco. Nada de gradiente decorativo, ícone genérico ou card repetido.
- **Uma cor de destaque por universo**, usada com parcimônia (nomes, números, ação principal).
- **Movimento com propósito**: entrada coreografada da abertura, envelope do convite, revelação
  suave ao rolar. Tudo desliga com `prefers-reduced-motion`.
- **Acessível por padrão**: contraste AA, foco visível, alvos de toque ≥ 44 px, `aria-live` nos
  resultados, formulários com rótulo, idioma `pt-BR` declarado.

## Tokens
| Grupo | Tokens |
|---|---|
| Cor | `--paper`, `--paper-2`, `--ink`, `--ink-2`, `--muted`, `--line`, `--accent`, `--accent-ink`, `--ok`, `--warn`, `--bad` |
| Tipografia | `--serif`, `--sans`, `--t-hero`, `--t-h1`, `--t-h2`, `--t-h3`, `--t-body`, `--t-small`, `--t-label` |
| Espaço/forma | `--gut` (margem lateral fluida), `--max`, `--sec` (ritmo vertical), `--r`, `--r-lg` |
| Movimento | `--ease` (saída suave), `--dur`, `--dist` |

## Os três universos
Cada universo troca tokens **e** estrutura (regras `[data-universe=…]` em `site.css`).

| | Timeless | Editorial | Dreamscape |
|---|---|---|---|
| Sensação | clássico, romântico | revista contemporânea | cinematográfico, fim de tarde |
| Tipografia | Cormorant Garamond (itálico leve) + Jost | Instrument Serif + Instrument Sans | Fraunces (itálico) + Manrope |
| Paleta | marfim, sépia, ouro antigo | papel, preto, terracota | ameixa profunda, creme, pêssego |
| Composição | simétrica, centralizada; foto em arco | grade assimétrica; nomes empilhados gigantes; numeração de seções com régua | imagem sangrada em tela cheia; texto centralizado sobre vinheta |
| Ornamento | losango fino e filetes | régua preta e números | nenhum; a luz da foto é o ornamento |
| Movimento | lento (1,2 s), deslocamento curto | rápido (0,6 s), deslocamento maior | muito lento (1,4 s) + deriva contínua da foto |
| Botões | pílula | retos | pílula |

Pré-visualização: em casamentos de demonstração, `/c/helena-e-rafael?universo=timeless|editorial|dreamscape`.

## Componentes base
`.btn` (`.ghost`, `.accent`, `.sm`), `.link`, `.field` + `.in`, `.seg` (escolha Vou / Não vou),
`.tag` (`.yes`, `.no`, `.pending`, `.off`), `.label` (rótulo de seção com número), `.demo` (selo de
demonstração, sempre visível em dados fictícios), `.rv` (revelação ao rolar).

## Regras de conteúdo
- Português do Brasil, frases curtas, segunda pessoa (“vocês”).
- Datas por extenso com o fuso de São Paulo; valores em `R$` sem centavos quando redondos.
- Dados fictícios sempre identificados; nunca um botão sem ação.
- Imagens de demonstração: Unsplash. Projetos reais usam fotos do casal com consentimento.

## Segurança que afeta o front
A política de conteúdo bloqueia scripts e estilos inline. Por isso:
JS sempre em arquivos `type="module"`; imagens de fundo e larguras de barras aplicadas via CSSOM
(`el.style.x = …`), nunca com atributo `style` em HTML gerado.
