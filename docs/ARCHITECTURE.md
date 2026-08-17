# Architecture

## Two planes, one abstraction

Azure AI Foundry splits along Azure's control-plane / data-plane line, and that split
decides how each resource is provisioned.

- A **model deployment** is `Microsoft.CognitiveServices/accounts/deployments`, a real
  ARM (control-plane) resource. Azure Service Operator (ASO) reconciles it from a
  `Deployment` CR: create, heal, delete.
- A **vector store** (and an **agent**) has **no ARM type**; it is created against the
  project's data-plane REST endpoint. ASO cannot touch it, so a small Crossplane provider
  reconciles a `FoundryVectorStore` (or `FoundryAgent`) CR against that endpoint.

Both surface the same thing to a developer: an OpenChoreo `Resource` with outputs, and a
full lifecycle including a finalizer for clean teardown.

```
Developer Resource
   │
   ▼
ClusterResourceType renders a CR onto the data plane
   │
   ├─ model         → ASO Deployment CR        → ARM PUT         (control plane)
   └─ vector store  → FoundryVectorStore CR     → POST /vector_stores (data plane)
   │
   ▼
outputs (deployment name / store name / endpoint) → injected into the workload as env
```

## The Crossplane provider

`provider/` is a controller-runtime manager using crossplane-runtime's managed reconciler.
It ships two CRDs in group `foundry.openchoreo.dev`:

- **FoundryAgent** — a prompt agent (`GET/POST/DELETE /agents/{name}`).
- **FoundryVectorStore** — a vector store. Because a vector store's identity is a
  generated `vs_...` id, the reconciler records that id in the `crossplane.io/external-name`
  annotation on Create, and uses it for Observe and Delete.

Auth is keyless: `DefaultAzureCredential` reads a service principal from the
`azure-foundry-sp` secret and requests a token for `https://ai.azure.com`. The project
endpoint comes from the `foundry-account` ConfigMap, so no Azure detail is baked into a CR.

## Governance

The `azure-foundry-model` type is the guardrail: `modelName` is an enum (the allow-list),
`capacity` is the per-minute token limit, `skuName` is the tier. A developer picks within
them; the platform engineer sets them once.

## Retrieval (the app)

The RAG app (`app/`) is a Next.js app built with the [Vercel AI SDK](https://ai-sdk.dev).
It depends on a model Resource and a vector store Resource, and reads their outputs
(`MODEL_DEPLOYMENT`, `VECTOR_STORE_ID`, `FOUNDRY_PROJECT_ENDPOINT`) as env vars.

- **Chat** (`/api/chat`) streams answers via the Responses API with a `file_search` tool
  over the store, surfacing the tool call, the retrieved chunks, and file citations in the
  UI. Retrieval stays model + vector store, with no agent involved.
- **Ingest** (`/api/ingest`) accepts dropped files, uploads them to Foundry, and attaches
  them to the vector store as a batch. Foundry auto-chunks and embeds
  (`text-embedding-3-large`), so there is no embedding model to deploy.

Both paths authenticate with the same platform-provisioned service principal: a fresh
Entra bearer token (`getBearerTokenProvider`, scope `https://ai.azure.com/.default`) is
injected per request against Foundry's OpenAI-compatible `/openai/v1` surface.

### Streaming and the gateway timeout

Grounded answers over large documents can stream for tens of seconds. kgateway's default
request timeout is 15s, so a long stream gets its connection reset mid-flight — the answer
mostly renders, then the UI shows a "network error". OpenChoreo does not expose a
per-endpoint gateway timeout, so we attach a kgateway `TrafficPolicy`
(`app/openchoreo/route-timeout.yaml`) to the component's rendered HTTPRoute, raising the
request timeout to 300s and disabling the idle-stream timeout. It is a standalone resource,
so it survives OpenChoreo re-renders.
