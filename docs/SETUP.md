# Setup

Reproducible steps, validated on `k3d-openchoreo` against a personal Foundry account.
Substitute your own subscription / account / project values.

## Prerequisites

- An OpenChoreo cluster with cert-manager and a secret store (ESO + a `ClusterSecretStore`).
- A Foundry account + project, and a chat model (e.g. `gpt-5-mini`) you can deploy.
  You do **not** need an embedding model: `file_search` embeds automatically.
- `az` logged in with rights to create a service principal and role assignments.

## 1. Service principal

The provider and the app authenticate to Foundry as one service principal. It needs:
- **Foundry Project Manager** (data-plane: create vector stores / agents, run inference) at the account **and** project scope, and
- **Cognitive Services Contributor** (so ASO can provision model deployments).

```bash
ACC=/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<account>
az ad sp create-for-rbac --name openchoreo-foundry-demo    # capture appId + password + tenant
SP=<appId>
az role assignment create --assignee $SP --role "Foundry Project Manager"      --scope $ACC
az role assignment create --assignee $SP --role "Foundry Project Manager"      --scope $ACC/projects/<project>
az role assignment create --assignee $SP --role "Cognitive Services Contributor" --scope $ACC
```

> Data-plane role assignments take a few minutes to propagate before the first create succeeds.

## 2. Azure Service Operator (for the model)

```bash
helm repo add aso2 https://raw.githubusercontent.com/Azure/azure-service-operator/main/v2/charts
helm upgrade --install aso2 aso2/azure-service-operator --version 2.20.0 \
  --create-namespace -n azureserviceoperator-system \
  --set crdPattern='cognitiveservices.azure.com/*' \
  --set azureSubscriptionID=<sub> --set azureTenantID=<tenant> \
  --set azureClientID=$SP --set azureClientSecret=<secret>
```

## 3. The Crossplane provider (for the vector store)

```bash
kubectl apply -f provider/config/crd/
kubectl apply -f provider/config/provider.yaml          # namespace, RBAC, Deployment
kubectl apply -f provider/config/dataplane-rbac.yaml    # lets the OpenChoreo cluster-agent apply the CRs
kubectl apply -f platform/foundry-account.yaml          # provider's project-endpoint ConfigMap

kubectl -n provider-foundry create secret generic azure-foundry-sp \
  --from-literal=AZURE_CLIENT_ID=$SP --from-literal=AZURE_TENANT_ID=<tenant> \
  --from-literal=AZURE_CLIENT_SECRET=<secret>
```

Build/push the provider image (`provider/Dockerfile`) and set it on the Deployment. On k3d:
`k3d image import <image> -c <cluster>` and use `imagePullPolicy: IfNotPresent`.

> The `dataplane-rbac.yaml` step is essential: without it the cluster-agent cannot apply
> the `FoundryVectorStore` / ASO `Deployment` CRs the resource types render, and bindings
> fail with `ResourceApplyFailed ... forbidden`.

## 4. Install the resource types

```bash
kubectl apply -f resourcetypes/
```

## 5. Provision a model + a vector store (developer + deploy)

Create the Resources, then bind each to an environment. The binding supplies the
per-environment Azure detail (`accountArmId`, `projectEndpoint`) and is what actually
provisions.

```bash
kubectl apply -f app/openchoreo/resources.yaml    # the two Resources + the component/workload
# fill resourceRelease from `kubectl get resource <name> -n default -o jsonpath='{.status.latestRelease.name}'`
kubectl apply -f app/openchoreo/deploy.yaml        # bindings + the SP SecretReference
```

Put the SP into the secret store first (so the SecretReference resolves), e.g.:
`bao kv put secret/azure-foundry-sp AZURE_CLIENT_ID=$SP AZURE_TENANT_ID=<tenant> AZURE_CLIENT_SECRET=<secret>`.

## 6. The app

`app/` is a Next.js + Vercel AI SDK RAG webapp. Build and import it, then set the image in
`app/openchoreo/resources.yaml`:

```bash
cd app
docker build -t oc-rag-chat:web .
k3d image import oc-rag-chat:web -c openchoreo   # use imagePullPolicy: IfNotPresent
```

The component auto-deploys; its Workload binds the model + vector store outputs
(`MODEL_DEPLOYMENT`, `VECTOR_STORE_ID`, `FOUNDRY_PROJECT_ENDPOINT`) and the SP secret
(`AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_CLIENT_SECRET`). Open the component's
external endpoint: the chat streams grounded answers with the file_search tool call and
citations, and the knowledge-base panel lets you drag-and-drop documents to ingest.
