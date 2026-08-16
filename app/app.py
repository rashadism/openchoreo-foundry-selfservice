"""A minimal RAG chatbot over an Azure AI Foundry model + vector store.

It depends on two OpenChoreo resources, injected as env vars:
  MODEL_DEPLOYMENT       - the chat model deployment name (e.g. gpt-5-mini)
  VECTOR_STORE_NAME      - the vector store's display name
  FOUNDRY_PROJECT_ENDPOINT - https://<acct>.services.ai.azure.com/api/projects/<proj>

Auth is keyless: DefaultAzureCredential reads the platform-provisioned service
principal from AZURE_CLIENT_ID / AZURE_TENANT_ID / AZURE_CLIENT_SECRET.

The vector store's real identity is a generated vs_... id, so we resolve it at
startup by listing vector stores and matching VECTOR_STORE_NAME. If the store is
empty we seed it with a couple of sample documents so retrieval has something to
find.
"""
import json
import os
import urllib.request

from azure.identity import DefaultAzureCredential
from flask import Flask, request, jsonify, Response

EP = os.environ["FOUNDRY_PROJECT_ENDPOINT"].rstrip("/")
MODEL = os.environ["MODEL_DEPLOYMENT"]
STORE_NAME = os.environ["VECTOR_STORE_NAME"]
API = "?api-version=v1"

app = Flask(__name__)
_cred = DefaultAzureCredential()
_store_id = None

SAMPLE_DOCS = {
    "openchoreo.md": (
        "OpenChoreo is an open-source internal developer platform for Kubernetes. "
        "Platform engineers define ClusterResourceTypes; developers create Resources "
        "from them and consume the outputs through their workload's dependencies."
    ),
    "foundry.md": (
        "Azure AI Foundry exposes models and agents. A model deployment is an ARM "
        "control-plane resource. A vector store is a data-plane object with no ARM type."
    ),
}


def _token():
    return _cred.get_token("https://ai.azure.com/.default").token


def _call(method, path, body=None, ctype="application/json"):
    data = None
    headers = {"Authorization": "Bearer " + _token()}
    if body is not None:
        if ctype == "application/json":
            data = json.dumps(body).encode()
        else:
            data = body
        headers["Content-Type"] = ctype
    req = urllib.request.Request(EP + path, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or "{}")


def _resolve_store():
    """Find the vector store id by name, seeding sample docs if it is empty."""
    global _store_id
    listing = _call("GET", "/vector_stores" + API)
    match = next((v for v in listing.get("data", []) if v.get("name") == STORE_NAME), None)
    if not match:
        raise RuntimeError(f"vector store {STORE_NAME!r} not found; is the Resource deployed?")
    _store_id = match["id"]
    if match.get("file_counts", {}).get("total", 0) == 0:
        _seed(_store_id)
    return _store_id


def _seed(store_id):
    for name, text in SAMPLE_DOCS.items():
        # upload the file (multipart), then attach to the vector store
        boundary = "----ocdemo"
        parts = (
            f'--{boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\nassistants\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\n'
            f"Content-Type: text/plain\r\n\r\n{text}\r\n--{boundary}--\r\n"
        ).encode()
        f = _call("POST", "/files" + API, parts, ctype=f"multipart/form-data; boundary={boundary}")
        _call("POST", f"/vector_stores/{store_id}/files{API}", {"file_id": f["id"]})


def store_id():
    global _store_id
    return _store_id or _resolve_store()


@app.get("/healthz")
def healthz():
    return jsonify(ok=True, model=MODEL, store=STORE_NAME)


@app.post("/chat")
def chat():
    msg = (request.get_json(force=True) or {}).get("message", "").strip()
    if not msg:
        return jsonify(error="empty message"), 400
    resp = _call("POST", "/responses" + API, {
        "model": MODEL,
        "input": msg,
        "tools": [{"type": "file_search", "vector_store_ids": [store_id()]}],
    })
    # Extract the assistant text from the Responses API output.
    answer = ""
    for item in resp.get("output", []):
        for c in item.get("content", []):
            if c.get("type") in ("output_text", "text"):
                answer += c.get("text", "")
    return jsonify(reply=answer or "(no answer)")


@app.get("/")
def index():
    return Response(INDEX_HTML, mimetype="text/html")


INDEX_HTML = """<!doctype html><meta charset=utf-8><title>Foundry RAG chat</title>
<style>body{font:16px system-ui;max-width:680px;margin:40px auto;padding:0 16px}
#log{border:1px solid #ddd;border-radius:8px;padding:12px;min-height:240px;white-space:pre-wrap}
.u{color:#1f6fe5}.a{color:#111;margin:6px 0 14px}form{display:flex;gap:8px;margin-top:12px}
input{flex:1;padding:10px;border:1px solid #ccc;border-radius:8px}button{padding:10px 16px}</style>
<h2>Foundry RAG chat</h2><p>Grounded on a Foundry vector store, answered by the model.</p>
<div id=log></div>
<form onsubmit="send(event)"><input id=m placeholder="Ask about OpenChoreo or Foundry..." autofocus>
<button>Send</button></form>
<script>
const log=document.getElementById('log');
async function send(e){e.preventDefault();const m=document.getElementById('m');const q=m.value.trim();
if(!q)return;m.value='';log.innerHTML+=`<div class=u>You: ${q}</div>`;
const r=await fetch('/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:q})});
const j=await r.json();log.innerHTML+=`<div class=a>${j.reply||j.error}</div>`;log.scrollTop=log.scrollHeight;}
</script>"""


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
