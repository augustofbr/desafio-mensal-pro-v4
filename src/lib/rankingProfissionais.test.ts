import { describe, it, expect } from "vitest";
import { participaDoRanking, profissionaisDaCategoria } from "./rankingProfissionais";
import { agruparEstrelasPorCategoria } from "./estrelasPorCategoria";
import { computePointsRanking, normalizeProfessionalId, type ServiceRecord } from "./scoring";
import { calcularPosicoes } from "./posicoes";
import type { CategoryRules } from "./rulesConfig";
import type { ProfissionalAtivo } from "@/types/profissionaisAtivos";

function prof(
  profissionalId: number,
  nome: string,
  categoria: string | null,
  ativo?: boolean | null
): ProfissionalAtivo {
  return {
    created_at: "2026-01-01T00:00:00Z",
    profissionalId,
    nome_profissional: nome,
    categoria,
    ...(ativo === undefined ? {} : { ativo }),
  };
}

const ANA = prof(101, "Ana", "Cabelo", true);
const BIA = prof(102, "Bia", "Cabelo", null); // null conta como ativo
const CLARA = prof(103, "Clara", "Cabelo"); // ausente conta como ativo
const DANIELLE = prof(906607, "Danielle", "Cabelo", false);
const JUCILENE = prof(938741, "Jucilene", "Cabelo", false);
const ELA_UNHAS = prof(201, "Ela", "Unhas", true);
const INATIVA_UNHAS = prof(202, "Inativa Unhas", "Unhas", false);

const CADASTRO = [ANA, BIA, CLARA, DANIELLE, JUCILENE, ELA_UNHAS, INATIVA_UNHAS];

function makeRules(): CategoryRules {
  return {
    scoringModel: "points",
    clientPointValue: 1,
    specialServicePointValue: 2,
    specialServiceLabel: "Especial",
    starPointValue: 3,
    starsCountInScore: true,
    qualificationGoals: {},
    symbolicGoals: {},
    manufacturerConstraints: false,
    prize: "A definir",
    specialServiceMatch: { type: "exact", values: ["Tratamento"] },
  };
}

function servico(profissionalid: string, cliente: string, dia: string): ServiceRecord {
  return {
    profissionalid,
    professional: profissionalid,
    service_name: "Tratamento",
    category: "Tratamentos para Cabelo",
    client_name: cliente,
    service_date: dia,
  };
}

describe("participaDoRanking", () => {
  it("so false exclui; true, null e ausente contam", () => {
    expect(participaDoRanking({ ativo: false })).toBe(false);
    expect(participaDoRanking({ ativo: true })).toBe(true);
    expect(participaDoRanking({ ativo: null })).toBe(true);
    expect(participaDoRanking({})).toBe(true);
  });
});

describe("profissionaisDaCategoria", () => {
  it("tira os inativos e mantem ativo true/null/ausente", () => {
    expect(profissionaisDaCategoria(CADASTRO, "Cabelo").map((p) => p.name)).toEqual([
      "Ana",
      "Bia",
      "Clara",
    ]);
    expect(profissionaisDaCategoria(CADASTRO, "Unhas")).toEqual([{ id: "201", name: "Ela" }]);
  });

  it("segue ignorando quem nao tem nome", () => {
    const semNome = { ...prof(300, "x", "Cabelo", true), nome_profissional: null };
    expect(profissionaisDaCategoria([semNome], "Cabelo")).toEqual([]);
  });
});

