import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import {
  fetchMenu,
  lojaEstaAberta,
  money,
  type Category,
  type OpenStatus,
  type Product,
  type Size,
  type Store,
} from "@/lib/menu-data";
import {
  deleteCategory,
  deleteProduct,
  fetchOrdersReport,
  cancelOrderFromReport,
  loginAdmin,
  saveCategory,
  saveProduct,
  saveStore,
  uploadImage,
} from "@/lib/menu.functions";
import { buscarCep, limparCep, resolverCoordenadas } from "@/lib/frete";

export const Route = createFileRoute("/painel")({
  head: () => ({
    meta: [
      { title: "Painel do dono | Bella Salgadinhos" },
      { name: "description", content: "Área restrita para gerenciar o cardápio da Bella Salgadinhos." },
      { property: "og:title", content: "Painel do dono | Bella Salgadinhos" },
      { property: "og:description", content: "Área restrita para gerenciar o cardápio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Painel,
});

// ---------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------
const card: React.CSSProperties = {
  background: "var(--bs-card)",
  border: "1px solid var(--bs-line)",
  borderRadius: 18,
  padding: 20,
  marginBottom: 16,
};
const secao: React.CSSProperties = { ...card, padding: 0, overflow: "hidden" };
const secaoTitulo: React.CSSProperties = {
  padding: "18px 20px",
  color: "var(--bs-ink)",
  fontWeight: 800,
  fontSize: "0.98rem",
  cursor: "pointer",
};
const secaoCorpo: React.CSSProperties = { padding: "4px 20px 20px" };
const input: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--bs-line)",
  borderRadius: 11,
  padding: 11,
  background: "var(--bs-surface-soft)",
  color: "var(--bs-ink)",
  fontSize: "0.9rem",
  marginBottom: 8,
};
const btn: React.CSSProperties = {
  background: "var(--bs-brand)",
  color: "var(--bs-on-brand)",
  border: "1px solid var(--bs-brand)",
  borderRadius: 11,
  padding: "10px 16px",
  fontWeight: 800,
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  background: "var(--bs-surface)",
  color: "var(--bs-ink)",
  border: "1px solid var(--bs-line)",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
  fontSize: "0.8rem",
};
const dica: React.CSSProperties = { fontSize: "0.75rem", color: "var(--bs-muted)", marginBottom: 8 };
const subtitulo: React.CSSProperties = { fontWeight: 800, fontSize: "0.85rem", margin: "18px 0 8px", color: "var(--bs-ink)" };

function hojeISO() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Rio_Branco", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? "";
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}
function deslocarDiaISO(base: string, dias: number) {
  const [ano, mes, dia] = base.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia + dias);
  return `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,"0")}-${String(data.getDate()).padStart(2,"0")}`;
}
function textoPagamento(valor: unknown) {
  const v = String(valor ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (v.includes("pix")) return "Pix";
  if (v.includes("cart")) return "Cartão";
  if (v.includes("din")) return "Dinheiro";
  return String(valor || "Não informado");
}
function csvCelula(valor: unknown) {
  return `"${String(valor ?? "").replace(/"/g, '""')}"`;
}
function resumoItensPedido(items: unknown) {
  if (!Array.isArray(items)) return "";
  return items.map((item: any) => {
    const sabores = Array.isArray(item.flavors) ? item.flavors.join(", ") : String(item.flavors ?? "");
    const saborUnico = item.singleFlavor ? String(item.singleFlavor) : "";
    const extras = [item.sizeLabel, sabores, saborUnico, item.obs].filter(Boolean).join(" / ");
    return `${item.qty}x ${item.name}${extras ? ` (${extras})` : ""}`;
  }).join("; ");
}



// ---------------------------------------------------------------------
// Mensagens de erro em português, com a causa provável
// ---------------------------------------------------------------------
function explicarErro(e: unknown): string {
  const bruto = e instanceof Error ? e.message : String(e ?? "Erro desconhecido");
  if (/row-level security|violates row level security|rls policy/i.test(bruto)) {
    return (
      "O Supabase está recusando o envio da imagem porque o servidor não está usando uma chave administrativa válida. " +
      "Confira BELLA_SERVICE_ROLE_KEY nas variáveis de ambiente do projeto Lovable: use a chave secreta/ service_role do projeto Supabase, nunca a chave publicável. " +
      "Depois, publique novamente o site. Não desative a proteção RLS do banco."
    );
  }
  if (/BELLA_SERVICE_ROLE_KEY não configurada/i.test(bruto)) {
    return "Falta configurar BELLA_SERVICE_ROLE_KEY no ambiente do servidor do projeto Lovable com a chave secreta do Supabase. Depois, publique novamente o site.";
  }
  if (/jws|jwt|invalid api key|apikey|service[_ ]role/i.test(bruto)) {
    return (
      "A chave de serviço do banco (BELLA_SERVICE_ROLE_KEY) está errada ou vazia, por isso nada grava " +
      "(categoria, produto, loja, imagem). Troque pela chave \"secret\" do Supabase (Settings > API Keys). " +
      "Detalhe técnico: " +
      bruto
    );
  }
  if (/column .* does not exist|schema cache|could not find the/i.test(bruto)) {
    return "O banco ainda não tem uma coluna nova. Rode o schema.sql atualizado. Detalhe técnico: " + bruto;
  }
  if (/ADMIN_PASSWORD.*não está configurada/i.test(bruto)) {
    return "O painel ainda não está configurado no servidor. É necessário definir ADMIN_PASSWORD nas variáveis de ambiente do projeto e publicar novamente.";
  }
  if (/senha incorreta/i.test(bruto)) return "Senha incorreta.";
  if (/failed to fetch|networkerror|load failed/i.test(bruto)) {
    return "Sem conexão com o servidor. Confira a internet e tente de novo.";
  }
  return bruto;
}

// ---------------------------------------------------------------------
// Imagem: reduz antes de enviar (fotos de celular são grandes demais)
// ---------------------------------------------------------------------
function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? "");
      resolve(s.slice(s.indexOf(",") + 1));
    };
    r.onerror = () => reject(new Error("Não consegui ler a imagem."));
    r.readAsDataURL(blob);
  });
}

