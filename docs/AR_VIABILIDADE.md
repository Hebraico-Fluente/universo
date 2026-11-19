# Realidade Aumentada no Universo: estudo de viabilidade

Situação: novembro de 2026. Escopo: avaliar, sem implementar, se vale a pena oferecer experiências em
Realidade Aumentada (RA) nos sites, convites e painel do Universo.

## 1. O que existe hoje para RA na web

| Tecnologia | O que faz | Onde funciona |
|---|---|---|
| **WebXR Device API** (`immersive-ar`) | RA "de verdade" no navegador: detecta planos, ancora objetos, hit-test | Chrome/Android com ARCore. **Safari/iOS não suporta WebXR em RA** (só no Vision Pro, em modo imersivo VR) |
| **`<model-viewer>`** (Google, Web Component) | Mostra um modelo 3D (glTF/GLB) na página e oferece o botão "ver no seu espaço" | Android: abre o **Scene Viewer** (ARCore) ou WebXR. iOS: abre o **AR Quick Look** se houver arquivo USDZ |
| **AR Quick Look** (Apple) | Visualizador nativo de USDZ/Reality; aberto por um link `<a rel="ar">` | iPhone/iPad com iOS 12+ (chip A9 ou superior) |
| **Scene Viewer** (Google) | Visualizador nativo de glTF por intent | Android com Google Play Services for AR |
| RA por marcador/imagem (8th Wall, MindAR, AR.js) | Rastreia uma imagem impressa (ex.: o convite) e sobrepõe conteúdo | Funciona em iOS e Android via câmera + WebGL; 8th Wall é pago e foi descontinuado como produto aberto em 2025; MindAR/AR.js são abertos, com qualidade inferior |

### Compatibilidade prática (público de casamento no Brasil)
- **Android**: maioria dos aparelhos intermediários recentes tem ARCore; aparelhos de entrada muitas vezes não.
- **iOS**: Quick Look funciona bem e de forma confiável, mas só com USDZ e sem lógica própria (sem botões, sem RSVP, sem animação interativa além da que vier no arquivo).
- Um convidado médio (tios, avós) precisa de **um toque e zero instalação**. Qualquer fluxo que peça permissão de câmera, instalar app ou girar o celular para "procurar o chão" perde boa parte das pessoas.

## 2. Restrições do próprio Universo
- **CSP estrita** (`script-src 'self'`, `connect-src 'self'`, sem iframes): `<model-viewer>` teria de ser servido do nosso domínio (copiado em `public/assets/vendor/`), sem CDN. Os modelos também precisam vir do próprio site (ou do módulo de mídia).
- **Permissions-Policy** atual bloqueia câmera (`camera=()`): RA por marcador/WebXR exigiria liberar câmera em páginas específicas. Quick Look e Scene Viewer são apps nativos e **não** dependem dessa política.
- **Sem dependências novas sem necessidade real** e sem build: `<model-viewer>` é um único arquivo ES module (~1 MB minificado), aceitável só se carregado sob demanda.
- **Peso**: um GLB bem otimizado de flores/arranjo fica entre 2 e 8 MB; USDZ equivalente, parecido. Em 4G do interior, é aceitável só sob clique, nunca no carregamento da página.

## 3. Custo de modelagem 3D
| Item | Esforço/custo estimado (mercado BR, 2026) |
|---|---|
| Objeto simples (alianças, taça, monograma 3D do casal) | 4–10 h de modelagem · R$ 400–1.500 por peça |
| Arranjo floral realista / centro de mesa | 15–40 h (folhas e pétalas são caras para ficarem leves e bonitas) · R$ 1.500–6.000 |
| Fotogrametria de um arranjo real do florista | sessão + limpeza: R$ 800–3.000, resultado pesado, precisa otimizar |
| Ambiente (salão, mesa posta em escala real) | 40–120 h · R$ 5.000–20.000; e o casal raramente tem a planta exata |
| Conversão e otimização glTF → USDZ, testes em aparelhos | 2–6 h por modelo |

Peças **genéricas** (taças, alianças, monograma paramétrico com as iniciais) podem virar biblioteca reutilizável do estúdio. Peças **sob medida** (o arranjo de verdade do florista do casal) custam caro e servem a um único casamento.

## 4. O que seria possível
1. **Convite em RA (monograma/selo 3D)**: no convite pessoal, botão "Ver o selo no seu espaço" abre o monograma do casal (iniciais + data) em RA via `<model-viewer>`/Quick Look. Viável tecnicamente, custo baixo se paramétrico. Valor: encantamento curto, de "uma vez só".
2. **Prévia de arranjos e centros de mesa**: o casal vê, na mesa real de casa ou no salão (visita técnica), o centro de mesa em escala real. Útil para **decisão** (altura do arranjo bloqueia a conversa? cabe na mesa redonda de 1,60 m?). Precisa de modelo fiel ao que o florista vai entregar, e esse é o gargalo.
3. **Convite impresso que "ganha vida"** (RA por marcador): apontar a câmera para o convite de papel e ver um vídeo/animação. Precisa liberar câmera, biblioteca de rastreamento e conteúdo animado; experiência inconsistente em aparelhos de entrada.
4. **Placas e mapa do local em RA**: setas no chão até a cerimônia. Exige mapeamento do espaço; não confiável na web hoje.

## 5. Recomendação honesta
- **Não implementar RA agora** como funcionalidade do produto. O custo por casamento (modelagem sob medida) é alto, o suporte no iPhone é limitado a Quick Look (sem interação) e o benefício para o convidado é curto. Nada do que já existe no Universo (RSVP, concierge, passaporte, documentário) depende disso.
- **Se for para testar**, o caminho de menor risco é um **piloto opcional, pago à parte**, com:
  - `<model-viewer>` servido localmente e carregado **só quando a pessoa toca no botão**;
  - um **monograma 3D paramétrico** (gerado a partir das iniciais e das cores do tema) em GLB + USDZ;
  - para o casal (não para convidados), **prévia de 2–3 centros de mesa genéricos** de uma biblioteca do estúdio, deixando claro que é ilustração, não o arranjo final.
- Medir antes de expandir: quantos convidados tocam no botão, quantos conseguem abrir (Android sem ARCore e iPhones antigos falham), e se a prévia de arranjos muda alguma decisão do casal.
- **Descartar** por enquanto: RA por marcador no convite impresso (câmera, CSP, aparelhos fracos) e navegação em RA no local.

## 6. Se o piloto for aprovado (esboço técnico)
- Mídia: o casal/estúdio sobe `monograma.glb` e `monograma.usdz` pelo módulo de mídia (`POST /api/admin/media`, públicos).
- Módulo experiências: uma flag `ra` (desligada por padrão) e um campo com os dois IDs de mídia; o convite mostra o botão só se os dois existirem.
- CSP: nenhuma mudança para Quick Look/Scene Viewer; `<model-viewer>` precisa de `worker-src 'self' blob:` em algumas versões; testar antes.
- Acessibilidade: sempre oferecer uma imagem 2D equivalente e texto alternativo; nunca esconder informação só em RA.
