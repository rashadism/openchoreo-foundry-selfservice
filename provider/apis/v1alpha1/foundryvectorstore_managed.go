package v1alpha1

import xpv1 "github.com/crossplane/crossplane-runtime/apis/common/v1"

// These methods make *FoundryVectorStore satisfy crossplane-runtime's
// resource.Managed interface (hand-written, mirroring FoundryAgent).

func (mg *FoundryVectorStore) GetCondition(ct xpv1.ConditionType) xpv1.Condition {
	return mg.Status.GetCondition(ct)
}
func (mg *FoundryVectorStore) GetDeletionPolicy() xpv1.DeletionPolicy { return mg.Spec.DeletionPolicy }
func (mg *FoundryVectorStore) GetManagementPolicies() xpv1.ManagementPolicies {
	return mg.Spec.ManagementPolicies
}
func (mg *FoundryVectorStore) GetProviderConfigReference() *xpv1.Reference {
	return mg.Spec.ProviderConfigReference
}
func (mg *FoundryVectorStore) GetPublishConnectionDetailsTo() *xpv1.PublishConnectionDetailsTo {
	return mg.Spec.PublishConnectionDetailsTo
}
func (mg *FoundryVectorStore) GetWriteConnectionSecretToReference() *xpv1.SecretReference {
	return mg.Spec.WriteConnectionSecretToReference
}

func (mg *FoundryVectorStore) SetConditions(c ...xpv1.Condition) { mg.Status.SetConditions(c...) }
func (mg *FoundryVectorStore) SetDeletionPolicy(p xpv1.DeletionPolicy) {
	mg.Spec.DeletionPolicy = p
}
func (mg *FoundryVectorStore) SetManagementPolicies(p xpv1.ManagementPolicies) {
	mg.Spec.ManagementPolicies = p
}
func (mg *FoundryVectorStore) SetProviderConfigReference(r *xpv1.Reference) {
	mg.Spec.ProviderConfigReference = r
}
func (mg *FoundryVectorStore) SetPublishConnectionDetailsTo(p *xpv1.PublishConnectionDetailsTo) {
	mg.Spec.PublishConnectionDetailsTo = p
}
func (mg *FoundryVectorStore) SetWriteConnectionSecretToReference(r *xpv1.SecretReference) {
	mg.Spec.WriteConnectionSecretToReference = r
}
