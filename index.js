const {
  addonBuilder,
  getRouter
} = require("stremio-addon-sdk");

const express = require("express");

const path = require("path");

let PUBLIC_URL =
  process.env.PUBLIC_URL ||
  "https://stripnuvio.onrender.com";

while (PUBLIC_URL.endsWith("/")) {
  PUBLIC_URL = PUBLIC_URL.slice(0, -1);
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const PREFIX = "stripchat:";
const CACHE_MS = 60000;
const PAGE_SIZE = 80;
const MAX_PAGES = 8;

// Background fixo com branding Stripchat Guys (servido pelo próprio addon)
function backgroundUrl() {
  return PUBLIC_URL + "/background.svg";
}

// Categorias exatamente como aparecem na imagem (ordenadas por seções)
const CATEGORIAS = [
  // Especiais
  "Brasil",
  "Falam português",
  "Ucraniano",
  "Novos perfis",
  "Vídeos em RV",
  "BDSM",
  "Shows por ingresso e de grupo",

  // Orientação
  "Bissexuais",
  "Gay",
  "Heterossexual",

  // Popular
  "Interactive Toy",
  "Fluxo móvel",
  "Sexo em grupo",
  "Ao ar livre",
  "Bundão",
  "Anal",
  "Sex Máquina",
  "Hardcore",
  "Mamilos grandes",
  "Boquete",
  "Fisting",
  "De quatro",
  "Masturbação",
  "Axilas não depiladas",
  "Fingering",
  "Barba feita",
  "Gozando dentro",
  "Garganta funda",
  "Pau grande",
  "Chuveiro"
];

const manifest = {
  id: "community.stripnuvio",
  version: "1.3.7",
  name: "StripNuvio",
  description:
    "StripNuvio · Transmissões ao vivo de homens no Stripchat",
  logo: PUBLIC_URL + "/logo.png",

  resources: ["catalog", "meta", "stream"],

  types: ["tv"],
  idPrefixes: [PREFIX],

  catalogs: [
    {
      type: "tv",
      id: "stripnuvio",
      name: "StripNuvio",

      extra: [
        {
          name: "genre",
          options: CATEGORIAS,
          isRequired: false
        },
        {
          name: "search",
          isRequired: false
        },
        {
          name: "skip",
          isRequired: false
        }
      ]
    }
  ],

  behaviorHints: {
    adult: true
  }
};

const builder = new addonBuilder(manifest);

// v1.3.3 style: prefere URL direta da API; proxy só como fallback
function thumb(usuario, previewUrl) {
  if (
    previewUrl &&
    (previewUrl.startsWith("http://") || previewUrl.startsWith("https://"))
  ) {
    return previewUrl;
  }
  if (previewUrl && previewUrl.startsWith("/")) {
    return "https://static-proxy.strpst.com" + previewUrl;
  }
  return (
    PUBLIC_URL +
    "/imagem/" +
    encodeURIComponent(usuario) +
    ".jpg"
  );
}

async function getJson(url) {
  const resposta = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      Referer: "https://stripchat.com/",
      Origin: "https://stripchat.com"
    },
    signal: AbortSignal.timeout(25000)
  });

  if (!resposta.ok) {
    throw new Error("HTTP " + resposta.status + " em " + url);
  }

  return resposta.json();
}

let cache = {
  t: 0,
  data: []
};

/**
 * Lista modelos masculinos online.
 * Usa o endpoint clássico /api/front/models que retorna lista plana.
 */
