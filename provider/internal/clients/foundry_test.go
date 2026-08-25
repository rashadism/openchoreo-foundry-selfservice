package clients

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/policy"
)

type staticCredential struct{}

func (staticCredential) GetToken(context.Context, policy.TokenRequestOptions) (azcore.AccessToken, error) {
	return azcore.AccessToken{Token: "test-token", ExpiresOn: time.Now().Add(time.Hour)}, nil
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestVectorStoreRequestsUseOpenAIV1Path(t *testing.T) {
	tests := []struct {
		name         string
		method       string
		expectedPath string
		responseBody string
		call         func(context.Context, *Client) error
	}{
		{
			name:         "create",
			method:       http.MethodPost,
			expectedPath: "/openai/v1/vector_stores",
			responseBody: `{"id":"vs_test"}`,
			call: func(ctx context.Context, client *Client) error {
				_, err := client.CreateVectorStore(ctx, "knowledge-base")
				return err
			},
		},
		{
			name:         "get",
			method:       http.MethodGet,
			expectedPath: "/openai/v1/vector_stores/vs_test",
			responseBody: `{"name":"knowledge-base"}`,
			call: func(ctx context.Context, client *Client) error {
				_, _, err := client.GetVectorStore(ctx, "vs_test")
				return err
			},
		},
		{
			name:         "delete",
			method:       http.MethodDelete,
			expectedPath: "/openai/v1/vector_stores/vs_test",
			responseBody: `{"deleted":true}`,
			call: func(ctx context.Context, client *Client) error {
				return client.DeleteVectorStore(ctx, "vs_test")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			httpClient := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
				if r.Method != tt.method {
					t.Errorf("method = %s, want %s", r.Method, tt.method)
				}
				if r.URL.Path != tt.expectedPath {
					t.Errorf("path = %s, want %s", r.URL.Path, tt.expectedPath)
				}
				if got := r.URL.RawQuery; got != "" {
					t.Errorf("query = %q, want none", got)
				}
				return &http.Response{
					StatusCode: http.StatusOK,
					Header:     http.Header{"Content-Type": []string{"application/json"}},
					Body:       io.NopCloser(strings.NewReader(tt.responseBody)),
					Request:    r,
				}, nil
			})}

			client := &Client{
				cred:     staticCredential{},
				http:     httpClient,
				endpoint: "https://example.test",
			}
			if err := tt.call(context.Background(), client); err != nil {
				t.Fatalf("request failed: %v", err)
			}
		})
	}
}
