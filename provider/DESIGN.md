# provider-foundry (design)

A small Crossplane provider that makes Foundry agents and vector stores managed objects,
so they are created, kept in sync, and deleted through a reconciliation loop rather than
a one-shot Job.

## Why

Azure has no ARM resource type for these data-plane objects; they are managed through the
project REST APIs. The provider watches custom resources and calls those APIs to make the
external state match the desired state.

## The object

A `FoundryAgent` holds what the agent should be:

```yaml
apiVersion: foundry.openchoreo.dev/v1alpha1
kind: FoundryAgent
metadata:
  name: support-bot
spec:
  forProvider:
    projectEndpoint: https://acct.services.ai.azure.com/api/projects/chat
    agentName: support-bot
    image: myacr.azurecr.io/support-bot:v1
    modelDeploymentName: gpt-4o-mini
```

## How it maps to the API

The provider implements four methods. Each is one call to the project:

| Method | When it runs | Foundry call |
|--------|--------------|--------------|
| Observe | every loop | `GET /agents/{name}` → is it there, and does it match? |
| Create | agent missing | `POST /agents` |
| Update | agent differs | `POST /agents/{name}/versions` (new version) |
| Delete | object removed | `DELETE /agents/{name}` |

Observe drives everything: if the agent is gone it triggers Create, if it drifted
it triggers Update. Crossplane handles the delete-on-teardown finalizer for you.

`FoundryVectorStore` follows the same lifecycle, using
`/openai/v1/vector_stores`. Foundry generates its `vs_...` identity, which the provider
stores in the `crossplane.io/external-name` annotation for later observation and deletion.

## Auth

The provider uses `DefaultAzureCredential` to get an Entra token for
`https://ai.azure.com/`. Out of cluster this can use the developer's Azure CLI login. The
checked-in in-cluster manifest supplies service-principal values from the
`azure-foundry-sp` Kubernetes Secret. It does not use a Foundry API key, but the current
in-cluster setup still has a client secret that must be stored and rotated.

## Status

Implemented and verified end-to-end (create → self-heal → finalizer delete) against
a live Foundry project. Files:

- `apis/v1alpha1/` — the `FoundryAgent` type + managed-resource methods
- `internal/clients/foundry.go` — the REST client (Get / Upsert / Delete)
- `internal/controller/foundryagent/foundryagent.go` — connector + Observe/Create/Update/Delete
- `cmd/provider/main.go` — the manager entrypoint
- `config/crd/` — generated CRD

## Run it

```bash
cd provider
kubectl apply -f config/crd/                 # install the CRD
go run ./cmd/provider                        # run out-of-cluster (uses your az login)
```

Out-of-cluster, the provider authenticates with `DefaultAzureCredential` (your
`az login`). In-cluster authentication is configured by the Deployment manifest and is
currently service-principal-secret based.