async function listarOnline(categoria) {
  const agora = Date.now();

  // Cache só para a lista geral (sem filtro específico de categoria)
  if (
    !categoria &&
    agora - cache.t < CACHE_MS &&
    cache.data.length > 0
  ) {
    return cache.data;
  }

  const vistos = new Map();
  let ordem = 0;

  // Mapeamento simples de algumas categorias da imagem → parâmetros
  let extraParams = "";
  const cat = (categoria || "").toLowerCase();

  if (cat === "novos perfis") {
    extraParams = "&isNew=true";
  } else if (cat === "vídeos em rv") {
    extraParams = "&isVr=true";
  } else if (cat === "fluxo móvel") {
    extraParams = "&isMobile=true";
  }

  for (let pagina = 0; pagina < MAX_PAGES; pagina++) {
    const offset = pagina * PAGE_SIZE;
    const url =
      "https://stripchat.com/api/front/models" +
      "?removeShows=false" +
      "&recInFeatured=false" +
      "&limit=" +
      PAGE_SIZE +
      "&offset=" +
      offset +
      "&sortBy=stripRanking" +
      "&primaryTag=men" +
      "&nic=true" +
      extraParams;

    try {
      const data = await getJson(url);
      const models = Array.isArray(data?.models) ? data.models : [];

      if (models.length === 0) break;

      for (const m of models) {
        const nome = String(m.username || "").trim();
        if (!nome || vistos.has(nome)) continue;

        // Só modelos ao vivo em público (ou groupShow)
        const status = String(m.status || "").toLowerCase();
        if (status !== "public" && status !== "groupshow" && status !== "group") {
          continue;
        }

        const country = String(m.country || "").toLowerCase();

        vistos.set(nome, {
          username: nome,
          id: m.id || m.streamName,
          streamName: m.streamName || String(m.id),
          viewers: Number(m.viewersCount) || 0,
          country,
          isNew: !!m.isNew,
          isVr: !!m.isVr,
          isMobile: !!m.isMobile,
          isHd: !!m.isHd,
          preview:
            m.previewUrlThumbBig ||
            m.previewUrlThumbSmall ||
            m.avatarUrl ||
            "",

          title: m.groupShowTopic || "",
          status,
          ordem: ordem++
        });
      }

      // Se a API indicar que acabou
      if (models.length < PAGE_SIZE) break;
    } catch (err) {
      console.error("[catalogo] página", pagina, err.message);
      break;
    }
  }

  let lista = [...vistos.values()];

  // Filtros client-side baseados nas categorias da imagem
  if (categoria) {
    const c = categoria.toLowerCase();

    if (c === "brasil") {
      lista = lista.filter((m) => m.country === "br");
    } else if (c === "falam português") {
      // Aprox: Brasil + Portugal (quando country vier)
      lista = lista.filter(
        (m) => m.country === "br" || m.country === "pt"
      );
    } else if (c === "ucraniano") {
      lista = lista.filter((m) => m.country === "ua");
    } else if (c === "novos perfis") {
      lista = lista.filter((m) => m.isNew);
    } else if (c === "vídeos em rv") {
      lista = lista.filter((m) => m.isVr);
    } else if (c === "fluxo móvel") {
      lista = lista.filter((m) => m.isMobile);
    }
    // As outras categorias (Gay, Anal, Boquete, etc.)
    // ficam na lista geral por enquanto (a API pública não expõe tags fáceis na listagem)
  }

  // Ordena por espectadores (mais populares primeiro) por padrão
  lista.sort((a, b) => b.viewers - a.viewers);

  if (!categoria) {
    cache = {
      t: Date.now(),
      data: lista
    };
  }

  console.log(
    "[catalogo]",
    lista.length,
    "transmissoes",
    categoria ? "(" + categoria + ")" : "(geral)"
  );

  return lista;
}

builder.defineCatalogHandler(async function ({ extra }) {
  try {
    const categoria = extra?.genre || null;
    let usuarios = await listarOnline(categoria);

    // Busca por nome
    if (extra?.search) {
      const busca = String(extra.search).toLowerCase().trim();
      usuarios = usuarios.filter((u) =>
        u.username.toLowerCase().includes(busca)
      );
    }

    const skipInformado = parseInt(extra?.skip || "0", 10);
    const skip =
      Number.isFinite(skipInformado) && skipInformado >= 0
        ? skipInformado
        : 0;

    const metas = usuarios.slice(skip, skip + 100).map(function (u) {
      const descParts = [];
      if (u.viewers > 0) descParts.push(u.viewers + " espectadores");
      if (u.country) descParts.push(u.country.toUpperCase());
      if (u.isHd) descParts.push("HD");
      if (u.isMobile) descParts.push("Mobile");
      if (u.isVr) descParts.push("VR");
      if (u.title) descParts.push(u.title);

      const img = thumb(u.username, u.preview);
      return {
        id: PREFIX + u.username,
        type: "tv",
        name: u.username,
        poster: img,
        background: backgroundUrl(),
        posterShape: "landscape",
        description: descParts.join(" · ")
      };
    });

    return { metas };
  } catch (erro) {
    console.error("[catalogo]", erro.message);
    return { metas: [] };
  }
});