async function prepararImagem(
  file: File,
): Promise<{ base64: string; contentType: string; fileName: string }> {
  const LIMITE_PX = 1600;
  const manterPng = file.type === "image/png";
  try {
    const bmp = await createImageBitmap(file);
    const escala = Math.min(1, LIMITE_PX / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * escala));
    const h = Math.max(1, Math.round(bmp.height * escala));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas indisponível");
    if (!manterPng) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const tipo = manterPng ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, tipo, 0.85));
    if (!blob) throw new Error("não gerou a imagem");
    return {
      base64: await blobParaBase64(blob),
      contentType: tipo,
      fileName: file.name.replace(/\.[^.]+$/, "") + (manterPng ? ".png" : ".jpg"),
    };
  } catch {
    if (file.size > 3 * 1024 * 1024) {
      throw new Error("Não consegui reduzir essa imagem. Use uma foto JPG ou PNG de até 3 MB.");
    }
    return {
      base64: await blobParaBase64(file),
      contentType: file.type || "image/jpeg",
      fileName: file.name,
    };
  }
}

// ---------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------
function Painel() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [erro, setErro] = useState("");
  const login = useServerFn(loginAdmin);

  useEffect(() => {
    const saved = sessionStorage.getItem("bs_admin_pw");
    if (saved) {
      setPassword(saved);
      login({ data: { password: saved } })
        .then(() => setAuthed(true))
        .catch(() => sessionStorage.removeItem("bs_admin_pw"));
    }
  }, [login]);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    try {
      await login({ data: { password } });
      sessionStorage.setItem("bs_admin_pw", password);
      setAuthed(true);
    } catch (e) {
      setErro(explicarErro(e));
    }
  }

  if (!authed) {
    return (
      <div className="bella st-body admin-page admin-login">
        <div className="app-container admin-login-container">
          <div className="admin-login-mark" aria-hidden="true">BS</div>
          <p className="admin-eyebrow">Bella Salgadinhos</p>
          <h1 className="admin-login-title">Área do dono</h1>
          <p className="admin-login-desc">Acesse para gerenciar sua loja e seu cardápio.</p>
          <form onSubmit={entrar} style={card} className="admin-login-card">
            <label className="admin-field-label" htmlFor="admin-password">Senha de acesso</label>
            <input
              id="admin-password"
              type="password"
              style={input}
              placeholder="Digite sua senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {erro ? <p className="admin-error">{erro}</p> : null}
            <button type="submit" style={btn} className="admin-login-button">
              Entrar no painel
            </button>
          </form>
          <a href="/" className="owner-link">
            Voltar ao cardápio
          </a>
        </div>
      </div>
    );
  }

  return <PainelConteudo password={password} />;
}

