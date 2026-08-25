package provider

import (
	"os"
	"strings"
	"testing"
)

func readRepositoryFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(b)
}

func TestProviderRBACIncludesVectorStorePermissions(t *testing.T) {
	manifest := readRepositoryFile(t, "config/provider.yaml")

	for _, expected := range []string{
		`resources: ["foundryvectorstores"]`,
		`resources: ["foundryvectorstores/status", "foundryvectorstores/finalizers"]`,
	} {
		if !strings.Contains(manifest, expected) {
			t.Errorf("provider RBAC is missing %s", expected)
		}
	}
}

func TestVectorStoreResourceTypeRendersEnvironmentEndpoint(t *testing.T) {
	manifest := readRepositoryFile(t, "../resourcetypes/azure-foundry-vector-store.yaml")
	want := "forProvider:\n            projectEndpoint: ${environmentConfigs.projectEndpoint}\n            storeName:"
	if !strings.Contains(manifest, want) {
		t.Fatalf("vector-store template does not pass environmentConfigs.projectEndpoint to the provider")
	}
}

func TestSampleUsesCollisionSafeModelDeploymentName(t *testing.T) {
	manifest := readRepositoryFile(t, "../app/openchoreo/resources.yaml")
	if !strings.Contains(manifest, "deploymentName: oc-rag-gpt-5-mini") {
		t.Fatalf("sample model deployment name is not demo-specific")
	}
}

func TestProviderManifestUsesLocalDurableImageName(t *testing.T) {
	manifest := readRepositoryFile(t, "config/provider.yaml")
	for _, expected := range []string{
		"image: provider-foundry:dev",
		"imagePullPolicy: IfNotPresent",
	} {
		if !strings.Contains(manifest, expected) {
			t.Errorf("provider manifest is missing %q", expected)
		}
	}
}
