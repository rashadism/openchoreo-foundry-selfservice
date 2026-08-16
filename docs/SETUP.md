# Setup

Reproducible steps to stand up the demo on an OpenChoreo cluster with an existing
Azure AI Foundry account. Commands below use the demo's values; substitute your own.

## Prerequisites

- An OpenChoreo cluster (this was tested on `k3d-openchoreo`) with cert-manager present.
- An Azure AI Foundry account + project, and a chat model (`gpt-5-mini`) and an embedding
  model (`text-embedding-3-small`) deployed.
- `az` logged in with rights to create a service principal and role assignments.

## 1. Service principal

The provider and the app authenticate to Foundry as a service principal. It needs:
- **Foundry Project Manager** (data-plane: create agents / vector stores),
- **Cognitive Services Contributor** (so ASO can provision model deployments).

```bash
ACC=/subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.CognitiveServices/accounts/<account>
az ad sp create-for-rbac --name openchoreo-foundry-demo
SP=<appId from the output>

az role assignment create --assignee $SP --role "Foundry Project Manager" --scope $ACC
az role assignment create --assignee $SP --role "Foundry Project Manager" --scope $ACC/projects/<project>
az role assignment create --assignee $SP --role "Cognitive Services Contributor" --scope $ACC
```

> Data-plane role assignments can take several minutes to propagate before the first
> create succeeds.

## 2. Azure Service Operator (for the model)

```bash
helm repo add aso2 https://raw.githubusercontent.com/Azure/azure-service-operator/main/v2/charts
helm upgrade --install aso2 aso2/azure-service-operator --version 2.20.0 \
  --create-namespace -n azureserviceoperator-system \
  --set crdPattern='cognitiveservices.azure.com/*' \
  --set azureSubscriptionID=<sub> --set azureTenantID=<tenant> \
  --set azureClientID=$SP --set azureClientSecret=<secret>
```

## 3. The Crossplane provider (for the vector store / agent)

```bash
kubectl apply -f provider/config/crd/
kubectl apply -f provider/config/provider.yaml       # namespace, RBAC, Deployment

# The SP credential the provider (and app) use:
kubectl -n provider-foundry create secret generic azure-foundry-sp \
  --from-literal=AZURE_CLIENT_ID=$SP \
  --from-literal=AZURE_TENANT_ID=<tenant> \
  --from-literal=AZURE_CLIENT_SECRET=<secret>
```

Build/push the provider image and set it on the Deployment (`provider/Dockerfile`). On a
local k3d cluster, `k3d image import <image> -c <cluster>` and set
`imagePullPolicy: IfNotPresent`.

## 4. Point the cluster at your Foundry account

Edit `platform/foundry-account.yaml` with your endpoint and account ARM ID, then:

```bash
kubectl apply -f platform/foundry-account.yaml
```

## 5. Install the resource types (platform engineer)

```bash
kubectl apply -f resourcetypes/
```

## 6. The app (developer)

Build and push `app/` (`<registry>/rag-chat`), set the image in
`app/openchoreo/resources.yaml`, wire the SP secret into the workload env, then:

```bash
kubectl apply -f app/openchoreo/resources.yaml
```

Open the component's external endpoint and chat. The model answers grounded on the
documents in the vector store.

## Wiring the service principal

The app reads `AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_CLIENT_SECRET` via
`DefaultAzureCredential`. Source them from your platform's secret store through a
`SecretReference`, or (demo shortcut) reference the `azure-foundry-sp` secret directly.