// ---------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------
function PainelConteudo({ password }: { password: string }) {
  const { data, refetch } = useQuery({ queryKey: ["menu"], queryFn: fetchMenu });
  const doSaveStore = useServerFn(saveStore);
  const doSaveCategory = useServerFn(saveCategory);
  const doDeleteCategory = useServerFn(deleteCategory);
  const doSaveProduct = useServerFn(saveProduct);
  const doDeleteProduct = useServerFn(deleteProduct);
  const doUpload = useServerFn(uploadImage);
  const doFetchOrdersReport = useServerFn(fetchOrdersReport);
  const doCancelOrderFromReport = useServerFn(cancelOrderFromReport);

  const [periodoInicio, setPeriodoInicio] = useState(() => hojeISO());
  const [periodoFim, setPeriodoFim] = useState(() => hojeISO());
  const { data: relatorio, isLoading: carregandoRelatorio, error: erroRelatorio, refetch: atualizarRelatorio } = useQuery({
    queryKey: ["orders-report", password, periodoInicio, periodoFim],
    queryFn: () => doFetchOrdersReport({ data: { password, startDate: periodoInicio, endDate: periodoFim } }),
    enabled: Boolean(password && periodoInicio && periodoFim && periodoFim >= periodoInicio),
  });

  const todosPedidosRelatorio = relatorio?.orders ?? [];
  const pedidosCancelados = todosPedidosRelatorio.filter((p: any) => String(p.status ?? "").toLowerCase() === "cancelado");
  const pedidosRelatorio = todosPedidosRelatorio.filter((p: any) => String(p.status ?? "").toLowerCase() !== "cancelado");
  const faturamentoRelatorio = pedidosRelatorio.reduce((s: number, p: any) => s + Number(p.total ?? 0), 0);
  const freteRelatorio = pedidosRelatorio.reduce((s: number, p: any) => s + Number(p.delivery_fee ?? 0), 0);
  const ticketMedio = pedidosRelatorio.length ? faturamentoRelatorio / pedidosRelatorio.length : 0;
  async function cancelarPedidoRelatorio(pedido: any) {
    if (!confirm(`Marcar o pedido de ${pedido.customer_name || "cliente"} como cancelado? Ele deixará de contar nos totais e nas exportações.`)) return;
    try {
      await doCancelOrderFromReport({ data: { password, orderId: String(pedido.id) } });
      flash("Pedido cancelado e retirado dos totais do relatório.");
      await atualizarRelatorio();
    } catch (e) { flash(explicarErro(e), true); }
  }
  const pagamentos = ["Pix", "Cartão", "Dinheiro"].map((forma) => ({
    forma,
    total: pedidosRelatorio.filter((p: any) => textoPagamento(p.payment_method) === forma).reduce((s: number, p: any) => s + Number(p.total ?? 0), 0),
    quantidade: pedidosRelatorio.filter((p: any) => textoPagamento(p.payment_method) === forma).length,
  }));
  const entregas = pedidosRelatorio.filter((p: any) => p.order_type === "entrega").length;
  const retiradas = pedidosRelatorio.filter((p: any) => p.order_type === "retirada").length;
  const rankingProdutos = (() => {
    const mapa = new Map<string, number>();
    pedidosRelatorio.forEach((pedido: any) => (Array.isArray(pedido.items) ? pedido.items : []).forEach((item: any) => {
      const nome = String(item.name ?? "Produto");
      mapa.set(nome, (mapa.get(nome) ?? 0) + Number(item.qty ?? 0));
    }));
    return [...mapa.entries()].sort((a,b) => b[1]-a[1]).slice(0,5);
  })();
  const rankingSabores = (() => {
    const mapa = new Map<string, number>();
    pedidosRelatorio.forEach((pedido: any) => (Array.isArray(pedido.items) ? pedido.items : []).forEach((item: any) => {
      const sabores = [
        ...(Array.isArray(item.flavors) ? item.flavors : typeof item.flavors === "string" ? [item.flavors] : []),
        ...(item.singleFlavor ? [String(item.singleFlavor)] : []),
        ...(item.choices && typeof item.choices === "object" ? Object.values(item.choices) : []),
      ];
      sabores.filter(Boolean).forEach((sabor) => mapa.set(String(sabor), (mapa.get(String(sabor)) ?? 0) + Number(item.qty ?? 0)));
    }));
    return [...mapa.entries()].sort((a,b) => b[1]-a[1]).slice(0,5);
  })();

  function aplicarPeriodo(tipo: "hoje" | "7dias" | "mes") {
    const fim = hojeISO();
    if (tipo === "hoje") { setPeriodoInicio(fim); setPeriodoFim(fim); return; }
    if (tipo === "7dias") { setPeriodoInicio(deslocarDiaISO(fim, -6)); setPeriodoFim(fim); return; }
    setPeriodoInicio(`${fim.slice(0,7)}-01`);
    setPeriodoFim(fim);
  }
  function exportarRelatorioCSV() {
    const cabecalho = ["ID","Data/hora do registro","Cliente","Telefone","Tipo","Agendamento","Pagamento","Itens","Subtotal","Frete","Taxa adicional","Total","Status"];
    const linhas = pedidosRelatorio.map((p: any) => [
      p.id, new Date(p.created_at).toLocaleString("pt-BR", { timeZone: "America/Rio_Branco" }), p.customer_name, p.customer_phone,
      p.order_type, p.order_mode === "agendado" ? `${p.scheduled_date} ${p.scheduled_time}` : "Assim que possível",
      textoPagamento(p.payment_method), resumoItensPedido(p.items), p.subtotal, p.delivery_fee, p.surcharge, p.total, p.status,
    ]);
    const csv = [cabecalho, ...linhas].map((linha) => linha.map(csvCelula).join(";")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `bella-relatorio-${periodoInicio}-a-${periodoFim}.csv`;
    link.click(); URL.revokeObjectURL(url);
  }

  const [msg, setMsg] = useState<{ texto: string; erro: boolean } | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [newCat, setNewCat] = useState("");
  const [filtroCategoriaProduto, setFiltroCategoriaProduto] = useState("todas");

  // Localizar a loja no mapa
  const [cepLoja, setCepLoja] = useState("");
  const [numeroLoja, setNumeroLoja] = useState("");
  const [localizando, setLocalizando] = useState(false);
  const [achado, setAchado] = useState("");

  useEffect(() => {
    if (data?.store) setStore({ ...data.store, whatsapp: "556892505137" });
    else if (data)
      setStore({
        id: "",
        name: "Bella Salgadinhos",
        description: "Salgadinhos e refrigerantes para a sua festa",
        logo_url: null,
        cover_url: null,
        whatsapp: "556892505137",
        hours_text: "Seg-Sáb: 8h-18h",
        address: "",
        store_lat: null,
        store_lon: null,
        surcharge_active: false,
        surcharge_amount: 2,
        surcharge_label: "Dia de chuva, feriado ou alta demanda",
        open_status: "auto",
      });
  }, [data]);

  function flash(texto: string, erro = false) {
    setMsg({ texto, erro });
    setTimeout(() => setMsg(null), erro ? 15000 : 3500);
  }

  // ----- Imagem -----
  async function pickImage(onDone: (url: string) => void) {
    const el = document.createElement("input");
    el.type = "file";
    el.accept = "image/*";
    el.onchange = async () => {
      const file = el.files?.[0];
      if (!file) return;
      flash("Preparando e enviando a imagem...");
      try {
        const img = await prepararImagem(file);
        const res = await doUpload({
          data: {
            password,
            fileName: img.fileName,
            contentType: img.contentType,
            base64: img.base64,
          },
        });
        onDone(res.url);
        flash("Imagem enviada! Clique em Salvar para guardar.");
      } catch (e) {
        flash(explicarErro(e), true);
      }
    };
    el.click();
  }

  // ----- Loja -----
  async function salvarLoja(dados: Store | null = store, mostrarMsg = true): Promise<boolean> {
    if (!dados) return false;
    try {
      await doSaveStore({
        data: {
          password,
          name: dados.name,
          description: dados.description,
          logo_url: dados.logo_url,
          cover_url: dados.cover_url,
          whatsapp: dados.whatsapp,
          hours_text: dados.hours_text,
          address: dados.address,
          store_lat: dados.store_lat,
          store_lon: dados.store_lon,
          surcharge_active: dados.surcharge_active,
          surcharge_amount: dados.surcharge_amount,
          surcharge_label: dados.surcharge_label,
          open_status: dados.open_status,
        },
      });
      if (mostrarMsg) flash("Dados da loja salvos!");
      refetch();
      return true;
    } catch (e) {
      flash(explicarErro(e), true);
      return false;
    }
  }

  async function alternarSobretaxa(ativo: boolean) {
    if (!store) return;
    const novo = { ...store, surcharge_active: ativo };
    setStore(novo);
    const ok = await salvarLoja(novo, false);
    if (ok) flash(ativo ? "Taxa adicional LIGADA" : "Taxa adicional desligada");
  }

  async function mudarAbertura(status: OpenStatus) {
    if (!store) return;
    const novo = { ...store, open_status: status };
    setStore(novo);
    const ok = await salvarLoja(novo, false);
    if (ok) flash("Status da loja atualizado");
  }

  async function localizarLoja() {
    if (limparCep(cepLoja).length !== 8) {
      flash("Digite o CEP da loja com 8 números.", true);
      return;
    }
    setLocalizando(true);
    setAchado("");
    try {
      const end = await buscarCep(cepLoja);
      const coords = await resolverCoordenadas({
        rua: end.rua,
        numero: numeroLoja,
        bairro: end.bairro,
        cidade: end.cidade,
        uf: end.uf,
        coords: end.lat !== null && end.lon !== null ? { lat: end.lat, lon: end.lon } : null,
      });
      const texto = `${end.rua}${numeroLoja ? `, ${numeroLoja}` : ""} - ${end.bairro}, ${end.cidade}/${end.uf}`;
      // Mantém exatamente a leitura legada de coordenadas; esta etapa é apenas visual.
      const pontoLegado = coords as unknown as { lat: number | null; lon: number | null } | null;
      setStore((s) =>
        s
          ? {
              ...s,
              address: texto,
              store_lat: pontoLegado?.lat ?? s.store_lat,
              store_lon: pontoLegado?.lon ?? s.store_lon,
            }
          : s,
      );
      setAchado(
        coords
          ? `Encontrado: ${texto}. Confira no mapa e clique em "Salvar loja".`
          : `Achei o endereço (${texto}), mas não o ponto no mapa. Digite a latitude e a longitude abaixo.`,
      );
    } catch (e) {
      flash(explicarErro(e), true);
    } finally {
      setLocalizando(false);
    }
  }

  // ----- Categorias -----
  async function adicionarCategoria() {
    const titulo = newCat.trim();
    if (!titulo) return;
    try {
      await doSaveCategory({
        data: { password, id: null, title: titulo, position: categories.length },
      });
      setNewCat("");
      flash("Categoria criada");
      refetch();
    } catch (e) {
      flash(explicarErro(e), true);
    }
  }

  async function moverCategoria(index: number, direction: -1 | 1) {
    const ordenadas = [...categories].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const atual = ordenadas[index];
    const vizinha = ordenadas[index + direction];
    if (!atual || !vizinha) return;
    try {
      await doSaveCategory({ data: { password, id: atual.id, title: atual.title, position: vizinha.position } });
      await doSaveCategory({ data: { password, id: vizinha.id, title: vizinha.title, position: atual.position } });
      flash("Ordem das categorias atualizada!");
      refetch();
    } catch (e) { flash(explicarErro(e), true); }
  }

  async function renomearCategoria(c: Category, titulo: string) {
    const novo = titulo.trim();
    if (!novo || novo === c.title) return;
    try {
      await doSaveCategory({ data: { password, id: c.id, title: novo, position: c.position } });
      flash("Categoria atualizada");
      refetch();
    } catch (e) {
      flash(explicarErro(e), true);
    }
  }

  async function removerCategoria(c: Category) {
    if (!confirm(`Remover a categoria "${c.title}" e seus produtos?`)) return;
    try {
      await doDeleteCategory({ data: { password, id: c.id } });
      flash("Categoria removida");
      refetch();
    } catch (e) {
      flash(explicarErro(e), true);
    }
  }

  // ----- Produtos -----
  async function salvarProduto() {
    if (!editing?.name || !editing.category_id) {
      flash("Informe o nome e a categoria.", true);
      return;
    }
    try {
      await doSaveProduct({
        data: {
          password,
          id: editing.id ?? null,
          category_id: editing.category_id,
          name: editing.name,
          description: editing.description ?? "",
          price: editing.price ?? null,
          image_url: editing.image_url ?? null,
          sizes: editing.sizes ?? [],
          flavors: editing.flavors ?? [],
          single_flavors: editing.single_flavors ?? [],
          units_base: editing.units_base ?? null,
          units_per_flavor: editing.units_per_flavor ?? 25,
          allow_assorted: editing.allow_assorted ?? false,
          choice_groups: editing.choice_groups ?? [],
          active: editing.active ?? true,
          is_promotion: editing.is_promotion ?? false,
          position: editing.position ?? 0,
        },
      });
      setEditing(null);
      flash("Produto salvo!");
      refetch();
    } catch (e) {
      flash(explicarErro(e), true);
    }
  }

  async function removerProduto(p: Product) {
    if (!confirm(`Remover "${p.name}"?`)) return;
    try {
      await doDeleteProduct({ data: { password, id: p.id } });
      flash("Produto removido");
      refetch();
    } catch (e) {
      flash(explicarErro(e), true);
    }
  }

  const categories: Category[] = data?.categories ?? [];
  const products: Product[] = data?.products ?? [];

  // Troca a posição com o vizinho dentro da mesma categoria
  async function moverProduto(categoryId: string, index: number, direction: -1 | 1) {
    const doCategoria = products
      .filter((p) => p.category_id === categoryId)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    const atual = doCategoria[index];
    const vizinho = doCategoria[index + direction];
    if (!atual || !vizinho) return;

    function payload(p: Product, novaPosicao: number) {
      return {
        password,
        id: p.id,
        category_id: p.category_id ?? "",
        name: p.name,
        description: p.description ?? "",
        price: p.price ?? null,
        image_url: p.image_url ?? null,
        sizes: p.sizes ?? [],
        flavors: p.flavors ?? [],
        single_flavors: p.single_flavors ?? [],
        units_base: p.units_base ?? null,
        units_per_flavor: p.units_per_flavor ?? 25,
        allow_assorted: p.allow_assorted ?? false,
        choice_groups: p.choice_groups ?? [],
        active: p.active ?? true,
        position: novaPosicao,
      };
    }

    try {
      await doSaveProduct({ data: payload(atual, vizinho.position ?? 0) });
      await doSaveProduct({ data: payload(vizinho, atual.position ?? 0) });
      flash("Ordem atualizada!");
      refetch();
    } catch (e) {
      flash(explicarErro(e), true);
    }
  }

  const semPonto = store !== null && (store.store_lat === null || store.store_lon === null);

  return (
    <div className="bella st-body admin-page">
      <div className="app-container admin-container">
        <header className="admin-header">
          <p className="admin-eyebrow">Bella Salgadinhos</p>
          <h1 className="admin-title">Painel do dono</h1>
          <p className="admin-description">
            Ajustes do dia a dia ficam no topo. O resto está nas seções abaixo (toque para abrir).
          </p>
        </header>

        {msg ? (
          <div className={`admin-message ${msg.erro ? "is-error" : "is-success"}`} role="status">
            {msg.texto}
          </div>
        ) : null}

        {/* ---------- Ajustes rápidos ---------- */}
        {store ? (
          <div style={card} className="admin-quick-card">
            <h2 className="admin-section-heading">⚡ Ajustes rápidos</h2>

            <p style={{ ...subtitulo, marginTop: 0 }}>Loja</p>
            <p style={dica}>
              O cardápio mostra agora:{" "}
              <b>{lojaEstaAberta(store.open_status, new Date(), store.hours_text) ? "ABERTA" : "FECHADA"}</b>
              {store.open_status === "auto" ? " (seguindo o horário)" : " (forçado por você)"}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(
                [
                  ["auto", "Automático"],
                  ["open", "Forçar aberta"],
                  ["closed", "Forçar fechada"],
                ] as [OpenStatus, string][]
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  style={store.open_status === v ? btn : btnGhost}
                  onClick={() => void mudarAbertura(v)}
                >
                  {label}
                </button>
              ))}
            </div>

            <p style={subtitulo}>Taxa adicional (chuva, feriado, alta demanda)</p>
            <label
              style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={store.surcharge_active}
                onChange={(e) => void alternarSobretaxa(e.target.checked)}
                className="admin-checkbox"
              />
              <b className={store.surcharge_active ? "admin-accent-text" : ""}>
                {store.surcharge_active ? "LIGADA — somando na entrega" : "Desligada"}
              </b>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                key={`amt-${store.surcharge_amount}`}
                style={{ ...input, flex: 1 }}
                inputMode="decimal"
                placeholder="Valor (R$)"
                defaultValue={String(store.surcharge_amount).replace(".", ",")}
                onBlur={(e) => {
                  const n = parseFloat(e.target.value.replace(",", "."));
                  setStore({ ...store, surcharge_amount: Number.isFinite(n) && n >= 0 ? n : 0 });
                }}
              />
              <input
                style={{ ...input, flex: 3 }}
                placeholder="Texto mostrado ao cliente"
                value={store.surcharge_label}
                onChange={(e) => setStore({ ...store, surcharge_label: e.target.value })}
              />
            </div>
            <button style={btnGhost} onClick={() => void salvarLoja()}>
              Salvar valor e texto
            </button>
          </div>
        ) : null}


        {/* ---------- Relatórios & vendas ---------- */}
        <section className="admin-reports" style={{ ...secao, padding: 20 }}>
          <div style={{ padding: "0 0 14px" }}>
            <p className="admin-eyebrow" style={{ marginBottom: 5 }}>VISÃO DO NEGÓCIO</p>
            <h2 className="admin-section-heading" style={{ padding: 0, cursor: "default" }}>📊 Relatórios &amp; vendas</h2>
            <p style={{ ...dica, marginTop: 8, marginBottom: 0 }}>Resumo dos pedidos registrados no cardápio no período selecionado.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button type="button" style={btnGhost} onClick={() => aplicarPeriodo("hoje")}>Hoje</button>
            <button type="button" style={btnGhost} onClick={() => aplicarPeriodo("7dias")}>Últimos 7 dias</button>
            <button type="button" style={btnGhost} onClick={() => aplicarPeriodo("mes")}>Este mês</button>
          </div>
          <div className="admin-report-dates">
            <label style={{ ...dica, display: "block" }}>Data inicial
              <input aria-label="Data inicial do relatório" type="date" style={{ ...input, display: "block", marginTop: 5 }} value={periodoInicio} max={periodoFim || undefined} onChange={(e) => setPeriodoInicio(e.target.value)} />
            </label>
            <label style={{ ...dica, display: "block" }}>Data final
              <input aria-label="Data final do relatório" type="date" style={{ ...input, display: "block", marginTop: 5 }} value={periodoFim} min={periodoInicio || undefined} onChange={(e) => setPeriodoFim(e.target.value)} />
            </label>
            <button type="button" style={btnGhost} onClick={() => void atualizarRelatorio()} disabled={carregandoRelatorio}>Atualizar</button>
          </div>
          {carregandoRelatorio ? <p style={dica}>Carregando os pedidos...</p> : null}
          {erroRelatorio ? <p className="admin-error">Não foi possível carregar os relatórios. Confira a conexão e tente atualizar.</p> : null}
          {relatorio ? (
            <>
              <div className="admin-report-kpis">
                {[
                  ["Faturamento registrado", money(faturamentoRelatorio)],
                  ["Pedidos registrados", String(relatorio.totalCount)],
                  ["Ticket médio", money(ticketMedio)],
                  ["Frete registrado", money(freteRelatorio)],
                ].map(([label, value]) => (
                  <div className="admin-report-kpi" key={label}><span>{label}</span><strong>{value}</strong></div>
                ))}
              </div>
              {relatorio.truncated ? <p style={dica}>Este período tem mais de 5.000 pedidos; a lista e os totais exibidos consideram os 5.000 mais recentes. Reduza o período para conferir todos.</p> : null}
              <div className="admin-report-columns">
                <div className="admin-report-panel">
                  <h3>Vendas por pagamento</h3>
                  {pagamentos.map((p) => <div className="admin-report-line" key={p.forma}><span>{p.forma} <small>({p.quantidade})</small></span><b>{money(p.total)}</b></div>)}
                </div>
                <div className="admin-report-panel">
                  <h3>Entrega x retirada</h3>
                  <div className="admin-report-line"><span>Entrega</span><b>{entregas} ({pedidosRelatorio.length ? Math.round(entregas/pedidosRelatorio.length*100) : 0}%)</b></div>
                  <div className="admin-report-line"><span>Retirada</span><b>{retiradas} ({pedidosRelatorio.length ? Math.round(retiradas/pedidosRelatorio.length*100) : 0}%)</b></div>
                </div>
                <div className="admin-report-panel">
                  <h3>Produtos mais vendidos</h3>
                  {rankingProdutos.length ? rankingProdutos.map(([nome, qtd]) => <div className="admin-report-line" key={nome}><span>{nome}</span><b>{qtd}</b></div>) : <p style={dica}>Sem itens no período.</p>}
                </div>
                <div className="admin-report-panel">
                  <h3>Sabores mais escolhidos</h3>
                  {rankingSabores.length ? rankingSabores.map(([nome, qtd]) => <div className="admin-report-line" key={nome}><span>{nome}</span><b>{qtd}</b></div>) : <p style={dica}>Não há sabores detalhados nesses pedidos.</p>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }} className="admin-report-actions">
                <button type="button" style={btn} onClick={exportarRelatorioCSV}>Exportar planilha CSV</button>
                <button type="button" style={btnGhost} onClick={() => window.print()}>Imprimir fechamento</button>
              </div>
              <h3 className="admin-report-list-title">Pedidos válidos do período ({pedidosRelatorio.length})</h3>
              <div className="admin-report-table-wrap">
                <table className="admin-report-table">
                  <thead><tr><th>Data</th><th>Cliente</th><th>Itens</th><th>Pagamento</th><th>Tipo</th><th>Total</th><th>Ação</th></tr></thead>
                  <tbody>
                    {pedidosRelatorio.map((p: any) => (
                      <tr key={p.id}>
                        <td>{new Date(p.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Rio_Branco" })}</td>
                        <td><b>{p.customer_name}</b><small>{p.customer_phone}</small></td>
                        <td>{resumoItensPedido(p.items)}</td>
                        <td>{textoPagamento(p.payment_method)}</td>
                        <td>{p.order_type === "entrega" ? "Entrega" : "Retirada"}</td>
                        <td><b>{money(Number(p.total ?? 0))}</b></td>
                      </tr>
                    ))}
                    {!pedidosRelatorio.length ? <tr><td colSpan={7}>Nenhum pedido ativo neste período.</td></tr> : null}
                  </tbody>
                </table>
              </div>
              <p style={{ ...dica, marginTop: 12, marginBottom: 0 }}>Atenção: o sistema registra o pedido antes de abrir o WhatsApp. Marque como cancelado quando o cliente desistir; esses pedidos ficam fora dos indicadores e da exportação. Valores não significam pagamento confirmado. {pedidosCancelados.length ? `${pedidosCancelados.length} pedido(s) cancelado(s) neste período.` : ""}</p>
            </>
          ) : null}
        </section>

        {/* ---------- Dados da loja ---------- */}
        {store ? (
          <details style={secao}>
            <summary style={secaoTitulo}>🏪 Dados da loja</summary>
            <div style={secaoCorpo}>
              <p style={dica}>Nome</p>
              <input
                style={input}
                value={store.name}
                onChange={(e) => setStore({ ...store, name: e.target.value })}
              />
              <p style={dica}>Descrição</p>
              <input
                style={input}
                value={store.description}
                onChange={(e) => setStore({ ...store, description: e.target.value })}
              />
              <p style={dica}>WhatsApp com DDI e DDD, só números (ex: 5511999999999)</p>
              <input
                style={input}
                inputMode="numeric"
                value={store.whatsapp}
                onChange={(e) => setStore({ ...store, whatsapp: e.target.value })}
              />
              <p style={dica}>Horário exibido no cardápio</p>
              <input
                style={input}
                value={store.hours_text}
                onChange={(e) => setStore({ ...store, hours_text: e.target.value })}
              />
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                {store.logo_url ? (
                  <img src={store.logo_url} alt="logo" style={{ width: 48, height: 48, borderRadius: 24 }} />
                ) : null}
                <button style={btnGhost} onClick={() => void pickImage((url) => setStore({ ...store, logo_url: url }))}>
                  Trocar logo
                </button>
                {store.cover_url ? (
                  <img src={store.cover_url} alt="capa" style={{ width: 64, height: 40, borderRadius: 6 }} />
                ) : null}
                <button style={btnGhost} onClick={() => void pickImage((url) => setStore({ ...store, cover_url: url }))}>
                  Trocar capa
                </button>
              </div>
              <button style={btn} onClick={() => void salvarLoja()}>
                Salvar loja
              </button>
            </div>
          </details>
        ) : null}

        {/* ---------- Entrega ---------- */}
        {store ? (
          <details style={secao} open={semPonto}>
            <summary style={secaoTitulo}>
              📍 Entrega: endereço da loja {semPonto ? "⚠️ falta localizar" : "✅"}
            </summary>
            <div style={secaoCorpo}>
              {semPonto ? (
                <div
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#991b1b",
                    borderRadius: 8,
                    padding: 10,
                    fontSize: "0.8rem",
                    marginBottom: 10,
                  }}
                >
                  A loja ainda não foi localizada no mapa. Sem isso o site não calcula a taxa de entrega
                  pelo CEP do cliente.
                </div>
              ) : null}
              <p style={dica}>1) Digite o CEP e o número da loja e toque em localizar</p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ ...input, flex: 2 }}
                  inputMode="numeric"
                  maxLength={9}
                  placeholder="CEP da loja"
                  value={cepLoja}
                  onChange={(e) => setCepLoja(e.target.value)}
                />
                <input
                  style={{ ...input, flex: 1 }}
                  placeholder="Número"
                  value={numeroLoja}
                  onChange={(e) => setNumeroLoja(e.target.value)}
                />
              </div>
              <button style={btnGhost} onClick={() => void localizarLoja()} disabled={localizando}>
                {localizando ? "Procurando..." : "Localizar loja no mapa"}
              </button>
              {achado ? <p style={{ ...dica, marginTop: 8, color: "#374151" }}>{achado}</p> : null}

              <p style={{ ...dica, marginTop: 10 }}>2) Confira (ou corrija) o endereço e o ponto no mapa</p>
              <input
                style={input}
                value={store.address}
                onChange={(e) => setStore({ ...store, address: e.target.value })}
                placeholder="Endereço da loja (texto)"
              />
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  key={`lat-${store.store_lat ?? "x"}`}
                  style={input}
                  inputMode="decimal"
                  placeholder="Latitude (ex: -22.9525)"
                  defaultValue={store.store_lat ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim().replace(",", ".");
                    const n = v === "" ? null : parseFloat(v);
                    setStore({ ...store, store_lat: n !== null && Number.isFinite(n) ? n : null });
                  }}
                />
                <input
                  key={`lon-${store.store_lon ?? "x"}`}
                  style={input}
                  inputMode="decimal"
                  placeholder="Longitude (ex: -46.5419)"
                  defaultValue={store.store_lon ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim().replace(",", ".");
                    const n = v === "" ? null : parseFloat(v);
                    setStore({ ...store, store_lon: n !== null && Number.isFinite(n) ? n : null });
                  }}
                />
              </div>
              {store.store_lat !== null && store.store_lon !== null ? (
                <p style={dica}>
                  <a
                    href={`https://www.google.com/maps?q=${store.store_lat},${store.store_lon}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#2563eb", textDecoration: "underline" }}
                  >
                    Ver esse ponto no Google Maps
                  </a>{" "}
                  — se não for a sua loja, clique com o botão direito no local certo no Google Maps,
                  copie a latitude/longitude e cole acima.
                </p>
              ) : null}

              <p style={{ ...dica, marginTop: 10 }}>3) Salve</p>
              <button style={btn} onClick={() => void salvarLoja()}>
                Salvar loja
              </button>
            </div>
          </details>
        ) : null}

        {/* ---------- Categorias ---------- */}
        <details style={secao}>
          <summary style={secaoTitulo}>🗂️ Categorias ({categories.length})</summary>
          <div style={secaoCorpo}>
            {[...categories].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((c, index, arr) => (
              <div key={c.id} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <button type="button" style={{ ...btnGhost, padding: "3px 9px", lineHeight: 1 }} disabled={index === 0} onClick={() => void moverCategoria(index, -1)} title="Mover categoria para cima">▲</button>
                  <button type="button" style={{ ...btnGhost, padding: "3px 9px", lineHeight: 1 }} disabled={index === arr.length - 1} onClick={() => void moverCategoria(index, 1)} title="Mover categoria para baixo">▼</button>
                </div>
                <input style={{ ...input, marginBottom: 0 }} defaultValue={c.title} onBlur={(e) => void renomearCategoria(c, e.target.value)} />
                <button style={btnGhost} onClick={() => void removerCategoria(c)}>Remover</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                style={{ ...input, marginBottom: 0 }}
                placeholder="Nova categoria"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
              />
              <button style={btn} onClick={() => void adicionarCategoria()}>
                Adicionar
              </button>
            </div>
          </div>
        </details>

        {/* ---------- Produtos ---------- */}
        <section style={{ ...secao, overflow: "hidden" }}>
          <div style={{ ...secaoTitulo, cursor: "default" }}>🍽️ Produtos <span style={{ color: "#6b7280", fontWeight: 500 }}>({products.length})</span></div>
          <div style={secaoCorpo}>
            <p style={{ ...dica, marginTop: 0 }}>Escolha uma categoria para ver e editar somente os produtos dela.</p>
            <div role="tablist" aria-label="Filtrar produtos por categoria" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 10, marginBottom: 12 }}>
              <button
                type="button"
                role="tab"
                aria-selected={filtroCategoriaProduto === "todas"}
                onClick={() => setFiltroCategoriaProduto("todas")}
                style={{ ...(filtroCategoriaProduto === "todas" ? btn : btnGhost), whiteSpace: "nowrap", minHeight: 40 }}
              >
                Todos ({products.length})
              </button>
              {categories.map((c) => {
                const quantidade = products.filter((p) => p.category_id === c.id).length;
                const ativa = filtroCategoriaProduto === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="tab"
                    aria-selected={ativa}
                    onClick={() => setFiltroCategoriaProduto(c.id)}
                    style={{ ...(ativa ? btn : btnGhost), whiteSpace: "nowrap", minHeight: 40 }}
                  >
                    {c.title} ({quantidade})
                  </button>
                );
              })}
            </div>
            <button
              style={{ ...btn, marginBottom: 12 }}
              onClick={() =>
                setEditing({
                  category_id: categories[0]?.id ?? "",
                  name: "",
                  description: "",
                  price: 0,
                  sizes: [],
                  flavors: [],
                  single_flavors: [],
                  active: true,
                  position: products.length,
                })
              }
            >
              + Novo produto
            </button>
            {(filtroCategoriaProduto === "todas" ? categories : categories.filter((c) => c.id === filtroCategoriaProduto)).map((c) => (
              <div key={c.id} style={{ marginBottom: 18 }}>
                {filtroCategoriaProduto === "todas" ? <p style={{ fontSize: "0.85rem", color: "#92400e", fontWeight: 700, marginBottom: 8 }}>{c.title}</p> : null}
                {products
                  .filter((p) => p.category_id === c.id)
                  .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                  .map((p, idx, arr) => (
                    <div
                      key={p.id}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        padding: "6px 0",
                        borderBottom: "1px dashed #e5e7eb",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <button
                          style={{ ...btnGhost, padding: "2px 8px", fontSize: "0.7rem", lineHeight: 1 }}
                          disabled={idx === 0}
                          onClick={() => void moverProduto(c.id, idx, -1)}
                          title="Mover para cima"
                        >
                          ▲
                        </button>
                        <button
                          style={{ ...btnGhost, padding: "2px 8px", fontSize: "0.7rem", lineHeight: 1 }}
                          disabled={idx === arr.length - 1}
                          onClick={() => void moverProduto(c.id, idx, 1)}
                          title="Mover para baixo"
                        >
                          ▼
                        </button>
                      </div>
                      {p.image_url ? (
                        <img src={p.image_url} alt="" style={{ width: 36, height: 36, borderRadius: 6 }} />
                      ) : null}
                      <div style={{ flex: 1, fontSize: "0.85rem" }}>
                        {p.name}{" "}
                        <span style={{ color: "#15803d" }}>
                          {money(p.price ?? p.sizes[0]?.price ?? 0)}
                        </span>
                        {!p.active ? <span style={{ color: "#ef4444" }}> (oculto)</span> : null}
                      </div>
                      <button style={btnGhost} onClick={() => setEditing(p)}>
                        Editar
                      </button>
                      <button style={btnGhost} onClick={() => void removerProduto(p)}>
                        Remover
                      </button>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </section>

        <a href="/" className="owner-link">
          Voltar ao cardápio
        </a>
      </div>

      {/* ---------- Editor de produto ---------- */}
      <div className={`st-overlay ${editing ? "active" : ""}`} onClick={() => setEditing(null)} />
      <div className={`bottom-sheet ${editing ? "active" : ""}`}>
        <div className="sheet-handle" />
        <div className="modal-body">
          {editing ? (
            <>
              <h2 style={{ fontWeight: 700, marginBottom: 10 }}>
                {editing.id ? "Editar produto" : "Novo produto"}
              </h2>

              <p style={dica}>Categoria</p>
              <select
                style={input}
                value={editing.category_id ?? ""}
                onChange={(e) => setEditing({ ...editing, category_id: e.target.value })}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <p style={dica}>Nome</p>
              <input
                style={input}
                value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
              <p style={dica}>Descrição</p>
              <textarea
                style={{ ...input, height: 70 }}
                value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
              <p style={dica}>Preço (deixe vazio se usar tamanhos)</p>
              <input
                style={input}
                type="number"
                step="0.01"
                value={editing.price ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, price: e.target.value === "" ? null : Number(e.target.value) })
                }
              />

              <p style={dica}>Foto</p>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                {editing.image_url ? (
                  <img src={editing.image_url} alt="" style={{ width: 48, height: 48, borderRadius: 8 }} />
                ) : null}
                <button
                  style={btnGhost}
                  onClick={() => void pickImage((url) => setEditing((p) => ({ ...p, image_url: url })))}
                >
                  Enviar foto
                </button>
              </div>
              <input
                style={input}
                placeholder="Ou cole o link da foto"
                value={editing.image_url ?? ""}
                onChange={(e) => setEditing({ ...editing, image_url: e.target.value })}
              />

              <details style={{ marginBottom: 10 }} open={(editing.sizes?.length ?? 0) > 0}>
                <summary style={{ fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", padding: "6px 0" }}>
                  Tamanhos (opcional)
                </summary>
                <p style={dica}>Um por linha: Nome | preço (ex: 500 g | 39,90)</p>
                <textarea
                  style={{ ...input, height: 70 }}
                  defaultValue={(editing.sizes ?? []).map((s: Size) => `${s.label} | ${s.price}`).join("\n")}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      sizes: e.target.value
                        .split("\n")
                        .filter((l) => l.trim())
                        .map((l) => {
                          const [label, price] = l.split("|");
                          return {
                            label: (label ?? "").trim(),
                            price: Number((price ?? "0").trim().replace(",", ".")) || 0,
                          };
                        }),
                    })
                  }
                />
              </details>

              <details
                style={{ marginBottom: 10 }}
                open={
                  (editing.flavors?.length ?? 0) > 0 ||
                  (editing.single_flavors?.length ?? 0) > 0 ||
                  (editing.choice_groups?.length ?? 0) > 0
                }
              >
                <summary style={{ fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", padding: "6px 0" }}>
                  Sabores e escolhas (opcional)
                </summary>
                <p style={dica}>Sabores múltiplos (um por linha)</p>
                <textarea
                  style={{ ...input, height: 70 }}
                  defaultValue={(editing.flavors ?? []).join("\n")}
                  onChange={(e) =>
                    setEditing({ ...editing, flavors: e.target.value.split("\n").filter((l) => l.trim()) })
                  }
                />
                <p style={dica}>Sabor único (um por linha)</p>
                <textarea
                  style={{ ...input, height: 70 }}
                  defaultValue={(editing.single_flavors ?? []).join("\n")}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      single_flavors: e.target.value.split("\n").filter((l) => l.trim()),
                    })
                  }
                />
                <p style={dica}>Quantidade de salgados no pacote (ex: 200)</p>
                <input
                  style={input}
                  type="number"
                  value={editing.units_base ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      units_base: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
                <p style={dica}>1 sabor a cada quantos salgados? (ex: 25)</p>
                <input
                  style={input}
                  type="number"
                  min={1}
                  value={editing.units_per_flavor ?? 25}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      units_per_flavor: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                />
                {editing.units_base ? (
                  <p style={{ fontSize: "0.8rem", color: "#b45309", fontWeight: 600 }}>
                    O cliente poderá escolher até{" "}
                    {Math.max(1, Math.floor(editing.units_base / (editing.units_per_flavor || 25)))} sabor(es)
                  </p>
                ) : (
                  <p style={dica}>Sem quantidade: o cliente pode escolher todos os sabores.</p>
                )}
                <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0" }}>
                  <input
                    type="checkbox"
                    checked={editing.allow_assorted ?? false}
                    onChange={(e) => setEditing({ ...editing, allow_assorted: e.target.checked })}
                  />
                  Cliente pode pedir sortidos (sem escolher sabores)
                </label>
                <p style={dica}>
                  Escolhas obrigatórias (uma por linha, formato "Título: opção 1, opção 2")
                  <br />
                  Ex: Refrigerante: Coca-Cola, Guaraná, Fanta
                </p>
                <textarea
                  style={{ ...input, height: 70 }}
                  defaultValue={(editing.choice_groups ?? [])
                    .map((g) => `${g.title}: ${g.options.join(", ")}`)
                    .join("\n")}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      choice_groups: e.target.value
                        .split("\n")
                        .filter((l) => l.includes(":"))
                        .map((l) => {
                          const i = l.indexOf(":");
                          return {
                            title: l.slice(0, i).trim(),
                            options: l
                              .slice(i + 1)
                              .split(",")
                              .map((o) => o.trim())
                              .filter(Boolean),
                          };
                        })
                        .filter((g) => g.title && g.options.length > 0),
                    })
                  }
                />
              </details>

              <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={editing.active ?? true}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                />
                Mostrar no cardápio
              </label>
              <div style={{ display: "flex", gap: 8, paddingBottom: 20 }}>
                <button style={btn} onClick={() => void salvarProduto()}>
                  Salvar
                </button>
                <button style={btnGhost} onClick={() => setEditing(null)}>
                  Cancelar
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