// Meta: poster = preview do modelo; background = logo Stripchat Guys (fixo)
builder.defineMetaHandler(async function ({ id }) {
  if (typeof id !== "string" || !id.startsWith(PREFIX)) {
    return { meta: null };
  }

  const usuario = id.slice(PREFIX.length);
  let imageUrl = thumb(usuario);

  try {
    const userData = await getJson(
      "https://stripchat.com/api/front/users/user-ids/" +
        encodeURIComponent(usuario)
    );

    if (userData && userData.id) {
      const camData = await getJson(
        "https://stripchat.com/api/front/v2/models/" + userData.id + "/cam"
      );

      const u =
        (camData && camData.user && camData.user.user) ||
        (camData && camData.user) ||
        {};

      const preview =
        u.previewUrl ||
        u.previewUrlThumbBig ||
        u.previewUrlThumbSmall ||
        u.avatarUrl ||
        u.avatarUrlOriginal ||
        null;

      if (preview) {
        imageUrl = thumb(usuario, preview);
      }
    }
  } catch (e) {
    // mantém fallback
  }

  return {
    meta: {
      id,
      type: "tv",
      name: usuario,
      poster: imageUrl,
      background: backgroundUrl(),
      posterShape: "landscape",
      behaviorHints: {
        isLive: true
      }
    }
  };
});

// Resolve streamName a partir do username
async function resolveStreamName(usuario) {
  let modelId = null;
  let streamName = null;

  try {
    const userData = await getJson(
      "https://stripchat.com/api/front/users/user-ids/" +
        encodeURIComponent(usuario)
    );
    if (userData && userData.id) modelId = userData.id;
  } catch (e) {}

  let camData = null;
  if (modelId) {
    try {
      camData = await getJson(
        "https://stripchat.com/api/front/v2/models/" + modelId + "/cam"
      );
    } catch (e) {}
  }

  if (!camData) {
    try {
      camData = await getJson(
        "https://stripchat.com/api/front/v2/models/username/" +
          encodeURIComponent(usuario) +
          "/cam"
      );
    } catch (e) {}
  }

  if (camData) {
    streamName =
      camData.streamName ||
      (camData.cam && camData.cam.streamName) ||
      (camData.user && camData.user.streamName) ||
      modelId;
  }

  if (!streamName && modelId) streamName = String(modelId);
  if (!streamName) streamName = usuario;

  return String(streamName);
}

builder.defineStreamHandler(async function ({ id }) {
  if (typeof id !== "string" || !id.startsWith(PREFIX)) {
    return { streams: [] };
  }

  const usuario = id.slice(PREFIX.length);

  try {
    // Aponta para o nosso proxy de playlist (mais estável que URL direta)
    const proxyUrl = PUBLIC_URL + "/proxy/" + encodeURIComponent(usuario) + "/master.m3u8";

    return {
      streams: [
        {
          name: "StripNuvio",
          title: "Ao vivo • HLS (proxy)",
          url: proxyUrl,
          behaviorHints: {
            notWebReady: false, // tenta player interno primeiro
            bingeGroup: "stripchat-live"
          }
        }
      ]
    };
  } catch (erro) {
    console.error("[stream]", usuario, erro.message);
    return { streams: [] };
  }
});

const app = express();

app.get("/logo.png", (req, res) => {
  res.sendFile(path.join(__dirname, "logo.png"));
});

