import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { fetchMenu, money, type Category, type Product, type Size, type Store } from "@/lib/menu-data";
import {
  deleteCategory,
  deleteProduct,
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

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
};
const input: React.CSSProperties = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: 10,
  fontSize: "0.9rem",
  marginBottom: 8,
};
const btn: React.CSSProperties = {
  background: "linear-gradient(135deg, #d97706, #b45309)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 16px",
  fontWeight: 600,
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  background: "#f3f4f6",
  color: "#374151",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
  fontSize: "0.8rem",
};
const dica: React.CSSProperties = { fontSize: "0.75rem", color: "#6b7280", marginBottom: 8 };

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
    } catch {
      setErro("Senha incorreta.");
    }
  }

  if (!authed) {
    return (
      <div className="saboretal st-body">
        <div className="app-container" style={{ padding: 24 }}>
          <h1 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 12 }}>Área do dono</h1>
          <form onSubmit={entrar} style={card}>
            <input
              type="password"
              style={input}
              placeholder="Senha de acesso"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {erro ? <p style={{ color: "#ef4444", fontSize: "0.85rem" }}>{erro}</p> : null}
            <button type="submit" style={btn}>
              Entrar
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

function PainelConteudo({ password }: { password: string }) {
  const { data, refetch } = useQuery({ queryKey: ["menu"], queryFn: fetchMenu });
  const doSaveStore = useServerFn(saveStore);
  const doSaveCategory = useServerFn(saveCategory);
  const doDeleteCategory = useServerFn(deleteCategory);
  const doSaveProduct = useServerFn(saveProduct);
  const doDeleteProduct = useServerFn(deleteProduct);
  const doUpload = useServerFn(uploadImage);

  const [msg, setMsg] = useState("");
  const [store, setStore] = useState<Store | null>(null);
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [newCat, setNewCat] = useState("");

  // Localizar a loja no mapa (ponto de saída das entregas)
  const [cepLoja, setCepLoja] = useState("");
  const [numeroLoja, setNumeroLoja] = useState("");
  const [localizando, setLocalizando] = useState(false);
  const [achado, setAchado] = useState("");

  useEffect(() => {
    if (data?.store) setStore(data.store);
    else if (data)
      setStore({
        id: "",
        name: "Bella Salgadinhos",
        description: "Salgadinhos e refrigerantes para a sua festa",
        logo_url: null,
        cover_url: null,
        whatsapp: "",
        hours_text: "Seg-Sáb: 13h-21h",
        address: "",
        store_lat: null,
        store_lon: null,
        surcharge_active: false,
        surcharge_amount: 2,
        surcharge_label: "Dia de chuva, feriado ou alta demanda",
      });
  }, [data]);

  function flash(t: string) {
    setMsg(t);
    setTimeout(() => setMsg(""), 3500);
  }

  async function pickImage(onDone: (url: string) => void) {
    const el = document.createElement("input");
    el.type = "file";
    el.accept = "image/*";
    el.onchange = async () => {
      const file = el.files?.[0];
      if (!file) return;
      flash("Enviando imagem...");
      const buf = await file.arrayBuffer();
      let bin = "";
      new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
      try {
        const res = await doUpload({
          data: {
            password,
            fileName: file.name,
            contentType: file.type || "image/jpeg",
            base64: btoa(bin),
          },
        });
        onDone(res.url);
        flash("Imagem enviada!");
      } catch (e) {
        flash(e instanceof Error ? e.message : "Erro ao enviar imagem");
      }
    };
    el.click();
  }

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
        },
      });
      if (mostrarMsg) flash("Dados da loja salvos!");
      refetch();
      return true;
    } catch (e) {
      flash(e instanceof Error ? e.message : "Erro");
      return false;
    }
  }

  // Liga/desliga a taxa adicional na hora (já salva)
  async function alternarSobretaxa(ativo: boolean) {
    if (!store) return;
    const novo = { ...store, surcharge_active: ativo };
    setStore(novo);
    const ok = await salvarLoja(novo, false);
    flash(ok ? (ativo ? "Taxa adicional LIGADA" : "Taxa adicional desligada") : "Não consegui salvar");
  }

  async function localizarLoja() {
    if (limparCep(cepLoja).length !== 8) {
      flash("Digite o CEP da loja com 8 números.");
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
      setStore((s) =>
        s
          ? {
              ...s,
              address: texto,
              store_lat: coords?.lat ?? s.store_lat,
              store_lon: coords?.lon ?? s.store_lon,
            }
          : s,
      );
      setAchado(
        coords
          ? `Encontrado: ${texto}. Confira no mapa e clique em "Salvar loja".`
          : `Achei o endereço (${texto}), mas não o ponto no mapa. Digite a latitude e a longitude abaixo.`,
      );
    } catch (e) {
      flash(e instanceof Error ? e.message : "Erro ao localizar a loja");
    } finally {
      setLocalizando(false);
    }
  }

  async function salvarProduto() {
    if (!editing?.name || !editing.category_id) {
      flash("Informe o nome e a categoria.");
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
          position: editing.position ?? 0,
        },
      });
      setEditing(null);
      flash("Produto salvo!");
      refetch();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Erro");
    }
  }

  const categories: Category[] = data?.categories ?? [];
  const products: Product[] = data?.products ?? [];

  // Reordena produtos dentro da mesma categoria (troca a posição com o vizinho)
  async function moverProduto(categoryId: string, index: number, direction: -1 | 1) {
    const doCategoria = products
      .filter((p) => p.category_id === categoryId)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    const alvo = index + direction;
    const atual = doCategoria[index];
    const vizinho = doCategoria[alvo];
    if (!atual || !vizinho) return;

    const posAtual = atual.position ?? 0;
    const posVizinho = vizinho.position ?? 0;

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
      await doSaveProduct({ data: payload(atual, posVizinho) });
      await doSaveProduct({ data: payload(vizinho, posAtual) });
      flash("Ordem atualizada!");
      refetch();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Erro ao reordenar");
    }
  }

  return (
    <div className="saboretal st-body">
      <div className="app-container" style={{ padding: 16, paddingBottom: 60 }}>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 4 }}>Painel do dono</h1>
        <p style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: 16 }}>
          Edite a loja, as categorias e os produtos do cardápio.
        </p>
        {msg ? (
          <div
            style={{
              background: "#fffbeb",
              border: "1px solid #fcd34d",
              borderRadius: 8,
              padding: 10,
              fontSize: "0.85rem",
              marginBottom: 12,
              position: "sticky",
              top: 8,
              zIndex: 5,
            }}
          >
            {msg}
          </div>
        ) : null}

        {/* Taxa adicional (chuva, feriado, alta demanda) */}
        {store ? (
          <div style={{ ...card, borderColor: store.surcharge_active ? "#f59e0b" : "#e5e7eb" }}>
            <h2 style={{ fontWeight: 600, marginBottom: 6 }}>Taxa adicional de entrega</h2>
            <p style={dica}>
              Ligue em dia de chuva, feriado ou alta demanda. Enquanto estiver ligada, o valor é
              somado na taxa de todas as entregas e o cliente vê o aviso no carrinho.
            </p>
            <label
              style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={store.surcharge_active}
                onChange={(e) => void alternarSobretaxa(e.target.checked)}
                style={{ width: 22, height: 22, accentColor: "#b45309" }}
              />
              <b style={{ color: store.surcharge_active ? "#b45309" : "#374151" }}>
                {store.surcharge_active ? "LIGADA — cobrando taxa adicional" : "Desligada"}
              </b>
            </label>
            <p style={dica}>Valor do adicional (R$)</p>
            <input
              key={`amt-${store.surcharge_amount}`}
              style={input}
              inputMode="decimal"
              defaultValue={String(store.surcharge_amount).replace(".", ",")}
              onBlur={(e) => {
                const n = parseFloat(e.target.value.replace(",", "."));
                setStore({ ...store, surcharge_amount: Number.isFinite(n) && n >= 0 ? n : 0 });
              }}
            />
            <p style={dica}>Texto mostrado para o cliente</p>
            <input
              style={input}
              value={store.surcharge_label}
              onChange={(e) => setStore({ ...store, surcharge_label: e.target.value })}
            />
            <button style={btn} onClick={() => void salvarLoja()}>
              Salvar taxa adicional
            </button>
          </div>
        ) : null}

        {/* Loja */}
        {store ? (
          <div style={card}>
            <h2 style={{ fontWeight: 600, marginBottom: 10 }}>Loja</h2>
            <input
              style={input}
              value={store.name}
              onChange={(e) => setStore({ ...store, name: e.target.value })}
              placeholder="Nome da loja"
            />
            <input
              style={input}
              value={store.description}
              onChange={(e) => setStore({ ...store, description: e.target.value })}
              placeholder="Descrição"
            />
            <input
              style={input}
              value={store.whatsapp}
              onChange={(e) => setStore({ ...store, whatsapp: e.target.value })}
              placeholder="WhatsApp com DDI e DDD, só números (ex: 5511999999999)"
            />
            <input
              style={input}
              value={store.hours_text}
              onChange={(e) => setStore({ ...store, hours_text: e.target.value })}
              placeholder="Horário exibido"
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              {store.logo_url ? (
                <img src={store.logo_url} alt="logo" style={{ width: 48, height: 48, borderRadius: 24 }} />
              ) : null}
              <button style={btnGhost} onClick={() => pickImage((url) => setStore({ ...store, logo_url: url }))}>
                Trocar logo
              </button>
              {store.cover_url ? (
                <img src={store.cover_url} alt="capa" style={{ width: 64, height: 40, borderRadius: 6 }} />
              ) : null}
              <button style={btnGhost} onClick={() => pickImage((url) => setStore({ ...store, cover_url: url }))}>
                Trocar capa
              </button>
            </div>

            <h3 style={{ fontWeight: 600, margin: "16px 0 6px" }}>📍 Endereço da loja (ponto de saída das entregas)</h3>
            {store.store_lat === null || store.store_lon === null ? (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#991b1b",
                  borderRadius: 8,
                  padding: 10,
                  fontSize: "0.8rem",
                  marginBottom: 8,
                }}
              >
                ⚠️ A loja ainda não foi localizada no mapa. Sem isso o site não consegue calcular a
                taxa de entrega pelo CEP do cliente.
              </div>
            ) : null}
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
            <input
              style={{ ...input, marginTop: 8 }}
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
                — confira se é mesmo a sua loja. Se estiver errado, copie a latitude/longitude certa
                no Google Maps (botão direito no local) e cole aqui.
              </p>
            ) : null}

            <button style={btn} onClick={() => void salvarLoja()}>
              Salvar loja
            </button>
          </div>
        ) : null}

        {/* Categorias */}
        <div style={card}>
          <h2 style={{ fontWeight: 600, marginBottom: 10 }}>Categorias</h2>
          {categories.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                style={{ ...input, marginBottom: 0 }}
                defaultValue={c.title}
                onBlur={async (e) => {
                  if (e.target.value !== c.title) {
                    await doSaveCategory({
                      data: { password, id: c.id, title: e.target.value, position: c.position },
                    });
                    flash("Categoria atualizada");
                    refetch();
                  }
                }}
              />
              <button
                style={btnGhost}
                onClick={async () => {
                  if (!confirm(`Remover a categoria "${c.title}" e seus produtos?`)) return;
                  await doDeleteCategory({ data: { password, id: c.id } });
                  flash("Categoria removida");
                  refetch();
                }}
              >
                Remover
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ ...input, marginBottom: 0 }}
              placeholder="Nova categoria"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
            />
            <button
              style={btn}
              onClick={async () => {
                if (!newCat.trim()) return;
                await doSaveCategory({
                  data: { password, id: null, title: newCat.trim(), position: categories.length },
                });
                setNewCat("");
                flash("Categoria criada");
                refetch();
              }}
            >
              Adicionar
            </button>
          </div>
        </div>

        {/* Produtos */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <h2 style={{ fontWeight: 600 }}>Produtos</h2>
            <button
              style={btn}
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
              Novo produto
            </button>
          </div>
          {categories.map((c) => (
            <div key={c.id} style={{ marginBottom: 12 }}>
              <p style={{ fontSize: "0.8rem", color: "#b45309", fontWeight: 600 }}>{c.title}</p>
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
                        onClick={() => moverProduto(c.id, idx, -1)}
                        title="Mover para cima"
                      >
                        ▲
                      </button>
                      <button
                        style={{ ...btnGhost, padding: "2px 8px", fontSize: "0.7rem", lineHeight: 1 }}
                        disabled={idx === arr.length - 1}
                        onClick={() => moverProduto(c.id, idx, 1)}
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
                    <button
                      style={btnGhost}
                      onClick={async () => {
                        if (!confirm(`Remover "${p.name}"?`)) return;
                        await doDeleteProduct({ data: { password, id: p.id } });
                        flash("Produto removido");
                        refetch();
                      }}
                    >
                      Remover
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </div>

        <Link to="/" className="owner-link">
          Voltar ao cardápio
        </Link>
      </div>

      {/* Editor de produto */}
      <div className={`st-overlay ${editing ? "active" : ""}`} onClick={() => setEditing(null)} />
      <div className={`bottom-sheet ${editing ? "active" : ""}`}>
        <div className="sheet-handle" />
        <div className="modal-body">
          {editing ? (
            <>
              <h2 style={{ fontWeight: 600, marginBottom: 10 }}>
                {editing.id ? "Editar produto" : "Novo produto"}
              </h2>
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
              <input
                style={input}
                placeholder="Nome"
                value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
              <textarea
                style={{ ...input, height: 70 }}
                placeholder="Descrição"
                value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
              <input
                style={input}
                type="number"
                step="0.01"
                placeholder="Preço (deixe vazio se usar tamanhos)"
                value={editing.price ?? ""}
                onChange={(e) =>
                  setEditing({ ...editing, price: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                {editing.image_url ? (
                  <img src={editing.image_url} alt="" style={{ width: 48, height: 48, borderRadius: 8 }} />
                ) : null}
                <button style={btnGhost} onClick={() => pickImage((url) => setEditing((p) => ({ ...p, image_url: url })))}>
                  Enviar foto
                </button>
              </div>
              <input
                style={input}
                placeholder="Ou cole o link da foto"
                value={editing.image_url ?? ""}
                onChange={(e) => setEditing({ ...editing, image_url: e.target.value })}
              />
              <p style={dica}>Tamanhos (um por linha: Nome | preço)</p>
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
                        return { label: (label ?? "").trim(), price: Number((price ?? "0").trim()) || 0 };
                      }),
                  })
                }
              />
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
                placeholder="Ex: 200"
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
                placeholder="Ex: 25"
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
                Cliente pode pedir salgados sortidos (sem escolher sabores)
              </label>
              <p style={dica}>
                Escolhas do combo/kit (uma por linha, formato "Título: opção 1, opção 2")
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
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={editing.active ?? true}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                />
                Mostrar no cardápio
              </label>
              <div style={{ display: "flex", gap: 8, paddingBottom: 20 }}>
                <button style={btn} onClick={salvarProduto}>
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