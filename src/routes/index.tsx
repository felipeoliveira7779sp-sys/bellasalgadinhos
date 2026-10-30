import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";

import { fetchMenu, lojaEstaAberta, money, type Product, type Size } from "@/lib/menu-data";
import { createOrder } from "@/lib/menu.functions";
import { agruparCardapio, precoSalgado, type ProdutoAgrupado } from "@/lib/agrupar-cardapio";
import {
  LIMITE_KM,
  buscarCep,
  calcularKmEntrega,
  calcularTaxaEntrega,
  formatarCep,
  limparCep,
  type CoordenadaGeo,
  type DadosEndereco,
} from "@/lib/frete";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bella Salgadinhos | Cardápio" },
      {
        name: "description",
        content: "Cardápio online da Bella Salgadinhos: salgadinhos e refrigerantes com entrega.",
      },
      { property: "og:title", content: "Bella Salgadinhos | Cardápio" },
      {
        property: "og:description",
        content: "Peça salgadinhos e refrigerantes direto pelo WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Cardapio,
});

type CartItem = {
  key: number;
  name: string;
  qty: number;
  unitPrice: number;
  sizeLabel: string;
  flavors: string[];
  singleFlavor: string;
  choices: Record<string, string>;
  checklist: string[];
  obs: string;
};

type ChoiceGroup = { title: string; options: string[] };

type CalcFrete = {
  status: "idle" | "loading" | "ok" | "erro" | "fora";
  km: number | null;
  estimada: boolean;
  mensagem: string;
};

const CALC_VAZIO: CalcFrete = { status: "idle", km: null, estimada: false, mensagem: "" };

function basePrice(p: Product) {
  return p.price ?? (p.sizes[0]?.price ?? 0);
}

function getChoiceGroups(p: Product): ChoiceGroup[] {
  if (p.choice_groups && Array.isArray(p.choice_groups) && p.choice_groups.length > 0) {
    return p.choice_groups as ChoiceGroup[];
  }
  return [];
}

const fmtKm = (km: number) => String(km).replace(".", ",");

const caixa = (bg: string, borda: string, cor: string): React.CSSProperties => ({
  background: bg,
  border: `1px solid ${borda}`,
  color: cor,
  borderRadius: 10,
  padding: 12,
  marginBottom: 10,
  fontSize: "0.825rem",
  fontWeight: 600,
  display: "flex",
  flexDirection: "column",
  gap: 4,
});

