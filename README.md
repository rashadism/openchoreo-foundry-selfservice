# Self-service Azure AI Foundry on OpenChoreo

Platform engineers expose Azure AI Foundry **models** and **vector stores** as typed,
governed, self-service OpenChoreo resources. Developers create a `Resource`, bind it to
their component, and get the connection details as environment variables, without ever
touching the Azure portal or holding a credential.

This repo is the reference implementation behind the blog *"Self-service Azure AI Foundry
models and vector stores in OpenChoreo"* and a working RAG demo.

## Layout

| Path | What |
|------|------|
| `resourcetypes/` | The two `ClusterResourceType`s a platform engineer installs: `azure-foundry-model` (ASO) and `azure-foundry-vector-store` (Crossplane). |
| `provider/` | A small Crossplane provider that reconciles data-plane Foundry objects. Ships two CRDs: `FoundryAgent` and `FoundryVectorStore`. |
| `platform/` | One-time platform-engineer setup: the `foundry-account` ConfigMap, the ASO `Account` adoption CR, and the provider deployment. |
| `app/` | A RAG chat webapp (Next.js + Vercel AI SDK): streaming chat with tool calls and citations, plus a drag-and-drop document ingest panel. One component that depends on a model and a vector store. |
| `docs/` | `SETUP.md` (reproducible runbook), `ARCHITECTURE.md`, and `TEARDOWN.md`. |

## The two planes

A model deployment is an **ARM (control-plane)** resource, so
[Azure Service Operator](https://azure.github.io/azure-service-operator/) reconciles it.
A vector store (and an agent) is **data-plane only** — there is no ARM type — so a small
Crossplane provider reconciles it against the project's REST endpoint. Both give the same
developer-facing shape: a `Resource` with outputs, and a full create / heal / delete
lifecycle. See `docs/ARCHITECTURE.md`.

## Quick start

```bash
# Platform engineer, once:
kubectl apply -f resourcetypes/
kubectl apply -f platform/          # foundry-account ConfigMap + ASO Account + provider

# Developer:
kubectl apply -f app/openchoreo/    # a model Resource + a vector store Resource + the component
```

Full, reproducible steps (including ASO install and the service principal) are in
[`docs/SETUP.md`](docs/SETUP.md). To remove everything, follow
[`docs/TEARDOWN.md`](docs/TEARDOWN.md).
