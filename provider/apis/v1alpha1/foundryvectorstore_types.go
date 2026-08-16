package v1alpha1

import (
	xpv1 "github.com/crossplane/crossplane-runtime/apis/common/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// FoundryVectorStoreParameters is the desired state of a vector store.
type FoundryVectorStoreParameters struct {
	// ProjectEndpoint of an existing Foundry project, e.g.
	// https://<account>.services.ai.azure.com/api/projects/<project>.
	// Optional: when empty the provider reads it from the PE-provisioned
	// `foundry-account` ConfigMap.
	// +optional
	ProjectEndpoint string `json:"projectEndpoint,omitempty"`
	// StoreName is the display name given to the vector store in Foundry.
	// The store's real identity is the generated `vs_...` id, tracked in status
	// and via the crossplane.io/external-name annotation.
	StoreName string `json:"storeName"`
}

// FoundryVectorStoreObservation is the observed state from Azure.
type FoundryVectorStoreObservation struct {
	Exists bool   `json:"exists,omitempty"`
	// ID is the Foundry-generated vector store id (vs_...).
	ID string `json:"id,omitempty"`
}

// A FoundryVectorStoreSpec defines the desired state of a FoundryVectorStore.
type FoundryVectorStoreSpec struct {
	xpv1.ResourceSpec `json:",inline"`
	ForProvider       FoundryVectorStoreParameters `json:"forProvider"`
}

// A FoundryVectorStoreStatus represents the observed state of a FoundryVectorStore.
type FoundryVectorStoreStatus struct {
	xpv1.ResourceStatus `json:",inline"`
	AtProvider          FoundryVectorStoreObservation `json:"atProvider,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="READY",type="string",JSONPath=".status.conditions[?(@.type=='Ready')].status"
// +kubebuilder:printcolumn:name="SYNCED",type="string",JSONPath=".status.conditions[?(@.type=='Synced')].status"
// +kubebuilder:printcolumn:name="STORE",type="string",JSONPath=".spec.forProvider.storeName"
// +kubebuilder:printcolumn:name="ID",type="string",JSONPath=".status.atProvider.id"
// +kubebuilder:resource:scope=Cluster,categories={crossplane,managed,foundry}

// A FoundryVectorStore is a vector store in an Azure AI Foundry project.
type FoundryVectorStore struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   FoundryVectorStoreSpec   `json:"spec"`
	Status FoundryVectorStoreStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// FoundryVectorStoreList contains a list of FoundryVectorStore.
type FoundryVectorStoreList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []FoundryVectorStore `json:"items"`
}

// FoundryVectorStore type metadata.
var (
	FoundryVectorStoreKind             = "FoundryVectorStore"
	FoundryVectorStoreGroupKind        = schema.GroupKind{Group: Group, Kind: FoundryVectorStoreKind}.String()
	FoundryVectorStoreGroupVersionKind = SchemeGroupVersion.WithKind(FoundryVectorStoreKind)
)

func init() {
	SchemeBuilder.Register(&FoundryVectorStore{}, &FoundryVectorStoreList{})
}
