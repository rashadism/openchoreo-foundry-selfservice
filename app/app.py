"""A minimal RAG chatbot over an Azure AI Foundry model + vector store.

Depends on two OpenChoreo resources, injected as env vars:
  MODEL_DEPLOYMENT          - chat model deployment name (e.g. gpt-5-mini)
  VECTOR_STORE_ID           - the vector store id (vs_...)
  FOUNDRY_PROJECT_ENDPOINT  - https://<acct>.services.ai.azure.com/api/projects/<proj>

Auth is keyless: DefaultAzureCredential reads the platform-provisioned service
principal from AZURE_CLIENT_ID / AZURE_TENANT_ID / AZURE_CLIENT_SECRET and gets an
Entra token for https://ai.azure.com/.default.

file_search embeds automatically (service-managed text-embedding-3-large), so there
is no embedding model to deploy or configure. On startup we seed a couple of sample
docs if the store is empty, then answer via the Responses API with a file_search tool.
"""
import os
import time

from azure.identity import DefaultAzureCredential
from flask import Flask, request, jsonify, Response
from openai import OpenAI

EP = os.environ["FOUNDRY_PROJECT_ENDPOINT"].rstrip("/")
BASE = f"{EP}/openai/v1/"
MODEL = os.environ["MODEL_DEPLOYMENT"]
VS_ID = os.environ["VECTOR_STORE_ID"]

app = Flask(__name__)
_cred = DefaultAzureCredential()

SAMPLE_DOCS = {
    "openchoreo.txt": (
        "OpenChoreo is an open-source internal developer platform for Kubernetes. "
        "Platform engineers author ClusterResourceTypes; developers create Resources "
        "from them and consume the outputs through their workload's dependencies. "
        "A model deployment is provisioned by Azure Service Operator; a vector store "
        "is provisioned by a small Crossplane provider."
    ),
    "foundry.txt": (
        "Azure AI Foundry exposes models and agents. A model deployment is an ARM "
        "control-plane resource. A vector store is a data-plane object with no ARM "
        "type. file_search embeds documents automatically with text-embedding-3-large."
    ),
}


def client() -> OpenAI:
    # Fresh Entra token per call; DefaultAzureCredential caches + refreshes internally.
    tok = _cred.get_token("https://ai.azure.com/.default").token
    return OpenAI(base_url=BASE, api_key=tok)


def ensure_seeded():
    """Upload + attach sample docs if the store has no files, then wait until indexed."""
    c = client()
    store = c.vector_stores.retrieve(VS_ID)
    if store.file_counts.total and store.file_counts.total > 0:
        return
    file_ids = []
    for name, text in SAMPLE_DOCS.items():
        f = c.files.create(file=(name, text.encode(), "text/plain"), purpose="assistants")
        file_ids.append(f.id)
    c.vector_stores.file_batches.create(vector_store_id=VS_ID, file_ids=file_ids)
    # Poll until indexed (status completed and nothing in progress).
    for _ in range(30):
        s = c.vector_stores.retrieve(VS_ID)
        if s.status == "completed" and s.file_counts.in_progress == 0:
            return
        time.sleep(2)


@app.get("/healthz")
def healthz():
    return jsonify(ok=True, model=MODEL, vectorStore=VS_ID)


@app.post("/chat")
def chat():
    msg = (request.get_json(force=True) or {}).get("message", "").strip()
    if not msg:
        return jsonify(error="empty message"), 400
    try:
        ensure_seeded()
        r = client().responses.create(
            model=MODEL,
            input=msg,
            tools=[{"type": "file_search", "vector_store_ids": [VS_ID], "max_num_results": 20}],
            include=["file_search_call.results"],
        )
        answer = getattr(r, "output_text", "") or ""
        if not answer:
            msg_item = next((o for o in r.output if o.type == "message"), None)
            if msg_item:
                answer = "".join(getattr(c, "text", "") for c in msg_item.content)
        return jsonify(reply=answer or "(no answer)")
    except Exception as e:  # surface the error to the UI for a demo
        return jsonify(error=f"{type(e).__name__}: {e}"), 500


@app.get("/")
def index():
    return Response(INDEX_HTML, mimetype="text/html")


INDEX_HTML = """<!doctype html><meta charset=utf-8><title>Foundry RAG chat</title>
<style>body{font:16px system-ui;max-width:680px;margin:40px auto;padding:0 16px}
#log{border:1px solid #ddd;border-radius:8px;padding:12px;min-height:240px;white-space:pre-wrap}
.u{color:#1f6fe5}.a{margin:6px 0 14px}form{display:flex;gap:8px;margin-top:12px}
input{flex:1;padding:10px;border:1px solid #ccc;border-radius:8px}button{padding:10px 16px}</style>
<h2>Foundry RAG chat</h2><p>Grounded on an OpenChoreo-provisioned Foundry vector store, answered by the model.</p>
<div id=log></div>
<form onsubmit="send(event)"><input id=m placeholder="Ask about OpenChoreo or Foundry..." autofocus>
<button>Send</button></form>
<script>
const log=document.getElementById('log');
async function send(e){e.preventDefault();const m=document.getElementById('m');const q=m.value.trim();
if(!q)return;m.value='';log.innerHTML+=`<div class=u>You: ${q}</div>`;
const r=await fetch('/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:q})});
const j=await r.json();log.innerHTML+=`<div class=a>${j.reply||('Error: '+j.error)}</div>`;log.scrollTop=log.scrollHeight;}
</script>"""


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
