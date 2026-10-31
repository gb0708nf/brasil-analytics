# Brasil Analytics

Plataforma web de monitoramento econômico do Brasil, desenvolvida por **Gabriel Nunes Fernandes** como projeto de portfólio (Técnico em Inteligência Artificial).

> Brasil Analytics é uma plataforma desenvolvida por Gabriel Nunes Fernandes com o objetivo de democratizar o acesso a informações econômicas e promover a educação financeira por meio de dados, visualizações interativas e simulações.

**Stack:** HTML5 · CSS3 · JavaScript Vanilla · Chart.js (+ plugin de zoom). Sem frameworks pesados, sem build.

## Estrutura do projeto

```
brasil-analytics/
├── index.html   # estrutura das telas (9 seções) e carregamento das bibliotecas
├── style.css    # identidade visual, temas claro/escuro, glassmorphism, responsivo, impressão
├── script.js    # dados, gráficos e todos os módulos (comentado por seção)
└── README.md
```

## Arquitetura

`script.js` é dividido em módulos por seção (numerados nos comentários):

| Módulo | Responsabilidade |
|---|---|
| Camada de dados | Busca APIs (BCB SGS, IBGE SIDRA, Banco Mundial) com *timeout*; valida os valores; se falhar, cai para **dados simulados** da mesma estrutura (`{labels, values, step, source}`). |
| Derivados | IPCA acumulado em 12 meses, médias móveis, regressão linear. |
| Painel | 8 cartões (valor, variação, tendência, *sparkline*), termômetro 0–100, status das fontes. |
| Gráficos | 5 séries com seleção de período (1A–Tudo), zoom (roda/arrastar), pan (Shift), PNG. |
| Assistente | Textos gerados por regras sobre os dados atuais (inflação, juros, câmbio, emprego, PIB, fiscal). |
| Laboratório | Modelo didático com 5 alavancas → inflação, desemprego, crescimento e dívida em 8 trimestres. |
| Tendências | Regressão linear (janela recente) + médias móveis → projeções de 6 e 12 meses. |
| Mapa / Rankings | Cartograma de 27 UFs, ranking, setores, crises, governos, comparador internacional. |
| Exportação | CSV (separador `;`, UTF-8 com BOM), PNG com fundo sólido, PDF via impressão. |

Fluxo: `init() → refreshData() → loadAll() → derive() → renderAll()`. Toda função `render*()` é idempotente, então a troca de tema e a atualização automática (a cada 30 min) apenas re-renderizam.

## Fontes de dados

| Indicador | Fonte |
|---|---|
| Selic, IPCA, Dólar, Dívida bruta/PIB, Reservas, Resultado primário | Banco Central — SGS (códigos 432, 433, 1, 13762, 13621, 5793) |
| Desemprego | IBGE SIDRA tabela 6381 (reserva: SGS 24369) |
| PIB | IBGE SIDRA tabela 5932 |
| Comparador internacional | Banco Mundial (opcional) + estimativas |

**Importante:** confira os códigos das séries em <https://www3.bcb.gov.br/sgspub> e as tabelas em <https://sidra.ibge.gov.br>, especialmente `5793` (resultado primário) e as variáveis do SIDRA. Se uma série falhar ou vier fora do intervalo esperado, a plataforma usa dados simulados e mostra a etiqueta **simulado** (veja o painel "Fontes de dados"). Para alterar uma série, edite o objeto `SOURCES` em `script.js`.

Dados do mapa, setores, governos e países são **aproximados e educacionais**: substitua por dados oficiais quando quiser rigor.

## Como rodar localmente

Abra `index.html` no navegador (as APIs do BCB/IBGE aceitam CORS). Se preferir um servidor local:

```bash
python -m http.server 8000   # depois acesse http://localhost:8000
```

## Publicar no GitHub Pages (gratuito)

1. Crie uma conta em <https://github.com> e clique em **New repository**. Nome sugerido: `brasil-analytics`, visibilidade **Public**.
2. Envie os 4 arquivos para a raiz do repositório (botão **Add file → Upload files**, ou via Git):
   ```bash
   git init
   git add .
   git commit -m "Brasil Analytics v1"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/brasil-analytics.git
   git push -u origin main
   ```
3. No repositório, vá em **Settings → Pages**.
4. Em **Build and deployment → Source**, escolha **Deploy from a branch**, branch **main**, pasta **/ (root)** e clique em **Save**.
5. Aguarde 1–2 minutos. O site ficará em `https://SEU-USUARIO.github.io/brasil-analytics/`.

Dica de portfólio: adicione o link no README do seu perfil do GitHub e no LinkedIn, com 2–3 *prints* do painel nos temas escuro e claro.

## Melhorias futuras

- Consumir mais dados oficiais: PIB e população por estado (SIDRA), setores (Contas Nacionais), mapa real com GeoJSON das UFs (IBGE Malhas).
- Expectativas de mercado do **Boletim Focus** (BCB Olinda) ao lado das projeções estatísticas.
- Modelos mais robustos nas Tendências (suavização exponencial, ARIMA simples, intervalos de confiança) e calibração econométrica dos coeficientes do Laboratório.
- Cache em `localStorage`/Service Worker para uso offline (PWA) e carregamento instantâneo.
- Alertas e favoritos (ex.: notificar quando a Selic ou o dólar cruzarem um limite).
- Relatório em PDF dedicado (jsPDF) em vez da impressão do navegador; compartilhamento de cenários do Laboratório por URL.
- Testes automatizados das funções de cálculo (regressão, termômetro, simulador) e acessibilidade (WCAG, navegação por teclado no mapa).
- Mais países e indicadores no comparador internacional, com séries históricas.

## Aviso

Projeto educacional. As projeções e simulações não representam previsão oficial nem recomendação de investimento.
