import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { useServerFn } from "@tanstack/react-start";
import { fetchMenu, lojaEstaAberta, money, type Product, type Size } from "@/lib/menu-data";
import { createOrder } from "@/lib/menu.functions";
import { applyCatalogChoices, cakeFlavors, fixedComboDrinks, kitChecklist, packFlavorLimit, partyKitDrinks, splitFriedProducts, usesFlavorQuantities } from "@/lib/menu-rules";
import {
  LIMITE_KM,
  TABELA_FRETE,
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

function packUnitCount(label: string, fallbackName = ""): number {
  const text = normalizarTexto(`${label} ${fallbackName}`);
  const match = text.match(/\b(15|25|50|100|200|300)\b/);
  return match ? Number(match[1]) : 0;
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

function normalizarTexto(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getNumeroDoNome(p: Product, prefixo: string): number | null {
  const nome = normalizarTexto(p.name);
  const m = nome.match(new RegExp(`${prefixo}\\s*(\\d+)`));
  return m?.[1] ? Number(m[1]) : null;
}

function aplicarRegrasCatalogo(p: Product): Product {
  const nome = normalizarTexto(p.name);
  const baseFlavors = p.flavors?.length ? p.flavors : [
    "Coxinha", "Milho", "Queijo", "Calabresa", "Napolitano", "Carne", "Kibe", "Bolinho de Queijo",
  ];

  if (nome.includes("combo")) {
    const numero = getNumeroDoNome(p, "combo");
    const limite = numero === 1 ? 2 : numero === 2 ? 3 : numero === 3 ? 4 : undefined;
    const drinks = numero ? fixedComboDrinks(numero) : p.choice_groups;
    return {
      ...p,
      flavors: baseFlavors,
      single_flavors: [],
      units_per_flavor: limite ? 1 : 0,
      units_base: limite ?? null,
      choice_groups: drinks ?? [],
    };
  }

  if (nome.includes("kit festa")) {
    const numero = getNumeroDoNome(p, "kit festa");
    return {
      ...p,
      flavors: baseFlavors,
      single_flavors: cakeFlavors,
      units_per_flavor: 0,
      units_base: null,
      choice_groups: numero ? partyKitDrinks(numero) : (p.choice_groups ?? []),
    };
  }

  return p;
}

function Cardapio() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["menu"], queryFn: fetchMenu, refetchInterval: 60_000 });
  const doCreateOrder = useServerFn(createOrder);
  const [enviando, setEnviando] = useState(false);

  // Produto aberto
  const [open, setOpen] = useState<Product | null>(null);
  const [sizeIdx, setSizeIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [flavors, setFlavors] = useState<string[]>([]);
  const [flavorQtys, setFlavorQtys] = useState<Record<string, number>>({});
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [single, setSingle] = useState("");
  const [obs, setObs] = useState("");
  const [sortido, setSortido] = useState(false);
  const [choices, setChoices] = useState<Record<string, string>>({});

  // Carrinho e pedido
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("");
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
  const [faixaManual, setFaixaManual] = useState("");
  const calcId = useRef(0);

  const store = data?.store ?? null;
  const effectiveChoiceGroups = open ? getChoiceGroups(open) : [];
  const effectiveKitChecklist = open ? kitChecklist(open) : [];
  const whatsLoja = (store?.whatsapp ?? "").replace(/\D/g, "");
  const lojaCoords: CoordenadaGeo | null =
    store && store.store_lat !== null && store.store_lon !== null
      ? { lat: store.store_lat, lon: store.store_lon }
      : null;

  const grupos = useMemo(() => {
    if (!data) return [];

    const iconFor = (title: string) => {
      const t = normalizarTexto(title);
      if (t.includes("frito")) return "🥟";
      if (t.includes("lanche")) return "🥐";
      if (t.includes("congelado")) return "❄️";
      if (t.includes("kit") || t.includes("combo")) return "🎁";
      if (t.includes("refrigerante") || t.includes("bebida") || t.includes("lata") || t.includes("suco")) return "🥤";
      if (t.includes("mini pizza") || t.includes("pizza")) return "🍕";
      if (t.includes("empada")) return "🥧";
      if (t.includes("doce")) return "🍬";
      if (t.includes("bolo")) return "🎂";
      return "🍴";
    };

    const preferred = ["salgados fritos", "salgados tamanho lanche", "salgados congelados", "kits festa", "combos", "bebidas", "refrigerantes", "latas", "mini pizza", "empadas", "doces", "bolos"];
    const rank = (title: string) => {
      const t = normalizarTexto(title);
      const i = preferred.findIndex((x) => t === x || t.includes(x));
      return i < 0 ? 999 : i;
    };

    const base = [...data.categories]
      .sort((a, b) => rank(a.title) - rank(b.title) || (a.position ?? 0) - (b.position ?? 0))
      .map((c) => ({
        ...c,
        items: [...data.products]
          .map(applyCatalogChoices)
          .filter((p) => p.category_id === c.id)
          .map((p) => {
            const prepared = applyCatalogChoices(p);
            const productText = normalizarTexto(`${prepared.name} ${prepared.description ?? ""} ${c.title}`);
            const isStandaloneDrink = !/\b(combo|kit)\b/.test(normalizarTexto(prepared.name)) &&
              /bebida|refrigerante|refri|guarana|coca|kuat|sukita|fanta|sprite|suco/.test(productText);
            const isTwoLiterDrink = isStandaloneDrink &&
              /2\s*l|2 litros|2l|dois litros/.test(productText);
            const drinkOptions = (prepared.choice_groups?.[0] as ChoiceGroup | undefined)?.options ??
              (isTwoLiterDrink ? [
                "Coca Original", "Coca Zero", "Guaraná Antarctica", "Kuat",
                "Sukita Laranja", "Sukita Uva", "Fanta Laranja", "Fanta Uva",
              ] : []);
            return {
              ...prepared,
              ...(usesFlavorQuantities(prepared, c.title) ? { _qtyModeCategoria: true } : {}),
              ...((packUnitCount(prepared.sizes?.[0]?.label ?? "", prepared.name) > 0 ||
                /\b(cento|centena)\b/.test(normalizarTexto(prepared.name))) && prepared.flavors?.length
                ? { _packFlavorMode: true }
                : {}),
              ...(isTwoLiterDrink && drinkOptions.length
                ? { _qtyModeCategoria: true, flavors: drinkOptions, choice_groups: [] }
                : {}),
            };
          })
          .map((p) => aplicarRegrasCatalogo(p))
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
      }))
      .filter((c) => c.items.length > 0);

    const isBeverageCategory = (title: string) => {
      const t = normalizarTexto(title);
      return t.includes("bebida") || t.includes("refrigerante") || t.includes("refri") || t.includes("lata") || t.includes("suco");
    };
    const bebida = base.filter((c) => isBeverageCategory(c.title));
    const outras = base.filter((c) => !isBeverageCategory(c.title));

    // Refrigerantes de 2L ganham uma aba própria e continuam usando os produtos,
    // preços e fotos cadastrados na Bella. Os demais itens de bebida ficam em Bebidas.
    const produtosBebida = bebida.flatMap((c) =>
      c.items.map((p) => ({ product: p, categoryTitle: c.title })),
    );
    const ehRefri2L = (p: Product, categoryTitle: string) => {
      const texto = normalizarTexto(`${p.name} ${p.description ?? ""} ${categoryTitle}`);
      return /\b2\s*l\b|\b2l\b|2 litros|dois litros/.test(texto);
    };
    const itensRefri2L = produtosBebida.filter(({ product, categoryTitle }) =>
      ehRefri2L(product, categoryTitle),
    ).map(({ product }) => product);
    const idsRefri2L = new Set(itensRefri2L.map((p) => p.id));
    const itensOutrasBebidas = produtosBebida
      .filter(({ product }) => !idsRefri2L.has(product.id))
      .map(({ product }) => product);

    const resultado = [...outras];
    if (itensRefri2L.length > 0 && bebida[0]) {
      const primeiro = itensRefri2L[0];
      const sabores = itensRefri2L.map((p) => p.name);
      const refriMontavel = {
        ...primeiro,
        id: "__montar_refri_2l",
        name: "Monte seu Refri 2L",
        description: "Escolha os sabores e a quantidade de cada refrigerante.",
        flavors: sabores,
        single_flavors: [],
        choice_groups: [],
        allow_assorted: true,
        _qtyModeCategoria: true,
      } as Product;
      resultado.push({
        ...bebida[0],
        id: "__refri_2l",
        title: "🥤 Refri 2L",
        items: [refriMontavel],
      });
    }
    if (itensOutrasBebidas.length > 0 && bebida[0]) {
      const primeiro = itensOutrasBebidas[0];
      const bebidasMontaveis = {
        ...primeiro,
        id: "__montar_bebidas",
        name: "Escolha suas bebidas",
        description: "Escolha os sabores e informe a quantidade de cada um.",
        flavors: itensOutrasBebidas.map((p) => p.name),
        single_flavors: [],
        choice_groups: [],
        allow_assorted: true,
        _qtyModeCategoria: true,
      } as Product;
      resultado.push({
        ...bebida[0],
        id: "__bebidas",
        title: "🥤 Bebidas",
        items: [bebidasMontaveis],
      });
    }

    // Cada aba de salgadinhos vira um configurador único quando os itens
    // representam sabores do mesmo pacote; não deixa cada sabor solto no menu.
    const agrupados = resultado.map((categoria) => {
      const titulo = normalizarTexto(categoria.title);
      const ehSalgadinho = /salgad|frito/.test(titulo) &&
        !/congelado|lanche|avulso/.test(titulo);
      if (!ehSalgadinho || categoria.items.length < 2) return categoria;

      const candidatos = categoria.items.filter((p) => {
        const texto = normalizarTexto(`${p.name} ${p.description ?? ""} ${p.sizes.map((z) => z.label).join(" ")}`);
        return /cento|centena|100 unidades|50 unidades|meio cento|1\/2 cento/.test(texto) ||
          p.sizes.some((z) => packUnitCount(z.label, p.name) >= 50);
      });
      if (candidatos.length < 2) return categoria;

      const meioCento = /1\/2|meio cento|50 unidades/.test(titulo);
      const alvo = meioCento ? 50 : 100;
      const baseProduto = candidatos.find((p) => packUnitCount(p.sizes[0]?.label ?? "", p.name) === alvo) ?? candidatos[0];
      const sabores = candidatos.map((p) => p.name);
      const montavel = {
        ...baseProduto,
        id: `__montar_cento_${categoria.id}`,
        name: meioCento ? "Monte seu meio cento" : "Monte seu cento",
        description: `Escolha os sabores e distribua exatamente ${alvo} unidades.`,
        flavors: sabores,
        single_flavors: [],
        choice_groups: [],
        allow_assorted: true,
        _packFlavorMode: true,
        _packTargetOverride: alvo,
      } as Product;
      return {
        ...categoria,
        items: [montavel, ...categoria.items.filter((p) => !candidatos.some((x) => x.id === p.id))],
      };
    });

    return agrupados.map((c) => ({
      ...c,
      title: c.title.match(/^[🥟🥐❄️🎁🥤🍕🥧🍬🎂🍴]/u) ? c.title : `${iconFor(c.title)} ${c.title}`,
    }));
  }, [data]);

  useEffect(() => {
    if (!grupos.length) return;
    if (!activeCategory) setActiveCategory(grupos[0].id);
    const sections = grupos.map((g) => document.getElementById(`sec-${g.id}`)).filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target?.id) setActiveCategory(visible.target.id.replace(/^sec-/, ""));
    }, { rootMargin: "-90px 0px -65% 0px", threshold: [0.1, 0.5] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [grupos, activeCategory]);

  const unitPrice = open
    ? open.sizes.length > 0
      ? (open.sizes[sizeIdx]?.price ?? 0)
      : (open.price ?? 0)
    : 0;

  const categoryTitle = open ? data?.categories.find((c) => c.id === open.category_id)?.title : undefined;
  const maxSabores = open
    ? (packFlavorLimit(open, sizeIdx, categoryTitle) ?? Math.min(
        open.flavors.length,
        open.units_base
          ? Math.max(1, Math.floor((open.units_base * qty) / (open.units_per_flavor || 25)))
          : open.flavors.length,
      ))
    : 0;
  const isQtyMode = open ? Boolean((open as Product & { _qtyModeCategoria?: boolean })._qtyModeCategoria) : false;
  const isPackFlavorMode = open ? Boolean((open as Product & { _packFlavorMode?: boolean })._packFlavorMode) : false;
  const packTarget = open ? ((open as Product & { _packTargetOverride?: number })._packTargetOverride ?? packUnitCount(open.sizes[sizeIdx]?.label ?? "", open.name)) : 0;
  const listaSaboresQty = open ? (open.flavors?.length ? open.flavors : open.single_flavors ?? []) : [];
  const totalFlavorQty = Object.values(flavorQtys).reduce((a, b) => a + b, 0);

  // ----- Frete -----
  const faixaManualObj = faixaManual !== "" ? TABELA_FRETE[Number(faixaManual)] : undefined;
  const kmAtual: number | null = faixaManualObj
    ? faixaManualObj.maxKm
    : calc.status === "ok"
      ? calc.km
      : null;
  const frete = tipo === "entrega" && kmAtual !== null ? calcularTaxaEntrega(kmAtual, pagamento) : null;
  const sobretaxa = store?.surcharge_active ? store.surcharge_amount : 0;
  const sobretaxaAplicada = frete ? sobretaxa : 0;
  const taxaTotal = frete ? frete.taxa + sobretaxaAplicada : 0;

  const subtotal = cart.reduce((a, i) => a + i.unitPrice * i.qty, 0);
  const qtdTotal = cart.reduce((a, i) => a + i.qty, 0);

  const horarios: string[] = [];
  for (let h = 13; h <= 20; h++) {
    horarios.push(`${String(h).padStart(2, "0")}:00`, `${String(h).padStart(2, "0")}:30`);
  }
  horarios.push("21:00");

  function openProduct(p: Product) {
    if (!p.active) return;
    setOpen(p);
    setSizeIdx(0);
    setQty(1);
    setFlavors([]);
    setFlavorQtys({});
    setChecklist({});
    setSingle("");
    setObs("");
    setSortido(false);
    setChoices({});
  }

  function incFlavorQty(f: string) {
    setFlavorQtys((current) => ({ ...current, [f]: (current[f] ?? 0) + 1 }));
  }

  function decFlavorQty(f: string) {
    setFlavorQtys((current) => ({ ...current, [f]: Math.max(0, (current[f] ?? 0) - 1) }));
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

    if (isPackFlavorMode) {
      if (packTarget > 0 && totalFlavorQty !== packTarget) {
        alert(`Distribua exatamente ${packTarget} unidades entre os sabores. Você selecionou ${totalFlavorQty}.`);
        return;
      }
      if (totalFlavorQty === 0) {
        alert("Escolha a quantidade de cada sabor para continuar.");
        return;
      }
    } else if (isQtyMode) {
      if (totalFlavorQty === 0) {
        alert("Por favor, escolha a quantidade de pelo menos 1 sabor.");
        return;
      }
    } else if (open.flavors.length > 0 && !sortido && flavors.length === 0) {
      alert("Por favor, marque pelo menos 1 sabor (ou escolha Sortidos).");
      return;
    }

    if (!isQtyMode && !sortido && flavors.length > maxSabores) {
      alert(`Escolha no máximo ${maxSabores} sabores para este tamanho.`);
      return;
    }

    if (open.single_flavors.length > 0 && !single) {
      alert("Escolha o sabor obrigatório.");
      return;
    }

    const faltando = (isQtyMode || isPackFlavorMode) ? undefined : effectiveChoiceGroups.find((g) => !choices[g.title]);
    if (faltando) {
      alert(`Por favor, selecione uma opção para: "${faltando.title}"`);
      return;
    }

    if (effectiveKitChecklist.length > 0) {
      const faltandoChecklist = effectiveKitChecklist.find((item) => !checklist[item.title]);
      if (faltandoChecklist) {
        alert(`Marque para confirmar: "${faltandoChecklist.title}"`);
        return;
      }
    }

    const flavorsValue = (isQtyMode || isPackFlavorMode)
      ? Object.entries(flavorQtys).filter(([, value]) => value > 0).map(([flavor, value]) => `${value}x ${flavor}`)
      : open.flavors.length > 0 ? (sortido ? ["Sortidos"] : flavors) : [];

    setCart((current) => [
      ...current,
      {
        key: Date.now(),
        name: open.name,
        qty: isPackFlavorMode ? 1 : isQtyMode ? totalFlavorQty : qty,
        unitPrice,
        sizeLabel: open.sizes[sizeIdx]?.label ?? "",
        flavors: flavorsValue,
        singleFlavor: !isQtyMode && open.single_flavors.length > 0 ? single : "",
        choices: (isQtyMode || isPackFlavorMode) ? {} : Object.fromEntries(effectiveChoiceGroups.map((g) => [g.title, choices[g.title]])),
        checklist: effectiveKitChecklist.map((item) => `✓ ${item.title}`),
        obs,
      },
    ]);
    setOpen(null);
  }

  // ----- Endereço / CEP / cálculo da taxa -----
  function limparCalculo() {
    calcId.current++;
    setCalc(CALC_VAZIO);
    setFaixaManual("");
    setCoordsCliente(null);
  }

  async function calcular(dados: DadosEndereco, id: number) {
    if (!lojaCoords) {
      setCalc({
        status: "erro",
        km: null,
        estimada: false,
        mensagem:
          "A loja ainda não configurou o ponto de saída das entregas. Escolha a faixa de distância abaixo.",
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
        mensagem:
          (e instanceof Error ? e.message : "Não foi possível calcular.") +
          " Escolha a faixa de distância abaixo.",
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
      const coords = end.lat !== null && end.lon !== null ? { lat: end.lat, lon: end.lon } : null;
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
    setFaixaManual("");
    void calcular({ rua, numero, bairro, cidade, uf, coords: coordsCliente }, id);
  }

  async function sendOrder() {
    if (enviando) return;
    if (!lojaEstaAberta(store?.open_status)) {
      alert("A loja está fechada no momento. Tente novamente no horário de funcionamento.");
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
      txt += faixaManualObj
        ? `📏 *Distância:* faixa de ${fmtKm(faixaManualObj.minKm)} a ${fmtKm(faixaManualObj.maxKm)} km (escolhida pelo cliente)\n`
        : `📏 *Distância:* ~${fmtKm(kmAtual ?? 0)} km${calc.estimada ? " (estimada)" : ""}\n`;
    }
    txt += `\n📦 *ITENS:*\n`;
    cart.forEach((i) => {
      txt += `• *${i.qty}x ${i.name}*`;
      if (i.sizeLabel) txt += ` (${i.sizeLabel})`;
      txt += ` - ${money(i.unitPrice * i.qty)}\n`;
      if (i.flavors.length) txt += `   _Sabores: ${i.flavors.join(", ")}_\n`;
      if (i.singleFlavor) txt += `   _Sabor: ${i.singleFlavor}_\n`;
      if (Object.keys(i.choices).length) txt += `   _Escolhas: ${Object.entries(i.choices).map(([k, v]) => `${k}: ${v}`).join(" | ")}_\n`;
      if (i.checklist.length) txt += `   _Itens do kit: ${i.checklist.join(", ")}_\n`;
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

    // Grava o pedido antes de ir para o WhatsApp
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
          distance_estimated: tipo === "entrega" && (calc.estimada || Boolean(faixaManualObj)),
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
    window.location.href = `https://api.whatsapp.com/send?phone=${whatsLoja}&text=${encodeURIComponent(txt)}`;
  }

  const aberto = lojaEstaAberta(store?.open_status);
  const semPonto = !lojaCoords;
  const mostrarFaixaManual = tipo === "entrega" && (calc.status === "erro" || semPonto);

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
              className={`nav-item ${activeCategory === c.id || (!activeCategory && i === 0) ? "active" : ""}`}
              onClick={() => {
                setActiveCategory(c.id);
                document.getElementById(`sec-${c.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
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
                        Esgotado
                      </span>
                    )}
                    <h3 className="product-title">{p.name}</h3>
                    <p className="product-desc">{p.description}</p>
                    <span className="product-price">
                      {p.sizes.length > 0 ? "A partir de " : ""}
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
              <p className="modal-price">{money(isQtyMode && !isPackFlavorMode ? unitPrice * totalFlavorQty : unitPrice)}</p>

              {open.sizes.length > 0 ? (
                <div className="size-selector">
                  {open.sizes.map((s: Size, i: number) => (
                    <button
                      key={s.label}
                      className={`size-option ${i === sizeIdx ? "selected" : ""}`}
                      onClick={() => {
                        setSizeIdx(i);
                        setFlavors([]);
                        setFlavorQtys({});
                        setSortido(false);
                      }}
                    >
                      <div className="size-option-label">{s.label}</div>
                      <div className="size-option-price">{money(s.price)}</div>
                    </button>
                  ))}
                </div>
              ) : null}

              {(isQtyMode || isPackFlavorMode) ? (
                <div className="obs-box" style={{ marginBottom: 12 }}>
                  <b style={{ fontSize: "0.9rem" }}>
                    {isPackFlavorMode
                      ? `Distribua as ${packTarget || "unidades do pacote"} entre os sabores`
                      : "Sabores — escolha a quantidade de cada um"}
                  </b>
                  <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                    {listaSaboresQty.map((flavor) => (
                      <div key={flavor} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: "0.9rem" }}>{flavor}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <button type="button" onClick={() => decFlavorQty(flavor)} style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid #d1d5db", background: "#fff" }}>-</button>
                          <b style={{ minWidth: 20, textAlign: "center" }}>{flavorQtys[flavor] ?? 0}</b>
                          <button type="button" onClick={() => incFlavorQty(flavor)} style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid #d1d5db", background: "#fff" }}>+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 10, fontSize: "0.8rem", color: isPackFlavorMode && packTarget > 0 && totalFlavorQty !== packTarget ? "#b91c1c" : "#15803d", fontWeight: 700 }}>
                    {isPackFlavorMode && packTarget > 0
                      ? `Total: ${totalFlavorQty} de ${packTarget} unidades`
                      : `Total: ${totalFlavorQty} unidade(s)`}
                  </div>
                </div>
              ) : null}

              {!isQtyMode && open.flavors.length > 0 && open.allow_assorted ? (
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

              {!isQtyMode && open.flavors.length > 0 && !sortido ? (
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

              {effectiveKitChecklist.length > 0 ? (
                <div className="obs-box" style={{ marginBottom: 12 }}>
                  <b style={{ fontSize: "0.9rem", color: "#9a3412" }}>Itens inclusos no kit — marque para confirmar</b>
                  <div style={{ display: "grid", gap: 7, marginTop: 8 }}>
                    {effectiveKitChecklist.map((item) => (
                      <label key={item.title} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.9rem" }}>
                        <input type="checkbox" checked={Boolean(checklist[item.title])} onChange={() => setChecklist((current) => ({ ...current, [item.title]: !current[item.title] }))} style={{ width: 18, height: 18, accentColor: "#b45309" }} />
                        {item.title}
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
              <div className="qty-controls">
                <button
                  className="qty-btn"
                  onClick={() => {
                    if (!isQtyMode) {
                      setQty((q) => Math.max(1, q - 1));
                      return;
                    }
                    const selected = Object.keys(flavorQtys).filter((flavor) => (flavorQtys[flavor] ?? 0) > 0).pop();
                    if (selected) decFlavorQty(selected);
                  }}
                >
                  -
                </button>
                <span className="qty-value">{isQtyMode ? totalFlavorQty : qty}</span>
                <button
                  className="qty-btn"
                  onClick={() => {
                    if (!isQtyMode) {
                      setQty((q) => q + 1);
                      return;
                    }
                    const selected = Object.keys(flavorQtys).find((flavor) => (flavorQtys[flavor] ?? 0) > 0) ?? listaSaboresQty[0];
                    if (selected) incFlavorQty(selected);
                  }}
                >
                  +
                </button>
              </div>
              <button className="btn-add" onClick={addToCart}>
                <span>Adicionar</span>
                <span>{money(unitPrice * (isQtyMode ? totalFlavorQty : qty))}</span>
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
                {i.checklist.length ? (
                  <span className="cart-item-add-text" style={{ color: "#15803d" }}>
                    Itens do kit: {i.checklist.join(", ")}
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
                  className="input-control"
                  value={dataPedido}
                  onChange={(e) => setDataPedido(e.target.value)}
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
                      {faixaManualObj
                        ? `Faixa: ${fmtKm(faixaManualObj.minKm)} a ${fmtKm(faixaManualObj.maxKm)} km`
                        : `Distância: ~${fmtKm(kmAtual)} km${calc.estimada ? " (estimada)" : ""}`}
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

              {mostrarFaixaManual ? (
                <div className="input-group">
                  <select
                    className="input-control"
                    value={faixaManual}
                    onChange={(e) => setFaixaManual(e.target.value)}
                  >
                    <option value="">Escolha a faixa de distância aproximada...</option>
                    {TABELA_FRETE.map((f, i) => (
                      <option key={f.maxKm} value={String(i)}>
                        {i === 0 ? `Até ${fmtKm(f.maxKm)} km` : `${fmtKm(f.minKm)} a ${fmtKm(f.maxKm)} km`}
                      </option>
                    ))}
                  </select>
                </div>
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

          <button className="btn-whatsapp" onClick={() => void sendOrder()} disabled={enviando || !aberto}>
            {!aberto ? "Loja fechada no momento" : enviando ? "Registrando pedido..." : "Enviar Pedido no WhatsApp"}
          </button>
        </div>
      </div>
    </div>
  );
}
