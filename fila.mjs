// Regras da fila: quais cartões a Fila aceita e qual é o próximo a executar
import { COLUNAS } from './quadro.mjs';

export function podeExecutar(cartao, { temGit }) {
  // Rejeita cartões de produção
  if (cartao.area === 'producao') {
    return { ok: false, motivo: 'cartão de produção' };
  }

  // Rejeita cartões de terceiros
  if (cartao.area === 'terceiros') {
    return { ok: false, motivo: 'cartão de terceiros' };
  }

  // Rejeita cartões adiados
  if (cartao.adiado) {
    return { ok: false, motivo: 'cartão adiado' };
  }

  // Rejeita ideias e planos: são decisão ou ação do usuário (ex.: juntar um PR no main), não código
  if (cartao.categoria === 'ideia') {
    return { ok: false, motivo: 'ideia não é tarefa de código' };
  }
  if (cartao.categoria === 'plano') {
    return { ok: false, motivo: 'plano não é tarefa de código: é decisão ou ação sua' };
  }

  // Rejeita se não há git
  if (!temGit) {
    return { ok: false, motivo: 'o sistema não é um repositório git' };
  }

  return { ok: true };
}

export function proximo(quadros) {
  for (const { projeto, quadro } of quadros) {
    const filaCol = quadro.colunas.find(c => c.nome === 'Fila');
    if (!filaCol) continue;

    for (const cartao of filaCol.cartoes) {
      const resultado = podeExecutar(cartao, { temGit: projeto.temGit });
      if (resultado.ok) {
        return { projeto, cartao };
      }
    }
  }

  return null;
}

export function marcar(q0, id, campos) {
  const q = JSON.parse(JSON.stringify(q0));

  // Encontra o cartão
  for (const col of q.colunas) {
    const cartao = col.cartoes.find(c => c.id === id);
    if (cartao) {
      // Mescla os campos em outros
      for (const [chave, valor] of Object.entries(campos)) {
        if (valor === null) {
          delete cartao.outros[chave];
        } else {
          cartao.outros[chave] = valor;
        }
      }
      return q;
    }
  }

  throw new Error(`cartão ${id} não encontrado`);
}

export function comandoTestes(cabecalho) {
  // Procura por uma linha que começa com "- Testes:" e extrai o texto entre crases
  const linhas = cabecalho.split('\n');
  for (const linha of linhas) {
    if (linha.trim().startsWith('- Testes:')) {
      const match = linha.match(/`([^`]+)`/);
      if (match) {
        return match[1];
      }
    }
  }

  // Padrão
  return 'npm test';
}