app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// Background fixo – branding Stripchat Guys (vermelho + logo)
app.get("/background.svg", function (req, res) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#c41e3a"/>
      <stop offset="55%" stop-color="#8b0000"/>
      <stop offset="100%" stop-color="#1a0000"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#bg)"/>
  <!-- chat bubble mark -->
  <g transform="translate(760,340)">
    <circle cx="80" cy="80" r="78" fill="#ffffff"/>
    <path d="M40 70c0-22 18-40 40-40s40 18 40 40c0 16-9 30-23 36l6 22-24-14c-3 1-6 1-9 1-22 0-40-18-40-40z" fill="#c41e3a"/>
    <path d="M68 78h24M68 92h16" stroke="#ffffff" stroke-width="6" stroke-linecap="round"/>
  </g>
  <text x="960" y="560" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="96" font-weight="900" fill="#ffffff" letter-spacing="8">STRIPCHAT</text>
  <rect x="860" y="590" width="200" height="48" rx="10" fill="#1e3a8a"/>
  <text x="960" y="624" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="28" font-weight="800" fill="#ffffff" letter-spacing="4">GUYS</text>
</svg>`;
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(svg);
});


// Ícone do addon (lista de addons no Stremio/Nuvio)
app.get("/logo.svg", function (req, res) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e11d48"/>
      <stop offset="100%" stop-color="#7f1d1d"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  <!-- bubble -->
  <circle cx="256" cy="220" r="110" fill="#ffffff"/>
  <path d="M200 205c0-30 25-55 56-55s56 25 56 55c0 22-12 41-32 50l8 30-33-19c-4 1-8 2-13 2-31 0-56-25-56-56z" fill="#e11d48"/>
  <path d="M232 215h48M232 235h32" stroke="#ffffff" stroke-width="10" stroke-linecap="round"/>
  <!-- GUYS badge -->
  <rect x="156" y="360" width="200" height="56" rx="12" fill="#1e3a8a"/>
  <text x="256" y="400" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="32" font-weight="800" fill="#ffffff" letter-spacing="3">GUYS</text>
</svg>`;
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(svg);
});

// ========== PROXY HLS COM DECRYPT MOUFLON ==========

const crypto = require("crypto");

// Chaves pkey → pdkey (atualizadas da comunidade kesamom/stripchat_mouflon)
// Serão atualizadas automaticamente se possível
let MOUFLON_KEYS = {
  Zokee2OhPh9kugh4: "Quean4cai9boJa5a",
  Zeechoej4aleeshi: "ubahjae7goPoodi6",
  Ook7quaiNgiyuhai: "EQueeGh2kaewa3ch",
  Fq6m2TO2ZeBkRPm9: "xb6di1NF9EFXHUwb",
  GrRncsoByZmsiT6L: "NigHYyOD9l4rvAEb",
  "1Dzcc6OjP73LKbtI": "Y64UVwX5RrIWnOLp",
  N2oLovTIXb0o28Uj: "ABE7Sj8jh3oPM2ae",
  NTK9aqcLmNFMWrpQ: "tOcYOap4Ty1l9Jzb",
  "7uUnbD0jMCB9GH32": "lzCQ6QBTnLpB0zMF",
  Ohi7eTRBpkAuML0l: "kExe29N2sLFrHGqu",
  OLzu7QlySkG2fVRn: "CsovScFH9VirSJ4Z"
};

let keysLastFetch = 0;

async function refreshMouflonKeys() {
  if (Date.now() - keysLastFetch < 30 * 60 * 1000) return; // 30 min
  try {
    const r = await fetch(
      "https://raw.githubusercontent.com/kesamom/stripchat_mouflon/main/stripchat_mouflon_keys.json",
      { signal: AbortSignal.timeout(8000) }
    );
    if (r.ok) {
      const data = await r.json();
      if (data && typeof data === "object") {
        MOUFLON_KEYS = { ...MOUFLON_KEYS, ...data };
        keysLastFetch = Date.now();
        console.log("[mouflon] keys refreshed, total:", Object.keys(MOUFLON_KEYS).length);
      }
    }
  } catch (e) {
    // mantém as chaves embutidas
  }
}

