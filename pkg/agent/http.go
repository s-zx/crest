// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package agent

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/wavetermdev/waveterm/pkg/aiusechat"
	"github.com/wavetermdev/waveterm/pkg/aiusechat/uctypes"
	"github.com/wavetermdev/waveterm/pkg/waveobj"
	"github.com/wavetermdev/waveterm/pkg/web/sse"
	"github.com/wavetermdev/waveterm/pkg/wstore"
)

// PostAgentMessageRequest is the body shape for POST /api/post-agent-message.
// The frontend sends the user's message plus the terminal context it already
// has (cwd, connection, last command, recent commands). Mode prefix parsing
// happens client-side — this handler just reads the final mode.
type PostAgentMessageRequest struct {
	ChatID  string            `json:"chatid"`
	TabId   string            `json:"tabid"`
	BlockId string            `json:"blockid"`
	Mode    string            `json:"mode"`
	AIMode  string            `json:"aimode"`
	Msg     uctypes.AIMessage `json:"msg"`
	Context AgentContext      `json:"context,omitempty"`
}

type AgentContext struct {
	Cwd         string   `json:"cwd,omitempty"`
	Connection  string   `json:"connection,omitempty"`
	LastCommand string   `json:"last_command,omitempty"`
	RecentCmds  []string `json:"recent_cmds,omitempty"`
}

// PostAgentMessageHandler is the HTTP entrypoint for the native agent.
// Wired in pkg/web/web.go at /api/post-agent-message.
func PostAgentMessageHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req PostAgentMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
		return
	}
	if req.ChatID == "" {
		http.Error(w, "chatid is required in request body", http.StatusBadRequest)
		return
	}
	if _, err := uuid.Parse(req.ChatID); err != nil {
		http.Error(w, "chatid must be a valid UUID", http.StatusBadRequest)
		return
	}
	if req.AIMode == "" {
		http.Error(w, "aimode is required in request body", http.StatusBadRequest)
		return
	}

	mode, ok := LookupMode(req.Mode)
	if !ok {
		http.Error(w, fmt.Sprintf("unknown agent mode %q (valid: ask, plan, do)", req.Mode), http.StatusBadRequest)
		return
	}

	if err := req.Msg.Validate(); err != nil {
		http.Error(w, fmt.Sprintf("Message validation failed: %v", err), http.StatusBadRequest)
		return
	}

	rtInfo := &waveobj.ObjRTInfo{}
	if req.TabId != "" {
		oref := waveobj.MakeORef(waveobj.OType_Tab, req.TabId)
		if gotInfo := wstore.GetRTInfo(oref); gotInfo != nil {
			rtInfo = gotInfo
		}
	}

	aiOpts, err := aiusechat.GetWaveAISettings(*rtInfo, req.AIMode)
	if err != nil {
		http.Error(w, fmt.Sprintf("WaveAI configuration error: %v", err), http.StatusInternalServerError)
		return
	}

	sess := &Session{
		ChatID:      req.ChatID,
		TabID:       req.TabId,
		BlockID:     req.BlockId,
		Mode:        mode,
		Cwd:         req.Context.Cwd,
		Connection:  req.Context.Connection,
		LastCommand: req.Context.LastCommand,
		RecentCmds:  req.Context.RecentCmds,
	}

	sseHandler := sse.MakeSSEHandlerCh(w, r.Context())
	defer sseHandler.Close()

	err = RunAgent(r.Context(), sseHandler, wstore.GetClientId(), AgentOpts{
		Session: sess,
		UserMsg: &req.Msg,
		AIOpts:  *aiOpts,
	})
	if err != nil {
		log.Printf("agent: RunAgent error: %v\n", err)
		// SSE stream may already be closed by RunAgent via AiMsgError.
	}
}
