// ====================================================================
// FRETE POR DISTÂNCIA + CEP — Bella Salgadinhos
// Coloque este arquivo em: src/lib/frete.ts
// ====================================================================

export type CoordenadaGeo = { lat: number; lon: number };

export type FaixaFrete = { minKm: number; maxKm: number; base: number; retorno: number };

// Tabela enviada pelo cliente.
//  - base    = taxa de ida (paga no Pix)
//  - retorno = taxa quando o pagamento é Cartão ou Dinheiro (inclui o retorno do motoboy)
// CONFIRMAR com a dona: na faixa "até 1 km" o valor de retorno está 10,50
// (igual ao da faixa seguinte). Nas demais faixas retorno = base x 1,5.
export const TABELA_FRETE: FaixaFrete[] = [
  { minKm: 0, maxKm: 1, base: 6.0, retorno: 7.8 },
  { minKm: 1, maxKm: 2, base: 7.0, retorno: 10.5 },
  { minKm: 2, maxKm: 3.5, base: 8.0, retorno: 12.0 },
  { minKm: 3.5, maxKm: 5.5, base: 10.0, retorno: 15.0 },
  { minKm: 5.5, maxKm: 7.0, base: 11.0, retorno: 16.5 },
  { minKm: 7.0, maxKm: 9.0, base: 13.0, retorno: 19.5 },
  { minKm: 9.0, maxKm: 12.0, base: 15.0, retorno: 22.5 },
  { minKm: 12.0, maxKm: 15.0, base: 17.0, retorno: 25.5 },
  { minKm: 15.0, maxKm: 17.0, base: 19.0, retorno: 28.5 },
];

// Acima disso a loja não entrega
export const LIMITE_KM = 17;

export function buscarFaixa(km: number): FaixaFrete | null {
  if (!Number.isFinite(km) || km < 0 || km > LIMITE_KM) return null;
  return TABELA_FRETE.find((f) => km <= f.maxKm) ?? null;
}

export function cobraTaxaDeRetorno(pagamento: string) {
  return pagamento === "Cartão" || pagamento === "Dinheiro";
}

export function calcularTaxaEntrega(
  km: number,
  pagamento: string,
): { taxa: number; faixa: FaixaFrete; cobraRetorno: boolean } | null {
  const faixa = buscarFaixa(km);
  if (!faixa) return null;
  const cobraRetorno = cobraTaxaDeRetorno(pagamento);
  return { taxa: cobraRetorno ? faixa.retorno : faixa.base, faixa, cobraRetorno };
}

// ---------------------------------------------------------------------
// CEP
// ---------------------------------------------------------------------
export function limparCep(v: string) {
  return v.replace(/\D/g, "").slice(0, 8);
}