// Decripta token MOUFLON v2
function mouflonDecode(encryptedB64, pdkey) {
  const hash = crypto.createHash("sha256").update(pdkey, "utf8").digest();
  let b64 = encryptedB64;
  while (b64.length % 4 !== 0) b64 += "=";
  let data;
  try {
    data = Buffer.from(b64, "base64");
  } catch (e) {
    return null;
  }
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ hash[i % hash.length];
  }
  try {
    return out.toString("utf8");
  } catch (e) {
    return null;
  }
}

// Extrai pkey/pdkey de um master m3u8
function extractMouflon(masterText) {
  const lines = masterText.split("\n");
  for (const line of lines) {
    if (line.includes("#EXT-X-MOUFLON:PSCH:v2:")) {
      const parts = line.trim().split(":");
      // #EXT-X-MOUFLON:PSCH:v2:PKEY
      if (parts.length >= 4) {
        const pkey = parts[3].trim();
        const pdkey = MOUFLON_KEYS[pkey];
        if (pdkey) {
          return { psch: "v2", pkey, pdkey };
        }
      }
    }
  }
  // tenta qualquer pkey conhecido que apareça
  for (const line of lines) {
    for (const pkey of Object.keys(MOUFLON_KEYS)) {
      if (line.includes(pkey)) {
        return { psch: "v2", pkey, pdkey: MOUFLON_KEYS[pkey] };
      }
    }
  }
  return null;
}

// Decripta uma media playlist (substitui tokens criptografados)
function decryptMediaPlaylist(body, pdkey) {
  const lines = body.split("\n");
  const out = [];
  let lastDecoded = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("#EXT-X-MOUFLON:URI:")) {
      // Formato: #EXT-X-MOUFLON:URI:https://.../xxx_ENCODED_yyy.mp4
      const uri = trimmed.slice("#EXT-X-MOUFLON:URI:".length);
      try {
        const parts = uri.split("_");
        if (parts.length >= 2) {
          const encodedPart = parts[parts.length - 2];
          const reversed = encodedPart.split("").reverse().join("");
          const decodedPart = mouflonDecode(reversed, pdkey);
          if (decodedPart) {
            const newUri = uri.replace(encodedPart, decodedPart);
            // Pega só o path relativo final (como o StreaMonitor faz)
            const pathParts = newUri.split("/");
            lastDecoded = pathParts.slice(4).join("/") || newUri;
            // Não emite a linha MOUFLON, só guarda o resultado
            continue;
          }
        }
      } catch (e) {}
      // se falhar, ignora a linha MOUFLON
      continue;
    }

    // Linha de segmento que normalmente é um placeholder
    if (lastDecoded && !trimmed.startsWith("#") && trimmed.length > 0) {
      // Substitui o placeholder pelo path decriptado
      // Muitos casos o segmento vem como nome fixo; usamos o lastDecoded
      if (trimmed.includes("media") || trimmed.endsWith(".mp4") || trimmed.endsWith(".ts") || !trimmed.startsWith("http")) {
        out.push(lastDecoded.startsWith("http") ? lastDecoded : trimmed.replace(/[^/]+$/, lastDecoded.split("/").pop()));
        // Melhor: se lastDecoded for path completo relativo ao host
        // Vamos preferir construir URL absoluta se possível
        lastDecoded = null;
        continue;
      }
    }

    out.push(line);
  }

  return out.join("\n");
}

// Versão mais robusta de decrypt (baseada no StreaMonitor)
// Substitui o placeholder media.mp4 pela URL completa decriptada
function decryptMediaPlaylistV2(body, pdkey) {
  const lines = body.split("\n");
  const out = [];
  let pendingUrl = null;
  const MOUFLON_URI = "#EXT-X-MOUFLON:URI:";

  for (const line of lines) {
    const trimmed = line.trim();

    // Token criptografado
    if (trimmed.startsWith(MOUFLON_URI)) {
      const uri = trimmed.slice(MOUFLON_URI.length);
      try {
        const parts = uri.split("_");
        if (parts.length >= 2) {
          const encodedPart = parts[parts.length - 2];
          const reversed = encodedPart.split("").reverse().join("");
          const decodedPart = mouflonDecode(reversed, pdkey);
          if (decodedPart && decodedPart.length > 2) {
            pendingUrl = uri.replace(encodedPart, decodedPart);
          }
        }
      } catch (e) {
        pendingUrl = null;
      }
      continue; // nunca emite a tag MOUFLON
    }

    // Linha de segmento (placeholder media.mp4) → troca pela URL real
    if (pendingUrl && trimmed && !trimmed.startsWith("#")) {
      out.push(pendingUrl);
      pendingUrl = null;
      continue;
    }

    // Remove tags MOUFLON residuais
    if (trimmed.includes("MOUFLON")) continue;

    out.push(line);
  }

  return out.join("\n");
}

