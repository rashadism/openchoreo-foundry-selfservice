// Package foundryvectorstore reconciles FoundryVectorStore managed resources
// against the Foundry vector-stores data-plane API.
package foundryvectorstore

import (
	"context"
	"errors"
	"fmt"
	"os"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	xpv1 "github.com/crossplane/crossplane-runtime/apis/common/v1"
	"github.com/crossplane/crossplane-runtime/pkg/event"
	"github.com/crossplane/crossplane-runtime/pkg/logging"
	"github.com/crossplane/crossplane-runtime/pkg/meta"
	"github.com/crossplane/crossplane-runtime/pkg/reconciler/managed"
	"github.com/crossplane/crossplane-runtime/pkg/resource"
	corev1 "k8s.io/api/core/v1"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"

	"github.com/rashadism/provider-foundry/apis/v1alpha1"
	"github.com/rashadism/provider-foundry/internal/clients"
)

// Setup wires the FoundryVectorStore controller into the manager.
func Setup(mgr ctrl.Manager, l logging.Logger) error {
	name := managed.ControllerName(v1alpha1.FoundryVectorStoreGroupKind)
	r := managed.NewReconciler(mgr,
		resource.ManagedKind(v1alpha1.FoundryVectorStoreGroupVersionKind),
		managed.WithExternalConnecter(&connector{kube: mgr.GetClient()}),
		managed.WithLogger(l.WithValues("controller", name)),
		managed.WithRecorder(event.NewAPIRecorder(mgr.GetEventRecorderFor(name))),
	)
	return ctrl.NewControllerManagedBy(mgr).
		Named(name).
		For(&v1alpha1.FoundryVectorStore{}).
		Complete(r)
}

type connector struct{ kube client.Client }

func (c *connector) Connect(ctx context.Context, mg resource.Managed) (managed.ExternalClient, error) {
	cr, ok := mg.(*v1alpha1.FoundryVectorStore)
	if !ok {
		return nil, errors.New("managed resource is not a FoundryVectorStore")
	}
	cred, err := azidentity.NewDefaultAzureCredential(nil)
	if err != nil {
		return nil, err
	}
	endpoint := cr.Spec.ForProvider.ProjectEndpoint
	if endpoint == "" {
		if endpoint, err = c.endpointFromConfig(ctx); err != nil {
			return nil, err
		}
	}
	return &external{foundry: clients.New(cred, endpoint)}, nil
}

// endpointFromConfig reads the project endpoint from the PE-provisioned ConfigMap.
func (c *connector) endpointFromConfig(ctx context.Context) (string, error) {
	ns := os.Getenv("FOUNDRY_CONFIG_NAMESPACE")
	if ns == "" {
		ns = "provider-foundry"
	}
	name := os.Getenv("FOUNDRY_CONFIG_NAME")
	if name == "" {
		name = "foundry-account"
	}
	var cm corev1.ConfigMap
	if err := c.kube.Get(ctx, client.ObjectKey{Namespace: ns, Name: name}, &cm); err != nil {
		return "", fmt.Errorf("resolve project endpoint from configmap %s/%s: %w", ns, name, err)
	}
	ep := cm.Data["projectEndpoint"]
	if ep == "" {
		return "", fmt.Errorf("configmap %s/%s has no non-empty projectEndpoint key", ns, name)
	}
	return ep, nil
}

type external struct{ foundry *clients.Client }

func (e *external) Observe(ctx context.Context, mg resource.Managed) (managed.ExternalObservation, error) {
	cr := mg.(*v1alpha1.FoundryVectorStore)
	id := meta.GetExternalName(cr)
	if id == "" || id == cr.GetName() {
		// Not created yet (external-name still defaults to the object name).
		return managed.ExternalObservation{ResourceExists: false}, nil
	}
	exists, _, err := e.foundry.GetVectorStore(ctx, id)
	if err != nil {
		return managed.ExternalObservation{}, err
	}
	if !exists {
		return managed.ExternalObservation{ResourceExists: false}, nil
	}
	cr.Status.AtProvider.Exists = true
	cr.Status.AtProvider.ID = id
	cr.SetConditions(xpv1.Available())
	// A vector store's name is fixed at creation, so once it exists it is up to date.
	return managed.ExternalObservation{ResourceExists: true, ResourceUpToDate: true}, nil
}

func (e *external) Create(ctx context.Context, mg resource.Managed) (managed.ExternalCreation, error) {
	cr := mg.(*v1alpha1.FoundryVectorStore)
	cr.SetConditions(xpv1.Creating())
	id, err := e.foundry.CreateVectorStore(ctx, cr.Spec.ForProvider.StoreName)
	if err != nil {
		return managed.ExternalCreation{}, err
	}
	// Record the generated id as the external name so Observe/Delete can find it.
	meta.SetExternalName(cr, id)
	cr.Status.AtProvider.ID = id
	return managed.ExternalCreation{}, nil
}

func (e *external) Update(ctx context.Context, mg resource.Managed) (managed.ExternalUpdate, error) {
	// Vector store name/identity is immutable; nothing to update.
	return managed.ExternalUpdate{}, nil
}

func (e *external) Delete(ctx context.Context, mg resource.Managed) (managed.ExternalDelete, error) {
	cr := mg.(*v1alpha1.FoundryVectorStore)
	cr.SetConditions(xpv1.Deleting())
	id := meta.GetExternalName(cr)
	if id == "" || id == cr.GetName() {
		return managed.ExternalDelete{}, nil
	}
	return managed.ExternalDelete{}, e.foundry.DeleteVectorStore(ctx, id)
}

func (e *external) Disconnect(ctx context.Context) error { return nil }