export function formatarCep(v: string) {
  const d = limparCep(v);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

async function fetchComTimeout(url: string, ms = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const arredondar1 = (n: number) => Math.round(n * 10) / 10;

function numeroValido(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

export type EnderecoCep = {
  cep: string;
  rua: string;
  bairro: string;
  cidade: string;
  uf: string;
  lat: number | null;
  lon: number | null;
};

type BrasilApiCep = {
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  location?: { coordinates?: { latitude?: string | number; longitude?: string | number } };
};

type ViaCepResp = {
  erro?: boolean | string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
};

// 1) BrasilAPI v2 (traz o endereço e, quando existe, as coordenadas do CEP)
// 2) ViaCEP como reserva (só o endereço)
export async function buscarCep(cep: string): Promise<EnderecoCep> {
  const limpo = limparCep(cep);
  if (limpo.length !== 8) throw new Error("Digite o CEP com 8 números.");

  try {
    const r = await fetchComTimeout(`https://brasilapi.com.br/api/cep/v2/${limpo}`);
    if (r.ok) {
      const d = (await r.json()) as BrasilApiCep;
      return {
        cep: limpo,
        rua: d.street ?? "",
        bairro: d.neighborhood ?? "",
        cidade: d.city ?? "",
        uf: d.state ?? "",
        lat: numeroValido(d.location?.coordinates?.latitude),
        lon: numeroValido(d.location?.coordinates?.longitude),
      };
    }
  } catch {
    // segue para o ViaCEP
  }

  let r2: Response;
  try {
    r2 = await fetchComTimeout(`https://viacep.com.br/ws/${limpo}/json/`);
  } catch {
    throw new Error("Não foi possível consultar o CEP agora. Preencha o endereço manualmente.");
  }
  if (!r2.ok) throw new Error("CEP não encontrado. Confira os números ou preencha manualmente.");
  const d2 = (await r2.json()) as ViaCepResp;
  if (d2.erro) throw new Error("CEP não encontrado. Confira os números ou preencha manualmente.");
  return {
    cep: limpo,
    rua: d2.logradouro ?? "",
    bairro: d2.bairro ?? "",
    cidade: d2.localidade ?? "",
    uf: d2.uf ?? "",
    lat: null,
    lon: null,
  };
}

// ---------------------------------------------------------------------
// Localização no mapa (Nominatim / OpenStreetMap) e distância
// ---------------------------------------------------------------------
const UF_NOMES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará",
  DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão",
  MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará",
  PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

export type DadosEndereco = {
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  coords: CoordenadaGeo | null; // coordenadas já conhecidas (ex: vindas do CEP)
};

type NominatimItem = { lat: string; lon: string };

async function geocodificar(p: DadosEndereco): Promise<CoordenadaGeo | null> {
  const base = { format: "jsonv2", limit: "1", countrycodes: "br", "accept-language": "pt-BR" };
  const estado = UF_NOMES[p.uf.toUpperCase()] ?? p.uf;
  const tentativas: URLSearchParams[] = [];

  if (p.rua) {
    if (p.numero) {
      tentativas.push(
        new URLSearchParams({ ...base, street: `${p.numero} ${p.rua}`, city: p.cidade, state: estado, country: "Brasil" }),
      );
    }
    tentativas.push(new URLSearchParams({ ...base, street: p.rua, city: p.cidade, state: estado, country: "Brasil" }));
  }
  if (p.bairro) {
    tentativas.push(new URLSearchParams({ ...base, q: `${p.bairro}, ${p.cidade}, ${estado}, Brasil` }));
  }

  for (let i = 0; i < tentativas.length; i++) {
    try {
      const r = await fetchComTimeout(`https://nominatim.openstreetmap.org/search?${tentativas[i]}`);
      if (r.ok) {
        const lista = (await r.json()) as NominatimItem[];
        const item = lista[0];
        if (item) {
          const lat = numeroValido(item.lat);
          const lon = numeroValido(item.lon);
          if (lat !== null && lon !== null) return { lat, lon };
        }
      }
    } catch {
      // tenta a próxima
    }
    // política do Nominatim: no máximo 1 consulta por segundo
    if (i < tentativas.length - 1) await esperar(1100);
  }
  return null;
}

export async function resolverCoordenadas(p: DadosEndereco): Promise<CoordenadaGeo | null> {
  if (p.coords) return p.coords;
  return geocodificar(p);
}

function distanciaLinhaReta(a: CoordenadaGeo, b: CoordenadaGeo) {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

type OsrmResp = { routes?: { distance?: number }[] };

// Tenta a distância real de carro (OSRM). Se o serviço falhar, usa a
// linha reta x 1,3 (aproximação de rota urbana) e marca como estimada.
export async function distanciaRota(
  origem: CoordenadaGeo,
  destino: CoordenadaGeo,
): Promise<{ km: number; estimada: boolean }> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origem.lon},${origem.lat};${destino.lon},${destino.lat}?overview=false`;
    const r = await fetchComTimeout(url, 7000);
    if (r.ok) {
      const d = (await r.json()) as OsrmResp;
      const metros = d.routes?.[0]?.distance;
      if (typeof metros === "number" && Number.isFinite(metros)) {
        return { km: arredondar1(metros / 1000), estimada: false };
      }
    }
  } catch {
    // usa a estimativa
  }
  return { km: arredondar1(distanciaLinhaReta(origem, destino) * 1.3), estimada: true };
}

export async function calcularKmEntrega(
  origem: CoordenadaGeo,
  p: DadosEndereco,
): Promise<{ km: number; estimada: boolean }> {
  const destino = await resolverCoordenadas(p);
  if (!destino) throw new Error("Não consegui localizar esse endereço no mapa.");
  return distanciaRota(origem, destino);
}