const CDN_HEADERS = {
  "User-Agent": UA,
  Referer: "https://stripchat.com/",
  Origin: "https://stripchat.com",
  Accept: "*/*"
};

// Master playlist → reescreve media playlists para nosso proxy + tenta anexar psch/pkey
app.get("/proxy/:usuario/master.m3u8", async function (req, res) {
  try {
    await refreshMouflonKeys();

    const usuario = String(req.params.usuario || "").trim();
    if (!usuario || usuario.length > 80) {
      return res.status(400).send("invalid");
    }

    const streamName = await resolveStreamName(usuario);

    const masterCandidates = [
      `https://edge-hls.doppiocdn.com/hls/${streamName}/master/${streamName}_auto.m3u8`,
      `https://edge-hls.doppiocdn.org/hls/${streamName}/master/${streamName}_auto.m3u8`,
      `https://media-hls.doppiocdn.com/b-hls-12/${streamName}/master/${streamName}_auto.m3u8`
    ];

    let masterText = null;

    for (const url of masterCandidates) {
      try {
        const r = await fetch(url, {
          headers: CDN_HEADERS,
          signal: AbortSignal.timeout(12000)
        });
        if (r.ok) {
          masterText = await r.text();
          break;
        }
      } catch (e) {}
    }

    if (!masterText) {
      return res.status(502).send("master unavailable");
    }

    const mouflon = extractMouflon(masterText);

    // Reescreve as media playlists para passarem pelo nosso proxy decriptador
    const lines = masterText.split("\n");
    const out = [];

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith("#") || trimmed === "") {
        // Remove as tags MOUFLON do master (já vamos tratar no media)
        if (trimmed.includes("MOUFLON")) continue;
        out.push(line);
        continue;
      }

      if (trimmed.startsWith("http")) {
        let mediaUrl = trimmed;
        // Alguns players se beneficiam de receber psch/pkey na query
        if (mouflon) {
          const sep = mediaUrl.includes("?") ? "&" : "?";
          mediaUrl = mediaUrl + sep + "psch=" + mouflon.psch + "&pkey=" + encodeURIComponent(mouflon.pkey);
        }

        const proxied =
          PUBLIC_URL +
          "/proxy/" +
          encodeURIComponent(usuario) +
          "/media?u=" +
          encodeURIComponent(mediaUrl) +
          (mouflon ? "&pk=" + encodeURIComponent(mouflon.pkey) : "");
        out.push(proxied);
      } else {
        out.push(line);
      }
    }

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-cache, no-store");
    res.send(out.join("\n"));
  } catch (err) {
    console.error("[proxy master]", err.message);
    res.status(502).send("proxy error");
  }
});