describe("agruparEstrelasPorCategoria", () => {
  const dentro = "2026-10-10T15:00:00Z";
  const fora = "2026-09-10T15:00:00Z";
  const avaliacoes = [
    { profissional_id: 101, data_hora_cadastro: dentro },
    { profissional_id: 101, data_hora_cadastro: dentro },
    { profissional_id: 102, data_hora_cadastro: dentro },
    { profissional_id: 906607, data_hora_cadastro: dentro },
    { profissional_id: 938741, data_hora_cadastro: dentro },
    { profissional_id: 938741, data_hora_cadastro: dentro },
    { profissional_id: 202, data_hora_cadastro: dentro },
    { profissional_id: 201, data_hora_cadastro: dentro },
    { profissional_id: 101, data_hora_cadastro: fora },
    { profissional_id: 777, data_hora_cadastro: dentro }, // fora do cadastro
  ];

  it("estrelas de inativo nao entram em nenhum mapa (nem semCategoria)", () => {
    const r = agruparEstrelasPorCategoria(avaliacoes, CADASTRO, "2026-10-01", "2026-10-31");
    expect(Object.fromEntries(r.cabelo)).toEqual({ "101": 2, "102": 1 });
    expect(Object.fromEntries(r.unhas)).toEqual({ "201": 1 });
    expect(Object.fromEntries(r.semCategoria)).toEqual({ "777": 1 });
  });

  it("recorta o periodo e o resultado nao muda para ativos", () => {
    const r = agruparEstrelasPorCategoria(avaliacoes, CADASTRO, "2026-09-01", "2026-09-30");
    expect(Object.fromEntries(r.cabelo)).toEqual({ "101": 1 });
  });
});

describe("ranking de Cabelo sem inativos (ponta a ponta do scoring)", () => {
  // Reproduz o que os hooks de categoria fazem: so servicos cujo id esta na lista.
  function rankear(cadastro: ProfissionalAtivo[], services: ServiceRecord[]) {
    const profissionais = profissionaisDaCategoria(cadastro, "Cabelo");
    const ids = new Set(profissionais.map((p) => p.id));
    const categoryServices = services.filter((s) => {
      const id = normalizeProfessionalId(s.profissionalid);
      return id != null && ids.has(id);
    });
    const estrelas = agruparEstrelasPorCategoria(
      [
        { profissional_id: 906607, data_hora_cadastro: "2026-10-10T15:00:00Z" },
        { profissional_id: 938741, data_hora_cadastro: "2026-10-10T15:00:00Z" },
        { profissional_id: 102, data_hora_cadastro: "2026-10-10T15:00:00Z" },
      ],
      cadastro,
      "2026-10-01",
      "2026-10-31"
    );
    return computePointsRanking({
      categoryServices,
      categoryProfessionals: profissionais,
      starsByProfessional: estrelas.cabelo,
      rules: makeRules(),
      categoryKey: "cabelo",
    });
  }

  const services = [
    servico("906607", "Cli A", "2026-10-02"),
    servico("906607", "Cli B", "2026-10-03"),
    servico("906607", "Cli C", "2026-10-04"),
    servico("938741", "Cli D", "2026-10-02"),
    servico("101", "Cli E", "2026-10-02"),
  ];

  it("inativo com servicos e estrelas nao vira linha", () => {
    const ranking = rankear(CADASTRO, services);
    const ids = ranking.map((e) => e.professionalId);
    expect(ids).not.toContain("906607");
    expect(ids).not.toContain("938741");
    expect(ids.sort()).toEqual(["101", "102", "103"]);
  });

  it("posicoes sao recalculadas sem o inativo", () => {
    // Com Danielle (3 atendimentos x 3 pts = 9 pts + tratamentos) ela lideraria.
    const comInativa = rankear(
      CADASTRO.map((p) => (p.profissionalId === 906607 ? { ...p, ativo: true } : p)),
      services
    );
    expect(comInativa[0].professionalId).toBe("906607");

    const semInativa = rankear(CADASTRO, services);
    const posicoes = calcularPosicoes(semInativa.map((e) => e.points));
    // Ana: 1 tratamento (2) + 1 cliente (1) = 3; Bia: 1 estrela = 3; Clara: 0
    expect(semInativa.map((e) => e.points)).toEqual([3, 3, 0]);
    expect(posicoes).toEqual([1, 1, 3]);
  });

  it("ativo null/ausente conta como ativo", () => {
    const ranking = rankear(CADASTRO, services);
    expect(ranking.map((e) => e.professionalId)).toContain("102");
    expect(ranking.map((e) => e.professionalId)).toContain("103");
  });
});
