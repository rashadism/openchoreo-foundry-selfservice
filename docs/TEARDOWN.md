# Teardown

Everything created for this demo, and how to remove it. Nothing here touches your
pre-existing Foundry account, project, or the `gpt-5-mini` / `text-embedding-3-small`
model deployments you already had.

## On the cluster (`k3d-openchoreo`)

```bash
# App + developer resources (if deployed)
kubectl delete -f app/openchoreo/ --ignore-not-found

# The vector store test CR (deleting it removes the vector store from Foundry via finalizer)
kubectl delete foundryvectorstore --all --ignore-not-found

# Resource types
kubectl delete -f resourcetypes/ --ignore-not-found

# The Crossplane provider + its namespace (secret + configmap go with it)
kubectl delete -f provider/config/provider.yaml --ignore-not-found
kubectl delete clusterrole provider-foundry --ignore-not-found
kubectl delete clusterrolebinding provider-foundry --ignore-not-found
kubectl delete crd foundryagents.foundry.openchoreo.dev foundryvectorstores.foundry.openchoreo.dev --ignore-not-found

# ASO
helm uninstall aso2 -n azureserviceoperator-system
kubectl delete namespace azureserviceoperator-system --ignore-not-found
```

## In Azure (personal subscription `7acf24e3-...`, rg `rg-rashad.20-1477`)

```bash
SP=94d308f4-d606-407e-851b-16b9ef71778d
ACC=/subscriptions/7acf24e3-c424-4485-9542-163d383056f8/resourceGroups/rg-rashad.20-1477/providers/Microsoft.CognitiveServices/accounts/rashad20-9496-resource

# Remove the role assignments granted to the demo SP
az role assignment delete --assignee $SP --scope $ACC
az role assignment delete --assignee $SP --scope $ACC/projects/rashad20-9496

# Delete the service principal + app registration (this also kills its client secret)
az ad app delete --id $SP

# Any leftover vector stores created during the demo (should be none after deleting the CRs)
# List and delete via the data-plane API if needed:
#   GET/DELETE https://rashad20-9496-resource.services.ai.azure.com/api/projects/rashad20-9496/vector_stores[/<id>]?api-version=v1
```

## Created for the demo (inventory)

- **Service principal** `openchoreo-foundry-demo` (appId `94d308f4-d606-407e-851b-16b9ef71778d`) with a client secret, and role assignments `Azure AI Developer`, `Cognitive Services Contributor`, and `Foundry Project Manager` (account + project scope).
- **ASO** (`aso2` helm release) with the `cognitiveservices.azure.com` CRDs.
- **provider-foundry** namespace: the provider Deployment, ServiceAccount, ClusterRole/Binding, the `azure-foundry-sp` Secret, and the `foundry-account` ConfigMap.
- CRDs `foundryagents` and `foundryvectorstores`.
- Any vector stores / model deployments provisioned through the resource types (removed by deleting the Resources / CRs).

Not created, and left alone: the Foundry account `rashad20-9496-resource`, the project
`rashad20-9496`, and the `gpt-5-mini` / `text-embedding-3-small` deployments.