function Cardapio() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["menu"],
    queryFn: fetchMenu,
    refetchInterval: 60_000,
  });
  const doCreateOrder = useServerFn(createOrder);
  const [enviando, setEnviando] = useState(false);

  // Produto aberto
  const [open, setOpen] = useState<ProdutoAgrupado | null>(null);
  const [sizeIdx, setSizeIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [flavors, setFlavors] = useState<string[]>([]);
  const [refriQtys, setRefriQtys] = useState<Record<string, number>>({});
  const [single, setSingle] = useState("");
  const [obs, setObs] = useState("");
  const [sortido, setSortido] = useState(false);
  const [choices, setChoices] = useState<Record<string, string>>({});

  // Carrinho e pedido
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [tipo, setTipo] = useState<"entrega" | "retirada">("entrega");
  const [nome, setNome] = useState("");
  const [tel, setTel] = useState("");
  const [dataPedido, setDataPedido] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0] as string;
  });
  const [horario, setHorario] = useState("");
  const [pagamento, setPagamento] = useState("");
  const [troco, setTroco] = useState("");

  // Endereço de entrega
  const [cep, setCep] = useState("");
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [coordsCliente, setCoordsCliente] = useState<CoordenadaGeo | null>(null);
  const [calc, setCalc] = useState<CalcFrete>(CALC_VAZIO);
  const calcId = useRef(0);

  const store = data?.store ?? null;
  const effectiveChoiceGroups = open ? getChoiceGroups(open) : [];
  const whatsLoja = "556892505137"; // WhatsApp da loja informado pelo proprietário
  const lojaCoords: CoordenadaGeo | null =
    store && store.store_lat !== null && store.store_lon !== null
      ? { lat: store.store_lat, lon: store.store_lon }
      : null;

  // Salgadinhos e refrigerantes agrupados em um único card cada
  const grupos = useMemo(() => {
    if (!data) return [];
    return agruparCardapio(data.categories, data.products);
  }, [data]);

  const isRefri = open?._modo === "refri";
  const isSalgados = open?._modo === "salgados";
  const refriPrecos = open?._refriPrecos ?? {};
  const totalRefri = Object.entries(refriQtys).reduce((a, [f, q]) => a + (refriPrecos[f] ?? 0) * q, 0);
  const tamanhoAtual = open?.sizes[sizeIdx]?.label ?? "";

  const unitPrice = open
    ? isSalgados
      ? precoSalgado(open, tamanhoAtual, flavors, sortido)
      : open.sizes.length > 0
        ? (open.sizes[sizeIdx]?.price ?? 0)
        : (open.price ?? 0)
    : 0;

  const maxSabores = open
    ? isSalgados
      ? Math.min(open.flavors.length, (open._maxSabores?.[tamanhoAtual] ?? 4) * qty)
      : Math.min(
          open.flavors.length,
          open.units_base
            ? Math.max(1, Math.floor((open.units_base * qty) / (open.units_per_flavor || 25)))
            : open.flavors.length,
        )
    : 0;

  // ----- Frete -----
  const kmAtual: number | null = calc.status === "ok" ? calc.km : null;
  const frete = tipo === "entrega" && kmAtual !== null ? calcularTaxaEntrega(kmAtual, pagamento) : null;
  const sobretaxa = store?.surcharge_active ? store.surcharge_amount : 0;
  const sobretaxaAplicada = frete ? sobretaxa : 0;
  const taxaTotal = frete ? frete.taxa + sobretaxaAplicada : 0;

  const subtotal = cart.reduce((a, i) => a + i.unitPrice * i.qty, 0);
  const qtdTotal = cart.reduce((a, i) => a + i.qty, 0);

  const horarios: string[] = (() => {
    const faixa = store?.hours_text?.match(/(\d{1,2})(?::(\d{2}))?\s*h?\s*[-–a]\s*(\d{1,2})(?::(\d{2}))?\s*h?/i);
    if (!faixa) return [];
    const inicio = Number(faixa[1]) * 60 + Number(faixa[2] ?? 0);
    const fim = Number(faixa[3]) * 60 + Number(faixa[4] ?? 0);
    if (fim <= inicio) return [];
    const hoje = new Date();
    const [ano, mes, dia] = dataPedido.split("-").map(Number);
    const selecionada = new Date(ano, mes - 1, dia);
    const ehHoje = selecionada.getFullYear() === hoje.getFullYear() && selecionada.getMonth() === hoje.getMonth() && selecionada.getDate() === hoje.getDate();
    const primeiroHorario = ehHoje ? Math.max(inicio, Math.ceil((hoje.getHours() * 60 + hoje.getMinutes() + 30) / 30) * 30) : inicio;
    const lista: string[] = [];
    for (let minuto = primeiroHorario; minuto <= fim; minuto += 30) {
      lista.push(`${String(Math.floor(minuto / 60)).padStart(2, "0")}:${String(minuto % 60).padStart(2, "0")}`);
    }
    return lista;
  })();

  function openProduct(p: ProdutoAgrupado) {
    if (!p.active) return;
    setOpen(p);
    setSizeIdx(0);
    setQty(1);
    setFlavors([]);
    setRefriQtys({});
    setSingle(p.single_flavors[0] ?? "");
    setObs("");
    setSortido(false);
    setChoices({});
  }

  function toggleFlavor(f: string) {
    setFlavors((cur) => {
      if (cur.includes(f)) return cur.filter((x) => x !== f);
      if (cur.length >= maxSabores) {
        alert(`Para esta quantidade você pode escolher no máximo ${maxSabores} sabor(es).`);
        return cur;
      }
      return [...cur, f];
    });
  }

  function addToCart() {
    if (!open) return;
    if (isRefri) {
      const escolhidos = Object.entries(refriQtys).filter(([, q]) => q > 0);
      if (escolhidos.length === 0) {
        alert("Escolha a quantidade de pelo menos 1 refrigerante.");
        return;
      }
      const agora = Date.now();
      setCart((c) => [
        ...c,
        ...escolhidos.map(([f, q], i) => ({
          key: agora + i,
          name: f,
          qty: q,
          unitPrice: refriPrecos[f] ?? 0,
          sizeLabel: "",
          flavors: [],
          singleFlavor: "",
          choices: {},
          checklist: [],
          obs,
        })),
      ]);
      setOpen(null);
      return;
    }
    if (open.flavors.length > 0 && !sortido && flavors.length === 0) {
      alert("Por favor, marque pelo menos 1 sabor (ou escolha Sortidos).");
      return;
    }
    const faltando = effectiveChoiceGroups.find((g) => !choices[g.title]);
    if (faltando) {
      alert(`Por favor, selecione uma opção para: "${faltando.title}"`);
      return;
    }
    setCart((c) => [
      ...c,
      {
        key: Date.now(),
        name: isSalgados ? `Salgadinhos - ${tamanhoAtual}` : open.name,
        qty,
        unitPrice,
        sizeLabel: isSalgados ? "" : (open.sizes[sizeIdx]?.label ?? ""),
        flavors: open.flavors.length > 0 ? (sortido ? ["Sortidos"] : flavors) : [],
        singleFlavor: open.single_flavors.length > 0 ? single : "",
        choices: Object.fromEntries(effectiveChoiceGroups.map((g) => [g.title, choices[g.title] ?? ""])),
        checklist: [],
        obs,
      },
    ]);
    setOpen(null);
  }

  // ----- Endereço / CEP / cálculo da taxa -----
  function limparCalculo() {
    calcId.current++;
    setCalc(CALC_VAZIO);
    setCoordsCliente(null);
  }

  async function calcular(dados: DadosEndereco, id: number) {
    if (!lojaCoords) {
      setCalc({
        status: "erro",
        km: null,
        estimada: false,
        mensagem:
          "A loja ainda não configurou o ponto de saída das entregas.",
      });
      return;
    }
    setCalc({ status: "loading", km: null, estimada: false, mensagem: "Calculando a distância..." });
    try {
      const r = await calcularKmEntrega(lojaCoords, dados);
      if (id !== calcId.current) return;
      setCalc({
        status: r.km > LIMITE_KM ? "fora" : "ok",
        km: r.km,
        estimada: r.estimada,
        mensagem: "",
      });
    } catch (e) {
      if (id !== calcId.current) return;
      setCalc({
        status: "erro",
        km: null,
        estimada: false,
        mensagem: e instanceof Error ? e.message : "Não foi possível calcular.",
      });
    }
  }

  async function consultarCepECalcular(cepFormatado: string) {
    const id = ++calcId.current;
    setCalc({ status: "loading", km: null, estimada: false, mensagem: "Buscando o CEP..." });
    try {
      const end = await buscarCep(cepFormatado);
      if (id !== calcId.current) return;
      setRua(end.rua);
      setBairro(end.bairro);
      setCidade(end.cidade);
      setUf(end.uf);
      // As coordenadas do serviço de CEP costumam ser o centro da cidade (distância errada);
      // localizamos pela rua/bairro no mapa.
      const coords = null;
      setCoordsCliente(coords);
      if (!end.rua) {
        setCalc({
          status: "erro",
          km: null,
          estimada: false,
          mensagem:
            'Esse CEP é geral da cidade. Digite a rua e clique em "Calcular taxa de entrega".',
        });
        return;
      }
      await calcular(
        { rua: end.rua, numero, bairro: end.bairro, cidade: end.cidade, uf: end.uf, coords },
        id,
      );
    } catch (e) {
      if (id !== calcId.current) return;
      setCalc({
        status: "erro",
        km: null,
        estimada: false,
        mensagem: e instanceof Error ? e.message : "Não foi possível consultar o CEP.",
      });
    }
  }

  function aoDigitarCep(valor: string) {
    const formatado = formatarCep(valor);
    setCep(formatado);
    limparCalculo();
    if (limparCep(formatado).length === 8) void consultarCepECalcular(formatado);
  }

  // Qualquer edição de rua/bairro/cidade/UF invalida o cálculo anterior
  function editarEndereco(setter: (v: string) => void, valor: string) {
    setter(valor);
    limparCalculo();
  }

  function calcularPeloBotao() {
    if (!rua || !cidade || !uf) {
      alert("Digite o CEP (ou preencha rua, cidade e UF) para calcular a entrega.");
      return;
    }
    const id = ++calcId.current;
    void calcular({ rua, numero, bairro, cidade, uf, coords: coordsCliente }, id);
  }

  async function sendOrder() {
    if (enviando) return;
    const hojeLocal = new Date().toLocaleDateString("en-CA", { timeZone: "America/Rio_Branco" });
    const pedidoHoje = dataPedido === hojeLocal;
    if (pedidoHoje && !lojaEstaAberta(store?.open_status, new Date(), store?.hours_text)) {
      alert("A loja está fechada para pedidos de hoje. Escolha uma data futura para agendar.");
      return;
    }
    if (!nome || !tel || !dataPedido || !horario || !pagamento) {
      alert("Preencha todos os campos obrigatórios!");
      return;
    }
    if (tipo === "entrega") {
      if (!rua || !numero || !bairro || !cidade) {
        alert("Preencha o endereço completo: rua, número, bairro e cidade.");
        return;
      }
      if (kmAtual === null || !frete) {
        alert(
          calc.status === "fora"
            ? "Esse endereço fica fora da nossa área de entrega. Escolha retirada ou fale com a loja."
            : "Calcule a taxa de entrega antes de enviar o pedido.",
        );
        return;
      }
    }
    if (!whatsLoja) {
      alert("O WhatsApp da loja ainda não foi configurado no painel.");
      return;
    }

    const [ano, mes, dia] = dataPedido.split("-");
    let txt = `🎉 *PEDIDO - ${store?.name ?? "BELLA SALGADINHOS"}*\n`;
    txt += `👤 *Cliente:* ${nome}\n📱 *Telefone:* ${tel}\n`;
    txt += `📅 *Data:* ${dia}/${mes}/${ano} às ${horario}\n`;
    txt += `🚚 *Tipo:* ${tipo === "entrega" ? "Entrega" : "Retirada"}\n`;
    if (tipo === "entrega") {
      txt += `📍 *Endereço:* ${rua}, Nº ${numero}${complemento ? ` - ${complemento}` : ""}\n`;
      txt += `🏘️ *Bairro:* ${bairro} — ${cidade}${uf ? `/${uf}` : ""}${cep ? ` — CEP ${cep}` : ""}\n`;
      txt += `📏 *Distância:* ~${fmtKm(kmAtual ?? 0)} km${calc.estimada ? " (estimada)" : ""}\n`;
    }
    txt += `\n📦 *ITENS:*\n`;
    cart.forEach((i) => {
      txt += `• *${i.qty}x ${i.name}*`;
      if (i.sizeLabel) txt += ` (${i.sizeLabel})`;
      txt += ` - ${money(i.unitPrice * i.qty)}\n`;
      if (i.flavors.length) txt += `   _Sabores: ${i.flavors.join(", ")}_\n`;
      if (i.singleFlavor) txt += `   _Sabor: ${i.singleFlavor}_\n`;
      const escolhas = Object.entries(i.choices);
      if (escolhas.length) txt += `   _Escolhas: ${escolhas.map(([k, v]) => `${k}: ${v}`).join(" | ")}_\n`;
      if (i.obs) txt += `   _Obs: ${i.obs}_\n`;
    });
    txt += `\n💳 *Pagamento:* ${pagamento}`;
    if (pagamento === "Dinheiro" && troco) txt += ` (Troco para: R$ ${troco})`;
    if (tipo === "entrega" && frete) {
      txt += `\n\n🛵 *Taxa de Entrega:* ${money(frete.taxa)}`;
      if (frete.cobraRetorno) txt += ` _(inclui retorno do motoboy)_`;
      if (sobretaxaAplicada > 0) {
        txt += `\n➕ *${store?.surcharge_label ?? "Taxa adicional"}:* ${money(sobretaxaAplicada)}`;
      }
    }
    txt += `\n💰 *TOTAL:* ${money(subtotal + taxaTotal)}`;

    // Registra o pedido antes de abrir o WhatsApp
    setEnviando(true);
    try {
      const { id } = await doCreateOrder({
        data: {
          customer_name: nome,
          customer_phone: tel,
          order_type: tipo,
          scheduled_date: dataPedido,
          scheduled_time: horario,
          payment_method: pagamento,
          change_for: pagamento === "Dinheiro" && troco ? troco : null,
          cep: tipo === "entrega" && cep ? cep : null,
          address:
            tipo === "entrega"
              ? `${rua}, ${numero}${complemento ? ` - ${complemento}` : ""} - ${bairro}, ${cidade}${uf ? `/${uf}` : ""}`
              : null,
          distance_km: tipo === "entrega" ? kmAtual : null,
          distance_estimated: tipo === "entrega" && calc.estimada,
          delivery_fee: tipo === "entrega" && frete ? frete.taxa : 0,
          return_fee_applied: Boolean(tipo === "entrega" && frete?.cobraRetorno),
          surcharge: sobretaxaAplicada,
          subtotal,
          total: subtotal + taxaTotal,
          items: cart.map(({ key: _k, ...i }) => i),
        },
      });
      txt = `🧾 *Pedido nº ${id.slice(0, 8).toUpperCase()}*\n` + txt;
    } catch (e) {
      setEnviando(false);
      alert(e instanceof Error ? e.message : "Não foi possível registrar o pedido.");
      return;
    }
    setEnviando(false);
    setCart([]);
    setCartOpen(false);
    window.location.href = `https://api.whatsapp.com/send?phone=${whatsLoja}&text=${encodeURIComponent(txt)}`;
  }

  const aberto = lojaEstaAberta(store?.open_status, new Date(), store?.hours_text);
  const semPonto = !lojaCoords;

  return (
    <div className="saboretal st-body">
      <div className="app-container">
        <div
          className="store-cover"
          style={store?.cover_url ? { backgroundImage: `url('${store.cover_url}')` } : undefined}
        >
          {store?.logo_url ? (
            <img src={store.logo_url} alt="Logo" className="store-logo-main" />
          ) : null}
        </div>

        <div className="store-info-card">
          <h1 className="store-name">{store?.name ?? "Bella Salgadinhos"}</h1>
          <p className="store-desc">{store?.description ?? ""}</p>
          <div className="store-badges">
            <span className={aberto ? "badge-open" : "badge-closed"}>
              {aberto ? "Aberto Agora" : "Fechado"}
            </span>
            <span className="badge-delivery">{store?.hours_text ?? "Seg-Sáb: 13h-21h"}</span>
          </div>
        </div>

        <nav className="sticky-nav">
          {grupos.map((c, i) => (
            <button
              key={c.id}
              className={`nav-item ${i === 0 ? "active" : ""}`}
              onClick={() =>
                document.getElementById(`sec-${c.id}`)?.scrollIntoView({ behavior: "smooth" })
              }
            >
              {c.title}
            </button>
          ))}
        </nav>

        <div>
          {isLoading ? (
            <p style={{ padding: 20, color: "#6b7280" }}>Carregando cardápio...</p>
          ) : null}
          {isError ? (
            <p style={{ padding: 20, color: "#6b7280" }}>
              Não foi possível carregar o cardápio agora. Tente novamente em instantes.
            </p>
          ) : null}

          {grupos.map((c) => (
            <section className="menu-section" id={`sec-${c.id}`} key={c.id}>
              <h2 className="section-title">{c.title}</h2>
              {c.items.map((p) => (
                <button
                  className="product-card"
                  key={p.id}
                  onClick={() => openProduct(p)}
                  disabled={!p.active}
                  style={
                    !p.active
                      ? { opacity: 0.55, filter: "grayscale(0.8)", cursor: "not-allowed" }
                      : undefined
                  }
                >
                  <div className="product-info">
                    {!p.active && (
                      <span
                        style={{
                          display: "inline-block",
                          backgroundColor: "#ef4444",
                          color: "#ffffff",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "4px",
                          marginBottom: "6px",
                          textTransform: "uppercase",
                          width: "fit-content",
                        }}
                      >
                        Indisponível no momento
                      </span>
                    )}
                    <h3 className="product-title">{p.name}</h3>
                    <p className="product-desc">{p.description}</p>
                    <span className="product-price">
                      {p.sizes.length > 0 || p._modo ? "A partir de " : ""}
                      {money(basePrice(p))}
                    </span>
                  </div>
                  {p.image_url ? (
                    <img src={p.image_url} className="product-img" alt={p.name} />
                  ) : null}
                </button>
              ))}
            </section>
          ))}
        </div>

        <a href="/painel" className="owner-link">
          Área do dono da loja
        </a>
      </div>

      {qtdTotal > 0 ? (
        <button className="float-cart-bar visible" onClick={() => setCartOpen(true)}>
          <span className="cart-left">
            <span className="cart-count">{qtdTotal}</span> Ver Carrinho
          </span>
          <span className="cart-total">{money(subtotal)}</span>
        </button>
      ) : null}

      <div
        className={`st-overlay ${open || cartOpen ? "active" : ""}`}
        onClick={() => {
          setOpen(null);
          setCartOpen(false);
        }}
      />

      {/* Modal do Produto */}
      <div className={`bottom-sheet ${open ? "active" : ""}`}>
        {open ? (
          <>
            <div className="modal-img-wrapper">
              {open.image_url ? (
                <img src={open.image_url} className="modal-main-img" alt={open.name} />
              ) : null}
              <button
                className="btn-close"
                onClick={() => setOpen(null)}
                style={{
                  width: 40,
                  height: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.3rem",
                  fontWeight: 700,
                  color: "#ffffff",
                  backgroundColor: "rgba(0, 0, 0, 0.55)",
                  border: "2px solid #ffffff",
                  borderRadius: "50%",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                }}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <h2 className="modal-title">{open.name}</h2>
              <p className="modal-desc" style={{ whiteSpace: "pre-line" }}>
                {open.description}
              </p>
              <p className="modal-price">{money(isRefri ? totalRefri : unitPrice)}</p>

              {open.sizes.length > 0 ? (
                <div className="size-selector">
                  {open.sizes.map((s: Size, i: number) => (
                    <button
                      key={s.label}
                      className={`size-option ${i === sizeIdx ? "selected" : ""}`}
                      onClick={() => {
                        setSizeIdx(i);
                        setFlavors([]);
                      }}
                    >
                      <div className="size-option-label">{s.label}</div>
                      <div className="size-option-price">{money(s.price)}</div>
                    </button>
                  ))}
                </div>
              ) : null}

              {open.flavors.length > 0 && open.allow_assorted && !isRefri ? (
                <div className="delivery-options" style={{ marginBottom: 12 }}>
                  <button
                    className={`delivery-option ${!sortido ? "selected" : ""}`}
                    onClick={() => setSortido(false)}
                  >
                    Quero escolher os sabores
                  </button>
                  <button
                    className={`delivery-option ${sortido ? "selected" : ""}`}
                    onClick={() => setSortido(true)}
                  >
                    Sortidos
                  </button>
                </div>
              ) : null}

              {isRefri ? (
                <div className="obs-box" style={{ marginBottom: 12 }}>
                  <b style={{ fontSize: "0.9rem" }}>Escolha a quantidade de cada um</b>
                  <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                    {open.flavors.map((f) => (
                      <div
                        key={f}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
                      >
                        <span style={{ fontSize: "0.9rem" }}>
                          {f}
                          <span style={{ display: "block", fontSize: "0.75rem", color: "#6b7280" }}>
                            {money(refriPrecos[f] ?? 0)}
                          </span>
                        </span>
                        <div className="qty-controls">
                          <button
                            className="qty-btn"
                            onClick={() => setRefriQtys((c) => ({ ...c, [f]: Math.max(0, (c[f] ?? 0) - 1) }))}
                          >
                            -
                          </button>
                          <span className="qty-value">{refriQtys[f] ?? 0}</span>
                          <button
                            className="qty-btn"
                            onClick={() => setRefriQtys((c) => ({ ...c, [f]: (c[f] ?? 0) + 1 }))}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {open.flavors.length > 0 && !sortido && !isRefri ? (
                <div className="obs-box" style={{ marginBottom: 12 }}>
                  <b style={{ fontSize: "0.9rem" }}>Sabores (escolha até {maxSabores})</b>
                  <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                    {open.flavors.map((f) => (
                      <label
                        key={f}
                        style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.85rem", cursor: "pointer" }}
                      >
                        <input
                          type="checkbox"
                          checked={flavors.includes(f)}
                          onChange={() => toggleFlavor(f)}
                          style={{ width: 18, height: 18, accentColor: "#b45309" }}
                        />
                        {f}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {open.single_flavors.length > 0 ? (
                <div className="obs-box" style={{ marginBottom: 12 }}>
                  <b style={{ fontSize: "0.9rem" }}>Escolha o sabor</b>
                  <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                    {open.single_flavors.map((f) => (
                      <label
                        key={f}
                        style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.9rem", cursor: "pointer" }}
                      >
                        <input
                          type="radio"
                          name="single"
                          checked={single === f}
                          onChange={() => setSingle(f)}
                          style={{ width: 18, height: 18, accentColor: "#b45309" }}
                        />
                        {f}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {effectiveChoiceGroups.map((g) => (
                <div className="obs-box" style={{ marginBottom: 12 }} key={g.title}>
                  <b style={{ fontSize: "0.9rem", color: "#9a3412" }}>
                    {g.title} <span style={{ color: "#ef4444" }}>*</span>
                  </b>
                  <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                    {g.options.map((o) => (
                      <label
                        key={o}
                        style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.9rem", cursor: "pointer" }}
                      >
                        <input
                          type="radio"
                          name={`choice-${g.title}`}
                          checked={choices[g.title] === o}
                          onChange={() => setChoices((c) => ({ ...c, [g.title]: o }))}
                          style={{ width: 18, height: 18, accentColor: "#b45309" }}
                        />
                        {o}
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              <div className="obs-box">
                <b style={{ fontSize: "0.9rem" }}>Observações</b>
                <textarea
                  className="obs-textarea"
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  placeholder="Ex: sem cebola, entregar na portaria..."
                />
              </div>
            </div>
            <div className="modal-footer">
              {!isRefri ? (
                <div className="qty-controls">
                  <button className="qty-btn" onClick={() => setQty((q) => Math.max(1, q - 1))}>
                    -
                  </button>
                  <span className="qty-value">{qty}</span>
                  <button className="qty-btn" onClick={() => setQty((q) => q + 1)}>
                    +
                  </button>
                </div>
              ) : null}
              <button className="btn-add" onClick={addToCart}>
                <span>Adicionar</span>
                <span>{money(isRefri ? totalRefri : unitPrice * qty)}</span>
              </button>
            </div>
          </>
        ) : null}
      </div>

      {/* Resumo do Carrinho */}
      <div className={`bottom-sheet ${cartOpen ? "active" : ""}`}>
        <div className="sheet-handle" />
        <div className="cart-header">
          <span className="cart-title">Resumo do Pedido</span>
          <button className="btn-close" style={{ position: "static" }} onClick={() => setCartOpen(false)}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {cart.map((i, idx) => (
            <div className="cart-item-row" key={i.key}>
              <div style={{ flex: 1 }}>
                <b>
                  {i.qty}x {i.name}
                </b>
                {i.sizeLabel ? <span className="cart-item-add-text">{i.sizeLabel}</span> : null}
                {i.flavors.length > 0 ? (
                  <span className="cart-item-add-text" style={{ color: "#b45309" }}>
                    Sabores: {i.flavors.join(", ")}
                  </span>
                ) : null}
                {Object.keys(i.choices).length > 0 ? (
                  <span className="cart-item-add-text" style={{ color: "#b45309" }}>
                    Escolhas: {Object.entries(i.choices).map(([k, v]) => `${k}: ${v}`).join(" | ")}
                  </span>
                ) : null}
                {i.singleFlavor ? (
                  <span className="cart-item-add-text" style={{ color: "#b45309" }}>
                    Sabor: {i.singleFlavor}
                  </span>
                ) : null}
                {i.obs ? <span className="cart-item-add-text">Obs: {i.obs}</span> : null}
                <br />
                <span style={{ color: "#15803d", fontWeight: 600 }}>{money(i.unitPrice * i.qty)}</span>
              </div>
              <button
                onClick={() => setCart((c) => c.filter((_, n) => n !== idx))}
                style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}
              >
                Remover
              </button>
            </div>
          ))}

          <div className="form-section">
            <h3>Tipo de Entrega</h3>
            <div className="delivery-options">
              <button
                className={`delivery-option ${tipo === "entrega" ? "selected" : ""}`}
                onClick={() => setTipo("entrega")}
              >
                Entrega
              </button>
              <button
                className={`delivery-option ${tipo === "retirada" ? "selected" : ""}`}
                onClick={() => setTipo("retirada")}
              >
                Retirada
              </button>
            </div>
          </div>

          <div className="form-section">
            <h3>📅 Data e Horário</h3>
            <div className="datetime-section">
              <div className="input-group">
                <input
                  type="date"
                  min={new Date().toLocaleDateString("en-CA")}
                  className="input-control"
                  value={dataPedido}
                  onChange={(e) => { setDataPedido(e.target.value); setHorario(""); }}
                />
              </div>
              <div className="input-group">
                <select
                  className="input-control"
                  value={horario}
                  onChange={(e) => setHorario(e.target.value)}
                >
                  <option value="">Selecione...</option>
                  {horarios.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>📍 Seus Dados</h3>
            <div className="input-group">
              <input
                className="input-control"
                placeholder="Seu Nome completo"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
            <div className="input-group">
              <input
                className="input-control"
                placeholder="Telefone (WhatsApp)"
                value={tel}
                onChange={(e) => setTel(e.target.value)}
              />
            </div>
          </div>

          {tipo === "entrega" ? (
            <div className="form-section">
              <h3>🏠 Endereço de entrega</h3>

              {store?.surcharge_active && sobretaxa > 0 ? (
                <div style={caixa("#fffbeb", "#fcd34d", "#92400e")}>
                  ⚠️ {store.surcharge_label}: adicional de {money(sobretaxa)} na entrega.
                </div>
              ) : null}

              <div className="input-group">
                <input
                  className="input-control"
                  inputMode="numeric"
                  maxLength={9}
                  placeholder="CEP (só números)"
                  value={cep}
                  onChange={(e) => aoDigitarCep(e.target.value)}
                />
              </div>
              <div className="input-group">
                <input
                  className="input-control"
                  placeholder="Rua / Avenida"
                  value={rua}
                  onChange={(e) => editarEndereco(setRua, e.target.value)}
                />
              </div>
              <div className="input-group" style={{ display: "flex", gap: 8 }}>
                <input
                  className="input-control"
                  style={{ flex: 1 }}
                  placeholder="Número"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                />
                <input
                  className="input-control"
                  style={{ flex: 2 }}
                  placeholder="Complemento (opcional)"
                  value={complemento}
                  onChange={(e) => setComplemento(e.target.value)}
                />
              </div>
              <div className="input-group">
                <input
                  className="input-control"
                  placeholder="Bairro"
                  value={bairro}
                  onChange={(e) => editarEndereco(setBairro, e.target.value)}
                />
              </div>
              <div className="input-group" style={{ display: "flex", gap: 8 }}>
                <input
                  className="input-control"
                  style={{ flex: 3 }}
                  placeholder="Cidade"
                  value={cidade}
                  onChange={(e) => editarEndereco(setCidade, e.target.value)}
                />
                <input
                  className="input-control"
                  style={{ flex: 1 }}
                  maxLength={2}
                  placeholder="UF"
                  value={uf}
                  onChange={(e) => editarEndereco(setUf, e.target.value.toUpperCase())}
                />
              </div>

              <button
                type="button"
                onClick={calcularPeloBotao}
                disabled={calc.status === "loading"}
                style={{
                  width: "100%",
                  padding: "11px 12px",
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  marginBottom: 10,
                  opacity: calc.status === "loading" ? 0.7 : 1,
                }}
              >
                {calc.status === "loading" ? "Calculando..." : "Calcular taxa de entrega"}
              </button>

              {calc.status === "loading" ? (
                <div style={caixa("#eff6ff", "#bfdbfe", "#1e40af")}>⏳ {calc.mensagem}</div>
              ) : null}

              {kmAtual !== null ? (
                <div style={caixa("#eff6ff", "#bfdbfe", "#1e40af")}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                    <span>
                      📍{" "}
                      { `Distância: ~${fmtKm(kmAtual)} km${calc.estimada ? " (estimada)" : ""}` }
                    </span>
                    <span style={{ color: "#15803d", fontWeight: 800 }}>
                      {frete ? money(frete.taxa) : "—"}
                    </span>
                  </div>
                  <span style={{ fontSize: "0.75rem" }}>
                    {!pagamento
                      ? "A taxa pode mudar conforme a forma de pagamento."
                      : frete?.cobraRetorno
                        ? "Inclui o retorno do motoboy (cartão/dinheiro)."
                        : "Taxa de ida (Pix, sem taxa de retorno)."}
                  </span>
                </div>
              ) : null}

              {calc.status === "fora" ? (
                <div style={caixa("#fef2f2", "#fecaca", "#991b1b")}>
                  <span>
                    Esse endereço fica a ~{calc.km !== null ? fmtKm(calc.km) : "?"} km, fora da nossa
                    área de entrega (até {LIMITE_KM} km). Escolha retirada
                    {whatsLoja ? " ou fale com a loja:" : "."}
                  </span>
                  {whatsLoja ? (
                    <a
                      href={`https://api.whatsapp.com/send?phone=${whatsLoja}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#991b1b", textDecoration: "underline" }}
                    >
                      Falar com a loja no WhatsApp
                    </a>
                  ) : null}
                </div>
              ) : null}

              {calc.status === "erro" && calc.mensagem ? (
                <div style={caixa("#fffbeb", "#fcd34d", "#92400e")}>{calc.mensagem}</div>
              ) : null}

            </div>
          ) : null}

          <div className="form-section">
            <h3>💳 Forma de Pagamento</h3>
            <div className="input-group">
              <select
                className="input-control"
                value={pagamento}
                onChange={(e) => setPagamento(e.target.value)}
              >
                <option value="">Selecione...</option>
                <option value="Pix">Pix{tipo === "entrega" ? " — sem taxa de retorno" : ""}</option>
                <option value="Cartão">
                  Cartão{tipo === "entrega" ? " — com taxa de retorno do motoboy" : ""}
                </option>
                <option value="Dinheiro">
                  Dinheiro{tipo === "entrega" ? " — com taxa de retorno do motoboy" : ""}
                </option>
              </select>
            </div>
            {pagamento === "Dinheiro" ? (
              <div className="input-group">
                <input
                  className="input-control"
                  placeholder="Precisa de troco para quanto? (Ex: 100)"
                  value={troco}
                  onChange={(e) => setTroco(e.target.value)}
                />
              </div>
            ) : null}
          </div>

          <div className="receipt-card">
            <div className="receipt-line">
              <span>Subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            {tipo === "entrega" ? (
              <div className="receipt-line">
                <span>Taxa de entrega</span>
                <span>{frete ? money(frete.taxa) : "a calcular"}</span>
              </div>
            ) : null}
            {tipo === "entrega" && sobretaxaAplicada > 0 ? (
              <div className="receipt-line">
                <span>{store?.surcharge_label}</span>
                <span>{money(sobretaxaAplicada)}</span>
              </div>
            ) : null}
            <div className="receipt-total">
              <span>Total</span>
              <span>{money(subtotal + taxaTotal)}</span>
            </div>
          </div>

          <button className="btn-whatsapp" onClick={() => void sendOrder()} disabled={enviando || (!aberto && dataPedido === new Date().toLocaleDateString("en-CA", { timeZone: "America/Rio_Branco" }))}>
            {!aberto && dataPedido === new Date().toLocaleDateString("en-CA", { timeZone: "America/Rio_Branco" })
              ? "Loja fechada para pedidos de hoje"
              : enviando
                ? "Registrando pedido..."
                : "Enviar Pedido no WhatsApp"}
          </button>
        </div>
      </div>
    </div>
  );
}
