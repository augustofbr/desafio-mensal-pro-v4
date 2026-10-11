# Modelo: PDF "Desafio do Profissional Parceiro"

PDF de regras do mês para **os profissionais** (linguagem simples, sem termos técnicos).
A versão de outubro/2026 foi aprovada pelo Augusto e serve de referência de conteúdo e de
visual para os próximos meses.

| Arquivo | O que é |
|---|---|
| `desafio_profissional_parceiro_outubro_2026.pdf` | Exemplo aprovado (4 páginas, A4) |
| `gera_pdf.py` | Gerador em ReportLab que produziu o exemplo |

## Estrutura do exemplo

1. **Capa**: título e mês, "Como funciona", "Como ganhar pontos" e "Os prêmios de relance".
2. **As regras de cada área**: Cabelo, Unhas e Estética.
3. **Marcas autorizadas do Cabelo**: a distribuição do sorteio por profissional, as marcas
   não autorizadas e "Quais tratamentos contam em cada marca".
4. **Bônus Estrelas**: "Como o bônus funciona" (R$ por estrela, quem participa, inclusive quem
   entra só no bônus) e "Como acompanhar suas estrelas".

## Como gerar o PDF de outro mês

1. Confira as regras do mês no banco, porque o PDF tem de bater com o site:
   - `regras_desafio` da versão vigente: pontos, metas, prêmios, `starBonusValue` e
     `star_bonus_extra`;
   - `profissional_fabricante` da versão vigente (`valid_from`), para a tabela de marcas;
   - `profissionais_ativos`, para os nomes.
2. Edite os textos e dados em `gera_pdf.py`. O mês aparece em vários pontos (procure por
   `outubro` e `2026`), assim como a tabela de marcas e a lista de marcas não autorizadas.
3. Gere o PDF. O script precisa de `reportlab` e das fontes Arial do macOS
   (`/System/Library/Fonts/Supplemental/`):

   ```bash
   python3 -m venv /tmp/venv-pdf && /tmp/venv-pdf/bin/pip install reportlab
   /tmp/venv-pdf/bin/python docs/modelos/desafio-profissional-parceiro/gera_pdf.py \
     ~/Desktop/desafio_profissional_parceiro_<mes>_<ano>.pdf
   ```

   Sem argumento, o script sobrescreve o PDF de exemplo ao lado dele. Passe sempre o
   caminho de saída quando for gerar outro mês.
4. Converta as páginas em imagem e confira o resultado visualmente antes de enviar. O
   rodapé tem o total de páginas fixo (`/4`); ajuste-o se o número de páginas mudar.
