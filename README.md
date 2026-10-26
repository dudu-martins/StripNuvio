# StripNuvio

Addon para **Stremio** e **Nuvio** com transmissões ao vivo de **homens** do [Stripchat](https://br.stripchat.com/men).

Inspirado no [brazilcam4-nuvio](https://github.com/dudu-martins/brazilcam4-nuvio).

> Conteúdo adulto (18+). Use por sua conta e risco.

---

## Recursos

- Catálogo só de câmeras **masculinas** (Stripchat Men / Guys)
- Categorias na mesma ordem da seção do site (Especiais, Orientação, Popular)
- Miniaturas reais dos modelos
- Background com branding Stripchat Guys
- Proxy HLS com decrypt **MOUFLON** (tocar a live de verdade, sem o vídeo de propaganda)
- Busca por nome de usuário
- Paginação (`skip`)

---

## Instalação no Stremio / Nuvio

1. Abra o app → **Addons**
2. Cole a URL do manifest, por exemplo:

```text
https://stripnuvio.onrender.com/manifest.json
```

3. Instale e abra o catálogo **StripNuvio**

---

## Deploy no Render (recomendado)

1. Envie este repositório para o GitHub (**StripNuvio**)
2. No [Render](https://render.com): **New → Web Service**
3. Conecte o repositório
4. Configure:

| Campo            | Valor                          |
|------------------|--------------------------------|
| Environment      | Node                           |
| Build Command    | `npm install`                  |
| Start Command    | `node index.js`                |

5. Em **Environment** adicione:

```text
PUBLIC_URL=https://SEU-SERVICO.onrender.com
```

(sem barra no final; use o hostname real do serviço)

6. Deploy. Quando estiver **Live**, use:

```text
https://SEU-SERVICO.onrender.com/manifest.json
```

---

## Rodar local (teste)

```bash
git clone https://github.com/SEU-USUARIO/StripNuvio.git
cd StripNuvio
npm install
PUBLIC_URL=http://127.0.0.1:7000 node index.js
```

Manifest local:

```text
http://127.0.0.1:7000/manifest.json
```

> `127.0.0.1` só funciona no mesmo aparelho.

---

## Variáveis de ambiente

| Variável     | Descrição                                      | Padrão                          |
|--------------|------------------------------------------------|---------------------------------|
| `PUBLIC_URL` | URL pública do addon (sem `/` no final)        | —                               |
| `PORT`       | Porta do servidor                              | `7000`                          |

---

## Categorias (ordenação)

**Especiais**  
Brasil · Falam português · Ucraniano · Novos perfis · Vídeos em RV · BDSM · Shows por ingresso e de grupo

**Orientação**  
Bissexuais · Gay · Heterossexual

**Popular**  
Interactive Toy · Fluxo móvel · Sexo em grupo · Ao ar livre · Bundão · Anal · Sex Máquina · Hardcore · Mamilos grandes · Boquete · Fisting · De quatro · Masturbação · Axilas não depiladas · Fingering · Barba feita · Gozando dentro · Garganta funda · Pau grande · Chuveiro

---

## Como funciona (resumo técnico)

- Lista modelos via API pública do Stripchat (`primaryTag=men`)
- Streams HLS do CDN Doppio, com proxy de playlist no addon
- Decrypt **MOUFLON v2** (chaves da comunidade + atualização automática)
- Segmentos de vídeo vêm direto do CDN; só as playlists passam pelo servidor

---

## Avisos

- Conteúdo **18+**
- As chaves MOUFLON podem mudar; o addon tenta atualizar sozinho
- Em alguns clientes o ideal é player externo se o stream interno falhar
- Uso educacional / pessoal; respeite os termos do Stripchat

---

## Créditos

- Modelo de estrutura: [brazilcam4-nuvio](https://github.com/dudu-martins/brazilcam4-nuvio)
- Chaves MOUFLON: comunidade ([kesamom/stripchat_mouflon](https://github.com/kesamom/stripchat_mouflon) e projetos relacionados)

---

## Licença

Uso livre para fins pessoais. Sem garantias.