// Media playlist com decrypt MOUFLON
app.get("/proxy/:usuario/media", async function (req, res) {
  try {
    const target = req.query.u;
    const pkey = req.query.pk || null;

    if (!target || typeof target !== "string" || !target.startsWith("http")) {
      return res.status(400).send("missing url");
    }

    if (
      !target.includes("doppiocdn.") &&
      !target.includes("strpst.com") &&
      !target.includes("stripchat.")
    ) {
      return res.status(403).send("forbidden");
    }

    const r = await fetch(target, {
      headers: CDN_HEADERS,
      signal: AbortSignal.timeout(15000)
    });

    if (!r.ok) {
      return res.status(502).send("upstream " + r.status);
    }

    let body = await r.text();
    const baseUrl = target.substring(0, target.lastIndexOf("/") + 1);

    // Tenta encontrar pdkey
    let pdkey = null;
    if (pkey && MOUFLON_KEYS[pkey]) {
      pdkey = MOUFLON_KEYS[pkey];
    } else {
      // tenta extrair do próprio body
      const m = extractMouflon(body);
      if (m) pdkey = m.pdkey;
    }

    if (pdkey && body.includes("MOUFLON")) {
      body = decryptMediaPlaylistV2(body, pdkey);
    } else {
      // fallback: só absolutiza segmentos
      const lines = body.split("\n");
      const out = [];
      for (const line of lines) {
        const t = line.trim();
        if (t && !t.startsWith("#") && !t.startsWith("http")) {
          out.push(baseUrl + t);
        } else if (!t.includes("MOUFLON")) {
          out.push(line);
        }
      }
      body = out.join("\n");
    }

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-cache, no-store");
    res.send(body);
  } catch (err) {
    console.error("[proxy media]", err.message);
    res.status(502).send("proxy error");
  }
});

// Proxy de thumbnail – tenta várias fontes reais do Stripchat
// Proxy de imagem no estilo do brazilcam4-nuvio
app.get("/imagem/:usuario.jpg", async function (req, res) {
  try {
    const usuario = String(req.params.usuario || "").trim();

    if (
      usuario === "" ||
      usuario.length > 100 ||
      usuario.includes("/") ||
      usuario.includes("..")
    ) {
      return res.status(400).send("Nome inválido");
    }

    let imageUrl = null;

    // 1. Busca preview real pela API (estrutura camData.user.user.*)
    try {
      const userData = await getJson(
        "https://stripchat.com/api/front/users/user-ids/" +
          encodeURIComponent(usuario)
      );

      if (userData && userData.id) {
        const camData = await getJson(
          "https://stripchat.com/api/front/v2/models/" + userData.id + "/cam"
        );

        const u =
          (camData && camData.user && camData.user.user) ||
          (camData && camData.user) ||
          {};

        imageUrl =
          u.previewUrl ||
          u.previewUrlThumbBig ||
          u.previewUrlThumbSmall ||
          u.avatarUrl ||
          u.avatarUrlOriginal ||
          null;
      }
    } catch (e) {
      // continua
    }

    if (imageUrl && imageUrl.startsWith("/")) {
      imageUrl = "https://static-proxy.strpst.com" + imageUrl;
    }

    const candidates = [
      imageUrl,
      "https://static-proxy.strpst.com/previews/" + encodeURIComponent(usuario) + "/thumb_big",
      "https://static-proxy.strpst.com/avatars/" + encodeURIComponent(usuario)
    ].filter(Boolean);

    for (const url of candidates) {
      try {
        const imgRes = await fetch(url, {
          headers: {
            "User-Agent": UA,
            Referer: "https://stripchat.com/",
            Accept: "image/*"
          },
          signal: AbortSignal.timeout(12000)
        });

        if (!imgRes.ok) continue;

        const tipo = (imgRes.headers.get("content-type") || "")
          .split(";")[0]
          .trim()
          .toLowerCase();

        if (!tipo.startsWith("image/")) continue;

        const buf = Buffer.from(await imgRes.arrayBuffer());
        if (buf.length < 500) continue;

        res.setHeader("Content-Type", tipo);
        res.setHeader("Cache-Control", "public, max-age=120");
        return res.send(buf);
      } catch (e) {
        // tenta próximo
      }
    }

    // Placeholder cinza 1x1
    const placeholder = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=30");
    res.send(placeholder);
  } catch (erro) {
    console.error("[imagem]", erro.message);
    if (!res.headersSent) {
      res.status(502).send("Falha ao carregar imagem");
    }
  }
});

app.use(getRouter(builder.getInterface()));

const port = Number(process.env.PORT) || 7000;

app.listen(port, "0.0.0.0", function () {
  console.log("Addon ouvindo na porta " + port);
  console.log("Manifest: " + PUBLIC_URL + "/manifest.json");
});
