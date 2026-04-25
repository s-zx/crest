// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package tools

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/s-zx/crest/pkg/aiusechat/uctypes"
	"github.com/s-zx/crest/pkg/util/utilfn"
	"golang.org/x/net/html"
)

const (
	WebFetchTimeout   = 15 * time.Second
	WebFetchMaxBytes  = 512 * 1024
	WebFetchMaxOutput = 100 * 1024
)

type webFetchInput struct {
	URL string `json:"url"`
}

func WebFetch(approval func(any) string) uctypes.ToolDefinition {
	return uctypes.ToolDefinition{
		Name:        "web_fetch",
		DisplayName: "Fetch Web Page",
		Description: "Fetch a URL and return the text content. Useful for reading documentation, checking APIs, or retrieving web page content. Returns extracted text (HTML tags stripped). Maximum 100KB of text returned.",
		ToolLogName: "agent:web_fetch",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"url": map[string]any{
					"type":        "string",
					"description": "The URL to fetch (must start with http:// or https://).",
				},
			},
			"required":             []string{"url"},
			"additionalProperties": false,
		},
		ToolCallDesc: func(input any, output any, _ *uctypes.UIMessageDataToolUse) string {
			parsed, err := parseWebFetchInput(input)
			if err != nil {
				return fmt.Sprintf("web_fetch (invalid: %v)", err)
			}
			if output != nil {
				return fmt.Sprintf("fetched %s", truncURL(parsed.URL))
			}
			return fmt.Sprintf("fetching %s", truncURL(parsed.URL))
		},
		ToolTextCallback: func(input any) (string, error) {
			parsed, err := parseWebFetchInput(input)
			if err != nil {
				return "", err
			}
			return fetchAndExtract(parsed.URL)
		},
		ToolApproval: approval,
	}
}

func parseWebFetchInput(input any) (*webFetchInput, error) {
	params := &webFetchInput{}
	if input == nil {
		return nil, fmt.Errorf("input is required")
	}
	if err := utilfn.ReUnmarshal(params, input); err != nil {
		return nil, fmt.Errorf("invalid input: %w", err)
	}
	params.URL = strings.TrimSpace(params.URL)
	if params.URL == "" {
		return nil, fmt.Errorf("url is required")
	}
	if !strings.HasPrefix(params.URL, "http://") && !strings.HasPrefix(params.URL, "https://") {
		return nil, fmt.Errorf("url must start with http:// or https://")
	}
	return params, nil
}

func fetchAndExtract(url string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), WebFetchTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", fmt.Errorf("invalid URL: %w", err)
	}
	req.Header.Set("User-Agent", "Crest/1.0 (coding agent)")
	req.Header.Set("Accept", "text/html, text/plain, application/json, */*")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetch failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d: %s", resp.StatusCode, resp.Status)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, WebFetchMaxBytes))
	if err != nil {
		return "", fmt.Errorf("read body failed: %w", err)
	}

	ct := resp.Header.Get("Content-Type")
	if strings.Contains(ct, "text/html") {
		text := extractText(string(body))
		return utilfn.TruncateString(text, WebFetchMaxOutput), nil
	}
	return utilfn.TruncateString(string(body), WebFetchMaxOutput), nil
}

func extractText(rawHTML string) string {
	tokenizer := html.NewTokenizer(strings.NewReader(rawHTML))
	var sb strings.Builder
	skip := false
	for {
		tt := tokenizer.Next()
		switch tt {
		case html.ErrorToken:
			return strings.TrimSpace(sb.String())
		case html.StartTagToken:
			tn, _ := tokenizer.TagName()
			tag := string(tn)
			if tag == "script" || tag == "style" || tag == "noscript" || tag == "svg" {
				skip = true
			}
			if tag == "br" || tag == "p" || tag == "div" || tag == "li" || tag == "h1" || tag == "h2" || tag == "h3" || tag == "h4" || tag == "h5" || tag == "h6" || tag == "tr" {
				sb.WriteByte('\n')
			}
		case html.EndTagToken:
			tn, _ := tokenizer.TagName()
			tag := string(tn)
			if tag == "script" || tag == "style" || tag == "noscript" || tag == "svg" {
				skip = false
			}
		case html.TextToken:
			if !skip {
				text := strings.TrimSpace(tokenizer.Token().Data)
				if text != "" {
					if sb.Len() > 0 {
						sb.WriteByte(' ')
					}
					sb.WriteString(text)
				}
			}
		}
	}
}

func truncURL(url string) string {
	if len(url) > 60 {
		return url[:57] + "..."
	}
	return url
}
