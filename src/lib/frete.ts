// ====================================================================
// FRETE POR DISTÂNCIA + CEP — Bella Salgadinhos
// Coloque este arquivo em: src/lib/frete.ts
// ====================================================================

export type CoordenadaGeo = { lat: number; lon: number };

export type FaixaFrete = { minKm: number; maxKm: number; base: number; retorno: number };

// Tabela enviada pelo cliente.
//  - base    = taxa de ida (paga no Pix)
//  - retorno = taxa quando o pagamento é Cartão ou Dinheiro (inclui o retorno do motoboy)
// Retorno para cartão e dinheiro: valor de ida acrescido de 30%.
export const TABELA_FRETE: FaixaFrete[] = [
  { minKm: 0, maxKm: 1, base: 6.0, retorno: 7.8 },
  { minKm: 1, maxKm: 2, base: 7.0, retorno: 9.1 },
  { minKm: 2, maxKm: 3.5, base: 8.0, retorno: 10.4 },
  { minKm: 3.5, maxKm: 5.5, base: 10.0, retorno: 13.0 },
  { minKm: 5.5, maxKm: 7.0, base: 11.0, retorno: 14.3 },
  { minKm: 7.0, maxKm: 9.0, base: 13.0, retorno: 16.9 },
  { minKm: 9.0, maxKm: 12.0, base: 15.0, retorno: 19.5 },
  { minKm: 12.0, maxKm: 15.0, base: 17.0, retorno: 22.1 },
  { minKm: 15.0, maxKm: 17.0, base: 19.0, retorno: 24.7 },
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

type NominatimItem = {
  lat: string;
  lon: string;
  address?: {
    house_number?: string;
    road?: string;
    pedestrian?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    municipality?: string;
    state?: string;
  };
  importance?: number;
  type?: string;
  class?: string;
};

function normalizarTexto(v: string) {
  return v.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function geocodificar(p: DadosEndereco): Promise<CoordenadaGeo | null> {
  const base = { format: "jsonv2", limit: "5", countrycodes: "br", "accept-language": "pt-BR", addressdetails: "1" };
  const estado = UF_NOMES[p.uf.toUpperCase()] ?? p.uf;
  const tentativas: URLSearchParams[] = [];
  const rua = p.rua.trim();
  const numero = p.numero.trim();
  const bairro = p.bairro.trim();
  const cidade = p.cidade.trim();

  // O número e a rua são os dados mais importantes: não começar pelo CEP
  // nem pelo bairro, pois isso pode apontar para o centro da região.
  if (rua && numero) {
    tentativas.push(new URLSearchParams({
      ...base,
      street: `${numero} ${rua}`,
      city: cidade,
      state: estado,
      country: "Brasil",
    }));
    tentativas.push(new URLSearchParams({
      ...base,
      q: `${numero}, ${rua}, ${bairro}, ${cidade}, ${estado}, Brasil`,
    }));
  } else if (rua) {
    tentativas.push(new URLSearchParams({
      ...base,
      street: rua,
      city: cidade,
      state: estado,
      country: "Brasil",
    }));
  }

  for (let i = 0; i < tentativas.length; i++) {
    try {
      const r = await fetchComTimeout(`https://nominatim.openstreetmap.org/search?${tentativas[i]}`);
      if (r.ok) {
        const lista = (await r.json()) as NominatimItem[];
        const ruaAlvo = normalizarTexto(rua);
        const candidatos = lista
          .map((item) => {
            const endereco = item.address ?? {};
            const ruaEncontrada = normalizarTexto(endereco.road ?? endereco.pedestrian ?? "");
            const numeroEncontrado = String(endereco.house_number ?? "").trim();
            const bairroEncontrado = normalizarTexto(endereco.suburb ?? endereco.neighbourhood ?? "");
            const ruaConfere = !ruaAlvo || !ruaEncontrada || ruaEncontrada.includes(ruaAlvo) || ruaAlvo.includes(ruaEncontrada);
            const numeroConfere = !numero || numeroEncontrado === numero;
            const bairroAlvo = normalizarTexto(bairro);
            const bairroConfere = !bairroAlvo || !bairroEncontrado || bairroEncontrado === bairroAlvo || bairroEncontrado.includes(bairroAlvo);
            const lat = numeroValido(item.lat);
            const lon = numeroValido(item.lon);
            return { item, lat, lon, pontos: (numeroConfere ? 8 : 0) + (ruaConfere ? 4 : 0) + (bairroConfere ? 2 : 0) + (item.type === "house" ? 3 : 0) + (item.class === "place" ? 0 : 1) };
          })
          .filter((c) => c.lat !== null && c.lon !== null && c.pontos >= (numero ? 8 : 4))
          .sort((a, b) => b.pontos - a.pontos);
        const melhor = candidatos[0];
        if (melhor?.lat !== null && melhor?.lat !== undefined && melhor?.lon !== null && melhor?.lon !== undefined) {
          return { lat: melhor.lat, lon: melhor.lon };
        }
      }
    } catch {
      // tenta a segunda consulta, ainda usando rua e número
    }
    if (i < tentativas.length - 1) await esperar(1100);
  }

  // Sem número exato no mapa, é mais seguro pedir ajuste do endereço do que
  // calcular a taxa usando o centro do bairro e cobrar um valor possivelmente errado.
  throw new Error(
    numero
      ? "Não encontrei o número desse endereço com precisão no mapa. Confira rua e número ou entre em contato com a loja."
      : "Não consegui localizar essa rua com precisão. Confira o endereço e tente novamente.",
  );
}


export type SugestaoRua = {
  rua: string;
  bairro: string;
  cidade: string;
  uf: string;
  label: string;
};

// Busca sugestões de logradouro sem exigir CEP. A seleção só preenche os campos;
// o cálculo do frete continua geocodificando rua + número para evitar taxa aproximada.
export async function buscarSugestoesRua(
  texto: string,
  cidade = "Rio Branco",
  uf = "AC",
): Promise<SugestaoRua[]> {
  const termo = texto.trim();
  if (termo.length < 4) return [];
  const estado = UF_NOMES[uf.toUpperCase()] ?? uf;
  const params = new URLSearchParams({
    format: "jsonv2",
    addressdetails: "1",
    limit: "6",
    countrycodes: "br",
    "accept-language": "pt-BR",
    q: `${termo}, ${cidade}, ${estado}, Brasil`,
  });
  const response = await fetchComTimeout(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    7000,
  );
  if (!response.ok) throw new Error("Busca de endereço indisponível.");
  const items = (await response.json()) as NominatimItem[];
  const vistos = new Set<string>();
  return items.flatMap((item) => {
    const a = item.address ?? {};
    const rua = a.road ?? a.pedestrian ?? "";
    if (!rua) return [];
    const bairro = a.suburb ?? a.neighbourhood ?? "";
    const cidadeEncontrada = a.city ?? a.town ?? a.municipality ?? cidade;
    const ufEncontrada = a.state ? (Object.entries(UF_NOMES).find(([, nome]) => nome === a.state)?.[0] ?? uf) : uf;
    const label = [rua, bairro, cidadeEncontrada, ufEncontrada].filter(Boolean).join(" - ");
    const chave = normalizarTexto(label);
    if (vistos.has(chave)) return [];
    vistos.add(chave);
    return [{ rua, bairro, cidade: cidadeEncontrada, uf: ufEncontrada, label }];
  });
}

export async function resolverCoordenadas(p: DadosEndereco): Promise<CoordenadaGeo | null> {
  // Não usar coordenadas aproximadas do CEP: elas podem representar o centro do bairro.
  // Sempre priorizar a geocodificação do endereço digitado.
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

// Solicita rotas alternativas e escolhe a menor distância viável,
// evitando depender apenas da primeira rota recomendada pelo serviço.
export async function distanciaRota(
  origem: CoordenadaGeo,
  destino: CoordenadaGeo,
): Promise<{ km: number; estimada: boolean }> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origem.lon},${origem.lat};${destino.lon},${destino.lat}?overview=false&alternatives=true`;
    const r = await fetchComTimeout(url, 7000);
    if (r.ok) {
      const d = (await r.json()) as OsrmResp;
      const distancias = (d.routes ?? [])
        .map((rota) => rota.distance)
        .filter((metros): metros is number => typeof metros === "number" && Number.isFinite(metros) && metros >= 0);
      const menorDistancia = distancias.length ? Math.min(...distancias) : null;
      if (menorDistancia !== null) {
        return { km: arredondar1(menorDistancia / 1000), estimada: false };
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